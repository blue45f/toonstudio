/**
 * 분기형 컷툰 그래프 분석 — 도달 가능성, 결말 도달 가능성, 되돌아가는 길, 길 열거.
 *
 * 모든 함수는 장면 수 V 와 선택지 수 E 에 대해 O(V+E) 이거나(길 열거만 `maxSteps` 로 상한을 둔다) 입력을 바꾸지 않는다.
 * 같은 식별자를 쓰는 장면이 여럿이면 처음 장면이 그 식별자의 주인이다(중복 자체는 검증기가 오류로 알린다).
 * 결말 장면은 길의 끝이다. 결말에 선택지가 있어도 독자에게 보이지 않으므로 간선으로 세지 않는다.
 */
import type { BranchingCuttoonGraph } from "./branching-cuttoon-types";

export interface BranchingEdge {
  /** 선택지를 가진 장면의 목록 위치. */
  readonly from: number;
  /** 그 장면의 선택지 목록에서의 위치. */
  readonly choiceIndex: number;
  /** 도착 장면의 목록 위치. */
  readonly to: number;
}

export interface BranchingGraphIndex {
  readonly graph: BranchingCuttoonGraph;
  readonly nodeIndexById: ReadonlyMap<string, number>;
  /** 시작 장면의 목록 위치. 시작 장면 식별자가 어느 장면도 가리키지 않으면 null. */
  readonly startIndex: number | null;
  /** 장면별로 나가는 간선: 도착 장면이 있는 선택지만, 선언 순서대로. 결말 장면은 비어 있다. */
  readonly outEdges: readonly (readonly BranchingEdge[])[];
}

export function indexBranchingGraph(graph: BranchingCuttoonGraph): BranchingGraphIndex {
  const nodeIndexById = new Map<string, number>();
  graph.nodes.forEach((node, position) => {
    if (!nodeIndexById.has(node.id)) nodeIndexById.set(node.id, position);
  });
  const outEdges = graph.nodes.map((node, from) => {
    if (node.kind === "ending") return [];
    const edges: BranchingEdge[] = [];
    node.choices.forEach((choice, choiceIndex) => {
      const to = nodeIndexById.get(choice.targetNodeId);
      if (to !== undefined) edges.push({ from, choiceIndex, to });
    });
    return edges;
  });
  const startIndex = nodeIndexById.get(graph.startNodeId) ?? null;
  return { graph, nodeIndexById, startIndex, outEdges };
}

/** 시작 장면에서 각 장면까지의 최소 선택 횟수. 닿을 수 없는 장면은 -1. 너비 우선 탐색이라 선언 순서에만 의존한다. */
export function distancesFromStart(index: BranchingGraphIndex): readonly number[] {
  const distance = index.graph.nodes.map(() => -1);
  if (index.startIndex === null) return distance;
  distance[index.startIndex] = 0;
  const queue: number[] = [index.startIndex];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head] ?? 0;
    for (const edge of index.outEdges[current] ?? []) {
      if (distance[edge.to] !== -1) continue;
      distance[edge.to] = (distance[current] ?? 0) + 1;
      queue.push(edge.to);
    }
  }
  return distance;
}

/** 각 장면에서 선택지를 따라 어떤 결말에든 닿을 수 있는지. 결말 장면은 스스로 true 다. */
export function nodesThatReachEnding(index: BranchingGraphIndex): readonly boolean[] {
  const nodes = index.graph.nodes;
  const reverse: number[][] = nodes.map(() => []);
  for (const edges of index.outEdges) {
    for (const edge of edges) reverse[edge.to]?.push(edge.from);
  }
  const reaches = nodes.map((node) => node.kind === "ending");
  const queue: number[] = [];
  reaches.forEach((isEnding, position) => {
    if (isEnding) queue.push(position);
  });
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head] ?? 0;
    for (const previous of reverse[current] ?? []) {
      if (reaches[previous]) continue;
      reaches[previous] = true;
      queue.push(previous);
    }
  }
  return reaches;
}

/**
 * 시작 장면에서 출발한 깊이 우선 탐색이 "지금 지나는 길 위의 장면"으로 되돌아오는 간선(되돌아가는 길).
 * 선언 순서대로 탐색하므로 같은 그래프는 언제나 같은 간선을 낸다. 같은 순환이라도 어느 선택지가 되돌아가는 길로 잡히는지는 탐색 순서에 달려 있다.
 */
export function findBackEdges(index: BranchingGraphIndex): readonly BranchingEdge[] {
  const found: BranchingEdge[] = [];
  if (index.startIndex === null) return found;
  // 0: 아직 안 감, 1: 지금 지나는 길 위, 2: 끝까지 살펴봄
  const state = index.graph.nodes.map(() => 0);
  const stack: { readonly node: number; next: number }[] = [{ node: index.startIndex, next: 0 }];
  state[index.startIndex] = 1;
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (!frame) break;
    const edge = index.outEdges[frame.node]?.[frame.next];
    if (!edge) {
      state[frame.node] = 2;
      stack.pop();
      continue;
    }
    frame.next += 1;
    const targetState = state[edge.to] ?? 0;
    if (targetState === 1) {
      found.push(edge);
    } else if (targetState === 0) {
      state[edge.to] = 1;
      stack.push({ node: edge.to, next: 0 });
    }
  }
  return found;
}

export interface BranchingPathLimits {
  /** 모을 길의 최대 개수. */
  readonly maxPaths: number;
  /** 한 길이 지날 수 있는 장면 수의 상한. */
  readonly maxDepth: number;
  /** 살펴볼 간선 수의 상한. 길이 폭발적으로 늘어나는 그래프에서도 작업량을 고정한다. */
  readonly maxSteps: number;
}

export const BRANCHING_PATH_LIMITS: BranchingPathLimits = Object.freeze({
  maxPaths: 200,
  maxDepth: 64,
  maxSteps: 20_000,
});

export interface BranchingPathEnumeration {
  /** 시작 장면에서 결말 장면까지의 장면 식별자 순서. 같은 장면을 두 번 지나지 않는다. */
  readonly paths: readonly (readonly string[])[];
  /** 상한에 걸려 멈추지 않고 모든 길을 셌는지. */
  readonly complete: boolean;
  readonly stoppedBy: "paths" | "steps" | "depth" | null;
}

/**
 * 시작 장면에서 결말까지 가는 길(같은 장면을 두 번 지나지 않는 길)을 선언 순서대로 열거한다.
 * 상한이 셋(길 수·깊이·간선 수)이라 어떤 그래프에서도 `maxSteps` 안에서 끝난다.
 * 상한 때문에 멈추면 `complete` 가 false 이고 `paths` 는 그때까지 모은 앞부분이다.
 */
export function enumerateEndingPaths(
  index: BranchingGraphIndex,
  limits: BranchingPathLimits = BRANCHING_PATH_LIMITS,
): BranchingPathEnumeration {
  const nodes = index.graph.nodes;
  const paths: string[][] = [];
  if (index.startIndex === null) return { paths, complete: true, stoppedBy: null };

  const onPath = nodes.map(() => false);
  const trail: number[] = [index.startIndex];
  const frames: { readonly node: number; next: number }[] = [{ node: index.startIndex, next: 0 }];
  onPath[index.startIndex] = true;
  let steps = 0;
  let depthCut = false;
  let stoppedBy: "paths" | "steps" | null = null;

  const startNode = nodes[index.startIndex];
  if (startNode?.kind === "ending") {
    paths.push([startNode.id]);
    return { paths, complete: true, stoppedBy: null };
  }

  while (frames.length > 0 && stoppedBy === null) {
    const frame = frames[frames.length - 1];
    if (!frame) break;
    const edge = index.outEdges[frame.node]?.[frame.next];
    if (!edge) {
      onPath[frame.node] = false;
      frames.pop();
      trail.pop();
      continue;
    }
    frame.next += 1;
    if (steps >= limits.maxSteps) {
      stoppedBy = "steps";
      break;
    }
    steps += 1;
    if (onPath[edge.to]) continue;
    if (trail.length >= limits.maxDepth) {
      depthCut = true;
      continue;
    }
    const target = nodes[edge.to];
    if (!target) continue;
    if (target.kind === "ending") {
      paths.push([...trail, edge.to].map((position) => nodes[position]?.id ?? ""));
      // 상한보다 하나 더 모아 보고 나서 버린다: 정확히 상한만큼만 있는 그래프는 "완전"으로 남는다.
      if (paths.length > limits.maxPaths) {
        paths.pop();
        stoppedBy = "paths";
      }
      continue;
    }
    onPath[edge.to] = true;
    trail.push(edge.to);
    frames.push({ node: edge.to, next: 0 });
  }

  if (stoppedBy !== null) return { paths, complete: false, stoppedBy };
  if (depthCut) return { paths, complete: false, stoppedBy: "depth" };
  return { paths, complete: true, stoppedBy: null };
}
