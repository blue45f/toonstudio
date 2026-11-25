// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioShaderPrewarmWebCodecsPanel, WGSL_PIPELINE_IDS, buildShaderWebCodecsPlan, computeDeterministicContentHash,
  exportShaderWebCodecsManifestJson, getExportPreset, normalizeShaderPrewarmConfig, planLocalWebCodecsExport, planShaderPrewarmWaves, resolveCodecFallbackChain, type ShaderWebCodecsCombinedPlan } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("계획·실행·입력 경계", () => {
  it("캐시 비활성은 override보다 우선하며 잘못된 ID·중복·큰 목록을 거부한다", () => {
    const input = { cacheHitEnabled: false, cachedPipelineIds: [WGSL_PIPELINE_IDS[0]] }; const before = structuredClone(input);
    expect(planShaderPrewarmWaves(input).tasks.every(task => !task.cacheHit)).toBe(true); expect(input).toEqual(before);
    expect(() => planShaderPrewarmWaves({ cachedPipelineIds: [WGSL_PIPELINE_IDS[0], WGSL_PIPELINE_IDS[0]] })).toThrow();
    expect(() => planShaderPrewarmWaves({ cachedPipelineIds: Array.from({ length: 13 }, () => WGSL_PIPELINE_IDS[0]) })).toThrow();
  });
  it("버전 Unicode·공백 원문을 보존하고 hash 자원 상한을 먼저 검사한다", () => {
    const tag = "  한글-é|버전  "; expect(normalizeShaderPrewarmConfig({ shaderVersionTag: tag }).shaderVersionTag).toBe(tag);
    expect(() => normalizeShaderPrewarmConfig({ shaderVersionTag: "x".repeat(257) })).toThrow();
    expect(() => computeDeterministicContentHash("x".repeat(65_537))).toThrow();
  });
  it("요구 예산보다 작은 소수 가정 용량을 반올림해 통과시키지 않는다", () => {
    const required = planLocalWebCodecsExport().opfsSafetyGate.requiredWorkspaceMb;
    const result = planLocalWebCodecsExport({ opfsFreeMb: required - 0.004 });
    expect(result.opfsSafetyGate.canStartExport).toBe(false); expect(result.opfsSafetyGate.status).toBe("blocked");
  });
  it("허용 범위의 소수 참고 단가를 계산 전에 반올림하지 않는다", () => {
    const result = planLocalWebCodecsExport({ presetId: "youtube-4k-3840x2160-60fps", durationSec: 1800, cloudRenderRateUsdPerMin: 0.015 });
    expect(result.serverCostSavings.cloudReferenceRateUsdPerMin).toBe(0.015); expect(result.serverCostSavings.cloudReferencePerExportUsd).toBe(0.45);
  });
  it("코덱·preset·지원 플래그가 잘못됐으면 지원 성공 후보를 만들지 않는다", () => {
    const preset = getExportPreset();
    expect(() => resolveCodecFallbackChain("av1", { ...preset, width: NaN })).toThrow();
    const flags = {}; Object.assign(flags, { av1: "false" }); expect(() => resolveCodecFallbackChain("av1", preset, flags)).toThrow();
  });
  it("기본·software 폴백 모두 지원·컴파일·실제 인코딩·OPFS·zero-copy 실측으로 표시하지 않는다", () => {
    const plan = buildShaderWebCodecsPlan({ exportConfig: { hardwareSupport: { av1: false, hevc: false, h264: false } } });
    const json = JSON.parse(exportShaderWebCodecsManifestJson(plan));
    expect(json.gpuCompiled).toBe(false); expect(json.encoded).toBe(false); expect(json.opfsWritten).toBe(false);
    expect(plan.webCodecsExport.codecResolution).toMatchObject({ capabilitySource: "caller-assumption", supportVerified: false });
    expect(plan.webCodecsExport).toMatchObject({ runtimeCanStartExport: false, zeroCopyMeasured: false });
  });
  it("외부 plan의 추가 메타데이터를 내보내지 않고 stale 수치를 거부한다", () => {
    const plan = buildShaderWebCodecsPlan(); Object.assign(plan.prewarm.config, { privateMemo: "synthetic-private-fixture" });
    const before = structuredClone(plan); expect(exportShaderWebCodecsManifestJson(plan)).not.toContain("synthetic-private-fixture"); expect(plan).toEqual(before);
    Object.assign(plan.webCodecsExport, { totalFrames: NaN }); expect(() => exportShaderWebCodecsManifestJson(plan)).toThrow();
  });
  it("클립보드 미지원은 복사 완료가 아니며 export 미연결은 로컬 준비로 표시한다", async () => {
    vi.stubGlobal("navigator", {}); render(<StudioShaderPrewarmWebCodecsPanel />);
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn")); expect(await screen.findByTestId("shader-codecs-copy-retry")).toBeTruthy();
    fireEvent.click(screen.getByTestId("export-manifest-json-btn")); expect(screen.getByTestId("shader-codecs-export-state").textContent).toContain("미연결");
  });
  it("plan 콜백 pending 중 중복을 막고 거절 뒤 최신 수신자에게 같은 결과를 재전달한다", async () => {
    const gate = Promise.withResolvers<void>(); const first = vi.fn(() => gate.promise); const latest = vi.fn();
    const view = render(<StudioShaderPrewarmWebCodecsPanel onPlanChange={first} />);
    fireEvent.click(screen.getByTestId("parallel-slot-1")); fireEvent.click(screen.getByTestId("parallel-slot-2")); expect(first).toHaveBeenCalledTimes(1);
    await act(async () => { gate.reject(new Error("수신 거절")); }); await screen.findByTestId("shader-codecs-plan-retry");
    view.rerender(<StudioShaderPrewarmWebCodecsPanel onPlanChange={latest} />); fireEvent.click(screen.getByTestId("shader-codecs-plan-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1)); expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
  });
});


describe("AVC 계획의 프로필·레벨", () => {
  it("4K60과1440p30 프리셋이 H.264 레벨의 매크로블록 예산을 넘지 않는다", () => {
    const limits: Readonly<Record<number, readonly [number, number]>> = { 42: [8704, 522240], 50: [22080, 589824], 51: [36864, 983040], 52: [36864, 2073600] };
    for (const presetId of ["youtube-4k-3840x2160-60fps", "webtoon-trailer-1440p-30fps"] as const) {
      const preset = getExportPreset(presetId); const candidate = resolveCodecFallbackChain("h264", preset);
      const level = Number.parseInt(candidate.activeCodecString.slice(-2), 16); const bound = limits[level];
      expect(bound).toBeDefined();
      const blocks = Math.ceil(preset.width / 16) * Math.ceil(preset.height / 16);
      expect(blocks).toBeLessThanOrEqual(bound?.[0] ?? 0); expect(blocks * preset.fps).toBeLessThanOrEqual(bound?.[1] ?? 0);
    }
  });
});


describe("실제 실행 없음·전달·내보내기 회귀", () => {
  it("API가 존재해도 실제 compile·지원probe·encode·저장을 호출하지 않는다", () => {
    const adapter = vi.fn(); const support = vi.fn(); const encode = vi.fn();
    vi.stubGlobal("navigator", { gpu: { requestAdapter: adapter } }); vi.stubGlobal("VideoEncoder", class { static isConfigSupported = support; encode = encode; });
    render(<StudioShaderPrewarmWebCodecsPanel />); fireEvent.click(screen.getByTestId("hw-fallback-av1-toggle"));
    expect(adapter).not.toHaveBeenCalled(); expect(support).not.toHaveBeenCalled(); expect(encode).not.toHaveBeenCalled();
    const plan = buildShaderWebCodecsPlan(); expect(plan.prewarm.gpuCompiled).toBe(false); expect(plan.webCodecsExport.runtimeCanStartExport).toBe(false);
    expect(plan.webCodecsExport.opfsSafetyGate).toMatchObject({ scope: "assumed-capacity-only", runtimeEnforced: false });
  });
  it("외부 task·waves·폴백 목록 크기와 stale 수치를 직렬화 전에 거부한다", () => {
    const plan = buildShaderWebCodecsPlan();
    const tooMany = { ...plan, prewarm: { ...plan.prewarm, tasks: Array.from({ length: 13 }, () => plan.prewarm.tasks[0]) } };
    expect(() => exportShaderWebCodecsManifestJson(tooMany)).toThrow();
    expect(() => exportShaderWebCodecsManifestJson({ ...plan, prewarm: { ...plan.prewarm, waves: [] } })).toThrow();
    const bad = structuredClone(plan); Object.assign(bad.prewarm.stutterComparison, { prewarmFirstStrokeBlockingMs: 99 }); expect(() => exportShaderWebCodecsManifestJson(bad)).toThrow();
    const input = { prewarm: { shaderVersionTag: " é 한글  " }, exportConfig: { durationSec: 60.5 } }; const before = structuredClone(input);
    const json = exportShaderWebCodecsManifestJson(buildShaderWebCodecsPlan(input)); expect(JSON.parse(json).prewarm.config.shaderVersionTag).toBe(input.prewarm.shaderVersionTag); expect(input).toEqual(before);
  });
  it("JSON 알림은 clipboard와 별개이며 pending/reject 후 최신 수신자에게 동일 결과만 재전달한다", async () => {
    const writeText = vi.fn(); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const gate = Promise.withResolvers<void>(); const first = vi.fn((_json: string, _plan: ShaderWebCodecsCombinedPlan) => gate.promise);
    const latest = vi.fn<(json: string, plan: ShaderWebCodecsCombinedPlan) => void>(); const view = render(<StudioShaderPrewarmWebCodecsPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("export-manifest-json-btn")); fireEvent.click(screen.getByTestId("export-manifest-json-btn")); expect(first).toHaveBeenCalledTimes(1); expect(writeText).not.toHaveBeenCalled();
    await act(async () => { gate.reject(new Error("수신 거절")); }); await screen.findByTestId("shader-codecs-export-retry");
    view.rerender(<StudioShaderPrewarmWebCodecsPanel onExportJson={latest} />); fireEvent.click(screen.getByTestId("shader-codecs-export-retry"));
    expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]); expect(writeText).not.toHaveBeenCalled();
  });
  it("copy는 실제 ACK까지 pending이며 거절 뒤 같은 JSON·UTF8 bytes로 재시도한다", async () => {
    const gate = Promise.withResolvers<void>(); const writeText = vi.fn((_text: string) => gate.promise); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const receiver = vi.fn(); render(<StudioShaderPrewarmWebCodecsPanel onExportJson={receiver} />);
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn")); fireEvent.click(screen.getByTestId("copy-manifest-json-btn")); expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("shader-codecs-copy-state").getAttribute("data-copy-state")).toBe("pending");
    await act(async () => { gate.reject(new Error("복사 거절")); }); await screen.findByTestId("shader-codecs-copy-retry");
    writeText.mockResolvedValue(undefined); fireEvent.click(screen.getByTestId("shader-codecs-copy-retry"));
    await waitFor(() => expect(screen.getByTestId("shader-codecs-copy-state").getAttribute("data-copy-state")).toBe("copied"));
    expect(writeText).toHaveBeenCalledTimes(2); expect(writeText.mock.calls[0]).toEqual(writeText.mock.calls[1]); expect(receiver).not.toHaveBeenCalled();
    const text = writeText.mock.calls[0]?.[0]; if (text) expect(screen.getByTestId("shader-codecs-copy-state").textContent).toContain(String(new TextEncoder().encode(text).byteLength));
  });
  it("수신자 throw·출력 수정은 원본 파이프라인·화면·재시도 정본을 바꾸지 않는다", async () => {
    const expected = buildShaderWebCodecsPlan({ prewarm: { parallelWaveSlots: 1, cacheHitEnabled: true }, exportConfig: { presetId: "youtube-4k-3840x2160-60fps", codecId: "av1", durationSec: 60, opfsFreeMb: 2048, hardwareSupport: { av1: true, hevc: true, h264: true } } });
    const bad = vi.fn((plan: ShaderWebCodecsCombinedPlan) => { Object.assign(plan.prewarm.tasks[0].pipeline, { labelKo: "외부 수정" }); throw new Error("수신 실패"); });
    const latest = vi.fn<(plan: ShaderWebCodecsCombinedPlan) => void>(); const view = render(<StudioShaderPrewarmWebCodecsPanel onPlanChange={bad} />);
    expect(() => fireEvent.click(screen.getByTestId("parallel-slot-1"))).not.toThrow(); await screen.findByTestId("shader-codecs-plan-retry");
    expect(buildShaderWebCodecsPlan({ prewarm: { parallelWaveSlots: 1 } })).toEqual(expected);
    view.rerender(<StudioShaderPrewarmWebCodecsPanel onPlanChange={latest} />); fireEvent.click(screen.getByTestId("shader-codecs-plan-retry")); expect(latest.mock.calls[0]?.[0]).toEqual(expected);
  });
  it("수신자 제거와 unmount 후 늦은 복사 응답은 완료 알림을 만들지 않는다", async () => {
    const receiver = vi.fn(() => { throw new Error("수신 실패"); }); const view = render(<StudioShaderPrewarmWebCodecsPanel onExportJson={receiver} />);
    fireEvent.click(screen.getByTestId("export-manifest-json-btn")); await screen.findByTestId("shader-codecs-export-retry"); view.rerender(<StudioShaderPrewarmWebCodecsPanel />);
    fireEvent.click(screen.getByTestId("shader-codecs-export-retry")); expect(screen.getByTestId("shader-codecs-export-state").textContent).toContain("실패"); expect(receiver).toHaveBeenCalledTimes(1);
    const gate = Promise.withResolvers<void>(); vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn((_text: string) => gate.promise) } });
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn")); view.unmount(); await act(async () => { gate.resolve(); }); expect(receiver).toHaveBeenCalledTimes(1);
  });
});
