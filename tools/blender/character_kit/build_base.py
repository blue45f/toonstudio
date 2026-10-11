"""베이스 GLB 빌드 CLI (`bases/<base>.glb` + 리타깃용 `base_model_<base>.npz` + `kit.json` 작성용 사이드카). 기본은 여성이다.

실행(저장소 루트, bpy가 설치된 venv의 파이썬)::

    <venv>/bin/python -I tools/blender/character_kit/build_base.py \\
        --npz ~/.cache/toonstudio-kit/hbm-npz/hbm_female.npz \\
        --contract ~/.cache/toonstudio-kit/out/contract.json \\
        --kit-dir ~/.cache/toonstudio-kit/out/kit/toonstudio-kit-v1 \\
        --out-dir ~/.cache/toonstudio-kit/out \\
        [--base female|male] [--style none|webtoon-girl|webtoon-boy]

산출물
- `<kit-dir>/bases/<base>.glb`            : 키트 베이스(스켈레톤 68 joint + 메시 9개 + morph). 키트 폴더에는 이 파일만 쓴다.
- `<out-dir>/base_model_<base>.npz`       : 리타깃용 배열(명세는 `base_assembly` docstring). 키트 폴더 밖.
- `<out-dir>/base_meta_<base>.json`       : `build_kit_json.py`가 읽는 높이·경계·영역 범위·관절 오프셋·빌드 보고.

`--style`은 완성된 베이스의 머리·눈·입·속눈썹·눈썹을 웹툰풍 변형 필드로 옮긴다(`webtoon_style` 모듈 설명). 기본값 `none`은 HBM 사실 비례 그대로다.

계약 상수(`contract.json`)는 `pnpm exec tsx scripts/blender/dump-kit-contract.mjs --out <경로>` 로 만든다.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from character_kit import base_assembly as ba  # noqa: E402
from character_kit import webtoon_style as ws  # noqa: E402

CACHE = Path.home() / ".cache" / "toonstudio-kit"


def parse(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", choices=("female", "male"), default="female")
    parser.add_argument("--style", choices=sorted(ws.STYLES), default="none")
    parser.add_argument("--style-override", default=None, help="`--style`의 LookStyle 필드를 덮어쓰는 JSON(예: '{\"head_scale\": 0.86}'). 값을 렌더로 맞출 때 쓴다")
    parser.add_argument("--npz", type=Path, default=None, help="HBM npz(기본: ~/.cache/toonstudio-kit/hbm-npz/hbm_<base>.npz)")
    parser.add_argument("--contract", type=Path, default=CACHE / "out" / "contract.json")
    parser.add_argument("--kit-dir", type=Path, default=CACHE / "out" / "kit" / "toonstudio-kit-v1")
    parser.add_argument("--out-dir", type=Path, default=CACHE / "out")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse(argv)
    look = ws.resolve_style(args.style, args.style_override)
    if args.npz is None:
        args.npz = CACHE / "hbm-npz" / f"hbm_{look.source_hbm or args.base}.npz"
    started = time.time()
    print("컨텍스트(리그·스킨·T-포즈·정합) 준비")
    ctx = ba.load_context(args.npz, args.contract, base_id=args.base, style=look)
    print("베이스 조립")
    build = ba.build_base(ctx)
    styled = ws.restyle_build(build, look)
    print(f"스타일 {args.style}: {styled}")
    ba.unshift_build(build)  # 남성은 여성 좌표계로 만들었으므로 원래 높이로 되돌린다(여성은 변화 없음)
    glb_path = args.kit_dir / "bases" / f"{args.base}.glb"
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    size = ba.write_base_glb(build, build.materials, ctx, glb_path)
    print(f"GLB: {glb_path} ({size / 1048576:.2f} MiB)")
    ba.export_base_model(build, args.out_dir / f"base_model_{args.base}.npz")
    meta = ba.base_meta(build, base_id=args.base)
    meta["glbBytes"] = size
    meta["style"] = styled
    (args.out_dir / f"base_meta_{args.base}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"리타깃 npz: {args.out_dir / f'base_model_{args.base}.npz'}")
    print(f"사이드카: {args.out_dir / f'base_meta_{args.base}.json'}")
    print(f"완료 {time.time() - started:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
