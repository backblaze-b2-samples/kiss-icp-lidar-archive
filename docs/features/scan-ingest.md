<!-- last_verified: 2026-09-14 -->
# Feature: Scan Ingest

## Purpose
Get LiDAR frames into B2 so KISS-ICP has something to register. The default is a
**synthetic generator** (no sensor, no second key); the alternative is uploading
real scans. Consecutive frames must overlap for ICP to converge.

## Used By
- UI: `/sessions` New Session form (`scan_source` = `synthetic` | `upload`)
- API: `POST /sessions` schedules the background ingest; `POST /upload/*` for the upload path

## Core Functions
- `services/api/app/service/scan_generator.py` — `build_scene()`, `generate_frames()`, `ground_truth_local()` (pure numpy)
- `services/api/app/service/session_run.py` — `ingest_session()` / `_ingest_synthetic()`: generate → `PutObject` each frame → mark `ingested`
- `services/api/app/repo/session_store.py` — `scan_prefix_for()`, `scan_frame_key()`, `put_bytes()`

## Canonical Files
- Synthetic generator (service layer, numpy only): `services/api/app/service/scan_generator.py`
- Ingest orchestration: `services/api/app/service/session_run.py`

## The synthetic generator
A static box-room scene (floor, four walls, a few pillars) is sampled once as a
dense world point cloud. A virtual 360° sensor moves along a known ground-truth
path (scene preset: `warehouse` closed loop, `corridor` straight, `open-loop`
half turn). Each frame is the world cloud expressed in that frame's sensor
coordinates, clipped to a visibility range, subsampled (~12k points), and
jittered. Because every frame is a rigid transform of the same geometry,
consecutive frames overlap heavily — exactly what KISS-ICP needs. The known path
also yields a ground truth to score drift (ATE) against at run time.

## B2 layout & batching
- Frames are written as KITTI-format `.bin` (float32 x,y,z,intensity) to `scans/<robot_id>/<session_id>/frame_000001.bin`, …
- `num_frames` presets: `60` / `120` (default) / `240` — more frames means a longer archive and a longer run
- The record stores `scan_prefix` (immutable) and `scan_keys_count`; total scan bytes are recorded in `metrics.scan_bytes`

## Inputs
- Synthetic: `scene`, `num_frames`, and a deterministic seed derived from `session_id`
- Upload: real `.bin`/`.pcd` scans added by the user (secondary path)

## Outputs
- `frame_*.bin` objects under the session's scan prefix; session status → `ingested`

## Flow
- `POST /sessions` writes the record (`ingesting`) → background `ingest_session` generates + uploads frames → status `ingested`, `scan_keys_count` and `metrics.scan_bytes` set

## Edge Cases
- Ingest failure → recorded as `failed` with a message
- Upload path: the generic Upload page writes to `uploads/`; wiring uploads to the session scan prefix is the secondary extension point (see [File Upload](file-upload.md))

## Verification
- Test files: `services/api/tests/test_sessions.py`
- Required cases: create schedules ingest; the run reads `.bin` frames back and produces odometry (the generator is exercised end-to-end when a real engine is installed)
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Verification](../verification.md#non-live-verification) are available
- Pass criteria: focused tests and `pnpm verify` green; explain any skipped `pnpm verify:full` prerequisites

## Related Docs
- [LiDAR Sessions](lidar-sessions.md)
- [KISS-ICP Odometry & Mapping](kiss-icp-odometry.md)
- [File Upload](file-upload.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
