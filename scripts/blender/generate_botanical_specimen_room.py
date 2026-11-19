"""식물 세밀화 작업실. 미터 단위 원본 메시와 직접 계산한 물푸레나무 결을 GLB에 담는다.

blender -b -t 3 --python-exit-code 1 -P scripts/blender/generate_botanical_specimen_room.py
"""
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_botanical_glasshouse import MeshGroup, TAU, leaf, plant, review, surface

OUT = Path(__file__).resolve().parents[2] / "apps/web/public/assets/3d/environments/specimen-v1"
BASENAME = "botanical_illustration_room"
CAMERA = (2.14, -3.36, 2.09)
TARGET = (-0.48, 0.53, 1.34)
FOV = 37
rng = random.Random(71923)


def timber():
    """한 타일 안에서 연륜이 이어진다. 일반 glTF 뷰어에서도 같은 결을 읽는다."""
    mat = bpy.data.materials.new("Oiled ash • radial cut")
    mat.use_nodes = True
    y, x = np.mgrid[0:512, 0:1024] / np.array([512, 1024])[:, None, None]
    warp = 0.16*np.sin(TAU*x) + 0.08*np.sin(TAU*(3*x+y)) + 0.045*np.cos(TAU*(x+9*y))
    rings = np.cos(TAU*(22*y + warp + 0.4*np.cos(TAU*y)))
    pores = np.maximum(0, np.sin(TAU*(79*y + 1.1*warp + 0.1*np.sin(TAU*9*x)))) ** 8
    fiber = 0.64 + 0.06*rings - 0.095*pores + 0.022*np.cos(TAU*(317*y+11*x))
    rgba = np.ones((512,1024,4), dtype=np.float32)
    for c, (lo, hi) in enumerate(((.25,.59),(.105,.37),(.043,.20))):
        rgba[:,:,c] = lo + fiber*(hi-lo)
    texture = bpy.data.images.new("Quarter-sawn ash", width=1024, height=512, alpha=False)
    texture.pixels.foreach_set(rgba.ravel())
    texture.pack()
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = texture
    shader = mat.node_tree.nodes.get("Principled BSDF")
    mat.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = .57
    return mat


def turned(group, x, y, profile, color, sides=20):
    group.rings([[(x+r*math.cos(i*TAU/sides),y+r*math.sin(i*TAU/sides),z)
                  for i in range(sides)] for r,z in profile],color)


def pipe(group, points, radius, color, sides=8):
    # 길이 방향의 이음원만 공유해 굽힘 부분에도 열린 면이 없다.
    points = [Vector(p) for p in points]
    rings = []
    for i, p in enumerate(points):
        tangent = (points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
        ref = Vector((0,1,0)) if abs(tangent.y)<.9 else Vector((1,0,0))
        across = tangent.cross(ref).normalized()
        depth = tangent.cross(across).normalized()
        rings.append([p + radius*(math.cos(TAU*j/sides)*across+math.sin(TAU*j/sides)*depth)
                      for j in range(sides)])
    group.rings(rings,color)


def make_room():
    wood = MeshGroup("Quarter-sawn workbench and frames",timber())
    enamel = MeshGroup("Plaster, stone, ceramics and stationery",surface("Satin ceramic, limewash and leaves",.68))
    brass = MeshGroup("Joinery, brass and measuring instruments",surface("Partly tarnished brass",.34,.58))
    flora = MeshGroup("Living and mounted botanical specimens",surface("Leaf cuticle and pressed petals",.54))
    glazing = MeshGroup("Window and specimen glass",surface("Clear bottle glass",.12,.02,.23))
    enamel.box((0,.42,.048),(5.4,4.35,.096),"81786A")
    for row in range(10):
        for col in range(12):
            x,y=(col-5.5)*.446,(row-4.5)*.428+.42
            enamel.box((x,y,.103),(.440,.422,.018),rng.choice(("BEAA8D","C5B093","CAB493","BFA98C")))
            if (row+col)%2==0:
                # 모서리를 돌려 끼운 황토색 타일.
                r=.064
                enamel.rings([[(x+r*math.cos(TAU*i/4),y+r*math.sin(TAU*i/4),z) for i in range(4)]
                              for z in (.114,.117)],"9F7659")
    for y in (2.45,):
        enamel.box((0,y,.62),(5.4,.16,1.02),"527770")
        enamel.box((0,y,3.27),(5.4,.16,.42),"E3D6B8")
        for x in (-2.38,0,2.38):
            enamel.box((x,y,2.11),(.59,.16,2.0),"D5C4A4")
        wood.box((0,y-.07,1.13),(5.4,.23,.08),"FFFFFF")
        for side in (-1,1):
            xc=side*1.20
            glazing.box((xc,y,2.08),(1.77,.016,1.80),"B7DCD2")
            for i in range(5):
                wood.box((xc+(i-2)*.444,y-.08,2.10),(.035,.062,1.88),"FFFFFF")
            for i in range(4):
                wood.box((xc,y-.09,1.18+i*.605),(1.81,.071,.035),"FFFFFF")
        for i in range(26):
            x=(i-12.5)*.205
            enamel.box((x,y-.091,.60),(.196,.030,.91),"62847A" if i%3 else "5A7D74")
    wood.box((-.48,.32,.99),(3.18,1.13,.07),"FFFFFF")
    for y in (-.19,.82):
        wood.box((-.48,y,.84),(3.04,.072,.23),"FFFFFF")
    for x in (-1.92,.96):
        for y in (-.10,.72):
            turned(wood,x,y,[(r,z) for z,r in ((.12,.075),(.16,.085),(.20,.059),(.29,.052),(.33,.068),(.36,.058),(.70,.072),(.74,.093),(.77,.077),(.96,.077))],"FFFFFF",16)
            brass.rail((x,y,.124),(x,y,.154),.08,"9B8154",16)
        wood.box((x,.31,.34),(.07,.86,.09),"FFFFFF")
    for x in (-1.53,-.71,.13):
        wood.box((x,-.246,.843),(.77,.04,.188),"FFFFFF")
        for xx in (x-.12,x+.12):
            brass.rail((xx,-.266,.855),(xx,-.301,.855),.021,"9B7745",12)
        pipe(brass,[(x-.12,-.301,.855),(x-.10,-.325,.825),(x+.10,-.325,.825),(x+.12,-.301,.855)],.009,"C3A061")
    # 표본대, 압지, 종이 테이프와 손으로 누른 가지. 종이 주위에 실제 필기 공간을 남긴다.
    for x,y,w,h in ((-.59,.15,.68,.48),(.04,.17,.40,.37)):
        enamel.box((x,y,1.035),(w+.025,h+.025,.014),"605445")
        for i in range(3):enamel.box((x+i*.0015,y+i*.002,1.045+i*.0027),(w,h,.002),"F2E5C9")
        for i in range(6):
            enamel.box((x+w*.21,y-h*.31+i*.009,1.055),(.105-.008*(i%3),.0017,.0012),"908871")
    stem=[(-.84+.43*t,.01+.26*t,1.058+.0012*math.sin(t*math.pi)) for t in np.linspace(0,1,15)]
    pipe(flora,stem,.0028,"5B704B")
    for i,p in enumerate(stem[2:-1]):
        sign=1 if i%2 else -1
        leaf(flora,p,sign*.91+.35,.060+.049*math.sin(math.pi*i/12),.015,.0015,"72805B" if i%2 else "8E925F")
    for x,y in ((-.77,.052),(-.56,.18)):
        enamel.box((x,y,1.066),(.013,.032,.0013),"D3BF88")
    # 표본 식물의 묘목, 갈색 유리와 코르크 마개, 병마다 눈금과 라벨.
    for i in range(6):
        x,y=-1.79+.186*i,.65
        r=.041+.004*(i%3); z=1.026
        turned(glazing,x,y,[(.85*r,z),(r,z+.007),(r,z+.107),(.60*r,z+.13),(.55*r,z+.16),(.65*r,z+.161),(.65*r,z+.171)],"9E7444",20)
        turned(enamel,x,y,[(r*.54,z+.167),(r*.61,z+.186)],"967655",12)
        enamel.box((x,y-r-.001,z+.062),(.054,.003,.050),"EAD8AF")
        for k in range(3):
            enamel.box((x,y-r-.003,z+.055+k*.008),(.029-.004*k,.0018,.0013),"776952")
    # 무게추가 달린 진자식 작업등, 안쪽 유백색 반사판과 실물 크기의 나사산.
    bx,by=.55,.59
    turned(brass,bx,by,[(.137,1.028),(.142,1.04),(.128,1.055),(.082,1.066),(.045,1.09)],"927142",28)
    links=[(bx,by,1.08),(bx,by,1.21),(bx+.13,by,1.59),(bx-.12,by,1.84),(bx-.28,by,1.76)]
    for a,b in zip(links,links[1:]):
        for delta in (-.015,.015):
            brass.rail((a[0],a[1]+delta,a[2]),(b[0],b[1]+delta,b[2]),.010,"AA8D5A",10)
    for x,y,z in links[1:-1]:
        brass.rail((x,y-.034,z),(x,y+.034,z),.025,"D2AD65",14)
    lx,ly=links[-1][:2]
    turned(enamel,lx,ly,[(.181,1.599),(.183,1.61),(.128,1.72),(.043,1.76),(.036,1.77)],"356964",32)
    turned(enamel,lx,ly,[(.171,1.598),(.174,1.601)],"EFE0BC",32)
    # 자 눈금은 5 mm 단위, 1 cm·5 cm마다 선 길이가 다르다.
    enamel.box((-.48,-.118,1.031),(.52,.036,.008),"D4B27B")
    for i in range(101):
        length=.015 if i%10==0 else .010 if i%2==0 else .006
        enamel.box((-.73+i*.005,-.134+length*.5,1.036),(.0008,length,.0008),"5F5143")
    for i in range(4):
        y=-.103+.024*i
        brass.rail((.11,y,1.035),(.28,y,1.035),.0045,("91584E","778678","C2A267","6C818F")[i],8)
        brass.rail((.28,y,1.035),(.298,y,1.035),.0031,"655342",6)
    # 뒷벽 서가와 약장, 얇은 책등의 천·금박, 벽에 건 압화.
    for level in (1.32,1.76,2.20):
        wood.box((-2.29,1.53,level),(.63,1.62,.045),"FFFFFF")
        for i in range(13):
            y= .88+i*.099
            h=.225+rng.random()*.11
            color=rng.choice(("884C41","586F68","BC9865","63677B","987650","7D8074"))
            enamel.box((-2.25,y,level+.027+h/2),(.42,.089,h),color)
            for dz in (.052,h-.030):
                brass.box((-2.037,y,level+dz),(.004,.075,.006),"BE9861")
    for y in (.78,2.28):
        for x in (-2.55,-2.02):
            wood.box((x,y,1.34),(.048,.048,2.44),"FFFFFF")
    for x,y,r,h in ((-1.63,.35,.146,.65),(1.72,1.37,.36,1.64),(1.49,2.01,.25,1.09)):
        z=1.027 if x<0 else .118
        enamel.pot(x,y,z,r,r*1.35,"AB7559")
        turned(enamel,x,y,[(r*.84,z+r*1.17),(r*.84,z+r*1.18)],"5B5142")
        plant(flora,x,y,z+r*1.18,h,"fern" if x<0 else "broad")
    for x in (-2.06,.43):
        for z in (1.48,2.05):
            wood.box((x,2.315,z),(.38,.046,.45),"FFFFFF")
            enamel.box((x,2.288,z),(.34,.015,.41),"EFE1C5")
            stem_points=[(x-.055,2.276,z-.127)]
            for k in range(6):
                t=k/6
                tip=(x-.055+.11*t,2.273,z-.12+.24*t)
                stem_points.append(tip)
                sign=(-1)**k
                a=(tip[0]+.051*sign,2.272,tip[2]+.032)
                brass.rail(tip,a,.008,"83906A",8)
            pipe(brass,stem_points,.0026,"6A7554",6)
    # 창밖 에스팔리에의 가지를 서로 다른 깊이에 두어 창틀 사이로 잎의 겹침이 보인다.
    for tree, (cx, cy) in enumerate(((-1.56,3.20),(.43,3.61),(1.98,3.27))):
        last=(cx,cy,.15)
        for tier in range(1,7):
            z=.32+tier*.42
            fork=(cx+.09*math.sin(tier+tree),cy+.046*math.cos(tier),z)
            brass.rail(last,fork,max(.018,.05-tier*.004),"746850",9)
            for side in (-1,1):
                tip=(fork[0]+side*(.43+.19*math.sin(tier)),cy-.09,z+.17)
                brass.rail(fork,tip,.014,"887352",7)
                for k in range(7):
                    t=(k+1)/8
                    root=(fork[0]+(tip[0]-fork[0])*t,cy-.09*t,z+.17*t)
                    leaf(flora,root,side*.48+1.57+(k%2)*2.13,.14,.052,.09,
                         rng.choice(("547F66","718F69","A5AE79","638973")))
            last=fork
    # 넓게 펼친 린넨 천. 실제 두께와 곡률을 가진 단면이 작업대 앞을 따라 내려온다.
    cloth=[]
    for i in range(21):
        x=.46+i*.021
        d=.018*math.sin(i*.77)+.008*math.sin(i*1.61)
        curve=[(.44,1.034),(.20,1.036),(-.12,1.035),(-.232,1.027),(-.257,.989),(-.270,.914),(-.282,.84+.21*d)]
        ridge=[(x,y+d*(1-z),z+.20*d) for y,z in curve]
        cloth.append(ridge+[(xx,yy+.002,zz-.0035) for xx,yy,zz in reversed(ridge)])
    enamel.rings(cloth,"B8AB89")
    # 바늘 구멍 두 곳과 종이를 묶는 면끈을 가진 표본 압착기.
    px,py=-1.30,.12
    wood.box((px,py,1.056),(.35,.25,.032),"FFFFFF")
    for i in range(6):
        enamel.box((px,py,1.076+i*.005),(.335,.237,.004),"ECE0C4" if i%2 else "D3C19C")
    wood.box((px,py,1.115),(.35,.25,.023),"FFFFFF")
    for xx in (px-.118,px+.118):
        for yy in (py-.076,py+.076):
            turned(brass,xx,yy,[(.004,1.098),(.004,1.16)],"947D55",9)
            turned(brass,xx,yy,[(.012,1.128),(.013,1.138),(.009,1.143)],"BA9B61",6)
        enamel.box((xx,py,1.128),(.013,.245,.003),"867D60")
    enamel.add(flora)
    return [g.build() for g in (enamel,wood,brass,glazing)]


def main():
    if not bpy.app.background:
        raise RuntimeError("백그라운드 Blender에서 실행하세요.")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True,exist_ok=True)
    model=OUT/(BASENAME+".glb")
    objects=make_room()
    points=[Vector(p) for obj in objects for p in obj.bound_box]
    low=[min(p[k] for p in points) for k in range(3)]
    high=[max(p[k] for p in points) for k in range(3)]
    assert abs(low[2]) < .00001
    bpy.ops.export_scene.gltf(filepath=str(model),export_format="GLB",export_yup=True,export_animations=False)
    review(bpy.context.scene,CAMERA,TARGET,FOV,OUT/(BASENAME+".png"))
    def gltf(p): return [p[0],p[2],-p[1]]
    manifest={"fileName":model.name,"byteSize":model.stat().st_size,"sha256":"sha256:"+hashlib.sha256(model.read_bytes()).hexdigest(),
              "bounds":[round(high[i]-low[i],4) for i in (0,2,1)],
              "camera":{"position":gltf(CAMERA),"target":gltf(TARGET),"fovDegrees":FOV}}
    (OUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    main()
