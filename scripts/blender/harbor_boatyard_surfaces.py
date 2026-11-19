"""선박 수리장의 목재·도장·아연판을 1m 반복 PBR 무늬로 직접 굽는다(CC0)."""
import struct
import zlib

import bpy
import numpy as np


def save_png(path, image):
    pixels = np.rint(np.clip(image, 0., 1.) * 255).astype('uint8')
    height, width, _ = pixels.shape

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))

    rows = b''.join(b'\x00' + row.tobytes() for row in pixels)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 2, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


def periodic_noise(u, v, nx, ny, seed):
    grid = np.random.default_rng(seed).random((ny, nx))
    x, y = u * nx, v * ny
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    a, b = x - i, y - j
    a, b = a*a*(3-2*a), b*b*(3-2*b)
    first = grid[j % ny, i % nx]*(1-a) + grid[j % ny, (i+1) % nx]*a
    second = grid[(j+1) % ny, i % nx]*(1-a) + grid[(j+1) % ny, (i+1) % nx]*a
    return first*(1-b) + second*b


def surfaces(folder, kind, size=512):
    v, u = np.indices((size, size)) / size
    noise = lambda nx, ny, seed: periodic_noise(u, v, nx, ny, seed)
    coarse, med, fleck = noise(6, 5, 17), noise(28, 21, 31), noise(155, 118, 89)
    if kind == 'Zinc':
        tarnish = np.clip((coarse*.45+med*.30+fleck*.25-.54)*6., 0., 1.)
        patina = np.asarray((.45,.52,.53)) + (.22*med+.09*fleck-.12)[...,None]
        rust = np.asarray((.45,.27,.17)) + (.20*med-.09)[...,None]
        color = patina*(1-tarnish[...,None]) + rust*tarnish[...,None]
        relief, rough, metal = .25*med+.16*fleck, .41+.42*tarnish, .77-.50*tarnish
    else:
        deviation = (noise(4,9,53)-.5)*.015 + (coarse-.5)*.012
        knot = np.zeros_like(u)
        for x,y in ((.22,.31),(.73,.79)):
            dx, dy = (u-x+.5)%1-.5, (v-y+.5)%1-.5
            radius = np.sqrt((dx/.10)**2+(dy/.032)**2)
            knot += np.exp(-radius*radius*2.5)
            deviation += np.sign(dy)*.015*np.exp(-radius*radius*.65)*np.minimum(1,abs(dy)*60)
        phase = v+deviation
        grain = (.5+.5*np.cos(np.pi*2*(phase*48+.7*noise(3,12,15))))**6
        late = noise(6,130,23)*.6 + noise(20,220,41)*.4
        pigment = (late-.5)*.31 - .067*grain - .13*knot + (coarse-.5)*.10 + (fleck-.5)*.07
        lumber = np.asarray((.66,.49,.30)) + pigment[...,None]*np.asarray((.95,.86,.66))
        relief = .22*late-.09*grain-.15*knot+.05*fleck
        rough = .65+.15*late
        metal = np.zeros_like(u)
        color = lumber
        if kind == 'Dock':
            silver = np.asarray((.55,.555,.51)) + pigment[...,None]*.58
            silver += ((coarse-.5)*.08)[...,None]
            wear = np.clip((med*.36+coarse*.64-.49)*4.,0.,1.)
            color = silver*(1-.36*wear[...,None])+lumber*.36*wear[...,None]
            rough = .72 + .13*late
        if kind == 'Hull':
            wear = np.clip((.45*noise(9,29,6)+.35*late+.20*fleck-.56)*13, 0., 1.)
            sea_green = np.asarray((.115,.40,.41)) + ((late-.5)*.09+(coarse-.5)*.12)[...,None]
            color = sea_green*(1-wear[...,None]) + lumber*wear[...,None]
            relief = .45*relief-.17*wear
            rough = .39+.37*wear+.08*fleck
    dx = (np.roll(relief,-1,1)-np.roll(relief,1,1))*.72
    dy = (np.roll(relief,-1,0)-np.roll(relief,1,0))*.72
    normal = np.stack((-dx,dy,np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    maps = {'albedo': color, 'normal': .5+.5*normal, 'orm': np.stack((np.ones_like(rough),rough,metal),axis=-1)}
    mat = bpy.data.materials.new(kind+' · hand-authored boatyard PBR')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    for role, array in maps.items():
        if kind == 'Zinc':
            # 강판 면은 세로 한 주기 미만이다. 두 주기를 이어 원래 반복과 여백을 보존하고,
            # 실제 강판 UV가 닿지 않는 끝부분에 무늬 없는 소도구의 세 물성을 둔다.
            array = np.concatenate((array,array),axis=0)
            for j,(roughness,metallic) in enumerate(((.62,0),(.36,.71),(.85,0))):
                left=(j+1)*size//4-12
                patch=np.s_[10:34,left:left+24]
                if role == 'orm':
                    array[patch] = (1.,roughness,metallic)
                elif role == 'normal':
                    array[patch] = (.5,.5,1.)
                else:
                    array[patch] = (1.,1.,1.)
        path = folder / f'{kind}_{role}.png'
        save_png(path, array)
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(str(path))
        if role == 'albedo':
            if kind == 'Zinc':
                tint=nodes.new('ShaderNodeVertexColor');tint.layer_name='Tint'
                mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1.
                rgba=lambda sockets,name: next(s for s in sockets if s.name==name and s.type=='RGBA')
                links.new(tint.outputs['Color'],rgba(mix.inputs,'A'));links.new(texture.outputs['Color'],rgba(mix.inputs,'B'))
                links.new(rgba(mix.outputs,'Result'),shader.inputs['Base Color'])
            else:
                links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        else:
            texture.image.colorspace_settings.name = 'Non-Color'
            if role == 'normal':
                normal_map = nodes.new('ShaderNodeNormalMap')
                links.new(texture.outputs['Color'], normal_map.inputs['Color'])
                links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])
            else:
                separate = nodes.new('ShaderNodeSeparateColor')
                links.new(texture.outputs['Color'], separate.inputs['Color'])
                links.new(separate.outputs['Green'], shader.inputs['Roughness'])
                links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
    return mat
