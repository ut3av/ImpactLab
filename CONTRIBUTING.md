# Contributing to NIYAMLENS

Thank you for your interest in contributing to **NIYAMLENS: See the Rule. Understand Its Impact.**

NIYAMLENS is an open-source regulatory intelligence tool developed for building-permission clerks at the Bhopal Municipal Corporation. We welcome contributions that improve regulatory fidelity, calculation accuracy, bilingual understanding, and user experience.

---

## 1. Code of Conduct

All contributors are expected to uphold the [Code of Conduct](CODE_OF_CONDUCT.md). Please treat all participants with respect and professionalism.

---

## 2. Architecture & Design Principles

Before writing code or proposing changes, keep these core design principles in mind:
1. **Source Grounding Above All:** Every substantive regulatory claim must cite its rule number, PDF page, and exact source passage from the *M.P. Bhumi Vikas Rules, 2012*.
2. **Deterministic Computation:** Mathematics and table lookups belong in tested Python code, never in language model prompts.
3. **Honest Uncertainty:** When the rulebook is silent or missing necessary parameters, the system must report `NOT_FOUND` or `MORE_INFORMATION_NEEDED`. Never invent or guess rules.
4. **Version Awareness:** The consolidated rulebook ends at March 6, 2025. Any rule affected by subsequent amendments (such as the August 28, 2026 amendment to Rule 2(5)(c)) must trigger a `VERSION_REVIEW_NEEDED` warning.

---

## 3. Development Setup

### Prerequisites
* **Python**: Version 3.11 or higher
* **Node.js**: Version 18 or higher (Node 20+ recommended)
* **npm**: Version 9 or higher
* **Git**: Installed and configured

### Setting Up the Backend
1. Clone the repository:
   ```bash
   git clone https://github.com/ut3av/ImpactLab.git
   cd ImpactLab
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # Windows PowerShell:
   .venv\Scripts\Activate.ps1
   # Linux/macOS:
   source .venv/bin/activate
   ```

3. Install backend dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```

4. Configure environment variables (optional):
   ```bash
   cp ../.env.example ../.env
   # Edit ../.env if you wish to configure CEREBRAS_API_KEY
   ```

5. Run the backend tests:
   ```bash
   pytest -q
   ```

6. Start the backend development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The API will be available at `http://localhost:8000/api` and interactive OpenAPI documentation at `http://localhost:8000/api/docs`.

### Setting Up the Frontend
1. In a separate terminal, navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend dev server runs at `http://localhost:5173`.

---

## 4. Contributing Rules or Calculations

Because NIYAMLENS serves regulatory decision-support, additions or modifications to rules and calculation engines follow strict quality criteria:

### Adding or Modifying a Rule Table
1. **Identify the Source:** Cite the exact Rule number, Sub-rule, and PDF page from `resources/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf`.
2. **Self-Verifying Table Test:** If adding a table lookup, add verification text to `backend/app/rules/verified_tables.py` so the table is automatically cross-checked against the raw text during startup.
3. **Deterministic Calculation:** Implement the calculation function in `backend/app/calculations/` with explicit parameter bounds and `MissingInput` detection.
4. **Unit Tests:** Add unit tests to `backend/tests/test_calculations.py` covering:
   - Valid inputs with expected exact outputs.
   - Boundary inputs (e.g., plot area at exact bracket threshold).
   - Incomplete inputs triggering `MORE_INFORMATION_NEEDED`.
   - Out-of-bounds or physically impossible inputs.

---

## 5. Verification Commands

Before opening a pull request, run all verification commands:

```bash
# 1. Run all backend unit tests (116 tests)
cd backend
pytest -v

# 2. Run the 17 sample questions evaluation script
python scripts/eval_samples.py

# 3. Check frontend lints (from frontend/ directory)
cd ../frontend
npm run lint
```

---

## 6. Pull Request Process

1. **Create a Topic Branch:**
   ```bash
   git checkout -b feature/your-feature-name
   # or fix/your-bug-fix
   ```
2. **Commit Changes:** Use clear, descriptive commit messages:
   ```bash
   git commit -m "feat(setbacks): add commercial plot setback calculation for Rule 57"
   ```
3. **Verify No Secrets:** Ensure `.env` or personal credentials are never committed.
4. **Open a Pull Request:** Fill out the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) completely, detailing changes, tested scenarios, and relevant regulatory citations.
