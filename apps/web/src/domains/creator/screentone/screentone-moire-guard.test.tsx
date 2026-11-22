// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScreentoneLayerPanel } from "./ScreentoneLayerPanel";
import { normalizeScreentoneLayer, type ScreentoneLayer } from "./screentone-layer";
import {
  computeScreentoneAngleSeparationDeg,
  inspectScreentoneMoireRisk,
  inspectScreentoneStackMoire,
  measureHalftoneCellCoverageSpread,
  recommendSafeScreentoneAngle,
  renderScreentone,
  snapScreentoneToDevicePixels,
  type ScreentoneRenderContext,
} from "./screentone-render";

afterEach(cleanup);

function createFakeContext(): {
  readonly ctx: ScreentoneRenderContext;
  readonly getPixels: () => Uint8ClampedArray;
} {
  let captured = new Uint8ClampedArray(0);
  const ctx: ScreentoneRenderContext = {
    createImageData(sw: number, sh: number): ImageData {
      const data = new Uint8ClampedArray(sw * sh * 4);
      return { data, width: sw, height: sh, colorSpace: "srgb" } as ImageData;
    },
    putImageData(imagedata: ImageData): void {
      captured = imagedata.data;
    },
  };
  return { ctx, getPixels: () => captured };
}

describe("축 04 · 흑백/모노톤 출판용 스크린톤 각도 모와레 경고 검사기 (#019)", () => {
  it("도트/격자(90° 대칭)와 사선(180° 대칭)의 겹톤 각도 차를 정확히 계산한다", () => {
    // 45° 도트와 135° 도트는 90° 회전 대칭으로 사실상 0° 중첩(강한 모와레 위험)
    expect(computeScreentoneAngleSeparationDeg(45, 135, "dot", "dot")).toBe(0);
    // 45°와 15° 또는 75°는 표준 인쇄 30° 로제트 안전 각도
    expect(computeScreentoneAngleSeparationDeg(45, 15, "dot", "dot")).toBe(30);
    expect(computeScreentoneAngleSeparationDeg(45, 75, "dot", "dot")).toBe(30);
    // 사선은 180° 대칭이므로 45°와 135°는 90° 직교 교차(안전)
    expect(computeScreentoneAngleSeparationDeg(45, 135, "line", "line")).toBe(90);
    // 모래망점(sand)은 비주기 확률 노이즈이므로 null
    expect(computeScreentoneAngleSeparationDeg(45, 45, "sand", "dot")).toBeNull();
  });

  it("겹톤 각도 차 15° 미만은 high 경고, 30° 분리는 안전(none)으로 판정한다", () => {
    const baseLayer = normalizeScreentoneLayer({ kind: "dot", lines: 30, density: 40, angle: 45 });
    const colliding = normalizeScreentoneLayer({ kind: "dot", lines: 30, density: 35, angle: 50 });
    const mildRisk = normalizeScreentoneLayer({ kind: "dot", lines: 30, density: 35, angle: 65 });
    const safeRosette = normalizeScreentoneLayer({ kind: "dot", lines: 30, density: 35, angle: 15 });

    const highReport = inspectScreentoneMoireRisk(colliding, { companionLayers: [baseLayer] });
    expect(highReport.hasWarning).toBe(true);
    expect(highReport.severity).toBe("high");
    expect(highReport.isPrintSafeMonochrome).toBe(false);
    expect(highReport.warnings[0]?.code).toBe("stacked-angle-collision");
    expect(highReport.recommendedAngleDeg).toBe(15);

    const medReport = inspectScreentoneMoireRisk(mildRisk, { companionLayers: [baseLayer] });
    expect(medReport.hasWarning).toBe(true);
    expect(medReport.severity).toBe("medium");

    const safeReport = inspectScreentoneMoireRisk(safeRosette, { companionLayers: [baseLayer] });
    expect(safeReport.hasWarning).toBe(false);
    expect(safeReport.severity).toBe("none");
    expect(safeReport.isPrintSafeMonochrome).toBe(true);
  });

  it("직교 0°/90° 도트 앨리어싱과 다중 스택 모와레 검사가 정확히 동작한다", () => {
    const orthoDot = normalizeScreentoneLayer({ kind: "dot", lines: 60, density: 40, angle: 0 });
    const orthoReport = inspectScreentoneMoireRisk(orthoDot);
    expect(orthoReport.hasWarning).toBe(true);
    expect(orthoReport.warnings.some((w) => w.code === "orthogonal-grid-aliasing")).toBe(true);
    expect(recommendSafeScreentoneAngle("dot")).toBe(45);

    const stack: readonly ScreentoneLayer[] = [
      normalizeScreentoneLayer({ kind: "dot", lines: 40, density: 30, angle: 45 }),
      normalizeScreentoneLayer({ kind: "dot", lines: 40, density: 30, angle: 138 }),
    ];
    const stackReport = inspectScreentoneStackMoire(stack);
    expect(stackReport.severity).toBe("high");
    expect(stackReport.minAngleSeparationDeg).toBe(3);
  });

  it("ScreentoneLayerPanel이 겹톤 모와레 경고를 표시하고 권장 각도 버튼 클릭 시 안전 각도로 보정한다", () => {
    const onChange = vi.fn();
    const companion = normalizeScreentoneLayer({ kind: "dot", lines: 30, density: 40, angle: 45 });
    const current = normalizeScreentoneLayer({ kind: "dot", lines: 30, density: 35, angle: 48 });

    render(
      <ScreentoneLayerPanel
        value={current}
        companionLayers={[companion]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("모와레");
    fireEvent.click(screen.getByRole("button", { name: /권장 각도 15° 적용/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ angle: 15 }));
  });
});

describe("축 04 · 120%·150% 분수 DPR 하프톤 도트 계단 모와레 방지 디바이스 픽셀 정수 스냅 (#020)", () => {
  it("120%(1.2×)와 150%(1.5×) 분수 DPR에서 망점 셀 주기와 원점을 물리 디바이스 픽셀 정수로 스냅한다", () => {
    // lines=45 -> rawCssCellPx=7 -> 7 * 1.2 = 8.4px(비정수) -> 8px 정수 스냅
    const snap120 = snapScreentoneToDevicePixels({
      lines: 45,
      dpr: 1.2,
      originCssPx: [3.3, 1.7],
    });
    expect(snap120.isFractionalDpr).toBe(true);
    expect(snap120.rawDeviceCellPx).toBeCloseTo(8.4, 3);
    expect(snap120.snappedDeviceCellPx).toBe(8);
    expect(Number.isInteger(snap120.snappedDeviceCellPx)).toBe(true);
    expect(Number.isInteger(snap120.snappedOriginDevicePx[0])).toBe(true);
    expect(Number.isInteger(snap120.snappedOriginDevicePx[1])).toBe(true);
    expect(snap120.eliminatesBeatMoire).toBe(true);

    // lines=60 -> rawCssCellPx=5 -> 5 * 1.5 = 7.5px(비정수) -> 8px 정수 스냅
    const snap150 = snapScreentoneToDevicePixels({
      lines: 60,
      dpr: 1.5,
      originCssPx: [2.25, 4.75],
    });
    expect(snap150.isFractionalDpr).toBe(true);
    expect(snap150.rawDeviceCellPx).toBeCloseTo(7.5, 3);
    expect(snap150.snappedDeviceCellPx).toBe(8);
    expect(Number.isInteger(snap150.snappedDeviceCellPx)).toBe(true);
    expect(snap150.eliminatesBeatMoire).toBe(true);
  });

  it("150%(1.5×)와 120%(1.2×) 분수 DPR 실렌더에서 정수 스냅이 도트 셀 계단 모와레 편차를 0으로 제거한다", () => {
    const cases: readonly { readonly dpr: number; readonly lines: number }[] = [
      { dpr: 1.5, lines: 60 }, // 5 * 1.5 = 7.5px -> snapped 8px
      { dpr: 1.2, lines: 45 }, // 7 * 1.2 = 8.4px -> snapped 8px
    ];

    for (const testCase of cases) {
      const layer = normalizeScreentoneLayer({
        kind: "dot",
        lines: testCase.lines,
        density: 40,
        angle: 0,
      });
      const width = 96;
      const height = 96;

      const unsnappedCtx = createFakeContext();
      renderScreentone(unsnappedCtx.ctx, width, height, layer, null, {
        dpr: testCase.dpr,
        snapToDevicePixels: false,
      });

      const snappedCtx = createFakeContext();
      renderScreentone(snappedCtx.ctx, width, height, layer, null, {
        dpr: testCase.dpr,
        snapToDevicePixels: true,
      });

      const snapPlan = snapScreentoneToDevicePixels({ lines: testCase.lines, dpr: testCase.dpr });
      const unsnappedSpread = measureHalftoneCellCoverageSpread(
        unsnappedCtx.getPixels(),
        width,
        height,
        snapPlan.snappedDeviceCellPx,
      );
      const snappedSpread = measureHalftoneCellCoverageSpread(
        snappedCtx.getPixels(),
        width,
        height,
        snapPlan.snappedDeviceCellPx,
      );

      // 비스냅 분수 DPR에서는 주기 불일치로 셀 커버리지 편차가 발생하지만, 정수 스냅 후에는 0으로 수렴
      expect(unsnappedSpread.maxSpread).toBeGreaterThan(0.01);
      expect(snappedSpread.maxSpread).toBe(0);
      expect(snappedSpread.stdDev).toBe(0);
    }
  });

  it("분수 DPR에서 스냅이 꺼져 있을 때 모와레 검사기가 fractional-dpr-staircase 경고를 보고한다", () => {
    const layer = normalizeScreentoneLayer({ kind: "dot", lines: 60, density: 40, angle: 45 });
    const offReport = inspectScreentoneMoireRisk(layer, { dpr: 1.5, snapEnabled: false });
    expect(offReport.warnings.some((w) => w.code === "fractional-dpr-staircase")).toBe(true);

    const onReport = inspectScreentoneMoireRisk(layer, { dpr: 1.5, snapEnabled: true });
    expect(onReport.warnings.some((w) => w.code === "fractional-dpr-staircase")).toBe(false);
  });
});
