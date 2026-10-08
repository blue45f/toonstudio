// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COVER_LOAD_TIMEOUT_MS, CoverImage } from "./cover-image";

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

  it("아직 끝나지 않은 이미지는 폴백으로 보내지 않고 기다린다", () => {
    mockImageState({ complete: false, naturalWidth: 0 });
    renderCover();
    expect(screen.getByAltText("테스트 표지")).toBeTruthy();
    expect(screen.queryByText("폴백 표지")).toBeNull();
  });

  it("로드가 끝나면 이미지를 표시한다", () => {
    mockImageState({ complete: false, naturalWidth: 0 });
    renderCover();
    const img = screen.getByAltText("테스트 표지");
    fireEvent.load(img);
    expect(img.className).not.toContain("opacity-0");
    expect(screen.queryByText("폴백 표지")).toBeNull();
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
