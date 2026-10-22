import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "../../../shared/language/status-i18n";

/**
 * AI Result 채널 에러 문구 i18n 이관 계약 (A4 후속 AI 이관 T1, 2026-10-22).
 *
 * 배경: studio-ai-client를 비롯한 Result 채널 생산자(.ts)는 훅을 쓸 수 없어
 * 에러 문구가 한국어로 하드코딩돼 있었다. 표시 정본은 studio.aiError.*
 * (studio-ai-error-i18n 등록 모듈) 키이며, 생산자는 생산 시점에
 * `aiErrorText(키, …, 한국어 폴백)`로 현재 로케일 문구를 만들어 기존
 * `{ ok:false, code, error: string }` 계약에 그대로 싣는다 (소비처 무변경).
 * 가드는 creator-status 계약과 분리된 이 전용 파일이 맡는다 — 생산자 채널
 * 탐지는 scanHardcodedStatusStrings의 includeProducerChannels 옵션을 켜야
 * 동작한다 (기존 가드 파일군의 서 있는 계약을 깨지 않기 위한 분리).
 *
 * D등급(내부 전용) 재검토 조건 (설계 §3.3): 아래 파일들에 비테스트 소비자가
 * 새로 생기거나, 기존 소비자가 메시지를 참조하기 시작하거나, 영속·외부
 * 전송이 추가되면 그 변경에서 재분류와 이관을 함께 한다 —
 * studio-stroke-proposal.ts·studio-structured-edit-proposal.ts (영문 검증
 * throw 76건, 테스트가 메시지 정규식을 단언하는 개발자 계약),
 * studio-3d-inline-budget.ts, studio-ai-image-reference-storage.ts,
 * packages/contracts의 studio-ai-provenance throw 12건.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf-8");
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

const MODULE_SOURCE = readSource("./studio-ai-error-i18n.ts");
const DICTS = parseRegisterModule(MODULE_SOURCE);
const AI_ERROR_KEYS = Object.keys(DICTS.ko).sort();

const PRODUCER_FILES = [
  "./studio-ai-client.ts",
  "./studio-ai-reference-images.ts",
  "./canon/studio-photo-character-wizard.ts",
  "../studio-server-ai-client.ts",
] as const;

const CALL_PATTERN =
  /aiErrorText\("([^"]+)",\s*(?:\{[^}]*\},\s*)?"((?:[^"\\]|\\.)*)"\)/g;

function collectCalls(): Array<{ key: string; fallback: string; file: string }> {
  const calls: Array<{ key: string; fallback: string; file: string }> = [];
  for (const file of PRODUCER_FILES) {
    for (const match of readSource(file).matchAll(CALL_PATTERN)) {
      calls.push({ key: match[1] ?? "", fallback: match[2] ?? "", file });
    }
  }
  return calls;
}

describe("studio.aiError 사전 (T1 등록 모듈)", () => {
  it("ko/en 키 집합이 일치하고 60키다", () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(AI_ERROR_KEYS);
    expect(AI_ERROR_KEYS).toHaveLength(60);
    expect(AI_ERROR_KEYS.every((key) => key.startsWith("studio.aiError."))).toBe(true);
  });

  it("en 값에 한글이 없고 ko/en 값이 비어 있지 않다", () => {
    for (const key of AI_ERROR_KEYS) {
      expect(DICTS.en[key], key).not.toMatch(HANGUL);
      expect((DICTS.ko[key] ?? "").length, key).toBeGreaterThan(0);
      expect((DICTS.en[key] ?? "").length, key).toBeGreaterThan(0);
    }
  });

  it("네임스페이스 구간이 트랜치 파일과 대응한다 (client 39·reference 13·wizard 2·server 6)", () => {
    const count = (prefix: string) => AI_ERROR_KEYS.filter((key) => key.startsWith(prefix)).length;
    expect(count("studio.aiError.client.")).toBe(39);
    expect(count("studio.aiError.reference.")).toBe(13);
    expect(count("studio.aiError.wizard.")).toBe(2);
    expect(count("studio.aiError.server.")).toBe(6);
  });
});

describe("studio.aiError 소비 계약 (T1 생산자 4파일)", () => {
  it("등록된 전 키가 생산자에서 소비되고 미등록 참조가 없다", () => {
    const used = new Set(collectCalls().map((call) => call.key));
    expect([...used].sort()).toEqual(AI_ERROR_KEYS);
  });

  it("호출부 한국어 폴백이 ko 사전값과 글자 단위로 일치한다 (한국어 표시 회귀 0)", () => {
    for (const call of collectCalls()) {
      expect(DICTS.ko[call.key], `${call.file} :: ${call.key}`).toBe(call.fallback);
    }
  });

  it("생산자 4파일에 생산자 채널 하드코딩이 남아 있지 않다 (탐지기 producer 모드 0건)", () => {
    for (const file of PRODUCER_FILES) {
      const violations = scanHardcodedStatusStrings(readSource(file), {
        includeProducerChannels: true,
      });
      expect(violations, file).toEqual([]);
    }
  });

  it("동적 패스스루는 키화하지 않고 그대로 남는다 (제공자·파서·전송 메시지)", () => {
    const client = readSource("./studio-ai-client.ts");
    // 제공자/전송 계층 메시지는 본문이 아니라 detail 성격이라 패스스루를 유지한다 (설계 §3.4).
    expect(client).toContain("error: error.message");
    expect(client).toContain("error: parsed.error");
    expect(client).toContain("error: networkErrorMessage(e)");
  });
});
