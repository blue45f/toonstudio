import { describe, expect, it } from "vitest";

import { spaceHudChatHintBlocked, spaceHudShowsEventBanner } from "./space-hud-priority";

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

describe("spaceHudChatHintBlocked", () => {
  const open = { surfaceOpen: false, chatPanelOpen: false, touch: false };

  it("데스크톱에서 다른 표면이 없으면 Enter 채팅 힌트를 보인다", () => {
    expect(spaceHudChatHintBlocked(open)).toBe(false);
  });

  it("대화·패널 같은 다른 표면이 열려 있으면 막는다", () => {
    expect(spaceHudChatHintBlocked({ ...open, surfaceOpen: true })).toBe(true);
  });

  it("채팅 패널이 열려 있으면 입력이 겹치지 않게 힌트를 접는다", () => {
    expect(spaceHudChatHintBlocked({ ...open, chatPanelOpen: true })).toBe(true);
  });

  it("좁은 화면에서는 같은 자리의 말 걸기 버튼이 채팅 입구라 힌트를 두지 않는다", () => {
    expect(spaceHudChatHintBlocked({ ...open, touch: true })).toBe(true);
  });
});
