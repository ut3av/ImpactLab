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
