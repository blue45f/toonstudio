import { describe, expect, it } from "vitest";

import { shouldShowEntryIntro } from "./entry-intro-policy";

describe("shouldShowEntryIntro", () => {
  it.each(["/studio", "/studio/", "/studio/tools-companion"])(
    "전용 편집기 %s에서는 앱 인트로를 생략한다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(false);
    }
  );

  it("게시와 업로드도 현재 작업을 인트로로 가리지 않는다", () => {
    expect(shouldShowEntryIntro("/studio", "?mode=upload")).toBe(false);
    expect(shouldShowEntryIntro("/studio/publish")).toBe(false);
    expect(shouldShowEntryIntro("/studio/work/work-1/publish")).toBe(false);
  });

  it.each(["/", "///"])(
    "사이트 홈 %s에서만 브랜드 연출을 유지한다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(true);
    },
  );

  it.each(["/create", "/create/", "/CREATE///"])(
    "작품 시작 %s에서는 질문과 시작 행동을 인트로로 가리지 않는다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname, "?intent=my-story")).toBe(false);
    },
  );

  it.each(["/admin", "/admin/members"])(
    "관리자 콘솔 %s에서는 인트로를 생략한다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(false);
    },
  );

  it.each([
    "/team",
    "/team/lobby",
    "/home",
    "/hub",
    "/studio/space",
    "/studio/p/work-9/space",
    "/onboarding/character",
  ])(
    "자체 진입 연출을 가진 몰입 표면 %s에서는 인트로를 겹치지 않는다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(false);
    },
  );
});


describe("입력·계정·운영 화면은 브랜드 연출보다 작업을 우선한다", () => {
  it.each([
    "/me", "/me/", "/MY///", "/settings", "/settings/role", "/settings/notifications",
    "/auth/login", "/auth/reset-password", "/account/points", "/membership/usage",
    "/messages", "/messages/thread-1", "/notifications", "/production", "/production/project-1",
    "/market/library", "/market/publish", "/market/manage", "/market/seller", "/market/wishlist",
  ])("%s의 입력·조회 화면을 전면 인트로로 가리지 않는다", (pathname) => {
    expect(shouldShowEntryIntro(pathname)).toBe(false);
  });
  it.each(["/about", "/membership", "/market", "/market/browse", "/settings-guide", "/my-story", "/ranking", "/create/work-1", "/research", "/learn", "/search", "/title/sample/read/1", "/community", "/ir"])(
    "%s의 직접 진입은 내용을 브랜드 연출로 가리지 않는다", (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(false);
    },
  );
});
