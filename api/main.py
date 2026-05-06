"""FastAPI entry — registers all 12 scenario routers + auth middleware + CORS."""
from __future__ import annotations
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.config import settings
from api.middleware_auth import CognitoBearerAuth

logging.basicConfig(level=settings.log_level)
log = logging.getLogger("mfg.api")

app = FastAPI(title="ontology-mfg api", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://mfg-ontology.whchoi.net", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CognitoBearerAuth, exempt_paths=["/healthz", "/docs", "/openapi.json"])


@app.get("/healthz")
def healthz():
    return {"status": "ok", "version": app.version}


# Routers registered in Tasks 16-25 — placeholder import here, fail-soft if not yet present
def _try_register():
    for module_name in [
        "auth",
        "search", "chat", "insights", "spec_match", "compliance",
        "substitute", "price", "scm_lane", "supplier_rfm", "eight_d",
        "esg_cbam", "pdm", "objects", "ops",
    ]:
        try:
            mod = __import__(f"api.routers.{module_name}", fromlist=["router"])
            app.include_router(mod.router, prefix="/api")
        except Exception as e:
            log.warning("router %s not yet registered: %s", module_name, e)


_try_register()
