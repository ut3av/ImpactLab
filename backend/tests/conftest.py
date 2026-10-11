from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.calculations import common  # noqa: E402
from app.config import REPO_ROOT, Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.rules.loader import load_store  # noqa: E402
from app.rules.verified_tables import verify_against_store  # noqa: E402

DATA_DIR = REPO_ROOT / "data"


def make_settings(**kw) -> Settings:
    base = dict(cerebras_api_key=None, data_dir=DATA_DIR, _env_file=None)
    base.update(kw)
    return Settings(**base)


@pytest.fixture(scope="session")
def store():
    s = load_store(DATA_DIR)
    common.SOURCE_STATUS.clear()
    common.SOURCE_STATUS.update(verify_against_store(s))
    return s


@pytest.fixture(scope="session")
def client(store):
    app = create_app(make_settings())
    with TestClient(app) as c:
        yield c


@pytest.fixture
def ask(client):
    def _ask(question: str, inputs: dict | None = None, **kw):
        body = {"question": question, **kw}
        if inputs is not None:
            body["inputs"] = inputs
        r = client.post("/api/answer", json=body)
        assert r.status_code == 200, r.text
        return r.json()

    return _ask
