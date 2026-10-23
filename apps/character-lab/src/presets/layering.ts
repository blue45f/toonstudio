/**
 * 겹쳐 입기 궁합(레시피 v3 옷장 층, 2026-10-23 S-1): 바탕 슬롯 프리셋(상의·하의)마다 그 위·아래 층에 어울리는 어휘 프리셋.
 * 층은 같은 슬롯 어휘를 다른 층에 입히는 방식이라(아우터 `top/blazer` = 재킷, 레그웨어 `bottom/slacks` = 레깅스·스타킹,
 * 레그웨어 `bottom/shorts` = 치마 속바지) 아무 조합이나 그럴듯하지 않다 — 청바지 위 레그웨어, 블레이저 위 아우터 같은 조합은 비워 둔다.
 * 코디 세트는 이 표를 지키고(시험), 섞기(`state/look-mixer` `layerOptions` 주입)와 커스텀 뷰(어울리는 층 먼저 보이기)가 쓴다.
 * 계약 검사(`isLayerPreset`)는 슬롯만 보므로 이 표 밖 조합도 레시피로는 유효하다(사용자가 직접 고르면 막지 않는다).
 */
import type { PresetId, WardrobeLayer } from "../contracts";

export const WARDROBE_LAYER_COMPATIBILITY: Readonly<Record<WardrobeLayer, Readonly<Record<string, readonly PresetId[]>>>> = Object.freeze({
  // 상의 안에 받쳐 입는 것
  inner: Object.freeze({
    "top/tee": Object.freeze([]),
    "top/hoodie": Object.freeze(["top/tee", "top/shirt"] as const),
    "top/shirt": Object.freeze(["top/tee"] as const),
    "top/blazer": Object.freeze(["top/shirt", "top/tee"] as const),
    "top/sailor": Object.freeze(["top/tee"] as const),
  }),
  // 상의 위에 걸치는 것(재킷·집업·열어 입은 셔츠)
  outer: Object.freeze({
    "top/tee": Object.freeze(["top/blazer", "top/hoodie", "top/shirt"] as const),
    "top/hoodie": Object.freeze(["top/blazer"] as const),
    "top/shirt": Object.freeze(["top/blazer", "top/hoodie"] as const),
    "top/blazer": Object.freeze([]),
    "top/sailor": Object.freeze(["top/blazer"] as const),
  }),
  // 하의 아래(레깅스·스타킹·속바지)
  legwear: Object.freeze({
    "bottom/jeans": Object.freeze([]),
    "bottom/shorts": Object.freeze(["bottom/slacks"] as const),
    "bottom/pleated-skirt": Object.freeze(["bottom/slacks", "bottom/shorts"] as const),
    "bottom/long-skirt": Object.freeze(["bottom/slacks"] as const),
    "bottom/slacks": Object.freeze([]),
  }),
});

/** 바탕 프리셋에 어울리는 층 프리셋(바탕이 없거나 표에 없으면 빈 배열 — 지어내지 않는다) */
export function layerOptionsFor(layer: WardrobeLayer, base: PresetId | null): readonly PresetId[] {
  if (base === null) return [];
  return WARDROBE_LAYER_COMPATIBILITY[layer][base] ?? [];
}
