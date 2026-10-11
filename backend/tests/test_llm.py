"""AI layer: failures fall back safely; invalid or ungrounded output is rejected."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.llm import LLMClient, numbers_supported
from tests.conftest import make_settings

Q1 = "My house faces a 10 m wide street and will be 9 m tall. How much open space do I leave at the front?"


class FakeCompletions:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def create(self, **kw):
        self.calls += 1
        r = self.replies.pop(0) if self.replies else RuntimeError("no more")
        if isinstance(r, Exception):
            raise r
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=r))])


def client_with(replies):
    app = create_app(make_settings(cerebras_api_key="test-key-not-real"))
    tc = TestClient(app)
    tc.__enter__()
    fake = FakeCompletions(replies)
    app.state.llm._client = SimpleNamespace(chat=SimpleNamespace(completions=fake))
    return tc, fake


def test_numbers_guard():
    assert numbers_supported("Leave 3.6 m (Rule 56).", "3.6 meters Rule 56")
    assert not numbers_supported("Leave 4 m.", "3.6 meters")
    assert numbers_supported("रु. 2,000", "2,000")


def test_ai_answer_used_when_valid():
    tc, fake = client_with(['{"answer": "Leave at least 3.6 m at the front (Rule 56(1)).", "citations": ["E1"]}'])
    d = tc.post("/api/answer", json={"question": Q1}).json()
    assert d["answer"]["source"] == "ai" and "3.6" in d["answer"]["text"]
    assert d["calculations"][0]["value"] == 3.6  # deterministic value unaffected
    tc.__exit__(None, None, None)


@pytest.mark.parametrize("reply", [
    '{"answer": "Leave 5 m at the front.", "citations": ["E1"]}',        # invented number
    '{"answer": "Leave 3.6 m.", "citations": ["E99"]}',                  # unknown citation
    'Sure! The answer is 3.6 m',                                          # not JSON
    '{"text": "missing answer field"}',                                   # schema violation
    RuntimeError("upstream 429"),                                         # API failure / rate limit
])
def test_ai_failures_fall_back_to_template(reply):
    tc, fake = client_with([reply])
    d = tc.post("/api/answer", json={"question": Q1}).json()
    assert d["answer"]["source"] == "template"
    assert d["calculations"][0]["value"] == 3.6
    assert "unavailable or rejected" in d["answer"]["note"]
    tc.__exit__(None, None, None)


def test_use_ai_false_skips_model():
    tc, fake = client_with(['{"answer": "x", "citations": []}'])
    d = tc.post("/api/answer", json={"question": Q1, "use_ai": False}).json()
    assert fake.calls == 0 and d["answer"]["source"] == "template"
    tc.__exit__(None, None, None)


def test_not_found_never_calls_model():
    tc, fake = client_with(['{"answer": "Pay at the portal.", "citations": []}'])
    d = tc.post("/api/answer", json={"question": "How do I pay my property tax online?"}).json()
    assert d["primary_status"] == "NOT_FOUND" and fake.calls == 0
    tc.__exit__(None, None, None)


def test_client_unavailable_without_key():
    assert LLMClient(make_settings()).available is False
    assert LLMClient(make_settings()).explain("q", "en", [], []) is None


def test_health_never_leaks_key():
    tc, _ = client_with([])
    body = tc.get("/api/health").text + tc.get("/api/sources").text
    assert "test-key-not-real" not in body
    assert tc.get("/api/health").json()["ai_configured"] is True
    tc.__exit__(None, None, None)


# ---------------------------------------------------------------------- explain helpers (POST /api/explain)
def test_classify_error_by_name_and_status():
    from app.services.llm import classify_error

    def err(name, **attrs):
        e = type(name, (Exception,), {})("x")
        for k, v in attrs.items():
            setattr(e, k, v)
        return e

    assert classify_error(err("APITimeoutError")) == "timeout"
    assert classify_error(TimeoutError()) == "timeout"
    assert classify_error(err("RateLimitError")) == "rate_limited"
    assert classify_error(err("APIStatusError", status_code=429)) == "rate_limited"
    assert classify_error(err("APIConnectionError")) == "network"
    assert classify_error(ConnectionResetError()) == "network"
    assert classify_error(err("PermissionDeniedError")) == "auth"
    assert classify_error(err("APIStatusError", status_code=401)) == "auth"
    assert classify_error(err("NotFoundError")) == "model_unavailable"
    assert classify_error(type("BadRequestError", (Exception,), {})("model 'x' does not exist")) == "model_unavailable"
    assert classify_error(type("BadRequestError", (Exception,), {})("bad max tokens")) == "unavailable"
    assert classify_error(ValueError("other")) == "unavailable"


def test_chat_json_result_returns_reason_without_shared_state():
    llm = LLMClient(make_settings(cerebras_api_key="test-key-not-real"))
    llm._client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions([type("RateLimitError", (Exception,), {})(), "no json", '{"a": 1}'])))
    assert llm._chat_json_result("s", "u") == (None, "rate_limited")
    assert llm._chat_json_result("s", "u") == (None, "invalid_response")
    assert llm._chat_json_result("s", "u") == ({"a": 1}, None)
    assert llm.last_error is None
    assert LLMClient(make_settings())._chat_json_result("s", "u") == (None, "not_configured")
    assert LLMClient(make_settings()).explain_sections({}, "en", "brief", [], "", set()) == (None, "not_configured")


def test_rule_refs():
    from app.services.llm import rule_refs

    assert rule_refs("Rule 56(1)(a), Rules 21 and 57, R52, नियम 2(38), Rule 26-B, Rule 12A") == {"56", "21", "57", "52", "2", "26-B", "12-A"}
    assert rule_refs("Rule 56 and 12.5 m; Rule 42 Table 4 or 5") == {"56", "42"}
    assert rule_refs("for 56, per 3, Rs. 750, sector 9, 3.6 m") == set()


def test_approval_claims():
    from app.services.llm import approval_claim

    for claim in ("The plan is approved.", "The building is fully compliant.", "It complies with Rule 56.",
                  "Your building is legal.", "This plan will be permitted.", "नक्शा स्वीकृत है।"):
        assert approval_claim(claim), claim
    for ok in ("This does not mean the plan is approved.", "MIRA cannot say whether it is approved.",
               "It does not comply with Rule 56.", "The building must comply with Rule 56.",
               "The gap meets this minimum.", "यह नहीं कहा जा सकता कि नक्शा स्वीकृत है।"):
        assert not approval_claim(ok), ok


def test_explain_output_normalised():
    from app.services.llm import ExplainSectionsOut

    out = ExplainSectionsOut.model_validate({"summary": "  **Leave** `3.6 m`\n- at the front (E1). ", "meaning": "N/A",
                                             "calculation": ["Step one.", "Step two."], "uncertainty": "none", "x": 1})
    assert out.summary == "Leave 3.6 m at the front." and out.meaning is None and out.uncertainty is None
    assert out.calculation == "Step one. Step two." and out.citations == []
