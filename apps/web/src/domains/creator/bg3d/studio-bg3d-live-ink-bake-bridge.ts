/**
 * 3D 스테이지 원클릭 '원고 컷에 바로 굽기' & 실시간 Split-Wipe Live Ink 브리지 (AC-004 / F08).
 *
 * 단순 라우트 이동 링크나 가짜 로컬 토글이 아니라,
 * 실제 WebGL/Three.js 멀티패스 캡처 결과(선화·음영·깊이·AO)·3D 카메라·조명/분위기 프리셋·
 * Rights BOM 출처 ID를 비파괴 2D 원고 컷 레이어 페이로드로 조립·영속화하고,
 * 2D 에디터 삽입 및 3D 재촬영 복원(Re-shoot Restore) 계약을 제공한다.
 */

import type { StudioBg3dWebtoonAtmospherePresetId } from "./studio-bg3d-lighting-studio";

export type Stage3DMode = "build" | "pose" | "shot" | "live-ink";
export type LiveInkPreviewMode = "shaded-3d" | "split-wipe" | "live-ink-only";

export interface Scene3DCaptureCameraSnapshot {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovDegrees: number;
}

export interface Scene3DCaptureLightingSummary {
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  readonly keyColor: string;
  readonly keyIntensity: number;
  readonly exposure: number;
  readonly fogActive: boolean;
  readonly fogDensity: number;
}

export interface Scene3DCaptureInkAudit {
  readonly strategy: string;
  readonly expectedOnPageInkPx: number;
  readonly measuredMedianInkSpanPx: number;
  readonly passesInkWeightInvariant: boolean;
}

export interface Scene3DCaptureSnapshot {
  readonly sceneId: string;
  readonly cameraId: string;
  readonly stage: Stage3DMode;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly inkPassRef: string;
  readonly shadedPassRef: string;
  readonly depthPassRef?: string | null;
  readonly aoPassRef?: string | null;
  readonly normalPassRef?: string | null;
  readonly inkLineWeightPx: number;
  readonly assetIds: readonly string[];
  readonly capturedAt: string;
  readonly camera?: Scene3DCaptureCameraSnapshot;
  readonly atmospherePresetId?: StudioBg3dWebtoonAtmospherePresetId | null;
  readonly lightingSummary?: Scene3DCaptureLightingSummary;
  readonly inkAudit?: Scene3DCaptureInkAudit;
  readonly sceneDocumentJson?: string | null;
}

export interface BakedManuscriptCutLayer {
  readonly layerId: string;
  readonly targetDocumentId: string;
  readonly targetCutIndex: number;
  readonly nonDestructive: true;
  readonly sourceSceneId: string;
  readonly sourceCameraId: string;
  readonly previewMode: LiveInkPreviewMode;
  readonly splitWipeRatio: number;
  readonly inkLineWeightPx: number;
  readonly inkPassRef: string;
  readonly shadedPassRef: string;
  readonly depthPassRef?: string | null;
  readonly aoPassRef?: string | null;
  readonly normalPassRef?: string | null;
  readonly rightsBomAssetIds: readonly string[];
  readonly createdAt: string;
  readonly camera?: Scene3DCaptureCameraSnapshot;
  readonly atmospherePresetId?: StudioBg3dWebtoonAtmospherePresetId | null;
  readonly lightingSummary?: Scene3DCaptureLightingSummary;
  readonly inkAudit?: Scene3DCaptureInkAudit;
  readonly sceneDocumentJson?: string | null;
}

export interface ReshootRestorePayload {
  readonly layerId: string;
  readonly sourceSceneId: string;
  readonly sourceCameraId: string;
  readonly camera: Scene3DCaptureCameraSnapshot | null;
  readonly atmospherePresetId: StudioBg3dWebtoonAtmospherePresetId | null;
  readonly inkLineWeightPx: number;
  readonly rightsBomAssetIds: readonly string[];
  readonly sceneDocumentJson: string | null;
}

export type BakeToCutResult =
  | { readonly ok: true; readonly layer: BakedManuscriptCutLayer }
  | { readonly ok: false; readonly code: "INVALID_DIMENSIONS" | "MISSING_CAPTURE" | "INVALID_TARGET"; readonly messageKo: string };

export const STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX = "toonstudio:bg3d:baked-manuscript-cuts:v1:";
export const STUDIO_BG3D_BAKED_CUT_HANDOFF_EVENT = "toonstudio:bg3d:baked-manuscript-cut";

const MAX_PERSISTED_LAYERS_PER_DOCUMENT = 24;
const inMemoryBakedCutRegistry = new Map<string, readonly BakedManuscriptCutLayer[]>();

export function clampSplitWipeRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return Number(ratio.toFixed(3));
}

export function clampInkLineWeight(weightPx: number): number {
  if (!Number.isFinite(weightPx)) return 1.5;
  return Number(Math.max(0.25, Math.min(8, weightPx)).toFixed(2));
}

function freezeCameraSnapshot(
  camera: Scene3DCaptureCameraSnapshot | undefined,
): Scene3DCaptureCameraSnapshot | undefined {
  if (!camera) return undefined;
  return Object.freeze({
    position: Object.freeze([camera.position[0], camera.position[1], camera.position[2]] as const),
    target: Object.freeze([camera.target[0], camera.target[1], camera.target[2]] as const),
    fovDegrees: Number.isFinite(camera.fovDegrees) ? camera.fovDegrees : 50,
  });
}

/**
 * 3D 컷 캡처 스냅샷을 비파괴 2D 원고 컷 레이어 페이로드로 변환한다.
 * Rights BOM 추적을 위해 장면에 포함된 모든 3D 에셋 ID를 중복 제거해 보존하고,
 * 3D 재촬영 복원을 위한 카메라·조명·분위기 프리셋 메타데이터를 함께 봉인한다.
 */
export function buildBakedManuscriptCutLayer(input: {
  readonly capture: Scene3DCaptureSnapshot;
  readonly targetDocumentId: string;
  readonly targetCutIndex: number;
  readonly previewMode: LiveInkPreviewMode;
  readonly splitWipeRatio: number;
}): BakeToCutResult {
  const { capture, targetDocumentId, targetCutIndex } = input;
  if (!targetDocumentId.trim() || !Number.isInteger(targetCutIndex) || targetCutIndex < 0) {
    return {
      ok: false,
      code: "INVALID_TARGET",
      messageKo: "유효한 대상 원고 문서와 컷 번호를 먼저 선택해 주세요.",
    };
  }
  if (!Number.isFinite(capture.widthPx) || !Number.isFinite(capture.heightPx) || capture.widthPx <= 0 || capture.heightPx <= 0) {
    return {
      ok: false,
      code: "INVALID_DIMENSIONS",
      messageKo: "3D 뷰포트 캡처 해상도가 유효하지 않습니다. 장면을 다시 렌더해 주세요.",
    };
  }
  if (!capture.inkPassRef.trim() || !capture.shadedPassRef.trim()) {
    return {
      ok: false,
      code: "MISSING_CAPTURE",
      messageKo: "선화(Live Ink) 또는 3D 음영 캡처 결과가 준비되지 않았습니다.",
    };
  }

  const uniqueAssets = Array.from(new Set(capture.assetIds.filter((id) => id.trim().length > 0)));
  const frozenCamera = freezeCameraSnapshot(capture.camera);

  return {
    ok: true,
    layer: Object.freeze({
      layerId: `baked-3d-${capture.sceneId}-${capture.cameraId}-cut${targetCutIndex}`,
      targetDocumentId: targetDocumentId.trim(),
      targetCutIndex,
      nonDestructive: true,
      sourceSceneId: capture.sceneId,
      sourceCameraId: capture.cameraId,
      previewMode: input.previewMode,
      splitWipeRatio: clampSplitWipeRatio(input.splitWipeRatio),
      inkLineWeightPx: clampInkLineWeight(capture.inkLineWeightPx),
      inkPassRef: capture.inkPassRef,
      shadedPassRef: capture.shadedPassRef,
      ...(capture.depthPassRef !== undefined ? { depthPassRef: capture.depthPassRef } : {}),
      ...(capture.aoPassRef !== undefined ? { aoPassRef: capture.aoPassRef } : {}),
      ...(capture.normalPassRef !== undefined ? { normalPassRef: capture.normalPassRef } : {}),
      rightsBomAssetIds: Object.freeze(uniqueAssets),
      createdAt: capture.capturedAt,
      ...(frozenCamera ? { camera: frozenCamera } : {}),
      ...(capture.atmospherePresetId !== undefined ? { atmospherePresetId: capture.atmospherePresetId } : {}),
      ...(capture.lightingSummary ? { lightingSummary: Object.freeze({ ...capture.lightingSummary }) } : {}),
      ...(capture.inkAudit ? { inkAudit: Object.freeze({ ...capture.inkAudit }) } : {}),
      ...(capture.sceneDocumentJson !== undefined ? { sceneDocumentJson: capture.sceneDocumentJson } : {}),
    }),
  };
}

function defaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKeyForDocument(targetDocumentId: string): string {
  return `${STUDIO_BG3D_BAKED_CUT_STORAGE_KEY_PREFIX}${encodeURIComponent(targetDocumentId.trim())}`;
}

function isScopedBakedLayer(value: unknown, documentId: string): value is BakedManuscriptCutLayer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const layer = value as Partial<BakedManuscriptCutLayer>;
  return typeof layer.layerId === "string" && layer.layerId.length > 0
    && layer.targetDocumentId === documentId
    && typeof layer.targetCutIndex === "number" && Number.isInteger(layer.targetCutIndex) && layer.targetCutIndex >= 0
    && layer.nonDestructive === true
    && typeof layer.sourceSceneId === "string" && typeof layer.sourceCameraId === "string"
    && typeof layer.inkPassRef === "string" && layer.inkPassRef.length > 0
    && typeof layer.shadedPassRef === "string" && layer.shadedPassRef.length > 0
    && Array.isArray(layer.rightsBomAssetIds) && layer.rightsBomAssetIds.every(id => typeof id === "string")
    && typeof layer.createdAt === "string"
    && (layer.previewMode === "shaded-3d" || layer.previewMode === "split-wipe" || layer.previewMode === "live-ink-only")
    && typeof layer.splitWipeRatio === "number" && Number.isFinite(layer.splitWipeRatio)
    && typeof layer.inkLineWeightPx === "number" && Number.isFinite(layer.inkLineWeightPx);
}

function parsePersistedLayers(raw: string | null, documentId: string): readonly BakedManuscriptCutLayer[] | null {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(item => isScopedBakedLayer(item, documentId))) return null;
    return parsed.slice(0, MAX_PERSISTED_LAYERS_PER_DOCUMENT);
  } catch {
    return null;
  }
}

/**
 * 구워진 비파괴 3D 원고 컷 레이어를 문서 단위 영속 브리지에 기록하고
 * 2D 에디터 수신 이벤트를 발행한다.
 */
export function saveBakedManuscriptCutLayer(
  layer: BakedManuscriptCutLayer,
  storage: Storage | null = defaultStorage(),
): { readonly persistedToStorage: boolean; readonly totalLayers: number } {
  const docId = layer.targetDocumentId.trim();
  if (!docId || !isScopedBakedLayer(layer, docId)) return { persistedToStorage: false, totalLayers: 0 };
  const existing = listBakedManuscriptCutLayers(docId, storage);
  const next = [
    layer,
    ...existing.filter(
      (entry) => !(entry.layerId === layer.layerId && entry.targetCutIndex === layer.targetCutIndex),
    ),
  ].slice(0, MAX_PERSISTED_LAYERS_PER_DOCUMENT);
  inMemoryBakedCutRegistry.set(docId, Object.freeze(next));

  let persistedToStorage = false;
  if (storage) {
    const key = storageKeyForDocument(docId);
    try {
      if (parsePersistedLayers(storage.getItem(key), docId) !== null) {
        const serialized = JSON.stringify(next);
        storage.setItem(key, serialized);
        persistedToStorage = storage.getItem(key) === serialized;
      }
    } catch {
      // 저장 거부 때 이전 재촬영 사본을 잘라 덮지 않고 새 인계 사본은 메모리에 유지한다.
      persistedToStorage = false;
    }
  }

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(
        new CustomEvent<BakedManuscriptCutLayer>(STUDIO_BG3D_BAKED_CUT_HANDOFF_EVENT, {
          detail: layer,
        }),
      );
    } catch {
      // CustomEvent를 지원하지 않는 환경에서도 영속 저장은 성공으로 유지한다.
    }
  }

  return { persistedToStorage, totalLayers: next.length };
}

export function listBakedManuscriptCutLayers(
  targetDocumentId: string,
  storage: Storage | null = defaultStorage(),
): readonly BakedManuscriptCutLayer[] {
  const docId = targetDocumentId.trim();
  if (!docId) return [];
  const inMemory = inMemoryBakedCutRegistry.get(docId);
  if (inMemory && inMemory.length > 0) return inMemory;
  if (!storage) return [];
  try {
    const parsed = parsePersistedLayers(storage.getItem(storageKeyForDocument(docId)), docId) ?? [];
    if (parsed.length > 0) {
      inMemoryBakedCutRegistry.set(docId, Object.freeze(parsed));
    }
    return parsed;
  } catch {
    return [];
  }
}

export function getBakedManuscriptCutLayerForCut(
  targetDocumentId: string,
  targetCutIndex: number,
  storage: Storage | null = defaultStorage(),
): BakedManuscriptCutLayer | null {
  const layers = listBakedManuscriptCutLayers(targetDocumentId, storage);
  return layers.find((layer) => layer.targetCutIndex === targetCutIndex) ?? null;
}

export function clearBakedManuscriptCutLayers(
  targetDocumentId: string,
  storage: Storage | null = defaultStorage(),
): void {
  const docId = targetDocumentId.trim();
  if (!docId) return;
  inMemoryBakedCutRegistry.delete(docId);
  if (storage) {
    try {
      storage.removeItem(storageKeyForDocument(docId));
    } catch {
      // 스토리지 접근 실패는 무시한다.
    }
  }
}

/**
 * 2D 원고 컷에 구워진 비파괴 3D 레이어로부터 3D 재촬영 복원 페이로드를 추출한다.
 */
export function buildReshootRestorePayload(
  layer: BakedManuscriptCutLayer,
): ReshootRestorePayload {
  return Object.freeze({
    layerId: layer.layerId,
    sourceSceneId: layer.sourceSceneId,
    sourceCameraId: layer.sourceCameraId,
    camera: layer.camera ?? null,
    atmospherePresetId: layer.atmospherePresetId ?? null,
    inkLineWeightPx: layer.inkLineWeightPx,
    rightsBomAssetIds: layer.rightsBomAssetIds,
    sceneDocumentJson: layer.sceneDocumentJson ?? null,
  });
}
