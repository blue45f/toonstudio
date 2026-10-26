#!/usr/bin/env python3
"""
나노바나나(Nano Banana) 사이트 전역 비주얼 에셋 팩(nano-banana-site-v1) 생성 및 슬라이싱 스크립트.

4장의 2x2 마스터 아틀리에 보드로부터 16종의 시그니처 카드(640x360 및 320x180 WebP)와
마스터 보드 아틀라스(960x540 WebP), 결정론적 SHA-256 manifest.json을 생성한다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import TypedDict

from PIL import Image, ImageEnhance, ImageOps


class QuadrantSpec(TypedDict):
    card_id: str
    quadrant: str  # "tl" | "tr" | "bl" | "br"
    domain: str
    route_visual: str
    accent_hex: str
    secondary_hex: str
    title_ko: str
    title_en: str


class BoardSpec(TypedDict):
    board_id: str
    master_filename: str
    artifact_glob: str
    title_ko: str
    title_en: str
    quadrants: list[QuadrantSpec]


BOARDS: list[BoardSpec] = [
    {
        "board_id": "board-01-discovery-universe",
        "master_filename": "master-01-discovery-universe.webp",
        "artifact_glob": "master_01_discovery_universe*.jpg",
        "title_ko": "디스커버리 유니버스 아틀리에 보드",
        "title_en": "Discovery Universe Atelier Board",
        "quadrants": [
            {
                "card_id": "nb-discover-spotlight",
                "quadrant": "tl",
                "domain": "discover",
                "route_visual": "discover",
                "accent_hex": "#f6c453",
                "secondary_hex": "#818cf8",
                "title_ko": "큐레이션 스포트라이트 아트리움",
                "title_en": "Curated Spotlight Atrium",
            },
            {
                "card_id": "nb-explore-spectrum",
                "quadrant": "tr",
                "domain": "discover",
                "route_visual": "discover",
                "accent_hex": "#f472b6",
                "secondary_hex": "#38bdf8",
                "title_ko": "장르 스펙트럼 프리즘 랩",
                "title_en": "Genre Spectrum Prism Lab",
            },
            {
                "card_id": "nb-ranking-constellation",
                "quadrant": "bl",
                "domain": "discover",
                "route_visual": "discover",
                "accent_hex": "#fbbf24",
                "secondary_hex": "#60a5fa",
                "title_ko": "실시간 랭킹 & 연재 천문 시계탑",
                "title_en": "Constellation Ranking & Serialization Clockwork",
            },
            {
                "card_id": "nb-library-archive",
                "quadrant": "br",
                "domain": "manage",
                "route_visual": "manage",
                "accent_hex": "#fb923c",
                "secondary_hex": "#a78bfa",
                "title_ko": "트와일라잇 서재 & 컬렉션 아카이브",
                "title_en": "Twilight Personal Library Archive",
            },
        ],
    },
    {
        "board_id": "board-02-creative-studio",
        "master_filename": "master-02-creative-studio.webp",
        "artifact_glob": "master_02_creative_studio*.jpg",
        "title_ko": "크리에이티브 스튜디오 & 프로덕션 보드",
        "title_en": "Creative Studio & Production Board",
        "quadrants": [
            {
                "card_id": "nb-create-canvas",
                "quadrant": "tl",
                "domain": "create",
                "route_visual": "create",
                "accent_hex": "#ff7849",
                "secondary_hex": "#38bdf8",
                "title_ko": "원고 캔버스 & 셀셰이딩 브러시 데스크",
                "title_en": "Manuscript Canvas & Cel-Shaded Brush Desk",
            },
            {
                "card_id": "nb-planning-storylab",
                "quadrant": "tr",
                "domain": "planning",
                "route_visual": "planning",
                "accent_hex": "#f87171",
                "secondary_hex": "#60a5fa",
                "title_ko": "스토리 랩 & 홀로그램 콘티 테이블",
                "title_en": "Story Lab & Holographic Storyboard Table",
            },
            {
                "card_id": "nb-spatial-stage",
                "quadrant": "bl",
                "domain": "spatial",
                "route_visual": "spatial",
                "accent_hex": "#38bdf8",
                "secondary_hex": "#f6c453",
                "title_ko": "3D 배경 & VRM 캐릭터 공간 연출 스테이지",
                "title_en": "Spatial 3D Background & VRM Character Stage",
            },
            {
                "card_id": "nb-production-control",
                "quadrant": "br",
                "domain": "production",
                "route_visual": "production",
                "accent_hex": "#34d399",
                "secondary_hex": "#818cf8",
                "title_ko": "에피소드 프로덕션 & 품질 검수 컨트롤 룸",
                "title_en": "Episode Production & Quality Review Suite",
            },
        ],
    },
    {
        "board_id": "board-03-ecosystem-academy",
        "master_filename": "master-03-ecosystem-academy.webp",
        "artifact_glob": "master_03_ecosystem_academy*.jpg",
        "title_ko": "에코시스템 마켓 & 아카데미 보드",
        "title_en": "Ecosystem Market & Creator Academy Board",
        "quadrants": [
            {
                "card_id": "nb-market-atelier",
                "quadrant": "tl",
                "domain": "market",
                "route_visual": "assets",
                "accent_hex": "#f6c453",
                "secondary_hex": "#2dd4bf",
                "title_ko": "창작 에셋 마켓 & 핏 랩 쇼케이스",
                "title_en": "Creator Asset Market & Fit Lab Vitrine",
            },
            {
                "card_id": "nb-learn-academy",
                "quadrant": "tr",
                "domain": "learn",
                "route_visual": "learn",
                "accent_hex": "#fbbf24",
                "secondary_hex": "#60a5fa",
                "title_ko": "크리에이터 아카데미 & 트레이스 실습실",
                "title_en": "Creator Academy & Trace Practice Studio",
            },
            {
                "card_id": "nb-community-plaza",
                "quadrant": "bl",
                "domain": "community",
                "route_visual": "connect",
                "accent_hex": "#f472b6",
                "secondary_hex": "#fb923c",
                "title_ko": "커뮤니티 라운지 & 프로모션 리그 광장",
                "title_en": "Community Lounge & Promotion League Plaza",
            },
            {
                "card_id": "nb-showcase-premiere",
                "quadrant": "br",
                "domain": "showcase",
                "route_visual": "publish",
                "accent_hex": "#a78bfa",
                "secondary_hex": "#f6c453",
                "title_ko": "작품 프리미어 쇼케이스 & 협업 라운드테이블",
                "title_en": "Premiere Showcase & Collaboration Roundtable",
            },
        ],
    },
    {
        "board_id": "board-04-personal-trust-play",
        "master_filename": "master-04-personal-trust-play.webp",
        "artifact_glob": "master_04_personal_trust_play*.jpg",
        "title_ko": "올인원 워크플로, 내 공간 & 신뢰 보드",
        "title_en": "All-in-One Workflow, Personal Hub & Trust Board",
        "quadrants": [
            {
                "card_id": "nb-workflow-bridge",
                "quadrant": "tl",
                "domain": "workflow",
                "route_visual": "workflow",
                "accent_hex": "#ff7849",
                "secondary_hex": "#f6c453",
                "title_ko": "올인원 창작-연재 골든 브리지",
                "title_en": "All-in-One Creation-to-Serial Golden Bridge",
            },
            {
                "card_id": "nb-manage-vault",
                "quadrant": "tr",
                "domain": "manage",
                "route_visual": "manage",
                "accent_hex": "#38bdf8",
                "secondary_hex": "#f6c453",
                "title_ko": "내 공간 커맨드 데스크 & AI 키 볼트",
                "title_en": "My Space Command Desk & AI Key Vault",
            },
            {
                "card_id": "nb-play-fortune",
                "quadrant": "bl",
                "domain": "play",
                "route_visual": "play",
                "accent_hex": "#c084fc",
                "secondary_hex": "#f6c453",
                "title_ko": "스타라이트 웹툰 타로 & 컷플레이 아케이드",
                "title_en": "Starlight Webtoon Tarot & Cut-Play Arcade",
            },
            {
                "card_id": "nb-trust-sanctuary",
                "quadrant": "br",
                "domain": "trust",
                "route_visual": "trust",
                "accent_hex": "#2dd4bf",
                "secondary_hex": "#f6c453",
                "title_ko": "플랜·보안·접근성 크리스탈 성소",
                "title_en": "Pricing, Security & Accessibility Sanctuary",
            },
        ],
    },
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def crop_quadrant(image: Image.Image, quadrant: str) -> Image.Image:
    width, height = image.size
    half_w = width // 2
    half_h = height // 2
    # Trim central divider lines and outer frame margin cleanly (2.2% inset)
    pad_x = max(6, int(half_w * 0.022))
    pad_y = max(6, int(half_h * 0.022))

    if quadrant == "tl":
        box = (pad_x, pad_y, half_w - pad_x, half_h - pad_y)
    elif quadrant == "tr":
        box = (half_w + pad_x, pad_y, width - pad_x, half_h - pad_y)
    elif quadrant == "bl":
        box = (pad_x, half_h + pad_y, half_w - pad_x, height - pad_y)
    elif quadrant == "br":
        box = (half_w + pad_x, half_h + pad_y, width - pad_x, height - pad_y)
    else:
        raise ValueError(f"Unsupported quadrant: {quadrant}")

    cropped = image.crop(box)
    return ImageEnhance.Sharpness(ImageEnhance.Contrast(cropped).enhance(1.03)).enhance(1.06)


def resolve_master_source(board: BoardSpec, source_dir: Path | None, masters_dir: Path) -> Path:
    if source_dir and source_dir.exists():
        matches = sorted(source_dir.glob(board["artifact_glob"]))
        if matches:
            return matches[-1]
    master_webp = masters_dir / board["master_filename"]
    if master_webp.exists():
        return master_webp
    raise FileNotFoundError(
        f"Could not find source image for {board['board_id']} in {source_dir} or {master_webp}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=None,
        help="Optional directory containing raw Nano Banana master boards.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("apps/web/public/assets/site-experience/nano-banana-site-v1"),
        help="Output asset pack directory.",
    )
    args = parser.parse_args()

    out_dir: Path = args.output_dir
    masters_dir = out_dir / "masters"
    cards_dir = out_dir / "cards"
    masters_dir.mkdir(parents=True, exist_ok=True)
    cards_dir.mkdir(parents=True, exist_ok=True)

    manifest_boards: list[dict[str, object]] = []
    manifest_cards: list[dict[str, object]] = []

    for board in BOARDS:
        src_path = resolve_master_source(board, args.source_dir, masters_dir)
        with Image.open(src_path) as raw_img:
            rgb_img = raw_img.convert("RGB")
            master_out = masters_dir / board["master_filename"]
            # Save master board as 960x540 high-efficiency WebP if sourced from external artifact
            if src_path.resolve() != master_out.resolve():
                master_resized = ImageOps.fit(rgb_img, (960, 540), method=Image.Resampling.LANCZOS)
                master_resized.save(master_out, format="WEBP", quality=84, method=6)

            for q in board["quadrants"]:
                quad_img = crop_quadrant(rgb_img, q["quadrant"])
                card_640 = ImageOps.fit(quad_img, (640, 360), method=Image.Resampling.LANCZOS)
                card_320 = ImageOps.fit(quad_img, (320, 180), method=Image.Resampling.LANCZOS)

                file_640 = cards_dir / f"{q['card_id']}-640.webp"
                file_320 = cards_dir / f"{q['card_id']}-320.webp"

                card_640.save(file_640, format="WEBP", quality=84, method=6)
                card_320.save(file_320, format="WEBP", quality=82, method=6)

                manifest_cards.append(
                    {
                        "cardId": q["card_id"],
                        "boardId": board["board_id"],
                        "quadrant": q["quadrant"],
                        "domain": q["domain"],
                        "routeVisual": q["route_visual"],
                        "accentHex": q["accent_hex"],
                        "secondaryHex": q["secondary_hex"],
                        "title": {"ko": q["title_ko"], "en": q["title_en"]},
                        "src640": f"/assets/site-experience/nano-banana-site-v1/cards/{file_640.name}",
                        "src320": f"/assets/site-experience/nano-banana-site-v1/cards/{file_320.name}",
                        "sha256_640": sha256_file(file_640),
                        "sha256_320": sha256_file(file_320),
                        "dimensions": {
                            "standard": {"width": 640, "height": 360},
                            "compact": {"width": 320, "height": 180},
                        },
                    }
                )

        manifest_boards.append(
            {
                "boardId": board["board_id"],
                "title": {"ko": board["title_ko"], "en": board["title_en"]},
                "src": f"/assets/site-experience/nano-banana-site-v1/masters/{board['master_filename']}",
                "sha256": sha256_file(masters_dir / board["master_filename"]),
                "dimensions": {"width": 960, "height": 540},
            }
        )

    manifest_payload = {
        "packId": "nano-banana-site-v1",
        "version": 1,
        "generator": "Nano Banana (Gemini Image Generation) + generate-site-experience-nano-banana-v1.py",
        "aesthetic": "Korean Webtoon Atelier (Starlight Indigo #0d1326, Persimmon #ff7849, Luminous Gold #f6c453)",
        "boards": manifest_boards,
        "cards": manifest_cards,
    }

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(manifest_cards)} cards and {len(manifest_boards)} boards in {out_dir}")


if __name__ == "__main__":
    main()
