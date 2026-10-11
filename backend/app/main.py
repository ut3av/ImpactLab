"""NIYAMLENS FastAPI application: JSON API under /api and the built React app at /."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router
from app.calculations import common
from app.config import Settings, get_settings
from app.rules.loader import RuleDataError, load_store
from app.rules.verified_tables import verify_against_store
from app.services.answer import AnswerService
from app.services.llm import LLMClient
from app.services.retrieval import Retriever

log = logging.getLogger("niyamlens")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.store = None
        try:
            store = load_store(settings.data_dir)
            app.state.store = store
            app.state.retriever = Retriever(store)
            common.SOURCE_STATUS.clear()
            common.SOURCE_STATUS.update(verify_against_store(store))
            bad = [k for k, ok in common.SOURCE_STATUS.items() if not ok]
            if bad:
                log.warning("Verified sources failed self-check and are disabled: %s", bad)
            log.info("Loaded %d rules, %d passages, %d pages", len(store.records), len(store.chunks), len(store.pages))
        except RuleDataError as exc:
            log.error("Rule data could not be loaded: %s", exc)
        app.state.llm = LLMClient(settings)
        log.info(
            "AI explanation %s (model setting: %s)",
            "enabled" if settings.ai_configured else "disabled (no CEREBRAS_API_KEY)",
            settings.cerebras_model,
        )
        if app.state.store is not None:
            app.state.answers = AnswerService(app.state.store, app.state.retriever, app.state.llm)
        yield

    app = FastAPI(
        title="NIYAMLENS API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            length = request.headers.get("content-length")
            if length is not None and length.isdigit():
                if int(length) > settings.max_body_bytes:
                    return JSONResponse({"detail": "Request body too large."}, status_code=413)
            elif request.url.path.startswith("/api/"):
                body = await request.body()
                if len(body) > settings.max_body_bytes:
                    return JSONResponse({"detail": "Request body too large."}, status_code=413)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        errors = [
            {"loc": [str(x) for x in e.get("loc", [])], "msg": str(e.get("msg", "")).removeprefix("Value error, ")}
            for e in exc.errors()
        ]
        summary = "; ".join(dict.fromkeys(e["msg"] for e in errors if e["msg"])) or "Invalid request."
        return JSONResponse({"detail": summary[:500], "errors": errors}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.error("Unhandled error on %s: %s", request.url.path, type(exc).__name__)
        return JSONResponse({"detail": "Internal error. Please try again."}, status_code=500)

    app.include_router(router)

    static_dir: Path = settings.static_dir
    index = static_dir / "index.html"
    app.state.frontend_built = index.is_file()
    if (static_dir / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    async def api_not_found(path: str):
        return JSONResponse({"detail": "Not found."}, status_code=404)

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        root = static_dir.resolve()
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and root in candidate.parents:
            return FileResponse(candidate)
        if index.is_file():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        return JSONResponse({"detail": "Frontend not built. Run `npm run build` in frontend/."}, status_code=404)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
