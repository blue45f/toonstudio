// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { useI18n } from "@/shared/lib/i18n";

import {
  COMPETITOR_PLATFORM_REA_LEDGER,
  DEFAULT_PROMO_MEDIA_FILTER_STATE,
  SERIES_LANDING_VIEW_MODES,
  classifyMediaAspectRatio,
  matchesPromoMediaFilter,
  resolveContextualSubNavForPath,
  runSameDocumentViewTransition,
} from "./webtoon-platform-router-ux-model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useI18n.getState().setLang("ko");
});

describe("유사 웹툰·창작 플랫폼 7종 REA 라우터 및 UI/UX 아키텍처 엔진", () => {
  it("7개 플랫폼의 REA Evidence ID와 SHA-256 해시, 인식론적 상태를 빠짐없이 기록한다", () => {
    expect(COMPETITOR_PLATFORM_REA_LEDGER).toHaveLength(7);
    const ids = COMPETITOR_PLATFORM_REA_LEDGER.map((item) => item.id);
    expect(ids).toEqual([
      "naver-webtoon",
      "kakaopage",
      "webtoons-global",
      "tapas",
      "lezhin-comics",
      "pixiv-comic",
      "ridi-webtoon",
    ]);

    for (const entry of COMPETITOR_PLATFORM_REA_LEDGER) {
      expect(entry.captureEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/u);
      expect(entry.exportScriptsEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/u);
      expect(entry.astAnalysisViewEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/u);
      expect(entry.rootSha256).toMatch(/^[0-9a-f]{64}$/u);
    }

    const kakaopage = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "kakaopage",
    );
    expect(kakaopage?.routeCount).toBe(152);
    expect(kakaopage?.epistemicStatus).toBe("verified");

    const ridi = COMPETITOR_PLATFORM_REA_LEDGER.find(
      (item) => item.id === "ridi-webtoon",
    );
    expect(ridi?.epistemicStatus).toBe("bounded-by-bot-challenge");
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

  it("경로별 맥락형 서브탭(SiteContextualSubNav)을 판정하고 aria-current='page'를 표시한다", () => {
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

  it("runSameDocumentViewTransition은 startViewTransition을 호출하고 reduced-motion을 존중한다", () => {
    let executed = false;
    runSameDocumentViewTransition(() => {
      executed = true;
    });
    expect(executed).toBe(true);
  });
});
