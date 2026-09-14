"""Pydantic models for the primary entity: a LiDAR SLAM `Session`.

A session is persisted without a database as a single `sessions/<id>/index.json`
object in B2; the list view enumerates the `sessions/` prefix. These models are
the validated boundary for the session routes and the shape of that index.json.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ScanSource = Literal["synthetic", "upload"]
Scene = Literal["warehouse", "corridor", "open-loop"]
Quality = Literal["fast", "balanced", "accurate"]
SessionStatus = Literal["ingesting", "ingested", "running", "complete", "failed"]

# The finite frame-count presets the create form offers. Validated here so the
# API rejects an out-of-range count even if a client bypasses the UI selector.
FRAME_PRESETS = (60, 120, 240)


class SessionMetrics(BaseModel):
    """Metrics computed during ingest (scan_bytes/frame_count) and the KISS-ICP
    run (everything else). All default to a zero/absent value pre-run."""

    frame_count: int = 0
    scan_bytes: int = 0
    map_snapshot_count: int = 0
    map_point_count: int = 0
    trajectory_distance_m: float = 0.0
    # Absolute trajectory error (RMSE, metres) against the synthetic
    # ground-truth path. None for uploaded scans (no ground truth) or pre-run.
    ate_rmse_m: float | None = None
    run_seconds: float | None = None


class Session(BaseModel):
    session_id: str
    session_name: str
    robot_id: str
    scan_source: ScanSource
    scene: Scene
    num_frames: int
    quality: Quality
    status: SessionStatus
    created_at: datetime
    updated_at: datetime
    # Immutable physical scan prefix set at ingest. Kept separate from the
    # editable `robot_id` label so renaming a robot never orphans stored scans.
    scan_prefix: str = ""
    scan_keys_count: int = 0
    map_keys: list[str] = Field(default_factory=list)
    odometry_keys: list[str] = Field(default_factory=list)
    trajectory_txt_key: str | None = None
    trajectory_geojson_key: str | None = None
    metrics: SessionMetrics = Field(default_factory=SessionMetrics)
    error: str | None = None


class SessionCreate(BaseModel):
    session_name: str = Field(min_length=1, max_length=100)
    robot_id: str = Field(min_length=1, max_length=100)
    scan_source: ScanSource = "synthetic"
    scene: Scene = "warehouse"
    num_frames: int = 120
    quality: Quality = "balanced"

    @field_validator("num_frames")
    @classmethod
    def _preset_only(cls, value: int) -> int:
        if value not in FRAME_PRESETS:
            raise ValueError(f"num_frames must be one of {FRAME_PRESETS}")
        return value


class SessionUpdate(BaseModel):
    """Metadata-only edit. Ingest-time choices are immutable post-ingest."""

    session_name: str = Field(min_length=1, max_length=100)
    robot_id: str = Field(min_length=1, max_length=100)


class SessionStats(BaseModel):
    total_sessions: int
    total_frames: int
    total_scan_bytes: int
    total_scan_bytes_human: str
    maps_built: int
    total_trajectory_distance_m: float
