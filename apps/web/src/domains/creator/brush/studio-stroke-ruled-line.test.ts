import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_RULED_LINE_CONFIG,
  normalizeStudioRuledLineConfig,
  transformStrokeWithRuledLine,
} from "./studio-stroke-ruled-line";

describe("studio-stroke-ruled-line", () => {
  const straightPath = [
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ];

  it("none 모드는 원본 점 배열을 단일 세그먼트로 그대로 유지한다", () => {
    expect(transformStrokeWithRuledLine(straightPath, DEFAULT_STUDIO_RULED_LINE_CONFIG)).toEqual([
      straightPath,
    ]);
  });

  it("dashed 모드는 주기적으로 끊어진 파선 조각들을 생성하고 총 길이를 보존한다", () => {
    const dashed = transformStrokeWithRuledLine(
      straightPath,
      normalizeStudioRuledLineConfig({
        mode: "dashed",
        dashLengthPx: 20,
        gapLengthPx: 10,
      }),
    );
    // 0..20, 30..50, 60..80, 90..100 => 4개 구간
    expect(dashed).toHaveLength(4);
    const drawnSum = dashed.reduce((acc, seg) => {
      const first = seg[0]!;
      const last = seg[seg.length - 1]!;
      return acc + Math.hypot(last.x - first.x, last.y - first.y);
    }, 0);
    expect(drawnSum).toBeCloseTo(70, 3);
  });

  it("dotted 모드는 지정한 간격마다 점 캡 선분을 방출한다", () => {
    const dotted = transformStrokeWithRuledLine(
      straightPath,
      normalizeStudioRuledLineConfig({
        mode: "dotted",
        gapLengthPx: 25,
      }),
    );
    expect(dotted).toHaveLength(5);
    expect(dotted[0]![0]!.x).toBeCloseTo(0, 4);
    expect(dotted[4]![0]!.x).toBeCloseTo(100, 4);
  });

  it("waved 및 rough-edged 모드는 진폭 경계 안에서 결정론적 법선 변위를 만든다", () => {
    const waved = transformStrokeWithRuledLine(
      straightPath,
      normalizeStudioRuledLineConfig({
        mode: "waved",
        amplitudePx: 6,
        wavelengthPx: 25,
      }),
    );
    expect(waved).toHaveLength(1);
    const ys = waved[0]!.map((pt) => pt.y);
    expect(Math.max(...ys)).toBeLessThanOrEqual(56.01);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(43.99);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);

    const roughCfg = normalizeStudioRuledLineConfig({
      mode: "rough-edged",
      amplitudePx: 4,
      wavelengthPx: 20,
      seed: 77,
    });
    expect(transformStrokeWithRuledLine(straightPath, roughCfg)).toEqual(
      transformStrokeWithRuledLine(straightPath, roughCfg),
    );
  });
});
