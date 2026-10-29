#!/usr/bin/env python3
"""Make the pilot's GLB files self-contained without changing geometry or approving art.

Restricted GLB 2.0 JSON+BIN processor, not a complete glTF validator or Studio test.
Spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
"""
from __future__ import annotations
import argparse
from collections.abc import Callable
import copy
import hashlib
import json
from pathlib import Path
import shutil
import struct
from urllib.parse import unquote, urlsplit
from studio_asset_curation import safe_file, sha256_file

LIMIT = 64 * 1024 * 1024
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
NORMALIZER_SOURCE_SHA256 = sha256_file(Path(__file__))


def read_glb(data: bytes) -> tuple[dict, bytes]: # NOSONAR python:S3776
    if not 28 <= len(data) <= LIMIT:
        raise ValueError('GLB size outside pilot budget')
    magic, version, size = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or size != len(data):
        raise ValueError('invalid GLB header')
    chunks = []
    offset = 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError('truncated chunk header')
        length, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if length % 4 or offset + length > len(data):
            raise ValueError('invalid chunk size')
        chunks.append((kind, data[offset:offset + length]))
        offset += length
    if [k for k, _ in chunks] != [JSON_CHUNK, BIN_CHUNK]:
        raise ValueError('pilot requires exactly JSON and BIN chunks')
    doc = json.loads(chunks[0][1])
    binary = chunks[1][1]
    if not isinstance(doc, dict) or doc.get('asset', {}).get('version') != '2.0':
        raise ValueError('unsupported glTF version')
    buffers = doc.get('buffers', [])
    if len(buffers) != 1 or 'uri' in buffers[0]:
        raise ValueError('pilot requires one embedded buffer')
    declared = buffers[0].get('byteLength')
    if type(declared) is not int or declared <= 0 or not 0 <= len(binary) - declared <= 3:
        raise ValueError('buffer length mismatch')
    for view in doc.get('bufferViews', []):
        start, length = view.get('byteOffset', 0), view.get('byteLength')
        if view.get('buffer') != 0 or type(start) is not int or type(length) is not int or start < 0 or length <= 0 or start + length > declared:
            raise ValueError('invalid buffer view')
    return doc, binary[:declared]


def write_glb(doc: dict, binary: bytes) -> bytes:
    js = json.dumps(doc, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
    js += b' ' * (-len(js) % 4)
    padded = binary + b'\0' * (-len(binary) % 4)
    size = 12 + 8 + len(js) + 8 + len(padded)
    if size > LIMIT:
        raise ValueError('normalized GLB exceeds budget')
    return (struct.pack('<4sII', b'glTF', 2, size) + struct.pack('<II', len(js), JSON_CHUNK)
            + js + struct.pack('<II', len(padded), BIN_CHUNK) + padded)


def normalize_bytes(original: bytes, resolve_texture: Callable[[str], bytes]) -> tuple[bytes, list[dict]]: # NOSONAR python:S3776
    """파일을 쓰지 않고 승인된 resolver의 이미지 바이트만 GLB에 내장한다."""
    doc, binary = read_glb(original)
    original_doc = copy.deepcopy(doc)
    original_binary = binary
    embedded = []
    for image in doc.get('images', []):
        if 'uri' not in image:
            continue
        uri = image['uri']
        if not isinstance(uri, str) or 'bufferView' in image:
            raise ValueError('ambiguous image source')
        parsed = urlsplit(uri)
        if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
            raise ValueError('external or data URI not supported by pilot')
        image_bytes = resolve_texture(uri)
        if not isinstance(image_bytes, bytes):
            raise ValueError('이미지 resolver는 bytes를 반환해야 합니다.')
        if len(image_bytes) > 16 * 1024 * 1024:
            raise ValueError('texture too large')
        if image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
            mime = 'image/png'
        elif image_bytes.startswith(b'\xff\xd8\xff'):
            mime = 'image/jpeg'
        else:
            raise ValueError('unsupported image signature')
        binary += b'\0' * (-len(binary) % 4)
        offset = len(binary)
        binary += image_bytes
        views = doc.setdefault('bufferViews', [])
        image['bufferView'] = len(views)
        image['mimeType'] = mime
        del image['uri']
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(image_bytes)})
        embedded.append({'uri': uri, 'sha256': hashlib.sha256(image_bytes).hexdigest(), 'bytes': len(image_bytes)})
    doc['buffers'][0]['byteLength'] = len(binary)
    data = write_glb(doc, binary) if embedded else original
    check_doc, check_bin = read_glb(data)
    if any('uri' in i for i in check_doc.get('images', [])):
        raise ValueError('image URI remains')
    if check_bin[:len(original_binary)] != original_binary:
        raise ValueError('original binary changed')
    for key in ('meshes', 'accessors', 'nodes', 'scenes', 'materials', 'textures', 'animations', 'skins'):
        if check_doc.get(key) != original_doc.get(key):
            raise ValueError('geometry or scene metadata changed')
    for key in original_doc.keys() - {'buffers', 'bufferViews', 'images'}:
        if check_doc.get(key) != original_doc[key]:
            raise ValueError('GLB의 원본 메타데이터가 변경됐습니다.')
    original_views = original_doc.get('bufferViews', [])
    if check_doc.get('bufferViews', [])[:len(original_views)] != original_views:
        raise ValueError('GLB의 원본 bufferView가 변경됐습니다.')
    for key in original_doc['buffers'][0].keys() - {'byteLength'}:
        if check_doc['buffers'][0].get(key) != original_doc['buffers'][0][key]:
            raise ValueError('GLB의 원본 buffer 메타데이터가 변경됐습니다.')
    for before, after in zip(original_doc.get('images', []), check_doc.get('images', []), strict=True):
        for key in before.keys() - {'uri', 'bufferView', 'mimeType'}:
            if after.get(key) != before[key]:
                raise ValueError('GLB의 원본 image 메타데이터가 변경됐습니다.')
    for image in check_doc.get('images', []):
        view_id = image.get('bufferView')
        if type(view_id) is not int or not 0 <= view_id < len(check_doc.get('bufferViews', [])):
            raise ValueError('image missing embedded data')
        if image.get('mimeType') not in {'image/png', 'image/jpeg'}:
            raise ValueError('unsupported embedded image type')
    return data, embedded


def normalize(source: Path, destination: Path) -> dict:
    if destination.exists() or destination.is_symlink():
        raise ValueError('destination already exists')
    if source.stat().st_size > LIMIT:
        raise ValueError('source exceeds pilot budget')
    original = source.read_bytes()

    def resolve_texture(uri: str) -> bytes:
        texture = safe_file(source.parent, unquote(urlsplit(uri).path))
        if texture.stat().st_size > 16 * 1024 * 1024:
            raise ValueError('texture too large')
        return texture.read_bytes()

    data, embedded = normalize_bytes(original, resolve_texture)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as f:
        f.write(data)
    return {'sourceSha256': hashlib.sha256(original).hexdigest(),
            'normalizedSha256': sha256_file(destination), 'embeddedTextures': embedded,
            'geometryBytesPreserved': True, 'externalImageUrisRemaining': 0,
            'phase': 'normalized-not-reviewed', 'studioRuntimeVerified': False}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('quarantine', type=Path)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    source_root = args.quarantine.resolve(strict=True)
    target = args.output.resolve()
    if target.is_relative_to(source_root) or target.exists():
        raise ValueError('use a new output directory outside quarantine')
    paths = sorted(source_root.rglob('*.glb'))
    if not 1 <= len(paths) <= 2048:
        raise ValueError('no GLB files or too many files')
    report = {'modelFiles': len(paths), 'normalizedFiles': 0, 'filesWithEmbeddedTextures': 0,
              'approvedOriginals': 0, 'productionPublished': 0, 'records': [], 'errors': []}
    target.mkdir(parents=True)
    for path in paths:
        relative = path.relative_to(source_root)
        try:
            path = safe_file(source_root, relative.as_posix())
            result = normalize(path, target / relative)
            result['path'] = relative.as_posix()
            report['records'].append(result)
            report['normalizedFiles'] += 1
            report['filesWithEmbeddedTextures'] += bool(result['embeddedTextures'])
        except (OSError, ValueError, KeyError, TypeError) as error:
            report['errors'].append({'path': str(relative), 'error': str(error)})
    for path in source_root.glob('*/License.txt'):
        safe = safe_file(source_root, path.relative_to(source_root).as_posix())
        destination = target / path.relative_to(source_root)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(safe, destination)
    (target / 'normalization-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'records'}, ensure_ascii=False, indent=2))
    return int(bool(report['errors']))


if __name__ == '__main__':
    raise SystemExit(main())
