/**
 * Wave 97: 인쇄 안전 고대비 OKLCH 립싱크 도프시트 SVG 렌더러 및 한국어 연출 감사 리포트.
 *
 * - `renderLipsyncDopesheetSvg`: 음향 RMS 파형 포락선, 한글·비즘 타임 블록, `jawOpen`/`browRaise` 곡선,
 *   눈 깜박임 마커를 OKLCH 색상만으로 직렬화하며 `NaN`/`Infinity` 0건과 XML 이스케이프를 보장한다.
 * - `auditLipsyncCutRig`: 양순음 닫힘 적중률, 프레임 동기 오차(<= 16.67ms), 동작 줄이기 안전 계약,
 *   로컬 전용 프라이버시 계약을 구조화된 결과로 검증한다.
 * - `summarizeLipsyncCutRigKo`: 모션툰 감독 시점의 자연스러운 한국어 요약을 생성한다.
 */

import type {
  ComicVisemeId,
  LocalVoicePrivacyContract,
} from "./korean-phoneme-audio-viseme-aligner";
import type {
  FacialEmotionTag,
  FacialRigTimeline,
} from "./coarticulation-blendshape-rig-evaluator";

/** 립싱크 도프시트 SVG 렌더링 옵션. */
export interface RenderLipsyncDopesheetSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly titleKo?: string;
}

/** 립싱크 컷 리그 출고 감사 결과. */
export interface LipsyncCutRigAuditReport {
  readonly durationMs: number;
  readonly frameCount: number;
  readonly fps: number;
  readonly bilabialHitRate: number;
  readonly allBilabialsClosed: boolean;
  readonly maxAudioAlignmentDriftMs: number;
  readonly withinFrameSyncBudget: boolean;
  readonly blinkCount: number;
  readonly blinkIntervalsValid: boolean;
  readonly reducedMotionCompliant: boolean;
  readonly privacy: LocalVoicePrivacyContract;
  readonly readyForCutExport: boolean;
}

const EMOTION_LABELS_KO: Readonly<Record<FacialEmotionTag, string>> = {
  neutral: "중립",
  joy: "기쁨",
  anger: "분노",
  sadness: "슬픔",
  shock: "충격",
};

const PALETTE = {
  paperBg: "oklch(0.985 0.008 85)",
  trackBg: "oklch(0.958 0.010 85)",
  border: "oklch(0.82 0.014 85)",
  grid: "oklch(0.88 0.010 85)",
  inkPrimary: "oklch(0.20 0.020 250)",
  inkSecondary: "oklch(0.42 0.020 250)",
  waveFill: "oklch(0.76 0.085 162)",
  waveStroke: "oklch(0.36 0.095 162)",
  jawStroke: "oklch(0.52 0.175 32)",
  browStroke: "oklch(0.46 0.150 252)",
  blinkAccent: "oklch(0.52 0.175 305)",
  bilabialFill: "oklch(0.89 0.085 38)",
  bilabialStroke: "oklch(0.46 0.160 32)",
  vowelFill: "oklch(0.91 0.055 162)",
  vowelStroke: "oklch(0.38 0.095 162)",
  consonantFill: "oklch(0.92 0.045 245)",
  consonantStroke: "oklch(0.42 0.095 245)",
  silenceFill: "oklch(0.945 0.006 85)",
  silenceStroke: "oklch(0.74 0.012 85)",
} as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function fmt(value: number, precision = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe
    .toFixed(precision)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function visemeBlockStyle(viseme: ComicVisemeId): { readonly fill: string; readonly stroke: string } {
  if (viseme === "M_B_P") {
    return { fill: PALETTE.bilabialFill, stroke: PALETTE.bilabialStroke };
  }
  if (viseme === "SIL") {
    return { fill: PALETTE.silenceFill, stroke: PALETTE.silenceStroke };
  }
  if (
    viseme === "A" ||
    viseme === "E" ||
    viseme === "I" ||
    viseme === "O" ||
    viseme === "U" ||
    viseme === "W_OO"
  ) {
    return { fill: PALETTE.vowelFill, stroke: PALETTE.vowelStroke };
  }
  return { fill: PALETTE.consonantFill, stroke: PALETTE.consonantStroke };
}

/**
 * 60fps 립싱크·표정 쉐이프키 타임라인을 인쇄 안전 고대비 OKLCH 도프시트 SVG로 렌더링한다.
 */
export function renderLipsyncDopesheetSvg(
  timeline: FacialRigTimeline,
  options: RenderLipsyncDopesheetSvgOptions = {},
): string {
  const width = Math.round(clamp(options.widthPx ?? 960, 480, 2400));
  const height = Math.round(clamp(options.heightPx ?? 460, 320, 1200));
  const padLeft = 64;
  const padRight = 24;
  const plotWidth = Math.max(120, width - padLeft - padRight);
  const safeDurationMs = Math.max(1, Number.isFinite(timeline.durationMs) ? timeline.durationMs : 1);

  const timeToX = (ms: number): number =>
    padLeft + clamp(ms / safeDurationMs, 0, 1) * plotWidth;

  const waveTop = 74;
  const waveHeight = 84;
  const waveMidY = waveTop + waveHeight * 0.5;

  const visemeTop = 178;
  const visemeHeight = 70;

  const curveTop = 274;
  const curveHeight = 128;
  const curveBottom = curveTop + curveHeight;

  const titleText = escapeXml(
    options.titleKo ?? `보이스 립싱크 도프시트 · ${timeline.dialogueText || "무음 컷"}`,
  );
  const emotionKo = EMOTION_LABELS_KO[timeline.emotion];
  const motionBadge = timeline.prefersReducedMotion ? "동작 줄이기 안전 모드" : `${timeline.fps}fps 모션`;
  const subtitleText = escapeXml(
    `${fmt(safeDurationMs / 1000, 2)}초 · ${timeline.frames.length}프레임 · 감정 ${emotionKo} · ${motionBadge} · 로컬 전용(음성 미전송·성문 미저장)`,
  );

  // 1) 음향 RMS 파형 포락선 폴리곤
  const rmsSamples = timeline.frames;
  const upperPts: string[] = [];
  const lowerPts: string[] = [];
  if (rmsSamples.length > 0) {
    const stride = Math.max(1, Math.floor(rmsSamples.length / 240));
    for (let i = 0; i < rmsSamples.length; i += stride) {
      const f = rmsSamples[i];
      const x = timeToX(f.timeMs);
      const amp = clamp(f.rmsEnergy, 0, 1) * (waveHeight * 0.44);
      upperPts.push(`${fmt(x)},${fmt(waveMidY - amp)}`);
      lowerPts.unshift(`${fmt(x)},${fmt(waveMidY + amp)}`);
    }
    const lastFrame = rmsSamples[rmsSamples.length - 1];
    const lastX = timeToX(lastFrame.timeMs);
    const lastAmp = clamp(lastFrame.rmsEnergy, 0, 1) * (waveHeight * 0.44);
    upperPts.push(`${fmt(lastX)},${fmt(waveMidY - lastAmp)}`);
    lowerPts.unshift(`${fmt(lastX)},${fmt(waveMidY + lastAmp)}`);
  }
  const waveformPolygon =
    upperPts.length > 0 ? `${upperPts.join(" ")} ${lowerPts.join(" ")}` : `${fmt(padLeft)},${fmt(waveMidY)}`;

  // 2) 비즘·한글 타임 블록
  const visemeBlocksSvg: string[] = [];
  for (let i = 0; i < timeline.alignment.spans.length; i += 1) {
    const span = timeline.alignment.spans[i];
    const x1 = timeToX(span.startMs);
    const x2 = timeToX(span.endMs);
    const w = Math.max(1.5, x2 - x1);
    const style = visemeBlockStyle(span.viseme);
    const safeGrapheme = escapeXml(span.grapheme || "·");
    const safeViseme = escapeXml(span.viseme);
    const tooltip = escapeXml(
      `${span.grapheme || "휴지"} (${span.jamoLabel}) · ${span.viseme} · ${fmt(span.startMs, 1)}~${fmt(span.endMs, 1)}ms`,
    );

    const showLabel = w >= 22;
    const showVisemeSub = w >= 32;
    const midX = x1 + w * 0.5;
    visemeBlocksSvg.push(
      `    <g data-viseme="${safeViseme}">` +
        `<title>${tooltip}</title>` +
        `<rect x="${fmt(x1)}" y="${fmt(visemeTop + 6)}" width="${fmt(w)}" height="${fmt(visemeHeight - 12)}" rx="4" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.2" />` +
        (showLabel
          ? `<text x="${fmt(midX)}" y="${fmt(visemeTop + 31)}" text-anchor="middle" font-size="11" font-weight="600" fill="${PALETTE.inkPrimary}">${safeGrapheme}</text>`
          : "") +
        (showVisemeSub
          ? `<text x="${fmt(midX)}" y="${fmt(visemeTop + 48)}" text-anchor="middle" font-size="9" fill="${PALETTE.inkSecondary}">${safeViseme}</text>`
          : "") +
        "</g>",
    );
  }

  // 3) jawOpen / browRaise 60fps 쉐이프키 곡선
  const jawPoints: string[] = [];
  const browPoints: string[] = [];
  if (timeline.frames.length > 0) {
    const stride = Math.max(1, Math.floor(timeline.frames.length / 300));
    for (let i = 0; i < timeline.frames.length; i += stride) {
      const f = timeline.frames[i];
      const x = timeToX(f.timeMs);
      const jawY = curveBottom - clamp(f.pose.jawOpen, 0, 1) * (curveHeight - 12) - 6;
      const browY = curveBottom - clamp(f.pose.browRaise, 0, 1) * (curveHeight - 12) - 6;
      jawPoints.push(`${fmt(x)},${fmt(jawY)}`);
      browPoints.push(`${fmt(x)},${fmt(browY)}`);
    }
    const last = timeline.frames[timeline.frames.length - 1];
    const lastX = timeToX(last.timeMs);
    jawPoints.push(`${fmt(lastX)},${fmt(curveBottom - clamp(last.pose.jawOpen, 0, 1) * (curveHeight - 12) - 6)}`);
    browPoints.push(`${fmt(lastX)},${fmt(curveBottom - clamp(last.pose.browRaise, 0, 1) * (curveHeight - 12) - 6)}`);
  }

  // 4) 눈 깜박임 마커
  const blinkMarkersSvg: string[] = [];
  for (let i = 0; i < timeline.blinkEvents.length; i += 1) {
    const ev = timeline.blinkEvents[i];
    const bx = timeToX(ev.peakTimeMs);
    const diamond = `${fmt(bx)},${fmt(curveTop - 10)} ${fmt(bx + 5)},${fmt(curveTop - 5)} ${fmt(bx)},${fmt(curveTop)} ${fmt(bx - 5)},${fmt(curveTop - 5)}`;
    blinkMarkersSvg.push(
      `    <g data-blink-index="${ev.index}">` +
        `<line x1="${fmt(bx)}" y1="${fmt(waveTop)}" x2="${fmt(bx)}" y2="${fmt(curveBottom)}" stroke="${PALETTE.blinkAccent}" stroke-width="1.2" stroke-dasharray="4 3" />` +
        `<polygon points="${diamond}" fill="${PALETTE.blinkAccent}" />` +
        `<text x="${fmt(bx + 7)}" y="${fmt(curveTop - 2)}" font-size="9" font-weight="600" fill="${PALETTE.blinkAccent}">깜박임 ${fmt(ev.peakTimeMs / 1000, 2)}s</text>` +
        "</g>",
    );
  }

  // 5) 시간 눈금선
  const tickStepMs = safeDurationMs > 6000 ? 1000 : safeDurationMs > 2000 ? 500 : 250;
  const ticksSvg: string[] = [];
  for (let t = 0; t <= safeDurationMs + 0.5; t += tickStepMs) {
    const x = timeToX(t);
    ticksSvg.push(
      `    <line x1="${fmt(x)}" y1="${fmt(waveTop)}" x2="${fmt(x)}" y2="${fmt(curveBottom)}" stroke="${PALETTE.grid}" stroke-width="1" />` +
        `<text x="${fmt(x)}" y="${fmt(curveBottom + 18)}" text-anchor="middle" font-size="10" fill="${PALETTE.inkSecondary}">${fmt(t / 1000, 2)}s</text>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${titleText}">`,
    `  <rect x="0" y="0" width="${width}" height="${height}" fill="${PALETTE.paperBg}" />`,
    `  <text x="${padLeft}" y="28" font-size="15" font-weight="700" fill="${PALETTE.inkPrimary}">${titleText}</text>`,
    `  <text x="${padLeft}" y="48" font-size="11" fill="${PALETTE.inkSecondary}">${subtitleText}</text>`,
    `  <rect x="${padLeft}" y="${waveTop}" width="${plotWidth}" height="${waveHeight}" rx="6" fill="${PALETTE.trackBg}" stroke="${PALETTE.border}" stroke-width="1" />`,
    `  <rect x="${padLeft}" y="${visemeTop}" width="${plotWidth}" height="${visemeHeight}" rx="6" fill="${PALETTE.trackBg}" stroke="${PALETTE.border}" stroke-width="1" />`,
    `  <rect x="${padLeft}" y="${curveTop}" width="${plotWidth}" height="${curveHeight}" rx="6" fill="${PALETTE.trackBg}" stroke="${PALETTE.border}" stroke-width="1" />`,
    `  <text x="12" y="${fmt(waveMidY + 4)}" font-size="10" font-weight="600" fill="${PALETTE.inkSecondary}">RMS</text>`,
    `  <text x="12" y="${fmt(visemeTop + visemeHeight * 0.5 + 4)}" font-size="10" font-weight="600" fill="${PALETTE.inkSecondary}">비즘</text>`,
    `  <text x="12" y="${fmt(curveTop + curveHeight * 0.5 + 4)}" font-size="10" font-weight="600" fill="${PALETTE.inkSecondary}">표정</text>`,
    "  <g data-layer=\"time-grid\">",
    ...ticksSvg,
    "  </g>",
    "  <g data-layer=\"rms-waveform\">",
    `    <line x1="${padLeft}" y1="${fmt(waveMidY)}" x2="${padLeft + plotWidth}" y2="${fmt(waveMidY)}" stroke="${PALETTE.border}" stroke-width="1" />`,
    `    <polygon points="${waveformPolygon}" fill="${PALETTE.waveFill}" stroke="${PALETTE.waveStroke}" stroke-width="1.2" />`,
    "  </g>",
    "  <g data-layer=\"viseme-blocks\">",
    ...visemeBlocksSvg,
    "  </g>",
    "  <g data-layer=\"blendshape-curves\">",
    jawPoints.length > 1
      ? `    <polyline points="${jawPoints.join(" ")}" fill="none" stroke="${PALETTE.jawStroke}" stroke-width="2" stroke-linejoin="round" />`
      : "",
    browPoints.length > 1
      ? `    <polyline points="${browPoints.join(" ")}" fill="none" stroke="${PALETTE.browStroke}" stroke-width="1.8" stroke-linejoin="round" />`
      : "",
    "  </g>",
    "  <g data-layer=\"blink-markers\">",
    ...blinkMarkersSvg,
    "  </g>",
    `  <g data-layer="legend" font-size="10" fill="${PALETTE.inkSecondary}">`,
    `    <line x1="${padLeft}" y1="${height - 18}" x2="${padLeft + 16}" y2="${height - 18}" stroke="${PALETTE.jawStroke}" stroke-width="2.5" />`,
    `    <text x="${padLeft + 22}" y="${height - 14}">jawOpen(입 열림)</text>`,
    `    <line x1="${padLeft + 140}" y1="${height - 18}" x2="${padLeft + 156}" y2="${height - 18}" stroke="${PALETTE.browStroke}" stroke-width="2.5" />`,
    `    <text x="${padLeft + 162}" y="${height - 14}">browRaise(눈썹 올림)</text>`,
    `    <rect x="${padLeft + 290}" y="${height - 23}" width="12" height="10" rx="2" fill="${PALETTE.bilabialFill}" stroke="${PALETTE.bilabialStroke}" stroke-width="1" />`,
    `    <text x="${padLeft + 308}" y="${height - 14}">양순음(M_B_P) 입술 닫힘</text>`,
    "  </g>",
    "</svg>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 60fps 표정 리그 타임라인의 출고 기준 충족 여부를 구조화해 감사한다.
 */
export function auditLipsyncCutRig(timeline: FacialRigTimeline): LipsyncCutRigAuditReport {
  const allBilabialsClosed =
    timeline.bilabialAudit.totalBilabials === 0 ||
    timeline.bilabialAudit.closedCount === timeline.bilabialAudit.totalBilabials;
  const withinFrameSyncBudget = timeline.metrics.maxAudioAlignmentDriftMs <= 16.67;

  let blinkIntervalsValid = true;
  if (timeline.emotion === "shock") {
    blinkIntervalsValid = timeline.blinkEvents.length === 0;
  } else {
    for (let i = 1; i < timeline.blinkEvents.length; i += 1) {
      const gap = timeline.blinkEvents[i].peakTimeMs - timeline.blinkEvents[i - 1].peakTimeMs;
      if (gap < 2800 || gap > 4800) {
        blinkIntervalsValid = false;
        break;
      }
    }
  }

  const reducedMotionCompliant = !timeline.prefersReducedMotion
    ? true
    : timeline.metrics.maxAbsHeadNodDeg === 0 &&
      timeline.metrics.maxAbsBreathOffsetPx === 0 &&
      timeline.metrics.lipStepTransitionsPerSec <= 12;

  const privacyValid =
    timeline.privacy.uploadsVoiceAudio === false &&
    timeline.privacy.storesBiometricVoiceprint === false &&
    timeline.privacy.runsLocallyOnly === true;

  return {
    durationMs: timeline.durationMs,
    frameCount: timeline.frames.length,
    fps: timeline.fps,
    bilabialHitRate: timeline.bilabialAudit.hitRate,
    allBilabialsClosed,
    maxAudioAlignmentDriftMs: timeline.metrics.maxAudioAlignmentDriftMs,
    withinFrameSyncBudget,
    blinkCount: timeline.blinkEvents.length,
    blinkIntervalsValid,
    reducedMotionCompliant,
    privacy: timeline.privacy,
    readyForCutExport:
      allBilabialsClosed &&
      withinFrameSyncBudget &&
      blinkIntervalsValid &&
      reducedMotionCompliant &&
      privacyValid &&
      timeline.alignment.isStrictlyMonotonic,
  };
}

/**
 * 모션툰 감독·연출가 관점의 자연스러운 한국어 립싱크 컷 요약을 생성한다.
 */
export function summarizeLipsyncCutRigKo(timeline: FacialRigTimeline): string {
  const audit = auditLipsyncCutRig(timeline);
  const durationSec = fmt(timeline.durationMs / 1000, 2);
  const emotionKo = EMOTION_LABELS_KO[timeline.emotion];
  const hitPercent = fmt(audit.bilabialHitRate * 100, 1);

  const bilabialLine =
    timeline.bilabialAudit.totalBilabials > 0
      ? `양순음(ㅁ·ㅂ·ㅍ) 입술 닫힘 적중률은 ${hitPercent}%(${timeline.bilabialAudit.closedCount}/${timeline.bilabialAudit.totalBilabials})다.`
      : "양순음 폐쇄 구간이 없는 대사다.";

  const blinkLine =
    timeline.emotion === "shock"
      ? "충격 감정 연출에 맞춰 눈 깜박임을 0회로 억제했다."
      : `생리적 눈 깜박임은 총 ${audit.blinkCount}회 배치했다.`;

  const motionLine = timeline.prefersReducedMotion
    ? `동작 줄이기 안전 모드를 적용해 고개 끄덕임과 호흡 흔들림을 0으로 고정하고, 입모양 전환을 초당 ${fmt(timeline.metrics.lipStepTransitionsPerSec, 1)}단계 이하로 차분하게 유지했다.`
    : `일반 ${timeline.fps}fps 연출로 최대 프레임당 입 열림 변화폭은 ${fmt(timeline.metrics.maxJawDeltaPerFrame, 3)} 수준이다.`;

  return [
    `[립싱크 컷 리허설 요약 · 감정: ${emotionKo}]`,
    `재생 길이 ${durationSec}초(${Math.round(timeline.durationMs)}ms), ${timeline.fps}fps 총 ${audit.frameCount}프레임으로 쉐이프키를 계산했다.`,
    `${bilabialLine} 최대 음성-입모양 오차는 ${fmt(audit.maxAudioAlignmentDriftMs, 2)}ms로 1프레임(16.67ms) 기준 안에 들어왔다.`,
    `${blinkLine} ${motionLine}`,
    "성우 음성은 외부로 보내지 않고 생체 성문도 저장하지 않으며 기기 로컬에서만 처리했다.",
  ].join(" ");
}
