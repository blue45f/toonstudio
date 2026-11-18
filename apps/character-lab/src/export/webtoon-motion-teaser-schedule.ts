/** 컷 체류·여백 호흡·배속에 따른 모션 프레임과 키네틱 연출을 결정적으로 계산한다. */
import {
  DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  computeStripAutoPanTimeline,
  sampleAutoPanScrollState,
} from "./webtoon-strip-composer";

import type {
  StripAutoPanTimeline,
  WebtoonStripGutterPaces,
  WebtoonStripLayout,
  WebtoonStripSfxStamps,
} from "./webtoon-strip-composer";

export const DEFAULT_MOTION_TEASER_FPS = 24;
export const MIN_MOTION_TEASER_FPS = 12;
export const MAX_MOTION_TEASER_FPS = 30;

export interface MotionTeaserFrameSample {
  readonly frameIndex: number;
  readonly outputTimeMs: number;
  readonly timelineElapsedMs: number;
  readonly scrollRatio01: number;
  readonly activeCutIndex: 0 | 1 | 2 | 3;
  /** 컷 체류 구간에서 미세한 포커스 호흡감을 주는 배율 (1.000..1.028) */
  readonly dwellZoom: number;
  /** 각 컷(0..3) 말풍선 팝인 불투명도 (패닝 접근 전 0 → 체류 진입 시 1) */
  readonly cutBubbleAlphas: readonly [number, number, number, number];
  /** 각 컷(0..3) 말풍선 스프링 팝인 배율 (0.78 → 1.04 → 1.00) */
  readonly cutBubbleScales: readonly [number, number, number, number];
  /** 활성 컷 효과음 임팩트 미세 진동 오프셋(px) */
  readonly shakeOffsetX: number;
  readonly shakeOffsetY: number;
  readonly progress01: number;
}

export interface MotionTeaserSchedule {
  readonly timeline: StripAutoPanTimeline;
  readonly fps: number;
  readonly speed: number;
  readonly outputDurationMs: number;
  readonly frameCount: number;
  readonly frames: readonly MotionTeaserFrameSample[];
}

export interface PlanMotionTeaserOptions {
  readonly fps?: number;
  readonly speed?: number;
  readonly sfxStamps?: WebtoonStripSfxStamps;
}

export function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function computeDwellZoomAt(timeline: StripAutoPanTimeline, timelineElapsedMs: number): number {
  const total = Math.max(1, timeline.totalDurationMs);
  const t = ((timelineElapsedMs % total) + total) % total;
  for (let i = 0; i < 4; i += 1) {
    const seg = timeline.segments[i as 0 | 1 | 2 | 3]!;
    if (t >= seg.dwellStartMs && t <= seg.dwellEndMs) {
      const span = Math.max(1, seg.dwellEndMs - seg.dwellStartMs);
      const phase = (t - seg.dwellStartMs) / span;
      return Number((1 + Math.sin(phase * Math.PI) * 0.028).toFixed(5));
    }
  }
  return 1;
}

/**
 * 컷 체류(`dwellStartMs`) 진입 시 말풍선 스프링 팝인 배율·알파 및 효과음 미세 진동을 결정적으로 계산한다.
 */
export function computeCutKineticMotionState(
  timeline: StripAutoPanTimeline,
  sfxStamps: WebtoonStripSfxStamps,
  timelineElapsedMs: number,
): {
  readonly cutBubbleAlphas: readonly [number, number, number, number];
  readonly cutBubbleScales: readonly [number, number, number, number];
  readonly shakeOffsetX: number;
  readonly shakeOffsetY: number;
} {
  const alphas: [number, number, number, number] = [0, 0, 0, 0];
  const scales: [number, number, number, number] = [0.78, 0.78, 0.78, 0.78];
  let shakeX = 0;
  let shakeY = 0;

  for (let i = 0; i < 4; i += 1) {
    const cutIdx = i as 0 | 1 | 2 | 3;
    const seg = timeline.segments[cutIdx]!;
    const dt = timelineElapsedMs - seg.dwellStartMs;
    if (dt < 0) {
      alphas[cutIdx] = 0;
      scales[cutIdx] = 0.78;
      continue;
    }
    const alpha01 = Math.min(1, dt / 140);
    alphas[cutIdx] = Number(alpha01.toFixed(4));
    if (dt < 220) {
      const p = dt / 220;
      const overshoot = 1 - Math.pow(1 - p, 3) * Math.cos(p * Math.PI * 1.35);
      scales[cutIdx] = Number((0.78 + 0.22 * overshoot).toFixed(4));
    } else {
      scales[cutIdx] = 1;
    }

    const sfx = sfxStamps[cutIdx];
    if (sfx !== "none" && dt >= 30 && dt <= 310) {
      const sfxPhase = (dt - 30) / 280;
      const decay = Math.pow(1 - sfxPhase, 1.8);
      if (sfx === "kugugung" || sfx === "beonjjeok") {
        shakeX = Number((Math.sin(sfxPhase * Math.PI * 11) * 3.6 * decay).toFixed(3));
        shakeY = Number((Math.cos(sfxPhase * Math.PI * 9) * 2.8 * decay).toFixed(3));
      } else if (sfx === "dugeun" || sfx === "pat") {
        shakeX = 0;
        shakeY = Number((-Math.abs(Math.sin(sfxPhase * Math.PI * 4)) * 2.2 * decay).toFixed(3));
      } else if (sfx === "seureung") {
        shakeX = Number((Math.sin(sfxPhase * Math.PI * 6) * 2.6 * decay).toFixed(3));
        shakeY = Number((-Math.sin(sfxPhase * Math.PI * 6) * 1.4 * decay).toFixed(3));
      } else {
        shakeX = Number((Math.sin(sfxPhase * Math.PI * 3) * 1.6 * decay).toFixed(3));
      }
    }
  }

  return {
    cutBubbleAlphas: alphas,
    cutBubbleScales: scales,
    shakeOffsetX: shakeX,
    shakeOffsetY: shakeY,
  };
}

/**
 * 4컷 레이아웃과 스크롤 여백 호흡(`gutterPaces`)으로부터 결정적 9:16 모션 코믹 프레임 스케줄을 계산한다.
 */
export function planMotionTeaserSchedule(
  layout: WebtoonStripLayout,
  gutterPaces: WebtoonStripGutterPaces = DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  options: PlanMotionTeaserOptions = {},
): MotionTeaserSchedule {
  const timeline = computeStripAutoPanTimeline(layout, gutterPaces);
  const fps = Math.round(clampNumber(options.fps, MIN_MOTION_TEASER_FPS, MAX_MOTION_TEASER_FPS, DEFAULT_MOTION_TEASER_FPS));
  const speed = Number(clampNumber(options.speed, 0.5, 2.0, 1.0).toFixed(2));
  const sfxStamps = options.sfxStamps ?? DEFAULT_WEBTOON_STRIP_SFX_STAMPS;
  const outputDurationMs = Math.max(400, Math.round(timeline.totalDurationMs / speed));
  const frameCount = Math.max(8, Math.round((outputDurationMs / 1000) * fps));

  const frames: MotionTeaserFrameSample[] = [];
  for (let idx = 0; idx < frameCount; idx += 1) {
    const progress01 = frameCount > 1 ? idx / (frameCount - 1) : 0;
    const outputTimeMs = Math.round(progress01 * outputDurationMs);
    const timelineElapsedMs = Math.min(timeline.totalDurationMs - 0.001, progress01 * timeline.totalDurationMs);
    const sampled = sampleAutoPanScrollState(timeline, timelineElapsedMs);
    const dwellZoom = computeDwellZoomAt(timeline, timelineElapsedMs);
    const kinetic = computeCutKineticMotionState(timeline, sfxStamps, timelineElapsedMs);
    frames.push({
      frameIndex: idx,
      outputTimeMs,
      timelineElapsedMs,
      scrollRatio01: sampled.scrollRatio01,
      activeCutIndex: sampled.activeCutIndex,
      dwellZoom,
      cutBubbleAlphas: kinetic.cutBubbleAlphas,
      cutBubbleScales: kinetic.cutBubbleScales,
      shakeOffsetX: kinetic.shakeOffsetX,
      shakeOffsetY: kinetic.shakeOffsetY,
      progress01,
    });
  }

  return {
    timeline,
    fps,
    speed,
    outputDurationMs,
    frameCount,
    frames,
  };
}
