// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { PromoClipPlayer } from "./PromoClipPlayer";

const FIRST = "/brand/promo-shorts/shorts-1-drawing-autocolor.mp4";
const FIRST_PLAYBACK = "/brand/promo-shorts/compat/shorts-1-drawing-autocolor.mp4";
const SECOND = "/brand/promo-shorts/shorts-3-serial-deadline.mp4";
const clip = { src: FIRST, title: "그리고, 색까지", width: 768, height: 1344 };
let paused: WeakMap<HTMLMediaElement, boolean>;

beforeEach(() => {
  useI18n.getState().setLang("ko");
  paused = new WeakMap();
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (this: HTMLMediaElement) {
    return paused.get(this) ?? true;
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    paused.set(this, true);
    fireEvent.pause(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    paused.set(this, false);
    fireEvent.play(this);
    return Promise.resolve();
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function player(container: HTMLElement) {
  const video = container.querySelector("video");
  if (!video) throw new Error("video missing");
  return video;
}

describe("PromoClipPlayer", () => {
  it("명시적 재생 전에는 원본을 요청하지 않고 포스터만 지연 로딩한다", () => {
    const { container } = render(<PromoClipPlayer {...clip} poster="/brand/promo-shorts/posters/first.webp" />);
    const video = player(container);
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.preload).toBe("none");
    expect(video.autoplay).toBe(false);
    expect(video.loop).toBe(false);
    expect(video.tabIndex).toBe(-1);
    expect(video.getAttribute("poster")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("lazy");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "그리고, 색까지 · 재생" })).toBeTruthy();
  });

  it("같은 사용자 이벤트 안에서 소스 연결과 native play를 실행하고 초점을 넘긴다", () => {
    let gestureActive = false;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (this: HTMLMediaElement) {
      expect(gestureActive).toBe(true);
      expect(this.getAttribute("src")).toBe(FIRST_PLAYBACK);
      paused.set(this, false);
      return Promise.resolve();
    });
    const { container } = render(<PromoClipPlayer {...clip} />);
    gestureActive = true;
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    gestureActive = false;
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild?.getAttribute("data-original-src")).toBe(FIRST);
    expect(container.firstElementChild?.getAttribute("data-variant")).toBe("compatible");
    expect(document.activeElement).toBe(player(container));
    expect(container.firstElementChild?.getAttribute("data-promo-clip-state")).toBe("loading");
  });

  it("포스터 실패가 영상이나 재생 진입을 숨기지 않는다", () => {
    const { container } = render(<PromoClipPlayer {...clip} poster="/brand/promo-shorts/posters/first.webp" />);
    const image = container.querySelector("img");
    if (!image) throw new Error("poster missing");
    fireEvent.error(image);
    expect(screen.getByText("미리보기를 불러오지 못했어요. 재생을 눌러 확인해 주세요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "그리고, 색까지 · 재생" })).toBeTruthy();
    expect(player(container).hasAttribute("src")).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("다른 영상을 고르면 앞 영상을 멈추고 src를 해제하면서 목록 두 개를 유지한다", () => {
    const { container } = render(<><PromoClipPlayer {...clip} /><PromoClipPlayer {...clip} src={SECOND} title="마감 관리" /></>);
    const videos = container.querySelectorAll("video");
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    expect(videos[0]?.getAttribute("src")).toBe(FIRST_PLAYBACK);
    fireEvent.click(screen.getByRole("button", { name: "마감 관리 · 재생" }));
    expect(videos[0]?.hasAttribute("src")).toBe(false);
    expect(videos[1]?.getAttribute("src")).toBe(SECOND);
    expect(videos[1]?.parentElement?.getAttribute("data-variant")).toBe("original");
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(container.querySelectorAll("video[src]")).toHaveLength(1);
    expect(container.querySelectorAll("video")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "그리고, 색까지 · 재생" })).toBeTruthy();
    fireEvent.playing(videos.item(0));
    expect(screen.getByRole("button", { name: "그리고, 색까지 · 재생" })).toBeTruthy();
  });

  it("실제 MediaError를 표시하고 재시도에서 같은 원본과 native 재생 초점을 유지한다", () => {
    const { container } = render(<PromoClipPlayer {...clip} />);
    const video = player(container);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    Object.defineProperty(video, "error", { configurable: true, value: { code: 3, message: "decode failed" } });
    fireEvent.error(video);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("영상을 재생하지 못했어요");
    const retry = within(alert).getByRole("button", { name: "다시 재생" });
    expect(document.activeElement).toBe(retry);
    const original = within(alert).getByRole("link", { name: "원본 열기" });
    expect(original.getAttribute("href")).toBe(FIRST);
    expect(original.getAttribute("target")).toBe("_blank");
    expect(original.getAttribute("rel")).toContain("noopener");
    fireEvent.click(retry);
    expect(video.getAttribute("src")).toBe(FIRST_PLAYBACK);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(video);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it("다른 UI로 옮긴 초점을 늦은 재생 오류가 빼앗지 않는다", () => {
    const { container } = render(<><PromoClipPlayer {...clip} /><button type="button">목록 필터</button></>);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    const filter = screen.getByRole("button", { name: "목록 필터" });
    filter.focus();
    const video = player(container);
    Object.defineProperty(video, "error", { configurable: true, value: { code: 2, message: "network failed" } });
    fireEvent.error(video);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(filter);
  });

  it("다른 영상 재생을 위해 소스를 해제해도 앞 카드의 실패와 재시도는 남긴다", () => {
    const { container } = render(<><PromoClipPlayer {...clip} /><PromoClipPlayer {...clip} src={SECOND} title="마감 관리" /></>);
    const first = container.querySelectorAll("video").item(0);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    Object.defineProperty(first, "error", { configurable: true, value: { code: 2, message: "network failed" } });
    fireEvent.error(first);
    fireEvent.click(screen.getByRole("button", { name: "마감 관리 · 재생" }));
    expect(first.hasAttribute("src")).toBe(false);
    expect(container.querySelectorAll("video[src]")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("영상을 재생하지 못했어요");
    expect(screen.getByRole("button", { name: "다시 재생" })).toBeTruthy();
    expect(document.activeElement).toBe(container.querySelectorAll("video").item(1));
  });

  it("waiting과 stalled의 긴 대기는 실패와 구분하고 실제 진행이 돌아오면 안내를 거둔다", () => {
    vi.useFakeTimers();
    const { container } = render(<PromoClipPlayer {...clip} />);
    const video = player(container);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    fireEvent.waiting(video);
    fireEvent.stalled(video);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => vi.advanceTimersByTime(12_001));
    expect(screen.getByText("재생을 기다리고 있어요")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    video.currentTime = 0.5;
    fireEvent.timeUpdate(video);
    expect(screen.queryByText("재생을 기다리고 있어요")).toBeNull();
    expect(container.firstElementChild?.getAttribute("data-promo-clip-state")).toBe("playing");
  });

  it("loading 중 다시 재생해도 두 번째 장기 대기의 복구 동작을 계속 제공한다", () => {
    vi.useFakeTimers();
    render(<PromoClipPlayer {...clip} />);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    act(() => vi.advanceTimersByTime(12_001));
    fireEvent.click(screen.getByRole("button", { name: "다시 재생" }));
    expect(screen.queryByText("재생을 기다리고 있어요")).toBeNull();
    act(() => vi.advanceTimersByTime(12_001));
    expect(screen.getByText("재생을 기다리고 있어요")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("MediaError 뒤 늦은 pause·playing·timeupdate·ended가 오류 안내를 지우지 않는다", () => {
    const { container } = render(<PromoClipPlayer {...clip} />);
    const video = player(container);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    Object.defineProperty(video, "error", { configurable: true, value: { code: 2, message: "network failed" } });
    fireEvent.error(video);
    fireEvent.pause(video);
    fireEvent.playing(video);
    video.currentTime = 0.5;
    fireEvent.timeUpdate(video);
    fireEvent.ended(video);
    expect(screen.getByRole("alert").textContent).toContain("영상을 재생하지 못했어요");
  });

  it("초기 metadata 길이를 완주로 오인하지 않고 늦은 durationchange 뒤 native ended를 기다린다", () => {
    const { container } = render(<PromoClipPlayer {...clip} />);
    const video = player(container);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    Object.defineProperty(video, "duration", { configurable: true, value: 4.1 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 4.1;
    fireEvent.timeUpdate(video);
    expect(screen.queryByText("재생이 끝났어요")).toBeNull();
    Object.defineProperty(video, "duration", { configurable: true, value: 14.38 });
    fireEvent.durationChange(video);
    video.currentTime = 5;
    fireEvent.timeUpdate(video);
    expect(container.firstElementChild?.getAttribute("data-promo-clip-state")).toBe("playing");
    Object.defineProperty(video, "ended", { configurable: true, value: true });
    video.currentTime = 14.38;
    fireEvent.ended(video);
    expect(screen.getByText("재생이 끝났어요")).toBeTruthy();
  });

  it("선택을 바꾼 이전 재생 요청의 늦은 실패가 다른 영상을 망가뜨리지 않는다", async () => {
    let rejectFirst: ((reason: Error) => void) | undefined;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }));
    const { container } = render(<><PromoClipPlayer {...clip} /><PromoClipPlayer {...clip} src={SECOND} title="마감 관리" /></>);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    fireEvent.click(screen.getByRole("button", { name: "마감 관리 · 재생" }));
    await act(async () => rejectFirst?.(new Error("late first playback rejection")));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelectorAll("video[src]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "그리고, 색까지 · 재생" })).toBeTruthy();
  });

  it("소스 교체와 unmount에서 decoder 소유권을 해제한다", () => {
    const { container, rerender, unmount } = render(<PromoClipPlayer {...clip} />);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    const previous = player(container);
    rerender(<PromoClipPlayer {...clip} src={SECOND} />);
    expect(previous.hasAttribute("src")).toBe(false);
    expect(player(container).hasAttribute("src")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "그리고, 색까지 · 재생" }));
    const active = player(container);
    unmount();
    expect(active.hasAttribute("src")).toBe(false);
  });
});
