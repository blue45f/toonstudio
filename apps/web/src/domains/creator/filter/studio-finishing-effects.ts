/**
 * 원터치 마감 효과 (효과 그래프 퀵 패널용 순수 로직)
 *
 * 효과 그래프(`studio-adjustment-effect-graph`)는 모델·검증·렌더 계획만 있고
 * 사용자가 노드를 직접 조립해야 했다. 이 모듈은 마감 단계에서 자주 쓰는
 * 글로우·그림자·부풀림 3종을 "출력 직전 체인에 끼워 넣기" 한 번으로 적용/해제하고,
 * 적용 전 그래프와 후보 그래프의 렌더 계획·차이를 비교 미리보기용으로 계산한다.
 *
 * 그래프 변경은 전부 기존 mutate/transact 경로를 통하므로 검증(사이클·도달성·
 * 파라미터)을 그대로 통과한 그래프만 반환된다. 입력 그래프는 변형하지 않는다.
 */

import {
  planStudioEffectGraphRender,
  transactStudioEffectGraph,
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
  type StudioEffectGraphHistoryEntry,
  type StudioEffectGraphMutation,
  type StudioEffectGraphRenderPlan,
  type StudioLiveEffectKind,
  type StudioLiveEffectNode,
} from "./studio-adjustment-effect-graph";

export type StudioFinishingEffectId = "glow" | "drop-shadow" | "inflate";

export interface StudioFinishingEffectPreset {
  readonly id: StudioFinishingEffectId;
  /** 패널 표시 이름 (사용자 과제 어휘). */
  readonly label: string;
  readonly tip: string;
  readonly effect: StudioLiveEffectKind;
  /** 그래프 안에서 마감 효과 노드를 식별하는 결정적 노드 id. */
  readonly nodeId: string;
  readonly parameters: StudioLiveEffectNode["parameters"];
  readonly opacity: number;
  readonly blendMode: string;
}

/**
 * 프리셋 파라미터는 레이어 스타일 프리셋(`studio-layer-styles`)의 검증된 수치와
 * 기존 그래프 픽스처의 글로우 radius 관례를 따른다.
 */
export const STUDIO_FINISHING_EFFECT_PRESETS: readonly StudioFinishingEffectPreset[] =
  Object.freeze([
    Object.freeze({
      id: "glow",
      label: "글로우",
      tip: "컷 외곽에 흰 빛을 번지게 해 어떤 배경에서도 또렷하게 띄웁니다.",
      effect: "glow",
      nodeId: "finishing-glow",
      parameters: Object.freeze({ color: "#ffffff", radius: 18, strength: 0.9 }),
      opacity: 0.9,
      blendMode: "screen",
    }),
    Object.freeze({
      id: "drop-shadow",
      label: "그림자",
      tip: "짧고 진한 그림자로 컷이 배경 위에 붙은 듯한 입체감을 줍니다.",
      effect: "drop-shadow",
      nodeId: "finishing-drop-shadow",
      parameters: Object.freeze({
        color: "#000000",
        blur: 8,
        offsetX: 6,
        offsetY: 8,
        opacity: 0.5,
      }),
      opacity: 1,
      blendMode: "normal",
    }),
    Object.freeze({
      id: "inflate",
      label: "부풀림",
      tip: "가운데가 볼록하게 부풀어 말풍선·스티커 컷을 도톰하게 만듭니다.",
      effect: "inflate",
      nodeId: "finishing-inflate",
      parameters: Object.freeze({ amount: 24, radius: 64 }),
      opacity: 1,
      blendMode: "normal",
    }),
  ]);

export function getStudioFinishingEffectPreset(
  id: StudioFinishingEffectId,
): StudioFinishingEffectPreset {
  const preset = STUDIO_FINISHING_EFFECT_PRESETS.find((item) => item.id === id);
  if (!preset) throw new TypeError(`unknown finishing effect: ${id}`);
  return preset;
}

export function findStudioFinishingEffectNode(
  graph: StudioAdjustmentEffectGraph,
  id: StudioFinishingEffectId,
): StudioLiveEffectNode | undefined {
  const preset = getStudioFinishingEffectPreset(id);
  const node = graph.nodes.find((item) => item.id === preset.nodeId);
  return node && node.kind === "live-effect" && node.effect === preset.effect
    ? node
    : undefined;
}

export function isStudioFinishingEffectApplied(
  graph: StudioAdjustmentEffectGraph,
  id: StudioFinishingEffectId,
): boolean {
  const node = findStudioFinishingEffectNode(graph, id);
  return Boolean(node?.enabled);
}

/** 출력 노드로 들어가는 source 간선들 = 마감 효과를 끼워 넣을 체인 끝. */
function outputSourceHeads(graph: StudioAdjustmentEffectGraph): readonly string[] {
  return graph.edges
    .filter((edge) => edge.to === graph.outputNodeId && edge.input === "source")
    .map((edge) => edge.from);
}

function buildFinishingEffectNode(
  preset: StudioFinishingEffectPreset,
): StudioLiveEffectNode {
  // mutate는 mutation마다 그래프 전체를 검증하고, enabled인데 출력에 닿지 않는
  // 노드는 거부한다. 그래서 노드는 꺼진 상태로 먼저 넣고, 배선이 끝난 마지막
  // patch에서 켠다.
  return Object.freeze({
    id: preset.nodeId,
    kind: "live-effect",
    enabled: false,
    opacity: preset.opacity,
    blendMode: preset.blendMode,
    effect: preset.effect,
    parameters: preset.parameters,
    preferredBackend: "auto",
  });
}

/**
 * 마감 효과 1종을 그래프에 적용하는 mutation 목록.
 * - 이미 있으면 노드 파라미터·불투명도·블렌드를 프리셋 값으로 되돌리고 켠다(중복 추가 없음).
 * - 없으면 출력 직전 체인(head → output)을 head → 효과 → output 으로 재배선한다.
 * 출력으로 들어가는 source 간선이 없으면 끼울 자리가 없어 빈 목록이 아니라 오류다.
 */
export function buildStudioFinishingEffectMutations(
  graph: StudioAdjustmentEffectGraph,
  id: StudioFinishingEffectId,
): readonly StudioEffectGraphMutation[] {
  const preset = getStudioFinishingEffectPreset(id);
  const existing = findStudioFinishingEffectNode(graph, id);
  if (existing) {
    return Object.freeze([
      Object.freeze({
        type: "patch-node" as const,
        nodeId: preset.nodeId,
        patch: Object.freeze({
          enabled: true,
          opacity: preset.opacity,
          blendMode: preset.blendMode,
          parameters: preset.parameters,
        }),
      }),
    ]);
  }
  const heads = outputSourceHeads(graph);
  if (heads.length === 0) {
    throw new TypeError("finishing effect requires a source edge into the output node.");
  }
  // 순서가 중요하다: 꺼진 노드 추가 → 새 간선 연결 → 옛 간선 제거 → 노드 켜기.
  // 중간 상태에서도 enabled 노드는 전부 출력에 닿아 있어야 검증이 통과한다.
  const mutations: StudioEffectGraphMutation[] = [
    { type: "add-node", node: buildFinishingEffectNode(preset) },
  ];
  for (const head of heads) {
    mutations.push({
      type: "add-edge",
      edge: Object.freeze({ from: head, to: preset.nodeId, input: "source" as const }),
    });
  }
  mutations.push({
    type: "add-edge",
    edge: Object.freeze({ from: preset.nodeId, to: graph.outputNodeId, input: "source" as const }),
  });
  for (const head of heads) {
    mutations.push({
      type: "remove-edge",
      edge: Object.freeze({ from: head, to: graph.outputNodeId, input: "source" as const }),
    });
  }
  mutations.push({
    type: "patch-node",
    nodeId: preset.nodeId,
    patch: Object.freeze({ enabled: true }),
  });
  return Object.freeze(mutations);
}

/** 마감 효과 적용 — 히스토리 항목(undo/redo 가능)을 돌려준다. */
export function applyStudioFinishingEffect(
  graph: StudioAdjustmentEffectGraph,
  id: StudioFinishingEffectId,
  transactionId: string,
): StudioEffectGraphHistoryEntry {
  return transactStudioEffectGraph(
    graph,
    transactionId,
    buildStudioFinishingEffectMutations(graph, id),
  );
}

/**
 * 마감 효과 해제 mutation 목록. 노드를 빼고 그 앞단(source 입력)을
 * 노드가 이어주던 다음 노드들에 직접 다시 연결한다.
 * 적용돼 있지 않으면 null.
 */
export function buildStudioFinishingEffectRemovalMutations(
  graph: StudioAdjustmentEffectGraph,
  id: StudioFinishingEffectId,
): readonly StudioEffectGraphMutation[] | null {
  const preset = getStudioFinishingEffectPreset(id);
  if (!findStudioFinishingEffectNode(graph, id)) return null;
  const predecessors = graph.edges
    .filter((edge) => edge.to === preset.nodeId && edge.input === "source")
    .map((edge) => edge.from);
  const successors = graph.edges.filter((edge) => edge.from === preset.nodeId);
  // 순서가 중요하다: 우회 간선을 먼저 만들어야 노드를 빼는 순간 앞단이
  // 출력에서 끊겨 검증(enabled 노드 도달성)에 걸리지 않는다.
  const mutations: StudioEffectGraphMutation[] = [];
  for (const from of predecessors) {
    for (const successor of successors) {
      const alreadyLinked = graph.edges.some(
        (edge) => edge.from === from && edge.to === successor.to && edge.input === successor.input,
      );
      if (!alreadyLinked) {
        mutations.push({
          type: "add-edge",
          edge: Object.freeze({ from, to: successor.to, input: successor.input }),
        });
      }
    }
  }
  mutations.push({ type: "remove-node", nodeId: preset.nodeId });
  return Object.freeze(mutations);
}

/** 마감 효과 해제 — 적용돼 있지 않으면 null. */
export function removeStudioFinishingEffect(
  graph: StudioAdjustmentEffectGraph,
  id: StudioFinishingEffectId,
  transactionId: string,
): StudioEffectGraphHistoryEntry | null {
  const mutations = buildStudioFinishingEffectRemovalMutations(graph, id);
  if (!mutations) return null;
  return transactStudioEffectGraph(graph, transactionId, mutations);
}

/** 패널 토글 1회 = 적용 또는 해제. 결과 그래프만 필요할 때 쓴다. */
export function toggleStudioFinishingEffect(
  graph: StudioAdjustmentEffectGraph,
  id: StudioFinishingEffectId,
  transactionId: string,
): StudioAdjustmentEffectGraph {
  if (isStudioFinishingEffectApplied(graph, id)) {
    const entry = removeStudioFinishingEffect(graph, id, transactionId);
    return entry ? entry.after : graph;
  }
  return applyStudioFinishingEffect(graph, id, transactionId).after;
}

export type StudioFinishingEffectChangeKind = "added" | "removed" | "updated" | "unchanged";

export interface StudioFinishingEffectChange {
  readonly id: StudioFinishingEffectId;
  readonly label: string;
  readonly change: StudioFinishingEffectChangeKind;
}

function sameParameters(
  left: StudioLiveEffectNode["parameters"],
  right: StudioLiveEffectNode["parameters"],
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

/** 전/후 그래프에서 마감 효과 3종의 상태 차이를 패널 표시용으로 계산한다. */
export function describeStudioFinishingEffectChanges(
  before: StudioAdjustmentEffectGraph,
  after: StudioAdjustmentEffectGraph,
): readonly StudioFinishingEffectChange[] {
  return Object.freeze(
    STUDIO_FINISHING_EFFECT_PRESETS.map((preset) => {
      const beforeNode = findStudioFinishingEffectNode(before, preset.id);
      const afterNode = findStudioFinishingEffectNode(after, preset.id);
      let change: StudioFinishingEffectChangeKind = "unchanged";
      if (!beforeNode && afterNode) change = "added";
      else if (beforeNode && !afterNode) change = "removed";
      else if (
        beforeNode &&
        afterNode &&
        (beforeNode.enabled !== afterNode.enabled ||
          beforeNode.opacity !== afterNode.opacity ||
          beforeNode.blendMode !== afterNode.blendMode ||
          !sameParameters(beforeNode.parameters, afterNode.parameters))
      ) {
        change = "updated";
      }
      return Object.freeze({ id: preset.id, label: preset.label, change });
    }),
  );
}

export interface StudioFinishingComparePreview {
  readonly beforePlan: StudioEffectGraphRenderPlan;
  readonly afterPlan: StudioEffectGraphRenderPlan;
  readonly changes: readonly StudioFinishingEffectChange[];
  /** 후보 그래프에만 있는 렌더 단계 nodeId (비교 미리보기에서 강조 표시용). */
  readonly addedStepNodeIds: readonly string[];
  readonly removedStepNodeIds: readonly string[];
}

/**
 * 전후 비교 미리보기 데이터: 두 그래프의 preview 렌더 계획과 효과 차이.
 * 실제 픽셀 렌더는 호스트 렌더러 몫이고, 이 계획(cacheKey 포함)이
 * 어느 단계가 새로 생기고 사라지는지를 결정적으로 알려준다.
 */
export function buildStudioFinishingComparePreview(input: {
  readonly before: StudioAdjustmentEffectGraph;
  readonly after: StudioAdjustmentEffectGraph;
  readonly webGpuAvailable: boolean;
  readonly sourceColorSpace: string;
}): StudioFinishingComparePreview {
  validateStudioAdjustmentEffectGraph(input.before);
  validateStudioAdjustmentEffectGraph(input.after);
  const beforePlan = planStudioEffectGraphRender({
    graph: input.before,
    purpose: "preview",
    webGpuAvailable: input.webGpuAvailable,
    sourceColorSpace: input.sourceColorSpace,
  });
  const afterPlan = planStudioEffectGraphRender({
    graph: input.after,
    purpose: "preview",
    webGpuAvailable: input.webGpuAvailable,
    sourceColorSpace: input.sourceColorSpace,
  });
  const beforeIds = new Set(beforePlan.steps.map((step) => step.nodeId));
  const afterIds = new Set(afterPlan.steps.map((step) => step.nodeId));
  return Object.freeze({
    beforePlan,
    afterPlan,
    changes: describeStudioFinishingEffectChanges(input.before, input.after),
    addedStepNodeIds: Object.freeze(
      afterPlan.steps.map((step) => step.nodeId).filter((nodeId) => !beforeIds.has(nodeId)),
    ),
    removedStepNodeIds: Object.freeze(
      beforePlan.steps.map((step) => step.nodeId).filter((nodeId) => !afterIds.has(nodeId)),
    ),
  });
}
