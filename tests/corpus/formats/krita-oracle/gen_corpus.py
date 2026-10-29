# Krita 5.2.2를 블랙박스로 돌려 "정답을 아는" .kra 코퍼스를 만든다(kritarunner용 스크립트, Krita 소스는 읽지 않았다).
# 각 문서마다 .truth.json을 함께 쓴다. 정답 픽셀은 내가 넣은 값이 아니라 Krita가 저장 직전에 읽어 준 값(Node.pixelData)이다.
import base64, json, math, os, struct, sys, traceback
from krita import Krita, InfoObject
from PyQt5.QtCore import QByteArray

OUT = os.environ["KRA_OUT"]
LOG = {"errors": [], "docs": []}
ALPHAS = [0, 1, 64, 127, 128, 200, 254, 255]


def b64(data):
    return base64.b64encode(bytes(data)).decode("ascii")


def pattern_bytes(width, height, pixel_size, seed, kind="int"):
    """픽셀마다 값이 달라 채널·행·열 순서를 가리는 패턴. 정수 샘플은 아무 바이트나 유효하다."""
    out = bytearray()
    for y in range(height):
        for x in range(width):
            for c in range(pixel_size):
                out.append((x * (37 + 2 * c) + y * (11 + 3 * c) + seed * 17 + c * 53) & 0xFF)
            if kind == "alpha_last8" and pixel_size >= 1:
                out[-1] = ALPHAS[(x * 3 + y * 5 + seed) % 8]
    return bytes(out)


def float_pattern(width, height, channels, seed, half):
    out = bytearray()
    fmt = "<e" if half else "<f"
    for y in range(height):
        for x in range(width):
            for c in range(channels):
                v = ((x * (7 + c) + y * (3 + 2 * c) + seed * 5) % 17) / 16.0
                out += struct.pack(fmt, v)
    return bytes(out)


def node_info(node, doc_w, doc_h, with_pixels):
    info = {
        "name": node.name(),
        "type": node.type(),
        "opacity": node.opacity(),
        "visible": node.visible(),
        "locked": node.locked(),
        "collapsed": node.collapsed(),
        "colorLabel": node.colorLabel(),
        "blendingMode": node.blendingMode(),
        "colorModel": node.colorModel(),
        "colorDepth": node.colorDepth(),
        "inheritAlpha": node.inheritAlpha(),
        "alphaLocked": node.alphaLocked(),
        "uuid": node.uniqueId().toString() if hasattr(node, "uniqueId") else None,
    }
    b = node.bounds()
    info["bounds"] = [b.x(), b.y(), b.width(), b.height()]
    if with_pixels and node.type() == "paintlayer":
        # 캔버스 둘레 64픽셀을 더한 창을 읽는다(캔버스 밖 픽셀과 음수 좌표 타일을 같이 검증).
        wx, wy, ww, wh = -64, -64, doc_w + 128, doc_h + 128
        info["window"] = [wx, wy, ww, wh]
        info["windowPixelsB64"] = b64(node.pixelData(wx, wy, ww, wh))
        px1 = node.pixelData(0, 0, 1, 1)
        info["pixelSize"] = len(px1)
    kids = []
    for child in node.childNodes():
        kids.append(node_info(child, doc_w, doc_h, with_pixels))
    info["children"] = kids
    return info


def finish(doc, name, extra=None, ext="kra"):
    doc.setBatchmode(True)
    doc.refreshProjection()
    path = os.path.join(OUT, "%s.%s" % (name, ext))
    root = doc.rootNode()
    truth = {
        "file": os.path.basename(path),
        "doc": {
            "name": doc.name(),
            "width": doc.width(),
            "height": doc.height(),
            "colorModel": doc.colorModel(),
            "colorDepth": doc.colorDepth(),
            "colorProfile": doc.colorProfile(),
            "xRes": doc.xRes(),
            "yRes": doc.yRes(),
        },
        "tree": [node_info(c, doc.width(), doc.height(), True) for c in root.childNodes()],
    }
    if extra:
        truth["extra"] = extra
    ok = doc.saveAs(path)
    truth["saved"] = bool(ok)
    with open(os.path.join(OUT, "%s.truth.json" % name), "w") as fh:
        json.dump(truth, fh)
    LOG["docs"].append({"name": name, "saved": bool(ok)})
    doc.close()


def new_doc(name, w, h, model="RGBA", depth="U8"):
    app = Krita.instance()
    return app.createDocument(w, h, name, model, depth, "", 72.0)


def add_paint(doc, parent, name, rect, seed, opacity=None, blend=None, visible=None, locked=None, label=None, move=None, kind="alpha_last8"):
    layer = doc.createNode(name, "paintlayer")
    if rect is not None:
        x, y, w, h = rect
        ps = len(layer.pixelData(0, 0, 1, 1)) or 4
        layer.setPixelData(QByteArray(pattern_bytes(w, h, ps, seed, kind)), x, y, w, h)
    if opacity is not None:
        layer.setOpacity(opacity)
    if blend is not None:
        layer.setBlendingMode(blend)
    if visible is not None:
        layer.setVisible(visible)
    if locked is not None:
        layer.setLocked(locked)
    if label is not None:
        layer.setColorLabel(label)
    if move is not None:
        layer.move(move[0], move[1])
    parent.addChildNode(layer, None)
    return layer


def guarded(fn):
    def wrapper(*a, **k):
        try:
            return fn(*a, **k)
        except Exception:
            LOG["errors"].append({"fn": fn.__name__, "trace": traceback.format_exc()})
    wrapper.__name__ = fn.__name__
    return wrapper


@guarded
def d01_basic():
    doc = new_doc("d01-basic", 100, 70)
    root = doc.rootNode()
    add_paint(doc, root, "Base", (0, 0, 100, 70), 1)
    add_paint(doc, root, "Paint", (10, 5, 30, 20), 2)
    add_paint(doc, root, "Hidden", (20, 20, 10, 10), 3, visible=False)
    add_paint(doc, root, "Mult", (5, 30, 40, 30), 4, opacity=128, blend="multiply")
    add_paint(doc, root, "Locked", (50, 10, 20, 20), 5, locked=True)
    add_paint(doc, root, "Label", (60, 40, 20, 20), 6, label=4)
    add_paint(doc, root, "Empty", None, 0)
    add_paint(doc, root, "레이어 ✓ \"q\" <t> & a'b", (1, 1, 6, 4), 7)
    finish(doc, "d01-basic")


@guarded
def d02_tiles():
    doc = new_doc("d02-tiles", 200, 150)
    root = doc.rootNode()
    layer = doc.createNode("Sparse", "paintlayer")
    ps = len(layer.pixelData(0, 0, 1, 1)) or 4
    for (x, y, w, h, seed) in [(0, 0, 10, 10, 1), (63, 63, 3, 3, 2), (130, 100, 20, 20, 3), (-20, -10, 30, 20, 4), (150, 0, 50, 150, 5), (60, 125, 5, 40, 6)]:
        layer.setPixelData(QByteArray(pattern_bytes(w, h, ps, seed, "alpha_last8")), x, y, w, h)
    root.addChildNode(layer, None)
    add_paint(doc, root, "Moved", (0, 0, 40, 30), 9, move=(37, 19))
    finish(doc, "d02-tiles")


@guarded
def d03_groups():
    doc = new_doc("d03-groups", 64, 48)
    root = doc.rootNode()
    add_paint(doc, root, "Bottom", (0, 0, 64, 48), 1)
    ga = doc.createNode("Group A", "grouplayer")
    root.addChildNode(ga, None)
    add_paint(doc, ga, "A1", (2, 2, 20, 20), 2)
    gb = doc.createNode("Group B", "grouplayer")
    ga.addChildNode(gb, None)
    add_paint(doc, gb, "B1", (10, 10, 20, 20), 3, opacity=90)
    add_paint(doc, gb, "B2", (12, 12, 20, 20), 4, blend="screen")
    add_paint(doc, ga, "A2", (30, 5, 20, 20), 5)
    ga.setOpacity(200)
    gb.setVisible(False)
    gc = doc.createNode("Group C (collapsed)", "grouplayer")
    root.addChildNode(gc, None)
    add_paint(doc, gc, "C1", (0, 30, 20, 15), 6)
    gc.setCollapsed(True)
    gc.setBlendingMode("multiply")
    try:
        gc.setPassThroughMode(True)
    except Exception:
        LOG["errors"].append({"fn": "setPassThroughMode", "trace": traceback.format_exc()})
    add_paint(doc, root, "Top", (40, 30, 20, 15), 7)
    finish(doc, "d03-groups")


@guarded
def d04_blendmodes():
    modes = ["normal", "add", "burn", "color", "color_burn", "color_dodge", "darken", "dodge", "difference", "erase", "exclusion", "hard_light", "hard_mix", "hue", "lighten", "linear_burn", "linear_dodge", "linear_light", "luminosity", "multiply", "overlay", "pin_light", "saturation", "screen", "soft_light", "soft_light_svg", "vivid_light", "divide", "subtract", "greater", "alphadarken", "bumpmap", "copy", "copy_red", "copy_green", "copy_blue", "dissolve", "darker color", "lighter color", "grain_extract", "grain_merge", "diff", "xor", "inverse_subtract", "modulo", "negation", "not a mode"]
    doc = new_doc("d04-blendmodes", 16, 12)
    root = doc.rootNode()
    requested = []
    for i, mode in enumerate(modes):
        layer = add_paint(doc, root, "m%02d" % i, (0, 0, 4, 3), i + 1, blend=mode)
        requested.append({"layer": "m%02d" % i, "requested": mode, "got": layer.blendingMode()})
    finish(doc, "d04-blendmodes", extra={"blend": requested})


@guarded
def d05_colorspaces():
    combos = [("RGBA", "U8"), ("RGBA", "U16"), ("RGBA", "F16"), ("RGBA", "F32"), ("GRAYA", "U8"), ("GRAYA", "U16"), ("GRAYA", "F16"), ("GRAYA", "F32"), ("CMYKA", "U8"), ("CMYKA", "U16"), ("LABA", "U16"), ("XYZA", "U16"), ("XYZA", "F32"), ("YCbCrA", "U8"), ("YCbCrA", "U16")]
    for model, depth in combos:
        name = "d05-%s-%s" % (model, depth)
        try:
            doc = new_doc(name, 40, 30, model, depth)
            root = doc.rootNode()
            layer = doc.createNode("L", "paintlayer")
            px = layer.pixelData(0, 0, 1, 1)
            ps = len(px)
            if depth == "F16" or depth == "F32":
                channels = ps // (2 if depth == "F16" else 4)
                data = float_pattern(37, 21, channels, 3, depth == "F16")
            else:
                data = pattern_bytes(37, 21, ps, 3, "int")
            layer.setPixelData(QByteArray(data), 3, 4, 37, 21)
            root.addChildNode(layer, None)
            finish(doc, name, extra={"pixelSize": ps})
        except Exception:
            LOG["errors"].append({"fn": "d05 " + name, "trace": traceback.format_exc()})


def _d06(kind):
    from krita import Selection
    app = Krita.instance()
    doc = new_doc("d06-" + kind, 48, 36)
    root = doc.rootNode()
    base = add_paint(doc, root, "Base", (0, 0, 48, 36), 1)
    sel = Selection()
    sel.select(4, 4, 20, 16, 255)
    created = None
    if kind == "transparencymask":
        node = doc.createTransparencyMask("tm")
        node.setSelection(sel)
        base.addChildNode(node, None)
    elif kind == "selectionmask":
        node = doc.createSelectionMask("sm")
        node.setSelection(sel)
        base.addChildNode(node, None)
    elif kind == "filtermask":
        node = doc.createFilterMask("fm", app.filter("invert"), base)
        base.addChildNode(node, None)
    elif kind == "colorizemask":
        node = doc.createColorizeMask("cm")
        base.addChildNode(node, None)
    elif kind == "transformmask":
        node = doc.createTransformMask("xm")
        base.addChildNode(node, None)
    elif kind == "vectorlayer":
        node = doc.createVectorLayer("vector")
        root.addChildNode(node, None)
    elif kind == "clonelayer":
        node = doc.createCloneLayer("clone-of-base", base)
        root.addChildNode(node, None)
    elif kind == "filterlayer":
        node = doc.createFilterLayer("filter-invert", app.filter("invert"), sel)
        root.addChildNode(node, None)
    elif kind == "filllayer":
        from krita import InfoObject
        cfg = InfoObject()
        node = doc.createFillLayer("fill", "pattern", cfg, sel)
        root.addChildNode(node, None)
    elif kind == "filelayer":
        node = doc.createFileLayer("file", os.path.join(os.environ["KRA_IN"], "probe.png"), "None")
        root.addChildNode(node, None)
    created = kind
    finish(doc, "d06-" + kind, extra={"created": created})


def d06_transparencymask(): _d06("transparencymask")
def d06_filtermask(): _d06("filtermask")
def d06_selectionmask(): _d06("selectionmask")
def d06_colorizemask(): _d06("colorizemask")
def d06_transformmask(): _d06("transformmask")
def d06_vectorlayer(): _d06("vectorlayer")
def d06_clonelayer(): _d06("clonelayer")
def d06_filterlayer(): _d06("filterlayer")
def d06_filllayer(): _d06("filllayer")
def d06_filelayer(): _d06("filelayer")


@guarded
def d07_krz_and_misc():
    doc = new_doc("d07-krz", 20, 10)
    root = doc.rootNode()
    add_paint(doc, root, "Only", (0, 0, 20, 10), 11)
    finish(doc, "d07-krz", ext="krz")


ALL = [d01_basic, d02_tiles, d03_groups, d04_blendmodes, d05_colorspaces, d06_transparencymask, d06_filtermask, d06_selectionmask, d06_colorizemask, d06_transformmask, d06_vectorlayer, d06_clonelayer, d06_filterlayer, d06_filllayer, d06_filelayer, d07_krz_and_misc]


def __main__(*args):
    os.makedirs(OUT, exist_ok=True)
    only = [n for n in os.environ.get("KRA_ONLY", "").split(",") if n]
    LOG["version"] = Krita.instance().version()
    for fn in ALL:
        if only and fn.__name__ not in only:
            continue
        guarded(fn)()
    with open(os.path.join(OUT, "gen-%s.log.json" % ("-".join(only) or "all")), "w") as fh:
        json.dump(LOG, fh)
