/**
 * 컷별 흑백·컬러 할프톤 망점 스크린톤(Halftone Dot Screentone) 결정적 래스터라이저 및
 * 스크롤 여백 호흡(`gutterPaces`) 연동 모바일 웹툰 리더·오토패닝 타임라인 순수 계산 모듈.
 *
 * - Math.random / DOM 의존성 없이 Node·브라우저 양쪽에서 100% 동일한 픽셀과 타이밍을 생성한다.
 * - 세로 4컷 스트립 합성기(`webtoon-strip-composer.ts`)와 분리형 레이어 PSD(`psd-plan.ts`)가 공유한다.
 */
import { WEBTOON_STRIP_GUTTER_PACES } from "./webtoon-strip-pacing-tategaki";

import type { CapturedRaster } from "../contracts";
import type { WebtoonStripLayout } from "./webtoon-strip-composer";
import type { WebtoonStripGutterPaces } from "./webtoon-strip-pacing-tategaki";

export const WEBTOON_SCREENTONE_IDS = [
  "none",
  "classic-ink-45",
  "shadow-fade-mono",
  "rose-duotone-dots",
  "cyan-noir-dots",
] as const;

export type WebtoonScreentoneId = (typeof WEBTOON_SCREENTONE_IDS)[number];

export type WebtoonStripScreentones = readonly [
  WebtoonScreentoneId,
  WebtoonScreentoneId,
  WebtoonScreentoneId,
  WebtoonScreentoneId,
];

export const DEFAULT_WEBTOON_STRIP_SCREENTONES: WebtoonStripScreentones = Object.freeze([
  "none",
  "none",
  "none",
  "none",
]) as WebtoonStripScreentones;

export interface WebtoonScreentoneSpec {
  readonly id: WebtoonScreentoneId;
  readonly labelKo: string;
  readonly dotRgb: readonly [number, number, number];
  readonly basePitchRatio: number;
  readonly maxRadiusRatio: number;
  readonly maxAlpha01: number;
}

export const WEBTOON_SCREENTONE_SPECS: Readonly<Record<WebtoonScreentoneId, WebtoonScreentoneSpec>> = Object.freeze({
  none: {
    id: "none",
    labelKo: "스크린톤 없음",
    dotRgb: [24, 21, 28],
    basePitchRatio: 0.02,
    maxRadiusRatio: 0,
    maxAlpha01: 0,
  },
  "classic-ink-45": {
    id: "classic-ink-45",
    labelKo: "흑백 45° 정통 망점",
    dotRgb: [26, 23, 30],
    basePitchRatio: 0.022,
    maxRadiusRatio: 0.44,
    maxAlpha01: 0.42,
  },
  "shadow-fade-mono": {
    id: "shadow-fade-mono",
    labelKo: "상단 그라데이션 먹톤",
    dotRgb: [20, 22, 30],
    basePitchRatio: 0.019,
    maxRadiusRatio: 0.48,
    maxAlpha01: 0.50,
  },
  "rose-duotone-dots": {
    id: "rose-duotone-dots",
    labelKo: "코랄 로맨스 컬러 망점",
    dotRgb: [232, 108, 148],
    basePitchRatio: 0.024,
    maxRadiusRatio: 0.45,
    maxAlpha01: 0.44,
  },
  "cyan-noir-dots": {
    id: "cyan-noir-dots",
    labelKo: "시안 느와르 컬러 망점",
    dotRgb: [58, 128, 192],
    basePitchRatio: 0.021,
    maxRadiusRatio: 0.46,
    maxAlpha01: 0.46,
  },
});

const COS_45 = Math.SQRT1_2;
const SIN_45 = Math.SQRT1_2;

function computeSpatialToneWeight(toneId: WebtoonScreentoneId, nx: number, ny: number): number {
  if (toneId === "none") return 0;
  if (toneId === "shadow-fade-mono") {
    // 상단 0%에서 진하게 시작해 하단 72% 지점으로 부드럽게 소멸
    const fade = Math.max(0, 1 - ny / 0.74);
    return fade * fade;
  }
  const dx = (nx - 0.5) * 2;
  const dy = (ny - 0.52) * 2;
  const radial = Math.hypot(dx * 0.92, dy * 0.78);
  if (toneId === "classic-ink-45") {
    // 인물 중앙(radial < 0.36)은 비워 얼굴 가독성을 지키고 외곽과 상하단에 45° 망점 배치
    const rim = Math.min(1, Math.max(0, (radial - 0.34) / 0.78));
    const topBias = Math.max(0, 0.45 - ny) * 0.55;
    return Math.min(1, rim * 0.85 + topBias);
  }
  if (toneId === "rose-duotone-dots") {
    const corner = Math.min(1, Math.max(0, (radial - 0.30) / 0.76));
    return corner * (0.65 + (1 - ny) * 0.35);
  }
  // cyan-noir-dots: 상하단 비네팅 + 좌우 측광 망점
  const edge = Math.min(1, Math.max(0, (radial - 0.28) / 0.74));
  return Math.min(1, edge * 0.88 + Math.max(0, ny - 0.58) * 0.4);
}

/**
 * 패널 내부 또는 투명 PSD 레이어 버퍼에 45° 회전 격자 기반 안티에일리어싱 할프톤 망점을 결정적으로 합성한다.
 */
export function bakePanelHalftoneScreentone(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  toneId: WebtoonScreentoneId,
  intensity = 0.78,
): void {
  if (toneId === "none" || innerWidth <= 0 || innerHeight <= 0) return;
  const spec = WEBTOON_SCREENTONE_SPECS[toneId];
  const safeIntensity = Math.min(1, Math.max(0.2, Number.isFinite(intensity) ? intensity : 0.78));
  const pitch = Math.max(4, Math.round(innerWidth * spec.basePitchRatio));
  const maxDotRadius = Math.max(1.15, pitch * spec.maxRadiusRatio);
  const [dr, dg, db] = spec.dotRgb;
  const alphaScale = spec.maxAlpha01 * safeIntensity;

  for (let py = 0; py < innerHeight; py += 1) {
    const ny = innerHeight > 1 ? py / (innerHeight - 1) : 0;
    const dstRow = (innerY + py) * canvasWidth;
    for (let px = 0; px < innerWidth; px += 1) {
      const nx = innerWidth > 1 ? px / (innerWidth - 1) : 0;
      const weight = computeSpatialToneWeight(toneId, nx, ny);
      if (weight <= 0.04) continue;

      const rotU = (px * COS_45 - py * SIN_45) / pitch;
      const rotV = (px * SIN_45 + py * COS_45) / pitch;
      const cellDu = (rotU - Math.round(rotU)) * pitch;
      const cellDv = (rotV - Math.round(rotV)) * pitch;
      const dist = Math.hypot(cellDu, cellDv);
      const radius = maxDotRadius * Math.sqrt(weight);
      if (dist > radius + 0.55) continue;

      const aaCov = dist <= radius - 0.45 ? 1 : Math.max(0, 1 - (dist - (radius - 0.45)));
      const a = Math.min(1, aaCov * alphaScale * (0.55 + weight * 0.45));
      if (a <= 0.01) continue;

      const dst = (dstRow + innerX + px) * 4;
      const dstAlphaByte = rgba[dst + 3] ?? 0;
      if (dstAlphaByte === 255) {
        const inv = 1 - a;
        rgba[dst] = Math.round(dr * a + (rgba[dst] ?? 255) * inv);
        rgba[dst + 1] = Math.round(dg * a + (rgba[dst + 1] ?? 255) * inv);
        rgba[dst + 2] = Math.round(db * a + (rgba[dst + 2] ?? 255) * inv);
        rgba[dst + 3] = 255;
      } else {
        const dstA = dstAlphaByte / 255;
        const outA = a + dstA * (1 - a);
        if (outA <= 0.0001) continue;
        const dstW = dstA * (1 - a);
        rgba[dst] = Math.round((dr * a + (rgba[dst] ?? 0) * dstW) / outA);
        rgba[dst + 1] = Math.round((dg * a + (rgba[dst + 1] ?? 0) * dstW) / outA);
        rgba[dst + 2] = Math.round((db * a + (rgba[dst + 2] ?? 0) * dstW) / outA);
        rgba[dst + 3] = Math.round(outA * 255);
      }
    }
  }
}

/** 분리형 레이어 PSD(`웹툰 만화 연출/스크린톤 망점`)용 독립 투명 할프톤 망점 래스터를 생성한다. */
export function renderTransparentScreentoneLayer(
  width: number,
  height: number,
  toneId: WebtoonScreentoneId,
  intensity = 0.78,
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  bakePanelHalftoneScreentone(rgba, width, 0, 0, width, height, toneId, intensity);
  return { width, height, rgba };
}

// ---------------------------------------------------------------- 스크롤 호흡 연동 모바일 웹툰 리더 & 오토패닝 타임라인

export interface StripAutoPanSegment {
  readonly cutIndex: 0 | 1 | 2 | 3;
  readonly cutTopY: number;
  readonly dwellStartMs: number;
  readonly dwellEndMs: number;
  readonly panEndMs: number;
}

export interface StripAutoPanTimeline {
  readonly stripWidth: number;
  readonly stripHeight: number;
  readonly frameHeight: number;
  readonly cutTopYs: readonly [number, number, number, number];
  readonly cutDwellMs: readonly [number, number, number, number];
  readonly segments: readonly [
    StripAutoPanSegment,
    StripAutoPanSegment,
    StripAutoPanSegment,
    StripAutoPanSegment,
  ];
  readonly totalDurationMs: number;
}

function smoothstep01(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 4컷 레이아웃과 1→2→3→4컷 스크롤 여백 배율(`gutterPaces`)로부터
 * 각 컷의 체류 시간(`dwellMs`)과 컷 간 패닝 시간을 동기화한 결정적 타임라인을 계산한다.
 */
export function computeStripAutoPanTimeline(
  layout: WebtoonStripLayout,
  gutterPaces: WebtoonStripGutterPaces,
): StripAutoPanTimeline {
  const frameHeight = layout.bubbleSafeTopPx + layout.cutHeight + layout.borderPx * 2;
  const gutters = layout.gutterHeights ?? [layout.gutterY, layout.gutterY, layout.gutterY];
  const y0 = layout.marginY;
  const y1 = y0 + frameHeight + gutters[0];
  const y2 = y1 + frameHeight + gutters[1];
  const y3 = y2 + frameHeight + gutters[2];
  const cutTopYs: readonly [number, number, number, number] = [y0, y1, y2, y3];

  const m0 = WEBTOON_STRIP_GUTTER_PACES[gutterPaces[0]]?.multiplier ?? 1;
  const m1 = WEBTOON_STRIP_GUTTER_PACES[gutterPaces[1]]?.multiplier ?? 1;
  const m2 = WEBTOON_STRIP_GUTTER_PACES[gutterPaces[2]]?.multiplier ?? 1;

  const baseDwellMs = 1050;
  const basePanMs = 560;
  const dwell0 = Math.round(baseDwellMs * (0.72 + m0 * 0.28));
  const dwell1 = Math.round(baseDwellMs * (0.72 + m1 * 0.28));
  const dwell2 = Math.round(baseDwellMs * (0.72 + m2 * 0.28));
  const dwell3 = Math.round(baseDwellMs * 1.25);

  const pan0 = Math.round(basePanMs * m0);
  const pan1 = Math.round(basePanMs * m1);
  const pan2 = Math.round(basePanMs * m2);

  let cursorMs = 0;
  const s0: StripAutoPanSegment = {
    cutIndex: 0,
    cutTopY: y0,
    dwellStartMs: cursorMs,
    dwellEndMs: cursorMs + dwell0,
    panEndMs: cursorMs + dwell0 + pan0,
  };
  cursorMs = s0.panEndMs;
  const s1: StripAutoPanSegment = {
    cutIndex: 1,
    cutTopY: y1,
    dwellStartMs: cursorMs,
    dwellEndMs: cursorMs + dwell1,
    panEndMs: cursorMs + dwell1 + pan1,
  };
  cursorMs = s1.panEndMs;
  const s2: StripAutoPanSegment = {
    cutIndex: 2,
    cutTopY: y2,
    dwellStartMs: cursorMs,
    dwellEndMs: cursorMs + dwell2,
    panEndMs: cursorMs + dwell2 + pan2,
  };
  cursorMs = s2.panEndMs;
  const s3: StripAutoPanSegment = {
    cutIndex: 3,
    cutTopY: y3,
    dwellStartMs: cursorMs,
    dwellEndMs: cursorMs + dwell3,
    panEndMs: cursorMs + dwell3,
  };

  return {
    stripWidth: layout.stripWidth,
    stripHeight: layout.stripHeight,
    frameHeight,
    cutTopYs,
    cutDwellMs: [dwell0, dwell1, dwell2, dwell3],
    segments: [s0, s1, s2, s3],
    totalDurationMs: s3.panEndMs,
  };
}

/**
 * 경과 시간(`elapsedMs`)에 대응하는 정규화 스크롤 비율(`0..1`)과 현재 활성 컷 인덱스(`0..3`)를 순수 함수로 반환한다.
 */
export function sampleAutoPanScrollState(
  timeline: StripAutoPanTimeline,
  elapsedMs: number,
): { readonly scrollRatio01: number; readonly activeCutIndex: 0 | 1 | 2 | 3 } {
  const total = Math.max(1, timeline.totalDurationMs);
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs % total : 0;
  const maxAnchorY = Math.max(1, timeline.cutTopYs[3] - timeline.cutTopYs[0]);

  for (let i = 0; i < 4; i += 1) {
    const seg = timeline.segments[i as 0 | 1 | 2 | 3]!;
    if (safeElapsed <= seg.dwellEndMs) {
      const ratio = (seg.cutTopY - timeline.cutTopYs[0]) / maxAnchorY;
      return { scrollRatio01: Math.min(1, Math.max(0, ratio)), activeCutIndex: seg.cutIndex };
    }
    if (i < 3 && safeElapsed <= seg.panEndMs) {
      const nextSeg = timeline.segments[(i + 1) as 1 | 2 | 3]!;
      const span = Math.max(1, seg.panEndMs - seg.dwellEndMs);
      const eased = smoothstep01((safeElapsed - seg.dwellEndMs) / span);
      const interpY = seg.cutTopY + (nextSeg.cutTopY - seg.cutTopY) * eased;
      const ratio = (interpY - timeline.cutTopYs[0]) / maxAnchorY;
      return {
        scrollRatio01: Math.min(1, Math.max(0, ratio)),
        activeCutIndex: eased >= 0.5 ? nextSeg.cutIndex : seg.cutIndex,
      };
    }
  }

  return { scrollRatio01: 1, activeCutIndex: 3 };
}
