// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { computeFoleyDspGraph, createDefaultFoleyMixerConfig, parseFoleyMixerPreset, previewFoleySound, serializeFoleyMixerPreset, StudioAtelierFoleyMixerPanel, type PreviewAudioContextLike, type PreviewBufferSourceLike, type PreviewOscillatorLike, type FoleyMixerConfig, type FoleyDspGraph } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function audioFixture() {
  let state = "running";
  const start = vi.fn(); const stop = vi.fn(); const disconnect = vi.fn(); const close = vi.fn(async () => { state = "closed"; });
  const sources: (PreviewBufferSourceLike | PreviewOscillatorLike)[] = [];
  const node = () => ({ connect: vi.fn(), disconnect });
  const ctx: PreviewAudioContextLike = {
    get state() { return state; }, currentTime: 1, sampleRate: 44100, destination: {},
    resume: vi.fn(async () => { state = "running"; }), close,
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createBufferSource: () => { const source = { ...node(), buffer: null, start, stop, onended: null as (() => void) | null }; sources.push(source); return source; },
    createOscillator: () => { const source: PreviewOscillatorLike & { onended: (() => void) | null } = { ...node(), type: "sine", frequency: { value: 440 }, start, stop, onended: null }; sources.push(source); return source; },
    createBiquadFilter: () => ({ ...node(), type: "lowpass", frequency: { value: 0 }, Q: { value: 0 } }),
    createGain: () => ({ ...node(), gain: { value: 0 } }),
  };
  return { ctx, start, stop, disconnect, close, setState: (next: string) => { state = next; }, end: () => { for (const source of sources) source.onended?.(); } };
}

const graph = () => computeFoleyDspGraph(createDefaultFoleyMixerConfig());

describe("실제 Web Audio 원샷의 비동기 수명", () => {
  it("resume 응답 전에는 시작하지 않고 native 종료를 관찰한 뒤 외부 노드만 정리한다", async () => {
    const audio = audioFixture(); audio.setState("suspended");
    let resume: () => void = () => {};
    audio.ctx.resume = () => new Promise<void>((resolve) => { resume = () => { audio.setState("running"); resolve(); }; });
    let observeStart: () => void = () => {};
    const started = new Promise<void>((resolve) => { observeStart = resolve; });
    let finished = false;
    const work = previewFoleySound(graph(), { audioContextFactory: () => audio.ctx, onStarted: observeStart }).then((result) => { finished = true; return result; });
    expect(audio.start).not.toHaveBeenCalled();
    resume(); await started;
    expect(audio.start).toHaveBeenCalledTimes(1);
    expect(finished).toBe(false);
    audio.end();
    expect(await work).toMatchObject({ status: "played", played: true });
    expect(audio.disconnect).toHaveBeenCalled();
    expect(audio.close).not.toHaveBeenCalled();
  });

  it("resume 거절은 재생 성공이 아니며 자체 context를 닫고 같은 입력으로 다시 시도할 수 있다", async () => {
    const first = audioFixture(); first.setState("suspended"); first.ctx.resume = () => Promise.reject(new Error("잠금"));
    const second = audioFixture();
    const queue = [first.ctx, second.ctx];
    vi.stubGlobal("AudioContext", function BrowserAudioContext() { return queue.shift(); });
    const before = graph(); const snapshot = structuredClone(before);
    expect(await previewFoleySound(before)).toMatchObject({ status: "error-noop", played: false });
    expect(first.start).not.toHaveBeenCalled(); expect(first.close).toHaveBeenCalledTimes(1);
    const retried = previewFoleySound(before);
    await Promise.resolve(); second.end();
    expect(await retried).toMatchObject({ status: "played", played: true });
    expect(second.close).toHaveBeenCalledTimes(1);
    expect(before).toEqual(snapshot);
  });

  it("비유한 sampleRate와 잘린 버퍼는 할당·재생 성공 전에 차단하고 노드를 정리한다", async () => {
    const audio = audioFixture();
    const bad = { ...audio.ctx, sampleRate: Infinity };
    expect(await previewFoleySound(graph(), { audioContextFactory: () => bad })).toMatchObject({ status: "error-noop", played: false });
    expect(bad.createBuffer).not.toHaveBeenCalled();
    const short = { ...audio.ctx, createBuffer: () => ({ getChannelData: () => new Float32Array(1) }) };
    expect(await previewFoleySound(graph(), { audioContextFactory: () => short })).toMatchObject({ status: "error-noop", played: false });
    expect(audio.start).not.toHaveBeenCalled();
    expect(audio.disconnect).toHaveBeenCalled();
  });

  it("시작 대기 중 패널을 닫으면 자체 context를 닫고 늦은 알림을 보내지 않는다", async () => {
    const audio = audioFixture(); audio.setState("suspended");
    audio.ctx.resume = () => new Promise<void>(() => {});
    vi.stubGlobal("AudioContext", function BrowserAudioContext() { return audio.ctx; });
    const callback = vi.fn();
    const view = render(<StudioAtelierFoleyMixerPanel onPreviewResult={callback} />);
    fireEvent.click(screen.getByTestId("btn-preview-stroke"));
    expect(screen.getByTestId("foley-playback-status").textContent).toContain("시작 대기");
    await act(async () => { view.unmount(); });
    expect(audio.start).not.toHaveBeenCalled(); expect(audio.close).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it("동시 원샷 상한은 context 생성 전에 차단하며 취소 후 슬롯을 재사용한다", async () => {
    const audios = Array.from({ length: 5 }, audioFixture);
    let index = 0;
    const construct = vi.fn(() => audios[index++]?.ctx);
    vi.stubGlobal("AudioContext", function BrowserAudioContext() { return construct(); });
    const controls = Array.from({ length: 4 }, () => new AbortController());
    const active = controls.map((control) => previewFoleySound(graph(), { signal: control.signal }));
    expect(await previewFoleySound(graph())).toMatchObject({ status: "error-noop", reason: "resource-limit", played: false });
    expect(construct).toHaveBeenCalledTimes(4);
    for (const control of controls) control.abort();
    expect((await Promise.all(active)).every((result) => result.status === "stopped")).toBe(true);
    expect(audios.slice(0, 4).every((audio) => audio.close.mock.calls.length === 1)).toBe(true);
    const work = previewFoleySound(graph()); await Promise.resolve(); audios[4]?.end();
    expect(await work).toMatchObject({ status: "played", played: true });
  });

  it("자체 context 정리가 멈춰도 완료로 표시하지 않고 늦은 정리는 슬롯만 해제한다", async () => {
    vi.useFakeTimers();
    const audio = audioFixture();
    let finishClose: () => void = () => {};
    audio.ctx.close = () => new Promise<void>((resolve) => { finishClose = resolve; });
    vi.stubGlobal("AudioContext", function BrowserAudioContext() { return audio.ctx; });
    const work = previewFoleySound(graph()); await Promise.resolve(); audio.end();
    await vi.advanceTimersByTimeAsync(5001);
    expect(await work).toMatchObject({ status: "error-noop", reason: "cleanup-error", played: false });
    finishClose(); await Promise.resolve();
  });
});

describe("프리셋 원문·메모리 계산 경계", () => {
  it("JSON 지원 길이는 파싱 전에 차단하고 이름 공백·이모지 원문을 왕복한다", () => {
    const config = { ...createDefaultFoleyMixerConfig(), masterVolume01: 0.333333 }; const name = "  화실 😀  ";
    const parsed = parseFoleyMixerPreset(serializeFoleyMixerPreset(config, name));
    expect(parsed.ok && parsed.preset.name).toBe(name);
    expect(parsed.ok && parsed.preset.config).toEqual(config);
    const oversized = " ".repeat(65537);
    const parse = vi.spyOn(JSON, "parse");
    expect(parseFoleyMixerPreset(oversized).ok).toBe(false);
    expect(parse).not.toHaveBeenCalled();
    expect(() => computeFoleyDspGraph({ ...config, masterVolume01: NaN })).toThrow();
  });

  it("복사 미지원·거절은 완료와 구분하고 같은 JSON으로 재시도한다", async () => {
    const copy = vi.fn<(text: string) => Promise<void>>().mockRejectedValueOnce(new Error("권한 거부")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    render(<StudioAtelierFoleyMixerPanel />);
    await act(async () => { fireEvent.click(screen.getByTestId("btn-export-preset")); });
    const text = screen.getByTestId("textarea-preset-json").getAttribute("value") ?? (screen.getByTestId("textarea-preset-json") as HTMLTextAreaElement).value;
    expect(screen.getByTestId("foley-copy-status").getAttribute("role")).toBe("alert");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "JSON 복사 다시 시도" })); });
    expect(copy).toHaveBeenCalledTimes(2); expect(copy.mock.calls[1]?.[0]).toBe(text);
    expect(screen.getByTestId("foley-copy-status").textContent).toContain("복사 완료");
  });

  it("설정 알림 대기·거절·재시도는 원문 결과를 최신 수신자에게 한 번만 전달한다", async () => {
    const controls = { reject: (_error: Error) => {} };
    const pending = new Promise<void>((_resolve, reject) => { controls.reject = reject; });
    const first = vi.fn<(config: FoleyMixerConfig, graph: FoleyDspGraph) => void | Promise<void>>().mockReturnValue(pending);
    const latest = vi.fn();
    const view = render(<StudioAtelierFoleyMixerPanel onConfigChange={first} />);
    fireEvent.click(screen.getByTestId("tool-btn-impasto-palette-knife"));
    fireEvent.click(screen.getByTestId("tool-btn-gpen-steel-scratch"));
    expect(first).toHaveBeenCalledTimes(1);
    await act(async () => { controls.reject(new Error("연결 실패")); });
    view.rerender(<StudioAtelierFoleyMixerPanel onConfigChange={latest} />);
    fireEvent.click(screen.getByRole("button", { name: "설정 알림 다시 시도" }));
    expect(latest.mock.calls[0]?.[0]).toBe(first.mock.calls[0]?.[0]);
    expect(latest.mock.calls[0]?.[1]).toBe(first.mock.calls[0]?.[1]);
  });

  it("native 재생 종료 뒤 결과 알림만 재시도하며 소리를 다시 틀지 않는다", async () => {
    const audio = audioFixture();
    const first = vi.fn().mockRejectedValue(new Error("결과 수신 거절")); const latest = vi.fn();
    const view = render(<StudioAtelierFoleyMixerPanel audioContextFactory={() => audio.ctx} onPreviewResult={first} />);
    await act(async () => { fireEvent.click(screen.getByTestId("btn-preview-stroke")); });
    expect(screen.getByTestId("foley-playback-status").textContent).toContain("재생 중");
    expect(first).not.toHaveBeenCalled();
    await act(async () => { audio.end(); });
    expect(screen.getByTestId("foley-playback-status").textContent).toContain("종료 신호");
    expect(screen.getByTestId("foley-notification-preview").getAttribute("role")).toBe("alert");
    view.rerender(<StudioAtelierFoleyMixerPanel audioContextFactory={() => audio.ctx} onPreviewResult={latest} />);
    fireEvent.click(screen.getByRole("button", { name: "시연 결과 알림 다시 시도" }));
    expect(latest).toHaveBeenCalledExactlyOnceWith(first.mock.calls[0]?.[0]);
    expect(audio.start).toHaveBeenCalledTimes(1); expect(audio.close).not.toHaveBeenCalled();
  });

  it("마스터 음소거는 현재 원샷을 취소하며 늦은 종료가 중지를 성공으로 덮지 않는다", async () => {
    const audio = audioFixture();
    render(<StudioAtelierFoleyMixerPanel audioContextFactory={() => audio.ctx} />);
    await act(async () => { fireEvent.click(screen.getByTestId("btn-preview-stroke")); });
    await act(async () => { fireEvent.click(screen.getByTestId("btn-master-mute")); });
    expect(screen.getByTestId("foley-playback-status").textContent).toContain("시연 중지");
    await act(async () => { audio.end(); });
    expect(screen.getByTestId("foley-playback-status").textContent).toContain("시연 중지");
    expect(audio.stop).toHaveBeenCalledTimes(2); expect(audio.disconnect).toHaveBeenCalled();
  });

  it("JSON 알림 동기 실패의 재시도는 최신 수신자를 쓰고 복사를 반복하지 않는다", async () => {
    const copy = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    const first = vi.fn().mockImplementation(() => { throw new Error("알림 실패"); }); const latest = vi.fn();
    const view = render(<StudioAtelierFoleyMixerPanel onExportJson={first} />);
    await act(async () => { fireEvent.click(screen.getByTestId("btn-export-preset")); });
    expect(screen.getByTestId("foley-notification-export").getAttribute("role")).toBe("alert");
    view.rerender(<StudioAtelierFoleyMixerPanel onExportJson={latest} />);
    fireEvent.click(screen.getByRole("button", { name: "JSON 알림 다시 시도" }));
    expect(latest).toHaveBeenCalledExactlyOnceWith(first.mock.calls[0]?.[0]);
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it("초기화 알림은 이전 필압·속도가 아닌 화면의 0.68/0.56 그래프와 일치한다", () => {
    const callback = vi.fn<(config: FoleyMixerConfig, graph: FoleyDspGraph) => void>();
    render(<StudioAtelierFoleyMixerPanel initialPressure01={0} initialVelocity01={0.1} onConfigChange={callback} />);
    fireEvent.click(screen.getByTestId("btn-reset-mixer"));
    expect(callback).toHaveBeenCalledTimes(1);
    const config = callback.mock.calls[0]?.[0]; const graph = callback.mock.calls[0]?.[1];
    expect(graph?.stroke.pressure01).toBe(0.68);
    expect(graph?.stroke.velocity01).toBe(0.56);
    expect(graph).toEqual(computeFoleyDspGraph(createDefaultFoleyMixerConfig(), { pressure01: 0.68, velocity01: 0.56 }));
    expect(config).toEqual(createDefaultFoleyMixerConfig());
    expect(screen.getByTestId("slider-stroke-pressure")).toHaveProperty("value", "0.68");
    expect(screen.getByTestId("slider-stroke-velocity")).toHaveProperty("value", "0.56");
  });

  it.each(["btn-master-mute", "btn-toggle-quiet-hours"])("실패 후 %s를 켜면 이전 가청 그래프의 재생 재시도를 무효화한다", async (safetyButton) => {
    const audio = audioFixture();
    const factory = vi.fn<() => PreviewAudioContextLike | null>().mockReturnValueOnce(null).mockReturnValue(audio.ctx);
    render(<StudioAtelierFoleyMixerPanel initialConfig={{ ...createDefaultFoleyMixerConfig(), currentHour: 23 }} audioContextFactory={factory} />);
    await act(async () => { fireEvent.click(screen.getByTestId("btn-preview-stroke")); });
    expect(screen.getByTestId("foley-playback-status").textContent).toContain("시연 실패");
    factory.mockClear();
    await act(async () => { fireEvent.click(screen.getByTestId(safetyButton)); });
    const retry = screen.queryByRole("button", { name: "같은 시연 다시 시도" });
    if (retry) await act(async () => { fireEvent.click(retry); });
    expect(factory).not.toHaveBeenCalled();
    expect(audio.start).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "같은 시연 다시 시도" })).toBeNull();
  });
});
