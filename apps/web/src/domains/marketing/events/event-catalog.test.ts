import { describe, expect, it } from "vitest";

import {
  BETA_OPEN_EVENT,
  MARKETING_EVENTS,
  findMarketingEvent,
  resolveMarketingEventStatus,
} from "./event-catalog";

describe("marketing event catalog", () => {
  it("keeps the beta opening benefit explicit and non-stacking", () => {
    expect(BETA_OPEN_EVENT.signupFreeMonths).toBe(6);
    expect(BETA_OPEN_EVENT.publicCreatorFreeMonths).toBe(12);
    expect(BETA_OPEN_EVENT.minimumPublicContentCount).toBe(1);
    expect(BETA_OPEN_EVENT.minimumPublicDays).toBe(30);
    expect(BETA_OPEN_EVENT.notices.some((notice) => notice.ko.includes("합산되지"))).toBe(true);
  });

  it("resolves the open-ended beta event as active after launch", () => {
    expect(
      resolveMarketingEventStatus(
        BETA_OPEN_EVENT,
        new Date("2026-09-18T12:00:00+09:00"),
      ),
    ).toBe("active");
  });

  it("finds the public beta event by slug", () => {
    expect(findMarketingEvent("beta-open")?.id).toBe("beta-open-2026");
  });

  it("points the beta event art at the art its own detail page uses", () => {
    // /events/beta-open 히어로가 쓰는 스튜디오 아트와 같은 자산이어야
    // "이벤트 자체 아트"라는 카드 표기가 성립한다. 공용 섹션 이미지가 아니다.
    expect(BETA_OPEN_EVENT.image).toBe("/images/hero-studio.webp");
    expect(BETA_OPEN_EVENT.image).not.toContain("section-");
  });

  it("keeps every catalog image either null (typographic cover) or a local image path", () => {
    for (const event of MARKETING_EVENTS) {
      expect(event.image === null || event.image.startsWith("/images/")).toBe(true);
    }
  });
});
