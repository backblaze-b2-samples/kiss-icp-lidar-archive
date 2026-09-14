"""Session CRUD, stats, and trajectory retrieval.

DB-less: every session is a `sessions/<id>/index.json` object in B2. The
background ingest and KISS-ICP run live in `session_run.py` (split out to keep
each authored file under the 300-line ceiling). boto3 stays in repo/
(session_store).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime

from app.repo import session_store
from app.types import Session, SessionCreate, SessionStats, SessionUpdate
from app.types.formatting import humanize_bytes

logger = logging.getLogger(__name__)


class SessionNotFoundError(Exception):
    def __init__(self, detail: str = "Session not found"):
        self.detail = detail
        super().__init__(detail)


class SessionStateError(Exception):
    """Raised when an operation is invalid for the session's current status."""

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


def _now() -> datetime:
    return datetime.now(UTC)


def create_session(payload: SessionCreate) -> Session:
    """Create the record (status `ingesting`); the caller schedules ingest."""
    session_id = str(uuid.uuid4())
    now = _now()
    session = Session(
        session_id=session_id,
        session_name=payload.session_name,
        robot_id=payload.robot_id,
        scan_source=payload.scan_source,
        scene=payload.scene,
        num_frames=payload.num_frames,
        quality=payload.quality,
        status="ingesting",
        created_at=now,
        updated_at=now,
        scan_prefix=session_store.scan_prefix_for(payload.robot_id, session_id),
    )
    session_store.put_session(session)
    return session


def get_session(session_id: str) -> Session:
    session = session_store.get_session(session_id)
    if session is None:
        raise SessionNotFoundError()
    return session


def list_sessions() -> list[Session]:
    return session_store.list_sessions()


def update_session(session_id: str, payload: SessionUpdate) -> Session:
    """Metadata-only edit. `scan_prefix` stays fixed so scans are never orphaned."""
    session = get_session(session_id)
    session.session_name = payload.session_name
    session.robot_id = payload.robot_id
    session.updated_at = _now()
    session_store.put_session(session)
    return session


def delete_session(session_id: str) -> int:
    session = get_session(session_id)
    return session_store.delete_session_objects(session)


def get_stats() -> SessionStats:
    sessions = session_store.list_sessions()
    total_frames = sum(s.metrics.frame_count for s in sessions)
    total_bytes = sum(s.metrics.scan_bytes for s in sessions)
    maps_built = sum(s.metrics.map_snapshot_count for s in sessions)
    total_distance = sum(s.metrics.trajectory_distance_m for s in sessions)
    return SessionStats(
        total_sessions=len(sessions),
        total_frames=total_frames,
        total_scan_bytes=total_bytes,
        total_scan_bytes_human=humanize_bytes(total_bytes),
        maps_built=maps_built,
        total_trajectory_distance_m=round(total_distance, 2),
    )


def get_trajectory(session_id: str) -> dict:
    """Return the session's recovered trajectory as parsed GeoJSON.

    Proxied through the API (rather than a presigned B2 URL) so the 2D plot works
    without depending on the bucket's CORS being configured for the web origin.
    """
    session = get_session(session_id)
    if not session.trajectory_geojson_key:
        raise SessionStateError("No trajectory yet — run the session first.")
    return json.loads(session_store.get_bytes(session.trajectory_geojson_key))
