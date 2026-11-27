/**
 * Wave-39: 전문 셰이더 용어 없는 비파괴 '룩 카드(Look Card)' 레시피 그래프 컴파일러 및 평가기.
 *
 * 작가 친화적인 한글 룩 카드(`종이 결`, `셀 음영 단차`, `역광 번짐`, `대기 거리감`,
 * `선화 색트임(색수차 방지 선트랩)`)를 비순환 방향 그래프(DAG)로 조합해 위상 정렬 실행 순서를 결정하고,
 * 꺼짐(Bypass) 또는 강도 0% 카드를 자동 폴딩해 불필요한 GPU 패스를 절약하며,
 * 결정론적 16바이트 정렬 WebGPU 유니폼 버퍼(`Float32Array`)와 읽기 쉬운 한글 요약을 생성한다.
 */

export type VisualLookCardKind =
  | "paper-grain"
  | "cel-shade-step"
  | "backlight-bloom"
  | "atmospheric-depth"
  | "lineart-color-trap";

export interface LookCardCatalogEntry {
  readonly kind: VisualLookCardKind;
  readonly kindCode: number;
  readonly stagePriority: number;
  readonly titleKo: string;
  readonly descriptionKo: string;
}

export const LOOK_CARD_CATALOG: Readonly<Record<VisualLookCardKind, LookCardCatalogEntry>> = {
  "cel-shade-step": {
    kind: "cel-shade-step", kindCode: 1, stagePriority: 10, titleKo: "셀 음영 단차",
    descriptionKo: "밝은 면과 그림자 경계를 또렷한 만화 셀 단계로 정돈합니다.",
  },
  "lineart-color-trap": {
    kind: "lineart-color-trap", kindCode: 2, stagePriority: 20, titleKo: "선화 색트임(색수차 방지 선트랩)",
    descriptionKo: "먹선 가장자리의 흰 틈과 색 번짐 들뜸을 잡아 깔끔하게 밀착합니다.",
  },
  "atmospheric-depth": {
    kind: "atmospheric-depth", kindCode: 3, stagePriority: 30, titleKo: "대기 거리감",
    descriptionKo: "배경이 멀어질수록 공기 빛깔을 섞어 공간 깊이감을 살립니다.",
  },
  "backlight-bloom": {
    kind: "backlight-bloom", kindCode: 4, stagePriority: 40, titleKo: "역광 번짐",
    descriptionKo: "인물과 사물 가장자리의 밝은 역광이 부드럽게 번지는 빛무리를 더합니다.",
  },
  "paper-grain": {
    kind: "paper-grain", kindCode: 5, stagePriority: 50, titleKo: "종이 결",
    descriptionKo: "만화 원고지와 수채화지 표면의 미세한 종이 질감을 얹습니다.",
  },
};

export interface VisualLookCardParams {
  readonly grainScale?: number;
  readonly warmth?: number;
  readonly stepCount?: number;
  readonly edgeSoftness?: number;
  readonly threshold?: number;
  readonly spreadRadius?: number;
  readonly nearMeters?: number;
  readonly farMeters?: number;
  readonly tintLinearRgb?: readonly [number, number, number];
  readonly trapWidthPx?: number;
  readonly chromaticGuard?: number;
}

export interface VisualLookCardNode {
  readonly id: string;
  readonly kind: VisualLookCardKind;
  readonly labelKo?: string;
  readonly enabled: boolean;
  readonly intensity: number;
  readonly params?: VisualLookCardParams;
}

export interface VisualLookRecipeEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

export interface VisualLookRecipeGraph {
  readonly id: string;
  readonly titleKo?: string;
  readonly nodes: readonly VisualLookCardNode[];
  readonly edges: readonly VisualLookRecipeEdge[];
}

export interface VisualLookNodeOverride {
  readonly enabled?: boolean;
  readonly intensity?: number;
  readonly params?: Partial<VisualLookCardParams>;
}

export type VisualLookOverrideMap = Readonly<Record<string, VisualLookNodeOverride>>;

export interface NonDestructiveLookSessionState {
  readonly baseGraph: VisualLookRecipeGraph;
  readonly overrides: VisualLookOverrideMap;
}

export interface CompileLookRecipeOptions {
  readonly overrides?: VisualLookOverrideMap;
  /** WebGPU 유니폼 오프셋 정렬 바이트 단위 (16의 양의 배수, 기본값 16 -> 패스당 32B) */
  readonly uniformAlignmentBytes?: number;
}

export type LookRecipeErrorCode = "DUPLICATE_NODE_ID" | "UNKNOWN_EDGE_NODE" | "CYCLE_DETECTED" | "INVALID_ALIGNMENT";

export class LookRecipeGraphError extends Error {
  readonly code: LookRecipeErrorCode;
  readonly cycleNodeIds: readonly string[];

  constructor(code: LookRecipeErrorCode, message: string, cycleNodeIds: readonly string[] = []) {
    super(message);
    this.name = "LookRecipeGraphError";
    this.code = code;
    this.cycleNodeIds = cycleNodeIds;
  }
}

export interface WebGpuUniformSliceLayout {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly floatOffset: number;
  readonly floatLength: number;
}

export interface CompiledVisualLookPass {
  readonly passIndex: number;
  readonly nodeId: string;
  readonly kind: VisualLookCardKind;
  readonly labelKo: string;
  readonly intensity: number;
  readonly resolvedParams: Required<VisualLookCardParams>;
  readonly upstreamSourceIds: readonly string[];
  readonly uniformFloats: Float32Array;
  readonly uniformSlice: WebGpuUniformSliceLayout;
}

export interface FoldedVisualLookNode {
  readonly nodeId: string;
  readonly kind: VisualLookCardKind;
  readonly labelKo: string;
  readonly reason: "bypassed" | "zero-intensity";
}

export interface CompiledVisualLookRecipe {
  readonly graphId: string;
  readonly topologicalNodeOrder: readonly string[];
  readonly activePasses: readonly CompiledVisualLookPass[];
  readonly foldedNodes: readonly FoldedVisualLookNode[];
  readonly savedGpuPassCount: number;
  readonly perPassStrideBytes: number;
  readonly packedUniformBuffer: Float32Array;
  readonly summaryKo: string;
}

export interface LookEvaluationInput {
  readonly width: number;
  readonly height: number;
  readonly linearRgba: Float32Array;
  readonly zDepthMeters?: Float32Array;
  readonly lineartMask01?: Float32Array;
}

export interface LookStackEvaluationResult {
  readonly compiled: CompiledVisualLookRecipe;
  readonly outputLinearRgba: Float32Array;
  readonly executedPassCount: number;
  readonly skippedPassCount: number;
  readonly maxChannelDelta: number;
  readonly meanLuminanceBefore: number;
  readonly meanLuminanceAfter: number;
  readonly summaryKo: string;
}

const BASE_PASS_UNIFORM_BYTES = 32; // 8 x Float32 (2 x vec4<f32>)

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function resolveDefaultParams(params?: VisualLookCardParams, override?: Partial<VisualLookCardParams>): Required<VisualLookCardParams> {
  const merged = { ...params, ...override };
  const tint = merged.tintLinearRgb ?? [0.82, 0.88, 0.96];
  const nearMeters = Math.max(0, merged.nearMeters ?? 1);
  return {
    grainScale: clamp(merged.grainScale ?? 1, 0.25, 4),
    warmth: clamp01(merged.warmth ?? 0.3),
    stepCount: Math.round(clamp(merged.stepCount ?? 3, 2, 6)),
    edgeSoftness: clamp01(merged.edgeSoftness ?? 0.18),
    threshold: clamp(merged.threshold ?? 0.72, 0.1, 2),
    spreadRadius: Math.round(clamp(merged.spreadRadius ?? 1, 1, 4)),
    nearMeters,
    farMeters: Math.max(nearMeters + 0.2, merged.farMeters ?? 14),
    tintLinearRgb: [clamp01(tint[0]), clamp01(tint[1]), clamp01(tint[2])],
    trapWidthPx: clamp(merged.trapWidthPx ?? 1, 0.5, 3),
    chromaticGuard: clamp01(merged.chromaticGuard ?? 0.85),
  };
}

function packPassUniformVec8(kind: VisualLookCardKind, intensity: number, p: Required<VisualLookCardParams>): Float32Array {
  const out = new Float32Array(8);
  out[0] = LOOK_CARD_CATALOG[kind].kindCode;
  out[1] = intensity;
  if (kind === "paper-grain") { out[2] = p.grainScale; out[3] = p.warmth; }
  else if (kind === "cel-shade-step") { out[2] = p.stepCount; out[3] = p.edgeSoftness; }
  else if (kind === "backlight-bloom") { out[2] = p.threshold; out[3] = p.spreadRadius; }
  else if (kind === "atmospheric-depth") {
    out[2] = p.nearMeters; out[3] = p.farMeters;
    out[4] = p.tintLinearRgb[0]; out[5] = p.tintLinearRgb[1]; out[6] = p.tintLinearRgb[2];
  } else { out[2] = p.trapWidthPx; out[3] = p.chromaticGuard; }
  return out;
}

function findCyclePath(nodeIds: readonly string[], adjacency: ReadonlyMap<string, readonly string[]>): readonly string[] {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const dfs = (u: string): readonly string[] | null => {
    state.set(u, 1);
    stack.push(u);
    for (const v of adjacency.get(u) ?? []) {
      const st = state.get(v) ?? 0;
      if (st === 1) return [...stack.slice(Math.max(0, stack.indexOf(v))), v];
      if (st === 0) {
        const found = dfs(v);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(u, 2);
    return null;
  };
  for (const id of nodeIds) {
    if ((state.get(id) ?? 0) === 0) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return [];
}

/** 비파괴 룩 편집 세션을 생성한다. 원본 레시피 그래프는 수정되지 않는다. */
export function createNonDestructiveLookSession(baseGraph: VisualLookRecipeGraph): NonDestructiveLookSessionState {
  return { baseGraph, overrides: {} };
}

/** 특정 룩 카드의 활성 상태·강도·세부 값을 원본 그래프 훼손 없이 오버라이드한다. */
export function applyVisualLookOverride(
  session: NonDestructiveLookSessionState,
  nodeId: string,
  patch: VisualLookNodeOverride,
): NonDestructiveLookSessionState {
  const prev = session.overrides[nodeId];
  const merged: VisualLookNodeOverride = {
    ...prev,
    ...patch,
    params: prev?.params || patch.params ? { ...prev?.params, ...patch.params } : undefined,
  };
  return { baseGraph: session.baseGraph, overrides: { ...session.overrides, [nodeId]: merged } };
}

/** 단일 카드(또는 nodeId 생략 시 전체 카드)의 비파괴 오버라이드를 초기 레시피 상태로 되돌린다. */
export function resetVisualLookOverride(
  session: NonDestructiveLookSessionState,
  nodeId?: string,
): NonDestructiveLookSessionState {
  if (nodeId === undefined) return { baseGraph: session.baseGraph, overrides: {} };
  const next: Record<string, VisualLookNodeOverride> = {};
  for (const [key, val] of Object.entries(session.overrides)) {
    if (key !== nodeId) next[key] = val;
  }
  return { baseGraph: session.baseGraph, overrides: next };
}

/**
 * 룩 카드 레시피 그래프의 비순환성을 검증하고 위상 정렬 실행 계획, 폴딩된 패스,
 * 16바이트 정렬 WebGPU 유니폼 버퍼 및 한글 요약을 컴파일한다.
 */
export function compileVisualLookRecipeGraph(
  graph: VisualLookRecipeGraph,
  options: CompileLookRecipeOptions = {},
): CompiledVisualLookRecipe {
  const alignment = options.uniformAlignmentBytes ?? 16;
  if (!Number.isInteger(alignment) || alignment < 16 || alignment % 16 !== 0) {
    throw new LookRecipeGraphError("INVALID_ALIGNMENT", `WebGPU 유니폼 정렬 단위(${alignment})는 16바이트 이상의 16 배수여야 합니다.`);
  }

  const nodeMap = new Map<string, { readonly node: VisualLookCardNode; readonly orderIdx: number }>();
  for (let i = 0; i < graph.nodes.length; i += 1) {
    const node = graph.nodes[i];
    if (!node) continue;
    if (nodeMap.has(node.id)) {
      throw new LookRecipeGraphError("DUPLICATE_NODE_ID", `중복된 룩 카드 ID가 존재합니다: ${node.id}`);
    }
    nodeMap.set(node.id, { node, orderIdx: i });
  }

  const adjacency = new Map<string, string[]>();
  const reverseEdges = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeMap.keys()) {
    adjacency.set(id, []);
    reverseEdges.set(id, []);
    inDegree.set(id, 0);
  }

  const seenEdgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (!nodeMap.has(edge.fromNodeId) || !nodeMap.has(edge.toNodeId)) {
      throw new LookRecipeGraphError("UNKNOWN_EDGE_NODE", `존재하지 않는 룩 카드를 연결했습니다: ${edge.fromNodeId} -> ${edge.toNodeId}`);
    }
    if (edge.fromNodeId === edge.toNodeId) {
      throw new LookRecipeGraphError("CYCLE_DETECTED", `자기 자신을 참조하는 순환 연결이 감지되었습니다: ${edge.fromNodeId}`, [edge.fromNodeId, edge.fromNodeId]);
    }
    const edgeKey = `${edge.fromNodeId}->${edge.toNodeId}`;
    if (seenEdgeKeys.has(edgeKey)) continue;
    seenEdgeKeys.add(edgeKey);
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    reverseEdges.get(edge.toNodeId)?.push(edge.fromNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const compareIds = (a: string, b: string): number => {
    const entryA = nodeMap.get(a);
    const entryB = nodeMap.get(b);
    if (!entryA || !entryB) return a.localeCompare(b);
    const stageDiff = LOOK_CARD_CATALOG[entryA.node.kind].stagePriority - LOOK_CARD_CATALOG[entryB.node.kind].stagePriority;
    return stageDiff !== 0 ? stageDiff : entryA.orderIdx - entryB.orderIdx;
  };

  const ready: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) ready.push(id);
  }
  ready.sort(compareIds);

  const topologicalNodeOrder: string[] = [];
  while (ready.length > 0) {
    const currentId = ready.shift();
    if (!currentId) break;
    topologicalNodeOrder.push(currentId);
    for (const nextId of adjacency.get(currentId) ?? []) {
      const nextDeg = (inDegree.get(nextId) ?? 1) - 1;
      inDegree.set(nextId, nextDeg);
      if (nextDeg === 0) {
        ready.push(nextId);
        ready.sort(compareIds);
      }
    }
  }

  if (topologicalNodeOrder.length < nodeMap.size) {
    const cycle = findCyclePath([...nodeMap.keys()], adjacency);
    throw new LookRecipeGraphError("CYCLE_DETECTED", `룩 카드 레시피 그래프에 순환 연결이 있습니다: ${cycle.join(" -> ")}`, cycle);
  }

  const strideBytes = Math.ceil(BASE_PASS_UNIFORM_BYTES / alignment) * alignment;
  const strideFloats = strideBytes / 4;
  const overrides = options.overrides ?? {};
  const effectiveSourcesByNode = new Map<string, readonly string[]>();
  const activePassesDraft: Array<Omit<CompiledVisualLookPass, "uniformSlice">> = [];
  const foldedNodes: FoldedVisualLookNode[] = [];

  for (const nodeId of topologicalNodeOrder) {
    const entry = nodeMap.get(nodeId);
    if (!entry) continue;
    const { node } = entry;
    const ov = overrides[nodeId];
    const labelKo = node.labelKo ?? LOOK_CARD_CATALOG[node.kind].titleKo;
    const enabled = ov?.enabled ?? node.enabled;
    const intensity = clamp01(ov?.intensity ?? node.intensity);

    const upstreamSet = new Set<string>();
    for (const pId of reverseEdges.get(nodeId) ?? []) {
      for (const src of effectiveSourcesByNode.get(pId) ?? ["source-canvas"]) upstreamSet.add(src);
    }
    const upstreamSourceIds = upstreamSet.size > 0 ? [...upstreamSet] : ["source-canvas"];

    if (!enabled || intensity <= 1e-4) {
      foldedNodes.push({ nodeId, kind: node.kind, labelKo, reason: !enabled ? "bypassed" : "zero-intensity" });
      effectiveSourcesByNode.set(nodeId, upstreamSourceIds);
      continue;
    }

    const resolvedParams = resolveDefaultParams(node.params, ov?.params);
    activePassesDraft.push({
      passIndex: activePassesDraft.length, nodeId, kind: node.kind, labelKo, intensity,
      resolvedParams, upstreamSourceIds, uniformFloats: packPassUniformVec8(node.kind, intensity, resolvedParams),
    });
    effectiveSourcesByNode.set(nodeId, [nodeId]);
  }

  const packedUniformBuffer = new Float32Array(activePassesDraft.length * strideFloats);
  const activePasses: CompiledVisualLookPass[] = activePassesDraft.map((draft, idx) => {
    const floatOffset = idx * strideFloats;
    packedUniformBuffer.set(draft.uniformFloats, floatOffset);
    return { ...draft, uniformSlice: { byteOffset: idx * strideBytes, byteLength: strideBytes, floatOffset, floatLength: strideFloats } };
  });

  const savedGpuPassCount = foldedNodes.length;
  const savedSuffix = savedGpuPassCount > 0 ? ` (생략 ${savedGpuPassCount}개로 GPU 패스 절약)` : "";
  const summaryKo =
    activePasses.length === 0
      ? `활성 룩 카드 없음 · 원본 화면 그대로 유지${savedSuffix}`
      : `적용 순서: ${activePasses.map((p) => `${p.labelKo}(${Math.round(p.intensity * 100)}%)`).join(" → ")} · 실행 ${activePasses.length}패스${savedSuffix}`;

  return {
    graphId: graph.id, topologicalNodeOrder, activePasses, foldedNodes,
    savedGpuPassCount, perPassStrideBytes: strideBytes, packedUniformBuffer, summaryKo,
  };
}

function executeSingleLookPass(
  src: Float32Array,
  width: number,
  height: number,
  pass: CompiledVisualLookPass,
  zDepthMeters?: Float32Array,
  lineartMask01?: Float32Array,
): Float32Array {
  const dst = new Float32Array(src.length);
  const { kind, intensity, resolvedParams: p } = pass;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pIdx = y * width + x;
      const base = pIdx * 4;
      let r = src[base] ?? 0;
      let g = src[base + 1] ?? 0;
      let b = src[base + 2] ?? 0;
      const a = src[base + 3] ?? 1;
      const lum = luminance(r, g, b);
      const inkMask = clamp01(lineartMask01 ? (lineartMask01[pIdx] ?? 0) : clamp01((0.16 - lum) / 0.16));

      if (kind === "cel-shade-step") {
        const bands = Math.max(2, p.stepCount);
        const hardBand = Math.round(clamp01(lum) * (bands - 1)) / (bands - 1);
        const targetLum = hardBand * (1 - p.edgeSoftness * 0.5) + lum * (p.edgeSoftness * 0.5);
        const ratio = lum > 1e-4 ? targetLum / lum : 1;
        r = r * (1 - intensity) + clamp01(r * ratio) * intensity;
        g = g * (1 - intensity) + clamp01(g * ratio) * intensity;
        b = b * (1 - intensity) + clamp01(b * ratio) * intensity;
      } else if (kind === "atmospheric-depth") {
        const z = zDepthMeters ? (zDepthMeters[pIdx] ?? p.nearMeters) : p.nearMeters;
        const f = clamp01((z - p.nearMeters) / Math.max(0.1, p.farMeters - p.nearMeters)) * intensity * (1 - inkMask * 0.85);
        r = r * (1 - f) + p.tintLinearRgb[0] * f;
        g = g * (1 - f) + p.tintLinearRgb[1] * f;
        b = b * (1 - f) + p.tintLinearRgb[2] * f;
      } else if (kind === "backlight-bloom") {
        const acc = { r: 0, g: 0, b: 0, w: 0 };
        for (let dy = -p.spreadRadius; dy <= p.spreadRadius; dy += 1) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -p.spreadRadius; dx <= p.spreadRadius; dx += 1) {
            const nBase = (ny * width + Math.min(width - 1, Math.max(0, x + dx))) * 4;
            const nr = src[nBase] ?? 0, ng = src[nBase + 1] ?? 0, nb = src[nBase + 2] ?? 0;
            const nLum = luminance(nr, ng, nb), excess = Math.max(0, nLum - p.threshold);
            const w = 1 / (1 + Math.hypot(dx, dy));
            if (excess > 0 && nLum > 1e-5) {
              const gain = (excess / nLum) * w;
              acc.r += nr * gain; acc.g += ng * gain; acc.b += nb * gain;
            }
            acc.w += w;
          }
        }
        const scale = (acc.w > 0 ? intensity / acc.w : 0) * (1 - inkMask * 0.9);
        r = clamp(r + acc.r * scale, 0, 2); g = clamp(g + acc.g * scale, 0, 2); b = clamp(b + acc.b * scale, 0, 2);
      } else if (kind === "lineart-color-trap") {
        const trap = { nearInk: 0, r: 0, g: 0, b: 0, n: 0 };
        const reach = Math.max(1, Math.round(p.trapWidthPx));
        for (let dy = -reach; dy <= reach; dy += 1) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -reach; dx <= reach; dx += 1) {
            const nIdx = ny * width + Math.min(width - 1, Math.max(0, x + dx)), nBase = nIdx * 4;
            const nr = src[nBase] ?? 0, ng = src[nBase + 1] ?? 0, nb = src[nBase + 2] ?? 0;
            const nInk = lineartMask01 ? (lineartMask01[nIdx] ?? 0) : clamp01((0.16 - luminance(nr, ng, nb)) / 0.16);
            trap.nearInk = Math.max(trap.nearInk, nInk);
            if (nInk < 0.25) { trap.r += nr; trap.g += ng; trap.b += nb; trap.n += 1; }
          }
        }
        if (inkMask < 0.55 && trap.nearInk > 0.35 && trap.n > 0) {
          const avgR = trap.r / trap.n, avgG = trap.g / trap.n, avgB = trap.b / trap.n;
          const tBlend = intensity * trap.nearInk * 0.65, guard = p.chromaticGuard * intensity * 0.5;
          r = r * (1 - tBlend) + avgR * tBlend; g = g * (1 - tBlend) + avgG * tBlend; b = b * (1 - tBlend) + avgB * tBlend;
          r = r * (1 - guard) + (avgR * 0.7 + g * 0.3) * guard;
          b = b * (1 - guard) + (avgB * 0.7 + g * 0.3) * guard;
        }
      } else if (kind === "paper-grain") {
        const sx = Math.floor(x / p.grainScale) + 17, sy = Math.floor(y / p.grainScale) + 31;
        const hash = (((Math.imul(sx, 374761393) + Math.imul(sy, 668265263)) ^ 0x5bf03635) >>> 0) / 4294967295;
        const grain = (hash - 0.5) * 0.12 * intensity * (1 - inkMask * 0.9);
        const warmShift = p.warmth * 0.03 * intensity * (1 - inkMask);
        r = clamp01(r + grain + warmShift); g = clamp01(g + grain + warmShift * 0.55); b = clamp01(b + grain - warmShift * 0.45);
      }
      dst[base] = r; dst[base + 1] = g; dst[base + 2] = b; dst[base + 3] = a;
    }
  }
  return dst;
}

/** 원본 캔버스 버퍼와 레시피 그래프를 전혀 훼손하지 않고 위상 정렬된 활성 룩 패스만 순차 실행한다. */
export function evaluateNonDestructiveLookStack(
  input: LookEvaluationInput,
  graph: VisualLookRecipeGraph,
  options: CompileLookRecipeOptions = {},
): LookStackEvaluationResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const expectedLen = width * height * 4;
  if (input.linearRgba.length < expectedLen) {
    throw new RangeError("LookEvaluationInput.linearRgba 길이가 width * height * 4 보다 작습니다.");
  }

  const compiled = compileVisualLookRecipeGraph(graph, options);
  let currentBuffer: Float32Array = new Float32Array(input.linearRgba.subarray(0, expectedLen));
  for (const pass of compiled.activePasses) {
    currentBuffer = executeSingleLookPass(currentBuffer, width, height, pass, input.zDepthMeters, input.lineartMask01);
  }

  const pixelCount = width * height;
  let lumBeforeSum = 0, lumAfterSum = 0, maxDelta = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    const r0 = input.linearRgba[idx] ?? 0, g0 = input.linearRgba[idx + 1] ?? 0, b0 = input.linearRgba[idx + 2] ?? 0;
    const r1 = currentBuffer[idx] ?? 0, g1 = currentBuffer[idx + 1] ?? 0, b1 = currentBuffer[idx + 2] ?? 0;
    lumBeforeSum += luminance(r0, g0, b0);
    lumAfterSum += luminance(r1, g1, b1);
    maxDelta = Math.max(maxDelta, Math.abs(r1 - r0), Math.abs(g1 - g0), Math.abs(b1 - b0));
  }
  return {
    compiled, outputLinearRgba: currentBuffer,
    executedPassCount: compiled.activePasses.length, skippedPassCount: compiled.savedGpuPassCount,
    maxChannelDelta: maxDelta, meanLuminanceBefore: lumBeforeSum / pixelCount,
    meanLuminanceAfter: lumAfterSum / pixelCount, summaryKo: compiled.summaryKo,
  };
}
