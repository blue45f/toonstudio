# 5차 코퍼스: 마스크가 달린 합성 문서. 마스크의 저장 방식(.pixelselection 타일, 좌표계, 기본값)과 투명도 마스크를 적용한 결과를 관찰한다.
# 정답은 입력한 값이 아니라 Krita가 저장 직전에 읽어 준 값이다: 마스크 값은 Node.selection().pixelData, 마스크가 적용된 레이어는
# Node.projectionPixelData, 사용자가 보는 결과는 저장된 합성 이미지(mergedimage.png)다. 합성 이미지가 레이어 하나의 결과가 되도록 Background를
# 투명하게 비운다(숨기면 Krita 5.2.2가 비정상 종료한 적이 있다).
# 한 프로세스에서 여러 문서를 만들면 Krita가 비정상 종료한 적이 있어 문서마다 따로 실행한다(KRA_ONLY=문서 이름).
import base64, json, os, struct, traceback
from krita import Krita, Selection
from PyQt5.QtCore import QByteArray

OUT = os.environ["KRA_OUT"]
LOG = {"errors": []}
ALPHAS = [0, 1, 64, 127, 128, 200, 254, 255]


def b64(data):
    return base64.b64encode(bytes(data)).decode("ascii")


def build_pixels(model, depth, w, h, fn):
    """fn(x, y)가 돌려주는 정수 샘플들(RGBA는 B, G, R, A, GRAYA는 회색, 알파)을 네이티브 바이트로 이어 붙인다."""
    fmt = {"U8": "<B", "U16": "<H", "F32": "<f"}[depth]
    out = bytearray()
    for y in range(h):
        for x in range(w):
            for value in fn(x, y):
                out += struct.pack(fmt, value)
    return bytes(out)


def pixel_fn(model, depth, alpha_fn):
    scale = 1 if depth == "U8" else 257

    if depth == "F32":
        # 실수형의 네이티브 채널 순서는 R, G, B, A다.
        def fn_float(x, y):
            a = alpha_fn(x, y)
            gray = ((x * 5 + y * 3) & 255) / 255.0
            if model == "GRAYA":
                return (gray, a)
            return (((x * 3 + y * 13) & 255) / 255.0, ((x * 11 + y * 7) & 255) / 255.0, gray, a)

        return fn_float

    def fn(x, y):
        a = alpha_fn(x, y)
        if model == "GRAYA":
            return (((x * 5 + y * 3) & 255) * scale, a)
        return (((x * 5 + y * 3) & 255) * scale, ((x * 11 + y * 7) & 255) * scale, ((x * 3 + y * 13) & 255) * scale, a)

    return fn


def alpha_pattern(depth):
    scale = 1 if depth == "U8" else 257
    return lambda x, y: ALPHAS[(x * 3 + y * 5) % 8] * scale


def mask_pattern(x, y):
    # 0과 255를 포함해 값이 넓게 퍼지는 패턴.
    return (x * 7 + y * 13) & 255


def make_selection(rect, fn):
    x, y, w, h = rect
    sel = Selection()
    sel.setPixelData(QByteArray(bytes(fn(px, py) for py in range(y, y + h) for px in range(x, x + w))), x, y, w, h)
    return sel


def clear_background(doc, model, depth, w, h):
    sample = {"U8": 1, "U16": 2, "F32": 4}[depth]
    channels = 2 if model == "GRAYA" else 4
    for node in doc.rootNode().childNodes():
        if node.name() == "Background":
            node.setPixelData(QByteArray(bytes(w * h * channels * sample)), 0, 0, w, h)


def window_of(w, h, pad=64):
    return [-pad, -pad, w + 2 * pad, h + 2 * pad]


def node_truth(node, window):
    wx, wy, ww, wh = window
    info = {"name": node.name(), "type": node.type(), "visible": node.visible()}
    if node.type() in ("transparencymask", "selectionmask", "filtermask"):
        if hasattr(node, "selection"):
            sel = node.selection()
            info["selectionBounds"] = [sel.x(), sel.y(), sel.width(), sel.height()]
            info["windowB64"] = b64(sel.pixelData(wx, wy, ww, wh).data())
            info["readVia"] = "selection"
        else:
            # FilterMask에는 selection()이 없어 Node.pixelData로 읽는다.
            info["windowB64"] = b64(node.pixelData(wx, wy, ww, wh).data())
            info["readVia"] = "pixelData"
    else:
        info["pixelSize"] = len(node.pixelData(0, 0, 1, 1))
        info["ownB64"] = b64(node.pixelData(wx, wy, ww, wh).data())
        info["projectionB64"] = b64(node.projectionPixelData(wx, wy, ww, wh).data())
        bounds = node.bounds()
        info["bounds"] = [bounds.x(), bounds.y(), bounds.width(), bounds.height()]
    return info


def save(doc, name, truth):
    doc.setBatchmode(True)
    doc.refreshProjection()
    ok = doc.saveAs(os.path.join(OUT, name + ".kra"))
    truth["saved"] = bool(ok)
    json.dump(truth, open(os.path.join(OUT, name + ".truth.json"), "w"))
    doc.close()


def new_doc(name, w, h, model="RGBA", depth="U8", profile=""):
    return Krita.instance().createDocument(w, h, name, model, depth, profile, 72.0)


def add_layer(doc, parent, name, model, depth, w, h, fn, move=None):
    layer = doc.createNode(name, "paintlayer")
    layer.setPixelData(QByteArray(build_pixels(model, depth, w, h, fn)), 0, 0, w, h)
    parent.addChildNode(layer, None)
    if move is not None:
        layer.move(move[0], move[1])
    return layer


def finish(doc, name, w, h, model, depth, layers, masks, extra=None, window=None):
    window = window or window_of(w, h)
    truth = {"doc": {"name": name, "width": w, "height": h, "colorModel": model, "colorDepth": depth, "profile": doc.colorProfile()},
             "window": window, "nodes": [node_truth(n, window) for n in layers + masks]}
    if extra:
        truth["extra"] = extra
    save(doc, name, truth)


# ---------------------------------------------------------------------------
# 문서들
# ---------------------------------------------------------------------------


def d15_tm_basic():
    """투명도 마스크 하나. 마스크 사각형이 64픽셀 타일 경계를 가로지르고, 값은 0~255로 넓게 퍼진다."""
    name, w, h = "d15-tm-basic", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    tm = doc.createTransparencyMask("tm")
    tm.setSelection(make_selection((10, 20, 120, 60), mask_pattern))
    P.addChildNode(tm, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_tm_inverted():
    """선택을 뒤집은 마스크: 저장된 기본값이 255가 되는지."""
    name, w, h = "d15-tm-inverted", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    sel = make_selection((10, 20, 120, 60), mask_pattern)
    sel.invert()
    tm = doc.createTransparencyMask("tm")
    tm.setSelection(sel)
    P.addChildNode(tm, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_tm_moved():
    """부모 레이어를 옮긴 문서: 마스크 타일 좌표가 레이어 로컬인지 이미지 좌표인지."""
    name, w, h = "d15-tm-moved", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", 120, 80, pixel_fn("RGBA", "U8", alpha_pattern("U8")), move=(30, -20))
    tm = doc.createTransparencyMask("tm")
    tm.setSelection(make_selection((40, 5, 100, 50), mask_pattern))
    P.addChildNode(tm, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_tm_moved2():
    """마스크를 단 뒤에 부모 레이어를 옮긴 문서: 마스크가 레이어를 따라 움직이는지."""
    name, w, h = "d15-tm-moved2", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", 120, 80, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    tm = doc.createTransparencyMask("tm")
    tm.setSelection(make_selection((40, 5, 100, 50), mask_pattern))
    P.addChildNode(tm, None)
    P.move(30, -20)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_tm_maskmove():
    """마스크 노드 자체를 옮긴 문서: 마스크의 x, y 속성이 0이 아닐 수 있는지."""
    name, w, h = "d15-tm-maskmove", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    tm = doc.createTransparencyMask("tm")
    tm.setSelection(make_selection((10, 20, 100, 50), mask_pattern))
    P.addChildNode(tm, None)
    tm.move(10, 7)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_tm_empty():
    """선택을 주지 않은 새 투명도 마스크: 저장된 기본값과 합성 결과."""
    name, w, h = "d15-tm-empty", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    tm = doc.createTransparencyMask("tm")
    P.addChildNode(tm, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_tm_invempty():
    """아무것도 고르지 않은 선택을 뒤집은 마스크(전부 선택): 타일 없이 기본값만 255인 파일이 생기는지."""
    name, w, h = "d15-tm-invempty", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    sel = Selection()
    sel.invert()
    tm = doc.createTransparencyMask("tm")
    tm.setSelection(sel)
    P.addChildNode(tm, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_tm_noise():
    """잡음 마스크: 압축이 안 돼 LZF가 아니라 비압축(플래그 0) 타일이 저장되는지."""
    name, w, h = "d15-tm-noise", 64, 64
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", lambda x, y: 255))
    state = [12345]

    def noise(x, y):
        state[0] = (state[0] * 1103515245 + 12345) & 0x7FFFFFFF
        return (state[0] >> 16) & 255

    tm = doc.createTransparencyMask("tm")
    tm.setSelection(make_selection((0, 0, w, h), noise))
    P.addChildNode(tm, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_tm_two():
    """한 레이어에 투명도 마스크 둘(겹치는 영역)."""
    name, w, h = "d15-tm-two", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    a = doc.createTransparencyMask("tmA")
    a.setSelection(make_selection((10, 10, 100, 70), mask_pattern))
    b = doc.createTransparencyMask("tmB")
    b.setSelection(make_selection((40, 30, 110, 60), lambda x, y: (x * 5 + y * 11 + 90) & 255))
    P.addChildNode(a, None)
    P.addChildNode(b, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [a, b])


def d15_tm_hidden():
    """숨긴 투명도 마스크: 적용되지 않는지."""
    name, w, h = "d15-tm-hidden", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    tm = doc.createTransparencyMask("tm")
    tm.setSelection(make_selection((10, 20, 120, 60), mask_pattern))
    P.addChildNode(tm, None)
    tm.setVisible(False)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [tm])


def d15_sm():
    """선택 마스크: 합성에 영향이 없는지."""
    name, w, h = "d15-sm", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    sm = doc.createSelectionMask("sm")
    sm.setSelection(make_selection((10, 20, 120, 60), mask_pattern))
    P.addChildNode(sm, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [sm])


def d15_fm():
    """필터 마스크(색 반전)에 선택 값을 준 문서: 선택 값이 필터가 적용되는 정도인지."""
    name, w, h = "d15-fm", 160, 100
    doc = new_doc(name, w, h)
    P = add_layer(doc, doc.rootNode(), "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", lambda x, y: 255))
    # FilterMask에는 setSelection이 없어서 선택은 만들 때 세 번째 인자로 준다.
    fm = doc.createFilterMask("fm", Krita.instance().filter("invert"), make_selection((10, 20, 120, 60), mask_pattern))
    P.addChildNode(fm, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P], [fm])


def d15_group():
    """그룹 레이어와 그 안의 레이어에 각각 투명도 마스크."""
    name, w, h = "d15-group", 160, 100
    doc = new_doc(name, w, h)
    G = doc.createNode("G", "grouplayer")
    doc.rootNode().addChildNode(G, None)
    P = add_layer(doc, G, "P", "RGBA", "U8", w, h, pixel_fn("RGBA", "U8", alpha_pattern("U8")))
    tmP = doc.createTransparencyMask("tmP")
    tmP.setSelection(make_selection((10, 20, 120, 60), mask_pattern))
    P.addChildNode(tmP, None)
    tmG = doc.createTransparencyMask("tmG")
    tmG.setSelection(make_selection((30, 10, 100, 70), lambda x, y: (x * 9 + y * 5 + 40) & 255))
    G.addChildNode(tmG, None)
    clear_background(doc, "RGBA", "U8", w, h)
    finish(doc, name, w, h, "RGBA", "U8", [P, G], [tmP, tmG])


def grid(name, model, depth, profile, alpha16_noise):
    """256x256: 레이어 알파는 x, 마스크 값은 y여서 (알파, 마스크) 256x256 조합을 한 문서가 모두 담는다."""
    w = h = 256
    doc = new_doc(name, w, h, model, depth, profile)
    if depth == "U8":
        alpha_fn = lambda x, y: x
    elif depth == "F32":
        # 16비트 격자와 같은 정수 값을 [0, 1]로 옮긴 알파(하위 바이트가 행마다 달라 8비트로 정확히 떨어지지 않는다).
        alpha_fn = lambda x, y: ((x << 8) | ((x * 131 + y * 37) & 255)) / 65535.0
    elif alpha16_noise:
        # 16비트 알파의 하위 바이트가 행마다 달라 8비트로 정확히 떨어지지 않는 값이 많다.
        alpha_fn = lambda x, y: (x << 8) | ((x * 131 + y * 37) & 255)
    else:
        alpha_fn = lambda x, y: x * 257
    P = add_layer(doc, doc.rootNode(), "P", model, depth, w, h, pixel_fn(model, depth, alpha_fn))
    tm = doc.createTransparencyMask("tm")
    tm.setSelection(make_selection((0, 0, w, h), lambda x, y: y))
    P.addChildNode(tm, None)
    clear_background(doc, model, depth, w, h)
    finish(doc, name, w, h, model, depth, [P], [tm], window=[0, 0, w, h])


def d15_grid8():
    grid("d15-grid8", "RGBA", "U8", "", False)


def d15_grid_gray8():
    grid("d15-grid-gray8", "GRAYA", "U8", "", False)


def d15_grid16():
    grid("d15-grid16", "RGBA", "U16", "sRGB-elle-V2-srgbtrc.icc", True)


def d15_grid_f32():
    grid("d15-grid-f32", "RGBA", "F32", "sRGB-elle-V2-g10.icc", True)


DOCS = {
    "d15-tm-basic": d15_tm_basic,
    "d15-tm-inverted": d15_tm_inverted,
    "d15-tm-moved": d15_tm_moved,
    "d15-tm-moved2": d15_tm_moved2,
    "d15-tm-maskmove": d15_tm_maskmove,
    "d15-tm-empty": d15_tm_empty,
    "d15-tm-noise": d15_tm_noise,
    "d15-tm-invempty": d15_tm_invempty,
    "d15-tm-two": d15_tm_two,
    "d15-tm-hidden": d15_tm_hidden,
    "d15-sm": d15_sm,
    "d15-fm": d15_fm,
    "d15-group": d15_group,
    "d15-grid8": d15_grid8,
    "d15-grid-gray8": d15_grid_gray8,
    "d15-grid16": d15_grid16,
    "d15-grid-f32": d15_grid_f32,
}


def __main__(*args):
    only = os.environ.get("KRA_ONLY")
    for name, fn in DOCS.items():
        if only and name != only:
            continue
        try:
            fn()
        except Exception:
            LOG["errors"].append({"doc": name, "trace": traceback.format_exc()})
    json.dump(LOG, open(os.path.join(OUT, "gen5-%s.log.json" % (os.environ.get("KRA_ONLY") or "all")), "w"))
