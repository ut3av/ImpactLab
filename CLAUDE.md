# MIRA: Developer Guidelines & Project Reference

**Product:** MIRA (Municipal Intelligence for Rules & Architecture)  
**Tagline:** "See the Rules. Understand the Structure."  
**Track:** Claude Impact Lab 2026, Track 1: Bhumi Vikas Sahayak (Bhopal Municipal Corporation)  
**Architecture:** Single-Origin Monolithic Container (React 19 + FastAPI + Cerebras SDK)

---

## 1. Quick Development Commands

### Backend (Python 3.13)
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```
* **Run Tests:** `pytest -q` (116 tests)
* **Run Evaluation Benchmark:** `python scripts/eval_samples.py` (17 sample questions)

### Frontend (React 19 + Vite + TypeScript)
```powershell
cd frontend
npm run dev
```
* **Lint:** `npm run lint` (`oxlint`)
* **Unit Tests:** `npm test` (`vitest run`)
* **Production Build:** `npm run build` (`tsc -b && vite build`)

---

## 2. Core Architectural Principles

1. **Evidence-Backed Answers:** Never hallucinate or synthesize speculative legal rules. Every answer must cite an exact rule and gazette page from *M.P. Bhumi Vikas Rules, 2012*.
2. **Deterministic Calculations:** Calculations (Rule 56 setbacks, Rule 21 permission fees, Rule 52 clearances) execute in Python using verified lookup tables, never in LLM generation.
3. **Rule-to-Geometry Engine:** Visualizes 3D spatial setback envelopes in Three.js linked directly to the governing statutory clauses.
4. **Counter Receipt:** Generates reproducible, print-ready inspection certificates (`Ref MIRA-...`) with sha256 evidence integrity.
5. **Offline Safety:** Boots and operates fully without `CEREBRAS_API_KEY` by falling back to verified deterministic answer templates.
