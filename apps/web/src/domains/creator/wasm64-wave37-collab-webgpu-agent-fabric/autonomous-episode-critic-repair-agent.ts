/**
 * Wave 37: 자기 검증형 다중 에이전트 에피소드 품질 검수기 및 비파괴 복구 플래너.
 *
 * 4대 원고 결함 검출기:
 * 1. `sliver-halo`: 선화-밑색 경계 또는 인접 셀 사이의 `1~2px` 미채색 실틈 검출
 * 2. `speaker-tail-mismatch`: 말풍선 꼬리 화자 거리 초과·타 캐릭터 오지향·전경 차폐 불일치 검출
 * 3. `low-text-contrast`: 말풍선 배경 대비 대사 텍스트 WCAG 2.1 명도 대비비 `< 4.5:1` 검출
 * 4. `panel-tangent-collision`: 말풍선·전경 요소 외곽선이 컷 테두리나 인접 말풍선과 스치는 접선 충돌 검출
 */

/** 일반 본문 대사 최소 WCAG 2.1 AA 명도 대비비(`4.5:1`). */
export const MIN_WCAG_AA_TEXT_CONTRAST_RATIO = 4.5 as const;
/** 실틈(Sliver Halo) 최소 미채색 폭(`1 px`). */
export const MIN_SLIVER_HALO_WIDTH_PX = 1 as const;
/** 실틈(Sliver Halo) 최대 미채색 폭(`2 px`). */
export const MAX_SLIVER_HALO_WIDTH_PX = 2 as const;
/** 말풍선 꼬리 끝점과 화자 입 사이의 기본 최대 허용 거리(`180 px`). */
export const DEFAULT_MAX_SPEAKER_TAIL_DISTANCE_PX = 180 as const;
/** 접선 충돌로 판정하는 경계 근접 허용 오차(`3 px`). */
export const DEFAULT_TANGENT_COLLISION_EPSILON_PX = 3 as const;
/** 접선 충돌 복구 시 확보할 기본 안전 여백(`12 px`). */
export const DEFAULT_SAFE_TANGENT_CLEARANCE_PX = 12 as const;

export type EpisodeCriticIssueKind =
  | "sliver-halo"
  | "speaker-tail-mismatch"
  | "low-text-contrast"
  | "panel-tangent-collision";

export type CriticSeverity = "critical" | "warning" | "advisory";
export type RepairPatchApprovalState = "pending" | "accepted" | "rejected";
export type SpeakerTailMismatchReason =
  | "missing-speaker"
  | "excessive-distance"
  | "closer-to-other-character"
  | "foreground-occluded";

export interface CriticPoint2D { readonly x: number; readonly y: number }
export interface CriticRect2D { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface CriticSrgbColor { readonly r: number; readonly g: number; readonly b: number }
export interface SliverPixelFillEntry { readonly pixelIndex: number; readonly fillRegionId: number }

export interface CelBoundarySeamSample {
  readonly seamId: string; readonly position: CriticPoint2D; readonly uncoloredGapWidthPx: number;
  readonly adjacentFillRegionId: number; readonly hasInkBoundary: boolean;
}
export interface CelRasterGridSample {
  readonly width: number; readonly height: number; readonly inkMask: Uint8Array; readonly fillRegionIds: readonly number[];
}
export interface CutSpeakerAnchor {
  readonly characterId: string; readonly nameKo: string; readonly mouthPosition: CriticPoint2D;
  readonly bodyBounds: CriticRect2D; readonly zOrder: number; readonly occluded?: boolean;
}
export interface CutSpeechBalloon {
  readonly balloonId: string; readonly attributedSpeakerId: string; readonly bounds: CriticRect2D;
  readonly tailTip: CriticPoint2D; readonly tailStyle?: "pointed" | "occluded-indicator";
  readonly text: string; readonly textSrgb: CriticSrgbColor; readonly fillSrgb: CriticSrgbColor;
}
export interface CutForegroundElement {
  readonly elementId: string; readonly labelKo: string; readonly bounds: CriticRect2D; readonly intentionalBleed?: boolean;
}
export interface EpisodeCutAuditTarget {
  readonly cutId: string; readonly cutOrder: number; readonly panelBounds: CriticRect2D;
  readonly celRasterGrid?: CelRasterGridSample; readonly celBoundarySeams?: readonly CelBoundarySeamSample[];
  readonly characters: readonly CutSpeakerAnchor[]; readonly balloons: readonly CutSpeechBalloon[];
  readonly foregroundElements?: readonly CutForegroundElement[];
}
export interface EpisodeCriticAuditOptions {
  readonly maxSpeakerTailDistancePx?: number; readonly minTextContrastRatio?: number;
  readonly tangentCollisionEpsilonPx?: number; readonly safeTangentClearancePx?: number;
}
export interface CriticQualityFinding {
  readonly findingId: string; readonly cutId: string; readonly cutOrder: number; readonly kind: EpisodeCriticIssueKind;
  readonly severity: CriticSeverity; readonly targetId: string; readonly summaryKo: string;
  readonly measuredValue: number; readonly thresholdValue: number;
}

export type RepairPatchOperation =
  | { readonly opKind: "dilate-sliver-halo"; readonly seamIds: readonly string[]; readonly pixelFills: readonly SliverPixelFillEntry[] }
  | {
      readonly opKind: "retarget-speaker-tail";
      readonly balloonId: string;
      readonly suggestedTailTip: CriticPoint2D;
      readonly suggestedTailStyle: "pointed" | "occluded-indicator";
      readonly mismatchReason: SpeakerTailMismatchReason;
    }
  | { readonly opKind: "rebalance-text-contrast"; readonly balloonId: string; readonly suggestedTextSrgb: CriticSrgbColor; readonly projectedContrastRatio: number }
  | { readonly opKind: "nudge-tangent-clearance"; readonly targetSurface: "balloon" | "element"; readonly targetId: string; readonly suggestedBounds: CriticRect2D };

export interface NonDestructiveRepairPatch {
  readonly patchId: string; readonly findingId: string; readonly cutId: string; readonly cutOrder: number;
  readonly issueKind: EpisodeCriticIssueKind; readonly priorityRank: number; readonly priorityScore: number;
  readonly approvalState: RepairPatchApprovalState; readonly decidedByAuthorId?: string; readonly decisionNoteKo?: string;
  readonly selfVerified: boolean; readonly descriptionKo: string; readonly operation: RepairPatchOperation;
}
export interface EpisodeCriticAuditReport {
  readonly findings: readonly CriticQualityFinding[]; readonly repairPatches: readonly NonDestructiveRepairPatch[];
  readonly cleanCutIds: readonly string[]; readonly flaggedCutIds: readonly string[];
}
export interface ArtistPatchDecisionInput {
  readonly patchId: string; readonly decision: "accepted" | "rejected"; readonly authorId: string; readonly noteKo?: string;
}
export interface ApplyApprovedPatchesResult {
  readonly cuts: readonly EpisodeCutAuditTarget[]; readonly updatedPatches: readonly NonDestructiveRepairPatch[];
  readonly appliedPatchIds: readonly string[]; readonly skippedPatchIds: readonly string[];
  readonly mutatedCutIds: readonly string[]; readonly postRepairFindingCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function srgbChannelToLinear(channel255: number): number {
  const normalized = clamp(channel255 / 255, 0, 1);
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** sRGB 색상의 WCAG 2.1 상대 휘도(`0..1`)를 계산한다. */
export function computeWcagRelativeLuminance(color: CriticSrgbColor): number {
  return 0.2126 * srgbChannelToLinear(color.r) + 0.7152 * srgbChannelToLinear(color.g) + 0.0722 * srgbChannelToLinear(color.b);
}

/** 두 sRGB 색상 사이의 WCAG 2.1 명도 대비비(`1..21`)를 계산한다. */
export function computeWcagContrastRatio(foreground: CriticSrgbColor, background: CriticSrgbColor): number {
  const lumA = computeWcagRelativeLuminance(foreground);
  const lumB = computeWcagRelativeLuminance(background);
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

function solveAccessibleTextColor(originalText: CriticSrgbColor, balloonFill: CriticSrgbColor, minRatio: number): CriticSrgbColor {
  const anchor: CriticSrgbColor = computeWcagRelativeLuminance(balloonFill) >= 0.179
    ? { r: 16, g: 18, b: 22 }
    : { r: 250, g: 250, b: 252 };
  const safetyTarget = Math.max(minRatio + 0.15, MIN_WCAG_AA_TEXT_CONTRAST_RATIO);
  let low = 0;
  let high = 1;
  let best = anchor;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) * 0.5;
    const candidate: CriticSrgbColor = {
      r: Math.round(originalText.r + (anchor.r - originalText.r) * mid),
      g: Math.round(originalText.g + (anchor.g - originalText.g) * mid),
      b: Math.round(originalText.b + (anchor.b - originalText.b) * mid),
    };
    if (computeWcagContrastRatio(candidate, balloonFill) >= safetyTarget) {
      best = candidate;
      high = mid;
    } else {
      low = mid;
    }
  }
  return best;
}

function pointInsideRect(pt: CriticPoint2D, rect: CriticRect2D): boolean {
  return pt.x >= rect.x && pt.x <= rect.x + rect.width && pt.y >= rect.y && pt.y <= rect.y + rect.height;
}

function segmentIntersectsRect(a: CriticPoint2D, b: CriticPoint2D, rect: CriticRect2D): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: readonly [number, number][] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

function scanRasterSliverHalos(grid: CelRasterGridSample): SliverPixelFillEntry[] {
  const { width, height, inkMask, fillRegionIds } = grid;
  const fillByPixel = new Map<number, number>();
  const inspectLine = (length: number, indexAt: (pos: number) => number) => {
    let pos = 0;
    while (pos < length) {
      const idx = indexAt(pos);
      if ((inkMask[idx] ?? 0) !== 0 || (fillRegionIds[idx] ?? 0) !== 0) {
        pos += 1;
        continue;
      }
      let end = pos + 1;
      while (end < length && (inkMask[indexAt(end)] ?? 0) === 0 && (fillRegionIds[indexAt(end)] ?? 0) === 0) {
        end += 1;
      }
      const gapLen = end - pos;
      if (gapLen >= MIN_SLIVER_HALO_WIDTH_PX && gapLen <= MAX_SLIVER_HALO_WIDTH_PX && pos > 0 && end < length) {
        const leftIdx = indexAt(pos - 1);
        const rightIdx = indexAt(end);
        const leftInk = (inkMask[leftIdx] ?? 0) !== 0;
        const rightInk = (inkMask[rightIdx] ?? 0) !== 0;
        const leftFill = fillRegionIds[leftIdx] ?? 0;
        const rightFill = fillRegionIds[rightIdx] ?? 0;
        const chosenFill = leftInk && rightFill > 0 ? rightFill : rightInk && leftFill > 0 ? leftFill : leftFill > 0 && rightFill > 0 ? leftFill : 0;
        if (chosenFill > 0) {
          for (let k = pos; k < end; k += 1) {
            const targetIdx = indexAt(k);
            if (!fillByPixel.has(targetIdx)) fillByPixel.set(targetIdx, chosenFill);
          }
        }
      }
      pos = end;
    }
  };
  for (let y = 0; y < height; y += 1) inspectLine(width, (x) => y * width + x);
  for (let x = 0; x < width; x += 1) inspectLine(height, (y) => y * width + x);
  return [...fillByPixel.entries()].sort((a, b) => a[0] - b[0]).map(([pixelIndex, fillRegionId]) => ({ pixelIndex, fillRegionId }));
}

function detectPanelEdgeTangent(
  bounds: CriticRect2D,
  panel: CriticRect2D,
  epsilonPx: number,
  clearancePx: number,
): { minEdgeDeltaPx: number; nudged: CriticRect2D } | null {
  const leftGap = bounds.x - panel.x;
  const rightGap = panel.x + panel.width - (bounds.x + bounds.width);
  const topGap = bounds.y - panel.y;
  const bottomGap = panel.y + panel.height - (bounds.y + bounds.height);
  const grazingGaps = [leftGap, rightGap, topGap, bottomGap].filter((gap) => Math.abs(gap) <= epsilonPx);
  if (grazingGaps.length === 0) return null;

  let nextX = Math.abs(leftGap) <= epsilonPx
    ? panel.x + clearancePx
    : Math.abs(rightGap) <= epsilonPx
      ? panel.x + panel.width - bounds.width - clearancePx
      : bounds.x;
  let nextY = Math.abs(topGap) <= epsilonPx
    ? panel.y + clearancePx
    : Math.abs(bottomGap) <= epsilonPx
      ? panel.y + panel.height - bounds.height - clearancePx
      : bounds.y;
  nextX = clamp(nextX, panel.x + clearancePx, Math.max(panel.x + clearancePx, panel.x + panel.width - bounds.width - clearancePx));
  nextY = clamp(nextY, panel.y + clearancePx, Math.max(panel.y + clearancePx, panel.y + panel.height - bounds.height - clearancePx));

  return {
    minEdgeDeltaPx: Math.min(...grazingGaps.map((g) => Math.abs(g))),
    nudged: { x: nextX, y: nextY, width: bounds.width, height: bounds.height },
  };
}

function detectSiblingBalloonTangent(
  target: CriticRect2D,
  sibling: CriticRect2D,
  panel: CriticRect2D,
  epsilonPx: number,
  clearancePx: number,
): { minEdgeDeltaPx: number; nudged: CriticRect2D } | null {
  const horizOverlap = Math.min(target.x + target.width, sibling.x + sibling.width) - Math.max(target.x, sibling.x) > 0;
  const vertOverlap = Math.min(target.y + target.height, sibling.y + sibling.height) - Math.max(target.y, sibling.y) > 0;
  if (vertOverlap && Math.abs(target.x - (sibling.x + sibling.width)) <= epsilonPx) {
    const shiftedX = Math.min(panel.x + panel.width - target.width - clearancePx, sibling.x + sibling.width + clearancePx);
    return { minEdgeDeltaPx: Math.abs(target.x - (sibling.x + sibling.width)), nudged: { ...target, x: shiftedX } };
  }
  if (horizOverlap && Math.abs(target.y - (sibling.y + sibling.height)) <= epsilonPx) {
    const shiftedY = Math.min(panel.y + panel.height - target.height - clearancePx, sibling.y + sibling.height + clearancePx);
    return { minEdgeDeltaPx: Math.abs(target.y - (sibling.y + sibling.height)), nudged: { ...target, y: shiftedY } };
  }
  return null;
}

function evaluateSpeakerTail(
  cut: EpisodeCutAuditTarget,
  balloon: CutSpeechBalloon,
  maxTailDist: number,
): { reason: SpeakerTailMismatchReason; measuredDist: number; suggestedTip: CriticPoint2D; suggestedStyle: "pointed" | "occluded-indicator"; selfVerified: boolean } | null {
  const speaker = cut.characters.find((c) => c.characterId === balloon.attributedSpeakerId);
  if (!speaker) {
    return {
      reason: "missing-speaker",
      measuredDist: maxTailDist + 100,
      suggestedTip: balloon.tailTip,
      suggestedStyle: "pointed",
      selfVerified: false,
    };
  }
  const measuredDist = Math.hypot(balloon.tailTip.x - speaker.mouthPosition.x, balloon.tailTip.y - speaker.mouthPosition.y);
  const closerOther = cut.characters.some(
    (other) => other.characterId !== speaker.characterId
      && Math.hypot(balloon.tailTip.x - other.mouthPosition.x, balloon.tailTip.y - other.mouthPosition.y) + 24 < measuredDist,
  );
  const occludedByFg = (speaker.occluded === true && balloon.tailStyle !== "occluded-indicator")
    || cut.characters.some(
      (other) => other.characterId !== speaker.characterId && other.zOrder > speaker.zOrder
        && (pointInsideRect(balloon.tailTip, other.bodyBounds) || segmentIntersectsRect(balloon.tailTip, speaker.mouthPosition, other.bodyBounds)),
    );

  const reason: SpeakerTailMismatchReason | null = occludedByFg
    ? "foreground-occluded"
    : closerOther
      ? "closer-to-other-character"
      : measuredDist > maxTailDist
        ? "excessive-distance"
        : null;
  if (!reason) return null;

  const centerX = balloon.bounds.x + balloon.bounds.width * 0.5;
  const centerY = balloon.bounds.y + balloon.bounds.height * 0.5;
  const dx = centerX - speaker.mouthPosition.x;
  const dy = centerY - speaker.mouthPosition.y;
  const norm = Math.hypot(dx, dy) || 1;
  const offsetPx = Math.min(28, Math.max(12, maxTailDist * 0.2));
  const suggestedTip = {
    x: Math.round((speaker.mouthPosition.x + (dx / norm) * offsetPx) * 100) / 100,
    y: Math.round((speaker.mouthPosition.y + (dy / norm) * offsetPx) * 100) / 100,
  };
  return {
    reason,
    measuredDist,
    suggestedTip,
    suggestedStyle: reason === "foreground-occluded" ? "occluded-indicator" : "pointed",
    selfVerified: Math.hypot(suggestedTip.x - speaker.mouthPosition.x, suggestedTip.y - speaker.mouthPosition.y) <= maxTailDist,
  };
}

/** 에피소드 컷 목록을 순수 검사해 4대 품질 결함과 우선순위가 매겨진 비파괴 복구 패치를 방출한다. */
export function auditEpisodeCutQuality(
  cuts: readonly EpisodeCutAuditTarget[],
  options: EpisodeCriticAuditOptions = {},
): EpisodeCriticAuditReport {
  const maxTailDist = options.maxSpeakerTailDistancePx ?? DEFAULT_MAX_SPEAKER_TAIL_DISTANCE_PX;
  const minContrast = options.minTextContrastRatio ?? MIN_WCAG_AA_TEXT_CONTRAST_RATIO;
  const tangentEps = options.tangentCollisionEpsilonPx ?? DEFAULT_TANGENT_COLLISION_EPSILON_PX;
  const safeClearance = options.safeTangentClearancePx ?? DEFAULT_SAFE_TANGENT_CLEARANCE_PX;

  const findings: CriticQualityFinding[] = [];
  const unrankedPatches: Omit<NonDestructiveRepairPatch, "priorityRank">[] = [];
  const flaggedCutSet = new Set<string>();

  const emitIssue = (
    cut: EpisodeCutAuditTarget,
    suffix: string,
    kind: EpisodeCriticIssueKind,
    severity: CriticSeverity,
    targetId: string,
    summaryKo: string,
    measuredValue: number,
    thresholdValue: number,
    priorityScore: number,
    selfVerified: boolean,
    descriptionKo: string,
    operation: RepairPatchOperation,
  ) => {
    const findingId = `finding-${cut.cutId}-${suffix}`;
    flaggedCutSet.add(cut.cutId);
    findings.push({ findingId, cutId: cut.cutId, cutOrder: cut.cutOrder, kind, severity, targetId, summaryKo, measuredValue, thresholdValue });
    unrankedPatches.push({
      patchId: `patch-${cut.cutId}-${suffix}`, findingId, cutId: cut.cutId, cutOrder: cut.cutOrder,
      issueKind: kind, priorityScore, approvalState: "pending", selfVerified, descriptionKo, operation,
    });
  };

  const pushTangentIssue = (
    cut: EpisodeCutAuditTarget,
    surface: "balloon" | "element",
    targetId: string,
    label: string,
    collision: { minEdgeDeltaPx: number; nudged: CriticRect2D },
    basePriority: number,
  ) => {
    const recheck = detectPanelEdgeTangent(collision.nudged, cut.panelBounds, tangentEps, safeClearance);
    emitIssue(
      cut, `tangent-${surface}-${targetId}`, "panel-tangent-collision", "advisory", targetId,
      `${label} 외곽선이 경계와 ${collision.minEdgeDeltaPx.toFixed(1)}px 간격으로 접선 충돌합니다.`,
      collision.minEdgeDeltaPx, tangentEps, basePriority + (tangentEps - collision.minEdgeDeltaPx),
      recheck === null, `${label} 여백을 ${safeClearance}px 확보해 접선 충돌 해소`,
      { opKind: "nudge-tangent-clearance", targetSurface: surface, targetId, suggestedBounds: collision.nudged },
    );
  };

  for (const cut of cuts) {
    const pixelFills = cut.celRasterGrid ? scanRasterSliverHalos(cut.celRasterGrid) : [];
    const sliverSeams = (cut.celBoundarySeams ?? []).filter(
      (s) => s.hasInkBoundary && s.uncoloredGapWidthPx >= MIN_SLIVER_HALO_WIDTH_PX && s.uncoloredGapWidthPx <= MAX_SLIVER_HALO_WIDTH_PX && s.adjacentFillRegionId > 0,
    );
    if (pixelFills.length > 0 || sliverSeams.length > 0) {
      const defectCount = pixelFills.length + sliverSeams.length;
      emitIssue(
        cut, "sliver-halo", "sliver-halo", "warning", `${cut.cutId}:cel-layer`,
        `선화·셀 경계에서 1~2px 미채색 실틈 ${defectCount}곳이 검출되었습니다.`,
        defectCount, 0, 65 + Math.min(25, defectCount * 2), true,
        `인접 셀 밑색 확장으로 1~2px 실틈 ${defectCount}곳 메우기`,
        { opKind: "dilate-sliver-halo", seamIds: sliverSeams.map((s) => s.seamId), pixelFills },
      );
    }

    for (let i = 0; i < cut.balloons.length; i += 1) {
      const balloon = cut.balloons[i];
      if (!balloon) continue;
      const tailIssue = evaluateSpeakerTail(cut, balloon, maxTailDist);
      if (tailIssue) {
        emitIssue(
          cut, `tail-${balloon.balloonId}`, "speaker-tail-mismatch",
          tailIssue.reason === "missing-speaker" ? "critical" : "warning", balloon.balloonId,
          `말풍선(${balloon.balloonId}) 꼬리가 화자 위치·차폐 상태와 어긋납니다(${tailIssue.reason}).`,
          tailIssue.measuredDist, maxTailDist, tailIssue.reason === "missing-speaker" ? 95 : 78,
          tailIssue.selfVerified, `말풍선(${balloon.balloonId}) 꼬리를 화자 입 기준 안전 지점으로 재정렬`,
          {
            opKind: "retarget-speaker-tail", balloonId: balloon.balloonId,
            suggestedTailTip: tailIssue.suggestedTip, suggestedTailStyle: tailIssue.suggestedStyle, mismatchReason: tailIssue.reason,
          },
        );
      }

      const contrastRatio = computeWcagContrastRatio(balloon.textSrgb, balloon.fillSrgb);
      if (contrastRatio < minContrast) {
        const suggestedTextSrgb = solveAccessibleTextColor(balloon.textSrgb, balloon.fillSrgb, minContrast);
        const projectedContrastRatio = computeWcagContrastRatio(suggestedTextSrgb, balloon.fillSrgb);
        emitIssue(
          cut, `contrast-${balloon.balloonId}`, "low-text-contrast", contrastRatio < 3 ? "critical" : "warning",
          balloon.balloonId, `말풍선(${balloon.balloonId}) 대사 명도 대비비(${contrastRatio.toFixed(2)}:1)가 기준(${minContrast}:1) 미만입니다.`,
          contrastRatio, minContrast, 100 + (minContrast - contrastRatio) * 8, projectedContrastRatio >= minContrast,
          `말풍선(${balloon.balloonId}) 대사 색상을 대비비 ${projectedContrastRatio.toFixed(2)}:1로 보정`,
          { opKind: "rebalance-text-contrast", balloonId: balloon.balloonId, suggestedTextSrgb, projectedContrastRatio },
        );
      }

      let collision = detectPanelEdgeTangent(balloon.bounds, cut.panelBounds, tangentEps, safeClearance);
      if (!collision) {
        for (let j = 0; j < i; j += 1) {
          const prevBalloon = cut.balloons[j];
          if (!prevBalloon) continue;
          collision = detectSiblingBalloonTangent(balloon.bounds, prevBalloon.bounds, cut.panelBounds, tangentEps, safeClearance);
          if (collision) break;
        }
      }
      if (collision) pushTangentIssue(cut, "balloon", balloon.balloonId, `말풍선(${balloon.balloonId})`, collision, 50);
    }

    for (const elem of cut.foregroundElements ?? []) {
      if (elem.intentionalBleed === true) continue;
      const collision = detectPanelEdgeTangent(elem.bounds, cut.panelBounds, tangentEps, safeClearance);
      if (collision) pushTangentIssue(cut, "element", elem.elementId, `전경 요소(${elem.labelKo})`, collision, 48);
    }
  }

  unrankedPatches.sort((a, b) => b.priorityScore - a.priorityScore || a.cutOrder - b.cutOrder || a.patchId.localeCompare(b.patchId));

  return {
    findings,
    repairPatches: unrankedPatches.map((patch, idx) => ({ ...patch, priorityRank: idx + 1 })),
    cleanCutIds: cuts.filter((c) => !flaggedCutSet.has(c.cutId)).map((c) => c.cutId),
    flaggedCutIds: cuts.filter((c) => flaggedCutSet.has(c.cutId)).map((c) => c.cutId),
  };
}

/** 작가의 수락(`accepted`)·거절(`rejected`) 결정을 복구 패치 목록에 결정론적·불변으로 반영한다. */
export function transitionRepairPatchApproval(
  patches: readonly NonDestructiveRepairPatch[],
  decisions: readonly ArtistPatchDecisionInput[],
): readonly NonDestructiveRepairPatch[] {
  const decisionMap = new Map(decisions.map((d) => [d.patchId, d] as const));
  return patches.map((patch) => {
    const matched = decisionMap.get(patch.patchId);
    if (!matched) return patch;
    return { ...patch, approvalState: matched.decision, decidedByAuthorId: matched.authorId, decisionNoteKo: matched.noteKo };
  });
}

/** 승인(`accepted`)되고 자기 검증을 통과한 복구 패치만 새 컷 스냅샷에 적용하며 미승인 컷은 변경하지 않는다. */
export function applyApprovedRepairPatches(
  cuts: readonly EpisodeCutAuditTarget[],
  patches: readonly NonDestructiveRepairPatch[],
  decisions: readonly ArtistPatchDecisionInput[] = [],
  auditOptions: EpisodeCriticAuditOptions = {},
): ApplyApprovedPatchesResult {
  const updatedPatches = transitionRepairPatchApproval(patches, decisions);
  const acceptedByCut = new Map<string, NonDestructiveRepairPatch[]>();
  const appliedPatchIds: string[] = [];
  const skippedPatchIds: string[] = [];

  for (const patch of updatedPatches) {
    if (patch.approvalState === "accepted" && patch.selfVerified) {
      const list = acceptedByCut.get(patch.cutId) ?? [];
      list.push(patch);
      acceptedByCut.set(patch.cutId, list);
      appliedPatchIds.push(patch.patchId);
    } else {
      skippedPatchIds.push(patch.patchId);
    }
  }

  const mutatedCutIds: string[] = [];
  const nextCuts: EpisodeCutAuditTarget[] = cuts.map((cut) => {
    const cutPatches = acceptedByCut.get(cut.cutId);
    if (!cutPatches || cutPatches.length === 0) return cut;

    mutatedCutIds.push(cut.cutId);
    let nextRaster = cut.celRasterGrid
      ? { width: cut.celRasterGrid.width, height: cut.celRasterGrid.height, inkMask: cut.celRasterGrid.inkMask.slice(), fillRegionIds: [...cut.celRasterGrid.fillRegionIds] }
      : undefined;
    let nextSeams = cut.celBoundarySeams ? cut.celBoundarySeams.map((s) => ({ ...s })) : undefined;
    let nextBalloons = cut.balloons.map((b) => ({ ...b }));
    let nextElements = cut.foregroundElements ? cut.foregroundElements.map((el) => ({ ...el })) : undefined;

    for (const { operation: op } of cutPatches) {
      if (op.opKind === "dilate-sliver-halo") {
        if (nextRaster && op.pixelFills.length > 0) {
          const fills = [...nextRaster.fillRegionIds];
          for (const f of op.pixelFills) {
            if (f.pixelIndex >= 0 && f.pixelIndex < fills.length) fills[f.pixelIndex] = f.fillRegionId;
          }
          nextRaster = { ...nextRaster, fillRegionIds: fills };
        }
        if (nextSeams && op.seamIds.length > 0) {
          const seamSet = new Set(op.seamIds);
          nextSeams = nextSeams.map((s) => (seamSet.has(s.seamId) ? { ...s, uncoloredGapWidthPx: 0 } : s));
        }
      } else if (op.opKind === "retarget-speaker-tail") {
        nextBalloons = nextBalloons.map((b) => (b.balloonId === op.balloonId ? { ...b, tailTip: op.suggestedTailTip, tailStyle: op.suggestedTailStyle } : b));
      } else if (op.opKind === "rebalance-text-contrast") {
        nextBalloons = nextBalloons.map((b) => (b.balloonId === op.balloonId ? { ...b, textSrgb: op.suggestedTextSrgb } : b));
      } else if (op.targetSurface === "balloon") {
        nextBalloons = nextBalloons.map((b) => (b.balloonId === op.targetId ? { ...b, bounds: op.suggestedBounds } : b));
      } else if (nextElements) {
        nextElements = nextElements.map((el) => (el.elementId === op.targetId ? { ...el, bounds: op.suggestedBounds } : el));
      }
    }

    return { ...cut, celRasterGrid: nextRaster, celBoundarySeams: nextSeams, balloons: nextBalloons, foregroundElements: nextElements };
  });

  return {
    cuts: nextCuts,
    updatedPatches,
    appliedPatchIds,
    skippedPatchIds,
    mutatedCutIds,
    postRepairFindingCount: auditEpisodeCutQuality(nextCuts, auditOptions).findings.length,
  };
}
