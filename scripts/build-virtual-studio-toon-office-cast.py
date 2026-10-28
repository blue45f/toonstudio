#!/usr/bin/env python3
"""
ToonOffice 2D(toon-office-v1) 캐스트 확장 빌드: 신규 직군 보행 시트 + 전 직군 작업 자세 시트.

기존 파이프라인(scripts/build-virtual-studio-toon-office-v1.py)의 크로마키·성분 분리·보행 합성 함수를 그대로 불러 쓴다.
기존 자산(오브젝트·기존 5종 보행 시트·프리뷰)은 다시 쓰지 않고, 아래 결과만 추가·갱신한다.

1. 신규 보행 시트(9열 × 4행, 셀 128×192): letterer(식자), modeler(3D 배경), editor(편집·검수).
   이미지 생성 서브에이전트가 만든 4행 × 3열 마젠타 원화를 기존 build_character로 정규화·8프레임 보행 합성한다.
2. 작업 자세 시트(4열 × 3행, 셀 128×192) — characters/work/<직군>.webp:
   - 0행: 뒤에서 본 착석 작업 루프 4프레임(의자는 게임이 그린다).
   - 1행: 앞에서 본 착석 4프레임(기본 · 대화 · 웃음 · 커피).
   - 2행: 선 자세 제스처 4종(손 흔들기 · 만세 · 엄지 척 · 생각).
   원화의 연결 성분을 행으로 묶은 뒤 시트마다 고른 (행, 열)을 셀에 놓는다. 크기는 같은 시트의 선 자세(엄지·생각) 키를
   보행 시트 키(TARGET_HEIGHT=174)에 맞추고, 머리 중심 x=64 · 발끝 y=188(FOOT_BASELINE) 기준으로 정렬한다.
   셀을 넘는 자세(만세 팔 등)는 그 자세만 줄여 셀 안에 넣는다.
3. manifest.json에 신규 캐릭터·작업 시트(sha256)·원화 해시를 병합하고 version을 3으로 올린다.

사용법:
  python3 scripts/build-virtual-studio-toon-office-cast.py --source-dir <원화 폴더> [--contact-sheet <미리보기 PNG 경로>]
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[1]
_V1_PATH = REPO_ROOT / "scripts/build-virtual-studio-toon-office-v1.py"
_spec = importlib.util.spec_from_file_location("toon_office_v1", _V1_PATH)
if _spec is None or _spec.loader is None:
    raise SystemExit(f"cannot load base pipeline: {_V1_PATH}")
v1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(v1)

OUT_DIR = v1.OUT_DIR
CELL_W, CELL_H = v1.CELL_W, v1.CELL_H
FOOT_BASELINE, TARGET_HEIGHT = v1.FOOT_BASELINE, v1.TARGET_HEIGHT
WORK_COLS, WORK_ROWS = 4, 3
MAX_POSE_WIDTH = CELL_W - 4
MAX_POSE_HEIGHT = FOOT_BASELINE - 2

# 신규 보행 시트: (원화 파일, 측면 골반 분리 비율, 측면 단일 다리 폭 px, 가방 보존)
NEW_CHARACTERS: dict[str, tuple[str, float, float, bool]] = {
    "letterer": ("toonoffice_char_letterer.jpg", 0.705, 16.5, False),
    "modeler": ("toonoffice_char_modeler.jpg", 0.725, 18.5, False),
    "editor": ("toonoffice_char_editor.jpg", 0.705, 15.5, False),
}

Slot = tuple[int, int]
DEFAULT_GESTURES: tuple[Slot, Slot, Slot, Slot] = ((2, 0), (2, 1), (3, 1), (3, 2))

# 작업 자세 원화: (파일, 뒤 착석 4칸, 앞 착석 4칸, 제스처 4칸[손 흔들기, 만세, 엄지, 생각], 키 기준 칸)
WORK_SHEETS: dict[str, tuple[str, tuple[Slot, ...], tuple[Slot, ...], tuple[Slot, ...], tuple[Slot, ...]]] = {
    "artist": ("toonoffice_work_artist.jpg", ((0, 0), (0, 1), (0, 2), (0, 3)), ((1, 0), (1, 1), (1, 2), (1, 3)), DEFAULT_GESTURES, ((3, 1), (3, 2))),
    "pd": ("toonoffice_work_pd.jpg", ((0, 0), (0, 1), (0, 2), (0, 3)), ((1, 0), (1, 1), (1, 2), (1, 3)), DEFAULT_GESTURES, ((3, 1), (3, 2))),
    "writer": ("toonoffice_work_writer.jpg", ((0, 0), (0, 1), (0, 2), (0, 3)), ((1, 0), (1, 1), (1, 2), (1, 3)), DEFAULT_GESTURES, ((3, 1), (3, 2))),
    "colorist": ("toonoffice_work_colorist.jpg", ((0, 0), (0, 1), (0, 2), (0, 3)), ((1, 0), (1, 1), (1, 2), (1, 4)), ((2, 0), (2, 1), (2, 2), (2, 3)), ((2, 2), (2, 3))),
    "bgartist": ("toonoffice_work_bgartist.jpg", ((0, 0), (0, 1), (0, 2), (0, 3)), ((1, 0), (1, 1), (1, 2), (1, 3)), DEFAULT_GESTURES, ((3, 1), (3, 2))),
    "letterer": ("toonoffice_work_letterer.jpg", ((0, 0), (0, 1), (0, 2), (0, 3)), ((1, 0), (1, 1), (1, 2), (1, 3)), DEFAULT_GESTURES, ((3, 1), (3, 2))),
    "modeler": ("toonoffice_work_modeler.jpg", ((0, 0), (0, 1), (0, 2), (0, 3)), ((1, 0), (1, 1), (1, 2), (1, 3)), DEFAULT_GESTURES, ((3, 1), (3, 2))),
    "editor": ("toonoffice_work_editor.jpg", ((0, 0), (0, 1), (0, 2), (0, 3)), ((1, 0), (1, 1), (1, 2), (1, 3)), DEFAULT_GESTURES, ((3, 1), (3, 2))),
}


def pose_components(rgba: np.ndarray) -> list[list[dict]]:
    """원화의 자세 성분을 행(위→아래)·열(왼→오른) 목록으로 묶는다. 작은 조각(펜·머리끈·김)은 가까운 자세에 붙인다."""
    mask = rgba[..., 3] > 40
    found = v1.components(mask, 60)
    big = [component for component in found if component["area"] >= 2500]
    small = [component for component in found if component["area"] < 2500]
    if len(big) < 12:
        raise RuntimeError(f"expected at least 12 poses, found {len(big)}")
    for piece in small:
        def gap(target: dict) -> int:
            return max(0, target["x0"] - piece["x1"], piece["x0"] - target["x1"]) + max(0, target["y0"] - piece["y1"], piece["y0"] - target["y1"])
        best = min(big, key=gap)
        if gap(best) <= 18:
            best["xs"] = np.concatenate([best["xs"], piece["xs"]])
            best["ys"] = np.concatenate([best["ys"], piece["ys"]])
            best["x0"], best["y0"] = min(best["x0"], piece["x0"]), min(best["y0"], piece["y0"])
            best["x1"], best["y1"] = max(best["x1"], piece["x1"]), max(best["y1"], piece["y1"])
    heights = [component["y1"] - component["y0"] for component in big]
    row_gap = statistics.median(heights) * 0.5
    big.sort(key=lambda component: (component["y0"] + component["y1"]) / 2)
    rows: list[list[dict]] = []
    for component in big:
        center = (component["y0"] + component["y1"]) / 2
        if rows and abs(center - statistics.mean((c["y0"] + c["y1"]) / 2 for c in rows[-1])) <= row_gap:
            rows[-1].append(component)
        else:
            rows.append([component])
    return [sorted(row, key=lambda component: (component["x0"] + component["x1"]) / 2) for row in rows]


def crop_pose(rgba: np.ndarray, component: dict) -> Image.Image:
    pad = 2
    x0, y0 = max(0, component["x0"] - pad), max(0, component["y0"] - pad)
    x1, y1 = min(rgba.shape[1], component["x1"] + pad), min(rgba.shape[0], component["y1"] + pad)
    crop = rgba[y0:y1, x0:x1].copy()
    keep = np.zeros(crop.shape[:2], dtype=bool)
    keep[component["ys"] - y0, component["xs"] - x0] = True
    grown = keep.copy()
    grown[1:, :] |= keep[:-1, :]
    grown[:-1, :] |= keep[1:, :]
    grown[:, 1:] |= keep[:, :-1]
    grown[:, :-1] |= keep[:, 1:]
    crop[..., 3] = np.where(grown, crop[..., 3], 0)
    image = v1.to_image(crop)
    bbox = image.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox()
    return image.crop(bbox) if bbox else image


def place_pose(pose: Image.Image, scale: float) -> tuple[Image.Image, dict]:
    """자세를 같은 시트 공통 배율로 줄이고 머리 중심 x=64 · 발끝 y=188에 맞춘 128×192 셀을 만든다."""
    width = max(1, round(pose.width * scale))
    height = max(1, round(pose.height * scale))
    fit = min(1.0, MAX_POSE_WIDTH / width, MAX_POSE_HEIGHT / height)
    width, height = max(1, round(width * fit)), max(1, round(height * fit))
    resized = pose.resize((width, height), Image.Resampling.LANCZOS)
    alpha = np.asarray(resized.getchannel("A"))
    head = alpha[: max(1, int(height * 0.36))] > 128
    head_xs = np.nonzero(head)[1]
    anchor_x = float((head_xs.min() + head_xs.max()) / 2) if len(head_xs) else width / 2.0
    ox = int(round(CELL_W / 2 - anchor_x))
    ox = max(0, min(CELL_W - width, ox))
    oy = FOOT_BASELINE - height
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    cell.paste(resized, (ox, oy), resized)
    return cell, {"height": height, "fit": round(fit, 3)}


def build_work_sheet(rgba: np.ndarray, back: tuple[Slot, ...], front: tuple[Slot, ...], gestures: tuple[Slot, ...], reference: tuple[Slot, ...]) -> tuple[Image.Image, dict]:
    rows = pose_components(rgba)

    def pick(slot: Slot) -> Image.Image:
        row, col = slot
        if row >= len(rows) or col >= len(rows[row]):
            raise RuntimeError(f"missing pose slot {slot}; rows={[len(r) for r in rows]}")
        return crop_pose(rgba, rows[row][col])

    reference_height = statistics.median(pick(slot).height for slot in reference)
    scale = TARGET_HEIGHT / max(1.0, reference_height)
    sheet = Image.new("RGBA", (CELL_W * WORK_COLS, CELL_H * WORK_ROWS), (0, 0, 0, 0))
    fits: list[float] = []
    for row_index, slots in enumerate((back, front, gestures)):
        if len(slots) != WORK_COLS:
            raise RuntimeError(f"row {row_index} needs {WORK_COLS} slots")
        for col_index, slot in enumerate(slots):
            cell, info = place_pose(pick(slot), scale)
            fits.append(info["fit"])
            sheet.alpha_composite(cell, (col_index * CELL_W, row_index * CELL_H))
    return sheet, {"cols": WORK_COLS, "rows": WORK_ROWS, "sourceRows": [len(row) for row in rows], "scale": round(scale, 4), "minFit": min(fits)}


def contact_sheet(images: dict[str, Image.Image], path: Path) -> None:
    pad = 8
    width = max(image.width for image in images.values()) + pad * 2
    height = sum(image.height + pad for image in images.values()) + pad
    canvas = Image.new("RGBA", (width, height), (238, 228, 211, 255))
    y = pad
    for image in images.values():
        canvas.alpha_composite(image, (pad, y))
        y += image.height + pad
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--contact-sheet", type=Path, default=None)
    args = parser.parse_args()

    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    preview: dict[str, Image.Image] = {}

    def load(file_name: str) -> tuple[np.ndarray, str]:
        path = args.source_dir / file_name
        if not path.exists():
            raise SystemExit(f"missing source sheet: {path}")
        return v1.chroma_key(Image.open(path)), v1.sha256_bytes(path.read_bytes())

    for name, (file_name, hip_rel_y, leg_width, keep_briefcase) in NEW_CHARACTERS.items():
        keyed, digest_source = load(file_name)
        image, info = v1.build_character(keyed, hip_rel_y, leg_width, keep_briefcase)
        digest = v1.save_webp(image, OUT_DIR / "characters" / f"{name}.webp")
        manifest["sources"][f"char_{name}"] = digest_source
        manifest["characters"][name] = {"width": image.width, "height": image.height, "sha256": digest, **info}
        preview[f"walk:{name}"] = image
        print(f"character {name:10s} {image.width}x{image.height} info={info}")

    manifest["work"] = {"cell": {"width": CELL_W, "height": CELL_H, "cols": WORK_COLS, "rows": WORK_ROWS},
                        "rows": ["sit-back", "sit-front", "gesture"], "gestures": ["wave", "cheer", "thumbs", "think"], "sheets": {}}
    for name, (file_name, back, front, gestures, reference) in WORK_SHEETS.items():
        keyed, digest_source = load(file_name)
        image, info = build_work_sheet(keyed, back, front, gestures, reference)
        digest = v1.save_webp(image, OUT_DIR / "characters" / "work" / f"{name}.webp")
        manifest["sources"][f"work_{name}"] = digest_source
        manifest["work"]["sheets"][name] = {"width": image.width, "height": image.height, "sha256": digest, **info}
        preview[f"work:{name}"] = image
        print(f"work      {name:10s} {image.width}x{image.height} info={info}")

    manifest["version"] = 3
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {manifest_path}")
    if args.contact_sheet:
        contact_sheet(preview, args.contact_sheet)
        print(f"contact sheet {args.contact_sheet}")


if __name__ == "__main__":
    main()
