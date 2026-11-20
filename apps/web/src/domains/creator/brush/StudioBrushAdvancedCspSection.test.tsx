// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBrushAdvancedCspSection } from "./StudioBrushAdvancedCspSection";

afterEach(cleanup);

describe("StudioBrushAdvancedCspSection", () => {
  it("기본 상태에서는 항등원 변경 시 undefined를 내보내고 활성화 시 정규화 확장을 전달한다", () => {
    const onChange = vi.fn();
    render(<StudioBrushAdvancedCspSection value={undefined} onChange={onChange} />);

    const sharpCheckbox = screen.getByLabelText("모서리를 뾰족하게");
    fireEvent.click(sharpCheckbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0]![0];
    expect(updated?.sharpCorner.enabled).toBe(true);

    // 다시 끄면 모든 기능이 기본 상태이므로 undefined 전달 (기존 스냅샷 바이트 불변 보장)
    onChange.mockClear();
    render(<StudioBrushAdvancedCspSection value={updated} onChange={onChange} />);
    const toggles = screen.getAllByLabelText("모서리를 뾰족하게");
    fireEvent.click(toggles[toggles.length - 1]!);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("장식 패턴 모티프 선택 시 리본 연결 및 반복 순서 컨트롤을 노출한다", () => {
    const onChange = vi.fn();
    render(<StudioBrushAdvancedCspSection value={undefined} onChange={onChange} />);

    const motifSelect = screen.getByLabelText("장식 패턴 모티프");
    fireEvent.change(motifSelect, { target: { value: "lace" } });
    const next = onChange.mock.calls[0]![0];
    expect(next?.patternBrush.motif).toBe("lace");

    cleanup();
    render(<StudioBrushAdvancedCspSection value={next} onChange={onChange} />);
    expect(screen.getByText("1개 켜짐")).toBeTruthy();
    expect(screen.getByLabelText("리본처럼 선을 따라 연속 연결")).toBeTruthy();
    expect(screen.getByLabelText("패턴 반복 순서")).toBeTruthy();
  });

  it("예각 모서리·고임 누적·보조색 혼합·시작 감쇠 세부 컨트롤을 노출하고 44px 터치 타깃을 지킨다", () => {
    const onChange = vi.fn();
    const { container } = render(
      <StudioBrushAdvancedCspSection
        value={{
          inOutTaper: {
            useIn: true,
            inLength: 24,
            inUnit: "px",
            inMinRatio: 0,
            useOut: true,
            outLength: 36,
            outUnit: "px",
            outMinRatio: 0,
            curve: 1.35,
            bySpeed: true,
            referenceSpeedPxPerMs: 0.85,
            maxSpeedScale: 2.5,
            targets: { size: true, opacity: false, flow: false },
          },
          sharpCorner: { enabled: true, minTurnAngleDeg: 55, miterLimitRatio: 2.4 },
          dwellBuildup: {
            enabled: true,
            intervalMs: 20,
            stationaryRadiusPx: 1.75,
            maxBuildup: 0.85,
            decayPerTick: 0.86,
          },
          ruledLine: { mode: "none", dashLengthPx: 12, gapLengthPx: 6, amplitudePx: 3, wavelengthPx: 24, seed: 1 },
          patternBrush: {
            motif: "none",
            tipCount: 1,
            orderMode: "repeat",
            ribbon: false,
            flipHorizontal: false,
            flipVertical: false,
            recolorWithForeground: true,
            spacingPx: 18,
            widthPx: 16,
            seed: 1,
          },
          strokeColorAndScale: {
            perStrokeColorJitter: false,
            strokeHueJitterDeg: 0,
            strokeSaturationJitter: 0,
            strokeValueJitter: 0,
            subColorMixSource: "pressure",
            subColorMaxMix: 0.6,
            subColorCurve: 1,
            subColorInvert: false,
            syncSizeWithViewScale: false,
          },
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("시작 감쇠 길이"), { target: { value: "48" } });
    expect(onChange.mock.calls.at(-1)?.[0]?.inOutTaper.inLength).toBe(48);

    fireEvent.change(screen.getByLabelText("예각 판정 각도"), { target: { value: "80" } });
    expect(onChange.mock.calls.at(-1)?.[0]?.sharpCorner.minTurnAngleDeg).toBe(80);

    fireEvent.change(screen.getByLabelText("고임 최대 농도"), { target: { value: "0.7" } });
    expect(onChange.mock.calls.at(-1)?.[0]?.dwellBuildup.maxBuildup).toBeCloseTo(0.7, 5);

    fireEvent.change(screen.getByLabelText("보조색 최대 혼합량"), { target: { value: "0.8" } });
    expect(onChange.mock.calls.at(-1)?.[0]?.strokeColorAndScale.subColorMaxMix).toBeCloseTo(0.8, 5);

    for (const button of container.querySelectorAll<HTMLButtonElement>("button")) {
      expect(button.className).toContain("min-h-11");
    }
  });
});
