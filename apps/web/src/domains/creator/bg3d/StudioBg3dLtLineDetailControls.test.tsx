// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChevronDown } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dLtLineDetailControls } from "./StudioBg3dLtLineDetailControls";
import { LtRangeControl, LtToggleRow } from "./studio-bg3d-control-fields";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { StudioBg3dLineOutputSettings } from "./studio-bg3d-scene-document";

afterEach(() => {
  cleanup();
});

/** 접힌 `<details>` 안의 컨트롤도 접근성 트리에서 찾을 수 있도록 `hidden` 을 허용해 조회한다. */
function switchByName(name: string): HTMLElement {
  return screen.getByRole("switch", { name, hidden: true });
}

function descriptionOf(element: HTMLElement): string {
  const id = element.getAttribute("aria-describedby");
  if (id === null) return "";
  return document.getElementById(id)?.textContent ?? "";
}

function renderControls(patch: Partial<StudioBg3dLineOutputSettings> = {}) {
  const updateLtLineSettings = vi.fn();
  const ltLineSettings: StudioBg3dLineOutputSettings = {
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
    enabled: true,
    depthEnabled: false,
    hiddenLineRemoval: true,
    ...patch,
  };
  render(
    <StudioBg3dLtLineDetailControls
      ltLineSettings={ltLineSettings}
      updateLtLineSettings={updateLtLineSettings}
      LtToggleRow={LtToggleRow}
      LtRangeControl={LtRangeControl}
      ChevronDown={ChevronDown}
    />,
  );
  return { updateLtLineSettings, ltLineSettings };
}

describe("StudioBg3dLtLineDetailControls", () => {
  it("keeps every precision control that lived in the panel before (ids, labels, wiring)", () => {
    const { updateLtLineSettings, ltLineSettings } = renderControls({
      textureLineEnabled: true,
      depthEnabled: true,
    });
    const idsByLabel: Record<string, string> = {
      "검출 정밀도": "bg3d-lt-line-accuracy",
      "외곽선 강조": "bg3d-lt-line-exterior",
      "선 다듬기": "bg3d-lt-line-smoothing",
      "모서리 각도": "bg3d-lt-line-crease",
      "깊이선 강도": "bg3d-lt-line-depth",
      "재질선 강도": "bg3d-lt-line-texture",
    };
    for (const [label, id] of Object.entries(idsByLabel)) {
      const slider = document.getElementById(id) as HTMLInputElement | null;
      expect(slider, label).not.toBeNull();
      expect(slider?.type).toBe("range");
      expect(slider?.closest("label")?.textContent).toContain(label);
    }
    for (const label of ["화면 크기 보정", "가려진 선 제거", "깊이선 검출", "재질선 검출", "깊이 외곽선만"]) {
      expect(switchByName(label)).toBeTruthy();
    }

    fireEvent.change(document.getElementById("bg3d-lt-line-accuracy")!, { target: { value: "0.4" } });
    expect(updateLtLineSettings).toHaveBeenLastCalledWith({ accuracy: 0.4 });
    fireEvent.click(switchByName("화면 크기 보정"));
    expect(updateLtLineSettings).toHaveBeenLastCalledWith({
      scaleAwareAccuracy: !ltLineSettings.scaleAwareAccuracy,
    });
  });

  it("shows 내부선 억제 as off for old settings that have no such fields, without a strength slider", () => {
    renderControls();
    expect(switchByName("내부선 억제").getAttribute("aria-checked")).toBe("false");
    expect(document.getElementById("bg3d-lt-line-interior-suppression")).toBeNull();
  });

  it("turning 내부선 억제 on writes only that one field", () => {
    const { updateLtLineSettings } = renderControls();
    fireEvent.click(switchByName("내부선 억제"));
    expect(updateLtLineSettings).toHaveBeenCalledTimes(1);
    expect(updateLtLineSettings).toHaveBeenCalledWith({ interiorSuppressionEnabled: true });
  });

  it("shows the strength slider with the default strength once enabled, and edits only the strength", () => {
    const { updateLtLineSettings } = renderControls({ interiorSuppressionEnabled: true });
    expect(switchByName("내부선 억제").getAttribute("aria-checked")).toBe("true");
    const slider = document.getElementById("bg3d-lt-line-interior-suppression") as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(slider.getAttribute("aria-valuetext")).toBe("60%");
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("1");
    fireEvent.change(slider, { target: { value: "0.85" } });
    expect(updateLtLineSettings).toHaveBeenCalledTimes(1);
    expect(updateLtLineSettings).toHaveBeenCalledWith({ interiorSuppressionStrength: 0.85 });
  });

  it("reflects a stored strength, including zero, in the slider", () => {
    renderControls({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0 });
    const slider = document.getElementById("bg3d-lt-line-interior-suppression") as HTMLInputElement;
    expect(slider.value).toBe("0");
    expect(slider.getAttribute("aria-valuetext")).toBe("0%");
  });

  it("explains that 가려진 선 제거 needs depth, and drops the warning when depth is captured", () => {
    renderControls({ depthEnabled: false });
    const withoutDepth = descriptionOf(switchByName("가려진 선 제거"));
    expect(withoutDepth).toContain("효과가 없어요");
    expect(withoutDepth).toContain("깊이선 검출");
    expect(withoutDepth).toContain("내부선 억제");
    cleanup();

    renderControls({ depthEnabled: true });
    const withDepth = descriptionOf(switchByName("가려진 선 제거"));
    expect(withDepth).toContain("이중선");
    expect(withDepth).not.toContain("효과가 없어요");
    cleanup();

    renderControls({ depthEnabled: false, interiorSuppressionEnabled: true });
    expect(descriptionOf(switchByName("가려진 선 제거"))).not.toContain("효과가 없어요");
    cleanup();

    // 강도 0 인 억제는 아무 일도 하지 않으므로 깊이를 요구하지 않는다. 안내도 여전히 "효과 없음"이다.
    renderControls({ depthEnabled: false, interiorSuppressionEnabled: true, interiorSuppressionStrength: 0 });
    expect(descriptionOf(switchByName("가려진 선 제거"))).toContain("효과가 없어요");
  });

  it("describes what 내부선 억제 keeps and removes through the switch's accessible description", () => {
    renderControls();
    const description = descriptionOf(switchByName("내부선 억제"));
    expect(description).toContain("윤곽선");
    expect(description).toContain("깊이도 함께 캡처");
  });

  it("disables every control, including the new ones, when line art is off", () => {
    renderControls({ enabled: false, interiorSuppressionEnabled: true });
    for (const label of ["내부선 억제", "가려진 선 제거", "깊이선 검출", "재질선 검출", "화면 크기 보정"]) {
      expect((switchByName(label) as HTMLButtonElement).disabled, label).toBe(true);
    }
    expect((document.getElementById("bg3d-lt-line-interior-suppression") as HTMLInputElement).disabled).toBe(true);
  });
});
