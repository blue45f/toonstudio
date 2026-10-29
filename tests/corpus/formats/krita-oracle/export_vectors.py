# 코퍼스에서 실제 Krita가 만든 타일 페이로드 몇 개를 뽑아 TypeScript 테스트 벡터(kra-real-tile-vectors.ts)로 쓴다.
# 사용법: python3 -I export_vectors.py <코퍼스 디렉터리> <출력 .ts 경로>
#
# 벡터 하나 = 타일 페이로드(Krita가 쓴 그대로) + 풀었을 때의 SHA-256(독립 Python LZF 해석기로 계산) + 알려진 정답 픽셀.
# 정답 픽셀은 d10은 원본 PNG(8비트 RGBA), d04는 Krita가 읽어 준 값(Node.pixelData)이다. 입력 이미지는 이 저장소에
# 있는 합성 PNG이고 사용자 콘텐츠가 아니다.
import base64
import hashlib
import json
import math
import os
import sys
import xml.etree.ElementTree as ET
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kra_ref  # noqa: E402
import png_dec  # noqa: E402

D10 = ['d10-rgba8', 'd10-gray8', 'd10-rgba16-srgbtrc', 'd10-rgba16-g10', 'd10-gray16']
# 비압축(플래그 0) 타일: 잡음 레이어의 (0, 0) 타일. 픽셀 크기 1바이트 단위(회색), 4바이트(RGBA8), 16비트 회색까지 덮는다.
RAW = ['d11-noise-gray8', 'd11-noise-rgba8', 'd11-noise-gray16']
PROBES = [(0, 0), (5, 3), (20, 15), (39, 29), (10, 25), (33, 7)]


def planarize(interleaved, pixel_bytes):
    """픽셀을 이어 붙인 배치를 바이트 평면 배치로 바꾼다(독립 구현)."""
    pixels = len(interleaved) // pixel_bytes
    out = bytearray(len(interleaved))
    for pixel in range(pixels):
        for byte in range(pixel_bytes):
            out[byte * pixels + pixel] = interleaved[pixel * pixel_bytes + byte]
    return bytes(out)


def oetf(value):
    return 12.92 * value if value <= 0.0031308 else 1.055 * (value ** (1 / 2.4)) - 0.055


def native_rgba8(color_space, native, linear):
    """Krita 네이티브 픽셀 -> 직선 RGBA8(독립 구현, compare_importer.py의 식과 같다)."""
    if color_space == 'RGBA':
        return [native[2], native[1], native[0], native[3]]
    if color_space == 'GRAYA':
        return [native[0], native[0], native[0], native[1]]

    def word(index):
        return native[2 * index] | (native[2 * index + 1] << 8)

    def reduce16(value):
        return int(math.floor(255 * oetf(value / 65535) + 0.5)) if linear else int(math.floor(value / 257 + 0.5))

    if color_space == 'GRAYAU16':
        gray = reduce16(word(0))
        return [gray, gray, gray, int(math.floor(word(1) / 257 + 0.5))]
    raise ValueError(color_space)


def image_attributes(archive):
    root = ET.fromstring(archive.read('maindoc.xml'))
    image = [e for e in root.iter() if e.tag.endswith('IMAGE')][0]
    layers = [e for e in root.iter() if e.tag.endswith('layer') and e.attrib.get('nodetype') == 'paintlayer']
    return root, image.attrib, layers


def tile_of(archive, base, element, x, y):
    header, tiles, _ = kra_ref.parse_layer_file(archive.read('%s/layers/%s' % (base, element.attrib['filename'])))
    tile = [t for t in tiles if t[0] == x and t[1] == y][0]
    return header, tile[4]


def png_vector(corpus, stem):
    archive = zipfile.ZipFile(os.path.join(corpus, stem + '.kra'))
    truth = json.load(open(os.path.join(corpus, stem + '.truth.json'), encoding='utf-8'))
    _, image, layers = image_attributes(archive)
    element = layers[0]
    header, payload = tile_of(archive, image['name'], element, 0, 0)
    width, height, rows = png_dec.decode_png(open(os.path.join(HERE, 'in', truth['source']), 'rb').read())
    planar = kra_ref.lzf_decompress(payload[1:], header['TILEWIDTH'] * header['TILEHEIGHT'] * header['PIXELSIZE'])
    return {
        'id': stem,
        'origin': '원본 PNG %s를 가져와 색 공간을 바꿔 저장한 문서(정답 = 원본 PNG의 RGBA8)' % truth['source'],
        'colorSpace': element.attrib['colorspacename'],
        'profile': image.get('profile'),
        'pixelBytes': header['PIXELSIZE'],
        'tile': [0, 0],
        'canvas': [width, height],
        'defaultPixelHex': archive.read('%s/layers/%s.defaultpixel' % (image['name'], element.attrib['filename'])).hex(),
        'payloadBase64': base64.b64encode(payload).decode('ascii'),
        'planarSha256': hashlib.sha256(planar).hexdigest(),
        'probes': [{'x': x, 'y': y, 'rgba': list(rows[y][x * 4:x * 4 + 4])} for (x, y) in PROBES],
    }


def blend_vector(corpus):
    stem = 'd04-blendmodes'
    archive = zipfile.ZipFile(os.path.join(corpus, stem + '.kra'))
    truth = json.load(open(os.path.join(corpus, stem + '.truth.json'), encoding='utf-8'))
    _, image, layers = image_attributes(archive)
    element = [e for e in layers if e.attrib['name'] == 'm05'][0]
    header, payload = tile_of(archive, image['name'], element, 0, 0)
    node = [n for n in truth['tree'] if n['name'] == 'm05'][0]
    wx, wy, ww, wh = node['window']
    native = base64.b64decode(node['windowPixelsB64'])
    planar = kra_ref.lzf_decompress(payload[1:], header['TILEWIDTH'] * header['TILEHEIGHT'] * header['PIXELSIZE'])
    probes = []
    for (x, y) in [(0, 0), (4, 4), (10, 10), (20, 20), (31, 31), (40, 40), (63, 47)]:
        index = ((y - wy) * ww + (x - wx)) * 4
        b, g, r, a = native[index:index + 4]
        probes.append({'x': x, 'y': y, 'rgba': [r, g, b, a]})
    return {
        'id': 'd04-blendmodes-m05',
        'origin': '블렌드 모드 문서의 한 레이어(정답 = Krita가 읽어 준 Node.pixelData)',
        'colorSpace': element.attrib['colorspacename'],
        'profile': image.get('profile'),
        'pixelBytes': header['PIXELSIZE'],
        'tile': [0, 0],
        'canvas': [int(image['width']), int(image['height'])],
        'defaultPixelHex': archive.read('%s/layers/%s.defaultpixel' % (image['name'], element.attrib['filename'])).hex(),
        'payloadBase64': base64.b64encode(payload).decode('ascii'),
        'planarSha256': hashlib.sha256(planar).hexdigest(),
        'probes': probes,
    }


def raw_vector(corpus, stem):
    archive = zipfile.ZipFile(os.path.join(corpus, stem + '.kra'))
    truth = json.load(open(os.path.join(corpus, stem + '.truth.json'), encoding='utf-8'))
    _, image, layers = image_attributes(archive)
    element = [e for e in layers if e.attrib['name'] == 'Noise'][0]
    header, payload = tile_of(archive, image['name'], element, 0, 0)
    assert payload[0] == 0, '비압축 타일이어야 한다'
    color_space = element.attrib['colorspacename']
    planar = planarize(payload[1:], header['PIXELSIZE'])
    native = base64.b64decode(truth['layers']['Noise'])
    width, psize = truth['window'][2], truth['pixelSize']
    linear = 'g10' in (image.get('profile') or '').lower()
    probes = []
    for (x, y) in [(0, 0), (1, 0), (63, 0), (0, 63), (63, 63), (17, 40)]:
        pixel = native[(y * width + x) * psize:(y * width + x + 1) * psize]
        probes.append({'x': x, 'y': y, 'rgba': native_rgba8(color_space, pixel, linear)})
    return {
        'id': stem + '-noise-raw',
        'origin': '잡음 레이어의 비압축(플래그 0) 타일(정답 = Krita가 읽어 준 Node.pixelData)',
        'colorSpace': color_space,
        'profile': image.get('profile'),
        'pixelBytes': header['PIXELSIZE'],
        'tile': [0, 0],
        'canvas': [int(image['width']), int(image['height'])],
        'defaultPixelHex': archive.read('%s/layers/%s.defaultpixel' % (image['name'], element.attrib['filename'])).hex(),
        'payloadBase64': base64.b64encode(payload).decode('ascii'),
        'planarSha256': hashlib.sha256(planar).hexdigest(),
        'probes': probes,
    }


def main():
    corpus, out_path = os.path.abspath(sys.argv[1]), sys.argv[2]
    vectors = [blend_vector(corpus)] + [png_vector(corpus, stem) for stem in D10] + [raw_vector(corpus, stem) for stem in RAW]
    for vector in vectors:
        vector['flag'] = base64.b64decode(vector['payloadBase64'])[0]
    lines = [
        '/**',
        ' * @file kra-real-tile-vectors.ts',
        ' * @description 실제 Krita 5.2.2가 저장한 타일 페이로드(LZF) 알려진 정답 벡터. `tests/corpus/formats/krita-oracle/export_vectors.py`가 만든다.',
        ' *',
        ' * 입력은 이 저장소의 합성 이미지(`krita-oracle/in/*.png`)와 스크립트가 그린 도형이고 사용자 콘텐츠가 아니다. 페이로드는 문서에서',
        ' * 타일 하나를 그대로 떼어 낸 바이트이며 ICC 프로파일·썸네일 등 문서의 다른 부분은 담지 않는다. `planarSha256`은 독립 Python',
        ' * LZF 해석기로 계산했다. 수정하지 말고 스크립트로 다시 만든다.',
        ' */',
        '',
        'export interface KraRealTileVector {',
        '  readonly id: string;',
        '  readonly origin: string;',
        '  readonly colorSpace: string;',
        '  readonly profile: string | null;',
        '  readonly pixelBytes: number;',
        '  /** 페이로드 첫 바이트: 1이면 LZF 스트림(바이트 평면), 0이면 비압축 원본(픽셀을 이어 붙인 배치). */',
        '  readonly flag: 0 | 1;',
        '  readonly tile: readonly [number, number];',
        '  readonly canvas: readonly [number, number];',
        '  readonly defaultPixelHex: string;',
        '  readonly payloadBase64: string;',
        '  readonly planarSha256: string;',
        '  readonly probes: readonly { readonly x: number; readonly y: number; readonly rgba: readonly [number, number, number, number] }[];',
        '}',
        '',
        'export const KRA_REAL_TILE_VECTORS: readonly KraRealTileVector[] = ' + json.dumps(vectors, ensure_ascii=False, indent=2) + ';',
        '',
    ]
    with open(out_path, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))
    for vector in vectors:
        print(vector['id'], vector['colorSpace'], 'flag', vector['flag'], len(base64.b64decode(vector['payloadBase64'])), '바이트')


main()
