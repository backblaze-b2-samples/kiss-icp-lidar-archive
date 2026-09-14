"""Background ingest + KISS-ICP run for a session (split from sessions.py to
stay under the 300-line file ceiling).

Both entry points are executed via FastAPI BackgroundTasks. They persist their
status/metrics into the session's `index.json`, which the UI polls. boto3 stays
in repo/ (session_store); the SLAM engine stays in repo/ (lidar_engine); the
numpy helpers (scan_generator, ply_export) are service-layer.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import UTC, datetime

import numpy as np

from app.repo import lidar_engine, session_store
from app.service import ply_export, scan_generator
from app.service.sessions import SessionStateError, get_session
from app.types import Session, SessionMetrics

logger = logging.getLogger(__name__)

SNAPSHOT_EVERY = 30  # write an incremental map .ply every N frames
ODOMETRY_BATCH = 30  # poses per odometry JSON batch
PROGRESS_UPDATES = 12  # target interim persists spread across an op, first one early


def _now() -> datetime:
    return datetime.now(UTC)


def _seed(session_id: str) -> int:
    return uuid.UUID(session_id).int % (2**32)


def _progress_step(total: int) -> int:
    """Cadence for interim persists: ~PROGRESS_UPDATES spread across `total`,
    so the first update lands within the first ~10% instead of waiting on a
    fixed frame count (see module docstring note in the two call sites)."""
    return max(1, total // PROGRESS_UPDATES)


def _frame_to_bin(frame: np.ndarray) -> bytes:
    """KITTI-style .bin: float32 x,y,z,intensity (intensity 0 for synthetic)."""
    pts = np.asarray(frame, dtype=np.float32).reshape(-1, 3)
    kitti = np.zeros((len(pts), 4), dtype=np.float32)
    kitti[:, :3] = pts
    return kitti.tobytes(order="C")


def _read_frame(key: str) -> np.ndarray:
    data = session_store.get_bytes(key)
    return np.frombuffer(data, dtype=np.float32).reshape(-1, 4)[:, :3]


def _mark_failed(session: Session, message: str) -> None:
    logger.warning("Session %s failed: %s", session.session_id, message)
    session.status = "failed"
    session.error = message
    session.updated_at = _now()
    try:
        session_store.put_session(session)
    except Exception:
        logger.exception("Could not persist failed status for %s", session.session_id)


# --- ingest ------------------------------------------------------------------

def ingest_session(session_id: str) -> None:
    """Background task: generate + upload synthetic scans, then mark `ingested`."""
    session = session_store.get_session(session_id)
    if session is None:
        return
    try:
        if session.scan_source == "synthetic":
            _ingest_synthetic(session)
        else:
            # Upload path (secondary): the user adds real scans under the
            # session's scan prefix via the Upload page; nothing to generate.
            session.status = "ingested"
            session.updated_at = _now()
            session_store.put_session(session)
    except Exception as exc:
        _mark_failed(session, f"Ingest failed: {exc}")


def _ingest_synthetic(session: Session) -> None:
    prefix = session.scan_prefix
    frames = scan_generator.generate_frames(
        session.scene, session.num_frames, seed=_seed(session.session_id)
    )
    total_bytes = 0
    progress_step = _progress_step(session.num_frames)
    for i, frame in enumerate(frames, start=1):
        data = _frame_to_bin(frame)
        session_store.put_bytes(
            session_store.scan_frame_key(prefix, i), data, "application/octet-stream"
        )
        total_bytes += len(data)
        # Throttled interim persist: ingest is B2-I/O-bound and can run well
        # over 10s, so without this the UI's poll of GET /sessions/{id} sees
        # no movement (Frames/Scan data stuck at 0) until the very end. The
        # step is sized off num_frames so the first update lands within the
        # first ~10% of frames (a few seconds in) rather than waiting on a
        # fixed frame count, and ~PROGRESS_UPDATES land across the whole op
        # regardless of preset size. Mirrors _on_progress in _do_run below.
        # Status stays "ingesting" (unchanged) until the unconditional final
        # persist below.
        if i % progress_step == 0:
            session.scan_keys_count = i
            session.metrics = SessionMetrics(frame_count=0, scan_bytes=total_bytes)
            session.updated_at = _now()
            try:
                session_store.put_session(session)
            except Exception:
                logger.exception(
                    "Could not persist ingest progress for %s", session.session_id
                )
    session.scan_keys_count = len(frames)
    session.metrics = SessionMetrics(frame_count=0, scan_bytes=total_bytes)
    session.status = "ingested"
    session.updated_at = _now()
    session_store.put_session(session)


# --- run (headline capability) -----------------------------------------------

def request_run(session_id: str) -> Session:
    """Validate that a run is allowed and flip status to `running` synchronously.

    Returns the updated record so the POST responds immediately while the
    background task does the work. Raises SessionStateError if not runnable.
    """
    session = get_session(session_id)
    if session.status in ("ingesting", "running"):
        raise SessionStateError(f"Session is {session.status}; cannot run yet.")
    session.status = "running"
    session.error = None
    session.updated_at = _now()
    session_store.put_session(session)
    return session


def run_session(session_id: str) -> None:
    """Background task: run KISS-ICP over the session's scans and archive output."""
    session = session_store.get_session(session_id)
    if session is None or session.status != "running":
        return
    try:
        _do_run(session)
    except lidar_engine.EngineUnavailableError as exc:
        _mark_failed(session, str(exc))
    except Exception as exc:
        _mark_failed(session, f"Run failed: {exc}")


def _do_run(session: Session) -> None:
    scan_keys = [
        k for k in session_store.list_keys(session.scan_prefix) if k.endswith(".bin")
    ]
    if not scan_keys:
        raise RuntimeError("No scan frames found. Ingest or upload scans first.")

    started = time.monotonic()
    frames = (_read_frame(k) for k in scan_keys)
    progress_step = _progress_step(len(scan_keys))

    def _on_progress(frame_count: int) -> None:
        # Throttled: a run over hundreds of frames can take well over 10s, and
        # without this the UI's poll of GET /sessions/{id} sees no movement
        # until the very end. Step sized off the actual frame total so the
        # first update lands early and ~PROGRESS_UPDATES land across the run
        # (see _progress_step / the mirrored comment in _ingest_synthetic).
        if frame_count % progress_step:
            return
        session.metrics = SessionMetrics(
            frame_count=frame_count, scan_bytes=session.metrics.scan_bytes
        )
        session.updated_at = _now()
        try:
            session_store.put_session(session)
        except Exception:
            logger.exception(
                "Could not persist run progress for %s", session.session_id
            )

    result = lidar_engine.run_odometry(
        frames,
        quality=session.quality,
        snapshot_every=SNAPSHOT_EVERY,
        on_progress=_on_progress,
    )

    sid = session.session_id
    odometry_keys = _write_odometry(sid, result.poses)
    map_keys = _write_maps(sid, result.snapshots, result.map_points)

    positions = np.array([np.asarray(p).reshape(4, 4)[:3, 3] for p in result.poses])
    ground_truth = (
        scan_generator.ground_truth_local(session.scene, len(result.poses))
        if session.scan_source == "synthetic"
        else None
    )
    txt_key = session_store.trajectory_txt_key(sid)
    geojson_key = session_store.trajectory_geojson_key(sid)
    session_store.put_bytes(
        txt_key, ply_export.write_tum(result.poses).encode(), "text/plain"
    )
    session_store.put_bytes(
        geojson_key,
        ply_export.write_geojson(positions, ground_truth).encode(),
        "application/geo+json",
    )

    session.metrics = SessionMetrics(
        frame_count=len(result.poses),
        scan_bytes=session.metrics.scan_bytes,
        map_snapshot_count=len(map_keys),
        map_point_count=len(result.map_points),
        trajectory_distance_m=round(_path_length(positions), 3),
        ate_rmse_m=_ate(positions, ground_truth),
        run_seconds=round(time.monotonic() - started, 2),
    )
    session.odometry_keys = odometry_keys
    session.map_keys = map_keys
    session.trajectory_txt_key = txt_key
    session.trajectory_geojson_key = geojson_key
    session.status = "complete"
    session.error = None
    session.updated_at = _now()
    session_store.put_session(session)


def _write_odometry(session_id: str, poses: list[np.ndarray]) -> list[str]:
    keys: list[str] = []
    for batch_index, start in enumerate(range(0, len(poses), ODOMETRY_BATCH), start=1):
        chunk = poses[start : start + ODOMETRY_BATCH]
        payload = {
            "session_id": session_id,
            "batch": batch_index,
            "frames": [
                {
                    "index": start + offset,
                    "pose": np.asarray(pose, dtype=float).reshape(16).tolist(),
                    "position": np.asarray(pose, dtype=float)
                    .reshape(4, 4)[:3, 3]
                    .tolist(),
                }
                for offset, pose in enumerate(chunk)
            ],
        }
        key = session_store.odometry_key(session_id, batch_index)
        session_store.put_bytes(key, json.dumps(payload).encode(), "application/json")
        keys.append(key)
    return keys


def _write_maps(
    session_id: str, snapshots: list[tuple[int, np.ndarray]], final: np.ndarray
) -> list[str]:
    keys: list[str] = []
    clouds = [pts for _, pts in snapshots]
    # Always include a final snapshot (even when num_frames < SNAPSHOT_EVERY).
    if not clouds or len(final) != len(clouds[-1]):
        clouds.append(final)
    for index, cloud in enumerate(clouds, start=1):
        key = session_store.map_key(session_id, index)
        session_store.put_bytes(
            key, ply_export.write_ply(cloud), "application/octet-stream"
        )
        keys.append(key)
    return keys


def _path_length(positions: np.ndarray) -> float:
    if len(positions) < 2:
        return 0.0
    return float(np.linalg.norm(np.diff(positions, axis=0), axis=1).sum())


def _ate(positions: np.ndarray, ground_truth: np.ndarray | None) -> float | None:
    if ground_truth is None or len(ground_truth) != len(positions) or not len(positions):
        return None
    errors = np.linalg.norm(positions - ground_truth, axis=1)
    return round(float(np.sqrt(np.mean(errors**2))), 4)
