"""고정 배포된 expansion-v1에서 면적이 0인 삼각형만 제외한 별도 GLB 판을 만든다."""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import tempfile

ENVIRONMENTS = Path(__file__).resolve().parents[2] / "apps/web/public/assets/3d/environments"
INDEX_FORMAT = {5121: "B", 5123: "H", 5125: "I"}


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def read_glb(data):
    if struct.unpack_from("<4sII", data) != (b"glTF", 2, len(data)):
        raise ValueError("유효한 GLB 2 헤더가 필요합니다")
    size, kind = struct.unpack_from("<I4s", data, 12)
    binary_size, binary_kind = struct.unpack_from("<I4s", data, 20 + size)
    if kind != b"JSON" or binary_kind != b"BIN\0" or 28 + size + binary_size != len(data):
        raise ValueError("JSON·BIN 두 청크가 있는 GLB가 필요합니다")
    doc = json.loads(data[20:20 + size])
    if len(doc["buffers"]) != 1 or any(key in doc for key in ("animations", "skins", "extensionsRequired")):
        raise ValueError("내장 버퍼 한 개를 쓰는 정적 배경만 지원합니다")
    return doc, memoryview(data)[28 + size:]


def filter_primitive(doc, binary, primitive):
    if primitive.get("mode", 4) != 4 or "targets" in primitive or "extensions" in primitive:
        raise ValueError("압축·모프가 없는 인덱스 삼각형 배경만 지원합니다")
    indices = doc["accessors"][primitive["indices"]]
    positions = doc["accessors"][primitive["attributes"]["POSITION"]]
    iv = doc["bufferViews"][indices["bufferView"]]
    pv = doc["bufferViews"][positions["bufferView"]]
    if indices["type"] != "SCALAR" or positions["type"] != "VEC3" or positions["componentType"] != 5126:
        raise ValueError("기대하는 인덱스와 좌표 형식이 아닙니다")
    if "sparse" in indices or "sparse" in positions or iv.get("byteStride") or indices.get("byteOffset"):
        raise ValueError("독립된 연속 인덱스 버퍼가 필요합니다")
    triangle = struct.Struct("<3" + INDEX_FORMAT[indices["componentType"]])
    if iv["byteLength"] != indices["count"] // 3 * triangle.size or indices["count"] % 3:
        raise ValueError("인덱스 접근자와 버퍼 길이가 다릅니다")
    pos_at = pv.get("byteOffset", 0) + positions.get("byteOffset", 0)
    point = struct.Struct("<3f")
    stride = pv.get("byteStride", point.size)
    vertices = [point.unpack_from(binary, pos_at + n * stride) for n in range(positions["count"])]
    start = iv.get("byteOffset", 0)
    words = binary[start:start + iv["byteLength"]]
    keep = bytearray()
    for face_index, (a, b, c) in enumerate(triangle.iter_unpack(words)):
        # 위치가 정확히 같은 꼭짓점만 판정해 UV/노멀 경계나 매우 작은 정상 면을 보존한다.
        if vertices[a] != vertices[b] and vertices[b] != vertices[c] and vertices[c] != vertices[a]:
            offset = face_index * triangle.size
            keep.extend(words[offset:offset + triangle.size])
    return bytes(keep), (len(words) - len(keep)) // triangle.size


def refine(data):
    doc, binary = read_glb(data)
    replacements = {}
    removed = 0
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            accessor = primitive["indices"]
            kept, count = filter_primitive(doc, binary, primitive)
            if accessor in replacements and replacements[accessor] != (kept, count):
                raise ValueError("서로 다른 좌표가 같은 인덱스 버퍼를 공유합니다")
            replacements[accessor] = (kept, count)
            removed += count
    if not removed:
        return data, 0
    changed_views = {}
    for ai, (kept, count) in replacements.items():
        if not count:
            continue
        acc = doc["accessors"][ai]
        vi = acc["bufferView"]
        if not kept or any(a is not acc and a.get("bufferView") == vi for a in doc["accessors"]):
            raise ValueError("비어 있거나 다른 접근자가 공유하는 인덱스 버퍼입니다")
        if any(im.get("bufferView") == vi for im in doc.get("images", [])):
            raise ValueError("이미지가 인덱스 버퍼를 참조합니다")
        acc["count"] -= count * 3
        # 배포된 원본 인덱스 접근자는 범위 메타데이터가 없지만 새 입력도 정확하게 보존한다.
        if "min" in acc or "max" in acc:
            words = struct.iter_unpack("<" + INDEX_FORMAT[acc["componentType"]], kept)
            values = [word[0] for word in words]
            if "min" in acc:
                acc["min"] = [min(values)]
            if "max" in acc:
                acc["max"] = [max(values)]
        changed_views[vi] = kept
    packed = bytearray()
    for vi, view in enumerate(doc["bufferViews"]):
        if view.get("buffer", 0) != 0 or "extensions" in view:
            raise ValueError("내장 단일 버퍼 뷰만 지원합니다")
        start = view.get("byteOffset", 0)
        content = changed_views.get(vi, binary[start:start + view["byteLength"]])
        packed.extend(bytes(-len(packed) % 4))
        view.update(byteOffset=len(packed), byteLength=len(content))
        packed.extend(content)
    doc["buffers"][0]["byteLength"] = len(packed)
    packed.extend(bytes(-len(packed) % 4))
    header = json.dumps(doc, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
    header += b" " * (-len(header) % 4)
    return (struct.pack("<4sIIII", b"glTF", 2, 28 + len(header) + len(packed), len(header), 0x4E4F534A)
            + header + struct.pack("<I4s", len(packed), b"BIN\0") + packed), removed


def build(output, check=False):
    source = ENVIRONMENTS / "expansion-v1"
    assets = json.loads((source / "manifest.json").read_text())["assets"]
    records = []
    with tempfile.TemporaryDirectory() as temporary:
        stage = Path(temporary)
        for asset in assets:
            key = asset["fileName"]
            if key != Path(key).name or not key.endswith(".glb"):
                raise ValueError("잘못된 원본 GLB 이름")
            original = (source / key).read_bytes()
            if digest(original) != asset["sha256"] or len(original) != asset["byteSize"]:
                raise ValueError(f"원본 SHA 또는 크기 불일치: {key}")
            revised, removed = refine(original)
            if removed:
                (stage / key).write_bytes(revised)
                records.append({"sourceId": asset["id"], "sourceSha256": asset["sha256"],
                                "id": asset["id"].removesuffix("-v1") + "-v2", "fileName": key,
                                "sha256": digest(revised), "byteSize": len(revised), "removedTriangles": removed})
        if not records:
            raise ValueError("고칠 삼각형이 없습니다")
        (stage / "manifest.json").write_text(json.dumps({"version": "expansion-v2", "assets": records}, indent=2) + "\n")
        if not check:
            output.mkdir(parents=True, exist_ok=True)
        # 이미 공개한 URL이 가리키는 바이트는 고정한다. 다른 결과는 다음 버전으로 내보낸다.
        for file in stage.iterdir():
            dest = output / file.name
            if check and not dest.is_file():
                raise ValueError(f"검증할 파일이 없습니다: {dest}")
            if dest.exists() and dest.read_bytes() != file.read_bytes():
                raise ValueError(f"기존 파일과 충돌합니다: {dest}")
        for file in sorted(stage.iterdir(), key=lambda item: item.name == "manifest.json"):
            dest = output / file.name
            if not check and not dest.exists():
                with tempfile.NamedTemporaryFile(dir=output, delete=False) as pending:
                    pending.write(file.read_bytes())
                Path(pending.name).chmod(0o644)
                Path(pending.name).replace(dest)
    return records


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ENVIRONMENTS / "expansion-v2")
    parser.add_argument("--check", action="store_true", help="기존 출력과 재생성 바이트를 대조")
    args = parser.parse_args()
    for row in build(args.output.resolve(), args.check):
        print(row["fileName"], row["removedTriangles"], row["sha256"])
