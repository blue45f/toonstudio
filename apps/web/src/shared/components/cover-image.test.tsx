// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COVER_GRID_SIZES,
  COVER_LOAD_TIMEOUT_MS,
  CoverImage,
  coverGridPriority,
  resolveCoverSizes,
} from "./cover-image";

vi.mock("@/platform/environment/use-app-config", () => ({
  useAppConfig: () => ({ showCovers: true }),
}));

const SRC = "https://example.com/cover.jpg";

function renderCover() {
  return render(
    <CoverImage src={SRC} alt="테스트 표지" fallback={<span>폴백 표지</span>} />,
  );
}

function mockImageState(state: { complete: boolean; naturalWidth: number }) {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(state.complete);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(state.naturalWidth);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CoverImage (F-B13-1)", () => {
  it("로드 오류가 나면 깨진 이미지 대신 폴백으로 전환한다", () => {
    mockImageState({ complete: false, naturalWidth: 0 });
    renderCover();
    const img = screen.getByAltText("테스트 표지");
    fireEvent.error(img);
    expect(screen.queryByAltText("테스트 표지")).toBeNull();
    expect(screen.getByText("폴백 표지")).toBeTruthy();
  });

  it("핸들러 부착 전에 이미 실패로 끝난 이미지(complete인데 naturalWidth=0)는 마운트 즉시 폴백으로 보낸다", () => {
    mockImageState({ complete: true, naturalWidth: 0 });
    renderCover();
    expect(screen.queryByAltText("테스트 표지")).toBeNull();
    expect(screen.getByText("폴백 표지")).toBeTruthy();
  });

  it("핸들러 부착 전에 이미 성공으로 끝난 이미지는 즉시 표시한다(투명 고착 방지)", () => {
    mockImageState({ complete: true, naturalWidth: 320 });
    renderCover();
    const img = screen.getByAltText("테스트 표지");
    expect(img.className).not.toContain("opacity-0");
  });

  it("로드가 끝나지 않았어도 폴백은 첫 페인트부터 즉시 보인다(S3-16: 빈 타일 구간 없음)", () => {
    mockImageState({ complete: false, naturalWidth: 0 });
    renderCover();
    const img = screen.getByAltText("테스트 표지");
    // 이미지는 아직 투명(페이드-인 대기)이지만, 그 아래 폴백이 이미 서 있다 —
    // 실패 판정(12초)을 기다렸다가 폴백으로 "전환"하는 구 계약과 다르다.
    expect(img.className).toContain("opacity-0");
    expect(screen.getByText("폴백 표지")).toBeTruthy();
  });

  it("priority 표지도 로드 전에는 폴백이 보이고, 이미지는 투명으로 기다리지 않는다", () => {
    mockImageState({ complete: false, naturalWidth: 0 });
    render(
      <CoverImage src={SRC} alt="테스트 표지" fallback={<span>폴백 표지</span>} priority />
    );
    const img = screen.getByAltText("테스트 표지");
    expect(img.className).not.toContain("opacity-0");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(screen.getByText("폴백 표지")).toBeTruthy();
  });

  it("로드가 끝나면 이미지를 표시한다", () => {
    mockImageState({ complete: false, naturalWidth: 0 });
    renderCover();
    const img = screen.getByAltText("테스트 표지");
    fireEvent.load(img);
    expect(img.className).not.toContain("opacity-0");
    expect(screen.queryByText("폴백 표지")).toBeNull();
  });

  it("srcSet만 주면 그리드 표준 sizes가 자동 부여되고, 명시 sizes는 존중한다(S3-16)", () => {
    mockImageState({ complete: false, naturalWidth: 0 });
    const srcSet = "https://example.com/cover-480.jpg 480w, https://example.com/cover-960.jpg 960w";
    const { unmount } = render(
      <CoverImage src={SRC} alt="테스트 표지" fallback={<span>폴백 표지</span>} srcSet={srcSet} />
    );
    expect(screen.getByAltText("테스트 표지").getAttribute("sizes")).toBe(COVER_GRID_SIZES);
    unmount();
    render(
      <CoverImage
        src={SRC}
        alt="테스트 표지"
        fallback={<span>폴백 표지</span>}
        srcSet={srcSet}
        sizes="100vw"
      />
    );
    expect(screen.getByAltText("테스트 표지").getAttribute("sizes")).toBe("100vw");
    expect(resolveCoverSizes(undefined, undefined)).toBeUndefined();
    expect(resolveCoverSizes(undefined, srcSet)).toBe(COVER_GRID_SIZES);
  });

  it("상한 시간 안에 load도 error도 없으면(프록시 멈춤) 폴백으로 전환한다", () => {
    vi.useFakeTimers();
    mockImageState({ complete: false, naturalWidth: 0 });
    renderCover();
    expect(screen.getByAltText("테스트 표지")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(COVER_LOAD_TIMEOUT_MS + 1);
    });
    expect(screen.queryByAltText("테스트 표지")).toBeNull();
    expect(screen.getByText("폴백 표지")).toBeTruthy();
  });
});

describe("coverGridPriority (S3-16: 첫 행 priority는 그리드 책임)", () => {
  it("첫 행(가장 넓은 5열 기준 index 0~4)만 priority다", () => {
    expect([0, 1, 2, 3, 4].map(coverGridPriority)).toEqual([true, true, true, true, true]);
    expect([5, 6, 20].map(coverGridPriority)).toEqual([false, false, false]);
  });

  it("음수·비정수 index는 priority가 아니다", () => {
    expect(coverGridPriority(-1)).toBe(false);
    expect(coverGridPriority(1.5)).toBe(false);
  });
});
