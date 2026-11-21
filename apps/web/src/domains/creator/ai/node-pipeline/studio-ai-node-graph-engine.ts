/**
 * 비파괴 멀티모달 AI DAG 노드 그래프 엔진, 서브그래프 캡슐화 및 원클릭 앱 모드 프로젝션.
 *
 * ComfyUI Subgraphs/App Mode, Weavy 하이브리드 결정적+생성 노드, FLORA 배치 노드의
 * 핵심 계약을 로컬 우선 순수 TypeScript 엔진으로 구현한다.
 * 기존 원고 레이어를 덮어쓰지 않고 새 초안 레이어로만 출력하며,
 * Rights BOM 게이트가 상업적 권리 위반 에셋 혼입을 자동 차단한다.
 */

export type AiNodeKind =
  | "canvas-layer-in" | "bg3d-pass-in" | "deterministic-filter" | "ai-generate"
  | "batch-fanout" | "subgraph" | "rights-gate" | "layer-out";

export type AiPortDataType =
  | "image" | "mask" | "depth" | "pose" | "palette"
  | "prompt" | "number" | "boolean" | "rights-receipt" | "wildcard";

export type AiProvenanceLicenseStatus =
  | "creator-owned" | "licensed-commercial" | "non-commercial"
  | "training-opt-out" | "unverified";

export type AiNodeParamValue = string | number | boolean | readonly string[];

export interface AiNodePortSpec {
  readonly id: string;
  readonly label: string;
  readonly dataType: AiPortDataType;
  readonly required?: boolean;
}

export interface AiNodeParamControlMeta {
  readonly key: string;
  readonly label: string;
  readonly controlType: "slider" | "toggle" | "text" | "select" | "seed-lock";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[];
  readonly exposedInAppMode?: boolean;
  readonly priority?: number;
}

export interface AiGraphNode {
  readonly id: string;
  readonly kind: AiNodeKind;
  readonly label: string;
  readonly inputs: readonly AiNodePortSpec[];
  readonly outputs: readonly AiNodePortSpec[];
  readonly params: Readonly<Record<string, AiNodeParamValue>>;
  readonly controlMeta?: readonly AiNodeParamControlMeta[];
  readonly provenance?: AiProvenanceLicenseStatus;
  readonly subgraphDefId?: string;
  readonly estimatedCredits?: number;
  readonly estimatedMs?: number;
}

export interface AiGraphEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly fromPortId: string;
  readonly toNodeId: string;
  readonly toPortId: string;
}

export interface SubgraphPortMapping {
  readonly externalPortId: string;
  readonly internalNodeId: string;
  readonly internalPortId: string;
  readonly dataType: AiPortDataType;
  readonly label: string;
}

export interface AiSubgraphDefinition {
  readonly id: string;
  readonly name: string;
  readonly innerNodes: readonly AiGraphNode[];
  readonly innerEdges: readonly AiGraphEdge[];
  readonly inputMappings: readonly SubgraphPortMapping[];
  readonly outputMappings: readonly SubgraphPortMapping[];
}

export interface AiNodeGraphDocument {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: 1;
  readonly deterministicSeed: number;
  readonly seedLocked: boolean;
  readonly commercialExportMode: boolean;
  readonly nodes: readonly AiGraphNode[];
  readonly edges: readonly AiGraphEdge[];
  readonly subgraphs: Readonly<Record<string, AiSubgraphDefinition>>;
}

export interface AiGraphValidationReport {
  readonly ok: boolean;
  readonly topologicalOrder: readonly string[];
  readonly cycleNodeIds: readonly string[];
  readonly missingRequiredInputs: readonly { readonly nodeId: string; readonly portId: string }[];
  readonly danglingEdges: readonly string[];
  readonly incompatibleEdges: readonly string[];
}

export interface AiNodeExecutionPlanEntry {
  readonly nodeId: string;
  readonly kind: AiNodeKind;
  readonly contentHash: string;
  readonly cacheState: "hit" | "dirty";
  readonly batchMultiplier: number;
}

export interface AiRightsGateReport {
  readonly passed: boolean;
  readonly commercialExportMode: boolean;
  readonly blockedNodes: readonly {
    readonly nodeId: string;
    readonly label: string;
    readonly provenance: AiProvenanceLicenseStatus;
    readonly reasonKo: string;
  }[];
}

export interface AppModeControlItem {
  readonly controlId: string;
  readonly nodeId: string;
  readonly paramKey: string;
  readonly label: string;
  readonly controlType: AiNodeParamControlMeta["controlType"];
  readonly value: AiNodeParamValue;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[];
}

export interface AppModeProjection {
  readonly graphId: string;
  readonly title: string;
  readonly primaryControls: readonly AppModeControlItem[];
  readonly advancedControls: readonly AppModeControlItem[];
  readonly primaryBudgetLimit: 9;
  readonly seedLocked: boolean;
  readonly deterministicSeed: number;
  readonly totalEstimatedCredits: number;
  readonly totalEstimatedMs: number;
  readonly rightsReady: boolean;
  readonly canRun: boolean;
  readonly blockingReasonKo: string | null;
}

export interface DraftLayerOutputDescriptor {
  readonly outputNodeId: string;
  readonly targetLayerName: string;
  readonly insertMode: "new-draft-layer";
  readonly overwritesOriginal: false;
  readonly contentHash: string;
  readonly batchCount: number;
}

export interface AiGraphDryRunResult {
  readonly ok: boolean;
  readonly validation: AiGraphValidationReport;
  readonly rightsGate: AiRightsGateReport;
  readonly plan: readonly AiNodeExecutionPlanEntry[];
  readonly cacheHits: number;
  readonly executedCount: number;
  readonly draftOutputs: readonly DraftLayerOutputDescriptor[];
  readonly nextCacheHashes: Readonly<Record<string, string>>;
}

export type GraphMutationResult =
  | { readonly ok: true; readonly graph: AiNodeGraphDocument }
  | { readonly ok: false; readonly reasonKo: string };

export const APP_MODE_PRIMARY_BUDGET_LIMIT = 9 as const;

export function deterministicDigest(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + ((h1 >>> 13) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function arePortTypesCompatible(fromType: AiPortDataType, toType: AiPortDataType): boolean {
  if (fromType === "wildcard" || toType === "wildcard" || fromType === toType) return true;
  return (fromType === "depth" || fromType === "pose") && toType === "image";
}

export function createAiNodeGraph(input: {
  readonly id: string;
  readonly name: string;
  readonly deterministicSeed?: number;
  readonly seedLocked?: boolean;
  readonly commercialExportMode?: boolean;
}): AiNodeGraphDocument {
  const seed = Math.trunc(input.deterministicSeed ?? 42019);
  return Object.freeze({
    id: input.id.trim() || "ai-graph-default",
    name: input.name.trim() || "멀티모달 AI 파이프라인",
    schemaVersion: 1 as const,
    deterministicSeed: Number.isFinite(seed) ? seed : 42019,
    seedLocked: input.seedLocked ?? true,
    commercialExportMode: input.commercialExportMode ?? true,
    nodes: Object.freeze([]),
    edges: Object.freeze([]),
    subgraphs: Object.freeze({}),
  });
}

export function addGraphNode(graph: AiNodeGraphDocument, node: AiGraphNode): AiNodeGraphDocument {
  if (graph.nodes.some((existing) => existing.id === node.id)) {
    throw new Error(`이미 같은 노드 식별자가 존재합니다: ${node.id}`);
  }
  return Object.freeze({ ...graph, nodes: Object.freeze([...graph.nodes, node]) });
}

export function removeGraphNode(graph: AiNodeGraphDocument, nodeId: string): AiNodeGraphDocument {
  return Object.freeze({
    ...graph,
    nodes: Object.freeze(graph.nodes.filter((n) => n.id !== nodeId)),
    edges: Object.freeze(graph.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)),
  });
}

export function updateNodeParam(
  graph: AiNodeGraphDocument,
  nodeId: string,
  paramKey: string,
  value: AiNodeParamValue,
): AiNodeGraphDocument {
  let updated = false;
  const nextNodes = graph.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    updated = true;
    return Object.freeze({ ...node, params: Object.freeze({ ...node.params, [paramKey]: value }) });
  });
  if (!updated) throw new Error(`파라미터를 갱신할 노드를 찾지 못했습니다: ${nodeId}`);
  return Object.freeze({ ...graph, nodes: Object.freeze(nextNodes) });
}

export function connectGraphEdge(graph: AiNodeGraphDocument, edge: AiGraphEdge): GraphMutationResult {
  if (edge.fromNodeId === edge.toNodeId) {
    return { ok: false, reasonKo: "자기 자신으로 되돌아가는 순환 연결은 허용하지 않습니다." };
  }
  const fromNode = graph.nodes.find((n) => n.id === edge.fromNodeId);
  const toNode = graph.nodes.find((n) => n.id === edge.toNodeId);
  if (!fromNode || !toNode) {
    return { ok: false, reasonKo: "연결 대상 노드가 그래프에 존재하지 않습니다." };
  }
  const fromPort = fromNode.outputs.find((p) => p.id === edge.fromPortId);
  const toPort = toNode.inputs.find((p) => p.id === edge.toPortId);
  if (!fromPort || !toPort) {
    return { ok: false, reasonKo: "지정한 입출력 포트를 찾을 수 없습니다." };
  }
  if (!arePortTypesCompatible(fromPort.dataType, toPort.dataType)) {
    return { ok: false, reasonKo: `포트 형식이 맞지 않습니다: ${fromPort.dataType} -> ${toPort.dataType}` };
  }
  const duplicate = graph.edges.some(
    (e) => e.id === edge.id || (e.toNodeId === edge.toNodeId && e.toPortId === edge.toPortId),
  );
  if (duplicate) {
    return { ok: false, reasonKo: "대상 입력 포트에 이미 다른 연결이 있습니다." };
  }
  const candidate: AiNodeGraphDocument = Object.freeze({
    ...graph,
    edges: Object.freeze([...graph.edges, edge]),
  });
  const check = validateAndSortAiNodeGraph(candidate);
  if (check.cycleNodeIds.length > 0) {
    return { ok: false, reasonKo: `순환 참조가 발생해 연결을 차단했습니다: ${check.cycleNodeIds.join(", ")}` };
  }
  return { ok: true, graph: candidate };
}

/** Kahn 위상 정렬로 실행 순서를 확정하고 사이클·누락 입력·형식 불일치를 진단한다. */
export function validateAndSortAiNodeGraph(graph: AiNodeGraphDocument): AiGraphValidationReport {
  const nodeMap = new Map<string, AiGraphNode>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  const danglingEdges: string[] = [];
  const incompatibleEdges: string[] = [];
  const connectedInputs = new Set<string>();

  for (const edge of graph.edges) {
    const fromNode = nodeMap.get(edge.fromNodeId);
    const toNode = nodeMap.get(edge.toNodeId);
    const fromPort = fromNode?.outputs.find((p) => p.id === edge.fromPortId);
    const toPort = toNode?.inputs.find((p) => p.id === edge.toPortId);
    if (!fromNode || !toNode || !fromPort || !toPort) {
      danglingEdges.push(edge.id);
      continue;
    }
    if (!arePortTypesCompatible(fromPort.dataType, toPort.dataType)) {
      incompatibleEdges.push(edge.id);
    }
    connectedInputs.add(`${edge.toNodeId}::${edge.toPortId}`);
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const missingRequiredInputs: { readonly nodeId: string; readonly portId: string }[] = [];
  for (const node of graph.nodes) {
    for (const inputPort of node.inputs) {
      if (inputPort.required && !connectedInputs.has(`${node.id}::${inputPort.id}`)) {
        missingRequiredInputs.push({ nodeId: node.id, portId: inputPort.id });
      }
    }
  }

  const readyQueue = Array.from(inDegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id)
    .sort();
  const topologicalOrder: string[] = [];
  while (readyQueue.length > 0) {
    const current = readyQueue.shift()!;
    topologicalOrder.push(current);
    for (const next of [...(adjacency.get(current) ?? [])].sort()) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        readyQueue.push(next);
        readyQueue.sort();
      }
    }
  }

  const orderedSet = new Set(topologicalOrder);
  const cycleNodeIds = graph.nodes.filter((n) => !orderedSet.has(n.id)).map((n) => n.id).sort();
  return Object.freeze({
    ok:
      cycleNodeIds.length === 0 &&
      missingRequiredInputs.length === 0 &&
      danglingEdges.length === 0 &&
      incompatibleEdges.length === 0,
    topologicalOrder: Object.freeze(topologicalOrder),
    cycleNodeIds: Object.freeze(cycleNodeIds),
    missingRequiredInputs: Object.freeze(missingRequiredInputs),
    danglingEdges: Object.freeze(danglingEdges),
    incompatibleEdges: Object.freeze(incompatibleEdges),
  });
}

/** 선택한 노드 집합을 단일 서브그래프 노드로 캡슐화한다(비볼록 사이클 유발 선택 차단). */
export function encapsulateSubgraph(
  graph: AiNodeGraphDocument,
  selectedNodeIds: readonly string[],
  meta: { readonly subgraphId: string; readonly nodeId: string; readonly name: string },
): GraphMutationResult {
  const selectedSet = new Set(selectedNodeIds);
  if (selectedSet.size === 0) {
    return { ok: false, reasonKo: "서브그래프로 묶을 노드를 1개 이상 선택하세요." };
  }
  const innerNodes = graph.nodes.filter((n) => selectedSet.has(n.id));
  if (innerNodes.length !== selectedSet.size) {
    return { ok: false, reasonKo: "선택한 노드 중 그래프에 없는 항목이 있습니다." };
  }

  const innerEdges: AiGraphEdge[] = [];
  const incomingEdges: AiGraphEdge[] = [];
  const outgoingEdges: AiGraphEdge[] = [];
  const externalEdges: AiGraphEdge[] = [];
  for (const edge of graph.edges) {
    const fromIn = selectedSet.has(edge.fromNodeId);
    const toIn = selectedSet.has(edge.toNodeId);
    if (fromIn && toIn) innerEdges.push(edge);
    else if (!fromIn && toIn) incomingEdges.push(edge);
    else if (fromIn && !toIn) outgoingEdges.push(edge);
    else externalEdges.push(edge);
  }

  const inputMappings: SubgraphPortMapping[] = [];
  const subgraphInputs: AiNodePortSpec[] = [];
  const rewiredIncoming: AiGraphEdge[] = [];
  incomingEdges.forEach((edge, idx) => {
    const targetPort = innerNodes
      .find((n) => n.id === edge.toNodeId)
      ?.inputs.find((p) => p.id === edge.toPortId);
    const extPortId = `in_${idx}_${edge.toPortId}`;
    const dataType = targetPort?.dataType ?? "wildcard";
    const label = targetPort?.label ?? extPortId;
    inputMappings.push({ externalPortId: extPortId, internalNodeId: edge.toNodeId, internalPortId: edge.toPortId, dataType, label });
    subgraphInputs.push({ id: extPortId, label, dataType, required: targetPort?.required });
    rewiredIncoming.push({ id: `${edge.id}__sg_in`, fromNodeId: edge.fromNodeId, fromPortId: edge.fromPortId, toNodeId: meta.nodeId, toPortId: extPortId });
  });

  const outputMappings: SubgraphPortMapping[] = [];
  const subgraphOutputs: AiNodePortSpec[] = [];
  const rewiredOutgoing: AiGraphEdge[] = [];
  const outputMapBySource = new Map<string, string>();
  outgoingEdges.forEach((edge, idx) => {
    const sourceKey = `${edge.fromNodeId}::${edge.fromPortId}`;
    let extPortId = outputMapBySource.get(sourceKey);
    if (!extPortId) {
      const srcPort = innerNodes
        .find((n) => n.id === edge.fromNodeId)
        ?.outputs.find((p) => p.id === edge.fromPortId);
      extPortId = `out_${idx}_${edge.fromPortId}`;
      const dataType = srcPort?.dataType ?? "wildcard";
      const label = srcPort?.label ?? extPortId;
      outputMapBySource.set(sourceKey, extPortId);
      outputMappings.push({ externalPortId: extPortId, internalNodeId: edge.fromNodeId, internalPortId: edge.fromPortId, dataType, label });
      subgraphOutputs.push({ id: extPortId, label, dataType });
    }
    rewiredOutgoing.push({ id: `${edge.id}__sg_out`, fromNodeId: meta.nodeId, fromPortId: extPortId, toNodeId: edge.toNodeId, toPortId: edge.toPortId });
  });

  const mergedParams: Record<string, AiNodeParamValue> = {};
  const mergedControls: AiNodeParamControlMeta[] = [];
  let sumCredits = 0;
  let sumMs = 0;
  for (const inner of innerNodes) {
    sumCredits += inner.estimatedCredits ?? 0;
    sumMs += inner.estimatedMs ?? 0;
    for (const ctrl of inner.controlMeta ?? []) {
      if (!ctrl.exposedInAppMode) continue;
      const val = inner.params[ctrl.key];
      if (val !== undefined) {
        const scopedKey = `${inner.id}.${ctrl.key}`;
        mergedParams[scopedKey] = val;
        mergedControls.push({ ...ctrl, key: scopedKey });
      }
    }
  }

  const subgraphDef: AiSubgraphDefinition = Object.freeze({
    id: meta.subgraphId, name: meta.name,
    innerNodes: Object.freeze(innerNodes), innerEdges: Object.freeze(innerEdges),
    inputMappings: Object.freeze(inputMappings), outputMappings: Object.freeze(outputMappings),
  });
  const subgraphNode: AiGraphNode = Object.freeze({
    id: meta.nodeId, kind: "subgraph", label: meta.name,
    inputs: Object.freeze(subgraphInputs), outputs: Object.freeze(subgraphOutputs),
    params: Object.freeze(mergedParams), controlMeta: Object.freeze(mergedControls),
    subgraphDefId: meta.subgraphId, estimatedCredits: sumCredits, estimatedMs: sumMs,
  });
  const candidate: AiNodeGraphDocument = Object.freeze({
    ...graph,
    nodes: Object.freeze([...graph.nodes.filter((n) => !selectedSet.has(n.id)), subgraphNode]),
    edges: Object.freeze([...externalEdges, ...rewiredIncoming, ...rewiredOutgoing]),
    subgraphs: Object.freeze({ ...graph.subgraphs, [meta.subgraphId]: subgraphDef }),
  });
  return validateAndSortAiNodeGraph(candidate).cycleNodeIds.length > 0
    ? { ok: false, reasonKo: "선택한 노드가 외부 경로를 거쳐 순환하므로 서브그래프로 묶을 수 없습니다." }
    : { ok: true, graph: candidate };
}

export function expandSubgraph(graph: AiNodeGraphDocument, subgraphNodeId: string): GraphMutationResult {
  const sgNode = graph.nodes.find((n) => n.id === subgraphNodeId && n.kind === "subgraph");
  const def = sgNode?.subgraphDefId ? graph.subgraphs[sgNode.subgraphDefId] : undefined;
  if (!sgNode || !def) {
    return { ok: false, reasonKo: "펼칠 서브그래프 노드 또는 정의를 찾지 못했습니다." };
  }

  const idMap = new Map<string, string>();
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  const expandedNodes: AiGraphNode[] = def.innerNodes.map((inner) => {
    const nextId = existingIds.has(inner.id) ? `${subgraphNodeId}__${inner.id}` : inner.id;
    idMap.set(inner.id, nextId);
    const updatedParams: Record<string, AiNodeParamValue> = { ...inner.params };
    const prefix = `${inner.id}.`;
    for (const [scopedKey, val] of Object.entries(sgNode.params)) {
      if (scopedKey.startsWith(prefix)) updatedParams[scopedKey.slice(prefix.length)] = val;
    }
    return Object.freeze({ ...inner, id: nextId, params: Object.freeze(updatedParams) });
  });

  const expandedInnerEdges: AiGraphEdge[] = def.innerEdges.map((edge) => ({
    ...edge,
    id: `${subgraphNodeId}__${edge.id}`,
    fromNodeId: idMap.get(edge.fromNodeId) ?? edge.fromNodeId,
    toNodeId: idMap.get(edge.toNodeId) ?? edge.toNodeId,
  }));
  const inByPort = new Map(def.inputMappings.map((m) => [m.externalPortId, m]));
  const outByPort = new Map(def.outputMappings.map((m) => [m.externalPortId, m]));
  const nextEdges: AiGraphEdge[] = [];

  for (const edge of graph.edges) {
    if (edge.toNodeId === subgraphNodeId) {
      const m = inByPort.get(edge.toPortId);
      if (m) nextEdges.push({ ...edge, toNodeId: idMap.get(m.internalNodeId) ?? m.internalNodeId, toPortId: m.internalPortId });
    } else if (edge.fromNodeId === subgraphNodeId) {
      const m = outByPort.get(edge.fromPortId);
      if (m) nextEdges.push({ ...edge, fromNodeId: idMap.get(m.internalNodeId) ?? m.internalNodeId, fromPortId: m.internalPortId });
    } else {
      nextEdges.push(edge);
    }
  }

  return {
    ok: true,
    graph: Object.freeze({
      ...graph,
      nodes: Object.freeze([...graph.nodes.filter((n) => n.id !== subgraphNodeId), ...expandedNodes]),
      edges: Object.freeze([...nextEdges, ...expandedInnerEdges]),
    }),
  };
}

export function evaluateGraphRightsGate(graph: AiNodeGraphDocument): AiRightsGateReport {
  const entries: { readonly nodeId: string; readonly label: string; readonly provenance: AiProvenanceLicenseStatus }[] = [];
  for (const node of graph.nodes) {
    if (node.provenance) entries.push({ nodeId: node.id, label: node.label, provenance: node.provenance });
    if (node.kind === "subgraph" && node.subgraphDefId) {
      for (const inner of graph.subgraphs[node.subgraphDefId]?.innerNodes ?? []) {
        if (inner.provenance) entries.push({ nodeId: `${node.id}/${inner.id}`, label: `${node.label} > ${inner.label}`, provenance: inner.provenance });
      }
    }
  }
  const blockedNodes = entries.flatMap((entry) => {
    if (entry.provenance === "training-opt-out") {
      return [{ ...entry, reasonKo: "학습·생성 입력 금지(opt-out) 에셋은 파이프라인에 투입할 수 없습니다." }];
    }
    if (graph.commercialExportMode && entry.provenance === "non-commercial") {
      return [{ ...entry, reasonKo: "비상업(NC) 전용 에셋은 상업 출고 모드에서 차단됩니다." }];
    }
    if (graph.commercialExportMode && entry.provenance === "unverified") {
      return [{ ...entry, reasonKo: "권리 출처가 확인되지 않은 에셋은 상업 출고 전 검수가 필요합니다." }];
    }
    return [];
  });
  return Object.freeze({
    passed: blockedNodes.length === 0,
    commercialExportMode: graph.commercialExportMode,
    blockedNodes: Object.freeze(blockedNodes),
  });
}

export function computeGraphExecutionPlan(
  graph: AiNodeGraphDocument,
  previousHashes: Readonly<Record<string, string>> = {},
): readonly AiNodeExecutionPlanEntry[] {
  const validation = validateAndSortAiNodeGraph(graph);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const incomingByNode = new Map<string, AiGraphEdge[]>();
  for (const edge of graph.edges) {
    const list = incomingByNode.get(edge.toNodeId) ?? [];
    list.push(edge);
    incomingByNode.set(edge.toNodeId, list);
  }
  const hashByNode = new Map<string, string>();
  const batchByNode = new Map<string, number>();
  const plan: AiNodeExecutionPlanEntry[] = [];

  for (const nodeId of validation.topologicalOrder) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const incoming = [...(incomingByNode.get(nodeId) ?? [])].sort((a, b) =>
      `${a.toPortId}:${a.fromNodeId}`.localeCompare(`${b.toPortId}:${b.fromNodeId}`),
    );
    const upstreamSig = incoming
      .map((e) => `${e.toPortId}<-${hashByNode.get(e.fromNodeId) ?? "none"}:${e.fromPortId}`)
      .join("|");
    let batchMultiplier = incoming.reduce((m, e) => Math.max(m, batchByNode.get(e.fromNodeId) ?? 1), 1);
    if (node.kind === "batch-fanout" && typeof node.params.batchCount === "number" && Number.isFinite(node.params.batchCount)) {
      batchMultiplier *= Math.max(1, Math.min(32, Math.trunc(node.params.batchCount)));
    }
    const seedPart = node.kind === "ai-generate" || node.kind === "subgraph"
      ? `seed=${graph.deterministicSeed}:lock=${graph.seedLocked}`
      : "det";
    const paramSig = Object.keys(node.params).sort().map((k) => `${k}=${JSON.stringify(node.params[k])}`).join("&");
    const contentHash = deterministicDigest(`${node.id}|${node.kind}|${seedPart}|${paramSig}|${upstreamSig}`);
    hashByNode.set(nodeId, contentHash);
    batchByNode.set(nodeId, batchMultiplier);
    plan.push(Object.freeze({ nodeId, kind: node.kind, contentHash, cacheState: previousHashes[nodeId] === contentHash ? "hit" : "dirty", batchMultiplier }));
  }
  return Object.freeze(plan);
}

/** 복잡한 그래프를 비전문 협업자용 Calm 앱 모드(핵심 5~9 컨트롤 예산)로 투영한다. */
export function projectGraphToAppMode(graph: AiNodeGraphDocument): AppModeProjection {
  const validation = validateAndSortAiNodeGraph(graph);
  const rightsGate = evaluateGraphRightsGate(graph);
  const batchMap = new Map(computeGraphExecutionPlan(graph).map((p) => [p.nodeId, p.batchMultiplier]));
  const candidates: { readonly priority: number; readonly item: AppModeControlItem }[] = [];
  let totalEstimatedCredits = 0;
  let totalEstimatedMs = 0;

  for (const node of graph.nodes) {
    const mult = batchMap.get(node.id) ?? 1;
    totalEstimatedCredits += (node.estimatedCredits ?? 0) * mult;
    totalEstimatedMs += (node.estimatedMs ?? 0) * mult;
    for (const meta of node.controlMeta ?? []) {
      const value = meta.exposedInAppMode ? node.params[meta.key] : undefined;
      if (value === undefined) continue;
      candidates.push({
        priority: meta.priority ?? 100,
        item: Object.freeze({
          controlId: `${node.id}:${meta.key}`,
          nodeId: node.id,
          paramKey: meta.key,
          label: meta.label,
          controlType: meta.controlType,
          value,
          min: meta.min,
          max: meta.max,
          step: meta.step,
          options: meta.options,
        }),
      });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority || a.item.controlId.localeCompare(b.item.controlId));
  const orderedControls = candidates.map((c) => c.item);
  const blockingReasonKo = !validation.ok
    ? validation.cycleNodeIds.length > 0
      ? "순환 연결을 해소해야 실행할 수 있습니다."
      : "필수 입력 포트 연결이 누락되었습니다."
    : !rightsGate.passed
      ? (rightsGate.blockedNodes[0]?.reasonKo ?? "권리 게이트 검수를 통과하지 못했습니다.")
      : null;

  return Object.freeze({
    graphId: graph.id,
    title: graph.name,
    primaryControls: Object.freeze(orderedControls.slice(0, APP_MODE_PRIMARY_BUDGET_LIMIT)),
    advancedControls: Object.freeze(orderedControls.slice(APP_MODE_PRIMARY_BUDGET_LIMIT)),
    primaryBudgetLimit: APP_MODE_PRIMARY_BUDGET_LIMIT,
    seedLocked: graph.seedLocked,
    deterministicSeed: graph.deterministicSeed,
    totalEstimatedCredits,
    totalEstimatedMs,
    rightsReady: rightsGate.passed,
    canRun: blockingReasonKo === null,
    blockingReasonKo,
  });
}

export function executeAiNodeGraphDryRun(
  graph: AiNodeGraphDocument,
  previousHashes: Readonly<Record<string, string>> = {},
): AiGraphDryRunResult {
  const validation = validateAndSortAiNodeGraph(graph);
  const rightsGate = evaluateGraphRightsGate(graph);
  if (!validation.ok || !rightsGate.passed) {
    return Object.freeze({
      ok: false, validation, rightsGate, plan: Object.freeze([]),
      cacheHits: 0, executedCount: 0, draftOutputs: Object.freeze([]),
      nextCacheHashes: Object.freeze({ ...previousHashes }),
    });
  }

  const plan = computeGraphExecutionPlan(graph, previousHashes);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const nextCacheHashes: Record<string, string> = {};
  const draftOutputs: DraftLayerOutputDescriptor[] = [];
  let cacheHits = 0;
  let executedCount = 0;

  for (const step of plan) {
    nextCacheHashes[step.nodeId] = step.contentHash;
    if (step.cacheState === "hit") cacheHits += 1;
    else executedCount += 1;
    if (step.kind === "layer-out") {
      const rawName = nodeMap.get(step.nodeId)?.params.layerName;
      draftOutputs.push(Object.freeze({
        outputNodeId: step.nodeId,
        targetLayerName: typeof rawName === "string" && rawName.trim() ? rawName.trim() : `${graph.name} 초안`,
        insertMode: "new-draft-layer" as const,
        overwritesOriginal: false as const,
        contentHash: step.contentHash,
        batchCount: step.batchMultiplier,
      }));
    }
  }

  return Object.freeze({
    ok: true, validation, rightsGate, plan, cacheHits, executedCount,
    draftOutputs: Object.freeze(draftOutputs),
    nextCacheHashes: Object.freeze(nextCacheHashes),
  });
}
