/**
 * 비파괴 스마트 래스터 워프 프록시 (Wave 3 #013).
 *
 * 벡터 레이어에 리퀴파이(liquify)·스머지(smudge)·퍼펫 워프(puppet-warp) 같은
 * 래스터 변형 도구를 적용할 때 원본 벡터를 파괴적으로 래스터화하지 않고,
 * 원본 벡터 ID·리비전·지문·불변 스냅샷을 보존한 스마트 래스터 프록시를 생성한다.
 * 언제든 1클릭(`revertVectorSmartRasterProxy`)으로 원본 벡터 상태로 복귀할 수 있다.
 *
 * 모든 함수는 순수하며 DOM/Canvas/스토리지 의존성이 없다.
 */

import type {
  VectorBrushShapeId,
  VectorCubicSegment,
  VectorLayer,
  VectorPoint2D,
  VectorStroke,
} from "./vector-layer-model";

export const VECTOR_SMART_RASTER_PROXY_TYPE =
  "vector-smart-raster-proxy" as const;
export type VectorSmartRasterProxyType = typeof VECTOR_SMART_RASTER_PROXY_TYPE;

export type VectorSmartRasterWarpKind = "liquify" | "smudge" | "puppet-warp";

export const VECTOR_SMART_RASTER_WARP_KINDS: readonly VectorSmartRasterWarpKind[] =
  ["liquify", "smudge", "puppet-warp"] as const;

export const VECTOR_SMART_RASTER_SCALE_MIN = 0.25;
export const VECTOR_SMART_RASTER_SCALE_MAX = 4;

export type VectorSmartRasterWarpParamValue = number | string | boolean;

export interface VectorSmartRasterWarpOperation {
  readonly id: string;
  readonly kind: VectorSmartRasterWarpKind;
  readonly label?: string;
  /** 변형 강도(0..1). */
  readonly strength: number;
  /** 도구 영향 반경(px). 생략 시 0. */
  readonly radiusPx?: number;
  /** 호출자가 주입한 ISO 시각(미지정 시 빈 문자열로 결정론 유지). */
  readonly appliedAtIso: string;
  readonly params?: Readonly<Record<string, VectorSmartRasterWarpParamValue>>;
}

export interface VectorSmartRasterProxyBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface VectorSmartRasterProxy {
  readonly kind: VectorSmartRasterProxyType;
  readonly proxyId: string;
  /** 원본 벡터 레이어 ID. */
  readonly sourceVectorLayerId: string;
  /** 프록시 생성 시점의 원본 벡터 리비전(음이 아닌 안전 정수). */
  readonly sourceVectorRevision: number;
  /** 원본 벡터 스트로크 기하의 결정론적 지문(FNV-1a). */
  readonly sourceVectorDigest: string;
  /** 1클릭 복귀를 위한 원본 벡터 불변 스냅샷(중첩 프록시 제외). */
  readonly sourceSnapshot: VectorLayer;
  /** 적용된 워프 종류(최초 적용 순서 유지, 중복 제거). */
  readonly activeWarpKinds: readonly VectorSmartRasterWarpKind[];
  /** 누적된 비파괴 워프 연산 목록. */
  readonly operations: readonly VectorSmartRasterWarpOperation[];
  /** 패딩을 포함한 프록시 래스터 경계 상자. 빈 벡터 레이어는 null. */
  readonly rasterBounds: VectorSmartRasterProxyBounds | null;
  /** 프록시 래스터화 배율(0.25..4, 기본 1). */
  readonly rasterResolutionScale: number;
  /** 현재 스마트 래스터 프록시 활성 여부. */
  readonly active: boolean;
}

export interface CreateVectorSmartRasterWarpOperationInput {
  readonly id: string;
  readonly kind: VectorSmartRasterWarpKind;
  readonly label?: string;
  readonly strength?: number;
  readonly radiusPx?: number;
  readonly appliedAtIso?: string;
  readonly params?: Readonly<Record<string, VectorSmartRasterWarpParamValue>>;
}

export interface CreateVectorSmartRasterProxyOptions {
  readonly proxyId?: string;
  readonly sourceRevision?: number;
  readonly operation: CreateVectorSmartRasterWarpOperationInput;
  readonly rasterResolutionScale?: number;
  readonly boundsPaddingPx?: number;
}

export interface RevertVectorSmartRasterProxyResult {
  readonly layer: VectorLayer;
  readonly revertedFromProxyId: string;
  readonly restoredVectorLayerId: string;
  readonly restoredRevision: number;
  readonly discardedOperationCount: number;
}

export interface VectorSmartRasterProxySyncStatus {
  readonly inSync: boolean;
  readonly sourceRevision: number;
  readonly currentRevision: number;
  readonly sourceDigest: string;
  readonly currentDigest: string;
}

const VALID_BRUSH_SHAPES: readonly VectorBrushShapeId[] = [
  "round",
  "flat",
  "calligraphy",
];

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isVectorSmartRasterWarpKind(
  value: unknown,
): value is VectorSmartRasterWarpKind {
  return (
    value === "liquify" || value === "smudge" || value === "puppet-warp"
  );
}

export function normalizeVectorLayerRevision(
  revision: unknown,
  fallback = 0,
): number {
  if (
    typeof revision === "number"
    && Number.isSafeInteger(revision)
    && revision >= 0
  ) {
    return revision;
  }
  const safeFallback =
    Number.isSafeInteger(fallback) && fallback >= 0 ? fallback : 0;
  return safeFallback;
}

function clonePoint(point: VectorPoint2D): VectorPoint2D {
  return { x: point.x, y: point.y };
}

function cloneSegment(segment: VectorCubicSegment): VectorCubicSegment {
  return {
    p0: clonePoint(segment.p0),
    p1: clonePoint(segment.p1),
    p2: clonePoint(segment.p2),
    p3: clonePoint(segment.p3),
  };
}

function cloneStroke(stroke: VectorStroke): VectorStroke {
  return {
    id: stroke.id,
    segments: stroke.segments.map(cloneSegment),
    widths: [...stroke.widths],
    color: stroke.color,
    brushShapeId: stroke.brushShapeId,
    opacity: stroke.opacity,
    ...(stroke.closed === true ? { closed: true as const } : {}),
  };
}

function cloneSourceLayerSnapshot(
  layer: VectorLayer,
  revision: number,
): VectorLayer {
  return {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    strokes: layer.strokes.map(cloneStroke),
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    revision,
  };
}

function fnv1aUpdate(hash: number, text: string): number {
  let acc = hash >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    acc ^= text.charCodeAt(index);
    acc = Math.imul(acc, 0x0100_0193) >>> 0;
  }
  return acc;
}

/**
 * 벡터 레이어의 스트로크 기하와 속성을 결정론적 FNV-1a 지문 문자열로 요약한다.
 * 프록시 생성 이후 원본 벡터의 비동기/외부 수정 여부를 감지하는 데 사용한다.
 */
export function computeVectorLayerRevisionDigest(
  layer: Pick<VectorLayer, "id" | "strokes">,
): string {
  let h1 = 0x811c_9dc5;
  let h2 = 0x9e37_79b9;
  const feed = (token: string): void => {
    h1 = fnv1aUpdate(h1, token);
    h2 = fnv1aUpdate(h2 ^ (h1 >>> 16), `${token};`);
  };
  feed(`layer:${layer.id}:${layer.strokes.length}`);
  for (const stroke of layer.strokes) {
    feed(
      `stroke:${stroke.id}:${stroke.color}:${stroke.brushShapeId}:${stroke.opacity.toFixed(6)}:${stroke.closed === true ? 1 : 0}`,
    );
    feed(`widths:${stroke.widths.map((w) => w.toFixed(4)).join(",")}`);
    for (const seg of stroke.segments) {
      feed(
        `seg:${seg.p0.x.toFixed(3)},${seg.p0.y.toFixed(3)},${seg.p1.x.toFixed(3)},${seg.p1.y.toFixed(3)},${seg.p2.x.toFixed(3)},${seg.p2.y.toFixed(3)},${seg.p3.x.toFixed(3)},${seg.p3.y.toFixed(3)}`,
      );
    }
  }
  return `vdigest:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/**
 * 벡터 레이어 전체 스트로크의 합집합 경계 상자에 워프 여유 패딩을 더해 반환한다.
 * 스트로크가 비어 있으면 null을 반환한다.
 */
export function computeVectorLayerProxyBounds(
  layer: Pick<VectorLayer, "strokes">,
  paddingPx = 0,
): VectorSmartRasterProxyBounds | null {
  const safePadding = Math.max(0, finiteNumber(paddingPx, 0));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const visit = (point: VectorPoint2D, width: number): void => {
    const half = Math.max(0, finiteNumber(width, 1)) / 2;
    minX = Math.min(minX, point.x - half);
    minY = Math.min(minY, point.y - half);
    maxX = Math.max(maxX, point.x + half);
    maxY = Math.max(maxY, point.y + half);
    found = true;
  };

  for (const stroke of layer.strokes) {
    stroke.segments.forEach((segment, segmentIndex) => {
      const startWidth = stroke.widths[segmentIndex] ?? 1;
      const endWidth = stroke.widths[segmentIndex + 1] ?? startWidth;
      visit(segment.p0, startWidth);
      visit(segment.p1, startWidth);
      visit(segment.p2, endWidth);
      visit(segment.p3, endWidth);
    });
  }

  if (!found) return null;
  return {
    minX: minX - safePadding,
    minY: minY - safePadding,
    maxX: maxX + safePadding,
    maxY: maxY + safePadding,
  };
}

function mergeBounds(
  a: VectorSmartRasterProxyBounds | null,
  b: VectorSmartRasterProxyBounds | null,
): VectorSmartRasterProxyBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function normalizeWarpOperation(
  input: CreateVectorSmartRasterWarpOperationInput,
): VectorSmartRasterWarpOperation {
  if (!isVectorSmartRasterWarpKind(input.kind)) {
    throw new Error(
      `지원하지 않는 스마트 래스터 워프 종류입니다: ${String(input.kind)}`,
    );
  }
  const safeId =
    typeof input.id === "string" && input.id.trim().length > 0
      ? input.id.trim()
      : `${input.kind}-op`;
  const radiusPx =
    input.radiusPx !== undefined
      ? Math.max(0, finiteNumber(input.radiusPx, 0))
      : undefined;
  let sanitizedParams:
    | Readonly<Record<string, VectorSmartRasterWarpParamValue>>
    | undefined;
  if (input.params) {
    const entries: Record<string, VectorSmartRasterWarpParamValue> = {};
    for (const [key, value] of Object.entries(input.params)) {
      if (
        (typeof value === "number" && Number.isFinite(value))
        || typeof value === "string"
        || typeof value === "boolean"
      ) {
        entries[key] = value;
      }
    }
    if (Object.keys(entries).length > 0) {
      sanitizedParams = entries;
    }
  }
  return {
    id: safeId,
    kind: input.kind,
    ...(typeof input.label === "string" && input.label.length > 0
      ? { label: input.label }
      : {}),
    strength: clamp(finiteNumber(input.strength, 0.5), 0, 1),
    ...(radiusPx !== undefined ? { radiusPx } : {}),
    appliedAtIso:
      typeof input.appliedAtIso === "string" ? input.appliedAtIso : "",
    ...(sanitizedParams ? { params: sanitizedParams } : {}),
  };
}

/**
 * 벡터 레이어에 리퀴파이/스머지/퍼펫 워프를 적용하기 위한
 * 비파괴 스마트 래스터 프록시 레코드를 생성한다.
 *
 * 이미 활성 프록시가 있는 레이어라면 원본 벡터 ID·리비전·스냅샷을 유지한 채
 * 새 워프 연산만 누적한다.
 */
export function createVectorSmartRasterProxy(
  layer: VectorLayer,
  options: CreateVectorSmartRasterProxyOptions,
): VectorSmartRasterProxy {
  const operation = normalizeWarpOperation(options.operation);
  const existing = layer.smartRasterProxy;
  const paddingPx = Math.max(
    0,
    finiteNumber(options.boundsPaddingPx, operation.radiusPx ?? 0),
  );
  const scale = clamp(
    finiteNumber(
      options.rasterResolutionScale,
      existing?.rasterResolutionScale ?? 1,
    ),
    VECTOR_SMART_RASTER_SCALE_MIN,
    VECTOR_SMART_RASTER_SCALE_MAX,
  );

  if (existing && existing.active) {
    const nextKinds = existing.activeWarpKinds.includes(operation.kind)
      ? [...existing.activeWarpKinds]
      : [...existing.activeWarpKinds, operation.kind];
    const expandedBounds = mergeBounds(
      existing.rasterBounds,
      computeVectorLayerProxyBounds(existing.sourceSnapshot, paddingPx),
    );
    return {
      ...existing,
      activeWarpKinds: nextKinds,
      operations: [...existing.operations, operation],
      rasterBounds: expandedBounds,
      rasterResolutionScale: scale,
    };
  }

  const sourceRevision = normalizeVectorLayerRevision(
    options.sourceRevision ?? layer.revision,
    0,
  );
  const sourceSnapshot = cloneSourceLayerSnapshot(layer, sourceRevision);
  const sourceVectorDigest = computeVectorLayerRevisionDigest(sourceSnapshot);
  const proxyId =
    typeof options.proxyId === "string" && options.proxyId.trim().length > 0
      ? options.proxyId.trim()
      : `smart-proxy:${layer.id}:r${sourceRevision}`;

  return {
    kind: VECTOR_SMART_RASTER_PROXY_TYPE,
    proxyId,
    sourceVectorLayerId: layer.id,
    sourceVectorRevision: sourceRevision,
    sourceVectorDigest,
    sourceSnapshot,
    activeWarpKinds: [operation.kind],
    operations: [operation],
    rasterBounds: computeVectorLayerProxyBounds(sourceSnapshot, paddingPx),
    rasterResolutionScale: scale,
    active: true,
  };
}

/**
 * 벡터 레이어에 비파괴 스마트 래스터 워프(리퀴파이/스머지/퍼펫 워프)를 연결한다.
 * 원본 `type: "vector"`, `id`, `revision`, `strokes`를 파괴하지 않고 프록시만 갱신한다.
 */
export function applyVectorSmartRasterWarp(
  layer: VectorLayer,
  options: CreateVectorSmartRasterProxyOptions,
): VectorLayer {
  const proxy = createVectorSmartRasterProxy(layer, options);
  return {
    ...layer,
    revision:
      layer.revision !== undefined
        ? normalizeVectorLayerRevision(layer.revision, 0)
        : proxy.sourceVectorRevision,
    smartRasterProxy: proxy,
  };
}

/**
 * 1클릭 원본 벡터 복귀:
 * 활성 스마트 래스터 프록시를 해제하고 보존된 원본 벡터 ID·리비전·스트로크 스냅샷으로
 * 벡터 레이어를 복원한다. 프록시가 없으면 null을 반환한다.
 */
export function revertVectorSmartRasterProxy(
  layer: VectorLayer,
): RevertVectorSmartRasterProxyResult | null {
  const proxy = layer.smartRasterProxy;
  if (!proxy) return null;

  const restoredLayer = cloneSourceLayerSnapshot(
    {
      ...proxy.sourceSnapshot,
      id: proxy.sourceVectorLayerId,
    },
    proxy.sourceVectorRevision,
  );

  return {
    layer: restoredLayer,
    revertedFromProxyId: proxy.proxyId,
    restoredVectorLayerId: proxy.sourceVectorLayerId,
    restoredRevision: proxy.sourceVectorRevision,
    discardedOperationCount: proxy.operations.length,
  };
}

/**
 * 현재 벡터 레이어의 리비전·기하 지문이 스마트 래스터 프록시 생성 시점과 일치하는지 점검한다.
 */
export function inspectVectorSmartRasterProxySync(
  layer: VectorLayer,
): VectorSmartRasterProxySyncStatus | null {
  const proxy = layer.smartRasterProxy;
  if (!proxy) return null;
  const currentRevision = normalizeVectorLayerRevision(layer.revision, 0);
  const currentDigest = computeVectorLayerRevisionDigest(layer);
  return {
    inSync:
      currentRevision === proxy.sourceVectorRevision
      && currentDigest === proxy.sourceVectorDigest,
    sourceRevision: proxy.sourceVectorRevision,
    currentRevision,
    sourceDigest: proxy.sourceVectorDigest,
    currentDigest,
  };
}

function isPlainPoint(value: unknown): value is VectorPoint2D {
  if (typeof value !== "object" || value === null) return false;
  const pt = value as Record<string, unknown>;
  return (
    typeof pt["x"] === "number"
    && Number.isFinite(pt["x"])
    && typeof pt["y"] === "number"
    && Number.isFinite(pt["y"])
  );
}

function isPlainSegment(value: unknown): value is VectorCubicSegment {
  if (typeof value !== "object" || value === null) return false;
  const seg = value as Record<string, unknown>;
  return (
    isPlainPoint(seg["p0"])
    && isPlainPoint(seg["p1"])
    && isPlainPoint(seg["p2"])
    && isPlainPoint(seg["p3"])
  );
}

function isPlainStroke(value: unknown): value is VectorStroke {
  if (typeof value !== "object" || value === null) return false;
  const stroke = value as Record<string, unknown>;
  return (
    typeof stroke["id"] === "string"
    && Array.isArray(stroke["segments"])
    && (stroke["segments"] as unknown[]).every(isPlainSegment)
    && Array.isArray(stroke["widths"])
    && (stroke["widths"] as unknown[]).every(
      (width) => typeof width === "number" && Number.isFinite(width),
    )
    && (stroke["segments"] as unknown[]).length + 1
      === (stroke["widths"] as unknown[]).length
    && typeof stroke["color"] === "string"
    && VALID_BRUSH_SHAPES.includes(stroke["brushShapeId"] as VectorBrushShapeId)
    && typeof stroke["opacity"] === "number"
    && Number.isFinite(stroke["opacity"])
  );
}

function isSnapshotVectorLayer(value: unknown): value is VectorLayer {
  if (typeof value !== "object" || value === null) return false;
  const layer = value as Record<string, unknown>;
  return (
    typeof layer["id"] === "string"
    && typeof layer["name"] === "string"
    && layer["type"] === "vector"
    && Array.isArray(layer["strokes"])
    && (layer["strokes"] as unknown[]).every(isPlainStroke)
    && typeof layer["visible"] === "boolean"
    && typeof layer["locked"] === "boolean"
    && typeof layer["opacity"] === "number"
    && Number.isFinite(layer["opacity"])
    && layer["smartRasterProxy"] === undefined
  );
}

function isWarpOperation(
  value: unknown,
): value is VectorSmartRasterWarpOperation {
  if (typeof value !== "object" || value === null) return false;
  const op = value as Record<string, unknown>;
  return (
    typeof op["id"] === "string"
    && op["id"].length > 0
    && isVectorSmartRasterWarpKind(op["kind"])
    && typeof op["strength"] === "number"
    && Number.isFinite(op["strength"])
    && typeof op["appliedAtIso"] === "string"
    && (op["radiusPx"] === undefined
      || (typeof op["radiusPx"] === "number"
        && Number.isFinite(op["radiusPx"])
        && op["radiusPx"] >= 0))
  );
}

function isProxyBounds(value: unknown): value is VectorSmartRasterProxyBounds {
  if (typeof value !== "object" || value === null) return false;
  const bounds = value as Record<string, unknown>;
  return (
    typeof bounds["minX"] === "number"
    && Number.isFinite(bounds["minX"])
    && typeof bounds["minY"] === "number"
    && Number.isFinite(bounds["minY"])
    && typeof bounds["maxX"] === "number"
    && Number.isFinite(bounds["maxX"])
    && typeof bounds["maxY"] === "number"
    && Number.isFinite(bounds["maxY"])
  );
}

/** 역직렬화 경계에서 사용하는 스마트 래스터 워프 프록시 런타임 가드. */
export function isVectorSmartRasterProxy(
  value: unknown,
): value is VectorSmartRasterProxy {
  if (typeof value !== "object" || value === null) return false;
  const proxy = value as Record<string, unknown>;
  return (
    proxy["kind"] === VECTOR_SMART_RASTER_PROXY_TYPE
    && typeof proxy["proxyId"] === "string"
    && proxy["proxyId"].length > 0
    && typeof proxy["sourceVectorLayerId"] === "string"
    && proxy["sourceVectorLayerId"].length > 0
    && typeof proxy["sourceVectorRevision"] === "number"
    && Number.isSafeInteger(proxy["sourceVectorRevision"])
    && proxy["sourceVectorRevision"] >= 0
    && typeof proxy["sourceVectorDigest"] === "string"
    && proxy["sourceVectorDigest"].length > 0
    && isSnapshotVectorLayer(proxy["sourceSnapshot"])
    && Array.isArray(proxy["activeWarpKinds"])
    && (proxy["activeWarpKinds"] as unknown[]).every(isVectorSmartRasterWarpKind)
    && Array.isArray(proxy["operations"])
    && (proxy["operations"] as unknown[]).every(isWarpOperation)
    && (proxy["rasterBounds"] === null || isProxyBounds(proxy["rasterBounds"]))
    && typeof proxy["rasterResolutionScale"] === "number"
    && Number.isFinite(proxy["rasterResolutionScale"])
    && proxy["rasterResolutionScale"] >= VECTOR_SMART_RASTER_SCALE_MIN
    && proxy["rasterResolutionScale"] <= VECTOR_SMART_RASTER_SCALE_MAX
    && typeof proxy["active"] === "boolean"
  );
}
