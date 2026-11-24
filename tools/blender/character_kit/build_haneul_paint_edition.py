"""하늘의 학교 재킷을 양말·셔츠·구두와 독립적으로 칠할 수 있는 호환 판본을 생성한다."""
import argparse
import copy
import hashlib
from pathlib import Path

from .build_portrait_edition import encode_glb
from .gltf_read import read_glb

ROOT = Path(__file__).resolve().parents[3] / "apps/web/public/vrm/toonstudio-hero-v1"
ORIGINAL = ROOT / "academy-female.vrm"
EDITION = ROOT / "academy-female-blazer.vrm"
SOURCE_SHA256 = "da7db2e857d85c1891728cc7743d23a03eafab80581ada0cba15ee9427085c15"


def build_edition():
    if hashlib.sha256(ORIGINAL.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("검증된 하늘 원본과 다릅니다.")
    doc, binary = read_glb(ORIGINAL)
    blazer = [mesh for mesh in doc["meshes"] if mesh["name"].startswith("TS_HeroGar_school-blazer_")]
    if len(blazer) != 3:
        raise ValueError("재킷 몸통·강조·테두리 메시를 확인할 수 없습니다.")
    for mesh in blazer:
        label = mesh["name"]
        for primitive in mesh["primitives"]:
            material = copy.deepcopy(doc["materials"][primitive["material"]])
            base = material["pbrMetallicRoughness"]["baseColorTexture"]
            shade = material["extensions"]["VRMC_materials_mtoon"]["shadeMultiplyTexture"]
            if shade["index"] != base["index"]:
                raise ValueError("재킷의 MToon 밑색과 음영 텍스처가 다릅니다.")
            texture = dict(doc["textures"][base["index"]])
            # 그림 데이터는 공유하되 로더와 페인트 런타임은 서로 다른 텍스처로 식별해야 한다.
            image = dict(doc["images"][texture["source"]], name=label)
            # GLTFLoader는 bufferView와 sampler가 같으면 Texture까지 재사용한다.
            view = dict(doc["bufferViews"][image["bufferView"]])
            image["bufferView"] = len(doc["bufferViews"])
            doc["bufferViews"].append(view)
            texture["source"] = len(doc["images"])
            doc["images"].append(image)
            base["index"] = shade["index"] = len(doc["textures"])
            doc["textures"].append(texture)
            primitive["material"] = len(doc["materials"])
            doc["materials"].append(dict(material, name=f"{material['name']}_blazer"))
    doc["extensions"]["VRMC_vrm"]["meta"]["version"] = "3.1.0-blazer-paint"
    return encode_glb(doc, binary)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = build_edition()
    if args.check:
        if EDITION.read_bytes() != data:
            parser.exit(1, "재킷 채색 판본을 다시 생성해 주세요.\n")
    else:
        EDITION.write_bytes(data)
    print(f"{EDITION.name} {len(data)} bytes sha256:{hashlib.sha256(data).hexdigest()}")
