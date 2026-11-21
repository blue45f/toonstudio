/**
 * Studio Live Boolean Group — Figma식 비파괴 불리언 컨테이너 트리.
 *
 * 하위 도형(Leaf)과 중첩 불리언 그룹(Group)을 원본 그대로 유지하면서
 * `union | subtract | intersect | exclude` 연산 + 라이브 오프셋(`liveOffsetPx`) +
 * 로컬 변환(`tx, ty, rotationDeg, scaleX, scaleY`)을 비파괴로 평가한다.
 * 필요할 때만 Flatten으로 `DrawEl` 시드 배열로 전개할 수 있으며,
 * 기존 `studio-path-boolean.ts`의 폴리곤 변환·불리언 클리핑·키홀 출력을 재사용한다.
 */

import {
  combineStudioShapePolygons,
  studioPathBooleanOutputFromPolygons,
  studioPathBooleanPieceToDrawElSeed,
  studioPathSignedArea,
  studioShapeToPolygon,
  unionStudioPolygons,
  type StudioPathBooleanBounds,
  type StudioPathBooleanOp,
  type StudioPathBooleanOutput,
  type StudioPathBooleanShapeSpec,
  type StudioPathPolygon,
  type StudioPathRing,
  type StudioShapeToPolygonOptions,
} from "../studio-path-boolean";

import type { DrawEl } from "../studio-element-model";

export interface LiveBooleanTransform {
  readonly tx: number;
  readonly ty: number;
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface LiveBooleanStyle {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly fill?: string;
  readonly opacity?: number;
}

export interface LiveBooleanLeafNode {
  readonly kind: "leaf";
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly shape: StudioPathBooleanShapeSpec;
  readonly transform?: LiveBooleanTransform;
  readonly liveOffsetPx?: number;
  readonly style?: LiveBooleanStyle;
}

export interface LiveBooleanGroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly name: string;
  readonly op: StudioPathBooleanOp;
  readonly visible: boolean;
  readonly liveOffsetPx: number;
  readonly children: readonly LiveBooleanNode[];
  readonly transform?: LiveBooleanTransform;
  readonly style?: LiveBooleanStyle;
}

export type LiveBooleanNode = LiveBooleanLeafNode | LiveBooleanGroupNode;

export interface EvaluateLiveBooleanOptions extends StudioShapeToPolygonOptions {
  readonly miterLimit?: number;
}

export type LiveBooleanEvaluationResult =
  | {
      readonly ok: true;
      readonly polygons: readonly StudioPathPolygon[];
      readonly output: StudioPathBooleanOutput;
      readonly bounds: StudioPathBooleanBounds;
      readonly evaluatedLeafCount: number;
      readonly skippedHiddenCount: number;
      readonly fingerprint: string;
    }
  | {
      readonly ok: false;
      readonly reasonCode:
        | "groupHidden"
        | "emptyVisibleChildren"
        | "invalidLeafShape"
        | "emptyResult"
        | "engineFailed";
      readonly evaluatedLeafCount: number;
      readonly skippedHiddenCount: number;
      readonly fingerprint: string;
    };

export const IDENTITY_LIVE_BOOLEAN_TRANSFORM: LiveBooleanTransform = Object.freeze({
  tx: 0,
  ty: 0,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
});

const DEFAULT_MITER_LIMIT = 4;
const EPS = 1e-6;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ringCentroid(ring: StudioPathRing): readonly [number, number] {
  if (ring.length === 0) return [0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function ringArea(ring: StudioPathRing): number {
  const flat: number[] = [];
  for (const [x, y] of ring) flat.push(x, y);
  return studioPathSignedArea(flat);
}

function applyTransformToPolygon(polygon: StudioPathPolygon, transform?: LiveBooleanTransform): StudioPathPolygon {
  if (!transform || polygon.length === 0) return polygon;
  const tx = Number.isFinite(transform.tx) ? transform.tx : 0;
  const ty = Number.isFinite(transform.ty) ? transform.ty : 0;
  const rotationDeg = Number.isFinite(transform.rotationDeg) ? transform.rotationDeg : 0;
  const scaleX = Number.isFinite(transform.scaleX) ? transform.scaleX : 1;
  const scaleY = Number.isFinite(transform.scaleY) ? transform.scaleY : 1;
  if (Math.abs(tx) < EPS && Math.abs(ty) < EPS && Math.abs(rotationDeg) < EPS && Math.abs(scaleX - 1) < EPS && Math.abs(scaleY - 1) < EPS) {
    return polygon;
  }
  const [cx, cy] = ringCentroid(polygon[0]!);
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return polygon.map((ring) =>
    ring.map(([x, y]) => {
      const sx = (x - cx) * scaleX;
      const sy = (y - cy) * scaleY;
      return [round2(sx * cos - sy * sin + cx + tx), round2(sx * sin + sy * cos + cy + ty)] as [number, number];
    }),
  );
}

/** 단순 폴리곤 링에 양수(확장)/음수(수축) 평행 오프셋을 적용한다(예각 miterLimit 초과 시 베벨). */
export function offsetPlanarRing(ring: StudioPathRing, offsetPx: number, miterLimit = DEFAULT_MITER_LIMIT): StudioPathRing {
  if (Math.abs(offsetPx) < EPS || ring.length < 3) return ring;
  const area = ringArea(ring);
  if (Math.abs(area) < 0.01) return ring;
  const outwardSign = area > 0 ? 1 : -1;
  const n = ring.length;
  const out: StudioPathRing = [];

  for (let i = 0; i < n; i += 1) {
    const prev = ring[(i - 1 + n) % n]!;
    const curr = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const e1x = curr[0] - prev[0];
    const e1y = curr[1] - prev[1];
    const e2x = next[0] - curr[0];
    const e2y = next[1] - curr[1];
    const len1 = Math.hypot(e1x, e1y);
    const len2 = Math.hypot(e2x, e2y);
    if (len1 < EPS || len2 < EPS) continue;

    const n1x = (outwardSign * e1y) / len1;
    const n1y = (-outwardSign * e1x) / len1;
    const n2x = (outwardSign * e2y) / len2;
    const n2y = (-outwardSign * e2x) / len2;
    const bx = n1x + n2x;
    const by = n1y + n2y;
    const bLen = Math.hypot(bx, by);
    const cosHalf = (n1x * bx + n1y * by) / Math.max(EPS, bLen);

    if (bLen < EPS || Math.abs(cosHalf) < 1 / Math.max(1, miterLimit)) {
      out.push(
        [round2(curr[0] + n1x * offsetPx), round2(curr[1] + n1y * offsetPx)],
        [round2(curr[0] + n2x * offsetPx), round2(curr[1] + n2y * offsetPx)],
      );
    } else {
      const miterLen = offsetPx / cosHalf;
      out.push([round2(curr[0] + (bx / bLen) * miterLen), round2(curr[1] + (by / bLen) * miterLen)]);
    }
  }

  return Math.abs(ringArea(out)) >= 0.05 ? out : [];
}

function applyOffsetToPolygons(polygons: readonly StudioPathPolygon[], offsetPx: number, miterLimit: number): StudioPathPolygon[] {
  if (Math.abs(offsetPx) < EPS) return [...polygons];
  const result: StudioPathPolygon[] = [];
  for (const poly of polygons) {
    if (poly.length === 0) continue;
    const outer = offsetPlanarRing(poly[0]!, offsetPx, miterLimit);
    if (outer.length < 3) continue;
    const holes: StudioPathRing[] = [];
    for (let i = 1; i < poly.length; i += 1) {
      const hole = offsetPlanarRing(poly[i]!, -offsetPx, miterLimit);
      if (hole.length >= 3) holes.push(hole);
    }
    result.push([outer, ...holes]);
  }
  return result;
}

/** 비파괴 불리언 트리의 결정적 구조 지문(캐시·동등성 검사 용도). */
export function hashLiveBooleanNode(node: LiveBooleanNode): string {
  const json = JSON.stringify(node);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `lbg1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createLiveBooleanGroup(params: {
  readonly id: string;
  readonly name: string;
  readonly op: StudioPathBooleanOp;
  readonly children: readonly LiveBooleanNode[];
  readonly liveOffsetPx?: number;
  readonly visible?: boolean;
  readonly transform?: LiveBooleanTransform;
  readonly style?: LiveBooleanStyle;
}): LiveBooleanGroupNode {
  return {
    kind: "group",
    id: params.id,
    name: params.name,
    op: params.op,
    visible: params.visible ?? true,
    liveOffsetPx: params.liveOffsetPx ?? 0,
    children: [...params.children],
    ...(params.transform ? { transform: params.transform } : {}),
    ...(params.style ? { style: params.style } : {}),
  };
}

export function createLiveBooleanLeaf(params: {
  readonly id: string;
  readonly name: string;
  readonly shape: StudioPathBooleanShapeSpec;
  readonly visible?: boolean;
  readonly transform?: LiveBooleanTransform;
  readonly liveOffsetPx?: number;
  readonly style?: LiveBooleanStyle;
}): LiveBooleanLeafNode {
  return {
    kind: "leaf",
    id: params.id,
    name: params.name,
    visible: params.visible ?? true,
    shape: params.shape,
    ...(params.transform ? { transform: params.transform } : {}),
    ...(params.liveOffsetPx !== undefined ? { liveOffsetPx: params.liveOffsetPx } : {}),
    ...(params.style ? { style: params.style } : {}),
  };
}

export function findLiveBooleanNode(root: LiveBooleanNode, targetId: string): LiveBooleanNode | null {
  if (root.id === targetId) return root;
  if (root.kind === "leaf") return null;
  for (const child of root.children) {
    const hit = findLiveBooleanNode(child, targetId);
    if (hit) return hit;
  }
  return null;
}

export function updateLiveBooleanNode(
  root: LiveBooleanGroupNode,
  targetId: string,
  updater: (node: LiveBooleanNode) => LiveBooleanNode,
): LiveBooleanGroupNode {
  if (root.id === targetId) {
    const next = updater(root);
    return next.kind === "group" ? next : root;
  }
  let changed = false;
  const nextChildren = root.children.map((child) => {
    if (child.id === targetId) {
      const updated = updater(child);
      if (updated !== child) changed = true;
      return updated;
    }
    if (child.kind === "group") {
      const updated = updateLiveBooleanNode(child, targetId, updater);
      if (updated !== child) {
        changed = true;
        return updated;
      }
    }
    return child;
  });
  return changed ? { ...root, children: nextChildren } : root;
}

export function insertLiveBooleanChild(
  root: LiveBooleanGroupNode,
  parentGroupId: string,
  child: LiveBooleanNode,
  index?: number,
): LiveBooleanGroupNode {
  return updateLiveBooleanNode(root, parentGroupId, (node) => {
    if (node.kind !== "group") return node;
    const next = [...node.children];
    const idx =
      index === undefined || !Number.isFinite(index)
        ? next.length
        : Math.max(0, Math.min(next.length, Math.floor(index)));
    next.splice(idx, 0, child);
    return { ...node, children: next };
  });
}

export function removeLiveBooleanChild(root: LiveBooleanGroupNode, targetId: string): LiveBooleanGroupNode {
  if (root.id === targetId) return root;
  let changed = false;
  const nextChildren: LiveBooleanNode[] = [];
  for (const child of root.children) {
    if (child.id === targetId) {
      changed = true;
      continue;
    }
    if (child.kind === "group") {
      const updated = removeLiveBooleanChild(child, targetId);
      if (updated !== child) changed = true;
      nextChildren.push(updated);
    } else {
      nextChildren.push(child);
    }
  }
  return changed ? { ...root, children: nextChildren } : root;
}

export function reorderLiveBooleanChild(
  root: LiveBooleanGroupNode,
  groupId: string,
  fromIndex: number,
  toIndex: number,
): LiveBooleanGroupNode {
  return updateLiveBooleanNode(root, groupId, (node) => {
    if (node.kind !== "group") return node;
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      fromIndex >= node.children.length ||
      toIndex < 0 ||
      toIndex >= node.children.length ||
      fromIndex === toIndex
    ) {
      return node;
    }
    const next = [...node.children];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return node;
    next.splice(toIndex, 0, moved);
    return { ...node, children: next };
  });
}

export function toggleLiveBooleanNodeVisibility(root: LiveBooleanGroupNode, targetId: string): LiveBooleanGroupNode {
  return updateLiveBooleanNode(root, targetId, (node) => ({ ...node, visible: !node.visible }));
}

interface InternalEval {
  readonly polygons: StudioPathPolygon[];
  readonly evaluatedLeafCount: number;
  readonly skippedHiddenCount: number;
  readonly invalidLeaf: boolean;
}

async function combineMultiPolygons(
  left: readonly StudioPathPolygon[],
  right: readonly StudioPathPolygon[],
  op: StudioPathBooleanOp,
): Promise<StudioPathPolygon[]> {
  if (op === "union") return unionStudioPolygons([...left, ...right]);
  let acc: StudioPathPolygon[] = [...left];
  for (const clip of right) {
    const nextPieces: StudioPathPolygon[] = [];
    for (const subj of acc) nextPieces.push(...(await combineStudioShapePolygons(subj, clip, op)));
    acc = nextPieces.length > 1 ? await unionStudioPolygons(nextPieces) : nextPieces;
    if (acc.length === 0 && op !== "exclude") break;
  }
  return acc;
}

async function evaluateNodePolygons(node: LiveBooleanNode, options: EvaluateLiveBooleanOptions): Promise<InternalEval> {
  const miterLimit = options.miterLimit ?? DEFAULT_MITER_LIMIT;
  if (!node.visible) return { polygons: [], evaluatedLeafCount: 0, skippedHiddenCount: 1, invalidLeaf: false };

  if (node.kind === "leaf") {
    const converted = studioShapeToPolygon(node.shape, options);
    if (!converted.ok) return { polygons: [], evaluatedLeafCount: 0, skippedHiddenCount: 0, invalidLeaf: true };
    const transformed = applyTransformToPolygon(converted.polygon, node.transform);
    return {
      polygons: applyOffsetToPolygons([transformed], node.liveOffsetPx ?? 0, miterLimit),
      evaluatedLeafCount: 1,
      skippedHiddenCount: 0,
      invalidLeaf: false,
    };
  }

  const visibleChildResults: StudioPathPolygon[][] = [];
  let evaluatedLeafCount = 0;
  let skippedHiddenCount = 0;
  let invalidLeaf = false;

  for (const child of node.children) {
    const res = await evaluateNodePolygons(child, options);
    evaluatedLeafCount += res.evaluatedLeafCount;
    skippedHiddenCount += res.skippedHiddenCount;
    if (res.invalidLeaf) invalidLeaf = true;
    if (res.polygons.length > 0) visibleChildResults.push(res.polygons);
  }

  if (visibleChildResults.length === 0) return { polygons: [], evaluatedLeafCount, skippedHiddenCount, invalidLeaf };

  let combined: StudioPathPolygon[];
  if (visibleChildResults.length === 1) {
    combined = visibleChildResults[0]!;
  } else if (node.op === "union") {
    combined = await unionStudioPolygons(visibleChildResults.flat());
  } else {
    combined = visibleChildResults[0]!;
    for (let i = 1; i < visibleChildResults.length; i += 1) {
      combined = await combineMultiPolygons(combined, visibleChildResults[i]!, node.op);
      if (combined.length === 0 && node.op !== "exclude") break;
    }
  }

  const transformed = combined.map((poly) => applyTransformToPolygon(poly, node.transform));
  return {
    polygons: applyOffsetToPolygons(transformed, node.liveOffsetPx, miterLimit),
    evaluatedLeafCount,
    skippedHiddenCount,
    invalidLeaf,
  };
}

/** 비파괴 불리언 그룹 트리를 평가해 폴리곤 및 키홀 평탄 출력을 생성한다. */
export async function evaluateLiveBooleanGroup(
  root: LiveBooleanGroupNode,
  options: EvaluateLiveBooleanOptions = {},
): Promise<LiveBooleanEvaluationResult> {
  const fingerprint = hashLiveBooleanNode(root);
  if (!root.visible) {
    return { ok: false, reasonCode: "groupHidden", evaluatedLeafCount: 0, skippedHiddenCount: 1, fingerprint };
  }

  let evalResult: InternalEval;
  try {
    evalResult = await evaluateNodePolygons(root, options);
  } catch {
    return { ok: false, reasonCode: "engineFailed", evaluatedLeafCount: 0, skippedHiddenCount: 0, fingerprint };
  }

  if (evalResult.evaluatedLeafCount === 0) {
    return {
      ok: false,
      reasonCode: evalResult.invalidLeaf ? "invalidLeafShape" : "emptyVisibleChildren",
      evaluatedLeafCount: 0,
      skippedHiddenCount: evalResult.skippedHiddenCount,
      fingerprint,
    };
  }
  if (evalResult.polygons.length === 0) {
    return { ok: false, reasonCode: "emptyResult", evaluatedLeafCount: evalResult.evaluatedLeafCount, skippedHiddenCount: evalResult.skippedHiddenCount, fingerprint };
  }

  const out = studioPathBooleanOutputFromPolygons(evalResult.polygons, root.op);
  if (!out.ok) {
    return { ok: false, reasonCode: "emptyResult", evaluatedLeafCount: evalResult.evaluatedLeafCount, skippedHiddenCount: evalResult.skippedHiddenCount, fingerprint };
  }

  return {
    ok: true,
    polygons: evalResult.polygons,
    output: out.output,
    bounds: out.output.bounds,
    evaluatedLeafCount: evalResult.evaluatedLeafCount,
    skippedHiddenCount: evalResult.skippedHiddenCount,
    fingerprint,
  };
}

function resolveBaseStyle(node: LiveBooleanGroupNode): LiveBooleanStyle {
  if (node.style) return node.style;
  for (const child of node.children) {
    if (!child.visible) continue;
    if (child.style) return child.style;
    if (child.kind === "group") {
      const nested = resolveBaseStyle(child);
      if (nested.stroke) return nested;
    }
  }
  return { stroke: "currentColor", strokeWidth: 2 };
}

/** 비파괴 불리언 그룹을 명시적 Flatten으로 `DrawEl` 시드 배열로 전개한다. */
export async function flattenLiveBooleanGroupToDrawElSeeds(
  root: LiveBooleanGroupNode,
  options: EvaluateLiveBooleanOptions = {},
): Promise<
  | { readonly ok: true; readonly seeds: readonly Omit<DrawEl, "id">[]; readonly evaluation: Extract<LiveBooleanEvaluationResult, { ok: true }> }
  | { readonly ok: false; readonly reasonCode: Extract<LiveBooleanEvaluationResult, { ok: false }>["reasonCode"] }
> {
  const evaluation = await evaluateLiveBooleanGroup(root, options);
  if (!evaluation.ok) return { ok: false, reasonCode: evaluation.reasonCode };
  const style = resolveBaseStyle(root);
  return {
    ok: true,
    seeds: evaluation.output.pieces.map((piece) => studioPathBooleanPieceToDrawElSeed(piece, style)),
    evaluation,
  };
}
