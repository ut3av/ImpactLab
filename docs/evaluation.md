# Evaluation against the official Track 1 sample questions

Source of questions: `resources/sample_questions.md` (17 questions, used verbatim).
Runner: `python backend/scripts/eval_samples.py` (run from `backend/`; add `--ai` to enable Cerebras).
Raw output: `docs/evaluation_results.json`.

These results come from the **deterministic pipeline without AI** (no `CEREBRAS_API_KEY` was available while
building). No expected answers are hardcoded anywhere in the application. The answers were checked by hand against
the quoted rule text and, for numeric tables, against the text layer of the supplied English PDF.

**No accuracy percentage is claimed.** The table records what the tool returned and whether a person who read the
cited source agrees with it.

## Results (11 Oct 2026, commit with 116 backend tests passing)

| # | Question (short) | Primary status | Top rules cited (PDF page) | Deterministic result | Manual review |
|---|---|---|---|---|---|
| 1 | 10 m street, 9 m tall, front open space | CALCULATION_COMPLETED + VERIFIED | 56 (p.77) | **3.6 m** | ✅ Correct: Rule 56(1)(a) row 2 "More than 9.0 meters and up to 12 meters → 3.6 meters"; house ⇒ residential; 9 m ≤ 12.5 m. |
| 2 | Farm house: min plot, max FAR | SOURCE_FOUND | 17 (p.34), 53, 2 | — (retrieval) | ✅ The Rule 17 passage shown states "Minimum size of the plot shall be 0.40 hectare" and "Maximum F.A.R. shall be 0.10". Not converted into a calculation. |
| 3 | Development permission validity, renewals | SOURCE_FOUND | 23 (p.41), 13, 12 | — | ✅ Rule 23(1)–(2): valid up to three years; revalidation for two consecutive terms of one year each. |
| 4 | Authority misses deadline | SOURCE_FOUND | 28 (p.48–49), 27 | — | ✅ Rule 28 (deemed sanction) is the right rule. ⚠️ The time limit itself is referenced to the Act; the clerk must read the passage. |
| 5 | Balcony vs low-voltage line | CALCULATION_COMPLETED + VERIFIED | 52 (p.69) | **2.5 m vertical, 1.2 m horizontal** | ✅ Rule 52(1)(a). Notes "or the applicable Electricity Rules, whichever is more". |
| 6 | Who signs plans | SOURCE_FOUND | 18 (p.34), 26 (p.45–46) | — | ✅ Rule 18 and the Rule 26 competence schedule. |
| 7 | Documents with application | SOURCE_FOUND | 16 (p.32–33), 14 | — | ✅ Rule 16 (information accompanying application) and Rule 14. |
| 8 | Fee for residential house | MORE_INFORMATION_NEEDED | 21 (p.36, p.35), 2(38) | — (needs built-up area, height/storeys) | ✅ Correct to ask: Rule 21(3)(b) charges by built-up-area slab and high rise buildings use 21(3)(c). The answer summarises the verified schedule (Rs. 750 … Rs. 50,000; Rs. 10/sq m high rise; application fee Rs. 1/sq m). With inputs (e.g. 120 sq m, 7 m, 2 storeys) it returns Rs. 1,250 (tested). |
| 9 | Change plan after sanction | SOURCE_FOUND | 24 (p.41–42) | — | ✅ Rule 24 (deviation). ⚠️ Rule 21(3)(b) item 8 (fee for alterations) is not surfaced; partial. |
| 10 | Rear open space, 150 sq m residential plot | MORE_INFORMATION_NEEDED | 56 (p.78) | Conditional: **1.5 m if height ≤ 12.5 m** | ✅ Table row "Above 40.00 and up to 150.00 → 1.50". The question gives no height, and Rule 56(2) applies only up to 12.5 m, so no unconditional value is given. Supplying a height returns 1.5 m VERIFIED (tested). |
| 11 | Separate development permission, 300 sq m plot | VERSION_REVIEW_NEEDED | 2 (p.4), 12, 14 | — | ✅ Flags the 28 Aug 2026 amendment to Rule 2(5)(c), which is not in the supplied rulebook. The tool does not answer from the outdated text. |
| 12 | Development Plan vs rules conflict | SOURCE_FOUND | 103 (p.107) | — | ✅ Rule 103 "Provisions of development plan to take precedence". |
| 13 | Lifts in building taller than 15 m | SOURCE_FOUND | 83 (p.95–96) | — | ✅ Rule 83: lifts required for buildings more than 12.5 m in height. |
| 14 | (Hindi) 200 sq m plot, 9 m road, front space | MORE_INFORMATION_NEEDED | 56 (p.77) | Conditional: **3.0 m if residential and ≤ 12.5 m** | ✅ Hindi answer. Height and use are not stated, so they are asked for. With height and use it returns 3.0 m VERIFIED (tested). |
| 15 | (Hindi) building permission fee and rule | MORE_INFORMATION_NEEDED | 21 (p.36) | — | ✅ Names Rule 21(3)(b) in Hindi and gives the schedule summary. |
| 16 | Property tax online | NOT_FOUND | — | — | ✅ "Not found in the supplied rules." No citation shown. |
| 17 | Market rate, Kolar Road | NOT_FOUND | — | — | ✅ "Not found in the supplied rules." |

### Summary (counts, not accuracy)

- **2** questions answered with a verified deterministic value (Q1, Q5).
- **4** questions correctly ask for missing inputs, with the verified table shown as conditional or summary (Q8, Q10, Q14, Q15).
- **8** questions answered by cited source passages without an applied conclusion (Q2, Q3, Q4, Q6, Q7, Q9, Q12, Q13). Q4 and Q9 are partial (see notes).
- **1** question flagged for version review (Q11).
- **2** questions correctly returned "Not found" (Q16, Q17).
- Every citation shown for the 17 questions refers to a real rule record. Its first line appears on the stated PDF page (automated check: `backend/tests/test_answer.py::test_every_citation_is_real`).

### Still needs human review

- Q4 and Q9: the cited rule is right, but the complete answer needs a person to read the passage (time limit, alteration fees).
- Q10 and Q14: some reviewers may expect an unconditional value. NIYAMLENS deliberately does not assume building height or use.
- Q2: FAR and plot size appear only in the quoted text; they are not computed or structured.
- AI explanations were not evaluated against the live Cerebras API. Only mocked responses were tested (valid, invented-number, unknown-citation, malformed and failure cases in `backend/tests/test_llm.py`).
