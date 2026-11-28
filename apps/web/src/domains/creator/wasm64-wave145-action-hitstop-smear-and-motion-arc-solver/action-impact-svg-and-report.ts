/**
 * Wave 145 — 순수 OKLCH 액션 모션 호·스미어 팬·잔상·히트스톱 타임라인 SVG 렌더러 및
 * 한국어 액션 연출 감독 QA 브리프 생성기.
 *
 * - 100% `oklch(...)` 팔레트 전용 (원시 색상 표기 전면 배제)
 * - 상단: 모션 호, 부채꼴 스미어 팬, 지수 감쇠 잔상 고스트, 타격 임팩트 스타 & 충격 법선 화살표
 * - 하단: 60fps 페이즈 타임라인 바(예비·타격·플래시·히트스톱·잔심) 및 감쇠 카메라 셰이크 파형 그래프
 * - XML/XSS 이스케이프 및 자연스러운 실무 한국어 연출 검수 리포트
 */

import type {
  ActionImpactSequenceResult,
  ActionImpactTier,
  ImpactFramePhase,
} from "./hitstop-timing-and-impact-solver";
import type { ActionPoint2D } from "./motion-arc-and-smear-geometry";

export type ActionStoryboardSvgTheme = "studio-paper" | "studio-dark";

export interface ActionStoryboardSvgOptions {
  readonly title?: string;
  readonly theme?: ActionStoryboardSvgTheme;
  readonly width?: number;
  readonly showImpactNormalArrow?: boolean;
}

export interface ActionDirectorQaReportKo {
  readonly cutId: string;
  readonly tier: ActionImpactTier;
  readonly tierLabelKo: string;
  readonly totalFrames: number;
  readonly totalDurationMs: number;
  readonly hitStopFreezeFrames: number;
  readonly wcagCompliant: boolean;
  readonly prefersReducedMotion: boolean;
  readonly actionSequenceSha256Hex: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly timingVerdictKo: string;
  readonly smearAndKinematicsVerdictKo: string;
  readonly shakeAndSafetyVerdictKo: string;
  readonly checklistKo: readonly string[];
}

interface ActionOklchPalette {
  readonly pageBg: string;
  readonly cardBg: string;
  readonly cardBorder: string;
  readonly gridLine: string;
  readonly arcStroke: string;
  readonly smearFill: string;
  readonly smearStroke: string;
  readonly impactBurstFill: string;
  readonly impactBurstStroke: string;
  readonly normalArrowStroke: string;
  readonly textPrimary: string;
  readonly textMuted: string;
  readonly badgeBg: string;
  readonly badgeSafeFg: string;
  readonly badgeWarnFg: string;
  readonly shakeAxisLine: string;
  readonly shakeWaveStroke: string;
  readonly shakeEnvelopeStroke: string;
  readonly phaseColors: Record<ImpactFramePhase, string>;
}

const STUDIO_PAPER_PALETTE: ActionOklchPalette = {
  pageBg: "oklch(0.975 0.006 88)",
  cardBg: "oklch(0.994 0.003 90)",
  cardBorder: "oklch(0.28 0.015 255)",
  gridLine: "oklch(0.89 0.008 88)",
  arcStroke: "oklch(0.24 0.02 255)",
  smearFill: "oklch(0.68 0.14 38 / 0.34)",
  smearStroke: "oklch(0.52 0.16 36)",
  impactBurstFill: "oklch(0.96 0.04 92)",
  impactBurstStroke: "oklch(0.42 0.17 28)",
  normalArrowStroke: "oklch(0.42 0.12 162)",
  textPrimary: "oklch(0.19 0.014 255)",
  textMuted: "oklch(0.45 0.016 250)",
  badgeBg: "oklch(0.94 0.012 92)",
  badgeSafeFg: "oklch(0.36 0.1 158)",
  badgeWarnFg: "oklch(0.48 0.16 42)",
  shakeAxisLine: "oklch(0.76 0.012 250)",
  shakeWaveStroke: "oklch(0.46 0.17 28)",
  shakeEnvelopeStroke: "oklch(0.54 0.11 245)",
  phaseColors: {
    anticipation: "oklch(0.66 0.09 245)",
    strike: "oklch(0.58 0.18 32)",
    "impact-flash": "oklch(0.22 0.02 260)",
    "hitstop-freeze": "oklch(0.48 0.15 20)",
    "follow-through": "oklch(0.56 0.11 162)",
  },
};

const STUDIO_DARK_PALETTE: ActionOklchPalette = {
  pageBg: "oklch(0.16 0.012 255)",
  cardBg: "oklch(0.21 0.014 255)",
  cardBorder: "oklch(0.76 0.016 90)",
  gridLine: "oklch(0.3 0.014 255)",
  arcStroke: "oklch(0.9 0.012 90)",
  smearFill: "oklch(0.74 0.15 44 / 0.36)",
  smearStroke: "oklch(0.8 0.15 44)",
  impactBurstFill: "oklch(0.96 0.03 92)",
  impactBurstStroke: "oklch(0.74 0.18 32)",
  normalArrowStroke: "oklch(0.74 0.13 162)",
  textPrimary: "oklch(0.94 0.008 90)",
  textMuted: "oklch(0.72 0.015 245)",
  badgeBg: "oklch(0.27 0.016 255)",
  badgeSafeFg: "oklch(0.76 0.13 158)",
  badgeWarnFg: "oklch(0.8 0.15 55)",
  shakeAxisLine: "oklch(0.44 0.016 250)",
  shakeWaveStroke: "oklch(0.76 0.17 34)",
  shakeEnvelopeStroke: "oklch(0.72 0.12 240)",
  phaseColors: {
    anticipation: "oklch(0.68 0.1 245)",
    strike: "oklch(0.72 0.17 36)",
    "impact-flash": "oklch(0.95 0.01 90)",
    "hitstop-freeze": "oklch(0.66 0.17 24)",
    "follow-through": "oklch(0.7 0.12 162)",
  },
};

const TIER_LABELS_KO: Record<ActionImpactTier, string> = {
  "light-jab": "경타 잽",
  "parry-clang": "패링 격돌",
  "heavy-slash": "강타 대검 베기",
  "finisher-critical": "필살 치명타",
};

const PHASE_LABELS_KO: Record<ImpactFramePhase, string> = {
  anticipation: "예비동작",
  strike: "가속 타격",
  "impact-flash": "임팩트 반전",
  "hitstop-freeze": "히트스톱 정지",
  "follow-through": "잔심 정리",
};

/** SVG 텍스트 및 속성용 XML/XSS 안전 이스케이프를 수행한다. */
export function escapeActionXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  return safe.toFixed(2);
}

interface ViewportTransform {
  readonly mapPoint: (pt: ActionPoint2D) => ActionPoint2D;
  readonly scale: number;
}

function createStageTransform(
  points: readonly ActionPoint2D[],
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): ViewportTransform {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = 0;
    maxX = 320;
    minY = 0;
    maxY = 200;
  }

  const pad = 28;
  const spanX = Math.max(24, maxX - minX);
  const spanY = Math.max(24, maxY - minY);
  const availW = Math.max(60, boxW - pad * 2);
  const availH = Math.max(60, boxH - pad * 2);
  const scale = Math.min(availW / spanX, availH / spanY);
  const offsetX = boxX + pad + (availW - spanX * scale) * 0.5;
  const offsetY = boxY + pad + (availH - spanY * scale) * 0.5;

  return {
    scale,
    mapPoint: (pt: ActionPoint2D): ActionPoint2D => ({
      x: offsetX + ((Number.isFinite(pt.x) ? pt.x : minX) - minX) * scale,
      y: offsetY + ((Number.isFinite(pt.y) ? pt.y : minY) - minY) * scale,
    }),
  };
}

function buildImpactStarPoints(center: ActionPoint2D, outerR: number, innerR: number, spikes: number): string {
  const tokens: string[] = [];
  const total = spikes * 2;
  for (let i = 0; i < total; i += 1) {
    const angle = (i * Math.PI) / spikes - Math.PI * 0.5;
    const r = i % 2 === 0 ? outerR : innerR;
    tokens.push(`${fmt(center.x + Math.cos(angle) * r)},${fmt(center.y + Math.sin(angle) * r)}`);
  }
  return tokens.join(" ");
}

/**
 * 상단 모션 호·스미어 팬·고스트 잔상·임팩트 스타 컷 프리뷰와
 * 하단 60fps 히트스톱/카메라 셰이크 감쇠 그래프를 순수 OKLCH SVG로 렌더링한다.
 */
export function renderActionImpactStoryboardSvg(
  sequence: ActionImpactSequenceResult,
  options: ActionStoryboardSvgOptions = {},
): string {
  const palette =
    options.theme === "studio-dark" ? STUDIO_DARK_PALETTE : STUDIO_PAPER_PALETTE;
  const totalW = Math.max(520, Math.min(1200, Math.round(options.width ?? 760)));
  const pad = 18;
  const headerH = 44;
  const previewH = 264;
  const gap = 16;
  const timelineH = 194;
  const totalH = pad + headerH + previewH + gap + timelineH + pad;
  const innerW = totalW - pad * 2;

  const tierLabel = TIER_LABELS_KO[sequence.tier];
  const rawTitle = options.title ?? `${sequence.titleKo} · ${tierLabel} 액션 스토리보드`;
  const safeTitle = escapeActionXml(rawTitle);
  const safeCutId = escapeActionXml(sequence.cutId);

  const stagePoints: ActionPoint2D[] = [];
  for (let i = 0; i < sequence.arc.samples.length; i += 1) {
    const sample = sequence.arc.samples[i];
    if (sample) stagePoints.push(sample.position);
  }
  for (let i = 0; i < sequence.smearFan.polygon.length; i += 1) {
    const pt = sequence.smearFan.polygon[i];
    if (pt) stagePoints.push(pt);
  }

  const previewY = pad + headerH;
  const transform = createStageTransform(stagePoints, pad, previewY, innerW, previewH);

  const smearPointsAttr = sequence.smearFan.polygon
    .map((pt) => {
      const m = transform.mapPoint(pt);
      return `${fmt(m.x)},${fmt(m.y)}`;
    })
    .join(" ");

  const arcPointsAttr = sequence.arc.samples
    .map((sample) => {
      const m = transform.mapPoint(sample.position);
      return `${fmt(m.x)},${fmt(m.y)}`;
    })
    .join(" ");

  const impactMapped = transform.mapPoint(sequence.arc.impactPoint);
  const starRadius = sequence.tier === "finisher-critical" ? 26 : sequence.tier === "heavy-slash" ? 21 : 16;
  const impactStarAttr = buildImpactStarPoints(impactMapped, starRadius, starRadius * 0.42, 8);

  const safetyBadgeText = sequence.safetyGuard.prefersReducedMotion
    ? "저모션 안전 모드 · 셰이크 0px · 정적 스틸 폴백"
    : sequence.safetyGuard.wcagFlashClamped
      ? `WCAG 2.3.1 클램프 적용 · ${sequence.safetyGuard.appliedFlashRateHz.toFixed(1)}Hz`
      : `WCAG 2.3.1 통과 · ${sequence.safetyGuard.appliedFlashRateHz.toFixed(1)}Hz`;
  const safetyBadgeFg =
    sequence.safetyGuard.wcagFlashClamped ? palette.badgeWarnFg : palette.badgeSafeFg;

  const chunks: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(totalW)} ${fmt(totalH)}" width="${fmt(totalW)}" height="${fmt(totalH)}" role="img" aria-label="${safeTitle}">`,
    `  <title>${safeTitle}</title>`,
    `  <rect x="0" y="0" width="${fmt(totalW)}" height="${fmt(totalH)}" fill="${palette.pageBg}" />`,
    `  <g data-layer="storyboard-header">`,
    `    <text x="${fmt(pad)}" y="${fmt(pad + 18)}" font-size="15" font-weight="700" fill="${palette.textPrimary}">${safeTitle}</text>`,
    `    <text x="${fmt(pad)}" y="${fmt(pad + 35)}" font-size="11" fill="${palette.textMuted}">컷 ${safeCutId} · ${sequence.fps}fps · 총 ${sequence.phaseCounts.totalFrames}프레임 (${fmt(sequence.phaseCounts.totalDurationMs)}ms) · 히트스톱 ${sequence.phaseCounts.hitStopFreezeFrames}f</text>`,
    `    <rect x="${fmt(totalW - pad - 246)}" y="${fmt(pad + 6)}" width="246" height="24" rx="12" fill="${palette.badgeBg}" stroke="${palette.gridLine}" stroke-width="1" />`,
    `    <text x="${fmt(totalW - pad - 123)}" y="${fmt(pad + 22)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="${safetyBadgeFg}">${escapeActionXml(safetyBadgeText)}</text>`,
    `  </g>`,
    `  <g data-layer="action-cut-preview">`,
    `    <rect x="${fmt(pad)}" y="${fmt(previewY)}" width="${fmt(innerW)}" height="${fmt(previewH)}" rx="10" fill="${palette.cardBg}" stroke="${palette.cardBorder}" stroke-width="1.5" />`,
  ];

  // Subtle stage reference grid
  for (let step = 1; step <= 3; step += 1) {
    const gy = previewY + (previewH * step) / 4;
    chunks.push(
      `    <line x1="${fmt(pad + 12)}" y1="${fmt(gy)}" x2="${fmt(pad + innerW - 12)}" y2="${fmt(gy)}" stroke="${palette.gridLine}" stroke-width="1" stroke-dasharray="4 4" />`,
    );
  }

  if (smearPointsAttr.length > 0) {
    chunks.push(
      `    <polygon data-layer="smear-fan-polygon" points="${smearPointsAttr}" fill="${palette.smearFill}" stroke="${palette.smearStroke}" stroke-width="1.6" stroke-linejoin="round" />`,
    );
  }

  if (arcPointsAttr.length > 0) {
    chunks.push(
      `    <polyline data-layer="motion-arc-curve" points="${arcPointsAttr}" fill="none" stroke="${palette.arcStroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`,
    );
  }

  // Afterimage ghosts with exponentially decaying opacity
  chunks.push(`    <g data-layer="afterimage-ghosts">`);
  for (let i = 0; i < sequence.afterimages.ghosts.length; i += 1) {
    const ghost = sequence.afterimages.ghosts[i];
    if (!ghost) continue;
    const mapped = transform.mapPoint(ghost.position);
    const rx = Math.max(4, 11 * ghost.squashStretch.scaleParallel);
    const ry = Math.max(3, 7 * ghost.squashStretch.scalePerp);
    const angleDeg = (Math.atan2(ghost.tangent.y, ghost.tangent.x) * 180) / Math.PI;
    chunks.push(
      `      <ellipse data-ghost-index="${ghost.ghostIndex}" cx="${fmt(mapped.x)}" cy="${fmt(mapped.y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${fmt(angleDeg)} ${fmt(mapped.x)} ${fmt(mapped.y)})" fill="${ghost.oklchTint}" fill-opacity="${fmt(ghost.alpha)}" stroke="${palette.arcStroke}" stroke-opacity="${fmt(ghost.alpha * 0.65)}" stroke-width="1" />`,
    );
  }
  chunks.push(`    </g>`);

  // Impact star burst
  chunks.push(
    `    <polygon data-layer="impact-star-burst" points="${impactStarAttr}" fill="${palette.impactBurstFill}" stroke="${palette.impactBurstStroke}" stroke-width="1.8" stroke-linejoin="round" />`,
  );

  // Impact normal / camera shake impulse direction arrow
  if (options.showImpactNormalArrow !== false) {
    const dir = sequence.cameraShake.impulseDirection;
    const arrowLen = 36;
    const ax2 = impactMapped.x + dir.x * arrowLen;
    const ay2 = impactMapped.y + dir.y * arrowLen;
    const perpX = -dir.y;
    const perpY = dir.x;
    const h1x = ax2 - dir.x * 8 + perpX * 5;
    const h1y = ay2 - dir.y * 8 + perpY * 5;
    const h2x = ax2 - dir.x * 8 - perpX * 5;
    const h2y = ay2 - dir.y * 8 - perpY * 5;
    chunks.push(
      `    <path data-layer="impact-normal-arrow" d="M ${fmt(impactMapped.x)} ${fmt(impactMapped.y)} L ${fmt(ax2)} ${fmt(ay2)} M ${fmt(h1x)} ${fmt(h1y)} L ${fmt(ax2)} ${fmt(ay2)} L ${fmt(h2x)} ${fmt(h2y)}" fill="none" stroke="${palette.normalArrowStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`,
    );
  }
  chunks.push(`  </g>`);

  // Bottom panel: 60fps Hit-Stop phase timeline + Damped Camera Shake waveform
  const timelineY = previewY + previewH + gap;
  const trackX = pad + 16;
  const trackW = innerW - 32;
  const barY = timelineY + 34;
  const barH = 26;

  chunks.push(`  <g data-layer="hitstop-and-shake-timeline">`);
  chunks.push(
    `    <rect x="${fmt(pad)}" y="${fmt(timelineY)}" width="${fmt(innerW)}" height="${fmt(timelineH)}" rx="10" fill="${palette.cardBg}" stroke="${palette.cardBorder}" stroke-width="1.25" />`,
  );
  chunks.push(
    `    <text x="${fmt(trackX)}" y="${fmt(timelineY + 22)}" font-size="12" font-weight="700" fill="${palette.textPrimary}">60fps 히트스톱 페이즈 타임라인 &amp; 감쇠 카메라 셰이크 파형</text>`,
  );

  const phasesOrdered: readonly { readonly phase: ImpactFramePhase; readonly count: number }[] = [
    { phase: "anticipation", count: sequence.phaseCounts.anticipationFrames },
    { phase: "strike", count: sequence.phaseCounts.strikeFrames },
    { phase: "impact-flash", count: sequence.phaseCounts.impactFlashFrames },
    { phase: "hitstop-freeze", count: sequence.phaseCounts.hitStopFreezeFrames },
    { phase: "follow-through", count: sequence.phaseCounts.followThroughFrames },
  ];

  let cursorX = trackX;
  const totalFramesSafe = Math.max(1, sequence.phaseCounts.totalFrames);
  for (let i = 0; i < phasesOrdered.length; i += 1) {
    const seg = phasesOrdered[i];
    if (!seg || seg.count <= 0) continue;
    const segW = (seg.count / totalFramesSafe) * trackW;
    chunks.push(
      `    <rect data-phase="${seg.phase}" x="${fmt(cursorX)}" y="${fmt(barY)}" width="${fmt(segW)}" height="${fmt(barH)}" rx="3" fill="${palette.phaseColors[seg.phase]}" />`,
    );
    if (segW >= 54) {
      chunks.push(
        `    <text x="${fmt(cursorX + segW * 0.5)}" y="${fmt(barY + 17)}" font-size="10" font-weight="600" text-anchor="middle" fill="${palette.pageBg}">${escapeActionXml(PHASE_LABELS_KO[seg.phase])} ${seg.count}f</text>`,
      );
    }
    cursorX += segW;
  }

  // Camera shake waveform subplot
  const waveTop = barY + barH + 22;
  const waveH = 74;
  const waveMidY = waveTop + waveH * 0.5;
  const maxAmp = Math.max(1, sequence.cameraShake.peakMagnitudePx);

  chunks.push(
    `    <line x1="${fmt(trackX)}" y1="${fmt(waveMidY)}" x2="${fmt(trackX + trackW)}" y2="${fmt(waveMidY)}" stroke="${palette.shakeAxisLine}" stroke-width="1" stroke-dasharray="3 3" />`,
  );

  const wavePoints: string[] = [];
  const envPoints: string[] = [];
  const shakeSamples = sequence.cameraShake.samples;
  const sampleDenom = Math.max(1, shakeSamples.length - 1);

  for (let i = 0; i < shakeSamples.length; i += 1) {
    const sample = shakeSamples[i];
    if (!sample) continue;
    const sx = trackX + (i / sampleDenom) * trackW;
    const normProj = sample.directionalProjectionPx / maxAmp;
    const normMag = sample.magnitudePx / maxAmp;
    const sy = waveMidY - normProj * (waveH * 0.44);
    const ey = waveMidY - normMag * (waveH * 0.44);
    wavePoints.push(`${fmt(sx)},${fmt(sy)}`);
    envPoints.push(`${fmt(sx)},${fmt(ey)}`);
  }

  if (envPoints.length > 1) {
    chunks.push(
      `    <polyline data-layer="camera-shake-envelope" points="${envPoints.join(" ")}" fill="none" stroke="${palette.shakeEnvelopeStroke}" stroke-width="1.2" stroke-dasharray="4 3" />`,
    );
  }
  if (wavePoints.length > 1) {
    chunks.push(
      `    <polyline data-layer="camera-shake-waveform" points="${wavePoints.join(" ")}" fill="none" stroke="${palette.shakeWaveStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`,
    );
  }

  const footerY = waveTop + waveH + 22;
  chunks.push(
    `    <text x="${fmt(trackX)}" y="${fmt(footerY)}" font-size="10.5" fill="${palette.textMuted}">초기 셰이크 진폭 ${fmt(sequence.cameraShake.initialAmplitudePx)}px · 종료 잔류 ${sequence.cameraShake.terminalResidualPx.toFixed(4)}px (&lt; 0.05px ${sequence.cameraShake.convergedWithinThreshold ? "수렴" : "초과"}) · SHA-256 ${escapeActionXml(sequence.actionSequenceSha256Hex.slice(0, 12))}</text>`,
  );
  chunks.push(`  </g>`);
  chunks.push(`</svg>`);

  return chunks.join("\n");
}

/**
 * 번역투 없는 실무 한국어 액션 연출 감독 QA 브리프를 생성한다.
 */
export function summarizeActionImpactSequenceKo(
  sequence: ActionImpactSequenceResult,
): ActionDirectorQaReportKo {
  const tierLabelKo = TIER_LABELS_KO[sequence.tier];
  const { phaseCounts, arc, smearFan, afterimages, cameraShake, safetyGuard } = sequence;

  const timingVerdictKo = `예비동작 ${phaseCounts.anticipationFrames}f → 가속 타격 ${phaseCounts.strikeFrames}f → 임팩트 반전 ${phaseCounts.impactFlashFrames}f → 히트스톱 ${phaseCounts.hitStopFreezeFrames}f → 잔심 ${phaseCounts.followThroughFrames}f 구성으로 총 ${phaseCounts.totalFrames}프레임(${phaseCounts.totalDurationMs.toFixed(1)}ms)에 타격 박자를 맞췄습니다.`;

  const smearAndKinematicsVerdictKo = `모션 호 길이 ${arc.totalArcLengthPx.toFixed(1)}px, 최대 선속도 ${arc.peakSpeedPxPerSec.toFixed(0)}px/s에서 스미어 팬 면적 ${smearFan.areaPx2.toFixed(1)}px²와 잔상 고스트 ${afterimages.ghosts.length}겹(알파 ${afterimages.maxAlpha.toFixed(2)} → ${afterimages.minAlpha.toFixed(2)})을 배치했고 면적 보존 스쿼시&스트레치 오차는 ${arc.maxAreaConservationError.toExponential(2)}로 유지했습니다.`;

  let shakeAndSafetyVerdictKo: string;
  if (safetyGuard.prefersReducedMotion) {
    shakeAndSafetyVerdictKo =
      "저모션 설정이 켜져 카메라 셰이크를 0px로 끄고 고대비 스트로브 플래시 0회 대신 정적 집중선·잔상 스틸 프레임으로 타격감을 유지했습니다.";
  } else if (safetyGuard.wcagFlashClamped) {
    shakeAndSafetyVerdictKo = `충격 법선 정렬 카메라 셰이크는 초기 ${cameraShake.initialAmplitudePx.toFixed(1)}px에서 종료 잔류 ${cameraShake.terminalResidualPx.toFixed(4)}px로 가라앉았고, 광과민 기준(3.0Hz)을 넘은 플래시 요청은 ${safetyGuard.appliedFlashCount}회(${safetyGuard.appliedFlashRateHz.toFixed(1)}Hz)로 자동 낮췄습니다.`;
  } else {
    shakeAndSafetyVerdictKo = `충격 법선 정렬 카메라 셰이크는 초기 ${cameraShake.initialAmplitudePx.toFixed(1)}px(정렬 코사인 ${cameraShake.initialAlignmentCosine.toFixed(3)})에서 종료 잔류 ${cameraShake.terminalResidualPx.toFixed(4)}px로 매끄럽게 멈췄고, 임팩트 플래시도 ${safetyGuard.appliedFlashRateHz.toFixed(1)}Hz로 WCAG 2.3.1 기준(3.0Hz 이하)을 지켰습니다.`;
  }

  const headlineKo = `${sequence.titleKo} · ${tierLabelKo} 액션 타이밍 검수 (${phaseCounts.totalFrames}f / 히트스톱 ${phaseCounts.hitStopFreezeFrames}f)`;
  const summaryParagraphKo = [
    `${tierLabelKo} 컷(${sequence.cutId})의 타격 시퀀스를 ${sequence.fps}fps 기준으로 합성했습니다.`,
    timingVerdictKo,
    smearAndKinematicsVerdictKo,
    shakeAndSafetyVerdictKo,
  ].join(" ");

  const checklistKo: string[] = [
    `호 길이 단조성 및 스쿼시·스트레치 면적 보존: ${arc.arcLengthMonotonic ? "단조 증가 통과" : "단조성 확인 필요"} / 최대 면적 오차 ${arc.maxAreaConservationError.toExponential(2)}`,
    `스미어 팬 및 잔상 알파 감쇠: 팬 면적 ${smearFan.areaPx2.toFixed(1)}px² (${smearFan.isPositiveArea ? "양수" : "비정상"}) / 잔상 ${afterimages.ghosts.length}겹 (${afterimages.alphaMonotonicallyDecreasing ? "단조 감소 통과" : "감쇠 역전"})`,
    `카메라 셰이크 수렴: 초기 ${cameraShake.initialAmplitudePx.toFixed(1)}px → 종료 ${cameraShake.terminalResidualPx.toFixed(4)}px (${cameraShake.convergedWithinThreshold ? "0.05px 미만 수렴" : "수렴 미달"})`,
    `광과민·저모션 안전 가드: WCAG 2.3.1 ${safetyGuard.wcagCompliant ? "준수" : "위반"} (${safetyGuard.appliedFlashRateHz.toFixed(1)}Hz, 1초 구간 최대 ${safetyGuard.maxFlashesInOneSecondWindow}회) / 저모션 ${safetyGuard.prefersReducedMotion ? "활성(스틸 폴백)" : "기본"}`,
    `매니페스트 SHA-256 지문: ${sequence.actionSequenceSha256Hex.slice(0, 16)}...`,
  ];

  return {
    cutId: sequence.cutId,
    tier: sequence.tier,
    tierLabelKo,
    totalFrames: phaseCounts.totalFrames,
    totalDurationMs: phaseCounts.totalDurationMs,
    hitStopFreezeFrames: phaseCounts.hitStopFreezeFrames,
    wcagCompliant: safetyGuard.wcagCompliant,
    prefersReducedMotion: safetyGuard.prefersReducedMotion,
    actionSequenceSha256Hex: sequence.actionSequenceSha256Hex,
    headlineKo,
    summaryParagraphKo,
    timingVerdictKo,
    smearAndKinematicsVerdictKo,
    shakeAndSafetyVerdictKo,
    checklistKo,
  };
}
