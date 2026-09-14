"""Synthetic LiDAR scan generator (pure numpy, no sensor, no second key).

A static box-room scene (floor, four walls, a few pillars) is sampled once as a
dense world point cloud. A virtual 360-degree sensor then moves along a known
ground-truth path; each frame is the world cloud expressed in that frame's
sensor coordinates, clipped to a visibility range, subsampled, and jittered.

Because every frame is a rigid transform of the *same* geometry, consecutive
frames overlap heavily — which is exactly what KISS-ICP needs to register them.
The known path also gives a ground truth to score drift (ATE) against.
"""

from __future__ import annotations

import numpy as np

_ROOM = 10.0  # room half-extent (m); the room spans [-10, 10] in x and y
_WALL_HEIGHT = 3.0
_SENSOR_Z = 0.6
_SURFACE_SPACING = 0.22  # sample spacing on surfaces (m)
_VIS_RANGE = 25.0  # sensor visibility range (m)
_POINTS_PER_FRAME = 12000
_NOISE_M = 0.015

# Axis-aligned square pillars: (center_x, center_y, half_width).
_PILLARS = ((-4.0, 3.0, 0.6), (3.5, -2.5, 0.8), (0.5, 5.0, 0.5))


def _axis(a: float, b: float, spacing: float) -> np.ndarray:
    return np.linspace(a, b, max(int((b - a) / spacing), 2))


def _rot_z(yaw: float) -> np.ndarray:
    c, s = np.cos(yaw), np.sin(yaw)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def build_scene() -> np.ndarray:
    """The static world point cloud (N,3): floor, four walls, and pillars."""
    xs = _axis(-_ROOM, _ROOM, _SURFACE_SPACING)
    ys = _axis(-_ROOM, _ROOM, _SURFACE_SPACING)
    zs = _axis(0.0, _WALL_HEIGHT, _SURFACE_SPACING)
    parts: list[np.ndarray] = []

    gx, gy = np.meshgrid(xs, ys)
    parts.append(np.column_stack([gx.ravel(), gy.ravel(), np.zeros(gx.size)]))

    wy, wz = np.meshgrid(ys, zs)
    parts.append(np.column_stack([np.full(wy.size, -_ROOM), wy.ravel(), wz.ravel()]))
    parts.append(np.column_stack([np.full(wy.size, _ROOM), wy.ravel(), wz.ravel()]))
    wx, wz2 = np.meshgrid(xs, zs)
    parts.append(np.column_stack([wx.ravel(), np.full(wx.size, -_ROOM), wz2.ravel()]))
    parts.append(np.column_stack([wx.ravel(), np.full(wx.size, _ROOM), wz2.ravel()]))

    edge = _axis(-1.0, 1.0, _SURFACE_SPACING)
    pillar_z = _axis(0.0, 2.5, _SURFACE_SPACING)
    for cx, cy, half in _PILLARS:
        e = edge * half
        em, ez = np.meshgrid(e, pillar_z)
        parts.append(np.column_stack([np.full(em.size, cx - half), (cy + em).ravel(), ez.ravel()]))
        parts.append(np.column_stack([np.full(em.size, cx + half), (cy + em).ravel(), ez.ravel()]))
        parts.append(np.column_stack([(cx + em).ravel(), np.full(em.size, cy - half), ez.ravel()]))
        parts.append(np.column_stack([(cx + em).ravel(), np.full(em.size, cy + half), ez.ravel()]))

    return np.vstack(parts).astype(np.float64)


def _trajectory_world(scene: str, num_frames: int) -> tuple[np.ndarray, np.ndarray]:
    """Ground-truth sensor positions (num_frames,3) and yaw (num_frames,)."""
    if scene == "corridor":
        x = np.linspace(-8.0, 8.0, num_frames)
        y = np.zeros(num_frames)
        yaw = np.zeros(num_frames)
    elif scene == "open-loop":
        theta = np.linspace(0.0, np.pi, num_frames)  # half loop, no return
        x, y = 5.5 * np.cos(theta), 5.5 * np.sin(theta)
        yaw = theta + np.pi / 2
    else:  # "warehouse" — a full closed loop
        theta = np.linspace(0.0, 2.0 * np.pi, num_frames, endpoint=False)
        x, y = 5.5 * np.cos(theta), 5.5 * np.sin(theta)
        yaw = theta + np.pi / 2
    positions = np.column_stack([x, y, np.full(num_frames, _SENSOR_Z)])
    return positions, yaw


def generate_frames(
    scene: str, num_frames: int, *, seed: int = 0, points_per_frame: int = _POINTS_PER_FRAME
) -> list[np.ndarray]:
    """Return `num_frames` scans, each an (N,3) float32 cloud in sensor frame."""
    world = build_scene()
    positions, yaw = _trajectory_world(scene, num_frames)
    rng = np.random.default_rng(seed)
    frames: list[np.ndarray] = []
    for i in range(num_frames):
        # p_local = R_i^T (p_world - pos_i)  ==  (p_world - pos_i) @ R_i for rows
        local = (world - positions[i]) @ _rot_z(yaw[i])
        visible = local[np.linalg.norm(local, axis=1) <= _VIS_RANGE]
        if len(visible) > points_per_frame:
            visible = visible[rng.choice(len(visible), points_per_frame, replace=False)]
        visible = visible + rng.normal(0.0, _NOISE_M, visible.shape)
        frames.append(visible.astype(np.float32))
    return frames


def ground_truth_local(scene: str, num_frames: int) -> np.ndarray:
    """Ground-truth positions in the first-frame sensor frame (num_frames,3).

    Matches the frame KISS-ICP reconstructs in (first pose = identity), so the
    estimated path can be compared to it directly for absolute trajectory error.
    """
    positions, yaw = _trajectory_world(scene, num_frames)
    return ((positions - positions[0]) @ _rot_z(yaw[0])).astype(float)
