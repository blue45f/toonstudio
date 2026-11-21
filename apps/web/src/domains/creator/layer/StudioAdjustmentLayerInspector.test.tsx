// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAdjustmentLayerInspector } from "./StudioAdjustmentLayerInspector";
import type { StudioAdjustmentLayerSpec } from "./studio-adjustment-layer";

afterEach(() => {
  cleanup();
});

describe("StudioAdjustmentLayerInspector", () => {
  it("4종 조정 레이어 추가 버튼과 PSD 비파괴 직렬화 콜백이 동작한다", () => {
    const onAddLayer = vi.fn();
    const onUpdateLayer = vi.fn();
    const onRemoveLayer = vi.fn();
    const onExportPsdDescriptors = vi.fn();

    render(
      <StudioAdjustmentLayerInspector
        layers={[]}
        onAddLayer={onAddLayer}
        onUpdateLayer={onUpdateLayer}
        onRemoveLayer={onRemoveLayer}
        onExportPsdDescriptors={onExportPsdDescriptors}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /그라데이션 맵 추가/u }));
    expect(onAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustment: "gradient-map",
        enabled: true,
        parameters: expect.objectContaining({
          interpolationSpace: "oklab",
        }),
      }),
    );
  });

  it("선택된 톤 커브·클리핑·불투명도·PSD 직렬화를 비파괴로 갱신한다", () => {
    const layers: StudioAdjustmentLayerSpec[] = [
      {
        id: "adj-1",
        name: "곡선 조정 레이어",
        adjustment: "curves",
        parameters: { rgbPoints: [0, 0, 128, 128, 255, 255] },
        enabled: true,
        opacity: 1,
        blendMode: "source-over",
        clipToBelow: false,
      },
    ];
    const onUpdateLayer = vi.fn();
    const onExportPsdDescriptors = vi.fn();

    render(
      <StudioAdjustmentLayerInspector
        layers={layers}
        selectedLayerId="adj-1"
        onAddLayer={vi.fn()}
        onUpdateLayer={onUpdateLayer}
        onRemoveLayer={vi.fn()}
        onExportPsdDescriptors={onExportPsdDescriptors}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "S-커브 대비" }));
    expect(onUpdateLayer).toHaveBeenCalledWith(
      "adj-1",
      expect.objectContaining({
        parameters: expect.objectContaining({
          rgbPoints: [0, 0, 64, 48, 192, 210, 255, 255],
        }),
      }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /바로 아래 레이어에만 클리핑/u }));
    expect(onUpdateLayer).toHaveBeenCalledWith(
      "adj-1",
      expect.objectContaining({ clipToBelow: true }),
    );

    fireEvent.click(screen.getByRole("button", { name: /PSD 직렬화/u }));
    expect(onExportPsdDescriptors).toHaveBeenCalledWith(
      expect.objectContaining({
        stats: expect.objectContaining({ exportedCount: 1, total: 1 }),
      }),
    );
  });
});
