import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * catalog·community·engagement·market 로딩·실패·빈 상태 문구 i18n 키 이관
 * 계약 (A4 잔여 3라운드 c08).
 *
 * 배경: 4개 도메인 27파일의 로딩·실패·에러·빈 상태 문구가 호출부에 한국어로
 * 하드코딩돼 en 사용자의 동선이 끊겼다. 표시 정본은 도메인별 등록 모듈
 * (catalog-status-i18n·community-status-i18n·engagement-status-i18n·
 * market-status-i18n)의 `*.status.*` 키이며, 코드 안의 한국어 원문은
 * `<domain>StatusText(키, …, 한국어 폴백)`의 폴백 인자로만 남아야 한다.
 * 이미 translateCurrentStaticSourceText·useBilingual·tx()로 감싸진
 * 문구(DiscoverHubPage·NewsPage·TimelapseGalleryPage·post-report-form 등)와
 * 본문·안내문 잔여는 이 계약의 대상이 아니다.
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

const MODULES = [
  { file: "catalog-status-i18n.ts", prefix: "catalog.status." },
  { file: "../community/community-status-i18n.ts", prefix: "community.status." },
  { file: "../engagement/engagement-status-i18n.ts", prefix: "engagement.status." },
  { file: "../market/market-status-i18n.ts", prefix: "market.status." },
] as const;

const DICTS: Record<"ko" | "en", Record<string, string>> = { ko: {}, en: {} };
for (const mod of MODULES) {
  const parsed = parseRegisterModule(readSource(mod.file));
  Object.assign(DICTS.ko, parsed.ko);
  Object.assign(DICTS.en, parsed.en);
}
const ALL_KEYS = Object.keys(DICTS.ko).sort();

const CONSUMERS = [
  "AuthorPage.tsx",
  "AuthorsPage.tsx",
  "InsightsPage.tsx",
  "RandomPage.tsx",
  "TagsPage.tsx",
  "TitleDetailPage.tsx",
  "TitleReaderPage.tsx",
  "WorldWikiSection.tsx",
  "../community/CommunityEventsPage.tsx",
  "../community/CommunityPostPage.tsx",
  "../community/ReviewsPage.tsx",
  "../community/components/community-activity-preview.tsx",
  "../community/components/community-scope-directory.tsx",
  "../community/components/fan-cafe-reply-section.tsx",
  "../community/components/review-replies.tsx",
  "../engagement/CreatorGrowthLabPage.tsx",
  "../engagement/LibraryDiaryTab.tsx",
  "../engagement/NotificationCenterPage.tsx",
  "../engagement/NotificationSettingsPage.tsx",
  "../engagement/PublicCollectionPage.tsx",
  "../engagement/TasteOnboardingPage.tsx",
  "../engagement/taste-spectrum-bar.tsx",
  "../market/components/CreatorMarketplaceCloudLibraryAction.tsx",
  "../market/components/CreatorMarketplaceReportAction.tsx",
  "../market/components/MarketAcquisitionModal.tsx",
  "../market/components/MarketProductionFitWorkbench.tsx",
  "../market/components/MarketplaceAuthoringInstallAction.tsx",
] as const;

const CALL_PATTERN =
  /(?:catalogStatusText|communityStatusText|engagementStatusText|marketStatusText)\("([^"]+)",\s*(?:\{[^}]*\},\s*)?"((?:[^"\\]|\\.)*)"\)/g;

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

describe("c08 status 사전 (등록 모듈 4종)", () => {
  it("ko/en 키가 패리티를 이루고 92키이며 en에 한글이 없다", () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(ALL_KEYS);
    expect(ALL_KEYS).toHaveLength(92);
    for (const mod of MODULES) {
      const parsed = parseRegisterModule(readSource(mod.file));
      expect(Object.keys(parsed.en).sort(), mod.file).toEqual(Object.keys(parsed.ko).sort());
      for (const key of Object.keys(parsed.ko)) {
        expect(key.startsWith(mod.prefix), `${mod.file} :: ${key}`).toBe(true);
      }
    }
    for (const key of ALL_KEYS) {
      expect(DICTS.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(DICTS.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(DICTS.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("ko/en 플레이스홀더가 키마다 정확히 일치한다", () => {
    for (const key of ALL_KEYS) {
      expect(placeholders(DICTS.en[key] ?? ""), key).toEqual(placeholders(DICTS.ko[key] ?? ""));
    }
  });
});

describe("c08 status 소비 계약 (이관 27파일)", () => {
  it("등록된 전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const used = new Set(collectCalls().map((call) => call.key));
    expect([...used].sort()).toEqual(ALL_KEYS);
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    const referenced = new Set(
      [...consumerSource.matchAll(/"((?:catalog|community|engagement|market)\.status\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(ALL_KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
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
