# 저장한 .kra를 Krita로 다시 열어, 파일을 읽은 뒤 Krita가 보여 주는 값을 덤프한다(kritarunner용 스크립트, Krita 소스는 읽지 않았다).
# gen_corpus5.py의 정답은 저장 직전의 편집 세션 값이다. 마스크를 옮기는 것처럼 편집 세션의 투영이 저장된 파일의 의미와 다를 수 있는 경우를
# 위해, 사용자가 파일을 열면 보는 결과(재오픈 뒤의 투영과 마스크 값)를 한 번 더 정답으로 삼는다.
# KRA_REOPEN=문서 이름, KRA_OUT=문서와 *.truth.json이 있는 폴더. 결과는 <이름>.reopen.json이다.
import base64, json, os, traceback
from krita import Krita

OUT = os.environ["KRA_OUT"]
LOG = {"errors": []}


def b64(data):
    return base64.b64encode(bytes(data)).decode("ascii")


def walk(node, window, out):
    wx, wy, ww, wh = window
    info = {"name": node.name(), "type": node.type(), "visible": node.visible()}
    if node.type() in ("transparencymask", "selectionmask", "filtermask"):
        if hasattr(node, "selection"):
            sel = node.selection()
            info["selectionBounds"] = [sel.x(), sel.y(), sel.width(), sel.height()]
            info["windowB64"] = b64(sel.pixelData(wx, wy, ww, wh).data())
        else:
            info["windowB64"] = b64(node.pixelData(wx, wy, ww, wh).data())
    elif node.type() == "paintlayer":
        info["pixelSize"] = len(node.pixelData(0, 0, 1, 1))
        info["ownB64"] = b64(node.pixelData(wx, wy, ww, wh).data())
        info["projectionB64"] = b64(node.projectionPixelData(wx, wy, ww, wh).data())
        bounds = node.bounds()
        info["bounds"] = [bounds.x(), bounds.y(), bounds.width(), bounds.height()]
    elif node.type() == "grouplayer":
        info["projectionB64"] = b64(node.projectionPixelData(wx, wy, ww, wh).data())
    out.append(info)
    for child in node.childNodes():
        walk(child, window, out)


def __main__(*args):
    name = os.environ["KRA_REOPEN"]
    try:
        truth = json.load(open(os.path.join(OUT, name + ".truth.json")))
        window = truth["window"]
        app = Krita.instance()
        doc = app.openDocument(os.path.join(OUT, name + ".kra"))
        doc.setBatchmode(True)
        doc.refreshProjection()
        nodes = []
        for child in doc.rootNode().childNodes():
            walk(child, window, nodes)
        json.dump({"doc": {"name": doc.name(), "width": doc.width(), "height": doc.height()}, "window": window, "nodes": nodes},
                  open(os.path.join(OUT, name + ".reopen.json"), "w"))
        doc.close()
    except Exception:
        LOG["errors"].append({"trace": traceback.format_exc()})
    json.dump(LOG, open(os.path.join(OUT, "reopen-%s.log.json" % name), "w"))
