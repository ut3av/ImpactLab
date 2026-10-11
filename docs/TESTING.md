# NIYAMLENS: Testing Strategy & Evaluation Benchmark

This document details the quality assurance architecture, test suites, and benchmark evaluation results for **NIYAMLENS**.

---

## 1. Quality Assurance Strategy

NIYAMLENS implements a multi-layer verification strategy designed around regulatory precision:

```mermaid
graph TD
    A[Test Strategy] --> B[Unit & Integration Tests (116 Tests)]
    A --> C[Regulatory Table Self-Checks (Startup)]
    A --> D[17 Sample Questions Benchmark]
    A --> E[Frontend & Geometry Tests]

    B --> B1[test_loader.py: Ingestion & Chunker]
    B --> B2[test_calculations.py: Setbacks, Fees, Electric]
    B --> B3[test_llm.py: Cerebras Client & Guardrails]
    B --> B4[test_answer.py: Orchestration & Statuses]
    B --> B5[test_api.py: FastAPI Endpoints]

    C --> C1[Rule 56 Table 4 Match]
    C --> C2[Rule 21 Fee Schedule Match]
    C --> C3[Rule 52 Electrical Clearances Match]

    D --> D1[Calculated Answers (Q1, Q5)]
    D --> D2[Missing Information Detection (Q8, Q10, Q14, Q15)]
    D --> D3[Version Warnings (Q11: Aug 2026 Amendment)]
    D --> D4[Not Found Rejection (Q16, Q17)]
```

---

## 2. Backend Automated Test Suite (Pytest)

The backend test suite contains **116 automated tests** in `backend/tests/`.

### 2.1. Test Suite Modules

| Test File | Tests | Coverage Scope |
| --------- | :---: | -------------- |
| `test_loader.py` | 12 | Verifies loading of 106 rules, extraction of 787 passages, page number attribution via running headers, and detection of embedded rules (12-A, 17-a, 25(A), 26-A, 42-A, 93(a)). |
| `test_calculations.py` | 38 | Tests front, rear, and side setback brackets across residential, commercial, and industrial plots under Rule 56; verifies permission fee slabs under Rule 21; verifies electrical safety clearances under Rule 52; tests physical boundary validation and missing input detection. |
| `test_llm.py` | 18 | Tests Cerebras API integration, timeout handling, strict number guardrails (failing when LLMs hallucinate numbers), citation validation, and offline fallback behavior. |
| `test_answer.py` | 26 | Tests the complete answer orchestration pipeline, English and Hindi query processing, parameter extraction, BM25 retrieval ranking, and status assignment priority. |
| `test_api.py` | 22 | Tests FastAPI REST endpoints (`/api/health`, `/api/sources`, `/api/rules/search`, `/api/rules/{id}`, `/api/calculate`, `/api/answer`), payload size limits, and HTTP validation error formatting. |

### 2.2. Running the Test Suite
From the `backend/` directory:

```bash
pytest -v
```

**Actual Execution Result:**
```text
116 passed in 1.86s
```

---

## 3. Benchmark Evaluation: Track 1 Sample Questions

The Track 1 participant pack specifies 17 real municipal counter questions in `resources/sample_questions.md`, designed to test retrieval fidelity, calculations, missing parameters, version updates, and unsupported topics.

The benchmark runner `backend/scripts/eval_samples.py` executes each question through the live pipeline and outputs the results to `docs/evaluation_results.json`.

### 3.1. Benchmark Evaluation Results Matrix

| # | Question Summary | Language | Primary Status | Governing Rule Cited | Calculations Executed | Missing Inputs Detected | Warnings Flagged |
| - | ---------------- | :------: | :------------: | :------------------: | :-------------------: | :---------------------: | :--------------: |
| **1** | House faces 10m street, 9m tall. Front setback? | EN | `CALCULATION_COMPLETED` | Rule 56 (p. 77) | Front open space: **3.6 m** [VERIFIED] | None | None |
| **2** | Farm house on agricultural land. Plot size & FAR? | EN | `SOURCE_FOUND` | Rule 17 (p. 34), Rule 53 (p. 71) | — | None | None |
| **3** | Development permission granted in 2023. Validity & renewals? | EN | `SOURCE_FOUND` | Rule 23 (p. 41), Rule 12 (p. 20) | — | None | None |
| **4** | Authority missed deadline for building permission. Consequence? | EN | `SOURCE_FOUND` | Rule 28 (p. 48) | — | None | None |
| **5** | Low-voltage electric line clearance (vert / horiz)? | EN | `CALCULATION_COMPLETED` | Rule 52 (p. 69) | Vert: **2.5 m**, Horiz: **1.2 m** [VERIFIED] | None | None |
| **6** | Who is allowed to sign and submit building plans? | EN | `SOURCE_FOUND` | Rule 18 (p. 34), Rule 26 (p. 45) | — | None | None |
| **7** | Documents required with building permission application? | EN | `SOURCE_FOUND` | Rule 16 (p. 32), Rule 14 (p. 22) | — | None | None |
| **8** | Fee for building permission for residential house? | EN | `MORE_INFORMATION_NEEDED` | Rule 21 (p. 36) | Permission fee: — [MORE_INFORMATION_NEEDED] | `built_up_area_sqm`, `building_height_m` | None |
| **9** | Can a plan be changed after sanction? | EN | `SOURCE_FOUND` | Rule 24 (p. 41) | — | None | None |
| **10** | Minimum rear open space for 150 sq m residential plot? | EN | `MORE_INFORMATION_NEEDED` | Rule 56 (p. 78) | Rear open space: — [MORE_INFORMATION_NEEDED] | `building_height_m` | None |
| **11** | Separate dev permission for 300 sq m plot? (Changed Aug 2026) | EN | `VERSION_REVIEW_NEEDED` | Rule 2 (p. 4), Rule 12 (p. 20) | — | None | **`AMENDMENT_2026_RULE_2_5_C`** |
| **12** | Conflict between Development Plan and Rules? | EN | `SOURCE_FOUND` | Rule 103 (p. 107) | — | None | None |
| **13** | Rules for lifts in buildings taller than 15m? | EN | `SOURCE_FOUND` | Rule 83 (p. 95) | — | None | None |
| **14** | 200 वर्ग मीटर प्लॉट, 9 मीटर सड़क। आगे की जगह? | HI | `MORE_INFORMATION_NEEDED` | Rule 56 (p. 77) | Front open space: — [MORE_INFORMATION_NEEDED] | `building_height_m`, `building_use` | **`HINDI_TEXT_PREVAILS`** |
| **15** | बिल्डिंग परमिशन की फीस कितनी है? | HI | `MORE_INFORMATION_NEEDED` | Rule 21 (p. 36) | Permission fee: — [MORE_INFORMATION_NEEDED] | `built_up_area_sqm`, `building_use`, `building_height_m` | **`HINDI_TEXT_PREVAILS`** |
| **16** | How do I pay my property tax online? | EN | `NOT_FOUND` | *None* | — | None | None |
| **17** | Current market rate for land in Kolar Road? | EN | `NOT_FOUND` | *None* | — | None | None |

### 3.2. Key Findings & Strengths
1. **Zero Hallucination on Out-of-Scope Queries:** Questions 16 (property tax) and 17 (land market rates) were rejected with `NOT_FOUND`. The system explicitly stated that property tax and land rates are outside the *M.P. Bhumi Vikas Rules, 2012*.
2. **Amendment Detection (Question 11):** The system flagged the August 28, 2026 amendment to Rule 2(5)(c), cautioning the clerk that the March 6, 2025 consolidated copy does not contain this rule change.
3. **Missing Parameter Enforcement:** Questions 8, 10, 14, and 15 correctly refrained from guessing numerical figures, accurately prompting for necessary inputs (such as building height or built-up area).

---

## 4. Frontend Component Testing Strategy

* **Framework:** Vitest + React Testing Library + jsdom (configured in `frontend/package.json`).
* **Geometry Calculation Unit Tests:** Verify that physical dimensions (`plot_width_m`, `road_width_m`, `depth_m`) translate into normalized Three.js bounding coordinates.
* **Component Linter:** `oxlint` validates syntax and unused variables across all frontend source files.
