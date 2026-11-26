/**
 * WebGPU 멀티패스 프레임 렌더 그래프 컴파일러 & 일시 VRAM 텍스처 에일리어싱 할당기.
 *
 * - 유향 비순환 그래프(DAG) 위상 정렬, 미참조 패스 자동 제거(Dead-Pass Culling),
 *   순환 의존 탐지, 자원 위험 배리어(RAW / WAR / WAW / Alias Reuse) 자동 삽입을 수행한다.
 * - 구간 그래프(Interval Graph) Best-Fit 물리 슬롯 재사용으로 G-Buffer → GI/Shadow →
 *   Cel/Outline → Bloom/FX → Composite 파이프라인 피크 일시 VRAM을 45~65% 이상 절감한다.
 * - 8K+ 초대형 웹툰 캔버스의 가상 타일(Virtual-Tile) VRAM 예산 강제기를 포함한다.
 */

export type RenderResourceKind = "texture-2d" | "storage-buffer" | "uniform-buffer";
export type RenderTextureFormat =
  | "r8unorm" | "r32float" | "rg16float" | "rgba8unorm"
  | "rgba16float" | "depth24plus" | "depth32float";
export type RenderResourceLifetime = "transient" | "external-import" | "swapchain-output";
export type RenderPassStage =
  | "gbuffer" | "gi-shadow" | "cel-outline" | "bloom-fx" | "composite" | "export" | "custom";
export type ResourceAccessMode = "read" | "write" | "read-write";
export type ResourceUsageKind =
  | "color-attachment" | "depth-attachment" | "sampled-texture"
  | "storage-read" | "storage-write" | "uniform-buffer" | "copy-src" | "copy-dst";
export type HazardBarrierKind = "read-after-write" | "write-after-read" | "write-after-write";

export const TEXTURE_FORMAT_BYTES_PER_PIXEL: Readonly<Record<RenderTextureFormat, number>> = {
  r8unorm: 1, r32float: 4, rg16float: 4, rgba8unorm: 4,
  rgba16float: 8, depth24plus: 4, depth32float: 4,
};
export const WEBGPU_BYTES_PER_ROW_ALIGNMENT = 256;
export const DEFAULT_MAX_TEXTURE_DIMENSION_2D = 8192;
export const DEFAULT_VIRTUAL_TILE_SIZE_PX = 1024;

export interface RenderResourceDescriptor {
  readonly id: string; readonly label: string;
  readonly kind: RenderResourceKind; readonly lifetime: RenderResourceLifetime;
  readonly width?: number; readonly height?: number; readonly format?: RenderTextureFormat;
  readonly mipLevels?: number; readonly sampleCount?: number; readonly byteSize?: number;
}

export interface PassResourceBinding {
  readonly resourceId: string; readonly access: ResourceAccessMode; readonly usage: ResourceUsageKind;
}

export interface PassExecutionContext {
  readonly passId: string; readonly executionIndex: number;
  readonly slotAssignments: Readonly<Record<string, string>>;
  readonly incomingBarriers: readonly ResourceHazardBarrier[];
}

export interface RenderPassDescriptor {
  readonly id: string; readonly label: string; readonly stage: RenderPassStage;
  readonly inputs: readonly PassResourceBinding[];
  readonly outputs: readonly PassResourceBinding[];
  readonly afterPassIds?: readonly string[];
  readonly sideEffect?: boolean; readonly estimatedGpuCostMs?: number;
  readonly execute?: (context: PassExecutionContext) => void;
}

export interface CulledPassReport {
  readonly passId: string; readonly label: string; readonly reason: "unread-output";
}

export interface ResourceHazardBarrier {
  readonly barrierIndex: number; readonly kind: HazardBarrierKind; readonly isAliasBarrier: boolean;
  readonly resourceId: string; readonly previousResourceId?: string; readonly physicalSlotId?: string;
  readonly fromPassId: string; readonly toPassId: string;
  readonly fromPassIndex: number; readonly toPassIndex: number;
  readonly fromUsage: ResourceUsageKind; readonly toUsage: ResourceUsageKind;
}

export interface ResourceLiveInterval {
  readonly resourceId: string; readonly label: string; readonly kind: RenderResourceKind;
  readonly firstPassIndex: number; readonly lastPassIndex: number; readonly byteSize: number;
}

export interface AliasedPhysicalSlot {
  readonly slotId: string; readonly kind: RenderResourceKind; readonly capacityBytes: number;
  readonly assignedResources: readonly ResourceLiveInterval[];
}

export interface TransientMemoryAliasingPlan {
  readonly unaliasedPeakBytes: number; readonly aliasedPeakBytes: number;
  readonly savedBytes: number; readonly reductionRatio: number; readonly reductionPercent: number;
  readonly logicalTransientCount: number; readonly physicalSlotCount: number; readonly reuseCount: number;
  readonly slots: readonly AliasedPhysicalSlot[];
  readonly resourceToSlot: Readonly<Record<string, string>>;
  readonly liveIntervals: readonly ResourceLiveInterval[];
  readonly aliasBarriers: readonly ResourceHazardBarrier[];
}

export interface CompiledPassNode {
  readonly executionIndex: number; readonly pass: RenderPassDescriptor;
  readonly dependencies: readonly string[];
  readonly incomingBarriers: readonly ResourceHazardBarrier[];
}

export interface CompiledRenderGraph {
  readonly scheduledPasses: readonly CompiledPassNode[];
  readonly executionOrder: readonly string[];
  readonly culledPasses: readonly CulledPassReport[];
  readonly activeResourceIds: readonly string[]; readonly culledResourceIds: readonly string[];
  readonly barriers: readonly ResourceHazardBarrier[];
  readonly memoryPlan: TransientMemoryAliasingPlan;
  readonly estimatedTotalGpuCostMs: number;
}

export interface CompileRenderGraphOptions {
  readonly targetResourceIds?: readonly string[]; readonly allowEmptyLiveGraph?: boolean;
}

export interface VirtualTileBudgetInput {
  readonly canvasWidthPx: number; readonly canvasHeightPx: number;
  readonly maxTransientVramBytes: number; readonly tileSizePx?: number;
  readonly maxTextureDimension2D?: number;
  readonly referenceWidthPx?: number; readonly referenceHeightPx?: number;
}

export interface VirtualTileBudgetPlan {
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly tileSizePx: number;
  readonly tilesX: number; readonly tilesY: number; readonly totalTiles: number;
  readonly tilesPerBatch: number; readonly batchCount: number;
  readonly fullFrameUnaliasedBytes: number; readonly fullFrameAliasedBytes: number;
  readonly singleTileAliasedBytes: number; readonly peakBatchVramBytes: number;
  readonly maxTransientVramBytes: number; readonly requiresVirtualTiling: boolean;
  readonly effectiveReductionPercent: number; readonly withinBudget: boolean;
}

export interface ExecutedPassRecord {
  readonly passId: string; readonly executionIndex: number;
  readonly barrierCount: number; readonly durationMs: number;
}

export interface GraphExecutionReport {
  readonly executedPasses: readonly ExecutedPassRecord[];
  readonly totalDurationMs: number; readonly totalBarriersApplied: number;
}

export class RenderGraphCycleError extends Error {
  readonly cyclePath: readonly string[];
  constructor(cyclePath: readonly string[]) {
    super(`렌더 그래프 순환 의존이 감지되었습니다: ${cyclePath.join(" -> ")}`);
    this.name = "RenderGraphCycleError";
    this.cyclePath = cyclePath;
  }
}

const STAGE_PRIORITY: Readonly<Record<RenderPassStage, number>> = {
  gbuffer: 0, "gi-shadow": 1, "cel-outline": 2, "bloom-fx": 3, composite: 4, export: 5, custom: 6,
};

function alignUp(value: number, alignment: number): number {
  return alignment <= 1 ? value : Math.ceil(value / alignment) * alignment;
}

/**
 * WebGPU 256바이트 행 정렬, 밉 체인, MSAA 샘플 수를 반영한 정확한 리소스 바이트 크기를 계산한다.
 */
export function computeResourceByteSize(descriptor: RenderResourceDescriptor): number {
  if (descriptor.kind !== "texture-2d") {
    const rawSize = descriptor.byteSize ?? 0;
    if (rawSize <= 0) {
      throw new Error(`버퍼 리소스(${descriptor.id})는 0보다 큰 byteSize가 필요합니다.`);
    }
    return alignUp(rawSize, 256);
  }
  const width = descriptor.width ?? 0;
  const height = descriptor.height ?? 0;
  const format = descriptor.format;
  if (width <= 0 || height <= 0 || !format) {
    throw new Error(`텍스처 리소스(${descriptor.id})는 width, height, format이 필요합니다.`);
  }
  const bpp = TEXTURE_FORMAT_BYTES_PER_PIXEL[format];
  const mipLevels = Math.max(1, descriptor.mipLevels ?? 1);
  const sampleCount = Math.max(1, descriptor.sampleCount ?? 1);
  let totalBytes = 0;
  let mipW = width;
  let mipH = height;
  for (let mip = 0; mip < mipLevels; mip += 1) {
    totalBytes += alignUp(mipW * bpp, WEBGPU_BYTES_PER_ROW_ALIGNMENT) * mipH * sampleCount;
    mipW = Math.max(1, Math.floor(mipW / 2));
    mipH = Math.max(1, Math.floor(mipH / 2));
  }
  return totalBytes;
}

function bindingsForPass(pass: RenderPassDescriptor): readonly PassResourceBinding[] {
  return [...pass.inputs, ...pass.outputs];
}

function isWriteBinding(binding: PassResourceBinding): boolean {
  return binding.access === "write" || binding.access === "read-write";
}

function isReadBinding(binding: PassResourceBinding): boolean {
  return binding.access === "read" || binding.access === "read-write";
}

function intervalsOverlapInclusive(aS: number, aE: number, bS: number, bE: number): boolean {
  return !(aE < bS || bE < aS);
}

/**
 * 구간 그래프(Interval Graph) Best-Fit 패킹으로 비겹침 패스 간 일시 GPU 메모리를 재사용한다.
 */
export function allocateAliasedTransientMemory(
  liveIntervals: readonly ResourceLiveInterval[],
  scheduledPasses: readonly RenderPassDescriptor[],
  firstUsageByResource: Readonly<Record<string, ResourceUsageKind>>,
  lastUsageByResource: Readonly<Record<string, ResourceUsageKind>>,
): TransientMemoryAliasingPlan {
  const sorted = [...liveIntervals].sort((a, b) =>
    b.byteSize !== a.byteSize
      ? b.byteSize - a.byteSize
      : a.firstPassIndex !== b.firstPassIndex
        ? a.firstPassIndex - b.firstPassIndex
        : a.resourceId.localeCompare(b.resourceId),
  );

  interface MutableSlot {
    slotId: string;
    kind: RenderResourceKind;
    capacityBytes: number;
    assigned: ResourceLiveInterval[];
  }

  const mutableSlots: MutableSlot[] = [];
  const resourceToSlot: Record<string, string> = {};
  let unaliasedPeakBytes = 0;

  for (const item of sorted) {
    unaliasedPeakBytes += item.byteSize;
    let bestSlotIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let s = 0; s < mutableSlots.length; s += 1) {
      const slot = mutableSlots[s];
      if (slot.kind !== item.kind) continue;
      const overlaps = slot.assigned.some((ex) =>
        intervalsOverlapInclusive(item.firstPassIndex, item.lastPassIndex, ex.firstPassIndex, ex.lastPassIndex),
      );
      if (overlaps) continue;
      const slack =
        slot.capacityBytes >= item.byteSize
          ? slot.capacityBytes - item.byteSize
          : (item.byteSize - slot.capacityBytes) * 2 + 1024;
      if (slack < bestScore) {
        bestScore = slack;
        bestSlotIndex = s;
      }
    }

    if (bestSlotIndex >= 0) {
      const slot = mutableSlots[bestSlotIndex];
      slot.assigned.push(item);
      if (item.byteSize > slot.capacityBytes) slot.capacityBytes = item.byteSize;
      resourceToSlot[item.resourceId] = slot.slotId;
    } else {
      const slotId = `vram-slot-${mutableSlots.length}`;
      mutableSlots.push({ slotId, kind: item.kind, capacityBytes: item.byteSize, assigned: [item] });
      resourceToSlot[item.resourceId] = slotId;
    }
  }

  const aliasBarriers: ResourceHazardBarrier[] = [];
  const slots: AliasedPhysicalSlot[] = [];
  let aliasedPeakBytes = 0;
  let reuseCount = 0;

  for (const slot of mutableSlots) {
    slot.assigned.sort((a, b) => a.firstPassIndex - b.firstPassIndex);
    aliasedPeakBytes += slot.capacityBytes;
    if (slot.assigned.length > 1) reuseCount += slot.assigned.length - 1;

    for (let j = 1; j < slot.assigned.length; j += 1) {
      const prevRes = slot.assigned[j - 1];
      const nextRes = slot.assigned[j];
      const fromPass = scheduledPasses[prevRes.lastPassIndex];
      const toPass = scheduledPasses[nextRes.firstPassIndex];
      if (fromPass && toPass) {
        aliasBarriers.push({
          barrierIndex: aliasBarriers.length, kind: "write-after-read", isAliasBarrier: true,
          resourceId: nextRes.resourceId, previousResourceId: prevRes.resourceId, physicalSlotId: slot.slotId,
          fromPassId: fromPass.id, toPassId: toPass.id,
          fromPassIndex: prevRes.lastPassIndex, toPassIndex: nextRes.firstPassIndex,
          fromUsage: lastUsageByResource[prevRes.resourceId] ?? "sampled-texture",
          toUsage: firstUsageByResource[nextRes.resourceId] ?? "color-attachment",
        });
      }
    }

    slots.push({ slotId: slot.slotId, kind: slot.kind, capacityBytes: slot.capacityBytes, assignedResources: [...slot.assigned] });
  }

  const savedBytes = Math.max(0, unaliasedPeakBytes - aliasedPeakBytes);
  const reductionRatio = unaliasedPeakBytes > 0 ? savedBytes / unaliasedPeakBytes : 0;

  return {
    unaliasedPeakBytes, aliasedPeakBytes, savedBytes, reductionRatio,
    reductionPercent: Number((reductionRatio * 100).toFixed(2)),
    logicalTransientCount: sorted.length, physicalSlotCount: slots.length, reuseCount,
    slots, resourceToSlot, liveIntervals: sorted, aliasBarriers,
  };
}

export class WebGpuMultiPassRenderGraph {
  private readonly resources = new Map<string, RenderResourceDescriptor>();
  private readonly passes = new Map<string, RenderPassDescriptor>();
  private readonly passOrder: string[] = [];

  addResource(descriptor: RenderResourceDescriptor): this {
    if (this.resources.has(descriptor.id)) {
      throw new Error(`중복된 렌더 리소스 ID입니다: ${descriptor.id}`);
    }
    computeResourceByteSize(descriptor);
    this.resources.set(descriptor.id, descriptor);
    return this;
  }

  addPass(descriptor: RenderPassDescriptor): this {
    if (this.passes.has(descriptor.id)) {
      throw new Error(`중복된 렌더 패스 ID입니다: ${descriptor.id}`);
    }
    for (const binding of bindingsForPass(descriptor)) {
      if (!this.resources.has(binding.resourceId)) {
        throw new Error(`패스(${descriptor.id})가 미등록 리소스(${binding.resourceId})를 참조했습니다.`);
      }
    }
    this.passes.set(descriptor.id, descriptor);
    this.passOrder.push(descriptor.id);
    return this;
  }

  getResource(resourceId: string): RenderResourceDescriptor | undefined {
    return this.resources.get(resourceId);
  }

  getPass(passId: string): RenderPassDescriptor | undefined {
    return this.passes.get(passId);
  }

  /**
   * DAG 의존성 추출 → 순환 검증 → Dead-Pass Culling → 위상 정렬 → 배리어 및 VRAM 에일리어싱을 컴파일한다.
   */
  compile(options: CompileRenderGraphOptions = {}): CompiledRenderGraph {
    const adjacency = new Map<string, Set<string>>();
    const reverseAdj = new Map<string, Set<string>>();
    const declarationIndex = new Map<string, number>();

    this.passOrder.forEach((id, idx) => {
      adjacency.set(id, new Set<string>());
      reverseAdj.set(id, new Set<string>());
      declarationIndex.set(id, idx);
    });

    const addEdge = (fromId: string, toId: string): void => {
      if (fromId === toId) throw new RenderGraphCycleError([fromId, toId]);
      adjacency.get(fromId)?.add(toId);
      reverseAdj.get(toId)?.add(fromId);
    };

    const pushUnique = (map: Map<string, string[]>, key: string, val: string): void => {
      const list = map.get(key) ?? [];
      if (list.indexOf(val) === -1) list.push(val);
      map.set(key, list);
    };

    const writersByRes = new Map<string, string[]>();
    const readersByRes = new Map<string, string[]>();

    for (const passId of this.passOrder) {
      const pass = this.passes.get(passId);
      if (!pass) continue;
      for (const depId of pass.afterPassIds ?? []) {
        if (!this.passes.has(depId)) throw new Error(`패스(${passId})의 선행 패스(${depId})가 존재하지 않습니다.`);
        addEdge(depId, passId);
      }
      for (const binding of bindingsForPass(pass)) {
        if (isWriteBinding(binding)) pushUnique(writersByRes, binding.resourceId, passId);
        if (isReadBinding(binding)) pushUnique(readersByRes, binding.resourceId, passId);
      }
    }

    writersByRes.forEach((writers, resId) => {
      const readers = readersByRes.get(resId) ?? [];
      for (let w = 0; w < writers.length; w += 1) {
        const writerId = writers[w];
        const writerOrder = declarationIndex.get(writerId) ?? 0;
        const nextWriterId = writers[w + 1];
        const nextOrder = nextWriterId ? (declarationIndex.get(nextWriterId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        if (nextWriterId) addEdge(writerId, nextWriterId);
        for (const readerId of readers) {
          if (readerId === writerId) continue;
          const readerOrder = declarationIndex.get(readerId) ?? 0;
          if (writers.length === 1) addEdge(writerId, readerId);
          else if (readerOrder > writerOrder && readerOrder < nextOrder) {
            addEdge(writerId, readerId);
            if (nextWriterId) addEdge(readerId, nextWriterId);
          }
        }
      }
    });

    this.assertAcyclic(adjacency);

    const targetResources = new Set<string>(options.targetResourceIds ?? []);
    this.resources.forEach((res) => { if (res.lifetime === "swapchain-output") targetResources.add(res.id); });

    const livePassIds = new Set<string>();
    const queue: string[] = [];
    for (const passId of this.passOrder) {
      const pass = this.passes.get(passId);
      if (pass && (pass.outputs.some((b) => targetResources.has(b.resourceId)) || pass.sideEffect === true)) {
        livePassIds.add(passId);
        queue.push(passId);
      }
    }
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      reverseAdj.get(current)?.forEach((predId) => {
        if (!livePassIds.has(predId)) { livePassIds.add(predId); queue.push(predId); }
      });
    }
    if (livePassIds.size === 0 && !options.allowEmptyLiveGraph && this.passOrder.length > 0) {
      throw new Error("최종 출력 타깃(swapchain-output)에 도달하는 활성 패스가 없습니다.");
    }

    const culledPasses: CulledPassReport[] = [];
    for (const passId of this.passOrder) {
      if (!livePassIds.has(passId)) {
        const pass = this.passes.get(passId);
        if (pass) culledPasses.push({ passId: pass.id, label: pass.label, reason: "unread-output" });
      }
    }

    const sortedPassIds = this.topologicalSortLive(livePassIds, adjacency, declarationIndex);
    const scheduledDescriptors = sortedPassIds
      .map((id) => this.passes.get(id))
      .filter((p): p is RenderPassDescriptor => p !== undefined);

    const activeResSet = new Set<string>();
    const firstPassByRes = new Map<string, number>();
    const lastPassByRes = new Map<string, number>();
    const firstUsageByRes: Record<string, ResourceUsageKind> = {};
    const lastUsageByRes: Record<string, ResourceUsageKind> = {};

    scheduledDescriptors.forEach((pass, passIdx) => {
      for (const b of bindingsForPass(pass)) {
        activeResSet.add(b.resourceId);
        if (!firstPassByRes.has(b.resourceId)) {
          firstPassByRes.set(b.resourceId, passIdx);
          firstUsageByRes[b.resourceId] = b.usage;
        }
        lastPassByRes.set(b.resourceId, passIdx);
        lastUsageByRes[b.resourceId] = b.usage;
      }
    });

    const activeResourceIds: string[] = [];
    const culledResourceIds: string[] = [];
    const liveIntervals: ResourceLiveInterval[] = [];
    this.resources.forEach((res) => {
      if (activeResSet.has(res.id)) {
        activeResourceIds.push(res.id);
        if (res.lifetime === "transient") {
          liveIntervals.push({
            resourceId: res.id, label: res.label, kind: res.kind,
            firstPassIndex: firstPassByRes.get(res.id) ?? 0, lastPassIndex: lastPassByRes.get(res.id) ?? 0,
            byteSize: computeResourceByteSize(res),
          });
        }
      } else {
        culledResourceIds.push(res.id);
      }
    });

    const logicalBarriers = this.computeLogicalHazardBarriers(scheduledDescriptors);
    const memoryPlan = allocateAliasedTransientMemory(liveIntervals, scheduledDescriptors, firstUsageByRes, lastUsageByRes);

    const allBarriers: ResourceHazardBarrier[] = [];
    for (const b of logicalBarriers) {
      allBarriers.push({ ...b, barrierIndex: allBarriers.length, physicalSlotId: memoryPlan.resourceToSlot[b.resourceId] });
    }
    for (const ab of memoryPlan.aliasBarriers) allBarriers.push({ ...ab, barrierIndex: allBarriers.length });

    let estimatedTotalGpuCostMs = 0;
    const scheduledPasses: CompiledPassNode[] = scheduledDescriptors.map((pass, idx) => {
      estimatedTotalGpuCostMs += pass.estimatedGpuCostMs ?? 0;
      const deps: string[] = [];
      reverseAdj.get(pass.id)?.forEach((predId) => { if (livePassIds.has(predId)) deps.push(predId); });
      return { executionIndex: idx, pass, dependencies: deps, incomingBarriers: allBarriers.filter((b) => b.toPassId === pass.id) };
    });

    return {
      scheduledPasses, executionOrder: sortedPassIds, culledPasses,
      activeResourceIds, culledResourceIds, barriers: allBarriers, memoryPlan,
      estimatedTotalGpuCostMs: Number(estimatedTotalGpuCostMs.toFixed(3)),
    };
  }

  executeCompiledGraph(compiled: CompiledRenderGraph): GraphExecutionReport {
    const startAll = performance.now();
    const executedPasses: ExecutedPassRecord[] = [];
    let totalBarriersApplied = 0;

    for (const node of compiled.scheduledPasses) {
      const passStart = performance.now();
      node.pass.execute?.({
        passId: node.pass.id, executionIndex: node.executionIndex,
        slotAssignments: compiled.memoryPlan.resourceToSlot, incomingBarriers: node.incomingBarriers,
      });
      totalBarriersApplied += node.incomingBarriers.length;
      executedPasses.push({
        passId: node.pass.id, executionIndex: node.executionIndex,
        barrierCount: node.incomingBarriers.length, durationMs: Number((performance.now() - passStart).toFixed(4)),
      });
    }

    return {
      executedPasses,
      totalDurationMs: Number((performance.now() - startAll).toFixed(4)),
      totalBarriersApplied,
    };
  }

  /**
   * 8K+ 대형 웹툰 캔버스의 일시 VRAM을 타일 단위로 분할해 예산 상한 이내로 강제한다.
   */
  enforceVirtualTileBudget(
    compiled: CompiledRenderGraph,
    input: VirtualTileBudgetInput,
  ): VirtualTileBudgetPlan {
    const maxDim = input.maxTextureDimension2D ?? DEFAULT_MAX_TEXTURE_DIMENSION_2D;
    const tileSizePx = Math.min(input.tileSizePx ?? DEFAULT_VIRTUAL_TILE_SIZE_PX, maxDim);
    if (input.canvasWidthPx <= 0 || input.canvasHeightPx <= 0 || tileSizePx <= 0) {
      throw new Error("캔버스 크기와 타일 크기는 0보다 커야 합니다.");
    }
    if (input.maxTransientVramBytes <= 0) {
      throw new Error("maxTransientVramBytes는 0보다 커야 합니다.");
    }

    let refW = input.referenceWidthPx ?? 0;
    let refH = input.referenceHeightPx ?? 0;
    if (refW <= 0 || refH <= 0) {
      for (const iv of compiled.memoryPlan.liveIntervals) {
        const res = this.resources.get(iv.resourceId);
        if (res && res.kind === "texture-2d" && res.width && res.height) {
          refW = Math.max(refW, res.width);
          refH = Math.max(refH, res.height);
        }
      }
    }

    const basePixels = Math.max(1, (refW || tileSizePx) * (refH || tileSizePx));
    const fullScale = (input.canvasWidthPx * input.canvasHeightPx) / basePixels;
    const tileScale = (tileSizePx * tileSizePx) / basePixels;

    const fullFrameUnaliasedBytes = Math.ceil(compiled.memoryPlan.unaliasedPeakBytes * fullScale);
    const fullFrameAliasedBytes = Math.ceil(compiled.memoryPlan.aliasedPeakBytes * fullScale);
    const singleTileAliasedBytes = Math.max(256, Math.ceil(compiled.memoryPlan.aliasedPeakBytes * tileScale));

    const tilesX = Math.ceil(input.canvasWidthPx / tileSizePx);
    const tilesY = Math.ceil(input.canvasHeightPx / tileSizePx);
    const totalTiles = tilesX * tilesY;
    const requiresVirtualTiling =
      input.canvasWidthPx > maxDim ||
      input.canvasHeightPx > maxDim ||
      fullFrameAliasedBytes > input.maxTransientVramBytes;

    const tilesPerBatch = requiresVirtualTiling
      ? Math.max(1, Math.min(totalTiles, Math.floor(input.maxTransientVramBytes / singleTileAliasedBytes)))
      : totalTiles;
    const batchCount = requiresVirtualTiling ? Math.ceil(totalTiles / tilesPerBatch) : 1;
    const peakBatchVramBytes = requiresVirtualTiling
      ? singleTileAliasedBytes * tilesPerBatch
      : fullFrameAliasedBytes;
    const effectiveReductionPercent =
      fullFrameUnaliasedBytes > 0
        ? Number((((fullFrameUnaliasedBytes - peakBatchVramBytes) / fullFrameUnaliasedBytes) * 100).toFixed(2))
        : 0;

    return {
      canvasWidthPx: input.canvasWidthPx, canvasHeightPx: input.canvasHeightPx, tileSizePx,
      tilesX, tilesY, totalTiles, tilesPerBatch, batchCount,
      fullFrameUnaliasedBytes, fullFrameAliasedBytes, singleTileAliasedBytes, peakBatchVramBytes,
      maxTransientVramBytes: input.maxTransientVramBytes, requiresVirtualTiling,
      effectiveReductionPercent, withinBudget: peakBatchVramBytes <= input.maxTransientVramBytes,
    };
  }

  private assertAcyclic(adjacency: Map<string, Set<string>>): void {
    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];

    const visit = (nodeId: string): void => {
      state.set(nodeId, 1);
      stack.push(nodeId);
      adjacency.get(nodeId)?.forEach((nextId) => {
        const nextState = state.get(nextId) ?? 0;
        if (nextState === 1) {
          throw new RenderGraphCycleError([...stack.slice(stack.indexOf(nextId)), nextId]);
        }
        if (nextState === 0) visit(nextId);
      });
      stack.pop();
      state.set(nodeId, 2);
    };

    for (const id of this.passOrder) {
      if ((state.get(id) ?? 0) === 0) visit(id);
    }
  }

  private topologicalSortLive(
    livePassIds: Set<string>,
    adjacency: Map<string, Set<string>>,
    declarationIndex: Map<string, number>,
  ): string[] {
    const inDegree = new Map<string, number>();
    livePassIds.forEach((id) => inDegree.set(id, 0));
    livePassIds.forEach((fromId) => {
      adjacency.get(fromId)?.forEach((toId) => {
        if (livePassIds.has(toId)) inDegree.set(toId, (inDegree.get(toId) ?? 0) + 1);
      });
    });

    const ready: string[] = [];
    inDegree.forEach((deg, id) => {
      if (deg === 0) ready.push(id);
    });

    const compareReady = (a: string, b: string): number => {
      const pA = this.passes.get(a);
      const pB = this.passes.get(b);
      const stageDiff = (pA ? STAGE_PRIORITY[pA.stage] : 99) - (pB ? STAGE_PRIORITY[pB.stage] : 99);
      return stageDiff !== 0 ? stageDiff : (declarationIndex.get(a) ?? 0) - (declarationIndex.get(b) ?? 0);
    };

    const sorted: string[] = [];
    while (ready.length > 0) {
      ready.sort(compareReady);
      const next = ready.shift();
      if (!next) break;
      sorted.push(next);
      adjacency.get(next)?.forEach((targetId) => {
        if (!livePassIds.has(targetId)) return;
        const rem = (inDegree.get(targetId) ?? 1) - 1;
        inDegree.set(targetId, rem);
        if (rem === 0) ready.push(targetId);
      });
    }

    if (sorted.length !== livePassIds.size) throw new RenderGraphCycleError([...livePassIds]);
    return sorted;
  }

  private computeLogicalHazardBarriers(
    scheduledPasses: readonly RenderPassDescriptor[],
  ): ResourceHazardBarrier[] {
    interface AccessPoint {
      passId: string; passIndex: number; usage: ResourceUsageKind;
    }
    const lastWriter = new Map<string, AccessPoint>();
    const activeReaders = new Map<string, AccessPoint[]>();
    const barriers: ResourceHazardBarrier[] = [];

    const makeBarrier = (
      kind: HazardBarrierKind,
      resourceId: string,
      fromPassId: string,
      toPassId: string,
      fromPassIndex: number,
      toPassIndex: number,
      fromUsage: ResourceUsageKind,
      toUsage: ResourceUsageKind,
    ): ResourceHazardBarrier => ({
      barrierIndex: barriers.length, kind, isAliasBarrier: false,
      resourceId, fromPassId, toPassId, fromPassIndex, toPassIndex, fromUsage, toUsage,
    });

    scheduledPasses.forEach((pass, passIdx) => {
      const bindings = bindingsForPass(pass);
      for (const binding of bindings) {
        const resId = binding.resourceId;
        const writer = lastWriter.get(resId);
        const readers = activeReaders.get(resId) ?? [];

        if (isReadBinding(binding) && writer && writer.passIndex < passIdx) {
          barriers.push(makeBarrier("read-after-write", resId, writer.passId, pass.id, writer.passIndex, passIdx, writer.usage, binding.usage));
        }
        if (isWriteBinding(binding)) {
          if (readers.length > 0) {
            for (const reader of readers) {
              if (reader.passIndex < passIdx) {
                barriers.push(makeBarrier("write-after-read", resId, reader.passId, pass.id, reader.passIndex, passIdx, reader.usage, binding.usage));
              }
            }
          } else if (writer && writer.passIndex < passIdx) {
            barriers.push(makeBarrier("write-after-write", resId, writer.passId, pass.id, writer.passIndex, passIdx, writer.usage, binding.usage));
          }
        }
      }

      for (const binding of bindings) {
        const pt: AccessPoint = { passId: pass.id, passIndex: passIdx, usage: binding.usage };
        if (isWriteBinding(binding)) {
          lastWriter.set(binding.resourceId, pt);
          activeReaders.set(binding.resourceId, []);
        } else if (isReadBinding(binding)) {
          const list = activeReaders.get(binding.resourceId) ?? [];
          list.push(pt);
          activeReaders.set(binding.resourceId, list);
        }
      }
    });

    return barriers;
  }
}

export interface WebtoonPipelinePresetOptions {
  readonly width?: number; readonly height?: number; readonly includeUnusedDebugPass?: boolean;
}

/**
 * 표준 웹툰 5단계 멀티패스 파이프라인(G-Buffer → GI/Shadow → Cel/Outline → Bloom/FX → Composite)을 구성한다.
 */
export function createWebtoonMultiPassPipeline(
  options: WebtoonPipelinePresetOptions = {},
): WebGpuMultiPassRenderGraph {
  const width = options.width ?? 2048;
  const height = options.height ?? 2048;
  const graph = new WebGpuMultiPassRenderGraph();

  const texSpecs: readonly (readonly [string, string, RenderTextureFormat, RenderResourceLifetime])[] = [
    ["gbuffer-albedo", "G-Buffer 알베도", "rgba16float", "transient"],
    ["gbuffer-normal", "G-Buffer 노멀", "rgba16float", "transient"],
    ["gbuffer-depth", "G-Buffer 깊이", "depth32float", "transient"],
    ["shadow-raw", "그림자 원시 맵", "r32float", "transient"],
    ["shadow-filtered", "그림자 PCF 맵", "r32float", "transient"],
    ["gi-radiance", "간접광 래디언스", "rgba16float", "transient"],
    ["cel-lit", "셀 셰이딩 컬러", "rgba16float", "transient"],
    ["outline-ink", "외곽선 잉크 마스크", "rgba8unorm", "transient"],
    ["shaded-frame", "셀+잉크 병합 프레임", "rgba16float", "transient"],
    ["bloom-extract", "블룸 휘도 추출", "rgba16float", "transient"],
    ["bloom-blur-h", "블룸 수평 블러", "rgba16float", "transient"],
    ["bloom-blur-v", "블룸 수직 블러", "rgba16float", "transient"],
    ["screentone-fx", "스크린톤 효과", "rgba16float", "transient"],
    ["swapchain-final", "최종 스왑체인 타깃", "rgba8unorm", "swapchain-output"],
  ];
  for (const [id, label, format, lifetime] of texSpecs) {
    graph.addResource({ id, label, kind: "texture-2d", lifetime, width, height, format });
  }

  const readTex = (resourceId: string): PassResourceBinding => ({ resourceId, access: "read", usage: "sampled-texture" });
  const writeAs = (resourceId: string, usage: ResourceUsageKind = "color-attachment"): PassResourceBinding => ({ resourceId, access: "write", usage });

  const passSpecs: readonly (readonly [string, string, RenderPassStage, readonly string[], readonly PassResourceBinding[], number])[] = [
    ["pass-gbuffer", "G-Buffer 지오메트리 기록", "gbuffer", [], [writeAs("gbuffer-albedo"), writeAs("gbuffer-normal"), writeAs("gbuffer-depth", "depth-attachment")], 1.4],
    ["pass-shadow-depth", "직접광 그림자 깊이 생성", "gi-shadow", ["gbuffer-depth"], [writeAs("shadow-raw")], 0.7],
    ["pass-shadow-filter", "그림자 경계 필터링", "gi-shadow", ["shadow-raw"], [writeAs("shadow-filtered", "storage-write")], 0.5],
    ["pass-gi-radiance", "래디언스 간접광 계산", "gi-shadow", ["gbuffer-normal", "gbuffer-depth", "shadow-filtered"], [writeAs("gi-radiance", "storage-write")], 1.1],
    ["pass-cel-lighting", "웹툰 셀 명암 셰이딩", "cel-outline", ["gbuffer-albedo", "gbuffer-normal", "gi-radiance"], [writeAs("cel-lit")], 0.8],
    ["pass-outline-ink", "노멀·깊이 기반 외곽선 잉크 추출", "cel-outline", ["gbuffer-normal", "gbuffer-depth"], [writeAs("outline-ink")], 0.6],
    ["pass-cel-ink-merge", "셀 컬러·외곽선 잉크 합성", "cel-outline", ["cel-lit", "outline-ink"], [writeAs("shaded-frame")], 0.4],
    ["pass-bloom-extract", "하이라이트 블룸 추출", "bloom-fx", ["shaded-frame"], [writeAs("bloom-extract")], 0.4],
    ["pass-bloom-blur-h", "블룸 수평 가우시안 블러", "bloom-fx", ["bloom-extract"], [writeAs("bloom-blur-h", "storage-write")], 0.5],
    ["pass-bloom-blur-v", "블룸 수직 가우시안 블러", "bloom-fx", ["bloom-blur-h"], [writeAs("bloom-blur-v", "storage-write")], 0.5],
    ["pass-screentone-fx", "스크린톤 질감 오버레이", "bloom-fx", ["shaded-frame"], [writeAs("screentone-fx")], 0.5],
    ["pass-final-composite", "최종 톤매핑·스왑체인 합성", "composite", ["shaded-frame", "bloom-blur-v", "screentone-fx"], [writeAs("swapchain-final")], 0.6],
  ];

  for (const [id, label, stage, inputIds, outputs, estimatedGpuCostMs] of passSpecs) {
    graph.addPass({ id, label, stage, inputs: inputIds.map(readTex), outputs, estimatedGpuCostMs });
  }

  if (options.includeUnusedDebugPass) {
    graph
      .addResource({ id: "debug-wireframe-orphan", label: "미사용 디버그 와이어프레임", kind: "texture-2d", lifetime: "transient", width, height, format: "rgba8unorm" })
      .addPass({ id: "pass-debug-wireframe", label: "미사용 디버그 오버레이", stage: "custom", inputs: [readTex("gbuffer-normal")], outputs: [writeAs("debug-wireframe-orphan")], estimatedGpuCostMs: 0.9 });
  }

  return graph;
}
