// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { StudioPoserPage } from "./StudioPoserPage";

import { useToastStore } from "@/shared/lib/toast-store";

afterEach(cleanup);

vi.mock("./StudioMannequinPoserPanel", () => ({
  StudioMannequinPoserPanel: ({
    open,
    onClose,
    onInsert,
    initialPosePresetId,
    captureTarget,
  }: {
    open: boolean;
    onClose: () => void;
    onInsert: (result: unknown) => boolean;
    initialPosePresetId?: string;
    captureTarget?: string;
  }) => (
    <div
      data-testid="poser-panel"
      data-open={String(open)}
      data-initial-preset={initialPosePresetId ?? ""}
      data-capture-target={captureTarget ?? ""}
    >
      <button type="button" onClick={onClose}>
        닫기
      </button>
      <button
        type="button"
        onClick={() => onInsert({ pngDataUrl: "data:image/png;base64,AAAA", width: 4, height: 4 })}
      >
        캡처 저장
      </button>
    </div>
  ),
}));

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderPage(initialEntry = "/studio/poser"): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/studio/poser" element={<StudioPoserPage />} />
        <Route path="/studio" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StudioPoserPage (/studio/poser)", () => {
  it("페이지 제목 h1을 제공한다", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "포즈 스튜디오" })).toBeTruthy();
  });

  it("포저 패널을 열린 상태로 마운트한다", () => {
    renderPage();
    const panel = screen.getByTestId("poser-panel");
    expect(panel.getAttribute("data-open")).toBe("true");
  });

  it("?starter= 쿼리를 읽어 포저 패널의 시작 프리셋으로 전달한다", () => {
    renderPage("/studio/poser?starter=run");
    const panel = screen.getByTestId("poser-panel");
    expect(panel.getAttribute("data-initial-preset")).toBe("run");
  });

  it("?starter= 쿼리가 없으면 시작 프리셋을 전달하지 않는다", () => {
    renderPage();
    const panel = screen.getByTestId("poser-panel");
    expect(panel.getAttribute("data-initial-preset")).toBe("");
  });

  it("포저를 닫으면 /studio로 복귀한다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.getByTestId("location").textContent).toBe("/studio");
  });

  it("캡처는 PNG로 받고 포저를 열어 둔 채 저장 토스트를 띄운다 (B-01)", () => {
    useToastStore.setState({ toasts: [] });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage();
    const panel = screen.getByTestId("poser-panel");
    // 독립 진입점은 캡처 뒤에도 포저를 닫지 않는 PNG 저장 모드로 연다.
    expect(panel.getAttribute("data-capture-target")).toBe("download");
    fireEvent.click(screen.getByRole("button", { name: "캡처 저장" }));
    expect(click).toHaveBeenCalledTimes(1);
    // 작품 라이브러리(/studio)로 이동하지 않고 포저가 그대로 열려 있다.
    expect(screen.queryByTestId("location")).toBeNull();
    expect(screen.getByTestId("poser-panel")).toBeTruthy();
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ tone: "success" });
    expect(toasts[0]?.message).toContain("PNG를 저장했어요");
    click.mockRestore();
    useToastStore.setState({ toasts: [] });
  });
});
