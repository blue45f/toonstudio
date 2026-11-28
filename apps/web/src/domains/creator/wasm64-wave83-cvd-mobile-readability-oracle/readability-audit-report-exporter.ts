/**
 * Wave 83 Calm Atelier 출고 전(Preflight) 가독성·색각이상 오라클 스코어카드 익스포터.
 *
 * - 전체 등급(`A` / `B` / `C`) 및 0..100 정량 점수(NaN 무결성 보장)
 * - 4대 색각이상(`protanopia`, `deuteranopia`, `tritanopia`, `achromatopsia`) 통과/주의 매트릭스
 * - 360px 소형 모바일 야외 직사광선 프리뷰 요약 및 원클릭 Before/After OKLCH 패치 토큰 생성
 */

import { formatOklchCss, rgbToHex, type CvdType, type RgbColor } from "./cvd-machado-brettel-simulator";
import {
  ALL_CVD_SCORECARD_TYPES,
  type CutReadabilityAuditResult,
  type MinimalOklchSolveResult,
  type ReadabilityIssue,
} from "./oklch-minimal-delta-remediation-solver";

export type ReadabilityScorecardGrade = "A" | "B" | "C";

export interface CvdScorecardRow {
  readonly cvdType: CvdType;
  readonly labelKo: string;
  readonly passed: boolean;
  readonly worstDeltaE: number;
  readonly thresholdDeltaE: number;
  readonly failingCount: number;
  readonly statusKo: string;
}

export interface Mobile360ScorecardSummary {
  readonly sourcePanelWidthPx: number;
  readonly targetViewportWidthPx: number;
  readonly downsampleScale: number;
  readonly outdoorGlareVeil: number;
  readonly oledDimFactor: number;
  readonly worstBalloonOutdoorWcagRatio: number | null;
  readonly worstEffectiveFontSizePx: number | null;
  readonly worstEffectiveStrokeWidthPx: number | null;
  readonly summaryKo: string;
}

export interface OklchOneClickPatchToken {
  readonly patchId: string;
  readonly targetId: string;
  readonly targetKind: "speech-balloon" | "sfx-badge" | "character-silhouette";
  readonly targetLabel: string;
  readonly role: "foreground" | "background";
  readonly roleKo: string;
  readonly beforeRgb: RgbColor;
  readonly afterRgb: RgbColor;
  readonly beforeOklchCss: string;
  readonly afterOklchCss: string;
  readonly beforeHex: string;
  readonly afterHex: string;
  readonly deltaEFromOriginal: number;
  readonly hueShiftDeg: number;
  readonly naiveBaselineDeltaE: number;
  readonly driftSavedPercent: number;
  readonly actionLabelKo: string;
  readonly detailKo: string;
}

export interface TypographyStrokeFixHint {
  readonly targetId: string;
  readonly targetLabel: string;
  readonly kind: "font-size" | "stroke-width";
  readonly currentEffectivePx: number;
  readonly requiredEffectivePx: number;
  readonly recommendedSourcePx: number;
  readonly hintKo: string;
}

export interface ReadabilityOracleScorecard {
  readonly cutId: string;
  readonly cutTitle: string;
  readonly overallGrade: ReadabilityScorecardGrade;
  readonly overallScore: number;
  readonly criticalIssueCount: number;
  readonly warningIssueCount: number;
  readonly calmStatusBadgeKo: string;
  readonly headlineKo: string;
  readonly cvdMatrix: readonly CvdScorecardRow[];
  readonly mobile360PreviewSummary: Mobile360ScorecardSummary;
  readonly oneClickPatchTokens: readonly OklchOneClickPatchToken[];
  readonly typographyAndStrokeFixes: readonly TypographyStrokeFixHint[];
  readonly markdownReportKo: string;
}

const safeFinite = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);
const round1 = (v: number): number => Math.round(safeFinite(v) * 10) / 10;
const round2 = (v: number): number => Math.round(safeFinite(v) * 100) / 100;

function getCvdLabelKo(cvdType: CvdType): string {
  if (cvdType === "protanopia" || cvdType === "protanomaly") return "적색맹(제1색각이상)";
  if (cvdType === "deuteranopia" || cvdType === "deuteranomaly") return "녹색맹(제2색각이상)";
  if (cvdType === "tritanopia" || cvdType === "tritanomaly") return "청황색맹(제3색각이상)";
  return "전색맹(명도 대조)";
}

function readCvdDeltaE(r: MinimalOklchSolveResult, cvdType: CvdType): number {
  if (cvdType === "protanopia" || cvdType === "protanomaly") return r.beforeCvd.protanopia;
  if (cvdType === "deuteranopia" || cvdType === "deuteranomaly") return r.beforeCvd.deuteranopia;
  if (cvdType === "tritanopia" || cvdType === "tritanomaly") return r.beforeCvd.tritanopia;
  return r.beforeCvd.achromatopsia;
}

function buildActionLabelKo(
  hueShiftDeg: number, beforeL: number, afterL: number,
  targetKind: "speech-balloon" | "sfx-badge" | "character-silhouette",
): string {
  const darkened = afterL < beforeL;
  if (hueShiftDeg <= 2.5) {
    if (targetKind === "character-silhouette") {
      return darkened ? "색상 유지 · 명도만 살짝 낮춰 실루엣 분리" : "색상 유지 · 명도만 살짝 높여 실루엣 분리";
    }
    return darkened ? "원색 유지 · 글자 명도만 차분히 낮춤" : "원색 유지 · 글자 명도만 또렷하게 높임";
  }
  return darkened
    ? `최소 보정(색상각 ${round1(hueShiftDeg)}°) · 명도 낮춰 대비 확보`
    : `최소 보정(색상각 ${round1(hueShiftDeg)}°) · 명도 높여 대비 확보`;
}

function buildPatchTokensForItem(
  targetId: string,
  targetKind: "speech-balloon" | "sfx-badge" | "character-silhouette",
  targetLabel: string,
  rem: MinimalOklchSolveResult,
): OklchOneClickPatchToken[] {
  if (!rem.needsAdjustment) return [];
  const tokens: OklchOneClickPatchToken[] = [];
  const fgRoleKo =
    targetKind === "character-silhouette" ? "캐릭터 주조색" : targetKind === "sfx-badge" ? "효과음 글자색" : "말풍선 대사색";

  if (rem.deltaEFromOriginal > 0.05) {
    const naiveDe = Math.max(0.1, safeFinite(rem.naiveBaselineDeltaE, 0.1));
    const saved = Math.max(0, Math.min(100, ((naiveDe - rem.deltaEFromOriginal) / naiveDe) * 100));
    tokens.push({
      patchId: `${targetId}:fg`,
      targetId, targetKind, targetLabel, role: "foreground", roleKo: fgRoleKo,
      beforeRgb: rem.originalForeground, afterRgb: rem.adjustedForeground,
      beforeOklchCss: formatOklchCss(rem.originalForegroundOklch),
      afterOklchCss: formatOklchCss(rem.adjustedForegroundOklch),
      beforeHex: rgbToHex(rem.originalForeground), afterHex: rgbToHex(rem.adjustedForeground),
      deltaEFromOriginal: round2(rem.deltaEFromOriginal),
      hueShiftDeg: round1(rem.hueShiftDeg),
      naiveBaselineDeltaE: round2(rem.naiveBaselineDeltaE),
      driftSavedPercent: round1(saved),
      actionLabelKo: buildActionLabelKo(rem.hueShiftDeg, rem.originalForegroundOklch.L, rem.adjustedForegroundOklch.L, targetKind),
      detailKo: `색차 이동 ΔE ${round1(rem.deltaEFromOriginal)}(흑백 치환 대비 ${round1(saved)}% 보존), 야외 명암비 ${round2(rem.beforeOutdoorWcagRatio)}:1 → ${round2(rem.afterOutdoorWcagRatio)}:1, 최저 색각 ΔE ${round1(rem.beforeCvd.worstCoreCvdDeltaE)} → ${round1(rem.afterCvd.worstCoreCvdDeltaE)}.`,
    });
  }

  if (rem.backgroundDeltaEFromOriginal > 0.05) {
    tokens.push({
      patchId: `${targetId}:bg`,
      targetId, targetKind, targetLabel, role: "background", roleKo: "말풍선 바탕색",
      beforeRgb: rem.originalBackground, afterRgb: rem.adjustedBackground,
      beforeOklchCss: formatOklchCss(rem.originalBackgroundOklch),
      afterOklchCss: formatOklchCss(rem.adjustedBackgroundOklch),
      beforeHex: rgbToHex(rem.originalBackground), afterHex: rgbToHex(rem.adjustedBackground),
      deltaEFromOriginal: round2(rem.backgroundDeltaEFromOriginal),
      hueShiftDeg: round1(rem.backgroundHueShiftDeg),
      naiveBaselineDeltaE: round2(rem.naiveBaselineDeltaE),
      driftSavedPercent: 0,
      actionLabelKo: rem.adjustedBackgroundOklch.L > rem.originalBackgroundOklch.L
        ? "말풍선 바탕 명도를 살짝 밝혀 야외 대비 확보"
        : "말풍선 바탕 명도를 살짝 낮춰 야외 대비 확보",
      detailKo: `바탕 색차 이동 ΔE ${round1(rem.backgroundDeltaEFromOriginal)}, 보정 후 야외 명암비 ${round2(rem.afterOutdoorWcagRatio)}:1.`,
    });
  }
  return tokens;
}

function computeOverallScore(issues: readonly ReadabilityIssue[]): {
  readonly score: number;
  readonly grade: ReadabilityScorecardGrade;
  readonly criticalCount: number;
  readonly warningCount: number;
} {
  let criticalCount = 0;
  let warningCount = 0;
  for (let i = 0; i < issues.length; i += 1) {
    if (issues[i].severity === "critical") criticalCount += 1;
    else warningCount += 1;
  }
  const score = Math.max(0, Math.min(100, Math.round(100 - criticalCount * 22 - warningCount * 8)));
  const grade: ReadabilityScorecardGrade =
    criticalCount > 0 || score < 70 ? "C" : warningCount > 0 || score < 90 ? "B" : "A";
  return { score, grade, criticalCount, warningCount };
}

/** 스코어카드 구조체를 간결한 한글 출고 점검 마크다운 리포트로 직렬화한다. */
export function formatReadabilityScorecardMarkdown(
  scorecard: Omit<ReadabilityOracleScorecard, "markdownReportKo">,
): string {
  const lines: string[] = [
    `## 컷 가독성 점검 리포트 — ${scorecard.cutTitle}`,
    "",
    `- 종합 등급: **${scorecard.overallGrade} (${scorecard.overallScore}점)** · ${scorecard.calmStatusBadgeKo}`,
    `- 요약: ${scorecard.headlineKo}`,
    `- 360px 모바일 요약: ${scorecard.mobile360PreviewSummary.summaryKo}`,
    "",
    "### 색각이상(CVD) 분리도 매트릭스",
    "| 유형 | 상태 | 최저 ΔE | 기준 ΔE | 보정 필요 |",
    "| --- | --- | ---: | ---: | ---: |",
  ];
  for (let i = 0; i < scorecard.cvdMatrix.length; i += 1) {
    const r = scorecard.cvdMatrix[i];
    lines.push(`| ${r.labelKo} | ${r.statusKo} | ${r.worstDeltaE.toFixed(1)} | ${r.thresholdDeltaE.toFixed(1)} | ${r.failingCount}건 |`);
  }
  if (scorecard.oneClickPatchTokens.length > 0) {
    lines.push("", "### 원클릭 OKLCH 최소 보정 패치");
    for (let i = 0; i < scorecard.oneClickPatchTokens.length; i += 1) {
      const t = scorecard.oneClickPatchTokens[i];
      lines.push(`- **${t.targetLabel} (${t.roleKo})**: \`${t.beforeOklchCss}\` → \`${t.afterOklchCss}\` (${t.actionLabelKo})`);
    }
  }
  if (scorecard.typographyAndStrokeFixes.length > 0) {
    lines.push("", "### 360px 모바일 글자·선폭 권고");
    for (let i = 0; i < scorecard.typographyAndStrokeFixes.length; i += 1) {
      lines.push(`- ${scorecard.typographyAndStrokeFixes[i].hintKo}`);
    }
  }
  return lines.join("\n");
}

interface NormalizedSurfaceEntry {
  readonly id: string;
  readonly label: string;
  readonly kind: "speech-balloon" | "sfx-badge" | "character-silhouette";
  readonly remediation: MinimalOklchSolveResult;
  readonly effectiveFontSizePx: number | null;
  readonly recommendedSourceFontSizePx: number | null;
  readonly effectiveStrokeWidthPx: number | null;
  readonly recommendedSourceStrokeWidthPx: number | null;
  readonly strokeLabelKo: string;
}

/** 감사 결과를 Calm Atelier 출고 전 비침습 접근성 스코어카드로 변환한다(NaN 무결성 보장). */
export function buildReadabilityOracleScorecard(audit: CutReadabilityAuditResult): ReadabilityOracleScorecard {
  const { score, grade, criticalCount, warningCount } = computeOverallScore(audit.issues);
  const entries: NormalizedSurfaceEntry[] = [
    ...audit.balloons.map((b) => ({
      id: b.id, label: b.label, kind: "speech-balloon" as const, remediation: b.remediation,
      effectiveFontSizePx: b.effectiveFontSizePx, recommendedSourceFontSizePx: b.recommendedSourceFontSizePx,
      effectiveStrokeWidthPx: b.effectiveBorderStrokeWidthPx,
      recommendedSourceStrokeWidthPx: b.recommendedSourceBorderStrokeWidthPx, strokeLabelKo: "말풍선 테두리",
    })),
    ...audit.sfxBadges.map((s) => ({
      id: s.id, label: s.label, kind: "sfx-badge" as const, remediation: s.remediation,
      effectiveFontSizePx: s.effectiveFontSizePx, recommendedSourceFontSizePx: s.recommendedSourceFontSizePx,
      effectiveStrokeWidthPx: s.effectiveStrokeWidthPx,
      recommendedSourceStrokeWidthPx: s.recommendedSourceStrokeWidthPx, strokeLabelKo: "효과음 외곽선",
    })),
    ...audit.silhouettes.map((p) => ({
      id: p.id, label: p.label, kind: "character-silhouette" as const, remediation: p.remediation,
      effectiveFontSizePx: null, recommendedSourceFontSizePx: null,
      effectiveStrokeWidthPx: p.effectiveLineartWidthPx,
      recommendedSourceStrokeWidthPx: p.recommendedSourceLineartWidthPx, strokeLabelKo: "캐릭터 선화",
    })),
  ];

  const cvdMatrix: CvdScorecardRow[] = ALL_CVD_SCORECARD_TYPES.map((cvdType) => {
    let worst = entries.length === 0 ? 100 : Number.POSITIVE_INFINITY;
    let failingCount = 0;
    const th = audit.thresholds.cvdMinDeltaE;
    for (let i = 0; i < entries.length; i += 1) {
      const de = safeFinite(readCvdDeltaE(entries[i].remediation, cvdType), 0);
      if (de < worst) worst = de;
      if (de < th) failingCount += 1;
    }
    const passed = failingCount === 0;
    return {
      cvdType, labelKo: getCvdLabelKo(cvdType), passed,
      worstDeltaE: Number.isFinite(worst) ? round1(worst) : 100,
      thresholdDeltaE: round1(th), failingCount,
      statusKo: passed ? "통과" : `주의 (${failingCount}건)`,
    };
  });

  let worstBalloonOutdoor: number | null = null;
  let worstFont: number | null = null;
  let worstStroke: number | null = null;
  const oneClickPatchTokens: OklchOneClickPatchToken[] = [];
  const typographyAndStrokeFixes: TypographyStrokeFixHint[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (e.kind === "speech-balloon") {
      const outdoor = round2(safeFinite(e.remediation.beforeOutdoorWcagRatio, 1));
      if (worstBalloonOutdoor === null || outdoor < worstBalloonOutdoor) worstBalloonOutdoor = outdoor;
    }
    if (e.effectiveFontSizePx !== null && (worstFont === null || e.effectiveFontSizePx < worstFont)) {
      worstFont = round1(e.effectiveFontSizePx);
    }
    if (e.effectiveStrokeWidthPx !== null && (worstStroke === null || e.effectiveStrokeWidthPx < worstStroke)) {
      worstStroke = round2(e.effectiveStrokeWidthPx);
    }

    oneClickPatchTokens.push(...buildPatchTokensForItem(e.id, e.kind, e.label, e.remediation));

    if (e.effectiveFontSizePx !== null && e.recommendedSourceFontSizePx !== null) {
      const surfaceKo = e.kind === "speech-balloon" ? "말풍선" : "효과음";
      typographyAndStrokeFixes.push({
        targetId: e.id, targetLabel: e.label, kind: "font-size",
        currentEffectivePx: round1(e.effectiveFontSizePx),
        requiredEffectivePx: round1(audit.thresholds.minEffectiveFontSizePx),
        recommendedSourcePx: e.recommendedSourceFontSizePx,
        hintKo: `${surfaceKo} '${e.label}' 글자를 원고 ${e.recommendedSourceFontSizePx}px 이상으로 키우면 360px 화면에서 ${round1(audit.thresholds.minEffectiveFontSizePx)}px 이상으로 읽힙니다.`,
      });
    }
    if (e.effectiveStrokeWidthPx !== null && e.recommendedSourceStrokeWidthPx !== null) {
      typographyAndStrokeFixes.push({
        targetId: e.id, targetLabel: e.label, kind: "stroke-width",
        currentEffectivePx: round2(e.effectiveStrokeWidthPx),
        requiredEffectivePx: round2(audit.thresholds.minEffectiveStrokeWidthPx),
        recommendedSourcePx: e.recommendedSourceStrokeWidthPx,
        hintKo: `'${e.label}' ${e.strokeLabelKo}를 원고 ${e.recommendedSourceStrokeWidthPx}px 이상으로 보강해 360px 축소 시 흐림을 막아 주세요.`,
      });
    }
  }

  const summaryParts: string[] = [
    `원고 ${audit.sourcePanelWidthPx}px → ${audit.mobileViewportWidthPx}px 축소(${Math.round(audit.downsampleScale * 100)}%), 야외 반사광 ${Math.round(safeFinite(audit.outdoorGlareVeil) * 100)}% 기준`,
  ];
  if (worstBalloonOutdoor !== null) summaryParts.push(`말풍선 최저 야외 명암비 ${worstBalloonOutdoor.toFixed(2)}:1`);
  if (worstFont !== null) summaryParts.push(`최소 글자 크기 ${worstFont.toFixed(1)}px`);
  if (worstStroke !== null) summaryParts.push(`최소 선폭 ${worstStroke.toFixed(2)}px`);

  const mobile360PreviewSummary: Mobile360ScorecardSummary = {
    sourcePanelWidthPx: audit.sourcePanelWidthPx,
    targetViewportWidthPx: audit.mobileViewportWidthPx,
    downsampleScale: round2(audit.downsampleScale),
    outdoorGlareVeil: round2(audit.outdoorGlareVeil),
    oledDimFactor: round2(audit.oledDimFactor),
    worstBalloonOutdoorWcagRatio: worstBalloonOutdoor,
    worstEffectiveFontSizePx: worstFont,
    worstEffectiveStrokeWidthPx: worstStroke,
    summaryKo: summaryParts.join(" · "),
  };

  const calmStatusBadgeKo =
    grade === "A" ? "출고 준비 완료" : grade === "B" ? "미세 보정 권장" : "출고 전 가독성 보정 필요";
  const headlineKo =
    grade === "A"
      ? "색각이상 시야와 360px 모바일 야외 환경 기준을 모두 통과했습니다."
      : grade === "B"
        ? `가독성 주의 항목 ${warningCount}건이 있습니다. 원클릭 미세 보정으로 완성도를 높일 수 있습니다.`
        : `즉시 확인이 필요한 항목 ${criticalCount}건(주의 ${warningCount}건)이 발견되었습니다. 원클릭 OKLCH 패치 ${oneClickPatchTokens.length}건이 준비되었습니다.`;

  const base: Omit<ReadabilityOracleScorecard, "markdownReportKo"> = {
    cutId: audit.cutId, cutTitle: audit.cutTitle, overallGrade: grade, overallScore: score,
    criticalIssueCount: criticalCount, warningIssueCount: warningCount,
    calmStatusBadgeKo, headlineKo, cvdMatrix, mobile360PreviewSummary,
    oneClickPatchTokens, typographyAndStrokeFixes,
  };
  return { ...base, markdownReportKo: formatReadabilityScorecardMarkdown(base) };
}
