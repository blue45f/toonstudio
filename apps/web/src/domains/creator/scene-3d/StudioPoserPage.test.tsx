// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { StudioPoserPage } from "./StudioPoserPage";

import { useI18n } from "@/shared/lib/i18n";
import { useToastStore } from "@/shared/lib/toast-store";

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

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
    expect(panel.getAttribute("data-capture-target")).toBe("download");
    fireEvent.click(screen.getByRole("button", { name: "캡처 저장" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("location")).toBeNull();
    expect(screen.getByTestId("poser-panel")).toBeTruthy();
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ tone: "success" });
    expect(toasts[0]?.message).toContain("PNG를 저장했어요");
    click.mockRestore();
    useToastStore.setState({ toasts: [] });
  });

  it("VARCO 3D 워크벤치 & 세계관 셰이퍼 토글로 도크를 열고 체형 비율 적용 토스트를 띄운다", () => {
    useToastStore.setState({ toasts: [] });
    renderPage();

    const toggle = screen.getByTestId("studio-poser-varco3d-workbench-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("studio-poser-varco3d-workbench-dock")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("studio-poser-varco3d-workbench-dock")).toBeTruthy();

    fireEvent.click(screen.getByTestId("varco3d-apply-shaper-to-mannequin"));
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toContain("세계관 체형 비율 적용됨");

    // Apply VARCO 3D archetype & motion preset directly to the mannequin poser
    fireEvent.click(screen.getByTestId("varco3d-apply-archetype-motion-to-mannequin"));
    const updatedToasts = useToastStore.getState().toasts;
    expect(updatedToasts).toHaveLength(2);
    expect(updatedToasts[1]?.message).toContain("로판 악녀 황후 여주인공");
    useToastStore.setState({ toasts: [] });
  });

  it("REA 포저 투시 워크벤치에서 카메라 렌즈·관절 솔버를 전환하고 en 로케일에서 한글을 포함하지 않는다", () => {
    useI18n.setState({ lang: "ko" });
    renderPage();
    const bar = screen.getByTestId("studio-poser-rea-foreshortening-bar");
    expect(bar.textContent).toContain("Clip Studio 3D Poser · Magic Poser · Cascadeur · VRoid Studio");
    expect(screen.getByTestId("poser-rea-lens-manga-18mm-foreshorten").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("poser-rea-solver-com-gravity-balance").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("poser-rea-lens-standard-35mm-dialogue"));
    expect(screen.getByTestId("poser-rea-lens-standard-35mm-dialogue").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("poser-rea-lens-manga-18mm-foreshorten").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toContain("standard-35mm-dialogue");

    fireEvent.click(screen.getByTestId("poser-rea-lens-tele-85mm-portrait"));
    expect(screen.getByTestId("poser-rea-lens-tele-85mm-portrait").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toContain("tele-85mm-portrait");

    fireEvent.click(screen.getByTestId("poser-rea-solver-clavicle-auto-twist"));
    expect(screen.getByTestId("poser-rea-solver-clavicle-auto-twist").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("poser-rea-solver-com-gravity-balance").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toContain("clavicle-auto-twist");

    fireEvent.click(screen.getByTestId("poser-rea-solver-hand-grip-preset"));
    expect(screen.getByTestId("poser-rea-solver-hand-grip-preset").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toContain("hand-grip-preset");

    act(() => {
      useI18n.setState({ lang: "en" });
    });
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
  });
});
