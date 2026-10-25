/**
 * paid-operations-gate.ts — 어드민 유료 운영 마스터 스위치 (2026-10-25).
 * Nest에 의존하지 않는 순수 모듈이다.
 *
 * 단일 진실 공급원:
 *  - 마스터 스위치명: `paidOperationsEnabled` (런타임 어드민 설정, 기본값 false).
 *  - 기존 레거시 플래그(`MEMBERSHIP_ECONOMY_POLICY.creditPurchasesEnabled`,
 *    core, false)는 마스터에 종속된다. 실효 게이트 = 마스터 값이며,
 *    마스터가 ON일 때만 경로별 기존 정책이 적용된다. 마스터 OFF면
 *    레거시 플래그가 무엇이든 유료 경로는 거부된다.
 *  - 게이트 검사는 호출마다 현재 설정값을 읽는다 (캐시 금지 — 어드민
 *    토글 변경이 재시작 없이 즉시 반영된다).
 *
 * 저장 방식 (이 단계):
 *  - 기존 어드민 설정 저장소 실측 결과, 유료 운영 스위치를 담는
 *    어드민 설정 스토어는 없었다 (상거래 런타임은 env 기반 판정).
 *    따라서 스펙의 `PaidOperationsSettingStore` seam과 테스트용
 *    메모리 스토어만 이 파일에 둔다. 임의 DB 테이블은 신설하지 않으며,
 *    영속 저장소 연결은 후속 과제이다.
 *  - 메모리 스토어는 프로세스 메모리에만 존재한다. 재시작하면
 *    미설정(false)으로 돌아가 fail-closed 된다. 어드민 변경 API는
 *    워커 B 영역이며, 같은 `PAID_OPERATIONS_SETTING_STORE` 토큰으로
 *    이 스토어 인스턴스를 주입받아 공유한다.
 *
 * 거부 오류 코드: `PAID_OPERATIONS_DISABLED` (전 유료 경로 동일 코드,
 * HTTP 403). 각 유료 모듈은 자신의 오류 클래스에 이 코드·상태를 담아
 * 던지므로 기존 Nest 예외 매핑 패턴이 그대로 동작한다.
 * 무료 경로(AI 무료 풀·BYOK·무료 save)는 이 모듈을 import하지 않으며,
 * 게이트 검사를 받지 않는다.
 */

export const PAID_OPERATIONS_DISABLED = "PAID_OPERATIONS_DISABLED" as const;

/** Nest 주입 토큰 — 어드민 설정 스토어의 공유 인스턴스를 가리킨다. */
export const PAID_OPERATIONS_SETTING_STORE = Symbol(
  "PAID_OPERATIONS_SETTING_STORE",
);

/**
 * 어드민 유료 운영 설정 스토어 seam (스펙 고정 인터페이스).
 * `getPaidOperationsEnabled`는 미설정 시 false를 반환한다.
 * `setPaidOperationsEnabled`는 어드민 전용 변경 경로에서만 호출한다.
 */
export interface PaidOperationsSettingStore {
  getPaidOperationsEnabled(): Promise<boolean>;
  setPaidOperationsEnabled(value: boolean): Promise<void>;
}

/** 게이트 판정 입력 — 스토어 미주입 시 미설정(false)으로 판정한다. */
export type PaidOperationsGateSource = PaidOperationsSettingStore | undefined;

/**
 * 테스트용 메모리 스토어. 초기값은 미설정(false)과 동일하다.
 * 영속성이 없으므로 운영 연결 전까지는 재시작 시 OFF로 초기화된다.
 */
export class InMemoryPaidOperationsSettingStore
  implements PaidOperationsSettingStore
{
  private enabled: boolean;

  constructor(initialEnabled = false) {
    this.enabled = initialEnabled;
  }

  async getPaidOperationsEnabled(): Promise<boolean> {
    return this.enabled;
  }

  async setPaidOperationsEnabled(value: boolean): Promise<void> {
    this.enabled = value;
  }
}

/**
 * 현재 마스터 스위치 값을 읽는다. 스토어가 없으면 false(미설정)이다.
 * 값을 캐시하지 않으므로 어드민 토글 직후 호출부터 새 값이 적용된다.
 */
export async function resolvePaidOperationsEnabled(
  store: PaidOperationsGateSource,
): Promise<boolean> {
  if (!store) return false;
  return store.getPaidOperationsEnabled();
}
