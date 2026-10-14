import { describe, expect, it } from "vitest";

import { normalizeStudioBrushTextureSettingsV1 } from "./studio-brush-texture-combine-v1";
import {
  STUDIO_BRUSH_TEXTURE_PAPER_BOUNDARY_HELP_V1,
  STUDIO_BRUSH_TEXTURE_PAPER_COMPOSITION_ORDER_V1,
  STUDIO_BRUSH_TEXTURE_PAPER_DUAL_DEFAULTS_V1,
  composeStudioBrushTextureThenPaperAlphaV1,
} from "./studio-brush-texture-paper-boundary-v1";

const HEIGHT = normalizeStudioBrushTextureSettingsV1(
  STUDIO_BRUSH_TEXTURE_PAPER_DUAL_DEFAULTS_V1.texture,
);

describe("경계 — 합성 순서 명문화", () => {
  it("순서는 팁 → 텍스처(브러시 층) → 종이 침착(문서 층)이다", () => {
    expect(STUDIO_BRUSH_TEXTURE_PAPER_COMPOSITION_ORDER_V1.map((s) => s.step)).toEqual([
      "tip-coverage",
      "texture-combine",
      "paper-deposit",
    ]);
    const texture = STUDIO_BRUSH_TEXTURE_PAPER_COMPOSITION_ORDER_V1[1]!;
    const paper = STUDIO_BRUSH_TEXTURE_PAPER_COMPOSITION_ORDER_V1[2]!;
    expect(texture.layer).toBe("brush");
    expect(texture.authority).toBe("studio-brush-texture-combine-v1");
    expect(paper.layer).toBe("document");
    expect(paper.authority).toBe("studio-paper-media-profile-v1");
    expect(paper.coordinates).toBe("document");
  });

  it("도움말은 두 층과 순서를 모두 말한다", () => {
    expect(STUDIO_BRUSH_TEXTURE_PAPER_BOUNDARY_HELP_V1).toContain("브러시 텍스처(높이)");
    expect(STUDIO_BRUSH_TEXTURE_PAPER_BOUNDARY_HELP_V1).toContain("종이 침착");
    expect(STUDIO_BRUSH_TEXTURE_PAPER_BOUNDARY_HELP_V1).toContain("텍스처 먼저, 종이 침착 나중");
  });
});

describe("composeStudioBrushTextureThenPaperAlphaV1", () => {
  it("종이 배수 1(항등)이면 결과가 텍스처 결합 결과와 정확히 같다", () => {
    // height, depth 0.05 → 양자화 13/255, 도달 12·13/255 ≈ 0.612; 패턴 골 0.2 → 0.412.
    const composed = composeStudioBrushTextureThenPaperAlphaV1({
      coverage: 1,
      rawPatternValue: 0.2,
      texture: HEIGHT,
      strokeSeed: 7,
      dabIndex: 0,
      paperDepositMultiplier: 1,
    });
    expect(composed).toBeCloseTo(12 * (13 / 255) - 0.2);
  });

  it("종이 침착은 텍스처 결과에 마지막에 곱해진다", () => {
    const composed = composeStudioBrushTextureThenPaperAlphaV1({
      coverage: 1,
      rawPatternValue: 0.2,
      texture: HEIGHT,
      strokeSeed: 7,
      dabIndex: 0,
      paperDepositMultiplier: 0.5,
    });
    expect(composed).toBeCloseTo((12 * (13 / 255) - 0.2) * 0.5);
  });

  it("종이는 잉크를 만들지 않는다 — height가 0으로 만든 능선은 종이 배수 최대치여도 0이다", () => {
    // 패턴 능선 0.9는 도달 높이 0.612를 넘겨 height 결과가 0. 종이 배수 상한 1.5를
    // 곱해도 되살아나지 않아야 한다 (순서를 바꾸거나 종이를 먼저 곱하면 깨지는 불변식).
    const composed = composeStudioBrushTextureThenPaperAlphaV1({
      coverage: 1,
      rawPatternValue: 0.9,
      texture: HEIGHT,
      strokeSeed: 7,
      dabIndex: 0,
      paperDepositMultiplier: STUDIO_BRUSH_TEXTURE_PAPER_DUAL_DEFAULTS_V1.paperIdentity.depositScaleMax,
    });
    expect(composed).toBe(0);
  });

  it("텍스처가 없으면 종이 배수만 커버리지에 곱해지고 0..1로 클램프된다", () => {
    expect(
      composeStudioBrushTextureThenPaperAlphaV1({
        coverage: 0.4,
        rawPatternValue: 0,
        texture: null,
        strokeSeed: 0,
        dabIndex: 0,
        paperDepositMultiplier: 0.5,
      }),
    ).toBeCloseTo(0.2);
    expect(
      composeStudioBrushTextureThenPaperAlphaV1({
        coverage: 0.9,
        rawPatternValue: 0,
        texture: null,
        strokeSeed: 0,
        dabIndex: 0,
        paperDepositMultiplier: 1.5,
      }),
    ).toBe(1);
  });

  it("둘 다 항등이면 입력 커버리지 그대로다", () => {
    expect(
      composeStudioBrushTextureThenPaperAlphaV1({
        coverage: 0.63,
        rawPatternValue: 0.3,
        texture: null,
        strokeSeed: 0,
        dabIndex: 0,
        paperDepositMultiplier: 1,
      }),
    ).toBeCloseTo(0.63);
  });

  it("비유한 종이 배수는 항등 1로 fail-closed 한다", () => {
    expect(
      composeStudioBrushTextureThenPaperAlphaV1({
        coverage: 0.5,
        rawPatternValue: 0,
        texture: null,
        strokeSeed: 0,
        dabIndex: 0,
        paperDepositMultiplier: Number.NaN,
      }),
    ).toBeCloseTo(0.5);
  });
});

describe("기준 기본값", () => {
  it("height 기본 depth는 양자화되어 도달 높이가 1 미만 — 골에만 닿는 시작점이다", () => {
    expect(HEIGHT.mode).toBe("height");
    expect(HEIGHT.depth).toBeCloseTo(0.05);
    expect(12 * (Math.round(HEIGHT.depth * 255) / 255)).toBeLessThan(1);
  });

  it("종이 기준선은 항등이다 — 프리셋은 종이를 소유하지 않는다", () => {
    expect(STUDIO_BRUSH_TEXTURE_PAPER_DUAL_DEFAULTS_V1.paperIdentity.depositScale).toBe(1);
    expect(STUDIO_BRUSH_TEXTURE_PAPER_DUAL_DEFAULTS_V1.paperIdentity.granulation).toBe(0);
    expect(STUDIO_BRUSH_TEXTURE_PAPER_DUAL_DEFAULTS_V1.grainAmount).toBe(0.18);
  });
});
