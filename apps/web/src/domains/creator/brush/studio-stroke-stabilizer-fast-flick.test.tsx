// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioLineCorrectionControls } from "../StudioLineCorrectionControls";

import {
  flushStudioFastFlickStabilizerTail,
  simulateStudioFastFlickPreview,
  STUDIO_STABILIZER_STRENGTH_PRESETS,
} from "./studio-stroke-stabilizer-fast-flick";

afterEach(cleanup);

describe("P1-08 선 보정 강도 프리셋 및 빠른 손동작 끝점·필압 보존", () => {
  it("모든 강도 프리셋(0~10)에서 고속 플릭 끝점 오차가 0.0px이고 끝 필압이 0으로 소실되지 않는다", () => {
    for (const preset of STUDIO_STABILIZER_STRENGTH_PRESETS) {
      const preview = simulateStudioFastFlickPreview(preset.mode, preset.stabilizer);
      const rawEnd = preview.rawPoints.at(-1)!;
      const finalCommitted = preview.catchupSamples.at(-1)
        ? [preview.catchupSamples.at(-1)!.x, preview.catchupSamples.at(-1)!.y]
        : preview.stabilizedPoints.at(-1)!;
      expect(preview.endpointErrorPx).toBe(0);
      expect(finalCommitted[0]).toBeCloseTo(rawEnd[0], 6);
      expect(finalCommitted[1]).toBeCloseTo(rawEnd[1], 6);
      expect(preview.preservedEndPressure).toBeGreaterThanOrEqual(0.2);
      expect(preview.preservedEndPressure).toBeLessThanOrEqual(0.5);
    }
  });

  it("강한 선 보정 후행 간격에서 pointerup=0 센티넬이 와도 다단계 추종 샘플과 감압 추세를 보존한다", () => {
    const tail = flushStudioFastFlickStabilizerTail({
      state: {
        rawX: 142,
        rawY: 68,
        outputX: 110,
        outputY: 84,
        timeStamp: 72,
        sampleIntervalMs: 8,
      },
      previousPoint: [96, 90],
      recentPressures: [0.74, 0.56, 0.38],
      releaseRawPressure: 0,
      maxStepPx: 4,
    });

    expect(tail.samples.length).toBeGreaterThanOrEqual(8);
    expect(tail.samples.at(-1)).toEqual({
      x: 142,
      y: 68,
      pressure: tail.endPressure,
    });
    expect(tail.endpointErrorPx).toBe(0);
    expect(tail.startPressure).toBeCloseTo(0.38, 5);
    expect(tail.endPressure).toBeCloseTo(0.29, 5);
    for (let i = 1; i < tail.samples.length; i += 1) {
      expect(tail.samples[i]!.pressure).toBeLessThanOrEqual(tail.samples[i - 1]!.pressure + 1e-6);
      expect(tail.samples[i]!.pressure).toBeGreaterThan(0.08);
    }
  });

  it("데스크톱(compact) 선 보정 패널에서도 5단계 강도 프리셋 버튼과 끝점·필압 미리보기를 제공한다", () => {
    const onModeChange = vi.fn();
    const onStabilizerChange = vi.fn();
    const onPostCorrectionChange = vi.fn();
    render(
      <StudioLineCorrectionControls
        stabilizer={2}
        onStabilizerChange={onStabilizerChange}
        mode="standard"
        onModeChange={onModeChange}
        postCorrection={0}
        onPostCorrectionChange={onPostCorrectionChange}
        preserveCorners
        onPreserveCornersChange={vi.fn()}
      />,
    );

    const group = screen.getByRole("group", { name: "선 보정 강도 프리셋" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(5);

    fireEvent.click(within(group).getByRole("button", { name: "강함 8" }));
    expect(onModeChange).toHaveBeenCalledWith("adaptive");
    expect(onStabilizerChange).toHaveBeenCalledWith(8);
    expect(onPostCorrectionChange).toHaveBeenCalledWith(2);

    const preview = screen.getByLabelText("빠른 손동작 끝점·필압 보존 미리보기");
    expect(preview.textContent).toContain("끝점 오차 0.0px");
  });
});
