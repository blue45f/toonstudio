import os, json
from krita import Krita
from PyQt5.QtCore import QByteArray
OUT = os.environ["KRA_OUT"]
def __main__(*args):
    app = Krita.instance()
    out = []
    for i, name in enumerate(["웹툰 1화 ✓ a/b c", "a..b", "../evil", "tab\tname", "quote\"amp&lt;", " lead and trail ", "x" * 300]):
        doc = app.createDocument(8, 6, name, "RGBA", "U8", "", 72.0)
        layer = doc.createNode("L \"x\" & 한글 /슬래시", "paintlayer")
        layer.setPixelData(QByteArray(bytes([1, 2, 3, 255] * 4)), 0, 0, 2, 2)
        doc.rootNode().addChildNode(layer, None)
        doc.setBatchmode(True)
        ok = doc.saveAs(os.path.join(OUT, "n%02d.kra" % i))
        out.append({"i": i, "name": name, "docName": doc.name(), "saved": bool(ok)})
        doc.close()
    json.dump(out, open(os.path.join(OUT, "names.log.json"), "w"), ensure_ascii=False)
