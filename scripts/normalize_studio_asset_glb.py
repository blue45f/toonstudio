#!/usr/bin/env python3
"""Make the pilot's GLB files self-contained without changing geometry or approving art.

Restricted GLB 2.0 JSON+BIN processor, not a complete glTF validator or Studio test.
Spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
"""
from __future__ import annotations
import argparse
from collections.abc import Callable, Mapping
import copy
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
from urllib.parse import unquote, urlsplit
from studio_asset_curation import safe_file, sha256_file

LIMIT = 64 * 1024 * 1024
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
NORMALIZER_SOURCE_SHA256 = sha256_file(Path(__file__))


@dataclass(frozen=True)
class OwnerPackImageBindings:
    """호출자가 특정한 소유 pack만 사용하며 공통 quarantine에서 root를 추측하지 않는다."""

    owner_pack_id: str
    pack_root: Path
    source_relative: str
    image_paths: Mapping[str, str]


def _relative_parts(value: str) -> list[str]:
    if (not isinstance(value, str) or not value or value != value.strip()
            or '\\' in value or any(ord(char) < 32 or ord(char) == 127 for char in value)
            or Path(value).is_absolute() or re.match(r'^[A-Za-z]:', value)):
        raise ValueError('팩 상대 경로 형식이 올바르지 않습니다. 절대 경로·역슬래시·제어문자를 제거하고 팩 기준 상대 경로를 지정하세요.')
    parts = value.split('/')
    if any(not part or part == '.' for part in parts):
        raise ValueError('팩 상대 경로에 빈 구간 또는 현재 디렉터리 구간이 있습니다. 빈 구간과 ./를 제거한 경로를 지정하세요.')
    return parts


def _walk_pack_file(root: Path, start: Path, relative: str, *, allow_parent: bool) -> Path:
    """축약 전에 모든 원문 component를 검사하여 link/.. 우회도 거부한다."""
    parts = _relative_parts(relative)
    current = start
    for index, part in enumerate(parts):
        if part == '..':
            if not allow_parent or current == root:
                raise ValueError('경로가 소유 팩 밖으로 이동합니다. source_relative와 image_paths를 같은 팩 내부 경로로 수정하세요.')
            current = current.parent
            continue
        names = [child.name for child in current.iterdir() if child.name.casefold() == part.casefold()]
        if names != [part]:
            raise ValueError('경로 구간이 없거나 대소문자가 모호합니다. 실제 파일명의 대소문자를 맞추고 충돌하는 이름을 정리한 입력을 사용하세요.')
        current = current / part
        if current.is_symlink():
            raise ValueError('소유 팩 경로에 심볼릭 링크가 있습니다. 링크 대신 같은 팩의 실제 파일 경로를 지정하세요.')
        if index < len(parts) - 1 and not current.is_dir():
            raise ValueError('중간 경로 구간이 디렉터리가 아닙니다. source_relative와 image_paths의 디렉터리 구성을 확인하세요.')
    if not current.is_relative_to(root):
        raise ValueError('경로가 소유 팩 밖에 있습니다. source_relative와 image_paths를 같은 팩 내부 경로로 수정하세요.')
    # 기존 regular-file/realpath/크기/폰트 제한을 그대로 재사용한다.
    return safe_file(root, current.relative_to(root).as_posix())


def _decode_bound_image_uri(uri: str) -> str:
    if (not isinstance(uri, str) or not uri or uri != uri.strip()
            or '\\' in uri or any(ord(char) < 32 or ord(char) == 127 for char in uri)
            or re.search(r'%(?![0-9a-fA-F]{2})', uri)):
        raise ValueError('이미지 URI 형식이 올바르지 않습니다. 원본 URI의 공백·제어문자·percent encoding과 image_paths 매핑을 확인하세요.')
    parsed = urlsplit(uri)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or '?' in uri or '#' in uri:
        raise ValueError('외부·data URI 또는 query·fragment가 있는 이미지 URI는 처리할 수 없습니다. 같은 소유 팩의 로컬 이미지 URI를 명시하세요.')
    decoded = unquote(parsed.path, errors='strict')
    raw_parts, decoded_parts = parsed.path.split('/'), decoded.split('/')
    if len(raw_parts) != len(decoded_parts) or any(
            part in {'.', '..'} and raw != part for raw, part in zip(raw_parts, decoded_parts)):
        raise ValueError('이미지 URI가 경로 구분자 또는 상위 이동을 인코딩으로 숨깁니다. 원본의 명시적인 상대 URI와 정확한 image_paths 매핑을 사용하세요.')
    _relative_parts(decoded)
    return decoded


def _resolve_owner_pack_images(source: Path, binding: OwnerPackImageBindings) -> dict[str, Path]:
    if not isinstance(binding, OwnerPackImageBindings):
        raise ValueError('소유 팩 설정이 완전하지 않습니다. OwnerPackImageBindings에 owner_pack_id·절대 pack_root·source_relative·비어 있지 않은 image_paths를 모두 지정하세요.')
    owner = binding.owner_pack_id
    if (not isinstance(owner, str) or not re.fullmatch(r'[a-z0-9][a-z0-9._+\-]{0,159}', owner)
            or not isinstance(binding.pack_root, Path) or not binding.pack_root.is_absolute()
            or not isinstance(binding.image_paths, Mapping) or not binding.image_paths):
        raise ValueError('소유 팩 설정이 완전하지 않습니다. OwnerPackImageBindings에 owner_pack_id·절대 pack_root·source_relative·비어 있지 않은 image_paths를 모두 지정하세요.')
    if binding.pack_root.is_symlink():
        raise ValueError('pack_root가 심볼릭 링크입니다. 해당 소유 팩의 실제 디렉터리 절대 경로를 지정하세요.')
    root = binding.pack_root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError('pack_root가 디렉터리가 아닙니다. 해당 소유 팩의 실제 디렉터리 절대 경로를 지정하세요.')
    declared_source = _walk_pack_file(root, root, binding.source_relative, allow_parent=False)
    if source.absolute() != declared_source:
        raise ValueError('원본 GLB와 선언한 source_relative가 다릅니다. pack_root 아래의 정확한 원본 상대 경로를 지정하세요.')
    paths: dict[str, Path] = {}
    for uri, expected_relative in binding.image_paths.items():
        decoded = _decode_bound_image_uri(uri)
        expected = _walk_pack_file(root, root, expected_relative, allow_parent=False)
        actual = _walk_pack_file(root, declared_source.parent, decoded, allow_parent=True)
        if actual != expected:
            raise ValueError('이미지 URI가 선언한 텍스처와 다른 파일을 가리킵니다. 같은 소유 팩의 원본 URI와 image_paths 매핑을 대조하세요.')
        paths[uri] = expected
    return paths


def _verify_bound_json_and_images(original_doc: dict, check_doc: dict, check_bin: bytes,
                                  expected_buffer_bytes: int,
                                  proofs: list[tuple[int, bytes, str, dict]]) -> None:
    expected = copy.deepcopy(original_doc)
    expected['buffers'][0]['byteLength'] = expected_buffer_bytes
    for image_index, image_bytes, mime, view in proofs:
        image = expected['images'][image_index]
        del image['uri']
        image['mimeType'] = mime
        image['bufferView'] = len(expected.setdefault('bufferViews', []))
        expected['bufferViews'].append(view)
        start = view['byteOffset']
        if check_bin[start:start + view['byteLength']] != image_bytes:
            raise ValueError('내부화한 텍스처 바이트가 원본과 다릅니다. 파생본을 게시하지 말고 원본 이미지와 embedding 처리를 확인하세요.')
    if expected != check_doc:
        raise ValueError('이미지 내부화 허용 범위 밖의 GLB JSON이 바뀌었습니다. 파생본을 게시하지 말고 원본 JSON을 보존하도록 embedding 처리를 수정하세요.')


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
    proofs: list[tuple[int, bytes, str, dict]] = []
    for image_index, image in enumerate(doc.get('images', [])):
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
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(image_bytes)}
        views.append(view)
        proofs.append((image_index, image_bytes, mime, view))
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
    # 순수 호출과 파일 호출 모두 이미지 내부화 외의 JSON 변경을 거부한다.
    _verify_bound_json_and_images(original_doc, check_doc, check_bin, len(binary), proofs)
    return data, embedded


def normalize(source: Path, destination: Path, *,
              owner_pack_images: OwnerPackImageBindings | None = None) -> dict: # NOSONAR python:S3776
    if destination.exists() or destination.is_symlink():
        raise ValueError('destination already exists')
    bound_images = _resolve_owner_pack_images(source, owner_pack_images) if owner_pack_images is not None else None
    if owner_pack_images is not None and destination.resolve().is_relative_to(owner_pack_images.pack_root.resolve(strict=True)):
        raise ValueError('파생 출력이 소유 팩 안에 있습니다. 원본을 보존하도록 소유 팩 밖의 새 경로를 destination으로 지정하세요.')
    if source.stat().st_size > LIMIT:
        raise ValueError('source exceeds pilot budget')
    original = source.read_bytes()
    if bound_images is not None:
        doc, _ = read_glb(original)
        uris = [image['uri'] for image in doc.get('images', []) if 'uri' in image]
        if any(not isinstance(uri, str) for uri in uris) or set(uris) != set(bound_images):
            raise ValueError('image_paths와 원본 GLB의 외부 이미지 URI 집합이 다릅니다. 누락되거나 사용하지 않는 매핑을 원본 URI 집합에 맞추세요.')

    def resolve_texture(uri: str) -> bytes:
        texture = (safe_file(source.parent, unquote(urlsplit(uri).path))
                   if bound_images is None else bound_images[uri])
        if texture.stat().st_size > 16 * 1024 * 1024:
            raise ValueError('texture too large')
        return texture.read_bytes()

    data, embedded = normalize_bytes(original, resolve_texture)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as f:
        f.write(data)
    report = {'sourceSha256': hashlib.sha256(original).hexdigest(),
              'normalizedSha256': sha256_file(destination), 'embeddedTextures': embedded,
              'geometryBytesPreserved': True, 'externalImageUrisRemaining': 0,
              'phase': 'normalized-not-reviewed', 'studioRuntimeVerified': False}
    if owner_pack_images is not None:
        report['ownerPackBinding'] = {
            'ownerPackId': owner_pack_images.owner_pack_id, 'sourceRelative': owner_pack_images.source_relative,
            'imagePaths': dict(owner_pack_images.image_paths), 'policy': 'exact-owner-pack-atlas-v1',
        }
    return report


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
