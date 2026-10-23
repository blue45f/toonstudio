import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * learn 로딩·실패·빈 상태 문구 i18n 키 이관 계약 (A4 잔여 3라운드 c12).
 *
 * 표시 정본은 learn.status.* (learn-status-i18n 등록 모듈) 키이며, 코드
 * 안의 한국어 원문은 learnStatusText(키, 한국어 폴백) 폴백 인자로만
 * 남아야 한다. 학습 콘텐츠 본문(레슨·용어 설명)·안내 문구·성공 안내·
 * 동사형 버튼 라벨은 상태 문구가 아니라 이관 대상이 아니다
 * (r3-c12.md 잔여 근거 참조).
 */

const HANGUL = /[가-힣]/;

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
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\(.)/g, "$1");
    }
    blocks[match[1] ?? ""] = { ...(blocks[match[1] ?? ""] ?? {}), ...entries };
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? "").sort();
}

const LEARN_STATUS_KEYS = [
  "learn.status.content.saveFailed",
  "learn.status.content.termNotFound",
  "learn.status.content.termEmpty",
  "learn.status.content.lessonsEmpty",
  "learn.status.content.pageNotFound",
  "learn.status.classes.saveWarning",
  "learn.status.classes.walletLoadFailed",
  "learn.status.classes.enrollFailed",
  "learn.status.classroom.planSaveFailed",
  "learn.status.classroom.planImportFailed",
  "learn.status.classroom.assignmentsEmpty",
  "learn.status.home.profileSaveFailed",
  "learn.status.home.coursesEmpty",
  "learn.status.home.pathNotFound",
  "learn.status.linkButton.copyUnavailable",
  "learn.status.linkButton.linkCreateFailed",
  "learn.status.recordTools.backupCreateFailed",
  "learn.status.recordTools.backupReadFailed",
  "learn.status.recordTools.restoreSaveFailed",
  "learn.status.recordTools.saveFailed",
  "learn.status.recordTools.confirmSaveFailed",
  "learn.status.records.empty",
  "learn.status.records.multiTabNotice",
  "learn.status.resources.searching",
  "learn.status.resources.empty",
  "learn.status.resources.apiUnavailable",
  "learn.status.resources.youtubeLoadFailed",
] as const;

const CONSUMERS = [
  "LearnContent.tsx",
  "LearningClassesPage.tsx",
  "LearningClassroomPage.tsx",
  "LearningHome.tsx",
  "LearningLinkButton.tsx",
  "LearningRecordTools.tsx",
  "LearningRecordsPage.tsx",
  "LearningResourcesPage.tsx",
] as const;

describe("learn status i18n r3c12", () => {
  it("learn.status 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없으며 플레이스홀더가 일치한다", () => {
    const blocks = parseRegisterModule(readSource("learn-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(LEARN_STATUS_KEYS.length);
    for (const key of LEARN_STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      expect(placeholders(blocks.ko[key] ?? ""), `placeholder mismatch ${key}`).toEqual(
        placeholders(blocks.en[key] ?? ""),
      );
    }
    expect(blocks.ko["learn.status.content.lessonsEmpty"]).toBe("일치하는 강좌가 없습니다.");
    expect(blocks.ko["learn.status.resources.searching"]).toBe("검색 중…");
    expect(blocks.ko["learn.status.records.empty"]).toBe("아직 기록된 학습이 없어요");
  });

  it("learn.status 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of LEARN_STATUS_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(learn\.status\.[A-Za-z0-9.]+)"/g)].map((m) => m[1] ?? ""),
    );
    for (const key of referenced) {
      expect(
        (LEARN_STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("이관한 소비 파일에 하드코딩 상태 문구가 남아 있지 않다", () => {
    for (const file of CONSUMERS) {
      expect(
        scanHardcodedStatusStrings(readSource(file)),
        `hardcoded status strings remain in ${file}`,
      ).toEqual([]);
    }
  });
});
