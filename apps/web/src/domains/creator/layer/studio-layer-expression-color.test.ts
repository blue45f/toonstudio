import { describe, expect, it } from "vitest";

import {
  applyLayerExpressionColorInPlace,
  BLUE_LINE_ROUGH_LAYER_COLOR_PRESET,
  describeStudioLayerExpressionColorSummary,
  evaluateLayerExpressionColor,
  isIdentityStudioLayerExpressionColorSettings,
  normalizeStudioLayerExpressionColorSettings,
} from "./studio-layer-expression-color";

import type { StudioImageDataLike } from "../studio-filters";

function createImage(
  width: number,
  height: number,
  pixels: ReadonlyArray<readonly [number, number, number, number]>,
): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 1) {
    const px = pixels[i]!;
    data[i * 4] = px[0];
    data[i * 4 + 1] = px[1];
    data[i * 4 + 2] = px[2];
    data[i * 4 + 3] = px[3];
  }
  return { width, height, data };
}

describe("studio-layer-expression-color", () => {
  it("기본 설정은 항등으로 판정하며 원본 버퍼를 변형하지 않는다", () => {
    const src = createImage(2, 1, [
      [34, 120, 210, 180],
      [250, 40, 90, 0],
    ]);
    const snapshot = src.data.slice();

    expect(isIdentityStudioLayerExpressionColorSettings()).toBe(true);
    expect(describeStudioLayerExpressionColorSummary()).toBeNull();

    const out = evaluateLayerExpressionColor(src);
    expect([...out.data]).toEqual([...snapshot]);
    expect(out.data).not.toBe(src.data);
    expect([...src.data]).toEqual([...snapshot]);
  });

  it("그레이(gray) 표현색은 알파를 보존하면서 BT.709 휘도로 무채색 변환한다", () => {
    const src = createImage(2, 1, [
      [255, 0, 0, 200],
      [0, 255, 0, 95],
    ]);

    const out = evaluateLayerExpressionColor(src, {
      expressionMode: "gray",
    });

    expect(out.data[0]).toBe(out.data[1]);
    expect(out.data[1]).toBe(out.data[2]);
    expect(out.data[0]).toBe(Math.round(0.2126 * 255));
    expect(out.data[3]).toBe(200);

    expect(out.data[4]).toBe(Math.round(0.7152 * 255));
    expect(out.data[7]).toBe(95);
  });

  it("모노크롬(monochrome) 표현색은 이미지·알파 이중 임계값으로 0/255 이진 알파와 흑백만 출력한다", () => {
    const src = createImage(4, 1, [
      [30, 30, 30, 200], // 어두운 선 + 충분한 알파 -> 검정 불투명(255)
      [220, 220, 220, 210], // 밝은 칠 + 충분한 알파 -> 흰색 불투명(255)
      [10, 10, 10, 90], // 알파 임계 미달 -> 완전 투명(0)
      [255, 255, 255, 0], // 원래 투명 -> 완전 투명(0)
    ]);

    const out = evaluateLayerExpressionColor(src, {
      expressionMode: "monochrome",
      imageThreshold: 128,
      alphaThreshold: 140,
    });

    expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...out.data.slice(4, 8)]).toEqual([255, 255, 255, 255]);
    expect([...out.data.slice(8, 12)]).toEqual([0, 0, 0, 0]);
    expect([...out.data.slice(12, 16)]).toEqual([0, 0, 0, 0]);

    for (let p = 0; p < 4; p += 1) {
      const alpha = out.data[p * 4 + 3]!;
      expect(alpha === 0 || alpha === 255).toBe(true);
    }

    const blackOnly = evaluateLayerExpressionColor(src, {
      expressionMode: "monochrome",
      imageThreshold: 128,
      alphaThreshold: 140,
      monochromeSubMode: "black-only",
    });
    expect([...blackOnly.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...blackOnly.data.slice(4, 8)]).toEqual([0, 0, 0, 0]);
  });

  it("레이어 컬러(layerColorTint)는 밑그림 선화를 파란선 주색과 흰색 보조색 사이로 리맵한다", () => {
    const src = createImage(3, 1, [
      [0, 0, 0, 255], // 순검정 잉크 -> 주색(#2563eb = 37, 99, 235)
      [255, 255, 255, 255], // 순백색 -> 보조색(#ffffff = 255, 255, 255)
      [128, 128, 128, 160], // 중간 회색 -> 주색·보조색 중간 보간, 알파 160 유지
    ]);

    const out = evaluateLayerExpressionColor(src, {
      layerColorTint: BLUE_LINE_ROUGH_LAYER_COLOR_PRESET,
    });

    expect([...out.data.slice(0, 4)]).toEqual([37, 99, 235, 255]);
    expect([...out.data.slice(4, 8)]).toEqual([255, 255, 255, 255]);
    expect(out.data[8]).toBeGreaterThan(37);
    expect(out.data[8]).toBeLessThan(255);
    expect(out.data[10]).toBeGreaterThan(235);
    expect(out.data[11]).toBe(160);
  });

  it("수채 경계(watercolorEdge)는 채색 내부 중심보다 실루엣 테두리 안료를 더 어둡게 응집시킨다", () => {
    const width = 13;
    const height = 13;
    const pixels: Array<[number, number, number, number]> = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside = x >= 2 && x <= 10 && y >= 2 && y <= 10;
        pixels.push(inside ? [210, 180, 160, 255] : [0, 0, 0, 0]);
      }
    }
    const src = createImage(width, height, pixels);

    const out = evaluateLayerExpressionColor(src, {
      watercolorEdge: {
        enabled: true,
        rangePx: 2,
        opacity: 90,
        darkness: 80,
        blurPx: 1,
      },
    });

    const edgeIdx = (2 * width + 6) * 4;
    const centerIdx = (6 * width + 6) * 4;
    const outsideIdx = 0;

    // 테두리 픽셀은 내부 중심 픽셀보다 어두워지고 알파는 유지된다.
    expect(out.data[edgeIdx]!).toBeLessThan(out.data[centerIdx]!);
    expect(out.data[edgeIdx + 1]!).toBeLessThan(out.data[centerIdx + 1]!);
    expect(out.data[centerIdx]!).toBe(210);
    expect(out.data[edgeIdx + 3]).toBe(255);
    expect(out.data[outsideIdx + 3]).toBe(0);
  });

  it("정규화·요약 헬퍼와 in-place 어댑터가 비정상 입력을 안전하게 클램프한다", () => {
    const normalized = normalizeStudioLayerExpressionColorSettings({
      expressionMode: "monochrome",
      imageThreshold: 999,
      alphaThreshold: -12,
      layerColorTint: { enabled: true, mainColor: "#0af", subColor: "invalid" },
      watercolorEdge: { enabled: true, rangePx: 99, opacity: 50, darkness: 60, blurPx: -3 },
    });

    expect(normalized.imageThreshold).toBe(255);
    expect(normalized.alphaThreshold).toBe(0);
    expect(normalized.layerColorTint.mainColor).toBe("#00aaff");
    expect(normalized.layerColorTint.subColor).toBe("#ffffff");
    expect(normalized.watercolorEdge.rangePx).toBe(20);
    expect(normalized.watercolorEdge.blurPx).toBe(0);
    expect(describeStudioLayerExpressionColorSummary(normalized)).toBe(
      "표현색 모노크롬, 레이어 컬러 #00aaff, 수채 경계",
    );

    const target = createImage(1, 1, [[10, 10, 10, 255]]);
    applyLayerExpressionColorInPlace(target, {
      layerColorTint: { enabled: true, mainColor: "#ff0000", subColor: "#ffffff" },
    });
    expect(target.data[0]).toBeGreaterThan(240);
    expect(target.data[1]).toBeLessThan(20);
  });
});
