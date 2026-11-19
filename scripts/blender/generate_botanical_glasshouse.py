"""블렌더 5.3에서 인물이 서는 중앙 통로를 남긴 반원형 온실과 실제 장면 썸네일을 만든다.

blender -b -t 3 --python-exit-code 1 -P scripts/blender/generate_botanical_glasshouse.py
독립 실행용. 모든 메시와 색은 ToonStudio에서 직접 만들었다(CC0).
"""
import hashlib
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parents[2] / "apps/web/public/assets/3d/environments/glasshouse-v1"
TAU = math.tau
RNG = random.Random(31914)
CAMERA = (5.3, -9.8, 3.25)
TARGET = (-0.25, 1.1, 1.52)
FOV = 39


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1.,)


def surface(name, roughness, metallic=0., alpha=1.):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    tint = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "Tint"
    mat.node_tree.links.new(tint.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Alpha"].default_value = alpha
    return mat


class MeshGroup:
    def __init__(self, name, material):
        self.name = name
        self.material = material
        self.vertices = []
        self.faces = []
        self.colors = []

    def solid(self, points, faces, color):
        start = len(self.vertices)
        self.vertices.extend(points)
        self.colors.extend([linear(color)] * len(points))
        self.faces.extend(tuple(start + i for i in face) for face in faces)

    def box(self, center, size, color):
        x, y, z = center
        w, d, h = (v / 2 for v in size)
        self.solid([(x+i*w, y+j*d, z+k*h) for k in (-1, 1) for j in (-1, 1) for i in (-1, 1)],
                   [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)], color)

    def rail(self, a, b, radius, color, sides=9):
        start, end = Vector(a), Vector(b)
        axis = (end - start).normalized()
        normal = axis.cross(Vector((0,0,1)) if abs(axis.z) < .9 else Vector((0,1,0))).normalized()
        cross = axis.cross(normal)
        ring = [radius * (math.cos(TAU*i/sides)*normal + math.sin(TAU*i/sides)*cross) for i in range(sides)]
        self.rings([[p + offset for offset in ring] for p in (start, end)], color)

    def rings(self, rings, color):
        count = len(rings[0])
        faces = [tuple(range(count-1,-1,-1))]
        for row in range(len(rings)-1):
            for i in range(count):
                a = row*count+i
                b = row*count+(i+1)%count
                faces.append((a,b,b+count,a+count))
        faces.append(tuple(range((len(rings)-1)*count,len(rings)*count)))
        self.solid([p for ring in rings for p in ring], faces, color)

    def pot(self, x, y, base, radius, height, color):
        rings = []
        for r, h in ((.7,0),(.75,.06),(.93,.78),(1,.80),(1,1),(.88,1),(.84,.76),(.67,.17)):
            rings.append([(x+r*radius*math.cos(TAU*i/20), y+r*radius*math.sin(TAU*i/20), base+h*height) for i in range(20)])
        self.rings(rings, color)

    def add(self, other):
        base = len(self.vertices)
        self.vertices.extend(other.vertices)
        self.colors.extend(other.colors)
        self.faces.extend(tuple(base+i for i in face) for face in other.faces)

    def build(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices, [], self.faces)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if any(not e.is_manifold for e in bm.edges) or any(f.calc_area() < 1e-11 for f in bm.faces):
            raise ValueError(f"{self.name}: 열린 면 또는 면적이 없는 면")
        bm.to_mesh(mesh)
        bm.free()
        uv = mesh.uv_layers.new(name="Garden metre projection")
        mesh.update()
        for poly in mesh.polygons:
            normal = poly.normal
            axis = max(range(3), key=lambda k: abs(normal[k]))
            uv_axes = ((1,2), (0,2), (0,1))[axis]
            for li in poly.loop_indices:
                point = mesh.vertices[mesh.loops[li].vertex_index].co
                uv.data[li].uv = (point[uv_axes[0]], point[uv_axes[1]])
        colors = mesh.color_attributes.new(name="Tint", type="BYTE_COLOR", domain="POINT")
        colors.data.foreach_set("color", [v for c in self.colors for v in c])
        mesh.materials.append(self.material)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def leaf(group, origin, angle, length, width, rise, color):
    along = Vector((math.cos(angle), math.sin(angle), 0))
    side = Vector((-along.y, along.x, 0))
    origin = Vector(origin)
    rings = []
    for t in ((0., .43, 1.) if width < .07 else (0., .23, .49, .76, 1.)):
        broad = width * (.018 + math.sin(math.pi*t)**.74)
        center = origin + along*length*t + Vector((0,0, rise*t + .26*length*math.sin(math.pi*t)))
        ridge = max(.002, broad*.15)
        rings.append([center-side*broad, center+Vector((0,0,ridge)), center+side*broad, center-Vector((0,0,ridge*.35))])
    group.rings(rings, color)


def plant(group, x, y, base, h, style):
    if style == "fern":
        for i in range(9):
            a = TAU*i/9 + RNG.uniform(-.13,.13)
            length = h * RNG.uniform(.56,.86)
            root = Vector((x,y,base))
            for j in range(1,8):
                t = j/7
                tip = Vector((x+length*t*math.cos(a), y+length*t*math.sin(a), base+h*(.25*t+.31*math.sin(math.pi*t))))
                group.rail(root,tip,.007,"50794C",5)
                broad = .23*h*(1.15-t)
                for sign in (-1,1):
                    leaf(group,tip+Vector((-math.sin(a),math.cos(a),0))*sign*.005,a+sign*.98,broad,.041*h*(1.12-t),.026*h,"5B9F6F" if i%2 else "82AE6E")
                root = tip
    else:
        for i in range(15):
            a = i*2.39996 + RNG.uniform(-.12,.12)
            spread = RNG.uniform(.2,.63)*h
            reach = RNG.uniform(.38,.86)*h
            attach = (x+.3*spread*math.cos(a),y+.3*spread*math.sin(a),base+reach*.58)
            group.rail((x,y,base),attach,.014*h,"799555",7)
            leaf(group,attach,a,spread,.12*h,reach*.29,RNG.choice(("397D66","569674","74A45E","286D59")))


def make_scene():
    matte = surface("Mineral and timber", .8)
    iron = surface("Painted iron", .32, .46)
    foliage = surface("Foliage", .5)
    glass = surface("Pale horticultural glass", .16, .04, .36)
    floor = MeshGroup("01 Limestone aisle and tile border", matte)
    frame = MeshGroup("02 Cast iron ribs and crest", iron)
    panes = MeshGroup("03 North and west glazing", glass)
    benches = MeshGroup("04 Propagation benches and tools", matte)
    terracotta = MeshGroup("05 Terracotta and ceramic pots", matte)
    fronds = MeshGroup("06 Ferns and foliage", foliage)
    blossoms = MeshGroup("07 Flowering vines", foliage)
    floor.box((0,0,.09),(7.6,8.6,.18),"A6A398")
    for j in range(13):
        for i in range(5):
            floor.box(((i-2)*.35,(j-6)*.61,.187),(.342,.602,.018),RNG.choice(("D8CAAC","D3C3A6","DCCEAE","CDC2A8")))
    for side in (-1,1):
        floor.box((side*.94,0,.193),(.095,7.98,.025),"534D43")
        for j in range(29):
            floor.box((side*.94,(j-14)*.273,.211),(.068,.14,.012),"C69157")

    def arch(a, y):
        return (3.52*math.cos(a), y, 2.0+2.56*math.sin(a))

    for y in (-3.65,-1.82,0,1.82,3.65):
        for side in (-1,1):
            frame.box((side*3.52,y,.32),(.24,.24,.28),"547F76")
            frame.rail((side*3.52,y,.18),(side*3.52,y,2.05),.055,"416B62",12)
            frame.box((side*3.52,y,1.97),(.17,.17,.13),"B39866")
        for k in range(20):
            frame.rail(arch(math.pi*k/20,y),arch(math.pi*(k+1)/20,y),.041,"47736B")
    for k in (0,3,6,10,14,17,20):
        frame.rail(arch(math.pi*k/20,-3.65),arch(math.pi*k/20,3.65),.025,"698B7C")
    for y in (-2.735,-.91,.91,2.735):
        for z in (.75,1.57):
            panes.box((-3.52,y,z),(.019,1.77,.77),"B6DDD3")
    frame.rail((-3.52,-3.65,1.16),(-3.52,3.65,1.16),.023,"4B7669")
    for i in range(-4,5):
        x = i*.72
        top = 2+2.56*math.sqrt(1-(x/3.52)**2)
        frame.rail((x,3.65,.2),(x,3.65,top),.03,"547B6D")
        if i in (-4,-3,-2,2,3):
            panes.box((x+.35,3.65,1.42),(.65,.025,2.33),"C7E2D2")
    # 열린 중앙 문 너머로도 배우와 카메라가 지나갈 수 있다.
    for side in (-1,1):
        frame.rail((side*.93,3.6,.19),(side*.93,3.6,2.42),.046,"3B645A")
    frame.rail((-.93,3.6,2.42),(.93,3.6,2.42),.056,"3B645A")
    for x, y, span in ((-2.15,.65,3.7),(2.28,1.8,2.6)):
        for side in (-1,1):
            for end in (-1,1):
                benches.box((x+side*.37,y+end*(span/2-.12),.6),(.09,.09,.84),"82684C")
        for strip in range(6):
            benches.box((x+(strip-2.5)*.156,y,1.055),(.147,span,.08),"A68458" if strip%2 else "BD996A")
    plants = [(-2.65,-2.45,.18,.62,1.75,"fern"), (2.72,-1.6,.18,.44,1.63,"broad"),
              (-2.35,2.99,.18,.49,2.42,"broad"),(2.76,3.22,.18,.41,2.28,"broad")]
    for x,y,count in ((-2.15,-.60,5),(2.25,1.0,4)):
        for i in range(count):
            plants.append((x+.13*(-1)**i,y+i*.55,1.095,.15+.024*(i%3),.56+.10*(i%4),"broad" if i%3 else "fern"))
    for i,(x,y,z,r,h,kind) in enumerate(plants):
        ph = r*1.3
        terracotta.pot(x,y,z,r,ph,("C37E59","AD6952","CF9366","739991")[i%4])
        terracotta.rail((x,y,z+ph*.82),(x,y,z+ph*.86),r*.86,"554638",20)
        plant(fronds,x,y,z+ph*.86,h,kind)
    for side in (-1,1):
        last = (side*2.7,3.55,.20)
        for i in range(1,26):
            t = i/25
            p = (side*(2.72+.28*math.sin(t*7)-1.05*t*t),3.48+.09*math.cos(t*12),.2+3.72*t)
            blossoms.rail(last,p,.028,"776D50",8)
            leaf(blossoms,p,i*2.40,.25,.075,.075,"6DA478")
            if i>7 and i%2:
                for j in range(5):
                    a = TAU*j/5
                    tip = (p[0]+.08*math.cos(a),p[1]-.035,p[2]+.08*math.sin(a))
                    blossoms.rail(p,tip,.045,("E6A18B","DB827A","EEB196")[i%3],7)
                blossoms.rail(p,(p[0],p[1]-.065,p[2]),.035,"E9C379",8)
            last = p
    # 벽돌 기단과 채광창은 중앙의 폭 1.86m 출입구를 비운 채 뒷면의 실루엣을 만든다.
    for side in (-1,1):
        for row in range(4):
            for i in range(6):
                x = side*(1.16+i*.43)
                floor.box((x,3.69,.26+row*.145),(.423,.22,.134),
                          RNG.choice(("A2715C","A87862","AC8067","986956")))
        floor.box((side*2.26,3.69,.83),(2.66,.32,.085),"D4BA97")
    hub = (0,3.60,2.45)
    for i in range(15):
        a,b = math.pi*i/15,math.pi*(i+1)/15
        def window_edge(theta, radius, y):
            return (math.cos(theta)*radius,y,hub[2]+math.sin(theta)*radius)
        frame.rail(window_edge(a,.34,3.59),window_edge(a,1.53,3.59),.022,"927444")
        for r in (.34,1.04,1.53):
            frame.rail(window_edge(a,r,3.59),window_edge(b,r,3.59),.026,"B19056")
        for ri,ro,color in ((.35,1.025,("4F8F81","D4A651","80A196")[i%3]),
                            (1.06,1.50,("7EA99F","AB7856","CCAC6A")[i%3])):
            outline=[(a+.012,ri),(a+.012,ro),(b-.012,ro),(b-.012,ri)]
            panes.rings([[window_edge(theta,r,y) for theta,r in outline] for y in (3.61,3.625)],color)
    # 서쪽 지붕의 차양은 능선을 모두 덮지 않는다. 실제 천의 처짐이 측면에서 보인다.
    for i in range(8):
        y = -2.9+i*.67
        xz = [(-3.36,2.83),(-3.02,3.28),(-2.59,3.60),(-2.12,3.91),(-1.64,4.18)]
        rings = []
        for x,z in xz:
            rings.append([(x,y,z),(x,y+.63,z),(x,y+.63,z-.032),(x,y,z-.032)])
        benches.rings(rings,"CFA360" if i%2 == 0 else "E4CD98")
    # 서랍, 모종 트레이와 물뿌리개를 놓아 작업대가 가까운 컷에서도 읽히게 한다.
    for i in range(5):
        y = -.65+i*.61
        benches.box((-2.15,y,.92),(.83,.58,.19),"8D7155")
        benches.box((-1.72,y,.94),(.035,.21,.045),"D5B982")
    for j in range(3):
        for i in range(5):
            x,y = (2.27+(j-1)*.17, .63+i*.19)
            terracotta.pot(x,y,1.095,.078,.12,"B56A4D")
            leaf(fronds,(x,y,1.21),i*.7+j,.085,.027,.09,"84A760")
    cx,cy = (-1.97,-1.09)
    terracotta.rings([[(cx+r*math.cos(TAU*i/16),cy+r*math.sin(TAU*i/16),z) for i in range(16)]
                      for r,z in ((.13,1.1),(.16,1.14),(.15,1.35),(.10,1.40))],"6A9490")
    frame.rail((cx+.13,cy,1.20),(cx+.32,cy,1.42),.033,"98A793")
    for i in range(8):
        a,b = math.pi*i/8,math.pi*(i+1)/8
        frame.rail((cx+.14*math.cos(a),cy,1.36+.15*math.sin(a)),
                   (cx+.14*math.cos(b),cy,1.36+.15*math.sin(b)),.012,"AAB19D",7)
    # 뒷벽 너머 층층이 보이는 수목. 길에 인물을 세웠을 때 얼굴 뒤쪽은 낮게 유지한다.
    for i in range(9):
        x = -3.50+i*.86
        h = (2.65+.8*math.sin(i*1.83)) if abs(x)>1.2 else 1.18
        y = 4.00+.13*math.sin(i)
        rings = []
        for radius,z in ((.12,.20),(.33,.46),(.37,.66*h),(.21,.87*h),(.027,h)):
            rings.append([(x+radius*math.cos(TAU*j/9), y+radius*.70*math.sin(TAU*j/9), z) for j in range(9)])
        fronds.rings(rings,("4D776B","678577","567D73")[i%3])
    # 색과 재질을 공유하는 부품은 한 draw call에서 그린다. 분리된 하드 서피스는 메시 편집기로 수정할 수 있다.
    floor.add(benches)
    floor.add(terracotta)
    fronds.add(blossoms)
    floor.name="01 Masonry, joinery and nursery pots"
    fronds.name="04 Planted beds, vines and tree line"
    return [group.build() for group in (floor,frame,panes,fronds)]


def review(scene, position=CAMERA, target=TARGET, fov=FOV, thumbnail=None):
    world = bpy.data.worlds.new("Daylight")
    world.use_nodes = True
    world.node_tree.nodes.get("Background").inputs[0].default_value = (.70,.81,.83,1)
    world.node_tree.nodes.get("Background").inputs[1].default_value = .65
    scene.world = world
    light = bpy.data.lights.new("West sun", "SUN")
    light.energy = 3.1
    light.angle = math.radians(6)
    light.color = (1.,.84,.66)
    sun = bpy.data.objects.new(light.name, light)
    scene.collection.objects.link(sun)
    sun.rotation_euler = Vector((.75,.42,-1.)).to_track_quat("-Z","Y").to_euler()
    cam = bpy.data.cameras.new("Garden aisle")
    camera = bpy.data.objects.new(cam.name,cam)
    scene.collection.objects.link(camera)
    camera.location = position
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat("-Z","Y").to_euler()
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 800,600
    scene.render.resolution_percentage = 100
    cam.angle_x = 2*math.atan(math.tan(math.radians(fov)/2)*800/600)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 14
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(thumbnail or OUT / "botanical_glasshouse.png")
    bpy.ops.render.render(write_still=True)


def main():
    if not bpy.app.background:
        raise RuntimeError("별도 Blender 백그라운드 프로세스에서 실행하세요.")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True, exist_ok=True)
    objects = make_scene()
    bounds = [Vector(p) for obj in objects for p in obj.bound_box]
    low = [min(p[k] for p in bounds) for k in range(3)]
    high = [max(p[k] for p in bounds) for k in range(3)]
    if abs(low[2]) > 1e-5:
        raise ValueError("온실 바닥 기준이 0m와 다릅니다.")
    model = OUT / "botanical_glasshouse.glb"
    bpy.ops.export_scene.gltf(filepath=str(model),export_format="GLB",export_yup=True,export_animations=False)
    review(bpy.context.scene)
    def gltf(p):
        return [p[0],p[2],-p[1]]
    receipt = {"fileName": model.name,"byteSize": model.stat().st_size,
               "sha256": "sha256:"+hashlib.sha256(model.read_bytes()).hexdigest(),
               "bounds": [round(high[i]-low[i],4) for i in (0,2,1)],
               "camera":{"position":gltf(CAMERA),"target":gltf(TARGET),"fovDegrees":FOV}}
    (OUT / "manifest.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")


if __name__ == "__main__":
    main()
