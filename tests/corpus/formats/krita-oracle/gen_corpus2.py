# 2차 코퍼스: 비압축 타일 관찰, 블렌드 모드 id 후보 탐색, PNG를 가져와 색 공간을 바꿔 저장(정답 = 원본 PNG).
import base64, json, os, random, struct, traceback
from krita import Krita, InfoObject
from PyQt5.QtCore import QByteArray
OUT = os.environ["KRA_OUT"]; INDIR = os.environ["KRA_IN"]
LOG = {"errors": []}

def save(doc, name, truth):
    doc.setBatchmode(True)
    doc.refreshProjection()
    path = os.path.join(OUT, name + ".kra")
    ok = doc.saveAs(path)
    truth["saved"] = bool(ok)
    json.dump(truth, open(os.path.join(OUT, name + ".truth.json"), "w"))
    doc.close()

def d08_noise():
    app = Krita.instance()
    doc = app.createDocument(130, 70, "d08-noise", "RGBA", "U8", "", 72.0)
    root = doc.rootNode()
    rnd = random.Random(7)
    layer = doc.createNode("Noise", "paintlayer")
    data = bytes(rnd.randrange(256) for _ in range(130 * 70 * 4))
    layer.setPixelData(QByteArray(data), 0, 0, 130, 70)
    root.addChildNode(layer, None)
    save(doc, "d08-noise", {"window": [0, 0, 130, 70], "pixelsB64": base64.b64encode(layer.pixelData(0, 0, 130, 70).data()).decode()})

CANDIDATES = ["normal", "hard mix", "hard_mix_photoshop", "hard_mix_softer_photoshop", "linear light", "luminize", "luminosity", "lightness", "color_hsv", "colorize", "value", "hue_hsv", "saturation_hsv", "hue_hsi", "saturation_hsi", "intensity", "hue_hsl", "saturation_hsl", "lightness_hsl", "decrease_lightness", "increase_lightness", "decrease_saturation", "increase_saturation", "decrease_value", "increase_value", "soft_light_ifs_illusions", "soft_light_pegtop_delphi", "gamma_light", "gamma_dark", "gamma_illumination", "flat_light", "easy_dodge", "easy_burn", "fhyrd", "reflect", "glow", "heat", "freeze", "freeze_reflect", "heat_glow", "heat_glow_freeze_reflect_hybrid", "allanon", "interpolation", "interpolation 2x", "penumbra a", "penumbra b", "penumbra c", "penumbra d", "parallel", "arc_tangent", "geometric_mean", "additive_subtractive", "equivalence", "behind", "hard overlay", "or", "and", "nor", "nand", "xnor", "implication", "not_implication", "converse", "not_converse", "tangent_normalmap", "combine_normal", "color_burn", "color_dodge", "difference", "plus", "minus", "in", "out", "src_atop", "dst_atop", "over", "darken", "divisive_modulo", "divisive_modulo_continuous", "modulo_continuous", "dissolve", "overlay", "destination_in", "destination_atop", "svg_soft_light", "pass through", "pass_through"]

def d09_blend2():
    app = Krita.instance()
    doc = app.createDocument(8, 6, "d09-blend2", "RGBA", "U8", "", 72.0)
    root = doc.rootNode()
    got = []
    for i, mode in enumerate(CANDIDATES):
        layer = doc.createNode("c%02d" % i, "paintlayer")
        layer.setBlendingMode(mode)
        got.append({"requested": mode, "got": layer.blendingMode()})
        root.addChildNode(layer, None)
    save(doc, "d09-blend2", {"blend": got})

def d10_from_png():
    app = Krita.instance()
    jobs = [("d10-rgba8", "oracle-rgba.png", "RGBA", "U8", ""),
            ("d10-gray8", "oracle-gray.png", "GRAYA", "U8", ""),
            ("d10-rgba16-srgbtrc", "oracle-rgba.png", "RGBA", "U16", "sRGB-elle-V2-srgbtrc.icc"),
            ("d10-rgba16-g10", "oracle-rgba.png", "RGBA", "U16", "sRGB-elle-V2-g10.icc"),
            ("d10-gray16", "oracle-gray.png", "GRAYA", "U16", "")]
    # 실수형(F16/F32)으로 바꿔 저장하는 작업은 Krita 5.2.2를 비정상 종료시켜 뺐다(실수형 문서는 gen_corpus.py의 d05가 직접 만든다).
    for name, png, model, depth, profile in jobs:
        try:
            doc = app.openDocument(os.path.join(INDIR, png))
            doc.setBatchmode(True)
            ok = doc.setColorSpace(model, depth, profile)
            doc.refreshProjection()
            truth = {"source": png, "model": model, "depth": depth, "profile": profile, "setColorSpace": bool(ok), "docColorModel": doc.colorModel(), "docColorDepth": doc.colorDepth(), "docProfile": doc.colorProfile()}
            save(doc, name, truth)
        except Exception:
            LOG["errors"].append({"job": name, "trace": traceback.format_exc()})

def __main__(*args):
    only = [n for n in os.environ.get("KRA_ONLY", "").split(",") if n]
    for fn in (d08_noise, d09_blend2, d10_from_png):
        if only and fn.__name__ not in only: continue
        try:
            fn()
        except Exception:
            LOG["errors"].append({"fn": fn.__name__, "trace": traceback.format_exc()})
    json.dump(LOG, open(os.path.join(OUT, "gen2-%s.log.json" % ("-".join(only) or "all")), "w"))
