import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_FORBIDDEN_DEFAULT_UI_TERMS } from "../../domains/creator/studio-product-ia";

const ROOT = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

/**
 * Unslop 크리에이터 크롬 회귀 봉쇄 계약 (T-UX-13).
 *
 * Wave 2A~2D 및 production-hub 정제 완료 파일에서 원시 색상, 금지 모션·AI 배경 워시,
 * 내부 개발 용어·경쟁사명, 장식 이모지, sub-12px·font-black 타이포 슬롭이 다시 유입되지 않도록
 * 저장소 수준에서 영구 봉쇄한다.
 */
const REFINED_CHROME_CSS_FILES = [
  "apps/web/src/domains/creator/studio-shell/studio-visual-identity.css",
  "apps/web/src/domains/creator/studio-shell/studio-visual-identity-v2.css",
  "apps/web/src/domains/creator/studio-shell/studio-illustrated-editor-chrome.css",
  "apps/web/src/domains/creator/studio-shell/studio-illustrated-project-surfaces.css",
  "apps/web/src/domains/creator/studio-3d-ui/studio-3d-illustrated-chrome.css",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css",
  "apps/web/src/domains/creator/bg3d/studio-bg3d-scene-assistant.css",
  "apps/web/src/domains/creator/character-shaper/studio-character-shaper-workspace.css",
  "apps/web/src/domains/creator/storyworld/studio-storyworld-lab.css",
  "apps/web/src/domains/creator/storyworld/plausibility/studio-story-plausibility.css",
] as const;

const STRICT_ZERO_HEX_RGB_CSS_FILES = [
  "apps/web/src/domains/creator/studio-shell/studio-visual-identity.css",
  "apps/web/src/domains/creator/studio-shell/studio-visual-identity-v2.css",
  "apps/web/src/domains/creator/studio-shell/studio-illustrated-editor-chrome.css",
  "apps/web/src/domains/creator/studio-shell/studio-illustrated-project-surfaces.css",
  "apps/web/src/domains/creator/studio-3d-ui/studio-3d-illustrated-chrome.css",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css",
  "apps/web/src/domains/creator/storyworld/studio-storyworld-lab.css",
  "apps/web/src/domains/creator/storyworld/plausibility/studio-story-plausibility.css",
] as const;

const REFINED_CHROME_TSX_FILES = [
  // Wave 2A (T-UX-03)
  "apps/web/src/domains/creator/StudioCheckpointPanel.tsx",
  "apps/web/src/domains/creator/StudioDraftOperationSyncAssistant.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/drawing-save/StudioDraftSaveRecordMetrics.tsx",
  "apps/web/src/domains/creator/StudioWorkspaceRegionMenu.tsx",
  "apps/web/src/domains/creator/studio-router/routes/StudioAiComicDirectorRoute.tsx",
  "apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyC.tsx",
  "apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyD.tsx",
  "apps/web/src/domains/creator/vrm/studio-vrm-procedural-scene-props.tsx",
  // Wave 2B (T-UX-02, T-UX-11)
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarityBar.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarityCoreTools.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarityMobileBar.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingQuickErgonomicsBar.tsx",
  "apps/web/src/domains/creator/StudioInspectorAsideShell.tsx",
  // Wave 2C (T-UX-04 ~ T-UX-07)
  "apps/web/src/domains/creator/bg3d/StudioBg3dProfessionalWorkspace.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dAssetShelf.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dSceneAssistantWorkspace.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dWeatherMotionColorScriptCard.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dZDepthCrowdTodCard.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dEditorViewport.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dDynamicComponentsPanel.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dSpatialWebtoonPanel.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dLtPanel.tsx",
  "apps/web/src/domains/creator/CharacterShaperLandingPage.tsx",
  "apps/web/src/domains/creator/character-shaper/landing/CharacterShaperLandingHero.tsx",
  "apps/web/src/domains/creator/scene-3d/StudioPoserPage.tsx",
  "apps/web/src/domains/creator/vrm/StudioVrmAvatarForgeGenerateSection.tsx",
  "apps/web/src/domains/creator/vrm/StudioVrmPoseMaterialPanel.tsx",
  // Wave 2D (T-UX-08 ~ T-UX-10, T-UX-12)
  "apps/web/src/domains/creator/planning/StudioSeasonBeatBoard.tsx",
  "apps/web/src/domains/creator/planning/StudioEpisodeStoryPage.tsx",
  "apps/web/src/domains/creator/planning/StudioCharacterSheetPanel.tsx",
  "apps/web/src/domains/creator/planning/StudioCharacterCoverageMap.tsx",
  "apps/web/src/domains/creator/planning/StudioFactConcordancePanel.tsx",
  "apps/web/src/domains/creator/planning/StudioStorySeedBuilder.tsx",
  "apps/web/src/domains/creator/storyworld/StudioStoryworldLabPage.tsx",
  "apps/web/src/domains/creator/StudioStoryboardGridPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementHeader.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementContent.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryFastStartStrip.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx",
  "apps/web/src/domains/creator/CreateStartPage.tsx",
  "apps/web/src/domains/creator/drawing/StudioTextureToneLab.tsx",
  "apps/web/src/domains/creator/StudioArtifactIntakeTray.tsx",
  "apps/web/src/domains/creator/reader-preview/ReaderPreviewPanel.tsx",
  "apps/web/src/domains/creator/text/StudioCircularTextPanel.tsx",
  // T-UX-12 잔여 (production-hub/, triage-cycles/ 제외)
  "apps/web/src/domains/creator/production-hub/production-ux-kit/production-ux-kit-model.ts",
  "apps/web/src/domains/creator/production-hub/LiveCursorOverlay.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionCommandPalette.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionWorkspaceDialog.tsx",
  "apps/web/src/domains/creator/production-hub/CompareReviewViewer.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionManuscriptSnapshotPanel.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionRiskEditorDialog.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionUxKit.tsx",
  "apps/web/src/domains/creator/production-hub/OneClickVersionShare.tsx",
  "apps/web/src/domains/creator/production-hub/CollabNotificationInbox.tsx",
  "apps/web/src/domains/creator/production-hub/CompareSourcePoolStrip.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionVisualPlanningWorkspace.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionManuscriptWorkspace.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionReviewDeepLinkBanners.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionLandingPage.tsx",
  "apps/web/src/domains/creator/production-hub/WorkInviteArrivalBanner.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionProjectLoading.tsx",
  "apps/web/src/domains/creator/production-hub/TeamPeopleOverview.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionRoleWorkspace.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionExternalReviewPage.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionEpisodeRoomPage.tsx",
  "apps/web/src/domains/creator/production-hub/StageHandoffCard.tsx",
  "apps/web/src/domains/creator/production-hub/ModelSheetFreezePanel.tsx",
  "apps/web/src/domains/creator/production-hub/TeamWorkspaceUsagePage.tsx",
  "apps/web/src/domains/creator/production-hub/TeamWorkspacePage.tsx",
  "apps/web/src/domains/creator/production-hub/PinTaskInboxSection.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionScheduleWorkspace.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionScheduleViews.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionRiskWorkspace.tsx",
  "apps/web/src/domains/creator/production-hub/ProductionManagementWorkspace.tsx",
  // Wave V2-W1 (High-Craft Luminous Atelier & Zero-Friction Choreography)
  "apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.tsx",
  "apps/web/src/domains/creator/lettering/StudioBubbleToolPopoverBody.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dAtmospherePanel.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioRadialQuickWheel.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioContextMiniDock.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioVisualShortcutHud.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioSplitWipeOverlay.tsx",
  // Wave V2-W2 / W3B / W4 (Brush Studio · Character Shaper · Virtual Space HUD)
  "apps/web/src/domains/creator/brush/StudioBrushStudio.tsx",
  "apps/web/src/domains/creator/character-shaper/CharacterShaperShelf.tsx",
  "apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceIllustratedStageHud.tsx",
  "apps/web/src/domains/creator/virtual-space/three/StudioVirtualSpaceThreeHud.tsx",
] as const;

const FORBIDDEN_TERM_GUARDED_FILES = [
  "apps/web/src/domains/creator/StudioCheckpointPanel.tsx",
  "apps/web/src/domains/creator/StudioDraftOperationSyncAssistant.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/drawing-save/StudioDraftSaveRecordMetrics.tsx",
  "apps/web/src/domains/creator/StudioWorkspaceRegionMenu.tsx",
  "apps/web/src/domains/creator/studio-router/routes/StudioAiComicDirectorRoute.tsx",
  "apps/web/src/domains/creator/storyworld/StudioStoryworldLabPage.tsx",
  "apps/web/src/domains/creator/scene-3d/StudioPoserPage.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementHeader.tsx",
] as const;

const EMOJI_GUARDED_CHROME_FILES = [
  "apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyC.tsx",
  "apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyD.tsx",
  "apps/web/src/domains/creator/vrm/studio-vrm-procedural-scene-props.tsx",
  "apps/web/src/domains/creator/drawing/StudioTextureToneLab.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dAssetShelf.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dProfessionalWorkspace.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingQuickErgonomicsBar.tsx",
  "apps/web/src/domains/creator/brush/StudioBrushStudio.tsx",
  "apps/web/src/domains/creator/character-shaper/CharacterShaperShelf.tsx",
  "apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceIllustratedStageHud.tsx",
  "apps/web/src/domains/creator/virtual-space/three/StudioVirtualSpaceThreeHud.tsx",
] as const;

const SPARKLES_BANNED_CHROME_FILES = [
  "apps/web/src/domains/creator/bg3d/StudioBg3dAssetShelf.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dProfessionalWorkspace.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dDynamicComponentsPanel.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dSpatialWebtoonPanel.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dAtmospherePanel.tsx",
  "apps/web/src/domains/creator/vrm/StudioVrmAvatarForgeGenerateSection.tsx",
  "apps/web/src/domains/creator/vrm/StudioVrmPoseMaterialPanel.tsx",
  "apps/web/src/domains/creator/lettering/StudioBubbleToolPopoverBody.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingQuickErgonomicsBar.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioRadialQuickWheel.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioContextMiniDock.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioVisualShortcutHud.tsx",
  "apps/web/src/domains/creator/studio-cuttoon-editor/StudioSplitWipeOverlay.tsx",
  "apps/web/src/domains/creator/brush/StudioBrushStudio.tsx",
  "apps/web/src/domains/creator/character-shaper/CharacterShaperShelf.tsx",
  "apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceIllustratedStageHud.tsx",
  "apps/web/src/domains/creator/virtual-space/three/StudioVirtualSpaceThreeHud.tsx",
] as const;

const RAW_TAILWIND_COLOR_PATTERN =
  /\b(?:bg|text|border|ring|from|to|via|shadow|accent)-(?:white|black|slate|amber|rose|sky|emerald|violet|fuchsia|red|green|blue|yellow|orange|indigo|purple|pink|cyan|teal|zinc|gray|neutral)(?:-[0-9]{2,3})?(?:\/[0-9]+)?|\b(?:bg|text|border)-\[#[0-9a-fA-F]{3,8}\]/gu;

const SLOP_MOTION_AND_WASH_PATTERN =
  /\bstudio-v2-pulse\b|\bgpt25-bg-|scene-studio-canvas-aura|\btransition-all\b|\bhover:scale-|\banimate-pulse\b/gu;

const TYPOGRAPHY_SLOP_PATTERN =
  /\bfont-black\b|text-\[(?:9px|10px|0\.6rem|0\.625rem)\]/gu;

const DECORATIVE_UI_EMOJI_PATTERN =
  /[\u{1F300}-\u{1FAFF}\u2600-\u2601\u263D-\u263E\u2694\u2728\u274C\u2705]/gu;

/**
 * JSX 텍스트·aria-label·title에 노출되는 사용자 문구를 추출한다.
 * import 경로, TypeScript 식별자, 주석, 동결 i18n 사전 키 조회 인자는 제외한다.
 */
function extractUserFacingCopyLines(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/^\s*import\s+[\s\S]*?;\s*$/gmu, "");

  const hits: string[] = [];
  for (const match of withoutComments.matchAll(/>\s*([^<>{}\n]+?)\s*</gu)) {
    const text = match[1]?.trim();
    if (text) hits.push(text);
  }
  for (const match of withoutComments.matchAll(/\b(?:aria-label|title|placeholder)="([^"]+)"/gu)) {
    const text = match[1]?.trim();
    if (text) hits.push(text);
  }
  return hits;
}

describe("Unslop 크리에이터 크롬 회귀 봉쇄 계약 (T-UX-13)", () => {
  it("design-themes.css의 Starlight 정본 블록은 원시 hex/rgb 없이 OKLCH 토큰만 선언한다", () => {
    const themesCss = readRepoFile("apps/web/src/app/styles/design-themes.css");
    const starlightStart = themesCss.indexOf(':root[data-design-theme="starlight"]');
    expect(starlightStart).toBeGreaterThanOrEqual(0);
    const starlightBlock = themesCss.slice(starlightStart, themesCss.indexOf("}", starlightStart) + 1);

    expect(starlightBlock).toContain("oklch(");
    expect(starlightBlock.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/gu)).toBeNull();
  });

  it("정제된 크리에이터 CSS 10종에서 #ffff00·금지 모션·AI 배경 워시·원시 크롬 색이 0건이다", () => {
    const slopViolations: string[] = [];
    for (const file of REFINED_CHROME_CSS_FILES) {
      const css = readRepoFile(file);
      if (/#ffff00/iu.test(css)) slopViolations.push(`${file}: #ffff00`);
      for (const match of css.match(SLOP_MOTION_AND_WASH_PATTERN) ?? []) {
        slopViolations.push(`${file}: ${match}`);
      }
    }
    expect(slopViolations).toEqual([]);

    const rawColorViolations: string[] = [];
    for (const file of STRICT_ZERO_HEX_RGB_CSS_FILES) {
      const css = readRepoFile(file);
      for (const match of css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/gu) ?? []) {
        rawColorViolations.push(`${file}: ${match}`);
      }
    }
    expect(rawColorViolations).toEqual([]);
  });

  it("정제된 크리에이터 크롬 TSX 74종에서 원시 색상 토큰이 0건이다", () => {
    const violations: string[] = [];
    for (const file of REFINED_CHROME_TSX_FILES) {
      const lines = readRepoFile(file).split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        // 명시적 allowlist: 3D 선화 추출 미리보기 용지 백킹(캔버스 콘텐츠 표면, UI 크롬 아님)
        if (
          file === "apps/web/src/domains/creator/bg3d/StudioBg3dEditorViewport.tsx" &&
          line.includes("aspect-video") &&
          line.includes("bg-white")
        ) {
          continue;
        }
        const matches = line.match(RAW_TAILWIND_COLOR_PATTERN);
        if (matches) {
          violations.push(`${file}:${i + 1} -> ${matches.join(", ")}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("정제된 크리에이터 크롬 TSX 74종에서 금지 모션(transition-all·hover:scale-·animate-pulse)과 AI 워시가 0건이다", () => {
    const violations: string[] = [];
    for (const file of REFINED_CHROME_TSX_FILES) {
      const lines = readRepoFile(file).split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        // 명시적 allowlist: 웹캠 라이브 얼굴 추적 상태 LED 점(스켈레톤/장식 펄스 아님)
        if (
          file === "apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyD.tsx" &&
          line.includes('faceDetected ? "bg-good animate-pulse" : "bg-bad"')
        ) {
          continue;
        }
        const matches = line.match(SLOP_MOTION_AND_WASH_PATTERN);
        if (matches) {
          violations.push(`${file}:${i + 1} -> ${matches.join(", ")}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("금지 내부 용어(STUDIO_FORBIDDEN_DEFAULT_UI_TERMS) 및 경쟁사명 노출이 0건이다", () => {
    expect(STUDIO_FORBIDDEN_DEFAULT_UI_TERMS.length).toBeGreaterThanOrEqual(12);

    const competitorAndLegacyPatterns = [
      /\bVARCO 3D\b/u,
      /\bWorld Anvil\b/u,
      /\bPlottr\b/u,
      /\bCampfire\b/u,
      /\bScrivener\b/u,
      /실험 앱 · 배포 대상 아님/u,
      /PBR 셰이딩/u,
      /\brev \{/u,
    ];

    const violations: string[] = [];
    for (const file of FORBIDDEN_TERM_GUARDED_FILES) {
      const src = readRepoFile(file);
      for (const pattern of competitorAndLegacyPatterns) {
        if (pattern.test(src)) {
          violations.push(`${file}: matched ${pattern.source}`);
        }
      }
      const uiCopyLines = extractUserFacingCopyLines(src);
      for (const copy of uiCopyLines) {
        const normalized = copy.toLowerCase();
        for (const term of STUDIO_FORBIDDEN_DEFAULT_UI_TERMS) {
          const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
          const re = /^[a-z ]+$/u.test(term.toLowerCase())
            ? new RegExp(`\\b${escaped}\\b`, "u")
            : new RegExp(escaped, "u");
          if (re.test(normalized)) {
            violations.push(`${file}: forbidden UI term "${term}" in "${copy}"`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("VRM·크롬 패널에 장식 UI 이모지와 장식 <Sparkles>가 0건이다", () => {
    const violations: string[] = [];
    for (const file of EMOJI_GUARDED_CHROME_FILES) {
      const src = readRepoFile(file);
      const matches = src.match(DECORATIVE_UI_EMOJI_PATTERN);
      if (matches) {
        violations.push(`${file}: emoji ${[...new Set(matches)].join("")}`);
      }
    }
    for (const file of SPARKLES_BANNED_CHROME_FILES) {
      const src = readRepoFile(file);
      if (/<Sparkles\b/u.test(src)) {
        violations.push(`${file}: <Sparkles>`);
      }
    }
    expect(violations).toEqual([]);

    // StudioVrmPoserPanelBodyD는 동결 i18n 사전 폴백에서 선두 경고 이모지를 런타임에 제거해야 한다.
    const bodyD = readRepoFile("apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyD.tsx");
    expect(bodyD).toContain("\\u26a0");
    expect(bodyD).toContain(".replace(");
  });

  it("정제된 크리에이터 크롬 TSX 74종에서 sub-12px(text-[9px]/text-[10px]/0.6rem~0.625rem)와 font-black이 0건이다", () => {
    const violations: string[] = [];
    for (const file of REFINED_CHROME_TSX_FILES) {
      const lines = readRepoFile(file).split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        const matches = line.match(TYPOGRAPHY_SLOP_PATTERN);
        if (matches) {
          violations.push(`${file}:${i + 1} -> ${matches.join(", ")}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
