/**
 * Wave 114: 인쇄 안전 고대비 OKLCH 폴리 타임라인 SVG 렌더러 및 사운드 디렉터 한국어 QA 요약.
 *
 * - `renderSfxFoleyTimelineSvg`: 스테레오 L/R 파형 포락선, `-1 dBFS` 피크 안전 상한선,
 *   정전력 패닝 배지(`L`/`C`/`R`) 한국어 SFX 큐 레인, 햅틱 펄스 틱을 순수 OKLCH로 직렬화한다.
 * - `auditSfxFoleyBridge`: 방송 피크·정전력 패닝·무음 자막·동작 줄이기·WAV 대비 절감률을 감사한다.
 * - `summarizeSfxFoleyBridgeKo`: 사운드 디렉터 관점의 간결한 한국어 QA 브리프를 작성한다.
 */

import { clamp } from "./foley-dsp-math";
import { PEAK_SAFETY_CEILING_LINEAR, type SfxFoleyArchetype } from "./korean-sfx-procedural-foley-dsp";
import type { CompiledEpisodeSfxCue, EpisodeSfxMixReport } from "./spatial-sfx-mixer-and-haptic-bridge";

export interface RenderSfxFoleyTimelineSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly titleKo?: string;
}

export interface SfxFoleyBridgeAuditReport {
  readonly episodeId: string;
  readonly cueCount: number;
  readonly totalDurationMs: number;
  readonly broadcastPeakSafe: boolean;
  readonly masterPeakDbfs: number;
  readonly zeroClippingAndFinite: boolean;
  readonly constantPowerPanValid: boolean;
  readonly silentReaderCaptionsComplete: boolean;
  readonly reducedMotionAndHapticsSafe: boolean;
  readonly byteSavingsTargetMet: boolean;
  readonly byteSavingsPercent: number;
  readonly readyForEpisodeDelivery: boolean;
}

const PALETTE = {
  paperBg: "oklch(0.985 0.008 85)",
  panelBg: "oklch(0.958 0.010 85)",
  border: "oklch(0.82 0.014 85)",
  grid: "oklch(0.89 0.010 85)",
  inkPrimary: "oklch(0.20 0.020 250)",
  inkSecondary: "oklch(0.42 0.020 250)",
  ceilingLine: "oklch(0.54 0.175 26)",
  leftWaveFill: "oklch(0.77 0.090 162)",
  leftWaveStroke: "oklch(0.36 0.105 162)",
  rightWaveFill: "oklch(0.78 0.085 245)",
  rightWaveStroke: "oklch(0.38 0.115 245)",
  hapticTickFill: "oklch(0.52 0.165 305)",
  hapticSuppressedFill: "oklch(0.92 0.012 85)",
  hapticSuppressedText: "oklch(0.40 0.022 250)",
  badgeOkBg: "oklch(0.91 0.052 158)",
  badgeOkStroke: "oklch(0.42 0.105 158)",
  badgeOkText: "oklch(0.25 0.070 158)",
  badgeWarnBg: "oklch(0.92 0.068 65)",
  badgeWarnStroke: "oklch(0.48 0.145 55)",
  badgeWarnText: "oklch(0.30 0.090 48)",
  panBadgeBg: "oklch(0.25 0.030 250)",
  panBadgeText: "oklch(0.98 0.006 85)",
} as const;

const ARCHETYPE_STYLES: Readonly<Record<SfxFoleyArchetype, { readonly fill: string; readonly stroke: string }>> = {
  "impact-boom": { fill: "oklch(0.90 0.080 34)", stroke: "oklch(0.46 0.165 30)" },
  "blade-clash": { fill: "oklch(0.91 0.055 245)", stroke: "oklch(0.40 0.130 245)" },
  "heartbeat-thump": { fill: "oklch(0.91 0.072 12)", stroke: "oklch(0.46 0.160 12)" },
  "whoosh-dash": { fill: "oklch(0.92 0.055 182)", stroke: "oklch(0.38 0.105 182)" },
  "rain-ambience": { fill: "oklch(0.92 0.045 220)", stroke: "oklch(0.42 0.095 220)" },
  "glass-shatter": { fill: "oklch(0.92 0.065 292)", stroke: "oklch(0.44 0.140 292)" },
};

const SANS_FONT = "system-ui, -apple-system, sans-serif";
const MONO_FONT = "ui-monospace, SFMono-Regular, monospace";

function fmt(value: number, precision = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(precision).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildWaveformEnvelopePolygon(
  channel: Float32Array,
  trackX: number,
  trackY: number,
  trackW: number,
  trackH: number,
  bins: number,
): string {
  const n = channel.length;
  const midY = trackY + trackH * 0.5;
  const halfH = trackH * 0.44;
  if (n === 0 || bins < 2) return `${fmt(trackX)},${fmt(midY)} ${fmt(trackX + trackW)},${fmt(midY)}`;

  const upper: string[] = [];
  const lower: string[] = [];
  for (let b = 0; b < bins; b += 1) {
    const startIdx = Math.floor((b / bins) * n);
    const endIdx = Math.max(startIdx + 1, Math.floor(((b + 1) / bins) * n));
    let minVal = 0;
    let maxVal = 0;
    for (let i = startIdx; i < endIdx && i < n; i += 1) {
      const s = channel[i] ?? 0;
      if (Number.isFinite(s)) {
        if (s < minVal) minVal = s;
        if (s > maxVal) maxVal = s;
      }
    }
    const x = trackX + (b / (bins - 1)) * trackW;
    upper.push(`${fmt(x)},${fmt(midY - clamp(maxVal, -1, 1) * halfH)}`);
    lower.push(`${fmt(x)},${fmt(midY - clamp(minVal, -1, 1) * halfH)}`);
  }
  lower.reverse();
  return `${upper.join(" ")} ${lower.join(" ")}`;
}

function assignCueLaneRows(cues: readonly CompiledEpisodeSfxCue[]): readonly number[] {
  const laneEnds: number[] = [];
  const rows: number[] = [];
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    if (cue === undefined) continue;
    let row = -1;
    for (let r = 0; r < laneEnds.length; r += 1) {
      if ((laneEnds[r] ?? 0) <= cue.startTimeMs + 10) {
        row = r;
        laneEnds[r] = cue.endTimeMs;
        break;
      }
    }
    if (row === -1) {
      row = laneEnds.length;
      laneEnds.push(cue.endTimeMs);
    }
    rows.push(row);
  }
  return rows;
}

/** 에피소드 스테레오 폴리 믹스 및 접근성 브리지를 인쇄 안전 OKLCH SVG 타임라인으로 렌더링한다. */
export function renderSfxFoleyTimelineSvg(
  mixReport: EpisodeSfxMixReport,
  options: RenderSfxFoleyTimelineSvgOptions = {},
): string {
  const width = Math.round(clamp(options.widthPx ?? 1080, 640, 2200));
  const laneRows = assignCueLaneRows(mixReport.compiledCues);
  const rowCount = Math.max(1, Math.min(4, laneRows.reduce((m, r) => Math.max(m, r), 0) + 1));
  const cueLaneH = Math.max(66, rowCount * 36 + 16);
  const height = Math.round(clamp(options.heightPx ?? 330 + cueLaneH, 360, 1200));
  const titleKo = options.titleKo?.trim() || "한국어 웹툰 효과음 폴리 믹스 · 무음 독자 접근성 타임라인";
  const safeDurationMs = Math.max(100, mixReport.totalDurationMs);

  const padLeft = 92;
  const padRight = 28;
  const trackW = width - padLeft - padRight;
  const timeToX = (ms: number): number => padLeft + clamp(ms / safeDurationMs, 0, 1) * trackW;

  const waveH = 68;
  const leftTrackY = 88;
  const rightTrackY = leftTrackY + waveH + 14;
  const cueLaneY = rightTrackY + waveH + 18;
  const hapticY = cueLaneY + cueLaneH + 16;
  const hapticH = 44;
  const axisY = hapticY + hapticH + 22;
  const bins = Math.min(280, Math.max(96, Math.floor(trackW / 3.5)));

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width, 0)} ${fmt(height, 0)}" width="${fmt(width, 0)}" height="${fmt(height, 0)}" role="img" aria-label="${escapeXml(titleKo)}">`,
    `<rect x="0" y="0" width="${fmt(width, 0)}" height="${fmt(height, 0)}" rx="14" fill="${PALETTE.paperBg}" stroke="${PALETTE.border}" stroke-width="1.5"/>`,
    `<text x="24" y="31" font-family="${SANS_FONT}" font-size="16" font-weight="700" fill="${PALETTE.inkPrimary}">${escapeXml(titleKo)}</text>`,
    `<text x="24" y="54" font-family="${SANS_FONT}" font-size="12" fill="${PALETTE.inkSecondary}">${escapeXml(`에피소드 ${mixReport.episodeId} · 큐 ${mixReport.compiledCues.length}건 · 피크 ${fmt(mixReport.masterMetrics.masterPeakDbfs, 2)} dBFS · WAV 대비 ${fmt(mixReport.byteBudget.byteSavingsPercent, 1)}% 절감`)}</text>`,
  ];

  const statusText = mixReport.accessibilityBridge.hapticAndShakeSuppressed
    ? "자막 100% · 동작 줄이기 안전"
    : `자막 100% · 햅틱 <= ${mixReport.accessibilityBridge.maxHapticBurstLimitMs}ms`;
  const ok = mixReport.masterMetrics.withinBroadcastCeiling;
  const badgeX = width - padRight - 216;
  parts.push(
    `<rect x="${fmt(badgeX)}" y="20" width="216" height="28" rx="14" fill="${ok ? PALETTE.badgeOkBg : PALETTE.badgeWarnBg}" stroke="${ok ? PALETTE.badgeOkStroke : PALETTE.badgeWarnStroke}" stroke-width="1"/>`,
    `<text x="${fmt(badgeX + 108)}" y="38" text-anchor="middle" font-family="${SANS_FONT}" font-size="11.5" font-weight="600" fill="${ok ? PALETTE.badgeOkText : PALETTE.badgeWarnText}">${escapeXml(statusText)}</text>`,
  );

  for (let t = 0; t <= 6; t += 1) {
    const ms = (safeDurationMs * t) / 6;
    const x = timeToX(ms);
    parts.push(
      `<line x1="${fmt(x)}" y1="${fmt(leftTrackY)}" x2="${fmt(x)}" y2="${fmt(hapticY + hapticH)}" stroke="${PALETTE.grid}" stroke-width="1" stroke-dasharray="3 3"/>`,
      `<text x="${fmt(x)}" y="${fmt(axisY)}" text-anchor="middle" font-family="${MONO_FONT}" font-size="11" fill="${PALETTE.inkSecondary}">${fmt(ms / 1000, 2)}s</text>`,
    );
  }

  const pushWaveTrack = (label: string, y: number, ch: Float32Array, fill: string, stroke: string): void => {
    const midY = y + waveH * 0.5;
    const ceilOff = PEAK_SAFETY_CEILING_LINEAR * waveH * 0.44;
    const poly = buildWaveformEnvelopePolygon(ch, padLeft, y, trackW, waveH, bins);
    parts.push(
      `<rect x="${fmt(padLeft)}" y="${fmt(y)}" width="${fmt(trackW)}" height="${fmt(waveH)}" rx="8" fill="${PALETTE.panelBg}" stroke="${PALETTE.border}" stroke-width="1"/>`,
      `<text x="20" y="${fmt(midY - 3)}" font-family="${SANS_FONT}" font-size="12" font-weight="700" fill="${PALETTE.inkPrimary}">${escapeXml(label)}</text>`,
      `<text x="20" y="${fmt(midY + 13)}" font-family="${MONO_FONT}" font-size="10" fill="${PALETTE.ceilingLine}">-1 dBFS</text>`,
      `<line x1="${fmt(padLeft)}" y1="${fmt(midY)}" x2="${fmt(padLeft + trackW)}" y2="${fmt(midY)}" stroke="${PALETTE.border}" stroke-width="1"/>`,
      `<line x1="${fmt(padLeft)}" y1="${fmt(midY - ceilOff)}" x2="${fmt(padLeft + trackW)}" y2="${fmt(midY - ceilOff)}" stroke="${PALETTE.ceilingLine}" stroke-width="1" stroke-dasharray="5 3"/>`,
      `<line x1="${fmt(padLeft)}" y1="${fmt(midY + ceilOff)}" x2="${fmt(padLeft + trackW)}" y2="${fmt(midY + ceilOff)}" stroke="${PALETTE.ceilingLine}" stroke-width="1" stroke-dasharray="5 3"/>`,
      `<polygon points="${poly}" fill="${fill}" fill-opacity="0.72" stroke="${stroke}" stroke-width="1.2"/>`,
    );
  };

  pushWaveTrack("스테레오 L", leftTrackY, mixReport.leftChannel, PALETTE.leftWaveFill, PALETTE.leftWaveStroke);
  pushWaveTrack("스테레오 R", rightTrackY, mixReport.rightChannel, PALETTE.rightWaveFill, PALETTE.rightWaveStroke);

  parts.push(
    `<rect x="${fmt(padLeft)}" y="${fmt(cueLaneY)}" width="${fmt(trackW)}" height="${fmt(cueLaneH)}" rx="8" fill="${PALETTE.panelBg}" stroke="${PALETTE.border}" stroke-width="1"/>`,
    `<text x="20" y="${fmt(cueLaneY + 28)}" font-family="${SANS_FONT}" font-size="12" font-weight="700" fill="${PALETTE.inkPrimary}">SFX 큐</text>`,
    `<text x="20" y="${fmt(cueLaneY + 44)}" font-family="${SANS_FONT}" font-size="10.5" fill="${PALETTE.inkSecondary}">L/C/R 패닝</text>`,
  );

  for (let i = 0; i < mixReport.compiledCues.length; i += 1) {
    const cue = mixReport.compiledCues[i];
    if (cue === undefined) continue;
    const x1 = timeToX(cue.startTimeMs);
    const blockW = Math.max(46, timeToX(cue.endTimeMs) - x1);
    const clampedX = Math.min(x1, padLeft + trackW - blockW);
    const blockY = cueLaneY + 8 + ((laneRows[i] ?? 0) % rowCount) * 34;
    const style = ARCHETYPE_STYLES[cue.archetype];
    const labelText = blockW >= 145 ? `${cue.sfxTextKo} ${cue.accessibleCaptionKo}` : cue.sfxTextKo;
    parts.push(
      `<rect x="${fmt(clampedX)}" y="${fmt(blockY)}" width="${fmt(blockW)}" height="28" rx="6" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.2"/>`,
      `<rect x="${fmt(clampedX + 4)}" y="${fmt(blockY + 5)}" width="18" height="18" rx="4" fill="${PALETTE.panBadgeBg}"/>`,
      `<text x="${fmt(clampedX + 13)}" y="${fmt(blockY + 18)}" text-anchor="middle" font-family="${MONO_FONT}" font-size="10.5" font-weight="700" fill="${PALETTE.panBadgeText}">${cue.pan.stereoZone}</text>`,
      `<text x="${fmt(clampedX + 27)}" y="${fmt(blockY + 18)}" font-family="${SANS_FONT}" font-size="11" font-weight="600" fill="${PALETTE.inkPrimary}">${escapeXml(labelText)}</text>`,
    );
  }

  parts.push(
    `<rect x="${fmt(padLeft)}" y="${fmt(hapticY)}" width="${fmt(trackW)}" height="${fmt(hapticH)}" rx="8" fill="${PALETTE.panelBg}" stroke="${PALETTE.border}" stroke-width="1"/>`,
    `<text x="20" y="${fmt(hapticY + 26)}" font-family="${SANS_FONT}" font-size="12" font-weight="700" fill="${PALETTE.inkPrimary}">햅틱 펄스</text>`,
  );

  if (mixReport.accessibilityBridge.hapticAndShakeSuppressed) {
    parts.push(
      `<rect x="${fmt(padLeft + 10)}" y="${fmt(hapticY + 9)}" width="${fmt(trackW - 20)}" height="${fmt(hapticH - 18)}" rx="6" fill="${PALETTE.hapticSuppressedFill}"/>`,
      `<text x="${fmt(padLeft + trackW * 0.5)}" y="${fmt(hapticY + 26)}" text-anchor="middle" font-family="${SANS_FONT}" font-size="11.5" font-weight="600" fill="${PALETTE.hapticSuppressedText}">${escapeXml("동작 줄이기 / 햅틱 비활성: 진동 0ms · 화면 흔들림 0px 유지")}</text>`,
    );
  } else {
    for (let i = 0; i < mixReport.accessibilityBridge.hapticEvents.length; i += 1) {
      const ev = mixReport.accessibilityBridge.hapticEvents[i];
      if (ev === undefined) continue;
      const hx = timeToX(ev.startTimeMs);
      const hw = Math.max(4, (ev.durationMs / safeDurationMs) * trackW);
      const hh = Math.round(12 + clamp(ev.intensity, 0.1, 1) * 18);
      parts.push(
        `<rect x="${fmt(hx)}" y="${fmt(hapticY + hapticH - 7 - hh)}" width="${fmt(hw)}" height="${fmt(hh)}" rx="2" fill="${PALETTE.hapticTickFill}"/>`,
      );
    }
  }

  parts.push("</svg>");
  return parts.join("\n");
}

/** 에피소드 SFX 믹스 및 접근성 브리지의 출고 기준 준수 여부를 구조화해 감사한다. */
export function auditSfxFoleyBridge(mixReport: EpisodeSfxMixReport): SfxFoleyBridgeAuditReport {
  const constantPowerPanValid = mixReport.compiledCues.every((c) => Math.abs(c.pan.powerSum - 1.0) <= 1e-6);
  const broadcastPeakSafe = mixReport.masterMetrics.withinBroadcastCeiling;
  const zeroClippingAndFinite =
    mixReport.masterMetrics.clippedSampleCount === 0 && mixReport.masterMetrics.nonFiniteSampleCount === 0;
  const silentReaderCaptionsComplete = mixReport.accessibilityBridge.allCuesCaptioned;
  const reducedMotionAndHapticsSafe = mixReport.accessibilityBridge.reducedMotionCompliant;
  const byteSavingsTargetMet =
    mixReport.compiledCues.length === 0 || mixReport.byteBudget.byteSavingsPercent >= 95.0;

  return {
    episodeId: mixReport.episodeId,
    cueCount: mixReport.compiledCues.length,
    totalDurationMs: mixReport.totalDurationMs,
    broadcastPeakSafe,
    masterPeakDbfs: mixReport.masterMetrics.masterPeakDbfs,
    zeroClippingAndFinite,
    constantPowerPanValid,
    silentReaderCaptionsComplete,
    reducedMotionAndHapticsSafe,
    byteSavingsTargetMet,
    byteSavingsPercent: mixReport.byteBudget.byteSavingsPercent,
    readyForEpisodeDelivery:
      broadcastPeakSafe &&
      zeroClippingAndFinite &&
      constantPowerPanValid &&
      silentReaderCaptionsComplete &&
      reducedMotionAndHapticsSafe &&
      byteSavingsTargetMet,
  };
}

/** 사운드 디렉터 관점의 자연스러운 한국어 QA 브리프를 생성한다. */
export function summarizeSfxFoleyBridgeKo(mixReport: EpisodeSfxMixReport): string {
  const audit = auditSfxFoleyBridge(mixReport);
  const { masterMetrics, accessibilityBridge, byteBudget, compiledCues } = mixReport;
  const peakText = `${fmt(masterMetrics.masterPeakDbfs, 2)} dBFS`;
  const peakJudgment = audit.broadcastPeakSafe
    ? `방송 안전 상한(-1.0 dBFS) 이내(${peakText}, 클리핑 0건)`
    : `상한 점검 필요(${peakText}, 클리핑 ${masterMetrics.clippedSampleCount}건)`;
  const sampleCaption = compiledCues[0]?.accessibleCaptionKo ?? "[무음 자막 대기]";
  const captionSummary = audit.silentReaderCaptionsComplete
    ? `전체 ${accessibilityBridge.totalCueCount}건 모두 한국어 자막 부착 완료(예: ${sampleCaption})`
    : `자막 누락 큐 존재(${accessibilityBridge.captionedCueCount}/${accessibilityBridge.totalCueCount}건)`;
  const hapticSummary = accessibilityBridge.hapticAndShakeSuppressed
    ? "동작 줄이기 또는 햅틱 비활성 상태여서 진동 0ms·화면 흔들림 0px로 완전 차단됨"
    : `햅틱 펄스 최대 ${accessibilityBridge.maxObservedHapticBurstMs}ms(상한 ${accessibilityBridge.maxHapticBurstLimitMs}ms 이하), 화면 흔들림 최대 ${fmt(accessibilityBridge.maxObservedVisualShakePx, 1)}px`;

  return [
    `[사운드 QA 브리프 · ${mixReport.episodeId}] ${audit.readyForEpisodeDelivery ? "에피소드 출고 기준 통과" : "출고 전 점검 항목 있음"}`,
    `- 믹스 구성: 한국어 효과음 ${compiledCues.length}건, 총 길이 ${fmt(mixReport.totalDurationMs / 1000, 2)}초, 동시 최대 중첩 ${masterMetrics.maxSimultaneousCues}트랙`,
    `- 피크 안전: ${peakJudgment}, 비유한 샘플 ${masterMetrics.nonFiniteSampleCount}건`,
    `- 용량 절감: 프로시저럴 시드 ${byteBudget.proceduralSeedPayloadBytes}B vs 무압축 WAV ${byteBudget.equivalentWavBytes}B(${fmt(byteBudget.byteSavingsPercent, 2)}% 절감, 오디오 파일 다운로드 불필요)`,
    `- 무음 독자 자막: ${captionSummary}`,
    `- 햅틱·전정 안전: ${hapticSummary}`,
  ].join("\n");
}
