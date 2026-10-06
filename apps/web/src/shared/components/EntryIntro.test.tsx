// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ENTRY_INTRO_ART_WAIT_CAP_MS,
  ENTRY_INTRO_FADE_MS,
  ENTRY_INTRO_MIN_HOLD_MS,
  ENTRY_INTRO_READY_HOLD_MS,
  ENTRY_INTRO_REDUCED_HOLD_MS,
  ENTRY_INTRO_SKIP_FADE_MS,
  ENTRY_INTRO_SKIP_GUARD_MS,
  EntryIntro,
} from "./EntryIntro";
import { ENTRY_INTRO_SESSION_KEY } from "./entry-intro-session";

function installMatchMedia(reduced: boolean) {
  const mql = {
    matches: reduced,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return mql;
}

/** 배경 아트 <img>를 찾는다(마크 이미지와 구분되는 인트로 전용 아트). */
function artImage(container: HTMLElement): HTMLImageElement {
  const img = container.querySelector<HTMLImageElement>(
    'img[src*="hero-main-intro"]',
  );
  if (!img) throw new Error("인트로 배경 아트 이미지를 찾지 못했다");
  return img;
}

/**
 * 아트가 아직 도착하지 않은 상태를 강제한다. jsdom은 이미지를 실제로
 * 네트워크로 받지 않아 complete가 환경마다 다르게 잡힐 수 있어, load
 * 이벤트 경로만으로 타이밍을 검증할 수 있게 명시적으로 고정한다.
 */
function stubArtIncomplete() {
  return vi
    .spyOn(HTMLImageElement.prototype, "complete", "get")
    .mockReturnValue(false);
}

describe("EntryIntro", () => {
  beforeEach(() => {
    sessionStorage.clear();
    installMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("첫 방문이면 현행 워드마크와 태그라인을 그리고 세션에 본 것으로 기록한다", () => {
    const { container } = render(<EntryIntro />);

    expect(container.textContent).toContain("Toon");
    expect(container.textContent).toContain("Studio");
    expect(container.textContent).toContain("Stories Come to Life");
    // 구 브랜드 표기가 남아 있지 않다.
    expect(container.textContent).not.toContain("SPECTRUM");
    expect(container.textContent).not.toContain("Beta Service");
    expect(sessionStorage.getItem(ENTRY_INTRO_SESSION_KEY)).toBe("true");
  });

  it("이미 본 세션에서는 인트로를 렌더링하지 않는다", () => {
    sessionStorage.setItem(ENTRY_INTRO_SESSION_KEY, "true");

    const { container } = render(<EntryIntro />);

    expect(container.firstChild).toBeNull();
  });

  it("sessionStorage가 차단돼도 인트로가 앱 진입을 막지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { container } = render(<EntryIntro />);

    expect(container.firstChild).toBeNull();
  });

  it("본 세션의 SSR 마크업은 비어 있다(본문이 먼저 그려진다)", () => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => "true", setItem: () => undefined },
    });

    expect(renderToStaticMarkup(createElement(EntryIntro))).toBe("");
  });

  it("전체 길이가 3.2~3.8초 구간 안에 있고 끝나면 완전히 사라진다", () => {
    // 계약 교체(2026-10-07): 구 계약(유지 2350 + 페이드 550 = 2.9초, 2.6~3.2초
    // 구간)은 배경 아트 도착이 늦으면 완성 장면이 잠깐만 보이고 사라져 깜빡임만
    // 느껴진다는 사용자 보고로 폐기했다. 유지 시계를 마운트가 아니라 아트 준비
    // 완료부터 재고, 총 길이가 3200~3800ms 구간 안에 있다는 하한+상한 계약으로
    // 대체한다. 단언을 지우거나 완화한 것이 아니다.
    const totalMs = ENTRY_INTRO_MIN_HOLD_MS + ENTRY_INTRO_FADE_MS;
    expect(totalMs).toBeGreaterThanOrEqual(3200);
    expect(totalMs).toBeLessThanOrEqual(3800);
    vi.useFakeTimers();

    const { container } = render(<EntryIntro />);
    expect(container.firstChild).not.toBeNull();

    // 아트가 준비된 시점부터 완성 카드 유지가 보장되고, 최소 유지가 끝나면
    // 페이드 단계로 넘어간다 — 아직 DOM에 있다.
    fireEvent.load(artImage(container));
    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_MIN_HOLD_MS);
    });
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_FADE_MS);
    });
    expect(container.firstChild).toBeNull();
  });

  it("아트 load가 오기 전에는 페이드가 시작되지 않는다", () => {
    stubArtIncomplete();
    vi.useFakeTimers();
    const { container } = render(<EntryIntro />);

    // 폴백 상한 직전까지는 아트 미준비라 페이드 스케줄 자체가 걸리지 않는다.
    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_ART_WAIT_CAP_MS - 1);
    });
    expect(container.querySelector("[data-phase='show']")).not.toBeNull();
    expect(container.querySelector("[data-phase='fade']")).toBeNull();

    // 상한 직전 load가 도착하면 그 시점부터 완성 카드 유지를 재되, 페이드는
    // 최소 유지(마운트 + MIN_HOLD)를 채운 뒤에 시작한다.
    fireEvent.load(artImage(container));
    act(() => {
      vi.advanceTimersByTime(
        ENTRY_INTRO_MIN_HOLD_MS - ENTRY_INTRO_ART_WAIT_CAP_MS,
      );
    });
    expect(container.querySelector("[data-phase='show']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();
  });

  it("아트가 끝내 로드되지 않아도 폴백 상한 뒤에는 예정대로 끝난다", () => {
    stubArtIncomplete();
    vi.useFakeTimers();
    const { container } = render(<EntryIntro />);

    // load를 끝내 발생시키지 않는다. 상한이 지나면 준비된 것으로 쳐서
    // 시계가 시작되고, 최소 유지 뒤 페이드 → 완전히 사라진다.
    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_ART_WAIT_CAP_MS);
    });
    expect(container.querySelector("[data-phase='show']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(
        ENTRY_INTRO_MIN_HOLD_MS - ENTRY_INTRO_ART_WAIT_CAP_MS - 1,
      );
    });
    expect(container.querySelector("[data-phase='show']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_FADE_MS);
    });
    expect(container.firstChild).toBeNull();
  });

  it("아트가 즉시 준비돼도 최소 유지 시간 전에는 페이드하지 않는다", () => {
    stubArtIncomplete();
    vi.useFakeTimers();
    const { container } = render(<EntryIntro />);

    fireEvent.load(artImage(container));
    // 준비 + READY_HOLD만으로는 부족하다 — max()의 마운트 기준 하한이 이긴다.
    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_READY_HOLD_MS);
    });
    expect(container.querySelector("[data-phase='show']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_MIN_HOLD_MS - ENTRY_INTRO_READY_HOLD_MS);
    });
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();
  });

  it("키 입력으로 건너뛰고, 원래 유지 시간이 지나도 다시 나타나지 않는다", () => {
    vi.useFakeTimers();
    const { container } = render(<EntryIntro />);

    // 스킵 보호 구간이 지난 뒤의 입력부터 스킵으로 인정된다.
    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_SKIP_GUARD_MS);
    });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_SKIP_FADE_MS);
    });
    expect(container.firstChild).toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_MIN_HOLD_MS + ENTRY_INTRO_FADE_MS);
    });
    expect(container.firstChild).toBeNull();
  });

  it("포인터 입력으로도 건너뛴다", () => {
    vi.useFakeTimers();
    const { container } = render(<EntryIntro />);

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_SKIP_GUARD_MS);
    });
    fireEvent.pointerDown(window);
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_SKIP_FADE_MS);
    });
    expect(container.firstChild).toBeNull();
  });

  it("마운트 직후 보호 구간 안의 입력은 우발 입력으로 보고 건너뛰지 않는다", () => {
    vi.useFakeTimers();
    const { container } = render(<EntryIntro />);

    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.pointerDown(window);
    // 보호 구간 안에서는 페이드로 넘어가지 않고 표시 단계를 유지한다.
    expect(container.querySelector("[data-phase='show']")).not.toBeNull();
    expect(container.querySelector("[data-phase='fade']")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_SKIP_GUARD_MS);
    });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();
  });

  it("prefers-reduced-motion에서는 정적 카드를 짧게만 보여주고 세션을 기록한다", () => {
    installMatchMedia(true);
    vi.useFakeTimers();

    const { container } = render(<EntryIntro />);
    expect(container.firstChild).not.toBeNull();
    expect(sessionStorage.getItem(ENTRY_INTRO_SESSION_KEY)).toBe("true");

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_REDUCED_HOLD_MS - 1);
    });
    expect(container.firstChild).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.firstChild).toBeNull();
  });

  it("once=false면 이미 본 세션에서도 마운트마다 그린다", () => {
    sessionStorage.setItem(ENTRY_INTRO_SESSION_KEY, "true");

    const { container } = render(<EntryIntro once={false} />);

    expect(container.firstChild).not.toBeNull();
  });
});

describe("EntryIntro 소스 계약", () => {
  it("Three.js·랜덤 선택 없이 CSS 연출만 쓰고 본문 입력을 막지 않는다", () => {
    const tsx = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/shared/components/EntryIntro.tsx"),
      "utf8",
    );
    const css = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/shared/components/EntryIntro.module.css"),
      "utf8",
    );

    expect(tsx).not.toContain("three");
    expect(tsx).not.toContain("Math.random");
    expect(tsx).not.toContain("RandomIntro");
    expect(tsx).not.toContain("SplashScreen");
    expect(tsx).not.toContain("IntroSplash");
    expect(css).toContain("pointer-events: none");
    // 브랜드 마크는 저해상도 PNG가 아니라 벡터 원본을, 아트는 인트로 전용
    // 고품질 인코딩을 쓴다(공유 hero-main.webp는 홈이 그대로 쓴다).
    expect(tsx).toContain("/brand/spectrum-ribbon-v2/favicon.svg");
    expect(tsx).not.toContain("icon-192.png");
    expect(tsx).toContain("/images/hero-main-intro.webp");
  });
});
