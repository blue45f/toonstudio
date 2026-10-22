/**
 * 생산자 구조화 에러 해석 모듈 — bg3d LT 계획 구간: studio-bg3d-lt-layer-plan 서브코드 46종 + 레이어 라벨 4종 (A4 D4, R11).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 코어 모듈이
 * 소스 파일 크기 래칫(800줄 상한)에 닿아, R11 구간은 frozen 사전군과 같은
 * 분할 관례로 파일 단위 형제 모듈로 나눴다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioBg3dLtLayerPlanFailure,
  StudioBg3dLtLayerRole,
} from "../bg3d/studio-bg3d-lt-layer-plan";


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
  "studio.producerError.bg3dLt.invalid-render-mode.renderResultFormat": "3D LT 렌더 결과 형식이 올바르지 않아요.",
  "studio.producerError.bg3dLt.invalid-render-mode.mixedModes": "분리 렌더와 통합 렌더 값이 섞여 있어요.",
  "studio.producerError.bg3dLt.invalid-render-mode.unknownLayerRole": "알 수 없는 3D LT 레이어 역할이 포함되어 있어요.",
  "studio.producerError.bg3dLt.invalid-render-mode.unsupportedFormat": "지원하지 않는 3D LT 렌더 형식이에요.",
  "studio.producerError.bg3dLt.invalid-render-dimensions.outOfRange": "3D LT 렌더 크기가 허용 범위를 벗어났어요.",
  "studio.producerError.bg3dLt.missing-scene.missingScene": "다시 편집할 3D 장면 정보가 없어요.",
  "studio.producerError.bg3dLt.missing-render-layer.missingLayer": "삽입할 3D LT 레이어가 없어요.",
  "studio.producerError.bg3dLt.duplicate-render-role.duplicateRole": "같은 역할의 3D LT 레이어가 중복되었어요.",
  "studio.producerError.bg3dLt.mismatched-layer-dimensions.layerSizeMismatch": "분리된 3D LT 레이어의 렌더 크기가 서로 달라요.",
  "studio.producerError.bg3dLt.invalid-png-data-url.layerPng": "3D LT 레이어 PNG 데이터가 올바르지 않아요.",
  "studio.producerError.bg3dLt.invalid-png-data-url.combinedPng": "통합 3D PNG 데이터가 올바르지 않아요.",
  "studio.producerError.bg3dLt.invalid-png-data-url.existingPngOrFragment": "기존 3D PNG 데이터나 장면 프래그먼트가 올바르지 않아요.",
  "studio.producerError.bg3dLt.page-locked.pageLocked": "검토 잠금된 페이지에는 3D LT 레이어를 적용할 수 없어요.",
  "studio.producerError.bg3dLt.duplicate-element-id.duplicateElementId": "페이지에 중복된 요소 ID가 있어 안전하게 적용할 수 없어요.",
  "studio.producerError.bg3dLt.duplicate-group-id.duplicateGroupId": "페이지에 중복된 그룹 ID가 있어 안전하게 적용할 수 없어요.",
  "studio.producerError.bg3dLt.target-not-found.targetNotFound": "다시 적용할 3D LT 레이어를 찾지 못했어요.",
  "studio.producerError.bg3dLt.target-not-image.targetNotImage": "선택한 요소는 3D LT 이미지 레이어가 아니에요.",
  "studio.producerError.bg3dLt.target-locked.layerLocked": "잠긴 3D LT 레이어는 변경할 수 없어요.",
  "studio.producerError.bg3dLt.target-locked.bundleLayerLocked": "잠긴 3D LT 번들 레이어는 변경할 수 없어요.",
  "studio.producerError.bg3dLt.target-locked.groupPngLocked": "잠긴 그룹의 기존 3D PNG는 변경할 수 없어요.",
  "studio.producerError.bg3dLt.invalid-bundle-metadata.incomplete": "기존 3D LT 번들 메타데이터가 불완전해요.",
  "studio.producerError.bg3dLt.invalid-bundle-metadata.mismatch": "기존 3D LT 번들 메타데이터가 일치하지 않아요.",
  "studio.producerError.bg3dLt.invalid-bundle-element.nonImageElement": "3D LT 번들에 이미지가 아닌 요소가 섞여 있어요.",
  "studio.producerError.bg3dLt.noncontiguous-bundle.noncontiguous": "3D LT 번들 레이어 사이에 다른 레이어가 끼어 있어요.",
  "studio.producerError.bg3dLt.inconsistent-bundle-geometry.placement": "기존 3D LT 번들의 배치 값이 올바르지 않아요.",
  "studio.producerError.bg3dLt.inconsistent-bundle-geometry.positionOrSize": "기존 3D LT 번들 레이어의 위치나 크기가 서로 달라요.",
  "studio.producerError.bg3dLt.inconsistent-bundle-geometry.existingPngPlacement": "기존 3D PNG의 배치 값이 올바르지 않아요.",
  "studio.producerError.bg3dLt.inconsistent-bundle-group.missingDedicatedGroup": "기존 3D LT 번들에 전용 그룹이 없어요.",
  "studio.producerError.bg3dLt.inconsistent-bundle-group.groupMismatch": "기존 3D LT 번들 레이어의 그룹이 서로 달라요.",
  "studio.producerError.bg3dLt.duplicate-bundle-role.duplicateRole": "기존 3D LT 번들에 같은 역할의 레이어가 중복되었어요.",
  "studio.producerError.bg3dLt.missing-bundle-group.groupNotFound": "기존 3D LT 번들의 전용 그룹을 찾지 못했어요.",
  "studio.producerError.bg3dLt.bundle-group-locked.groupLocked": "잠긴 3D LT 그룹은 변경할 수 없어요.",
  "studio.producerError.bg3dLt.mixed-bundle-group.mixedGroup": "3D LT 전용 그룹에 관련 없는 레이어가 섞여 있어요.",
  "studio.producerError.bg3dLt.missing-allocation.bundleAndGroupIds": "새 3D LT 번들과 그룹 ID가 필요해요.",
  "studio.producerError.bg3dLt.missing-allocation.identifiersUndecided": "3D LT 번들 식별자를 결정하지 못했어요.",
  "studio.producerError.bg3dLt.missing-allocation.layerId": "{layerName} 레이어 ID가 필요해요.",
  "studio.producerError.bg3dLt.bundle-id-collision.bundleIdCollision": "새 3D LT 번들 ID가 기존 번들과 겹쳐요.",
  "studio.producerError.bg3dLt.group-id-collision.groupIdCollision": "새 3D LT 그룹 ID가 기존 그룹과 겹쳐요.",
  "studio.producerError.bg3dLt.allocation-collision.existingElement": "새 3D LT 레이어 ID가 기존 요소와 겹쳐요.",
  "studio.producerError.bg3dLt.allocation-collision.mutual": "새 3D LT 레이어 ID가 서로 겹쳐요.",
  "studio.producerError.bg3dLt.missing-element-template.missingTemplate": "새 3D LT 레이어를 만들 이미지 템플릿이 필요해요.",
  "studio.producerError.bg3dLt.invalid-element-template.template": "새 3D LT 이미지 템플릿이 올바르지 않아요.",
  "studio.producerError.bg3dLt.invalid-element-template.templatePlacement": "새 3D LT 이미지 템플릿의 배치 값이 올바르지 않아요.",
  "studio.producerError.bg3dLt.invalid-element-template.commonPlacementUndecided": "3D LT 레이어의 공통 배치 값을 결정하지 못했어요.",
  "studio.producerError.bg3dLt.template-source-mismatch.sourceMismatch": "이미지 템플릿이 현재 3D LT 렌더와 일치하지 않아요.",
  "studio.producerError.bg3dLt.template-aspect-mismatch.aspectMismatch": "이미지 템플릿과 3D LT 렌더의 화면 비율이 달라요.",
  "studio.producerError.bg3dLt.layerName.color": "3D LT · 컬러 렌더",
  "studio.producerError.bg3dLt.layerName.tone": "3D LT · 톤",
  "studio.producerError.bg3dLt.layerName.texture-line": "3D LT · 질감선",
  "studio.producerError.bg3dLt.layerName.main-line": "3D LT · 주선",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.bg3dLt.invalid-render-mode.renderResultFormat": "The 3D LT render result format is invalid.",
  "studio.producerError.bg3dLt.invalid-render-mode.mixedModes": "Separated and combined render values are mixed together.",
  "studio.producerError.bg3dLt.invalid-render-mode.unknownLayerRole": "An unknown 3D LT layer role is included.",
  "studio.producerError.bg3dLt.invalid-render-mode.unsupportedFormat": "This 3D LT render format is not supported.",
  "studio.producerError.bg3dLt.invalid-render-dimensions.outOfRange": "The 3D LT render size is outside the allowed range.",
  "studio.producerError.bg3dLt.missing-scene.missingScene": "There is no 3D scene data to edit again.",
  "studio.producerError.bg3dLt.missing-render-layer.missingLayer": "There is no 3D LT layer to insert.",
  "studio.producerError.bg3dLt.duplicate-render-role.duplicateRole": "Layers with the same 3D LT role are duplicated.",
  "studio.producerError.bg3dLt.mismatched-layer-dimensions.layerSizeMismatch": "The separated 3D LT layers have different render sizes.",
  "studio.producerError.bg3dLt.invalid-png-data-url.layerPng": "The 3D LT layer PNG data is invalid.",
  "studio.producerError.bg3dLt.invalid-png-data-url.combinedPng": "The combined 3D PNG data is invalid.",
  "studio.producerError.bg3dLt.invalid-png-data-url.existingPngOrFragment": "The existing 3D PNG data or scene fragment is invalid.",
  "studio.producerError.bg3dLt.page-locked.pageLocked": "3D LT layers cannot be applied to a review-locked page.",
  "studio.producerError.bg3dLt.duplicate-element-id.duplicateElementId": "The page has duplicate element IDs, so it cannot be applied safely.",
  "studio.producerError.bg3dLt.duplicate-group-id.duplicateGroupId": "The page has duplicate group IDs, so it cannot be applied safely.",
  "studio.producerError.bg3dLt.target-not-found.targetNotFound": "Could not find the 3D LT layer to reapply.",
  "studio.producerError.bg3dLt.target-not-image.targetNotImage": "The selected element is not a 3D LT image layer.",
  "studio.producerError.bg3dLt.target-locked.layerLocked": "A locked 3D LT layer cannot be changed.",
  "studio.producerError.bg3dLt.target-locked.bundleLayerLocked": "A locked 3D LT bundle layer cannot be changed.",
  "studio.producerError.bg3dLt.target-locked.groupPngLocked": "The existing 3D PNG in a locked group cannot be changed.",
  "studio.producerError.bg3dLt.invalid-bundle-metadata.incomplete": "The existing 3D LT bundle metadata is incomplete.",
  "studio.producerError.bg3dLt.invalid-bundle-metadata.mismatch": "The existing 3D LT bundle metadata does not match.",
  "studio.producerError.bg3dLt.invalid-bundle-element.nonImageElement": "The 3D LT bundle contains a non-image element.",
  "studio.producerError.bg3dLt.noncontiguous-bundle.noncontiguous": "Another layer sits between the 3D LT bundle layers.",
  "studio.producerError.bg3dLt.inconsistent-bundle-geometry.placement": "The existing 3D LT bundle placement values are invalid.",
  "studio.producerError.bg3dLt.inconsistent-bundle-geometry.positionOrSize": "The existing 3D LT bundle layers have different positions or sizes.",
  "studio.producerError.bg3dLt.inconsistent-bundle-geometry.existingPngPlacement": "The existing 3D PNG placement values are invalid.",
  "studio.producerError.bg3dLt.inconsistent-bundle-group.missingDedicatedGroup": "The existing 3D LT bundle has no dedicated group.",
  "studio.producerError.bg3dLt.inconsistent-bundle-group.groupMismatch": "The existing 3D LT bundle layers belong to different groups.",
  "studio.producerError.bg3dLt.duplicate-bundle-role.duplicateRole": "The existing 3D LT bundle has duplicate layers with the same role.",
  "studio.producerError.bg3dLt.missing-bundle-group.groupNotFound": "Could not find the existing 3D LT bundle's dedicated group.",
  "studio.producerError.bg3dLt.bundle-group-locked.groupLocked": "A locked 3D LT group cannot be changed.",
  "studio.producerError.bg3dLt.mixed-bundle-group.mixedGroup": "The dedicated 3D LT group contains unrelated layers.",
  "studio.producerError.bg3dLt.missing-allocation.bundleAndGroupIds": "New 3D LT bundle and group IDs are required.",
  "studio.producerError.bg3dLt.missing-allocation.identifiersUndecided": "Could not decide the 3D LT bundle identifiers.",
  "studio.producerError.bg3dLt.missing-allocation.layerId": "A layer ID is required for the {layerName} layer.",
  "studio.producerError.bg3dLt.bundle-id-collision.bundleIdCollision": "The new 3D LT bundle ID overlaps with an existing bundle.",
  "studio.producerError.bg3dLt.group-id-collision.groupIdCollision": "The new 3D LT group ID overlaps with an existing group.",
  "studio.producerError.bg3dLt.allocation-collision.existingElement": "The new 3D LT layer ID overlaps with an existing element.",
  "studio.producerError.bg3dLt.allocation-collision.mutual": "The new 3D LT layer IDs overlap with each other.",
  "studio.producerError.bg3dLt.missing-element-template.missingTemplate": "An image template is required to create new 3D LT layers.",
  "studio.producerError.bg3dLt.invalid-element-template.template": "The new 3D LT image template is invalid.",
  "studio.producerError.bg3dLt.invalid-element-template.templatePlacement": "The new 3D LT image template placement values are invalid.",
  "studio.producerError.bg3dLt.invalid-element-template.commonPlacementUndecided": "Could not decide the shared placement values for the 3D LT layers.",
  "studio.producerError.bg3dLt.template-source-mismatch.sourceMismatch": "The image template does not match the current 3D LT render.",
  "studio.producerError.bg3dLt.template-aspect-mismatch.aspectMismatch": "The image template and the 3D LT render have different aspect ratios.",
  "studio.producerError.bg3dLt.layerName.color": "3D LT · Color render",
  "studio.producerError.bg3dLt.layerName.tone": "3D LT · Tone",
  "studio.producerError.bg3dLt.layerName.texture-line": "3D LT · Texture line",
  "studio.producerError.bg3dLt.layerName.main-line": "3D LT · Main line",
});

const BG3D_LT_ERROR_KEYS: Readonly<Record<StudioBg3dLtLayerPlanFailure["code"], string>> = {
  "invalid-render-mode.renderResultFormat": "studio.producerError.bg3dLt.invalid-render-mode.renderResultFormat",
  "invalid-render-mode.mixedModes": "studio.producerError.bg3dLt.invalid-render-mode.mixedModes",
  "invalid-render-mode.unknownLayerRole": "studio.producerError.bg3dLt.invalid-render-mode.unknownLayerRole",
  "invalid-render-mode.unsupportedFormat": "studio.producerError.bg3dLt.invalid-render-mode.unsupportedFormat",
  "invalid-render-dimensions.outOfRange": "studio.producerError.bg3dLt.invalid-render-dimensions.outOfRange",
  "missing-scene.missingScene": "studio.producerError.bg3dLt.missing-scene.missingScene",
  "missing-render-layer.missingLayer": "studio.producerError.bg3dLt.missing-render-layer.missingLayer",
  "duplicate-render-role.duplicateRole": "studio.producerError.bg3dLt.duplicate-render-role.duplicateRole",
  "mismatched-layer-dimensions.layerSizeMismatch": "studio.producerError.bg3dLt.mismatched-layer-dimensions.layerSizeMismatch",
  "invalid-png-data-url.layerPng": "studio.producerError.bg3dLt.invalid-png-data-url.layerPng",
  "invalid-png-data-url.combinedPng": "studio.producerError.bg3dLt.invalid-png-data-url.combinedPng",
  "invalid-png-data-url.existingPngOrFragment": "studio.producerError.bg3dLt.invalid-png-data-url.existingPngOrFragment",
  "page-locked.pageLocked": "studio.producerError.bg3dLt.page-locked.pageLocked",
  "duplicate-element-id.duplicateElementId": "studio.producerError.bg3dLt.duplicate-element-id.duplicateElementId",
  "duplicate-group-id.duplicateGroupId": "studio.producerError.bg3dLt.duplicate-group-id.duplicateGroupId",
  "target-not-found.targetNotFound": "studio.producerError.bg3dLt.target-not-found.targetNotFound",
  "target-not-image.targetNotImage": "studio.producerError.bg3dLt.target-not-image.targetNotImage",
  "target-locked.layerLocked": "studio.producerError.bg3dLt.target-locked.layerLocked",
  "target-locked.bundleLayerLocked": "studio.producerError.bg3dLt.target-locked.bundleLayerLocked",
  "target-locked.groupPngLocked": "studio.producerError.bg3dLt.target-locked.groupPngLocked",
  "invalid-bundle-metadata.incomplete": "studio.producerError.bg3dLt.invalid-bundle-metadata.incomplete",
  "invalid-bundle-metadata.mismatch": "studio.producerError.bg3dLt.invalid-bundle-metadata.mismatch",
  "invalid-bundle-element.nonImageElement": "studio.producerError.bg3dLt.invalid-bundle-element.nonImageElement",
  "noncontiguous-bundle.noncontiguous": "studio.producerError.bg3dLt.noncontiguous-bundle.noncontiguous",
  "inconsistent-bundle-geometry.placement": "studio.producerError.bg3dLt.inconsistent-bundle-geometry.placement",
  "inconsistent-bundle-geometry.positionOrSize": "studio.producerError.bg3dLt.inconsistent-bundle-geometry.positionOrSize",
  "inconsistent-bundle-geometry.existingPngPlacement": "studio.producerError.bg3dLt.inconsistent-bundle-geometry.existingPngPlacement",
  "inconsistent-bundle-group.missingDedicatedGroup": "studio.producerError.bg3dLt.inconsistent-bundle-group.missingDedicatedGroup",
  "inconsistent-bundle-group.groupMismatch": "studio.producerError.bg3dLt.inconsistent-bundle-group.groupMismatch",
  "duplicate-bundle-role.duplicateRole": "studio.producerError.bg3dLt.duplicate-bundle-role.duplicateRole",
  "missing-bundle-group.groupNotFound": "studio.producerError.bg3dLt.missing-bundle-group.groupNotFound",
  "bundle-group-locked.groupLocked": "studio.producerError.bg3dLt.bundle-group-locked.groupLocked",
  "mixed-bundle-group.mixedGroup": "studio.producerError.bg3dLt.mixed-bundle-group.mixedGroup",
  "missing-allocation.bundleAndGroupIds": "studio.producerError.bg3dLt.missing-allocation.bundleAndGroupIds",
  "missing-allocation.identifiersUndecided": "studio.producerError.bg3dLt.missing-allocation.identifiersUndecided",
  "missing-allocation.layerId": "studio.producerError.bg3dLt.missing-allocation.layerId",
  "bundle-id-collision.bundleIdCollision": "studio.producerError.bg3dLt.bundle-id-collision.bundleIdCollision",
  "group-id-collision.groupIdCollision": "studio.producerError.bg3dLt.group-id-collision.groupIdCollision",
  "allocation-collision.existingElement": "studio.producerError.bg3dLt.allocation-collision.existingElement",
  "allocation-collision.mutual": "studio.producerError.bg3dLt.allocation-collision.mutual",
  "missing-element-template.missingTemplate": "studio.producerError.bg3dLt.missing-element-template.missingTemplate",
  "invalid-element-template.template": "studio.producerError.bg3dLt.invalid-element-template.template",
  "invalid-element-template.templatePlacement": "studio.producerError.bg3dLt.invalid-element-template.templatePlacement",
  "invalid-element-template.commonPlacementUndecided": "studio.producerError.bg3dLt.invalid-element-template.commonPlacementUndecided",
  "template-source-mismatch.sourceMismatch": "studio.producerError.bg3dLt.template-source-mismatch.sourceMismatch",
  "template-aspect-mismatch.aspectMismatch": "studio.producerError.bg3dLt.template-aspect-mismatch.aspectMismatch",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const BG3D_LT_ERROR_KO: Readonly<Record<StudioBg3dLtLayerPlanFailure["code"], string>> = {
  "invalid-render-mode.renderResultFormat": "3D LT 렌더 결과 형식이 올바르지 않아요.",
  "invalid-render-mode.mixedModes": "분리 렌더와 통합 렌더 값이 섞여 있어요.",
  "invalid-render-mode.unknownLayerRole": "알 수 없는 3D LT 레이어 역할이 포함되어 있어요.",
  "invalid-render-mode.unsupportedFormat": "지원하지 않는 3D LT 렌더 형식이에요.",
  "invalid-render-dimensions.outOfRange": "3D LT 렌더 크기가 허용 범위를 벗어났어요.",
  "missing-scene.missingScene": "다시 편집할 3D 장면 정보가 없어요.",
  "missing-render-layer.missingLayer": "삽입할 3D LT 레이어가 없어요.",
  "duplicate-render-role.duplicateRole": "같은 역할의 3D LT 레이어가 중복되었어요.",
  "mismatched-layer-dimensions.layerSizeMismatch": "분리된 3D LT 레이어의 렌더 크기가 서로 달라요.",
  "invalid-png-data-url.layerPng": "3D LT 레이어 PNG 데이터가 올바르지 않아요.",
  "invalid-png-data-url.combinedPng": "통합 3D PNG 데이터가 올바르지 않아요.",
  "invalid-png-data-url.existingPngOrFragment": "기존 3D PNG 데이터나 장면 프래그먼트가 올바르지 않아요.",
  "page-locked.pageLocked": "검토 잠금된 페이지에는 3D LT 레이어를 적용할 수 없어요.",
  "duplicate-element-id.duplicateElementId": "페이지에 중복된 요소 ID가 있어 안전하게 적용할 수 없어요.",
  "duplicate-group-id.duplicateGroupId": "페이지에 중복된 그룹 ID가 있어 안전하게 적용할 수 없어요.",
  "target-not-found.targetNotFound": "다시 적용할 3D LT 레이어를 찾지 못했어요.",
  "target-not-image.targetNotImage": "선택한 요소는 3D LT 이미지 레이어가 아니에요.",
  "target-locked.layerLocked": "잠긴 3D LT 레이어는 변경할 수 없어요.",
  "target-locked.bundleLayerLocked": "잠긴 3D LT 번들 레이어는 변경할 수 없어요.",
  "target-locked.groupPngLocked": "잠긴 그룹의 기존 3D PNG는 변경할 수 없어요.",
  "invalid-bundle-metadata.incomplete": "기존 3D LT 번들 메타데이터가 불완전해요.",
  "invalid-bundle-metadata.mismatch": "기존 3D LT 번들 메타데이터가 일치하지 않아요.",
  "invalid-bundle-element.nonImageElement": "3D LT 번들에 이미지가 아닌 요소가 섞여 있어요.",
  "noncontiguous-bundle.noncontiguous": "3D LT 번들 레이어 사이에 다른 레이어가 끼어 있어요.",
  "inconsistent-bundle-geometry.placement": "기존 3D LT 번들의 배치 값이 올바르지 않아요.",
  "inconsistent-bundle-geometry.positionOrSize": "기존 3D LT 번들 레이어의 위치나 크기가 서로 달라요.",
  "inconsistent-bundle-geometry.existingPngPlacement": "기존 3D PNG의 배치 값이 올바르지 않아요.",
  "inconsistent-bundle-group.missingDedicatedGroup": "기존 3D LT 번들에 전용 그룹이 없어요.",
  "inconsistent-bundle-group.groupMismatch": "기존 3D LT 번들 레이어의 그룹이 서로 달라요.",
  "duplicate-bundle-role.duplicateRole": "기존 3D LT 번들에 같은 역할의 레이어가 중복되었어요.",
  "missing-bundle-group.groupNotFound": "기존 3D LT 번들의 전용 그룹을 찾지 못했어요.",
  "bundle-group-locked.groupLocked": "잠긴 3D LT 그룹은 변경할 수 없어요.",
  "mixed-bundle-group.mixedGroup": "3D LT 전용 그룹에 관련 없는 레이어가 섞여 있어요.",
  "missing-allocation.bundleAndGroupIds": "새 3D LT 번들과 그룹 ID가 필요해요.",
  "missing-allocation.identifiersUndecided": "3D LT 번들 식별자를 결정하지 못했어요.",
  "missing-allocation.layerId": "{layerName} 레이어 ID가 필요해요.",
  "bundle-id-collision.bundleIdCollision": "새 3D LT 번들 ID가 기존 번들과 겹쳐요.",
  "group-id-collision.groupIdCollision": "새 3D LT 그룹 ID가 기존 그룹과 겹쳐요.",
  "allocation-collision.existingElement": "새 3D LT 레이어 ID가 기존 요소와 겹쳐요.",
  "allocation-collision.mutual": "새 3D LT 레이어 ID가 서로 겹쳐요.",
  "missing-element-template.missingTemplate": "새 3D LT 레이어를 만들 이미지 템플릿이 필요해요.",
  "invalid-element-template.template": "새 3D LT 이미지 템플릿이 올바르지 않아요.",
  "invalid-element-template.templatePlacement": "새 3D LT 이미지 템플릿의 배치 값이 올바르지 않아요.",
  "invalid-element-template.commonPlacementUndecided": "3D LT 레이어의 공통 배치 값을 결정하지 못했어요.",
  "template-source-mismatch.sourceMismatch": "이미지 템플릿이 현재 3D LT 렌더와 일치하지 않아요.",
  "template-aspect-mismatch.aspectMismatch": "이미지 템플릿과 3D LT 렌더의 화면 비율이 달라요.",
};

const BG3D_LT_LAYER_NAME_KEYS: Readonly<Record<StudioBg3dLtLayerRole, string>> = {
  color: "studio.producerError.bg3dLt.layerName.color",
  tone: "studio.producerError.bg3dLt.layerName.tone",
  "texture-line": "studio.producerError.bg3dLt.layerName.texture-line",
  "main-line": "studio.producerError.bg3dLt.layerName.main-line",
};

/** 역할 코드별 ko 라벨 — 생산자의 STUDIO_BG3D_LT_LAYER_NAMES 원문과 동일하다. */
const BG3D_LT_LAYER_NAME_KO: Readonly<Record<StudioBg3dLtLayerRole, string>> = {
  color: "3D LT · 컬러 렌더",
  tone: "3D LT · 톤",
  "texture-line": "3D LT · 질감선",
  "main-line": "3D LT · 주선",
};

/**
 * 표시 지점 전용 해석 (bg3d LT 레이어 라벨): 역할 코드를 현재 로케일 라벨로 바꾼다.
 * 동적 방출(missing-allocation.layerId)의 params.layerName이 역할 코드로 실려 오므로,
 * 메시지 해석 전에 이 함수로 코드 해석값으로 치환한다. 알 수 없는 코드는 원문 유지.
 */
export function resolveStudioBg3dLtLayerName(role: string): string {
  const key = (BG3D_LT_LAYER_NAME_KEYS as Readonly<Record<string, string>>)[role];
  if (!key) return role;
  const fallback = (BG3D_LT_LAYER_NAME_KO as Readonly<Record<string, string>>)[role] ?? role;
  return resolveProducerError(key, fallback);
}

/**
 * 표시 지점 전용 해석 (bg3d LT 레이어 계획): bg3d-insert의 realtime·plan setError가 부른다.
 * 생산자·래퍼는 이 함수를 부르지 않고 코드+파라미터를 그대로 통과시키는 것이 원칙이다.
 */
export function resolveStudioBg3dLtLayerPlanError(
  error: StudioBg3dLtLayerPlanFailure,
): string {
  const params = error.params?.layerName !== undefined
    ? { ...error.params, layerName: resolveStudioBg3dLtLayerName(error.params.layerName) }
    : error.params;
  return resolveProducerError(BG3D_LT_ERROR_KEYS[error.code], BG3D_LT_ERROR_KO[error.code], params);
}
