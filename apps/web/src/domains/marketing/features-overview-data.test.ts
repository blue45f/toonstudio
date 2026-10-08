import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { beforeAll, describe, expect, it } from "vitest";

import {
  FEATURE_OVERVIEW_CATEGORIES,
  FEATURE_OVERVIEW_CATALOG_PLATFORM_COUNT,
  FEATURE_OVERVIEW_CATALOG_SNAPSHOT_DATE,
  FEATURE_OVERVIEW_CATALOG_TITLES,
  FEATURE_OVERVIEW_CATALOG_WEBNOVEL_TITLES,
  FEATURE_OVERVIEW_CATALOG_WEBTOON_TITLES,
  FEATURE_OVERVIEW_PLATFORM_COUNT,
} from "./features-overview-data";

import { canonicalSitePath } from "@/shared/lib/site-route-metadata";

const CATALOG_PATH = "apps/api/data/catalog.json.gz";
const PLATFORMS_PATH = "packages/core/src/platforms.ts";

interface CatalogSummary {
  readonly count: number;
  readonly declaredCount: unknown;
  readonly crawledAt: string;
  readonly byType: ReadonlyMap<string, number>;
  readonly platformsInAvailability: ReadonlySet<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 커밋된 카탈로그 스냅샷을 한 번 읽어 건수·구성·플랫폼을 센다(약 54MB를 푸는 데 1~2초). */
function summarizeCatalog(): CatalogSummary {
  const raw: unknown = JSON.parse(gunzipSync(readFileSync(CATALOG_PATH)).toString("utf8"));
  if (!isRecord(raw) || !Array.isArray(raw.titles) || typeof raw.crawledAt !== "string") {
    throw new Error("catalog.json.gz의 형태가 바뀌었습니다. features-overview-data의 근거를 다시 확인하세요.");
  }
  const byType = new Map<string, number>();
  const platformsInAvailability = new Set<string>();
  for (const title of raw.titles as readonly unknown[]) {
    if (!isRecord(title)) continue;
    const type = typeof title.type === "string" ? title.type : "?";
    byType.set(type, (byType.get(type) ?? 0) + 1);
    if (!Array.isArray(title.availability)) continue;
    for (const entry of title.availability as readonly unknown[]) {
      if (isRecord(entry) && typeof entry.platformId === "string") platformsInAvailability.add(entry.platformId);
    }
  }
  return {
    count: raw.titles.length,
    declaredCount: raw.count,
    crawledAt: raw.crawledAt,
    byType,
    platformsInAvailability,
  };
}

/** packages/core의 PLATFORMS가 정의한 플랫폼 id. 패키지 전체를 불러오지 않고 소스에서 센다. */
function definedPlatformIds(): readonly string[] {
  const source = readFileSync(PLATFORMS_PATH, "utf8");
  return [...source.matchAll(/^\s*(?:"[a-z0-9-]+"|[a-z0-9]+): \{ id: "([a-z0-9-]+)"/gmu)].map((match) => match[1] ?? "");
}

/**
 * `/features` 요약 카탈로그의 구조 무결성 고정.
 * - 카테고리·항목 구조와 한/영 문구가 비어 있지 않아야 한다.
 * - 링크가 등록 라우트로 이어지는지는 app 레이어의
 *   app/routes/features-overview-links.test.ts가 고정한다
 *   (도메인 → app import는 경계 규칙 위반이라 여기서 직접 대조하지 않는다).
 * 수치 상수는 정적 근거가 있는 값만 허용한다 (데이터 파일 머리말 참조).
 */
describe("features overview catalog", () => {
  it("카테고리 id가 유일하고 제목·요약이 한/영으로 채워져 있다", () => {
    const ids = FEATURE_OVERVIEW_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      expect(category.title.ko.trim()).not.toBe("");
      expect(category.title.en.trim()).not.toBe("");
      expect(category.summary.ko.trim()).not.toBe("");
      expect(category.summary.en.trim()).not.toBe("");
    }
  });

  it("모든 카테고리에 항목이 3개 이상 있고 이름·설명이 한/영으로 채워져 있다", () => {
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      expect(category.items.length).toBeGreaterThanOrEqual(3);
      for (const item of category.items) {
        expect(item.name.ko.trim()).not.toBe("");
        expect(item.name.en.trim()).not.toBe("");
        expect(item.description.ko.trim()).not.toBe("");
        expect(item.description.en.trim()).not.toBe("");
      }
    }
  });

  it("항목 링크가 전체에서 유일하다", () => {
    const hrefs = FEATURE_OVERVIEW_CATEGORIES.flatMap((category) =>
      category.items.map((item) => item.href),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("항목 링크는 리다이렉트 별칭이 아니라 정본 경로다", () => {
    // 같은 화면을 가리키는 카드가 이름만 바꿔 둘로 나뉘거나(/shaper), 목적지와 다른 화면으로 가는(/creator-hub → /studio) 일을 막는다.
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      for (const item of category.items) {
        expect(canonicalSitePath(item.href), `${category.id} / ${item.href}`).toBe(item.href);
      }
    }
  });

  it("개인 AI 화면(/studio/ai-lab)을 기기 안 ONNX 실험실로 소개하지 않는다", () => {
    const item = FEATURE_OVERVIEW_CATEGORIES.flatMap((category) => category.items).find((candidate) => candidate.href === "/studio/ai-lab");
    expect(item).toBeDefined();
    // 실제 화면은 'AI 크리에이티브 디렉터'다(루나 제안 + 화면별 비용·키·데이터 조건 + 접힌 '내 AI 런타임 · 고급' = 클라우드 런타임).
    expect(item?.name.ko).toBe("AI 크리에이티브 디렉터");
    expect(`${item?.description.ko} ${item?.description.en}`).not.toMatch(/ONNX/u);
  });

  it("최근 기능(모션 웹툰 내보내기·PDF 워크벤치)을 실제 라우트와 함께 소개한다", () => {
    const items = FEATURE_OVERVIEW_CATEGORIES.flatMap((category) => category.items);
    expect(items.find((item) => item.href === "/studio/motion-webtoon")?.description.ko).toMatch(/GIF·MP4·WebM/u);
    expect(items.find((item) => item.href === "/studio/pdf-workbench")?.name.ko).toBe("PDF 워크벤치");
  });
});

describe("features overview 규모 수치", () => {
  let catalog: CatalogSummary;

  beforeAll(() => {
    catalog = summarizeCatalog();
  });

  it("작품 정보 건수와 웹툰·웹소설 구성이 커밋된 카탈로그 파일과 같다", () => {
    expect(FEATURE_OVERVIEW_CATALOG_TITLES).toBe(60_234);
    expect(catalog.count).toBe(FEATURE_OVERVIEW_CATALOG_TITLES);
    expect(catalog.declaredCount).toBe(FEATURE_OVERVIEW_CATALOG_TITLES);
    expect(catalog.byType.get("webtoon")).toBe(FEATURE_OVERVIEW_CATALOG_WEBTOON_TITLES);
    expect(catalog.byType.get("webnovel")).toBe(FEATURE_OVERVIEW_CATALOG_WEBNOVEL_TITLES);
    expect(FEATURE_OVERVIEW_CATALOG_WEBTOON_TITLES + FEATURE_OVERVIEW_CATALOG_WEBNOVEL_TITLES).toBe(FEATURE_OVERVIEW_CATALOG_TITLES);
    // 웹소설이 대부분이라 '작품 6만 건'을 웹툰으로 읽히게 쓰지 않는다.
    expect(FEATURE_OVERVIEW_CATALOG_WEBNOVEL_TITLES / FEATURE_OVERVIEW_CATALOG_TITLES).toBeGreaterThan(0.75);
  });

  it("스냅샷 기준일은 카탈로그의 수집 시각(crawledAt)과 같다", () => {
    expect(catalog.crawledAt.startsWith(FEATURE_OVERVIEW_CATALOG_SNAPSHOT_DATE)).toBe(true);
  });

  it("서비스에 정의된 플랫폼 수와 카탈로그에 실제로 담긴 플랫폼 수를 구분해 적는다", () => {
    const defined = definedPlatformIds();
    expect(defined).toHaveLength(FEATURE_OVERVIEW_PLATFORM_COUNT);
    expect(catalog.platformsInAvailability.size).toBe(FEATURE_OVERVIEW_CATALOG_PLATFORM_COUNT);
    for (const platformId of catalog.platformsInAvailability) expect(defined, platformId).toContain(platformId);
    expect(FEATURE_OVERVIEW_CATALOG_PLATFORM_COUNT).toBeLessThan(FEATURE_OVERVIEW_PLATFORM_COUNT);
  });
});
