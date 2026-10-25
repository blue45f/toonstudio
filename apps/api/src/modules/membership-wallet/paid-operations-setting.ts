/**
 * paid-operations-setting.ts — 유료 운영 마스터 스위치의 어드민 API 측 접점.
 *
 * 정본 정의(인터페이스·메모리 스토어·주입 토큰)는 워커 A의 게이트 모듈
 * (`paid-operations-gate.ts`)에 있으며, 이 파일은 그 정본을 재노출하고
 * 어드민 변경 API가 DI 없이 구성될 때의 폴백 싱글턴만 제공한다.
 * 두 개의 스토어 정의를 두지 않는다 — 어드민 토글과 실효 게이트가 서로
 * 다른 인스턴스를 쓰면 토글 변경이 게이트에 닿지 않기 때문이다.
 *
 * Nest에서는 `PAID_OPERATIONS_SETTING_STORE` 토큰으로 주입된 모듈
 * 싱글턴이 쓰이고, 이 파일의 `paidOperationsSettingStore`는 직접 생성된
 * 서비스(단위 테스트 등)에서만 폴백으로 쓰인다. 영속 저장소 연결은
 * 스펙 명시 후속 과제이며, 이 단계에서 임의 DB 테이블을 신설하지 않는다.
 */

import {
  InMemoryPaidOperationsSettingStore,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";

export type { PaidOperationsSettingStore } from "./paid-operations-gate";
export { InMemoryPaidOperationsSettingStore } from "./paid-operations-gate";

/** 테스트용 메모리 스토어 팩토리. 초기값 미지정 시 false(미설정과 동일). */
export function createMemoryPaidOperationsSettingStore(
  initialEnabled = false,
): PaidOperationsSettingStore {
  return new InMemoryPaidOperationsSettingStore(initialEnabled);
}

/**
 * DI 없는 구성용 폴백 싱글턴. Nest 경로에서는 모듈이 바인딩한 토큰
 * 인스턴스가 우선하므로, 운영에서는 이 인스턴스가 게이트와 따로 놀지
 * 않는다.
 */
export const paidOperationsSettingStore: PaidOperationsSettingStore =
  createMemoryPaidOperationsSettingStore(false);
