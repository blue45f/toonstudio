import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * creator-resources 로딩·실패·빈 상태 문구 i18n 키 이관 계약 (A4 잔여 3라운드 c05).
 *
 * 배경: 리소스 표면 14파일의 로딩·실패·빈 상태 문구가 호출부에 한국어로
 * 하드코딩돼 en 사용자의 동선이 끊겼다. 표시 정본은 resources.status.*
 * (resource-status-i18n 등록 모듈) 키이며, 코드 안의 한국어 원문은
 * `resourceStatusText(키, …, 한국어 폴백)`의 폴백 인자로만 남아야 한다.
 * 이미 tx()(정적 원문 등록)로 감싸진 파일·문구는 도메인 기존 패턴이
 * 정본이라 이 계약의 대상이 아니다 (CatalogResearchPage 등).
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

const DICTS = parseRegisterModule(readSource("resource-status-i18n.ts"));
const RESOURCE_STATUS_KEYS = Object.keys(DICTS.ko).sort();

const CONSUMERS = [
  "CatalogResearchNotebook.tsx",
  "MaterialAtlasPage.tsx",
  "NowPage.tsx",
  "ProviderStatus.tsx",
  "ReferenceAssetDialogs.tsx",
  "ReferenceAssetsPage.tsx",
  "ResearchSynthesisBoard.tsx",
  "ResourceSearchPage.tsx",
  "TranslatedQueryNotice.tsx",
  "WikimediaInterestDashboard.tsx",
  "now-page/NowFlowArchive.tsx",
  "now-page/NowSceneHero.tsx",
  "now-page/NowVariationLab.tsx",
  "reference-asset-ui.tsx",
] as const;

const CALL_PATTERN =
  /resourceStatusText\("([^"]+)",\s*(?:\{[^}]*\},\s*)?"((?:[^"\\]|\\.)*)"\)/g;

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

describe("resources.status 사전 (r3c05 등록 모듈)", () => {
  it("ko/en 키가 패리티를 이루고 54키이며 en에 한글이 없다", () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(RESOURCE_STATUS_KEYS);
    expect(RESOURCE_STATUS_KEYS).toHaveLength(54);
    for (const key of RESOURCE_STATUS_KEYS) {
      expect(key.startsWith("resources.status."), key).toBe(true);
      expect(DICTS.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(DICTS.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(DICTS.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("ko/en 플레이스홀더가 키마다 정확히 일치한다", () => {
    for (const key of RESOURCE_STATUS_KEYS) {
      expect(placeholders(DICTS.en[key] ?? ""), key).toEqual(placeholders(DICTS.ko[key] ?? ""));
    }
  });
});

describe("resources.status 소비 계약 (r3c05 이관 14파일)", () => {
  it("등록된 전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const used = new Set(collectCalls().map((call) => call.key));
    expect([...used].sort()).toEqual(RESOURCE_STATUS_KEYS);
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    const referenced = new Set(
      [...consumerSource.matchAll(/"(resources\.status\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(RESOURCE_STATUS_KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
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
