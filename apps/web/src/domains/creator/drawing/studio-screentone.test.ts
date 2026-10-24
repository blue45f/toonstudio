import { describe, expect, it } from "vitest";

import {
  STUDIO_SCREENTONE_LIMITS,
  STUDIO_SCREENTONE_PRESETS,
  applyScreentoneScrapingDab,
  buildAntiAliasedScreentoneTile,
  buildSandNoiseScreentoneTile,
  buildScreentoneTile,
  evaluateScreentoneMoireSuppression,
  hexToRgb,
  measureScreentoneCoverage,
  validateScreentoneConfig,
  type ScreentoneConfig,
} from "./studio-screentone";

const valid: ScreentoneConfig = {
  pattern: "dot",
  density: 30,
  lines: 24,
  angleDeg: 45,
};

describe("STUDIO_SCREENTONE_PRESETS", () => {
  it("시작 프리셋 4종이 있다", () => {
    expect(STUDIO_SCREENTONE_PRESETS).toHaveLength(4);
  });

  it("모든 프리셋 설정이 유효하다", () => {
    for (const preset of STUDIO_SCREENTONE_PRESETS) {
      expect(validateScreentoneConfig(preset.config).ok).toBe(true);
      expect(preset.labelKo.length).toBeGreaterThan(0);
      expect(preset.labelEn.length).toBeGreaterThan(0);
    }
  });
});

describe("validateScreentoneConfig", () => {
  it("유효한 설정은 ok", () => {
    expect(validateScreentoneConfig(valid).ok).toBe(true);
  });

  it("농도 범위를 벗어나면 실패", () => {
    expect(validateScreentoneConfig({ ...valid, density: 5 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, density: 90 }).ok).toBe(false);
  });

  it("선 수는 정수 범위", () => {
    expect(validateScreentoneConfig({ ...valid, lines: 7 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, lines: 73 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, lines: 24.5 }).ok).toBe(false);
  });

  it("각도 범위", () => {
    expect(validateScreentoneConfig({ ...valid, angleDeg: -1 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, angleDeg: 181 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, angleDeg: 180 }).ok).toBe(true);
  });

  it("한계값이 명세(10~80%)와 일치", () => {
    expect(STUDIO_SCREENTONE_LIMITS.minDensity).toBe(10);
    expect(STUDIO_SCREENTONE_LIMITS.maxDensity).toBe(80);
  });
});

describe("buildScreentoneTile", () => {
  it("도트 타일의 실제 커버리지가 설정 농도와 근사하다", () => {
    const tile = buildScreentoneTile(
      { pattern: "dot", density: 30, lines: 20, angleDeg: 0 },
      { size: 200 },
    );
    const coverage = measureScreentoneCoverage(tile);
    // 격자 양자화 오차 허용 ±6%p
    expect(Math.abs(coverage - 0.3)).toBeLessThan(0.06);
  });

  it("농도가 높을수록 커버리지가 크다", () => {
    const low = measureScreentoneCoverage(
      buildScreentoneTile({ ...valid, density: 20 }, { size: 120 }),
    );
    const high = measureScreentoneCoverage(
      buildScreentoneTile({ ...valid, density: 70 }, { size: 120 }),
    );
    expect(high).toBeGreaterThan(low);
  });

  it("선 패턴의 커버리지도 농도를 따른다", () => {
    const tile = buildScreentoneTile(
      { pattern: "line", density: 50, lines: 20, angleDeg: 0 },
      { size: 200 },
    );
    const coverage = measureScreentoneCoverage(tile);
    expect(Math.abs(coverage - 0.5)).toBeLessThan(0.06);
  });

  it("크로스 패턴이 생성되고 값이 0/1이다", () => {
    const tile = buildScreentoneTile(
      { pattern: "cross", density: 40, lines: 16, angleDeg: 45 },
      { size: 96 },
    );
    expect(tile.length).toBe(96 * 96);
    let invalid = 0;
    for (const v of tile) {
      if (v !== 0 && v !== 1) invalid += 1;
    }
    expect(invalid).toBe(0);
    const coverage = measureScreentoneCoverage(tile);
    expect(coverage).toBeGreaterThan(0.2);
    expect(coverage).toBeLessThan(0.7);
  });

  it("타일 크기가 클램프된다", () => {
    expect(buildScreentoneTile(valid, { size: 4 }).length).toBe(16 * 16);
    expect(buildScreentoneTile(valid, { size: 1000 }).length).toBe(512 * 512);
  });

  it("빈 타일의 커버리지는 0", () => {
    expect(measureScreentoneCoverage(new Float32Array(0))).toBe(0);
  });
});

describe("hexToRgb", () => {
  it("#rrggbb를 파싱한다", () => {
    expect(hexToRgb("#1a2b3c")).toEqual([26, 43, 60]);
  });

  it("잘못된 입력은 검정으로", () => {
    expect(hexToRgb("zzz")).toEqual([0, 0, 0]);
  });
});

describe("evaluateScreentoneMoireSuppression / buildAntiAliasedScreentoneTile", () => {
  it("줌 축소 시 나이퀴스트 모아레 에일리어싱 위험도와 안티에일리어싱 대역폭이 증가한다", () => {
    const highZoom = evaluateScreentoneMoireSuppression(
      { pattern: "dot", density: 40, lines: 48, angleDeg: 45 },
      2.0,
    );
    const lowZoom = evaluateScreentoneMoireSuppression(
      { pattern: "dot", density: 40, lines: 48, angleDeg: 45 },
      0.35,
    );
    expect(lowZoom.aliasingRisk).toBeGreaterThan(highZoom.aliasingRisk);
    expect(lowZoom.antiAliasBandWidthPx).toBeGreaterThan(highZoom.antiAliasBandWidthPx);
    expect(lowZoom.recommendedRosetteAngleDeg).toBe(45);
  });

  it("서브픽셀 AA 스크린톤 타일은 경계 그레이스케일(0 < v < 1)을 포함하고 수직 그라데이션 에칭을 지원한다", () => {
    const aaTile = buildAntiAliasedScreentoneTile(
      { pattern: "dot", density: 45, lines: 16, angleDeg: 45 },
      { size: 96, zoomScale: 0.5, gradientDirection: "vertical", gradientStrength: 0.7 },
    );
    let fractionalSamples = 0;
    let topHalfSum = 0;
    let bottomHalfSum = 0;
    const halfIdx = (96 * 96) / 2;
    for (let i = 0; i < aaTile.length; i += 1) {
      const v = aaTile[i]!;
      if (v > 0.02 && v < 0.98) fractionalSamples += 1;
      if (i < halfIdx) topHalfSum += v;
      else bottomHalfSum += v;
    }
    expect(fractionalSamples).toBeGreaterThan(50);
    // 수직 그라데이션(상단 에칭 감쇠 → 하단 진함)
    expect(bottomHalfSum).toBeGreaterThan(topHalfSum * 1.25);
  });

  it("CSP 다중 망점 모양(circle / diamond / square / star) SDF가 면적 보정된 커버리지와 고유 기하 분포를 생성한다", () => {
    const cfg: ScreentoneConfig = { pattern: "dot", density: 35, lines: 12, angleDeg: 0 };
    const circle = buildAntiAliasedScreentoneTile(cfg, { size: 120, spotShape: "circle" });
    const diamond = buildAntiAliasedScreentoneTile(cfg, { size: 120, spotShape: "diamond" });
    const square = buildAntiAliasedScreentoneTile(cfg, { size: 120, spotShape: "square" });
    const star = buildAntiAliasedScreentoneTile(cfg, { size: 120, spotShape: "star" });

    for (const tile of [circle, diamond, square, star]) {
      const cov = measureScreentoneCoverage(tile);
      expect(cov).toBeGreaterThan(0.24);
      expect(cov).toBeLessThan(0.46);
    }

    // 서로 다른 망점 기하 형태는 픽셀 분포가 구별되어야 함
    let diffCircleStar = 0;
    let diffDiamondSquare = 0;
    for (let i = 0; i < circle.length; i += 1) {
      diffCircleStar += Math.abs(circle[i]! - star[i]!);
      diffDiamondSquare += Math.abs(diamond[i]! - square[i]!);
    }
    expect(diffCircleStar / circle.length).toBeGreaterThan(0.02);
    expect(diffDiamondSquare / circle.length).toBeGreaterThan(0.02);
  });
});

describe("buildSandNoiseScreentoneTile & applyScreentoneScrapingDab (Wave 11)", () => {
  it("CSP 사목(Sand/Mezzotint) 노이즈 스크린톤이 결정론적이며 농도 단조성을 만족한다", () => {
    const sandLow = buildSandNoiseScreentoneTile({ size: 96, density: 20, grainScale: 2, seed: 77 });
    const sandLowRepeat = buildSandNoiseScreentoneTile({ size: 96, density: 20, grainScale: 2, seed: 77 });
    const sandHigh = buildSandNoiseScreentoneTile({ size: 96, density: 65, grainScale: 2, seed: 77 });

    expect(sandLow).toEqual(sandLowRepeat);
    const covLow = measureScreentoneCoverage(sandLow);
    const covHigh = measureScreentoneCoverage(sandHigh);
    expect(covLow).toBeGreaterThan(0.08);
    expect(covHigh).toBeGreaterThan(covLow + 0.25);
  });

  it("케즈리(톤 깎기: scrape)와 톤 덧칠(darken) 브러시 댑이 반경 내 농도를 부드럽게 변조하고 타일 래핑을 지원한다", () => {
    const base = buildAntiAliasedScreentoneTile(
      { pattern: "dot", density: 50, lines: 16, angleDeg: 45 },
      { size: 80 },
    );
    const baseCov = measureScreentoneCoverage(base);

    const scraped = applyScreentoneScrapingDab(base, 80, {
      x: 40,
      y: 40,
      radius: 26,
      strength: 0.85,
      mode: "scrape",
      hardness: 0.4,
    });
    const darkened = applyScreentoneScrapingDab(base, 80, {
      x: 40,
      y: 40,
      radius: 26,
      strength: 0.85,
      mode: "darken",
      hardness: 0.4,
    });

    expect(measureScreentoneCoverage(scraped)).toBeLessThan(baseCov - 0.05);
    expect(measureScreentoneCoverage(darkened)).toBeGreaterThan(baseCov + 0.05);
    // 중심부는 강하게 깎임
    expect(scraped[40 * 80 + 40]!).toBeLessThan(base[40 * 80 + 40]! * 0.25 + 1e-4);

    // 모서리 래핑(wrapTile: true) 시 반대편 모서리도 함께 깎임
    const uniform = new Float32Array(64 * 64).fill(0.8);
    const wrapped = applyScreentoneScrapingDab(uniform, 64, {
      x: 1,
      y: 1,
      radius: 10,
      strength: 0.9,
      mode: "scrape",
      wrapTile: true,
    });
    expect(wrapped[63 * 64 + 63]!).toBeLessThan(0.35);
  });
});

