"""Run every question in resources/sample_questions.md through POST /api/answer (in-process).

Writes docs/evaluation_results.json and prints a Markdown table. No expected answers are
hardcoded; the human review column in docs/evaluation.md records the manual check.

Usage (from backend/):  python scripts/eval_samples.py [--ai]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def main() -> None:
    use_ai = "--ai" in sys.argv
    text = (ROOT / "resources" / "sample_questions.md").read_text(encoding="utf-8")
    qs = [(int(m.group(1)), m.group(2).strip()) for m in re.finditer(r"(?m)^(\d+)\.\s+(.+)$", text)]
    rows = []
    with TestClient(app) as client:
        for n, q in qs:
            r = client.post("/api/answer", json={"question": q, "use_ai": use_ai})
            d = r.json()
            calc = [
                f"{c['label']}: {c.get('display_value') or '—'} [{c['status']}]" for c in d.get("calculations", [])
            ]
            rows.append({
                "n": n,
                "question": q,
                "http": r.status_code,
                "language": d.get("language"),
                "primary_status": d.get("primary_status"),
                "statuses": d.get("statuses"),
                "rules_cited": list(dict.fromkeys(f"{c['rule']} (p.{c['page']})" for c in d.get("citations", [])))[:5],
                "calculations": calc,
                "missing": [m["field"] for m in d.get("missing_inputs", [])],
                "warnings": [w["code"] for w in d.get("warnings", [])],
                "answer_source": d.get("answer", {}).get("source"),
                "answer": d.get("answer", {}).get("text"),
            })
    out = ROOT / "docs" / "evaluation_results.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print("| # | Primary status | Rules cited | Calculation | Missing | Warnings |")
    print("|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['n']} | {r['primary_status']} | {', '.join(r['rules_cited'][:3])} | "
              f"{'; '.join(r['calculations']) or '—'} | {', '.join(r['missing']) or '—'} | {', '.join(r['warnings']) or '—'} |")
    print(f"\nWrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
