import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * collaboration 잔여 상태 문구 i18n 키 이관 계약 (A4 5라운드 cat1 잔여).
 *
 * 표시 정본은 r5cat1.collaboration.* (r5-cat1-status-i18n 형제 등록 모듈) 키이며,
 * 코드 안의 한국어 원문은 `r5CollaborationStatusText(키, 한국어 폴백)`의 폴백 인자로만
 * 남아야 한다. 기존 등록 모듈은 키 개수 단언이 있어 확장하지 않았다.
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
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\"/g, '"');
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

const DICTS = parseRegisterModule(readSource("r5-cat1-status-i18n.ts"));
const KEYS = Object.keys(DICTS.ko).sort();

const CONSUMERS = [
  "hiring/HiringSlotEditor.tsx",
] as const;

const CALL_PATTERN =
  /r5CollaborationStatusText\("([^"]+)",\s*(?:\{[^}}]*\},\s*)?"((?:[^"\\]|\\.)*)"\)/g;

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

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1] ?? "").sort();
}

describe("r5cat1.collaboration 사전 (5라운드 형제 등록 모듈)", () => {
  it("ko/en 키가 패리티를 이루고 1키이며 en에 한글이 없다", () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(KEYS);
    expect(KEYS).toHaveLength(1);
    for (const key of KEYS) {
      expect(key.startsWith("r5cat1.collaboration."), key).toBe(true);
      expect(DICTS.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(DICTS.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(DICTS.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("ko/en 플레이스홀더가 키마다 정확히 일치한다", () => {
    for (const key of KEYS) {
      expect(placeholders(DICTS.en[key] ?? ""), key).toEqual(placeholders(DICTS.ko[key] ?? ""));
    }
  });
});

describe("r5cat1.collaboration 소비 계약 (5라운드 이관)", () => {
  it("등록된 전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const used = new Set(collectCalls().map((call) => call.key));
    expect([...used].sort()).toEqual(KEYS);
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    const referenced = new Set(
      [...consumerSource.matchAll(/"(r5cat1\.collaboration\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("호출부 한국어 폴백이 ko 사전값과 글자 단위로 일치한다 (한국어 표시 회귀 0)", () => {
    for (const call of collectCalls()) {
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
