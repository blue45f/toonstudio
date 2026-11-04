"""운영 dist를 보존하면서 크기가 제한된 비스튜디오 오프라인 QA 묶음을 만든다."""
from pathlib import Path
import json
import re
import tarfile

ALLOWED = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".webmanifest", ".txt"}
# 비스튜디오 화면에서 실행하지 않는 편집기 전용 엔진이다. 실제 CI 브라우저는 전체 dist를 사용한다.
STUDIO_ENGINES = re.compile(r"(?:opencv|studio-bg3d-physics\.worker)-[A-Za-z0-9_-]+\.js\Z")
MAX_PREVIEW_BYTES = 250_000_000


def select_preview_files(root: Path) -> set[Path]:
    files = {path for path in root.iterdir() if path.is_file() and path.suffix in ALLOWED}
    assets = root / "assets"
    if assets.is_dir():
        files.update(path for path in assets.iterdir() if path.is_file() and path.suffix in ALLOWED and not STUDIO_ENGINES.fullmatch(path.name))
    for directory in ("brand", "fonts", "icons", "i18n", "locales"):
        path = root / directory
        if path.is_dir():
            files.update(
                item for item in path.rglob("*")
                if item.is_file() and item.suffix in ALLOWED and item.stat().st_size < 8_000_000
                # Studio 전용 번역은 기존처럼 제외하고 공개 화면의 번역은 보존한다.
                and not (directory == "i18n" and item.relative_to(path).parts[0] == "studio")
            )
    for directory in ("data", "catalog"):
        path = root / directory
        if path.is_dir():
            files.update(item for item in path.rglob("*.json") if item.stat().st_size < 8_000_000)
    return files


def package_preview(root: Path, output: Path) -> dict:
    files = select_preview_files(root)
    total = sum(path.stat().st_size for path in files)
    report = {"files": len(files), "uncompressedBytes": total, "scope": "offline non-Studio QA subset; full dist is used for CI browser tests"}
    print(json.dumps(report))
    if total > MAX_PREVIEW_BYTES:
        raise SystemExit("QA preview exceeds 250 MB; inspect selection rather than upload an unbounded asset library")
    with tarfile.open(output, "w:gz") as archive:
        for path in sorted(files):
            archive.add(path, arcname=str(Path("dist") / path.relative_to(root)), recursive=False)
    return report


if __name__ == "__main__":
    package_preview(Path("dist"), Path("/tmp/non-studio-web-preview.tar.gz"))
