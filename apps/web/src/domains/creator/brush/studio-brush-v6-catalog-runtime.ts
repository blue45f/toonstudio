/** Lazy, exact materialization of V6 catalogue selections. */
import {
  brushStudioV6ActiveNodes,
  BRUSH_STUDIO_V6_RECIPES,
} from "../brush-lab/brush-studio-v6-engine";
import { BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE } from "../brush-lab/brush-studio-v6-license-profile";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { planBrushStudioV6ProviderRuntime } from "../brush-lab/brush-studio-v6-provider-runtime";

import { studioV6BrushCatalogItemById } from "./studio-brush-v6-catalog";
import { studioV6RecipeIdFromCatalogId } from "./studio-brush-v6-id";

import type { BrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import type { BrushStudioV6LicenseProfile } from "../brush-lab/brush-studio-v6-license-profile";
import type { BrushStudioV6BlockedProviderNode } from "../brush-lab/brush-studio-v6-provider-runtime";
import type { StudioBrushCatalogSelection } from "./studio-brush-selection";

const RECIPE_BY_ID = new Map(
  BRUSH_STUDIO_V6_RECIPES.map((recipe) => [recipe.id, recipe]),
);
const SELECTION_BY_CATALOG_ID = new Map<string, StudioBrushCatalogSelection>();
const BLOCK_BY_CATALOG_ID = new Map<string, StudioV6BrushCatalogSelectionBlock>();

/**
 * Why one catalogue row cannot be materialized under the effective license profile.
 *
 * The catalogue keeps every authored recipe as a row, but the default product profile is
 * permissive-only (라이선스 P0): recipes whose active nodes need a noncommercial, copyleft or
 * private-grant provider can never produce a no-fallback receipt here. Those rows are reported
 * through this block record — the same provider-plan verdict the receipt builder enforces — so
 * surfaces can mark the row as not provided with its reason instead of the selection throwing.
 */
export interface StudioV6BrushCatalogSelectionBlock {
  readonly catalogId: string;
  readonly catalogName: string;
  readonly licenseProfile: BrushStudioV6LicenseProfile;
  readonly blockedNodeIds: readonly string[];
  readonly blockedNodes: readonly BrushStudioV6BlockedProviderNode[];
  readonly reason: string;
}

export function studioV6BrushProgramForCatalogId(
  catalogId: unknown,
): BrushStudioV6Program | null {
  const recipeId = studioV6RecipeIdFromCatalogId(catalogId);
  return recipeId ? RECIPE_BY_ID.get(recipeId)?.create() ?? null : null;
}

function selectionBlockForProgram(
  catalogId: string,
  program: BrushStudioV6Program,
): StudioV6BrushCatalogSelectionBlock | null {
  const cached = BLOCK_BY_CATALOG_ID.get(catalogId);
  if (cached) return cached;
  const licenseProfile =
    program.licenseProfile ?? BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE;
  const plan = planBrushStudioV6ProviderRuntime(
    brushStudioV6ActiveNodes(program),
    licenseProfile,
  );
  if (plan.valid) return null;
  const block = Object.freeze({
    catalogId,
    catalogName: program.name,
    licenseProfile: plan.licenseProfile,
    blockedNodeIds: plan.blockedNodeIds,
    blockedNodes: plan.blockedNodes,
    reason: `${program.name}은(는) 현재 라이선스 프로필에서 제공되지 않는 재료를 사용해요: ${plan.blockedNodeIds.join(", ")}`,
  });
  BLOCK_BY_CATALOG_ID.set(catalogId, block);
  return block;
}

/**
 * The not-provided verdict for one catalogue row, or `null` when the row materializes (or the id
 * is unknown). Lets library surfaces show the license reason next to a blocked row without
 * attempting a selection first.
 */
export function studioV6BrushCatalogSelectionBlock(
  catalogId: unknown,
): StudioV6BrushCatalogSelectionBlock | null {
  if (typeof catalogId !== "string") return null;
  if (SELECTION_BY_CATALOG_ID.has(catalogId)) return null;
  const program = studioV6BrushProgramForCatalogId(catalogId);
  if (!program) return null;
  return selectionBlockForProgram(catalogId, program);
}

export function materializeStudioV6BrushCatalogSelection(
  catalogId: unknown,
): StudioBrushCatalogSelection | null {
  if (typeof catalogId !== "string") return null;
  const cached = SELECTION_BY_CATALOG_ID.get(catalogId);
  if (cached) return cached;
  const program = studioV6BrushProgramForCatalogId(catalogId);
  if (!program) return null;
  // Fail closed without throwing: a row blocked by the license profile is simply not provided,
  // exactly like an unknown id. The verdict stays queryable via
  // `studioV6BrushCatalogSelectionBlock` so the row can be labelled with its reason.
  if (selectionBlockForProgram(catalogId, program)) return null;
  const product = createBrushStudioV6ProductBrush(program);
  if (product.enginePrograms?.material?.runtime?.fallbackPolicy !== "none") {
    throw new Error(
      `${program.name}의 무폴백 엔진 실행 영수증을 만들지 못했어요.`,
    );
  }
  const selection = Object.freeze({
    catalogId,
    catalogName: program.name,
    runtimeBrushId: product.brushId,
    operation: "paint" as const,
    // Product selection uses the perceived-size policy; the material receipt keeps its authored
    // tuning and the live renderer replaces tuning.size with the selected element stroke width.
    defaultWidth: studioV6BrushCatalogItemById(catalogId)?.defaultWidth ?? product.strokeWidth,
    defaultOpacity: product.brushOpacity,
    defaultColor: product.color,
    brushDynamics: product.brushDynamics,
    enginePrograms: product.enginePrograms,
  });
  SELECTION_BY_CATALOG_ID.set(catalogId, selection);
  return selection;
}
