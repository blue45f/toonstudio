// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { parseSpatialBook, type SpatialBook } from "./spatial-book";
import { StudioSpatialReaderPage } from "./StudioSpatialReaderPage";

// 1×1 PNG — 공간 웹툰 형식 검증(내장 PNG·JPEG·WebP)만 통과시키는 최소 이미지.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function sampleBook(): SpatialBook {
  return parseSpatialBook({
    format: "toonstudio-spatial-book",
    version: 1,
    id: "toonstudio-spatial-sample",
    title: "샘플 공간 웹툰 · 예시",
    panels: ["고백", "위기", "축하"].map((title, index) => ({
      id: `sample-${index + 1}`,
      title,
      caption: `${title} 대사`,
      alt: `${title} 장면`,
      src: PIXEL,
      seconds: 6,
      layers: [],
    })),
  });
}

const sample = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./spatial-sample-book", () => ({ createSampleSpatialBook: sample.create }));

function renderPage() {
  return render(
    <MemoryRouter>
      <StudioSpatialReaderPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  window.localStorage.clear();
  sample.create.mockResolvedValue(sampleBook());
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
  vi.clearAllMocks();
});

describe("StudioSpatialReaderPage", () => {
  it("처음에는 사용 순서·열기 방법·빈 감상 영역을 안내한다", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "웹툰의 공간 안으로" })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "공간 리더 사용 순서" })).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByLabelText(/컷 이미지 여러 장/u)).toBeTruthy();
    expect(screen.getByLabelText(/공간 웹툰 파일\(JSON\)/u)).toBeTruthy();
    expect(screen.getByText("작품을 열면 이곳에서 감상합니다")).toBeTruthy();
  });

  it("샘플 작품을 열면 감상 화면·조작 안내가 나타나고 키보드로 컷을 넘긴다", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "샘플 작품으로 체험하기" }));
    const heading = await screen.findByRole("heading", { level: 2, name: "샘플 공간 웹툰 · 예시" });
    // 작품을 열면 감상 영역 제목으로 초점이 이동한다(긴 안내를 건너뛰고 바로 감상).
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole("img", { name: "고백 장면" })).toBeTruthy();
    expect(screen.getByText("조작 안내")).toBeTruthy();
    expect(screen.getByRole("button", { name: "이전 컷" }).hasAttribute("disabled")).toBe(true);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByRole("img", { name: "위기 장면" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "End" });
    expect(await screen.findByRole("img", { name: "축하 장면" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음 컷" }).hasAttribute("disabled")).toBe(true);
    // 감상 위치는 이 기기에만 저장된다.
    expect(window.localStorage.getItem("toonstudio-spatial-progress:toonstudio-spatial-sample")).toBe("2");
  });

  it("썸네일로 바로 이동하고 현재 컷을 표시한다", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "샘플 작품으로 체험하기" }));
    const strip = await screen.findByRole("group", { name: "전체 컷 탐색" });
    fireEvent.click(within(strip).getByRole("button", { name: "2번째 컷 위기" }));
    expect(within(strip).getByRole("button", { name: "2번째 컷 위기" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("img", { name: "위기 장면" })).toBeTruthy();
  });

  it("작품을 열지 못하면 닫을 수 있는 오류 안내를 보여 준다", async () => {
    sample.create.mockRejectedValueOnce(new Error("샘플 컷을 그리지 못했어요."));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "샘플 작품으로 체험하기" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("샘플 컷을 그리지 못했어요.");
    fireEvent.click(within(alert).getByRole("button", { name: "안내 닫기" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("잘못된 작품 파일은 검증 오류로 안내한다", async () => {
    renderPage();
    const input = screen.getByLabelText(/공간 웹툰 파일\(JSON\)/u);
    const file = new File(['{"format":"other"}'], "broken.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    expect((await screen.findByRole("alert")).textContent).toContain("1~32컷의 공간 웹툰 파일을 사용해 주세요.");
  });

  it("REA 공간 리더 워크벤치에서 곡률 모드·시선 포커스를 전환하고 en 로케일에서 한글을 포함하지 않는다", () => {
    renderPage();
    const bar = screen.getByTestId("spatial-reader-rea-webxr-fov-bar");
    expect(bar.textContent).toContain("Apple Vision Pro visionOS · Meta Quest WebXR · Spline Spatial");
    const curveGroup = within(bar).getByRole("group", { name: "곡률 모드" });
    const gazeGroup = within(bar).getByRole("group", { name: "시선 포커스" });
    const allChips = [...within(curveGroup).getAllByRole("button"), ...within(gazeGroup).getAllByRole("button")];
    expect(allChips).toHaveLength(6);
    for (const chip of allChips) {
      expect(chip.className).toContain("min-h-11");
      expect(chip.className).toContain("min-w-11");
      expect(chip.className).toContain("focus-visible:outline-2");
      expect(chip.className).not.toContain("py-1.5");
    }

    expect(screen.getByTestId("spatial-rea-curve-cylinder-90deg-canopy").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("spatial-rea-gaze-foveated-depth-dof").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("spatial-rea-curve-dome-120deg-cinema"));
    expect(screen.getByTestId("spatial-rea-curve-dome-120deg-cinema").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("spatial-rea-curve-cylinder-90deg-canopy").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("spatial-reader-rea-status").textContent).toContain("dome-120deg-cinema");

    fireEvent.click(screen.getByTestId("spatial-rea-curve-floating-panel-stack"));
    expect(screen.getByTestId("spatial-rea-curve-floating-panel-stack").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("spatial-reader-rea-status").textContent).toContain("floating-panel-stack");

    fireEvent.click(screen.getByTestId("spatial-rea-gaze-spatial-binaural-pan"));
    expect(screen.getByTestId("spatial-rea-gaze-spatial-binaural-pan").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("spatial-rea-gaze-foveated-depth-dof").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("spatial-reader-rea-status").textContent).toContain("spatial-binaural-pan");

    fireEvent.click(screen.getByTestId("spatial-rea-gaze-comfort-vignette-lock"));
    expect(screen.getByTestId("spatial-rea-gaze-comfort-vignette-lock").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("spatial-reader-rea-status").textContent).toContain("comfort-vignette-lock");

    act(() => {
      useI18n.setState({ lang: "en" });
    });
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("spatial-rea-curve-floating-panel-stack").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("spatial-rea-gaze-comfort-vignette-lock").getAttribute("aria-pressed")).toBe("true");
  });
});
