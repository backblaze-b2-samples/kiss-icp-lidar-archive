# Scaffold plan — `kiss-icp-lidar-archive`

Source of truth: the fresh clone at
`.claude/scratch/vcsk-1aceb555-c65c-4509-96ac-2c36ecf0a03b/` (vibe-coding-starter-kit).
This plan is the contract for `sample-builder` and `sample-reviewer`.

---

## 1. Purpose

`kiss-icp-lidar-archive` is a B2 sample for robotics / autonomous-vehicle teams
running continuous **LiDAR SLAM**. It ingests LiDAR scan frames, runs
**KISS-ICP** (the real OSS engine, locally on the backend) for odometry and
incremental map building, and streams every artifact — raw scans, per-batch
odometry, incremental `.ply` map snapshots, and the session trajectory — into
**Backblaze B2** over the S3-compatible API, building a growing archive for
offline analysis and model retraining. It shows B2 as the storage layer for a
high-rate, data-heavy robotics pipeline. Audience: AV/robotics engineers and ML
teams who need a cheap, S3-compatible archive for SLAM output.

The headline capability runs on **local OSS only** — KISS-ICP is CPU-only and
needs no second API key; the only credentials are `B2_*`.

---

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling. Strip what a LiDAR archive doesn't need; keep the
reusable B2 scaffolding; add the SLAM-specific surface.

### KEEP (as-is — starter contract, do not strip/rename/replace)
- **UI kit / design system** — `apps/web/src/components/ui/` (shadcn primitives,
  never edited directly), design tokens in `apps/web/src/app/globals.css`, and the
  `/design` reference page.
- **Full-bucket File Explorer** — `/files` route, `apps/web/src/app/files/`,
  `apps/web/src/components/files/*` (`file-browser.tsx`, `file-tree-row.tsx`,
  `file-preview.tsx`, `file-preview-media.tsx`, `file-metadata-panel.tsx`), plus its
  repo/service/runtime backing and the Files sidebar entry. **This is the
  non-negotiable, never-removable bucket explorer.** It browses the whole bucket;
  the sample-scoped explorer (below, in ADD) is *additional*, not a replacement.
- **Upload** — `/upload` route + `apps/web/src/components/upload/*` (presigned
  direct-to-B2 PUT). Reused as the "upload real scans" ingest path (§4 feature 3).
- **Sidebar nav** (`components/layout/app-sidebar.tsx`) — Dashboard, Upload, Files,
  Settings + Design System link. We ADD a **Sessions** entry (primary entity).
- **Backend layering** `types → config → repo → service → runtime` and its
  mechanical enforcement (`tests/test_structure.py`: no backward imports, boto3
  only in `repo/`, all layers exist, 300-line/file limit).
- **Data layer** — TanStack Query hooks in `apps/web/src/lib/queries.ts`
  (no bare `useEffect + fetch`), `lib/api-client.ts` (`API_CLIENT_ROUTES`).
- **Contract + agent-doc gates** — `docs/api/openapi.json` re-export on every route
  change; `pnpm check:agent-docs` (branding, links, env-file, command set).
- **Health/metrics** — `/health`, `/metrics`, JSON logging, rate limit, request-id.
- **Settings** (`/settings`) — demo page; kept because the sidebar-nav contract
  keeps it. Not featured.
- **Infra** — Vercel (`vercel.json` two-service one-project) + Railway contracts.
  Note as a plan caveat: heavy CPU SLAM is not a natural Vercel serverless
  workload; keep the deploy config valid but the local `pnpm dev` path is the
  primary demo. Do not delete the deploy config (agent-docs gate depends on it).

### TRIM (remove from starter)
- **Image/EXIF/PDF metadata extraction** — `services/api/app/service/metadata.py`
  logic that uses **Pillow** + **PyPDF2**, the image/PDF fields on
  `FileMetadataDetail`, `docs/features/metadata-extraction.md`, and the matching
  tests. Point-cloud archives don't need EXIF/PDF parsing. **Guardrail:** the File
  Explorer (KEEP) still needs generic object detail (size, content-type, checksum).
  Keep that generic detail path (`/files-by-key/detail`, `file-metadata-panel.tsx`)
  working; only remove the image/PDF-specific extraction + its deps. If cleanly
  removing Pillow/PyPDF2 threatens the kept File Explorer or a structural test,
  leave the generic detail intact and only drop the `metadata-extraction.md` doc
  and the image/PDF-specific branches — do not break a kept surface to trim a dep.
- **Default dashboard content** — the upload-activity chart + recent-uploads table
  are illustrative; ADAPT (below), don't keep as-is.

### ADD (new for `kiss-icp-lidar-archive`)
- **Primary entity `Session`** (a LiDAR field run / SLAM session) with full
  lifecycle UI — see §4 primary-entity block. Persisted **without a DB**: each
  session is a `sessions/<session_id>/index.json` object in B2 (the starter has no
  database; enumerate sessions by listing that prefix — same DB-less pattern).
  - Routes: `/sessions` (list + New Session), `/sessions/[id]` (detail: metrics,
    trajectory plot, session-scoped archive explorer, Run/Edit/Delete).
  - Sidebar: add **Sessions** entry.
- **KISS-ICP odometry & mapping engine** — real `kiss-icp==1.3.0`, wrapped in a
  `repo/` adapter (external SDK containment, mirrors the boto3-in-repo rule):
  `services/api/app/repo/lidar_engine.py`. Service-layer orchestration in
  `services/api/app/service/sessions.py` (+ split modules to stay < 300 lines).
- **Synthetic LiDAR scan generator** — the demo ingest source (no real sensor). A
  pure-numpy module (util/service layer, not `repo/`) that ray-samples a **static
  synthetic scene** (planar walls + ground + a few box structures) from a virtual
  sensor moving along a **known ground-truth trajectory**, emitting Nx3 point
  clouds per frame as KITTI-format `.bin`. Consecutive frames MUST share geometry
  (overlap) so KISS-ICP's ICP converges — random point clouds will not register.
  Scene presets drive layout; small per-point noise added. This also gives a
  ground-truth trajectory to score drift/ATE against (nice dashboard metric).
- **Session-scoped asset explorer** — a "Session Archive" view on the session
  detail page, scoped to that session's B2 prefixes (`scans/`, `odometry/`,
  `maps/`, `trajectories/` for its `session_id`). This is the mandatory
  sample-specific explorer that sits *alongside* the kept full-bucket `/files`.
- **Trajectory visualization** — a lightweight 2D top-down plot (recovered path,
  optional ground-truth overlay) rendered from the GeoJSON/TUM data (SVG/canvas or
  Recharts, already a dep). No heavy 3D point-cloud viewer (keeps it light; the
  `.ply` map is downloadable for offline tools).
- **Adapted Dashboard** — LiDAR metrics: total sessions, total scan frames
  archived, total scan bytes in B2, maps built, total trajectory distance; a chart
  of frames-per-session (or archive growth); a recent-sessions table.

---

## 3. B2 surface (S3 operations — S3-compatible API only, no b2-native)

Bucket layout (all under one bucket; delete is prefix-scoped per session):
```
scans/<robot_id>/<session_id>/frame_000001.bin ...   raw LiDAR frames (KITTI .bin)
odometry/<session_id>/batch_0001.json                per-batch pose estimates
maps/<session_id>/map_0001.ply                       incremental map snapshots (.ply)
trajectories/<session_id>/trajectory.txt             TUM-format full trajectory
trajectories/<session_id>/trajectory.geojson         GeoJSON LineString path
sessions/<session_id>/index.json                     session record + status + metrics
```
S3 operations exercised (all via boto3 S3 client in `repo/`):
- **PutObject** — scans, odometry JSON, map `.ply`, trajectory files, session index.
- **GetObject** — read scans back for KISS-ICP; download artifacts.
- **ListObjectsV2** — enumerate sessions (`sessions/` prefix), scans per session,
  the session-scoped explorer, and the full-bucket File Explorer.
- **DeleteObject / DeleteObjects** — delete a session: batch-delete every object
  under that session's prefixes. **Safety: scope every delete to the specific
  `session_id` prefix; never wipe shared bucket data.**
- **HeadObject** — size/existence checks.
- **Presigned PUT** — browser-direct upload of real `.bin`/`.pcd`/`.ply` scans
  (reuses the kept Upload surface). **Presigned GET** — download large map `.ply` /
  trajectory for offline analysis.
- **Multipart upload** — note as the production pattern for large map snapshots
  (100 MB–10 GB); demo snapshots are small, so a single PutObject is fine, but
  document the multipart path.

**No b2-native API anywhere** (repo-root standard #1). Any temptation to use the
b2-native SDK is a defect — everything above is plain S3.

---

## 4. Key features

1. **LiDAR session management (primary entity)** — create / browse / run / edit /
   delete SLAM sessions; each session is a B2 `index.json` record (no DB).
2. **KISS-ICP odometry & mapping** — real `kiss-icp==1.3.0` runs locally on the
   backend: per-frame 4×4 poses + an incremental voxel-hash point-cloud map.
   - **External API provider:** NONE. Headline capability is on-device.
   - **deployment: `local`** — CPU-only. `kiss-icp` has **no GPU/CUDA code path**
     at all, so the CPU-default rule is satisfied inherently; do **not** add a
     spurious CUDA/MPS autodetect branch (there is nothing to detect). Note this in
     the plan so the reviewer doesn't flag a missing GPU path.
   - **Cost per full demo run:** $0 (only B2 storage; no external key).
3. **Continuous ingest to B2** — synthetic scan generator (default) or upload real
   scans; frames batched into rolling windows and streamed to `scans/…`.
4. **Map snapshots & trajectory export** — incremental `.ply` map snapshots +
   TUM `.txt` and GeoJSON trajectory to B2; session `index.json` records scan key
   ranges, map snapshot keys, and trajectory paths.
5. **Session-scoped archive explorer + trajectory view** — per-session B2 browser
   scoped to the session prefix, plus a 2D trajectory plot (full-bucket `/files`
   Explorer kept alongside).
6. **Serve / query via S3** — pull scans, map snapshots, and trajectory from B2 via
   presigned S3 GET for offline analysis / retraining.

**Genblaze:** the description does not mention Genblaze / `genblaze-*` /
`genblaze-s3`. Do **not** route through Genblaze — use plain boto3 in `repo/`.

### Primary-entity lifecycle (entity = `Session`) — ALL verbs in the UI
| verb | UI surface | behavior |
|------|-----------|----------|
| **create** | `/sessions` → New Session form | generate/ingest scans to `scans/<robot_id>/<session_id>/`, write `index.json` (status `ingested`) |
| **read** | `/sessions` list + `/sessions/[id]` detail | list from `sessions/` prefix; detail shows metrics, trajectory plot, session-scoped explorer |
| **edit** | `/sessions/[id]` → Edit form | rename `session_name` / `robot_id` (metadata in `index.json`); pre-filled |
| **delete** | `/sessions/[id]` → confirm dialog | prefix-scoped `DeleteObjects` for that `session_id` |
| **run** | `/sessions/[id]` → **Run** button (headline) | KISS-ICP over the session's scans → odometry JSON, `.ply` map, TUM+GeoJSON trajectory to B2; update `index.json` (status `running`→`complete`, metrics) |

`omitted_ui_verbs`: expected **empty** — all five verbs are user-accessible and
built. (`run` executes via FastAPI `BackgroundTasks`; status is persisted to
`index.json` and the UI polls it through a TanStack Query hook — the starter has no
job queue, so keep this simple and DB-less.)

### Form UX conventions
Exemplar to match: `apps/web/src/components/settings/settings-form.tsx`
(react-hook-form + zod, `Select`/`RadioGroup`, `FormDescription` hints).

**Create Session form** (selectors for finite fields; create-only default hints via
placeholder / `FormDescription`, never an autofill button):
- `robot_id` — free text (arbitrary id). Placeholder `robot-01`; FormDescription hint.
- `session_name` — free text. Placeholder `warehouse-loop-1`; FormDescription hint.
- `scan_source` — **RadioGroup/Select** (finite): `synthetic` (default) | `upload`.
- `scene` — **Select** (finite): `warehouse` (default) | `corridor` | `open-loop`.
  Only meaningful when `scan_source = synthetic`.
- `num_frames` — **Select** (finite presets): `60` | `120` (default) | `240`.
  FormDescription notes the demo-runtime trade-off.
- `quality` — **Select** (finite): `fast` | `balanced` (default) | `accurate`
  (maps to KISS-ICP `voxel_size` / `max_range` / thread settings).

**Edit Session form** (pre-filled; selectors on finite fields; NO default hints):
- `session_name`, `robot_id` editable. Ingest-time choices (`scan_source`,
  `scene`, `num_frames`, `quality`) are immutable post-ingest — show read-only or
  omit from the edit form. Metadata-only edit.

---

## 5. Doc transforms

**Rewrite:**
- `README.md` — full rewrite to the LiDAR-archive pitch. Preserve the human-first
  info ordering: quick start + visual proof early; keep **When to use / When not to
  use / Why B2 / FAQ** (move freely, never drop — AEO value). Update tech-stack
  (add KISS-ICP, Python point-cloud), credential steps (standardized `B2_*`, §6),
  and the Vercel deploy button env list.
- `docs/features/dashboard.md` — LiDAR session metrics (replaces upload activity).
- `docs/features/file-upload.md` — keep, reframe as the "upload real scans" path.
- `docs/features/file-browser.md` — keep (full-bucket explorer), minor wording.
- `ARCHITECTURE.md` — new `repo/lidar_engine.py`, `service/sessions.py`, session
  routes, B2 prefix layout, data flow (ingest → run → export).
- `AGENTS.md` — update §2 (new app surfaces), §9 doc-map rows, external-SDK
  containment note for `kiss-icp` (repo/ only); keep it agent-sized (≤ 20 KB /
  250 lines / the check-agent-docs invariants).
- `docs/app-workflows.md` — the session journey (create → run → browse → download).
- `PRODUCT.md`, `docs/verification.md` — adjust to new features / any new checks.

**Delete:** `docs/features/metadata-extraction.md` (feature trimmed).

**New feature docs** (`docs/features/`, from `_template.md`):
- `lidar-sessions.md` — primary entity + lifecycle verbs.
- `kiss-icp-odometry.md` — the engine, config presets, CPU-only note, repo/ containment.
- `scan-ingest.md` — synthetic generator + upload path, B2 prefixes, batching.
- `map-trajectory-export.md` — `.ply` snapshots, TUM/GeoJSON, session index format.
- `session-archive-explorer.md` — session-scoped explorer + trajectory plot.

Every route change re-exports `docs/api/openapi.json`; backend-only routes also go
in `SERVER_ONLY_OPERATIONS` (`apps/web/src/lib/api-contract.test.ts`).

---

## 6. Rename table

**Identity (branding.mjs enforces APP_NAME ⇄ user_agent_extra ⇄ utm_content — change together):**
| dimension | from | to |
|-----------|------|----|
| root pkg `name` | `vibe-coding-starter-kit` | `kiss-icp-lidar-archive` |
| scoped pkgs | `@vibe-coding-starter-kit/web`, `@vibe-coding-starter-kit/shared` | `@kiss-icp-lidar-archive/web`, `@kiss-icp-lidar-archive/shared` |
| display name (`APP_NAME` in `apps/web/src/lib/app-config.ts`) | `Vibe Coding Starter Kit` | `KISS-ICP LiDAR Archive` |
| `APP_DESCRIPTION` | starter desc | LiDAR SLAM archive on B2 pitch |
| attribution token (`user_agent_extra` in `repo/b2_client.py` **and** every `utm_content`) | `b2ai-oss-start` | `b2ai-kiss-icp-lidar-archive` |
| Vercel project/button + Railway `--filter` slugs | `vibe-coding-starter-kit` / `@vibe-coding-starter-kit/web` | `kiss-icp-lidar-archive` / `@kiss-icp-lidar-archive/web` |
| completed exec-plan `vcsk` slug | `2026-08-04-unify-vcsk-identity-api.md` (`vcsk`) | leave historical plan as-is OR rename slug consistently — do not let it break links |

Files carrying these strings (from the source map): root `package.json`,
`apps/web/package.json`, `packages/shared/package.json`, `railway.json`,
`apps/web/next.config.ts`, all `@vibe-coding-starter-kit/shared` type imports
(files/*, upload/upload-progress, lib/api-client, lib/queries[.test], lib/upload-status,
lib/file-tree[.test]), `README.md`, `infra/vercel/README.md`, `docs/dev-workflows.md`,
`docs/SECURITY.md`, `app-config.ts` (+`.test`), `services/api/main.py` (derives
API_TITLE), `repo/b2_client.py`, `services/api/scripts/setup_b2_cors.py`,
`scripts/doctor.mjs`, `components/layout/app-sidebar.tsx`.

No snake_case (`vibe_coding_starter_kit`) or Docker image-tag variants exist in the
starter; only introduce `kiss_icp_lidar_archive` if a new Python identifier needs it
(Python package dir stays `app`, so likely none).

**Env-var standardization — b2-doctor must-fix (repo-root standard #3).**
The starter's names deviate from the mandated standard. Target state:
| starter | standard target |
|---------|-----------------|
| `B2_KEY_ID` | `B2_APPLICATION_KEY_ID` |
| `B2_APPLICATION_KEY` | `B2_APPLICATION_KEY` (unchanged) |
| `B2_BUCKET_NAME` | `B2_BUCKET_NAME` (unchanged) |
| `B2_ENDPOINT` | `B2_REGION` (derive endpoint `https://s3.<B2_REGION>.backblazeb2.com`) |
| `B2_PUBLIC_URL` | `B2_PUBLIC_URL_BASE` |
Touch: `config/settings.py`, `repo/b2_client.py`, `.env.example` (add
`B2_PUBLIC_URL_BASE`), `main.py` (`REQUIRED_B2_SETTINGS` / `PLACEHOLDER_VALUES`),
README credential steps, Vercel deploy-button env list + `infra/vercel/README.md`,
`scripts/doctor.mjs`, `scripts/setup.mjs`. Run **`/b2-doctor`** to verify all three
standards (S3-default, custom user-agent on every S3 client, standardized `B2_*`).

---

## 7. Dependencies & build notes (for the builder)

- **Add** `kiss-icp==1.3.0` to `services/api/requirements.txt` and regenerate
  `services/api/requirements.lock` (Python 3.12). Prebuilt wheels exist for macOS
  arm64 (cp312) and Linux x86_64 (cp312) — no compiler/CMake needed. MIT-licensed.
- **Do NOT** install the `kiss-icp[all]` extra or `open3d` (heavy visualizer dep).
  Write `.ply` (simple ASCII/binary PLY writer) and TUM/GeoJSON with small numpy
  helpers; convert rotation → quaternion with numpy to avoid `pyquaternion` too.
- **KISS-ICP programmatic API (v1.3.0), contain in `repo/lidar_engine.py`:**
  ```python
  from kiss_icp.kiss_icp import KissICP
  from kiss_icp.config import load_config          # load_config(None) fills voxel_size
  cfg = load_config(None)
  cfg.data.deskew = False                           # no per-point timestamps in synthetic scans
  # map quality preset → cfg.mapping.voxel_size / cfg.data.max_range / cfg.registration.max_num_threads
  odom = KissICP(cfg)
  poses = []
  for points in scan_frames:                        # points: Nx3 float
      ts = np.zeros(len(points))                    # placeholder timestamps (deskew off)
      odom.register_frame(points, ts)               # returns (deskewed_frame, keypoints); ignore
      poses.append(odom.last_pose.copy())           # 4x4 world-from-current
  map_points = odom.local_map.point_cloud()         # Nx3 accumulated map
  ```
  `register_frame` does **not** return the pose — read `odom.last_pose` after each
  call. Accumulate `poses` yourself. `deskew=False` because synthetic frames have no
  per-point timestamps.
- **Run execution:** FastAPI `BackgroundTasks`; persist status/metrics into the
  session `index.json`; UI polls via TanStack Query. Keep every authored
  `services/api/app/**` file **< 300 lines** (split `service/sessions.py` if needed).
- **Scan volume for the demo:** presets 60/120/240 frames, ~10k–40k points/frame,
  so a run is seconds-to-~1 min on CPU. Keep it small — the pipeline verify step
  must not choke (never run two heavy ML workloads concurrently).
- **`.gitignore` / secrets:** real credentials only in `.env` (gitignored);
  `.env.example` uses placeholders. The scan generator and any test data are
  synthetic — no real-person/sensitive assets.

---

## 8. Verification the builder must pass before returning
- `/b2-doctor` clean (all three standards).
- `pnpm check:agent-docs` (branding consistency, links, env-file, command set).
- `pnpm verify` (agent-docs + `verify:api` lint/tests/structure + `verify:web`
  lint/typecheck/test/build). Structural tests: layering, boto3-in-repo, all layers
  exist, file-size limit. `kiss-icp` import contained in `repo/`.
- `docs/api/openapi.json` re-exported and matching; frontend `API_CLIENT_ROUTES`
  in sync.
