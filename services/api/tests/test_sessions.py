"""Tests for the LiDAR session lifecycle.

Hermetic: B2 (session_store) and the SLAM engine (lidar_engine) are stubbed at
their module boundary, so no external network or kiss-icp install is needed.
The orchestration in service/sessions.py runs for real.
"""

from datetime import UTC, datetime

import numpy as np
import pytest

from app.repo import lidar_engine, session_store
from app.service import session_run
from app.types import Session

_UUID = "11111111-1111-4111-8111-111111111111"


def _fake_session(**overrides) -> Session:
    now = datetime.now(UTC)
    defaults = dict(
        session_id=_UUID,
        session_name="warehouse-loop-1",
        robot_id="robot-01",
        scan_source="synthetic",
        scene="warehouse",
        num_frames=60,
        quality="balanced",
        status="ingested",
        created_at=now,
        updated_at=now,
        scan_prefix=f"scans/robot-01/{_UUID}/",
    )
    defaults.update(overrides)
    return Session(**defaults)


@pytest.mark.asyncio
async def test_create_session_returns_ingesting(client, monkeypatch):
    stored = {}
    monkeypatch.setattr(session_store, "put_session", lambda s: stored.update(s=s))
    # Neutralize the background ingest so the test never touches B2.
    monkeypatch.setattr(session_run, "ingest_session", lambda sid: None)

    resp = await client.post(
        "/sessions",
        json={
            "session_name": "warehouse-loop-1",
            "robot_id": "robot-01",
            "scan_source": "synthetic",
            "scene": "warehouse",
            "num_frames": 60,
            "quality": "balanced",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ingesting"
    assert body["session_name"] == "warehouse-loop-1"
    assert body["scan_prefix"].startswith("scans/robot-01/")


@pytest.mark.asyncio
async def test_create_rejects_non_preset_frame_count(client):
    resp = await client.post(
        "/sessions",
        json={"session_name": "x", "robot_id": "r", "num_frames": 99},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_missing_session_returns_404(client, monkeypatch):
    monkeypatch.setattr(session_store, "get_session", lambda sid: None)
    resp = await client.get(f"/sessions/{_UUID}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_sessions(client, monkeypatch):
    monkeypatch.setattr(session_store, "list_sessions", lambda: [_fake_session()])
    resp = await client.get("/sessions")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["session_id"] == _UUID


@pytest.mark.asyncio
async def test_run_rejects_while_ingesting(client, monkeypatch):
    monkeypatch.setattr(
        session_store, "get_session", lambda sid: _fake_session(status="ingesting")
    )
    monkeypatch.setattr(session_store, "put_session", lambda s: None)
    resp = await client.post(f"/sessions/{_UUID}/run")
    assert resp.status_code == 409


def test_run_marks_failed_when_engine_unavailable(monkeypatch):
    # By the time the background task runs, request_run() has already
    # persisted status="running" synchronously (see runtime/sessions.py).
    session = _fake_session(status="running")
    saved = []
    monkeypatch.setattr(session_store, "get_session", lambda sid: session)
    monkeypatch.setattr(
        session_store, "list_keys", lambda prefix: [f"{prefix}frame_000001.bin"]
    )
    monkeypatch.setattr(
        session_store, "get_bytes", lambda key: np.zeros((10, 4), np.float32).tobytes()
    )
    monkeypatch.setattr(session_store, "put_session", lambda s: saved.append(s))

    def _boom(*args, **kwargs):
        raise lidar_engine.EngineUnavailableError("no wheel here")

    monkeypatch.setattr(lidar_engine, "run_odometry", _boom)

    session_run.run_session(_UUID)

    assert saved and saved[-1].status == "failed"
    assert "no wheel" in (saved[-1].error or "")


def test_run_completes_and_archives_artifacts(monkeypatch):
    # Same precondition as above: request_run() already flipped this to
    # "running" before the background task starts.
    session = _fake_session(status="running", num_frames=4)
    saved = {}
    puts: list[str] = []
    monkeypatch.setattr(session_store, "get_session", lambda sid: session)
    monkeypatch.setattr(
        session_store,
        "list_keys",
        lambda prefix: [f"{prefix}frame_{i:06d}.bin" for i in range(1, 5)],
    )
    monkeypatch.setattr(
        session_store, "get_bytes", lambda key: np.zeros((50, 4), np.float32).tobytes()
    )
    monkeypatch.setattr(session_store, "put_session", lambda s: saved.update(s=s))
    monkeypatch.setattr(
        session_store, "put_bytes", lambda key, data, ct: puts.append(key)
    )

    poses = []
    for i in range(4):
        pose = np.eye(4)
        pose[0, 3] = float(i)  # 1 m of straight-line travel between frames
        poses.append(pose)
    result = lidar_engine.OdometryResult(
        poses=poses, map_points=np.zeros((10, 3)), snapshots=[]
    )
    monkeypatch.setattr(lidar_engine, "run_odometry", lambda frames, **k: result)

    session_run.run_session(_UUID)

    completed = saved["s"]
    assert completed.status == "complete"
    assert completed.metrics.frame_count == 4
    assert completed.metrics.trajectory_distance_m > 0
    assert completed.metrics.ate_rmse_m is not None  # synthetic -> ground truth
    assert completed.trajectory_txt_key and completed.trajectory_geojson_key
    assert any(k.startswith("maps/") for k in puts)
    assert any(k.startswith("odometry/") for k in puts)
    assert any(k.startswith("trajectories/") for k in puts)
