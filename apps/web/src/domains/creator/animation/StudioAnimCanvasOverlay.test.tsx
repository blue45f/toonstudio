// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAnimCanvasOverlay } from "./StudioAnimCanvasOverlay";
import {
  createStudioAnimCamera2DFolder,
  setCamera2DKeyframe,
} from "./studio-anim-camera-2d";
import {
  createEmptyLightTableState,
  DEFAULT_LIGHT_TABLE_TRANSFORM,
  upsertCelLightTableEntry,
  upsertGlobalLightTableEntry,
} from "./studio-light-table";

afterEach(() => {
  cleanup();
});

function buildFixture() {
  let lt = createEmptyLightTableState(true);
  lt = upsertGlobalLightTableEntry(lt, {
    id: "lt-bg",
    sourceKind: "layer",
    sourceId: "layer-rough-bg",
    visible: true,
    opacity: 0.4,
    tintMode: "colorize",
    tintHex: ["#", "3b82f6"].join(""),
    transform: DEFAULT_LIGHT_TABLE_TRANSFORM,
  });
  lt = upsertCelLightTableEntry(lt, "cel-02", {
    id: "lt-prev",
    sourceKind: "frame",
    sourceId: "frame-01",
    visible: true,
    opacity: 0.6,
    tintMode: "half-color",
    tintHex: ["#", "ef4444"].join(""),
    transform: { ...DEFAULT_LIGHT_TABLE_TRANSFORM, tx: 12, ty: -8 },
  });

  let camera = createStudioAnimCamera2DFolder({
    id: "cam-1",
    name: "메인 카메라",
    baseWidth: 640,
    baseHeight: 360,
    showLocus: true,
  });
  camera = setCamera2DKeyframe(camera, 0, { centerX: 320, centerY: 180, zoom: 1, rotationDeg: 0 });
  camera = setCamera2DKeyframe(camera, 6, { centerX: 400, centerY: 150, zoom: 1.5, rotationDeg: 10 });
  return { lightTable: lt, camera };
}

describe("StudioAnimCanvasOverlay", () => {
  it("라이트테이블 참조 시트와 2D 카메라 뷰파인더·궤적·키프레임 점프 버튼을 투영한다", () => {
    const { lightTable, camera } = buildFixture();
    const onSelectFrame = vi.fn();
    const onToggleLightTable = vi.fn();
    const onToggleCameraLocus = vi.fn();

    render(
      <StudioAnimCanvasOverlay
        viewport={{ width: 640, height: 360, zoomScale: 1 }}
        currentFrame={3}
        totalFrames={7}
        activeCelId="cel-02"
        lightTable={lightTable}
        camera={camera}
        onSelectFrame={onSelectFrame}
        onToggleLightTable={onToggleLightTable}
        onToggleCameraLocus={onToggleCameraLocus}
      />,
    );

    expect(screen.getByTestId("anim-light-table-projection").children).toHaveLength(2);
    expect(screen.getByTestId("anim-camera-2d-viewfinder")).toBeTruthy();
    expect(screen.getByTestId("anim-camera-locus-group")).toBeTruthy();
    expect(screen.getByTestId("anim-camera-readout").textContent).toContain("메인 카메라");

    fireEvent.click(screen.getByRole("button", { name: /카메라 키프레임 7프레임으로 이동/u }));
    expect(onSelectFrame).toHaveBeenCalledWith(6);

    fireEvent.click(screen.getByRole("button", { name: /라이트테이블/u }));
    expect(onToggleLightTable).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "카메라 궤적" }));
    expect(onToggleCameraLocus).toHaveBeenCalledWith(false);
  });

  it("isExporting=true일 때 출력물 오염 방지를 위해 오버레이를 전혀 렌더링하지 않는다", () => {
    const { lightTable, camera } = buildFixture();
    const { container } = render(
      <StudioAnimCanvasOverlay
        viewport={{ width: 640, height: 360 }}
        currentFrame={0}
        totalFrames={7}
        activeCelId="cel-02"
        lightTable={lightTable}
        camera={camera}
        isExporting
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
