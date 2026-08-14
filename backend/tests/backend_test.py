"""Public smoke and OTC/Redis integration regression tests for BINEX."""

import json
import re
import time
from urllib.parse import urljoin

import pytest
import requests
from dotenv import dotenv_values
from websockets.sync.client import connect


frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (frontend_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing from /app/frontend/.env")


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Accept": "application/json, text/html"})
    return session


class TestPublicPages:
    """Public Next.js page availability and server-rendered landing content."""

    @pytest.mark.parametrize(
        ("path", "expected_text"),
        [
            ("/", "Perguntas frequentes"),
            ("/trade", ""),
            ("/login", ""),
        ],
    )
    def test_page_loads(self, api_client, path, expected_text):
        response = api_client.get(f"{BASE_URL}{path}", timeout=30)
        assert response.status_code == 200
        assert len(response.content) > 5_000
        assert "text/html" in response.headers.get("content-type", "")
        if expected_text:
            assert expected_text in response.text

    def test_landing_contains_all_required_sections(self, api_client):
        response = api_client.get(f"{BASE_URL}/", timeout=30)
        assert response.status_code == 200
        expected = [
            "Opere nos melhores ativos",
            "Comece em 3 passos",
            "Tudo que você precisa",
            "Copy Trading",
            "Segurança",
            "O que dizem nossos traders",
            "Perguntas frequentes",
            'data-testid="cta-register"',
        ]
        for text in expected:
            assert text in response.text, f"Missing landing section text: {text}"

    def test_vx_design_system_is_in_served_css(self, api_client):
        page_response = api_client.get(f"{BASE_URL}/", timeout=30)
        assert page_response.status_code == 200
        css_paths = sorted(set(re.findall(r'href="([^\"]+\.css[^\"]*)"', page_response.text)))
        assert css_paths, "No linked CSS assets found"
        css = "\n".join(
            api_client.get(urljoin(f"{BASE_URL}/", path), timeout=30).text
            for path in css_paths
        )
        for class_name in ["vx-panel", "vx-btn-blue", "vx-h1", "vx-step-done"]:
            assert f".{class_name}" in css, f"Missing compiled CSS class .{class_name}"


class TestHealthAndOtc:
    """Fastify health plus OTC engine data served through Redis-backed routes."""

    def test_health(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/be/health", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert isinstance(data["timestamp"], str) and "T" in data["timestamp"]

    def test_otc_assets_are_enabled(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/be/market-data/otc", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data.get("assets"), list)
        assert len(data["assets"]) >= 1
        assert all(asset.get("symbol", "").endswith("-OTC") for asset in data["assets"])
        assert all(isinstance(asset.get("open"), bool) for asset in data["assets"])

    def test_otc_websocket_delivers_snapshot(self):
        ws_base = BASE_URL.replace("https://", "wss://", 1).replace("http://", "ws://", 1)
        with connect(f"{ws_base}/api/be/ws/market/EURUSD-OTC", open_timeout=10) as websocket:
            message = json.loads(websocket.recv(timeout=10))
        assert message["symbol"] == "EURUSD-OTC"
        assert isinstance(message["price"], (int, float)) and message["price"] > 0
        assert isinstance(message["t"], int)
        assert message.get("snapshot") is True


    def test_otc_price_is_live_and_redis_backed(self, api_client):
        endpoint = f"{BASE_URL}/api/be/market-data/otc/EURUSD-OTC/price"
        first_response = api_client.get(endpoint, timeout=15)
        assert first_response.status_code == 200
        first = first_response.json()
        assert first["symbol"] == "EURUSD-OTC"
        assert isinstance(first["price"], (int, float)) and first["price"] > 0
        assert isinstance(first["t"], int)

        changed = False
        latest = first
        for _ in range(4):
            time.sleep(1.1)
            response = api_client.get(endpoint, timeout=15)
            assert response.status_code == 200
            latest = response.json()
            if latest["price"] != first["price"]:
                changed = True
                break
        assert latest["t"] > first["t"]
        assert changed, "OTC price did not change across four engine ticks"

    def test_otc_candles_have_valid_ohlc_data(self, api_client):
        response = api_client.get(
            f"{BASE_URL}/api/be/market-data/otc/EURUSD-OTC/candles",
            params={"tf": 60, "limit": 20},
            timeout=30,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == "EURUSD-OTC"
        assert data["tf"] == 60
        assert isinstance(data["candles"], list) and len(data["candles"]) >= 1
        for candle in data["candles"]:
            assert set(candle) == {"t", "o", "h", "l", "c"}
            assert candle["l"] <= candle["o"] <= candle["h"]
            assert candle["l"] <= candle["c"] <= candle["h"]
