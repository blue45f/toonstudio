/**
 * Wasm64 Wave 33: 에피소드 다중 에이전트 워크플로 DAG 오케스트레이터 (`episode-multi-agent-dag-orchestrator`).
 *
 * - 5단계 표준 파이프라인(`storyboard` -> `lineart-cleanup` -> `flat-color` -> `shading-screentone` -> `lettering-qa`)의
 *   위상 정렬 기반 실행 스케줄링, 컷별 예산 강제, 인간 작가 승인 게이트, 장애 격리·폴백 및 FNV-1a 체크포인트를 담당한다.
 */

export const EPISODE_WORKFLOW_STAGES = [
  "storyboard",
  "lineart-cleanup",
  "flat-color",
  "shading-screentone",
  "lettering-qa",
] as const;

export type EpisodeWorkflowStage = (typeof EPISODE_WORKFLOW_STAGES)[number];
export type StageImpactKind = "destructive" | "final" | "non-destructive";

export type DagNodeExecutionStatus =
  | "awaiting-human-approval"
  | "blocked-upstream"
  | "failed-isolated"
  | "halted-budget-exceeded"
  | "pending-upstream"
  | "ready"
  | "rejected-by-artist"
  | "running"
  | "succeeded";

export interface StageTemplateSpec {
  readonly stage: EpisodeWorkflowStage;
  readonly labelKo: string;
  readonly impactKind: StageImpactKind;
  readonly defaultEstimatedTokens: number;
  readonly defaultEstimatedComputeMs: number;
  readonly primaryAgentId: string;
  readonly fallbackAgentId: string;
}

export interface CutResourceBudget {
  readonly cutId: string;
  readonly maxTokens: number;
  readonly maxComputeMs: number;
  readonly spentTokens: number;
  readonly spentComputeMs: number;
}

export interface HumanArtistApprovalRecord {
  readonly artistId: string;
  readonly approved: boolean;
  readonly noteKo: string;
  readonly decidedAtMs: number;
}

export interface EpisodeDagNode {
  readonly nodeId: string;
  readonly cutId: string;
  readonly cutOrderIndex: number;
  readonly stage: EpisodeWorkflowStage;
  readonly stageRank: number;
  readonly impactKind: StageImpactKind;
  readonly requiresHumanApproval: boolean;
  readonly prerequisiteNodeIds: readonly string[];
  readonly status: DagNodeExecutionStatus;
  readonly primaryAgentId: string;
  readonly fallbackAgentId: string;
  readonly assignedAgentId: string;
  readonly usingFallbackAgent: boolean;
  readonly maxRetries: number;
  readonly failureCount: number;
  readonly lastErrorReason: string | null;
  readonly estimatedTokens: number;
  readonly estimatedComputeMs: number;
  readonly actualTokensUsed: number;
  readonly actualComputeMsUsed: number;
  readonly approvalRecord: HumanArtistApprovalRecord | null;
}

export interface EpisodeCutPlanInput {
  readonly cutId: string;
  readonly maxTokens: number;
  readonly maxComputeMs: number;
  readonly maxRetriesPerStage?: number;
  readonly stageEstimateOverrides?: Partial<
    Readonly<Record<EpisodeWorkflowStage, { readonly tokens: number; readonly computeMs: number }>>
  >;
  readonly extraApprovalStages?: readonly EpisodeWorkflowStage[];
  readonly extraDependencies?: Partial<Readonly<Record<EpisodeWorkflowStage, readonly string[]>>>;
}

export interface EpisodeDagInitOptions {
  readonly episodeId: string;
  readonly cuts: readonly EpisodeCutPlanInput[];
}

export interface EpisodeDagOrchestratorState {
  readonly episodeId: string;
  readonly topologicalNodeOrder: readonly string[];
  readonly nodes: Readonly<Record<string, EpisodeDagNode>>;
  readonly cutBudgets: Readonly<Record<string, CutResourceBudget>>;
}

export interface ScheduledStageDispatch {
  readonly nodeId: string;
  readonly cutId: string;
  readonly stage: EpisodeWorkflowStage;
  readonly agentId: string;
  readonly usingFallbackAgent: boolean;
  readonly estimatedTokens: number;
  readonly estimatedComputeMs: number;
}

export interface ScheduleTickResult {
  readonly dispatches: readonly ScheduledStageDispatch[];
  readonly nextState: EpisodeDagOrchestratorState;
}

export interface HumanApprovalDecisionInput {
  readonly nodeId: string;
  readonly artistId: string;
  readonly approved: boolean;
  readonly noteKo: string;
  readonly decidedAtMs: number;
}

export interface StageCompletionInput {
  readonly nodeId: string;
  readonly actualTokensUsed: number;
  readonly actualComputeMsUsed: number;
}

export interface StageFailureInput {
  readonly nodeId: string;
  readonly errorReason: string;
  readonly tokensConsumed?: number;
  readonly computeMsConsumed?: number;
}

export interface EpisodeDagCheckpointSnapshot {
  readonly schemaVersion: 1;
  readonly episodeId: string;
  readonly createdAtMs: number;
  readonly topologicalNodeOrder: readonly string[];
  readonly nodes: readonly EpisodeDagNode[];
  readonly cutBudgets: readonly CutResourceBudget[];
  readonly digestHex: string;
}

export const CANONICAL_STAGE_SPECS: Readonly<Record<EpisodeWorkflowStage, StageTemplateSpec>> = {
  storyboard: {
    stage: "storyboard", labelKo: "콘티·구도 설계", impactKind: "non-destructive",
    defaultEstimatedTokens: 600, defaultEstimatedComputeMs: 250,
    primaryAgentId: "agent-storyboard-director", fallbackAgentId: "agent-storyboard-lite",
  },
  "lineart-cleanup": {
    stage: "lineart-cleanup", labelKo: "선화 정돈", impactKind: "non-destructive",
    defaultEstimatedTokens: 900, defaultEstimatedComputeMs: 450,
    primaryAgentId: "agent-lineart-vectorizer", fallbackAgentId: "agent-lineart-fallback-clean",
  },
  "flat-color": {
    stage: "flat-color", labelKo: "밑색 영역 분리", impactKind: "non-destructive",
    defaultEstimatedTokens: 700, defaultEstimatedComputeMs: 320,
    primaryAgentId: "agent-flat-palette", fallbackAgentId: "agent-flat-region-fill",
  },
  "shading-screentone": {
    stage: "shading-screentone", labelKo: "명암·스크린톤 병합", impactKind: "destructive",
    defaultEstimatedTokens: 1100, defaultEstimatedComputeMs: 600,
    primaryAgentId: "agent-tone-compositor", fallbackAgentId: "agent-tone-halftone-safe",
  },
  "lettering-qa": {
    stage: "lettering-qa", labelKo: "식자 배치·최종 검수", impactKind: "final",
    defaultEstimatedTokens: 500, defaultEstimatedComputeMs: 200,
    primaryAgentId: "agent-lettering-inspector", fallbackAgentId: "agent-lettering-rule-checker",
  },
};

/** 컷 ID와 단계 이름으로 결정론적 DAG 노드 식별자를 만든다. */
export function buildEpisodeStageNodeId(cutId: string, stage: EpisodeWorkflowStage): string {
  return `${cutId}::${stage}`;
}

function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function computeFnv1aHex(canonicalText: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonicalText.length; i += 1) {
    hash ^= canonicalText.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function computeTopologicalNodeOrder(nodes: Readonly<Record<string, EpisodeDagNode>>): readonly string[] {
  const nodeList = Object.values(nodes);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const node of nodeList) {
    inDegree.set(node.nodeId, node.prerequisiteNodeIds.length);
    dependents.set(node.nodeId, []);
  }
  for (const node of nodeList) {
    for (const prereqId of node.prerequisiteNodeIds) {
      const targetList = dependents.get(prereqId);
      if (!targetList) throw new Error(`Unknown prerequisite DAG node: ${prereqId}`);
      targetList.push(node.nodeId);
    }
  }

  const comparePriority = (idA: string, idB: string): number => {
    const a = nodes[idA];
    const b = nodes[idB];
    if (!a || !b) return compareCodePoint(idA, idB);
    if (a.stageRank !== b.stageRank) return a.stageRank - b.stageRank;
    if (a.cutOrderIndex !== b.cutOrderIndex) return a.cutOrderIndex - b.cutOrderIndex;
    return compareCodePoint(idA, idB);
  };

  const queue: string[] = [];
  for (const [nodeId, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(nodeId);
  }
  queue.sort(comparePriority);

  const ordered: string[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) break;
    ordered.push(currentId);
    for (const depId of dependents.get(currentId) ?? []) {
      const nextDeg = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, nextDeg);
      if (nextDeg === 0) {
        queue.push(depId);
        queue.sort(comparePriority);
      }
    }
  }
  if (ordered.length !== nodeList.length) throw new Error("Cycle detected in episode workflow DAG");
  return ordered;
}

const TERMINAL_OR_ACTIVE: ReadonlySet<DagNodeExecutionStatus> = new Set([
  "failed-isolated", "rejected-by-artist", "running", "succeeded",
]);
const UPSTREAM_BLOCKING: ReadonlySet<DagNodeExecutionStatus> = new Set([
  "blocked-upstream", "failed-isolated", "halted-budget-exceeded", "rejected-by-artist",
]);

function evaluateRestStateForNode(
  node: EpisodeDagNode,
  allNodes: Readonly<Record<string, EpisodeDagNode>>,
  cutBudget: CutResourceBudget,
): DagNodeExecutionStatus {
  if (TERMINAL_OR_ACTIVE.has(node.status)) return node.status;

  let hasUpstreamBlock = false;
  let allPrereqsSucceeded = true;
  for (const prereqId of node.prerequisiteNodeIds) {
    const prereq = allNodes[prereqId];
    if (!prereq || prereq.status !== "succeeded") allPrereqsSucceeded = false;
    if (prereq && UPSTREAM_BLOCKING.has(prereq.status)) hasUpstreamBlock = true;
  }

  if (hasUpstreamBlock) return "blocked-upstream";
  if (!allPrereqsSucceeded) return "pending-upstream";
  if (node.requiresHumanApproval && (!node.approvalRecord || !node.approvalRecord.approved)) {
    return "awaiting-human-approval";
  }
  if (
    cutBudget.spentTokens + node.estimatedTokens > cutBudget.maxTokens ||
    cutBudget.spentComputeMs + node.estimatedComputeMs > cutBudget.maxComputeMs
  ) {
    return "halted-budget-exceeded";
  }
  return "ready";
}

function propagateDagReadiness(state: EpisodeDagOrchestratorState): EpisodeDagOrchestratorState {
  const updatedNodes: Record<string, EpisodeDagNode> = { ...state.nodes };
  for (const nodeId of state.topologicalNodeOrder) {
    const current = updatedNodes[nodeId];
    const budget = current ? state.cutBudgets[current.cutId] : undefined;
    if (!current || !budget) continue;
    const nextStatus = evaluateRestStateForNode(current, updatedNodes, budget);
    if (nextStatus !== current.status) updatedNodes[nodeId] = { ...current, status: nextStatus };
  }
  return { ...state, nodes: updatedNodes };
}

/** 에피소드 컷 목록으로부터 초기 다중 에이전트 DAG 오케스트레이터 상태를 구성한다. */
export function createEpisodeDagOrchestratorState(options: EpisodeDagInitOptions): EpisodeDagOrchestratorState {
  const nodes: Record<string, EpisodeDagNode> = {};
  const cutBudgets: Record<string, CutResourceBudget> = {};

  options.cuts.forEach((cut, cutOrderIndex) => {
    cutBudgets[cut.cutId] = {
      cutId: cut.cutId,
      maxTokens: Math.max(0, Math.floor(cut.maxTokens)),
      maxComputeMs: Math.max(0, Math.floor(cut.maxComputeMs)),
      spentTokens: 0,
      spentComputeMs: 0,
    };
    const extraApprovalSet = new Set<EpisodeWorkflowStage>(cut.extraApprovalStages ?? []);

    EPISODE_WORKFLOW_STAGES.forEach((stage, stageRank) => {
      const spec = CANONICAL_STAGE_SPECS[stage];
      const nodeId = buildEpisodeStageNodeId(cut.cutId, stage);
      const prevStage = stageRank > 0 ? EPISODE_WORKFLOW_STAGES[stageRank - 1] : undefined;
      const defaultPrereqs = prevStage ? [buildEpisodeStageNodeId(cut.cutId, prevStage)] : [];
      const uniquePrereqs = [...new Set([...defaultPrereqs, ...(cut.extraDependencies?.[stage] ?? [])])];
      const override = cut.stageEstimateOverrides?.[stage];
      const requiresHumanApproval =
        spec.impactKind === "destructive" || spec.impactKind === "final" || extraApprovalSet.has(stage);

      nodes[nodeId] = {
        nodeId,
        cutId: cut.cutId,
        cutOrderIndex,
        stage,
        stageRank,
        impactKind: spec.impactKind,
        requiresHumanApproval,
        prerequisiteNodeIds: uniquePrereqs,
        status: "pending-upstream",
        primaryAgentId: spec.primaryAgentId,
        fallbackAgentId: spec.fallbackAgentId,
        assignedAgentId: spec.primaryAgentId,
        usingFallbackAgent: false,
        maxRetries: Math.max(0, Math.floor(cut.maxRetriesPerStage ?? 1)),
        failureCount: 0,
        lastErrorReason: null,
        estimatedTokens: Math.max(0, Math.floor(override?.tokens ?? spec.defaultEstimatedTokens)),
        estimatedComputeMs: Math.max(0, Math.floor(override?.computeMs ?? spec.defaultEstimatedComputeMs)),
        actualTokensUsed: 0,
        actualComputeMsUsed: 0,
        approvalRecord: null,
      };
    });
  });

  return propagateDagReadiness({
    episodeId: options.episodeId,
    topologicalNodeOrder: computeTopologicalNodeOrder(nodes),
    nodes,
    cutBudgets,
  });
}

/** 위상 순서와 컷별 잔여 예산(실행 중 예약분 포함)을 검사하여 즉시 실행 가능한 에이전트 작업을 디스패치한다. */
export function scheduleReadyEpisodeTasks(
  state: EpisodeDagOrchestratorState,
  maxConcurrentDispatches = 4,
): ScheduleTickResult {
  const refreshed = propagateDagReadiness(state);
  const limit = Math.max(0, Math.floor(maxConcurrentDispatches));
  if (limit === 0) return { dispatches: [], nextState: refreshed };

  const reservedTokensByCut = new Map<string, number>();
  const reservedComputeByCut = new Map<string, number>();
  let activeRunningCount = 0;

  for (const node of Object.values(refreshed.nodes)) {
    if (node.status === "running") {
      activeRunningCount += 1;
      reservedTokensByCut.set(node.cutId, (reservedTokensByCut.get(node.cutId) ?? 0) + node.estimatedTokens);
      reservedComputeByCut.set(node.cutId, (reservedComputeByCut.get(node.cutId) ?? 0) + node.estimatedComputeMs);
    }
  }

  const updatedNodes: Record<string, EpisodeDagNode> = { ...refreshed.nodes };
  const dispatches: ScheduledStageDispatch[] = [];

  for (const nodeId of refreshed.topologicalNodeOrder) {
    if (activeRunningCount >= limit) break;
    const node = updatedNodes[nodeId];
    const budget = node ? refreshed.cutBudgets[node.cutId] : undefined;
    if (!node || node.status !== "ready" || !budget) continue;

    const reservedTok = reservedTokensByCut.get(node.cutId) ?? 0;
    const reservedMs = reservedComputeByCut.get(node.cutId) ?? 0;
    if (
      budget.spentTokens + reservedTok + node.estimatedTokens > budget.maxTokens ||
      budget.spentComputeMs + reservedMs + node.estimatedComputeMs > budget.maxComputeMs
    ) {
      updatedNodes[nodeId] = { ...node, status: "halted-budget-exceeded" };
      continue;
    }

    updatedNodes[nodeId] = { ...node, status: "running" };
    reservedTokensByCut.set(node.cutId, reservedTok + node.estimatedTokens);
    reservedComputeByCut.set(node.cutId, reservedMs + node.estimatedComputeMs);
    activeRunningCount += 1;

    dispatches.push({
      nodeId: node.nodeId,
      cutId: node.cutId,
      stage: node.stage,
      agentId: node.assignedAgentId,
      usingFallbackAgent: node.usingFallbackAgent,
      estimatedTokens: node.estimatedTokens,
      estimatedComputeMs: node.estimatedComputeMs,
    });
  }

  return { dispatches, nextState: propagateDagReadiness({ ...refreshed, nodes: updatedNodes }) };
}

/** 파괴적·최종 단계에 대한 인간 작가의 승인 또는 반려 결정을 기록하고 후속 단계 준비도를 갱신한다. */
export function submitHumanArtistApproval(
  state: EpisodeDagOrchestratorState,
  decision: HumanApprovalDecisionInput,
): EpisodeDagOrchestratorState {
  const target = state.nodes[decision.nodeId];
  if (!target) throw new Error(`Unknown episode DAG node: ${decision.nodeId}`);
  const approvalRecord: HumanArtistApprovalRecord = {
    artistId: decision.artistId, approved: decision.approved, noteKo: decision.noteKo, decidedAtMs: decision.decidedAtMs,
  };
  const updated: EpisodeDagNode = {
    ...target, approvalRecord, status: decision.approved ? "pending-upstream" : "rejected-by-artist",
  };
  return propagateDagReadiness({ ...state, nodes: { ...state.nodes, [decision.nodeId]: updated } });
}

/** 실행 중인 단계의 완료와 실측 자원 사용량을 기록하고 하위 단계의 위상 준비 상태를 연다. */
export function completeEpisodeStageExecution(
  state: EpisodeDagOrchestratorState,
  completion: StageCompletionInput,
): EpisodeDagOrchestratorState {
  const target = state.nodes[completion.nodeId];
  if (!target || target.status !== "running") throw new Error(`Stage node is not running: ${completion.nodeId}`);
  const budget = state.cutBudgets[target.cutId];
  if (!budget) throw new Error(`Missing cut budget for: ${target.cutId}`);

  const usedTokens = Math.max(0, Math.floor(completion.actualTokensUsed));
  const usedMs = Math.max(0, Math.floor(completion.actualComputeMsUsed));
  const nextBudget: CutResourceBudget = {
    ...budget, spentTokens: budget.spentTokens + usedTokens, spentComputeMs: budget.spentComputeMs + usedMs,
  };
  const nextNode: EpisodeDagNode = {
    ...target, status: "succeeded",
    actualTokensUsed: target.actualTokensUsed + usedTokens,
    actualComputeMsUsed: target.actualComputeMsUsed + usedMs,
  };
  return propagateDagReadiness({
    ...state,
    cutBudgets: { ...state.cutBudgets, [target.cutId]: nextBudget },
    nodes: { ...state.nodes, [target.nodeId]: nextNode },
  });
}

/** 단계 실패를 기록하고 재시도 한도 내에서는 폴백 에이전트로 전환하며 한도 초과 시 해당 컷만 격리한다. */
export function failEpisodeStageExecution(
  state: EpisodeDagOrchestratorState,
  failure: StageFailureInput,
): EpisodeDagOrchestratorState {
  const target = state.nodes[failure.nodeId];
  if (!target || target.status !== "running") throw new Error(`Stage node is not running: ${failure.nodeId}`);
  const budget = state.cutBudgets[target.cutId];
  if (!budget) throw new Error(`Missing cut budget for: ${target.cutId}`);

  const wastedTokens = Math.max(0, Math.floor(failure.tokensConsumed ?? 0));
  const wastedMs = Math.max(0, Math.floor(failure.computeMsConsumed ?? 0));
  const nextFailureCount = target.failureCount + 1;
  const canRetry = nextFailureCount <= target.maxRetries;
  const nextBudget: CutResourceBudget = {
    ...budget, spentTokens: budget.spentTokens + wastedTokens, spentComputeMs: budget.spentComputeMs + wastedMs,
  };
  const nextNode: EpisodeDagNode = {
    ...target,
    failureCount: nextFailureCount,
    lastErrorReason: failure.errorReason,
    actualTokensUsed: target.actualTokensUsed + wastedTokens,
    actualComputeMsUsed: target.actualComputeMsUsed + wastedMs,
    assignedAgentId: canRetry ? target.fallbackAgentId : target.assignedAgentId,
    usingFallbackAgent: canRetry ? true : target.usingFallbackAgent,
    status: canRetry ? "pending-upstream" : "failed-isolated",
  };
  return propagateDagReadiness({
    ...state,
    cutBudgets: { ...state.cutBudgets, [target.cutId]: nextBudget },
    nodes: { ...state.nodes, [target.nodeId]: nextNode },
  });
}

function serializeSnapshotPayload(
  episodeId: string,
  createdAtMs: number,
  topologicalNodeOrder: readonly string[],
  nodes: readonly EpisodeDagNode[],
  cutBudgets: readonly CutResourceBudget[],
): string {
  return JSON.stringify({ schemaVersion: 1, episodeId, createdAtMs, topologicalNodeOrder, nodes, cutBudgets });
}

/** 오케스트레이터 전체 실행 상태를 FNV-1a 무결성 다이제스트가 포함된 결정론적 체크포인트 스냅샷으로 직렬화한다. */
export function createEpisodeDagCheckpoint(
  state: EpisodeDagOrchestratorState,
  createdAtMs: number,
): EpisodeDagCheckpointSnapshot {
  const sortedNodes = state.topologicalNodeOrder
    .map((id) => state.nodes[id])
    .filter((node): node is EpisodeDagNode => node !== undefined);
  const sortedBudgets = Object.values(state.cutBudgets).sort((a, b) => compareCodePoint(a.cutId, b.cutId));
  const payload = serializeSnapshotPayload(state.episodeId, createdAtMs, state.topologicalNodeOrder, sortedNodes, sortedBudgets);
  return {
    schemaVersion: 1, episodeId: state.episodeId, createdAtMs,
    topologicalNodeOrder: [...state.topologicalNodeOrder],
    nodes: sortedNodes, cutBudgets: sortedBudgets, digestHex: computeFnv1aHex(payload),
  };
}

/** 체크포인트 스냅샷의 다이제스트 무결성을 검증한 뒤 오케스트레이터 실행 상태를 복원한다. */
export function restoreEpisodeDagFromCheckpoint(snapshot: EpisodeDagCheckpointSnapshot): EpisodeDagOrchestratorState {
  const expectedDigest = computeFnv1aHex(
    serializeSnapshotPayload(snapshot.episodeId, snapshot.createdAtMs, snapshot.topologicalNodeOrder, snapshot.nodes, snapshot.cutBudgets),
  );
  if (expectedDigest !== snapshot.digestHex) {
    throw new Error(`Checkpoint digest mismatch: expected ${expectedDigest}, got ${snapshot.digestHex}`);
  }
  const nodes: Record<string, EpisodeDagNode> = {};
  for (const node of snapshot.nodes) {
    nodes[node.nodeId] = {
      ...node,
      prerequisiteNodeIds: [...node.prerequisiteNodeIds],
      approvalRecord: node.approvalRecord ? { ...node.approvalRecord } : null,
    };
  }
  const cutBudgets: Record<string, CutResourceBudget> = {};
  for (const budget of snapshot.cutBudgets) cutBudgets[budget.cutId] = { ...budget };
  return { episodeId: snapshot.episodeId, topologicalNodeOrder: [...snapshot.topologicalNodeOrder], nodes, cutBudgets };
}
