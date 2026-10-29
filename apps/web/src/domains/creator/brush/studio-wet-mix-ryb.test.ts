/**
 * 혼색 브러시의 `ryb`(빨노파 색상환) 방식 시험. RGB↔RYB 변환은 서로 역변환이 아니므로, 끝점과 같은 색끼리 섞기에서
 * 원래 색이 그대로 나오는지(왕복 잔차 보정)를 고정한다.
 */
import { describe, expect, it } from "vitest";

import { wetMixStroke, type WetMixSettings } from "./studio-wet-mix";

function flatImage(w: number, h: number, rgba: readonly [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let index = 0; index < w * h; index += 1) data.set(rgba, index * 4);
  return data;
}

function settings(overrides: Partial<WetMixSettings> = {}): WetMixSettings {
  return {
    radiusPx: 6,
    hardness: 1,
    strength: 1,
    wetness: 0.5,
    pickup: 1,
    paintColor: { r: 0, g: 0x50, b: 0xdc },
    mixModel: "ryb",
    ...overrides,
  };
}

const YELLOW = [255, 0xe0, 0, 255] as const;
const STROKE = [{ x: 4, y: 16 }, { x: 28, y: 16 }];
const greenness = (data: Uint8ClampedArray, offset: number): number => data[offset + 1] - (data[offset] + data[offset + 2]) / 2;

function maxChannelError(data: Uint8ClampedArray, rgb: readonly [number, number, number]): number {
  let worst = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) worst = Math.max(worst, Math.abs(data[offset + channel] - rgb[channel]));
  }
  return worst;
}

describe("wetMixStroke 의 ryb 방식", () => {
  it("혼색율 0 은 현재 색만 얹으므로 lerp 와 바이트 단위로 같다", () => {
    const lerp = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ wetness: 0, mixModel: "lerp" }));
    const ryb = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ wetness: 0 }));
    expect(Buffer.from(ryb).equals(Buffer.from(lerp))).toBe(true);
  });

  it("혼색율 1 로 평평한 바닥을 지나가면 바닥색이 그대로 남는다", () => {
    for (const rgba of [[255, 0, 0, 255], [0, 0, 255, 255], [120, 64, 200, 255]] as const) {
      const data = flatImage(32, 32, rgba);
      wetMixStroke(data, 32, 32, STROKE, settings({ wetness: 1 }));
      expect(Buffer.from(data).equals(Buffer.from(flatImage(32, 32, rgba)))).toBe(true);
    }
  });

  it("바닥과 같은 색을 패널 기본값으로 칠하면 색이 바뀌지 않는다", () => {
    const panel = { strength: 0.6, wetness: 0.55, pickup: 0.45 };
    const data = flatImage(32, 32, [0, 0x50, 0xdc, 255]);
    wetMixStroke(data, 32, 32, STROKE, settings(panel));
    expect(maxChannelError(data, [0, 0x50, 0xdc])).toBeLessThanOrEqual(1);
    // 무작위 색 여러 개도 같은 성질을 지킨다(왕복 잔차 보정 전에는 채널 오차가 150~206 이었다).
    let seed = 0x5eed;
    const next = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed >>> 24; };
    for (let trial = 0; trial < 40; trial += 1) {
      const rgb = [next(), next(), next()] as const;
      const canvas = flatImage(16, 16, [rgb[0], rgb[1], rgb[2], 255]);
      wetMixStroke(canvas, 16, 16, [{ x: 2, y: 8 }, { x: 14, y: 8 }], settings({ ...panel, radiusPx: 4, paintColor: { r: rgb[0], g: rgb[1], b: rgb[2] } }));
      expect(maxChannelError(canvas, rgb)).toBeLessThanOrEqual(1);
    }
  });

  it("노랑 바닥에 파랑을 한 번 찍어 반반 섞으면 lerp 보다 초록 쪽이다(빨노파 색상환 방향)", () => {
    const tap = [{ x: 16, y: 16 }];
    const lerp = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, tap, settings({ mixModel: "lerp" }));
    const ryb = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, tap, settings());
    const centre = (16 * 32 + 16) * 4;
    expect(greenness(ryb, centre)).toBeGreaterThan(greenness(lerp, centre));
  });

  it("결정적이다 — 같은 입력은 같은 바이트를 낸다", () => {
    const first = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings());
    const second = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings());
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });
});
