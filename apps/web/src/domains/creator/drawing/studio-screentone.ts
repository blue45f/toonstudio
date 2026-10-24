/**
 * studio-screentone.ts
 *
 * 만화 스크린톤(도트/사선/크로스) 패턴 생성기.
 * ibisPaint·CSP의 "톤 46종" 같은 프리셋 갤러리 대신, 농도·선 수·각도·패턴을
 * 조합해 원하는 톤을 직접 만드는 생성기 중심 설계 (UI 복제 아님, 원리 재해석).
 *
 * 모델:
 * - ScreentoneConfig: pattern(dot|line|cross), density(10..80%), lines, angleDeg
 * - buildScreentoneTile: 타일 한 변 px의 커버리지(0..1) Float32Array — 순수 함수
 * - Canvas2D 패턴 타일 렌더 / 영역 채우기 헬퍼 — 브라우저 전용, 가드 포함
 */

export type ScreentonePattern = "dot" | "line" | "cross";

export interface ScreentoneConfig {
  /** 도트 / 사선 / 크로스(교차 사선). */
  readonly pattern: ScreentonePattern;
  /** 잉크 커버리지 %, 10..80. */
  readonly density: number;
  /** 타일 한 변당 선 수 (LPI 유사), 8..72. */
  readonly lines: number;
  /** 패턴 회전 각도(도), 0..180. */
  readonly angleDeg: number;
}

export const STUDIO_SCREENTONE_LIMITS = {
  minDensity: 10,
  maxDensity: 80,
  minLines: 8,
  maxLines: 72,
  minAngle: 0,
  maxAngle: 180,
} as const;

export interface ScreentonePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly config: ScreentoneConfig;
}

/** 자주 쓰는 톤 4종 시작 프리셋. */
export const STUDIO_SCREENTONE_PRESETS: ReadonlyArray<ScreentonePreset> =
  Object.freeze([
    {
      id: "dot-30",
      labelKo: "표준 도트 30%",
      labelEn: "Standard dot 30%",
      config: { pattern: "dot", density: 30, lines: 24, angleDeg: 45 },
    },
    {
      id: "dot-60",
      labelKo: "거친 도트 60%",
      labelEn: "Coarse dot 60%",
      config: { pattern: "dot", density: 60, lines: 14, angleDeg: 45 },
    },
    {
      id: "line-20",
      labelKo: "사선 20%",
      labelEn: "Diagonal line 20%",
      config: { pattern: "line", density: 20, lines: 32, angleDeg: 60 },
    },
    {
      id: "cross-45",
      labelKo: "크로스 45%",
      labelEn: "Cross 45%",
      config: { pattern: "cross", density: 45, lines: 20, angleDeg: 45 },
    },
  ]);

export function validateScreentoneConfig(
  config: ScreentoneConfig,
): { readonly ok: boolean; readonly errors: ReadonlyArray<string> } {
  const errors: string[] = [];
  const L = STUDIO_SCREENTONE_LIMITS;
  if (!["dot", "line", "cross"].includes(config.pattern)) {
    errors.push(`알 수 없는 패턴: ${String(config.pattern)}`);
  }
  if (
    !Number.isFinite(config.density) ||
    config.density < L.minDensity ||
    config.density > L.maxDensity
  ) {
    errors.push(`농도는 ${L.minDensity}..${L.maxDensity}% 범위여야 합니다.`);
  }
  if (
    !Number.isFinite(config.lines) ||
    Math.floor(config.lines) !== config.lines ||
    config.lines < L.minLines ||
    config.lines > L.maxLines
  ) {
    errors.push(`선 수는 ${L.minLines}..${L.maxLines} 정수여야 합니다.`);
  }
  if (
    !Number.isFinite(config.angleDeg) ||
    config.angleDeg < L.minAngle ||
    config.angleDeg > L.maxAngle
  ) {
    errors.push(`각도는 ${L.minAngle}..${L.maxAngle}도 범위여야 합니다.`);
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/* ------------------------------------------------------------------ */
/* 타일 커버리지 생성 (순수 함수)                                         */
/* ------------------------------------------------------------------ */

export interface BuildScreentoneTileOptions {
  readonly size?: number;
}

/**
 * 스크린톤 타일 생성. size*size 길이의 Float32Array, 0..1 커버리지.
 * 도트: 농도 → 도트 면적 비율로 반경 계산 (r = spacing * sqrt(d/π))
 * 선: 선 두께 = 간격 × 농도. 크로스: 두 방향 선 겹침.
 * angleDeg만큼 타일 중심 기준 회전.
 */
export function buildScreentoneTile(
  config: ScreentoneConfig,
  options: BuildScreentoneTileOptions = {},
): Float32Array {
  const size = Math.max(16, Math.min(512, Math.floor(options.size ?? 120)));
  const tile = new Float32Array(size * size);
  const density = Math.max(0, Math.min(1, config.density / 100));
  const spacing = size / config.lines;
  const angle = (config.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // 타일 중심 기준 회전
      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;

      let coverage: number;
      if (config.pattern === "dot") {
        const radius = spacing * Math.sqrt(density / Math.PI);
        // 가장 가까운 격자점까지 거리
        const gx = Math.round(rx / spacing) * spacing;
        const gy = Math.round(ry / spacing) * spacing;
        const dist = Math.hypot(rx - gx, ry - gy);
        coverage = dist <= radius ? 1 : 0;
      } else if (config.pattern === "line") {
        const width = spacing * density;
        const m = ((rx % spacing) + spacing) % spacing;
        coverage = m < width ? 1 : 0;
      } else {
        // cross: 두 방향 선, 겹치면 1 (농도는 선 두께의 절반씩 분배)
        const halfWidth = (spacing * density) / 2;
        const m1 = ((rx % spacing) + spacing) % spacing;
        const m2 = ((ry % spacing) + spacing) % spacing;
        coverage = m1 <= halfWidth || m2 <= halfWidth ? 1 : 0;
      }
      tile[y * size + x] = coverage;
    }
  }
  return tile;
}

/**
 * 타일의 실제 평균 커버리지를 측정한다 (밀도 설정 검증용).
 */
export function measureScreentoneCoverage(tile: Float32Array): number {
  if (tile.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < tile.length; i += 1) sum += tile[i];
  return sum / tile.length;
}

/* ------------------------------------------------------------------ */
/* Canvas2D 렌더 헬퍼 (브라우저 전용)                                     */
/* ------------------------------------------------------------------ */

/** 커버리지 타일 + 잉크 색 → 타일 캔버스. 브라우저가 아니면 null. */
export function createScreentoneTileCanvas(
  tile: Float32Array,
  size: number,
  ink: readonly [number, number, number],
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const [r, g, b] = ink;
  for (let i = 0; i < tile.length; i += 1) {
    const a = Math.round(tile[i] * 255);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * 대상 컨텍스트의 직사각형 영역을 스크린톤으로 채운다.
 * ink: [r,g,b] 0..255.
 */
export function fillScreentoneRegion(
  ctx: CanvasRenderingContext2D,
  config: ScreentoneConfig,
  x: number,
  y: number,
  width: number,
  height: number,
  ink: readonly [number, number, number] = [0, 0, 0],
): void {
  const tileSize = 120;
  const tile = buildScreentoneTile(config, { size: tileSize });
  const tileCanvas = createScreentoneTileCanvas(tile, tileSize, ink);
  if (!tileCanvas) return;
  const pattern = ctx.createPattern(tileCanvas, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

/** hex 색상(#rrggbb) → [r,g,b]. 실패 시 [0,0,0]. */
export function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [0, 0, 0] as const;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) as number, ((v >> 8) & 255) as number, (v & 255) as number] as const;
}

/* ------------------------------------------------------------------ */
/* 주파수 적응형 모아레(Moiré) 억제 및 서브픽셀 AA / 그라데이션 에칭 톤   */
/* ------------------------------------------------------------------ */

export interface ScreentoneMoireAnalysis {
  readonly screenPitchPx: number;
  readonly aliasingRisk: number;
  readonly antiAliasBandWidthPx: number;
  readonly recommendedRosetteAngleDeg: 15 | 45 | 75;
}

/**
 * 캔버스 줌 배율과 선 수(LPI)·각도에 따른 나이퀴스트 모아레 간섭 위험도 및
 * 최적 서브픽셀 스무스스텝 안티에일리어싱 대역폭을 계산한다.
 */
export function evaluateScreentoneMoireSuppression(
  config: ScreentoneConfig,
  zoomScale = 1,
): ScreentoneMoireAnalysis {
  const safeZoom = Math.max(0.1, Math.min(8, Number.isFinite(zoomScale) ? zoomScale : 1));
  const baseTileSize = 120;
  const rawPitch = baseTileSize / Math.max(8, config.lines);
  const screenPitchPx = Math.round(rawPitch * safeZoom * 100) / 100;

  // 화면 픽셀 주기가 4px 미만으로 좁아질수록 나이퀴스트 에일리어싱 위험 상승
  const pitchRisk = Math.max(0, Math.min(1, (4.2 - screenPitchPx) / 3.2));
  const candidates: readonly (15 | 45 | 75)[] = [15, 45, 75];
  let nearestAngle: 15 | 45 | 75 = 45;
  let minDiff = Infinity;
  const normAngle = ((config.angleDeg % 90) + 90) % 90;
  for (const c of candidates) {
    const d = Math.abs(normAngle - c);
    if (d < minDiff) {
      minDiff = d;
      nearestAngle = c;
    }
  }
  const angleRisk = Math.max(0, Math.min(0.25, (minDiff / 45) * 0.2));
  const aliasingRisk = Math.round(Math.min(1, pitchRisk * 0.85 + angleRisk) * 1000) / 1000;
  const antiAliasBandWidthPx =
    Math.round((0.65 / safeZoom + aliasingRisk * 0.95) * 1000) / 1000;

  return {
    screenPitchPx,
    aliasingRisk,
    antiAliasBandWidthPx,
    recommendedRosetteAngleDeg: nearestAngle,
  };
}

export type ScreentoneSpotShape = "circle" | "diamond" | "square" | "star";

export interface BuildAntiAliasedScreentoneOptions {
  readonly size?: number;
  readonly zoomScale?: number;
  readonly gradientDirection?: "none" | "vertical" | "radial";
  /** 0..1 그라데이션·에칭 감쇠 강도 */
  readonly gradientStrength?: number;
  /**
   * CSP 망점 모양(Spot Shape):
   * - "circle": 원형 도트 (기본)
   * - "diamond": 마름모(맨해튼 L1) 망점
   * - "square": 정사각형(체비쇼프 L∞) 망점
   * - "star": 4각 별/반짝이(아스트로이드) 순정만화 망점
   */
  readonly spotShape?: ScreentoneSpotShape;
}

function smoothstepEdge(edge0: number, edge1: number, x: number): number {
  const span = Math.max(1e-5, edge1 - edge0);
  const t = Math.max(0, Math.min(1, (x - edge0) / span));
  return t * t * (3 - 2 * t);
}

function evaluateSpotShapeDistanceAndRadius(
  spotShape: ScreentoneSpotShape,
  ox: number,
  oy: number,
  spacing: number,
  density: number,
): { readonly dist: number; readonly radius: number } {
  const ax = Math.abs(ox);
  const ay = Math.abs(oy);
  if (spotShape === "diamond") {
    // 다이아몬드(|x| + |y| <= R_1) 면적 = 2 * R_1^2 = density * spacing^2
    // 유클리드 스케일 정규화 거리: (|x| + |y|) / sqrt(2)
    return {
      dist: (ax + ay) * Math.SQRT1_2,
      radius: spacing * Math.sqrt(density) * 0.5,
    };
  }
  if (spotShape === "square") {
    // 정사각형(max(|x|, |y|) <= R_inf) 면적 = (2 * R_inf)^2 = density * spacing^2
    return {
      dist: Math.max(ax, ay),
      radius: spacing * 0.5 * Math.sqrt(density),
    };
  }
  if (spotShape === "star") {
    // 4각 아스트로이드(|x|^(2/3) + |y|^(2/3) <= R^(2/3)) 면적 = (3 * pi / 8) * R^2
    const dist = Math.pow(Math.pow(ax, 2 / 3) + Math.pow(ay, 2 / 3), 1.5);
    const astroidAreaFactor = (3 * Math.PI) / 8;
    return {
      dist,
      radius: spacing * Math.sqrt(density / astroidAreaFactor),
    };
  }
  return {
    dist: Math.hypot(ax, ay),
    radius: spacing * Math.sqrt(density / Math.PI),
  };
}

/**
 * 서브픽셀 부호 거리(SDF) 스무스스텝 안티에일리어싱과 연속 그라데이션(에칭 톤) 농도 변조를 결합한
 * 모아레 억제형 고품질 스크린톤 부동소수점 타일을 생성한다.
 */
export function buildAntiAliasedScreentoneTile(
  config: ScreentoneConfig,
  options: BuildAntiAliasedScreentoneOptions = {},
): Float32Array {
  const size = Math.max(16, Math.min(512, Math.floor(options.size ?? 120)));
  const tile = new Float32Array(size * size);
  const baseDensity = Math.max(0.02, Math.min(0.95, config.density / 100));
  const spacing = size / Math.max(8, config.lines);
  const angle = (config.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = size / 2;
  const cy = size / 2;

  const moire = evaluateScreentoneMoireSuppression(config, options.zoomScale ?? 1);
  const aaHalfWidth = Math.min(spacing * 0.35, moire.antiAliasBandWidthPx * 0.5);
  const gradDir = options.gradientDirection ?? "none";
  const gradStrength = Math.max(0, Math.min(1, options.gradientStrength ?? 0));
  const spotShape: ScreentoneSpotShape = options.spotShape ?? "circle";

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let localMod = 1;
      if (gradDir === "vertical" && gradStrength > 0) {
        const vNorm = y / Math.max(1, size - 1);
        localMod = 1 - gradStrength * (1 - vNorm);
      } else if (gradDir === "radial" && gradStrength > 0) {
        const rNorm = Math.min(1, Math.hypot(x - cx, y - cy) / (size * 0.5));
        localMod = 1 - gradStrength * rNorm;
      }
      const density = Math.max(0.01, Math.min(0.95, baseDensity * localMod));

      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;

      let coverage: number;
      if (config.pattern === "dot") {
        const gx = Math.round(rx / spacing) * spacing;
        const gy = Math.round(ry / spacing) * spacing;
        const { dist, radius } = evaluateSpotShapeDistanceAndRadius(
          spotShape,
          rx - gx,
          ry - gy,
          spacing,
          density,
        );
        coverage = 1 - smoothstepEdge(radius - aaHalfWidth, radius + aaHalfWidth, dist);
      } else if (config.pattern === "line") {
        const halfWidth = (spacing * density) * 0.5;
        const gx = Math.round(rx / spacing) * spacing;
        const dist = Math.abs(rx - gx);
        coverage = 1 - smoothstepEdge(halfWidth - aaHalfWidth, halfWidth + aaHalfWidth, dist);
      } else {
        const halfWidth = (spacing * density) * 0.25;
        const gx = Math.round(rx / spacing) * spacing;
        const gy = Math.round(ry / spacing) * spacing;
        const c1 = 1 - smoothstepEdge(halfWidth - aaHalfWidth, halfWidth + aaHalfWidth, Math.abs(rx - gx));
        const c2 = 1 - smoothstepEdge(halfWidth - aaHalfWidth, halfWidth + aaHalfWidth, Math.abs(ry - gy));
        coverage = Math.max(c1, c2);
      }

      tile[y * size + x] = coverage;
    }
  }
  return tile;
}

/* ------------------------------------------------------------------ */
/* CSP 사목(Sand/Mezzotint) 노이즈 스크린톤 & 케즈리(톤 깎기) 변조       */
/* ------------------------------------------------------------------ */

export interface BuildSandNoiseScreentoneOptions {
  readonly size?: number;
  /** 목표 농도 %, 10..80 (기본 35) */
  readonly density?: number;
  /** 입자 크기 배율, 1..8 (기본 2) */
  readonly grainScale?: number;
  /** 결정론적 시드 (기본 42) */
  readonly seed?: number;
  /** 경계 부드러움 0..1 (기본 0.2) */
  readonly softness?: number;
}

function hash2dPeriodic(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let h = (px * 374761393 + py * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function samplePeriodicValueNoise(
  x: number,
  y: number,
  scale: number,
  period: number,
  seed: number,
): number {
  const sx = x / scale;
  const sy = y / scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);

  const n00 = hash2dPeriodic(ix, iy, period, seed);
  const n10 = hash2dPeriodic(ix + 1, iy, period, seed);
  const n01 = hash2dPeriodic(ix, iy + 1, period, seed);
  const n11 = hash2dPeriodic(ix + 1, iy + 1, period, seed);

  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}

/**
 * 클립스튜디오(CSP) 사목(Sand/Mezzotint) 노이즈 톤 생성기.
 * 격자 주기성 없이 타일 경계에서 100% 심리스(Seamless)로 이어지는 다중 주파수 입자 톤을 생성한다.
 */
export function buildSandNoiseScreentoneTile(
  options: BuildSandNoiseScreentoneOptions = {},
): Float32Array {
  const size = Math.max(16, Math.min(512, Math.floor(options.size ?? 120)));
  const densityRatio = Math.max(
    STUDIO_SCREENTONE_LIMITS.minDensity / 100,
    Math.min(STUDIO_SCREENTONE_LIMITS.maxDensity / 100, (options.density ?? 35) / 100),
  );
  const grainScale = Math.max(1, Math.min(8, Number.isFinite(options.grainScale) ? (options.grainScale ?? 2) : 2));
  const seed = Math.floor(Number.isFinite(options.seed) ? (options.seed ?? 42) : 42);
  const softness = Math.max(0.01, Math.min(0.45, Number.isFinite(options.softness) ? (options.softness ?? 0.2) : 0.2));

  // 타일 주기 일치를 위해 정수 주기 계산
  const coarsePeriod = Math.max(4, Math.round(size / grainScale));
  const finePeriod = Math.max(8, coarsePeriod * 2);
  const coarseStep = size / coarsePeriod;
  const fineStep = size / finePeriod;

  const tile = new Float32Array(size * size);
  const hist = new Uint32Array(256);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const coarse = samplePeriodicValueNoise(x, y, coarseStep, coarsePeriod, seed);
      const fine = samplePeriodicValueNoise(x, y, fineStep, finePeriod, seed + 97);
      const micro = hash2dPeriodic(x, y, size, seed + 251);
      const combined = Math.max(0, Math.min(1, coarse * 0.55 + fine * 0.3 + micro * 0.15));
      tile[y * size + x] = combined;
      const bin = Math.min(255, Math.floor(combined * 256));
      hist[bin] = (hist[bin] ?? 0) + 1;
    }
  }

  // 다중 옥타브 합산 분포에서 목표 농도(densityRatio)와 정확히 일치하는 분위수(Quantile) 임계값 산출
  const targetRank = Math.round((1 - densityRatio) * tile.length);
  let accum = 0;
  let threshold = 1 - densityRatio;
  for (let b = 0; b < 256; b += 1) {
    accum += hist[b]!;
    if (accum >= targetRank) {
      threshold = (b + 0.5) / 256;
      break;
    }
  }

  for (let i = 0; i < tile.length; i += 1) {
    tile[i] = smoothstepEdge(
      threshold - softness * 0.25,
      threshold + softness * 0.25,
      tile[i]!,
    );
  }
  return tile;
}

export interface ScreentoneScrapingDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** 0..1 브러시 압력/강도 */
  readonly strength: number;
  /** "scrape": 케즈리(톤 깎기/하이라이트), "darken": 톤 덧칠(그림자 농도 강화) */
  readonly mode?: "scrape" | "darken";
  /** 0..1 브러시 경도 (기본 0.35) */
  readonly hardness?: number;
  /** 타일 경계 래핑 여부 (기본 false) */
  readonly wrapTile?: boolean;
}

/**
 * 만화 톤 깎기(케즈리 / Tone Scraping) 또는 톤 농도 덧칠 브러시 댑을 스크린톤 타일에 적용한다.
 * 원본 타일은 변경하지 않고 변조된 새 Float32Array를 반환한다.
 */
export function applyScreentoneScrapingDab(
  tile: Float32Array,
  size: number,
  dab: ScreentoneScrapingDab,
): Float32Array {
  const safeSize = Math.max(1, Math.floor(size));
  const next = new Float32Array(tile);
  if (
    !Number.isFinite(dab.x) ||
    !Number.isFinite(dab.y) ||
    !Number.isFinite(dab.radius) ||
    dab.radius <= 0
  ) {
    return next;
  }
  const strength = Math.max(0, Math.min(1, Number.isFinite(dab.strength) ? dab.strength : 0));
  if (strength <= 0) return next;

  const hardness = Math.max(0, Math.min(0.98, Number.isFinite(dab.hardness) ? (dab.hardness ?? 0.35) : 0.35));
  const mode = dab.mode ?? "scrape";
  const wrap = dab.wrapTile === true;
  const radius = dab.radius;
  const innerRadius = radius * hardness;

  for (let y = 0; y < safeSize; y += 1) {
    for (let x = 0; x < safeSize; x += 1) {
      let dx = Math.abs(x - dab.x);
      let dy = Math.abs(y - dab.y);
      if (wrap) {
        if (dx > safeSize * 0.5) dx = safeSize - dx;
        if (dy > safeSize * 0.5) dy = safeSize - dy;
      }
      if (dx > radius || dy > radius) continue;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;

      const falloff = 1 - smoothstepEdge(innerRadius, radius, dist);
      const effect = falloff * strength;
      const idx = y * safeSize + x;
      const cur = next[idx] ?? 0;
      const updated = mode === "darken" ? cur + (1 - cur) * effect : cur * (1 - effect);
      next[idx] = Math.max(0, Math.min(1, updated));
    }
  }
  return next;
}

