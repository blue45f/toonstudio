/**
 * 커스텀 브러시 제작 툴 2단계 단일 역할 계층(Authoring Hierarchy) 정본 계약.
 *
 * 캔버스 빠른 튜닝과 전체 제작 스튜디오의 역할을 명확히 분리하고,
 * 퇴역한 구형 V5 제작 표면이 활성 라우트·CTA에 다시 혼입되지 않도록 계약화한다.
 */
import { STUDIO_BRUSH_LISTED_CATALOG_COUNTS } from "./studio-brush-catalog-core";
import { STUDIO_BRUSH_CREATE_ROUTE } from "./studio-brush-product-model";

export type StudioBrushAuthoringTierId = "canvas-quick-tune" | "full-studio-v6";

export interface StudioBrushAuthoringTierSpec {
  readonly id: StudioBrushAuthoringTierId;
  readonly stepNumber: 1 | 2;
  readonly titleKo: string;
  readonly surfaceName: string;
  readonly route: string | null;
  readonly purposeKo: string;
  readonly savesToLibrary: boolean;
  readonly supportsNodeGraph: boolean;
  readonly handoffLabelKo: string | null;
}

export interface StudioRetiredBrushAuthoringSurface {
  readonly modulePath: string;
  readonly symbolName: string;
  readonly active: false;
  readonly mountedInRoutes: false;
  readonly replacedByTier: StudioBrushAuthoringTierId;
  readonly retirementNoteKo: string;
}

/**
 * 활성 커스텀 브러시 제작 2단계 계층.
 * - 1단계(`canvas-quick-tune`): 캔버스 작업 흐름을 유지한 채 필압·촉·도장·빠른 엔진 조합을 조정하고 내 브러시로 저장.
 * - 2단계(`full-studio-v6`): 12슬롯 물리·재료 그래프·A/B 시험지 비교·파일 입출력·정본 레시피 기반 신규 브러시 제작.
 */
export const STUDIO_BRUSH_AUTHORING_TIERS: readonly StudioBrushAuthoringTierSpec[] = Object.freeze([
  Object.freeze({
    id: "canvas-quick-tune",
    stepNumber: 1,
    titleKo: "1단계 · 현재 브러시 빠른 튜닝",
    surfaceName: "StudioBrushStudio + StudioBrushEngineMixer",
    route: null,
    purposeKo:
      "캔버스 작업을 끊지 않고 현재 브러시의 필압·촉·도장·엔진 조합을 바로 조정해 내 브러시로 저장합니다.",
    savesToLibrary: true,
    supportsNodeGraph: false,
    handoffLabelKo: "브러시 스튜디오 전체 제작 열기",
  }),
  Object.freeze({
    id: "full-studio-v6",
    stepNumber: 2,
    titleKo: "2단계 · 브러시 스튜디오 전체 제작 (V6)",
    surfaceName: "StudioBrushLabPage → StudioBrushIntegratedWorkbench → StudioBrushV6Workbench",
    route: STUDIO_BRUSH_CREATE_ROUTE,
    purposeKo:
      "정본 시작 레시피, A/B 질감 시험지 비교, 12슬롯 물리·재료 그래프 설계와 파일 가져오기/내보내기를 단일 스튜디오에서 수행합니다.",
    savesToLibrary: true,
    supportsNodeGraph: true,
    handoffLabelKo: null,
  }),
]);

/**
 * 구형 V5 커스텀 브러시 제작 표면 퇴역 목록(라우트 미연결 · 활성 UI 노출 0건 보장).
 */
export const STUDIO_RETIRED_BRUSH_AUTHORING_SURFACES: readonly StudioRetiredBrushAuthoringSurface[] =
  Object.freeze([
    Object.freeze({
      modulePath: "apps/web/src/domains/creator/brush-lab/StudioBrushV5Composer.tsx",
      symbolName: "StudioBrushV5Composer",
      active: false,
      mountedInRoutes: false,
      replacedByTier: "full-studio-v6",
      retirementNoteKo: "V6 통합 워크벤치(StudioBrushV6Workbench)로 대체 완료. 라우트 및 진입 버튼에서 제거됨.",
    }),
    Object.freeze({
      modulePath: "apps/web/src/domains/creator/brush-lab/StudioBrushV5QualityWorkbench.tsx",
      symbolName: "StudioBrushV5QualityWorkbench",
      active: false,
      mountedInRoutes: false,
      replacedByTier: "full-studio-v6",
      retirementNoteKo: "구형 V5 품질 워크벤치 — StudioBrushLabPage에서 완전 분리됨.",
    }),
    Object.freeze({
      modulePath: "apps/web/src/domains/creator/brush-lab/StudioBrushV5RuntimeWorkbench.tsx",
      symbolName: "StudioBrushV5RuntimeWorkbench",
      active: false,
      mountedInRoutes: false,
      replacedByTier: "full-studio-v6",
      retirementNoteKo: "구형 V5 런타임 워크벤치 — StudioBrushLabPage에서 완전 분리됨.",
    }),
  ]);

const TIER_BY_ID = new Map<StudioBrushAuthoringTierId, StudioBrushAuthoringTierSpec>(
  STUDIO_BRUSH_AUTHORING_TIERS.map((tier) => [tier.id, tier]),
);

export function studioBrushAuthoringTier(
  id: StudioBrushAuthoringTierId,
): StudioBrushAuthoringTierSpec {
  return TIER_BY_ID.get(id) ?? STUDIO_BRUSH_AUTHORING_TIERS[0]!;
}

/**
 * 과거 하드코딩("전 241종 브러시")을 대체하는 실시간 기본 카탈로그 안내 문구.
 */
export function studioBrushListedScopeSummaryKo(): string {
  return `전 ${STUDIO_BRUSH_LISTED_CATALOG_COUNTS.total}종 브러시 통합 편집`;
}
