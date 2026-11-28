/**
 * Wave 117 — Porter-Duff 합성 대수 안전 장벽 판정 및 타일-희소 VRAM/OPFS 정량 계산 모듈.
 */

import {
  canonicalizeLayerManifestJson,
  sha256LayerManifestHex,
} from "./layer-manifest-sha256";
import {
  LAYER_OPFS_HEADER_OVERHEAD_BYTES,
  NON_DESTRUCTIVE_LAYER_KINDS,
  STUDIO_ROLE_SPECS,
  TILE_PAGE_TABLE_ENTRY_BYTES,
  type CompiledLayerManifestNode,
  type DietPlanStatus,
  type LayerTreeHygieneAuditResult,
  type SafetyBarrierRecord,
  type SanitizedLayerNode,
  type TileOverlapEstimationMode,
  type VramAndOpfsMetrics,
} from "./layer-tree-hygiene-types";

const BYTES_PER_MIB = 1024 * 1024;
const NON_DESTRUCTIVE_KIND_SET = new Set<string>(NON_DESTRUCTIVE_LAYER_KINDS);

function toMiB(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / BYTES_PER_MIB) * 1000) / 1000;
}

function toPercent(saved: number, baseline: number): number {
  if (!Number.isFinite(saved) || !Number.isFinite(baseline) || baseline <= 0) return 0;
  const clamped = Math.max(0, Math.min(baseline, saved));
  return Math.round((clamped / baseline) * 10000) / 100;
}

function compareCanonicalNodes(
  a: { readonly parentId: string | null; readonly orderIndex: number; readonly id: string },
  b: { readonly parentId: string | null; readonly orderIndex: number; readonly id: string },
): number {
  const pa = a.parentId ?? "";
  const pb = b.parentId ?? "";
  if (pa !== pb) return pa.localeCompare(pb);
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return a.id.localeCompare(b.id);
}

export function computeBeforeManifestSha256(audit: LayerTreeHygieneAuditResult): string {
  const sorted = [...audit.nodes].sort(compareCanonicalNodes).map((n) => ({
    id: n.id,
    parentId: n.parentId,
    orderIndex: n.orderIndex,
    rawName: n.rawName,
    kind: n.kind,
    blendMode: n.blendMode,
    opacity: n.opacity,
    visible: n.visible,
    locked: n.locked,
    clippedToBelow: n.clippedToBelow,
    nonEmptyTileCount: n.nonEmptyTileCount,
    totalTileCount: n.totalTileCount,
    tileSizePx: n.tileSizePx,
    bytesPerPixel: n.bytesPerPixel,
    hasAlphaMask: n.hasAlphaMask,
  }));
  return sha256LayerManifestHex(
    canonicalizeLayerManifestJson({
      documentId: audit.documentId,
      stage: "before",
      integrityStatus: audit.integrityStatus,
      nodes: sorted,
    }),
  );
}

export function computeAfterManifestSha256(
  documentId: string,
  status: DietPlanStatus,
  manifest: readonly CompiledLayerManifestNode[],
): string {
  const sorted = [...manifest].sort(compareCanonicalNodes);
  return sha256LayerManifestHex(
    canonicalizeLayerManifestJson({
      documentId,
      stage: "after",
      status,
      nodes: sorted,
    }),
  );
}

export function isPrunableEmptyRaster(node: SanitizedLayerNode): boolean {
  if (node.kind !== "raster") return false;
  if (node.locked || node.isClipChainBase || node.clippedToBelow) return false;
  return node.nonEmptyTileCount === 0;
}

export function evaluateIntrinsicBarriers(
  node: SanitizedLayerNode,
  protectAlphaMaskedLayers: boolean,
): SafetyBarrierRecord[] {
  const barriers: SafetyBarrierRecord[] = [];

  if (node.locked) {
    barriers.push({
      layerId: node.id,
      adjacentLayerId: null,
      reasonCode: "locked-layer",
      mathematicalReasonKo: `잠금(locked) 레이어 '${node.normalizedName}'는 작가 보호 지정을 유지하기 위해 병합과 정리를 모두 차단했습니다.`,
    });
  }

  if (NON_DESTRUCTIVE_KIND_SET.has(node.kind)) {
    barriers.push({
      layerId: node.id,
      adjacentLayerId: null,
      reasonCode: "non-destructive-kind",
      mathematicalReasonKo: `비파괴 종류('${node.kind}') 레이어 '${node.normalizedName}'는 편집 가능 구조를 보존하기 위해 래스터 병합을 금지했습니다.`,
    });
  }

  if (node.clippedToBelow) {
    barriers.push({
      layerId: node.id,
      adjacentLayerId: node.clipBaseLayerId,
      reasonCode: "clipped-layer",
      mathematicalReasonKo: `클리핑 마스크 종속 레이어 '${node.normalizedName}'는 베이스 알파 매트 결합 경계를 유지해야 하므로 병합을 차단했습니다.`,
    });
  }

  if (node.isClipChainBase) {
    barriers.push({
      layerId: node.id,
      adjacentLayerId: null,
      reasonCode: "clip-chain-base",
      mathematicalReasonKo: `클리핑 체인 베이스 레이어 '${node.normalizedName}'는 상위 클리핑 레이어들의 알파 매트 기준이므로 병합과 삭제를 차단했습니다.`,
    });
  }

  if (node.kind === "raster") {
    if (node.blendMode !== "normal") {
      barriers.push({
        layerId: node.id,
        adjacentLayerId: null,
        reasonCode: "non-normal-blend-mode",
        mathematicalReasonKo: `블렌드 모드 '${node.blendMode}'는 배경색(backdrop)에 비선형·비결합 의존하므로 Porter-Duff 선행 병합 시 픽셀 결과가 달라져 차단했습니다.`,
      });
    }
    if (node.opacity < 1) {
      barriers.push({
        layerId: node.id,
        adjacentLayerId: null,
        reasonCode: "partial-opacity",
        mathematicalReasonKo: `부분 불투명도(opacity=${node.opacity})가 적용되어 선행 병합 시 8비트 양자화 오차와 편집용 불투명도 의미가 변형되므로 차단했습니다.`,
      });
    }
    if (!node.visible && node.nonEmptyTileCount > 0) {
      barriers.push({
        layerId: node.id,
        adjacentLayerId: null,
        reasonCode: "hidden-nonempty-layer",
        mathematicalReasonKo: `숨겨진 비공백 레이어 '${node.normalizedName}'(활성 타일 ${node.nonEmptyTileCount}개)는 원화 손실과 Z-순서 역전을 막기 위해 병합·삭제를 차단했습니다.`,
      });
    }
    if (protectAlphaMaskedLayers && node.hasAlphaMask) {
      barriers.push({
        layerId: node.id,
        adjacentLayerId: null,
        reasonCode: "editable-alpha-mask",
        mathematicalReasonKo: `편집 가능한 알파 마스크 보유 레이어 '${node.normalizedName}'는 마스크 분리 편집을 유지하기 위해 병합을 차단했습니다.`,
      });
    }
  }

  return barriers;
}

export function isEligibleNormalMergeRaster(
  node: SanitizedLayerNode,
  intrinsicBarriers: readonly SafetyBarrierRecord[],
): boolean {
  if (node.kind !== "raster") return false;
  if (!node.visible || node.nonEmptyTileCount === 0) return false;
  if (node.blendMode !== "normal" || node.opacity !== 1) return false;
  if (node.locked || node.clippedToBelow || node.isClipChainBase) return false;
  return intrinsicBarriers.length === 0;
}

export function evaluatePairwiseBoundary(
  below: SanitizedLayerNode,
  above: SanitizedLayerNode,
): SafetyBarrierRecord | null {
  if (below.parentId !== above.parentId) {
    return {
      layerId: above.id,
      adjacentLayerId: below.id,
      reasonCode: "different-parent",
      mathematicalReasonKo: `서로 다른 폴더 경계('${below.parentId ?? "root"}' vs '${above.parentId ?? "root"}')를 넘어 병합할 수 없습니다.`,
    };
  }
  if (below.kind !== "raster" || above.kind !== "raster") return null;

  if (below.blendMode !== "normal" || above.blendMode !== "normal") {
    return {
      layerId: above.id,
      adjacentLayerId: below.id,
      reasonCode: "non-normal-blend-mode",
      mathematicalReasonKo: `인접 블렌드 쌍(${below.blendMode} + ${above.blendMode})은 W3C 합성 대수상 결합법칙이 성립하지 않아 선행 병합을 차단했습니다.`,
    };
  }
  if (below.opacity < 1 || above.opacity < 1) {
    return {
      layerId: above.id,
      adjacentLayerId: below.id,
      reasonCode: "partial-opacity",
      mathematicalReasonKo: `인접 레이어 불투명도(${below.opacity}, ${above.opacity}) 중 1.0 미만이 포함되어 Porter-Duff 등가 병합을 차단했습니다.`,
    };
  }
  if (below.inferredRole !== above.inferredRole) {
    return {
      layerId: above.id,
      adjacentLayerId: below.id,
      reasonCode: "different-role",
      mathematicalReasonKo: `서로 다른 스튜디오 공정 역할('${below.inferredRole}' vs '${above.inferredRole}') 레이어는 분업 편집 경계를 유지하기 위해 병합을 차단했습니다.`,
    };
  }
  if (below.tileSizePx !== above.tileSizePx || below.bytesPerPixel !== above.bytesPerPixel) {
    return {
      layerId: above.id,
      adjacentLayerId: below.id,
      reasonCode: "mismatched-pixel-format",
      mathematicalReasonKo: `타일 규격 또는 픽셀 정밀도 불일치(${below.tileSizePx}px/${below.bytesPerPixel}Bpp vs ${above.tileSizePx}px/${above.bytesPerPixel}Bpp)로 손실 없는 병합을 차단했습니다.`,
    };
  }
  return null;
}

export function estimateMergedTileCount(group: readonly SanitizedLayerNode[]): {
  readonly afterTileCount: number;
  readonly mode: TileOverlapEstimationMode;
} {
  let maxSingleTiles = 0;
  let sumTiles = 0;
  let maxCanvasTiles = 0;
  let allHaveExactIndices = true;

  for (let i = 0; i < group.length; i += 1) {
    const n = group[i];
    if (n.nonEmptyTileCount > maxSingleTiles) maxSingleTiles = n.nonEmptyTileCount;
    sumTiles += n.nonEmptyTileCount;
    if (n.totalTileCount > maxCanvasTiles) maxCanvasTiles = n.totalTileCount;
    if (n.activeTileIndices === undefined) allHaveExactIndices = false;
  }

  if (allHaveExactIndices) {
    const union = new Set<number>();
    for (let i = 0; i < group.length; i += 1) {
      const indices = group[i].activeTileIndices ?? [];
      for (let j = 0; j < indices.length; j += 1) union.add(indices[j]);
    }
    return { afterTileCount: union.size, mode: "exact-tile-set" };
  }

  if (maxCanvasTiles <= 0) {
    return { afterTileCount: 0, mode: "probabilistic-occupancy" };
  }

  let complementProduct = 1;
  for (let i = 0; i < group.length; i += 1) {
    const ratio = Math.min(1, Math.max(0, group[i].nonEmptyTileCount / maxCanvasTiles));
    complementProduct *= 1 - ratio;
  }
  const expectedUnion = maxCanvasTiles * (1 - complementProduct);
  const upperBound = Math.min(maxCanvasTiles, sumTiles);
  const clamped = Math.max(maxSingleTiles, Math.min(upperBound, Math.round(expectedUnion)));
  return { afterTileCount: clamped, mode: "probabilistic-occupancy" };
}

export function estimateMergedOpfsBytes(
  group: readonly SanitizedLayerNode[],
  afterSparseVramBytes: number,
  maxCanvasTiles: number,
): number {
  const role = group[0].inferredRole;
  const pageTableBytes =
    LAYER_OPFS_HEADER_OVERHEAD_BYTES + maxCanvasTiles * TILE_PAGE_TABLE_ENTRY_BYTES;
  const rawEstimate =
    pageTableBytes + Math.round(afterSparseVramBytes * STUDIO_ROLE_SPECS[role].opfsCompressionRatio);

  let sumBeforeOpfs = 0;
  for (let i = 0; i < group.length; i += 1) {
    sumBeforeOpfs += group[i].estimatedOpfsBytes;
  }
  return Math.min(sumBeforeOpfs, rawEstimate);
}

export function buildVramAndOpfsMetrics(
  nodes: readonly SanitizedLayerNode[],
  optimizedVramBytes: number,
  opfsAfterBytes: number,
): VramAndOpfsMetrics {
  let denseVramBytes = 0;
  let sparseVramBytes = 0;
  let opfsBeforeBytes = 0;
  let hiddenNonEmptyReclaimableVramBytes = 0;

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    denseVramBytes += n.denseVramBytes;
    sparseVramBytes += n.sparseVramBytes;
    opfsBeforeBytes += n.estimatedOpfsBytes;
    if (!n.visible && n.nonEmptyTileCount > 0 && n.kind === "raster") {
      hiddenNonEmptyReclaimableVramBytes += n.sparseVramBytes;
    }
  }

  const safeOptimizedVram = Math.min(sparseVramBytes, Math.max(0, optimizedVramBytes));
  const safeOpfsAfter = Math.min(opfsBeforeBytes, Math.max(0, opfsAfterBytes));
  const denseToSparseSavingsBytes = Math.max(0, denseVramBytes - sparseVramBytes);
  const dietMergeSavingsBytes = Math.max(0, sparseVramBytes - safeOptimizedVram);
  const totalSavingsFromDenseBytes = Math.max(0, denseVramBytes - safeOptimizedVram);
  const opfsSavingsBytes = Math.max(0, opfsBeforeBytes - safeOpfsAfter);

  return {
    denseVramBytes,
    sparseVramBytes,
    optimizedVramBytes: safeOptimizedVram,
    denseVramMiB: toMiB(denseVramBytes),
    sparseVramMiB: toMiB(sparseVramBytes),
    optimizedVramMiB: toMiB(safeOptimizedVram),
    denseToSparseSavingsBytes,
    denseToSparseSavingsPercent: toPercent(denseToSparseSavingsBytes, denseVramBytes),
    dietMergeSavingsBytes,
    dietMergeSavingsPercent: toPercent(dietMergeSavingsBytes, sparseVramBytes),
    totalSavingsFromDenseBytes,
    totalSavingsFromDenseMiB: toMiB(totalSavingsFromDenseBytes),
    totalSavingsFromDensePercent: toPercent(totalSavingsFromDenseBytes, denseVramBytes),
    opfsBeforeBytes,
    opfsAfterBytes: safeOpfsAfter,
    opfsSavingsBytes,
    opfsSavingsPercent: toPercent(opfsSavingsBytes, opfsBeforeBytes),
    hiddenNonEmptyReclaimableVramBytes,
  };
}
