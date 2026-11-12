import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { loadStudioBrushLibrarySqliteRepository } from "../studio-page-editor-runtime-loaders";

import {
  browserBrushLibraryStorage,
  brushActivityAt,
  brushMatchesSnapshot,
  DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  deleteBrush,
  readBrushLibrary,
  sanitizeBrushSnapshot,
  saveBrushBatchWithResult,
  selectQuickBrushes,
  type BrushLibraryReadStatus,
  type BrushLibraryStorage,
  type StudioSavedBrush,
} from "./studio-brush-library";
import {
  emptyStudioBrushSlots,
  normalizeStudioBrushSlot,
  normalizeStudioBrushSlotsState,
  STUDIO_BRUSH_SLOT_COUNT,
  type StudioBrushSlotsState,
} from "./studio-brush-slots";
import { studioV6BrushCatalogId, studioV6RecipeIdFromCatalogId } from "./studio-brush-v6-id";
import { planStudioMaterialBrush } from "./studio-material-brush-runtime";

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
      catalogId: studioV6BrushCatalogId("krita-impasto-fan-bristle"),
      workflowRoleKo: "밀도 마감 · 원심 유화 믹서",
      workflowRoleEn: "Impasto Finish · Fan-Bristle Mixer",
    }),
  ]);

const FAVORITE_SPEC_BY_SAVED_ID = new Map<string, StudioCompetitorFavoriteSlotSpec>(
  STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((spec) => [spec.savedId, spec]),
);
const FAVORITE_SPEC_BY_CATALOG_ID = new Map<string, StudioCompetitorFavoriteSlotSpec>(
  STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((spec) => [spec.catalogId, spec]),
);

export function studioCompetitorFavoriteSlotBySavedId(
  id: unknown,
): StudioCompetitorFavoriteSlotSpec | null {
  return typeof id === "string" ? FAVORITE_SPEC_BY_SAVED_ID.get(id) ?? null : null;
}

export function studioCompetitorFavoriteSlotByCatalogId(
  catalogId: unknown,
): StudioCompetitorFavoriteSlotSpec | null {
  return typeof catalogId === "string"
    ? FAVORITE_SPEC_BY_CATALOG_ID.get(catalogId) ?? null
    : null;
}

export interface StudioFavoriteSlotPinOptions {
  /**
   * true이면 기존 슬롯에 사용자가 덧입힌 두께·색상·보정 변경까지 초기 레시피 기본값으로 되돌린다.
   * 기본값(false)은 기존 사용자 커스터마이징과 생성 시각을 보존한 채 1~6번 순서와 무폴백 영수증만 복원한다.
   */
  readonly resetCustomizations?: boolean;
  readonly nowMs?: number;
}

export function resolveFavoriteSlotAnchorTimestamp(
  baseTimestampMs: number,
  existingBrushes: readonly StudioSavedBrush[] = [],
): number {
  const safeBase = Number.isFinite(baseTimestampMs) ? Math.trunc(baseTimestampMs) : Date.now();
  let maxExisting = 0;
  for (const item of existingBrushes) {
    const candidate = Math.max(
      Number.isFinite(brushActivityAt(item)) ? brushActivityAt(item) : 0,
      Number.isFinite(item.createdAt) ? item.createdAt : 0,
      Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
    );
    if (candidate > maxExisting) maxExisting = candidate;
  }
  return Math.max(safeBase, maxExisting + 1_000);
}

/**
 * 6종의 플래그십 V6/V7.4 레시피를 실제 원고 캔버스 `StudioSavedBrush` 고정(`pinned: true`) 스냅샷으로 생성한다.
 * 모든 브러시는 무폴백(`fallbackPolicy === "none"`) 머티리얼 실행 영수증을 내장하여 오프라인·협업 리플레이에서도 동일하게 동작한다.
 */
export function buildStudioCompetitorFavoriteSlotBrushes(
  baseTimestampMs = 1_762_950_000_000,
): readonly StudioSavedBrush[] {
  const safeBase = Number.isFinite(baseTimestampMs) ? Math.trunc(baseTimestampMs) : 1_762_950_000_000;
  const count = STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.length;
  return Object.freeze(
    STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.map((spec, idx) => {
      const program = createBrushStudioV6Program(spec.recipeId);
      const product = createBrushStudioV6ProductBrush(program);
      // 슬롯 1번이 selectQuickBrushes 정렬에서 가장 앞에 오도록 단조 감소 시각을 부여한다.
      const timestamp = safeBase + (count - idx) * 1_000;
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

function hasValidV6MaterialReceipt(brush: StudioSavedBrush): boolean {
  if (brush.enginePrograms?.material?.runtime?.fallbackPolicy !== "none") {
    return false;
  }
  try {
    const marks = planStudioMaterialBrush({
      points: [8, 16, 28, 12, 48, 18],
      pressures: [0.42, 0.82, 0.28],
      stroke: brush.color,
      strokeWidth: brush.strokeWidth,
      opacity: brush.brushOpacity,
      brushEnginePrograms: brush.enginePrograms ?? undefined,
    });
    return Array.isArray(marks) && marks.length > 0;
  } catch {
    return false;
  }
}

function isUnmodifiedCanonicalDuplicate(
  existing: StudioSavedBrush,
  canonical: StudioSavedBrush,
): boolean {
  if (existing.id === canonical.id) return false;
  if (Object.hasOwn(existing, "originalSource")) return false;
  if (existing.sourcePresetId !== canonical.sourcePresetId) return false;
  if (existing.name.trim() !== canonical.name.trim()) return false;
  return brushMatchesSnapshot(existing, canonical);
}

export interface ReconciledFavoriteSlotLibrary {
  readonly slotBrushes: readonly StudioSavedBrush[];
  readonly collapsedDuplicateIds: readonly string[];
  readonly preservedCustomCount: number;
}

/**
 * 기존 라이브러리와 플래그십 6종을 정합시킨다:
 * - 이미 존재하는 동일 `savedId` 슬롯은 `createdAt`과 사용자 커스텀 스칼라(색상·두께·농도·손떨림 보정·이름)를 보존하면서
 *   무폴백 V6/V7.4 영수증과 1→6 정렬 타임스탬프만 안전하게 복원한다(`resetCustomizations: true`면 공장 초기화).
 * - 다른 ID로 중복 저장된 **완전 동일 무수정 복제본**(`sourcePresetId`·이름·스냅샷 일치)만 단일 정규 슬롯으로 병합해
 *   빠른 선반(8슬롯) 중복 점유를 막고, 사용자가 이름·두께·색상·동역학을 바꾼 프리셋이나 외부 임포트 브러시는 100% 보존한다.
 */
export function reconcileStudioCompetitorFavoriteLibrary(
  existingBrushes: readonly StudioSavedBrush[],
  baseTimestampMs = Date.now(),
  options: StudioFavoriteSlotPinOptions = {},
): ReconciledFavoriteSlotLibrary {
  const anchorMs = resolveFavoriteSlotAnchorTimestamp(baseTimestampMs, existingBrushes);
  const canonicalSlots = buildStudioCompetitorFavoriteSlotBrushes(anchorMs);
  const existingSlotById = new Map<string, StudioSavedBrush>();
  for (const brush of existingBrushes) {
    if (FAVORITE_SPEC_BY_SAVED_ID.has(brush.id) && !existingSlotById.has(brush.id)) {
      existingSlotById.set(brush.id, brush);
    }
  }

  const collapsedDuplicateIds: string[] = [];
  let preservedCustomCount = 0;
  const canonicalByCatalogId = new Map<string, StudioSavedBrush>(
    canonicalSlots.map((slot) => [slot.sourcePresetId ?? "", slot]),
  );

  for (const brush of existingBrushes) {
    if (FAVORITE_SPEC_BY_SAVED_ID.has(brush.id)) continue;
    const matchedCanonical = brush.sourcePresetId
      ? canonicalByCatalogId.get(brush.sourcePresetId) ?? null
      : null;
    if (matchedCanonical && isUnmodifiedCanonicalDuplicate(brush, matchedCanonical)) {
      collapsedDuplicateIds.push(brush.id);
    } else {
      preservedCustomCount += 1;
    }
  }

  const slotBrushes = canonicalSlots.map((canonical) => {
    const existing = existingSlotById.get(canonical.id);
    if (!existing) return canonical;
    if (options.resetCustomizations) {
      return Object.freeze({
        ...canonical,
        createdAt: existing.createdAt,
      });
    }
    const { snapshot: safeExisting } = sanitizeBrushSnapshot(existing);
    const keepExistingReceipt = hasValidV6MaterialReceipt({
      ...existing,
      ...safeExisting,
    });
    const trimmedName = existing.name.trim();
    return Object.freeze({
      ...canonical,
      ...safeExisting,
      id: canonical.id,
      name: trimmedName.length > 0 ? trimmedName : canonical.name,
      sourcePresetId: canonical.sourcePresetId,
      sourcePresetName: canonical.sourcePresetName,
      enginePrograms: keepExistingReceipt
        ? safeExisting.enginePrograms
        : canonical.enginePrograms,
      brushDynamics: keepExistingReceipt
        ? safeExisting.brushDynamics
        : canonical.brushDynamics,
      createdAt: existing.createdAt,
      updatedAt: canonical.updatedAt,
      lastUsedAt: canonical.lastUsedAt,
      pinned: true,
    });
  });

  return {
    slotBrushes,
    collapsedDuplicateIds,
    preservedCustomCount,
  };
}

/**
 * 숫자 단축키(`1`~`6`)로 즉시 호출되는 `StudioBrushSlotsState`에 플래그십 6종을 매핑한다.
 * 기본적으로 비어 있는 슬롯이나 기존 플래그십 슬롯만 갱신하며, 사용자가 다른 브러시를 지정한 슬롯은 보존한다.
 */
export function buildStudioCompetitorFavoriteQuickSlotsState(): StudioBrushSlotsState {
  const slotBrushes = buildStudioCompetitorFavoriteSlotBrushes();
  return {
    slots: Array.from({ length: STUDIO_BRUSH_SLOT_COUNT }, (_, index) => {
      const brush = slotBrushes[index];
      return brush ? normalizeStudioBrushSlot(brush) : null;
    }),
  };
}

export function syncStudioCompetitorFavoritesToQuickSlotsState(
  currentState: StudioBrushSlotsState | null | undefined,
  options: { readonly overwriteOccupied?: boolean } = {},
): StudioBrushSlotsState {
  const normalizedCurrent = currentState
    ? normalizeStudioBrushSlotsState(currentState)
    : emptyStudioBrushSlots();
  const targetSlots = buildStudioCompetitorFavoriteQuickSlotsState().slots;
  const nextSlots = normalizedCurrent.slots.map((existing, index) => {
    const candidate = targetSlots[index] ?? null;
    if (!candidate) return existing;
    if (options.overwriteOccupied || existing === null) return candidate;
    if (existing.sourcePresetId && FAVORITE_SPEC_BY_CATALOG_ID.has(existing.sourcePresetId)) {
      return candidate;
    }
    return existing;
  });
  return { slots: nextSlots };
}

export type StudioFavoriteBrushRecoveryStatus =
  | "ok"
  | "rebuilt-v6-receipt"
  | "sanitized-snapshot"
  | "fallback-safe-pen";

export interface StudioFavoriteBrushRecoveryResult {
  readonly brush: StudioSavedBrush;
  readonly status: StudioFavoriteBrushRecoveryStatus;
  readonly adjustedFields: readonly string[];
}

function resolveKnownV6RecipeId(brush: Partial<StudioSavedBrush>): string | null {
  const bySlot = studioCompetitorFavoriteSlotBySavedId(brush.id);
  if (bySlot) return bySlot.recipeId;
  const byCatalog = studioCompetitorFavoriteSlotByCatalogId(brush.sourcePresetId);
  if (byCatalog) return byCatalog.recipeId;
  return studioV6RecipeIdFromCatalogId(brush.sourcePresetId);
}

export function createSafeFallbackCanvasBrush(
  raw: Partial<StudioSavedBrush> | null | undefined,
): StudioSavedBrush {
  const { snapshot } = sanitizeBrushSnapshot({
    ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
    color: raw?.color,
    strokeWidth: raw?.strokeWidth,
    brushOpacity: raw?.brushOpacity,
    brushId: DEFAULT_STUDIO_BRUSH_SNAPSHOT.brushId,
    enginePrograms: null,
  });
  const now = Date.now();
  return {
    id: typeof raw?.id === "string" && raw.id.trim() ? raw.id : "fallback:safe-pen",
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : "복구 기본 펜",
    createdAt: typeof raw?.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: now,
    pinned: raw?.pinned === true,
    lastUsedAt: typeof raw?.lastUsedAt === "number" && Number.isFinite(raw.lastUsedAt) ? raw.lastUsedAt : now,
    ...snapshot,
  };
}

/**
 * 저장 브러시를 원고 캔버스에 적용하기 전에 손상된 스냅샷이나 깨진 V6/V7.4 머티리얼 영수증을 자가 복구한다.
 * 기존 코어·팩·임포트 프리셋(`pen`, `gpen`, `watercolor`, `essentials:*`, `.abr`, `.sut` 등)은 그대로 호환 보존한다.
 */
export function recoverStudioBrushForCanvasApply(
  brush: StudioSavedBrush,
): StudioFavoriteBrushRecoveryResult {
  if (!brush || typeof brush !== "object") {
    return {
      brush: createSafeFallbackCanvasBrush(null),
      status: "fallback-safe-pen",
      adjustedFields: ["brush"],
    };
  }

  const { snapshot, adjustedFields } = sanitizeBrushSnapshot(brush);
  const sanitizedBrush: StudioSavedBrush = {
    ...(brush.originalSource ? { originalSource: brush.originalSource } : {}),
    id: typeof brush.id === "string" && brush.id.trim() ? brush.id : "recovered-brush",
    name: typeof brush.name === "string" && brush.name.trim() ? brush.name.trim() : "복구된 브러시",
    createdAt: Number.isFinite(brush.createdAt) ? brush.createdAt : Date.now(),
    updatedAt: Number.isFinite(brush.updatedAt) ? brush.updatedAt : Date.now(),
    pinned: brush.pinned === true,
    lastUsedAt:
      typeof brush.lastUsedAt === "number" && Number.isFinite(brush.lastUsedAt)
        ? brush.lastUsedAt
        : null,
    ...snapshot,
  };

  const recipeId = resolveKnownV6RecipeId(brush);
  if (recipeId) {
    if (!hasValidV6MaterialReceipt(sanitizedBrush)) {
      try {
        const program = createBrushStudioV6Program(recipeId);
        const canonical = createBrushStudioV6ProductBrush(program);
        const { snapshot: reSanitized } = sanitizeBrushSnapshot({
          ...sanitizedBrush,
          brushId: canonical.brushId,
          brushDynamics: canonical.brushDynamics,
          enginePrograms: canonical.enginePrograms,
        });
        return {
          brush: {
            ...sanitizedBrush,
            ...reSanitized,
            sourcePresetId: sanitizedBrush.sourcePresetId ?? studioV6BrushCatalogId(recipeId),
            sourcePresetName: sanitizedBrush.sourcePresetName ?? program.name,
          },
          status: "rebuilt-v6-receipt",
          adjustedFields: [...new Set([...adjustedFields, "enginePrograms"])],
        };
      } catch {
        return {
          brush: createSafeFallbackCanvasBrush(sanitizedBrush),
          status: "fallback-safe-pen",
          adjustedFields: [...new Set([...adjustedFields, "brushId", "enginePrograms"])],
        };
      }
    }
  }

  return {
    brush: sanitizedBrush,
    status: adjustedFields.length > 0 ? "sanitized-snapshot" : "ok",
    adjustedFields,
  };
}

export interface StudioCanvasApplyExecutionResult {
  readonly appliedBrush: StudioSavedBrush | null;
  readonly status: StudioFavoriteBrushRecoveryStatus | "apply-failed";
  readonly adjustedFields: readonly string[];
  readonly error?: unknown;
}

/**
 * 원고 캔버스 `onApply` 콜백 호출 시 자가 복구를 선행하고, 콜백 내부에서 런타임 예외가 발생하더라도
 * 안전 기본 펜 스냅샷으로 2차 폴백하여 드로잉 세션이 멈추지 않도록 보장한다.
 */
export function applyStudioSavedBrushWithRecovery(
  brush: StudioSavedBrush,
  onApply: (resolved: StudioSavedBrush) => void,
): StudioCanvasApplyExecutionResult {
  const recovered = recoverStudioBrushForCanvasApply(brush);
  try {
    onApply(recovered.brush);
    return {
      appliedBrush: recovered.brush,
      status: recovered.status,
      adjustedFields: recovered.adjustedFields,
    };
  } catch (primaryError) {
    const safeFallback = createSafeFallbackCanvasBrush(recovered.brush);
    try {
      onApply(safeFallback);
      return {
        appliedBrush: safeFallback,
        status: "fallback-safe-pen",
        adjustedFields: [...new Set([...recovered.adjustedFields, "fallbackSafePen"])],
        error: primaryError,
      };
    } catch (secondaryError) {
      return {
        appliedBrush: null,
        status: "apply-failed",
        adjustedFields: recovered.adjustedFields,
        error: secondaryError,
      };
    }
  }
}

export type StudioFavoriteSlotPinStatus =
  | "pinned-sqlite"
  | "pinned-memory-session"
  | "pinned-storage"
  | "memory-only";

export interface StudioFavoriteSlotPinResult {
  readonly status: StudioFavoriteSlotPinStatus;
  readonly durable: boolean;
  readonly pinnedCount: number;
  readonly collapsedDuplicateCount: number;
  readonly quickShelfIds: readonly string[];
  readonly brushes: readonly StudioSavedBrush[];
  readonly failureCode?: BrushLibraryReadStatus | "storage-error" | "repository-error";
}

/**
 * 주입된 `BrushLibraryStorage`에 경쟁사 패리티 플래그십 6종을 멱등(idempotent)하게 고정 배치한다.
 * 기존 사용자 커스텀 브러시는 절대 삭제하지 않으며, 손상된 저장소는 덮어쓰지 않고 `memory-only` 복구 상태로 반환한다.
 */
export function pinStudioCompetitorFavoritesToBrushLibrary(
  storage: BrushLibraryStorage | null | undefined,
  baseTimestampMs = 1_762_950_000_000,
  options: StudioFavoriteSlotPinOptions = {},
): StudioFavoriteSlotPinResult {
  if (!storage) {
    const slotBrushes = buildStudioCompetitorFavoriteSlotBrushes(baseTimestampMs);
    const quick = selectQuickBrushes(slotBrushes);
    return {
      status: "memory-only",
      durable: false,
      pinnedCount: slotBrushes.length,
      collapsedDuplicateCount: 0,
      quickShelfIds: quick.map((b) => b.id),
      brushes: slotBrushes,
      failureCode: "unavailable",
    };
  }

  const read = readBrushLibrary(storage);
  if (read.status !== "ok" && read.status !== "empty") {
    const fallbackSlots = buildStudioCompetitorFavoriteSlotBrushes(baseTimestampMs);
    const quick = selectQuickBrushes(fallbackSlots);
    return {
      status: "memory-only",
      durable: false,
      pinnedCount: fallbackSlots.length,
      collapsedDuplicateCount: 0,
      quickShelfIds: quick.map((b) => b.id),
      brushes: fallbackSlots,
      failureCode: read.status,
    };
  }

  const reconciled = reconcileStudioCompetitorFavoriteLibrary(
    read.brushes,
    options.nowMs ?? baseTimestampMs,
    options,
  );
  const saved = saveBrushBatchWithResult(storage, reconciled.slotBrushes);
  if (saved.status !== "saved" && saved.status !== "partial") {
    const quick = selectQuickBrushes(reconciled.slotBrushes);
    return {
      status: "memory-only",
      durable: false,
      pinnedCount: reconciled.slotBrushes.length,
      collapsedDuplicateCount: 0,
      quickShelfIds: quick.map((b) => b.id),
      brushes: reconciled.slotBrushes,
      failureCode: "storage-error",
    };
  }

  let finalBrushes = saved.brushes;
  let collapsedCount = 0;
  for (const duplicateId of reconciled.collapsedDuplicateIds) {
    const afterDelete = deleteBrush(storage, duplicateId);
    if (afterDelete.length < finalBrushes.length) {
      finalBrushes = afterDelete;
      collapsedCount += 1;
    }
  }

  const quick = selectQuickBrushes(finalBrushes);
  return {
    status: "pinned-storage",
    durable: true,
    pinnedCount: reconciled.slotBrushes.length,
    collapsedDuplicateCount: collapsedCount,
    quickShelfIds: quick.map((b) => b.id),
    brushes: finalBrushes,
  };
}

let inFlightRepositoryPin: Promise<StudioFavoriteSlotPinResult> | null = null;

async function commitFavoritesToProductRepositoryInternal(
  fallbackStorage: BrushLibraryStorage | null | undefined,
  options: StudioFavoriteSlotPinOptions,
): Promise<StudioFavoriteSlotPinResult> {
  const effectiveNowMs = options.nowMs ?? Date.now();
  try {
    const {
      notifyStudioBrushLibraryChanged,
      openProductBrushLibraryRepository,
      readAllBrushesFromRepository,
    } = await loadStudioBrushLibrarySqliteRepository();
    const opened = await openProductBrushLibraryRepository();
    const existing = await readAllBrushesFromRepository(opened.repository);
    const reconciled = reconcileStudioCompetitorFavoriteLibrary(
      existing,
      effectiveNowMs,
      options,
    );
    await opened.repository.putMany(reconciled.slotBrushes);
    let collapsedCount = 0;
    for (const duplicateId of reconciled.collapsedDuplicateIds) {
      const removed = await opened.repository.delete(duplicateId);
      if (removed) collapsedCount += 1;
    }
    const persisted = await readAllBrushesFromRepository(opened.repository);
    notifyStudioBrushLibraryChanged();

    // 레거시/테스트 스토리지 시임도 함께 동기화(실패해도 SQLite/세션 권위 결과는 보존).
    if (fallbackStorage) {
      pinStudioCompetitorFavoritesToBrushLibrary(fallbackStorage, effectiveNowMs, options);
    }

    const quick = selectQuickBrushes(persisted);
    const authorityStatus =
      opened.authority === "sqlite" ? "pinned-sqlite" : "pinned-memory-session";
    return {
      status: authorityStatus,
      durable: opened.authority === "sqlite",
      pinnedCount: reconciled.slotBrushes.length,
      collapsedDuplicateCount: collapsedCount,
      quickShelfIds: quick.map((b) => b.id),
      brushes: persisted,
    };
  } catch {
    const fallbackResult = pinStudioCompetitorFavoritesToBrushLibrary(
      fallbackStorage,
      effectiveNowMs,
      options,
    );
    if (fallbackResult.status === "memory-only" && !fallbackResult.failureCode) {
      return { ...fallbackResult, failureCode: "repository-error" };
    }
    return fallbackResult;
  }
}

/**
 * 실제 제품 SQLite/메모리 세션 브러시 저장소와 로컬 스토리지 폴백에 플래그십 즐겨찾기 6종을
 * 단일 비행(single-flight) 직렬화로 중복 없이 고정·복원한다.
 */
export async function pinStudioCompetitorFavoritesToProductRepository(
  fallbackStorage: BrushLibraryStorage | null | undefined = browserBrushLibraryStorage(),
  options?: StudioFavoriteSlotPinOptions,
): Promise<StudioFavoriteSlotPinResult> {
  const usesDefaultSharedCall = fallbackStorage === browserBrushLibraryStorage() && !options;
  if (usesDefaultSharedCall && inFlightRepositoryPin) {
    return inFlightRepositoryPin;
  }
  const run = commitFavoritesToProductRepositoryInternal(fallbackStorage, options ?? {});
  if (usesDefaultSharedCall) {
    inFlightRepositoryPin = run;
    void run.finally(() => {
      if (inFlightRepositoryPin === run) {
        inFlightRepositoryPin = null;
      }
    });
  }
  return run;
}
