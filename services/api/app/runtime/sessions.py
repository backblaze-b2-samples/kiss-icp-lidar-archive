import logging

# Sync `def` like the files router: the whole chain is blocking boto3 + CPU SLAM,
# so Starlette runs it in its threadpool instead of stalling the event loop. The
# heavy ingest/run work is deferred to BackgroundTasks (also threadpool-run).
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.service import session_run
from app.service import sessions as sessions_service
from app.service.sessions import SessionNotFoundError, SessionStateError
from app.types import Session, SessionCreate, SessionStats, SessionUpdate

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: like the files routes, these are intentionally UNAUTHENTICATED and
# bucket-wide (single-tenant demo — see docs/SECURITY.md). A multi-tenant clone
# must add auth and scope sessions to the caller.


@router.get("/sessions", response_model=list[Session])
def list_sessions_endpoint():
    return sessions_service.list_sessions()


@router.post("/sessions", response_model=Session)
def create_session_endpoint(payload: SessionCreate, background: BackgroundTasks):
    """Create a session (status `ingesting`) and ingest scans in the background."""
    session = sessions_service.create_session(payload)
    background.add_task(session_run.ingest_session, session.session_id)
    logger.info("Session created: id=%s scene=%s", session.session_id, session.scene)
    return session


@router.get("/sessions/stats", response_model=SessionStats)
def session_stats_endpoint():
    # Declared before /sessions/{session_id} so "stats" is not captured as an id.
    return sessions_service.get_stats()


@router.get("/sessions/{session_id}", response_model=Session)
def get_session_endpoint(session_id: str):
    try:
        return sessions_service.get_session(session_id)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.post("/sessions/{session_id}", response_model=Session)
def update_session_endpoint(session_id: str, payload: SessionUpdate):
    try:
        return sessions_service.update_session(session_id, payload)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.delete("/sessions/{session_id}")
def delete_session_endpoint(session_id: str):
    try:
        deleted = sessions_service.delete_session(session_id)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    logger.info("Session deleted: id=%s objects=%d", session_id, deleted)
    return {"deleted": True, "session_id": session_id, "objects_deleted": deleted}


@router.get("/sessions/{session_id}/trajectory")
def get_trajectory_endpoint(session_id: str):
    """Recovered trajectory as GeoJSON (proxied from B2 for the 2D plot)."""
    try:
        return sessions_service.get_trajectory(session_id)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except SessionStateError as e:
        raise HTTPException(status_code=409, detail=e.detail) from None


@router.post("/sessions/{session_id}/run", response_model=Session)
def run_session_endpoint(session_id: str, background: BackgroundTasks):
    """Kick off the KISS-ICP run (headline). Returns immediately with status
    `running`; the UI polls the record until it reaches `complete`/`failed`."""
    try:
        session = session_run.request_run(session_id)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except SessionStateError as e:
        raise HTTPException(status_code=409, detail=e.detail) from None
    background.add_task(session_run.run_session, session_id)
    logger.info("Session run started: id=%s", session_id)
    return session
