// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioClipStudioUnifiedUxPanel } from "../StudioClipStudioUnifiedUxPanel";

afterEach(cleanup);

describe("StudioClipStudioUnifiedUxPanel", () => {
  it("renders command bar items, workspace selector, and resolves modifier keys (.tomd/.spws)", () => {
    const onExecuteCommandBarItem = vi.fn();
    render(
      <StudioClipStudioUnifiedUxPanel
        onExecuteCommandBarItem={onExecuteCommandBarItem}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /클립스튜디오 5\.1\.5 통합 UI\/UX 도크/,
      }),
    ).toBeTruthy();

    const psdButton = screen.getByRole("button", {
      name: ".psd(Photoshop 문서)로 저장",
    });
    fireEvent.click(psdButton);
    expect(onExecuteCommandBarItem).toHaveBeenCalledWith(
      "3D617F46-7D99-44b2-80C1-2BEF6F9EBE33",
    );

    const spaceCheckbox = screen.getByRole("checkbox", { name: "Space" });
    fireEvent.click(spaceCheckbox);

    const readout = screen.getByTestId("csp-modifier-resolution-readout");
    expect(readout.textContent).toContain("손바닥");
    expect(readout.textContent).toContain("flags=8");
  });

  it("supports intermediate color 5x5 grid, approximate color 5x5 grid, and color mixing pad", () => {
    const onSelectColorHex = vi.fn();
    render(
      <StudioClipStudioUnifiedUxPanel
        initialTab="color_palettes"
        onSelectColorHex={onSelectColorHex}
      />,
    );

    const intermediateSwatch = screen.getByRole("button", {
      name: /^중간색 타일 13 /i,
    });
    fireEvent.click(intermediateSwatch);
    expect(onSelectColorHex).toHaveBeenCalledTimes(1);

    const mixStrokeBtn = screen.getByRole("button", {
      name: /혼합 스트로크 적용/,
    });
    fireEvent.click(mixStrokeBtn);
    expect(screen.getByTestId("csp-mix-pad-swatch")).toBeTruthy();
  });

  it("applies BrushPreset.bfps 14 shapes and interpolates 3D hand setup pose pad", () => {
    const onSelectBrushShapePreset = vi.fn();
    render(
      <StudioClipStudioUnifiedUxPanel
        initialTab="brush_3d_hand"
        onSelectBrushShapePreset={onSelectBrushShapePreset}
      />,
    );

    const dottedBtn = screen.getByRole("button", { name: "점선" });
    fireEvent.click(dottedBtn);
    expect(onSelectBrushShapePreset).toHaveBeenCalledWith("dotted_line");

    const strokeReadout = screen.getByTestId("csp-bfps-stroke-readout");
    expect(strokeReadout.textContent).toContain("점선");
    expect(strokeReadout.textContent).toContain("30.00px");

    const handSideBtn = screen.getByRole("button", { name: /손 방향:/ });
    fireEvent.click(handSideBtn);

    const handReadout = screen.getByTestId("csp-hand-pose-readout");
    expect(handReadout.textContent).toContain("보간 본 수: 15개");
    expect(handReadout.textContent).toContain("right");
  });

  it("displays ICC CMYK soft proof metrics, audio lip-sync cues, and hanuke gap detection", () => {
    render(<StudioClipStudioUnifiedUxPanel initialTab="icc_audio_ailia" />);

    expect(screen.getByTestId("csp-icc-proof-readout").textContent).toContain(
      "최대 ΔE:",
    );
    expect(screen.getByText(/Frame #0/)).toBeTruthy();
    expect(screen.getByTestId("csp-hanuke-readout").textContent).toContain(
      "감지된 미채움 미세 틈새(hanuke) 픽셀:",
    );
  });

  it("renders PW* composite controls, PWGLCalcVividColor 3D toon shader, .fto fonts, and MENUv3 Bento launcher", () => {
    const onLaunchBentoItem = vi.fn();
    render(
      <StudioClipStudioUnifiedUxPanel
        initialTab="pwui_bento_3d_toon"
        onLaunchBentoItem={onLaunchBentoItem}
      />,
    );

    expect(screen.getByTestId("csp-pwgl-vivid-readout").textContent).toContain(
      "양자화 명도: 0.35",
    );
    expect(screen.getByTestId("csp-fto-pwui-readout").textContent).toContain(
      "IwaAntStd-Bd",
    );
    expect(screen.getByTestId("csp-fto-pwui-readout").textContent).toContain(
      "PW* 위젯 클래스: 27종",
    );

    const fanzineBentoBtn = screen.getByRole("button", {
      name: /동인지 만들기/,
    });
    fireEvent.click(fanzineBentoBtn);
    expect(onLaunchBentoItem).toHaveBeenCalledWith(
      "fanzine",
      "start_fanzine_index.html",
    );
  });
});
