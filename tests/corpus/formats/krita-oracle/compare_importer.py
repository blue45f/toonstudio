# importKra 결과(dump-importer.mts가 만든 JSON)를 Krita가 저장 직전에 읽어 준 정답(*.truth.json)과 대조한다.
# 표준 라이브러리만 쓴다. 사용법: python3 -I compare_importer.py <코퍼스 디렉터리> <덤프 디렉터리>
#
# 정답은 이 스크립트가 만든 값이 아니라 Krita가 읽어 준 값이다(Node.pixelData, 원본 PNG, Krita가 저장한 합성 이미지 등). 16비트 정수와
# 16·32비트 실수 값의 8비트 환원식만 이 파일이 다시 쓴다(importer와 독립 구현이라 표 구현 오류를 가려낸다).
import base64
import glob
import hashlib
import json
import math
import os
import re
import struct
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import png_dec  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
COMPOSITE_OPS_SOURCE = os.path.join(REPO_ROOT, 'packages', 'studio-format-gateway', 'src', 'kra-composite-ops.ts')

# Krita API의 노드 종류 -> 파일의 nodetype
API_TO_FILE_TYPE = {
    'paintlayer': 'paintlayer', 'grouplayer': 'grouplayer', 'vectorlayer': 'shapelayer', 'filterlayer': 'adjustmentlayer',
    'clonelayer': 'clonelayer', 'filelayer': 'filelayer',
}  # 채우기 레이어는 만들다가 Krita가 종료되어 파일을 관찰하지 못했으므로 대응표에 없다
MASK_TYPES = {'transparencymask', 'selectionmask', 'filtermask', 'colorizemask', 'transformmask'}
# colorspacename -> (모델, 비트 깊이, 픽셀 바이트, 샘플 종류). importer가 RGBA8로 환원하는 형식만 있다.
FORMATS = {
    'RGBA': ('rgb', 8, 4, 'int'), 'RGBA16': ('rgb', 16, 8, 'int'), 'GRAYA': ('gray', 8, 2, 'int'), 'GRAYAU16': ('gray', 16, 4, 'int'),
    'RGBAF16': ('rgb', 16, 8, 'float'), 'RGBAF32': ('rgb', 32, 16, 'float'), 'GRAYAF16': ('gray', 16, 4, 'float'), 'GRAYAF32': ('gray', 32, 8, 'float'),
}


def oetf(value):
    return 12.92 * value if value <= 0.0031308 else 1.055 * (value ** (1 / 2.4)) - 0.055


def reduce16(value, linear):
    return int(math.floor(255 * oetf(value / 65535) + 0.5)) if linear else int(math.floor(value / 257 + 0.5))


def quantize16(value):
    """실수 샘플을 16비트 정수로: 0~1로 자르고(음수·NaN은 0) 65535를 곱해 반올림한다."""
    if not value > 0:
        return 0
    if value >= 1:
        return 65535
    return int(math.floor(value * 65535 + 0.5))


def float_to_rgba8(model, depth, native, linear):
    """실수 형식의 네이티브 픽셀(R,G,B,A 또는 회색,알파; 리틀 엔디언 반정밀도·단정밀도)을 직선 RGBA8로 바꾼다."""
    fmt, size = ('<e', 2) if depth == 16 else ('<f', 4)
    values = [struct.unpack_from(fmt, native, index * size)[0] for index in range(len(native) // size)]

    def color(value):
        return reduce16(quantize16(value), linear)

    def alpha(value):
        return int(math.floor(quantize16(value) / 257 + 0.5))

    if model == 'rgb':
        return bytes((color(values[0]), color(values[1]), color(values[2]), alpha(values[3])))
    gray = color(values[0])
    return bytes((gray, gray, gray, alpha(values[1])))


def native_to_rgba8(model, depth, native, linear, kind='int'):
    """Krita 네이티브 픽셀(정수는 B,G,R,A 또는 회색,알파; 16비트는 리틀 엔디언)을 직선 RGBA8로 바꾼다."""
    if kind == 'float':
        return float_to_rgba8(model, depth, native, linear)
    if (model, depth) == ('rgb', 8):
        return bytes((native[2], native[1], native[0], native[3]))
    if (model, depth) == ('gray', 8):
        return bytes((native[0], native[0], native[0], native[1]))

    def word(index):
        return native[2 * index] | (native[2 * index + 1] << 8)

    if (model, depth) == ('rgb', 16):
        return bytes((reduce16(word(2), linear), reduce16(word(1), linear), reduce16(word(0), linear), int(math.floor(word(3) / 257 + 0.5))))
    gray = reduce16(word(0), linear)
    return bytes((gray, gray, gray, int(math.floor(word(1) / 257 + 0.5))))


def is_linear(profile_name):
    name = (profile_name or '').lower()
    return 'g10' in name or 'linear' in name


def flatten(tree, out):
    """정답 트리를 파일 순서(위 -> 아래, 깊이 우선)로 편다. Krita API는 형제를 아래 -> 위로 돌려주므로 뒤집는다.
    마스크는 레이어의 _masks로 따로 모은다."""
    for node in reversed(tree):
        if node['type'] in MASK_TYPES:
            continue
        node = dict(node)
        node['_masks'] = [child for child in node.get('children', []) if child['type'] in MASK_TYPES]
        out.append(node)
        flatten([child for child in node.get('children', []) if child['type'] not in MASK_TYPES], out)
    return out


class Report:
    def __init__(self):
        self.problems = []
        self.layers_checked = 0
        self.layers_unsupported = 0
        self.window_pixels = 0
        self.special_pixels = 0

    def bad(self, message):
        self.problems.append(message)
        print('PROBLEM', message)


def layer_pixel(layer, pixels, x, y):
    """덤프된 레이어의 이미지 좌표 (x, y) RGBA8. 범위 밖은 기본 픽셀이다."""
    extent = layer['extent']
    if extent is not None and extent['x'] <= x < extent['x'] + extent['width'] and extent['y'] <= y < extent['y'] + extent['height']:
        offset = ((y - extent['y']) * extent['width'] + (x - extent['x'])) * 4
        return pixels[offset:offset + 4]
    return bytes(layer['defaultPixel'])


def compare_window(report, tag, layer, model, depth, psize, window, native_window, linear, counter, kind='int'):
    wx, wy, ww, wh = window
    pixels = base64.b64decode(layer['pixelsB64']) if layer['pixelsB64'] is not None else None
    mismatches = 0
    for j in range(wh):
        for i in range(ww):
            got = layer_pixel(layer, pixels, wx + i, wy + j)
            expected = native_to_rgba8(model, depth, native_window[(j * ww + i) * psize:(j * ww + i + 1) * psize], linear, kind)
            setattr(report, counter, getattr(report, counter) + 1)
            if got != expected:
                mismatches += 1
                if mismatches <= 3:
                    print('  PIXEL', tag, (wx + i, wy + j), got.hex(), expected.hex())
    if mismatches:
        report.bad('%s: 픽셀 %d개 불일치' % (tag, mismatches))


def check_float_against_render(report, stem, layer, corpus):
    """Krita가 저장한 합성 이미지(mergedimage.png)와 importer가 읽은 레이어 픽셀을 대조한다. 레이어가 합성 결과 그대로이도록 만든 문서만
    쓴다. 색과 알파 모두 1단계 이내여야 한다(Krita의 변환과 이 환원식이 정수 반올림에서 갈릴 수 있는 폭). 알파 0인 픽셀은 색을 보지 않는다."""
    archive = zipfile.ZipFile(os.path.join(corpus, stem + '.kra'))
    width, height, rows = png_dec.decode_png(archive.read('mergedimage.png'))
    pixels = base64.b64decode(layer['pixelsB64'])
    worst = 0
    off_by_one = 0
    bad = 0
    for y in range(height):
        for x in range(width):
            got = layer_pixel(layer, pixels, x, y)
            expected = rows[y][x * 4:x * 4 + 4]
            if got[3] == 0 and expected[3] == 0:
                continue
            diff = max(abs(a - b) for a, b in zip(got, expected))
            worst = max(worst, diff)
            if diff == 1:
                off_by_one += 1
            if diff > 1:
                bad += 1
    print('  %s: Krita 합성 이미지와 최대 %d단계 차이(1단계 차이 픽셀 %d개)' % (stem, worst, off_by_one))
    if bad:
        report.bad('%s: Krita가 그린 합성 이미지와 1단계를 넘게 다른 픽셀 %d개' % (stem, bad))


def premultiplied(color, alpha):
    return (color * alpha * 2 + 255) // 510


def premultiplied_diff(got, expected):
    """두 직선 RGBA8의 미리 곱한 색 차이의 최댓값(Krita는 마스크를 미리 곱한 알파로 계산해 색이 양자화 잡음만큼 달라진다)."""
    return max(abs(premultiplied(a, got[3]) - premultiplied(b, expected[3])) for a, b in zip(got[:3], expected[:3]))


def mask_value_at(mask, values, x, y):
    extent = mask['extent']
    if extent is not None and values is not None and extent['x'] <= x < extent['x'] + extent['width'] and extent['y'] <= y < extent['y'] + extent['height']:
        return values[(y - extent['y']) * extent['width'] + (x - extent['x'])]
    return mask['defaultValue']


# 마스크 문서(d15): 마스크 값은 Krita가 파일을 다시 열어 읽어 준 값과 모든 픽셀에서 같아야 하고, 투명도 마스크를 적용한 결과는 Krita가
# 다시 연 문서의 투영(8비트 정수)이나 저장한 합성 이미지(16비트 정수·실수)와 알파가 정확히(8비트 정수) 혹은 1단계 이내로 같아야 한다.
# 편집 세션의 값(저장 직전)은 마스크 노드를 옮기면 저장된 파일의 의미와 다를 수 있어서 쓰지 않는다.
def check_masks(report, stem, truth, dump, corpus):
    reopen_path = os.path.join(corpus, stem + '.reopen.json')
    if not os.path.exists(reopen_path):
        report.bad('%s: 재오픈 정답(%s.reopen.json)이 없다' % (stem, stem))
        return
    reopen = json.load(open(reopen_path, encoding='utf-8'))
    info = truth['doc']
    wx, wy, ww, wh = reopen['window']
    model = 'rgb' if info['colorModel'] == 'RGBA' else 'gray'
    eight_bit = info['colorDepth'] == 'U8'
    canvas_w, canvas_h = info['width'], info['height']
    nodes = {}
    for node in reopen['nodes']:
        nodes.setdefault(node['name'], node)
    for layer_index, layer in enumerate(dump['layers']):
        for mask_index, mask in enumerate(layer['masks']):
            tag = '%s/%s' % (stem, mask['name'])
            expected_node = nodes.get(mask['name'])
            if expected_node is None or 'windowB64' not in expected_node:
                report.bad('%s: 재오픈 정답에 마스크가 없다' % tag)
                continue
            expected = base64.b64decode(expected_node['windowB64'])
            values = base64.b64decode(mask['valuesB64']) if mask['valuesB64'] is not None else None
            if mask['defaultValue'] is None:
                # 값 항목이 없는 마스크(선택을 한 번도 주지 않은 새 마스크): 값을 알 수 없다고 보고해야 한다. Krita는 그 레이어를 전부 숨긴다.
                where = 'layer[%d].masks[%d]' % (layer_index, mask_index)
                if not any(u['code'] == 'kra-mask-data-missing' and u.get('path') == where for u in dump['unsupported']):
                    report.bad('%s: 값을 읽지 못했는데 kra-mask-data-missing 진단이 없다' % tag)
                if layer['masked'] is None or layer['masked']['status'] != 'mask-unreadable':
                    report.bad('%s: 보이는 투명도 마스크의 값을 읽지 못했는데 적용 결과가 mask-unreadable이 아니다' % tag)
                if any(expected):
                    report.bad('%s: 값 항목이 없는 마스크인데 Krita가 0이 아닌 값을 읽어 줬다' % tag)
                continue
            mismatches = 0
            for j in range(wh):
                for i in range(ww):
                    report.special_pixels += 1
                    if mask_value_at(mask, values, wx + i, wy + j) != expected[j * ww + i]:
                        mismatches += 1
            if mismatches:
                report.bad('%s: 마스크 값 %d개가 Krita가 다시 열어 읽어 준 값과 다르다' % (tag, mismatches))
            # 값 항목이 둘 다 없는 투명도 마스크(선택을 주지 않은 새 마스크)는 Krita가 다시 열어 읽는 대로 빈 선택으로 해석하고 경고해야 한다
            archive = zipfile.ZipFile(os.path.join(corpus, stem + '.kra'))
            data_path = '%s/layers/%s.pixelselection' % (dump['image']['name'], mask['filename'])
            if data_path not in archive.namelist() and mask['nodeType'] == 'transparencymask':
                where = 'layer[%d].masks[%d]' % (layer_index, mask_index)
                if mask['defaultValue'] != 0 or mask['tileCount'] != 0 or values is not None:
                    report.bad('%s: 값 항목이 없는 투명도 마스크가 빈 선택으로 읽히지 않았다' % tag)
                if not any(w['code'] == 'kra-mask-data-missing' and w.get('path') == where for w in dump['warnings']):
                    report.bad('%s: 값 항목이 없는 마스크인데 kra-mask-data-missing 경고가 없다' % tag)
            print('  %s: 마스크 값 %d개 일치(타일 %d개, 기본값 %d, 오프셋 %d,%d)' % (tag, ww * wh, mask['tileCount'], mask['defaultValue'], mask['offsetX'], mask['offsetY']))

    # 마스크가 달린 래스터 레이어(P)에 마스크를 적용한 결과
    for layer in dump['layers']:
        if layer['name'] != 'P' or layer['masked'] is None:
            continue
        tag = '%s/P(마스크 적용)' % stem
        node = nodes['P']
        masked = layer['masked']
        if masked['status'] != 'applied':
            report.bad('%s: 적용 결과 상태가 %s다' % (tag, masked['status']))
            continue
        pixels = base64.b64decode(masked['pixelsB64'])
        transparency = [m for m in layer['masks'] if m['nodeType'] == 'transparencymask' and m['visible']]
        if masked['appliedMasks'] != len(transparency):
            report.bad('%s: 적용한 마스크 수 %d != 보이는 투명도 마스크 %d' % (tag, masked['appliedMasks'], len(transparency)))
        tolerance = 1 + max(0, len(transparency) - 1)
        if eight_bit:
            native = base64.b64decode(node['projectionB64'])
            psize = len(native) // (ww * wh)
            reference = lambda x, y: native_to_rgba8(model, 8, native[((y - wy) * ww + (x - wx)) * psize:((y - wy) * ww + (x - wx) + 1) * psize], False)
            alpha_slack = 0
        else:
            width, height, rows = png_dec.decode_png(zipfile.ZipFile(os.path.join(corpus, stem + '.kra')).read('mergedimage.png'))
            reference = lambda x, y: rows[y][x * 4:x * 4 + 4]
            alpha_slack = 1
            tolerance = 2
        extent = masked['extent']
        # 필터 마스크의 효과(색 변경)는 적용하지 않으므로, 필터 마스크가 있으면 그 마스크 값이 0인 곳만 색을 본다(알파는 어디서나 본다).
        filters = [(m, base64.b64decode(m['valuesB64']) if m['valuesB64'] is not None else None) for m in layer['masks'] if m['nodeType'] == 'filtermask']
        alpha_bad = color_bad = worst_alpha = worst_color = filtered_skipped = 0
        for y in range(canvas_h):
            for x in range(canvas_w):
                report.special_pixels += 1
                got = pixels[((y - extent['y']) * extent['width'] + (x - extent['x'])) * 4:][:4] if (
                    extent['x'] <= x < extent['x'] + extent['width'] and extent['y'] <= y < extent['y'] + extent['height']) else bytes(4)
                want = reference(x, y)
                worst_alpha = max(worst_alpha, abs(got[3] - want[3]))
                if abs(got[3] - want[3]) > alpha_slack:
                    alpha_bad += 1
                if got[3] == 0 and want[3] == 0:
                    continue
                if any(mask_value_at(m, v, x, y) != 0 for m, v in filters):
                    filtered_skipped += 1
                    continue
                diff = premultiplied_diff(got, want)
                worst_color = max(worst_color, diff)
                if diff > tolerance:
                    color_bad += 1
        print('  %s: 알파 최대 %d단계, 미리 곱한 색 최대 %d단계 차이(캔버스 %dx%d, 적용 마스크 %d개%s)' % (
            tag, worst_alpha, worst_color, canvas_w, canvas_h, masked['appliedMasks'],
            ', 필터 마스크가 색을 바꾸는 픽셀 %d개는 색을 보지 않음' % filtered_skipped if filters else ''))
        if alpha_bad:
            report.bad('%s: 알파가 허용 범위(%d단계)를 넘게 다른 픽셀 %d개' % (tag, alpha_slack, alpha_bad))
        if color_bad:
            report.bad('%s: 미리 곱한 색이 %d단계를 넘게 다른 픽셀 %d개' % (tag, tolerance, color_bad))
        if eight_bit:
            # 레이어 자체의 픽셀은 Krita가 읽어 준 네이티브 바이트와 같다(마스크를 적용하지 않은 값)
            psize = len(base64.b64decode(node['ownB64'])) // (ww * wh)
            compare_window(report, tag + '/own', layer, model, 8, psize, reopen['window'], base64.b64decode(node['ownB64']), False, 'special_pixels')


def check_special(report, stem, truth, dump, corpus):
    """트리 구조가 없는 정답(잡음, 블렌드 후보, PNG 원본, 비압축 타일 문서)."""
    layers = dump['layers']
    linear = is_linear(dump['image']['profileName'])
    if stem == 'd08-noise':
        layer = [l for l in layers if l['name'] == 'Noise'][0]
        compare_window(report, stem, layer, 'rgb', 8, 4, truth['window'], base64.b64decode(truth['pixelsB64']), False, 'special_pixels')
    elif stem == 'd09-blend2':
        saved = [l['compositeOp'] for l in reversed(layers)][1:]  # 아래 -> 위, 배경 제외
        if len(saved) != len(truth['blend']):
            report.bad('%s: 후보 %d개인데 레이어 %d개' % (stem, len(truth['blend']), len(saved)))
        for requested, got in zip(truth['blend'], saved):
            # 받아들이지 않는 id는 normal로 저장된다. 받아들였다면 요청한 id 그대로여야 한다.
            if got != requested['requested'] and got != 'normal':
                report.bad('%s: 요청 %s가 %s로 저장됐다' % (stem, requested['requested'], got))
        for layer in layers:
            if not layer['compositeOpKnown']:
                report.bad('%s: %s가 관찰 목록에 없다' % (stem, layer['compositeOp']))
    elif stem.startswith(('d11-', 'd12-')):
        info = truth['doc']
        model = 'rgb' if info['colorModel'] == 'RGBA' else 'gray'
        depth = 16 if info['colorDepth'] == 'U16' else 8
        for name, native_b64 in truth['layers'].items():
            layer = [l for l in layers if l['name'] == name][0]
            compare_window(report, '%s/%s' % (stem, name), layer, model, depth, truth['pixelSize'], truth['window'], base64.b64decode(native_b64), linear, 'special_pixels')
    elif stem.startswith('d13-'):
        # 8비트 정수 문서 + 선형(g10) 프로파일. 정답은 같은 내용을 Krita가 srgbtrc 프로파일로 변환한 값이고, Krita의 색 변환(lcms)과
        # 우리 식은 최대 1단계 차이를 허용한다(알파는 정확히 같아야 한다).
        info = truth['doc']
        model = 'rgb' if info['colorModel'] == 'RGBA' else 'gray'
        psize = truth['pixelSize']
        layer = [l for l in layers if l['name'] == 'P'][0]
        expected = base64.b64decode(truth['srgb']['P'])
        pixels = base64.b64decode(layer['pixelsB64'])
        width, height = truth['window'][2], truth['window'][3]
        mismatches = 0
        for j in range(height):
            for i in range(width):
                got = layer_pixel(layer, pixels, i, j)
                exp = native_to_rgba8(model, 8, expected[(j * width + i) * psize:(j * width + i + 1) * psize], False)
                if any(abs(a - b) > 1 for a, b in zip(got[:3], exp[:3])) or got[3] != exp[3]:
                    mismatches += 1
                report.special_pixels += 1
        if mismatches:
            report.bad('%s: Krita가 변환한 sRGB 값과 1단계를 넘게 다른 픽셀 %d개' % (stem, mismatches))
    elif stem.startswith('d14-'):
        info = truth['doc']
        model = 'rgb' if info['colorModel'] == 'RGBA' else 'gray'
        depth = 16 if info['colorDepth'] == 'F16' else 32
        layer = [l for l in layers if l['name'] == 'P'][0]
        # (1) 환원식과 정확히 같다: 네이티브 바이트는 Krita가 읽어 준 pixelData다
        compare_window(report, stem, layer, model, depth, truth['pixelSize'], truth['window'], base64.b64decode(truth['layers']['P']), linear, 'special_pixels', 'float')
        # (2) Krita가 그린 합성 이미지와 1단계 이내로 같다
        check_float_against_render(report, stem, layer, corpus)
    elif stem.startswith('d15-'):
        check_masks(report, stem, truth, dump, corpus)
    elif stem.startswith('d10-'):
        width, height, rows = png_dec.decode_png(open(os.path.join(HERE, 'in', truth['source']), 'rb').read())
        if dump['image']['width'] != width or dump['image']['height'] != height:
            report.bad('%s: 캔버스 크기가 원본 PNG와 다르다' % stem)
        layer = layers[0]
        pixels = base64.b64decode(layer['pixelsB64'])
        mismatches = 0
        for y in range(height):
            for x in range(width):
                if layer_pixel(layer, pixels, x, y) != rows[y][x * 4:x * 4 + 4]:
                    mismatches += 1
                report.special_pixels += 1
        if mismatches:
            report.bad('%s: 원본 PNG와 다른 픽셀 %d개' % (stem, mismatches))
    else:
        report.bad('%s: 이 정답 형태를 검사하는 코드가 없다' % stem)


def check_tree(report, stem, truth, dump, corpus):
    path = os.path.join(corpus, truth.get('file') or (stem + '.kra'))
    raw = open(path, 'rb').read()
    if dump['source']['sha256'] != hashlib.sha256(raw).hexdigest() or dump['source']['byteLength'] != len(raw):
        report.bad('%s: 원본 해시·길이' % stem)
    archive = zipfile.ZipFile(path)
    names = archive.namelist()
    image, info = dump['image'], truth['doc']
    base = image['name']
    if (image['name'], image['width'], image['height']) != (info['name'], info['width'], info['height']):
        report.bad('%s: 이미지 이름·크기' % stem)
    if image['profileName'] != info.get('colorProfile'):
        report.bad('%s: 프로파일 %r != %r' % (stem, image['profileName'], info.get('colorProfile')))
    if image['xRes'] != info.get('xRes') or image['yRes'] != info.get('yRes'):
        report.bad('%s: 해상도' % stem)
    for key, entry in (('mergedImagePngSha256', 'mergedimage.png'), ('previewPngSha256', 'preview.png'), ('iccSha256', base + '/annotations/icc')):
        expected = hashlib.sha256(archive.read(entry)).hexdigest() if entry in names else None
        if dump[key] != expected:
            report.bad('%s: %s %r != %r' % (stem, key, dump[key], expected))

    nodes = flatten(truth['tree'], [])
    if len(nodes) != len(dump['layers']):
        report.bad('%s: 레이어 수 %d != %d' % (stem, len(nodes), len(dump['layers'])))
        return
    linear = is_linear(image['profileName'])
    for node, layer in zip(nodes, dump['layers']):
        tag = '%s/%s' % (stem, node['name'])
        checks = (
            ('이름', layer['name'], node['name']),
            ('uuid', layer['uuid'], node.get('uuid')),
            ('종류', layer['nodeType'], API_TO_FILE_TYPE.get(node['type'], node['type'])),
            ('불투명도', layer['opacityRaw'], node['opacity']),
            ('보임', layer['visible'], node['visible']),
            ('잠금', layer['locked'], node['locked']),
            ('색 라벨', layer['colorLabel'], node['colorLabel']),
        )
        for label, got, expected in checks:
            if got != expected:
                report.bad('%s: %s %r != %r' % (tag, label, got, expected))
        if node['type'] == 'grouplayer' and layer['collapsed'] != node['collapsed']:
            report.bad('%s: 접힘' % tag)
        # 받아들이지 않는 합성 id는 Krita가 normal로 저장한다(요청값은 정답이 아니다).
        if layer['compositeOp'] != node['blendingMode'] and layer['compositeOp'] != 'normal':
            report.bad('%s: 합성 연산 %s != 요청 %s' % (tag, layer['compositeOp'], node['blendingMode']))
        if not layer['compositeOpKnown']:
            report.bad('%s: 합성 연산 %s가 관찰 목록에 없다' % (tag, layer['compositeOp']))
        if sorted(m['name'] for m in node['_masks']) != sorted(m['name'] for m in layer['masks']):
            report.bad('%s: 마스크 이름' % tag)
        for mask in node['_masks']:
            got = [m for m in layer['masks'] if m['name'] == mask['name']]
            if got and got[0]['nodeType'] != mask['type']:
                report.bad('%s: 마스크 종류 %s != %s' % (tag, got[0]['nodeType'], mask['type']))
        if node['type'] != 'paintlayer':
            continue
        report.layers_checked += 1
        color_space = layer['colorSpace']
        if color_space not in FORMATS:
            report.layers_unsupported += 1
            if layer['pixelsB64'] is not None:
                report.bad('%s: 지원하지 않는 색 공간 %s인데 픽셀이 있다' % (tag, color_space))
            expected_path = 'layer[%d]' % layer['index']
            if not any(u['code'] == 'kra-colorspace-unsupported' and u.get('path') == expected_path for u in dump['unsupported']):
                report.bad('%s: 지원하지 않는 색 공간 %s인데 unsupported 진단이 없다' % (tag, color_space))
            continue
        model, depth, psize, kind = FORMATS[color_space]
        if node['pixelSize'] != psize:
            report.bad('%s: 픽셀 크기' % tag)
            continue
        if layer['defaultPixel'] is None:
            report.bad('%s: 기본 픽셀이 없다' % tag)
            continue
        compare_window(report, tag, layer, model, depth, psize, node['window'], base64.b64decode(node['windowPixelsB64']), linear, 'window_pixels', kind)


def main():
    corpus, dump_dir = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    report = Report()
    seen_ops = set()
    for truth_path in sorted(glob.glob(os.path.join(corpus, '*.truth.json'))):
        stem = os.path.basename(truth_path)[:-len('.truth.json')]
        truth = json.load(open(truth_path, encoding='utf-8'))
        dump = json.load(open(os.path.join(dump_dir, stem + '.json'), encoding='utf-8'))
        if dump.get('error'):
            report.bad('%s: 가져오기 실패 %s' % (stem, dump['error']))
            continue
        seen_ops.update(layer['compositeOp'] for layer in dump['layers'])
        if 'tree' in truth:
            check_tree(report, stem, truth, dump, corpus)
        else:
            check_special(report, stem, truth, dump, corpus)

    # 관찰 목록(kra-composite-ops.ts)은 코퍼스에서 저장된 id의 집합과 같아야 한다.
    source = open(COMPOSITE_OPS_SOURCE, encoding='utf-8').read()
    known = set(re.findall(r'"([^"]+)",', source.split('OBSERVED_IDS = [')[1].split('] as const')[0]))
    if known != seen_ops:
        report.bad('합성 연산 목록 불일치: 목록에만 %s, 코퍼스에만 %s' % (sorted(known - seen_ops), sorted(seen_ops - known)))

    print('레이어 %d개 검사(미지원 색 공간으로 픽셀을 건너뜀 %d개), 창 픽셀 %d개 + 전용 검사 픽셀 %d개 비교, 문제 %d건' % (
        report.layers_checked, report.layers_unsupported, report.window_pixels, report.special_pixels, len(report.problems)))
    print('ALL MATCH' if not report.problems else 'MISMATCH')
    sys.exit(1 if report.problems else 0)


main()
