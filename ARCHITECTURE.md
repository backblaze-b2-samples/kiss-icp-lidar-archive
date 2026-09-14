<!-- last_verified: 2026-08-06 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - LiDAR **Sessions** — list, create (New Session form), run, edit, delete; per-session detail with metrics, a 2D trajectory plot, and a session-scoped archive explorer
  - Dashboard with LiDAR session metrics, frames-per-session chart, recent sessions
  - File browser with preview, download, delete (full-bucket explorer)
  - File upload with drag-and-drop, progress tracking (reused as the "upload real scans" path)
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for session lifecycle (create/list/get/update/delete/run/trajectory/stats) plus file listing, upload, deletion
  - B2 S3 integration via boto3 (scans, odometry, maps, trajectories, session index)
  - Real **KISS-ICP** LiDAR odometry + incremental mapping (CPU-only), contained in `repo/lidar_engine.py`
  - Synthetic LiDAR scan generator + `.ply`/TUM/GeoJSON writers (numpy, service layer)
  - Health check endpoint with B2 connectivity verification
  - Structured JSON logging with request tracing
  - Prometheus-format metrics endpoint
- **packages/shared/** — TypeScript type definitions
  - Mirrors Pydantic models from the API
  - Consumed by `apps/web/` as workspace dependency

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. Third-party clients (`boto3`, `kiss_icp`) only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Authored Python files under `services/api/app/` stay under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (FileMetadata, Session, SessionStats, etc.)
    config/                Settings loaded from environment
    repo/                  B2 S3 client + session store + KISS-ICP engine adapter
                           (b2_client.py, session_store.py, lidar_engine.py)
    service/               Business logic (sessions, session_run, scan_generator, ply_export, files, upload)
    runtime/               FastAPI route handlers (sessions.py, files.py, upload.py, ...)
  tests/                   pytest tests (structural + integration)
```

## Boundary Invariants

- **No external SDK leakage**: `boto3` and `kiss_icp` are only imported in `app/repo/` (`b2_client.py`/`session_store.py` and `lidar_engine.py` respectively). `kiss_icp` is also lazy-imported inside `run_odometry`, so the module (and the OpenAPI export/tests) load without the engine; a missing/incompatible engine raises `EngineUnavailableError`, which the service records as a `failed` run rather than a 500. Both boundaries are enforced by `tests/test_structure.py`.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. The listing cache also owns the only background thread in the app: a stale entry is served immediately while that thread re-scans (stale-while-revalidate), and `main.lifespan` warms it once at startup so no user pays for the cold full-bucket scan.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repository: `web` builds from the
  repository root because it consumes `packages/shared`; `api` builds from
  `services/api`. Each service's versioned config sits at its own root —
  `railway.json` and `services/api/railway.json` — the default path Railway
  discovers, so a one-click template deploy inherits the same build, start, and
  health behavior with nothing to configure by hand. The human-approved
  staging/production contract lives in [infra/railway/README.md](infra/railway/README.md).
- **Vercel** — one project using [Vercel Services](https://vercel.com/docs/services):
  the `web` (Next.js) and `api` (FastAPI) services build from the same repo and
  share one origin — the web app at `/`, the API under `/api`. The repo-root
  `vercel.json` declares both services and routes `/api/*` to the API service;
  the Vercel-only `services/api/index.py` strips the `/api` prefix so FastAPI
  keeps its native paths (`/health`, `/files`, …). Uploads go directly from the
  browser to B2 via a presigned PUT (see
  [File Upload](docs/features/file-upload.md)), so they bypass the Function's
  4.5 MB payload ceiling entirely — the bucket must allow the deploy origin in
  its CORS. A two-separate-Projects alternative and the full delivery contract
  live in [infra/vercel/README.md](infra/vercel/README.md).

External provisioning and deployment remain explicit user-approved actions.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API), the sole data store
  - No application database — each session is a `sessions/<id>/index.json` object; the list view enumerates the `sessions/` prefix
  - Bucket key layout (delete is prefix-scoped per session):

```
scans/<robot_id>/<session_id>/frame_000001.bin   raw LiDAR frames (KITTI .bin)
odometry/<session_id>/batch_0001.json            per-batch pose estimates
maps/<session_id>/map_0001.ply                    incremental map snapshots (.ply)
trajectories/<session_id>/trajectory.txt          TUM-format full trajectory
trajectories/<session_id>/trajectory.geojson      GeoJSON LineString path
sessions/<session_id>/index.json                  session record + status + metrics
```

  - S3 ops exercised: `PutObject`, `GetObject`, `ListObjectsV2`, `HeadObject`, `DeleteObjects`, presigned GET/PUT — all via boto3 in `repo/`. Multipart is the documented production pattern for large map snapshots; demo snapshots are small enough for a single `PutObject`.

## External Services

- **Backblaze B2 S3 API** — file storage, retrieval, deletion, presigned URLs

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

## Data Flows

- **Create + ingest**: Browser -> `POST /sessions` (writes `index.json`, status `ingesting`) -> BackgroundTask `ingest_session` generates synthetic scans and PUTs each `frame_*.bin` to `scans/…` -> status `ingested`. The UI polls `GET /sessions/{id}`.
- **Run (headline)**: Browser -> `POST /sessions/{id}/run` (status `running`) -> BackgroundTask `run_session` reads scans back with `GetObject`, runs KISS-ICP, then PUTs odometry JSON, `.ply` map snapshots, and TUM+GeoJSON trajectory, and writes final metrics to `index.json` -> status `complete` (or `failed`).
- **Trajectory**: Browser -> `GET /sessions/{id}/trajectory` -> service reads the GeoJSON from B2 and returns it (proxied, so the 2D plot needs no bucket CORS).
- **Delete**: Browser -> `DELETE /sessions/{id}` -> service prefix-scoped `DeleteObjects` for that `session_id` only.
- **Upload**: Browser -> `POST /upload/presign` -> Browser PUTs bytes **directly to B2** -> `POST /upload/verify`.
- **List / Download**: `GET /files` and `GET /files/{key}/download` (presigned GET) back the full-bucket explorer and the session-scoped archive.

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## API Contract

- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export/check command: `pnpm contract:export` / `pnpm contract:check`
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The frontend client keeps a small `API_CLIENT_ROUTES` registry in
`apps/web/src/lib/api-client.ts`. Tests compare that registry to the checked-in
OpenAPI artifact so route changes fail loudly before the hand-written client can
silently drift from FastAPI. `GET /metrics` is intentionally server-only.

## Canonical Files

- Layered API handler: `services/api/app/runtime/sessions.py`
- Service orchestration: `services/api/app/service/sessions.py` (CRUD/stats) + `service/session_run.py` (ingest + KISS-ICP run)
- KISS-ICP engine adapter (repo layer): `services/api/app/repo/lidar_engine.py`
- Session B2 store (repo layer): `services/api/app/repo/session_store.py`
- Numpy helpers (service layer): `service/scan_generator.py`, `service/ply_export.py`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`sessions.py`, `files.py`, `upload.py`, `stats.py`, `formatting.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI contract: `docs/api/openapi.json`
- OpenAPI exporter: `services/api/scripts/export_openapi.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [LiDAR Sessions](docs/features/lidar-sessions.md)
- [KISS-ICP Odometry & Mapping](docs/features/kiss-icp-odometry.md)
- [Scan Ingest](docs/features/scan-ingest.md)
- [Map & Trajectory Export](docs/features/map-trajectory-export.md)
- [Session Archive Explorer](docs/features/session-archive-explorer.md)
- [File Browser](docs/features/file-browser.md)
- [File Upload](docs/features/file-upload.md)
- [Dashboard](docs/features/dashboard.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
