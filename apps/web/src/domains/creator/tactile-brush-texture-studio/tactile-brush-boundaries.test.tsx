// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StudioTactileBrushTexturePanel, createTactileBrushSession, evaluateFrameBudgetPlan,
  evaluateTactileStampMetrics, exportTactileBrushRecipeJson, formatOklch,
  generatePaperGrainTileLut, getActiveTactileConfig, samplePaperCrossSection,
} from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const selectPreview = (): void => { fireEvent.click(screen.getByTestId("tactile-brush-preset-wet-watercolor")); };

describe("LUT·수치·레시피 입력 경계", () => {
  it.each([0, 4095, 4097])("길이 %i LUT는 계산 전에 거절한다", (length) => {
    const lut = { ...generatePaperGrainTileLut("hanji"), height: new Float32Array(length) };
    expect(() => evaluateTactileStampMetrics({ brushId: "dry-sumi", paperId: "hanji", lut })).toThrow(/LUT/);
  });

  it.each(["size", "height", "normalX", "normalY", "peakMean"])("LUT %s의 비정상 크기·비유한값을 거절한다", (key) => {
    const lut = generatePaperGrainTileLut("hanji");
    if (key === "size") Object.defineProperty(lut, key, { value: 32 });
    else if (key === "peakMean") Object.defineProperty(lut, key, { value: Number.NaN });
    else if (key === "height" || key === "normalX" || key === "normalY") lut[key][7] = Number.NaN;
    expect(() => evaluateTactileStampMetrics({ brushId: "dry-sumi", paperId: "hanji", lut })).toThrow(/LUT/);
  });

  it("공개 비용·색상·샘플 함수가 비유한 입력을 출력에 전파하지 않는다", () => {
    const plan = evaluateFrameBudgetPlan({
      targetRefreshHz: 120, guardEnabled: true, velocityPxPerSec: 500, radiusPx: 20,
      baseSpacingRatio: 0.1, rawFilamentCount: 8,
      controls: { paperToothStrength: Number.NaN, dryBristleSplit: -10, wetEdgePooling: Number.POSITIVE_INFINITY, impastoRelief: 20 },
    });
    expect(Number.isFinite(plan.estimatedFrameMs)).toBe(true);
    expect(plan.estimatedFrameMs).toBeGreaterThanOrEqual(0);
    expect(formatOklch({ l: 0.5, c: 0.1, h: Number.NaN })).not.toContain("NaN");
    expect(formatOklch({ l: 0.5, c: 0.1, h: Number.POSITIVE_INFINITY })).not.toContain("NaN");
    expect(samplePaperCrossSection(generatePaperGrainTileLut("hanji"), 24, Number.NaN)).toHaveLength(32);
  });

  it("다른 구성의 캐시와 동일 구성의 변조된 수치를 신뢰하지 않고 엔진에서 다시 계산한다", () => {
    const session = createTactileBrushSession("gpen-ink");
    const active = getActiveTactileConfig(session);
    const expected = evaluateTactileStampMetrics(active);
    const stale = evaluateTactileStampMetrics({ brushId: "impasto-oil", paperId: "linen-canvas" });
    const stalePayload = JSON.parse(exportTactileBrushRecipeJson(session, stale));
    expect(stalePayload.shaderUniforms.uImpastoReliefMm).toBe(expected.impasto.ridgeThicknessMm);
    expect(stalePayload.brushPreset.radiusPx).toBe(expected.radiusPx);
    const forged = { ...expected, impasto: { ...expected.impasto, ridgeThicknessMm: 999 } };
    const payload = JSON.parse(exportTactileBrushRecipeJson(session, forged));
    expect(payload.shaderUniforms.uImpastoReliefMm).toBe(expected.impasto.ridgeThicknessMm);
  });

  it("동일 구성의 정상 radiusPx·inkLoad 옵션과 유효 LUT는 보존한다", () => {
    const session = createTactileBrushSession("dry-sumi");
    const active = getActiveTactileConfig(session);
    const metrics = evaluateTactileStampMetrics({ ...active, radiusPx: 57.5, inkLoad: 0.37, lut: generatePaperGrainTileLut(active.paperId) });
    const payload = JSON.parse(exportTactileBrushRecipeJson(session, metrics));
    expect(payload.brushPreset.radiusPx).toBe(57.5);
    expect(payload.stampOptions).toEqual({ radiusPx: 57.5, inkLoad: 0.37 });
    expect(payload.shaderUniforms.uBristleFilamentCount).toBe(metrics.splitBristle.activeFilamentCount);
  });
});

describe("예제 표시와 전달 확인", () => {
  it("CPU SVG·비용 모델과 실제 GPU·원고·저장을 구분한다", () => {
    render(<StudioTactileBrushTexturePanel />);
    expect(screen.getByTestId("tactile-example-disclosure").textContent).toContain("실제 GPU");
    fireEvent.click(screen.getByTestId("tactile-toggle-json-btn"));
    const payload = JSON.parse(screen.getByTestId("tactile-json-preview").textContent ?? "{}");
    expect(payload.execution).toEqual({ backend: "cpu-analytical-svg-example", gpuExecuted: false, pixelRenderingPerformed: false, sceneMutationVerified: false, persistenceVerified: false });
  });

  it("완료 전 적용을 확정하지 않고 중복 요청·입력 변경을 막는다", async () => {
    let acknowledge: (() => void) | undefined;
    const onApply = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    render(<StudioTactileBrushTexturePanel onApply={onApply} />);
    selectPreview();
    fireEvent.click(screen.getByTestId("tactile-apply-btn"));
    fireEvent.click(screen.getByTestId("tactile-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("tactile-session-status-badge").textContent).not.toContain("적용됨");
    expect(screen.getByTestId("tactile-hz-60-btn").matches(":disabled")).toBe(true);
    await act(async () => { acknowledge?.(); });
    expect(screen.getByTestId("tactile-session-status-badge").textContent).toContain("예제 적용됨");
  });

  it.each(["throw", "reject", "decline"])("%s 전달 실패 뒤 기존 void 콜백으로 다시 시도한다", async (mode) => {
    const failed = vi.fn(() => {
      if (mode === "throw") throw new Error("적용 실패");
      if (mode === "reject") return Promise.reject(new Error("적용 실패"));
      return { accepted: false, message: "적용 거절" };
    });
    const view = render(<StudioTactileBrushTexturePanel onApply={failed} />);
    selectPreview(); fireEvent.click(screen.getByTestId("tactile-apply-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("tactile-session-status-badge").textContent).not.toContain("적용됨");
    const delivered: string[] = [];
    view.rerender(<StudioTactileBrushTexturePanel onApply={() => delivered.push("accepted")} />);
    fireEvent.click(screen.getByTestId("tactile-apply-btn"));
    expect(delivered).toEqual(["accepted"]);
    expect(screen.getByTestId("tactile-session-status-badge").textContent).toContain("예제 적용됨");
  });

  it("실제 전달 후 되돌림도 확인하며 실패 시 적용 구성을 보존한다", async () => {
    const onRevert = vi.fn().mockRejectedValueOnce(new Error("되돌림 실패")).mockResolvedValueOnce(undefined);
    render(<StudioTactileBrushTexturePanel onRevert={onRevert} />);
    selectPreview(); fireEvent.click(screen.getByTestId("tactile-apply-btn"));
    fireEvent.click(screen.getByTestId("tactile-revert-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("tactile-comparison-svg").getAttribute("data-brush-id")).toBe("wet-watercolor");
    fireEvent.click(screen.getByTestId("tactile-revert-btn"));
    await waitFor(() => expect(screen.getByTestId("tactile-comparison-svg").getAttribute("data-brush-id")).toBe("dry-sumi"));
  });

  it("복사 실패는 알리고 미리보기와 같은 버튼의 재시도를 제공한다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("복사 거절")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioTactileBrushTexturePanel />);
    fireEvent.click(screen.getByTestId("tactile-copy-json-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("tactile-json-preview")).toBeTruthy();
    expect(screen.getByTestId("tactile-status-banner").textContent).not.toContain("복사했습니다");
    fireEvent.click(screen.getByTestId("tactile-copy-json-btn"));
    await waitFor(() => expect(screen.getByTestId("tactile-status-banner").textContent).toContain("복사했습니다"));
  });

  it("받는 쪽의 거절은 처리하고 클립보드와 중복 전송하지 않는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioTactileBrushTexturePanel onExportJson={() => Promise.resolve({ accepted: false })} />);
    fireEvent.click(screen.getByTestId("tactile-copy-json-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(writeText).not.toHaveBeenCalled();
  });
});
