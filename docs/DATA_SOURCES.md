# Regulatory Data Sources & Knowledge Provenance

## 1. Overview

**NIYAMLENS** operates on public regulatory materials provided as part of **Claude Impact Lab 2026, Track 1: Bhumi Vikas Sahayak** (Bhopal, 11 October 2026).

All legal statements, calculations, and spatial constraints in NIYAMLENS derive from these source materials. To ensure absolute fidelity, all source documents are kept locally within the repository under `data/` and `resources/`—no remote web scraping or unverified third-party APIs are queried at runtime.

---

## 2. Inventory of Source Materials

| Source Name | Local File Path | Official Origin URL | Consolidation / Publication Date | Role in Application | Delivery Mode |
| ----------- | --------------- | ------------------- | -------------------------------- | ------------------- | ------------- |
| **MP Bhumi Vikas Rules 2012 (English PDF)** | `resources/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf` | [Town & Country Planning Dept, MP](https://mptownplan.gov.in/NewsPDF/bvn06032025E.pdf) | Consolidated up to **6 March 2025** | **Primary Source of Truth** for wording, rule numbering, and tabular values. | Local file (bundled) |
| **MP Bhumi Vikas Rules 2012 (Hindi PDF)** | `resources/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_HI.pdf` | [Town & Country Planning Dept, MP](https://mptownplan.gov.in/NewsPDF/bvn06032025H.pdf) | Consolidated up to **6 March 2025** | Reference & authoritative text. *Note: Uses legacy font; not machine-parsed.* | Local file (bundled) |
| **Structured Rules Dataset (JSONL)** | `data/bhumi_vikas_rules.jsonl` | Derived from official English PDF by Track 1 organisers | Consolidated up to **6 March 2025** | In-memory rule index (106 records: Rules 1–105 + 26-B). | Local file (bundled) |
| **Sample Rules Dataset (JSONL)** | `data/bhumi_vikas_rules_sample.jsonl` | Organiser sample subset | Consolidated up to **6 March 2025** | Fast smoke-testing subset (Rules 12, 17, 23, 52, 56). | Local file (bundled) |
| **Page-Level Full Text** | `data/bhumi_vikas_rules_fulltext_by_page.txt` | Extracted from English PDF (108 pages) | Consolidated up to **6 March 2025** | Page-level textual verification and citation cross-referencing. | Local file (bundled) |
| **Data Dictionary** | `data/DATA_DICTIONARY.md` | Track 1 participant pack | October 2026 | Schema definitions for JSONL fields and embedded rule structures. | Local file (bundled) |
| **Track 1 Sample Questions** | `resources/sample_questions.md` | Track 1 participant pack | October 2026 | Benchmark suite: 17 real municipal counter questions. | Local file (bundled) |
| **Official Problem Statement** | `resources/PROBLEM-STATEMENT.md` | [Impact Lab Problem Statements Repo](https://github.com/Vishal4742/bhopal-impact-lab-2026-problem-statements/blob/main/track-1-bhumi-vikas-sahayak/PROBLEM-STATEMENT.md) | 11 October 2026 | User requirements, judging criteria, and evaluation rules. | Local file (bundled) |
| **Amendment to Rule 2(5)(c)** | *External Reference Notice* | [TeamLease RegTech Notice](https://teamleaseregtech.com/updates/article/59469/government-of-madhya-pradesh-amendment-to-land-development-rules) | Published **28 August 2026** | External amendment regarding development permission for plots up to 500 sq m. | Referenced (not bundled) |

---

## 3. Structural Nuances in the Dataset

### 3.1. 106 JSONL Records vs. 108 PDF Pages
The structured dataset `bhumi_vikas_rules.jsonl` contains 106 records corresponding to the 105 numbered rules plus Rule 26-B. The consolidated English PDF runs to 108 pages. 

### 3.2. Embedded / Inserted Rules
Several amendments inserted rules with alphanumeric suffixes. The official PDF prints these with their own distinct titles, but in the structured JSONL data, they reside inside the text of the preceding rule:
* **Rule 12-A:** Resides inside Rule 12.
* **Rule 17-a** (*Agricultural Tourist Facility*): Resides inside Rule 17.
* **Rule 25(A):** Resides inside Rule 25.
* **Rule 26-A:** Resides inside Rule 26.
* **Rule 42-A:** Resides inside Rule 42.
* **Rule 93(a):** Resides inside Rule 93.
* **Rule 26-B:** The only inserted rule with its own distinct JSONL line.

`backend/app/rules/loader.py` includes regex-based logic (`find_embedded()`) to accurately detect and retrieve these embedded rules when requested by the user or clerk.

### 3.3. Running PDF Headers
The raw `text` fields of `bhumi_vikas_rules.jsonl` contain running headers from the PDF (e.g., `Rule 56   M.P. Bhumi Vikas Rules, 2012   78`). NIYAMLENS utilizes these headers during ingestion to determine the exact PDF page where each sub-clause begins, and then strips them from the passage before indexing.

### 3.4. Flattened Tables
In the extracted text, multi-column tables (such as Table 4 under Rule 56 for residential setbacks or Rule 21 for permission fees) have been flattened to whitespace-delimited plain text. While human-readable, raw character alignment can vary. Consequently:
* **All critical calculation tables are codified deterministically in code** (`backend/app/calculations/`).
* At backend initialization, `backend/app/rules/verified_tables.py` performs a self-check verifying that the codified tables match substrings in the loaded document. If the self-check fails, the calculation is automatically disabled to prevent miscalculations.

---

## 4. The Hindi PDF Legacy Font Limitation

The official consolidated Hindi document (`resources/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_HI.pdf`) was typeset using a non-Unicode legacy font (e.g., Kruti Dev / Chanakya font encoding). When extracted via standard PDF extraction tools (`pypdf`, `pdfplumber`, `pdftotext`), the text extracts as corrupted character glyphs rather than readable Devanagari Unicode.

### Architectural Mitigation:
1. **Authoritative Text:** The English consolidated PDF (`MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf`) is treated as the primary machine-readable source of truth for text retrieval and tables.
2. **Legal Hierarchy Disclosure:** Under Rule 4 (citing the judicial precedent *Kurban Hussain v. Indore Municipal Corporation* printed on PDF page 15), the Hindi gazetted text is the governing statutory authority, and the English version is an official translation.
3. **Transparent Warning:** Whenever answering a Hindi query, NIYAMLENS attaches the warning `HINDI_TEXT_PREVAILS`, informing the user that English quotations are authoritative translations and that Hindi summaries are generated interpretations rather than direct gazette excerpts.

---

## 5. Regulatory Version Limitations & The August 28, 2026 Amendment

The consolidated rulebook bundled with the problem pack reflects the law as consolidated up to **March 6, 2025**.

### The August 28, 2026 Amendment:
On August 28, 2026, the Government of Madhya Pradesh published an amendment to **Rule 2(5)(c)** regarding development permission requirements for plots up to 500 square metres. 

### NIYAMLENS Policy on Unverified Amendments:
1. **No Silent Merging:** NIYAMLENS does **not** silently splice unverified third-party amendment text into the official 2025 rulebook.
2. **Proactive Version Flagging:** Whenever a query touches Rule 2(5)(c), development permissions, or plots up to 500 sq m (such as Sample Question 11), NIYAMLENS assigns the status `VERSION_REVIEW_NEEDED` and attaches the alert `AMENDMENT_2026_RULE_2_5_C`.
3. **Clerk Advisory:** The clerk is explicitly advised to consult the gazetted notification dated 28 August 2026 before rendering an administrative opinion.

---

## 6. Attribution & Copyright Notice

* **Publisher:** Directorate of Town and Country Planning, Government of Madhya Pradesh.
* **Legislation:** Madhya Pradesh Bhumi Vikas Rules, 2012 (enacted under the Madhya Pradesh Nagar Tatha Gram Nivesh Adhiniyam, 1973).
* **Participant Pack:** Prepared for Claude Impact Lab × Cerebras Café Compute, Bhopal (October 2026).
* **Redistribution:** The regulatory documents are public government publications hosted for regulatory compliance and citizen information. NIYAMLENS does not assert copyright over the statutory texts, tables, or PDF contents.
