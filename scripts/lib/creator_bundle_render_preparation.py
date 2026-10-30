"""명시한 팩 내부 PNG만 원본을 바꾸지 않고 렌더 입력 바이트에 내장한다."""
from __future__ import annotations

import hashlib
import io
from pathlib import Path, PurePosixPath
import re
import sys

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))
import normalize_studio_asset_glb as normalizer
from studio_asset_curation import safe_file, sha256_file

KIND = "embed-pack-images-v1"
SHA = re.compile(r"[a-f0-9]{64}\Z")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_IMAGE_BYTES = 16 * 1024 * 1024
POLICY_SOURCE_SHA256 = sha256_file(Path(__file__))


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hash(value: object) -> bool:
    return isinstance(value, str) and bool(SHA.fullmatch(value))


def _code_hashes() -> dict:
    hashes = {"normalizerSha256": normalizer.NORMALIZER_SOURCE_SHA256,
              "preparationPolicySha256": POLICY_SOURCE_SHA256}
    if (sha256_file(Path(normalizer.__file__)) != hashes["normalizerSha256"]
            or sha256_file(Path(__file__)) != hashes["preparationPolicySha256"]):
        raise ValueError("준비 정책·정규화기 파일이 로드된 코드와 다릅니다. 프로세스를 다시 시작하세요.")
    return hashes


def _relative(value: object, suffix: str, *, parents: bool = False) -> PurePosixPath:
    if (not isinstance(value, str) or not value or len(value) > 1000
            or any(char in value for char in "\\%?#:")
            or any(ord(char) < 32 or ord(char) == 127 for char in value)):
        raise ValueError("준비 입력 경로는 URL·인코딩·제어 문자 없는 상대 경로여야 합니다.")
    path = PurePosixPath(value)
    if (path.is_absolute() or path.suffix.lower() != suffix
            or any(part in {"", "."} or (part == ".." and not parents) for part in value.split("/"))):
        raise ValueError("준비 입력 경로의 형식·확장자·상위 경로가 올바르지 않습니다.")
    if not parents and len(path.parts) < 3:
        raise ValueError("준비 입력 source에는 라이브러리의 분류·팩 경로가 필요합니다.")
    return path


def validate_preparation(value: object) -> None:
    """선택 설정의 optional 준비 계약을 파일 접근 없이 엄격히 검사한다."""
    if value is None:
        return
    if (not isinstance(value, dict) or set(value) != {"kind", "expectedSha256", "images"}
            or value.get("kind") != KIND or not _hash(value.get("expectedSha256"))):
        raise ValueError("sourcePreparation의 kind·expectedSha256·허용 필드를 확인하세요.")
    images = value["images"]
    if not isinstance(images, list) or not 1 <= len(images) <= 64:
        raise ValueError("sourcePreparation.images에는 1~64개의 PNG 승인이 필요합니다.")
    uris, sources = set(), set()
    for image in images:
        if not isinstance(image, dict) or set(image) != {"uri", "source", "sha256", "bytes"}:
            raise ValueError("준비 이미지의 uri·source·sha256·bytes 필드만 허용합니다.")
        _relative(image["uri"], ".png", parents=True)
        _relative(image["source"], ".png")
        if (not _hash(image["sha256"]) or type(image["bytes"]) is not int
                or not 0 < image["bytes"] <= MAX_IMAGE_BYTES):
            raise ValueError("준비 이미지 SHA-256 또는 바이트 수가 올바르지 않습니다.")
        if image["uri"] in uris or image["source"] in sources:
            raise ValueError("준비 이미지 URI 또는 승인 source가 중복됐습니다.")
        uris.add(image["uri"])
        sources.add(image["source"])


def _safe(root: Path, relative: str) -> Path:
    try:
        return safe_file(root, relative)
    except (OSError, ValueError) as error:
        raise ValueError("준비 입력의 실제 파일·팩 내부 경로·심볼릭 링크를 확인하세요: " + relative) from error


def _read_checked(root: Path, check: dict, maximum: int) -> tuple[Path, bytes]:
    path = _safe(root, check["source"])
    if path.stat().st_size > maximum or path.stat().st_size != check["bytes"]:
        raise ValueError("준비 입력의 실제 바이트 수가 승인 기록과 다릅니다: " + check["source"])
    data = path.read_bytes()
    if len(data) != check["bytes"] or _digest(data) != check["sha256"]:
        raise ValueError("준비 입력의 실제 SHA-256 또는 바이트 수가 승인 기록과 다릅니다: " + check["source"])
    return path, data


def _image_uris(document: dict) -> list[str]:
    images = document.get("images", [])
    if not isinstance(images, list) or any(not isinstance(image, dict) for image in images):
        raise ValueError("GLB images가 올바른 이미지 목록이 아닙니다.")
    approved_objects = {id(image) for image in images}

    def visit(value: object) -> None:
        if isinstance(value, dict):
            if "uri" in value and id(value) not in approved_objects:
                raise ValueError("준비 입력은 images 밖의 외부 URI를 허용하지 않습니다.")
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(document)
    uris = [image["uri"] for image in images if "uri" in image]
    for uri in uris:
        _relative(uri, ".png", parents=True)
    if len(uris) != len(set(uris)):
        raise ValueError("GLB 외부 이미지 URI가 중복돼 1:1 승인에 맞지 않습니다.")
    return uris


def _match_uri(source: Path, uri: str, approved: Path, pack: Path) -> None:
    candidate = source.parent
    for part in PurePosixPath(uri).parts:
        candidate = candidate.parent if part == ".." else candidate / part
        if not candidate.is_relative_to(pack) or candidate.is_symlink():
            raise ValueError("준비 이미지 URI가 팩 밖 또는 심볼릭 링크를 통과합니다.")
    try:
        resolved = candidate.resolve(strict=True)
    except OSError as error:
        raise ValueError("GLB 이미지 URI가 가리키는 팩 내부 파일을 찾을 수 없습니다.") from error
    if resolved != approved:
        raise ValueError("GLB 이미지 URI와 명시적으로 승인한 PNG source가 다릅니다.")


def _verify_png(data: bytes) -> None:
    from PIL import Image

    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("준비 이미지는 실제 PNG 바이트만 허용합니다.")
    try:
        with Image.open(io.BytesIO(data), formats=("PNG",)) as image:
            image.verify()
        with Image.open(io.BytesIO(data), formats=("PNG",)) as image:
            image.load()
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as error:
        raise ValueError("준비 PNG의 구조를 읽을 수 없습니다.") from error


def prepare_render_input(asset: dict, original_data: bytes, source: Path,
                         library_root: Path, pack_root: Path) -> dict:
    """승인 원본·PNG를 재검증하고 파일 쓰기 없이 준비 바이트와 증거를 반환한다."""
    preparation = asset.get("sourcePreparation")
    validate_preparation(preparation)
    original_sha = _digest(original_data)
    if preparation is None:
        return {"data": None, "sha256": original_sha, "fingerprint": None, "checks": []}
    code_hashes = _code_hashes()
    relative = _relative(asset.get("source"), ".glb")
    if not _hash(asset.get("sourceModelSha256")) or original_sha != asset["sourceModelSha256"]:
        raise ValueError("원본 sourceModelSha256이 준비 입력 바이트와 다릅니다.")
    root = Path(library_root).resolve(strict=True)
    pack = root.joinpath(*relative.parts[:2])
    model_check = {"source": relative.as_posix(), "sha256": original_sha, "bytes": len(original_data)}
    model, current = _read_checked(root, model_check, normalizer.LIMIT)
    supplied = Path(source).absolute()
    if (supplied not in {root / relative, Path(library_root).absolute() / relative}
            or Path(pack_root).resolve(strict=True) != pack or current != original_data):
        raise ValueError("준비 원본 source·팩 경로·실제 바이트가 선정 기록과 다릅니다.")
    document, _binary = normalizer.read_glb(original_data)
    uris = _image_uris(document)
    mappings = {image["uri"]: image for image in preparation["images"]}
    if set(uris) != set(mappings):
        raise ValueError("GLB의 모든 외부 이미지와 승인 mapping이 1:1로 일치해야 합니다. 누락·미사용 항목을 확인하세요.")
    textures, checks = {}, [model_check]
    for uri in uris:
        image = mappings[uri]
        if _relative(image["source"], ".png").parts[:2] != relative.parts[:2]:
            raise ValueError("준비 PNG source가 원본과 다른 팩에 있습니다.")
        approved, data = _read_checked(root, image, MAX_IMAGE_BYTES)
        if not approved.is_relative_to(pack):
            raise ValueError("준비 PNG source가 원본과 다른 팩에 있습니다.")
        _match_uri(model, uri, approved, pack)
        _verify_png(data)
        textures[uri] = data
        checks.append({key: image[key] for key in ("source", "sha256", "bytes")})
    data, embedded = normalizer.normalize_bytes(original_data, textures.__getitem__)
    prepared_sha = _digest(data)
    if prepared_sha != preparation["expectedSha256"]:
        raise ValueError("준비 GLB SHA-256이 expectedSha256과 다릅니다.")
    if embedded != [{key: mappings[uri][key] for key in ("uri", "sha256", "bytes")} for uri in uris]:
        raise ValueError("내장 PNG 기록이 명시 승인 목록과 다릅니다.")
    _code_hashes()
    fingerprint = {"kind": KIND, "originalModelSha256": original_sha, "preparedModelSha256": prepared_sha,
                   "images": [dict(mappings[uri]) for uri in sorted(uris)],
                   **code_hashes}
    return {"data": data, "sha256": prepared_sha, "fingerprint": fingerprint, "checks": checks}


def revalidate_preparation(plan: dict, library_root: Path) -> None:
    """prepare_render_input 반환값의 원본·PNG·정규화기 고정을 렌더 직전에 다시 확인한다."""
    if not isinstance(plan, dict) or set(plan) != {"data", "sha256", "fingerprint", "checks"} or not _hash(plan["sha256"]):
        raise ValueError("준비 재검증 계획의 필드가 올바르지 않습니다.")
    fingerprint, checks = plan["fingerprint"], plan["checks"]
    if fingerprint is None:
        if plan["data"] is not None or checks != []:
            raise ValueError("준비 없는 입력에는 파생 바이트나 재검증 파일을 추가할 수 없습니다.")
        return
    fields = {"kind", "originalModelSha256", "preparedModelSha256", "images", "normalizerSha256", "preparationPolicySha256"}
    if (not isinstance(fingerprint, dict) or set(fingerprint) != fields
            or not _hash(fingerprint["originalModelSha256"]) or not _hash(fingerprint["normalizerSha256"])
            or not _hash(fingerprint["preparationPolicySha256"])):
        raise ValueError("준비 fingerprint 계약이 올바르지 않습니다.")
    validate_preparation({"kind": fingerprint["kind"], "expectedSha256": fingerprint["preparedModelSha256"], "images": fingerprint["images"]})
    code_hashes = _code_hashes()
    if (not isinstance(plan["data"], bytes) or plan["sha256"] != fingerprint["preparedModelSha256"]
            or _digest(plan["data"]) != plan["sha256"]
            or any(fingerprint[key] != value for key, value in code_hashes.items())):
        raise ValueError("준비 바이트 또는 정규화기가 계획 이후 변경됐습니다.")
    if not isinstance(checks, list) or len(checks) != len(fingerprint["images"]) + 1:
        raise ValueError("준비 재검증 파일 목록이 누락됐습니다.")
    if any(not isinstance(check, dict) or set(check) != {"source", "sha256", "bytes"} for check in checks):
        raise ValueError("준비 재검증 파일의 허용 필드가 올바르지 않습니다.")
    model = checks[0]
    model_relative = _relative(model["source"], ".glb")
    if model["sha256"] != fingerprint["originalModelSha256"]:
        raise ValueError("준비 원본의 재검증 SHA-256이 다릅니다.")
    expected = [{key: image[key] for key in ("source", "sha256", "bytes")} for image in fingerprint["images"]]
    if sorted(checks[1:], key=lambda check: check["source"]) != sorted(expected, key=lambda check: check["source"]):
        raise ValueError("준비 PNG 재검증 목록이 fingerprint와 다릅니다.")
    root = Path(library_root).resolve(strict=True)
    for index, check in enumerate(checks):
        relative = _relative(check["source"], ".glb" if index == 0 else ".png")
        if (relative.parts[:2] != model_relative.parts[:2] or not _hash(check["sha256"])
                or type(check["bytes"]) is not int or check["bytes"] <= 0):
            raise ValueError("준비 재검증 파일의 팩·해시·크기가 올바르지 않습니다.")
        _read_checked(root, check, normalizer.LIMIT if index == 0 else MAX_IMAGE_BYTES)
