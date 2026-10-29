// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInitialAsset3dViewportHudState,
  type StudioAsset3dViewportHudState,
} from "./studio-asset3d-preview-inspector";
import { StudioAsset3dViewportHud } from "./StudioAsset3dViewportHud";

function StatefulHudHarness({
  initialState,
  onSnapCameraAxis,
  onCaptureTransparentScreenshot,
}: {
  readonly initialState?: Partial<StudioAsset3dViewportHudState>;
  readonly onSnapCameraAxis?: (axis: string) => void;
  readonly onCaptureTransparentScreenshot?: () => void;
}) {
  const [state, setState] = useState<StudioAsset3dViewportHudState>(() =>
    createInitialAsset3dViewportHudState(initialState),
  );
  return (
    <StudioAsset3dViewportHud
      state={state}
      onChange={setState}
      onSnapCameraAxis={(axis) => onSnapCameraAxis?.(axis)}
      onCaptureTransparentScreenshot={onCaptureTransparentScreenshot}
    />
  );
}

describe("StudioAsset3dViewportHud", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders 4-group viewport HUD, studio 6-mode switcher, and 6-axis orientation gizmo", () => {
    const onSnap = vi.fn();
    const onCapture = vi.fn();
    render(
      <StatefulHudHarness
        onSnapCameraAxis={onSnap}
        onCaptureTransparentScreenshot={onCapture}
      />,
    );

    expect(screen.getByRole("region", { name: "3D 뷰포트 인스펙터 HUD" })).toBeTruthy();

    // Studio mode switch
    const remeshBtn = screen.getByRole("button", { name: "리메시" });
    expect(remeshBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(remeshBtn);
    expect(remeshBtn.getAttribute("aria-pressed")).toBe("true");

    // 6-axis snap
    fireEvent.click(screen.getByRole("button", { name: "카메라 정면 (+Z) 스냅" }));
    expect(onSnap).toHaveBeenCalledWith("+z");

    // Map channel inspector toggle
    const roughnessBtn = screen.getByRole("button", { name: /거칠기|러프니스/ });
    expect(roughnessBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(roughnessBtn);
    expect(roughnessBtn.getAttribute("aria-pressed")).toBe("true");

    // Topology toggle (Quad <-> Tri)
    const topoBtn = screen.getByRole("button", { name: /토폴로지 모드: Quad/ });
    fireEvent.click(topoBtn);
    expect(screen.getByRole("button", { name: /토폴로지 모드: Triangle/ })).toBeTruthy();

    // Transparent screenshot button
    fireEvent.click(screen.getByRole("button", { name: "투명 배경 스크린샷 캡처" }));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it("opens lighting popover with inert management and updates 360-degree range slider", () => {
    render(<StatefulHudHarness />);

    const lightingTrigger = screen.getByRole("button", { name: /라이팅 \(0°\)/ });
    expect(lightingTrigger.getAttribute("aria-expanded")).toBe("false");

    // Closed popover should have inert attribute and never aria-hidden="true"
    const closedPopover = document.querySelector("[popover='auto']");
    expect(closedPopover).not.toBeNull();
    expect(closedPopover?.hasAttribute("inert")).toBe(true);
    expect(closedPopover?.getAttribute("aria-hidden")).toBeNull();

    // Open popover
    fireEvent.click(lightingTrigger);
    expect(lightingTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(closedPopover?.hasAttribute("inert")).toBe(false);

    // Adjust native <input type="range"> to 180 degrees
    const slider = screen.getByLabelText("조명 수평 회전 다이얼") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "180" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("180°");
    expect(slider.style.getPropertyValue("--control-value")).toBe("180");
    expect(screen.getByRole("button", { name: /라이팅 \(180°\)/ })).toBeTruthy();

    // Select HDRI preset
    const sunsetBtn = screen.getByRole("button", { name: /베니스 노을|석양/ });
    expect(sunsetBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(sunsetBtn);
    expect(sunsetBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
