import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * collaboration·account 클러스터 로딩·실패·빈 상태 문구 i18n 키 이관 계약
 * (A4 잔여 3라운드 c01).
 *
 * 배경: account 설정 2파일과 collaboration 루트·hiring 패널 18파일의
 * 로딩·실패·에러·빈 상태 문구가 호출부에 한국어로 하드코딩돼 있었다.
 * 표시 정본은 collaboration-account-status-i18n 등록 모듈의
 * account.*·collaboration.* 키이며, 코드 안의 한국어 원문은 useT 폴백
 * 인자로만 남아야 한다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
}

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

const STATUS_KEYS = [
  "account.connected.googleLinkFailed",
  "account.connected.linkServerUnavailable",
  "account.connected.loadFailed",
  "account.connected.loadFallbackFailed",
  "account.connected.unlinkFailed",
  "account.connected.unlinkServerUnavailable",
  "account.merge.codeCreateFailed",
  "account.merge.codeRequired",
  "account.merge.mergeFailed",
  "account.merge.previewFailed",
  "account.merge.serverUnavailable",
  "collaboration.application.empty",
  "collaboration.application.loadFailed",
  "collaboration.application.loading",
  "collaboration.application.processing",
  "collaboration.application.responseUnconfirmed",
  "collaboration.career.empty",
  "collaboration.career.loadFailed",
  "collaboration.career.loading",
  "collaboration.career.requestFailed",
  "collaboration.careerActivity.empty",
  "collaboration.careerActivity.loadFailed",
  "collaboration.careerActivity.loading",
  "collaboration.careerConfirmation.collaboratorsEmpty",
  "collaboration.careerConfirmation.collaboratorsLoadFailed",
  "collaboration.careerConfirmation.expiredNote",
  "collaboration.careerConfirmation.loadingCapability",
  "collaboration.careerConfirmation.loadingCollaborators",
  "collaboration.careerConfirmation.loadingRequests",
  "collaboration.careerConfirmation.previewLoadFailed",
  "collaboration.careerConfirmation.requestsLoadFailed",
  "collaboration.careerConfirmation.resultUnconfirmed",
  "collaboration.careerConfirmation.retryLoad",
  "collaboration.careerConfirmation.snapshotUnavailable",
  "collaboration.careerConfirmation.state.confirmed",
  "collaboration.careerConfirmation.state.declined",
  "collaboration.careerConfirmation.state.expired",
  "collaboration.careerConfirmation.state.requested",
  "collaboration.careerConfirmation.state.revoked",
  "collaboration.careerConfirmation.storageUnavailable",
  "collaboration.careerGallery.empty",
  "collaboration.careerGallery.emptyForRole",
  "collaboration.careerGallery.loadFailed",
  "collaboration.careerGallery.loading",
  "collaboration.careerGallery.reload",
  "collaboration.hiringAutomation.resultUnconfirmedRetry",
  "collaboration.hiringAutomation.state.completed",
  "collaboration.hiringAutomation.state.expired",
  "collaboration.hiringAutomation.state.failed",
  "collaboration.hiringAutomation.state.processing",
  "collaboration.hiringAutomation.state.queued",
  "collaboration.hiringAutomation.state.stopped",
  "collaboration.hiringAutomation.statusUnconfirmed",
  "collaboration.hiringAvailability.loadFailed",
  "collaboration.hiringAvailability.loading",
  "collaboration.hiringAvailability.saveFailedReload",
  "collaboration.hiringAvailability.savedExpires",
  "collaboration.hiringCampaign.dispatchSaved",
  "collaboration.hiringCampaign.processFailed",
  "collaboration.hiringDiscovery.candidateExpired",
  "collaboration.hiringDiscovery.emptyAfter",
  "collaboration.hiringDiscovery.emptyFirst",
  "collaboration.hiringDiscovery.offerResultUnconfirmed",
  "collaboration.hiringDiscovery.offerSavedExpires",
  "collaboration.hiringDiscovery.searchFailedRetry",
  "collaboration.hiringDiscovery.slotClosedNotice",
  "collaboration.hiringInbox.empty",
  "collaboration.hiringInbox.loadFailed",
  "collaboration.hiringInbox.loading",
  "collaboration.hiringInbox.reload",
  "collaboration.hiringInbox.respondFailed",
  "collaboration.hiringInbox.state.cancelled",
  "collaboration.hiringInbox.state.declined",
  "collaboration.hiringInbox.state.expired",
  "collaboration.hiringInbox.state.interested",
  "collaboration.hiringInbox.state.read",
  "collaboration.hiringInbox.state.unread",
  "collaboration.hiringOffers.acceptSavedHold",
  "collaboration.hiringOffers.empty",
  "collaboration.hiringOffers.loadFailed",
  "collaboration.hiringOffers.loading",
  "collaboration.hiringOffers.processFailed",
  "collaboration.hiringOffers.reload",
  "collaboration.hiringOffers.state.accepted",
  "collaboration.hiringOffers.state.cancelled",
  "collaboration.hiringOffers.state.declined",
  "collaboration.hiringOffers.state.expired",
  "collaboration.hiringOffers.state.pending",
  "collaboration.hiringOffers.stepsNotice",
  "collaboration.hiringPost.empty",
  "collaboration.hiringPost.loadFailed",
  "collaboration.hiringPost.loading",
  "collaboration.hiringPost.reload",
  "collaboration.hiringPost.saveFailed",
  "collaboration.hiringSnapshot.loadFailed",
  "collaboration.hiringSnapshot.loading",
  "collaboration.hiringSubmission.reload",
  "collaboration.hiringSubmission.resumesEmpty",
  "collaboration.hiringSubmission.resumesLoadFailed",
  "collaboration.hiringSubmission.resumesLoading",
  "collaboration.hiringSubmission.submissionBlockedSuffix",
  "collaboration.hiringSubmission.versionsLoadFailed",
  "collaboration.meetingDevice.checkingLocal",
  "collaboration.meetingDevice.openFailed",
  "collaboration.meetingPanel.empty",
  "collaboration.meetingPanel.loading",
  "collaboration.meetingPanel.membersLoadFailed",
  "collaboration.meetingPanel.reloadList",
  "collaboration.meetingPanel.roomsLoadFailed",
  "collaboration.meetingRoom.checkingStatus",
  "collaboration.meetingRoom.sendFailureNote",
  "collaboration.meetingRoom.sendingCheck",
  "collaboration.meetingSchedule.createdResponseUnconfirmed",
  "collaboration.meetingSchedule.saveResultUnconfirmed",
  "collaboration.meetingSchedule.savingCheck",
  "collaboration.resumeEditor.saving",
  "collaboration.resumePreview.experiencesEmpty",
  "collaboration.resumePreview.portfolioEmpty",
  "collaboration.teams.empty",
  "collaboration.teams.loadFailed",
  "collaboration.teams.loading",
  "collaboration.teams.membersLoadFailed",
  "collaboration.teams.membersLoading",
  "collaboration.teams.requestFailed",
  "collaboration.teams.updateFailed"
] as const;

const CONSUMERS = [
  "../account/AccountMergeSettings.tsx",
  "../account/ConnectedAccountsSettings.tsx",
  "./collaboration-application-panel.tsx",
  "./hiring/CareerConfirmationPanel.tsx",
  "./hiring/CreatorCareerGalleryPage.tsx",
  "./hiring/CreatorCareerPanel.tsx",
  "./hiring/CreatorMeetingDeviceTest.tsx",
  "./hiring/CreatorMeetingPanel.tsx",
  "./hiring/CreatorMeetingRoom.tsx",
  "./hiring/CreatorMeetingScheduleForm.tsx",
  "./hiring/CreatorTeamsPanel.tsx",
  "./hiring/HiringAutomationPanel.tsx",
  "./hiring/HiringAvailabilityPanel.tsx",
  "./hiring/HiringCampaignPanel.tsx",
  "./hiring/HiringDiscovery.tsx",
  "./hiring/HiringOffersPanel.tsx",
  "./hiring/HiringPostPanel.tsx",
  "./hiring/HiringSubmissionPanel.tsx",
  "./hiring/ResumeEditor.tsx",
  "./hiring/ResumePreview.tsx"
] as const;

describe("collaboration/account status i18n r3c01", () => {
  it("등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("collaboration-account-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(STATUS_KEYS.length);
    for (const key of STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      const koPlaceholders = (blocks.ko[key] ?? "").match(/\{[A-Za-z0-9_]+\}/g) ?? [];
      const enPlaceholders = (blocks.en[key] ?? "").match(/\{[A-Za-z0-9_]+\}/g) ?? [];
      expect(enPlaceholders.sort(), `placeholder mismatch: ${key}`).toEqual(koPlaceholders.sort());
    }
    expect(blocks.ko["account.merge.serverUnavailable"]).toBe("계정 통합 서버에 접속하지 못했어요.");
    expect(blocks.ko["collaboration.hiringSubmission.submissionBlockedSuffix"]).toBe(" (권리 철회로 제출 불가)");
    expect(blocks.ko["collaboration.hiringAvailability.savedExpires"]).toBe("직접 확인한 작업 가능 정보는 {date}에 만료됩니다.");
  });

  it("전 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of STATUS_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"((?:account|collaboration)\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(
        (STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("이관 파일에 하드코딩된 상태 문구가 없다", () => {
    for (const file of CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });
});
