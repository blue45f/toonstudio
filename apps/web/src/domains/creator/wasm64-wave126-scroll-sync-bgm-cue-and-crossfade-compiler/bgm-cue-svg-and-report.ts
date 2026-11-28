/**
 * Wave 126 — 인쇄 안전 순수 OKLCH 세로 스크롤 BGM 큐시트·정전력 크로스페이드 포락선 SVG
 * 및 웹툰 음악 감독용 자연스러운 한국어 QA 브리프 생성기.
 *
 * - 모든 SVG 색상은 `oklch(...)`만 사용하며 raw `#hex` / `rgb(` / `rgba(` / `hsl(` 을 금지한다.
 * - 모든 텍스트는 XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 이스케이프한다.
 * - 모든 좌표 수치에 유한수 가드를 적용해 `NaN`/`Infinity` 출력을 원천 차단한다.
 */

import type {
  BgmTrackCueSpec,
  CamelotCompatibilityLevel,
  EpisodeBgmCueAuditReport,
  ScrollAudioSessionResult,
} from "./scroll-sync-bgm-types";
import {
  evaluateScrollBgmMixAtPosition,
  sortBgmCuesDeterministically,
} from "./scroll-sync-bgm-cue-compiler";

export interface ScrollSyncBgmSvgOptions {
  readonly widthPx?: number;
  readonly plotHeightPx?: number;
  readonly sampleCount?: number;
  readonly titleOverride?: string;
}

export interface BgmDirectorBriefOptions {
  readonly episodeLabel?: string;
  readonly auditDateIso?: string;
}

interface TrackStrokeStyle {
  readonly stroke: string;
  readonly fill: string;
  readonly dashArray: string;
}

interface BadgePalette {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly tag: string;
}

const OKLCH_BG = "oklch(0.985 0.006 90)";
const OKLCH_CARD = "oklch(1 0 0)";
const OKLCH_LINEN = "oklch(0.958 0.01 90)";
const OKLCH_BORDER = "oklch(0.32 0.035 158 / 0.16)";
const OKLCH_GRID = "oklch(0.32 0.035 158 / 0.10)";
const OKLCH_INK_TITLE = "oklch(0.22 0.035 158)";
const OKLCH_INK_BODY = "oklch(0.30 0.025 158)";
const OKLCH_INK_MUTED = "oklch(0.48 0.02 158)";
const OKLCH_CROSSFADE_BAND = "oklch(0.92 0.04 195 / 0.36)";
const OKLCH_SILENCE_FILL = "oklch(0.24 0.02 250 / 0.12)";
const OKLCH_SILENCE_STROKE = "oklch(0.30 0.03 250)";
const OKLCH_MUDDY_FILL = "oklch(0.91 0.08 24 / 0.32)";
const OKLCH_MUDDY_STROKE = "oklch(0.46 0.18 24)";
const OKLCH_LUFS_SAFE = "oklch(0.46 0.11 156)";
const OKLCH_LUFS_OVER = "oklch(0.48 0.19 25)";
const OKLCH_LUFS_TRACK = "oklch(0.93 0.008 90)";
const OKLCH_LUFS_LIMIT = "oklch(0.46 0.17 26)";

const OKLCH_TRACK_STYLES: readonly TrackStrokeStyle[] = [
  { stroke: "oklch(0.40 0.11 158)", fill: "oklch(0.40 0.11 158 / 0.14)", dashArray: "" },
  { stroke: "oklch(0.44 0.13 252)", fill: "oklch(0.44 0.13 252 / 0.14)", dashArray: "6 2" },
  { stroke: "oklch(0.52 0.14 70)", fill: "oklch(0.52 0.14 70 / 0.14)", dashArray: "3 2" },
  { stroke: "oklch(0.46 0.14 318)", fill: "oklch(0.46 0.14 318 / 0.14)", dashArray: "8 2 2 2" },
  { stroke: "oklch(0.45 0.10 198)", fill: "oklch(0.45 0.10 198 / 0.14)", dashArray: "2 2" },
  { stroke: "oklch(0.49 0.15 34)", fill: "oklch(0.49 0.15 34 / 0.14)", dashArray: "10 3" },
];

const OKLCH_CAMELOT_BADGES: Readonly<Record<CamelotCompatibilityLevel, BadgePalette>> = {
  "harmonic-compatible": {
    fill: "oklch(0.94 0.045 155)",
    stroke: "oklch(0.40 0.11 155)",
    text: "oklch(0.24 0.08 155)",
    tag: "조화",
  },
  "energy-shift-caution": {
    fill: "oklch(0.95 0.06 85)",
    stroke: "oklch(0.54 0.14 75)",
    text: "oklch(0.32 0.10 70)",
    tag: "전조",
  },
  "harmonic-clash-warning": {
    fill: "oklch(0.92 0.08 24)",
    stroke: "oklch(0.46 0.18 24)",
    text: "oklch(0.28 0.14 24)",
    tag: "충돌",
  },
};

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeBgmSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
  return String(Object.is(safe, -0) ? 0 : safe);
}

function safeRange(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function statusBadgeStyle(status: EpisodeBgmCueAuditReport["status"]): {
  readonly labelKo: string;
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
} {
  if (status === "pass") {
    return {
      labelKo: "검수 통과",
      fill: "oklch(0.94 0.045 155)",
      stroke: "oklch(0.40 0.11 155)",
      text: "oklch(0.24 0.08 155)",
    };
  }
  if (status === "pass-with-warnings") {
    return {
      labelKo: "주의 확인",
      fill: "oklch(0.95 0.06 85)",
      stroke: "oklch(0.54 0.14 75)",
      text: "oklch(0.32 0.10 70)",
    };
  }
  return {
    labelKo: status === "invalid-input" ? "입력 오류" : "보완 필요",
    fill: "oklch(0.92 0.08 24)",
    stroke: "oklch(0.46 0.18 24)",
    text: "oklch(0.28 0.14 24)",
  };
}

function buildSampleYs(
  cues: readonly BgmTrackCueSpec[],
  episodeLengthYPx: number,
  sampleCount: number,
): readonly number[] {
  const points: number[] = [];
  const steps = Math.max(24, Math.round(sampleCount));
  for (let i = 0; i <= steps; i += 1) {
    points.push((episodeLengthYPx * i) / steps);
  }
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    points.push(cue.startYPx, cue.endYPx);
    if (cue.fadeInPx > 0) points.push(Math.min(cue.endYPx, cue.startYPx + cue.fadeInPx));
    if (cue.fadeOutPx > 0) points.push(Math.max(cue.startYPx, cue.endYPx - cue.fadeOutPx));
  }
  points.sort((a, b) => a - b);
  const unique: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!Number.isFinite(p) || p < 0 || p > episodeLengthYPx) continue;
    if (unique.length === 0 || Math.abs(p - unique[unique.length - 1]) > 0.25) {
      unique.push(p);
    }
  }
  return unique;
}

/**
 * 세로 스크롤 축 대비 정전력 크로스페이드 곡선, 극적 무음 컷 밴드,
 * 카멜롯 화성 조화/충돌 배지, 트랙별 LUFS 미터를 순수 `oklch(...)` SVG로 렌더링한다.
 */
export function renderScrollSyncBgmCueSvg(
  cues: readonly BgmTrackCueSpec[],
  audit: EpisodeBgmCueAuditReport,
  options: ScrollSyncBgmSvgOptions = {},
): string {
  const width = safeRange(options.widthPx, 960, 720, 1600);
  const titleText = escapeBgmSvgXml(
    options.titleOverride ?? "세로 스크롤 동기화 BGM 큐시트 · 정전력 크로스페이드 포락선",
  );
  const badge = statusBadgeStyle(audit.status);
  const shaShort = escapeBgmSvgXml(audit.cueSheetSha256Hex.slice(0, 12));

  if (!audit.inputValid || !Array.isArray(cues) || cues.length === 0 || audit.episodeLengthYPx <= 0) {
    const emptyHeight = 220;
    const reasonText =
      audit.validationIssues.length > 0
        ? audit.validationIssues[0].messageKo
        : "유효한 BGM 큐시트가 없어 포락선을 그릴 수 없습니다.";
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(width)} ${fmtNum(emptyHeight)}" width="${fmtNum(width)}" height="${fmtNum(emptyHeight)}" role="img" aria-label="${titleText}">`,
      `<rect x="0" y="0" width="${fmtNum(width)}" height="${fmtNum(emptyHeight)}" fill="${OKLCH_BG}" rx="12" />`,
      `<rect x="20" y="20" width="${fmtNum(width - 40)}" height="${fmtNum(emptyHeight - 40)}" fill="${OKLCH_CARD}" stroke="${OKLCH_BORDER}" stroke-width="1.2" rx="10" />`,
      `<text x="40" y="60" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_INK_TITLE}">${titleText}</text>`,
      `<rect x="${fmtNum(width - 148)}" y="38" width="108" height="26" rx="13" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="1.2" />`,
      `<text x="${fmtNum(width - 94)}" y="55" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${badge.text}">${escapeBgmSvgXml(badge.labelKo)}</text>`,
      `<text x="40" y="114" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="${OKLCH_INK_BODY}">${escapeBgmSvgXml(reasonText)}</text>`,
      `<text x="40" y="152" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" fill="${OKLCH_INK_MUTED}">SHA-256: ${shaShort}</text>`,
      `</svg>`,
    ].join("\n");
  }

  const sorted = sortBgmCuesDeterministically(cues);
  const normalCues: BgmTrackCueSpec[] = [];
  const silenceCues: BgmTrackCueSpec[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].isDramaticSilenceCut) silenceCues.push(sorted[i]);
    else normalCues.push(sorted[i]);
  }

  const headerH = 88;
  const footerH = 56;
  const plotTop = headerH + 24;
  const computedPlotH = Math.max(360, normalCues.length * 64 + 80);
  const plotH = safeRange(options.plotHeightPx, computedPlotH, 320, 1200);
  const totalHeight = plotTop + plotH + footerH;

  const axisLeft = 78;
  const plotLeft = axisLeft + 12;
  const plotW = Math.round((width - 130) * 0.44);
  const harmonyLeft = plotLeft + plotW + 24;
  const harmonyW = Math.round((width - 130) * 0.25);
  const lufsLeft = harmonyLeft + harmonyW + 20;
  const lufsW = Math.max(160, width - lufsLeft - 28);

  const totalY = Math.max(1, audit.episodeLengthYPx);
  const mapY = (scrollY: number): number => plotTop + (Math.max(0, Math.min(totalY, scrollY)) / totalY) * plotH;
  const mapGainX = (gain: number): number => plotLeft + Math.max(0, Math.min(1, gain)) * plotW;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(width)} ${fmtNum(totalHeight)}" width="${fmtNum(width)}" height="${fmtNum(totalHeight)}" role="img" aria-label="${titleText}">`,
  );
  parts.push(`<rect x="0" y="0" width="${fmtNum(width)}" height="${fmtNum(totalHeight)}" fill="${OKLCH_BG}" rx="12" />`);

  // 헤더 카드
  parts.push(
    `<rect x="16" y="14" width="${fmtNum(width - 32)}" height="66" rx="10" fill="${OKLCH_CARD}" stroke="${OKLCH_BORDER}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="32" y="42" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_INK_TITLE}">${titleText}</text>`,
  );
  parts.push(
    `<text x="32" y="64" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${OKLCH_INK_MUTED}">BGM ${audit.normalBgmCueCount}곡 · 극적 무음 ${audit.dramaticSilenceCutCount}구간 · 총 길이 ${Math.round(totalY).toLocaleString("en-US")}px · 상한 ${audit.maxAllowedLufs.toFixed(1)} LUFS · sha256:${shaShort}</text>`,
  );
  parts.push(
    `<rect x="${fmtNum(width - 140)}" y="32" width="108" height="28" rx="14" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="1.2" />`,
  );
  parts.push(
    `<text x="${fmtNum(width - 86)}" y="50" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${badge.text}">${escapeBgmSvgXml(badge.labelKo)}</text>`,
  );

  // 컬럼 제목
  parts.push(
    `<text x="${fmtNum(plotLeft)}" y="${fmtNum(plotTop - 8)}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_INK_BODY}">정전력 크로스페이드 포락선 (Gain 0.0 → 1.0)</text>`,
  );
  parts.push(
    `<text x="${fmtNum(harmonyLeft)}" y="${fmtNum(plotTop - 8)}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_INK_BODY}">카멜롯 화성 전환</text>`,
  );
  parts.push(
    `<text x="${fmtNum(lufsLeft)}" y="${fmtNum(plotTop - 8)}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_INK_BODY}">트랙별 LUFS 미터</text>`,
  );

  // 포락선 플롯 영역 배경 & 격자
  parts.push(
    `<rect x="${fmtNum(plotLeft)}" y="${fmtNum(plotTop)}" width="${fmtNum(plotW)}" height="${fmtNum(plotH)}" fill="${OKLCH_CARD}" stroke="${OKLCH_BORDER}" stroke-width="1" rx="6" />`,
  );
  const gainTicks = [0, 0.25, 0.5, 0.707, 1];
  for (let i = 0; i < gainTicks.length; i += 1) {
    const gx = mapGainX(gainTicks[i]);
    parts.push(
      `<line x1="${fmtNum(gx)}" y1="${fmtNum(plotTop)}" x2="${fmtNum(gx)}" y2="${fmtNum(plotTop + plotH)}" stroke="${OKLCH_GRID}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmtNum(gx)}" y="${fmtNum(plotTop + plotH + 16)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" fill="${OKLCH_INK_MUTED}">${gainTicks[i] === 0.707 ? "0.71" : String(gainTicks[i])}</text>`,
    );
  }

  // 세로 스크롤 깊이 눈금
  const yTickCount = 5;
  for (let i = 0; i <= yTickCount; i += 1) {
    const sy = (totalY * i) / yTickCount;
    const py = mapY(sy);
    parts.push(
      `<line x1="${fmtNum(plotLeft)}" y1="${fmtNum(py)}" x2="${fmtNum(plotLeft + plotW)}" y2="${fmtNum(py)}" stroke="${OKLCH_GRID}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmtNum(axisLeft - 4)}" y="${fmtNum(py + 3)}" text-anchor="end" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" fill="${OKLCH_INK_MUTED}">${Math.round(sy)}px</text>`,
    );
  }

  // 크로스페이드 겹침 구간 하이라이트 밴드
  for (let i = 0; i < audit.transitions.length; i += 1) {
    const tr = audit.transitions[i];
    if (tr.hasOverlap && tr.overlapStartYPx !== null && tr.overlapEndYPx !== null) {
      const y1 = mapY(tr.overlapStartYPx);
      const y2 = mapY(tr.overlapEndYPx);
      parts.push(
        `<rect x="${fmtNum(plotLeft + 1)}" y="${fmtNum(y1)}" width="${fmtNum(plotW - 2)}" height="${fmtNum(Math.max(2, y2 - y1))}" fill="${OKLCH_CROSSFADE_BAND}" />`,
      );
    }
  }

  // 3중 혼탁 구간 경고 밴드
  for (let i = 0; i < audit.muddyOverlaps.length; i += 1) {
    const muddy = audit.muddyOverlaps[i];
    const y1 = mapY(muddy.startYPx);
    const y2 = mapY(muddy.endYPx);
    parts.push(
      `<rect x="${fmtNum(plotLeft + 1)}" y="${fmtNum(y1)}" width="${fmtNum(plotW - 2)}" height="${fmtNum(Math.max(4, y2 - y1))}" fill="${OKLCH_MUDDY_FILL}" stroke="${OKLCH_MUDDY_STROKE}" stroke-width="1.2" stroke-dasharray="3 2" />`,
    );
  }

  // 극적 무음 컷 격리 밴드
  for (let i = 0; i < silenceCues.length; i += 1) {
    const sc = silenceCues[i];
    const y1 = mapY(sc.startYPx);
    const y2 = mapY(sc.endYPx);
    const bandH = Math.max(8, y2 - y1);
    parts.push(
      `<rect x="${fmtNum(plotLeft + 1)}" y="${fmtNum(y1)}" width="${fmtNum(plotW - 2)}" height="${fmtNum(bandH)}" fill="${OKLCH_SILENCE_FILL}" stroke="${OKLCH_SILENCE_STROKE}" stroke-width="1.3" stroke-dasharray="4 3" />`,
    );
    parts.push(
      `<text x="${fmtNum(plotLeft + plotW - 8)}" y="${fmtNum(y1 + bandH / 2 + 3.5)}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="${OKLCH_SILENCE_STROKE}">무음 격리 · ${escapeBgmSvgXml(truncateText(sc.titleKo, 16))}</text>`,
    );
  }

  // 각 정상 BGM 트랙의 실제 정전력 포락선 곡선 샘플링 & Path 렌더링
  const sampleYs = buildSampleYs(sorted, totalY, safeRange(options.sampleCount, 96, 32, 240));
  const trackPaths: Record<string, string[]> = {};
  for (let i = 0; i < normalCues.length; i += 1) {
    trackPaths[normalCues[i].cueId] = [];
  }

  for (let s = 0; s < sampleYs.length; s += 1) {
    const sy = sampleYs[s];
    const py = mapY(sy);
    const mix = evaluateScrollBgmMixAtPosition(sorted, sy);
    const gainMap: Record<string, number> = {};
    for (let k = 0; k < mix.activeTracks.length; k += 1) {
      gainMap[mix.activeTracks[k].cueId] = mix.activeTracks[k].linearGain;
    }
    for (let i = 0; i < normalCues.length; i += 1) {
      const cue = normalCues[i];
      if (sy >= cue.startYPx - 0.5 && sy <= cue.endYPx + 0.5) {
        const g = gainMap[cue.cueId] ?? 0;
        const cmd = trackPaths[cue.cueId].length === 0 ? "M" : "L";
        trackPaths[cue.cueId].push(`${cmd}${fmtNum(mapGainX(g))},${fmtNum(py)}`);
      }
    }
  }

  for (let i = 0; i < normalCues.length; i += 1) {
    const cue = normalCues[i];
    const style = OKLCH_TRACK_STYLES[i % OKLCH_TRACK_STYLES.length];
    const d = trackPaths[cue.cueId].join(" ");
    if (d.length > 0) {
      const dashAttr = style.dashArray ? ` stroke-dasharray="${style.dashArray}"` : "";
      parts.push(
        `<path d="${d}" fill="none" stroke="${style.stroke}" stroke-width="2.2"${dashAttr} stroke-linejoin="round" />`,
      );
      const midY = mapY((cue.startYPx + cue.endYPx) / 2);
      parts.push(
        `<text x="${fmtNum(plotLeft + 8)}" y="${fmtNum(midY)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="600" fill="${style.stroke}">${escapeBgmSvgXml(truncateText(`${cue.cueId} · ${cue.titleKo} (${cue.musicalKeyCamelot})`, 26))}</text>`,
      );
    }
  }

  // 카멜롯 화성 전환 배지 열
  parts.push(
    `<rect x="${fmtNum(harmonyLeft)}" y="${fmtNum(plotTop)}" width="${fmtNum(harmonyW)}" height="${fmtNum(plotH)}" fill="${OKLCH_CARD}" stroke="${OKLCH_BORDER}" stroke-width="1" rx="6" />`,
  );
  for (let i = 0; i < audit.transitions.length; i += 1) {
    const tr = audit.transitions[i];
    const pal = tr.mitigatedBySilenceBridge
      ? OKLCH_CAMELOT_BADGES["harmonic-compatible"]
      : OKLCH_CAMELOT_BADGES[tr.camelot.compatibility];
    const cy = Math.max(plotTop + 20, Math.min(plotTop + plotH - 22, mapY(tr.transitionYPx)));
    const tag = tr.mitigatedBySilenceBridge ? "무음완충" : pal.tag;
    const label = `${tr.fromKey}→${tr.toKey} (d=${tr.camelot.distance} · ${tag})`;
    parts.push(
      `<rect x="${fmtNum(harmonyLeft + 8)}" y="${fmtNum(cy - 13)}" width="${fmtNum(harmonyW - 16)}" height="26" rx="6" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.1" />`,
    );
    parts.push(
      `<text x="${fmtNum(harmonyLeft + harmonyW / 2)}" y="${fmtNum(cy + 4)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="700" fill="${pal.text}">${escapeBgmSvgXml(label)}</text>`,
    );
  }
  if (audit.transitions.length === 0) {
    parts.push(
      `<text x="${fmtNum(harmonyLeft + harmonyW / 2)}" y="${fmtNum(plotTop + 34)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${OKLCH_INK_MUTED}">단일 BGM 트랙</text>`,
    );
  }

  // LUFS 미터 열 (-30 LUFS ~ -6 LUFS 스케일)
  parts.push(
    `<rect x="${fmtNum(lufsLeft)}" y="${fmtNum(plotTop)}" width="${fmtNum(lufsW)}" height="${fmtNum(plotH)}" fill="${OKLCH_CARD}" stroke="${OKLCH_BORDER}" stroke-width="1" rx="6" />`,
  );
  const lufsMin = -30;
  const lufsMax = -6;
  const barX = lufsLeft + 10;
  const barMaxW = Math.max(60, lufsW - 20);
  const mapLufsW = (lufs: number): number => {
    const ratio = (Math.max(lufsMin, Math.min(lufsMax, lufs)) - lufsMin) / (lufsMax - lufsMin);
    return ratio * barMaxW;
  };
  const limitX = barX + mapLufsW(audit.maxAllowedLufs);
  parts.push(
    `<line x1="${fmtNum(limitX)}" y1="${fmtNum(plotTop + 6)}" x2="${fmtNum(limitX)}" y2="${fmtNum(plotTop + plotH - 6)}" stroke="${OKLCH_LUFS_LIMIT}" stroke-width="1.3" stroke-dasharray="4 2" />`,
  );
  parts.push(
    `<text x="${fmtNum(limitX)}" y="${fmtNum(plotTop + plotH + 16)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" fill="${OKLCH_LUFS_LIMIT}">${audit.maxAllowedLufs.toFixed(1)} LUFS</text>`,
  );

  for (let i = 0; i < normalCues.length; i += 1) {
    const cue = normalCues[i];
    const rowTop = Math.max(
      plotTop + 10,
      Math.min(plotTop + plotH - 36, mapY((cue.startYPx + cue.endYPx) / 2) - 14),
    );
    const overLimit = cue.targetLufs > audit.maxAllowedLufs + 1e-9;
    const fill = overLimit ? OKLCH_LUFS_OVER : OKLCH_LUFS_SAFE;
    const fillW = Math.max(4, mapLufsW(cue.targetLufs));
    parts.push(
      `<text x="${fmtNum(barX)}" y="${fmtNum(rowTop + 8)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="600" fill="${OKLCH_INK_BODY}">${escapeBgmSvgXml(truncateText(cue.cueId, 14))} · ${cue.targetLufs.toFixed(1)} LUFS</text>`,
    );
    parts.push(
      `<rect x="${fmtNum(barX)}" y="${fmtNum(rowTop + 13)}" width="${fmtNum(barMaxW)}" height="10" rx="4" fill="${OKLCH_LUFS_TRACK}" />`,
    );
    parts.push(
      `<rect x="${fmtNum(barX)}" y="${fmtNum(rowTop + 13)}" width="${fmtNum(fillW)}" height="10" rx="4" fill="${fill}" />`,
    );
  }

  // 푸터 범례
  const footerY = totalHeight - 22;
  parts.push(
    `<rect x="16" y="${fmtNum(footerY - 14)}" width="${fmtNum(width - 32)}" height="24" rx="6" fill="${OKLCH_LINEN}" />`,
  );
  parts.push(
    `<text x="28" y="${fmtNum(footerY + 2)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_INK_MUTED}">정전력 크로스페이드(cos²+sin²=1) · 무음 격리 ≤-60dB(안티클릭 ≥40ms) · 오류 ${audit.errorCount}건 · 주의 ${audit.warningCount}건</text>`,
  );

  parts.push(`</svg>`);
  return parts.join("\n");
}

function statusHeadlineKo(status: EpisodeBgmCueAuditReport["status"]): string {
  switch (status) {
    case "pass":
      return "출고 가능 (화성·라우드니스·겹침 기준 충족)";
    case "pass-with-warnings":
      return "조건부 출고 가능 (주의 항목 확인 필요)";
    case "fail":
      return "수정 필요 (출고 차단 오류 검출)";
    case "invalid-input":
      return "검수 불가 (큐시트 입력 오류)";
  }
}

/**
 * 번역투를 배제한 자연스러운 한국어 웹툰 음악 감독 QA 브리프를 생성한다.
 */
export function summarizeScrollSyncBgmCueKo(
  audit: EpisodeBgmCueAuditReport,
  session?: ScrollAudioSessionResult,
  options: BgmDirectorBriefOptions = {},
): string {
  const lines: string[] = [];
  const episodeTag = options.episodeLabel ? ` (${options.episodeLabel})` : "";
  lines.push(`## 웹툰 스크롤 BGM 큐시트 검수 브리프${episodeTag}`);
  if (options.auditDateIso) {
    lines.push(`- 검수 일자: ${options.auditDateIso}`);
  }
  lines.push(`- 판정: ${statusHeadlineKo(audit.status)}`);
  lines.push(`- 큐시트 매니페스트 SHA-256: \`${audit.cueSheetSha256Hex}\``);

  if (!audit.inputValid) {
    lines.push("");
    lines.push("### 입력 검증 오류");
    for (let i = 0; i < audit.validationIssues.length; i += 1) {
      lines.push(`- ${audit.validationIssues[i].messageKo}`);
    }
    return lines.join("\n");
  }

  const lufsSummary =
    audit.minTargetLufs !== null && audit.maxTargetLufs !== null && audit.meanTargetLufs !== null
      ? `최저 ${audit.minTargetLufs.toFixed(1)} / 평균 ${audit.meanTargetLufs.toFixed(1)} / 최고 ${audit.maxTargetLufs.toFixed(1)} LUFS (권장 상한 ${audit.maxAllowedLufs.toFixed(1)} LUFS)`
      : "일반 BGM 트랙 없음";

  lines.push("");
  lines.push("### 에피소드 음향 구성 요약");
  lines.push(
    `- 전체 스크롤 길이 ${Math.round(audit.episodeLengthYPx).toLocaleString("en-US")}px 기준 일반 BGM ${audit.normalBgmCueCount}곡, 극적 무음 컷 ${audit.dramaticSilenceCutCount}개 배치`,
  );
  lines.push(`- 최대 동시 재생 트랙: ${audit.maxConcurrentBgmTracks}개 (권장 2개 이하)`);
  lines.push(`- 라우드니스 분포: ${lufsSummary}`);

  lines.push("");
  lines.push("### 화성·라우드니스 검수 결과");
  if (audit.findings.length === 0) {
    lines.push("- 검출된 오류나 주의 항목이 없습니다. 전 구간 정전력 크로스페이드와 화성 전환이 안정적입니다.");
  } else {
    for (let i = 0; i < audit.findings.length; i += 1) {
      const f = audit.findings[i];
      const prefix = f.severity === "error" ? "[오류]" : "[주의]";
      lines.push(`- ${prefix} ${f.messageKo} → 조치: ${f.remediationKo}`);
    }
  }

  if (session && session.ok) {
    lines.push("");
    lines.push("### 독자 스크롤 재생 안정성 실측 시뮬레이션");
    lines.push(
      `- 스크롤 패턴: ${session.profileKind} (최고 속도 ${session.peakScrollVelocityPxPerSec.toFixed(0)} px/s, 평균 ${session.meanScrollVelocityPxPerSec.toFixed(0)} px/s, 총 ${session.frameCount}프레임)`,
    );
    lines.push(
      `- 스래싱 방어: 히스테리시스 가드 재트리거 ${session.guarded.retriggerThrashCount}건 vs 단순 스위처 ${session.naive.retriggerThrashCount}건 (${session.thrashPreventedCount}건 차단)`,
    );
    lines.push(
      `- 팝/클릭 노이즈 방어: 가드 급변 클릭 ${session.guarded.abruptClickEventCount}건 vs 단순 스위처 ${session.naive.abruptClickEventCount}건 (최소 전환 램프 ${session.guarded.minObservedTransitionRampMs.toFixed(1)}ms)`,
    );
    if (session.guarded.dramaticSilenceCoreReached) {
      lines.push(
        `- 극적 무음 코어 잔류 이득: 최대 ${session.guarded.maxGainDuringSilenceCore.toFixed(6)} (기준 0.001 이하)`,
      );
    }
  }

  return lines.join("\n");
}
