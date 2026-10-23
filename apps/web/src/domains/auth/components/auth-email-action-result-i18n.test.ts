import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * 가입·이메일 인증 결과 문구 이관 계약 (A4 4라운드 cat2 도달 확정분).
 *
 * 생산자 auth-email-action-result.ts의 결과 메시지는 auth-form.tsx가
 * setErr/setNotice로 그대로 표시하므로 사용자 도달이 확정된 생산자
 * 채널이다. 표시 정본은 auth-email-action-result-i18n.ts의
 * `auth.emailAction.*` 키이며, 코드 안의 한국어 원문은
 * `authEmailActionText(키, 한국어 폴백)`의 폴백 인자로만 남아야 한다.
 * 서버 메시지 패스스루(safeMessage)는 타자 메시지라 대상이 아니다.
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

const blocks = parseRegisterModule(readSource("auth-email-action-result-i18n.ts"));
const ALL_KEYS = Object.keys(blocks.ko).sort();

describe("auth email action result i18n r4", () => {
  it("등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    expect(ALL_KEYS).toEqual([
      "auth.emailAction.emailSendFailed",
      "auth.emailAction.emailSent",
      "auth.emailAction.rateLimited",
      "auth.emailAction.signupCheckFailed",
      "auth.emailAction.signupSent",
      "auth.emailAction.unavailable",
      "auth.emailAction.unconfirmed",
    ]);
    expect(Object.keys(blocks.en).sort()).toEqual(ALL_KEYS);
    for (const key of ALL_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("전 키가 생산자에서 폴백 원문과 함께 소비되고 미등록 참조가 없다", () => {
    const producer = readSource("auth-email-action-result.ts");
    for (const key of ALL_KEYS) {
      expect(producer, `key not consumed: ${key}`).toContain(`"${key}"`);
      expect(producer, `fallback mismatch: ${key}`).toContain(`"${blocks.ko[key]}"`);
    }
    const referenced = [...producer.matchAll(/authEmailActionText\(\s*"([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );
    expect(new Set(referenced)).toEqual(new Set(ALL_KEYS));
  });

  it("생산자에 탐지기 위반이 없다", () => {
    expect(
      scanHardcodedStatusStrings(readSource("auth-email-action-result.ts"), {
        includeProducerChannels: true,
      }),
    ).toEqual([]);
  });
});
