"""POST /api/explain: trusted reconstruction, validated AI path and the deterministic bilingual fallback."""
import json
import re
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.schemas import SECTION_ORDER, ExplainRequest, ExplainResponse
from app.rules.verified_tables import SOURCES
from app.services.answer import NOT_FOUND_EN, NOT_FOUND_HI
from app.services.explain import ELEMENT_PASSAGE_CHARS, HINDI_DISCLOSURE, PASSAGE_CHARS, clip, top_rule
from app.services.llm import numbers_supported, rule_refs
from tests.conftest import make_settings
from tests.test_llm import Q1, FakeCompletions

KEY = "test-key-not-real"
FEE_Q = "What is the fee for building permission for a residential house?"
V11 = "Do I need separate development permission for a 300 sq m plot that matches the Development Plan?"
SIGN_Q = "Who is allowed to sign and submit my building plans?"
TAX_Q = "How do I pay my property tax online?"
HI_Q = "मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है। आगे कितनी जगह खाली छोड़नी होगी?"
SITE = {"plot_width_m": 10, "plot_depth_m": 15, "road_width_m": 9, "building_height_m": 7, "building_use": "residential",
        "building_type": "detached", "building_width_m": 6, "building_depth_m": 9, "front_gap_m": 2, "left_gap_m": 3}
FRONT = {"focus": {"calc_type": "front_open_space", "side": "front"}, "calc_types": ["site_open_spaces"], "inputs": SITE}
VALID_Q1 = json.dumps({"summary": "The minimum front open space is **3.6 m** under Rule 56(1)(a), PDF p. 77.",
                       "meaning": "- The quoted rule text sets the front open space by the width of the street facing the plot.",
                       "calculation": "A 10 m street falls in the row for streets more than 9.0 m and up to 12 m (E1).",
                       "uncertainty": "null", "citations": ["E1"], "extra_key": "ignored"})


# Local stand-ins named like the Cerebras SDK exceptions (classified by class name, no SDK import).
class APITimeoutError(Exception):
    pass


class RateLimitError(Exception):
    pass


class APIConnectionError(Exception):
    pass


class AuthenticationError(Exception):
    pass


class NotFoundError(Exception):
    pass


class Recorder(FakeCompletions):
    def __init__(self, replies):
        super().__init__(replies)
        self.kwargs: list[dict] = []

    def create(self, **kw):
        self.kwargs.append(kw)
        return super().create(**kw)

    def payload(self, i: int = -1) -> dict:
        return json.loads(self.kwargs[i]["messages"][1]["content"])


def _app_with_key(**kw):
    return create_app(make_settings(cerebras_api_key=KEY, **kw))


@pytest.fixture(scope="module")
def ai():
    app = _app_with_key(explain_rate_per_minute=10_000, explain_global_rate_per_minute=10_000)
    with TestClient(app) as tc:
        def run(replies, body):
            fake = Recorder(replies)
            app.state.llm._client = SimpleNamespace(chat=SimpleNamespace(completions=fake))
            r = tc.post("/api/explain", json=body)
            assert r.status_code == 200, r.text
            assert KEY not in r.text
            if fake.kwargs:
                assert KEY not in json.dumps(fake.kwargs, ensure_ascii=False)
            return r.json(), fake
        yield run


@pytest.fixture
def explain(client):
    def _explain(body: dict):
        r = client.post("/api/explain", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        ExplainResponse.model_validate(d)
        return d
    return _explain


def text_of(d: dict) -> str:
    return " ".join([d["summary"], *(s["text"] for s in d["sections"])])


def section(d: dict, key: str) -> str:
    return next((s["text"] for s in d["sections"] if s["key"] == key), "")


def pages_in(text: str) -> set[int]:
    found = re.findall(r"PDF (?:pp?\.|पृष्ठ) (\d+)(?:\s*[-–]\s*(\d+))?", text)
    return {int(n) for pair in found for n in pair if n}


def trusted_text(ctx) -> str:
    """Everything the server knows about the case: the only place a basic explanation may take facts from."""
    def cites(cs):
        return [f"Rule {c.rule}{c.sub_rule or ''} {c.title} PDF p. {c.page} {c.passage}" for c in cs]
    parts = [ctx.question or "", *(f"{k} {v}" for k, v in ctx.inputs.model_dump(exclude_none=True).items())]
    for c in ctx.calcs:
        parts += [c.label, c.display_value or "", c.summary_en or "", c.summary_hi or "", *c.steps, *c.conditions, *c.notes]
        parts += [f"{r.condition} {r.result} Rule {r.rule}" for r in c.conditional_results]
        parts += [f"{z.label} {z.depth_m} {z.proposed_gap_m} Rule {z.rule}" for z in c.zones]
        parts += [f"{m.label} {m.reason}" for m in c.missing_inputs]
        parts += [f"{k} {v}" for k, v in {**c.inputs_used, **c.breakdown}.items()]
        parts += cites(c.citations)
    parts += cites(ctx.citations) + [f"{w.title} {w.detail}" for w in ctx.warnings]
    return "\n".join(parts)


# ---------------------------------------------------------------------- request validation
@pytest.mark.parametrize("body", [
    {},
    {"question": "   "},
    {"question": "x" * 1001},
    {"question": Q1, "citation_ids": ["../etc/passwd"]},
    {"question": Q1, "citation_ids": ["56#1 OR 1=1"]},
    {"question": Q1, "citation_ids": [f"56#{i}" for i in range(9)]},
    {"calc_types": ["far"]},
    {"calc_types": ["front_open_space"] * 7},
    {"question": Q1, "passage": "Leave 1 m at the front."},
    {"question": Q1, "answer": "Approved."},
    {"question": Q1, "citations": [{"rule": "56", "passage": "forged"}]},
    {"focus": {"calc_type": "front_open_space", "side": "left"}},
    {"focus": {"calc_type": "site_open_spaces", "side": "front"}},
    {"focus": {"side": "front"}},
    {"focus": {"element": "building", "calc_type": "front_open_space"}},
    {"focus": {"element": "tree"}},
    {"question": Q1, "language": "fr"},
    {"question": Q1, "detail": "long"},
    {"calc_types": ["front_open_space"], "inputs": {"road_width_m": -3}},
])
def test_rejects_bad_requests(client, body):
    r = client.post("/api/explain", json=body)
    assert r.status_code == 422, (body, r.text)
    assert "detail" in r.json()


def test_body_too_large(client):
    r = client.post("/api/explain", content=b"{" + b" " * 40_000 + b"}", headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_inconsistent_merged_inputs_return_422(client):
    r = client.post("/api/explain", json={"question": "What is the minimum rear open space for a 500 sq m plot?",
                                          "inputs": {"plot_width_m": 10, "plot_depth_m": 10}})
    assert r.status_code == 422 and "does not match" in r.json()["detail"]


def test_503_without_rule_data(tmp_path):
    with TestClient(create_app(make_settings(data_dir=tmp_path))) as c:
        assert c.post("/api/explain", json={"question": Q1}).status_code == 503


# ---------------------------------------------------------------------- trusted reconstruction
def test_passages_rebuilt_from_store(ask, explain, store):
    ids = [c["chunk_id"] for c in ask(SIGN_Q)["citations"]][:5]
    d = explain({"question": SIGN_Q, "citation_ids": ids + ["999#0", "56#9999", "verified:nope"], "detail": "detailed"})
    chunks = {c.chunk_id: c for c in store.chunks}
    got = [c["chunk_id"] for c in d["citations"]]
    assert got == ids[:4] and not {"999#0", "56#9999", "verified:nope"} & set(got)
    for c in d["citations"]:
        ch = chunks[c["chunk_id"]]
        assert (c["passage"], c["page"], c["rule"], c["title"]) == (ch.text.strip(), ch.page, ch.rule, ch.title)
        assert c["verified_table"] is False
    assert d["primary_status"] == "SOURCE_FOUND" and d["source"] == "basic"


def test_verified_ids_resolve_to_verified_tables(explain):
    d = explain({"question": Q1, "citation_ids": ["verified:52_1_electric", "verified:56_1_front"]})
    assert [c["chunk_id"] for c in d["citations"]] == ["verified:52_1_electric", "verified:56_1_front"]
    assert all(c["verified_table"] for c in d["citations"])
    assert d["citations"][1]["passage"] == SOURCES["56_1_front"].source_quote


def test_values_recomputed_on_server(explain):
    d = explain({"question": Q1})
    assert "3.6 m" in d["summary"] and "Rule 56(1)(a)" in d["summary"]
    assert d["target"]["kind"] == "result" and d["target"]["label"] == Q1
    assert [(c["rule"], c["page"], c["verified_table"]) for c in d["citations"]] == [("56", 77, True)]
    # Values stated in the question are the most specific statement of the case (same merge as /api/answer).
    d = explain({"question": Q1, "inputs": {"road_width_m": 30, "building_height_m": 9, "building_use": "residential"}})
    assert "3.6 m" in d["summary"]
    d = explain({"calc_types": ["front_open_space"], "inputs": {"road_width_m": 15, "building_height_m": 10, "building_use": "residential"}})
    assert "4.5 m" in d["summary"] and d["target"]["label"] == "Evaluated requirement: Minimum front open space"


def test_no_key_gives_grounded_basic_explanation(explain):
    d = explain({"question": Q1})
    assert d["source"] == "basic" and d["fallback_reason"] == "not_configured" and d["model"] is None
    keys = [s["key"] for s in d["sections"]]
    assert 0 < len(keys) <= 3 and keys == [k for k in SECTION_ORDER if k in keys]
    assert "Rule 56(1)(a)" in section(d, "meaning") and "3.6 m" in section(d, "calculation")
    assert all(s["text"].strip() for s in d["sections"])
    assert d["disclosures"] and "no AI" in d["disclosures"][0]


def test_use_ai_false_is_ai_disabled(ai):
    d, fake = ai([VALID_Q1], {"question": Q1, "use_ai": False})
    assert fake.calls == 0 and d["source"] == "basic" and d["fallback_reason"] == "ai_disabled"


def test_focused_constraint_basic(explain):
    d = explain({**FRONT, "detail": "detailed"})
    t = d["target"]
    assert (t["kind"], t["calc_type"], t["side"], t["status"]) == ("constraint", "front_open_space", "front", "VERIFIED")
    assert t["label"] == "Front open space ≥ 3 m — Rule 56(1)(a)"
    assert "is below this minimum" in section(d, "building_impact") and "not an approval" in section(d, "building_impact")
    assert [c["chunk_id"] for c in d["citations"]] == ["verified:56_1_front"]


def test_unresolved_constraint_and_site_focus(explain):
    d = explain({"focus": {"calc_type": "front_open_space", "side": "front"}})
    assert d["target"]["label"] == "Front open space — unresolved" and d["target"]["status"] == "MORE_INFORMATION_NEEDED"
    assert "width of street facing the plot" in section(d, "next_step")
    d = explain({"focus": {"calc_type": "site_open_spaces"}, "inputs": SITE})
    assert d["target"]["kind"] == "calculation" and len(d["citations"]) == 3


def test_building_focus(explain):
    d = explain({"focus": {"element": "building"}, "inputs": SITE, "detail": "detailed"})  # zones from the default calcs
    assert d["target"] == {"kind": "element", "label": "Proposed building (illustrative)", "status": "ILLUSTRATIVE_ONLY",
                           "calc_type": None, "side": None, "element": "building"}
    impact = section(d, "building_impact")
    assert "6 m wide" in impact and "Proposed right gap 1 m against the computed minimum 1.5 m: is below this minimum" in impact
    assert not re.search(r"\b(?:compliant|approved|legal|permitted)\b", text_of(d), re.I)
    bare = {k: v for k, v in SITE.items() if k not in ("building_width_m", "building_depth_m")}
    d = explain({"focus": {"element": "building"}, "inputs": bare})
    assert "not drawn because building width and building depth are not entered" in d["summary"]


def test_road_focus_mentions_narrow_street_rule(explain):
    d = explain({"focus": {"element": "road"}, "inputs": {"road_width_m": 5}, "detail": "detailed"})
    assert d["target"]["label"] == "Street facing the plot"
    assert "Rule 56(1)(b)" in section(d, "meaning") and "street width 5 m" in d["summary"]


# ---------------------------------------------------------------------- AI failures and validation
@pytest.mark.parametrize("exc,reason", [
    (APITimeoutError("timed out"), "timeout"),
    (TimeoutError(), "timeout"),
    (RateLimitError("429"), "rate_limited"),
    (APIConnectionError("down"), "network"),
    (ConnectionError(), "network"),
    (AuthenticationError("bad key"), "auth"),
    (NotFoundError("model gpt-oss-120b not found"), "model_unavailable"),
    (RuntimeError("boom"), "unavailable"),
])
def test_model_failures_fall_back_with_reason(ai, exc, reason):
    d, fake = ai([exc], {"question": Q1})
    assert fake.calls == 1
    assert d["source"] == "basic" and d["fallback_reason"] == reason and d["model"] is None
    assert "3.6 m" in d["summary"]


@pytest.mark.parametrize("reply", [
    "Sure! The answer is 3.6 m",
    '{"summary": "The minimum is 3.6 m",',
    "[1, 2]",
    '{"text": "missing summary"}',
    '{"summary": "   ", "meaning": "The quoted rule text sets the minimum front open space at 3.6 m."}',
    '{"summary": "null", "meaning": "The quoted rule text sets the minimum front open space at 3.6 m."}',
    '{"summary": "3.6 m"}',
    '{"summary": "' + "a" * 451 + '"}',
    '{"summary": "The minimum front open space is 3.6 m.", "meaning": "' + "b" * 601 + '"}',
    json.dumps({"summary": "The minimum front open space is 3.6 m.", "citations": [f"E{i}" for i in range(1, 10)]}),
    '{"summary": "The minimum front open space is 3.6 m.", "meaning": {"text": "nested"}}',
])
def test_malformed_output_is_invalid_response(ai, reply):
    d, _ = ai([reply], {"question": Q1})
    assert d["source"] == "basic" and d["fallback_reason"] == "invalid_response"


@pytest.mark.parametrize("out,lang", [
    ({"summary": "The minimum front open space is 5 m under Rule 56(1)(a).", "citations": ["E1"]}, "en"),       # invented number
    ({"summary": "The minimum front open space is 3.6 m under Rule 56(1)(a).", "citations": ["E7"]}, "en"),     # unknown evidence id
    ({"summary": "The minimum front open space is 3.6 m under Rule 10 of the rules."}, "en"),                   # unknown rule
    ({"summary": "The minimum front open space is 3.6 m; see also R9 for this case."}, "en"),                   # unknown rule, R-style
    ({"summary": "The minimum front open space is <b>3.6 m</b> under Rule 56(1)(a)."}, "en"),                   # HTML
    ({"summary": "The minimum front open space is 3.6 m.", "meaning": "<script>alert(1)</script>"}, "en"),      # script
    ({"summary": "The minimum front open space is 3.6 m.", "next_step": "Open javascript:alert(1) now."}, "en"),
    ({"summary": "```The minimum front open space is 3.6 m.```"}, "en"),                                         # code fence
    ({"summary": "The building is compliant with Rule 56(1)(a) at 3.6 m."}, "en"),                              # approval claim
    ({"summary": "The plan complies with Rule 56(1)(a): the minimum is 3.6 m."}, "en"),
    ({"summary": "With 3.6 m at the front, your building is legal under Rule 56(1)(a)."}, "en"),
    ({"summary": "The minimum front open space is 3.6 m under Rule 56(1)(a)."}, "hi"),                          # wrong language
    ({"summary": "न्यूनतम सामने की खुली जगह 3.6 मीटर है (नियम 56(1)(a)), इसलिए नक्शा स्वीकृत है।"}, "hi"),        # Hindi approval claim
    ({"summary": "न्यूनतम सामने की खुली जगह 3.6 मीटर है, नियम 56(1)(a) के अनुसार।"}, "en"),                      # wrong language
])
def test_ungrounded_output_is_rejected(ai, out, lang):
    d, fake = ai([json.dumps(out, ensure_ascii=False)], {"question": Q1, "language": lang})
    assert fake.calls == 1
    assert d["source"] == "basic" and d["fallback_reason"] == "rejected"
    assert d["language"] == lang and "3.6" in d["summary"]


def test_hedged_statement_is_not_an_approval_claim(ai):
    out = {"summary": "The minimum front open space is 3.6 m under Rule 56(1)(a). This does not mean the plan is approved.",
           "citations": ["E1"]}
    d, _ = ai([json.dumps(out)], {"question": Q1})
    assert d["source"] == "ai"


def test_valid_ai_output_accepted(ai):
    d, fake = ai([VALID_Q1], {"question": Q1})
    assert d["source"] == "ai" and d["fallback_reason"] is None and d["model"] == "gpt-oss-120b"
    assert d["summary"] == "The minimum front open space is 3.6 m under Rule 56(1)(a), PDF p. 77."  # markdown stripped
    assert [s["key"] for s in d["sections"]] == ["meaning", "calculation"]  # "null" dropped, schema order kept
    assert section(d, "meaning").startswith("The quoted rule text") and "(E1)" not in section(d, "calculation")
    # Sources are the server's evidence objects, never model-supplied.
    assert [(c["chunk_id"], c["passage"]) for c in d["citations"]] == [("verified:56_1_front", SOURCES["56_1_front"].source_quote)]
    assert d["statuses"] == ["CALCULATION_COMPLETED", "VERIFIED"] and d["primary_status"] == "CALCULATION_COMPLETED"
    assert any("AI" in x for x in d["disclosures"])
    kw = fake.kwargs[0]
    assert kw["temperature"] == 0.1 and kw["max_completion_tokens"] == 1600 and kw["model"] == "gpt-oss-120b"
    assert "never say a building or plan is approved" in kw["messages"][0]["content"].lower()
    d, fake = ai([VALID_Q1.replace('["E1"]', "[]")], {"question": Q1, "detail": "detailed"})
    assert d["source"] == "ai" and d["citations"][0]["chunk_id"] == "verified:56_1_front"
    assert fake.kwargs[0]["max_completion_tokens"] == 2400


def test_minimal_context_for_focused_constraint(ai):
    body = {**FRONT, "calc_types": ["site_open_spaces", "building_permission_fee", "electric_line_clearance"],
            "citation_ids": ["verified:21_3_b_fee", "52#0"],
            "inputs": {**SITE, "built_up_area_sqm": 120, "voltage_class": "low_medium"}}
    out = {"summary": "The minimum front open space is 3 m under Rule 56(1)(a); the proposed front gap of 2 m is below this minimum.",
           "building_impact": "The drawn front gap is below this minimum.", "citations": ["E1"]}
    d, fake = ai([json.dumps(out)], body)
    assert d["source"] == "ai" and [c["chunk_id"] for c in d["citations"]] == ["verified:56_1_front"]
    p = fake.payload()
    user = fake.kwargs[0]["messages"][1]["content"]
    assert [e["id"] for e in p["evidence"]] == ["E1"] and p["evidence"][0]["rule"] == "Rule 56(1)(a)"
    assert [c["label"] for c in p["calculations"]] == ["Minimum front open space"]
    assert p["selected_zone"]["check"] == "below_minimum" and p["selected_zone"]["proposed_gap_m"] == 2.0
    assert set(p["inputs"]) == {"road_width_m", "building_use", "building_height_m"}
    for unrelated in ("Rule 21", "Rule 52", "Rule 56(2)", "Rule 56(3)", "voltage", "fee", "built_up_area", "Rear"):
        assert unrelated not in user, unrelated
    assert all(len(e["text"]) <= PASSAGE_CHARS for e in p["evidence"])


def test_element_payload_is_summarised_and_truncated(ai):
    d, fake = ai(['{"summary": "The drawn front gap of 2 m is below the computed minimum of 3 m.", "citations": ["E1"]}'],
                 {"focus": {"element": "building"}, "inputs": SITE})
    p = fake.payload()
    assert d["source"] == "ai" and d["target"]["status"] == "ILLUSTRATIVE_ONLY"
    assert {z["side"] for z in p["zones"]} == {"front", "rear", "left", "right"} and "calculations" not in p
    assert set(p["inputs"]) <= {"building_width_m", "building_depth_m", "building_height_m", "front_gap_m", "left_gap_m",
                                "plot_width_m", "plot_depth_m"}
    assert len(p["evidence"]) == 3 and all(len(e["text"]) <= ELEMENT_PASSAGE_CHARS for e in p["evidence"])
    long = "word " * 400
    assert len(clip(long, 600)) <= 600 and clip(long, 600).endswith("word ...") and clip("short  text", 600) == "short text"


def test_result_payload_limits(ai, ask):
    ids = [c["chunk_id"] for c in ask(SIGN_Q)["citations"]]
    _, fake = ai(["not json"], {"question": SIGN_Q, "citation_ids": ids + ["verified:56_1_front"]})
    p = fake.payload()
    assert len(p["evidence"]) == 4 and p["evidence"][0]["pdf_verified_table"] is True  # verified tables first
    assert all(len(e["text"]) <= PASSAGE_CHARS for e in p["evidence"])


def test_not_found_never_calls_model(ai):
    for lang, head in (("en", NOT_FOUND_EN), ("hi", NOT_FOUND_HI)):
        d, fake = ai([VALID_Q1], {"question": TAX_Q, "language": lang, "detail": "detailed"})
        assert fake.calls == 0
        assert d["source"] == "basic" and d["fallback_reason"] == "not_found"
        assert d["primary_status"] == "NOT_FOUND" and d["citations"] == [] and d["warnings"] == []
        assert d["summary"].startswith(head)
        assert [s["key"] for s in d["sections"]] == ["uncertainty", "next_step"]
    assert "property tax" in ai([], {"question": TAX_Q})[0]["summary"]


def test_fee_without_inputs_needs_information(explain):
    d = explain({"question": FEE_Q, "detail": "detailed"})
    assert d["primary_status"] == "MORE_INFORMATION_NEEDED"
    assert {m["field"] for m in d["missing_inputs"]} >= {"built_up_area_sqm"}
    assert "Proposed built-up area" in section(d, "uncertainty")
    assert "built-up area" in section(d, "next_step")
    assert d["citations"][0]["rule"] == "21"
    # The schedule is quoted from the engine; no fee for this case is computed.
    assert "Rs. 1,250" not in text_of(d) and "cannot be determined yet" in d["summary"]


def test_version_warning_basic_and_ai(ai, ask, explain):
    ids = [c["chunk_id"] for c in ask(V11)["citations"]]
    for body in ({"question": V11, "citation_ids": ids}, {"question": V11}):
        d = explain({**body, "detail": "detailed"})
        assert [w["code"] for w in d["warnings"]] == ["AMENDMENT_2026_RULE_2_5_C"]
        assert "VERSION_REVIEW_NEEDED" in d["statuses"]
        assert "2026" in section(d, "uncertainty") and "6 March 2025" in section(d, "uncertainty")
        assert "official notification" in section(d, "next_step")
    d = explain({"question": V11, "citation_ids": ids, "language": "hi"})
    assert "28 अगस्त 2026" in section(d, "uncertainty") and "6 मार्च 2025" in section(d, "uncertainty")
    out = {"summary": "The quoted rule text concerns development permission; MIRA has not applied it to this case.",
           "uncertainty": "MIRA has not applied the quoted rule text to this case.", "citations": ["E1"]}
    d, _ = ai([json.dumps(out)], {"question": V11, "citation_ids": ids})
    assert d["source"] == "ai" and "VERSION_REVIEW_NEEDED" in d["statuses"]
    assert "2026" in section(d, "uncertainty") and "Rule 2(5)(c)" in section(d, "uncertainty")
    out.pop("uncertainty")
    d, _ = ai([json.dumps(out)], {"question": V11, "citation_ids": ids})
    assert "2026" in section(d, "uncertainty")


def test_hindi_explanations(ai, explain):
    d = explain({"question": HI_Q, "language": "hi", "detail": "detailed"})
    assert d["language"] == "hi" and re.search(r"[ऀ-ॿ]", d["summary"])
    assert HINDI_DISCLOSURE in d["disclosures"] and any(w["code"] == "HINDI_TEXT_PREVAILS" for w in d["warnings"])
    assert "नियम 56(1)(a)" in d["summary"] and "भवन की ऊंचाई" in section(d, "uncertainty")
    d = explain({"question": Q1, "language": "hi", "detail": "detailed"})
    assert "3.6 मीटर" in d["summary"] and "गणना के चरण अंग्रेज़ी में" in section(d, "calculation")
    out = {"summary": "न्यूनतम सामने की खुली जगह 3.6 मीटर है (नियम 56(1)(a), PDF पृष्ठ 77)।",
           "meaning": "उद्धृत नियम पाठ के अनुसार यह दूरी सड़क की चौड़ाई पर निर्भर है।", "citations": ["E1"]}
    d, _ = ai([json.dumps(out, ensure_ascii=False)], {"question": Q1, "language": "hi"})
    assert d["source"] == "ai" and d["summary"] == out["summary"] and HINDI_DISCLOSURE in d["disclosures"]


def test_brief_and_detailed_basic_differ(explain):
    for body in ({"question": Q1}, {"question": FEE_Q}, FRONT, {"focus": {"element": "building"}, "inputs": SITE}):
        brief, detailed = explain({**body, "detail": "brief"}), explain({**body, "detail": "detailed"})
        assert len(brief["sections"]) <= 3 < len(detailed["sections"])
        assert len(text_of(brief)) < len(text_of(detailed))
        assert brief["detail"] == "brief" and detailed["detail"] == "detailed"


def test_rate_limit_falls_back(store):
    app = _app_with_key(explain_rate_per_minute=1)
    with TestClient(app) as tc:
        fake = Recorder([VALID_Q1, VALID_Q1])
        app.state.llm._client = SimpleNamespace(chat=SimpleNamespace(completions=fake))
        first = tc.post("/api/explain", json={"question": Q1}).json()
        second = tc.post("/api/explain", json={"question": Q1}).json()
        basic = tc.post("/api/explain", json={"question": Q1, "use_ai": False}).json()
    assert first["source"] == "ai" and fake.calls == 1
    assert second["source"] == "basic" and second["fallback_reason"] == "rate_limited" and "3.6 m" in second["summary"]
    assert basic["fallback_reason"] == "ai_disabled"


# ---------------------------------------------------------------------- the basic explanation invents nothing
SCENARIOS = [
    {"question": Q1},
    {"question": FEE_Q},
    {"question": FEE_Q, "inputs": {"built_up_area_sqm": 120, "building_height_m": 7, "storeys": 2}},
    {"question": FEE_Q, "inputs": {"built_up_area_sqm": 75.5}},
    {"question": HI_Q},
    {"question": TAX_Q},
    {"question": SIGN_Q},
    {"question": V11},
    {"question": "How far must my balcony stay from a low-voltage overhead electric line, vertically and horizontally?"},
    {"question": "What is the minimum front open space for a shop on a 12 m road?"},
    FRONT,
    {"focus": {"calc_type": "side_open_space", "side": "right"}, "inputs": SITE},
    {"focus": {"calc_type": "rear_open_space", "side": "rear"}, "inputs": {**SITE, "plot_depth_m": 12}},
    {"focus": {"calc_type": "side_open_space", "side": "left"},
     "inputs": {"building_height_m": 20, "storeys": 5, "road_width_m": 20, "plot_area_sqm": 1600, "plot_width_m": 25}},
    {"focus": {"calc_type": "front_open_space"}, "inputs": {"building_height_m": 20, "road_width_m": 10}},
    {"focus": {"element": "building"}, "inputs": SITE},
    {"focus": {"element": "building"}, "inputs": {"road_width_m": 9}},
    {"focus": {"element": "plot"}, "inputs": SITE},
    {"focus": {"element": "road"}, "inputs": {"road_width_m": 5}},
    {"calc_types": ["site_open_spaces"], "inputs": {**SITE, "building_type": "semi_detached"}},
    {"calc_types": ["building_permission_fee"], "inputs": {"built_up_area_sqm": 900, "building_use": "cinema",
                                                           "building_height_m": 9, "storeys": 2, "seating_capacity": 900}},
]


@pytest.mark.parametrize("lang", ["en", "hi"])
@pytest.mark.parametrize("detail", ["brief", "detailed"])
@pytest.mark.parametrize("body", SCENARIOS)
def test_basic_explanation_is_grounded(client, explain, body, lang, detail):
    req = {**body, "language": lang, "detail": detail}
    d = explain(req)
    ctx = client.app.state.explainer.context(ExplainRequest.model_validate(req))
    context, text = trusted_text(ctx), text_of(d)
    assert d["source"] == "basic" and text.strip()
    assert numbers_supported(text, context), (text, context)
    allowed = rule_refs(context) | {top_rule(c.rule) for c in ctx.citations + [x for c in ctx.calcs for x in c.citations]}
    assert rule_refs(text) <= allowed, rule_refs(text) - allowed
    assert pages_in(text) <= {c.page for c in ctx.citations + [x for c in ctx.calcs for x in c.citations]} | pages_in(context)
    assert not re.search(r"\b(?:is|are) (?:compliant|approved|legal|permitted)\b", text, re.I)
    assert chr(0x2192) not in text and chr(0x2022) not in text  # no arrow/bullet glyphs in narrated text
    if lang == "hi":
        assert re.search(r"[ऀ-ॿ]", d["summary"])
