import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * StudioCuttoonEditorHost 로딩·실패 문구 i18n 키 이관 계약 (A4 잔여 배치 2).
 *
 * 배경: 호스트(29,482줄)의 UI 노출 로딩·실패 문구가 호출부에 한국어로
 * 하드코딩돼 en 사용자의 동선이 끊겼다. 표시 정본은 studio.hostStatus.*
 * (studio-host-status-i18n 등록 모듈) 키이며, 코드 안의 한국어 원문은
 * useT 폴백 인자로만 남아야 한다. creator-status-i18n-contract의
 * GUARDED_FILES 5차 등록과 짝을 이룬다. 과제 B로 StudioCustomFontsPanel의
 * 기존 참조 키 11개도 customFonts 사전에 등록해 함께 고정한다.
 */

const HANGUL = /[가-힣]/;

function readJson(relativeToWeb: string): Readonly<Record<string, string>> {
  const url = new URL(`../../../${relativeToWeb}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf-8")) as Record<string, string>;
}

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

const HOST_STATUS_KEYS = [
  "studio.hostStatus.abrImportRedirect",
  "studio.hostStatus.accountInstallSyncFailed",
  "studio.hostStatus.accountInstallSyncFailedDetail",
  "studio.hostStatus.adjustCanvasCreateFailed",
  "studio.hostStatus.aiAssetGenerateFailed",
  "studio.hostStatus.aiReferencePackFull",
  "studio.hostStatus.animationFxLoadFailed",
  "studio.hostStatus.apiKeyRequired",
  "studio.hostStatus.assetOriginalAlreadyLoading",
  "studio.hostStatus.assetRenameFailed",
  "studio.hostStatus.assetReportFailed",
  "studio.hostStatus.assetShareFailed",
  "studio.hostStatus.authoritySampleSendFailed",
  "studio.hostStatus.bgApplyFailed",
  "studio.hostStatus.bgScenesLoadFailed",
  "studio.hostStatus.brushDeleteRestoreFailed",
  "studio.hostStatus.brushFileFormatUnknown",
  "studio.hostStatus.brushImportInputNotReady",
  "studio.hostStatus.brushInputRecoveryReadFailed",
  "studio.hostStatus.brushInputRecoverySaveFailed",
  "studio.hostStatus.brushJsonImportRedirect",
  "studio.hostStatus.brushLibraryOpenFailed",
  "studio.hostStatus.brushListOpenFailed",
  "studio.hostStatus.brushLoadFailedSelectAgain",
  "studio.hostStatus.brushNoNewItems",
  "studio.hostStatus.brushPresetImportFailed",
  "studio.hostStatus.brushRecentSlotSaveFailed",
  "studio.hostStatus.brushUsageRecordFailed",
  "studio.hostStatus.bubbleMinPoints",
  "studio.hostStatus.canvasCreateFailed",
  "studio.hostStatus.characterAddFailed",
  "studio.hostStatus.clipChangeApplyFailed",
  "studio.hostStatus.clipSaveFallback",
  "studio.hostStatus.clipStorageOpenFailed",
  "studio.hostStatus.colorPickFailed",
  "studio.hostStatus.colorRangeSelectFailed",
  "studio.hostStatus.colorizeApplyFailed",
  "studio.hostStatus.colorizeSourceLayerNotFound",
  "studio.hostStatus.commentPageNotFound",
  "studio.hostStatus.commentPermissionInboxOpened",
  "studio.hostStatus.commentTargetNotFound",
  "studio.hostStatus.communityAssetLicenseUnverified",
  "studio.hostStatus.contentAwareFillFailed",
  "studio.hostStatus.cropCanvasCreateFailed",
  "studio.hostStatus.cropRegionCalcFailed",
  "studio.hostStatus.cutPlanConnectionError",
  "studio.hostStatus.cutPlanSafetyCheckFailed",
  "studio.hostStatus.dialogueEngineLoadFailed",
  "studio.hostStatus.dialoguePlaceFailed",
  "studio.hostStatus.dodgeBurnApplyFailed",
  "studio.hostStatus.editRasterPrepareFailed",
  "studio.hostStatus.emeresFramesLoadFailed",
  "studio.hostStatus.emeresGroupBlocked",
  "studio.hostStatus.emeresSaveFailed",
  "studio.hostStatus.eraserSymmetryUnavailable",
  "studio.hostStatus.exportOriginalOpenFailed",
  "studio.hostStatus.fillCanvasCreateFailed",
  "studio.hostStatus.fillToolEnableFailed",
  "studio.hostStatus.filterMaskApplyFailed",
  "studio.hostStatus.filterMaskResultCreateFailed",
  "studio.hostStatus.filterPreviewPageChanged",
  "studio.hostStatus.filterPreviewPrepareFailed",
  "studio.hostStatus.generatedAssetCanvasAddFailed",
  "studio.hostStatus.gpuLiveInkUnavailable",
  "studio.hostStatus.healBrushApplyFailed",
  "studio.hostStatus.historyBrushApplyFailed",
  "studio.hostStatus.historyBrushResultCreateFailed",
  "studio.hostStatus.historyBrushSourceMissing",
  "studio.hostStatus.hokusaiEngineLost",
  "studio.hostStatus.imageAddFailed",
  "studio.hostStatus.imageAddFailedShort",
  "studio.hostStatus.imageCropFailed",
  "studio.hostStatus.initialSampleSendFailed",
  "studio.hostStatus.isometricToolLoadFailed",
  "studio.hostStatus.lineArtCommitFailed",
  "studio.hostStatus.liquifyApplyFailed",
  "studio.hostStatus.liveStrokeTeamDocFailed",
  "studio.hostStatus.liveSurfaceError",
  "studio.hostStatus.liveSurfaceLost",
  "studio.hostStatus.livingInkEngineLost",
  "studio.hostStatus.livingInkFieldUnavailable",
  "studio.hostStatus.livingInkGpuReopenVerifyFailed",
  "studio.hostStatus.livingInkHashVerifyFailed",
  "studio.hostStatus.livingInkNoPixelSelection",
  "studio.hostStatus.livingInkPngIntegrityFailed",
  "studio.hostStatus.livingInkPngSavedStateFailed",
  "studio.hostStatus.livingInkStrokeSaveCanceled",
  "studio.hostStatus.livingInkSurfaceKept",
  "studio.hostStatus.livingInkWorkerAcceptFailed",
  "studio.hostStatus.lockedLayerClippingBlocked",
  "studio.hostStatus.magneticLassoFieldLoadFailed",
  "studio.hostStatus.marketInstallPrepareFailed",
  "studio.hostStatus.maskApplyFailed",
  "studio.hostStatus.maskFromSelectionFailed",
  "studio.hostStatus.maskInvertFailed",
  "studio.hostStatus.maskResultCreateFailed",
  "studio.hostStatus.materialCanvasAddFailed",
  "studio.hostStatus.materialFileReadFailed",
  "studio.hostStatus.materialLoadFailedStatus",
  "studio.hostStatus.naturalMediaStrokeSaveCanceled",
  "studio.hostStatus.naturalMediaWorkerStartFailed",
  "studio.hostStatus.oraImportInputNotReady",
  "studio.hostStatus.pageStrokeCommitFailed",
  "studio.hostStatus.paletteSaveFailed",
  "studio.hostStatus.panelLayoutsLoadFailed",
  "studio.hostStatus.penEraserSettingsSaveFailed",
  "studio.hostStatus.pixelSelectionRasterPrepareFailed",
  "studio.hostStatus.projectImportInputNotReady",
  "studio.hostStatus.psdImportInputNotReady",
  "studio.hostStatus.puppetWarpApplyFailed",
  "studio.hostStatus.puppetWarpResultCreateFailed",
  "studio.hostStatus.quickAccessLoadFailed",
  "studio.hostStatus.resizeUnavailable",
  "studio.hostStatus.reviewCanvasTooLarge",
  "studio.hostStatus.reviewSendFailed",
  "studio.hostStatus.sampleWorkLoadFailed",
  "studio.hostStatus.savingProjectSwitchBlocked",
  "studio.hostStatus.savingWorkLocked",
  "studio.hostStatus.scenarioCurrentPageApplyFailed",
  "studio.hostStatus.scenarioEmpty",
  "studio.hostStatus.scenarioGenerating",
  "studio.hostStatus.scenarioNewPageApplyFailed",
  "studio.hostStatus.sceneFitFailed",
  "studio.hostStatus.sceneInsertEngineLoadFailed",
  "studio.hostStatus.sceneNeedsLongerCanvas",
  "studio.hostStatus.sceneTemplateNotFound",
  "studio.hostStatus.sceneTemplatesLoadFailed",
  "studio.hostStatus.selectionAdjustFailed",
  "studio.hostStatus.selectionAreaMaskCreateFailed",
  "studio.hostStatus.selectionAreaMaskReadFailed",
  "studio.hostStatus.selectionDeleteFromOriginalFailed",
  "studio.hostStatus.selectionExtractFailed",
  "studio.hostStatus.selectionMaskCreateFailed",
  "studio.hostStatus.selectionNewLayerFailed",
  "studio.hostStatus.selectionPointNotFound",
  "studio.hostStatus.selectionRubAreaNotFound",
  "studio.hostStatus.selectionTransformFailed",
  "studio.hostStatus.serverRevisionsLoadFailed",
  "studio.hostStatus.sfxPresetsLoadFailed",
  "studio.hostStatus.sharedAssetDeleteFailed",
  "studio.hostStatus.sharedAssetListChanged",
  "studio.hostStatus.sharedAssetOriginalLoadFailed",
  "studio.hostStatus.sharedAssetsLoadFailed",
  "studio.hostStatus.sharedAssetsNextLoadFailed",
  "studio.hostStatus.shotSaveToReferenceFailed",
  "studio.hostStatus.slotSaveFailed",
  "studio.hostStatus.smudgeApplyFailed",
  "studio.hostStatus.stickerAssetsLoadFailed",
  "studio.hostStatus.strokeRecoveryKept",
  "studio.hostStatus.teamCommentUnsupportedChange",
  "studio.hostStatus.teamCommentsLoadFailed",
  "studio.hostStatus.teamCommentsProjectFailed",
  "studio.hostStatus.textureFramePresentFailed",
  "studio.hostStatus.timelapsePageNotFound",
  "studio.hostStatus.transformCanvasCreateFailed",
  "studio.hostStatus.translateNothingToTranslate",
  "studio.hostStatus.uploadWorkEditorBlocked",
  "studio.hostStatus.vectorFillLayerCreateFailed",
  "studio.hostStatus.vectorPdfCaptureCreateFailed",
  "studio.hostStatus.watermarkLoadFailed",
  "studio.hostStatus.webgpuStrokeSyncFailed",
  "studio.hostStatus.wetMixApplyFailed",
  "studio.hostStatus.workLoadFailed",
  "studio.hostStatus.writerRoomToolsLoadFailed",
] as const;

const CUSTOM_FONTS_LATE_KEYS = [
  "studio.customFonts.fileTooLarge",
  "studio.customFonts.noticeUploaded",
  "studio.customFonts.noticeUnsupported",
  "studio.customFonts.readFailed",
  "studio.customFonts.description",
  "studio.customFonts.emptyDescription",
  "studio.customFonts.usage",
  "studio.customFonts.storageCountUnbounded",
  "studio.customFonts.listAria",
  "studio.customFonts.applyAria",
  "studio.customFonts.deleteAria",
] as const;

describe("studio host status i18n batch2", () => {
  it("studio.hostStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("studio-host-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(HOST_STATUS_KEYS.length);
    for (const key of HOST_STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
    expect(blocks.ko["studio.hostStatus.workLoadFailed"]).toBe("원고를 불러오지 못했습니다.");
    expect(blocks.ko["studio.hostStatus.serverRevisionsLoadFailed"]).toBe(
      "서버 버전 목록을 불러오지 못했어요.",
    );
    expect(blocks.ko["studio.hostStatus.liveSurfaceError"]).toBe(
      "선택 표면 오류: {reason}. 다른 렌더러로 전환하지 않습니다.",
    );
  });

  it("studio.hostStatus 키가 호스트에서 실제로 참조되고 미등록 참조가 없다", () => {
    const source = readSource("StudioCuttoonEditorHost.tsx");
    expect(source.includes('import "./studio-host-status-i18n";')).toBe(true);
    for (const key of HOST_STATUS_KEYS) {
      expect(source.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...source.matchAll(/"(studio\.hostStatus\.[A-Za-z0-9]+)"/g)].map((match) => match[1] ?? ""),
    );
    for (const key of referenced) {
      expect(
        (HOST_STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("customFonts 후기 등록 키 11개가 ko/en 사전에 모두 있고 패리티를 이룬다", () => {
    const ko = readJson("public/i18n/studio/customFonts/ko.json");
    const en = readJson("public/i18n/studio/customFonts/en.json");
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const key of CUSTOM_FONTS_LATE_KEYS) {
      expect(ko[key], `ko missing ${key}`).toBeTruthy();
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
    expect(ko["studio.customFonts.readFailed"]).toBe(
      "글꼴 파일을 읽지 못했어요. 파일이 손상됐는지 확인해주세요.",
    );
    expect(ko["studio.customFonts.fileTooLarge"]).toBe(
      "글꼴 파일이 {selectedFileSize}로 한 개당 {limitSize} 한도를 넘었어요. 필요한 굵기만 서브셋한 WOFF2로 변환해 주세요.",
    );
    expect(ko["studio.customFonts.applyAria"]).toBe("{fontName} 글꼴 적용");
  });

  it("customFonts 후기 등록 키 11개가 StudioCustomFontsPanel에서 실제로 참조된다", () => {
    const source = readSource("StudioCustomFontsPanel.tsx");
    for (const key of CUSTOM_FONTS_LATE_KEYS) {
      expect(source.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...source.matchAll(/"(studio\.customFonts\.[A-Za-z0-9]+)"/g)].map((match) => match[1] ?? ""),
    );
    const ko = readJson("public/i18n/studio/customFonts/ko.json");
    for (const key of referenced) {
      expect(ko[key], `dangling customFonts reference: ${key}`).toBeTruthy();
    }
  });
});
