/**
 * studio-viewport-wrap-around.ts
 *
 * Krita 5.2+ 풀-뷰포트 X / Y / XY 랩어라운드 모드(`Shift+W`) 순수 투영 · 토러스 브러시 댑 엔진.
 *
 * - 렌더 계층: 팬·줌·회전이 적용된 메인 캔버스 뷰포트 가시 영역을 역투영해 필요한 타일 인덱스
 *   `(tileX, tileY)`와 각 타일 인스턴스의 Canvas2D 2×3 아핀 행렬(`matrix2d`) 및 WebGPU 4×4
 *   열우선 행렬(`mat4ColMajor`)을 계산한다.
 * - 입력 계층: 포인터 좌표 `(x, y)`를 활성 축(`horizontal` | `vertical` | `both`)에 따라 모듈로
 *   정규화하고, 반경 `radiusPx`가 타일 경계를 침범하는 브러시 댑을 최대 4-타일 토러스 복제 댑으로
 *   전개해 멀티레이어 브러시 파이프라인에 이음새 없이 커밋한다.
 */

export type ViewportWrapAxisMode = "both" | "horizontal" | "vertical";

export interface ViewportWrapAroundState {
  readonly enabled: boolean;
  readonly axisMode: ViewportWrapAxisMode;
  readonly showBoundaryGuides: boolean;
  readonly guideOpacity01: number;
  readonly shortcutLabel: "Shift+W";
}

export interface WrapDocumentSize {
  readonly width: number;
  readonly height: number;
}

export interface WrapPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface ViewportWrapCamera {
  /** 뷰포트 너비(화면 CSS px). */
  readonly viewportWidth: number;
  /** 뷰포트 높이(화면 CSS px). */
  readonly viewportHeight: number;
  /** 문서 원점(0, 0)이 화면에서 위치하는 X 오프셋(px). */
  readonly panX: number;
  /** 문서 원점(0, 0)이 화면에서 위치하는 Y 오프셋(px). */
  readonly panY: number;
  /** 확대 배율 (> 0). */
  readonly zoom: number;
  /** 캔버스 시계 방향 회전 각도(도, 기본 0). */
  readonly rotationDeg?: number;
}

/** 2D 아핀 변환 행렬 [a, b, c, d, e, f] (CanvasRenderingContext2D.setTransform 호환). */
export type AffineMatrix2D = readonly [number, number, number, number, number, number];

export interface WrapTileInstance {
  readonly tileX: number;
  readonly tileY: number;
  readonly isOrigin: boolean;
  readonly docOffsetX: number;
  readonly docOffsetY: number;
  readonly matrix2d: AffineMatrix2D;
  /** WebGPU / WebGL 열우선(column-major) 4×4 변환 행렬. */
  readonly mat4ColMajor: readonly number[];
}

export interface WrapTilePlanResult {
  readonly instances: readonly WrapTileInstance[];
  readonly tileRangeX: readonly [number, number];
  readonly tileRangeY: readonly [number, number];
  readonly truncated: boolean;
}

export interface WrapBrushDabInput {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly pressure01?: number;
  readonly opacity01?: number;
  readonly angleRad?: number;
}

export interface WrappedBrushDabReplica extends WrapBrushDabInput {
  readonly shiftTileX: -1 | 0 | 1;
  readonly shiftTileY: -1 | 0 | 1;
  readonly isPrimary: boolean;
}

export interface WrapBoundaryGuideSegment {
  readonly axis: "x" | "y";
  readonly start: WrapPoint2D;
  readonly end: WrapPoint2D;
}

export const VIEWPORT_WRAP_DEFAULT_MAX_INSTANCES = 256;

const AXIS_CYCLE_ORDER: readonly ViewportWrapAxisMode[] = ["both", "vertical", "horizontal"];

function assertDocSize(doc: WrapDocumentSize, context: string): void {
  if (
    !Number.isFinite(doc.width) ||
    !Number.isFinite(doc.height) ||
    doc.width <= 0 ||
    doc.height <= 0
  ) {
    throw new RangeError(`${context}: 문서 크기가 유효하지 않습니다 (${doc.width}x${doc.height}).`);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// ---------------------------------------------------------------------------
// 상태 · 단축키(Shift+W) · 컨텍스트 바 요약
// ---------------------------------------------------------------------------

export function createViewportWrapAroundState(
  overrides: Partial<Omit<ViewportWrapAroundState, "shortcutLabel">> = {},
): ViewportWrapAroundState {
  return {
    enabled: overrides.enabled ?? false,
    axisMode: overrides.axisMode ?? "both",
    showBoundaryGuides: overrides.showBoundaryGuides ?? true,
    guideOpacity01: clamp01(overrides.guideOpacity01 ?? 0.45),
    shortcutLabel: "Shift+W",
  };
}

/** `Shift+W` (보조키 Ctrl/Meta/Alt 미입력) 단축키 일치 여부를 판정한다. */
export function isViewportWrapToggleShortcut(event: {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}): boolean {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key === "W" || event.key === "w";
}

export function toggleViewportWrapAround(
  state: ViewportWrapAroundState,
): ViewportWrapAroundState {
  return { ...state, enabled: !state.enabled };
}

export function cycleViewportWrapAxisMode(
  state: ViewportWrapAroundState,
): ViewportWrapAroundState {
  const idx = AXIS_CYCLE_ORDER.indexOf(state.axisMode);
  const nextAxis = AXIS_CYCLE_ORDER[(idx + 1) % AXIS_CYCLE_ORDER.length]!;
  return { ...state, axisMode: nextAxis };
}

export function formatViewportWrapStatusChip(state: ViewportWrapAroundState): string {
  if (!state.enabled) return "랩어라운드 꺼짐";
  if (state.axisMode === "vertical") return "랩어라운드 · 세로(Y)";
  if (state.axisMode === "horizontal") return "랩어라운드 · 가로(X)";
  return "랩어라운드 · 양축(XY)";
}

// ---------------------------------------------------------------------------
// 좌표 모듈로 정규화 & 토러스 타일 매핑
// ---------------------------------------------------------------------------

/** 좌표를 [0, size) 반열린 구간으로 정확히 래핑한다(-0 제거). */
export function wrapAxisCoord(coord: number, size: number): number {
  if (!Number.isFinite(coord) || !Number.isFinite(size) || size <= 0) return 0;
  const wrapped = ((coord % size) + size) % size;
  return wrapped === 0 || wrapped >= size ? 0 : wrapped;
}

export function isWrapXActive(axisMode: ViewportWrapAxisMode, enabled = true): boolean {
  return enabled && (axisMode === "both" || axisMode === "horizontal");
}

export function isWrapYActive(axisMode: ViewportWrapAxisMode, enabled = true): boolean {
  return enabled && (axisMode === "both" || axisMode === "vertical");
}

/** 활성 래핑 축만 모듈로 감싸고 비활성 축 좌표는 원본 그대로 보존한다. */
export function wrapDocumentPoint(
  point: WrapPoint2D,
  doc: WrapDocumentSize,
  axisMode: ViewportWrapAxisMode,
  enabled = true,
): WrapPoint2D {
  assertDocSize(doc, "wrapDocumentPoint");
  return {
    x: isWrapXActive(axisMode, enabled) ? wrapAxisCoord(point.x, doc.width) : point.x,
    y: isWrapYActive(axisMode, enabled) ? wrapAxisCoord(point.y, doc.height) : point.y,
  };
}

// ---------------------------------------------------------------------------
// 뷰포트 타일 인스턴스 행렬 계산
// ---------------------------------------------------------------------------

function screenToDocumentPoint(
  screenX: number,
  screenY: number,
  camera: ViewportWrapCamera,
): WrapPoint2D {
  const zoom = Math.max(1e-4, Number.isFinite(camera.zoom) ? camera.zoom : 1);
  const rad = ((camera.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const dx = (screenX - camera.panX) / zoom;
  const dy = (screenY - camera.panY) / zoom;
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function buildTileTransformMatrices(
  docOffsetX: number,
  docOffsetY: number,
  camera: ViewportWrapCamera,
): { readonly matrix2d: AffineMatrix2D; readonly mat4ColMajor: readonly number[] } {
  const zoom = Math.max(1e-4, Number.isFinite(camera.zoom) ? camera.zoom : 1);
  const rad = ((camera.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad) * zoom;
  const sin = Math.sin(rad) * zoom;

  const a = normalizeZero(cos);
  const b = normalizeZero(sin);
  const c = normalizeZero(-sin);
  const d = normalizeZero(cos);
  const e = normalizeZero(camera.panX + a * docOffsetX + c * docOffsetY);
  const f = normalizeZero(camera.panY + b * docOffsetX + d * docOffsetY);

  const matrix2d: AffineMatrix2D = [a, b, c, d, e, f];
  // 열우선(column-major) 4×4 행렬 (WGSL mat4x4<f32> / WebGL uniform 직접 업로드 가능)
  const mat4ColMajor: readonly number[] = [
    a, b, 0, 0,
    c, d, 0, 0,
    0, 0, 1, 0,
    e, f, 0, 1,
  ];
  return { matrix2d, mat4ColMajor };
}

/**
 * 현재 뷰포트 카메라(팬·줌·회전)와 래핑 축 설정에 맞춰 화면에 보이는 타일 인스턴스와
 * 2D/4×4 변환 행렬을 계산한다.
 */
export function computeVisibleWrapTileInstances(params: {
  readonly doc: WrapDocumentSize;
  readonly camera: ViewportWrapCamera;
  readonly axisMode: ViewportWrapAxisMode;
  readonly enabled: boolean;
  readonly maxInstances?: number;
}): WrapTilePlanResult {
  assertDocSize(params.doc, "computeVisibleWrapTileInstances");
  const { doc, camera, axisMode, enabled } = params;
  const maxInstances = Math.max(1, Math.floor(params.maxInstances ?? VIEWPORT_WRAP_DEFAULT_MAX_INSTANCES));

  if (!enabled) {
    const origin = buildTileTransformMatrices(0, 0, camera);
    return {
      instances: [
        {
          tileX: 0,
          tileY: 0,
          isOrigin: true,
          docOffsetX: 0,
          docOffsetY: 0,
          ...origin,
        },
      ],
      tileRangeX: [0, 0],
      tileRangeY: [0, 0],
      truncated: false,
    };
  }

  const vw = Math.max(1, camera.viewportWidth);
  const vh = Math.max(1, camera.viewportHeight);
  const corners = [
    screenToDocumentPoint(0, 0, camera),
    screenToDocumentPoint(vw, 0, camera),
    screenToDocumentPoint(vw, vh, camera),
    screenToDocumentPoint(0, vh, camera),
  ];

  let minDocX = Infinity;
  let maxDocX = -Infinity;
  let minDocY = Infinity;
  let maxDocY = -Infinity;
  for (const pt of corners) {
    if (pt.x < minDocX) minDocX = pt.x;
    if (pt.x > maxDocX) maxDocX = pt.x;
    if (pt.y < minDocY) minDocY = pt.y;
    if (pt.y > maxDocY) maxDocY = pt.y;
  }

  const wrapX = isWrapXActive(axisMode, enabled);
  const wrapY = isWrapYActive(axisMode, enabled);
  const minTileX = wrapX ? Math.floor(minDocX / doc.width) : 0;
  const maxTileX = wrapX ? Math.floor((maxDocX - 1e-6) / doc.width) : 0;
  const minTileY = wrapY ? Math.floor(minDocY / doc.height) : 0;
  const maxTileY = wrapY ? Math.floor((maxDocY - 1e-6) / doc.height) : 0;

  const instances: WrapTileInstance[] = [];
  let truncated = false;

  // 원점(0, 0)에서 가까운 타일부터 수집해 상한 도달 시 중앙 영역을 우선 보장한다.
  const coords: { readonly tileX: number; readonly tileY: number; readonly distSq: number }[] = [];
  for (let ty = minTileY; ty <= maxTileY; ty += 1) {
    for (let tx = minTileX; tx <= maxTileX; tx += 1) {
      coords.push({ tileX: tx, tileY: ty, distSq: tx * tx + ty * ty });
    }
  }
  coords.sort((a, b) => a.distSq - b.distSq || a.tileY - b.tileY || a.tileX - b.tileX);

  for (const coord of coords) {
    if (instances.length >= maxInstances) {
      truncated = true;
      break;
    }
    const docOffsetX = coord.tileX * doc.width;
    const docOffsetY = coord.tileY * doc.height;
    const matrices = buildTileTransformMatrices(docOffsetX, docOffsetY, camera);
    instances.push({
      tileX: coord.tileX,
      tileY: coord.tileY,
      isOrigin: coord.tileX === 0 && coord.tileY === 0,
      docOffsetX,
      docOffsetY,
      ...matrices,
    });
  }

  return {
    instances,
    tileRangeX: [minTileX, maxTileX],
    tileRangeY: [minTileY, maxTileY],
    truncated,
  };
}

// ---------------------------------------------------------------------------
// 경계 침범 브러시 댑 최대 4-타일 토러스 래핑 복제
// ---------------------------------------------------------------------------

function resolveAxisWrapShifts(
  wrappedCoord: number,
  radiusPx: number,
  size: number,
  active: boolean,
): readonly (-1 | 0 | 1)[] {
  if (!active || radiusPx <= 0) return [0];
  const touchesLow = wrappedCoord - radiusPx < 0;
  const touchesHigh = wrappedCoord + radiusPx > size;
  if (!touchesLow && !touchesHigh) return [0];
  if (touchesLow && !touchesHigh) return [0, 1];
  if (touchesHigh && !touchesLow) return [0, -1];
  // 초대형 브러시(radius >= size/2)로 양쪽 경계를 동시 침범하면 가장 가까운 경계 1개만 복제해
  // 토러스 댑 상한(최대 4개: 2×2)을 엄격히 지킨다.
  const distToLow = wrappedCoord;
  const distToHigh = size - wrappedCoord;
  return distToLow <= distToHigh ? [0, 1] : [0, -1];
}

/**
 * 단일 브러시 댑을 토러스 문서 좌표로 래핑하고, 반경이 활성 래핑 경계를 침범하면
 * 반대편 에지에 복제 댑을 생성해 최대 4개의 커밋 댑 목록을 반환한다.
 */
export function expandWrappedBrushDab(
  dab: WrapBrushDabInput,
  doc: WrapDocumentSize,
  axisMode: ViewportWrapAxisMode,
  enabled = true,
): readonly WrappedBrushDabReplica[] {
  assertDocSize(doc, "expandWrappedBrushDab");
  const safeRadius = Number.isFinite(dab.radiusPx) ? Math.max(0, dab.radiusPx) : 0;

  if (!enabled) {
    return [
      {
        ...dab,
        radiusPx: safeRadius,
        shiftTileX: 0,
        shiftTileY: 0,
        isPrimary: true,
      },
    ];
  }

  const wrapX = isWrapXActive(axisMode, enabled);
  const wrapY = isWrapYActive(axisMode, enabled);
  const baseX = wrapX ? wrapAxisCoord(dab.x, doc.width) : dab.x;
  const baseY = wrapY ? wrapAxisCoord(dab.y, doc.height) : dab.y;

  const shiftsX = resolveAxisWrapShifts(baseX, safeRadius, doc.width, wrapX);
  const shiftsY = resolveAxisWrapShifts(baseY, safeRadius, doc.height, wrapY);

  const replicas: WrappedBrushDabReplica[] = [];
  for (const sy of shiftsY) {
    for (const sx of shiftsX) {
      replicas.push({
        ...dab,
        x: baseX + sx * doc.width,
        y: baseY + sy * doc.height,
        radiusPx: safeRadius,
        shiftTileX: sx,
        shiftTileY: sy,
        isPrimary: sx === 0 && sy === 0,
      });
    }
  }
  return replicas;
}

/** 스트로크 전체 댑 시퀀스를 토러스 복제 댑 목록으로 일괄 전개한다. */
export function expandWrappedBrushStrokeDabs(
  dabs: readonly WrapBrushDabInput[],
  doc: WrapDocumentSize,
  axisMode: ViewportWrapAxisMode,
  enabled = true,
): readonly WrappedBrushDabReplica[] {
  const out: WrappedBrushDabReplica[] = [];
  for (const dab of dabs) {
    const expanded = expandWrappedBrushDab(dab, doc, axisMode, enabled);
    for (const replica of expanded) out.push(replica);
  }
  return out;
}

/** 고스트 타일 경계선 오버레이 렌더용 문서 공간 가이드 선분 목록을 생성한다. */
export function buildWrapBoundaryGuideSegments(
  plan: WrapTilePlanResult,
  doc: WrapDocumentSize,
): readonly WrapBoundaryGuideSegment[] {
  assertDocSize(doc, "buildWrapBoundaryGuideSegments");
  const [minX, maxX] = plan.tileRangeX;
  const [minY, maxY] = plan.tileRangeY;
  const yStart = minY * doc.height;
  const yEnd = (maxY + 1) * doc.height;
  const xStart = minX * doc.width;
  const xEnd = (maxX + 1) * doc.width;

  const segments: WrapBoundaryGuideSegment[] = [];
  for (let tx = minX; tx <= maxX + 1; tx += 1) {
    const x = tx * doc.width;
    segments.push({ axis: "x", start: { x, y: yStart }, end: { x, y: yEnd } });
  }
  for (let ty = minY; ty <= maxY + 1; ty += 1) {
    const y = ty * doc.height;
    segments.push({ axis: "y", start: { x: xStart, y }, end: { x: xEnd, y } });
  }
  return segments;
}
