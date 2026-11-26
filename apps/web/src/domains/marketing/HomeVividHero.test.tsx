// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteExperienceContext } from "@/shared/components/site-experience/site-experience-context";
import { useI18n } from "@/shared/lib/i18n";

import { HomeVividHero } from "./HomeVividHero";

let reduced = false;
let changePreference = () => undefined;
let changeVisibility = (_visible: boolean) => undefined;
const disconnect = vi.fn();
const initialLanguage = useI18n.getState().lang;

class VisibleHeroObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0.08];
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    changeVisibility = (visible: boolean) => {
      const bounds = target.getBoundingClientRect();
      this.callback([{
        target, time: performance.now(), rootBounds: null, boundingClientRect: bounds,
        intersectionRect: bounds, intersectionRatio: visible ? 1 : 0, isIntersecting: visible,
      }], this);
      return undefined;
    };
    changeVisibility(true);
  }
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
  disconnect() { disconnect(); }
}

beforeEach(() => {
  reduced = false;
  disconnect.mockClear();
  useI18n.setState({ lang: "ko" });
  vi.stubGlobal("IntersectionObserver", VisibleHeroObserver);
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return reduced; },
    addEventListener: (_type: string, listener: () => undefined) => { changePreference = listener; },
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = () => render(<MemoryRouter><HomeVividHero /></MemoryRouter>);
const motionState = () => document.querySelector("[data-hero-motion]")?.getAttribute("data-motion");

describe("홈 히어로의 실제 모션 설정과 가시성", () => {
  it("화면 밖에서 멈추고 돌아와도 사용자가 선택한 일시정지를 보존한다", () => {
    const result = mount();
    expect(motionState()).toBe("playing");
    act(() => changeVisibility(false));
    expect(motionState()).toBe("paused");
    act(() => changeVisibility(true));
    expect(motionState()).toBe("playing");
    fireEvent.click(screen.getByRole("button", { name: "움직임 멈추기" }));
    act(() => changeVisibility(false));
    act(() => changeVisibility(true));
    expect(motionState()).toBe("paused");
    expect(screen.getByRole("button", { name: "움직임 재생", pressed: true })).toBeTruthy();
    expect(screen.getByRole("link", { name: "작품 시작하기" }).getAttribute("href")).toBe("/create");
    result.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("다른 탭으로 이동하면 멈추고 돌아오면 재생한다", () => {
    mount();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(motionState()).toBe("paused");
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(motionState()).toBe("playing");
  });

  it("운영체제 모션 감소 변경을 즉시 적용하고 재생 버튼으로 우회하지 않는다", () => {
    mount();
    reduced = true;
    act(() => changePreference());
    expect(motionState()).toBe("paused");
    expect(screen.queryByRole("button", { name: /움직임/u })).toBeNull();
    reduced = false;
    act(() => changePreference());
    expect(motionState()).toBe("playing");
    expect(screen.getByRole("button", { name: "움직임 멈추기" })).toBeTruthy();
  });

  it("사이트의 차분한 화면 선택을 존중한다", () => {
    render(<MemoryRouter><SiteExperienceContext.Provider value={{ mode: "calm", setMode: vi.fn() }}><HomeVividHero /></SiteExperienceContext.Provider></MemoryRouter>);
    expect(motionState()).toBe("paused");
    expect(screen.queryByRole("button", { name: /움직임/u })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
