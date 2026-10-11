"""HTTP API under /api."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import ValidationError

from app import calculations
from app.calculations.common import SOURCE_STATUS, SourceUnavailable
from app.models.schemas import SOURCE_DOCUMENT, SOURCE_PDF, AnswerRequest, AnswerResponse, CalcResult, CalculateRequest
from app.rules.loader import normalize_rule_id
from app.rules.version_warnings import AMENDMENT_2026, CONSOLIDATION_DATE

router = APIRouter(prefix="/api")


def _state(request: Request):
    st = request.app.state
    if getattr(st, "store", None) is None:
        raise HTTPException(status_code=503, detail="Rule data is not loaded.")
    return st


@router.get("/health")
def health(request: Request):
    st = request.app.state
    store = getattr(st, "store", None)
    ok = store is not None
    return {
        "status": "ok" if ok else "degraded",
        "rules_loaded": len(store.records) if ok else 0,
        "passages_indexed": len(store.chunks) if ok else 0,
        "pages_loaded": len(store.pages) if ok else 0,
        "verified_sources": {"ok": sum(SOURCE_STATUS.values()), "total": len(SOURCE_STATUS)},
        "ai_configured": bool(getattr(st, "llm", None) and st.llm.available),
        "frontend_built": bool(getattr(st, "frontend_built", False)),
    }


@router.get("/sources")
def sources(request: Request):
    st = _state(request)
    return {
        "documents": [
            {
                "name": SOURCE_DOCUMENT,
                "file": SOURCE_PDF,
                "consolidated_up_to": CONSOLIDATION_DATE,
                "role": "Primary source for wording and tables",
                "origin": "https://mptownplan.gov.in/NewsPDF/bvn06032025E.pdf (via the Bhopal Impact Lab 2026 Track 1 participant pack)",
            },
            {
                "name": "M.P. Bhumi Vikas Rules, 2012 (Hindi, consolidated up to 06-03-2025)",
                "file": "MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_HI.pdf",
                "consolidated_up_to": CONSOLIDATION_DATE,
                "role": "Reference only; its legacy font does not extract reliably, so it is not machine-parsed",
                "origin": "https://mptownplan.gov.in/NewsPDF/bvn06032025H.pdf",
            },
            {
                "name": "bhumi_vikas_rules.jsonl",
                "file": "data/bhumi_vikas_rules.jsonl",
                "consolidated_up_to": CONSOLIDATION_DATE,
                "role": f"{len(st.store.records)} rule records split from the English PDF by the organisers",
                "origin": "Bhopal Impact Lab 2026 Track 1 participant pack",
            },
        ],
        "version_warnings": [AMENDMENT_2026.model_dump()],
        "verified_calculation_sources": [{"key": k, "ok": v} for k, v in SOURCE_STATUS.items()],
    }


@router.get("/rules/search")
def search_rules(request: Request, q: str = Query(min_length=1, max_length=300), limit: int = Query(8, ge=1, le=25)):
    st = _state(request)
    q = q.strip()
    if not q:
        raise HTTPException(status_code=422, detail="Query must not be blank.")
    direct = st.retriever.direct_rules(q)
    hits, terms = st.retriever.search(q, k=limit)
    return {
        "query": q,
        "terms": terms,
        "direct_matches": direct,
        "results": [
            {
                "rule": h.chunk.rule,
                "title": h.chunk.title,
                "page": h.chunk.page,
                "sub_rule": h.chunk.sub_rule,
                "chunk_id": h.chunk.chunk_id,
                "score": h.score,
                "passage": h.chunk.text.strip(),
                "is_comment": h.chunk.is_comment,
            }
            for h in hits
        ],
    }


@router.get("/rules")
def list_rules(request: Request):
    st = _state(request)
    return {
        "total": len(st.store.records),
        "rules": [
            {
                "rule": rec.rule,
                "title": rec.title,
                "part": rec.part,
                "page_start": rec.page_start,
                "page_end": rec.page_end,
            }
            for rec in st.store.records.values()
        ],
    }


@router.get("/rules/{rule_id}")
def get_rule(request: Request, rule_id: str):
    st = _state(request)
    norm = normalize_rule_id(rule_id)
    if norm is None:
        raise HTTPException(status_code=422, detail="Rule id must look like '56', '26-B' or '12-A'.")
    rec = st.store.records.get(norm)
    embedded_in = None
    if rec is None:
        emb = st.store.find_embedded(norm)
        if not emb:
            raise HTTPException(status_code=404, detail=f"Rule {norm} is not in the supplied rules.")
        rec, _chunk = emb
        embedded_in = rec.rule
    return {
        "rule": norm,
        "title": rec.title,
        "part": rec.part,
        "page_start": rec.page_start,
        "page_end": rec.page_end,
        "embedded_in": embedded_in,
        "document": SOURCE_DOCUMENT,
        "passages": [
            {"chunk_id": c.chunk_id, "page": c.page, "sub_rule": c.sub_rule, "text": c.text.strip(), "is_comment": c.is_comment}
            for c in st.store.chunks_for(rec.rule)
        ],
    }


@router.post("/calculate", response_model=list[CalcResult])
def calculate(request: Request, body: CalculateRequest):
    _state(request)
    try:
        return calculations.run(body.calc_type, body.inputs)
    except SourceUnavailable:
        raise HTTPException(
            status_code=503,
            detail="This calculation is disabled because its source table could not be verified against the loaded data.",
        )


@router.post("/answer", response_model=AnswerResponse)
def answer(request: Request, body: AnswerRequest):
    st = _state(request)
    try:
        return st.answers.answer(body)
    except ValidationError as exc:
        msgs = [str(e.get("msg", "invalid input")).removeprefix("Value error, ") for e in exc.errors()]
        raise HTTPException(status_code=422, detail="; ".join(msgs))


@router.post("/query", response_model=AnswerResponse)
def query(request: Request, body: AnswerRequest):
    return answer(request, body)

