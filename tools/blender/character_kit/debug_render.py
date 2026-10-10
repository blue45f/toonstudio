"""확인용 간이 렌더러 (numpy + Pillow, 정사영 + 화가 알고리즘). GPU·bpy 불필요.

빌드 중간 결과(T-포즈 변환, 가중치, 영역, 의상 맞춤)를 눈으로 확인하는 용도라서 정확한 음영이 아니라 형태 확인이 목적이다.
최종 시각 확인은 `apps/character-lab/scripts/kit-preview.mjs`(Babylon)로 한다.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from PIL import Image, ImageDraw


def _rotation_y(angle_deg: float) -> np.ndarray:
    a = np.radians(angle_deg)
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


def _face_normals(points: np.ndarray, tris: np.ndarray) -> np.ndarray:
    a, b, c = points[tris[:, 0]], points[tris[:, 1]], points[tris[:, 2]]
    n = np.cross(b - a, c - a)
    length = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.maximum(length, 1e-12)


def quads_to_tris(quads: np.ndarray) -> np.ndarray:
    return np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]], axis=0)


def render_layers(
    layers: Sequence[tuple[np.ndarray, np.ndarray, np.ndarray | tuple[int, int, int]]],
    *,
    yaw_deg: float = 0.0,
    size: tuple[int, int] = (480, 800),
    bounds: tuple[float, float, float, float] | None = None,
    background: tuple[int, int, int] = (236, 238, 242),
) -> Image.Image:
    """레이어마다 (정점, 삼각형, 면 색 (F,3) 또는 단일 색)을 한 화면에 그린다.

    기본 카메라는 +Z 쪽(캐릭터 정면)에서 본다. `yaw_deg`로 y축 회전(90 = 캐릭터 왼쪽 옆면이 보이는 쪽).
    """
    rotation = _rotation_y(-yaw_deg)
    transformed = [(points @ rotation.T, tris, color) for points, tris, color in layers]
    if bounds is None:
        stack = np.concatenate([points for points, _, _ in transformed], axis=0)
        x0, x1 = float(stack[:, 0].min()), float(stack[:, 0].max())
        y0, y1 = float(stack[:, 1].min()), float(stack[:, 1].max())
        pad = 0.04 * max(x1 - x0, y1 - y0)
        bounds = (x0 - pad, x1 + pad, y0 - pad, y1 + pad)
    x0, x1, y0, y1 = bounds
    width, height = size
    scale = min(width / (x1 - x0), height / (y1 - y0))
    offset_x = (width - scale * (x1 - x0)) / 2.0
    offset_y = (height - scale * (y1 - y0)) / 2.0

    polygons: list[tuple[float, list[tuple[float, float]], tuple[int, int, int]]] = []
    light = np.array([0.35, 0.55, 0.76])
    light = light / np.linalg.norm(light)
    for points, tris, color in transformed:
        normals = _face_normals(points, tris)
        facing = normals[:, 2] > -0.05  # 카메라(+Z)를 향하는 면만
        shade = np.clip(normals @ light, 0.0, 1.0) * 0.65 + 0.35
        screen = np.stack([(points[:, 0] - x0) * scale + offset_x, (y1 - points[:, 1]) * scale + offset_y], axis=1)
        depth = points[tris][:, :, 2].mean(axis=1)
        colors = np.asarray(color, dtype=np.float64)
        for face in np.flatnonzero(facing):
            base = colors[face] if colors.ndim == 2 else colors
            rgb = tuple(int(np.clip(v * shade[face], 0, 255)) for v in base)
            tri = tris[face]
            polygons.append((float(depth[face]), [tuple(screen[v]) for v in tri], rgb))
    polygons.sort(key=lambda item: item[0])
    image = Image.new("RGB", size, background)
    draw = ImageDraw.Draw(image)
    for _, poly, rgb in polygons:
        draw.polygon(poly, fill=rgb)
    return image


def contact_sheet(images: Sequence[Image.Image], columns: int | None = None, gap: int = 6) -> Image.Image:
    columns = columns or len(images)
    rows = (len(images) + columns - 1) // columns
    width = max(image.width for image in images)
    height = max(image.height for image in images)
    sheet = Image.new("RGB", (columns * width + (columns + 1) * gap, rows * height + (rows + 1) * gap), (255, 255, 255))
    for index, image in enumerate(images):
        r, c = divmod(index, columns)
        sheet.paste(image, (gap + c * (width + gap), gap + r * (height + gap)))
    return sheet


def palette(count: int, seed: int = 7) -> np.ndarray:
    """구분이 잘 되는 임의 색 (count,3) uint8."""
    rng = np.random.default_rng(seed)
    colors = rng.integers(40, 235, size=(count, 3))
    return colors.astype(np.float64)
