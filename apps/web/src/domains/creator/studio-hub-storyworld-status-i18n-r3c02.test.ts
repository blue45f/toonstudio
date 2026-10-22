import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "../../shared/language/status-i18n";

/**
 * production-hub·storyworld 로딩·실패·빈 상태 문구 i18n 키 이관 계약
 * (A4 잔여 3라운드 배치 c02).
 *
 * 표시 정본은 세 갈래다.
 * 1. productionHub.status.* — 앱 사전(public/i18n/app/productionHub)에 이미
 *    있던 표면 사전에 신규 키를 더하고 소비 파일이 useT로 참조한다.
 * 2. 제작 작업 보드 사전(production-workboard-copy의 ENGLISH 맵) — 이미
 *    productionText()로 감싸여 있던 상태 문구에 영어 항목을 등록한다.
 * 3. studio.storyworldStatus.* — storyworld-status-i18n 등록 모듈(신규).
 * 코드 안의 한국어 원문은 useT 폴백 인자나 폴백 데이터 맵으로만 남아야 한다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
}

function readPublicJson(relativePath: string): Record<string, string> {
  return JSON.parse(
    readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf-8"),
  ) as Record<string, string>;
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

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1] ?? "").sort();
}

const STORYWORLD_STATUS_KEYS = [
  "studio.storyworldStatus.board.emptyElements",
  "studio.storyworldStatus.issues.emptyFiltered",
  "studio.storyworldStatus.issues.emptyContinuity",
  "studio.storyworldStatus.issues.emptyActiveContinuity",
  "studio.storyworldStatus.issues.severityAll",
  "studio.storyworldStatus.issues.severityError",
  "studio.storyworldStatus.issues.severityWarning",
  "studio.storyworldStatus.issues.severityInfo",
  "studio.storyworldStatus.settings.noSelectableItems",
  "studio.storyworldStatus.universe.loadFailed",
  "studio.storyworldStatus.universe.loadFailedTitle",
  "studio.storyworldStatus.universe.saveFailed",
  "studio.storyworldStatus.universe.noMemberWorks",
  "studio.storyworldStatus.universe.loadingRegistry",
  "studio.storyworldStatus.universe.emptyUniverses",
  "studio.storyworldStatus.universe.emptySharedElements",
  "studio.storyworldStatus.detail.hintResolved",
  "studio.storyworldStatus.detail.hintIntended",
  "studio.storyworldStatus.detail.hintDeferred",
  "studio.storyworldStatus.findingList.omitted",
  "studio.storyworldStatus.findingList.emptyFiltered",
  "studio.storyworldStatus.findingList.emptyUnknown",
  "studio.storyworldStatus.findingList.emptyChecked",
  "studio.storyworldStatus.findingList.emptyHandled",
  "studio.storyworldStatus.hub.checkDone",
  "studio.storyworldStatus.hub.fileSaveFailed",
  "studio.storyworldStatus.hub.emptyScenes",
  "studio.storyworldStatus.hub.summarySaveFailed",
  "studio.storyworldStatus.manuscript.readFailed",
  "studio.storyworldStatus.manuscript.fileReadFailed",
  "studio.storyworldStatus.manuscript.scenesSkipped",
  "studio.storyworldStatus.manuscript.draftCreateFailed",
  "studio.storyworldStatus.manuscript.copySaveFailed",
  "studio.storyworldStatus.manuscript.noConfirmedCharacters",
  "studio.storyworldStatus.questionForms.noCharacters",
  "studio.storyworldStatus.questionForms.noEarlierScene",
  "studio.storyworldStatus.questionForms.noFactsYet",
  "studio.storyworldStatus.questionForms.noFacts",
  "studio.storyworldStatus.questionnaire.emptyScenes",
  "studio.storyworldStatus.report.checkFailed",
  "studio.storyworldStatus.report.retry",
  "studio.storyworldStatus.scope.sourceUsed",
  "studio.storyworldStatus.scope.sourceEmpty",
  "studio.storyworldStatus.scope.sourceUnavailable",
  "studio.storyworldStatus.scope.noEpisodeScenes",
  "studio.storyworldStatus.scope.severityError",
  "studio.storyworldStatus.scope.severityWarning",
  "studio.storyworldStatus.scope.severitySuggestion",
] as const;

const STORYWORLD_CONSUMERS = [
  "storyworld/StudioStoryworldBoard.tsx",
  "storyworld/StudioStoryworldIssues.tsx",
  "storyworld/StudioStoryworldSettings.tsx",
  "storyworld/StudioStoryworldUniverse.tsx",
  "storyworld/plausibility/StudioStoryPlausibilityDetail.tsx",
  "storyworld/plausibility/StudioStoryPlausibilityFindingList.tsx",
  "storyworld/plausibility/StudioStoryPlausibilityHub.tsx",
  "storyworld/plausibility/StudioStoryPlausibilityManuscript.tsx",
  "storyworld/plausibility/StudioStoryPlausibilityQuestionForms.tsx",
  "storyworld/plausibility/StudioStoryPlausibilityQuestionnaire.tsx",
  "storyworld/plausibility/StudioStoryPlausibilityReportView.tsx",
  "storyworld/plausibility/StudioStoryPlausibilityScopePanel.tsx",
] as const;

const HUB_STATUS_KEYS = [
  "productionHub.status.adoptionUnavailable",
  "productionHub.status.commandEmptySearch",
  "productionHub.status.commercialEmptyCompensation",
  "productionHub.status.commercialEmptyCredits",
  "productionHub.status.commercialEmptyProposals",
  "productionHub.status.planningEmptyCharter",
  "productionHub.status.planningEmptySettings",
  "productionHub.status.planningEmptySummary",
  "productionHub.status.revisionBridgeSaveFirst",
  "productionHub.status.revisionBridgeSubmittedPreserved",
  "productionHub.status.revisionBridgeWorkIdMismatch",
  "productionHub.status.scheduleForecastOverrun",
  "productionHub.status.scheduleOverdue",
  "productionHub.status.teamUsageLimitReached",
  "productionHub.status.voiceCaptureUnavailable",
  "productionHub.status.voiceNotStored",
  "productionHub.status.voiceRecordingTooLarge",
] as const;

const HUB_CONSUMERS = [
  "production-hub/ProductionAdoptionCenter.tsx",
  "production-hub/ProductionCommandPalette.tsx",
  "production-hub/ProductionCommercialSurfaces.tsx",
  "production-hub/ProductionPlanningSurface.tsx",
  "production-hub/ProductionScheduleWorkspace.tsx",
  "production-hub/ProductionStudioRevisionBridgePanel.tsx",
  "production-hub/ReviewVoiceCommentaryPanel.tsx",
  "production-hub/TeamWorkspaceUsagePage.tsx",
] as const;

/** 이번 배치에서 보드 사전(ENGLISH 맵)에 영어 항목을 등록한 상태 문구 원문. */
const WORKBOARD_STATUS_STRINGS = [
  "선택한 작업 전체를 담당할 수 있는 활성 구성원이 없습니다. 회차별로 나누어 선택하세요.",
  "본문·제목·체크 항목을 추가해 작업 지시서를 만드세요. 체크리스트는 작업 메모이며 공식 승인을 대신하지 않습니다.",
  "다른 변경이 감지되었습니다. 작성한 내용은 보존했으며 덮어쓰지 않습니다.",
  "편집을 버리고 최신 내용 불러오기",
  "작업을 시작하려면 사용할 입력 버전을 고정하고 선행 작업을 완료해야 합니다. 최신 버전으로 자동 교체하지 않습니다.",
  "저장하지 않은 변경 있음",
  "작업 설명은 자동 저장되지 않습니다.",
  "공정을 직접 배치하고 선행 관계·역할·동시 작업 수를 설정하세요. 공정 설정은 공식 검수나 승인 권한을 바꾸지 않습니다.",
  "편집을 버리고 최신 설정 불러오기",
  "공정은 열람할 수 있습니다. 변경·저장은 프로젝트 관리 권한이 필요합니다.",
  "하나라도 선행 조건을 충족하지 못하면 선택한 작업 전체가 이동하지 않습니다. 필터를 바꾸면 선택이 해제됩니다.",
] as const;

const WORKBOARD_CONSUMERS = [
  "production-hub/ProductionTaskBriefEditor.tsx",
  "production-hub/ProductionTaskBulkEditor.tsx",
  "production-hub/ProductionTaskEditor.tsx",
  "production-hub/ProductionWorkflowDesigner.tsx",
  "production-hub/board/BoardSelectionBar.tsx",
] as const;

const MIGRATED_FILES = [
  ...HUB_CONSUMERS,
  "production-hub/ProductionEpisodeOperationsWorkspace.tsx",
  ...WORKBOARD_CONSUMERS,
  "production-hub/production-workboard-copy.ts",
  ...STORYWORLD_CONSUMERS,
] as const;

describe("hub/storyworld status i18n r3c02", () => {
  it("studio.storyworldStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("storyworld/storyworld-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(STORYWORLD_STATUS_KEYS.length);
    for (const key of STORYWORLD_STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      expect(placeholders(blocks.ko[key] ?? ""), `placeholder mismatch ${key}`).toEqual(
        placeholders(blocks.en[key] ?? ""),
      );
    }
    expect(blocks.ko["studio.storyworldStatus.universe.saveFailed"]).toBe(
      "공유 세계관을 저장하지 못했습니다. 변경은 이 탭에만 남아 있습니다.",
    );
    expect(blocks.ko["studio.storyworldStatus.hub.checkDone"]).toBe(
      "점검을 마쳤어요. 오류 {error}, 경고 {warning}, 제안 {suggestion}.",
    );
  });

  it("studio.storyworldStatus 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = STORYWORLD_CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of STORYWORLD_STATUS_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(studio\.storyworldStatus\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(
        (STORYWORLD_STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("productionHub.status 신규 키가 앱 사전 ko/en에 패리티로 등록되고 소비 파일에서 참조된다", () => {
    const ko = readPublicJson("public/i18n/app/productionHub/ko.json");
    const en = readPublicJson("public/i18n/app/productionHub/en.json");
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    const consumerSource = HUB_CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of HUB_STATUS_KEYS) {
      expect(ko[key], `ko missing ${key}`).toBeTruthy();
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      expect(placeholders(ko[key] ?? ""), `placeholder mismatch ${key}`).toEqual(
        placeholders(en[key] ?? ""),
      );
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
      expect(consumerSource.includes(ko[key] ?? ""), `fallback drift ${key}`).toBe(true);
    }
  });

  it("productionHub 소비 파일의 status 참조가 모두 앱 사전에 등록돼 있다", () => {
    const ko = readPublicJson("public/i18n/app/productionHub/ko.json");
    const consumerSource = [...HUB_CONSUMERS, ...WORKBOARD_CONSUMERS].map((file) =>
      readSource(file),
    ).join("\n");
    const referenced = new Set(
      [...consumerSource.matchAll(/"(productionHub\.status\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(ko[key], `dangling key reference: ${key}`).toBeTruthy();
    }
  });

  it("보드 사전에 등록한 상태 문구가 ENGLISH 맵과 productionText 소비를 모두 갖췄다", () => {
    const copySource = readSource("production-hub/production-workboard-copy.ts");
    const consumerSource = WORKBOARD_CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const text of WORKBOARD_STATUS_STRINGS) {
      expect(copySource.includes(`"${text}":`), `workboard en entry missing: ${text}`).toBe(true);
      expect(consumerSource.includes(`"${text}"`), `productionText consumer missing: ${text}`).toBe(
        true,
      );
    }
  });

  it("이관한 파일에 하드코딩 상태 문구가 남아 있지 않다", () => {
    for (const file of MIGRATED_FILES) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });
});
