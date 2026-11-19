"""주인공 재킷의 경사·위사 굴곡을 반복 가능한 탄젠트 노멀로 굽는다."""

import math
from pathlib import Path

import bpy

from shaper_webtoon_head_and_textures import _write_png_rgba


def _thread_height(u: float, v: float) -> float:
    warp = math.cos(math.tau * 8 * u)
    weft = math.cos(math.tau * 8 * v)
    twill = math.sin(math.tau * 2 * (u - v))
    return 0.58 * twill + (0.21 + 0.11 * twill) * warp + (0.21 - 0.11 * twill) * weft


def apply_blazer_twill(material: bpy.types.Material, path: Path) -> None:
    size = 64
    half_texel = 0.5 / size
    rows = []
    for y in range(size):
        v = (y + 0.5) / size
        row = bytearray()
        for x in range(size):
            u = (x + 0.5) / size
            dx = (_thread_height(u + half_texel, v) - _thread_height(u - half_texel, v)) * size * 0.09
            dy = (_thread_height(u, v + half_texel) - _thread_height(u, v - half_texel)) * size * 0.09
            length = math.sqrt(dx * dx + dy * dy + 1.0)
            row.extend(round(127.5 * (1 + component / length)) for component in (-dx, dy, 1.0))
            row.append(255)
        rows.append(bytes(row))
    _write_png_rgba(str(path), size, size, rows)

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.location = (-980, -260)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-770, -260)
    # 이 재킷 원형의 중간 UV 밀도는 약 1.73m/단위이며, 타일 하나에 실 8가닥이 들어간다.
    mapping.inputs["Scale"].default_value = (128, 128, 1)
    texture = nodes.new("ShaderNodeTexImage")
    texture.location = (-555, -260)
    texture.image = bpy.data.images.load(str(path))
    texture.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    normal.location = (-270, -260)
    normal.inputs["Strength"].default_value = 0.12
    links.new(coordinates.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
