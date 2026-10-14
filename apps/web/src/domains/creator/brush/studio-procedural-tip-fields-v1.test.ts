import { describe, expect, it } from "vitest";

import { rasterizeStudioProceduralTip } from "./studio-procedural-tip-rasterizer";
import {
  createStudioGrassTipFieldV1,
  createStudioRakeTipFieldV1,
  createStudioSpatterTipFieldV1,
} from "./studio-procedural-tip-fields-v1";

function byteSum(bytes: Uint8Array): number {
  let sum = 0;
  for (const byte of bytes) sum += byte;
  return sum;
}

describe("createStudioSpatterTipFieldV1", () => {
  it("래스터화하면 잉크가 있고 결정적이다", () => {
    const a = rasterizeStudioProceduralTip(48, createStudioSpatterTipFieldV1());
    const b = rasterizeStudioProceduralTip(48, createStudioSpatterTipFieldV1());
    expect(a.length).toBe(48 * 48);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(byteSum(a)).toBeGreaterThan(48 * 20);
    expect(Math.max(...a)).toBeGreaterThan(200);
  });

  it("시드가 다르면 다른 군집이다", () => {
    const a = rasterizeStudioProceduralTip(48, createStudioSpatterTipFieldV1({ seed: 1 }));
    const b = rasterizeStudioProceduralTip(48, createStudioSpatterTipFieldV1({ seed: 2 }));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("createStudioRakeTipFieldV1", () => {
  it("모서리는 비고 가운데 줄에 잉크가 있다", () => {
    const bytes = rasterizeStudioProceduralTip(48, createStudioRakeTipFieldV1());
    expect(bytes[0]).toBe(0);
    expect(byteSum(bytes)).toBeGreaterThan(0);
    const middleRow = bytes.slice(24 * 48, 25 * 48);
    expect(Math.max(...middleRow)).toBeGreaterThan(150);
  });
});

describe("createStudioGrassTipFieldV1", () => {
  it("위쪽 모서리는 비고 아래쪽에 잉크가 있다", () => {
    const bytes = rasterizeStudioProceduralTip(48, createStudioGrassTipFieldV1());
    expect(bytes[0]).toBe(0);
    const bottomRow = bytes.slice(47 * 48, 48 * 48);
    expect(byteSum(bottomRow)).toBeGreaterThan(0);
    expect(byteSum(bytes)).toBeGreaterThan(48 * 10);
  });
});

describe("createStudioSpatterTipFieldV1 seed separation", () => {
  it("한 비트만 다른 시드(42/43)도 짝수 개수에서 같은 군집이 되지 않는다", () => {
    const a = rasterizeStudioProceduralTip(48, createStudioSpatterTipFieldV1({ seed: 42, drops: 20 }));
    const b = rasterizeStudioProceduralTip(48, createStudioSpatterTipFieldV1({ seed: 43, drops: 20 }));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});
