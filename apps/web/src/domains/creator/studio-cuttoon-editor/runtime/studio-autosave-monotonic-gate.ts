/**
 * 다중 컷 빠른 이동·편집 시 비동기 자동저장(OPFS 저널 / SQLite 워커) 완료 역전 차단 게이트.
 *
 * 배경: 사용자가 1컷 → 2컷 → 3컷을 빠르게 넘나들며 획을 그릴 때, 2컷 시점에 발행된 느린
 * 비동기 저장이 3컷 시점에 발행된 빠른 저장보다 늦게 완료되면 과거 스냅샷 시각·지문이 최신
 * 내구 세대와 저장 영수증을 역전 덮어쓸 수 있다. 문서 스코프(`autosaveKey`)별로 단조 증가하는
 * `snapshotSeq`를 발급해 구버전 디스패치와 구버전 영수증 반영을 모두 차단한다.
 */

const SUPERSEDED_MESSAGE = "Studio autosave snapshot superseded by newer cut edit";

export function createStudioAutosaveSupersededError(): DOMException {
  return new DOMException(SUPERSEDED_MESSAGE, "AbortError");
}

export function isStudioAutosaveSupersededFailure(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  if (
    (cause as { name?: unknown }).name === "AbortError"
    && (cause as { message?: unknown }).message === SUPERSEDED_MESSAGE
  ) {
    return true;
  }
  if (cause instanceof AggregateError && cause.errors.length > 0) {
    return cause.errors.every((entry) => isStudioAutosaveSupersededFailure(entry));
  }
  return false;
}

export interface StudioAutosaveMonotonicGate {
  reset(key: string): void;
  issueSnapshotSeq(key: string): number;
  isLatestIssued(key: string, seq: number): boolean;
  admitOpfsDispatch(key: string, seq: number): boolean;
  admitSqliteDispatch(key: string, seq: number): boolean;
  admitDurableReceipt(key: string, seq: number): boolean;
}

export function createStudioAutosaveMonotonicGate(): StudioAutosaveMonotonicGate {
  let activeKey = "";
  let issuedSeq = 0;
  let dispatchedOpfsSeq = 0;
  let dispatchedSqliteSeq = 0;
  let durableSeq = 0;

  const ensureKey = (key: string): void => {
    if (key === activeKey) return;
    activeKey = key;
    issuedSeq = 0;
    dispatchedOpfsSeq = 0;
    dispatchedSqliteSeq = 0;
    durableSeq = 0;
  };

  return {
    reset(key) {
      activeKey = key;
      issuedSeq = 0;
      dispatchedOpfsSeq = 0;
      dispatchedSqliteSeq = 0;
      durableSeq = 0;
    },
    issueSnapshotSeq(key) {
      ensureKey(key);
      issuedSeq += 1;
      return issuedSeq;
    },
    isLatestIssued(key, seq) {
      return key === activeKey && seq >= issuedSeq;
    },
    admitOpfsDispatch(key, seq) {
      if (key !== activeKey || seq < issuedSeq || seq <= dispatchedOpfsSeq) return false;
      dispatchedOpfsSeq = seq;
      return true;
    },
    admitSqliteDispatch(key, seq) {
      if (key !== activeKey || seq < issuedSeq || seq <= dispatchedSqliteSeq) return false;
      dispatchedSqliteSeq = seq;
      return true;
    },
    admitDurableReceipt(key, seq) {
      if (key !== activeKey || seq <= durableSeq) return false;
      durableSeq = seq;
      return true;
    },
  };
}

export function composeStudioEmergencyPendingFingerprint(input: {
  readonly durablePendingBatch: {
    readonly pageId: string;
    readonly strokes: readonly { readonly id: string }[];
  } | null;
  readonly masterStrokeId: string | null;
  readonly activePendingFingerprint: string;
}): string {
  const pagePart = input.durablePendingBatch?.strokes.length
    ? `${input.durablePendingBatch.pageId}:${input.durablePendingBatch.strokes.map((stroke) => stroke.id).join(",")}`
    : "";
  const masterPart = input.masterStrokeId ? `master:${input.masterStrokeId}` : "";
  return [pagePart, masterPart, input.activePendingFingerprint].filter(Boolean).join("|");
}
