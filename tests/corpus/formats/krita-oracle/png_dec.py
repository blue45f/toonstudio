import struct, zlib
def decode_png(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8; idat = b''; hdr = None; plte = None
    while pos < len(data):
        n, = struct.unpack('>I', data[pos:pos+4]); t = data[pos+4:pos+8]; d = data[pos+8:pos+8+n]; pos += 12 + n
        if t == b'IHDR': hdr = struct.unpack('>IIBBBBB', d)
        elif t == b'IDAT': idat += d
        elif t == b'PLTE': plte = d
    w, h, depth, ctype, _, _, il = hdr
    assert il == 0
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    bpp = max(1, ch * depth // 8)
    stride = (w * ch * depth + 7) // 8
    raw = zlib.decompress(idat)
    out = []; prev = bytearray(stride); p = 0
    for y in range(h):
        f = raw[p]; line = bytearray(raw[p+1:p+1+stride]); p += 1 + stride
        for i in range(stride):
            a = line[i-bpp] if i >= bpp else 0
            b = prev[i]; c = prev[i-bpp] if i >= bpp else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif f == 4:
                pa = abs(b - c); pb = abs(a - c); pc = abs(a + b - 2*c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out.append(bytes(line)); prev = line
    # RGBA8 straight alpha 표로 변환(8비트 PNG만)
    assert depth == 8
    rows = []
    for line in out:
        row = bytearray()
        for x in range(w):
            px = line[x*ch:(x+1)*ch]
            if ctype == 6: row += px
            elif ctype == 2: row += px + b'\xff'
            elif ctype == 4: row += bytes([px[0], px[0], px[0], px[1]])
            elif ctype == 0: row += bytes([px[0], px[0], px[0], 255])
            else: raise ValueError('ctype')
        rows.append(bytes(row))
    return w, h, rows
