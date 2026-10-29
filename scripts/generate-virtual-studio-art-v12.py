#!/usr/bin/env python3
"""
Deterministic Studio Art v12 Genre Studio Themes & Specialist Cast + Mascot Pipeline.

Slices and normalizes:
1. 4 Genre-Specific 2.5D Isometric Webtoon Studio Themes from the 2x2 Studio Art v12 Themes Atlas:
   - romance-palace-conservatory
   - murim-bamboo-pavilion
   - scifi-orbital-command
   - brooklyn-indie-comics-loft
2. 8 Transparent-Matte RGBA Specialist Cast & Companion Mascot Sprites (4 Personas x 2 Poses):
   - story-writer-{idle,work}
   - action-mocap-actor-{idle,work}
   - sound-letterer-{idle,work}
   - studio-cat-mascot-{idle,work}
"""

from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path("/Users/hjunkim/.gemini/antigravity/brain/a3aadbfb-b6d6-4b51-a023-0e2c67ea0300")
# ARTIFACT_DIR은 저장소 밖(원본 이미지를 만든 작업 폴더)이라 그 안의 파일 이름은 바꾸지 않는다(바꾸면 원본을 찾지 못한다).
OUT_DIR = REPO_ROOT / "apps/web/public/assets/virtual-studio/studio-art-v12"

THEMES_SRC = ARTIFACT_DIR / "nano_banana_v12_genre_studio_themes_atlas_png_1793046583393.jpg"
CAST_SRC = ARTIFACT_DIR / "nano_banana_v12_specialist_cast_sheet_png_1793046603896.jpg"


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remove_white_exterior_background(img: Image.Image, threshold: int = 242) -> Image.Image:
    """Flood-fills from all image borders through near-white pixels to create a clean RGBA cutout."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    visited = [[False] * w for _ in range(h)]
    queue: deque[tuple[int, int]] = deque()

    def is_bg(x: int, y: int) -> bool:
        r, g, b, _ = px[x, y]
        return r >= threshold and g >= threshold and b >= threshold

    for x in range(w):
        for y in (0, h - 1):
            if not visited[y][x] and is_bg(x, y):
                visited[y][x] = True
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and is_bg(x, y):
                visited[y][x] = True
                queue.append((x, y))

    while queue:
        cx, cy = queue.popleft()
        px[cx, cy] = (0, 0, 0, 0)
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                if is_bg(nx, ny):
                    visited[ny][nx] = True
                    queue.append((nx, ny))

    # Soften 1px fringe along background boundary
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a > 0 and r > 230 and g > 230 and b > 230:
                if any(px[nx, ny][3] == 0 for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
                    px[x, y] = (r, g, b, 96)

    return rgba


def center_on_square_canvas(sprite: Image.Image, canvas_size: int = 256, pad: int = 10) -> Image.Image:
    bbox = sprite.getbbox()
    if bbox:
        sprite = sprite.crop(bbox)
    target_max = canvas_size - pad * 2
    sw, sh = sprite.size
    scale = min(target_max / max(sw, 1), target_max / max(sh, 1))
    nw = max(1, int(round(sw * scale)))
    nh = max(1, int(round(sh * scale)))
    resized = sprite.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    ox = (canvas_size - nw) // 2
    oy = canvas_size - pad - nh
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def main() -> None:
    themes_dir = OUT_DIR / "themes"
    cast_dir = OUT_DIR / "cast"
    themes_dir.mkdir(parents=True, exist_ok=True)
    cast_dir.mkdir(parents=True, exist_ok=True)

    manifest_files: list[dict[str, object]] = []

    # 1. Process 2x2 Genre Studio Themes Atlas
    themes_img = Image.open(THEMES_SRC).convert("RGB")
    tw, th = themes_img.size
    half_w, half_h = tw // 2, th // 2

    atlas_out = OUT_DIR / "genre-studio-themes-atlas.webp"
    themes_img.resize((1024, 1024), Image.Resampling.LANCZOS).save(
        atlas_out, "WEBP", quality=90, method=6
    )
    manifest_files.append(
        {
            "id": "genre-studio-themes-atlas",
            "path": "/assets/virtual-studio/studio-art-v12/genre-studio-themes-atlas.webp",
            "width": 1024,
            "height": 1024,
            "sha256": sha256_of(atlas_out),
        }
    )

    margin = 6
    theme_specs = [
        ("romance-palace-conservatory", (margin, margin, half_w - margin, half_h - margin)),
        ("murim-bamboo-pavilion", (half_w + margin, margin, tw - margin, half_h - margin)),
        ("scifi-orbital-command", (margin, half_h + margin, half_w - margin, th - margin)),
        ("brooklyn-indie-comics-loft", (half_w + margin, half_h + margin, tw - margin, th - margin)),
    ]

    for theme_id, box in theme_specs:
        cropped = themes_img.crop(box).resize((640, 560), Image.Resampling.LANCZOS)
        out_path = themes_dir / f"{theme_id}.webp"
        cropped.save(out_path, "WEBP", quality=90, method=6)
        manifest_files.append(
            {
                "id": theme_id,
                "path": f"/assets/virtual-studio/studio-art-v12/themes/{theme_id}.webp",
                "width": 640,
                "height": 560,
                "sha256": sha256_of(out_path),
            }
        )

    # 2. Process 4x2 Specialist Cast & Mascot Sheet (excluding bottom label strip of each row)
    cast_img = Image.open(CAST_SRC)
    cw, ch = cast_img.size
    col_w = cw // 4
    row_h = ch // 2

    personas = ["story-writer", "action-mocap-actor", "sound-letterer", "studio-cat-mascot"]
    poses = ["idle", "work"]

    clean_atlas = Image.new("RGBA", (1024, 512), (0, 0, 0, 0))

    # Row 0 & Row 1 sprite feet end at ~83.2% of row_h (above the caption text)
    row_y_ratios = [(0.02, 0.832), (0.03, 0.832)]
    col_x_ranges = [
        (0.01, 0.245),
        (0.255, 0.495),
        (0.505, 0.770),
        (0.771, 0.992),
    ]

    for row_idx, pose in enumerate(poses):
        y_top_ratio, y_bot_ratio = row_y_ratios[row_idx]
        for col_idx, persona_id in enumerate(personas):
            x_left_ratio, x_right_ratio = col_x_ranges[col_idx]
            cell_box = (
                int(cw * x_left_ratio),
                int(row_idx * row_h + row_h * y_top_ratio),
                int(cw * x_right_ratio),
                int(row_idx * row_h + row_h * y_bot_ratio),
            )
            cell_raw = cast_img.crop(cell_box)
            cell_rgba = remove_white_exterior_background(cell_raw, threshold=240)
            if persona_id == "studio-cat-mascot" and pose == "work":
                # Clear tiny top-left corner tip of adjacent 'POW!' starburst
                for cy in range(int(cell_rgba.height * 0.42)):
                    for cx in range(int(cell_rgba.width * 0.14)):
                        cell_rgba.putpixel((cx, cy), (0, 0, 0, 0))
            normalized = center_on_square_canvas(cell_rgba, canvas_size=256, pad=10)

            sprite_id = f"{persona_id}-{pose}"
            out_sprite = cast_dir / f"{sprite_id}.webp"
            normalized.save(out_sprite, "WEBP", quality=92, method=6)
            clean_atlas.paste(normalized, (col_idx * 256, row_idx * 256), normalized)

            manifest_files.append(
                {
                    "id": sprite_id,
                    "path": f"/assets/virtual-studio/studio-art-v12/cast/{sprite_id}.webp",
                    "width": 256,
                    "height": 256,
                    "sha256": sha256_of(out_sprite),
                }
            )

    clean_atlas_path = OUT_DIR / "specialist-cast-clean-atlas.webp"
    clean_atlas.save(clean_atlas_path, "WEBP", quality=92, method=6)
    manifest_files.append(
        {
            "id": "specialist-cast-clean-atlas",
            "path": "/assets/virtual-studio/studio-art-v12/specialist-cast-clean-atlas.webp",
            "width": 1024,
            "height": 512,
            "sha256": sha256_of(clean_atlas_path),
        }
    )

    clean_atlas.save(ARTIFACT_DIR / "nano_banana_v12_specialist_cast_clean_atlas.png", "PNG")

    manifest_payload = {
        "packId": "studio-art-v12",
        "generator": "Nano Banana (Google DeepMind Image Generator Subagent + PIL RGBA Floodfill Pipeline)",
        "themeCount": 4,
        "personaCount": 4,
        "spriteFrameCount": 8,
        "files": manifest_files,
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest_payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(manifest_files)} Studio Art v12 assets in {OUT_DIR}")


if __name__ == "__main__":
    main()
