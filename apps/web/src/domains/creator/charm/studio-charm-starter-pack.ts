/**
 * 기본 스타터 팩 — 참 바를 처음 열었을 때 바로 쓸 수 있도록 미리 담아 두는 참 목록.
 *
 * 전부 이미 저장소에 있는 소재/효과를 가리키는 참조다. 새 소재를 만들거나 외부 소재를 들이지 않으며,
 * 권리 정보는 원본 카탈로그 항목이 그대로 가진다. `studio-charm-starter-pack.test.ts` 가 모든 참조가
 * 실제 카탈로그에서 해석되는지, 그리고 끌어다 놓기가 가능한지를 지킨다.
 *
 * "손 모양": 저장소의 손 모양은 3D 포저의 포즈 프리셋(`vrm/studio-vrm-hand-poses.ts`)으로만 있고 캔버스에
 * 바로 붙는 소재가 아니다(삽입 카탈로그의 "손 소품"은 손에 쥐는 3D 소품이다). 캔버스에 붙일 수 있는 가장
 * 가까운 기존 소재는 주먹 이모지(👊)뿐이라 그것만 담고, 손 모양 소재를 새로 만들지 않는다.
 */

import { createStudioCharmId, appendStudioCharms } from "./studio-charm-model";

import type { StudioCharmBarState, StudioCharmId } from "./studio-charm-model";

export const STUDIO_CHARM_STARTER_PACK: readonly StudioCharmId[] = Object.freeze([
  createStudioCharmId("fx", "radial-focus"), // 집중선
  createStudioCharmId("fx", "speed-lines"), // 속도선
  createStudioCharmId("fx", "sweat-drop"), // 큰 땀방울
  createStudioCharmId("emoji", "1f4a7"), // 💧 눈물·물방울
  createStudioCharmId("fx", "nervous-sweat"), // 당황 식은땀
  createStudioCharmId("fx", "anger-mark"), // 분노 마크
  createStudioCharmId("fx", "exclaim-mark"), // 느낌표
  createStudioCharmId("fx", "sparkle-cluster"), // 반짝임
  createStudioCharmId("emoji", "1f44a"), // 👊 주먹
  createStudioCharmId("fx", "gloom-lines"), // 우울 세로줄
  createStudioCharmId("fx", "prop-smartphone"), // 기본 소품: 스마트폰
  createStudioCharmId("fx", "prop-coffee-cup"), // 기본 소품: 커피컵
]);

/** 스타터 팩을 뒤에 덧붙인다. 이미 있는 참은 건너뛰고 처리 완료로 표시한다. */
export function applyStudioCharmStarterPack(state: StudioCharmBarState): StudioCharmBarState {
  return appendStudioCharms(state, STUDIO_CHARM_STARTER_PACK);
}

/** 처음 연 빈 바에만 한 번 자동으로 담는다. 한 번이라도 목록을 고쳤다면 그대로 둔다. */
export function shouldAutoSeedStudioCharmStarter(state: StudioCharmBarState): boolean {
  return state.open && !state.starterSettled && state.charms.length === 0;
}
