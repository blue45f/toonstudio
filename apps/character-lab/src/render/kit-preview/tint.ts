/**
 * 틴트 해석(순수). 계약 §4.9·§3.6을 뷰어가 따르는 방법:
 * - recolor 재질(스킨·머리·홍채·눈썹·속눈썹·헤어·의상): GLB `baseColorFactor`는 흰색이고 텍스처는 상대색이다. 최종색 = 텍스처 × 틴트.
 *   앱 엔진은 PBR에서 텍스처가 있는 파츠에 레시피 색을 적용하지 않으므로(KT-04 전), 뷰어는 병합 GLB의 `baseColorFactor`에 틴트를 **구워**
 *   PBR `albedoColor`가 되게 하고, 툰은 플랜의 파츠 색(`ApplyPlanPart.color`)으로 준다 — 두 모드가 같은 색을 낸다.
 * - fixed 재질(공막·치아·혀·속옷): 틴트를 무시한다. GLB가 가진 `baseColorFactor`(없으면 흰색)가 고정색이다. 툰은 플랜 색을 이 값으로 덮는다.
 * - legacy(키트 규약 밖 이름): 아무것도 바꾸지 않는다 — 앱이 지금 그리는 대로(`resolvePartColorHex` 기본 해석) 보인다.
 */
import { DEFAULT_RECIPE_COLORS } from "../../contracts";
import { hexToLinearRgb, linearRgbToHex } from "../../shared/color";
import { ROLE_COLOR_KEY } from "../material-presets";

import type { TintMode } from "./kit-roles";
import type { PartRole, RecipeColorKey, RecipeColors } from "../../contracts";

export type Linear3 = readonly [number, number, number];

export interface TintDecision {
  readonly mode: TintMode;
  /** 플랜 파츠 `color`로 줄 소문자 `#rrggbb`. null이면 엔진의 기본 색 해석에 맡긴다. */
  readonly planColorHex: string | null;
  /** GLB `baseColorFactor` rgb로 구울 선형 값. null이면 굽지 않는다. */
  readonly bakeLinear: Linear3 | null;
  readonly colorKey: RecipeColorKey | null;
}

/** 앱 기본 팔레트에 `--color` 덮어쓰기를 얹은 전체 레시피 색 */
export function resolveTintColors(overrides: Readonly<Partial<Record<RecipeColorKey, string>>>): RecipeColors {
  return { ...DEFAULT_RECIPE_COLORS, ...overrides };
}

export function isNearWhite(factor: readonly number[] | null): boolean {
  if (!factor) return true;
  return [factor[0], factor[1], factor[2]].every((value) => typeof value === "number" && value >= 0.999);
}

/** 한 파츠의 틴트 결정. `authoredFactor`는 GLB 재질의 baseColorFactor(없으면 null). */
export function decideTint(role: PartRole, mode: TintMode, colors: RecipeColors, authoredFactor: readonly number[] | null): TintDecision {
  if (mode === "recolor") {
    const colorKey = ROLE_COLOR_KEY[role];
    const hex = colorKey ? colors[colorKey] : undefined;
    const linear = hex ? hexToLinearRgb(hex) : null;
    if (colorKey && hex && linear) return { mode, planColorHex: hex.toLowerCase(), bakeLinear: linear, colorKey };
    return { mode: "legacy", planColorHex: null, bakeLinear: null, colorKey: null };
  }
  if (mode === "fixed") {
    const hex = isNearWhite(authoredFactor) || !authoredFactor ? "#ffffff" : linearRgbToHex([authoredFactor[0] ?? 1, authoredFactor[1] ?? 1, authoredFactor[2] ?? 1]);
    return { mode, planColorHex: hex, bakeLinear: null, colorKey: null };
  }
  return { mode: "legacy", planColorHex: null, bakeLinear: null, colorKey: null };
}
