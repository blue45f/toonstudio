import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * creator 하위 도메인 로딩·실패·성공·빈 상태 문구 i18n 키 이관 계약
 * (A4 잔여 3라운드 c13b, 인벤토리 cat1 121건 중 이관 76건·소비 22파일).
 *
 * 표시 정본은 studio.creatorSub2.status.* 키이며 등록은 형제 모듈
 * studio-creator-sub2-status-i18n-r3c13b.ts가 맡는다. 소비 파일은 생산
 * 시점 해석 헬퍼 creatorSub2StatusText를 경유한다 (fortune·catalog 선례).
 * 기이관 32건(copyLocale·lt·bt 쌍, *_KEYS 짝 맵)과 잔여 13건의 근거는
 * r3-c13b.md에 남겼다.
 */

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
}

function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\(.)/g, "$1");
    }
    blocks[match[1] ?? ""] = { ...(blocks[match[1] ?? ""] ?? {}), ...entries };
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? "").sort();
}

const R3C13B_KEYS = [
  "studio.creatorSub2.status.animatic.keyframeLane.firstSegmentSuffix",
  "studio.creatorSub2.status.animatic.workspaceControls.subtitlesEmpty",
  "studio.creatorSub2.status.animatic.workspacePanel.changed",
  "studio.creatorSub2.status.animatic.workspacePanel.captureFailed",
  "studio.creatorSub2.status.animatic.workspacePanel.pngFailed",
  "studio.creatorSub2.status.animatic.workspacePanel.loading",
  "studio.creatorSub2.status.catalog.controls.storageRetry",
  "studio.creatorSub2.status.catalog.illustrationPreview.loadFailed",
  "studio.creatorSub2.status.catalog.illustrationPreview.loading",
  "studio.creatorSub2.status.catalog.sceneTemplate.addFailed",
  "studio.creatorSub2.status.catalog.sceneTemplate.loading",
  "studio.creatorSub2.status.catalog.sceneTemplate.empty",
  "studio.creatorSub2.status.character.partsPanel.incompatible",
  "studio.creatorSub2.status.character.partsPanel.libraryEmpty",
  "studio.creatorSub2.status.character.partsPanel.partsEmpty",
  "studio.creatorSub2.status.character.workbench.runtimeTestFailed",
  "studio.creatorSub2.status.character.workbench.presetsEmpty",
  "studio.creatorSub2.status.ecosystem.page.saveRecordFailed",
  "studio.creatorSub2.status.ecosystem.page.translationDraftNotice",
  "studio.creatorSub2.status.ecosystem.page.betaPackageFailed",
  "studio.creatorSub2.status.ecosystem.page.feedbackLoadFailed",
  "studio.creatorSub2.status.ecosystem.page.imageReadFailed",
  "studio.creatorSub2.status.ecosystem.page.processImageReadFailed",
  "studio.creatorSub2.status.ecosystem.viewer.packageOpened",
  "studio.creatorSub2.status.ecosystem.viewer.packageReadFailed",
  "studio.creatorSub2.status.ecosystem.workbench.aiJsonArrayNotFound",
  "studio.creatorSub2.status.ecosystem.workbench.translationDraftsReceived",
  "studio.creatorSub2.status.ecosystem.workbench.translationDraftFailed",
  "studio.creatorSub2.status.ecosystem.workbench.noApprovedTranslation",
  "studio.creatorSub2.status.ecosystem.workbench.worldChangeFailed",
  "studio.creatorSub2.status.ecosystem.workbench.publishCheckRequired",
  "studio.creatorSub2.status.ecosystem.workbench.previewUnavailable",
  "studio.creatorSub2.status.live.center.syncPhase.initializing",
  "studio.creatorSub2.status.live.center.syncPhase.synced",
  "studio.creatorSub2.status.live.center.syncPhase.syncing",
  "studio.creatorSub2.status.live.center.syncPhase.offlineQueued",
  "studio.creatorSub2.status.live.center.syncPhase.retrying",
  "studio.creatorSub2.status.live.center.syncPhase.repairing",
  "studio.creatorSub2.status.live.center.syncPhase.durabilityRisk",
  "studio.creatorSub2.status.live.center.syncPhase.readOnlyFollower",
  "studio.creatorSub2.status.live.center.syncPhase.unsupportedJam",
  "studio.creatorSub2.status.live.center.syncPhase.admissionDenied",
  "studio.creatorSub2.status.live.center.syncPhase.revoked",
  "studio.creatorSub2.status.live.center.syncPhase.recoveryRequired",
  "studio.creatorSub2.status.live.center.mode.connecting",
  "studio.creatorSub2.status.live.center.mode.error",
  "studio.creatorSub2.status.live.center.revokedDetail",
  "studio.creatorSub2.status.live.center.unsupportedBrowser",
  "studio.creatorSub2.status.live.center.syncPreparing",
  "studio.creatorSub2.status.live.center.copySummaryFailed",
  "studio.creatorSub2.status.live.center.peersEmpty",
  "studio.creatorSub2.status.live.quick.cursorChatFailed",
  "studio.creatorSub2.status.live.quick.attentionFailed",
  "studio.creatorSub2.status.live.huddle.sendFailed",
  "studio.creatorSub2.status.offline.panel.rechecking",
  "studio.creatorSub2.status.offline.panel.prepareFailed",
  "studio.creatorSub2.status.offline.panel.persistDenied",
  "studio.creatorSub2.status.offline.panel.summaryReconnecting",
  "studio.creatorSub2.status.offline.panel.checking",
  "studio.creatorSub2.status.offline.panel.retryReady",
  "studio.creatorSub2.status.offline.panel.retry",
  "studio.creatorSub2.status.offline.boundary.ariaLabel",
  "studio.creatorSub2.status.offline.boundary.loadFailed",
  "studio.creatorSub2.status.offline.runtime.prepareFailed",
  "studio.creatorSub2.status.publish.spec.oversizedWarning",
  "studio.creatorSub2.status.reviewShare.invalidLink",
  "studio.creatorSub2.status.reviewShare.linkExpired",
  "studio.creatorSub2.status.reviewShare.imageLoadFailed",
  "studio.creatorSub2.status.reviewShare.feedbackConfirmFailed",
  "studio.creatorSub2.status.reviewShare.feedbackRetrySuffix",
  "studio.creatorSub2.status.reviewShare.linkExpiredOrRevoked",
  "studio.creatorSub2.status.reviewShare.saving",
  "studio.creatorSub2.status.reviewShare.unavailableTitle",
  "studio.creatorSub2.status.reviewShare.imageChecking",
  "studio.creatorSub2.status.reviewShare.pagesEmpty",
  "studio.creatorSub2.status.reviewShare.imageRetry",
  "studio.creatorSub2.status.reviewShare.feedbackEmpty",
  "studio.creatorSub2.status.router.aiDirector.sessionIdUnavailable",
  "studio.creatorSub2.status.router.aiDirector.jobsEmpty",
  "studio.creatorSub2.status.toolchain.jobWorkspace.runnerNotConnected",
  "studio.creatorSub2.status.virtualSpace.furniture.bounds",
  "studio.creatorSub2.status.virtualSpace.furniture.occupied",
  "studio.creatorSub2.status.virtualSpace.furniture.access",
  "studio.creatorSub2.status.virtualSpace.furniture.limit",
  "studio.creatorSub2.status.virtualSpace.furniture.invalid",
] as const;

const CONSUMER_FILES = [
  "animatic/StudioAnimaticKeyframeLane.tsx",
  "animatic/StudioAnimaticWorkspaceControls.tsx",
  "animatic/StudioAnimaticWorkspacePanel.tsx",
  "catalog/StudioCatalogControls.tsx",
  "catalog/StudioIllustrationScenePreview.tsx",
  "catalog/StudioSceneTemplateBrowser.tsx",
  "character-platform/ui/CharacterCanonicalPartsPanel.tsx",
  "character-platform/ui/CharacterPlatformWorkbench.tsx",
  "ecosystem/CreatorEcosystemPage.tsx",
  "ecosystem/CreatorEcosystemViewerPage.tsx",
  "ecosystem/CreatorEcosystemWorkbench.tsx",
  "live/StudioLiveCollaborationCommandCenter.tsx",
  "live/StudioLiveQuickCollaborationControls.tsx",
  "live/huddle/StudioP2pHuddleLauncher.tsx",
  "offline/StudioOfflinePanel.tsx",
  "offline/StudioOfflinePanelBoundary.tsx",
  "offline/StudioOfflineRuntime.tsx",
  "publish/PublishSpecAutoOptimizeSection.tsx",
  "review-share/StudioPinnedReviewSharePage.tsx",
  "studio-router/routes/StudioAiComicDirectorRoute.tsx",
  "toolchain/StudioProductionJobWorkspace.tsx",
  "virtual-space/StudioVirtualSpaceCustomFurniturePicker.tsx",
] as const;

const MODULE_SOURCE = readSource("studio-creator-sub2-status-i18n-r3c13b.ts");
const REGISTERED = parseRegisterModule(MODULE_SOURCE);
const CONSUMER_SOURCES = CONSUMER_FILES.map((file) => readSource(file)).join("\n");

describe("c13b creator 하위 도메인 상태 문구 이관 계약", () => {
  it("(a) ko/en 키 패리티와 플레이스홀더 패리티가 일치한다", () => {
    expect(Object.keys(REGISTERED.ko).sort()).toEqual([...R3C13B_KEYS].sort());
    expect(Object.keys(REGISTERED.en).sort()).toEqual([...R3C13B_KEYS].sort());
    for (const key of R3C13B_KEYS) {
      expect(placeholders(REGISTERED.ko[key] ?? ""), key).toEqual(placeholders(REGISTERED.en[key] ?? ""));
    }
  });

  it("(b) 전 키가 소비처에서 참조된다", () => {
    for (const key of R3C13B_KEYS) {
      expect(CONSUMER_SOURCES.includes(`"${key}"`), key).toBe(true);
    }
  });

  it("(c) 소비처의 미등록 키 참조가 없다", () => {
    const referenced = new Set(
      [...CONSUMER_SOURCES.matchAll(/"(studio\.creatorSub2\.status\.[a-zA-Z0-9.]+)"/g)].map((m) => m[1] ?? ""),
    );
    for (const key of referenced) {
      expect(Object.hasOwn(REGISTERED.ko, key), key).toBe(true);
    }
    expect(referenced.size).toBe(R3C13B_KEYS.length);
  });

  it("(d) 이관한 소비 파일에 탐지기 위반이 없다", () => {
    const violations: string[] = [];
    for (const file of CONSUMER_FILES) {
      for (const violation of scanHardcodedStatusStrings(readSource(file))) {
        violations.push(`${file}:${violation.line} → [${violation.kind}/${violation.rule}] ${violation.snippet}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
