#!/usr/bin/env python3
"""보존된 전신 표정 원본에서 배우 밖 alpha만 0인 별도 runtime PNG를 준비한다.

기본값/--dry-run은 원본을 읽어 계획·해시만 출력하고 파일을 쓰지 않는다:
  /usr/bin/python3 -B scripts/build-office2d-expression-runtime.py --dry-run
사용자의 직접 허용을 받은 뒤 root 단독 실행 창에서만 새 PNG 8개를 만든다:
  /usr/bin/python3 -B scripts/build-office2d-expression-runtime.py --write-runtime --record-runtime

원본은 office-standing-expressions-v1/source-originals/{role}-standing.png에 보존하고
새 manifest의 sourceSha256/sourceBytes에 root가 실제 원본 증거를 먼저 기록한다.
--write-runtime은 {role}-standing-runtime-v1.png 8개만 새로 만든다(덮어쓰기 금지).
--record-runtime은 검증된 runtime의 bytes/sha256만 같은 manifest에 명시적으로 기록한다.
metadata/prompt와 원본은 수정하지 않는다. 기본 dry-run은 manifest도 수정하지 않는다.
실패 시 이미 생성한 runtime을 자동 삭제·재시도하지 않는다. 오류의 파일 목록을
검토한 뒤 다음 처리를 결정한다. Pillow는 이미 설치된 환경을 사용한다.
"""

from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
import re
import statistics
import struct
import sys
import zlib

try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError as error:
    raise SystemExit("Pillow가 있는 /usr/bin/python3로 실행하세요. 자동 설치는 하지 않습니다.") from error


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps/web/public/assets/virtual-studio/office-standing-expressions-v1"
SOURCES = ASSETS / "source-originals"
MANIFEST = ASSETS / "manifest.json"
REFERENCE_METADATA = ROOT / "apps/web/src/domains/creator/virtual-space/office2d/office2d-atlas-metadata.json"
ASSET_URL = "/assets/virtual-studio/office-standing-expressions-v1"
ROLES = ("artist", "pd", "writer", "colorist", "bgartist", "letterer", "modeler", "editor")
WIDTH, HEIGHT, COLUMNS, ROWS = 1536, 1024, 4, 2
ALPHA_THRESHOLD, PADDING = 64, 2
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_PNG_BYTES = 32 * 1024 * 1024
# 색 해석·물리 해상도·EXIF 정보는 압축된 ICC payload까지 원문 chunk 그대로 옮긴다.
PRESERVED_CHUNKS = {b"iCCP", b"gAMA", b"sRGB", b"cHRM", b"cICP", b"mDCV", b"cLLI", b"sBIT", b"bKGD", b"pHYs", b"eXIf"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def source_path(role):
    return SOURCES / f"{role}-standing.png"


def runtime_path(role):
    return ASSETS / f"{role}-standing-runtime-v1.png"


def read_manifest():
    require(MANIFEST.is_file() and not MANIFEST.is_symlink(), "새 전신 manifest.json에 root가 원본 해시를 먼저 기록하세요.")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    require(isinstance(manifest, dict) and type(manifest.get("version")) is int and manifest["version"] == 2,
            "새 전신 manifest의 version은 2여야 합니다.")
    assets = manifest.get("assets") if isinstance(manifest, dict) else None
    require(isinstance(assets, list) and len(assets) == len(ROLES), "전신 manifest assets는 8개여야 합니다.")
    by_role = {}
    for asset in assets:
        require(isinstance(asset, dict), "전신 manifest asset이 객체가 아닙니다.")
        role = asset.get("role")
        require(isinstance(role, str) and role in ROLES and role not in by_role, "전신 manifest 직군이 중복되거나 잘못됐습니다.")
        require(asset.get("sourceUrl") == f"{ASSET_URL}/source-originals/{role}-standing.png"
                and asset.get("url") == f"{ASSET_URL}/{role}-standing-runtime-v1.png", f"{role}: 원본/runtime URL이 계약과 다릅니다.")
        require(isinstance(asset.get("sourceSha256"), str) and re.fullmatch(r"[0-9a-f]{64}", asset["sourceSha256"]),
                f"{role}: root가 확인한 원본 sourceSha256이 필요합니다.")
        require(type(asset.get("sourceBytes")) is int and 0 < asset["sourceBytes"] <= MAX_PNG_BYTES
                and asset.get("width") == WIDTH and asset.get("height") == HEIGHT, f"{role}: 원본 크기/치수 기록이 잘못됐습니다.")
        require(asset.get("columns") == COLUMNS and asset.get("rows") == ROWS and asset.get("frameCount") == COLUMNS * ROWS,
                f"{role}: 전신 원장은 4열×2행 8프레임이어야 합니다.")
        eye_ratio = asset.get("eyeLineRatio")
        require(type(eye_ratio) in (int, float) and 0.1 <= eye_ratio <= 0.5 and math.isfinite(eye_ratio),
                f"{role}: eyeLineRatio는 원장에서 확인한 0.1~0.5의 유한한 숫자여야 합니다.")
        by_role[role] = asset
    return manifest, by_role


def source_hashes(assets):
    result = {}
    for role in ROLES:
        expected = assets[role]["sourceSha256"]
        path = source_path(role)
        require(not path.is_symlink() and path.is_file(), f"보존 원본이 없거나 심볼릭 링크입니다: {path.name}")
        require(0 < path.stat().st_size <= MAX_PNG_BYTES, f"{path.name}: 원본 파일 크기가 지원 범위를 벗어났습니다.")
        raw = path.read_bytes()
        require(len(raw) == assets[role]["sourceBytes"], f"{role}: 원본 sourceBytes가 다릅니다.")
        result[role] = digest(raw)
        require(result[role] == expected, f"{path.name}: 보존 원본 SHA-256이 최초 원장과 다릅니다. 원본을 덮어쓰지 말고 확인하세요.")
    return result


def png_chunks(raw):
    """profile 원문 보존을 위해 PNG chunk와 CRC를 확인한다. IDAT 복원은 Pillow가 맡는다."""
    require(raw.startswith(PNG_SIGNATURE), "PNG signature가 다릅니다.")
    offset, chunks = len(PNG_SIGNATURE), []
    saw_idat, idat_closed, saw_end = False, False, False
    while offset < len(raw):
        require(offset + 12 <= len(raw), "PNG chunk header가 잘렸습니다.")
        size = struct.unpack_from(">I", raw, offset)[0]
        kind = raw[offset + 4:offset + 8]
        require(all(65 <= value <= 90 or 97 <= value <= 122 for value in kind)
                and not kind[2] & 32, f"PNG chunk 이름이 잘못됐습니다: {kind!r}")
        end = offset + 12 + size
        require(end <= len(raw), f"PNG {kind!r} chunk가 잘렸습니다.")
        payload = raw[offset + 8:offset + 8 + size]
        crc = struct.unpack_from(">I", raw, offset + 8 + size)[0]
        require(zlib.crc32(payload, zlib.crc32(kind)) & 0xFFFFFFFF == crc, f"PNG {kind!r} CRC가 다릅니다.")
        require(chunks or kind == b"IHDR", "PNG 첫 chunk가 IHDR이 아닙니다.")
        if saw_idat and kind != b"IDAT":
            idat_closed = True
        if kind == b"IHDR":
            require(not chunks and size == 13, "IHDR 위치·길이·중복이 잘못됐습니다.")
            require(struct.unpack(">IIBBBBB", payload) == (WIDTH, HEIGHT, 8, 6, 0, 0, 0),
                    "1536×1024, 8bit RGBA, non-interlaced PNG가 필요합니다.")
        elif kind == b"IDAT":
            require(not idat_closed, "IDAT가 연속하지 않습니다.")
            saw_idat = True
        elif kind == b"IEND":
            require(size == 0 and saw_idat and end == len(raw), "IEND 길이·위치나 IDAT가 잘못됐습니다.")
            saw_end = True
        elif kind in (b"tRNS", b"acTL", b"fcTL", b"fdAT", b"dSIG"):
            raise ValueError(f"원문 의미를 보존할 수 없는 정적 RGBA chunk입니다: {kind!r}")
        else:
            require(kind == b"PLTE" or kind[0] & 32, f"알 수 없는 critical chunk입니다: {kind!r}")
        chunks.append((kind, raw[offset:end]))
        offset = end
    require(saw_end, "PNG에 IEND가 없습니다.")
    return chunks


def read_source(role, assets):
    raw = source_path(role).read_bytes()
    require(digest(raw) == assets[role]["sourceSha256"] and len(raw) == assets[role]["sourceBytes"],
            f"{role}: 읽는 동안 보존 원본 해시/크기가 달라졌습니다.")
    chunks = png_chunks(raw)
    with Image.open(BytesIO(raw)) as opened:
        require(opened.mode == "RGBA" and opened.size == (WIDTH, HEIGHT), f"{role}: RGBA/치수가 다릅니다.")
        opened.load()
        image = opened.copy()
    return image, chunks


def source_rects(image):
    """checker를 import하지 않고 Pillow C 연산(point/crop/getbbox)으로 독립 계산한다."""
    threshold = image.getchannel("A").point([0] * (ALPHA_THRESHOLD + 1) + [255] * (255 - ALPHA_THRESHOLD))
    cell_w, cell_h = WIDTH // COLUMNS, HEIGHT // ROWS
    rectangles = []
    for row in range(ROWS):
        for col in range(COLUMNS):
            left, top = col * cell_w, row * cell_h
            box = threshold.crop((left, top, left + cell_w, top + cell_h)).getbbox()
            require(box is not None, f"{row}행 {col}열: alpha>{ALPHA_THRESHOLD} 전신 bbox가 비었습니다.")
            require(box[0] >= PADDING and box[1] >= PADDING
                    and box[2] + PADDING <= cell_w and box[3] + PADDING <= cell_h,
                    f"{row}행 {col}열: 전신 bbox+2px가 셀 밖입니다. 신체·padding을 자르지 않습니다.")
            rectangles.append((left + box[0] - PADDING, top + box[1] - PADDING,
                               left + box[2] + PADDING, top + box[3] + PADDING))
    return rectangles


def full_body_frames(role, image, rectangles, assets):
    """기존 walk idle의 실제 키와 발188을 유지하고 머리 기준 꾸미기 offset을 계산한다."""
    atlas = json.loads(REFERENCE_METADATA.read_text(encoding="utf-8"))["sheets"][f"{role}:walk"]
    require(assets[role].get("referenceUrl") == atlas["originalUrl"]
            and assets[role].get("referenceSha256") == atlas["originalSha256"],
            f"{role}: 전신 원장의 기준 walk 원본이 기존 atlas와 다릅니다.")
    reference = atlas["frames"][0]
    reference_scale_y = atlas["height"] / atlas["rows"] / 192
    body_height = (reference["anchor"]["y"] - (reference["source"]["y"] + PADDING)) / reference_scale_y
    require(math.isfinite(body_height) and body_height > 0, f"{role}: 기존 walk idle의 실제 몸높이가 잘못됐습니다.")
    alpha = image.getchannel("A")
    frames = []
    for index, (x0, y0, x1, y1) in enumerate(rectangles):
        bx0, by0, bx1, by1 = x0 + PADDING, y0 + PADDING, x1 - PADDING, y1 - PADDING
        body_pixels = by1 - by0
        head_top, head_bottom = by0 + body_pixels * 0.05, by0 + body_pixels * 0.30
        centers = []
        for y in range(int(head_top), max(int(head_top) + 1, int(head_bottom))):
            box = alpha.crop((bx0, y, bx1, y + 1)).point([0] * 129 + [255] * 127).getbbox()
            if box:
                centers.append((bx0 + (box[0] + box[2] - 1) / 2, y))
        head_x = round(statistics.median(point[0] for point in centers), 4) if centers else (bx0 + bx1) / 2
        head_y = round(statistics.median(point[1] for point in centers), 4) if centers else head_top
        scale = body_height / body_pixels
        target = {"x": round(64 + (x0 - head_x) * scale, 6), "y": round(188 + (y0 - by1) * scale, 6),
                  "width": round((x1 - x0) * scale, 6), "height": round((y1 - y0) * scale, 6)}
        # 기존 colorist idle의 실제 키189도 발188을 유지한다. 상단만 최대8 논리px 허용한다.
        require(target["x"] >= 0 and target["y"] >= -8 and target["x"] + target["width"] <= 128
                and target["y"] + target["height"] <= 192,
                f"{role}/{index}: 같은 키를 유지하면 target이 논리셀 밖입니다. 임의 축소·자르기를 하지 않습니다.")
        offset = {"x": round(64 - reference["referenceHead"]["x"], 6),
                  "y": round(188 + (head_y - by1) * scale - reference["referenceHead"]["y"], 6)}
        require(abs(offset["x"]) <= 128 and abs(offset["y"]) <= 192, f"{role}/{index}: 꾸미기 머리 offset 범위가 잘못됐습니다.")
        # 모자·헤드폰의 기존 머리 기준은 유지하고 안경 중심58.5만 관측 눈높이에 맞춘다.
        eye_y = by0 + body_pixels * assets[role]["eyeLineRatio"]
        eyewear = {"x": offset["x"], "y": round(188 + (eye_y - by1) * scale - 58.5, 6)}
        require(abs(eyewear["x"]) <= 128 and abs(eyewear["y"]) <= 192,
                f"{role}/{index}: 안경 눈높이 offset 범위가 잘못됐습니다.")
        frames.append({"source": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
                       "target": target, "accessoryOffset": offset, "eyewearOffset": eyewear})
    return frames


def retained_alpha(image, rectangles):
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    for left, top, right, bottom in rectangles:
        draw.rectangle((left, top, right - 1, bottom - 1), fill=255)
    return ImageChops.multiply(image.getchannel("A"), mask)


def strict_gutters(alpha):
    cell_w, cell_h = WIDTH // COLUMNS, HEIGHT // ROWS
    for row in range(ROWS):
        for col in range(COLUMNS):
            left, top = col * cell_w, row * cell_h
            for strip in ((left, top, left + cell_w, top + PADDING),
                          (left, top + cell_h - PADDING, left + cell_w, top + cell_h),
                          (left, top, left + PADDING, top + cell_h),
                          (left + cell_w - PADDING, top, left + cell_w, top + cell_h)):
                require(alpha.crop(strip).getbbox() is None,
                        f"{row}행 {col}열: 보존할 source 안에 2px alpha0 gutter 위반이 있습니다. 배우 픽셀을 자르지 않습니다.")


def rgb_bytes(image):
    # ICC 변환·합성·리샘플 없이 원본 R/G/B 채널만 그대로 결합한다.
    return Image.merge("RGB", image.split()[:3]).tobytes()


def preserve_color_chunks(encoded, source_chunks):
    originals = [(kind, raw) for kind, raw in source_chunks if kind in PRESERVED_CHUNKS]
    chunks = png_chunks(encoded)
    result = bytearray(PNG_SIGNATURE)
    for kind, raw in chunks:
        if kind not in PRESERVED_CHUNKS:
            result.extend(raw)
        if kind == b"IHDR":
            for _, original in originals:
                result.extend(original)
    payload = bytes(result)
    require([(kind, raw) for kind, raw in png_chunks(payload) if kind in PRESERVED_CHUNKS] == originals,
            "runtime의 ICC/gamma/sRGB 등 원문 chunk 보존에 실패했습니다.")
    return payload


def verify_runtime(raw, original, rectangles, source_chunks):
    chunks = png_chunks(raw)
    require([(kind, data) for kind, data in chunks if kind in PRESERVED_CHUNKS]
            == [(kind, data) for kind, data in source_chunks if kind in PRESERVED_CHUNKS],
            "runtime의 색프로필/해상도 원문 chunk가 원본과 다릅니다.")
    with Image.open(BytesIO(raw)) as runtime:
        require(runtime.mode == "RGBA" and runtime.size == original.size, "runtime의 RGBA/해상도가 원본과 다릅니다.")
        runtime.load()
        original_rgb, runtime_rgb = rgb_bytes(original), rgb_bytes(runtime)
        require(runtime_rgb == original_rgb and digest(runtime_rgb) == digest(original_rgb),
                "runtime의 전체 RGB가 원본과 다릅니다. 알파 외 변경은 허용하지 않습니다.")
        require(ImageChops.difference(runtime.getchannel("A"), retained_alpha(original, rectangles)).getbbox() is None,
                "runtime의 alpha가 전신 rectangle 보존·바깥 0 계약과 다릅니다.")
        strict_gutters(runtime.getchannel("A"))
        for index, rect in enumerate(rectangles):
            before, after = original.crop(rect).tobytes(), runtime.crop(rect).tobytes()
            require(before == after and digest(before) == digest(after), f"프레임 {index}: 전신 source의 RGBA가 원본과 다릅니다.")


def prepare(role, assets, encode):
    original, chunks = read_source(role, assets)
    try:
        rectangles = source_rects(original)
        alpha = original.getchannel("A")
        expected_alpha = retained_alpha(original, rectangles)
        strict_gutters(expected_alpha)
        frames = full_body_frames(role, original, rectangles, assets)
        changed = ImageChops.difference(alpha, expected_alpha).point([0] + [255] * 255).histogram()[255]
        summary = {
            "role": role, "sourceUrl": assets[role]["sourceUrl"], "sourceBytes": assets[role]["sourceBytes"],
            "url": assets[role]["url"], "sourceSha256": assets[role]["sourceSha256"],
            "width": WIDTH, "height": HEIGHT, "rgbSha256": digest(rgb_bytes(original)),
            "changedAlphaPixels": changed,
            "preservedChunks": [kind.decode("ascii") for kind, _ in chunks if kind in PRESERVED_CHUNKS],
            "omittedAncillaryChunks": [kind.decode("ascii") for kind, _ in chunks
                                       if kind not in PRESERVED_CHUNKS and kind[0] & 32],
            "frames": [{**frame, "rgbaSha256": digest(original.crop(rect).tobytes())}
                       for frame, rect in zip(frames, rectangles)],
        }
        if not encode:
            return None, summary
        runtime = original.copy()
        try:
            runtime.putalpha(expected_alpha)
            with BytesIO() as stream:
                runtime.save(stream, format="PNG", optimize=False, icc_profile=None)
                encoded = preserve_color_chunks(stream.getvalue(), chunks)
            verify_runtime(encoded, original, rectangles, chunks)
            summary.update({"bytes": len(encoded), "sha256": digest(encoded), "decodedPixelChecks": True})
            return encoded, summary
        finally:
            runtime.close()
    finally:
        original.close()


def main():
    parser = argparse.ArgumentParser(description="보존 원본과 전신 RGBA를 바꾸지 않는 표정 runtime 복사본 준비")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="기본값: 계획·원본 해시만 출력, 파일 생성 0")
    mode.add_argument("--write-runtime", action="store_true", help="직접 허용 후 root 단독 창에서 새 runtime PNG 8개만 생성")
    parser.add_argument("--record-runtime", action="store_true", help="검증된 runtime bytes/sha256만 public manifest에 기록")
    args = parser.parse_args()
    require(not (args.dry_run and args.record_runtime), "--dry-run과 --record-runtime은 함께 쓸 수 없습니다.")
    require(SOURCES.is_dir() and SOURCES.resolve() == SOURCES, "실제 source-originals 폴더에 원본 8개를 먼저 보존하세요.")
    require(ASSETS.resolve() == ASSETS, "자산 폴더의 심볼릭 링크·경로 탈출은 허용하지 않습니다.")
    manifest, assets = read_manifest()
    expected_names = {f"{role}-standing.png" for role in ROLES}
    require({path.name for path in SOURCES.iterdir() if path.suffix.lower() == ".png"} == expected_names,
            "source-originals의 PNG 목록이 최초 원본 8개와 다릅니다.")
    for role in ROLES:
        target = runtime_path(role)
        if args.write_runtime:
            require(not target.exists() and not target.is_symlink(), f"출력이 이미 존재합니다. 덮어쓰지 않습니다: {target.name}")
        elif args.record_runtime:
            require(target.is_file() and not target.is_symlink(), f"검증할 runtime이 없습니다: {target.name}")
    before = source_hashes(assets)
    prepared, written = [], []
    try:
        for role in ROLES:
            try:
                encoded, summary = prepare(role, assets, args.write_runtime)
                prepared.append((role, encoded, summary))
            except (ValueError, OSError, SyntaxError, KeyError, TypeError, ZeroDivisionError) as error:
                raise ValueError(f"{role}: {error}") from error
        require(source_hashes(assets) == before, "준비 중 원본 SHA-256이 변경됐습니다.")
        if args.write_runtime:
            for role, encoded, _ in prepared:
                target = runtime_path(role)
                # xb는 존재하는 파일·링크를 덮어쓰지 않는다. 임시 파일·sidecar를 생성하지 않는다.
                with target.open("xb") as output:
                    written.append(str(target.relative_to(ROOT)))
                    require(output.write(encoded) == len(encoded), f"{target.name}: PNG 쓰기가 완료되지 않았습니다.")
                original, chunks = read_source(role, assets)
                try:
                    verify_runtime(target.read_bytes(), original, source_rects(original), chunks)
                finally:
                    original.close()
        if args.record_runtime:
            for role, _, summary in prepared:
                target = runtime_path(role)
                require(target.is_file() and not target.is_symlink(), f"검증할 runtime이 없거나 링크입니다: {target.name}")
                raw = target.read_bytes()
                require(0 < len(raw) <= MAX_PNG_BYTES, f"{role}: runtime 파일 크기가 지원 범위 밖입니다.")
                original, chunks = read_source(role, assets)
                try:
                    verify_runtime(raw, original, source_rects(original), chunks)
                finally:
                    original.close()
                summary.update({"bytes": len(raw), "sha256": digest(raw), "decodedPixelChecks": True})
                assets[role].update({"bytes": len(raw), "sha256": digest(raw)})
            require(source_hashes(assets) == before, "원장 기록 전 원본 SHA-256이 변경됐습니다.")
            MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (ValueError, OSError, SyntaxError) as error:
        raise ValueError(f"{error} 이미 생성된 runtime={written}; 자동 삭제·재실행하지 않았습니다.") from error
    finally:
        require(source_hashes(assets) == before, "작업 후 원본 8개 SHA-256 불변 검증에 실패했습니다.")
    print(json.dumps({"mode": "write-runtime" if args.write_runtime else "record-runtime" if args.record_runtime else "dry-run",
                      "sourceHashesUnchanged": True, "writtenFiles": written,
                      "manifestRecorded": args.record_runtime,
                      "allowedOutputFiles": [str(runtime_path(role).relative_to(ROOT)) for role in ROLES],
                      "assets": [summary for _, _, summary in prepared]}, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, SyntaxError, struct.error, zlib.error) as error:
        print(f"표정 runtime 준비 실패: {error}", file=sys.stderr)
        sys.exit(1)
