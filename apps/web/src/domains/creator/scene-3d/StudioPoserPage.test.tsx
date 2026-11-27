// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { StrictMode, useState } from "react";
import { StudioPoserCutHandoffHost } from "../studio-cuttoon-editor/StudioPoserCutHandoffHost";
import { POSER_CUT_QUERY, type PoserCutRaster } from "../studio-cuttoon-editor/studio-poser-cut-handoff";
import { createStudioProject } from "../studio-project-library-store";
import { createStudioProjectDocument } from "../studio-project-document-store";
import { StudioPoserPage } from "./StudioPoserPage";

import { useI18n } from "@/shared/lib/i18n";
import { useToastStore } from "@/shared/lib/toast-store";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
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
        onClick={() => {
          try {
            if (onInsert({ pngDataUrl: "data:image/png;base64,AAAA", width: 4, height: 4 }) && captureTarget !== "download") onClose();
          } catch (error) { useToastStore.getState().show(String(error), { tone: "error" }); }
        }}
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

function CutEditorProbe() {
  const location = useLocation();
  const [layers, setLayers] = useState<ReadonlyMap<string, PoserCutRaster>>(new Map());
  const token = new URLSearchParams(location.search).get(POSER_CUT_QUERY);
  return <><LocationProbe />{token && <StudioPoserCutHandoffHost ready id={token} owner={null} exists={(id) => layers.has(id)}
    insert={(cut, id) => { setLayers((previous) => new Map(previous).set(id, cut)); return true; }} />}
    {[...layers].map(([id, cut]) => <img key={id} alt="포즈 레이어" src={cut.pngDataUrl} width={cut.width} height={cut.height} />)}</>;
}

function renderPage(initialEntry = "/studio/poser"): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/studio/poser" element={<StudioPoserPage />} />
        <Route path="/studio" element={<LocationProbe />} />
        <Route path="/studio/canvas" element={<StrictMode><CutEditorProbe /></StrictMode>} />
        <Route path="/studio/p/:project/d/:document" element={<StrictMode><CutEditorProbe /></StrictMode>} />
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

  it("독립 포저의 캡처를 실제 원고 선택 경로로 전달하고 레이어 하나만 소비한다", () => {
    createStudioProject(localStorage, { id: "p1", title: "연재", kind: "webtoon" });
    createStudioProjectDocument(localStorage, "p1", { id: "d1", title: "1화", kind: "webtoon" });
    createStudioProjectDocument(localStorage, "p1", { id: "d2", title: "2화", kind: "webtoon" });
    renderPage("/studio/poser?project=p1");
    fireEvent.change(screen.getByRole("combobox", { name: "대상 원고 문서" }), { target: { value: "d2" } });
    fireEvent.click(screen.getByRole("button", { name: "캡처 저장" }));
    expect(screen.getByTestId("location").textContent).toBe("/studio/p/p1/d/d2");
    expect(screen.getAllByAltText("포즈 레이어")).toHaveLength(1);
    expect(screen.getByAltText("포즈 레이어").getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(Object.keys(sessionStorage).some((key) => key.startsWith("toonstudio:poser:cut:"))).toBe(false);
  });

  it("저장 공간이 부족하면 포저를 유지하고 같은 화면에서 다시 캡처한다", () => {
    useToastStore.setState({ toasts: [] });
    renderPage();
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new DOMException("quota", "QuotaExceededError"); });
    fireEvent.click(screen.getByRole("button", { name: "캡처 저장" }));
    expect(screen.getByTestId("poser-panel")).toBeTruthy();
    expect(useToastStore.getState().toasts.at(-1)?.tone).toBe("error");
    fireEvent.click(screen.getByRole("button", { name: "캡처 저장" }));
    expect(screen.getByAltText("포즈 레이어")).toBeTruthy();
  });

  it("이전 판본의 목적지 없는 캡처는 원고를 선택해 명시적으로 복구한다", () => {
    sessionStorage.setItem("toonstudio:poser:pending-cut-layer", JSON.stringify({ pngDataUrl: "data:image/png;base64,AAAA", width: 4, height: 4 }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "이전 포즈 컷 복구" }));
    expect(screen.getByAltText("포즈 레이어")).toBeTruthy();
    expect(sessionStorage.getItem("toonstudio:poser:pending-cut-layer")).toBeNull();
  });

  it("보조 모드에서는 PNG를 직접 저장하고 포저에 머문다", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage();
    fireEvent.click(screen.getByTestId("studio-poser-capture-mode-download"));
    expect(screen.getByTestId("poser-panel").getAttribute("data-capture-target")).toBe("download");
    fireEvent.click(screen.getByRole("button", { name: "캡처 저장" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("location")).toBeNull();
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
