# Security Policy

## 1. Overview and Security Principles

NIYAMLENS is an open-source regulatory decision-support prototype. Because it serves municipal building-permission clerks and citizens, data integrity, credential safety, and regulatory provenance are vital:

1. **Zero Secret Leakage:** Artificial intelligence inference keys (e.g., `CEREBRAS_API_KEY`) and server credentials must strictly remain server-side. They must never be bundled into client-side single-page applications or committed to source control.
2. **Deterministic Source Verification:** Legal calculations and citations are bound to verified text. LLMs are prohibited from inventing numerical regulations.
3. **No Unnecessary Citizen Data Collection:** The application processes geometric and architectural parameters (plot area, road width, height) rather than personally identifiable citizen information (PII) such as Aadhaar numbers, phone numbers, or property title numbers.
4. **Resilient AI Failure Mode:** The application is architected to operate fully without an AI API key, preventing service denial due to upstream AI provider outages.

## 2. Supported Versions

Only the current main development branch is actively maintained during this phase.

| Version | Supported          | Status |
| ------- | ------------------ | ------ |
| `0.1.x` (main branch) | :white_check_mark: | Active prototype development |
| `< 0.1.0` | :x:                | Unsupported historical iterations |

## 3. Reporting a Vulnerability

We appreciate responsible security disclosure. If you discover a vulnerability or security risk, please do **not** open a public GitHub issue.

### Preferred Reporting Channel
- **GitHub Private Vulnerability Reporting:** If enabled on the repository (`https://github.com/ut3av/ImpactLab/security/advisories/new`), submit an advisory directly through GitHub.
- **Maintainer Contact Placeholder:** Alternatively, contact the maintainer directly:
  `[MAINTAINER_SECURITY_EMAIL_PLACEHOLDER: ut3av.rv@gmail.com]` with the subject line `[SECURITY] NIYAMLENS Vulnerability Report`.

### What to Include in Your Report
Please provide:
* A description of the vulnerability and its potential impact.
* Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
* Affected components (e.g., FastAPI backend endpoints, Cerebras integration, input validation).
* Suggested remediation or fix, if available.
* Your name or handle for public attribution (optional).

### What NOT to Include
* Do **not** post unredacted private API keys, credentials, or secrets in any disclosure.
* Do **not** disclose the issue publicly until maintainers have acknowledged and resolved it.

## 4. Response and Remediation Process

* **Acknowledgement:** Maintainers aim to acknowledge receipt of security reports within 48 hours.
* **Assessment:** The vulnerability will be evaluated, categorized by severity, and prioritized.
* **Resolution:** A fix will be developed, tested against the test suite, and merged into the main branch.

## 5. Security Controls Implemented

The current backend implementation enforces several defensive controls:
* **Strict Payload Size Limits:** The FastAPI middleware enforces `MAX_BODY_BYTES = 32_000` to prevent memory exhaustion and Denial-of-Service (DoS) via massive input strings.
* **Defensive HTTP Headers:** Responses include `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`.
* **Input Sanitization & Boundary Checking:** Pydantic schemas enforce bounds on all physical parameters (e.g., `plot_width_m`, `road_width_m`, `building_height_m`) and geometric consistency (ensuring building footprint cannot exceed plot size).
* **Environment Isolation:** Secrets are managed via `pydantic-settings` using `.env` files that are strictly excluded in `.gitignore`.
