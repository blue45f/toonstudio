import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "../../../shared/language/status-i18n";

/**
 * AI Result 채널 에러 문구 i18n 이관 계약 (A4 후속 AI 이관 T1~T3, 2026-10-22).
 * T2: fal Result 채널 + LoRA 잡 lastError 영속 코드화(키는 레코드에 저장되고
 * 표시 시점에 resolveAiErrorText로 해석), T3: throw 클라이언트 2종
 * (PersonalInferenceError·Studio3dGenerationRequestError의 code 필드).
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
  "./studio-lora-fal.ts",
  "./studio-lora-training.ts",
  "./personal-inference-client.ts",
  "./studio-3d-generation-client.ts",
] as const;

/** 영속 저장되는 코드 참조 — lastError에 키 자체를 저장하는 지점 (T2). */
const STORED_KEY_PATTERN = /"(studio\.aiError\.[a-z]+\.[A-Za-z]+)"/g;

function collectStoredKeys(): Array<{ key: string; file: string }> {
  const stored: Array<{ key: string; file: string }> = [];
  for (const match of readSource("./studio-lora-training.ts").matchAll(STORED_KEY_PATTERN)) {
    stored.push({ key: match[1] ?? "", file: "./studio-lora-training.ts" });
  }
  return stored;
}

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

describe("studio.aiError 사전 (T1~T3 등록 모듈)", () => {
  it("ko/en 키 집합이 일치하고 118키다", () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(AI_ERROR_KEYS);
    expect(AI_ERROR_KEYS).toHaveLength(118);
    expect(AI_ERROR_KEYS.every((key) => key.startsWith("studio.aiError."))).toBe(true);
  });

  it("en 값에 한글이 없고 ko/en 값이 비어 있지 않다", () => {
    for (const key of AI_ERROR_KEYS) {
      expect(DICTS.en[key], key).not.toMatch(HANGUL);
      expect((DICTS.ko[key] ?? "").length, key).toBeGreaterThan(0);
      expect((DICTS.en[key] ?? "").length, key).toBeGreaterThan(0);
    }
  });

  it("네임스페이스 구간이 트랜치 파일과 대응한다 (client 39·reference 13·wizard 2·server 6·fal 22·personal 17·threed 19)", () => {
    const count = (prefix: string) => AI_ERROR_KEYS.filter((key) => key.startsWith(prefix)).length;
    expect(count("studio.aiError.client.")).toBe(39);
    expect(count("studio.aiError.reference.")).toBe(13);
    expect(count("studio.aiError.wizard.")).toBe(2);
    expect(count("studio.aiError.server.")).toBe(6);
    expect(count("studio.aiError.fal.")).toBe(22);
    expect(count("studio.aiError.personal.")).toBe(17);
    expect(count("studio.aiError.threed.")).toBe(19);
  });
});

describe("studio.aiError 소비 계약 (T1~T3 생산자 8파일)", () => {
  it("등록된 전 키가 생산자에서 소비되고 미등록 참조가 없다 (영속 저장 코드 포함)", () => {
    const used = new Set([
      ...collectCalls().map((call) => call.key),
      ...collectStoredKeys().map((stored) => stored.key),
    ]);
    expect([...used].sort()).toEqual(AI_ERROR_KEYS);
  });

  it("영속 저장 코드(lastError)는 전부 fal 구간의 등록 키고 6개다 (T2)", () => {
    const stored = collectStoredKeys();
    expect(stored).toHaveLength(6);
    for (const entry of stored) {
      expect(DICTS.ko[entry.key], entry.key).toBeTruthy();
      expect(entry.key.startsWith("studio.aiError.fal.job")).toBe(true);
    }
  });

  it("호출부 한국어 폴백이 ko 사전값과 글자 단위로 일치한다 (한국어 표시 회귀 0)", () => {
    for (const call of collectCalls()) {
      expect(DICTS.ko[call.key], `${call.file} :: ${call.key}`).toBe(call.fallback);
    }
  });

  it("생산자 8파일에 생산자 채널 하드코딩이 남아 있지 않다 (탐지기 producer 모드 0건)", () => {
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

  it("fal 제공자 원문은 frame의 {message} 파라미터로만 끼운다 (설계 §3.4-④, T1 frame 선례)", () => {
    const fal = readSource("./studio-lora-fal.ts");
    expect(fal).toContain('aiErrorText("studio.aiError.fal.requestRejected", { status, message:');
    // 개인 런타임이 쓴 job.error 문자열은 코드화하지 않는다 (설계 §3.4-⑤).
    const personal = readSource("./personal-inference-client.ts");
    expect(personal).toContain("value.error.slice(0, 500)");
  });

  it("throw 클라이언트는 code 보유 에러 클래스로 던진다 (T3)", () => {
    const personal = readSource("./personal-inference-client.ts");
    expect(personal).toContain("export class PersonalInferenceError extends Error");
    expect(personal).not.toContain("throw new Error(");
    const threed = readSource("./studio-3d-generation-client.ts");
    expect(threed).toContain("readonly code: Studio3dGenerationErrorCode");
    expect(threed).not.toContain("throw new Error(");
    expect(threed).not.toContain("throw new RangeError(");
    expect(threed).not.toContain("throw new TypeError(");
  });
});
