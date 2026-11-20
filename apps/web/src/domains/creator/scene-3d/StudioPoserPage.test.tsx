// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { StudioPoserPage } from "./StudioPoserPage";

import { useI18n } from "@/shared/lib/i18n";
import { useToastStore } from "@/shared/lib/toast-store";

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

const { applyBody } = vi.hoisted(() => ({ applyBody: vi.fn(async () => true) }));

vi.mock("./StudioMannequinPoserPanel", () => ({
  StudioMannequinPoserPanel: ({
    open,
    applyBodyRef,
    onClose,
    onInsert,
    initialPosePresetId,
    captureTarget,
  }: {
    open: boolean;
    applyBodyRef: { current: typeof applyBody };
    onClose: () => void;
    onInsert: (result: unknown) => boolean;
    initialPosePresetId?: string;
    captureTarget?: string;
  }) => {
    applyBodyRef.current = applyBody;
    return <div
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
    </div>;
  },
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

  it("기본 캡처는 2D 컷 레이어 삽입으로 동작하고 보조 모드에서 PNG 다운로드를 지원한다", () => {
    useToastStore.setState({ toasts: [] });
    window.sessionStorage.clear();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage();
    const panel = screen.getByTestId("poser-panel");
    expect(panel.getAttribute("data-capture-target")).toBe("canvas");
    fireEvent.click(screen.getByRole("button", { name: "캡처 저장" }));
    expect(click).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("toonstudio:poser:pending-cut-layer")).toContain("data:image/png");
    expect(useToastStore.getState().toasts.at(-1)?.message).toContain("2D 컷 레이어를 준비했어요");

    fireEvent.click(screen.getByTestId("studio-poser-capture-mode-download"));
    expect(panel.getAttribute("data-capture-target")).toBe("download");
    fireEvent.click(screen.getByRole("button", { name: "캡처 저장" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("location")).toBeNull();
    expect(screen.getByTestId("poser-panel")).toBeTruthy();
    expect(useToastStore.getState().toasts.at(-1)?.message).toContain("PNG를 저장했어요");
    click.mockRestore();
    useToastStore.setState({ toasts: [] });
  });

  it("체형·의상 정밀 워크벤치 토글로 도크를 열고 외부 브랜드 잔재 없이 체형 비율 적용 토스트를 띄운다", async () => {
    useToastStore.setState({ toasts: [] });
    renderPage();

    const toggle = screen.getByTestId("studio-poser-varco3d-workbench-toggle");
    expect(toggle.textContent).not.toContain("VARCO");
    expect(toggle.textContent).toContain("체형·의상 정밀 워크벤치");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("studio-poser-varco3d-workbench-dock")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("studio-poser-varco3d-workbench-dock")).toBeTruthy();

    fireEvent.click(screen.getByTestId("varco3d-apply-shaper-to-mannequin"));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(applyBody).toHaveBeenCalledWith(expect.objectContaining({ heightCm: expect.any(Number), headCount: expect.any(Number) }), undefined);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toContain("세계관 체형 비율 적용됨");

    fireEvent.click(screen.getByTestId("varco3d-apply-archetype-motion-to-mannequin"));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(2));
    const updatedToasts = useToastStore.getState().toasts;
    expect(updatedToasts).toHaveLength(2);
    expect(updatedToasts[1]?.message).toContain("로판 악녀 황후 여주인공");
    applyBody.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByTestId("varco3d-apply-shaper-to-mannequin"));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.tone).toBe("error"));
    useToastStore.setState({ toasts: [] });
  });

  it("REA 포저 투시 워크벤치에서 카메라 렌즈·관절 보정을 한국어로 표시하고 en 로케일에서 한글을 포함하지 않는다", () => {
    useI18n.setState({ lang: "ko" });
    renderPage();
    expect(screen.getByTestId("studio-poser-varco3d-workbench-toggle").textContent).toContain("에셋 140종 · 리깅 66종");
    const bar = screen.getByTestId("studio-poser-rea-foreshortening-bar");
    expect(bar.textContent).not.toContain("Clip Studio");
    expect(screen.getByTestId("poser-rea-lens-manga-18mm-foreshorten").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("poser-rea-solver-com-gravity-balance").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toBe(
      "카메라: 만화 18mm 과장 투시 · 관절 보정: 무게중심 자동 균형",
    );

    fireEvent.click(screen.getByTestId("poser-rea-lens-standard-35mm-dialogue"));
    expect(screen.getByTestId("poser-rea-lens-standard-35mm-dialogue").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("poser-rea-lens-manga-18mm-foreshorten").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toContain("카메라: 표준 35mm 대화 샷");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).not.toContain("standard-35mm-dialogue");

    fireEvent.click(screen.getByTestId("poser-rea-lens-tele-85mm-portrait"));
    expect(screen.getByTestId("poser-rea-lens-tele-85mm-portrait").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toContain("카메라: 망원 85mm 인물 압축");

    fireEvent.click(screen.getByTestId("poser-rea-solver-clavicle-auto-twist"));
    expect(screen.getByTestId("poser-rea-solver-clavicle-auto-twist").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("poser-rea-solver-com-gravity-balance").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toContain("관절 보정: 쇄골·어깨 자동 연동 회전");

    fireEvent.click(screen.getByTestId("poser-rea-solver-hand-grip-preset"));
    expect(screen.getByTestId("poser-rea-solver-hand-grip-preset").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-poser-rea-status").textContent).toContain("관절 보정: 손가락 파지 프리셋");

    act(() => {
      useI18n.setState({ lang: "en" });
    });
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("studio-poser-varco3d-workbench-toggle").textContent).not.toMatch(/[가-힣]/u);
  });
});
