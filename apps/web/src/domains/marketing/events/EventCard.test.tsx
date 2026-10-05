// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { EventCard } from "./EventCard";
import { BETA_OPEN_EVENT, type MarketingEvent } from "./event-catalog";

vi.mock("motion/react", () => {
  type TagName = "article" | "div" | "span" | "img" | "p";
  function strip(tag: TagName) {
    return function MockMotionElement(props: {
      children?: ReactNode;
      [key: string]: unknown;
    }) {
      const {
        children,
        initial,
        animate,
        transition,
        variants,
        viewport,
        whileInView,
        whileHover,
        custom,
        style,
        ...rest
      } = props;
      void initial;
      void animate;
      void transition;
      void variants;
      void viewport;
      void whileInView;
      void whileHover;
      void custom;
      void style;
      const Tag = tag as "div";
      return <Tag {...rest}>{children}</Tag>;
    };
  }
  return {
    motion: {
      article: strip("article"),
      div: strip("div"),
      span: strip("span"),
      img: strip("img"),
      p: strip("p"),
    },
    useReducedMotion: () => false,
  };
});

afterEach(cleanup);

const DAY_MS = 86_400_000;

function makeEvent(overrides: Partial<MarketingEvent>): MarketingEvent {
  return {
    ...BETA_OPEN_EVENT,
    id: "test-event",
    slug: "test-event",
    startsAt: "2026-01-01T00:00:00+09:00",
    ...overrides,
  };
}

function renderCard(event: MarketingEvent) {
  render(
    <MemoryRouter>
      <EventCard event={event} />
    </MemoryRouter>,
  );
}

describe("EventCard", () => {
  it("이벤트 제목·상태 칩·상세 링크를 렌더한다", () => {
    renderCard(BETA_OPEN_EVENT);
    expect(
      screen.getByRole("heading", {
        name: "지금 가입하면, 최대 1년 동안 전부 무료.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("진행 중")).toBeTruthy();
    const link = document.querySelector('a[href="/events/beta-open"]');
    expect(link).not.toBeNull();
    expect(screen.getByText("이벤트 보기")).toBeTruthy();
  });

  it("endsAt이 없으면 카운트다운 배지 대신 종료일 미정 안내를 보여준다", () => {
    renderCard(BETA_OPEN_EVENT);
    // 같은 안내가 타일 위 배지와 기간 행 끝에 함께 나온다.
    expect(screen.getAllByText("종료일 추후 안내").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^D-/)).toBeNull();
  });

  it("마감 임박 이벤트에는 글로우 D-day 배지를 보여준다", () => {
    renderCard(
      makeEvent({ endsAt: new Date(Date.now() + 2.5 * DAY_MS).toISOString() }),
    );
    const badge = screen.getByText("D-2");
    // 색은 테마 토큰(경고색)만 쓴다. 고정 주황색으로 되돌아가지 않게 확인한다.
    expect(badge.className).toContain("bg-warn");
    expect(badge.className).toContain("shadow-[0_0_20px_3px_var(--color-warning-soft)]");
    expect(badge.className).not.toContain("orange");
  });

  it("마감 당일에는 D-day 배지를 보여준다", () => {
    renderCard(
      makeEvent({ endsAt: new Date(Date.now() + 12 * 3_600_000).toISOString() }),
    );
    expect(screen.getByText("D-day")).toBeTruthy();
  });

  it("여유 있는 마감에는 글로우 없는 D-day 배지를 보여준다", () => {
    renderCard(
      makeEvent({ endsAt: new Date(Date.now() + 10.5 * DAY_MS).toISOString() }),
    );
    const badge = screen.getByText("D-10");
    expect(badge.className).not.toContain("bg-warn");
  });

  it("이벤트 자체 아트를 타일에 렌더한다", () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={BETA_OPEN_EVENT} />
      </MemoryRouter>,
    );
    const img = container.querySelector("img");
    // 베타 오픈 상세 페이지 히어로와 같은 자체 아트다. 공용 섹션 이미지로
    // 되돌아가면 이 단언이 깨진다.
    expect(img?.getAttribute("src")).toBe("/images/hero-studio.webp");
  });

  it("자체 아트가 없는 이벤트는 공용 이미지 대신 타이포그래픽 커버를 쓴다", () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={makeEvent({ image: null })} />
      </MemoryRouter>,
    );
    expect(container.querySelector("img")).toBeNull();
    // 커버 글리프는 제목 첫 글자다 (aria-hidden 장식이라 텍스트로 찾는다).
    expect(container.textContent).toContain("지");
  });

  it("자체 아트 로드에 실패하면 타이포그래픽 커버로 떨어진다", () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={BETA_OPEN_EVENT} />
      </MemoryRouter>,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("지");
  });

  it("기간 행에 시작일을 time 요소로 표시한다", () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={BETA_OPEN_EVENT} />
      </MemoryRouter>,
    );
    const start = container.querySelector(
      'time[datetime="2026-09-18T00:00:00+09:00"]',
    );
    expect(start).not.toBeNull();
    expect(start?.textContent).toContain("2026");
    // 종료일이 없으면 기간 행도 추후 안내로 끝난다 (배지의 안내와 별개로 존재).
    expect(screen.getAllByText("종료일 추후 안내").length).toBeGreaterThanOrEqual(2);
  });

  it("종료일이 있으면 기간 행에 시작–종료 범위를 표시한다", () => {
    const endsAt = "2026-12-31T23:59:59+09:00";
    const { container } = render(
      <MemoryRouter>
        <EventCard event={makeEvent({ endsAt })} />
      </MemoryRouter>,
    );
    expect(
      container.querySelector(`time[datetime="${endsAt}"]`),
    ).not.toBeNull();
  });
});
