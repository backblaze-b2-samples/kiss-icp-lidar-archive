"""Small, dependency-light writers for point-cloud and trajectory artifacts.

Deliberately avoids open3d / pyquaternion: a binary PLY writer and TUM/GeoJSON
serializers are a few lines of numpy, and skipping the heavy visualizer stack
keeps the install to prebuilt wheels only.
"""

from __future__ import annotations

import json

import numpy as np


def write_ply(points: np.ndarray) -> bytes:
    """Serialize an (N,3) point cloud to a binary little-endian PLY."""
    pts = np.asarray(points, dtype=np.float32).reshape(-1, 3)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {len(pts)}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "end_header\n"
    )
    return header.encode("ascii") + pts.tobytes(order="C")


def rotation_to_quaternion(matrix: np.ndarray) -> tuple[float, float, float, float]:
    """Convert a 3x3 rotation matrix to a (qx, qy, qz, qw) quaternion (numpy only)."""
    m = np.asarray(matrix, dtype=float)
    trace = m[0, 0] + m[1, 1] + m[2, 2]
    if trace > 0.0:
        s = np.sqrt(trace + 1.0) * 2.0
        qw = 0.25 * s
        qx = (m[2, 1] - m[1, 2]) / s
        qy = (m[0, 2] - m[2, 0]) / s
        qz = (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2.0
        qw = (m[2, 1] - m[1, 2]) / s
        qx = 0.25 * s
        qy = (m[0, 1] + m[1, 0]) / s
        qz = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2.0
        qw = (m[0, 2] - m[2, 0]) / s
        qx = (m[0, 1] + m[1, 0]) / s
        qy = 0.25 * s
        qz = (m[1, 2] + m[2, 1]) / s
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2.0
        qw = (m[1, 0] - m[0, 1]) / s
        qx = (m[0, 2] + m[2, 0]) / s
        qy = (m[1, 2] + m[2, 1]) / s
        qz = 0.25 * s
    return float(qx), float(qy), float(qz), float(qw)


def write_tum(poses: list[np.ndarray]) -> str:
    """TUM-format trajectory: `timestamp tx ty tz qx qy qz qw` per line.

    Timestamps are the integer frame indices (synthetic frames carry no clock).
    """
    lines = []
    for i, pose in enumerate(poses):
        p = np.asarray(pose, dtype=float).reshape(4, 4)
        tx, ty, tz = p[0, 3], p[1, 3], p[2, 3]
        qx, qy, qz, qw = rotation_to_quaternion(p[:3, :3])
        lines.append(
            f"{i:.6f} {tx:.6f} {ty:.6f} {tz:.6f} "
            f"{qx:.6f} {qy:.6f} {qz:.6f} {qw:.6f}"
        )
    return "\n".join(lines) + "\n"


def write_geojson(
    estimated: np.ndarray, ground_truth: np.ndarray | None = None
) -> str:
    """A GeoJSON FeatureCollection with the recovered path (and optional GT).

    Coordinates are planar metres in the first-frame sensor frame (top-down x/y),
    not longitude/latitude — the 2D trajectory plot reads them directly.
    """
    features = [_line_feature(estimated, "estimated", "KISS-ICP recovered path")]
    if ground_truth is not None and len(ground_truth):
        features.append(
            _line_feature(ground_truth, "ground_truth", "Synthetic ground truth")
        )
    return json.dumps(
        {
            "type": "FeatureCollection",
            "properties": {"units": "metres", "frame": "sensor_0"},
            "features": features,
        }
    )


def _line_feature(positions: np.ndarray, name: str, label: str) -> dict:
    coords = [[float(x), float(y)] for x, y, _ in np.asarray(positions).reshape(-1, 3)]
    return {
        "type": "Feature",
        "properties": {"name": name, "label": label},
        "geometry": {"type": "LineString", "coordinates": coords},
    }
