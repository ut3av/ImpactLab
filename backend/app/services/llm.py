"""Optional Cerebras inference. Every function returns None on any failure; callers fall back.

The model never supplies legal values: it only rephrases retrieved text and deterministic
results. Its output is parsed as JSON, schema-validated, and rejected if it cites passages that
were not supplied or states numbers that do not appear in the supplied evidence.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.config import Settings

log = logging.getLogger("niyamlens.llm")


class ExplainOut(BaseModel):
    answer: str = Field(min_length=1, max_length=1500)
    citations: list[str] = Field(default_factory=list, max_length=10)


class TermsOut(BaseModel):
    terms: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("terms")
    @classmethod
    def _clean(cls, v: list[str]) -> list[str]:
        return [t.strip()[:40] for t in v if isinstance(t, str) and t.strip() and t.isascii()]


class LLMClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: Any = None
        self.last_error: str | None = None

    @property
    def available(self) -> bool:
        return self.settings.ai_configured

    @property
    def model(self) -> str:
        return self.settings.cerebras_model

    def _get(self):
        if self._client is None:
            from cerebras.cloud.sdk import Cerebras

            self._client = Cerebras(
                api_key=self.settings.cerebras_api_key.get_secret_value(),
                timeout=self.settings.cerebras_timeout_s,
                max_retries=1,
            )
        return self._client

    def _chat_json(self, system: str, user: str, max_tokens: int = 900) -> dict | None:
        if not self.available:
            return None
        try:
            resp = self._get().chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                max_completion_tokens=max_tokens,
                temperature=0.1,
            )
            content = resp.choices[0].message.content or ""
        except Exception as exc:  # network, auth, rate limit, timeout, SDK errors
            self.last_error = type(exc).__name__
            log.warning("Cerebras request failed: %s", type(exc).__name__)
            return None
        m = re.search(r"\{.*\}", content, re.S)
        if not m:
            self.last_error = "no_json"
            return None
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            self.last_error = "bad_json"
            return None

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
            "You are NIYAMLENS, assisting a municipal building-permission clerk in Bhopal. Write a short answer "
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
