"""홍채 파츠(`irises/<프리셋>`, 어휘 5종) 빌드 CLI — `parts/<base>/irises/<프리셋>.glb`(기본 여성).

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


#: 홍채 프리셋(어휘 5종): 덮개 반지름 배율, 텍스처 변형, 캐치라이트 목록(홍채 반지름 대비 (x, y) 위치, 반지름 비율, 모양).
#: 웹툰·애니 눈은 큰 동공 + 위가 어두운 그라데이션 + 큰 좌상단 캐치라이트와 작은 우하단 캐치라이트가 기본이다.
IRIS_PRESETS: dict[str, dict] = {
    "round-large": {"radius_scale": 1.0, "texture": "anime", "highlights": [((-0.30, 0.34), 0.20, "disc"), ((0.34, -0.34), 0.085, "disc")]},
    "round-small": {"radius_scale": 0.72, "texture": "anime", "highlights": [((-0.30, 0.34), 0.22, "disc"), ((0.34, -0.30), 0.09, "disc")]},
    "cat": {"radius_scale": 1.0, "texture": "cat", "highlights": [((-0.28, 0.32), 0.17, "disc")]},
    "star-highlight": {"radius_scale": 1.0, "texture": "anime", "highlights": [((-0.26, 0.30), 0.30, "star"), ((0.34, -0.34), 0.08, "disc")]},
    "soft-gradient": {"radius_scale": 1.0, "texture": "soft", "highlights": [((-0.30, 0.34), 0.16, "disc")]},
}


def part_relative_path(base: str, preset: str = "round-large") -> Path:
    return Path("parts") / base / "irises" / f"{preset}.glb"


#: 홍채 덮개 분할(링 5 × 둘레 24 = 정점 121, 삼각형 240)과 텍스처 크기. 12 mm 지름이라 이 정도면 윤곽(현 오차 0.05 mm)·밝기가 충분하고,
#: morph 16개가 조밀 accessor로 들어가므로 정점 수가 파일 크기를 정한다(링 8 × 32는 167 KiB였다).
IRIS_RINGS = 5
IRIS_SEGMENTS = 24
IRIS_TEXTURE_SIZE = 256


def iris_materials(texture: str = "anime") -> dict[str, ba.MaterialSpec]:
    """홍채(recolor, 휘도 ≥ 0.55)와 캐치라이트(fixed 흰색) 재질."""
    jpeg = "image/jpeg"
    return {
        "ts_iris": ba.MaterialSpec("ts_iris", "iris", bt.encode_jpeg(bt.iris_texture(IRIS_TEXTURE_SIZE, variant=texture), 92, 0), jpeg),
        "ts_highlight": ba.MaterialSpec("ts_highlight", "eye-highlight", bt.encode_jpeg(bt.highlight_texture(16), 92, 0), jpeg),
    }


def build_iris_nodes(ctx: ba.Context, style: ws.LookStyle = ws.NONE, preset: str = "round-large") -> tuple[list[ba.MeshNode], list[str]]:
    """`TS_Iris_L/R`와 `TS_Highlight_L/R` 메시 노드(morph 포함)와 바닥 델타를 더한 곳의 목록. `style`을 주면 같은 변형 필드를 위치에 적용한다."""
    applied: list[str] = []
    spec = IRIS_PRESETS[preset]
    iris_names = ba.coverage_names(ctx, "iris")
    highlight_names = ba.coverage_names(ctx, "eye-highlight")
    nodes: list[ba.MeshNode] = []
    base_radius = style.iris_radius_m if style.id != "none" else 0.0060
    radius = base_radius * spec["radius_scale"]
    for side in "LR":
        eye = em.eye_geometry(ctx, side)
        iris = em.iris_cap(eye, radius_m=radius, rings=IRIS_RINGS, segments=IRIS_SEGMENTS)
        iris.morphs = ba.cast_f32(ba.eye_deltas(ctx, iris.positions, side, iris_names, applied, f"TS_Iris_{side}"), ctx.contract)
        nodes.append(ba.MeshNode(f"TS_Iris_{side}", ["iris"], [iris]))
    for side in "LR":
        eye = em.eye_geometry(ctx, side)
        shapes = []
        for offset, fraction, kind in spec["highlights"]:
            x_offset = offset[0] if side == "L" else offset[0]  # 두 눈 모두 같은 방향(관찰자 기준 좌상단)에서 빛이 온다
            if kind == "star":
                shapes.append(em.highlight_star(eye, iris_radius_m=radius, radius_m=fraction * radius, offset=(x_offset, offset[1])))
            else:
                shapes.append(em.highlight_disc(eye, iris_radius_m=radius, radius_m=fraction * radius, offset=(x_offset, offset[1])))
        highlight = em.merge_prims(shapes)
        highlight.morphs = ba.cast_f32(ba.eye_deltas(ctx, highlight.positions, side, highlight_names, applied, f"TS_Highlight_{side}"), ctx.contract)
        nodes.append(ba.MeshNode(f"TS_Highlight_{side}", ["eye-highlight"], [highlight]))
    ws.style_iris_nodes(ctx, nodes, style)
    return nodes, applied


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", choices=("female", "male"), default="female")
    parser.add_argument("--style", choices=sorted(ws.STYLES), default="none")
    parser.add_argument("--preset", choices=["all", *IRIS_PRESETS], default="all", help="만들 홍채 프리셋(기본: 어휘 5종 모두)")
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
    presets = list(IRIS_PRESETS) if args.preset == "all" else [args.preset]
    for preset in presets:
        nodes, applied = build_iris_nodes(ctx, look, preset)
        ba.unshift_nodes(ctx, nodes)
        path = args.kit_dir / part_relative_path(args.base, preset)
        path.parent.mkdir(parents=True, exist_ok=True)
        size = ba.write_base_glb(nodes, iris_materials(IRIS_PRESETS[preset]["texture"]), ctx, path)
        triangles = {node.name: int(sum(len(prim.triangles) for prim in node.prims)) for node in nodes}
        print(f"GLB: {path} ({size / 1024:.1f} KiB), 삼각형 {triangles}")
        print(f"0.03 mm 바닥 델타를 더한 morph: {', '.join(applied) or '없음'}")
    print(f"완료 {time.time() - started:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
