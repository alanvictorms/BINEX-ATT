"""Reverse proxy: /api/be/* -> Fastify API (3001), everything else -> Next.js (3000)."""
import asyncio

import httpx
import websockets
from fastapi import FastAPI, Request, WebSocket
from starlette.responses import Response
from starlette.websockets import WebSocketDisconnect

API_TARGET = "http://127.0.0.1:3001"
WEB_TARGET = "http://127.0.0.1:3000"
API_PREFIX = "/api/be"

HOP = {"host", "content-length", "transfer-encoding", "connection", "keep-alive"}
DROP_RESP = {"content-length", "transfer-encoding", "connection", "keep-alive"}

app = FastAPI()
client = httpx.AsyncClient(timeout=httpx.Timeout(120.0), follow_redirects=False)


@app.websocket(API_PREFIX + "/{path:path}")
async def ws_proxy(ws: WebSocket, path: str):
    await ws.accept()
    query = ws.url.query
    url = f"ws://127.0.0.1:3001/{path}" + (f"?{query}" if query else "")
    try:
        async with websockets.connect(url) as upstream:
            async def c2u():
                while True:
                    msg = await ws.receive_text()
                    await upstream.send(msg)

            async def u2c():
                async for msg in upstream:
                    if isinstance(msg, bytes):
                        await ws.send_bytes(msg)
                    else:
                        await ws.send_text(msg)

            done, pending = await asyncio.wait(
                [asyncio.create_task(c2u()), asyncio.create_task(u2c())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in pending:
                t.cancel()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def http_proxy(request: Request, full_path: str):
    path = "/" + full_path
    if path == API_PREFIX or path.startswith(API_PREFIX + "/"):
        base = API_TARGET
        path = path[len(API_PREFIX):] or "/"
    else:
        base = WEB_TARGET
    url = base + path
    if request.url.query:
        url += "?" + request.url.query

    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP}
    body = await request.body()
    try:
        upstream = await client.request(request.method, url, headers=headers, content=body)
    except httpx.ConnectError:
        return Response(content=b"upstream unavailable", status_code=502)

    content = upstream.content
    resp = Response(content=content, status_code=upstream.status_code)
    raw = [
        (k.encode(), v.encode())
        for k, v in upstream.headers.multi_items()
        if k.lower() not in DROP_RESP
    ]
    raw.append((b"content-length", str(len(content)).encode()))
    resp.raw_headers = raw
    return resp
