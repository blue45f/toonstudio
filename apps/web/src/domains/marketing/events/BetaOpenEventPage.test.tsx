// @vitest-environment jsdom

import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BetaOpenEventPage } from "./BetaOpenEventPage";

const session = {
  data: null,
  ready: false,
  status: "unauthenticated" as "authenticated" | "unauthenticated",
  update: async () => null,
};

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => session,
}));

afterEach(cleanup);

describe("BetaOpenEventPage 세션 판정 중 CTA", () => {
  it("세션 판정이 끝나기 전에는 회원가입 CTA 대신 확인 중 표시를 보여준다", () => {
    session.ready = false;
    session.status = "unauthenticated";
    render(
      <MemoryRouter>
        <BetaOpenEventPage />
      </MemoryRouter>,
    );
    // 하단 마감 섹션도 같은 게이트를 지켜야 한다 — 판정 전에 가입 버튼이 노출되면
    // 이미 로그인한 사용자에게 가입 모달이 뜬다. 확인 중 표시는 상·하단 2곳이다.
    expect(screen.getAllByText(/로그인 상태 확인 중/).length).toBe(2);
    expect(screen.queryByRole("button", { name: /가입하고/ })).toBeNull();
  });

  it("판정 후 로그인 상태면 스튜디오 CTA를 보여준다", () => {
    session.ready = true;
    session.status = "authenticated";
    render(
      <MemoryRouter>
        <BetaOpenEventPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/로그인 상태 확인 중/)).toBeNull();
    expect(screen.getAllByRole("link", { name: /바로 시작하기/ }).length).toBeGreaterThan(0);
  });
});

describe("BetaOpenEventPage 캠페인 토큰 (S1-T9)", () => {
  it("페이지 색을 하드코딩 클래스가 아니라 캠페인 토큰 스코프로 건다", () => {
    session.ready = true;
    session.status = "unauthenticated";
    const { container } = render(
      <MemoryRouter>
        <BetaOpenEventPage />
      </MemoryRouter>,
    );
    const root = container.querySelector(".campaign-beta-open");
    expect(root).toBeTruthy();
    // 배경 oklch·글로우 그라디언트 같은 원시 색 리터럴이 마크업에 남아 있으면 안 된다.
    expect(root?.className).not.toContain("oklch");
    expect(container.querySelector(".campaign-beta-open__glow")).toBeTruthy();
  });

  it("캠페인 CSS 토큰 값이 토큰화 이전 하드코딩 색과 같다", () => {
    // vitest는 repo 루트에서 실행하는 것이 정본 — 루트 기준 상대 경로로 읽는다
    // (jsdom 환경에서는 import.meta.url이 file 스킴이 아니다).
    const css = readFileSync(
      "apps/web/src/domains/marketing/events/beta-open-event.css",
      "utf8",
    );
    expect(css).toContain("--campaign-bg: oklch(0.145 0.025 270)");
    expect(css).toContain("--campaign-fg: #fff");
    expect(css).toContain("--campaign-glow-warm: oklch(0.8 0.16 75 / 0.2)");
    expect(css).toContain("--campaign-glow-magenta: oklch(0.72 0.19 318 / 0.18)");
    expect(css).toContain("--campaign-glow-sky: oklch(0.68 0.15 235 / 0.14)");
    // 고대비에서는 글로우를 끄는 규칙이 OS 설정과 앱 토글 양쪽에 있어야 한다.
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toContain(':root[data-contrast="more"] .campaign-beta-open__glow');
  });
});
