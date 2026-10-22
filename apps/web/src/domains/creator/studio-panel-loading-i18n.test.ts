import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 에디터 패널 로딩 라벨의 i18n 키 이관 계약 (A4 2차 이관).
 *
 * 배경: 패널 호출부가 StudioPanelLoading/StudioRouteLoading의 label에 한국어
 * 로딩 문구를 직접 지정해 en 사용자의 동선이 패널 로딩 순간에 끊겼다.
 * 표시 정본은 studio.canvas.panelLoading.* 키이며, 코드 안의 한국어 원문은
 * useT 폴백 인자·useBilingual 쌍·labelFallback 소품으로만 남아야 한다.
 * creator-status-i18n-contract의 GUARDED_FILES 2차 등록과 짝을 이룬다.
 */

const PANEL_LOADING_KEYS = [
  "studio.canvas.panelLoading.aiDirectorSession",
  "studio.canvas.panelLoading.aiMenu",
  "studio.canvas.panelLoading.assetLibrary",
  "studio.canvas.panelLoading.assetLibrary3d",
  "studio.canvas.panelLoading.assetMenu",
  "studio.canvas.panelLoading.auxiliaryWindow",
  "studio.canvas.panelLoading.backgroundEditor",
  "studio.canvas.panelLoading.brandKitPanel",
  "studio.canvas.panelLoading.bubbleMenu",
  "studio.canvas.panelLoading.bubbleStyle",
  "studio.canvas.panelLoading.collagePanel",
  "studio.canvas.panelLoading.colorCorrectionPanel",
  "studio.canvas.panelLoading.continuityMetaEditor",
  "studio.canvas.panelLoading.curvedTextPanel",
  "studio.canvas.panelLoading.cutLayout",
  "studio.canvas.panelLoading.elementsPanel",
  "studio.canvas.panelLoading.emeresFrames",
  "studio.canvas.panelLoading.fillAndLineTools",
  "studio.canvas.panelLoading.gradientPanel",
  "studio.canvas.panelLoading.imageAdjustments",
  "studio.canvas.panelLoading.imageTransformTools",
  "studio.canvas.panelLoading.layerMask",
  "studio.canvas.panelLoading.lift3dWorkbench",
  "studio.canvas.panelLoading.lineStylePanel",
  "studio.canvas.panelLoading.myFrames",
  "studio.canvas.panelLoading.paletteLibrary",
  "studio.canvas.panelLoading.panelSplitTool",
  "studio.canvas.panelLoading.preview3d",
  "studio.canvas.panelLoading.proTools3d",
  "studio.canvas.panelLoading.quickImageTools",
  "studio.canvas.panelLoading.roomBuilderTools",
  "studio.canvas.panelLoading.sceneLibrary2d",
  "studio.canvas.panelLoading.sceneProps",
  "studio.canvas.panelLoading.sceneTemplates",
  "studio.canvas.panelLoading.selectionRetouchTools",
  "studio.canvas.panelLoading.sharedSceneState",
  "studio.canvas.panelLoading.soundEffects",
  "studio.canvas.panelLoading.spatialStoryboardTools",
  "studio.canvas.panelLoading.stickerAssets",
  "studio.canvas.panelLoading.stickerPanel",
  "studio.canvas.panelLoading.studio3d",
  "studio.canvas.panelLoading.styleMenu",
  "studio.canvas.panelLoading.subToolsAndProps",
  "studio.canvas.panelLoading.templateTools",
  "studio.canvas.panelLoading.textEffectsPanel",
  "studio.canvas.panelLoading.textSizeLockPanel",
  "studio.canvas.panelLoading.tonePanel",
  "studio.canvas.panelLoading.unifiedAssets",
  "studio.canvas.panelLoading.viewTools",
  "studio.canvas.panelLoading.webtoonBackgroundTools",
  "studio.canvas.panelLoading.workPanel",
  "studio.canvas.panelLoading.advancedTypesetting",
  "studio.canvas.panelLoading.bubbleSettings",
  "studio.canvas.panelLoading.brushEngines",
  "studio.canvas.panelLoading.currentBrushEditor",
  "studio.canvas.panelLoading.effectLines",
  "studio.canvas.panelLoading.extendedBlend",
  "studio.canvas.panelLoading.inspectorDefault",
  "studio.canvas.panelLoading.layoutConstraints",
  "studio.canvas.panelLoading.lineCorrection",
  "studio.canvas.panelLoading.orderAlign",
  "studio.canvas.panelLoading.paragraphSettings",
  "studio.canvas.panelLoading.rulersGuides",
  "studio.canvas.panelLoading.shapeStyle",
  "studio.canvas.panelLoading.symmetryRuler",
  "studio.canvas.panelLoading.textFillStyle",
  "studio.canvas.panelLoading.tiltTool",
  "studio.canvas.panelLoading.typographyAppearance",
  "studio.canvas.panelLoading.typographyFont",
] as const;

/** useT() 훅 + t(키, 폴백) 패턴 파일 (domains/creator 기준 상대 경로) */
const HOOK_FILES = [
  "studio-router/StudioRouter.tsx",
  "StudioAssetLegacyPanel.tsx",
  "StudioAssetToolPopoverBody.tsx",
  "StudioAssetToolPopoverWorkspace.tsx",
  "StudioInspectorBubbleAppearanceControls.tsx",
  "StudioInspectorDrawingSection.tsx",
  "StudioInspectorFocusSpeedFrameControls.tsx",
  "StudioInspectorShapeSection.tsx",
  "StudioInspectorTypographySection.tsx",
  "StudioInspectorUnselectedImageTools.tsx",
  "StudioInspectorUtilityPanels.tsx",
  "StudioSceneToolPopoverBody.tsx",
  "StudioStyleToolPopoverBody.tsx",
  "StudioToolBeltCreateModeGroups.tsx",
  "StudioToolBeltCreateModeInsertTools.tsx",
  "bg3d/StudioBg3dEditorSidebar.tsx",
  "bg3d/StudioBg3dProSuitePanel.tsx",
  "bg3d/StudioBg3dSpatialStoryboardLauncher.tsx",
  "bg3d/StudioBg3dViewPanelLazy.tsx",
  "StudioInspectorSection.tsx",
  "StudioInspectorOrderAlignSection.tsx",
  "StudioInspectorRulersSection.tsx",
] as const;

/** 파일 크기 래칫 기준선 파일 — labelKey/labelFallback 소품 패턴 */
const LABEL_KEY_FILES = [
  "StudioInspectorImageToolsSection.tsx",
  "bg3d/StudioBg3dEditorSidebarExtras.tsx",
  "lift3d/StudioLift3dPage.tsx",
] as const;

/** StudioInspectorSection의 loadingLabel을 키로 받는 파일들 */
const INSPECTOR_SECTION_FILES = [
  "StudioInspectorSection.tsx",
  "StudioInspectorDrawingSection.tsx",
  "StudioInspectorOrderAlignSection.tsx",
  "StudioInspectorRulersSection.tsx",
  "StudioInspectorShapeSection.tsx",
  "StudioInspectorTypographySection.tsx",
] as const;

const HARDCODED_LOADING_LABEL = /loadingLabel="[^"]*[가-힣]/;

function readDictionary(locale: "ko" | "en"): Readonly<Record<string, string>> {
  const url = new URL(`../../../public/i18n/studio/canvas/${locale}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf-8")) as Record<string, string>;
}

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
}

const HANGUL = /[가-힣]/;
/** 로딩 부품의 label 소품에 한국어 리터럴이 직접 박힌 경우만 본다 (aria-label 등 타 라벨은 범위 밖). */
const HARDCODED_LABEL = /(?:StudioPanelLoading|StudioRouteLoading)\s+label="[^"]*[가-힣]/;

describe("studio panel loading i18n", () => {
  it("panelLoading 키가 ko/en 사전에 모두 있고 en 값에 한글이 없다", () => {
    const ko = readDictionary("ko");
    const en = readDictionary("en");
    for (const key of PANEL_LOADING_KEYS) {
      expect(ko[key], `ko missing ${key}`).toBeTruthy();
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("ko 사전 값이 기존 하드코딩 문구와 동일하다 (문구 변경 없는 이관)", () => {
    const ko = readDictionary("ko");
    expect(ko["studio.canvas.panelLoading.assetLibrary"]).toBe("소재 서재를 여는 중...");
    expect(ko["studio.canvas.panelLoading.sceneTemplates"]).toBe("장면 템플릿을 여는 중…");
    expect(ko["studio.canvas.panelLoading.webtoonBackgroundTools"]).toBe(
      "웹툰 배경 도구를 불러오는 중이에요…",
    );
    expect(ko["studio.canvas.panelLoading.lift3dWorkbench"]).toBe(
      "2D → 3D 변환 작업대를 여는 중...",
    );
  });

  it("훅 패턴 파일이 키를 경유하고 label 리터럴을 직접 넣지 않는다", () => {
    for (const file of HOOK_FILES) {
      const source = readSource(file);
      expect(source, `${file} does not use panelLoading keys`).toContain(
        't("studio.canvas.panelLoading.',
      );
      expect(HARDCODED_LABEL.test(source), `${file} still hardcodes a label`).toBe(false);
    }
  });

  it("래칫 파일은 labelKey 소품으로 키를 경유하고 훅을 추가하지 않는다", () => {
    for (const file of LABEL_KEY_FILES) {
      const source = readSource(file);
      expect(source, `${file} does not use labelKey`).toContain(
        'labelKey="studio.canvas.panelLoading.',
      );
      expect(HARDCODED_LABEL.test(source), `${file} still hardcodes a label`).toBe(false);
      expect(source).not.toContain("const t = useT();");
    }
    const fallback = readSource("StudioLazySurfaceFallback.tsx");
    expect(fallback).toContain("labelKey");
    expect(fallback).toContain("t(labelKey, labelFallback)");
  });

  it("기존 번역기와 이름이 겹치는 표면은 별도 변수명으로 키를 경유한다", () => {
    const source = readSource("StudioInspectorSelectionSection.tsx");
    expect(source).toContain('tPanelLoading("studio.canvas.panelLoading.workPanel"');
    expect(HARDCODED_LABEL.test(source)).toBe(false);
  });

  it("인스펙터 섹션 가족이 loadingLabel을 키로 받고 기본값도 키를 경유한다", () => {
    for (const file of INSPECTOR_SECTION_FILES) {
      const source = readSource(file);
      expect(
        HARDCODED_LOADING_LABEL.test(source),
        `${file} still hardcodes a loadingLabel`,
      ).toBe(false);
    }
    for (const file of [
      "StudioInspectorDrawingSection.tsx",
      "StudioInspectorOrderAlignSection.tsx",
      "StudioInspectorRulersSection.tsx",
      "StudioInspectorShapeSection.tsx",
      "StudioInspectorTypographySection.tsx",
    ]) {
      expect(readSource(file), `${file} does not use panelLoading keys`).toContain(
        'loadingLabel={t("studio.canvas.panelLoading.',
      );
    }
    const selection = readSource("StudioInspectorSelectionSection.tsx");
    expect(selection).toContain('loadingLabel={tPanelLoading("studio.canvas.panelLoading.');
    expect(HARDCODED_LOADING_LABEL.test(selection)).toBe(false);
    const section = readSource("StudioInspectorSection.tsx");
    expect(section).toContain('t("studio.canvas.panelLoading.inspectorDefault"');
    expect(section).not.toContain('loadingLabel = "설정을 여는 중..."');
  });

  it("이중언어 쌍 선례 파일은 useBilingual 쌍으로 표시한다", () => {
    const source = readSource("bg3d/StudioBg3dProSuitePanelContent.tsx");
    expect(source).toContain('t("제작 도구를 불러오는 중입니다.", "Loading production tools.")');
    expect(HARDCODED_LABEL.test(source)).toBe(false);
  });
});
