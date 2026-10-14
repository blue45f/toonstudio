/**
 * 실시간 동시 드로잉 병합 엔진 — op 채널 병행 계약 (서버 측 코어).
 *
 * 근거: realtime-stroke-merge-engine/HOST_INSERTION_SPEC.md 2절.
 * 프로덕션 권위는 기존 Yjs CRDT 문서 + 게이트웨이가 유지하고, 이 모듈은 같은
 * 소켓·같은 인증·같은 ACK 봉투 위에 얹는 병행(parallel) op 채널의 서버 계약이다.
 * 웹 코어(`apps/web/src/domains/creator/live/merge/`)와 와이어 형태가 1:1로
 * 맞도록 미러링한 타입·접기 규칙을 쓰며, 전송·프레임워크에는 의존하지 않는다.
 *
 * 계약 (HOST_INSERTION_SPEC 2절의 요구 2건을 코드로 고정):
 *  1. 스냅샷 응답에는 그 스냅샷에 포함된 opId 집합(`opIds`)과 그 집합의
 *     digest를 반드시 실는다 — 클라이언트의 pending 정리가 여기에 의존한다
 *     (웹 코어 `StrokeMergeClient.adoptSnapshot(snapshot, snapshotOpIds)`).
 *  2. 클라이언트→서버 경로는 발신자 단위 FIFO다. Socket.IO 단일 소켓의 순서
 *     보장에 더해, 게이트웨이는 발신자별 직렬화 체인으로 제출을 줄 세우고
 *     이 방(room)은 발신자 카운터 단조성을 강제한다: 다음 카운터가 아니면
 *     거부한다(중복 opId 재제출만 dedupe로 허용). undo 역연산이 원본보다
 *     먼저 seq를 받는 일은 구조적으로 일어나지 않는다.
 *
 * 순서의 권위: 방 단위 로그의 seq다. 영속 저장소가 seq를 부여한다
 * (Drizzle 구현은 CRDT 로그와 같은 identity + advisory lock 패턴 —
 * studio-live-op.repository.ts). 이 방은 저장소에서 hydrate한 로그를 접어
 * 스냅샷·catch-up을 만들고, 증분 상태와 전체 접기의 일치를 스스로 검증한다.
 */

/** op 채널 이벤트 이름. HOST_INSERTION_SPEC 2절의 계약 그대로다. */
export const STUDIO_LIVE_OP_SUBMIT_EVENT = "studio:op:submit" as const;
export const STUDIO_LIVE_OP_BROADCAST_EVENT = "studio:op:broadcast" as const;
export const STUDIO_LIVE_OP_SYNC_EVENT = "studio:op:sync" as const;

/** op 봉투 1건의 직렬화 상한. CRDT 업데이트 상한(48KiB)과 같은 급으로 맞춘다. */
export const STUDIO_OP_MAX_BYTES = 48 * 1_024;
/** 스냅샷 상태 JSON 상한. CRDT 스냅샷 상한(16MiB)과 같다. */
export const STUDIO_OP_SNAPSHOT_MAX_BYTES = 16 * 1_024 * 1_024;
/** 방 하나가 메모리에 유지하는 op 수 상한(병행 검증 로그 v1 — 압축은 후속). */
export const STUDIO_OP_ROOM_LOG_MAX_OPS = 100_000;

const DEFAULT_SNAPSHOT_DEPTH = 500;

// ---------------------------------------------------------------------------
// 와이어 타입 — 웹 코어 stroke-merge-types.ts와 구조가 동일하다.
// ---------------------------------------------------------------------------

export interface StudioLiveOpTransform {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
}

export interface StudioLiveOpDrawPayload {
  version: 1;
  type: "draw";
  kind: string;
  mode: "pen" | "eraser";
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  blendMode?: string;
  points: number[];
  pressures?: number[];
  transform?: StudioLiveOpTransform;
}

export interface StudioLiveOpStrokeInput {
  id: string;
  pageId: string;
  layerId: string;
  payload: StudioLiveOpDrawPayload;
}

export type StudioLiveOpPropKey = "stroke" | "strokeWidth" | "opacity" | "blendMode";

export interface StudioLiveOpPropsPatch {
  set: Partial<Record<StudioLiveOpPropKey, string | number>>;
  unset: StudioLiveOpPropKey[];
}

export type StudioLiveOpBody =
  | {
      kind: "add";
      stroke: StudioLiveOpStrokeInput;
      beforeStrokeId?: string | null;
    }
  | { kind: "remove"; strokeId: string }
  | { kind: "restore"; strokeId: string }
  | {
      kind: "transform";
      strokeId: string;
      transform: StudioLiveOpTransform;
      prev: StudioLiveOpTransform;
    }
  | {
      kind: "setProps";
      strokeId: string;
      patch: StudioLiveOpPropsPatch;
      prev: StudioLiveOpPropsPatch;
    };

/** 전송·저장 단위 op 봉투. 웹 코어 `StrokeOp`와 동일하다. */
export interface StudioLiveOp {
  /** `${actorId}:${counter}` — 전역 유일, 멱등 dedupe 키이자 FIFO 카운터의 출처. */
  opId: string;
  actorId: string;
  lamport: number;
  baseSeq: number;
  body: StudioLiveOpBody;
}

/** 서버 총순서가 부여된 op. 브로드캐스트와 catch-up은 이 형태만 흐른다. */
export interface SequencedStudioLiveOp extends StudioLiveOp {
  seq: number;
}

export interface StudioLiveOpStrokeState {
  id: string;
  pageId: string;
  layerId: string;
  payload: StudioLiveOpDrawPayload;
  deleted: boolean;
  placeholder: boolean;
  createdBy: string;
}

/** 웹 코어 `SerializedMergeState`와 동일한 직렬화 형태. */
export interface StudioLiveOpSerializedState {
  strokes: StudioLiveOpStrokeState[];
  order: [string, string[]][];
}

/**
 * 스냅샷 와이어 형태. 계약 요구 1: `opIds`는 이 스냅샷(seq 이하)에 접힌
 * op 전부의 opId( seq 오름차순), `opIdDigest`는 그 집합의 digest다.
 * 클라이언트는 opIds로 pending을 정리하고, digest로 집합 일치를 값싸게 대조한다.
 */
export interface StudioLiveOpSnapshot {
  seq: number;
  state: StudioLiveOpSerializedState;
  opIds: string[];
  opIdDigest: string;
}

/** `studio:op:submit` ACK data. 웹 코어 SubmitResult의 와이어 형태. */
export interface StudioLiveOpSubmitAck {
  workId: string;
  opId: string;
  seq: number;
  duplicate: boolean;
}

/** `studio:op:broadcast` 페이로드 (서버→방 전체, 발신자 제외). */
export interface StudioLiveOpBroadcast {
  workId: string;
  op: SequencedStudioLiveOp;
}

/** `studio:op:sync` ACK data. 웹 코어 `syncFor` 결과 + 계약 메타. */
export interface StudioLiveOpSyncResult {
  workId: string;
  /** 요청자가 보낸 fromSeq를 그대로 돌려준다 (응답 상관용). */
  fromSeq: number;
  lastSeq: number;
  snapshot?: StudioLiveOpSnapshot;
  ops: SequencedStudioLiveOp[];
}

// ---------------------------------------------------------------------------
// opId 집합 digest — 웹 코어 hashMergeState와 같은 FNV-1a 32bit.
// ---------------------------------------------------------------------------

export function digestStudioLiveOpIds(opIds: readonly string[]): string {
  const text = opIds.join("\u0000");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** opId에서 발신자 카운터를 읽는다. 형식이 아니면 null. */
export function studioLiveOpCounter(op: StudioLiveOp): number | null {
  const prefix = `${op.actorId}:`;
  if (!op.opId.startsWith(prefix)) return null;
  const rest = op.opId.slice(prefix.length);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(rest)) return null;
  const counter = Number(rest);
  return Number.isSafeInteger(counter) && counter >= 1 ? counter : null;
}

/** opId만으로 (actorId, counter)를 나눈다. 스냅샷 opId 집합에서 FIFO 상태를 복원할 때 쓴다. */
export function parseStudioLiveOpId(
  opId: string
): { actorId: string; counter: number } | null {
  const split = opId.lastIndexOf(":");
  if (split <= 0) return null;
  const rest = opId.slice(split + 1);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(rest)) return null;
  const counter = Number(rest);
  if (!Number.isSafeInteger(counter) || counter < 1) return null;
  return { actorId: opId.slice(0, split), counter };
}

export function studioLiveOpByteLength(op: StudioLiveOp): number {
  return Buffer.byteLength(JSON.stringify(op), "utf8");
}

// ---------------------------------------------------------------------------
// 접기(fold) — 웹 코어 stroke-merge-core.ts의 applyOpToState와 같은 규칙.
// 서버는 의미를 해석해 순서를 바꾸지 않는다. 스냅샷 상태를 만들기 위해
// 전 복제본과 같은 접기를 수행할 뿐이다.
// ---------------------------------------------------------------------------

export interface StudioLiveOpFoldState {
  strokes: Map<string, StudioLiveOpStrokeState>;
  order: Map<string, string[]>;
}

export function createStudioLiveOpFoldState(): StudioLiveOpFoldState {
  return { strokes: new Map(), order: new Map() };
}

function clonePayload(payload: StudioLiveOpDrawPayload): StudioLiveOpDrawPayload {
  return JSON.parse(JSON.stringify(payload)) as StudioLiveOpDrawPayload;
}

export function cloneStudioLiveOpFoldState(
  state: StudioLiveOpFoldState
): StudioLiveOpFoldState {
  const strokes = new Map<string, StudioLiveOpStrokeState>();
  for (const [id, stroke] of state.strokes) {
    strokes.set(id, { ...stroke, payload: clonePayload(stroke.payload) });
  }
  const order = new Map<string, string[]>();
  for (const [key, ids] of state.order) order.set(key, [...ids]);
  return { strokes, order };
}

function layerOrderKey(pageId: string, layerId: string): string {
  return `${pageId}\u0000${layerId}`;
}

function orderList(state: StudioLiveOpFoldState, pageId: string, layerId: string): string[] {
  const key = layerOrderKey(pageId, layerId);
  let list = state.order.get(key);
  if (!list) {
    list = [];
    state.order.set(key, list);
  }
  return list;
}

function placeholderStroke(id: string, actorId: string): StudioLiveOpStrokeState {
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

function applyPropsPatch(
  payload: StudioLiveOpDrawPayload,
  patch: StudioLiveOpPropsPatch
): void {
  const target = payload as unknown as Record<string, unknown>;
  for (const key of patch.unset) delete target[key];
  for (const [key, value] of Object.entries(patch.set)) target[key] = value;
}

/** op 하나를 상태에 적용한다. 웹 코어와 동일하게 멱등하다. */
export function applyStudioLiveOpToState(
  state: StudioLiveOpFoldState,
  op: StudioLiveOp
): void {
  const body = op.body;
  switch (body.kind) {
    case "add": {
      const input = body.stroke;
      const existing = state.strokes.get(input.id);
      if (existing && !existing.placeholder) return;
      const wasPlaceholderDeleted = existing?.placeholder === true && existing.deleted;
      const stroke: StudioLiveOpStrokeState = {
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

export function serializeStudioLiveOpState(
  state: StudioLiveOpFoldState
): StudioLiveOpSerializedState {
  return {
    strokes: [...state.strokes.values()].map((stroke) => ({
      ...stroke,
      payload: clonePayload(stroke.payload),
    })),
    order: [...state.order.entries()].map(
      ([key, ids]) => [key, [...ids]] as [string, string[]]
    ),
  };
}

export function deserializeStudioLiveOpState(
  serialized: StudioLiveOpSerializedState
): StudioLiveOpFoldState {
  const state = createStudioLiveOpFoldState();
  for (const stroke of serialized.strokes) {
    state.strokes.set(stroke.id, { ...stroke, payload: clonePayload(stroke.payload) });
  }
  for (const [key, ids] of serialized.order) state.order.set(key, [...ids]);
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

/** 상태 동등성 단언용 정규 해시. 웹 코어 hashMergeState와 같은 산출을 낸다. */
export function hashStudioLiveOpState(state: StudioLiveOpFoldState): string {
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
  const text = canonicalStringify({ strokes, order });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// 영속 저장소 계약 — 방 단위 op 로그.
// 구현: studio-live-op.repository.ts (Drizzle / 인메모리).
// ---------------------------------------------------------------------------

export interface StudioLiveOpStoredSnapshot {
  seq: number;
  state: StudioLiveOpSerializedState;
  opIds: string[];
}

export interface StudioLiveOpAppendResult {
  /** false면 같은 opId가 이미 있어 기존 기록을 돌려준 것이다. */
  inserted: boolean;
  op: SequencedStudioLiveOp;
}

export interface StudioLiveOpLogStore {
  /**
   * op에 방 단위 seq를 부여해 영속한다. seq 부여가 곧 순서의 linearization
   * 지점이며, 같은 opId 재제출은 새 seq를 만들지 않는다.
   */
  appendOp(
    workId: string,
    op: StudioLiveOp,
    actorUserId: string
  ): Promise<StudioLiveOpAppendResult>;
  /** afterSeq보다 큰 seq의 op 전부 (seq 오름차순). */
  listOpsAfter(workId: string, afterSeq: number): Promise<SequencedStudioLiveOp[]>;
  loadSnapshot(workId: string): Promise<StudioLiveOpStoredSnapshot | null>;
  saveSnapshot(workId: string, snapshot: StudioLiveOpStoredSnapshot): Promise<void>;
}

// ---------------------------------------------------------------------------
// 방(room) — hydrate된 로그 + 접힌 상태 + FIFO 강제.
// ---------------------------------------------------------------------------

export type StudioLiveOpFifoRejection =
  | { ok: false; reason: "gap"; expectedCounter: number; receivedCounter: number }
  | { ok: false; reason: "regression"; expectedCounter: number; receivedCounter: number }
  | { ok: false; reason: "malformed_op_id" };

export type StudioLiveOpSubmitOutcome =
  | { status: "accepted"; result: StudioLiveOpAppendResult }
  | { status: "duplicate"; result: StudioLiveOpAppendResult }
  | { status: "fifo_rejected"; rejection: StudioLiveOpFifoRejection }
  | { status: "log_limit" };

export interface StudioLiveOpRoomOptions {
  snapshotDepth?: number;
}

export class StudioLiveOpRoom {
  readonly workId: string;
  private readonly store: StudioLiveOpLogStore;
  private readonly snapshotDepth: number;
  private log: SequencedStudioLiveOp[] = [];
  private readonly seqByOpId = new Map<string, number>();
  /** 발신자(actorId)별 마지막으로 받아들인 카운터. FIFO 강제의 상태. */
  private readonly lastCounterByActor = new Map<string, number>();
  private baseSnapshot: StudioLiveOpStoredSnapshot | null = null;
  private state: StudioLiveOpFoldState = createStudioLiveOpFoldState();
  private tail: Promise<void> = Promise.resolve();

  private constructor(
    workId: string,
    store: StudioLiveOpLogStore,
    options: StudioLiveOpRoomOptions
  ) {
    this.workId = workId;
    this.store = store;
    this.snapshotDepth = options.snapshotDepth ?? DEFAULT_SNAPSHOT_DEPTH;
  }

  /** 저장소에서 스냅샷 + 꼬리 로그를 읽어 방을 복원한다. */
  static async open(
    workId: string,
    store: StudioLiveOpLogStore,
    options: StudioLiveOpRoomOptions = {}
  ): Promise<StudioLiveOpRoom> {
    const room = new StudioLiveOpRoom(workId, store, options);
    const snapshot = await store.loadSnapshot(workId);
    if (snapshot) {
      room.baseSnapshot = snapshot;
      room.state = deserializeStudioLiveOpState(snapshot.state);
      for (let i = 0; i < snapshot.opIds.length; i += 1) {
        const opId = snapshot.opIds[i];
        room.seqByOpId.set(opId, i + 1);
        // 스냅샷에 접힌 op에서도 발신자 카운터 high-water를 복원한다.
        // 이 복원이 없으면 재시작 뒤 정상적인 다음 카운터가 gap으로 거부된다.
        const parsed = parseStudioLiveOpId(opId);
        if (parsed) {
          const last = room.lastCounterByActor.get(parsed.actorId) ?? 0;
          if (parsed.counter > last) room.lastCounterByActor.set(parsed.actorId, parsed.counter);
        }
      }
    }
    const tail = await store.listOpsAfter(workId, snapshot?.seq ?? 0);
    for (const op of tail) room.ingestSequenced(op);
    return room;
  }

  get lastSeq(): number {
    return (this.baseSnapshot?.seq ?? 0) + this.log.length;
  }

  get foldedState(): StudioLiveOpFoldState {
    return cloneStudioLiveOpFoldState(this.state);
  }

  /** 스냅샷에 접힌 opId까지 포함한, seq 이하 전 op의 opId (seq 오름차순). */
  private opIdsThrough(seq: number): string[] {
    const ids: string[] = this.baseSnapshot ? [...this.baseSnapshot.opIds] : [];
    for (const op of this.log) {
      if (op.seq > seq) break;
      ids.push(op.opId);
    }
    return ids;
  }

  private ingestSequenced(op: SequencedStudioLiveOp): void {
    this.log.push(op);
    this.seqByOpId.set(op.opId, op.seq);
    applyStudioLiveOpToState(this.state, op);
    const counter = studioLiveOpCounter(op);
    if (counter !== null) {
      const last = this.lastCounterByActor.get(op.actorId) ?? 0;
      if (counter > last) this.lastCounterByActor.set(op.actorId, counter);
    }
  }

  /**
   * 제출 처리 전체를 방 단위 체인으로 직렬화한다. 게이트웨이의 발신자별
   * 체인과 함께, seq 부여·FIFO 판정·영속이 한 임계 구역에서 일어난다.
   */
  submit(op: StudioLiveOp, actorUserId: string): Promise<StudioLiveOpSubmitOutcome> {
    const run = this.tail.then(() => this.submitSerialized(op, actorUserId));
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async submitSerialized(
    op: StudioLiveOp,
    actorUserId: string
  ): Promise<StudioLiveOpSubmitOutcome> {
    const existingSeq = this.seqByOpId.get(op.opId);
    if (existingSeq !== undefined) {
      const existing =
        existingSeq <= (this.baseSnapshot?.seq ?? 0)
          ? null
          : this.log[existingSeq - (this.baseSnapshot?.seq ?? 0) - 1];
      if (existing) {
        return { status: "duplicate", result: { inserted: false, op: existing } };
      }
      // 스냅샷으로 접힌 op의 재제출: 본문은 로그에 없으므로 저장소가 정본이다.
      const stored = await this.store.listOpsAfter(this.workId, existingSeq - 1);
      const found = stored.find((candidate) => candidate.opId === op.opId);
      if (found) return { status: "duplicate", result: { inserted: false, op: found } };
      // 스냅샷 opIds에만 있고 본문이 없는 경우(구 스냅샷) — seq만으로 중복 ACK.
      return {
        status: "duplicate",
        result: { inserted: false, op: { ...op, seq: existingSeq } },
      };
    }

    const counter = studioLiveOpCounter(op);
    if (counter === null) {
      return { status: "fifo_rejected", rejection: { ok: false, reason: "malformed_op_id" } };
    }
    const lastCounter = this.lastCounterByActor.get(op.actorId) ?? 0;
    const expectedCounter = lastCounter + 1;
    if (counter > expectedCounter) {
      return {
        status: "fifo_rejected",
        rejection: { ok: false, reason: "gap", expectedCounter, receivedCounter: counter },
      };
    }
    if (counter < expectedCounter) {
      return {
        status: "fifo_rejected",
        rejection: {
          ok: false,
          reason: "regression",
          expectedCounter,
          receivedCounter: counter,
        },
      };
    }
    if (this.lastSeq >= STUDIO_OP_ROOM_LOG_MAX_OPS) return { status: "log_limit" };

    const appended = await this.store.appendOp(this.workId, op, actorUserId);
    if (!appended.inserted) {
      // 다른 API 노드가 먼저 영속한 경우: 그 seq를 정본으로 받아 따라잡는다.
      await this.catchUpFromStore();
      return { status: "duplicate", result: appended };
    }
    if (appended.op.seq !== this.lastSeq + 1) {
      // 다른 노드의 op가 사이에 들어갔다 — 저장소 꼬리로 상태를 맞춘 뒤 계속한다.
      await this.catchUpFromStore();
      if (!this.seqByOpId.has(appended.op.opId)) this.ingestSequenced(appended.op);
    } else {
      this.ingestSequenced(appended.op);
    }
    return { status: "accepted", result: appended };
  }

  private async catchUpFromStore(): Promise<void> {
    const missing = await this.store.listOpsAfter(this.workId, this.lastSeq);
    for (const op of missing) {
      if (!this.seqByOpId.has(op.opId)) this.ingestSequenced(op);
    }
  }

  /** 현재 확정 상태 스냅샷. 계약 요구 1의 opIds·digest를 항상 포함한다. */
  snapshot(): StudioLiveOpSnapshot {
    const opIds = this.opIdsThrough(this.lastSeq);
    return {
      seq: this.lastSeq,
      state: serializeStudioLiveOpState(this.state),
      opIds,
      opIdDigest: digestStudioLiveOpIds(opIds),
    };
  }

  /**
   * 동기화 계획: 뒤처진 정도가 snapshotDepth 이내면 누락 op만, 그 이상이면
   * 스냅샷( opId 집합 포함 )으로 답한다. 웹 코어 syncFor와 같은 규칙이다.
   */
  syncFor(fromSeq: number): { snapshot?: StudioLiveOpSnapshot; ops: SequencedStudioLiveOp[] } {
    if (fromSeq >= this.lastSeq) return { ops: [] };
    if (this.lastSeq - fromSeq <= this.snapshotDepth) {
      const base = this.baseSnapshot?.seq ?? 0;
      if (fromSeq >= base) {
        return { ops: this.log.filter((op) => op.seq > fromSeq) };
      }
      // 요청자가 기준 스냅샷보다 뒤처졌다 — 현 스냅샷이 그 구간을 포함하므로 스냅샷 경로.
    }
    return { snapshot: this.snapshot(), ops: [] };
  }

  /** 현재 스냅샷을 저장소에 기록한다 (재시작 hydrate용 기준점 전진). */
  async persistSnapshot(): Promise<StudioLiveOpSnapshot> {
    const snapshot = this.snapshot();
    await this.store.saveSnapshot(this.workId, {
      seq: snapshot.seq,
      state: snapshot.state,
      opIds: snapshot.opIds,
    });
    return snapshot;
  }

  /** 검증용: 증분 상태가 (스냅샷 + 로그) 전체 접기와 같은지. */
  verifyIncrementalState(): boolean {
    const folded = this.baseSnapshot
      ? deserializeStudioLiveOpState(this.baseSnapshot.state)
      : createStudioLiveOpFoldState();
    for (const op of this.log) applyStudioLiveOpToState(folded, op);
    return hashStudioLiveOpState(folded) === hashStudioLiveOpState(this.state);
  }
}

/**
 * 인메모리 로그 저장소 — 통합 테스트와 단일 노드 개발용.
 * seq 부여·dedupe 규칙은 Drizzle 구현(studio-live-op.repository.ts)과 동일하다.
 */
export class InMemoryStudioLiveOpLogStore implements StudioLiveOpLogStore {
  private readonly logs = new Map<string, SequencedStudioLiveOp[]>();
  private readonly snapshots = new Map<string, StudioLiveOpStoredSnapshot>();

  async appendOp(
    workId: string,
    op: StudioLiveOp,
    _actorUserId: string
  ): Promise<StudioLiveOpAppendResult> {
    const log = this.logs.get(workId) ?? [];
    this.logs.set(workId, log);
    const existing = log.find((candidate) => candidate.opId === op.opId);
    if (existing) return { inserted: false, op: existing };
    const sequenced: SequencedStudioLiveOp = { ...op, seq: log.length + 1 };
    log.push(sequenced);
    return { inserted: true, op: sequenced };
  }

  async listOpsAfter(workId: string, afterSeq: number): Promise<SequencedStudioLiveOp[]> {
    return (this.logs.get(workId) ?? []).filter((op) => op.seq > afterSeq);
  }

  async loadSnapshot(workId: string): Promise<StudioLiveOpStoredSnapshot | null> {
    return this.snapshots.get(workId) ?? null;
  }

  async saveSnapshot(workId: string, snapshot: StudioLiveOpStoredSnapshot): Promise<void> {
    const existing = this.snapshots.get(workId);
    if (existing && existing.seq >= snapshot.seq) return;
    this.snapshots.set(workId, snapshot);
  }
}

/** workId 단위 방 레지스트리. 게이트웨이가 보유하고 모듈 종료 시 비운다. */
export class StudioLiveOpRoomRegistry {
  private readonly rooms = new Map<string, Promise<StudioLiveOpRoom>>();
  private readonly store: StudioLiveOpLogStore;
  private readonly options: StudioLiveOpRoomOptions;

  constructor(store: StudioLiveOpLogStore, options: StudioLiveOpRoomOptions = {}) {
    this.store = store;
    this.options = options;
  }

  getRoom(workId: string): Promise<StudioLiveOpRoom> {
    let room = this.rooms.get(workId);
    if (!room) {
      room = StudioLiveOpRoom.open(workId, this.store, this.options);
      this.rooms.set(workId, room);
      room.catch(() => {
        if (this.rooms.get(workId) === room) this.rooms.delete(workId);
      });
    }
    return room;
  }

  clear(): void {
    this.rooms.clear();
  }

  get size(): number {
    return this.rooms.size;
  }
}
