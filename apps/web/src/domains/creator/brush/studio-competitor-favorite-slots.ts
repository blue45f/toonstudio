import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { loadStudioBrushLibrarySqliteRepository } from "../studio-page-editor-runtime-loaders";

import {
  browserBrushLibraryStorage,
  saveBrushBatchWithResult,
  selectQuickBrushes,
  type BrushLibraryStorage,
  type StudioSavedBrush,
} from "./studio-brush-library";
import { studioV6BrushCatalogId } from "./studio-brush-v6-id";

export interface StudioCompetitorFavoriteSlotSpec {
  readonly slotIndex: number;
  readonly savedId: string;
  readonly recipeId: string;
  readonly catalogId: string;
  readonly workflowRoleKo: string;
  readonly workflowRoleEn: string;
}

/**
 * 원고 캔버스 빠른 선반(Quick Shelf, 최대 8슬롯 중 상위 6슬롯)에 원클릭 고정 가능한
 * 브러시랩스 검증 완료 경쟁사 1:1 패리티 플래그십 프리셋 번들.
 */
export const STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS: readonly StudioCompetitorFavoriteSlotSpec[] =
  Object.freeze([
    Object.freeze({
      slotIndex: 1,
      savedId: "favorite-slot:v6:csp-real-gpen-aa",
      recipeId: "csp-real-gpen-aa",
      catalogId: studioV6BrushCatalogId("csp-real-gpen-aa"),
      workflowRoleKo: "주력 펜선 · 서브픽셀 칼선",
      workflowRoleEn: "Primary Lineart · Subpixel AA",
    }),
    Object.freeze({
      slotIndex: 2,
      savedId: "favorite-slot:v6:csp-dual-chalk-ink-liner",
      recipeId: "csp-dual-chalk-ink-liner",
      catalogId: studioV6BrushCatalogId("csp-dual-chalk-ink-liner"),
      workflowRoleKo: "건식 듀얼 초크 · 감성 펜선",
      workflowRoleEn: "Dry Dual-Chalk · Textured Ink",
    }),
    Object.freeze({
      slotIndex: 3,
      savedId: "favorite-slot:v6:calligraphy-barrel-twist-nib",
      recipeId: "calligraphy-barrel-twist-nib",
      catalogId: studioV6BrushCatalogId("calligraphy-barrel-twist-nib"),
      workflowRoleKo: "배럴 트위스트 · 납작 캘리 닙",
      workflowRoleEn: "Barrel-Twist · Chisel Calligraphy",
    }),
    Object.freeze({
      slotIndex: 4,
      savedId: "favorite-slot:v6:procreate-6b-tilt-graphite",
      recipeId: "procreate-6b-tilt-graphite",
      catalogId: studioV6BrushCatalogId("procreate-6b-tilt-graphite"),
      workflowRoleKo: "콘티·데생 · 6B 측면 연필",
      workflowRoleEn: "Draft & Sketch · 6B Tilt Graphite",
    }),
    Object.freeze({
      slotIndex: 5,
      savedId: "favorite-slot:v6:rebelle-capillary-wash",
      recipeId: "rebelle-capillary-wash",
      catalogId: studioV6BrushCatalogId("rebelle-capillary-wash"),
      workflowRoleKo: "투명 수채 · 모세관 커피링",
      workflowRoleEn: "Watercolor Wash · Capillary Ring",
    }),
    Object.freeze({
      slotIndex: 6,
      savedId: "favorite-slot:v6:krita-impasto-fan-bristle",
      recipeId: "krita-impasto-fan-bristle",
      workflowRoleKo: "밀도 마감 · 원심 유화 믹서",
      workflowRoleEn: "Impasto Finish · Fan-Bristle Mixer",
      catalogId: studioV6BrushCatalogId("krita-impasto-fan-bristle"),
    }),
  ]);

/**
 * 6종의 플래그십 V6/V7.4 레시피를 실제 원고 캔버스 `StudioSavedBrush` 고정(`pinned: true`) 스냅샷으로 생성한다.
 * 모든 브러시는 무폴백(`fallbackPolicy === "none"`) 머티리얼 실행 영수증을 내장하여 오프라인·협업 리플레이에서도 동일하게 동작한다.
 */
export function buildStudioCompetitorFavoriteSlotBrushes(
  baseTimestampMs = 1_762_950_000_000,
): readonly StudioSavedBrush[] {
  const count = STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.length;
  return Object.freeze(
    STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((spec, idx) => {
      const program = createBrushStudioV6Program(spec.recipeId);
      const product = createBrushStudioV6ProductBrush(program);
      // 슬롯 1번이 selectQuickBrushes 정렬에서 가장 앞에 오도록 단조 감소 시각을 부여한다.
      const timestamp = baseTimestampMs + (count - idx) * 1000;
      return Object.freeze({
        ...product,
        id: spec.savedId,
        sourcePresetId: spec.catalogId,
        sourcePresetName: program.name,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastUsedAt: timestamp,
        pinned: true,
      });
    }),
  );
}

export interface StudioFavoriteSlotPinResult {
  readonly status: "pinned-sqlite" | "pinned-storage" | "memory-only";
  readonly pinnedCount: number;
  readonly quickShelfIds: readonly string[];
  readonly brushes: readonly StudioSavedBrush[];
}

/**
 * 주입된 `BrushLibraryStorage`에 경쟁사 패리티 플래그십 6종을 멱등(idempotent)하게 고정 배치한다.
 * 기존 사용자 저장 브러시는 절대 삭제하지 않으며 동일 슬롯 ID만 최신 검증 영수증으로 갱신한다.
 */
export function pinStudioCompetitorFavoritesToBrushLibrary(
  storage: BrushLibraryStorage | null | undefined,
  baseTimestampMs = 1_762_950_000_000,
): StudioFavoriteSlotPinResult {
  const slotBrushes = buildStudioCompetitorFavoriteSlotBrushes(baseTimestampMs);
  if (!storage) {
    const quick = selectQuickBrushes(slotBrushes);
    return {
      status: "memory-only",
      pinnedCount: slotBrushes.length,
      quickShelfIds: quick.map((b) => b.id),
      brushes: slotBrushes,
    };
  }
  const saved = saveBrushBatchWithResult(storage, slotBrushes);
  if (saved.status !== "saved" && saved.status !== "partial") {
    const quick = selectQuickBrushes(slotBrushes);
    return {
      status: "memory-only",
      pinnedCount: slotBrushes.length,
      quickShelfIds: quick.map((b) => b.id),
      brushes: slotBrushes,
    };
  }
  const quick = selectQuickBrushes(saved.brushes);
  return {
    status: "pinned-storage",
    pinnedCount: slotBrushes.length,
    quickShelfIds: quick.map((b) => b.id),
    brushes: saved.brushes,
  };
}

/**
 * 실제 제품 SQLite 브러시 저장소(가능한 경우)와 브라우저 로컬 저장소에 플래그십 즐겨찾기 슬롯을 고정 배치한다.
 */
export async function pinStudioCompetitorFavoritesToProductRepository(
  fallbackStorage: BrushLibraryStorage | null | undefined = browserBrushLibraryStorage(),
): Promise<StudioFavoriteSlotPinResult> {
  const slotBrushes = buildStudioCompetitorFavoriteSlotBrushes();
  try {
    const { openProductBrushLibraryRepository } = await loadStudioBrushLibrarySqliteRepository();
    const opened = await openProductBrushLibraryRepository();
    if (opened.authority === "sqlite") {
      for (const brush of slotBrushes) {
        await opened.repository.put(brush);
      }
      pinStudioCompetitorFavoritesToBrushLibrary(fallbackStorage);
      return {
        status: "pinned-sqlite",
        pinnedCount: slotBrushes.length,
        quickShelfIds: slotBrushes.map((b) => b.id),
        brushes: slotBrushes,
      };
    }
  } catch {
    // SQLite/OPFS 미지원 테스트·세션 환경에서는 로컬 스토리지 폴백으로 안전하게 고정한다.
  }
  return pinStudioCompetitorFavoritesToBrushLibrary(fallbackStorage);
}
