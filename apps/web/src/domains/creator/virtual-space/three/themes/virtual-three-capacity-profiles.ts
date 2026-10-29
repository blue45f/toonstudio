import type { VirtualThreeRendererCapacityPolicy } from "./virtual-three-renderer-inventory";

export interface VirtualThreeRendererCapacityProfile {
  readonly id: "desktop-high-quality-v1";
  readonly validation: "candidate";
  readonly policy: VirtualThreeRendererCapacityPolicy;
}

/**
 * 전체 CPU·GPU 논리 자원과 예약을 합산하는 고정 desktop 품질 후보 예산이다.
 * 4K·MSAA4 정원→판타지의 2,193,406,642B 관측과 보수 모델 계획치를 수용하는 후보이다.
 * 기기 RAM/VRAM 보장은 하지 않으며 실제 전체 전환 검증 전에는 캘리브레이션 완료가 아니다.
 * 전체 전환·정리·재진입 검증 전에는 지원 완료로 승격하지 않는다. 자동 증액하지 않는다.
 */
export const VIRTUAL_THREE_DESKTOP_HIGH_QUALITY_CAPACITY_PROFILE: VirtualThreeRendererCapacityProfile = Object.freeze({
  id: "desktop-high-quality-v1",
  validation: "candidate",
  policy: Object.freeze({
    maxAccountedBytes: 3 * 1024 * 1024 * 1024,
    jsWasmAndDriverReservationBytes: 128 * 1024 * 1024,
  }),
});
