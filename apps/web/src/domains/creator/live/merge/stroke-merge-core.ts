/**
 * 실시간 동시 드로잉 병합 엔진 — 순서·병합 코어.
 *
 * 수렴 원리: 모든 복제본은 "같은 op 로그를 같은 순서로 접으면 같은 상태"라는 한 가지 규칙으로 수렴한다.
 * - 권위 로그(base)는 서버 seq 오름차순으로 접는다.
 * - 내 미확정 op(pending)는 base 뒤에 제출 순서로 접는다(낙관 적용).
 * - 내 op가 seq를 받아 base로 이동하면 다시 접는다 — 서버가 내 제출 순서와 다르게
 *   배열했으면 그 순서가 이긴다(reconcile). 원격 op는 seq 없이는 상태에 들어오지 않는다.
 * - 전달 중복은 opId/seq로, 순서 뒤바뀜은 seq 간격 버퍼링(sync 층)이 막는다.
 *   코어 자체는 어떤 순서로 op를 받아도 "로그 순서대로 접기"만으로 결정적이다.
 */

import {
  IDENTITY_TRANSFORM,
  layerOrderKey,
  type MergeSnapshot,
  type SequencedStrokeOp,
  type SerializedMergeState,
  type StrokeDrawPayload,
  type StrokeInput,
  type StrokeOp,
  type StrokeOpBody,
  type StrokePropKey,
  type StrokePropsPatch,
  type StrokeState,
  type StrokeTransform,
} from "./stroke-merge-types";

export interface MergeState {
  strokes: Map<string, StrokeState>;
  /** layerOrderKey -> z-order 오름차순 strokeId 목록. tombstone도 자리를 유지한다. */
  order: Map<string, string[]>;
}

export function createMergeState(): MergeState {
  return { strokes: new Map(), order: new Map() };
}

function clonePayload(payload: StrokeDrawPayload): StrokeDrawPayload {
  return JSON.parse(JSON.stringify(payload)) as StrokeDrawPayload;
}

export function cloneMergeState(state: MergeState): MergeState {
  const strokes = new Map<string, StrokeState>();
  for (const [id, stroke] of state.strokes) {
    strokes.set(id, { ...stroke, payload: clonePayload(stroke.payload) });
  }
  const order = new Map<string, string[]>();
  for (const [key, ids] of state.order) order.set(key, [...ids]);
  return { strokes, order };
}

function orderList(state: MergeState, pageId: string, layerId: string): string[] {
  const key = layerOrderKey(pageId, layerId);
  let list = state.order.get(key);
  if (!list) {
    list = [];
    state.order.set(key, list);
  }
  return list;
}

function applyPropsPatch(payload: StrokeDrawPayload, patch: StrokePropsPatch): void {
  const target = payload as unknown as Record<string, unknown>;
  for (const key of patch.unset) delete target[key];
  for (const [key, value] of Object.entries(patch.set)) target[key] = value;
}

/**
 * 현재 상태에서 patch가 덮을 값들의 역패치를 계산한다.
 * setProps op 생성 시점(발신자)과 undo 시점(redo prev 재계산)에 쓴다.
 */
export function computePropsInverse(
  payload: StrokeDrawPayload,
  patch: StrokePropsPatch,
): StrokePropsPatch {
  const source = payload as unknown as Record<string, unknown>;
  const inverse: StrokePropsPatch = { set: {}, unset: [] };
  const touched = new Set<StrokePropKey>([
    ...(Object.keys(patch.set) as StrokePropKey[]),
    ...patch.unset,
  ]);
  for (const key of touched) {
    if (key in source && source[key] !== undefined) {
      inverse.set[key] = source[key] as string | number;
    } else {
      inverse.unset.push(key);
    }
  }
  return inverse;
}

export function currentTransform(payload: StrokeDrawPayload): StrokeTransform {
  return payload.transform ? { ...payload.transform } : { ...IDENTITY_TRANSFORM };
}

function placeholderStroke(id: string, actorId: string): StrokeState {
  return {
    id,
    pageId: "",
    layerId: "",
    payload: {
      version: 1,
      type: "draw",
      kind: "placeholder",
      mode: "pen",
      stroke: "#000000",
      strokeWidth: 1,
      points: [],
    },
    deleted: true,
    placeholder: true,
    createdBy: actorId,
  };
}

/**
 * op 하나를 상태에 적용한다. 멱등하다: 같은 op를 두 번 적용해도 상태는 한 번과 같다
 * (add 중복은 무시, remove/restore는 상태 전이, transform/setProps는 같은 값 재기록).
 * 존재하지 않는 대상에 대한 transform/setProps는 무음 no-op이 아니라 로그에는 남고
 * 상태만 건드리지 않는다 — tombstone/미도착 add와의 경합에서 전 복제본이 같게 판단한다.
 */
export function applyOpToState(state: MergeState, op: StrokeOp): void {
  const body: StrokeOpBody = op.body;
  switch (body.kind) {
    case "add": {
      const input: StrokeInput = body.stroke;
      const existing = state.strokes.get(input.id);
      if (existing && !existing.placeholder) return; // 중복 add — 멱등
      const wasPlaceholderDeleted = existing?.placeholder === true && existing.deleted;
      const stroke: StrokeState = {
        id: input.id,
        pageId: input.pageId,
        layerId: input.layerId,
        payload: clonePayload(input.payload),
        deleted: wasPlaceholderDeleted,
        placeholder: false,
        createdBy: existing?.placeholder ? existing.createdBy : op.actorId,
      };
      state.strokes.set(input.id, stroke);
      const list = orderList(state, input.pageId, input.layerId);
      if (!list.includes(input.id)) {
        const beforeId = body.beforeStrokeId ?? null;
        const beforeIndex = beforeId ? list.indexOf(beforeId) : -1;
        if (beforeIndex >= 0) list.splice(beforeIndex, 0, input.id);
        else list.push(input.id);
      }
      return;
    }
    case "remove": {
      const stroke = state.strokes.get(body.strokeId);
      if (!stroke) {
        state.strokes.set(body.strokeId, placeholderStroke(body.strokeId, op.actorId));
        return;
      }
      stroke.deleted = true;
      return;
    }
    case "restore": {
      const stroke = state.strokes.get(body.strokeId);
      if (stroke && !stroke.placeholder) stroke.deleted = false;
      return;
    }
    case "transform": {
      const stroke = state.strokes.get(body.strokeId);
      if (!stroke || stroke.placeholder || stroke.deleted) return;
      stroke.payload = { ...stroke.payload, transform: { ...body.transform } };
      return;
    }
    case "setProps": {
      const stroke = state.strokes.get(body.strokeId);
      if (!stroke || stroke.placeholder || stroke.deleted) return;
      const next = clonePayload(stroke.payload);
      applyPropsPatch(next, body.patch);
      stroke.payload = next;
      return;
    }
  }
}

/** op 목록을 처음부터 접어 상태를 만든다. 순서가 곧 의미다. */
export function foldOps(ops: readonly StrokeOp[]): MergeState {
  const state = createMergeState();
  for (const op of ops) applyOpToState(state, op);
  return state;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(",")}}`;
}

/**
 * 상태의 정규 직렬화. 복제본 간 동등성 비교의 정본이다.
 * 스트로크는 id 순, 순서는 (pageId, layerId) 키 순으로 고정한다.
 */
export function canonicalMergeState(state: MergeState): string {
  const strokes = [...state.strokes.values()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((stroke) => ({
      id: stroke.id,
      pageId: stroke.pageId,
      layerId: stroke.layerId,
      deleted: stroke.deleted,
      placeholder: stroke.placeholder,
      createdBy: stroke.createdBy,
      payload: stroke.payload,
    }));
  const order = [...state.order.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, ids]) => [key, ids]);
  return canonicalStringify({ strokes, order });
}

/** FNV-1a 32bit 해시 (정규 직렬화 기준). 수렴 단언용. */
export function hashMergeState(state: MergeState): string {
  const text = canonicalMergeState(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function serializeMergeState(state: MergeState): SerializedMergeState {
  return {
    strokes: [...state.strokes.values()].map((stroke) => ({
      ...stroke,
      payload: clonePayload(stroke.payload),
    })),
    order: [...state.order.entries()].map(
      ([key, ids]) => [key, [...ids]] as [string, string[]],
    ),
  };
}

export function deserializeMergeState(serialized: SerializedMergeState): MergeState {
  const state = createMergeState();
  for (const stroke of serialized.strokes) {
    state.strokes.set(stroke.id, { ...stroke, payload: clonePayload(stroke.payload) });
  }
  for (const [key, ids] of serialized.order) state.order.set(key, [...ids]);
  return state;
}

/** 스냅샷 + 이후 확정 op로 상태를 복원한다 (catch-up의 스냅샷 경로). */
export function stateFromSnapshotWithTail(
  snapshot: MergeSnapshot,
  tail: readonly SequencedStrokeOp[],
): MergeState {
  const state = deserializeMergeState(snapshot.state);
  for (const op of tail) {
    if (op.seq > snapshot.seq) applyOpToState(state, op);
  }
  return state;
}
