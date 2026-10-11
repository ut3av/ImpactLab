"""Local lexical retrieval (BM25) over page-accurate rule passages. No language model involved.

Query expansion uses a fixed English/Hindi glossary of building-regulation terms so that Hindi
questions and everyday words ("setback", "gap") reach the rulebook's vocabulary ("open space").
"""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

from app.rules.loader import Chunk, RuleStore, normalize_rule_id

TOKEN_RE = re.compile(r"[a-z0-9]+|[ऀ-ॿ]+")
STOPWORDS = set(
    """a an the of to in on for and or is are be by with as at from that this it its my i me we our you your
    do does did can could shall should will would may might must has have had what which who whom how when
    where why there their them they he she his her any all such other than then so not no if into up about
    under over per also only each every want much many long far get go""".split()
)

# Everyday / Hindi phrasing -> rulebook vocabulary. Values are space-separated query terms.
GLOSSARY: list[tuple[str, str]] = [
    (r"\bsetbacks?\b|\bmargin(al)?\b|\bgap\b|\bleave\b", "open space"),
    (r"\bfront\b", "front open space street"),
    (r"\brear\b|\bback\b", "rear open space"),
    (r"\bfees?\b|\bcharges?\b|\bcost\b", "fees permission fee chargeable"),
    (r"\btall\b|\bheight\b|\bhigh\b", "height"),
    (r"\brenew\w*|\bextend\w*|\bvalid\w*|\bexpir\w*", "revalidation validity duration sanction valid"),
    (r"\bdeadline\b|\bnot replied\b|\bno reply\b|\bmiss\w*|\bdelay\w*", "limitation period deemed sanctioned refusal"),
    (r"\bsign\w*\b|\bsubmit\w*\b", "signing preparation plans architect engineer licensed"),
    (r"\bdocuments?\b|\bpapers\b|\battach\w*", "information accompanying application documents"),
    (r"\bchange\b|\bmodif\w*|\bamend\w*", "deviation alteration sanctioned plan"),
    (r"\blifts?\b|\belevators?\b", "lifts lift escalator"),
    (r"\bdisagree\w*|\bconflict\w*|\bprevail\w*|\bprecedence\b", "precedence development plan provisions"),
    (r"\bbalcon\w*|\belectric\w*|\bpower line|\boverhead\b|\bvoltage\b", "electric lines distance voltage balcony verandah"),
    (r"\bfarm ?house\b", "farm house agricultural"),
    (r"\bfar\b|\bfloor area ratio\b", "far floor area ratio"),
    (r"\bparking\b", "parking"),
    (r"development permission|separate permission", "development permission authority jurisdiction granting planning area"),
    # Hindi
    (r"सामने|आगे", "front open space street"),
    (r"पीछे", "rear open space"),
    (r"बगल|किनारे", "side open space"),
    (r"खाली जगह|खुली जगह|जगह खाली|छोड़नी|छोड़ना|सेटबैक", "open space"),
    (r"फीस|शुल्क", "fees permission fee chargeable"),
    (r"सड़क|सडक|गली|मार्ग", "street road width"),
    (r"चौड़ी|चौड़ाई|चौडी", "width"),
    (r"प्लॉट|प्लाट|भूखंड|भूखण्ड", "plot"),
    (r"ऊंचाई|ऊँचाई|ऊंचा|ऊँचा|मंजिल", "height storeys"),
    (r"बिल्डिंग परमिशन|भवन अनुज्ञा|भवन निर्माण अनुमति|अनुज्ञा", "building permission"),
    (r"नियम", "rule"),
    (r"लिफ्ट", "lifts lift"),
    (r"बिजली|लाइन|बालकनी", "electric lines distance balcony"),
    (r"दस्तावेज|कागजात", "information accompanying application documents"),
    (r"वैध|नवीनीकरण", "revalidation validity duration"),
    (r"फार्म हाउस|फार्महाउस", "farm house agricultural"),
    (r"आवेदन", "application"),
]

UNIT_TOKENS = {"sq", "sqm", "mtr", "meter", "metre", "मीटर", "वर्ग", "tip", "kv"}

RULE_REF_RE =re.compile(r"(?:\brule|\br\.|नियम)\s*(\d{1,3}(?:\s*-\s*[A-Za-z]|[A-Za-z](?![a-z]))?)", re.I)


def stem(tok: str) -> str:
    if not tok.isascii() or tok.isdigit():
        return tok
    for suf, rep in (("ies", "y"), ("ings", ""), ("ing", ""), ("ions", "ion"), ("ed", ""), ("es", ""), ("s", "")):
        if tok.endswith(suf) and len(tok) - len(suf) >= 3:
            return tok[: -len(suf)] + rep
    return tok


def tokenize(text: str) -> list[str]:
    return [stem(t) for t in TOKEN_RE.findall(text.lower()) if t not in STOPWORDS and len(t) > 1]


def expand_query(q: str) -> list[str]:
    extra = [repl for pat, repl in GLOSSARY if re.search(pat, q, re.I)]
    return tokenize(q + " " + " ".join(extra))


@dataclass
class Hit:
    chunk: Chunk
    score: float


class Retriever:
    def __init__(self, store: RuleStore, k1: float = 1.4, b: float = 0.7):
        self.store = store
        self.k1, self.b = k1, b
        self.docs: list[Counter] = []
        self.lens: list[int] = []
        self.joined: list[str] = []
        df: Counter = Counter()
        for c in store.chunks:
            toks = tokenize(c.title + " " + c.title + " " + c.text)
            self.joined.append(" " + " ".join(tokenize(c.text)) + " ")
            cnt = Counter(toks)
            self.docs.append(cnt)
            self.lens.append(len(toks))
            df.update(cnt.keys())
        self.n = len(self.docs)
        self.avgdl = sum(self.lens) / max(self.n, 1)
        self.idf = {t: math.log(1 + (self.n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.vocab = set(df)

    def direct_rules(self, q: str) -> list[str]:
        out = []
        for m in RULE_REF_RE.finditer(q):
            rid = normalize_rule_id(m.group(1))
            if rid and (rid in self.store.records or self.store.find_embedded(rid)) and rid not in out:
                out.append(rid)
        return out

    def search(self, q: str, k: int = 8, extra_terms: list[str] | None = None, include_comments: bool = False) -> tuple[list[Hit], list[str]]:
        terms = expand_query(q)
        if extra_terms:
            terms += tokenize(" ".join(extra_terms))
        # Numbers and units are case inputs (extracted separately), not search terms; rule numbers use direct lookup.
        terms = [t for t in dict.fromkeys(terms) if not t.replace(".", "").isdigit() and t not in UNIT_TOKENS]
        # Adjacent word pairs from the question itself (e.g. "development permission") earn a phrase bonus.
        qtoks = tokenize(q)
        bigrams = {f"{a} {b}" for a, b in zip(qtoks, qtoks[1:]) if a != b}
        scores: list[tuple[float, int]] = []
        for i, doc in enumerate(self.docs):
            s = 0.0
            if bigrams:
                joined = self.joined[i]
                for bg in bigrams:
                    if f" {bg} " in joined:
                        s += 2.5
            dl = self.lens[i]
            for t in terms:
                f = doc.get(t)
                if not f:
                    continue
                s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
            if s > 0:
                c = self.store.chunks[i]
                if c.is_comment and not include_comments:
                    s *= 0.35
                scores.append((s, i))
        scores.sort(reverse=True)
        hits = [Hit(self.store.chunks[i], round(s, 3)) for s, i in scores[:k]]
        return hits, terms

    def known_terms(self, terms: list[str]) -> list[str]:
        return [t for t in terms if t in self.vocab]
