#!/usr/bin/env python3
"""모델 의존성 호환성 프로필을 설치 없이 dry-run 해석하고 JSON 보고서를 기록한다."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify model dependency resolution without installing.")
    parser.add_argument(
        "--requirements",
        default="services/creator-inference/requirements-models.txt",
        help="Path to the model compatibility requirements file.",
    )
    parser.add_argument(
        "--report",
        default="creator-model-resolution.json",
        help="Path to write pip dry-run JSON report.",
    )
    args = parser.parse_args(argv)

    req_path = pathlib.Path(args.requirements)
    if not req_path.is_file():
        print(f"Requirements file not found: {req_path}", file=sys.stderr)
        return 1

    report_path = pathlib.Path(args.report)
    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--dry-run",
        "--ignore-installed",
        "--report",
        str(report_path),
        "-r",
        str(req_path),
    ]
    subprocess.run(command, check=True)

    payload = json.loads(report_path.read_text(encoding="utf-8"))
    resolved = payload.get("install", [])
    if not isinstance(resolved, list) or len(resolved) == 0:
        print("Dry-run resolution report contains no resolved packages.", file=sys.stderr)
        return 1
    print(f"Resolved {len(resolved)} packages in dry-run compatibility check -> {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
