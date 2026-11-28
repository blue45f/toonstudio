/**
 * Wave 105 — 인쇄 안전 고대비 OKLCH 액션 VFX SVG 렌더러 및 한국어 연출 QA 리포트.
 *
 * - 원시 색상 표기를 배제하고 100% OKLCH 팔레트만 사용해 고대비 인쇄·화면 출력 보장
 * - 패널 프레임, 인물 안전 타원, 말풍선 보호 마스크, 집중선·속도선 폴리곤,
 *   검기 궤적 리본, 충격파·파열 균열, 잔상 고스트를 NaN/Infinity 없이 XML 안전 합성
 * - 번역투 없는 실무 한국어 액션 연출 검수 요약 생성
 */

import type {
  ActionSpeedlineFieldResult,
  SpeedlineFieldMode,
  Vec2,
} from "./focal-safe-speedline-generator";
import type {
  ActionImpactFxWgslArtifact,
  SwordSlashImpactFxResult,
} from "./slash-ribbon-shockwave-and-wgsl";

export type ActionFxSvgTheme = "print-high-contrast" | "studio-dark";

export interface ActionImpactFxScene {
  readonly title: string;
  readonly speedlineField: ActionSpeedlineFieldResult;
  readonly slashFx?: SwordSlashImpactFxResult;
  readonly wgslArtifact?: ActionImpactFxWgslArtifact;
  readonly showSafeZoneGuides?: boolean;
  readonly theme?: ActionFxSvgTheme;
}

export interface ActionImpactFxReportKo {
  readonly mode: SpeedlineFieldMode;
  readonly modeLabelKo: string;
  readonly totalLineCount: number;
  readonly totalPolygonCount: number;
  readonly keepOutIntrusionCount: number;
  readonly keepOutStatusKo: string;
  readonly angularEntropyScore: number;
  readonly organicClumpingGradeKo: string;
  readonly reducedMotionSafe: boolean;
  readonly reducedMotionStatusKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly checklistKo: readonly string[];
}

interface ActionFxOklchPalette {
  readonly paperBg: string;
  readonly panelStroke: string;
  readonly inkPrimary: string;
  readonly inkSecondary: string;
  readonly betaRingInk: string;
  readonly safeEllipseStroke: string;
  readonly safeEllipseFill: string;
  readonly balloonStroke: string;
  readonly balloonFill: string;
  readonly slashCoreFill: string;
  readonly slashEdgeStroke: string;
  readonly slashWakeStroke: string;
  readonly afterimageFill: string;
  readonly shockwaveStroke: string;
  readonly crackStroke: string;
  readonly badgeBg: string;
  readonly badgeBorder: string;
  readonly labelInk: string;
}

const PRINT_HIGH_CONTRAST_PALETTE: ActionFxOklchPalette = {
  paperBg: "oklch(0.985 0.006 85)",
  panelStroke: "oklch(0.18 0.015 260)",
  inkPrimary: "oklch(0.14 0.01 260)",
  inkSecondary: "oklch(0.28 0.014 260)",
  betaRingInk: "oklch(0.12 0.008 260)",
  safeEllipseStroke: "oklch(0.38 0.09 160)",
  safeEllipseFill: "oklch(0.95 0.025 160 / 0.24)",
  balloonStroke: "oklch(0.42 0.11 250)",
  balloonFill: "oklch(0.99 0.004 90 / 0.88)",
  slashCoreFill: "oklch(0.99 0.008 95)",
  slashEdgeStroke: "oklch(0.15 0.012 260)",
  slashWakeStroke: "oklch(0.46 0.16 32)",
  afterimageFill: "oklch(0.56 0.11 245)",
  shockwaveStroke: "oklch(0.34 0.13 28)",
  crackStroke: "oklch(0.18 0.01 260)",
  badgeBg: "oklch(0.975 0.006 85 / 0.94)",
  badgeBorder: "oklch(0.76 0.015 85)",
  labelInk: "oklch(0.20 0.018 255)",
};

const STUDIO_DARK_PALETTE: ActionFxOklchPalette = {
  paperBg: "oklch(0.17 0.012 250)",
  panelStroke: "oklch(0.84 0.015 90)",
  inkPrimary: "oklch(0.94 0.01 90)",
  inkSecondary: "oklch(0.76 0.018 240)",
  betaRingInk: "oklch(0.92 0.01 90)",
  safeEllipseStroke: "oklch(0.76 0.12 160)",
  safeEllipseFill: "oklch(0.32 0.06 160 / 0.28)",
  balloonStroke: "oklch(0.78 0.11 245)",
  balloonFill: "oklch(0.24 0.016 250 / 0.85)",
  slashCoreFill: "oklch(0.97 0.02 95)",
  slashEdgeStroke: "oklch(0.72 0.17 35)",
  slashWakeStroke: "oklch(0.78 0.15 48)",
  afterimageFill: "oklch(0.68 0.12 240)",
  shockwaveStroke: "oklch(0.78 0.16 32)",
  crackStroke: "oklch(0.88 0.02 90)",
  badgeBg: "oklch(0.21 0.014 250 / 0.94)",
  badgeBorder: "oklch(0.42 0.02 250)",
  labelInk: "oklch(0.93 0.01 90)",
};

const MODE_LABELS_KO: Record<SpeedlineFieldMode, string> = {
  "radial-focus-burst": "방사형 G펜 집중선",
  "directional-motion-blur": "방향성 속도선",
  "curved-vortex-rush": "곡선 소용돌이 돌진선",
  "impact-flash-beta": "임팩트 플래시 베타",
};

export function escapeActionFxXml(raw: string): string {
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

function pointsToSvgString(points: readonly Vec2[]): string {
  const tokens: string[] = [];
  for (const pt of points) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    tokens.push(`${fmt(pt.x)},${fmt(pt.y)}`);
  }
  return tokens.join(" ");
}

/**
 * 패널 프레임, 인물·말풍선 안전 영역, 집중선·속도선, 검기 궤적, 충격파를
 * 고대비 인쇄 안전 OKLCH SVG 문자열로 렌더링한다.
 */
export function renderActionImpactFxSvg(sceneFx: ActionImpactFxScene): string {
  const { speedlineField, slashFx } = sceneFx;
  const palette = sceneFx.theme === "studio-dark" ? STUDIO_DARK_PALETTE : PRINT_HIGH_CONTRAST_PALETTE;
  const showGuides = sceneFx.showSafeZoneGuides ?? true;
  const panel = speedlineField.panel;
  const x = Number.isFinite(panel.x) ? panel.x : 0;
  const y = Number.isFinite(panel.y) ? panel.y : 0;
  const width = Math.max(64, Number.isFinite(panel.width) ? panel.width : 800);
  const height = Math.max(64, Number.isFinite(panel.height) ? panel.height : 600);
  const rawTitle = sceneFx.title || "Wave 105 액션 VFX 합성 프리뷰";
  const safeTitle = escapeActionFxXml(rawTitle);
  const rawModeLabel = MODE_LABELS_KO[speedlineField.mode];

  const chunks: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}" role="img" aria-label="${safeTitle}">`,
    `  <title>${safeTitle}</title>`,
    `  <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" fill="${palette.paperBg}" stroke="${palette.panelStroke}" stroke-width="2.5" />`,
  ];

  if (speedlineField.outerBetaRingPolygons.length > 0) {
    chunks.push(`  <g data-layer="outer-beta-ring">`);
    for (const poly of speedlineField.outerBetaRingPolygons) {
      const pts = pointsToSvgString(poly);
      if (pts.length > 0) {
        chunks.push(`    <polygon points="${pts}" fill="${palette.betaRingInk}" />`);
      }
    }
    chunks.push(`  </g>`);
  }

  chunks.push(`  <g data-layer="action-speedlines" data-mode="${escapeActionFxXml(speedlineField.mode)}">`);
  for (const poly of speedlineField.polygons) {
    const pts = pointsToSvgString(poly.vertices);
    if (pts.length === 0) continue;
    const fill = poly.tier === "secondary" ? palette.inkSecondary : palette.inkPrimary;
    chunks.push(
      `    <polygon data-id="${escapeActionFxXml(poly.id)}" points="${pts}" fill="${fill}" fill-opacity="${fmt(poly.opacity, 1)}" />`,
    );
  }
  chunks.push(`  </g>`);

  if (showGuides) {
    const e = speedlineField.subjectSafeEllipse;
    const eMargin = Number.isFinite(e.marginPx) ? Math.max(0, e.marginPx as number) : 0;
    chunks.push(`  <g data-layer="keep-out-guides">`);
    chunks.push(
      `    <ellipse cx="${fmt(e.cx)}" cy="${fmt(e.cy)}" rx="${fmt(Math.max(1, e.rx + eMargin))}" ry="${fmt(Math.max(1, e.ry + eMargin))}" fill="${palette.safeEllipseFill}" stroke="${palette.safeEllipseStroke}" stroke-width="1.5" stroke-dasharray="6 4" />`,
    );
    for (const box of speedlineField.balloonKeepOutBoxes) {
      const pad = Number.isFinite(box.paddingPx) ? Math.max(0, box.paddingPx as number) : 0;
      chunks.push(
        `    <rect data-balloon="${escapeActionFxXml(box.id)}" x="${fmt(box.x - pad)}" y="${fmt(box.y - pad)}" width="${fmt(Math.max(1, box.width + pad * 2))}" height="${fmt(Math.max(1, box.height + pad * 2))}" rx="10" fill="${palette.balloonFill}" stroke="${palette.balloonStroke}" stroke-width="1.5" />`,
      );
    }
    chunks.push(`  </g>`);
  }

  if (slashFx) {
    chunks.push(`  <g data-layer="slash-afterimages">`);
    for (const ghost of slashFx.afterimageGhosts) {
      const pts = pointsToSvgString(ghost.closedPolygon);
      if (pts.length > 0) {
        chunks.push(
          `    <polygon points="${pts}" fill="${palette.afterimageFill}" fill-opacity="${fmt(ghost.opacity, 0.3)}" />`,
        );
      }
    }
    chunks.push(`  </g>`);

    chunks.push(`  <g data-layer="slash-shockwaves-and-cracks">`);
    for (const ring of slashFx.shockwaveRings) {
      const pts = pointsToSvgString(ring.points);
      if (pts.length > 0) {
        chunks.push(
          `    <polyline points="${pts}" fill="none" stroke="${palette.shockwaveStroke}" stroke-width="${fmt(ring.strokeWidthPx, 2)}" stroke-opacity="${fmt(ring.opacity, 0.6)}" stroke-linecap="round" />`,
        );
      }
    }
    for (const crack of slashFx.fractureCracks) {
      const mainPts = pointsToSvgString(crack.points);
      if (mainPts.length > 0) {
        chunks.push(
          `    <polyline points="${mainPts}" fill="none" stroke="${palette.crackStroke}" stroke-width="${fmt(crack.strokeWidthPx, 1.5)}" stroke-linecap="round" stroke-linejoin="miter" />`,
        );
      }
      for (const branch of crack.branchPoints) {
        const bPts = pointsToSvgString(branch);
        if (bPts.length > 0) {
          chunks.push(
            `    <polyline points="${bPts}" fill="none" stroke="${palette.crackStroke}" stroke-width="${fmt(crack.strokeWidthPx * 0.72, 1)}" stroke-linecap="round" />`,
          );
        }
      }
    }
    chunks.push(`  </g>`);

    chunks.push(`  <g data-layer="sword-slash-ribbon">`);
    const ribbonPts = pointsToSvgString(slashFx.closedPolygon);
    if (ribbonPts.length > 0) {
      chunks.push(
        `    <polygon points="${ribbonPts}" fill="${palette.slashCoreFill}" stroke="${palette.slashEdgeStroke}" stroke-width="2.2" stroke-linejoin="round" />`,
      );
    }
    for (const streak of slashFx.trailingStreakLines) {
      const sPts = pointsToSvgString(streak.points);
      if (sPts.length > 0) {
        chunks.push(
          `    <polyline points="${sPts}" fill="none" stroke="${palette.slashWakeStroke}" stroke-width="${fmt(streak.widthPx, 1.5)}" stroke-opacity="${fmt(streak.opacity, 0.65)}" stroke-linecap="round" />`,
        );
      }
    }
    chunks.push(`  </g>`);
  }

  const badgeText = escapeActionFxXml(
    `${rawTitle} · ${rawModeLabel} · 선 ${speedlineField.metrics.totalLineCount}개 · 침범 ${speedlineField.metrics.keepOutIntrusionCount}건`,
  );
  chunks.push(
    `  <g data-layer="caption-badge">`,
    `    <rect x="${fmt(x + 12)}" y="${fmt(y + 12)}" width="${fmt(Math.min(width - 24, 420))}" height="28" rx="6" fill="${palette.badgeBg}" stroke="${palette.badgeBorder}" stroke-width="1" />`,
    `    <text x="${fmt(x + 22)}" y="${fmt(y + 30)}" fill="${palette.labelInk}" font-family="sans-serif" font-size="12" font-weight="600">${badgeText}</text>`,
    `  </g>`,
    `</svg>`,
  );

  return chunks.join("\n");
}

/**
 * 번역투 없는 실무 한국어 액션 연출 QA 리포트를 생성한다.
 */
export function summarizeActionImpactFxKo(sceneFx: ActionImpactFxScene): ActionImpactFxReportKo {
  const { speedlineField, slashFx, wgslArtifact } = sceneFx;
  const m = speedlineField.metrics;
  const modeLabelKo = MODE_LABELS_KO[speedlineField.mode];
  const totalPolygonCount =
    speedlineField.polygons.length +
    speedlineField.outerBetaRingPolygons.length +
    (slashFx ? 1 + slashFx.afterimageGhosts.length : 0);

  const keepOutStatusKo =
    m.keepOutIntrusionCount === 0
      ? "인물 안전 타원·말풍선 침범 0건(안전 영역 완전 보존)"
      : `주의: 안전 영역 침범 ${m.keepOutIntrusionCount}건 감지`;

  const organicClumpingGradeKo =
    m.adjacentSpacingVariance > 0 && m.angularEntropyScore >= 0.3
      ? "자연 손펜 군집 리듬 양호"
      : "간격 편차 부족(균일 배열 주의)";

  const reducedMotionSafe = slashFx
    ? slashFx.motionSafety.prefersReducedMotion
    : Boolean(wgslArtifact?.prefersReducedMotion);

  const reducedMotionStatusKo = slashFx
    ? slashFx.motionSafety.prefersReducedMotion
      ? `저모션 안전 모드 적용(점멸 ${slashFx.motionSafety.animatedShimmerRate}Hz, 대비 상한 ${Math.round(slashFx.motionSafety.effectiveFlashContrast * 100)}%, 정적 임팩트 레이아웃)`
      : `일반 동적 임팩트 모드(점멸 ${slashFx.motionSafety.animatedShimmerRate}Hz, 대비 ${Math.round(slashFx.motionSafety.effectiveFlashContrast * 100)}%)`
    : reducedMotionSafe
      ? "저모션 셰이더 상한 적용 완료"
      : "정적 집중선 출력(추가 점멸 없음)";

  const headlineKo = `${modeLabelKo} ${m.totalLineCount}선 생성 완료 — 침범 ${m.keepOutIntrusionCount}건`;

  const slashSentence = slashFx
    ? ` 검기 궤적은 최대 폭 ${slashFx.metrics.peakBellyWidthPx.toFixed(1)}px에서 끝단 ${slashFx.metrics.exitWidthPx.toFixed(1)}px로 가늘어지며, 충격파 ${slashFx.shockwaveRings.length}겹·균열 ${slashFx.fractureCracks.length}갈래·잔상 ${slashFx.afterimageGhosts.length}장을 함께 배치했습니다.`
    : "";

  const summaryParagraphKo =
    `${modeLabelKo} 모드로 총 ${m.totalLineCount}개(주선 ${m.primaryLineCount}·보조선 ${m.secondaryLineCount}·플래시 가시 ${m.flashSpikeCount}) 테이퍼 잉크 폴리곤을 뽑았습니다. ` +
    `${keepOutStatusKo} 상태이며, 유기적 각도 엔트로피 ${m.angularEntropyScore.toFixed(2)}로 손펜 강약 리듬을 살렸습니다.${slashSentence} ` +
    `접근성 기준: ${reducedMotionStatusKo}.`;

  const checklistKo: string[] = [
    `연출 모드: ${modeLabelKo} (시드 ${speedlineField.seed})`,
    `생성 잉크 선 수: ${m.totalLineCount}개 / 총 폴리곤 ${totalPolygonCount}개`,
    `얼굴·말풍선 보호 판정: ${keepOutStatusKo} (말풍선 절삭 ${m.balloonClippedLineCount}선, 인물 외곽 절삭 ${m.subjectCarvedLineCount}선)`,
    `손펜 군집 리듬: ${organicClumpingGradeKo} (엔트로피 ${m.angularEntropyScore.toFixed(2)}, 4사분면 분포 ${m.quadrantCounts.join("/")})`,
    `저모션 안전 상태: ${reducedMotionStatusKo}`,
  ];

  if (wgslArtifact) {
    checklistKo.push(
      `WebGPU 셰이더 준비: 유니폼 ${wgslArtifact.uniformBufferByteLength}B(16바이트 정렬), 엔트리포인트 ${wgslArtifact.entryPoints.join(", ")}`,
    );
  }

  return {
    mode: speedlineField.mode,
    modeLabelKo,
    totalLineCount: m.totalLineCount,
    totalPolygonCount,
    keepOutIntrusionCount: m.keepOutIntrusionCount,
    keepOutStatusKo,
    angularEntropyScore: m.angularEntropyScore,
    organicClumpingGradeKo,
    reducedMotionSafe,
    reducedMotionStatusKo,
    headlineKo,
    summaryParagraphKo,
    checklistKo,
  };
}
