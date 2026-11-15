// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioBg3dPlacementPreviewBar,
  StudioBg3dSnapAndAxisQuickCard,
} from "./StudioBg3dPlacementAndAxisHud";
import {
  diagnoseStudioBg3dGlbUnitAndAxis,
  standUpZUpRotation,
} from "./studio-bg3d-glb-unit-axis-diagnostics";
import { scaleStudioBg3dMetricPlacementAsset } from "./studio-bg3d-model-metric-placement";
import {
  DEFAULT_STUDIO_BG3D_SNAP_SETTINGS,
  type StudioBg3dSnapSettings,
} from "./studio-bg3d-object-ops";

afterEach(() => {
  cleanup();
});

describe("P2-18 GLB 단위·축 진단 및 3D 배치 HUD", () => {
  it("표준 미터(1m)·Y-up GLB는 경고 없이 정상으로 판정한다", () => {
    const report = diagnoseStudioBg3dGlbUnitAndAxis({
      rawSize: [0.65, 1.75, 0.45],
      rawMinY: 0,
    });
    expect(report.hasWarning).toBe(false);
    expect(report.unitAnomaly).toBe("none");
    expect(report.axisAnomaly).toBe("none");
  });

  it("밀리미터(1000×) 및 Z-up으로 누운 GLB를 동시에 감지해 보정 안내를 반환한다", () => {
    const report = diagnoseStudioBg3dGlbUnitAndAxis({
      rawSize: [620, 340, 1820],
      rawMinY: 0,
    });
    expect(report.hasWarning).toBe(true);
    expect(report.unitAnomaly).toBe("millimeters-1000x");
    expect(report.axisAnomaly).toBe("z-up-suspected");
    expect(report.recommendedScaleFactor).toBe(0.001);
    expect(report.recommendedXRotationDeg).toBe(-90);
    expect(report.headlineKo).toContain("밀리미터");
    expect(report.headlineKo).toContain("Z-up");
  });

  it("센티미터(100×)·초소형(0.01×)·피벗 바닥 아래 매몰을 각각 구분하고 번들 환경은 오탐하지 않는다", () => {
    const cmReport = diagnoseStudioBg3dGlbUnitAndAxis({
      rawSize: [55, 172, 48],
      rawMinY: 0,
    });
    expect(cmReport.unitAnomaly).toBe("centimeters-100x");

    const envReport = diagnoseStudioBg3dGlbUnitAndAxis({
      rawSize: [18, 4.5, 52],
      rawMinY: 0,
      isBundledEnvironment: true,
    });
    expect(envReport.hasWarning).toBe(false);

    const microReport = diagnoseStudioBg3dGlbUnitAndAxis({
      rawSize: [0.008, 0.018, 0.005],
      rawMinY: 0,
    });
    expect(microReport.unitAnomaly).toBe("microscopic-0.01x");

    const sunkReport = diagnoseStudioBg3dGlbUnitAndAxis({
      rawSize: [1.0, 2.0, 1.0],
      rawMinY: -1.75,
    });
    expect(sunkReport.axisAnomaly).toBe("sunk-below-floor");
  });

  it("standUpZUpRotation은 기존 Y/Z 회전을 보존한 채 X축만 -90도 세운다", () => {
    const rotated = standUpZUpRotation([0, Math.PI / 3, 0.1]);
    expect(rotated[0]).toBeCloseTo(-Math.PI / 2, 6);
    expect(rotated[1]).toBeCloseTo(Math.PI / 3, 6);
    expect(rotated[2]).toBeCloseTo(0.1, 6);
  });

  it("scaleStudioBg3dMetricPlacementAsset은 정규화 배율을 역산해 미리보기 자산에 glbDiagnostics를 첨부한다", () => {
    const normalizationScale = 2 / 1800;
    const asset = scaleStudioBg3dMetricPlacementAsset(
      {
        modelId: "custom-glb-desk",
        name: "밀리미터 책상.glb",
        size: [1200 * normalizationScale, 300 * normalizationScale, 1800 * normalizationScale],
        localInsertionPoint: [0, 0, 0],
      },
      undefined,
      {
        root: {} as never,
        normalizationScale,
        genericHints: { nodeNames: ["Desk_Root"] },
      },
    );
    expect(asset.glbDiagnostics.hasWarning).toBe(true);
    expect(asset.glbDiagnostics.unitAnomaly).toBe("millimeters-1000x");
    expect(asset.glbDiagnostics.axisAnomaly).toBe("z-up-suspected");
  });

  it("배치 미리보기 바에 GLB 단위·축 경고 배너를 즉시 표시한다", () => {
    const report = diagnoseStudioBg3dGlbUnitAndAxis({
      rawSize: [700, 320, 1750],
      rawMinY: 0,
    });
    render(
      <StudioBg3dPlacementPreviewBar
        assetName="카페 의자.glb"
        targetKind="ground"
        glbDiagnostics={report}
        viewportButtonClassName="btn"
        onRotateCounterClockwise={vi.fn()}
        onRotateClockwise={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const alert = screen.getByTestId("bg3d-glb-unit-axis-preview-alert");
    expect(alert.textContent).toContain("GLB 밀리미터");
    expect(alert.textContent).toContain("위쪽 축(Z-up → Y-up) 오류 의심");
  });

  it("스냅이 꺼져 있어도 축 고정·바닥 맞춤·Z-up 원클릭 세우기가 동작한다", () => {
    const onGround = vi.fn();
    const onStandUp = vi.fn();
    const zUpReport = diagnoseStudioBg3dGlbUnitAndAxis({
      rawSize: [1.0, 0.35, 1.9],
      rawMinY: 0,
    });

    function Harness() {
      const [settings, setSettings] = useState<StudioBg3dSnapSettings>(
        DEFAULT_STUDIO_BG3D_SNAP_SETTINGS,
      );
      return (
        <div>
          <span data-testid="active-lock">{settings.axisLock ?? "xyz"}</span>
          <StudioBg3dSnapAndAxisQuickCard
            snapSettings={settings}
            setSnapSettings={setSettings}
            hasSelection={true}
            selectedIsLocked={false}
            onGroundSelected={onGround}
            selectedGlbDiagnostics={zUpReport}
            onStandUpAndGroundSelectedModel={onStandUp}
          />
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("active-lock").textContent).toBe("xyz");

    fireEvent.click(screen.getByTestId("bg3d-axis-lock-xz"));
    expect(screen.getByTestId("active-lock").textContent).toBe("xz");

    fireEvent.click(screen.getByTestId("bg3d-axis-lock-x"));
    expect(screen.getByTestId("active-lock").textContent).toBe("x");

    fireEvent.click(screen.getByTestId("bg3d-quick-ground-btn"));
    expect(onGround).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("bg3d-glb-zup-fix-btn"));
    expect(onStandUp).toHaveBeenCalledTimes(1);
  });
});
