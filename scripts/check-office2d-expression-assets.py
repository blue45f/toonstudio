#!/usr/bin/env python3
"""전신 표정 PNG·접지·꾸미기·원본 보존을 표준 라이브러리만으로 검증한다.

기본값/--check는 읽기 전용이다:
  python3 scripts/check-office2d-expression-assets.py
PNG를 읽어 version2 runtime JSON 하나만 생성·갱신한다:
  python3 scripts/check-office2d-expression-assets.py --write-metadata

PNG 원본과 prompt/public manifest는 어떤 모드에서도 수정하지 않는다. 두 모드 모두
공개 원장이 필요하며, assets 배열의 role/url이 선택한 버전별 PNG를 읽는다.
원장의 width, height, bytes, sha256과 실제 파일·runtime metadata를 검증한다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import struct
import sys
import zlib


ROOT = Path(__file__).resolve().parents[1]
ASSET_URL = "/assets/virtual-studio/office-standing-expressions-v1"
ASSETS = ROOT / "apps/web/public/assets/virtual-studio/office-standing-expressions-v1"
SOURCES = ASSETS / "source-originals"
PUBLIC_MANIFEST = ASSETS / "manifest.json"
METADATA = ROOT / "apps/web/src/domains/creator/virtual-space/office2d/office2d-expression-metadata.json"
REFERENCE_METADATA = METADATA.with_name("office2d-atlas-metadata.json")
ROLES = ("artist", "pd", "writer", "colorist", "bgartist", "letterer", "modeler", "editor")
WIDTH, HEIGHT = 1536, 1024
COLUMNS, ROWS = 4, 2
CELL_WIDTH, CELL_HEIGHT = WIDTH // COLUMNS, HEIGHT // ROWS
ALPHA_THRESHOLD, FRAME_PADDING = 64, 2
LOGICAL_WIDTH, LOGICAL_HEIGHT = 128, 192
MAX_PNG_BYTES = 32 * 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
RECT_KEYS = {"x", "y", "width", "height"}
PRESERVED_CHUNKS = {b"iCCP", b"gAMA", b"sRGB", b"cHRM", b"cICP", b"mDCV", b"cLLI", b"sBIT", b"bKGD", b"pHYs", b"eXIf"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value):
    return type(value) is int


def unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"JSON 키가 중복됐습니다: {key}")
        result[key] = value
    return result


def reject_json_constant(value):
    raise ValueError(f"JSON에 유한하지 않은 숫자를 사용할 수 없습니다: {value}")


def read_json(path):
    require(path.is_file(), f"JSON 파일이 없습니다: {path.relative_to(ROOT)}")
    require(path.stat().st_size <= 1024 * 1024, f"JSON이 1MiB 상한을 넘었습니다: {path.name}")
    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_json_object,
                          parse_constant=reject_json_constant)
    except (UnicodeError, ValueError) as error:
        raise ValueError(f"{path.name}: JSON을 읽지 못했습니다: {error}") from error


def read_asset_manifest():
    """공개 원장을 파일 선택 권위로 삼되 같은 폴더의 직접 자식 PNG만 허용한다."""
    manifest = read_json(PUBLIC_MANIFEST)
    require(isinstance(manifest, dict) and integer(manifest.get("version")) and manifest["version"] == 2,
            "전신 public manifest version은 2여야 합니다.")
    assets = manifest.get("assets") if isinstance(manifest, dict) else None
    require(isinstance(assets, list) and len(assets) == len(ROLES), "public manifest assets는 정확히 8개여야 합니다.")
    by_role, expected_pngs = {}, set()
    prefix = ASSET_URL + "/"
    for asset in assets:
        require(isinstance(asset, dict), "public manifest asset이 객체가 아닙니다.")
        role, url = asset.get("role"), asset.get("url")
        require(isinstance(role, str) and role in ROLES and role not in by_role,
                "public manifest의 직군이 알 수 없거나 중복됐습니다.")
        require(asset.get("columns") == COLUMNS and asset.get("rows") == ROWS and asset.get("frameCount") == COLUMNS * ROWS,
                f"{role}: 전신 원장은 4열×2행 8프레임이어야 합니다.")
        eye_ratio = asset.get("eyeLineRatio")
        require(type(eye_ratio) in (int, float) and 0.1 <= eye_ratio <= 0.5 and math.isfinite(eye_ratio),
                f"{role}: eyeLineRatio는 원장에서 확인한 0.1~0.5의 유한한 숫자여야 합니다.")
        require(isinstance(url, str) and url.startswith(prefix), f"{role}: PNG URL이 표정 자산 폴더 밖입니다.")
        basename = url[len(prefix):]
        # 슬래시·역슬래시·퍼센트 인코딩·query/fragment·상대 경로를 허용하지 않는다.
        require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*\.png", basename) is not None,
                f"{role}: PNG URL은 같은 자산 폴더의 직접 자식 파일이어야 합니다.")
        require(basename not in expected_pngs, f"{role}: public manifest의 PNG 파일이 중복됐습니다.")
        # 검증한 basename만 로컬 경로에 결합한다. URL 전체를 파일 경로로 사용하지 않는다.
        path = ASSETS / basename
        require(not path.is_symlink() and path.is_file() and path.resolve().parent == ASSETS.resolve(),
                f"{role}: 선택한 PNG가 없거나 심볼릭 링크/자산 폴더 밖 경로입니다: {basename}")
        by_role[role] = asset
        expected_pngs.add(basename)
        require(asset.get("sourceUrl") == f"{ASSET_URL}/source-originals/{role}-standing.png",
                f"{role}: 보존 원본 URL이 계약과 다릅니다.")
        require(isinstance(asset.get("sourceSha256"), str) and re.fullmatch(r"[0-9a-f]{64}", asset["sourceSha256"]),
                f"{role}: 원본 sourceSha256이 잘못됐습니다.")
        require(integer(asset.get("sourceBytes")) and 0 < asset["sourceBytes"] <= MAX_PNG_BYTES,
                f"{role}: 원본 sourceBytes가 잘못됐습니다.")
        original = SOURCES / f"{role}-standing.png"
        require(original.is_file() and not original.is_symlink() and original.resolve().parent == SOURCES,
                f"{role}: 보존 원본이 없거나 경로가 잘못됐습니다.")
    require(set(by_role) == set(ROLES), "public manifest의 8직군 목록이 다릅니다.")
    actual_pngs = {path.name for path in ASSETS.iterdir() if path.suffix.lower() == ".png"}
    require(actual_pngs == expected_pngs,
            f"선택 원장의 8PNG와 실제 직접 자식 PNG 목록이 다릅니다. "
            f"누락={sorted(expected_pngs - actual_pngs)}, 추가={sorted(actual_pngs - expected_pngs)}")
    require(SOURCES.resolve() == SOURCES and
            {path.name for path in SOURCES.iterdir() if path.suffix.lower() == ".png"}
            == {f"{role}-standing.png" for role in ROLES}, "source-originals의 실제 원본 목록이 8직군과 다릅니다.")
    return by_role


def png_payload(raw):
    """모든 chunk의 CRC·순서·길이를 확인하고 지원하는 RGBA IDAT만 돌려준다."""
    require(raw.startswith(PNG_SIGNATURE), "PNG signature가 다릅니다.")
    offset, chunk_count = len(PNG_SIGNATURE), 0
    header = None
    compressed = bytearray()
    saw_idat, idat_closed, saw_palette, saw_end = False, False, False, False
    while offset < len(raw):
        require(offset + 12 <= len(raw), f"PNG chunk header가 잘렸습니다(offset={offset}).")
        size = struct.unpack_from(">I", raw, offset)[0]
        kind = raw[offset + 4:offset + 8]
        require(len(kind) == 4 and all(65 <= value <= 90 or 97 <= value <= 122 for value in kind),
                f"PNG chunk 이름이 잘못됐습니다(offset={offset}).")
        require(not kind[2] & 32, f"PNG chunk 예약 비트가 잘못됐습니다: {kind!r}")
        end = offset + 12 + size
        require(end <= len(raw), f"PNG {kind.decode('ascii')} chunk가 잘렸습니다(offset={offset}).")
        payload = raw[offset + 8:offset + 8 + size]
        expected_crc = struct.unpack_from(">I", raw, offset + 8 + size)[0]
        actual_crc = zlib.crc32(payload, zlib.crc32(kind)) & 0xFFFFFFFF
        require(actual_crc == expected_crc,
                f"PNG {kind.decode('ascii')} CRC가 다릅니다(offset={offset}).")
        require(chunk_count != 0 or kind == b"IHDR", "PNG 첫 chunk가 IHDR이 아닙니다.")
        chunk_count += 1
        if saw_idat and kind != b"IDAT":
            idat_closed = True
        if kind == b"IHDR":
            require(header is None and chunk_count == 1 and size == 13, "IHDR 중복·위치·길이가 잘못됐습니다.")
            header = struct.unpack(">IIBBBBB", payload)
            require(header[:2] == (WIDTH, HEIGHT),
                    f"PNG 치수가 {header[0]}×{header[1]}입니다. {WIDTH}×{HEIGHT} 원본이 필요합니다.")
            require(header[2:] == (8, 6, 0, 0, 0),
                    "8bit RGBA(color type 6), 표준 압축/filter, non-interlaced PNG만 지원합니다.")
        elif kind == b"PLTE":
            require(not saw_palette and not saw_idat and 0 < size <= 768 and size % 3 == 0,
                    "PLTE 중복·위치·길이가 잘못됐습니다.")
            saw_palette = True
        elif kind == b"IDAT":
            require(header is not None and not idat_closed, "IDAT가 IHDR 앞이거나 연속하지 않습니다.")
            saw_idat = True
            compressed.extend(payload)
        elif kind == b"IEND":
            require(size == 0 and saw_idat and len(compressed) > 0, "IEND 길이나 IDAT가 잘못됐습니다.")
            require(end == len(raw), "IEND 뒤에 추가 데이터가 있습니다.")
            saw_end = True
            break
        elif kind in (b"tRNS", b"acTL", b"fcTL", b"fdAT"):
            raise ValueError(f"RGBA 정적 원본에서 지원하지 않는 chunk입니다: {kind.decode('ascii')}")
        else:
            require(bool(kind[0] & 32), f"지원하지 않는 PNG critical chunk입니다: {kind.decode('ascii')}")
        offset = end
    require(header is not None and saw_end, "PNG의 IHDR 또는 IEND가 없습니다.")
    return bytes(compressed)


def paeth(left, above, upper_left):
    estimate = left + above - upper_left
    dl, da, du = abs(estimate - left), abs(estimate - above), abs(estimate - upper_left)
    if dl <= da and dl <= du:
        return left
    return above if da <= du else upper_left


def decode_image(raw):
    """PNG filter 0~4를 복원한다. 이미지 파일을 쓰거나 픽셀을 편집하지 않는다."""
    compressed = png_payload(raw)
    stride = WIDTH * 4
    expected_bytes = (stride + 1) * HEIGHT
    decoder = zlib.decompressobj()
    decoded = decoder.decompress(compressed, expected_bytes + 1)
    require(len(decoded) <= expected_bytes and not decoder.unconsumed_tail,
            "IDAT 압축 해제 결과가 선언 치수의 상한을 넘습니다.")
    require(decoder.eof and not decoder.unused_data, "IDAT zlib stream이 잘렸거나 뒤에 추가 데이터가 있습니다.")
    require(len(decoded) == expected_bytes,
            f"IDAT 복원 길이가 다릅니다: {len(decoded)} / {expected_bytes} bytes")
    pixels = bytearray()
    previous = bytearray(stride)
    offset = 0
    for y in range(HEIGHT):
        method = decoded[offset]
        require(method <= 4, f"PNG {y}행 filter가 지원 범위 밖입니다: {method}")
        row = bytearray(decoded[offset + 1:offset + 1 + stride])
        if method:
            for index in range(stride):
                left = row[index - 4] if index >= 4 else 0
                above = previous[index]
                upper_left = previous[index - 4] if index >= 4 else 0
                if method == 1:
                    predictor = left
                elif method == 2:
                    predictor = above
                elif method == 3:
                    predictor = (left + above) // 2
                else:
                    predictor = paeth(left, above, upper_left)
                row[index] = (row[index] + predictor) & 255
        pixels.extend(row)
        previous = row
        offset += stride + 1
    alpha = pixels[3::4]
    require(alpha.count(0) > 0, "alpha 채널은 있지만 실제 완전 투명 픽셀이 없습니다.")
    require(any(value > ALPHA_THRESHOLD for value in alpha), "시트 전체에 유효한 전신 픽셀이 없습니다.")
    return alpha, pixels


def frame_source(alpha, frame_index, gutter=True):
    col, row = frame_index % COLUMNS, frame_index // COLUMNS
    cell_x, cell_y = col * CELL_WIDTH, row * CELL_HEIGHT
    min_x, min_y, max_x, max_y = WIDTH, HEIGHT, -1, -1
    pixels = 0
    for y in range(cell_y, cell_y + CELL_HEIGHT):
        for x in range(cell_x, cell_x + CELL_WIDTH):
            value = alpha[y * WIDTH + x]
            # 공유 셀 경계의 완전 투명 띠로 이웃 프레임의 연결·혼입을 거부한다.
            if gutter and (x < cell_x + FRAME_PADDING or x >= cell_x + CELL_WIDTH - FRAME_PADDING
                           or y < cell_y + FRAME_PADDING or y >= cell_y + CELL_HEIGHT - FRAME_PADDING):
                require(value == 0,
                        f"프레임 {frame_index}({row}행 {col}열): 셀 경계의 {FRAME_PADDING}px 투명 gutter가 없습니다({x},{y},alpha={value}).")
            if value > ALPHA_THRESHOLD:
                min_x, min_y = min(min_x, x), min(min_y, y)
                max_x, max_y = max(max_x, x), max(max_y, y)
                pixels += 1
    require(pixels > 0, f"프레임 {frame_index}({row}행 {col}열): alpha>{ALPHA_THRESHOLD} bbox가 비었습니다.")
    x0, y0 = min_x - FRAME_PADDING, min_y - FRAME_PADDING
    x1, y1 = max_x + 1 + FRAME_PADDING, max_y + 1 + FRAME_PADDING
    require(cell_x <= x0 and cell_y <= y0 and x1 <= cell_x + CELL_WIDTH and y1 <= cell_y + CELL_HEIGHT,
            f"프레임 {frame_index}: bbox+2px가 셀 밖입니다. 배우·padding을 자르지 않습니다.")
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}, pixels, (min_x, min_y, max_x + 1, max_y + 1)


def valid_rect(rect, width, height, label, pixel_rect=False, top_overscan=0):
    require(isinstance(rect, dict) and set(rect) == RECT_KEYS, f"{label}: x/y/width/height 사각형이 필요합니다.")
    values = [rect[key] for key in ("x", "y", "width", "height")]
    require(all(type(value) in (int, float) and (integer(value) or math.isfinite(value)) for value in values),
            f"{label}: 좌표는 bool이 아닌 유한한 숫자여야 합니다.")
    if pixel_rect:
        require(all(integer(value) for value in values), f"{label}: source는 정수 픽셀 좌표여야 합니다.")
    x, y, w, h = values
    require(0 <= x <= width and -top_overscan <= y <= height and 0 < w <= width and 0 < h <= height + top_overscan
            and x + w <= width and y + h <= height,
            f"{label}: 사각형이 {width}×{height} 범위를 벗어났거나 비었습니다.")
    return dict(rect)


def head_center(alpha, bounds):
    x0, y0, x1, y1 = bounds
    top, bottom = y0 + (y1 - y0) * 0.05, y0 + (y1 - y0) * 0.30
    centers = []
    for y in range(int(top), max(int(top) + 1, int(bottom))):
        xs = [x for x in range(x0, x1) if alpha[y * WIDTH + x] > 128]
        if xs:
            centers.append(((xs[0] + xs[-1]) / 2, y))
    return (round(statistics.median(point[0] for point in centers), 4),
            round(statistics.median(point[1] for point in centers), 4)) if centers else ((x0 + x1) / 2, top)


def frame_layout(asset, source, bounds, alpha, reference_metadata):
    """이미지를 재샘플하지 않고 기존 walk idle과 같은 실제 키·발188로 투영한다."""
    role = asset["role"]
    atlas = reference_metadata["sheets"][f"{role}:walk"]
    require(asset.get("referenceUrl") == atlas["originalUrl"]
            and asset.get("referenceSha256") == atlas["originalSha256"], f"{role}: 기준 walk 원본이 atlas와 다릅니다.")
    reference = atlas["frames"][0]
    reference_scale_y = atlas["height"] / atlas["rows"] / LOGICAL_HEIGHT
    body_height = (reference["anchor"]["y"] - (reference["source"]["y"] + FRAME_PADDING)) / reference_scale_y
    require(math.isfinite(body_height) and body_height > 0, f"{role}: 기존 walk idle의 실제 몸높이가 잘못됐습니다.")
    head_x, head_y = head_center(alpha, bounds)
    foot_y = bounds[3]
    scale = body_height / (bounds[3] - bounds[1])
    target = {"x": round(64 + (source["x"] - head_x) * scale, 6),
              "y": round(188 + (source["y"] - foot_y) * scale, 6),
              "width": round(source["width"] * scale, 6), "height": round(source["height"] * scale, 6)}
    valid_rect(target, LOGICAL_WIDTH, LOGICAL_HEIGHT, f"{role} 전신 target", top_overscan=8)
    offset = {"x": round(64 - reference["referenceHead"]["x"], 6),
              "y": round(188 + (head_y - foot_y) * scale - reference["referenceHead"]["y"], 6)}
    require(abs(offset["x"]) <= 128 and abs(offset["y"]) <= 192, f"{role}: 전신 꾸미기 offset 범위를 벗어났습니다.")
    # 원본 bbox와 원장 눈높이 비율로 안경 기준을 별도로 재계산한다.
    eye_y = bounds[1] + (bounds[3] - bounds[1]) * asset["eyeLineRatio"]
    eyewear = {"x": offset["x"], "y": round(188 + (eye_y - foot_y) * scale - 58.5, 6)}
    require(abs(eyewear["x"]) <= 128 and abs(eyewear["y"]) <= 192, f"{role}: 안경 눈높이 offset 범위를 벗어났습니다.")
    return {"source": source, "target": target, "accessoryOffset": offset, "eyewearOffset": eyewear}


def preserved_chunks(raw):
    result, offset = [], len(PNG_SIGNATURE)
    while offset < len(raw):
        size = struct.unpack_from(">I", raw, offset)[0]
        kind = raw[offset + 4:offset + 8]
        end = offset + 12 + size
        if kind in PRESERVED_CHUNKS:
            result.append(raw[offset:end])
        offset = end
    return result


def rgb_bytes(rgba):
    result = bytearray(len(rgba) // 4 * 3)
    result[0::3], result[1::3], result[2::3] = rgba[0::4], rgba[1::4], rgba[2::4]
    return result


def verify_original(asset, raw, rgba, alpha, frames):
    role = asset["role"]
    source_path = SOURCES / f"{role}-standing.png"
    original_raw = source_path.read_bytes()
    require(len(original_raw) == asset["sourceBytes"] and hashlib.sha256(original_raw).hexdigest() == asset["sourceSha256"],
            f"{role}: 보존 원본 해시/크기가 원장과 다릅니다.")
    original_alpha, original_rgba = decode_image(original_raw)
    require(rgb_bytes(rgba) == rgb_bytes(original_rgba), f"{role}: runtime 전체 RGB가 원본과 다릅니다.")
    require(preserved_chunks(raw) == preserved_chunks(original_raw), f"{role}: ICC/gamma/sRGB 등 원문 chunk가 다릅니다.")
    expected_alpha = bytearray(WIDTH * HEIGHT)
    crop_hashes = []
    for index, frame in enumerate(frames):
        source, _, _ = frame_source(original_alpha, index, gutter=False)
        require(source == frame["source"], f"{role}/{index}: runtime과 원본의 실제 전신 bbox가 다릅니다.")
        x0, y0 = source["x"], source["y"]
        x1, y1 = x0 + source["width"], y0 + source["height"]
        original_crop, runtime_crop = bytearray(), bytearray()
        for y in range(y0, y1):
            start, end = (y * WIDTH + x0) * 4, (y * WIDTH + x1) * 4
            original_crop.extend(original_rgba[start:end])
            runtime_crop.extend(rgba[start:end])
            expected_alpha[y * WIDTH + x0:y * WIDTH + x1] = original_alpha[y * WIDTH + x0:y * WIDTH + x1]
        require(original_crop == runtime_crop, f"{role}/{index}: 전신 crop의 RGBA가 원본과 다릅니다.")
        crop_hashes.append(hashlib.sha256(runtime_crop).hexdigest())
    require(alpha == expected_alpha, f"{role}: 전신 crop 밖 alpha만 0으로 만드는 계약과 다릅니다.")
    require(hashlib.sha256(source_path.read_bytes()).hexdigest() == asset["sourceSha256"], f"{role}: 검증 중 원본 해시가 달라졌습니다.")
    return {"sourceSha256": asset["sourceSha256"], "rgbSha256": hashlib.sha256(rgb_bytes(rgba)).hexdigest(),
            "cropRgbaSha256": crop_hashes, "sourcePixelsPreserved": True}


def extract_sheet(asset, reference_metadata):
    role = asset["role"]
    path = ASSETS / asset["url"].rsplit("/", 1)[1]
    require(path.is_file(), f"원본 PNG가 없습니다: {path.relative_to(ROOT)}")
    size = path.stat().st_size
    require(0 < size <= MAX_PNG_BYTES, f"{path.name}: PNG 크기가 0이거나 {MAX_PNG_BYTES} bytes 상한을 넘습니다.")
    raw = path.read_bytes()
    require(len(raw) == size, f"{path.name}: 읽는 동안 파일 크기가 변경됐습니다.")
    try:
        alpha, rgba = decode_image(raw)
        frames, pixel_counts = [], []
        for index in range(COLUMNS * ROWS):
            source, pixels, bounds = frame_source(alpha, index)
            frames.append(frame_layout(asset, source, bounds, alpha, reference_metadata))
            pixel_counts.append(pixels)
        preservation = verify_original(asset, raw, rgba, alpha, frames)
    except (ValueError, KeyError, TypeError, OverflowError, zlib.error, struct.error) as error:
        raise ValueError(f"{path.name}: {error}") from error
    sheet = {"role": role, "url": asset["url"], "width": WIDTH, "height": HEIGHT,
             "columns": COLUMNS, "rows": ROWS, "frames": frames}
    summary = {"role": role, "url": sheet["url"], "width": WIDTH, "height": HEIGHT, "bytes": size,
               "sha256": hashlib.sha256(raw).hexdigest(), "crcValid": True,
               "transparentPixels": alpha.count(0), "opaquePixels": alpha.count(255),
               "frames": [{**frame, "pixels": count} for frame, count in zip(frames, pixel_counts)], **preservation}
    return sheet, summary


def check_metadata(expected):
    actual = read_json(METADATA)
    require(isinstance(actual, dict) and integer(actual.get("version")) and actual["version"] == 2,
            "전신 runtime metadata의 version은 2여야 합니다.")
    sheets = actual.get("sheets")
    require(isinstance(sheets, list) and len(sheets) == len(ROLES), "runtime metadata는 정확히 8직군이어야 합니다.")
    seen = set()
    by_role = {sheet["role"]: sheet for sheet in expected["sheets"]}
    for sheet in sheets:
        require(isinstance(sheet, dict), "runtime metadata의 sheet가 객체가 아닙니다.")
        role = sheet.get("role")
        require(isinstance(role, str) and role in by_role and role not in seen, "metadata 직군이 알 수 없거나 중복됐습니다.")
        seen.add(role)
        reference = by_role[role]
        for key in ("url", "width", "height", "columns", "rows"):
            require(sheet.get(key) == reference[key], f"{role}: metadata {key}가 원본 계약과 다릅니다.")
            if key != "url":
                require(integer(sheet.get(key)), f"{role}: metadata {key}는 정수여야 합니다.")
        frames = sheet.get("frames")
        require(isinstance(frames, list) and len(frames) == COLUMNS * ROWS, f"{role}: metadata는 8프레임이어야 합니다.")
        for index, frame in enumerate(frames):
            require(isinstance(frame, dict), f"{role}/{index}: frame이 객체가 아닙니다.")
            source = valid_rect(frame.get("source"), WIDTH, HEIGHT, f"{role}/{index} source", pixel_rect=True)
            col, row = index % COLUMNS, index // COLUMNS
            require(col * CELL_WIDTH <= source["x"] and row * CELL_HEIGHT <= source["y"]
                    and source["x"] + source["width"] <= (col + 1) * CELL_WIDTH
                    and source["y"] + source["height"] <= (row + 1) * CELL_HEIGHT,
                    f"{role}/{index}: source가 이웃 셀을 침범합니다.")
            require(source == reference["frames"][index]["source"],
                    f"{role}/{index}: source가 alpha>{ALPHA_THRESHOLD} 실제 bbox+{FRAME_PADDING}px와 다릅니다. "
                    "원본을 확인한 뒤 --write-metadata로 재생성하세요.")
            target = valid_rect(frame.get("target"), LOGICAL_WIDTH, LOGICAL_HEIGHT, f"{role}/{index} target", top_overscan=8)
            require(all(abs(target[key] - reference["frames"][index]["target"][key]) <= 0.00001 for key in RECT_KEYS),
                    f"{role}/{index}: target이 기존 idle 실제 키·발188의 균일 투영과 다릅니다.")
            offset = frame.get("accessoryOffset")
            require(isinstance(offset, dict) and set(offset) == {"x", "y"}
                    and all(type(offset[key]) in (int, float) and (integer(offset[key]) or math.isfinite(offset[key]))
                            and abs(offset[key]) <= limit for key, limit in (("x", 128), ("y", 192))),
                    f"{role}/{index}: accessoryOffset이 유한한 논리셀 범위 밖입니다.")
            require(all(abs(offset[key] - reference["frames"][index]["accessoryOffset"][key]) <= 0.00001 for key in ("x", "y")),
                    f"{role}/{index}: accessoryOffset이 기존 referenceHead 기준 투영과 다릅니다.")
            eyewear = frame.get("eyewearOffset")
            require(isinstance(eyewear, dict) and set(eyewear) == {"x", "y"}
                    and all(type(eyewear[key]) in (int, float) and (integer(eyewear[key]) or math.isfinite(eyewear[key]))
                            and abs(eyewear[key]) <= limit for key, limit in (("x", 128), ("y", 192))),
                    f"{role}/{index}: eyewearOffset이 유한한 논리셀 범위 밖입니다.")
            require(all(abs(eyewear[key] - reference["frames"][index]["eyewearOffset"][key]) <= 0.00001 for key in ("x", "y")),
                    f"{role}/{index}: eyewearOffset이 원장 eyeLineRatio 기준 눈높이와 다릅니다.")


def check_public_manifest(summaries, assets_by_role):
    for summary in summaries:
        asset = assets_by_role[summary["role"]]
        for key in ("url", "width", "height", "bytes", "sha256"):
            require(asset.get(key) == summary[key], f"{summary['role']}: public manifest {key}가 원본 PNG와 다릅니다.")
            if key not in ("url", "sha256"):
                require(integer(asset.get(key)), f"{summary['role']}: public manifest {key}는 정수여야 합니다.")
    return True


def main():
    parser = argparse.ArgumentParser(description="원본을 변경하지 않는 2D 표정 PNG/metadata 검증(Python 표준 라이브러리)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="기본값: PNG·runtime JSON·공개 해시 원장을 읽기만 한다")
    mode.add_argument("--write-metadata", action="store_true", help="PNG를 읽어 runtime JSON 하나만 생성·갱신한다")
    args = parser.parse_args()
    require(ASSETS.is_dir(), f"원본 폴더가 없습니다: {ASSETS.relative_to(ROOT)}")
    require(ASSETS.resolve() == ASSETS, "자산 폴더 경로에 심볼릭 링크 또는 경로 탈출이 있습니다.")
    assets_by_role = read_asset_manifest()
    reference_metadata = read_json(REFERENCE_METADATA)
    sheets, summaries = [], []
    for role in ROLES:
        sheet, summary = extract_sheet(assets_by_role[role], reference_metadata)
        sheets.append(sheet)
        summaries.append(summary)
    metadata = {"version": 2, "sheets": sheets}
    manifest_verified = check_public_manifest(summaries, assets_by_role)
    if args.write_metadata:
        # 원본 보존·gutter·실제 키·접지·꾸미기 검증 뒤 version2 JSON 하나만 쓴다.
        METADATA.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        check_metadata(metadata)
    print(json.dumps({"mode": "write-metadata" if args.write_metadata else "check", "sheets": len(sheets),
                      "frames": len(sheets) * COLUMNS * ROWS, "manifestVerified": manifest_verified,
                      "assets": summaries}, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, zlib.error, struct.error) as error:
        print(f"표정 자산 검증 실패: {error}", file=sys.stderr)
        sys.exit(1)
