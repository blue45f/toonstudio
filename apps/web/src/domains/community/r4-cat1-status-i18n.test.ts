import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * community 잔여 상태 문구 i18n 키 이관 계약 (A4 4라운드 cat1).
 *
 * 배경: cat1 실측 분리에서 진짜 미이관으로 확정된 review-replies의
 * 답글 마감 안내가 JSX에 한국어로 하드코딩돼 있었다. 표시 정본은
 * r4cat1.community.* (r4-cat1-status-i18n 형제 등록 모듈) 키이며, 코드 안의
 * 한국어 원문은 `r4CommunityStatusText(키, 한국어 폴백)`의 폴백 인자로만
 * 남아야 한다.
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

const DICTS = parseRegisterModule(readSource("r4-cat1-status-i18n.ts"));
const KEYS = Object.keys(DICTS.ko).sort();

const CONSUMERS = ["components/review-replies.tsx"] as const;

const CALL_PATTERN =
  /r4CommunityStatusText\("([^"]+)",\s*"((?:[^"\\]|\\.)*)"\)/g;

function collectCalls(): Array<{ key: string; fallback: string; file: string }> {
  const calls: Array<{ key: string; fallback: string; file: string }> = [];
  for (const file of CONSUMERS) {
    for (const match of readSource(file).matchAll(CALL_PATTERN)) {
      calls.push({
        key: match[1] ?? "",
        fallback: (match[2] ?? "").replace(/\\"/g, '"'),
        file,
      });
    }
  }
  return calls;
}

describe("r4cat1.community 사전 (4라운드 형제 등록 모듈)", () => {
  it("ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(KEYS);
    expect(KEYS).toHaveLength(1);
    for (const key of KEYS) {
      expect(key.startsWith("r4cat1.community."), key).toBe(true);
      expect(DICTS.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(DICTS.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(DICTS.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });
});

describe("r4cat1.community 소비 계약 (4라운드 이관 1파일)", () => {
  it("등록된 전 키가 소비 파일에서 참조되고 폴백이 ko 사전값과 일치한다", () => {
    const calls = collectCalls();
    expect([...new Set(calls.map((call) => call.key))].sort()).toEqual(KEYS);
    for (const call of calls) {
      expect(DICTS.ko[call.key], `${call.file} :: ${call.key}`).toBe(call.fallback);
    }
  });

  it("이관 파일에 하드코딩 상태 문구가 남아 있지 않다 (탐지기 0건)", () => {
    for (const file of CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, file).toEqual([]);
    }
  });
});
