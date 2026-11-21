/**
 * Krita AI Diffusion 라이브 페인팅 · Regional Prompt · Multi-ControlNet · ComfyUI 시각 노드 그래프 엔진
 *
 * REA 실증 근거:
 * - Acly/krita-ai-diffusion (`document.py`, `layer.py`, `pose.py`, `style.py`, `model`, `backend`)
 * - comfyanonymous/ComfyUI (`nodes_controlnet`, `nodes_differential_diffusion`, `nodes_depth_anything_3`,
 *   `nodes_bg_removal`, `nodes_compositing`, `nodes_camera_angle`, `nodes_camera_trajectory`,
 *   `nodes_flux`, `nodes_frame_interpolation`)
 * 외부 유료 API 없이 100% 로컬 상태 계획·표준 ComfyUI JSON 직렬화/역직렬화·오프라인 시뮬레이터로 동작한다.
 */

export interface CanvasDirtyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface LivePaintingPatchPlan {
  readonly revision: number;
  readonly tileRect: CanvasDirtyRect;
  readonly denoiseStrength: number;
  readonly differentialDiffusionMaskWeight: number;
  readonly estimatedStepCount: number;
  readonly emittedAtMs: number;
}
export interface LivePaintingStreamState {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly strength: number;
  readonly debounceMs: number;
  readonly lastMutationMs: number | null;
  readonly pendingRect: CanvasDirtyRect | null;
  readonly revision: number;
  readonly lastPatch: LivePaintingPatchPlan | null;
}
export interface RegionalPromptLayer {
  readonly id: string;
  readonly labelKo: string;
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly weight: number;
  readonly maskRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly feather: number;
  readonly enabled: boolean;
}
export interface RegionalAttentionResult {
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly activeLayerCount: number;
  readonly coverageByLayerId: Readonly<Record<string, number>>;
  readonly overlapRatio: number;
  readonly combinedPromptSummary: string;
}

export type ControlNetKind = "Lineart" | "DepthAnything3" | "OpenPose" | "Canny" | "Tile" | "IPAdapter";
export interface ControlNetStackItem {
  readonly id: string;
  readonly type: ControlNetKind;
  readonly enabled: boolean;
  readonly strength: number;
  readonly startPercent: number;
  readonly endPercent: number;
  readonly preprocessor: string;
}
export interface MultiControlNetStackResult {
  readonly activeItems: readonly ControlNetStackItem[];
  readonly totalGuidanceLoad: number;
  readonly overConstrained: boolean;
  readonly warnings: readonly string[];
  readonly orderedConditioners: readonly string[];
}

export type ComfySlotType = "MODEL" | "CLIP" | "VAE" | "CONDITIONING" | "LATENT" | "IMAGE" | "MASK" | "CONTROL_NET";
export type ComfyWidgetValue = string | number | boolean;
export interface ComfySlotSpec {
  readonly name: string;
  readonly type: ComfySlotType;
}
export interface ComfyNodeClassSpec {
  readonly classType: string;
  readonly titleKo: string;
  readonly inputs: readonly ComfySlotSpec[];
  readonly outputs: readonly ComfySlotSpec[];
  readonly defaultWidgets: Readonly<Record<string, ComfyWidgetValue>>;
}
export interface ComfyVisualNode {
  readonly id: string;
  readonly classType: string;
  readonly title: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly widgets: Readonly<Record<string, ComfyWidgetValue>>;
}
export interface ComfyVisualEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly fromOutputIndex: number;
  readonly toNodeId: string;
  readonly toInputName: string;
}
export interface ComfyVisualGraph {
  readonly id: string;
  readonly nameKo: string;
  readonly nodes: readonly ComfyVisualNode[];
  readonly edges: readonly ComfyVisualEdge[];
}
export interface ComfyGraphValidationResult {
  readonly valid: boolean;
  readonly order: readonly string[];
  readonly cycleNodeIds: readonly string[];
  readonly errors: readonly string[];
}
export type ComfyApiLinkTuple = readonly [string, number];
export type ComfyApiInputValue = ComfyWidgetValue | ComfyApiLinkTuple;
export interface ComfyApiPromptNode {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, ComfyApiInputValue>>;
  readonly _meta?: { readonly title?: string };
}
export type ComfyApiPromptGraph = Readonly<Record<string, ComfyApiPromptNode>>;
export interface ComfyOfflineNodeStep {
  readonly nodeId: string;
  readonly classType: string;
  readonly title: string;
  readonly outputSummary: string;
  readonly simulatedMs: number;
}
export interface ComfyOfflineSimulationResult {
  readonly ok: boolean;
  readonly steps: readonly ComfyOfflineNodeStep[];
  readonly totalSimulatedMs: number;
  readonly outputResolution: { readonly width: number; readonly height: number };
  readonly zeroPaidApiUsed: boolean;
  readonly errors: readonly string[];
}

const LIVE_MIN_STRENGTH = 0.15;
const LIVE_MAX_STRENGTH = 0.85;

export const CONTROLNET_PREPROCESSOR_MAP: Readonly<Record<ControlNetKind, string>> = {
  Lineart: "LineartAnimePreprocessor",
  DepthAnything3: "DepthAnythingV3Preprocessor",
  OpenPose: "DWOpenPosePreprocessor",
  Canny: "CannyEdgePreprocessor",
  Tile: "TileColorFixPreprocessor",
  IPAdapter: "IPAdapterUnifiedLoader",
};

function spec(
  classType: string,
  titleKo: string,
  inputs: readonly (readonly [string, ComfySlotType])[],
  outputs: readonly (readonly [string, ComfySlotType])[],
  defaultWidgets: Readonly<Record<string, ComfyWidgetValue>> = {},
): ComfyNodeClassSpec {
  return {
    classType,
    titleKo,
    inputs: inputs.map(([name, type]) => ({ name, type })),
    outputs: outputs.map(([name, type]) => ({ name, type })),
    defaultWidgets,
  };
}

export const COMFY_NODE_REGISTRY: Readonly<Record<string, ComfyNodeClassSpec>> = {
  CheckpointLoaderSimple: spec(
    "CheckpointLoaderSimple",
    "체크포인트 로더",
    [],
    [["MODEL", "MODEL"], ["CLIP", "CLIP"], ["VAE", "VAE"]],
    { ckpt_name: "local_anime_cleanroom.safetensors" },
  ),
  CLIPTextEncode: spec(
    "CLIPTextEncode",
    "프롬프트 인코더",
    [["clip", "CLIP"]],
    [["CONDITIONING", "CONDITIONING"]],
    { text: "웹툰 컷, 선명한 펜선, 따뜻한 창가 조명" },
  ),
  ControlNetLoader: spec(
    "ControlNetLoader",
    "컨트롤넷 로더",
    [],
    [["CONTROL_NET", "CONTROL_NET"]],
    { control_net_name: "controlnet_lineart_local.safetensors" },
  ),
  DepthAnythingV3Preprocessor: spec(
    "DepthAnythingV3Preprocessor",
    "DepthAnything3 깊이맵",
    [["image", "IMAGE"]],
    [["IMAGE", "IMAGE"]],
    { resolution: 512 },
  ),
  ControlNetApplyAdvanced: spec(
    "ControlNetApplyAdvanced",
    "멀티 컨트롤넷 적용",
    [["positive", "CONDITIONING"], ["negative", "CONDITIONING"], ["control_net", "CONTROL_NET"], ["image", "IMAGE"]],
    [["positive", "CONDITIONING"], ["negative", "CONDITIONING"]],
    { strength: 0.85, start_percent: 0, end_percent: 0.9 },
  ),
  DifferentialDiffusion: spec(
    "DifferentialDiffusion",
    "차등 디퓨전 마스크",
    [["model", "MODEL"]],
    [["MODEL", "MODEL"]],
    { feather_mask: true },
  ),
  EmptyLatentImage: spec(
    "EmptyLatentImage",
    "잠재 캔버스 생성",
    [],
    [["LATENT", "LATENT"]],
    { width: 768, height: 1024, batch_size: 1 },
  ),
  FluxGuidance: spec(
    "FluxGuidance",
    "Flux 가이던스",
    [["conditioning", "CONDITIONING"]],
    [["CONDITIONING", "CONDITIONING"]],
    { guidance: 3.5 },
  ),
  BackgroundRemoval: spec(
    "BackgroundRemoval",
    "배경 자동 분리",
    [["image", "IMAGE"]],
    [["IMAGE", "IMAGE"], ["MASK", "MASK"]],
    { threshold: 0.5 },
  ),
  CameraAngleControl: spec(
    "CameraAngleControl",
    "카메라 앵글 제어",
    [["conditioning", "CONDITIONING"]],
    [["CONDITIONING", "CONDITIONING"]],
    { azimuth_deg: 20, pitch_deg: -10, fov_deg: 45 },
  ),
  KSampler: spec(
    "KSampler",
    "샘플러",
    [["model", "MODEL"], ["positive", "CONDITIONING"], ["negative", "CONDITIONING"], ["latent_image", "LATENT"]],
    [["LATENT", "LATENT"]],
    { seed: 42026, steps: 18, cfg: 6.5, sampler_name: "euler", scheduler: "normal", denoise: 0.45 },
  ),
  VAEDecode: spec(
    "VAEDecode",
    "이미지 복원(VAE)",
    [["samples", "LATENT"], ["vae", "VAE"]],
    [["IMAGE", "IMAGE"]],
  ),
  FrameInterpolation: spec(
    "FrameInterpolation",
    "프레임 보간",
    [["image", "IMAGE"]],
    [["IMAGE", "IMAGE"]],
    { multiplier: 2 },
  ),
  SaveImage: spec(
    "SaveImage",
    "로컬 캔버스 저장",
    [["images", "IMAGE"]],
    [],
    { filename_prefix: "toonstudio_live" },
  ),
};

const clampRange = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const alignToGrid = (value: number, grid: number, roundUp: boolean): number =>
  (roundUp ? Math.ceil(value / grid) : Math.floor(value / grid)) * grid;

/** Krita AI Live Painting 실시간 스트림 플래너 초기 상태를 만든다. */
export function createLivePaintingState(
  canvasWidth: number,
  canvasHeight: number,
  options?: { readonly strength?: number; readonly debounceMs?: number },
): LivePaintingStreamState {
  return {
    canvasWidth: Math.max(64, Math.round(canvasWidth)),
    canvasHeight: Math.max(64, Math.round(canvasHeight)),
    strength: clampRange(options?.strength ?? 0.42, LIVE_MIN_STRENGTH, LIVE_MAX_STRENGTH),
    debounceMs: clampRange(options?.debounceMs ?? 180, 40, 1200),
    lastMutationMs: null,
    pendingRect: null,
    revision: 0,
    lastPatch: null,
  };
}

/** 강도 슬라이더 값을 0.15~0.85 안전 구간으로 보정해 갱신한다. */
export function updateLivePaintingStrength(
  state: LivePaintingStreamState,
  nextStrength: number,
): LivePaintingStreamState {
  return {
    ...state,
    strength: Math.round(clampRange(nextStrength, LIVE_MIN_STRENGTH, LIVE_MAX_STRENGTH) * 100) / 100,
  };
}

/** 브러시 획이 닿은 더티 영역을 병합하고 8px 디퓨전 그리드로 정렬한다. */
export function markCanvasDirtyRect(
  state: LivePaintingStreamState,
  rect: CanvasDirtyRect,
  nowMs: number,
): LivePaintingStreamState {
  const rx0 = clampRange(Math.floor(rect.x), 0, state.canvasWidth);
  const ry0 = clampRange(Math.floor(rect.y), 0, state.canvasHeight);
  const rx1 = clampRange(Math.ceil(rect.x + rect.width), 0, state.canvasWidth);
  const ry1 = clampRange(Math.ceil(rect.y + rect.height), 0, state.canvasHeight);
  if (rx1 <= rx0 || ry1 <= ry0) return state;

  const p = state.pendingRect;
  const x0 = clampRange(alignToGrid(p ? Math.min(p.x, rx0) : rx0, 8, false), 0, state.canvasWidth);
  const y0 = clampRange(alignToGrid(p ? Math.min(p.y, ry0) : ry0, 8, false), 0, state.canvasHeight);
  const x1 = clampRange(alignToGrid(p ? Math.max(p.x + p.width, rx1) : rx1, 8, true), 0, state.canvasWidth);
  const y1 = clampRange(alignToGrid(p ? Math.max(p.y + p.height, ry1) : ry1, 8, true), 0, state.canvasHeight);

  return {
    ...state,
    lastMutationMs: nowMs,
    pendingRect: { x: x0, y: y0, width: Math.max(8, x1 - x0), height: Math.max(8, y1 - y0) },
  };
}

/** 디바운스 간격 경과 후 라이브 패치 계획을 발급하고 더티 버퍼를 비운다. */
export function flushLivePaintingPatch(
  state: LivePaintingStreamState,
  nowMs: number,
  force = false,
): { readonly state: LivePaintingStreamState; readonly patch: LivePaintingPatchPlan | null } {
  if (!state.pendingRect || state.lastMutationMs === null) return { state, patch: null };
  if (!force && nowMs - state.lastMutationMs < state.debounceMs) return { state, patch: null };

  const nextRev = state.revision + 1;
  const patch: LivePaintingPatchPlan = {
    revision: nextRev,
    tileRect: state.pendingRect,
    denoiseStrength: state.strength,
    differentialDiffusionMaskWeight: Math.round((0.35 + state.strength * 0.55) * 100) / 100,
    estimatedStepCount: Math.max(4, Math.round(state.strength * 20)),
    emittedAtMs: nowMs,
  };
  return {
    state: { ...state, pendingRect: null, revision: nextRev, lastPatch: patch },
    patch,
  };
}

/** 영역별 프롬프트 레이어의 정규화 어텐션 점유율 및 중첩률을 계산한다. */
export function composeRegionalPromptAttentionMap(
  layers: readonly RegionalPromptLayer[],
  gridSize = 16,
): RegionalAttentionResult {
  const active = layers.filter((layer) => layer.enabled && layer.prompt.trim().length > 0);
  const g = clampRange(Math.round(gridSize), 4, 32);
  const weightSumById: Record<string, number> = Object.fromEntries(active.map((l) => [l.id, 0]));
  let overlapCells = 0;
  const totalCells = g * g;

  for (let gy = 0; gy < g; gy += 1) {
    const ny = (gy + 0.5) / g;
    for (let gx = 0; gx < g; gx += 1) {
      const nx = (gx + 0.5) / g;
      let cellTotal = 0;
      const contribs: { readonly id: string; readonly w: number }[] = [];
      for (const layer of active) {
        const r = layer.maskRect;
        const dist = Math.hypot(
          nx < r.x ? r.x - nx : nx > r.x + r.width ? nx - (r.x + r.width) : 0,
          ny < r.y ? r.y - ny : ny > r.y + r.height ? ny - (r.y + r.height) : 0,
        );
        const f = Math.max(0.01, layer.feather);
        const eff = (dist === 0 ? 1 : dist < f ? 1 - dist / f : 0) * clampRange(layer.weight, 0, 2);
        if (eff > 0.01) {
          contribs.push({ id: layer.id, w: eff });
          cellTotal += eff;
        }
      }
      if (contribs.length > 1) overlapCells += 1;
      if (cellTotal > 0) {
        for (const c of contribs) weightSumById[c.id] += c.w / cellTotal;
      }
    }
  }

  const coverageByLayerId: Record<string, number> = {};
  for (const layer of active) {
    coverageByLayerId[layer.id] = Math.round((weightSumById[layer.id] / totalCells) * 1000) / 1000;
  }
  return {
    gridWidth: g,
    gridHeight: g,
    activeLayerCount: active.length,
    coverageByLayerId,
    overlapRatio: Math.round((overlapCells / totalCells) * 1000) / 1000,
    combinedPromptSummary: active.map((l) => `[${l.labelKo}:${l.weight.toFixed(1)}] ${l.prompt.trim()}`).join(" | "),
  };
}

/** 6종 ControlNet 스택의 단계 범위와 총 제어 부하를 검증하고 실행 순서를 생성한다. */
export function buildMultiControlNetStack(items: readonly ControlNetStackItem[]): MultiControlNetStackResult {
  const warnings: string[] = [];
  const activeItems: ControlNetStackItem[] = [];
  let totalLoad = 0;

  for (const item of items) {
    if (!item.enabled) continue;
    const strength = clampRange(item.strength, 0, 2);
    const startPercent = clampRange(item.startPercent, 0, 1);
    const endPercent = clampRange(item.endPercent, 0, 1);
    if (startPercent >= endPercent) {
      warnings.push(`${item.type}: 시작 시점(${startPercent})이 종료 시점(${endPercent})보다 작아야 합니다.`);
      continue;
    }
    totalLoad += strength * (endPercent - startPercent);
    activeItems.push({ ...item, strength, startPercent, endPercent });
  }

  const roundedLoad = Math.round(totalLoad * 100) / 100;
  const overConstrained = roundedLoad > 3.2;
  if (overConstrained) warnings.push("활성 ControlNet 누적 강도가 높아 결과물이 과도하게 경직될 수 있습니다.");

  return {
    activeItems,
    totalGuidanceLoad: roundedLoad,
    overConstrained,
    warnings,
    orderedConditioners: activeItems.map((i) => `${i.type}(${i.preprocessor}, 강도 ${i.strength.toFixed(2)})`),
  };
}

export function addComfyNode(graph: ComfyVisualGraph, node: ComfyVisualNode): ComfyVisualGraph {
  return graph.nodes.some((n) => n.id === node.id) ? graph : { ...graph, nodes: [...graph.nodes, node] };
}
export function removeComfyNode(graph: ComfyVisualGraph, nodeId: string): ComfyVisualGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    edges: graph.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
  };
}
export function updateComfyNodeWidget(
  graph: ComfyVisualGraph,
  nodeId: string,
  widgetKey: string,
  value: ComfyWidgetValue,
): ComfyVisualGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, widgets: { ...n.widgets, [widgetKey]: value } } : n)),
  };
}
export function connectComfyEdge(graph: ComfyVisualGraph, edge: ComfyVisualEdge): ComfyVisualGraph {
  const filtered = graph.edges.filter((e) => !(e.toNodeId === edge.toNodeId && e.toInputName === edge.toInputName));
  return { ...graph, edges: [...filtered, edge] };
}
export function disconnectComfyEdge(graph: ComfyVisualGraph, edgeId: string): ComfyVisualGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

/** ComfyUI 그래프의 슬롯 타입 일치성과 순환 여부를 검증한다. */
export function validateComfyGraph(graph: ComfyVisualGraph): ComfyGraphValidationResult {
  const errors: string[] = [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const inDegree = new Map(graph.nodes.map((n) => [n.id, 0]));
  const adjacency = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));

  for (const edge of graph.edges) {
    const fromNode = nodeMap.get(edge.fromNodeId);
    const toNode = nodeMap.get(edge.toNodeId);
    if (!fromNode || !toNode) {
      errors.push(`존재하지 않는 노드를 연결했습니다: ${edge.fromNodeId} -> ${edge.toNodeId}`);
      continue;
    }
    if (edge.fromNodeId === edge.toNodeId) {
      errors.push(`자기 참조 순환 연결은 허용되지 않습니다: ${edge.fromNodeId}`);
      continue;
    }
    const fromSpec = COMFY_NODE_REGISTRY[fromNode.classType];
    const toSpec = COMFY_NODE_REGISTRY[toNode.classType];
    if (fromSpec && toSpec) {
      const outSlot = fromSpec.outputs[edge.fromOutputIndex];
      const inSlot = toSpec.inputs.find((s) => s.name === edge.toInputName);
      if (!outSlot) errors.push(`${fromNode.classType} 출력 슬롯 인덱스(${edge.fromOutputIndex})가 잘못되었습니다.`);
      else if (!inSlot) errors.push(`${toNode.classType} 입력 슬롯(${edge.toInputName})을 찾을 수 없습니다.`);
      else if (outSlot.type !== inSlot.type) {
        errors.push(`슬롯 타입 불일치: ${fromNode.classType}.${outSlot.type} -> ${toNode.classType}.${edge.toInputName}(${inSlot.type})`);
      }
    }
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    order.push(cur);
    for (const nextId of adjacency.get(cur) ?? []) {
      const nextDeg = (inDegree.get(nextId) ?? 0) - 1;
      inDegree.set(nextId, nextDeg);
      if (nextDeg === 0) queue.push(nextId);
    }
  }
  const cycleNodeIds = graph.nodes.map((n) => n.id).filter((id) => !order.includes(id));
  if (cycleNodeIds.length > 0) errors.push(`노드 순환(Cycle)이 감지되었습니다: ${cycleNodeIds.join(", ")}`);

  return { valid: errors.length === 0, order, cycleNodeIds, errors };
}

/** 시각 그래프를 표준 ComfyUI `/prompt` API JSON 형식으로 직렬화한다. */
export function exportComfyUiPromptGraph(graph: ComfyVisualGraph): ComfyApiPromptGraph {
  const result: Record<string, ComfyApiPromptNode> = {};
  for (const node of graph.nodes) {
    const inputs: Record<string, ComfyApiInputValue> = { ...node.widgets };
    for (const edge of graph.edges) {
      if (edge.toNodeId === node.id) inputs[edge.toInputName] = [edge.fromNodeId, edge.fromOutputIndex];
    }
    result[node.id] = { class_type: node.classType, inputs, _meta: { title: node.title } };
  }
  return result;
}

function isComfyLinkTuple(value: unknown): value is ComfyApiLinkTuple {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number" && Number.isInteger(value[1]) && value[1] >= 0;
}

/** 표준 ComfyUI API JSON(`/prompt` 포맷)을 시각 노드 그래프 구조로 역직렬화한다. */
export function importComfyUiPromptGraph(
  promptJson: ComfyApiPromptGraph,
  nameKo = "불러온 ComfyUI 워크플로",
): ComfyVisualGraph {
  const nodes: ComfyVisualNode[] = [];
  const edges: ComfyVisualEdge[] = [];
  const entries = Object.entries(promptJson);
  entries.forEach(([nodeId, rawNode], idx) => {
    const widgets: Record<string, ComfyWidgetValue> = {};
    for (const [k, v] of Object.entries(rawNode.inputs)) {
      if (isComfyLinkTuple(v)) {
        edges.push({ id: `edge:${v[0]}:${v[1]}->${nodeId}:${k}`, fromNodeId: v[0], fromOutputIndex: v[1], toNodeId: nodeId, toInputName: k });
      } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        widgets[k] = v;
      }
    }
    nodes.push({
      id: nodeId,
      classType: rawNode.class_type,
      title: rawNode._meta?.title ?? COMFY_NODE_REGISTRY[rawNode.class_type]?.titleKo ?? rawNode.class_type,
      position: { x: 40 + (idx % 4) * 240, y: 40 + Math.floor(idx / 4) * 160 },
      widgets,
    });
  });
  return { id: `imported-comfy-${entries.length}`, nameKo, nodes, edges };
}

/** 외부 서버 없이 ComfyUI 노드 그래프를 로컬에서 위상 순차 시뮬레이션한다. */
export function simulateComfyGraphOffline(graph: ComfyVisualGraph): ComfyOfflineSimulationResult {
  const validation = validateComfyGraph(graph);
  if (!validation.valid) {
    return { ok: false, steps: [], totalSimulatedMs: 0, outputResolution: { width: 0, height: 0 }, zeroPaidApiUsed: true, errors: validation.errors };
  }
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  let [width, height, totalMs] = [768, 1024, 0];
  const steps: ComfyOfflineNodeStep[] = [];

  for (const nodeId of validation.order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    let simulatedMs = 12;
    let outputSummary = `${node.classType} 통과`;
    if (node.classType === "EmptyLatentImage") {
      width = typeof node.widgets.width === "number" ? node.widgets.width : width;
      height = typeof node.widgets.height === "number" ? node.widgets.height : height;
      simulatedMs = 6;
      outputSummary = `잠재 텐서 1×4×${Math.round(height / 8)}×${Math.round(width / 8)} 초기화`;
    } else if (node.classType === "KSampler") {
      const stepCount = typeof node.widgets.steps === "number" ? node.widgets.steps : 16;
      const denoise = typeof node.widgets.denoise === "number" ? node.widgets.denoise : 0.45;
      simulatedMs = Math.max(20, Math.round(stepCount * denoise * 5));
      outputSummary = `${stepCount}스텝 · 강도 ${denoise} 로컬 샘플링 시뮬레이션`;
    } else if (node.classType === "DifferentialDiffusion") {
      simulatedMs = 14;
      outputSummary = "페더 마스크 차등 디퓨전 패치 바인딩";
    } else if (node.classType === "VAEDecode") {
      simulatedMs = 18;
      outputSummary = `RGBA ${width}×${height} 복원`;
    } else if (node.classType === "SaveImage") {
      simulatedMs = 8;
      outputSummary = `로컬 버퍼 출력 (${width}×${height})`;
    }
    totalMs += simulatedMs;
    steps.push({ nodeId: node.id, classType: node.classType, title: node.title, outputSummary, simulatedMs });
  }

  return { ok: true, steps, totalSimulatedMs: totalMs, outputResolution: { width, height }, zeroPaidApiUsed: true, errors: [] };
}

/** Krita Live + DifferentialDiffusion + KSampler 표준 워크플로 프리셋을 생성한다. */
export function createDefaultKritaComfyWorkflow(): {
  readonly graph: ComfyVisualGraph;
  readonly regionalLayers: readonly RegionalPromptLayer[];
  readonly controlNets: readonly ControlNetStackItem[];
} {
  const graph: ComfyVisualGraph = {
    id: "krita-live-comfy-default",
    nameKo: "Krita 라이브 페인팅 · 차등 디퓨전 파이프라인",
    nodes: [
      { id: "1", classType: "CheckpointLoaderSimple", title: "로컬 화풍 모델", position: { x: 40, y: 40 }, widgets: { ckpt_name: "toonstudio_webtoon_v1.safetensors" } },
      { id: "2", classType: "DifferentialDiffusion", title: "부분 수정 차등 디퓨전", position: { x: 280, y: 40 }, widgets: { feather_mask: true } },
      { id: "3", classType: "CLIPTextEncode", title: "긍정 프롬프트", position: { x: 280, y: 180 }, widgets: { text: "깔끔한 웹툰 펜선, 따뜻한 햇살 배경" } },
      { id: "4", classType: "CLIPTextEncode", title: "부정 프롬프트", position: { x: 280, y: 310 }, widgets: { text: "흐릿한 선, 뭉개진 손가락, 과포화" } },
      { id: "5", classType: "EmptyLatentImage", title: "컷 해상도 캔버스", position: { x: 280, y: 440 }, widgets: { width: 768, height: 1024, batch_size: 1 } },
      { id: "6", classType: "KSampler", title: "라이브 샘플러", position: { x: 560, y: 160 }, widgets: { seed: 202611, steps: 14, cfg: 6.0, sampler_name: "euler", scheduler: "normal", denoise: 0.42 } },
      { id: "7", classType: "VAEDecode", title: "이미지 디코더", position: { x: 820, y: 160 }, widgets: {} },
      { id: "8", classType: "SaveImage", title: "캔버스 패치 반영", position: { x: 1060, y: 160 }, widgets: { filename_prefix: "krita_live_patch" } },
    ],
    edges: [
      { id: "e1", fromNodeId: "1", fromOutputIndex: 0, toNodeId: "2", toInputName: "model" },
      { id: "e2", fromNodeId: "1", fromOutputIndex: 1, toNodeId: "3", toInputName: "clip" },
      { id: "e3", fromNodeId: "1", fromOutputIndex: 1, toNodeId: "4", toInputName: "clip" },
      { id: "e4", fromNodeId: "2", fromOutputIndex: 0, toNodeId: "6", toInputName: "model" },
      { id: "e5", fromNodeId: "3", fromOutputIndex: 0, toNodeId: "6", toInputName: "positive" },
      { id: "e6", fromNodeId: "4", fromOutputIndex: 0, toNodeId: "6", toInputName: "negative" },
      { id: "e7", fromNodeId: "5", fromOutputIndex: 0, toNodeId: "6", toInputName: "latent_image" },
      { id: "e8", fromNodeId: "6", fromOutputIndex: 0, toNodeId: "7", toInputName: "samples" },
      { id: "e9", fromNodeId: "1", fromOutputIndex: 2, toNodeId: "7", toInputName: "vae" },
      { id: "e10", fromNodeId: "7", fromOutputIndex: 0, toNodeId: "8", toInputName: "images" },
    ],
  };

  const regionalLayers: readonly RegionalPromptLayer[] = [
    { id: "region-sky", labelKo: "상단 하늘·배경", prompt: "노을빛 구름과 부드러운 역광", weight: 1.0, maskRect: { x: 0, y: 0, width: 1, height: 0.45 }, feather: 0.12, enabled: true },
    { id: "region-hero", labelKo: "중앙 캐릭터", prompt: "선명한 셀 채색 주인공, 미소 표정", weight: 1.25, maskRect: { x: 0.2, y: 0.3, width: 0.6, height: 0.7 }, feather: 0.1, enabled: true },
  ];

  const controlNets: readonly ControlNetStackItem[] = [
    { id: "cn-lineart", type: "Lineart", enabled: true, strength: 0.9, startPercent: 0, endPercent: 0.9, preprocessor: CONTROLNET_PREPROCESSOR_MAP.Lineart },
    { id: "cn-depth", type: "DepthAnything3", enabled: true, strength: 0.65, startPercent: 0, endPercent: 0.75, preprocessor: CONTROLNET_PREPROCESSOR_MAP.DepthAnything3 },
    { id: "cn-pose", type: "OpenPose", enabled: false, strength: 0.8, startPercent: 0, endPercent: 0.85, preprocessor: CONTROLNET_PREPROCESSOR_MAP.OpenPose },
    { id: "cn-canny", type: "Canny", enabled: false, strength: 0.55, startPercent: 0, endPercent: 0.7, preprocessor: CONTROLNET_PREPROCESSOR_MAP.Canny },
    { id: "cn-tile", type: "Tile", enabled: false, strength: 0.5, startPercent: 0.2, endPercent: 1.0, preprocessor: CONTROLNET_PREPROCESSOR_MAP.Tile },
    { id: "cn-ipadapter", type: "IPAdapter", enabled: true, strength: 0.6, startPercent: 0, endPercent: 0.8, preprocessor: CONTROLNET_PREPROCESSOR_MAP.IPAdapter },
  ];

  return { graph, regionalLayers, controlNets };
}
