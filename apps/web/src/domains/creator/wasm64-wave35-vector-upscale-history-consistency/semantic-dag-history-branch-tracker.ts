/**
 * Wave-35: 시맨틱 프로젝트 히스토리 DAG 및 비파괴 A/B 룩데브 브랜치 추적기
 * (`semantic-dag-history-branch-tracker`).
 *
 * - 짧은 시간 안에 연속 입력되는 미세 브러시 획·속성 조정을 창작 단계(`sketch`·`ink`·`flat-color`·`shading`·`lighting`·`fx-lettering`)
 *   단위의 의미 있는 체크포인트로 자동 병합하여 실행 취소 타임라인 오염을 방지한다.
 * - 콘텐츠 주소 지정(CAS) 타일 해시 저장소를 통해 A/B 룩데브 브랜치(석양 vs 달빛) 사이에서
 *   변경되지 않은 원고 타일을 물리 메모리 복제 없이 제로카피로 공유한다.
 * - 임의 두 체크포인트 사이의 정밀 레이어 구조 차분(`diffHistoryCheckpoints`)과 선택적 원클릭 복원을 지원한다.
 */

export const DEFAULT_COALESCE_WINDOW_MS = 2500 as const;
export const DEFAULT_MAX_COALESCED_OPS = 32 as const;
export const DEFAULT_MAIN_BRANCH_NAME = "main" as const;

export type CreativeHistoryStage = "sketch" | "ink" | "flat-color" | "shading" | "lighting" | "fx-lettering";
export type HistoryLayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "add";

export interface HistoryTileRef {
  readonly tileKey: string;
  readonly contentHash: string;
  readonly byteLength: number;
}

export interface HistoryLayerSnapshot {
  readonly layerId: string;
  readonly nameKo: string;
  readonly stage: CreativeHistoryStage;
  readonly blendMode: HistoryLayerBlendMode;
  readonly opacity: number;
  readonly visible: boolean;
  readonly zIndex: number;
  readonly tiles: Readonly<Record<string, HistoryTileRef>>;
}

export interface HistoryCheckpointNode {
  readonly checkpointId: string;
  readonly parentCheckpointId: string | null;
  readonly restoredFromCheckpointId: string | null;
  readonly branchName: string;
  readonly stage: CreativeHistoryStage;
  readonly titleKo: string;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly isPinned: boolean;
  readonly coalescedOpIds: readonly string[];
  readonly layers: Readonly<Record<string, HistoryLayerSnapshot>>;
}

export interface MicroEditOperation {
  readonly opId: string;
  readonly timestampMs: number;
  readonly stage: CreativeHistoryStage;
  readonly labelKo: string;
  readonly targetLayerId: string;
  readonly layerPatch?: Partial<Omit<HistoryLayerSnapshot, "layerId" | "tiles">>;
  readonly removeLayer?: boolean;
  readonly updatedTiles?: Readonly<Record<string, HistoryTileRef | null>>;
  readonly forceNewCheckpoint?: boolean;
}

export interface HistoryCoalescePolicy {
  readonly coalesceWindowMs?: number;
  readonly maxOpsPerCheckpoint?: number;
}

export interface LayerStructuralModification {
  readonly layerId: string;
  readonly nameKo: string;
  readonly stage: CreativeHistoryStage;
  readonly metadataChangedFields: readonly string[];
  readonly changedTileKeys: readonly string[];
  readonly unchangedTileKeys: readonly string[];
  readonly byteDelta: number;
}

export interface HistoryCheckpointDiff {
  readonly baseCheckpointId: string;
  readonly targetCheckpointId: string;
  readonly addedLayers: readonly HistoryLayerSnapshot[];
  readonly removedLayers: readonly HistoryLayerSnapshot[];
  readonly modifiedLayers: readonly LayerStructuralModification[];
  readonly unchangedLayerIds: readonly string[];
  readonly totalChangedTileCount: number;
}

export interface DagStorageDeduplicationStats {
  readonly uniqueTileHashCount: number;
  readonly totalLogicalTileReferences: number;
  readonly physicalStoredBytes: number;
  readonly logicalUnsharedBytes: number;
  readonly savedBytes: number;
  readonly zeroCopySharingRatio: number;
  readonly sharedAcrossBranchesHashCount: number;
}

export interface SelectiveLayerRestoreRequest {
  readonly targetBranchName?: string;
  readonly sourceCheckpointId: string;
  readonly layerIds: readonly string[];
  readonly timestampMs: number;
  readonly labelKo?: string;
}

export interface SemanticDagInitOptions {
  readonly initialLayers?: readonly HistoryLayerSnapshot[];
  readonly initialTimestampMs?: number;
  readonly initialStage?: CreativeHistoryStage;
  readonly rootTitleKo?: string;
  readonly policy?: HistoryCoalescePolicy;
}

const STAGE_LABELS_KO: Readonly<Record<CreativeHistoryStage, string>> = {
  sketch: "스케치 구도",
  ink: "펜선 잉킹",
  "flat-color": "밑색 채우기",
  shading: "명암 채색",
  lighting: "조명·분위기",
  "fx-lettering": "효과음·식자",
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function sumLayerBytes(layer: HistoryLayerSnapshot): number {
  let sum = 0;
  for (const tile of Object.values(layer.tiles)) sum += Math.max(0, tile.byteLength);
  return sum;
}

/**
 * 임의 두 히스토리 체크포인트 사이의 레이어·타일 단위 정밀 구조 차분을 계산한다.
 */
export function diffHistoryCheckpoints(
  baseCheckpoint: HistoryCheckpointNode,
  targetCheckpoint: HistoryCheckpointNode,
): HistoryCheckpointDiff {
  const addedLayers: HistoryLayerSnapshot[] = [];
  const removedLayers: HistoryLayerSnapshot[] = [];
  const modifiedLayers: LayerStructuralModification[] = [];
  const unchangedLayerIds: string[] = [];
  let totalChangedTileCount = 0;

  const sortedLayerIds = [
    ...new Set<string>([
      ...Object.keys(baseCheckpoint.layers),
      ...Object.keys(targetCheckpoint.layers),
    ]),
  ].sort();

  for (const layerId of sortedLayerIds) {
    const baseLayer = baseCheckpoint.layers[layerId];
    const targetLayer = targetCheckpoint.layers[layerId];

    if (!baseLayer && targetLayer) {
      addedLayers.push(targetLayer);
      totalChangedTileCount += Object.keys(targetLayer.tiles).length;
      continue;
    }
    if (baseLayer && !targetLayer) {
      removedLayers.push(baseLayer);
      totalChangedTileCount += Object.keys(baseLayer.tiles).length;
      continue;
    }
    if (!baseLayer || !targetLayer) continue;

    const metadataChangedFields: string[] = [];
    if (baseLayer.nameKo !== targetLayer.nameKo) metadataChangedFields.push("nameKo");
    if (baseLayer.stage !== targetLayer.stage) metadataChangedFields.push("stage");
    if (baseLayer.blendMode !== targetLayer.blendMode) metadataChangedFields.push("blendMode");
    if (Math.abs(baseLayer.opacity - targetLayer.opacity) > 1e-6) metadataChangedFields.push("opacity");
    if (baseLayer.visible !== targetLayer.visible) metadataChangedFields.push("visible");
    if (baseLayer.zIndex !== targetLayer.zIndex) metadataChangedFields.push("zIndex");

    const allTileKeys = [
      ...new Set<string>([...Object.keys(baseLayer.tiles), ...Object.keys(targetLayer.tiles)]),
    ].sort();
    const changedTileKeys: string[] = [];
    const unchangedTileKeys: string[] = [];

    for (const tileKey of allTileKeys) {
      const baseTile = baseLayer.tiles[tileKey];
      const targetTile = targetLayer.tiles[tileKey];
      if (baseTile && targetTile && baseTile.contentHash === targetTile.contentHash) {
        unchangedTileKeys.push(tileKey);
      } else {
        changedTileKeys.push(tileKey);
      }
    }

    if (metadataChangedFields.length === 0 && changedTileKeys.length === 0) {
      unchangedLayerIds.push(layerId);
    } else {
      totalChangedTileCount += changedTileKeys.length;
      modifiedLayers.push({
        layerId,
        nameKo: targetLayer.nameKo,
        stage: targetLayer.stage,
        metadataChangedFields,
        changedTileKeys,
        unchangedTileKeys,
        byteDelta: sumLayerBytes(targetLayer) - sumLayerBytes(baseLayer),
      });
    }
  }

  return {
    baseCheckpointId: baseCheckpoint.checkpointId,
    targetCheckpointId: targetCheckpoint.checkpointId,
    addedLayers,
    removedLayers,
    modifiedLayers,
    unchangedLayerIds,
    totalChangedTileCount,
  };
}

/**
 * 시맨틱 마이크로 편집 병합, 제로카피 CAS 타일 공유 및 비파괴 A/B 룩데브 분기를 관리하는 히스토리 DAG 엔진.
 */
export class SemanticHistoryDagTracker {
  private readonly checkpoints = new Map<string, HistoryCheckpointNode>();
  private readonly branchHeads = new Map<string, string>();
  private readonly childCountById = new Map<string, number>();
  private readonly tileCasCatalog = new Map<string, number>();
  private activeBranchName: string = DEFAULT_MAIN_BRANCH_NAME;
  private nextSequence = 1;
  private readonly coalesceWindowMs: number;
  private readonly maxOpsPerCheckpoint: number;

  public constructor(options: SemanticDagInitOptions = {}) {
    this.coalesceWindowMs = Math.max(0, options.policy?.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS);
    this.maxOpsPerCheckpoint = Math.max(1, Math.round(options.policy?.maxOpsPerCheckpoint ?? DEFAULT_MAX_COALESCED_OPS));

    const layerRecord: Record<string, HistoryLayerSnapshot> = {};
    for (const layer of options.initialLayers ?? []) {
      const normalizedTiles: Record<string, HistoryTileRef> = {};
      for (const [key, tile] of Object.entries(layer.tiles)) {
        normalizedTiles[key] = tile;
        this.registerTileInCas(tile);
      }
      layerRecord[layer.layerId] = { ...layer, opacity: clamp01(layer.opacity), tiles: normalizedTiles };
    }

    const rootId = this.mintCheckpointId();
    const initialTs = options.initialTimestampMs ?? 0;
    const rootNode: HistoryCheckpointNode = {
      checkpointId: rootId,
      parentCheckpointId: null,
      restoredFromCheckpointId: null,
      branchName: DEFAULT_MAIN_BRANCH_NAME,
      stage: options.initialStage ?? "sketch",
      titleKo: options.rootTitleKo ?? "원고 초기 캔버스",
      startedAtMs: initialTs,
      endedAtMs: initialTs,
      isPinned: true,
      coalescedOpIds: [],
      layers: layerRecord,
    };
    this.checkpoints.set(rootId, rootNode);
    this.childCountById.set(rootId, 0);
    this.branchHeads.set(DEFAULT_MAIN_BRANCH_NAME, rootId);
  }

  public getActiveBranchName(): string { return this.activeBranchName; }
  public listBranchNames(): readonly string[] { return [...this.branchHeads.keys()]; }
  public getCheckpoint(checkpointId: string): HistoryCheckpointNode | undefined { return this.checkpoints.get(checkpointId); }
  public getAllCheckpoints(): readonly HistoryCheckpointNode[] { return [...this.checkpoints.values()]; }

  public getBranchHead(branchName: string = this.activeBranchName): HistoryCheckpointNode {
    const headId = this.branchHeads.get(branchName);
    const head = headId ? this.checkpoints.get(headId) : undefined;
    if (!head) throw new Error(`존재하지 않는 히스토리 브랜치입니다: ${branchName}`);
    return head;
  }

  /** 지정한 체크포인트에서 새 비파괴 A/B 룩데브 브랜치를 분기하고 선택적으로 전환한다. */
  public createBranch(branchName: string, fromCheckpointId?: string, switchImmediately: boolean = true): HistoryCheckpointNode {
    const trimmed = branchName.trim();
    if (!trimmed) throw new Error("브랜치 이름은 비어 있을 수 없습니다.");
    if (this.branchHeads.has(trimmed)) throw new Error(`이미 존재하는 브랜치 이름입니다: ${trimmed}`);
    const baseNode = fromCheckpointId ? this.checkpoints.get(fromCheckpointId) : this.getBranchHead(this.activeBranchName);
    if (!baseNode) throw new Error(`분기 기준 체크포인트를 찾을 수 없습니다: ${fromCheckpointId ?? ""}`);
    this.branchHeads.set(trimmed, baseNode.checkpointId);
    if (switchImmediately) this.activeBranchName = trimmed;
    return baseNode;
  }

  public switchBranch(branchName: string): HistoryCheckpointNode {
    const head = this.getBranchHead(branchName);
    this.activeBranchName = branchName;
    return head;
  }

  public pinCheckpoint(checkpointId: string, customTitleKo?: string): HistoryCheckpointNode {
    const node = this.checkpoints.get(checkpointId);
    if (!node) throw new Error(`고정할 체크포인트를 찾을 수 없습니다: ${checkpointId}`);
    const pinned: HistoryCheckpointNode = { ...node, isPinned: true, titleKo: customTitleKo ?? node.titleKo };
    this.checkpoints.set(checkpointId, pinned);
    return pinned;
  }

  /**
   * 미세 편집을 기록한다. 동일 창작 단계·시간 창 안의 연속 입력은 현재 헤드에 병합하고,
   * 단계 전환·시간 초과·고정·분기가 있으면 새 DAG 체크포인트를 생성한다.
   */
  public recordMicroEdit(
    op: MicroEditOperation,
    branchName: string = this.activeBranchName,
  ): HistoryCheckpointNode {
    const head = this.getBranchHead(branchName);
    const nextLayers = this.applyOperationToLayers(head.layers, op);

    const headSharedByOtherBranches = this.countBranchesPointingTo(head.checkpointId) > 1;
    const headHasChildren = (this.childCountById.get(head.checkpointId) ?? 0) > 0;
    const withinWindow = op.timestampMs >= head.endedAtMs && op.timestampMs - head.endedAtMs <= this.coalesceWindowMs;
    const canCoalesce =
      !op.forceNewCheckpoint &&
      !head.isPinned &&
      !headHasChildren &&
      !headSharedByOtherBranches &&
      head.branchName === branchName &&
      head.stage === op.stage &&
      head.coalescedOpIds.length < this.maxOpsPerCheckpoint &&
      withinWindow;

    if (canCoalesce) {
      const mergedOps = [...head.coalescedOpIds, op.opId];
      const coalescedNode: HistoryCheckpointNode = {
        ...head,
        endedAtMs: Math.max(head.endedAtMs, op.timestampMs),
        coalescedOpIds: mergedOps,
        titleKo: `${STAGE_LABELS_KO[op.stage]} (${mergedOps.length}회 연속 편집 병합)`,
        layers: nextLayers,
      };
      this.checkpoints.set(head.checkpointId, coalescedNode);
      return coalescedNode;
    }

    return this.appendChildCheckpoint(head, branchName, {
      restoredFromCheckpointId: null,
      stage: op.stage,
      titleKo: op.labelKo || STAGE_LABELS_KO[op.stage],
      timestampMs: op.timestampMs,
      isPinned: false,
      coalescedOpIds: [op.opId],
      layers: nextLayers,
    });
  }

  public diffCheckpoints(baseCheckpointId: string, targetCheckpointId: string): HistoryCheckpointDiff {
    const base = this.checkpoints.get(baseCheckpointId);
    const target = this.checkpoints.get(targetCheckpointId);
    if (!base || !target) throw new Error("차분 비교 대상 체크포인트 ID가 유효하지 않습니다.");
    return diffHistoryCheckpoints(base, target);
  }

  public findLowestCommonAncestor(checkpointIdA: string, checkpointIdB: string): HistoryCheckpointNode | null {
    const ancestorsA = new Set<string>();
    let cursorA: string | null = checkpointIdA;
    while (cursorA) {
      ancestorsA.add(cursorA);
      cursorA = this.checkpoints.get(cursorA)?.parentCheckpointId ?? null;
    }
    let cursorB: string | null = checkpointIdB;
    while (cursorB) {
      if (ancestorsA.has(cursorB)) return this.checkpoints.get(cursorB) ?? null;
      cursorB = this.checkpoints.get(cursorB)?.parentCheckpointId ?? null;
    }
    return null;
  }

  /** 다른 브랜치 체크포인트에서 선택한 레이어들만 대상 브랜치 위로 제로카피 복원한다. */
  public restoreSelectedLayers(request: SelectiveLayerRestoreRequest): HistoryCheckpointNode {
    const branchName = request.targetBranchName ?? this.activeBranchName;
    const currentHead = this.getBranchHead(branchName);
    const sourceNode = this.checkpoints.get(request.sourceCheckpointId);
    if (!sourceNode) throw new Error(`복원 원본 체크포인트를 찾을 수 없습니다: ${request.sourceCheckpointId}`);

    const nextLayers: Record<string, HistoryLayerSnapshot> = { ...currentHead.layers };
    let primaryStage: CreativeHistoryStage = currentHead.stage;
    for (const layerId of request.layerIds) {
      const sourceLayer = sourceNode.layers[layerId];
      if (sourceLayer) {
        nextLayers[layerId] = sourceLayer;
        primaryStage = sourceLayer.stage;
      } else {
        delete nextLayers[layerId];
      }
    }

    return this.appendChildCheckpoint(currentHead, branchName, {
      restoredFromCheckpointId: sourceNode.checkpointId,
      stage: primaryStage,
      titleKo: request.labelKo ?? `'${sourceNode.branchName}' 브랜치에서 ${request.layerIds.length}개 레이어 선택 복원`,
      timestampMs: request.timestampMs,
      isPinned: true,
      coalescedOpIds: [],
      layers: nextLayers,
    });
  }

  public getStorageDeduplicationStats(): DagStorageDeduplicationStats {
    let totalLogicalTileReferences = 0;
    let logicalUnsharedBytes = 0;
    for (const node of this.checkpoints.values()) {
      for (const layer of Object.values(node.layers)) {
        for (const tile of Object.values(layer.tiles)) {
          totalLogicalTileReferences += 1;
          logicalUnsharedBytes += Math.max(0, tile.byteLength);
        }
      }
    }

    let physicalStoredBytes = 0;
    for (const byteLength of this.tileCasCatalog.values()) physicalStoredBytes += byteLength;

    const branchSetsByHash = new Map<string, Set<string>>();
    for (const [branchName, headId] of this.branchHeads.entries()) {
      const head = this.checkpoints.get(headId);
      if (!head) continue;
      for (const layer of Object.values(head.layers)) {
        for (const tile of Object.values(layer.tiles)) {
          let set = branchSetsByHash.get(tile.contentHash);
          if (!set) {
            set = new Set<string>();
            branchSetsByHash.set(tile.contentHash, set);
          }
          set.add(branchName);
        }
      }
    }

    let sharedAcrossBranchesHashCount = 0;
    for (const branches of branchSetsByHash.values()) {
      if (branches.size >= 2) sharedAcrossBranchesHashCount += 1;
    }

    const savedBytes = Math.max(0, logicalUnsharedBytes - physicalStoredBytes);
    return {
      uniqueTileHashCount: this.tileCasCatalog.size,
      totalLogicalTileReferences,
      physicalStoredBytes,
      logicalUnsharedBytes,
      savedBytes,
      zeroCopySharingRatio: logicalUnsharedBytes > 0 ? savedBytes / logicalUnsharedBytes : 0,
      sharedAcrossBranchesHashCount,
    };
  }

  private appendChildCheckpoint(
    parent: HistoryCheckpointNode,
    branchName: string,
    spec: {
      restoredFromCheckpointId: string | null;
      stage: CreativeHistoryStage;
      titleKo: string;
      timestampMs: number;
      isPinned: boolean;
      coalescedOpIds: readonly string[];
      layers: Readonly<Record<string, HistoryLayerSnapshot>>;
    },
  ): HistoryCheckpointNode {
    const newId = this.mintCheckpointId();
    const node: HistoryCheckpointNode = {
      checkpointId: newId,
      parentCheckpointId: parent.checkpointId,
      restoredFromCheckpointId: spec.restoredFromCheckpointId,
      branchName,
      stage: spec.stage,
      titleKo: spec.titleKo,
      startedAtMs: spec.timestampMs,
      endedAtMs: spec.timestampMs,
      isPinned: spec.isPinned,
      coalescedOpIds: spec.coalescedOpIds,
      layers: spec.layers,
    };
    this.checkpoints.set(newId, node);
    this.childCountById.set(newId, 0);
    this.childCountById.set(parent.checkpointId, (this.childCountById.get(parent.checkpointId) ?? 0) + 1);
    this.branchHeads.set(branchName, newId);
    return node;
  }

  private mintCheckpointId(): string {
    const id = `chk-${String(this.nextSequence).padStart(4, "0")}`;
    this.nextSequence += 1;
    return id;
  }

  private countBranchesPointingTo(checkpointId: string): number {
    let count = 0;
    for (const headId of this.branchHeads.values()) if (headId === checkpointId) count += 1;
    return count;
  }

  private registerTileInCas(tile: HistoryTileRef): void {
    if (!this.tileCasCatalog.has(tile.contentHash)) {
      this.tileCasCatalog.set(tile.contentHash, Math.max(0, tile.byteLength));
    }
  }

  private applyOperationToLayers(
    prevLayers: Readonly<Record<string, HistoryLayerSnapshot>>,
    op: MicroEditOperation,
  ): Readonly<Record<string, HistoryLayerSnapshot>> {
    const nextLayers: Record<string, HistoryLayerSnapshot> = { ...prevLayers };
    if (op.removeLayer) {
      delete nextLayers[op.targetLayerId];
      return nextLayers;
    }

    const existing = prevLayers[op.targetLayerId];
    const nextTiles: Record<string, HistoryTileRef> = existing ? { ...existing.tiles } : {};
    if (op.updatedTiles) {
      for (const [tileKey, tileRef] of Object.entries(op.updatedTiles)) {
        if (tileRef === null) delete nextTiles[tileKey];
        else {
          nextTiles[tileKey] = tileRef;
          this.registerTileInCas(tileRef);
        }
      }
    }

    nextLayers[op.targetLayerId] = {
      layerId: op.targetLayerId,
      nameKo: op.layerPatch?.nameKo ?? existing?.nameKo ?? op.targetLayerId,
      stage: op.layerPatch?.stage ?? existing?.stage ?? op.stage,
      blendMode: op.layerPatch?.blendMode ?? existing?.blendMode ?? "normal",
      opacity: clamp01(op.layerPatch?.opacity ?? existing?.opacity ?? 1),
      visible: op.layerPatch?.visible ?? existing?.visible ?? true,
      zIndex: op.layerPatch?.zIndex ?? existing?.zIndex ?? Object.keys(prevLayers).length,
      tiles: nextTiles,
    };
    return nextLayers;
  }
}
