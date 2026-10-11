"""POST /api/explain: explain one evaluated result, calculation, constraint or drawn element.

The client sends identifiers only. Every value, status, warning and quoted passage is rebuilt here
from the loaded rule data and the deterministic calculations. The model (optional) sees only the
minimum context for the selected target and its output is validated before use. A deterministic
bilingual "basic" explanation built from the same trusted context is returned whenever AI is off,
unavailable, rate limited or rejected, and always when the supplied rules do not answer the question.
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from app import calculations
from app.calculations.common import SourceUnavailable, cite, fmt_m
from app.models.schemas import (
    FOCUS_SIDES,
    SECTION_ORDER,
    CalcResult,
    Citation,
    ExplainRequest,
    ExplainResponse,
    ExplainSection,
    ExplainTarget,
    GeometryZone,
    MissingInput,
    ProjectInputs,
    Status,
    Warning,
)
from app.rules.loader import RuleStore, normalize_rule_id
from app.rules.verified_tables import SOURCES
from app.rules.version_warnings import HINDI_PREVAILS, warnings_for
from app.services.answer import (
    HI_CONDITIONS,
    HI_FIELDS,
    HI_LABELS,
    HI_RESULT_WORDS,
    MIN_SCORE,
    NOT_FOUND_EN,
    NOT_FOUND_HI,
    STATUS_PRIORITY,
    AnswerService,
    derive_statuses,
    rule_label,
)
from app.services.extraction import DEVANAGARI_DIGITS, extract
from app.services.llm import ExplainSectionsOut, LLMClient, rule_refs
from app.services.ratelimit import SlidingWindowLimiter
from app.services.retrieval import Retriever

log = logging.getLogger("mira.explain")

PASSAGE_CHARS, ELEMENT_PASSAGE_CHARS = 1200, 600
ARROW, TIMES = chr(0x2192), chr(0xD7)  # glyphs used in engine step text
COMPUTED = (Status.VERIFIED, Status.CALCULATION_COMPLETED)
# An element selected with nothing else evaluated is explained against the calculations the 3D scene draws for it.
ELEMENT_DEFAULT_CALC = {"building": "site_open_spaces", "plot": "site_open_spaces", "road": "front_open_space"}
BUILDING_FIELDS = ("building_width_m", "building_depth_m", "building_height_m", "front_gap_m", "left_gap_m",
                   "plot_width_m", "plot_depth_m")
PLOT_FIELDS = ("plot_width_m", "plot_depth_m", "plot_area_sqm")

CALC_LABELS = {
    "front_open_space": "Minimum front open space",
    "rear_open_space": "Minimum rear open space",
    "side_open_space": "Minimum side open space",
    "building_permission_fee": "Building permission fee",
    "electric_line_clearance": "Minimum distance from overhead electric line",
    "site_open_spaces": "Site open spaces (front, rear and sides)",
}
HI_SITE_LABEL = "प्लॉट की खुली जगहें (सामने, पीछे और बगल)"
HI_SIDE = {"front": "सामने की", "rear": "पीछे की", "left": "बाईं ओर की", "right": "दाईं ओर की"}
EN_INPUT = {
    "plot_width_m": "plot frontage", "plot_depth_m": "plot depth", "plot_area_sqm": "plot area",
    "road_width_m": "street width", "building_height_m": "building height", "storeys": "storeys",
    "building_use": "building use", "building_type": "building type", "built_up_area_sqm": "built-up area",
    "seating_capacity": "seating capacity", "voltage_class": "line type", "building_width_m": "building width",
    "building_depth_m": "building depth", "front_gap_m": "front gap", "left_gap_m": "left gap",
}
HI_INPUT = {
    "plot_width_m": "प्लॉट की सामने की चौड़ाई", "plot_depth_m": "प्लॉट की गहराई", "plot_area_sqm": "प्लॉट का क्षेत्रफल",
    "road_width_m": "सामने की सड़क की चौड़ाई", "building_height_m": "भवन की ऊंचाई", "storeys": "मंजिलें",
    "building_use": "भवन का उपयोग", "building_type": "भवन का प्रकार", "built_up_area_sqm": "निर्मित क्षेत्र",
    "seating_capacity": "बैठने की क्षमता", "voltage_class": "लाइन का प्रकार", "building_width_m": "भवन की चौड़ाई",
    "building_depth_m": "भवन की गहराई", "front_gap_m": "सामने छोड़ी गई दूरी", "left_gap_m": "बाईं ओर छोड़ी गई दूरी",
}
EN_VALUES = {
    "shop_cum_residence": "shop-cum-residence", "industrial_admin": "administrative block in a factory",
    "social_educational": "social, charitable or educational", "semi_detached": "semi-detached", "row": "row-type",
    "low_medium": "low or medium voltage line or service line",
    "high_upto_33kv": "high voltage line up to and including 33000 volts",
    "extra_high": "extra high voltage line beyond 33000 volts",
}
HI_VALUES = {
    "residential": "आवासीय", "commercial": "वाणिज्यिक", "shop_cum_residence": "दुकान सह आवास",
    "industrial_admin": "कारखाने का प्रशासनिक ब्लॉक", "social_educational": "सामाजिक, धर्मार्थ या शैक्षणिक",
    "cinema": "सिनेमा", "detached": "पृथक", "semi_detached": "अर्ध-पृथक", "row": "पंक्ति प्रकार",
    "low_medium": "लो या मीडियम वोल्टेज लाइन या सर्विस लाइन", "high_upto_33kv": "33000 वोल्ट तक की हाई वोल्टेज लाइन",
    "extra_high": "33000 वोल्ट से अधिक की एक्स्ट्रा हाई वोल्टेज लाइन",
}
HI_TOPICS = {
    "property tax": "संपत्ति कर", "land prices or market rates": "जमीन की कीमतें या बाजार दर",
    "stamp duty / property registration": "स्टांप शुल्क या संपत्ति रजिस्ट्री", "utility bills": "बिजली या पानी के बिल",
    "mutation of land records": "भूमि अभिलेखों का नामांतरण",
}
STATUS_EN = {
    Status.VERIFIED: "verified from the quoted table with every input it needs",
    Status.CALCULATION_COMPLETED: "calculated from the quoted table, but not every condition of the row could be checked",
}
STATUS_HI = {
    Status.VERIFIED: "उद्धृत तालिका से, सभी आवश्यक इनपुट के साथ सत्यापित",
    Status.CALCULATION_COMPLETED: "उद्धृत तालिका से गणना की गई, पर पंक्ति की हर शर्त जांची नहीं जा सकी",
}
STATUS_MEANINGS = {
    "VERIFIED": "Computed by MIRA's deterministic engine from a PDF-verified table with every input the table needs.",
    "CALCULATION_COMPLETED": "Computed from a PDF-verified table, but not every condition of the selected table row could be checked.",
    "SOURCE_FOUND": "MIRA found the relevant rule text but did not apply it to calculate a result.",
    "MORE_INFORMATION_NEEDED": "A required input is missing, so no final value is given.",
    "NOT_FOUND": "The supplied rules do not answer this.",
    "VERSION_REVIEW_NEEDED": "A known amendment made after the rulebook's consolidation date may affect this; MIRA has not verified it.",
    "ILLUSTRATIVE_ONLY": "Drawn from the clerk's inputs for illustration; it is not a rule result.",
}
MEANINGS = {
    "front_open_space": (
        "Rule 56(1)(a) sets the minimum front open space for a residential building up to 12.5 m high, based on the "
        "width of the street facing the plot.",
        "नियम 56(1)(a) 12.5 मीटर तक ऊंचे आवासीय भवन के लिए न्यूनतम सामने की खुली जगह तय करता है; यह प्लॉट के सामने "
        "वाली सड़क की चौड़ाई पर निर्भर है।"),
    "rear_open_space": (
        "Rule 56(2)(a) sets the minimum rear open space for a residential building up to 12.5 m high, based on the plot area.",
        "नियम 56(2)(a) 12.5 मीटर तक ऊंचे आवासीय भवन के लिए न्यूनतम पीछे की खुली जगह तय करता है; यह प्लॉट के "
        "क्षेत्रफल पर निर्भर है।"),
    "side_open_space": (
        "Rule 56(3) sets the minimum side open spaces for a residential building according to whether it is detached, "
        "semi-detached or row-type.",
        "नियम 56(3) आवासीय भवन के लिए न्यूनतम बगल की खुली जगह इस आधार पर तय करता है कि भवन पृथक, अर्ध-पृथक या "
        "पंक्ति प्रकार का है।"),
    "building_permission_fee": (
        "Rule 21(3)(b) sets the building permission fee by built-up area slab for buildings other than high rise "
        "buildings, and Rule 21(3)(c) sets it for high rise buildings. The application fee under Rule 21(2)(ii) is "
        "Rs. 1.00 per sq m of the proposed built-up area.",
        "नियम 21(3)(b) हाई राइज के अलावा अन्य भवनों का भवन अनुज्ञा शुल्क निर्मित क्षेत्र के स्लैब के अनुसार तय करता "
        "है, और नियम 21(3)(c) हाई राइज भवनों का। नियम 21(2)(ii) के अंतर्गत आवेदन शुल्क प्रस्तावित निर्मित क्षेत्र के "
        "प्रति वर्ग मीटर रु. 1.00 है।"),
    "electric_line_clearance": (
        "Rule 52(1) sets the minimum vertical and horizontal distance between a building and an overhead electric "
        "line, depending on the line voltage.",
        "नियम 52(1) भवन और ओवरहेड बिजली लाइन के बीच न्यूनतम ऊर्ध्वाधर और क्षैतिज दूरी तय करता है; यह लाइन के "
        "वोल्टेज पर निर्भर है।"),
}
RULE42_MEANING = (
    "For buildings above 12.5 m, Rule 56(5) refers to Rule 42 Table 4 or 5, where the row is chosen by building height.",
    "12.5 मीटर से ऊंचे भवनों के लिए नियम 56(5) नियम 42 की तालिका 4 या 5 का संदर्भ देता है, जिसमें पंक्ति भवन की "
    "ऊंचाई से चुनी जाती है।")
STEPS_DISCLOSURE_HI = "गणना के चरण अंग्रेज़ी में दिखाए गए हैं, जैसे गणना इंजन ने बनाए हैं।"
HINDI_DISCLOSURE = "यह हिन्दी व्याख्या है; उद्धृत नियम पाठ मूल अंग्रेज़ी में है और अनूदित नहीं है।"
VERSION_SENTENCE = (
    "The supplied rulebook is consolidated only up to 6 March 2025. The 28 August 2026 amendment to Rule 2(5)(c), for "
    "plots up to 500 sq m, is not included in it and has not been verified by MIRA.",
    "दिया गया नियम-संग्रह केवल 6 मार्च 2025 तक समेकित है। 500 वर्ग मीटर तक के प्लॉट से जुड़े नियम 2(5)(c) में 28 "
    "अगस्त 2026 को हुआ संशोधन इसमें शामिल नहीं है और MIRA ने उसका सत्यापन नहीं किया है।")
VERSION_NEXT = (
    "Check the official notification of the 28 August 2026 amendment before relying on this for plots up to 500 sq m.",
    "500 वर्ग मीटर तक के प्लॉट के लिए इस पर भरोसा करने से पहले 28 अगस्त 2026 के संशोधन की आधिकारिक अधिसूचना देखें।")
HINDI_PREVAILS_HI = (
    "उद्धरण अंग्रेज़ी समेकित प्रति से हैं। नियम 4 (PDF पृष्ठ 15) के नीचे छपी न्यायालय टिप्पणी के अनुसार अंग्रेज़ी "
    "संस्करण अनुवाद है और हिन्दी संस्करण मान्य होता है; यहां दी गई हिन्दी व्याख्या आधिकारिक हिन्दी PDF का उद्धरण नहीं है।")
DISCLOSURE_AI = (
    "Written by AI from MIRA's server results and the quoted rule text; check it against the quoted rule text.",
    "यह व्याख्या AI ने MIRA के सर्वर परिणामों और उद्धृत नियम पाठ से लिखी है; इसे उद्धृत नियम पाठ से मिलाकर देखें।")
DISCLOSURE_BASIC = (
    "Basic explanation assembled by MIRA from its own results; no AI was used.",
    "यह सामान्य व्याख्या MIRA ने अपने परिणामों से बनाई है; इसमें AI का उपयोग नहीं हुआ।")

# Engine text (missing-input reasons and notes) in Hindi; anything not listed stays in English rather than be guessed.
HI_REASONS = {
    "The front open space depends on the width of the street facing the plot.":
        "सामने की खुली जगह प्लॉट के सामने वाली सड़क की चौड़ाई पर निर्भर है।",
    "Rule 56(1) table applies only to residential buildings up to 12.5 m; above that, Rule 42 applies.":
        "नियम 56(1) की तालिका केवल 12.5 मीटर तक के आवासीय भवनों पर लागू है; इससे ऊंचे भवनों पर नियम 42 लागू होता है।",
    "Rule 56 applies to residential buildings; other occupancies are covered by Rule 57.":
        "नियम 56 आवासीय भवनों पर लागू है; अन्य उपयोग वाले भवन नियम 57 में आते हैं।",
    "The rear open space depends on the plot area.": "पीछे की खुली जगह प्लॉट के क्षेत्रफल पर निर्भर है।",
    "Rule 56(2) table applies only to residential buildings up to 12.5 m; above that, Rule 42 applies.":
        "नियम 56(2) की तालिका केवल 12.5 मीटर तक के आवासीय भवनों पर लागू है; इससे ऊंचे भवनों पर नियम 42 लागू होता है।",
    "Rule 56(3) differs for detached, semi-detached and row-type buildings.":
        "नियम 56(3) पृथक, अर्ध-पृथक और पंक्ति प्रकार के भवनों के लिए अलग है।",
    "Rule 56(3) reductions depend on height, and Rule 42 applies above 12.5 m.":
        "नियम 56(3) की छूट ऊंचाई पर निर्भर है, और 12.5 मीटर से ऊपर नियम 42 लागू होता है।",
    "The proviso (one side may be 1.5 m) applies only when the frontage is less than 12 m.":
        "परंतुक (एक ओर की खुली जगह 1.5 मीटर तक कम हो सकती है) तभी लागू है जब प्लॉट की सामने की चौड़ाई 12 मीटर से कम हो।",
    "The 2.5 m reduction applies only when the frontage is up to 10 m.":
        "2.5 मीटर तक की छूट तभी लागू है जब प्लॉट की सामने की चौड़ाई 10 मीटर तक हो।",
    "A building of 30 m or less is a high rise building if it has more than ten storeys (Rule 2(38)); this decides "
    "whether Table 4 or Table 5 applies.":
        "30 मीटर या उससे कम ऊंचाई का भवन भी हाई राइज है यदि उसमें दस से अधिक मंजिलें हों (नियम 2(38)); इसी से तय होता "
        "है कि तालिका 4 लागू होगी या तालिका 5।",
    "Rule 21 fees are charged on the proposed built-up area (not the plot area).":
        "नियम 21 का शुल्क प्रस्तावित निर्मित क्षेत्र पर लगता है (प्लॉट के क्षेत्रफल पर नहीं)।",
    "Rule 21(3) charges different fees for residential, commercial, shop-cum-residence and other uses.":
        "नियम 21(3) आवासीय, वाणिज्यिक, दुकान सह आवास और अन्य उपयोगों के लिए अलग-अलग शुल्क तय करता है।",
    "High rise buildings (more than 10 storeys or more than 30 m, Rule 2(38)) use the Rule 21(3)(c) table instead of 21(3)(b).":
        "हाई राइज भवनों (10 से अधिक मंजिलें या 30 मीटर से अधिक ऊंचाई, नियम 2(38)) पर नियम 21(3)(b) के बजाय नियम "
        "21(3)(c) की तालिका लागू होती है।",
    "Rule 21(3)(b) item 5 fixes cinema fees by seating capacity (up to 800 / above 800).":
        "नियम 21(3)(b) मद 5 सिनेमा का शुल्क बैठने की क्षमता (800 तक या 800 से अधिक) के अनुसार तय करता है।",
    "The printed slabs leave a gap at this area; see note.": "छपे हुए स्लैब में इस क्षेत्रफल के लिए अंतर है; टिप्पणी देखें।",
    "Rule 52(1) gives different distances for each line voltage.": "नियम 52(1) हर लाइन वोल्टेज के लिए अलग दूरी देता है।",
}
HI_NOTES = {
    "Rule 56 applies to residential buildings. Open spaces for other occupancies up to 12.5 m are in Rule 57 (PDF pp. "
    "80–81); MIRA has not verified Rule 57 for calculation, so no value is given.":
        "नियम 56 आवासीय भवनों पर लागू है। 12.5 मीटर तक के अन्य उपयोग वाले भवनों की खुली जगह नियम 57 (PDF पृष्ठ "
        "80–81) में है; MIRA ने गणना के लिए नियम 57 का सत्यापन नहीं किया है, इसलिए कोई मान नहीं दिया गया।",
    "The open side is drawn on the right for display; the rule does not fix which side.":
        "खुली ओर को प्रदर्शन के लिए दाईं ओर दिखाया गया है; नियम यह तय नहीं करता कि कौन-सी ओर।",
    "Permission fee is paid before the permission is issued (Rule 21(3)); the authority may reject the application if "
    "it is not deposited within 15 days of intimation (Rule 21(3)(d)).":
        "अनुज्ञा शुल्क अनुज्ञा जारी होने से पहले जमा होता है (नियम 21(3)); सूचना के 15 दिन के भीतर जमा न होने पर "
        "प्राधिकरण आवेदन अस्वीकार कर सकता है (नियम 21(3)(d))।",
    "Rule 21(3)(c) has no separate cinema item; item 5 ('any other purpose') may apply. Not calculated.":
        "नियम 21(3)(c) में सिनेमा के लिए अलग मद नहीं है; मद 5 ('any other purpose') लागू हो सकता है। गणना नहीं की गई।",
    "Built-up area is outside the printed slabs.": "निर्मित क्षेत्र छपे हुए स्लैब से बाहर है।",
    "Or the distance in the applicable Electricity Rules, whichever is more (Rule 52(1)).":
        "या लागू विद्युत नियमों में दी गई दूरी, जो भी अधिक हो (नियम 52(1))।",
    "No verandah, balcony or the like may be erected that violates this distance (Rule 52(1)).":
        "ऐसा कोई बरामदा, बालकनी या इसी तरह का निर्माण नहीं किया जा सकता जो इस दूरी का उल्लंघन करे (नियम 52(1))।",
    "Vertical clearance is measured from maximum sag; horizontal from maximum deflection due to wind (Rule 52(2)).":
        "ऊर्ध्वाधर दूरी तार के अधिकतम झोल से और क्षैतिज दूरी हवा से होने वाले अधिकतम विचलन से मापी जाती है (नियम 52(2))।",
}
_HI_ROW_UNITS = [(" sq m plot area", " वर्ग मीटर प्लॉट क्षेत्रफल"), (" m road width", " मीटर सड़क की चौड़ाई"),
                 (" m frontage", " मीटर सामने की चौड़ाई")]
HI_NOTE_PATTERNS = [
    (re.compile(r"^Row selected by proposed building height\. The same row lists road width ≥ (\S+) m, plot ≥ (\S+) sq m, "
                r"frontage ≥ (\S+) m and FAR (\S+); the authority's reading of the table governs\.$"),
     "पंक्ति प्रस्तावित भवन की ऊंचाई से चुनी गई है। उसी पंक्ति में सड़क की चौड़ाई ≥ {0} मीटर, प्लॉट ≥ {1} वर्ग मीटर, "
     "सामने की चौड़ाई ≥ {2} मीटर और FAR {3} भी दिए गए हैं; तालिका की व्याख्या प्राधिकरण की ही मान्य होगी।"),
    (re.compile(r"^The site does not meet this row's listed minimums \((.+)\)\. Refer the case to the authority; no "
                r"compliance conclusion is drawn\.$"),
     "स्थल इस पंक्ति के न्यूनतम मानों को पूरा नहीं करता ({0}); मामला प्राधिकरण को भेजें, MIRA कोई निष्कर्ष नहीं निकालता।"),
    (re.compile(r"^Not checked: minimum (.+) for this row \(input not provided\)\.$"),
     "जांच नहीं हुई: इस पंक्ति के लिए न्यूनतम {0} (इनपुट नहीं दिया गया)।"),
    (re.compile(r"^Meets row minimum: (.+)\.$"), "पंक्ति का न्यूनतम मान पूरा होता है: {0}।"),
    (re.compile(r"^Below row minimum: (.+)\.$"), "पंक्ति के न्यूनतम मान से कम: {0}।"),
]
HI_RESULTS = {
    "Building line at 6.0 m from the centre line of the street": "भवन रेखा सड़क की मध्य रेखा से 6.0 मीटर पर",
    "One side open space may be reduced to 1.5 m": "एक ओर की खुली जगह 1.5 मीटर तक कम की जा सकती है",
    "Side open space may be reduced to 2.5 m": "बगल की खुली जगह 2.5 मीटर तक कम की जा सकती है",
}


# ---------------------------------------------------------------------- small formatters
def num(v: float | int) -> str:
    """A number exactly as stored (no rounding), without a trailing '.0'."""
    s = str(v)
    return s[:-2] if s.endswith(".0") else s


def hi_m(v: float) -> str:
    return "शून्य" if v == 0 else f"{num(v)} मीटर"


def clip(text: str, limit: int) -> str:
    text = "\n".join(" ".join(ln.split()) for ln in text.strip().splitlines())
    if len(text) <= limit:
        return text
    return text[:limit - 4].rsplit(None, 1)[0] + " ..."  # cut at a word so no number is split


def top_rule(rule: str) -> str | None:
    m = re.match(r"\s*(\d{1,3}(?:-[A-Za-z])?)", rule)
    return normalize_rule_id(m.group(1)) if m else None


def _join(items: list[str], hi: bool) -> str:
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + (" और " if hi else " and ") + items[-1]


def _lc(s: str) -> str:
    return s[:1].lower() + s[1:] if s[:2] != s[:2].upper() else s


def _plain(step: str) -> str:
    """Engine step text without arrow/multiplication glyphs (they read badly aloud)."""
    return step.replace(f" {ARROW} ", ", so ").replace(ARROW, " so ").replace(f" {TIMES} ", " times ")


def _hi_words(text: str) -> str:
    for en, hn in HI_RESULT_WORDS:
        text = text.replace(en, hn)
    return text.replace("per sq m", "प्रति वर्ग मीटर").replace(" sq m", " वर्ग मीटर")


def hi_note(text: str) -> str:
    if text in HI_NOTES:
        return HI_NOTES[text]
    for pat, tmpl in HI_NOTE_PATTERNS:
        m = pat.match(text)
        if m:
            groups = list(m.groups())
            for i, g in enumerate(groups):
                for en, hn in _HI_ROW_UNITS:
                    g = g.replace(en, hn)
                groups[i] = g
            return tmpl.format(*groups)
    return text


def _has(calc: CalcResult, key: str) -> bool:
    return any(c.chunk_id == f"verified:{key}" for c in calc.citations)


def _dedupe(cites: list[Citation]) -> list[Citation]:
    out, seen = [], set()
    for c in cites:
        k = c.chunk_id or c.passage[:80]
        if k not in seen:
            seen.add(k)
            out.append(c)
    return out


def _union_missing(calcs: list[CalcResult]) -> list[MissingInput]:
    out: list[MissingInput] = []
    for c in calcs:
        for m in c.missing_inputs:
            if m.field not in {x.field for x in out}:
                out.append(m)
    return out


# ---------------------------------------------------------------------- trusted context
@dataclass
class Trusted:
    lang: str
    detail: str
    question: str | None
    oos_topic: str | None
    inputs: ProjectInputs
    calcs: list[CalcResult]
    citations: list[Citation]
    not_found: bool
    missing: list[MissingInput]
    warnings: list[Warning]
    statuses: list[Status]
    target: ExplainTarget
    focus_calcs: list[CalcResult]       # the calculations this explanation is about
    focus_missing: list[MissingInput]   # their missing inputs
    zone: GeometryZone | None           # the selected constraint, if any
    evidence: list[Citation]            # the sources behind this explanation (returned to the client)

    @property
    def hi(self) -> bool:
        return self.lang == "hi"

    @property
    def amendment(self) -> bool:
        return any(w.code.startswith("AMENDMENT") for w in self.warnings)


class ExplainService:
    def __init__(self, store: RuleStore, retriever: Retriever, llm: LLMClient, limiter: SlidingWindowLimiter):
        self.store, self.retriever, self.llm, self.limiter = store, retriever, llm, limiter
        self._chunks = {c.chunk_id: c for c in store.chunks}
        self._answers = AnswerService(store, retriever, llm)  # shared helpers (input merge, rule citations)

    # ------------------------------------------------------------------ public
    def explain(self, req: ExplainRequest, client: str = "anon") -> ExplainResponse:
        t0 = time.perf_counter()
        ctx = self.context(req)
        reason: str | None
        if ctx.not_found:
            reason = "not_found"
        elif not req.use_ai:
            reason = "ai_disabled"
        elif not self.llm.available:
            reason = "not_configured"
        elif not self.limiter.allow(client):
            reason = "rate_limited"
        else:
            payload, ids, allowed_text, allowed_rules = self.payload(ctx)
            out, reason = self.llm.explain_sections(payload, ctx.lang, ctx.detail, ids, allowed_text, allowed_rules)
            if out is not None:
                log.info("explain source=ai target=%s ms=%d", ctx.target.kind, (time.perf_counter() - t0) * 1000)
                return self._ai_response(ctx, out)
        log.info("explain source=basic reason=%s target=%s ms=%d", reason, ctx.target.kind, (time.perf_counter() - t0) * 1000)
        return self._basic_response(ctx, reason or "unavailable")

    def context(self, req: ExplainRequest) -> Trusted:
        """Rebuild everything to be explained from server data. Raises pydantic ValidationError on bad inputs."""
        ex = extract(req.question) if req.question else None
        q_lang = ex.language if ex else "en"
        oos = ex.out_of_scope_topic if ex else None
        inputs = AnswerService._merge_inputs(req.inputs, ex.values) if ex else (req.inputs or ProjectInputs())
        types = list(req.calc_types)
        if not types and ex and not oos:
            types = list(dict.fromkeys(ex.intents))
        if not types and not req.question and req.focus and req.focus.element:
            types = [ELEMENT_DEFAULT_CALC[req.focus.element]]
        calcs = [] if oos else self._run(types, inputs)
        citations = [] if oos else self._citations(req, calcs)
        not_found = bool(oos) or (not calcs and not citations)
        missing = _union_missing(calcs)
        warnings = [] if not_found else warnings_for(req.question or "", [c.rule for c in citations], inputs)
        if q_lang == "hi" and not not_found:
            warnings.append(HINDI_PREVAILS)
        statuses = derive_statuses(not_found, calcs, missing, warnings)
        target, focus_calcs, zone, evidence = self._focus(req, calcs, citations, statuses)
        if not_found:
            focus_calcs, evidence = [], []
        focus_missing = missing if target.kind == "result" else _union_missing(focus_calcs)
        return Trusted(lang=req.language, detail=req.detail, question=req.question, oos_topic=oos, inputs=inputs,
                       calcs=calcs, citations=citations, not_found=not_found, missing=missing, warnings=warnings,
                       statuses=statuses, target=target, focus_calcs=focus_calcs, focus_missing=focus_missing,
                       zone=zone, evidence=evidence)

    # ------------------------------------------------------------------ reconstruction
    @staticmethod
    def _run(types: list[str], inputs: ProjectInputs) -> list[CalcResult]:
        out: list[CalcResult] = []
        for t in types:
            try:
                results = calculations.run(t, inputs)
            except SourceUnavailable:
                continue
            out += [r for r in results if r.calc_type not in {x.calc_type for x in out}]
        return out

    def _resolve(self, cid: str) -> Citation | None:
        if cid.startswith("verified:"):
            key = cid.removeprefix("verified:")
            if key not in SOURCES:
                return None
            try:
                return cite(key)
            except SourceUnavailable:
                return None
        ch = self._chunks.get(cid)
        if ch is None:
            return None
        return Citation(rule=ch.rule, sub_rule=ch.sub_rule, title=ch.title, page=ch.page, passage=ch.text.strip(),
                        chunk_id=ch.chunk_id)

    def _citations(self, req: ExplainRequest, calcs: list[CalcResult]) -> list[Citation]:
        out = [c for c in (self._resolve(cid) for cid in req.citation_ids) if c]
        if not req.citation_ids:
            out += [c for calc in calcs for c in calc.citations]
        if not out and not calcs and req.question:
            # No usable ids and nothing calculated: the same lexical retrieval /api/answer uses (no AI expansion).
            direct = self.retriever.direct_rules(req.question)
            hits, _ = self.retriever.search(req.question, k=8)
            if direct or (hits and hits[0].score >= MIN_SCORE):
                out += [c for c in (self._answers._rule_citation(r) for r in direct) if c]
                for h in hits:
                    if h.score < MIN_SCORE * 0.6 or len(_dedupe(out)) >= 4:
                        break
                    out.append(Citation(rule=h.chunk.rule, sub_rule=h.chunk.sub_rule, title=h.chunk.title,
                                        page=h.chunk.page, passage=h.chunk.text.strip(), chunk_id=h.chunk.chunk_id,
                                        score=h.score))
        return _dedupe(out)

    def _focus(self, req: ExplainRequest, calcs: list[CalcResult], citations: list[Citation], statuses: list[Status]):
        hi, primary, f = req.language == "hi", statuses[0], req.focus
        by = {c.calc_type: c for c in calcs}
        setbacks = [c for c in calcs if c.calc_type in FOCUS_SIDES]
        firsts = lambda cs: _dedupe([c.citations[0] for c in cs if c.citations])[:3]  # noqa: E731
        if f and f.calc_type == "site_open_spaces":
            status = min((c.status for c in setbacks), key=STATUS_PRIORITY.index, default=primary)
            label = HI_SITE_LABEL if hi else CALC_LABELS["site_open_spaces"]
            return ExplainTarget(kind="calculation", label=label, status=status, calc_type=f.calc_type), setbacks, None, firsts(setbacks)
        if f and f.calc_type:
            calc = by.get(f.calc_type)
            fc, status = ([calc], calc.status) if calc else ([], primary)
            evidence = calc.citations[:3] if calc else []
            if f.side:
                zone = next((z for z in calc.zones if z.side == f.side), None) if calc else None
                if zone and hi:
                    val = "शून्य" if zone.depth_m == 0 else f"≥ {hi_m(zone.depth_m)}"
                    label = f"{HI_SIDE[zone.side]} खुली जगह {val} — नियम {zone.rule}"
                elif zone:
                    label = f"{zone.label} — Rule {zone.rule}"
                else:
                    label = f"{HI_SIDE[f.side]} खुली जगह — अभी तय नहीं" if hi else f"{f.side.title()} open space — unresolved"
                return (ExplainTarget(kind="constraint", label=label, status=status, calc_type=f.calc_type, side=f.side),
                        fc, zone, evidence)
            label = HI_LABELS.get(f.calc_type) if hi else (calc.label if calc else CALC_LABELS[f.calc_type])
            return ExplainTarget(kind="calculation", label=label, status=status, calc_type=f.calc_type), fc, None, evidence
        if f and f.element:
            if f.element == "building":
                fc, status = setbacks, Status.ILLUSTRATIVE_ONLY
                label = "प्रस्तावित भवन (केवल चित्रण)" if hi else "Proposed building (illustrative)"
            elif f.element == "road":
                fc, status = [c for c in calcs if c.calc_type == "front_open_space"], primary
                label = "प्लॉट के सामने की सड़क" if hi else "Street facing the plot"
            else:
                fc, status = [c for c in calcs if c.calc_type in ("rear_open_space", "side_open_space")], primary
                label = "प्लॉट की सीमा (उपयोगकर्ता इनपुट)" if hi else "Plot boundary (user input)"
            return ExplainTarget(kind="element", label=label, status=status, element=f.element), fc, None, firsts(fc)
        if req.question:
            label = req.question if len(req.question) <= 140 else req.question[:137].rstrip() + "..."
        else:
            names = [HI_LABELS.get(c.calc_type, c.label) if hi else c.label for c in calcs]
            head = "जांची गई आवश्यकता" if hi else "Evaluated requirement"
            label = f"{head}: {'; '.join(names)}" if names else head
        pool = citations or [c for calc in calcs for c in calc.citations]
        evidence = sorted(_dedupe(pool), key=lambda c: not c.verified_table)[:4]
        return ExplainTarget(kind="result", label=label, status=primary), calcs[:6], None, evidence

    # ------------------------------------------------------------------ model context
    def payload(self, ctx: Trusted) -> tuple[dict, list[str], str, set[str]]:
        """Minimum relevant context for the model, its evidence ids, and the text/rules its output may use."""
        t = ctx.target
        limit = ELEMENT_PASSAGE_CHARS if t.kind == "element" else PASSAGE_CHARS
        evidence = [{"id": f"E{i + 1}", "rule": rule_label(c), "title": c.title, "page": f"PDF p. {c.page}",
                     "pdf_verified_table": c.verified_table, "text": clip(c.passage, limit)}
                    for i, c in enumerate(ctx.evidence)]
        inp = ctx.inputs.model_dump(exclude_none=True)
        if t.kind == "result":
            fields = list(inp)
        elif t.element == "building":
            fields = list(BUILDING_FIELDS)
        elif t.element == "plot":
            fields = list(PLOT_FIELDS)
        elif t.element == "road":
            fields = ["road_width_m"]
        else:
            fields = [k for c in ctx.focus_calcs for k in c.inputs_used]
        payload: dict = {
            "target": {"kind": t.kind, "label": t.label, "status": t.status.value},
            "question": ctx.question,
            "inputs": {k: inp[k] for k in dict.fromkeys(fields) if k in inp},
            "case_statuses": [s.value for s in ctx.statuses],
            "status_meanings": {s: STATUS_MEANINGS[s] for s in dict.fromkeys([t.status.value, *(s.value for s in ctx.statuses)])},
        }
        if t.element == "building":
            payload["building_drawn"] = bool(ctx.inputs.building_width_m and ctx.inputs.building_depth_m)
            payload["zones"] = [self._zone_fact(c, z) for c in ctx.focus_calcs for z in c.zones]
            payload["calculations_without_zones"] = [
                {"label": c.label, "status": c.status.value, "missing": [m.label for m in c.missing_inputs]}
                for c in ctx.focus_calcs if not c.zones]
            payload["facts"] = _Basic(ctx, en=True).building_facts()
        else:
            payload["calculations"] = [self._calc_fact(c, zones=ctx.zone is None) for c in ctx.focus_calcs]
            if ctx.zone:
                payload["selected_zone"] = self._zone_fact(ctx.focus_calcs[0], ctx.zone)
        payload["missing_inputs"] = [{"label": m.label, "reason": m.reason} for m in ctx.focus_missing]
        payload["warnings"] = [{"title": w.title, "detail": w.detail} for w in ctx.warnings]
        payload["evidence"] = evidence
        payload = {k: v for k, v in payload.items() if v not in (None, [], {})}
        allowed_text = "\n".join([ctx.question or "", *(f"{k}: {v}" for k, v in inp.items()), *_flatten(payload)])
        allowed_rules = {r for c in ctx.evidence if (r := top_rule(c.rule))} | rule_refs(allowed_text)
        return payload, [e["id"] for e in evidence], allowed_text, allowed_rules

    @staticmethod
    def _calc_fact(c: CalcResult, zones: bool = True) -> dict:
        d = {
            "label": c.label, "status": c.status.value, "display_value": c.display_value, "inputs_used": c.inputs_used,
            "steps": c.steps, "conditions": c.conditions, "notes": c.notes,
            "conditional_results": [f"{r.condition}: {r.result} (Rule {r.rule})" for r in c.conditional_results],
            "schedule": c.summary_en if not c.display_value else None,
            "missing": [m.label for m in c.missing_inputs],
            "zones": [ExplainService._zone_fact(c, z) for z in c.zones] if zones else None,
        }
        return {k: v for k, v in d.items() if v not in (None, [], {})}

    @staticmethod
    def _zone_fact(c: CalcResult, z: GeometryZone) -> dict:
        return {"side": z.side, "minimum": fmt_m(z.depth_m), "depth_m": z.depth_m, "rule": f"Rule {z.rule}",
                "proposed_gap_m": z.proposed_gap_m, "check": z.check, "calculation_status": c.status.value}

    # ------------------------------------------------------------------ responses
    def _response(self, ctx: Trusted, source: str, summary: str, sections: list[ExplainSection],
                  disclosures: list[str], model: str | None = None, reason: str | None = None) -> ExplainResponse:
        return ExplainResponse(
            language=ctx.lang, detail=ctx.detail, source=source, model=model, fallback_reason=reason,
            target=ctx.target, summary=summary, sections=sections, primary_status=ctx.statuses[0],
            statuses=ctx.statuses, citations=[] if ctx.not_found else ctx.evidence, warnings=ctx.warnings,
            missing_inputs=ctx.focus_missing, disclosures=disclosures,
            generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )

    def _ai_response(self, ctx: Trusted, out: ExplainSectionsOut) -> ExplainResponse:
        texts = {k: getattr(out, k) for k in SECTION_ORDER}
        if ctx.amendment and "2026" not in (texts["uncertainty"] or "").translate(DEVANAGARI_DIGITS):
            vs = VERSION_SENTENCE[ctx.hi]
            texts["uncertainty"] = f"{texts['uncertainty']} {vs}" if texts["uncertainty"] else vs
        sections = [ExplainSection(key=k, text=v) for k, v in texts.items() if v]
        disclosures = [DISCLOSURE_AI[ctx.hi]] + ([HINDI_DISCLOSURE] if ctx.hi else [])
        return self._response(ctx, "ai", out.summary, sections, disclosures, model=self.llm.model)

    def _basic_response(self, ctx: Trusted, reason: str) -> ExplainResponse:
        summary, sections = _Basic(ctx).build()
        disclosures = [DISCLOSURE_BASIC[ctx.hi]] + ([HINDI_DISCLOSURE] if ctx.hi else [])
        return self._response(ctx, "basic", summary, sections, disclosures, reason=reason)


def _flatten(obj) -> list[str]:
    if isinstance(obj, dict):
        return [s for v in obj.values() for s in _flatten(v)]
    if isinstance(obj, (list, tuple)):
        return [s for v in obj for s in _flatten(v)]
    if obj is None or isinstance(obj, bool):
        return []
    return [str(obj)]


# ---------------------------------------------------------------------- deterministic basic explanation
class _Basic:
    """Bilingual explanation assembled only from the trusted context (labels, values, steps, notes, zones,
    missing inputs, warnings and citation rule/title/page). It introduces no number, rule or page of its own."""

    def __init__(self, ctx: Trusted, en: bool = False):
        self.c, self.hi = ctx, ctx.hi and not en
        self.brief = ctx.detail == "brief"

    def t(self, en: str, hi: str) -> str:
        return hi if self.hi else en

    # -------------------------------------------------------------- pieces
    def label(self, c: CalcResult) -> str:
        return HI_LABELS.get(c.calc_type, c.label) if self.hi else c.label

    def ref(self, c: Citation) -> str:
        sub = c.sub_rule or ""
        return self.t(f"Rule {c.rule}{sub}, PDF p. {c.page}", f"नियम {c.rule}{sub}, PDF पृष्ठ {c.page}")

    def value(self, c: CalcResult) -> str:
        v = c.display_value or ""
        if not self.hi:
            return v
        b = c.breakdown
        if "left_m" in b and "right_m" in b:
            return f"बाएं {hi_m(float(b['left_m']))}, दाएं {hi_m(float(b['right_m']))}"
        if "corridor_total_m" in b:
            return (f"{num(b['corridor_total_m'])} मीटर का खुला क्षैतिज गलियारा (मध्य रेखा के दोनों ओर "
                    f"{num(b['each_side_m'])} मीटर)")
        if "vertical_m" in b:
            return f"ऊर्ध्वाधर {hi_m(float(b['vertical_m']))}, क्षैतिज {hi_m(float(b['horizontal_m']))}"
        if c.unit == "m" and c.value is not None:
            return hi_m(c.value)
        return _hi_words(v)

    def field_input(self, k: str, v) -> str:
        if isinstance(v, str):
            val = HI_VALUES.get(v, v) if self.hi else EN_VALUES.get(v, v)
        elif k.endswith("_sqm"):
            val = f"{num(v)} {self.t('sq m', 'वर्ग मीटर')}"
        elif k.endswith("_m"):
            val = f"{num(v)} {self.t('m', 'मीटर')}"
        else:
            val = num(v)
        return f"{(HI_INPUT if self.hi else EN_INPUT).get(k, k)} {val}"

    def missing_names(self, ms: list[MissingInput]) -> str:
        return _join([HI_FIELDS.get(m.field, m.label) if self.hi else _lc(m.label) for m in ms], self.hi)

    def input_names(self, fields: list[str]) -> str:
        return _join([(HI_INPUT if self.hi else EN_INPUT)[f] for f in fields], self.hi)

    def calc_phrase(self, c: CalcResult) -> str:
        lab = self.label(c)
        refp = f" ({self.ref(c.citations[0])})" if c.citations else ""
        if c.status == Status.SOURCE_FOUND:
            return self.t(f"{lab}: MIRA found the governing rule text{refp} but did not calculate a value.",
                          f"{lab}: MIRA को लागू नियम का पाठ मिला{refp}, पर कोई मान नहीं निकाला गया।")
        if c.display_value and c.status in COMPUTED:
            return self.t(f"{lab}: {self.value(c)}{refp}; {STATUS_EN[c.status]}.",
                          f"{lab}: {self.value(c)}{refp}; {STATUS_HI[c.status]}।")
        if c.display_value:
            return self.t(f"{lab}: {self.value(c)}{refp}, but more information is needed to confirm it.",
                          f"{lab}: {self.value(c)}{refp}, पर इसकी पुष्टि के लिए और जानकारी चाहिए।")
        names = self.missing_names(c.missing_inputs)
        return self.t(f"{lab} cannot be determined yet{refp}" + (f"; missing: {names}." if names else "."),
                      f"{lab} अभी तय नहीं हो सकता{refp}" + (f"; आवश्यक जानकारी: {names}।" if names else "।"))

    def source_found(self) -> str | None:
        src = (self.c.evidence or self.c.citations or [None])[0]
        if src is None:
            return None
        lab = f"{src.rule}{src.sub_rule or ''} — {src.title} "
        return self.t(f"The most relevant supplied rule is Rule {lab}(PDF p. {src.page}). MIRA located this text but "
                      "has not applied it to this case; read the quoted passage.",
                      f"सबसे प्रासंगिक दिया गया नियम: नियम {lab}(PDF पृष्ठ {src.page})। MIRA ने यह पाठ खोजा है, पर इसे इस "
                      "मामले पर लागू नहीं किया है; उद्धृत अंश पढ़ें।")

    def gap_check(self, z: GeometryZone) -> str:
        meets = z.check == "meets_minimum"
        if self.hi:
            verdict = "यह इस न्यूनतम को पूरा करती है" if meets else "यह इस न्यूनतम से कम है"
            return (f"प्रस्तावित {HI_SIDE[z.side]} दूरी {num(z.proposed_gap_m)} मीटर, जबकि गणना की गई न्यूनतम "
                    f"{hi_m(z.depth_m)} है: {verdict} (केवल यह एक जांच; यह अनुमोदन नहीं है)।")
        verdict = "meets this minimum" if meets else "is below this minimum"
        return (f"Proposed {z.side} gap {num(z.proposed_gap_m)} m against the computed minimum {fmt_m(z.depth_m)}: "
                f"{verdict} (this single check only; not an approval).")

    def gap_unchecked(self, side: str) -> str:
        i = self.c.inputs
        needs = {
            "front": [("building_depth_m", not i.building_depth_m), ("front_gap_m", i.front_gap_m is None)],
            "left": [("building_width_m", not i.building_width_m), ("left_gap_m", i.left_gap_m is None)],
            "rear": [("plot_depth_m", not i.plot_depth_m), ("building_depth_m", not i.building_depth_m),
                     ("front_gap_m", i.front_gap_m is None)],
            "right": [("plot_width_m", not i.plot_width_m), ("building_width_m", not i.building_width_m),
                      ("left_gap_m", i.left_gap_m is None)],
        }[side]
        names = self.input_names([f for f, absent in needs if absent])
        return self.t(f"The {side} gap is not checked because {names} {'is' if ' and ' not in names else 'are'} not entered.",
                      f"{HI_SIDE[side]} दूरी की जांच नहीं हुई, क्योंकि {names} नहीं भरी गई है।")

    def drawn(self) -> bool:
        return bool(self.c.inputs.building_width_m and self.c.inputs.building_depth_m)

    def building_facts(self) -> list[str]:
        i = self.c.inputs
        if not self.drawn():
            names = self.input_names([f for f in ("building_width_m", "building_depth_m") if not getattr(i, f)])
            return [self.t(f"The proposed building is not drawn because {names} {'are' if ' and ' in names else 'is'} "
                           "not entered. Enter the building width and depth in Project inputs, with the front gap and "
                           "left gap, to draw it.",
                           f"प्रस्तावित भवन नहीं बनाया गया है, क्योंकि {names} नहीं भरी गई है। इसे बनाने के लिए परियोजना "
                           "इनपुट (Project inputs) में भवन की चौड़ाई और गहराई, सामने और बाईं ओर छोड़ी गई दूरी के साथ भरें।")]
        if self.hi:
            parts = [f"चौड़ाई {num(i.building_width_m)} मीटर", f"गहराई {num(i.building_depth_m)} मीटर"]
            parts += [f"ऊंचाई {num(i.building_height_m)} मीटर"] if i.building_height_m else []
            parts += [f"सामने की सीमा से {num(i.front_gap_m)} मीटर"] if i.front_gap_m is not None else []
            parts += [f"बाईं सीमा से {num(i.left_gap_m)} मीटर"] if i.left_gap_m is not None else []
            facts = ["प्रस्तावित भवन परियोजना इनपुट के इन माप से बनाया गया है: " + ", ".join(parts) + "।"]
        else:
            parts = [f"{num(i.building_width_m)} m wide", f"{num(i.building_depth_m)} m deep"]
            parts += [f"{num(i.building_height_m)} m high"] if i.building_height_m else []
            parts += [f"{num(i.front_gap_m)} m from the front boundary"] if i.front_gap_m is not None else []
            parts += [f"{num(i.left_gap_m)} m from the left boundary"] if i.left_gap_m is not None else []
            facts = ["The proposed building is drawn from Project inputs: " + _join(parts, False) + "."]
        zones = [z for c in self.c.focus_calcs for z in c.zones]
        facts += [self.gap_check(z) if z.proposed_gap_m is not None else self.gap_unchecked(z.side) for z in zones]
        if not zones:
            facts.append(self.t("No open-space minimum was computed for this case, so the drawn gaps are not compared "
                                "with any rule.",
                                "इस मामले में खुली जगह का कोई न्यूनतम मान नहीं निकला, इसलिए छोड़ी गई दूरी की किसी नियम "
                                "से तुलना नहीं हुई।"))
        return facts

    # -------------------------------------------------------------- sections
    def summary(self) -> str:
        c, t = self.c, self.c.target
        if c.not_found:
            if self.hi:
                topic = f" {HI_TOPICS.get(c.oos_topic, c.oos_topic)}: यह विषय दिए गए नियमों में शामिल नहीं है।" if c.oos_topic else ""
                return NOT_FOUND_HI + topic
            return NOT_FOUND_EN + (f" The topic ({c.oos_topic}) is not covered by the supplied rules." if c.oos_topic else "")
        parts: list[str] = []
        if t.element == "building":
            facts = self.building_facts()
            parts.append(facts[0])
            below = [z.side for cc in c.focus_calcs for z in cc.zones if z.check == "below_minimum"]
            meets = [z.side for cc in c.focus_calcs for z in cc.zones if z.check == "meets_minimum"]
            if below:
                sides = _join([HI_SIDE[s] if self.hi else s for s in below], self.hi)
                parts.append(self.t(f"The drawn {sides} gap{'s are' if len(below) > 1 else ' is'} below the computed minimum.",
                                    f"{sides} छोड़ी गई दूरी गणना की गई न्यूनतम से कम है।"))
            if meets:
                sides = _join([HI_SIDE[s] if self.hi else s for s in meets], self.hi)
                parts.append(self.t(f"The drawn {sides} gap{'s meet' if len(meets) > 1 else ' meets'} the computed minimum "
                                    "(single checks only, not an approval).",
                                    f"{sides} छोड़ी गई दूरी गणना की गई न्यूनतम को पूरा करती है (केवल अलग-अलग जांच, अनुमोदन नहीं)।"))
        elif t.element in ("plot", "road"):
            fields = PLOT_FIELDS if t.element == "plot" else ("road_width_m",)
            given = [self.field_input(k, getattr(c.inputs, k)) for k in fields if getattr(c.inputs, k) is not None]
            name = self.t("plot boundary" if t.element == "plot" else "street facing the plot",
                          "प्लॉट की सीमा" if t.element == "plot" else "प्लॉट के सामने की सड़क")
            if given:
                parts.append(self.t(f"The {name} comes from Project inputs: {_join(given, False)}.",
                                    f"{name} परियोजना इनपुट से है: {_join(given, True)}।"))
            else:
                parts.append(self.t(f"The {name} is not entered in Project inputs yet.",
                                    f"{name} की जानकारी अभी परियोजना इनपुट में नहीं भरी गई है।"))
            parts += [self.calc_phrase(x) for x in c.focus_calcs[:2]]
        elif t.kind == "constraint":
            z, calc = c.zone, (c.focus_calcs or [None])[0]
            if z:
                page = f" (PDF p. {calc.citations[0].page})" if calc and calc.citations else ""
                hpage = f" (PDF पृष्ठ {calc.citations[0].page})" if calc and calc.citations else ""
                status = STATUS_EN.get(calc.status, "more information is needed") if calc else ""
                hstatus = STATUS_HI.get(calc.status, "और जानकारी आवश्यक") if calc else ""
                parts.append(self.t(f"The minimum {z.side} open space is {fmt_m(z.depth_m)} under Rule {z.rule}{page}; {status}.",
                                    f"न्यूनतम {HI_SIDE[z.side]} खुली जगह {hi_m(z.depth_m)} है, नियम {z.rule}{hpage} के अनुसार; {hstatus}।"))
                if z.proposed_gap_m is not None:
                    ok = z.check == "meets_minimum"
                    parts.append(self.t(f"The proposed {z.side} gap of {num(z.proposed_gap_m)} m "
                                        f"{'meets' if ok else 'is below'} this minimum.",
                                        f"प्रस्तावित {HI_SIDE[z.side]} दूरी {num(z.proposed_gap_m)} मीटर इस न्यूनतम "
                                        f"{'को पूरा करती है' if ok else 'से कम है'}।"))
            else:
                side = t.side or "front"
                parts.append(self.t(f"The {side} open space is not resolved yet.", f"{HI_SIDE[side]} खुली जगह अभी तय नहीं है।"))
                if calc:
                    parts.append(self.calc_phrase(calc))
        else:
            parts += [self.calc_phrase(x) for x in c.focus_calcs[:3]]
            src = (c.evidence or c.citations or [None])[0]
            if not c.focus_calcs and src:
                parts.append(self.t(f"MIRA found the relevant supplied text in Rule {src.rule}{src.sub_rule or ''} (PDF p. "
                                    f"{src.page}) but has not applied it to this case.",
                                    f"MIRA को संबंधित नियम पाठ नियम {src.rule}{src.sub_rule or ''} (PDF पृष्ठ {src.page}) में "
                                    "मिला है, पर उसने इसे इस मामले पर लागू नहीं किया है।"))
        if c.amendment:
            parts.append(self.t("Version review needed: the rulebook is consolidated only up to 6 March 2025.",
                                "संस्करण समीक्षा आवश्यक: नियम-संग्रह केवल 6 मार्च 2025 तक समेकित है।"))
        return " ".join(p for p in parts if p)

    def meaning(self) -> str | None:
        c, t = self.c, self.c.target
        if t.element == "building":
            return self.t(
                "The building in the 3D view is drawn only from the dimensions entered in Project inputs. MIRA uses it to "
                "compare each drawn gap with the computed minimum open space for that side; it does not check the rest "
                "of the design.",
                "3D दृश्य में भवन केवल परियोजना इनपुट (Project inputs) में भरे गए माप से बनाया गया है। MIRA इसका उपयोग "
                "हर ओर की छोड़ी गई दूरी को उस ओर की गणना की गई न्यूनतम खुली जगह से मिलाने के लिए करता है; यह बाकी "
                "डिज़ाइन की जांच नहीं करता।")
        out: list[str] = []
        if t.element in ("plot", "road"):
            for x in c.focus_calcs:
                if _has(x, "56_5_above_12_5"):
                    if _has(x, "42_table4") or _has(x, "42_table5"):
                        out.append(self.t(
                            "For buildings above 12.5 m, the Rule 42 row also lists a minimum road width, plot area and frontage.",
                            "12.5 मीटर से ऊंचे भवनों के लिए नियम 42 की पंक्ति में न्यूनतम सड़क चौड़ाई, प्लॉट क्षेत्रफल और "
                            "सामने की चौड़ाई भी दी गई है।"))
                elif x.calc_type == "front_open_space":
                    out.append(self.t("Under Rule 56(1)(a) the width of the street facing the plot chooses the row for the "
                                      "minimum front open space.",
                                      "नियम 56(1)(a) के अंतर्गत प्लॉट के सामने की सड़क की चौड़ाई न्यूनतम सामने की खुली जगह "
                                      "की पंक्ति तय करती है।"))
                elif x.calc_type == "rear_open_space":
                    out.append(self.t("Under Rule 56(2)(a) the plot area chooses the row for the minimum rear open space.",
                                      "नियम 56(2)(a) के अंतर्गत प्लॉट का क्षेत्रफल न्यूनतम पीछे की खुली जगह की पंक्ति तय करता है।"))
                elif x.calc_type == "side_open_space":
                    out.append(self.t("Under Rule 56(3) some side open space reductions depend on the plot frontage.",
                                      "नियम 56(3) के अंतर्गत बगल की खुली जगह में कुछ छूट प्लॉट की सामने की चौड़ाई पर निर्भर है।"))
                if any(r.rule == "56(1)(b)" for r in x.conditional_results):
                    out.append(self.t("Rule 56(1)(b) also sets a building line for streets narrower than 6.0 m in existing "
                                      "developed areas.",
                                      "मौजूदा विकसित क्षेत्रों में 6.0 मीटर से कम चौड़ी सड़कों के लिए नियम 56(1)(b) भवन रेखा "
                                      "भी तय करता है।"))
            return " ".join(dict.fromkeys(out)) or None
        for x in c.focus_calcs:
            pair = RULE42_MEANING if _has(x, "56_5_above_12_5") else MEANINGS.get(x.calc_type)
            if pair:
                out.append(pair[self.hi])
        if not c.focus_calcs:
            out.append(self.source_found() or "")
        out = [o for o in dict.fromkeys(out) if o]
        return " ".join(out[:1] if self.brief else out) or None

    def selection(self, x: CalcResult) -> str | None:
        """The rule-selection step: the engine's English step, or a fixed Hindi sentence for the same branch."""
        step = next((s for s in x.steps if f"{ARROW} Rule" in s or "refers to Rule" in s), None)
        if step is None:
            return None
        if not self.hi:
            return _plain(step)
        if _has(x, "56_5_above_12_5"):
            return "भवन 12.5 मीटर से ऊंचा है, इसलिए नियम 56(5) के अनुसार नियम 42 की तालिका लागू होती है।"
        if x.calc_type == "front_open_space":
            return "भवन आवासीय है और 12.5 मीटर से ऊंचा नहीं है, इसलिए नियम 56(1)(a) की तालिका लागू होती है।"
        if x.calc_type == "rear_open_space":
            return "भवन आवासीय है और 12.5 मीटर से ऊंचा नहीं है, इसलिए नियम 56(2)(a) की तालिका लागू होती है।"
        if x.calc_type == "side_open_space":
            return {"detached": "पृथक भवन होने के कारण नियम 56(3)(i) लागू होता है।",
                    "semi_detached": "अर्ध-पृथक भवन होने के कारण नियम 56(3)(ii) लागू होता है।",
                    "row": "पंक्ति प्रकार का भवन होने के कारण नियम 56(3)(iii) लागू होता है।"}.get(str(x.inputs_used.get("building_type")))
        if x.calc_type == "building_permission_fee":
            if x.inputs_used.get("building_use") == "cinema":
                return "सिनेमा भवन के लिए नियम 21(3)(b) मद 5 लागू होता है।"
            if any("High rise building (Rule 2(38))" in s for s in x.steps):
                return "भवन हाई राइज है (नियम 2(38)), इसलिए नियम 21(3)(c) लागू होता है।"
            return "भवन हाई राइज नहीं है, इसलिए नियम 21(3)(b) के स्लैब लागू होते हैं।"
        if x.calc_type == "electric_line_clearance":
            return "लाइन के प्रकार के अनुसार नियम 52(1) की संबंधित पंक्ति लागू होती है।"
        return None

    def why_it_applies(self) -> str | None:
        out: list[str] = []
        calcs = self.c.focus_calcs[:1] if self.brief else self.c.focus_calcs
        for x in calcs:
            used = [self.field_input(k, v) for k, v in x.inputs_used.items()]
            if used:
                out.append(self.t(f"{self.label(x)} uses these inputs: {'; '.join(used)}.",
                                  f"{self.label(x)} के लिए उपयोग की गई जानकारी: {'; '.join(used)}।"))
            sel = self.selection(x)
            if sel:
                out.append(sel)
        return " ".join(out) or None

    def evidence(self) -> str | None:
        if not self.c.evidence:
            return None
        items = []
        for e in self.c.evidence:
            tag = self.t(", PDF-verified table", ", PDF से सत्यापित तालिका") if e.verified_table else ""
            items.append(self.t(f"Rule {e.rule}{e.sub_rule or ''} — {e.title} (PDF p. {e.page}{tag})",
                                f"नियम {e.rule}{e.sub_rule or ''} — {e.title} (PDF पृष्ठ {e.page}{tag})"))
        return self.t("Sources: ", "स्रोत: ") + "; ".join(dict.fromkeys(items)) + self.t(".", "।")

    def calculation(self) -> str | None:
        out: list[str] = []
        calcs = self.c.focus_calcs[:1] if self.brief else self.c.focus_calcs
        for x in calcs:
            if x.steps:
                out.append(f"{self.label(x)}: " + " ".join(_plain(s) for s in x.steps))
            elif not self.brief and not x.display_value and (x.summary_hi if self.hi else x.summary_en):
                out.append(x.summary_hi if self.hi else x.summary_en)
        if not out:
            return None
        if self.hi and any(x.steps for x in calcs):
            out.insert(0, STEPS_DISCLOSURE_HI)
        return " ".join(out)

    def building_impact(self) -> str | None:
        c, t = self.c, self.c.target
        if t.element == "building":
            facts = self.building_facts()
            return " ".join(facts[:2] if self.brief else facts)
        if t.kind == "constraint":
            if not c.zone:
                return None
            if c.zone.proposed_gap_m is not None:
                return self.gap_check(c.zone)
            if not self.drawn():
                return self.t("No proposed building is drawn, so MIRA has not compared any gap with this minimum. Enter "
                              "the building width and depth, with the front and left gaps, in Project inputs to compare.",
                              "कोई प्रस्तावित भवन नहीं बनाया गया है, इसलिए MIRA ने किसी दूरी की इस न्यूनतम से तुलना नहीं "
                              "की। तुलना के लिए परियोजना इनपुट में भवन की चौड़ाई और गहराई, सामने और बाईं ओर की दूरी के साथ भरें।")
            return self.gap_unchecked(c.zone.side)
        if t.kind in ("result", "calculation"):
            checks = [self.gap_check(z) for x in c.focus_calcs for z in x.zones if z.proposed_gap_m is not None]
            return " ".join(checks) or None
        return None

    def uncertainty(self) -> str | None:
        c, hi, brief = self.c, self.hi, self.brief
        out: list[str] = []
        if c.not_found:
            return self.t("MIRA does not answer questions that the supplied rules do not cover, and it will not guess.",
                          "जो प्रश्न दिए गए नियमों में शामिल नहीं हैं, MIRA उनका उत्तर नहीं देता और अनुमान नहीं लगाता।")
        if c.focus_missing:
            if brief:
                items = [HI_FIELDS.get(m.field, m.label) if hi else m.label for m in c.focus_missing]
            elif hi:
                items = [f"{HI_FIELDS.get(m.field, m.label)} ({HI_REASONS.get(m.reason, m.reason).rstrip('।.')})"
                         for m in c.focus_missing]
            else:
                items = [f"{m.label} ({m.reason.rstrip('.')})" for m in c.focus_missing]
            out.append(self.t("Not yet determined because these inputs are missing: ", "अभी तय नहीं हो सकता, क्योंकि यह "
                              "जानकारी नहीं दी गई है: ") + "; ".join(items) + self.t(".", "।"))
        conds = [r for x in c.focus_calcs for r in x.conditional_results]
        if conds:
            if hi:
                items = [f"{HI_CONDITIONS.get(r.condition, r.condition)}: {HI_RESULTS.get(r.result) or _hi_words(r.result)} "
                         f"(नियम {r.rule})" for r in conds]
                out.append("तब तक परिणाम स्थिति पर निर्भर है: " + "; ".join(items) + "।")
            else:
                items = [f"{_lc(r.condition)}: {r.result} (Rule {r.rule})" for r in conds]
                out.append("Until then, the result depends on the case: " + "; ".join(items) + ".")
        if not c.focus_calcs and c.target.kind in ("result", "calculation"):
            out.append(self.t("There is no computed value or conclusion here; the answer depends on reading the quoted "
                              "rule text.",
                              "यहां कोई गणना किया गया मान या निष्कर्ष नहीं है; उत्तर उद्धृत नियम पाठ पढ़कर ही मिलेगा।"))
        for w in c.warnings:
            if w.code.startswith("AMENDMENT"):
                out.append(VERSION_SENTENCE[hi] if hi or brief else f"{w.title}. {w.detail}")
            elif w.code == HINDI_PREVAILS.code and not brief:
                out.append(HINDI_PREVAILS_HI if hi else f"{w.title}: {w.detail}")
        notes = [n for x in c.focus_calcs for n in x.notes if n]
        if brief:
            notes = [n for x in c.focus_calcs if x.status == Status.SOURCE_FOUND for n in x.notes]
        else:
            notes += [n for x in c.focus_calcs for n in x.conditions]
        out += [hi_note(n) if hi else n for n in dict.fromkeys(notes)]
        if not brief and any(x.status in COMPUTED for x in c.focus_calcs) and c.target.element != "building":
            out.append(self.t("This is a single deterministic result from the quoted table, not a review of the whole "
                              "application.",
                              "यह उद्धृत तालिका से निकला एक निर्धारित परिणाम है, पूरे आवेदन की समीक्षा नहीं।"))
        if c.target.element == "building" and not brief:
            out.append(self.t("Each comparison is one check against one computed minimum; it is not an approval of the plan.",
                              "हर तुलना एक गणना किए गए न्यूनतम मान से की गई एक जांच है; यह नक्शे का अनुमोदन नहीं है।"))
        return " ".join(out) or None

    def next_step(self) -> str | None:
        c = self.c
        if c.not_found:
            return self.t("Tell the citizen that these rules do not cover this topic; MIRA gives no answer for it.",
                          "नागरिक को बताएं कि ये नियम इस विषय को शामिल नहीं करते; MIRA इसके लिए कोई उत्तर नहीं देता।")
        out: list[str] = []
        if c.focus_missing:
            names = self.missing_names(c.focus_missing)
            out.append(self.t(f"Enter {names} in Project inputs and evaluate again.",
                              f"परियोजना इनपुट (Project inputs) में {names} भरें और फिर से जांचें।"))
        if c.target.element == "building" and not self.drawn():
            out.append(self.t("Enter the building width and depth, with the front and left gaps, in Project inputs to "
                              "draw the building.",
                              "भवन बनाने के लिए परियोजना इनपुट में भवन की चौड़ाई और गहराई, सामने और बाईं ओर की दूरी के साथ भरें।"))
        zones = [c.zone] if c.zone else [z for x in c.focus_calcs for z in x.zones]
        if any(z.check == "below_minimum" for z in zones):
            out.append(self.t("Point out to the applicant the drawn gap that is below the computed minimum.",
                              "आवेदक को बताएं कि कौन-सी छोड़ी गई दूरी गणना की गई न्यूनतम से कम है।"))
        if c.amendment:
            out.append(VERSION_NEXT[self.hi])
        if not c.focus_calcs or any(x.status == Status.SOURCE_FOUND for x in c.focus_calcs):
            out.append(self.t("Read the quoted rule text with the applicant; MIRA has not drawn a conclusion from it.",
                              "आवेदक के साथ उद्धृत नियम पाठ पढ़ें; MIRA ने इससे कोई निष्कर्ष नहीं निकाला है।"))
        elif not c.focus_missing:
            out.append(self.t("Confirm the inputs against the applicant's documents and read the quoted rule text before "
                              "handing over the Counter Receipt.",
                              "काउंटर रसीद (Counter Receipt) देने से पहले इनपुट को आवेदक के दस्तावेजों से मिलाएं और उद्धृत "
                              "नियम पाठ पढ़ें।"))
        out = list(dict.fromkeys(out))
        return " ".join(out[:2] if self.brief else out) or None

    # -------------------------------------------------------------- assembly
    def priority(self) -> list[str]:
        c, t = self.c, self.c.target
        if c.not_found:
            return ["uncertainty", "next_step"]
        if t.element == "building":
            return ["building_impact", "uncertainty", "next_step", "meaning"]
        if c.focus_missing or c.amendment or not c.focus_calcs:
            return ["meaning", "uncertainty", "next_step", "why_it_applies", "calculation"]
        if c.zone and c.zone.proposed_gap_m is not None:
            return ["meaning", "building_impact", "next_step", "calculation"]
        if any(x.status == Status.SOURCE_FOUND for x in c.focus_calcs):
            return ["meaning", "uncertainty", "next_step"]
        return ["meaning", "calculation", "next_step", "why_it_applies", "building_impact", "uncertainty"]

    def build(self) -> tuple[str, list[ExplainSection]]:
        builders = {"meaning": self.meaning, "why_it_applies": self.why_it_applies, "evidence": self.evidence,
                    "calculation": self.calculation, "building_impact": self.building_impact,
                    "uncertainty": self.uncertainty, "next_step": self.next_step}
        keys = list(SECTION_ORDER) if not self.brief else self.priority()
        texts = {k: builders[k]() for k in keys if not (self.c.not_found and k not in ("uncertainty", "next_step"))}
        chosen = [k for k in keys if texts.get(k)]
        if self.brief:
            chosen = chosen[:3]
        sections = [ExplainSection(key=k, text=texts[k]) for k in SECTION_ORDER if k in chosen]
        return self.summary(), sections
