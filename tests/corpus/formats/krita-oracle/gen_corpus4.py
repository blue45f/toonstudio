# 4차 코퍼스: 실수형(F16·F32) RGBA·GRAYA 문서. 레이어 하나(P)의 합성 결과가 곧 그 레이어가 되도록 만들어서, Krita가 저장한 합성 이미지
# (mergedimage.png)를 sRGB 8비트 정답으로 쓴다(코덱의 출력과 대조한다). 기본 문서들은 P가 캔버스 전체를 알파 1.0으로 덮는다. `-alpha` 문서는
# 알파가 0~1로 변하고 Background를 투명하게 비워서, 합성 이미지의 알파와 비프리멀티플라이 색이 레이어와 같은지 본다.
# Krita 5.2.2는 이 스크립트를 한 프로세스에서 여러 문서에 돌리거나 Background를 숨기면 비정상 종료한 적이 있어 문서마다 따로 실행한다(KRA_ONLY=문서 이름).
# 정답 픽셀(Node.pixelData)은 입력한 값이 아니라 Krita가 저장 직전에 읽어 준 네이티브 바이트다.
import base64, json, os, random, struct, traceback
from krita import Krita
from PyQt5.QtCore import QByteArray
OUT = os.environ["KRA_OUT"]
LOG = {"errors": []}

SPECS = [  # (이름, 모델, 깊이, 프로파일, 채널 수, 샘플 바이트, 알파가 변하는가)
    ("d14-float-rgba16-g10", "RGBA", "F16", "sRGB-elle-V2-g10.icc", 4, 2, False),
    ("d14-float-rgba32-g10", "RGBA", "F32", "sRGB-elle-V2-g10.icc", 4, 4, False),
    ("d14-float-gray16", "GRAYA", "F16", "", 2, 2, False),
    ("d14-float-gray32", "GRAYA", "F32", "", 2, 4, False),
    ("d14-float-rgba16-srgbtrc", "RGBA", "F16", "sRGB-elle-V2-srgbtrc.icc", 4, 2, False),
    ("d14-float-rgba32-srgbtrc", "RGBA", "F32", "sRGB-elle-V2-srgbtrc.icc", 4, 4, False),
    ("d14-float-rgba16-alpha", "RGBA", "F16", "sRGB-elle-V2-g10.icc", 4, 2, True),
    ("d14-float-rgba32-alpha", "RGBA", "F32", "sRGB-elle-V2-g10.icc", 4, 4, True),
    ("d14-float-gray16-alpha", "GRAYA", "F16", "", 2, 2, True),
    ("d14-float-gray32-alpha", "GRAYA", "F32", "", 2, 4, True),
]


def save(doc, name, truth):
    doc.setBatchmode(True)
    doc.refreshProjection()
    ok = doc.saveAs(os.path.join(OUT, name + ".kra"))
    truth["saved"] = bool(ok)
    json.dump(truth, open(os.path.join(OUT, name + ".truth.json"), "w"))
    doc.close()


def pattern(width, height, channels, sample_bytes, seed, vary_alpha):
    """채널·행·열 순서를 가리는 패턴. 앞쪽 절반은 k/16(반정밀도로 정확히 표현됨), 뒤쪽 절반은 [0, 1]의 임의 값(반올림이 일어남).
    마지막 채널(알파)은 vary_alpha가 아니면 1.0이고, 맞으면 픽셀마다 0~1로 변한다."""
    rnd = random.Random(seed)
    fmt = "<e" if sample_bytes == 2 else "<f"
    out = bytearray()
    for y in range(height):
        for x in range(width):
            for c in range(channels):
                if c == channels - 1:
                    value = ((x * 5 + y * 3 + seed) % 17) / 16.0 if vary_alpha else 1.0
                elif x < width // 2:
                    value = ((x * (7 + c) + y * (3 + 2 * c) + seed * 5) % 17) / 16.0
                else:
                    value = rnd.random()
                out += struct.pack(fmt, value)
    return bytes(out)


def float_docs():
    app = Krita.instance()
    only = os.environ.get("KRA_ONLY")
    for index, (name, model, depth, profile, channels, sample_bytes, vary_alpha) in enumerate(SPECS):
        if only and name != only:
            continue
        w, h = 32, 24
        doc = app.createDocument(w, h, name, model, depth, profile, 72.0)
        root = doc.rootNode()
        layer = doc.createNode("P", "paintlayer")
        layer.setPixelData(QByteArray(pattern(w, h, channels, sample_bytes, 20 + index, vary_alpha)), 0, 0, w, h)
        root.addChildNode(layer, None)
        if vary_alpha:
            for node in root.childNodes():
                if node.name() == "Background":
                    node.setPixelData(QByteArray(bytes(w * h * channels * sample_bytes)), 0, 0, w, h)
        truth = {"doc": {"name": name, "width": w, "height": h, "colorModel": model, "colorDepth": depth, "profile": doc.colorProfile()},
                 "pixelSize": channels * sample_bytes, "window": [0, 0, w, h],
                 "layers": {"P": base64.b64encode(layer.pixelData(0, 0, w, h).data()).decode()}}
        save(doc, name, truth)


def __main__(*args):
    try:
        float_docs()
    except Exception:
        LOG["errors"].append({"trace": traceback.format_exc()})
    json.dump(LOG, open(os.path.join(OUT, "gen4.log.json"), "w"))
