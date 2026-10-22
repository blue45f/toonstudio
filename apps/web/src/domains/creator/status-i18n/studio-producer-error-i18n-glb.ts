/**
 * 생산자 구조화 에러 해석 모듈 — glb 검증 구간: studio-bg3d-glb-validation Failure 55코드 (A4 D4, R11).
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
  StudioBg3dGlbFailureCode,
  StudioBg3dGlbValidationFailure,
} from "../bg3d/studio-bg3d-glb-validation";


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
  "studio.producerError.glb.invalidInput": "3D 모델 파일의 이진 데이터를 읽을 수 없습니다. 파일을 다시 선택해 주세요.",
  "studio.producerError.glb.invalidOptions": "3D 모델 안전 검사 설정이 올바르지 않습니다. 작업공간을 새로고침해 주세요.",
  "studio.producerError.glb.invalidDeclaredMetadata": "3D 모델의 크기 또는 무결성 정보를 확인할 수 없습니다. 파일을 다시 등록해 주세요.",
  "studio.producerError.glb.mimeTypeMismatch": "지원되는 GLB 형식의 3D 모델만 불러올 수 있습니다.",
  "studio.producerError.glb.byteSizeMismatch": "3D 모델의 기록된 크기와 실제 파일 크기가 다릅니다. 원본 파일을 다시 등록해 주세요.",
  "studio.producerError.glb.fileTooLarge": "3D 모델은 파일 하나당 최대 100MiB까지 불러올 수 있습니다. 모델을 최적화해 주세요.",
  "studio.producerError.glb.modelByteBudgetExceeded": "이 기기의 3D 모델 용량 기준을 초과했습니다. 더 작은 모델을 사용해 주세요.",
  "studio.producerError.glb.cumulativeByteBudgetExceeded": "프로젝트의 3D 모델 누적 용량 기준을 초과했습니다. 사용하지 않는 모델을 정리해 주세요.",
  "studio.producerError.glb.digestUnavailable": "이 환경에서는 3D 모델 무결성 검사를 사용할 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.",
  "studio.producerError.glb.digestFailed": "3D 모델 무결성 검사를 완료하지 못했습니다. 파일을 다시 선택해 주세요.",
  "studio.producerError.glb.hashMismatch": "3D 모델이 등록 이후 변경되었거나 손상되었습니다. 신뢰할 수 있는 원본을 다시 등록해 주세요.",
  "studio.producerError.glb.truncatedHeader": "3D 모델 파일이 완전하지 않습니다. 원본 GLB 파일을 다시 받아 주세요.",
  "studio.producerError.glb.invalidMagic": "이 파일은 유효한 GLB 모델이 아닙니다. GLB 2.0 형식으로 내보내 주세요.",
  "studio.producerError.glb.unsupportedVersion": "GLB 2.0 모델만 지원합니다. 모델을 GLB 2.0으로 다시 내보내 주세요.",
  "studio.producerError.glb.declaredLengthMismatch": "3D 모델 컨테이너 길이가 실제 파일과 맞지 않습니다. 원본 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.missingJsonChunk": "3D 모델에 필수 장면 정보가 없습니다. GLB 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.jsonChunkTooLarge": "3D 모델의 장면 정보가 안전 처리 한도를 초과했습니다. 모델을 단순화해 주세요.",
  "studio.producerError.glb.invalidChunkAlignment": "3D 모델 내부 블록 정렬이 올바르지 않습니다. GLB 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.invalidChunkBounds": "3D 모델 내부 블록이 잘렸거나 손상되었습니다. 원본 파일을 다시 받아 주세요.",
  "studio.producerError.glb.duplicateJsonChunk": "3D 모델에 장면 정보 블록이 중복되어 있습니다. GLB 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.duplicateBinChunk": "3D 모델에 이진 리소스 블록이 중복되어 있습니다. GLB 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.unsupportedChunkType": "지원하지 않는 내부 블록이 포함된 GLB 모델입니다. 표준 GLB 2.0으로 다시 내보내 주세요.",
  "studio.producerError.glb.invalidJsonEncoding": "3D 모델 장면 정보의 문자 인코딩이 올바르지 않습니다. GLB 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.invalidJson": "3D 모델 장면 정보를 해석할 수 없습니다. GLB 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.invalidGltfRoot": "3D 모델의 glTF 2.0 장면 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.unsupportedRequiredExtension": "현재 안전하게 처리할 수 없는 필수 3D 확장이 포함되어 있습니다. 호환 옵션으로 다시 내보내 주세요.",
  "studio.producerError.glb.externalResourceUri": "외부 파일이나 네트워크 리소스를 참조하는 모델은 불러올 수 없습니다. 모든 리소스를 GLB 안에 포함해 주세요.",
  "studio.producerError.glb.missingBinChunk": "3D 모델에 필요한 내장 리소스가 없습니다. 텍스처와 메시를 GLB 안에 포함해 주세요.",
  "studio.producerError.glb.invalidBuffer": "3D 모델의 내장 이진 리소스 정보가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.invalidBufferView": "3D 모델의 내장 리소스 범위가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.invalidAccessor": "3D 모델의 기하 데이터 개수 정보를 확인할 수 없습니다. 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.invalidMesh": "3D 모델의 메시 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.invalidNode": "3D 모델의 장면 노드 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "studio.producerError.glb.invalidAnimation": "3D 모델의 애니메이션 구조가 올바르지 않습니다. 애니메이션을 정리해 다시 내보내 주세요.",
  "studio.producerError.glb.invalidSkin": "3D 모델의 스킨 또는 조인트 구조가 올바르지 않습니다. 리깅을 정리해 다시 내보내 주세요.",
  "studio.producerError.glb.invalidImage": "3D 모델의 내장 이미지 구조가 올바르지 않습니다. 지원 형식으로 다시 내보내 주세요.",
  "studio.producerError.glb.basisTranscodeFailed": "3D 모델의 Basis 텍스처를 안전하게 디코딩할 수 없습니다. 텍스처를 다시 내보내 주세요.",
  "studio.producerError.glb.arithmeticOverflow": "3D 모델의 복잡도를 안전하게 계산할 수 없습니다. 모델을 단순화해 주세요.",
  "studio.producerError.glb.nodeBudgetExceeded": "이 기기의 장면 노드 수 기준을 초과했습니다. 모델 계층을 단순화해 주세요.",
  "studio.producerError.glb.triangleBudgetExceeded": "이 기기의 삼각형 수 기준을 초과했습니다. 메시를 경량화해 주세요.",
  "studio.producerError.glb.drawCallBudgetExceeded": "이 기기의 드로콜 기준을 초과했습니다. 메시와 재질을 병합해 주세요.",
  "studio.producerError.glb.materialBudgetExceeded": "이 기기의 재질 수 기준을 초과했습니다. 재질을 정리하거나 병합해 주세요.",
  "studio.producerError.glb.lightBudgetExceeded": "이 기기의 조명 수 기준을 초과했습니다. 조명 수를 줄여 주세요.",
  "studio.producerError.glb.animationCountBudgetExceeded": "이 기기의 애니메이션 클립 수 기준을 초과했습니다. 사용하지 않는 동작을 정리해 주세요.",
  "studio.producerError.glb.animationChannelBudgetExceeded": "이 기기의 애니메이션 채널 수 기준을 초과했습니다. 애니메이션 트랙을 단순화해 주세요.",
  "studio.producerError.glb.animationKeyframeBudgetExceeded": "이 기기의 애니메이션 키프레임 기준을 초과했습니다. 키프레임을 줄여 주세요.",
  "studio.producerError.glb.animationValueBudgetExceeded": "이 기기의 애니메이션 데이터 메모리 기준을 초과했습니다. 애니메이션을 압축하거나 단순화해 주세요.",
  "studio.producerError.glb.skinCountBudgetExceeded": "이 기기의 스킨 수 기준을 초과했습니다. 리깅 구조를 단순화해 주세요.",
  "studio.producerError.glb.jointCountBudgetExceeded": "이 기기의 조인트 수 기준을 초과했습니다. 본 구조를 단순화해 주세요.",
  "studio.producerError.glb.morphTargetBudgetExceeded": "이 기기의 모프 타깃 수 기준을 초과했습니다. 표정·변형 타깃을 정리해 주세요.",
  "studio.producerError.glb.accessorElementBudgetExceeded": "이 기기의 3D 데이터 요소 수 기준을 초과했습니다. 메시와 애니메이션을 단순화해 주세요.",
  "studio.producerError.glb.geometryMemoryBudgetExceeded": "이 기기의 디코딩된 3D 데이터 메모리 기준을 초과했습니다. 메시·리깅·애니메이션을 최적화해 주세요.",
  "studio.producerError.glb.textureCountBudgetExceeded": "이 기기의 텍스처 개수 기준을 초과했습니다. 텍스처를 정리해 주세요.",
  "studio.producerError.glb.textureByteBudgetExceeded": "이 기기의 내장 텍스처 용량 기준을 초과했습니다. 텍스처를 압축해 주세요.",
  "studio.producerError.glb.textureDimensionBudgetExceeded": "이 기기의 텍스처 해상도 기준을 초과했습니다. 텍스처 크기를 낮춰 주세요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.glb.invalidInput": "Could not read the 3D model file's binary data. Please select the file again.",
  "studio.producerError.glb.invalidOptions": "The 3D model safety check settings are invalid. Please refresh the workspace.",
  "studio.producerError.glb.invalidDeclaredMetadata": "Could not verify the 3D model's size or integrity information. Please register the file again.",
  "studio.producerError.glb.mimeTypeMismatch": "Only 3D models in a supported GLB format can be loaded.",
  "studio.producerError.glb.byteSizeMismatch": "The 3D model's recorded size differs from the actual file size. Please register the original file again.",
  "studio.producerError.glb.fileTooLarge": "A 3D model can be loaded up to 100MiB per file. Please optimize the model.",
  "studio.producerError.glb.modelByteBudgetExceeded": "This exceeds the device's 3D model size limit. Please use a smaller model.",
  "studio.producerError.glb.cumulativeByteBudgetExceeded": "This exceeds the project's cumulative 3D model size limit. Please remove models you no longer use.",
  "studio.producerError.glb.digestUnavailable": "3D model integrity checks are unavailable in this environment. Please try again in a current browser.",
  "studio.producerError.glb.digestFailed": "Could not complete the 3D model integrity check. Please select the file again.",
  "studio.producerError.glb.hashMismatch": "The 3D model has changed or been corrupted since it was registered. Please register a trusted original again.",
  "studio.producerError.glb.truncatedHeader": "The 3D model file is incomplete. Please download the original GLB file again.",
  "studio.producerError.glb.invalidMagic": "This file is not a valid GLB model. Please export it in GLB 2.0 format.",
  "studio.producerError.glb.unsupportedVersion": "Only GLB 2.0 models are supported. Please re-export the model as GLB 2.0.",
  "studio.producerError.glb.declaredLengthMismatch": "The 3D model container length does not match the actual file. Please re-export the original file.",
  "studio.producerError.glb.missingJsonChunk": "The 3D model is missing required scene information. Please re-export the GLB file.",
  "studio.producerError.glb.jsonChunkTooLarge": "The 3D model's scene information exceeds the safe processing limit. Please simplify the model.",
  "studio.producerError.glb.invalidChunkAlignment": "The 3D model's internal block alignment is invalid. Please re-export the GLB file.",
  "studio.producerError.glb.invalidChunkBounds": "An internal block of the 3D model is truncated or corrupted. Please download the original file again.",
  "studio.producerError.glb.duplicateJsonChunk": "The 3D model contains a duplicate scene information block. Please re-export the GLB file.",
  "studio.producerError.glb.duplicateBinChunk": "The 3D model contains a duplicate binary resource block. Please re-export the GLB file.",
  "studio.producerError.glb.unsupportedChunkType": "This GLB model contains an unsupported internal block. Please re-export it as standard GLB 2.0.",
  "studio.producerError.glb.invalidJsonEncoding": "The character encoding of the 3D model's scene information is invalid. Please re-export the GLB file.",
  "studio.producerError.glb.invalidJson": "Could not parse the 3D model's scene information. Please re-export the GLB file.",
  "studio.producerError.glb.invalidGltfRoot": "The 3D model's glTF 2.0 scene structure is invalid. Please re-export the file.",
  "studio.producerError.glb.unsupportedRequiredExtension": "This model contains a required 3D extension that cannot be processed safely right now. Please re-export with compatible options.",
  "studio.producerError.glb.externalResourceUri": "Models that reference external files or network resources cannot be loaded. Please embed all resources inside the GLB.",
  "studio.producerError.glb.missingBinChunk": "The 3D model is missing a required embedded resource. Please embed the textures and meshes inside the GLB.",
  "studio.producerError.glb.invalidBuffer": "The 3D model's embedded binary resource information is invalid. Please re-export the file.",
  "studio.producerError.glb.invalidBufferView": "The 3D model's embedded resource range is invalid. Please re-export the file.",
  "studio.producerError.glb.invalidAccessor": "Could not verify the 3D model's geometry data counts. Please re-export the file.",
  "studio.producerError.glb.invalidMesh": "The 3D model's mesh structure is invalid. Please re-export the file.",
  "studio.producerError.glb.invalidNode": "The 3D model's scene node structure is invalid. Please re-export the file.",
  "studio.producerError.glb.invalidAnimation": "The 3D model's animation structure is invalid. Please clean up the animation and re-export.",
  "studio.producerError.glb.invalidSkin": "The 3D model's skin or joint structure is invalid. Please clean up the rigging and re-export.",
  "studio.producerError.glb.invalidImage": "The 3D model's embedded image structure is invalid. Please re-export in a supported format.",
  "studio.producerError.glb.basisTranscodeFailed": "Could not safely decode the 3D model's Basis texture. Please re-export the texture.",
  "studio.producerError.glb.arithmeticOverflow": "Could not safely compute the 3D model's complexity. Please simplify the model.",
  "studio.producerError.glb.nodeBudgetExceeded": "This exceeds the device's scene node count limit. Please simplify the model hierarchy.",
  "studio.producerError.glb.triangleBudgetExceeded": "This exceeds the device's triangle count limit. Please reduce the mesh weight.",
  "studio.producerError.glb.drawCallBudgetExceeded": "This exceeds the device's draw call limit. Please merge meshes and materials.",
  "studio.producerError.glb.materialBudgetExceeded": "This exceeds the device's material count limit. Please organize or merge materials.",
  "studio.producerError.glb.lightBudgetExceeded": "This exceeds the device's light count limit. Please reduce the number of lights.",
  "studio.producerError.glb.animationCountBudgetExceeded": "This exceeds the device's animation clip count limit. Please remove unused motions.",
  "studio.producerError.glb.animationChannelBudgetExceeded": "This exceeds the device's animation channel count limit. Please simplify the animation tracks.",
  "studio.producerError.glb.animationKeyframeBudgetExceeded": "This exceeds the device's animation keyframe limit. Please reduce the keyframes.",
  "studio.producerError.glb.animationValueBudgetExceeded": "This exceeds the device's animation data memory limit. Please compress or simplify the animation.",
  "studio.producerError.glb.skinCountBudgetExceeded": "This exceeds the device's skin count limit. Please simplify the rigging structure.",
  "studio.producerError.glb.jointCountBudgetExceeded": "This exceeds the device's joint count limit. Please simplify the bone structure.",
  "studio.producerError.glb.morphTargetBudgetExceeded": "This exceeds the device's morph target count limit. Please organize the expression and deformation targets.",
  "studio.producerError.glb.accessorElementBudgetExceeded": "This exceeds the device's 3D data element count limit. Please simplify the meshes and animations.",
  "studio.producerError.glb.geometryMemoryBudgetExceeded": "This exceeds the device's decoded 3D data memory limit. Please optimize the meshes, rigging, and animations.",
  "studio.producerError.glb.textureCountBudgetExceeded": "This exceeds the device's texture count limit. Please organize the textures.",
  "studio.producerError.glb.textureByteBudgetExceeded": "This exceeds the device's embedded texture size limit. Please compress the textures.",
  "studio.producerError.glb.textureDimensionBudgetExceeded": "This exceeds the device's texture resolution limit. Please reduce the texture size.",
});

const GLB_ERROR_KEYS: Readonly<Record<StudioBg3dGlbFailureCode, string>> = {
  "invalid-input": "studio.producerError.glb.invalidInput",
  "invalid-options": "studio.producerError.glb.invalidOptions",
  "invalid-declared-metadata": "studio.producerError.glb.invalidDeclaredMetadata",
  "mime-type-mismatch": "studio.producerError.glb.mimeTypeMismatch",
  "byte-size-mismatch": "studio.producerError.glb.byteSizeMismatch",
  "file-too-large": "studio.producerError.glb.fileTooLarge",
  "model-byte-budget-exceeded": "studio.producerError.glb.modelByteBudgetExceeded",
  "cumulative-byte-budget-exceeded": "studio.producerError.glb.cumulativeByteBudgetExceeded",
  "digest-unavailable": "studio.producerError.glb.digestUnavailable",
  "digest-failed": "studio.producerError.glb.digestFailed",
  "hash-mismatch": "studio.producerError.glb.hashMismatch",
  "truncated-header": "studio.producerError.glb.truncatedHeader",
  "invalid-magic": "studio.producerError.glb.invalidMagic",
  "unsupported-version": "studio.producerError.glb.unsupportedVersion",
  "declared-length-mismatch": "studio.producerError.glb.declaredLengthMismatch",
  "missing-json-chunk": "studio.producerError.glb.missingJsonChunk",
  "json-chunk-too-large": "studio.producerError.glb.jsonChunkTooLarge",
  "invalid-chunk-alignment": "studio.producerError.glb.invalidChunkAlignment",
  "invalid-chunk-bounds": "studio.producerError.glb.invalidChunkBounds",
  "duplicate-json-chunk": "studio.producerError.glb.duplicateJsonChunk",
  "duplicate-bin-chunk": "studio.producerError.glb.duplicateBinChunk",
  "unsupported-chunk-type": "studio.producerError.glb.unsupportedChunkType",
  "invalid-json-encoding": "studio.producerError.glb.invalidJsonEncoding",
  "invalid-json": "studio.producerError.glb.invalidJson",
  "invalid-gltf-root": "studio.producerError.glb.invalidGltfRoot",
  "unsupported-required-extension": "studio.producerError.glb.unsupportedRequiredExtension",
  "external-resource-uri": "studio.producerError.glb.externalResourceUri",
  "missing-bin-chunk": "studio.producerError.glb.missingBinChunk",
  "invalid-buffer": "studio.producerError.glb.invalidBuffer",
  "invalid-buffer-view": "studio.producerError.glb.invalidBufferView",
  "invalid-accessor": "studio.producerError.glb.invalidAccessor",
  "invalid-mesh": "studio.producerError.glb.invalidMesh",
  "invalid-node": "studio.producerError.glb.invalidNode",
  "invalid-animation": "studio.producerError.glb.invalidAnimation",
  "invalid-skin": "studio.producerError.glb.invalidSkin",
  "invalid-image": "studio.producerError.glb.invalidImage",
  "basis-transcode-failed": "studio.producerError.glb.basisTranscodeFailed",
  "arithmetic-overflow": "studio.producerError.glb.arithmeticOverflow",
  "node-budget-exceeded": "studio.producerError.glb.nodeBudgetExceeded",
  "triangle-budget-exceeded": "studio.producerError.glb.triangleBudgetExceeded",
  "draw-call-budget-exceeded": "studio.producerError.glb.drawCallBudgetExceeded",
  "material-budget-exceeded": "studio.producerError.glb.materialBudgetExceeded",
  "light-budget-exceeded": "studio.producerError.glb.lightBudgetExceeded",
  "animation-count-budget-exceeded": "studio.producerError.glb.animationCountBudgetExceeded",
  "animation-channel-budget-exceeded": "studio.producerError.glb.animationChannelBudgetExceeded",
  "animation-keyframe-budget-exceeded": "studio.producerError.glb.animationKeyframeBudgetExceeded",
  "animation-value-budget-exceeded": "studio.producerError.glb.animationValueBudgetExceeded",
  "skin-count-budget-exceeded": "studio.producerError.glb.skinCountBudgetExceeded",
  "joint-count-budget-exceeded": "studio.producerError.glb.jointCountBudgetExceeded",
  "morph-target-budget-exceeded": "studio.producerError.glb.morphTargetBudgetExceeded",
  "accessor-element-budget-exceeded": "studio.producerError.glb.accessorElementBudgetExceeded",
  "geometry-memory-budget-exceeded": "studio.producerError.glb.geometryMemoryBudgetExceeded",
  "texture-count-budget-exceeded": "studio.producerError.glb.textureCountBudgetExceeded",
  "texture-byte-budget-exceeded": "studio.producerError.glb.textureByteBudgetExceeded",
  "texture-dimension-budget-exceeded": "studio.producerError.glb.textureDimensionBudgetExceeded",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const GLB_ERROR_KO: Readonly<Record<StudioBg3dGlbFailureCode, string>> = {
  "invalid-input": "3D 모델 파일의 이진 데이터를 읽을 수 없습니다. 파일을 다시 선택해 주세요.",
  "invalid-options": "3D 모델 안전 검사 설정이 올바르지 않습니다. 작업공간을 새로고침해 주세요.",
  "invalid-declared-metadata": "3D 모델의 크기 또는 무결성 정보를 확인할 수 없습니다. 파일을 다시 등록해 주세요.",
  "mime-type-mismatch": "지원되는 GLB 형식의 3D 모델만 불러올 수 있습니다.",
  "byte-size-mismatch": "3D 모델의 기록된 크기와 실제 파일 크기가 다릅니다. 원본 파일을 다시 등록해 주세요.",
  "file-too-large": "3D 모델은 파일 하나당 최대 100MiB까지 불러올 수 있습니다. 모델을 최적화해 주세요.",
  "model-byte-budget-exceeded": "이 기기의 3D 모델 용량 기준을 초과했습니다. 더 작은 모델을 사용해 주세요.",
  "cumulative-byte-budget-exceeded": "프로젝트의 3D 모델 누적 용량 기준을 초과했습니다. 사용하지 않는 모델을 정리해 주세요.",
  "digest-unavailable": "이 환경에서는 3D 모델 무결성 검사를 사용할 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.",
  "digest-failed": "3D 모델 무결성 검사를 완료하지 못했습니다. 파일을 다시 선택해 주세요.",
  "hash-mismatch": "3D 모델이 등록 이후 변경되었거나 손상되었습니다. 신뢰할 수 있는 원본을 다시 등록해 주세요.",
  "truncated-header": "3D 모델 파일이 완전하지 않습니다. 원본 GLB 파일을 다시 받아 주세요.",
  "invalid-magic": "이 파일은 유효한 GLB 모델이 아닙니다. GLB 2.0 형식으로 내보내 주세요.",
  "unsupported-version": "GLB 2.0 모델만 지원합니다. 모델을 GLB 2.0으로 다시 내보내 주세요.",
  "declared-length-mismatch": "3D 모델 컨테이너 길이가 실제 파일과 맞지 않습니다. 원본 파일을 다시 내보내 주세요.",
  "missing-json-chunk": "3D 모델에 필수 장면 정보가 없습니다. GLB 파일을 다시 내보내 주세요.",
  "json-chunk-too-large": "3D 모델의 장면 정보가 안전 처리 한도를 초과했습니다. 모델을 단순화해 주세요.",
  "invalid-chunk-alignment": "3D 모델 내부 블록 정렬이 올바르지 않습니다. GLB 파일을 다시 내보내 주세요.",
  "invalid-chunk-bounds": "3D 모델 내부 블록이 잘렸거나 손상되었습니다. 원본 파일을 다시 받아 주세요.",
  "duplicate-json-chunk": "3D 모델에 장면 정보 블록이 중복되어 있습니다. GLB 파일을 다시 내보내 주세요.",
  "duplicate-bin-chunk": "3D 모델에 이진 리소스 블록이 중복되어 있습니다. GLB 파일을 다시 내보내 주세요.",
  "unsupported-chunk-type": "지원하지 않는 내부 블록이 포함된 GLB 모델입니다. 표준 GLB 2.0으로 다시 내보내 주세요.",
  "invalid-json-encoding": "3D 모델 장면 정보의 문자 인코딩이 올바르지 않습니다. GLB 파일을 다시 내보내 주세요.",
  "invalid-json": "3D 모델 장면 정보를 해석할 수 없습니다. GLB 파일을 다시 내보내 주세요.",
  "invalid-gltf-root": "3D 모델의 glTF 2.0 장면 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "unsupported-required-extension": "현재 안전하게 처리할 수 없는 필수 3D 확장이 포함되어 있습니다. 호환 옵션으로 다시 내보내 주세요.",
  "external-resource-uri": "외부 파일이나 네트워크 리소스를 참조하는 모델은 불러올 수 없습니다. 모든 리소스를 GLB 안에 포함해 주세요.",
  "missing-bin-chunk": "3D 모델에 필요한 내장 리소스가 없습니다. 텍스처와 메시를 GLB 안에 포함해 주세요.",
  "invalid-buffer": "3D 모델의 내장 이진 리소스 정보가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "invalid-buffer-view": "3D 모델의 내장 리소스 범위가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "invalid-accessor": "3D 모델의 기하 데이터 개수 정보를 확인할 수 없습니다. 파일을 다시 내보내 주세요.",
  "invalid-mesh": "3D 모델의 메시 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "invalid-node": "3D 모델의 장면 노드 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "invalid-animation": "3D 모델의 애니메이션 구조가 올바르지 않습니다. 애니메이션을 정리해 다시 내보내 주세요.",
  "invalid-skin": "3D 모델의 스킨 또는 조인트 구조가 올바르지 않습니다. 리깅을 정리해 다시 내보내 주세요.",
  "invalid-image": "3D 모델의 내장 이미지 구조가 올바르지 않습니다. 지원 형식으로 다시 내보내 주세요.",
  "basis-transcode-failed": "3D 모델의 Basis 텍스처를 안전하게 디코딩할 수 없습니다. 텍스처를 다시 내보내 주세요.",
  "arithmetic-overflow": "3D 모델의 복잡도를 안전하게 계산할 수 없습니다. 모델을 단순화해 주세요.",
  "node-budget-exceeded": "이 기기의 장면 노드 수 기준을 초과했습니다. 모델 계층을 단순화해 주세요.",
  "triangle-budget-exceeded": "이 기기의 삼각형 수 기준을 초과했습니다. 메시를 경량화해 주세요.",
  "draw-call-budget-exceeded": "이 기기의 드로콜 기준을 초과했습니다. 메시와 재질을 병합해 주세요.",
  "material-budget-exceeded": "이 기기의 재질 수 기준을 초과했습니다. 재질을 정리하거나 병합해 주세요.",
  "light-budget-exceeded": "이 기기의 조명 수 기준을 초과했습니다. 조명 수를 줄여 주세요.",
  "animation-count-budget-exceeded": "이 기기의 애니메이션 클립 수 기준을 초과했습니다. 사용하지 않는 동작을 정리해 주세요.",
  "animation-channel-budget-exceeded": "이 기기의 애니메이션 채널 수 기준을 초과했습니다. 애니메이션 트랙을 단순화해 주세요.",
  "animation-keyframe-budget-exceeded": "이 기기의 애니메이션 키프레임 기준을 초과했습니다. 키프레임을 줄여 주세요.",
  "animation-value-budget-exceeded": "이 기기의 애니메이션 데이터 메모리 기준을 초과했습니다. 애니메이션을 압축하거나 단순화해 주세요.",
  "skin-count-budget-exceeded": "이 기기의 스킨 수 기준을 초과했습니다. 리깅 구조를 단순화해 주세요.",
  "joint-count-budget-exceeded": "이 기기의 조인트 수 기준을 초과했습니다. 본 구조를 단순화해 주세요.",
  "morph-target-budget-exceeded": "이 기기의 모프 타깃 수 기준을 초과했습니다. 표정·변형 타깃을 정리해 주세요.",
  "accessor-element-budget-exceeded": "이 기기의 3D 데이터 요소 수 기준을 초과했습니다. 메시와 애니메이션을 단순화해 주세요.",
  "geometry-memory-budget-exceeded": "이 기기의 디코딩된 3D 데이터 메모리 기준을 초과했습니다. 메시·리깅·애니메이션을 최적화해 주세요.",
  "texture-count-budget-exceeded": "이 기기의 텍스처 개수 기준을 초과했습니다. 텍스처를 정리해 주세요.",
  "texture-byte-budget-exceeded": "이 기기의 내장 텍스처 용량 기준을 초과했습니다. 텍스처를 압축해 주세요.",
  "texture-dimension-budget-exceeded": "이 기기의 텍스처 해상도 기준을 초과했습니다. 텍스처 크기를 낮춰 주세요.",
};

/**
 * 표시 지점 전용 해석 (glb 검증): 구조화 실패를 직접 받는 표시·집계 지점이 부른다.
 * generic-3d admission처럼 결과 타입의 message가 문자열로 고정된 집계 경계에서는
 * 그 경계 안에서만 이 함수로 해석한다(집계자 예외).
 */
export function resolveStudioBg3dGlbError(error: StudioBg3dGlbValidationFailure): string {
  return resolveProducerError(GLB_ERROR_KEYS[error.code], GLB_ERROR_KO[error.code]);
}

/**
 * 표시 지점 전용 해석 (glb 검증, 원인 객체 진입점): StudioCharacterConversionPage의
 * catch가 원인 객체만으로 부른다. 생산자 오류 클래스(StudioCharacterGlbValidationError)를
 * 런타임 import하면 studio 진입 그래프에 conversion-renderer(THREE)가 끌려오므로,
 * 이름+코드 덕 타이핑으로 판정한다. 해당하지 않으면 null — 호출자는 기존 메시지 경로로 폴백한다.
 */
export function resolveStudioBg3dGlbErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if (name !== "StudioCharacterGlbValidationError" || typeof code !== "string") return null;
  if (!Object.hasOwn(GLB_ERROR_KEYS, code)) return null;
  return resolveStudioBg3dGlbError({ ok: false, code: code as StudioBg3dGlbFailureCode });
}
