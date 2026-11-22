// @vitest-environment jsdom
/**
 * 드로잉 툴 브러시 · 필터 · 커스텀 브러시 제작 툴 중복 0건 회귀 계약 테스트.
 *
 * 1) 브러시: 12슬롯 완전 중복 0건, 교차 카탈로그 노출 중복 0건, 단축 라벨 충돌 0건,
 *    기존 저장 문서·링크 별칭 100% 하위 호환 복원.
 * 2) 필터: 정본 필터 레지스트리(스마트 필터 86 · 다이얼로그 58 · 갤러리 107 · CSP REA 46 ·
 *    레거시 패널 21) 매핑 무결성 및 인스펙터 최상위 중복 노출 제거 + 구문서 자동 전개 호환.
 * 3) 커스텀 브러시 제작 툴: 2단계 단일 역할 계층, 퇴역 V5 활성 라우트 0건, 하드코딩 구수치 0건.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BRUSH_STUDIO_V6_CANONICAL_RECIPES,
  BRUSH_STUDIO_V6_RECIPES,
  createBrushStudioV6Program,
} from "../brush-lab/brush-studio-v6-engine";
import { BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS } from "../brush-lab/brush-studio-v6-recipe-catalog-texture";
import {
  BRUSH_STUDIO_V6_COMMERCIAL_REPLACEMENT_MAP,
  BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_ENTRIES,
  auditBrushStudioV6ExactSlotDuplicates,
  isBrushStudioV6DuplicateAliasId,
  resolveCanonicalBrushStudioV6RecipeId,
} from "../brush-lab/brush-studio-v6-recipe-dedupe";
import { searchBrushStudioV6Recipes } from "../brush-lab/brush-studio-v6-recipe-search";
import { StudioBrushV6RecipeShelf } from "../brush-lab/StudioBrushV6RecipeShelf";
import { CSP_REA_ALL_FILTER_SPECS } from "../filter/csp-rea/csp-rea-unified-filter-registry";
import { STUDIO_FILTER_GALLERY_EFFECTS } from "../filter/gallery/studio-filter-gallery-registry";
import {
  STUDIO_CANONICAL_FILTER_CAPABILITIES,
  STUDIO_CSP_REA_DISTINCT_LAYER_OPS,
  STUDIO_CSP_REA_FILTER_TO_CANONICAL_ENGINE,
  STUDIO_DIALOG_FILTER_ALIAS_TO_ENGINE,
  STUDIO_INSPECTOR_PRIMARY_SECTIONS,
  STUDIO_KM7_SPECTRAL_FILTER_IDS,
  STUDIO_LEGACY_INSPECTOR_PANEL_SPECS,
  resolveCanonicalFilterId,
} from "../filter/studio-canonical-filter-registry";
import {
  STUDIO_FILTER_CATALOG,
  STUDIO_FILTER_DIALOG_CATALOG,
} from "../filter/studio-filter-catalog";
import { normalizeBlurFx } from "../studio-blur";
import { normalizeClarity } from "../studio-clarity";
import { normalizeDetail } from "../studio-detail";
import { normalizeDistort } from "../studio-distort";
import { normalizePhotoFilter } from "../studio-photo-filter";
import { StudioBlurPanel } from "../StudioBlurPanel";
import { StudioClarityPanel } from "../StudioClarityPanel";
import { StudioDetailPanel } from "../StudioDetailPanel";
import { StudioDistortPanel } from "../StudioDistortPanel";
import { StudioImageAdjustmentsPanel } from "../StudioImageAdjustmentsPanel";
import { StudioImageFilterPanel } from "../StudioImageFilterPanel";
import { StudioPhotoFilterPanel } from "../StudioPhotoFilterPanel";

import {
  STUDIO_BRUSH_AUTHORING_TIERS,
  STUDIO_RETIRED_BRUSH_AUTHORING_SURFACES,
} from "./studio-brush-authoring-hierarchy";
import {
  STUDIO_BRUSH_CATALOG_ALIAS_ENTRIES,
  auditStudioBrushShortNameCollisions,
  isStudioBrushCatalogDuplicateAliasId,
  resolveCanonicalStudioBrushCatalogId,
} from "./studio-brush-canonical-dedupe";
import {
  STUDIO_CANONICAL_LIBRARY_BRUSH_CATALOG_ITEMS,
  STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS,
  filterStudioBrushCatalogItems,
  studioBrushCatalogItemById,
} from "./studio-brush-catalog";
import { materializeStudioBrushCatalogSelection } from "./studio-brush-selection";
import { studioV6BrushCatalogSelectionBlock } from "./studio-brush-v6-catalog-runtime";
import { studioV6BrushCatalogId } from "./studio-brush-v6-id";

import type { ImageEl } from "../studio-element-model";

afterEach(cleanup);

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("Drawing Tool 중복 제거 회귀 계약 — Pillar 1: 브러시 프리셋·레시피", () => {
  it("정본 V6 레시피 집합에는 12슬롯 실행 서명이 겹치는 중복이 0건이며 별칭은 정본으로 복원된다", () => {
    const r8TextureRecipeIds = new Set(
      BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS.map((spec) => spec.recipeId),
    );
    const collisions = auditBrushStudioV6ExactSlotDuplicates(
      BRUSH_STUDIO_V6_CANONICAL_RECIPES,
      r8TextureRecipeIds,
    );
    expect(collisions).toEqual([]);
    expect(BRUSH_STUDIO_V6_CANONICAL_RECIPES.length).toBe(
      BRUSH_STUDIO_V6_RECIPES.length - BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_ENTRIES.length,
    );

    for (const entry of BRUSH_STUDIO_V6_EXACT_SLOT_ALIAS_ENTRIES) {
      expect(isBrushStudioV6DuplicateAliasId(entry.aliasId)).toBe(true);
      expect(resolveCanonicalBrushStudioV6RecipeId(entry.aliasId)).toBe(entry.canonicalId);
      expect(BRUSH_STUDIO_V6_CANONICAL_RECIPES.some((r) => r.id === entry.aliasId)).toBe(false);
      expect(BRUSH_STUDIO_V6_CANONICAL_RECIPES.some((r) => r.id === entry.canonicalId)).toBe(true);
      // 기존 저장 문서·링크의 레시피 ID는 그대로 생성 가능해야 한다.
      expect(createBrushStudioV6Program(entry.aliasId).id).toBe(entry.aliasId);
      // 정본 검색에서도 과거 별칭 ID 검색 시 정본 레시피를 찾아 준다.
      const matched = searchBrushStudioV6Recipes(entry.aliasId, "all", { canonicalOnly: true });
      expect(matched.some((r) => r.id === entry.canonicalId)).toBe(true);
    }
  });

  it("전체 아티스트 라이브러리에서 ID 중복 0건·단축 라벨 충돌 0건·정본 카탈로그 중복 별칭 0건을 보장한다", async () => {
    expect(new Set(STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id)).size).toBe(
      STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.length,
    );
    expect(auditStudioBrushShortNameCollisions(STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS)).toEqual([]);

    expect(STUDIO_CANONICAL_LIBRARY_BRUSH_CATALOG_ITEMS.length).toBe(
      STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.length - STUDIO_BRUSH_CATALOG_ALIAS_ENTRIES.length,
    );
    expect(
      STUDIO_CANONICAL_LIBRARY_BRUSH_CATALOG_ITEMS.some((item) =>
        isStudioBrushCatalogDuplicateAliasId(item.id),
      ),
    ).toBe(false);

    const artistDefaultListing = filterStudioBrushCatalogItems({
      operation: "paint",
      category: "all",
      includeV6: true,
    });
    expect(artistDefaultListing.some((item) => isStudioBrushCatalogDuplicateAliasId(item.id))).toBe(
      false,
    );

    for (const entry of STUDIO_BRUSH_CATALOG_ALIAS_ENTRIES) {
      expect(resolveCanonicalStudioBrushCatalogId(entry.aliasId)).toBe(entry.canonicalId);
      expect(studioBrushCatalogItemById(entry.aliasId)).not.toBeNull();
      expect(studioBrushCatalogItemById(entry.canonicalId)).not.toBeNull();
      const selection = await materializeStudioBrushCatalogSelection(entry.aliasId);
      const block = studioV6BrushCatalogSelectionBlock(entry.aliasId);
      expect(selection !== null || block !== null).toBe(true);
    }
  });

  it("상용 허용 대체 표(BRUSH_STUDIO_V6_COMMERCIAL_REPLACEMENT_MAP)의 대상 레시피는 전부 무차단 실행 가능하다", () => {
    const recipeIds = new Set(BRUSH_STUDIO_V6_RECIPES.map((r) => r.id));
    for (const [legacyId, replacementId] of Object.entries(
      BRUSH_STUDIO_V6_COMMERCIAL_REPLACEMENT_MAP,
    )) {
      expect(recipeIds.has(legacyId), legacyId).toBe(true);
      expect(recipeIds.has(replacementId), replacementId).toBe(true);
      expect(
        studioV6BrushCatalogSelectionBlock(studioV6BrushCatalogId(replacementId)),
        replacementId,
      ).toBeNull();
    }
  });

  it("StudioBrushV6RecipeShelf(dedupeCanonical)는 중복 별칭을 접고 정본 레시피만 노출한다", () => {
    render(
      createElement(StudioBrushV6RecipeShelf, {
        selectedId: "v7-split-raking-impasto",
        onChoose: vi.fn(),
        dedupeCanonical: true,
      }),
    );
    expect(screen.getByRole("status").textContent).toBe(
      `${BRUSH_STUDIO_V6_CANONICAL_RECIPES.length} / ${BRUSH_STUDIO_V6_CANONICAL_RECIPES.length}개 레시피`,
    );
    expect(screen.getByTestId("brush-v6-dedupe-summary").textContent).toContain("정본 통합");
    expect(
      screen.getByRole("button", { name: /스플릿 팬 브러시 오일/u }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: /스플릿 레이킹 임파스토/u })).toBeNull();
  });
});

describe("Drawing Tool 중복 제거 회귀 계약 — Pillar 2: 정본 필터 레지스트리 및 중복 UI 정리", () => {
  it("스마트 필터·모달 다이얼로그·필터 갤러리(KM7)·CSP REA·레거시 패널 매핑이 전부 유효하고 중복 ID가 0건이다", () => {
    const smartEngineIds = new Set(STUDIO_FILTER_CATALOG.map((entry) => entry.engine));
    expect(smartEngineIds.size).toBe(STUDIO_FILTER_CATALOG.length);

    // 스마트 필터 각 항목 내 중복 키워드 0건 검증
    for (const entry of STUDIO_FILTER_CATALOG) {
      expect(new Set(entry.keywords).size, entry.engine).toBe(entry.keywords.length);
    }

    // 정본 기능군 ID 및 레거시 패널 ID 유일성 검증
    expect(new Set(STUDIO_CANONICAL_FILTER_CAPABILITIES.map((c) => c.canonicalId)).size).toBe(
      STUDIO_CANONICAL_FILTER_CAPABILITIES.length,
    );
    expect(new Set(STUDIO_LEGACY_INSPECTOR_PANEL_SPECS.map((p) => p.panelId)).size).toBe(
      STUDIO_LEGACY_INSPECTOR_PANEL_SPECS.length,
    );
    expect(STUDIO_INSPECTOR_PRIMARY_SECTIONS.length).toBe(11);
    expect(STUDIO_LEGACY_INSPECTOR_PANEL_SPECS.length).toBe(21);

    // 다이얼로그 6종 별칭 정본 일치 검증
    const dialogKindToEngine = new Map<string, string>(
      STUDIO_FILTER_DIALOG_CATALOG.map((entry) => [entry.kind, entry.engine]),
    );
    for (const [aliasKind, canonicalEngine] of Object.entries(
      STUDIO_DIALOG_FILTER_ALIAS_TO_ENGINE,
    )) {
      expect(dialogKindToEngine.get(aliasKind), aliasKind).toBe(canonicalEngine);
      expect(resolveCanonicalFilterId("dialog", aliasKind)).toBe(canonicalEngine);
      expect(smartEngineIds.has(canonicalEngine), canonicalEngine).toBe(true);
    }

    // CSP REA 46종 전수 분류 검증(42종 스마트 필터 정본 매핑 + 4종 고유 레이어 작업)
    for (const spec of CSP_REA_ALL_FILTER_SPECS) {
      const mappedEngine = STUDIO_CSP_REA_FILTER_TO_CANONICAL_ENGINE[spec.id];
      const distinctOp = STUDIO_CSP_REA_DISTINCT_LAYER_OPS[spec.id];
      expect(Boolean(mappedEngine) !== Boolean(distinctOp), spec.id).toBe(true);
      if (mappedEngine) {
        expect(smartEngineIds.has(mappedEngine), `${spec.id} -> ${mappedEngine}`).toBe(true);
        expect(resolveCanonicalFilterId("csp-rea", spec.id)).toBe(mappedEngine);
      }
    }

    // WebGPU/CPU 7밴드 KM 분광 안료 필터 4종 실재 검증
    const galleryIds = new Set(STUDIO_FILTER_GALLERY_EFFECTS.map((effect) => effect.id));
    for (const km7Id of STUDIO_KM7_SPECTRAL_FILTER_IDS) {
      expect(galleryIds.has(km7Id), km7Id).toBe(true);
      expect(resolveCanonicalFilterId("filter-gallery", km7Id)).toBe(km7Id);
    }

    // 레거시 패널 정본 엔진 ID 실재 검증
    for (const panel of STUDIO_LEGACY_INSPECTOR_PANEL_SPECS) {
      for (const engineId of panel.canonicalEngineIds) {
        expect(smartEngineIds.has(engineId), `${panel.panelId} -> ${engineId}`).toBe(true);
      }
    }
  });

  it("StudioImageAdjustmentsPanel은 레거시 21종을 단일 접이식 서랍으로 격리하고 기존 문서 값이 있으면 자동 전개한다", () => {
    const pristineImage: ImageEl = {
      id: "img-clean",
      type: "image",
      src: "data:image/png;base64,sample",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      opacity: 1,
    };

    const { rerender } = render(
      createElement(StudioImageAdjustmentsPanel, {
        selected: pristineImage,
        filterClipboard: null,
        onSetFilterClipboard: vi.fn(),
        onPatch: vi.fn(),
        effectFavoriteState: { version: 1, favorites: [], recent: [] },
        onToggleEffectFavorite: vi.fn(),
        onRememberEffectRecent: vi.fn(),
      }),
    );

    const drawerBtn = screen.getByRole("button", {
      name: /개별 레거시 필터 · 기존 문서 호환 \(21종\)/u,
    });
    expect(drawerBtn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("적용 중")).toBeNull();

    // 기존 문서에 레거시 필터 값이 들어 있으면 자동 전개 + 적용 건수 배지로 호환성 보장
    const legacyDocumentImage: ImageEl = {
      ...pristineImage,
      blurFx: { type: "gaussian", strength: 40, radius: 6, angle: 0 },
      photoFilter: { color: "#ec8a00", density: 25, preserveLuminosity: true },
    };
    rerender(
      createElement(StudioImageAdjustmentsPanel, {
        selected: legacyDocumentImage,
        filterClipboard: null,
        onSetFilterClipboard: vi.fn(),
        onPatch: vi.fn(),
        effectFavoriteState: { version: 1, favorites: [], recent: [] },
        onToggleEffectFavorite: vi.fn(),
        onRememberEffectRecent: vi.fn(),
      }),
    );

    expect(drawerBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("적용 중 2")).toBeTruthy();
  });

  it("개별 레거시 필터 패널 6종은 각각 정본 필터 안내(StudioCanonicalFilterNotice)를 표시한다", () => {
    render(
      createElement(
        "div",
        null,
        createElement(StudioImageFilterPanel, { values: {}, onPatch: vi.fn() }),
        createElement(StudioPhotoFilterPanel, {
          value: normalizePhotoFilter(undefined),
          onPatch: vi.fn(),
          onApplyPreset: vi.fn(),
          onReset: vi.fn(),
        }),
        createElement(StudioBlurPanel, {
          value: normalizeBlurFx(undefined),
          onPatch: vi.fn(),
          onApplyPreset: vi.fn(),
          onReset: vi.fn(),
        }),
        createElement(StudioClarityPanel, {
          value: normalizeClarity(undefined),
          onPatch: vi.fn(),
          onApplyPreset: vi.fn(),
          onReset: vi.fn(),
        }),
        createElement(StudioDetailPanel, {
          value: normalizeDetail(undefined),
          onPatch: vi.fn(),
          onApplyPreset: vi.fn(),
          onReset: vi.fn(),
        }),
        createElement(StudioDistortPanel, {
          value: normalizeDistort(undefined),
          onPatch: vi.fn(),
          onApplyPreset: vi.fn(),
          onReset: vi.fn(),
        }),
      ),
    );

    for (const panelId of [
      "StudioImageFilterPanel",
      "StudioPhotoFilterPanel",
      "StudioBlurPanel",
      "StudioClarityPanel",
      "StudioDetailPanel",
      "StudioDistortPanel",
    ]) {
      expect(document.querySelector(`[data-studio-canonical-filter-notice="${panelId}"]`)).not.toBeNull();
    }
  });
});

describe("Drawing Tool 중복 제거 회귀 계약 — Pillar 3: 커스텀 브러시 제작 툴 일원화", () => {
  it("2단계 단일 제작 계층을 유지하고 퇴역 V5 제작 표면은 활성 라우트/페이지에 0건 연결된다", () => {
    expect(STUDIO_BRUSH_AUTHORING_TIERS.map((tier) => [tier.stepNumber, tier.id])).toEqual([
      [1, "canvas-quick-tune"],
      [2, "full-studio-v6"],
    ]);
    expect(STUDIO_RETIRED_BRUSH_AUTHORING_SURFACES.every((s) => !s.active && !s.mountedInRoutes)).toBe(
      true,
    );

    const activeRouteFiles = [
      "apps/web/src/domains/creator/brush-lab/StudioBrushLabPage.tsx",
      "apps/web/src/app/routes/groups/creator.routes.tsx",
      "apps/web/src/app/routes/groups/creator-route-pages.ts",
    ];
    for (const relPath of activeRouteFiles) {
      const source = readWorkspaceFile(relPath);
      for (const retired of STUDIO_RETIRED_BRUSH_AUTHORING_SURFACES) {
        expect(source, `${relPath} must not mount ${retired.symbolName}`).not.toContain(
          retired.symbolName,
        );
      }
    }
  });

  it("하드코딩된 구형 브러시 개수(48종 · 241종)와 StudioBrushStudio 4중 중복 물성 섹션을 제거했다", () => {
    const cataloguePanelSource = readWorkspaceFile(
      "apps/web/src/domains/creator/brush-lab/StudioBrushProductCataloguePanel.tsx",
    );
    expect(cataloguePanelSource).not.toContain("시작 브러시 48종");
    expect(cataloguePanelSource).not.toContain("48종 보기");
    expect(cataloguePanelSource).toContain("BRUSH_QUALITY_CATALOG.length");

    const brushStudioSource = readWorkspaceFile(
      "apps/web/src/domains/creator/brush/StudioBrushStudio.tsx",
    );
    expect(brushStudioSource).not.toContain("전 241종 브러시");
    expect(brushStudioSource).not.toContain("전 241 브러시 통합 편집");
    // unifiedMediaSection은 동적 반응 탭 1곳에서만 렌더해야 한다(기존 4중 중복 제거).
    expect(brushStudioSource.match(/\{unifiedMediaSection\}/g)).toHaveLength(1);
  });
});
