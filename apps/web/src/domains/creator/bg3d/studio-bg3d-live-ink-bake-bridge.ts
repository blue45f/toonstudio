/**
 * 3D 스테이지 원클릭 '원고 컷에 바로 굽기' & 실시간 Split-Wipe Live Ink 브리지 (AC-017 / F08).
 *
 * 단순 라우트 이동 링크나 가짜 로컬 토글이 아니라,
 * 실제 3D 렌더 캡처 결과·카메라 메타데이터·Rights BOM 출처 ID를
 * 비파괴 2D 원고 컷 레이어 페이로드로 조립하고 검증한다.
 */

export type Stage3DMode = "build" | "pose" | "shot" | "live-ink";
export type LiveInkPreviewMode = "shaded-3d" | "split-wipe" | "live-ink-only";

export interface Scene3DCaptureSnapshot {
  readonly sceneId: string;
  readonly cameraId: string;
  readonly stage: Stage3DMode;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly inkPassRef: string;
  readonly shadedPassRef: string;
  readonly inkLineWeightPx: number;
  readonly assetIds: readonly string[];
  readonly capturedAt: string;
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
  readonly rightsBomAssetIds: readonly string[];
  readonly createdAt: string;
}

export type BakeToCutResult =
  | { readonly ok: true; readonly layer: BakedManuscriptCutLayer }
  | { readonly ok: false; readonly code: "INVALID_DIMENSIONS" | "MISSING_CAPTURE" | "INVALID_TARGET"; readonly messageKo: string };

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

/**
 * 3D 컷 캡처 스냅샷을 비파괴 2D 원고 컷 레이어 페이로드로 변환한다.
 * Rights BOM 추적을 위해 장면에 포함된 모든 3D 에셋 ID를 중복 제거해 보존한다.
 */
export function buildBakedManuscriptCutLayer(input: {
  readonly capture: Scene3DCaptureSnapshot;
  readonly targetDocumentId: string;
  readonly targetCutIndex: number;
  readonly previewMode: LiveInkPreviewMode;
  readonly splitWipeRatio: number;
}): BakeToCutResult {
  const { capture, targetDocumentId, targetCutIndex } = input;
  if (!targetDocumentId.trim() || targetCutIndex < 0) {
    return {
      ok: false,
      code: "INVALID_TARGET",
      messageKo: "유효한 대상 원고 문서와 컷 번호를 먼저 선택해 주세요.",
    };
  }
  if (capture.widthPx <= 0 || capture.heightPx <= 0) {
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
      rightsBomAssetIds: Object.freeze(uniqueAssets),
      createdAt: capture.capturedAt,
    }),
  };
}
