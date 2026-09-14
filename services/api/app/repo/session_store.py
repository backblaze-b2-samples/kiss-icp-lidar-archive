"""B2 persistence for LiDAR sessions and their artifacts.

No database: each session is a single ``sessions/<id>/index.json`` object, and
the list view enumerates the ``sessions/`` prefix. This module owns the bucket
key layout and all session/artifact reads and writes. It reuses the shared,
custom-user-agent S3 client from ``b2_client`` (boto3 stays confined to repo/).

Bucket layout::

    scans/<robot_id>/<session_id>/frame_000001.bin   raw LiDAR frames (KITTI .bin)
    odometry/<session_id>/batch_0001.json            per-batch pose estimates
    maps/<session_id>/map_0001.ply                    incremental map snapshots
    trajectories/<session_id>/trajectory.txt          TUM-format trajectory
    trajectories/<session_id>/trajectory.geojson      GeoJSON LineString path
    sessions/<session_id>/index.json                  session record + metrics
"""

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import get_s3_client
from app.repo.list_cache import invalidate as _invalidate_list_cache
from app.types import Session

SESSIONS_PREFIX = "sessions/"
_INDEX_SUFFIX = "/index.json"


# --- key builders (single source of truth for the bucket layout) ------------

def scan_prefix_for(robot_id: str, session_id: str) -> str:
    return f"scans/{robot_id}/{session_id}/"


def scan_frame_key(scan_prefix: str, index: int) -> str:
    return f"{scan_prefix}frame_{index:06d}.bin"


def odometry_key(session_id: str, batch: int) -> str:
    return f"odometry/{session_id}/batch_{batch:04d}.json"


def map_key(session_id: str, index: int) -> str:
    return f"maps/{session_id}/map_{index:04d}.ply"


def trajectory_txt_key(session_id: str) -> str:
    return f"trajectories/{session_id}/trajectory.txt"


def trajectory_geojson_key(session_id: str) -> str:
    return f"trajectories/{session_id}/trajectory.geojson"


def index_key(session_id: str) -> str:
    return f"{SESSIONS_PREFIX}{session_id}{_INDEX_SUFFIX}"


# --- object I/O --------------------------------------------------------------

def put_bytes(key: str, data: bytes, content_type: str) -> None:
    """Upload raw bytes to B2. Raises RuntimeError on failure."""
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 put failed for '{key}': {e}") from e
    _invalidate_list_cache()  # new object must show up in the File Explorer


def get_bytes(key: str) -> bytes:
    """Download an object body into memory. Raises RuntimeError on failure."""
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        return response["Body"].read()
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 get failed for '{key}': {e}") from e


def list_keys(prefix: str) -> list[str]:
    """Every object key under ``prefix``, sorted. Raises RuntimeError on failure."""
    client = get_s3_client()
    keys: list[str] = []
    kwargs: dict = {"Bucket": settings.b2_bucket_name, "Prefix": prefix, "MaxKeys": 1000}
    try:
        while True:
            response = client.list_objects_v2(**kwargs)
            keys.extend(obj["Key"] for obj in response.get("Contents", []))
            if not response.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = response["NextContinuationToken"]
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 list failed for '{prefix}': {e}") from e
    return sorted(keys)


# --- session records ---------------------------------------------------------

def put_session(session: Session) -> None:
    """Persist the session record as sessions/<id>/index.json."""
    put_bytes(
        index_key(session.session_id),
        session.model_dump_json(indent=2).encode("utf-8"),
        "application/json",
    )


def get_session(session_id: str) -> Session | None:
    """Read one session record, or None if it does not exist."""
    client = get_s3_client()
    try:
        response = client.get_object(
            Bucket=settings.b2_bucket_name, Key=index_key(session_id)
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return None
        raise RuntimeError(f"B2 get failed for session '{session_id}': {e}") from e
    return Session.model_validate_json(response["Body"].read())


def list_sessions() -> list[Session]:
    """Every session, newest first. One list + one GET per index.json."""
    sessions: list[Session] = []
    for key in list_keys(SESSIONS_PREFIX):
        if not key.endswith(_INDEX_SUFFIX):
            continue
        try:
            sessions.append(Session.model_validate_json(get_bytes(key)))
        except Exception:
            continue
    sessions.sort(key=lambda s: s.created_at, reverse=True)
    return sessions


def delete_session_objects(session: Session) -> int:
    """Prefix-scoped delete of every object belonging to one session.

    SAFETY: only prefixes that contain the session_id are ever deleted, so a
    delete can never reach another session's or another app's data.
    """
    client = get_s3_client()
    sid = session.session_id
    prefixes = [
        session.scan_prefix or scan_prefix_for(session.robot_id, sid),
        f"odometry/{sid}/",
        f"maps/{sid}/",
        f"trajectories/{sid}/",
        f"{SESSIONS_PREFIX}{sid}/",
    ]
    deleted = 0
    for prefix in prefixes:
        if sid not in prefix:  # defensive: never delete an unscoped prefix
            continue
        keys = list_keys(prefix)
        for i in range(0, len(keys), 1000):
            batch = [{"Key": k} for k in keys[i : i + 1000]]
            if not batch:
                continue
            try:
                client.delete_objects(
                    Bucket=settings.b2_bucket_name,
                    Delete={"Objects": batch, "Quiet": True},
                )
            except (ClientError, BotoCoreError) as e:
                raise RuntimeError(f"B2 delete failed for '{prefix}': {e}") from e
            deleted += len(batch)
    if deleted:
        _invalidate_list_cache()
    return deleted
