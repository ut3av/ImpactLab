# MIRA: Architecture Decision Records (ADRs)

This document records the key architectural, technical, and product decisions made during the development of **MIRA**.

---

## ADR-001: Focus Exclusively on the Building-Permission Clerk Workflow

* **Status:** Accepted
* **Context:** The problem brief permits designing for citizens, architects, or municipal clerks. Building an all-encompassing portal with citizen logins, online plan uploads, payment gateways, and role management within hackathon constraints would lead to superficial implementations.
* **Decision:** Build exclusively for the **Building-Permission Clerk** at the Bhopal Municipal Corporation counter.
* **Rationale:** A single clerk answers hundreds of citizen queries daily under high time pressure. Empowering the clerk with instant rule lookups, verifiable calculations, visual explanations, and counter receipts delivers high day-one impact.
* **Consequences:** Citizen self-service portals, architect drafting tools, and municipal login systems are excluded from the initial scope.

---

## ADR-002: Separation of Legal Retrieval from Natural Language Generation

* **Status:** Accepted
* **Context:** Typical generative AI chatbots ingest legal text into a large prompt and generate answers directly. In high-stakes regulatory settings, LLMs frequently hallucinate provisions, confuse conditions, or invent citations.
* **Decision:** Decouple statutory retrieval and decision-making from language generation. The retrieval engine locates authentic text passages using BM25, and deterministic Python services perform calculations and checks. The language model is restricted to formatting clear summaries and explanations.
* **Rationale:** Complete traceability. If the LLM generates an explanation, the governing rule number, PDF page, and verbatim text remain grounded in authentic source passages.
* **Consequences:** Requires custom extraction and ranking algorithms, but guarantees zero invented rules.

---

## ADR-003: Deterministic Code for Tabular and Mathematical Calculations

* **Status:** Accepted
* **Context:** Regulations such as Rule 56 (Table 4 setbacks), Rule 21 (fees), and Rule 52 (electric safety clearances) rely on numerical tables with strict conditional boundaries.
* **Decision:** All mathematical calculations, fee schedules, and setback brackets are implemented in pure, testable Python functions rather than language model prompts.
* **Rationale:** Language models struggle with multi-bracket arithmetic and conditional boundary tables. Code provides repeatable, testable accuracy.
* **Consequences:** Adding new regulatory calculations requires coding and testing the respective table logic.

---

## ADR-004: In-Memory Rule Store over External Vector Databases

* **Status:** Accepted
* **Context:** The dataset consists of 106 rule records across 108 PDF pages (787 granular passages).
* **Decision:** Ingest and index all passages in-memory at application startup using BM25, rather than deploying an external vector database (e.g., Pinecone, Chroma, pgvector).
* **Rationale:** 106 rules occupy under 20 MB of RAM. An in-memory store boots in milliseconds, executes searches in under 5 ms, requires zero external services or network roundtrips, and simplifies local running and containerization.
* **Consequences:** Re-indexing occurs on startup. Highly suitable for stationary statutory rulebooks.

---

## ADR-005: The Rule-to-Geometry Engine as the Spatial Differentiator

* **Status:** Accepted
* **Context:** Textual setback rules (e.g., *"front open space 3.0 m, rear open space 2.0 m"*) are difficult for clerks to describe verbally to citizens over a counter.
* **Decision:** Connect verified regulatory calculations directly to an interactive 3D spatial canvas (using Three.js and React Three Fiber).
* **Rationale:** Visualizing setback zones directly on a plot boundary makes regulations immediately understandable. Interactive selection connects 3D elements back to statutory citations.
* **Consequences:** Requires 3D rendering in the browser; mitigated by lightweight geometry (flat planes, bounding boxes) and a low-power `frameloop="demand"` configuration.

---

## ADR-006: Explicit Handling of the August 28, 2026 Amendment

* **Status:** Accepted
* **Context:** The official consolidated PDF stops at March 6, 2025. On August 28, 2026, Rule 2(5)(c) regarding development permissions for plots up to 500 sq m was amended.
* **Decision:** Do not silently merge the unverified amendment. When a query touches Rule 2(5)(c) or 500 sq m plots, assign the status `VERSION_REVIEW_NEEDED` with an explicit alert (`AMENDMENT_2026_RULE_2_5_C`).
* **Rationale:** Legal honesty. A regulatory decision-support tool must alert users when statutory sources may be outdated rather than pretending an older document represents current law.
* **Consequences:** The system acknowledges its version boundary transparently.

---

## ADR-007: English PDF as Machine Source of Truth; Transparent Hindi Precedence

* **Status:** Accepted
* **Context:** The consolidated Hindi PDF uses a non-Unicode legacy font that extracts as corrupt text. However, judicially, the Hindi gazetted text prevails over the English translation (*Kurban Hussain v. Indore Municipal Corporation*).
* **Decision:** Use the clean English text as the machine-readable statutory corpus for search and tables, but explicitly flag Hindi queries with the `HINDI_TEXT_PREVAILS` warning.
* **Rationale:** Machine parsing corrupt Hindi font text leads to hallucinated legal advice. Using English ensures search fidelity, while the warning maintains legal transparency.
* **Consequences:** Hindi responses provide translated explanations rather than verbatim Hindi statutory quotes.

---

## ADR-008: Graceful Offline Fallback for AI Inference

* **Status:** Accepted
* **Context:** AI inference services can experience latency, network interruptions, or rate limits during counter operations.
* **Decision:** The Cerebras inference client is optional. If unconfigured or unresponsive, MIRA seamlessly falls back to pre-verified deterministic template summaries.
* **Rationale:** A municipal counter tool cannot fail when an external AI API is unreachable. Core search, citations, and calculations must function offline.
* **Consequences:** The application remains operational in air-gapped or disconnected environments.

---

## ADR-009: Monolithic Single-Origin Deployment Topology

* **Status:** Accepted
* **Context:** Deploying separate frontend and backend microservices introduces CORS configuration, multi-service latency, and deployment complexity.
* **Decision:** Package the compiled React SPA and FastAPI backend into a single container image. FastAPI serves the API under `/api/*` and static SPA files under `/`.
* **Rationale:** Greatly simplifies deployment on platforms like Render or municipal servers.
* **Consequences:** Requires building the frontend prior to container packaging.

---

## ADR-010: Vector Search with Dense Embeddings (Proposed)

* **Status:** Proposed (Post-MVP)
* **Context:** BM25 lexical search with synonym expansion handles most regulatory vocabulary well, but may miss nuanced conceptual queries.
* **Proposed Action:** Introduce a hybrid dense-sparse retrieval system pairing local embeddings with BM25.
