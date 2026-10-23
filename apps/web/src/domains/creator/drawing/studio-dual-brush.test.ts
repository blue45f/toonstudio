import { describe, expect, it } from "vitest";

import {
  STUDIO_DUAL_BRUSH_COMBOS,
  STUDIO_DUAL_BRUSH_TEXTURES,
  STUDIO_EXPRESSIVE_DUAL_BRUSH_PROFILES,
  applyDualBrushStrength,
  blendDualBrushValue,
  clearDualBrushTileCache,
  compositeDualBrushFloatBuffer,
  evaluateDynamicDualBrushModulation,
  generateTextureTile,
  getCachedTextureTile,
  getDualBrushCombo,
  getDualBrushTexture,
  getDualBrushTileCacheStats,
  getExpressiveDualBrushProfile,
  validateDualBrushConfig,
  type StudioDualBrushConfig,
} from "./studio-dual-brush";

const validConfig: StudioDualBrushConfig = {
  baseBrushId: "charcoal",
  textureId: "fibers",
  blendMode: "overlay",
  textureStrength: 0.65,
  textureScale: 0.8,
};

describe("STUDIO_DUAL_BRUSH_TEXTURES", () => {
  it("절차적 질감 6종이 있다", () => {
    expect(STUDIO_DUAL_BRUSH_TEXTURES).toHaveLength(6);
  });

  it("id가 고유하고 한/영 라벨과 설명이 있다", () => {
    const ids = STUDIO_DUAL_BRUSH_TEXTURES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of STUDIO_DUAL_BRUSH_TEXTURES) {
      expect(t.labelKo.length).toBeGreaterThan(0);
      expect(t.labelEn.length).toBeGreaterThan(0);
      expect(t.descriptionKo.length).toBeGreaterThan(0);
      expect(t.tileSize).toBeGreaterThan(0);
    }
  });
});

describe("getDualBrushTexture", () => {
  it("id로 질감을 찾는다", () => {
    expect(getDualBrushTexture("paper")?.labelKo).toBe("종이결");
  });

  it("없는 id는 undefined를 반환한다", () => {
    // @ts-expect-error - 잘못된 id 입력 테스트
    expect(getDualBrushTexture("nope")).toBeUndefined();
  });
});

describe("validateDualBrushConfig", () => {
  it("유효한 설정은 ok", () => {
    expect(validateDualBrushConfig(validConfig).ok).toBe(true);
  });

  it("범위를 벗어난 강도·스케일을 잡는다", () => {
    const r1 = validateDualBrushConfig({ ...validConfig, textureStrength: 1.5 });
    expect(r1.ok).toBe(false);
    expect(r1.errors.length).toBeGreaterThan(0);
    const r2 = validateDualBrushConfig({ ...validConfig, textureScale: 0.1 });
    expect(r2.ok).toBe(false);
    const r3 = validateDualBrushConfig({ ...validConfig, textureScale: 5 });
    expect(r3.ok).toBe(false);
  });

  it("알 수 없는 결합 모드를 잡는다", () => {
    // @ts-expect-error - 잘못된 모드 입력 테스트
    const r = validateDualBrushConfig({ ...validConfig, blendMode: "dodge" });
    expect(r.ok).toBe(false);
  });
});

describe("STUDIO_DUAL_BRUSH_COMBOS", () => {
  it("조합 프리셋 3종이 있다", () => {
    expect(STUDIO_DUAL_BRUSH_COMBOS).toHaveLength(3);
  });

  it("모든 조합 설정이 유효하다", () => {
    for (const combo of STUDIO_DUAL_BRUSH_COMBOS) {
      expect(validateDualBrushConfig(combo.config).ok).toBe(true);
      expect(combo.labelKo.length).toBeGreaterThan(0);
      expect(combo.labelEn.length).toBeGreaterThan(0);
    }
  });

  it("'털 브러시 + 빳빳한 결' 조합이 존재한다", () => {
    const combo = getDualBrushCombo("bristle-fibers");
    expect(combo?.config.baseBrushId).toBe("charcoal");
    expect(combo?.config.textureId).toBe("fibers");
  });
});

describe("generateTextureTile", () => {
  it("타일 크기와 값 범위가 올바르다", () => {
    const tile = generateTextureTile("paper", { size: 32 });
    expect(tile).toHaveLength(32 * 32);
    let min = Infinity;
    let max = -Infinity;
    for (const v of tile) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
  });

  it("같은 시드는 같은 타일을 만든다 (결정적)", () => {
    const a = generateTextureTile("sand", { size: 32, seed: 42 });
    const b = generateTextureTile("sand", { size: 32, seed: 42 });
    expect(a).toEqual(b);
  });

  it("다른 질감은 다른 패턴을 만든다", () => {
    const paper = generateTextureTile("paper", { size: 32, seed: 7 });
    const mesh = generateTextureTile("mesh", { size: 32, seed: 7 });
    let diff = 0;
    for (let i = 0; i < paper.length; i += 1) diff += Math.abs(paper[i] - mesh[i]);
    expect(diff / paper.length).toBeGreaterThan(0.01);
  });

  it("섬유결은 방향성이 있다 (가로 결: 행 간 분산이 크다)", () => {
    const tile = generateTextureTile("fibers", { size: 64, seed: 3 });
    // 같은 행 평균들의 분산 vs 같은 열 평균들의 분산
    const rowMeans: number[] = [];
    const colMeans: number[] = [];
    for (let y = 0; y < 64; y += 1) {
      let s = 0;
      for (let x = 0; x < 64; x += 1) s += tile[y * 64 + x];
      rowMeans.push(s / 64);
    }
    for (let x = 0; x < 64; x += 1) {
      let s = 0;
      for (let y = 0; y < 64; y += 1) s += tile[y * 64 + x];
      colMeans.push(s / 64);
    }
    const variance = (arr: number[]): number => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    };
    // 섬유결은 x축 방향 가로 결: 행 평균들의 분산(행 간 변화)이 크다
    expect(variance(rowMeans)).toBeGreaterThan(variance(colMeans) * 2);
  });
});

describe("blendDualBrushValue", () => {
  it("multiply는 어둡게", () => {
    expect(blendDualBrushValue(0.5, 0.5, "multiply")).toBeCloseTo(0.25, 5);
  });

  it("screen은 밝게", () => {
    expect(blendDualBrushValue(0.5, 0.5, "screen")).toBeCloseTo(0.75, 5);
  });

  it("overlay 경계값", () => {
    expect(blendDualBrushValue(0, 0.7, "overlay")).toBeCloseTo(0, 5);
    expect(blendDualBrushValue(1, 0.3, "overlay")).toBeCloseTo(1, 5);
  });

  it("범위를 벗어난 입력은 클램프된다", () => {
    expect(blendDualBrushValue(2, -1, "multiply")).toBeCloseTo(0, 5);
  });
});

describe("applyDualBrushStrength", () => {
  it("strength 0이면 원본, 1이면 결합 결과", () => {
    expect(applyDualBrushStrength(0.4, 0.9, 0)).toBeCloseTo(0.4, 5);
    expect(applyDualBrushStrength(0.4, 0.9, 1)).toBeCloseTo(0.9, 5);
    expect(applyDualBrushStrength(0.4, 0.9, 0.5)).toBeCloseTo(0.65, 5);
  });
});

describe("getCachedTextureTile & compositeDualBrushFloatBuffer", () => {
  it("메모이제이션 캐시가 동일 질감 타일 참조를 재사용하고 히트율을 기록한다", () => {
    clearDualBrushTileCache();
    const first = getCachedTextureTile("paper", { size: 32, seed: 99 });
    const second = getCachedTextureTile("paper", { size: 32, seed: 99 });
    expect(first).toBe(second);
    const stats = getDualBrushTileCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5, 5);
  });

  it("linear-burn 및 hard-light 모드를 지원하고 순수 Float32 버퍼 합성을 수행한다", () => {
    expect(blendDualBrushValue(0.6, 0.7, "linear-burn")).toBeCloseTo(0.3, 5);
    expect(blendDualBrushValue(0.6, 0.25, "hard-light")).toBeCloseTo(0.3, 5);
    expect(blendDualBrushValue(0.6, 0.75, "hard-light")).toBeCloseTo(0.8, 5);

    const tile = getCachedTextureTile("canvas-weave", { size: 16, seed: 11 });
    const mask = new Float32Array(16 * 16).fill(0.8);
    mask[0] = 0;
    const out = compositeDualBrushFloatBuffer(mask, tile, 16, 16, 16, {
      blendMode: "linear-burn",
      textureStrength: 0.7,
      textureScale: 1,
    });
    expect(out[0]).toBe(0);
    expect(out[5]).toBeGreaterThan(0);
    expect(out[5]).toBeLessThan(0.8);
  });
});

describe("STUDIO_EXPRESSIVE_DUAL_BRUSH_PROFILES & evaluateDynamicDualBrushModulation", () => {
  it("6종의 표현력 특화 듀얼 브러시 개성 프로파일이 모두 유효한 설정을 갖는다", () => {
    expect(STUDIO_EXPRESSIVE_DUAL_BRUSH_PROFILES).toHaveLength(6);
    for (const profile of STUDIO_EXPRESSIVE_DUAL_BRUSH_PROFILES) {
      expect(validateDualBrushConfig(profile.config).ok).toBe(true);
      expect(getExpressiveDualBrushProfile(profile.id)).toEqual(profile);
    }
  });

  it("저필압·고속·고틸트에서는 종이 산 스침(paperToothCutoff01)과 이방성 늘어남이 증가하고 고필압에서는 골 메움(valleyFillRatio01)이 증가한다", () => {
    const lightFastGrazing = evaluateDynamicDualBrushModulation({
      profileId: "sumi-dry-rake",
      pressure01: 0.15,
      velocity01: 0.9,
      tilt01: 0.8,
    });
    const heavySlowSaturated = evaluateDynamicDualBrushModulation({
      profileId: "sumi-dry-rake",
      pressure01: 0.95,
      velocity01: 0.1,
      tilt01: 0.05,
    });

    expect(lightFastGrazing.paperToothCutoff01).toBeGreaterThan(
      heavySlowSaturated.paperToothCutoff01 * 3,
    );
    expect(heavySlowSaturated.valleyFillRatio01).toBeGreaterThan(
      lightFastGrazing.valleyFillRatio01 * 5,
    );
    expect(lightFastGrazing.effectiveTextureStrength).toBeGreaterThan(
      heavySlowSaturated.effectiveTextureStrength,
    );
    expect(lightFastGrazing.anisotropicScaleX).toBeGreaterThan(
      heavySlowSaturated.anisotropicScaleX,
    );
  });
});

