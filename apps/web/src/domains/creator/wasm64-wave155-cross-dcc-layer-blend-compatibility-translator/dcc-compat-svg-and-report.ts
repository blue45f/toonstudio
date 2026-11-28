/**
 * Wave 155 — 순수 OKLCH 크로스-DCC 호환성 매트릭스·손실 리스크 SVG 렌더러 및
 * 자연스러운 한국어 파이프라인 TD 검수 브리프 생성기.
 *
 * - SVG 전체에 원시 hex/rgb/hsl 색상 문자열을 일절 사용하지 않고 순수 `oklch(...)`만 사용한다.
 * - 모든 동적 텍스트에 XML/XSS 특수문자(`&`, `<`, `>`, `"`, `'`) 이스케이프와 좌표 유한수 가드를 적용한다.
 */

import {
  BLEND_MODE_LABEL_KO,
  clampFiniteRange,
  DCC_CAPABILITY_MATRIX,
  DCC_FORMAT_IDS,
  isBlendModeSupportedInDcc,
  LAYER_KIND_LABEL_KO,
  type DccCapabilityProfile,
  type DccFormatId,
} from "./dcc-blend-math-and-matrix";
import {
  ALL_DCC_LOSS_RISK_CODES,
  type DccAuditGrade,
  type DccLayerRiskItem,
  type DccLayerTranslationAuditResult,
  type DccLossRiskCode,
  type TranslatedLayerAuditItem,
} from "./cross-dcc-layer-translator";

export interface DccCompatibilitySvgOptions {
  readonly titleKo?: string;
  readonly subtitleKo?: string;
  readonly artistNoteKo?: string;
  readonly maxVisibleLayers?: number;
}

export interface DccTranslationAuditReportKo {
  readonly grade: DccAuditGrade;
  readonly isStrictLossless: boolean;
  readonly compatibilityScore: number;
  readonly routeLabelKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly actionItemsKo: readonly string[];
  readonly riskBreakdownLinesKo: readonly string[];
  readonly manifestSha256Hex: string;
}

const OKLCH_PALETTE = {
  pageBg: "oklch(0.978 0.008 88)",
  panelBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.955 0.011 86)",
  rowAltBg: "oklch(0.972 0.006 88)",
  highlightColBg: "oklch(0.946 0.026 154)",
  sourceColBg: "oklch(0.952 0.022 242)",
  borderSoft: "oklch(0.320 0.032 156 / 0.18)",
  borderStrong: "oklch(0.280 0.045 156 / 0.40)",
  inkPrimary: "oklch(0.215 0.036 156)",
  inkSecondary: "oklch(0.415 0.024 156)",
  inkMuted: "oklch(0.525 0.018 156)",
  accentForest: "oklch(0.345 0.078 156)",
  barTrack: "oklch(0.918 0.010 88)",
  passFill: "oklch(0.935 0.044 152)",
  passStroke: "oklch(0.420 0.112 152)",
  passText: "oklch(0.255 0.075 152)",
  warnFill: "oklch(0.945 0.062 78)",
  warnStroke: "oklch(0.545 0.142 68)",
  warnText: "oklch(0.325 0.092 62)",
  failFill: "oklch(0.932 0.056 24)",
  failStroke: "oklch(0.515 0.182 26)",
  failText: "oklch(0.310 0.122 26)",
  infoFill: "oklch(0.940 0.035 245)",
  infoStroke: "oklch(0.460 0.105 245)",
  infoText: "oklch(0.280 0.078 245)",
  neutralPillFill: "oklch(0.940 0.006 88)",
  neutralPillText: "oklch(0.380 0.014 156)",
} as const;

const FONT_SANS = "Pretendard, Apple SD Gothic Neo, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, monospace";

const RISK_BADGE_SHORT_KO: Readonly<Record<DccLossRiskCode, string>> = {
  "blend-mode-approximated": "블렌드 근사",
  "vector-rasterization-loss": "벡터 래스터화",
  "screentone-rasterization-loss": "망점 래스터화",
  "text-outline-loss": "식자 편집 손실",
  "bitdepth-banding-risk": "색심도 밴딩",
  "pass-through-group-flatten-risk": "통과 폴더 격리",
  "adjustment-layer-flatten-risk": "보정 병합",
  "3d-reference-rasterization-loss": "3D 래스터화",
};

/** XML/SVG 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeDccAuditXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtCoord(value: number): string {
  return clampFiniteRange(value, -10000, 10000, 0).toFixed(2);
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function gradeColors(grade: DccAuditGrade): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly labelKo: string;
} {
  if (grade === "PASS") {
    return {
      fill: OKLCH_PALETTE.passFill,
      stroke: OKLCH_PALETTE.passStroke,
      text: OKLCH_PALETTE.passText,
      labelKo: "안전 통과",
    };
  }
  if (grade === "WARN") {
    return {
      fill: OKLCH_PALETTE.warnFill,
      stroke: OKLCH_PALETTE.warnStroke,
      text: OKLCH_PALETTE.warnText,
      labelKo: "주의 검수",
    };
  }
  return {
    fill: OKLCH_PALETTE.failFill,
    stroke: OKLCH_PALETTE.failStroke,
    text: OKLCH_PALETTE.failText,
    labelKo: "손실 차단",
  };
}

function deltaEBarColor(deltaE: number): string {
  if (deltaE <= 0.0001) return OKLCH_PALETTE.passStroke;
  if (deltaE < 0.06) return OKLCH_PALETTE.warnStroke;
  return OKLCH_PALETTE.failStroke;
}

function riskBadgeColors(risk: DccLayerRiskItem): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
} {
  if (risk.severity === "blocker") {
    return {
      fill: OKLCH_PALETTE.failFill,
      stroke: OKLCH_PALETTE.failStroke,
      text: OKLCH_PALETTE.failText,
    };
  }
  if (risk.severity === "warning") {
    return {
      fill: OKLCH_PALETTE.warnFill,
      stroke: OKLCH_PALETTE.warnStroke,
      text: OKLCH_PALETTE.warnText,
    };
  }
  return {
    fill: OKLCH_PALETTE.infoFill,
    stroke: OKLCH_PALETTE.infoStroke,
    text: OKLCH_PALETTE.infoText,
  };
}

interface MatrixCapabilityRow {
  readonly labelKo: string;
  readonly check: (profile: DccCapabilityProfile) => boolean;
}

const CAPABILITY_MATRIX_ROWS: readonly MatrixCapabilityRow[] = [
  {
    labelKo: "더하기(발광) Add Glow",
    check: (p) => isBlendModeSupportedInDcc(p.dccId, "add-glow"),
  },
  {
    labelKo: "발광 닷지 Glow Dodge",
    check: (p) => isBlendModeSupportedInDcc(p.dccId, "glow-dodge"),
  },
  {
    labelKo: "통과 폴더 Pass-Through",
    check: (p) => p.supportsPassThroughGroup,
  },
  {
    labelKo: "가변 필압 벡터 먹선",
    check: (p) => p.preservesEditableVectorInk,
  },
  {
    labelKo: "라이브 망점 톤(LPI)",
    check: (p) => p.preservesLiveScreentone,
  },
  {
    labelKo: "편집 가능 식자 레이어",
    check: (p) => p.preservesEditableText,
  },
  {
    labelKo: "16/32-bit 고색심도",
    check: (p) => p.maxBitDepth >= 16,
  },
];

function renderLayerRowSvg(
  layer: TranslatedLayerAuditItem,
  rowIndex: number,
  y: number,
  rowHeight: number,
  contentWidth: number,
): string {
  const parts: string[] = [];
  const rowBg = rowIndex % 2 === 1 ? OKLCH_PALETTE.rowAltBg : OKLCH_PALETTE.panelBg;
  parts.push(
    `<rect x="36" y="${fmtCoord(y)}" width="${fmtCoord(contentWidth)}" height="${fmtCoord(rowHeight)}" fill="${rowBg}" />`,
  );

  const indentPx = Math.min(3, layer.depth) * 14;
  const depthPrefix = layer.depth > 0 ? "└ " : "";
  const safeName = escapeDccAuditXml(truncateText(`${depthPrefix}${layer.nameKo}`, 22));
  const kindLabel = escapeDccAuditXml(LAYER_KIND_LABEL_KO[layer.layerKind]);
  const bitLabel =
    layer.sourceBitDepth !== layer.targetBitDepth
      ? `${layer.sourceBitDepth}→${layer.targetBitDepth}b`
      : `${layer.sourceBitDepth}b`;

  parts.push(
    `<text x="${fmtCoord(48 + indentPx)}" y="${fmtCoord(y + 18)}" font-family="${FONT_SANS}" font-size="12" font-weight="600" fill="${OKLCH_PALETTE.inkPrimary}">${safeName}</text>`,
  );
  parts.push(
    `<text x="${fmtCoord(48 + indentPx)}" y="${fmtCoord(y + 33)}" font-family="${FONT_SANS}" font-size="10" fill="${OKLCH_PALETTE.inkMuted}">${kindLabel} · ${escapeDccAuditXml(bitLabel)}</text>`,
  );

  // 소스 → 타깃 블렌드모드 매핑 표시
  const srcBlendText = escapeDccAuditXml(layer.sourceBlendMode);
  const tgtBlendText = escapeDccAuditXml(layer.targetBlendMode);
  const blendLine =
    layer.blendMappingStatus === "exact-match"
      ? `${srcBlendText} (직매핑)`
      : `${srcBlendText} → ${tgtBlendText}`;
  const opacityLine =
    layer.recommendedOpacity !== layer.sourceOpacity
      ? `불투명도 ${Math.round(layer.sourceOpacity * 100)}% → ${Math.round(layer.recommendedOpacity * 100)}%`
      : `불투명도 ${Math.round(layer.sourceOpacity * 100)}%`;

  parts.push(
    `<text x="278" y="${fmtCoord(y + 18)}" font-family="${FONT_MONO}" font-size="11" font-weight="600" fill="${
      layer.blendMappingStatus === "exact-match"
        ? OKLCH_PALETTE.passText
        : OKLCH_PALETTE.warnText
    }">${blendLine}</text>`,
  );
  parts.push(
    `<text x="278" y="${fmtCoord(y + 33)}" font-family="${FONT_SANS}" font-size="10" fill="${OKLCH_PALETTE.inkSecondary}">${escapeDccAuditXml(opacityLine)}</text>`,
  );

  // OKLab ΔE 색차 막대 (0..0.25 스케일)
  const barX = 528;
  const barWidth = 112;
  const barY = y + 14;
  const ratio = clampFiniteRange(layer.oklabMeanDeltaE / 0.25, 0, 1, 0);
  const fillWidth = layer.oklabMeanDeltaE > 0 ? Math.max(4, ratio * barWidth) : 0;

  parts.push(
    `<rect x="${fmtCoord(barX)}" y="${fmtCoord(barY)}" width="${fmtCoord(barWidth)}" height="10" rx="5" fill="${OKLCH_PALETTE.barTrack}" />`,
  );
  if (fillWidth > 0) {
    parts.push(
      `<rect x="${fmtCoord(barX)}" y="${fmtCoord(barY)}" width="${fmtCoord(fillWidth)}" height="10" rx="5" fill="${deltaEBarColor(layer.oklabMeanDeltaE)}" />`,
    );
  }
  parts.push(
    `<text x="${fmtCoord(barX + barWidth + 8)}" y="${fmtCoord(y + 23)}" font-family="${FONT_MONO}" font-size="11" fill="${OKLCH_PALETTE.inkPrimary}">ΔE ${layer.oklabMeanDeltaE.toFixed(4)}</text>`,
  );

  // 손실 리스크 배지 (최대 2개 노출, 초과 시 +N 표기)
  let badgeX = 724;
  if (layer.risks.length === 0) {
    parts.push(
      `<rect x="${fmtCoord(badgeX)}" y="${fmtCoord(y + 10)}" width="74" height="22" rx="11" fill="${OKLCH_PALETTE.passFill}" stroke="${OKLCH_PALETTE.passStroke}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmtCoord(badgeX + 37)}" y="${fmtCoord(y + 25)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.passText}">무손실</text>`,
    );
  } else {
    const visibleRisks = layer.risks.slice(0, 2);
    for (let r = 0; r < visibleRisks.length; r += 1) {
      const risk = visibleRisks[r];
      const colors = riskBadgeColors(risk);
      const badgeLabel = RISK_BADGE_SHORT_KO[risk.code];
      const pillWidth = 88;
      parts.push(
        `<rect x="${fmtCoord(badgeX)}" y="${fmtCoord(y + 10)}" width="${fmtCoord(pillWidth)}" height="22" rx="11" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1" />`,
      );
      parts.push(
        `<text x="${fmtCoord(badgeX + pillWidth / 2)}" y="${fmtCoord(y + 25)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="10" font-weight="600" fill="${colors.text}">${escapeDccAuditXml(badgeLabel)}</text>`,
      );
      badgeX += pillWidth + 6;
    }
    if (layer.risks.length > 2) {
      const extraText = `+${layer.risks.length - 2}`;
      parts.push(
        `<rect x="${fmtCoord(badgeX)}" y="${fmtCoord(y + 10)}" width="34" height="22" rx="11" fill="${OKLCH_PALETTE.neutralPillFill}" />`,
      );
      parts.push(
        `<text x="${fmtCoord(badgeX + 17)}" y="${fmtCoord(y + 25)}" text-anchor="middle" font-family="${FONT_MONO}" font-size="10" font-weight="600" fill="${OKLCH_PALETTE.neutralPillText}">${extraText}</text>`,
      );
    }
  }

  parts.push(
    `<line x1="36" y1="${fmtCoord(y + rowHeight)}" x2="${fmtCoord(36 + contentWidth)}" y2="${fmtCoord(y + rowHeight)}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );

  return parts.join("\n");
}

function renderDccMatrixSectionSvg(
  audit: DccLayerTranslationAuditResult,
  startY: number,
  contentWidth: number,
): { readonly svg: string; readonly sectionHeight: number } {
  const headerHeight = 32;
  const rowHeight = 28;
  const sectionHeight = 38 + headerHeight + CAPABILITY_MATRIX_ROWS.length * rowHeight + 12;
  const parts: string[] = [];

  parts.push(
    `<rect x="24" y="${fmtCoord(startY)}" width="${fmtCoord(contentWidth + 24)}" height="${fmtCoord(sectionHeight)}" rx="14" fill="${OKLCH_PALETTE.panelBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="40" y="${fmtCoord(startY + 25)}" font-family="${FONT_SANS}" font-size="13.5" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">5종 DCC 포맷 네이티브 기능 지원 비교표</text>`,
  );

  const tableTop = startY + 38;
  const labelColWidth = 248;
  const dccColWidth = (contentWidth - labelColWidth) / DCC_FORMAT_IDS.length;

  // 소스·타깃 컬럼 강조 배경
  for (let c = 0; c < DCC_FORMAT_IDS.length; c += 1) {
    const dccId: DccFormatId = DCC_FORMAT_IDS[c];
    const colX = 36 + labelColWidth + c * dccColWidth;
    if (dccId === audit.targetDcc) {
      parts.push(
        `<rect x="${fmtCoord(colX)}" y="${fmtCoord(tableTop)}" width="${fmtCoord(dccColWidth)}" height="${fmtCoord(headerHeight + CAPABILITY_MATRIX_ROWS.length * rowHeight)}" fill="${OKLCH_PALETTE.highlightColBg}" />`,
      );
    } else if (dccId === audit.sourceDcc) {
      parts.push(
        `<rect x="${fmtCoord(colX)}" y="${fmtCoord(tableTop)}" width="${fmtCoord(dccColWidth)}" height="${fmtCoord(headerHeight + CAPABILITY_MATRIX_ROWS.length * rowHeight)}" fill="${OKLCH_PALETTE.sourceColBg}" />`,
      );
    }
  }

  parts.push(
    `<rect x="36" y="${fmtCoord(tableTop)}" width="${fmtCoord(contentWidth)}" height="${fmtCoord(headerHeight)}" fill="${OKLCH_PALETTE.headerBg}" fill-opacity="0.72" />`,
  );
  parts.push(
    `<text x="48" y="${fmtCoord(tableTop + 21)}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.inkSecondary}">핵심 원고 호환 항목</text>`,
  );

  for (let c = 0; c < DCC_FORMAT_IDS.length; c += 1) {
    const dccId = DCC_FORMAT_IDS[c];
    const profile = DCC_CAPABILITY_MATRIX[dccId];
    const centerX = 36 + labelColWidth + c * dccColWidth + dccColWidth / 2;
    const roleSuffix =
      dccId === audit.sourceDcc && dccId === audit.targetDcc
        ? " (원본=대상)"
        : dccId === audit.sourceDcc
          ? " (원본)"
          : dccId === audit.targetDcc
            ? " (대상)"
            : "";
    parts.push(
      `<text x="${fmtCoord(centerX)}" y="${fmtCoord(tableTop + 21)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeDccAuditXml(`${profile.shortLabel}${roleSuffix}`)}</text>`,
    );
  }

  for (let r = 0; r < CAPABILITY_MATRIX_ROWS.length; r += 1) {
    const row = CAPABILITY_MATRIX_ROWS[r];
    const rowY = tableTop + headerHeight + r * rowHeight;
    parts.push(
      `<line x1="36" y1="${fmtCoord(rowY)}" x2="${fmtCoord(36 + contentWidth)}" y2="${fmtCoord(rowY)}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="48" y="${fmtCoord(rowY + 18)}" font-family="${FONT_SANS}" font-size="11" fill="${OKLCH_PALETTE.inkPrimary}">${escapeDccAuditXml(row.labelKo)}</text>`,
    );

    for (let c = 0; c < DCC_FORMAT_IDS.length; c += 1) {
      const profile = DCC_CAPABILITY_MATRIX[DCC_FORMAT_IDS[c]];
      const supported = row.check(profile);
      const centerX = 36 + labelColWidth + c * dccColWidth + dccColWidth / 2;
      const badgeFill = supported ? OKLCH_PALETTE.passFill : OKLCH_PALETTE.failFill;
      const badgeStroke = supported ? OKLCH_PALETTE.passStroke : OKLCH_PALETTE.failStroke;
      const badgeText = supported ? OKLCH_PALETTE.passText : OKLCH_PALETTE.failText;
      const label = supported ? "지원" : "미지원";

      parts.push(
        `<rect x="${fmtCoord(centerX - 28)}" y="${fmtCoord(rowY + 5)}" width="56" height="18" rx="9" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="0.9" />`,
      );
      parts.push(
        `<text x="${fmtCoord(centerX)}" y="${fmtCoord(rowY + 17.5)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="10" font-weight="600" fill="${badgeText}">${label}</text>`,
      );
    }
  }

  return { svg: parts.join("\n"), sectionHeight };
}

/**
 * 크로스-DCC 레이어 호환성 감사 결과를 순수 `oklch(...)` SVG 다이어그램으로 렌더링한다.
 */
export function renderDccCompatibilityAuditSvg(
  audit: DccLayerTranslationAuditResult,
  options: DccCompatibilitySvgOptions = {},
): string {
  const width = 1024;
  const contentWidth = 952;
  const maxVisibleLayers = Math.max(1, Math.min(20, Math.floor(options.maxVisibleLayers ?? 10)));
  const visibleLayers = audit.flattenedLayers.slice(0, maxVisibleLayers);
  const overflowCount = Math.max(0, audit.flattenedLayers.length - visibleLayers.length);

  const headerHeight = 112;
  const rowHeight = 44;
  const layerHeaderHeight = 30;
  const layerSectionBodyHeight =
    Math.max(1, visibleLayers.length) * rowHeight + (overflowCount > 0 ? 28 : 0);
  const layerSectionHeight = 42 + layerHeaderHeight + layerSectionBodyHeight + 10;

  const layerSectionY = 20 + headerHeight + 16;
  const matrixSectionY = layerSectionY + layerSectionHeight + 16;
  const matrixRendered = renderDccMatrixSectionSvg(audit, matrixSectionY, contentWidth);
  const footerY = matrixSectionY + matrixRendered.sectionHeight + 14;
  const footerHeight = options.artistNoteKo ? 66 : 46;
  const totalHeight = footerY + footerHeight + 18;

  const gradeStyle = gradeColors(audit.auditGrade);
  const titleText = escapeDccAuditXml(
    options.titleKo ?? `크로스-DCC 레이어 호환성 사전 감사 — ${audit.documentTitleKo}`,
  );
  const routeText = escapeDccAuditXml(
    options.subtitleKo ??
      `${audit.sourceProfile.displayNameKo} → ${audit.targetProfile.displayNameKo} · 문서 ID: ${audit.documentId}`,
  );

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${fmtCoord(totalHeight)}" width="${width}" height="${fmtCoord(totalHeight)}" role="img" aria-label="${titleText}">`,
  );
  lines.push(`<title>${titleText}</title>`);
  lines.push(
    `<rect x="0" y="0" width="${width}" height="${fmtCoord(totalHeight)}" fill="${OKLCH_PALETTE.pageBg}" />`,
  );

  // 상단 헤더 카드
  lines.push(
    `<rect x="24" y="20" width="${fmtCoord(contentWidth + 24)}" height="${headerHeight}" rx="16" fill="${OKLCH_PALETTE.panelBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.2" />`,
  );
  lines.push(
    `<text x="44" y="52" font-family="${FONT_SANS}" font-size="18" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${titleText}</text>`,
  );
  lines.push(
    `<text x="44" y="75" font-family="${FONT_SANS}" font-size="12" fill="${OKLCH_PALETTE.inkSecondary}">${routeText}</text>`,
  );

  const kpiSummary = `총 ${audit.totalLayerCount}레이어 · 무손실 ${audit.exactMatchLayerCount} · 블렌드 근사 ${audit.approximatedBlendLayerCount} · 래스터화 위험 ${audit.rasterizationRiskLayerCount} · 최대 OKLab ΔE ${audit.maxDocumentOklabDeltaE.toFixed(4)}`;
  lines.push(
    `<text x="44" y="103" font-family="${FONT_MONO}" font-size="11" fill="${OKLCH_PALETTE.accentForest}">${escapeDccAuditXml(kpiSummary)}</text>`,
  );

  // 우측 호환성 점수 & 등급 배지
  lines.push(
    `<rect x="816" y="34" width="166" height="82" rx="12" fill="${gradeStyle.fill}" stroke="${gradeStyle.stroke}" stroke-width="1.2" />`,
  );
  lines.push(
    `<text x="899" y="64" text-anchor="middle" font-family="${FONT_MONO}" font-size="24" font-weight="700" fill="${gradeStyle.text}">${audit.compatibilityScore}점</text>`,
  );
  lines.push(
    `<text x="899" y="84" text-anchor="middle" font-family="${FONT_SANS}" font-size="11.5" font-weight="700" fill="${gradeStyle.text}">${escapeDccAuditXml(`${audit.auditGrade} · ${gradeStyle.labelKo}`)}</text>`,
  );
  lines.push(
    `<text x="899" y="102" text-anchor="middle" font-family="${FONT_SANS}" font-size="10" fill="${gradeStyle.text}">${audit.isStrictLossless ? "100% 무손실 전환" : `차단 ${audit.blockers.length} · 경고 ${audit.warnings.length}`}</text>`,
  );

  // 중단 섹션 1: 레이어 변환 맵 & OKLab ΔE 바
  lines.push(
    `<rect x="24" y="${fmtCoord(layerSectionY)}" width="${fmtCoord(contentWidth + 24)}" height="${fmtCoord(layerSectionHeight)}" rx="14" fill="${OKLCH_PALETTE.panelBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `<text x="40" y="${fmtCoord(layerSectionY + 26)}" font-family="${FONT_SANS}" font-size="13.5" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">레이어별 변환 맵 · OKLab ΔE 색차 및 손실 경보</text>`,
  );

  const tableHeaderY = layerSectionY + 42;
  lines.push(
    `<rect x="36" y="${fmtCoord(tableHeaderY)}" width="${fmtCoord(contentWidth)}" height="${layerHeaderHeight}" fill="${OKLCH_PALETTE.headerBg}" />`,
  );
  lines.push(
    `<text x="48" y="${fmtCoord(tableHeaderY + 19)}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.inkSecondary}">레이어 · 유형</text>`,
  );
  lines.push(
    `<text x="278" y="${fmtCoord(tableHeaderY + 19)}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.inkSecondary}">블렌드모드 변환 · 추천 불투명도</text>`,
  );
  lines.push(
    `<text x="528" y="${fmtCoord(tableHeaderY + 19)}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.inkSecondary}">OKLab 색차 (ΔE)</text>`,
  );
  lines.push(
    `<text x="724" y="${fmtCoord(tableHeaderY + 19)}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.inkSecondary}">손실 위험 경보</text>`,
  );

  const rowsStartY = tableHeaderY + layerHeaderHeight;
  if (visibleLayers.length === 0) {
    lines.push(
      `<text x="512" y="${fmtCoord(rowsStartY + 26)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="12" fill="${OKLCH_PALETTE.inkMuted}">검사할 레이어가 없습니다.</text>`,
    );
  } else {
    for (let i = 0; i < visibleLayers.length; i += 1) {
      lines.push(
        renderLayerRowSvg(
          visibleLayers[i],
          i,
          rowsStartY + i * rowHeight,
          rowHeight,
          contentWidth,
        ),
      );
    }
  }

  if (overflowCount > 0) {
    const overflowY = rowsStartY + visibleLayers.length * rowHeight + 18;
    lines.push(
      `<text x="48" y="${fmtCoord(overflowY)}" font-family="${FONT_SANS}" font-size="11" fill="${OKLCH_PALETTE.inkMuted}">${escapeDccAuditXml(`외 ${overflowCount}개 레이어는 전체 감사 매니페스트에 포함되어 있습니다.`)}</text>`,
    );
  }

  // 중단 섹션 2: 5종 DCC 비교표
  lines.push(matrixRendered.svg);

  // 하단 매니페스트 지문 & TD 메모
  lines.push(
    `<rect x="24" y="${fmtCoord(footerY)}" width="${fmtCoord(contentWidth + 24)}" height="${footerHeight}" rx="12" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `<text x="40" y="${fmtCoord(footerY + 27)}" font-family="${FONT_MONO}" font-size="10.5" fill="${OKLCH_PALETTE.inkSecondary}">SHA-256 매니페스트: ${escapeDccAuditXml(audit.translationManifestSha256Hex)}</text>`,
  );
  if (options.artistNoteKo) {
    lines.push(
      `<text x="40" y="${fmtCoord(footerY + 49)}" font-family="${FONT_SANS}" font-size="11" fill="${OKLCH_PALETTE.inkPrimary}">TD 검수 메모: ${escapeDccAuditXml(truncateText(options.artistNoteKo, 96))}</text>`,
    );
  }

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 웹툰 파이프라인 TD 검수 브리프를 생성한다.
 */
export function summarizeDccTranslationAuditKo(
  audit: DccLayerTranslationAuditResult,
): DccTranslationAuditReportKo {
  const routeLabelKo = `${audit.sourceProfile.displayNameKo} → ${audit.targetProfile.displayNameKo}`;

  if (audit.isStrictLossless) {
    return {
      grade: audit.auditGrade,
      isStrictLossless: true,
      compatibilityScore: audit.compatibilityScore,
      routeLabelKo,
      headlineKo: `무손실 전환 확인: ${routeLabelKo} 구간에서 모든 레이어(${audit.totalLayerCount}개)가 원형 그대로 유지됩니다 (호환성 ${audit.compatibilityScore}점).`,
      summaryParagraphKo: `문서 「${audit.documentTitleKo}」의 레이어 ${audit.totalLayerCount}개를 사전 감사한 결과 블렌드모드 근사, 강제 래스터화, 색심도 축소, 통과 폴더 격리 위험이 한 건도 발견되지 않았습니다. 최대 OKLab 색차는 0.0000이며 추가 보정 없이 바로 전달할 수 있습니다.`,
      actionItemsKo: [
        "별도 사전 래스터화나 불투명도 보정 없이 바로 원고를 넘기면 됩니다.",
      ],
      riskBreakdownLinesKo: [
        `직매핑 무손실 레이어: ${audit.exactMatchLayerCount}/${audit.totalLayerCount}개`,
        `최대 OKLab ΔE: ${audit.maxDocumentOklabDeltaE.toFixed(4)}`,
      ],
      manifestSha256Hex: audit.translationManifestSha256Hex,
    };
  }

  const headlinePrefix =
    audit.auditGrade === "FAIL" ? "출고 전 수정 권장" : "부분 손실 주의";
  const headlineKo = `${headlinePrefix}: ${audit.sourceProfile.shortLabel} → ${audit.targetProfile.shortLabel} 변환에서 차단 ${audit.blockers.length}건·경고 ${audit.warnings.length}건 감지 (호환성 ${audit.compatibilityScore}점)`;

  const summaryParagraphKo = `문서 「${audit.documentTitleKo}」의 전체 ${audit.totalLayerCount}개 레이어 가운데 ${audit.exactMatchLayerCount}개는 무손실로 유지되지만, 블렌드모드 근사 ${audit.approximatedBlendLayerCount}건·래스터화 강제 ${audit.rasterizationRiskLayerCount}건·색심도 밴딩 위험 ${audit.bitDepthBandingLayerCount}건·통과 폴더 격리 ${audit.passThroughFlattenLayerCount}건이 확인되었습니다. 실측 평균 OKLab 색차는 ${audit.meanDocumentOklabDeltaE.toFixed(4)}, 최대 색차는 ${audit.maxDocumentOklabDeltaE.toFixed(4)}입니다.`;

  const actionItemsKo: string[] = [];
  for (let i = 0; i < audit.flattenedLayers.length; i += 1) {
    const layer = audit.flattenedLayers[i];
    if (layer.blendMappingStatus === "approximated-blend" && layer.sourceBlendMode !== "pass-through") {
      const opacityAdvice =
        layer.recommendedOpacity !== layer.sourceOpacity
          ? ` 불투명도를 ${Math.round(layer.sourceOpacity * 100)}%에서 ${Math.round(layer.recommendedOpacity * 100)}%로 맞추면 색차를 줄일 수 있습니다.`
          : "";
      actionItemsKo.push(
        `「${layer.nameKo}」 레이어는 ${BLEND_MODE_LABEL_KO[layer.sourceBlendMode]} 대신 ${BLEND_MODE_LABEL_KO[layer.targetBlendMode]}로 대체됩니다(ΔE ${layer.oklabMeanDeltaE.toFixed(4)}).${opacityAdvice}`,
      );
    }
    for (let r = 0; r < layer.risks.length; r += 1) {
      const risk = layer.risks[r];
      if (risk.code === "blend-mode-approximated") continue;
      actionItemsKo.push(`[${RISK_BADGE_SHORT_KO[risk.code]}] 「${layer.nameKo}」: ${risk.mitigationKo}`);
    }
  }

  const riskBreakdownLinesKo: string[] = [];
  for (let i = 0; i < ALL_DCC_LOSS_RISK_CODES.length; i += 1) {
    const code = ALL_DCC_LOSS_RISK_CODES[i];
    const count = audit.riskCountByCode[code];
    if (count > 0) {
      riskBreakdownLinesKo.push(`${RISK_BADGE_SHORT_KO[code]}: ${count}건`);
    }
  }

  return {
    grade: audit.auditGrade,
    isStrictLossless: false,
    compatibilityScore: audit.compatibilityScore,
    routeLabelKo,
    headlineKo,
    summaryParagraphKo,
    actionItemsKo,
    riskBreakdownLinesKo,
    manifestSha256Hex: audit.translationManifestSha256Hex,
  };
}
