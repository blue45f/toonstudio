// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QUADRATIC_PIGMENT_MODEL } from "../../engine/pigment/quadratic-pigment-model";
import * as downloads from "../../platform/download";
import { BrushLabApp } from "../shell/BrushLabApp";
import { createDrawStore } from "../state/draw-store";
import { createLabStore } from "../state/lab-store";
import { installCanvasStub } from "../testing/canvas-stub";
import { mockDescriptor, mockEnvironment } from "../testing/mock-lane";
import { createMockRunner } from "../testing/mock-runner";

import type { CanvasStubRecorder } from "../testing/canvas-stub";

let canvas: CanvasStubRecorder;
beforeEach(() => {
  canvas = installCanvasStub();
});
afterEach(() => {
  cleanup();
  canvas.restore();
  vi.restoreAllMocks();
});

function renderBenchmark() {
  const store = createLabStore({ tab: "report" });
  const drawStore = createDrawStore();
  render(
    <BrushLabApp
      registry={[mockDescriptor({ id: "cpu-reference", label: "CPU 참조" })]}
      env={mockEnvironment()}
      runner={createMockRunner()}
      store={store}
      drawStore={drawStore}
      gallery={null}
      galleryError="없음"
      autoProbe={false}
    />,
  );
  return { store, drawStore };
}

describe("벤치마크의 로컬 이차 안료 모델과 JSON v2", () => {
  it("기존 혼색 수치·슬라이더·프로파일 적용을 유지하고 로컬 모델을 승격 필터에서 제외한다", () => {
    const { store, drawStore } = renderBenchmark();
    const rowId = `lab-engine-row-${QUADRATIC_PIGMENT_MODEL.id}`;
    expect(screen.getByTestId(rowId).textContent).toContain("로컬 실험 모델");
    expect(screen.getByTestId(rowId).textContent).toContain("운영 승격 불가");
    expect(screen.getByTestId("lab-quadratic-pigment-status").textContent).toContain("계수 원산지");
    const readout = screen.getByTestId("lab-wave36-live-readout");
    expect(readout.textContent).toContain("이차 안료 7D RGB(89,151,65)");
    fireEvent.change(screen.getByTestId("lab-wave36-pigment-ratio-slider"), { target: { value: "0.25" } });
    expect(readout.textContent).not.toContain("이차 안료 7D RGB(89,151,65)");
    fireEvent.click(screen.getByTestId("lab-Filter-promoted-engines-btn"));
    expect(screen.queryByTestId(rowId)).toBeNull();
    fireEvent.click(screen.getByTestId("lab-Filter-promoted-engines-btn"));
    expect(screen.getByTestId(rowId)).toBeTruthy();
    fireEvent.click(screen.getByTestId("lab-apply-optimal-profile-btn"));
    expect(store.get().presetId).toBe("watercolor-wet");
    expect(drawStore.get().presetId).toBe("watercolor-wet");
    expect(store.get().overrides.kmBeta).toBe(true);

    // Brush Verify AI & 5-Lens Remix & Genre Preset assertions
    expect(screen.getByTestId("lab-brush-verify-ai-badge").textContent).toContain("Brush Verify AI PASS");
    fireEvent.click(screen.getByTestId("lab-genre-preset-noir-heavy-halftone"));
    expect(store.get().presetId).toBe("charcoal-grain");
    fireEvent.click(screen.getByTestId("lab-brush-fresh-lens-what-they-missed"));
    expect(screen.getByTestId("lab-brush-fresh-lens-detail").textContent).toContain("5. 🎯 WHAT THEY MISSED");
  });

  it("다운로드 버튼은 v2 파일명·모델 키·비승격 분류와 기존 혼색 지표를 내보낸다", () => {
    const download = vi.spyOn(downloads, "downloadJson").mockImplementation(() => undefined);
    renderBenchmark();
    fireEvent.click(screen.getByTestId("lab-export-bench-json-btn"));
    expect(download).toHaveBeenCalledTimes(1);
    const call = download.mock.calls[0];
    if (!call) throw new Error("벤치마크 JSON 다운로드 호출이 필요합니다.");
    expect(call[0]).toBe("brush-lab-service-promotion-benchmark-v2-20261027.json");
    const payload: unknown = JSON.parse(call[1]);
    expect(payload).toMatchObject({
      schemaVersion: 2,
      localPigmentModel: { id: QUADRATIC_PIGMENT_MODEL.id, coefficientOrigin: "unverified", servicePromotionAllowed: false },
      summaryReport: { quadraticPigmentEndpointIdentityError: 0 },
      optimalProfile: { selectedPrimaryEngineId: "sumi-webgpu-zero-copy-indirect" },
    });
    expect(payload).toMatchObject({
      engineMatrix: expect.arrayContaining([expect.objectContaining({ engineId: QUADRATIC_PIGMENT_MODEL.id, promotedToService: false, compositeScore100: 99.5 })]),
    });
  });
});
