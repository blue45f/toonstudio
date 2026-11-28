/**
 * Wave-82: 비파괴 방사형 집중선 SVG 레이어 내보내기 및 오디오-스크롤 동기화 매니페스트 빌더.
 *
 * - `renderAudioDrivenSpeedlinesSvg`: 컷별 방사형 집중선 벡터를 비파괴 SVG 오버레이로 직렬화한다.
 *   인물 얼굴·말풍선 중앙 안전 타원을 침범하는 선 0개, `NaN`/`Infinity` 좌표 0개를 보장한다.
 * - `buildAudioScrollSyncManifest`: 세로 스크롤 위치(`scrollY`)와 오디오 재생 시각(`audioTimeMs`)
 *   사이의 엄격한 단조 증가 구간 선형(piecewise-linear) 일대일 대응 매니페스트와 양방향 조회 함수를 제공한다.
 */

import {
  countSpeedlinesIntrudingClearZone,
  type ChoreographedWebtoonCut,
  type FocalClearEllipsePx,
  type RadialSpeedlineVector,
  type WebtoonPacingChoreographyResult,
} from "./scroll-whitespace-and-speedline-choreographer";

/** 방사형 집중선 SVG 출력 옵션. */
export interface RenderSpeedlinesSvgOptions {
  readonly decimalPrecision?: number;
  readonly includeClearZoneGuide?: boolean;
  readonly inkColorCss?: string;
  readonly layerId?: string;
}

/** 방사형 집중선 SVG 내보내기 결과. */
export interface SpeedlineSvgExportResult {
  readonly cutId: string;
  readonly hasInvalidCoordinates: boolean;
  readonly linesIntrudingClearZone: number;
  readonly panelHeightPx: number;
  readonly panelWidthPx: number;
  readonly protectedEllipse: FocalClearEllipsePx;
  readonly renderedLineCount: number;
  readonly svgMarkup: string;
}

/** 오디오-스크롤 동기화 키프레임 단계. */
export type AudioScrollKeyframePhase =
  | "episode-end"
  | "episode-start"
  | "gutter-start"
  | "panel-climax"
  | "panel-enter"
  | "panel-exit";

/** 오디오-스크롤 동기화 구간 선형 키프레임. */
export interface AudioScrollSyncKeyframe {
  readonly activeBeatAligned: boolean;
  readonly audioTimeMs: number;
  readonly cutId: string;
  readonly index: number;
  readonly localScrollRatePxPerSec: number;
  readonly phase: AudioScrollKeyframePhase;
  readonly scrollY: number;
}

/** 플레이어 런타임용 오디오 연동 연출 트리거 큐. */
export interface AudioScrollEffectCue {
  readonly audioTimeMs: number;
  readonly cutId: string;
  readonly intensity: number;
  readonly kind: "calm-contrast-frame" | "camera-shake" | "climax-impact" | "silence-hold" | "speedline-burst";
  readonly scrollY: number;
}

/** 오디오-스크롤 동기화 매니페스트. */
export interface AudioScrollSyncManifest {
  readonly audioDurationMs: number;
  readonly effectCues: readonly AudioScrollEffectCue[];
  readonly episodeId: string;
  readonly keyframes: readonly AudioScrollSyncKeyframe[];
  readonly manifestVersion: "wave82.audio-scroll-sync.v1";
  readonly prefersReducedMotion: boolean;
  readonly readerScrollSpeedPxPerSec: number;
  readonly totalScrollHeightPx: number;
}

/** 매니페스트 단조성 및 왕복 변환 정밀도 검증 리포트. */
export interface AudioScrollSyncValidationReport {
  readonly isStrictlyMonotonic: boolean;
  readonly keyframeCount: number;
  readonly maxRoundTripErrorMs: number;
  readonly maxRoundTripErrorPx: number;
}

function clamp(v: number, min: number, max: number): number {
  return !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;
}

function escapeXmlAttr(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtNum(v: number, precision: number): string {
  const fixed = (Number.isFinite(v) ? v : 0).toFixed(precision);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function vectorIsFinite(v: RadialSpeedlineVector): boolean {
  return (
    Number.isFinite(v.innerX) &&
    Number.isFinite(v.innerY) &&
    Number.isFinite(v.outerX) &&
    Number.isFinite(v.outerY) &&
    Number.isFinite(v.baseLeftX) &&
    Number.isFinite(v.baseLeftY) &&
    Number.isFinite(v.baseRightX) &&
    Number.isFinite(v.baseRightY) &&
    Number.isFinite(v.opacity)
  );
}

/** SVG 기하 속성(좌표·크기·투명도)에 `NaN`이나 `Infinity`가 섞였는지만 정밀 검사한다. */
function svgNumericAttributesHaveInvalidToken(svgMarkup: string): boolean {
  const attrPattern = /\b(?:viewBox|width|height|points|cx|cy|rx|ry|x|y|fill-opacity|stroke-opacity|stroke-width)="([^"]*)"/g;
  let match: RegExpExecArray | null = attrPattern.exec(svgMarkup);
  while (match !== null) {
    if (/\b(?:NaN|Infinity)\b/i.test(match[1])) return true;
    match = attrPattern.exec(svgMarkup);
  }
  return false;
}

/**
 * 컷의 방사형 집중선 벡터를 비파괴 SVG 오버레이 레이어로 직렬화한다.
 * 기본 잉크 색상은 테마를 그대로 따르는 `currentColor`를 사용한다.
 */
export function renderAudioDrivenSpeedlinesSvg(
  cut: ChoreographedWebtoonCut,
  options: RenderSpeedlinesSvgOptions = {},
): SpeedlineSvgExportResult {
  const p = Math.round(clamp(options.decimalPrecision ?? 2, 0, 4));
  const width = Math.max(1, Number.isFinite(cut.panelWidthPx) ? cut.panelWidthPx : 800);
  const height = Math.max(1, Number.isFinite(cut.panelHeightPx) ? cut.panelHeightPx : 680);
  const ink = escapeXmlAttr(options.inkColorCss ?? "currentColor");
  const safeCutId = escapeXmlAttr(cut.cutId);
  const layerId = escapeXmlAttr(options.layerId ?? `wave82-speedlines-${cut.cutId}`);
  const clipId = `${layerId}-clip`;

  const el = cut.speedlines.clearZoneEllipse;
  const safeEllipse: FocalClearEllipsePx = {
    cx: Number.isFinite(el.cx) ? el.cx : width * 0.5,
    cy: Number.isFinite(el.cy) ? el.cy : height * 0.45,
    rx: Number.isFinite(el.rx) ? Math.max(1, el.rx) : width * 0.25,
    ry: Number.isFinite(el.ry) ? Math.max(1, el.ry) : height * 0.24,
    label: el.label,
  };

  const validVectors = cut.speedlines.vectors.filter(
    (vec) => vectorIsFinite(vec) && countSpeedlinesIntrudingClearZone([vec], safeEllipse) === 0,
  );
  const linesIntrudingClearZone = countSpeedlinesIntrudingClearZone(validVectors, safeEllipse);

  const polygons = validVectors.map((vec) => {
    const p1 = `${fmtNum(vec.innerX, p)},${fmtNum(vec.innerY, p)}`;
    const p2 = `${fmtNum(vec.baseLeftX, p)},${fmtNum(vec.baseLeftY, p)}`;
    const p3 = `${fmtNum(vec.baseRightX, p)},${fmtNum(vec.baseRightY, p)}`;
    return `    <polygon points="${p1} ${p2} ${p3}" fill="${ink}" fill-opacity="${fmtNum(clamp(vec.opacity, 0.05, 1), 3)}" />`;
  });

  const guide = options.includeClearZoneGuide
    ? `\n  <ellipse data-role="focal-clear-zone" cx="${fmtNum(safeEllipse.cx, p)}" cy="${fmtNum(safeEllipse.cy, p)}" rx="${fmtNum(safeEllipse.rx, p)}" ry="${fmtNum(safeEllipse.ry, p)}" fill="none" stroke="${ink}" stroke-opacity="0.28" stroke-dasharray="6 4" stroke-width="1.5" />`
    : "";

  const wStr = fmtNum(width, p);
  const hStr = fmtNum(height, p);
  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" id="${layerId}" data-cut-id="${safeCutId}" data-style="${escapeXmlAttr(cut.speedlines.style)}" width="${wStr}" height="${hStr}" viewBox="0 0 ${wStr} ${hStr}" role="img" aria-label="${escapeXmlAttr(`${cut.title} 오디오 연동 방사형 집중선 레이어`)}">`,
    `  <title>${escapeXmlAttr(`${cut.title} 집중선 레이어`)}</title>`,
    `  <defs><clipPath id="${clipId}"><rect x="0" y="0" width="${wStr}" height="${hStr}" /></clipPath></defs>`,
    `  <g data-layer="audio-speedlines" clip-path="url(#${clipId})">`,
    ...polygons,
    `  </g>${guide}`,
    `</svg>`,
  ].join("\n");

  return {
    cutId: cut.cutId,
    panelWidthPx: width,
    panelHeightPx: height,
    renderedLineCount: validVectors.length,
    linesIntrudingClearZone,
    hasInvalidCoordinates: svgNumericAttributesHaveInvalidToken(svgMarkup),
    protectedEllipse: safeEllipse,
    svgMarkup,
  };
}

/** 에피소드 연출 결과에서 엄격히 단조 증가하는 `scrollY <-> audioTimeMs` 동기화 매니페스트를 생성한다. */
export function buildAudioScrollSyncManifest(choreography: WebtoonPacingChoreographyResult): AudioScrollSyncManifest {
  const totalHeight = Math.max(0, choreography.totalScrollHeightPx);
  const totalDuration = Math.max(0, choreography.totalAudioDurationMs);

  if (choreography.cuts.length === 0 || totalHeight <= 0 || totalDuration <= 0) {
    return {
      manifestVersion: "wave82.audio-scroll-sync.v1",
      episodeId: choreography.episodeId,
      totalScrollHeightPx: totalHeight,
      audioDurationMs: totalDuration,
      readerScrollSpeedPxPerSec: choreography.readerScrollSpeedPxPerSec,
      prefersReducedMotion: choreography.prefersReducedMotion,
      keyframes: [{
        index: 0, scrollY: 0, audioTimeMs: 0, cutId: "episode-root", phase: "episode-start",
        localScrollRatePxPerSec: choreography.readerScrollSpeedPxPerSec, activeBeatAligned: false,
      }],
      effectCues: [],
    };
  }

  const rawPoints: Array<{ activeBeatAligned: boolean; audioTimeMs: number; cutId: string; phase: AudioScrollKeyframePhase; scrollY: number }> = [
    { scrollY: 0, audioTimeMs: 0, cutId: choreography.cuts[0].cutId, phase: "episode-start", activeBeatAligned: false },
  ];
  const effectCues: AudioScrollEffectCue[] = [];

  for (const cut of choreography.cuts) {
    const cutSpanMs = Math.max(1, cut.audioSummary.audioEndMs - cut.audioSummary.audioStartMs);
    const cutH = Math.max(1, cut.scrollEndY - cut.scrollStartY);
    const enterF = clamp((cut.panelTopY - cut.scrollStartY) / cutH, 0.05, 0.45);
    const exitF = clamp((cut.panelBottomY - cut.scrollStartY) / cutH, 0.65, 0.95);
    const enterMs = cut.audioSummary.audioStartMs + cutSpanMs * enterF;
    const climaxMs = cut.audioSummary.audioStartMs + cutSpanMs * ((enterF + exitF) * 0.5);
    const exitMs = cut.audioSummary.audioStartMs + cutSpanMs * exitF;

    if (cut.scrollStartY > 0) {
      rawPoints.push({ scrollY: cut.scrollStartY, audioTimeMs: cut.audioSummary.audioStartMs, cutId: cut.cutId, phase: "gutter-start", activeBeatAligned: cut.audioSummary.beatCount > 0 });
    }
    rawPoints.push({ scrollY: cut.panelTopY, audioTimeMs: enterMs, cutId: cut.cutId, phase: "panel-enter", activeBeatAligned: cut.audioSummary.beatCount > 0 });

    if (cut.pacingMode === "climax-impact") {
      const climaxY = cut.panelTopY + cut.panelHeightPx * 0.42;
      rawPoints.push({ scrollY: climaxY, audioTimeMs: climaxMs, cutId: cut.cutId, phase: "panel-climax", activeBeatAligned: true });
      effectCues.push({ cutId: cut.cutId, kind: "climax-impact", scrollY: Math.round(climaxY * 100) / 100, audioTimeMs: Math.round(climaxMs * 100) / 100, intensity: cut.audioSummary.dramaticScore });
    }
    if (cut.audioSummary.precedingSilenceDurationMs > 0) {
      effectCues.push({ cutId: cut.cutId, kind: "silence-hold", scrollY: cut.scrollStartY, audioTimeMs: cut.audioSummary.audioStartMs, intensity: clamp(cut.audioSummary.precedingSilenceDurationMs / 1000, 0.1, 1) });
    }
    if (cut.speedlines.enabled) {
      effectCues.push({ cutId: cut.cutId, kind: "speedline-burst", scrollY: cut.panelTopY, audioTimeMs: Math.round(enterMs * 100) / 100, intensity: cut.speedlines.speedlineDensity });
    }
    if (!choreography.prefersReducedMotion && cut.cameraShake.shakeAmplitudePx > 0) {
      effectCues.push({ cutId: cut.cutId, kind: "camera-shake", scrollY: cut.panelTopY, audioTimeMs: Math.round(enterMs * 100) / 100, intensity: clamp(cut.cameraShake.shakeAmplitudePx / 22, 0.1, 1) });
    } else if (choreography.prefersReducedMotion && cut.cameraShake.reducedMotionSubstituted) {
      effectCues.push({ cutId: cut.cutId, kind: "calm-contrast-frame", scrollY: cut.panelTopY, audioTimeMs: Math.round(enterMs * 100) / 100, intensity: clamp(cut.cameraShake.calmContrastBorderPx / 8, 0.25, 1) });
    }

    rawPoints.push({ scrollY: cut.panelBottomY, audioTimeMs: exitMs, cutId: cut.cutId, phase: "panel-exit", activeBeatAligned: false });
  }

  rawPoints.push({ scrollY: totalHeight, audioTimeMs: totalDuration, cutId: choreography.cuts[choreography.cuts.length - 1].cutId, phase: "episode-end", activeBeatAligned: false });

  const sorted = [...rawPoints].sort((a, b) => a.scrollY - b.scrollY);
  const deduped: typeof rawPoints = [];
  for (const pt of sorted) {
    const prev = deduped[deduped.length - 1];
    if (!prev || pt.scrollY - prev.scrollY >= 1) deduped.push(pt);
    else if (pt.phase === "episode-end") deduped[deduped.length - 1] = pt;
  }

  const count = deduped.length;
  const times = new Float64Array(count);
  times[0] = 0;
  times[count - 1] = totalDuration;
  const minStepMs = Math.min(1, totalDuration / Math.max(1, count * 4));
  for (let i = 1; i < count - 1; i += 1) {
    const lo = times[i - 1] + minStepMs;
    const hi = totalDuration - (count - 1 - i) * minStepMs;
    times[i] = clamp(deduped[i].audioTimeMs, lo, Math.max(lo, hi));
  }

  const keyframes: AudioScrollSyncKeyframe[] = deduped.map((pt, i) => {
    const tMs = times[i];
    const rate =
      i === 0
        ? choreography.readerScrollSpeedPxPerSec
        : Math.round(((pt.scrollY - deduped[i - 1].scrollY) / Math.max(1e-4, (tMs - times[i - 1]) / 1000)) * 100) / 100;
    return {
      index: i,
      scrollY: Math.round(pt.scrollY * 1000) / 1000,
      audioTimeMs: Math.round(tMs * 1000) / 1000,
      cutId: pt.cutId,
      phase: pt.phase,
      localScrollRatePxPerSec: rate,
      activeBeatAligned: pt.activeBeatAligned,
    };
  });

  return {
    manifestVersion: "wave82.audio-scroll-sync.v1",
    episodeId: choreography.episodeId,
    totalScrollHeightPx: totalHeight,
    audioDurationMs: totalDuration,
    readerScrollSpeedPxPerSec: choreography.readerScrollSpeedPxPerSec,
    prefersReducedMotion: choreography.prefersReducedMotion,
    keyframes,
    effectCues,
  };
}

/** 구간 선형 매니페스트에서 세로 스크롤 좌표(`scrollY`)를 대응 오디오 시각(`audioTimeMs`)으로 사상한다. */
export function mapScrollYToAudioTimeMs(manifest: AudioScrollSyncManifest, scrollY: number): number {
  const kfs = manifest.keyframes;
  if (kfs.length === 0 || !Number.isFinite(scrollY)) return 0;
  if (scrollY <= kfs[0].scrollY) return kfs[0].audioTimeMs;
  const last = kfs[kfs.length - 1];
  if (scrollY >= last.scrollY) return last.audioTimeMs;
  let lo = 0;
  let hi = kfs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].scrollY <= scrollY) lo = mid;
    else hi = mid;
  }
  const spanY = kfs[hi].scrollY - kfs[lo].scrollY;
  return spanY <= 1e-9 ? kfs[lo].audioTimeMs : kfs[lo].audioTimeMs + ((scrollY - kfs[lo].scrollY) / spanY) * (kfs[hi].audioTimeMs - kfs[lo].audioTimeMs);
}

/** 구간 선형 매니페스트에서 오디오 재생 시각(`audioTimeMs`)을 대응 세로 스크롤 좌표(`scrollY`)로 역변환한다. */
export function mapAudioTimeMsToScrollY(manifest: AudioScrollSyncManifest, audioTimeMs: number): number {
  const kfs = manifest.keyframes;
  if (kfs.length === 0 || !Number.isFinite(audioTimeMs)) return 0;
  if (audioTimeMs <= kfs[0].audioTimeMs) return kfs[0].scrollY;
  const last = kfs[kfs.length - 1];
  if (audioTimeMs >= last.audioTimeMs) return last.scrollY;
  let lo = 0;
  let hi = kfs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].audioTimeMs <= audioTimeMs) lo = mid;
    else hi = mid;
  }
  const spanT = kfs[hi].audioTimeMs - kfs[lo].audioTimeMs;
  return spanT <= 1e-9 ? kfs[lo].scrollY : kfs[lo].scrollY + ((audioTimeMs - kfs[lo].audioTimeMs) / spanT) * (kfs[hi].scrollY - kfs[lo].scrollY);
}

/** 동기화 매니페스트의 엄격 단조 증가 여부 및 양방향 왕복 변환 오차를 검증한다. */
export function validateAudioScrollSyncManifest(manifest: AudioScrollSyncManifest, sampleCount = 40): AudioScrollSyncValidationReport {
  const kfs = manifest.keyframes;
  let isStrictlyMonotonic = kfs.length >= 2;
  for (let i = 1; i < kfs.length; i += 1) {
    if (kfs[i].scrollY <= kfs[i - 1].scrollY || kfs[i].audioTimeMs <= kfs[i - 1].audioTimeMs) {
      isStrictlyMonotonic = false;
      break;
    }
  }
  let maxRoundTripErrorPx = 0;
  let maxRoundTripErrorMs = 0;
  const steps = Math.max(4, Math.round(sampleCount));
  if (kfs.length >= 2) {
    const maxY = kfs[kfs.length - 1].scrollY;
    const maxT = kfs[kfs.length - 1].audioTimeMs;
    for (let s = 0; s <= steps; s += 1) {
      const f = s / steps;
      const y = maxY * f;
      maxRoundTripErrorPx = Math.max(maxRoundTripErrorPx, Math.abs(mapAudioTimeMsToScrollY(manifest, mapScrollYToAudioTimeMs(manifest, y)) - y));
      const t = maxT * f;
      maxRoundTripErrorMs = Math.max(maxRoundTripErrorMs, Math.abs(mapScrollYToAudioTimeMs(manifest, mapAudioTimeMsToScrollY(manifest, t)) - t));
    }
  }
  return { isStrictlyMonotonic, keyframeCount: kfs.length, maxRoundTripErrorPx, maxRoundTripErrorMs };
}
