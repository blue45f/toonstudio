// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAtelierIsaBrushUltraPanel, exportAtelierIsaBrushJson, resolveCpuIsaDispatchPlan } from "../index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const UNEXECUTED = {
  capabilityProbePerformed: false, wasmInstantiated: false, gpuSubmitted: false,
  nativeFfiInvoked: false, documentModified: false, persistencePerformed: false,
} as const;

describe("ISA 계획과 실제 실행의 경계", () => {
  it("기본값이나 호출자가 제공한 capability 가정으로 하드웨어 실행 완료를 주장하지 않는다", () => {
    const probe = vi.spyOn(WebAssembly, "validate");
    for (const executionBoundary of ["browser-web-standard", "native-ffi-bridge"] as const) {
      const plan = resolveCpuIsaDispatchPlan({
        profileId: "x86-intel-amx-avx512", executionBoundary,
        browserCapabilities: { simd128: true, relaxedSimd: true, memory64: true, sharedArrayBuffer: true, atomicsWaitAsync: true },
      });
      expect(plan.browserImmediateReady).toBe(false);
      expect(plan).toMatchObject({ plannedBoundary: executionBoundary, executionEvidence: UNEXECUTED, capabilitySource: "caller-assumptions" });
      expect(plan).toHaveProperty("plannedWasmStack", expect.arrayContaining(["WASM SIMD128", "WASM64 (Memory64)"]));
    }
    expect(resolveCpuIsaDispatchPlan()).toHaveProperty("capabilitySource", "default-design-assumptions");
    expect(probe).not.toHaveBeenCalled();
  });

  it("JSON은 명령어·메모리·스레드 수를 실행 계획으로만 내보내며 기존 active 별칭을 노출하지 않는다", () => {
    const { payload, json } = exportAtelierIsaBrushJson({ executionBoundary: "native-ffi-bridge", profileId: "arm64-apple-amx-sme" });
    expect(payload).toMatchObject({ executionEvidence: UNEXECUTED });
    expect(payload.isaDispatch).toMatchObject({ plannedBoundary: "native-ffi-bridge", executionEvidence: UNEXECUTED });
    expect(payload.isaDispatch).toHaveProperty("plannedMemoryAddressingMode", "wasm64-memory64");
    expect(payload.isaDispatch).toHaveProperty("plannedThreadSyncMode", "sab-atomics-wait-async");
    expect(payload.isaDispatch).toHaveProperty("plannedWorkerPoolSlots", 7);
    expect(json).not.toMatch(/"(?:activeBoundary|activeInstructions|activeWasmStack|memoryAddressingMode|threadSyncMode|workerPoolSlots)"/u);
    expect(json).toContain('"plannedInstructions"');
    expect(payload.wgslValidation.gpuCompiled).toBe(false);
  });

  it.each(["ko", "en"] as const)("%s 화면·접근성 안내는 CPU/SVG 계산과 미검증 ISA 계획을 구분한다", (locale) => {
    render(<StudioAtelierIsaBrushUltraPanel locale={locale} />);
    const root = screen.getByTestId("studio-atelier-isa-brush-ultra-panel");
    const scope = screen.getByTestId("isa-execution-scope");
    expect(root.getAttribute("aria-label")).toContain("CPU/SVG");
    expect(root.getAttribute("aria-describedby")).toBe(scope.id);
    expect(scope.textContent).toContain(locale === "ko" ? "원고 저장" : "manuscript persistence");
    expect(screen.getByTestId("execution-boundary-badge").getAttribute("data-execution-status")).toBe("not-performed");
    expect(screen.getByTestId("ultra-honesty-notice").textContent).not.toMatch(/즉시 동작|immediately execute|활성화되며/u);
    fireEvent.click(screen.getByTestId("boundary-native-btn"));
    expect(screen.getByTestId("execution-boundary-badge").textContent).toContain(locale === "ko" ? "계획" : "Plan");
  });

  it("JSON 복사와 외부 콜백도 실행·저장 성공이 아닌 같은 계획 명세를 전달한다", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const onExportJson = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioAtelierIsaBrushUltraPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("copy-ultra-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledOnce());
    expect(onExportJson).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ executionEvidence: UNEXECUTED }));
    const exported: unknown = JSON.parse(writeText.mock.calls[0]?.[0] ?? "null");
    expect(exported).toMatchObject({ executionEvidence: UNEXECUTED });
    expect(writeText.mock.calls[0]?.[0]).not.toContain('"activeInstructions"');
  });
});
