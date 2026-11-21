// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HorizontalScrollController } from "@/shared/lib/horizontal-scroll-ergonomics";

import { HorizontalScrollRail } from "./HorizontalScrollRail";

function mockHorizontalOverflow(
  element: HTMLElement,
  config: { scrollWidth: number; clientWidth: number; scrollLeft?: number; scrollHeight?: number; clientHeight?: number },
): void {
  let left = config.scrollLeft ?? 0;
  Object.defineProperty(element, "scrollWidth", { configurable: true, value: config.scrollWidth });
  Object.defineProperty(element, "clientWidth", { configurable: true, value: config.clientWidth });
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: config.scrollHeight ?? 100 });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: config.clientHeight ?? 100 });
  Object.defineProperty(element, "scrollLeft", {
    configurable: true,
    get: () => left,
    set: (value: number) => {
      left = value;
    },
  });
  element.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    if (typeof options === "object" && typeof options.left === "number") {
      left = options.left;
      fireEvent.scroll(element);
    }
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HorizontalScrollRail", () => {
  it("가로 오버플로가 없으면 스텝 버튼·진행 바·마우스 힌트를 숨긴다", () => {
    render(
      <HorizontalScrollRail ariaLabel="테스트 레일" trackTestId="rail-track">
        <div>짧은 항목</div>
      </HorizontalScrollRail>,
    );
    expect(screen.getByRole("region", { name: "테스트 레일" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /이전 항목/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /다음 항목/ })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("가로 오버플로가 생기면 좌우 44px 스텝 버튼·동적 페이드 마스크·진행 바·마우스 힌트를 표시한다", () => {
    render(
      <HorizontalScrollRail
        ariaLabel="소재 가로 레일"
        prevLabel="이전 카드"
        nextLabel="다음 카드"
        hintText="마우스 휠로 가로 이동"
        trackTestId="rail-track"
      >
        <div>카드 A</div>
        <div>카드 B</div>
      </HorizontalScrollRail>,
    );

    const track = screen.getByTestId("rail-track");
    mockHorizontalOverflow(track, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    fireEvent(window, new Event("resize"));

    const prevButton = screen.getByRole("button", { name: "이전 카드" }) as HTMLButtonElement;
    const nextButton = screen.getByRole("button", { name: "다음 카드" }) as HTMLButtonElement;
    expect(prevButton.disabled).toBe(true);
    expect(prevButton.getAttribute("data-edge-hidden")).toBe("true");
    expect(nextButton.disabled).toBe(false);
    expect(nextButton.getAttribute("data-edge-hidden")).toBe("false");

    const viewport = track.parentElement as HTMLElement;
    expect(viewport.getAttribute("data-fade-left")).toBe("false");
    expect(viewport.getAttribute("data-fade-right")).toBe("true");

    expect(screen.getByLabelText("마우스 휠로 가로 이동")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "가로 스크롤 진행 위치" }).getAttribute("aria-valuenow")).toBe("0");

    fireEvent.click(nextButton);
    expect(track.scrollLeft).toBeGreaterThan(0);
    expect(prevButton.disabled).toBe(false);
    expect(viewport.getAttribute("data-fade-left")).toBe("true");
  });

  it("슬림 가로 진행 바 클릭과 키보드로 원하는 위치로 점프한다", () => {
    render(
      <HorizontalScrollRail ariaLabel="진행 바 테스트" trackTestId="rail-track">
        <div>항목</div>
      </HorizontalScrollRail>,
    );

    const track = screen.getByTestId("rail-track");
    mockHorizontalOverflow(track, { scrollWidth: 1000, clientWidth: 200, scrollLeft: 0 });
    fireEvent(window, new Event("resize"));

    const slider = screen.getByRole("slider", { name: "가로 스크롤 진행 위치" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      left: 100,
      top: 0,
      right: 300,
      bottom: 24,
      width: 200,
      height: 24,
      toJSON: () => ({}),
    });

    fireEvent.click(slider, { clientX: 200 }); // 50% 지점 → 400px
    expect(track.scrollLeft).toBe(400);
    expect(slider.getAttribute("aria-valuenow")).toBe("50");

    fireEvent.keyDown(slider, { key: "End" });
    expect(track.scrollLeft).toBe(800);
    expect(slider.getAttribute("aria-valuenow")).toBe("100");

    fireEvent.keyDown(slider, { key: "Home" });
    expect(track.scrollLeft).toBe(0);
    expect(slider.getAttribute("aria-valuenow")).toBe("0");
  });

  it("트랙 위에서 일반 마우스 세로 휠을 돌리면 가로로 이동한다", () => {
    render(
      <HorizontalScrollRail ariaLabel="휠 테스트" trackTestId="rail-track">
        <div>아이템</div>
      </HorizontalScrollRail>,
    );
    const track = screen.getByTestId("rail-track");
    mockHorizontalOverflow(track, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    fireEvent(window, new Event("resize"));

    const wheelEvent = new WheelEvent("wheel", { deltaY: 160, cancelable: true });
    track.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(track.scrollLeft).toBe(160);
  });

  it("header 배치 모드와 keepButtonsMounted·onControllerReady를 지원한다", () => {
    let exposedController: HorizontalScrollController | null = null;
    render(
      <HorizontalScrollRail
        ariaLabel="헤더 제어 레일"
        controlsPlacement="header"
        keepButtonsMounted
        prevLabel="이전 묶음"
        nextLabel="다음 묶음"
        headerSlot={<h3>추천 묶음</h3>}
        trackTestId="rail-track"
        onControllerReady={(controller) => {
          exposedController = controller;
        }}
      >
        <div>묶음 1</div>
      </HorizontalScrollRail>,
    );

    expect(screen.getByRole("heading", { name: "추천 묶음" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이전 묶음" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음 묶음" })).toBeTruthy();
    const controller = exposedController as HorizontalScrollController | null;
    expect(controller).not.toBeNull();
    if (!controller) return;

    const track = screen.getByTestId("rail-track");
    mockHorizontalOverflow(track, { scrollWidth: 1000, clientWidth: 300, scrollLeft: 0 });
    controller.measure();
    controller.scrollToEdge("end");
    expect(track.scrollLeft).toBe(700);
  });

  it("트랙에서 키보드 화살표·Home·End 탐색이 동작한다", () => {
    render(
      <HorizontalScrollRail ariaLabel="키보드 레일" trackTestId="rail-track">
        <div>카드</div>
      </HorizontalScrollRail>,
    );
    const track = screen.getByTestId("rail-track");
    mockHorizontalOverflow(track, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    fireEvent(window, new Event("resize"));

    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(track.scrollLeft).toBe(312);
    fireEvent.keyDown(track, { key: "End" });
    expect(track.scrollLeft).toBe(800);
    fireEvent.keyDown(track, { key: "Home" });
    expect(track.scrollLeft).toBe(0);
  });

  it("horizontal-scroll-rail.css는 원시 HEX·transition-all 0건과 모바일 터치·44px 타깃 규약을 지킨다", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/shared/components/horizontal-scroll-rail.css"),
      "utf8",
    );
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/gu)).toBeNull();
    expect(css).not.toContain("transition-all");
    expect(css).toContain("touch-action: pan-x pinch-zoom");
    expect(css).toContain("overscroll-behavior-x: contain");
    expect(css).toContain("min-width: 2.75rem");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
