import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * VRM·bg3d 패널 로딩·실패·빈 상태 문구 i18n 키 이관 계약 (A4 잔여 배치 3).
 *
 * 배경: VRM 패널 3파일(PoseMaterial·AvatarReferenceRecommendations·
 * CharacterLibrary)과 bg3d 패널 6파일(Immersive·ReferenceRebuildPresets·
 * SharedStage·AssetLibrary·MultiPassExporterPanelContent·BundleThemePack)의
 * 로딩·실패·빈 상태 문구가 호출부에 한국어로 하드코딩돼 en 사용자의 동선이
 * 끊겼다. 표시 정본은 studio.vrmPanelStatus.* (studio-vrm-panel-status-i18n
 * 등록 모듈)·studio.bg3dPanelStatus.* (studio-bg3d-panel-status-i18n 등록
 * 모듈) 키이며, 코드 안의 한국어 원문은 useT 폴백 인자로만 남아야 한다.
 * creator-status-i18n-contract의 GUARDED_FILES 6차 등록과 짝을 이룬다.
 * 3라운드(c03)에서 같은 네임스페이스에 bg3d·vrm 잔여 패널 키·소비 파일을
 * 이어 붙였다 (상세는 studio-status-i18n-r3c03.test.ts).
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
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

const VRM_PANEL_STATUS_KEYS = [
  "studio.vrmPanelStatus.poseMaterial.storageUnavailable",
  "studio.vrmPanelStatus.poseMaterial.storageReadFailed",
  "studio.vrmPanelStatus.poseMaterial.storageWriteFailed",
  "studio.vrmPanelStatus.poseMaterial.libraryCorrupt",
  "studio.vrmPanelStatus.poseMaterial.libraryFuture",
  "studio.vrmPanelStatus.poseMaterial.replaceRequiresForce",
  "studio.vrmPanelStatus.poseMaterial.invalidLibrary",
  "studio.vrmPanelStatus.poseMaterial.invalidMaterial",
  "studio.vrmPanelStatus.poseMaterial.invalidId",
  "studio.vrmPanelStatus.poseMaterial.duplicateId",
  "studio.vrmPanelStatus.poseMaterial.maxCount",
  "studio.vrmPanelStatus.poseMaterial.maxBytes",
  "studio.vrmPanelStatus.poseMaterial.notFound",
  "studio.vrmPanelStatus.poseMaterial.loadFuture",
  "studio.vrmPanelStatus.poseMaterial.loadCorrupt",
  "studio.vrmPanelStatus.poseMaterial.loadUnavailable",
  "studio.vrmPanelStatus.poseMaterial.hydrating",
  "studio.vrmPanelStatus.poseMaterial.hydrationFailed",
  "studio.vrmPanelStatus.poseMaterial.savingToSqlite",
  "studio.vrmPanelStatus.poseMaterial.saveFailedMemoryOnly",
  "studio.vrmPanelStatus.poseMaterial.nameRequired",
  "studio.vrmPanelStatus.poseMaterial.captureFailed",
  "studio.vrmPanelStatus.poseMaterial.applyFailed",
  "studio.vrmPanelStatus.poseMaterial.exportFileFailed",
  "studio.vrmPanelStatus.poseMaterial.importTooLarge",
  "studio.vrmPanelStatus.poseMaterial.importReadFailed",
  "studio.vrmPanelStatus.poseMaterial.empty",
  "studio.vrmPanelStatus.avatarRecommendations.progressPreparing",
  "studio.vrmPanelStatus.avatarRecommendations.progressCheckingFile",
  "studio.vrmPanelStatus.avatarRecommendations.progressPreprocessing",
  "studio.vrmPanelStatus.avatarRecommendations.progressModelPreparing",
  "studio.vrmPanelStatus.avatarRecommendations.progressEmbedding",
  "studio.vrmPanelStatus.avatarRecommendations.progressRanking",
  "studio.vrmPanelStatus.avatarRecommendations.progressReady",
  "studio.vrmPanelStatus.avatarRecommendations.catalogueLoading",
  "studio.vrmPanelStatus.avatarRecommendations.catalogueUnavailable",
  "studio.vrmPanelStatus.avatarRecommendations.catalogueRetry",
  "studio.vrmPanelStatus.avatarRecommendations.runtimeUnsupported",
  "studio.vrmPanelStatus.characterLibrary.uploadedEmpty",
  "studio.vrmPanelStatus.characterLibrary.loadingCharacters",
  "studio.vrmPanelStatus.characterLibrary.loadingMore",
  "studio.vrmPanelStatus.characterLibrary.loadNextPage",
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

const BG3D_PANEL_STATUS_KEYS = [
  "studio.bg3dPanelStatus.immersive.insecureContext",
  "studio.bg3dPanelStatus.immersive.unavailable",
  "studio.bg3dPanelStatus.immersive.unsupported",
  "studio.bg3dPanelStatus.immersive.busy",
  "studio.bg3dPanelStatus.immersive.requestFailed",
  "studio.bg3dPanelStatus.immersive.rendererFailed",
  "studio.bg3dPanelStatus.immersive.disposed",
  "studio.bg3dPanelStatus.immersive.requesting",
  "studio.bg3dPanelStatus.immersive.presenting",
  "studio.bg3dPanelStatus.immersive.ending",
  "studio.bg3dPanelStatus.immersive.errorWithLock",
  "studio.bg3dPanelStatus.immersive.errorRechecking",
  "studio.bg3dPanelStatus.immersive.checkingSupport",
  "studio.bg3dPanelStatus.immersive.insecureNoHttps",
  "studio.bg3dPanelStatus.immersive.supportNotChecked",
  "studio.bg3dPanelStatus.immersive.bothUnsupported",
  "studio.bg3dPanelStatus.immersive.partialUnknown",
  "studio.bg3dPanelStatus.immersive.selectMode",
  "studio.bg3dPanelStatus.immersive.arUnavailableSuffix",
  "studio.bg3dPanelStatus.immersive.vrUnavailableSuffix",
  "studio.bg3dPanelStatus.referenceRebuild.workerOpenFailed",
  "studio.bg3dPanelStatus.referenceRebuild.building",
  "studio.bg3dPanelStatus.referenceRebuild.timeout",
  "studio.bg3dPanelStatus.referenceRebuild.buildFailed",
  "studio.bg3dPanelStatus.referenceRebuild.resultReadFailed",
  "studio.bg3dPanelStatus.referenceRebuild.invalidResult",
  "studio.bg3dPanelStatus.referenceRebuild.deliverBlocked",
  "studio.bg3dPanelStatus.referenceRebuild.deliverFailed",
  "studio.bg3dPanelStatus.referenceRebuild.buildAndImport",
  "studio.bg3dPanelStatus.sharedStage.processingLabel",
  "studio.bg3dPanelStatus.sharedStage.processingBackgroundMessage",
  "studio.bg3dPanelStatus.sharedStage.processingWithCharactersMessage",
  "studio.bg3dPanelStatus.sharedStage.backgroundOnlyLabel",
  "studio.bg3dPanelStatus.sharedStage.backgroundOnlyMessage",
  "studio.bg3dPanelStatus.sharedStage.checkNeededLabel",
  "studio.bg3dPanelStatus.sharedStage.unavailableMessage",
  "studio.bg3dPanelStatus.sharedStage.preparingLabel",
  "studio.bg3dPanelStatus.sharedStage.preparingMessage",
  "studio.bg3dPanelStatus.sharedStage.previewOnlyMessage",
  "studio.bg3dPanelStatus.sharedStage.connectPlannedLabel",
  "studio.bg3dPanelStatus.sharedStage.connectPlannedMessage",
  "studio.bg3dPanelStatus.assetLibrary.downloadSaveFailed",
  "studio.bg3dPanelStatus.assetLibrary.importCancelWithProgress",
  "studio.bg3dPanelStatus.assetLibrary.importCancel",
  "studio.bg3dPanelStatus.assetLibrary.importModels",
  "studio.bg3dPanelStatus.assetLibrary.listLoadFailed",
  "studio.bg3dPanelStatus.assetLibrary.degradedStorageUnavailable",
  "studio.bg3dPanelStatus.assetLibrary.listLoading",
  "studio.bg3dPanelStatus.assetLibrary.listEmpty",
  "studio.bg3dPanelStatus.assetLibrary.deleteBlockedRestoring",
  "studio.bg3dPanelStatus.multiPassExporter.preparingPasses",
  "studio.bg3dPanelStatus.multiPassExporter.composingPasses",
  "studio.bg3dPanelStatus.multiPassExporter.creatingPsd",
  "studio.bg3dPanelStatus.multiPassExporter.noPassSource",
  "studio.bg3dPanelStatus.multiPassExporter.prepareFailed",
  "studio.bg3dPanelStatus.multiPassExporter.downloadUnavailable",
  "studio.bg3dPanelStatus.multiPassExporter.psdSaveFailed",
  "studio.bg3dPanelStatus.multiPassExporter.noExportConnection",
  "studio.bg3dPanelStatus.bundleThemePack.loadFailed",
  "studio.bg3dPanelStatus.bundleThemePack.placing",
  "studio.bg3dPanelStatus.bundleThemePack.reload",
  "studio.bg3dPanelStatus.bundleThemePack.loadingPacks",
  "studio.bg3dPanelStatus.bundleThemePack.groupEmpty",
  "studio.bg3dPanelStatus.bundleThemePack.checkingAvailability",
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

const VRM_CONSUMERS = [
  "vrm/StudioVrmPoseMaterialPanel.tsx",
  "vrm/StudioVrmAvatarReferenceRecommendationsPanel.tsx",
  "vrm/StudioVrmCharacterLibraryPanel.tsx",
  "vrm/StudioVrmBroadcastPreview.tsx",
  "vrm/StudioVrmPoserPanelBodyC.tsx",
  "vrm/StudioVrmProjectArchiveAttestationDialog.tsx",
  "vrm/StudioVrmProjectArchiveAttestationHost.tsx",
  "vrm/StudioVrmTextureExportButton.tsx",
  "vrm/StudioVrmTexturePaintPanel.tsx",
] as const;

const BG3D_CONSUMERS = [
  "bg3d/StudioBg3dImmersivePanel.tsx",
  "bg3d/StudioReferenceRebuildPresets.tsx",
  "bg3d/StudioBg3dSharedStagePanel.tsx",
  "bg3d/StudioBg3dAssetLibraryPanel.tsx",
  "bg3d/StudioBg3dMultiPassExporterPanelContent.tsx",
  "bg3d/StudioBg3dBundleThemePackPanel.tsx",
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
] as const;

describe("studio vrm/bg3d panel status i18n batch3", () => {
  it("studio.vrmPanelStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("studio-vrm-panel-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(VRM_PANEL_STATUS_KEYS.length);
    for (const key of VRM_PANEL_STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
    expect(blocks.ko["studio.vrmPanelStatus.poseMaterial.storageReadFailed"]).toBe(
      "포즈 소재 저장소를 읽지 못했습니다.",
    );
    expect(blocks.ko["studio.vrmPanelStatus.poseMaterial.hydrationFailed"]).toBe(
      "SQLite/OPFS 포즈 소재를 검증해 불러오지 못했습니다. 원문 보호를 위해 변경을 막았습니다: {detail}",
    );
    expect(blocks.ko["studio.vrmPanelStatus.characterLibrary.loadingCharacters"]).toBe(
      "저장된 캐릭터를 불러오는 중입니다.",
    );
  });

  it("studio.vrmPanelStatus 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = VRM_CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of VRM_PANEL_STATUS_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(studio\.vrmPanelStatus\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(
        (VRM_PANEL_STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("studio.bg3dPanelStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("studio-bg3d-panel-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(BG3D_PANEL_STATUS_KEYS.length);
    for (const key of BG3D_PANEL_STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
    expect(blocks.ko["studio.bg3dPanelStatus.sharedStage.processingLabel"]).toBe("장면 처리 중");
    expect(blocks.ko["studio.bg3dPanelStatus.sharedStage.preparingMessage"]).toBe(
      "캐릭터 렌더 {ready}/{total}명 준비됨 · 모두 준비되면 이 배경과 연결할 수 있습니다.",
    );
    expect(blocks.ko["studio.bg3dPanelStatus.assetLibrary.listLoading"]).toBe(
      "저장된 3D 모델을 불러오는 중입니다.",
    );
    expect(blocks.ko["studio.bg3dPanelStatus.bundleThemePack.loadingPacks"]).toBe(
      "테마 팩을 불러오는 중입니다.",
    );
  });

  it("studio.bg3dPanelStatus 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = BG3D_CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of BG3D_PANEL_STATUS_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(studio\.bg3dPanelStatus\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(
        (BG3D_PANEL_STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });
});
