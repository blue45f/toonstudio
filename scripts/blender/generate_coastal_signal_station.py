"""Blender 5.3으로 우리 바닷가의 방파제와 유인 신호소를 만든다. 직접 제작한 CC0 환경이다.

blender -b -t 3 --python-exit-code 1 -P scripts/blender/generate_coastal_signal_station.py
"""
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_botanical_glasshouse import MeshGroup, linear, surface

OUT = Path(__file__).resolve().parents[2] / "apps/web/public/assets/3d/environments/coast-v1"
CAMERA = (5.5, -12.1, 4.65)
TARGET = (.30, 3.55, 3.35)
FOV = 39
TAU = math.tau
RNG = random.Random(44197)
LIGHTHOUSE = (.75, 4.2)
DECK = 1.72


def turning(group, xy, profile, color, sides=32):
    x, y = xy
    rings = [[(x+r*math.cos(TAU*i/sides), y+r*math.sin(TAU*i/sides), z)
              for i in range(sides)] for r, z in profile]
    group.rings(rings, color)


def extrude(group, outline, low, high, color):
    group.rings([[(x, y, z) for x, y in outline] for z in (low, high)], color)


def walkway(group):
    # 서쪽 난간을 따라 접근하면 등대 오른편으로 배가 지나갈 수 있게 바다가 열린다.
    left, right = -2.18, 1.27
    head = [(left, -9), (right, -9), (right, .90), (2.62, 1.84), (2.61, 5.68),
            (1.89, 6.48), (-1.2, 6.45), (left, 5.58)]
    extrude(group, head, .08, DECK-.075, "889095")
    extrude(group, head, DECK-.065, DECK, "CABFAB")
    for i in range(11):
        y = -8.65 + 1.26*i
        for side in (left-.01, right+.01) if y < .95 else (left-.01,):
            group.box((side, y, 1.04), (.025, .019, 1.03), "748587")
        group.box((-.48, y, DECK+.006), (3.27, .019, .012), "9A998E")
    # 항만에서 교체하는 개별 가장자리 석재와 물이 빠지는 얕은 홈.
    for j in range(32):
        y = -8.81+j*.44
        for side in (left+.09, right-.09) if y < 1.03 else (left+.09,):
            group.box((side, y, DECK+.037), (.16, .416, .074), RNG.choice(("C8BEA7","D9CDB3","B6AD9D")))
    for j in range(6):
        y = -7.6+j*1.54
        group.box((right-.38, y, DECK+.011), (.22,.36,.02), "697876")
        for k in range(3):
            group.box((right-.38,y+(k-1)*.092, DECK+.025), (.16,.02,.01), "384E52")


def pier_fittings(iron, masonry):
    for i in range(9):
        x, y = -2.07, -8.4+1.66*i
        turning(iron,(x,y),[(.11,DECK+.08),(.11,DECK+.15),(.063,DECK+.17),
                              (.058,DECK+.90),(.072,DECK+.95),(.045,DECK+.98)],"526E70",12)
    for z in (DECK+.48, DECK+.86):
        iron.rail((-2.07,-8.4,z),(-2.07,-8.4+8*1.66,z),.028,"8EA2A0",7)
    for x,y in ((.80,-6.45),(.80,-1.1),(2.02,3.17),(-1.73,5.62)):
        turning(iron,(x,y),[(.23,DECK+.017),(.23,DECK+.08),(.14,DECK+.10),(.13,DECK+.34),
                           (.20,DECK+.36),(.20,DECK+.43),(.15,DECK+.46)],"374A4D",20)
        for dx,dy in ((.15,0),(-.15,0),(0,.15),(0,-.15)):
            turning(iron,(x+dx,y+dy),[(.021,DECK+.081),(.021,DECK+.105)],"B7B49B",6)
    # 낮은 계단 두 개와 인양 사다리를 보행 동선 밖에 배치한다.
    for n in range(2):
        masonry.box((.75,2.81+n*.21,DECK+.09+n*.075),(.86,.24,.18+n*.15),"CDBCAA")
    for y in (-4.1,-3.57):
        iron.rail((1.37,y,.44),(1.37,y,DECK+.29),.035,"859A92")
        iron.rail((1.37,y,DECK+.29),(1.18,y,DECK+.34),.035,"859A92")
    for k in range(6):
        iron.rail((1.37,-4.1,.49+k*.23),(1.37,-3.57,.49+k*.23),.027,"889B91")


def harbor_equipment(iron, stone):
    # 인명 구조환은 네 구간의 흰 띠가 있는 하나의 닫힌 링이다.
    center=(1.295,-.25,1.15)
    rings=40;section=10;out=[];faces=[]
    for i in range(rings):
        angle=TAU*i/rings
        for j in range(section):
            theta=TAU*j/section
            radius=.304+.070*math.cos(theta)
            out.append((center[0]+.070*math.sin(theta),center[1]+radius*math.cos(angle),center[2]+radius*math.sin(angle)))
            a=i*section+j;b=i*section+(j+1)%section
            faces.append((a,b,((i+1)%rings)*section+(j+1)%section,((i+1)%rings)*section+j))
    start=len(iron.colors);iron.solid(out,faces,"E8713E")
    for i in range(rings):
        if i%10 < 3:
            for j in range(section):
                iron.colors[start+i*section+j]=linear("E9DCC4")
    iron.rail((1.27,-.25,1.59),(1.40,-.25,1.59),.033,"46585C",8)
    # 보행로 안쪽에는 밧줄을 걸어 두고 가운데는 비워 둔다.
    for lap in range(3):
        points=[]
        for k in range(22):
            a=TAU*k/22
            points.append((.39+(.28+.036*lap)*math.cos(a),-6.22+(.37+.036*lap)*math.sin(a),DECK+.032+.006*math.sin(2*a)))
        for k in range(len(points)):
            iron.rail(points[k],points[(k+1)%len(points)],.020,"A2845A",6)
    # 고정식 항로표지의 작고 낮은 정비함. 조작부는 바다의 염분을 막는 여닫이 철제 문 뒤에 있다.
    x,y=-1.27,4.77
    stone.box((x,y,DECK+.078),(.99,.83,.15),"B6B3A4")
    iron.box((x,y,DECK+.55),(.87,.70,.82),"6D9894")
    iron.box((x,y,DECK+.99),(.96,.79,.075),"526D6E")
    iron.box((x,y-.36,DECK+.58),(.69,.022,.62),"8AA9A0")
    for n in range(6):
        iron.box((x-.10,y-.38,DECK+.49+n*.038),(.34,.017,.014),"45696A")
    iron.box((x+.22,y-.38,DECK+.59),(.026,.028,.11),"B4B7A6")


def beacon(concrete, iron, lantern):
    x, y = LIGHTHOUSE
    z = DECK+.012
    # 계단식 주춧돌, 조금씩 좁아지는 탑신과 소금에 바랜 도장 띠.
    turning(concrete,(x,y),[(1.16,z),(1.16,z+.10),(1.07,z+.15),(1.04,z+.28),(.93,z+.37)],"D8C8AA")
    turning(concrete,(x,y),[(.91,z+.365),(.925,z+.48),(.88,z+.85),(.86,z+1.18)],"C65040",40)
    turning(concrete,(x,y),[(.859,z+1.181),(.82,z+1.64)],"E1D5B9",40)
    turning(concrete,(x,y),[(.818,z+1.641),(.70,z+3.25),(.645,z+4.29)],"C84736",40)
    for height,r in ((.53,.92),(2.84,.744),(4.24,.665)):
        turning(iron,(x,y),[(r,height+z),(r+.014,height+z+.032),(r,height+z+.063)],"A84737",40)
    floor=z+4.4
    turning(iron,(x,y),[(.65,floor-.12),(.77,floor-.08),(1.05,floor+.006),
                        (1.05,floor+.094),(1.00,floor+.14)],"A64538",36)
    for a in range(18):
        phi=TAU*a/18
        xx,yy=x+.94*math.cos(phi),y+.94*math.sin(phi)
        iron.rail((xx,yy,floor+.10),(xx,yy,floor+.68),.026,"843C34",8)
        phi2=TAU*(a+1)/18
        for h in (.39,.65):
            iron.rail((xx,yy,floor+h),(x+.94*math.cos(phi2),y+.94*math.sin(phi2),floor+h),.018,"813E36",7)
    turning(iron,(x,y),[(.62,floor+.145),(.64,floor+.24),(.57,floor+.32)],"E1C9A0")
    turning(lantern,(x,y),[(.545,floor+.324),(.545,floor+1.12)],"A5E0DE",12)
    turning(iron,(x,y),[(.26,floor+.33),(.16,floor+.47),(.16,floor+.63)],"A77935",16)
    turning(iron,(x,y),[(.16,floor+.635),(.27,floor+.75),(.27,floor+.85),(.16,floor+.97)],"FFDD88",20)
    for j in range(12):
        phi=TAU*j/12
        px,py=x+.551*math.cos(phi),y+.551*math.sin(phi)
        iron.rail((px,py,floor+.31),(px,py,floor+1.13),.026,"435659",7)
    turning(iron,(x,y),[(.57,floor+1.122),(.70,floor+1.17),(.73,floor+1.23),(.67,floor+1.27),
                       (.47,floor+1.51),(.16,floor+1.68),(.065,floor+1.72)],"A94334",32)
    turning(iron,(x,y),[(.061,floor+1.725),(.057,floor+1.86),(.015,floor+2.03)],"6E4134",16)
    # 육지 쪽 출입문과 젖빛 유리 관측창.
    iron.box((x,y-.87,z+.97),(.58,.095,1.32),"733E36")
    iron.box((x,y-.925,z+.965),(.49,.029,1.19),"315D66")
    iron.box((x,y-.945,z+1.21),(.32,.015,.32),"8CAEA9")
    iron.box((x+.165,y-.965,z+.87),(.069,.034,.022),"D1B080")
    for zz,rad in ((2.24,.788),(3.47,.71)):
        iron.box((x,y-rad,z+zz),(.34,.07,.48),"E0CEAB")
        iron.box((x,y-rad-.046,z+zz),(.24,.03,.36),"486A74")
        iron.box((x,y-rad-.06,z+zz),(.025,.016,.35),"A8B7AA")


def sea(group):
    nx,ny=25,26
    points=[]; colors=[]; faces=[]
    for j in range(ny+1):
        for i in range(nx+1):
            x,y=-14+i*28/nx,-9.2+j*26/ny
            z=.36+.025*math.sin(.74*x+1.45*y)+.014*math.sin(2.18*x-.75*y)
            points.append((x,y,z))
            band=math.sin(1.1*y+.45*x+.25*math.sin(1.1*x))
            colors.append(linear(("5A9E9C","62A6A2","6AB0A8","71B2A8")[min(3,int((band+1)*1.8))]))
    stride=nx+1
    for j in range(ny):
        for i in range(nx):
            a=j*stride+i;faces.extend(((a,a+1,a+stride+1),(a,a+stride+1,a+stride)))
    edge=[*range(nx+1),*(j*stride+nx for j in range(1,ny+1)),*(ny*stride+i for i in range(nx-1,-1,-1)),*(j*stride for j in range(ny-1,0,-1))]
    bottom=[]
    for e in edge:
        bottom.append(len(points));points.append((*points[e][:2],0));colors.append(linear("528D91"))
    for i,a in enumerate(edge):
        b=(i+1)%len(edge);faces.append((a,bottom[i],bottom[b],edge[b]))
    # 분할된 테두리와 같은 수의 삼각형으로 바닥까지 닫아 긴 공선 면을 없앤다.
    mid=len(points);points.append((0,3.8,0));colors.append(linear("528D91"))
    for i in range(len(bottom)):
        faces.append((mid,bottom[(i+1)%len(bottom)],bottom[i]))
    group.solid(points,faces,"639C99");group.colors[:]=colors


def reef(group,x,y,sx,sy,h,color):
    n=9
    contour=[(math.cos(TAU*i/n)*RNG.uniform(.81,1.07),math.sin(TAU*i/n)*RNG.uniform(.83,1.09)) for i in range(n)]
    group.rings([[(x+px*sx*r+.16*h*t,y+py*sy*r,z+.07*h*math.sin(i+.4)*t)
                  for i,(px,py) in enumerate(contour)] for r,z,t in
                 ((.79,.10,0),(1,.33,0),(.85,.33+h*.51,.5),(.44,.33+h,1))],color)


def shore(group,foam):
    for cx,cy,spread,height in ((-7,8.5,1.4,1.05),(5.9,8.8,1.65,1.43),(-5.0,3.8,.8,.55),(8.1,4.4,.95,.66)):
        for j in range(8):
            x,y=cx+RNG.uniform(-1.1,1.1)*spread,cy+RNG.uniform(-.66,.66)*spread
            reef(group,x,y,RNG.uniform(.42,.93)*spread,RNG.uniform(.4,.75)*spread,
                 RNG.uniform(.35,1.04)*height,RNG.choice(("596767","777B70","818779","667571","505D5C")))
        for j in range(20):
            a=RNG.uniform(0,TAU);x=cx+1.74*spread*math.cos(a);y=cy+1.05*spread*math.sin(a)
            wave(foam,x,y,RNG.uniform(.12,.44),.013,RNG.choice(("A3CDC2","CEE3CE")))
    # 먼 곳의 낮은 섬은 암초와 다른 높이·명도로 수평선 깊이를 만든다.
    for xx,yy,sx,sy,h in ((-10.4,13.9,3.4,1.05,.57),(-7.0,14.4,2.8,1.3,.77), (6.7,15.0,2.9,.84,.56),(10.4,14.9,2.1,.92,.79)):
        reef(group,xx,yy,sx,sy,h,RNG.choice(("7F9894","96A59B","839A96")))
    # 방파제 바깥에 놓인 네 발 소파 블록. 한 개씩 자세와 색을 달리한다.
    for j in range(25):
        y=-6.7+j*.47;x=-2.55-RNG.uniform(0,.83)
        z=.59+RNG.uniform(0,.24);a=RNG.uniform(0,TAU);color=RNG.choice(("B2ADA0","9CA5A1","B9B3A0"))
        for k in range(4):
            phi=a+k*TAU/3
            end=(x+.61*math.cos(phi),y+.61*math.sin(phi),z-.25) if k<3 else (x+.16*math.cos(a),y+.16*math.sin(a),z+.61)
            group.rail((x,y,z),end,.19,color,6)
    for j in range(120):
        x=RNG.uniform(-12,12);y=RNG.uniform(-7.8,14)
        if -2.5<x<2.7 and y<6.6:continue
        wave(foam,x,y,RNG.uniform(.1,.85),RNG.uniform(.007,.022),RNG.choice(("A0C8BB","83BCB4","89BDB4")))


def wave(group,x,y,length,width,color):
    outline=[(x-length,y),(x-length*.27,y+width),(x+length*.28,y+width*1.4),
             (x+length,y+width*.7),(x+length*.21,y-width*.45),(x-length*.29,y-width*.8)]
    extrude(group,outline,.399,.404,color)


def main():
    if not bpy.app.background:
        raise RuntimeError("별도 Blender 백그라운드 프로세스로 실행하세요.")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True,exist_ok=True)
    stone=MeshGroup("01 Seawall, granite reefs and wave breakers",surface("Stone and salt",.86))
    metal=MeshGroup("02 Signal tower, ironmongery and lamp",surface("Painted maritime fittings",.46,.12))
    water=MeshGroup("03 Tidal water and whitecaps",surface("Coastal water",.27,.09))
    glass=MeshGroup("04 Sea lantern glazing",surface("Signal glass",.20,.04,.32))
    walkway(stone);pier_fittings(metal,stone);beacon(stone,metal,glass);harbor_equipment(metal,stone);sea(water);shore(stone,water)
    objects=[g.build() for g in (stone,metal,water,glass)]
    corners=[Vector(p) for obj in objects for p in obj.bound_box]
    low=[min(p[i] for p in corners) for i in range(3)];high=[max(p[i] for p in corners) for i in range(3)]
    if abs(low[2])>1e-5:raise ValueError("해안 세트 바닥은 0m여야 합니다.")
    model=OUT/"coastal_signal_station.glb"
    bpy.ops.export_scene.gltf(filepath=str(model),export_format="GLB",export_yup=True,export_animations=False)
    scene=bpy.context.scene
    scene.world=bpy.data.worlds.new("Hazy coastal afternoon");scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get("Background");bg.inputs[0].default_value=(.57,.75,.83,1);bg.inputs[1].default_value=.82
    light=bpy.data.lights.new("Warm western sun","SUN");light.energy=3.15;light.angle=math.radians(7);light.color=(1.,.90,.71)
    sun=bpy.data.objects.new(light.name,light);scene.collection.objects.link(sun)
    sun.rotation_euler=Vector((.65,.29,-1.)).to_track_quat("-Z","Y").to_euler()
    cam=bpy.data.cameras.new("Seaward approach");camera=bpy.data.objects.new(cam.name,cam);scene.collection.objects.link(camera)
    camera.location=CAMERA;camera.rotation_euler=(Vector(TARGET)-camera.location).to_track_quat("-Z","Y").to_euler();scene.camera=camera
    scene.render.resolution_x,scene.render.resolution_y=800,600;scene.render.resolution_percentage=100
    cam.angle_x=2*math.atan(math.tan(math.radians(FOV)/2)*800/600)
    scene.render.engine="CYCLES";scene.view_settings.look="AgX - Medium High Contrast";scene.cycles.samples=18;scene.cycles.use_denoising=True
    scene.render.image_settings.file_format="PNG";scene.render.filepath=str(OUT/"coastal_signal_station.png")
    bpy.ops.render.render(write_still=True)
    gltf=lambda p:[p[0],p[2],-p[1]]
    (OUT/"manifest.json").write_text(json.dumps({"fileName":model.name,"byteSize":model.stat().st_size,
        "sha256":"sha256:"+hashlib.sha256(model.read_bytes()).hexdigest(),"bounds":[round(high[i]-low[i],4) for i in (0,2,1)],
        "camera":{"position":gltf(CAMERA),"target":gltf(TARGET),"fovDegrees":FOV}},indent=2)+"\n",encoding="utf-8")


if __name__ == "__main__":
    main()
