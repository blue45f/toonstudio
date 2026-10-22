import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * creator 루트 패널 로딩·실패 문구 i18n 키 이관 계약 (A4 잔여 배치 1).
 *
 * 배경: creator 루트 패널 7파일(FileControlCenter·SharedWorksPanel·
 * CommunityMarketplaceLifecycle·CreatorCommunityPublicationPanel·
 * SceneSnapshotPanel·SelectionWorkbenchPanel·CustomFontsPanel)의
 * 로딩·실패·빈 상태 문구가 호출부에 한국어로 하드코딩돼 en 사용자의 동선이
 * 끊겼다. 표시 정본은 studio.panelStatus.* (studio-panel-status-i18n 등록
 * 모듈)·studio.customFonts.* (public/i18n/studio/customFonts 사전) 키이며,
 * 코드 안의 한국어 원문은 useT 폴백 인자·tText 폴백으로만 남아야 한다.
 * creator-status-i18n-contract의 GUARDED_FILES 4차 등록과 짝을 이룬다.
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

const PANEL_STATUS_KEYS = [
  "studio.panelStatus.communityPublication.creating",
  "studio.panelStatus.communityPublication.externalRemoveFailed",
  "studio.panelStatus.communityPublication.externalSaveFailed",
  "studio.panelStatus.communityPublication.loadFailed",
  "studio.panelStatus.communityPublication.releaseCreateFailed",
  "studio.panelStatus.communityPublication.releasesEmpty",
  "studio.panelStatus.communityPublication.reportSubmitFailed",
  "studio.panelStatus.communityPublication.reportSubmitting",
  "studio.panelStatus.communityPublication.saving",
  "studio.panelStatus.communityPublication.settingsSaveFailed",
  "studio.panelStatus.fileCenter.actionCommandNotFound",
  "studio.panelStatus.fileCenter.actionTargetNotFound",
  "studio.panelStatus.fileCenter.actionUnavailableInState",
  "studio.panelStatus.fileCenter.checkFailed",
  "studio.panelStatus.fileCenter.checking",
  "studio.panelStatus.fileCenter.dateTimeUnavailable",
  "studio.panelStatus.fileCenter.fileOpenDirectlyUnavailable",
  "studio.panelStatus.fileCenter.importerOpenAria",
  "studio.panelStatus.fileCenter.permissionUnknown",
  "studio.panelStatus.fileCenter.persistRequestFailed",
  "studio.panelStatus.fileCenter.persistUnsupported",
  "studio.panelStatus.fileCenter.recentFilesEmpty",
  "studio.panelStatus.fileCenter.storageChecking",
  "studio.panelStatus.fileCenter.storageReadFailed",
  "studio.panelStatus.fileCenter.storageUnavailable",
  "studio.panelStatus.marketplaceLifecycle.delistIncomplete",
  "studio.panelStatus.marketplaceLifecycle.delistIncompleteRetry",
  "studio.panelStatus.marketplaceLifecycle.historyEmpty",
  "studio.panelStatus.marketplaceLifecycle.historyLoadFailed",
  "studio.panelStatus.marketplaceLifecycle.historyLoadMoreFailed",
  "studio.panelStatus.marketplaceLifecycle.historyLoading",
  "studio.panelStatus.marketplaceLifecycle.loadingMore",
  "studio.panelStatus.marketplaceLifecycle.processing",
  "studio.panelStatus.marketplaceLifecycle.relistFailed",
  "studio.panelStatus.marketplaceLifecycle.reloadMore",
  "studio.panelStatus.marketplaceLifecycle.retry",
  "studio.panelStatus.sceneSnapshot.capturing",
  "studio.panelStatus.sceneSnapshot.corruptData",
  "studio.panelStatus.sceneSnapshot.dataUrlTooLarge",
  "studio.panelStatus.sceneSnapshot.deleting",
  "studio.panelStatus.sceneSnapshot.duplicating",
  "studio.panelStatus.sceneSnapshot.libraryEmpty",
  "studio.panelStatus.sceneSnapshot.libraryFull",
  "studio.panelStatus.sceneSnapshot.loadingSnapshots",
  "studio.panelStatus.sceneSnapshot.operationFailed",
  "studio.panelStatus.sceneSnapshot.payload3dTooLarge",
  "studio.panelStatus.sceneSnapshot.searchEmpty",
  "studio.panelStatus.sceneSnapshot.snapshotNotFound",
  "studio.panelStatus.sceneSnapshot.snapshotTooLarge",
  "studio.panelStatus.sceneSnapshot.storageBlocked",
  "studio.panelStatus.sceneSnapshot.storageChecking",
  "studio.panelStatus.sceneSnapshot.storageUnavailable",
  "studio.panelStatus.sceneSnapshot.storageUnavailableBadge",
  "studio.panelStatus.sceneSnapshot.totalTooLarge",
  "studio.panelStatus.selectionWorkbench.borderComputing",
  "studio.panelStatus.selectionWorkbench.borderEmpty",
  "studio.panelStatus.selectionWorkbench.borderTooLarge",
  "studio.panelStatus.selectionWorkbench.opacityReading",
  "studio.panelStatus.selectionWorkbench.refinementLoadFailed",
  "studio.panelStatus.selectionWorkbench.refinementPreparing",
  "studio.panelStatus.selectionWorkbench.restoreSelectionAria",
  "studio.panelStatus.selectionWorkbench.saveFailed",
  "studio.panelStatus.selectionWorkbench.saveListAddFailed",
  "studio.panelStatus.selectionWorkbench.saveStorageUnavailable",
  "studio.panelStatus.selectionWorkbench.saveToWorkFailed",
  "studio.panelStatus.selectionWorkbench.subjectAnalyzing",
  "studio.panelStatus.selectionWorkbench.subjectDoneNoUpload",
  "studio.panelStatus.selectionWorkbench.transparencyApplied",
  "studio.panelStatus.selectionWorkbench.transparencySkipped",
  "studio.panelStatus.sharedWorks.allLoaded",
  "studio.panelStatus.sharedWorks.commentAccessDetail",
  "studio.panelStatus.sharedWorks.dateUnavailable",
  "studio.panelStatus.sharedWorks.emptyWorks",
  "studio.panelStatus.sharedWorks.loadFailedFallback",
  "studio.panelStatus.sharedWorks.loadMore",
  "studio.panelStatus.sharedWorks.loadMoreWorks",
  "studio.panelStatus.sharedWorks.loadingMore",
  "studio.panelStatus.sharedWorks.loadingMoreShort",
  "studio.panelStatus.sharedWorks.loadingWorks",
  "studio.panelStatus.sharedWorks.openFailedTitle",
  "studio.panelStatus.sharedWorks.readOnlyAccessDetail",
  "studio.panelStatus.sharedWorks.reloadMore",
  "studio.panelStatus.sharedWorks.retry",
] as const;

const CUSTOM_FONTS_STATUS_KEYS = [
  "studio.customFonts.capacityExceeded",
  "studio.customFonts.cursorExpired",
  "studio.customFonts.deleteFailedKeepList",
  "studio.customFonts.deleteIntegrityFailed",
  "studio.customFonts.deleteRegisterFailed",
  "studio.customFonts.deleteStorageUnavailable",
  "studio.customFonts.deleteSuccess",
  "studio.customFonts.durableSaveFailed",
  "studio.customFonts.hydrationIntegrityFailed",
  "studio.customFonts.loadMoreLoading",
  "studio.customFonts.manifestCorruptImport",
  "studio.customFonts.memoryOnlyDeleted",
  "studio.customFonts.memoryOnlySaved",
  "studio.customFonts.nextPageReadFailed",
  "studio.customFonts.quotaExceededSave",
  "studio.customFonts.registerFailedMany",
  "studio.customFonts.registerFailedMore",
  "studio.customFonts.storageCheckingBadge",
  "studio.customFonts.storageCheckingImport",
  "studio.customFonts.storageIntegrityBadge",
  "studio.customFonts.storageIntegrityImportBlocked",
  "studio.customFonts.storageMemoryOnlyNotice",
] as const;

const PANEL_STATUS_CONSUMERS = [
  "StudioFileControlCenter.tsx",
  "StudioSharedWorksPanel.tsx",
  "StudioCommunityMarketplaceLifecycle.tsx",
  "CreatorCommunityPublicationPanel.tsx",
  "StudioSceneSnapshotPanel.tsx",
  "StudioSelectionWorkbenchPanel.tsx",
] as const;

describe("studio panel status i18n batch1", () => {
  it("studio.panelStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("studio-panel-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(PANEL_STATUS_KEYS.length);
    for (const key of PANEL_STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
    expect(blocks.ko["studio.panelStatus.sharedWorks.loadFailedFallback"]).toBe(
      "공유 작품을 불러오지 못했습니다.",
    );
    expect(blocks.ko["studio.panelStatus.sceneSnapshot.operationFailed"]).toBe(
      "로컬 장면 라이브러리 작업을 완료하지 못했습니다.",
    );
    expect(blocks.ko["studio.panelStatus.fileCenter.actionTargetNotFound"]).toBe(
      "{label} 실행 위치를 찾지 못했습니다.",
    );
  });

  it("studio.panelStatus 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = PANEL_STATUS_CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of PANEL_STATUS_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(studio\.panelStatus\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(
        (PANEL_STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("customFonts 신규 상태 키가 ko/en 사전에 모두 있고 패리티를 이룬다", () => {
    const ko = readJson("public/i18n/studio/customFonts/ko.json");
    const en = readJson("public/i18n/studio/customFonts/en.json");
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const key of CUSTOM_FONTS_STATUS_KEYS) {
      expect(ko[key], `ko missing ${key}`).toBeTruthy();
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
    expect(ko["studio.customFonts.deleteIntegrityFailed"]).toBe(
      "사용자 글꼴 저장소 무결성 오류로 삭제를 중단했습니다.",
    );
    expect(ko["studio.customFonts.storageCheckingBadge"]).toBe("SQLite/OPFS 사용자 글꼴 확인 중");
  });

  it("customFonts 신규 상태 키가 StudioCustomFontsPanel에서 실제로 참조된다", () => {
    const source = readSource("StudioCustomFontsPanel.tsx");
    for (const key of CUSTOM_FONTS_STATUS_KEYS) {
      expect(source.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
  });
});
