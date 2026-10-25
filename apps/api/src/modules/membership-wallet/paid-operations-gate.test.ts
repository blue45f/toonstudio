/**
 * paid-operations-gate.test.ts — 어드민 유료 운영 마스터 스위치 단위 테스트.
 * Nest에 의존하지 않는 순수 모듈이라 bun 스텁 검증도 가능하다.
 * 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 미설정 기본값 false, 스토어 미주입 시 false, 토글 변경이
 * 호출마다 즉시 반영(캐시 없음), ON→OFF→ON 연속 변경, 거부 코드 상수.
 */
import { describe, expect, it } from "vitest";

import {
  InMemoryPaidOperationsSettingStore,
  PAID_OPERATIONS_DISABLED,
  PAID_OPERATIONS_SETTING_STORE,
  resolvePaidOperationsEnabled,
} from "./paid-operations-gate";

describe("paid-operations-gate 마스터 스위치", () => {
  it("거부 오류 코드는 PAID_OPERATIONS_DISABLED이다", () => {
    expect(PAID_OPERATIONS_DISABLED).toBe("PAID_OPERATIONS_DISABLED");
  });

  it("Nest 주입 토큰이 심볼로 존재한다", () => {
    expect(typeof PAID_OPERATIONS_SETTING_STORE).toBe("symbol");
  });

  it("메모리 스토어 기본값은 false(미설정)이다", async () => {
    const store = new InMemoryPaidOperationsSettingStore();
    expect(await store.getPaidOperationsEnabled()).toBe(false);
  });

  it("스토어 미주입 시 판정은 false이다 (fail-closed)", async () => {
    expect(await resolvePaidOperationsEnabled(undefined)).toBe(false);
  });

  it("set 변경이 다음 호출부터 즉시 반영된다 (캐시 없음)", async () => {
    const store = new InMemoryPaidOperationsSettingStore();
    expect(await resolvePaidOperationsEnabled(store)).toBe(false);
    await store.setPaidOperationsEnabled(true);
    expect(await resolvePaidOperationsEnabled(store)).toBe(true);
    await store.setPaidOperationsEnabled(false);
    expect(await resolvePaidOperationsEnabled(store)).toBe(false);
  });

  it("ON→OFF→ON 연속 변경이 호출마다 즉시 반영된다", async () => {
    const store = new InMemoryPaidOperationsSettingStore(true);
    const reads: boolean[] = [];
    reads.push(await resolvePaidOperationsEnabled(store));
    await store.setPaidOperationsEnabled(false);
    reads.push(await resolvePaidOperationsEnabled(store));
    await store.setPaidOperationsEnabled(true);
    reads.push(await resolvePaidOperationsEnabled(store));
    expect(reads).toEqual([true, false, true]);
  });

  it("초기값 true로 만든 스토어는 ON에서 시작한다", async () => {
    const store = new InMemoryPaidOperationsSettingStore(true);
    expect(await resolvePaidOperationsEnabled(store)).toBe(true);
  });
});
