export const LOOK_RECIPE_UNIFORM_ALIGNMENT_BYTES = 16;
export const LOOK_RECIPE_HEADER_FLOATS = 4;
export const LOOK_RECIPE_NODE_STRIDE_BYTES = 32;

export type Vec3Tuple = readonly [number, number, number];

export interface SurfaceCurvatureLightSample {
  readonly sampleId: string;
  readonly normal: Vec3Tuple;
  readonly principalCurvatureDir1: Vec3Tuple;
  readonly kappa1: number;
  readonly kappa2: number;
  readonly viewDir?: Vec3Tuple;
}

export interface CrosshatchFieldConfig {
  readonly lightDir: Vec3Tuple;
  readonly ambientFloor?: number;
  readonly baseSpacingPx?: number;
  readonly baseStrokeWidthPx?: number;
  readonly tierThresholds?: readonly [number, number, number];
}

export interface CrosshatchStrokeTierSpec {
  readonly tier: 1 | 2 | 3;
  readonly tangentDir: Vec3Tuple;
  readonly spacingPx: number;
  readonly strokeDensityPer100Px: number;
  readonly strokeWidthPx: number;
}

export interface CrosshatchSampleEvaluation {
  readonly sampleId: string;
  readonly unitNormal: Vec3Tuple;
  readonly unitTangent1: Vec3Tuple;
  readonly unitTangent2: Vec3Tuple;
  readonly ndotl: number;
  readonly toneBrightness: number;
  readonly meanCurvature: number;
  readonly gaussianCurvature: number;
  readonly activeTierCount: 0 | 1 | 2 | 3;
  readonly tiers: readonly CrosshatchStrokeTierSpec[];
  readonly dynamicContourPressure: number;
  readonly dynamicContourWidthPx: number;
}

export interface CrosshatchFieldReport {
  readonly evaluations: readonly CrosshatchSampleEvaluation[];
  readonly maxActiveTierCount: 0 | 1 | 2 | 3;
  readonly meanContourWidthPx: number;
}

export interface LayerStatePatch {
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly blendMode?: string;
  readonly lookPresetTag?: string;
}

export interface VersionCommitInput {
  readonly commitId: string;
  readonly branchName: string;
  readonly parentCommitId: string | null;
  readonly timestampMs: number;
  readonly labelKo: string;
  readonly layerPatches: Readonly<Record<string, LayerStatePatch>>;
}

export interface VersionCommitNode extends VersionCommitInput {
  readonly depth: number;
}

export interface ResolvedBranchSnapshot {
  readonly commitId: string;
  readonly branchName: string;
  readonly lineageCommitIds: readonly string[];
  readonly layerStates: Readonly<Record<string, Required<LayerStatePatch>>>;
}

export interface VersionBranchDiff {
  readonly fromCommitId: string;
  readonly toCommitId: string;
  readonly commonAncestorCommitId: string | null;
  readonly changedLayerIds: readonly string[];
}

export type LookRecipeNodeKind =
  | "source-canvas" | "tone-curve" | "crosshatch-ink"
  | "halftone-screen" | "color-grade-lut" | "paper-grain" | "output-composite";

export interface LookRecipeNode {
  readonly nodeId: string;
  readonly kind: LookRecipeNodeKind;
  readonly bypassed?: boolean;
  readonly blendOpacity?: number;
  readonly params?: readonly [number, number, number, number];
}

export interface LookRecipeEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly inputSlot?: number;
}

export interface LookRecipeGraphInput {
  readonly graphVersion?: number;
  readonly nodes: readonly LookRecipeNode[];
  readonly edges: readonly LookRecipeEdge[];
}

export type LookRecipeErrorCode = "EMPTY_GRAPH" | "DUPLICATE_NODE_ID" | "UNKNOWN_NODE_REF" | "CYCLE_DETECTED";

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

export interface LookRecipeGraphValidation {
  readonly valid: boolean;
  readonly errorCode: LookRecipeErrorCode | null;
  readonly cycleNodeIds: readonly string[];
  readonly topologicalOrder: readonly string[];
}

export interface LookRecipeUniformNodeSlice {
  readonly nodeId: string;
  readonly kind: LookRecipeNodeKind;
  readonly byteOffset: number;
  readonly byteLength: typeof LOOK_RECIPE_NODE_STRIDE_BYTES;
}

export interface CompiledLookRecipeGraph {
  readonly topologicalNodeIds: readonly string[];
  readonly uniformBuffer: Float32Array;
  readonly uniformByteLength: number;
  readonly nodeSlices: readonly LookRecipeUniformNodeSlice[];
  readonly deterministicHashHex: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize3(v: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len <= 1e-8 ? fallback : [v[0] / len, v[1] / len, v[2] / len];
}

function buildOrthonormalSurfaceFrame(rawNormal: Vec3Tuple, rawDir1: Vec3Tuple) {
  const n = normalize3(rawNormal, [0, 0, 1]);
  const p = dot3(rawDir1, n);
  const projected: Vec3Tuple = [rawDir1[0] - p * n[0], rawDir1[1] - p * n[1], rawDir1[2] - p * n[2]];
  const hint: Vec3Tuple = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const t1 = normalize3(projected, normalize3(cross3(hint, n), [1, 0, 0]));
  const t2 = normalize3(cross3(n, t1), [0, 1, 0]);
  return { n, t1, t2 };
}

export function evaluateSurfaceCrosshatchSample(
  sample: SurfaceCurvatureLightSample,
  config: CrosshatchFieldConfig,
): CrosshatchSampleEvaluation {
  const { n, t1, t2 } = buildOrthonormalSurfaceFrame(sample.normal, sample.principalCurvatureDir1);
  const lightUnit = normalize3(config.lightDir, [0, 0.70710678, 0.70710678]);
  const viewUnit = normalize3(sample.viewDir ?? [0, 0, 1], [0, 0, 1]);
  const ambient = clamp(config.ambientFloor ?? 0.08, 0, 0.5);
  const baseSpacing = Math.max(2, config.baseSpacingPx ?? 8);
  const baseWidth = Math.max(0.4, config.baseStrokeWidthPx ?? 1.6);
  const [t1Thresh, t2Thresh, t3Thresh] = config.tierThresholds ?? [0.68, 0.42, 0.18];

  const ndotl = clamp(dot3(n, lightUnit), -1, 1);
  const toneBrightness = clamp(ambient + (1 - ambient) * Math.max(0, ndotl), 0, 1);
  const shadowDepth = 1 - toneBrightness;
  const curvatureBoost = Math.min(3.5, Math.abs(sample.kappa1));
  const activeTierCount: 0 | 1 | 2 | 3 =
    toneBrightness >= t1Thresh ? 0 : toneBrightness >= t2Thresh ? 1 : toneBrightness >= t3Thresh ? 2 : 3;

  const diag = normalize3([t1[0] + t2[0], t1[1] + t2[1], t1[2] + t2[2]], t1);
  const tierDirs: readonly Vec3Tuple[] = [t1, t2, diag];
  const tiers: CrosshatchStrokeTierSpec[] = [];
  for (let idx = 0; idx < activeTierCount; idx += 1) {
    const spacingPx = clamp(baseSpacing / (1 + 0.9 * shadowDepth + 0.32 * curvatureBoost + idx * 0.18), 1.4, baseSpacing * 2);
    tiers.push({
      tier: (idx + 1) as 1 | 2 | 3,
      tangentDir: tierDirs[idx],
      spacingPx,
      strokeDensityPer100Px: 100 / spacingPx,
      strokeWidthPx: baseWidth * (0.72 + 0.35 * shadowDepth - idx * 0.08),
    });
  }

  const silhouette = 1 - clamp(dot3(n, viewUnit), 0, 1);
  const dynamicContourPressure = clamp(0.24 + 0.48 * silhouette + 0.18 * shadowDepth + 0.1 * Math.min(1, curvatureBoost * 0.5), 0.1, 1);
  return {
    sampleId: sample.sampleId,
    unitNormal: n,
    unitTangent1: t1,
    unitTangent2: t2,
    ndotl,
    toneBrightness,
    meanCurvature: 0.5 * (sample.kappa1 + sample.kappa2),
    gaussianCurvature: sample.kappa1 * sample.kappa2,
    activeTierCount,
    tiers,
    dynamicContourPressure,
    dynamicContourWidthPx: baseWidth * (0.55 + 1.45 * dynamicContourPressure),
  };
}

export function computeCurvatureCrosshatchField(
  samples: readonly SurfaceCurvatureLightSample[],
  config: CrosshatchFieldConfig,
): CrosshatchFieldReport {
  const evaluations = samples.map((s) => evaluateSurfaceCrosshatchSample(s, config));
  let maxActiveTierCount: 0 | 1 | 2 | 3 = 0;
  let widthSum = 0;
  for (const ev of evaluations) {
    if (ev.activeTierCount > maxActiveTierCount) maxActiveTierCount = ev.activeTierCount;
    widthSum += ev.dynamicContourWidthPx;
  }
  return {
    evaluations,
    maxActiveTierCount,
    meanContourWidthPx: evaluations.length > 0 ? widthSum / evaluations.length : 0,
  };
}

const DEFAULT_LAYER_STATE: Required<LayerStatePatch> = {
  opacity: 1, visible: true, blendMode: "normal", lookPresetTag: "default",
};

export class LayerBranchVersionGraph {
  private readonly commits = new Map<string, VersionCommitNode>();
  private readonly branchHeads = new Map<string, string>();

  commit(input: VersionCommitInput): VersionCommitNode {
    if (this.commits.has(input.commitId)) throw new Error(`중복된 버전 커밋 ID입니다: ${input.commitId}`);
    let depth = 0;
    if (input.parentCommitId !== null) {
      const parent = this.commits.get(input.parentCommitId);
      if (!parent) throw new Error(`존재하지 않는 부모 버전 커밋입니다: ${input.parentCommitId}`);
      depth = parent.depth + 1;
    }
    const node: VersionCommitNode = { ...input, depth };
    this.commits.set(node.commitId, node);
    this.branchHeads.set(node.branchName, node.commitId);
    return node;
  }

  getBranchHeadCommitId(branchName: string): string | null {
    return this.branchHeads.get(branchName) ?? null;
  }

  checkout(commitId: string): ResolvedBranchSnapshot {
    const target = this.commits.get(commitId);
    if (!target) throw new Error(`찾을 수 없는 버전 커밋입니다: ${commitId}`);
    const lineage: VersionCommitNode[] = [];
    let cursor: VersionCommitNode | undefined = target;
    while (cursor) {
      lineage.push(cursor);
      cursor = cursor.parentCommitId ? this.commits.get(cursor.parentCommitId) : undefined;
    }
    lineage.reverse();

    const merged: Record<string, Required<LayerStatePatch>> = {};
    for (const step of lineage) {
      for (const [layerId, patch] of Object.entries(step.layerPatches)) {
        const prev = merged[layerId] ?? DEFAULT_LAYER_STATE;
        merged[layerId] = {
          opacity: patch.opacity ?? prev.opacity,
          visible: patch.visible ?? prev.visible,
          blendMode: patch.blendMode ?? prev.blendMode,
          lookPresetTag: patch.lookPresetTag ?? prev.lookPresetTag,
        };
      }
    }
    return { commitId: target.commitId, branchName: target.branchName, lineageCommitIds: lineage.map((n) => n.commitId), layerStates: merged };
  }

  diffCommits(fromCommitId: string, toCommitId: string): VersionBranchDiff {
    const snapA = this.checkout(fromCommitId);
    const snapB = this.checkout(toCommitId);
    const ancestorsA = new Set(snapA.lineageCommitIds);
    let lca: string | null = null;
    for (let i = snapB.lineageCommitIds.length - 1; i >= 0; i -= 1) {
      if (ancestorsA.has(snapB.lineageCommitIds[i])) {
        lca = snapB.lineageCommitIds[i];
        break;
      }
    }
    const allIds = new Set([...Object.keys(snapA.layerStates), ...Object.keys(snapB.layerStates)]);
    const changedLayerIds = [...allIds]
      .filter((id) => {
        const a = snapA.layerStates[id] ?? DEFAULT_LAYER_STATE;
        const b = snapB.layerStates[id] ?? DEFAULT_LAYER_STATE;
        return a.opacity !== b.opacity || a.visible !== b.visible || a.blendMode !== b.blendMode || a.lookPresetTag !== b.lookPresetTag;
      })
      .sort();
    return { fromCommitId, toCommitId, commonAncestorCommitId: lca, changedLayerIds };
  }
}

const NODE_KIND_OPCODE: Readonly<Record<LookRecipeNodeKind, number>> = {
  "source-canvas": 1, "tone-curve": 2, "crosshatch-ink": 3, "halftone-screen": 4,
  "color-grade-lut": 5, "paper-grain": 6, "output-composite": 7,
};

function traceCyclePath(remainingIds: readonly string[], adj: ReadonlyMap<string, readonly string[]>): readonly string[] {
  const remaining = new Set(remainingIds);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  for (const startId of remainingIds) {
    if ((state.get(startId) ?? 0) !== 0) continue;
    const dfs = (u: string): readonly string[] | null => {
      state.set(u, 1);
      stack.push(u);
      for (const v of [...(adj.get(u) ?? [])].filter((x) => remaining.has(x)).sort()) {
        const st = state.get(v) ?? 0;
        if (st === 1) return [...stack.slice(stack.indexOf(v)), v];
        if (st === 0) {
          const hit = dfs(v);
          if (hit) return hit;
        }
      }
      stack.pop();
      state.set(u, 2);
      return null;
    };
    const found = dfs(startId);
    if (found) return found;
  }
  return remainingIds;
}

export function validateLookRecipeGraph(input: LookRecipeGraphInput): LookRecipeGraphValidation {
  if (input.nodes.length === 0) return { valid: false, errorCode: "EMPTY_GRAPH", cycleNodeIds: [], topologicalOrder: [] };
  const nodeMap = new Map<string, LookRecipeNode>();
  for (const node of input.nodes) {
    if (nodeMap.has(node.nodeId)) return { valid: false, errorCode: "DUPLICATE_NODE_ID", cycleNodeIds: [node.nodeId], topologicalOrder: [] };
    nodeMap.set(node.nodeId, node);
  }
  const indegree = new Map<string, number>();
  const adj = new Map<string, Set<string>>();
  for (const id of nodeMap.keys()) {
    indegree.set(id, 0);
    adj.set(id, new Set<string>());
  }
  for (const edge of input.edges) {
    if (!nodeMap.has(edge.fromNodeId) || !nodeMap.has(edge.toNodeId)) {
      return { valid: false, errorCode: "UNKNOWN_NODE_REF", cycleNodeIds: [], topologicalOrder: [] };
    }
    if (edge.fromNodeId === edge.toNodeId) {
      return { valid: false, errorCode: "CYCLE_DETECTED", cycleNodeIds: [edge.fromNodeId, edge.toNodeId], topologicalOrder: [] };
    }
    const targets = adj.get(edge.fromNodeId)!;
    if (!targets.has(edge.toNodeId)) {
      targets.add(edge.toNodeId);
      indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
    }
  }

  const ready = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id).sort();
  const topologicalOrder: string[] = [];
  while (ready.length > 0) {
    const cur = ready.shift()!;
    topologicalOrder.push(cur);
    for (const next of [...(adj.get(cur) ?? [])].sort()) {
      const nextDeg = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, nextDeg);
      if (nextDeg === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (topologicalOrder.length !== nodeMap.size) {
    const stuck = [...nodeMap.keys()].filter((id) => !topologicalOrder.includes(id)).sort();
    const adjArray = new Map<string, readonly string[]>();
    for (const [k, s] of adj.entries()) adjArray.set(k, [...s]);
    return { valid: false, errorCode: "CYCLE_DETECTED", cycleNodeIds: traceCyclePath(stuck, adjArray), topologicalOrder: [] };
  }
  return { valid: true, errorCode: null, cycleNodeIds: [], topologicalOrder };
}

function fnv1a64Hex(asciiMeta: string, rawBytes: Uint8Array): string {
  let lo = 0x811c9dc5;
  let hi = 0x9e3779b9;
  for (let i = 0; i < asciiMeta.length; i += 1) {
    const b = asciiMeta.charCodeAt(i) & 0xff;
    lo = Math.imul(lo ^ b, 0x01000193) >>> 0;
    hi = Math.imul(hi ^ ((b + i) & 0xff), 0x85ebca6b) >>> 0;
  }
  for (let i = 0; i < rawBytes.length; i += 1) {
    const b = rawBytes[i];
    lo = Math.imul(lo ^ b, 0x01000193) >>> 0;
    hi = Math.imul(hi ^ ((b ^ (lo >>> 24)) & 0xff), 0xc2b2ae35) >>> 0;
  }
  return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
}

function canonicalFloat(v: number): number {
  return Object.is(v, -0) || v === 0 ? 0 : v;
}

export function compileLookRecipeGraph(input: LookRecipeGraphInput): CompiledLookRecipeGraph {
  const validation = validateLookRecipeGraph(input);
  if (!validation.valid) {
    throw new LookRecipeGraphError(validation.errorCode ?? "CYCLE_DETECTED", `룩 레시피 그래프 컴파일 실패 (${validation.errorCode})`, validation.cycleNodeIds);
  }
  const nodeMap = new Map(input.nodes.map((n) => [n.nodeId, n]));
  const maskByNode = new Map<string, number>();
  for (const edge of input.edges) {
    maskByNode.set(edge.toNodeId, (maskByNode.get(edge.toNodeId) ?? 0) | (1 << clamp(Math.round(edge.inputSlot ?? 0), 0, 15)));
  }

  const uniformBuffer = new Float32Array(LOOK_RECIPE_HEADER_FLOATS + validation.topologicalOrder.length * 8);
  const uniformByteLength = uniformBuffer.byteLength;
  uniformBuffer[0] = validation.topologicalOrder.filter((id) => !nodeMap.get(id)?.bypassed).length;
  uniformBuffer[1] = canonicalFloat(input.graphVersion ?? 1);
  uniformBuffer[2] = uniformByteLength;
  uniformBuffer[3] = 0;

  const nodeSlices: LookRecipeUniformNodeSlice[] = [];
  for (let idx = 0; idx < validation.topologicalOrder.length; idx += 1) {
    const nodeId = validation.topologicalOrder[idx];
    const node = nodeMap.get(nodeId)!;
    const off = LOOK_RECIPE_HEADER_FLOATS + idx * 8;
    const p = node.params ?? [0, 0, 0, 0];
    uniformBuffer[off] = NODE_KIND_OPCODE[node.kind];
    uniformBuffer[off + 1] = node.bypassed ? 1 : 0;
    uniformBuffer[off + 2] = canonicalFloat(clamp(node.blendOpacity ?? 1, 0, 1));
    uniformBuffer[off + 3] = maskByNode.get(nodeId) ?? 0;
    uniformBuffer[off + 4] = canonicalFloat(p[0]);
    uniformBuffer[off + 5] = canonicalFloat(p[1]);
    uniformBuffer[off + 6] = canonicalFloat(p[2]);
    uniformBuffer[off + 7] = canonicalFloat(p[3]);
    nodeSlices.push({ nodeId, kind: node.kind, byteOffset: off * 4, byteLength: LOOK_RECIPE_NODE_STRIDE_BYTES });
  }

  const canonicalEdges = [...input.edges].map((e) => `${e.fromNodeId}->${e.toNodeId}:${e.inputSlot ?? 0}`).sort().join("|");
  const deterministicHashHex = fnv1a64Hex(
    `${validation.topologicalOrder.join(",")}#${canonicalEdges}`,
    new Uint8Array(uniformBuffer.buffer, uniformBuffer.byteOffset, uniformBuffer.byteLength),
  );
  return { topologicalNodeIds: validation.topologicalOrder, uniformBuffer, uniformByteLength, nodeSlices, deterministicHashHex };
}
