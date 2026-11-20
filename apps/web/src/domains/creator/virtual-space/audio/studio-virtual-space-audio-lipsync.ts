import {
  advanceStudioLipsync,
  createStudioLipsyncState,
  type StudioLipsyncState,
} from "../studio-virtual-space-lipsync";

export interface StudioVisemeWeights {
  readonly aa: number;
  readonly ih: number;
  readonly ou: number;
  readonly ee: number;
  readonly oh: number;
}

export const SILENT_VISEME_WEIGHTS: StudioVisemeWeights = Object.freeze({
  aa: 0,
  ih: 0,
  ou: 0,
  ee: 0,
  oh: 0,
});

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Pure formant-band approximation mapping smoothed RMS + 3 spectral energy bands
 * (low 80-500Hz, mid 500-2000Hz, high 2000-5000Hz) into VRM 1.0 preset visemes.
 */
export function computeVisemeFromSpectrum(
  smoothedLevel: number,
  lowBand: number,
  midBand: number,
  highBand: number,
): StudioVisemeWeights {
  const energy = clamp01(smoothedLevel);
  if (energy < 0.05) return SILENT_VISEME_WEIGHTS;
  const total = Math.max(0.001, lowBand + midBand + highBand);
  const lowRatio = clamp01(lowBand / total);
  const midRatio = clamp01(midBand / total);
  const highRatio = clamp01(highBand / total);

  const aa = clamp01(energy * (0.45 + midRatio * 0.75));
  const oh = clamp01(energy * (0.25 + lowRatio * 0.85));
  const ou = clamp01(energy * lowRatio * 0.72);
  const ee = clamp01(energy * (midRatio * 0.55 + highRatio * 0.45));
  const ih = clamp01(energy * highRatio * 0.9);
  return Object.freeze({ aa, ih, ou, ee, oh });
}

interface ActorAnalyserEntry {
  readonly stream: MediaStream;
  readonly source: MediaStreamAudioSourceNode;
  readonly analyser: AnalyserNode;
  readonly timeData: Uint8Array<ArrayBuffer>;
  readonly freqData: Uint8Array<ArrayBuffer>;
  lipsyncState: StudioLipsyncState;
}

/**
 * Attaches WebAudio AnalyserNodes to local mic and remote WebRTC streams
 * to produce real-time VRM 1.0 viseme weights (aa/ih/ou/ee/oh).
 */
export class StudioAudioLipsyncMonitor {
  private context: AudioContext | null = null;
  private readonly entries = new Map<string, ActorAnalyserEntry>();
  private disposed = false;

  private ensureContext(): AudioContext | null {
    if (this.disposed || typeof window === "undefined") return null;
    if (this.context) return this.context;
    const AudioCtx = window.AudioContext
      ?? (window as unknown as { readonly webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      this.context = new AudioCtx();
      return this.context;
    } catch {
      return null;
    }
  }

  attachStream(actorId: string, stream: MediaStream | null): void {
    if (this.disposed) return;
    const existing = this.entries.get(actorId);
    if (!stream || stream.getAudioTracks().length === 0) {
      this.detachActor(actorId);
      return;
    }
    if (existing && existing.stream === stream) return;
    this.detachActor(actorId);

    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      const timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      const freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      this.entries.set(actorId, {
        stream,
        source,
        analyser,
        timeData,
        freqData,
        lipsyncState: createStudioLipsyncState(),
      });
    } catch {
      // Ignore WebAudio failures in unsupported runtimes.
    }
  }

  detachActor(actorId: string): void {
    const entry = this.entries.get(actorId);
    if (!entry) return;
    this.entries.delete(actorId);
    try {
      entry.source.disconnect();
      entry.analyser.disconnect();
    } catch {
      // Idempotent cleanup.
    }
  }

  sampleAll(nowMs: number, reducedMotion = false): Readonly<Record<string, StudioVisemeWeights>> {
    const result: Record<string, StudioVisemeWeights> = {};
    for (const [actorId, entry] of this.entries) {
      entry.analyser.getByteTimeDomainData(entry.timeData);
      entry.analyser.getByteFrequencyData(entry.freqData);
      let sumSquares = 0;
      for (let i = 0; i < entry.timeData.length; i += 1) {
        const centered = ((entry.timeData[i] ?? 128) - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.min(1, Math.sqrt(sumSquares / Math.max(1, entry.timeData.length)) * 2.8);
      const sample = advanceStudioLipsync(entry.lipsyncState, rms, nowMs, { reducedMotion });
      entry.lipsyncState = sample.state;

      const binCount = entry.freqData.length;
      const lowEnd = Math.max(1, Math.floor(binCount * 0.14));
      const midEnd = Math.max(lowEnd + 1, Math.floor(binCount * 0.45));
      let low = 0;
      let mid = 0;
      let high = 0;
      for (let i = 0; i < binCount; i += 1) {
        const val = (entry.freqData[i] ?? 0) / 255;
        if (i < lowEnd) low += val;
        else if (i < midEnd) mid += val;
        else high += val;
      }
      result[actorId] = computeVisemeFromSpectrum(
        sample.level,
        low / lowEnd,
        mid / Math.max(1, midEnd - lowEnd),
        high / Math.max(1, binCount - midEnd),
      );
    }
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const actorId of [...this.entries.keys()]) this.detachActor(actorId);
    const ctx = this.context;
    this.context = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
