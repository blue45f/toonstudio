# 코퍼스(d15)에서 실제 Krita가 만든 마스크 타일 페이로드를 뽑아 TypeScript 테스트 벡터(kra-real-mask-vectors.ts)로 쓴다.
# 사용법: python3 -I export_mask_vectors.py <코퍼스 디렉터리> <출력 .ts 경로>
#
# 벡터 하나 = 마스크 타일 페이로드(Krita가 쓴 그대로) + 풀었을 때의 SHA-256(독립 Python LZF 해석기로 계산) + 알려진 정답 값. 정답 값은
# Krita가 문서를 다시 열어 읽어 준 마스크 값(Selection.pixelData, <이름>.reopen.json)이다. 이 저장소의 합성 문서이고 사용자 콘텐츠가 아니다.
import base64
import hashlib
import json
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kra_ref  # noqa: E402

# (벡터 id, 문서, 마스크 이름, 타일 좌표(마스크 로컬), 설명)
SPECS = [
    ('d15-tm-basic-corner', 'd15-tm-basic', 'tm', (0, 0), '대각 그라데이션 마스크의 왼쪽 위 타일(사각형 가장자리가 타일 안을 지난다)'),
    ('d15-tm-basic-edge', 'd15-tm-basic', 'tm', (128, 64), '같은 마스크의 오른쪽 아래 타일(가장자리만 걸친다)'),
    ('d15-tm-inverted-corner', 'd15-tm-inverted', 'tm', (0, 0), '선택을 뒤집은 마스크의 왼쪽 위 타일(기본값 255)'),
    ('d15-grid8-rows', 'd15-grid8', 'tm', (64, 128), '행마다 값이 같은 마스크 타일(참조가 많은 LZF)'),
    ('d15-tm-maskmove-offset', 'd15-tm-maskmove', 'tm', (64, 0), '마스크 노드를 (10, 7)만큼 옮긴 문서의 타일(타일 좌표는 마스크 로컬)'),
    ('d15-tm-two-lower', 'd15-tm-two', 'tmA', (64, 64), '마스크가 둘인 레이어에서 아래 마스크의 타일'),
    ('d15-tm-noise', 'd15-tm-noise', 'tm', (0, 0), '잡음 마스크: 압축이 안 돼 비압축(플래그 0) 타일로 저장된다'),
]
LOCAL_PROBES = [(0, 0), (1, 0), (63, 0), (0, 63), (63, 63), (10, 20), (32, 32), (47, 13), (5, 60), (20, 40)]


def read_mask(corpus, stem, mask_name):
    archive = zipfile.ZipFile(os.path.join(corpus, stem + '.kra'))
    maindoc = archive.read('maindoc.xml').decode('utf-8')
    image = re.search(r'<IMAGE [^>]*(?<![A-Za-z])name="([^"]*)"', maindoc).group(1)
    for element in re.findall(r'<mask [^>]*>', maindoc):
        attrs = dict(re.findall(r'(?<![A-Za-z])([A-Za-z-]+)="([^"]*)"', element))
        if attrs['name'] == mask_name:
            return archive, image, attrs
    raise KeyError(mask_name)


def vector(corpus, spec):
    vid, stem, mask_name, tile, note = spec
    archive, image, attrs = read_mask(corpus, stem, mask_name)
    base = '%s/layers/%s.pixelselection' % (image, attrs['filename'])
    header, tiles, _ = kra_ref.parse_layer_file(archive.read(base))
    assert header['PIXELSIZE'] == 1
    payload = [t for t in tiles if (t[0], t[1]) == tile][0][4]
    default = archive.read(base + '.defaultpixel')
    assert len(default) == 1
    flag = payload[0]
    raw = payload[1:] if flag == 0 else kra_ref.lzf_decompress(payload[1:], header['TILEWIDTH'] * header['TILEHEIGHT'])
    offset = (int(attrs['x']), int(attrs['y']))
    reopen = json.load(open(os.path.join(corpus, stem + '.reopen.json'), encoding='utf-8'))
    wx, wy, ww, wh = reopen['window']
    node = [n for n in reopen['nodes'] if n['name'] == mask_name and 'windowB64' in n][0]
    values = base64.b64decode(node['windowB64'])
    probes = []
    for (lx, ly) in LOCAL_PROBES:
        ix, iy = tile[0] + offset[0] + lx, tile[1] + offset[1] + ly
        assert wx <= ix < wx + ww and wy <= iy < wy + wh, (vid, ix, iy)
        probes.append({'x': lx, 'y': ly, 'value': values[(iy - wy) * ww + (ix - wx)]})
        # 파일의 값과 Krita가 읽어 준 값이 같다는 것을 만들 때 확인한다
        assert raw[ly * 64 + lx] == probes[-1]['value'], (vid, lx, ly)
    return {
        'id': vid,
        'origin': '%s (정답 = Krita가 문서를 다시 열어 읽어 준 마스크 값)' % note,
        'nodeType': attrs['nodetype'],
        'offset': list(offset),
        'tile': list(tile),
        'flag': flag,
        'defaultValue': default[0],
        'payloadBase64': base64.b64encode(payload).decode('ascii'),
        'rawSha256': hashlib.sha256(raw).hexdigest(),
        'probes': probes,
    }


def format_vector(vec):
    lines = ['  {']
    for key in ('id', 'origin', 'nodeType', 'offset', 'tile', 'flag', 'defaultValue', 'payloadBase64', 'rawSha256'):
        lines.append('    %s: %s,' % (json.dumps(key), json.dumps(vec[key], ensure_ascii=False)))
    lines.append('    "probes": [')
    for probe in vec['probes']:
        lines.append('      { "x": %d, "y": %d, "value": %d },' % (probe['x'], probe['y'], probe['value']))
    lines.append('    ],')
    lines.append('  },')
    return '\n'.join(lines)


def main():
    corpus, out_path = os.path.abspath(sys.argv[1]), sys.argv[2]
    vectors = [vector(corpus, spec) for spec in SPECS]
    lines = [
        '/**',
        ' * @file kra-real-mask-vectors.ts',
        ' * @description 실제 Krita 5.2.2가 저장한 마스크 타일(`.pixelselection`, 픽셀 1바이트) 페이로드의 알려진 정답 벡터.',
        ' *              `tests/corpus/formats/krita-oracle/export_mask_vectors.py`가 만든다.',
        ' *',
        ' * 입력은 스크립트가 그린 합성 마스크이고 사용자 콘텐츠가 아니다. 페이로드는 문서에서 타일 하나를 그대로 떼어 낸 바이트다.',
        ' * `rawSha256`은 독립 Python LZF 해석기로 푼 4096바이트의 SHA-256이고, `probes`는 Krita가 문서를 다시 열어 읽어 준 마스크 값이다',
        ' * (이미지 좌표 = 타일 좌표 + 마스크 오프셋 + 타일 안 좌표). 수정하지 말고 스크립트로 다시 만든다.',
        ' */',
        '',
        'export interface KraRealMaskVector {',
        '  readonly id: string;',
        '  readonly origin: string;',
        '  readonly nodeType: string;',
        '  /** `<mask>`의 x, y 속성. */',
        '  readonly offset: readonly [number, number];',
        '  /** 마스크 로컬 타일 좌표. */',
        '  readonly tile: readonly [number, number];',
        '  /** 페이로드 첫 바이트: 1이면 LZF 스트림, 0이면 비압축 원본. */',
        '  readonly flag: 0 | 1;',
        '  readonly defaultValue: number;',
        '  readonly payloadBase64: string;',
        '  readonly rawSha256: string;',
        '  readonly probes: readonly { readonly x: number; readonly y: number; readonly value: number }[];',
        '}',
        '',
        'export const KRA_REAL_MASK_VECTORS: readonly KraRealMaskVector[] = [',
        '\n'.join(format_vector(vec) for vec in vectors),
        '];',
        '',
    ]
    with open(out_path, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))
    for vec in vectors:
        print(vec['id'], vec['nodeType'], 'flag', vec['flag'], 'offset', vec['offset'], 'tile', vec['tile'], len(base64.b64decode(vec['payloadBase64'])), '바이트')


main()
