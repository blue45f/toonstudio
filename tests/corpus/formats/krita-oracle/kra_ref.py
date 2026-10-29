# .kra 독립 해석기(참조용): 표준 라이브러리만 사용. LZF는 공개된 포맷 설명대로 직접 구현했다.
import re, sys, zipfile, xml.etree.ElementTree as ET

def lzf_decompress(src, out_len):
    out = bytearray()
    ip = 0
    n = len(src)
    while ip < n:
        ctrl = src[ip]; ip += 1
        if ctrl < 32:
            run = ctrl + 1
            if ip + run > n: raise ValueError('literal overrun')
            out += src[ip:ip + run]; ip += run
        else:
            length = ctrl >> 5
            ref = len(out) - ((ctrl & 0x1f) << 8) - 1
            if length == 7:
                length += src[ip]; ip += 1
            ref -= src[ip]; ip += 1
            length += 2
            if ref < 0: raise ValueError('bad back reference')
            for _ in range(length):
                out.append(out[ref]); ref += 1
    if len(out) != out_len: raise ValueError('size %d != %d' % (len(out), out_len))
    return bytes(out)

def parse_layer_file(data):
    pos = 0
    header = {}
    for _ in range(5):
        j = data.index(b'\n', pos)
        key, _, val = data[pos:j].decode('ascii').partition(' ')
        header[key] = int(val)
        pos = j + 1
    tiles = []
    for _ in range(header['DATA']):
        j = data.index(b'\n', pos)
        x, y, comp, size = data[pos:j].decode('ascii').split(',')
        pos = j + 1
        size = int(size)
        payload = data[pos:pos + size]; pos += size
        tiles.append((int(x), int(y), comp, size, payload))
    return header, tiles, pos

def decode_tile(header, comp, payload):
    tw, th, ps = header['TILEWIDTH'], header['TILEHEIGHT'], header['PIXELSIZE']
    flag, body = payload[0], payload[1:]
    if flag == 0: raw = body
    elif flag == 1: raw = lzf_decompress(body, tw * th * ps)
    else: raise ValueError('flag %d' % flag)
    return flag, raw

if __name__ == '__main__':
    z = zipfile.ZipFile(sys.argv[1])
    root = ET.fromstring(z.read('maindoc.xml'))
    img = root.find('{*}IMAGE') if root.find('{*}IMAGE') is not None else root.find('IMAGE')
    print('image', img.attrib.get('name'), img.attrib.get('width'), img.attrib.get('height'), img.attrib.get('colorspacename'))
    name = img.attrib['name']
    for layer in root.iter():
        if layer.tag.endswith('layer'):
            fn = layer.attrib.get('filename')
            path = '%s/layers/%s' % (name, fn)
            h, tiles, end = parse_layer_file(z.read(path))
            print(layer.attrib.get('name'), layer.attrib.get('nodetype'), h, 'tiles', [(t[0], t[1], t[2], t[3]) for t in tiles], 'trailing', len(z.read(path)) - end)
            for (x, y, comp, size, payload) in tiles:
                flag, raw = decode_tile(h, comp, payload)
                print(' tile', x, y, 'flag', flag, 'raw', len(raw))
