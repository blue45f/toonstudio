#!/usr/bin/env python3
"""검증된 모델로 완성 배경을 만들고 전수 검수 후에만 2D 카탈로그에 공개한다."""
import argparse
import importlib.util
import io
import json
import math
import struct
import subprocess
import tempfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("bundle_props", Path(__file__).with_name("render-creator-bundle-assets.py"))
PROPS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROPS)
ROOT = PROPS.REPO_ROOT
DEFAULT_RECIPES = ROOT / "config/creator-bundle-scene-recipes.json"
DEFAULT_OUTPUT = ROOT / "apps/web/public/assets/studio/bundle-scenes-v1"


def vector(value, field, count=3, maximum=200):
    if not isinstance(value, list) or len(value) != count or any(
        isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or abs(n) > maximum for n in value
    ):
        raise PROPS.RenderError(field + ": 유한한 좌표·색상 배열이어야 합니다.")
    return value


def plan_recipes(document, sources):
    recipes = document.get("recipes") if isinstance(document, dict) else None
    if not isinstance(document, dict) or document.get("schema") != "toonstudio.creator-bundle-scenes.v1" or not isinstance(recipes, list) or not 1 <= len(recipes) <= 16:
        raise PROPS.RenderError("장면 레시피는 명시된 스키마의 1~16개 배열이어야 합니다.")
    by_id = {asset["id"]: asset for asset in sources}
    seen = set()
    result = []
    for recipe in recipes:
        if not isinstance(recipe, dict):
            raise PROPS.RenderError("장면 레시피 항목은 객체여야 합니다.")
        ident = recipe.get("id")
        if not isinstance(ident, str) or not PROPS.ASSET_ID.fullmatch(ident) or ident in seen:
            raise PROPS.RenderError("장면 id가 잘못되었거나 중복됐습니다.")
        seen.add(ident)
        PROPS.text(recipe.get("name"), "장면 이름", 160)
        if recipe.get("genre") not in ["daily", "fantasy", "romance", "sf", "공포"] or recipe.get("environment") not in ["실내", "실외"] or recipe.get("timeOfDay") not in ["낮", "노을", "밤"]:
            raise PROPS.RenderError("장면 장르·환경·시간 분류가 올바르지 않습니다.")
        if recipe.get("architecture") not in ["garden-path", "stone-study", "blue-arena"] or not isinstance(recipe.get("visualReviewed"), bool):
            raise PROPS.RenderError("장면 건축 또는 검수 상태가 올바르지 않습니다.")
        for field in ["groundColor", "skyColor"]:
            if any(n < 0 or n > 1 for n in vector(recipe.get(field), field, 4, 1)):
                raise PROPS.RenderError("색상 범위는 0~1입니다.")
        camera = recipe.get("camera", {})
        if not isinstance(camera, dict):
            raise PROPS.RenderError("장면 카메라는 객체여야 합니다.")
        location = vector(camera.get("location"), "camera.location")
        target = vector(camera.get("target"), "camera.target")
        if sum((a - b) ** 2 for a, b in zip(location, target)) < 1 or not isinstance(camera.get("lens"), (float, int)) or isinstance(camera.get("lens"), bool) or not 18 <= camera["lens"] <= 100:
            raise PROPS.RenderError("카메라 거리 또는 초점거리가 올바르지 않습니다.")
        models = recipe.get("models")
        if not isinstance(models, list) or not 2 <= len(models) <= 64:
            raise PROPS.RenderError("완성 장면은 2~64개의 검증된 모델이 필요합니다.")
        resolved = []
        pack_ids = set()
        for model in models:
            if not isinstance(model, dict):
                raise PROPS.RenderError("장면 모델 항목은 객체여야 합니다.")
            source = by_id.get(model.get("assetId"))
            if source is None or source.get("visualReviewed") is not True:
                raise PROPS.RenderError("장면 모델은 검수된 선택 기록을 참조해야 합니다.")
            if source.get("resolvedTextureBindings"):
                raise PROPS.RenderError("장면은 현재 자기완결 재질 GLB만 지원합니다.")
            height = model.get("extent")
            angle = model.get("rotationZ")
            if isinstance(height, bool) or not isinstance(height, (float, int)) or not math.isfinite(height) or not 0.05 <= height <= 30:
                raise PROPS.RenderError("모델 최대 폭은 0.05~30 범위여야 합니다.")
            if isinstance(angle, bool) or not isinstance(angle, (float, int)) or not math.isfinite(angle) or abs(angle) > 360:
                raise PROPS.RenderError("모델 회전이 올바르지 않습니다.")
            vector(model.get("position"), "model.position")
            pack_ids.add(source["packId"])
            resolved.append({**model, "source": source["resolvedSource"], "sourceModelSha256": source["sourceModelSha256"]})
        if len(pack_ids) != 1:
            raise PROPS.RenderError("현재 장면은 출처가 한 팩인 조합만 지원합니다.")
        primary = by_id[models[0]["assetId"]]
        render_input = {key: recipe[key] for key in recipe if key not in ["visualReviewed", "reviewMethod"]}
        render_input["sources"] = [{"assetId": model["assetId"], "sha256": model["sourceModelSha256"]} for model in resolved]
        render_input["rendererSha256"] = PROPS.digest((ROOT / "scripts/lib/render-creator-bundle-scenes-blender.py").read_bytes())
        fingerprint = PROPS.digest(json.dumps(render_input, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode())
        result.append({**recipe, "models": resolved, "recipeSha256": fingerprint, "rightsInfo": primary["rightsInfo"], "sourceUrl": primary["sourceUrl"], "catalogId": primary["catalogId"]})
    return result


def encode_scene(job, png_root, proof, stage):
    from PIL import Image
    path = Path(png_root) / (job["id"] + ".png")
    if path.is_symlink() or not path.is_file():
        raise PROPS.RenderError("장면 PNG가 없거나 심볼릭 링크입니다.")
    data = path.read_bytes()
    if proof.get("recipeSha256") != job["recipeSha256"] or PROPS.digest(data) != proof.get("pngSha256"):
        raise PROPS.RenderError("장면 레시피·원본·PNG 해시가 렌더 증명과 다릅니다.")
    with Image.open(io.BytesIO(data)) as opened:
        if opened.format != "PNG" or opened.size != (2048, 1152) or opened.mode != "RGBA" or opened.getchannel("A").getextrema() != (255, 255):
            raise PROPS.RenderError("완성 배경은 불투명 RGBA PNG 2048×1152여야 합니다.")
        image = opened.copy()
    output = stage / (job["id"] + ".webp")
    image.save(output, "WEBP", lossless=True, method=1, exact=True)
    with Image.open(output) as decoded:
        if decoded.convert("RGBA").tobytes() != image.tobytes():
            raise PROPS.RenderError("완성 배경의 무손실 픽셀 왕복에 실패했습니다.")
    preview = stage / (job["id"] + "-preview.webp")
    image.resize((512, 288), Image.Resampling.LANCZOS).save(preview, "WEBP", lossless=True, method=1, exact=True)
    source = "/assets/studio/bundle-scenes-v1/" + output.name
    return {"id": job["id"], "label": job["name"], "title": job["name"], "genre": job["genre"], "src": source,
            "previewSrc": source.replace(".webp", "-preview.webp"), "width": 2048, "height": 1152,
            "previewBytes": preview.stat().st_size, "previewSha256": PROPS.digest(preview.read_bytes()),
            "bytes": output.stat().st_size, "sha256": PROPS.digest(output.read_bytes()),
            "tags": ["번들", "3D 렌더", "로우폴리", job["name"]], "environment": job["environment"], "timeOfDay": job["timeOfDay"],
            "containsPeople": False, "containsText": False, "recommended": True,
            "review": {"method": "full-image", "status": "usable", "reviewedAt": "2026-10-28", "notes": ["CC0 모델을 배치한 완성 장면 렌더. 원본 모델의 로우폴리 스타일을 유지합니다."]},
            "provenance": {"kind": "creator-bundle-cc0", "licenseStatus": "cc0-verified", "licenseId": "CC0-1.0",
                           "provider": job["rightsInfo"]["provider"], "sourceUrl": job["sourceUrl"], "checkedOn": "2026-10-28", "recipeId": job["id"]},
            "rights": job["rightsInfo"]["rights"], "sourceRecipeSha256": job["recipeSha256"],
            "sourceModels": [{"assetId": model["assetId"], "sha256": model["sourceModelSha256"]} for model in job["models"]],
            "mediaType": "image/webp", "style": "stylized-low-poly", "legacySrc": None, "sourceManifest": "bundle-scenes-v1/manifest.json"}


def verify_scene_proof(jobs, png_root):
    path = Path(png_root) / "render-proof.json"
    if path.is_symlink() or not path.is_file():
        raise PROPS.RenderError("완성 장면 렌더 증명이 없거나 심볼릭 링크입니다.")
    proof = json.loads(path.read_text())
    if not isinstance(proof, dict) or proof.get("schema") != "toonstudio.creator-bundle-scene-proof.v1" or not isinstance(proof.get("assets"), list):
        raise PROPS.RenderError("완성 장면 렌더 증명 스키마가 다릅니다.")
    entries = proof["assets"]
    if any(not isinstance(item, dict) or not isinstance(item.get("id"), str) for item in entries):
        raise PROPS.RenderError("렌더 증명 항목에 올바른 id가 없습니다.")
    proofs = {item["id"]: item for item in entries}
    if len(proofs) != len(entries):
        raise PROPS.RenderError("렌더 증명에 중복 id가 있습니다.")
    if set(proofs) != {job["id"] for job in jobs}:
        raise PROPS.RenderError("렌더 증명과 레시피 목록이 다릅니다.")
    for job in jobs:
        item = proofs[job["id"]]
        if item.get("recipeSha256") != job["recipeSha256"] or not isinstance(item.get("pngSha256"), str) or not PROPS.SHA256.fullmatch(item["pngSha256"]):
            raise PROPS.RenderError("렌더 증명의 레시피·PNG 해시가 올바르지 않습니다.")
    return proofs


def verify_lossless_webp(path, expected_size, expected_bytes, expected_sha256):
    """Pillow 없이 CI에서 무손실·불투명 헤더와 실제 파일의 치수·바이트를 확인한다."""
    if path.is_symlink() or not path.is_file():
        raise PROPS.RenderError("공개 배경 파일이 없거나 심볼릭 링크입니다: " + path.name)
    body = path.read_bytes()
    if len(body) != expected_bytes or PROPS.digest(body) != expected_sha256:
        raise PROPS.RenderError("공개 배경 파일의 바이트·해시가 다릅니다: " + path.name)
    if len(body) < 25 or body[:4] != b"RIFF" or body[8:12] != b"WEBP" or struct.unpack_from("<I", body, 4)[0] + 8 != len(body):
        raise PROPS.RenderError("공개 배경의 WebP 컨테이너가 올바르지 않습니다: " + path.name)
    offset, sizes = 12, []
    while offset < len(body):
        if offset + 8 > len(body):
            raise PROPS.RenderError("공개 배경의 WebP 청크가 잘렸습니다.")
        kind, length = body[offset:offset + 4], struct.unpack_from("<I", body, offset + 4)[0]
        start = offset + 8
        if start + length > len(body) or kind in [b"VP8 ", b"ANIM", b"ANMF", b"ALPH"]:
            raise PROPS.RenderError("공개 배경은 불투명 무손실 WebP여야 합니다.")
        if kind == b"VP8L":
            if length < 5 or body[start] != 0x2f:
                raise PROPS.RenderError("공개 배경의 VP8L 헤더가 올바르지 않습니다.")
            size = struct.unpack_from("<I", body, start + 1)[0]
            if size >> 28:
                raise PROPS.RenderError("공개 배경에 알파 또는 미지원 VP8L 버전이 있습니다.")
            sizes.append(((size & 0x3fff) + 1, ((size >> 14) & 0x3fff) + 1))
        offset = start + length + (length % 2)
    if offset != len(body) or sizes != [expected_size]:
        raise PROPS.RenderError("공개 배경의 무손실 이미지 치수가 다릅니다: " + path.name)


def verify_scene_catalog(catalog_path, recipes_path, selection_path, ledger_path, node="node"):
    """원본 라이브러리·Pillow·Blender 없이 현재 원장/선정/레시피와 공개 산출물을 대조한다."""
    selected = PROPS.load_selection(selection_path)
    rights = PROPS.load_rights(selected, ledger_path, node)
    sources = [{**asset, "resolvedSource": asset["source"], "resolvedTextureBindings": asset.get("textureBindings", []),
                "rightsInfo": rights[asset["id"]]} for asset in selected]
    jobs = plan_recipes(json.loads(Path(recipes_path).read_text()), sources)
    catalog_path = Path(catalog_path)
    if catalog_path.is_symlink() or not catalog_path.is_file() or catalog_path.parent.is_symlink():
        raise PROPS.RenderError("공개 배경 매니페스트 경로가 올바르지 않습니다.")
    catalog = json.loads(catalog_path.read_text())
    if not isinstance(catalog, dict) or catalog.get("schema") != "toonstudio.creator-bundle-scene-catalog.v1" or not isinstance(catalog.get("assets"), list):
        raise PROPS.RenderError("공개 배경 카탈로그 스키마가 다릅니다.")
    assets = catalog["assets"]
    if any(not isinstance(asset, dict) for asset in assets) or [asset.get("id") for asset in assets] != [job["id"] for job in jobs]:
        raise PROPS.RenderError("공개 배경과 현재 레시피 목록이 다릅니다.")
    expected_files = {"manifest.json"}
    for asset, job in zip(assets, jobs):
        if job["visualReviewed"] is not True:
            raise PROPS.RenderError("공개 배경의 전체 이미지 검수가 취소됐습니다.")
        expected = {"sourceRecipeSha256": job["recipeSha256"],
                    "sourceModels": [{"assetId": model["assetId"], "sha256": model["sourceModelSha256"]} for model in job["models"]],
                    "rights": job["rightsInfo"]["rights"], "id": job["id"], "label": job["name"], "title": job["name"],
                    "genre": job["genre"], "environment": job["environment"], "timeOfDay": job["timeOfDay"],
                    "width": 2048, "height": 1152, "mediaType": "image/webp", "style": "stylized-low-poly",
                    "containsPeople": False, "containsText": False, "recommended": True}
        for key, value in expected.items():
            if asset.get(key) != value:
                raise PROPS.RenderError("공개 배경이 현재 권리·원본·레시피·renderer 기록과 다릅니다: " + job["id"] + "/" + key)
        expected_provenance = {"kind": "creator-bundle-cc0", "licenseStatus": "cc0-verified", "licenseId": "CC0-1.0",
                               "provider": job["rightsInfo"]["provider"], "sourceUrl": job["sourceUrl"], "checkedOn": "2026-10-28", "recipeId": job["id"]}
        review = asset.get("review")
        if asset.get("provenance") != expected_provenance or not isinstance(review, dict) or review.get("method") != "full-image" or review.get("status") != "usable":
            raise PROPS.RenderError("공개 배경의 출처·검수 기록이 다릅니다: " + job["id"])
        for suffix, field, dimensions in [(".webp", "src", (2048, 1152)), ("-preview.webp", "previewSrc", (512, 288))]:
            name = job["id"] + suffix
            if asset.get(field) != "/assets/studio/bundle-scenes-v1/" + name:
                raise PROPS.RenderError("공개 배경 이미지 경로가 다릅니다: " + name)
            prefix = "preview" if field == "previewSrc" else ""
            verify_lossless_webp(catalog_path.parent / name, dimensions, asset.get(prefix + "Bytes" if prefix else "bytes"),
                                 asset.get(prefix + "Sha256" if prefix else "sha256"))
            expected_files.add(name)
    if {path.name for path in catalog_path.parent.iterdir()} != expected_files:
        raise PROPS.RenderError("공개 배경 폴더에 원장·레시피에 없는 파일이 있습니다.")
    return {"scenes": len(assets), "files": len(expected_files), "verified": True, "localLibraryRequired": False}


def run(args):
    sources = PROPS.load_selection(args.selection)
    rights = PROPS.load_rights(sources, args.pack_rights, args.node)
    planned = PROPS.plan_assets(sources, args.library_root, rights)
    jobs = plan_recipes(json.loads(args.recipes.read_text()), planned)
    if args.publish and any(job["visualReviewed"] is not True for job in jobs):
        raise PROPS.RenderError("모든 배경의 전체 이미지 검수가 끝난 뒤 공개할 수 있습니다.")
    output = args.output_root.absolute()
    work = args.work_dir.resolve()
    public = (ROOT / "apps/web/public").resolve()
    if output.is_symlink() or work.is_relative_to(public) or work.is_relative_to(output.resolve()) or output.resolve().is_relative_to(work):
        raise PROPS.RenderError("작업 폴더는 공개 경로 밖에서 출력 폴더와 분리해야 합니다.")
    if args.dry_run:
        return {"scenes": len(jobs), "instances": sum(len(job["models"]) for job in jobs), "dryRun": True, "published": False}
    work.mkdir(parents=True, exist_ok=True)
    png_root = args.reuse_renders.resolve(strict=True) if args.reuse_renders else work / "png"
    if not args.reuse_renders:
        jobs_path = work / "jobs.json"
        jobs_path.write_text(json.dumps(jobs, ensure_ascii=False))
        rendered = subprocess.run([args.blender, "--background", "--factory-startup", "--python-exit-code", "42", "--python", str(ROOT / "scripts/lib/render-creator-bundle-scenes-blender.py"), "--", str(jobs_path), str(png_root)], check=False)
        if rendered.returncode:
            raise PROPS.RenderError("완성 장면 렌더가 실패했습니다. 출력 폴더를 바꾸지 않았습니다.")
    proofs = verify_scene_proof(jobs, png_root)
    with tempfile.TemporaryDirectory(prefix="scene-stage-", dir=work) as temporary:
        stage = Path(temporary)
        for job in jobs:
            for model in job["models"]:
                if PROPS.digest(Path(model["source"]).read_bytes()) != model["sourceModelSha256"]:
                    raise PROPS.RenderError("장면 생성 도중 원본이 바뀌었습니다.")
        assets = [encode_scene(job, png_root, proofs[job["id"]], stage) for job in jobs]
        (stage / "manifest.json").write_text(json.dumps({"schema": "toonstudio.creator-bundle-scene-catalog.v1", "assets": assets}, ensure_ascii=False, indent=2) + "\n")
        if args.publish:
            verify_scene_catalog(stage / "manifest.json", args.recipes, args.selection, args.pack_rights, args.node)
        PROPS.publish_pack(stage, work / "pack")
        if args.publish:
            PROPS.publish_pack(work / "pack", output)
    return {"scenes": len(jobs), "instances": sum(len(job["models"]) for job in jobs), "published": args.publish}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library-root", required=True, type=Path)
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--selection", type=Path, default=PROPS.DEFAULT_SELECTION)
    parser.add_argument("--recipes", type=Path, default=DEFAULT_RECIPES)
    parser.add_argument("--pack-rights", type=Path, default=PROPS.DEFAULT_LEDGER)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--reuse-renders", type=Path)
    parser.add_argument("--node", default="node")
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--publish", action="store_true")
    try:
        print(json.dumps(run(parser.parse_args()), ensure_ascii=False))
    except (PROPS.RenderError, OSError, ValueError, KeyError, TypeError) as error:
        print("완성 배경 작업 실패: " + str(error) + " 레시피·권리·원본을 확인하고 --dry-run으로 재검증하세요.", file=__import__("sys").stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
