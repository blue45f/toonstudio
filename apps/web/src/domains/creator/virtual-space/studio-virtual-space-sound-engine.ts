/**
 * 가상 스튜디오 효과음 재생 엔진 (WebAudio 합성, 로컬 재생 전용).
 *
 * 발소리와 상호작용 SFX를 음원 파일 없이 합성해 이 기기에서만 재생한다.
 * 어떤 소리도 네트워크로 보내지 않고, 피어 소리는 호출 측이 거리 게인을
 * 계산해 넘긴 값만큼만 작아진다(패킷 추가 없음).
 *
 * 자동재생 정책: AudioContext는 사용자 제스처 안에서 부르는 unlock()으로만
 * 만들고, 제스처 없이 재생을 시도하면 suspended 컨텍스트의 소리를 쌓지 않고
 * 그냥 건너뛴다. 앰비언트 컨트롤러와 마찬가지로 명시적 켜짐(설정)이 없거나
 * OS reduced-motion이면 재생하지 않는다.
 */
import type { StudioFootstepEvent } from "./studio-virtual-space-footsteps";
import { studioOsPrefersReducedMotion } from "./studio-virtual-space-game-feel-preference";
import {
  studioFootstepSynthSpec,
  studioSfxSpec,
  type StudioSfxKind,
} from "./studio-virtual-space-sound-synth";
import type { StudioVirtualSoundPreference } from "./studio-virtual-space-sound-preference";

export interface StudioSoundEngineDependencies {
  createContext(): AudioContext;
  now?: () => number;
  prefersReducedMotion?: () => boolean;
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

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * 효과음 한 대를 소유한다. 설정 패널(React)이 만들어 모듈 버스에 등록하고,
 * 캔버스·프레즌스·fx 같은 이벤트 발생 지점은 버스 함수로만 닿는다.
 */
export class StudioVirtualSpaceSoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private volume = 0.7;
  private lastFootstepAt = Number.NEGATIVE_INFINITY;
  private readonly lastSfxAt = new Map<StudioSfxKind, number>();
  private disposed = false;

  constructor(private readonly dependencies: StudioSoundEngineDependencies = browserDependencies) {}

  /** 효과음 설정을 반영한다. 꺼지면 이후 재생은 전부 건너뛴다. */
  setPreference(preference: Pick<StudioVirtualSoundPreference, "effectsEnabled" | "effectsVolume">): void {
    this.enabled = preference.effectsEnabled;
    this.volume = clamp01(preference.effectsVolume);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.03);
    }
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

  /** 발소리 한 걸음. footsteps 모듈이 계산한 이벤트(표면·볼륨)를 그대로 소리로 바꾼다. */
  playFootstep(event: StudioFootstepEvent): void {
    const context = this.playableContext();
    if (!context || !this.master) return;
    const now = this.now();
    if (now - this.lastFootstepAt < FOOTSTEP_THROTTLE_MS) return;
    const eventGain = clamp01(event.volume) * FOOTSTEP_MASTER;
    if (eventGain <= 0.001) return;
    this.lastFootstepAt = now;
    const spec = studioFootstepSynthSpec(event.surface, event.foot);
    const start = context.currentTime;
    // 노이즈 버스트: 표면 필터를 통과시켜 음색을 만든다.
    const noise = context.createBufferSource();
    noise.buffer = this.noise(context);
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = spec.filterType;
    filter.frequency.value = spec.filterFrequency;
    filter.Q.value = spec.filterQ;
    const noiseGain = context.createGain();
    const duration = spec.durationMs / 1000;
    noiseGain.gain.setValueAtTime(0, start);
    noiseGain.gain.linearRampToValueAtTime(eventGain * spec.noisePeak, start + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    noise.connect(filter).connect(noiseGain).connect(this.master);
    noise.start(start, Math.random() * 0.4);
    noise.stop(start + duration + 0.02);
    // 표면 톤(나무 노크·타일 클릭): 짧은 오실레이터를 겹친다.
    if (spec.tone) {
      const tone = context.createOscillator();
      tone.type = spec.tone.wave;
      tone.frequency.value = spec.tone.frequency;
      const toneGain = context.createGain();
      const toneDuration = spec.tone.durationMs / 1000;
      toneGain.gain.setValueAtTime(0, start);
      toneGain.gain.linearRampToValueAtTime(eventGain * spec.tone.peak, start + 0.003);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, start + toneDuration);
      tone.connect(toneGain).connect(this.master);
      tone.start(start);
      tone.stop(start + toneDuration + 0.02);
    }
  }

  /** 상호작용 SFX 한 번. distanceGain은 호출 측이 acoustics 곡선으로 계산한 0~1 값이다. */
  playSfx(kind: StudioSfxKind, distanceGain = 1): void {
    const context = this.playableContext();
    if (!context || !this.master) return;
    const gainScale = clamp01(distanceGain) * SFX_MASTER;
    if (gainScale <= 0.001) return;
    const spec = studioSfxSpec(kind);
    const now = this.now();
    if (now - (this.lastSfxAt.get(kind) ?? Number.NEGATIVE_INFINITY) < spec.throttleMs) return;
    this.lastSfxAt.set(kind, now);
    const base = context.currentTime;
    for (const step of spec.steps) {
      const start = base + step.startOffsetMs / 1000;
      const duration = step.durationMs / 1000;
      const osc = context.createOscillator();
      osc.type = step.wave;
      osc.frequency.setValueAtTime(step.fromHz, start);
      if (step.toHz !== step.fromHz) osc.frequency.exponentialRampToValueAtTime(step.toHz, start + duration);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(gainScale * step.peak, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(this.master);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const context = this.context;
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    if (context) void context.close().catch(() => undefined);
  }

  private now(): number {
    return this.dependencies.now?.() ?? performance.now();
  }

  private ensureContext(): AudioContext | null {
    if (this.context || this.disposed) return this.context;
    try {
      const context = this.dependencies.createContext();
      this.master = context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(context.destination);
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
    if (this.disposed || !this.enabled || this.volume <= 0) return null;
    if (this.dependencies.prefersReducedMotion?.()) return null;
    const context = this.ensureContext();
    if (!context || context.state !== "running") {
      if (context?.state === "suspended") void context.resume().catch(() => undefined);
      return null;
    }
    return context;
  }

  /** 1초 화이트 노이즈 버퍼를 한 번만 만들어 재사용한다. */
  private noise(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === context.sampleRate) return this.noiseBuffer;
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }
}

// ===== 모듈 버스: 이벤트 발생 지점(캔버스·프레즌스·fx)은 등록된 엔진에만 닿는다 =====

let activeEngine: StudioVirtualSpaceSoundEngine | null = null;

/** 설정 패널이 엔진 소유권을 등록한다. null이면 등록 해제다. */
export function registerStudioSoundEngine(engine: StudioVirtualSpaceSoundEngine | null): void {
  activeEngine = engine;
}

/** 등록된 엔진이 없으면(패널 미마운트·테스트) 조용히 아무것도 하지 않는다. */
export function playStudioFootstepSound(event: StudioFootstepEvent): void {
  activeEngine?.playFootstep(event);
}

export function playStudioSfxSound(kind: StudioSfxKind, distanceGain?: number): void {
  activeEngine?.playSfx(kind, distanceGain);
}
