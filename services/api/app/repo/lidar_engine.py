"""KISS-ICP odometry + incremental mapping, contained in the repo/ layer.

`kiss-icp` is the real OSS SLAM engine and the sample's headline capability. It
is imported lazily inside `run_odometry` so importing this module — for tests,
the OpenAPI export, or on a machine without the wheel — never requires the
engine. A missing/incompatible engine raises `EngineUnavailableError`, which the
service maps to a `failed` run instead of a 500.

CPU-only: kiss-icp has no GPU/CUDA code path, so there is deliberately no
device-autodetect branch here — there is nothing to detect.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass

import numpy as np

# quality preset -> (voxel_size m, max_range m, max_num_threads [0 = auto]).
# Smaller voxels + longer range = denser map / more accurate, slower.
QUALITY_PRESETS: dict[str, tuple[float, float, int]] = {
    "fast": (0.8, 80.0, 0),
    "balanced": (0.5, 100.0, 0),
    "accurate": (0.3, 100.0, 0),
}


class EngineUnavailableError(RuntimeError):
    """kiss-icp is not importable/usable on this platform or interpreter."""


@dataclass
class OdometryResult:
    poses: list[np.ndarray]  # one 4x4 world-from-current transform per frame
    map_points: np.ndarray  # (N, 3) accumulated local map
    snapshots: list[tuple[int, np.ndarray]]  # (frame_index, (M,3)) checkpoints


def _apply_config(cfg, voxel_size: float, max_range: float, max_threads: int) -> None:
    """Best-effort mapping of a quality preset onto the KISS-ICP config.

    Guarded with hasattr so a minor upstream field rename degrades to defaults
    rather than crashing the run.
    """
    data = getattr(cfg, "data", None)
    if data is not None:
        if hasattr(data, "deskew"):
            data.deskew = False  # synthetic frames carry no per-point timestamps
        if hasattr(data, "max_range"):
            data.max_range = max_range
        if hasattr(data, "min_range"):
            data.min_range = 0.5
    mapping = getattr(cfg, "mapping", None)
    if mapping is not None and hasattr(mapping, "voxel_size"):
        mapping.voxel_size = voxel_size
    registration = getattr(cfg, "registration", None)
    if registration is not None and hasattr(registration, "max_num_threads"):
        registration.max_num_threads = max_threads


def _last_pose(odom) -> np.ndarray:
    pose = getattr(odom, "last_pose", None)
    if pose is None:
        pose = odom.poses[-1]
    return np.asarray(pose, dtype=float).copy()


def _map_points(odom) -> np.ndarray:
    local_map = odom.local_map
    point_cloud = getattr(local_map, "point_cloud", None)
    pc = point_cloud() if callable(point_cloud) else point_cloud
    arr = np.asarray(pc, dtype=float)
    return arr.reshape(-1, 3) if arr.size else arr.reshape(0, 3)


def run_odometry(
    frames: Iterable[np.ndarray],
    *,
    quality: str = "balanced",
    snapshot_every: int = 0,
    on_progress: Callable[[int], None] | None = None,
) -> OdometryResult:
    """Run KISS-ICP over `frames` (each an (N,3) float array).

    Returns the per-frame 4x4 poses, the final accumulated map, and periodic map
    snapshots (every `snapshot_every` frames). Raises EngineUnavailableError if
    kiss-icp cannot be imported/constructed on this platform.
    """
    try:
        from kiss_icp.config import load_config
        from kiss_icp.kiss_icp import KissICP
    except Exception as exc:
        raise EngineUnavailableError(
            "kiss-icp is not installed or failed to import. Install it "
            "(pip install kiss-icp==1.3.0) on a supported platform "
            "(cp312 wheels: macOS arm64, Linux x86_64)."
        ) from exc

    voxel_size, max_range, max_threads = QUALITY_PRESETS.get(
        quality, QUALITY_PRESETS["balanced"]
    )

    try:
        cfg = load_config(None)
        _apply_config(cfg, voxel_size, max_range, max_threads)
        odom = KissICP(cfg)
    except Exception as exc:
        raise EngineUnavailableError(
            f"kiss-icp failed to initialize: {exc}"
        ) from exc

    poses: list[np.ndarray] = []
    snapshots: list[tuple[int, np.ndarray]] = []

    for i, frame in enumerate(frames):
        points = np.asarray(frame, dtype=np.float64).reshape(-1, 3)
        timestamps = np.zeros(len(points), dtype=np.float64)
        odom.register_frame(points, timestamps)
        poses.append(_last_pose(odom))
        if snapshot_every and (i + 1) % snapshot_every == 0:
            snapshots.append((i + 1, _map_points(odom)))
        if on_progress is not None:
            on_progress(i + 1)

    return OdometryResult(
        poses=poses, map_points=_map_points(odom), snapshots=snapshots
    )
