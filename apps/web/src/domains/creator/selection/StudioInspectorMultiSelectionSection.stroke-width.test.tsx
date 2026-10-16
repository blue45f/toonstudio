// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInspectorMultiSelectionSection } from "../StudioInspectorMultiSelectionSection";

import type { El, FrameEl } from "../studio-element-model";
import type { StudioInspectorAsideModel } from "../useStudioInspectorAsideModel";

// 이 시험은 공통 선 두께 슬라이더만 본다. 나머지 자식은 이 모델에서 쓰지 않는 무거운 화면이라 얇게 대체한다.
vi.mock("../StudioColorField", () => ({ StudioColorField: () => <div data-testid="color-field-stub" /> }));
vi.mock("../StudioInspectorBatchRenameSection", () => ({ StudioInspectorBatchRenameSection: () => null }));
vi.mock("../StudioInspectorOrderAlignSection", () => ({ StudioInspectorSelectionActions: () => null }));
vi.mock("../StudioInspectorUtilityPanels", () => ({ StudioInspectorMutationLockNotice: () => null }));

afterEach(() => {
  cleanup();
});

function frame(id: string, stroke: string | undefined, strokeWidth?: number): FrameEl {
  return { id, type: "frame", x: 0, y: 0, width: 200, height: 120, stroke, strokeWidth } as FrameEl;
}

function modelFor(elements: El[], overrides: Partial<StudioInspectorAsideModel> = {}): StudioInspectorAsideModel {
  return {
    alignSelected: vi.fn(),
    announceDrawingShortcut: vi.fn(),
    commit: vi.fn(),
    commitCoalesced: vi.fn(),
    elements,
    ensureRecentColorsLoaded: vi.fn(),
    finishPatchElCoalescing: vi.fn(),
    groups: [],
    disarmAllPixelTools: vi.fn(),
    duplicateSelected: vi.fn(),
    inspectorInteractionPolicy: { selection: { disabled: false, reason: "" } },
    inspectorTransientOwners: [],
    marqueeIds: elements.map((element) => element.id),
    recentColors: [],
    rememberColor: vi.fn(),
    removeSelected: vi.fn(),
    reorder: vi.fn(),
    requestInspectorColorSample: undefined,
    ...overrides,
  } as unknown as StudioInspectorAsideModel;
}

describe("다중 선택 공통 선 두께", () => {
  it("선이 보이는 요소가 있으면 슬라이더와 현재 두께를 보여 준다", () => {
    render(<StudioInspectorMultiSelectionSection model={modelFor([frame("a", "#111111", 4), frame("b", "#222222", 4)])} />);

    const slider = screen.getByRole("slider", { name: "선 두께" }) as HTMLInputElement;
    expect(slider.value).toBe("4");
    expect(slider.min).toBe("0.5");
    expect(slider.max).toBe("16");
    expect(slider.step).toBe("0.5");
    expect(screen.getByText("4.0px")).toBeTruthy();
    expect(slider.getAttribute("aria-valuetext")).toBe("4.0픽셀");
  });

  it("두께가 섞여 있으면 값 대신 섞임을 말한다", () => {
    render(<StudioInspectorMultiSelectionSection model={modelFor([frame("a", "#111111", 2), frame("b", "#222222", 6)])} />);

    expect(screen.getByText("섞임")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "선 두께" }).getAttribute("aria-valuetext")).toBe("서로 다른 두께");
  });

  it("슬라이더를 움직이면 선이 보이는 요소에만 같은 두께를 합쳐 커밋한다", () => {
    const hidden = frame("hidden", undefined);
    const model = modelFor([frame("a", "#111111", 2), frame("b", "#222222", 6), hidden]);
    render(<StudioInspectorMultiSelectionSection model={model} />);

    fireEvent.change(screen.getByRole("slider", { name: "선 두께" }), { target: { value: "7.5" } });

    expect(model.commit).not.toHaveBeenCalled();
    expect(model.commitCoalesced).toHaveBeenCalledTimes(1);
    const [next, key] = vi.mocked(model.commitCoalesced!).mock.calls[0] as [El[], string];
    expect(key).toBe("width:multi:a,b,hidden:stroke");
    expect(next.map((element) => (element as FrameEl).strokeWidth)).toEqual([7.5, 7.5, undefined]);
    expect(next[2]).toBe(hidden);
  });

  it("합치기 커밋이 없는 호스트에서는 일반 커밋으로 낮춘다", () => {
    const model = modelFor([frame("a", "#111111", 2), frame("b", "#222222", 2)], { commitCoalesced: undefined });
    render(<StudioInspectorMultiSelectionSection model={model} />);

    fireEvent.change(screen.getByRole("slider", { name: "선 두께" }), { target: { value: "5" } });

    expect(model.commit).toHaveBeenCalledTimes(1);
  });

  it("이미 같은 두께로 바꾸면 커밋하지 않는다", () => {
    const model = modelFor([frame("a", "#111111", 3), frame("b", "#222222", 3)]);
    render(<StudioInspectorMultiSelectionSection model={model} />);

    fireEvent.change(screen.getByRole("slider", { name: "선 두께" }), { target: { value: "3" } });

    expect(model.commitCoalesced).not.toHaveBeenCalled();
    expect(model.commit).not.toHaveBeenCalled();
  });

  it("포인터·키·포커스가 끝나면 합치기 커밋을 마무리한다", () => {
    const model = modelFor([frame("a", "#111111", 2), frame("b", "#222222", 2)]);
    render(<StudioInspectorMultiSelectionSection model={model} />);
    const slider = screen.getByRole("slider", { name: "선 두께" });

    fireEvent.pointerUp(slider);
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    fireEvent.blur(slider);

    expect(model.finishPatchElCoalescing).toHaveBeenCalledTimes(3);
  });

  it("선이 보이는 요소가 하나도 없으면 슬라이더를 두지 않는다", () => {
    render(<StudioInspectorMultiSelectionSection model={modelFor([frame("a", undefined), frame("b", "transparent")])} />);

    expect(screen.queryByRole("slider", { name: "선 두께" })).toBeNull();
  });

  it("이미 슬라이더 상한보다 굵은 선이 있으면 상한을 그 굵기까지 올린다", () => {
    render(<StudioInspectorMultiSelectionSection model={modelFor([frame("a", "#111111", 30.2), frame("b", "#222222", 5)])} />);

    const slider = screen.getByRole("slider", { name: "선 두께" }) as HTMLInputElement;
    expect(slider.max).toBe("31");
    expect(slider.value).toBe("30.2");
  });
});
