// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dCinematicDirectorPanel } from "./StudioBg3dCinematicDirectorPanel";
import {
  StudioBg3dProSuiteRuntimeContext,
  type StudioBg3dProSuiteRuntimeValue,
} from "./studio-bg3d-pro-suite-runtime-context";

import type { StudioBg3dShot } from "./studio-bg3d-scene-document";

// 무거운 패널 렌더가 병렬 실행 부하에서 5초를 넘길 수 있어 타임아웃을 늘립니다.
vi.setConfig({ testTimeout: 30000 });

afterEach(cleanup);

const SHOTS: readonly StudioBg3dShot[] = [
  {
    id: "shot-a",
    name: "대화 와이드",
    camera: { position: [0, 1.6, 6], target: [0, 1.4, 0], fovDegrees: 50 },
  },
];
const BASE_CAMERA = { position: [0, 1.6, 6], target: [0, 1.4, 0], fovDegrees: 45 } as const;

function cutRatioSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: /컷 비율/ }) as HTMLSelectElement;
}

describe("cinematic director cut ratio in the rehearsal deck", () => {
  it("is labelled as a bookmark memo and says it does not change the capture frame", () => {
    render(<StudioBg3dCinematicDirectorPanel />);
    expect(screen.getByText(/컷 비율 \(메모\)/)).toBeTruthy();
    expect(screen.getByTestId("cut-aspect-hint").textContent).toContain("북마크 메모로만 기록돼요");
    // 리허설에서는 "자유"·"직접 지정" 항목이 없고 다섯 비율만 고를 수 있다.
    expect(Array.from(cutRatioSelect().options).map((option) => option.value)).toEqual([
      "9:16",
      "4:5",
      "1:1",
      "16:9",
      "21:9",
    ]);
  });

  it("still writes the chosen ratio into the bookmark it creates", () => {
    const onApplyShotBookmark = vi.fn();
    render(<StudioBg3dCinematicDirectorPanel onApplyShotBookmark={onApplyShotBookmark} />);
    fireEvent.change(cutRatioSelect(), { target: { value: "21:9" } });
    expect(cutRatioSelect().value).toBe("21:9");
    fireEvent.click(screen.getByRole("button", { name: "현재 설정으로 컷 추가" }));
    expect(onApplyShotBookmark).toHaveBeenCalledTimes(1);
    expect(onApplyShotBookmark.mock.calls[0]![0].panelAspect).toBe("21:9");
  });
});

describe("cinematic director cut ratio linked to the capture frame", () => {
  function renderLinked(captureAspectRatio: number | null) {
    const onCaptureAspectRatioChange = vi.fn();
    render(
      <StudioBg3dCinematicDirectorPanel
        productionShots={SHOTS}
        baseCamera={BASE_CAMERA}
        captureAspectRatio={captureAspectRatio}
        onCaptureAspectRatioChange={onCaptureAspectRatioChange}
      />,
    );
    return onCaptureAspectRatioChange;
  }

  it("shows the stored capture ratio and states that it is document-wide", () => {
    renderLinked(16 / 9);
    expect(cutRatioSelect().value).toBe("16:9");
    expect(screen.queryByText(/컷 비율 \(메모\)/)).toBeNull();
    const hint = screen.getByTestId("cut-aspect-hint").textContent ?? "";
    expect(hint).toContain("문서 전체의 캡처·삽입 프레임 비율");
    expect(hint).toContain("LT 탭의 출력 비율과 같은 값이에요");
    expect(hint).toContain("컷마다 따로 저장하지는 않아요");
  });

  it("sends the selected ratio to the capture frame and can return to automatic", () => {
    const onChange = renderLinked(16 / 9);
    fireEvent.change(cutRatioSelect(), { target: { value: "4:5" } });
    expect(onChange).toHaveBeenLastCalledWith(0.8);
    fireEvent.change(cutRatioSelect(), { target: { value: "21:9" } });
    expect(onChange).toHaveBeenLastCalledWith(21 / 9);
    fireEvent.change(cutRatioSelect(), { target: { value: "free" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("shows the automatic state and a custom ratio without pretending they are one of the five", () => {
    cleanup();
    renderLinked(null);
    expect(cutRatioSelect().value).toBe("free");
    expect(screen.getByRole("option", { name: "자유(뷰포트)" })).toBeTruthy();
    cleanup();
    renderLinked(4 / 3);
    expect(cutRatioSelect().value).toBe("custom");
    const custom = screen.getByRole("option", { name: "직접 지정" }) as HTMLOptionElement;
    expect(custom.disabled).toBe(true);
  });

  it("does not link a rehearsal deck even when a command is supplied", () => {
    const onChange = vi.fn();
    render(<StudioBg3dCinematicDirectorPanel captureAspectRatio={16 / 9} onCaptureAspectRatioChange={onChange} />);
    expect(screen.getByText(/컷 비율 \(메모\)/)).toBeTruthy();
    fireEvent.change(cutRatioSelect(), { target: { value: "1:1" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("locks the select while the editor is busy", () => {
    render(
      <StudioBg3dCinematicDirectorPanel
        disabled
        productionShots={SHOTS}
        baseCamera={BASE_CAMERA}
        captureAspectRatio={1}
        onCaptureAspectRatioChange={vi.fn()}
      />,
    );
    expect(cutRatioSelect().disabled).toBe(true);
  });
});

describe("cinematic director cut ratio through the Pro Suite runtime", () => {
  function runtimeValue(overrides: Partial<StudioBg3dProSuiteRuntimeValue> = {}): StudioBg3dProSuiteRuntimeValue {
    return {
      disabled: false,
      baseCamera: BASE_CAMERA,
      productionShots: SHOTS,
      onApplyCameraView: vi.fn(),
      onCaptureCurrentShot: vi.fn(),
      onApplyProductionShot: vi.fn(),
      onMoveProductionShot: vi.fn(),
      onRemoveProductionShot: vi.fn(),
      onUseCurrentFrameAsAiReference: undefined,
      aiReferenceBusy: false,
      aiReferenceDisabled: false,
      ...overrides,
    };
  }

  it("reads the ratio and the command from the runtime the editor shell publishes", () => {
    const onSetCaptureAspectRatio = vi.fn();
    render(
      <StudioBg3dProSuiteRuntimeContext.Provider
        value={runtimeValue({ captureAspectRatio: 21 / 9, onSetCaptureAspectRatio })}
      >
        <StudioBg3dCinematicDirectorPanel />
      </StudioBg3dProSuiteRuntimeContext.Provider>,
    );
    expect(cutRatioSelect().value).toBe("21:9");
    fireEvent.change(cutRatioSelect(), { target: { value: "9:16" } });
    expect(onSetCaptureAspectRatio).toHaveBeenCalledWith(9 / 16);
  });

  it("lets explicit props win over the runtime values", () => {
    const fromRuntime = vi.fn();
    const fromProps = vi.fn();
    render(
      <StudioBg3dProSuiteRuntimeContext.Provider
        value={runtimeValue({ captureAspectRatio: 21 / 9, onSetCaptureAspectRatio: fromRuntime })}
      >
        <StudioBg3dCinematicDirectorPanel captureAspectRatio={1} onCaptureAspectRatioChange={fromProps} />
      </StudioBg3dProSuiteRuntimeContext.Provider>,
    );
    expect(cutRatioSelect().value).toBe("1:1");
    fireEvent.change(cutRatioSelect(), { target: { value: "16:9" } });
    expect(fromProps).toHaveBeenCalledWith(16 / 9);
    expect(fromRuntime).not.toHaveBeenCalled();
  });

  it("stays a memo when the runtime offers no capture ratio command", () => {
    render(
      <StudioBg3dProSuiteRuntimeContext.Provider value={runtimeValue()}>
        <StudioBg3dCinematicDirectorPanel />
      </StudioBg3dProSuiteRuntimeContext.Provider>,
    );
    expect(screen.getByText(/컷 비율 \(메모\)/)).toBeTruthy();
  });
});
