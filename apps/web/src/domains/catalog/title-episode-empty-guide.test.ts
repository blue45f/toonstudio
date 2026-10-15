import { describe, expect, it } from "vitest";

import type { Availability } from "@/shared/lib/types";

import {
  buildPlatformGoHref,
  resolveExternalPlatformGuide,
} from "./title-episode-empty-guide";

const NAVER_URL = "https://comic.naver.com/webtoon/list?titleId=123&tab=mon";

describe("resolveExternalPlatformGuide — 외부 플랫폼 안내 도출", () => {
  it("https URL이 있는 항목만 링크로 승격하고 서버 경유 경로를 만든다", () => {
    const guide = resolveExternalPlatformGuide([
      { platformId: "naver-webtoon", pricing: "free", url: NAVER_URL },
    ]);
    expect(guide.state).toBe("ready");
    expect(guide.primary?.platformId).toBe("naver-webtoon");
    expect(guide.primary?.href).toBe(
      `/api/go/naver-webtoon?to=${encodeURIComponent(NAVER_URL)}`,
    );
    expect(buildPlatformGoHref("ridi", "https://ridibooks.com/books/1")).toBe(
      "/api/go/ridi?to=https%3A%2F%2Fridibooks.com%2Fbooks%2F1",
    );
  });

  it("무료 진입을 유료보다 앞에 두고, 독점을 동률에서 앞세운다", () => {
    const guide = resolveExternalPlatformGuide([
      { platformId: "ridi", pricing: "paid", url: "https://ridibooks.com/books/1" },
      { platformId: "kakao-page", pricing: "wait-free", url: "https://page.kakao.com/content/1" },
      { platformId: "naver-webtoon", pricing: "free", url: NAVER_URL },
      { platformId: "lezhin", pricing: "free", isOriginal: true, url: "https://www.lezhin.com/ko/comic/x" },
    ]);
    expect(guide.links.map((link) => link.platformId)).toEqual([
      "lezhin",
      "naver-webtoon",
      "kakao-page",
      "ridi",
    ]);
  });

  it("URL이 없는 항목은 링크로 지어내지 않고 no-url 상태로 구분한다", () => {
    const guide = resolveExternalPlatformGuide([
      { platformId: "naver-webtoon", pricing: "free" },
      { platformId: "ridi", pricing: "paid", url: "   " },
    ]);
    expect(guide.state).toBe("no-url");
    expect(guide.links).toEqual([]);
    expect(guide.primary).toBeNull();
    expect(guide.knownPlatformIds).toEqual(["naver-webtoon", "ridi"]);
  });

  it("http·형식 오류·자격증명이 든 URL은 죽은 링크가 되므로 승격하지 않는다", () => {
    const guide = resolveExternalPlatformGuide([
      { platformId: "naver-webtoon", pricing: "free", url: "http://comic.naver.com/x" },
      { platformId: "ridi", pricing: "paid", url: "not-a-url" },
      // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
      { platformId: "lezhin", pricing: "paid", url: "https://user:pass@www.lezhin.com/x" },
      { platformId: "munpia", pricing: "paid", url: "javascript:alert(1)" },
    ] as Availability[]);
    expect(guide.state).toBe("no-url");
    expect(guide.links).toEqual([]);
  });

  it("같은 플랫폼이 중복되면 링크가 되는 항목 1개로 합치고 입력을 바꾸지 않는다", () => {
    const input: Availability[] = [
      { platformId: "naver-webtoon", pricing: "paid" },
      { platformId: "naver-webtoon", pricing: "free", url: NAVER_URL },
    ];
    const snapshot = JSON.parse(JSON.stringify(input)) as Availability[];
    const guide = resolveExternalPlatformGuide(input);
    expect(guide.links).toHaveLength(1);
    expect(guide.primary?.pricing).toBe("free");
    expect(input).toEqual(snapshot);
  });

  it("플랫폼이 없거나 킬스위치가 꺼져 있으면 none이며 플랫폼명을 노출하지 않는다", () => {
    expect(resolveExternalPlatformGuide([]).state).toBe("none");
    expect(resolveExternalPlatformGuide(undefined).state).toBe("none");
    expect(resolveExternalPlatformGuide(null).state).toBe("none");
    const hidden = resolveExternalPlatformGuide(
      [{ platformId: "naver-webtoon", pricing: "free", url: NAVER_URL }],
      { availabilityVisible: false },
    );
    expect(hidden).toEqual({ state: "none", links: [], primary: null, knownPlatformIds: [] });
  });
});
