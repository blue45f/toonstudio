import { describe, expect, it, vi } from "vitest";

import {
  CONTRACT_REVIEW_STORAGE_KEY,
  createContractReviewAnswerStore,
  parseStoredContractReviewAnswers,
  serializeContractReviewAnswers,
  type ContractReviewStorage,
} from "./contract-review-answer-store";

function createMemoryStorage(initial: Record<string, string> = {}): ContractReviewStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("저장 형식", () => {
  it("직렬화한 답을 그대로 되읽고, 알 수 없는 항목은 저장하지 않는다", () => {
    const raw = serializeContractReviewAnswers({ "delay-penalty": "present", "ghost-item": "absent" });
    expect(JSON.parse(raw)).toEqual({ version: 1, answers: { "delay-penalty": "present" } });
    expect(parseStoredContractReviewAnswers(raw)).toEqual({ "delay-penalty": "present" });
  });

  it.each([
    null,
    "",
    "not json",
    "[]",
    "7",
    JSON.stringify({ version: 2, answers: { "delay-penalty": "present" } }),
    JSON.stringify({ answers: { "delay-penalty": "present" } }),
    JSON.stringify({ version: 1, answers: "present" }),
    JSON.stringify({ version: 1, answers: { "delay-penalty": "maybe" } }),
  ])("깨졌거나 낯선 저장값 %j 은 빈 답으로 본다", (raw) => {
    expect(parseStoredContractReviewAnswers(raw)).toEqual({});
  });
});

describe("답 저장소", () => {
  it("저장된 답을 읽어 시작하고, 바꿀 때마다 저장하며 알림을 보낸다", () => {
    const storage = createMemoryStorage({
      [CONTRACT_REVIEW_STORAGE_KEY]: serializeContractReviewAnswers({ pause: "present" }),
    });
    const store = createContractReviewAnswerStore(() => storage);
    expect(store.getSnapshot()).toEqual({ answers: { pause: "present" }, persistence: "saved" });

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setAnswer("revenue-share", "absent");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().answers).toEqual({ pause: "present", "revenue-share": "absent" });
    expect(parseStoredContractReviewAnswers(storage.data.get(CONTRACT_REVIEW_STORAGE_KEY) ?? null)).toEqual({
      pause: "present",
      "revenue-share": "absent",
    });

    // 같은 답을 다시 고르거나 모르는 항목을 건드려도 알림·쓰기가 없다.
    store.setAnswer("revenue-share", "absent");
    store.setAnswer("not-an-item", "present");
    expect(listener).toHaveBeenCalledTimes(1);

    store.setAnswer("pause", null);
    expect(store.getSnapshot().answers).toEqual({ "revenue-share": "absent" });
    unsubscribe();
    store.setAnswer("termination", "unsure");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("모든 답을 지우면 저장 항목 자체를 지운다", () => {
    const storage = createMemoryStorage();
    const store = createContractReviewAnswerStore(() => storage);
    store.setAnswer("pause", "present");
    expect(storage.data.has(CONTRACT_REVIEW_STORAGE_KEY)).toBe(true);
    store.reset();
    expect(store.getSnapshot()).toEqual({ answers: {}, persistence: "saved" });
    expect(storage.data.has(CONTRACT_REVIEW_STORAGE_KEY)).toBe(false);
  });

  it("저장소가 없으면 메모리로만 동작하고 저장되지 않는다고 알린다", () => {
    const store = createContractReviewAnswerStore(() => null);
    expect(store.getSnapshot().persistence).toBe("unavailable");
    store.setAnswer("pause", "present");
    expect(store.getSnapshot()).toEqual({ answers: { pause: "present" }, persistence: "unavailable" });
  });

  it("저장소 접근이 던져도 화면을 깨뜨리지 않는다", () => {
    const store = createContractReviewAnswerStore(() => {
      throw new Error("SecurityError");
    });
    expect(store.getSnapshot()).toEqual({ answers: {}, persistence: "unavailable" });
    store.setAnswer("termination", "absent");
    expect(store.getSnapshot().answers).toEqual({ termination: "absent" });
  });

  it("읽기가 던지는 저장소도 저장 불가로 시작한다", () => {
    const store = createContractReviewAnswerStore(() => ({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    }));
    expect(store.getSnapshot().persistence).toBe("unavailable");
  });

  it("쓰기가 실패하면 답은 유지하고 failed 로 표시하며, 다시 저장하면 saved 로 돌아온다", () => {
    let failWrites = true;
    const backing = createMemoryStorage();
    const storage: ContractReviewStorage = {
      getItem: (key) => backing.getItem(key),
      removeItem: (key) => backing.removeItem(key),
      setItem: (key, value) => {
        if (failWrites) throw new DOMException("quota", "QuotaExceededError");
        backing.setItem(key, value);
      },
    };
    const store = createContractReviewAnswerStore(() => storage);
    store.setAnswer("pause", "present");
    expect(store.getSnapshot()).toEqual({ answers: { pause: "present" }, persistence: "failed" });
    expect(backing.data.size).toBe(0);

    failWrites = false;
    store.retrySave();
    expect(store.getSnapshot().persistence).toBe("saved");
    expect(parseStoredContractReviewAnswers(backing.data.get(CONTRACT_REVIEW_STORAGE_KEY) ?? null)).toEqual({ pause: "present" });
  });

  it("다른 탭의 변경을 가져오되, 저장되지 않은 변경이 있으면 덮어쓰지 않는다", () => {
    const storage = createMemoryStorage();
    const store = createContractReviewAnswerStore(() => storage);
    storage.data.set(CONTRACT_REVIEW_STORAGE_KEY, serializeContractReviewAnswers({ pause: "present" }));
    const listener = vi.fn();
    store.subscribe(listener);
    store.refresh();
    expect(store.getSnapshot().answers).toEqual({ pause: "present" });
    expect(listener).toHaveBeenCalledTimes(1);
    // 같은 내용을 다시 읽으면 알림이 없다.
    store.refresh();
    expect(listener).toHaveBeenCalledTimes(1);

    let storedByOtherTab: string | null = null;
    const failing = createContractReviewAnswerStore(() => ({
      getItem: () => storedByOtherTab,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("full");
      },
    }));
    failing.setAnswer("pause", "absent");
    expect(failing.getSnapshot().persistence).toBe("failed");
    storedByOtherTab = serializeContractReviewAnswers({ termination: "present" });
    failing.refresh();
    expect(failing.getSnapshot().answers).toEqual({ pause: "absent" });
  });

  it("읽기가 갑자기 막혀도 화면의 답은 지우지 않는다", () => {
    let blocked = false;
    const backing = createMemoryStorage({
      [CONTRACT_REVIEW_STORAGE_KEY]: serializeContractReviewAnswers({ pause: "present" }),
    });
    const store = createContractReviewAnswerStore(() => ({
      getItem: (key) => {
        if (blocked) throw new Error("blocked");
        return backing.getItem(key);
      },
      setItem: (key, value) => backing.setItem(key, value),
      removeItem: (key) => backing.removeItem(key),
    }));
    blocked = true;
    store.refresh();
    expect(store.getSnapshot()).toEqual({ answers: { pause: "present" }, persistence: "unavailable" });
  });
});
