import { describe, expect, it } from "vitest";

import { spaceHudShowsEventBanner } from "./space-hud-priority";

describe("spaceHudShowsEventBanner", () => {
  it("휴대폰에서는 미니 투어가 열려 있는 동안 환영 배너를 접는다", () => {
    expect(spaceHudShowsEventBanner({ desktop: false, coachOpen: true })).toBe(false);
  });

  it("투어가 없으면 휴대폰에서도 배너를 보인다", () => {
    expect(spaceHudShowsEventBanner({ desktop: false, coachOpen: false })).toBe(true);
  });

  it("데스크톱은 칸이 넓어 투어와 배너를 함께 보인다", () => {
    expect(spaceHudShowsEventBanner({ desktop: true, coachOpen: true })).toBe(true);
    expect(spaceHudShowsEventBanner({ desktop: true, coachOpen: false })).toBe(true);
  });
});
