// 로딩·실패·에러 문자열의 키 기반 강제 계약 테스트.
// creator-a11y-contract 패턴 확장: 등록된 표면 파일들이 로딩·실패·에러 문구를
// 호출부에 하드코딩으로 다시 들여오지 않도록 정적 검사한다.
// 근거: inclusion 발견 1(a) — 신규 표면부터 키 기반(useT 키 / useBilingual 쌍 /
// defineBilingualText 등록)으로 강제하고, 한국어 원문은 키 폴백·*_KEYS 짝 맵으로만 허용.
//
// 신규 표면을 만들면 그 파일을 GUARDED_FILES에 등록하는 것이 이 계약의 일부다.
// 등록된 파일에 하드코딩 상태 문자열이 들어오면 이 테스트가 실패한다.
// 정당한 예외는 해당 줄에 "i18n-exempt: <사유>" 주석을 단다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "../../shared/language/status-i18n";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 이 계약이 지키는 표면들 — 1차 등록: 스튜디오 셸(라우트 로딩·실패 표면).
 * 표시 정본은 studio.canvas.shell.* 키 (studio-route-shell-i18n 계약과 짝).
 * 2차 등록 (A4, 2026-10-22): 에디터 패널 로딩 라벨 표면 24파일.
 * 표시 정본은 studio.canvas.panelLoading.* 키 (studio-panel-loading-i18n 계약과 짝).
 * 3차 등록 (A4 트랜치 2, 2026-10-22): 일정·게시·production-hub·ai 표면 32파일.
 * 표시 정본은 productionHub.status.* (app/productionHub 사전)·studio.aiStatus.*
 * (ai/studio-ai-status-i18n 등록)·studio.publish.status.* (publish/publish-status-i18n
 * 등록)·studio.aiToolPopover.* 키와 useBilingual 쌍 (studio-status-i18n-tranche2 계약과 짝).
 * 4차 등록 (A4 잔여 배치 1, 2026-10-22): creator 루트 패널 7파일.
 * 표시 정본은 studio.panelStatus.* (studio-panel-status-i18n 등록)·
 * studio.customFonts.* (public/i18n/studio/customFonts 사전) 키
 * (studio-status-i18n-batch1 계약과 짝).
 * 5차 등록 (A4 잔여 배치 2, 2026-10-22): StudioCuttoonEditorHost 1파일.
 * 표시 정본은 studio.hostStatus.* (studio-host-status-i18n 등록) 키
 * (studio-status-i18n-batch2 계약과 짝).
 * 6차 등록 (A4 잔여 배치 3, 2026-10-22): VRM 패널 3파일·bg3d 패널 6파일.
 * 표시 정본은 studio.vrmPanelStatus.* (studio-vrm-panel-status-i18n 등록)·
 * studio.bg3dPanelStatus.* (studio-bg3d-panel-status-i18n 등록) 키
 * (studio-status-i18n-batch3 계약과 짝).
 * 파일 크기 래칫 기준선 파일 3개(StudioInspectorImageToolsSection·
 * StudioBg3dEditorSidebarExtras·StudioLift3dPage)는 훅 대신
 * StudioPanelLoading의 labelKey/labelFallback 소품으로 키를 경유한다.
 */
const GUARDED_FILES = [
  "StudioLazySurfaceFallback.tsx",
  "studio-router/StudioRouteFallbacks.tsx",
  "studio-router/routes/StudioEditorRoute.tsx",
  "studio-router/routes/StudioProductionRoute.tsx",
  "studio-router/routes/StudioPublishRoute.tsx",
  "studio-router/routes/StudioStoryworldRoute.tsx",
  "studio-router/routes/StudioWorkAssetsRoute.tsx",
  "studio-router/routes/StudioAiComicDirectorRoute.tsx",
  "studio-router/StudioRouter.tsx",
  "StudioAssetLegacyPanel.tsx",
  "StudioAssetToolPopoverBody.tsx",
  "StudioAssetToolPopoverWorkspace.tsx",
  "StudioInspectorBubbleAppearanceControls.tsx",
  "StudioInspectorDrawingSection.tsx",
  "StudioInspectorFocusSpeedFrameControls.tsx",
  "StudioInspectorImageToolsSection.tsx",
  "StudioInspectorSelectionSection.tsx",
  "StudioInspectorShapeSection.tsx",
  "StudioInspectorTypographySection.tsx",
  "StudioInspectorUnselectedImageTools.tsx",
  "StudioInspectorUtilityPanels.tsx",
  "StudioSceneToolPopoverBody.tsx",
  "StudioStyleToolPopoverBody.tsx",
  "StudioToolBeltCreateModeGroups.tsx",
  "StudioToolBeltCreateModeInsertTools.tsx",
  "bg3d/StudioBg3dEditorSidebar.tsx",
  "bg3d/StudioBg3dEditorSidebarExtras.tsx",
  "bg3d/StudioBg3dProSuitePanel.tsx",
  "bg3d/StudioBg3dProSuitePanelContent.tsx",
  "bg3d/StudioBg3dSpatialStoryboardLauncher.tsx",
  "bg3d/StudioBg3dViewPanelLazy.tsx",
  "lift3d/StudioLift3dPage.tsx",
  "StudioInspectorSection.tsx",
  "StudioInspectorOrderAlignSection.tsx",
  "StudioInspectorRulersSection.tsx",
  "publish/PublishSpecAutoOptimizeSection.tsx",
  "production-hub/ProductionIntegrationsPanel.tsx",
  "production-hub/ProductionManuscriptSnapshotPanel.tsx",
  "production-hub/ProductionOperationsControlWorkspace.tsx",
  "production-hub/ProductionManuscriptDeliveryHub.tsx",
  "production-hub/ProductionManuscriptWorkspace.tsx",
  "production-hub/ProductionPageManifestBuilder.tsx",
  "production-hub/ProductionStudioRevisionWorkspace.tsx",
  "production-hub/ProductionRiskWorkspace.tsx",
  "production-hub/ProductionTaskBulkEditor.tsx",
  "production-hub/ProductionQuickExportPanel.tsx",
  "production-hub/ProductionRecoveryScenarioPanel.tsx",
  "production-hub/ProductionWorkflowDesigner.tsx",
  "production-hub/ProductionWorkBoard.tsx",
  "production-hub/ProductionEpisodeOperationsWorkspace.tsx",
  "production-hub/ProductionTaskEditor.tsx",
  "production-hub/ProductionExternalReviewWizard.tsx",
  "production-hub/ReviewVoiceCommentaryPanel.tsx",
  "production-hub/ProductionRiskEditorDialog.tsx",
  "production-hub/ProductionEpisodeProcessMatrix.tsx",
  "production-hub/ProductionFocusedAiWorkflow.tsx",
  "production-hub/ProductionRiskResponseCard.tsx",
  "production-hub/ProductionRiskResponseComposer.tsx",
  "production-hub/CollabNotificationInbox.tsx",
  "ai/StudioAiProvenancePanel.tsx",
  "ai/StudioAiImageReferencePackEditor.tsx",
  "ai/StudioAiEpisodeProductionModal.tsx",
  "ai/StudioAiSuperSuiteGateway.tsx",
  "ai/StudioStrokeProposalReviewPanel.tsx",
  "ai/StudioToonProductionBoard.tsx",
  "ai/StudioAiProductionLaunchpad.tsx",
  "ai/StudioAiToolPopoverBody.tsx",
  "StudioFileControlCenter.tsx",
  "StudioSharedWorksPanel.tsx",
  "StudioCommunityMarketplaceLifecycle.tsx",
  "CreatorCommunityPublicationPanel.tsx",
  "StudioSceneSnapshotPanel.tsx",
  "StudioSelectionWorkbenchPanel.tsx",
  "StudioCustomFontsPanel.tsx",
  "StudioCuttoonEditorHost.tsx",
  "vrm/StudioVrmPoseMaterialPanel.tsx",
  "vrm/StudioVrmAvatarReferenceRecommendationsPanel.tsx",
  "vrm/StudioVrmCharacterLibraryPanel.tsx",
  "bg3d/StudioBg3dImmersivePanel.tsx",
  "bg3d/StudioReferenceRebuildPresets.tsx",
  "bg3d/StudioBg3dSharedStagePanel.tsx",
  "bg3d/StudioBg3dAssetLibraryPanel.tsx",
  "bg3d/StudioBg3dMultiPassExporterPanelContent.tsx",
  "bg3d/StudioBg3dBundleThemePackPanel.tsx",
] as const;

function readGuarded(file: (typeof GUARDED_FILES)[number]): string {
  return readFileSync(join(HERE, file), "utf-8");
}

describe("로딩·실패·에러 문자열 키 기반 계약", () => {
  it("등록 표면에 하드코딩된 로딩·실패·에러 문자열이 없다", () => {
    const violations: string[] = [];
    for (const file of GUARDED_FILES) {
      for (const violation of scanHardcodedStatusStrings(readGuarded(file))) {
        violations.push(
          `${file}:${violation.line} → [${violation.kind}/${violation.rule}] ${violation.snippet}`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("탐지기가 신규 하드코딩을 실제로 잡는다 (게이트 무력화 방지)", () => {
    const planted = [
      `const NEW_FETCH_ERROR = "새 데이터를 불러오지 못했습니다.";`,
      `export function NewLoading({ label = "새 화면을 여는 중..." }: Props) {}`,
      `<StudioRouteLoading label="새 편집기를 여는 중..." />`,
    ].join("\n");
    const violations = scanHardcodedStatusStrings(planted);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations.some((v) => v.kind === "failure")).toBe(true);
    expect(violations.some((v) => v.kind === "loading")).toBe(true);
  });

  it("키 기반 표시(폴백 포함)는 위반이 아니다", () => {
    const compliant = [
      `<StudioRouteLoading label={t("studio.canvas.shell.loadingEditor", "Studio 편집기를 여는 중...")} />`,
      `const label = t("새 데이터를 불러오지 못했습니다.", "Failed to load new data.");`,
    ].join("\n");
    expect(scanHardcodedStatusStrings(compliant)).toEqual([]);
  });
});
