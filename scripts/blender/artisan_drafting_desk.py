"""V15 작화 책상. 단위는 m. 목리와 태블릿의 콘티는 수식으로 직접 그린다.

저장소 루트에서 책상의 GLB, 썸네일, 출처 원장을 다시 만드는 명령:
blender -b --factory-startup --python-exit-code 1 --python-expr 'import sys; sys.path.insert(0, "scripts/blender"); import generate_artisan_atelier_v15 as g; g.export_v15_subset(4, 5); g.write_v15_provenance_from_disk()'
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

from modeler_kit_v13_primitives import add_beveled_box, add_lathe_solid, add_tube_segment, create_mesh_object


def _image(name, rgb):
    height, width = rgb.shape[:2]
    image = bpy.data.images.new(name, width, height, alpha=False)
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    image.pixels.foreach_set(rgba.ravel())
    image.update()
    image.pack()
    return image


def _oak():
    v, u = np.mgrid[0:256, 0:512] / np.array([256, 512])[:, None, None]
    board = np.floor(v * 5)
    grain = v * 66 + .62 * np.sin(6 * u + board) + .3 * np.sin(10 * u + v * 8)
    rings = np.sin(grain * math.tau)
    pores = np.sin(11 * grain + 7 * u) ** 18
    tone = .045 * rings - .042 * pores + .012 * np.sin(33 * board)
    return _image("V15_Oak_QuarterSawn", np.array([.58, .43, .30]) + tone[:, :, None])


def _storyboard():
    v, u = np.mgrid[0:256, 0:512] / np.array([255, 511])[:, None, None]
    color = np.empty((*u.shape, 3))
    color[:] = (.89, .85, .75)
    sky = np.array([.93, .63, .43]) + v[:, :, None] * np.array([-.50, -.10, .20])
    # 저녁 열차가 지나가는 다리와 계곡을 서로 다른 거리에서 본 두 컷.
    for left, right, phase in ((.035, .63, .3), (.65, .965, 2.1)):
        panel = (u > left) & (u < right) & (v > .075) & (v < .935)
        x = (u - left) / (right - left)
        color[panel] = sky[panel]
        sun = ((x - .69) * (right - left) * 2) ** 2 + (v - .70) ** 2 < .087 ** 2
        color[panel & sun] = (.99, .88, .61)
        for level, frequency, tint in ((.52, 6, (.49, .47, .54)), (.38, 8, (.32, .36, .42)), (.22, 10, (.15, .22, .29))):
            ridge = level + .07 * np.sin(x * frequency + phase) + .035 * np.sin(3 * frequency * x - phase)
            color[panel & (v < ridge)] = tint
        rail = .43 + x * .10
        ink = (.105, .14, .19)
        color[panel & (abs(v - rail) < .010)] = ink
        color[panel & (v < rail) & (np.mod(x + .07, .29) < .012)] = ink
        train = panel & (x > .12) & (x < .57) & (v > rail) & (v < rail + .059)
        color[train] = (.78, .59, .43)
        color[train & (v > rail + .023) & (v < rail + .047) & (np.mod(x, .048) < .035)] = ink
    return _image("V15_Storyboard_EveningTrain", color)


def _texture(mat, image, emission=False):
    tree = mat.node_tree
    sampler = tree.nodes.new("ShaderNodeTexImage")
    sampler.image = image
    bsdf = tree.nodes.get("Principled BSDF")
    tree.links.new(sampler.outputs["Color"], bsdf.inputs["Base Color"])
    if emission:
        tree.links.new(sampler.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = .18


def _colored_part(scene, name, bm, mat, color):
    obj = create_mesh_object(scene, name, bm, mat, smooth=True, weighted_normals=True)
    attr = obj.data.color_attributes.new(name="Finish", type="BYTE_COLOR", domain="POINT")
    attr.data.foreach_set("color", np.tile((*color, 1), len(attr.data)).astype(np.float32))
    return obj


def _join(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name


def build_drafting_desk(scene, material):
    oak = material("V15_QuarterSawnOak", (.40, .23, .12), roughness=.45, coat_weight=.12)
    metal = material("V15_BrushedMetal", (.8, .8, .8), roughness=.32, metallic=1)
    polymer = material("V15_MoldedPolymer", (.14, .14, .14), roughness=.59)
    glass = material("V15_AntiGlareDisplay", (.8, .8, .8), roughness=.31, coat_weight=.18)
    for mat in (metal, polymer):
        attr = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Finish"
        mat.node_tree.links.new(attr.outputs["Color"], mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    _texture(oak, _oak())
    _texture(glass, _storyboard(), emission=True)

    wood, frame, brass, rubber, porcelain = (bmesh.new() for _ in range(5))
    top = .816
    add_beveled_box(wood, (1.62, .82, .042), (0, 0, top - .021), .011, segments=5)
    obj = create_mesh_object(scene, "QuarterSawnOakDesktop", wood, oak, weighted_normals=True)
    uv = obj.data.uv_layers.active
    for loop in obj.data.loops:
        x, y, z = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (x / 1.62 + .5, (y + (top - z) * .75) / .82 + .5)

    for x in (-.64, .64):
        add_beveled_box(frame, (.072, .72, .040), (x, 0, .03), .009, 4)
        for y in (-.285, .285):
            add_beveled_box(rubber, (.074, .087, .014), (x, y, .007), .003, 3)
            add_tube_segment(frame, (x, y, .046), (x, y * .41, .76), .027, .022, 20)
    for y in (-.115, .115):
        add_beveled_box(frame, (1.36, .036, .048), (0, y, .753), .006, 3)
    add_tube_segment(frame, (-.64, .19, .39), (.64, .19, .39), .016, segments=20)

    tilt = math.radians(32)
    pivot = Vector((-.135, .005, 1.002))
    rotation = Euler((tilt, 0, 0)).to_matrix()
    def tablet(x, y, z):
        return tuple(pivot + rotation @ Vector((x, y, z)))
    def tablet_box(bm, size, offset, radius):
        add_beveled_box(bm, size, tablet(*offset), radius, 4, rot_euler=(tilt, 0, 0))

    # 전면 유리와 하우징, 키, 힌지를 같은 좌표계로 조립해 화면이 뜨거나 파묻히지 않게 한다.
    tablet_box(frame, (.81, .475, .024), (0, 0, 0), .006)
    tablet_box(rubber, (.804, .468, .008), (0, 0, .014), .002)
    for x in (-.385, .385):
        for y in (-.095, -.047, .001, .049):
            tablet_box(rubber, (.018, .031, .005), (x, y, .019), .0012)
    for x in (-.355, .07):
        add_beveled_box(frame, (.10, .245, .015), (x, .04, top + .0075), .003, 3)
        for y, offset in ((-.065, -.137), (.15, .105)):
            attach = tablet(x + .135, offset, -.015)
            add_tube_segment(frame, (x, y, top + .012), attach, .010, .009, 20)
            add_tube_segment(brass, (x - .017, attach[1], attach[2]), (x + .017, attach[1], attach[2]), .014, segments=24)
    screen = bmesh.new()
    sw, sh = .723, .403
    tablet_box(screen, (sw, sh, .003), (0, 0, .019), .0007)
    obj = create_mesh_object(scene, "PenDisplayStoryboard", screen, glass, weighted_normals=True)
    uv = obj.data.uv_layers.active
    for loop in obj.data.loops:
        local = rotation.transposed() @ (obj.data.vertices[loop.vertex_index].co - pivot)
        uv.data[loop.index].uv = (local.x / sw + .5, local.y / sh + .5)

    # 옆으로 놓인 실측 164 mm 스타일러스. 펜받침 두 지점 위에 고무 그립과 닙이 놓인다.
    px, py, pz = .390, -.164, top + .019
    for x in (px - .044, px + .044):
        add_beveled_box(rubber, (.021, .044, .013), (x, py, top + .0065), .003, 4)
    point = lambda dx: (px + dx, py, pz)
    add_tube_segment(frame, point(-.078), point(.050), .0056, .0050, 24)
    add_tube_segment(rubber, point(.014), point(.059), .0066, .0058, 24)
    add_tube_segment(brass, point(.059), point(.074), .0058, .0030, 24)
    add_tube_segment(rubber, point(.074), point(.086), .0030, .0015, 16)
    add_beveled_box(rubber, (.027, .0035, .0025), (px + .014, py, pz + .006), .0006, 3)

    # 트윈 링크와 양 끝 회전축을 갖춘 작업등. 갓은 안팎을 림으로 연결한 폐곡면이다.
    p0, p1, p2 = (.60, .21, .877), (.64, .28, 1.20), (.40, .14, 1.47)
    add_lathe_solid(brass, [(.076, top), (.082, top + .006), (.081, top + .021), (.040, top + .032), (.025, .877)], 40, center_xyz=(p0[0], p0[1], 0))
    for a, b in ((p0, p1), (p1, p2)):
        for dx in (-.013, .013):
            add_tube_segment(brass, (a[0] + dx, *a[1:]), (b[0] + dx, *b[1:]), .0057, .0053, 20)
    for x, y, z in (p0, p1, p2):
        add_tube_segment(frame, (x - .025, y, z), (x + .025, y, z), .016, segments=32)
        add_tube_segment(brass, (x + .024, y, z), (x + .030, y, z), .0095, segments=24)
    shade = Euler((-.22, .47, 0)).to_matrix()
    origin = Vector(p2)
    rings = []
    for r, h in ((.025, -.006), (.034, -.022), (.048, -.046), (.112, -.100), (.119, -.106), (.119, -.111), (.115, -.114), (.108, -.105), (.043, -.052), (.026, -.030), (.020, -.008)):
        rings.append([brass.verts.new(origin + shade @ Vector((r * math.cos(i * math.tau / 40), r * math.sin(i * math.tau / 40), h))) for i in range(40)])
    for row, ring in enumerate(rings):
        nxt = rings[(row + 1) % len(rings)]
        for i in range(40):
            j = (i + 1) % 40
            brass.faces.new((ring[i], ring[j], nxt[j], nxt[i]))
    mount = origin + shade @ Vector((0, 0, -.016))
    bulb = origin + shade @ Vector((0, 0, -.098))
    add_tube_segment(porcelain, mount, bulb, .022, .032, 32)

    _join([_colored_part(scene, "Aluminum", frame, metal, (.22, .24, .26)),
           _colored_part(scene, "Brass", brass, metal, (.68, .415, .175))], "BrushedAluminumAndBrass")
    _join([_colored_part(scene, "Graphite", rubber, polymer, (.032, .039, .045)),
           _colored_part(scene, "Diffuser", porcelain, polymer, (.94, .88, .68))], "GraphiteGripAndDiffuser")
