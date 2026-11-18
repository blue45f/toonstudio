import { describe, expect, it } from "vitest";

import { MAX_PNG_EXPORT_DIMENSION } from "./export-session";
import { isPng } from "./png-encoder";
import {
  WEBTOON_VERTICAL_STRIP_CUTS,
  clampWebtoonStripLayout,
  composeWebtoonVerticalStrip,
  exportWebtoonVerticalStripPng,
} from "./webtoon-strip-composer";
import { createMockEngine } from "../testing/mock-engine";

describe("webtoon-strip-composer", () => {
  it("clampWebtoonStripLayout은 800px 원고 폭과 1024px 최대 폭 모두에서 4096px 이하 세로 스트립을 계산한다", () => {
    const std = clampWebtoonStripLayout(800, true);
    expect(std.stripWidth).toBe(800);
    expect(std.stripHeight).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);
    expect(std.cutWidth).toBeGreaterThan(700);
    expect(std.bubbleSafeTopPx).toBeGreaterThan(30);
    expect(std.borderPx).toBe(3);

    const wide = clampWebtoonStripLayout(2048, true);
    expect(wide.stripWidth).toBe(1024);
    expect(wide.stripHeight).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);

    const noBubble = clampWebtoonStripLayout(64, false);
    expect(noBubble.bubbleSafeTopPx).toBe(0);
    expect(noBubble.stripWidth).toBe(64);
  });

  it("composeWebtoonVerticalStrip은 백색 원고지·먹선 프레임·말풍선 상단 여백과 알파 캐릭터 픽셀을 정확히 합성한다", () => {
    const layout = clampWebtoonStripLayout(48, true);
    const panels = WEBTOON_VERTICAL_STRIP_CUTS.map((_, cutIdx) => {
      const rgba = new Uint8ClampedArray(layout.cutWidth * layout.cutHeight * 4);
      // 중앙 픽셀 하나에 고유 색상을 불투명(255)으로 찍는다
      const cx = Math.floor(layout.cutWidth / 2);
      const cy = Math.floor(layout.cutHeight / 2);
      const p = (cy * layout.cutWidth + cx) * 4;
      rgba[p] = 40 + cutIdx * 40;
      rgba[p + 1] = 90;
      rgba[p + 2] = 200;
      rgba[p + 3] = 255;
      return { width: layout.cutWidth, height: layout.cutHeight, rgba };
    });

    const strip = composeWebtoonVerticalStrip(panels, layout);
    expect(strip.width).toBe(layout.stripWidth);
    expect(strip.height).toBe(layout.stripHeight);

    // 좌상단 외곽 여백(0, 0)은 순백색(#FFFFFF)
    expect(Array.from(strip.rgba.slice(0, 4))).toEqual([255, 255, 255, 255]);

    // 첫 번째 패널 좌상단 테두리(marginX, marginY)는 먹선(#18151C -> 24, 21, 28, 255)
    const borderIdx = (layout.marginY * strip.width + layout.marginX) * 4;
    expect(Array.from(strip.rgba.slice(borderIdx, borderIdx + 4))).toEqual([24, 21, 28, 255]);

    // 첫 번째 컷의 캐릭터 중앙 픽셀 확인
    const charX = layout.marginX + layout.borderPx + Math.floor(layout.cutWidth / 2);
    const charY = layout.marginY + layout.borderPx + layout.bubbleSafeTopPx + Math.floor(layout.cutHeight / 2);
    const charIdx = (charY * strip.width + charX) * 4;
    expect(Array.from(strip.rgba.slice(charIdx, charIdx + 4))).toEqual([40, 90, 200, 255]);
  });

  it("exportWebtoonVerticalStripPng는 4가지 웹툰 카메라 앵글로 순차 캡처해 PNG를 인코딩한다", async () => {
    const engine = createMockEngine();
    const steps: string[] = [];
    const outcome = await exportWebtoonVerticalStripPng(
      engine,
      {
        stripWidth: 64,
        includeBubbleSafeZone: true,
        settleSteps: 3,
        onProgress: (step, total, labelKo) => steps.push(`${step}/${total}:${labelKo}`),
      },
      { now: () => 100 },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(isPng(outcome.bytes)).toBe(true);
    expect(outcome.receipt.fileName).toMatch(/-webtoon-4cut-strip\.png$/u);
    expect(steps).toHaveLength(4);

    const renderCalls = engine.calls.filter((c) => c.method === "renderPasses");
    expect(renderCalls).toHaveLength(4);
    const modes = renderCalls.map((c) => (c.args[0] as { camera?: { mode: string } }).camera?.mode);
    expect(modes).toEqual(["full-body", "bust", "face", "bust"]);
    const pitches = renderCalls.map((c) => (c.args[0] as { camera?: { pitchDeg: number } }).camera?.pitchDeg);
    expect(pitches).toEqual([-14, 0, 0, 18]);
  });
});
