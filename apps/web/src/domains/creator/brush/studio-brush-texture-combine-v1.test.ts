import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1,
  applyStudioBrushTextureV1,
  combineStudioBrushTextureCoverageV1,
  normalizeStudioBrushTextureSettingsV1,
  resolveStudioBrushTextureDabDepthV1,
  resolveStudioBrushTextureLevelV1,
} from "./studio-brush-texture-combine-v1";

describe("normalizeStudioBrushTextureSettingsV1", () => {
  it("기본값은 multiply·depth 1·무조정이다", () => {
    const s = normalizeStudioBrushTextureSettingsV1();
    expect(s.mode).toBe("multiply");
    expect(s.depth).toBe(1);
    expect(s.depthJitter).toBe(0);
    expect(s.brightness).toBe(0);
    expect(s.contrast).toBe(0);
    expect(s.invert).toBe(false);
  });

  it("범위 밖 숫자는 클램프하고 무효 모드는 multiply로 떨어진다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({
      mode: "not-a-mode",
      depth: 7,
      brightness: -3,
      contrast: Number.NaN,
    });
    expect(s.mode).toBe("multiply");
    expect(s.depth).toBe(1);
    expect(s.brightness).toBe(-1);
    expect(s.contrast).toBe(0);
  });
});

describe("resolveStudioBrushTextureLevelV1", () => {
  it("무조정이면 항등이다", () => {
    const s = normalizeStudioBrushTextureSettingsV1();
    expect(resolveStudioBrushTextureLevelV1(s, 0.3)).toBeCloseTo(0.3);
  });

  it("invert는 마지막에 뒤집는다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({ invert: true });
    expect(resolveStudioBrushTextureLevelV1(s, 0.3)).toBeCloseTo(0.7);
  });

  it("brightness +1은 값을 150/255만큼 올린다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({ brightness: 1 });
    expect(resolveStudioBrushTextureLevelV1(s, 0)).toBeCloseTo(150 / 255);
  });
});

describe("resolveStudioBrushTextureDabDepthV1", () => {
  it("jitter 0이면 항상 설정 깊이(항등)", () => {
    const s = normalizeStudioBrushTextureSettingsV1({ depth: 0.6 });
    for (let i = 0; i < 8; i += 1) {
      expect(resolveStudioBrushTextureDabDepthV1(s, 42, i)).toBe(0.6);
    }
  });

  it("jitter가 있어도 [depth·minimumDepth, depth] 안에 있고 결정적이다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({ depth: 0.8, depthJitter: 0.9, minimumDepth: 0.25 });
    const seen = new Set<number>();
    for (let i = 0; i < 32; i += 1) {
      const d = resolveStudioBrushTextureDabDepthV1(s, 7, i);
      expect(d).toBeGreaterThanOrEqual(0.8 * 0.25);
      expect(d).toBeLessThanOrEqual(0.8);
      expect(resolveStudioBrushTextureDabDepthV1(s, 7, i)).toBe(d);
      seen.add(d);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("combineStudioBrushTextureCoverageV1", () => {
  it("모든 모드가 빈 커버리지에 잉크를 만들지 않는다", () => {
    for (const mode of STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1) {
      expect(combineStudioBrushTextureCoverageV1(mode, 0, 0.4, 1)).toBe(0);
    }
  });

  it("multiply는 t=1에서 항등, depth 0에서 항등이다", () => {
    expect(combineStudioBrushTextureCoverageV1("multiply", 0.7, 1, 0.8)).toBeCloseTo(0.7);
    expect(combineStudioBrushTextureCoverageV1("multiply", 0.7, 0.2, 0)).toBeCloseTo(0.7);
  });

  it("subtract는 밝은 패턴이 가장 많이 덜어낸다", () => {
    expect(combineStudioBrushTextureCoverageV1("subtract", 0.7, 1, 1)).toBe(0);
    expect(combineStudioBrushTextureCoverageV1("subtract", 0.7, 0, 1)).toBeCloseTo(0.7);
  });

  it("hard-mix는 합이 1을 넘으면 1, 아니면 0으로 포스터화한다", () => {
    expect(combineStudioBrushTextureCoverageV1("hard-mix", 0.6, 0.6, 1)).toBe(1);
    expect(combineStudioBrushTextureCoverageV1("hard-mix", 0.3, 0.3, 1)).toBe(0);
  });

  it("height는 낮은 깊이에서 어두운 골에만 닿고, 깊으면 전면이 남는다", () => {
    // depth 0.05 → reach = 12·(13/255)·1 ≈ 0.61: t=0.2는 닿고(0.41) t=0.9는 못 닿는다(0).
    expect(combineStudioBrushTextureCoverageV1("height", 1, 0.2, 0.05)).toBeCloseTo(12 * (13 / 255) - 0.2);
    expect(combineStudioBrushTextureCoverageV1("height", 1, 0.9, 0.05)).toBe(0);
    // depth 1이면 reach 12 — 어떤 패턴 값에서도 전면 커버리지.
    expect(combineStudioBrushTextureCoverageV1("height", 0.8, 0.99, 1)).toBe(1);
  });

  it("linear-height는 닿는 높이가 낮으면 패턴만큼 페이드한다", () => {
    const reach = 12 * (13 / 255) * 1;
    expect(combineStudioBrushTextureCoverageV1("linear-height", 1, 0.25, 0.05)).toBeCloseTo(reach * 0.75);
  });

  it("결과는 항상 0..1이다", () => {
    for (const mode of STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1) {
      for (const t of [0, 0.37, 1]) {
        const out = combineStudioBrushTextureCoverageV1(mode, 0.83, t, 0.9);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("applyStudioBrushTextureV1", () => {
  it("전체 경로가 결정적이고 0..1을 돌려준다", () => {
    const s = normalizeStudioBrushTextureSettingsV1({
      mode: "height",
      depth: 0.4,
      depthJitter: 0.5,
      brightness: 0.2,
      contrast: 0.3,
    });
    const a = applyStudioBrushTextureV1(s, 0.9, 0.45, 123, 5);
    const b = applyStudioBrushTextureV1(s, 0.9, 0.45, 123, 5);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });
});
