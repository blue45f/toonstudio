import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * messages 로딩·실패·빈 상태 문구 i18n 키 이관 계약 (A4 잔여 3라운드 c05).
 *
 * 배경: 메시지 표면 4파일의 로딩·실패·빈 상태 문구가 호출부에 한국어로
 * 하드코딩돼 en 사용자의 동선이 끊겼다. 표시 정본은 messages.status.*
 * (message-status-i18n 등록 모듈) 키이며, 코드 안의 한국어 원문은
 * `t(키, …, 한국어 폴백)`의 폴백 인자로만 남아야 한다.
 * messages 도메인은 creator 계약(GUARDED_FILES) 밖이라 이 전용 테스트가
 * 가드를 맡는다.
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

const DICTS = parseRegisterModule(readSource("message-status-i18n.ts"));
const MESSAGE_STATUS_KEYS = Object.keys(DICTS.ko).sort();

const CONSUMERS = [
  "MessagesPage.tsx",
  "MessageRequestPage.tsx",
  "MessagingSettingsPanel.tsx",
  "MessagingSkeletons.tsx",
] as const;

const CALL_PATTERN =
  /\bt\("([^"]+)",\s*(?:\{[^}]*\},\s*)?"((?:[^"\\]|\\.)*)"\)/g;

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

describe("messages.status 사전 (r3c05 등록 모듈)", () => {
  it("ko/en 키가 패리티를 이루고 29키이며 en에 한글이 없다", () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(MESSAGE_STATUS_KEYS);
    expect(MESSAGE_STATUS_KEYS).toHaveLength(29);
    for (const key of MESSAGE_STATUS_KEYS) {
      expect(key.startsWith("messages.status."), key).toBe(true);
      expect(DICTS.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(DICTS.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(DICTS.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("ko/en 플레이스홀더가 키마다 정확히 일치한다", () => {
    for (const key of MESSAGE_STATUS_KEYS) {
      expect(placeholders(DICTS.en[key] ?? ""), key).toEqual(placeholders(DICTS.ko[key] ?? ""));
    }
  });
});

describe("messages.status 소비 계약 (r3c05 이관 4파일)", () => {
  it("등록된 전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const used = new Set(collectCalls().map((call) => call.key));
    expect([...used].sort()).toEqual(MESSAGE_STATUS_KEYS);
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    const referenced = new Set(
      [...consumerSource.matchAll(/"(messages\.status\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(MESSAGE_STATUS_KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
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
