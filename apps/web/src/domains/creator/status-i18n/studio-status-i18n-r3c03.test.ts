import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * bg3d·vrm·scene-3d 패널 로딩·실패·빈 상태 문구 i18n 키 이관 계약
 * (A4 잔여 3라운드 c03, 40파일 101건 중 이관 79건·신규 키 83개).
 *
 * bg3d·vrm은 기존 등록 모듈(studio-bg3d-panel-status-i18n·
 * studio-vrm-panel-status-i18n)의 네임스페이스를 확장했고, scene-3d는
 * 맞는 기존 모듈이 없어 studio-scene3d-status-i18n을 신설했다.
 * 비컴포넌트 생산자(상태 문구 반환 함수)는 각 모듈의 생산 시점 해석
 * 헬퍼(bg3dPanelStatusText·vrmPanelStatusText)를 경유한다.
 * 잔여(본문·제목·자체 이중언어 사전 보유분)는 r3-c03.md에 근거와 함께 남겼다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf-8");
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = entry[2] ?? "";
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? "").sort();
}

const BG3D_R3_KEYS = [
  "studio.bg3dPanelStatus.actionFooter.renderInstanceFailed",
  "studio.bg3dPanelStatus.assetLibraryWithPresets.importStartBlocked",
  "studio.bg3dPanelStatus.assetLibraryWithPresets.directTransferUnsupported",
  "studio.bg3dPanelStatus.cinematicDirector.preparingReference",
  "studio.bg3dPanelStatus.compositionLens.orthographicFovNotice",
  "studio.bg3dPanelStatus.cutStrip.empty",
  "studio.bg3dPanelStatus.engine.checking",
  "studio.bg3dPanelStatus.gpuDiagnostics.notMounted",
  "studio.bg3dPanelStatus.gpuDiagnostics.unsupported",
  "studio.bg3dPanelStatus.gpuDiagnostics.otherProfiler",
  "studio.bg3dPanelStatus.gpuDiagnostics.paused",
  "studio.bg3dPanelStatus.gpuDiagnostics.waitingForFrame",
  "studio.bg3dPanelStatus.gpuDiagnostics.readingGpu",
  "studio.bg3dPanelStatus.gpuDiagnostics.noFreshTimestamps",
  "studio.bg3dPanelStatus.gpuDiagnostics.renderFailed",
  "studio.bg3dPanelStatus.gpuDiagnostics.readbackFailed",
  "studio.bg3dPanelStatus.gpuDiagnostics.timedOut",
  "studio.bg3dPanelStatus.inferenceKeyboardPicker.empty",
  "studio.bg3dPanelStatus.ltPanel.busySettingsLocked",
  "studio.bg3dPanelStatus.ltPanel.sqliteLoadingSuffix",
  "studio.bg3dPanelStatus.ltPanel.sqliteSavingSuffix",
  "studio.bg3dPanelStatus.ltPanel.safeOutputSizeUnavailable",
  "studio.bg3dPanelStatus.measurement.guidesEmpty",
  "studio.bg3dPanelStatus.placeSetPackage.noCanonical",
  "studio.bg3dPanelStatus.placeSetPackage.noVersions",
  "studio.bg3dPanelStatus.placeSetPackage.noStaleUsage",
  "studio.bg3dPanelStatus.proceduralStarter.addPresetFailed",
  "studio.bg3dPanelStatus.proceduralStarter.noMatchingAssets",
  "studio.bg3dPanelStatus.productionMultiPassExporter.recoveryPermissionFailed",
  "studio.bg3dPanelStatus.productionWorkflow.presetsLoading",
  "studio.bg3dPanelStatus.productionWorkflow.flowLoading",
  "studio.bg3dPanelStatus.productionWorkflow.actionFailed",
  "studio.bg3dPanelStatus.retainedOwnerHost.openingHelper",
  "studio.bg3dPanelStatus.retainedOwnerHost.preparingStage",
  "studio.bg3dPanelStatus.roomBuilder.openingsEmpty",
  "studio.bg3dPanelStatus.sceneOutliner.objectsEmpty",
  "studio.bg3dPanelStatus.sceneOutliner.searchEmpty",
  "studio.bg3dPanelStatus.sceneTemplate.resetAllUnavailable",
  "studio.bg3dPanelStatus.sceneTemplate.resetSourceMissing",
  "studio.bg3dPanelStatus.sceneTemplate.resetStructureCorrupt",
  "studio.bg3dPanelStatus.sceneTemplate.categoryEmpty",
  "studio.bg3dPanelStatus.sceneTemplate.trackedEmpty",
  "studio.bg3dPanelStatus.sharedCharacterPlacement.loadingStatus",
  "studio.bg3dPanelStatus.sharedCharacterPlacement.loading3d",
  "studio.bg3dPanelStatus.sharedCharacterPlacement.groundingChecking",
  "studio.bg3dPanelStatus.sharedCharacterStatusOverlay.loadingHeadline",
  "studio.bg3dPanelStatus.skpImport.importFailedWithReason",
  "studio.bg3dPanelStatus.skpImport.cancelImport",
  "studio.bg3dPanelStatus.spatialStoryboard.applyCommandFailed",
  "studio.bg3dPanelStatus.spatialStoryboard.downloadStartFailed",
  "studio.bg3dPanelStatus.texturePaint.strokeLimitReached",
  "studio.bg3dPanelStatus.texturePaint.exportUnsupported",
  "studio.bg3dPanelStatus.userTemplateLibrary.listLoadFailed",
  "studio.bg3dPanelStatus.userTemplateLibrary.loadingList",
  "studio.bg3dPanelStatus.userTemplateLibrary.reload",
  "studio.bg3dPanelStatus.userTemplateLibrary.savedEmpty",
  "studio.bg3dPanelStatus.viewPanel.cameraChangeUnavailable",
  "studio.bg3dPanelStatus.viewPanel.orthographicFov",
  "studio.bg3dPanelStatus.viewPanel.subjectSizeUnavailable",
  "studio.bg3dPanelStatus.marketplaceImport.placeFailed",
  "studio.bg3dPanelStatus.marketplaceImport.importFailed",
  "studio.bg3dPanelStatus.marketplaceImport.verifyingImporting",
  "studio.bg3dPanelStatus.marketplaceImport.importButton",
  "studio.bg3dPanelStatus.marketplaceImport.importCancelled",
  "studio.bg3dPanelStatus.marketplaceImport.cancelImport",
  "studio.bg3dPanelStatus.marketplaceImportMount.sectionLabel",
  "studio.bg3dPanelStatus.marketplaceImportMount.loadFailed",
  "studio.bg3dPanelStatus.marketplaceImportMount.loading",
  "studio.bg3dPanelStatus.marketplaceImportMount.retry",
] as const;

const VRM_R3_KEYS = [
  "studio.vrmPanelStatus.broadcastPreview.restoreBackgroundFailed",
  "studio.vrmPanelStatus.poserBody.loadModelFirst",
  "studio.vrmPanelStatus.poserBody.noCostumeSeparation",
  "studio.vrmPanelStatus.poserBody.noMToonSupport",
  "studio.vrmPanelStatus.archiveAttestation.unknownBlocksExport",
  "studio.vrmPanelStatus.archiveAttestationHost.loadingTerms",
  "studio.vrmPanelStatus.textureExport.exportFailed",
  "studio.vrmPanelStatus.textureExport.exporting",
  "studio.vrmPanelStatus.texturePaint.restoreInterrupted",
  "studio.vrmPanelStatus.texturePaint.retry",
] as const;

const SCENE3D_KEYS = [
  "studio.scene3dStatus.emotionStaging.noPoseMatch",
  "studio.scene3dStatus.posePresetGrid.exportFailed",
  "studio.scene3dStatus.posePresetGrid.fileReadFailed",
  "studio.scene3dStatus.posePresetGrid.noMatchingPoses",
] as const;

const EXPECTED_KO: Readonly<Record<string, string>> = {
  "studio.bg3dPanelStatus.actionFooter.renderInstanceFailed": "검증된 모델의 렌더 인스턴스를 만들지 못했습니다. 기존 PNG를 보존하기 위해 저장을 막았습니다.",
  "studio.bg3dPanelStatus.assetLibraryWithPresets.importStartBlocked": "현재 가져오기를 시작할 수 없습니다. 진행 중인 작업과 이용 권리 입력을 확인해 주세요.",
  "studio.bg3dPanelStatus.assetLibraryWithPresets.directTransferUnsupported": "이 브라우저는 직접 전달을 지원하지 않습니다. 검토실에서 GLB를 저장한 뒤 가져와 주세요.",
  "studio.bg3dPanelStatus.cinematicDirector.preparingReference": "현재 컷 참조 준비 중",
  "studio.bg3dPanelStatus.compositionLens.orthographicFovNotice": "평행 투영에서는 화각을 바꾸지 않습니다. 카메라 · 환경에서 원근 투영을 선택하세요.",
  "studio.bg3dPanelStatus.cutStrip.empty": "아직 컷이 없습니다. 화면비를 고르고 “컷 추가”를 눌러 첫 컷을 만들어 보세요.",
  "studio.bg3dPanelStatus.engine.checking": "확인 중",
  "studio.bg3dPanelStatus.gpuDiagnostics.notMounted": "3D 뷰포트가 준비되면 측정할 수 있습니다.",
  "studio.bg3dPanelStatus.gpuDiagnostics.unsupported": "이 렌더러에서는 GPU timestamp 측정을 지원하지 않습니다. 프레임 시간으로 대신 계산하지 않습니다.",
  "studio.bg3dPanelStatus.gpuDiagnostics.otherProfiler": "다른 GPU 측정 작업이 사용 중입니다. 해당 작업이 종료된 뒤 뷰포트를 다시 열어 주세요.",
  "studio.bg3dPanelStatus.gpuDiagnostics.paused": "캡처·변형·몰입 모드 또는 숨겨진 탭에서는 측정을 잠시 중지합니다.",
  "studio.bg3dPanelStatus.gpuDiagnostics.waitingForFrame": "다음 화면 렌더 제출을 기다리고 있습니다.",
  "studio.bg3dPanelStatus.gpuDiagnostics.readingGpu": "제출한 GPU 작업의 결과를 읽고 있습니다. 새 측정은 결과 정리 후 가능합니다.",
  "studio.bg3dPanelStatus.gpuDiagnostics.noFreshTimestamps": "이번 제출의 유효한 GPU timestamp를 얻지 못했습니다. 이전 수치는 표시하지 않습니다.",
  "studio.bg3dPanelStatus.gpuDiagnostics.renderFailed": "렌더 제출 중 오류가 발생해 측정하지 못했습니다.",
  "studio.bg3dPanelStatus.gpuDiagnostics.readbackFailed": "GPU 측정 결과를 읽지 못했습니다.",
  "studio.bg3dPanelStatus.gpuDiagnostics.timedOut": "측정 대기 시간이 초과됐습니다. 제출된 조회는 종료될 때까지 중복 실행하지 않습니다.",
  "studio.bg3dPanelStatus.inferenceKeyboardPicker.empty": "고를 수 있는 점이 없습니다. 장면에 객체를 놓으면 끝점·중간점·중심이 여기에 나타납니다.",
  "studio.bg3dPanelStatus.ltPanel.busySettingsLocked": "3D 배경을 처리하는 동안에는 이 설정을 바꿀 수 없어요. 작업이 끝나면 다시 변경할 수 있습니다.",
  "studio.bg3dPanelStatus.ltPanel.sqliteLoadingSuffix": " · SQLite 불러오는 중",
  "studio.bg3dPanelStatus.ltPanel.sqliteSavingSuffix": " · SQLite 저장 중",
  "studio.bg3dPanelStatus.ltPanel.safeOutputSizeUnavailable": "현재 기기에서 안전한 출력 크기를 계산할 수 없습니다.",
  "studio.bg3dPanelStatus.measurement.guidesEmpty": "저장된 가이드가 없습니다. 자주 쓰는 벽 높이·문 폭·가구 간격을 남겨 보세요.",
  "studio.bg3dPanelStatus.placeSetPackage.noCanonical": "아직 등록된 정본이 없습니다",
  "studio.bg3dPanelStatus.placeSetPackage.noVersions": "버전이 없습니다.",
  "studio.bg3dPanelStatus.placeSetPackage.noStaleUsage": "옛 정본을 쓰는 회차·컷이 없습니다. 모든 사용처가 현재 정본과 같습니다.",
  "studio.bg3dPanelStatus.proceduralStarter.addPresetFailed": "블록아웃 프리셋을 추가하지 못했습니다. 장면 상태를 확인한 뒤 다시 시도해 주세요.",
  "studio.bg3dPanelStatus.proceduralStarter.noMatchingAssets": "검색과 카테고리에 맞는 3D 에셋이 없습니다.",
  "studio.bg3dPanelStatus.productionMultiPassExporter.recoveryPermissionFailed": "현재 문서의 복구 권한을 준비하지 못했습니다.",
  "studio.bg3dPanelStatus.productionWorkflow.presetsLoading": "제작 프리셋 불러오는 중…",
  "studio.bg3dPanelStatus.productionWorkflow.flowLoading": "3D 제작 흐름 불러오는 중…",
  "studio.bg3dPanelStatus.productionWorkflow.actionFailed": "3D 제작 작업을 완료하지 못했습니다. 장면 상태를 확인한 뒤 다시 시도하세요.",
  "studio.bg3dPanelStatus.retainedOwnerHost.openingHelper": "장면 도우미를 여는 중",
  "studio.bg3dPanelStatus.retainedOwnerHost.preparingStage": "준비 중",
  "studio.bg3dPanelStatus.roomBuilder.openingsEmpty": "아직 오프닝이 없어요. 문·창을 추가하면 벽이 자동으로 갈라집니다.",
  "studio.bg3dPanelStatus.sceneOutliner.objectsEmpty": "아직 장면 객체가 없습니다. 도형·템플릿·에셋을 추가하면 이곳에서 계층으로 관리할 수 있어요.",
  "studio.bg3dPanelStatus.sceneOutliner.searchEmpty": "검색 결과가 없습니다.",
  "studio.bg3dPanelStatus.sceneTemplate.resetAllUnavailable": "원본을 찾을 수 없거나 잠긴 템플릿이 있습니다.",
  "studio.bg3dPanelStatus.sceneTemplate.resetSourceMissing": "템플릿 원본을 찾을 수 없어 원래 배치로 초기화할 수 없습니다.",
  "studio.bg3dPanelStatus.sceneTemplate.resetStructureCorrupt": "템플릿 묶음 구조가 손상되어 원래 배치로 초기화할 수 없습니다.",
  "studio.bg3dPanelStatus.sceneTemplate.categoryEmpty": "이 카테고리에는 아직 템플릿이 없어요.",
  "studio.bg3dPanelStatus.sceneTemplate.trackedEmpty": "추적 가능한 템플릿 배치가 없습니다. 새 씬 템플릿이나 내 템플릿을 추가하면 이곳에서 한 묶음으로 정리할 수 있어요.",
  "studio.bg3dPanelStatus.sharedCharacterPlacement.loadingStatus": "불러오는 중",
  "studio.bg3dPanelStatus.sharedCharacterPlacement.loading3d": "3D 불러오는 중",
  "studio.bg3dPanelStatus.sharedCharacterPlacement.groundingChecking": "바닥 확인 중",
  "studio.bg3dPanelStatus.sharedCharacterStatusOverlay.loadingHeadline": "공유 캐릭터 {ready}/{total}명 불러오는 중",
  "studio.bg3dPanelStatus.skpImport.importFailedWithReason": "가져오지 못함 · {reason}",
  "studio.bg3dPanelStatus.skpImport.cancelImport": "가져오기 취소",
  "studio.bg3dPanelStatus.spatialStoryboard.applyCommandFailed": "편집 명령을 적용하지 못했습니다. 현재 장면 상태를 확인하세요.",
  "studio.bg3dPanelStatus.spatialStoryboard.downloadStartFailed": "계획 파일 다운로드를 시작하지 못했습니다.",
  "studio.bg3dPanelStatus.texturePaint.strokeLimitReached": "획 한도에 닿아 다시 실행할 수 없습니다.",
  "studio.bg3dPanelStatus.texturePaint.exportUnsupported": "이 환경에서는 텍스처 내보내기가 지원되지 않습니다.",
  "studio.bg3dPanelStatus.userTemplateLibrary.listLoadFailed": "템플릿 목록을 불러오지 못했습니다.",
  "studio.bg3dPanelStatus.userTemplateLibrary.loadingList": "템플릿을 불러오는 중입니다.",
  "studio.bg3dPanelStatus.userTemplateLibrary.reload": "다시 불러오기",
  "studio.bg3dPanelStatus.userTemplateLibrary.savedEmpty": "저장된 템플릿이 없습니다.",
  "studio.bg3dPanelStatus.viewPanel.cameraChangeUnavailable": "지금은 카메라를 변경할 수 없습니다. 진행 중인 작업을 마친 뒤 다시 시도해 주세요.",
  "studio.bg3dPanelStatus.viewPanel.orthographicFov": "평행 투영에서는 화각을 바꾸지 않습니다. 원근 투영을 선택해 주세요.",
  "studio.bg3dPanelStatus.viewPanel.subjectSizeUnavailable": "현재 거리에서는 피사체 크기를 유지할 수 없습니다. 거리 조절 옵션을 끄고 화각만 바꿔 주세요.",
  "studio.bg3dPanelStatus.marketplaceImport.placeFailed": "모델을 배치하지 못했습니다. 3D 편집기의 오류 안내와 기기 예산을 확인해 주세요.",
  "studio.bg3dPanelStatus.marketplaceImport.importFailed": "모델을 가져오지 못했습니다.",
  "studio.bg3dPanelStatus.marketplaceImport.verifyingImporting": "검증·가져오는 중…",
  "studio.bg3dPanelStatus.marketplaceImport.importButton": "선택한 마켓 모델 가져오기",
  "studio.bg3dPanelStatus.marketplaceImport.importCancelled": "모델 가져오기를 취소했습니다.",
  "studio.bg3dPanelStatus.marketplaceImport.cancelImport": "가져오기 취소",
  "studio.bg3dPanelStatus.marketplaceImportMount.sectionLabel": "선택한 마켓 모델 불러오기",
  "studio.bg3dPanelStatus.marketplaceImportMount.loadFailed": "모델 정보를 불러오지 못했습니다. 현재 장면은 유지됩니다.",
  "studio.bg3dPanelStatus.marketplaceImportMount.loading": "선택한 마켓 모델 정보를 불러오는 중…",
  "studio.bg3dPanelStatus.marketplaceImportMount.retry": "모델 정보 다시 시도",
  "studio.vrmPanelStatus.broadcastPreview.restoreBackgroundFailed": "기존 3D 배경을 복원하지 못했습니다. 편집기를 닫았다가 다시 열어 주세요.",
  "studio.vrmPanelStatus.poserBody.loadModelFirst": "모델을 먼저 불러오세요.",
  "studio.vrmPanelStatus.poserBody.noCostumeSeparation": "이 모델은 의상 분리 정보가 없어요.",
  "studio.vrmPanelStatus.poserBody.noMToonSupport": "이 모델은 MToon 재질이 아니라 재질 효과를 지원하지 않아요.",
  "studio.vrmPanelStatus.archiveAttestation.unknownBlocksExport": "‘확인하지 못함’이 포함되어 archive 내보내기를 진행할 수 없습니다.",
  "studio.vrmPanelStatus.archiveAttestationHost.loadingTerms": "VRM 이용 조건 불러오는 중",
  "studio.vrmPanelStatus.textureExport.exportFailed": "텍스처를 내보내지 못했습니다.",
  "studio.vrmPanelStatus.textureExport.exporting": "텍스처 내보내는 중…",
  "studio.vrmPanelStatus.texturePaint.restoreInterrupted": "원본 텍스처 복원이 중단됐습니다.",
  "studio.vrmPanelStatus.texturePaint.retry": "다시 시도",
  "studio.scene3dStatus.emotionStaging.noPoseMatch": "조건(인원·성별)에 맞는 포즈가 없어요. 표정 제안은 그대로 쓸 수 있어요.",
  "studio.scene3dStatus.posePresetGrid.exportFailed": "내보내기에 실패했습니다. 다시 시도해 주세요.",
  "studio.scene3dStatus.posePresetGrid.fileReadFailed": "파일을 읽지 못했습니다. 다시 시도해 주세요.",
  "studio.scene3dStatus.posePresetGrid.noMatchingPoses": "조건에 맞는 포즈가 없습니다. 필터나 검색어를 바꿔 보세요.",
};

const CONSUMERS = [
  "bg3d/StudioBg3dActionFooter.tsx",
  "bg3d/StudioBg3dAssetLibraryPanelWithPresets.tsx",
  "bg3d/StudioBg3dCinematicDirectorPanelContent.tsx",
  "bg3d/StudioBg3dCompositionLensPanel.tsx",
  "bg3d/StudioBg3dCutStripPanel.tsx",
  "bg3d/StudioBg3dEnginePanel.tsx",
  "bg3d/StudioBg3dGpuDiagnostics.tsx",
  "bg3d/StudioBg3dInferenceKeyboardPicker.tsx",
  "bg3d/StudioBg3dLtPanel.tsx",
  "bg3d/StudioBg3dMeasurementPanel.tsx",
  "bg3d/StudioBg3dPlaceSetPackagePanel.tsx",
  "bg3d/StudioBg3dProceduralStarterPanel.tsx",
  "bg3d/StudioBg3dProductionMultiPassExporterPanel.tsx",
  "bg3d/StudioBg3dProductionWorkflowBoundary.tsx",
  "bg3d/StudioBg3dProductionWorkflowPanel.tsx",
  "bg3d/StudioBg3dRetainedOwnerHost.tsx",
  "bg3d/StudioBg3dRoomBuilderPanel.tsx",
  "bg3d/StudioBg3dSceneOutliner.tsx",
  "bg3d/StudioBg3dSceneTemplatePanel.tsx",
  "bg3d/StudioBg3dSharedCharacterPlacementPanel.tsx",
  "bg3d/StudioBg3dSharedCharacterStatusOverlay.tsx",
  "bg3d/StudioBg3dSkpImportPanel.tsx",
  "bg3d/StudioBg3dSpatialStoryboardPanel.tsx",
  "bg3d/StudioBg3dTexturePaintPanel.tsx",
  "bg3d/StudioBg3dUserTemplateLibraryPanel.tsx",
  "bg3d/StudioBg3dViewPanel.tsx",
  "bg3d/StudioMarketplaceModelImport.tsx",
  "bg3d/StudioMarketplaceModelImportMount.tsx",
  "vrm/StudioVrmBroadcastPreview.tsx",
  "vrm/StudioVrmPoserPanelBodyC.tsx",
  "vrm/StudioVrmProjectArchiveAttestationDialog.tsx",
  "vrm/StudioVrmProjectArchiveAttestationHost.tsx",
  "vrm/StudioVrmTextureExportButton.tsx",
  "vrm/StudioVrmTexturePaintPanel.tsx",
  "scene-3d/StudioEmotionStagingSuggestionPanel.tsx",
  "scene-3d/StudioWebtoonPosePresetGrid.tsx",
] as const;

const MODULES = [
  { file: "studio-bg3d-panel-status-i18n.ts", keys: BG3D_R3_KEYS },
  { file: "studio-vrm-panel-status-i18n.ts", keys: VRM_R3_KEYS },
  { file: "studio-scene3d-status-i18n.ts", keys: SCENE3D_KEYS },
] as const;

describe("studio bg3d/vrm/scene-3d status i18n r3c03", () => {
  it("확장·신규 모듈의 ko/en 키가 패리티를 이루고 신규 키 ko 원문·플레이스홀더가 정확하다", () => {
    for (const mod of MODULES) {
      const blocks = parseRegisterModule(readSource(mod.file));
      expect(Object.keys(blocks.ko).sort(), mod.file).toEqual(Object.keys(blocks.en).sort());
      for (const key of mod.keys) {
        expect(blocks.ko[key], `ko missing ${key}`).toBe(EXPECTED_KO[key]);
        expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
        expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
        expect(placeholders(blocks.en[key] ?? ""), `placeholder mismatch ${key}`).toEqual(
          placeholders(blocks.ko[key] ?? ""),
        );
      }
    }
  });

  it("신규 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    const registered = new Set<string>();
    for (const mod of MODULES) {
      const blocks = parseRegisterModule(readSource(mod.file));
      for (const key of Object.keys(blocks.ko)) registered.add(key);
    }
    // batch3 이전 등록분까지 포함한 전체 등록 집합으로 dangling을 판정한다.
    for (const file of ["studio-bg3d-panel-status-i18n.ts", "studio-vrm-panel-status-i18n.ts"]) {
      const blocks = parseRegisterModule(readSource(file));
      for (const key of Object.keys(blocks.ko)) registered.add(key);
    }
    for (const key of [...BG3D_R3_KEYS, ...VRM_R3_KEYS, ...SCENE3D_KEYS]) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(studio\.(?:bg3dPanelStatus|vrmPanelStatus|scene3dStatus)\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(registered.has(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("이관 파일에 하드코딩된 로딩·실패·에러 문자열이 남지 않았다", () => {
    for (const file of CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });
});
