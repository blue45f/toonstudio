import { afterEach, describe, expect, it } from "vitest";

import {
  applyStudioTactilePhysicalReliefToRgba,
  applyStudioTactileReliefToTileContext,
  cycleStudioTactileReliefMode,
  getStudioTactileReliefMode,
  hydrateInteractiveStudioTactileReliefMode,
  resetStudioTactileReliefRuntimeForTests,
  resolveStudioTactileReliefProfileForBrush,
  sampleDeterministicPaperToothHeight,
  setStudioTactileReliefMode,
} from "./studio-tactile-physical-relief-runtime";

function createSoftCircleRgba(
  size: number,
  color: readonly [number, number, number],
  maxAlpha = 235,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const cx = (size - 1) * 0.5;
  const cy = (size - 1) * 0.5;
  const radius = size * 0.36;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist >= radius) continue;
      const t = 1 - dist / radius;
      const smooth = t * t * (3 - 2 * t);
      const idx = (y * size + x) * 4;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = Math.round(smooth * maxAlpha);
    }
  }
  return rgba;
}

describe("studio-tactile-physical-relief-runtime", () => {
  afterEach(() => {
    resetStudioTactileReliefRuntimeForTests();
  });

  it("매체별 브러시 ID를 정확한 2.5D 실물 질감 프로파일로 매핑하고 선화 펜은 무변형으로 유지한다", () => {
    expect(resolveStudioTactileReliefProfileForBrush("oil")).toBe("impasto-oil");
    expect(resolveStudioTactileReliefProfileForBrush("watercolor")).toBe("watercolor-granulation");
    expect(resolveStudioTactileReliefProfileForBrush("ink-wash")).toBe("watercolor-granulation");
    expect(resolveStudioTactileReliefProfileForBrush("pencil")).toBe("dry-contact-tooth");
    expect(resolveStudioTactileReliefProfileForBrush("dry-media")).toBe("dry-contact-tooth");
    expect(resolveStudioTactileReliefProfileForBrush("pastel")).toBe("dry-contact-tooth");
    expect(resolveStudioTactileReliefProfileForBrush("brush")).toBe("wet-bristle-ink");
    expect(resolveStudioTactileReliefProfileForBrush("gpen")).toBe("none");
    expect(resolveStudioTactileReliefProfileForBrush("pen")).toBe("none");
  });

  it("단위 테스트 기본 모드는 off로 기존 바이트 동결 계약을 보존하고 대화형 하이드레이션 시 sculpted로 전환된다", () => {
    expect(getStudioTactileReliefMode()).toBe("off");
    expect(hydrateInteractiveStudioTactileReliefMode()).toBe("sculpted");
    expect(cycleStudioTactileReliefMode()).toBe("vivid");
    expect(cycleStudioTactileReliefMode()).toBe("off");
    expect(cycleStudioTactileReliefMode()).toBe("sculpted");
  });

  it("유화 임파스토(impasto-oil)는 좌상단 35° 측면 광원 쪽이 밝고 우하단 이랑이 어두운 실측 3D 명암 대비를 만든다", () => {
    const size = 64;
    const rgba = createSoftCircleRgba(size, [180, 96, 58], 240);
    const touched = applyStudioTactilePhysicalReliefToRgba(rgba, {
      width: size,
      height: size,
      profile: "impasto-oil",
      mode: "sculpted",
      worldOriginX: 10,
      worldOriginY: 20,
      worldScale: 1,
      paperSeed: 7,
    });
    expect(touched).toBeGreaterThan(200);

    // 좌상단(광원 방향) 경사 vs 우하단(그림자 방향) 경사 평균 휘도 비교
    let litSum = 0;
    let litCount = 0;
    let shadowSum = 0;
    let shadowCount = 0;
    const c = size * 0.5;
    for (let y = 14; y < size - 14; y += 1) {
      for (let x = 14; x < size - 14; x += 1) {
        const idx = (y * size + x) * 4;
        if ((rgba[idx + 3] ?? 0) < 90) continue;
        const luma = 0.299 * (rgba[idx] ?? 0) + 0.587 * (rgba[idx + 1] ?? 0) + 0.114 * (rgba[idx + 2] ?? 0);
        if (x < c - 3 && y < c - 3) {
          litSum += luma;
          litCount += 1;
        } else if (x > c + 3 && y > c + 3) {
          shadowSum += luma;
          shadowCount += 1;
        }
      }
    }
    expect(litCount).toBeGreaterThan(20);
    expect(shadowCount).toBeGreaterThan(20);
    expect(litSum / litCount).toBeGreaterThan(shadowSum / shadowCount + 8);
  });

  it("수채화(watercolor-granulation)는 가장자리 물고임(Coffee-Ring Backrun)이 중심부보다 진하게 응집된다", () => {
    const size = 64;
    // 내부는 평탄(alpha=200), 경계는 급격히 하강하는 수채 물웅덩이 마스크
    const rgba = new Uint8ClampedArray(size * size * 4);
    const c = (size - 1) * 0.5;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x - c, y - c);
        if (d > 22) continue;
        const a = d <= 17 ? 200 : Math.round(((22 - d) / 5) * 200);
        const idx = (y * size + x) * 4;
        rgba[idx] = 88;
        rgba[idx + 1] = 152;
        rgba[idx + 2] = 224;
        rgba[idx + 3] = a;
      }
    }
    applyStudioTactilePhysicalReliefToRgba(rgba, {
      width: size,
      height: size,
      profile: "watercolor-granulation",
      mode: "vivid",
      paperSeed: 11,
    });

    let centerLuma = 0;
    let centerCount = 0;
    let rimLuma = 0;
    let rimCount = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x - c, y - c);
        const idx = (y * size + x) * 4;
        if ((rgba[idx + 3] ?? 0) < 40) continue;
        const luma = 0.299 * (rgba[idx] ?? 0) + 0.587 * (rgba[idx + 1] ?? 0) + 0.114 * (rgba[idx + 2] ?? 0);
        if (d < 9) {
          centerLuma += luma;
          centerCount += 1;
        } else if (d >= 17.5 && d <= 20.5) {
          rimLuma += luma;
          rimCount += 1;
        }
      }
    }
    expect(centerCount).toBeGreaterThan(20);
    expect(rimCount).toBeGreaterThan(20);
    // 가장자리가 중심보다 눈에 띄게 어둡고 진하게 응집됨
    expect(rimLuma / rimCount).toBeLessThan(centerLuma / centerCount - 10);
  });

  it("연필·목탄(dry-contact-tooth)은 종이 봉우리(Peak)에 더 진하게 남고 골짜기(Valley)에 미세 여백을 만든다", () => {
    const size = 48;
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
      rgba[i * 4] = 64;
      rgba[i * 4 + 1] = 64;
      rgba[i * 4 + 2] = 68;
      rgba[i * 4 + 3] = 140;
    }
    applyStudioTactilePhysicalReliefToRgba(rgba, {
      width: size,
      height: size,
      profile: "dry-contact-tooth",
      mode: "sculpted",
      worldOriginX: 0,
      worldOriginY: 0,
      worldScale: 1,
      paperSeed: 19,
    });

    let peakAlpha = 0;
    let peakCount = 0;
    let valleyAlpha = 0;
    let valleyCount = 0;
    for (let y = 2; y < size - 2; y += 1) {
      for (let x = 2; x < size - 2; x += 1) {
        const tooth = sampleDeterministicPaperToothHeight(x, y, 19);
        const a = rgba[(y * size + x) * 4 + 3] ?? 0;
        if (tooth > 0.62) {
          peakAlpha += a;
          peakCount += 1;
        } else if (tooth < 0.38) {
          valleyAlpha += a;
          valleyCount += 1;
        }
      }
    }
    expect(peakCount).toBeGreaterThan(10);
    expect(valleyCount).toBeGreaterThan(10);
    expect(peakAlpha / peakCount).toBeGreaterThan(valleyAlpha / valleyCount + 8);
  });

  it("스텁 컨텍스트(getImageData 부재)나 off 모드에서는 안전하게 원본 픽셀을 건드리지 않고 false를 반환한다", () => {
    setStudioTactileReliefMode("off");
    expect(
      applyStudioTactileReliefToTileContext({}, {
        width: 32,
        height: 32,
        brushIdOrFamily: "oil",
        worldOriginX: 0,
        worldOriginY: 0,
        worldScale: 1,
      }),
    ).toBe(false);

    setStudioTactileReliefMode("sculpted");
    expect(
      applyStudioTactileReliefToTileContext({}, {
        width: 32,
        height: 32,
        brushIdOrFamily: "oil",
        worldOriginX: 0,
        worldOriginY: 0,
        worldScale: 1,
      }),
    ).toBe(false);
  });
});
