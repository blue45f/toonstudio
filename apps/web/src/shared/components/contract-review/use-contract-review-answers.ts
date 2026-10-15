import { useEffect, useState, useSyncExternalStore } from "react";

import type { ContractReviewAnswer, ContractReviewAnswers } from "@toonstudio/core/contract-review-checklist";

import {
  CONTRACT_REVIEW_STORAGE_KEY,
  createContractReviewAnswerStore,
  type ContractReviewPersistence,
} from "./contract-review-answer-store";

export interface ContractReviewAnswersController {
  readonly answers: ContractReviewAnswers;
  readonly persistence: ContractReviewPersistence;
  readonly setAnswer: (itemId: string, answer: ContractReviewAnswer | null) => void;
  readonly reset: () => void;
  readonly retrySave: () => void;
}

/**
 * 체크리스트 답을 이 브라우저에만 저장하고 다른 탭의 변경을 따라간다.
 * 서버 렌더링 스냅샷도 같은 값을 쓴다 — 저장소는 마운트 시점에 한 번 더 읽어 맞춘다.
 */
export function useContractReviewAnswers(): ContractReviewAnswersController {
  const [store] = useState(() => createContractReviewAnswerStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.refresh();
    const onStorage = (event: StorageEvent) => {
      // key 가 null 이면 저장소 전체가 비워진 것이다(clear).
      if (event.key === null || event.key === CONTRACT_REVIEW_STORAGE_KEY) store.refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store]);

  return {
    answers: snapshot.answers,
    persistence: snapshot.persistence,
    setAnswer: store.setAnswer,
    reset: store.reset,
    retrySave: store.retrySave,
  };
}
