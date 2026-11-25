import type { FoleyDspGraph, FoleyPreviewResult, PreviewAudioContextLike, PreviewAudioNodeLike, PreviewAudioParamLike, PreviewBufferSourceLike, PreviewFoleySoundOptions, PreviewOscillatorLike } from "./atelier-foley-mixer-engine";

const activePreviews = new Set<object>();
const MAX_ACTIVE_PREVIEWS = 4;
class CancelledPreview extends Error {}

function browserContext(): PreviewAudioContextLike | null {
  const host = globalThis as unknown as { AudioContext?: new () => PreviewAudioContextLike; webkitAudioContext?: new () => PreviewAudioContextLike };
  const Context = host.AudioContext ?? host.webkitAudioContext;
  return Context ? new Context() : null;
}

function param(target: PreviewAudioParamLike, value: number, now: number): void {
  if (target.setValueAtTime) target.setValueAtTime(value, now);
  else target.value = value;
}

function noise(samples: Float32Array, grain: number): void {
  let seed = 0x51a7c3d9; let pink = 0;
  for (let i = 0; i < samples.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 4294967296 * 2 - 1;
    pink = pink * 0.72 + white * 0.28;
    const u = samples.length > 1 ? i / (samples.length - 1) : 0.5;
    const value = (grain * white * 0.45 + (1 - grain * 0.45) * pink) * (0.5 * (1 - Math.cos(2 * Math.PI * u)));
    samples[i] = Math.min(0.95, Math.max(-0.95, value));
  }
}

async function resumeContext(ctx: PreviewAudioContextLike, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new CancelledPreview();
  if (ctx.state === "closed") throw new Error("닫힌 오디오 컨텍스트입니다.");
  if (ctx.state === undefined || ctx.state === "running") return;
  if (!ctx.resume) throw new Error("오디오 시작 대기를 해제할 수 없습니다.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    await Promise.race([
      Promise.resolve(ctx.resume()),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("오디오 시작 대기 시간이 초과됐습니다.")), 5000);
        abort = () => reject(new CancelledPreview());
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      }),
    ]);
    if (ctx.state !== "running") throw new Error("오디오 컨텍스트가 실행 상태가 아닙니다.");
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort);
  }
}

async function closeOwnedContext(ctx: PreviewAudioContextLike, token: object): Promise<void> {
  if (!ctx.close) throw new Error("자체 오디오 컨텍스트 정리를 지원하지 않습니다.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve(ctx.close()).then(() => { activePreviews.delete(token); }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("오디오 정리 대기 시간이 초과됐습니다.")), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** 원샷의 실제 시작·종료와 정리를 기다린다. 주입한 외부 컨텍스트의 소유권은 넘겨받지 않는다. */
export async function playFoleyPreview(
  graph: FoleyDspGraph,
  options: PreviewFoleySoundOptions | undefined,
  model: { readonly defaultDurationMs: number; readonly ambienceFrequencyHz: number },
): Promise<FoleyPreviewResult> {
  const kind = options?.kind ?? "stroke";
  const result = (status: FoleyPreviewResult["status"], reason: FoleyPreviewResult["reason"], durationMs = 0, peakDb = -96): FoleyPreviewResult => ({ status, reason, played: status === "played", kind, durationMs, peakDb });
  const numbers = [graph.friction.effectiveGainLinear, graph.ambience.effectiveGainLinear, graph.tactileUi.effectiveGainLinear, graph.master.limiterRatio, graph.friction.centerFrequencyHz, graph.friction.qFactor, graph.friction.lpfCutoffHz, graph.friction.fiberGrainDensity01, graph.tactileUi.clickFrequencyHz, options?.durationMs ?? model.defaultDurationMs];
  if (!["stroke", "ambience", "tactile-ui"].includes(kind) || typeof graph.safety.isAudible !== "boolean" || numbers.some((value) => !Number.isFinite(value) || value < 0) || graph.master.limiterRatio > 1 || graph.friction.fiberGrainDensity01 > 1) return result("error-noop", "audio-error");
  if (!graph.safety.isAudible) return result("muted-noop", "safety-muted");
  const channelGain = kind === "stroke" ? graph.friction.effectiveGainLinear : kind === "ambience" ? graph.ambience.effectiveGainLinear : graph.tactileUi.effectiveGainLinear;
  const gain = Math.min(0.94, channelGain * graph.master.limiterRatio);
  if (!Number.isFinite(gain)) return result("error-noop", "audio-error");
  if (gain <= 0.0001) return result("muted-noop", "zero-gain");
  if (activePreviews.size >= MAX_ACTIVE_PREVIEWS) return result("error-noop", "resource-limit");
  const token = {}; activePreviews.add(token);
  const owned = !options?.audioContextFactory;
  const nodes: PreviewAudioNodeLike[] = [];
  let ctx: PreviewAudioContextLike | null = null;
  let source: PreviewBufferSourceLike | PreviewOscillatorLike | undefined;
  let started = false; let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  let answer: FoleyPreviewResult;
  try {
    if (options?.signal?.aborted) throw new CancelledPreview();
    ctx = options?.audioContextFactory ? options.audioContextFactory() : browserContext();
    if (!ctx) return result("unavailable-noop", "no-audio-context");
    if (!Number.isFinite(ctx.currentTime) || ctx.currentTime < 0 || !Number.isInteger(ctx.sampleRate) || ctx.sampleRate < 8000 || ctx.sampleRate > 192000) throw new Error("오디오 시간·샘플레이트 지원 범위를 벗어났습니다.");
    await resumeContext(ctx, options?.signal);
    if (options?.signal?.aborted) throw new CancelledPreview();
    const now = ctx.currentTime;
    const durationMs = Math.round(Math.min(1200, Math.max(20, options?.durationMs ?? model.defaultDurationMs)));
    const gainNode = ctx.createGain(); nodes.push(gainNode);
    param(gainNode.gain, gain, now); gainNode.connect(ctx.destination);
    if (kind === "tactile-ui") {
      const oscillator = ctx.createOscillator(); source = oscillator; nodes.push(oscillator);
      oscillator.type = "triangle"; param(oscillator.frequency, Math.max(120, graph.tactileUi.clickFrequencyHz), now);
      oscillator.connect(gainNode);
    } else {
      const sampleCount = Math.max(128, Math.round(ctx.sampleRate * durationMs / 1000));
      const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      if (!ArrayBuffer.isView(samples) || Object.prototype.toString.call(samples) !== "[object Float32Array]" || samples.length !== sampleCount) throw new Error("오디오 버퍼 길이가 요청과 다릅니다.");
      noise(samples, kind === "stroke" ? graph.friction.fiberGrainDensity01 : 0.25);
      const bufferSource = ctx.createBufferSource(); source = bufferSource; nodes.push(bufferSource); bufferSource.buffer = buffer;
      const bandpass = ctx.createBiquadFilter(); nodes.push(bandpass); bandpass.type = "bandpass";
      param(bandpass.frequency, Math.min(ctx.sampleRate / 2, kind === "stroke" ? graph.friction.centerFrequencyHz : model.ambienceFrequencyHz), now);
      param(bandpass.Q, kind === "stroke" ? graph.friction.qFactor : 0.9, now);
      const lowpass = ctx.createBiquadFilter(); nodes.push(lowpass); lowpass.type = "lowpass";
      param(lowpass.frequency, Math.min(ctx.sampleRate / 2, kind === "stroke" ? graph.friction.lpfCutoffHz : 2400), now);
      bufferSource.connect(bandpass); bandpass.connect(lowpass); lowpass.connect(gainNode);
    }
    const playback = source;
    await new Promise<void>((resolve, reject) => {
      playback.onended = () => { ended = true; resolve(); };
      abort = () => reject(new CancelledPreview());
      options?.signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => reject(new Error("오디오 종료를 관찰하지 못했습니다.")), durationMs + 1000);
      playback.start(now); started = true; playback.stop(now + durationMs / 1000);
      options?.onStarted?.();
      if (options?.signal?.aborted) abort();
    });
    answer = result("played", "ok", durationMs, Math.max(-96, Math.round(20 * Math.log10(gain) * 100) / 100));
  } catch (error) {
    answer = result(error instanceof CancelledPreview ? "stopped" : "error-noop", error instanceof CancelledPreview ? "cancelled" : "audio-error");
  } finally {
    clearTimeout(timer); options?.signal?.removeEventListener("abort", abort);
    if (source) source.onended = null;
    let cleaned = true;
    if (started && !ended && source) { try { source.stop(); } catch { cleaned = false; } }
    for (const node of nodes.reverse()) { try { node.disconnect?.(); } catch { cleaned = false; } }
    let released = !owned || !ctx || ctx.state === "closed";
    if (owned && ctx && !released) {
      try {
        await closeOwnedContext(ctx, token); released = true;
      } catch { cleaned = false; }
    }
    if (released) activePreviews.delete(token);
    if (!cleaned) answer = result("error-noop", "cleanup-error");
  }
  return answer;
}
