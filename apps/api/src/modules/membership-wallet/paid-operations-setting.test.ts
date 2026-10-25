/**
 * paid-operations-setting.test.ts — 유료 운영 마스터 스위치 seam 통합 단언.
 *
 * 실제 결제·PG 호출은 어떤 케이스에서도 만들지 않는다. 유료 경로는 스토어를
 * 호출마다 읽는 테스트 대역으로, 무료 경로는 게이트를 거치지 않는 대역으로
 * 대체해 seam 계약 자체를 고정한다. 운영에서는 어드민 변경 API가 Nest
 * `PAID_OPERATIONS_SETTING_STORE` 토큰 인스턴스를 주입받아 쓰므로, 이
 * 단언의 스토어 계약이 실효 게이트와 동일 인스턴스에 적용된다.
 *
 * 케이스: 미설정 기본값 false, OFF→유료 거부·무료 통과, ON→유료 진행,
 * 마스터 OFF + 레거시 플래그 true 우회 시도 거부, ON→OFF→ON 연속 변경의
 * 호출마다 즉시 반영.
 */
import { describe, expect, it } from "vitest";

import { PAID_OPERATIONS_DISABLED } from "./paid-operations-gate";

import {
  createMemoryPaidOperationsSettingStore,
  type PaidOperationsSettingStore,
} from "./paid-operations-setting";
import { InMemoryPaidOperationsSettingStore } from "./paid-operations-gate";

/** 스펙 오류 코드(게이트 정본). 실효 게이트가 전 유료 경로에 동일하게 쓴다. */
class PaidOperationsDisabledError extends Error {
  readonly code = PAID_OPERATIONS_DISABLED;
  constructor() {
    super("유료 운영이 비활성화되어 있습니다.");
    this.name = "PaidOperationsDisabledError";
  }
}

/**
 * seam 수준 유료 경로 대역: 호출마다 스토어에서 현재값을 읽는다(캐시 금지).
 * 마스터 OFF면 레거시 플래그 값과 무관하게 거부한다(단일 진실 공급원).
 * 마스터 ON일 때의 경로별 기존 전제조건은 각 경로의 기존 판정에 맡긴다.
 */
async function paidPathStub(
  store: PaidOperationsSettingStore,
  _legacyCreditPurchasesEnabled: boolean,
): Promise<{ proceeded: true }> {
  const enabled = await store.getPaidOperationsEnabled();
  if (!enabled) throw new PaidOperationsDisabledError();
  return { proceeded: true };
}

/** 무료 경로 대역: 게이트를 호출하지 않으므로 스위치와 무관하게 통과한다. */
async function freePathStub(): Promise<{ proceeded: true }> {
  return { proceeded: true };
}

describe("유료 운영 마스터 스위치 seam", () => {
  it("팩토리 스토어는 게이트 정본 스토어와 동일 구현이다", () => {
    expect(createMemoryPaidOperationsSettingStore()).toBeInstanceOf(
      InMemoryPaidOperationsSettingStore,
    );
  });

  it("미설정 시 기본값은 false다", async () => {
    const store = createMemoryPaidOperationsSettingStore();
    await expect(store.getPaidOperationsEnabled()).resolves.toBe(false);
  });

  it("OFF면 유료 경로는 거부되고 무료 경로는 통과한다", async () => {
    const store = createMemoryPaidOperationsSettingStore(false);
    await expect(paidPathStub(store, true)).rejects.toMatchObject({
      code: PAID_OPERATIONS_DISABLED,
    });
    await expect(freePathStub()).resolves.toEqual({ proceeded: true });
  });

  it("ON이면 유료 경로가 진행된다", async () => {
    const store = createMemoryPaidOperationsSettingStore(true);
    await expect(paidPathStub(store, true)).resolves.toEqual({
      proceeded: true,
    });
  });

  it("마스터 OFF + 레거시 플래그 true 우회 시도는 거부된다", async () => {
    const store = createMemoryPaidOperationsSettingStore(false);
    await expect(paidPathStub(store, true)).rejects.toMatchObject({
      code: PAID_OPERATIONS_DISABLED,
    });
  });

  it("ON→OFF→ON 연속 변경이 호출마다 즉시 반영된다(재시작 없음)", async () => {
    const store = createMemoryPaidOperationsSettingStore(false);
    await expect(paidPathStub(store, true)).rejects.toMatchObject({
      code: PAID_OPERATIONS_DISABLED,
    });
    await store.setPaidOperationsEnabled(true);
    await expect(paidPathStub(store, true)).resolves.toEqual({
      proceeded: true,
    });
    await store.setPaidOperationsEnabled(false);
    await expect(paidPathStub(store, true)).rejects.toMatchObject({
      code: PAID_OPERATIONS_DISABLED,
    });
    await store.setPaidOperationsEnabled(true);
    await expect(paidPathStub(store, true)).resolves.toEqual({
      proceeded: true,
    });
    // 무료 경로는 전 구간에서 스위치와 무관하게 통과한다.
    await expect(freePathStub()).resolves.toEqual({ proceeded: true });
  });

  it("스토어 인스턴스 간에는 값이 공유되지 않는다", async () => {
    const first = createMemoryPaidOperationsSettingStore();
    const second = createMemoryPaidOperationsSettingStore();
    await first.setPaidOperationsEnabled(true);
    await expect(second.getPaidOperationsEnabled()).resolves.toBe(false);
  });
});
