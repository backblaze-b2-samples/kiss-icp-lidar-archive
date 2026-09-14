<!-- last_verified: 2026-09-14 -->
# Feature: LiDAR Sessions

## Purpose
The primary entity. A `Session` is one LiDAR field run / SLAM session, with a full
create / read / run / edit / delete lifecycle in the UI. Sessions are persisted
without a database — each is a single `sessions/<id>/index.json` object in B2, and
the list view enumerates the `sessions/` prefix.

## Used By
- UI: `/sessions` (list + New Session form), `/sessions/[id]` (detail: metrics, trajectory plot, session archive, Run/Edit/Delete)
- API: `GET/POST /sessions`, `GET /sessions/stats`, `GET/POST/DELETE /sessions/{session_id}`, `POST /sessions/{session_id}/run`, `GET /sessions/{session_id}/trajectory`

## Core Functions
- `services/api/app/types/sessions.py` — `Session`, `SessionCreate`, `SessionUpdate`, `SessionMetrics`, `SessionStats`
- `services/api/app/repo/session_store.py` — B2 read/write of the record + prefix listing + prefix-scoped delete
- `services/api/app/service/sessions.py` — CRUD, stats, trajectory retrieval
- `services/api/app/service/session_run.py` — background ingest + KISS-ICP run (see [KISS-ICP Odometry](kiss-icp-odometry.md))
- `services/api/app/runtime/sessions.py` — FastAPI routes + `BackgroundTasks`
- `apps/web/src/components/sessions/*` — `session-list`, `session-form`, `session-detail`, `session-edit-dialog`, `session-archive`, `trajectory-plot`, `status-badge`
- `apps/web/src/lib/queries.ts` — `useSessions`, `useSession`, `useCreateSession`, `useUpdateSession`, `useRunSession`, `useDeleteSession`

## Canonical Files
- Route handlers: `services/api/app/runtime/sessions.py`
- Record persistence: `services/api/app/repo/session_store.py`
- Create form (Form UX exemplar): `apps/web/src/components/sessions/session-form.tsx`

## Lifecycle verbs
| Verb | UI surface | Behavior |
|------|-----------|----------|
| create | `/sessions` → New Session form | write `index.json` (status `ingesting`); background ingest generates/uploads scans → `ingested` |
| read | `/sessions` list + `/sessions/[id]` detail | list from the `sessions/` prefix; detail shows metrics, trajectory plot, session archive |
| run | `/sessions/[id]` → **Run SLAM** (headline) | KISS-ICP over the session's scans → odometry, `.ply` map, TUM+GeoJSON trajectory to B2; status `running`→`complete` |
| edit | `/sessions/[id]` → Edit dialog | rename `session_name`/`robot_id` (metadata only; ingest-time choices immutable) |
| delete | `/sessions/[id]` → confirm dialog | prefix-scoped `DeleteObjects` for that `session_id` only |

## Inputs
- create: `SessionCreate` (session_name, robot_id, scan_source, scene, num_frames ∈ {60,120,240}, quality)
- edit: `SessionUpdate` (session_name, robot_id)

## Outputs
- `Session` records in `sessions/<id>/index.json`; scans/odometry/maps/trajectories under their own prefixes (see [ARCHITECTURE.md](../../ARCHITECTURE.md))
- Side effects: background ingest and run write many B2 objects; delete removes them prefix-scoped

## Flow
- Create → poll while `ingesting` → `ingested` → **Run SLAM** → poll while `running` → `complete`
- The UI polls `GET /sessions/{id}` (every 2s) while the record is ingesting/running, and stops once it settles

## Edge Cases
- Run while `ingesting`/`running` → 409 (`SessionStateError`)
- Run with no scans under the prefix → recorded as `failed` with a clear message; the POST returns 202-style `running` then flips to `failed`
- Missing session → 404
- Non-preset `num_frames` → 422 at the API boundary

## UX States
- Empty: "No sessions yet" with a New Session action
- Loading: skeleton rows / detail skeletons
- Error: inline error state with retry; a failed run shows the error on the record

## Verification
- Test files: `services/api/tests/test_sessions.py`, `services/api/tests/test_structure.py`
- Required cases: create returns `ingesting`, non-preset frames rejected, missing → 404, list, run rejected while ingesting, run marks `failed` when the engine is unavailable, run completes and archives artifacts
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Verification](../verification.md#non-live-verification) are available
- Pass criteria: focused tests and `pnpm verify` green; explain any skipped `pnpm verify:full` prerequisites

## Related Docs
- [KISS-ICP Odometry & Mapping](kiss-icp-odometry.md)
- [Scan Ingest](scan-ingest.md)
- [Map & Trajectory Export](map-trajectory-export.md)
- [Session Archive Explorer](session-archive-explorer.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
