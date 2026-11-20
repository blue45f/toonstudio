/**
 * Toon Boom Harmony / OpenToonz / Cacani 클린룸 비파괴 FX 합성 노드 스케매틱(조명·그림자 분기 ·
 * 인덱스 팔레트 스타일 링크) & 벡터 특징점 가이드 자동 동화(Auto-Inbetween) 엔진.
 */

export interface RgbaColor { readonly r: number; readonly g: number; readonly b: number; readonly a: number; }
export interface FxImageBuffer { readonly width: number; readonly height: number; readonly data: Float32Array; readonly zDepth?: number; }
export interface IndexedPaletteTable { readonly activeMoodId: string; readonly moods: Readonly<Record<string, Readonly<Record<string, RgbaColor>>>>; }
export type FxCompositeBlendMode = "over" | "multiply" | "screen" | "add";

export type FxNodeSpec =
  | { readonly id: string; readonly kind: "LayerSource"; readonly layerId: string; readonly zDepth?: number }
  | { readonly id: string; readonly kind: "Composite"; readonly baseNodeId: string; readonly overlayNodeId: string; readonly blendMode: FxCompositeBlendMode; readonly opacity: number }
  | { readonly id: string; readonly kind: "RimLightFromAlpha"; readonly inputNodeId: string; readonly lightDirX: number; readonly lightDirY: number; readonly widthPx: number; readonly intensity: number; readonly color: RgbaColor; readonly paletteStyleId?: string }
  | { readonly id: string; readonly kind: "CastShadowSkew"; readonly inputNodeId: string; readonly skewX: number; readonly scaleY: number; readonly offsetX: number; readonly offsetY: number; readonly opacity: number; readonly color: RgbaColor; readonly paletteStyleId?: string }
  | { readonly id: string; readonly kind: "DepthFogByZ"; readonly inputNodeId: string; readonly nearZ: number; readonly farZ: number; readonly density: number; readonly fogColor: RgbaColor; readonly paletteStyleId?: string; readonly overrideZDepth?: number }
  | { readonly id: string; readonly kind: "BloomGlow"; readonly inputNodeId: string; readonly threshold: number; readonly radiusPx: number; readonly intensity: number }
  | { readonly id: string; readonly kind: "ToneCurve"; readonly inputNodeId: string; readonly gamma: number; readonly contrast: number; readonly lift: number }
  | { readonly id: string; readonly kind: "HalftoneMatte"; readonly inputNodeId: string; readonly cellSizePx: number; readonly angleDeg: number; readonly inkColor: RgbaColor; readonly paletteStyleId?: string }
  | { readonly id: string; readonly kind: "ColorOverride"; readonly inputNodeId: string; readonly paletteStyleId: string; readonly strength: number; readonly fallbackColor: RgbaColor }
  | { readonly id: string; readonly kind: "Output"; readonly inputNodeId: string };

export interface FxSchematicGraph { readonly id: string; readonly nodes: readonly FxNodeSpec[]; }
export interface FxSchematicValidationResult { readonly valid: boolean; readonly errors: readonly string[]; readonly topologicalOrder: readonly string[]; }
export interface FxEvaluationResult {
  readonly outputNodeId: string; readonly outputBuffer: FxImageBuffer;
  readonly evaluationOrder: readonly string[]; readonly evaluatedCountByNode: Readonly<Record<string, number>>;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

/** 정규화 RGBA 버퍼(`0..1`)를 생성한다. */
export function createFxImageBuffer(width: number, height: number, fill?: RgbaColor, zDepth?: number): FxImageBuffer {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const data = new Float32Array(w * h * 4);
  if (fill) {
    const r = clamp01(fill.r);
    const g = clamp01(fill.g);
    const b = clamp01(fill.b);
    const a = clamp01(fill.a);
    for (let i = 0; i < w * h; i += 1) {
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }
  return { width: w, height: h, data, ...(zDepth !== undefined ? { zDepth } : {}) };
}

function getNodeDependencies(node: FxNodeSpec): readonly string[] {
  if (node.kind === "LayerSource") return [];
  if (node.kind === "Composite") return [node.baseNodeId, node.overlayNodeId];
  return [node.inputNodeId];
}

/** Kahn 위상정렬로 FX 스케매틱 DAG의 순환·누락 참조·Output 노드를 검증한다. */
export function validateFxSchematicGraph(graph: FxSchematicGraph): FxSchematicValidationResult {
  const byId = new Map<string, FxNodeSpec>();
  const errors: string[] = [];
  for (const node of graph.nodes) {
    if (byId.has(node.id)) errors.push(`중복된 FX 노드 ID: ${node.id}`);
    byId.set(node.id, node);
  }
  const inDegree = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const dependents = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const node of graph.nodes) {
    for (const depId of new Set(getNodeDependencies(node))) {
      if (!byId.has(depId)) { errors.push(`존재하지 않는 입력 노드 참조: ${node.id} -> ${depId}`); continue; }
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      dependents.get(depId)?.push(node.id);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) if (deg === 0) queue.push(id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    order.push(id);
    for (const nextId of dependents.get(id) ?? []) {
      const nextDeg = (inDegree.get(nextId) ?? 1) - 1;
      inDegree.set(nextId, nextDeg);
      if (nextDeg === 0) queue.push(nextId);
    }
  }
  if (order.length !== byId.size) errors.push("FX 노드 스케매틱에서 순환 의존성(Cycle)이 감지되었습니다.");
  if (!graph.nodes.some((n) => n.kind === "Output")) errors.push("최소 1개의 Output 노드가 필요합니다.");
  return { valid: errors.length === 0, errors, topologicalOrder: order };
}

/** OpenToonz식 인덱스 팔레트 테이블에서 현재 활성 무드 색상을 조회한다. */
export function resolveIndexedPaletteColor(
  palette: IndexedPaletteTable | undefined,
  styleId: string | undefined,
  fallback: RgbaColor,
): RgbaColor {
  if (!palette || !styleId) return fallback;
  return palette.moods[palette.activeMoodId]?.[styleId] ?? fallback;
}

function sampleAlphaClamped(buf: FxImageBuffer, x: number, y: number): number {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= buf.width || iy >= buf.height) return 0;
  return buf.data[(iy * buf.width + ix) * 4 + 3] ?? 0;
}

function evalComposite(base: FxImageBuffer, overlay: FxImageBuffer, blendMode: FxCompositeBlendMode, opacity: number): FxImageBuffer {
  const out = createFxImageBuffer(base.width, base.height, undefined, base.zDepth);
  const op = clamp01(opacity);
  for (let i = 0; i < base.width * base.height; i += 1) {
    const o = i * 4;
    const br = base.data[o] ?? 0;
    const bg = base.data[o + 1] ?? 0;
    const bb = base.data[o + 2] ?? 0;
    const ba = base.data[o + 3] ?? 0;
    const sr = overlay.data[o] ?? 0;
    const sg = overlay.data[o + 1] ?? 0;
    const sb = overlay.data[o + 2] ?? 0;
    const sa = clamp01((overlay.data[o + 3] ?? 0) * op);
    let cr = sr;
    let cg = sg;
    let cb = sb;
    if (blendMode === "multiply") { cr = br * sr; cg = bg * sg; cb = bb * sb; }
    else if (blendMode === "screen") { cr = 1 - (1 - br) * (1 - sr); cg = 1 - (1 - bg) * (1 - sg); cb = 1 - (1 - bb) * (1 - sb); }
    else if (blendMode === "add") { cr = clamp01(br + sr); cg = clamp01(bg + sg); cb = clamp01(bb + sb); }
    out.data[o] = clamp01(cr * sa + br * (1 - sa));
    out.data[o + 1] = clamp01(cg * sa + bg * (1 - sa));
    out.data[o + 2] = clamp01(cb * sa + bb * (1 - sa));
    out.data[o + 3] = clamp01(sa + ba * (1 - sa));
  }
  return out;
}

function evalRimLight(input: FxImageBuffer, dirX: number, dirY: number, widthPx: number, intensity: number, color: RgbaColor): FxImageBuffer {
  const out = createFxImageBuffer(input.width, input.height, undefined, input.zDepth);
  const len = Math.hypot(dirX, dirY);
  const nx = len > 1e-6 ? dirX / len : 1;
  const ny = len > 1e-6 ? dirY / len : 0;
  const wPx = Math.max(0.5, widthPx);
  const gain = clamp(intensity, 0, 4);
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const o = (y * input.width + x) * 4;
      const shiftedAlpha = sampleAlphaClamped(input, x - nx * wPx, y - ny * wPx);
      out.data[o] = clamp01(color.r);
      out.data[o + 1] = clamp01(color.g);
      out.data[o + 2] = clamp01(color.b);
      out.data[o + 3] = clamp01((input.data[o + 3] ?? 0) * (1 - shiftedAlpha) * gain * color.a);
    }
  }
  return out;
}

function evalCastShadow(
  input: FxImageBuffer, skewX: number, scaleY: number, offsetX: number, offsetY: number, opacity: number, color: RgbaColor,
): FxImageBuffer {
  const out = createFxImageBuffer(input.width, input.height, undefined, input.zDepth);
  const safeScaleY = Math.max(0.05, Math.abs(scaleY));
  const anchorY = input.height - 1;
  const op = clamp01(opacity * color.a);
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const srcY = anchorY + (y - offsetY - anchorY) / safeScaleY;
      const a = sampleAlphaClamped(input, x - offsetX - (srcY - anchorY) * skewX, srcY);
      if (a <= 1e-5) continue;
      const o = (y * input.width + x) * 4;
      out.data[o] = clamp01(color.r);
      out.data[o + 1] = clamp01(color.g);
      out.data[o + 2] = clamp01(color.b);
      out.data[o + 3] = clamp01(a * op);
    }
  }
  return out;
}

function boxBlurPass1D(src: Float32Array, w: number, h: number, radius: number, horizontal: boolean): Float32Array {
  const dst = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      let cnt = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const o = ((horizontal ? y : clamp(y + d, 0, h - 1)) * w + (horizontal ? clamp(x + d, 0, w - 1) : x)) * 4;
        sr += src[o] ?? 0;
        sg += src[o + 1] ?? 0;
        sb += src[o + 2] ?? 0;
        sa += src[o + 3] ?? 0;
        cnt += 1;
      }
      const dstOff = (y * w + x) * 4;
      dst[dstOff] = sr / cnt;
      dst[dstOff + 1] = sg / cnt;
      dst[dstOff + 2] = sb / cnt;
      dst[dstOff + 3] = sa / cnt;
    }
  }
  return dst;
}

function evalBloom(input: FxImageBuffer, threshold: number, radiusPx: number, intensity: number): FxImageBuffer {
  const { width: w, height: h } = input;
  const bright = new Float32Array(w * h * 4);
  const th = clamp01(threshold);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    const r = input.data[o] ?? 0;
    const g = input.data[o + 1] ?? 0;
    const b = input.data[o + 2] ?? 0;
    const a = input.data[o + 3] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma > th && a > 0) {
      const k = (luma - th) / Math.max(1e-4, 1 - th);
      bright[o] = r * k;
      bright[o + 1] = g * k;
      bright[o + 2] = b * k;
      bright[o + 3] = a * k;
    }
  }
  const rad = Math.max(1, Math.min(8, Math.round(radiusPx)));
  const blurred = boxBlurPass1D(boxBlurPass1D(bright, w, h, rad, true), w, h, rad, false);
  const out = createFxImageBuffer(w, h, undefined, input.zDepth);
  const gain = clamp(intensity, 0, 4);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    out.data[o] = clamp01((input.data[o] ?? 0) + (blurred[o] ?? 0) * gain);
    out.data[o + 1] = clamp01((input.data[o + 1] ?? 0) + (blurred[o + 1] ?? 0) * gain);
    out.data[o + 2] = clamp01((input.data[o + 2] ?? 0) + (blurred[o + 2] ?? 0) * gain);
    out.data[o + 3] = clamp01(Math.max(input.data[o + 3] ?? 0, (blurred[o + 3] ?? 0) * gain));
  }
  return out;
}

/** FX 합성 노드 스케매틱을 Kahn 위상 순서로 평가한다(다중 분기 시 소스 1회 평가 보장). */
export function evaluateFxSchematic(options: {
  readonly graph: FxSchematicGraph; readonly sources: Readonly<Record<string, FxImageBuffer>>;
  readonly width: number; readonly height: number;
  readonly palette?: IndexedPaletteTable; readonly outputNodeId?: string;
}): FxEvaluationResult {
  const validation = validateFxSchematicGraph(options.graph);
  if (!validation.valid) throw new Error(`FX 스케매틱 검증 실패: ${validation.errors.join("; ")}`);

  const nodeMap = new Map<string, FxNodeSpec>(options.graph.nodes.map((n) => [n.id, n]));
  const buffers = new Map<string, FxImageBuffer>();
  const evaluatedCountByNode: Record<string, number> = {};
  const emptyBuf = createFxImageBuffer(options.width, options.height);

  for (const nodeId of validation.topologicalOrder) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    evaluatedCountByNode[nodeId] = (evaluatedCountByNode[nodeId] ?? 0) + 1;

    switch (node.kind) {
      case "LayerSource": {
        const src = options.sources[node.layerId] ?? emptyBuf;
        const z = node.zDepth ?? src.zDepth;
        buffers.set(nodeId, { width: src.width, height: src.height, data: new Float32Array(src.data), ...(z !== undefined ? { zDepth: z } : {}) });
        break;
      }
      case "Composite":
        buffers.set(nodeId, evalComposite(buffers.get(node.baseNodeId) ?? emptyBuf, buffers.get(node.overlayNodeId) ?? emptyBuf, node.blendMode, node.opacity));
        break;
      case "RimLightFromAlpha":
        buffers.set(nodeId, evalRimLight(buffers.get(node.inputNodeId) ?? emptyBuf, node.lightDirX, node.lightDirY, node.widthPx, node.intensity, resolveIndexedPaletteColor(options.palette, node.paletteStyleId, node.color)));
        break;
      case "CastShadowSkew":
        buffers.set(nodeId, evalCastShadow(buffers.get(node.inputNodeId) ?? emptyBuf, node.skewX, node.scaleY, node.offsetX, node.offsetY, node.opacity, resolveIndexedPaletteColor(options.palette, node.paletteStyleId, node.color)));
        break;
      case "DepthFogByZ": {
        const input = buffers.get(node.inputNodeId) ?? emptyBuf;
        const col = resolveIndexedPaletteColor(options.palette, node.paletteStyleId, node.fogColor);
        const z = node.overrideZDepth ?? input.zDepth ?? 0;
        const fogT = clamp01((Math.abs(z - node.nearZ) / Math.max(1e-4, Math.abs(node.farZ - node.nearZ))) * clamp01(node.density));
        const out = createFxImageBuffer(input.width, input.height, undefined, z);
        for (let i = 0; i < input.width * input.height; i += 1) {
          const o = i * 4;
          out.data[o] = clamp01((input.data[o] ?? 0) * (1 - fogT) + col.r * fogT);
          out.data[o + 1] = clamp01((input.data[o + 1] ?? 0) * (1 - fogT) + col.g * fogT);
          out.data[o + 2] = clamp01((input.data[o + 2] ?? 0) * (1 - fogT) + col.b * fogT);
          out.data[o + 3] = input.data[o + 3] ?? 0;
        }
        buffers.set(nodeId, out);
        break;
      }
      case "BloomGlow":
        buffers.set(nodeId, evalBloom(buffers.get(node.inputNodeId) ?? emptyBuf, node.threshold, node.radiusPx, node.intensity));
        break;
      case "ToneCurve": {
        const input = buffers.get(node.inputNodeId) ?? emptyBuf;
        const out = createFxImageBuffer(input.width, input.height, undefined, input.zDepth);
        const invGamma = 1 / clamp(node.gamma, 0.1, 5);
        const contrast = clamp(node.contrast, 0, 3);
        const lift = clamp(node.lift, -0.5, 0.5);
        for (let i = 0; i < input.width * input.height; i += 1) {
          const o = i * 4;
          for (let c = 0; c < 3; c += 1) out.data[o + c] = clamp01((Math.pow(clamp01(input.data[o + c] ?? 0), invGamma) - 0.5) * contrast + 0.5 + lift);
          out.data[o + 3] = input.data[o + 3] ?? 0;
        }
        buffers.set(nodeId, out);
        break;
      }
      case "HalftoneMatte": {
        const input = buffers.get(node.inputNodeId) ?? emptyBuf;
        const ink = resolveIndexedPaletteColor(options.palette, node.paletteStyleId, node.inkColor);
        const out = createFxImageBuffer(input.width, input.height, undefined, input.zDepth);
        const cell = Math.max(2, node.cellSizePx);
        const rad = (node.angleDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        for (let y = 0; y < input.height; y += 1) {
          for (let x = 0; x < input.width; x += 1) {
            const o = (y * input.width + x) * 4;
            const luma = 0.2126 * (input.data[o] ?? 0) + 0.7152 * (input.data[o + 1] ?? 0) + 0.0722 * (input.data[o + 2] ?? 0);
            const rx = (x * cos - y * sin) / cell;
            const ry = (x * sin + y * cos) / cell;
            const inside = Math.hypot(rx - Math.floor(rx) - 0.5, ry - Math.floor(ry) - 0.5) <= (1 - luma) * 0.52 ? 1 : 0;
            out.data[o] = ink.r;
            out.data[o + 1] = ink.g;
            out.data[o + 2] = ink.b;
            out.data[o + 3] = clamp01((input.data[o + 3] ?? 0) * inside * ink.a);
          }
        }
        buffers.set(nodeId, out);
        break;
      }
      case "ColorOverride": {
        const input = buffers.get(node.inputNodeId) ?? emptyBuf;
        const target = resolveIndexedPaletteColor(options.palette, node.paletteStyleId, node.fallbackColor);
        const strength = clamp01(node.strength);
        const out = createFxImageBuffer(input.width, input.height, undefined, input.zDepth);
        for (let i = 0; i < input.width * input.height; i += 1) {
          const o = i * 4;
          out.data[o] = clamp01((input.data[o] ?? 0) * (1 - strength) + target.r * strength);
          out.data[o + 1] = clamp01((input.data[o + 1] ?? 0) * (1 - strength) + target.g * strength);
          out.data[o + 2] = clamp01((input.data[o + 2] ?? 0) * (1 - strength) + target.b * strength);
          out.data[o + 3] = input.data[o + 3] ?? 0;
        }
        buffers.set(nodeId, out);
        break;
      }
      case "Output":
        buffers.set(nodeId, buffers.get(node.inputNodeId) ?? emptyBuf);
        break;
    }
  }

  const targetOutNode = (options.outputNodeId ? nodeMap.get(options.outputNodeId) : undefined) ?? options.graph.nodes.find((n) => n.kind === "Output");
  const resolvedOutId = targetOutNode?.id ?? "";
  return { outputNodeId: resolvedOutId, outputBuffer: buffers.get(resolvedOutId) ?? emptyBuf, evaluationOrder: validation.topologicalOrder, evaluatedCountByNode };
}

// ── Cacani 벡터 특징점 가이드 자동 동화(Auto-Inbetween) ──────────────────────

export interface VectorStrokePoint { readonly x: number; readonly y: number; readonly width: number; }
export interface VectorStrokePath {
  readonly id: string; readonly strokeOrder: number; readonly paletteStyleId?: string;
  readonly points: readonly VectorStrokePoint[]; readonly closed?: boolean;
}
export interface VectorKeyframeDrawing { readonly frameIndex: number; readonly strokes: readonly VectorStrokePath[]; }
export interface VectorInbetweenGuidePin { readonly strokeIdA: string; readonly strokeIdB: string; readonly tA: number; readonly tB: number; }
export interface VectorAutoInbetweenOptions {
  readonly ratios?: readonly number[]; readonly inbetweenCount?: number;
  readonly cornerAngleThresholdDeg?: number; readonly sampleCount?: number;
  readonly autoCloseGapPx?: number; readonly guidePins?: readonly VectorInbetweenGuidePin[];
}
export interface GeneratedInbetweenFrame { readonly ratio: number; readonly strokes: readonly VectorStrokePath[]; }

function computeCumulativeArcLengths(points: readonly VectorStrokePoint[]): readonly number[] {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    cum.push((cum[i - 1] ?? 0) + (p0 && p1 ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : 0));
  }
  return cum;
}

/** 정규화 호길이 `t ∈ [0, 1]`에서 스트로크 점과 가변 선폭을 보간한다. */
export function sampleVectorStrokeAtT(points: readonly VectorStrokePoint[], tRaw: number): VectorStrokePoint {
  if (points.length === 0) return { x: 0, y: 0, width: 1 };
  if (points.length === 1) return points[0] ?? { x: 0, y: 0, width: 1 };
  const cum = computeCumulativeArcLengths(points);
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 1e-6) return points[0] ?? { x: 0, y: 0, width: 1 };
  const targetLen = clamp01(tRaw) * total;
  for (let i = 0; i < cum.length - 1; i += 1) {
    const l0 = cum[i] ?? 0;
    const l1 = cum[i + 1] ?? l0;
    if (targetLen >= l0 && targetLen <= l1) {
      const frac = l1 - l0 > 1e-6 ? (targetLen - l0) / (l1 - l0) : 0;
      const a = points[i] ?? { x: 0, y: 0, width: 1 };
      const b = points[i + 1] ?? a;
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, width: a.width + (b.width - a.width) * frac };
    }
  }
  return points[points.length - 1] ?? { x: 0, y: 0, width: 1 };
}

/** 스트로크의 코너·급격한 곡률 특징점 정규화 호길이 `t ∈ (0, 1)` 목록을 검출한다. */
export function detectVectorFeaturePoints(points: readonly VectorStrokePoint[], angleThresholdDeg = 32): readonly number[] {
  if (points.length < 3) return [];
  const cum = computeCumulativeArcLengths(points);
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 1e-6) return [];
  const features: number[] = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (!prev || !cur || !next) continue;
    const v1x = cur.x - prev.x;
    const v1y = cur.y - prev.y;
    const v2x = next.x - cur.x;
    const v2y = next.y - cur.y;
    const denom = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (denom <= 1e-6) continue;
    if ((Math.acos(clamp((v1x * v2x + v1y * v2y) / denom, -1, 1)) * 180) / Math.PI >= angleThresholdDeg) {
      features.push((cum[i] ?? 0) / total);
    }
  }
  return features;
}

/** 두 벡터 키프레임 사이의 특징점/가이드 핀 매칭 + 아크-길이 재샘플링 자동 동화 프레임을 생성한다. */
export function generateVectorAutoInbetweens(
  frameA: VectorKeyframeDrawing,
  frameB: VectorKeyframeDrawing,
  options: VectorAutoInbetweenOptions = {},
): readonly GeneratedInbetweenFrame[] {
  const count = Math.max(1, Math.min(32, Math.floor(options.inbetweenCount ?? 3)));
  const ratios: readonly number[] =
    options.ratios && options.ratios.length > 0
      ? options.ratios.map((r) => clamp01(r))
      : Array.from({ length: count }, (_, idx) => (idx + 1) / (count + 1));

  const angleThreshold = options.cornerAngleThresholdDeg ?? 32;
  const sampleCount = Math.max(4, Math.min(128, Math.floor(options.sampleCount ?? 24)));
  const autoCloseGapPx = Math.max(0, options.autoCloseGapPx ?? 0);
  const guidePins = options.guidePins ?? [];
  const sortedA = [...frameA.strokes].sort((a, b) => a.strokeOrder - b.strokeOrder);
  const sortedB = [...frameB.strokes].sort((a, b) => a.strokeOrder - b.strokeOrder);
  const strokeBById = new Map<string, VectorStrokePath>(sortedB.map((s) => [s.id, s]));

  const pairs: Array<{ readonly a: VectorStrokePath; readonly b: VectorStrokePath }> = [];
  const usedB = new Set<string>();
  for (const sA of sortedA) {
    const pinned = guidePins.find((p) => p.strokeIdA === sA.id);
    const candidateB = (pinned ? strokeBById.get(pinned.strokeIdB) : undefined) ?? strokeBById.get(sA.id) ?? sortedB.find((s) => !usedB.has(s.id));
    if (!candidateB) continue;
    usedB.add(candidateB.id);
    pairs.push({ a: sA, b: candidateB });
  }

  const prepared = pairs.map(({ a, b }) => {
    const explicitPins = guidePins.filter((p) => p.strokeIdA === a.id && p.strokeIdB === b.id).map((p) => ({ tA: clamp01(p.tA), tB: clamp01(p.tB) })).sort((p1, p2) => p1.tA - p2.tA);
    const anchors: Array<{ tA: number; tB: number }> = [{ tA: 0, tB: 0 }];
    const candidates = explicitPins.length > 0
      ? explicitPins
      : (() => {
          const fA = detectVectorFeaturePoints(a.points, angleThreshold);
          const fB = detectVectorFeaturePoints(b.points, angleThreshold);
          return Array.from({ length: Math.min(fA.length, fB.length) }, (_, k) => ({ tA: fA[k] ?? 0, tB: fB[k] ?? 0 }));
        })();
    for (const c of candidates) {
      const last = anchors[anchors.length - 1];
      if (last && c.tA > last.tA + 1e-4 && c.tB > last.tB + 1e-4 && c.tA < 1 - 1e-4 && c.tB < 1 - 1e-4) anchors.push(c);
    }
    anchors.push({ tA: 1, tB: 1 });

    const segCount = anchors.length - 1;
    const resampledA: VectorStrokePoint[] = [];
    const resampledB: VectorStrokePoint[] = [];
    for (let s = 0; s < segCount; s += 1) {
      const a0 = anchors[s];
      const a1 = anchors[s + 1];
      if (!a0 || !a1) continue;
      const segSamples = Math.max(2, Math.round(sampleCount / segCount));
      for (let k = s === 0 ? 0 : 1; k <= segSamples; k += 1) {
        const u = k / segSamples;
        resampledA.push(sampleVectorStrokeAtT(a.points, a0.tA + (a1.tA - a0.tA) * u));
        resampledB.push(sampleVectorStrokeAtT(b.points, a0.tB + (a1.tB - a0.tB) * u));
      }
    }
    return { a, b, resampledA, resampledB };
  });

  return ratios.map((ratio) => ({
    ratio,
    strokes: prepared.map(({ a, b, resampledA, resampledB }) => {
      const pts: VectorStrokePoint[] = resampledA.map((pa, idx) => {
        const pb = resampledB[idx] ?? pa;
        return { x: pa.x + (pb.x - pa.x) * ratio, y: pa.y + (pb.y - pa.y) * ratio, width: Math.max(0.1, pa.width + (pb.width - pa.width) * ratio) };
      });
      let closed = Boolean(a.closed && b.closed);
      const firstPt = pts[0];
      const lastPt = pts[pts.length - 1];
      if (!closed && autoCloseGapPx > 0 && firstPt && lastPt && pts.length >= 3 && Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y) <= autoCloseGapPx) {
        pts[pts.length - 1] = { ...firstPt, width: (firstPt.width + lastPt.width) * 0.5 };
        closed = true;
      }
      return { id: `${a.id}__inbetween_${Math.round(ratio * 1000)}`, strokeOrder: a.strokeOrder, ...(a.paletteStyleId ? { paletteStyleId: a.paletteStyleId } : {}), points: pts, closed };
    }),
  }));
}
