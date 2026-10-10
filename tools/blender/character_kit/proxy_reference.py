"""Hyper3D T-포즈 의상 생성용 참조 이미지(프록시)를 만든다 (bpy venv python으로 실행).

Rodin은 글 프롬프트의 "T-pose"를 따르지 않고 팔을 내린 A-포즈 인물을 만든다. A-포즈 의상을 T-포즈로 되돌리면(겨드랑이 늘어남·찢김) 품질이 무너지므로,
베이스 몸 위에 얇은 프록시 의상(몸 표면을 법선으로 부풀린 셸)을 입힌 **T-포즈 정면 렌더**를 참조 이미지로 주고 글 프롬프트로 의상 디테일을 더한다.
이미지가 포즈와 비례(= 베이스)를 정하므로 BANG으로 분리한 의상 파츠가 곧바로 베이스 T-포즈 몸에 맞고 변환이 필요 없다.

사용(저장소 루트)::

    <venv>/bin/python -I tools/blender/character_kit/proxy_reference.py -- \\
        --base-model ~/.cache/toonstudio-kit/out2/base_model_female.npz --kind shirt --out /tmp/proxy_shirt.png [--size 1024] [--flat]

`--kind`: shirt(흰 셔츠) | blazer(네이비 + 흰 V 영역) | hoodie(회색 + 목 둘레 후드 고리) | sailor(흰 짧은 상의 + 네이비 칼라·소매단).
모든 종류에 어두운 회색 바지 프록시를 함께 입힌다(속옷 차림 인물이 나오는 것을 막고, BANG이 바지도 분리하게 한다).
배경은 흰색, 카메라는 직교 정면이다. 참조 이미지는 베이스 메시를 렌더한 것뿐이며 외부 이미지·모델을 쓰지 않는다.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from character_kit.garment_fit import vertex_normals, weld_vertices  # noqa: E402

SKIN = (0.93, 0.76, 0.66)
DARK = (0.18, 0.19, 0.22)
WHITE = (0.96, 0.96, 0.96)
NAVY = (0.10, 0.14, 0.30)
GRAY = (0.70, 0.71, 0.75)

# 종류별: (상의 몸 영역 y 하한(밑단), 소매 포함 여부, 몸 여유 m, 소매 여유 m)
KINDS = {
    "shirt": {"hem": 0.80, "body": WHITE, "ease": 0.026, "sleeve_ease": 0.028},
    "blazer": {"hem": 0.80, "body": NAVY, "ease": 0.030, "sleeve_ease": 0.026},
    "hoodie": {"hem": 0.78, "body": GRAY, "ease": 0.040, "sleeve_ease": 0.036},
    "sailor": {"hem": 0.93, "body": WHITE, "ease": 0.022, "sleeve_ease": 0.024},
}


def load_arrays(path: str) -> dict:
    data = np.load(path, allow_pickle=True)
    names = [str(n) for n in data["region_ids"]]
    positions = data["body_tpose_positions"].astype(np.float64)
    triangles = data["body_triangles"].astype(np.int64)
    region = data["body_region"].astype(np.int64)
    # UV 이음매로 쪼개진 정점을 합쳐야 법선이 이음매 양쪽에서 같아져 부풀린 셸에 틈이 생기지 않는다.
    canon_index, canon_positions = weld_vertices(positions)
    canon_region = np.zeros(len(canon_positions), dtype=np.int64)
    canon_region[canon_index] = region
    return {
        "names": names,
        "region": canon_region,
        "positions": canon_positions,
        "triangles": canon_index[triangles],
        "head_positions": data["head_tpose_positions"].astype(np.float64),
        "head_triangles": data["head_triangles"].astype(np.int64),
        "extra": {key.split("/")[1] + "/" + key.split("/")[2]: (data[key].astype(np.float64), data[key.replace("tpose_positions", "triangles")].astype(np.int64)) for key in data.files if key.startswith("mesh/") and key.endswith("tpose_positions") and "Underwear" not in key},
    }


def smooth_offsets(positions: np.ndarray, triangles: np.ndarray, iterations: int = 6) -> np.ndarray:
    """부풀린 셸을 가볍게 평활화한다(영역 경계의 법선 불연속을 지운다)."""
    count = len(positions)
    edges = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    edges = np.concatenate([edges, edges[:, ::-1]])
    degree = np.bincount(edges[:, 0], minlength=count).astype(np.float64)
    out = positions.copy()
    for _ in range(iterations):
        accum = np.zeros_like(out)
        np.add.at(accum, edges[:, 0], out[edges[:, 1]])
        mean = accum / np.maximum(degree, 1.0)[:, None]
        out = np.where(degree[:, None] > 0, 0.5 * out + 0.5 * mean, out)
    return out


def shell(arrays: dict, regions: list[str], y_range: tuple[float, float], ease_by_region: dict[str, float], default_ease: float, neck_top: float | None = None) -> tuple[np.ndarray, np.ndarray]:
    """몸 메시에서 영역·높이로 고른 부분을 법선 방향으로 `ease`만큼 부풀린 셸 (정점, 삼각형). `neck_top`은 목 영역에만 거는 높이 상한(목둘레선)이다."""
    ids = [arrays["names"].index(name) for name in regions]
    positions, triangles = arrays["positions"], arrays["triangles"]
    normals = vertex_normals(positions, triangles)
    keep = np.isin(arrays["region"], ids) & (positions[:, 1] >= y_range[0]) & (positions[:, 1] <= y_range[1])
    if neck_top is not None:
        keep &= ~((arrays["region"] == arrays["names"].index("neck")) & (positions[:, 1] > neck_top))
    face_keep = keep[triangles].all(axis=1)
    used = np.unique(triangles[face_keep])
    remap = np.full(len(positions), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    ease = np.full(len(positions), default_ease)
    for name, value in ease_by_region.items():
        ease[arrays["region"] == arrays["names"].index(name)] = value
    moved = positions + normals * ease[:, None]
    new_triangles = remap[triangles[face_keep]]
    new_positions = smooth_offsets(moved[used], new_triangles, 10)
    return new_positions, new_triangles


def hood_ring(center: np.ndarray, major: float, minor: float, squash: float = 0.75, u_count: int = 40, v_count: int = 16) -> tuple[np.ndarray, np.ndarray]:
    """목 둘레의 두툼한 고리(내려 둔 후드)."""
    positions = []
    for i in range(u_count):
        phi = 2.0 * math.pi * i / u_count
        for j in range(v_count):
            theta = 2.0 * math.pi * j / v_count
            radius = major + minor * math.cos(theta)
            positions.append([center[0] + radius * math.cos(phi), center[1] + squash * minor * math.sin(theta), center[2] + radius * math.sin(phi) * 0.9])
    triangles = []
    for i in range(u_count):
        for j in range(v_count):
            a = i * v_count + j
            b = i * v_count + (j + 1) % v_count
            c = ((i + 1) % u_count) * v_count + j
            d = ((i + 1) % u_count) * v_count + (j + 1) % v_count
            triangles += [[a, b, d], [a, d, c]]
    return np.array(positions), np.array(triangles, dtype=np.int64)


def split_by_color(positions: np.ndarray, triangles: np.ndarray, color_of) -> list[tuple[tuple, np.ndarray]]:
    """삼각형 무게중심으로 색을 정해 같은 색끼리 묶는다."""
    centers = positions[triangles].mean(axis=1)
    colors = [color_of(c) for c in centers]
    groups: dict[tuple, list[int]] = {}
    for index, color in enumerate(colors):
        groups.setdefault(color, []).append(index)
    return [(color, triangles[np.array(indices)]) for color, indices in groups.items()]


def top_color(kind: str, base: tuple):
    def color_of(c):
        x, y, z = abs(c[0]), c[1], c[2]
        if kind == "blazer":
            # 가슴 앞 V 영역과 목 둘레는 안쪽 셔츠(흰색)
            if z > 0.0 and y > 1.17 and x < 0.62 * (y - 1.17) + 0.015:
                return WHITE
            if y > 1.36 and x < 0.11:
                return WHITE
        if kind == "sailor":
            front_flap = z > 0.0 and y > 1.22 and x < 0.19 and x >= 0.6 * (y - 1.18)
            back_flap = z <= 0.0 and y > 1.16 and x < 0.19
            if front_flap or back_flap:
                return NAVY
        return base

    return color_of


def sleeve_cuffs(kind: str, color_of):
    if kind != "sailor":
        return color_of

    def with_cuffs(c):
        if abs(c[0]) > 0.58:  # 소매 끝 7 cm 정도
            return NAVY
        return color_of(c)

    return with_cuffs


def build_scene(arrays: dict, kind: str, size: int, output: str, flat: bool) -> None:
    import bpy
    from mathutils import Vector

    spec = KINDS[kind]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    def add_mesh(name: str, positions: np.ndarray, triangles: np.ndarray, color: tuple) -> None:
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(positions.tolist(), [], triangles.tolist())
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
        material = bpy.data.materials.new(name)
        material.diffuse_color = (*color, 1.0)
        obj.data.materials.append(material)
        for polygon in mesh.polygons:
            polygon.use_smooth = True

    add_mesh("body", arrays["positions"], arrays["triangles"], SKIN)
    add_mesh("head", arrays["head_positions"], arrays["head_triangles"], SKIN)
    for key, (positions, triangles) in arrays["extra"].items():
        name = key.split("/")[0]
        color = (0.98, 0.98, 0.98) if "Eye" in name else (0.12, 0.10, 0.10)
        add_mesh(name + "_" + key.split("/")[1], positions, triangles, color)

    top_positions, top_triangles = shell(
        arrays,
        ["torso", "pelvis", "neck", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        (spec["hem"], 9.0),
        {"upperArm.L": spec["sleeve_ease"], "upperArm.R": spec["sleeve_ease"], "forearm.L": spec["sleeve_ease"], "forearm.R": spec["sleeve_ease"]},
        spec["ease"],
        neck_top=1.345,
    )
    color_of = sleeve_cuffs(kind, top_color(kind, spec["body"]))
    for index, (color, tris) in enumerate(split_by_color(top_positions, top_triangles, color_of)):
        add_mesh(f"top_{index}", top_positions, tris, color)
    if kind == "hoodie":
        ring_positions, ring_triangles = hood_ring(np.array([0.0, 1.372, -0.034]), major=0.108, minor=0.050)
        add_mesh("hood", ring_positions, ring_triangles, GRAY)

    bottom_positions, bottom_triangles = shell(
        arrays,
        ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
        (0.095, 0.93),
        {"calf.L": 0.020, "calf.R": 0.020, "thigh.L": 0.022, "thigh.R": 0.022},
        0.022,
    )
    add_mesh("bottom", bottom_positions, bottom_triangles, DARK)

    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = False
    shading = scene.display.shading
    shading.light = "FLAT" if flat else "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_backface_culling = False
    shading.show_cavity = False
    shading.show_object_outline = False
    shading.show_specular_highlight = False
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (1.0, 1.0, 1.0)
    scene.view_settings.view_transform = "Standard"
    camera_data = bpy.data.cameras.new("c")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 1.95
    camera = bpy.data.objects.new("c", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    # 모델 +Z 가 앞(= glTF +Z). Blender 변환 없이 만든 메시이므로 (x, y, z) 그대로이고, 카메라는 +Z 쪽에서 -Z로 본다(y가 위).
    camera.location = Vector((0.0, 0.84, 5.0))
    camera.rotation_euler = (0.0, 0.0, 0.0)
    scene.render.filepath = output
    bpy.ops.render.render(write_still=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--kind", choices=sorted(KINDS), required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--flat", action="store_true", help="입체 음영 없이 평평하게 칠한다")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
    arrays = load_arrays(args.base_model)
    build_scene(arrays, args.kind, args.size, args.out, args.flat)
    print(f"참조 이미지: {args.out}")


if __name__ == "__main__":
    main()
