import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * brush-lab·brush·color·canvas·lettering 로딩·실패·빈 상태 문구 i18n 키
 * 이관 계약 (A4 잔여 3라운드 배치 c09).
 *
 * 표시 정본은 studio.brushCanvasStatus.* (studio-brush-canvas-status-i18n
 * 등록 모듈) 키이며, 코드 안의 한국어 원문은 t(key, fallback) 폴백 인자나
 * 비컴포넌트 생산자 헬퍼 brushCanvasStatusText(key, fallback)로만 남아야
 * 한다. 본문·제목·버튼 동사 라벨·사전성 데이터는 이관 대상이 아니며
 * (r3-c09.md 잔여 근거 참조), StudioDrawingInputDeckPanel의 품질 등급
 * 맵 limited 라벨과 StudioDialogueBubbleFitSection의 KIND_LABEL
 * unmeasurable 라벨은 맵 리터럴에 i18n-exempt 사유를 달고 렌더 지점에서
 * 키로 해석한다.
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

const BRUSH_CANVAS_STATUS_KEYS = [
  "studio.brushCanvasStatus.brushLab.catalogueEmpty",
  "studio.brushCanvasStatus.brushLab.changedDuringLoad",
  "studio.brushCanvasStatus.brushLab.connecting",
  "studio.brushCanvasStatus.brushLab.originalReadFailed",
  "studio.brushCanvasStatus.brushLab.savedReadFailed",
  "studio.brushCanvasStatus.brushLab.storageCheckFailed",
  "studio.brushCanvasStatus.brushLab.v5FileReadFailed",
  "studio.brushCanvasStatus.brushLab.v5NoBlockingIssues",
  "studio.brushCanvasStatus.brushLab.v5PolicyReadFailed",
  "studio.brushCanvasStatus.brushLab.v5BenchmarkFailed",
  "studio.brushCanvasStatus.brushLab.v5BenchmarkFailedWithMessage",
  "studio.brushCanvasStatus.brushLab.v5ReceiptEmpty",
  "studio.brushCanvasStatus.brushLab.v5StableFailed",
  "studio.brushCanvasStatus.brushLab.v5StablePassed",
  "studio.brushCanvasStatus.brushLab.v5UnstableMeasurement",
  "studio.brushCanvasStatus.brushLab.v6AutosaveFailed",
  "studio.brushCanvasStatus.brushLab.v6FileTooLarge",
  "studio.brushCanvasStatus.brushLab.v6ImportFailedKept",
  "studio.brushCanvasStatus.brushLab.v6SaveFailed",
  "studio.brushCanvasStatus.brushLab.v6SaveFailedWithMessage",
  "studio.brushCanvasStatus.brushLab.v6SearchEmpty",
  "studio.brushCanvasStatus.brushLab.v6SettingsReadFailed",
  "studio.brushCanvasStatus.brush.checkingInput",
  "studio.brushCanvasStatus.brush.clipboardUnavailable",
  "studio.brushCanvasStatus.brush.copyDiagnosticsFailed",
  "studio.brushCanvasStatus.brush.deckLoadingCenter",
  "studio.brushCanvasStatus.brush.deckLoadingProfiles",
  "studio.brushCanvasStatus.brush.materialSaveMismatch",
  "studio.brushCanvasStatus.brush.materialSettingsKept",
  "studio.brushCanvasStatus.brush.materialTransferFailed",
  "studio.brushCanvasStatus.brush.nativeCannotStart",
  "studio.brushCanvasStatus.brush.nativeOpening",
  "studio.brushCanvasStatus.brush.nativeProcessingStroke",
  "studio.brushCanvasStatus.brush.originalChecking",
  "studio.brushCanvasStatus.brush.originalExportFailed",
  "studio.brushCanvasStatus.brush.profileDeleteFailed",
  "studio.brushCanvasStatus.brush.profileEmpty",
  "studio.brushCanvasStatus.brush.profileLoading",
  "studio.brushCanvasStatus.brush.profileNameRequired",
  "studio.brushCanvasStatus.brush.profileOpenFailed",
  "studio.brushCanvasStatus.brush.profileSaveFailed",
  "studio.brushCanvasStatus.brush.subToolEmpty",
  "studio.brushCanvasStatus.brush.subToolSearchEmpty",
  "studio.brushCanvasStatus.brush.trayProMetadataFailed",
  "studio.brushCanvasStatus.canvas.adjustCacheRestoreFailed",
  "studio.brushCanvasStatus.canvas.adjustComputeAtScaleFailed",
  "studio.brushCanvasStatus.canvas.adjustComputeFailed",
  "studio.brushCanvasStatus.canvas.adjustMaskCanvasFailed",
  "studio.brushCanvasStatus.canvas.adjustMaskLoadFailed",
  "studio.brushCanvasStatus.canvas.gpuKeptFrame",
  "studio.brushCanvasStatus.canvas.gpuNotSwitched",
  "studio.brushCanvasStatus.canvas.gpuPrepareFailed",
  "studio.brushCanvasStatus.canvas.noSelectionFit",
  "studio.brushCanvasStatus.canvas.recoveryAutoRestoreFailed",
  "studio.brushCanvasStatus.canvas.recoveryAutoRestoreFailedTitle",
  "studio.brushCanvasStatus.canvas.recoveryBlockedUnverified",
  "studio.brushCanvasStatus.canvas.recoveryDeletingCheck",
  "studio.brushCanvasStatus.canvas.recoveryLoadingHeading",
  "studio.brushCanvasStatus.canvas.recoveryOpening",
  "studio.brushCanvasStatus.canvas.recoveryRequestFailed",
  "studio.brushCanvasStatus.canvas.stickyGoOriginalWork",
  "studio.brushCanvasStatus.canvas.stickyGoUploadEditor",
  "studio.brushCanvasStatus.canvas.stickyLockedKeptDesc",
  "studio.brushCanvasStatus.canvas.stickyLockedLoadingDesc",
  "studio.brushCanvasStatus.canvas.stickyLockedUploadDesc",
  "studio.brushCanvasStatus.canvas.stickyOtherAccountDesc",
  "studio.brushCanvasStatus.canvas.stickyReload",
  "studio.brushCanvasStatus.canvas.stickyRemixLoading",
  "studio.brushCanvasStatus.canvas.stickyRemixOpenFailed",
  "studio.brushCanvasStatus.canvas.stickySharedOpenFailed",
  "studio.brushCanvasStatus.canvas.stickyUploadEditorNeeded",
  "studio.brushCanvasStatus.canvas.stickyWorkLoading",
  "studio.brushCanvasStatus.canvas.stickyWorkOpenFailed",
  "studio.brushCanvasStatus.color.clipboardUnavailable",
  "studio.brushCanvasStatus.color.copyCodeFailed",
  "studio.brushCanvasStatus.color.historyEmpty",
  "studio.brushCanvasStatus.color.myPalettesLoading",
  "studio.brushCanvasStatus.color.paletteLoadFailed",
  "studio.brushCanvasStatus.color.paletteSaveFailed",
  "studio.brushCanvasStatus.color.palettesLoading",
  "studio.brushCanvasStatus.color.pinnedOpening",
  "studio.brushCanvasStatus.color.proofCaptureFailed",
  "studio.brushCanvasStatus.color.proofCaptureReadFailed",
  "studio.brushCanvasStatus.color.proofOperationFailed",
  "studio.brushCanvasStatus.color.proofProfileChecking",
  "studio.brushCanvasStatus.color.proofProfileReadFailed",
  "studio.brushCanvasStatus.color.proofSettingsChangeUnavailable",
  "studio.brushCanvasStatus.color.proofSettingsChangeUnavailableIcc",
  "studio.brushCanvasStatus.color.proofToolOpening",
  "studio.brushCanvasStatus.color.recentLoading",
  "studio.brushCanvasStatus.color.recentSaveFailed",
  "studio.brushCanvasStatus.color.recentSaving",
  "studio.brushCanvasStatus.color.reload",
  "studio.brushCanvasStatus.color.retrySave",
  "studio.brushCanvasStatus.color.swatchesAuthoredEmpty",
  "studio.brushCanvasStatus.color.swatchesRecentEmpty",
  "studio.brushCanvasStatus.lettering.anchorTargetMissing",
  "studio.brushCanvasStatus.lettering.bubbleFitUnmeasurable",
  "studio.brushCanvasStatus.lettering.bubbleShapeMinPoints",
  "studio.brushCanvasStatus.lettering.glossaryEmpty",
  "studio.brushCanvasStatus.lettering.lengthBudgetUnchecked",
  "studio.brushCanvasStatus.lettering.reviewEmpty",
  "studio.brushCanvasStatus.lettering.reviewNoTranslationPlaceholder",
  "studio.brushCanvasStatus.lettering.reviewNoTranslationYet",
  "studio.brushCanvasStatus.lettering.scenePlacementNoCandidates",
  "studio.brushCanvasStatus.lettering.storyEditorNoDialogueYet",
  "studio.brushCanvasStatus.lettering.textPathCurveLockedReason",
  "studio.brushCanvasStatus.lettering.voiceNoCharacters",
  "studio.brushCanvasStatus.lettering.voiceNoDeviations",
] as const;

const CONSUMERS = [
  "brush-lab/StudioBrushIntegratedWorkbench.tsx",
  "brush-lab/StudioBrushProductCataloguePanel.tsx",
  "brush-lab/StudioBrushV5Composer.tsx",
  "brush-lab/StudioBrushV5QualityWorkbench.tsx",
  "brush-lab/StudioBrushV5RuntimeWorkbench.tsx",
  "brush-lab/StudioBrushV6DraftGuard.tsx",
  "brush-lab/StudioBrushV6RecipeShelf.tsx",
  "brush-lab/StudioBrushV6Workbench.tsx",
  "brush/StudioBrushOriginalSourceActions.tsx",
  "brush/StudioBrushTray.tsx",
  "brush/StudioDrawingInputDeck.tsx",
  "brush/StudioDrawingInputDeckPanel.tsx",
  "brush/StudioDrawingInputProfileLibraryPanel.tsx",
  "brush/StudioMaterialBrushControls.tsx",
  "brush/StudioNativeBrushDocumentInspector.tsx",
  "brush/StudioNativeBrushDocumentInspectorMount.tsx",
  "brush/StudioNativeBrushEngineProbe.tsx",
  "brush/StudioSubToolPalette.tsx",
  "canvas/StudioCanvasStickyBanners.tsx",
  "canvas/StudioCanvasViewportDomOverlays.tsx",
  "canvas/StudioLiveAdjustmentGroup.tsx",
  "canvas/StudioRecoveryNotice.tsx",
  "canvas/StudioViewInspectorHud.tsx",
  "color/StudioColorEditor.tsx",
  "color/StudioColorHistoryPanel.tsx",
  "color/StudioColorProofContext.tsx",
  "color/StudioColorProofDialog.tsx",
  "color/StudioColorSwatches.tsx",
  "color/StudioPinnedColorPanelSlot.tsx",
  "lettering/StudioBubbleAnchorPanel.tsx",
  "lettering/StudioBubbleShapePanel.tsx",
  "lettering/StudioDialogueBubbleFitSection.tsx",
  "lettering/StudioDialogueGlossaryEditor.tsx",
  "lettering/StudioDialogueLengthBudgetSection.tsx",
  "lettering/StudioDialogueReviewSection.tsx",
  "lettering/StudioDialogueVoiceSection.tsx",
  "lettering/StudioScenePlacementSuggestionPanel.tsx",
  "lettering/StudioStoryEditorSurface.tsx",
  "lettering/StudioTextPathPanel.tsx",
] as const;

describe("studio brush/canvas/color/lettering status i18n r3c09", () => {
  it("studio.brushCanvasStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("studio-brush-canvas-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(BRUSH_CANVAS_STATUS_KEYS.length);
    for (const key of BRUSH_CANVAS_STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      const koPlaceholders = (blocks.ko[key] ?? "").match(/\{[A-Za-z0-9_]+\}/g) ?? [];
      const enPlaceholders = (blocks.en[key] ?? "").match(/\{[A-Za-z0-9_]+\}/g) ?? [];
      expect(enPlaceholders.sort(), `placeholder mismatch: ${key}`).toEqual(koPlaceholders.sort());
    }
    expect(blocks.ko["studio.brushCanvasStatus.brushLab.connecting"]).toBe("브러시 프로그램 연결 중");
    expect(blocks.ko["studio.brushCanvasStatus.canvas.stickyWorkOpenFailed"]).toBe("원고를 열지 못했어요");
    expect(blocks.ko["studio.brushCanvasStatus.color.recentSaveFailed"]).toBe(
      "최근 색을 저장하지 못했습니다. 현재 세션에서만 사용할 수 있으며 창을 닫으면 사라질 수 있습니다.",
    );
    expect(blocks.ko["studio.brushCanvasStatus.lettering.reviewNoTranslationPlaceholder"]).toBe(
      "번역이 없어요 — 직접 입력해 저장할 수 있어요",
    );
  });

  it("studio.brushCanvasStatus 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of BRUSH_CANVAS_STATUS_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(studio\.brushCanvasStatus\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(
        (BRUSH_CANVAS_STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("이관한 소비 파일에 하드코딩된 로딩·실패 상태 문구가 남지 않는다", () => {
    for (const file of CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });
});
