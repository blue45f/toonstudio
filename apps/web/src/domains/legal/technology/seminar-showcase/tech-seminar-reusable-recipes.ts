/**
 * 타 사이트 표준 재사용 실무 레시피 6선 데이터 모델 및 통합 레지스트리.
 */

import type { EngineeringCodeLanguage } from "../engineering-atlas-types";
import type {
  TechSeminarChapterId,
  TechSeminarLinkedRecipeId,
} from "./tech-seminar-remotion-data";
import { SEMINAR_RECIPES_AUTH_AND_UI } from "./tech-seminar-reusable-recipes-auth-ui";
import { SEMINAR_RECIPES_ENGINE_AND_OPS } from "./tech-seminar-reusable-recipes-engine-ops";

export type SeminarRecipeCategory = "auth" | "ui" | "engine" | "ops";

export type SeminarDiagramTone = "accent" | "cool" | "warn" | "good";

export interface SeminarRecipeDiagramNode {
  readonly title: string;
  readonly detail: string;
  readonly tone: SeminarDiagramTone;
}

export interface SeminarRecipeDiagramSpec {
  readonly ariaLabel: string;
  readonly caption: string;
  readonly nodes: readonly [
    SeminarRecipeDiagramNode,
    SeminarRecipeDiagramNode,
    SeminarRecipeDiagramNode,
    SeminarRecipeDiagramNode,
  ];
  readonly edgeLabels: readonly [string, string, string];
  readonly guardNote: string;
}

export interface SeminarRecipeApiSpecRow {
  readonly endpointOrSymbol: string;
  readonly methodOrKind: string;
  readonly requestOrInput: string;
  readonly responseOrOutput: string;
  readonly errorContract: string;
}

export interface SeminarRecipeAdoptionStep {
  readonly step: 1 | 2 | 3;
  readonly title: string;
  readonly action: string;
  readonly check: string;
}

export interface SeminarRecipeOfficialLink {
  readonly label: string;
  readonly url: string;
  readonly kind: string;
}

export interface SeminarRecipeCodeExcerpt {
  readonly title: string;
  readonly language: EngineeringCodeLanguage;
  readonly sourcePath: string;
  readonly code: string;
}

export interface TechSeminarReusableRecipe {
  readonly id: TechSeminarLinkedRecipeId;
  readonly order: number;
  readonly category: SeminarRecipeCategory;
  readonly badge: string;
  readonly title: string;
  readonly analogy: string;
  readonly oneLineSummary: string;
  readonly relatedChapterId: TechSeminarChapterId;
  readonly diagram: SeminarRecipeDiagramSpec;
  readonly apiSpecs: readonly SeminarRecipeApiSpecRow[];
  readonly codeExcerpt: SeminarRecipeCodeExcerpt;
  readonly repoEvidencePaths: readonly string[];
  readonly adoptionSteps: readonly [
    SeminarRecipeAdoptionStep,
    SeminarRecipeAdoptionStep,
    SeminarRecipeAdoptionStep,
  ];
  readonly gotchas: readonly string[];
  readonly speakerNotes: readonly string[];
  readonly officialLinks: readonly SeminarRecipeOfficialLink[];
}

export const TECH_SEMINAR_REUSABLE_RECIPES: readonly TechSeminarReusableRecipe[] = Object.freeze([
  ...SEMINAR_RECIPES_AUTH_AND_UI,
  ...SEMINAR_RECIPES_ENGINE_AND_OPS,
]);

export const SEMINAR_RECIPE_FILTERS: readonly {
  readonly id: "all" | SeminarRecipeCategory;
  readonly label: string;
}[] = Object.freeze([
  { id: "all", label: "전체 6선" },
  { id: "auth", label: "인증 · 보안" },
  { id: "ui", label: "UI · 인터랙션" },
  { id: "engine", label: "엔진 · 라이브러리" },
  { id: "ops", label: "오프라인 · 배포" },
]);

export function findSeminarRecipeById(
  id: TechSeminarLinkedRecipeId,
): TechSeminarReusableRecipe | undefined {
  return TECH_SEMINAR_REUSABLE_RECIPES.find((recipe) => recipe.id === id);
}
