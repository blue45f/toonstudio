"""실척 목선의 마른 수리대를 만들고 웹용 GLB와 촬영 구도를 내보낸다. 메시와 무늬는 자체 제작(CC0).

blender -b --factory-startup -t 3 --python-exit-code 1 -P scripts/blender/generate_harbor_boat_repair_shed.py
임시 위치에서 재현하려면 -- --out /tmp/boatyard --closeup /tmp/joinery.png 를 붙인다.
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
from generate_botanical_glasshouse import MeshGroup, linear, surface
from harbor_boatyard_surfaces import surfaces

TAU = math.tau
OUT = Path(__file__).resolve().parents[2] / 'apps/web/public/assets/3d/environments/boatyard-v1'
CAMERA, TARGET, FOV = (4.02,-6.24,3.53), (-.04,.20,.86), 40
STEM = 'harbor_boat_repair_shed'
WHITE, IRON, BRASS = 'FFFFFF', '414D50', 'B89658'


def tube(group, path, r, color, sides=8, closed=False):
    path = [Vector(p) for p in path]
    rings = []
    for i, point in enumerate(path):
        before = path[(i-1) % len(path)] if closed or i else path[0]
        after = path[(i+1) % len(path)] if closed or i+1 < len(path) else path[-1]
        tangent = (after-before).normalized()
        if not rings:
            axis = Vector((0,0,1)) if abs(tangent.z)<.82 else Vector((0,1,0))
        axis = (axis-tangent*tangent.dot(axis)).normalized()
        side = tangent.cross(axis)
        rings.append([point+r*(math.cos(TAU*j/sides)*axis+math.sin(TAU*j/sides)*side) for j in range(sides)])
    if closed:
        vertices = [p for ring in rings for p in ring]
        faces = [(i*sides+j,i*sides+(j+1)%sides,(i*sides+sides+(j+1)%sides)%len(vertices),
                  (i*sides+sides+j)%len(vertices)) for i in range(len(rings)) for j in range(sides)]
        group.solid(vertices,faces,color)
    else:
        group.rings(rings,color)


def timber(group, start, end, width, depth, color=WHITE):
    a, b = Vector(start), Vector(end)
    length = (b-a).normalized()
    ref = Vector((0,0,1)) if abs(length.z)<.90 else Vector((0,1,0))
    across = length.cross(ref).normalized()*width*.5
    up = length.cross(across).normalized()*depth*.5
    group.rings([[p+s*across+t*up for s,t in ((-1,-1),(1,-1),(1,1),(-1,1))] for p in (a,b)],color)


def circle(center, radius, axes, count):
    a,b = map(Vector,axes)
    return [Vector(center)+radius*(math.cos(TAU*i/count)*a+math.sin(TAU*i/count)*b) for i in range(count)]


def hull(t, h, s, inset=0.):
    # 작은 트랜섬에서 선수로 갈수록 폭이 줄어드는 3.90m 연안 목선. h=0은 용골, 1은 현측 상단.
    beam = .052 + .69*(1-t**2)**.91 + .24*((1-t)/2)**4
    beam *= .12+.88*h**.61
    x = 1.95*t - .092*t*(1-h)
    keel = .51+.16*t*t+.095*max(t,0)**3
    sheer = 1.22+.091*t*t+.142*max(t,0)**3
    return Vector((x,s*(beam-inset),keel+(sheer-keel)*h))


def boat(wood, paint, finish, fittings):
    ts = [i/17 for i in range(-17,18)]
    for sign in (-1,1):
        for i in range(6):
            h0,h1 = i/6+.0009, (i+1)/6-.0009
            group = finish if i == 5 else paint
            color = 'E4D9B8' if i==5 else WHITE
            rings = [[hull(t,h0,sign),hull(t,h1,sign),hull(t,h1,sign,.020),hull(t,h0,sign,.020)] for t in ts]
            group.rings(rings,color)
            # 내부 띠널은 도장이 벗겨진 외판과 다른 생목 단면을 가진다.
            wood.rings([[hull(t,h0+.002,sign,.021),hull(t,h1-.002,sign,.021),
                         hull(t,h1-.002,sign,.032),hull(t,h0+.002,sign,.032)] for t in ts],WHITE)
            if i in (0,2,4,5):
                tube(finish,[hull(t,h1,sign,-.003) for t in ts],.008 if i!=5 else .019, '61432D',7)
            for q in range(1,22):
                p = hull((q-11)/11,h1-.026,sign,-.001)
                fittings.rail(p,p+Vector((0,sign*.008,.0015)),.0065,BRASS,8)
        tube(wood,[hull(t,.99,sign,.015)+Vector((0,0,.014)) for t in ts],.025,WHITE,10)
    for t in (-1,1):
        edge = [hull(t,i/6,s,.001) for s,levels in ((1,range(7)),(-1,range(6,-1,-1))) for i in levels]
        wood.rings([edge,[p-Vector((.015*t,0,0)) for p in edge]],WHITE)
    wood.rings([[hull(t,0,-1),hull(t,0,1),hull(t,0,1)+Vector((0,0,.037)),hull(t,0,-1)+Vector((0,0,.037))] for t in ts],WHITE)
    for j in range(-6,7):
        t = j/7.1
        center = hull(t,0,1); center.y = 0; center.z += .043
        def rib_side(s, levels):
            return [hull(t,level/8,s,.041)+Vector((0,0,.02)) for level in levels]
        inner = rib_side(-1, range(8,0,-1)) + [center] + rib_side(1, range(1,9))
        tube(wood,inner,.022,WHITE,8)
    for t in (-.55,.05,.61):
        point = hull(t,.79,1,.041)
        wood.box((point.x,0,point.z),(.205,point.y*2,.045),WHITE)
        for s in (-1,1):
            fittings.rail((point.x,.89*point.y*s,point.z+.019),(point.x,.89*point.y*s,point.z+.028),.012,BRASS,8)
    for s in (-1,1):
        p=hull(-.19,1,s,.002)
        fittings.box((p.x,p.y,p.z+.033),(.122,.062,.013),BRASS)
        ring = [(p.x+.041*math.cos(i*math.pi/12),p.y,p.z+.121-.057*math.sin(i*math.pi/12)) for i in range(13)]
        tube(fittings,ring,.009,BRASS)
        fittings.rail((p.x,p.y,p.z+.027),(p.x,p.y,p.z+.066),.013,BRASS)
    # 두 받침대가 선체를 받치고 갈래발 사이로 용골 정비 공간을 남긴다.
    for t in (-.61,.48):
        x=t*1.95
        wood.box((x,0,.260),(.205,1.39,.135),WHITE)
        for s in (-1,1):
            timber(wood,(x,.24*s,.28),(x,.56*s,.88),.135,.105)
            timber(finish,(x-.02,.42*s,.72),(x-.02,.57*s,.88),.16,.036,'444F4D')
            fittings.rail((x-.102,.46*s,.28),(x-.108,.46*s,.28),.023,IRON,6)


def draped_sailcloth(finish):
    # 용골 유분을 닦는 낡은 돛천. 현측을 실제로 감싸는 접힌 두께와 변색된 가장자리 두 줄을 준다.
    cols, rows = 30, 24
    vertices, colors, faces = [], [], []
    for thick in (0.,.004):
        for i in range(cols+1):
            u=i/cols
            rim=hull(-.70+u*.31,1,-1)
            crease=.009*math.sin(u*TAU*4+.9)+.006*math.cos(u*TAU*6)
            for j in range(rows+1):
                v=j/rows
                if v<.36:
                    a=v/.36
                    y=.207*(1-a); z=.045-.16*(1-a)**2
                elif v<.59:
                    a=(v-.36)/.23*math.pi/2
                    y=-.053*math.sin(a); z=.045-.055*(1-math.cos(a))
                else:
                    a=(v-.59)/.41
                    y=-.053+.048*a; z=-.010-.228*a
                vertices.append(rim+Vector((.011*math.sin(v*4+u*7),y-crease*(.3+v)-thick*v,z+crease*(1-v)+.034*math.sin(u*3-.5)*v+thick*(1-v))))
                is_stripe = i in (2,4,26,28)
                colors.append(linear('CEAC88' if is_stripe else 'A9563E'))
    plane=(cols+1)*(rows+1)
    for i in range(cols):
        for j in range(rows):
            a=i*(rows+1)+j;b=a+rows+1
            faces.extend(((a,b,b+1,a+1),(a+plane,a+1+plane,b+1+plane,b+plane)))
    edges=[i*(rows+1) for i in range(cols+1)]+[cols*(rows+1)+j for j in range(1,rows+1)]+[i*(rows+1)+rows for i in range(cols-1,-1,-1)]+list(range(rows-1,0,-1))
    for a,b in zip(edges,edges[1:]+edges[:1]): faces.append((a,a+plane,b+plane,b))
    start=len(finish.colors)
    finish.solid(vertices,faces,'A9563E')
    finish.colors[start:]=colors


def shop(wood,dock,zinc,finish,metal):
    finish.box((0,0,.065),(5.42,3.62,.13),'515954')
    for j in range(18):
        y=(j-8.5)*.198
        split = ((j*5)%9-4)*.33
        for left,right in ((-2.69,split-.005),(split+.005,2.69)):
            dock.box(((left+right)/2,y,.162),(right-left,.191,.064),WHITE)
            for x in (left+.036,right-.036):
                for shift in (-.055,.055):
                    metal.rail((x,y+shift,.192),(x,y+shift,.1965),.007,IRON,6)
    for x in (-2.56,-.75,.76,2.56):
        wood.box((x,1.55,1.53),(.145,.165,2.67),WHITE)
        metal.box((x,1.454,.32),(.168,.033,.236),'6B7370')
        for z in (.275,.359,2.48,2.61):
            metal.rail((x,1.447,z),(x,1.431,z),.020,BRASS,6)
    # 벽판 사이, 실제 창틀과 서까래 사이로 바깥 빛이 들어온다.
    for j in range(15):
        z=.296+j*.167
        segments=((-2.64,2.64),) if z<1.25 or z>2.37 else ((-2.64,-2.02),(-.81,.80),(2.08,2.64))
        for a,b in segments:
            dock.box(((a+b)/2,1.633,z),(b-a,.075,.160),WHITE)
    for a,b in ((-2.02,-.81),(.80,2.08)):
        for z in (1.22,2.38):
            finish.box(((a+b)/2,1.556,z),(b-a+.105,.105,.075),'4B6862')
        for x in (a,(a+b)/2,b):
            finish.box((x,1.557,1.797),(.049,.082,1.11),'526D63')
        finish.box(((a+b)/2,1.549,1.86),(b-a,.077,.042),'647A6C')
    wood.box((0,1.475,2.68),(5.34,.20,.162),WHITE)
    for x in (-2.56,-.75,.76,2.56):
        timber(wood,(x+(.43 if x<0 else -.43),1.37,2.61),(x,1.37,2.16),.084,.092)
        timber(wood,(x,.91,2.78),(x,1.75,2.88),.083,.092)
    n=160
    stripe=[(-2.68+5.36*i/n,.018*math.cos(TAU*i/4)) for i in range(n+1)]
    # 얇은 골판을 머리 위에 좁게 걸쳐 가까이 촬영할 때 선체를 가리지 않는다.
    # 파동 방향을 따라 작은 사각 단면을 이어 긴 오목한 끝면의 0면적 삼각화를 방지한다.
    zinc.rings([[(x,.89,2.790+h),(x,1.73,2.893+h),(x,1.73,2.884+h),(x,.89,2.781+h)] for x,h in stripe],WHITE)
    # 왼쪽 선반에는 실척 대패, 고무망치와 캔이 놓인다.
    for x in (-2.38,-.84):
        for y in (.86,1.34):
            wood.box((x,y,.64),(.09,.095,.89),WHITE)
    for j in range(4):
        wood.box((-1.60,.86+j*.145,1.095),(1.73,.14,.082),WHITE)
    metal.box((-1.87,1.03,1.175),(.262,.072,.056),IRON)
    timber(wood,(-1.91,1.031,1.20),(-1.93,1.031,1.28),.039,.043)
    timber(metal,(-1.88,1.031,1.188),(-1.845,1.031,1.248),.035,.006,'A1A59F')
    wood.rail((-1.62,.98,1.149),(-1.43,1.11,1.149),.014,WHITE)
    metal.rail((-1.66,1.015,1.15),(-1.601,.929,1.15),.032,'41413C')
    for x,y,r,h in ((-2.16,1.16,.065,.16),(-1.14,1.20,.080,.15)):
        zinc.rail((x,y,1.136),(x,y,1.136+h),r,WHITE,24)
        tube(metal,circle((x,y,1.136+h),r,((1,0,0),(0,1,0)),24),.003,BRASS,6,True)
        ring=[(x+r*math.cos(i*math.pi/14),y,1.136+h*.79+.113*math.sin(i*math.pi/14)) for i in range(15)]
        tube(metal,ring,.0032,IRON,6)


def winch(wood,metal,rope,finish):
    x,y=1.68,-1.06
    wood.box((x,y,.265),(.72,.47,.133),WHITE)
    for s in (-1,1):
        xx=x+s*.213
        metal.box((xx,y,.36),(.098,.331,.054),'566865')
        for sign in (-1,1):
            timber(metal,(xx,y+sign*.133,.38),(xx,y,.68),.049,.040,'53746B')
            metal.rail((xx,y+sign*.122,.389),(xx,y+sign*.122,.402),.016,BRASS,6)
    axis=.65
    metal.rail((x-.311,y,axis),(x+.314,y,axis),.026,IRON,16)
    metal.rail((x-.14,y,axis),(x+.14,y,axis),.064,'52625C',28)
    for s in (-1,1):
        metal.rail((x+s*.143,y,axis),(x+s*.157,y,axis),.115,'6A776E',32)
    helix=[(x-.126+.252*j/384, y+.083*math.cos(TAU*j/32),axis+.083*math.sin(TAU*j/32)) for j in range(385)]
    tube(rope,helix,.009,'BE9362',7)
    xx=x+.307
    tube(metal,circle((xx,y,axis),.185,((0,1,0),(0,0,1)),40),.015,'476D65',10,True)
    for j in range(5):
        a=TAU*j/5+.35
        metal.rail((xx,y,axis),(xx,y+.18*math.cos(a),axis+.18*math.sin(a)),.011,BRASS)
    wood.rail((xx+.012,y+.156,axis+.103),(xx+.129,y+.156,axis+.103),.021,WHITE,12)
    # 서로 닿는 나선의 표면을 세 가닥 꼬임으로 만들어 근경에서도 굵기가 보인다.
    path=[]
    for j in range(201):
        angle=TAU*(j/44)
        radius=.082+.134*j/200
        path.append(Vector((.82+radius*math.cos(angle),-1.27+.73*radius*math.sin(angle),.212+.002*j/200)))
    path.extend([Vector((.57,-1.35,.209)),Vector((.45,-1.42,.209)),Vector((.27,-1.388,.209))])
    lay=0.
    strands=[[],[],[]]
    for i,p in enumerate(path):
        if i:lay+=(p-path[i-1]).length/.095
        t=path[min(i+1,len(path)-1)]-path[max(0,i-1)]
        n=Vector((-t.y,t.x,0)).normalized()
        for j in range(3):
            a=TAU*(lay+j/3)
            strands[j].append(p+.0054*(math.cos(a)*n+math.sin(a)*Vector((0,0,1))))
    for strand,tint in zip(strands,('BC985F','D1AE76','AB844F')):tube(rope,strand,.0063,tint,6)


def net_and_buoy(rope,finish,metal):
    def point(x,z):
        return (x,1.421-.082*math.sin((x+.69)*2.17)*math.sin((z-1.34)*2.61),z)
    # 그물은 두 방향의 마름모 매듭으로 걸려 있다. 매듭마다 실제 깊이가 달라진다.
    x0,x1,z0,z1=-.64,.65,1.32,2.47
    for sign in (-1,1):
        for k in range(-10,16):
            offset=k*.178
            lo,hi=sorted(((x0-x0-offset)/sign,(x1-x0-offset)/sign))
            a,b=max(0,lo),min(z1-z0,hi)
            if b-a<.035:continue
            path=[point(x0+offset+sign*(a+(b-a)*j/12),z0+a+(b-a)*j/12) for j in range(13)]
            tube(rope,path,.0045,'887657' if sign>0 else 'B19A72',5)
    tube(rope,[point(x0+j*(x1-x0)/20,z1-.073*math.sin(math.pi*j/20)) for j in range(21)],.013,'B69968')
    for j in range(7):
        p=Vector(point(x0+.095+j*.18,z1-.061*math.sin(math.pi*j/6)))
        finish.rail(p+Vector((-.026,-.008,0)),p+Vector((.026,-.008,0)),.025,'CC8B42',12)
    c=Vector((1.71,1.44,1.86)); r=.213
    # 조각을 맞붙이지 않고 닫힌 한 메시에서 구명환의 흰 띠 네 곳을 칠한다.
    seg,side=64,12
    pts=[]; cols=[]
    for i in range(seg):
        a=TAU*i/seg
        for j in range(side):
            b=TAU*j/side
            pts.append(c+Vector(((r+.049*math.cos(b))*math.cos(a),.049*math.sin(b),(r+.049*math.cos(b))*math.sin(a))))
        cols.append('E9DBBD' if (i+3)%16<6 else 'BF5838')
    start=len(finish.vertices)
    faces=[(i*side+j,i*side+(j+1)%side,((i+1)%seg)*side+(j+1)%side,((i+1)%seg)*side+j) for i in range(seg) for j in range(side)]
    finish.solid(pts,faces,'FFFFFF')
    for i,col in enumerate(cols):finish.colors[start+i*side:start+(i+1)*side]=[linear(col)]*side
    grasp=[c+Vector(((r+.085+.015*math.cos(4*a))*math.cos(a),-.007,(r+.085+.015*math.cos(4*a))*math.sin(a))) for a in (TAU*i/64 for i in range(64))]
    tube(rope,grasp,.006,'A78F65',6,True)
    metal.rail((1.705,1.58,2.14),(1.705,1.414,2.14),.013,IRON)


def join_small_fittings(zinc, parts):
    # 금속·로프·에나멜은 원래 Tint를 유지하고 거칠기와 금속성만 고정 패치에서 읽는다.
    layers = zinc.data.uv_layers.active.data
    for face in zinc.data.polygons:
        vmin = min(layers[j].uv.y for j in face.loop_indices)
        offset = math.floor(vmin)
        for j in face.loop_indices:
            local = layers[j].uv.y - offset
            if local > 1.90:
                raise ValueError('강판 UV가 소도구 물성 영역을 침범했습니다.')
            layers[j].uv.y = local * .5
    for i,obj in enumerate(parts):
        obj.data.materials.clear()
        obj.data.materials.append(zinc.data.materials[0])
        for item in obj.data.uv_layers.active.data:
            item.uv=((i+1)*.25,1.-22./1024.)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [zinc,*parts]: obj.select_set(True)
    bpy.context.view_layer.objects.active=zinc
    bpy.ops.object.join()
    zinc.name='03 Galvanized metal, enamel, fasteners and rope'


def render(file, position,target,fov):
    scene=bpy.context.scene
    cam=bpy.data.cameras.new('Work-yard camera')
    obj=bpy.data.objects.new(cam.name,cam);scene.collection.objects.link(obj)
    obj.location=position;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();scene.camera=obj
    scene.render.resolution_x,scene.render.resolution_y=1000,750
    cam.angle_x=2*math.atan(math.tan(math.radians(fov)/2)*4/3)
    scene.render.resolution_percentage=100
    scene.render.filepath=str(file);scene.render.image_settings.file_format='PNG'
    bpy.ops.render.render(write_still=True)


def main():
    if not bpy.app.background: raise RuntimeError('전용 Blender 백그라운드 프로세스에서 실행하세요.')
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,default=OUT);parser.add_argument('--closeup',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    args.out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1.
    with tempfile.TemporaryDirectory() as folder:
        wood,paint,zinc=[MeshGroup(name,surfaces(Path(folder),kind)) for name,kind in
                        (('01 Oak workshop and inner ceiling','Oak'),('02 Painted lapstrake planking','Hull'),('03 Galvanized roof and cans','Zinc'))]
        finish=MeshGroup('04 Enamel, rubbing strakes and lifebuoy',surface('Workshop enamel',.62))
        metal=MeshGroup('05 Winch, oarlocks, fasteners and tooling',surface('Bronze and iron fittings',.36,.71))
        rope=MeshGroup('06 Manila rope and fishing net',surface('Manila fibre',.85))
        dock = MeshGroup('07 Salt-worn decking and clapboards',surfaces(Path(folder),'Dock'))
        boat(wood,paint,finish,metal);draped_sailcloth(finish);shop(wood,dock,zinc,finish,metal);winch(wood,metal,rope,finish);net_and_buoy(rope,finish,metal)
        objects=[g.build() for g in (wood,paint,zinc,finish,metal,rope,dock)]
        for obj in objects:
            mesh = obj.data
            # 둥근 로프·리브만 이어 칠하고 판재 모서리와 관 단면은 각을 살린다.
            limit = 77 if obj.name.startswith('06 ') else 49
            for face in mesh.polygons:
                face.use_smooth = True
            mesh.set_sharp_from_angle(angle=math.radians(limit))
            mesh.calc_loop_triangles()
            if any(triangle.area < 1e-11 for triangle in mesh.loop_triangles):
                raise ValueError(f'{obj.name}: GLB 삼각화에서 면적이 사라지는 부분이 있습니다.')
        join_small_fittings(objects[2], objects[3:6])
        objects = [objects[0],objects[1],objects[2],objects[6]]
        for obj in (objects[0],objects[1],objects[3]):
            for attribute in list(obj.data.color_attributes):
                obj.data.color_attributes.remove(attribute)
        corners=[Vector(p) for obj in objects for p in obj.bound_box]
        bounds=[max(p[k] for p in corners)-min(p[k] for p in corners) for k in (0,2,1)]
        if abs(min(p.z for p in corners))>1e-6:raise ValueError('수리대 하부가 바닥에서 떨어져 있습니다.')
        model=args.out/(STEM+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(model),export_format='GLB',export_yup=True,export_animations=False,
                                  export_copyright='ToonStudio. CC0 1.0 Universal. Original mesh, UVs and PBR images.')
        scene.world=bpy.data.worlds.new('Salt haze');scene.world.use_nodes=True
        bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
        bg.inputs[0].default_value=(.48,.59,.62,1);bg.inputs[1].default_value=.64
        light=bpy.data.lights.new('Open-front shipwright daylight','SUN');light.energy=3.;light.angle=math.radians(9);light.color=(1.,.86,.70)
        obj=bpy.data.objects.new(light.name,light);scene.collection.objects.link(obj);obj.rotation_euler=Vector((.44,.62,-1.)).to_track_quat('-Z','Y').to_euler()
        scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
        scene.view_settings.look='AgX - Medium High Contrast'
        render(args.out/(STEM+'.png'),CAMERA,TARGET,FOV)
        if args.closeup:render(args.closeup,(2.57,-2.91,1.93),(.62,-.18,.90),38)
    gltf=lambda p:[p[0],p[2],-p[1]]
    data={'fileName':model.name,'byteSize':model.stat().st_size,'sha256':'sha256:'+hashlib.sha256(model.read_bytes()).hexdigest(),
          'bounds':[round(v,4) for v in bounds],'camera':{'position':gltf(CAMERA),'target':gltf(TARGET),'fovDegrees':FOV}}
    (args.out/'manifest.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':main()
