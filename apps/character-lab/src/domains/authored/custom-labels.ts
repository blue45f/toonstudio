/**
 * 커스터마이즈 능력·사유 문구의 한글 표기(순수, 2026-10-23 A-1): 베이스, 파츠 범위(`PartScope`), 형태 키.
 * 사용자에게 `female`·`acc-3`·`sideLength` 같은 내부어만 보이지 않도록 사유 문구는 이 표기를 쓴다(내부 id는 괄호로 함께 적는다).
 */
import { SLOT_LABELS_KO, WARDROBE_LAYER_LABELS_KO } from "../../contracts";

import type { FixedPartScope, KitBaseId, PartScope } from "../../contracts";

/** 베이스의 한글 표기 */
export const KIT_BASE_LABELS_KO: Readonly<Record<KitBaseId, string>> = { female: "여성", male: "남성" };

const FIXED_SCOPE_LABELS_KO: Readonly<Record<FixedPartScope, string>> = {
  hair: SLOT_LABELS_KO.hair,
  top: SLOT_LABELS_KO.top,
  inner: WARDROBE_LAYER_LABELS_KO.inner,
  outer: WARDROBE_LAYER_LABELS_KO.outer,
  bottom: SLOT_LABELS_KO.bottom,
  legwear: WARDROBE_LAYER_LABELS_KO.legwear,
  shoes: SLOT_LABELS_KO.shoes,
  accessory: SLOT_LABELS_KO.accessory,
};

/** 파츠 범위의 한글 표기(소품 인스턴스는 `소품 acc-<n>`) */
export function scopeLabelKo(scope: PartScope): string {
  return (FIXED_SCOPE_LABELS_KO as Readonly<Partial<Record<string, string>>>)[scope] ?? `소품 ${scope}`;
}

/**
 * 형태 키 이름 → 한글 라벨. 키트 v2 `shapes`에는 라벨 자리가 없어(계약) B-1 포지 산출물의 형태 이름을 기준으로 둔 기본 표다.
 * 같은 이름이 파츠마다 뜻이 조금 다를 수 있어(예: fit = 머리카락 여유·두께·몸과의 간격) 일반 라벨만 둔다. 표에 없는 이름은 `형태 <이름>`이다.
 * manifest가 라벨을 싣게 되면 그 값을 먼저 써야 한다(계약 요청).
 */
const SHAPE_LABELS_KO: ReadonlyMap<string, string> = new Map([
  ["length", "길이"],
  ["volume", "볼륨"],
  ["bangs", "앞머리"],
  ["sideLength", "옆머리 길이"],
  ["curl", "컬"],
  ["wave", "웨이브"],
  ["tail", "묶은 머리 길이"],
  ["tails", "꼬리 길이"],
  ["fit", "여유"],
  ["size", "크기"],
  ["height", "높이"],
  ["width", "폭"],
  ["toe", "앞코"],
  ["sole", "밑창 두께"],
  ["cuff", "끝단 두께"],
  ["cup", "컵 크기"],
  ["crown", "크라운 높이"],
  ["brim", "챙 길이"],
  ["band", "띠 폭"],
  ["round", "둥글기"],
  ["pendant", "장식 크기"],
  ["hat-clear", "모자 여유"],
]);

export function shapeLabelKo(name: string): string {
  return SHAPE_LABELS_KO.get(name) ?? `형태 ${name}`;
}

/** `라벨(이름)` 표기 — 사유 문구용. 라벨 표에 없는 이름은 이름만 적는다("형태 키 형태 x(x)"처럼 겹치지 않게). */
export function shapeDisplayKo(name: string): string {
  const label = SHAPE_LABELS_KO.get(name);
  return label === undefined ? name : `${label}(${name})`;
}
