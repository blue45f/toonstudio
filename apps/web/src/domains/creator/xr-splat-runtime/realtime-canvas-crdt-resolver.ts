/**
 * 다중 접속 캔버스 레이어·스트로크 실시간 분산 병합 CRDT 리졸버.
 *
 * - 인과 벡터 시계(Vector Clock) + Lamport 논리 시계 + 결정적 4단계 타이브레이커
 * - 레이어별 필드 단위 LWW-Register + LWW-Element-Set(삭제 툼스톤)로 동시 속성 수정 무손실 보존
 * - 스트로크 단위 LWW-Element-Set로 다중 사용자 동시 드로잉·지우기 충돌 결정적 수렴
 * - 상태 기반 병합(`mergeCanvasCrdtDocuments`)은 교환법칙·결합법칙·멱등성을 100% 만족하는
 *   수학적 Join-Semilattice를 구성한다.
 */

export const CANVAS_CRDT_VERSION = 1 as const;

export type VectorClock = Readonly<Record<string, number>>;

export type CausalRelation = "equal" | "before" | "after" | "concurrent";

export interface CrdtStamp {
  readonly lamport: number;
  readonly wallClockMs: number;
  readonly replicaId: string;
  readonly opSeq: number;
}

export interface LwwRegister<T> {
  readonly value: T;
  readonly stamp: CrdtStamp;
}

export type CanvasLayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken";

export interface CrdtLayerEntry {
  readonly layerId: string;
  readonly addStamp: CrdtStamp | null;
  readonly removeStamp: CrdtStamp | null;
  readonly name: LwwRegister<string>;
  readonly opacity: LwwRegister<number>;
  readonly visible: LwwRegister<boolean>;
  readonly blendMode: LwwRegister<CanvasLayerBlendMode>;
  readonly zOrderKey: LwwRegister<number>;
  readonly locked: LwwRegister<boolean>;
}

export interface CanvasStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface CanvasStrokePayload {
  readonly strokeId: string;
  readonly layerId: string;
  readonly brushId: string;
  readonly colorHex: string;
  readonly widthPx: number;
  readonly opacity: number;
  readonly points: readonly CanvasStrokePoint[];
}

export interface CrdtStrokeEntry {
  readonly strokeId: string;
  readonly addStamp: CrdtStamp | null;
  readonly removeStamp: CrdtStamp | null;
  readonly payload: LwwRegister<CanvasStrokePayload>;
}

export interface CanvasCrdtDocument {
  readonly version: typeof CANVAS_CRDT_VERSION;
  readonly documentId: string;
  readonly vectorClock: VectorClock;
  readonly lamportClock: number;
  readonly layers: Readonly<Record<string, CrdtLayerEntry>>;
  readonly strokes: Readonly<Record<string, CrdtStrokeEntry>>;
}

export interface LayerUpsertPatch {
  readonly layerId: string;
  readonly name?: string;
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly blendMode?: CanvasLayerBlendMode;
  readonly zOrderKey?: number;
  readonly locked?: boolean;
}

export type CanvasCrdtOp =
  | Readonly<{
      kind: "layer-upsert";
      stamp: CrdtStamp;
      patch: LayerUpsertPatch;
    }>
  | Readonly<{
      kind: "layer-remove";
      stamp: CrdtStamp;
      layerId: string;
    }>
  | Readonly<{
      kind: "stroke-add";
      stamp: CrdtStamp;
      payload: CanvasStrokePayload;
    }>
  | Readonly<{
      kind: "stroke-remove";
      stamp: CrdtStamp;
      strokeId: string;
    }>;

export interface MaterializedCanvasLayer {
  readonly layerId: string;
  readonly name: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly blendMode: CanvasLayerBlendMode;
  readonly zOrderKey: number;
  readonly locked: boolean;
}

export interface MaterializedCanvasSnapshot {
  readonly documentId: string;
  readonly lamportClock: number;
  readonly vectorClock: VectorClock;
  readonly layers: readonly MaterializedCanvasLayer[];
  readonly strokes: readonly CanvasStrokePayload[];
}

export interface CanvasCrdtMergeDiagnostics {
  readonly causality: CausalRelation;
  readonly mergedLayerCount: number;
  readonly mergedStrokeCount: number;
  readonly concurrentFieldConflictsResolved: number;
}

export interface CanvasCrdtMergeResult {
  readonly document: CanvasCrdtDocument;
  readonly diagnostics: CanvasCrdtMergeDiagnostics;
}

const ZERO_STAMP: CrdtStamp = Object.freeze({
  lamport: 0,
  wallClockMs: 0,
  replicaId: "",
  opSeq: 0,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function compareLex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function freezeSortedRecord<T>(record: Record<string, T>): Readonly<Record<string, T>> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort(compareLex)) {
    sorted[key] = record[key];
  }
  return Object.freeze(sorted);
}

/**
 * 결정적 4단계 전순서(Total Order) 타임스탬프 비교:
 * `lamport` → `wallClockMs` → `replicaId`(코드유닛 사전순) → `opSeq`.
 */
export function compareCrdtStamps(a: CrdtStamp, b: CrdtStamp): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.wallClockMs !== b.wallClockMs) return a.wallClockMs - b.wallClockMs;
  const replicaCmp = compareLex(a.replicaId, b.replicaId);
  if (replicaCmp !== 0) return replicaCmp;
  return a.opSeq - b.opSeq;
}

function maxStamp(a: CrdtStamp | null, b: CrdtStamp | null): CrdtStamp | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareCrdtStamps(a, b) >= 0 ? a : b;
}

/** 두 벡터 시계의 점별 최댓값(pointwise max)을 계산한다. */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const merged: Record<string, number> = {};
  for (const key of [...keys].sort(compareLex)) {
    merged[key] = Math.max(a[key] ?? 0, b[key] ?? 0);
  }
  return Object.freeze(merged);
}

/** 두 벡터 시계 사이의 인과 부분순서 관계를 판정한다. */
export function compareVectorClocks(a: VectorClock, b: VectorClock): CausalRelation {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let aLessThanB = false;
  let aGreaterThanB = false;

  for (const key of keys) {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    if (va < vb) aLessThanB = true;
    else if (va > vb) aGreaterThanB = true;
  }

  if (!aLessThanB && !aGreaterThanB) return "equal";
  if (aLessThanB && !aGreaterThanB) return "before";
  if (!aLessThanB && aGreaterThanB) return "after";
  return "concurrent";
}

function mergeLwwRegister<T>(
  a: LwwRegister<T>,
  b: LwwRegister<T>,
  tieBreakCompare: (va: T, vb: T) => number,
): Readonly<{ register: LwwRegister<T>; hadConflict: boolean }> {
  const cmp = compareCrdtStamps(a.stamp, b.stamp);
  if (cmp > 0) {
    return {
      register: a,
      hadConflict: b.stamp.lamport > 0 && tieBreakCompare(a.value, b.value) !== 0,
    };
  }
  if (cmp < 0) {
    return {
      register: b,
      hadConflict: a.stamp.lamport > 0 && tieBreakCompare(a.value, b.value) !== 0,
    };
  }
  // 동일 타임스탬프가 다른 값을 가리킬 때도 교환법칙·결합법칙을 유지하도록 값 자체로 결정적 타이브레이크
  const valCmp = tieBreakCompare(a.value, b.value);
  return {
    register: valCmp >= 0 ? a : b,
    hadConflict: valCmp !== 0,
  };
}

function compareNumber(a: number, b: number): number {
  return a - b;
}

function compareBoolean(a: boolean, b: boolean): number {
  return Number(a) - Number(b);
}

function compareStrokePayload(a: CanvasStrokePayload, b: CanvasStrokePayload): number {
  return compareLex(JSON.stringify(a), JSON.stringify(b));
}

function nextLocalStamp(
  doc: CanvasCrdtDocument,
  replicaId: string,
  wallClockMs: number,
): Readonly<{ stamp: CrdtStamp; vectorClock: VectorClock; lamportClock: number }> {
  const cleanReplica = replicaId.trim();
  if (!cleanReplica) {
    throw new Error("CRDT replicaId must be a non-empty string.");
  }
  const nextSeq = (doc.vectorClock[cleanReplica] ?? 0) + 1;
  const nextLamport = doc.lamportClock + 1;
  const stamp: CrdtStamp = Object.freeze({
    lamport: nextLamport,
    wallClockMs: Number.isFinite(wallClockMs) ? Math.floor(wallClockMs) : 0,
    replicaId: cleanReplica,
    opSeq: nextSeq,
  });
  const vectorClock = mergeVectorClocks(doc.vectorClock, { [cleanReplica]: nextSeq });
  return { stamp, vectorClock, lamportClock: nextLamport };
}

/** 빈 캔버스 CRDT 문서를 생성한다. */
export function createCanvasCrdtDocument(documentId: string): CanvasCrdtDocument {
  return Object.freeze({
    version: CANVAS_CRDT_VERSION,
    documentId: documentId.trim() || "canvas-default",
    vectorClock: Object.freeze({}),
    lamportClock: 0,
    layers: Object.freeze({}),
    strokes: Object.freeze({}),
  });
}

function makeDefaultLayerEntry(layerId: string): CrdtLayerEntry {
  return Object.freeze({
    layerId,
    addStamp: null,
    removeStamp: null,
    name: Object.freeze({ value: layerId, stamp: ZERO_STAMP }),
    opacity: Object.freeze({ value: 1, stamp: ZERO_STAMP }),
    visible: Object.freeze({ value: true, stamp: ZERO_STAMP }),
    blendMode: Object.freeze({ value: "normal" as CanvasLayerBlendMode, stamp: ZERO_STAMP }),
    zOrderKey: Object.freeze({ value: 0, stamp: ZERO_STAMP }),
    locked: Object.freeze({ value: false, stamp: ZERO_STAMP }),
  });
}

function mergeLayerEntries(
  a: CrdtLayerEntry,
  b: CrdtLayerEntry,
): Readonly<{ entry: CrdtLayerEntry; conflicts: number }> {
  const nameRes = mergeLwwRegister(a.name, b.name, compareLex);
  const opacityRes = mergeLwwRegister(a.opacity, b.opacity, compareNumber);
  const visibleRes = mergeLwwRegister(a.visible, b.visible, compareBoolean);
  const blendRes = mergeLwwRegister(a.blendMode, b.blendMode, compareLex);
  const zOrderRes = mergeLwwRegister(a.zOrderKey, b.zOrderKey, compareNumber);
  const lockedRes = mergeLwwRegister(a.locked, b.locked, compareBoolean);

  const conflicts =
    Number(nameRes.hadConflict) +
    Number(opacityRes.hadConflict) +
    Number(visibleRes.hadConflict) +
    Number(blendRes.hadConflict) +
    Number(zOrderRes.hadConflict) +
    Number(lockedRes.hadConflict);

  return {
    entry: Object.freeze({
      layerId: a.layerId,
      addStamp: maxStamp(a.addStamp, b.addStamp),
      removeStamp: maxStamp(a.removeStamp, b.removeStamp),
      name: nameRes.register,
      opacity: opacityRes.register,
      visible: visibleRes.register,
      blendMode: blendRes.register,
      zOrderKey: zOrderRes.register,
      locked: lockedRes.register,
    }),
    conflicts,
  };
}

function mergeStrokeEntries(
  a: CrdtStrokeEntry,
  b: CrdtStrokeEntry,
): Readonly<{ entry: CrdtStrokeEntry; conflicts: number }> {
  const payloadRes = mergeLwwRegister(a.payload, b.payload, compareStrokePayload);
  return {
    entry: Object.freeze({
      strokeId: a.strokeId,
      addStamp: maxStamp(a.addStamp, b.addStamp),
      removeStamp: maxStamp(a.removeStamp, b.removeStamp),
      payload: payloadRes.register,
    }),
    conflicts: Number(payloadRes.hadConflict),
  };
}

function freezeStrokePayload(payload: CanvasStrokePayload): CanvasStrokePayload {
  return Object.freeze({
    strokeId: payload.strokeId,
    layerId: payload.layerId,
    brushId: payload.brushId,
    colorHex: payload.colorHex,
    widthPx: clamp(payload.widthPx, 0.25, 1024),
    opacity: clamp(payload.opacity, 0, 1),
    points: Object.freeze(
      payload.points.map((pt) =>
        Object.freeze({
          x: pt.x,
          y: pt.y,
          pressure: clamp(pt.pressure, 0, 1),
        }),
      ),
    ),
  });
}

/**
 * 단일 CRDT 연산을 문서에 멱등·순서무관하게 적용한다.
 * 동일 연산을 여러 번 적용하거나 역순으로 도착해도 최종 상태는 동일하다.
 */
export function applyCanvasCrdtOp(
  doc: CanvasCrdtDocument,
  op: CanvasCrdtOp,
): CanvasCrdtDocument {
  const nextVectorClock = mergeVectorClocks(doc.vectorClock, {
    [op.stamp.replicaId]: op.stamp.opSeq,
  });
  const nextLamport = Math.max(doc.lamportClock, op.stamp.lamport);

  if (op.kind === "layer-upsert") {
    const id = op.patch.layerId;
    const base = doc.layers[id] ?? makeDefaultLayerEntry(id);
    const deltaEntry: CrdtLayerEntry = Object.freeze({
      layerId: id,
      addStamp: op.stamp,
      removeStamp: null,
      name: op.patch.name !== undefined
        ? Object.freeze({ value: op.patch.name, stamp: op.stamp })
        : Object.freeze({ value: id, stamp: ZERO_STAMP }),
      opacity: op.patch.opacity !== undefined
        ? Object.freeze({ value: clamp(op.patch.opacity, 0, 1), stamp: op.stamp })
        : Object.freeze({ value: 1, stamp: ZERO_STAMP }),
      visible: op.patch.visible !== undefined
        ? Object.freeze({ value: op.patch.visible, stamp: op.stamp })
        : Object.freeze({ value: true, stamp: ZERO_STAMP }),
      blendMode: op.patch.blendMode !== undefined
        ? Object.freeze({ value: op.patch.blendMode, stamp: op.stamp })
        : Object.freeze({ value: "normal" as CanvasLayerBlendMode, stamp: ZERO_STAMP }),
      zOrderKey: op.patch.zOrderKey !== undefined
        ? Object.freeze({ value: op.patch.zOrderKey, stamp: op.stamp })
        : Object.freeze({ value: 0, stamp: ZERO_STAMP }),
      locked: op.patch.locked !== undefined
        ? Object.freeze({ value: op.patch.locked, stamp: op.stamp })
        : Object.freeze({ value: false, stamp: ZERO_STAMP }),
    });
    const mergedEntry = mergeLayerEntries(base, deltaEntry).entry;
    return Object.freeze({
      ...doc,
      vectorClock: nextVectorClock,
      lamportClock: nextLamport,
      layers: freezeSortedRecord({ ...doc.layers, [id]: mergedEntry }),
    });
  }

  if (op.kind === "layer-remove") {
    const id = op.layerId;
    const base = doc.layers[id] ?? makeDefaultLayerEntry(id);
    const updated: CrdtLayerEntry = Object.freeze({
      ...base,
      removeStamp: maxStamp(base.removeStamp, op.stamp),
    });
    return Object.freeze({
      ...doc,
      vectorClock: nextVectorClock,
      lamportClock: nextLamport,
      layers: freezeSortedRecord({ ...doc.layers, [id]: updated }),
    });
  }

  if (op.kind === "stroke-add") {
    const frozenPayload = freezeStrokePayload(op.payload);
    const id = frozenPayload.strokeId;
    const deltaEntry: CrdtStrokeEntry = Object.freeze({
      strokeId: id,
      addStamp: op.stamp,
      removeStamp: null,
      payload: Object.freeze({ value: frozenPayload, stamp: op.stamp }),
    });
    const base = doc.strokes[id];
    const mergedEntry = base ? mergeStrokeEntries(base, deltaEntry).entry : deltaEntry;
    return Object.freeze({
      ...doc,
      vectorClock: nextVectorClock,
      lamportClock: nextLamport,
      strokes: freezeSortedRecord({ ...doc.strokes, [id]: mergedEntry }),
    });
  }

  // stroke-remove
  const id = op.strokeId;
  const base = doc.strokes[id];
  const updated: CrdtStrokeEntry = base
    ? Object.freeze({ ...base, removeStamp: maxStamp(base.removeStamp, op.stamp) })
    : Object.freeze({
        strokeId: id,
        addStamp: null,
        removeStamp: op.stamp,
        payload: Object.freeze({
          value: freezeStrokePayload({
            strokeId: id,
            layerId: "",
            brushId: "",
            colorHex: "#000000",
            widthPx: 1,
            opacity: 0,
            points: [],
          }),
          stamp: ZERO_STAMP,
        }),
      });

  return Object.freeze({
    ...doc,
    vectorClock: nextVectorClock,
    lamportClock: nextLamport,
    strokes: freezeSortedRecord({ ...doc.strokes, [id]: updated }),
  });
}

/** 로컬 레플리카에서 레이어 생성/수정을 적용하고 브로드캐스트용 CRDT 연산을 반환한다. */
export function applyLocalLayerUpsert(
  doc: CanvasCrdtDocument,
  replicaId: string,
  patch: LayerUpsertPatch,
  wallClockMs: number,
): Readonly<{ document: CanvasCrdtDocument; op: CanvasCrdtOp }> {
  const { stamp } = nextLocalStamp(doc, replicaId, wallClockMs);
  const op: CanvasCrdtOp = Object.freeze({
    kind: "layer-upsert",
    stamp,
    patch: Object.freeze({ ...patch }),
  });
  return Object.freeze({ document: applyCanvasCrdtOp(doc, op), op });
}

/** 로컬 레플리카에서 레이어 삭제 툼스톤을 기록한다. */
export function applyLocalLayerRemove(
  doc: CanvasCrdtDocument,
  replicaId: string,
  layerId: string,
  wallClockMs: number,
): Readonly<{ document: CanvasCrdtDocument; op: CanvasCrdtOp }> {
  const { stamp } = nextLocalStamp(doc, replicaId, wallClockMs);
  const op: CanvasCrdtOp = Object.freeze({
    kind: "layer-remove",
    stamp,
    layerId,
  });
  return Object.freeze({ document: applyCanvasCrdtOp(doc, op), op });
}

/** 로컬 레플리카에서 스트로크 추가를 적용한다. */
export function applyLocalStrokeAdd(
  doc: CanvasCrdtDocument,
  replicaId: string,
  payload: CanvasStrokePayload,
  wallClockMs: number,
): Readonly<{ document: CanvasCrdtDocument; op: CanvasCrdtOp }> {
  const { stamp } = nextLocalStamp(doc, replicaId, wallClockMs);
  const op: CanvasCrdtOp = Object.freeze({
    kind: "stroke-add",
    stamp,
    payload: freezeStrokePayload(payload),
  });
  return Object.freeze({ document: applyCanvasCrdtOp(doc, op), op });
}

/** 로컬 레플리카에서 스트로크 삭제(지우기/실행취소) 툼스톤을 기록한다. */
export function applyLocalStrokeRemove(
  doc: CanvasCrdtDocument,
  replicaId: string,
  strokeId: string,
  wallClockMs: number,
): Readonly<{ document: CanvasCrdtDocument; op: CanvasCrdtOp }> {
  const { stamp } = nextLocalStamp(doc, replicaId, wallClockMs);
  const op: CanvasCrdtOp = Object.freeze({
    kind: "stroke-remove",
    stamp,
    strokeId,
  });
  return Object.freeze({ document: applyCanvasCrdtOp(doc, op), op });
}

/**
 * 두 분산 캔버스 CRDT 문서 상태를 Join-Semilattice 규칙으로 병합한다.
 * - 교환법칙: `merge(A, B) === merge(B, A)`
 * - 결합법칙: `merge(merge(A, B), C) === merge(A, merge(B, C))`
 * - 멱등성: `merge(A, A) === A`
 */
export function mergeCanvasCrdtDocuments(
  a: CanvasCrdtDocument,
  b: CanvasCrdtDocument,
): CanvasCrdtMergeResult {
  const causality = compareVectorClocks(a.vectorClock, b.vectorClock);
  const mergedClock = mergeVectorClocks(a.vectorClock, b.vectorClock);
  const mergedLamport = Math.max(a.lamportClock, b.lamportClock);
  const documentId = compareLex(a.documentId, b.documentId) <= 0 ? a.documentId : b.documentId;

  let conflicts = 0;

  const layerIds = new Set([...Object.keys(a.layers), ...Object.keys(b.layers)]);
  const mergedLayers: Record<string, CrdtLayerEntry> = {};
  for (const id of [...layerIds].sort(compareLex)) {
    const la = a.layers[id];
    const lb = b.layers[id];
    if (la && lb) {
      const res = mergeLayerEntries(la, lb);
      mergedLayers[id] = res.entry;
      conflicts += res.conflicts;
    } else {
      mergedLayers[id] = (la ?? lb)!;
    }
  }

  const strokeIds = new Set([...Object.keys(a.strokes), ...Object.keys(b.strokes)]);
  const mergedStrokes: Record<string, CrdtStrokeEntry> = {};
  for (const id of [...strokeIds].sort(compareLex)) {
    const sa = a.strokes[id];
    const sb = b.strokes[id];
    if (sa && sb) {
      const res = mergeStrokeEntries(sa, sb);
      mergedStrokes[id] = res.entry;
      conflicts += res.conflicts;
    } else {
      mergedStrokes[id] = (sa ?? sb)!;
    }
  }

  const document: CanvasCrdtDocument = Object.freeze({
    version: CANVAS_CRDT_VERSION,
    documentId,
    vectorClock: mergedClock,
    lamportClock: mergedLamport,
    layers: freezeSortedRecord(mergedLayers),
    strokes: freezeSortedRecord(mergedStrokes),
  });

  return Object.freeze({
    document,
    diagnostics: Object.freeze({
      causality,
      mergedLayerCount: Object.keys(mergedLayers).length,
      mergedStrokeCount: Object.keys(mergedStrokes).length,
      concurrentFieldConflictsResolved: conflicts,
    }),
  });
}

function isElementAlive(addStamp: CrdtStamp | null, removeStamp: CrdtStamp | null): boolean {
  if (addStamp === null) return false;
  if (removeStamp === null) return true;
  // 동시 add/remove 시 결정적으로 remove-wins(엄격히 addStamp > removeStamp일 때만 활성)
  return compareCrdtStamps(addStamp, removeStamp) > 0;
}

/**
 * CRDT 내부 툼스톤과 메타데이터를 정리해 렌더링 가능한 활성 레이어·스트로크 스냅샷을 구체화한다.
 */
export function materializeCanvasSnapshot(
  doc: CanvasCrdtDocument,
): MaterializedCanvasSnapshot {
  const activeLayerIds = new Set<string>();
  const layers: MaterializedCanvasLayer[] = [];

  for (const entry of Object.values(doc.layers)) {
    if (!isElementAlive(entry.addStamp, entry.removeStamp)) continue;
    activeLayerIds.add(entry.layerId);
    layers.push(
      Object.freeze({
        layerId: entry.layerId,
        name: entry.name.value,
        opacity: entry.opacity.value,
        visible: entry.visible.value,
        blendMode: entry.blendMode.value,
        zOrderKey: entry.zOrderKey.value,
        locked: entry.locked.value,
      }),
    );
  }

  layers.sort((a, b) => {
    if (a.zOrderKey !== b.zOrderKey) return a.zOrderKey - b.zOrderKey;
    return compareLex(a.layerId, b.layerId);
  });

  const activeStrokes = Object.values(doc.strokes)
    .filter(
      (entry) =>
        isElementAlive(entry.addStamp, entry.removeStamp) &&
        activeLayerIds.has(entry.payload.value.layerId),
    )
    .sort((a, b) => {
      const cmp = compareCrdtStamps(a.addStamp!, b.addStamp!);
      if (cmp !== 0) return cmp;
      return compareLex(a.strokeId, b.strokeId);
    })
    .map((entry) => entry.payload.value);

  return Object.freeze({
    documentId: doc.documentId,
    lamportClock: doc.lamportClock,
    vectorClock: doc.vectorClock,
    layers: Object.freeze(layers),
    strokes: Object.freeze(activeStrokes),
  });
}

/** 수렴성 검증을 위해 CRDT 문서를 정규 키 순서 JSON 문자열로 직렬화한다. */
export function canonicalSerializeCrdtDocument(doc: CanvasCrdtDocument): string {
  return JSON.stringify(doc);
}
