/**
 * CSP EX 라이브 비파괴 스크린톤 레이어 마스크 브리지.
 *
 * `drawing/studio-screentone.ts`의 모아레 억제 SDF 4종 망점(`circle`, `diamond`, `square`, `star`)과
 * 심리스 사목(Sand/Mezzotint) 노이즈 엔진을 메인 캔버스 비파괴 `ScreentoneLayer` 마스크에 직결한다.
 * 케즈리(톤 깎기) 마스크와 농도 덧칠 오프셋을 별도 채널로 보존해, 깎기 이후에도
 * 선수(LPI)·각도·망점 모양·사목 입자 크기를 손실 없이 실시간 재조정할 수 있다.
 */

import {
  buildSandNoiseScreentoneTile,
  evaluateScreentoneMoireSuppression,
  type ScreentoneConfig,
  type ScreentoneMoireAnalysis,
  type ScreentoneSpotShape,
} from "../drawing/studio-screentone";
import {
  applyToneToSelection,
  normalizeScreentoneLayer,
  type ScreentoneLayer,
  type ScreentoneSelection,
} from "./screentone-layer";
import { screentoneCellSize, screentoneDensityAt } from "./screentone-render";

export const LIVE_SCREENTONE_SPOT_SHAPES: readonly ScreentoneSpotShape[] = Object.freeze([
  "circle",
  "diamond",
  "square",
  "star",
]);

export interface LiveScreentoneMaskLayer {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly layer: ScreentoneLayer;
  /** 도트 망점 모양(원/마름모/정사각형/4각 별). */
  readonly spotShape: ScreentoneSpotShape;
  /** 나이퀴스트 모아레 억제 서브픽셀 AA 활성화 여부. */
  readonly moireSuppression: boolean;
  /** 사목(Sand) 노이즈 입자 크기 배율 (1..8). */
  readonly sandGrainScale: number;
  /** 사목(Sand) 노이즈 경계 부드러움 (0.01..0.45). */
  readonly sandSoftness: number;
  /** 잉크 RGB (0..255). */
  readonly inkRgb: readonly [number, number, number];
  /** 원본 선택 영역 커버리지 마스크 (0..1). */
  readonly baseMask: Float32Array;
  /** 케즈리 톤 깎기 비파괴 마스크 (1 = 원본 유지, 0 = 완전히 깎임). */
  readonly scrapeMask: Float32Array;
  /** 국소 농도 보정 오프셋 (-0.8..+0.8, 톤 덧칠 및 점진 보정). */
  readonly densityBias: Float32Array;
}

export interface CreateLiveScreentoneMaskOptions {
  readonly id?: string;
  readonly name?: string;
  readonly selection: ScreentoneSelection;
  readonly params?: Partial<ScreentoneLayer> | null;
  readonly spotShape?: ScreentoneSpotShape;
  readonly moireSuppression?: boolean;
  readonly sandGrainScale?: number;
  readonly sandSoftness?: number;
  readonly inkRgb?: readonly [number, number, number];
}

export interface RenderLiveScreentoneOptions {
  /** 현재 캔버스 확대 배율 (모아레 억제 대역폭 자동 조정). */
  readonly zoomScale?: number;
  /** 인쇄용 1비트 2치화 임계값 (0..1). 생략 또는 null이면 안티에일리어싱 출력. */
  readonly binaryThreshold?: number | null;
  /** 사목 타일 해상도 (기본 120px). */
  readonly sandTileSize?: number;
}

export interface LiveScreentoneRenderOutput {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly moire: ScreentoneMoireAnalysis;
  readonly meanCoverage: number;
  readonly scrapedPixelCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = Math.max(1e-5, edge1 - edge0);
  const t = clamp((x - edge0) / span, 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeSpotShape(raw?: ScreentoneSpotShape): ScreentoneSpotShape {
  return raw && LIVE_SCREENTONE_SPOT_SHAPES.includes(raw) ? raw : "circle";
}

function evaluateSdfSpotShape(
  spotShape: ScreentoneSpotShape,
  ox: number,
  oy: number,
  spacing: number,
  density: number,
): { readonly dist: number; readonly radius: number } {
  const ax = Math.abs(ox);
  const ay = Math.abs(oy);
  if (spotShape === "diamond") {
    return {
      dist: (ax + ay) * Math.SQRT1_2,
      radius: spacing * Math.sqrt(density) * 0.5,
    };
  }
  if (spotShape === "square") {
    return {
      dist: Math.max(ax, ay),
      radius: spacing * 0.5 * Math.sqrt(density),
    };
  }
  if (spotShape === "star") {
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

function toMoireScreentoneConfig(layer: ScreentoneLayer): ScreentoneConfig {
  return {
    pattern: layer.kind === "line" ? "line" : layer.kind === "cross" ? "cross" : "dot",
    density: clamp(layer.density, 10, 80),
    lines: Math.round(clamp(layer.lines, 8, 72)),
    angleDeg: clamp(layer.angle, 0, 180),
  };
}

/**
 * 선택 영역과 톤 파라미터에서 비파괴 라이브 스크린톤 레이어 마스크를 생성한다.
 */
export function createLiveScreentoneMaskLayer(
  options: CreateLiveScreentoneMaskOptions,
): LiveScreentoneMaskLayer {
  const instance = applyToneToSelection(options.selection, options.params);
  const totalPixels = instance.width * instance.height;
  const scrapeMask = new Float32Array(totalPixels);
  scrapeMask.fill(1);
  const densityBias = new Float32Array(totalPixels);

  const ink = options.inkRgb ?? ([0, 0, 0] as const);

  return {
    id: options.id?.trim() || "tone-layer-1",
    name: options.name?.trim() || "스크린톤 레이어",
    width: instance.width,
    height: instance.height,
    layer: instance.layer,
    spotShape: normalizeSpotShape(options.spotShape),
    moireSuppression: options.moireSuppression !== false,
    sandGrainScale: clamp(options.sandGrainScale ?? 2, 1, 8),
    sandSoftness: clamp(options.sandSoftness ?? 0.2, 0.01, 0.45),
    inkRgb: [clampByte(ink[0]), clampByte(ink[1]), clampByte(ink[2])] as const,
    baseMask: new Float32Array(instance.mask),
    scrapeMask,
    densityBias,
  };
}

/**
 * 현재 줌 배율에서 라이브 톤 레이어의 모아레 간섭 위험도와 권장 로제트 각도를 분석한다.
 */
export function analyzeLiveScreentoneMoire(
  tone: LiveScreentoneMaskLayer,
  zoomScale = 1,
): ScreentoneMoireAnalysis {
  return evaluateScreentoneMoireSuppression(toMoireScreentoneConfig(tone.layer), zoomScale);
}

/**
 * 비파괴 파라미터 변경 — 기존 케즈리(깎기) 마스크와 농도 덧칠을 보존한 채 톤 속성만 갱신한다.
 */
export function updateLiveScreentoneParams(
  tone: LiveScreentoneMaskLayer,
  patch: {
    readonly layer?: Partial<ScreentoneLayer>;
    readonly spotShape?: ScreentoneSpotShape;
    readonly moireSuppression?: boolean;
    readonly sandGrainScale?: number;
    readonly sandSoftness?: number;
    readonly inkRgb?: readonly [number, number, number];
  },
): LiveScreentoneMaskLayer {
  const nextLayer = patch.layer
    ? normalizeScreentoneLayer({
        ...tone.layer,
        ...patch.layer,
        gradient: patch.layer.gradient
          ? { ...tone.layer.gradient, ...patch.layer.gradient }
          : tone.layer.gradient,
      })
    : tone.layer;

  const ink = patch.inkRgb ?? tone.inkRgb;
  return {
    ...tone,
    layer: nextLayer,
    spotShape: patch.spotShape ? normalizeSpotShape(patch.spotShape) : tone.spotShape,
    moireSuppression: patch.moireSuppression ?? tone.moireSuppression,
    sandGrainScale:
      patch.sandGrainScale !== undefined
        ? clamp(patch.sandGrainScale, 1, 8)
        : tone.sandGrainScale,
    sandSoftness:
      patch.sandSoftness !== undefined
        ? clamp(patch.sandSoftness, 0.01, 0.45)
        : tone.sandSoftness,
    inkRgb: [clampByte(ink[0]), clampByte(ink[1]), clampByte(ink[2])] as const,
  };
}

/**
 * 케즈리 깎기·농도 덧칠 편집을 초기화해 원본 선택 마스크 상태로 되돌린다.
 */
export function resetLiveScreentoneMaskEdits(
  tone: LiveScreentoneMaskLayer,
): LiveScreentoneMaskLayer {
  const totalPixels = tone.width * tone.height;
  const scrapeMask = new Float32Array(totalPixels);
  scrapeMask.fill(1);
  return {
    ...tone,
    scrapeMask,
    densityBias: new Float32Array(totalPixels),
  };
}

/**
 * 라이브 스크린톤 레이어를 모아레 억제 SDF 4종 망점 또는 심리스 사목 노이즈로 평가해
 * RGBA 픽셀 버퍼로 합성한다.
 */
export function renderLiveScreentoneToRgba(
  tone: LiveScreentoneMaskLayer,
  options: RenderLiveScreentoneOptions = {},
): LiveScreentoneRenderOutput {
  const { width, height, layer } = tone;
  const totalPixels = width * height;
  const out = new Uint8ClampedArray(totalPixels * 4);
  const zoomScale = clamp(options.zoomScale ?? 1, 0.1, 8);
  const moire = analyzeLiveScreentoneMoire(tone, zoomScale);

  const cell = screentoneCellSize(layer.lines);
  const aaHalfWidth = tone.moireSuppression
    ? Math.min(cell * 0.35, Math.max(0.35, moire.antiAliasBandWidthPx * 0.5))
    : 0.25;

  const rad = (layer.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = width * 0.5;
  const cy = height * 0.5;

  const sandTileSize = Math.max(16, Math.min(256, Math.floor(options.sandTileSize ?? 120)));
  const sandTile =
    layer.kind === "sand"
      ? buildSandNoiseScreentoneTile({
          size: sandTileSize,
          density: clamp(layer.density, 10, 80),
          grainScale: tone.sandGrainScale,
          seed: layer.seed,
          softness: tone.sandSoftness,
        })
      : null;

  const binaryThreshold =
    typeof options.binaryThreshold === "number" && Number.isFinite(options.binaryThreshold)
      ? clamp(options.binaryThreshold, 0, 1)
      : null;

  const [inkR, inkG, inkB] = tone.inkRgb;
  let coverageSum = 0;
  let scrapedPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x;
      const baseM = clamp(tone.baseMask[idx] ?? 0, 0, 1);
      const scrapeM = clamp(tone.scrapeMask[idx] ?? 1, 0, 1);
      if (scrapeM < 0.995) scrapedPixelCount += 1;

      const combinedMask = baseM * scrapeM;
      if (combinedMask <= 0) continue;

      const baseDensity = screentoneDensityAt(layer, x, y, width, height);
      const localDensity = clamp(baseDensity + (tone.densityBias[idx] ?? 0), 0, 1);

      let patternCov: number;
      if (localDensity <= 0) {
        patternCov = 0;
      } else if (localDensity >= 1) {
        patternCov = 1;
      } else if (layer.kind === "sand" && sandTile) {
        const tx = ((x % sandTileSize) + sandTileSize) % sandTileSize;
        const ty = ((y % sandTileSize) + sandTileSize) % sandTileSize;
        const baseSand = sandTile[ty * sandTileSize + tx] ?? 0;
        const densityScale = layer.density > 0 ? localDensity / (layer.density / 100) : 1;
        patternCov = clamp(baseSand * densityScale, 0, 1);
      } else {
        const dx = x - cx;
        const dy = y - cy;
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;

        if (layer.kind === "dot") {
          const gx = Math.round(rx / cell) * cell;
          const gy = Math.round(ry / cell) * cell;
          const { dist, radius } = evaluateSdfSpotShape(
            tone.spotShape,
            rx - gx,
            ry - gy,
            cell,
            localDensity,
          );
          patternCov = 1 - smoothstep(radius - aaHalfWidth, radius + aaHalfWidth, dist);
        } else if (layer.kind === "line") {
          const halfWidth = cell * localDensity * 0.5;
          const gx = Math.round(rx / cell) * cell;
          const dist = Math.abs(rx - gx);
          patternCov = 1 - smoothstep(halfWidth - aaHalfWidth, halfWidth + aaHalfWidth, dist);
        } else {
          const halfWidth = cell * localDensity * 0.25;
          const gx = Math.round(rx / cell) * cell;
          const gy = Math.round(ry / cell) * cell;
          const c1 = 1 - smoothstep(halfWidth - aaHalfWidth, halfWidth + aaHalfWidth, Math.abs(rx - gx));
          const c2 = 1 - smoothstep(halfWidth - aaHalfWidth, halfWidth + aaHalfWidth, Math.abs(ry - gy));
          patternCov = Math.max(c1, c2);
        }
      }

      if (layer.invert === true) {
        patternCov = 1 - patternCov;
      }

      let alpha01 = clamp(patternCov * combinedMask, 0, 1);
      if (binaryThreshold !== null) {
        alpha01 = alpha01 >= binaryThreshold ? 1 : 0;
      }

      coverageSum += alpha01;
      const pIdx = idx * 4;
      out[pIdx] = inkR;
      out[pIdx + 1] = inkG;
      out[pIdx + 2] = inkB;
      out[pIdx + 3] = Math.round(alpha01 * 255);
    }
  }

  return {
    width,
    height,
    data: out,
    moire,
    meanCoverage: totalPixels > 0 ? Math.round((coverageSum / totalPixels) * 10000) / 10000 : 0,
    scrapedPixelCount,
  };
}
