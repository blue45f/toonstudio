/**
 * 분기형 컷툰 독자 진행 상태 — 현재 장면, 방문 이력, 되돌리기 스택과 그 전이.
 *
 * 순수 상태 기계다. 저장소(localStorage 등)는 다루지 않는다. 저장·복원에 쓰는 기록 모양(BranchingProgressRecord)과
 * 그 검증(restoreReaderState)만 여기 있고, 읽고 쓰는 일은 화면 쪽 어댑터가 맡는다.
 *
 * 복원은 fail-closed 다: 그래프 판 지문이 다르거나, 없는 장면을 가리키거나, 이어지지 않는 길이 있으면 기록 전체를 버리고 null 을 돌려준다.
 * 호출한 쪽은 null 을 받으면 처음부터 시작한다.
 */
import {
  BRANCHING_TRAIL_LIMIT,
  type BranchingChoice,
  type BranchingCuttoonGraph,
  type BranchingNode,
} from "./branching-cuttoon-types";
import { branchingGraphVersion } from "./branching-cuttoon-version";

export interface BranchingTrailStep {
  /** 선택지를 누른 장면. */
  readonly nodeId: string;
  /** 그 장면에서 누른 선택지. */
  readonly choiceId: string;
}

export interface BranchingReaderState {
  /** 지금 읽고 있는 장면. */
  readonly nodeId: string;
  /** 지금까지 가 본 장면(처음 간 순서, 중복 없음). 되돌아가도 지워지지 않는다. */
  readonly visited: readonly string[];
  /** 지나온 선택의 스택. 마지막 원소가 직전 선택이다. */
  readonly trail: readonly BranchingTrailStep[];
}

export function findBranchingNode(graph: BranchingCuttoonGraph, nodeId: string): BranchingNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

/** 처음부터 읽는 상태. 시작 장면을 찾을 수 없으면 null. */
export function startReading(graph: BranchingCuttoonGraph): BranchingReaderState | null {
  const start = findBranchingNode(graph, graph.startNodeId);
  return start ? { nodeId: start.id, visited: [start.id], trail: [] } : null;
}

/** 선택지를 누른다. 현재 장면이 없거나 결말이거나, 선택지·도착 장면이 없으면 null(상태는 그대로 두어야 한다). */
export function chooseBranch(
  graph: BranchingCuttoonGraph,
  state: BranchingReaderState,
  choiceId: string,
): BranchingReaderState | null {
  const current = findBranchingNode(graph, state.nodeId);
  if (!current || current.kind === "ending") return null;
  const choice = current.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) return null;
  const target = findBranchingNode(graph, choice.targetNodeId);
  if (!target) return null;
  const trail = [...state.trail, { nodeId: current.id, choiceId: choice.id }];
  return {
    nodeId: target.id,
    visited: state.visited.includes(target.id) ? state.visited : [...state.visited, target.id],
    trail: trail.length > BRANCHING_TRAIL_LIMIT ? trail.slice(trail.length - BRANCHING_TRAIL_LIMIT) : trail,
  };
}

export function canStepBack(state: BranchingReaderState): boolean {
  return state.trail.length > 0;
}

/** 직전 선택을 되돌린다. 되돌릴 선택이 없으면 null. 방문 이력은 유지한다. */
export function stepBack(state: BranchingReaderState): BranchingReaderState | null {
  const last = state.trail[state.trail.length - 1];
  if (!last) return null;
  return { nodeId: last.nodeId, visited: state.visited, trail: state.trail.slice(0, -1) };
}

export interface BranchingSceneCut {
  readonly id: string;
  /** 컷 표에 없는 참조면 null. 검증을 통과한 그래프에서는 생기지 않는다. */
  readonly caption: string | null;
}

export interface BranchingReaderScene {
  readonly node: BranchingNode;
  readonly cuts: readonly BranchingSceneCut[];
  /** 독자가 누를 수 있는 선택지. 결말 장면은 비어 있다. */
  readonly choices: readonly BranchingChoice[];
  readonly isEnding: boolean;
}

/** 화면이 그릴 장면 한 개. 현재 장면이 그래프에 없으면 null. */
export function readerScene(graph: BranchingCuttoonGraph, state: BranchingReaderState): BranchingReaderScene | null {
  const node = findBranchingNode(graph, state.nodeId);
  if (!node) return null;
  const captions = new Map(graph.cuts.map((cut) => [cut.id, cut.caption] as const));
  const isEnding = node.kind === "ending";
  return {
    node,
    isEnding,
    cuts: node.cutIds.map((id) => ({ id, caption: captions.get(id) ?? null })),
    choices: isEnding ? [] : node.choices,
  };
}

export const BRANCHING_PROGRESS_RECORD_VERSION = 1;

export interface BranchingProgressRecord {
  readonly v: typeof BRANCHING_PROGRESS_RECORD_VERSION;
  /** 기록을 만든 때의 그래프 판 지문. */
  readonly graphVersion: string;
  readonly nodeId: string;
  readonly visited: readonly string[];
  readonly trail: readonly BranchingTrailStep[];
}

export function toProgressRecord(graph: BranchingCuttoonGraph, state: BranchingReaderState): BranchingProgressRecord {
  return {
    v: BRANCHING_PROGRESS_RECORD_VERSION,
    graphVersion: branchingGraphVersion(graph),
    nodeId: state.nodeId,
    visited: [...state.visited],
    trail: state.trail.map((step) => ({ nodeId: step.nodeId, choiceId: step.choiceId })),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function stringList(value: unknown, max: number): string[] | null {
  if (!isUnknownArray(value) || value.length > max) return null;
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    list.push(item);
  }
  return list;
}

function trailSteps(value: unknown): BranchingTrailStep[] | null {
  if (!isUnknownArray(value) || value.length > BRANCHING_TRAIL_LIMIT) return null;
  const steps: BranchingTrailStep[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.nodeId !== "string" || typeof item.choiceId !== "string") return null;
    steps.push({ nodeId: item.nodeId, choiceId: item.choiceId });
  }
  return steps;
}

/**
 * 저장해 둔 기록을 읽기 상태로 되살린다. 기록이 이 그래프 판의 것이 아니거나 하나라도 어긋나면 null.
 * 어긋남의 기준: 현재·방문 장면이 없음, 방문 장면이 겹침, 현재·지나온 장면이 방문 이력에 없음, 지나온 선택이 없는 선택지이거나
 * 결말에서 시작했거나 다음 장면으로 이어지지 않음.
 */
export function restoreReaderState(graph: BranchingCuttoonGraph, record: unknown): BranchingReaderState | null {
  if (!isRecord(record) || record.v !== BRANCHING_PROGRESS_RECORD_VERSION) return null;
  if (record.graphVersion !== branchingGraphVersion(graph)) return null;
  if (typeof record.nodeId !== "string") return null;
  const visited = stringList(record.visited, graph.nodes.length);
  const trail = trailSteps(record.trail);
  if (!visited || !trail) return null;

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!nodeIds.has(record.nodeId)) return null;
  if (new Set(visited).size !== visited.length || visited.some((id) => !nodeIds.has(id))) return null;
  const visitedSet = new Set(visited);
  if (!visitedSet.has(record.nodeId)) return null;

  for (let position = 0; position < trail.length; position += 1) {
    const step = trail[position];
    if (!step) return null;
    const from = findBranchingNode(graph, step.nodeId);
    if (!from || from.kind === "ending" || !visitedSet.has(from.id)) return null;
    const choice = from.choices.find((candidate) => candidate.id === step.choiceId);
    const next = position + 1 < trail.length ? trail[position + 1]?.nodeId : record.nodeId;
    if (!choice || choice.targetNodeId !== next) return null;
  }
  return { nodeId: record.nodeId, visited, trail };
}
