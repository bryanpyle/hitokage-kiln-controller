#!/usr/bin/env python
"""FastAPI backend for the Vesuvius Kiln Controller.

Replaces kiln-controller.py (bottle/gevent) with a modern async server.
The PID controller and Oven/Zone logic in lib/ is kept completely intact.
"""

import asyncio
import json
import logging
import os
import queue
import sys
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── path setup ────────────────────────────────────────────────────────────────
_script_dir = os.path.dirname(os.path.realpath(__file__))
_repo_root = os.path.dirname(_script_dir)  # repo root is one level above backend/
sys.path.insert(0, _repo_root)
sys.path.insert(0, os.path.join(_repo_root, "lib"))

import config  # noqa: E402 – must come after path setup

logging.basicConfig(level=config.log_level, format=config.log_format)
log = logging.getLogger("kiln-fastapi")
log.info("Starting Vesuvius Kiln Controller (FastAPI)")

from oven import Profile, RealOven, SimulatedOven  # noqa: E402
from ovenWatcher import OvenWatcher  # noqa: E402

# ── zone helpers (kept identical to kiln-controller.py) ─────────────────────


def _default_zone_state_file(zone_id: int) -> str:
    return os.path.abspath(os.path.join(_repo_root, f"state-zone{zone_id}.json"))


def get_zone_configs():
    """Return a normalized list of zone configs (backward-compatible)."""
    zones = getattr(config, "zones", None)
    if zones:
        normalized = []
        for zone_id, zone in enumerate(zones):
            zone = zone or {}
            normalized.append(
                {
                    "id": zone_id,
                    "name": zone.get("name", f"Zone {zone_id + 1}"),
                    "spi_cs": zone.get("spi_cs", getattr(config, "spi_cs", None)),
                    "gpio_heat": zone.get("gpio_heat", getattr(config, "gpio_heat", None)),
                    "gpio_heat_invert": zone.get(
                        "gpio_heat_invert", getattr(config, "gpio_heat_invert", False)
                    ),
                    "pid_kp": zone.get("pid_kp", getattr(config, "pid_kp", None)),
                    "pid_ki": zone.get("pid_ki", getattr(config, "pid_ki", None)),
                    "pid_kd": zone.get("pid_kd", getattr(config, "pid_kd", None)),
                    "thermocouple_offset": zone.get(
                        "thermocouple_offset", getattr(config, "thermocouple_offset", 0)
                    ),
                    "automatic_restart_state_file": zone.get(
                        "automatic_restart_state_file",
                        _default_zone_state_file(zone_id),
                    ),
                }
            )
        return normalized

    # Legacy single-zone fallback
    return [
        {
            "id": 0,
            "name": "Zone 1",
            "spi_cs": getattr(config, "spi_cs", None),
            "gpio_heat": getattr(config, "gpio_heat", None),
            "gpio_heat_invert": getattr(config, "gpio_heat_invert", False),
            "pid_kp": getattr(config, "pid_kp", None),
            "pid_ki": getattr(config, "pid_ki", None),
            "pid_kd": getattr(config, "pid_kd", None),
            "thermocouple_offset": getattr(config, "thermocouple_offset", 0),
            "automatic_restart_state_file": getattr(
                config,
                "automatic_restart_state_file",
                _default_zone_state_file(0),
            ),
        }
    ]


ZONE_CONFIGS = get_zone_configs()

# ── oven / watcher instances ─────────────────────────────────────────────────
ovens: dict = {}
watchers: dict = {}


def _setup_ovens():
    if config.simulate:
        log.info("this is a simulation")
        for z in ZONE_CONFIGS:
            ovens[z["id"]] = SimulatedOven(
                zone_id=z["id"],
                zone_name=z["name"],
                pid_kp=z["pid_kp"],
                pid_ki=z["pid_ki"],
                pid_kd=z["pid_kd"],
                thermocouple_offset=z["thermocouple_offset"],
                automatic_restart_state_file=z["automatic_restart_state_file"],
            )
    else:
        log.info("this is a real kiln")
        for z in ZONE_CONFIGS:
            ovens[z["id"]] = RealOven(
                zone_id=z["id"],
                zone_name=z["name"],
                spi_cs=z["spi_cs"],
                gpio_heat=z["gpio_heat"],
                gpio_heat_invert=z["gpio_heat_invert"],
                pid_kp=z["pid_kp"],
                pid_ki=z["pid_ki"],
                pid_kd=z["pid_kd"],
                thermocouple_offset=z["thermocouple_offset"],
                automatic_restart_state_file=z["automatic_restart_state_file"],
            )

    for zone_id, oven in ovens.items():
        watcher = OvenWatcher(oven)
        watchers[zone_id] = watcher
        oven.set_ovenwatcher(watcher)

    log.info("Ovens and watchers ready (%d zone(s))", len(ovens))


# ── WebSocket bridge (sync OvenWatcher → async FastAPI) ─────────────────────


class QueuedObserver:
    """Drop-in replacement for the geventwebsocket socket object used by
    OvenWatcher.  OvenWatcher calls .send(str) from its background thread;
    the FastAPI WebSocket endpoint drains this queue asynchronously.
    """

    def __init__(self):
        self._q: queue.Queue = queue.Queue()

    def send(self, message: str):
        """Called synchronously by OvenWatcher's background thread."""
        self._q.put(message)

    async def drain(self, timeout: float = 1.0) -> Optional[str]:
        """Async-safe drain of one message; returns None if queue is empty."""
        loop = asyncio.get_event_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, self._q.get, True, timeout),
                timeout=timeout + 0.05,
            )
        except (asyncio.TimeoutError, queue.Empty, Exception):
            return None


# ── FastAPI lifespan ─────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    _setup_ovens()
    yield


# ── Application ──────────────────────────────────────────────────────────────

app = FastAPI(title="Vesuvius Kiln Controller", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_profile_path = config.kiln_profiles_directory


# ── Internal helpers ──────────────────────────────────────────────────────────


def _get_oven(zone_id: int):
    oven = ovens.get(zone_id)
    if oven is None:
        raise HTTPException(status_code=400, detail=f"Invalid zone {zone_id}")
    return oven


def _get_watcher(zone_id: int):
    watcher = watchers.get(zone_id)
    if watcher is None:
        raise HTTPException(status_code=400, detail=f"Invalid zone {zone_id}")
    return watcher


def _load_profiles():
    try:
        files = os.listdir(_profile_path)
    except Exception:
        files = []
    profiles = []
    for fn in sorted(files):
        if fn.endswith(".json"):
            try:
                with open(os.path.join(_profile_path, fn)) as f:
                    profiles.append(json.load(f))
            except Exception:
                pass
    return _normalize_temp_units(profiles)


def _normalize_temp_units(profiles):
    out = []
    for p in profiles:
        if "temp_units" in p:
            if config.temp_scale == "f" and p["temp_units"] == "c":
                p = _to_f(dict(p))
                p["temp_units"] = "f"
        out.append(p)
    return out


def _to_c(profile):
    profile["data"] = [[s, (5 / 9) * (t - 32)] for s, t in profile["data"]]
    return profile


def _to_f(profile):
    profile["data"] = [[s, ((9 / 5) * t) + 32] for s, t in profile["data"]]
    return profile


def _add_temp_units(profile):
    if "temp_units" in profile:
        return profile
    profile["temp_units"] = "c"
    if config.temp_scale == "f":
        profile = _to_c(profile)
    return profile


def _find_profile(name: str):
    for p in _load_profiles():
        if p["name"] == name:
            return p
    return None


# ── REST: config ──────────────────────────────────────────────────────────────


@app.get("/api/config")
def api_config():
    return {
        "temp_scale": config.temp_scale,
        "time_scale_slope": config.time_scale_slope,
        "time_scale_profile": config.time_scale_profile,
        "kwh_rate": config.kwh_rate,
        "currency_type": config.currency_type,
        "zones": [{"id": z["id"], "name": z["name"]} for z in ZONE_CONFIGS],
    }


# ── REST: profiles ────────────────────────────────────────────────────────────


@app.get("/api/profiles")
def api_list_profiles():
    return _load_profiles()


class ProfileBody(BaseModel):
    name: str
    data: list
    type: str = "profile"
    temp_units: Optional[str] = None


@app.post("/api/profiles")
def api_save_profile(body: ProfileBody):
    profile = body.model_dump(exclude_none=False)
    profile = _add_temp_units(profile)
    filename = profile["name"] + ".json"
    filepath = os.path.join(_profile_path, filename)
    with open(filepath, "w") as f:
        json.dump(profile, f, indent=2)
    log.info("Saved profile %s", filepath)
    return {"success": True}


@app.delete("/api/profiles/{name}")
def api_delete_profile(name: str):
    filepath = os.path.join(_profile_path, name + ".json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Profile not found")
    os.remove(filepath)
    log.info("Deleted profile %s", filepath)
    return {"success": True}


# ── REST: oven state & stats ──────────────────────────────────────────────────


@app.get("/api/state")
def api_state(zone: int = 0):
    return _get_oven(zone).get_state()


@app.get("/api/stats")
def api_stats(zone: int = 0):
    oven = _get_oven(zone)
    if hasattr(oven, "pid") and hasattr(oven.pid, "pidstats"):
        return oven.pid.pidstats
    return {}


# ── REST: control ─────────────────────────────────────────────────────────────


class ControlCommand(BaseModel):
    cmd: str  # run | stop | pause | resume
    zone: int = 0
    profile: Optional[str] = None
    startat: Optional[int] = 0


@app.post("/api/control")
def api_control(body: ControlCommand):
    oven = _get_oven(body.zone)
    watcher = _get_watcher(body.zone)

    if body.cmd == "run":
        profile_obj = _find_profile(body.profile or "")
        if profile_obj is None:
            raise HTTPException(
                status_code=404, detail=f"Profile '{body.profile}' not found"
            )
        startat = body.startat or 0
        allow_seek = startat == 0
        profile = Profile(json.dumps(profile_obj))
        oven.run_profile(profile, startat=startat, allow_seek=allow_seek)
        watcher.record(profile)

    elif body.cmd == "stop":
        oven.abort_run()

    elif body.cmd == "pause":
        oven.state = "PAUSED"

    elif body.cmd == "resume":
        oven.state = "RUNNING"

    else:
        raise HTTPException(status_code=400, detail=f"Unknown command: {body.cmd}")

    return {"success": True}


# ── WebSocket: real-time oven status ─────────────────────────────────────────


@app.websocket("/ws/status")
async def ws_status(websocket: WebSocket, zone: int = 0):
    """Streams oven state JSON for one zone every ~sensor_time_wait seconds."""
    await websocket.accept()

    watcher = watchers.get(zone)
    if watcher is None:
        await websocket.close(code=4000)
        return

    observer = QueuedObserver()
    watcher.add_observer(observer)
    log.info("WS /ws/status zone=%d opened", zone)

    try:
        while True:
            msg = await observer.drain(timeout=1.0)
            if msg is not None:
                await websocket.send_text(msg)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.error("WS error zone=%d: %s", zone, exc)
    finally:
        try:
            watcher.observers.remove(observer)
        except ValueError:
            pass
        log.info("WS /ws/status zone=%d closed", zone)


# ── Serve compiled React SPA (production) ────────────────────────────────────
_dist_dir = os.path.join(_repo_root, "frontend", "dist")
if os.path.isdir(_dist_dir):
    app.mount("/", StaticFiles(directory=_dist_dir, html=True), name="spa")
    log.info("Serving React SPA from %s", _dist_dir)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=config.listening_port,
        reload=False,
        log_level="info",
    )
