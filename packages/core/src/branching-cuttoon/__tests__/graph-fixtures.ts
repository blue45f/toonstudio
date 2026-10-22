/**
 * 분기형 컷툰 시험 도구 — 그래프를 짧게 적는 도우미와 기준 그래프. 운영 코드가 가져오지 않는다.
 */
import type {
  BranchingChoice,
  BranchingCuttoonGraph,
  BranchingCut,
  BranchingNode,
  BranchingNodeKind,
} from "../branching-cuttoon-types";

export const cut = (id: string, caption = `컷 ${id}`): BranchingCut => ({ id, caption });

export const choice = (id: string, label: string, targetNodeId: string): BranchingChoice => ({ id, label, targetNodeId });

export const node = (
  id: string,
  kind: BranchingNodeKind,
  choices: readonly BranchingChoice[] = [],
  cutIds: readonly string[] = [],
  title = `장면 ${id}`,
): BranchingNode => ({ id, kind, title, cutIds, choices });

export function graphOf(
  nodes: readonly BranchingNode[],
  options: { readonly cuts?: readonly BranchingCut[]; readonly start?: string; readonly title?: string } = {},
): BranchingCuttoonGraph {
  return {
    title: options.title ?? "시험 이야기",
    startNodeId: options.start ?? nodes[0]?.id ?? "",
    cuts: options.cuts ?? [],
    nodes,
  };
}

/**
 * 흠 없는 기준 그래프.
 * start ─왼쪽→ a ─끝→ endA
 *       └오른쪽→ b ─끝→ endB
 */
export function validGraph(): BranchingCuttoonGraph {
  return graphOf(
    [
      node("start", "start", [choice("c1", "왼쪽", "a"), choice("c2", "오른쪽", "b")], ["k1", "k2"], "시작"),
      node("a", "scene", [choice("c1", "끝으로", "endA")], ["k3"]),
      node("b", "scene", [choice("c1", "끝으로", "endB")], ["k4"]),
      node("endA", "ending", [], ["k5"], "결말 A"),
      node("endB", "ending", [], [], "결말 B"),
    ],
    { cuts: [cut("k1"), cut("k2"), cut("k3"), cut("k4"), cut("k5")], title: "기준 이야기" },
  );
}

/**
 * 되돌아가는 길이 있는 그래프: start → a → start(되돌아감), a → end.
 */
export function loopGraph(): BranchingCuttoonGraph {
  return graphOf([
    node("start", "start", [choice("c1", "들어간다", "a")]),
    node("a", "scene", [choice("c1", "돌아온다", "start"), choice("c2", "나간다", "end")]),
    node("end", "ending"),
  ]);
}

/** 모든 객체와 배열을 얼려, 함수가 입력을 바꾸면 던지게 한다(strict 모드의 모듈). */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** 층마다 두 갈래로 갈라졌다가 다시 만나는 마름모를 `layers` 번 이은 그래프. 결말까지 가는 길은 2^layers 개다. */
export function diamondChain(layers: number): BranchingCuttoonGraph {
  const nodes: BranchingNode[] = [];
  for (let layer = 0; layer < layers; layer += 1) {
    const join = layer + 1 < layers ? `j${layer + 1}` : "end";
    nodes.push(
      node(layer === 0 ? "j0" : `j${layer}`, layer === 0 ? "start" : "scene", [
        choice("l", "왼쪽", `l${layer}`),
        choice("r", "오른쪽", `r${layer}`),
      ]),
      node(`l${layer}`, "scene", [choice("go", "계속", join)]),
      node(`r${layer}`, "scene", [choice("go", "계속", join)]),
    );
  }
  nodes.push(node("end", "ending"));
  return graphOf(nodes, { start: "j0" });
}
