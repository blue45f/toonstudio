/**
 * 가상 스튜디오 물리 발걸음·공간 효과음 재생 엔진 (WebAudio 합성, 로컬 재생 전용).
 *
 * 원시 화이트 노이즈 대신 3종 물리 성형 노이즈 버퍼(핑크·브라운·그릿)로
 * 2~3단계 발걸음(뒤꿈치 착지 → 발바닥 구름 → 미세 스침)과 따뜻한 어쿠스틱
 * 상호작용 폴리를 합성한다. 라운드-로빈 피치·타이밍 지터, 거리 기반 공기 흡음
 * 로우패스 필터, 좌/우 발 스테레오 패닝, 경량 실내 초기반사(ConvolverNode)를
 * 지원하며, 미지원 환경(테스트 mock 포함)에서는 모든 선택 노드를 안전하게 건너뛴다.
 *
 * 자동재생 정책: AudioContext는 사용자 제스처 안에서 부르는 unlock()으로만
 * 만들고, 제스처 없이 재생을 시도하면 suspended 컨텍스트의 소리를 쌓지 않고
 * 그냥 건너뛴다. 명시적 켜짐(설정)이 없거나 OS reduced-motion이면 재생하지 않는다.
 */
import type { StudioFootstepEvent } from "./studio-virtual-space-footsteps";
import { studioOsPrefersReducedMotion } from "./studio-virtual-space-game-feel-preference";
import {
  studioFootstepSynthSpec,
  studioSfxSpec,
  type StudioNoiseColor,
  type StudioSfxKind,
  type StudioSfxNoiseStep,
} from "./studio-virtual-space-sound-synth";
import type { StudioVirtualSoundPreference } from "./studio-virtual-space-sound-preference";
import { studioHuddleAudioFocusSnapshot, subscribeStudioHuddleAudioFocus } from "../live/huddle/studio-p2p-huddle-audio-focus";

export interface StudioSoundEngineDependencies {
  createContext(): AudioContext;
  now?: () => number;
  prefersReducedMotion?: () => boolean;
}

/** 발소리·상호작용 SFX의 선택적 공간 음향 힌트. */
export interface StudioSpatialAudioOptions {
  /** 좌우 스테레오 패닝(-1~1). 미지정 시 발걸음은 좌/우발 미세 패닝 적용. */
  readonly pan?: number;
  /** 거리 감쇠 계수(0~1). 작을수록 공기 흡음 로우패스 컷오프가 내려간다. */
  readonly distanceGain?: number;
}

const browserDependencies: StudioSoundEngineDependencies = {
  createContext: () => new AudioContext(),
  prefersReducedMotion: () => studioOsPrefersReducedMotion(),
};

/** 발소리 마스터 배율. 이벤트 볼륨(표면×속도)과 설정 음량에 다시 곱해진다. */
const FOOTSTEP_MASTER = 0.5;
/** SFX 마스터 배율. 레시피 peak와 거리 게인, 설정 음량에 다시 곱해진다. */
const SFX_MASTER = 0.5;
/** 발소리 전역 최소 간격(ms). 보폭 타이밍이 겹쳐 쌓이는 것을 막는다. */
const FOOTSTEP_THROTTLE_MS = 80;
const FOOTSTEP_SPRINT_THROTTLE_MS = 60;

/** 자연스러운 사람 보행을 위한 8단계 라운드-로빈 피치·타이밍·패닝 미세 지터. */
const STEP_PITCH_JITTER = [0.972, 1.028, 0.985, 1.033, 0.968, 1.019, 0.991, 1.024] as const;
const STEP_DELAY_JITTER_SEC = [0, 0.003, 0.001, 0.005, 0.002, 0.004, 0.001, 0.006] as const;
const STEP_PAN_JITTER = [-0.024, 0.022, -0.015, 0.026, -0.02, 0.014, -0.01, 0.023] as const;
const STEP_NOISE_OFFSETS = [0.03, 0.19, 0.37, 0.52, 0.11, 0.68, 0.29, 0.81] as const;
const SFX_PAN_SPREAD = [-0.06, 0.05, -0.03, 0.06, -0.04, 0.03] as const;

interface NoiseBufferBank {
  readonly sampleRate: number;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
  readonly grit: AudioBuffer;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clampPan(value: number): number {
  return Number.isFinite(value) ? Math.min(0.85, Math.max(-0.85, value)) : 0;
}

function clampHz(context: AudioContext, hz: number): number {
  const nyquist = Math.max(240, (context.sampleRate || 44100) * 0.45);
  return Math.max(40, Math.min(nyquist, hz));
}

/**
 * 거리 감쇠(0~1)에 따른 공기 고역 흡음 로우패스 컷오프(Hz)를 계산한다.
 * 가까울수록(1.0) 8000Hz로 트여 있고, 멀어질수록(0.0) 1400Hz까지 부드럽게 닫힌다.
 */
export function computeAirAbsorptionCutoffHz(distanceGain: number): number {
  const clamped = clamp01(distanceGain);
  return Math.round(1400 + clamped * 6600);
}

function nextSeed(state: number): number {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function normalizeSamples(data: Float32Array, targetPeak: number): void {
  let peak = 0;
  for (let index = 0; index < data.length; index += 1) {
    const abs = Math.abs(data[index] ?? 0);
    if (abs > peak) peak = abs;
  }
  if (peak <= 1e-6) return;
  const scale = targetPeak / peak;
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (data[index] ?? 0) * scale;
  }
}

function buildShapedNoiseBuffer(context: AudioContext, color: StudioNoiseColor, seedInit: number): AudioBuffer {
  const sampleRate = Math.max(8, context.sampleRate || 44100);
  const buffer = context.createBuffer(1, sampleRate, sampleRate);
  const data = buffer.getChannelData(0);
  let seed = seedInit >>> 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let brown = 0;
  let prevBrownIn = 0;
  let prevBrownOut = 0;
  let prevGrit = 0;

  for (let index = 0; index < data.length; index += 1) {
    seed = nextSeed(seed);
    const white = (seed / 2147483648) - 1;
    // Paul Kellet 7-pole 핑크 필터(-3 dB/oct).
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;

    if (color === "pink") {
      data[index] = pink;
    } else if (color === "brown") {
      // 누설 적분 + DC 차단 하이패스로 묵직한 뒤꿈치·카펫·마루 충격음 생성.
      brown = (brown + 0.032 * white) / 1.032;
      const dcBlocked = brown - prevBrownIn + 0.992 * prevBrownOut;
      prevBrownIn = brown;
      prevBrownOut = dcBlocked;
      data[index] = dcBlocked;
    } else {
      // 그릿: 핑크 바탕에 희소한 미세 입자 임펄스를 섞어 자갈·석재·세라믹 마찰감 구현.
      seed = nextSeed(seed);
      const grain = (seed & 31) === 0 ? white * 1.15 : 0;
      const raw = pink * 0.58 + grain * 0.42;
      const smoothed = raw * 0.72 + prevGrit * 0.28;
      prevGrit = smoothed;
      data[index] = smoothed;
    }
  }

  normalizeSamples(data, 0.9);
  return buffer;
}

/** 따뜻한 목재·석고 아틀리에 방의 240ms 스테레오 초기반사 임펄스 응답 생성. */
function buildEarlyReflectionImpulse(context: AudioContext): AudioBuffer {
  const sampleRate = Math.max(800, context.sampleRate || 44100);
  const frames = Math.max(32, Math.floor(sampleRate * 0.24));
  const buffer = context.createBuffer(2, frames, sampleRate);
  const tapsMs = [7, 13, 21, 32, 46, 64] as const;
  const tapGains = [0.58, 0.44, 0.34, 0.26, 0.19, 0.13] as const;
  const channels = typeof buffer.numberOfChannels === "number" ? Math.min(2, buffer.numberOfChannels) : 1;

  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch);
    let seed = (0x9e3779b9 ^ (ch * 0x85ebca6b)) >>> 0;
    let lp = 0;
    // 짧은 확산 잔향 꼬리(고역 감쇠).
    for (let i = 0; i < data.length; i += 1) {
      seed = nextSeed(seed);
      const white = (seed / 2147483648) - 1;
      lp = lp * 0.78 + white * 0.22;
      const env = (1 - i / data.length) ** 3.6;
      data[i] = lp * env * 0.28;
    }
    // 좌/우 위상 교대 초기 벽면 반사 탭.
    for (let t = 0; t < tapsMs.length; t += 1) {
      const offsetMs = (tapsMs[t] ?? 10) + (ch === 1 ? 1.8 : 0);
      const idx = Math.min(data.length - 1, Math.floor((offsetMs / 1000) * sampleRate));
      const sign = (t + ch) % 2 === 0 ? 1 : -1;
      data[idx] = (data[idx] ?? 0) + sign * (tapGains[t] ?? 0.2);
    }
    normalizeSamples(data, 0.85);
  }
  return buffer;
}

function setAudioParam(param: AudioParam | undefined, value: number, time: number): void {
  if (!param) return;
  if (typeof param.setValueAtTime === "function") {
    param.setValueAtTime(value, time);
  } else {
    param.value = value;
  }
}

function expRampAudioParam(param: AudioParam | undefined, value: number, time: number): void {
  if (!param) return;
  const safeValue = Math.max(0.0001, value);
  if (typeof param.exponentialRampToValueAtTime === "function") {
    param.exponentialRampToValueAtTime(safeValue, time);
  } else {
    param.value = safeValue;
  }
}

/**
 * 효과음 한 대를 소유한다. 설정 패널(React)이 만들어 모듈 버스에 등록하고,
 * 캔버스·프레즌스·fx 같은 이벤트 발생 지점은 버스 함수로만 닿는다.
 */
export class StudioVirtualSpaceSoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private roomConvolver: ConvolverNode | null = null;
  private roomWet: GainNode | null = null;
  private noiseBuffers: NoiseBufferBank | null = null;
  private enabled = true;
  private stageMuted = false;
  private volume = 0.7;
  private lastFootstepAt = Number.NEGATIVE_INFINITY;
  private readonly lastSfxAt = new Map<StudioSfxKind, number>();
  private footstepCycle = 0;
  private sfxCycle = 0;
  private disposed = false;
  private ducked = studioHuddleAudioFocusSnapshot();
  private readonly unsubscribeAudioFocus: () => void;

  constructor(private readonly dependencies: StudioSoundEngineDependencies = browserDependencies) {
    this.unsubscribeAudioFocus = subscribeStudioHuddleAudioFocus(() => {
      this.ducked = studioHuddleAudioFocusSnapshot();
      this.applyGain();
    });
  }

  /** 효과음 설정을 반영한다. 꺼지면 현재 출력을 낮추고 이후 재생도 건너뛴다. */
  setPreference(preference: Pick<StudioVirtualSoundPreference, "effectsEnabled" | "effectsVolume">): void {
    this.enabled = preference.effectsEnabled;
    this.volume = clamp01(preference.effectsVolume);
    this.applyGain();
  }

  /** 2D/3D 스테이지 상단 음소거 토글 상태를 동기화한다. */
  setStageMuted(muted: boolean): void {
    this.stageMuted = muted;
    this.applyGain();
  }

  /**
   * 사용자 제스처 안에서 호출한다. 컨텍스트를 만들고(없으면) 재개한다.
   * 제스처가 아니면 브라우저가 suspended로 남겨 두며, 재생 측은 그 상태를
   * 보고 건너뛸 뿐 소리를 예약하지 않는다.
   */
  unlock(): void {
    if (this.disposed) return;
    const context = this.ensureContext();
    if (context && context.state === "suspended") void context.resume().catch(() => undefined);
  }

  /** 발소리 한 걸음. 2~3단계(뒤꿈치 착지 → 발바닥 구름 → 미세 스침) 물리 발걸음을 합성한다. */
  playFootstep(event: StudioFootstepEvent, spatial?: StudioSpatialAudioOptions): void {
    const context = this.playableContext();
    if (!context || !this.master) return;
    const now = this.now();
    const minInterval = event.sprinting ? FOOTSTEP_SPRINT_THROTTLE_MS : FOOTSTEP_THROTTLE_MS;
    if (now - this.lastFootstepAt < minInterval) return;
    const distanceGain = spatial?.distanceGain !== undefined ? clamp01(spatial.distanceGain) : 1;
    const eventGain = clamp01(event.volume) * distanceGain * FOOTSTEP_MASTER;
    if (eventGain <= 0.001) return;
    this.lastFootstepAt = now;

    const cycleIndex = this.footstepCycle % STEP_PITCH_JITTER.length;
    this.footstepCycle += 1;
    const pitchJitter = STEP_PITCH_JITTER[cycleIndex] ?? 1;
    const delayJitterSec = STEP_DELAY_JITTER_SEC[cycleIndex] ?? 0;
    const panJitter = STEP_PAN_JITTER[cycleIndex] ?? 0;
    const noiseOffset = STEP_NOISE_OFFSETS[cycleIndex] ?? 0.1;

    const spec = studioFootstepSynthSpec(event.surface, event.foot, event.sprinting === true);
    const start = context.currentTime;
    const footBasePan = event.foot === "left" ? -0.14 : 0.14;
    const targetPan = clampPan((spatial?.pan ?? 0) + footBasePan + panJitter);

    // 1~2단계(뒤꿈치 착지 → 발바닥 구름) 주 필터를 먼저 생성해 기존 테스트 노드 순서 호환성을 유지한다.
    const noise = context.createBufferSource();
    noise.buffer = this.noise(context, spec.noiseColor);
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = spec.filterType;
    filter.Q.value = spec.filterQ;

    const destination = this.createSpatialVoiceTarget(context, this.master, distanceGain, targetPan, start);

    const soleDelay = Math.max(0.011, spec.soleRoll.delayMs / 1000 + delayJitterSec);
    const totalDuration = Math.max(spec.durationMs / 1000, soleDelay + spec.soleRoll.durationMs / 1000);
    const heelHz = clampHz(context, spec.filterFrequency * pitchJitter);
    const soleHz = clampHz(context, spec.heelToSoleHz * pitchJitter);
    setAudioParam(filter.frequency, heelHz, start);
    if (soleHz !== heelHz) {
      expRampAudioParam(filter.frequency, soleHz, start + soleDelay + spec.soleRoll.durationMs / 1000);
    }

    const noiseGain = context.createGain();
    const heelPeak = eventGain * spec.noisePeak;
    const valleyTime = Math.max(0.007, soleDelay * 0.72);
    const solePeak = Math.max(0.0002, heelPeak * spec.soleRoll.peakRatio);
    noiseGain.gain.setValueAtTime(0, start);
    noiseGain.gain.linearRampToValueAtTime(heelPeak, start + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, heelPeak * 0.24), start + valleyTime);
    noiseGain.gain.linearRampToValueAtTime(solePeak, start + soleDelay);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + totalDuration);
    noise.connect(filter).connect(noiseGain).connect(destination);
    noise.start(start, noiseOffset);
    noise.stop(start + totalDuration + 0.02);

    // 바닥 공명 바디(나무 마루·세라믹·석재 등 — 댐핑 피치 하강 + 로우패스로 전자음 제거).
    if (spec.tone) {
      this.playDampedTone(context, destination, {
        wave: spec.tone.wave,
        fromHz: spec.tone.frequency * pitchJitter,
        toHz: (spec.tone.endFrequency ?? spec.tone.frequency * 0.65) * pitchJitter,
        startAt: start,
        durationSec: spec.tone.durationMs / 1000,
        peak: eventGain * spec.tone.peak,
        attackSec: 0.003,
        lowpassHz: spec.tone.lowpassHz,
      });
    }

    // 달리기 2단 앞꿈치 추진 공명 톤.
    if (spec.secondaryTone) {
      const pushStart = start + spec.secondaryTone.startOffsetMs / 1000 + delayJitterSec * 0.5;
      this.playDampedTone(context, destination, {
        wave: spec.secondaryTone.wave,
        fromHz: spec.secondaryTone.frequency * pitchJitter,
        toHz: (spec.secondaryTone.endFrequency ?? spec.secondaryTone.frequency * 0.7) * pitchJitter,
        startAt: pushStart,
        durationSec: spec.secondaryTone.durationMs / 1000,
        peak: eventGain * spec.secondaryTone.peak,
        attackSec: 0.003,
        lowpassHz: spec.secondaryTone.lowpassHz,
      });
    }

    // 3단계 미세 스침(보행 시 scuffNoise, 달리기 시 추진 frictionNoise — 총 버퍼소스 2개 유지).
    const trailingNoise = spec.frictionNoise ?? spec.scuffNoise;
    if (trailingNoise) {
      this.playNoiseStep(
        context,
        destination,
        start + delayJitterSec * 0.5,
        eventGain,
        trailingNoise,
        pitchJitter,
        (noiseOffset + 0.27) % 0.85,
      );
    }
  }

  /** 상호작용 SFX 한 번. distanceGain은 호출 측이 acoustics 곡선으로 계산한 0~1 값이다. */
  playSfx(kind: StudioSfxKind, distanceGain = 1, pan = 0): void {
    const context = this.playableContext();
    if (!context || !this.master) return;
    const clampedDistance = clamp01(distanceGain);
    const gainScale = clampedDistance * SFX_MASTER;
    if (gainScale <= 0.001) return;
    const spec = studioSfxSpec(kind);
    const now = this.now();
    if (now - (this.lastSfxAt.get(kind) ?? Number.NEGATIVE_INFINITY) < spec.throttleMs) return;
    this.lastSfxAt.set(kind, now);

    const spreadPan = pan !== 0 ? pan : (SFX_PAN_SPREAD[this.sfxCycle % SFX_PAN_SPREAD.length] ?? 0);
    const noiseOffset = STEP_NOISE_OFFSETS[this.sfxCycle % STEP_NOISE_OFFSETS.length] ?? 0.08;
    this.sfxCycle += 1;

    const base = context.currentTime;
    const destination = this.createSpatialVoiceTarget(context, this.master, clampedDistance, clampPan(spreadPan), base);

    for (const step of spec.steps) {
      this.playDampedTone(context, destination, {
        wave: step.wave,
        fromHz: step.fromHz,
        toHz: step.toHz,
        startAt: base + step.startOffsetMs / 1000,
        durationSec: step.durationMs / 1000,
        peak: gainScale * step.peak,
        attackSec: Math.max(0.0025, (step.attackMs ?? 4) / 1000),
        lowpassHz: step.lowpassHz,
      });
    }
    if (spec.noiseSteps) {
      spec.noiseSteps.forEach((noiseStep, idx) => {
        this.playNoiseStep(
          context,
          destination,
          base,
          gainScale,
          noiseStep,
          1,
          (noiseOffset + idx * 0.19) % 0.85,
        );
      });
    }
  }

  private playDampedTone(
    context: AudioContext,
    destination: AudioNode,
    options: {
      readonly wave: "sine" | "triangle";
      readonly fromHz: number;
      readonly toHz: number;
      readonly startAt: number;
      readonly durationSec: number;
      readonly peak: number;
      readonly attackSec: number;
      readonly lowpassHz?: number;
    },
  ): void {
    const osc = context.createOscillator();
    osc.type = options.wave;
    const fromHz = clampHz(context, options.fromHz);
    const toHz = clampHz(context, options.toHz);
    setAudioParam(osc.frequency, fromHz, options.startAt);
    if (toHz !== fromHz) {
      expRampAudioParam(osc.frequency, toHz, options.startAt + options.durationSec);
    }

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, options.startAt);
    gain.gain.linearRampToValueAtTime(Math.max(0.0002, options.peak), options.startAt + options.attackSec);
    gain.gain.exponentialRampToValueAtTime(0.0001, options.startAt + options.durationSec);

    if (options.lowpassHz && options.lowpassHz > 0) {
      const bodyFilter = context.createBiquadFilter();
      bodyFilter.type = "lowpass";
      setAudioParam(bodyFilter.frequency, clampHz(context, options.lowpassHz), options.startAt);
      setAudioParam(bodyFilter.Q, 0.7, options.startAt);
      osc.connect(bodyFilter).connect(gain).connect(destination);
    } else {
      osc.connect(gain).connect(destination);
    }
    osc.start(options.startAt);
    osc.stop(options.startAt + options.durationSec + 0.02);
  }

  private playNoiseStep(
    context: AudioContext,
    destination: AudioNode,
    baseTime: number,
    gainScale: number,
    step: StudioSfxNoiseStep,
    pitchScale = 1,
    noiseOffset = 0.05,
  ): void {
    const start = baseTime + step.startOffsetMs / 1000;
    const duration = Math.max(0.015, step.durationMs / 1000);
    const noise = context.createBufferSource();
    noise.buffer = this.noise(context, step.noiseColor ?? "pink");
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = step.filterType;
    filter.Q.value = step.filterQ;
    const fromHz = clampHz(context, step.fromHz * pitchScale);
    const toHz = clampHz(context, step.toHz * pitchScale);
    setAudioParam(filter.frequency, fromHz, start);
    if (toHz !== fromHz) {
      expRampAudioParam(filter.frequency, toHz, start + duration);
    }
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(Math.max(0.0002, gainScale * step.peak), start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    noise.connect(filter).connect(gain).connect(destination);
    noise.start(start, noiseOffset);
    noise.stop(start + duration + 0.02);
  }

  /** 거리 공기 흡음 로우패스 + 스테레오 패닝 체인을 구성한다(미지원 mock에서는 생략). */
  private createSpatialVoiceTarget(
    context: AudioContext,
    master: GainNode,
    distanceGain: number,
    pan: number,
    startAt: number,
  ): AudioNode {
    let target: AudioNode = master;

    if (typeof context.createStereoPanner === "function" && Math.abs(pan) > 0.001) {
      const panner = context.createStereoPanner();
      setAudioParam(panner.pan, pan, startAt);
      panner.connect(target);
      target = panner;
    }

    if (distanceGain < 0.98) {
      const airFilter = context.createBiquadFilter();
      airFilter.type = "lowpass";
      setAudioParam(airFilter.frequency, clampHz(context, computeAirAbsorptionCutoffHz(distanceGain)), startAt);
      setAudioParam(airFilter.Q, 0.55, startAt);
      airFilter.connect(target);
      target = airFilter;
    }

    return target;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeAudioFocus();
    const context = this.context;
    try {
      this.roomConvolver?.disconnect?.();
      this.roomWet?.disconnect?.();
    } catch {
      // 일부 mock AudioNode에서는 disconnect가 없을 수 있다.
    }
    this.context = null;
    this.master = null;
    this.roomConvolver = null;
    this.roomWet = null;
    this.noiseBuffers = null;
    if (context) void context.close().catch(() => undefined);
  }

  private now(): number {
    return this.dependencies.now?.() ?? performance.now();
  }

  /** 회의 우선순위는 사용자 음량·켜짐 설정과 별개이며 이미 재생 중인 소리에도 적용한다. */
  private outputVolume(): number {
    return this.enabled && !this.stageMuted ? this.volume * (this.ducked ? 0.15 : 1) : 0;
  }

  private applyGain(): void {
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.outputVolume(), this.context.currentTime, 0.03);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context || this.disposed) return this.context;
    try {
      const context = this.dependencies.createContext();
      this.master = context.createGain();
      this.master.gain.value = this.outputVolume();
      this.master.connect(context.destination);

      // 경량 실내 초기반사 버스: ConvolverNode 지원 브라우저에서만 연결하고 mock에서는 건너뛴다.
      if (typeof context.createConvolver === "function") {
        try {
          const roomDamp = context.createBiquadFilter();
          roomDamp.type = "lowpass";
          setAudioParam(roomDamp.frequency, clampHz(context, 3100), context.currentTime);
          setAudioParam(roomDamp.Q, 0.55, context.currentTime);

          const convolver = context.createConvolver();
          convolver.buffer = buildEarlyReflectionImpulse(context);

          const wet = context.createGain();
          wet.gain.value = 0.17;

          this.master.connect(roomDamp);
          roomDamp.connect(convolver);
          convolver.connect(wet);
          wet.connect(context.destination);

          this.roomConvolver = convolver;
          this.roomWet = wet;
        } catch {
          // 일부 제한된 AudioContext 구현에서 Convolver 초기화 실패 시 dry 전용으로 계속 동작한다.
          this.roomConvolver = null;
          this.roomWet = null;
        }
      }

      this.context = context;
      return context;
    } catch {
      return null;
    }
  }

  /**
   * 재생 가능한 컨텍스트만 돌려준다. 없으면 만들되(제스처 이후의 재생 시도)
   * running이 아니면 이번 소리는 건너뛴다 — suspended 상태에서 예약된 소리가
   * 나중에 한꺼번에 터지는 일을 막기 위해서다.
   */
  private playableContext(): AudioContext | null {
    if (this.disposed || !this.enabled || this.stageMuted || this.volume <= 0) return null;
    if (this.dependencies.prefersReducedMotion?.()) return null;
    const context = this.ensureContext();
    if (!context || context.state !== "running") {
      if (context?.state === "suspended") void context.resume().catch(() => undefined);
      return null;
    }
    return context;
  }

  /** 1초 물리 성형 노이즈 버퍼(핑크·브라운·그릿)를 한 번만 만들어 재사용한다. */
  private noise(context: AudioContext, color: StudioNoiseColor): AudioBuffer {
    const sampleRate = Math.max(8, context.sampleRate || 44100);
    if (this.noiseBuffers && this.noiseBuffers.sampleRate === sampleRate) {
      return this.noiseBuffers[color];
    }
    this.noiseBuffers = {
      sampleRate,
      pink: buildShapedNoiseBuffer(context, "pink", 0x9e3779b9),
      brown: buildShapedNoiseBuffer(context, "brown", 0x85ebca6b),
      grit: buildShapedNoiseBuffer(context, "grit", 0xc2b2ae35),
    };
    return this.noiseBuffers[color];
  }
}

// ===== 모듈 버스: 이벤트 발생 지점(캔버스·프레즌스·fx)은 등록된 엔진에만 닿는다 =====

let activeEngine: StudioVirtualSpaceSoundEngine | null = null;
let stageMutedOverlay = false;

/** 설정 패널이 엔진 소유권을 등록한다. null이면 등록 해제다. */
export function registerStudioSoundEngine(engine: StudioVirtualSpaceSoundEngine | null): void {
  activeEngine = engine;
  if (engine) engine.setStageMuted(stageMutedOverlay);
}

/** 2D/3D 스테이지의 음소거 버튼을 효과음 엔진과 동기화한다. */
export function setStudioSoundEngineMuted(muted: boolean): void {
  stageMutedOverlay = muted;
  activeEngine?.setStageMuted(muted);
}

/** 사용자 제스처 직후 AudioContext를 안전하게 활성화한다. */
export function unlockStudioSoundEngine(): void {
  activeEngine?.unlock();
}

/** 등록된 엔진이 없으면(패널 미마운트·테스트) 조용히 아무것도 하지 않는다. */
export function playStudioFootstepSound(
  event: StudioFootstepEvent,
  spatial?: StudioSpatialAudioOptions,
): void {
  activeEngine?.playFootstep(event, spatial);
}

export function playStudioSfxSound(kind: StudioSfxKind, distanceGain?: number, pan?: number): void {
  activeEngine?.playSfx(kind, distanceGain, pan);
}
