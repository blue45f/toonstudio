/**
 * Wave 51: 반응형 에피소드 전파 미리보기 요약·선택적 부분 커밋·즉시 원복(Revert Token) 관리기.
 *
 * - 패치 플랜 적용 전에 컷별 영향 레이어 수, OKLCH ΔE 색차, 예상 렌더링 ms,
 *   수동 잠금 충돌 건수, 색채 대비 자동 보정 건수를 한눈에 요약한다.
 * - 작가가 선택한 컷만 부분 커밋하고, 변경 직전 레이어 스냅샷을 `PropagationRevertToken`으로
 *   보관해 원클릭 즉시 원복을 보장한다.
 */

import type {
  Bg3dLayerLightingState,
  CutLayerNode,
  EpisodeSceneDependencyDag,
  OklchColor,
  SpeechBubbleToneState,
} from "./episode-scene-dependency-dag";
import {
  computeOklchDeltaE,
  toggleCutSelectionInPlan,
  type CutPropagationPatch,
  type PropagationPatchPlan,
} from "./cross-cut-palette-lighting-propagator";

export type PropagationDeltaSeverity = "none" | "subtle" | "moderate" | "dramatic";

export interface CutPropagationDiffSummary {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly selected: boolean;
  readonly excludedByUser: boolean;
  readonly affectedLayerCount: number;
  readonly maxDeltaEOklch: number;
  readonly meanDeltaEOklch: number;
  readonly estimatedRenderMs: number;
  readonly pinnedConflictCount: number;
  readonly contrastCorrectionCount: number;
  readonly severity: PropagationDeltaSeverity;
  readonly headlineKo: string;
}

export interface PropagationPreviewSummary {
  readonly planId: string;
  readonly sceneId: string;
  readonly sourceCutId: string;
  readonly totalCandidateCuts: number;
  readonly selectedCutCount: number;
  readonly excludedCutCount: number;
  readonly totalAffectedLayerCount: number;
  readonly overallMaxDeltaEOklch: number;
  readonly overallMeanDeltaEOklch: number;
  readonly totalEstimatedRenderMs: number;
  readonly totalPinnedConflictCount: number;
  readonly totalContrastCorrectionCount: number;
  readonly isolatedOtherSceneCutCount: number;
  readonly cutSummaries: readonly CutPropagationDiffSummary[];
  readonly summaryBannerKo: string;
}

export interface LayerPreCommitSnapshot {
  readonly nodeId: string;
  readonly cutId: string;
  readonly layerId: string;
  readonly colorOklch: OklchColor;
  readonly shadowAngleDeg?: number;
  readonly bg3dLighting?: Bg3dLayerLightingState;
  readonly speechBubbleTone?: SpeechBubbleToneState;
}

export interface PropagationRevertToken {
  readonly revertTokenId: string;
  readonly planId: string;
  readonly sceneId: string;
  readonly sourceCutId: string;
  readonly committedAtIso: string;
  readonly appliedCutIds: readonly string[];
  readonly skippedCutIds: readonly string[];
  readonly appliedLayerCount: number;
  readonly layerSnapshots: readonly LayerPreCommitSnapshot[];
  readonly reverted: boolean;
  readonly revertedAtIso?: string;
}

export interface PartialCommitOptions {
  /** 지정 시 이 목록에 포함된 컷만 커밋한다. */
  readonly selectedCutIds?: readonly string[];
  /** 지정 시 이 목록의 컷을 커밋에서 제외한다. */
  readonly excludeCutIds?: readonly string[];
  readonly committedAtIso?: string;
}

export interface PropagationCommitResult {
  readonly ok: boolean;
  readonly revertToken: PropagationRevertToken | null;
  readonly appliedCutIds: readonly string[];
  readonly skippedCutIds: readonly string[];
  readonly appliedLayerCount: number;
  readonly preservedPinnedCount: number;
  readonly messageKo: string;
}

export interface PropagationRevertResult {
  readonly ok: boolean;
  readonly revertTokenId: string;
  readonly restoredCutIds: readonly string[];
  readonly restoredLayerCount: number;
  readonly verifiedZeroResidualDelta: boolean;
  readonly messageKo: string;
}

function classifySeverity(maxDeltaE: number, layerCount: number): PropagationDeltaSeverity {
  if (layerCount === 0 || maxDeltaE < 0.01) return "none";
  if (maxDeltaE < 3.5) return "subtle";
  if (maxDeltaE < 12) return "moderate";
  return "dramatic";
}

function buildCutHeadlineKo(cut: CutPropagationPatch): string {
  const prefix = `컷 ${cut.cutIndex}`;
  if (cut.excludedByUser) {
    return `${prefix} · 작가 선택으로 전파 제외 (후보 레이어 ${cut.layerPatches.length}개)`;
  }
  if (cut.layerPatches.length === 0 && cut.skippedPinnedLayers.length > 0) {
    return `${prefix} · 수동 잠금 ${cut.skippedPinnedLayers.length}건 보호 (변경 없음)`;
  }
  const parts: string[] = [
    `레이어 ${cut.layerPatches.length}개 변경`,
    `OKLCH ΔE 최대 ${cut.maxDeltaEOklch}`,
    `예상 ${cut.estimatedRenderMs}ms`,
  ];
  if (cut.skippedPinnedLayers.length > 0) {
    parts.push(`잠금 보호 ${cut.skippedPinnedLayers.length}건`);
  }
  if (cut.contrastCorrectionCount > 0) {
    parts.push(`대비 보정 ${cut.contrastCorrectionCount}건`);
  }
  return `${prefix} · ${parts.join(" · ")}`;
}

/**
 * 전파 패치 플랜으로부터 컷별 변경 요약과 씬 전체 예상 비용을 산출한다.
 */
export function buildPropagationPreviewSummary(
  plan: PropagationPatchPlan,
): PropagationPreviewSummary {
  const cutSummaries: CutPropagationDiffSummary[] = plan.cutPatches.map((cut) => ({
    cutId: cut.cutId,
    cutIndex: cut.cutIndex,
    selected: cut.selected,
    excludedByUser: cut.excludedByUser,
    affectedLayerCount: cut.selected ? cut.layerPatches.length : 0,
    maxDeltaEOklch: cut.selected ? cut.maxDeltaEOklch : 0,
    meanDeltaEOklch: cut.selected ? cut.meanDeltaEOklch : 0,
    estimatedRenderMs: cut.selected ? cut.estimatedRenderMs : 0,
    pinnedConflictCount: cut.skippedPinnedLayers.length,
    contrastCorrectionCount: cut.selected ? cut.contrastCorrectionCount : 0,
    severity: cut.selected
      ? classifySeverity(cut.maxDeltaEOklch, cut.layerPatches.length)
      : "none",
    headlineKo: buildCutHeadlineKo(cut),
  }));

  const selectedCuts = plan.cutPatches.filter((cut) => cut.selected);
  const selectedLayerPatches = selectedCuts.flatMap((cut) => cut.layerPatches);
  const totalAffectedLayerCount = selectedLayerPatches.length;
  const overallMaxDeltaEOklch =
    selectedLayerPatches.length > 0
      ? Math.max(...selectedLayerPatches.map((p) => p.deltaEOklch))
      : 0;
  const overallMeanDeltaEOklch =
    selectedLayerPatches.length > 0
      ? Math.round(
          (selectedLayerPatches.reduce((sum, p) => sum + p.deltaEOklch, 0) /
            selectedLayerPatches.length) *
            100,
        ) / 100
      : 0;
  const totalEstimatedRenderMs =
    Math.round(selectedCuts.reduce((sum, c) => sum + c.estimatedRenderMs, 0) * 100) / 100;
  const totalContrastCorrectionCount = selectedCuts.reduce(
    (sum, c) => sum + c.contrastCorrectionCount,
    0,
  );
  const excludedCutCount = plan.cutPatches.filter((cut) => !cut.selected).length;

  const summaryBannerKo =
    selectedCuts.length === 0
      ? `적용 대상 컷이 없습니다 (잠금 보호 ${plan.totalPinnedConflictCount}건, 타 씬 격리 ${plan.isolatedOtherSceneCutIds.length}컷).`
      : `${selectedCuts.length}개 컷 · 레이어 ${totalAffectedLayerCount}개 전파 예정 (최대 ΔE ${overallMaxDeltaEOklch}, 예상 ${totalEstimatedRenderMs}ms, 잠금 보호 ${plan.totalPinnedConflictCount}건)`;

  return {
    planId: plan.planId,
    sceneId: plan.sceneId,
    sourceCutId: plan.sourceCutId,
    totalCandidateCuts: plan.cutPatches.length,
    selectedCutCount: selectedCuts.length,
    excludedCutCount,
    totalAffectedLayerCount,
    overallMaxDeltaEOklch,
    overallMeanDeltaEOklch,
    totalEstimatedRenderMs,
    totalPinnedConflictCount: plan.totalPinnedConflictCount,
    totalContrastCorrectionCount,
    isolatedOtherSceneCutCount: plan.isolatedOtherSceneCutIds.length,
    cutSummaries,
    summaryBannerKo,
  };
}

/** 선택 컷 목록을 기준으로 플랜을 필터링해 부분 적용 미리보기 요약을 즉시 계산한다. */
export function previewPartialCutSelection(
  plan: PropagationPatchPlan,
  selectedCutIds: readonly string[],
): PropagationPreviewSummary {
  const allowSet = new Set(selectedCutIds);
  let nextPlan = plan;
  for (const cut of plan.cutPatches) {
    nextPlan = toggleCutSelectionInPlan(nextPlan, cut.cutId, allowSet.has(cut.cutId));
  }
  return buildPropagationPreviewSummary(nextPlan);
}

function cloneOklch(color: OklchColor): OklchColor {
  return { l: color.l, c: color.c, hDeg: color.hDeg };
}

function cloneBg3d(state: Bg3dLayerLightingState | undefined): Bg3dLayerLightingState | undefined {
  if (!state) return undefined;
  return {
    ...state,
    fogTintOklch: cloneOklch(state.fogTintOklch),
  };
}

function cloneBubble(state: SpeechBubbleToneState | undefined): SpeechBubbleToneState | undefined {
  if (!state) return undefined;
  return {
    fillOklch: cloneOklch(state.fillOklch),
    borderOklch: cloneOklch(state.borderOklch),
    inkOklch: cloneOklch(state.inkOklch),
  };
}

/**
 * 선택적 부분 커밋과 즉시 원복 토큰(`PropagationRevertToken`) 수명주기를 관리한다.
 */
export class ReactivePropagationCommitManager {
  private readonly tokens = new Map<string, PropagationRevertToken>();
  private sequence = 0;

  commitPlan(
    dag: EpisodeSceneDependencyDag,
    plan: PropagationPatchPlan,
    options: PartialCommitOptions = {},
  ): PropagationCommitResult {
    const allowSet = options.selectedCutIds ? new Set(options.selectedCutIds) : null;
    const excludeSet = new Set(options.excludeCutIds ?? []);

    const appliedCutIds: string[] = [];
    const skippedCutIds: string[] = [];
    const snapshots: LayerPreCommitSnapshot[] = [];

    for (const cut of plan.cutPatches) {
      const shouldApply =
        cut.selected &&
        !excludeSet.has(cut.cutId) &&
        (allowSet === null || allowSet.has(cut.cutId));

      if (!shouldApply || cut.layerPatches.length === 0) {
        skippedCutIds.push(cut.cutId);
        continue;
      }

      let appliedInCut = 0;
      for (const patch of cut.layerPatches) {
        const node = dag.getNode(patch.nodeId);
        if (!node || node.kind !== "cut-layer" || node.pinnedByArtist) continue;

        snapshots.push({
          nodeId: node.nodeId,
          cutId: node.cutId,
          layerId: node.layerId,
          colorOklch: cloneOklch(node.colorOklch),
          shadowAngleDeg: node.shadowAngleDeg,
          bg3dLighting: cloneBg3d(node.bg3dLighting),
          speechBubbleTone: cloneBubble(node.speechBubbleTone),
        });

        const updatedNode: CutLayerNode = {
          ...node,
          colorOklch: cloneOklch(patch.afterColorOklch),
          shadowAngleDeg: patch.afterShadowAngleDeg,
          bg3dLighting: cloneBg3d(patch.afterBg3dLighting),
          speechBubbleTone: cloneBubble(patch.afterSpeechBubbleTone),
        };
        dag.updateNode(updatedNode);
        appliedInCut += 1;
      }

      if (appliedInCut > 0) {
        appliedCutIds.push(cut.cutId);
      } else {
        skippedCutIds.push(cut.cutId);
      }
    }

    if (snapshots.length === 0) {
      return {
        ok: false,
        revertToken: null,
        appliedCutIds: [],
        skippedCutIds,
        appliedLayerCount: 0,
        preservedPinnedCount: plan.totalPinnedConflictCount,
        messageKo: "커밋할 수 있는 미잠금 선택 레이어가 없어 변경을 적용하지 않았습니다.",
      };
    }

    this.sequence += 1;
    const revertTokenId = `revert-${plan.planId}-${String(this.sequence).padStart(3, "0")}`;
    const token: PropagationRevertToken = {
      revertTokenId,
      planId: plan.planId,
      sceneId: plan.sceneId,
      sourceCutId: plan.sourceCutId,
      committedAtIso: options.committedAtIso ?? "2026-11-27T00:00:00.000Z",
      appliedCutIds,
      skippedCutIds,
      appliedLayerCount: snapshots.length,
      layerSnapshots: snapshots,
      reverted: false,
    };
    this.tokens.set(revertTokenId, token);

    return {
      ok: true,
      revertToken: token,
      appliedCutIds,
      skippedCutIds,
      appliedLayerCount: snapshots.length,
      preservedPinnedCount: plan.totalPinnedConflictCount,
      messageKo: `${appliedCutIds.length}개 컷(레이어 ${snapshots.length}개)에 전파를 반영했습니다. 원복 토큰: ${revertTokenId}`,
    };
  }

  revertCommit(
    dag: EpisodeSceneDependencyDag,
    revertTokenId: string,
    revertedAtIso = "2026-11-27T00:00:01.000Z",
  ): PropagationRevertResult {
    const token = this.tokens.get(revertTokenId);
    if (!token) {
      return {
        ok: false,
        revertTokenId,
        restoredCutIds: [],
        restoredLayerCount: 0,
        verifiedZeroResidualDelta: false,
        messageKo: `원복 토큰을 찾을 수 없습니다: ${revertTokenId}`,
      };
    }
    if (token.reverted) {
      return {
        ok: false,
        revertTokenId,
        restoredCutIds: [],
        restoredLayerCount: 0,
        verifiedZeroResidualDelta: false,
        messageKo: `이미 원복이 완료된 토큰입니다: ${revertTokenId}`,
      };
    }

    const restoredCuts = new Set<string>();
    let restoredLayers = 0;
    let maxResidualDelta = 0;

    for (const snap of token.layerSnapshots) {
      const current = dag.getNode(snap.nodeId);
      if (!current || current.kind !== "cut-layer") continue;
      const restoredNode: CutLayerNode = {
        ...current,
        colorOklch: cloneOklch(snap.colorOklch),
        shadowAngleDeg: snap.shadowAngleDeg,
        bg3dLighting: cloneBg3d(snap.bg3dLighting),
        speechBubbleTone: cloneBubble(snap.speechBubbleTone),
      };
      dag.updateNode(restoredNode);

      const verified = dag.getNode(snap.nodeId);
      if (verified && verified.kind === "cut-layer") {
        maxResidualDelta = Math.max(
          maxResidualDelta,
          computeOklchDeltaE(verified.colorOklch, snap.colorOklch),
        );
      }
      restoredCuts.add(snap.cutId);
      restoredLayers += 1;
    }

    this.tokens.set(revertTokenId, {
      ...token,
      reverted: true,
      revertedAtIso,
    });

    const restoredCutIds = [...restoredCuts];
    return {
      ok: true,
      revertTokenId,
      restoredCutIds,
      restoredLayerCount: restoredLayers,
      verifiedZeroResidualDelta: maxResidualDelta === 0,
      messageKo: `${restoredCutIds.length}개 컷(레이어 ${restoredLayers}개)을 커밋 직전 상태로 즉시 되돌렸습니다.`,
    };
  }

  getRevertToken(revertTokenId: string): PropagationRevertToken | undefined {
    return this.tokens.get(revertTokenId);
  }

  listCommitHistory(): readonly PropagationRevertToken[] {
    return [...this.tokens.values()];
  }
}
