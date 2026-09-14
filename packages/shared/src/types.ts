export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

/** A short-lived presigned PUT the browser uploads a file directly to B2 with.
 *  `headers` are signed into the URL, so the browser must send them verbatim. */
export interface PresignUploadResponse {
  key: string;
  url: string;
  method: string;
  content_type: string;
  headers: Record<string, string>;
  expires_in: number;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- LiDAR SLAM sessions (primary entity) ---------------------------------

export type ScanSource = "synthetic" | "upload";
export type Scene = "warehouse" | "corridor" | "open-loop";
export type Quality = "fast" | "balanced" | "accurate";
export type SessionStatus =
  | "ingesting"
  | "ingested"
  | "running"
  | "complete"
  | "failed";

export interface SessionMetrics {
  frame_count: number;
  scan_bytes: number;
  map_snapshot_count: number;
  map_point_count: number;
  trajectory_distance_m: number;
  /** Absolute trajectory error (RMSE, m) vs synthetic ground truth; null when
   *  scans were uploaded (no ground truth) or the run hasn't happened yet. */
  ate_rmse_m: number | null;
  run_seconds: number | null;
}

export interface Session {
  session_id: string;
  session_name: string;
  robot_id: string;
  scan_source: ScanSource;
  scene: Scene;
  num_frames: number;
  quality: Quality;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  scan_prefix: string;
  scan_keys_count: number;
  map_keys: string[];
  odometry_keys: string[];
  trajectory_txt_key: string | null;
  trajectory_geojson_key: string | null;
  metrics: SessionMetrics;
  error: string | null;
}

export interface SessionCreate {
  session_name: string;
  robot_id: string;
  scan_source: ScanSource;
  scene: Scene;
  num_frames: number;
  quality: Quality;
}

export interface SessionUpdate {
  session_name: string;
  robot_id: string;
}

export interface SessionStats {
  total_sessions: number;
  total_frames: number;
  total_scan_bytes: number;
  total_scan_bytes_human: string;
  maps_built: number;
  total_trajectory_distance_m: number;
}

/** A GeoJSON LineString feature carrying the recovered / ground-truth path. */
export interface TrajectoryFeature {
  type: "Feature";
  properties: { name: string; label: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface TrajectoryGeoJSON {
  type: "FeatureCollection";
  properties?: Record<string, unknown>;
  features: TrajectoryFeature[];
}
