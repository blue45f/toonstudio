// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./contracts/studio-bg3d-scene-document";
import { createDefaultStudioVrmSceneDocument } from "./contracts/studio-vrm-scene-document";
import { reopenStudioVrmCut } from "./studio-cuttoon-editor/studio-reopen-vrm-cut";
import { auditStudioInspectorDensity } from "./studio-inspector-dom-density";
import { resetStudioInspectorSectionStateCache } from "./studio-inspector-section-state";
import {
  StudioInspectorOrderAlignSection,
  StudioInspectorSelectionActions,
} from "./StudioInspectorOrderAlignSection";
import { StudioInspectorSceneEditActions } from "./studio-cuttoon-editor/StudioInspectorSceneEditActions";

import type { ComponentProps } from "react";
import type { ImageEl } from "./studio-element-model";

import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  globalThis.localStorage?.clear();
  useI18n.setState({ lang: "ko" });
  resetStudioInspectorSectionStateCache();
});
afterEach(cleanup);

const dummyEl: ImageEl = {
  id: "el-1",
  type: "image",
  src: "data:image/png;base64,abc",
  x: 10,
  y: 20,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
};

function renderOrderAlignSection() {
  const alignSelected = vi.fn();
  const view = render(
    <StudioInspectorOrderAlignSection
      reorder={vi.fn()}
      alignSelected={alignSelected}
      duplicateSelected={vi.fn()}
      removeSelected={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^정렬·순서/u }));
  return { ...view, alignSelected };
}

function renderSceneActions(overrides: Partial<ComponentProps<typeof StudioInspectorSceneEditActions>> = {}) {
  const actions = {
    onEditVrmElement: vi.fn(),
    setBg3dInitialScene: vi.fn(),
    setBg3dInitialDataUrl: vi.fn(),
    setBg3dInitialElementId: vi.fn(),
    setBg3dOpen: vi.fn(),
  };
  const view = render(
    <>
      <StudioInspectorSceneEditActions active selected={dummyEl} gate={{ disabled: false }} selectedBg3dEditSource={null} {...actions} {...overrides} />
      <StudioInspectorOrderAlignSection
        reorder={vi.fn()}
        alignSelected={vi.fn()}
        duplicateSelected={vi.fn()}
        removeSelected={vi.fn()}
      />
    </>,
  );
  return { ...view, ...actions };
}

function renderActions(selectionCount: number) {
  const alignSelected = vi.fn();
  const duplicateSelected = vi.fn();
  const removeSelected = vi.fn();
  const reorder = vi.fn();
  const view = render(
    <StudioInspectorSelectionActions
      selectionCount={selectionCount}
      alignSelected={alignSelected}
      duplicateSelected={duplicateSelected}
      removeSelected={removeSelected}
      reorder={reorder}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^정렬·순서/u }));
  return { ...view, alignSelected, duplicateSelected, removeSelected, reorder };
}

describe("StudioInspectorSceneEditActions", () => {
  it.each(["linked", "unlinked", "legacy"] as const)("3D 재편집에서 %s 컷의 편집기와 갱신 대상 ID를 유지한다", (kind) => {
    const characterDocumentId = "character:00000000-0000-4000-8000-000000000001";
    const scene = createDefaultStudioVrmSceneDocument();
    const selected: ImageEl = kind === "legacy"
      ? { ...dummyEl, src: dummyEl.src + "#" + encodeURIComponent(JSON.stringify({ tool: "vrm-poser" })) }
      : { ...dummyEl, vrmScene: kind === "linked" ? { ...scene, characterDocumentId } : scene };
    const controls = {
      setPoserInitialDataUrl: vi.fn(), setPoserInitialElementId: vi.fn(),
      setPoserVrmOpen: vi.fn(), setCharacterShaperOpen: vi.fn(),
    };
    renderSceneActions({ selected, onEditVrmElement: (element) => reopenStudioVrmCut(element, controls) });
    expect(screen.getByRole("button", { name: /^정렬·순서/u }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "3D 캐릭터 재편집" }));
    expect(controls.setPoserInitialDataUrl).toHaveBeenCalledWith(selected.src);
    expect(controls.setPoserInitialElementId).toHaveBeenCalledWith(selected.id);
    const { setPoserVrmOpen: poser, setCharacterShaperOpen: shaper } = controls;
    expect(kind === "linked" ? shaper : poser).toHaveBeenCalledWith(true);
    expect(kind === "linked" ? poser : shaper).not.toHaveBeenCalled();
  });

  it.each(["scene", "legacy"] as const)("정렬을 펼치지 않고 %s 배경 원본과 선택한 레이어 ID를 연다", (kind) => {
    const selected = { ...dummyEl, id: "selected-background-layer" };
    const source = kind === "scene" ? { scene: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } : { legacyDataUrl: selected.src };
    const controls = renderSceneActions({ selected, selectedBg3dEditSource: source });
    const order = screen.getByRole("button", { name: /^정렬·순서/u });
    expect(order.getAttribute("aria-expanded")).toBe("false");
    const edit = screen.getByRole("button", { name: "3D 배경 재편집" });
    expect(edit.getAttribute("data-studio-bg3d-launcher")).toBe("true");
    expect(edit.classList.contains("min-h-11")).toBe(true);
    fireEvent.click(edit);
    expect(controls.setBg3dInitialScene).toHaveBeenCalledExactlyOnceWith("scene" in source ? source.scene : undefined);
    expect(controls.setBg3dInitialDataUrl).toHaveBeenCalledExactlyOnceWith("legacyDataUrl" in source ? source.legacyDataUrl : undefined);
    expect(controls.setBg3dInitialElementId).toHaveBeenCalledExactlyOnceWith(selected.id);
    expect(controls.setBg3dOpen).toHaveBeenCalledExactlyOnceWith(true);
    fireEvent.click(order);
    expect(screen.getAllByRole("button", { name: "3D 배경 재편집" })).toHaveLength(1);
  });

  it("applies the existing selection lock to the visible action", () => {
    const reason = "검토 잠금을 해제한 뒤 변경할 수 있어요.";
    const controls = renderSceneActions({
      gate: { disabled: true, reason },
      selectedBg3dEditSource: { scene: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT },
    });
    const edit = screen.getByRole("button", { name: "3D 배경 재편집" });
    expect(edit.matches(":disabled")).toBe(true);
    expect(edit.hasAttribute("data-studio-bg3d-launcher")).toBe(false);
    expect(screen.getByRole("group", { name: "3D 원본 편집", description: reason })).toBeTruthy();
    expect(screen.getByText(reason)).toBeTruthy();
    edit.click();
    expect(controls.setBg3dOpen).not.toHaveBeenCalled();
  });

  it("omits the action outside the active, single-selection properties route", () => {
    renderSceneActions({ active: false, selectedBg3dEditSource: { scene: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } });
    expect(screen.queryByRole("group", { name: "3D 원본 편집" })).toBeNull();
  });

  it("leaves plain images without a scene action", () => {
    renderSceneActions();
    expect(screen.queryByRole("group", { name: "3D 원본 편집" })).toBeNull();
  });

});

describe("StudioInspectorOrderAlignSection", () => {
  it("keeps single-selection alignment live and explains why distribution is unavailable", () => {
    const { alignSelected } = renderOrderAlignSection();

    fireEvent.click(screen.getByRole("button", { name: "왼쪽 정렬" }));
    expect(alignSelected).toHaveBeenCalledWith("left");

    const distH = screen.getByRole("button", { name: "가로 등간격 분배" }) as HTMLButtonElement;
    const distV = screen.getByRole("button", { name: "세로 등간격 분배" }) as HTMLButtonElement;
    expect(distH.disabled).toBe(true);
    expect(distV.disabled).toBe(true);
    expect(distH.title).toContain("3개 이상");
    expect(distV.title).toContain("3개 이상");
  });
});

describe("StudioInspectorSelectionActions", () => {
  it("surfaces the same labelled order and alignment commands for a marquee selection", () => {
    const { alignSelected, reorder } = renderActions(2);

    fireEvent.click(screen.getByRole("button", { name: "선택을 맨 앞으로" }));
    expect(reorder).toHaveBeenCalledWith("front");
    fireEvent.click(screen.getByRole("button", { name: "가로 가운데 정렬" }));
    expect(alignSelected).toHaveBeenCalledWith("hcenter");
    expect(screen.getByText("2개")).toBeTruthy();
  });

  it("requires three targets for distribution and explains the disabled state", () => {
    renderActions(2);
    const horizontal = screen.getByRole("button", { name: "가로 등간격 분배" }) as HTMLButtonElement;
    const vertical = screen.getByRole("button", { name: "세로 등간격 분배" }) as HTMLButtonElement;

    expect(horizontal.disabled).toBe(true);
    expect(vertical.disabled).toBe(true);
    expect(horizontal.title).toContain("3개 이상");
    expect(vertical.title).toContain("3개 이상");
  });

  it("enables both distribution directions for three or more targets", () => {
    const { alignSelected } = renderActions(3);
    const horizontal = screen.getByRole("button", { name: "가로 등간격 분배" }) as HTMLButtonElement;
    const vertical = screen.getByRole("button", { name: "세로 등간격 분배" }) as HTMLButtonElement;

    expect(horizontal.disabled).toBe(false);
    expect(vertical.disabled).toBe(false);
    fireEvent.click(horizontal);
    fireEvent.click(vertical);
    expect(alignSelected).toHaveBeenNthCalledWith(1, "distributeH");
    expect(alignSelected).toHaveBeenNthCalledWith(2, "distributeV");
  });

  it("keeps duplicate and delete immediately available with full accessible names", () => {
    const duplicateSelected = vi.fn();
    const removeSelected = vi.fn();
    render(
      <StudioInspectorSelectionActions
        selectionCount={4}
        alignSelected={() => undefined}
        duplicateSelected={duplicateSelected}
        removeSelected={removeSelected}
        reorder={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "4개 선택 복제" }));
    fireEvent.click(screen.getByRole("button", { name: "4개 선택 삭제" }));
    expect(duplicateSelected).toHaveBeenCalledTimes(1);
    expect(removeSelected).toHaveBeenCalledTimes(1);
  });

  it("classifies every interactive control and gives each one a unique identity", () => {
    const { container } = renderActions(3);
    const audit = auditStudioInspectorDensity(container);
    const ids = [...container.querySelectorAll("[data-inspector-control-id]")].map((element) =>
      element.getAttribute("data-inspector-control-id"),
    );

    expect(audit.count.unclassified).toBe(0);
    expect(audit.violations).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
