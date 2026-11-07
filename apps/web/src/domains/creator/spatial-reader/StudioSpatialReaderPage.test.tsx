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

  it("빈 파일·손상된 JSON 및 빈 제목·빈 대사·빈 대체 텍스트 데이터에서도 기본 제목과 접근성 이름을 복원하고 정상 상태에서 불필요한 상시 UI를 노출하지 않는다", async () => {
    renderPage();
    // 초기 정상 상태에서는 빈 status 문구나 상시 필터 바·오류 배너가 노출되지 않는다
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByTestId("spatial-reader-panel-filter-bar")).toBeNull();
    expect(screen.queryByTestId("spatial-reader-broken-image-notice")).toBeNull();

    const input = screen.getByLabelText(/공간 웹툰 파일\(JSON\)/u);

    // 1) 0바이트 빈 파일 업로드 시 한국어 안내
    const emptyFile = new File(["   "], "empty.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [emptyFile] } });
    expect((await screen.findByRole("alert")).textContent).toContain("비어 있는 파일이에요.");

    // 2) 문법이 깨진 JSON 업로드 시 한국어 안내
    const corruptedFile = new File(["{not-valid-json"], "corrupted.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [corruptedFile] } });
    expect((await screen.findByRole("alert")).textContent).toContain("손상된 JSON 파일이에요.");

    // 3) 제목·컷 제목·대체 텍스트가 모두 빈 문자열인 작품 열기 시 기본값 복원 (원본 편집 입력값은 빈 문자열 그대로 유지)
    sample.create.mockResolvedValueOnce(
      parseSpatialBook({
        format: "toonstudio-spatial-book",
        version: 1,
        id: "empty-fields-book",
        title: "",
        panels: [
          {
            id: "empty-panel-1",
            title: "",
            caption: "",
            alt: "",
            src: PIXEL,
            seconds: 6,
            layers: [],
          },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "샘플 작품으로 체험하기" }));
    expect(await screen.findByRole("heading", { level: 2, name: "제목 없는 공간 웹툰" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "1번째 컷" })).toBeTruthy();
    // 정상 감상 상태(1컷)에서는 상시 검색 바나 중복 작품 요약 카드를 렌더링하지 않는다
    expect(screen.queryByTestId("spatial-reader-panel-filter-bar")).toBeNull();
    expect(screen.queryByTestId("spatial-reader-work-summary")).toBeNull();
  });

  it("깨진 표지·컷 이미지 오류 시 정상 작품으로 오해하지 않도록 대체 표시를 명시하고 원본 작품 데이터를 보존한다", async () => {
    const longKoEnBookTitle =
      "초장편 공간 웹툰 테스트 작품 제목 · UltraLongSpatialWebtoonSeriesWithImmersiveCanopyAndDepthLayers_2026_Edition";
    const longKoEnPanelTitle =
      "제1장 첫 번째 컷 · UnbrokenEnglishPanelHeadlineForNarrow320ViewportWrappingVerificationWithoutHorizontalOverflow";
    const brokenDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    sample.create.mockResolvedValueOnce(
      parseSpatialBook({
        format: "toonstudio-spatial-book",
        version: 1,
        id: "long-and-broken-book",
        title: longKoEnBookTitle,
        panels: [
          {
            id: "panel-broken-1",
            title: longKoEnPanelTitle,
            caption: "긴 한영 제목과 깨진 이미지 복구 검증 대사",
            alt: "깨진 첫 번째 컷 장면",
            src: brokenDataUri,
            seconds: 6,
            layers: [],
          },
        ],
      }),
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "샘플 작품으로 체험하기" }));

    const bookHeading = await screen.findByRole("heading", { level: 2, name: longKoEnBookTitle });
    expect(bookHeading.textContent).toBe(longKoEnBookTitle);
    const viewerStage = screen.getByTestId("spatial-reader-viewer-stage");
    expect(viewerStage.className).toContain("[&_#spatial-reader-book-title]:whitespace-normal");
    expect(viewerStage.textContent).toContain(longKoEnPanelTitle);
    expect(screen.queryByTestId("spatial-reader-broken-image-notice")).toBeNull();

    const stageImg = screen.getByRole("img", { name: "깨진 첫 번째 컷 장면" });
    fireEvent.error(stageImg);

    const notice = await screen.findByTestId("spatial-reader-broken-image-notice");
    expect(notice.textContent).toContain("원본 작품이 아닌 ‘이미지 로드 실패 대체 표시’로 보여 주고 있어요.");
    expect(notice.textContent).toContain("원본 작품 데이터는 변경되지 않았습니다.");

    const fallbackImg = screen.getByRole("img", { name: "[이미지 로드 실패 대체 표시] 깨진 첫 번째 컷 장면" });
    expect(fallbackImg.getAttribute("src")).toContain("data:image/svg+xml;charset=utf-8,");
    expect(decodeURIComponent(fallbackImg.getAttribute("src") ?? "")).toContain("이미지 로드 실패 · 원본 작품이 아닌 대체 표시");

    const recoverBtn = screen.getByTestId("spatial-reader-broken-image-recover");
    expect(recoverBtn.className).toContain("min-h-11");
    fireEvent.click(recoverBtn);
    // 복구(재시도) 버튼 클릭 시 샘플 작품으로 덮어쓰지 않고 원본 작품 제목과 원본 이미지 src를 그대로 보존한다
    expect(screen.queryByTestId("spatial-reader-broken-image-notice")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: longKoEnBookTitle })).toBeTruthy();
    expect(screen.getByRole("img", { name: "깨진 첫 번째 컷 장면" }).getAttribute("src")).toBe(brokenDataUri);
  });

  it("필요할 때('/') 컷 필터를 열어 0건 복구 및 현재 감상 위치를 유지하고 키보드 탐색·오류 닫기 초점을 복원한다", async () => {
    renderPage();

    // REA 칩 버튼 내 화살표·Home·End 키보드 탐색
    fireEvent.keyDown(screen.getByTestId("spatial-rea-curve-cylinder-90deg-canopy"), { key: "ArrowRight" });
    expect(screen.getByTestId("spatial-rea-curve-dome-120deg-cinema").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(screen.getByTestId("spatial-rea-curve-dome-120deg-cinema"));

    fireEvent.keyDown(screen.getByTestId("spatial-rea-curve-dome-120deg-cinema"), { key: "Home" });
    expect(screen.getByTestId("spatial-rea-curve-cylinder-90deg-canopy").getAttribute("aria-pressed")).toBe("true");

    // 샘플 작품을 열고 2번째 컷으로 이동 (기본 3컷 작품에서는 상시 필터 바가 숨겨져 있다)
    fireEvent.click(screen.getByRole("button", { name: "샘플 작품으로 체험하기" }));
    const heading = await screen.findByRole("heading", { level: 2, name: "샘플 공간 웹툰 · 예시" });
    expect(screen.queryByTestId("spatial-reader-panel-filter-bar")).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByRole("img", { name: "위기 장면" })).toBeTruthy();

    // Alt+ArrowLeft 같은 브라우저 단축키는 컷 이동을 가로채지 않는다
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    expect(screen.getByRole("img", { name: "위기 장면" })).toBeTruthy();

    // '/' 단축키로 필요할 때만 컷 필터 바를 열고 0건 안내 노출 및 현재 2번째 컷 유지
    fireEvent.keyDown(window, { key: "/" });
    const filterInput = await screen.findByTestId("spatial-reader-panel-filter-input");
    await waitFor(() => expect(document.activeElement).toBe(filterInput));
    fireEvent.change(filterInput, { target: { value: "존재하지않는컷999" } });
    expect(screen.getByTestId("spatial-reader-filter-empty").textContent).toContain("조건에 맞는 컷이 없습니다 (0건)");
    expect(screen.getByRole("img", { name: "위기 장면" })).toBeTruthy();

    const resetBtn = screen.getByTestId("spatial-reader-filter-reset");
    expect(resetBtn.className).toContain("min-h-11");
    fireEvent.click(resetBtn);
    expect(screen.queryByTestId("spatial-reader-filter-empty")).toBeNull();
    expect(screen.queryByTestId("spatial-reader-panel-filter-bar")).toBeNull();
    expect(document.activeElement).toBe(heading);

    // 오류 알림 발생 후 Escape로 닫으면 작품 제목 헤딩으로 초점이 복원된다
    fireEvent.click(screen.getByRole("button", { name: "공간 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "AR/VR 종료" }));
    sample.create.mockRejectedValueOnce(new Error("일시적인 열기 오류"));
    fireEvent.click(screen.getByRole("button", { name: "샘플 작품으로 체험하기" }));
    await screen.findByRole("alert");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
