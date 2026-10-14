import { describe, expect, it } from "vitest";

import {
  applyStudioBrushTextureV1,
  normalizeStudioBrushTextureDepthControlV1,
  normalizeStudioBrushTextureSettingsV1,
  resolveStudioBrushTextureControlledDabDepthV1,
  resolveStudioBrushTextureDabDepthV1,
  resolveStudioBrushTextureDepthControlResponseV1,
  studioBrushTextureDepthControlSampleFromDynamicsV1,
  studioBrushTextureIsPlainMultiplyV1,
} from "./studio-brush-texture-combine-v1";

describe("normalizeStudioBrushTextureDepthControlV1", () => {
  it("없거나 소스가 무효면 null이다(컨트롤만 탈락)", () => {
    expect(normalizeStudioBrushTextureDepthControlV1()).toBeNull();
    expect(normalizeStudioBrushTextureDepthControlV1(null)).toBeNull();
    expect(normalizeStudioBrushTextureDepthControlV1({ source: "not-a-source" })).toBeNull();
    const s = normalizeStudioBrushTextureSettingsV1({
      depth: 0.5,
      depthControl: { source: "bogus" },
    });
    expect(s.depthControl).toBeNull();
    expect(s.depth).toBe(0.5);
  });

  it("strength·curve는 범위로 클램프되고 기본값은 strength 1·curve 1이다", () => {
    const c = normalizeStudioBrushTextureDepthControlV1({ source: "pressure" });
    expect(c).toEqual({ source: "pressure", strength: 1, curve: 1, invert: false });
    const clamped = normalizeStudioBrushTextureDepthControlV1({
      source: "tilt",
      strength: 7,
      curve: 0,
      invert: true,
    });
    expect(clamped?.strength).toBe(1);
    expect(clamped?.curve).toBe(0.05);
    expect(clamped?.invert).toBe(true);
  });

  it("기본 정규화 설정의 depthControl은 null이다", () => {
    expect(normalizeStudioBrushTextureSettingsV1().depthControl).toBeNull();
  });
});

describe("resolveStudioBrushTextureDepthControlResponseV1", () => {
  it("pressure 선형: 응답은 곡선 적용된 소스값이다", () => {
    const c = normalizeStudioBrushTextureDepthControlV1({ source: "pressure" });
    expect(resolveStudioBrushTextureDepthControlResponseV1(c, { pressure: 0.25 })).toBeCloseTo(0.25);
    const curved = normalizeStudioBrushTextureDepthControlV1({ source: "pressure", curve: 2 });
    expect(resolveStudioBrushTextureDepthControlResponseV1(curved, { pressure: 0.5 })).toBeCloseTo(0.25);
  });

  it("invert는 곡선보다 먼저 적용된다", () => {
    const c = normalizeStudioBrushTextureDepthControlV1({ source: "speed", invert: true, curve: 2 });
    expect(resolveStudioBrushTextureDepthControlResponseV1(c, { speedNormalized: 0.5 })).toBeCloseTo(0.25);
  });

  it("샘플 없음·값 없음·strength 0이면 중립(null)이다", () => {
    const c = normalizeStudioBrushTextureDepthControlV1({ source: "pressure" });
    expect(resolveStudioBrushTextureDepthControlResponseV1(c, null)).toBeNull();
    expect(resolveStudioBrushTextureDepthControlResponseV1(c, {})).toBeNull();
    const zero = normalizeStudioBrushTextureDepthControlV1({ source: "pressure", strength: 0 });
    expect(resolveStudioBrushTextureDepthControlResponseV1(zero, { pressure: 1 })).toBeNull();
    expect(resolveStudioBrushTextureDepthControlResponseV1(null, { pressure: 1 })).toBeNull();
  });

  it("각도 소스는 활성 플래그가 없으면 중립이다(다이내믹스 sourceValue와 동일)", () => {
    const az = normalizeStudioBrushTextureDepthControlV1({ source: "tilt-azimuth" });
    expect(resolveStudioBrushTextureDepthControlResponseV1(az, { tiltAzimuthNormalized: 0.5 })).toBeNull();
    expect(
      resolveStudioBrushTextureDepthControlResponseV1(az, { tiltAzimuthNormalized: 0.5, hasTilt: true }),
    ).toBeCloseTo(0.5);
    const dir = normalizeStudioBrushTextureDepthControlV1({ source: "direction" });
    expect(resolveStudioBrushTextureDepthControlResponseV1(dir, { directionNormalized: 0.5 })).toBeNull();
    expect(
      resolveStudioBrushTextureDepthControlResponseV1(dir, { directionNormalized: 0.5, hasDirection: true }),
    ).toBeCloseTo(0.5);
  });
});

describe("resolveStudioBrushTextureControlledDabDepthV1", () => {
  it("샘플이 없으면 기존 해시 지터 경로와 정확히 같다(재현성)", () => {
    const s = normalizeStudioBrushTextureSettingsV1({
      depth: 0.8,
      depthJitter: 0.9,
      minimumDepth: 0.25,
      depthControl: { source: "pressure" },
    });
    for (let i = 0; i < 32; i += 1) {
      expect(resolveStudioBrushTextureControlledDabDepthV1(s, 7, i)).toBe(
        resolveStudioBrushTextureDabDepthV1(s, 7, i),
      );
      expect(resolveStudioBrushTextureControlledDabDepthV1(s, 7, i, {})).toBe(
        resolveStudioBrushTextureDabDepthV1(s, 7, i),
      );
    }
  });

  it("컨트롤이 없으면 샘플이 있어도 기존 경로와 정확히 같다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({ depth: 0.8, depthJitter: 0.9, minimumDepth: 0.25 });
    for (let i = 0; i < 16; i += 1) {
      expect(resolveStudioBrushTextureControlledDabDepthV1(s, 7, i, { pressure: 0 })).toBe(
        resolveStudioBrushTextureDabDepthV1(s, 7, i),
      );
    }
  });

  it("pressure 1이면 온전한 깊이, pressure 0·strength 1이면 하한 depth·minimumDepth에 정확히 닿는다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({
      depth: 0.8,
      minimumDepth: 0.25,
      depthControl: { source: "pressure", strength: 1 },
    });
    expect(resolveStudioBrushTextureControlledDabDepthV1(s, 3, 0, { pressure: 1 })).toBe(0.8);
    expect(resolveStudioBrushTextureControlledDabDepthV1(s, 3, 0, { pressure: 0 })).toBeCloseTo(0.8 * 0.25);
  });

  it("지터와 컨트롤이 겹쳐도 실효 깊이는 [depth·minimumDepth, depth]를 벗어나지 않고 결정적이다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({
      depth: 0.8,
      depthJitter: 0.9,
      minimumDepth: 0.25,
      depthControl: { source: "pressure", strength: 1 },
    });
    for (let i = 0; i < 32; i += 1) {
      for (const p of [0, 0.3, 1]) {
        const d = resolveStudioBrushTextureControlledDabDepthV1(s, 7, i, { pressure: p });
        expect(d).toBeGreaterThanOrEqual(0.8 * 0.25);
        expect(d).toBeLessThanOrEqual(0.8);
        expect(resolveStudioBrushTextureControlledDabDepthV1(s, 7, i, { pressure: p })).toBe(d);
      }
    }
  });

  it("strength는 컨트롤의 최대 감쇠를 정한다(strength 0.5·응답 0 → 배율 0.5, 하한보다 위)", () => {
    const s = normalizeStudioBrushTextureSettingsV1({
      depth: 0.8,
      minimumDepth: 0.1,
      depthControl: { source: "pressure", strength: 0.5 },
    });
    expect(resolveStudioBrushTextureControlledDabDepthV1(s, 3, 0, { pressure: 0 })).toBeCloseTo(0.4);
  });
});

describe("studioBrushTextureDepthControlSampleFromDynamicsV1", () => {
  it("다이내믹스 정규화 샘플의 각도를 0..1로 환산한다", () => {
    const sample = studioBrushTextureDepthControlSampleFromDynamicsV1({
      pressure: 0.4,
      speedNormalized: 0.2,
      tiltMagnitude: 0.5,
      tiltAzimuth: -90,
      twist: 180,
      direction: 270,
      hasTilt: true,
      hasDirection: true,
    });
    expect(sample.pressure).toBe(0.4);
    expect(sample.tiltAzimuthNormalized).toBeCloseTo(0.75);
    expect(sample.twistNormalized).toBeCloseTo(0.5);
    expect(sample.directionNormalized).toBeCloseTo(0.75);
    expect(sample.hasTilt).toBe(true);
  });

  it("빈 입력은 빈 샘플(전부 중립)이다", () => {
    expect(studioBrushTextureDepthControlSampleFromDynamicsV1(null)).toEqual({});
  });
});

describe("applyStudioBrushTextureV1 + 깊이 컨트롤", () => {
  it("샘플 생략 시 기존 전체 경로와 정확히 같다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({
      mode: "height",
      depth: 0.4,
      depthJitter: 0.5,
      depthControl: { source: "pressure" },
    });
    for (let i = 0; i < 16; i += 1) {
      expect(applyStudioBrushTextureV1(s, 0.9, 0.45, 123, i)).toBe(
        applyStudioBrushTextureV1(s, 0.9, 0.45, 123, i, null),
      );
    }
  });

  it("필압이 낮으면 height 텍스처가 옅어진다(닿는 골이 줄어든다)", () => {
    const s = normalizeStudioBrushTextureSettingsV1({
      mode: "height",
      depth: 0.4,
      depthControl: { source: "pressure", strength: 1 },
    });
    const strong = applyStudioBrushTextureV1(s, 1, 0.45, 5, 0, { pressure: 1 });
    const weak = applyStudioBrushTextureV1(s, 1, 0.45, 5, 0, { pressure: 0 });
    expect(strong).toBeGreaterThan(0);
    expect(weak).toBe(0);
  });

  it("깊이 컨트롤이 걸리면 plain multiply 패스트패스 판정에서 제외된다", () => {
    const plain = normalizeStudioBrushTextureSettingsV1({ depth: 0.7 });
    expect(studioBrushTextureIsPlainMultiplyV1(plain)).toBe(true);
    const controlled = normalizeStudioBrushTextureSettingsV1({
      depth: 0.7,
      depthControl: { source: "pressure" },
    });
    expect(studioBrushTextureIsPlainMultiplyV1(controlled)).toBe(false);
  });
});
