/**
 * Wave 117 — 합성 대수 불변식 기반 안전 병합 및 타일-희소 VRAM 다이어트 컴파일러.
 *
 * - 픽셀 등가성 보존(Porter-Duff source-over 결합법칙)을 만족하는 동종 래스터 구간만 안전 병합
 * - 트리 무결성 오류(순환·고아 부모·중복 ID)가 있으면 fail-closed로 모든 병합·정리 차단
 * - 순수 ES2017 FIPS 180-4 SHA-256으로 최적화 전/후 매니페스트 지문 생성
 */

import {
  buildVramAndOpfsMetrics,
  computeAfterManifestSha256,
  computeBeforeManifestSha256,
  estimateMergedOpfsBytes,
  estimateMergedTileCount,
  evaluateIntrinsicBarriers,
  evaluatePairwiseBoundary,
  isEligibleNormalMergeRaster,
  isPrunableEmptyRaster,
} from "./layer-compositing-barriers-and-vram";
import {
  canonicalizeLayerManifestJson,
  sha256LayerManifestHex,
} from "./layer-manifest-sha256";
import type {
  CompiledLayerManifestNode,
  DietPlanStatus,
  LayerDietActionKind,
  LayerDietDecision,
  LayerTreeHygieneAuditResult,
  LayerVramDietCompileOptions,
  LayerVramDietPlanResult,
  PrunedEmptyLayerRecord,
  SafeMergeGroup,
  SafetyBarrierRecord,
  SanitizedLayerNode,
} from "./layer-tree-hygiene-types";

export { canonicalizeLayerManifestJson, sha256LayerManifestHex };

function createManifestNodeFromSingle(
  node: SanitizedLayerNode,
  orderIndex: number,
  useRawName: boolean,
): CompiledLayerManifestNode {
  return {
    id: node.id,
    parentId: node.parentId,
    orderIndex,
    name: useRawName ? node.rawName : node.normalizedName,
    role: node.inferredRole,
    kind: node.kind,
    blendMode: node.blendMode,
    opacity: node.opacity,
    visible: node.visible,
    locked: node.locked,
    clippedToBelow: node.clippedToBelow,
    nonEmptyTileCount: node.nonEmptyTileCount,
    totalTileCount: node.totalTileCount,
    tileSizePx: node.tileSizePx,
    bytesPerPixel: node.bytesPerPixel,
    hasAlphaMask: node.hasAlphaMask,
    mergedFromIds: [node.id],
  };
}

function buildBlockedPlan(
  audit: LayerTreeHygieneAuditResult,
  beforeManifestSha256: string,
): LayerVramDietPlanResult {
  const blockedBarriers: SafetyBarrierRecord[] = audit.issues
    .filter(
      (issue) =>
        issue.code === "cycle" ||
        issue.code === "orphan-parent" ||
        issue.code === "non-folder-parent" ||
        issue.code === "duplicate-node-id",
    )
    .map((issue) => ({
      layerId: issue.layerId,
      adjacentLayerId: issue.relatedLayerIds[0] ?? null,
      reasonCode: "tree-integrity-failure" as const,
      mathematicalReasonKo: issue.messageKo,
    }));

  const compiledManifest = audit.nodes.map((n) =>
    createManifestNodeFromSingle(n, n.orderIndex, true),
  );
  const totalSparse = audit.nodes.reduce((acc, n) => acc + n.sparseVramBytes, 0);
  const totalOpfs = audit.nodes.reduce((acc, n) => acc + n.estimatedOpfsBytes, 0);
  const metrics = buildVramAndOpfsMetrics(audit.nodes, totalSparse, totalOpfs);

  const decisions: LayerDietDecision[] = audit.nodes.map((n) => ({
    layerId: n.id,
    normalizedName: n.normalizedName,
    action: "blocked-integrity-failure",
    mergeGroupId: null,
    barrierReasons: ["tree-integrity-failure"],
  }));

  return {
    documentId: audit.documentId,
    status: "blocked-integrity-failure",
    layerCountBefore: audit.nodes.length,
    layerCountAfter: audit.nodes.length,
    mergedGroupCount: 0,
    prunedEmptyLayerCount: 0,
    protectedBarrierLayerCount: audit.nodes.length,
    mergeGroups: [],
    prunedLayers: [],
    blockedBarriers,
    decisions,
    compiledManifest,
    metrics,
    beforeManifestSha256,
    afterManifestSha256: computeAfterManifestSha256(
      audit.documentId,
      "blocked-integrity-failure",
      compiledManifest,
    ),
  };
}

/**
 * 레이어 트리 감사 결과를 입력받아 픽셀 등가성을 해치지 않는 안전 병합·빈 레이어 정리 및
 * 타일-희소 VRAM/OPFS 다이어트 계획을 컴파일한다.
 */
export function compileLayerVramDietPlan(
  audit: LayerTreeHygieneAuditResult,
  options: LayerVramDietCompileOptions = {},
): LayerVramDietPlanResult {
  const beforeManifestSha256 = computeBeforeManifestSha256(audit);
  if (!audit.safeToCompile || audit.integrityStatus === "failed-closed") {
    return buildBlockedPlan(audit, beforeManifestSha256);
  }

  const protectAlphaMaskedLayers = options.protectAlphaMaskedLayers === true;
  const siblingsByParent = new Map<string | null, SanitizedLayerNode[]>();
  for (let i = 0; i < audit.nodes.length; i += 1) {
    const node = audit.nodes[i];
    const list = siblingsByParent.get(node.parentId) ?? [];
    list.push(node);
    siblingsByParent.set(node.parentId, list);
  }

  const parentKeys = Array.from(siblingsByParent.keys()).sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    return a.localeCompare(b);
  });

  const mergeGroups: SafeMergeGroup[] = [];
  const prunedLayers: PrunedEmptyLayerRecord[] = [];
  const blockedBarriers: SafetyBarrierRecord[] = [];
  const decisionByLayerId = new Map<string, LayerDietDecision>();
  const compiledManifest: CompiledLayerManifestNode[] = [];

  let optimizedVramBytes = 0;
  let opfsAfterBytes = 0;
  let mergeCounter = 0;

  for (let p = 0; p < parentKeys.length; p += 1) {
    const siblings = [...(siblingsByParent.get(parentKeys[p]) ?? [])].sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      if (a.inputIndex !== b.inputIndex) return a.inputIndex - b.inputIndex;
      return a.id.localeCompare(b.id);
    });

    const activeSiblings: SanitizedLayerNode[] = [];
    for (let i = 0; i < siblings.length; i += 1) {
      const node = siblings[i];
      if (isPrunableEmptyRaster(node)) {
        prunedLayers.push({
          layerId: node.id,
          parentId: node.parentId,
          rawName: node.rawName,
          normalizedName: node.normalizedName,
          reclaimedDenseVramBytes: node.denseVramBytes,
          reclaimedOpfsBytes: node.estimatedOpfsBytes,
          reasonKo: node.visible
            ? `활성 픽셀 타일이 0개인 빈 래스터 '${node.rawName}'를 정리했습니다.`
            : `숨겨진 빈 래스터 '${node.rawName}'(활성 타일 0개)를 정리했습니다.`,
        });
        decisionByLayerId.set(node.id, {
          layerId: node.id,
          normalizedName: node.normalizedName,
          action: "prune-empty-layer",
          mergeGroupId: null,
          barrierReasons: [],
        });
      } else {
        activeSiblings.push(node);
      }
    }

    const intrinsicMap = new Map<string, SafetyBarrierRecord[]>();
    const eligibleMap = new Map<string, boolean>();
    const recordedPairKeys = new Set<string>();

    for (let i = 0; i < activeSiblings.length; i += 1) {
      const node = activeSiblings[i];
      const intrinsic = evaluateIntrinsicBarriers(node, protectAlphaMaskedLayers);
      intrinsicMap.set(node.id, intrinsic);
      for (let b = 0; b < intrinsic.length; b += 1) blockedBarriers.push(intrinsic[b]);
      eligibleMap.set(node.id, isEligibleNormalMergeRaster(node, intrinsic));
    }

    for (let i = 1; i < activeSiblings.length; i += 1) {
      const pairBarrier = evaluatePairwiseBoundary(activeSiblings[i - 1], activeSiblings[i]);
      if (pairBarrier) {
        const key = `${pairBarrier.adjacentLayerId ?? ""}|${pairBarrier.layerId}|${pairBarrier.reasonCode}`;
        if (!recordedPairKeys.has(key)) {
          recordedPairKeys.add(key);
          blockedBarriers.push(pairBarrier);
        }
      }
    }

    let idx = 0;
    let nextOrderIndex = 0;
    while (idx < activeSiblings.length) {
      const current = activeSiblings[idx];
      if (eligibleMap.get(current.id) !== true) {
        const reasons = (intrinsicMap.get(current.id) ?? []).map((b) => b.reasonCode);
        const action: LayerDietActionKind =
          reasons.length > 0 ? "keep-protected-barrier" : "keep-preserved";
        decisionByLayerId.set(current.id, {
          layerId: current.id,
          normalizedName: current.normalizedName,
          action,
          mergeGroupId: null,
          barrierReasons: reasons,
        });
        compiledManifest.push(createManifestNodeFromSingle(current, nextOrderIndex, false));
        optimizedVramBytes += current.sparseVramBytes;
        opfsAfterBytes += current.estimatedOpfsBytes;
        nextOrderIndex += 1;
        idx += 1;
        continue;
      }

      const run: SanitizedLayerNode[] = [current];
      let probe = idx + 1;
      while (probe < activeSiblings.length) {
        const nextNode = activeSiblings[probe];
        if (eligibleMap.get(nextNode.id) !== true) break;
        if (evaluatePairwiseBoundary(run[run.length - 1], nextNode) !== null) break;
        run.push(nextNode);
        probe += 1;
      }

      if (run.length === 1) {
        decisionByLayerId.set(current.id, {
          layerId: current.id,
          normalizedName: current.normalizedName,
          action: "keep-preserved",
          mergeGroupId: null,
          barrierReasons: [],
        });
        compiledManifest.push(createManifestNodeFromSingle(current, nextOrderIndex, false));
        optimizedVramBytes += current.sparseVramBytes;
        opfsAfterBytes += current.estimatedOpfsBytes;
        nextOrderIndex += 1;
        idx += 1;
        continue;
      }

      mergeCounter += 1;
      const groupId = `merge-${String(mergeCounter).padStart(2, "0")}`;
      const baseLayer = run[0];
      const tileEst = estimateMergedTileCount(run);
      const beforeTileCount = run.reduce((acc, n) => acc + n.nonEmptyTileCount, 0);
      const beforeSparseVramBytes = run.reduce((acc, n) => acc + n.sparseVramBytes, 0);
      const mergedTileBytes = baseLayer.tileSizePx * baseLayer.tileSizePx * baseLayer.bytesPerPixel;
      const afterSparseVramBytes = Math.min(
        beforeSparseVramBytes,
        tileEst.afterTileCount * mergedTileBytes,
      );
      const savedVramBytes = Math.max(0, beforeSparseVramBytes - afterSparseVramBytes);
      const maxCanvasTiles = run.reduce(
        (acc, n) => (n.totalTileCount > acc ? n.totalTileCount : acc),
        0,
      );
      const mergedOpfsBytes = estimateMergedOpfsBytes(run, afterSparseVramBytes, maxCanvasTiles);
      const sourceLayerIds = run.map((n) => n.id);

      mergeGroups.push({
        groupId,
        parentId: baseLayer.parentId,
        role: baseLayer.inferredRole,
        sourceLayerIds,
        targetLayerId: baseLayer.id,
        targetNormalizedName: baseLayer.normalizedName,
        beforeTileCount,
        afterTileCount: tileEst.afterTileCount,
        savedTileCount: Math.max(0, beforeTileCount - tileEst.afterTileCount),
        beforeSparseVramBytes,
        afterSparseVramBytes,
        savedVramBytes,
        tileOverlapMode: tileEst.mode,
        equivalenceProof: `동일 폴더(${baseLayer.parentId ?? "root"}) 내 연속 normal(opacity=1.0) ${baseLayer.inferredRole} 래스터 ${run.length}개: Porter-Duff source-over 결합법칙 충족(잠금 0, 클리핑 경계 0, 동일 ${baseLayer.tileSizePx}px/${baseLayer.bytesPerPixel}Bpp).`,
      });

      for (let r = 0; r < run.length; r += 1) {
        decisionByLayerId.set(run[r].id, {
          layerId: run[r].id,
          normalizedName: run[r].normalizedName,
          action: "safe-lossless-merge",
          mergeGroupId: groupId,
          barrierReasons: [],
        });
      }

      compiledManifest.push({
        id: baseLayer.id,
        parentId: baseLayer.parentId,
        orderIndex: nextOrderIndex,
        name: baseLayer.normalizedName,
        role: baseLayer.inferredRole,
        kind: "raster",
        blendMode: "normal",
        opacity: 1,
        visible: true,
        locked: false,
        clippedToBelow: false,
        nonEmptyTileCount: tileEst.afterTileCount,
        totalTileCount: maxCanvasTiles,
        tileSizePx: baseLayer.tileSizePx,
        bytesPerPixel: baseLayer.bytesPerPixel,
        hasAlphaMask: false,
        mergedFromIds: sourceLayerIds,
      });

      optimizedVramBytes += afterSparseVramBytes;
      opfsAfterBytes += mergedOpfsBytes;
      nextOrderIndex += 1;
      idx = probe;
    }
  }

  const decisions: LayerDietDecision[] = audit.nodes.map(
    (node) =>
      decisionByLayerId.get(node.id) ?? {
        layerId: node.id,
        normalizedName: node.normalizedName,
        action: "keep-preserved",
        mergeGroupId: null,
        barrierReasons: [],
      },
  );

  const protectedBarrierLayerCount = decisions.filter(
    (d) => d.action === "keep-protected-barrier",
  ).length;
  const hasRenames = audit.renameMap.some((r) => r.reason !== "already-canonical");
  const status: DietPlanStatus =
    mergeGroups.length > 0 || prunedLayers.length > 0 || hasRenames
      ? "optimized"
      : "already-optimal";

  const metrics = buildVramAndOpfsMetrics(audit.nodes, optimizedVramBytes, opfsAfterBytes);
  const afterManifestSha256 = computeAfterManifestSha256(
    audit.documentId,
    status,
    compiledManifest,
  );

  return {
    documentId: audit.documentId,
    status,
    layerCountBefore: audit.nodes.length,
    layerCountAfter: compiledManifest.length,
    mergedGroupCount: mergeGroups.length,
    prunedEmptyLayerCount: prunedLayers.length,
    protectedBarrierLayerCount,
    mergeGroups,
    prunedLayers,
    blockedBarriers,
    decisions,
    compiledManifest,
    metrics,
    beforeManifestSha256,
    afterManifestSha256,
  };
}
