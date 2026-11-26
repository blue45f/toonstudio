/**
 * 세로형 웹툰 원고 → 9:16(`1080×1920`) 릴스·쇼츠 비트 동기화 카메라 자동 연출기 및
 * 모바일 스토어(`120×120`·`160×210`) 썸네일 가독성·초점 대비 감사기.
 *
 * - 외부 서버 렌더링·API 호출 없이 브라우저·워커 메모리 안에서 즉시 계산한다(`₩0`).
 * - 말풍선 읽기 순서와 오디오 비트 타임스탬프를 결합해 3차 이징(Cubic Easing) 기반의
 *   Ken-Burns 줌·패닝 키프레임을 생성하며, 볼록 구간 포함 불변식(Convex Containment)으로
 *   전 프레임 말풍선 잘림 건수 `0건`을 보장한다.
 * - 면적 적분(Area-Box Integration) 리샘플러로 표지·회차 원화를 `120×120`·`160×210` 크기로 축소한 뒤
 *   타이틀 로고 Michelson·WCAG 명도 대비, 인물 얼굴 초점 현저성 비율, 실루엣 복잡도를 정량 진단한다.
 */

export type CubicEasingPreset = "cubic-in-out" | "cubic-out" | "cubic-in" | "smooth-step";
export type KenBurnsMotionStyle = "auto" | "push-in" | "pull-out" | "pan-down" | "pan-across";
export type StorefrontThumbnailTargetId = "episode-120x120" | "series-160x210";

export interface SourcePoint { readonly x: number; readonly y: number }
export interface SourceRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export type NormalizedRect = SourceRect;

export interface WebtoonSourcePanel {
  readonly panelId: string;
  readonly bounds: SourceRect;
  readonly focalPoint?: SourcePoint;
  readonly dramaticWeight?: number;
  readonly motionStyle?: KenBurnsMotionStyle;
}

export interface WebtoonBalloonAnchor {
  readonly balloonId: string;
  readonly panelId: string;
  readonly readingOrder: number;
  readonly bounds: SourceRect;
  readonly charCount?: number;
  readonly isSfx?: boolean;
}

export interface ShortformAutoDirectorInput {
  readonly stripWidthPx: number;
  readonly stripHeightPx: number;
  readonly panels: readonly WebtoonSourcePanel[];
  readonly balloons: readonly WebtoonBalloonAnchor[];
  readonly beatsSec: readonly number[];
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly fps?: number;
  readonly fallbackBpm?: number;
  readonly balloonSafePaddingPx?: number;
  readonly defaultEasing?: CubicEasingPreset;
  readonly readingCharsPerSec?: number;
}

export interface ShortformCameraCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
}

export interface ShortformCameraKeyframe {
  readonly keyframeIndex: number;
  readonly shotId: string;
  readonly panelId: string;
  readonly timeSec: number;
  readonly frameIndex: number;
  readonly crop: ShortformCameraCrop;
  readonly easingToNext: CubicEasingPreset;
  readonly beatAligned: boolean;
}

export interface ShortformCameraShot {
  readonly shotId: string;
  readonly panelId: string;
  readonly activeBalloonIds: readonly string[];
  readonly startSec: number;
  readonly endSec: number;
  readonly durationSec: number;
  readonly snappedBeatIndex: number;
  readonly beatSnapDeltaMs: number;
  readonly beatAligned: boolean;
  readonly motionStyle: Exclude<KenBurnsMotionStyle, "auto">;
  readonly easing: CubicEasingPreset;
  readonly startCrop: ShortformCameraCrop;
  readonly endCrop: ShortformCameraCrop;
  readonly panDistancePx: number;
  readonly summaryKo: string;
}

export interface ShortformDirectorPlan {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly aspectRatio: number;
  readonly fps: number;
  readonly stripWidthPx: number;
  readonly stripHeightPx: number;
  readonly shots: readonly ShortformCameraShot[];
  readonly keyframes: readonly ShortformCameraKeyframe[];
  readonly totalDurationSec: number;
  readonly totalFrames: number;
  readonly clippedBalloonCount: number;
  readonly beatSyncRatio: number;
  readonly serverCostKrw: 0;
}

export interface ShortformSampledFrame {
  readonly timeSec: number;
  readonly shotId: string;
  readonly panelId: string;
  readonly activeBalloonIds: readonly string[];
  readonly progressEased: number;
  readonly crop: ShortformCameraCrop;
}

export interface StorefrontThumbnailSpec {
  readonly id: StorefrontThumbnailTargetId;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly labelKo: string;
}

export const STOREFRONT_THUMBNAIL_SPECS: readonly StorefrontThumbnailSpec[] = Object.freeze([
  { id: "episode-120x120", widthPx: 120, heightPx: 120, labelKo: "회차 목록 정사각 썸네일 (120×120)" },
  { id: "series-160x210", widthPx: 160, heightPx: 210, labelKo: "작품 목록 세로형 카드 썸네일 (160×210)" },
]);

export interface AreaBoxDownsampleOptions {
  readonly fitMode?: "cover" | "stretch";
  readonly focalCenter?: SourcePoint;
  readonly linearLightIntegration?: boolean;
}

export interface DownsampledThumbnailBuffer {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rgba: Uint8ClampedArray;
  readonly cropSourceRect: SourceRect;
}

export interface ThumbnailAuditThresholds {
  readonly minWcagContrast?: number;
  readonly minMichelsonContrast?: number;
  readonly minFaceFocalSaliencyRatio?: number;
  readonly maxSilhouetteClutterScore?: number;
}

export interface ThumbnailLegibilityAuditInput {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly titleRegion?: NormalizedRect;
  readonly faceFocalRegion?: NormalizedRect;
  readonly titleForegroundRgb?: readonly [number, number, number];
  readonly thresholds?: ThumbnailAuditThresholds;
}

export interface ThumbnailVariantAudit {
  readonly targetId: StorefrontThumbnailTargetId;
  readonly labelKo: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly downsampledRgba: Uint8ClampedArray;
  readonly titleMichelsonContrast: number;
  readonly titleWcagContrastRatio: number;
  readonly faceFocalSaliencyRatio: number;
  readonly silhouetteClutterScore: number;
  readonly score100: number;
  readonly pass: boolean;
  readonly issuesKo: readonly string[];
}

export interface StorefrontThumbnailAuditReport {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly variants: readonly ThumbnailVariantAudit[];
  readonly overallPass: boolean;
  readonly overallScore100: number;
  readonly recommendationsKo: readonly string[];
  readonly serverCostKrw: 0;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function roundTo(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 오버슈트가 없는 단조 증가 `[0, 1] -> [0, 1]` 3차 이징을 계산한다. */
export function evaluateCubicEasing(preset: CubicEasingPreset, rawT: number): number {
  const t = clamp(rawT, 0, 1);
  if (preset === "cubic-in") return t * t * t;
  if (preset === "cubic-out") return 1 - ((1 - t) ** 3);
  if (preset === "smooth-step") return t * t * (3 - 2 * t);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function sanitizeRect(rect: SourceRect, stripW: number, stripH: number): SourceRect {
  const w = clamp(rect.width, 1, stripW);
  const h = clamp(rect.height, 1, stripH);
  return { x: clamp(rect.x, 0, Math.max(0, stripW - w)), y: clamp(rect.y, 0, Math.max(0, stripH - h)), width: w, height: h };
}

function makeCropRecord(x: number, y: number, width: number, stripW: number, aspect: number): ShortformCameraCrop {
  const height = width / aspect;
  return { x: roundTo(x, 3), y: roundTo(y, 3), width: roundTo(width, 3), height: roundTo(height, 3), centerX: roundTo(x + width * 0.5, 3), centerY: roundTo(y + height * 0.5, 3), zoom: roundTo(stripW / width, 4) };
}

function buildCropContainingRect(desiredCx: number, desiredCy: number, desiredWidth: number, mustContain: SourceRect | null, stripW: number, stripH: number, aspect: number): ShortformCameraCrop {
  const baseMaxW = Math.min(stripW, stripH * aspect);
  const reqW = mustContain ? Math.max(mustContain.width, mustContain.height * aspect) : 1;
  const width = clamp(desiredWidth, Math.max(reqW, Math.min(baseMaxW, stripW * 0.28)), Math.max(baseMaxW, reqW));
  const height = width / aspect;
  let x = desiredCx - width * 0.5;
  let y = desiredCy - height * 0.5;

  if (mustContain) {
    const bx1 = mustContain.x + mustContain.width, by1 = mustContain.y + mustContain.height;
    const loX = width <= stripW ? Math.max(0, bx1 - width) : bx1 - width;
    const hiX = width <= stripW ? Math.min(stripW - width, mustContain.x) : mustContain.x;
    const loY = height <= stripH ? Math.max(0, by1 - height) : by1 - height;
    const hiY = height <= stripH ? Math.min(stripH - height, mustContain.y) : mustContain.y;
    x = clamp(x, Math.min(loX, hiX), Math.max(loX, hiX));
    y = clamp(y, Math.min(loY, hiY), Math.max(loY, hiY));
  } else {
    x = width <= stripW ? clamp(x, 0, stripW - width) : (stripW - width) * 0.5;
    y = height <= stripH ? clamp(y, 0, stripH - height) : (stripH - height) * 0.5;
  }
  return makeCropRecord(x, y, width, stripW, aspect);
}

function interpolateCrop(a: ShortformCameraCrop, b: ShortformCameraCrop, u: number, stripW: number, aspect: number): ShortformCameraCrop {
  return makeCropRecord((1 - u) * a.x + u * b.x, (1 - u) * a.y + u * b.y, (1 - u) * a.width + u * b.width, stripW, aspect);
}

function cropContainsBalloon(crop: ShortformCameraCrop, balloon: SourceRect, eps = 0.05): boolean {
  return crop.x <= balloon.x + eps && crop.y <= balloon.y + eps && crop.x + crop.width >= balloon.x + balloon.width - eps && crop.y + crop.height >= balloon.y + balloon.height - eps;
}

function buildBeatGrid(rawBeatsSec: readonly number[], fallbackBpm: number, minHorizonSec: number): readonly number[] {
  const stepSec = 60 / clamp(fallbackBpm, 40, 240);
  const sorted = rawBeatsSec.filter((b) => Number.isFinite(b) && b >= 0).slice().sort((a, b) => a - b);
  const merged: number[] = [0];
  for (const beat of sorted) {
    if (beat - (merged[merged.length - 1] ?? 0) >= 0.08) merged.push(beat);
  }
  let tail = merged[merged.length - 1] ?? 0;
  while (tail < minHorizonSec) {
    tail = roundTo(tail + stepSec, 4);
    merged.push(tail);
  }
  return merged;
}

function resolveMotionStyle(requested: KenBurnsMotionStyle | undefined, idx: number, isDialogue: boolean): Exclude<KenBurnsMotionStyle, "auto"> {
  if (requested && requested !== "auto") return requested;
  if (isDialogue) return idx % 2 === 0 ? "push-in" : "pan-across";
  const cycle: readonly Exclude<KenBurnsMotionStyle, "auto">[] = ["push-in", "pan-down", "pull-out", "pan-across"];
  return cycle[idx % cycle.length] ?? "push-in";
}

function snapBeatAfter(beats: readonly number[], cursor: number, currentSec: number, idealDur: number, minRatio: number) {
  const minEnd = currentSec + Math.max(0.55, idealDur * minRatio);
  let nextCursor = cursor;
  while (nextCursor < beats.length - 1 && (beats[nextCursor] ?? 0) < minEnd) nextCursor += 1;
  const candidate = beats[nextCursor] ?? (currentSec + idealDur);
  const endSec = roundTo(Math.max(currentSec + 0.5, candidate), 4);
  return {
    cursor: nextCursor,
    endSec,
    beatAligned: Math.abs(endSec - candidate) <= 0.005,
    snapDeltaMs: roundTo(Math.abs(endSec - (currentSec + idealDur)) * 1000, 2),
  };
}

function createCameraShot(
  shotIndex: number, panelId: string, activeBalloonIds: readonly string[], startSec: number,
  snap: ReturnType<typeof snapBeatAfter>, motionStyle: Exclude<KenBurnsMotionStyle, "auto">,
  easing: CubicEasingPreset, startCrop: ShortformCameraCrop, endCrop: ShortformCameraCrop, summaryKo: string,
): ShortformCameraShot {
  return {
    shotId: `shot-${shotIndex + 1}`, panelId, activeBalloonIds, startSec, endSec: snap.endSec,
    durationSec: roundTo(snap.endSec - startSec, 4), snappedBeatIndex: snap.cursor,
    beatSnapDeltaMs: snap.snapDeltaMs, beatAligned: snap.beatAligned, motionStyle, easing,
    startCrop, endCrop, panDistancePx: roundTo(Math.hypot(endCrop.centerX - startCrop.centerX, endCrop.centerY - startCrop.centerY), 2), summaryKo,
  };
}

/** 세로형 웹툰 컷·말풍선 읽기 순서·오디오 비트를 결합해 말풍선 잘림이 없는 9:16 숏폼 카메라 플랜을 생성한다. */
export function directWebtoonShortformCamera(input: ShortformAutoDirectorInput): ShortformDirectorPlan {
  const viewportWidthPx = Math.max(180, Math.round(input.viewportWidthPx ?? 1080));
  const viewportHeightPx = Math.max(320, Math.round(input.viewportHeightPx ?? 1920));
  const aspectRatio = viewportWidthPx / viewportHeightPx;
  const fps = clamp(Math.round(input.fps ?? 60), 24, 120);
  const stripWidthPx = Math.max(320, Math.round(input.stripWidthPx));
  const stripHeightPx = Math.max(320, Math.round(input.stripHeightPx));
  const padPx = clamp(input.balloonSafePaddingPx ?? 18, 0, 120);
  const defaultEasing: CubicEasingPreset = input.defaultEasing ?? "cubic-in-out";
  const charsPerSec = clamp(input.readingCharsPerSec ?? 11, 4, 28);

  const orderedPanels = input.panels.length > 0
    ? input.panels.map((p) => ({ ...p, bounds: sanitizeRect(p.bounds, stripWidthPx, stripHeightPx) })).sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
    : [{ panelId: "panel-auto-0", bounds: { x: 0, y: 0, width: stripWidthPx, height: stripHeightPx } }];

  const sanitizedBalloons = input.balloons
    .map((b) => ({ ...b, bounds: sanitizeRect(b.bounds, stripWidthPx, stripHeightPx) }))
    .sort((a, b) => a.readingOrder - b.readingOrder || a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);

  const balloonsByPanel = new Map<string, WebtoonBalloonAnchor[]>();
  const balloonLookup = new Map<string, SourceRect>();
  for (const balloon of sanitizedBalloons) {
    balloonLookup.set(balloon.balloonId, balloon.bounds);
    const bucket = balloonsByPanel.get(balloon.panelId);
    if (bucket) bucket.push(balloon);
    else balloonsByPanel.set(balloon.panelId, [balloon]);
  }

  const maxCropW = Math.min(stripWidthPx, stripHeightPx * aspectRatio);
  const maxCropH = maxCropW / aspectRatio;
  const beats = buildBeatGrid(input.beatsSec, input.fallbackBpm ?? 120, (Math.max(orderedPanels.length, sanitizedBalloons.length) + 4) * 3.2);

  const shots: ShortformCameraShot[] = [];
  let currentSec = 0;
  let beatCursor = 0;

  for (const panel of orderedPanels) {
    const panelBalloons = balloonsByPanel.get(panel.panelId) ?? [];
    const weight = clamp(panel.dramaticWeight ?? 1, 0.5, 2.0);
    const focal: SourcePoint = panel.focalPoint ?? { x: panel.bounds.x + panel.bounds.width * 0.5, y: panel.bounds.y + panel.bounds.height * 0.42 };

    if (panelBalloons.length === 0) {
      const style = resolveMotionStyle(panel.motionStyle, shots.length, false);
      const snap = snapBeatAfter(beats, beatCursor, currentSec, clamp(1.15 * weight, 0.75, 2.8), 0.72);
      beatCursor = snap.cursor;
      const baseW = clamp(panel.bounds.width * 0.92, maxCropW * 0.52, maxCropW);
      const zoomW = clamp(baseW / (1 + 0.12 * weight), maxCropW * 0.45, maxCropW);
      const panY = style === "pan-down" ? Math.min(panel.bounds.height * 0.22, 180) : 0;
      const panX = style === "pan-across" ? Math.min(panel.bounds.width * 0.16, 120) : 0;
      const startCrop = buildCropContainingRect(focal.x - panX * 0.5, focal.y - panY * 0.5, style === "pull-out" ? zoomW : baseW, null, stripWidthPx, stripHeightPx, aspectRatio);
      const endCrop = buildCropContainingRect(focal.x + panX * 0.5, focal.y + panY * 0.5, style === "push-in" ? zoomW : baseW, null, stripWidthPx, stripHeightPx, aspectRatio);
      shots.push(createCameraShot(shots.length, panel.panelId, [], currentSec, snap, style, defaultEasing, startCrop, endCrop, `${panel.panelId} 무대사 연출 컷 (${style})`));
      currentSec = snap.endSec;
      continue;
    }

    for (let bi = 0; bi < panelBalloons.length; bi += 1) {
      const balloon = panelBalloons[bi];
      if (!balloon) continue;
      const nextBalloon = panelBalloons[bi + 1];
      const style = resolveMotionStyle(panel.motionStyle, shots.length, true);
      const chars = Math.max(4, balloon.charCount ?? (balloon.isSfx ? 5 : 14));
      const readSec = balloon.isSfx ? 0.75 : Math.max(0.95, chars / charsPerSec);
      const snap = snapBeatAfter(beats, beatCursor, currentSec, clamp(readSec * (0.9 + 0.1 * weight), 0.7, 3.6), 0.78);
      beatCursor = snap.cursor;

      const cleanB = balloon.bounds;
      const padX = Math.min(padPx, Math.max(0, (maxCropW - cleanB.width) * 0.5));
      const padY = Math.min(padPx, Math.max(0, (maxCropH - cleanB.height) * 0.5));
      const x0 = Math.max(0, cleanB.x - padX);
      const y0 = Math.max(0, cleanB.y - padY);
      const padded: SourceRect = { x: x0, y: y0, width: Math.max(1, Math.min(stripWidthPx, cleanB.x + cleanB.width + padX) - x0), height: Math.max(1, Math.min(stripHeightPx, cleanB.y + cleanB.height + padY) - y0) };

      const bcx = cleanB.x + cleanB.width * 0.5;
      const bcy = cleanB.y + cleanB.height * 0.5;
      const leadX = nextBalloon ? bcx * 0.65 + (nextBalloon.bounds.x + nextBalloon.bounds.width * 0.5) * 0.35 : bcx * 0.7 + focal.x * 0.3;
      const leadY = nextBalloon ? bcy * 0.65 + (nextBalloon.bounds.y + nextBalloon.bounds.height * 0.5) * 0.35 : bcy * 0.7 + focal.y * 0.3;
      const wideW = clamp(maxCropW * 0.88, maxCropW * 0.55, maxCropW);
      const tightW = clamp(wideW / (1 + 0.09 * weight), maxCropW * 0.5, maxCropW);
      const startCrop = buildCropContainingRect(bcx * 0.8 + focal.x * 0.2, bcy * 0.8 + focal.y * 0.2, style === "pull-out" ? tightW : wideW, padded, stripWidthPx, stripHeightPx, aspectRatio);
      const endCrop = buildCropContainingRect(leadX, leadY, style === "push-in" ? tightW : wideW, padded, stripWidthPx, stripHeightPx, aspectRatio);

      shots.push(createCameraShot(shots.length, panel.panelId, [balloon.balloonId], currentSec, snap, style, defaultEasing, startCrop, endCrop, `${panel.panelId} 말풍선 #${balloon.readingOrder}(${balloon.balloonId}) 비트 동기화 컷`));
      currentSec = snap.endSec;
    }
  }

  const keyframes: ShortformCameraKeyframe[] = [];
  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    if (!shot) continue;
    keyframes.push({ keyframeIndex: keyframes.length, shotId: shot.shotId, panelId: shot.panelId, timeSec: shot.startSec, frameIndex: Math.round(shot.startSec * fps), crop: shot.startCrop, easingToNext: shot.easing, beatAligned: i === 0 ? true : (shots[i - 1]?.beatAligned ?? true) });
    if (i === shots.length - 1) {
      keyframes.push({ keyframeIndex: keyframes.length, shotId: shot.shotId, panelId: shot.panelId, timeSec: shot.endSec, frameIndex: Math.round(shot.endSec * fps), crop: shot.endCrop, easingToNext: shot.easing, beatAligned: shot.beatAligned });
    }
  }

  let clippedBalloonCount = 0;
  for (const shot of shots) {
    for (const balloonId of shot.activeBalloonIds) {
      const bRect = balloonLookup.get(balloonId);
      if (!bRect) continue;
      const clipped = [0, 0.25, 0.5, 0.75, 1].some((p) => !cropContainsBalloon(interpolateCrop(shot.startCrop, shot.endCrop, evaluateCubicEasing(shot.easing, p), stripWidthPx, aspectRatio), bRect));
      if (clipped) clippedBalloonCount += 1;
    }
  }

  const totalDurationSec = shots[shots.length - 1]?.endSec ?? 0;
  const alignedCount = shots.filter((s) => s.beatAligned).length;
  return {
    viewportWidthPx,
    viewportHeightPx,
    aspectRatio: roundTo(aspectRatio, 6),
    fps,
    stripWidthPx,
    stripHeightPx,
    shots,
    keyframes,
    totalDurationSec,
    totalFrames: Math.max(1, Math.round(totalDurationSec * fps)),
    clippedBalloonCount,
    beatSyncRatio: shots.length > 0 ? roundTo(alignedCount / shots.length, 4) : 1,
    serverCostKrw: 0,
  };
}

/** 생성된 숏폼 카메라 플랜에서 임의 시각(`timeSec`)의 3차 이징 보간 프레임을 샘플링한다. */
export function sampleShortformCameraFrame(plan: ShortformDirectorPlan, timeSec: number): ShortformSampledFrame {
  const t = clamp(timeSec, 0, plan.totalDurationSec);
  const lastShot = plan.shots[plan.shots.length - 1];
  if (!lastShot) {
    return {
      timeSec: t,
      shotId: "shot-empty",
      panelId: "panel-empty",
      activeBalloonIds: [],
      progressEased: 0,
      crop: buildCropContainingRect(plan.stripWidthPx * 0.5, plan.stripHeightPx * 0.5, plan.stripWidthPx, null, plan.stripWidthPx, plan.stripHeightPx, plan.aspectRatio),
    };
  }
  const matched = plan.shots.find((s, idx) => (idx === plan.shots.length - 1 ? t >= s.startSec && t <= s.endSec : t >= s.startSec && t < s.endSec)) ?? lastShot;
  const u = evaluateCubicEasing(matched.easing, clamp((t - matched.startSec) / Math.max(1e-6, matched.endSec - matched.startSec), 0, 1));
  return {
    timeSec: roundTo(t, 4),
    shotId: matched.shotId,
    panelId: matched.panelId,
    activeBalloonIds: matched.activeBalloonIds,
    progressEased: roundTo(u, 5),
    crop: interpolateCrop(matched.startCrop, matched.endCrop, u, plan.stripWidthPx, plan.aspectRatio),
  };
}

function srgbByteToLinear(byteVal: number): number {
  const c = clamp(byteVal, 0, 255) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(linearVal: number): number {
  const c = clamp(linearVal, 0, 1);
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
  return Math.round(clamp(encoded * 255, 0, 255));
}

function computeCoverCrop(srcW: number, srcH: number, dstW: number, dstH: number, focal?: SourcePoint): SourceRect {
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  if (Math.abs(srcAspect - dstAspect) <= 1e-5) return { x: 0, y: 0, width: srcW, height: srcH };
  const cx = focal ? clamp(focal.x, 0, srcW) : srcW * 0.5;
  const cy = focal ? clamp(focal.y, 0, srcH) : srcH * 0.45;
  if (srcAspect > dstAspect) {
    const cropW = srcH * dstAspect;
    return { x: clamp(cx - cropW * 0.5, 0, srcW - cropW), y: 0, width: cropW, height: srcH };
  }
  const cropH = srcW / dstAspect;
  return { x: 0, y: clamp(cy - cropH * 0.5, 0, srcH - cropH), width: srcW, height: cropH };
}

/** 면적 적분(Area-Box Integration)으로 고해상도 원화를 모바일 스토어 규격(`120×120`, `160×210`)으로 축소한다. */
export function downsampleRgbaAreaBox(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  options: AreaBoxDownsampleOptions = {},
): DownsampledThumbnailBuffer {
  const srcW = Math.max(1, Math.floor(sourceWidth));
  const srcH = Math.max(1, Math.floor(sourceHeight));
  const dstW = Math.max(1, Math.floor(targetWidth));
  const dstH = Math.max(1, Math.floor(targetHeight));
  const useLinear = options.linearLightIntegration ?? true;
  const cropRect = (options.fitMode ?? "cover") === "cover"
    ? computeCoverCrop(srcW, srcH, dstW, dstH, options.focalCenter)
    : { x: 0, y: 0, width: srcW, height: srcH };

  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleX = cropRect.width / dstW;
  const scaleY = cropRect.height / dstH;

  for (let dy = 0; dy < dstH; dy += 1) {
    const sy0 = cropRect.y + dy * scaleY;
    const sy1 = Math.min(srcH, sy0 + scaleY);
    const iyStart = Math.floor(sy0);
    const iyEnd = Math.min(srcH - 1, Math.ceil(sy1) - 1);

    for (let dx = 0; dx < dstW; dx += 1) {
      const sx0 = cropRect.x + dx * scaleX;
      const sx1 = Math.min(srcW, sx0 + scaleX);
      const ixStart = Math.floor(sx0);
      const ixEnd = Math.min(srcW - 1, Math.ceil(sx1) - 1);
      let accR = 0, accG = 0, accB = 0, accA = 0, totalArea = 0;

      for (let iy = iyStart; iy <= iyEnd; iy += 1) {
        const wy = Math.max(0, Math.min(sy1, iy + 1) - Math.max(sy0, iy));
        if (wy <= 0) continue;
        const rowBase = iy * srcW * 4;
        for (let ix = ixStart; ix <= ixEnd; ix += 1) {
          const wx = Math.max(0, Math.min(sx1, ix + 1) - Math.max(sx0, ix));
          if (wx <= 0) continue;
          const area = wx * wy;
          const idx = rowBase + ix * 4;
          const r = sourceRgba[idx] ?? 0, g = sourceRgba[idx + 1] ?? 0, b = sourceRgba[idx + 2] ?? 0;
          accR += (useLinear ? srgbByteToLinear(r) : r) * area;
          accG += (useLinear ? srgbByteToLinear(g) : g) * area;
          accB += (useLinear ? srgbByteToLinear(b) : b) * area;
          accA += ((sourceRgba[idx + 3] ?? 255) / 255) * area;
          totalArea += area;
        }
      }

      const dstIdx = (dy * dstW + dx) * 4;
      if (totalArea > 0) {
        const inv = 1 / totalArea;
        out[dstIdx] = useLinear ? linearToSrgbByte(accR * inv) : Math.round(accR * inv);
        out[dstIdx + 1] = useLinear ? linearToSrgbByte(accG * inv) : Math.round(accG * inv);
        out[dstIdx + 2] = useLinear ? linearToSrgbByte(accB * inv) : Math.round(accB * inv);
        out[dstIdx + 3] = Math.round(clamp(accA * inv * 255, 0, 255));
      } else {
        out[dstIdx + 3] = 255;
      }
    }
  }
  return { widthPx: dstW, heightPx: dstH, rgba: out, cropSourceRect: cropRect };
}

function mapNormalizedRectToThumb(norm: NormalizedRect, srcW: number, srcH: number, crop: SourceRect, dstW: number, dstH: number) {
  const tx0 = Math.ceil((((clamp(norm.x, 0, 1) * srcW) - crop.x) / crop.width) * dstW);
  const ty0 = Math.ceil((((clamp(norm.y, 0, 1) * srcH) - crop.y) / crop.height) * dstH);
  const tx1 = Math.floor((((clamp(norm.x + norm.width, 0, 1) * srcW) - crop.x) / crop.width) * dstW);
  const ty1 = Math.floor((((clamp(norm.y + norm.height, 0, 1) * srcH) - crop.y) / crop.height) * dstH);
  const x0 = clamp(tx0, 0, dstW - 2);
  const y0 = clamp(ty0, 0, dstH - 2);
  return { x0, y0, x1: clamp(Math.max(x0 + 2, tx1), x0 + 2, dstW), y1: clamp(Math.max(y0 + 2, ty1), y0 + 2, dstH) };
}

function computeOtsuClusterLuminances(samples: readonly number[]): readonly [number, number] {
  if (samples.length === 0) return [0, 0];
  const bins = new Int32Array(256);
  for (const lum of samples) {
    const b = clamp(Math.round(lum * 255), 0, 255);
    bins[b] = (bins[b] ?? 0) + 1;
  }
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * (bins[i] ?? 0);

  let sumBg = 0, weightBg = 0, maxBetweenVar = -1, bestThreshold = 127;
  for (let t = 0; t < 255; t += 1) {
    weightBg += bins[t] ?? 0;
    if (weightBg === 0) continue;
    const weightFg = samples.length - weightBg;
    if (weightFg === 0) break;
    sumBg += t * (bins[t] ?? 0);
    const diff = sumBg / weightBg - (sumAll - sumBg) / weightFg;
    const betweenVar = weightBg * weightFg * diff * diff;
    if (betweenVar > maxBetweenVar) {
      maxBetweenVar = betweenVar;
      bestThreshold = t;
    }
  }

  const threshLum = bestThreshold / 255;
  let loSum = 0, loCount = 0, hiSum = 0, hiCount = 0;
  for (const lum of samples) {
    if (lum <= threshLum) { loSum += lum; loCount += 1; } else { hiSum += lum; hiCount += 1; }
  }
  const loMean = loCount > 0 ? loSum / loCount : 0;
  return [loMean, hiCount > 0 ? hiSum / hiCount : loMean];
}

/** 모바일 스토어 썸네일(`120×120`·`160×210`) 가독성, 로고 대비, 얼굴 초점 현저성, 실루엣 복잡도를 감사한다. */
export function auditStorefrontThumbnailLegibility(input: ThumbnailLegibilityAuditInput): StorefrontThumbnailAuditReport {
  const srcW = Math.max(4, Math.floor(input.sourceWidth));
  const srcH = Math.max(4, Math.floor(input.sourceHeight));
  const titleNorm: NormalizedRect = input.titleRegion ?? { x: 0.1, y: 0.68, width: 0.8, height: 0.24 };
  const focalNorm: NormalizedRect = input.faceFocalRegion ?? { x: 0.22, y: 0.12, width: 0.56, height: 0.48 };
  const minWcag = input.thresholds?.minWcagContrast ?? 3.0;
  const minMichelson = input.thresholds?.minMichelsonContrast ?? 0.45;
  const minFocalRatio = input.thresholds?.minFaceFocalSaliencyRatio ?? 1.15;
  const maxClutter = input.thresholds?.maxSilhouetteClutterScore ?? 0.55;
  const focalPointPx: SourcePoint = { x: (focalNorm.x + focalNorm.width * 0.5) * srcW, y: (focalNorm.y + focalNorm.height * 0.5) * srcH };

  const variants: ThumbnailVariantAudit[] = [];
  const recommendationSet = new Set<string>();

  for (const spec of STOREFRONT_THUMBNAIL_SPECS) {
    const down = downsampleRgbaAreaBox(input.rgba, srcW, srcH, spec.widthPx, spec.heightPx, { fitMode: "cover", focalCenter: focalPointPx, linearLightIntegration: true });
    const w = down.widthPx, h = down.heightPx, pixelCount = w * h;
    const lum = new Float32Array(pixelCount);
    const chroma = new Float32Array(pixelCount);
    let lumSum = 0, chromaSum = 0;

    for (let i = 0; i < pixelCount; i += 1) {
      const idx = i * 4;
      const rl = srgbByteToLinear(down.rgba[idx] ?? 0);
      const gl = srgbByteToLinear(down.rgba[idx + 1] ?? 0);
      const bl = srgbByteToLinear(down.rgba[idx + 2] ?? 0);
      const yVal = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      const chr = Math.max(rl, gl, bl) - Math.min(rl, gl, bl);
      lum[i] = yVal;
      chroma[i] = chr;
      lumSum += yVal;
      chromaSum += chr;
    }

    const meanLum = lumSum / pixelCount;
    const meanChroma = chromaSum / pixelCount;
    const grad = new Float32Array(pixelCount);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x;
        const gx = -(lum[p - w - 1] ?? 0) + (lum[p - w + 1] ?? 0) - 2 * (lum[p - 1] ?? 0) + 2 * (lum[p + 1] ?? 0) - (lum[p + w - 1] ?? 0) + (lum[p + w + 1] ?? 0);
        const gy = -(lum[p - w - 1] ?? 0) - 2 * (lum[p - w] ?? 0) - (lum[p - w + 1] ?? 0) + (lum[p + w - 1] ?? 0) + 2 * (lum[p + w] ?? 0) + (lum[p + w + 1] ?? 0);
        grad[p] = Math.hypot(gx, gy) * 0.25;
      }
    }

    const titleBox = mapNormalizedRectToThumb(titleNorm, srcW, srcH, down.cropSourceRect, w, h);
    const focalBox = mapNormalizedRectToThumb(focalNorm, srcW, srcH, down.cropSourceRect, w, h);
    let lMin = 0, lMax = 0;

    if (input.titleForegroundRgb) {
      const [tr, tg, tb] = input.titleForegroundRgb;
      let fgSum = 0, fgCount = 0, bgSum = 0, bgCount = 0;
      for (let y = titleBox.y0; y < titleBox.y1; y += 1) {
        for (let x = titleBox.x0; x < titleBox.x1; x += 1) {
          const p = y * w + x, idx = p * 4;
          if (Math.hypot((down.rgba[idx] ?? 0) - tr, (down.rgba[idx + 1] ?? 0) - tg, (down.rgba[idx + 2] ?? 0) - tb) <= 95) {
            fgSum += lum[p] ?? 0; fgCount += 1;
          } else {
            bgSum += lum[p] ?? 0; bgCount += 1;
          }
        }
      }
      if (fgCount > 0 && bgCount > 0) {
        lMin = Math.min(fgSum / fgCount, bgSum / bgCount);
        lMax = Math.max(fgSum / fgCount, bgSum / bgCount);
      }
    }

    if (lMax === 0 && lMin === 0) {
      const titleSamples: number[] = [];
      for (let y = titleBox.y0; y < titleBox.y1; y += 1) {
        for (let x = titleBox.x0; x < titleBox.x1; x += 1) titleSamples.push(lum[y * w + x] ?? 0);
      }
      const [cLo, cHi] = computeOtsuClusterLuminances(titleSamples);
      lMin = Math.min(cLo, cHi);
      lMax = Math.max(cLo, cHi);
    }

    const titleMichelsonContrast = lMax + lMin > 1e-6 ? (lMax - lMin) / (lMax + lMin) : 0;
    const titleWcagContrastRatio = (lMax + 0.05) / (lMin + 0.05);
    let focalSaliencySum = 0, focalCount = 0, bgSaliencySum = 0, bgCount = 0, bgStrongEdges = 0, bgGradEnergy = 0;

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        const sal = Math.abs((lum[p] ?? 0) - meanLum) * 0.42 + Math.abs((chroma[p] ?? 0) - meanChroma) * 0.28 + (grad[p] ?? 0) * 0.30;
        if (x >= focalBox.x0 && x < focalBox.x1 && y >= focalBox.y0 && y < focalBox.y1) {
          focalSaliencySum += sal; focalCount += 1;
        } else if (!(x >= titleBox.x0 && x < titleBox.x1 && y >= titleBox.y0 && y < titleBox.y1)) {
          bgSaliencySum += sal; bgCount += 1;
          const gVal = grad[p] ?? 0;
          bgGradEnergy += gVal;
          if (gVal >= 0.14) bgStrongEdges += 1;
        }
      }
    }

    const faceFocalSaliencyRatio = (focalCount > 0 ? focalSaliencySum / focalCount : 0) / Math.max(bgCount > 0 ? bgSaliencySum / bgCount : 0.01, 0.005);
    const silhouetteClutterScore = clamp((bgCount > 0 ? bgStrongEdges / bgCount : 0) * 1.35 + (bgCount > 0 ? bgGradEnergy / bgCount : 0) * 1.15, 0, 1);

    const issuesKo: string[] = [];
    if (titleWcagContrastRatio < minWcag || titleMichelsonContrast < minMichelson) {
      const msg = `${spec.labelKo}: 타이틀 로고 명도 대비가 낮습니다(WCAG ${roundTo(titleWcagContrastRatio, 2)}:1). 외곽 테두리나 어두운 받침을 보강하세요.`;
      issuesKo.push(msg); recommendationSet.add(msg);
    }
    if (faceFocalSaliencyRatio < minFocalRatio) {
      const msg = `${spec.labelKo}: 인물 얼굴 초점 대비가 배경에 묻힙니다(현저성 비율 ${roundTo(faceFocalSaliencyRatio, 2)}). 얼굴 채도·림라이트를 높이세요.`;
      issuesKo.push(msg); recommendationSet.add(msg);
    }
    if (silhouetteClutterScore > maxClutter) {
      const msg = `${spec.labelKo}: 배경 외곽선 밀도가 높아 인물 실루엣이 뭉개집니다(복잡도 ${roundTo(silhouetteClutterScore, 2)}). 배경 디테일을 덜어내세요.`;
      issuesKo.push(msg); recommendationSet.add(msg);
    }

    const score100 = roundTo(clamp((titleWcagContrastRatio / 7) * 35, 0, 35) + clamp((faceFocalSaliencyRatio / 2.2) * 35, 0, 35) + clamp((1 - silhouetteClutterScore) * 30, 0, 30), 1);
    variants.push({
      targetId: spec.id,
      labelKo: spec.labelKo,
      widthPx: w,
      heightPx: h,
      downsampledRgba: down.rgba,
      titleMichelsonContrast: roundTo(titleMichelsonContrast, 4),
      titleWcagContrastRatio: roundTo(titleWcagContrastRatio, 3),
      faceFocalSaliencyRatio: roundTo(faceFocalSaliencyRatio, 3),
      silhouetteClutterScore: roundTo(silhouetteClutterScore, 4),
      score100,
      pass: issuesKo.length === 0,
      issuesKo,
    });
  }

  const totalScore = variants.reduce((acc, v) => acc + v.score100, 0);
  return {
    sourceWidth: srcW,
    sourceHeight: srcH,
    variants,
    overallPass: variants.every((v) => v.pass),
    overallScore100: variants.length > 0 ? roundTo(totalScore / variants.length, 1) : 0,
    recommendationsKo: [...recommendationSet],
    serverCostKrw: 0,
  };
}
