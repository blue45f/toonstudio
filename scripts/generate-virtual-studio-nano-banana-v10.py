#!/usr/bin/env python3
"""Build the Virtual Studio Nano Banana v10 High-DPI Theme, Decoration & Character Sprite Pack.

Processes the three Nano Banana generated master boards into runtime WebP atlases,
individual prop cards, direction-corrected transparent-matte character sprite frames,
and a SHA-256 verified manifest.json under apps/web/public/assets/virtual-studio/nano-banana-v10/.
"""
from __future__ import annotations

import hashlib
import json
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT: Final = Path(__file__).resolve().parents[1]
OUT_DIR: Final = ROOT / "apps/web/public/assets/virtual-studio/nano-banana-v10"
SOURCE_DIR: Final = OUT_DIR / "source"

DECOR_SOURCE: Final = SOURCE_DIR / "nano-banana-decor-atlas-source.jpg"
CHAR_SOURCE: Final = SOURCE_DIR / "nano-banana-character-spritesheet-source.jpg"
PANORAMA_SOURCE: Final = SOURCE_DIR / "nano-banana-floor-panorama-source.jpg"


@dataclass(frozen=True)
class DecorPropSpec:
    id: str
    decor_type: str
    label_ko: str
    label_en: str
    box: tuple[int, int, int, int]
    zone_ko: str
    rea_inspiration: str


DECOR_PROPS: Final = (
    DecorPropSpec(
        "cintiq-drawing-desk",
        "drawing-desk",
        "와콤 신티크 듀얼 작화 데스크",
        "Wacom Cintiq Dual Drawing Desk",
        (16, 24, 384, 412),
        "2F 집중 작화 포드",
        "Tandem · Gather · Teemyco",
    ),
    DecorPropSpec(
        "hologram-pedestal",
        "portal",
        "3D 캐릭터 홀로그램 페데스탈",
        "3D Character Hologram Pedestal",
        (280, 28, 724, 484),
        "2F 3D 레퍼런스 검수 홀",
        "Spatial · FrameVR · Arthur VR",
    ),
    DecorPropSpec(
        "lofi-bookshelf-lounge",
        "bookshelf",
        "로파이 북셸프 & 캣 독서 코너",
        "Lo-Fi Bookshelf & Cat Reading Nook",
        (624, 10, 994, 442),
        "1F 스토리 라이브러리",
        "SoWork · Kumospace · Cozy Cafe",
    ),
    DecorPropSpec(
        "on-air-critique-booth",
        "review-board",
        "ON AIR 방음 라이브 합평 부스",
        "ON AIR Soundproof Critique Booth",
        (20, 424, 496, 980),
        "1F 타운홀 · 라이브 부스",
        "Roam · Airtime · Krisp BVC",
    ),
    DecorPropSpec(
        "biophilic-planter-set",
        "tree",
        "바이오필릭 플랜테리어 컬렉션",
        "Biophilic Studio Planter Collection",
        (536, 476, 990, 980),
        "3F 바이오필릭 웰니스 테라스",
        "Breakroom · Virbela · Topia",
    ),
)

CHARACTER_CELLS: Final = (
    # (id, direction, pose, col, row, mirror_x, label_ko)
    ("idle-down", "down", "idle", 0, 0, False, "정면 대기 (Front Idle)"),
    ("idle-left", "left", "idle", 1, 0, True, "좌측 대기 (Left Idle · 방향 보정)"),
    ("idle-right", "right", "idle", 2, 0, False, "우측 대기 (Right Idle)"),
    ("idle-up", "up", "idle", 3, 0, False, "후면 대기 (Back Idle)"),
    ("drawing-down", "down", "drawing", 0, 1, False, "정면 태블릿 작화 (Front Drawing)"),
    ("drawing-left", "left", "drawing", 1, 1, False, "좌측 태블릿 작화 (Left Drawing)"),
    ("drawing-right", "right", "drawing", 2, 1, False, "우측 태블릿 작화 (Right Drawing)"),
    ("drawing-up", "up", "drawing", 3, 1, False, "후면 듀얼모니터 작화 (Back Drawing)"),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_webp(image: Image.Image, path: Path, *, lossless: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=94, method=6, exact=True, lossless=lossless)


def is_grid_bg_pixel(r: int, g: int, b: int) -> bool:
    """Detect light paper/grid background pixels outside the dark cel-shaded outline."""
    lum = (r + g + b) / 3.0
    chroma = max(r, g, b) - min(r, g, b)
    return lum >= 135.0 and chroma <= 34


def extract_clean_character_cell(
    sheet: Image.Image, col: int, row: int, *, mirror_x: bool = False
) -> Image.Image:
    cell_w = sheet.width // 4  # 300
    cell_h = sheet.height // 2  # 448
    x0 = col * cell_w
    y0 = row * cell_h
    # Crop out the top text label (~38px) and bottom text label (~34px) + 4px border lines
    crop_box = (x0 + 6, y0 + 38, x0 + cell_w - 6, y0 + cell_h - 34)
    cropped = sheet.crop(crop_box).convert("RGBA")
    if mirror_x:
        cropped = ImageOps.mirror(cropped)

    w, h = cropped.size
    pixels = cropped.load()
    visited = [[False] * w for _ in range(h)]
    queue: deque[tuple[int, int]] = deque()

    # Seed floodfill from all 4 edges
    for x in range(w):
        for y in (0, h - 1):
            r, g, b, _ = pixels[x, y]
            if is_grid_bg_pixel(r, g, b):
                visited[y][x] = True
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x]:
                r, g, b, _ = pixels[x, y]
                if is_grid_bg_pixel(r, g, b):
                    visited[y][x] = True
                    queue.append((x, y))

    while queue:
        cx, cy = queue.popleft()
        pixels[cx, cy] = (0, 0, 0, 0)
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                r, g, b, _ = pixels[nx, ny]
                if is_grid_bg_pixel(r, g, b):
                    visited[ny][nx] = True
                    queue.append((nx, ny))

    # Fit cleanly into a 256x256 RGBA sprite cell with consistent bottom foot baseline
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    fitted = ImageOps.contain(cropped, (236, 236), method=Image.Resampling.LANCZOS)
    ox = (256 - fitted.width) // 2
    oy = 256 - fitted.height - 6
    canvas.alpha_composite(fitted, (ox, oy))
    return canvas


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    generated_files: list[Path] = []

    # 1. Panorama floor theme
    panorama = Image.open(PANORAMA_SOURCE).convert("RGB")
    panorama_fit = ImageOps.fit(
        panorama, (1280, 720), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5)
    )
    panorama_fit = ImageEnhance.Sharpness(panorama_fit).enhance(1.1)
    panorama_out = OUT_DIR / "studio-theme-floor-panorama.webp"
    save_webp(panorama_fit, panorama_out)
    generated_files.append(panorama_out)

    # 2. Decor atlas & individual props
    decor_sheet = Image.open(DECOR_SOURCE).convert("RGB")
    decor_atlas_out = OUT_DIR / "studio-theme-decor-atlas.webp"
    save_webp(decor_sheet, decor_atlas_out)
    generated_files.append(decor_atlas_out)

    prop_records: list[dict[str, object]] = []
    for prop in DECOR_PROPS:
        crop = decor_sheet.crop(prop.box)
        prop_img = ImageOps.fit(
            crop, (384, 384), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5)
        )
        prop_img = prop_img.filter(
            ImageFilter.UnsharpMask(radius=1.1, percent=115, threshold=3)
        )
        prop_path = OUT_DIR / "props" / f"{prop.id}.webp"
        save_webp(prop_img, prop_path)
        generated_files.append(prop_path)
        prop_records.append(
            {
                "id": prop.id,
                "decorType": prop.decor_type,
                "labelKo": prop.label_ko,
                "labelEn": prop.label_en,
                "zoneKo": prop.zone_ko,
                "reaInspiration": prop.rea_inspiration,
                "assetUrl": f"/assets/virtual-studio/nano-banana-v10/props/{prop.id}.webp",
                "sourceBox": list(prop.box),
            }
        )

    # 3. Character sprite sheet & cleaned transparent RGBA 4x2 atlas
    char_sheet = Image.open(CHAR_SOURCE).convert("RGBA")
    char_sheet_out = OUT_DIR / "creator-character-spritesheet.webp"
    save_webp(char_sheet.convert("RGB"), char_sheet_out)
    generated_files.append(char_sheet_out)

    clean_atlas = Image.new("RGBA", (1024, 512), (0, 0, 0, 0))
    frame_records: list[dict[str, object]] = []

    for frame_id, direction, pose, col, row, mirror_x, label_ko in CHARACTER_CELLS:
        cell_img = extract_clean_character_cell(
            char_sheet, col, row, mirror_x=mirror_x
        )
        clean_atlas.alpha_composite(cell_img, (col * 256, row * 256))
        frame_path = OUT_DIR / "frames" / f"{frame_id}.webp"
        save_webp(cell_img, frame_path, lossless=True)
        generated_files.append(frame_path)
        frame_records.append(
            {
                "id": frame_id,
                "direction": direction,
                "pose": pose,
                "column": col,
                "row": row,
                "mirroredForDirectionConsistency": mirror_x,
                "labelKo": label_ko,
                "assetUrl": f"/assets/virtual-studio/nano-banana-v10/frames/{frame_id}.webp",
                "atlasRect": {"x": col * 256, "y": row * 256, "width": 256, "height": 256},
            }
        )

    clean_atlas_out = OUT_DIR / "creator-character-clean-atlas.webp"
    save_webp(clean_atlas, clean_atlas_out, lossless=True)
    generated_files.append(clean_atlas_out)

    manifest = {
        "version": 10,
        "packId": "nano-banana-v10",
        "generatedAt": "2026-10-27",
        "generator": "Nano Banana (Gemini Image Generation) + deterministic RGBA sprite & prop extraction",
        "panorama": {
            "assetUrl": "/assets/virtual-studio/nano-banana-v10/studio-theme-floor-panorama.webp",
            "width": 1280,
            "height": 720,
        },
        "decorAtlas": {
            "assetUrl": "/assets/virtual-studio/nano-banana-v10/studio-theme-decor-atlas.webp",
            "width": 1024,
            "height": 1024,
            "props": prop_records,
        },
        "characterAtlas": {
            "referenceSheetUrl": "/assets/virtual-studio/nano-banana-v10/creator-character-spritesheet.webp",
            "cleanRgbaAtlasUrl": "/assets/virtual-studio/nano-banana-v10/creator-character-clean-atlas.webp",
            "width": 1024,
            "height": 512,
            "columns": 4,
            "rows": 2,
            "cellWidth": 256,
            "cellHeight": 256,
            "frames": frame_records,
        },
        "files": [
            {
                "file": p.relative_to(OUT_DIR).as_posix(),
                "bytes": p.stat().st_size,
                "sha256": sha256(p),
            }
            for p in sorted(generated_files)
        ],
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    print(
        f"Nano Banana v10 Studio Pack generated: {len(generated_files)} files, "
        f"{len(prop_records)} props, {len(frame_records)} character frames"
    )


if __name__ == "__main__":
    main()
