"""End-to-end behaviour of the answer pipeline on the supplied sample questions (no AI)."""
import re
from pathlib import Path

import pytest

from app.config import REPO_ROOT

SAMPLES = {
    int(m.group(1)): m.group(2).strip()
    for m in re.finditer(r"(?m)^(\d+)\.\s+(.+)$", (REPO_ROOT / "resources" / "sample_questions.md").read_text(encoding="utf-8"))
}


def rules(d):
    return [c["rule"] for c in d["citations"]]


def test_samples_file_has_17_questions():
    assert len(SAMPLES) == 17


def test_every_citation_is_real(ask, store):
    for q in SAMPLES.values():
        d = ask(q)
        for c in d["citations"]:
            rec = store.records.get(c["rule"]) or store.find_embedded(c["rule"])
            assert rec, c["rule"]
            assert store.page_contains(c["page"], c["passage"].splitlines()[0]), (q, c["rule"], c["page"])


def test_q1_front_open_space(ask):
    d = ask(SAMPLES[1])
    calc = d["calculations"][0]
    assert calc["value"] == 3.6 and calc["status"] == "VERIFIED"
    assert d["citations"][0]["rule"] == "56" and d["citations"][0]["page"] == 77
    assert "VERIFIED" in d["statuses"] and d["language"] == "en"


def test_q5_electric(ask):
    d = ask(SAMPLES[5])
    assert d["calculations"][0]["breakdown"] == {"vertical_m": 2.5, "horizontal_m": 1.2}


def test_q10_rear_needs_height(ask):
    d = ask(SAMPLES[10])
    assert d["primary_status"] == "MORE_INFORMATION_NEEDED"
    assert d["calculations"][0]["value"] is None
    assert any("1.5 m" in c["result"] for c in d["calculations"][0]["conditional_results"])
    d = ask(SAMPLES[10], inputs={"building_height_m": 7})
    assert d["calculations"][0]["value"] == 1.5


def test_q8_fee_needs_area(ask):
    d = ask(SAMPLES[8])
    assert d["primary_status"] == "MORE_INFORMATION_NEEDED"
    assert "21" == d["citations"][0]["rule"]
    d = ask(SAMPLES[8], inputs={"built_up_area_sqm": 120, "building_height_m": 7, "storeys": 2})
    assert d["calculations"][0]["value"] == 1250


@pytest.mark.parametrize("n,rule", [(2, "17"), (3, "23"), (4, "28"), (6, "18"), (7, "16"), (9, "24"), (12, "103"), (13, "83")])
def test_retrieval_only_samples_cite_expected_rule(ask, n, rule):
    d = ask(SAMPLES[n])
    assert rules(d)[0] == rule
    assert d["primary_status"] == "SOURCE_FOUND"
    assert d["calculations"] == []


def test_q11_flags_version_review(ask):
    d = ask(SAMPLES[11])
    assert "VERSION_REVIEW_NEEDED" in d["statuses"]
    assert d["warnings"][0]["code"] == "AMENDMENT_2026_RULE_2_5_C"


def test_version_warning_not_overused(ask):
    assert ask(SAMPLES[3])["warnings"] == []
    assert ask(SAMPLES[1])["warnings"] == []


def test_q14_hindi_front(ask):
    d = ask(SAMPLES[14])
    assert d["language"] == "hi"
    assert d["extracted_inputs"]["plot_area_sqm"] == 200 and d["extracted_inputs"]["road_width_m"] == 9
    assert d["primary_status"] == "MORE_INFORMATION_NEEDED"
    assert re.search(r"[ऀ-ॿ]", d["answer"]["text"])
    assert any(w["code"] == "HINDI_TEXT_PREVAILS" for w in d["warnings"])
    d = ask(SAMPLES[14], inputs={"building_height_m": 9, "building_use": "residential"})
    assert d["calculations"][0]["value"] == 3.0


def test_q15_hindi_fee_names_rule(ask):
    d = ask(SAMPLES[15])
    assert d["language"] == "hi" and d["citations"][0]["rule"] == "21"
    assert "21" in d["answer"]["text"]


@pytest.mark.parametrize("n", [16, 17])
def test_out_of_scope_not_found(ask, n):
    d = ask(SAMPLES[n])
    assert d["primary_status"] == "NOT_FOUND"
    assert d["answer"]["text"].startswith("Not found in the supplied rules.")
    assert d["citations"] == [] and d["calculations"] == []


def test_gibberish_not_found(ask):
    d = ask("xyzzy quux blorf")
    assert d["primary_status"] == "NOT_FOUND"


def test_direct_rule_lookup_in_question(ask):
    d = ask("What does Rule 26-B say?")
    assert rules(d)[0] == "26-B"
    d = ask("नियम 52 क्या है?")
    assert "52" in rules(d)


def test_template_source_when_no_ai(ask):
    d = ask(SAMPLES[1])
    assert d["answer"]["source"] == "template" and d["ai_available"] is False


def test_form_inputs_combined_with_question(ask):
    d = ask("What is the minimum front open space?", inputs={"road_width_m": 15, "building_height_m": 10, "building_use": "residential"})
    assert d["calculations"][0]["value"] == 4.5
