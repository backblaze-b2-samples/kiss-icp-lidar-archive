<!-- last_verified: 2026-09-14 -->
# Feature: Map & Trajectory Export

## Purpose
Turn KISS-ICP's output into durable, tool-friendly artifacts in B2: incremental
`.ply` point-cloud map snapshots, a TUM-format trajectory, and a GeoJSON
LineString path — plus the session `index.json` record that ties them together.

## Used By
- UI: `/sessions/[id]` (trajectory plot + session archive downloads)
- API: written during `POST /sessions/{session_id}/run`; the plot reads `GET /sessions/{session_id}/trajectory`

## Core Functions
- `services/api/app/service/ply_export.py` — `write_ply()` (binary PLY), `write_tum()`, `write_geojson()`, `rotation_to_quaternion()` (numpy only, no open3d/pyquaternion)
- `services/api/app/service/session_run.py` — `_write_odometry()`, `_write_maps()`, and the trajectory writes; `_path_length()`, `_ate()`
- `services/api/app/repo/session_store.py` — artifact key builders + `put_bytes()`

## Canonical Files
- Artifact writers (service layer, numpy only): `services/api/app/service/ply_export.py`

## Artifacts & keys
- `odometry/<session_id>/batch_0001.json` — per-batch poses (index, 4×4 flattened, position)
- `maps/<session_id>/map_0001.ply` — incremental map snapshots (every 30 frames) plus a final snapshot
- `trajectories/<session_id>/trajectory.txt` — TUM: `timestamp tx ty tz qx qy qz qw` per frame
- `trajectories/<session_id>/trajectory.geojson` — a FeatureCollection: the recovered path, plus the synthetic ground-truth overlay when available
- `sessions/<session_id>/index.json` — the record: status, artifact keys, and `SessionMetrics`

## Metrics
`SessionMetrics` records `frame_count`, `scan_bytes`, `map_snapshot_count`,
`map_point_count`, `trajectory_distance_m`, `ate_rmse_m` (RMSE against the
synthetic ground truth; null for uploaded scans), and `run_seconds`.

## Inputs
- `OdometryResult` (poses, map_points, snapshots) from the engine
- For ATE: the synthetic ground-truth path in the first-frame frame

## Outputs
- The B2 objects above; keys and metrics persisted on the session record

## Flow
- `_do_run` writes odometry batches → map snapshots (+ final) → TUM + GeoJSON trajectory → computes distance + ATE → persists metrics and status `complete`

## Edge Cases
- `num_frames` < snapshot interval → still writes one final map snapshot
- Uploaded scans (no ground truth) → `ate_rmse_m` is null
- Multipart upload is the documented production pattern for very large map snapshots; demo snapshots use a single `PutObject`

## Verification
- Test files: `services/api/tests/test_sessions.py`
- Required cases: a completed run writes `maps/`, `odometry/`, and `trajectories/` objects and records distance + ATE
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Verification](../verification.md#non-live-verification) are available
- Pass criteria: focused tests and `pnpm verify` green; explain any skipped `pnpm verify:full` prerequisites

## Related Docs
- [KISS-ICP Odometry & Mapping](kiss-icp-odometry.md)
- [Session Archive Explorer](session-archive-explorer.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
