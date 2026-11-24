// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioVirtualSpaceAmbientAudio } from "./StudioVirtualSpaceAmbientAudio";
import {
  selectStudioProximityPreset, setStudioProximityRadiusVisible, studioProximityDisplaySnapshot,
} from "./studio-virtual-space-acoustics";

afterEach(() => {
  cleanup();
  setStudioProximityRadiusVisible(false);
  selectStudioProximityPreset("whisper");
});

function renderPanel() {
  render(<StudioVirtualSpaceAmbientAudio scope={null} ready={false} focused={false} away={false} />);
}

describe("StudioVirtualSpaceAmbientAudio proximity section", () => {
  it("selects the conversation distance preset and reflects it in the radius readout", () => {
    renderPanel();
    const whisper = screen.getByRole("button", { name: "1:1 대화" });
    const group = screen.getByRole("button", { name: "그룹 대화" });
    expect(whisper.getAttribute("aria-pressed")).toBe("true");
    expect(group.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/대화 반경: 90px/)).toBeTruthy();

    fireEvent.click(group);
    expect(group.getAttribute("aria-pressed")).toBe("true");
    expect(whisper.getAttribute("aria-pressed")).toBe("false");
    expect(studioProximityDisplaySnapshot().presetId).toBe("group");
    expect(screen.getByText(/대화 반경: 200px/)).toBeTruthy();
  });

  it("toggles the whisper radius display with an accessible pressed state", () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: "속삭임 반경 표시" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(studioProximityDisplaySnapshot().radiusVisible).toBe(true);
    const hide = screen.getByRole("button", { name: "속삭임 반경 숨기기" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(hide);
    expect(studioProximityDisplaySnapshot().radiusVisible).toBe(false);
    expect(screen.getByRole("button", { name: "속삭임 반경 표시" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("reveals the distance-to-gain debug readout with curve parameters", () => {
    renderPanel();
    expect(document.querySelector("[data-proximity-debug=\"true\"]")).toBeNull();
    const debug = screen.getByRole("button", { name: "곡선 디버그" });
    expect(debug.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(debug);
    expect(debug.getAttribute("aria-pressed")).toBe("true");
    const panel = document.querySelector("[data-proximity-debug=\"true\"]");
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("data-proximity-preset")).toBe("whisper");
    expect(panel?.getAttribute("data-proximity-curve")).toBe("exponential");
    expect(panel?.getAttribute("data-proximity-near")).toBe("90");
    expect(panel?.getAttribute("data-proximity-far")).toBe("220");
    expect(screen.getByText(/거리 → 음량: 0px → 100%/)).toBeTruthy();
    expect(screen.getByText(/220px → 0%/)).toBeTruthy();

    fireEvent.click(debug);
    expect(document.querySelector("[data-proximity-debug=\"true\"]")).toBeNull();
  });

  it("auditions WebAudio footstep surfaces and interaction SFX cues with acoustic recipe readout", () => {
    renderPanel();
    expect(screen.getByTestId("studio-vspace-sfx-audition-pad")).toBeTruthy();
    const woodFootstepBtn = screen.getByTestId("studio-vspace-audition-footstep-wood");
    fireEvent.click(woodFootstepBtn);
    const statusAfterFootstep = screen.getByTestId("studio-vspace-sfx-audition-status");
    expect(statusAfterFootstep.textContent).toContain("원목 마루 발소리 청음");
    expect(statusAfterFootstep.textContent).toContain("bandpass");

    const focusSfxBtn = screen.getByTestId("studio-vspace-audition-sfx-focus-start");
    fireEvent.click(focusSfxBtn);
    expect(screen.getByTestId("studio-vspace-sfx-audition-status").textContent).toContain("494Hz → 740Hz sine");
  });
});

describe("StudioVirtualSpaceAmbientAudio daylight-linked opt-in ambience (#039)", () => {
  it("기본 꺼짐(OFF) 상태를 유지하고 음량 상한 0.25(25%)를 하드 클램프한다", () => {
    render(<StudioVirtualSpaceAmbientAudio scope={null} ready focused={false} away={false} hour={9} />);
    const section = document.querySelector<HTMLElement>(".studio-vspace-ambient");
    expect(section?.getAttribute("data-ambient-phase")).toBe("off");
    expect(section?.getAttribute("data-ambient-max-gain")).toBe("0.25");
    expect(section?.getAttribute("data-ambient-effective-gain")).toBe("0.0000");

    const toggleBtn = screen.getByTestId("studio-vspace-ambient-toggle-btn");
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("false");
    expect(toggleBtn.className).toContain("min-h-11");
    expect(toggleBtn.className).toContain("min-w-11");
    expect(toggleBtn.className).toContain("motion-reduce:transition-none");

    const slider = screen.getByTestId("studio-vspace-ambient-volume-slider") as HTMLInputElement;
    expect(slider.max).toBe("25");
    fireEvent.change(slider, { target: { value: "90" } });
    expect(Number(section?.getAttribute("data-ambient-gain"))).toBeLessThanOrEqual(0.25);
    expect(screen.getByTestId("studio-vspace-ambient-volume-output").textContent).toBe("25% / 25%");
  });

  it("24시간 자연광 시간대에 맞춰 아침 연필 사각임·야간 빗소리를 연동하고 모드 버튼 접근성을 지킨다", () => {
    const { rerender } = render(
      <StudioVirtualSpaceAmbientAudio scope={null} ready focused={false} away={false} hour={9} />,
    );
    expect(screen.getByTestId("studio-vspace-daylight-ambience-readout").textContent).toContain("아침 자연광");
    expect(screen.getByTestId("studio-vspace-daylight-ambience-summary").textContent).toContain("연필 사각임");

    const rainBtn = screen.getByTestId("studio-vspace-daylight-mode-rain");
    const pencilBtn = screen.getByTestId("studio-vspace-daylight-mode-pencil-scratch");
    const autoBtn = screen.getByTestId("studio-vspace-daylight-mode-auto");
    for (const btn of [autoBtn, rainBtn, pencilBtn]) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.className).toContain("min-w-11");
      expect(btn.className).toContain("motion-reduce:transition-none");
    }

    fireEvent.click(rainBtn);
    expect(rainBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-vspace-daylight-ambience-summary").textContent).toContain("빗소리");

    fireEvent.click(autoBtn);
    rerender(
      <StudioVirtualSpaceAmbientAudio scope={null} ready focused={false} away={false} hour={22} />,
    );
    expect(screen.getByTestId("studio-vspace-daylight-ambience-readout").textContent).toContain("야간 스탠드");
    expect(screen.getByTestId("studio-vspace-daylight-ambience-summary").textContent).toContain("빗소리");
    expect(screen.queryByText(/WebAudio/u)).toBeNull();
  });
});
