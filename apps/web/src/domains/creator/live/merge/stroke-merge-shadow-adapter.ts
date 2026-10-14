/**
 * 실시간 동시 드로잉 병합 엔진 — 섀도우 어댑터 (HOST_INSERTION_SPEC 1·3의 1단계).
 *
 * 역할: 프로덕션 권위인 Yjs CRDT 문서(`StudioCrdtDocument`)의 변경 요약을 구독해
 * 확정(finalized) 스트로크 변경을 병합 코어 op로 변환·병행 실행하고, 매 변경마다
 * 섀도우 상태 해시를 CRDT 문서 투영 해시와 대조한다. 불일치는 로그만 남긴다 —
 * 프로덕션 동작에는 어떤 영향도 주지 않으며, 어댑터 내부 예외도 표면을 깨지 않는다.
 *
 * 변환 경계 (명세 1):
 * - 그리는 중(drawing) 샘플 append는 op로 만들지 않는다. 스트로크 원자성은 확정 단위다.
 * - 생성 → add (z-order는 변경 스냅샷의 배열 순서 = orderIndex 순을 따른다),
 *   삭제 → remove, 복원 → restore, 시각 속성만 바뀐 변형 → setProps.
 * - 기하(points/pressures)·종류·레이어 이동·재정렬처럼 코어 op로 표현할 수 없는 변형은
 *   "모델링 불가(unmodeled)"로 기록한다. 해시 대조가 이를 숨기지 않고 드러낸다.
 *
 * 해시 도메인: 양쪽 모두 "병합 관련 부분집합"으로 투영해 비교한다
 * (stroke-merge-types의 StrokeDrawPayload — points/pressures + 시각 속성).
 * fill·gradient·브러시 동역학 등 투영 밖 필드의 변경은 이 단계의 대조 대상이 아니다.
 * actor는 어댑터 단일 actor로 정규화한다 (createdBy를 해시에 포함하는 코어 규약 때문).
 */

import {
  applyOpToState,
  computePropsInverse,
  createMergeState,
  hashMergeState,
  type MergeState,
} from "./stroke-merge-core";
import {
  layerOrderKey,
  STROKE_PROP_KEYS,
  type StrokeDrawPayload,
  type StrokeOp,
  type StrokePropsPatch,
} from "./stroke-merge-types";
import type {
  StudioCrdtChange,
  StudioCrdtDrawStrokePayload,
  StudioCrdtStrokeRecord,
} from "../studio-crdt-document-types";

/** 어댑터가 요구하는 문서 표면. `StudioCrdtDocument`가 구조적으로 만족한다. */
export interface StrokeMergeShadowDocument {
  getStrokes(query: { includeDeleted: boolean }): StudioCrdtStrokeRecord[];
  subscribeChanges(
    handler: (change: StudioCrdtChange) => void,
  ): () => void;
}

export type StrokeMergeShadowMismatchReason = "hash-diverged" | "unmodeled-change";

export interface StrokeMergeShadowMismatch {
  surface: string;
  reason: StrokeMergeShadowMismatchReason;
  /** unmodeled-change일 때 해당 스트로크. 순수 해시 발산이면 undefined. */
  strokeId?: string;
  /** unmodeled 종류: geometry-change | layer-move | z-order-diverged | hard-delete | unfinalize-cycle */
  detail: string;
  shadowHash: string;
  documentHash: string;
  changeIndex: number;
}

export interface StrokeMergeShadowStats {
  changes: number;
  opsApplied: number;
  mismatches: number;
  unmodeled: number;
  lastShadowHash: string;
  lastDocumentHash: string;
}

export interface StrokeMergeShadowOptions {
  /** 로그 태그용 표면 식별자 (예: "studio-live-provider"). */
  surface: string;
  /** 섀도우 op의 actor. 기본 "shadow". createdBy 정규화에도 같은 값을 쓴다. */
  actorId?: string;
  /** 불일치 로그 싱크. 기본은 console.warn. 테스트·수집 파이프라인이 교체한다. */
  logger?: (entry: StrokeMergeShadowMismatch) => void;
}

export interface StrokeMergeShadowHandle {
  stop(): void;
  stats(): StrokeMergeShadowStats;
}

/**
 * CRDT 그리기 페이로드를 병합 코어의 부분집합 페이로드로 투영한다.
 * 해시 대조의 양쪽(섀도우 fold 결과와 문서 투영)이 이 함수를 공유하므로
 * 투영 규칙이 바뀌어도 대조 자체는 깨지지 않는다.
 */
export function projectCrdtStrokePayload(
  payload: StudioCrdtDrawStrokePayload,
): StrokeDrawPayload {
  const projected: StrokeDrawPayload = {
    // 코어 모델은 v1 부분집합이다. 버전 차이는 양쪽 투영에 동일 적용되므로 대조에 영향이 없다.
    version: 1,
    type: "draw",
    kind: payload.kind,
    mode: payload.mode,
    stroke: payload.stroke,
    strokeWidth: payload.strokeWidth,
    points: [...payload.points],
  };
  if (payload.opacity !== undefined) projected.opacity = payload.opacity;
  if (payload.blendMode !== undefined) projected.blendMode = payload.blendMode;
  if (payload.pressures !== undefined) projected.pressures = [...payload.pressures];
  return projected;
}

/**
 * CRDT 레코드 목록 전체를 코어 상태로 투영한다 (문서 해시의 입력).
 * 확정 스트로크만 포함하고, 삭제된 확정분은 tombstone으로 남긴다 — 코어 fold와 같은 규약.
 * 배열 순서가 곧 레이어 내 z-order다 (`getStrokes`가 orderIndex로 정렬해 돌려준다).
 */
export function projectCrdtStrokesToMergeState(
  records: readonly StudioCrdtStrokeRecord[],
  actorId: string,
): MergeState {
  const state = createMergeState();
  for (const record of records) {
    if (record.status !== "finalized") continue;
    state.strokes.set(record.id, {
      id: record.id,
      pageId: record.pageId,
      layerId: record.layerId,
      payload: projectCrdtStrokePayload(record.payload),
      deleted: record.deleted,
      placeholder: false,
      createdBy: actorId,
    });
    const key = layerOrderKey(record.pageId, record.layerId);
    const list = state.order.get(key) ?? [];
    list.push(record.id);
    state.order.set(key, list);
  }
  return state;
}

function numberArraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

interface UnmodeledEntry {
  strokeId: string;
  detail: string;
}

/**
 * 변경 1건을 받아 op 변환·fold·해시 대조까지 수행하는 상태 기계.
 * 구독 배선과 분리해 두어 문서 없이 단위 테스트할 수 있다.
 */
export class StrokeMergeShadowAdapter {
  private readonly surface: string;
  private readonly actorId: string;
  private readonly logger: (entry: StrokeMergeShadowMismatch) => void;

  private shadowState: MergeState = createMergeState();
  /** 직전 변경까지의 레코드 스냅샷 (id → 복제본). diff의 기준선. */
  private prevRecords = new Map<string, StudioCrdtStrokeRecord>();
  /** add op를 이미 내보낸(코어에 실재하는) 스트로크 id. */
  private shadowKnown = new Set<string>();
  private opCounter = 0;
  private changeIndex = 0;
  private opsApplied = 0;
  private mismatchCount = 0;
  private unmodeledCount = 0;
  private lastShadowHash = hashMergeState(this.shadowState);
  private lastDocumentHash = this.lastShadowHash;
  /** 같은 서명의 불일치를 매 변경 반복 기록하지 않기 위한 마지막 로그 서명. */
  private lastLoggedSignature = "";

  constructor(options: StrokeMergeShadowOptions) {
    this.surface = options.surface;
    this.actorId = options.actorId ?? "shadow";
    this.logger =
      options.logger ??
      ((entry) => {
        // 섀도우는 진단 전용이다. 기본 싱크는 콘솔 경고 한 줄.
        console.warn("[stroke-merge-shadow]", JSON.stringify(entry));
      });
  }

  /** 시작 시점의 기존 문서를 기준선으로 심는다. 이미 확정된 스트로크는 add로 접는다. */
  seed(records: readonly StudioCrdtStrokeRecord[]): void {
    const seedChange: Pick<StudioCrdtChange, "changedStrokeIds" | "strokes"> = {
      changedStrokeIds: new Set(records.map((record) => record.id)),
      strokes: [...records],
    };
    this.ingest(seedChange);
  }

  ingest(change: Pick<StudioCrdtChange, "changedStrokeIds" | "strokes">): void {
    this.changeIndex += 1;
    const unmodeled: UnmodeledEntry[] = [];
    const currentById = new Map<string, StudioCrdtStrokeRecord>();
    for (const record of change.strokes) currentById.set(record.id, record);

    // z-order를 보존하기 위해 변경 스냅샷 배열 순으로 처리하고,
    // 스냅샷에서 사라진(하드 삭제) id는 뒤에 붙인다.
    const orderedChangedIds: string[] = [];
    const seen = new Set<string>();
    for (const record of change.strokes) {
      if (change.changedStrokeIds.has(record.id) && !seen.has(record.id)) {
        seen.add(record.id);
        orderedChangedIds.push(record.id);
      }
    }
    for (const id of change.changedStrokeIds) {
      if (!seen.has(id)) orderedChangedIds.push(id);
    }

    for (const id of orderedChangedIds) {
      const prev = this.prevRecords.get(id);
      const current = currentById.get(id);
      if (!current) {
        // 하드 삭제: CRDT는 tombstone이 정본이라 정상 경로에서는 오지 않는다.
        if (this.shadowKnown.has(id)) {
          this.emit({ kind: "remove", strokeId: id });
          unmodeled.push({ strokeId: id, detail: "hard-delete" });
        }
        this.prevRecords.delete(id);
        continue;
      }
      this.convertRecord(id, prev, current, change.strokes, unmodeled);
      this.prevRecords.set(id, {
        ...current,
        payload: projectRecordPayloadClone(current),
      });
    }

    // 재정렬 단독 변경은 레코드 diff로 잡히지 않으므로 순서 자체를 대조한다.
    this.checkZOrder(change.strokes, unmodeled);

    const documentState = projectCrdtStrokesToMergeState(change.strokes, this.actorId);
    this.lastDocumentHash = hashMergeState(documentState);
    this.lastShadowHash = hashMergeState(this.shadowState);

    if (unmodeled.length > 0) {
      this.unmodeledCount += unmodeled.length;
      for (const entry of unmodeled) {
        this.report({
          surface: this.surface,
          reason: "unmodeled-change",
          strokeId: entry.strokeId,
          detail: entry.detail,
          shadowHash: this.lastShadowHash,
          documentHash: this.lastDocumentHash,
          changeIndex: this.changeIndex,
        });
      }
    } else if (this.lastShadowHash !== this.lastDocumentHash) {
      this.report({
        surface: this.surface,
        reason: "hash-diverged",
        detail: "op 변환으로 설명되지 않는 해시 발산",
        shadowHash: this.lastShadowHash,
        documentHash: this.lastDocumentHash,
        changeIndex: this.changeIndex,
      });
    }
  }

  stats(): StrokeMergeShadowStats {
    return {
      changes: this.changeIndex,
      opsApplied: this.opsApplied,
      mismatches: this.mismatchCount,
      unmodeled: this.unmodeledCount,
      lastShadowHash: this.lastShadowHash,
      lastDocumentHash: this.lastDocumentHash,
    };
  }

  /** 현재 섀도우 상태 해시 (검증·테스트용). */
  shadowHash(): string {
    return hashMergeState(this.shadowState);
  }

  private convertRecord(
    id: string,
    prev: StudioCrdtStrokeRecord | undefined,
    current: StudioCrdtStrokeRecord,
    snapshot: readonly StudioCrdtStrokeRecord[],
    unmodeled: UnmodeledEntry[],
  ): void {
    if (current.status !== "finalized") {
      // 확정 해제(재편집 진입)는 코어에 대응 op가 없다. 코어에서는 보이지 않는
      // 상태로 내리는 remove가 투영(확정분만 포함)과 가장 가깝다.
      if (prev?.status === "finalized" && this.shadowKnown.has(id)) {
        this.emit({ kind: "remove", strokeId: id });
        unmodeled.push({ strokeId: id, detail: "unfinalize-cycle" });
      }
      return;
    }

    if (!this.shadowKnown.has(id)) {
      const beforeStrokeId = this.nextKnownSiblingId(current, snapshot);
      this.emit({
        kind: "add",
        stroke: {
          id: current.id,
          pageId: current.pageId,
          layerId: current.layerId,
          payload: projectCrdtStrokePayload(current.payload),
        },
        beforeStrokeId,
      });
      this.shadowKnown.add(id);
      if (current.deleted) this.emit({ kind: "remove", strokeId: id });
      return;
    }

    // 전이 판정의 기준은 직전 레코드가 아니라 섀도우의 실제 상태다.
    // 확정 해제→재확정처럼 레코드만으로는 이어지지 않는 경로에서도 어긋나지 않는다.
    const shadowStroke = this.shadowState.strokes.get(id);
    if (!shadowStroke || shadowStroke.placeholder) return;

    if (prev && (prev.pageId !== current.pageId || prev.layerId !== current.layerId)) {
      unmodeled.push({ strokeId: id, detail: "layer-move" });
    }

    if (shadowStroke.deleted !== current.deleted) {
      this.emit(
        current.deleted
          ? { kind: "remove", strokeId: id }
          : { kind: "restore", strokeId: id },
      );
    }

    if (!current.deleted) {
      this.convertPayloadDiff(id, shadowStroke.payload, current, unmodeled);
    }
  }

  private convertPayloadDiff(
    id: string,
    prevPayload: StrokeDrawPayload,
    current: StudioCrdtStrokeRecord,
    unmodeled: UnmodeledEntry[],
  ): void {
    const nextPayload = projectCrdtStrokePayload(current.payload);

    const geometryChanged =
      prevPayload.kind !== nextPayload.kind ||
      prevPayload.mode !== nextPayload.mode ||
      !numberArraysEqual(prevPayload.points, nextPayload.points) ||
      !numberArraysEqual(prevPayload.pressures ?? [], nextPayload.pressures ?? []);
    if (geometryChanged) {
      // 코어에서 기하는 add 시점 불변 본문이다. 다시 그은 것으로 취급할 op가 없다.
      unmodeled.push({ strokeId: id, detail: "geometry-change" });
      return;
    }

    const patch: StrokePropsPatch = { set: {}, unset: [] };
    for (const key of STROKE_PROP_KEYS) {
      const before = prevPayload[key];
      const after = nextPayload[key];
      if (before === after) continue;
      if (after === undefined) patch.unset.push(key);
      else patch.set[key] = after;
    }
    if (patch.unset.length === 0 && Object.keys(patch.set).length === 0) return;
    this.emit({
      kind: "setProps",
      strokeId: id,
      patch,
      prev: computePropsInverse(prevPayload, patch),
    });
  }

  /** 같은 레이어에서 current 뒤에 오는, 이미 코어에 있는 다음 형제 id (add 삽입 기준). */
  private nextKnownSiblingId(
    current: StudioCrdtStrokeRecord,
    snapshot: readonly StudioCrdtStrokeRecord[],
  ): string | null {
    let pastCurrent = false;
    for (const record of snapshot) {
      if (record.id === current.id) {
        pastCurrent = true;
        continue;
      }
      if (!pastCurrent) continue;
      if (record.pageId !== current.pageId || record.layerId !== current.layerId) continue;
      if (record.status !== "finalized") continue;
      if (this.shadowKnown.has(record.id)) return record.id;
    }
    return null;
  }

  private checkZOrder(
    snapshot: readonly StudioCrdtStrokeRecord[],
    unmodeled: UnmodeledEntry[],
  ): void {
    const projected = projectCrdtStrokesToMergeState(snapshot, this.actorId);
    const keys = new Set([...projected.order.keys(), ...this.shadowState.order.keys()]);
    for (const key of keys) {
      const projectedOrder = projected.order.get(key) ?? [];
      const shadowOrder = this.shadowState.order.get(key) ?? [];
      const same =
        projectedOrder.length === shadowOrder.length &&
        projectedOrder.every((strokeId, index) => strokeId === shadowOrder[index]);
      if (!same) {
        unmodeled.push({ strokeId: projectedOrder[0] ?? "", detail: "z-order-diverged" });
        return; // 변경당 1건이면 충분하다. 상세는 해시 쌍이 들고 있다.
      }
    }
  }

  private emit(body: StrokeOp["body"]): void {
    this.opCounter += 1;
    const op: StrokeOp = {
      opId: `${this.actorId}:${this.opCounter}`,
      actorId: this.actorId,
      lamport: this.opCounter,
      baseSeq: 0, // 섀도우는 권위 seq를 받지 않는다. 로컬 fold 전용.
      body,
    };
    applyOpToState(this.shadowState, op);
    this.opsApplied += 1;
  }

  private report(entry: StrokeMergeShadowMismatch): void {
    this.mismatchCount += 1;
    const signature = `${entry.reason}|${entry.strokeId ?? ""}|${entry.detail}|${entry.shadowHash}|${entry.documentHash}`;
    if (signature === this.lastLoggedSignature) return;
    this.lastLoggedSignature = signature;
    this.logger(entry);
  }
}

function projectRecordPayloadClone(
  record: StudioCrdtStrokeRecord,
): StudioCrdtDrawStrokePayload {
  // 기준선은 이후 원본 레코드 변형에 흔들리지 않게 깊은 복사로 들고 있는다.
  return JSON.parse(JSON.stringify(record.payload)) as StudioCrdtDrawStrokePayload;
}

/**
 * 드로잉 표면 1곳에 섀도우를 붙이는 진입점 (명세 3의 1단계 활성화).
 * 구독 해제 외에 표면이 알아야 할 것은 없다. 어떤 예외도 표면으로 전파하지 않는다.
 */
export function startStrokeMergeShadow(
  document: StrokeMergeShadowDocument,
  options: StrokeMergeShadowOptions,
): StrokeMergeShadowHandle {
  const adapter = new StrokeMergeShadowAdapter(options);
  let stopped = false;
  try {
    adapter.seed(document.getStrokes({ includeDeleted: true }));
  } catch {
    // 시드 실패는 섀도우만의 문제다. 구독은 계속 시도한다.
  }
  const unsubscribe = document.subscribeChanges((change) => {
    if (stopped) return;
    try {
      adapter.ingest(change);
    } catch {
      // 진단 전용 경로: 예외를 삼키고 다음 변경에서 다시 대조한다.
    }
  });
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
    },
    stats: () => adapter.stats(),
  };
}
