"""전체 production dist를 바꾸지 않고 제한된 비 Studio QA 사본을 만든다."""
from pathlib import Path
import json
import re
import tarfile


MAX_PREVIEW_BYTES = 250_000_000
ALLOWED_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".webmanifest", ".txt"}
# 현재 Vite의 8자리 해시 출력 중 Studio 전용 엔진만 제외한다.
# 오프라인 분기 worker는 creator/offline-branch에서만 생성하며 공개 페이지의 QA 사본에는 필요하지 않다.
# Babylon은 bundle 소유권 검사로 단일 BG3D specialist 뒤에 격리된 엔진이다.
# Spark는 3D 스플랫 참고 패널이, Phaser는 Studio 가상 공간 캔버스가 각각 동적으로 불러온다.
# 비슷한 이름의 공개 페이지 코드와 전체 dist는 그대로 보존한다.
STUDIO_RUNTIME_CHUNK = re.compile(
    r"^(?:opencv|web-ifc-api|studio-bg3d-babylon-runtime|studio-bg3d-physics\.worker|"
    r"studio-offline-branch\.worker|spark\.module|phaser\.esm)-[A-Za-z0-9_-]{8}\.js$"
)
# /create에서 열 수 있는 고급 PPT 두 탭만 비 Studio QA 사본의 범위에서 제외한다.
# 기존 PPT 부모·다른 탭·공개 코드는 유지하며, 전체 dist와 실제 브라우저 검사는 바꾸지 않는다.
# 두 hub는 StudioPptProDrawingPanel, 여덟 leaf는 각 hub의 선택 탭에서만 지연 로딩된다.
STUDIO_PPT_ADVANCED_CHUNK = re.compile(
    r"^(?:AutoQaCollabHubPanel|Csp3dUpgradeHubPanel|"
    r"AutoQaPixelScannerPanel|AutoQaLayoutSpecPanel|AutoQaContinuityPanel|CollabSignoffHubPanel|"
    r"PuppetWarpStudioPanel|Model3dSurfacePaintPanel|Model3dHandCustomizerPanel|CspWatermarkVelocityPanel)"
    r"-[A-Za-z0-9_-]{8}\.js$"
)


def select_preview_files(root: Path) -> set[Path]:
    files = {path for path in root.iterdir() if path.is_file() and path.suffix in ALLOWED_SUFFIXES}
    # 공개 페이지도 index.html의 스크립트 태그로 이 파일을 요청한다.
    bootstrap = root / "offline-draw" / "bootstrap.js"
    if bootstrap.is_file():
        files.add(bootstrap)
    assets = root / "assets"
    if assets.is_dir():
        files.update(path for path in assets.iterdir()
                     if path.is_file() and path.suffix in ALLOWED_SUFFIXES
                     and not STUDIO_RUNTIME_CHUNK.fullmatch(path.name)
                     and not STUDIO_PPT_ADVANCED_CHUNK.fullmatch(path.name))
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
