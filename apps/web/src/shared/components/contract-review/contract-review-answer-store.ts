/**
 * 계약서 검토 체크리스트 답 저장소 — 브라우저 localStorage 에만 둔다(서버로 보내지 않는다).
 *
 * 학습 화면과 제작 관리 화면이 같은 키를 읽고 쓰므로, 한쪽에서 답한 내용이 다른 쪽에도 보인다.
 * 저장소가 막힌 환경(사생활 보호 창·사이트 데이터 차단·샌드박스 iframe)에서도 화면은 메모리 상태로
 * 계속 동작하고, 저장되지 않았다는 사실만 `persistence` 로 알려 준다.
 * React 에 의존하지 않는 순수 컨트롤러라 가짜 저장소로 시험할 수 있다.
 */
import {
  normalizeContractReviewAnswers,
  setContractReviewAnswer,
  type ContractReviewAnswer,
  type ContractReviewAnswers,
} from "./contract-review-checklist";

/** 저장 형식을 바꾸면 버전을 올리고, 옛 키는 읽지 않는다(답은 항목 id 로만 저장하므로 가볍다). */
export const CONTRACT_REVIEW_STORAGE_KEY = "toonstudio:contract-review:v1";
const STORAGE_FORMAT_VERSION = 1;

export type ContractReviewStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * - `saved`: 화면의 답이 저장소와 같다.
 * - `unavailable`: 저장소를 쓸 수 없다(차단·미지원). 이 탭을 닫으면 답이 사라진다.
 * - `failed`: 저장 시도가 실패했다(용량 초과 등). 다시 시도할 수 있다.
 */
export type ContractReviewPersistence = "saved" | "unavailable" | "failed";

export interface ContractReviewAnswerSnapshot {
  readonly answers: ContractReviewAnswers;
  readonly persistence: ContractReviewPersistence;
}

const EMPTY_ANSWERS: ContractReviewAnswers = Object.freeze({});

/** 저장된 문자열에서 유효한 답만 꺼낸다. 깨진 JSON·낯선 모양·미래 버전은 빈 답으로 본다. */
export function parseStoredContractReviewAnswers(raw: string | null): ContractReviewAnswers {
  if (raw === null) return EMPTY_ANSWERS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return EMPTY_ANSWERS;
    const record = parsed as Readonly<Record<string, unknown>>;
    if (record.version !== STORAGE_FORMAT_VERSION) return EMPTY_ANSWERS;
    return normalizeContractReviewAnswers(record.answers);
  } catch {
    return EMPTY_ANSWERS;
  }
}

export function serializeContractReviewAnswers(answers: ContractReviewAnswers): string {
  return JSON.stringify({ version: STORAGE_FORMAT_VERSION, answers: normalizeContractReviewAnswers(answers) });
}

function sameAnswers(left: ContractReviewAnswers, right: ContractReviewAnswers): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

/** 브라우저 localStorage 를 안전하게 얻는다. 접근 자체가 던지는 환경(차단된 쿠키 등)에서는 null. */
export function getBrowserContractReviewStorage(): ContractReviewStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export interface ContractReviewAnswerStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => ContractReviewAnswerSnapshot;
  readonly setAnswer: (itemId: string, answer: ContractReviewAnswer | null) => void;
  /** 모든 답을 지운다. */
  readonly reset: () => void;
  /** 저장소 내용을 다시 읽는다. 저장되지 않은 변경이 있으면 화면의 답을 덮어쓰지 않는다. */
  readonly refresh: () => void;
  /** 저장에 실패했던 현재 답을 다시 저장해 본다. */
  readonly retrySave: () => void;
}

export function createContractReviewAnswerStore(
  getStorage: () => ContractReviewStorage | null = getBrowserContractReviewStorage,
): ContractReviewAnswerStore {
  const listeners = new Set<() => void>();

  function storage(): ContractReviewStorage | null {
    try {
      return getStorage();
    } catch {
      return null;
    }
  }

  function load(): ContractReviewAnswerSnapshot {
    const target = storage();
    if (!target) return { answers: EMPTY_ANSWERS, persistence: "unavailable" };
    try {
      return { answers: parseStoredContractReviewAnswers(target.getItem(CONTRACT_REVIEW_STORAGE_KEY)), persistence: "saved" };
    } catch {
      return { answers: EMPTY_ANSWERS, persistence: "unavailable" };
    }
  }

  let snapshot: ContractReviewAnswerSnapshot = load();

  function publish(next: ContractReviewAnswerSnapshot): void {
    if (next.persistence === snapshot.persistence && sameAnswers(next.answers, snapshot.answers)) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function commit(answers: ContractReviewAnswers): void {
    const target = storage();
    if (!target) {
      publish({ answers, persistence: "unavailable" });
      return;
    }
    try {
      if (Object.keys(answers).length === 0) target.removeItem(CONTRACT_REVIEW_STORAGE_KEY);
      else target.setItem(CONTRACT_REVIEW_STORAGE_KEY, serializeContractReviewAnswers(answers));
      publish({ answers, persistence: "saved" });
    } catch {
      publish({ answers, persistence: "failed" });
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    setAnswer(itemId, answer) {
      const next = setContractReviewAnswer(snapshot.answers, itemId, answer);
      if (next === snapshot.answers || sameAnswers(next, snapshot.answers)) return;
      commit(next);
    },
    reset() {
      commit(EMPTY_ANSWERS);
    },
    refresh() {
      // 저장되지 않은 변경(저장소 막힘·저장 실패)이 있는 동안에는 다른 탭의 내용으로 덮어쓰지 않는다.
      if (snapshot.persistence !== "saved") return;
      const loaded = load();
      // 읽기가 갑자기 막혀도 화면에 있는 답은 지우지 않고, 저장되지 않는 상태로만 바꾼다.
      publish(loaded.persistence === "unavailable" ? { answers: snapshot.answers, persistence: "unavailable" } : loaded);
    },
    retrySave() {
      commit(snapshot.answers);
    },
  };
}
