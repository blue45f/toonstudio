/**
 * 6패스 DAG 스케줄링·작업 훔치기·메모리 예산·체크포인트의 CPU/메모리 예제 (Wave 40D).
 * 노드와 시간은 입력 가정값이다. GPU 제출·원격 송신·서버 ACK·영구 저장·이미지 렌더는 수행하지 않는다.
 */

export type RenderPassStage = "lineart" | "flat" | "shadow" | "lighting" | "fx" | "lettering";
export type ComputeNodeKind = "webgpu" | "edge-node" | "cpu-worker";
export type NodeHealthStatus = "healthy" | "degraded" | "throttled" | "offline";
export type EdgeLatencyTier = "ultra-low" | "low" | "elevated" | "critical";
export type EdgeReadinessGrade = "S" | "A" | "B" | "C" | "D";
export type BackpressureLevel = "nominal" | "elevated" | "high" | "critical";
export type RenderChunkStatus = "pending" | "ready" | "running" | "completed" | "failed";
export type RenderFarmRunStatus = "queued" | "running" | "backpressured" | "degraded" | "completed";

export interface RenderPassDagSpec {
  readonly stage: RenderPassStage;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly dependsOn: readonly RenderPassStage[];
  readonly baseComputeMsPerChunk: number;
  readonly vramFootprintMb: number;
  readonly preferredKind: ComputeNodeKind;
}

export interface RenderPassDagValidation {
  readonly valid: boolean;
  readonly topologicalOrder: readonly RenderPassStage[];
  readonly cycleStages: readonly RenderPassStage[];
  readonly criticalPathMs: number;
}

export interface RenderComputeNode {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly kind: ComputeNodeKind;
  readonly region: string;
  readonly status: NodeHealthStatus;
  readonly throughputMultiplier: number;
  readonly maxConcurrentChunks: number;
  readonly memoryBudgetMb: number;
  readonly memoryUsedMb: number;
  readonly rttMs: number;
  readonly jitterMs: number;
  readonly packetLossPct: number;
  readonly thermalLoadPct: number;
  readonly completedChunks: number;
  readonly stolenChunks: number;
  readonly failedChunks: number;
  readonly baselineRttMs: number;
  readonly baselineJitterMs: number;
}

export interface RenderChunkTask {
  readonly id: string;
  readonly cutId: string;
  readonly stage: RenderPassStage;
  readonly stageOrder: number;
  readonly tileIndex: number;
  readonly dependsOnChunkIds: readonly string[];
  readonly status: RenderChunkStatus;
  readonly computeBudgetMs: number;
  readonly remainingComputeMs: number;
  readonly progressPct: number;
  readonly vramFootprintMb: number;
  readonly preferredNodeId: string;
  readonly assignedNodeId: string | null;
  readonly attemptCount: number;
  readonly stolenCount: number;
  readonly resumedFromCheckpointId: string | null;
  readonly outputDigest: string | null;
}

export interface WorkStealEvent {
  readonly eventId: string;
  readonly tickIndex: number;
  readonly chunkId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly reason: "load-balance" | "failover-recovery" | "backpressure-relief";
  readonly savedEstimatedMs: number;
}

export interface BackpressureEvent {
  readonly eventId: string;
  readonly tickIndex: number;
  readonly level: BackpressureLevel;
  readonly memoryUsedMb: number;
  readonly memoryBudgetMb: number;
  readonly deferredChunkCount: number;
}

export interface RenderCheckpointRecord {
  readonly checkpointId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly tickIndex: number;
  readonly elapsedMs: number;
  readonly completedChunkIds: readonly string[];
  readonly completedDigests: Readonly<Record<string, string>>;
  readonly completedStages: readonly RenderPassStage[];
  readonly integrityHash: string;
}

export interface RenderFarmJobSpec {
  readonly jobId: string;
  readonly episodeCode: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly cutIds: readonly string[];
  readonly tilesPerCut: number;
  readonly globalMemoryBudgetMb: number;
  readonly backpressureHighPct?: number;
  readonly backpressureCriticalPct?: number;
}

export interface RenderFarmState {
  readonly job: RenderFarmJobSpec;
  readonly status: RenderFarmRunStatus;
  readonly tickIndex: number;
  readonly elapsedMs: number;
  readonly backpressureLevel: BackpressureLevel;
  readonly nodes: readonly RenderComputeNode[];
  readonly chunks: readonly RenderChunkTask[];
  readonly checkpoints: readonly RenderCheckpointRecord[];
  readonly stealEvents: readonly WorkStealEvent[];
  readonly backpressureEvents: readonly BackpressureEvent[];
  readonly failoverRecoveries: number;
  readonly lastResumedCheckpointId: string | null;
}

export interface EdgeNodeDiagnostic {
  readonly nodeId: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly kind: ComputeNodeKind;
  readonly region: string;
  readonly status: NodeHealthStatus;
  readonly rttMs: number;
  readonly jitterMs: number;
  readonly packetLossPct: number;
  readonly latencyTier: EdgeLatencyTier;
  readonly memoryUtilizationPct: number;
  readonly effectiveScore: number;
}

export interface EdgeHealthAlert {
  readonly id: string;
  readonly nodeId: string;
  readonly severity: "info" | "warning" | "critical";
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface EdgeClusterHealthReport {
  readonly grade: EdgeReadinessGrade;
  readonly slaCompliant: boolean;
  readonly p50RttMs: number;
  readonly p95RttMs: number;
  readonly avgJitterMs: number;
  readonly healthyNodeCount: number;
  readonly degradedNodeCount: number;
  readonly offlineNodeCount: number;
  readonly nodeDiagnostics: readonly EdgeNodeDiagnostic[];
  readonly alerts: readonly EdgeHealthAlert[];
}

export interface StageProgressSummary {
  readonly stage: RenderPassStage;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly completed: number;
  readonly running: number;
  readonly ready: number;
  readonly total: number;
  readonly progressPct: number;
  readonly status: "pending" | "active" | "completed";
}

export interface RenderFarmTelemetry {
  readonly overallProgressPct: number;
  readonly completedChunks: number;
  readonly runningChunks: number;
  readonly readyChunks: number;
  readonly pendingChunks: number;
  readonly totalChunks: number;
  readonly throughputChunksPerSec: number;
  readonly estimatedRemainingMs: number;
  readonly memoryUsedMb: number;
  readonly globalMemoryBudgetMb: number;
  readonly memoryUtilizationPct: number;
  readonly backpressureLevel: BackpressureLevel;
  readonly totalSteals: number;
  readonly failoverRecoveries: number;
  readonly checkpointCount: number;
  readonly latestCheckpointId: string | null;
  readonly stageProgress: readonly StageProgressSummary[];
  readonly edgeHealth: EdgeClusterHealthReport;
}

export const RENDER_PASS_STAGES: readonly RenderPassStage[] = [
  "lineart", "flat", "shadow", "lighting", "fx", "lettering",
];

export const RENDER_PASS_DAG_SPECS: readonly RenderPassDagSpec[] = [
  { stage: "lineart", order: 0, labelKo: "1. 선화 벡터화", labelEn: "1. Lineart", dependsOn: [], baseComputeMsPerChunk: 140, vramFootprintMb: 128, preferredKind: "cpu-worker" },
  { stage: "flat", order: 1, labelKo: "2. 밑색 채우기", labelEn: "2. Flat Color", dependsOn: ["lineart"], baseComputeMsPerChunk: 160, vramFootprintMb: 160, preferredKind: "edge-node" },
  { stage: "shadow", order: 2, labelKo: "3. 그림자 음영", labelEn: "3. Shadow Pass", dependsOn: ["lineart", "flat"], baseComputeMsPerChunk: 220, vramFootprintMb: 224, preferredKind: "webgpu" },
  { stage: "lighting", order: 3, labelKo: "4. 조명·림라이트", labelEn: "4. Lighting", dependsOn: ["flat", "shadow"], baseComputeMsPerChunk: 240, vramFootprintMb: 256, preferredKind: "webgpu" },
  { stage: "fx", order: 4, labelKo: "5. 특수효과·블룸", labelEn: "5. FX & Bloom", dependsOn: ["lighting"], baseComputeMsPerChunk: 200, vramFootprintMb: 224, preferredKind: "edge-node" },
  { stage: "lettering", order: 5, labelKo: "6. 식자·최종 합성", labelEn: "6. Lettering", dependsOn: ["lineart", "fx"], baseComputeMsPerChunk: 120, vramFootprintMb: 128, preferredKind: "cpu-worker" },
];

export const DEFAULT_RENDER_FARM_JOB: RenderFarmJobSpec = {
  jobId: "farm-ep14-rooftop",
  episodeCode: "EP.14",
  titleKo: "14화 빗속의 옥상 대치 (6패스 풀렌더)",
  titleEn: "EP.14 Rooftop Rain Standoff (6-Pass Render)",
  cutIds: ["cut-01", "cut-02", "cut-03", "cut-04"],
  tilesPerCut: 1,
  globalMemoryBudgetMb: 2048,
  backpressureHighPct: 80,
  backpressureCriticalPct: 92,
};

export const DEFAULT_COMPUTE_NODES: readonly RenderComputeNode[] = [
  { id: "gpu-local-0", nameKo: "로컬 WebGPU 코어", nameEn: "Local WebGPU Core", kind: "webgpu", region: "local-gpu", status: "healthy", throughputMultiplier: 2.2, maxConcurrentChunks: 3, memoryBudgetMb: 1024, memoryUsedMb: 0, rttMs: 2.4, jitterMs: 0.4, packetLossPct: 0, thermalLoadPct: 48, completedChunks: 0, stolenChunks: 0, failedChunks: 0, baselineRttMs: 2.4, baselineJitterMs: 0.4 },
  { id: "edge-seoul-01", nameKo: "서울 에지 노드 #1", nameEn: "Seoul Edge Node #1", kind: "edge-node", region: "ap-northeast-2", status: "healthy", throughputMultiplier: 1.85, maxConcurrentChunks: 3, memoryBudgetMb: 896, memoryUsedMb: 0, rttMs: 8.6, jitterMs: 1.2, packetLossPct: 0, thermalLoadPct: 42, completedChunks: 0, stolenChunks: 0, failedChunks: 0, baselineRttMs: 8.6, baselineJitterMs: 1.2 },
  { id: "edge-tokyo-02", nameKo: "도쿄 에지 노드 #2", nameEn: "Tokyo Edge Node #2", kind: "edge-node", region: "ap-northeast-1", status: "healthy", throughputMultiplier: 1.55, maxConcurrentChunks: 2, memoryBudgetMb: 768, memoryUsedMb: 0, rttMs: 24.5, jitterMs: 2.8, packetLossPct: 0.1, thermalLoadPct: 51, completedChunks: 0, stolenChunks: 0, failedChunks: 0, baselineRttMs: 24.5, baselineJitterMs: 2.8 },
  { id: "worker-pool-01", nameKo: "온디바이스 WASM 워커풀", nameEn: "On-Device WASM Workers", kind: "cpu-worker", region: "local-wasm", status: "healthy", throughputMultiplier: 1.05, maxConcurrentChunks: 2, memoryBudgetMb: 512, memoryUsedMb: 0, rttMs: 1.1, jitterMs: 0.2, packetLossPct: 0, thermalLoadPct: 37, completedChunks: 0, stolenChunks: 0, failedChunks: 0, baselineRttMs: 1.1, baselineJitterMs: 0.2 },
];

/** 32비트 이중 FNV-1a 결정론 해시(16자리 16진수). BigInt 리터럴 없이 브라우저/Node 100% 동일 출력. */
export function computeDeterministicDigestHex(input: string): string {
  let h1 = 2166136261 >>> 0;
  let h2 = 33554467 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (code ^ ((i * 31) & 255)), 2246822519) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 6패스 렌더링 DAG의 위상 정렬, 순환 검출 및 임계 경로 비용을 검증한다. */
export function validateRenderPassDag(
  specs: readonly RenderPassDagSpec[] = RENDER_PASS_DAG_SPECS,
): RenderPassDagValidation {
  const byStage = new Map<RenderPassStage, RenderPassDagSpec>();
  const inDegree = new Map<RenderPassStage, number>();
  const dependents = new Map<RenderPassStage, RenderPassStage[]>();
  for (const spec of specs) {
    byStage.set(spec.stage, spec);
    inDegree.set(spec.stage, 0);
    dependents.set(spec.stage, []);
  }
  for (const spec of specs) {
    for (const dep of spec.dependsOn) {
      if (!byStage.has(dep)) continue;
      inDegree.set(spec.stage, (inDegree.get(spec.stage) ?? 0) + 1);
      dependents.get(dep)?.push(spec.stage);
    }
  }
  const queue = specs.filter((s) => (inDegree.get(s.stage) ?? 0) === 0).map((s) => s.stage);
  const topologicalOrder: RenderPassStage[] = [];
  const longestPath = new Map<RenderPassStage, number>();
  while (queue.length > 0) {
    queue.sort((a, b) => (byStage.get(a)?.order ?? 0) - (byStage.get(b)?.order ?? 0));
    const current = queue.shift();
    if (!current) break;
    topologicalOrder.push(current);
    const spec = byStage.get(current);
    const prevMax = spec?.dependsOn.reduce((acc, dep) => Math.max(acc, longestPath.get(dep) ?? 0), 0) ?? 0;
    longestPath.set(current, prevMax + (spec?.baseComputeMsPerChunk ?? 0));
    for (const next of dependents.get(current) ?? []) {
      const nextDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) queue.push(next);
    }
  }
  const cycleStages = specs.map((s) => s.stage).filter((stage) => !topologicalOrder.includes(stage));
  let criticalPathMs = 0;
  for (const cost of longestPath.values()) criticalPathMs = Math.max(criticalPathMs, cost);
  return { valid: cycleStages.length === 0 && topologicalOrder.length === specs.length, topologicalOrder, cycleStages, criticalPathMs };
}

function pickPreferredNodeId(kind: ComputeNodeKind, index: number, nodes: readonly RenderComputeNode[]): string {
  const matching = nodes.filter((node) => node.kind === kind);
  const pool = matching.length > 0 ? matching : nodes;
  return pool[index % Math.max(1, pool.length)]?.id ?? "gpu-local-0";
}

function evaluateBackpressureLevel(usedMb: number, budgetMb: number, highPct: number, criticalPct: number): BackpressureLevel {
  if (budgetMb <= 0) return "critical";
  const pct = (usedMb / budgetMb) * 100;
  if (pct >= criticalPct) return "critical";
  if (pct >= highPct) return "high";
  return pct >= Math.max(55, highPct - 15) ? "elevated" : "nominal";
}

function getCompletedStagesFromChunks(chunks: readonly RenderChunkTask[]): RenderPassStage[] {
  return RENDER_PASS_STAGES.filter((stage) => {
    const items = chunks.filter((c) => c.stage === stage);
    return items.length > 0 && items.every((c) => c.status === "completed");
  });
}

function requireFiniteRange(value: number, label: string, min: number, max = Number.MAX_VALUE): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${label}: 유한한 ${min}~${max} 값이 필요합니다.`);
}

function requireUniqueIds(ids: readonly string[], label: string): void {
  if (ids.length === 0 || ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error(`${label}: 비어 있지 않은 고유 ID가 필요합니다.`);
  }
}

/** 6패스 DAG의 메모리 예제 계획을 만든다. 잘못된 입력을 완료 상태로 처리하지 않는다. */
export function createRenderFarmPlan(
  job: RenderFarmJobSpec = DEFAULT_RENDER_FARM_JOB,
  nodes: readonly RenderComputeNode[] = DEFAULT_COMPUTE_NODES,
): RenderFarmState {
  requireUniqueIds([job.jobId], "작업");
  requireUniqueIds(job.cutIds, "컷");
  requireUniqueIds(nodes.map((node) => node.id), "노드");
  requireFiniteRange(job.tilesPerCut, "컷당 타일", 1, 4);
  if (!Number.isInteger(job.tilesPerCut)) throw new RangeError("컷당 타일은 정수여야 합니다.");
  requireFiniteRange(job.globalMemoryBudgetMb, "전체 메모리 예산", Number.MIN_VALUE);
  const highPct = job.backpressureHighPct ?? 80;
  const criticalPct = job.backpressureCriticalPct ?? 92;
  requireFiniteRange(highPct, "백프레셔 경고", Number.MIN_VALUE, 100);
  requireFiniteRange(criticalPct, "백프레셔 상한", highPct, 100);
  if (criticalPct === highPct) throw new RangeError("백프레셔 상한은 경고보다 커야 합니다.");
  for (const node of nodes) {
    requireFiniteRange(node.throughputMultiplier, "노드 처리량 배율", Number.MIN_VALUE);
    requireFiniteRange(node.memoryBudgetMb, "노드 메모리 예산", Number.MIN_VALUE);
    requireFiniteRange(node.maxConcurrentChunks, "노드 동시 작업 수", 1);
    if (!Number.isInteger(node.maxConcurrentChunks)) throw new RangeError("노드 동시 작업 수는 정수여야 합니다.");
    for (const value of [node.rttMs, node.jitterMs, node.baselineRttMs, node.baselineJitterMs]) requireFiniteRange(value, "노드 지연 가정값", 0);
    requireFiniteRange(node.packetLossPct, "패킷 손실 가정값", 0, 100);
    requireFiniteRange(node.thermalLoadPct, "온도 부하 가정값", 0, 100);
  }
  const safeTiles = job.tilesPerCut;
  const normalizedNodes: RenderComputeNode[] = nodes.map((node) => ({
    ...node, memoryUsedMb: 0, completedChunks: 0, stolenChunks: 0, failedChunks: 0,
  }));
  const specByStage = new Map<RenderPassStage, RenderPassDagSpec>(RENDER_PASS_DAG_SPECS.map((s) => [s.stage, s]));
  const chunks: RenderChunkTask[] = [];
  for (let cutIdx = 0; cutIdx < job.cutIds.length; cutIdx += 1) {
    const cutId = job.cutIds[cutIdx] ?? `cut-${cutIdx + 1}`;
    for (let tileIdx = 0; tileIdx < safeTiles; tileIdx += 1) {
      for (const stage of RENDER_PASS_STAGES) {
        const spec = specByStage.get(stage);
        if (!spec) continue;
        const dependsOnChunkIds = spec.dependsOn.map((dep) => `${cutId}:t${tileIdx}:${dep}`);
        chunks.push({
          id: `${cutId}:t${tileIdx}:${stage}`, cutId, stage, stageOrder: spec.order, tileIndex: tileIdx,
          dependsOnChunkIds, status: dependsOnChunkIds.length === 0 ? "ready" : "pending",
          computeBudgetMs: spec.baseComputeMsPerChunk, remainingComputeMs: spec.baseComputeMsPerChunk,
          progressPct: 0, vramFootprintMb: spec.vramFootprintMb,
          preferredNodeId: pickPreferredNodeId(spec.preferredKind, cutIdx + tileIdx, normalizedNodes),
          assignedNodeId: null, attemptCount: 0, stolenCount: 0, resumedFromCheckpointId: null, outputDigest: null,
        });
      }
    }
  }
  return {
    job, status: chunks.length === 0 ? "completed" : "queued", tickIndex: 0, elapsedMs: 0,
    backpressureLevel: "nominal", nodes: normalizedNodes, chunks, checkpoints: [], stealEvents: [],
    backpressureEvents: [], failoverRecoveries: 0, lastResumedCheckpointId: null,
  };
}

/** 결정론적 렌더팜 체크포인트를 생성한다(메모리 전용, 브라우저 스토리지 미사용). */
export function createRenderCheckpoint(state: RenderFarmState, labelKo?: string, labelEn?: string): RenderFarmState {
  const completedChunks = state.chunks.filter((chunk) => chunk.status === "completed");
  const completedChunkIds = completedChunks.map((c) => c.id).sort();
  const completedDigests: Record<string, string> = {};
  for (const chunk of completedChunks) {
    completedDigests[chunk.id] = chunk.outputDigest ?? computeDeterministicDigestHex(`${state.job.jobId}:${chunk.id}`);
  }
  const integrityHash = computeDeterministicDigestHex(`${state.job.jobId}|t${state.tickIndex}|${completedChunkIds.join(",")}`);
  const seq = state.checkpoints.length + 1;
  const record: RenderCheckpointRecord = {
    checkpointId: `cp-${String(seq).padStart(2, "0")}-${integrityHash.slice(0, 6)}`,
    labelKo: labelKo ?? `체크포인트 #${seq} (${completedChunkIds.length}/${state.chunks.length} 청크)`,
    labelEn: labelEn ?? `Checkpoint #${seq} (${completedChunkIds.length}/${state.chunks.length} chunks)`,
    tickIndex: state.tickIndex, elapsedMs: state.elapsedMs, completedChunkIds, completedDigests,
    completedStages: getCompletedStagesFromChunks(state.chunks), integrityHash,
  };
  return { ...state, checkpoints: [...state.checkpoints, record] };
}

/** 지정된 체크포인트 시점으로 결정론적 재개(이미 완료된 패스·청크는 재렌더링하지 않음). */
export function resumeFromCheckpoint(state: RenderFarmState, checkpointId: string): RenderFarmState {
  const checkpoint = state.checkpoints.find((cp) => cp.checkpointId === checkpointId);
  if (!checkpoint) return state;
  const completedSet = new Set(checkpoint.completedChunkIds);
  const restoredChunks: RenderChunkTask[] = state.chunks.map((chunk) => {
    if (completedSet.has(chunk.id)) {
      return {
        ...chunk, status: "completed", remainingComputeMs: 0, progressPct: 100, assignedNodeId: null,
        outputDigest: checkpoint.completedDigests[chunk.id] ?? chunk.outputDigest ?? computeDeterministicDigestHex(`${state.job.jobId}:${chunk.id}`),
      };
    }
    const depsMet = chunk.dependsOnChunkIds.every((depId) => completedSet.has(depId));
    return {
      ...chunk, status: depsMet ? "ready" : "pending", remainingComputeMs: chunk.computeBudgetMs,
      progressPct: 0, assignedNodeId: null, resumedFromCheckpointId: checkpoint.checkpointId, outputDigest: null,
    };
  });
  const restoredNodes: RenderComputeNode[] = state.nodes.map((node) => ({
    ...node, memoryUsedMb: 0, status: node.status === "throttled" ? "healthy" : node.status,
  }));
  const allDone = restoredChunks.every((c) => c.status === "completed");
  return {
    ...state, status: allDone ? "completed" : "running", tickIndex: checkpoint.tickIndex,
    elapsedMs: checkpoint.elapsedMs, backpressureLevel: "nominal", nodes: restoredNodes,
    chunks: restoredChunks, lastResumedCheckpointId: checkpoint.checkpointId,
  };
}

/** 특정 노드에 장애를 주입하고, 실행 중이던 청크를 체크포인트 기준 ready 상태로 안전 반환한다. */
export function injectNodeFailure(state: RenderFarmState, nodeId: string): RenderFarmState {
  if (!state.nodes.some((n) => n.id === nodeId)) return state;
  const latestCpId = state.checkpoints[state.checkpoints.length - 1]?.checkpointId ?? "ephemeral-recovery-frontier";
  let affectedCount = 0;
  const nextChunks: RenderChunkTask[] = state.chunks.map((chunk) => {
    if (chunk.status === "running" && chunk.assignedNodeId === nodeId) {
      affectedCount += 1;
      return {
        ...chunk, status: "ready", assignedNodeId: null, remainingComputeMs: chunk.computeBudgetMs,
        progressPct: 0, resumedFromCheckpointId: latestCpId,
      };
    }
    return chunk;
  });
  const nextNodes: RenderComputeNode[] = state.nodes.map((node) =>
    node.id !== nodeId
      ? node
      : { ...node, status: "offline", memoryUsedMb: 0, rttMs: 999, jitterMs: 120, packetLossPct: 100, failedChunks: node.failedChunks + affectedCount },
  );
  const anyOnline = nextNodes.some((n) => n.status !== "offline");
  const allCompleted = nextChunks.every((c) => c.status === "completed");
  const nextStatus: RenderFarmRunStatus = allCompleted ? "completed" : anyOnline ? (state.status === "queued" ? "queued" : "running") : "degraded";
  return { ...state, status: nextStatus, nodes: nextNodes, chunks: nextChunks, failoverRecoveries: state.failoverRecoveries + affectedCount };
}

/** 장애 또는 저하 상태의 노드를 정상 풀로 복구한다. */
export function recoverComputeNode(state: RenderFarmState, nodeId: string): RenderFarmState {
  const nextNodes = state.nodes.map((node) =>
    node.id !== nodeId ? node : { ...node, status: "healthy" as const, rttMs: node.baselineRttMs, jitterMs: node.baselineJitterMs, packetLossPct: 0 },
  );
  const allCompleted = state.chunks.every((c) => c.status === "completed");
  return { ...state, status: allCompleted ? "completed" : state.status === "degraded" ? "running" : state.status, nodes: nextNodes };
}

/** 초저지연 에지 노드 및 로컬 WebGPU/워커 클러스터의 헬스 진단을 계산한다. */
export function diagnoseEdgeClusterHealth(nodes: readonly RenderComputeNode[]): EdgeClusterHealthReport {
  const alerts: EdgeHealthAlert[] = [];
  const nodeDiagnostics: EdgeNodeDiagnostic[] = nodes.map((node) => {
    const latencyTier: EdgeLatencyTier =
      node.status === "offline" || node.rttMs >= 80 ? "critical" : node.rttMs >= 35 ? "elevated" : node.rttMs >= 15 ? "low" : "ultra-low";
    const memoryUtilizationPct = node.memoryBudgetMb > 0 ? Math.min(100, Math.round((node.memoryUsedMb / node.memoryBudgetMb) * 100)) : 100;
    let effectiveScore = node.status === "offline" ? 0 : 100 - Math.min(45, node.rttMs * 0.7) - Math.min(20, node.jitterMs * 2.5) - Math.min(25, node.packetLossPct * 12);
    if (node.status === "degraded") effectiveScore -= 18;
    if (node.status === "throttled") effectiveScore -= 12;
    effectiveScore = node.status === "offline" ? 0 : Math.max(5, Math.round(effectiveScore));
    if (node.status === "offline") {
      alerts.push({ id: `alert-offline-${node.id}`, nodeId: node.id, severity: "critical", messageKo: `${node.nameKo} 연결 끊김 — 정상 노드로 작업 훔치기 우회 중`, messageEn: `${node.nameEn} offline — work-stealing failover active` });
    } else if (latencyTier === "elevated" || latencyTier === "critical") {
      alerts.push({ id: `alert-rtt-${node.id}`, nodeId: node.id, severity: "warning", messageKo: `${node.nameKo} 지연 상승 (${roundToOne(node.rttMs)}ms)`, messageEn: `${node.nameEn} elevated latency (${roundToOne(node.rttMs)}ms)` });
    }
    return {
      nodeId: node.id, nameKo: node.nameKo, nameEn: node.nameEn, kind: node.kind, region: node.region, status: node.status,
      rttMs: roundToOne(node.rttMs), jitterMs: roundToOne(node.jitterMs), packetLossPct: roundToOne(node.packetLossPct),
      latencyTier, memoryUtilizationPct, effectiveScore,
    };
  });

  const onlineNodes = nodes.filter((n) => n.status !== "offline");
  const sortedRtts = onlineNodes.map((n) => n.rttMs).sort((a, b) => a - b);
  const p50Idx = Math.min(sortedRtts.length - 1, Math.max(0, Math.ceil(sortedRtts.length * 0.5) - 1));
  const p95Idx = Math.min(sortedRtts.length - 1, Math.max(0, Math.ceil(sortedRtts.length * 0.95) - 1));
  const p50RttMs = sortedRtts.length === 0 ? 999 : roundToOne(sortedRtts[p50Idx] ?? 0);
  const p95RttMs = sortedRtts.length === 0 ? 999 : roundToOne(sortedRtts[p95Idx] ?? 0);
  const avgJitterMs = onlineNodes.length === 0 ? 0 : roundToOne(onlineNodes.reduce((s, n) => s + n.jitterMs, 0) / onlineNodes.length);
  const healthyNodeCount = nodes.filter((n) => n.status === "healthy").length;
  const degradedNodeCount = nodes.filter((n) => n.status === "degraded" || n.status === "throttled").length;
  const offlineNodeCount = nodes.filter((n) => n.status === "offline").length;
  const avgScore = nodeDiagnostics.length === 0 ? 0 : nodeDiagnostics.reduce((s, d) => s + d.effectiveScore, 0) / nodeDiagnostics.length;

  const grade: EdgeReadinessGrade =
    offlineNodeCount === nodes.length || avgScore < 35 ? "D"
      : offlineNodeCount >= 2 || avgScore < 55 ? "C"
        : offlineNodeCount === 1 || p95RttMs > 45 || avgScore < 75 ? "B"
          : degradedNodeCount > 0 || p95RttMs > 28 || avgScore < 88 ? "A" : "S";

  return {
    grade, slaCompliant: offlineNodeCount === 0 && degradedNodeCount === 0 && p95RttMs <= 35 && healthyNodeCount >= 1,
    p50RttMs, p95RttMs, avgJitterMs, healthyNodeCount, degradedNodeCount, offlineNodeCount, nodeDiagnostics, alerts,
  };
}

/** 분산 렌더팜 스케줄러를 1틱 진행한다(실행→DAG 승격→백프레셔→작업 훔치기 디스패치→자동 체크포인트). */
export function stepRenderFarmTick(state: RenderFarmState, tickDurationMs = 120): RenderFarmState {
  requireFiniteRange(tickDurationMs, "틱 시간", Number.MIN_VALUE);
  if (state.chunks.every((c) => c.status === "completed")) return { ...state, status: "completed" };

  const safeTickMs = Math.max(20, tickDurationMs);
  const nextTick = state.tickIndex + 1;
  const nextElapsedMs = state.elapsedMs + safeTickMs;
  const nodeMap = new Map<string, RenderComputeNode>(state.nodes.map((node) => [node.id, { ...node }]));
  const activeCountByNode = new Map<string, number>(state.nodes.map((node) => [node.id, 0]));
  const prevCompletedStages = new Set(getCompletedStagesFromChunks(state.chunks));

  let workingChunks: RenderChunkTask[] = state.chunks.map((chunk) => {
    if (chunk.status !== "running" || !chunk.assignedNodeId) return chunk;
    const node = nodeMap.get(chunk.assignedNodeId);
    if (!node || node.status === "offline") {
      return { ...chunk, status: "ready", assignedNodeId: null, remainingComputeMs: chunk.computeBudgetMs, progressPct: 0 };
    }
    const effectiveWorkMs = safeTickMs * node.throughputMultiplier * (1 / (1 + node.rttMs / 400));
    const nextRemaining = Math.max(0, chunk.remainingComputeMs - effectiveWorkMs);
    if (nextRemaining <= 0.001) {
      nodeMap.set(node.id, { ...node, memoryUsedMb: Math.max(0, node.memoryUsedMb - chunk.vramFootprintMb), completedChunks: node.completedChunks + 1 });
      return {
        ...chunk, status: "completed", remainingComputeMs: 0, progressPct: 100, assignedNodeId: null,
        outputDigest: computeDeterministicDigestHex(`${state.job.jobId}|${chunk.id}|${node.id}|a${chunk.attemptCount}`),
      };
    }
    activeCountByNode.set(node.id, (activeCountByNode.get(node.id) ?? 0) + 1);
    return {
      ...chunk, remainingComputeMs: roundToOne(nextRemaining),
      progressPct: Math.min(99, Math.round(((chunk.computeBudgetMs - nextRemaining) / chunk.computeBudgetMs) * 100)),
    };
  });

  const completedIdSet = new Set(workingChunks.filter((c) => c.status === "completed").map((c) => c.id));
  workingChunks = workingChunks.map((chunk) =>
    chunk.status === "pending" && chunk.dependsOnChunkIds.every((depId) => completedIdSet.has(depId))
      ? { ...chunk, status: "ready" } : chunk,
  );

  const highPct = state.job.backpressureHighPct ?? 80;
  const criticalPct = state.job.backpressureCriticalPct ?? 92;
  let globalUsedMb = Array.from(nodeMap.values()).reduce((sum, n) => sum + n.memoryUsedMb, 0);
  const readyQueue = workingChunks.filter((c) => c.status === "ready").sort((a, b) => a.stageOrder - b.stageOrder || a.id.localeCompare(b.id));
  const newStealEvents: WorkStealEvent[] = [];
  const newBackpressureEvents: BackpressureEvent[] = [];
  const updatedById = new Map<string, RenderChunkTask>();
  let deferredByBackpressure = 0;

  for (const chunk of readyQueue) {
    const pressure = evaluateBackpressureLevel(globalUsedMb, state.job.globalMemoryBudgetMb, highPct, criticalPct);
    if (pressure === "critical" || globalUsedMb + chunk.vramFootprintMb > state.job.globalMemoryBudgetMb) {
      deferredByBackpressure += 1;
      continue;
    }
    const concurrencyCap = pressure === "high" ? 1 : null;
    const preferred = nodeMap.get(chunk.preferredNodeId);
    const preferredCanTake =
      preferred !== undefined && preferred.status !== "offline" &&
      (activeCountByNode.get(preferred.id) ?? 0) < (concurrencyCap ?? preferred.maxConcurrentChunks) &&
      preferred.memoryUsedMb + chunk.vramFootprintMb <= preferred.memoryBudgetMb;

    let chosenNode: RenderComputeNode | undefined = preferredCanTake ? preferred : undefined;
    let isSteal = false;
    let stealReason: WorkStealEvent["reason"] = "load-balance";
    if (!chosenNode) {
      const candidates = Array.from(nodeMap.values())
        .filter((node) => node.status !== "offline" && (activeCountByNode.get(node.id) ?? 0) < (concurrencyCap ?? node.maxConcurrentChunks) && node.memoryUsedMb + chunk.vramFootprintMb <= node.memoryBudgetMb)
        .sort((a, b) => ((activeCountByNode.get(a.id) ?? 0) - (activeCountByNode.get(b.id) ?? 0)) || (b.throughputMultiplier - a.throughputMultiplier) || (a.rttMs - b.rttMs));
      chosenNode = candidates[0];
      isSteal = chosenNode !== undefined && chosenNode.id !== chunk.preferredNodeId;
      stealReason = preferred?.status === "offline"
        ? "failover-recovery"
        : preferred !== undefined && preferred.memoryUsedMb + chunk.vramFootprintMb > preferred.memoryBudgetMb
          ? "backpressure-relief" : "load-balance";
    }
    if (!chosenNode) {
      deferredByBackpressure += 1;
      continue;
    }

    globalUsedMb += chunk.vramFootprintMb;
    activeCountByNode.set(chosenNode.id, (activeCountByNode.get(chosenNode.id) ?? 0) + 1);
    nodeMap.set(chosenNode.id, { ...chosenNode, memoryUsedMb: chosenNode.memoryUsedMb + chunk.vramFootprintMb, stolenChunks: chosenNode.stolenChunks + (isSteal ? 1 : 0) });
    if (isSteal) {
      newStealEvents.push({
        eventId: `steal-${nextTick}-${newStealEvents.length + 1}`, tickIndex: nextTick, chunkId: chunk.id,
        fromNodeId: chunk.preferredNodeId, toNodeId: chosenNode.id, reason: stealReason,
        savedEstimatedMs: Math.max(18, Math.round(chunk.computeBudgetMs / Math.max(0.5, chosenNode.throughputMultiplier))),
      });
    }
    updatedById.set(chunk.id, { ...chunk, status: "running", assignedNodeId: chosenNode.id, attemptCount: chunk.attemptCount + 1, stolenCount: chunk.stolenCount + (isSteal ? 1 : 0) });
  }

  workingChunks = workingChunks.map((chunk) => updatedById.get(chunk.id) ?? chunk);
  const finalPressure = evaluateBackpressureLevel(globalUsedMb, state.job.globalMemoryBudgetMb, highPct, criticalPct);
  if (deferredByBackpressure > 0 && (finalPressure === "high" || finalPressure === "critical")) {
    newBackpressureEvents.push({ eventId: `bp-${nextTick}`, tickIndex: nextTick, level: finalPressure, memoryUsedMb: globalUsedMb, memoryBudgetMb: state.job.globalMemoryBudgetMb, deferredChunkCount: deferredByBackpressure });
  }
  const finalNodes = Array.from(nodeMap.values()).map((node) => {
    if (node.status === "offline") return node;
    const nodeUtilPct = node.memoryBudgetMb > 0 ? (node.memoryUsedMb / node.memoryBudgetMb) * 100 : 100;
    return { ...node, status: (nodeUtilPct >= highPct ? "throttled" : "healthy") as NodeHealthStatus };
  });

  const allCompleted = workingChunks.every((c) => c.status === "completed");
  const anyOnline = finalNodes.some((n) => n.status !== "offline");
  const nextStatus: RenderFarmRunStatus = allCompleted ? "completed" : !anyOnline ? "degraded" : finalPressure === "high" || finalPressure === "critical" ? "backpressured" : "running";
  let nextState: RenderFarmState = {
    ...state, status: nextStatus, tickIndex: nextTick, elapsedMs: nextElapsedMs, backpressureLevel: finalPressure,
    nodes: finalNodes, chunks: workingChunks, stealEvents: [...state.stealEvents, ...newStealEvents],
    backpressureEvents: [...state.backpressureEvents, ...newBackpressureEvents],
  };

  const newlyCompletedStages = getCompletedStagesFromChunks(workingChunks).filter((stage) => !prevCompletedStages.has(stage));
  if (newlyCompletedStages.length > 0) {
    const lastStage = newlyCompletedStages[newlyCompletedStages.length - 1];
    const spec = RENDER_PASS_DAG_SPECS.find((s) => s.stage === lastStage);
    nextState = createRenderCheckpoint(nextState, `${spec?.labelKo ?? lastStage} 완료 자동 체크포인트`, `Auto-checkpoint after ${spec?.labelEn ?? lastStage}`);
  }
  return nextState;
}

/** 원클릭으로 6패스 분산 렌더링 전체를 완료(또는 최대 틱/전체 장애 중단)까지 실행한다. */
export function runOneClickSixPassRender(
  initialState: RenderFarmState,
  options?: { readonly tickDurationMs?: number; readonly maxTicks?: number },
): RenderFarmState {
  const tickDurationMs = options?.tickDurationMs ?? 120;
  const maxTicks = options?.maxTicks ?? 120;
  requireFiniteRange(tickDurationMs, "틱 시간", Number.MIN_VALUE);
  requireFiniteRange(maxTicks, "최대 틱 수", 1, 10000);
  if (!Number.isInteger(maxTicks)) throw new RangeError("최대 틱 수는 정수여야 합니다.");
  let current = initialState;
  for (let i = 0; i < maxTicks; i += 1) {
    if (current.status === "completed") break;
    if (!current.nodes.some((n) => n.status !== "offline")) return { ...current, status: "degraded" };
    current = stepRenderFarmTick(current, tickDurationMs);
  }
  return current;
}

/** 처리량, 예상 남은 시간(ETA), 백프레셔, 패스별 진행률, 에지 헬스 텔레메트리를 계산한다. */
export function computeRenderFarmTelemetry(state: RenderFarmState): RenderFarmTelemetry {
  let completedChunks = 0;
  let runningChunks = 0;
  let readyChunks = 0;
  let pendingChunks = 0;
  let totalComputeBudget = 0;
  let totalRemainingCompute = 0;
  for (const chunk of state.chunks) {
    totalComputeBudget += chunk.computeBudgetMs;
    totalRemainingCompute += chunk.remainingComputeMs;
    if (chunk.status === "completed") completedChunks += 1;
    else if (chunk.status === "running") runningChunks += 1;
    else if (chunk.status === "ready") readyChunks += 1;
    else if (chunk.status === "pending") pendingChunks += 1;
  }
  const overallProgressPct = totalComputeBudget <= 0 ? 100 : Math.min(100, Math.round(((totalComputeBudget - totalRemainingCompute) / totalComputeBudget) * 100));
  const memoryUsedMb = state.nodes.reduce((sum, node) => sum + node.memoryUsedMb, 0);
  const memoryUtilizationPct = state.job.globalMemoryBudgetMb > 0 ? Math.min(100, Math.round((memoryUsedMb / state.job.globalMemoryBudgetMb) * 100)) : 100;
  const activeCapacity = state.nodes.filter((n) => n.status !== "offline").reduce((s, n) => s + n.throughputMultiplier * (1 / (1 + n.rttMs / 400)), 0);
  const throughputChunksPerSec = state.elapsedMs > 0 ? roundToOne((completedChunks / state.elapsedMs) * 1000) : roundToOne(activeCapacity * 1.4);
  const estimatedRemainingMs = totalRemainingCompute <= 0 ? 0 : activeCapacity <= 0 ? -1 : Math.round(totalRemainingCompute / Math.max(0.4, activeCapacity));

  const stageProgress: StageProgressSummary[] = RENDER_PASS_DAG_SPECS.map((spec) => {
    const stageChunks = state.chunks.filter((c) => c.stage === spec.stage);
    const total = stageChunks.length;
    const completed = stageChunks.filter((c) => c.status === "completed").length;
    const running = stageChunks.filter((c) => c.status === "running").length;
    const ready = stageChunks.filter((c) => c.status === "ready").length;
    const progressPct = total === 0 ? 100 : Math.round(stageChunks.reduce((s, c) => s + c.progressPct, 0) / total);
    const status: StageProgressSummary["status"] = total > 0 && completed === total ? "completed" : completed > 0 || running > 0 || ready > 0 ? "active" : "pending";
    return { stage: spec.stage, labelKo: spec.labelKo, labelEn: spec.labelEn, completed, running, ready, total, progressPct, status };
  });

  return {
    overallProgressPct, completedChunks, runningChunks, readyChunks, pendingChunks, totalChunks: state.chunks.length,
    throughputChunksPerSec, estimatedRemainingMs, memoryUsedMb, globalMemoryBudgetMb: state.job.globalMemoryBudgetMb,
    memoryUtilizationPct, backpressureLevel: state.backpressureLevel, totalSteals: state.stealEvents.length,
    failoverRecoveries: state.failoverRecoveries, checkpointCount: state.checkpoints.length,
    latestCheckpointId: state.checkpoints[state.checkpoints.length - 1]?.checkpointId ?? null,
    stageProgress, edgeHealth: diagnoseEdgeClusterHealth(state.nodes),
  };
}
