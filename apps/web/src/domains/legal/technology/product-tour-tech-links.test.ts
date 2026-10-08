import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PRODUCT_TOUR_MEDIA_ATLAS_LINKS,
  PRODUCT_TOUR_TECH_LINKS,
  PRODUCT_TOUR_TECH_STATUS_LABEL,
  productTourAtlasHref,
  productTourStoryHref,
  type ProductTourTechStatus,
} from "@/domains/marketing/public/product-tour-tech-links";

import { findAtlasEntry } from "./engineering-atlas-content";
import { repoPathExists } from "./engineering-repo-paths-test-kit";
import { ENGINEERING_STATUS_META } from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

/**
 * /product-tour 가 챕터마다 거는 "이 장면에 쓰인 기술" 링크의 대조 검사.
 * 투어 화면은 도감·스토리 데이터를 가져오지 않고 id·상태를 정적으로 들고 있으므로, 여기서 실제 데이터와 맞춰 본다.
 * 도감 카드를 지우거나 챕터 상태를 바꾸면 이 테스트가 실패해 투어 데이터(marketing/public/product-tour-tech-links.ts)를 고치게 한다.
 */

// 투어 데이터(marketing/public)는 챕터 id 를 문자열로 들고 있으므로 키 타입을 string 으로 넓혀 조회한다.
const chapterById = new Map<string, (typeof PUBLISHED_ENGINEERING_CHAPTERS)[number]>(
  PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]),
);

describe("투어 챕터 → 기술 도감 카드", () => {
  it("연결한 도감 카드가 모두 실제로 있고, 링크는 카드 앵커를 가리킨다", () => {
    for (const [tourChapter, tech] of Object.entries(PRODUCT_TOUR_TECH_LINKS)) {
      for (const link of tech.atlas) {
        const entry = findAtlasEntry(link.atlasId);
        expect(entry, `${tourChapter}: 도감에 없는 카드 ${link.atlasId}`).toBeDefined();
        expect(productTourAtlasHref(link.atlasId)).toBe(`/about/technology/atlas#${link.atlasId}`);
      }
    }
  });

  it("연결한 카드의 쓰인 곳(usage)이 하나 이상이고 그 근거 경로가 저장소에 있다", () => {
    for (const [tourChapter, tech] of Object.entries(PRODUCT_TOUR_TECH_LINKS)) {
      for (const link of tech.atlas) {
        const entry = findAtlasEntry(link.atlasId);
        expect(entry?.usage.length, `${tourChapter}/${link.atlasId}`).toBeGreaterThan(0);
        for (const usage of entry?.usage ?? []) {
          for (const path of usage.paths) {
            expect(repoPathExists(path.split("#", 1)[0] ?? path), `${link.atlasId}: ${path}`).toBe(true);
          }
        }
      }
    }
  });

  it("스토리 챕터가 실제로 있고, 배지 상태가 챕터의 현재 상태와 같다", () => {
    for (const [tourChapter, tech] of Object.entries(PRODUCT_TOUR_TECH_LINKS)) {
      const chapter = chapterById.get(tech.story.chapterId);
      expect(chapter, `${tourChapter}: 없는 스토리 챕터 ${tech.story.chapterId}`).toBeDefined();
      expect(tech.story.status, `${tourChapter}: ${tech.story.chapterId} 의 상태가 바뀌었습니다`).toBe(chapter?.status);
      expect(productTourStoryHref(tech.story.chapterId)).toBe(`/about/technology/story#${tech.story.chapterId}`);
    }
  });

  it("배지 라벨이 제작 스토리의 상태 라벨(ENGINEERING_STATUS_META)과 같은 문구다", () => {
    const statuses = Object.keys(PRODUCT_TOUR_TECH_STATUS_LABEL) as ProductTourTechStatus[];
    expect(statuses.sort()).toEqual(["configured", "documented", "experimental", "live"]);
    for (const status of statuses) {
      expect(PRODUCT_TOUR_TECH_STATUS_LABEL[status]).toEqual(ENGINEERING_STATUS_META[status].label);
    }
  });

  it("투어에서 쓰인 상태 분포를 숨기지 않는다(운영 경로만 연결하지 않았다)", () => {
    const used = new Set(Object.values(PRODUCT_TOUR_TECH_LINKS).map((tech) => tech.story.status));
    expect(used.has("live")).toBe(true);
    expect(used.has("experimental")).toBe(true);
    expect(used.has("configured")).toBe(true);
  });
});

describe("영상·미디어 전달 도감 카드 5장", () => {
  it("web-platform 분야에 있고 제작 스토리 챕터와 이어진다(영상 전달 4장은 'delivery', 탭 카드는 'quality')", () => {
    expect(PRODUCT_TOUR_MEDIA_ATLAS_LINKS).toHaveLength(5);
    for (const link of PRODUCT_TOUR_MEDIA_ATLAS_LINKS) {
      const entry = findAtlasEntry(link.atlasId);
      expect(entry, `도감에 없는 카드 ${link.atlasId}`).toBeDefined();
      expect(entry?.category, link.atlasId).toBe("web-platform");
      const expectedChapter = link.atlasId === "aria-tabs-site-section-tabs" ? "quality" : "delivery";
      expect(chapterById.has(expectedChapter), expectedChapter).toBe(true);
      expect(entry?.chapterIds, link.atlasId).toContain(expectedChapter);
    }
  });

  it("JSON-LD 카드가 말하는 챕터 수(Clip)가 투어 챕터 수와 같다", () => {
    const jsonLd = findAtlasEntry("video-object-json-ld");
    expect(jsonLd?.facts?.find((fact) => fact.label.ko.includes("챕터"))?.value).toBe(String(Object.keys(PRODUCT_TOUR_TECH_LINKS).length));
  });

  /** 카드가 사실로 적은 코드 근거. 코드가 바뀌어 문장이 거짓이 되면 여기서 걸린다. */
  const read = (path: string): string => readFileSync(path, "utf8");
  const claims: readonly (readonly [cardId: string, file: string, needles: readonly string[]])[] = [
    ["remotion-composition-player", "apps/web/src/domains/marketing/ProductTourPlayer.tsx", ['from "@remotion/player"', "acknowledgeRemotionLicense", "switchToFallback"]],
    ["remotion-composition-player", "tools/media/brand-film/src/index.tsx", ['id="ToonStudioProductTour"', "durationInFrames={720}", "registerRoot"]],
    ["remotion-composition-player", "apps/web/src/domains/creator/promo/promo-remotion.ts", ["registerRoot", "remotion render"]],
    ["webvtt-caption-tracks", "tools/media/brand-film/generate-product-tour-narration.mjs", ["Generated captions are stale", "nextStart - 0.35", "buildVtt"]],
    ["webvtt-caption-tracks", "apps/web/src/domains/marketing/ProductTourMp4Player.tsx", ['<track kind="captions"', "textTracks"]],
    ["webvtt-caption-tracks", "apps/web/src/domains/marketing/ProductTourRemotionComposition.tsx", ['aria-hidden="true"', "productTourCaptionAtFrame"]],
    ["http-range-blob-seekable-media", "apps/web/src/domains/marketing/seekable-media-asset.ts", ["SEEKABLE_MEDIA_TIMEOUT_MS = 30_000", "TOUR_AUDIO_MAX_BYTES = 12 * 1024 * 1024", "TOUR_VIDEO_MAX_BYTES = 32 * 1024 * 1024", "response.status !== 200", 'startsWith("/brand/")']],
    ["http-range-blob-seekable-media", "apps/web/src/domains/marketing/use-seekable-media-asset.ts", ["URL.createObjectURL", "URL.revokeObjectURL"]],
    ["http-range-blob-seekable-media", "apps/web/src/domains/marketing/product-tour-media-recovery.ts", ["PRODUCT_TOUR_STALL_TIMEOUT_MS = 8_000", "PRODUCT_TOUR_MAX_AUTOMATIC_RECOVERIES = 2"]],
    ["video-object-json-ld", "apps/web/src/shared/seo/use-document-title.ts", ["application/ld+json", "\\\\u003c"]],
    ["video-object-json-ld", "apps/web/src/domains/marketing/ProductTourPage.tsx", ['"@type": "VideoObject"', '"@type": "Clip"', "hasPart"]],
    ["video-object-json-ld", "apps/web/src/domains/marketing/BrandFilmPage.tsx", ['"@type": "VideoObject"', "CREATOR_FILM.duration"]],
    ["aria-tabs-site-section-tabs", "apps/web/src/domains/legal/public/site-section-tabs.tsx", ['role="tablist"', 'role="tab"', "aria-selected", "aria-controls", "aria-labelledby", "tabIndex={active ? 0 : -1}", "MAX_SEGMENTED_TABS = 4", '"ArrowLeft"', '"Home"', '"End"']],
  ];

  it("카드가 근거로 인용한 코드·상수가 실제 파일에 그대로 있다", () => {
    for (const [cardId, file, needles] of claims) {
      expect(repoPathExists(file), file).toBe(true);
      const source = read(file);
      for (const needle of needles) expect(source, `${cardId}: ${file} 에 ${needle} 가 없습니다`).toContain(needle);
      // 카드의 쓰인 곳(usage)에도 그 파일이 올라 있어야 한다.
      const cited = findAtlasEntry(cardId)?.usage.flatMap((usage) => usage.paths.map((path) => path.split("#", 1)[0]));
      expect(cited, `${cardId}: usage 에 ${file} 가 없습니다`).toContain(file);
    }
  });
});
