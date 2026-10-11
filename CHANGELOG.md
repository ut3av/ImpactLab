# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Core Rule Store & Page Parser:** In-memory loader (`backend/app/rules/loader.py`) for `bhumi_vikas_rules.jsonl` (106 records) and `bhumi_vikas_rules_fulltext_by_page.txt` (108 pages). Splits text into 787 passages mapped accurately to original PDF pages using running headers.
- **Embedded Rule Detection:** Support for inserted rules (12-A, 17-a, 25(A), 26-A, 42-A, 93(a)) physically located inside parent rule text records.
- **Self-Verifying Rule Tables:** Startup validation in `backend/app/rules/verified_tables.py` for Rule 56 (Table 4 setbacks), Rule 21 (permission fees), Rule 52 (electrical line clearances), Rule 42 (high-rise open spaces), and Rule 2(38) definitions.
- **Deterministic Calculation Engine:**
  - `front_open_space`, `rear_open_space`, `side_open_space`, and composite `site_open_spaces` based on Rule 56 Table 4.
  - `building_permission_fee` calculations with residential and commercial rates based on Rule 21.
  - `electric_line_clearance` computations based on Rule 52.
  - Structured missing-input identification and boundary checks.
- **Regulatory Version Warning System:** Automatic disclosure of the March 6, 2025 consolidation limit and proactive flagging of Rule 2(5)(c) queries affected by the August 28, 2026 amendment.
- **Dual Retrieval Pipeline:** Hybrid BM25 retriever with English-Hindi regulatory synonym expansion, direct rule ID matching, and strict relevance thresholding (`MIN_SCORE = 9.0`) to reject out-of-scope topics with `NOT_FOUND`.
- **Cerebras Inference Client with Guardrails:** Fast LLM inference client (`cerebras_cloud_sdk`) with Pydantic output validation, strict numeric guards against hallucinated math, and an automatic offline fallback to deterministic template responses.
- **FastAPI HTTP API:** Endpoints for `/api/health`, `/api/sources`, `/api/rules/search`, `/api/rules/{rule_id}`, `/api/calculate`, and `/api/answer`.
- **Automated Test Suite:** 116 pytest unit tests covering loader, parser, calculation rules, retrieval engine, LLM guardrails, and API endpoints.
- **Benchmark Evaluation Runner:** CLI runner (`backend/scripts/eval_samples.py`) evaluating the 17 Track 1 sample questions, recording results to `docs/evaluation_results.json`.
- **Frontend Architecture Scaffold:** React 19 + TypeScript + Vite + Tailwind CSS v4 setup with initial components:
  - `PlotScene3D.tsx`: Interactive Three.js/React Three Fiber 3D scene rendering plot boundary, street frontage, setback zones, and building volume.
  - `ProjectInputsPanel.tsx`: Parameter input panel for plot and building dimensions.
  - `StatusBadge.tsx`: Visual badge component for regulation debugger statuses.
- **Comprehensive Project Documentation:** Root `README.md`, `prd.md`, `LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, and technical documentation guides in `docs/`.
