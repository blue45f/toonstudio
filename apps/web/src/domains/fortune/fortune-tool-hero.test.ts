import { describe, expect, it } from "vitest";
import { FORTUNE_TAB_ORDER } from "./fortune-page-data";
import { FORTUNE_TOOL_HERO, FORTUNE_ZODIAC_GLYPHS, fortuneToolFromPathname } from "./fortune-tool-hero";

describe("fortuneToolFromPathname", () => {
  it("도구 하위 라우트 8개를 각 도구로 도출한다", () => {
    for (const tab of FORTUNE_TAB_ORDER) {
      expect(fortuneToolFromPathname(`/fortune/${tab}`)).toBe(tab);
    }
  });

  it("착지와 알 수 없는 경로는 null이다", () => {
    expect(fortuneToolFromPathname("/fortune")).toBeNull();
    expect(fortuneToolFromPathname("/fortune/")).toBeNull();
    expect(fortuneToolFromPathname("/fortune/unknown")).toBeNull();
    expect(fortuneToolFromPathname("/learn")).toBeNull();
    expect(fortuneToolFromPathname("/")).toBeNull();
  });

  it("후행 슬래시는 허용하되 더 깊은 경로는 도구로 보지 않는다", () => {
    expect(fortuneToolFromPathname("/fortune/saju/")).toBe("saju");
    expect(fortuneToolFromPathname("/fortune/saju/extra")).toBeNull();
  });
});

describe("FORTUNE_TOOL_HERO", () => {
  it("전 도구에 말풍선·CTA·비주얼이 비어 있지 않다", () => {
    for (const tab of FORTUNE_TAB_ORDER) {
      const content = FORTUNE_TOOL_HERO[tab];
      expect(content.bubble.length).toBeGreaterThan(0);
      expect(content.ctaLabel.length).toBeGreaterThan(0);
      expect(content.visual.length).toBeGreaterThan(0);
    }
  });

  it("생년월일이 필요한 도구는 기간·사주 계열과 궁합뿐이다", () => {
    const needsBirth = FORTUNE_TAB_ORDER.filter((tab) => FORTUNE_TOOL_HERO[tab].needsBirth);
    expect(needsBirth).toEqual(["monthly", "yearly", "zodiac", "saju", "compatibility"]);
    const needsPartner = FORTUNE_TAB_ORDER.filter((tab) => FORTUNE_TOOL_HERO[tab].needsPartnerBirth);
    expect(needsPartner).toEqual(["compatibility"]);
  });

  it("별자리 글리프는 12개다", () => {
    expect(FORTUNE_ZODIAC_GLYPHS).toHaveLength(12);
  });
});
