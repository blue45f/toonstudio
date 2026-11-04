"""전체 production dist를 바꾸지 않고 제한된 비 Studio QA 사본을 만든다."""
from pathlib import Path
import json
import re
import tarfile


MAX_PREVIEW_BYTES = 250_000_000
ALLOWED_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".webmanifest", ".txt"}
# 현재 Vite의 8자리 해시 출력 중 Studio 전용 CV/BIM CV·BIM·물리 엔진만 제외한다.
# 비슷한 이름의 공개 페이지 코드와 전체 dist는 그대로 보존한다.
STUDIO_RUNTIME_CHUNK = re.compile(r"^(?:opencv|web-ifc-api|studio-bg3d-physics\.worker)-[A-Za-z0-9_-]{8}\.js$")


def select_preview_files(root: Path) -> set[Path]:
    files = {path for path in root.iterdir() if path.is_file() and path.suffix in ALLOWED_SUFFIXES}
    assets = root / "assets"
    if assets.is_dir():
        files.update(path for path in assets.iterdir()
                     if path.is_file() and path.suffix in ALLOWED_SUFFIXES
                     and not STUDIO_RUNTIME_CHUNK.fullmatch(path.name))
    for directory in ("brand", "fonts", "icons", "i18n", "locales"):
        path = root / directory
        if path.is_dir():
            files.update(item for item in path.rglob("*")
                         if item.is_file() and item.suffix in ALLOWED_SUFFIXES and item.stat().st_size < 8_000_000
                         and not (directory == "i18n" and item.relative_to(path).parts[0] == "studio"))
    for directory in ("data", "catalog"):
        path = root / directory
        if path.is_dir():
            files.update(item for item in path.rglob("*.json") if item.stat().st_size < 8_000_000)
    return files


def package_preview(root: Path, output: Path) -> dict:
    files = select_preview_files(root)
    total = sum(path.stat().st_size for path in files)
    result = {"files": len(files), "uncompressedBytes": total,
              "scope": "offline non-Studio QA subset; full dist is used for CI browser tests"}
    print(json.dumps(result))
    if total > MAX_PREVIEW_BYTES:
        raise SystemExit("QA preview exceeds 250 MB; inspect selection rather than upload an unbounded asset library")
    with tarfile.open(output, "w:gz") as archive:
        for path in sorted(files):
            archive.add(path, arcname=str(Path("dist") / path.relative_to(root)), recursive=False)
    return result


if __name__ == "__main__":
    package_preview(Path(__file__).resolve().parents[1] / "dist", Path("/tmp/non-studio-web-preview.tar.gz"))
