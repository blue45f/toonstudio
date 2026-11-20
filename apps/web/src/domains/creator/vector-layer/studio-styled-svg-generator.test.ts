import { describe, expect, it } from "vitest";

import {
  DEFAULT_OKLCH_INK_PALETTE,
  auditStyledSvgSafety,
  formatOklchColor,
  generateProceduralStyledSvg,
  oklchPerceptualDistance,
  parseOklchColor,
  parseSvgPathDataToCubics,
  sanitizeAndNormalizeSvgToVectorLayer,
  snapOklchToLockedPalette,
  type OklchColor,
} from "./studio-styled-svg-generator";

const BRAND_LOCKED_PALETTE: readonly OklchColor[] = [
  { l: 0.25, c: 0.04, h: 260, label: "잉크 먹색" },
  { l: 0.62, c: 0.17, h: 25, label: "주홍 포인트" },
  { l: 0.78, c: 0.13, h: 90, label: "황금 엠블럼" },
];

describe("studio-styled-svg-generator", () => {
  it("OKLCH 색상을 정규화·파싱하고 지각 거리 기반으로 잠긴 팔레트에 스냅한다", () => {
    const formatted = formatOklchColor({ l: 0.62, c: 0.17, h: 25 });
    expect(formatted).toBe("oklch(0.62 0.17 25)");
    const parsed = parseOklchColor("oklch(62% 0.17 25deg / 80%)");
    expect(parsed).toEqual({ l: 0.62, c: 0.17, h: 25, alpha: 0.8 });

    const nearRed: OklchColor = { l: 0.6, c: 0.16, h: 29 };
    const snapped = snapOklchToLockedPalette(nearRed, BRAND_LOCKED_PALETTE);
    expect(snapped.index).toBe(1);
    expect(snapped.snapped).toBe(true);
    expect(oklchPerceptualDistance(nearRed, BRAND_LOCKED_PALETTE[1]!)).toBeLessThan(0.05);
  });

  it("5종 프리셋 절차형 SVG가 잠긴 OKLCH 팔레트와 안전 검수를 통과하고 베지어 레이어로 변환된다", () => {
    const presets = ["emblem", "sfx-badge", "prop-icon", "ornament", "pattern-tile"] as const;
    for (const preset of presets) {
      const generated = generateProceduralStyledSvg({
        preset,
        prompt: `${preset} 테스트 아이콘`,
        seed: 2026,
        width: 240,
        height: 240,
        strokeWidthPx: 2.5,
        lockedPalette: BRAND_LOCKED_PALETTE,
      });

      expect(generated.svgMarkup).toContain("<svg ");
      expect(generated.svgMarkup).toContain("oklch(");
      expect(generated.rightsBom.commercialSafe).toBe(true);
      expect(generated.rightsBom.lockedSwatchCount).toBe(3);

      const converted = sanitizeAndNormalizeSvgToVectorLayer({
        svgMarkup: generated.svgMarkup,
        layerId: `vec-${preset}`,
        layerName: `벡터 ${preset}`,
        lockedPalette: BRAND_LOCKED_PALETTE,
      });
      expect(converted.ok).toBe(true);
      expect(converted.safety.safe).toBe(true);
      expect(converted.layer?.type).toBe("vector");
      expect(converted.layer!.strokes.length).toBeGreaterThan(0);
      expect(converted.parsedSegmentCount).toBeGreaterThan(0);
      // 생성 단계에서 이미 잠긴 팔레트를 썼으므로 이탈 보정이 0건이어야 한다.
      expect(converted.snappedColorCount).toBe(0);
    }
  });

  it("2차 베지어(Q)와 상대 좌표(l/c/h/v/z)를 정확한 3차 베지어 세그먼트로 승격 정규화한다", () => {
    const parsed = parseSvgPathDataToCubics("M 0 0 Q 30 60 60 0 h 20 v 10 Z");
    expect(parsed.closed).toBe(true);
    expect(parsed.segments.length).toBe(4);
    // Q(0,0 -> 30,60 -> 60,0)의 3차 승격 제어점은 (20,40), (40,40)
    expect(parsed.segments[0]?.p1).toEqual({ x: 20, y: 40 });
    expect(parsed.segments[0]?.p2).toEqual({ x: 40, y: 40 });
    expect(parsed.segments[0]?.p3).toEqual({ x: 60, y: 0 });
  });

  it("스크립트·이벤트 핸들러·외부 image 참조가 들어간 위험 SVG를 차단한다", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M 0 0 L 10 10" onload="evil()" /><image href="https://example.invalid/x.png" /></svg>';
    const safety = auditStyledSvgSafety(malicious);
    expect(safety.safe).toBe(false);
    expect(safety.violations.length).toBeGreaterThanOrEqual(3);

    const blocked = sanitizeAndNormalizeSvgToVectorLayer({
      svgMarkup: malicious,
      layerId: "bad-vec",
      layerName: "위험 SVG",
      lockedPalette: DEFAULT_OKLCH_INK_PALETTE,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.layer).toBeNull();
  });

  it("외부 SVG의 비잠금 색상을 잠긴 OKLCH 스와치로 자동 스냅하고 스와치별 그룹을 구성한다", () => {
    const externalSvg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
      '  <path d="M 10 10 L 90 10" stroke="oklch(0.64 0.15 20)" stroke-width="4" />',
      '  <polygon points="50,20 80,80 20,80" stroke="oklch(0.75 0.12 95)" stroke-width="2" />',
      "</svg>",
    ].join("\n");

    const normalized = sanitizeAndNormalizeSvgToVectorLayer({
      svgMarkup: externalSvg,
      layerId: "ext-1",
      layerName: "외부 벡터",
      lockedPalette: BRAND_LOCKED_PALETTE,
    });
    expect(normalized.ok).toBe(true);
    expect(normalized.snappedColorCount).toBe(2);
    expect(normalized.layer?.strokes[0]?.color).toBe("oklch(0.62 0.17 25)");
    expect(normalized.layer?.strokes[1]?.color).toBe("oklch(0.78 0.13 90)");
    expect(normalized.swatchGroupMap["swatch-1"]).toHaveLength(1);
    expect(normalized.swatchGroupMap["swatch-2"]).toHaveLength(1);
  });
});
