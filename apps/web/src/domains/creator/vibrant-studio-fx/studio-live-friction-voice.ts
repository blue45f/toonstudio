import type { StudioFoleyNoiseTexture, StudioFoleySynthesisProfile } from "./studio-procedural-foley-audio";

export function fillTextureNoiseBuffer(data: Float32Array, texture: StudioFoleyNoiseTexture, seedInit: number, sampleRate: number): void {
  const len = data.length;
  let seed = seedInit >>> 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let smooth = 0;
  let gritEnv = 0;
  // 섬유 다발이 펜촉에 걸렸다 풀리는 불규칙한 간격을 재료마다 다르게 굽는다.
  const modulationDepth = texture === "gritty" ? 0.42 : texture === "pink" ? 0.28 : 0.08;
  let toothGain = 1;
  let toothStep = 0;
  let toothRemaining = 0;
  for (let i = 0; i < len; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = (seed / 4294967296) * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    const pink = (b0 + b1 + b2 + b3 + white * 0.1848) * 0.19;
    b3 = white * 0.115926;

    if (texture === "velvet") {
      smooth = smooth * 0.64 + pink * 0.36;
      data[i] = Math.tanh(smooth * 1.35) * 0.85;
    } else if (texture === "pink") {
      smooth = smooth * 0.28 + pink * 0.72;
      data[i] = Math.max(-0.95, Math.min(0.95, smooth * 0.95 + white * 0.1));
    } else {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const trig = seed / 4294967296;
      gritEnv = trig > 0.976 ? (trig > 0.988 ? 1 : -1) * (0.45 + (trig - 0.976) * 18) : gritEnv * 0.42;
      data[i] = Math.max(-0.95, Math.min(0.95, pink * 0.66 + white * 0.18 + gritEnv * 0.48));
    }
    if (toothRemaining === 0) {
      const scatter = (seed >>> 16) / 65536;
      toothRemaining = Math.max(1, Math.round(sampleRate * (0.006 + scatter * 0.024)));
      const target = 1 - modulationDepth * ((seed & 0xffff) / 65535);
      toothStep = (target - toothGain) / toothRemaining;
    }
    toothGain += toothStep;
    toothRemaining -= 1;
    data[i] = (data[i] ?? 0) * toothGain;
  }
  const fade = Math.min(256, Math.floor(len / 8));
  for (let i = 0; i < fade; i += 1) {
    const t = 0.5 * (1 - Math.cos((Math.PI * i) / fade));
    data[len - fade + i] = (data[len - fade + i] ?? 0) * (1 - t) + (data[i] ?? 0) * t;
  }
}

function hold(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
  } else {
    const value = param.value;
    param.cancelScheduledValues?.(time);
    param.setValueAtTime(Number.isFinite(value) ? value : 0, time);
  }
}

function glide(param: AudioParam, value: number, now: number): void {
  if (typeof param.setTargetAtTime === "function") param.setTargetAtTime(value, now, 0.012);
  else param.setValueAtTime(value, now);
}

/** 한 획의 연속 마찰음. 이동이 끊기면 오디오 시계에서 직접 감쇠·정지한다. */
export class StudioLiveFrictionVoice {
  readonly soundId: StudioFoleySynthesisProfile["soundId"];
  private readonly ctx: AudioContext;
  private readonly source: AudioBufferSourceNode;
  private readonly scratch: BiquadFilterNode;
  private readonly body: BiquadFilterNode;
  private readonly bodyGain: GainNode;
  private readonly level: GainNode;
  private stopAt = 0;

  constructor(
    ctx: AudioContext,
    destination: GainNode,
    buffer: AudioBuffer,
    profile: StudioFoleySynthesisProfile,
    offsetSec: number,
    onEnded: () => void,
  ) {
    this.ctx = ctx;
    this.soundId = profile.soundId;
    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    // 버퍼 끝은 첫 256개 샘플과 교차 페이드되어 있다.
    this.source.loopStart = 256 / ctx.sampleRate;
    this.scratch = ctx.createBiquadFilter();
    this.scratch.type = profile.filterType;
    this.body = ctx.createBiquadFilter();
    this.body.type = "bandpass";
    this.bodyGain = ctx.createGain();
    this.level = ctx.createGain();
    const now = ctx.currentTime;
    this.level.gain.setValueAtTime(0, now);
    this.scratch.frequency.setValueAtTime(profile.baseFrequencyHz, now);
    this.body.frequency.setValueAtTime(profile.bodyFrequencyHz ?? profile.endFrequencyHz, now);
    this.source.connect(this.scratch);
    this.scratch.connect(this.level);
    this.source.connect(this.body);
    this.body.connect(this.bodyGain);
    this.bodyGain.connect(this.level);
    this.level.connect(destination);
    this.source.onended = () => {
      this.dispose();
      onEnded();
    };
    this.source.start(now, offsetSec);
  }

  isLive(): boolean {
    return this.ctx.currentTime < this.stopAt;
  }

  move(profile: StudioFoleySynthesisProfile, speed: number): void {
    const now = this.ctx.currentTime;
    // 표면을 더 빨리 통과할수록 마찰 입자가 빠르고 밝아진다.
    if (this.source.playbackRate) glide(this.source.playbackRate, 0.54 + speed * 1.24, now);
    glide(this.scratch.frequency, profile.baseFrequencyHz, now);
    glide(this.scratch.Q, profile.filterQ, now);
    glide(this.body.frequency, profile.bodyFrequencyHz ?? profile.endFrequencyHz, now);
    glide(this.body.Q, profile.bodyFilterQ ?? 1, now);
    glide(this.bodyGain.gain, profile.bodyGainRatio, now);
    const gain = this.level.gain;
    hold(gain, now);
    gain.linearRampToValueAtTime(profile.peakGain, now + 0.016);
    gain.setValueAtTime(profile.peakGain, now + 0.065);
    const fadeEnd = now + 0.065 + profile.durationSec * profile.releaseRatio;
    gain.linearRampToValueAtTime(0, fadeEnd);
    this.stopAt = fadeEnd + 0.004;
    this.source.stop(this.stopAt);
  }

  release(): void {
    if (!this.isLive()) return;
    const now = this.ctx.currentTime;
    hold(this.level.gain, now);
    this.level.gain.linearRampToValueAtTime(0, now + 0.018);
    this.stopAt = now + 0.022;
    this.source.stop(this.stopAt);
  }

  dispose(): void {
    this.source.onended = null;
    this.source.disconnect();
    this.scratch.disconnect();
    this.body.disconnect();
    this.bodyGain.disconnect();
    this.level.disconnect();
  }
}
