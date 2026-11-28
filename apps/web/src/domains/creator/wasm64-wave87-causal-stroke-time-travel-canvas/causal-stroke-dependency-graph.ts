/**
 * Wave 87: 인과 의존성 그래프 기반 시간 역행(Time-Travel) 비파괴 캔버스 DAG 모델
 *
 * 웹툰 제작 6단계(러프 골격 → 선화 → 셀 채색 → 그림자/하이라이트 → 수채 번짐 → 말풍선 꼬리)를
 * 내용 주소 기반 불변 인과 노드로 관리하고, 비순환성(DAG)·O(영향 서브그래프) 더티 전파·비파괴 시간 역행을 제공한다.
 */

export interface Point2D { readonly x: number; readonly y: number; }
export type CausalNodeKind =
  | "rough-skeleton-bone"
  | "ink-lineart-stroke"
  | "cel-fill-region"
  | "shadow-highlight-pass"
  | "fluid-wash-effect"
  | "speech-balloon-tail";

/** 부모 러프 골격 본 `(p0, p1)` 기준 로컬 좌표 `(s: 정규화 축 위치, d: 수직 오프셋 px)` */
export interface BoneLocalAnchor { readonly parentBoneId: string; readonly s: number; readonly d: number; readonly weight: number; }
export interface CubicHandlePair { readonly cp1: Point2D; readonly cp2: Point2D; }

export interface RoughSkeletonBonePayload { readonly p0: Point2D; readonly p1: Point2D; readonly jointLabel: string; readonly controlHandles?: readonly Point2D[]; }
export interface InkLineartStrokePayload { readonly points: readonly Point2D[]; readonly bezierControls?: readonly CubicHandlePair[]; readonly strokeWidth: number; readonly strokeColor: string; readonly boneAnchors?: readonly (readonly BoneLocalAnchor[])[]; }
export interface CelFillRegionPayload { readonly polygon: readonly Point2D[]; readonly fillColor: string; readonly opacity: number; readonly boneAnchors?: readonly (readonly BoneLocalAnchor[])[]; }
export interface ShadowHighlightPassPayload { readonly passMode: "cel-shadow" | "specular-highlight"; readonly polygon: readonly Point2D[]; readonly lightDirection: Point2D; readonly tintColor: string; readonly opacity: number; readonly boneAnchors?: readonly (readonly BoneLocalAnchor[])[]; }
export interface FluidWashEffectPayload { readonly bleedAnchors: readonly Point2D[]; readonly bleedRadius: number; readonly pigmentColor: string; readonly wetness: number; readonly boneAnchors?: readonly (readonly BoneLocalAnchor[])[]; }
export interface SpeechBalloonTailPayload {
  readonly balloonCenter: Point2D;
  readonly balloonRadiusX: number;
  readonly balloonRadiusY: number;
  readonly text: string;
  readonly balloonTextRotationDeg: number;
  readonly tailBaseLeft: Point2D;
  readonly tailBaseRight: Point2D;
  readonly tailTip: Point2D;
  readonly speakerBoneId: string;
  readonly mouthLocalAnchor: { readonly s: number; readonly d: number };
  readonly tailGapPx?: number;
}

interface CausalNodeBase {
  readonly id: string;
  readonly label: string;
  readonly parentIds: readonly string[];
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly layerOrder: number;
  readonly contentHash: string;
}

export interface RoughSkeletonBoneNode extends CausalNodeBase { readonly kind: "rough-skeleton-bone"; readonly payload: RoughSkeletonBonePayload; }
export interface InkLineartStrokeNode extends CausalNodeBase { readonly kind: "ink-lineart-stroke"; readonly payload: InkLineartStrokePayload; }
export interface CelFillRegionNode extends CausalNodeBase { readonly kind: "cel-fill-region"; readonly payload: CelFillRegionPayload; }
export interface ShadowHighlightPassNode extends CausalNodeBase { readonly kind: "shadow-highlight-pass"; readonly payload: ShadowHighlightPassPayload; }
export interface FluidWashEffectNode extends CausalNodeBase { readonly kind: "fluid-wash-effect"; readonly payload: FluidWashEffectPayload; }
export interface SpeechBalloonTailNode extends CausalNodeBase { readonly kind: "speech-balloon-tail"; readonly payload: SpeechBalloonTailPayload; }

export type CausalCanvasNode =
  | RoughSkeletonBoneNode
  | InkLineartStrokeNode
  | CelFillRegionNode
  | ShadowHighlightPassNode
  | FluidWashEffectNode
  | SpeechBalloonTailNode;

/** 분배형 Omit: 판별 유니온 좁히기를 유지한다. */
export type CausalNodeWithoutHash =
  | Omit<RoughSkeletonBoneNode, "contentHash">
  | Omit<InkLineartStrokeNode, "contentHash">
  | Omit<CelFillRegionNode, "contentHash">
  | Omit<ShadowHighlightPassNode, "contentHash">
  | Omit<FluidWashEffectNode, "contentHash">
  | Omit<SpeechBalloonTailNode, "contentHash">;

export type CausalNodeInput =
  | (Omit<RoughSkeletonBoneNode, "contentHash" | "updatedAtMs"> & { readonly updatedAtMs?: number })
  | (Omit<InkLineartStrokeNode, "contentHash" | "updatedAtMs"> & { readonly updatedAtMs?: number })
  | (Omit<CelFillRegionNode, "contentHash" | "updatedAtMs"> & { readonly updatedAtMs?: number })
  | (Omit<ShadowHighlightPassNode, "contentHash" | "updatedAtMs"> & { readonly updatedAtMs?: number })
  | (Omit<FluidWashEffectNode, "contentHash" | "updatedAtMs"> & { readonly updatedAtMs?: number })
  | (Omit<SpeechBalloonTailNode, "contentHash" | "updatedAtMs"> & { readonly updatedAtMs?: number });

export interface TimeTravelRevision {
  readonly revision: number;
  readonly timestampMs: number;
  readonly label: string;
  readonly editedNodeId: string | null;
  readonly affectedNodeIds: readonly string[];
  readonly stateHash: string;
  readonly nodes: ReadonlyMap<string, CausalCanvasNode>;
}

export interface HistoricalEditContext {
  readonly editedNodeId: string;
  readonly beforeEditedNode: CausalCanvasNode;
  readonly afterEditedNode: CausalCanvasNode;
  readonly beforeNodes: ReadonlyMap<string, CausalCanvasNode>;
  readonly downstreamOrder: readonly string[];
  readonly timestampMs: number;
}

export type CausalReprojectionHandler = (context: HistoricalEditContext) => ReadonlyMap<string, CausalCanvasNode>;

export interface HistoricalEditRequest {
  readonly nodeId: string;
  readonly label: string;
  readonly timestampMs: number;
  readonly sourceRevision?: number;
  readonly mutate: (currentNode: CausalCanvasNode) => CausalCanvasNode;
  readonly reproject?: CausalReprojectionHandler;
}

export interface HistoricalEditResult {
  readonly sourceRevision: number;
  readonly targetRevision: number;
  readonly editedNodeId: string;
  readonly affectedNodeIds: readonly string[];
  readonly untouchedNodeIds: readonly string[];
  readonly revision: TimeTravelRevision;
}

/** 인과 그래프 순환 의존성(cycle) 주입 시 발생하는 명시적 오류. */
export class CausalGraphCycleError extends Error {
  public readonly code = "CAUSAL_GRAPH_CYCLE" as const;
  public readonly cyclePath: readonly string[];
  public constructor(cyclePath: readonly string[]) {
    super(`인과 그래프 순환 의존성이 감지되었습니다: ${cyclePath.join(" -> ")}`);
    this.name = "CausalGraphCycleError";
    this.cyclePath = Object.freeze([...cyclePath]);
  }
}

/** 미등록 부모 또는 대상 노드 참조 시 발생하는 명시적 오류. */
export class CausalNodeNotFoundError extends Error {
  public readonly code = "CAUSAL_NODE_NOT_FOUND" as const;
  public readonly missingNodeId: string;
  public constructor(missingNodeId: string, contextLabel: string) {
    super(`노드를 찾을 수 없습니다 (${contextLabel}): ${missingNodeId}`);
    this.name = "CausalNodeNotFoundError";
    this.missingNodeId = missingNodeId;
  }
}

const EPS_LENGTH = 1e-9;

function canonicalFloat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
const canonicalPoint = (p: Point2D): Point2D => Object.freeze({ x: canonicalFloat(p.x), y: canonicalFloat(p.y) });
const canonicalPoints = (pts: readonly Point2D[]): readonly Point2D[] => Object.freeze(pts.map(canonicalPoint));

/** ES2017 호환 이중 32비트 FNV-1a 결정적 내용 해시. */
export function computeCausalContentHash(serialized: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < serialized.length; i += 1) {
    const code = serialized.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((code + (i & 0xff)) & 0xffff), 0x85ebca6b) >>> 0;
  }
  return `c87-${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

function serializeForHash(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(canonicalFloat(value));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => serializeForHash(item)).join(",")}]`;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of Object.keys(rec).sort()) {
      if (rec[k] !== undefined) parts.push(`${JSON.stringify(k)}:${serializeForHash(rec[k])}`);
    }
    return `{${parts.join(",")}}`;
  }
  return '""';
}

/** 노드 기하·의존성 기반 내용 주소 해시(타임스탬프 제외). */
export function hashCausalNode(node: CausalNodeWithoutHash): string {
  return computeCausalContentHash(
    serializeForHash({
      id: node.id,
      kind: node.kind,
      label: node.label,
      layerOrder: node.layerOrder,
      parentIds: [...node.parentIds].sort(),
      payload: node.payload,
    }),
  );
}

/** 전체 그래프 스냅샷의 결정적 상태 해시를 계산한다. */
export function computeGraphStateHash(nodes: ReadonlyMap<string, CausalCanvasNode>): string {
  const segments: string[] = [];
  for (const id of Array.from(nodes.keys()).sort()) {
    const node = nodes.get(id);
    if (node) segments.push(`${node.id}:${node.contentHash}`);
  }
  return computeCausalContentHash(segments.join("|"));
}

/** 월드 좌표를 골격 본 `(boneStart, boneEnd)` 기준 로컬 좌표 `(s, d)`로 투영한다. */
export function projectPointToBoneLocal(
  point: Point2D,
  boneStart: Point2D,
  boneEnd: Point2D,
): { readonly s: number; readonly d: number } {
  const dx = boneEnd.x - boneStart.x;
  const dy = boneEnd.y - boneStart.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS_LENGTH) return { s: 0, d: Math.hypot(point.x - boneStart.x, point.y - boneStart.y) };
  const ux = dx / len;
  const uy = dy / len;
  const rx = point.x - boneStart.x;
  const ry = point.y - boneStart.y;
  return { s: (rx * ux + ry * uy) / len, d: rx * -uy + ry * ux };
}

/** 본 로컬 좌표 `(s, d)`를 갱신된 골격 본 기준의 월드 좌표로 복원한다. */
export function reconstructPointFromBoneLocal(
  s: number,
  d: number,
  boneStart: Point2D,
  boneEnd: Point2D,
  originalBoneLength?: number,
): Point2D {
  const dx = boneEnd.x - boneStart.x;
  const dy = boneEnd.y - boneStart.y;
  const curLen = Math.hypot(dx, dy);
  if (curLen < EPS_LENGTH) return { x: boneStart.x, y: boneStart.y };
  const ux = dx / curLen;
  const uy = dy / curLen;
  const along = s * (originalBoneLength !== undefined && originalBoneLength > EPS_LENGTH ? originalBoneLength : curLen);
  return { x: boneStart.x + along * ux - d * uy, y: boneStart.y + along * uy + d * ux };
}

/** 정점을 1개 이상의 부모 러프 본에 역거리 가중치 로컬 앵커로 바인딩한다. */
export function bindPointToParentBones(
  point: Point2D,
  parentBones: readonly RoughSkeletonBoneNode[],
): readonly BoneLocalAnchor[] {
  if (parentBones.length === 0) return [];
  const raw: { id: string; s: number; d: number; weight: number }[] = [];
  let weightSum = 0;
  for (const bone of parentBones) {
    const { s, d } = projectPointToBoneLocal(point, bone.payload.p0, bone.payload.p1);
    const cs = Math.max(0, Math.min(1, s));
    const cx = bone.payload.p0.x + (bone.payload.p1.x - bone.payload.p0.x) * cs;
    const cy = bone.payload.p0.y + (bone.payload.p1.y - bone.payload.p0.y) * cs;
    const weight = 1 / ((point.x - cx) ** 2 + (point.y - cy) ** 2 + 1e-4);
    raw.push({ id: bone.id, s, d, weight });
    weightSum += weight;
  }
  const norm = weightSum > EPS_LENGTH ? weightSum : 1;
  return Object.freeze(raw.map((r) => Object.freeze({ parentBoneId: r.id, s: r.s, d: r.d, weight: r.weight / norm })));
}

/** 인과 노드 종류별 대표 기하 정점 목록을 추출한다. */
export function extractNodeGeometryPoints(node: CausalCanvasNode): readonly Point2D[] {
  switch (node.kind) {
    case "rough-skeleton-bone":
      return node.payload.controlHandles && node.payload.controlHandles.length >= 2
        ? node.payload.controlHandles
        : [node.payload.p0, { x: (node.payload.p0.x + node.payload.p1.x) * 0.5, y: (node.payload.p0.y + node.payload.p1.y) * 0.5 }, node.payload.p1];
    case "ink-lineart-stroke":
      return node.payload.points;
    case "cel-fill-region":
    case "shadow-highlight-pass":
      return node.payload.polygon;
    case "fluid-wash-effect":
      return node.payload.bleedAnchors;
    case "speech-balloon-tail":
      return [node.payload.tailBaseLeft, node.payload.tailTip, node.payload.tailBaseRight];
  }
}

/** 노드 좌표를 정규화하고 내용 해시를 재계산해 불변 `CausalCanvasNode`로 봉인한다. */
export function sealUpdatedCausalNode(input: CausalNodeWithoutHash): CausalCanvasNode {
  const meta = { id: input.id, label: input.label, parentIds: Object.freeze([...input.parentIds]), createdAtMs: input.createdAtMs, updatedAtMs: input.updatedAtMs, layerOrder: input.layerOrder };
  switch (input.kind) {
    case "rough-skeleton-bone": {
      const payload: RoughSkeletonBonePayload = Object.freeze({
        p0: canonicalPoint(input.payload.p0),
        p1: canonicalPoint(input.payload.p1),
        jointLabel: input.payload.jointLabel,
        ...(input.payload.controlHandles ? { controlHandles: canonicalPoints(input.payload.controlHandles) } : {}),
      });
      const base: Omit<RoughSkeletonBoneNode, "contentHash"> = { ...meta, kind: "rough-skeleton-bone", payload };
      return Object.freeze({ ...base, contentHash: hashCausalNode(base) });
    }
    case "ink-lineart-stroke": {
      const payload: InkLineartStrokePayload = Object.freeze({
        points: canonicalPoints(input.payload.points),
        ...(input.payload.bezierControls
          ? { bezierControls: Object.freeze(input.payload.bezierControls.map((p) => Object.freeze({ cp1: canonicalPoint(p.cp1), cp2: canonicalPoint(p.cp2) }))) }
          : {}),
        strokeWidth: canonicalFloat(input.payload.strokeWidth),
        strokeColor: input.payload.strokeColor,
        ...(input.payload.boneAnchors ? { boneAnchors: input.payload.boneAnchors } : {}),
      });
      const base: Omit<InkLineartStrokeNode, "contentHash"> = { ...meta, kind: "ink-lineart-stroke", payload };
      return Object.freeze({ ...base, contentHash: hashCausalNode(base) });
    }
    case "cel-fill-region": {
      const payload: CelFillRegionPayload = Object.freeze({
        polygon: canonicalPoints(input.payload.polygon),
        fillColor: input.payload.fillColor,
        opacity: canonicalFloat(input.payload.opacity),
        ...(input.payload.boneAnchors ? { boneAnchors: input.payload.boneAnchors } : {}),
      });
      const base: Omit<CelFillRegionNode, "contentHash"> = { ...meta, kind: "cel-fill-region", payload };
      return Object.freeze({ ...base, contentHash: hashCausalNode(base) });
    }
    case "shadow-highlight-pass": {
      const payload: ShadowHighlightPassPayload = Object.freeze({
        passMode: input.payload.passMode,
        polygon: canonicalPoints(input.payload.polygon),
        lightDirection: canonicalPoint(input.payload.lightDirection),
        tintColor: input.payload.tintColor,
        opacity: canonicalFloat(input.payload.opacity),
        ...(input.payload.boneAnchors ? { boneAnchors: input.payload.boneAnchors } : {}),
      });
      const base: Omit<ShadowHighlightPassNode, "contentHash"> = { ...meta, kind: "shadow-highlight-pass", payload };
      return Object.freeze({ ...base, contentHash: hashCausalNode(base) });
    }
    case "fluid-wash-effect": {
      const payload: FluidWashEffectPayload = Object.freeze({
        bleedAnchors: canonicalPoints(input.payload.bleedAnchors),
        bleedRadius: canonicalFloat(input.payload.bleedRadius),
        pigmentColor: input.payload.pigmentColor,
        wetness: canonicalFloat(input.payload.wetness),
        ...(input.payload.boneAnchors ? { boneAnchors: input.payload.boneAnchors } : {}),
      });
      const base: Omit<FluidWashEffectNode, "contentHash"> = { ...meta, kind: "fluid-wash-effect", payload };
      return Object.freeze({ ...base, contentHash: hashCausalNode(base) });
    }
    case "speech-balloon-tail": {
      const payload: SpeechBalloonTailPayload = Object.freeze({
        balloonCenter: canonicalPoint(input.payload.balloonCenter),
        balloonRadiusX: canonicalFloat(input.payload.balloonRadiusX),
        balloonRadiusY: canonicalFloat(input.payload.balloonRadiusY),
        text: input.payload.text,
        balloonTextRotationDeg: canonicalFloat(input.payload.balloonTextRotationDeg),
        tailBaseLeft: canonicalPoint(input.payload.tailBaseLeft),
        tailBaseRight: canonicalPoint(input.payload.tailBaseRight),
        tailTip: canonicalPoint(input.payload.tailTip),
        speakerBoneId: input.payload.speakerBoneId,
        mouthLocalAnchor: Object.freeze({ s: canonicalFloat(input.payload.mouthLocalAnchor.s), d: canonicalFloat(input.payload.mouthLocalAnchor.d) }),
        ...(input.payload.tailGapPx !== undefined ? { tailGapPx: canonicalFloat(input.payload.tailGapPx) } : {}),
      });
      const base: Omit<SpeechBalloonTailNode, "contentHash"> = { ...meta, kind: "speech-balloon-tail", payload };
      return Object.freeze({ ...base, contentHash: hashCausalNode(base) });
    }
  }
}

/** 화자 머리 본 이동에 맞춰 말풍선 꼬리 끝점·밑변을 갱신하고 본문 회전각은 `0°`로 고정한다. */
export function updateSpeechBalloonTailForBone(
  balloonNode: SpeechBalloonTailNode,
  speakerBone: RoughSkeletonBoneNode,
  timestampMs: number,
  originalBoneLength?: number,
): SpeechBalloonTailNode {
  const { payload } = balloonNode;
  const mouth = reconstructPointFromBoneLocal(payload.mouthLocalAnchor.s, payload.mouthLocalAnchor.d, speakerBone.payload.p0, speakerBone.payload.p1, originalBoneLength);
  const dx = mouth.x - payload.balloonCenter.x;
  const dy = mouth.y - payload.balloonCenter.y;
  const dist = Math.hypot(dx, dy);
  const ux = dist > EPS_LENGTH ? dx / dist : 0;
  const uy = dist > EPS_LENGTH ? dy / dist : 1;
  const gap = payload.tailGapPx ?? 0;
  const clampedGap = dist > gap + 4 ? gap : 0;
  const angle = Math.atan2(dy, dx);
  const rx = Math.max(8, payload.balloonRadiusX);
  const ry = Math.max(8, payload.balloonRadiusY);

  return sealUpdatedCausalNode({
    ...balloonNode,
    updatedAtMs: timestampMs,
    payload: {
      ...payload,
      balloonTextRotationDeg: 0,
      tailBaseLeft: { x: payload.balloonCenter.x + rx * Math.cos(angle - 0.22), y: payload.balloonCenter.y + ry * Math.sin(angle - 0.22) },
      tailBaseRight: { x: payload.balloonCenter.x + rx * Math.cos(angle + 0.22), y: payload.balloonCenter.y + ry * Math.sin(angle + 0.22) },
      tailTip: { x: mouth.x - ux * clampedGap, y: mouth.y - uy * clampedGap },
    },
  }) as SpeechBalloonTailNode;
}

function remapPointsByAnchors(
  points: readonly Point2D[],
  anchors: readonly (readonly BoneLocalAnchor[])[] | undefined,
  beforeNodes: ReadonlyMap<string, CausalCanvasNode>,
  afterNodes: ReadonlyMap<string, CausalCanvasNode>,
): readonly Point2D[] {
  if (!anchors || anchors.length !== points.length) return points;
  return points.map((pt, idx) => {
    const list = anchors[idx];
    if (!list || list.length === 0) return pt;
    let sumX = 0;
    let sumY = 0;
    let sumW = 0;
    for (const a of list) {
      const b0 = beforeNodes.get(a.parentBoneId);
      const b1 = afterNodes.get(a.parentBoneId);
      if (b0?.kind === "rough-skeleton-bone" && b1?.kind === "rough-skeleton-bone") {
        const len = Math.hypot(b0.payload.p1.x - b0.payload.p0.x, b0.payload.p1.y - b0.payload.p0.y);
        const pos = reconstructPointFromBoneLocal(a.s, a.d, b1.payload.p0, b1.payload.p1, len);
        sumX += pos.x * a.weight;
        sumY += pos.y * a.weight;
        sumW += a.weight;
      }
    }
    return sumW > EPS_LENGTH ? { x: sumX / sumW, y: sumY / sumW } : pt;
  });
}

function defaultBoneLocalReproject(context: HistoricalEditContext): ReadonlyMap<string, CausalCanvasNode> {
  const next = new Map<string, CausalCanvasNode>(context.beforeNodes);
  next.set(context.editedNodeId, context.afterEditedNode);
  const remap = (pts: readonly Point2D[], anc?: readonly (readonly BoneLocalAnchor[])[]) =>
    remapPointsByAnchors(pts, anc, context.beforeNodes, next);

  for (const childId of context.downstreamOrder) {
    const node = next.get(childId);
    if (!node) continue;
    if (node.kind === "speech-balloon-tail") {
      const b0 = context.beforeNodes.get(node.payload.speakerBoneId);
      const b1 = next.get(node.payload.speakerBoneId);
      if (b0?.kind === "rough-skeleton-bone" && b1?.kind === "rough-skeleton-bone") {
        const len = Math.hypot(b0.payload.p1.x - b0.payload.p0.x, b0.payload.p1.y - b0.payload.p0.y);
        next.set(childId, updateSpeechBalloonTailForBone(node, b1, context.timestampMs, len));
      }
    } else if (node.kind === "ink-lineart-stroke") {
      next.set(childId, sealUpdatedCausalNode({ ...node, updatedAtMs: context.timestampMs, payload: { ...node.payload, points: remap(node.payload.points, node.payload.boneAnchors) } }));
    } else if (node.kind === "cel-fill-region") {
      next.set(childId, sealUpdatedCausalNode({ ...node, updatedAtMs: context.timestampMs, payload: { ...node.payload, polygon: remap(node.payload.polygon, node.payload.boneAnchors) } }));
    } else if (node.kind === "shadow-highlight-pass") {
      next.set(childId, sealUpdatedCausalNode({ ...node, updatedAtMs: context.timestampMs, payload: { ...node.payload, polygon: remap(node.payload.polygon, node.payload.boneAnchors) } }));
    } else if (node.kind === "fluid-wash-effect") {
      next.set(childId, sealUpdatedCausalNode({ ...node, updatedAtMs: context.timestampMs, payload: { ...node.payload, bleedAnchors: remap(node.payload.bleedAnchors, node.payload.boneAnchors) } }));
    }
  }
  return next;
}

/** 인과 의존성 DAG 및 비파괴 타임트래블 리비전 저장소. */
export class CausalStrokeDependencyGraph {
  private nodes: Map<string, CausalCanvasNode> = new Map();
  private childrenByParent: Map<string, Set<string>> = new Map();
  private revisions: TimeTravelRevision[] = [];
  private activeRevisionIndex = -1;

  public constructor(initialNodes: readonly CausalNodeInput[] = []) {
    for (const input of initialNodes) this.addNode(input);
  }

  public get size(): number { return this.nodes.size; }
  public getNode(nodeId: string): CausalCanvasNode | undefined { return this.nodes.get(nodeId); }
  public getCurrentRevisionNumber(): number { return this.activeRevisionIndex; }
  public getRevision(revision: number): TimeTravelRevision | undefined { return this.revisions[revision]; }
  public listRevisions(): readonly TimeTravelRevision[] { return [...this.revisions]; }
  public getNodeSnapshotMap(): ReadonlyMap<string, CausalCanvasNode> { return new Map(this.nodes); }
  public getStateHash(): string { return computeGraphStateHash(this.nodes); }
  public getChildren(parentId: string): readonly string[] {
    const set = this.childrenByParent.get(parentId);
    return set ? Array.from(set).sort() : [];
  }

  public requireNode(nodeId: string): CausalCanvasNode {
    const node = this.nodes.get(nodeId);
    if (!node) throw new CausalNodeNotFoundError(nodeId, "노드 조회");
    return node;
  }

  public listNodes(): readonly CausalCanvasNode[] {
    return this.getTopologicalOrder()
      .map((id) => this.nodes.get(id))
      .filter((n): n is CausalCanvasNode => n !== undefined);
  }

  /** 불변 인과 노드를 추가하고 조상 러프 본 기준 로컬 앵커 `(s, d)`를 자동 바인딩한다. */
  public addNode(input: CausalNodeInput): CausalCanvasNode {
    if (this.nodes.has(input.id)) throw new Error(`이미 존재하는 인과 노드 ID입니다: ${input.id}`);
    const uniqueParents = Array.from(new Set(input.parentIds));
    for (const parentId of uniqueParents) {
      if (parentId === input.id) throw new CausalGraphCycleError([input.id, input.id]);
      if (!this.nodes.has(parentId)) throw new CausalNodeNotFoundError(parentId, `${input.id}의 부모 참조`);
    }
    const ancestorBones = this.collectNearestAncestorBones(uniqueParents);
    const sealed = sealUpdatedCausalNode(this.attachAutoBoneAnchors(input, uniqueParents, ancestorBones));
    this.nodes.set(sealed.id, sealed);
    if (!this.childrenByParent.has(sealed.id)) this.childrenByParent.set(sealed.id, new Set());
    for (const parentId of uniqueParents) this.linkParent(parentId, sealed.id);
    return sealed;
  }

  /** `parentId -> childId` 인과 간선을 추가한다. 순환 발생 시 상태를 바꾸지 않고 예외를 던진다. */
  public addDependency(parentId: string, childId: string): CausalCanvasNode {
    if (!this.nodes.has(parentId)) throw new CausalNodeNotFoundError(parentId, "의존성 부모");
    const child = this.nodes.get(childId);
    if (!child) throw new CausalNodeNotFoundError(childId, "의존성 자식");
    if (parentId === childId) throw new CausalGraphCycleError([parentId, childId]);
    if (child.parentIds.includes(parentId)) return child;
    const cyclePath = this.findPath(childId, parentId);
    if (cyclePath) throw new CausalGraphCycleError([parentId, ...cyclePath]);

    const updatedChild = sealUpdatedCausalNode({ ...child, parentIds: [...child.parentIds, parentId] });
    this.nodes.set(childId, updatedChild);
    this.linkParent(parentId, childId);
    return updatedChild;
  }

  /** 전체 인과 DAG의 결정적 위상 정렬 순서를 반환한다(부모가 항상 자식보다 선행). */
  public getTopologicalOrder(): readonly string[] {
    const ordered = this.topoSortSubset(new Set<string>(this.nodes.keys()));
    if (ordered.length !== this.nodes.size) throw new CausalGraphCycleError(["graph-invariant-broken"]);
    return ordered;
  }

  /** `editedNodeId`의 하위 의존 서브그래프만 `O(|V_affected| + |E_affected|)` 위상 순서로 반환한다. */
  public getDownstreamAffectedNodeIds(editedNodeId: string): readonly string[] {
    if (!this.nodes.has(editedNodeId)) throw new CausalNodeNotFoundError(editedNodeId, "하위 영향 탐색");
    const visited = new Set<string>();
    const queue = Array.from(this.childrenByParent.get(editedNodeId) ?? []);
    for (const id of queue) visited.add(id);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (current === undefined) continue;
      for (const nextId of this.childrenByParent.get(current) ?? []) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      }
    }
    return visited.size === 0 ? [] : this.topoSortSubset(visited);
  }

  /** 현재 그래프 상태를 불변 타임트래블 리비전으로 커밋한다. */
  public commitRevision(
    label: string,
    options?: { readonly timestampMs?: number; readonly editedNodeId?: string | null; readonly affectedNodeIds?: readonly string[] },
  ): TimeTravelRevision {
    const revNum = this.revisions.length;
    const snapshot = new Map<string, CausalCanvasNode>(this.nodes);
    const revision: TimeTravelRevision = Object.freeze({
      revision: revNum,
      timestampMs: options?.timestampMs ?? Date.now(),
      label,
      editedNodeId: options?.editedNodeId ?? null,
      affectedNodeIds: Object.freeze([...(options?.affectedNodeIds ?? [])]),
      stateHash: computeGraphStateHash(snapshot),
      nodes: snapshot,
    });
    this.revisions.push(revision);
    this.activeRevisionIndex = revNum;
    return revision;
  }

  /** 비파괴 시간 역행 스크럽: 다른 리비전을 보존한 채 지정 리비전 상태로 즉시 복원한다. */
  public checkoutRevision(revision: number): TimeTravelRevision {
    const target = this.revisions[revision];
    if (!target) {
      throw new RangeError(`존재하지 않는 리비전 번호입니다: ${revision} (유효 범위: 0..${Math.max(0, this.revisions.length - 1)})`);
    }
    this.restoreFromSnapshot(target.nodes);
    this.activeRevisionIndex = revision;
    return target;
  }

  /** 과거 노드를 소급 수정하고 영향받는 하위 노드만 비파괴 재투영해 새 리비전으로 저장한다. */
  public editHistoricalNodeAndReproject(request: HistoricalEditRequest): HistoricalEditResult {
    const baseRevision =
      request.sourceRevision !== undefined
        ? request.sourceRevision
        : this.activeRevisionIndex >= 0
          ? this.activeRevisionIndex
          : this.commitRevision("초기 베이스라인 스냅샷", { timestampMs: request.timestampMs }).revision;
    if (request.sourceRevision !== undefined) this.checkoutRevision(request.sourceRevision);

    const beforeNodes = new Map<string, CausalCanvasNode>(this.nodes);
    const beforeEditedNode = this.requireNode(request.nodeId);
    const rawEdited = request.mutate(beforeEditedNode);
    if (rawEdited.id !== beforeEditedNode.id || rawEdited.kind !== beforeEditedNode.kind) {
      throw new Error(`소급 수정 시 노드의 ID(${beforeEditedNode.id})와 종류(${beforeEditedNode.kind})는 유지해야 합니다.`);
    }
    const afterEditedNode = sealUpdatedCausalNode({ ...rawEdited, updatedAtMs: request.timestampMs });
    const downstreamOrder = this.getDownstreamAffectedNodeIds(request.nodeId);
    const affectedSet = new Set<string>([request.nodeId, ...downstreamOrder]);
    const untouchedNodeIds = Array.from(beforeNodes.keys()).filter((id) => !affectedSet.has(id)).sort();

    const reprojected = (request.reproject ?? defaultBoneLocalReproject)({
      editedNodeId: request.nodeId,
      beforeEditedNode,
      afterEditedNode,
      beforeNodes,
      downstreamOrder,
      timestampMs: request.timestampMs,
    });

    const safeNextNodes = new Map<string, CausalCanvasNode>();
    for (const [id, prev] of beforeNodes) {
      safeNextNodes.set(id, affectedSet.has(id) ? (reprojected.get(id) ?? prev) : prev);
    }
    safeNextNodes.set(request.nodeId, afterEditedNode);

    this.restoreFromSnapshot(safeNextNodes);
    const committed = this.commitRevision(request.label, {
      timestampMs: request.timestampMs,
      editedNodeId: request.nodeId,
      affectedNodeIds: downstreamOrder,
    });
    return {
      sourceRevision: baseRevision,
      targetRevision: committed.revision,
      editedNodeId: request.nodeId,
      affectedNodeIds: downstreamOrder,
      untouchedNodeIds,
      revision: committed,
    };
  }

  private linkParent(parentId: string, childId: string): void {
    let children = this.childrenByParent.get(parentId);
    if (!children) {
      children = new Set();
      this.childrenByParent.set(parentId, children);
    }
    children.add(childId);
  }

  private topoSortSubset(subset: ReadonlySet<string>): readonly string[] {
    const inDegree = new Map<string, number>();
    for (const id of subset) inDegree.set(id, 0);
    for (const id of subset) {
      for (const childId of this.childrenByParent.get(id) ?? []) {
        if (subset.has(childId)) inDegree.set(childId, (inDegree.get(childId) ?? 0) + 1);
      }
    }
    const compare = (aId: string, bId: string): number => {
      const a = this.nodes.get(aId);
      const b = this.nodes.get(bId);
      if (a && b) {
        if (a.layerOrder !== b.layerOrder) return a.layerOrder - b.layerOrder;
        if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      }
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    };
    const ready = Array.from(inDegree.entries()).filter(([, deg]) => deg === 0).map(([id]) => id).sort(compare);
    const ordered: string[] = [];
    while (ready.length > 0) {
      const current = ready.shift();
      if (current === undefined) break;
      ordered.push(current);
      for (const childId of this.childrenByParent.get(current) ?? []) {
        if (!subset.has(childId)) continue;
        const nextDeg = (inDegree.get(childId) ?? 0) - 1;
        inDegree.set(childId, nextDeg);
        if (nextDeg === 0) ready.push(childId);
      }
      ready.sort(compare);
    }
    return ordered;
  }

  private restoreFromSnapshot(snapshot: ReadonlyMap<string, CausalCanvasNode>): void {
    this.nodes = new Map(snapshot);
    this.childrenByParent = new Map();
    for (const id of this.nodes.keys()) this.childrenByParent.set(id, new Set());
    for (const [childId, node] of this.nodes) {
      for (const parentId of node.parentIds) this.linkParent(parentId, childId);
    }
  }

  private findPath(startId: string, targetId: string): readonly string[] | null {
    const visited = new Set<string>([startId]);
    const queue: { id: string; path: string[] }[] = [{ id: startId, path: [startId] }];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (!current) continue;
      for (const nextId of this.childrenByParent.get(current.id) ?? []) {
        if (nextId === targetId) return [...current.path, nextId];
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, path: [...current.path, nextId] });
        }
      }
    }
    return null;
  }

  private collectNearestAncestorBones(parentIds: readonly string[]): readonly RoughSkeletonBoneNode[] {
    const bones: RoughSkeletonBoneNode[] = [];
    const seen = new Set<string>();
    const queue = [...parentIds];
    for (let head = 0; head < queue.length; head += 1) {
      const id = queue[head];
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      const node = this.nodes.get(id);
      if (!node) continue;
      if (node.kind === "rough-skeleton-bone") bones.push(node);
      else for (const gp of node.parentIds) if (!seen.has(gp)) queue.push(gp);
    }
    return bones;
  }

  private attachAutoBoneAnchors(
    input: CausalNodeInput,
    parentIds: readonly string[],
    ancestorBones: readonly RoughSkeletonBoneNode[],
  ): CausalNodeWithoutHash {
    const updatedAtMs = input.updatedAtMs ?? input.createdAtMs;
    if (ancestorBones.length === 0) return { ...input, parentIds, updatedAtMs };
    const bindAll = (pts: readonly Point2D[]) => pts.map((pt) => bindPointToParentBones(pt, ancestorBones));
    switch (input.kind) {
      case "ink-lineart-stroke":
        return { ...input, parentIds, updatedAtMs, payload: { ...input.payload, boneAnchors: input.payload.boneAnchors ?? bindAll(input.payload.points) } };
      case "cel-fill-region":
        return { ...input, parentIds, updatedAtMs, payload: { ...input.payload, boneAnchors: input.payload.boneAnchors ?? bindAll(input.payload.polygon) } };
      case "shadow-highlight-pass":
        return { ...input, parentIds, updatedAtMs, payload: { ...input.payload, boneAnchors: input.payload.boneAnchors ?? bindAll(input.payload.polygon) } };
      case "fluid-wash-effect":
        return { ...input, parentIds, updatedAtMs, payload: { ...input.payload, boneAnchors: input.payload.boneAnchors ?? bindAll(input.payload.bleedAnchors) } };
      case "rough-skeleton-bone":
      case "speech-balloon-tail":
        return { ...input, parentIds, updatedAtMs };
    }
  }
}
