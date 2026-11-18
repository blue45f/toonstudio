import { describe, expect, it } from "vitest";

import {
  applyInflateFilter,
  computeAlphaSilhouetteDistance,
} from "./studio-inflate-filter";

import type { StudioImageDataLike } from "../studio-filters";

function createCircleImage(size: number, radius: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - c, y - c);
      const off = (y * size + x) * 4;
      if (d <= radius) {
        data[off] = 150;
        data[off + 1] = 150;
        data[off + 2] = 180;
        data[off + 3] = x === Math.round(c) && y === Math.round(c) ? 213 : 255;
      }
    }
  }
  return { width: size, height: size, data };
}

describe("studio-inflate-filter", () => {
  it("알파 실루엣 유클리드 거리 변환이 외곽에서 중심으로 단조 증가한다", () => {
    const img = createCircleImage(25, 9);
    const dist = computeAlphaSilhouetteDistance(img.data, 25, 25);
    expect(dist[0]).toBe(0);
    expect(dist[12 * 25 + 12]!).toBeGreaterThan(dist[12 * 25 + 4]!);
  });

  it("광원 방향 쪽 사면은 밝아지고 반대쪽 사면은 어두워지며 알파는 바이트 단위로 보존된다", () => {
    const src = createCircleImage(29, 11);
    const out = applyInflateFilter(src, {
      heightLimit: 0.85,
      smoothingRadius: 2,
      lightX: -0.7,
      lightY: -0.7,
      shininess: 32,
      strength: 0.9,
    });

    // 모든 픽셀의 알파 채널이 바이트 단위로 완벽히 보존되는지 확인
    for (let p = 0; p < 29 * 29; p += 1) {
      expect(out.data[p * 4 + 3]).toBe(src.data[p * 4 + 3]);
    }

    // 좌상단 광원(-0.7, -0.7) 쪽 사면 (9, 9) vs 우하단 그림자 사면 (19, 19)
    const litSlopeOff = (9 * 29 + 9) * 4;
    const shadowSlopeOff = (19 * 29 + 19) * 4;
    expect(out.data[litSlopeOff]!).toBeGreaterThan(out.data[shadowSlopeOff]!);
  });

  it("strength=0 이면 원본 RGBA를 무손실로 반환하고, 낮은 heightLimit은 중심 고원을 평탄화한다", () => {
    const src = createCircleImage(25, 9);
    const zero = applyInflateFilter(src, { strength: 0 });
    expect([...zero.data]).toEqual([...src.data]);

    const flatPlateau = applyInflateFilter(src, {
      heightLimit: 0.2,
      smoothingRadius: 1,
      lightX: -0.6,
      lightY: 0,
      strength: 0.8,
    });
    const fullDome = applyInflateFilter(src, {
      heightLimit: 1.0,
      smoothingRadius: 1,
      lightX: -0.6,
      lightY: 0,
      strength: 0.8,
    });
    // 낮은 heightLimit에서는 중앙 부근 기울기가 0에 가까워져 중심 좌우 명암차가 줄어든다.
    const flatDiff = Math.abs(
      flatPlateau.data[(12 * 25 + 10) * 4]! - flatPlateau.data[(12 * 25 + 14) * 4]!,
    );
    const domeDiff = Math.abs(
      fullDome.data[(12 * 25 + 10) * 4]! - fullDome.data[(12 * 25 + 14) * 4]!,
    );
    expect(flatDiff).toBeLessThan(domeDiff);
  });
});
