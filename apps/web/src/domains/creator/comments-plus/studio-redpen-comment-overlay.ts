/**
 * Studio Redpen Comment Overlay & Cut-Normalized Pin Anchor (#066–#070).
 *
 * - 비파괴 빨간펜 오버레이: 캔버스 드로잉 레이어를 생성·오염시키지 않고
 *   코멘트 스레드 상태 안에 반투명 빨간펜 스트로크를 정규화 좌표로 보관한다.
 * - 1클릭 수락 체크완료 + 해결/재열기 감사 로그: 모든 상태 전이를
 *   작성자·시각·리비전과 함께 불변 로그로 기록한다.
 * - 컷 정규화 (u, v) ∈ [0, 1] 앵커: 컷 높이가 리사이즈되거나 크롭되어도
 *   핀과 빨간펜 주석이 허공에 뜨지 않도록 컷 바운딩 박스 기준으로 변환·복원·클램프한다.
 * - 결정론적 동시 편집 병합: 교환법칙·결합법칙·멱등성을 만족하는 CRDT 병합을 제공한다.
 *
 * 전부 순수·결정적 함수이며 DOM·브라우저 스토리지 의존성이 없다.
 */

export const DEFAULT_REDPEN_COLOR = "#ef4444";
export const DEFAULT_REDPEN_OPACITY = 0.65;
export const DEFAULT_REDPEN_WIDTH_PX = 3;
export const MIN_REDPEN_OPACITY = 0.1;
export const MAX_REDPEN_OPACITY = 1;
export const MIN_REDPEN_WIDTH_PX = 1;
export const MAX_REDPEN_WIDTH_PX = 24;
export const MAX_REDPEN_STROKES_PER_THREAD = 64;
export const MAX_REDPEN_POINTS_PER_STROKE = 2_048;

export type CutClampEdge = "left" | "right" | "top" | "bottom";

export interface CutBoundingBox {
  readonly cutId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedCutPinAnchor {
  readonly cutId: string;
  /** 컷 좌측(0) ~ 우측(1) 정규화 좌표. */
  readonly u: number;
  /** 컷 상단(0) ~ 하단(1) 정규화 좌표. */
  readonly v: number;
  /** 크롭·경계 이탈로 클램프되었는지 여부. */
  readonly clamped?: boolean;
  /** 클램프된 컷 경계 목록 (결정론 순서). */
  readonly clampedEdges?: readonly CutClampEdge[];
}

export interface PinAnchorResolution {
  readonly anchor: NormalizedCutPinAnchor;
  readonly canvasPoint: CanvasPoint;
  readonly wasClamped: boolean;
  readonly clampedEdges: readonly CutClampEdge[];
}

export interface RedpenStrokePoint {
  readonly u: number;
  readonly v: number;
  readonly pressure?: number;
}

export interface RedpenStroke {
  readonly id: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: number;
  readonly color: string;
  readonly opacity: number;
  readonly widthPx: number;
  readonly points: readonly RedpenStrokePoint[];
}

export interface RedpenStrokeInput {
  readonly id: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: number;
  readonly color?: string;
  readonly opacity?: number;
  readonly widthPx?: number;
  readonly points: readonly RedpenStrokePoint[];
}

export interface RedpenAuditActor {
  readonly id: string;
  readonly name: string;
}

export type CommentResolutionAction = "accept-and-resolve" | "resolve" | "reopen";

export interface CommentResolutionAuditEntry {
  readonly id: string;
  readonly threadId: string;
  readonly action: CommentResolutionAction;
  readonly actorId: string;
  readonly actorName: string;
  readonly timestamp: number;
  readonly revision: number;
  readonly previousResolved: boolean;
  readonly nextResolved: boolean;
  readonly note?: string;
}

export interface RedpenOverlayThreadState {
  readonly threadId: string;
  /** 비파괴 계약: 캔버스 드로잉 레이어와 완전히 분리되어 null로 고정된다. */
  readonly canvasLayerId: null;
  readonly anchor: NormalizedCutPinAnchor;
  readonly strokes: readonly RedpenStroke[];
  /** 동시 삭제 수렴을 위한 삭제 스트로크 ID 툼스톤. */
  readonly removedStrokeIds: readonly string[];
  readonly visible: boolean;
  readonly resolved: boolean;
  readonly revision: number;
  readonly updatedAt: number;
  readonly updatedById: string;
  readonly auditLog: readonly CommentResolutionAuditEntry[];
}

export interface ProjectedRedpenStrokePath {
  readonly strokeId: string;
  readonly d: string;
  readonly points: readonly CanvasPoint[];
  readonly color: string;
  readonly opacity: number;
  readonly widthPx: number;
}

// ── 정규화·클램프 수학 유틸리티 ──────────────────────────────────────────

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return normalizeZero(value);
}

function clampFiniteRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return normalizeZero(value);
}

function clampCoordWithEdge(
  raw: number,
  lowEdge: CutClampEdge,
  highEdge: CutClampEdge,
  edges: CutClampEdge[],
): number {
  if (!Number.isFinite(raw)) {
    edges.push(lowEdge);
    return 0.5;
  }
  if (raw < 0) {
    edges.push(lowEdge);
    return 0;
  }
  if (raw > 1) {
    edges.push(highEdge);
    return 1;
  }
  return normalizeZero(raw);
}

function safeCutDimensions(cutBox: CutBoundingBox): {
  x: number;
  y: number;
  width: number;
  height: number;
  degenerateWidth: boolean;
  degenerateHeight: boolean;
} {
  const x = Number.isFinite(cutBox.x) ? normalizeZero(cutBox.x) : 0;
  const y = Number.isFinite(cutBox.y) ? normalizeZero(cutBox.y) : 0;
  const degenerateWidth = !Number.isFinite(cutBox.width) || cutBox.width <= 0;
  const degenerateHeight = !Number.isFinite(cutBox.height) || cutBox.height <= 0;
  return {
    x,
    y,
    width: degenerateWidth ? 0 : normalizeZero(cutBox.width),
    height: degenerateHeight ? 0 : normalizeZero(cutBox.height),
    degenerateWidth,
    degenerateHeight,
  };
}

/**
 * 캔버스 절대 좌표 `(x, y)`를 컷 바운딩 박스 기준 정규화 좌표 `(u, v) ∈ [0, 1]`로 변환한다.
 * 컷 바깥 좌표는 가장 가까운 컷 경계로 클램프하여 핀이 허공에 뜨지 않게 한다.
 */
export function canvasPointToCutNormalizedAnchor(
  point: CanvasPoint,
  cutBox: CutBoundingBox,
): NormalizedCutPinAnchor {
  const safe = safeCutDimensions(cutBox);
  const edges: CutClampEdge[] = [];
  const u = safe.degenerateWidth
    ? (edges.push("left"), 0.5)
    : clampCoordWithEdge((point.x - safe.x) / safe.width, "left", "right", edges);
  const v = safe.degenerateHeight
    ? (edges.push("top"), 0.5)
    : clampCoordWithEdge((point.y - safe.y) / safe.height, "top", "bottom", edges);

  return edges.length > 0
    ? { cutId: cutBox.cutId, u, v, clamped: true, clampedEdges: edges }
    : { cutId: cutBox.cutId, u, v };
}

/**
 * 정규화 앵커 `(u, v) ∈ [0, 1]`를 현재(리사이즈된) 컷 바운딩 박스의 캔버스 좌표로 복원한다.
 * 컷 높이가 늘어나거나 줄어들어도 핀은 항상 컷 내부 `[0, 1]` 비율 위치에 고정된다.
 */
export function cutNormalizedAnchorToCanvasPoint(
  anchor: NormalizedCutPinAnchor,
  cutBox: CutBoundingBox,
): PinAnchorResolution {
  const safe = safeCutDimensions(cutBox);
  const edges: CutClampEdge[] = [];
  const u = clampCoordWithEdge(anchor.u, "left", "right", edges);
  const v = clampCoordWithEdge(anchor.v, "top", "bottom", edges);
  const clampedEdges = edges.length > 0 ? edges : (anchor.clampedEdges ?? []);
  const wasClamped = edges.length > 0 || anchor.clamped === true;
  const normalizedAnchor: NormalizedCutPinAnchor = wasClamped
    ? { cutId: cutBox.cutId, u, v, clamped: true, clampedEdges }
    : { cutId: cutBox.cutId, u, v };

  return {
    anchor: normalizedAnchor,
    canvasPoint: {
      x: normalizeZero(safe.x + u * safe.width),
      y: normalizeZero(safe.y + v * safe.height),
    },
    wasClamped,
    clampedEdges,
  };
}

/**
 * 컷이 크롭(상·하·좌·우 잘림)될 때 기존 핀의 캔버스 원위치와 작품 지점을 보존하면서
 * 잘려나간 영역에 있던 핀만 새 컷 경계 `[0, 1]`로 안전하게 클램프한다.
 */
export function remapCutPinAnchorForCrop(
  anchor: NormalizedCutPinAnchor,
  previousCutBox: CutBoundingBox,
  croppedCutBox: CutBoundingBox,
): PinAnchorResolution {
  const priorPoint = cutNormalizedAnchorToCanvasPoint(anchor, previousCutBox).canvasPoint;
  const nextAnchor = canvasPointToCutNormalizedAnchor(priorPoint, croppedCutBox);
  return cutNormalizedAnchorToCanvasPoint(nextAnchor, croppedCutBox);
}

/**
 * 컷 크롭 시 빨간펜 스트로크의 모든 정규화 점 `(u, v)`도 새 컷 경계로 재투영·클램프한다.
 */
export function remapRedpenStrokeForCrop(
  stroke: RedpenStroke,
  previousCutBox: CutBoundingBox,
  croppedCutBox: CutBoundingBox,
): RedpenStroke {
  const prev = safeCutDimensions(previousCutBox);
  const next = safeCutDimensions(croppedCutBox);
  return {
    ...stroke,
    points: stroke.points.map((pt) => {
      const absX = prev.x + clampUnitInterval(pt.u) * prev.width;
      const absY = prev.y + clampUnitInterval(pt.v) * prev.height;
      const u = next.degenerateWidth ? 0.5 : clampUnitInterval((absX - next.x) / next.width);
      const v = next.degenerateHeight ? 0.5 : clampUnitInterval((absY - next.y) / next.height);
      return pt.pressure !== undefined ? { u, v, pressure: pt.pressure } : { u, v };
    }),
  };
}

// ── 비파괴 빨간펜 오버레이 모델 ──────────────────────────────────────────

function normalizeStrokePoint(point: RedpenStrokePoint): RedpenStrokePoint {
  const u = clampUnitInterval(point.u);
  const v = clampUnitInterval(point.v);
  if (point.pressure === undefined) return { u, v };
  return { u, v, pressure: clampUnitInterval(point.pressure) };
}

function normalizeRedpenStroke(input: RedpenStrokeInput): RedpenStroke {
  const points = input.points
    .slice(0, MAX_REDPEN_POINTS_PER_STROKE)
    .map(normalizeStrokePoint);
  const color = typeof input.color === "string" && input.color.trim().length > 0
    ? input.color.trim()
    : DEFAULT_REDPEN_COLOR;
  return {
    id: input.id,
    authorId: input.authorId,
    authorName: input.authorName,
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : 0,
    color,
    opacity: clampFiniteRange(
      input.opacity ?? DEFAULT_REDPEN_OPACITY,
      MIN_REDPEN_OPACITY,
      MAX_REDPEN_OPACITY,
      DEFAULT_REDPEN_OPACITY,
    ),
    widthPx: clampFiniteRange(
      input.widthPx ?? DEFAULT_REDPEN_WIDTH_PX,
      MIN_REDPEN_WIDTH_PX,
      MAX_REDPEN_WIDTH_PX,
      DEFAULT_REDPEN_WIDTH_PX,
    ),
    points,
  };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortStrokesDeterministic(strokes: readonly RedpenStroke[]): RedpenStroke[] {
  return [...strokes]
    .sort((a, b) => a.createdAt - b.createdAt || compareStrings(a.id, b.id))
    .slice(0, MAX_REDPEN_STROKES_PER_THREAD);
}

function sortAuditLogDeterministic(
  entries: readonly CommentResolutionAuditEntry[],
): CommentResolutionAuditEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.timestamp - b.timestamp
      || a.revision - b.revision
      || compareStrings(a.id, b.id),
  );
}

function buildAuditEntryId(
  threadId: string,
  action: CommentResolutionAction,
  revision: number,
  timestamp: number,
  actorId: string,
): string {
  return `${threadId}:${action}:r${revision}:t${timestamp}:${actorId}`;
}

export function createRedpenOverlayState(input: {
  readonly threadId: string;
  readonly anchor: NormalizedCutPinAnchor;
  readonly createdAt: number;
  readonly authorId: string;
  readonly strokes?: readonly RedpenStrokeInput[];
  readonly visible?: boolean;
  readonly resolved?: boolean;
}): RedpenOverlayThreadState {
  const anchor: NormalizedCutPinAnchor = {
    cutId: input.anchor.cutId,
    u: clampUnitInterval(input.anchor.u),
    v: clampUnitInterval(input.anchor.v),
    ...(input.anchor.clamped ? { clamped: true, clampedEdges: input.anchor.clampedEdges ?? [] } : {}),
  };
  const uniqueStrokes = new Map<string, RedpenStroke>();
  for (const raw of input.strokes ?? []) {
    if (raw.points.length === 0) continue;
    uniqueStrokes.set(raw.id, normalizeRedpenStroke(raw));
  }
  return {
    threadId: input.threadId,
    canvasLayerId: null,
    anchor,
    strokes: sortStrokesDeterministic([...uniqueStrokes.values()]),
    removedStrokeIds: [],
    visible: input.visible ?? true,
    resolved: input.resolved ?? false,
    revision: 0,
    updatedAt: Number.isFinite(input.createdAt) ? input.createdAt : 0,
    updatedById: input.authorId,
    auditLog: [],
  };
}

/**
 * 핀 오버레이에 비파괴 빨간펜 스트로크를 추가한다.
 * 빈 점 목록이나 이미 삭제(툼스톤)된 스트로크 ID는 무시한다.
 */
export function addRedpenStroke(
  state: RedpenOverlayThreadState,
  input: RedpenStrokeInput,
): RedpenOverlayThreadState {
  if (input.points.length === 0) return state;
  if (state.removedStrokeIds.includes(input.id)) return state;
  const normalized = normalizeRedpenStroke(input);
  const nextById = new Map(state.strokes.map((s) => [s.id, s]));
  nextById.set(normalized.id, normalized);
  return {
    ...state,
    strokes: sortStrokesDeterministic([...nextById.values()]),
    visible: true,
    revision: state.revision + 1,
    updatedAt: Math.max(state.updatedAt, normalized.createdAt),
    updatedById: normalized.authorId,
  };
}

/**
 * 비파괴 빨간펜 스트로크를 툼스톤과 함께 제거한다 (캔버스 레이어 불변).
 */
export function removeRedpenStroke(
  state: RedpenOverlayThreadState,
  strokeId: string,
  actor: RedpenAuditActor,
  timestamp: number,
): RedpenOverlayThreadState {
  if (state.removedStrokeIds.includes(strokeId)) return state;
  const removed = [...new Set([...state.removedStrokeIds, strokeId])].sort(compareStrings);
  return {
    ...state,
    strokes: state.strokes.filter((s) => s.id !== strokeId),
    removedStrokeIds: removed,
    revision: state.revision + 1,
    updatedAt: Math.max(state.updatedAt, timestamp),
    updatedById: actor.id,
  };
}

/**
 * 빨간펜 오버레이 가시성을 비파괴 토글한다 (스트로크 데이터는 유지).
 */
export function toggleRedpenOverlayVisibility(
  state: RedpenOverlayThreadState,
  actor: RedpenAuditActor,
  timestamp: number,
  nextVisible?: boolean,
): RedpenOverlayThreadState {
  const visible = nextVisible ?? !state.visible;
  if (visible === state.visible) return state;
  return {
    ...state,
    visible,
    revision: state.revision + 1,
    updatedAt: Math.max(state.updatedAt, timestamp),
    updatedById: actor.id,
  };
}

/**
 * 핀을 컷 내부의 새 캔버스 좌표로 이동하고 `(u, v) ∈ [0, 1]`로 정규화한다.
 */
export function moveRedpenPinAnchor(
  state: RedpenOverlayThreadState,
  point: CanvasPoint,
  cutBox: CutBoundingBox,
  actor: RedpenAuditActor,
  timestamp: number,
): RedpenOverlayThreadState {
  const anchor = canvasPointToCutNormalizedAnchor(point, cutBox);
  return {
    ...state,
    anchor,
    revision: state.revision + 1,
    updatedAt: Math.max(state.updatedAt, timestamp),
    updatedById: actor.id,
  };
}

/**
 * 컷 크롭 이벤트를 오버레이 전체(핀 앵커 + 모든 빨간펜 스트로크)에 적용한다.
 */
export function remapRedpenOverlayForCrop(
  state: RedpenOverlayThreadState,
  previousCutBox: CutBoundingBox,
  croppedCutBox: CutBoundingBox,
  actor: RedpenAuditActor,
  timestamp: number,
): RedpenOverlayThreadState {
  const remappedAnchor = remapCutPinAnchorForCrop(
    state.anchor,
    previousCutBox,
    croppedCutBox,
  ).anchor;
  const remappedStrokes = state.strokes.map((stroke) =>
    remapRedpenStrokeForCrop(stroke, previousCutBox, croppedCutBox),
  );
  return {
    ...state,
    anchor: remappedAnchor,
    strokes: remappedStrokes,
    revision: state.revision + 1,
    updatedAt: Math.max(state.updatedAt, timestamp),
    updatedById: actor.id,
  };
}

/**
 * 수락 시 1클릭 체크완료 (#069):
 * 미해결 코멘트를 즉시 해결 처리하고, 빨간펜 스트로크는 지우지 않은 채
 * 기본값으로 오버레이만 숨기며 감사 로그에 `"accept-and-resolve"` 이력을 남긴다.
 */
export function acceptRedpenAndResolve(
  state: RedpenOverlayThreadState,
  actor: RedpenAuditActor,
  timestamp: number,
  options?: { readonly hideOverlayOnAccept?: boolean; readonly note?: string },
): RedpenOverlayThreadState {
  if (state.resolved) return state;
  const nextRevision = state.revision + 1;
  const hideOverlay = options?.hideOverlayOnAccept ?? true;
  const entry: CommentResolutionAuditEntry = {
    id: buildAuditEntryId(state.threadId, "accept-and-resolve", nextRevision, timestamp, actor.id),
    threadId: state.threadId,
    action: "accept-and-resolve",
    actorId: actor.id,
    actorName: actor.name,
    timestamp,
    revision: nextRevision,
    previousResolved: false,
    nextResolved: true,
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
  };
  return {
    ...state,
    resolved: true,
    visible: hideOverlay ? false : state.visible,
    revision: nextRevision,
    updatedAt: Math.max(state.updatedAt, timestamp),
    updatedById: actor.id,
    auditLog: sortAuditLogDeterministic([...state.auditLog, entry]),
  };
}

/**
 * 해결 / 재열기 상태 전이와 감사 로그 기록 (#069).
 * 재열기 시 빨간펜 스트로크가 존재하면 오버레이를 다시 표시한다.
 */
export function recordThreadResolutionTransition(
  state: RedpenOverlayThreadState,
  action: "resolve" | "reopen",
  actor: RedpenAuditActor,
  timestamp: number,
  note?: string,
): RedpenOverlayThreadState {
  const nextResolved = action === "resolve";
  if (state.resolved === nextResolved) return state;
  const nextRevision = state.revision + 1;
  const entry: CommentResolutionAuditEntry = {
    id: buildAuditEntryId(state.threadId, action, nextRevision, timestamp, actor.id),
    threadId: state.threadId,
    action,
    actorId: actor.id,
    actorName: actor.name,
    timestamp,
    revision: nextRevision,
    previousResolved: state.resolved,
    nextResolved,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };
  return {
    ...state,
    resolved: nextResolved,
    visible: nextResolved ? state.visible : state.strokes.length > 0 ? true : state.visible,
    revision: nextRevision,
    updatedAt: Math.max(state.updatedAt, timestamp),
    updatedById: actor.id,
    auditLog: sortAuditLogDeterministic([...state.auditLog, entry]),
  };
}

/** 현재 화면에 표시해야 할 비파괴 빨간펜 스트로크만 반환한다. */
export function getVisibleRedpenStrokes(
  state: RedpenOverlayThreadState,
): readonly RedpenStroke[] {
  if (!state.visible) return [];
  const removed = new Set(state.removedStrokeIds);
  return state.strokes.filter((stroke) => !removed.has(stroke.id));
}

function formatSvgNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(normalizeZero(rounded));
}

/**
 * 정규화 빨간펜 스트로크를 대상 컷 바운딩 박스 좌표계의 SVG 경로(`d`)로 투영한다.
 */
export function projectRedpenStrokeToCanvasPath(
  stroke: RedpenStroke,
  cutBox: CutBoundingBox,
): ProjectedRedpenStrokePath {
  const safe = safeCutDimensions(cutBox);
  const points: CanvasPoint[] = stroke.points.map((pt) => ({
    x: normalizeZero(safe.x + clampUnitInterval(pt.u) * safe.width),
    y: normalizeZero(safe.y + clampUnitInterval(pt.v) * safe.height),
  }));
  if (points.length === 0) {
    return {
      strokeId: stroke.id,
      d: "",
      points,
      color: stroke.color,
      opacity: stroke.opacity,
      widthPx: stroke.widthPx,
    };
  }
  if (points.length === 1) {
    const p = points[0];
    const x = formatSvgNumber(p.x);
    const y = formatSvgNumber(p.y);
    return {
      strokeId: stroke.id,
      d: `M ${x} ${y} L ${x} ${y}`,
      points,
      color: stroke.color,
      opacity: stroke.opacity,
      widthPx: stroke.widthPx,
    };
  }
  const commands = points.map((p, index) =>
    `${index === 0 ? "M" : "L"} ${formatSvgNumber(p.x)} ${formatSvgNumber(p.y)}`,
  );
  return {
    strokeId: stroke.id,
    d: commands.join(" "),
    points,
    color: stroke.color,
    opacity: stroke.opacity,
    widthPx: stroke.widthPx,
  };
}

// ── 동시 편집 충돌 결정론 병합 (CRDT Join-Semilattice) ──────────────────

function compareRegisterWinner(
  left: RedpenOverlayThreadState,
  right: RedpenOverlayThreadState,
): number {
  return (
    left.revision - right.revision
    || left.updatedAt - right.updatedAt
    || compareStrings(left.updatedById, right.updatedById)
    || Number(left.resolved) - Number(right.resolved)
    || Number(left.visible) - Number(right.visible)
    || compareStrings(left.anchor.cutId, right.anchor.cutId)
    || left.anchor.u - right.anchor.u
    || left.anchor.v - right.anchor.v
  );
}

function chooseCanonicalStroke(left: RedpenStroke, right: RedpenStroke): RedpenStroke {
  const cmp =
    left.points.length - right.points.length
    || left.createdAt - right.createdAt
    || compareStrings(JSON.stringify(left), JSON.stringify(right));
  return cmp >= 0 ? left : right;
}

function chooseCanonicalAuditEntry(
  left: CommentResolutionAuditEntry,
  right: CommentResolutionAuditEntry,
): CommentResolutionAuditEntry {
  const cmp =
    left.timestamp - right.timestamp
    || left.revision - right.revision
    || compareStrings(JSON.stringify(left), JSON.stringify(right));
  return cmp >= 0 ? left : right;
}

/**
 * 동시 편집 중인 두 빨간펜 오버레이 상태를 결정론적으로 병합한다.
 * - 스트로크: 2P-Set (추가 합집합 - 삭제 툼스톤 합집합)으로 두 작성자의 주석을 모두 보존.
 * - 감사 로그: Grow-only 합집합으로 모든 해결·재열기·수락 이력을 손실 없이 보존.
 * - 앵커·해결상태·가시성: 전체 순서(total-order) LWW 레지스터로 교환·결합·멱등 수렴 보장.
 */
export function mergeRedpenOverlayStates(
  local: RedpenOverlayThreadState,
  remote: RedpenOverlayThreadState,
): RedpenOverlayThreadState {
  if (local.threadId !== remote.threadId) {
    throw new Error(
      `서로 다른 스레드(${local.threadId}, ${remote.threadId})의 빨간펜 상태는 병합할 수 없습니다.`,
    );
  }
  const removedSet = new Set<string>([
    ...local.removedStrokeIds,
    ...remote.removedStrokeIds,
  ]);
  const mergedStrokes = new Map<string, RedpenStroke>();
  for (const stroke of [...local.strokes, ...remote.strokes]) {
    if (removedSet.has(stroke.id)) continue;
    const existing = mergedStrokes.get(stroke.id);
    mergedStrokes.set(
      stroke.id,
      existing ? chooseCanonicalStroke(existing, stroke) : stroke,
    );
  }

  const mergedAudit = new Map<string, CommentResolutionAuditEntry>();
  for (const entry of [...local.auditLog, ...remote.auditLog]) {
    const existing = mergedAudit.get(entry.id);
    mergedAudit.set(
      entry.id,
      existing ? chooseCanonicalAuditEntry(existing, entry) : entry,
    );
  }

  const winner = compareRegisterWinner(local, remote) >= 0 ? local : remote;
  return {
    threadId: local.threadId,
    canvasLayerId: null,
    anchor: {
      cutId: winner.anchor.cutId,
      u: clampUnitInterval(winner.anchor.u),
      v: clampUnitInterval(winner.anchor.v),
      ...(winner.anchor.clamped
        ? { clamped: true, clampedEdges: [...(winner.anchor.clampedEdges ?? [])] }
        : {}),
    },
    strokes: sortStrokesDeterministic([...mergedStrokes.values()]),
    removedStrokeIds: [...removedSet].sort(compareStrings),
    visible: winner.visible,
    resolved: winner.resolved,
    revision: winner.revision,
    updatedAt: winner.updatedAt,
    updatedById: winner.updatedById,
    auditLog: sortAuditLogDeterministic([...mergedAudit.values()]),
  };
}
