import { describe, expect, it } from "vitest";

import {
  measureStudioFrameBounds,
  registerStudioFrames,
  StudioFrameRegistry,
  STUDIO_FRAME_SOLID_ALPHA,
  type StudioFrameBounds,
} from "./studio-virtual-space-frame-registration";

/** 투명한 RGBA 이미지를 만들고 사각형을 지정한 알파로 채운다. */
function image(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  return {
    data,
    width,
    height,
    fill(x0: number, y0: number, x1: number, y1: number, alpha = 255) {
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data[(y * width + x) * 4 + 3] = alpha;
    },
  };
}

const FULL = (img: { width: number; height: number }) => ({ x: 0, y: 0, width: img.width, height: img.height });

describe("measureStudioFrameBounds", () => {
  it("단단한 알파의 위·아래 줄과 몸통 중심을 잰다", () => {
    const img = image(20, 20);
    img.fill(6, 4, 14, 18);
    const bounds = measureStudioFrameBounds(img.data, img.width, FULL(img))!;
    expect(bounds.top).toBe(4);
    expect(bounds.bottom).toBe(18);
    expect(bounds.torsoCenterX).toBeCloseTo(9.5, 5);
  });

  it("그림자처럼 옅은 알파는 외곽에 넣지 않는다", () => {
    const img = image(20, 20);
    img.fill(6, 4, 14, 16);
    img.fill(5, 16, 15, 19, STUDIO_FRAME_SOLID_ALPHA - 1);
    const bounds = measureStudioFrameBounds(img.data, img.width, FULL(img))!;
    expect(bounds.bottom).toBe(16);
  });

  it("몸통 중심은 다리가 벌어져도 상체 띠 기준으로 유지된다", () => {
    const img = image(40, 40);
    img.fill(14, 2, 26, 26); // 머리·몸통(중심 19.5)
    img.fill(4, 26, 12, 38); // 왼쪽으로 크게 벌린 다리
    img.fill(24, 26, 30, 38);
    const bounds = measureStudioFrameBounds(img.data, img.width, FULL(img))!;
    expect(bounds.torsoCenterX).toBeCloseTo(19.5, 1);
    expect(bounds.bottom).toBe(38);
  });

  it("시트 안의 한 프레임 영역만 잰다", () => {
    const img = image(80, 20);
    img.fill(4, 2, 10, 12);
    img.fill(44, 5, 50, 19);
    const second = measureStudioFrameBounds(img.data, img.width, { x: 40, y: 0, width: 40, height: 20 })!;
    expect(second.top).toBe(5);
    expect(second.bottom).toBe(19);
    // 프레임 안 열 4~9(전체 이미지 44~49)의 평균 x
    expect(second.torsoCenterX).toBeCloseTo(6.5, 5);
  });

  it("비어 있거나 잘못된 영역이면 null이다", () => {
    const img = image(10, 10);
    expect(measureStudioFrameBounds(img.data, img.width, FULL(img))).toBeNull();
    expect(measureStudioFrameBounds(img.data, 0, FULL(img))).toBeNull();
    expect(measureStudioFrameBounds(img.data, img.width, { x: 0, y: 0, width: 0, height: 4 })).toBeNull();
    expect(measureStudioFrameBounds(img.data, img.width, { x: Number.NaN, y: 0, width: 4, height: 4 })).toBeNull();
  });
});

describe("registerStudioFrames", () => {
  const frameWidth = 160;
  const frameHeight = 160;
  const stillOrigin = { x: 0.5, y: 0.9609375 };
  const still: StudioFrameBounds = { top: 4, bottom: 158, torsoCenterX: 78.7 };
  /** 프레임 하나를 화면에 놓았을 때 발바닥·몸통 중심·키가 놓이는 위치(시각 높이 131 기준, 앵커 0). */
  function placed(bounds: StudioFrameBounds, presentation: { originX: number; originY: number; displayHeightRatio: number } | null) {
    const visualHeight = 131;
    const scale = presentation ? visualHeight * presentation.displayHeightRatio / frameHeight : visualHeight / frameHeight;
    const originX = (presentation?.originX ?? stillOrigin.x) * frameWidth;
    const originY = (presentation?.originY ?? stillOrigin.y) * frameHeight;
    return {
      foot: (bounds.bottom - originY) * scale,
      center: (bounds.torsoCenterX - originX) * scale,
      height: (bounds.bottom - bounds.top) * scale,
    };
  }

  const walk: readonly StudioFrameBounds[] = [
    { top: 10, bottom: 154, torsoCenterX: 74.4 },
    { top: 10, bottom: 152, torsoCenterX: 82.2 },
    { top: 8, bottom: 157, torsoCenterX: 81.7 },
    { top: 7, bottom: 153, torsoCenterX: 81.6 },
  ];

  it("모든 프레임의 발바닥과 몸통 중심이 정지 그림과 같은 화면 위치에 놓인다", () => {
    const registered = registerStudioFrames({ frames: walk, still, frameWidth, frameHeight, stillOrigin })!;
    expect(registered).toHaveLength(4);
    const reference = placed(still, null);
    for (const [index, frame] of walk.entries()) {
      const result = placed(frame, registered[index]!);
      expect(result.foot).toBeCloseTo(reference.foot, 5);
      expect(result.center).toBeCloseTo(reference.center, 5);
    }
  });

  it("프레임들의 평균 키가 정지 그림 키와 같아지고 프레임 간 상대 높이는 유지된다", () => {
    const registered = registerStudioFrames({ frames: walk, still, frameWidth, frameHeight, stillOrigin })!;
    const heights = walk.map((frame, index) => placed(frame, registered[index]!).height);
    const mean = heights.reduce((sum, height) => sum + height, 0) / heights.length;
    expect(mean).toBeCloseTo(placed(still, null).height, 5);
    expect(new Set(registered.map((frame) => frame.displayHeightRatio)).size).toBe(1);
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights));
  });

  it("정지 그림보다 작게 그려진 시트는 키워 맞춘다", () => {
    const registered = registerStudioFrames({ frames: walk, still, frameWidth, frameHeight, stillOrigin })!;
    expect(registered[0]!.displayHeightRatio).toBeGreaterThan(1);
  });

  it("비정상적으로 큰 차이는 배율 범위로 제한한다", () => {
    const tiny: StudioFrameBounds = { top: 70, bottom: 90, torsoCenterX: 80 };
    const small = registerStudioFrames({ frames: [tiny], still, frameWidth, frameHeight, stillOrigin })!;
    expect(small[0]!.displayHeightRatio).toBe(1.3);
    const huge: StudioFrameBounds = { top: 0, bottom: 160, torsoCenterX: 80 };
    const tinyStill: StudioFrameBounds = { top: 70, bottom: 90, torsoCenterX: 80 };
    const large = registerStudioFrames({ frames: [huge], still: tinyStill, frameWidth, frameHeight, stillOrigin })!;
    expect(large[0]!.displayHeightRatio).toBe(0.8);
  });

  it("측정하지 못한 프레임은 기존 표시 좌표를 유지한다", () => {
    const fallback = [undefined, { originX: 0.5, originY: 0.95, displayHeightRatio: 0.96, seatOriginY: 0.82 }, undefined, undefined];
    const registered = registerStudioFrames({ frames: [walk[0]!, null, walk[2]!, walk[3]!], still, frameWidth, frameHeight, stillOrigin, fallback })!;
    expect(registered[1]).toEqual({ originX: 0.5, originY: 0.95, displayHeightRatio: 0.96, seatOriginY: 0.82 });
    expect(registered[0]!.displayHeightRatio).not.toBe(0.96);
  });

  it("쓸 수 있는 입력이 없으면 null이다", () => {
    expect(registerStudioFrames({ frames: [null, null], still, frameWidth, frameHeight, stillOrigin })).toBeNull();
    expect(registerStudioFrames({ frames: walk, still: { top: 5, bottom: 5, torsoCenterX: 1 }, frameWidth, frameHeight, stillOrigin })).toBeNull();
    expect(registerStudioFrames({ frames: walk, still, frameWidth: 0, frameHeight, stillOrigin })).toBeNull();
  });

  it("원점은 프레임 안의 합리적인 범위로 제한한다", () => {
    const odd: StudioFrameBounds = { top: 10, bottom: 150, torsoCenterX: 5 };
    const registered = registerStudioFrames({ frames: [odd], still, frameWidth, frameHeight, stillOrigin })!;
    expect(registered[0]!.originX).toBeGreaterThanOrEqual(0.2);
    expect(registered[0]!.originX).toBeLessThanOrEqual(0.8);
    expect(registered[0]!.originY).toBeGreaterThanOrEqual(0.5);
    expect(registered[0]!.originY).toBeLessThanOrEqual(1.1);
  });
});

describe("StudioFrameRegistry", () => {
  const geometry = { frameWidth: 160, frameHeight: 160 };
  const stillBounds: StudioFrameBounds = { top: 4, bottom: 158, torsoCenterX: 78.7 };
  const sheetBounds: readonly StudioFrameBounds[] = [
    { top: 10, bottom: 154, torsoCenterX: 74.4 }, { top: 10, bottom: 152, torsoCenterX: 82.2 },
  ];

  it("시트와 정지 그림이 모두 측정되기 전에는 null이다", () => {
    const registry = new StudioFrameRegistry();
    expect(registry.presentation("walk", "still", geometry)).toBeNull();
    registry.record("walk", sheetBounds);
    expect(registry.presentation("walk", "still", geometry)).toBeNull();
    registry.record("still", [stillBounds]);
    expect(registry.presentation("walk", "still", geometry)).toHaveLength(2);
  });

  it("같은 입력은 같은 결과 객체를 돌려준다(캐시)", () => {
    const registry = new StudioFrameRegistry();
    registry.record("walk", sheetBounds);
    registry.record("still", [stillBounds]);
    expect(registry.presentation("walk", "still", geometry)).toBe(registry.presentation("walk", "still", geometry));
  });

  it("다시 기록하거나 내리면 의존하던 계산을 비운다", () => {
    const registry = new StudioFrameRegistry();
    registry.record("walk", sheetBounds);
    registry.record("still", [stillBounds]);
    const first = registry.presentation("walk", "still", geometry);
    registry.record("still", [{ ...stillBounds, bottom: 150 }]);
    const second = registry.presentation("walk", "still", geometry);
    expect(second).not.toBe(first);
    expect(second?.[0]?.originY).not.toBe(first?.[0]?.originY);
    registry.forget("walk");
    expect(registry.has("walk")).toBe(false);
    expect(registry.presentation("walk", "still", geometry)).toBeNull();
  });
});
