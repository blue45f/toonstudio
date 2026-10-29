#!/usr/bin/env python3
"""원본 라이브러리·Blender·Pillow 없이 공개 배경을 현재 원장·선정·레시피와 대조한다."""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("bundle_scenes", Path(__file__).with_name("render-creator-bundle-scenes.py"))
SCENES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SCENES)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=SCENES.DEFAULT_OUTPUT / "manifest.json")
    parser.add_argument("--recipes", type=Path, default=SCENES.DEFAULT_RECIPES)
    parser.add_argument("--selection", type=Path, default=SCENES.PROPS.DEFAULT_SELECTION)
    parser.add_argument("--pack-rights", type=Path, default=SCENES.PROPS.DEFAULT_LEDGER)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    try:
        print(json.dumps(SCENES.verify_scene_catalog(args.catalog, args.recipes, args.selection, args.pack_rights, args.node)))
    except (SCENES.PROPS.RenderError, OSError, ValueError, KeyError, TypeError) as error:
        print("공개 배경 검증 실패: " + str(error) + " 권리·선정·레시피를 확인하고 다시 생성하세요.", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
