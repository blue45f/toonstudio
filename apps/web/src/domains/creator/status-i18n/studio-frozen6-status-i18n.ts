/**
 * 파일 크기 래칫 동결 비컴포넌트(.ts) 상태 문구 사전 6 (A4 cat4 동결 비tsx 이관 — frozen6).
 *
 * 소비 파일이 전부 래칫 기준선과 동률이라 순증이 불가능하므로, 문구는 이
 * 모듈로 이관하고 소비 파일에서는 import 1줄 증가분을 같은 파일 안의 다중행
 * 호출·삼항·객체 접기와 중복 문구 키 통합으로 상쇄해 줄 수를 중립(±0 이하)으로
 * 맞춘다. frozen1~5 모듈은 각 테스트가 전 키의 소비 파일을 단언해 확장이
 * 불가능하므로 형제 모듈로 분리했다.
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (studio-frozen6-status-i18n-r7frz6.test.ts가 패리티를 고정한다). 표시 채널
 * 문구(오류 채널 setError 리터럴·상태/사유 반환 message·진단 message·진행
 * 라벨)만 다루며, throw·Result error 같은 생산자 채널, 포맷·프로토콜 상수,
 * 콘텐츠 본문·데이터는 대상이 아니다. 소비자가 전부 비컴포넌트 모듈이라
 * 현재 로케일로 해석하는 `frozenStatus6Text` 헬퍼를 함께 둔다
 * (studio-frozen-status-i18n 선례).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";


// ── studio-pdf-conformance-profile.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.pdfProfile.scanFailed": "PDF conformance evidence를 끝까지 수집하지 못했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.pdfProfile.scanFailed": "Could not finish collecting the PDF conformance evidence.",
});

// ── export/studio-export-presets.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.exportPresets.vipsLoadFailed": "선택된 고품질 축소 엔진(wasm-vips)을 불러오지 못해 내보내기를 중단했어요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.exportPresets.vipsLoadFailed": "Could not load the selected high-quality downscale engine (wasm-vips), so the export was stopped.",
});

// ── studio-screen-share.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.screenShare.iceSendFailed": "WebRTC 네트워크 후보를 보내지 못했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.screenShare.iceSendFailed": "Could not send the WebRTC network candidate.",
});

// ── live/studio-peer-bulk-transfer.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.peerBulk.receiveFailed": "P2P 수신 처리에 실패했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.peerBulk.receiveFailed": "P2P receive processing failed.",
});

// ── studio-cuttoon-editor/studio-cuttoon-stage-pointers-release.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.pointersRelease.physicsFrameUnverified": "최종 물리 프레임을 검증하지 못했습니다.",
  "studio.frozenStatus6.pointersRelease.textureResultUnverified": "최종 질감 결과를 검증하지 못했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.pointersRelease.physicsFrameUnverified": "Could not verify the final physics frame.",
  "studio.frozenStatus6.pointersRelease.textureResultUnverified": "Could not verify the final texture result.",
});

// ── studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-armed.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.downArmed.dragInsideLineart": "선화 이미지 안을 드래그해 시드를 찍어 주세요.",
  "studio.frozenStatus6.downArmed.runHintPlanFirst": "먼저 자동 채색 힌트 계획을 한 번 실행해 선화 크기를 맞춰 주세요.",
  "studio.frozenStatus6.downArmed.unlockForTailTarget": "말풍선 또는 상위 그룹의 잠금을 해제한 뒤 꼬리 대상을 지정해 주세요.",
  "studio.frozenStatus6.downArmed.selfTailTarget": "말풍선 자기 자신은 부착 대상으로 고를 수 없어요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.downArmed.dragInsideLineart": "Drag inside the line-art image to place a seed.",
  "studio.frozenStatus6.downArmed.runHintPlanFirst": "Run the auto-color hint plan once first to fit the line-art size.",
  "studio.frozenStatus6.downArmed.unlockForTailTarget": "Unlock the speech balloon or its parent group, then choose a tail target.",
  "studio.frozenStatus6.downArmed.selfTailTarget": "A speech balloon cannot be its own attachment target.",
});

// ── layer/studio-layer-lift-workflow.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.layerLift.applyCanceled": "레이어 분리 적용을 취소했습니다.",
  "studio.frozenStatus6.layerLift.documentChanged": "원고가 바뀌어 레이어 분리 결과를 적용하지 않았습니다.",
  "studio.frozenStatus6.layerLift.finalStateUnknown": "최종 원고 상태를 확인하지 못해 결과를 적용하지 않았습니다.",
  "studio.frozenStatus6.layerLift.pngConversionFailed": "검증된 배경·전경 PNG를 로컬 레이어 데이터로 변환하지 못했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.layerLift.applyCanceled": "Applying the layer separation was canceled.",
  "studio.frozenStatus6.layerLift.documentChanged": "The document changed, so the layer separation result was not applied.",
  "studio.frozenStatus6.layerLift.finalStateUnknown": "Could not confirm the final document state, so the result was not applied.",
  "studio.frozenStatus6.layerLift.pngConversionFailed": "Could not convert the verified background/foreground PNGs into local layer data.",
});

// ── studio-project-archive-orchestration-runtime.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.archiveOrch.jsonExportFailed": "프로젝트 JSON을 만들지 못했습니다. 대용량 원본 자산은 무결성 archive를 이용해 주세요.",
  "studio.frozenStatus6.archiveOrch.createFailed": "프로젝트 archive를 만들지 못했어요.",
  "studio.frozenStatus6.archiveOrch.readFailed": "프로젝트 archive를 읽지 못했어요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.archiveOrch.jsonExportFailed": "Could not create the project JSON. For large original assets, use an integrity archive.",
  "studio.frozenStatus6.archiveOrch.createFailed": "Could not create the project archive.",
  "studio.frozenStatus6.archiveOrch.readFailed": "Could not read the project archive.",
});

// ── bg3d/studio-bg3d-editor-scene-ops-host.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.sceneOps.budgetExceeded": "현재 장면이 안전 예산을 초과해 템플릿 저장을 시작하지 않았습니다. 장면을 나누거나 일부 오브젝트를 정리해 주세요.",
  "studio.frozenStatus6.sceneOps.losslessSourceUnavailable": "현재 장면을 손실 없는 템플릿 원본으로 만들 수 없습니다. 문제가 있는 도형이나 모델을 확인해 주세요.",
  "studio.frozenStatus6.sceneOps.templateSaveFailed": "현재 장면 템플릿을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.sceneOps.templateDeleteFailed": "템플릿을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "studio.frozenStatus6.sceneOps.objectLimit": "이 장면에는 오브젝트를 최대 {limit}개까지 둘 수 있습니다. 장면을 나누거나 기존 오브젝트를 정리해 주세요.",
  "studio.frozenStatus6.sceneOps.bundleIdFailed": "템플릿을 한 묶음으로 추적할 안전한 식별자를 만들지 못해 장면을 변경하지 않았습니다.",
  "studio.frozenStatus6.sceneOps.childTransformUnpreservable": "부모를 삭제해도 자식의 월드 변환을 보존할 수 없어 삭제를 취소했습니다.",
  "studio.frozenStatus6.sceneOps.cloneBundleIdFailed": "템플릿 복제 묶음의 안전한 식별자를 만들지 못해 장면을 변경하지 않았습니다.",
  "studio.frozenStatus6.sceneOps.organizerLoadFailed": "템플릿 정리 도구를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.sceneOps.budgetExceeded": "The current scene exceeds the safety budget, so template saving was not started. Split the scene or remove some objects.",
  "studio.frozenStatus6.sceneOps.losslessSourceUnavailable": "The current scene cannot be made into a lossless template source. Check the shapes or models causing the problem.",
  "studio.frozenStatus6.sceneOps.templateSaveFailed": "Could not save the current scene template. Check the storage space and try again.",
  "studio.frozenStatus6.sceneOps.templateDeleteFailed": "Could not delete the template. Please try again shortly.",
  "studio.frozenStatus6.sceneOps.objectLimit": "This scene can hold at most {limit} objects. Split the scene or remove existing objects.",
  "studio.frozenStatus6.sceneOps.bundleIdFailed": "Could not create a safe identifier to track the template as one bundle, so the scene was not changed.",
  "studio.frozenStatus6.sceneOps.childTransformUnpreservable": "Deleting the parent cannot preserve the children's world transforms, so the deletion was canceled.",
  "studio.frozenStatus6.sceneOps.cloneBundleIdFailed": "Could not create a safe identifier for the cloned template bundle, so the scene was not changed.",
  "studio.frozenStatus6.sceneOps.organizerLoadFailed": "Could not load the template organizer tool. Please try again shortly.",
});

// ── bg3d/studio-bg3d-editor-placement-host.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.placement.outOfBounds": "선택한 위치가 3D 장면의 안전 범위를 벗어나 배치를 취소했습니다.",
  "studio.frozenStatus6.placement.attachmentUnknown": "배치할 3D 모델의 장면 연결 정보를 확인할 수 없어 장면을 변경하지 않았습니다.",
  "studio.frozenStatus6.placement.budgetUnknown": "3D 모델 원본 개수 예산을 확인할 수 없어 장면을 변경하지 않았습니다.",
  "studio.frozenStatus6.placement.integrityUnknown": "3D 모델의 원본·경계와 무결성을 확인하지 못해 배치 미리보기를 시작하지 않았습니다.",
  "studio.frozenStatus6.placement.templateOriginalMissing": "이 템플릿이 참조하는 3D 모델 원본을 현재 기기에서 찾을 수 없습니다. 모델 라이브러리에서 원본을 다시 가져온 뒤 재시도해 주세요.",
  "studio.frozenStatus6.placement.templateIntegrityUnknown": "템플릿의 모든 모델 원본과 무결성을 확인하지 못해 장면을 변경하지 않았습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.placement.outOfBounds": "The chosen position is outside the 3D scene's safe range, so placement was canceled.",
  "studio.frozenStatus6.placement.attachmentUnknown": "Could not verify the scene link information for the 3D model to place, so the scene was not changed.",
  "studio.frozenStatus6.placement.budgetUnknown": "Could not verify the original-model count budget, so the scene was not changed.",
  "studio.frozenStatus6.placement.integrityUnknown": "Could not verify the 3D model's originals, bounds, and integrity, so the placement preview was not started.",
  "studio.frozenStatus6.placement.templateOriginalMissing": "The 3D model original referenced by this template cannot be found on this device. Import the original again from the model library and retry.",
  "studio.frozenStatus6.placement.templateIntegrityUnknown": "Could not verify all model originals and integrity for the template, so the scene was not changed.",
});

// ── bg3d/studio-bg3d-editor-transform-host.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.transform.skewParent": "현재 부모 변환에는 기울어짐이 생겨 위치를 보존할 수 없습니다. 부모의 비균일 크기 조정을 확인해 주세요.",
  "studio.frozenStatus6.transform.enableConstraintFirst": "굽기 전에 강도가 0보다 큰 IK 또는 에임 제약을 켜 주세요.",
  "studio.frozenStatus6.transform.rigFixFailed": "현재 리그 결과를 안전하게 고정할 수 없습니다. 조인트 계층·크기 변환과 모델 준비 상태를 확인해 주세요.",
  "studio.frozenStatus6.transform.frameNormalizeFailed": "현재 표시 프레임을 정적 포즈로 정규화하지 못했습니다.",
  "studio.frozenStatus6.transform.physicsLocked": "물리 미리보기 중에는 장면 변형 도구를 잠급니다.",
  "studio.frozenStatus6.transform.selectCustomModel": "배치 정리할 커스텀 모델을 선택해 주세요.",
  "studio.frozenStatus6.transform.arrangeMaxInputs": "배치 정리는 한 번에 최대 {max}개까지 지원합니다.",
  "studio.frozenStatus6.transform.customModelOnly": "배치 정리는 커스텀 모델에만 사용할 수 있습니다.",
  "studio.frozenStatus6.transform.unlockObjectFirst": "선택한 객체의 잠금을 먼저 해제해 주세요.",
  "studio.frozenStatus6.transform.arrangeFailed": "배치 정리를 적용할 수 없습니다.",
  "studio.frozenStatus6.transform.geometryNotReady": "선택한 객체의 지오메트리를 아직 준비하지 못했습니다. 모델이 표시된 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.transform.geometryBoundsInvalid": "선택한 객체의 지오메트리 경계가 올바르지 않아 원점 정렬을 취소했습니다.",
  "studio.frozenStatus6.transform.cameraViewUnsafe": "카메라 구도를 안전한 장면 상태로 만들지 못해 명령을 취소했습니다.",
  "studio.frozenStatus6.transform.projectionNotReady": "현재 카메라 투영이 아직 준비되지 않아 구도를 변경하지 않았습니다.",
  "studio.frozenStatus6.transform.cameraNotReady": "카메라가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
  "studio.frozenStatus6.transform.zoomLimit": "현재 카메라에서는 더 확대하거나 축소할 수 없습니다.",
  "studio.frozenStatus6.transform.presetApplyFailed": "선택한 카메라 프리셋을 적용하지 못했습니다.",
  "studio.frozenStatus6.transform.fitAfterCapture": "3D 장면 캡처가 끝난 뒤 화면 맞춤을 사용해 주세요.",
  "studio.frozenStatus6.transform.boundsNotReady": "선택한 객체의 실제 경계 또는 카메라 화면을 아직 준비하지 못했습니다. 모델이 표시된 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.transform.fitOutOfRange": "선택한 객체를 현재 카메라 투영과 렌즈 이동 범위 안에 맞출 수 없어 구도를 유지했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.transform.skewParent": "The current parent transform introduces skew, so the position cannot be preserved. Check the parent's non-uniform scaling.",
  "studio.frozenStatus6.transform.enableConstraintFirst": "Before baking, enable an IK or aim constraint with strength above 0.",
  "studio.frozenStatus6.transform.rigFixFailed": "The current rig result cannot be fixed safely. Check the joint hierarchy, scale transforms, and model readiness.",
  "studio.frozenStatus6.transform.frameNormalizeFailed": "Could not normalize the current display frame into a static pose.",
  "studio.frozenStatus6.transform.physicsLocked": "Scene transform tools are locked during the physics preview.",
  "studio.frozenStatus6.transform.selectCustomModel": "Select a custom model to arrange.",
  "studio.frozenStatus6.transform.arrangeMaxInputs": "Arranging supports at most {max} items at a time.",
  "studio.frozenStatus6.transform.customModelOnly": "Arranging can only be used with custom models.",
  "studio.frozenStatus6.transform.unlockObjectFirst": "Unlock the selected object first.",
  "studio.frozenStatus6.transform.arrangeFailed": "Could not apply the arrangement.",
  "studio.frozenStatus6.transform.geometryNotReady": "The selected object's geometry is not ready yet. Try again after the model is displayed.",
  "studio.frozenStatus6.transform.geometryBoundsInvalid": "The selected object's geometry bounds are invalid, so origin alignment was canceled.",
  "studio.frozenStatus6.transform.cameraViewUnsafe": "Could not turn the camera view into a safe scene state, so the command was canceled.",
  "studio.frozenStatus6.transform.projectionNotReady": "The current camera projection is not ready yet, so the view was not changed.",
  "studio.frozenStatus6.transform.cameraNotReady": "The camera is not ready yet. Please try again shortly.",
  "studio.frozenStatus6.transform.zoomLimit": "The current camera cannot zoom in or out any further.",
  "studio.frozenStatus6.transform.presetApplyFailed": "Could not apply the selected camera preset.",
  "studio.frozenStatus6.transform.fitAfterCapture": "Use fit-to-view after the 3D scene capture finishes.",
  "studio.frozenStatus6.transform.boundsNotReady": "The selected object's real bounds or the camera view are not ready yet. Try again after the model is displayed.",
  "studio.frozenStatus6.transform.fitOutOfRange": "Could not fit the selected object within the current camera projection and lens travel range, so the view was kept.",
});

// ── bg3d/studio-bg3d-shot-batch-export-run.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.shotBatch.captureBusy": "다른 3D 캡처가 진행 중입니다. 완료하거나 취소한 뒤 컷 배치 출력을 다시 실행해 주세요.",
  "studio.frozenStatus6.shotBatch.recordShotsFirst": "일괄 렌더할 컷을 먼저 기록해 주세요.",
  "studio.frozenStatus6.shotBatch.revisionPinFailed": "컷 배치 장면 revision을 안전하게 고정하지 못했습니다.",
  "studio.frozenStatus6.shotBatch.recoveryScopePreparing": "컷 배치 복구 범위를 준비하는 중입니다. 잠시 후 다시 실행해 주세요.",
  "studio.frozenStatus6.shotBatch.viewportNotReady": "컷을 렌더할 3D 뷰포트가 아직 준비되지 않았습니다.",
  "studio.frozenStatus6.shotBatch.runtimeLoading": "컷 출력 런타임 불러오는 중",
  "studio.frozenStatus6.shotBatch.accessChangedAbort": "작품 열람 권한 또는 저장 대상이 변경되어 컷 일괄 렌더를 안전하게 중단했습니다.",
  "studio.frozenStatus6.shotBatch.aborted": "컷 일괄 렌더를 중단했습니다.",
  "studio.frozenStatus6.shotBatch.planFailed": "결정적 컷 계획을 만들지 못했습니다.",
  "studio.frozenStatus6.shotBatch.cameraRestoreDeferred": "컷 배치 후 원래 카메라 구도를 즉시 복원하지 못했습니다. viewport가 준비되면 자동으로 다시 적용합니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.shotBatch.captureBusy": "Another 3D capture is in progress. Finish or cancel it, then run the shot batch output again.",
  "studio.frozenStatus6.shotBatch.recordShotsFirst": "Record the shots to batch-render first.",
  "studio.frozenStatus6.shotBatch.revisionPinFailed": "Could not safely pin the shot batch scene revision.",
  "studio.frozenStatus6.shotBatch.recoveryScopePreparing": "The shot batch recovery scope is being prepared. Please run it again shortly.",
  "studio.frozenStatus6.shotBatch.viewportNotReady": "The 3D viewport for rendering shots is not ready yet.",
  "studio.frozenStatus6.shotBatch.runtimeLoading": "Loading the shot output runtime",
  "studio.frozenStatus6.shotBatch.accessChangedAbort": "Viewing permission or the save target changed, so the shot batch render was stopped safely.",
  "studio.frozenStatus6.shotBatch.aborted": "The shot batch render was stopped.",
  "studio.frozenStatus6.shotBatch.planFailed": "Could not create a deterministic shot plan.",
  "studio.frozenStatus6.shotBatch.cameraRestoreDeferred": "Could not immediately restore the original camera view after the shot batch. It will be reapplied automatically when the viewport is ready.",
});

// ── layer/studio-layer-operations.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.layerOps.alreadyGrouped": "기존 그룹이 포함된 선택입니다. 먼저 그룹을 해제한 뒤 다시 그룹화해 주세요.",
  "studio.frozenStatus6.layerOps.masterMergeBlocked": "마스터 편집 중에는 레이어 병합을 사용할 수 없습니다.",
  "studio.frozenStatus6.layerOps.reviewLockedEdit": "이 페이지는 검토 잠금 상태입니다. 잠금을 해제한 뒤 레이어를 편집해 주세요.",
  "studio.frozenStatus6.layerOps.imageLayersOnly": "이미지 레이어끼리만 확장 블렌드로 합칠 수 있습니다.",
  "studio.frozenStatus6.layerOps.blendApplyFailed": "확장 블렌드를 적용하지 못했습니다(이미지 픽셀 읽기/인코딩 실패).",
  "studio.frozenStatus6.layerOps.frameNotFound": "컷 폴더로 묶을 프레임을 찾지 못했습니다.",
  "studio.frozenStatus6.layerOps.selectOtherLayers": "컷 폴더에 묶을 다른 레이어를 먼저 선택해 주세요.",
  "studio.frozenStatus6.layerOps.reviewLockedDelete": "이 페이지는 검토 잠금 상태입니다. 잠금을 해제한 뒤 레이어를 삭제해 주세요.",
  "studio.frozenStatus6.layerOps.stageLinkCleanupFailed": "삭제할 3D 배경의 원본 연결을 안전하게 정리하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.layerOps.alreadyGrouped": "The selection includes an existing group. Ungroup it first, then group again.",
  "studio.frozenStatus6.layerOps.masterMergeBlocked": "Layer merging is unavailable during master editing.",
  "studio.frozenStatus6.layerOps.reviewLockedEdit": "This page is review-locked. Unlock it before editing layers.",
  "studio.frozenStatus6.layerOps.imageLayersOnly": "Only image layers can be merged with extended blending.",
  "studio.frozenStatus6.layerOps.blendApplyFailed": "Could not apply the extended blend (image pixel read/encode failed).",
  "studio.frozenStatus6.layerOps.frameNotFound": "Could not find a frame to group into a shot folder.",
  "studio.frozenStatus6.layerOps.selectOtherLayers": "Select the other layers to group into the shot folder first.",
  "studio.frozenStatus6.layerOps.reviewLockedDelete": "This page is review-locked. Unlock it before deleting layers.",
  "studio.frozenStatus6.layerOps.stageLinkCleanupFailed": "Could not safely clean up the original links of the 3D background to delete. Check the link state and try again.",
});

// ── studio-page-vector-ops.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.vectorOps.engineStartFailed": "벡터 경로 엔진을 시작하지 못했어요. 다시 시도해 주세요.",
  "studio.frozenStatus6.vectorOps.commitStrokeFirst": "현재 획을 마친 뒤 도형을 결합할 수 있어요.",
  "studio.frozenStatus6.vectorOps.lockedShape": "잠긴 도형은 결합할 수 없어요.",
  "studio.frozenStatus6.vectorOps.reviewLocked": "이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 편집해 주세요.",
  "studio.frozenStatus6.vectorOps.budgetExceeded": "선택한 획이 너무 복잡해 안전한 경로 예산 안에서 정리하지 못했어요.",
  "studio.frozenStatus6.vectorOps.ineligibleBrush": "이 브러시는 질감과 획 의미를 보존하기 위해 경로 정리를 제한해요.",
  "studio.frozenStatus6.vectorOps.verifyFailed": "경로 정리 결과를 안전하게 검증하지 못했어요. 다시 시도해 주세요.",
  "studio.frozenStatus6.vectorOps.staleLockedRefine": "계산 중 획이나 작업면이 잠겨 경로 정리 결과를 적용하지 않았어요.",
  "studio.frozenStatus6.vectorOps.staleChangedRefine": "계산 중 페이지·선택 또는 획이 바뀌어 오래된 경로 정리 결과를 적용하지 않았어요.",
  "studio.frozenStatus6.vectorOps.commitFirstCombine": "마지막 획을 원고에 확정하지 못해 도형 결합을 시작하지 않았어요. 잠금·동기화 상태를 확인해 주세요.",
  "studio.frozenStatus6.vectorOps.differentGroups": "서로 다른 그룹의 도형은 바로 결합할 수 없어요. 같은 그룹 안에서 선택하거나 먼저 그룹을 해제해 주세요.",
  "studio.frozenStatus6.vectorOps.staleLockedCombine": "계산 중 페이지나 도형이 잠겨 결합 결과를 적용하지 않았어요.",
  "studio.frozenStatus6.vectorOps.staleChangedCombine": "계산 중 페이지·선택 또는 도형이 바뀌어 오래된 결합 결과를 적용하지 않았어요.",
  "studio.frozenStatus6.vectorOps.skiaTimeout": "선택한 Skia 도형 결합 시간이 초과되어 원본 도형을 유지했어요. 다음 작업 전에 provider를 다시 선택해 주세요.",
  "studio.frozenStatus6.vectorOps.skiaProviderUnavailable": "선택한 Skia 도형 결합 provider를 사용할 수 없어 원본 도형을 유지했어요. 다른 엔진은 자동으로 실행하지 않았습니다.",
  "studio.frozenStatus6.vectorOps.quickCombineFailed": "빠른 결합(다각형)을 처리하지 못해 원본 도형을 유지했어요. 기본 결합은 자동으로 실행하지 않았습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.vectorOps.engineStartFailed": "Could not start the vector path engine. Please try again.",
  "studio.frozenStatus6.vectorOps.commitStrokeFirst": "You can combine shapes after finishing the current stroke.",
  "studio.frozenStatus6.vectorOps.lockedShape": "Locked shapes cannot be combined.",
  "studio.frozenStatus6.vectorOps.reviewLocked": "This page is review-locked. Unlock it before editing.",
  "studio.frozenStatus6.vectorOps.budgetExceeded": "The selected stroke is too complex to refine within the safe path budget.",
  "studio.frozenStatus6.vectorOps.ineligibleBrush": "This brush limits path refinement to preserve its texture and stroke meaning.",
  "studio.frozenStatus6.vectorOps.verifyFailed": "Could not safely verify the path refinement result. Please try again.",
  "studio.frozenStatus6.vectorOps.staleLockedRefine": "A stroke or work surface was locked during computation, so the refinement result was not applied.",
  "studio.frozenStatus6.vectorOps.staleChangedRefine": "The page, selection, or stroke changed during computation, so the stale refinement result was not applied.",
  "studio.frozenStatus6.vectorOps.commitFirstCombine": "Could not commit the last stroke to the document, so shape combining was not started. Check the lock and sync state.",
  "studio.frozenStatus6.vectorOps.differentGroups": "Shapes in different groups cannot be combined directly. Select within one group or ungroup first.",
  "studio.frozenStatus6.vectorOps.staleLockedCombine": "The page or a shape was locked during computation, so the combine result was not applied.",
  "studio.frozenStatus6.vectorOps.staleChangedCombine": "The page, selection, or a shape changed during computation, so the stale combine result was not applied.",
  "studio.frozenStatus6.vectorOps.skiaTimeout": "The selected Skia shape combine timed out, so the original shapes were kept. Select the provider again before the next operation.",
  "studio.frozenStatus6.vectorOps.skiaProviderUnavailable": "The selected Skia shape combine provider is unavailable, so the original shapes were kept. No other engine was run automatically.",
  "studio.frozenStatus6.vectorOps.quickCombineFailed": "Could not process the quick (polygon) combine, so the original shapes were kept. The standard combine was not run automatically.",
});

// ── vrm/useStudioVrmPoserRuntimeE.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.vrmRuntimeE.hashOrSizeExceeded": "업로드한 VRM의 콘텐츠 해시를 확인하지 못했거나 휴대 가능한 프로젝트 자산 크기(96MB)를 넘었습니다.",
  "studio.frozenStatus6.vrmRuntimeE.rigUnverifiable": "체형 리그를 안전하게 확인할 수 없습니다. 캐릭터를 다시 불러온 뒤 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.jointsPending": "현재 체형의 관절·의상·소품 계산이 끝난 뒤 다시 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.memoryOnlyVrm": "현재 VRM은 SQLite/OPFS 저장 실패로 이 탭 메모리에만 있습니다. 새로고침 후 손실되지 않도록 저장소를 복구하고 다시 업로드한 뒤 프로젝트에 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.surfaceStrokeBusy": "V12 UV 표면 획의 저장 또는 취소가 끝난 뒤 이 포즈를 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.paintStrokeActive": "표면 페인트 획을 마친 뒤 이 포즈를 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.restoringPaint": "저장된 표면 페인팅 복원이 끝난 뒤 이 포즈를 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.restoreOriginalFailed": "저장된 표면 페인팅 원본을 복원하지 못해 재편집 장면을 안전하게 저장할 수 없습니다.",
  "studio.frozenStatus6.vrmRuntimeE.modelPreparing": "저장된 표면 페인팅의 모델 준비가 끝난 뒤 이 포즈를 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.sceneNotReady": "캡처할 VRM 장면이 아직 준비되지 않았습니다.",
  "studio.frozenStatus6.vrmRuntimeE.clothPosePending": "천 물리 스커트의 최신 포즈 계산이 준비된 뒤 다시 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.ikFixing": "손·발 고정점을 현재 포즈에 맞추는 중입니다. 보정 완료 후 다시 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.faceRigPending": "얼굴 조형이 현재 리그에 안전하게 반영된 뒤 다시 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.trackingActive": "실시간 추적·대기 애니메이션을 끈 뒤 현재 포즈를 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.captureBusy": "다른 3D 캡처가 진행 중입니다. 완료된 뒤 다시 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.captureViewNotReady": "추가할 3D 화면과 카메라가 아직 준비되지 않았습니다.",
  "studio.frozenStatus6.vrmRuntimeE.wardrobeChanged": "캡처 중 의상 설정이 바뀌어 이미지를 추가하지 않았습니다. 현재 의상으로 다시 추가해 주세요.",
  "studio.frozenStatus6.vrmRuntimeE.captureAddFailed": "3D 데생 인형 캡처를 추가하지 못했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.vrmRuntimeE.hashOrSizeExceeded": "Could not verify the uploaded VRM's content hash, or it exceeds the portable project asset size (96MB).",
  "studio.frozenStatus6.vrmRuntimeE.rigUnverifiable": "The proportion rig cannot be verified safely. Reload the character, then add it again.",
  "studio.frozenStatus6.vrmRuntimeE.jointsPending": "Add it again after the current proportion's joint, wardrobe, and prop calculations finish.",
  "studio.frozenStatus6.vrmRuntimeE.memoryOnlyVrm": "The current VRM exists only in this tab's memory because SQLite/OPFS saving failed. Restore storage and re-upload so it is not lost on refresh, then add it to the project.",
  "studio.frozenStatus6.vrmRuntimeE.surfaceStrokeBusy": "Add this pose after the V12 UV surface stroke is saved or canceled.",
  "studio.frozenStatus6.vrmRuntimeE.paintStrokeActive": "Add this pose after finishing the surface paint stroke.",
  "studio.frozenStatus6.vrmRuntimeE.restoringPaint": "Add this pose after the saved surface painting restore finishes.",
  "studio.frozenStatus6.vrmRuntimeE.restoreOriginalFailed": "Could not restore the saved surface painting original, so the re-edit scene cannot be saved safely.",
  "studio.frozenStatus6.vrmRuntimeE.modelPreparing": "Add this pose after the saved surface painting's model preparation finishes.",
  "studio.frozenStatus6.vrmRuntimeE.sceneNotReady": "The VRM scene to capture is not ready yet.",
  "studio.frozenStatus6.vrmRuntimeE.clothPosePending": "Add it again after the cloth-physics skirt's latest pose calculation is ready.",
  "studio.frozenStatus6.vrmRuntimeE.ikFixing": "Hand and foot anchors are being fitted to the current pose. Add it again after the correction completes.",
  "studio.frozenStatus6.vrmRuntimeE.faceRigPending": "Add it again after the face shaping is safely reflected in the current rig.",
  "studio.frozenStatus6.vrmRuntimeE.trackingActive": "Turn off live tracking and idle animation, then add the current pose.",
  "studio.frozenStatus6.vrmRuntimeE.captureBusy": "Another 3D capture is in progress. Add it again after it completes.",
  "studio.frozenStatus6.vrmRuntimeE.captureViewNotReady": "The 3D view and camera to add are not ready yet.",
  "studio.frozenStatus6.vrmRuntimeE.wardrobeChanged": "The wardrobe settings changed during capture, so the image was not added. Add it again with the current wardrobe.",
  "studio.frozenStatus6.vrmRuntimeE.captureAddFailed": "Could not add the 3D drawing figure capture.",
});

// ── studio-cuttoon-editor/studio-deferred-stroke-commit.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.deferred.saveInProgress": "저장 중에는 원고를 변경할 수 없어요. 저장이 끝난 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.deferred.dccShotMasterOnly": "DCC Shot 연결은 일반 페이지에서만 만들 수 있어요. 문서 마스터를 닫고 다시 추가해 주세요.",
  "studio.frozenStatus6.deferred.masterLocatorForbidden": "문서 마스터에는 연결형 3D pass locator나 correction을 둘 수 없어요.",
  "studio.frozenStatus6.deferred.reviewLocked": "이 페이지는 검토 잠금 상태예요. 페이지 검토에서 잠금을 해제한 뒤 편집해 주세요.",
  "studio.frozenStatus6.deferred.shotMisaligned": "연결된 3D Shot과 Canvas 레이어가 어긋나 변경을 적용하지 않았어요.",
  "studio.frozenStatus6.deferred.receiptCorrupt": "연결된 3D render receipt가 손상되어 변경을 적용하지 않았어요.",
  "studio.frozenStatus6.deferred.provenanceCorrupt": "분리할 3D artist correction provenance가 손상되어 변경을 적용하지 않았어요.",
  "studio.frozenStatus6.deferred.locatorReceiptMismatch": "연결된 3D pass locator나 correction이 receipt와 달라 변경을 적용하지 않았어요.",
  "studio.frozenStatus6.deferred.stageLayerMismatch": "연결된 3D Stage·Shot·Canvas layer가 달라 변경을 적용하지 않았어요.",
  "studio.frozenStatus6.deferred.pageNotFound": "현재 페이지를 찾지 못해 연속 편집을 적용하지 않았어요.",
  "studio.frozenStatus6.deferred.strokeInProgressPageLayout": "현재 획을 마친 뒤 페이지 구성을 변경할 수 있어요.",
  "studio.frozenStatus6.deferred.lockedPageIncluded": "잠긴 페이지가 포함된 변경이에요. 페이지 검토에서 잠금을 해제한 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.deferred.commitFirstPageOp": "마지막 획을 원고에 확정하지 못해 페이지 작업을 실행하지 않았어요. 잠금·동기화 상태를 확인한 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.deferred.canvasHeightRange": "페이지 높이는 1–{max}px 범위여야 저장할 수 있어요.",
  "studio.frozenStatus6.deferred.pageCountRange": "프로젝트는 1–{max}페이지 범위에서 편집할 수 있어요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.deferred.saveInProgress": "You cannot change the document while it is saving. Try again after the save finishes.",
  "studio.frozenStatus6.deferred.dccShotMasterOnly": "DCC Shot links can only be created on regular pages. Close the document master and add it again.",
  "studio.frozenStatus6.deferred.masterLocatorForbidden": "Linked 3D pass locators or corrections cannot be placed on a document master.",
  "studio.frozenStatus6.deferred.reviewLocked": "This page is review-locked. Unlock it in page review before editing.",
  "studio.frozenStatus6.deferred.shotMisaligned": "The linked 3D Shot and Canvas layer are out of alignment, so the change was not applied.",
  "studio.frozenStatus6.deferred.receiptCorrupt": "The linked 3D render receipt is corrupted, so the change was not applied.",
  "studio.frozenStatus6.deferred.provenanceCorrupt": "The 3D artist correction provenance to detach is corrupted, so the change was not applied.",
  "studio.frozenStatus6.deferred.locatorReceiptMismatch": "The linked 3D pass locator or correction differs from the receipt, so the change was not applied.",
  "studio.frozenStatus6.deferred.stageLayerMismatch": "The linked 3D Stage, Shot, or Canvas layer differs, so the change was not applied.",
  "studio.frozenStatus6.deferred.pageNotFound": "Could not find the current page, so the continuous edit was not applied.",
  "studio.frozenStatus6.deferred.strokeInProgressPageLayout": "You can change the page layout after finishing the current stroke.",
  "studio.frozenStatus6.deferred.lockedPageIncluded": "This change includes a locked page. Unlock it in page review and try again.",
  "studio.frozenStatus6.deferred.commitFirstPageOp": "Could not commit the last stroke to the document, so the page operation was not run. Check the lock and sync state and try again.",
  "studio.frozenStatus6.deferred.canvasHeightRange": "The page height must be within 1–{max}px to save.",
  "studio.frozenStatus6.deferred.pageCountRange": "The project can be edited within 1–{max} pages.",
});

// ── studio-page-save-pipeline.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.pageSave.loginForDraft": "로그인 후 서버 초안으로 저장할 수 있어요.",
  "studio.frozenStatus6.pageSave.loginForPublish": "로그인 후 게시할 수 있어요.",
  "studio.frozenStatus6.pageSave.coeditorContentOnly": "공동 편집자는 원고 내용만 저장할 수 있어요. 게시 상태 변경은 작품 소유자에게 요청해 주세요.",
  "studio.frozenStatus6.pageSave.commitFirstSave": "마지막 획을 원고에 확정하지 못해 저장을 시작하지 않았어요. 잠금·동기화 상태를 확인한 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.pageSave.changesRequested": "수정 요청 상태인 페이지가 있어 게시할 수 없어요. 검토 메모를 반영한 뒤 상태를 변경해 주세요.",
  "studio.frozenStatus6.pageSave.blockedChecks": "게시 전 필수 점검 {count}개를 확인해 주세요.",
  "studio.frozenStatus6.pageSave.changedDuringSave": "저장 요청 중 원고가 바뀌어 현재 로컬 변경을 유지했습니다. 내용을 확인한 뒤 다시 저장해 주세요.",
  "studio.frozenStatus6.pageSave.saveFailed": "저장에 실패했어요.",
  "studio.frozenStatus6.pageSave.teamPermissionChanged": "팀 편집 권한이 변경되어 서버 저장을 중단했습니다. 로컬 변경은 내보낸 뒤 소유자에게 전달해 주세요.",
  "studio.frozenStatus6.pageSave.teamPermissionUnknown": "팀 권한을 확인하지 못해 안전하게 읽기 전용으로 전환했습니다. 로컬 변경을 내보낸 뒤 다시 접속해 주세요.",
  "studio.frozenStatus6.pageSave.cleanupIncomplete": "저장은 중단했지만 업로드된 3D pass 정리를 완료하지 못했습니다. 다음 저장에서 같은 영수증으로 다시 확인해 주세요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.pageSave.loginForDraft": "Sign in to save as a server draft.",
  "studio.frozenStatus6.pageSave.loginForPublish": "Sign in to publish.",
  "studio.frozenStatus6.pageSave.coeditorContentOnly": "Co-editors can only save document content. Ask the work's owner to change the publish state.",
  "studio.frozenStatus6.pageSave.commitFirstSave": "Could not commit the last stroke to the document, so saving was not started. Check the lock and sync state and try again.",
  "studio.frozenStatus6.pageSave.changesRequested": "A page is in changes-requested state, so it cannot be published. Address the review notes, then change the state.",
  "studio.frozenStatus6.pageSave.blockedChecks": "Check the {count} required pre-publish checks.",
  "studio.frozenStatus6.pageSave.changedDuringSave": "The document changed during the save request, so the current local changes were kept. Review the content and save again.",
  "studio.frozenStatus6.pageSave.saveFailed": "Saving failed.",
  "studio.frozenStatus6.pageSave.teamPermissionChanged": "Team edit permission changed, so the server save was stopped. Export the local changes and hand them to the owner.",
  "studio.frozenStatus6.pageSave.teamPermissionUnknown": "Could not verify team permission, so the session switched safely to read-only. Export the local changes and reconnect.",
  "studio.frozenStatus6.pageSave.cleanupIncomplete": "The save was stopped, but cleanup of the uploaded 3D pass did not complete. It will be rechecked with the same receipt on the next save.",
});

// ── character-shaper/useCharacterShaperBinding.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.shaper.capturing": "캡처가 끝난 뒤에 다시 적용할 수 있습니다.",
  "studio.frozenStatus6.shaper.thumbnailing": "썸네일을 만드는 중입니다. 잠시 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.shaper.sharingPose": "포즈를 공유하는 중입니다. 끝나면 다시 적용할 수 있습니다.",
  "studio.frozenStatus6.shaper.broadcastPreview": "방송 미리보기를 끄면 다시 적용할 수 있습니다.",
  "studio.frozenStatus6.shaper.rigApplying": "체형 리그를 적용하는 중입니다.",
  "studio.frozenStatus6.shaper.rigReloadRequired": "체형 리그를 다시 불러와야 합니다.",
  "studio.frozenStatus6.shaper.characterLoading": "VRM 캐릭터를 불러오는 중입니다.",
  "studio.frozenStatus6.shaper.characterLoadFailed": "VRM 캐릭터를 불러오지 못했습니다. 모델 상태를 확인한 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.shaper.characterNotLoaded": "VRM 캐릭터를 먼저 불러오세요.",
  "studio.frozenStatus6.shaper.wardrobeLocked": "지금은 옷을 바꿀 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
  "studio.frozenStatus6.shaper.documentApplyFailed": "캐릭터 문서를 화면에 적용하지 못했습니다.",
  "studio.frozenStatus6.shaper.restoreFailedDetail": "복원 오류",
  "studio.frozenStatus6.shaper.modelUnavailable": "이 모델에는 적용할 수 없습니다.",
  "studio.frozenStatus6.shaper.previewUnavailable": "후보를 미리 볼 수 없습니다.",
  "studio.frozenStatus6.shaper.presetApplyUnavailable": "프리셋을 적용할 수 없습니다.",
  "studio.frozenStatus6.shaper.presetApplyFailed": "프리셋을 적용하지 못했습니다.",
  "studio.frozenStatus6.shaper.recommendBusy": "미리보기 중에는 추천을 적용할 수 없습니다.",
  "studio.frozenStatus6.shaper.poseBusy": "미리보기 중에는 포즈를 적용할 수 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.shaper.capturing": "It can be applied again after the capture finishes.",
  "studio.frozenStatus6.shaper.thumbnailing": "A thumbnail is being created. Please try again shortly.",
  "studio.frozenStatus6.shaper.sharingPose": "The pose is being shared. It can be applied again when it finishes.",
  "studio.frozenStatus6.shaper.broadcastPreview": "Turn off the broadcast preview to apply it again.",
  "studio.frozenStatus6.shaper.rigApplying": "The proportion rig is being applied.",
  "studio.frozenStatus6.shaper.rigReloadRequired": "The proportion rig must be loaded again.",
  "studio.frozenStatus6.shaper.characterLoading": "The VRM character is loading.",
  "studio.frozenStatus6.shaper.characterLoadFailed": "Could not load the VRM character. Check the model state and try again.",
  "studio.frozenStatus6.shaper.characterNotLoaded": "Load a VRM character first.",
  "studio.frozenStatus6.shaper.wardrobeLocked": "Wardrobe cannot be changed right now. Please try again shortly.",
  "studio.frozenStatus6.shaper.documentApplyFailed": "Could not apply the character document to the screen.",
  "studio.frozenStatus6.shaper.restoreFailedDetail": "Restore error",
  "studio.frozenStatus6.shaper.modelUnavailable": "It cannot be applied to this model.",
  "studio.frozenStatus6.shaper.previewUnavailable": "The candidate cannot be previewed.",
  "studio.frozenStatus6.shaper.presetApplyUnavailable": "The preset cannot be applied.",
  "studio.frozenStatus6.shaper.presetApplyFailed": "Could not apply the preset.",
  "studio.frozenStatus6.shaper.recommendBusy": "Recommendations cannot be applied during preview.",
  "studio.frozenStatus6.shaper.poseBusy": "Poses cannot be applied during preview.",
});

// ── live/studio-live-collaboration-room.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.liveRoom.unsupportedAuthority": "서버가 확인하는 공유 자리 기능을 사용할 수 없습니다.",
  "studio.frozenStatus6.liveRoom.authorityConnectionChanged": "공유 자리 서버 연결이 변경되었습니다.",
  "studio.frozenStatus6.liveRoom.lockRequestInvalid": "편집 잠금 요청이 올바르지 않습니다.",
  "studio.frozenStatus6.liveRoom.connectionNotReady": "공동작업 연결이 준비되지 않았습니다.",
  "studio.frozenStatus6.liveRoom.lockConflictOwner": "{owner}가 이 영역을 편집 중입니다.",
  "studio.frozenStatus6.liveRoom.localLockSendFailed": "로컬 편집 잠금 요청을 보내지 못했습니다.",
  "studio.frozenStatus6.liveRoom.lockTaken": "다른 편집 세션이 이 영역의 잠금을 먼저 획득했습니다.",
  "studio.frozenStatus6.liveRoom.lockUnsupported": "현재 팀 연결은 서버 확인형 편집 잠금을 지원하지 않습니다.",
  "studio.frozenStatus6.liveRoom.lockResponseTimeout": "팀 서버의 편집 잠금 응답 시간이 초과되었습니다.",
  "studio.frozenStatus6.liveRoom.lockSendFailed": "편집 잠금 요청을 보내지 못했습니다.",
  "studio.frozenStatus6.liveRoom.lockConfirmFailed": "편집 잠금 요청을 확인하지 못했습니다.",
  "studio.frozenStatus6.liveRoom.unlockRequestInvalid": "편집 잠금 해제 요청이 올바르지 않습니다.",
  "studio.frozenStatus6.liveRoom.noOwnedLock": "현재 세션이 소유한 편집 잠금이 없습니다.",
  "studio.frozenStatus6.liveRoom.unlockUnsupported": "현재 팀 연결은 서버 확인형 잠금 해제를 지원하지 않습니다.",
  "studio.frozenStatus6.liveRoom.unlockResponseTimeout": "팀 서버의 편집 잠금 해제 응답 시간이 초과되었습니다.",
  "studio.frozenStatus6.liveRoom.unlockSendFailed": "편집 잠금 해제 요청을 보내지 못했습니다.",
  "studio.frozenStatus6.liveRoom.unlockConfirmFailed": "편집 잠금 해제를 확인하지 못했습니다.",
  "studio.frozenStatus6.liveRoom.crdtSyncFailed": "CRDT 문서를 동기화하지 못했습니다.",
  "studio.frozenStatus6.liveRoom.crdtPublishFailed": "CRDT 변경을 게시하지 못했습니다.",
  "studio.frozenStatus6.liveRoom.inkSendFailed": "실시간 잉크 메시지를 보내지 못했습니다.",
  "studio.frozenStatus6.liveRoom.envelopeSendFailed": "공동작업 메시지를 보내지 못했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.liveRoom.unsupportedAuthority": "The server-verified shared-seat feature is unavailable.",
  "studio.frozenStatus6.liveRoom.authorityConnectionChanged": "The shared-seat server connection changed.",
  "studio.frozenStatus6.liveRoom.lockRequestInvalid": "The edit lock request is invalid.",
  "studio.frozenStatus6.liveRoom.connectionNotReady": "The collaboration connection is not ready.",
  "studio.frozenStatus6.liveRoom.lockConflictOwner": "{owner} is editing this area.",
  "studio.frozenStatus6.liveRoom.localLockSendFailed": "Could not send the local edit lock request.",
  "studio.frozenStatus6.liveRoom.lockTaken": "Another editing session acquired the lock for this area first.",
  "studio.frozenStatus6.liveRoom.lockUnsupported": "The current team connection does not support server-verified edit locks.",
  "studio.frozenStatus6.liveRoom.lockResponseTimeout": "The team server's edit lock response timed out.",
  "studio.frozenStatus6.liveRoom.lockSendFailed": "Could not send the edit lock request.",
  "studio.frozenStatus6.liveRoom.lockConfirmFailed": "Could not confirm the edit lock request.",
  "studio.frozenStatus6.liveRoom.unlockRequestInvalid": "The edit lock release request is invalid.",
  "studio.frozenStatus6.liveRoom.noOwnedLock": "The current session owns no edit lock.",
  "studio.frozenStatus6.liveRoom.unlockUnsupported": "The current team connection does not support server-verified edit lock release.",
  "studio.frozenStatus6.liveRoom.unlockResponseTimeout": "The team server's edit lock release response timed out.",
  "studio.frozenStatus6.liveRoom.unlockSendFailed": "Could not send the edit lock release request.",
  "studio.frozenStatus6.liveRoom.unlockConfirmFailed": "Could not confirm the edit lock release.",
  "studio.frozenStatus6.liveRoom.crdtSyncFailed": "Could not sync the CRDT document.",
  "studio.frozenStatus6.liveRoom.crdtPublishFailed": "Could not publish the CRDT change.",
  "studio.frozenStatus6.liveRoom.inkSendFailed": "Could not send the live ink message.",
  "studio.frozenStatus6.liveRoom.envelopeSendFailed": "Could not send the collaboration message.",
});

// ── studio-creator-pack-runtime.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.packRuntime.libraryFull": "해당 Studio 라이브러리가 가득 차서 아무 항목도 설치하지 않았습니다.",
  "studio.frozenStatus6.packRuntime.installIncompleteRolledBack": "설치를 완료하지 못해 기존 로컬 라이브러리 상태로 되돌렸습니다.",
  "studio.frozenStatus6.packRuntime.validationFailed": "팩 검증에 실패했습니다.",
  "studio.frozenStatus6.packRuntime.bundledReference": "이미 Studio에 내장된 안정적인 참조입니다.",
  "studio.frozenStatus6.packRuntime.storageUnavailable": "브라우저 로컬 저장소를 사용할 수 없습니다.",
  "studio.frozenStatus6.packRuntime.alreadyInstalled": "동일한 버전이 이미 실제 도구 라이브러리에 설치되어 있습니다.",
  "studio.frozenStatus6.packRuntime.installStorageUnreadable": "브라우저 로컬 저장소를 안전하게 읽을 수 없어 설치하지 않았습니다.",
  "studio.frozenStatus6.packRuntime.installedCount": "{count}개 항목을 실제 Studio 라이브러리에 설치했습니다.",
  "studio.frozenStatus6.packRuntime.installRolledBack": "설치 확인에 실패해 기존 상태로 되돌렸습니다.",
  "studio.frozenStatus6.packRuntime.bundledNotRemovable": "Studio 내장 참조는 로컬 라이브러리에서 제거하지 않습니다.",
  "studio.frozenStatus6.packRuntime.noLocalItems": "이 팩이 만든 로컬 항목이 없습니다.",
  "studio.frozenStatus6.packRuntime.removeStorageUnreadable": "브라우저 로컬 저장소를 안전하게 읽을 수 없어 제거하지 않았습니다.",
  "studio.frozenStatus6.packRuntime.removeRolledBack": "제거를 완료하지 못해 기존 로컬 라이브러리 상태로 되돌렸습니다.",
  "studio.frozenStatus6.packRuntime.removedCount": "{count}개 팩 항목과 설치 마커를 이 기기에서 제거했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.packRuntime.libraryFull": "That Studio library is full, so no items were installed.",
  "studio.frozenStatus6.packRuntime.installIncompleteRolledBack": "The install did not complete, so the previous local library state was restored.",
  "studio.frozenStatus6.packRuntime.validationFailed": "Pack validation failed.",
  "studio.frozenStatus6.packRuntime.bundledReference": "This is a stable reference already built into Studio.",
  "studio.frozenStatus6.packRuntime.storageUnavailable": "Browser local storage is unavailable.",
  "studio.frozenStatus6.packRuntime.alreadyInstalled": "The same version is already installed in the real tool library.",
  "studio.frozenStatus6.packRuntime.installStorageUnreadable": "Could not read browser local storage safely, so it was not installed.",
  "studio.frozenStatus6.packRuntime.installedCount": "Installed {count} items into the real Studio library.",
  "studio.frozenStatus6.packRuntime.installRolledBack": "Install verification failed, so the previous state was restored.",
  "studio.frozenStatus6.packRuntime.bundledNotRemovable": "Built-in Studio references are not removed from the local library.",
  "studio.frozenStatus6.packRuntime.noLocalItems": "There are no local items created by this pack.",
  "studio.frozenStatus6.packRuntime.removeStorageUnreadable": "Could not read browser local storage safely, so it was not removed.",
  "studio.frozenStatus6.packRuntime.removeRolledBack": "Removal did not complete, so the previous local library state was restored.",
  "studio.frozenStatus6.packRuntime.removedCount": "Removed {count} pack items and install markers from this device.",
});

// ── studio-document-envelope.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.envelope.invalidJsonValue": "Studio 문서 envelope를 안전하게 검증하지 못했습니다.",
  "studio.frozenStatus6.envelope.canonicalMismatch": "Studio 문서 envelope가 canonical JSON 표현과 일치하지 않습니다.",
  "studio.frozenStatus6.envelope.stepBudgetExceeded": "Studio 문서 migration 단계 수가 실행 budget을 넘었습니다.",
  "studio.frozenStatus6.envelope.byteBudgetExceeded": "Studio 문서 migration 누적 바이트가 실행 budget을 넘었습니다.",
  "studio.frozenStatus6.envelope.checksumFailed": "Studio 문서 migration provenance checksum을 계산하지 못했습니다.",
  "studio.frozenStatus6.envelope.pathBroken": "등록된 Studio 문서 migration 경로가 실행 중 끊어졌습니다.",
  "studio.frozenStatus6.envelope.migratorFailed": "Studio 문서 migrator 실행이 실패했습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.envelope.invalidJsonValue": "Could not safely validate the Studio document envelope.",
  "studio.frozenStatus6.envelope.canonicalMismatch": "The Studio document envelope does not match the canonical JSON representation.",
  "studio.frozenStatus6.envelope.stepBudgetExceeded": "The number of Studio document migration steps exceeded the execution budget.",
  "studio.frozenStatus6.envelope.byteBudgetExceeded": "The accumulated Studio document migration bytes exceeded the execution budget.",
  "studio.frozenStatus6.envelope.checksumFailed": "Could not compute the Studio document migration provenance checksum.",
  "studio.frozenStatus6.envelope.pathBroken": "The registered Studio document migration path was broken during execution.",
  "studio.frozenStatus6.envelope.migratorFailed": "The Studio document migrator execution failed.",
});

// ── studio-writer-room-canvas-projection.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.writerProjection.characterNotFound": "캐릭터 바이블에서 참조한 캐릭터를 찾을 수 없어요.",
  "studio.frozenStatus6.writerProjection.duplicateSortOrder": "같은 순서 값이 중복되어 ID 오름차순으로 안정적으로 정렬했어요.",
  "studio.frozenStatus6.writerProjection.panelTallerThanPage": "패널 하나가 페이지 목표 높이보다 커서 단독 페이지로 유지했어요.",
  "studio.frozenStatus6.writerProjection.sceneOverflow": "장면이 페이지 높이 또는 패널 수 한도를 넘어 다음 페이지로 이어져요.",
  "studio.frozenStatus6.writerProjection.beatNotFound": "장면이 참조한 비트를 찾을 수 없어 캔버스에는 비트 정보 없이 전달해요.",
  "studio.frozenStatus6.writerProjection.dialoguePanelIdEmpty": "대사를 배치할 패널 ID가 비어 있어요.",
  "studio.frozenStatus6.writerProjection.dialoguePanelNotFound": "대사가 참조한 패널을 찾을 수 없어요.",
  "studio.frozenStatus6.writerProjection.sfxPanelIdEmpty": "효과음을 배치할 패널 ID가 비어 있어요.",
  "studio.frozenStatus6.writerProjection.sfxPanelNotFound": "효과음이 참조한 패널을 찾을 수 없어요.",
  "studio.frozenStatus6.writerProjection.noPanelPlan": "캔버스로 보낼 패널 계획이 없어요.",
  "studio.frozenStatus6.writerProjection.applyLimitHeld": "안전한 한 번 적용 한도를 넘은 패널이 있어 일부를 보류했어요.",
  "studio.frozenStatus6.writerProjection.panelSceneIdEmpty": "패널에 연결된 장면 ID가 비어 있어요.",
  "studio.frozenStatus6.writerProjection.panelSceneNotFound": "패널이 참조한 장면을 찾을 수 없어요.",
  "studio.frozenStatus6.writerProjection.dialogueCapHeld": "한 패널의 안전한 대사 수 한도를 넘어 일부 대사를 보류했어요.",
  "studio.frozenStatus6.writerProjection.emptyDialogueExcluded": "빈 대사는 시나리오 말풍선 입력에서 제외했어요.",
  "studio.frozenStatus6.writerProjection.sfxCapHeld": "한 패널의 안전한 효과음 수 한도를 넘어 일부 효과음을 보류했어요.",
  "studio.frozenStatus6.writerProjection.emptyPanel": "장면 설명, 동작, 대사, 효과음이 모두 비어 있는 패널이에요.",
  "studio.frozenStatus6.writerProjection.balloonSplitNeeded": "대사 말풍선 높이가 패널 최대 높이를 넘어 패널 분할이 필요해요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.writerProjection.characterNotFound": "Could not find the character referenced from the character bible.",
  "studio.frozenStatus6.writerProjection.duplicateSortOrder": "Duplicate order values were found, so items were stably sorted by ascending ID.",
  "studio.frozenStatus6.writerProjection.panelTallerThanPage": "One panel is taller than the page target height, so it was kept on its own page.",
  "studio.frozenStatus6.writerProjection.sceneOverflow": "The scene exceeds the page height or panel count limit, so it continues on the next page.",
  "studio.frozenStatus6.writerProjection.beatNotFound": "Could not find the beat referenced by the scene, so it is passed to the canvas without beat information.",
  "studio.frozenStatus6.writerProjection.dialoguePanelIdEmpty": "The panel ID for placing the dialogue is empty.",
  "studio.frozenStatus6.writerProjection.dialoguePanelNotFound": "Could not find the panel referenced by the dialogue.",
  "studio.frozenStatus6.writerProjection.sfxPanelIdEmpty": "The panel ID for placing the sound effect is empty.",
  "studio.frozenStatus6.writerProjection.sfxPanelNotFound": "Could not find the panel referenced by the sound effect.",
  "studio.frozenStatus6.writerProjection.noPanelPlan": "There is no panel plan to send to the canvas.",
  "studio.frozenStatus6.writerProjection.applyLimitHeld": "Some panels exceed the safe single-apply limit, so some were held back.",
  "studio.frozenStatus6.writerProjection.panelSceneIdEmpty": "The scene ID linked to the panel is empty.",
  "studio.frozenStatus6.writerProjection.panelSceneNotFound": "Could not find the scene referenced by the panel.",
  "studio.frozenStatus6.writerProjection.dialogueCapHeld": "Some dialogue exceeds one panel's safe dialogue limit, so some was held back.",
  "studio.frozenStatus6.writerProjection.emptyDialogueExcluded": "Empty dialogue was excluded from the scenario speech-balloon input.",
  "studio.frozenStatus6.writerProjection.sfxCapHeld": "Some sound effects exceed one panel's safe limit, so some were held back.",
  "studio.frozenStatus6.writerProjection.emptyPanel": "This panel's scene description, action, dialogue, and sound effects are all empty.",
  "studio.frozenStatus6.writerProjection.balloonSplitNeeded": "The dialogue balloon height exceeds the panel's maximum height, so the panel needs to be split.",
});

// ── vrm/studio-vrm-project-library.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.vrmLibrary.bytesInvalid": "로컬 VRM이 GLB/VRM 안전 검사를 통과하지 못해 archive에 포함하지 않았습니다.",
  "studio.frozenStatus6.vrmLibrary.hashMismatch": "로컬 VRM의 실제 SHA-256이 장면 문서의 모델 해시와 일치하지 않습니다.",
  "studio.frozenStatus6.vrmLibrary.licenseRestricted": "VRM 이용 조건이 프로젝트 archive 재배포를 허용하지 않아 모델 파일을 포함하지 않았습니다.",
  "studio.frozenStatus6.vrmLibrary.metadataConflict": "같은 VRM 해시를 참조하는 장면들의 모델 크기 또는 MIME 정보가 충돌합니다.",
  "studio.frozenStatus6.vrmLibrary.mimeMismatch": "로컬 VRM의 검증된 MIME 정보가 VRM 라이브러리 계약과 일치하지 않습니다.",
  "studio.frozenStatus6.vrmLibrary.notFound": "장면이 가리키는 VRM을 이 기기의 검증 라이브러리에서 찾지 못했습니다.",
  "studio.frozenStatus6.vrmLibrary.sizeMismatch": "로컬 VRM의 실제 크기가 장면 문서의 모델 크기와 일치하지 않습니다.",
  "studio.frozenStatus6.vrmLibrary.attachmentBytesInvalid": "archive의 VRM attachment가 GLB/VRM 안전 검사를 통과하지 못했습니다.",
  "studio.frozenStatus6.vrmLibrary.attachmentHashMismatch": "archive VRM attachment의 실제 SHA-256이 장면 문서와 일치하지 않습니다.",
  "studio.frozenStatus6.vrmLibrary.attachmentMetadataMismatch": "archive VRM attachment가 장면 문서의 모델 해시 위치와 안전하게 연결되지 않았습니다.",
  "studio.frozenStatus6.vrmLibrary.attachmentMimeMismatch": "archive attachment의 kind 또는 MIME이 VRM 계약과 일치하지 않습니다.",
  "studio.frozenStatus6.vrmLibrary.attachmentMissing": "가져온 archive에 장면이 사용하는 VRM attachment가 없습니다.",
  "studio.frozenStatus6.vrmLibrary.attachmentSizeMismatch": "archive VRM attachment의 실제 크기가 장면 문서와 일치하지 않습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.vrmLibrary.bytesInvalid": "The local VRM did not pass the GLB/VRM safety checks, so it was not included in the archive.",
  "studio.frozenStatus6.vrmLibrary.hashMismatch": "The local VRM's actual SHA-256 does not match the model hash in the scene document.",
  "studio.frozenStatus6.vrmLibrary.licenseRestricted": "The VRM terms do not allow project archive redistribution, so the model file was not included.",
  "studio.frozenStatus6.vrmLibrary.metadataConflict": "Scenes referencing the same VRM hash have conflicting model size or MIME information.",
  "studio.frozenStatus6.vrmLibrary.mimeMismatch": "The local VRM's verified MIME information does not match the VRM library contract.",
  "studio.frozenStatus6.vrmLibrary.notFound": "Could not find the VRM the scene points to in this device's verified library.",
  "studio.frozenStatus6.vrmLibrary.sizeMismatch": "The local VRM's actual size does not match the model size in the scene document.",
  "studio.frozenStatus6.vrmLibrary.attachmentBytesInvalid": "The archive's VRM attachment did not pass the GLB/VRM safety checks.",
  "studio.frozenStatus6.vrmLibrary.attachmentHashMismatch": "The archive VRM attachment's actual SHA-256 does not match the scene document.",
  "studio.frozenStatus6.vrmLibrary.attachmentMetadataMismatch": "The archive VRM attachment was not safely linked to the model hash position in the scene document.",
  "studio.frozenStatus6.vrmLibrary.attachmentMimeMismatch": "The archive attachment's kind or MIME does not match the VRM contract.",
  "studio.frozenStatus6.vrmLibrary.attachmentMissing": "The imported archive has no VRM attachment used by the scene.",
  "studio.frozenStatus6.vrmLibrary.attachmentSizeMismatch": "The archive VRM attachment's actual size does not match the scene document.",
});

// ── vrm/studio-vrm-surface-paint-tool.ts
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus6.surfacePaint.brushReady": "V12 UV 브러시가 준비됐습니다.",
  "studio.frozenStatus6.surfacePaint.memoryInsufficient": "이 획을 원자적으로 되돌릴 메모리가 부족해 텍스처를 변경하지 않았습니다.",
  "studio.frozenStatus6.surfacePaint.uploadFailed": "아틀라스 업로드가 실패해 획 전체를 되돌리고 마지막 성공 결과를 유지했습니다. 다음 작업 전에 provider 또는 도구를 명시적으로 선택하세요.",
  "studio.frozenStatus6.surfacePaint.runtimeEnded": "선택한 V12 UV 표면 브러시 runtime이 이미 종료됐습니다.",
  "studio.frozenStatus6.surfacePaint.runtimeBusy": "선택한 V12 UV 표면 브러시 runtime이 다른 표면 작업을 처리 중입니다.",
  "studio.frozenStatus6.surfacePaint.targetInvalid": "선택한 V12 UV 표면 브러시 runtime의 현재 텍스처 대상이 유효하지 않습니다.",
  "studio.frozenStatus6.surfacePaint.toolEnded": "선택한 V12 UV 표면 브러시 도구가 이미 종료됐습니다.",
  "studio.frozenStatus6.surfacePaint.previousStrokeActive": "이전 V12 UV 표면 획이 아직 끝나지 않았습니다.",
  "studio.frozenStatus6.surfacePaint.providerDisconnected": "선택한 V12 UV 표면 브러시 provider가 연결되지 않았습니다.",
  "studio.frozenStatus6.surfacePaint.invalidPointerOrBrush": "포인터 또는 브러시 값이 유효하지 않아 선택한 표면 획을 거부했습니다.",
  "studio.frozenStatus6.surfacePaint.seamFaceMissing": "UV seam을 증명할 faceIndex가 없어 선택한 표면 획을 거부했습니다.",
  "studio.frozenStatus6.surfacePaint.collectingStroke": "V12 UV 획을 수집 중입니다. 포인터를 놓으면 한 번에 아틀라스에 저장합니다.",
  "studio.frozenStatus6.surfacePaint.chartSplitting": "UV chart 경계를 나눈 뒤 아틀라스에 한 획으로 저장하는 중입니다.",
  "studio.frozenStatus6.surfacePaint.strokeDataFailed": "V12 획 데이터를 만들 수 없어 표면을 변경하지 않았습니다.",
  "studio.frozenStatus6.surfacePaint.strokeCanceled": "V12 UV 획을 취소해 아틀라스와 실행 취소 기록을 그대로 유지했습니다.",
  "studio.frozenStatus6.surfacePaint.strokeCanceling": "진행 중인 V12 UV 획을 원자적으로 취소하는 중입니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus6.surfacePaint.brushReady": "The V12 UV brush is ready.",
  "studio.frozenStatus6.surfacePaint.memoryInsufficient": "There is not enough memory to roll back this stroke atomically, so the texture was not changed.",
  "studio.frozenStatus6.surfacePaint.uploadFailed": "The atlas upload failed, so the whole stroke was rolled back and the last successful result was kept. Explicitly select a provider or tool before the next operation.",
  "studio.frozenStatus6.surfacePaint.runtimeEnded": "The selected V12 UV surface brush runtime has already ended.",
  "studio.frozenStatus6.surfacePaint.runtimeBusy": "The selected V12 UV surface brush runtime is processing another surface operation.",
  "studio.frozenStatus6.surfacePaint.targetInvalid": "The selected V12 UV surface brush runtime's current texture target is invalid.",
  "studio.frozenStatus6.surfacePaint.toolEnded": "The selected V12 UV surface brush tool has already ended.",
  "studio.frozenStatus6.surfacePaint.previousStrokeActive": "The previous V12 UV surface stroke has not finished yet.",
  "studio.frozenStatus6.surfacePaint.providerDisconnected": "The selected V12 UV surface brush provider is not connected.",
  "studio.frozenStatus6.surfacePaint.invalidPointerOrBrush": "The pointer or brush value is invalid, so the selected surface stroke was rejected.",
  "studio.frozenStatus6.surfacePaint.seamFaceMissing": "There is no faceIndex to prove the UV seam, so the selected surface stroke was rejected.",
  "studio.frozenStatus6.surfacePaint.collectingStroke": "Collecting the V12 UV stroke. Release the pointer to save it to the atlas at once.",
  "studio.frozenStatus6.surfacePaint.chartSplitting": "Splitting the UV chart boundary, then saving it to the atlas as one stroke.",
  "studio.frozenStatus6.surfacePaint.strokeDataFailed": "Could not create the V12 stroke data, so the surface was not changed.",
  "studio.frozenStatus6.surfacePaint.strokeCanceled": "The V12 UV stroke was canceled, keeping the atlas and undo history as they were.",
  "studio.frozenStatus6.surfacePaint.strokeCanceling": "Atomically canceling the in-progress V12 UV stroke.",
});

export function frozenStatus6Text(key: string, koFallback: string): string;
export function frozenStatus6Text(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function frozenStatus6Text(
  key: string,
  paramsOrFallback: Readonly<Record<string, string | number>> | string,
  koFallback?: string,
): string {
  const params = typeof paramsOrFallback === "string" ? undefined : paramsOrFallback;
  const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : koFallback ?? "";
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}
