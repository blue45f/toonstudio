"""한강 공원 쉼터를 미터 단위의 자체 제작 폐곡면으로 조립한다. 외부 원본·이미지는 사용하지 않는다.

blender -b --factory-startup -t 3 --python-exit-code 1 -P scripts/blender/generate_riverside_park_pavilion.py -- --out /tmp/pavilion --detail /tmp/pavilion-detail.png
"""
import argparse
import hashlib
import json
import math
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_botanical_glasshouse import MeshGroup, surface
from generate_harbor_boat_repair_shed import render, timber, tube
from harbor_boatyard_surfaces import surfaces

OUT = Path(__file__).resolve().parents[2] / 'apps/web/public/assets/3d/environments/riverside-v2'
STEM = 'hangang_riverside_pavilion'
WHITE, IRON, STEEL, ROOF = 'FFFFFF', '314943', '859793', '48736D'
DECK = .19
WIDE = ((6.18, -8.68, 4.71), (0, .04, 1.44), 34)
DETAIL = ((3.71, -4.15, 1.68), (.69, .13, 1.8), 44)


def base_rim(width, depth, radius, z):
    rim = []
    for side, (cx, cy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        for i in range(7):
            a = (side + i / 6) * math.pi / 2
            rim.append((cx*(width/2-radius)+radius*math.cos(a), cy*(depth/2-radius)+radius*math.sin(a), z))
    return rim


def platform(stone, dock, hardware):
    # 끊기지 않는 상판 아래에 둥근 노징을 내고 판재 사이에는 실제 4mm 배수 홈을 둔다.
    stone.rings([base_rim(w, d, r, z) for w, d, r, z in
                 ((5.67,4.39,.19,0), (5.72,4.44,.21,.028), (5.72,4.44,.21,.124),
                  (5.69,4.41,.21,.146))], '9A9C91')
    for j in range(22):
        y = (j-10.5)*.192
        split = ((j*7)%13-6)*.259
        for l, r in ((-2.715,split-.002), (split+.002,2.715)):
            dock.box(((l+r)/2,y,.167),(r-l,.188,.046),WHITE)
            for x in (l+.039,r-.039):
                for dy in (-.056,.056):
                    hardware.rail((x,y+dy,.189),(x,y+dy,.1907),.0047,'758078',8)


def roof_z(y):
    # 물결을 닮은 비대칭 단면에서 남쪽 처마는 들리고 북쪽으로 완만하게 배수된다.
    t = (y+1.67)/3.42
    return 3.51 - .62*t + .18*math.sin(math.pi*t) - .095*math.sin(math.tau*t)


def roof_strip(group, x, width, top, thickness, color):
    rings = []
    for i in range(29):
        y = -1.67+3.42*i/28
        z = roof_z(y)+top
        rings.append([(x-width/2,y,z-thickness), (x+width/2,y,z-thickness),
                      (x+width/2,y,z), (x-width/2,y,z)])
    group.rings(rings,color)


def canopy(wood, hw):
    for i in range(13):
        x=(i-6)*.407
        roof_strip(hw,x,.4065,.034,.048,ROOF)
        roof_strip(hw,x-.200,.019,.065,.036,'42655E')
    for i in range(27):
        y=-1.616+i*.128
        wood.box((0,y,roof_z(y)-.045),(5.225,.122,.082),WHITE)
    for x in (-2.16,-.72,.72,2.16):
        roof_strip(wood,x,.114,-.073,.184,WHITE)
    # 양쪽 두 갈래 가새, 받침판과 볼트를 세트 내부의 고정 기초에 체결한다.
    for x in (-2.16,2.16):
        for y in (-.93,1.03):
            hw.box((x,y,DECK+.009),(.233,.222,.024),IRON)
            for dx in (-.086,.086):
                for dy in (-.080,.080):
                    hw.rail((x+dx,y+dy,.208),(x+dx,y+dy,.225),.011,'ABB0A1',6)
            hw.box((x,y,1.52),(.093,.108,2.655),IRON)
            for dy in (-.51,.51):
                end=(x, y+dy, roof_z(y+dy)-.244)
                timber(hw,(x,y,2.22),end,.068,.084,IRON)
                hw.rail((x-.063,end[1],end[2]+.03),(x+.064,end[1],end[2]+.03),.019,STEEL,10)
            timber(hw,(x,y,2.80),(x,y,roof_z(y)-.225),.094,.107,IRON)
    # 북쪽 홈통과 기둥 뒤쪽에 연결한 굽은 수직관.
    tube(hw,[(-2.60,1.723,2.846),(2.48,1.723,2.812)],.043,'54716A',14)
    tube(hw,[(2.18,1.723,2.816),(2.18,1.723,2.72),(2.18,1.15,2.58),
             (2.18,1.143,.32),(2.18,1.211,.235),(2.18,1.34,.215)],.032,IRON,12)


def furnishings(wood, hw, stone):
    # 뒤쪽 긴 벤치와 앞쪽 테이블은 소품별 받침과 고정 볼트를 실제 덱까지 내린다.
    for x in (-1.58,0,1.58):
        hw.box((x,1.20,.208),(.15,.52,.039),IRON)
        for y in (1.025,1.39):
            hw.box((x,y,.431),(.073,.078,.453),IRON)
        hw.box((x,1.209,.625),(.087,.536,.055),IRON)
        timber(hw,(x,1.393,.595),(x,1.54,1.083),.061,.062,IRON)
    for j in range(5):
        wood.box((0,1.00+j*.106,.679),(3.85,.097,.059),WHITE)
    for j in range(3):
        wood.box((0,1.448+j*.032,.821+j*.113),(3.85,.057,.098),WHITE)
    for x in (-1.22,-.04):
        hw.box((x,-.39,.203),(.186,.73,.033),IRON)
        for y in (-.68,-.1):
            timber(hw,(x,y,.20),(x,-.39+(y+.39)*.58,.902),.065,.072,IRON)
        hw.box((x,-.39,.908),(.102,.805,.058),IRON)
    for j in range(6):
        wood.box((-.64,-.724+j*.134,.958),(2.03,.128,.069),WHITE)
    for x in (-1.22,-.04):
        hw.box((x,-1.109,.205),(.127,.306,.034),IRON)
        hw.box((x,-1.109,.40),(.067,.081,.413),IRON)
        hw.box((x,-1.109,.603),(.081,.287,.038),IRON)
    for j in range(3):
        wood.box((-.64,-1.216+j*.107,.646),(1.99,.100,.061),WHITE)
    # U자 거치대의 둥근 절곡부와 양발이 같은 덱 안에 놓인다.
    for x in (1.22,1.73):
        ys=(-1.50,-.85)
        for y in ys:
            hw.rail((x,y,.181),(x,y,.207),.065,IRON,16)
        arch=[(x,ys[0],.197),(x,ys[0],.83)]
        for i in range(1,13):
            angle=math.pi-math.pi*i/12
            arch.append((x,-1.175+.325*math.cos(angle),.83+.325*math.sin(angle)))
        arch.append((x,ys[1],.197))
        tube(hw,arch,.023,STEEL,12)
    # 옆면 물받이 아래 청소구, 손잡이, 배수구가 달린 무장애 음수대.
    x, y=1.46,.27
    stone.rings([[(x+rx*p,y+ry*q,z) for p,q in ((-1,-1),(1,-1),(1,1),(-1,1))]
                 for rx,ry,z in ((.158,.132,.173),(.15,.127,.24),(.122,.115,.93),(.145,.14,.95))],'B9B8A6')
    bowl=[]
    for r,z in ((.074,.908),(.205,.965),(.198,.991),(.169,.985),(.054,.938)):
        bowl.append([(x-.089+r*math.cos(i*math.tau/32),y+r*.83*math.sin(i*math.tau/32),z) for i in range(32)])
    hw.rings(bowl,'A7B3AC')
    hw.rail((x-.089,y,.937),(x-.089,y,.940),.036,IRON,18)
    tube(hw,[(x+.072,y+.096,.963),(x+.072,y+.096,1.055),
             (x+.061,y+.088,1.078),(x+.013,y+.047,1.078),(x+.003,y+.038,1.058)],.012,STEEL,10)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,default=OUT)
    parser.add_argument('--detail',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if not bpy.app.background:
        raise RuntimeError('독립 Blender 백그라운드에서 실행하세요.')
    args.out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC'
    with tempfile.TemporaryDirectory() as tmp:
        wood=MeshGroup('01 Glulam beams and oak seating',surfaces(Path(tmp),'Oak',256))
        dock=MeshGroup('02 Drain-gapped deck boards',surfaces(Path(tmp),'Dock',256))
        hw=MeshGroup('03 Patinated roof and fixings',surface('River green enamel and metal',.49,.39))
        stone=MeshGroup('04 Plinth and drinking fountain',surface('Stone aggregate',.84))
        platform(stone,dock,hw)
        canopy(wood,hw)
        furnishings(wood,hw,stone)
        objects=[g.build() for g in (wood,dock,hw,stone)]
        for obj in objects[:2]:
            for attr in list(obj.data.color_attributes): obj.data.color_attributes.remove(attr)
        corners=[Vector(c) for obj in objects for c in obj.bound_box]
        if abs(min(p.z for p in corners))>1e-6: raise ValueError('기단이 바닥에서 떨어졌습니다.')
        model=args.out/(STEM+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(model),export_format='GLB',export_animations=False,
                                  export_copyright='ToonStudio. CC0 1.0 Universal. Original geometry, UVs and PBR images.')
        scene.world=bpy.data.worlds.new('Riverside skylight')
        scene.world.use_nodes=True
        bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
        bg.inputs[0].default_value=(.46,.61,.67,1)
        bg.inputs[1].default_value=.91
        sun=bpy.data.lights.new('Low river sun','SUN')
        sun.energy=3.0
        sun.angle=math.radians(9)
        sun.color=(1.,.855,.68)
        light=bpy.data.objects.new(sun.name,sun)
        scene.collection.objects.link(light)
        light.rotation_euler=Vector((.57,.56,-1.)).to_track_quat('-Z','Y').to_euler()
        scene.render.engine='CYCLES'
        scene.cycles.samples=22
        scene.cycles.use_denoising=True
        scene.view_settings.look='AgX - Medium High Contrast'
        render(args.out/(STEM+'.png'),*WIDE)
        if args.detail: render(args.detail,*DETAIL)
    def camera(settings):
        p,t,f=settings
        return {'position':[p[0],p[2],-p[1]],'target':[t[0],t[2],-t[1]],'fovDegrees':f}
    metadata={'fileName':model.name,'byteSize':model.stat().st_size,'sha256':'sha256:'+hashlib.sha256(model.read_bytes()).hexdigest(),
              'bounds':[round(max(c[k] for c in corners)-min(c[k] for c in corners),5) for k in (0,2,1)],
              'camera':camera(WIDE),'detailCamera':camera(DETAIL)}
    (args.out/'manifest.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    main()
