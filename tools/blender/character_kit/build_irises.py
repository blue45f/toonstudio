"""홍채 파츠 `irises/round-large` 빌드 CLI — `parts/<base>/irises/round-large.glb`(기본 여성).

실행(저장소 루트, 베이스와 같은 venv의 파이썬)::

    <venv>/bin/python -I tools/blender/character_kit/build_irises.py \\
        --npz ~/.cache/toonstudio-kit/hbm-npz/hbm_female.npz \\
        --contract ~/.cache/toonstudio-kit/out/contract.json \\
        --kit-dir ~/.cache/toonstudio-kit/out/kit/toonstudio-kit-v1 \\
        [--base female|male] [--style none|webtoon-girl|webtoon-boy]

`--style`을 주면 베이스와 같은 웹툰풍 변형 필드를 홍채 덮개에도 적용하고 덮개 반지름을 스타일 값으로 키운다(`webtoon_style`).

내용(전부 이 저장소가 절차 생성한 원본, license: original)
- `TS_Iris_L/R`(역할 `iris`, 재질 `ts_iris`, recolor): 각막 위 0.3 mm에 얹는 반지름 6 mm 홍채 덮개. 텍스처는 256² JPEG이고 평균 휘도 ≥ 0.55(계약,
  곱셈 틴트에 안전한 밝기)이며 동공은 텍스처에 구워져 있다.
- `TS_Highlight_L/R`(역할 `eye-highlight`, 재질 `ts_highlight`, fixed 흰색): 홍채 위 좌상단의 반지름 1.2 mm 캐치라이트 원판(곱셈 틴트로는 낼 수 없어 별도 메시, 명세 A-1).
- 모든 정점은 해당 눈 본(`TS_Eye.L/R`) 100 % 스킨이고, 스켈레톤은 베이스와 같은 68 joint다.
- morph는 계약 커버리지 16개(체형 6 + 눈 크기·간격·기울기 + 얼굴형 등)를 눈 메시와 같은 필드·같은 스코프로 계산한다(`base_assembly.eye_deltas`).
  눈 위치에서 필드가 0인 `faceShape`은 베이스와 같이 0.03 mm 바닥 델타로 V9 비영 규칙을 채운다(보고에 남는다).
- 파일은 0.1 MiB 안팎이다(명세 4.7: 홍채는 ≤ 0.1 MiB 목표, 한도 1.5 MiB).
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from character_kit import base_assembly as ba  # noqa: E402
from character_kit import base_textures as bt  # noqa: E402
from character_kit import eyes_mouth as em  # noqa: E402
from character_kit import webtoon_style as ws  # noqa: E402

CACHE = Path.home() / ".cache" / "toonstudio-kit"


def part_relative_path(base: str) -> Path:
    return Path("parts") / base / "irises" / "round-large.glb"


#: 홍채 덮개 분할(링 5 × 둘레 24 = 정점 121, 삼각형 240)과 텍스처 크기. 12 mm 지름이라 이 정도면 윤곽(현 오차 0.05 mm)·밝기가 충분하고,
#: morph 16개가 조밀 accessor로 들어가므로 정점 수가 파일 크기를 정한다(링 8 × 32는 167 KiB였다).
IRIS_RINGS = 5
IRIS_SEGMENTS = 24
IRIS_TEXTURE_SIZE = 256


def iris_materials() -> dict[str, ba.MaterialSpec]:
    """홍채(recolor, 휘도 ≥ 0.55)와 캐치라이트(fixed 흰색) 재질."""
    jpeg = "image/jpeg"
    return {
        "ts_iris": ba.MaterialSpec("ts_iris", "iris", bt.encode_jpeg(bt.iris_texture(IRIS_TEXTURE_SIZE), 92, 0), jpeg),
        "ts_highlight": ba.MaterialSpec("ts_highlight", "eye-highlight", bt.encode_jpeg(bt.highlight_texture(16), 92, 0), jpeg),
    }


def build_iris_nodes(ctx: ba.Context, style: ws.LookStyle = ws.NONE) -> tuple[list[ba.MeshNode], list[str]]:
    """`TS_Iris_L/R`와 `TS_Highlight_L/R` 메시 노드(morph 포함)와 바닥 델타를 더한 곳의 목록. `style`을 주면 같은 변형 필드를 위치에 적용한다."""
    applied: list[str] = []
    iris_names = ba.coverage_names(ctx, "iris")
    highlight_names = ba.coverage_names(ctx, "eye-highlight")
    nodes: list[ba.MeshNode] = []
    for side in "LR":
        eye = em.eye_geometry(ctx, side)
        iris = em.iris_cap(eye, radius_m=style.iris_radius_m, rings=IRIS_RINGS, segments=IRIS_SEGMENTS)
        iris.morphs = ba.cast_f32(ba.eye_deltas(ctx, iris.positions, side, iris_names, applied, f"TS_Iris_{side}"), ctx.contract)
        nodes.append(ba.MeshNode(f"TS_Iris_{side}", ["iris"], [iris]))
    for side in "LR":
        eye = em.eye_geometry(ctx, side)
        highlight = em.highlight_disc(eye)
        highlight.morphs = ba.cast_f32(ba.eye_deltas(ctx, highlight.positions, side, highlight_names, applied, f"TS_Highlight_{side}"), ctx.contract)
        nodes.append(ba.MeshNode(f"TS_Highlight_{side}", ["eye-highlight"], [highlight]))
    ws.style_iris_nodes(ctx, nodes, style)
    return nodes, applied


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", choices=("female", "male"), default="female")
    parser.add_argument("--style", choices=sorted(ws.STYLES), default="none")
    parser.add_argument("--style-override", default=None, help="`--style`의 LookStyle 필드를 덮어쓰는 JSON(예: '{\"head_scale\": 0.86}'). 값을 렌더로 맞출 때 쓴다")
    parser.add_argument("--npz", type=Path, default=None, help="HBM npz(기본: ~/.cache/toonstudio-kit/hbm-npz/hbm_<base>.npz)")
    parser.add_argument("--contract", type=Path, default=CACHE / "out" / "contract.json")
    parser.add_argument("--kit-dir", type=Path, default=CACHE / "out" / "kit" / "toonstudio-kit-v1")
    args = parser.parse_args(argv)

    look = ws.resolve_style(args.style, args.style_override)
    if args.npz is None:
        args.npz = CACHE / "hbm-npz" / f"hbm_{look.source_hbm or args.base}.npz"
    started = time.time()
    print("컨텍스트(리그·눈 기하) 준비")
    ctx = ba.load_context(args.npz, args.contract, base_id=args.base, style=look)
    nodes, applied = build_iris_nodes(ctx, look)
    ba.unshift_nodes(ctx, nodes)
    path = args.kit_dir / part_relative_path(args.base)
    path.parent.mkdir(parents=True, exist_ok=True)
    size = ba.write_base_glb(nodes, iris_materials(), ctx, path)
    triangles = {node.name: int(sum(len(prim.triangles) for prim in node.prims)) for node in nodes}
    print(f"GLB: {path} ({size / 1024:.1f} KiB), 삼각형 {triangles}")
    print(f"0.03 mm 바닥 델타를 더한 morph: {', '.join(applied) or '없음'}")
    print(f"완료 {time.time() - started:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
