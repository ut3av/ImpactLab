## Summary of Changes

A clear, concise description of what this pull request changes and why.

- **Issue Reference:** Closes #
- **Component(s) Affected:** `backend/` | `frontend/` | `docs/` | `data/`

---

## Type of Change

- [ ] Bug fix (non-breaking fix for an incorrect calculation or retrieval error)
- [ ] New regulatory calculation rule (backed by explicit source citations)
- [ ] Retrieval or NLP prompt improvement
- [ ] Frontend / UI / 3D visualization enhancement
- [ ] Documentation update
- [ ] Testing & evaluation expansion

---

## Regulatory Source Verification Checklist

*If this PR adds or changes any regulatory rule, table, or calculation:*
- [ ] Rule number, Sub-rule, and PDF page from `resources/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf` are explicitly cited.
- [ ] Numerical values in code match the official consolidated PDF table (not just the flattened text).
- [ ] Calculation function includes validation for `MissingInput` and boundary limits.
- [ ] Unit tests added to `backend/tests/` verifying nominal, boundary, and incomplete cases.

---

## Quality & Security Verification

- [ ] `pytest -v` runs and passes (all unit tests green).
- [ ] `python backend/scripts/eval_samples.py` ran with no regressions on benchmark questions.
- [ ] No API keys, secrets, or environment credentials are committed.
- [ ] No citizen personal identifying information (PII) is introduced.
- [ ] Documentation updated where appropriate.
