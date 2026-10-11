from app.models.schemas import AnswerResponse


def test_health(client):
    d = client.get("/api/health").json()
    assert d["status"] == "ok" and d["rules_loaded"] == 106 and d["pages_loaded"] == 108
    assert d["verified_sources"]["ok"] == d["verified_sources"]["total"] > 0
    assert d["ai_configured"] is False
    assert "key" not in str(d).lower()


def test_health_degraded_without_data(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.conftest import make_settings

    app = create_app(make_settings(data_dir=tmp_path))
    with TestClient(app) as c:
        assert c.get("/api/health").json()["status"] == "degraded"
        assert c.post("/api/answer", json={"question": "fee"}).status_code == 503


def test_sources(client):
    d = client.get("/api/sources").json()
    assert any("2025" in x["consolidated_up_to"] for x in d["documents"])
    assert d["version_warnings"][0]["code"] == "AMENDMENT_2026_RULE_2_5_C"


def test_rule_lookup(client):
    d = client.get("/api/rules/56").json()
    assert d["title"] == "Residential Buildings" and d["page_start"] == 77
    assert client.get("/api/rules/26b").json()["rule"] == "26-B"
    emb = client.get("/api/rules/12-A").json()
    assert emb["embedded_in"] == "12"
    assert client.get("/api/rules/999").status_code == 404
    assert client.get("/api/rules/abc").status_code == 422


def test_search(client):
    d = client.get("/api/rules/search", params={"q": "farm house minimum plot"}).json()
    assert d["results"][0]["rule"] == "17" and d["results"][0]["page"] == 34
    d = client.get("/api/rules/search", params={"q": "rule 52"}).json()
    assert d["direct_matches"] == ["52"]


def test_search_rejects_empty(client):
    assert client.get("/api/rules/search", params={"q": ""}).status_code == 422
    assert client.get("/api/rules/search", params={"q": "   "}).status_code == 422
    assert client.get("/api/rules/search").status_code == 422


def test_answer_rejects_bad_requests(client):
    assert client.post("/api/answer", json={"question": ""}).status_code == 422
    assert client.post("/api/answer", json={"question": "   "}).status_code == 422
    assert client.post("/api/answer", json={"question": "x" * 1001}).status_code == 422
    assert client.post("/api/answer", json={"question": "fee", "extra": 1}).status_code == 422
    assert client.post("/api/answer", content=b"not json", headers={"content-type": "application/json"}).status_code == 422


def test_body_size_limit(client):
    r = client.post("/api/answer", content=b"{" + b" " * 40_000 + b"}", headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_inconsistent_inputs_return_422(client):
    r = client.post("/api/answer", json={"question": "rear open space", "inputs": {"plot_width_m": 10, "plot_depth_m": 10, "plot_area_sqm": 500}})
    assert r.status_code == 422 and "does not match" in r.json()["detail"]


def test_calculate_endpoint(client):
    r = client.post("/api/calculate", json={"calc_type": "site_open_spaces", "inputs": {
        "plot_width_m": 10, "plot_depth_m": 15, "road_width_m": 9, "building_height_m": 7,
        "building_use": "residential", "building_type": "detached"}})
    assert r.status_code == 200
    by = {c["calc_type"]: c for c in r.json()}
    assert by["front_open_space"]["value"] == 3.0
    assert by["rear_open_space"]["value"] == 1.5
    assert by["side_open_space"]["breakdown"] == {"left_m": 3.0, "right_m": 1.5}
    assert {z["side"] for c in r.json() for z in c["zones"]} == {"front", "rear", "left", "right"}


def test_calculate_rejects_unsupported(client):
    assert client.post("/api/calculate", json={"calc_type": "far", "inputs": {}}).status_code == 422
    assert client.post("/api/calculate", json={"calc_type": "front_open_space", "inputs": {"road_width_m": -3}}).status_code == 422


def test_unknown_api_route_is_json_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["detail"] == "Not found."


def test_answer_schema_valid(ask):
    d = ask("What is the fee for building permission for a residential house?")
    AnswerResponse.model_validate(d)
