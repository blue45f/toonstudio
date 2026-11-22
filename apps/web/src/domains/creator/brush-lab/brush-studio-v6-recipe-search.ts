import {
  BRUSH_STUDIO_V6_CANONICAL_RECIPES,
  BRUSH_STUDIO_V6_RECIPES,
  type BrushStudioV6Recipe,
} from "./brush-studio-v6-engine";
import { listBrushStudioV6AliasIdsForCanonical } from "./brush-studio-v6-recipe-dedupe";

export const BRUSH_STUDIO_V6_RECIPE_GROUPS: readonly string[] = Object.freeze(
  [...new Set(BRUSH_STUDIO_V6_RECIPES.map((recipe) => recipe.group))],
);
export const BRUSH_STUDIO_V6_CANONICAL_RECIPE_GROUPS: readonly string[] = Object.freeze(
  [...new Set(BRUSH_STUDIO_V6_CANONICAL_RECIPES.map((recipe) => recipe.group))],
);
const normalized = (text: string): string => text.normalize("NFKC").toLocaleLowerCase("ko-KR").replaceAll("-", " ");

/** Search describes the executable recipe inventory, never the larger design-only node registry. */
export function searchBrushStudioV6Recipes(
  query = "",
  group = "all",
  options: { readonly canonicalOnly?: boolean } = {},
): readonly BrushStudioV6Recipe[] {
  const source = options.canonicalOnly ? BRUSH_STUDIO_V6_CANONICAL_RECIPES : BRUSH_STUDIO_V6_RECIPES;
  const words = normalized(query.trim().slice(0, 160)).split(/\s+/u).filter(Boolean);
  return source.filter((recipe) => {
    if (group !== "all" && recipe.group !== group) return false;
    const aliases = options.canonicalOnly
      ? listBrushStudioV6AliasIdsForCanonical(recipe.id).join(" ")
      : "";
    const haystack = normalized(`${recipe.id} ${aliases} ${recipe.label} ${recipe.group} ${recipe.description}`);
    return words.every((word) => haystack.includes(word));
  });
}
