"""Loads the supplied rule JSONL and page text, and splits rules into page-accurate passages.

The JSONL `text` field contains the PDF running headers (e.g. ``Rule 56   M.P. Bhumi Vikas
Rules, 2012   78``). They are not rule content, but they mark exact page breaks, so they are
used to assign each passage the PDF page it actually appears on, then removed.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

HEADER_RE = re.compile(r"^\s*Rule[s]?\s+[0-9A-Za-z\-–, ]+?\s+M\.P\. Bhumi Vikas Rules, 2012\s+(\d+)\s*$")
PAGE_MARK_RE = re.compile(r"^===== PDF page (\d+) =====\s*$", re.M)
SUBRULE_START_RE = re.compile(r"^\s{2,}(?:\d{1,3}\s*\[)?\((\d{1,2}|[a-z]{1,2}|[ivx]{1,5})\)\s")
RULE_ID_RE = re.compile(r"^\s*(\d{1,3})\s*-?\s*([A-Za-z])?\s*$")

REQUIRED_FIELDS = ("rule", "title", "part", "page_start", "page_end", "text")


class RuleDataError(RuntimeError):
    pass


@dataclass
class RuleRecord:
    rule: str
    title: str
    part: str
    page_start: int
    page_end: int
    text: str


@dataclass
class Chunk:
    chunk_id: str
    rule: str
    title: str
    page: int
    text: str
    sub_rule: str | None = None
    is_comment: bool = False


@dataclass
class RuleStore:
    records: dict[str, RuleRecord]
    chunks: list[Chunk]
    pages: dict[int, str]
    order: list[str] = field(default_factory=list)

    def get(self, rule_id: str) -> RuleRecord | None:
        norm = normalize_rule_id(rule_id)
        return self.records.get(norm) if norm else None

    def chunks_for(self, rule_id: str) -> list[Chunk]:
        return [c for c in self.chunks if c.rule == rule_id]

    def find_embedded(self, rule_id: str) -> tuple[RuleRecord, Chunk] | None:
        """Locate an inserted rule (e.g. 12-A, 17-a) printed inside its parent rule's text."""
        m = RULE_ID_RE.match(rule_id.replace("–", "-"))
        if not m or not m.group(2):
            return None
        num, letter = m.group(1), m.group(2)
        parent = self.records.get(num)
        if not parent:
            return None
        pat = re.compile(rf"(?m)^\s*(?:\d\s*\[)?\[?{num}\s*-?\s*{letter}\s*[.\-]", re.I)
        for c in self.chunks_for(num):
            if pat.search(c.text):
                return parent, c
        return None

    def page_contains(self, page: int, passage: str) -> bool:
        return squash(passage) in squash(self.pages.get(page, ""))


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def normalize_rule_id(raw: str) -> str | None:
    m = RULE_ID_RE.match(raw.strip().replace("–", "-"))
    if not m:
        return None
    num, letter = m.group(1), m.group(2)
    return f"{int(num)}-{letter.upper()}" if letter else str(int(num))


def load_records(path: Path) -> dict[str, RuleRecord]:
    if not path.is_file():
        raise RuleDataError(f"Rule data file not found: {path.name}")
    records: dict[str, RuleRecord] = {}
    with path.open(encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                raise RuleDataError(f"Malformed JSON on line {lineno}") from exc
            missing = [k for k in REQUIRED_FIELDS if k not in obj]
            if missing:
                raise RuleDataError(f"Line {lineno} missing fields: {missing}")
            rec = RuleRecord(
                rule=str(obj["rule"]).strip(),
                title=str(obj["title"]).strip(),
                part=str(obj["part"]).strip(),
                page_start=int(obj["page_start"]),
                page_end=int(obj["page_end"]),
                text=str(obj["text"]),
            )
            if rec.page_start < 1 or rec.page_end < rec.page_start:
                raise RuleDataError(f"Line {lineno} has invalid page range")
            if rec.rule in records:
                raise RuleDataError(f"Duplicate rule id {rec.rule}")
            records[rec.rule] = rec
    if not records:
        raise RuleDataError("Rule data file is empty")
    return records


def load_pages(path: Path) -> dict[int, str]:
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8")
    parts = PAGE_MARK_RE.split(text)
    return {int(parts[i]): parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def _flush(buf: list[str], out: list[tuple[int, str, str | None, bool]], page: int, sub: str | None, comment: bool):
    body = "\n".join(buf).strip("\n")
    if body.strip():
        out.append((page, body, sub, comment))
    buf.clear()


def split_rule(rec: RuleRecord, max_chars: int = 1100) -> list[Chunk]:
    """Split a rule into passages at sub-rule starts, page breaks and COMMENTS blocks."""
    pieces: list[tuple[int, str, str | None, bool]] = []
    buf: list[str] = []
    page = rec.page_start
    sub: str | None = None
    comment = False
    for line in rec.text.splitlines():
        h = HEADER_RE.match(line)
        if h:
            _flush(buf, pieces, page, sub, comment)
            page = int(h.group(1))
            continue
        stripped = line.strip()
        if stripped == "COMMENTS":
            _flush(buf, pieces, page, sub, comment)
            comment = True
            continue
        m = SUBRULE_START_RE.match(line)
        if m and line.startswith("     ") and not line.startswith("            "):
            _flush(buf, pieces, page, sub, comment)
            comment = False
            label = m.group(1)
            if label.isdigit():
                sub = f"({label})"
        if sum(len(x) for x in buf) > max_chars and not stripped.startswith(("1.", "2.", "3.", "4.")):
            _flush(buf, pieces, page, sub, comment)
        buf.append(line)
    _flush(buf, pieces, page, sub, comment)

    chunks: list[Chunk] = []
    for i, (pg, body, sb, cm) in enumerate(pieces):
        # Merge tiny fragments (e.g. lone footnote markers) into the previous passage on the same page.
        if chunks and len(body.strip()) < 60 and chunks[-1].page == pg:
            chunks[-1].text += "\n" + body
            continue
        chunks.append(
            Chunk(chunk_id=f"{rec.rule}#{len(chunks)}", rule=rec.rule, title=rec.title, page=pg,
                  text=body, sub_rule=sb, is_comment=cm)
        )
    return chunks


def load_store(data_dir: Path) -> RuleStore:
    records = load_records(data_dir / "bhumi_vikas_rules.jsonl")
    pages = load_pages(data_dir / "bhumi_vikas_rules_fulltext_by_page.txt")
    chunks: list[Chunk] = []
    for rec in records.values():
        chunks.extend(split_rule(rec))
    return RuleStore(records=records, chunks=chunks, pages=pages, order=list(records))
