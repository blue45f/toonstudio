/**
 * 분기형 컷툰 화면 시험 도구 — 메모리 저장소와 막힌·실패하는 저장소 대역, 번역 해소 함수. 운영 코드가 가져오지 않는다.
 */
import { translateNow } from "@/shared/lib/i18n";

import type { BranchingCuttoonGraph, BranchingEditResult } from "./model";
import type { PreferenceStorage, StorageResolver } from "@/shared/lib/browser-preferences";
import type { BranchingT } from "./use-branching-t";

export interface MemoryStore {
  readonly storage: PreferenceStorage;
  readonly resolve: StorageResolver;
  readonly data: Map<string, string>;
  /** setItem 이 불린 횟수(실패한 호출도 센다). */
  readonly writeAttempts: () => number;
  /** true 인 동안 setItem 은 용량 초과로 던진다. */
  failWrites: boolean;
}

/** 메모리에 쓰는 저장소. */
export function memoryStore(initial: Readonly<Record<string, string>> = {}): MemoryStore {
  const data = new Map<string, string>(Object.entries(initial));
  let attempts = 0;
  const store: MemoryStore = {
    failWrites: false,
    data,
    writeAttempts: () => attempts,
    storage: {
      getItem: (key: string): string | null => data.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        attempts += 1;
        if (store.failWrites) throw new DOMException("quota", "QuotaExceededError");
        data.set(key, value);
      },
    },
    resolve: () => store.storage,
  };
  return store;
}

/** 저장소 접근 자체가 막힌 환경(프라이빗 창, 차단): resolve 가 던진다. */
export const blockedStorage: StorageResolver = () => {
  throw new DOMException("denied", "SecurityError");
};

/** 저장소가 아예 없는 환경. */
export const missingStorage: StorageResolver = () => undefined;

/** 컴포넌트 밖에서 쓰는 번역 해소 함수 — 지금 설정된 언어로 바로 푼다. */
export const tNow: BranchingT = (key, fallbackOrValues, fallbackText) => translateNow(key, fallbackOrValues, fallbackText);

/** 편집이 받아들여졌을 때의 결과(그래프와 덧붙은 값)를 꺼낸다. 거절되면 시험 준비가 틀린 것이므로 던진다. */
export function accepted<T extends object>(result: BranchingEditResult<T>): { readonly graph: BranchingCuttoonGraph } & T {
  if (!result.ok) throw new Error(`편집이 거절됐어요: ${result.reason}`);
  return result;
}
