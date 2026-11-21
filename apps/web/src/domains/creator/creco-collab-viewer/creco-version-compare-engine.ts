/**
 * CRECO++ 클린룸 협업 엔진 (파트 1):
 * 1) 5계층 불변 버전 트리 · 1클릭 불변 버전 커밋 · 2단계 마감 승인 · 단일 공유 링크 자동 포인팅
 * 2) 탭 전환 없는 최대 4열 다중 공정 동시 동기 스크롤 비교 · 가로 오버뷰 · 0~100% 와이프 핸들
 * 3) 세로 스크롤 뷰어 핀 · 벡터 드로잉 레드라인 피드백 · 0.1초 ToonStudio 캔버스 레이어 직결 점프
 */

import { buildStageArtifacts, createInitialCrecoWorkspaceState } from "./creco-version-compare-fixtures";
import {
  CRECO_STAGE_CATALOG,
  clampNumber,
  computeDeterministicDigest,
  getStageMeta,
  type AddPinRedlineFeedbackInput,
  type ApproveAndCloseStageInput,
  type CommitImmutableVersionInput,
  type CompareLayoutMode,
  type CompareSlotRef,
  type CompareSyncMode,
  type CrecoCollabWorkspaceState,
  type CrecoContributorShare,
  type CrecoCutChangeBadge,
  type CrecoImmutableVersion,
  type CrecoPinFeedback,
  type CrecoProjectTree,
  type CrecoStageId,
  type CrecoStageNode,
  type FeedbackImportance,
  type FeedbackStatus,
  type RedlinePoint,
  type RedlineTone,
  type ResolvedCanonicalShare,
  type SyncMultiStageCompareState,
  type ToonStudioCanvasJumpPayload,
  type VersionDiffSummary,
} from "./creco-version-compare-types";

export {
  CRECO_STAGE_CATALOG,
  createInitialCrecoWorkspaceState,
  getStageMeta,
  type CompareLayoutMode,
  type CompareSyncMode,
  type CrecoCollabWorkspaceState,
  type CrecoPinFeedback,
  type CrecoStageId,
  type FeedbackImportance,
  type FeedbackStatus,
  type RedlinePoint,
  type RedlineTone,
  type ToonStudioCanvasJumpPayload,
  type VersionDiffSummary,
};

export function findStageAndVersion(
  tree: CrecoProjectTree,
  stageId: CrecoStageId,
  versionId?: string,
): {
  readonly stage: CrecoStageNode | null;
  readonly version: CrecoImmutableVersion | null;
} {
  const stage = tree.episode.stages.find((item) => item.stageId === stageId) ?? null;
  if (!stage) return { stage: null, version: null };
  const targetId = versionId ?? stage.activeVersionId;
  const version =
    stage.versions.find((item) => item.versionId === targetId) ??
    stage.versions[stage.versions.length - 1] ??
    null;
  return { stage, version };
}

export function commitImmutableVersion(
  state: CrecoCollabWorkspaceState,
  input: CommitImmutableVersionInput,
): {
  readonly nextState: CrecoCollabWorkspaceState;
  readonly createdVersion: CrecoImmutableVersion;
} {
  const stage = state.tree.episode.stages.find((item) => item.stageId === input.stageId);
  if (!stage) {
    throw new Error(`알 수 없는 공정입니다: ${input.stageId}`);
  }
  const previous = stage.versions[stage.versions.length - 1] ?? null;
  const nextNumber = (previous?.versionNumber ?? 0) + 1;
  const meta = getStageMeta(input.stageId);
  const updatedSet = new Set(input.updatedCutIndices ?? [state.compare.activeCutIndex]);
  const createdAtIso = input.createdAtIso ?? "2026-11-21T18:00:00Z";
  const summaryText = input.summary.trim() || `${meta.shortLabel} ${nextNumber}차 불변 스냅샷`;

  const baseArtifacts = previous
    ? previous.artifacts.map((artifact) => {
        const changed = updatedSet.has(artifact.cutIndex);
        return {
          ...artifact,
          fileSizeKb: changed ? artifact.fileSizeKb + 24 : artifact.fileSizeKb,
          digest: changed
            ? computeDeterministicDigest(
                `${input.stageId}:v${nextNumber}:c${artifact.cutIndex}:${summaryText}`,
              )
            : artifact.digest,
          changeBadge: (changed ? "updated" : "unchanged") as CrecoCutChangeBadge,
        };
      })
    : [...buildStageArtifacts(input.stageId, nextNumber, [...updatedSet])];

  if (input.addedCutTitle?.trim()) {
    const newIndex = baseArtifacts.length;
    baseArtifacts.push({
      cutIndex: newIndex,
      cutId: `${input.stageId}-cut-${newIndex + 1}`,
      title: input.addedCutTitle.trim(),
      widthPx: 800,
      heightPx: Math.round(1400 * meta.heightScale),
      layerId: `${meta.defaultLayerId}-c${newIndex + 1}`,
      layerName: `${meta.defaultLayerName}_컷${newIndex + 1}`,
      fileSizeKb: 512,
      digest: computeDeterministicDigest(`${input.stageId}:v${nextNumber}:new:${newIndex}`),
      changeBadge: "new",
      dialogueSummary: "신규 추가 컷",
      moodSurfaceOklch: "oklch(0.92 0.025 230)",
      keyFocalOklch: meta.accentOklch,
    });
  }

  const approved = input.markApproved ?? false;
  const createdVersion: CrecoImmutableVersion = {
    versionId: `${input.stageId}-v${nextNumber}`,
    versionNumber: nextNumber,
    label: `${meta.shortLabel} ${nextNumber}차`,
    stageId: input.stageId,
    parentVersionId: previous ? previous.versionId : null,
    createdAtIso,
    authorName: input.authorName,
    summary: summaryText,
    workMinutes: Math.max(1, Math.round(input.workMinutes)),
    visibility: input.visibility ?? "public",
    lifecycle: approved ? "stage-closed" : "work-done",
    approved,
    digest: computeDeterministicDigest(`${input.stageId}:v${nextNumber}:${createdAtIso}`),
    artifacts: baseArtifacts,
    contributors: [{ name: input.authorName, sharePct: 100 }],
  };

  // 이전 버전 배열은 100% 보존하고 새 불변 버전만 추가한다.
  const nextStages = state.tree.episode.stages.map((item) => {
    if (item.stageId !== input.stageId) return item;
    return {
      ...item,
      versions: [...item.versions, createdVersion],
      activeVersionId: createdVersion.versionId,
      latestApprovedVersionId: approved ? createdVersion.versionId : item.latestApprovedVersionId,
    };
  });

  const nextSlots = state.compare.slots.map((slot) =>
    slot.stageId === input.stageId && previous && slot.versionId === previous.versionId
      ? { ...slot, versionId: createdVersion.versionId }
      : slot,
  );

  return {
    nextState: {
      ...state,
      tree: {
        ...state.tree,
        episode: {
          ...state.tree.episode,
          stages: nextStages,
        },
      },
      compare: {
        ...state.compare,
        slots: nextSlots,
      },
    },
    createdVersion,
  };
}

function normalizeContributors(
  contributors: readonly CrecoContributorShare[],
): readonly CrecoContributorShare[] {
  if (contributors.length === 0) return [{ name: "담당 작가", sharePct: 100 }];
  const sum = contributors.reduce((acc, item) => acc + Math.max(0, item.sharePct), 0);
  if (sum <= 0) {
    const equal = Math.floor(100 / contributors.length);
    return contributors.map((item, idx) => ({
      name: item.name,
      sharePct: idx === 0 ? 100 - equal * (contributors.length - 1) : equal,
    }));
  }
  let assigned = 0;
  return contributors.map((item, idx) => {
    if (idx === contributors.length - 1) {
      return { name: item.name, sharePct: Math.max(0, 100 - assigned) };
    }
    const share = Math.round((Math.max(0, item.sharePct) / sum) * 100);
    assigned += share;
    return { name: item.name, sharePct: share };
  });
}

export function approveAndCloseStageVersion(
  state: CrecoCollabWorkspaceState,
  input: ApproveAndCloseStageInput,
): {
  readonly nextState: CrecoCollabWorkspaceState;
  readonly autoResolvedCount: number;
} {
  const closedAtIso = input.closedAtIso ?? "2026-11-21T18:10:00Z";
  const nextStages = state.tree.episode.stages.map((stage) => {
    if (stage.stageId !== input.stageId) return stage;
    const nextVersions = stage.versions.map((ver) => {
      if (ver.versionId !== input.versionId) return ver;
      return {
        ...ver,
        approved: true,
        lifecycle: "stage-closed" as const,
        contributors: input.contributors
          ? normalizeContributors(input.contributors)
          : ver.contributors,
      };
    });
    return {
      ...stage,
      versions: nextVersions,
      latestApprovedVersionId: input.versionId,
      activeVersionId: input.versionId,
    };
  });

  let autoResolvedCount = 0;
  const nextFeedbacks = input.resolveOpenPublicFeedbacks
    ? state.feedbacks.map((fb) => {
        if (
          fb.stageId === input.stageId &&
          fb.visibility === "public" &&
          fb.status !== "resolved"
        ) {
          autoResolvedCount += 1;
          return {
            ...fb,
            status: "resolved" as const,
            resolvedBy: input.approverName,
            resolvedAtIso: closedAtIso,
          };
        }
        return fb;
      })
    : state.feedbacks;

  return {
    nextState: {
      ...state,
      tree: {
        ...state.tree,
        episode: {
          ...state.tree.episode,
          stages: nextStages,
        },
      },
      feedbacks: nextFeedbacks,
    },
    autoResolvedCount,
  };
}

export function setCanonicalShareMode(
  state: CrecoCollabWorkspaceState,
  mode: "latest-approved" | "pinned",
  stageId: CrecoStageId,
  pinnedVersionId: string | null = null,
): CrecoCollabWorkspaceState {
  return {
    ...state,
    tree: {
      ...state.tree,
      canonicalShareLink: {
        ...state.tree.canonicalShareLink,
        mode,
        stageId,
        pinnedVersionId: mode === "pinned" ? pinnedVersionId : null,
      },
    },
  };
}

export function resolveCanonicalShareTarget(
  state: CrecoCollabWorkspaceState,
): ResolvedCanonicalShare {
  const link = state.tree.canonicalShareLink;
  const stage =
    state.tree.episode.stages.find((item) => item.stageId === link.stageId) ?? null;
  let resolvedVersion: CrecoImmutableVersion | null = null;
  if (stage) {
    if (link.mode === "pinned" && link.pinnedVersionId) {
      resolvedVersion =
        stage.versions.find((ver) => ver.versionId === link.pinnedVersionId) ?? null;
    }
    if (!resolvedVersion && stage.latestApprovedVersionId) {
      resolvedVersion =
        stage.versions.find((ver) => ver.versionId === stage.latestApprovedVersionId) ??
        null;
    }
    if (!resolvedVersion) {
      resolvedVersion = stage.versions[stage.versions.length - 1] ?? null;
    }
  }
  return {
    shareId: link.shareId,
    url: link.url,
    mode: link.mode,
    resolvedStageId: link.stageId,
    resolvedVersion,
    filenameConfusionRiskPct: 0,
  };
}

export function setCompareLayoutMode(
  compare: SyncMultiStageCompareState,
  layoutMode: CompareLayoutMode,
): SyncMultiStageCompareState {
  return { ...compare, layoutMode };
}

export function setCompareSyncMode(
  compare: SyncMultiStageCompareState,
  syncMode: CompareSyncMode,
): SyncMultiStageCompareState {
  return { ...compare, syncMode };
}

export function setCompareWipePercent(
  compare: SyncMultiStageCompareState,
  wipePercent: number,
): SyncMultiStageCompareState {
  return { ...compare, wipePercent: Math.round(clampNumber(wipePercent, 0, 100)) };
}

export function setCompareSlots(
  state: CrecoCollabWorkspaceState,
  requested: readonly { readonly stageId: CrecoStageId; readonly versionId?: string }[],
): CrecoCollabWorkspaceState {
  const deduped: CompareSlotRef[] = [];
  const seen = new Set<string>();
  for (const req of requested) {
    if (deduped.length >= 4) break;
    const { stage, version } = findStageAndVersion(state.tree, req.stageId, req.versionId);
    if (!stage || !version) continue;
    const key = `${stage.stageId}:${version.versionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      slotId: `lane-${deduped.length + 1}`,
      stageId: stage.stageId,
      versionId: version.versionId,
      heightScale: getStageMeta(stage.stageId).heightScale,
    });
  }
  if (deduped.length === 0) return state;

  const nextRatios: Record<string, number> = {};
  for (const slot of deduped) {
    nextRatios[slot.slotId] = state.compare.masterScrollRatio;
  }

  return {
    ...state,
    compare: {
      ...state.compare,
      slots: deduped,
      slotScrollRatios: nextRatios,
      wipeBeforeSlotIndex: 0,
      wipeAfterSlotIndex: Math.min(1, deduped.length - 1),
    },
  };
}

export function syncCompareScroll(
  compare: SyncMultiStageCompareState,
  sourceSlotId: string,
  nextScrollRatio: number,
  nextCutIndex: number,
): SyncMultiStageCompareState {
  const clampedRatio = clampNumber(nextScrollRatio, 0, 1);
  const clampedCut = Math.max(0, Math.round(nextCutIndex));
  const sourceSlot = compare.slots.find((item) => item.slotId === sourceSlotId);
  const prevSourceRatio = compare.slotScrollRatios[sourceSlotId] ?? compare.masterScrollRatio;
  const deltaRatio = clampedRatio - prevSourceRatio;
  const sourceHeightScale = sourceSlot?.heightScale ?? 1;

  const nextRatios: Record<string, number> = {};
  for (const slot of compare.slots) {
    if (slot.slotId === sourceSlotId) {
      nextRatios[slot.slotId] = clampedRatio;
      continue;
    }
    if (compare.syncMode === "all-lock") {
      nextRatios[slot.slotId] = clampedRatio;
    } else if (compare.syncMode === "offset-keep") {
      const prevSlotRatio = compare.slotScrollRatios[slot.slotId] ?? compare.masterScrollRatio;
      nextRatios[slot.slotId] = clampNumber(prevSlotRatio + deltaRatio, 0, 1);
    } else {
      const ratioScale = sourceHeightScale > 0 ? slot.heightScale / sourceHeightScale : 1;
      nextRatios[slot.slotId] = clampNumber(clampedRatio * ratioScale, 0, 1);
    }
  }

  return {
    ...compare,
    activeCutIndex: clampedCut,
    masterScrollRatio: clampedRatio,
    slotScrollRatios: nextRatios,
  };
}

export function summarizeVersionDiff(
  beforeVersion: CrecoImmutableVersion | null,
  afterVersion: CrecoImmutableVersion | null,
): VersionDiffSummary {
  if (!beforeVersion || !afterVersion) {
    return {
      beforeLabel: beforeVersion?.label ?? "기준 없음",
      afterLabel: afterVersion?.label ?? "대상 없음",
      cutCountDelta: 0,
      newCuts: 0,
      updatedCuts: 0,
      unchangedCuts: 0,
      totalSizeDeltaKb: 0,
      summaryLines: ["비교할 두 공정 버전을 선택해 주세요."],
    };
  }

  const beforeMap = new Map(beforeVersion.artifacts.map((art) => [art.cutIndex, art]));
  let newCuts = 0;
  let updatedCuts = 0;
  let unchangedCuts = 0;

  for (const art of afterVersion.artifacts) {
    const prev = beforeMap.get(art.cutIndex);
    if (!prev) newCuts += 1;
    else if (prev.digest !== art.digest) updatedCuts += 1;
    else unchangedCuts += 1;
  }

  const beforeSize = beforeVersion.artifacts.reduce((acc, item) => acc + item.fileSizeKb, 0);
  const afterSize = afterVersion.artifacts.reduce((acc, item) => acc + item.fileSizeKb, 0);
  const totalSizeDeltaKb = afterSize - beforeSize;
  const cutCountDelta = afterVersion.artifacts.length - beforeVersion.artifacts.length;

  return {
    beforeLabel: beforeVersion.label,
    afterLabel: afterVersion.label,
    cutCountDelta,
    newCuts,
    updatedCuts,
    unchangedCuts,
    totalSizeDeltaKb,
    summaryLines: [
      `${beforeVersion.label} → ${afterVersion.label}: 총 ${afterVersion.artifacts.length}컷 (신규 ${newCuts} · 변경 ${updatedCuts} · 유지 ${unchangedCuts})`,
      `용량 변화 ${totalSizeDeltaKb >= 0 ? "+" : ""}${totalSizeDeltaKb} KB · 최신 메모: ${afterVersion.summary}`,
    ],
  };
}

export function addPinRedlineFeedback(
  state: CrecoCollabWorkspaceState,
  input: AddPinRedlineFeedbackInput,
): {
  readonly nextState: CrecoCollabWorkspaceState;
  readonly createdFeedback: CrecoPinFeedback;
} {
  const { version } = findStageAndVersion(state.tree, input.stageId, input.versionId);
  const meta = getStageMeta(input.stageId);
  const cutArtifact =
    version?.artifacts.find((art) => art.cutIndex === input.cutIndex) ?? version?.artifacts[0];

  const createdFeedback: CrecoPinFeedback = {
    id: `pin-${state.feedbacks.length + 101}`,
    stageId: input.stageId,
    versionId: version?.versionId ?? input.versionId,
    cutIndex: Math.max(0, Math.round(input.cutIndex)),
    xPct: Math.round(clampNumber(input.xPct, 0, 100) * 10) / 10,
    yPct: Math.round(clampNumber(input.yPct, 0, 100) * 10) / 10,
    layerId: cutArtifact?.layerId ?? meta.defaultLayerId,
    layerName: cutArtifact?.layerName ?? meta.defaultLayerName,
    authorName: input.authorName,
    assigneeName: input.assigneeName,
    body: input.body.trim() || "수정 위치를 확인해 주세요.",
    importance: input.importance,
    visibility: input.visibility ?? "public",
    status: "open",
    strokes: (input.strokes ?? []).map((stroke) => ({
      ...stroke,
      points: stroke.points.map((pt) => ({
        xPct: Math.round(clampNumber(pt.xPct, 0, 100) * 10) / 10,
        yPct: Math.round(clampNumber(pt.yPct, 0, 100) * 10) / 10,
      })),
    })),
    createdAtIso: input.createdAtIso ?? "2026-11-21T18:15:00Z",
    resolvedBy: null,
    resolvedAtIso: null,
  };

  return {
    nextState: {
      ...state,
      feedbacks: [createdFeedback, ...state.feedbacks],
    },
    createdFeedback,
  };
}

export function updateFeedbackStatus(
  state: CrecoCollabWorkspaceState,
  feedbackId: string,
  nextStatus: FeedbackStatus,
  actorName: string,
  nowIso = "2026-11-21T18:20:00Z",
): CrecoCollabWorkspaceState {
  return {
    ...state,
    feedbacks: state.feedbacks.map((fb) => {
      if (fb.id !== feedbackId) return fb;
      return {
        ...fb,
        status: nextStatus,
        resolvedBy: nextStatus === "resolved" ? actorName : null,
        resolvedAtIso: nextStatus === "resolved" ? nowIso : null,
      };
    }),
  };
}

export function publishPrivateFeedbackDrafts(
  state: CrecoCollabWorkspaceState,
  actorName: string,
): {
  readonly nextState: CrecoCollabWorkspaceState;
  readonly publishedCount: number;
} {
  let publishedCount = 0;
  const nextFeedbacks = state.feedbacks.map((fb) => {
    if (fb.visibility === "private" && (!actorName || fb.authorName === actorName)) {
      publishedCount += 1;
      return { ...fb, visibility: "public" as const };
    }
    return fb;
  });
  return {
    nextState: { ...state, feedbacks: nextFeedbacks },
    publishedCount,
  };
}

export function buildCanvasJumpPayload(
  state: CrecoCollabWorkspaceState,
  feedbackId: string,
): ToonStudioCanvasJumpPayload | null {
  const feedback = state.feedbacks.find((item) => item.id === feedbackId);
  if (!feedback) return null;

  const deepLinkUri = `toonstudio://canvas/${state.tree.projectId}/${state.tree.episode.episodeId}?stage=${feedback.stageId}&ver=${feedback.versionId}&cut=${feedback.cutIndex}&layer=${encodeURIComponent(feedback.layerId)}&x=${feedback.xPct}&y=${feedback.yPct}`;

  return {
    schema: "toonstudio.canvas-jump.v1",
    projectId: state.tree.projectId,
    episodeId: state.tree.episode.episodeId,
    stageId: feedback.stageId,
    versionId: feedback.versionId,
    cutIndex: feedback.cutIndex,
    xPct: feedback.xPct,
    yPct: feedback.yPct,
    layerId: feedback.layerId,
    layerName: feedback.layerName,
    zoomPercent: 160,
    highlightFeedbackId: feedback.id,
    estimatedLatencyMs: 95,
    requiresExternalUpload: false,
    deepLinkUri,
  };
}
