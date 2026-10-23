/**
 * 분기형 컷툰 편집 함수 — 최소 제작 화면이 쓰는 불변 갱신.
 *
 * 모든 함수는 입력 그래프를 바꾸지 않고 새 그래프를 돌려준다. 한도를 넘기는 추가, 없는 대상, 지울 수 없는 시작 장면은
 * 거절 사유(reason)와 함께 `ok: false` 로 돌려주고 그래프는 그대로 둔다. 글(제목·라벨·캡션)의 길이와 문자는 여기서 막지 않는다:
 * 그것은 검증기가 오류로 알리고, 입력 칸은 maxLength 로 미리 막는다.
 */
import { nextFreeId } from "./branching-cuttoon-text";
import {
  BRANCHING_CUTTOON_LIMITS,
  type BranchingChoice,
  type BranchingCuttoonGraph,
  type BranchingEditableNodeKind,
  type BranchingNode,
} from "./branching-cuttoon-types";

export type BranchingEditBlock =
  | "node-limit"
  | "choice-limit"
  | "cut-limit"
  | "cut-table-limit"
  | "node-not-found"
  | "choice-not-found"
  | "cut-not-found"
  | "start-protected"
  | "id-exhausted";

export type BranchingEditResult<TExtra extends object = Record<never, never>> =
  | ({ readonly ok: true; readonly graph: BranchingCuttoonGraph } & TExtra)
  | { readonly ok: false; readonly reason: BranchingEditBlock };

const blocked = (reason: BranchingEditBlock): { readonly ok: false; readonly reason: BranchingEditBlock } => ({ ok: false, reason });

/** 새 그래프: 시작 장면 하나만 있다. 결말과 선택지는 작가가 더한다. */
export function createBranchingGraph(init: { readonly title: string; readonly startTitle: string }): BranchingCuttoonGraph {
  return {
    title: init.title,
    startNodeId: "start",
    cuts: [],
    nodes: [{ id: "start", kind: "start", title: init.startTitle, cutIds: [], choices: [] }],
  };
}

export function setGraphTitle(graph: BranchingCuttoonGraph, title: string): BranchingCuttoonGraph {
  return { ...graph, title };
}

function replaceNode(
  graph: BranchingCuttoonGraph,
  nodeId: string,
  update: (node: BranchingNode) => BranchingNode,
): BranchingEditResult {
  const position = graph.nodes.findIndex((node) => node.id === nodeId);
  const current = graph.nodes[position];
  if (!current) return blocked("node-not-found");
  const nodes = graph.nodes.map((node, candidate) => (candidate === position ? update(current) : node));
  return { ok: true, graph: { ...graph, nodes } };
}

/** 어느 장면도 쓰지 않는 컷을 컷 표에서 지운다. */
function pruneUnusedCuts(graph: BranchingCuttoonGraph): BranchingCuttoonGraph {
  const used = new Set(graph.nodes.flatMap((node) => node.cutIds));
  return graph.cuts.every((cut) => used.has(cut.id)) ? graph : { ...graph, cuts: graph.cuts.filter((cut) => used.has(cut.id)) };
}

export function addNode(
  graph: BranchingCuttoonGraph,
  kind: BranchingEditableNodeKind,
  title: string,
): BranchingEditResult<{ readonly nodeId: string }> {
  if (graph.nodes.length >= BRANCHING_CUTTOON_LIMITS.nodes) return blocked("node-limit");
  const nodeId = nextFreeId("n", new Set(graph.nodes.map((node) => node.id)));
  if (nodeId === null) return blocked("id-exhausted");
  const node: BranchingNode = { id: nodeId, kind, title, cutIds: [], choices: [] };
  return { ok: true, graph: { ...graph, nodes: [...graph.nodes, node] }, nodeId };
}

/** 제목을 바꾸거나 종류를 scene ↔ ending 으로 바꾼다. 시작 장면의 종류는 바꿀 수 없다(다른 장면을 시작으로 지정한다). */
export function updateNode(
  graph: BranchingCuttoonGraph,
  nodeId: string,
  patch: { readonly title?: string; readonly kind?: BranchingEditableNodeKind },
): BranchingEditResult {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  if (patch.kind !== undefined && target.kind === "start") return blocked("start-protected");
  return replaceNode(graph, nodeId, (node) => ({
    ...node,
    title: patch.title ?? node.title,
    kind: patch.kind ?? node.kind,
  }));
}

/** 장면을 시작 장면으로 지정한다. 이전 시작 장면은 일반 장면이 된다. */
export function setStartNode(graph: BranchingCuttoonGraph, nodeId: string): BranchingEditResult {
  if (!graph.nodes.some((node) => node.id === nodeId)) return blocked("node-not-found");
  const nodes = graph.nodes.map((node): BranchingNode => {
    if (node.id === nodeId) return { ...node, kind: "start" };
    return node.kind === "start" ? { ...node, kind: "scene" } : node;
  });
  return { ok: true, graph: { ...graph, startNodeId: nodeId, nodes } };
}

/** 장면을 지운다. 그 장면으로 오던 선택지도 함께 지우고, 더는 쓰이지 않는 컷도 컷 표에서 뺀다. 시작 장면은 지울 수 없다. */
export function removeNode(
  graph: BranchingCuttoonGraph,
  nodeId: string,
): BranchingEditResult<{ readonly removedChoiceCount: number }> {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  if (target.kind === "start" || graph.startNodeId === nodeId) return blocked("start-protected");
  let removedChoiceCount = 0;
  const nodes = graph.nodes
    .filter((node) => node !== target)
    .map((node) => {
      const choices = node.choices.filter((choice) => choice.targetNodeId !== nodeId);
      removedChoiceCount += node.choices.length - choices.length;
      return choices.length === node.choices.length ? node : { ...node, choices };
    });
  return { ok: true, graph: pruneUnusedCuts({ ...graph, nodes }), removedChoiceCount };
}

export function addChoice(
  graph: BranchingCuttoonGraph,
  nodeId: string,
  label: string,
  targetNodeId = "",
): BranchingEditResult<{ readonly choiceId: string }> {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  if (target.choices.length >= BRANCHING_CUTTOON_LIMITS.choicesPerNode) return blocked("choice-limit");
  const choiceId = nextFreeId("c", new Set(target.choices.map((choice) => choice.id)));
  if (choiceId === null) return blocked("id-exhausted");
  const choice: BranchingChoice = { id: choiceId, label, targetNodeId };
  const result = replaceNode(graph, nodeId, (node) => ({ ...node, choices: [...node.choices, choice] }));
  return result.ok ? { ok: true, graph: result.graph, choiceId } : result;
}

export function updateChoice(
  graph: BranchingCuttoonGraph,
  nodeId: string,
  choiceId: string,
  patch: { readonly label?: string; readonly targetNodeId?: string },
): BranchingEditResult {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  if (!target.choices.some((choice) => choice.id === choiceId)) return blocked("choice-not-found");
  return replaceNode(graph, nodeId, (node) => ({
    ...node,
    choices: node.choices.map((choice) => (choice.id === choiceId
      ? { ...choice, label: patch.label ?? choice.label, targetNodeId: patch.targetNodeId ?? choice.targetNodeId }
      : choice)),
  }));
}

export function removeChoice(graph: BranchingCuttoonGraph, nodeId: string, choiceId: string): BranchingEditResult {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  if (!target.choices.some((choice) => choice.id === choiceId)) return blocked("choice-not-found");
  return replaceNode(graph, nodeId, (node) => ({ ...node, choices: node.choices.filter((choice) => choice.id !== choiceId) }));
}

function moved<T>(list: readonly T[], position: number, direction: -1 | 1): readonly T[] {
  const destination = position + direction;
  const item = list[position];
  const other = list[destination];
  if (item === undefined || other === undefined) return list;
  return list.map((candidate, index) => {
    if (index === position) return other;
    return index === destination ? item : candidate;
  });
}

/** 선택지를 위(-1)나 아래(1)로 한 칸 옮긴다. 끝에서 더 옮기면 아무것도 하지 않는다. */
export function moveChoice(
  graph: BranchingCuttoonGraph,
  nodeId: string,
  choiceId: string,
  direction: -1 | 1,
): BranchingEditResult {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  const position = target.choices.findIndex((choice) => choice.id === choiceId);
  if (position < 0) return blocked("choice-not-found");
  return replaceNode(graph, nodeId, (node) => ({ ...node, choices: moved(node.choices, position, direction) }));
}

/** 컷을 새로 만들어 장면 끝에 붙인다. */
export function addCut(
  graph: BranchingCuttoonGraph,
  nodeId: string,
  caption: string,
): BranchingEditResult<{ readonly cutId: string }> {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  if (target.cutIds.length >= BRANCHING_CUTTOON_LIMITS.cutsPerNode) return blocked("cut-limit");
  if (graph.cuts.length >= BRANCHING_CUTTOON_LIMITS.cuts) return blocked("cut-table-limit");
  const cutId = nextFreeId("k", new Set(graph.cuts.map((cut) => cut.id)));
  if (cutId === null) return blocked("id-exhausted");
  const result = replaceNode(graph, nodeId, (node) => ({ ...node, cutIds: [...node.cutIds, cutId] }));
  if (!result.ok) return result;
  return { ok: true, graph: { ...result.graph, cuts: [...result.graph.cuts, { id: cutId, caption }] }, cutId };
}

export function updateCutCaption(graph: BranchingCuttoonGraph, cutId: string, caption: string): BranchingEditResult {
  if (!graph.cuts.some((cut) => cut.id === cutId)) return blocked("cut-not-found");
  return { ok: true, graph: { ...graph, cuts: graph.cuts.map((cut) => (cut.id === cutId ? { ...cut, caption } : cut)) } };
}

/** 장면의 컷 참조를 하나 뺀다(위치로 지정). 컷이 더는 어디에서도 쓰이지 않으면 컷 표에서도 지운다. */
export function removeCutRef(graph: BranchingCuttoonGraph, nodeId: string, position: number): BranchingEditResult {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  if (position < 0 || position >= target.cutIds.length) return blocked("cut-not-found");
  const result = replaceNode(graph, nodeId, (node) => ({ ...node, cutIds: node.cutIds.filter((_id, index) => index !== position) }));
  return result.ok ? { ok: true, graph: pruneUnusedCuts(result.graph) } : result;
}

export function moveCutRef(
  graph: BranchingCuttoonGraph,
  nodeId: string,
  position: number,
  direction: -1 | 1,
): BranchingEditResult {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) return blocked("node-not-found");
  if (position < 0 || position >= target.cutIds.length) return blocked("cut-not-found");
  return replaceNode(graph, nodeId, (node) => ({ ...node, cutIds: moved(node.cutIds, position, direction) }));
}
