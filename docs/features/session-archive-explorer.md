<!-- last_verified: 2026-09-14 -->
# Feature: Session Archive Explorer

## Purpose
A per-session view of everything a session has written to B2, scoped to that
session's prefixes, plus a lightweight 2D top-down plot of the recovered
trajectory. It sits **alongside** the non-negotiable full-bucket File Explorer at
`/files` — it does not replace it.

## Used By
- UI: `/sessions/[id]` (the "Session archive" card and the "Trajectory" card)
- API: `GET /files?prefix=<scan_prefix>` (real scoped `ListObjectsV2`), `GET /files-by-key/download` (presigned GET), `GET /sessions/{session_id}/trajectory`

## Core Functions
- `apps/web/src/components/sessions/session-archive.tsx` — lists scans (scoped `useFiles(scan_prefix)`) plus maps/odometry/trajectory from the record, each with a presigned download
- `apps/web/src/components/sessions/trajectory-plot.tsx` — SVG polyline plot of the GeoJSON path(s)
- `apps/web/src/lib/queries.ts` — `useFiles(prefix)`, `useTrajectory()`
- `services/api/app/service/sessions.py` — `get_trajectory()` (proxies the GeoJSON from B2)

## Canonical Files
- Scoped explorer: `apps/web/src/components/sessions/session-archive.tsx`
- Trajectory plot: `apps/web/src/components/sessions/trajectory-plot.tsx`

## Inputs
- The session record (scan_prefix, map_keys, odometry_keys, trajectory keys)
- Scans listed live from B2 under the scan prefix

## Outputs
- Rendered lists with per-object downloads; a top-down trajectory plot (recovered path + optional ground-truth overlay)
- No 3D point-cloud viewer — the `.ply` map is downloadable for offline tools (keeps the UI light)

## Flow
- The archive card runs a scoped `ListObjectsV2` on the scan prefix and renders the record's artifact keys; each row downloads via a presigned GET
- The trajectory card is enabled once the session is `complete`; it fetches the proxied GeoJSON and draws the path(s) as SVG polylines, auto-fitted to the data bounds

## Edge Cases
- Nothing archived yet → empty state
- Trajectory requested before a run → the plot shows a "run first" empty state; the API returns 409 if fetched early
- The trajectory is proxied through the API, so the plot works without configuring the bucket's CORS for the web origin

## UX States
- Empty: "Nothing archived yet" / "No trajectory yet"
- Loading: skeletons for the lists and the plot
- Loaded: grouped downloads and the rendered path

## Verification
- Test files: `services/api/tests/test_sessions.py` (trajectory retrieval + artifact writes), `apps/web/src/lib/queries.test.ts`
- Required cases: scoped listing renders scans; trajectory proxy returns the GeoJSON; downloads use presigned GET
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Verification](../verification.md#non-live-verification) are available
- Pass criteria: focused tests and `pnpm verify` green; explain any skipped `pnpm verify:full` prerequisites

## Related Docs
- [LiDAR Sessions](lidar-sessions.md)
- [Map & Trajectory Export](map-trajectory-export.md)
- [File Browser](file-browser.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
