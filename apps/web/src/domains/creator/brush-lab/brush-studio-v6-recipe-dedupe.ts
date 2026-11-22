/**
 * Brush Studio V6 레시피 정본(canonical) 중복 통합 및 별칭(alias) 매핑 계층.
 *
 * - 기존 저장 문서·링크·테스트가 참조하는 레시피 ID는 100% 하위 호환을 유지한다.
 * - 12슬롯 실행 그래프가 완전히 동일하고 별도 R8 텍스처/런타임 사양이 없는 중복 레시피는
 *   정본 ID 하나로 수렴시키며, 카탈로그 UI 노출 시 중복 노출을 차단한다.
 * - `BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS`(R8 height-combine 그레인)로 실행 결과가
 *   구분되는 텍스처 프리셋은 의도적 구분으로 명시 기록한다.
 */
import type { BrushStudioV6Program, BrushStudioV6Recipe } from "./brush-studio-v6-engine";

export interface BrushStudioV6DuplicateAliasEntry {
  readonly aliasId: string;
  readonly canonicalId: string;
  readonly reason: string;
}

export interface BrushStudioV6IntentionalSlotShareEntry {
  readonly baseId: string;
  readonly companionId: string;
  readonly distinction: string;
}

export interface BrushStudioV6SlotDuplicateGroup {
  readonly signature: string;
  readonly recipeIds: readonly string[];
}

/**
 * 12슬롯 그래프가 완전히 동일하고 별도 텍스처·런타임 사양이 없는 중복 레시피의 정본 매핑.
 * UI 카탈로그에서는 alias ID를 숨기고 정본 ID 하나만 노출하며,
 * 기존 저장 문서·URL·검색 쿼리의 alias ID는 정본으로 해석한다.
 */
export const BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_ENTRIES: readonly BrushStudioV6DuplicateAliasEntry[] =
  Object.freeze([
    Object.freeze({
      aliasId: "v7-split-raking-impasto",
      canonicalId: "v7-split-fan-oil",
      reason:
        "12슬롯 실행 그래프(motion-brush-inertia · carrier-webgpu-ribbon · tip-round-sdf · "
        + "surface-v7-canvas-heavy · deposit-oil · pickup-pigment-reservoir · pigment-open-km · "
        + "physics-bristle+split-merge+height · finish-directional-relief)가 완전 동일하며 "
        + "별도 텍스처 사양 없이 스칼라 굵기·부조 수치만 다름.",
    }),
    Object.freeze({
      aliasId: "mixbox-oil-pastel-film",
      canonicalId: "mixbox-pastel-smudge",
      reason:
        "12슬롯 실행 그래프(motion-adaptive-ema · carrier-libmypaint-dabs · tip-krita-dual · "
        + "surface-printmaking · deposit-dry · pickup-krita-smudge · pigment-mixbox · "
        + "physics-dry-contact · finish-grain)가 완전 동일하며 굵기·불투명도 스칼라만 다름.",
    }),
  ]);

export const BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> =
  Object.freeze(
    Object.fromEntries(
      BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_ENTRIES.map((entry) => [
        entry.aliasId,
        entry.canonicalId,
      ]),
    ),
  );

/**
 * 기본 상용 허용 라이선스 프로필(`permissive-only`)에서 차단되는 구형 Mixbox 레시피와
 * 동일한 매체 역할을 수행하는 상용 안전 정본 레시피(7밴드 분광 KM7 · 코어 · 토폴로지) 매핑.
 * 저장 문서 마이그레이션 및 상용 카탈로그 필터링의 기준표로 사용한다.
 */
export const BRUSH_STUDIO_V6_COMMERCIAL_REPLACEMENT_MAP: Readonly<Record<string, string>> =
  Object.freeze({
    "mixbox-oil-bristle": "km7-oil-impasto-bristle",
    "mixbox-watercolor-bloom": "km7-watercolor-wet-edge-bloom",
    "mixbox-gouache-dual": "km7-gouache-opaque-flat",
    "mixbox-pastel-smudge": "km7-dry-pastel-chalk",
    "mixbox-oil-pastel-film": "km7-dry-pastel-chalk",
    "mixbox-palette-knife": "impasto-knife",
    "mixbox-wax-resist": "rebelle-capillary-wash",
    "mixbox-neon-wet": "glass-neon-ribbon",
    "mixbox-linen-weave": "linen-dry-bristle",
    "mixbox-alcohol-marker": "alcohol-bloom",
    "mixbox-phyllotaxis-stipple": "phyllotaxis-stipple",
    "mixbox-braided-paint": "braided-cord",
  });

/**
 * 12슬롯 문자열은 같지만 `BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS`의 R8 그레인 타일·결합 모드가
 * 별도 바인딩되어 실제 획 질감이 구분되는 의도적 페어 목록.
 */
export const BRUSH_STUDIO_V6_INTENTIONAL_SLOT_SHARES: readonly BrushStudioV6IntentionalSlotShareEntry[] =
  Object.freeze([
    Object.freeze({
      baseId: "eroding-charcoal",
      companionId: "texture-rough-charcoal",
      distinction:
        "texture-rough-charcoal은 R8 height-combine 그레인 타일(charcoal-tooth)이 추가 바인딩됨.",
    }),
    Object.freeze({
      baseId: "oil-hair-mixer",
      companionId: "texture-canvas-oil",
      distinction:
        "texture-canvas-oil은 R8 height-combine 캔버스 직조 타일(canvas-weave)이 추가 바인딩됨.",
    }),
  ]);

const INTENTIONAL_R8_TEXTURE_COMPANION_IDS: ReadonlySet<string> = new Set(
  BRUSH_STUDIO_V6_INTENTIONAL_SLOT_SHARES.map((entry) => entry.companionId),
);

/**
 * 별칭(alias) 또는 정본 레시피 ID를 정본 V6 레시피 ID로 해석한다.
 */
export function resolveCanonicalBrushStudioV6RecipeId(recipeId: string): string {
  return BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_TO_CANONICAL[recipeId] ?? recipeId;
}

/**
 * 주어진 V6 레시피 ID가 정본으로 흡수된 중복 별칭인지 판별한다.
 */
export function isBrushStudioV6DuplicateAliasId(recipeId: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_TO_CANONICAL,
    recipeId,
  );
}

/**
 * 라이선스 차단 구형 Mixbox 레시피에 대응하는 상용 안전 정본 레시피 ID를 반환한다.
 */
export function resolveBrushStudioV6CommercialReplacementId(recipeId: string): string | null {
  return BRUSH_STUDIO_V6_COMMERCIAL_REPLACEMENT_MAP[recipeId] ?? null;
}

/**
 * 정본 레시피 ID에 흡수된 별칭 ID 목록을 반환한다.
 */
export function listBrushStudioV6AliasIdsForCanonical(canonicalId: string): readonly string[] {
  return Object.freeze(
    BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_ENTRIES.filter((entry) => entry.canonicalId === canonicalId)
      .map((entry) => entry.aliasId),
  );
}

/**
 * 프로그램의 12슬롯 실행 서명을 계산한다.
 * R8 텍스처 결합 사양이 별도로 연결된 레시피는 텍스처 구분자를 서명에 포함해 오탐을 방지한다.
 */
export function brushStudioV6ExecutionSignature(
  program: Pick<BrushStudioV6Program, "id" | "slots">,
  hasDedicatedR8TextureSpec = INTENTIONAL_R8_TEXTURE_COMPANION_IDS.has(program.id),
): string {
  const { slots } = program;
  return [
    slots.input,
    slots.motion,
    slots.carrier,
    slots.tip,
    slots.surface,
    slots.deposition,
    slots.pickup,
    slots.pigment,
    [...slots.physics].sort().join("+"),
    slots.pattern,
    [...slots.finish].sort().join("+"),
    slots.output,
    hasDedicatedR8TextureSpec ? `r8-texture:${program.id}` : "r8-texture:none",
  ].join("|");
}

/**
 * 레시피 목록에서 중복 별칭을 제거해 정본 목록만 반환한다.
 * `excludeCommercialSuperseded: true`를 넘기면 상용 KM7/코어 정본으로 대체된 구형 Mixbox 중복도 함께 제외한다.
 */
export function dedupeBrushStudioV6Recipes<T extends { readonly id: string }>(
  recipes: readonly T[],
  options: { readonly excludeCommercialSuperseded?: boolean } = {},
): readonly T[] {
  const seenCanonicalIds = new Set<string>();
  const result: T[] = [];
  for (const recipe of recipes) {
    if (isBrushStudioV6DuplicateAliasId(recipe.id)) continue;
    if (
      options.excludeCommercialSuperseded
      && resolveBrushStudioV6CommercialReplacementId(recipe.id) !== null
    ) {
      continue;
    }
    const canonicalId = resolveCanonicalBrushStudioV6RecipeId(recipe.id);
    if (seenCanonicalIds.has(canonicalId)) continue;
    seenCanonicalIds.add(canonicalId);
    result.push(recipe);
  }
  return Object.freeze(result);
}

/**
 * 전달된 V6 레시피 집합에서 실행 서명이 완전히 겹치는 중복 그룹을 감사한다.
 * 정본 레시피 목록(`BRUSH_STUDIO_V6_CANONICAL_RECIPES`)에서는 반환 배열이 반드시 비어 있어야 한다.
 */
export function auditBrushStudioV6ExactSlotDuplicates(
  recipes: readonly BrushStudioV6Recipe[],
  r8TextureRecipeIds?: ReadonlySet<string>,
): readonly BrushStudioV6SlotDuplicateGroup[] {
  const bySignature = new Map<string, string[]>();
  for (const recipe of recipes) {
    const program = recipe.create();
    const hasTexture = r8TextureRecipeIds
      ? r8TextureRecipeIds.has(recipe.id)
      : INTENTIONAL_R8_TEXTURE_COMPANION_IDS.has(recipe.id);
    const sig = brushStudioV6ExecutionSignature(program, hasTexture);
    const bucket = bySignature.get(sig) ?? [];
    bucket.push(recipe.id);
    bySignature.set(sig, bucket);
  }
  const collisions: BrushStudioV6SlotDuplicateGroup[] = [];
  for (const [signature, recipeIds] of bySignature) {
    if (recipeIds.length > 1) {
      collisions.push(Object.freeze({ signature, recipeIds: Object.freeze(recipeIds) }));
    }
  }
  return Object.freeze(collisions);
}
