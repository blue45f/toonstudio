"""의상 텍스처를 키트의 "상대색" 텍스처로 바꾼다 (PIL + numpy).

키트 재질은 레시피 색을 `baseColorFactor`가 아니라 **텍스처에 곱해서** 쓴다(`authored-kit-spec.md` 3.6절). 그래서 텍스처는 색을 빼고
밝은 회색(평균 휘도 ≥ 0.75)이어야 하고, 주름·바느질·가닥 같은 디테일만 어둡게 남는다. Rodin 산출물에는 색과 사실적인 굽기 음영이
섞여 있으므로 다음을 한다.

1. 휘도(Y)만 취한다(색 제거). 굽기 음영이 앱 툰 셰이더의 음영과 겹쳐 지저분해지지 않도록 가볍게 블러해 잔 노이즈를 지운다.
2. 메시가 실제로 쓰는 UV 영역(삼각형 래스터)에서만 밝기 분포를 재서 `[1 - strength, 1]` 범위로 다시 매긴다(`strength`가 클수록 디테일이 진하다).
3. 선택적으로 몇 단계로 끊어(`bands`) 셀 음영 같은 느낌을 낸다. 가장자리는 부드럽게 두어 계단이 거칠지 않게 한다.
4. UV를 쓰지 않는 칸은 사용 영역 평균으로 채우고 몇 픽셀 확장해 밉맵 번짐을 막는다.
5. 1024² JPEG(품질 90, 4:4:4)로 낸다. 검증기 V13은 recolor 재질의 평균 휘도 ≥ 0.75, 크기 ≤ 1024², 불투명은 JPEG를 요구한다.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter


@dataclass(frozen=True)
class TextureStyle:
    """상대색 텍스처의 화풍 파라미터."""

    strength: float = 0.30  # 디테일의 어두움(0이면 완전 흰색). 밝은 쪽 하한 = 1 - strength
    blur_radius: float = 1.2  # 휘도 블러 반경(픽셀, 1024² 기준)
    bands: int = 0  # 0이면 연속, N이면 N단계로 끊는다(툰 느낌)
    band_softness: float = 0.12  # 단계 경계의 부드러움(0..0.5)
    size: int = 1024
    quality: int = 90
    contrast_percentiles: tuple[float, float] = (3.0, 97.0)


def luminance(rgb: np.ndarray) -> np.ndarray:
    """sRGB 인코딩 값의 휘도(검증기와 같은 계수)."""
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def rasterize_uv_mask(uv_triangles: np.ndarray, size: int) -> np.ndarray:
    """삼각형 UV (T,3,2; glTF 규약, v가 아래로 증가)가 덮는 칸을 불리언 (size,size)로 칠한다."""
    mask = np.zeros((size, size), dtype=bool)
    pixels = uv_triangles * size
    for tri in pixels:
        x0 = int(np.floor(tri[:, 0].min()))
        x1 = int(np.ceil(tri[:, 0].max()))
        y0 = int(np.floor(tri[:, 1].min()))
        y1 = int(np.ceil(tri[:, 1].max()))
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = tri
        denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(denom) < 1e-12:
            continue
        w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / denom
        w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / denom
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        mask[y0 : y1 + 1, x0 : x1 + 1] |= inside
    return mask


def dilate(mask: np.ndarray, pixels: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(pixels):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def _soft_posterize(values: np.ndarray, bands: int, softness: float) -> np.ndarray:
    """0..1 값을 bands 단계로 끊되 경계를 softness 폭으로 부드럽게 잇는다."""
    if bands <= 1:
        return values
    scaled = values * bands
    base = np.floor(np.clip(scaled, 0, bands - 1e-6))
    frac = scaled - base
    edge0 = 0.5 - softness
    edge1 = 0.5 + softness
    t = np.clip((frac - edge0) / max(edge1 - edge0, 1e-6), 0.0, 1.0)
    t = t * t * (3.0 - 2.0 * t)
    stepped = (base + t) / bands
    return np.clip(stepped * bands / max(bands - 1, 1), 0.0, 1.0) if bands > 1 else stepped


def relative_color_texture(image_bytes: bytes, uv_triangles: np.ndarray, style: TextureStyle) -> tuple[bytes, dict]:
    """원본 기본색 이미지(PNG/JPEG 바이트)를 상대색 JPEG로 바꾼다. (JPEG 바이트, 통계)를 돌려준다."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    if image.size != (style.size, style.size):
        image = image.resize((style.size, style.size), Image.Resampling.BOX if image.size[0] > style.size else Image.Resampling.BICUBIC)
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    y = luminance(rgb)
    if style.blur_radius > 0:
        y_image = Image.fromarray(np.clip(y * 255.0 + 0.5, 0, 255).astype(np.uint8), mode="L").filter(ImageFilter.GaussianBlur(style.blur_radius))
        y = np.asarray(y_image, dtype=np.float32) / 255.0

    used = rasterize_uv_mask(uv_triangles, style.size)
    padded = dilate(used, 4)
    low, high = np.percentile(y[used], style.contrast_percentiles) if used.any() else (0.0, 1.0)
    normalized = np.clip((y - low) / max(high - low, 1e-3), 0.0, 1.0)
    normalized = _soft_posterize(normalized, style.bands, style.band_softness)
    out = 1.0 - style.strength * (1.0 - normalized)
    fill = float(out[used].mean()) if used.any() else 1.0
    out = np.where(padded, out, fill)

    gray = np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(np.stack([gray, gray, gray], axis=-1), mode="RGB").save(buffer, format="JPEG", quality=style.quality, subsampling=0, optimize=True)
    data = buffer.getvalue()
    stats = {
        "bytes": len(data),
        "size": style.size,
        "usedFraction": round(float(used.mean()), 4),
        "meanLuminance": round(float(out.mean()), 4),
        "meanLuminanceUsed": round(fill, 4),
        "minLuminance": round(float(out[used].min()), 4) if used.any() else None,
        "sourcePercentiles": [round(float(low), 4), round(float(high), 4)],
    }
    return data, stats
