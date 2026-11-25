// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COMIC_INTRO_ART_URL } from "./comic-intro-art";
import { ComicIntro } from "./ComicIntro";
import { ComicIntroHost } from "./ComicIntroHost";

const SEEN_KEY = "toonstudio-comic-intro-seen-v1";

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ComicIntro", () => {
  it("건너뛰기 버튼을 누르면 바로 끝난다", () => {
    const onDone = vi.fn();
    render(<ComicIntro variant="full" onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("ESC를 누르면 페이드아웃 뒤 끝난다", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ComicIntro variant="full" onDone={onDone} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("풀 버전은 2.45초가 지나면 저절로 끝난다", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ComicIntro variant="full" onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(2449);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("짧은 버전은 장면이 완성될 시간을 보장하고 1.85초에 끝난다", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ComicIntro variant="short" onDone={onDone} />);
    // 예전 1초 버전은 로고 등장(1.02초)보다 먼저 사라져 깜빡임만 남았다.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(849);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("페이드 시작 시각을 CSS 변수로 넘겨 JS 타이머와 CSS가 어긋나지 않는다", () => {
    const { unmount } = render(<ComicIntro variant="full" onDone={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "인트로" }).getAttribute("style")).toContain(
      "--ci-leave-delay: 2200ms",
    );
    unmount();
    render(<ComicIntro variant="short" onDone={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "인트로" }).getAttribute("style")).toContain(
      "--ci-leave-delay: 1600ms",
    );
  });

  it("가운데 컷은 키비주얼 이미지가 채우고 예전 선화 캐릭터는 없다", () => {
    const { container } = render(<ComicIntro variant="full" onDone={vi.fn()} />);
    const art = container.querySelector<HTMLImageElement>(".comic-panel-art");
    expect(art).not.toBeNull();
    expect(art?.getAttribute("src")).toBe(COMIC_INTRO_ART_URL);
    expect(art?.getAttribute("alt")).toBe("");
    expect(container.querySelector(".comic-character")).toBeNull();
  });

  it("첫 번째 컷은 수제 펜촉 주얼 엠블럼을 장식으로 배치하고 기존 캡션을 유지한다", () => {
    const { container } = render(<ComicIntro variant="full" onDone={vi.fn()} />);
    const panelOne = container.querySelector(".comic-panel--one");
    const emblem = panelOne?.querySelector<HTMLImageElement>(".comic-panel-emblem");
    expect(emblem).not.toBeNull();
    expect(emblem?.getAttribute("src")).toBe("/assets/atelier/jewels/jewel-drawing-nib.webp");
    expect(emblem?.getAttribute("alt")).toBe("");
    expect(emblem?.getAttribute("aria-hidden")).toBe("true");
    expect(emblem?.getAttribute("decoding")).toBe("async");
    expect(emblem?.getAttribute("draggable")).toBe("false");
    expect(panelOne?.textContent).toContain("오늘은 어떤 이야기를");
  });

  it("세 번째 컷은 노을 도심 웹툰 배경과 어두운 비네트를 집중선·로고 뒤에 레이어링한다", () => {
    const { container } = render(<ComicIntro variant="full" onDone={vi.fn()} />);
    const panelThree = container.querySelector(".comic-panel--three");
    const backdrop = panelThree?.querySelector<HTMLImageElement>(".comic-panel-backdrop");
    const vignette = panelThree?.querySelector(".comic-panel-vignette");
    const speedlines = panelThree?.querySelector(".comic-speedlines");
    const logo = panelThree?.querySelector(".comic-panel-logo");

    expect(backdrop).not.toBeNull();
    expect(backdrop?.getAttribute("src")).toBe("/assets/atelier/backgrounds/bg-seoul-crosswalk.webp");
    expect(backdrop?.getAttribute("alt")).toBe("");
    expect(backdrop?.getAttribute("aria-hidden")).toBe("true");
    expect(backdrop?.getAttribute("decoding")).toBe("async");
    expect(backdrop?.getAttribute("draggable")).toBe("false");
    expect(vignette).not.toBeNull();
    expect(speedlines).not.toBeNull();
    expect(logo?.textContent).toContain("툰스튜디오");
    expect(logo?.textContent).toContain("에서 시작해요");

    expect((backdrop?.compareDocumentPosition(vignette as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect((vignette?.compareDocumentPosition(speedlines as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect((speedlines?.compareDocumentPosition(logo as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("오프닝 TSX에 원시 색상 리터럴이 없고 실존 아트워크와 CSS 비네트·모션 감소·고대비 계약을 지킨다", () => {
    const tsx = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/domains/marketing/comic-intro/ComicIntro.tsx"),
      "utf8",
    );
    const css = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/domains/marketing/comic-intro/comic-intro.css"),
      "utf8",
    );

    expect(tsx).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/iu);
    expect(existsSync(path.resolve(process.cwd(), "apps/web/public/assets/atelier/jewels/jewel-drawing-nib.webp"))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), "apps/web/public/assets/atelier/backgrounds/bg-seoul-crosswalk.webp"))).toBe(true);
    expect(css).toContain(".comic-panel-backdrop");
    expect(css).toContain(".comic-panel-vignette");
    expect(css).toContain(".comic-panel-emblem");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
  });
});

describe("ComicIntroHost", () => {
  it("처음 방문이면 풀 버전을 띄우고 끝나면 본 것으로 기록한다", async () => {
    render(<ComicIntroHost />);
    const skip = await screen.findByRole("button", { name: "건너뛰기" }, { timeout: 3000 });
    expect(screen.getByRole("dialog", { name: "인트로" }).getAttribute("data-comic-intro")).toBe("full");
    fireEvent.click(skip);
    expect(window.localStorage.getItem(SEEN_KEY)).toBe("1");
    expect(screen.queryByRole("dialog", { name: "인트로" })).toBeNull();
  });

  it("이미 본 사용자에게는 짧은 버전을 띄운다", async () => {
    window.localStorage.setItem(SEEN_KEY, "1");
    render(<ComicIntroHost />);
    await screen.findByRole("button", { name: "건너뛰기" }, { timeout: 3000 });
    expect(screen.getByRole("dialog", { name: "인트로" }).getAttribute("data-comic-intro")).toBe("short");
  });

  it("모션 감소 설정이면 인트로를 띄우지 않는다", async () => {
    mockReducedMotion(true);
    render(<ComicIntroHost />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog", { name: "인트로" })).toBeNull();
  });

  it("같은 세션에서는 인트로를 끝낸 뒤 다시 마운트돼도 띄우지 않는다", async () => {
    const first = render(<ComicIntroHost />);
    const skip = await screen.findByRole("button", { name: "건너뛰기" }, { timeout: 3000 });
    fireEvent.click(skip);
    first.unmount();
    render(<ComicIntroHost />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog", { name: "인트로" })).toBeNull();
  });

  it("인트로 도중 화면을 떠나도 같은 세션에서 다시 번쩍이지 않는다", async () => {
    const first = render(<ComicIntroHost />);
    await screen.findByRole("button", { name: "건너뛰기" }, { timeout: 3000 });
    first.unmount();
    render(<ComicIntroHost />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog", { name: "인트로" })).toBeNull();
  });
});
