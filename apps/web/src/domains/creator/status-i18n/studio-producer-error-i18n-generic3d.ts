/**
 * 생산자 구조화 에러 해석 모듈 — generic3d 구간: studio-generic-3d-model-mode의
 * capability 라벨 10 + capability detail 25 + limitation 제목 12 + limitation
 * 상세 12 + admission 3 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.8).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * 동적 개수 5종(partAvailable·partNotStored·boneAvailable·animationAvailable·
 * morphAvailable·materialAvailable 중 개수 템플릿)은 {count} params로 분해했다 —
 * 생산자가 이관 전과 같은 ko-KR 천 단위 표기로 포맷해 싣는다(en-US와 표기가 같다).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioGeneric3dAdmissionMessageCode,
  StudioGeneric3dCapabilityDetailCode,
  StudioGeneric3dLimitationDetailCode,
} from "../studio-generic-3d-model-mode-codes";
import type {
  StudioGeneric3dAdmissionManifest,
  StudioGeneric3dCapability,
  StudioGeneric3dCapabilityId,
  StudioGeneric3dClassification,
  StudioGeneric3dLimitation,
  StudioGeneric3dRigStatus,
} from "../studio-generic-3d-model-mode";

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
  "studio.producerError.generic3d.capabilityLabel.root-transform": "전체 이동·회전·크기",
  "studio.producerError.generic3d.capabilityLabel.part-transform": "부위별 조작",
  "studio.producerError.generic3d.capabilityLabel.bone-pose": "본 포즈",
  "studio.producerError.generic3d.capabilityLabel.skinned-deformation": "스킨 변형",
  "studio.producerError.generic3d.capabilityLabel.animation-playback": "애니메이션 재생",
  "studio.producerError.generic3d.capabilityLabel.morph-expression": "표정·모프",
  "studio.producerError.generic3d.capabilityLabel.pose-proxy": "포즈 프록시",
  "studio.producerError.generic3d.capabilityLabel.material-editing": "재질 편집",
  "studio.producerError.generic3d.capabilityLabel.normal-map": "노멀맵 표현",
  "studio.producerError.generic3d.capabilityLabel.surface-snap": "표면 스냅",
  "studio.producerError.generic3d.capabilityDetail.blocked": "안전 검사를 통과해야 사용할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.pending": "변환된 GLB의 최종 안전 검사를 기다리고 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.rootTransform": "모델 전체를 이동·회전·크기 조절할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.partAvailable": "{count}개 부위를 개별 선택할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.partNotStored": "{count}개 부위를 감지했지만 이 장면 형식은 부위별 변환을 아직 저장하지 않습니다.",
  "studio.producerError.generic3d.capabilityDetail.partSingle": "분리된 부위가 없어 전체 모델만 조작할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.boneAvailable": "{count}개 본을 포즈 대상으로 사용할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.boneUnavailable": "본 구조가 없어 메시를 관절처럼 구부릴 수 없습니다.",
  "studio.producerError.generic3d.capabilityDetail.skinnedAvailable": "스킨 웨이트가 연결되어 본 회전이 메시를 변형합니다.",
  "studio.producerError.generic3d.capabilityDetail.skinnedUnavailable": "스킨 웨이트가 확인되지 않았습니다.",
  "studio.producerError.generic3d.capabilityDetail.animationAvailable": "{count}개 애니메이션 클립을 재생할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.animationUnavailable": "내장 애니메이션 클립이 없습니다.",
  "studio.producerError.generic3d.capabilityDetail.morphAvailable": "{count}개 모프 타깃을 조절할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.morphUnavailable": "표정 또는 형태용 모프 타깃이 없습니다.",
  "studio.producerError.generic3d.capabilityDetail.poseRig": "본 프록시가 실제 리그를 조작합니다.",
  "studio.producerError.generic3d.capabilityDetail.poseParts": "부위 노드를 프록시로 움직일 수 있지만 스킨 변형은 적용되지 않습니다.",
  "studio.producerError.generic3d.capabilityDetail.poseGuideOnly": "부위 구조는 감지됐지만 현재 장면 형식에서는 가이드로만 표시합니다.",
  "studio.producerError.generic3d.capabilityDetail.poseStatic": "가이드 프록시만 제공됩니다. 단일 정적 메시는 변형되지 않습니다.",
  "studio.producerError.generic3d.capabilityDetail.materialAvailable": "{count}개 재질을 조정할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.materialUnavailable": "편집 가능한 재질이 확인되지 않았습니다.",
  "studio.producerError.generic3d.capabilityDetail.normalAvailable": "노멀 또는 범프 텍스처를 유지합니다.",
  "studio.producerError.generic3d.capabilityDetail.normalUnknown": "검증 메트릭만으로 노멀맵 슬롯을 확정할 수 없어 렌더러 로드 후 확인합니다.",
  "studio.producerError.generic3d.capabilityDetail.normalUnavailable": "노멀 또는 범프 텍스처가 없습니다.",
  "studio.producerError.generic3d.capabilityDetail.surfaceSnap": "바닥과 다른 3D 표면에 모델을 스냅할 수 있습니다.",
  "studio.producerError.generic3d.capabilityDetail.unknown": "이 모델의 기능 정보를 확인할 수 없습니다.",
  "studio.producerError.generic3d.limitationTitle.validation-blocked": "안전 검사 실패",
  "studio.producerError.generic3d.limitationTitle.canonical-validation-pending": "최종 GLB 검사 대기",
  "studio.producerError.generic3d.limitationTitle.static-no-deformation": "정적 모델",
  "studio.producerError.generic3d.limitationTitle.single-part-model": "단일 부위",
  "studio.producerError.generic3d.limitationTitle.part-transform-runtime-unavailable": "부위 구조는 읽기 전용",
  "studio.producerError.generic3d.limitationTitle.missing-animation": "애니메이션 없음",
  "studio.producerError.generic3d.limitationTitle.missing-morph-targets": "표정 모프 없음",
  "studio.producerError.generic3d.limitationTitle.missing-mtl": "MTL 미연결",
  "studio.producerError.generic3d.limitationTitle.normal-map-unknown": "노멀맵 로드 후 확인",
  "studio.producerError.generic3d.limitationTitle.rights-review": "이용 권리 확인 필요",
  "studio.producerError.generic3d.limitationTitle.commercial-use-restricted": "상업 이용 미확인",
  "studio.producerError.generic3d.limitationTitle.team-share-restricted": "팀 원본 공유 제한",
  "studio.producerError.generic3d.limitationDetail.validation-blocked": "{text}",
  "studio.producerError.generic3d.limitationDetail.canonical-validation-pending": "OBJ 구조 검사는 통과했지만 변환된 GLB의 해시·기기 예산 검사가 남아 있습니다.",
  "studio.producerError.generic3d.limitationDetail.static-no-deformation": "루트·분리 부위는 조작할 수 있지만 관절 기반 메시 변형은 지원하지 않습니다.",
  "studio.producerError.generic3d.limitationDetail.single-part-model": "모델 내부에 따로 선택할 부위가 없어 전체 변환만 적용됩니다.",
  "studio.producerError.generic3d.limitationDetail.part-transform-runtime-unavailable": "부위는 감지했지만 현재 장면 문서가 내부 노드 변환을 저장하지 않아 전체 모델과 본만 조작합니다.",
  "studio.producerError.generic3d.limitationDetail.missing-animation": "재생 가능한 내장 애니메이션 클립이 없습니다.",
  "studio.producerError.generic3d.limitationDetail.missing-morph-targets": "표정이나 형태를 바꾸는 모프 타깃이 없습니다.",
  "studio.producerError.generic3d.limitationDetail.missing-mtl": "OBJ와 함께 MTL·텍스처를 선택해야 원본 재질을 보존할 수 있습니다.",
  "studio.producerError.generic3d.limitationDetail.normal-map-unknown": "GLB 검증기는 텍스처 예산만 확인하므로 실제 재질 슬롯은 렌더러 로드 후 판별합니다.",
  "studio.producerError.generic3d.limitationDetail.rights-review": "상업 공개나 팀 공유 전에 원본 모델의 라이선스와 출처를 확인해 주세요.",
  "studio.producerError.generic3d.limitationDetail.commercial-use-restricted": "이 권리 기록으로는 상업 작품 사용을 승인하지 않습니다.",
  "studio.producerError.generic3d.limitationDetail.team-share-restricted": "협업자에게 원본 모델 파일을 재배포할 수 없는 권리 기록입니다.",
  "studio.producerError.generic3d.admission.passthrough": "{text}",
  "studio.producerError.generic3d.admission.verifiedPassed": "저장된 GLB의 무결성·구조·기기 예산 검사를 통과했습니다.",
  "studio.producerError.generic3d.admission.objPending": "OBJ 구조 검사를 통과했습니다. 변환된 GLB의 최종 안전 검사가 필요합니다.",
  "studio.producerError.generic3d.classificationLabel.character": "캐릭터",
  "studio.producerError.generic3d.classificationLabel.creature": "크리처",
  "studio.producerError.generic3d.classificationLabel.prop": "소품",
  "studio.producerError.generic3d.rigLabel.skinned": "스킨 리그",
  "studio.producerError.generic3d.rigLabel.rigged": "본 리그",
  "studio.producerError.generic3d.rigLabel.static": "정적 모델",
  "studio.producerError.generic3d.rigLabel.unverified": "구조 확인 전",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.generic3d.capabilityLabel.root-transform": "Move · rotate · scale whole model",
  "studio.producerError.generic3d.capabilityLabel.part-transform": "Per-part manipulation",
  "studio.producerError.generic3d.capabilityLabel.bone-pose": "Bone posing",
  "studio.producerError.generic3d.capabilityLabel.skinned-deformation": "Skin deformation",
  "studio.producerError.generic3d.capabilityLabel.animation-playback": "Animation playback",
  "studio.producerError.generic3d.capabilityLabel.morph-expression": "Expression · morphs",
  "studio.producerError.generic3d.capabilityLabel.pose-proxy": "Pose proxy",
  "studio.producerError.generic3d.capabilityLabel.material-editing": "Material editing",
  "studio.producerError.generic3d.capabilityLabel.normal-map": "Normal map rendering",
  "studio.producerError.generic3d.capabilityLabel.surface-snap": "Surface snap",
  "studio.producerError.generic3d.capabilityDetail.blocked": "This becomes available after the safety checks pass.",
  "studio.producerError.generic3d.capabilityDetail.pending": "Waiting for the final safety check of the converted GLB.",
  "studio.producerError.generic3d.capabilityDetail.rootTransform": "You can move, rotate, and scale the whole model.",
  "studio.producerError.generic3d.capabilityDetail.partAvailable": "You can select {count} parts individually.",
  "studio.producerError.generic3d.capabilityDetail.partNotStored": "Detected {count} parts, but this scene format does not store per-part transforms yet.",
  "studio.producerError.generic3d.capabilityDetail.partSingle": "There are no separate parts, so only the whole model can be manipulated.",
  "studio.producerError.generic3d.capabilityDetail.boneAvailable": "You can pose {count} bones.",
  "studio.producerError.generic3d.capabilityDetail.boneUnavailable": "There is no bone structure, so the mesh cannot be bent like a joint.",
  "studio.producerError.generic3d.capabilityDetail.skinnedAvailable": "Skin weights are connected, so bone rotation deforms the mesh.",
  "studio.producerError.generic3d.capabilityDetail.skinnedUnavailable": "No skin weights were found.",
  "studio.producerError.generic3d.capabilityDetail.animationAvailable": "You can play {count} animation clips.",
  "studio.producerError.generic3d.capabilityDetail.animationUnavailable": "There are no built-in animation clips.",
  "studio.producerError.generic3d.capabilityDetail.morphAvailable": "You can adjust {count} morph targets.",
  "studio.producerError.generic3d.capabilityDetail.morphUnavailable": "There are no morph targets for expressions or shapes.",
  "studio.producerError.generic3d.capabilityDetail.poseRig": "The bone proxy manipulates the actual rig.",
  "studio.producerError.generic3d.capabilityDetail.poseParts": "You can move part nodes as proxies, but skin deformation is not applied.",
  "studio.producerError.generic3d.capabilityDetail.poseGuideOnly": "A part structure was detected, but in the current scene format it is shown as a guide only.",
  "studio.producerError.generic3d.capabilityDetail.poseStatic": "Only a guide proxy is provided. A single static mesh is not deformed.",
  "studio.producerError.generic3d.capabilityDetail.materialAvailable": "You can adjust {count} materials.",
  "studio.producerError.generic3d.capabilityDetail.materialUnavailable": "No editable materials were found.",
  "studio.producerError.generic3d.capabilityDetail.normalAvailable": "Normal or bump textures are preserved.",
  "studio.producerError.generic3d.capabilityDetail.normalUnknown": "The normal map slot cannot be confirmed from validation metrics alone, so it is checked after the renderer loads it.",
  "studio.producerError.generic3d.capabilityDetail.normalUnavailable": "There are no normal or bump textures.",
  "studio.producerError.generic3d.capabilityDetail.surfaceSnap": "You can snap the model to the floor and other 3D surfaces.",
  "studio.producerError.generic3d.capabilityDetail.unknown": "Capability information for this model is unavailable.",
  "studio.producerError.generic3d.limitationTitle.validation-blocked": "Safety check failed",
  "studio.producerError.generic3d.limitationTitle.canonical-validation-pending": "Waiting for final GLB check",
  "studio.producerError.generic3d.limitationTitle.static-no-deformation": "Static model",
  "studio.producerError.generic3d.limitationTitle.single-part-model": "Single part",
  "studio.producerError.generic3d.limitationTitle.part-transform-runtime-unavailable": "Part structure is read-only",
  "studio.producerError.generic3d.limitationTitle.missing-animation": "No animation",
  "studio.producerError.generic3d.limitationTitle.missing-morph-targets": "No expression morphs",
  "studio.producerError.generic3d.limitationTitle.missing-mtl": "MTL not linked",
  "studio.producerError.generic3d.limitationTitle.normal-map-unknown": "Checked after normal map loads",
  "studio.producerError.generic3d.limitationTitle.rights-review": "Rights review needed",
  "studio.producerError.generic3d.limitationTitle.commercial-use-restricted": "Commercial use unconfirmed",
  "studio.producerError.generic3d.limitationTitle.team-share-restricted": "Team source sharing restricted",
  "studio.producerError.generic3d.limitationDetail.validation-blocked": "{text}",
  "studio.producerError.generic3d.limitationDetail.canonical-validation-pending": "The OBJ structure check passed, but the hash and device budget checks of the converted GLB remain.",
  "studio.producerError.generic3d.limitationDetail.static-no-deformation": "The root and separate parts can be manipulated, but joint-based mesh deformation is not supported.",
  "studio.producerError.generic3d.limitationDetail.single-part-model": "There are no separately selectable parts inside the model, so only whole-model transforms apply.",
  "studio.producerError.generic3d.limitationDetail.part-transform-runtime-unavailable": "Parts were detected, but the current scene document does not store internal node transforms, so only the whole model and bones can be manipulated.",
  "studio.producerError.generic3d.limitationDetail.missing-animation": "There are no playable built-in animation clips.",
  "studio.producerError.generic3d.limitationDetail.missing-morph-targets": "There are no morph targets that change expressions or shapes.",
  "studio.producerError.generic3d.limitationDetail.missing-mtl": "You must select the MTL and textures together with the OBJ to preserve the original materials.",
  "studio.producerError.generic3d.limitationDetail.normal-map-unknown": "The GLB validator checks only the texture budget, so the actual material slot is determined after the renderer loads it.",
  "studio.producerError.generic3d.limitationDetail.rights-review": "Please check the original model's license and source before commercial release or team sharing.",
  "studio.producerError.generic3d.limitationDetail.commercial-use-restricted": "This rights record does not approve use in commercial works.",
  "studio.producerError.generic3d.limitationDetail.team-share-restricted": "This rights record does not allow redistributing the original model file to collaborators.",
  "studio.producerError.generic3d.admission.passthrough": "{text}",
  "studio.producerError.generic3d.admission.verifiedPassed": "The stored GLB passed the integrity, structure, and device budget checks.",
  "studio.producerError.generic3d.admission.objPending": "The OBJ structure check passed. The final safety check of the converted GLB is required.",
  "studio.producerError.generic3d.classificationLabel.character": "Character",
  "studio.producerError.generic3d.classificationLabel.creature": "Creature",
  "studio.producerError.generic3d.classificationLabel.prop": "Prop",
  "studio.producerError.generic3d.rigLabel.skinned": "Skinned rig",
  "studio.producerError.generic3d.rigLabel.rigged": "Bone rig",
  "studio.producerError.generic3d.rigLabel.static": "Static model",
  "studio.producerError.generic3d.rigLabel.unverified": "Structure not checked yet",
});

const CAPABILITY_LABEL_KEYS: Readonly<Record<StudioGeneric3dCapabilityId, string>> = {
  "root-transform": "studio.producerError.generic3d.capabilityLabel.root-transform",
  "part-transform": "studio.producerError.generic3d.capabilityLabel.part-transform",
  "bone-pose": "studio.producerError.generic3d.capabilityLabel.bone-pose",
  "skinned-deformation": "studio.producerError.generic3d.capabilityLabel.skinned-deformation",
  "animation-playback": "studio.producerError.generic3d.capabilityLabel.animation-playback",
  "morph-expression": "studio.producerError.generic3d.capabilityLabel.morph-expression",
  "pose-proxy": "studio.producerError.generic3d.capabilityLabel.pose-proxy",
  "material-editing": "studio.producerError.generic3d.capabilityLabel.material-editing",
  "normal-map": "studio.producerError.generic3d.capabilityLabel.normal-map",
  "surface-snap": "studio.producerError.generic3d.capabilityLabel.surface-snap",
};

const CAPABILITY_LABEL_KO: Readonly<Record<StudioGeneric3dCapabilityId, string>> = {
  "root-transform": "전체 이동·회전·크기",
  "part-transform": "부위별 조작",
  "bone-pose": "본 포즈",
  "skinned-deformation": "스킨 변형",
  "animation-playback": "애니메이션 재생",
  "morph-expression": "표정·모프",
  "pose-proxy": "포즈 프록시",
  "material-editing": "재질 편집",
  "normal-map": "노멀맵 표현",
  "surface-snap": "표면 스냅",
};

/** 표시 지점 전용 해석 (generic3d capability 라벨): capability id가 곧 라벨 코드다. */
export function resolveStudioGeneric3dCapabilityLabel(id: StudioGeneric3dCapabilityId): string {
  return resolveProducerError(CAPABILITY_LABEL_KEYS[id], CAPABILITY_LABEL_KO[id]);
}

const CAPABILITY_DETAIL_KEYS: Readonly<Record<StudioGeneric3dCapabilityDetailCode, string>> = {
  blocked: "studio.producerError.generic3d.capabilityDetail.blocked",
  pending: "studio.producerError.generic3d.capabilityDetail.pending",
  rootTransform: "studio.producerError.generic3d.capabilityDetail.rootTransform",
  partAvailable: "studio.producerError.generic3d.capabilityDetail.partAvailable",
  partNotStored: "studio.producerError.generic3d.capabilityDetail.partNotStored",
  partSingle: "studio.producerError.generic3d.capabilityDetail.partSingle",
  boneAvailable: "studio.producerError.generic3d.capabilityDetail.boneAvailable",
  boneUnavailable: "studio.producerError.generic3d.capabilityDetail.boneUnavailable",
  skinnedAvailable: "studio.producerError.generic3d.capabilityDetail.skinnedAvailable",
  skinnedUnavailable: "studio.producerError.generic3d.capabilityDetail.skinnedUnavailable",
  animationAvailable: "studio.producerError.generic3d.capabilityDetail.animationAvailable",
  animationUnavailable: "studio.producerError.generic3d.capabilityDetail.animationUnavailable",
  morphAvailable: "studio.producerError.generic3d.capabilityDetail.morphAvailable",
  morphUnavailable: "studio.producerError.generic3d.capabilityDetail.morphUnavailable",
  poseRig: "studio.producerError.generic3d.capabilityDetail.poseRig",
  poseParts: "studio.producerError.generic3d.capabilityDetail.poseParts",
  poseGuideOnly: "studio.producerError.generic3d.capabilityDetail.poseGuideOnly",
  poseStatic: "studio.producerError.generic3d.capabilityDetail.poseStatic",
  materialAvailable: "studio.producerError.generic3d.capabilityDetail.materialAvailable",
  materialUnavailable: "studio.producerError.generic3d.capabilityDetail.materialUnavailable",
  normalAvailable: "studio.producerError.generic3d.capabilityDetail.normalAvailable",
  normalUnknown: "studio.producerError.generic3d.capabilityDetail.normalUnknown",
  normalUnavailable: "studio.producerError.generic3d.capabilityDetail.normalUnavailable",
  surfaceSnap: "studio.producerError.generic3d.capabilityDetail.surfaceSnap",
  unknown: "studio.producerError.generic3d.capabilityDetail.unknown",
};

const CAPABILITY_DETAIL_KO: Readonly<Record<StudioGeneric3dCapabilityDetailCode, string>> = {
  blocked: "안전 검사를 통과해야 사용할 수 있습니다.",
  pending: "변환된 GLB의 최종 안전 검사를 기다리고 있습니다.",
  rootTransform: "모델 전체를 이동·회전·크기 조절할 수 있습니다.",
  partAvailable: "{count}개 부위를 개별 선택할 수 있습니다.",
  partNotStored: "{count}개 부위를 감지했지만 이 장면 형식은 부위별 변환을 아직 저장하지 않습니다.",
  partSingle: "분리된 부위가 없어 전체 모델만 조작할 수 있습니다.",
  boneAvailable: "{count}개 본을 포즈 대상으로 사용할 수 있습니다.",
  boneUnavailable: "본 구조가 없어 메시를 관절처럼 구부릴 수 없습니다.",
  skinnedAvailable: "스킨 웨이트가 연결되어 본 회전이 메시를 변형합니다.",
  skinnedUnavailable: "스킨 웨이트가 확인되지 않았습니다.",
  animationAvailable: "{count}개 애니메이션 클립을 재생할 수 있습니다.",
  animationUnavailable: "내장 애니메이션 클립이 없습니다.",
  morphAvailable: "{count}개 모프 타깃을 조절할 수 있습니다.",
  morphUnavailable: "표정 또는 형태용 모프 타깃이 없습니다.",
  poseRig: "본 프록시가 실제 리그를 조작합니다.",
  poseParts: "부위 노드를 프록시로 움직일 수 있지만 스킨 변형은 적용되지 않습니다.",
  poseGuideOnly: "부위 구조는 감지됐지만 현재 장면 형식에서는 가이드로만 표시합니다.",
  poseStatic: "가이드 프록시만 제공됩니다. 단일 정적 메시는 변형되지 않습니다.",
  materialAvailable: "{count}개 재질을 조정할 수 있습니다.",
  materialUnavailable: "편집 가능한 재질이 확인되지 않았습니다.",
  normalAvailable: "노멀 또는 범프 텍스처를 유지합니다.",
  normalUnknown: "검증 메트릭만으로 노멀맵 슬롯을 확정할 수 없어 렌더러 로드 후 확인합니다.",
  normalUnavailable: "노멀 또는 범프 텍스처가 없습니다.",
  surfaceSnap: "바닥과 다른 3D 표면에 모델을 스냅할 수 있습니다.",
  unknown: "이 모델의 기능 정보를 확인할 수 없습니다.",
};

/** 표시 지점 전용 해석 (generic3d capability 상세): Panel의 sr-only 힌트 렌더가 부른다. */
export function resolveStudioGeneric3dCapabilityDetail(
  capability: Pick<StudioGeneric3dCapability, "detailCode" | "detailParams">,
): string {
  return resolveProducerError(
    CAPABILITY_DETAIL_KEYS[capability.detailCode],
    CAPABILITY_DETAIL_KO[capability.detailCode],
    capability.detailParams,
  );
}

const LIMITATION_TITLE_KO: Readonly<Record<StudioGeneric3dLimitation["code"], string>> = {
  "validation-blocked": "안전 검사 실패",
  "canonical-validation-pending": "최종 GLB 검사 대기",
  "static-no-deformation": "정적 모델",
  "single-part-model": "단일 부위",
  "part-transform-runtime-unavailable": "부위 구조는 읽기 전용",
  "missing-animation": "애니메이션 없음",
  "missing-morph-targets": "표정 모프 없음",
  "missing-mtl": "MTL 미연결",
  "normal-map-unknown": "노멀맵 로드 후 확인",
  "rights-review": "이용 권리 확인 필요",
  "commercial-use-restricted": "상업 이용 미확인",
  "team-share-restricted": "팀 원본 공유 제한",
};

const LIMITATION_DETAIL_KO: Readonly<Record<StudioGeneric3dLimitationDetailCode, string>> = {
  "validation-blocked": "{text}",
  "canonical-validation-pending": "OBJ 구조 검사는 통과했지만 변환된 GLB의 해시·기기 예산 검사가 남아 있습니다.",
  "static-no-deformation": "루트·분리 부위는 조작할 수 있지만 관절 기반 메시 변형은 지원하지 않습니다.",
  "single-part-model": "모델 내부에 따로 선택할 부위가 없어 전체 변환만 적용됩니다.",
  "part-transform-runtime-unavailable": "부위는 감지했지만 현재 장면 문서가 내부 노드 변환을 저장하지 않아 전체 모델과 본만 조작합니다.",
  "missing-animation": "재생 가능한 내장 애니메이션 클립이 없습니다.",
  "missing-morph-targets": "표정이나 형태를 바꾸는 모프 타깃이 없습니다.",
  "missing-mtl": "OBJ와 함께 MTL·텍스처를 선택해야 원본 재질을 보존할 수 있습니다.",
  "normal-map-unknown": "GLB 검증기는 텍스처 예산만 확인하므로 실제 재질 슬롯은 렌더러 로드 후 판별합니다.",
  "rights-review": "상업 공개나 팀 공유 전에 원본 모델의 라이선스와 출처를 확인해 주세요.",
  "commercial-use-restricted": "이 권리 기록으로는 상업 작품 사용을 승인하지 않습니다.",
  "team-share-restricted": "협업자에게 원본 모델 파일을 재배포할 수 없는 권리 기록입니다.",
};

/** 표시 지점 전용 해석 (generic3d limitation 제목): limitation code가 곧 제목 코드다. */
export function resolveStudioGeneric3dLimitationTitle(
  limitation: Pick<StudioGeneric3dLimitation, "code">,
): string {
  return resolveProducerError(
    `studio.producerError.generic3d.limitationTitle.${limitation.code}`,
    LIMITATION_TITLE_KO[limitation.code],
  );
}

/** 표시 지점 전용 해석 (generic3d limitation 상세): Panel limitations 렌더가 부른다. */
export function resolveStudioGeneric3dLimitationDetail(
  limitation: Pick<StudioGeneric3dLimitation, "detailCode" | "detailParams">,
): string {
  return resolveProducerError(
    `studio.producerError.generic3d.limitationDetail.${limitation.detailCode}`,
    LIMITATION_DETAIL_KO[limitation.detailCode],
    limitation.detailParams,
  );
}

const ADMISSION_KEYS: Readonly<Record<StudioGeneric3dAdmissionMessageCode, string>> = {
  passthrough: "studio.producerError.generic3d.admission.passthrough",
  verifiedPassed: "studio.producerError.generic3d.admission.verifiedPassed",
  objPending: "studio.producerError.generic3d.admission.objPending",
};

const ADMISSION_KO: Readonly<Record<StudioGeneric3dAdmissionMessageCode, string>> = {
  passthrough: "{text}",
  verifiedPassed: "저장된 GLB의 무결성·구조·기기 예산 검사를 통과했습니다.",
  objPending: "OBJ 구조 검사를 통과했습니다. 변환된 GLB의 최종 안전 검사가 필요합니다.",
};

/** 표시 지점 전용 해석 (generic3d admission): Panel admission 렌더가 부른다. */
export function resolveStudioGeneric3dAdmissionMessage(
  admission: Pick<StudioGeneric3dAdmissionManifest, "messageCode" | "messageParams">,
): string {
  return resolveProducerError(ADMISSION_KEYS[admission.messageCode], ADMISSION_KO[admission.messageCode], admission.messageParams);
}

const CLASSIFICATION_LABEL_KO: Readonly<Record<StudioGeneric3dClassification, string>> = {
  character: "캐릭터",
  creature: "크리처",
  prop: "소품",
};

/** 표시 지점 전용 해석 (generic3d 분류 라벨): Panel 분류 버튼 렌더가 부른다. */
export function resolveStudioGeneric3dClassificationLabel(
  classification: StudioGeneric3dClassification,
): string {
  return resolveProducerError(
    `studio.producerError.generic3d.classificationLabel.${classification}`,
    CLASSIFICATION_LABEL_KO[classification],
  );
}

const RIG_LABEL_KO: Readonly<Record<StudioGeneric3dRigStatus, string>> = {
  skinned: "스킨 리그",
  rigged: "본 리그",
  static: "정적 모델",
  unverified: "구조 확인 전",
};

/** 표시 지점 전용 해석 (generic3d 리그 라벨): Panel 상태 렌더가 부른다. */
export function resolveStudioGeneric3dRigLabel(rigStatus: StudioGeneric3dRigStatus): string {
  return resolveProducerError(
    `studio.producerError.generic3d.rigLabel.${rigStatus}`,
    RIG_LABEL_KO[rigStatus],
  );
}
