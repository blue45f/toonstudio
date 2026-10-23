/**
 * 생산자 구조화 에러 해석 모듈 — linked3d 구간: studio-linked-3d-render-document 템플릿 서브코드 18종
 * + studio-linked-3d-save-projection 접두 2종·고정 문구 3종 (A4 D4 조건부 묶음, R17 설계 §6).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, detail, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * 기존 code 10종은 상위 분류로 유지하고, detail이 템플릿 단위 서브코드다.
 * 저장 투영은 throw 합성 지점에서 해석하는 집계자 예외라, 접두·고정 문구도 이 구간 키로 등록한다.
 * ko 값은 이관 전 생산자·투영 원문과 글자 단위 동일하고, en은 신규 번역이다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioLinked3dRenderValidationDetail } from "../studio-linked-3d-render-document";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.linked3d.documentCorrupt": "연결된 3D 렌더 인덱스가 손상되었습니다.",
  "studio.producerError.linked3d.stageCollectionMissing": "연결된 공유 3D Stage를 찾지 못했습니다.",
  "studio.producerError.linked3d.linkStageMissing": "3D 링크 {bundleId}의 Stage가 없습니다.",
  "studio.producerError.linked3d.dccSourceStageMissing": "DCC Shot {sourceShotId}의 원본 Stage가 없습니다.",
  "studio.producerError.linked3d.linkStageHashMismatch": "3D 링크 {bundleId}의 Stage 해시가 다릅니다.",
  "studio.producerError.linked3d.linkLayerSetMismatch": "3D 링크 {bundleId}의 전체 레이어 집합이 다릅니다.",
  "studio.producerError.linked3d.layerElementMissing": "3D 링크 레이어 {elementId}가 없습니다.",
  "studio.producerError.linked3d.layerRoleMismatch": "3D 링크 레이어 {elementId}의 역할이 다릅니다.",
  "studio.producerError.linked3d.linePassLocatorMismatch": "canonical line pass locator가 Canvas 레이어와 다릅니다.",
  "studio.producerError.linked3d.linkLayerPlacementMismatch": "3D 링크 {bundleId}의 레이어 배치가 일치하지 않습니다.",
  "studio.producerError.linked3d.sceneAnchorMissing": "3D 장면 원본 앵커가 없습니다.",
  "studio.producerError.linked3d.sceneAnchorDuplicated": "3D 장면 원본 앵커가 중복되었습니다.",
  "studio.producerError.linked3d.canvasStageHashMismatch": "Canvas 장면과 공유 Stage의 해시가 다릅니다.",
  "studio.producerError.linked3d.shotMissingInScene": "연결된 Shot {shotId}를 장면에서 찾지 못했습니다.",
  "studio.producerError.linked3d.passRevisionMismatch": "3D 링크 {bundleId}의 pass revision이 canonical Scene과 다릅니다.",
  "studio.producerError.linked3d.correctionProvenanceMismatch": "3D 링크 {bundleId}의 artist correction provenance가 다릅니다.",
  "studio.producerError.linked3d.reservedPassLocatorUnowned": "Canvas 요소 {elementId}의 reserved 3D pass locator가 page receipt에 귀속되지 않았습니다.",
  "studio.producerError.linked3d.reservedCorrectionUnowned": "Canvas correction {elementId}가 active 3D pass receipt에 귀속되지 않았습니다.",
  "studio.producerError.linked3d.saveProjection.reservedStatePrefix": "페이지 연결형 3D reserved 상태가 달라 저장하지 않았어요:",
  "studio.producerError.linked3d.saveProjection.authorityPrefix": "페이지 연결형 3D 렌더 권위가 달라 저장하지 않았어요:",
  "studio.producerError.linked3d.saveProjection.masterReservedUnsavable": "문서 마스터의 연결형 3D reserved 상태를 저장할 수 없어요.",
  "studio.producerError.linked3d.saveProjection.sharedStageCorrupt": "페이지 공유 3D 장면 연결이 손상되어 저장하지 않았어요.",
  "studio.producerError.linked3d.saveProjection.renderIndexCorrupt": "페이지 연결형 3D 렌더 인덱스가 손상되어 저장하지 않았어요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.linked3d.documentCorrupt": "The linked 3D render index is corrupted.",
  "studio.producerError.linked3d.stageCollectionMissing": "Could not find the linked shared 3D Stage.",
  "studio.producerError.linked3d.linkStageMissing": "There is no Stage for 3D link {bundleId}.",
  "studio.producerError.linked3d.dccSourceStageMissing": "There is no source Stage for DCC Shot {sourceShotId}.",
  "studio.producerError.linked3d.linkStageHashMismatch": "The Stage hash of 3D link {bundleId} differs.",
  "studio.producerError.linked3d.linkLayerSetMismatch": "The full layer set of 3D link {bundleId} differs.",
  "studio.producerError.linked3d.layerElementMissing": "There is no 3D link layer {elementId}.",
  "studio.producerError.linked3d.layerRoleMismatch": "The role of 3D link layer {elementId} differs.",
  "studio.producerError.linked3d.linePassLocatorMismatch": "The canonical line pass locator differs from the Canvas layer.",
  "studio.producerError.linked3d.linkLayerPlacementMismatch": "The layer placement of 3D link {bundleId} does not match.",
  "studio.producerError.linked3d.sceneAnchorMissing": "There is no original 3D scene anchor.",
  "studio.producerError.linked3d.sceneAnchorDuplicated": "The original 3D scene anchor is duplicated.",
  "studio.producerError.linked3d.canvasStageHashMismatch": "The Canvas scene hash differs from the shared Stage hash.",
  "studio.producerError.linked3d.shotMissingInScene": "Could not find the linked Shot {shotId} in the scene.",
  "studio.producerError.linked3d.passRevisionMismatch": "The pass revision of 3D link {bundleId} differs from the canonical Scene.",
  "studio.producerError.linked3d.correctionProvenanceMismatch": "The artist correction provenance of 3D link {bundleId} differs.",
  "studio.producerError.linked3d.reservedPassLocatorUnowned": "The reserved 3D pass locator of Canvas element {elementId} is not owned by the page receipt.",
  "studio.producerError.linked3d.reservedCorrectionUnowned": "Canvas correction {elementId} is not owned by the active 3D pass receipt.",
  "studio.producerError.linked3d.saveProjection.reservedStatePrefix": "The page linked 3D reserved state changed, so it was not saved:",
  "studio.producerError.linked3d.saveProjection.authorityPrefix": "The page linked 3D render authority changed, so it was not saved:",
  "studio.producerError.linked3d.saveProjection.masterReservedUnsavable": "The document master's linked 3D reserved state cannot be saved.",
  "studio.producerError.linked3d.saveProjection.sharedStageCorrupt": "The page shared 3D scene link is corrupted, so it was not saved.",
  "studio.producerError.linked3d.saveProjection.renderIndexCorrupt": "The page linked 3D render index is corrupted, so it was not saved.",
});

const LINKED3D_ERROR_KEYS: Readonly<Record<StudioLinked3dRenderValidationDetail, string>> = {
  documentCorrupt: "studio.producerError.linked3d.documentCorrupt",
  stageCollectionMissing: "studio.producerError.linked3d.stageCollectionMissing",
  linkStageMissing: "studio.producerError.linked3d.linkStageMissing",
  dccSourceStageMissing: "studio.producerError.linked3d.dccSourceStageMissing",
  linkStageHashMismatch: "studio.producerError.linked3d.linkStageHashMismatch",
  linkLayerSetMismatch: "studio.producerError.linked3d.linkLayerSetMismatch",
  layerElementMissing: "studio.producerError.linked3d.layerElementMissing",
  layerRoleMismatch: "studio.producerError.linked3d.layerRoleMismatch",
  linePassLocatorMismatch: "studio.producerError.linked3d.linePassLocatorMismatch",
  linkLayerPlacementMismatch: "studio.producerError.linked3d.linkLayerPlacementMismatch",
  sceneAnchorMissing: "studio.producerError.linked3d.sceneAnchorMissing",
  sceneAnchorDuplicated: "studio.producerError.linked3d.sceneAnchorDuplicated",
  canvasStageHashMismatch: "studio.producerError.linked3d.canvasStageHashMismatch",
  shotMissingInScene: "studio.producerError.linked3d.shotMissingInScene",
  passRevisionMismatch: "studio.producerError.linked3d.passRevisionMismatch",
  correctionProvenanceMismatch: "studio.producerError.linked3d.correctionProvenanceMismatch",
  reservedPassLocatorUnowned: "studio.producerError.linked3d.reservedPassLocatorUnowned",
  reservedCorrectionUnowned: "studio.producerError.linked3d.reservedCorrectionUnowned",
};

/** detail별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const LINKED3D_ERROR_KO: Readonly<Record<StudioLinked3dRenderValidationDetail, string>> = {
  documentCorrupt: "연결된 3D 렌더 인덱스가 손상되었습니다.",
  stageCollectionMissing: "연결된 공유 3D Stage를 찾지 못했습니다.",
  linkStageMissing: "3D 링크 {bundleId}의 Stage가 없습니다.",
  dccSourceStageMissing: "DCC Shot {sourceShotId}의 원본 Stage가 없습니다.",
  linkStageHashMismatch: "3D 링크 {bundleId}의 Stage 해시가 다릅니다.",
  linkLayerSetMismatch: "3D 링크 {bundleId}의 전체 레이어 집합이 다릅니다.",
  layerElementMissing: "3D 링크 레이어 {elementId}가 없습니다.",
  layerRoleMismatch: "3D 링크 레이어 {elementId}의 역할이 다릅니다.",
  linePassLocatorMismatch: "canonical line pass locator가 Canvas 레이어와 다릅니다.",
  linkLayerPlacementMismatch: "3D 링크 {bundleId}의 레이어 배치가 일치하지 않습니다.",
  sceneAnchorMissing: "3D 장면 원본 앵커가 없습니다.",
  sceneAnchorDuplicated: "3D 장면 원본 앵커가 중복되었습니다.",
  canvasStageHashMismatch: "Canvas 장면과 공유 Stage의 해시가 다릅니다.",
  shotMissingInScene: "연결된 Shot {shotId}를 장면에서 찾지 못했습니다.",
  passRevisionMismatch: "3D 링크 {bundleId}의 pass revision이 canonical Scene과 다릅니다.",
  correctionProvenanceMismatch: "3D 링크 {bundleId}의 artist correction provenance가 다릅니다.",
  reservedPassLocatorUnowned: "Canvas 요소 {elementId}의 reserved 3D pass locator가 page receipt에 귀속되지 않았습니다.",
  reservedCorrectionUnowned: "Canvas correction {elementId}가 active 3D pass receipt에 귀속되지 않았습니다.",
};

/**
 * 표시 지점 전용 해석 (linked3d 검증): 생산자가 방출한 detail+params를 현재 로케일 문구로 바꾼다.
 * 집계자 예외(저장 투영·프로젝트 파일 throw 합성)에서도 같은 해석을 쓴다.
 */
export function resolveStudioLinked3dError(error: {
  readonly detail: StudioLinked3dRenderValidationDetail;
  readonly params?: Readonly<Record<string, string>>;
}): string {
  return resolveProducerError(LINKED3D_ERROR_KEYS[error.detail], LINKED3D_ERROR_KO[error.detail], error.params);
}

export type StudioLinked3dSaveProjectionTextCode =
  | "reservedStatePrefix"
  | "authorityPrefix"
  | "masterReservedUnsavable"
  | "sharedStageCorrupt"
  | "renderIndexCorrupt";

const LINKED3D_SAVE_PROJECTION_KEYS: Readonly<Record<StudioLinked3dSaveProjectionTextCode, string>> = {
  reservedStatePrefix: "studio.producerError.linked3d.saveProjection.reservedStatePrefix",
  authorityPrefix: "studio.producerError.linked3d.saveProjection.authorityPrefix",
  masterReservedUnsavable: "studio.producerError.linked3d.saveProjection.masterReservedUnsavable",
  sharedStageCorrupt: "studio.producerError.linked3d.saveProjection.sharedStageCorrupt",
  renderIndexCorrupt: "studio.producerError.linked3d.saveProjection.renderIndexCorrupt",
};

/** 저장 투영 문구별 ko 원문 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. 접두 2종은 합성 시 ": " 뒤에 detail 해석이 붙는 형태라 말미 콜론까지가 원문이다. */
const LINKED3D_SAVE_PROJECTION_KO: Readonly<Record<StudioLinked3dSaveProjectionTextCode, string>> = {
  reservedStatePrefix: "페이지 연결형 3D reserved 상태가 달라 저장하지 않았어요:",
  authorityPrefix: "페이지 연결형 3D 렌더 권위가 달라 저장하지 않았어요:",
  masterReservedUnsavable: "문서 마스터의 연결형 3D reserved 상태를 저장할 수 없어요.",
  sharedStageCorrupt: "페이지 공유 3D 장면 연결이 손상되어 저장하지 않았어요.",
  renderIndexCorrupt: "페이지 연결형 3D 렌더 인덱스가 손상되어 저장하지 않았어요.",
};

/** 집계자 예외 전용 해석 (linked3d 저장 투영): throw 합성 지점에서 접두·고정 문구를 해석한다. */
export function resolveStudioLinked3dSaveProjectionText(
  code: StudioLinked3dSaveProjectionTextCode,
): string {
  return resolveProducerError(LINKED3D_SAVE_PROJECTION_KEYS[code], LINKED3D_SAVE_PROJECTION_KO[code]);
}
