// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccUvAtlasTools } from "./StudioHybridDccUvAtlasTools";

import type { StudioHybridDccUvAtlasModel } from "./useStudioHybridDccUvAtlas";

afterEach(cleanup);

function setup(overrides: Partial<StudioHybridDccUvAtlasModel> = {}) {
  const model: StudioHybridDccUvAtlasModel = {
    phase: "idle",
    busy: false,
    canStart: true,
    resolution: "4096",
    padding: "4",
    rotateCharts: true,
    progress: null,
    stage: "",
    unavailable: null,
    error: "",
    notice: "",
    start: vi.fn<StudioHybridDccUvAtlasModel["start"]>(async () => {}),
    cancel: vi.fn<StudioHybridDccUvAtlasModel["cancel"]>(),
    setResolution: vi.fn<StudioHybridDccUvAtlasModel["setResolution"]>(),
    setPadding: vi.fn<StudioHybridDccUvAtlasModel["setPadding"]>(),
    setRotateCharts: vi.fn<StudioHybridDccUvAtlasModel["setRotateCharts"]>(),
    ...overrides,
  };
  const view = render(<StudioHybridDccUvAtlasTools model={model} />);
  return { model, view };
}

function input(name: string): HTMLInputElement {
  const element = screen.getByRole("textbox", { name });
  if (!(element instanceof HTMLInputElement)) throw new Error("UV 설정 입력 요소가 없습니다.");
  return element;
}

function button(name: string): HTMLButtonElement {
  const element = screen.getByRole("button", { name });
  if (!(element instanceof HTMLButtonElement)) throw new Error("UV 조작 버튼이 없습니다.");
  return element;
}

describe("자동 UV 펼치기 설정 UI", () => {
  it("기본 해상도·픽셀 여백과 기존 UV 교체·한 번의 실행 취소를 안내한다", () => {
    setup();
    const resolution = input("목표 해상도 (px)");
    const padding = input("아일랜드 여백 (px)");
    expect(resolution.value).toBe("4096");
    expect(padding.value).toBe("4");
    expect(resolution.type).toBe("text");
    expect(padding.type).toBe("text");
    expect(resolution.getAttribute("inputmode")).toBe("numeric");
    expect(padding.getAttribute("inputmode")).toBe("numeric");
    const helpId = resolution.getAttribute("aria-describedby");
    if (!helpId) throw new Error("UV 설정 도움말 연결이 없습니다.");
    expect(document.getElementById(helpId)?.textContent).toMatch(/새 UV 아일랜드.*목표 해상도의 픽셀/u);
    expect(screen.getByText(/기존 UV를 교체하며 한 번의 실행 취소/u).textContent).toContain("기존 이미지 텍스처의 배치가 달라질 수 있습니다.");
    expect(button("자동 UV 펼치기").disabled).toBe(false);
    expect(button("자동 UV 펼치기").getAttribute("aria-describedby")?.split(" ").some((id) => document.getElementById(id)?.textContent?.includes("한 번의 실행 취소"))).toBe(true);
    expect(button("자동 UV 펼치기 취소").disabled).toBe(true);
  });

  it("숫자 초안을 임의로 바꾸지 않고 옵션과 시작 요청을 모델에 전달한다", () => {
    const { model, view } = setup();
    fireEvent.change(input("목표 해상도 (px)"), { target: { value: "" } });
    fireEvent.change(input("아일랜드 여백 (px)"), { target: { value: "4.5" } });
    expect(model.setResolution).toHaveBeenCalledWith("");
    expect(model.setPadding).toHaveBeenCalledWith("4.5");
    view.rerender(<StudioHybridDccUvAtlasTools model={{ ...model, resolution: "", padding: "4.5" }} />);
    expect(input("목표 해상도 (px)").value).toBe("");
    expect(input("아일랜드 여백 (px)").value).toBe("4.5");
    fireEvent.change(input("목표 해상도 (px)"), { target: { value: "1e4" } });
    expect(model.setResolution).toHaveBeenLastCalledWith("1e4");
    fireEvent.click(screen.getByRole("checkbox", { name: "90도 회전 허용" }));
    expect(model.setRotateCharts).toHaveBeenCalledWith(false);
    fireEvent.click(button("자동 UV 펼치기"));
    expect(model.start).toHaveBeenCalledOnce();
  });

  it.each(["computing", "publishing"] as const)("%s 중 입력과 중복 실행을 막고 취소는 남긴다", (phase) => {
    const { model } = setup({ phase, busy: true, canStart: false, stage: "UV 처리 중" });
    const resolution = input("목표 해상도 (px)");
    const padding = input("아일랜드 여백 (px)");
    const rotate = screen.getByRole("checkbox", { name: "90도 회전 허용" });
    if (!(rotate instanceof HTMLInputElement)) throw new Error("회전 설정 요소가 없습니다.");
    expect(resolution.disabled).toBe(true);
    expect(padding.disabled).toBe(true);
    expect(rotate.disabled).toBe(true);
    fireEvent.change(resolution, { target: { value: "1024" } });
    fireEvent.change(padding, { target: { value: "8" } });
    fireEvent.click(rotate);
    expect(model.setResolution).not.toHaveBeenCalled();
    expect(model.setPadding).not.toHaveBeenCalled();
    expect(model.setRotateCharts).not.toHaveBeenCalled();
    const start = button("자동 UV 펼치기 진행 중");
    expect(start.disabled).toBe(true);
    const form = start.closest("form");
    if (!form) throw new Error("자동 펼치기 입력 폼이 없습니다.");
    fireEvent.submit(form);
    expect(model.start).not.toHaveBeenCalled();
    expect(button("자동 UV 펼치기 취소").disabled).toBe(false);
    fireEvent.click(button("자동 UV 펼치기 취소"));
    expect(model.cancel).toHaveBeenCalledOnce();
  });

  it("다른 작업으로 잠긴 idle에서는 시작과 설정을 잠그고 관련 없는 취소를 제공하지 않는다", () => {
    const { model } = setup({ busy: true });
    expect(input("목표 해상도 (px)").disabled).toBe(true);
    expect(button("자동 UV 펼치기").disabled).toBe(true);
    expect(button("자동 UV 펼치기 취소").disabled).toBe(true);
    fireEvent.click(button("자동 UV 펼치기"));
    expect(model.start).not.toHaveBeenCalled();
  });

  it("사용할 수 없는 이유를 시작 버튼의 접근성 설명에 연결한다", () => {
    const message = "먼저 편집할 오브젝트를 선택하세요.";
    const { model } = setup({ canStart: false, unavailable: message });
    const start = button("자동 UV 펼치기");
    expect(start.disabled).toBe(true);
    const descriptionIds = start.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(descriptionIds.some((id) => document.getElementById(id)?.textContent === message)).toBe(true);
    fireEvent.click(start);
    expect(model.start).not.toHaveBeenCalled();
  });

  it("오류를 읽을 수 있게 표시하고 idle에서 같은 초안으로 다시 시도할 수 있다", () => {
    const message = "UV를 펼치지 못했습니다. 설정을 확인한 뒤 다시 시도하세요.";
    const { model } = setup({ error: message, resolution: "2048", padding: "6" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(input("목표 해상도 (px)").value).toBe("2048");
    expect(input("아일랜드 여백 (px)").value).toBe("6");
    const retry = button("자동 UV 펼치기 다시 시도");
    expect(retry.disabled).toBe(false);
    expect(retry.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    fireEvent.click(retry);
    expect(model.start).toHaveBeenCalledOnce();
  });

  it("진행 단계와 수치·미정 진행률을 표시하고 완료 알림으로 전환한다", () => {
    const { model, view } = setup({ phase: "computing", busy: true, progress: 0.4, stage: "UV 아일랜드 정리 중" });
    expect(screen.getByRole("status").textContent).toContain("UV 아일랜드 정리 중");
    const progress = screen.getByRole("progressbar", { name: "자동 UV 펼치기 진행률" });
    expect(progress.getAttribute("max")).toBe("1");
    expect(progress.getAttribute("value")).toBe("0.4");
    view.rerender(<StudioHybridDccUvAtlasTools model={{ ...model, phase: "publishing", progress: null, stage: "" }} />);
    expect(screen.getByRole("status").textContent).toContain("UV 적용 중");
    expect(screen.getByRole("progressbar").hasAttribute("value")).toBe(false);
    view.rerender(<StudioHybridDccUvAtlasTools model={{ ...model, phase: "idle", busy: false, notice: "자동 UV 펼치기를 적용했습니다." }} />);
    expect(screen.getByRole("status").textContent).toContain("자동 UV 펼치기를 적용했습니다.");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it.each(["light", "dark", "contrast"] as const)("%s에서도 토큰·축소 가능한 입력·터치와 키보드 조작 계약을 유지한다", (theme) => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    const previousContrast = root.getAttribute("data-contrast");
    root.setAttribute("data-theme", theme === "contrast" ? "dark" : theme);
    if (theme === "contrast") root.setAttribute("data-contrast", "more");
    else root.removeAttribute("data-contrast");
    try {
      setup();
      const region = screen.getByRole("region", { name: "자동 UV 펼치기" });
      expect(region.classList.contains("min-w-0")).toBe(true);
      expect(region.classList.contains("bg-panel")).toBe(true);
      expect(region.classList.contains("border-line")).toBe(true);
      for (const control of [input("목표 해상도 (px)"), input("아일랜드 여백 (px)"), button("자동 UV 펼치기"), button("자동 UV 펼치기 취소")]) {
        expect(control.classList.contains("min-w-0")).toBe(true);
        expect(control.classList.contains("min-h-11")).toBe(true);
        expect(control.classList.contains("focus-visible:outline-accent")).toBe(true);
      }
      expect(region.querySelector("[style]")).toBeNull();
    } finally {
      if (previousTheme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previousTheme);
      if (previousContrast === null) root.removeAttribute("data-contrast");
      else root.setAttribute("data-contrast", previousContrast);
    }
  });
});
