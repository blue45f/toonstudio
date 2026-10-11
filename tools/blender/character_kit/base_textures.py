"""베이스 텍스처 생성 (numpy + Pillow, bpy 불필요).

계약 3.6의 규칙을 따른다.
- recolor 재질(피부·홍채·속눈썹·눈썹)의 텍스처는 **상대색**이다: 밝은 중립색(평균 휘도 ≥ 0.75, 홍채는 ≥ 0.55)이고 앱이 틴트를 곱해 최종색을 만든다.
- 고정색 재질(눈·치아·혀·속옷·캐치라이트)의 `tint.hex`는 거의 흰색(`#f4f4f6`)이라 텍스처가 색을 나른다.
- 불투명은 JPEG(베이스라인), 알파가 필요한 것(속눈썹·눈썹 컷아웃)만 PNG(RGBA). 크기는 2의 거듭제곱, 몸·머리 ≤ 2048², 그 밖 ≤ 1024².
- ORM·emissive 텍스처는 쓰지 않는다.

피부 텍스처는 면 단위 색(해부 분할·입술·입 안·눈구멍 안쪽·볼 홍조·관절 붉은기·오목한 곳 음영)을 UV 공간에 칠하고 작은 가우시안으로 경계를 풀며
섬 가장자리를 몇 픽셀 번지게(패딩) 한 뒤 픽셀 단위 미세 잡음을 얹어 만든다.
"""

from __future__ import annotations

import io
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from . import uvtools

FIXED_NEUTRAL = (1.0, 1.0, 1.0)


# ---------------------------------------------------------------- 인코딩


def to_uint8(image: np.ndarray) -> np.ndarray:
    return np.clip(np.rint(image * 255.0), 0, 255).astype(np.uint8)


def encode_jpeg(image: np.ndarray, quality: int = 90, subsampling: int = 0) -> bytes:
    """0..1 float (H,W,3) → 베이스라인 JPEG 바이트(프로그레시브·최적화 끔: 검증기의 JPEG 해독기가 읽는다)."""
    buffer = io.BytesIO()
    Image.fromarray(to_uint8(image), "RGB").save(buffer, format="JPEG", quality=quality, subsampling=subsampling, progressive=False, optimize=False)
    return buffer.getvalue()


def encode_png_rgba(image: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(to_uint8(image), "RGBA").save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def luminance(image: np.ndarray, alpha: np.ndarray | None = None) -> float:
    """sRGB 인코딩 값의 휘도(0.2126 R + 0.7152 G + 0.0722 B) 평균. 알파가 있으면 알파 가중(검증기 정의)."""
    lum = 0.2126 * image[..., 0] + 0.7152 * image[..., 1] + 0.0722 * image[..., 2]
    if alpha is None:
        return float(lum.mean())
    return float((lum * alpha).sum() / max(alpha.sum(), 1e-9))


# ---------------------------------------------------------------- 잡음·번짐


def hash_noise(shape: tuple[int, ...], seed: int) -> np.ndarray:
    return np.random.default_rng(seed).random(shape).astype(np.float32)


def value_noise3(points: np.ndarray, frequency: float, seed: int = 0) -> np.ndarray:
    """3D 값 잡음(0..1). 격자 모서리 값은 정수 해시, 사이는 부드럽게 보간한다."""
    p = points * frequency
    i = np.floor(p).astype(np.int64)
    f = p - i
    f = f * f * (3.0 - 2.0 * f)

    def corner(dx: int, dy: int, dz: int) -> np.ndarray:
        h = (i[:, 0] + dx) * 73856093 ^ (i[:, 1] + dy) * 19349663 ^ (i[:, 2] + dz) * 83492791 ^ (seed * 2654435761)
        h = (h ^ (h >> 13)) * 1274126177
        h = h ^ (h >> 16)
        return (h & 0xFFFF).astype(np.float64) / 65535.0

    c000, c100, c010, c110 = corner(0, 0, 0), corner(1, 0, 0), corner(0, 1, 0), corner(1, 1, 0)
    c001, c101, c011, c111 = corner(0, 0, 1), corner(1, 0, 1), corner(0, 1, 1), corner(1, 1, 1)
    x00 = c000 + (c100 - c000) * f[:, 0]
    x10 = c010 + (c110 - c010) * f[:, 0]
    x01 = c001 + (c101 - c001) * f[:, 0]
    x11 = c011 + (c111 - c011) * f[:, 0]
    y0 = x00 + (x10 - x00) * f[:, 1]
    y1 = x01 + (x11 - x01) * f[:, 1]
    return y0 + (y1 - y0) * f[:, 2]


def gaussian_blur(image: np.ndarray, sigma: float) -> np.ndarray:
    """분리형 가우시안(반경 3σ). 채널 수 임의."""
    if sigma <= 0:
        return image
    radius = max(1, int(math.ceil(3.0 * sigma)))
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    out = image.astype(np.float32)
    for axis in (0, 1):
        padded = np.pad(out, [(radius, radius) if a == axis else (0, 0) for a in range(out.ndim)], mode="edge")
        acc = np.zeros_like(out)
        for k, weight in enumerate(kernel):
            slicer = [slice(None)] * out.ndim
            slicer[axis] = slice(k, k + out.shape[axis])
            acc += weight * padded[tuple(slicer)]
        out = acc
    return out


def dilate_fill(image: np.ndarray, coverage: np.ndarray, iterations: int) -> tuple[np.ndarray, np.ndarray]:
    """칠한 픽셀(coverage>0.5)의 색을 인접한 빈 픽셀로 `iterations`번 번지게 한다(섬 가장자리 패딩)."""
    color = image.copy()
    covered = coverage > 0.5
    for _ in range(iterations):
        acc = np.zeros_like(color)
        count = np.zeros(covered.shape, dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                shifted_cov = np.roll(np.roll(covered, dy, axis=0), dx, axis=1)
                shifted_col = np.roll(np.roll(color, dy, axis=0), dx, axis=1)
                acc += shifted_col * shifted_cov[..., None]
                count += shifted_cov
        fill = (~covered) & (count > 0)
        color[fill] = acc[fill] / count[fill][:, None]
        covered = covered | fill
    return color, covered.astype(np.float32)


# ---------------------------------------------------------------- UV 칠하기


def paint_uv_faces(
    uv: np.ndarray,
    triangles: np.ndarray,
    triangle_colors: np.ndarray,
    size: int,
    background: tuple[float, float, float] = (1.0, 1.0, 1.0),
    padding: int = 6,
    blur_sigma: float = 1.0,
) -> np.ndarray:
    """삼각형마다 하나의 색(T,3)을 UV 공간에 칠한다. 섬 밖은 패딩으로 번지게 하고 배경색으로 채운 (size,size,3) float32.

    glTF는 UV 원점이 이미지 왼쪽 위(v가 아래로 증가)이고 `paint_triangles`는 행 = v × size로 칠하므로 뒤집을 필요가 없다."""
    return paint_uv_corners(uv, triangles, np.repeat(np.asarray(triangle_colors, dtype=np.float32)[:, None, :], 3, axis=1), size, background, padding, blur_sigma)


def paint_uv_corners(
    uv: np.ndarray,
    triangles: np.ndarray,
    corner_colors: np.ndarray,
    size: int,
    background: tuple[float, float, float] = (1.0, 1.0, 1.0),
    padding: int = 6,
    blur_sigma: float = 1.0,
) -> np.ndarray:
    """삼각형 모서리마다 색(T,3,3)을 두고 삼각형 안은 바리센트릭으로 보간해 UV 공간에 칠한다(`paint_uv_faces`의 부드러운 판).

    면마다 색을 하나씩 칠하면 색 경계가 쿼드 크기의 계단으로 남는다(입술선·콧구멍 테두리). 정점 평균 색을 모서리에 주면 경계가 한 쿼드 폭의
    기울기로 번져 계단이 사라진다."""
    corner_values = np.concatenate([np.asarray(corner_colors, dtype=np.float32).reshape(-1, 3), np.ones((len(triangles) * 3, 1), dtype=np.float32)], axis=1)
    painted = uvtools.paint_triangles(uv, triangles, corner_values, size, background=np.array([*background, 0.0], dtype=np.float32))
    color, coverage = painted[..., :3], painted[..., 3]
    color, coverage = dilate_fill(color, coverage, padding)
    bg = np.array(background, dtype=np.float32)
    color = np.where(coverage[..., None] > 0.5, color, bg)
    color = gaussian_blur(color, blur_sigma)
    return np.ascontiguousarray(color)


def add_pixel_noise(image: np.ndarray, amplitude: float, seed: int, tint_amplitude: float = 0.0) -> np.ndarray:
    """휘도 잡음(곱셈)과 약한 색조 잡음을 픽셀마다 얹는다. 잡음 평균이 1이라 평균 휘도는 거의 그대로다."""
    rng = np.random.default_rng(seed)
    luma = 1.0 + amplitude * (rng.random(image.shape[:2], dtype=np.float32) - 0.5) * 2.0
    out = image * luma[..., None]
    if tint_amplitude > 0:
        tint = 1.0 + tint_amplitude * (rng.random((*image.shape[:2], 3), dtype=np.float32) - 0.5) * 2.0
        out = out * tint
    return np.clip(out, 0.0, 1.0)


# ---------------------------------------------------------------- 눈·홍채·구강·속옷


def radial_grid(size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(x, y, r) 격자: 이미지 중심이 0, 가장자리가 ±0.5. y는 위가 +."""
    axis = (np.arange(size) + 0.5) / size - 0.5
    x, y = np.meshgrid(axis, -axis)
    return x, y, np.hypot(x, y)


def smooth(lo: float, hi: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def eyeball_texture(size: int = 256, seed: int = 11) -> np.ndarray:
    """공막: 따뜻한 흰색. 코 쪽(작은 u)·가장자리는 살짝 붉고 위쪽은 윗눈꺼풀 그늘로 약간 어둡다. 홍채 덮개 밑 부분은 가려진다."""
    x, y, r = radial_grid(size)
    base = np.stack([np.full_like(x, 0.975), np.full_like(x, 0.962), np.full_like(x, 0.955)], axis=-1)
    redness = smooth(0.30, 0.48, r) * 0.06 + smooth(-0.1, -0.45, x) * 0.05  # 가장자리·코 쪽 모서리
    base[..., 1] -= redness
    base[..., 2] -= redness * 1.1
    shade = 1.0 - 0.10 * smooth(0.0, 0.45, y) - 0.16 * smooth(0.36, 0.5, r)
    out = base * shade[..., None]
    # 미세 혈관 느낌: 방사형 가는 붉은 줄(가장자리 쪽에서만)
    angle = np.arctan2(y, x)
    veins = (np.sin(angle * 23.0 + 6.0 * np.sin(angle * 5.0 + seed)) > 0.93) * smooth(0.28, 0.46, r) * 0.05
    out[..., 1] -= veins
    out[..., 2] -= veins
    return np.clip(add_pixel_noise(out, 0.01, seed), 0.0, 1.0).astype(np.float32)


def iris_texture(size: int = 512, seed: int = 21, variant: str = "realistic") -> np.ndarray:
    """홍채 상대색(밝은 중립 위 윤부 링·동공·그라데이션). 원판 반지름 = 0.48. 평균 휘도는 약 0.7.

    변형(`variant`)
    - `realistic`: 방사 섬유·윤부 링·동공(작음) — 기존 `round-large`의 사실 홍채.
    - `anime`: 웹툰·애니 눈. 큰 동공(rho 0.42)·진한 윤부 링·위가 어둡고 아래가 밝은 세로 그라데이션(윗눈꺼풀 그림자)·아래쪽 초승달 빛.
    - `cat`: `anime`의 그라데이션에 세로 슬릿 동공(가로 0.15 × 세로 0.46).
    - `soft`: 윤부 링 없이 경계가 부드러운 작은 동공과 강한 세로 그라데이션(몽환적인 눈).
    """
    x, y, r = radial_grid(size)
    rho = r / 0.48  # 0 = 중심, 1 = 홍채 가장자리
    angle = np.arctan2(y, x)
    rng = np.random.default_rng(seed)
    inside = smooth(1.02, 0.98, rho)
    if variant == "realistic":
        fiber = np.zeros_like(rho)
        for k in range(5):
            frequency = 24 + 17 * k
            phase = rng.uniform(0, 2 * np.pi)
            fiber += np.sin(angle * frequency + phase + 3.0 * np.sin(angle * (3 + k) + rho * 6.0)) / (k + 1.5)
        fiber = fiber / 2.4
        radial = 0.98 - 0.30 * smooth(0.30, 1.0, rho)  # 동공 가까이 밝고 바깥으로 어두워진다
        collarette = 0.10 * np.exp(-(((rho - 0.52) / 0.07) ** 2))  # 동공 둘레 밝은 띠
        luma = radial + collarette + 0.10 * fiber * smooth(0.28, 0.55, rho)
        luma *= 1.0 - 0.72 * smooth(0.80, 0.97, rho)  # 윤부 링
        pupil = smooth(0.40, 0.34, rho)  # 동공 경계(rho 0.37)
    else:
        # 세로 그라데이션: y가 클수록(위) 어둡다. 아래쪽에는 초승달 모양 반사광(밝은 띠)을 더한다.
        v = np.clip(0.5 - y / 0.96, 0.0, 1.0)  # 위 0 → 아래 1
        if variant == "soft":
            luma = 0.62 + 0.38 * v
            pupil = smooth(0.30, 0.14, rho)
            rim = 0.0
        else:
            luma = 0.58 + 0.42 * smooth(0.0, 1.0, v)
            crescent = np.exp(-(((rho - 0.70) / 0.13) ** 2)) * smooth(0.45, 0.85, v) * 0.16
            luma = luma + crescent
            rim = 0.62 * smooth(0.78, 0.96, rho)  # 윤부 링
            if variant == "cat":
                pupil = smooth(1.0, 0.82, np.hypot(x / 0.072, y / 0.22))  # 가로 0.15·세로 0.46(rho 단위) 슬릿
            else:
                pupil = smooth(0.46, 0.40, rho)  # 큰 동공
        luma = luma * (1.0 - rim) if variant != "soft" else luma
        luma = luma + 0.025 * np.sin(angle * 36.0 + 2.0 * np.sin(angle * 5.0)) * smooth(0.45, 0.7, rho) * smooth(0.95, 0.75, rho)  # 아주 약한 방사 결(가장자리 링은 매끈하게)
    luma = luma * (1.0 - pupil) + 0.025 * pupil
    luma = np.clip(luma, 0.0, 1.0)
    out = luma * inside + 1.0 * (1.0 - inside)
    image = np.repeat(out[..., None], 3, axis=2).astype(np.float32)
    return np.clip(add_pixel_noise(image, 0.012, seed), 0.0, 1.0)


def highlight_texture(size: int = 16) -> np.ndarray:
    return np.ones((size, size, 3), dtype=np.float32)


def teeth_texture(size: int = 256, seed: int = 31) -> np.ndarray:
    """왼쪽 절반 = 치아(상아색, 위아래 약간 그라데이션), 오른쪽 절반 = 잇몸(분홍). `eyes_mouth`의 UV 규약과 같다."""
    axis = (np.arange(size) + 0.5) / size
    u, v = np.meshgrid(axis, axis)
    tooth_v = 1.0 - np.abs(v - 0.5) * 2.0  # 가운데 밝고 위·아래(잇몸 쪽과 날 끝) 약간 어둡다
    tooth = np.stack([0.985 - 0.06 * (1 - tooth_v), 0.965 - 0.10 * (1 - tooth_v), 0.915 - 0.15 * (1 - tooth_v)], axis=-1)
    gum_v = v
    gum = np.stack([0.90 - 0.10 * gum_v, 0.50 - 0.12 * gum_v, 0.52 - 0.12 * gum_v], axis=-1)
    blend = smooth(0.49, 0.51, u)[..., None]
    out = tooth * (1.0 - blend) + gum * blend
    return np.clip(add_pixel_noise(out, 0.008, seed), 0.0, 1.0).astype(np.float32)


def tongue_texture(size: int = 256, seed: int = 41) -> np.ndarray:
    """혀: 분홍 바탕에 가운데 홈과 끝 쪽 밝음, 가장자리 어두움."""
    axis = (np.arange(size) + 0.5) / size
    u, v = np.meshgrid(axis, axis)
    base = np.stack([np.full_like(u, 0.82), np.full_like(u, 0.40), np.full_like(u, 0.43)], axis=-1)
    tip = smooth(0.55, 1.0, v)[..., None] * np.array([0.07, 0.07, 0.06])
    edge = smooth(0.22, 0.5, np.abs(u - 0.5))[..., None] * np.array([0.14, 0.09, 0.09])
    groove = np.exp(-(((u - 0.5) / 0.018) ** 2))[..., None] * 0.18 * smooth(0.0, 0.5, 1.0 - v)[..., None]
    out = (base + tip - edge) * (1.0 - groove)
    rng = np.random.default_rng(seed)
    papillae = (rng.random(u.shape) > 0.985).astype(np.float32)[..., None] * 0.05
    return np.clip(add_pixel_noise(out - papillae, 0.01, seed), 0.0, 1.0).astype(np.float32)


def underwear_texture(size: int = 256, seed: int = 51) -> np.ndarray:
    """속옷 천: 연한 라벤더 흰색 + 가는 직물 무늬."""
    axis = np.arange(size)
    xx, yy = np.meshgrid(axis, axis)
    weave = 0.012 * (np.sin(xx * 1.9) * np.sin(yy * 1.9))
    base = np.stack([np.full((size, size), 0.905), np.full((size, size), 0.915), np.full((size, size), 0.955)], axis=-1)
    out = base * (1.0 + weave[..., None])
    return np.clip(add_pixel_noise(out, 0.012, seed), 0.0, 1.0).astype(np.float32)


# ---------------------------------------------------------------- 속눈썹·눈썹(알파 컷아웃 PNG)


def _supersampled(width: int, height: int, scale: int = 3) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("L", (width * scale, height * scale), 0)
    return image, ImageDraw.Draw(image)


def lash_texture(width: int = 512, height: int = 128, seed: int = 61, style: str = "strands") -> np.ndarray:
    """RGBA: 색은 흰색(상대색), 알파가 모양. 위쪽 행 = 띠 뿌리(v=0), 아래쪽 행 = 끝. 굵은 뿌리선과 바깥으로 쏠린 끝이 가는 가닥들.

    `style="liner"`면 가닥 없이 단단한 아이라인 띠다: u가 0(안쪽 눈구석) → 1(바깥 눈꼬리)로 갈수록 띠가 두꺼워져 바깥 끝이 날카로운 날개가 된다(웹툰·애니 눈매)."""
    if style == "liner":
        scale = 3
        image, draw = _supersampled(width, height, scale)
        W, H = width * scale, height * scale
        xs = np.arange(W) / W
        edge = (np.interp(xs, [0.0, 0.3, 0.65, 0.9, 1.0], [0.36, 0.46, 0.62, 0.86, 0.97]) * H).astype(int)
        for x in range(W):
            draw.line([(x, 0), (x, edge[x])], fill=255)
        alpha = np.asarray(image.resize((width, height), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5)), dtype=np.float32) / 255.0
        edge_fade = smooth(0.0, 0.03, np.arange(width) / width) * smooth(1.0, 0.985, np.arange(width) / width)
        rgba = np.ones((height, width, 4), dtype=np.float32)
        rgba[..., 3] = np.clip(alpha * edge_fade[None, :] * 1.15, 0.0, 1.0)
        return rgba
    scale = 3
    image, draw = _supersampled(width, height, scale)
    W, H = width * scale, height * scale
    rng = np.random.default_rng(seed)
    root = int(H * 0.30)
    # 뿌리선(굵은 띠): 아래쪽 가장자리를 약간 물결치게
    xs = np.arange(W)
    edge = root + (np.sin(xs / W * 14.0) * 0.012 * H).astype(int)
    for x in range(W):
        draw.line([(x, 0), (x, edge[x])], fill=255)
    # 가닥: 뿌리에서 아래(끝)로, 바깥(+u) 쪽으로 쏠리며 가늘어지는 삼각 조각
    strands = 34
    for k in range(strands):
        t = (k + rng.uniform(-0.3, 0.3)) / strands
        x0 = t * W
        length = H * (0.62 + 0.32 * t + rng.uniform(-0.04, 0.04))
        lean = W * (0.010 + 0.075 * t) * rng.uniform(0.7, 1.2)
        width0 = W * 0.0105 * (1.0 - 0.3 * t)
        top = root - H * 0.02
        points = [(x0 - width0, top), (x0 + width0, top), (x0 + lean, top + length)]
        draw.polygon(points, fill=255)
    alpha = np.asarray(image.resize((width, height), Image.LANCZOS), dtype=np.float32) / 255.0
    # 양 끝(u=0, u=1)은 살짝 줄여 띠 이음새가 뭉툭하지 않게
    edge_fade = smooth(0.0, 0.04, np.arange(width) / width) * smooth(1.0, 0.97, np.arange(width) / width)
    alpha = alpha * edge_fade[None, :]
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[..., 3] = alpha
    return rgba


def brow_texture(width: int = 512, height: int = 64, seed: int = 71) -> np.ndarray:
    """RGBA: 흰색(상대색) 위에 알파가 눈썹 모양(안쪽 굵고 바깥 가늚)과 가장자리 털 결."""
    scale = 3
    image, draw = _supersampled(width, height, scale)
    W, H = width * scale, height * scale
    rng = np.random.default_rng(seed)
    u = np.linspace(0.0, 1.0, W)
    half = np.interp(u, [0.0, 0.25, 0.6, 1.0], [0.40, 0.44, 0.34, 0.10]) * H
    center = H * 0.5
    for x in range(W):
        draw.line([(x, center - half[x]), (x, center + half[x])], fill=255)
    # 가장자리 털 결: 중심선 위·아래로 삐져나온 가는 선
    for _ in range(520):
        x0 = rng.uniform(0.0, 0.97) * W
        side = rng.choice([-1.0, 1.0])
        idx = int(min(W - 1, max(0, x0)))
        y0 = center + side * half[idx] * rng.uniform(0.55, 1.0)
        length = rng.uniform(0.04, 0.09) * W
        rise = side * rng.uniform(0.04, 0.16) * H
        draw.line([(x0, y0), (x0 + length, y0 + rise)], fill=255, width=int(rng.uniform(2.2, 3.4) * scale / 3 + 1))
    # 안쪽 속을 약간 비워 털 결이 보이게(알파 구멍이 아닌 밝기 변화 없이 단순화): 그대로 둔다
    alpha = np.asarray(image.resize((width, height), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.4)), dtype=np.float32) / 255.0
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[..., 3] = alpha
    return rgba


# ---------------------------------------------------------------- 피부(면 색 계산)


def vertex_cavity(positions: np.ndarray, normals: np.ndarray, ptr: np.ndarray, idx: np.ndarray, iterations: int = 2) -> np.ndarray:
    """오목한 정도(≥0): 이웃 평균이 정점보다 바깥쪽에 있으면 오목하다. 몇 번 평활해 낮은 주파수로 만든다."""
    count = len(positions)
    degree = np.diff(ptr).astype(np.float64)
    src = np.repeat(np.arange(count), np.diff(ptr))
    sums = np.zeros_like(positions)
    np.add.at(sums, src, positions[idx])
    lap = sums / np.maximum(degree, 1.0)[:, None] - positions
    concave = np.einsum("ij,ij->i", lap, normals)
    for _ in range(iterations):
        totals = np.zeros(count)
        np.add.at(totals, src, concave[idx])
        concave = 0.5 * concave + 0.5 * totals / np.maximum(degree, 1.0)
    return np.clip(concave, 0.0, None)
