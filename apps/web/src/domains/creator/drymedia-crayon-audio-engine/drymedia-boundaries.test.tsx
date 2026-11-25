// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioDryMediaCrayonAudioPanel, bakeDualScalePaperGrainLut, createDryMediaLabSession, exportDryMediaRecipeJson,
  getActiveDryMediaConfig, playDryMediaFoleyPreview, sampleDualScalePaperGrain, simulateDryMediaStrokeMicrostructure, synthesizeDryMediaFoleyFrame } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function model() {
  const session = createDryMediaLabSession(); const config = getActiveDryMediaConfig(session);
  return { session, config, micro: simulateDryMediaStrokeMicrostructure(config), foley: synthesizeDryMediaFoleyFrame({ ...config, volume: config.foleyVolume, muted: config.foleyMuted }) };
}
function audioFixture() {
  let state = "running"; const start = vi.fn(), stop = vi.fn(), disconnect = vi.fn();
  const sources: { onended: (() => void) | null }[] = [];
  const node = () => ({ connect: vi.fn(), disconnect });
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const ctx = {
    get state() { return state; }, currentTime: 1, sampleRate: 48000, destination: {},
    resume: vi.fn(async () => { state = "running"; }), close: vi.fn(async () => { state = "closed"; }),
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createBufferSource: () => { const source = { ...node(), buffer: null, start, stop, onended: null as (() => void) | null }; sources.push(source); return source; },
    createBiquadFilter: () => ({ ...node(), type: "bandpass" as BiquadFilterType, frequency: param(), Q: param(), gain: param() }),
    createGain: () => ({ ...node(), gain: param() }),
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
  };
  return { ctx, start, stop, disconnect, setState: (next: string) => { state = next; }, end: () => { for (const source of sources) source.onended?.(); } };
}

describe("실제 원샷과 독립 계산의 경계", () => {
  it("resume·실제 종료를 기다리고 외부 컨텍스트를 닫지 않는다", async () => {
    const audio = audioFixture(); audio.setState("suspended"); const gate = Promise.withResolvers<void>();
    audio.ctx.resume.mockImplementation(async () => { await gate.promise; audio.setState("running"); });
    vi.stubGlobal("AudioContext", function FakeAudioContext() { return audio.ctx; });
    const controller = new AbortController(); const started = Promise.withResolvers<void>(); let finished = false;
    const work = Promise.resolve(playDryMediaFoleyPreview(model().foley, { audioContextFactory: () => audio.ctx, signal: controller.signal, onStarted: started.resolve })).then(value => { finished = true; return value; });
    try {
      expect(audio.start).not.toHaveBeenCalled(); gate.resolve(); await started.promise;
      expect(audio.start).toHaveBeenCalledTimes(1); expect(finished).toBe(false); audio.end();
      expect(await work).toMatchObject({ played: true, reason: "played" });
      expect(audio.disconnect).toHaveBeenCalled(); expect(audio.ctx.close).not.toHaveBeenCalled();
    } finally { controller.abort(); audio.end(); await work; }
  });
  it("resume 거절은 완료가 아니며 자체 context를 정리한다", async () => {
    const audio = audioFixture(); audio.setState("suspended"); audio.ctx.resume.mockRejectedValue(new Error("시작 거절"));
    vi.stubGlobal("AudioContext", function FakeAudioContext() { return audio.ctx; });
    try {
      expect(await playDryMediaFoleyPreview(model().foley)).toMatchObject({ played: false, reason: "audio-context-error" });
      expect(audio.start).not.toHaveBeenCalled(); expect(audio.ctx.close).toHaveBeenCalledTimes(1);
    } finally { audio.end(); }
  });
  it("NaN 그래프는 context 생성·버퍼 할당 전에 거부하고 원본을 유지한다", async () => {
    const audio = audioFixture(); const construct = vi.fn(() => audio.ctx);
    vi.stubGlobal("AudioContext", function FakeAudioContext() { return construct(); });
    const frame = model().foley; Object.assign(frame.audioGraph, { primaryFrequencyHz: NaN }); const before = structuredClone(frame);
    try { expect(await playDryMediaFoleyPreview(frame)).toMatchObject({ played: false }); expect(construct).not.toHaveBeenCalled(); expect(frame).toEqual(before); }
    finally { audio.end(); }
  });
  it("잘못된 LUT 크기·종이와 NaN 샘플은 다른 질감으로 대체하지 않는다", () => {
    const lut = bakeDualScalePaperGrainLut("rough-cold-press"); const input = model().config;
    expect(() => simulateDryMediaStrokeMicrostructure({ ...input, paperId: "kent-smooth", lut })).toThrow();
    const bad = { ...lut }; Object.assign(bad, { size: 3 });
    expect(() => sampleDualScalePaperGrain(bad, 0, 0)).toThrow();
    lut.combinedHeight[0] = NaN; expect(() => sampleDualScalePaperGrain(lut, 0, 0)).toThrow();
  });
  it("다른 입력의 물리 결과는 현재 레시피 JSON으로 내보내지 않는다", () => {
    const { session, config, foley } = model(); const stale = simulateDryMediaStrokeMicrostructure({ ...config, pressure: 1 });
    expect(() => exportDryMediaRecipeJson(session, stale, foley)).toThrow();
  });
  it("외부 메타데이터를 내보내지 않고 성능·LUFS·원고 적용의 실측 여부를 명시한다", () => {
    const { session, micro, foley } = model(); Object.assign(foley.audioGraph, { privateNote: "synthetic-private-fixture" });
    const before = structuredClone(foley); const json = exportDryMediaRecipeJson(session, micro, foley); const parsed = JSON.parse(json);
    expect(json).not.toContain("synthetic-private-fixture"); expect(parsed.sourceKind).toBe("cpu-physical-example");
    expect(parsed.gpuMeasured).toBe(false); expect(parsed.loudnessMeasured).toBe(false); expect(parsed.artworkApplied).toBe(false); expect(foley).toEqual(before);
  });
  it("수신자 없는 적용은 메모리 예제 선택으로 표시한다", () => {
    render(<StudioDryMediaCrayonAudioPanel />); fireEvent.click(screen.getByTestId("drymedia-brush-preset-charcoal-stick"));
    fireEvent.click(screen.getByTestId("drymedia-apply-btn"));
    expect(screen.getByTestId("drymedia-example-scope").textContent).toContain("실제");
    expect(screen.getByTestId("drymedia-delivery-apply").textContent).toContain("미연결");
  });
  it("클립보드 미지원에서는 완료 알림을 보내지 않는다", async () => {
    vi.stubGlobal("navigator", {}); const recipient = vi.fn(); render(<StudioDryMediaCrayonAudioPanel onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId("drymedia-copy-json-btn")); expect(recipient).not.toHaveBeenCalled();
    expect(await screen.findByTestId("drymedia-copy-retry")).toBeTruthy();
  });
});


describe("원샷 수명·예제 전달의 재시도", () => {
  it("잘못된 샘플레이트는 할당 전에 거부하고 외부 컨텍스트를 유지한다", async () => {
    const audio = audioFixture(); Object.assign(audio.ctx, { sampleRate: Infinity });
    expect(await playDryMediaFoleyPreview(model().foley, { audioContextFactory: () => audio.ctx })).toMatchObject({ played: false });
    expect(audio.ctx.createBuffer).not.toHaveBeenCalled(); expect(audio.start).not.toHaveBeenCalled(); expect(audio.ctx.close).not.toHaveBeenCalled();
  });
  it("자체 원샷은 실제 종료 후에만 완료하고 닫는다", async () => {
    const audio = audioFixture(); vi.stubGlobal("AudioContext", function FakeContext() { return audio.ctx; });
    const started = Promise.withResolvers<void>();
    const work = playDryMediaFoleyPreview(model().foley, { onStarted: started.resolve });
    await started.promise; expect(audio.ctx.close).not.toHaveBeenCalled(); audio.end();
    expect(await work).toMatchObject({ played: true, durationMs: 260 }); expect(audio.ctx.close).toHaveBeenCalledTimes(1);
    expect(audio.disconnect).toHaveBeenCalledTimes(5);
  });
  it("시작 전 abort는 factory를 호출하지 않고, 시작 후 abort는 해당 원샷만 정리한다", async () => {
    const audio = audioFixture(); const factory = vi.fn(() => audio.ctx); const early = new AbortController(); early.abort();
    expect(await playDryMediaFoleyPreview(model().foley, { audioContextFactory: factory, signal: early.signal })).toMatchObject({ reason: "cancelled" });
    expect(factory).not.toHaveBeenCalled();
    const controller = new AbortController(); const started = Promise.withResolvers<void>();
    const work = playDryMediaFoleyPreview(model().foley, { audioContextFactory: factory, signal: controller.signal, onStarted: started.resolve });
    await started.promise; controller.abort();
    expect(await work).toMatchObject({ played: false, reason: "cancelled" });
    expect(audio.stop).toHaveBeenCalledTimes(2); expect(audio.disconnect).toHaveBeenCalledTimes(5); expect(audio.ctx.close).not.toHaveBeenCalled();
  });
  it("동시 원샷 네 개를 넘기면 새 자원을 만들지 않고 기존 원샷을 보존한다", async () => {
    const items = Array.from({ length: 4 }, () => ({ audio: audioFixture(), started: Promise.withResolvers<void>(), controller: new AbortController() }));
    const work = items.map(({ audio, started, controller }) => playDryMediaFoleyPreview(model().foley, { audioContextFactory: () => audio.ctx, signal: controller.signal, onStarted: started.resolve }));
    try {
      await Promise.all(items.map(item => item.started.promise)); const factory = vi.fn(() => null);
      expect(await playDryMediaFoleyPreview(model().foley, { audioContextFactory: factory })).toMatchObject({ reason: "resource-limit" });
      expect(factory).not.toHaveBeenCalled(); expect(items.every(item => item.audio.start.mock.calls.length === 1)).toBe(true);
    } finally { items.forEach(item => item.controller.abort()); await Promise.all(work); }
  });
  it("패널의 중복 시작을 막고 음소거·입력 변경·언마운트 때 이전 오디오를 취소한다", async () => {
    const audio = audioFixture(); const factory = vi.fn(() => audio.ctx); const { unmount } = render(<StudioDryMediaCrayonAudioPanel audioContextFactory={factory} />);
    const button = screen.getByTestId("drymedia-foley-play-btn"); fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(audio.start).toHaveBeenCalledTimes(1)); expect(factory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("drymedia-foley-mute-btn"));
    await waitFor(() => expect(audio.disconnect).toHaveBeenCalledTimes(5)); expect(screen.queryByTestId("drymedia-audio-retry")).toBeNull();
    fireEvent.click(screen.getByTestId("drymedia-foley-mute-btn")); fireEvent.click(button);
    await waitFor(() => expect(audio.start).toHaveBeenCalledTimes(2)); unmount();
    await waitFor(() => expect(audio.disconnect).toHaveBeenCalledTimes(10)); expect(audio.ctx.close).not.toHaveBeenCalled();
  });
  it("실패한 가청 시연은 최신 factory로 재시도하되 음소거 변경 후에는 이전 graph를 재생하지 않는다", async () => {
    const missing = vi.fn(() => null); const audio = audioFixture(); const factory = vi.fn(() => audio.ctx);
    const view = render(<StudioDryMediaCrayonAudioPanel audioContextFactory={missing} />);
    fireEvent.click(screen.getByTestId("drymedia-foley-play-btn")); await screen.findByTestId("drymedia-audio-retry");
    view.rerender(<StudioDryMediaCrayonAudioPanel audioContextFactory={factory} />);
    fireEvent.click(screen.getByTestId("drymedia-audio-retry")); await waitFor(() => expect(audio.start).toHaveBeenCalledTimes(1));
    await act(async () => { audio.end(); });
    view.rerender(<StudioDryMediaCrayonAudioPanel audioContextFactory={missing} />);
    fireEvent.click(screen.getByTestId("drymedia-foley-play-btn")); await screen.findByTestId("drymedia-audio-retry");
    fireEvent.click(screen.getByTestId("drymedia-foley-mute-btn")); expect(screen.queryByTestId("drymedia-audio-retry")).toBeNull();
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it("예제 알림은 pending 중 중복을 막고 거절 뒤 최신 수신자에게 같은 snapshot만 재전달한다", async () => {
    const gate = Promise.withResolvers<void>(); const first = vi.fn(() => gate.promise); const next = vi.fn();
    const view = render(<StudioDryMediaCrayonAudioPanel onApply={first} />);
    fireEvent.click(screen.getByTestId("drymedia-brush-preset-charcoal-stick")); fireEvent.click(screen.getByTestId("drymedia-apply-btn")); fireEvent.click(screen.getByTestId("drymedia-apply-btn"));
    expect(first).toHaveBeenCalledTimes(1); expect(screen.getByTestId("drymedia-delivery-apply").textContent).toContain("대기");
    await act(async () => { gate.reject(new Error("수신 거절")); }); await screen.findByTestId("drymedia-apply-retry");
    fireEvent.click(screen.getByTestId("drymedia-brush-preset-graphite-4b"));
    view.rerender(<StudioDryMediaCrayonAudioPanel onApply={next} />); fireEvent.click(screen.getByTestId("drymedia-apply-retry"));
    expect(next).toHaveBeenCalledTimes(1); expect(next.mock.calls[0]).toEqual(first.mock.calls[0]);
    expect(screen.getByTestId("drymedia-three-stage-svg").getAttribute("data-brush-id")).toBe("graphite-4b");
  });
  it("clipboard ACK 후에만 알리고 알림 거절의 재시도는 성공한 복사를 반복하지 않는다", async () => {
    const gate = Promise.withResolvers<void>(); const writeText = vi.fn((_text: string) => gate.promise); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const failed = vi.fn(() => { throw new Error("수신 실패"); }); const next = vi.fn(); const view = render(<StudioDryMediaCrayonAudioPanel onExportJson={failed} />);
    fireEvent.click(screen.getByTestId("drymedia-copy-json-btn")); fireEvent.click(screen.getByTestId("drymedia-copy-json-btn"));
    expect(writeText).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled();
    await act(async () => { gate.resolve(); }); await screen.findByTestId("drymedia-copy-retry");
    view.rerender(<StudioDryMediaCrayonAudioPanel onExportJson={next} />); fireEvent.click(screen.getByTestId("drymedia-copy-retry"));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1)); expect(writeText).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual(failed.mock.calls[0]);
    const text = writeText.mock.calls[0]?.[0]; expect(typeof text).toBe("string");
    if (typeof text === "string") expect(screen.getByTestId("drymedia-copy-state").textContent).toContain(`${new TextEncoder().encode(text).byteLength}바이트`);
  });
  it("수신자 제거가 알림 성공으로 바뀌지 않고 복사 거절은 완료 콜백을 보내지 않는다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("복사 거절")); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const callback = vi.fn(); const view = render(<StudioDryMediaCrayonAudioPanel onExportJson={callback} />);
    fireEvent.click(screen.getByTestId("drymedia-copy-json-btn")); await screen.findByTestId("drymedia-copy-retry"); expect(callback).not.toHaveBeenCalled();
    writeText.mockResolvedValue(undefined); view.rerender(<StudioDryMediaCrayonAudioPanel />); fireEvent.click(screen.getByTestId("drymedia-copy-retry"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2)); await waitFor(() => expect(screen.getByTestId("drymedia-copy-state").textContent).toContain("error")); expect(callback).not.toHaveBeenCalled();
  });
  it("현재 입력을 보존한 JSON roundtrip과 전체 세션 한도를 검증한다", () => {
    const { session, config, micro, foley } = model(); const before = structuredClone(session);
    const parsed = JSON.parse(exportDryMediaRecipeJson(session, micro, foley)); expect(parsed.config).toEqual(config); expect(session).toEqual(before);
    expect(() => exportDryMediaRecipeJson({ ...session, history: Array.from({ length: 13 }, () => config) }, micro, foley)).toThrow();
    const changed = { ...session, committed: { ...config, foleyVolume: NaN } }; expect(() => exportDryMediaRecipeJson(changed, micro, foley)).toThrow();
    expect(() => exportDryMediaRecipeJson(session, micro, { ...foley, effectiveGain: Infinity })).toThrow();
  });
});


describe("오디오 오류 정리", () => {
  it("버퍼 할당 실패도 자체 context를 닫고 성공으로 표시하지 않는다", async () => {
    const audio = audioFixture(); audio.ctx.createBuffer.mockImplementation(() => { throw new Error("버퍼 생성 실패"); });
    vi.stubGlobal("AudioContext", function FakeContext() { return audio.ctx; });
    expect(await playDryMediaFoleyPreview(model().foley)).toMatchObject({ played: false, reason: "audio-context-error" });
    expect(audio.ctx.close).toHaveBeenCalledTimes(1); expect(audio.start).not.toHaveBeenCalled();
  });
  it("실제 종료 후 자체 close 거절도 완료가 아니며 Promise 거절을 회수한다", async () => {
    const audio = audioFixture(); audio.ctx.close.mockRejectedValue(new Error("닫기 거절"));
    vi.stubGlobal("AudioContext", function FakeContext() { return audio.ctx; }); const started = Promise.withResolvers<void>();
    const work = playDryMediaFoleyPreview(model().foley, { onStarted: started.resolve }); await started.promise; audio.end();
    expect(await work).toMatchObject({ played: false, reason: "cleanup-error" }); expect(audio.ctx.close).toHaveBeenCalledTimes(1);
    expect(audio.disconnect).toHaveBeenCalledTimes(5);
  });
});
