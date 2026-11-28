/**
 * Wave 80 — Calm Atelier 비침습 캔버스 핀 오버레이 및 회차 프리플라이트 요약 포매터.
 *
 * - 원시 hex/rgb 문자열 없이 의미 토큰과 OKLCH 색표기만 사용한다.
 * - 캔버스 동시 노출 핀 상한(`<= 9`)과 44px 이상 터치 타깃을 보장하고, 초과분은 단일 오버플로우
 *   클러스터 핀으로 묶어 작화 시야(`>= 82%`)를 방해하지 않는다.
 * - 키보드 포커스 순서(심각도 → 상하 → 좌우)와 접근성 라벨을 결정론적으로 생성한다.
 */

import {
  ON_DEVICE_PRIVACY_CONTRACT,
  clamp01,
  type EpisodeCutRef,
  type OnDevicePrivacyContract,
} from "./local-episode-canon-index";
import type {
  ContinuityAuditFinding,
  ContinuityBlunderKind,
  ContinuitySeverity,
  CutContinuityAuditResult,
  NormalizedCanvasPoint,
} from "./continuity-drift-auditor";

/** 캔버스 위에 동시에 표시할 수 있는 연속성 핀 최대 개수(5~9 컨트롤 예산 상한). */
export const MAX_VISIBLE_CONTINUITY_PINS = 9;

/** Calm Atelier 터치·스타일러스 최소 히트 영역(px). */
export const CONTINUITY_PIN_HIT_TARGET_PX = 44;

/** 의미 기반 배지 스타일 토큰(원시 hex/rgb 금지, OKLCH 전용). */
export interface SeverityBadgeVisualToken {
  readonly semanticToken: "bad" | "warn" | "cool";
  readonly badgeBgOklch: string;
  readonly badgeFgOklch: string;
  readonly badgeLabelKo: string;
}

const SEVERITY_RANK: Readonly<Record<ContinuitySeverity, number>> = {
  blocker: 3,
  warning: 2,
  info: 1,
};

const SEVERITY_BADGE_TOKENS: Readonly<Record<ContinuitySeverity, SeverityBadgeVisualToken>> = {
  blocker: {
    semanticToken: "bad",
    badgeBgOklch: "oklch(0.56 0.18 26.0)",
    badgeFgOklch: "oklch(0.98 0.01 90.0)",
    badgeLabelKo: "확인 필요",
  },
  warning: {
    semanticToken: "warn",
    badgeBgOklch: "oklch(0.68 0.14 72.0)",
    badgeFgOklch: "oklch(0.22 0.03 65.0)",
    badgeLabelKo: "연속성 주의",
  },
  info: {
    semanticToken: "cool",
    badgeBgOklch: "oklch(0.54 0.09 220.0)",
    badgeFgOklch: "oklch(0.98 0.01 90.0)",
    badgeLabelKo: "참고",
  },
};

/** 캔버스 위에 배치되는 단일 비침습 연속성 핀 마커. */
export interface ContinuityCanvasPinMarker {
  readonly pinId: string;
  readonly findingKey: string;
  readonly suppressionScopeKey: string;
  readonly kind: ContinuityBlunderKind;
  readonly severity: ContinuitySeverity;
  readonly anchor: NormalizedCanvasPoint;
  readonly badge: SeverityBadgeVisualToken;
  readonly shortLabelKo: string;
  readonly tooltipKo: string;
  readonly citationKo: string;
  readonly quickFixLabelKo: string;
  readonly dismissLabelKo: "의도적 연출로 무시";
  readonly focusOrder: number;
  readonly tabIndex: 0;
  readonly hitTargetPx: number;
  readonly ariaLabelKo: string;
}

/** 핀 상한 초과 시 접어 두는 오버플로우 그룹 핀. */
export interface ContinuityPinOverflowGroup {
  readonly pinId: string;
  readonly groupedCount: number;
  readonly hiddenFindingKeys: readonly string[];
  readonly highestSeverity: ContinuitySeverity;
  readonly badge: SeverityBadgeVisualToken;
  readonly anchor: NormalizedCanvasPoint;
  readonly summaryKo: string;
  readonly focusOrder: number;
  readonly tabIndex: 0;
  readonly hitTargetPx: number;
  readonly ariaLabelKo: string;
}

/** 캔버스 핀 오버레이 배치 결과. */
export interface ContinuityCanvasPinOverlaySet {
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly maxVisiblePins: number;
  readonly totalActiveFindings: number;
  readonly visiblePinCount: number;
  readonly pins: readonly ContinuityCanvasPinMarker[];
  readonly overflowGroup: ContinuityPinOverflowGroup | null;
  readonly privacyContract: OnDevicePrivacyContract;
}

/** 오버레이 생성 옵션. */
export interface BuildPinOverlayOptions {
  /** 동시 표시 핀 상한(1..9 범위로 강제 클램프, 기본값 9). */
  readonly maxVisiblePins?: number;
}

/** 회차 프리플라이트 종합 준비 상태. */
export type EpisodePreflightReadiness = "ready" | "review-recommended" | "needs-attention";

/** 회차 요약 상위 우선 검토 항목. */
export interface EpisodePriorityFindingRef {
  readonly findingKey: string;
  readonly cutRef: EpisodeCutRef;
  readonly kind: ContinuityBlunderKind;
  readonly severity: ContinuitySeverity;
  readonly titleKo: string;
  readonly messageKo: string;
}

/** 회차 단위 연속성 프리플라이트 종합 보고서. */
export interface EpisodeContinuityPreflightSummary {
  readonly episodeNumber: number;
  readonly auditedCutCount: number;
  readonly cleanCutCount: number;
  readonly activeFindingCount: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly suppressedCount: number;
  readonly byBlunderKind: Readonly<Record<ContinuityBlunderKind, number>>;
  readonly readinessStatus: EpisodePreflightReadiness;
  readonly headlineKo: string;
  readonly guidanceKo: string;
  readonly topPriorityFindings: readonly EpisodePriorityFindingRef[];
  readonly privacyContract: OnDevicePrivacyContract;
}

function blunderShortLabelKo(kind: ContinuityBlunderKind): string {
  switch (kind) {
    case "chirality-flip": return "좌우 반전";
    case "missing-canonical-trait": return "특징 누락";
    case "palette-color-drift": return "색감 이탈";
    case "proportion-style-drift": return "비례 편차";
    case "prop-state-regression": return "소품 회귀";
    case "costume-scene-mismatch": return "의상 불일치";
  }
}

function compareFindingsForFocus(a: ContinuityAuditFinding, b: ContinuityAuditFinding): number {
  const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sevDiff !== 0) return sevDiff;
  const yDiff = clamp01(a.anchor.y) - clamp01(b.anchor.y);
  if (Math.abs(yDiff) > 0.0001) return yDiff;
  const xDiff = clamp01(a.anchor.x) - clamp01(b.anchor.x);
  if (Math.abs(xDiff) > 0.0001) return xDiff;
  return a.findingKey.localeCompare(b.findingKey);
}

/**
 * 컷 감사 결과를 Calm Atelier 비침습 캔버스 핀 오버레이 모델로 변환한다.
 * - 핀 총량(개별 핀 + 오버플로우 그룹 핀)은 항상 `<= 9` 예산을 지킨다.
 * - 키보드 탐색 순서(`focusOrder`)는 심각도 → 캔버스 위에서 아래 → 왼쪽에서 오른쪽 순이다.
 */
export function buildContinuityCanvasPinOverlays(
  auditResult: CutContinuityAuditResult,
  options: BuildPinOverlayOptions = {},
): ContinuityCanvasPinOverlaySet {
  const requestedBudget = options.maxVisiblePins ?? MAX_VISIBLE_CONTINUITY_PINS;
  const maxVisiblePins = Math.max(
    1,
    Math.min(MAX_VISIBLE_CONTINUITY_PINS, Math.floor(requestedBudget)),
  );

  const ordered = [...auditResult.findings].sort(compareFindingsForFocus);
  const needsOverflow = ordered.length > maxVisiblePins;
  const directLimit = needsOverflow ? Math.max(0, maxVisiblePins - 1) : ordered.length;
  const directFindings = ordered.slice(0, directLimit);
  const hiddenFindings = ordered.slice(directLimit);

  const pins: ContinuityCanvasPinMarker[] = directFindings.map((finding, idx) => {
    const badge = SEVERITY_BADGE_TOKENS[finding.severity];
    const shortLabelKo = blunderShortLabelKo(finding.kind);
    const focusOrder = idx + 1;
    const anchor: NormalizedCanvasPoint = {
      x: clamp01(finding.anchor.x),
      y: clamp01(finding.anchor.y),
    };
    return {
      pinId: `continuity-pin-${auditResult.episodeNumber}-${auditResult.cutNumber}-${focusOrder}`,
      findingKey: finding.findingKey,
      suppressionScopeKey: finding.suppressionScopeKey,
      kind: finding.kind,
      severity: finding.severity,
      anchor,
      badge,
      shortLabelKo,
      tooltipKo: finding.messageKo,
      citationKo: finding.citationKo,
      quickFixLabelKo: finding.suggestedFix.labelKo,
      dismissLabelKo: finding.dismissActionLabelKo,
      focusOrder,
      tabIndex: 0,
      hitTargetPx: CONTINUITY_PIN_HIT_TARGET_PX,
      ariaLabelKo: `${focusOrder}번 연속성 핀(${badge.badgeLabelKo} · ${shortLabelKo}): ${finding.messageKo}`,
    };
  });

  let overflowGroup: ContinuityPinOverflowGroup | null = null;
  if (hiddenFindings.length > 0) {
    let highestSeverity: ContinuitySeverity = "info";
    let sumX = 0;
    let sumY = 0;
    const hiddenFindingKeys: string[] = [];

    for (let i = 0; i < hiddenFindings.length; i += 1) {
      const item = hiddenFindings[i];
      if (!item) continue;
      hiddenFindingKeys.push(item.findingKey);
      sumX += clamp01(item.anchor.x);
      sumY += clamp01(item.anchor.y);
      if (SEVERITY_RANK[item.severity] > SEVERITY_RANK[highestSeverity]) {
        highestSeverity = item.severity;
      }
    }

    const focusOrder = pins.length + 1;
    const badge = SEVERITY_BADGE_TOKENS[highestSeverity];
    const summaryKo = `외 ${hiddenFindings.length}건 연속성 항목 더 보기`;
    overflowGroup = {
      pinId: `continuity-pin-overflow-${auditResult.episodeNumber}-${auditResult.cutNumber}`,
      groupedCount: hiddenFindings.length,
      hiddenFindingKeys,
      highestSeverity,
      badge,
      anchor: {
        x: clamp01(sumX / hiddenFindings.length),
        y: clamp01(sumY / hiddenFindings.length),
      },
      summaryKo,
      focusOrder,
      tabIndex: 0,
      hitTargetPx: CONTINUITY_PIN_HIT_TARGET_PX,
      ariaLabelKo: `${focusOrder}번 연속성 묶음 핀(${badge.badgeLabelKo}): ${summaryKo}`,
    };
  }

  return {
    episodeNumber: auditResult.episodeNumber,
    cutNumber: auditResult.cutNumber,
    maxVisiblePins,
    totalActiveFindings: ordered.length,
    visiblePinCount: pins.length + (overflowGroup ? 1 : 0),
    pins,
    overflowGroup,
    privacyContract: auditResult.privacyContract,
  };
}

/**
 * 한 회차 내 모든 컷 감사 결과를 묶어 마감 전 프리플라이트 종합 보고서를 생성한다.
 */
export function summarizeEpisodeContinuityReport(
  episodeNumber: number,
  cutResults: readonly CutContinuityAuditResult[],
  maxTopFindings = 5,
): EpisodeContinuityPreflightSummary {
  const byBlunderKind: Record<ContinuityBlunderKind, number> = {
    "chirality-flip": 0,
    "missing-canonical-trait": 0,
    "palette-color-drift": 0,
    "proportion-style-drift": 0,
    "prop-state-regression": 0,
    "costume-scene-mismatch": 0,
  };

  let cleanCutCount = 0;
  let blockerCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let suppressedCount = 0;
  const allFindings: ContinuityAuditFinding[] = [];

  for (let i = 0; i < cutResults.length; i += 1) {
    const cut = cutResults[i];
    if (!cut) continue;
    suppressedCount += cut.suppressedFindings.length;
    if (cut.findings.length === 0) {
      cleanCutCount += 1;
      continue;
    }
    for (let f = 0; f < cut.findings.length; f += 1) {
      const finding = cut.findings[f];
      if (!finding) continue;
      allFindings.push(finding);
      byBlunderKind[finding.kind] += 1;
      if (finding.severity === "blocker") blockerCount += 1;
      else if (finding.severity === "warning") warningCount += 1;
      else infoCount += 1;
    }
  }

  allFindings.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDiff !== 0) return sevDiff;
    if (a.cutNumber !== b.cutNumber) return a.cutNumber - b.cutNumber;
    return a.findingKey.localeCompare(b.findingKey);
  });

  let readinessStatus: EpisodePreflightReadiness = "ready";
  let headlineKo = `${episodeNumber}화 연속성 점검 통과 (${cutResults.length}컷 이상 없음)`;
  let guidanceKo = "캐릭터 특징·팔레트·소품·의상 설정이 앞 회차와 자연스럽게 이어집니다.";

  if (blockerCount > 0) {
    readinessStatus = "needs-attention";
    headlineKo = `${episodeNumber}화 마감 전 확인 필요 (필수 확인 ${blockerCount}건 · 주의 ${warningCount}건)`;
    guidanceKo = "좌우 반전이나 핵심 설정 누락 항목을 먼저 확인하거나, 의도적 연출이면 무시 처리하세요.";
  } else if (warningCount > 0) {
    readinessStatus = "review-recommended";
    headlineKo = `${episodeNumber}화 연속성 가벼운 검토 권장 (주의 ${warningCount}건)`;
    guidanceKo = "색감·비례·소품 변화가 연출 의도와 맞는지 한 번 훑어본 뒤 내보내기를 진행하세요.";
  }

  const topLimit = Math.max(0, Math.floor(maxTopFindings));
  const topPriorityFindings: EpisodePriorityFindingRef[] = allFindings
    .slice(0, topLimit)
    .map((finding) => ({
      findingKey: finding.findingKey,
      cutRef: { episodeNumber: finding.episodeNumber, cutNumber: finding.cutNumber },
      kind: finding.kind,
      severity: finding.severity,
      titleKo: finding.titleKo,
      messageKo: finding.messageKo,
    }));

  const privacyContract = cutResults[0]?.privacyContract ?? ON_DEVICE_PRIVACY_CONTRACT;

  return {
    episodeNumber,
    auditedCutCount: cutResults.length,
    cleanCutCount,
    activeFindingCount: allFindings.length,
    blockerCount,
    warningCount,
    infoCount,
    suppressedCount,
    byBlunderKind,
    readinessStatus,
    headlineKo,
    guidanceKo,
    topPriorityFindings,
    privacyContract,
  };
}
