import json

import pytest

from app.rules.loader import RuleDataError, load_records, normalize_rule_id
from app.rules.verified_tables import SOURCES, verify_against_store


def test_all_records_load(store):
    assert len(store.records) == 106
    assert "26-B" in store.records
    assert set(str(n) for n in range(1, 106)) <= set(store.records)
    assert len(store.pages) == 108


def test_every_passage_is_on_its_stated_page(store):
    for c in store.chunks:
        first = c.text.strip().splitlines()[0][:60]
        assert store.page_contains(c.page, first), (c.chunk_id, c.page)


def test_running_headers_are_removed_from_passages(store):
    assert not any("M.P. Bhumi Vikas Rules, 2012" in c.text and c.text.strip().startswith("Rule ") for c in store.chunks)


def test_page_split_inside_rule_56(store):
    pages = {c.page for c in store.chunks_for("56")}
    assert {77, 78}.issubset(pages)
    rear = [c for c in store.chunks_for("56") if "Rear Open Space" in c.text]
    assert rear and rear[0].page == 78


def test_embedded_rules_are_located(store):
    rec, chunk = store.find_embedded("12-A")
    assert rec.rule == "12" and "186" in chunk.text and chunk.page == 21
    rec, chunk = store.find_embedded("17-a")
    assert rec.rule == "17" and "Agricultural tourist facility" in chunk.text


@pytest.mark.parametrize("raw,norm", [("56", "56"), ("26b", "26-B"), ("26-B", "26-B"), ("12 A", "12-A"), ("007", "7"), ("x", None)])
def test_normalize_rule_id(raw, norm):
    assert normalize_rule_id(raw) == norm


def test_malformed_jsonl_is_rejected(tmp_path):
    p = tmp_path / "bad.jsonl"
    p.write_text('{"rule": "1", "title": "x"}\n', encoding="utf-8")
    with pytest.raises(RuleDataError):
        load_records(p)
    p.write_text("not json\n", encoding="utf-8")
    with pytest.raises(RuleDataError):
        load_records(p)
    with pytest.raises(RuleDataError):
        load_records(tmp_path / "missing.jsonl")


def test_duplicate_rule_rejected(tmp_path):
    rec = {"rule": "1", "title": "t", "part": "p", "page_start": 1, "page_end": 1, "text": "x"}
    p = tmp_path / "dup.jsonl"
    p.write_text(json.dumps(rec) + "\n" + json.dumps(rec) + "\n", encoding="utf-8")
    with pytest.raises(RuleDataError):
        load_records(p)


def test_verified_sources_match_data(store):
    status = verify_against_store(store)
    assert status == {k: True for k in SOURCES}
