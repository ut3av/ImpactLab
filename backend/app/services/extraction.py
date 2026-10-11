"""Deterministic extraction of numeric inputs and intent from English/Hindi questions.

Only values that are explicitly stated with a unit are extracted. Nothing is inferred: plot
dimensions are never derived from plot area, and building use is set only when named.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
NUM = r"(\d+(?:\.\d+)?)"
AREA_UNIT = r"(?:sq\.?\s*m(?:t|tr|eters?|etres?)?\b|sqm\b|square\s*met(?:er|re)s?|m2\b|m²|वर्ग\s*मीटर|वर्गमीटर|वर्ग\s*मी\.?)"
LEN_UNIT = r"(?:m\b|mtrs?\b|meters?\b|metres?\b|मीटर|मी\.?(?=\s|$))"
HECTARE_UNIT = r"(?:hectares?|ha\b|हेक्टेयर)"

ROAD_WORDS = r"(?:street|road|lane|marg|सड़क|सडक|रोड|गली|मार्ग)"
HEIGHT_WORDS = r"(?:tall|high|height|ऊंचा|ऊँचा|ऊंचाई|ऊँचाई|ऊंची|ऊँची)"
BUILTUP_WORDS = r"(?:built[\s-]*up|construction area|covered area|floor area|निर्मित|निर्माण क्षेत्र)"
FRONTAGE_WORDS = r"(?:frontage|wide plot|plot width|front width)"

USE_PATTERNS = [
    ("shop_cum_residence", r"shop[\s-]*cum[\s-]*residen\w*|दुकान\s*सह\s*आवास"),
    ("cinema", r"\bcinema\b|\btheat(?:re|er)\b|सिनेमा"),
    ("industrial_admin", r"administrative block"),
    ("commercial", r"\bcommercial\b|\bshops?\b|\boffice\b|\bfactory\b|\bstore\s*house\b|वाणिज्यिक|दुकान|व्यावसायिक"),
    ("social_educational", r"\bschool\b|\bcharitable\b|\beducational\b|\bdharmshala\b|\bhospital\b"),
    ("residential", r"(?<!farm )\bhouse\b|\bhome\b|\bresiden\w*|\bdwelling\b|मकान|घर\b|आवास|आवासीय|रिहायशी"),
]
BTYPE_PATTERNS = [
    ("semi_detached", r"semi[\s-]*detached"),
    ("detached", r"(?<!semi-)(?<!semi )\bdetached\b|independent house"),
    ("row", r"\brow[\s-]*(?:type|house|housing)\b"),
]
VOLTAGE_PATTERNS = [
    ("extra_high", r"extra[\s-]*high[\s-]*voltage|\b(?:66|132|220|400)\s*kv\b"),
    ("high_upto_33kv", r"(?<!extra )(?<!extra-)\bhigh[\s-]*voltage\b|\b(?:11|22|33)\s*kv\b|हाई\s*वोल्टेज"),
    ("low_medium", r"\blow[\s-]*voltage\b|\bmedium[\s-]*voltage\b|\bservice line\b|\bLT line\b|लो\s*वोल्टेज"),
]

INTENTS = [
    ("electric_line_clearance", r"electric|overhead|power line|voltage|बिजली|\bkv\b"),
    ("building_permission_fee", r"\bfees?\b|फीस|शुल्क"),
    ("rear_open_space", r"\brear\b|पीछे"),
    ("side_open_space", r"\bside (?:open space|setback|margin|gap)|\bsides?\b.*\bopen space|बगल"),
    ("front_open_space", r"\bfront\b.*(?:open space|setback|space|gap|leave|margin)|(?:open space|setback|space|gap|margin).*\bfront\b|सामने|आगे.*(?:जगह|खाली)"),
]

OUT_OF_SCOPE = [
    (r"property\s*tax|house\s*tax|संपत्ति\s*कर|प्रॉपर्टी\s*टैक्स", "property tax"),
    (r"market\s*(?:rate|price|value)|land\s*(?:rate|price)|circle\s*rate|collector\s*rate|guideline\s*value|बाजार\s*(?:दर|भाव|मूल्य)|जमीन\s*का\s*(?:रेट|भाव)", "land prices or market rates"),
    (r"stamp\s*duty|registry\s*fee|रजिस्ट्री", "stamp duty / property registration"),
    (r"water\s*bill|electricity\s*bill|बिजली\s*बिल|पानी\s*का\s*बिल", "utility bills"),
    (r"mutation|namantaran|नामांतरण", "mutation of land records"),
]


@dataclass
class Extraction:
    language: str
    values: dict[str, float | int | str] = field(default_factory=dict)
    intents: list[str] = field(default_factory=list)
    out_of_scope_topic: str | None = None


def detect_language(text: str) -> str:
    deva = len(re.findall(r"[ऀ-ॿ]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    return "hi" if deva > 0 and deva >= latin * 0.3 else "en"


def _window(text: str, start: int, end: int, before: int = 22, after: int = 28) -> tuple[str, str]:
    return text[max(0, start - before):start], text[end:end + after]


def extract(question: str) -> Extraction:
    q = question.translate(DEVANAGARI_DIGITS)
    ql = q.lower()
    ex = Extraction(language=detect_language(question))

    for pat, topic in OUT_OF_SCOPE:
        if re.search(pat, ql, re.I):
            ex.out_of_scope_topic = topic
            break

    # Areas (sq m and hectares).
    for m in re.finditer(NUM + r"\s*" + AREA_UNIT, ql, re.I):
        val = float(m.group(1))
        before, after = _window(ql, m.start(), m.end())
        if re.search(BUILTUP_WORDS, before + " " + after, re.I):
            ex.values.setdefault("built_up_area_sqm", val)
        else:
            ex.values.setdefault("plot_area_sqm", val)
    for m in re.finditer(NUM + r"\s*" + HECTARE_UNIT, ql, re.I):
        ex.values.setdefault("plot_area_sqm", round(float(m.group(1)) * 10000, 4))

    # Lengths: classify by nearby words; prefer the words immediately after the number.
    area_spans = [m.span() for m in re.finditer(NUM + r"\s*" + AREA_UNIT, ql, re.I)]
    for m in re.finditer(NUM + r"\s*" + LEN_UNIT, ql, re.I):
        if any(a <= m.start() < b for a, b in area_spans):
            continue
        val = float(m.group(1))
        before, after = _window(ql, m.start(), m.end())
        if re.search(ROAD_WORDS, after, re.I) or (re.search(ROAD_WORDS, before, re.I) and not re.search(HEIGHT_WORDS, after, re.I)):
            ex.values.setdefault("road_width_m", val)
        elif re.search(HEIGHT_WORDS, after + " " + before, re.I):
            ex.values.setdefault("building_height_m", val)
        elif re.search(FRONTAGE_WORDS, after + " " + before, re.I):
            ex.values.setdefault("plot_width_m", val)

    m = re.search(r"(\d{1,3})\s*(?:storey|storeys|stories|story|floors?|मंजिल|मंज़िल)", ql)
    if m:
        ex.values["storeys"] = int(m.group(1))
    m = re.search(r"(\d{2,6})\s*(?:seats|seating)", ql)
    if m:
        ex.values["seating_capacity"] = int(m.group(1))

    for use, pat in USE_PATTERNS:
        if re.search(pat, ql, re.I):
            ex.values["building_use"] = use
            break
    for bt, pat in BTYPE_PATTERNS:
        if re.search(pat, ql, re.I):
            ex.values["building_type"] = bt
            break
    for vc, pat in VOLTAGE_PATTERNS:
        if re.search(pat, ql, re.I):
            ex.values["voltage_class"] = vc
            break

    for intent, pat in INTENTS:
        if re.search(pat, ql, re.I):
            ex.intents.append(intent)
    # Lift/height questions are not setback questions even if they mention "front".
    if "electric_line_clearance" in ex.intents:
        ex.intents = ["electric_line_clearance"]
    return ex
