#!/usr/bin/env python3
"""권리·원본을 검증해 번들 소품을 로컬 렌더하고, 검수된 이미지만 공개한다."""

import argparse
from contextlib import contextmanager
import ctypes
import fcntl
import hashlib
import io
import json
import math
import os
import re
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SELECTION = REPO_ROOT / "config/creator-bundle-render-selection.json"
DEFAULT_OUTPUT = REPO_ROOT / "apps/web/public/assets/studio/bundle-renders-v1"
DEFAULT_LEDGER = REPO_ROOT / "config/creator-bundle-pack-rights.json"
BLENDER_SCRIPT = REPO_ROOT / "scripts/lib/render-creator-bundle-assets-blender.py"
CC0_DEED = "https://creativecommons.org/publicdomain/zero/1.0/"
ASSET_ID = re.compile(r"[a-z0-9-]{1,200}\Z")
SHA256 = re.compile(r"[a-f0-9]{64}\Z")
DEFAULT_CAMERA_DIRECTION = [1.6, -2.4, 1.7]
RIG_POLICY = "skinned-reference-21-v1"
UNPINNED = object()

sys.path.insert(0, str(REPO_ROOT / "scripts/lib"))
from creator_bundle_render_preparation import prepare_render_input, revalidate_preparation, validate_preparation


class RenderError(ValueError):
    """입력·권리·산출물 검증 실패다. 공개 파일을 바꾸기 전에 처리한다."""


def digest(data):
    return hashlib.sha256(data).hexdigest()


def text(value, field, maximum):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise RenderError(f"{field}: 비어 있거나 길이가 올바르지 않습니다.")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise RenderError(f"{field}: 제어 문자를 포함할 수 없습니다.")
    return value


def relative_source(value):
    text(value, "source", 1000)
    path = PurePosixPath(value)
    if path.is_absolute() or "\\" in value or re.match(r"^[A-Za-z]:", value):
        raise RenderError("source: 라이브러리 안의 상대 경로여야 합니다.")
    if any(part in ("", ".", "..") for part in value.split("/")) or len(path.parts) < 3:
        raise RenderError("source: 빈 경로·상위 경로 또는 팩 폴더 없는 경로입니다.")
    if path.suffix.lower() != ".glb":
        raise RenderError("source: GLB 파일만 렌더할 수 있습니다.")
    return path


def camera_direction(asset):
    value = asset.get("cameraDirection", DEFAULT_CAMERA_DIRECTION)
    if (not isinstance(value, list) or len(value) != 3
            or any(type(number) not in (int, float) or abs(number) > 10 or not math.isfinite(number) for number in value)
            or not any(value)):
        raise RenderError("cameraDirection은 절댓값 10 이하의 유한한 숫자 3개이며 영벡터가 아니어야 합니다.")
    return list(value)


def load_selection(path):
    selection = json.loads(Path(path).read_text(encoding="utf-8"))
    assets = selection.get("assets") if isinstance(selection, dict) else None
    if not isinstance(assets, list) or not 1 <= len(assets) <= 2400:
        raise RenderError("selection.assets는 1~2400개의 항목이어야 합니다.")
    seen = set()
    for asset in assets:
        if not isinstance(asset, dict) or not isinstance(asset.get("id"), str) or not ASSET_ID.fullmatch(asset["id"]):
            raise RenderError("에셋 id는 소문자·숫자·하이픈 1~200자여야 합니다.")
        if asset["id"] in seen:
            raise RenderError("에셋 id가 중복됐습니다: " + asset["id"])
        seen.add(asset["id"])
        for field, maximum in (("name", 160), ("packId", 200), ("catalogId", 200), ("selectionTerm", 80)):
            text(asset.get(field), field, maximum)
        relative_source(asset.get("source"))
        if not isinstance(asset.get("sourceModelSha256"), str) or not SHA256.fullmatch(asset["sourceModelSha256"]):
            raise RenderError("sourceModelSha256에 선정 시점 원본 SHA-256을 고정해야 합니다.")
        url = urlsplit(text(asset.get("sourceUrl"), "sourceUrl", 400))
        if url.scheme != "https" or url.hostname != "rg-poly.itch.io" or url.username or url.password or url.query or url.fragment or "/download/" in url.path:
            raise RenderError("sourceUrl은 공개 RG Poly 팩 페이지여야 합니다.")
        if "visualReviewed" in asset and not isinstance(asset["visualReviewed"], bool):
            raise RenderError("visualReviewed는 boolean이어야 합니다.")
        camera_direction(asset)
        if "rigPolicy" in asset and asset["rigPolicy"] != RIG_POLICY:
            raise RenderError("rigPolicy는 skinned-reference-21-v1만 허용합니다.")
        if "sourcePreparation" in asset:
            validate_preparation(asset["sourcePreparation"])
        bindings = asset.get("textureBindings", [])
        if not isinstance(bindings, list) or len(bindings) > 64:
            raise RenderError("textureBindings는 64개 이하의 배열이어야 합니다.")
        names = set()
        for binding in bindings:
            if not isinstance(binding, dict):
                raise RenderError("textureBindings 항목은 객체여야 합니다.")
            name = text(binding.get("materialName"), "materialName", 200)
            if name in names:
                raise RenderError("같은 materialName을 두 번 바인딩할 수 없습니다.")
            names.add(name)
            relative_source_image(binding.get("source"))
            if not isinstance(binding.get("sha256"), str) or not SHA256.fullmatch(binding["sha256"]):
                raise RenderError("텍스처 바인딩에 SHA-256이 필요합니다.")
    return assets


def relative_source_image(value):
    text(value, "texture source", 1000)
    if not value.endswith(".png"):
        raise RenderError("바인딩 텍스처는 PNG 파일이어야 합니다.")
    # 이미지도 모델과 같은 정규형 상대 경로 규칙을 쓴다.
    relative_source(value[:-4] + ".glb")
    return PurePosixPath(value)


def load_rights(assets, ledger_path, node="node"):
    # 원장의 순수 판정 함수를 그대로 사용한다. Python에 허용 목록·증빙 규칙을 복제하지 않는다.
    code = r"""
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const api = await import(pathToFileURL(process.argv[1]).href);
const ledger = api.loadPackRightsLedger(process.argv[2]);
const problems = api.validatePackRightsLedger(ledger);
if (problems.length) throw new Error(problems.join('\n'));
const assets = JSON.parse(readFileSync(0, 'utf8'));
const result = {};
for (const asset of assets) {
  const entry = ledger.packs.find(pack => pack.id === asset.packId);
  const found = api.findPackRightsByCatalogId(ledger, asset.catalogId);
  if (!entry || found !== entry) throw new Error(asset.id + ': 팩 귀속이 일치하지 않습니다.');
  const decision = api.evaluateServeDecision(ledger, {catalogIds: entry.catalogIds, title: entry.title, creator: entry.creator});
  if (!decision.serve) throw new Error(asset.id + ': 팩이 hold이거나 증빙이 부족합니다.');
  // 서비스 이용 조건을 추가하는 것이 아니라, 기록한 출처 URL이 실제 이 팩의 증빙인지 대조한다.
  if (!entry.evidence.some(evidence => evidence.kind === 'itch-page-capture' && evidence.url === asset.sourceUrl)) {
    throw new Error(asset.id + ': 출처 URL이 이 팩의 공식 라이선스 캡처와 다릅니다.');
  }
  const rights = {ledgerPackId: entry.id, ...api.packRightsProjection(entry)};
  if (rights.status !== 'public-domain' || rights.licenseName !== 'CC0-1.0' || !rights.commercialUse || rights.attributionRequired) {
    throw new Error(asset.id + ': 이 렌더 작업은 확인된 CC0 팩만 받습니다.');
  }
  result[asset.id] = {rights, provider: entry.creator, libraryPacks: entry.libraryPacks};
}
process.stdout.write(JSON.stringify(result));
"""
    result = subprocess.run(
        [node, "--input-type=module", "-e", code,
         str(REPO_ROOT / "scripts/lib/creator-bundle-pack-rights.mjs"), str(ledger_path)],
        input=json.dumps(assets), text=True, capture_output=True, check=False,
    )
    if result.returncode != 0:
        raise RenderError("팩별 권리 검증에 실패했습니다: " + result.stderr.strip())
    return json.loads(result.stdout)


def validate_glb(data):
    if len(data) < 20 or data[:4] != b"glTF":
        raise RenderError("GLB magic 또는 헤더가 올바르지 않습니다.")
    version, size = struct.unpack_from("<II", data, 4)
    if version != 2 or size != len(data):
        raise RenderError("GLB 버전·전체 바이트 길이가 올바르지 않습니다.")
    offset = 12
    document = None
    while offset < len(data):
        if offset + 8 > len(data):
            raise RenderError("GLB 청크 헤더가 잘렸습니다.")
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        if length % 4 != 0 or offset + length > len(data):
            raise RenderError("GLB 청크 길이가 올바르지 않습니다.")
        if document is None:
            if kind != 0x4E4F534A:
                raise RenderError("GLB 첫 청크는 JSON이어야 합니다.")
            document = json.loads(data[offset:offset + length].decode("utf-8").rstrip("\x00 \t\r\n"))
        offset += length
    if not isinstance(document, dict) or not isinstance(document.get("asset"), dict) or document["asset"].get("version") != "2.0":
        raise RenderError("GLB JSON asset.version이 올바르지 않습니다.")
    def check_uris(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "uri" and (not isinstance(child, str) or not child.startswith("data:")):
                    raise RenderError("외부 URI를 가진 GLB는 렌더할 수 없습니다.")
                check_uris(child)
        elif isinstance(value, list):
            for child in value:
                check_uris(child)
    check_uris(document)


def plan_assets(assets, library_root, rights):
    root = Path(library_root).resolve(strict=True)
    if not root.is_dir():
        raise RenderError("library-root가 디렉터리가 아닙니다.")
    planned = []
    for asset in assets:
        relative = relative_source(asset["source"])
        if relative.parts[1] not in rights[asset["id"]]["libraryPacks"]:
            raise RenderError(asset["id"] + ": 원장에 속하지 않는 팩 폴더입니다.")
        pack_root = (root / relative.parts[0] / relative.parts[1]).resolve(strict=True)
        source = (root / relative).resolve(strict=True)
        if not pack_root.is_relative_to(root) or not source.is_relative_to(pack_root) or not source.is_file():
            raise RenderError(asset["id"] + ": 심볼릭 링크 또는 원본 경로가 팩 밖으로 나갑니다.")
        data = source.read_bytes()
        if digest(data) != asset["sourceModelSha256"]:
            raise RenderError(asset["id"] + ": 원본 SHA-256이 선정 기록과 다릅니다.")
        preparation = prepare_render_input(asset, data, source, root, pack_root)
        validate_glb(data if preparation["data"] is None else preparation["data"])
        bindings = []
        for binding in asset.get("textureBindings", []):
            image_relative = relative_source_image(binding["source"])
            if image_relative.parts[1] not in rights[asset["id"]]["libraryPacks"]:
                raise RenderError(asset["id"] + ": 텍스처가 다른 팩 폴더에 있습니다.")
            image_pack = (root / image_relative.parts[0] / image_relative.parts[1]).resolve(strict=True)
            image_source = (root / image_relative).resolve(strict=True)
            if not image_pack.is_relative_to(root) or not image_source.is_relative_to(image_pack) or not image_source.is_file():
                raise RenderError(asset["id"] + ": 텍스처 경로가 팩 밖으로 나갑니다.")
            texture_bytes = image_source.read_bytes()
            if digest(texture_bytes) != binding["sha256"]:
                raise RenderError(asset["id"] + ": 텍스처 SHA-256이 선정 기록과 다릅니다.")
            if not texture_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RenderError(asset["id"] + ": 텍스처 MIME이 PNG가 아닙니다.")
            from PIL import Image
            with Image.open(io.BytesIO(texture_bytes)) as image:
                image.verify()
            bindings.append({**binding, "source": str(image_source)})
        plan = {**asset, "resolvedSource": str(source), "resolvedTextureBindings": bindings,
                "renderPreparation": preparation, "rightsInfo": rights[asset["id"]]}
        fingerprint = render_input_fingerprint(plan)
        if fingerprint is not None:
            plan["validatedRenderInputFingerprint"] = fingerprint
        planned.append(plan)
    return planned


def binding_fingerprint(asset):
    return sorted(({"materialName": binding["materialName"], "sha256": binding["sha256"]}
                   for binding in asset.get("textureBindings", [])), key=lambda value: value["materialName"])


def render_input_fingerprint(asset):
    if not any(key in asset for key in ("sourcePreparation", "cameraDirection", "rigPolicy")):
        return None
    preparation = asset.get("renderPreparation")
    if "sourcePreparation" in asset and preparation is None:
        raise RenderError(asset["id"] + ": 정규화 입력을 먼저 검증해야 합니다.")
    fingerprint = {"schema": "toonstudio.creator-bundle-render-input.v2",
                   "sourceModelSha256": asset["sourceModelSha256"],
                   "renderModelSha256": preparation["sha256"] if preparation else asset["sourceModelSha256"],
                   "sourcePreparation": json.loads(json.dumps(preparation["fingerprint"])) if preparation else None,
                   "cameraDirection": camera_direction(asset), "rigPolicy": asset.get("rigPolicy"),
                   "rendererSha256": digest(BLENDER_SCRIPT.read_bytes())}
    verified = asset.get("validatedRenderInputFingerprint")
    if verified is not None and verified != fingerprint:
        raise RenderError(asset["id"] + ": 검증 이후 렌더 입력 지문이 바뀌었습니다.")
    return verified if verified is not None else fingerprint


def make_render_proof(assets, png_root):
    return {"schema": "toonstudio.creator-bundle-render-proof.v1", "assets": [
        {"id": asset["id"], "sourceModelSha256": asset.get("renderPreparation", {}).get("sha256", asset["sourceModelSha256"]),
         "textureBindings": binding_fingerprint(asset), "pngSha256": digest((png_root / (asset["id"] + ".png")).read_bytes()),
         **({"renderInputFingerprint": render_input_fingerprint(asset)} if render_input_fingerprint(asset) else {})}
        for asset in assets]}


def verify_render_proof(assets, png_root):
    proof = json.loads((png_root / "render-proof.json").read_text(encoding="utf-8"))
    if not isinstance(proof, dict) or proof.get("schema") != "toonstudio.creator-bundle-render-proof.v1" or not isinstance(proof.get("assets"), list):
        raise RenderError("재사용 렌더의 proof JSON 형식이 올바르지 않습니다.")
    entries = proof["assets"]
    if any(not isinstance(entry, dict) or not isinstance(entry.get("id"), str) for entry in entries):
        raise RenderError("재사용 렌더 proof 항목에 id가 없습니다.")
    by_id = {entry["id"]: entry for entry in entries}
    if len(by_id) != len(entries):
        raise RenderError("재사용 렌더 proof에 id가 중복됐습니다.")
    verified = {}
    for asset in assets:
        entry = by_id.get(asset["id"])
        png = png_root / (asset["id"] + ".png")
        if png.is_symlink() or not png.is_file():
            raise RenderError(asset["id"] + ": 재사용 PNG가 없거나 심볼릭 링크입니다.")
        render_sha = asset.get("renderPreparation", {}).get("sha256", asset["sourceModelSha256"])
        if not entry or entry.get("sourceModelSha256") != render_sha or entry.get("textureBindings") != binding_fingerprint(asset):
            raise RenderError(asset["id"] + ": 재사용 렌더와 원본·텍스처 바인딩 기록이 다릅니다.")
        if isinstance(entry.get("renderInputFingerprint"), dict):
            camera_direction(entry["renderInputFingerprint"])
        if entry.get("renderInputFingerprint") != render_input_fingerprint(asset):
            raise RenderError(asset["id"] + ": 렌더 입력·정규화·카메라·리그·renderer 지문이 다릅니다.")
        if asset.get("rigPolicy") == RIG_POLICY:
            checks = entry.get("rigChecks")
            if (not isinstance(checks, dict) or any(type(checks.get(key)) is not int or checks[key] != value
                                                  for key, value in (("bodyMeshes", 1), ("bones", 21), ("vertexGroups", 21)))
                    or not isinstance(checks.get("excludedCustomShapes"), list)
                    or any(not isinstance(name, str) for name in checks["excludedCustomShapes"])):
                raise RenderError(asset["id"] + ": 실제 캐릭터 리그 검증 기록이 없습니다.")
        if entry.get("pngSha256") != digest(png.read_bytes()):
            raise RenderError(asset["id"] + ": 재사용 PNG 해시가 proof와 다릅니다.")
        verified[asset["id"]] = entry["pngSha256"]
    return verified


def verify_image(path, expected_sha256=None):
    from PIL import Image
    raw = Path(path).read_bytes()
    if expected_sha256 is not None and digest(raw) != expected_sha256:
        raise RenderError(str(path) + ": 인코딩할 PNG 해시가 검증된 proof와 다릅니다.")
    # 해시를 확인한 바로 그 바이트를 디코딩한다. 별도 open 사이 파일 교체를 허용하지 않는다.
    with Image.open(io.BytesIO(raw)) as source:
        if source.format != "PNG" or source.size != (1536, 1536) or source.mode != "RGBA":
            raise RenderError(str(path) + ": RGBA PNG 1536×1536 규격이 아닙니다.")
        image = source.copy()
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box is None or alpha.getextrema()[0] != 0:
        raise RenderError(str(path) + ": 빈 이미지이거나 투명 배경이 없습니다.")
    if box[0] < 2 or box[1] < 2 or box[2] > 1534 or box[3] > 1534:
        raise RenderError(str(path) + ": 소품이 이미지 경계에 닿아 잘릴 수 있습니다.")
    return image


def encode_asset(asset, png_root, pack_root, reviewed, png_sha256):
    from PIL import Image
    png_path = Path(png_root) / (asset["id"] + ".png")
    if png_path.is_symlink() or not png_path.is_file():
        raise RenderError(asset["id"] + ": 렌더 PNG가 없거나 심볼릭 링크입니다.")
    image = verify_image(png_path, png_sha256)
    relative = Path("assets") / asset["id"]
    target = pack_root / relative
    target.mkdir(parents=True, exist_ok=True)
    # 압축 탐색 시간만 줄인다. 픽셀·알파·해상도는 무손실 왕복 대조로 그대로 보존한다.
    image.save(target / "prop.webp", "WEBP", lossless=True, method=1, exact=True)
    image.resize((384, 384), Image.Resampling.LANCZOS).save(target / "thumbnail.webp", "WEBP", lossless=True, method=1, exact=True)
    raw = (target / "prop.webp").read_bytes()
    with Image.open(target / "prop.webp") as decoded:
        if decoded.size != image.size or decoded.convert("RGBA").tobytes() != image.tobytes():
            raise RenderError(asset["id"] + ": WebP 무손실 왕복 검증에 실패했습니다.")
    result = {
        "id": asset["id"], "name": asset["name"], "kind": "prop-image", "category": "rendered-prop",
        "path": (relative / "prop.webp").as_posix(), "previewPath": (relative / "thumbnail.webp").as_posix(),
        "width": 1536, "height": 1536, "bytes": len(raw), "sha256": digest(raw),
        "derivedFrom": asset["id"], "derivedFromPack": asset["catalogId"],
        "sourceModelSha256": asset.get("renderPreparation", {}).get("sha256", asset["sourceModelSha256"]), "renderResolution": [1536, 1536],
        "renderVariants": ["color"], "style": "stylized-low-poly", "selectionTerm": asset["selectionTerm"],
        "visualReviewed": reviewed, "studioRuntimeVerified": False,
        "curationStatus": "visual-reviewed" if reviewed else "pending-visual-review",
        "technicalChecks": ["source-GLB-checksum-bound", "native-1536px-render", "transparent-alpha", "unclipped-silhouette", "lossless-WebP-roundtrip"],
        "rights": asset["rightsInfo"]["rights"],
        "license": {"id": "CC0-1.0", "url": CC0_DEED, "provider": asset["rightsInfo"]["provider"],
                    "sourceUrl": asset["sourceUrl"], "commercialUse": True, "redistributionAllowed": True,
                    "inServiceOnly": True, "checkedOn": "2026-10-28"},
    }
    if asset.get("textureBindings"):
        result["sourceTextureSha256s"] = sorted({binding["sha256"] for binding in asset["textureBindings"]})
    fingerprint = render_input_fingerprint(asset)
    if fingerprint:
        result["sourceOriginalModelSha256"] = asset["sourceModelSha256"]
        result["renderInputFingerprint"] = fingerprint
    return result


def check_append_only(assets, manifest):
    existing = {asset["id"] for asset in manifest["assets"]}
    collisions = existing.intersection(asset["id"] for asset in assets)
    if collisions:
        raise RenderError("append-only: 기존 슬롯과 선정 id가 겹칩니다: " + ", ".join(sorted(collisions)))


def render_jobs(assets, temporary):
    jobs = []
    for asset in assets:
        source = asset["resolvedSource"]
        preparation = asset["renderPreparation"]
        if preparation["data"] is not None:
            prepared = temporary / "prepared" / (asset["id"] + ".glb")
            prepared.parent.mkdir(exist_ok=True)
            with prepared.open("xb") as stream:
                stream.write(preparation["data"])
            if digest(prepared.read_bytes()) != preparation["sha256"]:
                raise RenderError(asset["id"] + ": 준비된 렌더 입력 해시가 다릅니다.")
            source = str(prepared)
        job = {"id": asset["id"], "source": source, "textureBindings": asset["resolvedTextureBindings"]}
        fingerprint = render_input_fingerprint(asset)
        if fingerprint:
            job.update(renderInputFingerprint=fingerprint, sourceOriginal=asset["resolvedSource"],
                       cameraDirection=fingerprint["cameraDirection"])
            if "rigPolicy" in asset:
                job["rigPolicy"] = asset["rigPolicy"]
        jobs.append(job)
    return jobs


def verify_pack(pack_root, ledger_path, node):
    result = subprocess.run(
        [node, str(REPO_ROOT / "scripts/sync-creator-bundle-render-rights.mjs"), "--check",
         "--pack-rights", str(ledger_path), "--pack-dir", str(pack_root), "--files", "fs", "--json"],
        text=True, capture_output=True, check=False,
    )
    if result.returncode != 0:
        raise RenderError("렌더 매니페스트 권리·파일 검증에 실패했습니다: " + result.stdout.strip() + result.stderr.strip())


def copy_existing_pack(source, destination):
    if source.is_symlink():
        raise RenderError("출력 팩은 심볼릭 링크일 수 없습니다.")
    for path in source.rglob("*"):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise RenderError("기존 출력 팩에 일반 파일이 아닌 항목이 있습니다.")
    shutil.copytree(source, destination)


def pack_snapshot(root):
    try:
        mode = root.lstat().st_mode
    except FileNotFoundError:
        return None
    if not stat.S_ISDIR(mode):
        raise RenderError("게시 팩은 심볼릭 링크 없는 디렉터리여야 합니다.")
    entries = [(".", stat.S_IMODE(mode), "directory")]
    for path in sorted(root.rglob("*")):
        mode = path.lstat().st_mode
        if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
            raise RenderError("게시 팩에는 일반 파일·디렉터리만 허용합니다.")
        entries.append((path.relative_to(root).as_posix(), stat.S_IMODE(mode),
                        "directory" if stat.S_ISDIR(mode) else digest(path.read_bytes())))
    return digest(json.dumps(entries, ensure_ascii=False, separators=(",", ":")).encode())


@contextmanager
def publication_lock(output):
    # output의 유무와 무관한 lock identity를 쓴다. lock 파일은 unlink하지 않는다.
    directory = Path(tempfile.gettempdir()) / ("toonstudio-bundle-publish-locks-" + str(os.getuid()))
    directory.mkdir(mode=0o700, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise RenderError("게시 잠금 디렉터리의 소유자·권한이 올바르지 않습니다.")
    key = digest(os.fsencode(output.parent.resolve() / output.name))
    descriptor = os.open(directory / key, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "r+b") as lock:
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise RenderError("게시 잠금 파일의 소유자·권한이 올바르지 않습니다.")
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RenderError("다른 게시 작업이 진행 중입니다. 종료 상태를 확인한 뒤 다시 실행하세요.") from error
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def rename_no_replace(source, destination):
    # 빈 디렉터리도 덮어쓰지 않는 커널 연산만 허용한다. rename/replace로 후퇴하지 않는다.
    library = ctypes.CDLL(None, use_errno=True)
    if sys.platform == "darwin" and hasattr(library, "renamex_np"):
        function = library.renamex_np
        function.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        arguments = (os.fsencode(source), os.fsencode(destination), 0x00000004)
    elif sys.platform.startswith("linux") and hasattr(library, "renameat2"):
        function = library.renameat2
        function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        arguments = (-100, os.fsencode(source), -100, os.fsencode(destination), 1)
    else:
        raise RenderError("이 플랫폼은 덮어쓰기 없는 원자적 게시 이동을 지원하지 않습니다.")
    function.restype = ctypes.c_int
    if function(*arguments) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(destination))


def publish_pack(source, output, *, expected_snapshot=UNPINNED):
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".bundle-publish-", dir=output.parent))
    ready, backup = temporary / "ready", temporary / "previous"
    published = recovery_required = False
    try:
        source_snapshot = pack_snapshot(source)
        shutil.copytree(source, ready)
        if pack_snapshot(ready) != source_snapshot:
            raise RenderError("게시 준비 팩이 복사 중 변경됐습니다.")
        ready_identity = (ready.lstat().st_dev, ready.lstat().st_ino)
        with publication_lock(output):
            interrupted = None
            try:
                if pack_snapshot(output) is not None:
                    rename_no_replace(output, backup)
                if expected_snapshot is not UNPINNED and pack_snapshot(backup) != expected_snapshot:
                    raise RenderError("게시 팩이 stage 복사 이후 변경됐습니다. 새 게시를 중단합니다.")
                rename_no_replace(ready, output)
                if pack_snapshot(output) != source_snapshot:
                    raise RenderError("게시 팩이 설치 도중 변경됐습니다.")
                published = True
            except BaseException as error:
                try:
                    if os.path.lexists(output):
                        info = output.lstat()
                        if (info.st_dev, info.st_ino) == ready_identity:
                            interrupted = temporary / "interrupted"
                            rename_no_replace(output, interrupted)
                            recovery_required = True
                            info = interrupted.lstat()
                            if (info.st_dev, info.st_ino) != ready_identity:
                                rename_no_replace(interrupted, output)
                                raise RenderError("복원 중 다른 게시자의 팩이 감지됐습니다.")
                    if os.path.lexists(backup):
                        rename_no_replace(backup, output)
                except BaseException:
                    recovery_required = True
                    saved = "이전 팩을 보존했습니다: " + str(backup) if os.path.lexists(backup) else "복구 자료를 보존했습니다: " + str(temporary)
                    raise RenderError("게시 복원이 다른 output과 충돌했습니다. " + saved) from error
                if interrupted is not None and os.path.lexists(interrupted):
                    raise RenderError("게시를 중단하고 이전 상태를 복원했습니다. 설치본을 보존했습니다: " + str(interrupted)) from error
                raise
    finally:
        # 복원이 막힌 backup은 자동 정리하지 않는다. 다른 게시자의 output도 건드리지 않는다.
        if not recovery_required and (published or not os.path.lexists(backup)):
            shutil.rmtree(temporary)


def publish_local_evidence(source, work, proof_bytes):
    # 같은 work-dir를 쓰는 실행도 pack과 proof를 서로 다른 순서로 섞지 못하게 한다.
    with publication_lock(work / "run-evidence"):
        proof_stage = Path(tempfile.mkdtemp(prefix=".render-proof-", dir=work))
        previous, current = proof_stage / "previous-proof.json", work / "render-proof.json"
        complete = False
        try:
            proof_copy = proof_stage / "render-proof.json"
            proof_copy.write_bytes(proof_bytes)
            if os.path.lexists(current):
                if not stat.S_ISREG(current.lstat().st_mode):
                    raise RenderError("로컬 proof는 일반 파일이어야 합니다.")
                rename_no_replace(current, previous)
            publish_pack(source, work / "pack")
            rename_no_replace(proof_copy, current)
            complete = True
        except BaseException as error:
            if os.path.lexists(previous):
                raise RenderError("로컬 증거 게시에 실패했습니다. 옛 proof를 새 팩에 연결하지 않고 보존했습니다: " + str(previous)) from error
            raise
        finally:
            if complete or not os.path.lexists(previous):
                shutil.rmtree(proof_stage)


def run(args):
    assets = load_selection(args.selection)
    rights = load_rights(assets, args.pack_rights, args.node)
    planned = plan_assets(assets, args.library_root, rights)
    output = Path(args.output_root).absolute()
    if output.is_symlink():
        raise RenderError("output-root는 심볼릭 링크일 수 없습니다.")
    if getattr(args, "append_only", False) and output.exists():
        check_append_only(planned, json.loads((output / "manifest.json").read_text(encoding="utf-8")))
    work = Path(args.work_dir).resolve()
    public = (REPO_ROOT / "apps/web/public").resolve()
    if work.is_relative_to(public) or work.is_relative_to(output.resolve()) or output.resolve().is_relative_to(work):
        raise RenderError("work-dir는 공개 폴더 밖에서 output-root와 겹치지 않아야 합니다.")
    selected = [asset for asset in planned if asset.get("visualReviewed") is True] if args.publish else planned
    if args.publish and not selected:
        raise RenderError("publish에는 visualReviewed=true로 검수된 항목이 필요합니다.")
    if args.dry_run:
        return {"selected": len(planned), "publishEligible": sum(asset.get("visualReviewed") is True for asset in planned), "dryRun": True, "published": False}
    work.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="render-job-", dir=work) as temporary:
        temporary = Path(temporary)
        png_root = Path(args.reuse_renders).resolve(strict=True) if args.reuse_renders else temporary / "png"
        if not args.reuse_renders:
            png_root.mkdir()
            jobs = temporary / "jobs.json"
            jobs.write_text(json.dumps(render_jobs(selected, temporary)), encoding="utf-8")
            result = subprocess.run([args.blender, "--background", "--factory-startup", "--python-exit-code", "42",
                                     "--python", str(BLENDER_SCRIPT), "--", str(jobs), str(png_root)], check=False)
            if result.returncode != 0:
                raise RenderError("Blender 렌더가 실패했습니다. 공개 팩은 변경하지 않았습니다.")
            # 신규 옵션의 proof는 실제 helper가 쓴 것을 검증한다. host가 지문을 만들어 덮어쓰지 않는다.
            if not any(render_input_fingerprint(asset) for asset in selected):
                (png_root / "render-proof.json").write_text(json.dumps(make_render_proof(selected, png_root), ensure_ascii=False), encoding="utf-8")
        proof_bytes = (png_root / "render-proof.json").read_bytes()
        verified_pngs = verify_render_proof(selected, png_root)
        if (png_root / "render-proof.json").read_bytes() != proof_bytes:
            raise RenderError("검증 도중 렌더 proof가 바뀌었습니다.")
        stage = temporary / "pack"
        with publication_lock(output):
            baseline_snapshot = pack_snapshot(output)
            if baseline_snapshot is not None:
                copy_existing_pack(output, stage)
                if pack_snapshot(stage) != baseline_snapshot:
                    raise RenderError("게시 팩이 stage 복사 도중 변경됐습니다.")
                manifest = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
            else:
                stage.mkdir()
                manifest = {"schema": "toonstudio.asset-delivery.v1", "pack": {"id": "bundle-renders-v1", "inServiceOnly": True, "downloadable": False}, "assets": []}
        if getattr(args, "append_only", False):
            check_append_only(planned, manifest)
        replacements = {}
        for asset in selected:
            # 실제 렌더/재사용 뒤 원본이 바뀌었으면 결괏값을 공개하지 않는다.
            if digest(Path(asset["resolvedSource"]).read_bytes()) != asset["sourceModelSha256"]:
                raise RenderError(asset["id"] + ": 렌더 중 원본 해시가 바뀌었습니다.")
            revalidate_preparation(asset["renderPreparation"], args.library_root)
            for binding in asset["resolvedTextureBindings"]:
                if digest(Path(binding["source"]).read_bytes()) != binding["sha256"]:
                    raise RenderError(asset["id"] + ": 렌더 중 텍스처 해시가 바뀌었습니다.")
            replacements[asset["id"]] = encode_asset(asset, png_root, stage, args.publish, verified_pngs[asset["id"]])
        drafts = {asset["id"] for asset in manifest["assets"] if str(asset.get("curationStatus", "")).startswith("draft")}
        if drafts.intersection(replacements):
            raise RenderError("기존 초안 슬롯과 선정 id가 겹칩니다. 초안은 별도로 보존해야 합니다.")
        manifest["assets"] = [asset for asset in manifest["assets"] if asset["id"] not in replacements] + list(replacements.values())
        manifest["pack"]["status"] = "visual-reviewed" if args.publish else "pending-visual-review"
        manifest["pack"]["note"] = "확인된 CC0 모델의 렌더 이미지 전용 팩. 원본 GLB·텍스처는 포함하지 않는다."
        (stage / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")), encoding="utf-8")
        verify_pack(stage, args.pack_rights, args.node)
        for asset in selected:
            render_input_fingerprint(asset)
        local_pack = work / "pack"
        publish_local_evidence(stage, work, proof_bytes)
        if args.publish:
            verify_pack(stage, args.pack_rights, args.node)
            for asset in selected:
                render_input_fingerprint(asset)
            publish_pack(stage, output, expected_snapshot=baseline_snapshot if getattr(args, "append_only", False) else UNPINNED)
    return {"selected": len(planned), "rendered": len(selected), "localPack": str(work / "pack"), "published": args.publish}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library-root", required=True, type=Path)
    parser.add_argument("--selection", type=Path, default=DEFAULT_SELECTION)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--work-dir", type=Path, default=Path(tempfile.gettempdir()) / "toonstudio-creator-bundle-renders")
    parser.add_argument("--pack-rights", type=Path, default=DEFAULT_LEDGER)
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--node", default="node")
    parser.add_argument("--reuse-renders", type=Path, help="같은 선정 작업의 기존 PNG를 재사용할 폴더")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--append-only", action="store_true", help="기존 완성·초안 슬롯과 겹치는 id를 렌더 전에 거부한다")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(run(args), ensure_ascii=False))
        return 0
    except (RenderError, OSError, ValueError, KeyError, ImportError) as error:
        print("번들 렌더 실패: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
