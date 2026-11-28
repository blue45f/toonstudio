/**
 * Wave 117 — 웹툰 원고 레이어 트리 무결성 감사 및 한국 스튜디오 표준 명명 정규화 엔진.
 *
 * - 순환 참조(cycle), 고아 부모(orphan-parent), 비폴더 부모(non-folder-parent), 중복 ID를 fail-closed 검출
 * - 무의미한 어시스턴트 레이어명 탐지 및 9단계 스튜디오 코드명(01_GUIDE_ ~ 09_SFX_) 자동 정규화
 * - 빈 레이어, 숨김 대용량 레이어, 고아 클리핑 마스크(dangling-clip-mask), 중복 클리핑(redundant-clip-mask) 적발
 */

import {
  extractCleanLayerStem,
  inferStudioLayerRole,
  isCanonicalStudioLayerName,
  isMeaninglessLayerName,
  isPixelBackedKind,
} from "./layer-studio-naming-normalizer";
import {
  DEFAULT_HIDDEN_HEAVY_VRAM_THRESHOLD_BYTES,
  LAYER_OPFS_HEADER_OVERHEAD_BYTES,
  STUDIO_ROLE_SPECS,
  TILE_PAGE_TABLE_ENTRY_BYTES,
  type LayerHygieneIssue,
  type LayerNodeKind,
  type LayerRenameEntry,
  type LayerRenameReason,
  type LayerTreeAuditOptions,
  type LayerTreeHygieneAuditResult,
  type LayerTreeNodeInput,
  type SanitizedLayerNode,
  type StudioLayerRole,
} from "./layer-tree-hygiene-types";

export { inferStudioLayerRole, isCanonicalStudioLayerName, isMeaninglessLayerName };

interface InternalWorkingNode {
  readonly raw: LayerTreeNodeInput;
  readonly inputIndex: number;
  readonly orderIndex: number;
  readonly opacity: number;
  readonly nonEmptyTileCount: number;
  readonly totalTileCount: number;
  readonly tileSizePx: number;
  readonly bytesPerPixel: number;
  readonly activeTileIndices?: readonly number[];
  depth: number;
  inferredRole: StudioLayerRole;
  normalizedName: string;
  renameReason: LayerRenameReason;
  clipBaseLayerId: string | null;
  isClipChainBase: boolean;
}

function computeNodeVramAndOpfs(
  kind: LayerNodeKind,
  role: StudioLayerRole,
  nonEmptyTileCount: number,
  totalTileCount: number,
  tileSizePx: number,
  bytesPerPixel: number,
  hasAlphaMask: boolean,
  explicitOpfsCompressedBytes: number | undefined,
): {
  readonly denseVramBytes: number;
  readonly sparseVramBytes: number;
  readonly estimatedOpfsBytes: number;
} {
  if (!isPixelBackedKind(kind)) {
    return {
      denseVramBytes: 0,
      sparseVramBytes: 0,
      estimatedOpfsBytes: LAYER_OPFS_HEADER_OVERHEAD_BYTES,
    };
  }
  const effectiveBytesPerPixel = bytesPerPixel + (hasAlphaMask ? 1 : 0);
  const tileBytes = tileSizePx * tileSizePx * effectiveBytesPerPixel;
  const denseVramBytes = totalTileCount * tileBytes;
  const sparseVramBytes = nonEmptyTileCount * tileBytes;
  const pageTableBytes =
    LAYER_OPFS_HEADER_OVERHEAD_BYTES + totalTileCount * TILE_PAGE_TABLE_ENTRY_BYTES;
  const tilePayloadBytes =
    explicitOpfsCompressedBytes !== undefined &&
    Number.isFinite(explicitOpfsCompressedBytes) &&
    explicitOpfsCompressedBytes >= 0
      ? Math.round(explicitOpfsCompressedBytes)
      : Math.round(sparseVramBytes * STUDIO_ROLE_SPECS[role].opfsCompressionRatio);

  return {
    denseVramBytes,
    sparseVramBytes,
    estimatedOpfsBytes: pageTableBytes + tilePayloadBytes,
  };
}

function sanitizePositiveInt(
  value: number,
  fallback: number,
  minValue: number,
): { readonly safe: number; readonly invalid: boolean } {
  if (!Number.isFinite(value) || value < minValue) {
    return { safe: fallback, invalid: true };
  }
  return { safe: Math.floor(value), invalid: false };
}

function sanitizeOpacity(value: number): { readonly safe: number; readonly invalid: boolean } {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
    return { safe: clamped, invalid: true };
  }
  return { safe: value, invalid: false };
}

function sortSiblingsBottomToTop(siblings: readonly InternalWorkingNode[]): InternalWorkingNode[] {
  return [...siblings].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    if (a.inputIndex !== b.inputIndex) return a.inputIndex - b.inputIndex;
    return a.raw.id.localeCompare(b.raw.id);
  });
}

function detectTreeIntegrity(
  workingNodes: readonly InternalWorkingNode[],
  issues: LayerHygieneIssue[],
): {
  readonly nodeById: Map<string, InternalWorkingNode>;
  readonly childrenByParent: Map<string | null, InternalWorkingNode[]>;
  readonly hasIntegrityError: boolean;
} {
  const nodeById = new Map<string, InternalWorkingNode>();
  let hasIntegrityError = false;

  for (let i = 0; i < workingNodes.length; i += 1) {
    const entry = workingNodes[i];
    const id = entry.raw.id;
    if (nodeById.has(id)) {
      hasIntegrityError = true;
      issues.push({
        code: "duplicate-node-id",
        severity: "critical",
        layerId: id,
        relatedLayerIds: [id],
        messageKo: `레이어 ID '${id}'가 트리 안에 중복 등록되어 무결성 검사를 차단했습니다.`,
      });
    } else {
      nodeById.set(id, entry);
    }
  }

  const childrenByParent = new Map<string | null, InternalWorkingNode[]>();
  const uniqueNodes = Array.from(nodeById.values());

  for (let i = 0; i < uniqueNodes.length; i += 1) {
    const entry = uniqueNodes[i];
    const parentId = entry.raw.parentId;
    if (parentId !== null) {
      const parent = nodeById.get(parentId);
      if (!parent) {
        hasIntegrityError = true;
        issues.push({
          code: "orphan-parent",
          severity: "critical",
          layerId: entry.raw.id,
          relatedLayerIds: [parentId],
          messageKo: `레이어 '${entry.raw.id}'의 상위 부모 '${parentId}'가 트리에 없어 고아 노드로 차단했습니다.`,
        });
      } else if (parent.raw.kind !== "folder") {
        hasIntegrityError = true;
        issues.push({
          code: "non-folder-parent",
          severity: "critical",
          layerId: entry.raw.id,
          relatedLayerIds: [parentId],
          messageKo: `레이어 '${entry.raw.id}'의 상위 부모 '${parentId}'가 폴더가 아니라 '${parent.raw.kind}' 타입입니다.`,
        });
      }
    }
    const list = childrenByParent.get(parentId) ?? [];
    list.push(entry);
    childrenByParent.set(parentId, list);
  }

  const reportedCycleSignatures = new Set<string>();
  for (let i = 0; i < uniqueNodes.length; i += 1) {
    const visitedIndex = new Map<string, number>();
    const path: string[] = [];
    let current: InternalWorkingNode | undefined = uniqueNodes[i];

    while (current !== undefined) {
      const existingIdx = visitedIndex.get(current.raw.id);
      if (existingIdx !== undefined) {
        const cycleIds = path.slice(existingIdx);
        const signature = [...cycleIds].sort().join("|");
        hasIntegrityError = true;
        if (!reportedCycleSignatures.has(signature)) {
          reportedCycleSignatures.add(signature);
          issues.push({
            code: "cycle",
            severity: "critical",
            layerId: cycleIds[0],
            relatedLayerIds: cycleIds,
            messageKo: `순환 참조(${cycleIds.join(" -> ")} -> ${cycleIds[0]})가 감지되어 자동 최적화와 병합을 차단했습니다.`,
          });
        }
        break;
      }
      visitedIndex.set(current.raw.id, path.length);
      path.push(current.raw.id);
      if (current.raw.parentId === null) break;
      current = nodeById.get(current.raw.parentId);
    }
  }

  if (!hasIntegrityError) {
    for (let i = 0; i < uniqueNodes.length; i += 1) {
      let depth = 0;
      let cursor: InternalWorkingNode | undefined = uniqueNodes[i];
      let guard = 0;
      while (cursor && cursor.raw.parentId !== null && guard <= uniqueNodes.length) {
        depth += 1;
        cursor = nodeById.get(cursor.raw.parentId);
        guard += 1;
      }
      uniqueNodes[i].depth = depth;
    }
  }

  return { nodeById, childrenByParent, hasIntegrityError };
}

function isValidClipMatteBase(base: InternalWorkingNode): boolean {
  if (base.raw.kind === "guide" || base.raw.kind === "adjustment") return false;
  if (base.raw.kind === "folder" && base.raw.blendMode === "pass-through") return false;
  return true;
}

function auditClippingChainsInParent(
  orderedSiblings: readonly InternalWorkingNode[],
  issues: LayerHygieneIssue[],
): void {
  for (let i = 0; i < orderedSiblings.length; i += 1) {
    const node = orderedSiblings[i];
    if (!node.raw.clippedToBelow) continue;

    let baseIndex = i - 1;
    while (baseIndex >= 0 && orderedSiblings[baseIndex].raw.clippedToBelow) {
      baseIndex -= 1;
    }

    if (baseIndex < 0) {
      issues.push({
        code: "dangling-clip-mask",
        severity: "error",
        layerId: node.raw.id,
        relatedLayerIds: node.raw.parentId ? [node.raw.parentId] : [],
        messageKo:
          node.raw.parentId === null
            ? `레이어 '${node.raw.rawName}'에 클리핑 마스크가 켜져 있으나 바로 아래 베이스 레이어가 없습니다.`
            : `레이어 '${node.raw.rawName}'의 클리핑 마스크가 폴더 '${node.raw.parentId}' 경계에서 끊겨 베이스 레이어를 잃었습니다.`,
      });
      continue;
    }

    const base = orderedSiblings[baseIndex];
    if (!isValidClipMatteBase(base)) {
      issues.push({
        code: "dangling-clip-mask",
        severity: "error",
        layerId: node.raw.id,
        relatedLayerIds: [base.raw.id],
        messageKo: `레이어 '${node.raw.rawName}'의 클리핑 베이스 '${base.raw.rawName}'(${base.raw.kind}/${base.raw.blendMode})는 유효한 알파 매트를 만들지 못합니다.`,
      });
      continue;
    }

    node.clipBaseLayerId = base.raw.id;
    base.isClipChainBase = true;

    const nodeEmptyOrHidden =
      (isPixelBackedKind(node.raw.kind) && node.nonEmptyTileCount === 0) || !node.raw.visible;
    const baseEmptyOrHidden =
      (isPixelBackedKind(base.raw.kind) && base.nonEmptyTileCount === 0) || !base.raw.visible;

    if (nodeEmptyOrHidden) {
      issues.push({
        code: "redundant-clip-mask",
        severity: "warning",
        layerId: node.raw.id,
        relatedLayerIds: [base.raw.id],
        messageKo: `비어 있거나 숨겨진 레이어 '${node.raw.rawName}'에 불필요한 클리핑 마스크가 유지되고 있습니다.`,
      });
    } else if (baseEmptyOrHidden) {
      issues.push({
        code: "redundant-clip-mask",
        severity: "warning",
        layerId: node.raw.id,
        relatedLayerIds: [base.raw.id],
        messageKo: `클리핑 베이스 '${base.raw.rawName}'가 비어 있거나 숨겨져 있어 '${node.raw.rawName}'의 클리핑이 화면에 반영되지 않습니다.`,
      });
    }
  }
}

function assignRolesBottomUp(
  uniqueNodes: readonly InternalWorkingNode[],
  childrenByParent: ReadonlyMap<string | null, readonly InternalWorkingNode[]>,
): void {
  const byDepthDesc = [...uniqueNodes].sort((a, b) =>
    b.depth !== a.depth ? b.depth - a.depth : a.inputIndex - b.inputIndex,
  );
  for (let i = 0; i < byDepthDesc.length; i += 1) {
    const node = byDepthDesc[i];
    if (node.raw.kind === "folder") {
      const childRoles = (childrenByParent.get(node.raw.id) ?? []).map((c) => c.inferredRole);
      node.inferredRole = inferStudioLayerRole(node.raw, childRoles);
    } else {
      node.inferredRole = inferStudioLayerRole(node.raw);
    }
  }
}

function normalizeNamesPerParent(
  childrenByParent: ReadonlyMap<string | null, readonly InternalWorkingNode[]>,
): void {
  const parentKeys = Array.from(childrenByParent.keys()).sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    return a.localeCompare(b);
  });

  for (let p = 0; p < parentKeys.length; p += 1) {
    const siblings = sortSiblingsBottomToTop(childrenByParent.get(parentKeys[p]) ?? []);
    const usedNames = new Set<string>();
    const stemSequence = new Map<string, number>();

    for (let i = 0; i < siblings.length; i += 1) {
      const node = siblings[i];
      const trimmed = node.raw.rawName.trim();
      const roleSpec = STUDIO_ROLE_SPECS[node.inferredRole];
      const alreadyCanonical = isCanonicalStudioLayerName(trimmed);
      const meaningless = isMeaninglessLayerName(trimmed);

      if (alreadyCanonical && !usedNames.has(trimmed)) {
        node.normalizedName = trimmed;
        node.renameReason = "already-canonical";
        usedNames.add(trimmed);
        continue;
      }

      const stem = extractCleanLayerStem(trimmed);
      const baseStem =
        stem.length > 0
          ? stem
          : node.raw.kind === "folder"
            ? `${roleSpec.defaultStem}_GRP`
            : roleSpec.defaultStem;

      const basePrefix = `${roleSpec.prefix}_${baseStem}`;
      let seq = (stemSequence.get(basePrefix) ?? 0) + 1;
      let candidate = `${basePrefix}_${String(seq).padStart(2, "0")}`;
      while (usedNames.has(candidate)) {
        seq += 1;
        candidate = `${basePrefix}_${String(seq).padStart(2, "0")}`;
      }
      stemSequence.set(basePrefix, seq);
      usedNames.add(candidate);

      node.normalizedName = candidate;
      node.renameReason = alreadyCanonical
        ? "disambiguate-collision"
        : meaningless
          ? "replace-meaningless-name"
          : "apply-studio-prefix";
    }
  }
}

function buildWorkingNodes(
  nodes: readonly LayerTreeNodeInput[],
  issues: LayerHygieneIssue[],
): InternalWorkingNode[] {
  const workingNodes: InternalWorkingNode[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const raw = nodes[i];
    const op = sanitizeOpacity(raw.opacity);
    const tileSize = sanitizePositiveInt(raw.tileSizePx, 256, 1);
    const bpp = sanitizePositiveInt(raw.bytesPerPixel, 4, 1);
    const totalTiles = sanitizePositiveInt(raw.totalTileCount, 0, 0);
    const nonEmptyRaw = sanitizePositiveInt(raw.nonEmptyTileCount, 0, 0);
    const exceedsTotal = nonEmptyRaw.safe > totalTiles.safe;
    const safeNonEmpty = exceedsTotal ? totalTiles.safe : nonEmptyRaw.safe;
    const safeOrder =
      raw.orderIndex !== undefined && Number.isFinite(raw.orderIndex) ? raw.orderIndex : i;

    if (
      op.invalid ||
      tileSize.invalid ||
      bpp.invalid ||
      totalTiles.invalid ||
      nonEmptyRaw.invalid ||
      exceedsTotal ||
      (raw.orderIndex !== undefined && !Number.isFinite(raw.orderIndex))
    ) {
      issues.push({
        code: "invalid-numeric-metadata",
        severity: "warning",
        layerId: raw.id,
        relatedLayerIds: [],
        messageKo: `레이어 '${raw.id}'에 비유한 또는 범위 초과 수치 메타데이터가 있어 안전 범위로 보정했습니다.`,
      });
    }

    let safeTileIndices: readonly number[] | undefined;
    if (raw.activeTileIndices !== undefined) {
      const uniqueIndices = new Set<number>();
      for (let t = 0; t < raw.activeTileIndices.length; t += 1) {
        const idx = raw.activeTileIndices[t];
        if (Number.isFinite(idx) && idx >= 0 && idx < totalTiles.safe) {
          uniqueIndices.add(Math.floor(idx));
        }
      }
      safeTileIndices = Array.from(uniqueIndices).sort((a, b) => a - b);
    }

    workingNodes.push({
      raw,
      inputIndex: i,
      orderIndex: safeOrder,
      opacity: op.safe,
      nonEmptyTileCount: safeTileIndices !== undefined ? safeTileIndices.length : safeNonEmpty,
      totalTileCount: totalTiles.safe,
      tileSizePx: tileSize.safe,
      bytesPerPixel: bpp.safe,
      activeTileIndices: safeTileIndices,
      depth: 0,
      inferredRole: "flat",
      normalizedName: raw.rawName.trim() || raw.id,
      renameReason: "already-canonical",
      clipBaseLayerId: null,
      isClipChainBase: false,
    });
  }
  return workingNodes;
}

/**
 * 웹툰 원고 레이어 트리의 무결성·명명·클리핑·빈/숨김 대용량 레이어를 일괄 감사하고
 * 한국 스튜디오 표준 코드명으로 자동 정규화한다.
 */
export function auditLayerTreeHygiene(
  nodes: readonly LayerTreeNodeInput[],
  options: LayerTreeAuditOptions = {},
): LayerTreeHygieneAuditResult {
  const documentId = options.documentId?.trim() || "episode-untitled";
  const hiddenThreshold =
    options.hiddenHeavyVramThresholdBytes !== undefined &&
    Number.isFinite(options.hiddenHeavyVramThresholdBytes) &&
    options.hiddenHeavyVramThresholdBytes >= 0
      ? options.hiddenHeavyVramThresholdBytes
      : DEFAULT_HIDDEN_HEAVY_VRAM_THRESHOLD_BYTES;

  const issues: LayerHygieneIssue[] = [];
  const workingNodes = buildWorkingNodes(nodes, issues);
  const { nodeById, childrenByParent, hasIntegrityError } = detectTreeIntegrity(
    workingNodes,
    issues,
  );
  const uniqueNodes = Array.from(nodeById.values());

  assignRolesBottomUp(uniqueNodes, childrenByParent);
  normalizeNamesPerParent(childrenByParent);

  const parentEntries = Array.from(childrenByParent.entries()).sort((a, b) => {
    if (a[0] === null) return -1;
    if (b[0] === null) return 1;
    return a[0].localeCompare(b[0]);
  });
  for (let p = 0; p < parentEntries.length; p += 1) {
    auditClippingChainsInParent(sortSiblingsBottomToTop(parentEntries[p][1]), issues);
  }

  const orderedSanitized: SanitizedLayerNode[] = [];
  const visitedForOrder = new Set<string>();

  const pushSanitized = (entry: InternalWorkingNode): void => {
    if (visitedForOrder.has(entry.raw.id)) return;
    visitedForOrder.add(entry.raw.id);

    const vram = computeNodeVramAndOpfs(
      entry.raw.kind,
      entry.inferredRole,
      entry.nonEmptyTileCount,
      entry.totalTileCount,
      entry.tileSizePx,
      entry.bytesPerPixel,
      entry.raw.hasAlphaMask,
      entry.raw.opfsCompressedBytes,
    );

    if (isMeaninglessLayerName(entry.raw.rawName)) {
      issues.push({
        code: "meaningless-name",
        severity: "warning",
        layerId: entry.raw.id,
        relatedLayerIds: [],
        messageKo: `무의미한 레이어명 '${entry.raw.rawName}'을 스튜디오 표준 '${entry.normalizedName}'으로 정규화 대상으로 지정했습니다.`,
      });
    }

    if (entry.raw.kind === "folder") {
      if ((childrenByParent.get(entry.raw.id) ?? []).length === 0) {
        issues.push({
          code: "empty-folder",
          severity: "info",
          layerId: entry.raw.id,
          relatedLayerIds: [],
          messageKo: `빈 폴더 '${entry.raw.rawName}' 안에 하위 레이어가 없습니다.`,
        });
      }
    } else if (isPixelBackedKind(entry.raw.kind)) {
      if (entry.nonEmptyTileCount === 0) {
        issues.push({
          code: "empty-layer",
          severity: "info",
          layerId: entry.raw.id,
          relatedLayerIds: [],
          messageKo: `빈 레이어 '${entry.raw.rawName}'에 활성 픽셀 타일이 0개입니다.`,
        });
      } else if (!entry.raw.visible && vram.sparseVramBytes >= hiddenThreshold) {
        const mib = (vram.sparseVramBytes / (1024 * 1024)).toFixed(2);
        issues.push({
          code: "hidden-heavy-layer",
          severity: "warning",
          layerId: entry.raw.id,
          relatedLayerIds: [],
          messageKo: `숨겨진 레이어 '${entry.raw.rawName}'가 활성 타일 ${entry.nonEmptyTileCount}개(${mib} MiB)를 점유하고 있습니다.`,
        });
      }
    }

    orderedSanitized.push({
      id: entry.raw.id,
      parentId: entry.raw.parentId,
      orderIndex: entry.orderIndex,
      inputIndex: entry.inputIndex,
      depth: entry.depth,
      rawName: entry.raw.rawName,
      normalizedName: entry.normalizedName,
      renameReason: entry.renameReason,
      inferredRole: entry.inferredRole,
      kind: entry.raw.kind,
      blendMode: entry.raw.blendMode,
      opacity: entry.opacity,
      visible: entry.raw.visible,
      locked: entry.raw.locked,
      clippedToBelow: entry.raw.clippedToBelow,
      clipBaseLayerId: entry.clipBaseLayerId,
      isClipChainBase: entry.isClipChainBase,
      nonEmptyTileCount: entry.nonEmptyTileCount,
      totalTileCount: entry.totalTileCount,
      tileSizePx: entry.tileSizePx,
      bytesPerPixel: entry.bytesPerPixel,
      hasAlphaMask: entry.raw.hasAlphaMask,
      denseVramBytes: vram.denseVramBytes,
      sparseVramBytes: vram.sparseVramBytes,
      estimatedOpfsBytes: vram.estimatedOpfsBytes,
      activeTileIndices: entry.activeTileIndices,
    });
  };

  const walkTree = (parentId: string | null): void => {
    const children = sortSiblingsBottomToTop(childrenByParent.get(parentId) ?? []);
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (visitedForOrder.has(child.raw.id)) continue;
      pushSanitized(child);
      if (child.raw.kind === "folder") walkTree(child.raw.id);
    }
  };
  walkTree(null);

  const remaining = [...uniqueNodes].sort((a, b) => a.inputIndex - b.inputIndex);
  for (let i = 0; i < remaining.length; i += 1) {
    pushSanitized(remaining[i]);
  }

  const renameMap: LayerRenameEntry[] = orderedSanitized.map((n) => ({
    layerId: n.id,
    rawName: n.rawName,
    normalizedName: n.normalizedName,
    inferredRole: n.inferredRole,
    reason: n.renameReason,
  }));

  let integrityErrorCount = 0;
  let meaninglessNameCount = 0;
  let emptyLayerCount = 0;
  let hiddenHeavyLayerCount = 0;
  let danglingClipMaskCount = 0;
  let redundantClipMaskCount = 0;

  for (let i = 0; i < issues.length; i += 1) {
    const code = issues[i].code;
    if (
      code === "cycle" ||
      code === "orphan-parent" ||
      code === "non-folder-parent" ||
      code === "duplicate-node-id"
    ) {
      integrityErrorCount += 1;
    } else if (code === "meaningless-name") {
      meaninglessNameCount += 1;
    } else if (code === "empty-layer") {
      emptyLayerCount += 1;
    } else if (code === "hidden-heavy-layer") {
      hiddenHeavyLayerCount += 1;
    } else if (code === "dangling-clip-mask") {
      danglingClipMaskCount += 1;
    } else if (code === "redundant-clip-mask") {
      redundantClipMaskCount += 1;
    }
  }

  return {
    documentId,
    integrityStatus: hasIntegrityError ? "failed-closed" : "valid",
    safeToCompile: !hasIntegrityError,
    totalLayerCount: orderedSanitized.length,
    folderCount: orderedSanitized.filter((n) => n.kind === "folder").length,
    pixelLayerCount: orderedSanitized.filter((n) => isPixelBackedKind(n.kind)).length,
    nodes: orderedSanitized,
    renameMap,
    issues,
    integrityErrorCount,
    meaninglessNameCount,
    emptyLayerCount,
    hiddenHeavyLayerCount,
    danglingClipMaskCount,
    redundantClipMaskCount,
  };
}
