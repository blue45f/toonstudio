#!/usr/bin/env python3
"""사업계획서 PDF용 한글 폰트 부분집합(subset) 생성 스크립트.

- 원본: 시스템 설치 Noto Sans CJK KR (OFL-1.1, /usr/share/fonts/opentype/noto/)
  TTC 안의 KR 면(face index 1)을 쓴다.
- business-plan-data.ts 본문 + PDF 표지·꼬리말 문구에 쓰이는 글자만 추려
  Regular/Bold 두 개의 작은 TTF를 만든다. 브라우저에서 PDF를 만들 때
  pdf-lib + @pdf-lib/fontkit으로 이 폰트를 내장한다.
- 출력: apps/web/public/fonts/business-plan-noto-sans-kr-{regular,bold}-subset.ttf
- 재생성: python3 apps/web/scripts/generate-business-plan-font-subset.py
- 폰트 파일이 바뀌면 business-plan-download.test.ts가 PDF 텍스트 추출로 검증한다.
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_FILE = REPO_ROOT / "apps/web/src/domains/marketing/business-plan-data.ts"
OUT_DIR = REPO_ROOT / "apps/web/public/fonts"

# PDF 표지·라벨 등 데이터 파일 밖에만 있는 문구.
EXTRA_TEXT = (
    "툰스튜디오 사업계획서 웹툰 제작 전 과정의 협업 업무툴 "
    "작성자 김희준 1인 예비창업자 사업자등록 없음 팀 없음 "
    "멘토 정진호 멘토기관 한국핀테크지원센터 "
    "작성 기준 2026-11-04 고도화 초안 v11 "
    "제출용 문서가 아닙니다 제출은 2026-12-01 13:00까지 "
    "모두의 창업 플랫폼 modoo.or.kr 을 통해 별도로 합니다 "
    "주의 쪽 표 참고자료 "
)

FONTS = (
    (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        OUT_DIR / "business-plan-noto-sans-kr-regular-subset.ttf",
    ),
    (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        OUT_DIR / "business-plan-noto-sans-kr-bold-subset.ttf",
    ),
)


def collect_chars() -> str:
    text = DATA_FILE.read_text(encoding="utf-8") + EXTRA_TEXT
    # ASCII 인쇄 가능 문자 전체를 넣어 숫자·구두점 누락을 막는다.
    chars = set(text) | {chr(code) for code in range(0x20, 0x7F)}
    return "".join(sorted(chars))


def main() -> int:
    chars = collect_chars()
    chars_file = Path("/tmp/business-plan-subset-chars.txt")
    chars_file.write_text(chars, encoding="utf-8")
    print(f"글자 수: {len(chars)}")

    for src, out in FONTS:
        if not Path(src).exists():
            print(f"원본 폰트를 찾을 수 없음: {src}", file=sys.stderr)
            return 1
        cmd = [
            sys.executable,
            "-m",
            "fontTools.subset",
            src,
            "--font-number=1",
            f"--output-file={out}",
            f"--text-file={chars_file}",
            "--layout-features=kern,liga",
            "--no-hinting",
            "--desubroutinize",
        ]
        subprocess.run(cmd, check=True)
        digest = hashlib.sha256(out.read_bytes()).hexdigest()
        print(f"{out.name}: {out.stat().st_size:,} bytes sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
