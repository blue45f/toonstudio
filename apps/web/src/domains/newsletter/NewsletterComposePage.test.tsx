// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { NewsletterComposePage } from "./NewsletterComposePage";
import { useNewsletterStore } from "./newsletter-store";

const authState = vi.hoisted(() => ({ actorId: "author-1" as string | null }));

vi.mock("@/domains/auth/public/session/use-auth-actor-id", () => ({
  useAuthActorId: () => authState.actorId,
}));

const initialI18n = useI18n.getState();

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
  useNewsletterStore.getState().resetForTests();
  authState.actorId = "author-1";
});

afterEach(() => {
  cleanup();
  useI18n.setState(initialI18n);
});

describe("NewsletterComposePage", () => {
  it("REA 캠페인 템플릿·독자 세그먼트 워크벤치를 렌더링하고 양방향 상태를 전환한다", () => {
    render(
      <MemoryRouter>
        <NewsletterComposePage />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("newsletter-compose-rea-openrate-bar");
    expect(bar.textContent).toContain("Substack · Ghost · Beehiiv · Stibee");

    const tplDrop = screen.getByTestId("newsletter-rea-tpl-new-episode-drop");
    const tplSketch = screen.getByTestId("newsletter-rea-tpl-behind-the-scenes-sketch");
    const tplHiatus = screen.getByTestId("newsletter-rea-tpl-hiatus-return-notice");

    expect(tplDrop.getAttribute("aria-pressed")).toBe("true");
    expect(tplSketch.getAttribute("aria-pressed")).toBe("false");
    expect(tplHiatus.getAttribute("aria-pressed")).toBe("false");

    const segAll = screen.getByTestId("newsletter-rea-seg-all-subscribers");
    const segSuperfan = screen.getByTestId("newsletter-rea-seg-superfan-top10pct");
    const segWinback = screen.getByTestId("newsletter-rea-seg-dormant-30d-winback");

    expect(segAll.getAttribute("aria-pressed")).toBe("true");
    expect(segSuperfan.getAttribute("aria-pressed")).toBe("false");
    expect(segWinback.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("newsletter-compose-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("신규 회차 업로드 알림");
    expect(status.textContent).toContain("전체 구독 독자 발송");

    fireEvent.click(tplSketch);
    expect(tplSketch.getAttribute("aria-pressed")).toBe("true");
    expect(tplDrop.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("비하인드 콘티·스케치 노트");

    fireEvent.click(segSuperfan);
    expect(segSuperfan.getAttribute("aria-pressed")).toBe("true");
    expect(segAll.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("상위 10% 열혈 팬 세그먼트");

    fireEvent.click(tplHiatus);
    fireEvent.click(segWinback);
    expect(tplHiatus.getAttribute("aria-pressed")).toBe("true");
    expect(segWinback.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("휴재 복귀·시즌 예고장");
    expect(status.textContent).toContain("30일 미열람 독자 재활성");
  });

  it("영어 로케일(en)에서 REA 워크벤치에 한글이 섞이지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <NewsletterComposePage />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("newsletter-compose-rea-openrate-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("newsletter-rea-tpl-hiatus-return-notice"));
    fireEvent.click(screen.getByTestId("newsletter-rea-seg-dormant-30d-winback"));
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("newsletter-compose-rea-status").textContent).toContain("Hiatus Return Notice");
    expect(screen.getByTestId("newsletter-compose-rea-status").textContent).toContain("30-Day Dormant Winback");
  });
});
