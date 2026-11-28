/**
 * Wave 92 — 글로벌 동시 연재 지역별 심의·상표·개인정보 정책 평가 엔진.
 *
 * 단일 마스터 회차 원본을 복제하거나 파괴하지 않고 6개 권역 심의 기준을 동시에 평가하며,
 * 비파괴 변형 레이어(`GeoVariantOverrideLayer`)의 기하 덮개율(`>= 0.999`)과
 * 검토자 승인을 fail-closed로 검증한다.
 */

import {
  DEFAULT_TRADEMARK_BLOCKLIST,
  GEO_REGION_POLICY_PROFILES,
  REMEDIATION_LABEL_KO,
  REQUIRED_OVERRIDE_COVERAGE_RATIO,
  type ComplianceBlockingFailureReason,
  type ComplianceBoundingBox,
  type ComplianceCategory,
  type ComplianceFindingSource,
  type GeoRegionCode,
  type GeoVariantOverrideLayer,
  type GeoVariantRemediationType,
  type MasterEpisodeDocument,
  type PanelRegionCellStatus,
  type PanelRegionStatusCell,
  type PanelTextItem,
  type PanelTextScanFinding,
  type PanelTextScanReport,
  type PiiOrTrademarkDetectionKind,
  type RegionalComplianceEvaluationOptions,
  type RegionalComplianceFinding,
  type RegionalComplianceMatrixReport,
  type RegionalComplianceRegionReport,
  type RegionalRemediationSuggestion,
} from "./geo-compliance-types-and-profiles";

export {
  COMPLIANCE_CATEGORIES,
  DEFAULT_TRADEMARK_BLOCKLIST,
  GEO_REGION_CODES,
  GEO_REGION_POLICY_PROFILES,
  GEO_VARIANT_REMEDIATION_TYPES,
  REQUIRED_OVERRIDE_COVERAGE_RATIO,
  regionCodeToTerritory,
  type ComplianceBlockingFailureReason,
  type ComplianceBoundingBox,
  type ComplianceCategory,
  type ComplianceFindingSource,
  type GeoRegionCategoryRule,
  type GeoRegionCode,
  type GeoRegionPolicyProfile,
  type GeoTerritoryCode,
  type GeoVariantOverrideLayer,
  type GeoVariantRemediationType,
  type MasterBaseLayer,
  type MasterBaseLayerRole,
  type MasterEpisodeDocument,
  type MasterEpisodePanel,
  type PanelComplianceAnnotation,
  type PanelRegionCellStatus,
  type PanelRegionStatusCell,
  type PanelTextItem,
  type PanelTextScanFinding,
  type PanelTextScanReport,
  type PiiOrTrademarkDetectionKind,
  type RegionalComplianceEvaluationOptions,
  type RegionalComplianceFinding,
  type RegionalComplianceMatrixReport,
  type RegionalComplianceRegionReport,
  type RegionalRemediationSuggestion,
} from "./geo-compliance-types-and-profiles";

export function isValidBoundingBox(bbox: ComplianceBoundingBox): boolean {
  return (
    Number.isFinite(bbox.x) &&
    Number.isFinite(bbox.y) &&
    Number.isFinite(bbox.width) &&
    Number.isFinite(bbox.height) &&
    bbox.width > 0 &&
    bbox.height > 0
  );
}

/** 단일 변형 레이어 박스가 대상 지적 영역을 덮는 비율(0..1)을 계산한다. */
export function computeBoundingBoxCoverageRatio(
  target: ComplianceBoundingBox,
  cover: ComplianceBoundingBox,
): number {
  if (!isValidBoundingBox(target) || !isValidBoundingBox(cover)) {
    return 0;
  }
  const ix0 = Math.max(target.x, cover.x);
  const iy0 = Math.max(target.y, cover.y);
  const ix1 = Math.min(target.x + target.width, cover.x + cover.width);
  const iy1 = Math.min(target.y + target.height, cover.y + cover.height);
  if (ix1 <= ix0 || iy1 <= iy0) {
    return 0;
  }
  return Math.max(0, Math.min(1, ((ix1 - ix0) * (iy1 - iy0)) / (target.width * target.height)));
}

/** 여러 승인 변형 레이어 합집합이 대상 지적 영역을 덮는 정확한 기하 비율(0..1)을 계산한다. */
export function computeUnionBoundingBoxCoverageRatio(
  target: ComplianceBoundingBox,
  covers: readonly ComplianceBoundingBox[],
): number {
  if (!isValidBoundingBox(target) || covers.length === 0) {
    return 0;
  }
  const tx0 = target.x;
  const ty0 = target.y;
  const tx1 = target.x + target.width;
  const ty1 = target.y + target.height;

  const clipped: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i < covers.length; i += 1) {
    const c = covers[i];
    if (!isValidBoundingBox(c)) {
      continue;
    }
    const x0 = Math.max(tx0, c.x);
    const y0 = Math.max(ty0, c.y);
    const x1 = Math.min(tx1, c.x + c.width);
    const y1 = Math.min(ty1, c.y + c.height);
    if (x1 > x0 && y1 > y0) {
      clipped.push({ x0, y0, x1, y1 });
      xs.push(x0, x1);
      ys.push(y0, y1);
    }
  }

  if (clipped.length === 0) {
    return 0;
  }
  if (clipped.length === 1) {
    const r = clipped[0];
    return Math.max(0, Math.min(1, ((r.x1 - r.x0) * (r.y1 - r.y0)) / (target.width * target.height)));
  }

  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const ux = xs.filter((v, idx) => idx === 0 || v - xs[idx - 1] > 1e-9);
  const uy = ys.filter((v, idx) => idx === 0 || v - ys[idx - 1] > 1e-9);

  let coveredArea = 0;
  for (let xi = 0; xi < ux.length - 1; xi += 1) {
    const midX = (ux[xi] + ux[xi + 1]) * 0.5;
    for (let yi = 0; yi < uy.length - 1; yi += 1) {
      const midY = (uy[yi] + uy[yi + 1]) * 0.5;
      for (let ri = 0; ri < clipped.length; ri += 1) {
        const rect = clipped[ri];
        if (midX >= rect.x0 && midX <= rect.x1 && midY >= rect.y0 && midY <= rect.y1) {
          coveredArea += (ux[xi + 1] - ux[xi]) * (uy[yi + 1] - uy[yi]);
          break;
        }
      }
    }
  }
  return Math.max(0, Math.min(1, coveredArea / (target.width * target.height)));
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiWord(token: string): boolean {
  return /^[A-Za-z0-9]/.test(token) && /[A-Za-z0-9]$/.test(token);
}

interface RawTextMatch {
  readonly category: "pii-contact-identifier" | "trademark-brand-signage";
  readonly detectionKind: PiiOrTrademarkDetectionKind;
  readonly matchedValue: string;
  readonly matchStart: number;
  readonly matchEnd: number;
  readonly severityScore: number;
  readonly descriptionKo: string;
}

interface StaticPatternSpec {
  readonly pattern: RegExp;
  readonly groupIndex: number;
  readonly category: "pii-contact-identifier" | "trademark-brand-signage";
  readonly detectionKind: PiiOrTrademarkDetectionKind;
  readonly severityScore: number;
  readonly prefixKo: string;
}

const PII_PATTERN_SPECS: readonly StaticPatternSpec[] = [
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    groupIndex: 0,
    category: "pii-contact-identifier",
    detectionKind: "email-address",
    severityScore: 95,
    prefixKo: "실제 이메일 주소 노출",
  },
  {
    pattern: /(?:^|[^0-9+])(\+[1-9]\d{0,2}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]\d{3,4}){1,2})(?![0-9])/g,
    groupIndex: 1,
    category: "pii-contact-identifier",
    detectionKind: "phone-number",
    severityScore: 95,
    prefixKo: "국제 전화번호 노출",
  },
  {
    pattern: /(?:^|[^0-9])(01[016789](?:[\s.-]?\d{3,4}[\s.-]?\d{4}))(?![0-9])/g,
    groupIndex: 1,
    category: "pii-contact-identifier",
    detectionKind: "phone-number",
    severityScore: 95,
    prefixKo: "국내 휴대전화 번호 노출",
  },
  {
    pattern: /(?:^|[^0-9])((?:02|0[3-6][1-5]|070)[\s.-]\d{3,4}[\s.-]\d{4})(?![0-9])/g,
    groupIndex: 1,
    category: "pii-contact-identifier",
    detectionKind: "phone-number",
    severityScore: 95,
    prefixKo: "국내 일반전화 번호 노출",
  },
  {
    pattern: /(?:^|[^0-9])((?:\(\d{3}\)\s*|\d{3}[\s.-])\d{3}[\s.-]\d{4})(?![0-9])/g,
    groupIndex: 1,
    category: "pii-contact-identifier",
    detectionKind: "phone-number",
    severityScore: 95,
    prefixKo: "북미 전화번호 노출",
  },
  {
    pattern:
      /(?:^|[^0-9가-힣])((?:(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*)?\d{2,3}\s*[가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주아바사자하허호배]\s*\d{4})(?![0-9])/g,
    groupIndex: 1,
    category: "pii-contact-identifier",
    detectionKind: "korean-license-plate",
    severityScore: 90,
    prefixKo: "국내 차량번호판 패턴 노출",
  },
];

function collectMatches(text: string, spec: StaticPatternSpec, out: RawTextMatch[]): void {
  spec.pattern.lastIndex = 0;
  let match: RegExpExecArray | null = spec.pattern.exec(text);
  while (match !== null) {
    const captured = match[spec.groupIndex];
    if (captured !== undefined && captured.length > 0) {
      const offsetInFull = match[0].indexOf(captured);
      const matchStart = match.index + (offsetInFull >= 0 ? offsetInFull : 0);
      out.push({
        category: spec.category,
        detectionKind: spec.detectionKind,
        matchedValue: captured,
        matchStart,
        matchEnd: matchStart + captured.length,
        severityScore: spec.severityScore,
        descriptionKo: `${spec.prefixKo}: "${captured}"`,
      });
    }
    if (match[0].length === 0) {
      spec.pattern.lastIndex += 1;
    }
    match = spec.pattern.exec(text);
  }
}

function deduplicateMatches(matches: readonly RawTextMatch[]): RawTextMatch[] {
  const sorted = matches.slice().sort((a, b) => {
    if (a.matchStart !== b.matchStart) return a.matchStart - b.matchStart;
    if (a.matchEnd !== b.matchEnd) return b.matchEnd - a.matchEnd;
    return a.detectionKind.localeCompare(b.detectionKind);
  });
  const kept: RawTextMatch[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const c = sorted[i];
    const overlaps = kept.some(
      (p) => p.category === c.category && c.matchStart < p.matchEnd && c.matchEnd > p.matchStart,
    );
    if (!overlaps) kept.push(c);
  }
  return kept;
}

/**
 * 패널 텍스트·간판에서 전화번호(국내/미국/국제), 이메일, 한국 차량번호,
 * 등록 상표명을 결정론적으로 탐지한다. 명시적 패러디·합성 플레이스홀더는 제외한다.
 */
export function scanPanelTextForPiiAndTrademarks(
  panelTexts: readonly PanelTextItem[],
  trademarkBlocklist?: readonly string[],
): PanelTextScanReport {
  const seenLower = new Set<string>();
  const sourceBrands =
    trademarkBlocklist !== undefined
      ? [...DEFAULT_TRADEMARK_BLOCKLIST, ...trademarkBlocklist]
      : DEFAULT_TRADEMARK_BLOCKLIST;
  const brandSpecs: StaticPatternSpec[] = [];

  for (let i = 0; i < sourceBrands.length; i += 1) {
    const trimmed = sourceBrands[i].trim();
    const lower = trimmed.toLowerCase();
    if (trimmed.length === 0 || seenLower.has(lower)) continue;
    seenLower.add(lower);
    const escaped = escapeRegExp(trimmed);
    const pattern = isAsciiWord(trimmed)
      ? new RegExp(`(?:^|[^A-Za-z0-9])(${escaped})(?![A-Za-z0-9])`, "gi")
      : new RegExp(`(${escaped})`, "gi");
    brandSpecs.push({
      pattern,
      groupIndex: 1,
      category: "trademark-brand-signage",
      detectionKind: "trademark-brand",
      severityScore: 80,
      prefixKo: `등록 상표명 노출(${trimmed})`,
    });
  }

  const findings: PanelTextScanFinding[] = [];
  let ignoredSyntheticCount = 0;
  let piiCount = 0;
  let trademarkCount = 0;

  for (let i = 0; i < panelTexts.length; i += 1) {
    const item = panelTexts[i];
    if (item.markedAsParodyOrSynthetic === true) {
      ignoredSyntheticCount += 1;
      continue;
    }
    const allowedParodyLower = new Set<string>(
      (item.allowedParodyTokens ?? []).map((token) => token.trim().toLowerCase()),
    );
    const rawMatches: RawTextMatch[] = [];
    for (let si = 0; si < PII_PATTERN_SPECS.length; si += 1) {
      collectMatches(item.text, PII_PATTERN_SPECS[si], rawMatches);
    }
    for (let bi = 0; bi < brandSpecs.length; bi += 1) {
      collectMatches(item.text, brandSpecs[bi], rawMatches);
    }

    const deduped = deduplicateMatches(rawMatches);
    for (let mi = 0; mi < deduped.length; mi += 1) {
      const m = deduped[mi];
      if (allowedParodyLower.has(m.matchedValue.trim().toLowerCase())) continue;
      if (m.category === "pii-contact-identifier") piiCount += 1;
      else trademarkCount += 1;
      findings.push({
        scanFindingId: `scan:${item.panelId}:${item.textId}:${mi + 1}`,
        panelId: item.panelId,
        textId: item.textId,
        layerId: item.layerId,
        category: m.category,
        detectionKind: m.detectionKind,
        matchedValue: m.matchedValue,
        matchStart: m.matchStart,
        matchEnd: m.matchEnd,
        severityScore: m.severityScore,
        bbox: item.bbox,
        descriptionKo: m.descriptionKo,
      });
    }
  }

  findings.sort((a, b) => {
    const byPanel = a.panelId.localeCompare(b.panelId);
    if (byPanel !== 0) return byPanel;
    const byText = a.textId.localeCompare(b.textId);
    return byText !== 0 ? byText : a.matchStart - b.matchStart;
  });

  return { findings, scannedItemCount: panelTexts.length, ignoredSyntheticCount, piiCount, trademarkCount };
}

interface InternalEvaluationTarget {
  readonly id: string;
  readonly panelId: string;
  readonly category: ComplianceCategory;
  readonly source: ComplianceFindingSource;
  readonly severityScore: number;
  readonly bbox: ComplianceBoundingBox;
  readonly description: string;
}

function buildFailureActionKo(
  reason: ComplianceBlockingFailureReason,
  panelId: string,
  preferred: GeoVariantRemediationType,
  coverageRatio: number,
): string {
  const remediationKo = REMEDIATION_LABEL_KO[preferred];
  const pct = (coverageRatio * 100).toFixed(1);
  if (reason === "invalid-bbox") {
    return `${panelId} 지적 영역 좌표가 유효하지 않습니다. 양수 폭·높이로 다시 지정하세요.`;
  }
  if (reason === "non-destructive-violation") {
    return `${panelId} 변형 레이어가 마스터 비파괴 플래그를 위반했습니다. 비파괴 오버라이드 레이어로 다시 추가하세요.`;
  }
  if (reason === "disallowed-remediation-type") {
    return `${panelId}에 연결된 보정 방식이 해당 항목 기준과 맞지 않습니다. '${remediationKo}'로 교체하세요.`;
  }
  if (reason === "unapproved-override") {
    return `${panelId} 변형 레이어의 검토자 승인이 끝나지 않았습니다. 승인 후 출고를 다시 검증하세요.`;
  }
  if (reason === "insufficient-bbox-coverage") {
    return `${panelId} 변형 레이어 덮개율이 ${pct}%로 기준(99.9%) 미만입니다. 지적 영역 전체를 덮도록 마스크를 확장하세요.`;
  }
  return `${panelId} 지적 영역 전체를 덮는 승인된 '${remediationKo}'를 추가하세요.`;
}

function evaluateSingleTargetForRegion(
  target: InternalEvaluationTarget,
  regionCode: GeoRegionCode,
  panelOverrides: readonly GeoVariantOverrideLayer[],
): RegionalComplianceFinding | null {
  const rule = GEO_REGION_POLICY_PROFILES[regionCode].rules[target.category];
  const severity = Number.isFinite(target.severityScore)
    ? Math.max(0, Math.min(100, target.severityScore))
    : 100;
  if (severity < rule.warnThreshold) return null;

  const base = {
    findingId: `${regionCode}:${target.panelId}:${target.id}`,
    panelId: target.panelId,
    regionCode,
    category: target.category,
    source: target.source,
    severityScore: severity,
    warnThreshold: rule.warnThreshold,
    blockThreshold: rule.blockThreshold,
    bbox: target.bbox,
    description: target.description,
    requiredCoverageRatio: REQUIRED_OVERRIDE_COVERAGE_RATIO,
    recommendedRemediation: rule.preferredRemediation,
  };

  if (severity < rule.blockThreshold) {
    return {
      ...base,
      status: "warning",
      coverageRatio: 0,
      appliedOverrideIds: [],
      unapprovedOverrideIds: [],
      remediationSuggestionKo: `${target.panelId} 주의 항목(출고 허용): 필요 시 ${REMEDIATION_LABEL_KO[rule.preferredRemediation]} 적용을 검토하세요.`,
    };
  }

  if (!isValidBoundingBox(target.bbox)) {
    return {
      ...base,
      status: "blocking",
      coverageRatio: 0,
      appliedOverrideIds: [],
      unapprovedOverrideIds: [],
      failureReason: "invalid-bbox",
      remediationSuggestionKo: buildFailureActionKo("invalid-bbox", target.panelId, rule.preferredRemediation, 0),
    };
  }

  const regionMatched = panelOverrides.filter(
    (o) =>
      o.targetRegions.includes(regionCode) &&
      (o.targetCategories === undefined ||
        o.targetCategories.length === 0 ||
        o.targetCategories.includes(target.category)),
  );
  const hasDestructiveViolation = regionMatched.some((o) => (o.nonDestructiveToMaster as boolean) !== true);
  const nonDestructive = regionMatched.filter((o) => (o.nonDestructiveToMaster as boolean) === true);
  const remediationMatched = nonDestructive.filter((o) => rule.allowedRemediations.includes(o.remediationType));
  const approved = remediationMatched.filter((o) => o.approvedByReviewer === true);
  const unapproved = remediationMatched.filter((o) => o.approvedByReviewer !== true);

  const coveringApproved = approved.filter(
    (o) => computeBoundingBoxCoverageRatio(target.bbox, o.bbox) > 0,
  );
  const coverageRatio = computeUnionBoundingBoxCoverageRatio(
    target.bbox,
    coveringApproved.map((o) => o.bbox),
  );
  const appliedOverrideIds = coveringApproved.map((o) => o.overrideId).sort();
  const unapprovedOverrideIds = unapproved.map((o) => o.overrideId).sort();

  if (coveringApproved.length > 0 && coverageRatio >= REQUIRED_OVERRIDE_COVERAGE_RATIO) {
    return {
      ...base,
      status: "resolved-by-variant",
      coverageRatio,
      appliedOverrideIds,
      unapprovedOverrideIds,
      remediationSuggestionKo: `${target.panelId} 차단 항목이 승인 변형 레이어(${appliedOverrideIds.join(", ")})로 보정되었습니다.`,
    };
  }

  const failureReason: ComplianceBlockingFailureReason =
    coveringApproved.length > 0 || approved.length > 0
      ? "insufficient-bbox-coverage"
      : unapproved.length > 0
        ? "unapproved-override"
        : nonDestructive.length > 0 && remediationMatched.length === 0
          ? "disallowed-remediation-type"
          : hasDestructiveViolation
            ? "non-destructive-violation"
            : "no-matching-override";

  return {
    ...base,
    status: "blocking",
    coverageRatio,
    appliedOverrideIds,
    unapprovedOverrideIds,
    failureReason,
    remediationSuggestionKo: buildFailureActionKo(
      failureReason,
      target.panelId,
      rule.preferredRemediation,
      coverageRatio,
    ),
  };
}

/**
 * 단일 마스터 회차의 모든 패널 지적 사항과 자동 텍스트 스캔 결과를
 * 지정된 권역 프로파일별로 일괄 평가하여 결정론적 심의 매트릭스를 산출한다.
 */
export function evaluateRegionalComplianceMatrix(
  masterEpisode: MasterEpisodeDocument,
  targetRegions: readonly GeoRegionCode[],
  options?: RegionalComplianceEvaluationOptions,
): RegionalComplianceMatrixReport {
  const uniqueRegions = Array.from(new Set(targetRegions));
  const orderedPanels = masterEpisode.panels
    .slice()
    .sort((a, b) => (a.sequenceIndex !== b.sequenceIndex ? a.sequenceIndex - b.sequenceIndex : a.panelId.localeCompare(b.panelId)));

  const allPanelTexts: PanelTextItem[] = [];
  const panelTitlesById: Record<string, string> = {};
  const targetsByPanel = new Map<string, InternalEvaluationTarget[]>();
  const overridesByPanel = new Map<string, GeoVariantOverrideLayer[]>();

  for (let i = 0; i < orderedPanels.length; i += 1) {
    const panel = orderedPanels[i];
    panelTitlesById[panel.panelId] = panel.title;
    if (panel.textItems !== undefined) allPanelTexts.push(...panel.textItems);
    const list: InternalEvaluationTarget[] = (panel.complianceAnnotations ?? []).map((ann) => ({
      id: ann.annotationId,
      panelId: panel.panelId,
      category: ann.category,
      source: "manual-annotation",
      severityScore: ann.severityScore,
      bbox: ann.bbox,
      description: ann.description,
    }));
    targetsByPanel.set(panel.panelId, list);
    overridesByPanel.set(panel.panelId, []);
  }

  const textScanReport = scanPanelTextForPiiAndTrademarks(allPanelTexts, options?.trademarkBlocklist);
  for (let i = 0; i < textScanReport.findings.length; i += 1) {
    const sf = textScanReport.findings[i];
    targetsByPanel.get(sf.panelId)?.push({
      id: sf.scanFindingId,
      panelId: sf.panelId,
      category: sf.category,
      source: "auto-text-scan",
      severityScore: sf.severityScore,
      bbox: sf.bbox,
      description: sf.descriptionKo,
    });
  }
  for (let i = 0; i < masterEpisode.variantOverrides.length; i += 1) {
    const ovr = masterEpisode.variantOverrides[i];
    overridesByPanel.get(ovr.panelId)?.push(ovr);
  }

  const regions: RegionalComplianceRegionReport[] = [];
  const byRegion: Partial<Record<GeoRegionCode, RegionalComplianceRegionReport>> = {};
  let totalBlockingCount = 0;
  let totalResolvedByVariantCount = 0;
  let totalWarningCount = 0;

  for (let ri = 0; ri < uniqueRegions.length; ri += 1) {
    const regionCode = uniqueRegions[ri];
    const profile = GEO_REGION_POLICY_PROFILES[regionCode];
    const blockingFindings: RegionalComplianceFinding[] = [];
    const resolvedFindings: RegionalComplianceFinding[] = [];
    const warningFindings: RegionalComplianceFinding[] = [];
    const remediationSuggestions: RegionalRemediationSuggestion[] = [];
    const panelStatuses: PanelRegionStatusCell[] = [];

    for (let pi = 0; pi < orderedPanels.length; pi += 1) {
      const panel = orderedPanels[pi];
      const targets = targetsByPanel.get(panel.panelId) ?? [];
      const panelOverrides = overridesByPanel.get(panel.panelId) ?? [];
      let panelBlock = 0;
      let panelResolved = 0;
      let panelWarn = 0;

      for (let ti = 0; ti < targets.length; ti += 1) {
        const finding = evaluateSingleTargetForRegion(targets[ti], regionCode, panelOverrides);
        if (finding === null) continue;
        if (finding.status === "blocking") {
          panelBlock += 1;
          blockingFindings.push(finding);
          remediationSuggestions.push({
            findingId: finding.findingId,
            panelId: finding.panelId,
            category: finding.category,
            recommendedRemediation: finding.recommendedRemediation,
            currentCoverageRatio: finding.coverageRatio,
            actionKo: finding.remediationSuggestionKo,
          });
        } else if (finding.status === "resolved-by-variant") {
          panelResolved += 1;
          resolvedFindings.push(finding);
        } else {
          panelWarn += 1;
          warningFindings.push(finding);
        }
      }

      const status: PanelRegionCellStatus = panelBlock > 0 ? "BLK" : panelResolved > 0 ? "VAR" : "OK";
      panelStatuses.push({
        panelId: panel.panelId,
        panelTitle: panel.title,
        regionCode,
        status,
        blockingCount: panelBlock,
        resolvedVariantCount: panelResolved,
        warningCount: panelWarn,
      });
    }

    totalBlockingCount += blockingFindings.length;
    totalResolvedByVariantCount += resolvedFindings.length;
    totalWarningCount += warningFindings.length;

    const regionReport: RegionalComplianceRegionReport = {
      regionCode,
      territory: profile.territory,
      labelKo: profile.labelKo,
      exportAllowed: blockingFindings.length === 0,
      blockingFindings,
      resolvedFindings,
      resolvedByVariantCount: resolvedFindings.length,
      warningFindings,
      remediationSuggestions,
      panelStatuses,
    };
    regions.push(regionReport);
    byRegion[regionCode] = regionReport;
  }

  return {
    episodeId: masterEpisode.episodeId,
    seriesId: masterEpisode.seriesId,
    episodeTitle: masterEpisode.title,
    masterRevision: masterEpisode.masterRevision,
    targetRegions: uniqueRegions,
    panelIds: orderedPanels.map((p) => p.panelId),
    panelTitlesById,
    textScanReport,
    regions,
    byRegion,
    overallAllRegionsAllowed: regions.every((r) => r.exportAllowed),
    totalBlockingCount,
    totalResolvedByVariantCount,
    totalWarningCount,
  };
}
