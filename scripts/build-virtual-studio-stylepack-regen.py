#!/usr/bin/env python3
"""가상스튜디오 v5 스타일 팩 캐릭터 아트를 생성 시트에서 다시 만든다.

기존 v5 팩의 배우 아트는 절차적 렌더러가 그린 납작한 템플릿 수준이라,
이미지 생성으로 만든 배우별 마스터 시트(격자 그림)를 원본으로 교체한다.
이 스크립트는 시트를 셀 단위로 잘라 흰 배경을 제거하고, 배우 단위
스케일로 정규화해 160px 프레임 파일로 조립한 뒤 art-v5-manifest.json의
해당 파일 레코드를 갱신한다.

셀 출처는 scripts/virtual-studio/stylepack-regen-maps.json이 정본이다.
어떤 출력 파일이 어떤 시트의 어떤 셀에서 왔는지 전부 그 파일에 남는다.

생성 시트의 행·열이 균등 격자와 어긋나는 경우가 있어, 시트별로 실측한
경계 비율(rowEdges/colEdges, 0~1, 길이 rows+1/cols+1)을 맵에 적을 수
있다. 경계가 있으면 그 비율로 자르고, 없으면 균등 분할한다. 경계는
피규어 사이 빈 띠의 한가운데로 잡는 것이 원칙이다.

규칙:
- 스타일 간·배우 간 픽셀 재사용 금지. 한 배우의 출력은 그 배우의
  시트에서만 만든다 (미러링 포함 금지).
- 시트 규격(출력 160px 프레임, 걷기·행동 4프레임 스트립)은 기존 v5와 동일.
- 쓰기 전에 --check로 맵을 검증하고, --dry-run으로 변경분을 확인할 수 있다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "apps/web/public/assets/virtual-studio/style-packs-v5"
MAPS_PATH = ROOT / "scripts/virtual-studio/stylepack-regen-maps.json"
MANIFEST_PATH = PACKS / "art-v5-manifest.json"
CELL = 160
GROUND_Y = 155  # 정규화한 콘텐츠의 아랫변을 맞출 y (런타임 originY 0.95 관례)
MAX_CONTENT_W = 154

DIRECTIONS = ("down", "right", "left", "up")
# 배우 1명의 출력 25종. strips는 방향 순서(down/right/left/up)의 프레임을 쓴다.
STRIP_OUTPUTS = ("walk", "talk", "draw", "review")
POSE_OUTPUTS = ("sit", "wave")


def fail(message: str) -> None:
    print(f"오류: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_maps() -> dict:
    if not MAPS_PATH.exists():
        fail(f"셀 맵 파일이 없습니다: {MAPS_PATH} (먼저 맵을 작성하세요)")
    return json.loads(MAPS_PATH.read_text(encoding="utf-8"))


def sheet_image(maps_root: Path, spec: dict) -> Image.Image:
    path = maps_root / spec["file"]
    if not path.exists():
        fail(f"시트 파일이 없습니다: {path}")
    return Image.open(path).convert("RGB")


def crop_cell(sheet: Image.Image, spec: dict, row: int, col: int) -> Image.Image:
    cols, rows = int(spec["cols"]), int(spec["rows"])
    w, h = sheet.size
    col_edges = spec.get("colEdges")
    row_edges = spec.get("rowEdges")
    if col_edges:
        x0, x1 = round(col_edges[col] * w), round(col_edges[col + 1] * w)
    else:
        x0, x1 = round(col * w / cols), round((col + 1) * w / cols)
    if row_edges:
        y0, y1 = round(row_edges[row] * h), round(row_edges[row + 1] * h)
    else:
        y0, y1 = round(row * h / rows), round((row + 1) * h / rows)
    return sheet.crop((x0, y0, x1, y1))


def remove_background(cell: Image.Image) -> Image.Image:
    """흰 배경을 경계 연결 기준으로 제거하고 가장 큰 덩어리(캐릭터)만 남긴다.

    배경 후보는 밝은 픽셀(최소 채널 232 이상)이거나, 채도가 낮은 밝은
    회색(발밑 접지 그림자)이다. 외곽선으로 둘러싸인 밝은 옷·피부는 경계에서
    닿을 수 없어 살아남는다. 프린지 정리는 배경에 닿은 2px 띠 안에서만
    하며, 밝은 내부 픽셀의 알파는 건드리지 않는다.
    """
    rgb = np.asarray(cell).astype(np.int16)
    whiteness = rgb.min(axis=2)
    saturation = rgb.max(axis=2) - whiteness
    candidate = (whiteness >= 232) | ((saturation <= 30) & (whiteness >= 165))
    labels, count = ndimage.label(candidate)
    if count == 0:
        return cell.convert("RGBA")
    border_labels = set()
    for edge in (labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]):
        border_labels.update(int(v) for v in np.unique(edge) if v != 0)
    background = np.isin(labels, list(border_labels)) if border_labels else np.zeros_like(candidate)
    alpha = np.where(background, 0, 255).astype(np.uint8)

    # 캐릭터 본체(가장 큰 불투명 덩어리)와 그 주변 소품만 남기고 이웃 셀 침범을 버린다.
    # 본체가 아닌 덩어리는 유지 구역 안에 있고, 본체 면적의 1% 이상이며, 셀 경계에
    # 닿지 않을 때만 소품으로 인정한다. 경계에 닿은 조각은 이웃 셀의 잘린 부분이다.
    solid = alpha > 0
    body_labels, body_count = ndimage.label(solid)
    if body_count > 1:
        sizes = ndimage.sum(solid, body_labels, range(1, body_count + 1))
        main = int(np.argmax(sizes)) + 1
        main_box = ndimage.find_objects(body_labels)[main - 1]
        pad = 18
        y_slice = slice(max(0, main_box[0].start - pad), min(alpha.shape[0], main_box[0].stop + pad))
        x_slice = slice(max(0, main_box[1].start - pad), min(alpha.shape[1], main_box[1].stop + pad))
        keep_zone = np.zeros_like(solid)
        keep_zone[y_slice, x_slice] = True
        border_ids = set()
        for edge in (body_labels[0, :], body_labels[-1, :], body_labels[:, 0], body_labels[:, -1]):
            border_ids.update(int(v) for v in np.unique(edge) if v != 0)
        allowed = np.zeros(body_count + 1, dtype=bool)
        for idx in range(1, body_count + 1):
            allowed[idx] = sizes[idx - 1] >= sizes.max() * 0.01 and idx not in border_ids
        keep_labels = keep_zone & allowed[body_labels]
        alpha = np.where(keep_labels | (body_labels == main), alpha, 0).astype(np.uint8)

    # 배경에 닿은 얇은 띠에서만 흰 프린지를 알파로 환산하고 혼합을 되돌린다.
    halo_band = ndimage.binary_dilation(background, iterations=2) & (alpha > 0)
    if halo_band.any():
        softened = ((255 - whiteness[halo_band].astype(np.float32)) / 45.0).clip(0.05, 1.0)
        alpha[halo_band] = (softened * 255).astype(np.uint8)
    out = np.dstack([np.asarray(cell), alpha]).astype(np.float32)
    semi = (out[..., 3] > 0) & (out[..., 3] < 255)
    if semi.any():
        a = (out[semi, 3] / 255.0)[:, None]
        out[semi, :3] = np.clip((out[semi, :3] - (1.0 - a) * 255.0) / np.maximum(a, 1e-3), 0, 255)
    result = Image.fromarray(out.astype(np.uint8), "RGBA")
    # 알파만 살짝 다듬어 계단 현상을 줄인다.
    smoothed = result.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    result.putalpha(smoothed)
    return result


def content_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.nonzero(alpha > 8)
    if len(ys) == 0:
        fail("셀에서 캐릭터를 찾지 못했습니다 (배경 제거 후 빈 셀)")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def fit_height_for(output_name: str) -> int:
    """출력별 목표 콘텐츠 높이. 시트마다 그림 배율이 달라도 프레임 간 크기가 튀지 않게 셀마다 맞춘다.

    앉기는 선 자세보다 자연히 낮고(0.88배), 손 흔들기는 치켜든 팔만큼
    경계 상자가 커지므로 목표를 높게 잡아 몸통 크기를 맞춘다.
    """
    if output_name == "sit":
        return 130
    if output_name == "wave":
        return 156
    return 148


def normalize(cell_rgba: Image.Image, target_h: int) -> Image.Image:
    """콘텐츠 높이를 목표값으로 맞추고 160px 캔버스의 지면선에 붙인다."""
    x0, y0, x1, y1 = content_bbox(cell_rgba)
    content = cell_rgba.crop((x0, y0, x1, y1))
    w, h = content.size
    factor = min(target_h / h, MAX_CONTENT_W / w)
    new_size = (max(1, round(w * factor)), max(1, round(h * factor)))
    resized = content.resize(new_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((CELL - new_size[0]) // 2, GROUND_Y - new_size[1]))
    return canvas


def save_webp(image: Image.Image, path: Path, *, lossless: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=94, method=5, exact=True, lossless=lossless)


def file_record(path: Path, root: Path) -> dict[str, object]:
    """v5 생성기의 file_record와 동일 규격으로 매니페스트 레코드를 만든다."""
    data = path.read_bytes()
    with Image.open(path) as image:
        size = [image.width, image.height]
        sample = image.convert("RGB").resize((16, 16), Image.Resampling.BILINEAR)
        signature = hashlib.sha256(sample.tobytes()).hexdigest()
    return {
        "file": path.relative_to(root).as_posix(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "size": size,
        "visualSignature": signature,
    }


def resolve_actor(maps: dict, style: str, actor: str) -> dict:
    try:
        return maps["styles"][style]["actors"][actor]
    except KeyError:
        fail(f"맵에 없는 스타일/배우입니다: {style}/{actor}")


def expected_outputs(actor_spec: dict) -> list[str]:
    kind, key = actor_spec["kind"], actor_spec["key"]
    names = []
    for motion in ("direction", "walk", "talk", "draw", "review"):
        for direction in ("down", "left", "right", "up"):
            names.append(f"{key}-{motion}-{direction}.webp")
    names += [f"{key}-sit.webp", f"{key}-wave.webp"]
    names += [f"{key}-state-{state}.webp" for state in ("talk", "draw", "review")]
    return sorted(names)


def check_maps(maps: dict) -> list[str]:
    problems: list[str] = []
    for style, style_spec in maps.get("styles", {}).items():
        for actor, spec in style_spec.get("actors", {}).items():
            sheets = spec.get("sheets", {})
            for sheet_key, sheet_spec in sheets.items():
                path = ROOT / sheet_spec["file"]
                if not path.exists():
                    problems.append(f"{style}/{actor}: 시트 없음 {sheet_spec['file']}")
                    continue
                for edge_key, count_key in (("rowEdges", "rows"), ("colEdges", "cols")):
                    edges = sheet_spec.get(edge_key)
                    if edges is None:
                        continue
                    want_len = int(sheet_spec[count_key]) + 1
                    if len(edges) != want_len:
                        problems.append(f"{style}/{actor}/{sheet_key}: {edge_key} 길이는 {want_len}이어야 합니다")
                    elif edges[0] != 0 or edges[-1] != 1 or any(b <= a for a, b in zip(edges, edges[1:])):
                        problems.append(f"{style}/{actor}/{sheet_key}: {edge_key}는 0에서 1까지 단조 증가해야 합니다")
                with Image.open(path) as image:
                    if image.width % int(sheet_spec["cols"]) or image.height % int(sheet_spec["rows"]):
                        pass  # 균등 분할은 반올림으로 처리하므로 경고로 삼지 않는다
            outputs = spec.get("outputs", {})
            want = {name.replace(f"{spec['key']}-", "").replace(".webp", "") for name in expected_outputs(spec)}
            have = set(outputs.keys())
            missing = want - have
            if missing:
                problems.append(f"{style}/{actor}: 출력 정의 누락 {sorted(missing)}")
            for out_name, out_spec in outputs.items():
                cells = out_spec.get("cells", [])
                for cell_ref in cells:
                    sheet_key = cell_ref["sheet"]
                    if sheet_key not in sheets:
                        problems.append(f"{style}/{actor}/{out_name}: 알 수 없는 시트 {sheet_key}")
                        continue
                    sheet_spec = sheets[sheet_key]
                    if not (0 <= cell_ref["row"] < int(sheet_spec["rows"]) and 0 <= cell_ref["col"] < int(sheet_spec["cols"])):
                        problems.append(f"{style}/{actor}/{out_name}: 셀 범위 초과 {cell_ref}")
    return problems


def build_actor(maps: dict, style: str, actor: str, *, dry_run: bool) -> list[str]:
    spec = resolve_actor(maps, style, actor)
    needed = set()
    for out_spec in spec["outputs"].values():
        if out_spec.get("pending"):
            continue
        needed.update(ref["sheet"] for ref in out_spec["cells"])
    sheets = {key: sheet_image(ROOT, spec["sheets"][key]) for key in sorted(needed)}
    lossless = style == "retro"

    def keyed_cell(ref: dict) -> Image.Image:
        sheet_spec = spec["sheets"][ref["sheet"]]
        return remove_background(crop_cell(sheets[ref["sheet"]], sheet_spec, int(ref["row"]), int(ref["col"])))

    folder = "players" if spec["kind"] == "player" else "npcs"
    out_root = PACKS / style / folder
    written: list[str] = []
    for out_name, out_spec in sorted(spec["outputs"].items()):
        if out_spec.get("pending"):
            continue
        target_h = fit_height_for(out_name)
        cells = [normalize(keyed_cell(ref), target_h) for ref in out_spec["cells"]]
        if len(cells) == 1:
            image = cells[0]
        elif len(cells) == 4:
            image = Image.new("RGBA", (CELL * 4, CELL), (0, 0, 0, 0))
            for index, cell_image in enumerate(cells):
                image.alpha_composite(cell_image, (index * CELL, 0))
        else:
            fail(f"{style}/{actor}/{out_name}: 셀 수는 1개 또는 4개여야 합니다 (현재 {len(cells)})")
        target = out_root / f"{spec['key']}-{out_name}.webp"
        if dry_run:
            written.append(f"(dry-run) {target.relative_to(ROOT)} {image.size}")
        else:
            save_webp(image, target, lossless=lossless)
            written.append(str(target.relative_to(ROOT)))
    return written


def update_manifest(style: str, actor: str, spec: dict) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    folder = "players" if spec["kind"] == "player" else "npcs"
    records = {record["file"]: record for record in manifest["files"]}
    for name in expected_outputs(spec):
        relative = f"{style}/{folder}/{name}"
        path = PACKS / relative
        if not path.exists():
            fail(f"매니페스트 갱신 대상 파일이 없습니다: {relative}")
        records[relative] = file_record(path, PACKS)
    manifest["files"] = [records[key] for key in sorted(records)]
    regen = manifest.setdefault("regenProvenance", {})
    regen[style] = (
        "image-generated drawn master sheets sliced per actor (2026-10-07); "
        "no cross-style or cross-actor pixel reuse"
    )
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="v5 스타일 팩 캐릭터 재생성 (생성 시트 슬라이싱)")
    parser.add_argument("--style", help="대상 스타일 (예: webtoon)")
    parser.add_argument("--actor", help="대상 배우 키 (예: player-pink, npc-host)")
    parser.add_argument("--check", action="store_true", help="맵만 검증하고 쓰지 않는다")
    parser.add_argument("--dry-run", action="store_true", help="쓰지 않고 변경분만 보고한다")
    args = parser.parse_args()

    maps = load_maps()
    if args.check:
        problems = check_maps(maps)
        if problems:
            for problem in problems:
                print(f"맵 문제: {problem}", file=sys.stderr)
            raise SystemExit(1)
        print("셀 맵 검증 통과")
        return
    if not args.style or not args.actor:
        fail("--style과 --actor가 필요합니다 (--check만 단독 실행 가능)")
    spec = resolve_actor(maps, args.style, args.actor)
    written = build_actor(maps, args.style, args.actor, dry_run=args.dry_run)
    for line in written:
        print(line)
    if not args.dry_run:
        pending = [name for name, out in spec["outputs"].items() if out.get("pending")]
        if pending:
            print(f"주의: pending 출력 {len(pending)}종은 아직 만들지 않아 매니페스트를 갱신하지 않습니다: {sorted(pending)}")
        else:
            update_manifest(args.style, args.actor, spec)
            print(f"매니페스트 갱신 완료: {args.style}/{args.actor}")


if __name__ == "__main__":
    main()
