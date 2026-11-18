// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  computePerspectiveRigFrom3dCamera,
  describePerspectiveSnapStatus,
} from "./studio-perspective-3d-camera-sync";
import { StudioPerspectivePanel } from "../StudioPerspectivePanel";
import {
  StudioDrawingQuickErgonomicsBar,
  type StudioDrawingErgonomicsSession,
} from "../studio-cuttoon-editor/StudioDrawingQuickErgonomicsBar";

function createErgonomicsSession(
  overrides: Partial<StudioDrawingErgonomicsSession> = {},
): StudioDrawingErgonomicsSession {
  return {
    activeSurfaceReviewLocked: false,
    pageEditLocked: false,
    canvasInteractionBlocked: false,
    scopedCanvasDrawingAvailable: true,
    tool: "draw",
    drawMode: "pen",
    activatePrimaryCanvasTool: vi.fn(),
    strokeWidth: 8,
    setStrokeWidth: vi.fn(),
    stabilizer: 2,
    setStabilizer: vi.fn(),
    showWebtoonGuides: false,
    setShowWebtoonGuides: vi.fn(),
    effScale: 1,
    setZoom: vi.fn(),
    zoomLocked: false,
    viewTransformSuppressed: false,
    bg3dOpen: false,
    studioLeftToolRailHandlers: { toggleBg3dEditor: vi.fn() },
    exportMenuOpen: false,
    setExportMenuOpen: vi.fn(),
    perspectiveRulerActive: true,
    setPerspectiveRulerActive: vi.fn(),
    vanishingPoints: [
      { id: "vp-1", x: -240, y: 560 },
      { id: "vp-2", x: 1120, y: 560 },
    ],
    ...overrides,
  };
}

describe("P1-13 원근 자 (3D 카메라 소실점 연동 · 스냅 상태 한눈에 확인)", () => {
  afterEach(() => {
    cleanup();
  });

  it("3D 카메라 화각·회전·상하 앵글로부터 1·2·3점 소실점과 눈높이 수평선을 정확히 투영한다", () => {
    const onePoint = computePerspectiveRigFrom3dCamera({
      mode: "1p",
      yawDeg: 0,
      pitchDeg: 0,
      fovDeg: 50,
      canvasWidth: 800,
      canvasHeight: 1200,
    });
    expect(onePoint.eyeLevelY).toBe(600);
    expect(onePoint.lockHorizon).toBe(true);
    expect(onePoint.points).toEqual([{ axis: "z-forward", x: 400, y: 600 }]);

    const twoPoint = computePerspectiveRigFrom3dCamera({
      mode: "2p",
      yawDeg: 35,
      pitchDeg: 0,
      fovDeg: 54,
      canvasWidth: 800,
      canvasHeight: 1200,
    });
    expect(twoPoint.points).toHaveLength(2);
    expect(twoPoint.points[0]!.x).toBeLessThan(400);
    expect(twoPoint.points[1]!.x).toBeGreaterThan(400);
    expect(twoPoint.points[0]!.y).toBe(twoPoint.eyeLevelY);
    expect(twoPoint.points[1]!.y).toBe(twoPoint.eyeLevelY);

    const threePointLowAngle = computePerspectiveRigFrom3dCamera({
      mode: "3p",
      yawDeg: 28,
      pitchDeg: 22,
      fovDeg: 62,
      canvasWidth: 800,
      canvasHeight: 1200,
    });
    expect(threePointLowAngle.points).toHaveLength(3);
    // Positive pitch (looking up) shifts horizon downward (eyeLevelY > 600) and zenith VP upward (< 600)
    expect(threePointLowAngle.eyeLevelY).toBeGreaterThan(600);
    const verticalVp = threePointLowAngle.points.find((p) => p.axis === "y-vertical");
    expect(verticalVp?.y).toBeLessThan(600);
  });

  it("원근자 패널에서 스냅 작동 상태 배지와 3D 카메라 구도 연동 프리셋을 노출한다", () => {
    const onSyncFrom3dCamera = vi.fn();
    const { container } = render(
      <StudioPerspectivePanel
        active
        points={[
          { id: "vp-1", x: 100, y: 500 },
          { id: "vp-2", x: 900, y: 500 },
        ]}
        eyeLevelY={500}
        lockHorizon
        canvasWidth={800}
        canvasHeight={1200}
        onToggleActive={vi.fn()}
        onAddPoint={vi.fn()}
        onRemovePoint={vi.fn()}
        onMovePoint={vi.fn()}
        onSyncFrom3dCamera={onSyncFrom3dCamera}
      />,
    );

    const statusBanner = container.querySelector('[data-studio-perspective-snap-status="true"]');
    expect(statusBanner?.getAttribute("data-snap-engaged")).toBe("true");
    expect(screen.getByText("원근 스냅 작동 중 (2점)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "3점 로우앵글" }));
    expect(onSyncFrom3dCamera).toHaveBeenCalledTimes(1);
    expect(onSyncFrom3dCamera.mock.calls[0]?.[0]?.mode).toBe("3p");
    expect(onSyncFrom3dCamera.mock.calls[0]?.[0]?.points).toHaveLength(3);
  });

  it("상단 빠른 작업 바에서 원근 스냅 토글과 활성 소실점 수를 한눈에 확인하고 전환한다", () => {
    const setPerspectiveRulerActive = vi.fn();
    render(
      <StudioDrawingQuickErgonomicsBar
        session={createErgonomicsSession({ setPerspectiveRulerActive })}
      />,
    );

    const quickBtn = screen.getByRole("button", { name: /원근 스냅 2점/ });
    expect(quickBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(quickBtn);
    expect(setPerspectiveRulerActive).toHaveBeenCalledTimes(1);

    const offSummary = describePerspectiveSnapStatus({
      active: false,
      vanishingPointCount: 2,
    });
    expect(offSummary.snapEngaged).toBe(false);
    expect(offSummary.badgeLabel).toBe("원근 스냅 꺼짐");
  });
});
