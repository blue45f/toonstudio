/**
 * 소품 프리셋별로 어울리는 앵커(레시피 v3 추가 소품 `wardrobe.accessories`, 2026-10-23 S-1).
 * 코디 세트(`look-sets.ts`)가 쓰고, 섞기(`state/look-mixer.ts`)는 composition이 이 함수를 주입해 쓴다(영역 경계상 직접 import하지 않는다).
 * 표 밖 조합(안경을 발에)은 만들지 않는다. 실제로 붙일 수 있는지는 소스 앵커 능력(`CustomCapabilities.anchors`)과의 교집합으로 정한다.
 */
import { SLOT_PRESET_IDS, isPresetId, presetName, presetSlot } from "../contracts";

import type { AccessoryAnchor, AccessoryStyleId, PresetId } from "../contracts";

/** 어휘 소품 6종 × 어울리는 앵커(첫 항목 = 기본 위치) */
export const ACCESSORY_ANCHOR_AFFINITY: Readonly<Record<AccessoryStyleId, readonly AccessoryAnchor[]>> = Object.freeze({
  glasses: Object.freeze(["face"] as const),
  // 리본: 머리 장식·목 리본·허리 리본·손목 리본·등 리본
  ribbon: Object.freeze(["hair", "head-top", "neck", "waist", "wrist-l", "wrist-r", "back"] as const),
  cap: Object.freeze(["head-top"] as const),
  earrings: Object.freeze(["ear-l", "ear-r"] as const),
  // 초커: 목, 손목에 감으면 팔찌
  choker: Object.freeze(["neck", "wrist-l", "wrist-r"] as const),
  // 헤드폰: 머리에 쓰기·목에 걸기
  headphones: Object.freeze(["head-top", "neck"] as const),
});

const ACCESSORY_NAMES: ReadonlySet<string> = new Set(SLOT_PRESET_IDS.accessory);

/** 소품 프리셋의 어울리는 앵커. 소품이 아니거나 어휘 밖이면 빈 배열(앵커를 지어내지 않는다). */
export function accessoryAnchorsFor(presetId: PresetId): readonly AccessoryAnchor[] {
  if (!isPresetId(presetId) || presetSlot(presetId) !== "accessory") return [];
  const name = presetName(presetId);
  if (!ACCESSORY_NAMES.has(name)) return [];
  return ACCESSORY_ANCHOR_AFFINITY[name as AccessoryStyleId];
}
