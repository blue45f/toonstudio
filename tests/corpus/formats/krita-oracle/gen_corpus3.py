# 3차 코퍼스: (1) 비압축(플래그 0) 타일의 배치를 지원하는 모든 색 공간에서 확인하고 (2) 옮긴 레이어(x, y 오프셋, 음수 좌표, 캔버스 밖)의
# 타일 좌표 의미를 확인하고 (3) 8비트 정수 문서에 선형 프로파일을 붙인 경우의 값 의미를 확인한다. 정답 = Krita가 읽어 준 픽셀(Node.pixelData).
import base64, json, os, random, traceback
from krita import Krita
from PyQt5.QtCore import QByteArray
OUT = os.environ["KRA_OUT"]
LOG = {"errors": []}

SPECS = [  # (이름, 모델, 깊이, 프로파일, 픽셀 바이트)
    ("d11-noise-rgba8", "RGBA", "U8", "sRGB-elle-V2-srgbtrc.icc", 4),
    ("d11-noise-rgba16-srgbtrc", "RGBA", "U16", "sRGB-elle-V2-srgbtrc.icc", 8),
    ("d11-noise-rgba16-g10", "RGBA", "U16", "sRGB-elle-V2-g10.icc", 8),
    ("d11-noise-gray8", "GRAYA", "U8", "", 2),
    ("d11-noise-gray16", "GRAYA", "U16", "", 4),
]

def save(doc, name, truth):
    doc.setBatchmode(True)
    doc.refreshProjection()
    ok = doc.saveAs(os.path.join(OUT, name + ".kra"))
    truth["saved"] = bool(ok)
    json.dump(truth, open(os.path.join(OUT, name + ".truth.json"), "w"))
    doc.close()

def noise_docs():
    app = Krita.instance()
    for name, model, depth, profile, psize in SPECS:
        w, h = 200, 150
        doc = app.createDocument(w, h, name, model, depth, profile, 72.0)
        root = doc.rootNode()
        rnd = random.Random(sum(map(ord, name)))
        noise = doc.createNode("Noise", "paintlayer")
        noise.setPixelData(QByteArray(bytes(rnd.randrange(256) for _ in range(w * h * psize))), 0, 0, w, h)
        root.addChildNode(noise, None)
        mixed = doc.createNode("Mixed", "paintlayer")
        # 왼쪽 100열은 잡음, 오른쪽은 한 값으로 채워 비압축 타일과 압축 타일이 한 레이어에 섞이게 한다.
        buf = bytearray()
        for y in range(h):
            buf += bytes(rnd.randrange(256) for _ in range(100 * psize)) + bytes([0x40] * ((w - 100) * psize))
        mixed.setPixelData(QByteArray(bytes(buf)), 0, 0, w, h)
        root.addChildNode(mixed, None)
        truth = {"doc": {"name": name, "width": w, "height": h, "colorModel": model, "colorDepth": depth, "profile": doc.colorProfile()}, "pixelSize": psize, "window": [0, 0, w, h],
                 "layers": {"Noise": base64.b64encode(noise.pixelData(0, 0, w, h).data()).decode(), "Mixed": base64.b64encode(mixed.pixelData(0, 0, w, h).data()).decode()}}
        save(doc, name, truth)

def offset_docs():
    """레이어를 여러 방식으로 옮긴 문서. 블록 위치와 이동량을 일부러 64의 배수가 아니게 잡았다."""
    app = Krita.instance()
    w, h = 130, 90
    name = "d12-offsets"
    doc = app.createDocument(w, h, name, "RGBA", "U8", "sRGB-elle-V2-srgbtrc.icc", 72.0)
    root = doc.rootNode()
    # (이름, 블록 x, y, 너비, 높이, 이동 dx, dy)
    specs = [("A", 5, 7, 40, 30, 37, -11), ("B", -20, -10, 50, 40, -70, 25), ("C", 100, 60, 60, 50, 63, 65), ("D", 0, 0, 150, 100, -64, -64)]
    rnd = random.Random(12)
    for index, (lname, bx, by, bw, bh, dx, dy) in enumerate(specs):
        layer = doc.createNode(lname, "paintlayer")
        layer.setPixelData(QByteArray(bytes(rnd.randrange(1, 256) if i % 4 == 3 else rnd.randrange(256) for i in range(bw * bh * 4))), bx, by, bw, bh)
        root.addChildNode(layer, None)
        layer.move(dx, dy)
    window = [-300, -300, 700, 600]
    layers = {}
    for node in root.childNodes():
        if node.type() == "paintlayer" and node.name() in {s[0] for s in specs}:
            layers[node.name()] = base64.b64encode(node.pixelData(*window).data()).decode()
    truth = {"doc": {"name": name, "width": w, "height": h, "colorModel": "RGBA", "colorDepth": "U8", "profile": doc.colorProfile()}, "pixelSize": 4, "window": window, "layers": layers,
             "moves": {s[0]: [s[5], s[6]] for s in specs}}
    save(doc, name, truth)

def linear8_docs():
    """8비트 정수 문서에 선형(g10) 프로파일을 붙인 경우. 같은 내용을 한 번 더 만들어 Krita 자신의 색 변환(g10 -> srgbtrc)을 거친 값을
    `srgb`에 담는다: 선형 값의 sRGB 부호화 표현이 정답이다. (Krita가 저장하는 mergedimage.png는 RGBA 8비트에서는 변환하지 않고 프로파일만 붙이므로
    정답으로 쓸 수 없다.)"""
    app = Krita.instance()
    jobs = (("d13-linear8-rgba", "RGBA", "sRGB-elle-V2-g10.icc", "sRGB-elle-V2-srgbtrc.icc", 4), ("d13-linear8-gray", "GRAYA", "Gray-D50-elle-V2-g10.icc", "Gray-D50-elle-V2-srgbtrc.icc", 2))
    w, h = 64, 48
    for name, model, profile, srgb_profile, psize in jobs:
        data = bytearray()
        for y in range(h):
            for x in range(w):
                for c in range(psize):
                    data.append(255 if c == psize - 1 else (x * 4 + y * 3 + c * 61) & 0xFF)

        def build(doc_name, doc_profile):
            doc = app.createDocument(w, h, doc_name, model, "U8", doc_profile, 72.0)
            layer = doc.createNode("P", "paintlayer")
            layer.setPixelData(QByteArray(bytes(data)), 0, 0, w, h)
            doc.rootNode().addChildNode(layer, None)
            return doc, layer

        reference, _ = build(name + "-ref", profile)
        reference.setColorSpace(model, "U8", srgb_profile)
        reference.refreshProjection()
        converted = [n for n in reference.rootNode().childNodes() if n.name() == "P"][0]
        srgb = base64.b64encode(converted.pixelData(0, 0, w, h).data()).decode()
        reference.close()

        doc, layer = build(name, profile)
        truth = {"doc": {"name": name, "width": w, "height": h, "colorModel": model, "colorDepth": "U8", "profile": doc.colorProfile()}, "pixelSize": psize, "window": [0, 0, w, h],
                 "layers": {"P": base64.b64encode(layer.pixelData(0, 0, w, h).data()).decode()}, "srgb": {"P": srgb}}
        save(doc, name, truth)

def __main__(*args):
    try:
        noise_docs()
        offset_docs()
        linear8_docs()
    except Exception:
        LOG["errors"].append({"trace": traceback.format_exc()})
    json.dump(LOG, open(os.path.join(OUT, "gen3.log.json"), "w"))
