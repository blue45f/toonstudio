"""Phase 0 PoC 합성 하네스: 3자 비교 시트 + 캐릭터 합성 샘플 1컷 + 정량 지표.

 렌더(Blender)와 분리된 시스템 Python 단계다. 입력은 파일 단위로만 받는다:
   --current     현재 플레이트 (제품 Three 캡처 또는 v5 EEVEE 썸네일)
   --cycles      Cycles beauty (render_convenience_store_night_plate_poc.py 산출)
   --cycles-lt   Cycles에 제품 LT 파이프라인(선화+cel 톤)을 적용한 결과
   --character   (선택) 투명 배경 캐릭터 컷아웃 PNG — 합성 샘플 제작용
   --manifest    (선택) 렌더 매니페스트. 있으면 lt 구간(edgeRetention·
                 compositePresent)을 채워 다시 쓴다. 판정은 TS 판정기의 몫이다.

 산출물:
   comparison.png  3자 비교 시트 (현재 / Cycles / Cycles+LT, 라벨 바 포함)
   composite.png   --character가 있을 때만: LT 플레이트 + 접지 그림자 + 톤 매칭 합성 1컷
   metrics.json    패널별 선명도(엣지 에너지)·엣지 비율, LT 엣지 유지율,
                   캐릭터 톤 델타(합성 전/후) — §6 성공 기준의 정량 기록.

 엣지 유지율은 기준(Cycles) 엣지 픽셀별로 ±2px 안에 LT 엣지가 있는지를 세는
 비율이다 (LT 엣지를 5x5 팽창해 기준 엣지와 교집합). 잉크선은 FIND_EDGES 응답이
 선 자체가 아니라 그 양옆에 생기고(어두운 선 중심의 라플라시안 응답은 음수로
 잘린다), LT 선화는 1px 안팎으로 이동할 수 있어, 픽셀 정확 일치를 요구하면 실제
 품질과 무관하게 0으로 무너진다 (합성 픽스처 실측: 정확 일치 0.0).
 주의: 팽창한 기준 마스크의 면적을 분모로 쓰면 허용 반경을 넓힐수록 수치가
 오히려 떨어지는 가짜 지표가 된다 — 분모는 항상 기준 엣지 픽셀 수다.
 TS의 computeStudioBg3dPlateEdgeRetention도 같은 정의를 ±1px로 구현한다.

 의존성: Pillow만 쓴다 (Blender 내장 Python이 아닌 시스템 Python으로 실행).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

PANEL_HEIGHT = 800
LABEL_HEIGHT = 48
EDGE_THRESHOLD = 28

LABELS = (
    "1  CURRENT - Three.js / EEVEE thumb, 128px texture",
    "2  CYCLES PLATE - PBR 1K + HDRI + practical lights, 256 samples",
    "3  CYCLES + LT - line & tone on the Cycles plate",
)


def load_rgb(path: Path) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(f"input not found: {path}")
    return Image.open(path).convert("RGB")


def edge_map(image: Image.Image) -> Image.Image:
    gray = image.convert("L")
    edges = gray.filter(ImageFilter.FIND_EDGES)
    return edges.point(lambda value: 255 if value >= EDGE_THRESHOLD else 0)


def edge_ratio(edges: Image.Image) -> float:
    histogram = edges.histogram()
    total = edges.width * edges.height
    return histogram[255] / total if total else 0.0


def sharpness(image: Image.Image) -> float:
    """FIND_EDGES 응답 평균. 블러된 현재 플레이트와 Cycles 플레이트를 가르는 지표."""
    edges = image.convert("L").filter(ImageFilter.FIND_EDGES)
    histogram = edges.histogram()
    total = sum(histogram)
    if total == 0:
        return 0.0
    return sum(value * count for value, count in enumerate(histogram)) / total


def edge_retention(reference: Image.Image, lt: Image.Image) -> float:
    """기준 엣지(팽창 허용) 대비 LT 엣지 유지율. 크기가 다르면 기준 크기로 맞춘다."""
    if lt.size != reference.size:
        lt = lt.resize(reference.size)
    reference_edges = edge_map(reference)
    lt_edges = edge_map(lt)
    # LT 엣지를 ±2px 팽창하고, 기준 엣지 픽셀마다 그 범위 안에 드는지를 센다.
    dilated_lt = lt_edges.filter(ImageFilter.MaxFilter(5))
    ref_pixels = reference_edges.load()
    lt_pixels = dilated_lt.load()
    reference_count = 0
    retained_count = 0
    for y in range(reference_edges.height):
        for x in range(reference_edges.width):
            if ref_pixels[x, y]:
                reference_count += 1
                if lt_pixels[x, y]:
                    retained_count += 1
    if reference_count == 0:
        return 1.0
    return retained_count / reference_count


def mean_luminance(image: Image.Image) -> float:
    gray = image.convert("L")
    histogram = gray.histogram()
    total = sum(histogram)
    if total == 0:
        return 0.0
    return sum(value * count for value, count in enumerate(histogram)) / total


def fit_panel(image: Image.Image) -> Image.Image:
    scale = PANEL_HEIGHT / image.height
    width = max(1, round(image.width * scale))
    return image.resize((width, PANEL_HEIGHT))


def build_comparison(current: Image.Image, cycles: Image.Image, cycles_lt: Image.Image) -> Image.Image:
    panels = [fit_panel(image) for image in (current, cycles, cycles_lt)]
    total_width = sum(panel.width for panel in panels)
    sheet = Image.new("RGB", (total_width, PANEL_HEIGHT + LABEL_HEIGHT), (12, 14, 20))
    draw = ImageDraw.Draw(sheet)
    offset_x = 0
    for panel, label in zip(panels, LABELS):
        sheet.paste(panel, (offset_x, LABEL_HEIGHT))
        draw.rectangle([offset_x, 0, offset_x + panel.width, LABEL_HEIGHT], fill=(12, 14, 20))
        draw.text((offset_x + 12, 16), label, fill=(235, 240, 248))
        offset_x += panel.width
    return sheet


def tone_match(character: Image.Image, target_luminance: float) -> tuple[Image.Image, float, float]:
    """캐릭터 평균 휘도를 배경 휘도에 맞춰 '스티커 이질감'을 줄인다. 전/후 델타를 돌려준다."""
    rgb = character.convert("RGB")
    before = abs(mean_luminance(rgb) - target_luminance)
    current = mean_luminance(rgb)
    if current <= 0:
        return rgb, before, before
    factor = target_luminance / current
    matched = rgb.point(lambda value: max(0, min(255, round(value * factor))))
    after = abs(mean_luminance(matched) - target_luminance)
    return matched, before, after


def build_composite(plate_lt: Image.Image, character_rgba: Image.Image) -> tuple[Image.Image, float, float]:
    base = plate_lt.convert("RGB")
    # 캐릭터가 설 자리(하단 중앙)의 배경 휘도에 톤을 맞춘다.
    anchor_w = base.width // 3
    anchor_h = base.height // 4
    anchor_x = (base.width - anchor_w) // 2
    anchor_y = base.height - anchor_h
    anchor_region = base.crop((anchor_x, anchor_y, anchor_x + anchor_w, anchor_y + anchor_h))
    target = mean_luminance(anchor_region)

    matched_rgb, delta_before, delta_after = tone_match(character_rgba, target)
    matched = matched_rgb.convert("RGBA")
    matched.putalpha(character_rgba.getchannel("A"))

    scale = (base.height * 0.62) / matched.height
    char_size = (max(1, round(matched.width * scale)), max(1, round(matched.height * scale)))
    matched = matched.resize(char_size)
    pos_x = (base.width - char_size[0]) // 2
    pos_y = base.height - char_size[1]

    # 접지 그림자: 발밑 타원을 흐리게 깔아 떠 보이는 느낌을 없앤다.
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    foot_y = base.height - max(8, char_size[1] // 28)
    shadow_draw.ellipse(
        [pos_x + char_size[0] * 0.12, foot_y - char_size[1] * 0.045,
         pos_x + char_size[0] * 0.88, foot_y + char_size[1] * 0.045],
        fill=(0, 0, 0, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(4, char_size[0] // 24)))
    result = base.convert("RGBA")
    result.alpha_composite(shadow)
    result.alpha_composite(matched, (pos_x, pos_y))
    return result.convert("RGB"), delta_before, delta_after


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", required=True)
    parser.add_argument("--cycles", required=True)
    parser.add_argument("--cycles-lt", required=True)
    parser.add_argument("--character", default=None)
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        current = load_rgb(Path(args.current))
        cycles = load_rgb(Path(args.cycles))
        cycles_lt = load_rgb(Path(args.cycles_lt))
    except FileNotFoundError as error:
        print(f"compose failed: {error}", file=sys.stderr)
        return 2

    sheet = build_comparison(current, cycles, cycles_lt)
    sheet.save(output_dir / "comparison.png")

    retention = edge_retention(cycles, cycles_lt)
    metrics = {
        "panels": {
            "current": {"sharpness": round(sharpness(current), 4), "edgeRatio": round(edge_ratio(edge_map(current)), 5)},
            "cycles": {"sharpness": round(sharpness(cycles), 4), "edgeRatio": round(edge_ratio(edge_map(cycles)), 5)},
            "cyclesLt": {"sharpness": round(sharpness(cycles_lt), 4), "edgeRatio": round(edge_ratio(edge_map(cycles_lt)), 5)},
        },
        "ltEdgeRetention": round(retention, 4),
        "compositePresent": False,
    }

    if args.character:
        character_path = Path(args.character)
        if not character_path.is_file():
            print(f"compose failed: input not found: {character_path}", file=sys.stderr)
            return 2
        character = Image.open(character_path).convert("RGBA")
        composite, delta_before, delta_after = build_composite(cycles_lt, character)
        composite.save(output_dir / "composite.png")
        metrics["compositePresent"] = True
        metrics["characterToneDelta"] = {
            "before": round(delta_before, 3),
            "after": round(delta_after, 3),
        }

    (output_dir / "metrics.json").write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    if args.manifest:
        manifest_path = Path(args.manifest)
        if manifest_path.is_file():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["lt"] = {
                "edgeRetention": metrics["ltEdgeRetention"],
                "compositePresent": metrics["compositePresent"],
            }
            manifest_path.write_text(
                json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
            )
    print(f"comparison + metrics written to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
