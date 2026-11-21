// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IrPresentPage } from "./IrPresentPage";
import { IR_PRESENT_CONTENT_REVISION, isIrNarrationCurrent } from "./ir-present-narration";
import { SCENE_META } from "./ir-present-scene-data";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("./ir-present-scenes-a", () => ({ SCENE_NODES_A: Array.from({ length: 12 }, (_, i) => `장면 ${i + 1}`) }));
vi.mock("./ir-present-scenes-b", () => ({ SCENE_NODES_B: Array.from({ length: 12 }, (_, i) => `장면 ${i + 13}`) }));

const playedSources: (string | null)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  playedSources.length = 0;
  window.history.replaceState(null, "", "/ir/present");
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    playedSources.push(this.getAttribute("src"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("IR 내레이션 문안 검증", () => {
  it("검증 완료와 현재 문안 revision이 모두 맞아야 음성을 허용한다", () => {
    expect(isIrNarrationCurrent()).toBe(false);
    expect(isIrNarrationCurrent({ status: "unverified", contentRevision: IR_PRESENT_CONTENT_REVISION })).toBe(false);
    expect(isIrNarrationCurrent({ status: "verified", contentRevision: "older-copy" })).toBe(false);
    expect(isIrNarrationCurrent({ status: "verified", contentRevision: null })).toBe(false);
    expect(isIrNarrationCurrent({ status: "verified", contentRevision: "" }, "")).toBe(false);
    expect(isIrNarrationCurrent({ status: "verified", contentRevision: IR_PRESENT_CONTENT_REVISION })).toBe(true);
  });

  it("자동 발표와 소리 재활성화에서도 미검증 MP3를 로드하거나 재생하지 않는다", () => {
    const { container } = render(<IrPresentPage />);
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(container.querySelector("audio")?.getAttribute("src")).toContain("product-tour-bgm.m4a");
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    fireEvent.click(screen.getByRole("button", { name: "소리 켜기/끄기 (M)" }));
    fireEvent.click(screen.getByRole("button", { name: "소리 켜기/끄기 (M)" }));
    for (let i = 1; i < SCENE_META.length; i += 1) fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(container.querySelector(".scene.active")?.textContent).toBe("장면 24");
    expect(playedSources.length).toBeGreaterThan(0);
    expect(playedSources.every((source) => source?.includes("product-tour-bgm.m4a"))).toBe(true);
    expect(container.querySelector('[src*="/ir-present/audio/"]')).toBeNull();
    expect(screen.queryByText("내레이션 재생 중")).toBeNull();
    expect(screen.getByText("화면 문안으로 진행")).toBeTruthy();
  });

  it("화면 문안의 체류 시간대로 진행하고 정지하면 다음 씬으로 넘어가지 않는다", () => {
    const { container } = render(<IrPresentPage />);
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    act(() => vi.advanceTimersByTime(SCENE_META[0].dwell * 1000 - 1));
    expect(container.querySelector(".scene.active")?.textContent).toBe("장면 1");
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector(".scene.active")?.textContent).toBe("장면 2");
    fireEvent.click(screen.getByRole("button", { name: "정지" }));
    act(() => vi.advanceTimersByTime(SCENE_META[1].dwell * 1000 + 1));
    expect(container.querySelector(".scene.active")?.textContent).toBe("장면 2");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(container.querySelector(".scene.active")?.textContent).toBe("장면 1");
  });

  it("배경음 토글을 내레이션 검증과 별개로 유지한다", () => {
    render(<IrPresentPage />);
    const bgmButton = screen.getByRole("button", { name: "배경음 켜기/끄기 (B)" });
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    fireEvent.click(bgmButton);
    expect(bgmButton.getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem("ir-present-bgm-on")).toBe("off");
    const playedBefore = playedSources.length;
    fireEvent.click(bgmButton);
    expect(bgmButton.getAttribute("aria-pressed")).toBe("true");
    expect(playedSources).toHaveLength(playedBefore + 1);
    expect(playedSources.at(-1)).toContain("product-tour-bgm.m4a");
  });
});
