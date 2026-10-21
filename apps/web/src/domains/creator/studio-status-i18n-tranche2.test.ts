import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 일정·게시·production-hub·ai 표면의 로딩·실패 문구 i18n 키 이관 계약 (A4 트랜치 2).
 *
 * 배경: 트랜치 1(패널 로딩)에서 건너뛴 표면들의 상태 문구가 호출부에 한국어로
 * 하드코딩돼 en 사용자의 동선이 끊겼다. 표시 정본은
 * productionHub.status.* (app/productionHub 사전 JSON)·studio.aiStatus.*
 * (ai/studio-ai-status-i18n 등록 모듈)·studio.publish.status.*
 * (publish/publish-status-i18n 등록 모듈)·studio.aiToolPopover.* 키이며,
 * 코드 안의 한국어 원문은 useT 폴백 인자·useBilingual 쌍으로만 남아야 한다.
 * creator-status-i18n-contract의 GUARDED_FILES 3차 등록과 짝을 이룬다.
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

const PRODUCTION_HUB_STATUS_KEYS = [
  "productionHub.status.integrationActionFailed",
  "productionHub.status.creatingDraft",
  "productionHub.status.savingToDrive",
  "productionHub.status.creatingSignatureDocument",
  "productionHub.status.snapshotSaveFailed",
  "productionHub.status.snapshotRestoreFailed",
  "productionHub.status.taskCompleteFailed",
  "productionHub.status.workScreenLinkCopyFailed",
  "productionHub.status.screenLinkCopyFailed",
  "productionHub.status.manifestPackageFailed",
  "productionHub.status.checkingPinnedPages",
  "productionHub.status.linkingRevision",
  "productionHub.status.linkingRequiresEditPermission",
  "productionHub.status.riskPolicySaveFailed",
  "productionHub.status.bulkEditCheckFailed",
  "productionHub.status.quickExportFailed",
  "productionHub.status.recoveryApplyFailed",
  "productionHub.status.recoveryRevertFailed",
  "productionHub.status.creatingTasks",
  "productionHub.status.savingView",
  "productionHub.status.reviewLinkCreateFailed",
  "productionHub.status.reviewLinkAutoCopyFailed",
  "productionHub.status.voiceRecordingUnsupported",
  "productionHub.status.voiceCaptureStateFailed",
  "productionHub.status.voiceMicPermissionFailed",
  "productionHub.status.loadingCommentary",
  "productionHub.status.noVoiceCommentary",
  "productionHub.status.riskFieldsRequired",
  "productionHub.status.riskSaveFailed",
  "productionHub.status.saving",
  "productionHub.status.episodeProcessSaveFailed",
  "productionHub.status.noCompareRounds",
  "productionHub.status.aiAssistHandoffFailed",
  "productionHub.status.aiWorkflowFailurePolicyNote",
  "productionHub.status.riskResponseTransitionFailed",
  "productionHub.status.riskResponseSaveFailed",
  "productionHub.status.inboxEmptyAll",
  "productionHub.status.inboxEmptyUnread",
  "productionHub.status.inboxEmptyMention",
  "productionHub.status.inboxEmptyReviewRequest",
  "productionHub.status.inboxEmptyApproval",
  "productionHub.status.inboxEmptyHandover",
] as const;

describe("studio status i18n tranche2", () => {
  it("productionHub.status 키가 ko/en 사전에 모두 있고 en 값에 한글이 없다", () => {
    const ko = readJson("public/i18n/app/productionHub/ko.json");
    const en = readJson("public/i18n/app/productionHub/en.json");
    for (const key of PRODUCTION_HUB_STATUS_KEYS) {
      expect(ko[key], `ko missing ${key}`).toBeTruthy();
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
    expect(ko["productionHub.status.snapshotSaveFailed"]).toBe("스냅샷을 저장하지 못했습니다.");
    expect(ko["productionHub.status.creatingDraft"]).toBe("초안 생성 중…");
  });

  it("productionHub ko/en 사전 키 집합이 일치한다", () => {
    const ko = readJson("public/i18n/app/productionHub/ko.json");
    const en = readJson("public/i18n/app/productionHub/en.json");
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
  });

  it("studio.aiStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("ai/studio-ai-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBeGreaterThanOrEqual(18);
    for (const [key, value] of Object.entries(blocks.en)) {
      expect(HANGUL.test(value), `en value has Hangul: ${key}`).toBe(false);
    }
    expect(blocks.ko["studio.aiStatus.provenanceExportFailed"]).toBe(
      "공개용 요약을 내보내지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  });

  it("studio.publish.status 등록 모듈의 ko/en 키가 패리티를 이룬다", () => {
    const blocks = parseRegisterModule(readSource("publish/publish-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(blocks.ko["studio.publish.status.autoOptimizeFailed"]).toBe(
      "자동 최적화에 실패했어요. 다시 시도해주세요.",
    );
  });

  it("aiToolPopover 신규 키가 ko/en 사전에 모두 있다", () => {
    const ko = readJson("public/i18n/studio/aiToolPopover/ko.json");
    const en = readJson("public/i18n/studio/aiToolPopover/en.json");
    expect(ko["studio.aiToolPopover.masterEditAiCutDisabled"]).toBe(
      "마스터 편집 중에는 회차 AI 컷 제작을 사용할 수 없어요.",
    );
    expect(en["studio.aiToolPopover.masterEditAiCutDisabled"]).toBeTruthy();
    expect(HANGUL.test(en["studio.aiToolPopover.masterEditAiCutDisabled"] ?? "")).toBe(false);
  });

  it("marketing 준비·검색 표면은 이미 ko/en COPY 쌍으로 표시한다 (스캐너 오탐 확인)", () => {
    const search = readFileSync(
      new URL("../marketing/CreatorReferenceSearch.tsx", import.meta.url),
      "utf-8",
    );
    expect(search).toContain("This phrase is not in the vocabulary yet.");
    const readiness = readFileSync(
      new URL("../marketing/CreatorWorkspaceReadiness.tsx", import.meta.url),
      "utf-8",
    );
    expect(readiness).toContain("Protection is unavailable here.");
  });
});
