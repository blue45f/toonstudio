#!/usr/bin/env python3
"""생성 PNG를 수정하지 않고 2D 배우 프레임·접지·꾸미기 기준점을 추출한다.

저장소 루트에서 실행: python3 scripts/build-office2d-atlas-metadata.py --check
전제: Python 3.9 이상과 Pillow. 원본 PNG/기존 WebP는 읽기만 한다.
런타임 무손실 컨테이너 생성: python3 scripts/build-office2d-atlas-metadata.py --write-runtime
전제: cwebp(PATH 또는 /opt/homebrew/bin/cwebp). -lossless -exact 후 RGBA 동일성을 확인한다.
JSON 갱신: python3 scripts/build-office2d-atlas-metadata.py
미리 보기: python3 scripts/build-office2d-atlas-metadata.py --dry-run
"""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import shutil
import subprocess
import sys

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow가 필요합니다. Pillow가 설치된 Python 환경에서 다시 실행하세요.")

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps/web/public/assets/virtual-studio/office-cast-v2"
LEGACY = ROOT / "apps/web/public/assets/virtual-studio/toon-office-v1/characters"
OUTPUT = ROOT / "apps/web/src/domains/creator/virtual-space/office2d/office2d-atlas-metadata.json"
ROLES = ("artist", "pd", "writer", "colorist", "bgartist", "letterer", "modeler", "editor")
ALPHA_THRESHOLD = 64
FRAME_PADDING = 2


def components(alpha):
    """행별 연결 구간을 합쳐 8방향 연결성분의 bbox·면적을 구한다."""
    width, height = alpha.size
    pixels = alpha.tobytes()
    parents, boxes, areas = [], [], []

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(first, second):
        first, second = find(first), find(second)
        if first == second:
            return first
        if areas[first] < areas[second]:
            first, second = second, first
        parents[second] = first
        a, b = boxes[first], boxes[second]
        boxes[first] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
        areas[first] += areas[second]
        return first

    previous = []
    for y in range(height):
        row = pixels[y * width:(y + 1) * width]
        spans, start = [], None
        for x, value in enumerate(row):
            if value > ALPHA_THRESHOLD and start is None:
                start = x
            elif value <= ALPHA_THRESHOLD and start is not None:
                spans.append((start, x))
                start = None
        if start is not None:
            spans.append((start, width))
        current, cursor = [], 0
        for x0, x1 in spans:
            index = len(parents)
            parents.append(index)
            boxes.append([x0, y, x1, y + 1])
            areas.append(x1 - x0)
            while cursor < len(previous) and previous[cursor][1] < x0:
                cursor += 1
            scan = cursor
            while scan < len(previous) and previous[scan][0] <= x1:
                index = union(index, previous[scan][2])
                scan += 1
            current.append((x0, x1, index))
        previous = current
    return [(boxes[i], areas[i]) for i in range(len(parents)) if find(i) == i]


def head_center(alpha, bounds):
    """손·가방의 가로폭에 끌리지 않도록 머리 위쪽 실루엣 중앙값을 쓴다."""
    x0, y0, x1, y1 = bounds
    top, bottom = y0 + (y1 - y0) * 0.05, y0 + (y1 - y0) * 0.30
    rows = []
    for y in range(int(top), max(int(top) + 1, int(bottom))):
        xs = [x for x in range(x0, x1) if alpha.getpixel((x, y)) > 128]
        if xs:
            rows.append(((xs[0] + xs[-1]) / 2, y))
    return {"x": round(statistics.median(p[0] for p in rows), 4),
            "y": round(statistics.median(p[1] for p in rows), 4)} if rows else {"x": (x0 + x1) / 2, "y": top}


def runtime_webp(path, write):
    target = path.with_suffix(".webp")
    original = Image.open(path).convert("RGBA")
    def identical():
        if not target.is_file():
            return False
        decoded = Image.open(target).convert("RGBA")
        return original.size == decoded.size and original.tobytes() == decoded.tobytes()
    if not identical() and write:
        executable = shutil.which("cwebp") or "/opt/homebrew/bin/cwebp"
        result = subprocess.run([executable, "-quiet", "-lossless", "-exact", "-m", "4", str(path), "-o", str(target)],
                                capture_output=True, text=True, timeout=120, check=False)
        if result.returncode:
            raise ValueError(f"{path.name}: cwebp 변환 실패. 도구 설치와 원본을 확인하세요: {result.stderr.strip()}")
    if not identical():
        raise ValueError(f"{path.name}: 런타임 WebP의 RGBA가 원본과 다릅니다. --write-runtime 으로 생성하세요.")
    return target


def extract(role, sheet, path, write_runtime=False):
    columns, rows = (9, 4) if sheet == "walk" else (4, 3)
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    runtime = runtime_webp(path, write_runtime)
    cell_w, cell_h = width / columns, height / rows
    # 원본 픽셀은 권위, JSON은 이 알고리즘으로 재생성 가능한 파생 메타데이터다.
    if abs(cell_w / cell_h - 2 / 3) > 0.035:
        raise ValueError(f"{path.name}: 셀 비율이 128×192 계약과 다릅니다. 생성 시트의 격자를 확인하세요.")
    if sum(value == 0 for value in alpha.tobytes()) < width * height * 0.10:
        raise ValueError(f"{path.name}: 투명 여백이 부족합니다. 원본 PNG의 alpha를 확인하세요.")
    groups = {}
    for bounds, area in components(alpha):
        if area < cell_w * cell_h * 0.05:
            continue
        x0, y0, x1, y1 = bounds
        col = min(columns - 1, int((x0 + x1) / 2 / cell_w))
        row = min(rows - 1, int((y0 + y1) / 2 / cell_h))
        key = row * columns + col
        if key not in groups or area > groups[key][1]:
            groups[key] = (bounds, area)
    legacy_path = LEGACY / (f"{role}.webp" if sheet == "walk" else f"work/{role}.webp")
    legacy = Image.open(legacy_path).convert("RGBA").getchannel("A")
    frames = []
    for row in range(rows):
        for col in range(columns):
            key = row * columns + col
            if key not in groups:
                raise ValueError(f"{path.name}: {row}행 {col}열의 배우 주성분을 찾지 못했습니다. 시트 격자를 확인하세요.")
            bounds, area = groups[key]
            x0, y0, x1, y1 = bounds
            if x1 - x0 > cell_w * 1.45 or y1 - y0 > cell_h * 1.20:
                raise ValueError(f"{path.name}: {row}행 {col}열이 이웃 배우와 연결됐습니다. 원본 시트를 수정하세요.")
            head = head_center(alpha, bounds)
            source = {"x": max(0, x0 - FRAME_PADDING), "y": max(0, y0 - FRAME_PADDING),
                      "width": min(width, x1 + FRAME_PADDING) - max(0, x0 - FRAME_PADDING),
                      "height": min(height, y1 + FRAME_PADDING) - max(0, y0 - FRAME_PADDING)}
            reference_cell = legacy.crop((col * 128, row * 192, (col + 1) * 128, (row + 1) * 192))
            reference_bounds = reference_cell.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0).getbbox()
            reference = head_center(reference_cell, reference_bounds) if reference_bounds else {"x": 64, "y": 48}
            frames.append({"source": source,
                           "anchor": {"x": head["x"], "y": y1}, "head": head,
                           "referenceHead": reference, "pixels": area})
    return {"url": f"/assets/virtual-studio/office-cast-v2/{runtime.name}", "width": width, "height": height,
            "columns": columns, "rows": rows, "sha256": hashlib.sha256(runtime.read_bytes()).hexdigest(),
            "originalUrl": f"/assets/virtual-studio/office-cast-v2/{path.name}",
            "originalSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "originalBytes": path.stat().st_size, "runtimeBytes": runtime.stat().st_size, "frames": frames}


def main():
    parser = argparse.ArgumentParser(description="PNG를 변경하지 않는 2D 배우 atlas 메타데이터 생성/검증")
    parser.add_argument("--check", action="store_true", help="기존 JSON과 비교만 한다")
    parser.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 요약만 확인한다")
    parser.add_argument("--write-runtime", action="store_true", help="RGBA가 동일한 런타임 WebP를 생성한다(PNG 보존)")
    args = parser.parse_args()
    if args.write_runtime and (args.check or args.dry_run):
        parser.error("--write-runtime은 --check/--dry-run과 함께 사용할 수 없습니다.")
    sheets = {}
    for role in ROLES:
        for sheet in ("walk", "work"):
            path = ASSETS / f"{role}-{sheet}.png"
            if path.is_file():
                sheets[f"{role}:{sheet}"] = extract(role, sheet, path, args.write_runtime)
    if not sheets:
        raise ValueError("생성 PNG가 없습니다. office-cast-v2 원본을 먼저 준비하세요.")
    manifest = {"version": 1, "alphaThreshold": ALPHA_THRESHOLD, "framePadding": FRAME_PADDING, "sheets": sheets}
    serialized = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != serialized:
            raise ValueError("atlas 메타데이터가 원본과 다릅니다. python3 scripts/build-office2d-atlas-metadata.py 로 재생성하세요.")
    elif not args.dry_run:
        OUTPUT.write_text(serialized)
    print(json.dumps({"sheets": len(sheets), "frames": sum(len(sheet["frames"]) for sheet in sheets.values()),
                      "originalBytes": sum(sheet["originalBytes"] for sheet in sheets.values()),
                      "runtimeBytes": sum(sheet["runtimeBytes"] for sheet in sheets.values()), "rgbaIdentical": True,
                      "mode": "check" if args.check else "dry-run" if args.dry_run else "write"}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print(f"atlas 메타데이터 검증 실패: {error}", file=sys.stderr)
        sys.exit(1)
