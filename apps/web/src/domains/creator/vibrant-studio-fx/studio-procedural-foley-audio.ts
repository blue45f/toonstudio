/**
 * 외부 파일 없이 `AudioContext`로 실시간 물리 모델링 사운드를 합성하는 Foley 엔진.
 *
 * - 10종 모델: `gpen-ink`, `graphite-pencil`, `watercolor-sable`, `oil-impasto`, `airbrush`,
 *   `eraser-scrub`, `magnetic-detent`, `bubble-pop`, `panel-snap`, `page-turn`
 * - 연동: 속도(`speed01`) · 필압(`pressure01`) · 기울기(`tilt01`) · 5종 종이 질감(`paperTexture`)
 * - 3채널 믹서(`foley`/`ui`/`ambience`) + 3프리셋(`quiet-atelier`/`lively-asmr`/`silent-focus`)
 * - 브라우저 영속 저장소 미사용.
 */

import {
  getPaperToothProfile,
  type StudioPaperTextureId,
} from "./studio-paper-and-pigment-physics";

export type StudioFoleySoundId =
  | "gpen-ink"
  | "graphite-pencil"
  | "watercolor-sable"
  | "oil-impasto"
  | "airbrush"
  | "eraser-scrub"
  | "magnetic-detent"
  | "bubble-pop"
  | "panel-snap"
  | "page-turn";

export const STUDIO_FOLEY_SOUND_IDS: readonly StudioFoleySoundId[] = Object.freeze([
  "gpen-ink",
  "graphite-pencil",
  "watercolor-sable",
  "oil-impasto",
  "airbrush",
  "eraser-scrub",
  "magnetic-detent",
  "bubble-pop",
  "panel-snap",
  "page-turn",
]);

export type StudioFoleyChannelId = "foley" | "ui" | "ambience";
export type StudioFoleyPresetId = "quiet-atelier" | "lively-asmr" | "silent-focus";

export interface StudioFoleyMixerPreset {
  readonly id: StudioFoleyPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly foley: number;
  readonly ui: number;
  readonly ambience: number;
  readonly muted: boolean;
}

export const STUDIO_FOLEY_PRESETS: Readonly<Record<StudioFoleyPresetId, StudioFoleyMixerPreset>> =
  Object.freeze({
    "quiet-atelier": Object.freeze({
      id: "quiet-atelier",
      labelKo: "차분한 아틀리에",
      descriptionKo: "작업 몰입을 돕는 절제된 종이 마찰음과 부드러운 도구 클릭",
      foley: 0.42,
      ui: 0.32,
      ambience: 0.14,
      muted: false,
    }),
    "lively-asmr": Object.freeze({
      id: "lively-asmr",
      labelKo: "생생한 ASMR",
      descriptionKo: "펜촉 스크래치·수채 물결·말풍선 톡 소리가 선명한 공방 음향",
      foley: 0.85,
      ui: 0.68,
      ambience: 0.32,
      muted: false,
    }),
    "silent-focus": Object.freeze({
      id: "silent-focus",
      labelKo: "무음 집중",
      descriptionKo: "모든 물리 Foley·UI 효과음·공간 잔향을 즉시 음소거",
      foley: 0,
      ui: 0,
      ambience: 0,
      muted: true,
    }),
  });

export const STUDIO_FOLEY_SOUND_CHANNELS: Readonly<Record<StudioFoleySoundId, StudioFoleyChannelId>> =
  Object.freeze({
    "gpen-ink": "foley",
    "graphite-pencil": "foley",
    "watercolor-sable": "foley",
    "oil-impasto": "foley",
    airbrush: "foley",
    "eraser-scrub": "foley",
    "magnetic-detent": "ui",
    "bubble-pop": "ui",
    "panel-snap": "ui",
    "page-turn": "ui",
  });

export interface StudioFoleyStrokeParams {
  readonly speed01?: number;
  readonly pressure01?: number;
  readonly tilt01?: number;
  readonly paperTexture?: StudioPaperTextureId;
}

export interface StudioFoleySynthesisProfile {
  readonly soundId: StudioFoleySoundId;
  readonly channel: StudioFoleyChannelId;
  readonly mode: "noise-band" | "dual-noise-tone" | "tone-sweep" | "latch-transient";
  readonly filterType: BiquadFilterType;
  readonly baseFrequencyHz: number;
  readonly endFrequencyHz: number;
  readonly filterQ: number;
  readonly durationSec: number;
  readonly peakGain: number;
  readonly harmonicHz: number | null;
  readonly paperTexture: StudioPaperTextureId;
}

export interface StudioFoleyMixerState {
  readonly preset: StudioFoleyPresetId;
  readonly muted: boolean;
  readonly channels: Readonly<Record<StudioFoleyChannelId, number>>;
  readonly ambienceRunning: boolean;
}

export interface StudioFoleyTriggerResult {
  readonly played: boolean;
  readonly soundId: StudioFoleySoundId;
  readonly channel: StudioFoleyChannelId;
  readonly effectiveGain: number;
  readonly profile: StudioFoleySynthesisProfile;
  readonly reason: "played" | "muted" | "zero-gain" | "no-audio-context" | "rate-limited" | "suspended";
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * 사운드 종류·속도·필압·기울기·5종 종이 질감을 결정론적 Web Audio 물리 파라미터로 계산한다.
 */
export function computeFoleySynthesisProfile(
  soundId: StudioFoleySoundId,
  params: StudioFoleyStrokeParams = {},
): StudioFoleySynthesisProfile {
  const v = clamp01(params.speed01 ?? 0.52);
  const p = clamp01(params.pressure01 ?? 0.56);
  const tilt = clamp01(params.tilt01 ?? 0.22);
  const paper = getPaperToothProfile(params.paperTexture ?? "manga-kent");
  const channel = STUDIO_FOLEY_SOUND_CHANNELS[soundId];
  const grainFactor = 0.72 + paper.acousticBrightness01 * 0.52;
  const toothDrag = 0.7 + paper.toothDepth01 * 0.55;

  const build = (
    mode: StudioFoleySynthesisProfile["mode"],
    filterType: BiquadFilterType,
    baseFrequencyHz: number,
    endFrequencyHz: number,
    filterQ: number,
    durationSec: number,
    peakGain: number,
    harmonicHz: number | null,
  ): StudioFoleySynthesisProfile => ({
    soundId,
    channel,
    mode,
    filterType,
    baseFrequencyHz: Math.round(baseFrequencyHz),
    endFrequencyHz: Math.round(endFrequencyHz),
    filterQ: Number(filterQ.toFixed(2)),
    durationSec: Number(durationSec.toFixed(3)),
    peakGain: Number(clamp01(peakGain).toFixed(3)),
    harmonicHz: harmonicHz === null ? null : Math.round(harmonicHz),
    paperTexture: paper.id,
  });

  switch (soundId) {
    case "gpen-ink":
      return build(
        "dual-noise-tone",
        "bandpass",
        (2150 + v * 1950 + p * 620) * grainFactor,
        (1850 + v * 1400) * grainFactor,
        3.4 + (1 - tilt) * 2.2 + paper.toothDepth01 * 1.4,
        0.045 + (1 - v) * 0.035,
        0.16 + p * 0.34 + v * 0.18,
        980 + p * 420 + v * 280,
      );
    case "graphite-pencil":
      return build(
        "noise-band",
        "bandpass",
        (760 + paper.grainFrequencyHz * 0.85 + v * 920) * (1 - tilt * 0.28),
        (680 + paper.grainFrequencyHz * 0.65 + v * 650) * (1 - tilt * 0.22),
        2.2 + paper.toothDepth01 * 3.1 - tilt * 0.8,
        0.065 + tilt * 0.04,
        (0.18 + p * 0.36 + tilt * 0.16) * toothDrag,
        null,
      );
    case "watercolor-sable":
      return build(
        "noise-band",
        "lowpass",
        420 + v * 580 + paper.absorbency01 * 260,
        320 + v * 380,
        0.9 + paper.capillarySpread01 * 0.6,
        0.11 + (1 - v) * 0.07,
        0.14 + p * 0.24 + v * 0.15,
        null,
      );
    case "oil-impasto":
      return build(
        "dual-noise-tone",
        "bandpass",
        230 + p * 240 + v * 190 + paper.toothDepth01 * 110,
        190 + p * 160,
        1.6 + p * 1.4,
        0.095 + p * 0.055,
        (0.2 + p * 0.36 + tilt * 0.14) * toothDrag,
        145 + p * 75,
      );
    case "airbrush":
      return build(
        "noise-band",
        "highpass",
        1650 + p * 1100 + v * 750,
        1450 + p * 820,
        0.75 + v * 0.55,
        0.12 + p * 0.06,
        0.11 + p * 0.28,
        null,
      );
    case "eraser-scrub":
      return build(
        "noise-band",
        "bandpass",
        620 + v * 920 + paper.frictionCoeff * 380,
        480 + v * 520,
        2.8 + paper.frictionCoeff * 1.8,
        0.075 + (1 - v) * 0.03,
        (0.18 + p * 0.32 + v * 0.18) * toothDrag,
        null,
      );
    case "magnetic-detent":
      return build("tone-sweep", "highpass", 1380 + v * 320, 340, 1.4, 0.022, 0.24 + p * 0.16, 2420);
    case "bubble-pop":
      return build("tone-sweep", "bandpass", 260, 820 + p * 210, 2.1, 0.062, 0.28 + p * 0.18, 520);
    case "panel-snap":
      return build("latch-transient", "bandpass", 2200, 620, 3.0, 0.044, 0.32 + p * 0.16, 210);
    case "page-turn":
      return build(
        "noise-band",
        "bandpass",
        540 + paper.acousticBrightness01 * 240,
        1880 + paper.acousticBrightness01 * 560,
        1.5,
        0.185,
        0.22 + v * 0.22,
        null,
      );
  }
}

export interface StudioFoleyAudioEngineOptions {
  readonly initialPreset?: StudioFoleyPresetId;
  readonly audioContextFactory?: () => AudioContext | null;
  readonly minTriggerIntervalMs?: number;
  readonly nowMs?: () => number;
}

function defaultAudioContextFactory(): AudioContext | null {
  if (typeof globalThis === "undefined") return null;
  const host = globalThis as typeof globalThis & { readonly webkitAudioContext?: typeof AudioContext };
  const Ctor = host.AudioContext ?? host.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export class StudioFoleyAudioEngine {
  private readonly contextFactory: () => AudioContext | null;
  private readonly minTriggerIntervalMs: number;
  private readonly nowMs: () => number;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private channelGains: Record<StudioFoleyChannelId, GainNode> | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private activeVoiceCleanups = new Set<() => void>();
  private resumeInFlight = false;
  private disposed = false;

  private preset: StudioFoleyPresetId;
  private muted: boolean;
  private channels: Record<StudioFoleyChannelId, number>;
  private lastTriggerAtMs = new Map<StudioFoleySoundId, number>();

  constructor(options: StudioFoleyAudioEngineOptions = {}) {
    this.contextFactory = options.audioContextFactory ?? defaultAudioContextFactory;
    this.minTriggerIntervalMs = Math.max(0, options.minTriggerIntervalMs ?? 16);
    this.nowMs = options.nowMs ?? (() => Date.now());
    const initial = STUDIO_FOLEY_PRESETS[options.initialPreset ?? "quiet-atelier"];
    this.preset = initial.id;
    this.muted = initial.muted;
    this.channels = { foley: initial.foley, ui: initial.ui, ambience: initial.ambience };
  }

  getPreset(): StudioFoleyPresetId {
    return this.preset;
  }

  getMixerState(): StudioFoleyMixerState {
    return {
      preset: this.preset,
      muted: this.muted,
      channels: { ...this.channels },
      ambienceRunning: this.ambienceSource !== null,
    };
  }

  applyPreset(presetId: StudioFoleyPresetId): StudioFoleyMixerState {
    const target = STUDIO_FOLEY_PRESETS[presetId];
    this.preset = target.id;
    this.muted = target.muted;
    this.channels = { foley: target.foley, ui: target.ui, ambience: target.ambience };
    this.syncGainNodes();
    if (this.muted) this.stopAmbience();
    return this.getMixerState();
  }

  setChannelVolume(channel: StudioFoleyChannelId, volume01: number): StudioFoleyMixerState {
    this.channels[channel] = Number(clamp01(volume01).toFixed(3));
    if (this.channels[channel] > 0 && this.preset === "silent-focus" && !this.muted) {
      this.preset = "quiet-atelier";
    }
    this.syncGainNodes();
    return this.getMixerState();
  }

  setMuted(muted: boolean): StudioFoleyMixerState {
    this.muted = muted;
    this.syncGainNodes();
    if (muted) this.stopAmbience();
    return this.getMixerState();
  }

  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    return ctx.state === "running";
  }

  triggerSound(
    soundId: StudioFoleySoundId,
    params: StudioFoleyStrokeParams = {},
  ): StudioFoleyTriggerResult {
    const profile = computeFoleySynthesisProfile(soundId, params);
    const channel = profile.channel;

    if (this.disposed || this.muted) {
      return { played: false, soundId, channel, effectiveGain: 0, profile, reason: "muted" };
    }

    const effectiveGain = Number((profile.peakGain * this.channels[channel]).toFixed(4));
    if (effectiveGain <= 0.0005) {
      return { played: false, soundId, channel, effectiveGain: 0, profile, reason: "zero-gain" };
    }

    const now = this.nowMs();
    const prevAt = this.lastTriggerAtMs.get(soundId);
    if (prevAt !== undefined && now - prevAt < this.minTriggerIntervalMs) {
      return { played: false, soundId, channel, effectiveGain, profile, reason: "rate-limited" };
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.channelGains || ctx.state === "closed") {
      return { played: false, soundId, channel, effectiveGain, profile, reason: "no-audio-context" };
    }
    if (ctx.state === "suspended") {
      // suspended 상태에서 보이스를 누적하면 resume 직후 t=0 동시 폭주·클리핑이 발생하므로 재생을 건너뛰고 복귀만 요청한다.
      if (!this.resumeInFlight && typeof ctx.resume === "function") {
        this.resumeInFlight = true;
        void Promise.resolve(ctx.resume())
          .catch(() => undefined)
          .finally(() => {
            this.resumeInFlight = false;
          });
      }
      return { played: false, soundId, channel, effectiveGain: 0, profile, reason: "suspended" };
    }

    this.lastTriggerAtMs.set(soundId, now);
    this.synthesizeVoice(ctx, this.channelGains[channel], profile);
    return { played: true, soundId, channel, effectiveGain, profile, reason: "played" };
  }

  startAmbience(): boolean {
    if (this.disposed || this.muted || this.channels.ambience <= 0) return false;
    if (this.ambienceSource) return true;
    const ctx = this.ensureContext();
    if (!ctx || !this.channelGains) return false;
    const buffer = this.ensureNoiseBuffer(ctx);
    if (!buffer) return false;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(360, ctx.currentTime);
    filter.Q.setValueAtTime(0.65, ctx.currentTime);

    src.connect(filter);
    filter.connect(this.channelGains.ambience);
    src.start(ctx.currentTime);
    this.ambienceSource = src;
    this.ambienceFilter = filter;
    return true;
  }

  stopAmbience(): void {
    for (const node of [this.ambienceSource, this.ambienceFilter]) {
      if (!node) continue;
      if ("stop" in node) {
        try {
          node.stop();
        } catch {
          // 이미 정지됨
        }
      }
      try {
        node.disconnect();
      } catch {
        // 이미 해제됨
      }
    }
    this.ambienceSource = null;
    this.ambienceFilter = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resumeInFlight = false;
    this.stopAmbience();
    for (const cleanupVoice of [...this.activeVoiceCleanups]) {
      cleanupVoice();
    }
    this.activeVoiceCleanups.clear();
    this.lastTriggerAtMs.clear();
    if (this.channelGains) {
      for (const gain of Object.values(this.channelGains)) {
        try {
          gain.disconnect();
        } catch {
          // 무시
        }
      }
      this.channelGains = null;
    }
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // 무시
      }
      this.masterGain = null;
    }
    if (this.ctx && typeof this.ctx.close === "function") {
      void Promise.resolve(this.ctx.close()).catch(() => undefined);
    }
    this.ctx = null;
    this.noiseBuffer = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const created = this.contextFactory();
    if (!created) return null;
    this.ctx = created;
    const master = created.createGain();
    const foley = created.createGain();
    const ui = created.createGain();
    const ambience = created.createGain();
    foley.connect(master);
    ui.connect(master);
    ambience.connect(master);
    master.connect(created.destination);
    this.masterGain = master;
    this.channelGains = { foley, ui, ambience };
    this.syncGainNodes();
    return created;
  }

  private syncGainNodes(): void {
    if (!this.ctx || !this.masterGain || !this.channelGains) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, t);
    this.channelGains.foley.gain.setValueAtTime(this.channels.foley, t);
    this.channelGains.ui.gain.setValueAtTime(this.channels.ui, t);
    this.channelGains.ambience.gain.setValueAtTime(this.channels.ambience * 0.25, t);
  }

  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (this.noiseBuffer) return this.noiseBuffer;
    const sampleRate = Math.max(8000, ctx.sampleRate || 44100);
    const length = Math.round(sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x517cc1b7;
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = (seed / 4294967296) * 2 - 1;
      b0 = 0.96 * b0 + white * 0.08;
      b1 = 0.72 * b1 + white * 0.28;
      data[i] = Math.max(-1, Math.min(1, white * 0.55 + b1 * 0.3 + b0 * 0.15));
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private synthesizeVoice(
    ctx: AudioContext,
    destination: GainNode,
    profile: StudioFoleySynthesisProfile,
  ): void {
    const startTime = ctx.currentTime;
    const endTime = startTime + profile.durationSec;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(profile.peakGain, startTime + Math.min(0.008, profile.durationSec * 0.22));
    env.gain.exponentialRampToValueAtTime(0.0001, endTime);
    env.connect(destination);

    const ownedNodes = new Set<AudioNode>([env]);
    const safeDisconnect = (node: AudioNode | null | undefined): void => {
      if (!node || !ownedNodes.has(node)) return;
      ownedNodes.delete(node);
      try {
        node.disconnect();
      } catch {
        // 이미 해제됨
      }
    };

    let pendingSources = 0;
    let voiceCleaned = false;

    const cleanupVoice = (): void => {
      if (voiceCleaned) return;
      voiceCleaned = true;
      this.activeVoiceCleanups.delete(cleanupVoice);
      for (const node of [...ownedNodes]) {
        safeDisconnect(node);
      }
    };

    const onSourceEnded = (sourceNodes: readonly AudioNode[]): void => {
      for (const node of sourceNodes) {
        safeDisconnect(node);
      }
      pendingSources = Math.max(0, pendingSources - 1);
      if (pendingSources === 0) {
        cleanupVoice();
      }
    };

    this.activeVoiceCleanups.add(cleanupVoice);

    if (profile.mode !== "tone-sweep") {
      const buffer = this.ensureNoiseBuffer(ctx);
      if (buffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = profile.filterType;
        filter.frequency.setValueAtTime(profile.baseFrequencyHz, startTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(60, profile.endFrequencyHz), endTime);
        filter.Q.setValueAtTime(profile.filterQ, startTime);
        noise.connect(filter);
        filter.connect(env);
        ownedNodes.add(noise);
        ownedNodes.add(filter);
        pendingSources += 1;
        noise.onended = () => {
          noise.onended = null;
          onSourceEnded([noise, filter]);
        };
        noise.start(startTime);
        noise.stop(endTime + 0.01);
      }
    }

    if (profile.mode !== "noise-band") {
      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();
      osc.type = profile.mode === "tone-sweep" ? "sine" : "triangle";
      const startHz = Math.max(60, profile.harmonicHz ?? profile.baseFrequencyHz);
      const stopHz = Math.max(60, profile.mode === "tone-sweep" ? profile.endFrequencyHz : startHz * 0.72);
      osc.frequency.setValueAtTime(startHz, startTime);
      osc.frequency.exponentialRampToValueAtTime(stopHz, endTime);
      toneGain.gain.setValueAtTime(profile.mode === "tone-sweep" ? 1 : 0.34, startTime);
      osc.connect(toneGain);
      toneGain.connect(env);
      ownedNodes.add(osc);
      ownedNodes.add(toneGain);
      pendingSources += 1;
      osc.onended = () => {
        osc.onended = null;
        onSourceEnded([osc, toneGain]);
      };
      osc.start(startTime);
      osc.stop(endTime + 0.01);
    }

    if (pendingSources === 0) {
      cleanupVoice();
    }
  }
}

export function createStudioFoleyAudioEngine(
  options: StudioFoleyAudioEngineOptions = {},
): StudioFoleyAudioEngine {
  return new StudioFoleyAudioEngine(options);
}
