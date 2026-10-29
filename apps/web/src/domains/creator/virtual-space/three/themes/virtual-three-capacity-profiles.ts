import type { VirtualThreeRendererCapacityPolicy } from "./virtual-three-renderer-inventory";

export interface VirtualThreeRendererCapacityProfile {
  readonly id: "desktop-high-quality-v1";
  readonly validation: "candidate";
  readonly policy: VirtualThreeRendererCapacityPolicy;
}

/**
 * 전체 CPU·GPU 논리 자원과 예약을 합산하는 고정 desktop 품질 후보 예산이다.
 * 4K·MSAA4 기존 장면의 약 1.63GiB 관측을 수용하되 기기 RAM/VRAM 보장은 하지 않는다.
 * 전체 전환·정리·재진입 검증 전에는 지원 완료로 승격하지 않는다. 자동 증액하지 않는다.
 */
export const VIRTUAL_THREE_DESKTOP_HIGH_QUALITY_CAPACITY_PROFILE: VirtualThreeRendererCapacityProfile = Object.freeze({
  id: "desktop-high-quality-v1",
  validation: "candidate",
  policy: Object.freeze({
    maxAccountedBytes: 2 * 1024 * 1024 * 1024,
    jsWasmAndDriverReservationBytes: 128 * 1024 * 1024,
  }),
});
