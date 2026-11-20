/**
 * 비주얼 노드 기반 브러시 컨트롤러 DAG 엔진 (Black Ink · Graphite.rs 클린룸 구현).
 *
 * - 입력(필압·틸트·방위각·배럴롤·속도·획길이·시간·캔버스명도·상수)
 *   -> 연산(리맵 커브·수학·Perlin/Simplex/Curl 노이즈·클램프·믹스·분기·스텝)
 *   -> 출력(크기·불투명도·유량·법선/접선 산포·색상/색온도 이동·붓털 퍼짐·팁 인덱스)
 * - 최대 64노드 예산 강제, Kahn 위상 정렬 사이클 차단, TypedArray 무할당 평가, WGSL 방출
 */

export const BRUSH_GRAPH_SCHEMA_VERSION = 1 as const;
export const MAX_BRUSH_GRAPH_NODES = 64 as const;
const CURVE_LUT_SIZE = 65;

export type BrushInputChannel =
  | "pressure" | "tilt" | "azimuth" | "barrelRoll"
  | "velocity" | "strokeLength" | "time" | "canvasLuma";

export type BrushOutputChannel =
  | "size" | "opacity" | "flow" | "scatterNormal" | "scatterTangent"
  | "hueShift" | "tempShift" | "bristleSplay" | "tipIndex";

export type BrushMathOp =
  | "add" | "sub" | "mul" | "div" | "pow" | "mod"
  | "abs" | "sin" | "cos" | "sqrt" | "min" | "max" | "invert";

export type BrushNoiseKind = "perlin" | "simplex" | "curl";
export interface BrushCurvePoint { readonly x: number; readonly y: number; }

export type BrushControllerNode =
  | { readonly id: string; readonly kind: "input"; readonly channel: BrushInputChannel }
  | { readonly id: string; readonly kind: "constant"; readonly value: number }
  | { readonly id: string; readonly kind: "remapCurve"; readonly points: readonly BrushCurvePoint[] }
  | { readonly id: string; readonly kind: "math"; readonly op: BrushMathOp; readonly fallbackB?: number }
  | { readonly id: string; readonly kind: "noise"; readonly noiseKind: BrushNoiseKind; readonly frequency: number; readonly seed: number }
  | { readonly id: string; readonly kind: "clamp"; readonly min: number; readonly max: number }
  | { readonly id: string; readonly kind: "mix"; readonly fallbackT?: number }
  | { readonly id: string; readonly kind: "branch"; readonly threshold: number }
  | { readonly id: string; readonly kind: "step"; readonly smooth: boolean; readonly edge0: number; readonly edge1: number }
  | { readonly id: string; readonly kind: "output"; readonly channel: BrushOutputChannel; readonly defaultValue: number };

export interface BrushControllerEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly toPort: 0 | 1 | 2;
}

export interface BrushControllerGraph {
  readonly version: typeof BRUSH_GRAPH_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly BrushControllerNode[];
  readonly edges: readonly BrushControllerEdge[];
}

export interface BrushDabInputSample {
  readonly pressure: number; readonly tilt: number; readonly azimuth: number; readonly barrelRoll: number;
  readonly velocity: number; readonly strokeLength: number; readonly time: number; readonly canvasLuma: number;
}

export interface BrushEvaluatedOutputs {
  size: number; opacity: number; flow: number; scatterNormal: number; scatterTangent: number;
  hueShift: number; tempShift: number; bristleSplay: number; tipIndex: number;
}

export type BrushGraphValidationErrorCode =
  | "node-budget-exceeded" | "duplicate-node-id" | "unknown-edge-node"
  | "duplicate-input-port" | "invalid-port-for-node" | "duplicate-output-channel" | "cycle-detected";

export interface BrushGraphValidationError {
  readonly code: BrushGraphValidationErrorCode;
  readonly message: string;
  readonly nodeIds?: readonly string[];
}

export interface BrushGraphValidationResult {
  readonly ok: boolean;
  readonly errors: readonly BrushGraphValidationError[];
  readonly topoOrder: readonly string[];
}

const OP_INPUT = 0; const OP_CONST = 1; const OP_CURVE = 2; const OP_MATH = 3; const OP_NOISE = 4;
const OP_CLAMP = 5; const OP_MIX = 6; const OP_BRANCH = 7; const OP_STEP = 8; const OP_OUTPUT = 9;

const INPUT_CHANNEL_INDEX: Record<BrushInputChannel, number> = {
  pressure: 0, tilt: 1, azimuth: 2, barrelRoll: 3, velocity: 4, strokeLength: 5, time: 6, canvasLuma: 7,
};
const OUTPUT_CHANNEL_INDEX: Record<BrushOutputChannel, number> = {
  size: 0, opacity: 1, flow: 2, scatterNormal: 3, scatterTangent: 4, hueShift: 5, tempShift: 6, bristleSplay: 7, tipIndex: 8,
};
const MATH_OP_CODE: Record<BrushMathOp, number> = {
  add: 0, sub: 1, mul: 2, div: 3, pow: 4, mod: 5, abs: 6, sin: 7, cos: 8, sqrt: 9, min: 10, max: 11, invert: 12,
};
const NOISE_KIND_CODE: Record<BrushNoiseKind, number> = { perlin: 0, simplex: 1, curl: 2 };
const MAX_PORTS_BY_KIND: Record<BrushControllerNode["kind"], number> = {
  input: 0, constant: 0, remapCurve: 1, math: 2, noise: 2, clamp: 1, mix: 3, branch: 3, step: 1, output: 1,
};

const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

function hash2dGrad(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function perlin2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = x - ix; const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dot = (gx: number, gy: number, dx: number, dy: number): number => {
    const a = hash2dGrad(gx, gy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const nx0 = dot(ix, iy, fx, fy) + (dot(ix + 1, iy, fx - 1, fy) - dot(ix, iy, fx, fy)) * ux;
  const nx1 = dot(ix, iy + 1, fx, fy - 1) + (dot(ix + 1, iy + 1, fx - 1, fy - 1) - dot(ix, iy + 1, fx, fy - 1)) * ux;
  return clamp(0.5 + 0.7 * (nx0 + (nx1 - nx0) * uy), 0, 1);
}

function simplexLike2d(x: number, y: number, seed: number): number {
  const s = (x + y) * 0.36602540378;
  return clamp(
    perlin2d(x + s, y + s, seed) * 0.65 +
    perlin2d((x - y) * 0.7071 + 3.1, (x + y) * 0.7071 - 1.7, seed ^ 0x9e3779b9) * 0.35,
    0, 1,
  );
}

function curlScalar2d(x: number, y: number, seed: number): number {
  const eps = 0.05;
  const dpdx = (perlin2d(x + eps, y, seed) - perlin2d(x - eps, y, seed)) / (2 * eps);
  const dpdy = (perlin2d(x, y + eps, seed) - perlin2d(x, y - eps, seed)) / (2 * eps);
  return clamp(0.5 + (dpdy - dpdx) * 0.25, 0, 1);
}

function bakeCurveLut(points: readonly BrushCurvePoint[], dst: Float32Array, offset: number): void {
  const sorted = points.length >= 2 ? [...points].sort((a, b) => a.x - b.x) : [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  for (let i = 0; i < CURVE_LUT_SIZE; i += 1) {
    const t = i / (CURVE_LUT_SIZE - 1);
    if (t <= sorted[0]!.x) { dst[offset + i] = sorted[0]!.y; continue; }
    const last = sorted[sorted.length - 1]!;
    if (t >= last.x) { dst[offset + i] = last.y; continue; }
    let seg = 0;
    while (seg < sorted.length - 2 && sorted[seg + 1]!.x < t) seg += 1;
    const p0 = sorted[seg]!;
    const p1 = sorted[seg + 1]!;
    const u = clamp((t - p0.x) / Math.max(1e-6, p1.x - p0.x), 0, 1);
    dst[offset + i] = p0.y + (p1.y - p0.y) * u * u * (3 - 2 * u);
  }
}

/** DAG 그래프의 노드 예산(<=64), 포트 정합성, 출력 중복 및 사이클을 정적 검증한다. */
export function validateBrushControllerGraph(graph: BrushControllerGraph): BrushGraphValidationResult {
  const errors: BrushGraphValidationError[] = [];
  if (graph.nodes.length > MAX_BRUSH_GRAPH_NODES) {
    errors.push({ code: "node-budget-exceeded", message: `브러시 노드 수(${graph.nodes.length})가 최대 한계(${MAX_BRUSH_GRAPH_NODES})를 초과했습니다.` });
  }

  const nodeMap = new Map<string, BrushControllerNode>();
  const outputChannels = new Set<BrushOutputChannel>();
  for (const node of graph.nodes) {
    if (nodeMap.has(node.id)) {
      errors.push({ code: "duplicate-node-id", message: `중복된 노드 ID: ${node.id}`, nodeIds: [node.id] });
    } else {
      nodeMap.set(node.id, node);
    }
    if (node.kind === "output") {
      if (outputChannels.has(node.channel)) {
        errors.push({ code: "duplicate-output-channel", message: `중복된 출력 채널: ${node.channel}`, nodeIds: [node.id] });
      }
      outputChannels.add(node.channel);
    }
  }

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodeMap.keys()) { inDegree.set(id, 0); adj.set(id, []); }

  const usedPorts = new Set<string>();
  for (const edge of graph.edges) {
    const src = nodeMap.get(edge.fromNodeId);
    const dst = nodeMap.get(edge.toNodeId);
    if (!src || !dst) {
      errors.push({ code: "unknown-edge-node", message: `존재하지 않는 노드 참조: ${edge.fromNodeId} -> ${edge.toNodeId}`, nodeIds: [edge.fromNodeId, edge.toNodeId] });
      continue;
    }
    if (edge.toPort < 0 || edge.toPort >= MAX_PORTS_BY_KIND[dst.kind]) {
      errors.push({ code: "invalid-port-for-node", message: `노드 ${dst.id}(${dst.kind})의 소켓 ${edge.toPort} 미지원`, nodeIds: [dst.id] });
      continue;
    }
    const portKey = `${dst.id}:${edge.toPort}`;
    if (usedPorts.has(portKey)) {
      errors.push({ code: "duplicate-input-port", message: `노드 ${dst.id} 소켓 ${edge.toPort} 중복 연결`, nodeIds: [dst.id] });
      continue;
    }
    usedPorts.add(portKey);
    adj.get(src.id)!.push(dst.id);
    inDegree.set(dst.id, (inDegree.get(dst.id) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const node of graph.nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0 && nodeMap.get(node.id) === node) queue.push(node.id);
  }
  const topoOrder: string[] = [];
  for (let head = 0; head < queue.length; head += 1) {
    const curr = queue[head]!;
    topoOrder.push(curr);
    for (const next of adj.get(curr) ?? []) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) queue.push(next);
    }
  }
  if (topoOrder.length < nodeMap.size) {
    const cycleIds = [...inDegree.entries()].filter(([, d]) => d > 0).map(([id]) => id);
    errors.push({ code: "cycle-detected", message: `순환 참조(사이클) 감지: ${cycleIds.join(", ")}`, nodeIds: cycleIds });
  }
  return { ok: errors.length === 0, errors, topoOrder };
}

export function createDefaultBrushOutputs(): BrushEvaluatedOutputs {
  return { size: 1, opacity: 1, flow: 1, scatterNormal: 0, scatterTangent: 0, hueShift: 0, tempShift: 0, bristleSplay: 0, tipIndex: 0 };
}

/** 컴파일된 무할당 브러시 DAG 실행기. */
export class CompiledBrushControllerGraph {
  readonly instructionCount: number;
  readonly topoOrder: readonly string[];
  private readonly opcodes: Uint8Array;
  private readonly subcodes: Uint8Array;
  private readonly inReg0: Int16Array;
  private readonly inReg1: Int16Array;
  private readonly inReg2: Int16Array;
  private readonly param0: Float32Array;
  private readonly param1: Float32Array;
  private readonly curveLuts: Float32Array;
  private readonly registers: Float32Array;
  private readonly outputRegMap: Int16Array;
  private readonly outputDefaults: Float32Array;
  private readonly inputScratch = new Float32Array(8);

  constructor(
    topoOrder: readonly string[], opcodes: Uint8Array, subcodes: Uint8Array,
    inReg0: Int16Array, inReg1: Int16Array, inReg2: Int16Array,
    param0: Float32Array, param1: Float32Array, curveLuts: Float32Array,
    outputRegMap: Int16Array, outputDefaults: Float32Array,
  ) {
    this.topoOrder = topoOrder;
    this.instructionCount = opcodes.length;
    this.opcodes = opcodes; this.subcodes = subcodes;
    this.inReg0 = inReg0; this.inReg1 = inReg1; this.inReg2 = inReg2;
    this.param0 = param0; this.param1 = param1; this.curveLuts = curveLuts;
    this.registers = new Float32Array(Math.max(1, opcodes.length));
    this.outputRegMap = outputRegMap; this.outputDefaults = outputDefaults;
  }

  /** 호출자 소유 객체(out)에 직접 기록하는 무할당(Zero-Allocation) 평가 루프. */
  evaluateInto(sample: BrushDabInputSample, out: BrushEvaluatedOutputs): BrushEvaluatedOutputs {
    const ins = this.inputScratch;
    ins[0] = sample.pressure; ins[1] = sample.tilt; ins[2] = sample.azimuth; ins[3] = sample.barrelRoll;
    ins[4] = sample.velocity; ins[5] = sample.strokeLength; ins[6] = sample.time; ins[7] = sample.canvasLuma;

    const regs = this.registers;
    for (let i = 0; i < this.instructionCount; i += 1) {
      const op = this.opcodes[i]!;
      const sub = this.subcodes[i]!;
      const r0 = this.inReg0[i]!;
      const r1 = this.inReg1[i]!;
      const r2 = this.inReg2[i]!;
      const a = r0 >= 0 ? regs[r0]! : 0;
      const b = r1 >= 0 ? regs[r1]! : this.param0[i]!;
      let val = 0;

      if (op === OP_INPUT) val = ins[sub]!;
      else if (op === OP_CONST) val = this.param0[i]!;
      else if (op === OP_CURVE) {
        const t = clamp(a, 0, 1) * (CURVE_LUT_SIZE - 1);
        const i0 = Math.floor(t);
        const i1 = i0 < CURVE_LUT_SIZE - 1 ? i0 + 1 : i0;
        const base = sub * CURVE_LUT_SIZE;
        val = this.curveLuts[base + i0]! + (this.curveLuts[base + i1]! - this.curveLuts[base + i0]!) * (t - i0);
      } else if (op === OP_MATH) {
        if (sub === 0) val = a + b;
        else if (sub === 1) val = a - b;
        else if (sub === 2) val = a * b;
        else if (sub === 3) val = Math.abs(b) > 1e-6 ? a / b : 0;
        else if (sub === 4) val = Math.pow(Math.max(0, a), b);
        else if (sub === 5) val = Math.abs(b) > 1e-6 ? ((a % b) + b) % b : 0;
        else if (sub === 6) val = Math.abs(a);
        else if (sub === 7) val = Math.sin(a);
        else if (sub === 8) val = Math.cos(a);
        else if (sub === 9) val = Math.sqrt(Math.max(0, a));
        else if (sub === 10) val = a < b ? a : b;
        else if (sub === 11) val = a > b ? a : b;
        else val = 1 - a;
      } else if (op === OP_NOISE) {
        const freq = this.param0[i]!;
        const seed = this.param1[i]! | 0;
        const nx = a * freq;
        const ny = (r1 >= 0 ? regs[r1]! : 0) * freq;
        val = sub === 0 ? perlin2d(nx, ny, seed) : sub === 1 ? simplexLike2d(nx, ny, seed) : curlScalar2d(nx, ny, seed);
      } else if (op === OP_CLAMP) val = clamp(a, this.param0[i]!, this.param1[i]!);
      else if (op === OP_MIX) {
        const t = clamp(r2 >= 0 ? regs[r2]! : this.param0[i]!, 0, 1);
        val = a + ((r1 >= 0 ? regs[r1]! : 1) - a) * t;
      } else if (op === OP_BRANCH) {
        val = a >= this.param0[i]! ? (r1 >= 0 ? regs[r1]! : 1) : (r2 >= 0 ? regs[r2]! : 0);
      } else if (op === OP_STEP) {
        const e0 = this.param0[i]!; const e1 = this.param1[i]!;
        if (sub === 0) val = a >= e0 ? 1 : 0;
        else { const s = clamp((a - e0) / Math.max(1e-6, e1 - e0), 0, 1); val = s * s * (3 - 2 * s); }
      } else if (op === OP_OUTPUT) val = r0 >= 0 ? regs[r0]! : this.param0[i]!;

      regs[i] = Number.isFinite(val) ? val : 0;
    }

    const om = this.outputRegMap; const od = this.outputDefaults;
    out.size = om[0]! >= 0 ? regs[om[0]!]! : od[0]!;
    out.opacity = om[1]! >= 0 ? regs[om[1]!]! : od[1]!;
    out.flow = om[2]! >= 0 ? regs[om[2]!]! : od[2]!;
    out.scatterNormal = om[3]! >= 0 ? regs[om[3]!]! : od[3]!;
    out.scatterTangent = om[4]! >= 0 ? regs[om[4]!]! : od[4]!;
    out.hueShift = om[5]! >= 0 ? regs[om[5]!]! : od[5]!;
    out.tempShift = om[6]! >= 0 ? regs[om[6]!]! : od[6]!;
    out.bristleSplay = om[7]! >= 0 ? regs[om[7]!]! : od[7]!;
    out.tipIndex = om[8]! >= 0 ? regs[om[8]!]! : od[8]!;
    return out;
  }
}

/** 검증을 통과한 브러시 DAG를 무할당 TypedArray 실행기로 컴파일한다. */
export function compileBrushControllerGraph(graph: BrushControllerGraph): CompiledBrushControllerGraph {
  const validation = validateBrushControllerGraph(graph);
  if (!validation.ok) throw new Error(`[${validation.errors[0]!.code}] ${validation.errors[0]!.message}`);

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const regById = new Map(validation.topoOrder.map((id, idx) => [id, idx]));
  const incoming = new Map<string, [number, number, number]>(validation.topoOrder.map((id) => [id, [-1, -1, -1]]));
  for (const edge of graph.edges) {
    const slots = incoming.get(edge.toNodeId);
    const srcReg = regById.get(edge.fromNodeId);
    if (slots && srcReg !== undefined) slots[edge.toPort] = srcReg;
  }

  const count = validation.topoOrder.length;
  const opcodes = new Uint8Array(count);
  const subcodes = new Uint8Array(count);
  const inReg0 = new Int16Array(count);
  const inReg1 = new Int16Array(count);
  const inReg2 = new Int16Array(count);
  const param0 = new Float32Array(count);
  const param1 = new Float32Array(count);
  const curveCount = validation.topoOrder.filter((id) => nodeById.get(id)!.kind === "remapCurve").length;
  const curveLuts = new Float32Array(Math.max(1, curveCount) * CURVE_LUT_SIZE);
  let curveSlot = 0;

  const outputRegMap = new Int16Array(9).fill(-1);
  const outputDefaults = new Float32Array([1, 1, 1, 0, 0, 0, 0, 0, 0]);

  for (let i = 0; i < count; i += 1) {
    const id = validation.topoOrder[i]!;
    const node = nodeById.get(id)!;
    const slots = incoming.get(id)!;
    inReg0[i] = slots[0]; inReg1[i] = slots[1]; inReg2[i] = slots[2];
    switch (node.kind) {
      case "input": opcodes[i] = OP_INPUT; subcodes[i] = INPUT_CHANNEL_INDEX[node.channel]; break;
      case "constant": opcodes[i] = OP_CONST; param0[i] = node.value; break;
      case "remapCurve":
        opcodes[i] = OP_CURVE; subcodes[i] = curveSlot;
        bakeCurveLut(node.points, curveLuts, curveSlot * CURVE_LUT_SIZE);
        curveSlot += 1;
        break;
      case "math": opcodes[i] = OP_MATH; subcodes[i] = MATH_OP_CODE[node.op]; param0[i] = node.fallbackB ?? 0; break;
      case "noise": opcodes[i] = OP_NOISE; subcodes[i] = NOISE_KIND_CODE[node.noiseKind]; param0[i] = node.frequency; param1[i] = node.seed; break;
      case "clamp": opcodes[i] = OP_CLAMP; param0[i] = node.min; param1[i] = node.max; break;
      case "mix": opcodes[i] = OP_MIX; param0[i] = node.fallbackT ?? 0.5; break;
      case "branch": opcodes[i] = OP_BRANCH; param0[i] = node.threshold; break;
      case "step": opcodes[i] = OP_STEP; subcodes[i] = node.smooth ? 1 : 0; param0[i] = node.edge0; param1[i] = node.edge1; break;
      case "output": {
        const chIdx = OUTPUT_CHANNEL_INDEX[node.channel];
        opcodes[i] = OP_OUTPUT; subcodes[i] = chIdx; param0[i] = node.defaultValue;
        outputRegMap[chIdx] = i; outputDefaults[chIdx] = node.defaultValue;
        break;
      }
    }
  }
  return new CompiledBrushControllerGraph(
    validation.topoOrder, opcodes, subcodes, inReg0, inReg1, inReg2, param0, param1, curveLuts, outputRegMap, outputDefaults,
  );
}

/** 검증된 브러시 컨트롤러 그래프를 WebGPU용 WGSL 평가 함수 코드로 방출한다. */
export function emitBrushControllerWgsl(graph: BrushControllerGraph): string {
  const validation = validateBrushControllerGraph(graph);
  if (!validation.ok) throw new Error(`WGSL 생성 실패: ${validation.errors[0]!.message}`);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const regById = new Map(validation.topoOrder.map((id, idx) => [id, `r${idx}`]));
  const incoming = new Map<string, [string | null, string | null, string | null]>(validation.topoOrder.map((id) => [id, [null, null, null]]));
  for (const edge of graph.edges) {
    const slots = incoming.get(edge.toNodeId);
    const src = regById.get(edge.fromNodeId);
    if (slots && src) slots[edge.toPort] = src;
  }

  const lines: string[] = [
    "fn eval_brush_controller(in_dab: BrushDabInput) -> BrushDabOutput {",
    "  var out_dab: BrushDabOutput;",
    "  out_dab.size = 1.0; out_dab.opacity = 1.0; out_dab.flow = 1.0;",
  ];
  for (const id of validation.topoOrder) {
    const node = nodeById.get(id)!;
    const r = regById.get(id)!;
    const [a, b, c] = incoming.get(id)!;
    const ra = a ?? "0.0";
    if (node.kind === "input") lines.push(`  let ${r}: f32 = in_dab.${node.channel};`);
    else if (node.kind === "constant") lines.push(`  let ${r}: f32 = ${node.value.toFixed(6)};`);
    else if (node.kind === "clamp") lines.push(`  let ${r}: f32 = clamp(${ra}, ${node.min.toFixed(6)}, ${node.max.toFixed(6)});`);
    else if (node.kind === "mix") lines.push(`  let ${r}: f32 = mix(${ra}, ${b ?? "1.0"}, clamp(${c ?? (node.fallbackT ?? 0.5).toFixed(6)}, 0.0, 1.0));`);
    else if (node.kind === "branch") lines.push(`  let ${r}: f32 = select(${c ?? "0.0"}, ${b ?? "1.0"}, ${ra} >= ${node.threshold.toFixed(6)});`);
    else if (node.kind === "step") lines.push(`  let ${r}: f32 = ${node.smooth ? `smoothstep(${node.edge0.toFixed(6)}, ${node.edge1.toFixed(6)}, ${ra})` : `step(${node.edge0.toFixed(6)}, ${ra})`};`);
    else if (node.kind === "noise") lines.push(`  let ${r}: f32 = brush_noise_${node.noiseKind}(vec2<f32>(${ra}, ${b ?? "0.0"}) * ${node.frequency.toFixed(4)}, ${Math.floor(node.seed)}u);`);
    else if (node.kind === "remapCurve") lines.push(`  let ${r}: f32 = smoothstep(0.0, 1.0, clamp(${ra}, 0.0, 1.0));`);
    else if (node.kind === "math") {
      const rb = b ?? (node.fallbackB ?? 0).toFixed(6);
      const exprMap: Record<BrushMathOp, string> = {
        add: `${ra} + ${rb}`, sub: `${ra} - ${rb}`, mul: `${ra} * ${rb}`,
        div: `select(0.0, ${ra} / ${rb}, abs(${rb}) > 1e-6)`, pow: `pow(max(${ra}, 0.0), ${rb})`,
        mod: `(${ra} % max(abs(${rb}), 1e-6))`, abs: `abs(${ra})`, sin: `sin(${ra})`,
        cos: `cos(${ra})`, sqrt: `sqrt(max(${ra}, 0.0))`, min: `min(${ra}, ${rb})`,
        max: `max(${ra}, ${rb})`, invert: `1.0 - ${ra}`,
      };
      lines.push(`  let ${r}: f32 = ${exprMap[node.op]};`);
    } else if (node.kind === "output") {
      lines.push(`  out_dab.${node.channel} = ${a ?? node.defaultValue.toFixed(6)};`);
    }
  }
  lines.push("  return out_dab;", "}");
  return lines.join("\n");
}

/** 웹툰 펜/수채 기본 브러시 컨트롤러 프리셋 그래프를 생성한다. */
export function createInkVelocityBrushGraphPreset(): BrushControllerGraph {
  return {
    version: BRUSH_GRAPH_SCHEMA_VERSION,
    id: "preset-ink-velocity-gpen",
    name: "필압-속도 감응 G펜 컨트롤러",
    nodes: [
      { id: "in-p", kind: "input", channel: "pressure" },
      { id: "in-v", kind: "input", channel: "velocity" },
      { id: "in-len", kind: "input", channel: "strokeLength" },
      { id: "curve-p", kind: "remapCurve", points: [{ x: 0, y: 0.12 }, { x: 0.5, y: 0.65 }, { x: 1, y: 1.0 }] },
      { id: "inv-v", kind: "math", op: "invert" },
      { id: "clamp-v", kind: "clamp", min: 0.35, max: 1.0 },
      { id: "mul-size", kind: "math", op: "mul" },
      { id: "noise-splay", kind: "noise", noiseKind: "curl", frequency: 2.5, seed: 42 },
      { id: "out-size", kind: "output", channel: "size", defaultValue: 1 },
      { id: "out-splay", kind: "output", channel: "bristleSplay", defaultValue: 0 },
    ],
    edges: [
      { fromNodeId: "in-p", toNodeId: "curve-p", toPort: 0 },
      { fromNodeId: "in-v", toNodeId: "inv-v", toPort: 0 },
      { fromNodeId: "inv-v", toNodeId: "clamp-v", toPort: 0 },
      { fromNodeId: "curve-p", toNodeId: "mul-size", toPort: 0 },
      { fromNodeId: "clamp-v", toNodeId: "mul-size", toPort: 1 },
      { fromNodeId: "mul-size", toNodeId: "out-size", toPort: 0 },
      { fromNodeId: "in-len", toNodeId: "noise-splay", toPort: 0 },
      { fromNodeId: "in-p", toNodeId: "noise-splay", toPort: 1 },
      { fromNodeId: "noise-splay", toNodeId: "out-splay", toPort: 0 },
    ],
  };
}
