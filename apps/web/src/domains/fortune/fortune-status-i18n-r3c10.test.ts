import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * fortune 로딩·실패·빈 상태 문구 i18n 키 이관 계약 (A4 잔여 3라운드 c10).
 *
 * 배경: fortune 16파일의 로딩 단계 문구·외부 데이터 실패 알림·저장/공유
 * 실패·빈 상태 문구가 호출부에 한국어로 하드코딩돼 en 사용자의 동선이
 * 끊겼다. 표시 정본은 fortune-status-i18n 등록 모듈의 `fortune.status.*`
 * 키이며, 코드 안의 한국어 원문은 `fortuneStatusText(키, …, 한국어 폴백)`
 * 의 폴백 인자로만 남아야 한다. 운세 결과 본문·해석 텍스트와 이미 tx()로
 * 감싸진 문구(FortuneQuickToday·FortunePeriodPanel 등)는 대상이 아니다.
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
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\"/g, '"');
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

const MODULE_FILE = "fortune-status-i18n.ts";
const PREFIX = "fortune.status.";
const CONSUMERS = [
  "FortuneLoading.tsx",
  "FortuneEnrichment.tsx",
  "FortuneSpecialDays.tsx",
  "FortuneObservatory.tsx",
  "FortuneLunaHero.tsx",
  "FortuneShareModal.tsx",
  "FortuneReadingTools.tsx",
  "FortuneReadingView.tsx",
  "FortuneStoryPortal.tsx",
  "FortuneToolHero.tsx",
  "provenance/FortuneSourcePanel.tsx",
] as const;
const MIGRATED_FILES = [
  "FortuneLoading.tsx",
  "FortuneEnrichment.tsx",
  "FortuneSpecialDays.tsx",
  "FortuneObservatory.tsx",
  "FortuneLunaHero.tsx",
  "FortuneShareModal.tsx",
  "FortuneReadingTools.tsx",
  "FortuneReadingView.tsx",
  "FortuneStoryPortal.tsx",
  "FortuneToolHero.tsx",
  "provenance/FortuneSourcePanel.tsx",
] as const;

const blocks = parseRegisterModule(readSource(MODULE_FILE));
const ALL_KEYS = Object.keys(blocks.ko).sort();

describe("fortune status i18n r3c10", () => {
  it("등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    expect(Object.keys(blocks.en).sort()).toEqual(ALL_KEYS);
    for (const key of ALL_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("플레이스홀더가 ko/en에서 정확히 일치한다", () => {
    for (const key of ALL_KEYS) {
      const koPh = [...(blocks.ko[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      const enPh = [...(blocks.en[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      expect(enPh, `placeholder mismatch: ${key}`).toEqual(koPh);
    }
  });

  it("전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of ALL_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(new RegExp(`"(${PREFIX.replace(/\./g, "\\.")}[A-Za-z0-9.]+)"`, "g"))].map((m) => m[1] ?? ""),
    );
    for (const key of referenced) {
      expect(ALL_KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("이관 파일에 탐지기 위반이 없다", () => {
    for (const file of MIGRATED_FILES) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });
});
