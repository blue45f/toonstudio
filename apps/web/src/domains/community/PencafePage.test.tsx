// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";

import { PencafePage } from "./PencafePage";

const mocks = vi.hoisted(() => ({ crashFeed: false }));

vi.mock("./components/fan-cafe-panel", () => ({
  FanCafePanel: () => {
    if (mocks.crashFeed) throw new Error("feed crashed");
    return <div data-testid="fan-cafe-panel" />;
  },
}));

vi.mock("@/shared/components/share-page-button", () => ({
  SharePageButton: (props: {
    path: string;
    text: string;
    label?: string;
    actionLabel?: string;
  }) => (
    <output
      data-testid="share-probe"
      data-path={props.path}
      data-title={props.text}
      data-label={props.label}
      data-action-label={props.actionLabel}
    />
  ),
}));

beforeEach(() => {
  mocks.crashFeed = false;
  useI18n.setState({ lang: "ko" });
});
afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

function renderPage(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/pencafe/:name" element={<PencafePage />} />
        <Route path="/community/pencafe" element={<PencafePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PencafePage", () => {
  it("shares the public fan cafe with an encoded canonical route", async () => {
    renderPage("/pencafe/%EC%9B%B9%ED%88%B0%20%EC%97%B0%EA%B5%AC%ED%9A%8C");

    expect(screen.getByRole("heading", { name: "웹툰 연구회 펜카페" })).toBeTruthy();
    const share = await screen.findByTestId("share-probe");
    expect(share.getAttribute("data-path"))
      .toBe("/pencafe/%EC%9B%B9%ED%88%B0%20%EC%97%B0%EA%B5%AC%ED%9A%8C");
    expect(share.getAttribute("data-title")).toBe("웹툰 연구회 펜카페");
    expect(share.getAttribute("data-label")).toBe("펜카페 공유");
    expect(share.getAttribute("data-action-label")).toBe("펜카페 보기");
  });

  it("shows a page-level error fallback with retry when the feed crashes", async () => {
    mocks.crashFeed = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      renderPage("/pencafe/%EC%9B%B9%ED%88%B0%20%EC%97%B0%EA%B5%AC%ED%9A%8C");

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("펜카페 피드를 불러오지 못했습니다.");
      expect(screen.queryByTestId("fan-cafe-panel")).toBeNull();

      mocks.crashFeed = false;
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
      expect(await screen.findByTestId("fan-cafe-panel")).toBeTruthy();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("REA 팬덤 등급·라이브 워치파티 워크벤치를 44px 터치 타깃으로 렌더링하고 양방향 상태를 전환한다", () => {
    renderPage("/community/pencafe");

    expect(screen.getByRole("link", { name: /창작 쇼케이스/u }).getAttribute("href")).toBe("/showcase");
    expect(screen.getByRole("link", { name: /새 작품 시작/u }).getAttribute("href")).toBe("/create");

    const bar = screen.getByTestId("pencafe-rea-watchparty-bar");
    expect(bar.textContent).toContain("Naver Cafe · Weverse · Discord Stage · Chzzk Watch Party");

    const tierRookie = screen.getByTestId("pencafe-rea-tier-rookie-reader");
    const tierBinge = screen.getByTestId("pencafe-rea-tier-verified-binge-fan");
    const tierPatron = screen.getByTestId("pencafe-rea-tier-patron-inner-circle");
    expect(tierRookie.className).toContain("min-h-11");

    expect(tierRookie.getAttribute("aria-pressed")).toBe("true");
    expect(tierBinge.getAttribute("aria-pressed")).toBe("false");
    expect(tierPatron.getAttribute("aria-pressed")).toBe("false");

    const liveWatch = screen.getByTestId("pencafe-rea-live-episode-watch-party");
    const liveAma = screen.getByTestId("pencafe-rea-live-live-sketch-ama");
    const liveGoods = screen.getByTestId("pencafe-rea-live-goods-group-order");
    expect(liveWatch.className).toContain("min-h-11");

    expect(liveWatch.getAttribute("aria-pressed")).toBe("true");
    expect(liveAma.getAttribute("aria-pressed")).toBe("false");
    expect(liveGoods.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("pencafe-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("신입 독자 라운지");
    expect(status.textContent).toContain("신작 동시감상 워치파티");

    fireEvent.click(tierBinge);
    expect(tierBinge.getAttribute("aria-pressed")).toBe("true");
    expect(tierRookie.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("정주행 인증 팬 등급");

    fireEvent.click(liveAma);
    expect(liveAma.getAttribute("aria-pressed")).toBe("true");
    expect(liveWatch.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("작가 라이브 드로잉 AMA");

    fireEvent.click(tierPatron);
    fireEvent.click(liveGoods);
    expect(tierPatron.getAttribute("aria-pressed")).toBe("true");
    expect(liveGoods.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("후원 멤버십 이너서클");
    expect(status.textContent).toContain("단행본·굿즈 공동구매");
  });

  it("영어 로케일(en)에서 REA 워크벤치와 상단 브리지에 한글이 섞이지 않는다", () => {
    useI18n.setState({ lang: "en" });
    renderPage("/community/pencafe");

    const bar = screen.getByTestId("pencafe-rea-watchparty-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByRole("link", { name: /Creator Showcase/u }).getAttribute("href")).toBe("/showcase");

    fireEvent.click(screen.getByTestId("pencafe-rea-tier-patron-inner-circle"));
    fireEvent.click(screen.getByTestId("pencafe-rea-live-goods-group-order"));
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("pencafe-rea-status").textContent).toContain("Patron Inner Circle");
    expect(screen.getByTestId("pencafe-rea-status").textContent).toContain("Goods Group Order");
  });
});
