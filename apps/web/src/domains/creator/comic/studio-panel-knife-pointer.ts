/**
 * 사선·다각형 컷 분할 나이프 포인터 세션 및 요소/컷 폴더 재할당 엔진.
 *
 * `studio-comic-panel-splitter.ts`(`splitComicPanelPolygon`),
 * `manga-toolkit/manga-frame.ts`(`splitFrameDiagonal`, `polygonFrameToSvgPath`),
 * `studio-frame-folder.ts`(컷 폴더 생성·바인딩·공유 거터)를 재사용해
 * 직선/사선 드래그 미리보기·거터(24~96px)·최소 크기(24px / 900px²) 검증·
 * 요소 겹침(>= 0.5) 재할당과 컷 폴더 분할을 순수 불변 연산으로 수행한다.
 */
import {
  getPolygonArea,
  splitComicPanelPolygon,
  type ComicPanelPolygon,
  type PanelPoint,
} from "./studio-comic-panel-splitter";
import { polygonFrameToSvgPath, splitFrameDiagonal } from "../manga-toolkit/manga-frame";
import { containingPanel, elBounds } from "../studio-element-geometry";
import {
  createFrameFolderGroupForNewFrame,
  formatFrameFolderGroupName,
  planBindSelectionToFrameFolder,
  planSharedGutterSegments,
  type SharedGutterSegment,
} from "../studio-frame-folder";

import type { El } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";

/** `StudioElementLayerMetadata`(`name`, `locked` 등)를 포함한 정본 프레임 요소 타입. */
export type PanelKnifeFrameEl = Extract<El, { type: "frame" }>;

export const PANEL_KNIFE_MIN_SIDE_PX = 24;
export const PANEL_KNIFE_MIN_AREA_PX2 = 900;
export const PANEL_KNIFE_MIN_GUTTER_PX = 24;
export const PANEL_KNIFE_MAX_GUTTER_PX = 96;
export const PANEL_KNIFE_DEFAULT_GUTTER_PX = 24;
export const PANEL_KNIFE_GUTTER_PRESETS_PX = Object.freeze([24, 36, 48, 72, 96] as const);
export const PANEL_KNIFE_ANGLE_PRESETS_DEG = Object.freeze([-30, -15, 0, 15, 30] as const);
export const PANEL_KNIFE_OVERLAP_THRESHOLD = 0.5;
export const PANEL_KNIFE_MIN_DRAG_PX = 8;
export const PANEL_KNIFE_SNAP_STEP_DEG = 15;

const SNAP_STEP_RAD = (PANEL_KNIFE_SNAP_STEP_DEG * Math.PI) / 180;
const EPS = 1e-6;

export type PanelKnifePoint = PanelPoint;
export type PanelKnifeRejectReason = "frame-locked" | "drag-too-short" | "no-intersection" | "side-too-small" | "area-too-small";

export interface PanelKnifeElementReassignment {
  readonly elementId: string;
  readonly previousFrameId: string | null;
  readonly assignedFrameId: string | null;
  readonly overlapA: number;
  readonly overlapB: number;
  readonly assignedOverlap: number;
  readonly previousGroupId?: string;
  readonly nextGroupId?: string;
}

interface PreviewGeometryMeta {
  readonly targetFrameId: string;
  readonly start: PanelKnifePoint;
  readonly end: PanelKnifePoint;
  readonly snapped: boolean;
  readonly angleDeg: number;
  readonly gutterPx: number;
  readonly cutSegment: readonly [PanelKnifePoint, PanelKnifePoint] | null;
}

export interface PanelKnifePreview extends PreviewGeometryMeta {
  readonly valid: boolean;
  readonly rejectReason: PanelKnifeRejectReason | null;
  readonly statusMessage: string;
  readonly previewPolygons: readonly [readonly PanelKnifePoint[], readonly PanelKnifePoint[]] | null;
  readonly previewSvgPaths: readonly [string, string] | null;
  readonly previewFrames: readonly [PanelKnifeFrameEl, PanelKnifeFrameEl] | null;
  readonly areasPx2: readonly [number, number] | null;
  readonly reassignments: readonly PanelKnifeElementReassignment[];
  readonly assignedCountA: number;
  readonly assignedCountB: number;
  readonly unassignedCount: number;
}

export interface PanelKnifeCommitResult {
  readonly targetFrameId: string;
  readonly frames: readonly [PanelKnifeFrameEl, PanelKnifeFrameEl];
  readonly elements: readonly El[];
  readonly groups: readonly LayerGroup[];
  readonly sourceFolderGroupId: string | null;
  readonly createdFolders: readonly LayerGroup[];
  readonly reassignments: readonly PanelKnifeElementReassignment[];
  readonly sharedGutter: SharedGutterSegment | null;
  readonly gutterPx: number;
  readonly angleDeg: number;
}

export interface PanelKnifePointerSession {
  readonly phase: "dragging" | "committed" | "cancelled";
  readonly pointerId: number;
  readonly targetFrame: PanelKnifeFrameEl;
  readonly start: PanelKnifePoint;
  readonly current: PanelKnifePoint;
  readonly gutterPx: number;
  readonly snap15Deg: boolean;
  readonly overlapThreshold: number;
  readonly ensureFrameFolders: boolean;
  readonly sourceFolderGroupId: string | null;
  readonly preview: PanelKnifePreview;
}

interface PanelKnifeDocOpts {
  readonly gutterPx?: number;
  readonly overlapThreshold?: number;
  readonly ensureFrameFolders?: boolean;
  readonly sourceFolderGroupId?: string | null;
  readonly elements?: readonly El[];
  readonly groups?: readonly LayerGroup[];
}

interface PanelKnifeIdFactories {
  readonly makeFrameIds?: (sourceId: string) => readonly [string, string];
  readonly makeFolderIds?: (sourceId: string) => readonly [string, string];
}

export interface BeginPanelKnifeSessionInput extends PanelKnifeDocOpts {
  readonly targetFrame: PanelKnifeFrameEl;
  readonly start: PanelKnifePoint;
  readonly pointerId?: number;
  readonly snap15Deg?: boolean;
}

export interface UpdatePanelKnifeSessionInput {
  readonly point: PanelKnifePoint;
  readonly shiftKey?: boolean;
  readonly gutterPx?: number;
  readonly elements?: readonly El[];
  readonly groups?: readonly LayerGroup[];
}

export interface CommitPanelKnifeSessionInput extends PanelKnifeIdFactories {
  readonly point?: PanelKnifePoint;
  readonly shiftKey?: boolean;
  readonly gutterPx?: number;
  readonly elements?: readonly El[];
  readonly groups?: readonly LayerGroup[];
}

export type CommitPanelKnifeSessionOutcome =
  | { readonly ok: true; readonly session: PanelKnifePointerSession; readonly result: PanelKnifeCommitResult }
  | { readonly ok: false; readonly session: PanelKnifePointerSession; readonly reason: PanelKnifeRejectReason; readonly message: string };

export interface PlanDiagonalAngleSplitInput extends PanelKnifeDocOpts, PanelKnifeIdFactories {
  readonly targetFrame: PanelKnifeFrameEl;
  readonly angleDeg: number;
  readonly offsetRatio?: number;
}

export type PlanDiagonalAngleSplitOutcome =
  | { readonly ok: true; readonly preview: PanelKnifePreview; readonly result: PanelKnifeCommitResult }
  | { readonly ok: false; readonly reason: PanelKnifeRejectReason; readonly message: string; readonly preview: PanelKnifePreview };

const REJECT_MESSAGES: Readonly<Record<PanelKnifeRejectReason, string>> = {
  "frame-locked": "잠긴 컷은 분할할 수 없습니다. 컷 잠금을 해제한 뒤 다시 시도하세요.",
  "drag-too-short": "컷 경계를 가로지르도록 조금 더 길게 드래그하세요.",
  "no-intersection": "칼선이 컷 영역을 가로지르지 않습니다.",
  "side-too-small": "분할된 각 컷의 최소 폭과 높이는 24px 이상이어야 합니다.",
  "area-too-small": "분할된 각 컷의 최소 면적은 900px² 이상이어야 합니다.",
};

const round2 = (v: number): number => Math.round(v * 100) / 100;
const frameLabelText = (frame: PanelKnifeFrameEl): string => frame.name?.trim() || frame.id;

/** 나이프 거터 폭을 허용 범위(24~96px) 안으로 정규화한다. */
export function clampPanelKnifeGutter(px: number): number {
  if (!Number.isFinite(px)) return PANEL_KNIFE_DEFAULT_GUTTER_PX;
  return Math.round(Math.min(PANEL_KNIFE_MAX_GUTTER_PX, Math.max(PANEL_KNIFE_MIN_GUTTER_PX, px)));
}

/** 시작점 기준 15° 배수로 끝점을 각도 스냅한다. */
export function snapPanelKnifePoint(start: PanelKnifePoint, end: PanelKnifePoint, enabled: boolean): PanelKnifePoint {
  if (!enabled) return { x: end.x, y: end.y };
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  if (dist < EPS) return { x: end.x, y: end.y };
  const rad = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / SNAP_STEP_RAD) * SNAP_STEP_RAD;
  return { x: round2(start.x + dist * Math.cos(rad)), y: round2(start.y + dist * Math.sin(rad)) };
}

/** 절단선 기울기 각도를 [-90, 90]° 범위로 정규화한다. */
export function computeKnifeAngleDeg(start: PanelKnifePoint, end: PanelKnifePoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < EPS) return 0;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return Math.round(deg * 10) / 10;
}

/** 포인터 이벤트가 진행 중인 나이프 세션과 동일한 포인터인지 판별한다. */
export function ownsPanelKnifePointer(session: PanelKnifePointerSession, event: { readonly pointerId?: number }): boolean {
  return session.pointerId === (Number.isFinite(event.pointerId) ? event.pointerId! : 1);
}

/** FrameEl을 전역 좌표 ComicPanelPolygon으로 변환한다. */
export function frameElToComicPanelPolygon(frame: PanelKnifeFrameEl): ComicPanelPolygon {
  if (frame.points && frame.points.length >= 6 && frame.points.length % 2 === 0) {
    const points: PanelPoint[] = [];
    for (let i = 0; i < frame.points.length; i += 2) {
      points.push({ x: frame.x + frame.points[i]!, y: frame.y + frame.points[i + 1]! });
    }
    return { id: frame.id, points };
  }
  const { x, y, width: w, height: h } = frame;
  return { id: frame.id, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
}

function normalizeClockwise(points: readonly PanelPoint[], minDistPx = 0.5): PanelPoint[] {
  const cleaned: PanelPoint[] = [];
  for (const pt of points) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) >= minDistPx) cleaned.push({ x: pt.x, y: pt.y });
  }
  while (cleaned.length >= 2 && Math.hypot(cleaned[0]!.x - cleaned[cleaned.length - 1]!.x, cleaned[0]!.y - cleaned[cleaned.length - 1]!.y) < minDistPx) {
    cleaned.pop();
  }
  if (cleaned.length < 3) return cleaned;
  let twiceArea = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = cleaned[i]!;
    const b = cleaned[(i + 1) % cleaned.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea < 0 ? cleaned.reverse() : cleaned;
}

function polygonBounds(points: readonly PanelPoint[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function polygonNormalThickness(points: readonly PanelPoint[], nx: number, ny: number): number {
  let minP = Infinity, maxP = -Infinity;
  for (const pt of points) {
    const p = pt.x * nx + pt.y * ny;
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }
  return maxP - minP;
}

/** 다각형 정점을 기존 FrameEl 스타일을 계승한 새 FrameEl로 변환한다. */
export function polygonToFrameEl(id: string, rawPoints: readonly PanelPoint[], template: PanelKnifeFrameEl, label?: string): PanelKnifeFrameEl {
  const ordered = normalizeClockwise(rawPoints);
  const bounds = polygonBounds(ordered);
  const x = round2(bounds.minX);
  const y = round2(bounds.minY);
  const width = Math.max(1, round2(bounds.width));
  const height = Math.max(1, round2(bounds.height));
  const localPoints: number[] = [];
  for (const pt of ordered) localPoints.push(round2(pt.x - x), round2(pt.y - y));

  const corners: readonly (readonly [number, number])[] = [[0, 0], [width, 0], [width, height], [0, height]];
  const rectOnly =
    localPoints.length === 8 &&
    [0, 1, 2, 3].every((i) => corners.some(([cx, cy]) => Math.abs(localPoints[i * 2]! - cx) <= 0.05 && Math.abs(localPoints[i * 2 + 1]! - cy) <= 0.05));
  const { points: _dropPoints, id: _dropId, ...rest } = template;
  return { ...rest, id, type: "frame", x, y, width, height, ...(label ? { name: label } : {}), ...(rectOnly ? {} : { points: localPoints }) };
}

/** 무한 절단선과 대상 컷 다각형 경계의 교차 선분(시각 미리보기용)을 계산한다. */
export function computeLinePolygonCutSegment(
  polygon: readonly PanelPoint[],
  start: PanelKnifePoint,
  end: PanelKnifePoint,
): readonly [PanelKnifePoint, PanelKnifePoint] | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS || polygon.length < 3) return null;

  const ux = dx / len, uy = dy / len;
  const dist = (pt: PanelPoint) => (pt.x - start.x) * -uy + (pt.y - start.y) * ux;
  const hits: PanelPoint[] = [];
  const pushHit = (pt: PanelPoint) => {
    if (!hits.some((item) => Math.hypot(item.x - pt.x, item.y - pt.y) < 0.5)) hits.push({ x: round2(pt.x), y: round2(pt.y) });
  };
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const da = dist(a), db = dist(b);
    if (Math.abs(da) <= 0.25) pushHit(a);
    else if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      pushHit({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  if (hits.length < 2) return null;
  hits.sort((p, q) => (p.x - start.x) * ux + (p.y - start.y) * uy - ((q.x - start.x) * ux + (q.y - start.y) * uy));
  const first = hits[0]!, last = hits[hits.length - 1]!;
  return Math.hypot(last.x - first.x, last.y - first.y) >= 1 ? [first, last] : null;
}

function pointInPolygon(pt: PanelPoint, polygon: readonly PanelPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const { x: xi, y: yi } = polygon[i]!;
    const { x: xj, y: yj } = polygon[j]!;
    const edgeLen = Math.hypot(xj - xi, yj - yi);
    if (
      edgeLen > EPS &&
      Math.abs((pt.y - yi) * (xj - xi) - (pt.x - xi) * (yj - yi)) / edgeLen <= 0.5 &&
      pt.x >= Math.min(xi, xj) - 0.5 && pt.x <= Math.max(xi, xj) + 0.5 &&
      pt.y >= Math.min(yi, yj) - 0.5 && pt.y <= Math.max(yi, yj) + 0.5
    ) return true;
    if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function clipAxisHalfPlane(points: readonly PanelPoint[], axis: "x" | "y", bound: number, keepGe: boolean): PanelPoint[] {
  if (points.length === 0) return [];
  const val = (pt: PanelPoint) => (axis === "x" ? pt.x : pt.y);
  const inside = (pt: PanelPoint) => (keepGe ? val(pt) >= bound : val(pt) <= bound);
  const hit = (a: PanelPoint, b: PanelPoint): PanelPoint => {
    const denom = val(b) - val(a);
    const t = Math.abs(denom) > 1e-9 ? (bound - val(a)) / denom : 0;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };
  const out: PanelPoint[] = [];
  let prev = points[points.length - 1]!, prevIn = inside(prev);
  for (const curr of points) {
    const currIn = inside(curr);
    if (currIn) {
      if (!prevIn) out.push(hit(prev, curr));
      out.push(curr);
    } else if (prevIn) out.push(hit(prev, curr));
    prev = curr;
    prevIn = currIn;
  }
  return out;
}

/** 요소 경계(또는 직선 획)가 대상 컷 다각형과 겹치는 비율(0..1)을 계산한다. */
export function computeElementPolygonOverlapRatio(element: El, polygon: readonly PanelPoint[]): number {
  if (polygon.length < 3) return 0;
  const bounds = elBounds(element);
  const rectArea = bounds.w * bounds.h;
  if (!(rectArea > 1e-3)) {
    if (element.type === "draw" && element.points.length >= 2) {
      const samples: PanelPoint[] = [];
      for (let i = 0; i < element.points.length; i += 2) {
        const px = element.points[i]!, py = element.points[i + 1]!;
        samples.push({ x: px, y: py });
        if (i + 3 < element.points.length) samples.push({ x: (px + element.points[i + 2]!) * 0.5, y: (py + element.points[i + 3]!) * 0.5 });
      }
      return samples.length > 0 ? samples.filter((pt) => pointInPolygon(pt, polygon)).length / samples.length : 0;
    }
    return pointInPolygon({ x: bounds.x + bounds.w * 0.5, y: bounds.y + bounds.h * 0.5 }, polygon) ? 1 : 0;
  }
  let clipped = clipAxisHalfPlane(polygon, "x", bounds.x, true);
  clipped = clipAxisHalfPlane(clipped, "x", bounds.x + bounds.w, false);
  clipped = clipAxisHalfPlane(clipped, "y", bounds.y, true);
  clipped = clipAxisHalfPlane(clipped, "y", bounds.y + bounds.h, false);
  return clipped.length >= 3 ? Math.max(0, Math.min(1, getPolygonArea(clipped) / rectArea)) : 0;
}

/** 컷 프레임에 연결된 기존 클리핑 컷 폴더(LayerGroup)를 찾는다. */
export function findFrameFolderGroup(
  frame: PanelKnifeFrameEl,
  elements: readonly El[],
  groups: readonly LayerGroup[],
  explicitGroupId?: string | null,
): LayerGroup | null {
  if (explicitGroupId) {
    const matched = groups.find((group) => group.id === explicitGroupId);
    if (matched) return matched;
  }
  if (groups.length === 0) return null;
  const namedTargets = new Set<string>([formatFrameFolderGroupName(frame.id)]);
  if (frame.name?.trim()) namedTargets.add(formatFrameFolderGroupName(frame.name));
  const byName = groups.find((group) => namedTargets.has(group.name));
  if (byName) return byName;

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const hits = new Set<string>();
  for (const el of elements) {
    if (el.type === "frame" || el.hidden || !el.groupId) continue;
    const group = groupById.get(el.groupId);
    if (!group || !group.name.startsWith("컷 폴더")) continue;
    if (el.frameClipId === frame.id || (el.frameClipId === undefined && containingPanel(el, elements)?.id === frame.id)) hits.add(group.id);
  }
  return hits.size === 1 ? (groupById.get([...hits][0]!) ?? null) : null;
}

/** 원본 컷에 귀속된 요소를 두 분할 컷 다각형과의 겹침 비율(>= 0.5)에 따라 재할당한다. */
export function reassignElementsForSplitFrames(input: {
  readonly targetFrame: PanelKnifeFrameEl;
  readonly frameA: PanelKnifeFrameEl;
  readonly frameB: PanelKnifeFrameEl;
  readonly polyA: readonly PanelPoint[];
  readonly polyB: readonly PanelPoint[];
  readonly elements: readonly El[];
  readonly sourceFolderGroupId: string | null;
  readonly overlapThreshold?: number;
  readonly folderAId?: string;
  readonly folderBId?: string;
}): readonly PanelKnifeElementReassignment[] {
  const threshold = Math.max(0.05, Math.min(1, input.overlapThreshold ?? PANEL_KNIFE_OVERLAP_THRESHOLD));
  const out: PanelKnifeElementReassignment[] = [];

  for (const el of input.elements) {
    if (el.type === "frame" || el.hidden) continue;
    const owned =
      el.frameClipId === input.targetFrame.id ||
      (input.sourceFolderGroupId !== null && el.groupId === input.sourceFolderGroupId) ||
      (el.frameClipId === undefined && containingPanel(el, input.elements)?.id === input.targetFrame.id);
    if (!owned) continue;

    const overlapA = round2(computeElementPolygonOverlapRatio(el, input.polyA));
    const overlapB = round2(computeElementPolygonOverlapRatio(el, input.polyB));
    const canRebindFolder = el.groupId === undefined || el.groupId === input.sourceFolderGroupId;
    let assignedFrameId: string | null = null;
    let assignedOverlap = 0;
    let nextGroupId = el.groupId;

    if (overlapA >= threshold && overlapA >= overlapB) {
      assignedFrameId = input.frameA.id;
      assignedOverlap = overlapA;
      if (canRebindFolder && input.folderAId) nextGroupId = input.folderAId;
    } else if (overlapB >= threshold && overlapB > overlapA) {
      assignedFrameId = input.frameB.id;
      assignedOverlap = overlapB;
      if (canRebindFolder && input.folderBId) nextGroupId = input.folderBId;
    } else if (el.groupId === input.sourceFolderGroupId) {
      nextGroupId = undefined;
    }

    out.push({
      elementId: el.id,
      previousFrameId: el.frameClipId ?? input.targetFrame.id,
      assignedFrameId,
      overlapA,
      overlapB,
      assignedOverlap,
      ...(el.groupId !== undefined ? { previousGroupId: el.groupId } : {}),
      ...(nextGroupId !== undefined ? { nextGroupId } : {}),
    });
  }
  return out;
}

function buildInvalidPreview(meta: PreviewGeometryMeta, reason: PanelKnifeRejectReason): PanelKnifePreview {
  return {
    ...meta, valid: false, rejectReason: reason, statusMessage: REJECT_MESSAGES[reason],
    previewPolygons: null, previewSvgPaths: null, previewFrames: null, areasPx2: null,
    reassignments: [], assignedCountA: 0, assignedCountB: 0, unassignedCount: 0,
  };
}

function validateAndBuildPreview(
  targetFrame: PanelKnifeFrameEl,
  meta: PreviewGeometryMeta,
  rawPair: readonly [readonly PanelPoint[], readonly PanelPoint[]],
  normal: PanelPoint,
  opts: { elements: readonly El[]; sourceFolderGroupId: string | null; overlapThreshold: number; frameIds?: readonly [string, string] },
): PanelKnifePreview {
  const cA = normalizeClockwise(rawPair[0]);
  const cB = normalizeClockwise(rawPair[1]);
  if (cA.length < 3 || cB.length < 3) return buildInvalidPreview(meta, "no-intersection");

  const b0 = polygonBounds(cA), b1 = polygonBounds(cB);
  const swap = b0.minY > b1.minY + 2 || (Math.abs(b0.minY - b1.minY) <= 2 && b0.minX > b1.minX);
  const [polyA, polyB] = swap ? [cB, cA] : [cA, cB];
  const [bA, bB] = swap ? [b1, b0] : [b0, b1];
  if (
    bA.width < PANEL_KNIFE_MIN_SIDE_PX || bA.height < PANEL_KNIFE_MIN_SIDE_PX ||
    bB.width < PANEL_KNIFE_MIN_SIDE_PX || bB.height < PANEL_KNIFE_MIN_SIDE_PX ||
    polygonNormalThickness(polyA, normal.x, normal.y) < PANEL_KNIFE_MIN_SIDE_PX ||
    polygonNormalThickness(polyB, normal.x, normal.y) < PANEL_KNIFE_MIN_SIDE_PX
  ) return buildInvalidPreview(meta, "side-too-small");

  const areaA = round2(getPolygonArea(polyA));
  const areaB = round2(getPolygonArea(polyB));
  if (areaA < PANEL_KNIFE_MIN_AREA_PX2 || areaB < PANEL_KNIFE_MIN_AREA_PX2) return buildInvalidPreview(meta, "area-too-small");

  const baseLabel = frameLabelText(targetFrame);
  const [idA, idB] = opts.frameIds ?? [`${targetFrame.id}-1`, `${targetFrame.id}-2`];
  const frameA = polygonToFrameEl(idA, polyA, targetFrame, `${baseLabel}-1`);
  const frameB = polygonToFrameEl(idB, polyB, targetFrame, `${baseLabel}-2`);
  const borderWidth = frameA.strokeWidth ?? 2;
  const previewSvgPaths: readonly [string, string] = [
    polygonFrameToSvgPath({ id: frameA.id, vertices: polyA, borderWidth, gutter: meta.gutterPx }),
    polygonFrameToSvgPath({ id: frameB.id, vertices: polyB, borderWidth, gutter: meta.gutterPx }),
  ];

  const reassignments = reassignElementsForSplitFrames({
    targetFrame, frameA, frameB, polyA, polyB,
    elements: opts.elements, sourceFolderGroupId: opts.sourceFolderGroupId, overlapThreshold: opts.overlapThreshold,
  });
  let assignedCountA = 0, assignedCountB = 0, unassignedCount = 0;
  for (const entry of reassignments) {
    if (entry.assignedFrameId === frameA.id) assignedCountA += 1;
    else if (entry.assignedFrameId === frameB.id) assignedCountB += 1;
    else unassignedCount += 1;
  }

  return {
    ...meta, valid: true, rejectReason: null,
    statusMessage: reassignments.length > 0
      ? `분할 가능 · 앞 컷 ${assignedCountA}개 · 뒤 컷 ${assignedCountB}개 요소 배치`
      : `분할 가능 · 여백 ${meta.gutterPx}px · 기울기 ${Math.round(meta.angleDeg)}°`,
    previewPolygons: [polyA, polyB], previewSvgPaths, previewFrames: [frameA, frameB],
    areasPx2: [areaA, areaB], reassignments, assignedCountA, assignedCountB, unassignedCount,
  };
}

/** 직선/사선 드래그 구간으로 컷 분할 미리보기를 평가한다(`splitComicPanelPolygon` 재사용). */
export function evaluatePanelKnifeCut(input: {
  readonly targetFrame: PanelKnifeFrameEl;
  readonly start: PanelKnifePoint;
  readonly end: PanelKnifePoint;
  readonly gutterPx: number;
  readonly snapped?: boolean;
  readonly elements?: readonly El[];
  readonly sourceFolderGroupId?: string | null;
  readonly overlapThreshold?: number;
  readonly frameIds?: readonly [string, string];
}): PanelKnifePreview {
  const gutterPx = clampPanelKnifeGutter(input.gutterPx);
  const metaBase: PreviewGeometryMeta = {
    targetFrameId: input.targetFrame.id, start: input.start, end: input.end,
    snapped: input.snapped ?? false, angleDeg: computeKnifeAngleDeg(input.start, input.end), gutterPx, cutSegment: null,
  };
  if (input.targetFrame.locked) return buildInvalidPreview(metaBase, "frame-locked");

  const dx = input.end.x - input.start.x, dy = input.end.y - input.start.y;
  const dragLen = Math.hypot(dx, dy);
  if (dragLen < PANEL_KNIFE_MIN_DRAG_PX) return buildInvalidPreview(metaBase, "drag-too-short");

  const panelPoly = frameElToComicPanelPolygon(input.targetFrame);
  const meta: PreviewGeometryMeta = { ...metaBase, cutSegment: computeLinePolygonCutSegment(panelPoly.points, input.start, input.end) };
  const split = splitComicPanelPolygon(panelPoly, { start: input.start, end: input.end, gutterWidthPx: gutterPx });
  if (!split) return buildInvalidPreview(meta, "no-intersection");

  return validateAndBuildPreview(input.targetFrame, meta, [split[0].points, split[1].points], { x: -dy / dragLen, y: dx / dragLen }, {
    elements: input.elements ?? [],
    sourceFolderGroupId: input.sourceFolderGroupId ?? null,
    overlapThreshold: input.overlapThreshold ?? PANEL_KNIFE_OVERLAP_THRESHOLD,
    frameIds: input.frameIds,
  });
}

function applyKnifeSplitToDocument(
  targetFrame: PanelKnifeFrameEl,
  preview: PanelKnifePreview,
  opts: {
    elements: readonly El[];
    groups: readonly LayerGroup[];
    sourceFolderGroupId: string | null;
    ensureFrameFolders: boolean;
    overlapThreshold: number;
  } & PanelKnifeIdFactories,
): PanelKnifeCommitResult {
  const [polyA, polyB] = preview.previewPolygons!;
  const [frameIdA, frameIdB] = opts.makeFrameIds?.(targetFrame.id) ?? [`${targetFrame.id}-1`, `${targetFrame.id}-2`];
  const baseLabel = frameLabelText(targetFrame);
  const labelA = `${baseLabel}-1`, labelB = `${baseLabel}-2`;
  const frameA = polygonToFrameEl(frameIdA, polyA, targetFrame, labelA);
  const frameB = polygonToFrameEl(frameIdB, polyB, targetFrame, labelB);

  const shouldCreateFolders =
    opts.ensureFrameFolders || (opts.sourceFolderGroupId !== null && opts.groups.some((g) => g.id === opts.sourceFolderGroupId));
  const [folderIdA, folderIdB] = opts.makeFolderIds?.(targetFrame.id) ?? [`folder-${frameIdA}`, `folder-${frameIdB}`];

  const reassignments = reassignElementsForSplitFrames({
    targetFrame, frameA, frameB, polyA, polyB,
    elements: opts.elements, sourceFolderGroupId: opts.sourceFolderGroupId, overlapThreshold: opts.overlapThreshold,
    ...(shouldCreateFolders ? { folderAId: folderIdA, folderBId: folderIdB } : {}),
  });
  const byId = new Map(reassignments.map((entry) => [entry.elementId, entry]));

  let replacedFrame = false;
  let workingElements: El[] = [];
  for (const el of opts.elements) {
    if (el.id === targetFrame.id) {
      workingElements.push(frameA, frameB);
      replacedFrame = true;
      continue;
    }
    const reassigned = byId.get(el.id);
    if (!reassigned) {
      workingElements.push(el);
      continue;
    }
    const nextEl: El = { ...el };
    if (reassigned.assignedFrameId !== null) nextEl.frameClipId = reassigned.assignedFrameId;
    else if (nextEl.frameClipId === targetFrame.id) delete nextEl.frameClipId;
    if (opts.sourceFolderGroupId !== null && nextEl.groupId === opts.sourceFolderGroupId) delete nextEl.groupId;
    workingElements.push(nextEl);
  }
  if (!replacedFrame) workingElements = [...workingElements, frameA, frameB];

  let workingGroups: LayerGroup[] = opts.sourceFolderGroupId !== null
    ? opts.groups.filter((g) => g.id !== opts.sourceFolderGroupId)
    : [...opts.groups];
  const createdFolders: LayerGroup[] = [];

  if (shouldCreateFolders) {
    for (const [fId, fLabel, gId] of [[frameA.id, labelA, folderIdA], [frameB.id, labelB, folderIdB]] as const) {
      const seedIds = reassignments.filter((e) => e.assignedFrameId === fId && e.nextGroupId === gId).map((e) => e.elementId);
      const bound = seedIds.length > 0
        ? planBindSelectionToFrameFolder({ frameId: fId, frameLabel: fLabel, groupId: gId, seedIds, items: workingElements, groups: workingGroups })
        : null;
      if (bound) {
        workingElements = [...bound.items];
        workingGroups = [...workingGroups, bound.group];
        createdFolders.push(bound.group);
      } else {
        const emptyFolder = createFrameFolderGroupForNewFrame({ frameLabel: fLabel, groupId: gId });
        if (emptyFolder) {
          workingGroups = [...workingGroups, emptyFolder];
          createdFolders.push(emptyFolder);
        }
      }
    }
  }

  return {
    targetFrameId: targetFrame.id,
    frames: [frameA, frameB],
    elements: workingElements,
    groups: workingGroups,
    sourceFolderGroupId: opts.sourceFolderGroupId,
    createdFolders,
    reassignments,
    sharedGutter: planSharedGutterSegments([frameA, frameB], { maxGapPx: Math.max(120, preview.gutterPx + 16) })[0] ?? null,
    gutterPx: preview.gutterPx,
    angleDeg: preview.angleDeg,
  };
}

/** 캔버스 위 직선/사선 컷 분할 나이프 포인터 세션을 시작한다. */
export function beginPanelKnifePointerSession(input: BeginPanelKnifeSessionInput): PanelKnifePointerSession {
  const gutterPx = clampPanelKnifeGutter(input.gutterPx ?? PANEL_KNIFE_DEFAULT_GUTTER_PX);
  const snap15Deg = input.snap15Deg ?? false;
  const overlapThreshold = input.overlapThreshold ?? PANEL_KNIFE_OVERLAP_THRESHOLD;
  const elements = input.elements ?? [];
  const sourceFolderGroupId = findFrameFolderGroup(input.targetFrame, elements, input.groups ?? [], input.sourceFolderGroupId)?.id ?? null;
  const start = { x: input.start.x, y: input.start.y };
  const preview = evaluatePanelKnifeCut({
    targetFrame: input.targetFrame, start, end: start, gutterPx, snapped: snap15Deg, elements, sourceFolderGroupId, overlapThreshold,
  });
  return {
    phase: "dragging",
    pointerId: Number.isFinite(input.pointerId) ? input.pointerId! : 1,
    targetFrame: input.targetFrame,
    start,
    current: start,
    gutterPx,
    snap15Deg,
    overlapThreshold,
    ensureFrameFolders: input.ensureFrameFolders ?? true,
    sourceFolderGroupId,
    preview,
  };
}

/** 포인터 이동 중 실시간 분할선·다각형·요소 재할당 미리보기를 갱신한다. */
export function updatePanelKnifePointerSession(
  session: PanelKnifePointerSession,
  input: UpdatePanelKnifeSessionInput,
): PanelKnifePointerSession {
  if (session.phase !== "dragging") return session;
  const snapped = Boolean(input.shiftKey || session.snap15Deg);
  const current = snapPanelKnifePoint(session.start, input.point, snapped);
  const gutterPx = input.gutterPx !== undefined ? clampPanelKnifeGutter(input.gutterPx) : session.gutterPx;
  const elements = input.elements ?? [];
  const sourceFolderGroupId = input.groups !== undefined
    ? findFrameFolderGroup(session.targetFrame, elements, input.groups, session.sourceFolderGroupId)?.id ?? null
    : session.sourceFolderGroupId;
  const preview = evaluatePanelKnifeCut({
    targetFrame: session.targetFrame, start: session.start, end: current, gutterPx, snapped,
    elements, sourceFolderGroupId, overlapThreshold: session.overlapThreshold,
  });
  return { ...session, current, gutterPx, sourceFolderGroupId, preview };
}

/** 포인터 해제 시 나이프 분할을 확정하고 컷·요소 바인딩·컷 폴더 변경 계획을 반환한다. */
export function commitPanelKnifePointerSession(
  session: PanelKnifePointerSession,
  input: CommitPanelKnifeSessionInput = {},
): CommitPanelKnifeSessionOutcome {
  if (session.phase === "cancelled") {
    return { ok: false, session, reason: session.preview.rejectReason ?? "no-intersection", message: session.preview.statusMessage };
  }
  const latest =
    input.point !== undefined || input.gutterPx !== undefined || input.elements !== undefined
      ? updatePanelKnifePointerSession(session.phase === "dragging" ? session : { ...session, phase: "dragging" }, {
          point: input.point ?? session.current, shiftKey: input.shiftKey, gutterPx: input.gutterPx, elements: input.elements, groups: input.groups,
        })
      : session;

  if (!latest.preview.valid || !latest.preview.previewPolygons) {
    return {
      ok: false,
      session: { ...latest, phase: "cancelled" },
      reason: latest.preview.rejectReason ?? "no-intersection",
      message: latest.preview.statusMessage,
    };
  }
  const result = applyKnifeSplitToDocument(latest.targetFrame, latest.preview, {
    elements: input.elements ?? [], groups: input.groups ?? [],
    sourceFolderGroupId: latest.sourceFolderGroupId, ensureFrameFolders: latest.ensureFrameFolders,
    overlapThreshold: latest.overlapThreshold, makeFrameIds: input.makeFrameIds, makeFolderIds: input.makeFolderIds,
  });
  return { ok: true, session: { ...latest, phase: "committed" }, result };
}

/** 진행 중인 나이프 포인터 세션을 취소한다. */
export function cancelPanelKnifePointerSession(session: PanelKnifePointerSession): PanelKnifePointerSession {
  return session.phase === "cancelled" ? session : { ...session, phase: "cancelled" };
}

/**
 * 지정 각도(`angleDeg`, -75°~75°)와 분할 비율(`offsetRatio`)로 컷을 즉시 사선 2분할한다.
 * 직사각형 컷에는 `splitFrameDiagonal`을 직접 재사용하고, 다각형 컷은 `splitComicPanelPolygon`으로 분할한다.
 */
export function planDiagonalAnglePanelSplit(input: PlanDiagonalAngleSplitInput): PlanDiagonalAngleSplitOutcome {
  const gutterPx = clampPanelKnifeGutter(input.gutterPx ?? PANEL_KNIFE_DEFAULT_GUTTER_PX);
  const safeAngle = Math.max(-75, Math.min(75, Number.isFinite(input.angleDeg) ? input.angleDeg : 0));
  const ratio = Math.max(0.15, Math.min(0.85, input.offsetRatio ?? 0.5));
  const elements = input.elements ?? [];
  const groups = input.groups ?? [];
  const overlapThreshold = input.overlapThreshold ?? PANEL_KNIFE_OVERLAP_THRESHOLD;
  const sourceFolderGroupId = findFrameFolderGroup(input.targetFrame, elements, groups, input.sourceFolderGroupId)?.id ?? null;

  const cx = input.targetFrame.x + input.targetFrame.width * 0.5;
  const cy = input.targetFrame.y + input.targetFrame.height * ratio;
  const span = Math.hypot(input.targetFrame.width, input.targetFrame.height) + gutterPx + 24;
  const rad = (safeAngle * Math.PI) / 180;
  const start: PanelKnifePoint = { x: round2(cx - Math.cos(rad) * span), y: round2(cy - Math.sin(rad) * span) };
  const end: PanelKnifePoint = { x: round2(cx + Math.cos(rad) * span), y: round2(cy + Math.sin(rad) * span) };
  const metaBase: PreviewGeometryMeta = {
    targetFrameId: input.targetFrame.id, start, end, snapped: true, angleDeg: safeAngle, gutterPx, cutSegment: null,
  };
  if (input.targetFrame.locked) {
    const preview = buildInvalidPreview(metaBase, "frame-locked");
    return { ok: false, reason: "frame-locked", message: preview.statusMessage, preview };
  }

  const isPolygonFrame = Array.isArray(input.targetFrame.points) && input.targetFrame.points.length >= 6;
  const frameIds = input.makeFrameIds?.(input.targetFrame.id);
  const preview = !isPolygonFrame
    ? (() => {
        const [topFrame, bottomFrame] = splitFrameDiagonal(
          { x: input.targetFrame.x, y: input.targetFrame.y, w: input.targetFrame.width, h: input.targetFrame.height },
          safeAngle,
          gutterPx,
          { offsetRatio: ratio, borderWidth: input.targetFrame.strokeWidth ?? 2, topId: frameIds?.[0] ?? `${input.targetFrame.id}-1`, bottomId: frameIds?.[1] ?? `${input.targetFrame.id}-2` },
        );
        const cutSegment = computeLinePolygonCutSegment(frameElToComicPanelPolygon(input.targetFrame).points, start, end);
        return validateAndBuildPreview(input.targetFrame, { ...metaBase, cutSegment }, [topFrame.vertices, bottomFrame.vertices], { x: -Math.sin(rad), y: Math.cos(rad) }, {
          elements, sourceFolderGroupId, overlapThreshold, frameIds,
        });
      })()
    : evaluatePanelKnifeCut({ targetFrame: input.targetFrame, start, end, gutterPx, snapped: true, elements, sourceFolderGroupId, overlapThreshold, frameIds });

  if (!preview.valid || !preview.previewPolygons) {
    return { ok: false, reason: preview.rejectReason ?? "no-intersection", message: preview.statusMessage, preview };
  }
  const result = applyKnifeSplitToDocument(input.targetFrame, preview, {
    elements, groups, sourceFolderGroupId, ensureFrameFolders: input.ensureFrameFolders ?? true, overlapThreshold,
    makeFrameIds: input.makeFrameIds, makeFolderIds: input.makeFolderIds,
  });
  return { ok: true, preview, result };
}
