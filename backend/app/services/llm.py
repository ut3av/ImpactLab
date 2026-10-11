"""Optional Cerebras inference. Every function returns None on any failure; callers fall back.

The model never supplies legal values: it only rephrases retrieved text and deterministic
results. Its output is parsed as JSON, schema-validated, and rejected if it cites passages that
were not supplied or states numbers that do not appear in the supplied evidence.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from typing import Any

from pydantic import BaseModel, Field, ValidationError, ValidationInfo, field_validator

from app.config import Settings
from app.models.schemas import SECTION_ORDER
from app.rules.loader import normalize_rule_id

log = logging.getLogger("mira.llm")


class ExplainOut(BaseModel):
    answer: str = Field(min_length=1, max_length=1500)
    citations: list[str] = Field(default_factory=list, max_length=10)


class TermsOut(BaseModel):
    terms: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("terms")
    @classmethod
    def _clean(cls, v: list[str]) -> list[str]:
        return [t.strip()[:40] for t in v if isinstance(t, str) and t.strip() and t.isascii()]


# ---------------------------------------------------------------------- /api/explain output
_EMPHASIS = re.compile(r"\*\*|__|`")
_BULLET = re.compile(r"^\s*[-*" + chr(0x2022) + chr(0xB7) + r"]+\s+")  # -, *, bullet, middle dot
_EVIDENCE_TAG = re.compile(r"\s*[\[(]\s*E\d{1,2}(?:\s*[,;/]\s*E\d{1,2})*\s*[\])]")
_ABSENT = {"", "null", "none", "n/a", "na", "-"}


def clean_text(v: Any) -> Any:
    """Normalise one model text field: plain prose, no markdown emphasis, bullets or inline evidence tags."""
    if v is None:
        return None
    if isinstance(v, list) and all(isinstance(x, str) for x in v):
        v = " ".join(v)
    if not isinstance(v, str):
        return v  # let the schema reject it
    t = " ".join(_BULLET.sub("", ln) for ln in v.splitlines())
    t = re.sub(r"\s+", " ", _EVIDENCE_TAG.sub("", _EMPHASIS.sub("", t))).strip()
    return None if t.lower() in _ABSENT else t


class ExplainSectionsOut(BaseModel):
    summary: str = Field(min_length=1, max_length=450)
    meaning: str | None = None
    why_it_applies: str | None = None
    evidence: str | None = None
    calculation: str | None = None
    building_impact: str | None = None
    uncertainty: str | None = None
    next_step: str | None = None
    citations: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("summary", *SECTION_ORDER, mode="before")
    @classmethod
    def _clean(cls, v: Any) -> Any:
        return clean_text(v)

    @field_validator(*SECTION_ORDER)
    @classmethod
    def _cap(cls, v: str | None, info: ValidationInfo) -> str | None:
        if v is not None and len(v) > (info.context or {}).get("max_section", 1100):
            raise ValueError("section too long")
        return v

    @field_validator("citations", mode="before")
    @classmethod
    def _ids(cls, v: Any) -> Any:
        if v is None:
            return []
        if isinstance(v, str):
            v = [v]
        return [x.strip() if isinstance(x, str) else x for x in v] if isinstance(v, list) else v

    def texts(self) -> list[str]:
        return [self.summary] + [t for k in SECTION_ORDER if (t := getattr(self, k))]


class LLMClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: Any = None
        self._client_lock = threading.Lock()
        self.last_error: str | None = None  # answer path only; explain gets reasons returned, not shared

    @property
    def available(self) -> bool:
        return self.settings.ai_configured

    @property
    def model(self) -> str:
        return self.settings.cerebras_model

    def _get(self):
        if self._client is None:
            with self._client_lock:
                if self._client is None:
                    from cerebras.cloud.sdk import Cerebras

                    self._client = Cerebras(
                        api_key=self.settings.cerebras_api_key.get_secret_value(),
                        timeout=self.settings.cerebras_timeout_s,
                        max_retries=1,
                    )
        return self._client

    def _chat_json_result(self, system: str, user: str, max_tokens: int = 900) -> tuple[dict | None, str | None]:
        """One chat call. Returns (json object, None) or (None, ExplainFallbackReason); no shared state."""
        if not self.available:
            return None, "not_configured"
        try:
            resp = self._get().chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                max_completion_tokens=max_tokens,
                temperature=0.1,
            )
        except Exception as exc:  # network, auth, rate limit, timeout, SDK errors
            reason = classify_error(exc)
            log.warning("Cerebras request failed: %s (%s)", type(exc).__name__, reason)
            return None, reason
        try:
            content = resp.choices[0].message.content or ""
        except (AttributeError, IndexError, TypeError):
            return None, "invalid_response"
        m = re.search(r"\{.*\}", content, re.S)
        if not m:
            return None, "invalid_response"
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None, "invalid_response"
        return (data, None) if isinstance(data, dict) else (None, "invalid_response")

    def _chat_json(self, system: str, user: str, max_tokens: int = 900) -> dict | None:
        if not self.available:
            return None
        data, reason = self._chat_json_result(system, user, max_tokens)
        if reason:
            self.last_error = reason
        return data

    def search_terms(self, question: str) -> list[str] | None:
        data = self._chat_json(
            "You convert a question about the Madhya Pradesh Bhumi Vikas Rules 2012 (building regulations) into "
            "English search keywords used in that rulebook. Reply only with JSON: {\"terms\": [\"...\"]}. "
            "Maximum 8 short terms. Do not answer the question.",
            question,
            max_tokens=300,
        )
        if data is None:
            return None
        try:
            return TermsOut.model_validate(data).terms
        except ValidationError:
            self.last_error = "schema"
            return None

    def explain(self, question: str, language: str, evidence: list[dict], facts: list[str]) -> ExplainOut | None:
        lang_name = "Hindi (Devanagari script)" if language == "hi" else "English"
        system = (
            "You are MIRA (Municipal Intelligence for Rules & Architecture), assisting a municipal building-permission clerk in Bhopal. Write a short answer "
            f"(at most 4 sentences) in {lang_name}. Use ONLY the evidence passages and computed facts given. "
            "Do not add any rule, number, fee, distance or condition that is not in them. If the evidence does not "
            "answer the question, say that it is not found in the supplied rules. Mention rule numbers. Never say "
            "a plan is approved or compliant. Reply only with JSON: {\"answer\": \"...\", \"citations\": [\"<evidence id>\"]}."
        )
        user = json.dumps(
            {"question": question, "computed_facts": facts, "evidence": evidence}, ensure_ascii=False
        )
        data = self._chat_json(system, user)
        if data is None:
            return None
        try:
            out = ExplainOut.model_validate(data)
        except ValidationError:
            self.last_error = "schema"
            return None
        allowed_ids = {e["id"] for e in evidence}
        if any(c not in allowed_ids for c in out.citations):
            self.last_error = "unknown_citation"
            return None
        allowed_text = question + " " + " ".join(facts) + " " + " ".join(e["text"] + " " + e["rule"] for e in evidence)
        if not numbers_supported(out.answer, allowed_text):
            self.last_error = "unsupported_number"
            return None
        return out

    def explain_sections(self, payload: dict, language: str, detail: str, evidence_ids: list[str],
                         allowed_text: str, allowed_rules: set[str]) -> tuple[ExplainSectionsOut | None, str | None]:
        """Sectioned explanation of a trusted context. Returns (output, None) or (None, ExplainFallbackReason)."""
        if not self.available:
            return None, "not_configured"
        brief = detail == "brief"
        data, reason = self._chat_json_result(explain_system_prompt(language, detail),
                                              json.dumps(payload, ensure_ascii=False), max_tokens=1600 if brief else 2400)
        if data is None:
            return None, reason or "unavailable"
        try:
            out = ExplainSectionsOut.model_validate(data, context={"max_section": 600 if brief else 1100})
        except ValidationError:
            return None, "invalid_response"
        if not out.summary.strip() or sum(len(t) for t in out.texts()) < 20:
            return None, "invalid_response"
        problem = grounding_problem(data, out, language, evidence_ids, allowed_text, allowed_rules)
        if problem:
            log.info("Explanation rejected by validation: %s", problem)
            return None, "rejected"
        return out, None


_DEV = str.maketrans("०१२३४५६७८९", "0123456789")


def _numbers(text: str) -> set[str]:
    nums = set()
    for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text.translate(_DEV)):
        n = n.replace(",", "").rstrip(".")
        if "." in n:
            n = n.rstrip("0").rstrip(".")
        nums.add(n)
    return nums


def numbers_supported(answer: str, evidence_text: str) -> bool:
    return _numbers(answer) <= _numbers(evidence_text)


def classify_error(exc: BaseException) -> str:
    """Map an SDK/transport exception to an ExplainFallbackReason without importing the SDK."""
    names = {c.__name__ for c in type(exc).__mro__}
    status = getattr(exc, "status_code", None)
    if not isinstance(status, int):
        status = getattr(getattr(exc, "response", None), "status_code", None)
    if isinstance(exc, TimeoutError) or any("Timeout" in n for n in names):
        return "timeout"
    if "RateLimitError" in names or status == 429:
        return "rate_limited"
    if "APIConnectionError" in names or isinstance(exc, ConnectionError):
        return "network"
    if names & {"AuthenticationError", "PermissionDeniedError"} or status in (401, 403):
        return "auth"
    if "NotFoundError" in names or status == 404 or ("BadRequestError" in names and "model" in str(exc).lower()):
        return "model_unavailable"
    return "unavailable"


# Rule references: "Rule 56(1)(a)", "Rules 56 and 57", "R56", "नियम 21(3)(b)". Only the top-level id is compared.
_RULE_HEAD = re.compile(r"(?:\b(?:rules?|r)(?=[\s.\d])\.?|नियमों|नियम)\s*(?:no\.?\s*)?(?=\d)", re.I)
_RULE_ID = re.compile(r"(\d{1,3})(?:\s*-\s*([A-Za-z])(?![A-Za-z])|([A-Za-z])(?![A-Za-z]))?(?:\s*\([0-9A-Za-z]{1,6}\))*")
_RULE_JOIN = re.compile(r"\s*(?:,|&|\band\b|\bor\b|और|तथा|या)\s*(?:(?:rules?|नियम)\s*)?(?=\d)", re.I)
_NOT_A_RULE = re.compile(r"\.\d|\s*(?:m\b|sq|meters?|metres?|मीटर|वर्ग|%|kv)", re.I)


def rule_refs(text: str) -> set[str]:
    out: set[str] = set()
    t = text.translate(_DEV)
    for head in _RULE_HEAD.finditer(t):
        pos, first = head.end(), True
        while True:
            m = _RULE_ID.match(t, pos)
            if not m or (not first and _NOT_A_RULE.match(t, m.end())):
                break
            letter = m.group(2) or m.group(3)
            rid = normalize_rule_id(m.group(1) + (f"-{letter}" if letter else ""))
            if rid:
                out.add(rid)
            j = _RULE_JOIN.match(t, m.end())
            if not j:
                break
            pos, first = j.end(), False
    return out


_MARKUP = re.compile(r"<[A-Za-z/!]|javascript:|```", re.I)
_HEDGE = re.compile(r"\b(?:not|never|no|whether|cannot)\b|n't|नहीं|क्या", re.I)
# Affirmative claims that a hedge earlier in the same clause neutralises ("does not mean the plan is approved").
_CLAIMS_HEDGEABLE = [
    re.compile(r"\b(?:is|are|will be|would be|becomes?)\s+(?:fully\s+|therefore\s+|now\s+)?(?:compliant|approved)\b", re.I),
    re.compile(r"(?:अनुमोदित|स्वीकृत|मंजूर|मंज़ूर)\s+(?:है|हो\s+जाएगा|हो\s+जाएगी|हो\s+गया|हो\s+गई)"),
]
_CLAIMS = [
    re.compile(r"(?<!not )(?<!n't )(?<!must )(?<!to )(?<!should )(?<!shall )\bcompl(?:y|ies)\s+with\b", re.I),
    re.compile(r"\b(?:your|this|the proposed)\s+(?:building|plan|design|house|project)\s+(?:is|will be)\s+(?:legal|permitted|allowed)\b", re.I),
]


def approval_claim(text: str) -> bool:
    """True for an affirmative approval/compliance statement ("the plan is approved", "complies with")."""
    if any(p.search(text) for p in _CLAIMS):
        return True
    for p in _CLAIMS_HEDGEABLE:
        for m in p.finditer(text):
            clause = re.split(r"[.!?;:।]", text[max(0, m.start() - 80):m.start()])[-1]
            if not _HEDGE.search(clause):
                return True
    return False


def grounding_problem(raw: dict, out: ExplainSectionsOut, language: str, evidence_ids: list[str],
                      allowed_text: str, allowed_rules: set[str]) -> str | None:
    """Internal reason code (for logs) if the output is not grounded in the supplied context, else None."""
    flat = [x for k in ("summary", *SECTION_ORDER, "citations")
            for x in (raw.get(k) if isinstance(raw.get(k), list) else [raw.get(k)]) if isinstance(x, str)]
    if any(_MARKUP.search(x) for x in flat):
        return "markup"
    if not set(out.citations) <= set(evidence_ids):
        return "unknown_citation"
    text = " ".join(out.texts())
    if not numbers_supported(text, allowed_text):
        return "unsupported_number"
    if not rule_refs(text) <= allowed_rules:
        return "unknown_rule"
    if approval_claim(text):
        return "approval_claim"
    deva = len(re.findall(r"[ऀ-ॿ]", out.summary))
    latin = len(re.findall(r"[A-Za-z]", out.summary))
    if (language == "hi" and deva == 0) or (language == "en" and deva > latin):
        return "wrong_language"
    return None


def explain_system_prompt(language: str, detail: str) -> str:
    lang = ('simple Hindi in Devanagari script for a municipal clerk; keep rule references like "नियम 56(1)(a)", '
            "digits and units as given") if language == "hi" else "plain English"
    size = ("brief: the summary is at most 2 sentences; fill at most 3 of the most relevant sections, each at most "
            "2 sentences, and set the others to null") if detail == "brief" else \
        "detailed: fill every relevant section, each at most 4 sentences; set sections that do not apply to null"
    return (
        "You are MIRA's explainer for a municipal building-permission clerk at the Bhopal Municipal Corporation. "
        "Explain like a knowledgeable, patient expert talking to a colleague: direct, no greetings, no chatbot filler.\n"
        "Rules:\n"
        "1. Use ONLY the supplied JSON context. Never add a rule number, quotation, fee, distance, dimension, date or "
        "condition that is not in it.\n"
        "2. Write numbers as digits exactly as given. Do not compute new numbers.\n"
        "3. Do not change or upgrade any status; explain what the given status means (see status_meanings).\n"
        "4. Never say a building or plan is approved, compliant, legal or permitted. For a single check say "
        "\"meets this minimum\" or \"is below this minimum\".\n"
        "5. If the evidence does not establish an answer, say so. If inputs are missing, say exactly which.\n"
        "6. If a version warning is present you MUST say that the rulebook is consolidated only up to 6 March 2025 and "
        "that the 28 August 2026 amendment to Rule 2(5)(c) is not verified, and advise checking the official notification.\n"
        "7. Do not state the purpose of a rule unless the evidence states it.\n"
        "8. Never present a translation or paraphrase as the official text; refer to \"the quoted rule text\".\n"
        f"9. Language: {lang}.\n"
        f"10. Length: {size}.\n"
        "Sections: meaning (what the rule or result means), why_it_applies (why it applies to this case), evidence "
        "(which quoted passages support it, by rule and PDF page), calculation (how the value was obtained, from the "
        "given steps), building_impact (only if zones or a proposed building are given), uncertainty (missing inputs, "
        "conditions, warnings, limits), next_step (what the clerk should do next).\n"
        "Reply only with JSON: {\"summary\": \"...\", \"meaning\": null, \"why_it_applies\": null, \"evidence\": null, "
        "\"calculation\": null, \"building_impact\": null, \"uncertainty\": null, \"next_step\": null, "
        "\"citations\": [\"E1\"]} where citations lists the evidence ids you relied on. No markdown."
    )
