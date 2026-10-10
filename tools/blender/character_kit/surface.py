"""표면 질의 도구 (mathutils BVH 기반): 최근접 표면점, 무게중심 보간, 법선 계산.

파츠(속옷·의상·속눈썹·눈썹·신발)가 몸/머리 표면을 따라가게 하는 모든 단계가 이 모듈을 쓴다.
`mathutils`는 `bpy`와 함께 오는 모듈이며 bpy 없이는 쓸 수 없다.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class SurfaceHits:
    """질의점마다 가장 가까운 표면점."""

    triangle: np.ndarray  # (M,) 삼각형 번호, 못 찾으면 -1
    bary: np.ndarray  # (M,3) 무게중심 좌표
    point: np.ndarray  # (M,3) 표면점
    distance: np.ndarray  # (M,) 거리
    normal: np.ndarray  # (M,3) 삼각형 법선

    def interpolate(self, triangles: np.ndarray, values: np.ndarray) -> np.ndarray:
        """정점 값 (N,k)을 표면점에서 무게중심으로 보간한 (M,k)."""
        corners = triangles[self.triangle]  # (M,3)
        return np.einsum("mc,mck->mk", self.bary, values[corners])


def vertex_normals(positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    """면적 가중 정점 법선 (N,3)."""
    a, b, c = positions[triangles[:, 0]], positions[triangles[:, 1]], positions[triangles[:, 2]]
    face = np.cross(b - a, c - a)
    normals = np.zeros_like(positions, dtype=np.float64)
    for k in range(3):
        np.add.at(normals, triangles[:, k], face)
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    return normals / np.maximum(length, 1e-12)


def triangle_normals(positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    a, b, c = positions[triangles[:, 0]], positions[triangles[:, 1]], positions[triangles[:, 2]]
    face = np.cross(b - a, c - a)
    return face / np.maximum(np.linalg.norm(face, axis=1, keepdims=True), 1e-12)


def barycentric(point: np.ndarray, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    """점 (M,3)이 삼각형 (a,b,c) 평면에 놓였다고 보고 무게중심 (M,3)을 구한다."""
    v0, v1, v2 = b - a, c - a, point - a
    d00 = np.einsum("ij,ij->i", v0, v0)
    d01 = np.einsum("ij,ij->i", v0, v1)
    d11 = np.einsum("ij,ij->i", v1, v1)
    d20 = np.einsum("ij,ij->i", v2, v0)
    d21 = np.einsum("ij,ij->i", v2, v1)
    denom = d00 * d11 - d01 * d01
    denom = np.where(np.abs(denom) < 1e-18, 1e-18, denom)
    v = (d11 * d20 - d01 * d21) / denom
    w = (d00 * d21 - d01 * d20) / denom
    return np.stack([1.0 - v - w, v, w], axis=1)


class Surface:
    """삼각형 표면과 BVH. 같은 표면에 여러 번 질의할 때 한 번만 만든다."""

    def __init__(self, positions: np.ndarray, triangles: np.ndarray) -> None:
        import mathutils.bvhtree as bvh  # noqa: PLC0415

        self.positions = np.asarray(positions, dtype=np.float64)
        self.triangles = np.asarray(triangles, dtype=np.int64)
        self._tree = bvh.BVHTree.FromPolygons(self.positions.tolist(), self.triangles.tolist())
        self.face_normals = triangle_normals(self.positions, self.triangles)

    def closest(self, points: np.ndarray, max_distance: float | None = None) -> SurfaceHits:
        points = np.asarray(points, dtype=np.float64)
        count = len(points)
        triangle = np.full(count, -1, dtype=np.int64)
        hit_point = np.zeros((count, 3))
        distance = np.full(count, np.inf)
        limit = float("inf") if max_distance is None else float(max_distance)
        for i, p in enumerate(points.tolist()):
            location, _, index, dist = self._tree.find_nearest(p, limit)
            if location is None:
                continue
            triangle[i] = index
            hit_point[i] = (location.x, location.y, location.z)
            distance[i] = dist
        found = triangle >= 0
        bary = np.zeros((count, 3))
        if found.any():
            tri = self.triangles[triangle[found]]
            bary[found] = barycentric(hit_point[found], self.positions[tri[:, 0]], self.positions[tri[:, 1]], self.positions[tri[:, 2]])
            bary[found] = np.clip(bary[found], 0.0, 1.0)
            bary[found] /= np.maximum(bary[found].sum(axis=1, keepdims=True), 1e-12)
        normal = np.zeros((count, 3))
        normal[found] = self.face_normals[triangle[found]]
        return SurfaceHits(triangle=triangle, bary=bary, point=hit_point, distance=distance, normal=normal)

    def ray(self, origins: np.ndarray, directions: np.ndarray, max_distance: float = 1.0e3) -> tuple[np.ndarray, np.ndarray]:
        """광선 첫 교차점과 삼각형 번호. 교차가 없으면 삼각형 -1."""
        origins = np.asarray(origins, dtype=np.float64)
        directions = np.asarray(directions, dtype=np.float64)
        hits = np.zeros_like(origins)
        triangle = np.full(len(origins), -1, dtype=np.int64)
        for i, (o, d) in enumerate(zip(origins.tolist(), directions.tolist(), strict=True)):
            location, _, index, _ = self._tree.ray_cast(o, d, max_distance)
            if location is None:
                continue
            hits[i] = (location.x, location.y, location.z)
            triangle[i] = index
        return hits, triangle
