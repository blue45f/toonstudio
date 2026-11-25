import type { DryMediaFoleyFrame } from "./drymedia-crayon-audio-engine";

interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, when: number): void;
  linearRampToValueAtTime(value: number, when: number): void;
  exponentialRampToValueAtTime(value: number, when: number): void;
}
interface AudioNodeLike { connect(destination: unknown): unknown; disconnect(): void; }
interface SourceLike extends AudioNodeLike {
  buffer: unknown; onended: (() => void) | null; start(when?: number): void; stop(when?: number): void;
}
export interface DryMediaAudioContextLike {
  readonly state: string; readonly currentTime: number; readonly sampleRate: number; readonly destination: unknown;
  resume(): void | Promise<void>; close(): void | Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array };
  createBufferSource(): SourceLike;
  createBiquadFilter(): AudioNodeLike & { type: BiquadFilterType; frequency: AudioParamLike; Q: AudioParamLike; gain: AudioParamLike };
  createGain(): AudioNodeLike & { gain: AudioParamLike };
  createDynamicsCompressor(): AudioNodeLike & { threshold: AudioParamLike; knee: AudioParamLike; ratio: AudioParamLike; attack: AudioParamLike; release: AudioParamLike };
}
export interface FoleyPreviewPlayResult {
  readonly played: boolean;
  readonly reason: "played" | "muted" | "unsupported-audio-context" | "audio-context-error" | "cancelled" | "resource-limit" | "cleanup-error";
  readonly durationMs: number;
}
export interface DryMediaPreviewOptions {
  readonly audioContextFactory?: () => DryMediaAudioContextLike | null;
  readonly signal?: AbortSignal;
  readonly onStarted?: () => void;
}
const active = new Set<object>();
class CancelledPreview extends Error {}
function browserContext(): DryMediaAudioContextLike | null {
  const host = globalThis as unknown as { AudioContext?: new () => DryMediaAudioContextLike; webkitAudioContext?: new () => DryMediaAudioContextLike };
  const Context = host.AudioContext ?? host.webkitAudioContext;
  return Context ? new Context() : null;
}
function validFrame(frame: DryMediaFoleyFrame): boolean {
  if (!frame || typeof frame !== "object" || !frame.audioGraph || typeof frame.audioGraph !== "object") return false;
  const g = frame.audioGraph;
  const ranges = [
    [frame.effectiveGain, 0, 1], [frame.primaryResonanceHz, 0, 24000], [frame.transientAttackMs, 0, 260],
    [g.primaryFrequencyHz, 0, 24000], [g.primaryQ, 0, 1000], [g.secondaryFrequencyHz, 0, 24000],
    [g.secondaryGainDb, -40, 40], [g.pressureGain, 0, 1], [g.masterOutputGain, 0, 1],
    [g.compressorThresholdDb, -100, 0], [g.compressorKneeDb, 0, 40], [g.compressorRatio, 1, 20],
    [g.compressorAttackSec, 0, 1], [g.compressorReleaseSec, 0, 1],
  ];
  return typeof frame.muted === "boolean" && g.primaryFilterType === "bandpass" &&
    ["lowshelf", "highpass", "peaking"].includes(g.secondaryFilterType) &&
    ["brown-wax", "pink-grit", "white-micro", "filtered-silk"].includes(g.noiseColor) &&
    ranges.every(([v, lo, hi]) => v !== undefined && lo !== undefined && hi !== undefined && Number.isFinite(v) && v >= lo && v <= hi);
}
async function bounded(task: () => void | Promise<void>, signal?: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    if (signal?.aborted) throw new CancelledPreview();
    await Promise.race([
      Promise.resolve().then(task),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("오디오 응답 대기 초과")), 5000);
        abort = () => reject(new CancelledPreview());
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      }),
    ]);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
/** 브라우저 원샷의 resume·종료·자체 자원 정리를 확인한다. LUFS 실측이나 청력 안전 보증은 아니다. */
export async function playDryMediaFoleyPreview(frame: DryMediaFoleyFrame, options?: DryMediaPreviewOptions): Promise<FoleyPreviewPlayResult> {
  const result = (reason: FoleyPreviewPlayResult["reason"]): FoleyPreviewPlayResult => ({ played: reason === "played", reason, durationMs: reason === "played" ? 260 : 0 });
  if (!validFrame(frame)) return result("audio-context-error");
  if (frame.muted || frame.effectiveGain <= 0) return result("muted");
  if (active.size >= 4) return result("resource-limit");
  const token = {}; active.add(token);
  const owned = !options?.audioContextFactory;
  const nodes: AudioNodeLike[] = [];
  let ctx: DryMediaAudioContextLike | null = null;
  let source: SourceLike | undefined;
  let started = false; let ended = false;
  let answer: FoleyPreviewPlayResult;
  try {
    if (options?.signal?.aborted) throw new CancelledPreview();
    ctx = options?.audioContextFactory ? options.audioContextFactory() : browserContext();
    if (!ctx) answer = result("unsupported-audio-context");
    else {
      if (!Number.isInteger(ctx.sampleRate) || ctx.sampleRate < 8000 || ctx.sampleRate > 192000 || !Number.isFinite(ctx.currentTime) || ctx.currentTime < 0) throw new Error("지원하지 않는 오디오 시간·샘플레이트");
      if (ctx.state !== "running") await bounded(() => ctx?.resume(), options?.signal);
      if (ctx.state !== "running") throw new Error("오디오 실행 상태 미확인");
      if (options?.signal?.aborted) throw new CancelledPreview();
      const now = ctx.currentTime;
      if (!Number.isFinite(now) || now < 0) throw new Error("잘못된 오디오 시작 시간");
      const count = Math.max(1024, Math.floor(ctx.sampleRate * 0.26));
      const buffer = ctx.createBuffer(1, count, ctx.sampleRate);
      const ch = buffer.getChannelData(0);
      if (!(ch instanceof Float32Array) || ch.length !== count) throw new Error("요청과 다른 오디오 버퍼");
      let brown = 0;
      for (let i = 0; i < count; i += 1) {
        let h = (Math.imul(i, 374761393) + Math.imul(7, 668265263) + Math.imul(frame.primaryResonanceHz | 0, 1442695041)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        const white = ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
        ch[i] = frame.audioGraph.noiseColor === "brown-wax" ? (brown = Math.min(1, Math.max(-1, brown * 0.94 + white * 0.16))) : white * 0.65;
      }
      source = ctx.createBufferSource(); nodes.push(source); source.buffer = buffer;
      const f1 = ctx.createBiquadFilter(); nodes.push(f1);
      f1.type = frame.audioGraph.primaryFilterType; f1.frequency.value = Math.min(ctx.sampleRate / 2, frame.audioGraph.primaryFrequencyHz); f1.Q.value = frame.audioGraph.primaryQ;
      const f2 = ctx.createBiquadFilter(); nodes.push(f2);
      f2.type = frame.audioGraph.secondaryFilterType; f2.frequency.value = Math.min(ctx.sampleRate / 2, frame.audioGraph.secondaryFrequencyHz); f2.gain.value = frame.audioGraph.secondaryGainDb;
      const comp = ctx.createDynamicsCompressor(); nodes.push(comp);
      comp.threshold.value = frame.audioGraph.compressorThresholdDb; comp.knee.value = frame.audioGraph.compressorKneeDb;
      comp.ratio.value = frame.audioGraph.compressorRatio; comp.attack.value = frame.audioGraph.compressorAttackSec; comp.release.value = frame.audioGraph.compressorReleaseSec;
      const gain = ctx.createGain(); nodes.push(gain);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(Math.min(0.25, frame.audioGraph.masterOutputGain * 0.4), now + frame.transientAttackMs / 1000);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      source.connect(f1); f1.connect(f2); f2.connect(comp); comp.connect(gain); gain.connect(ctx.destination);
      const playback = source;
      await bounded(() => new Promise<void>((resolve) => {
        playback.onended = () => { ended = true; resolve(); };
        playback.start(now); started = true; playback.stop(now + 0.26); options?.onStarted?.();
      }), options?.signal);
      answer = result("played");
    }
  } catch (error) { answer = result(error instanceof CancelledPreview ? "cancelled" : "audio-context-error"); }
  finally {
    if (source) source.onended = null;
    let cleaned = true;
    if (source && started && !ended) { try { source.stop(); } catch { cleaned = false; } }
    for (const node of nodes.reverse()) { try { node.disconnect(); } catch { cleaned = false; } }
    let released = !owned || !ctx || ctx.state === "closed";
    if (owned && ctx && !released) {
      const ownedContext = ctx;
      try { await bounded(() => Promise.resolve(ownedContext.close()).then(() => { active.delete(token); })); released = true; }
      catch { cleaned = false; }
    }
    if (released) active.delete(token);
    if (!cleaned) answer = result("cleanup-error");
  }
  return answer;
}
