<!-- last_verified: 2026-09-14 -->
# Feature: KISS-ICP Odometry & Mapping

## Purpose
The headline capability. Run the real open-source **KISS-ICP** engine over a
session's LiDAR scans to produce per-frame 4×4 poses (odometry) and an
incremental voxel-hash point-cloud map — entirely on the backend, CPU-only, with
no second API key.

## Used By
- UI: `/sessions/[id]` → **Run SLAM** button
- API: `POST /sessions/{session_id}/run` (executes via `BackgroundTasks`)

## Core Functions
- `services/api/app/repo/lidar_engine.py` — `run_odometry()`, `OdometryResult`, `EngineUnavailableError`, `QUALITY_PRESETS`; the only module that imports `kiss_icp`
- `services/api/app/service/session_run.py` — `run_session()`/`_do_run()`: reads scans from B2, calls the engine, archives the output, writes metrics
- `services/api/app/repo/session_store.py` — scan `GetObject` + artifact `PutObject`

## Canonical Files
- Engine adapter (third-party client, repo layer): `services/api/app/repo/lidar_engine.py`
- Run orchestration (service layer): `services/api/app/service/session_run.py`

## Engine API (kiss-icp 1.3.0)
`kiss_icp` is imported **lazily inside `run_odometry`** so the module, the OpenAPI
export, and the tests load without the engine. `register_frame` does not return
the pose — the pose is read from `odom.last_pose` after each call and accumulated.
`deskew=False` because synthetic frames carry no per-point timestamps.

```python
from kiss_icp.config import load_config
from kiss_icp.kiss_icp import KissICP
cfg = load_config(None)
cfg.data.deskew = False
odom = KissICP(cfg)
for points in scan_frames:          # points: (N,3) float
    odom.register_frame(points, np.zeros(len(points)))
    poses.append(odom.last_pose.copy())
map_points = odom.local_map.point_cloud()
```

## Quality presets
`QUALITY_PRESETS` maps the session's `quality` to `(voxel_size, max_range,
max_num_threads)`: `fast` (0.8 m), `balanced` (0.5 m, default), `accurate`
(0.3 m). Smaller voxels give a denser, more accurate map and run slower.

## Device selection
KISS-ICP has **no GPU/CUDA code path** — it is CPU-only — so there is
deliberately no CUDA/MPS autodetect branch. There is nothing to detect; the
CPU-default rule is satisfied inherently.

## Inputs
- `(N,3)` float point clouds streamed from `scans/…` (read back from B2)
- `quality` and `snapshot_every` from the session/run configuration

## Outputs
- `OdometryResult(poses, map_points, snapshots)` → archived as odometry JSON, `.ply` maps, and TUM/GeoJSON trajectory (see [Map & Trajectory Export](map-trajectory-export.md))
- Metrics on the session record: frame_count, map_snapshot_count, map_point_count, trajectory_distance_m, ate_rmse_m, run_seconds

## Flow
- `run_session` loads scan keys → streams frames → `run_odometry` → write artifacts → persist metrics + status `complete`

## Edge Cases
- `kiss_icp` not importable / fails to init → `EngineUnavailableError` → the run is recorded as `failed` with an actionable message (never a 500)
- No scans under the prefix → `failed` ("No scan frames found…")
- Contained by a structural test: `test_kiss_icp_only_in_repo`

## Verification
- Test files: `services/api/tests/test_sessions.py` (engine-unavailable and happy-path via a stubbed engine), `services/api/tests/test_structure.py` (containment)
- Required cases: engine-unavailable → `failed`; a completed run writes odometry/maps/trajectory and computes distance + ATE
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Verification](../verification.md#non-live-verification) are available
- Pass criteria: focused tests and `pnpm verify` green; explain any skipped `pnpm verify:full` prerequisites

## Related Docs
- [LiDAR Sessions](lidar-sessions.md)
- [Scan Ingest](scan-ingest.md)
- [Map & Trajectory Export](map-trajectory-export.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
