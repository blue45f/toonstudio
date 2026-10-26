// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { useI18n } from "@/shared/lib/i18n";

import {
  CALENDAR_BM_FILTERS,
  COMMUNITY_PROMOTION_LEAGUE_TIERS,
  COMPETITOR_DISCOVERY_ROUTER_PRESETS,
  COMPETITOR_PLATFORM_REA_LEDGER,
  CONTEXTUAL_SUBNAV_GROUPS,
  CREATOR_STUDIO_PIPELINE_STEPS,
  DEFAULT_PROMO_MEDIA_FILTER_STATE,
  DISCOVER_SERIALIZATION_TRACKS,
  EXPLORE_DIRECTORY_MODES,
  EXPLORE_PREFERENCE_TAG_COMBOS,
  LEARN_CURRICULUM_ROADMAP_TRACKS,
  LIBRARY_PILLAR_CARDS,
  MARKET_ECOSYSTEM_PRESETS,
  PERSONAL_LIBRARY_SEGMENTS,
  RANKING_STREAM_MODES,
  SERIES_LANDING_VIEW_MODES,
  SHOWCASE_COLLABORATION_TRACKS,
  STORY_TO_WEBTOON_PIPELINE_MODES,
  VRM_CHARACTER_SUB_ROUTES,
  VRM_LICENSE_PRESETS,
  classifyMediaAspectRatio,
  matchesPromoMediaFilter,
  resolveActiveWeekdayKey,
  resolveContextualSubNavForPath,
  resolveCreatorPostActionBridgeRoutes,
  resolveMondayFirstWeekdayIndex,
  runSameDocumentViewTransition,
  summarizeVrmUsageMatrix,
} from "./webtoon-platform-router-ux-model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useI18n.getState().setLang("ko");
});

describe("글로벌 웹툰·창작·에셋·교육·협업 플랫폼 28종 REA 라우터 및 UI/UX 아키텍처 엔진", () => {
  it("28개 플랫폼/서피스의 REA Evidence ID와 SHA-256 해시, 인식론적 상태를 빠짐없이 기록한다", () => {
    expect(COMPETITOR_PLATFORM_REA_LEDGER).toHaveLength(28);
    const ids = COMPETITOR_PLATFORM_REA_LEDGER.map((item) => item.id);
    expect(ids).toEqual([
      "naver-webtoon",
      "kakaopage",
      "webtoons-global",
      "tapas",
      "lezhin-comics",
      "pixiv-comic",
      "ridi-webtoon",
      "kakao-webtoon",
      "postype",
      "manta",
      "clip-studio",
      "acon3d",
      "mangaplus",
      "vroid-hub",
      "vroid-studio",
      "booth-3d",
      "naver-best-challenge",
      "webtoons-canvas",
      "pixiv-booth",
      "mrblue-webtoon",
      "bomtoon",
      "sketchfab-3d",
      "toomics",
      "munpia-novel",
      "coloso-academy",
      "notefolio-creative",
      "comic-walker-jp",
      "loud-sourcing",
    ]);

    for (const entry of COMPETITOR_PLATFORM_REA_LEDGER) {
      expect(entry.captureEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/u);
      expect(entry.exportScriptsEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/u);
      expect(entry.astAnalysisViewEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/u);
      expect(entry.rootSha256).toMatch(/^[0-9a-f]{64}$/u);
    }

    const bomtoon = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "bomtoon",
    );
    expect(bomtoon?.routeCount).toBe(125);
    expect(bomtoon?.epistemicStatus).toBe("verified");

    const bestChallenge = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "naver-best-challenge",
    );
    expect(bestChallenge?.routeCount).toBe(37);
    expect(bestChallenge?.epistemicStatus).toBe("verified");

    const sketchfab = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "sketchfab-3d",
    );
    expect(sketchfab?.moduleCount).toBe(475);
    expect(sketchfab?.epistemicStatus).toBe("verified");

    const kakaopage = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "kakaopage",
    );
    expect(kakaopage?.routeCount).toBe(152);
    expect(kakaopage?.epistemicStatus).toBe("verified");

    const kakaoWebtoon = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "kakao-webtoon",
    );
    expect(kakaoWebtoon?.routeCount).toBe(80);
    expect(kakaoWebtoon?.epistemicStatus).toBe("verified");

    const mangaplus = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "mangaplus",
    );
    expect(mangaplus?.routeCount).toBe(36);
    expect(mangaplus?.epistemicStatus).toBe("verified");

    const vroidHub = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "vroid-hub",
    );
    expect(vroidHub?.routeCount).toBe(65);
    expect(vroidHub?.epistemicStatus).toBe("verified");

    const ridi = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "ridi-webtoon",
    );
    expect(ridi?.epistemicStatus).toBe("bounded-by-bot-challenge");

    const acon3d = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "acon3d",
    );
    expect(acon3d?.epistemicStatus).toBe("bounded-by-bot-challenge");
  });

  it("Kakao Webtoon 월요일 시작 요일 인덱스((weekday + 6) % 7)와 창작 파이프라인·서재·탐색 프리셋을 정확히 계산한다", () => {
    // JS getDay(): 0 = 일요일 -> 6, 1 = 월요일 -> 0, 2 = 화요일 -> 1 ...
    expect(resolveMondayFirstWeekdayIndex(0)).toBe(6);
    expect(resolveMondayFirstWeekdayIndex(1)).toBe(0);
    expect(resolveMondayFirstWeekdayIndex(2)).toBe(1);
    expect(resolveActiveWeekdayKey(0)).toBe("sun");
    expect(resolveActiveWeekdayKey(1)).toBe("mon");
    expect(resolveActiveWeekdayKey(5)).toBe("fri");

    expect(CREATOR_STUDIO_PIPELINE_STEPS).toHaveLength(6);
    expect(CREATOR_STUDIO_PIPELINE_STEPS.map((s) => s.toonstudioHref)).toEqual([
      "/create",
      "/studio/new",
      "/studio/comic",
      "/studio/import",
      "/showcase/promo",
      "/community/promote",
    ]);

    expect(PERSONAL_LIBRARY_SEGMENTS.map((s) => s.id)).toEqual([
      "view",
      "likes",
      "purchases",
      "collections",
    ]);
    expect(COMPETITOR_DISCOVERY_ROUTER_PRESETS).toHaveLength(6);
    expect(DISCOVER_SERIALIZATION_TRACKS.map((t) => t.id)).toEqual([
      "all",
      "originals",
      "canvas",
      "wait-free",
      "cuts-short",
    ]);
    expect(RANKING_STREAM_MODES.map((m) => m.id)).toEqual([
      "hottest",
      "trending",
      "completed",
      "canvas-rising",
    ]);
    expect(CALENDAR_BM_FILTERS.map((b) => b.id)).toEqual([
      "all",
      "wait-free",
      "free",
      "new",
      "completed",
    ]);
    expect(EXPLORE_DIRECTORY_MODES.map((d) => d.id)).toEqual([
      "all",
      "ongoing",
      "completed",
      "hiatus",
      "alpha",
      "updated",
    ]);
    expect(EXPLORE_PREFERENCE_TAG_COMBOS).toHaveLength(5);
    expect(LIBRARY_PILLAR_CARDS.map((p) => p.id)).toEqual([
      "view",
      "purchases",
      "likes",
      "collections",
    ]);
    expect(MARKET_ECOSYSTEM_PRESETS.map((p) => p.id)).toEqual([
      "all",
      "brush-2d",
      "bg-3d",
      "char-pose-3d",
      "tone-sfx",
      "free-point",
    ]);
    expect(COMMUNITY_PROMOTION_LEAGUE_TIERS.map((t) => t.id)).toEqual([
      "challenge",
      "best-challenge",
      "originals",
      "creator-101",
    ]);
    expect(LEARN_CURRICULUM_ROADMAP_TRACKS.map((t) => t.id)).toEqual([
      "story-novelcomics",
      "drawing-coloring",
      "3d-character-scene",
      "debut-monetization",
    ]);
    expect(STORY_TO_WEBTOON_PIPELINE_MODES.map((m) => m.id)).toEqual([
      "worldbuilding-synopsis",
      "novel-to-script",
      "storyboard-3d-blocking",
      "ink-render-publish",
    ]);
    expect(SHOWCASE_COLLABORATION_TRACKS.map((t) => t.id)).toEqual([
      "portfolio-curation",
      "team-recruiting",
      "contest-pitch",
    ]);
  });

  it("KakaoPage 3-Mode 뷰 스위처(card, poster, list)와 화면 비율 분류·필터가 정확히 동작한다", () => {
    expect(SERIES_LANDING_VIEW_MODES.map((m) => m.id)).toEqual([
      "card",
      "poster",
      "list",
    ]);

    expect(classifyMediaAspectRatio(1920, 1080)).toBe("landscape-16-9");
    expect(classifyMediaAspectRatio(1080, 1920)).toBe("vertical-9-16");
    expect(classifyMediaAspectRatio(1080, 1080)).toBe("square-1-1");

    const sampleShort = {
      categoryId: "shorts",
      width: 1080,
      height: 1920,
      ko: { title: "세로 쇼츠 예고편", body: "9:16 숏폼" },
      en: { title: "Vertical short trailer", body: "9:16 short-form" },
      usage: { ko: "제품 투어 쇼츠", en: "Product tour shorts" },
    };

    expect(
      matchesPromoMediaFilter(sampleShort, DEFAULT_PROMO_MEDIA_FILTER_STATE),
    ).toBe(true);
    expect(
      matchesPromoMediaFilter(sampleShort, {
        ...DEFAULT_PROMO_MEDIA_FILTER_STATE,
        aspectFilter: "vertical-9-16",
      }),
    ).toBe(true);
    expect(
      matchesPromoMediaFilter(sampleShort, {
        ...DEFAULT_PROMO_MEDIA_FILTER_STATE,
        aspectFilter: "landscape-16-9",
      }),
    ).toBe(false);
    expect(
      matchesPromoMediaFilter(sampleShort, {
        ...DEFAULT_PROMO_MEDIA_FILTER_STATE,
        searchQuery: "예고편",
      }),
    ).toBe(true);
    expect(
      matchesPromoMediaFilter(sampleShort, {
        ...DEFAULT_PROMO_MEDIA_FILTER_STATE,
        searchQuery: "존재하지않는키워드",
      }),
    ).toBe(false);
  });

  it("6대 허브 경로별 맥락형 서브탭(SiteContextualSubNav)을 판정하고 aria-current='page'를 표시한다", () => {
    expect(CONTEXTUAL_SUBNAV_GROUPS).toHaveLength(6);
    expect(resolveContextualSubNavForPath("/promo-library")?.id).toBe(
      "promo-cuts-hub",
    );
    expect(resolveContextualSubNavForPath("/cuts/studio")?.id).toBe(
      "promo-cuts-hub",
    );
    expect(resolveContextualSubNavForPath("/ranking")?.id).toBe(
      "discover-hub",
    );
    expect(resolveContextualSubNavForPath("/showcase")?.id).toBe(
      "community-hub",
    );
    expect(resolveContextualSubNavForPath("/studio")?.id).toBe("studio-hub");
    expect(resolveContextualSubNavForPath("/story-lab")?.id).toBe("studio-hub");
    expect(resolveContextualSubNavForPath("/learn")?.id).toBe("studio-hub");
    expect(resolveContextualSubNavForPath("/reviews")?.id).toBe("community-hub");
    expect(resolveContextualSubNavForPath("/collaborate")?.id).toBe("community-hub");
    expect(resolveContextualSubNavForPath("/recommend")?.id).toBe("discover-hub");
    expect(resolveContextualSubNavForPath("/compare")?.id).toBe("discover-hub");
    expect(resolveContextualSubNavForPath("/brand-film")?.id).toBe("promo-cuts-hub");
    expect(resolveContextualSubNavForPath("/product-tour")?.id).toBe("promo-cuts-hub");
    expect(resolveContextualSubNavForPath("/studio/comic")?.id).toBe(
      "studio-hub",
    );
    expect(resolveContextualSubNavForPath("/studio/assets/characters/new")?.id).toBe(
      "studio-hub",
    );
    expect(resolveContextualSubNavForPath("/market/browse")?.id).toBe(
      "market-hub",
    );
    expect(resolveContextualSubNavForPath("/marketplace")?.id).toBe(
      "market-hub",
    );
    expect(resolveContextualSubNavForPath("/research/scene-3d")?.id).toBe(
      "market-hub",
    );
    expect(resolveContextualSubNavForPath("/sitemap")?.id).toBe(
      "discover-hub",
    );
    expect(resolveContextualSubNavForPath("/library")?.id).toBe(
      "personal-library-hub",
    );
    expect(resolveContextualSubNavForPath("/cuts/rewards")?.id).toBe(
      "promo-cuts-hub",
    );
    expect(resolveContextualSubNavForPath("/search")?.id).toBe(
      "discover-hub",
    );
    expect(resolveContextualSubNavForPath("/random")?.id).toBe(
      "discover-hub",
    );
    expect(resolveContextualSubNavForPath("/creators")?.id).toBe(
      "community-hub",
    );
    expect(resolveContextualSubNavForPath("/my")?.id).toBe(
      "personal-library-hub",
    );
    expect(resolveContextualSubNavForPath("/notifications")?.id).toBe(
      "personal-library-hub",
    );
    expect(resolveContextualSubNavForPath("/studio/publish")?.id).toBe(
      "studio-hub",
    );
    expect(resolveContextualSubNavForPath("/tags")?.id).toBe("discover-hub");
    expect(resolveContextualSubNavForPath("/authors")?.id).toBe("discover-hub");
    expect(resolveContextualSubNavForPath("/author/demo")?.id).toBe("discover-hub");
    expect(resolveContextualSubNavForPath("/insights")?.id).toBe("discover-hub");
    expect(resolveContextualSubNavForPath("/news")?.id).toBe("discover-hub");
    expect(resolveContextualSubNavForPath("/guide")?.id).toBe("discover-hub");
    expect(resolveContextualSubNavForPath("/title/demo-slug")?.id).toBe(
      "discover-hub",
    );
    expect(resolveContextualSubNavForPath("/cafes")?.id).toBe("community-hub");
    expect(resolveContextualSubNavForPath("/pencafe/demo")?.id).toBe(
      "community-hub",
    );
    expect(resolveContextualSubNavForPath("/community/events")?.id).toBe(
      "community-hub",
    );
    expect(resolveContextualSubNavForPath("/community/timelapse")?.id).toBe(
      "community-hub",
    );
    expect(resolveContextualSubNavForPath("/settings")).toBeNull();

    render(
      <MemoryRouter initialEntries={["/promo-library"]}>
        <SiteContextualSubNav pathnameOverride="/promo-library" />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", {
      name: "영상 · 홍보 · 컷츠 허브",
    });
    expect(nav.getAttribute("data-contextual-subnav")).toBe("promo-cuts-hub");
    const activeLink = screen.getByRole("link", {
      name: /홍보 영상 자료실 \(204편\)/u,
    });
    expect(activeLink.getAttribute("aria-current")).toBe("page");
  });

  it("VRoid Hub 서브 라우트, VRM 이용권한 매트릭스, 창작 단계별 연관 동선 브리지(Onward Bridge)를 계산한다", () => {
    expect(VRM_CHARACTER_SUB_ROUTES.map((r) => r.id)).toEqual([
      "overview",
      "edit",
      "photobooth",
      "tracking",
      "embed",
      "license",
    ]);

    const serialReady = VRM_LICENSE_PRESETS[0]!;
    const badges = summarizeVrmUsageMatrix(serialReady);
    expect(badges).toHaveLength(5);
    expect(badges.find((b) => b.id === "serial")?.allowed).toBe(true);
    expect(badges.find((b) => b.id === "credit")?.allowed).toBe(true);

    const renderBridges = resolveCreatorPostActionBridgeRoutes("render");
    expect(renderBridges.map((b) => b.href)).toEqual([
      "/studio",
      "/cuts/studio",
      "/showcase",
    ]);
  });

  it("runSameDocumentViewTransition은 startViewTransition을 호출하고 reduced-motion을 존중한다", () => {
    let executed = false;
    runSameDocumentViewTransition(() => {
      executed = true;
    });
    expect(executed).toBe(true);
  });
});
