import { describe, expect, it } from "vitest";

import {
  IMMERSIVE_VIRTUAL_HOME_PATHS,
  isImmersiveTeamPath,
  resolveShellChrome,
  usesFloatingServiceNotice,
} from "./shell-chrome-policy";

const decide = (pathname: string, overrides: Partial<Parameters<typeof resolveShellChrome>[0]> = {}) =>
  resolveShellChrome({
    pathname,
    normalizedPath: pathname.replace(/\/+$/u, "") || "/",
    hasTaskRoute: false,
    protectedCampus: false,
    ...overrides,
  });

describe("서비스 상태 안내의 실제 몰입 범위", () => {
  it.each(["/library", "/settings", "/discover"])("일반 작업 %s는 자체 크롬을 쓰더라도 상태가 본문을 덮지 않는다", (path) => {
    const shell = decide(path, { hasTaskRoute: true });
    expect(shell.immersiveVirtualExperience).toBe(true);
    expect(usesFloatingServiceNotice(path, shell)).toBe(false);
  });

  it("오프라인 보호 페이지에서도 상태 안내를 본문 흐름에 둔다", () => {
    const shell = decide("/offline", { protectedCampus: true });
    expect(shell.immersiveVirtualExperience).toBe(true);
    expect(usesFloatingServiceNotice("/offline", shell)).toBe(false);
  });

  it.each(["/hub", "/studio/space", "/team/people", "/studio/p/project/space", "/title/story/read/2"])("몰입 화면 %s의 기존 상태 알림을 유지한다", (path) => {
    expect(usesFloatingServiceNotice(path, decide(path))).toBe(true);
  });

  it("실제 편집기와 집중 작업은 경로의 가상 홈 여부와 별도로 떠 있는 알림을 유지한다", () => {
    expect(usesFloatingServiceNotice("/studio/p/project/comic-basic", decide("/studio/p/project/comic-basic"), { studioWorkspace: true })).toBe(true);
    expect(usesFloatingServiceNotice("/studio/new", decide("/studio/new", { hasTaskRoute: true }), { focusedTask: true })).toBe(true);
  });

  it("가상 홈의 기존 본문·제공된 상태 자리 예외를 유지한다", () => {
    expect(usesFloatingServiceNotice("/home", decide("/home"))).toBe(false);
  });
});

describe("shell chrome policy — 몰입 예외 단일 기준", () => {
  it("가상 홈 묶음은 명시 목록과 정확히 일치할 때만 몰입이다", () => {
    expect(IMMERSIVE_VIRTUAL_HOME_PATHS).toEqual([
      "/home",
      "/hub",
      "/studio",
      "/studio/space",
      "/onboarding/character",
    ]);
    for (const path of IMMERSIVE_VIRTUAL_HOME_PATHS) {
      expect(decide(path).immersiveVirtualHome, path).toBe(true);
      expect(decide(path).immersiveVirtualExperience, path).toBe(true);
    }
    // 하위 경로는 정확 일치 규칙 때문에 몰입이 아니다 — 헤더가 조용히 사라지지 않는다.
    expect(decide("/home/extra").immersiveVirtualExperience).toBe(false);
    expect(decide("/studio/space/extra").immersiveVirtualExperience).toBe(false);
  });

  it("팀 영역은 /team과 그 하위만 포함하고 접두가 겹치는 경로는 제외한다", () => {
    expect(isImmersiveTeamPath("/team")).toBe(true);
    expect(isImmersiveTeamPath("/team/members")).toBe(true);
    expect(isImmersiveTeamPath("/teamx")).toBe(false);
    expect(decide("/team").immersiveTeamExperience).toBe(true);
    expect(decide("/teamx").immersiveVirtualExperience).toBe(false);
  });

  it("프로젝트 가상공간만 프로젝트 몰입으로 판정한다", () => {
    expect(decide("/studio/p/abc/space").immersiveVirtualProject).toBe(true);
    expect(decide("/studio/p/abc/space/").immersiveVirtualProject).toBe(true);
    expect(decide("/studio/p/abc/overview").immersiveVirtualProject).toBe(false);
    expect(decide("/studio/p/abc/overview").immersiveVirtualExperience).toBe(false);
  });

  it("작업 프레임과 보호 캠퍼스는 자체 셸 판정으로 몰입이 된다", () => {
    expect(decide("/settings", { hasTaskRoute: true }).immersiveVirtualExperience).toBe(true);
    expect(decide("/settings").immersiveVirtualExperience).toBe(false);
    expect(decide("/anywhere", { protectedCampus: true }).immersiveVirtualExperience).toBe(true);
  });

  it("웹툰 뷰어 경로는 리더 몰입으로 판정한다", () => {
    expect(decide("/title/fog-signal/read/1").immersiveReader).toBe(true);
    expect(decide("/title/fog-signal/read/128").immersiveReader).toBe(true);
    expect(decide("/title/fog-signal/read/128/").immersiveReader).toBe(true);
    expect(decide("/title/fog-signal/read/128").immersiveVirtualExperience).toBe(true);
    // 작품 상세 자체와 숫자 아닌 회차는 몰입이 아니다 — 전역 크롬이 탈출 동선을 지킨다.
    expect(decide("/title/fog-signal").immersiveReader).toBe(false);
    expect(decide("/title/fog-signal/read/abc").immersiveReader).toBe(false);
    expect(decide("/title/fog-signal/read").immersiveReader).toBe(false);
    expect(decide("/title/fog-signal/read/1/extra").immersiveReader).toBe(false);
  });

  it("일반 공개 경로는 어떤 몰입 플래그도 켜지지 않는다", () => {
    for (const path of ["/", "/research", "/research/catalog", "/learn", "/discover", "/community"]) {
      const decision = decide(path);
      expect(decision.immersiveVirtualExperience, path).toBe(false);
      expect(decision.immersiveVirtualHome, path).toBe(false);
    }
  });
});
