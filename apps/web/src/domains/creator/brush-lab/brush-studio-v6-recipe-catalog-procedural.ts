import {
  BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES,
  type BrushStudioV6ProceduralModel,
} from "./brush-studio-v6-procedural-family-catalog";
import { defineBrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

import type { BrushStudioV6Slots } from "./brush-studio-v6-engine";
import type { BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

/**
 * 절차 브러시 계열 레시피: 모델마다 하나. 노드는 모두 내부·허용형(CPU 접촉 커널, 켄트지, 분광 안료)이라
 * 기본 라이선스 프로필(permissive-only)에서 차단되지 않는다. 스케치 묶음만 연필처럼 종이 결에 반응하도록
 * 건식 도포를 쓰고(제품 재질 탭: 연필), 나머지는 잉크 도포를 쓴다.
 */
const DRY_SKETCH: ReadonlySet<BrushStudioV6ProceduralModel> = new Set([
  "harmony-sketchy", "harmony-shaded", "harmony-web", "klecks-sketchy",
]);

function slotsFor(model: BrushStudioV6ProceduralModel, carrier: string): Partial<BrushStudioV6Slots> {
  return {
    motion: "motion-direct",
    carrier,
    surface: "surface-kent",
    ...(DRY_SKETCH.has(model) ? { deposition: "deposit-dry" } : {}),
    pigment: "pigment-spectral",
  };
}

export const BRUSH_STUDIO_V6_PROCEDURAL_RECIPE_SEEDS: readonly BrushStudioV6RecipeSeed[] = Object.freeze(
  BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES.map((entry) => defineBrushStudioV6RecipeSeed(
    entry.recipeId,
    entry.label,
    entry.group ?? "프로시저럴·기하",
    entry.description,
    { slots: slotsFor(entry.model, entry.id), tuning: entry.tuning },
  )),
);
