import { releasePlaylistMedia } from "./playlist-media-release";

/**
 * @toonstudio/core/fx/audio — 브라우저용 isomorphic 오디오 엔진.
 *
 * 설계 원칙
 * - **하이브리드 오디오**: SFX와 폴백 BGM은 Web Audio로 합성하고, 앱이 등록한 라이선스 음원은
 *   호스티드 플레이리스트로 재생합니다.
 * - **단일 lazy AudioContext**: 최초 사용자 제스처 시점에 1개만 만들고 재사용해요(autoplay 정책 준수).
 * - **graceful no-op**: SSR·비브라우저·미지원·차단 환경에서 어떤 호출도 조용히 무시되고 절대 throw 하지 않습니다.
 *   (`window`/`AudioContext` 가드 + 전역 try/catch). 비브라우저 환경에서도 안전합니다.
 * - **React/Tailwind/Node 의존 0**: Web Audio + (선택) localStorage 만 씁니다.
 *
 * BGM 성격(2026-09 사이트 사운드스케이프)
 * - **페이지·장르별 15개 테마**: 오프닝·배틀·시티팝 같은 역동적 OST뿐 아니라 작가 작업실,
 *   밤의 자료실, 로판 왈츠, 미스터리 누아르, 힐링, 세계관 탐색용 저자극 테마를 제공합니다.
 * - 절차형·호스티드 음원 모두 전용 버스(대역 정리·완만한 컴프레션·짧은 스테레오 룸)를 공유하고,
 *   마스터와 독립된 BGM 음량으로 읽기·작업 집중을 해치지 않게 제어합니다.
 * - `public/audio/*.mp3` 검토 완료 플레이리스트를 선택하면 원음 OST를 재생하고, 파일·네트워크 문제 시
 *   생성형으로 graceful 폴백합니다(`registerBgmPlaylist`).
 *
 * 공개 표면(요약)
 * - 효과음:   `playSfx('tick'|'pop'|'success'|'error')`
 * - BGM:      `bgmPlay` / `bgmPause` / `bgmToggle` / `bgmNext` / `bgmSetMood` · 15개 무드 자동 로테이션(crossfade)
 * - 무드:     `BGM_PRESETS`(id·name·emoji) · `getCurrentMoodName` · `bgmSetMood`
 * - 마스터:   `setMuted` / `isMuted` · `setMasterVolume` / `getMasterVolume` · `setBgmVolume` / `getBgmVolume`
 * - 영속 opt-in: `setSfxEnabled` / `setBgmEnabled`(localStorage) + `getAudioState` / `onAudioStateChange`
 * - UX 가드:  기본 OFF(autoplay 금지) · enable 시 fade-in · 탭 숨김(visibilitychange) 시 자동 일시정지 ·
 *             reduce-motion 이면 SFX 기본 OFF · mute + 영속 opt-in.
 * - 플레이리스트: `registerBgmPlaylist(urls)`(있으면 mp3 우선, 없으면 생성형)
 * - 컨텍스트 가드: `suspendBgmForContext` / `resumeBgmForContext`(오디오 편집·통화·게임 충돌 방지)
 * - 언락:     `resumeAudio`(제스처 핸들러에서 호출하면 suspended 컨텍스트를 깨워요)
 */

/* ────────────────────────────────────────────────────────────────────────── *
 * 0. 컨텍스트 싱글톤 (lazy · 제스처 언락 · graceful)
 * ────────────────────────────────────────────────────────────────────────── */

type AudioContextCtor = typeof AudioContext;

let cachedContext: AudioContext | null = null;
let contextUnavailable = false;

const resolveAudioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === "undefined") return null;
  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return typeof candidate === "function" ? candidate : null;
};

/**
 * 공유 AudioContext 를 반환해요(없으면 lazy 생성). 미지원/비브라우저면 null → 호출부는 no-op.
 * 최초 호출은 사용자 제스처 안에서 일어나도록 설계되어 있어요(autoplay 정책).
 */
const getAudioContext = (): AudioContext | null => {
  if (cachedContext) return cachedContext;
  if (contextUnavailable) return null;
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) {
    contextUnavailable = true;
    return null;
  }
  try {
    cachedContext = new Ctor();
    return cachedContext;
  } catch {
    contextUnavailable = true;
    return null;
  }
};

/** 현재 오디오 클럭(초). 컨텍스트 없으면 0. 스케줄링 기준 시각. */
const audioNow = (): number => {
  const ctx = getAudioContext();
  return ctx ? ctx.currentTime : 0;
};

/**
 * 컨텍스트를 resume 해 언락해요(제스처 핸들러 안에서 호출). 반환 Promise 는 절대 reject 되지 않아요.
 */
export const resumeAudio = async (): Promise<void> => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // 무시 — 다음 제스처에서 다시 시도돼요.
    }
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 1. 마스터 버스 (mute + volume — 모든 소리가 여기로 모임)
 * ────────────────────────────────────────────────────────────────────────── */

/** 합성 음량을 은은하게 유지하기 위한 마스터 상한(0~1 사용자 볼륨에 곱해짐). */
const MASTER_CEILING = 0.55;
/** 저장된 볼륨이 없을 때의 낮은 기본 볼륨 — 비트가 있는 BGM 이라도 거슬리지 않게 시작. */
const DEFAULT_VOLUME = 0.55;
/** BGM 전용 기본 볼륨. 마스터와 곱해져 내레이션·읽기 집중을 방해하지 않게 시작한다. */
const DEFAULT_BGM_VOLUME = 0.48;

let masterGain: GainNode | null = null;
let sfxBus: GainNode | null = null;
let bgmBus: GainNode | null = null;
let userVolume = 1; // 0~1, 사용자 마스터 볼륨.
let bgmUserVolume = DEFAULT_BGM_VOLUME; // 0~1, BGM 전용 볼륨.
let muted = false;

const targetMasterGain = (): number => (muted ? 0 : MASTER_CEILING * userVolume);
const targetBgmGain = (): number => bgmUserVolume;

/** 마스터 게인 노드(모든 SFX/BGM 출력의 종착지). 컨텍스트당 1개. */
const ensureMasterGain = (ctx: AudioContext): GainNode => {
  if (masterGain) return masterGain;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(targetMasterGain(), ctx.currentTime);
  gain.connect(ctx.destination);
  masterGain = gain;
  return gain;
};

/**
 * SFX 전용 버스. 클릭이 연속되어도 피크가 튀지 않도록 가벼운 대역 제한과 컴프레서를 거친다.
 * BGM은 이 버스를 통과하지 않으므로 보컬 음색과 다이내믹은 그대로 유지된다.
 */
const ensureSfxBus = (ctx: AudioContext): GainNode => {
  if (sfxBus) return sfxBus;

  const input = ctx.createGain();
  const highpass = ctx.createBiquadFilter();
  const lowpass = ctx.createBiquadFilter();
  const compressor = ctx.createDynamicsCompressor();

  input.gain.setValueAtTime(0.86, ctx.currentTime);
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(85, ctx.currentTime);
  highpass.Q.setValueAtTime(0.55, ctx.currentTime);
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(6400, ctx.currentTime);
  lowpass.Q.setValueAtTime(0.45, ctx.currentTime);
  compressor.threshold.setValueAtTime(-20, ctx.currentTime);
  compressor.knee.setValueAtTime(18, ctx.currentTime);
  compressor.ratio.setValueAtTime(3, ctx.currentTime);
  compressor.attack.setValueAtTime(0.004, ctx.currentTime);
  compressor.release.setValueAtTime(0.12, ctx.currentTime);

  input.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(ensureMasterGain(ctx));
  sfxBus = input;
  return input;
};

/** 절차형·호스티드 BGM 공용 버스. 대역 정리, 완만한 컴프레션, 짧은 스테레오 룸을 공유한다. */
const ensureBgmBus = (ctx: AudioContext): GainNode => {
  if (bgmBus) return bgmBus;

  const input = ctx.createGain();
  const highpass = ctx.createBiquadFilter();
  const lowpass = ctx.createBiquadFilter();
  const compressor = ctx.createDynamicsCompressor();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const convolver = ctx.createConvolver();

  input.gain.setValueAtTime(targetBgmGain(), ctx.currentTime);
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(38, ctx.currentTime);
  highpass.Q.setValueAtTime(0.55, ctx.currentTime);
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(9200, ctx.currentTime);
  lowpass.Q.setValueAtTime(0.35, ctx.currentTime);
  compressor.threshold.setValueAtTime(-19, ctx.currentTime);
  compressor.knee.setValueAtTime(22, ctx.currentTime);
  compressor.ratio.setValueAtTime(2.4, ctx.currentTime);
  compressor.attack.setValueAtTime(0.018, ctx.currentTime);
  compressor.release.setValueAtTime(0.32, ctx.currentTime);
  dry.gain.setValueAtTime(0.92, ctx.currentTime);
  wet.gain.setValueAtTime(0.11, ctx.currentTime);

  const seconds = 1.35;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, frames, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    let seed = (0x9e3779b9 ^ (channel * 0x85ebca6b)) >>> 0;
    for (let index = 0; index < frames; index += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const noise = (seed >>> 0) / 2147483648 - 1;
      const envelope = (1 - index / frames) ** 3.2;
      data[index] = noise * envelope;
    }
  }
  convolver.buffer = impulse;

  input.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(dry);
  dry.connect(ensureMasterGain(ctx));
  compressor.connect(convolver);
  convolver.connect(wet);
  wet.connect(ensureMasterGain(ctx));

  bgmBus = input;
  return input;
};

/** 마스터 게인을 현재 mute/volume 상태로 부드럽게 적용. */
const applyMasterGain = (): void => {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  try {
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
    masterGain.gain.linearRampToValueAtTime(targetMasterGain(), now + 0.08);
  } catch {
    // 무시.
  }
};

/** BGM 전용 게인을 페이지 전환·슬라이더 조작 중에도 클릭 없이 부드럽게 적용한다. */
const applyBgmGain = (): void => {
  const ctx = getAudioContext();
  if (!ctx || !bgmBus) return;
  try {
    const now = ctx.currentTime;
    bgmBus.gain.cancelScheduledValues(now);
    bgmBus.gain.setValueAtTime(Math.max(0.0001, bgmBus.gain.value), now);
    bgmBus.gain.linearRampToValueAtTime(targetBgmGain(), now + 0.12);
  } catch {
    // 무시.
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 2. 효과음(SFX) — 물리 아틀리에 마이크로 폴리(14종 · 성형 노이즈 · 라운드-로빈 변주)
 * ────────────────────────────────────────────────────────────────────────── */

export const SFX_NAMES = [
  "tick", "pop", "success", "error", "sparkle", "woosh", "open", "close", "tab", "heart",
  "toggle-on", "toggle-off", "confirm", "soft-warn",
] as const;

/** 재생 가능한 전역 UI 효과음 종류(기존 10종 + 상황맞춤 확장 4종). */
export type SfxName = (typeof SFX_NAMES)[number];

const SFX_NAME_SET: ReadonlySet<string> = new Set(SFX_NAMES);

/** 문자열이 유효한 SfxName인지 판별한다. */
export const isSfxName = (value: unknown): value is SfxName =>
  typeof value === "string" && SFX_NAME_SET.has(value);

/** 라운드-로빈 미세 변주 스냅샷(피치 ±2.5%, 팬 ±0.06). */
export interface UiSfxVariation {
  readonly index: number;
  readonly pitchScale: number;
  readonly panOffset: number;
  readonly brightnessScale: number;
  readonly noiseOffsetSec: number;
}

const SFX_PITCH_OFFSETS = [-0.024, 0.017, -0.011, 0.024, -0.019, 0.008, -0.006, 0.021] as const;
const SFX_PAN_OFFSETS = [-0.056, 0.048, -0.032, 0.058, -0.044, 0.026, -0.018, 0.052] as const;
const SFX_BRIGHT_OFFSETS = [-0.03, 0.032, -0.018, 0.028, -0.024, 0.014, -0.01, 0.025] as const;
const SFX_NOISE_OFFSETS = [0.02, 0.14, 0.07, 0.21, 0.11, 0.26, 0.04, 0.18] as const;
const sfxRoundRobin = new Map<SfxName, number>();

/** 동일 효과음을 연속 호출할 때 자연스러운 미세 피치·패닝 변주를 순환 생성한다. */
export const nextUiSfxVariation = (name: SfxName): UiSfxVariation => {
  const cursor = sfxRoundRobin.get(name) ?? 0;
  const index = cursor % SFX_PITCH_OFFSETS.length;
  sfxRoundRobin.set(name, cursor + 1);
  return {
    index,
    pitchScale: 1 + (SFX_PITCH_OFFSETS[index] ?? 0),
    panOffset: SFX_PAN_OFFSETS[index] ?? 0,
    brightnessScale: 1 + (SFX_BRIGHT_OFFSETS[index] ?? 0),
    noiseOffsetSec: SFX_NOISE_OFFSETS[index] ?? 0,
  };
};

/** 테스트 격리용 라운드-로빈 커서 초기화. */
export const resetUiSfxVariationState = (): void => { sfxRoundRobin.clear(); };

type UiNoiseKind = "velvet" | "paper" | "wood";
interface ShapedUiNoiseBank { readonly sampleRate: number; readonly velvet: AudioBuffer; readonly paper: AudioBuffer; readonly wood: AudioBuffer; }
const uiNoiseCache = new WeakMap<AudioContext, ShapedUiNoiseBank>();
const nextSfxSeed = (state: number): number => {
  let x = state >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x >>> 0;
};

const createShapedUiNoise = (ctx: AudioContext, kind: UiNoiseKind, seedInit: number): AudioBuffer => {
  const sampleRate = Math.max(8, ctx.sampleRate || 44100);
  const frames = Math.max(16, Math.floor(sampleRate * 0.45));
  const buffer = ctx.createBuffer(1, frames, sampleRate);
  const data = buffer.getChannelData(0);
  let seed = seedInit >>> 0;
  let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
  let brown = 0; let prev = 0; let peak = 0;
  for (let i = 0; i < data.length; i += 1) {
    seed = nextSfxSeed(seed);
    const w = seed / 2147483648 - 1;
    // Paul Kellet 핑크 근사(-3 dB/oct): 거친 화이트 치찰음을 걷어낸다.
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    let out: number;
    if (kind === "velvet") {
      seed = nextSfxSeed(seed);
      out = prev * 0.32 + (pink * 0.82 + ((seed & 7) === 0 ? w * 0.35 : 0) * 0.18) * 0.68;
      prev = out;
    } else if (kind === "paper") {
      out = pink * 0.58 + (pink - prev * 0.55) * 0.42;
      prev = pink;
    } else {
      brown = (brown + 0.045 * w) / 1.045;
      out = brown * 0.65 + pink * 0.35;
    }
    data[i] = out;
    const abs = Math.abs(out);
    if (abs > peak) peak = abs;
  }
  if (peak > 1e-6) {
    const scale = 0.88 / peak;
    for (let i = 0; i < data.length; i += 1) data[i] = (data[i] ?? 0) * scale;
  }
  return buffer;
};

const getShapedUiNoise = (ctx: AudioContext, kind: UiNoiseKind): AudioBuffer => {
  const sampleRate = Math.max(8, ctx.sampleRate || 44100);
  const cached = uiNoiseCache.get(ctx);
  if (cached && cached.sampleRate === sampleRate) return cached[kind];
  const bank: ShapedUiNoiseBank = {
    sampleRate,
    velvet: createShapedUiNoise(ctx, "velvet", 0x9e3779b9),
    paper: createShapedUiNoise(ctx, "paper", 0x85ebca6b),
    wood: createShapedUiNoise(ctx, "wood", 0xc2b2ae35),
  };
  uiNoiseCache.set(ctx, bank);
  return bank[kind];
};

const clampSfxHz = (ctx: AudioContext, hz: number): number =>
  Math.max(40, Math.min(Math.max(200, (ctx.sampleRate || 44100) * 0.45), hz));

const setSfxParam = (param: AudioParam | undefined, value: number, time: number): void => {
  if (!param) return;
  if (typeof param.setValueAtTime === "function") param.setValueAtTime(value, time);
  else param.value = value;
};

const rampSfxParam = (param: AudioParam | undefined, value: number, time: number): void => {
  if (!param) return;
  const safe = Math.max(0.0001, value);
  if (typeof param.exponentialRampToValueAtTime === "function") param.exponentialRampToValueAtTime(safe, time);
  else param.value = safe;
};

const connectSfxPan = (ctx: AudioContext, node: AudioNode, out: AudioNode, pan: number, t: number): void => {
  const clamped = Math.max(-0.85, Math.min(0.85, pan));
  if (typeof ctx.createStereoPanner === "function" && Math.abs(clamped) > 0.001) {
    const panner = ctx.createStereoPanner();
    setSfxParam(panner.pan, clamped, t);
    node.connect(panner);
    panner.connect(out);
    return;
  }
  node.connect(out);
};

interface UiNoiseLayer {
  readonly kind: UiNoiseKind; readonly delayMs?: number; readonly durationMs: number;
  readonly peak: number; readonly fromHz: number; readonly midHz?: number; readonly toHz?: number;
  readonly filterType?: BiquadFilterType; readonly q?: number; readonly attackRatio?: number;
  readonly pan?: number; readonly offsetShift?: number;
}
interface UiToneLayer {
  readonly type?: OscillatorType; readonly hz: number; readonly settleToHz?: number;
  readonly settleMs?: number; readonly delayMs?: number; readonly durationMs: number;
  readonly peak: number; readonly attackMs?: number; readonly lowpassHz: number;
  readonly pan?: number; readonly detune?: number;
}
interface UiSfxSpec {
  readonly noises?: readonly UiNoiseLayer[];
  readonly tones?: readonly UiToneLayer[];
}

const UI_SFX_SPECS: Record<SfxName, UiSfxSpec> = {
  // tick — 월넛 나무·종이 촉각 미세 탭(고역 귀찌름 제거, 라운드-로빈 미세 변주).
  tick: {
    noises: [{ kind: "wood", durationMs: 18, peak: 0.036, fromHz: 1480, toHz: 860, q: 1.05, pan: -0.04 }],
    tones: [
      { hz: 470, settleToHz: 345, settleMs: 14, durationMs: 44, peak: 0.072, attackMs: 2.5, lowpassHz: 1950 },
      { hz: 940, settleToHz: 850, delayMs: 2, durationMs: 28, peak: 0.016, attackMs: 3, lowpassHz: 2500, pan: 0.04 },
    ],
  },
  // tab — 고급 카드/종이 탭 플릭 + 은은한 공명.
  tab: {
    noises: [{ kind: "paper", durationMs: 28, peak: 0.04, fromHz: 1620, toHz: 2380, q: 1.15, attackRatio: 0.16, pan: -0.07 }],
    tones: [
      { hz: 535, settleToHz: 585, settleMs: 22, delayMs: 3, durationMs: 60, peak: 0.056, attackMs: 3, lowpassHz: 2400 },
      { hz: 1170, delayMs: 8, durationMs: 64, peak: 0.017, attackMs: 4, lowpassHz: 3100, detune: -3, pan: 0.09 },
    ],
  },
  // woosh — raw triangle 완전 제거, 벨벳·종이 노이즈 밴드패스 부드러운 공기 스윕.
  woosh: {
    noises: [
      { kind: "velvet", durationMs: 175, peak: 0.095, fromHz: 280, midHz: 1120, toHz: 480, q: 1.05, attackRatio: 0.36, pan: -0.12 },
      { kind: "paper", delayMs: 18, durationMs: 135, peak: 0.036, fromHz: 880, midHz: 1980, toHz: 940, q: 0.85, attackRatio: 0.34, pan: 0.12, offsetShift: 0.09 },
    ],
  },
  // open — 나무 서랍·케이스가 열리며 울리는 따뜻한 2중 공명 + 부드러운 촉감 트랜지언트.
  open: {
    noises: [{ kind: "velvet", durationMs: 56, peak: 0.038, fromHz: 500, toHz: 1220, q: 0.9, attackRatio: 0.28, pan: -0.09 }],
    tones: [
      { hz: 329.63, settleToHz: 392, settleMs: 55, durationMs: 115, peak: 0.086, attackMs: 6, lowpassHz: 1750, pan: -0.04 },
      { type: "triangle", hz: 587.33, delayMs: 24, durationMs: 135, peak: 0.052, attackMs: 8, lowpassHz: 1650, pan: 0.08 },
      { hz: 880, delayMs: 34, durationMs: 105, peak: 0.018, attackMs: 8, lowpassHz: 2500, pan: 0.12 },
    ],
  },
  // close — 나무 서랍·케이스가 부드럽게 안착하는 2중 댐핑 공명.
  close: {
    noises: [{ kind: "wood", durationMs: 46, peak: 0.044, fromHz: 1120, toHz: 380, filterType: "lowpass", q: 0.72, attackRatio: 0.16, pan: 0.07 }],
    tones: [
      { hz: 440, settleToHz: 329.63, settleMs: 42, durationMs: 74, peak: 0.066, attackMs: 4, lowpassHz: 1600, pan: 0.04 },
      { hz: 246.94, settleToHz: 196, settleMs: 52, delayMs: 24, durationMs: 98, peak: 0.084, attackMs: 5, lowpassHz: 1150, pan: -0.07 },
    ],
  },
  // pop — 맑은 펠트 마림바/칼림바 배음(찌르는 고역 컷).
  pop: {
    noises: [{ kind: "wood", durationMs: 15, peak: 0.028, fromHz: 1120, toHz: 680, q: 0.9, attackRatio: 0.15 }],
    tones: [
      { hz: 512, settleToHz: 493.88, settleMs: 14, durationMs: 110, peak: 0.092, attackMs: 3, lowpassHz: 2150 },
      { hz: 246.94, durationMs: 80, peak: 0.036, attackMs: 4, lowpassHz: 980, pan: -0.05 },
      { hz: 987.77, delayMs: 4, durationMs: 52, peak: 0.026, attackMs: 3, lowpassHz: 2700, pan: 0.08 },
    ],
  },
  // heart — 따뜻한 펠트 칼림바 2음 울림.
  heart: {
    noises: [
      { kind: "wood", durationMs: 14, peak: 0.02, fromHz: 1320, toHz: 840, filterType: "lowpass", pan: -0.06 },
      { kind: "paper", delayMs: 58, durationMs: 14, peak: 0.018, fromHz: 1750, toHz: 1150, q: 0.9, pan: 0.08, offsetShift: 0.06 },
    ],
    tones: [
      { hz: 587.33, durationMs: 115, peak: 0.082, attackMs: 4, lowpassHz: 2350, pan: -0.07 },
      { hz: 1174.66, delayMs: 4, durationMs: 50, peak: 0.02, attackMs: 4, lowpassHz: 2900, pan: -0.03 },
      { hz: 880, delayMs: 58, durationMs: 165, peak: 0.076, attackMs: 4, lowpassHz: 2750, pan: 0.09 },
      { hz: 440, delayMs: 58, durationMs: 135, peak: 0.032, attackMs: 6, lowpassHz: 1550, pan: 0.03 },
    ],
  },
  // success — 따뜻한 어쿠스틱 칼림바/펠트 피아노 화음 + 벨벳 공기감.
  success: {
    noises: [
      { kind: "velvet", durationMs: 165, peak: 0.024, fromHz: 880, toHz: 1840, q: 0.8, attackRatio: 0.35 },
      { kind: "wood", delayMs: 0, durationMs: 11, peak: 0.013, fromHz: 1350, toHz: 820, q: 0.9, pan: -0.15 },
      { kind: "wood", delayMs: 52, durationMs: 11, peak: 0.013, fromHz: 1490, toHz: 860, q: 0.9, pan: -0.04, offsetShift: 0.04 },
      { kind: "wood", delayMs: 104, durationMs: 11, peak: 0.013, fromHz: 1630, toHz: 900, q: 0.9, pan: 0.07, offsetShift: 0.08 },
      { kind: "wood", delayMs: 156, durationMs: 11, peak: 0.013, fromHz: 1770, toHz: 940, q: 0.9, pan: 0.16, offsetShift: 0.12 },
    ],
    tones: [
      { hz: 293.66, durationMs: 240, peak: 0.042, attackMs: 8, lowpassHz: 1150, pan: -0.06 },
      { hz: 587.33, delayMs: 0, durationMs: 270, peak: 0.088, attackMs: 4, lowpassHz: 2600, pan: -0.15 },
      { hz: 739.99, delayMs: 52, durationMs: 250, peak: 0.078, attackMs: 4, lowpassHz: 2840, pan: -0.04 },
      { hz: 880, delayMs: 104, durationMs: 230, peak: 0.068, attackMs: 4, lowpassHz: 3080, pan: 0.07 },
      { hz: 1318.51, delayMs: 156, durationMs: 210, peak: 0.058, attackMs: 4, lowpassHz: 3320, pan: 0.16 },
    ],
  },
  // sparkle — 부드러운 어쿠스틱 칼림바·펠트 셀레스타 상행 화음 + 공기감.
  sparkle: {
    noises: [{ kind: "paper", durationMs: 155, peak: 0.024, fromHz: 1650, toHz: 2950, q: 0.9, attackRatio: 0.35 }],
    tones: [
      { hz: 659.25, delayMs: 0, durationMs: 210, peak: 0.068, attackMs: 4, lowpassHz: 3200, detune: 3, pan: -0.17 },
      { hz: 880, delayMs: 34, durationMs: 210, peak: 0.059, attackMs: 4, lowpassHz: 3340, detune: -3, pan: -0.06 },
      { hz: 1174.66, delayMs: 68, durationMs: 210, peak: 0.05, attackMs: 4, lowpassHz: 3480, detune: 3, pan: 0.06 },
      { hz: 1479.98, delayMs: 102, durationMs: 210, peak: 0.041, attackMs: 4, lowpassHz: 3620, detune: -3, pan: 0.17 },
    ],
  },
  // error — 거슬리지 않는 낮은 댐핑 우드 더블-탭.
  error: {
    noises: [
      { kind: "wood", durationMs: 22, peak: 0.038, fromHz: 680, toHz: 410, q: 0.85, pan: -0.05 },
      { kind: "wood", delayMs: 82, durationMs: 24, peak: 0.032, fromHz: 540, toHz: 330, q: 0.85, pan: 0.05, offsetShift: 0.08 },
    ],
    tones: [
      { hz: 238, settleToHz: 196, settleMs: 36, durationMs: 74, peak: 0.088, attackMs: 4, lowpassHz: 940, pan: -0.05 },
      { hz: 196, settleToHz: 158, settleMs: 42, delayMs: 82, durationMs: 90, peak: 0.076, attackMs: 4, lowpassHz: 820, pan: 0.05 },
    ],
  },
  // toggle-on / toggle-off — 나무·황동 정밀 스위치 ON(상승 래치) / OFF(하강 안착).
  "toggle-on": {
    noises: [{ kind: "paper", durationMs: 17, peak: 0.032, fromHz: 1850, toHz: 2420, q: 1.1, pan: 0.04 }],
    tones: [
      { hz: 480, settleToHz: 620, settleMs: 26, durationMs: 56, peak: 0.068, attackMs: 3, lowpassHz: 2250, pan: 0.05 },
      { hz: 1240, delayMs: 8, durationMs: 52, peak: 0.022, attackMs: 3, lowpassHz: 2950, pan: 0.09 },
    ],
  },
  "toggle-off": {
    noises: [{ kind: "wood", durationMs: 18, peak: 0.03, fromHz: 1450, toHz: 880, q: 0.95, pan: -0.04 }],
    tones: [
      { hz: 555, settleToHz: 385, settleMs: 28, durationMs: 58, peak: 0.064, attackMs: 3, lowpassHz: 1850, pan: -0.05 },
      { hz: 290, delayMs: 6, durationMs: 60, peak: 0.028, attackMs: 4, lowpassHz: 1200, pan: -0.08 },
    ],
  },
  // confirm / soft-warn — 저장·완료 확신 2음 안착 / 삭제·주의 저역 우드 경고 탭.
  confirm: {
    noises: [{ kind: "wood", durationMs: 16, peak: 0.026, fromHz: 1380, toHz: 940, q: 0.95, pan: -0.04 }],
    tones: [
      { hz: 440, durationMs: 95, peak: 0.072, attackMs: 3.5, lowpassHz: 2050, pan: -0.05 },
      { hz: 659.25, delayMs: 42, durationMs: 145, peak: 0.078, attackMs: 4, lowpassHz: 2600, pan: 0.07 },
      { hz: 329.63, delayMs: 42, durationMs: 125, peak: 0.028, attackMs: 6, lowpassHz: 1300, pan: 0.02 },
    ],
  },
  "soft-warn": {
    noises: [{ kind: "wood", durationMs: 26, peak: 0.038, fromHz: 760, toHz: 420, filterType: "lowpass", q: 0.78, pan: -0.04 }],
    tones: [
      { hz: 262, settleToHz: 214, settleMs: 38, durationMs: 84, peak: 0.08, attackMs: 4, lowpassHz: 1050, pan: -0.05 },
      { hz: 174.61, delayMs: 28, durationMs: 76, peak: 0.036, attackMs: 5, lowpassHz: 850, pan: 0.05 },
    ],
  },
};

/** 지정된 UI 효과음 레시피를 라운드-로빈 미세 변주와 함께 합성한다. */
export const renderUiSfxRecipe = (
  name: SfxName,
  ctx: AudioContext,
  output: AudioNode,
  now: number,
): UiSfxVariation => {
  const safeName: SfxName = isSfxName(name) ? name : "tick";
  const v = nextUiSfxVariation(safeName);
  const spec = UI_SFX_SPECS[safeName];
  for (const n of spec.noises ?? []) {
    const startAt = now + (n.delayMs ?? 0) / 1000;
    const duration = Math.max(0.008, n.durationMs / 1000);
    const src = ctx.createBufferSource();
    const flt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = getShapedUiNoise(ctx, n.kind);
    src.loop = true;
    flt.type = n.filterType ?? "bandpass";
    setSfxParam(flt.frequency, clampSfxHz(ctx, n.fromHz * v.brightnessScale), startAt);
    if (n.midHz) rampSfxParam(flt.frequency, clampSfxHz(ctx, n.midHz * v.brightnessScale), startAt + duration * 0.48);
    if (n.toHz) rampSfxParam(flt.frequency, clampSfxHz(ctx, n.toHz * v.brightnessScale), startAt + duration);
    setSfxParam(flt.Q, n.q ?? 0.9, startAt);
    const atk = Math.min(duration * 0.6, Math.max(0.0025, duration * (n.attackRatio ?? 0.14)));
    setSfxParam(gain.gain, 0.0001, startAt);
    rampSfxParam(gain.gain, Math.max(0.0002, n.peak), startAt + atk);
    rampSfxParam(gain.gain, 0.0001, startAt + duration);
    src.connect(flt);
    flt.connect(gain);
    connectSfxPan(ctx, gain, output, (n.pan ?? 0) + v.panOffset, startAt);
    src.start(startAt, (v.noiseOffsetSec + (n.offsetShift ?? 0)) % 0.35);
    src.stop(startAt + duration + 0.015);
  }
  for (const t of spec.tones ?? []) {
    const startAt = now + (t.delayMs ?? 0) / 1000;
    const duration = Math.max(0.012, t.durationMs / 1000);
    const osc = ctx.createOscillator();
    const flt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = t.type ?? "sine";
    setSfxParam(osc.frequency, clampSfxHz(ctx, t.hz * v.pitchScale), startAt);
    if (t.detune) setSfxParam(osc.detune, t.detune, startAt);
    if (t.settleToHz) {
      const settleSec = t.settleMs ? Math.min(duration, t.settleMs / 1000) : duration;
      rampSfxParam(osc.frequency, clampSfxHz(ctx, t.settleToHz * v.pitchScale), startAt + Math.max(0.005, settleSec));
    }
    flt.type = "lowpass";
    setSfxParam(flt.frequency, clampSfxHz(ctx, t.lowpassHz * v.brightnessScale), startAt);
    setSfxParam(flt.Q, 0.65, startAt);
    const atk = Math.min(duration * 0.45, Math.max(0.0025, (t.attackMs ?? 3.5) / 1000));
    setSfxParam(gain.gain, 0.0001, startAt);
    rampSfxParam(gain.gain, Math.max(0.0002, t.peak), startAt + atk);
    rampSfxParam(gain.gain, 0.0001, startAt + duration);
    osc.connect(flt);
    flt.connect(gain);
    connectSfxPan(ctx, gain, output, (t.pan ?? 0) + v.panOffset, startAt);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.018);
  }
  return v;
};

/**
 * 효과음을 재생해요. SFX 비활성·mute·미지원·비브라우저면 graceful no-op.
 * 첫 제스처에서 suspended 면 언락(반환 무시 — 다음 호출부터 들려요).
 * @param name SfxName(기존 10종 + 상황맞춤 확장 4종)
 * @param volume 호출별 볼륨(0~1, 기본 1) — 마스터 볼륨에 곱해진다.
 */
export const playSfx = (name: SfxName, volume = 1): void => {
  if (!state.sfxEnabled || muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  void resumeAudio();
  try {
    const master = ensureSfxBus(ctx);
    const now = Math.max(audioNow(), ctx.currentTime) + 0.001;
    if (volume >= 1) {
      renderUiSfxRecipe(name, ctx, master, now);
    } else {
      const scaled = ctx.createGain();
      scaled.gain.setValueAtTime(clamp01(volume), ctx.currentTime);
      scaled.connect(master);
      renderUiSfxRecipe(name, ctx, scaled, now);
    }
  } catch {
    // 합성 실패는 조용히 무시 — UI 흐름을 막지 않아요.
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 3. 생성형 BGM — 무드 프리셋 정의 (scale·progression·timbre·tempo 가 모두 다름)
 * ────────────────────────────────────────────────────────────────────────── */

/** 연출용 난수 — crypto 우선(S2245), 미지원 환경만 폴백. */
const secureRandom = (): number => {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    return (array[0] ?? 0) / 4294967296; // 2^32 → [0, 1)
  }
  return 0.5;
};

/** MIDI 노트 → 주파수(Hz). A4(69)=440. */
const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** 한 마디(beat 묶음) 분량 노트를 스케줄링하는 컨텍스트. */
interface ScheduleContext {
  ctx: AudioContext;
  /** 이 프리셋의 전용 출력 게인(엔진이 페이드/정리 담당). */
  out: AudioNode;
  /** 이번 묶음 시작 시각(ctx.currentTime 기준 절대 초). */
  startAt: number;
  /** 한 박 길이(초). */
  beatDuration: number;
  /** 이번에 채울 박 수. */
  beats: number;
  /** 프리셋 내부 진행 카운터(코드 진행/완만한 진화에 사용). */
  bar: number;
}

/** BGM 무드 프리셋. */
export interface BgmPreset {
  /** 안정적 식별자(영속/디버그용). */
  id: string;
  /** 사용자에게 보여줄 한글 무드명. */
  name: string;
  /** 무드를 한눈에 보여줄 이모지(라벨 prefix 용, 선택). */
  emoji?: string;
  /** 한 박 길이(초) — 느릴수록 큼(= 템포). 업비트라 모두 짧아요(빠른 BPM). */
  beatDuration: number;
  /** 한 번의 schedule 호출이 채우는 박 수. */
  beatsPerBar: number;
  /** 한 묶음 분량 노트를 스케줄링(순수 합성 + out 연결). */
  schedule: (sc: ScheduleContext) => void;
}

/** soft attack/decay 보이스 — 여러 프리셋이 공유하는 빌딩 블록. */
const scheduleVoice = (
  ctx: AudioContext,
  out: AudioNode,
  options: {
    type: OscillatorType;
    frequency: number;
    startAt: number;
    duration: number;
    peak: number;
    attackRatio?: number;
    /** 로우패스 컷오프(Hz). 지정 시 필터로 음색을 둥글게. */
    cutoff?: number;
    /** 미세 디튠(cents) — 살짝 풍성하게. */
    detune?: number;
    /** 좌우 공간 배치(-1~1). 패드와 아르페지오가 중앙에서 뭉치는 것을 줄인다. */
    pan?: number;
  },
): void => {
  const { type, frequency, startAt, duration, peak, attackRatio = 0.35, cutoff, detune = 0, pan = 0 } = options;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  if (detune) osc.detune.setValueAtTime(detune, startAt);

  let tail: AudioNode = gain;
  osc.connect(gain);
  if (cutoff && cutoff > 0) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, startAt);
    gain.connect(filter);
    tail = filter;
  }
  if (typeof ctx.createStereoPanner === "function" && pan !== 0) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startAt);
    tail.connect(panner);
    tail = panner;
  }

  const attack = Math.max(0.01, duration * attackRatio);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  tail.connect(out);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
};

/* ── 리듬 빌딩 블록 — 가벼운 킥/하이햇(전부 합성, 음원 0개) ──────────────────── */

/** 짧은 화이트노이즈 버퍼(하이햇/스네어용) — 컨텍스트당 1회 생성 후 재사용. */
let noiseBuffer: AudioBuffer | null = null;
const getNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = secureRandom() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
};

/** 부드러운 킥 드럼 — 피치 다운 사인 + 빠른 엔벨로프(둥근 '둠'). */
const scheduleKick = (
  ctx: AudioContext,
  out: AudioNode,
  startAt: number,
  peak: number,
): void => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(125, startAt);
  osc.frequency.exponentialRampToValueAtTime(46, startAt + 0.12);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
  osc.connect(gain);
  gain.connect(out);
  osc.start(startAt);
  osc.stop(startAt + 0.2);
};

/** 하이햇 — 하이패스 노이즈 버스트(짧으면 closed, 길면 open). */
const scheduleHat = (
  ctx: AudioContext,
  out: AudioNode,
  startAt: number,
  peak: number,
  duration = 0.045,
): void => {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(7000, startAt);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(startAt);
  src.stop(startAt + duration + 0.02);
};

/** 스네어/클랩 — 밴드패스 노이즈(2·4박 백비트용). */
const scheduleSnare = (
  ctx: AudioContext,
  out: AudioNode,
  startAt: number,
  peak: number,
): void => {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1900, startAt);
  filter.Q.setValueAtTime(0.7, startAt);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(startAt);
  src.stop(startAt + 0.16);
};

// 스케일(루트 기준 반음 오프셋) — 업비트라 전부 밝은 장조 계열.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PENTATONIC_MAJOR = [0, 2, 4, 7, 9];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10]; // 펑키/그루브용(♭7).
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]; // 살짝 둥둥 뜨는 밝음(#4).

/** 화음 톤(루트 반음 오프셋 묶음). */
const MAJOR_TRIAD = [0, 4, 7];
const MAJOR_SEVENTH = [0, 4, 7, 11];
const ADD9 = [0, 4, 7, 14];
const MINOR_ADD9 = [0, 3, 7, 14];

/**
 * 메이저 트라이어드 패드 화음을 한 묶음 길이로 깔아요(공통 헬퍼).
 * 모든 업비트 프리셋의 "코드 베드"로 재사용 — 음색만 type 으로 바꿉니다.
 */
const scheduleChordBed = (
  sc: ScheduleContext,
  options: {
    rootMidi: number;
    chord: readonly number[];
    type: OscillatorType;
    peak: number;
    cutoff: number;
    attackRatio?: number;
  },
): void => {
  const { ctx, out, startAt, beatDuration, beats } = sc;
  const { rootMidi, chord, type, peak, cutoff, attackRatio = 0.25 } = options;
  chord.forEach((semis, i) => {
    scheduleVoice(ctx, out, {
      type,
      frequency: midiToFreq(rootMidi + semis),
      startAt,
      duration: beatDuration * beats * 0.98,
      peak,
      attackRatio,
      cutoff,
      detune: i === 1 ? 5 : i === 2 ? -5 : 0, // 살짝 코러스감.
      pan: chord.length <= 1 ? 0 : (i / (chord.length - 1) - 0.5) * 0.72,
    });
  });
};

/**
 * **애니메이션 OST·웹툰 장르·사이트 작업용** 생성형 무드 카탈로그.
 * 기존 id는 저장 설정 호환을 위해 유지하고, 저자극 읽기·창작·미스터리·로판 테마를 확장한다.
 */
export const BGM_PRESETS: readonly BgmPreset[] = [
  {
    // 🌅 청춘 오프닝 — C 메이저 I–V–vi–IV + 질주하는 펜타토닉 리드.
    id: "pop",
    name: "청춘 오프닝",
    emoji: "🌅",
    beatDuration: 0.3, // ≈100 BPM(8분음표 그리드).
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 60; // C4
      // I–V–vi–IV — 마디마다 루트 이동(C·G·Am·F 느낌).
      const progression = [0, 7, 9, 5];
      const rootShift = progression[bar % progression.length] ?? 0;
      // 메이저7 패드(따뜻+밝음).
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: MAJOR_SEVENTH,
        type: "triangle",
        peak: 0.05,
        cutoff: 2200,
      });
      // 둥근 베이스(루트 한 옥타브 아래, 4분음표).
      for (let b = 0; b < beats; b += 4) {
        scheduleVoice(ctx, out, {
          type: "sine",
          frequency: midiToFreq(root - 12 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 3.4,
          peak: 0.11,
          attackRatio: 0.1,
          cutoff: 600,
        });
      }
      // 통통 튀는 리드 아르페지오(메이저 펜타토닉, 8분음표).
      for (let b = 0; b < beats; b++) {
        const degree = PENTATONIC_MAJOR[(bar * 2 + b) % PENTATONIC_MAJOR.length] ?? 0;
        const octave = b % 4 === 0 ? 12 : 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + degree + octave),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.85,
          peak: 0.024,
          attackRatio: 0.06,
          cutoff: 2600,
        });
      }
      // 비트: 4-on-the-floor 킥 + 8분 하이햇 + 2·4박 클랩.
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.16);
      for (let b = 0; b < beats; b += 2) {
        scheduleHat(ctx, out, startAt + b * beatDuration, b % 4 === 0 ? 0.05 : 0.035);
      }
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.06);
    },
  },
  {
    // ✨ 별빛 마법소녀 — D 메이저, 종소리 같은 빠른 아르페지오와 가벼운 펄스.
    id: "chiptune",
    name: "별빛 마법소녀",
    emoji: "✨",
    beatDuration: 0.2,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 62; // D4
      // I–vi–IV–V(밝고 신나는 진행).
      const progression = [0, 9, 5, 7];
      const rootShift = progression[bar % progression.length] ?? 0;
      // 펄스 베이스(8분음표 펌프).
      for (let b = 0; b < beats; b += 2) {
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 24 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.6,
          peak: 0.045,
          attackRatio: 0.04,
          cutoff: 900,
        });
      }
      // 메인 칩튠 아르페지오 — 트라이어드를 빠르게 훑어요.
      const arp = MAJOR_TRIAD;
      for (let b = 0; b < beats; b++) {
        const semis = arp[b % arp.length] ?? 0;
        const octave = b % 6 >= 3 ? 12 : 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + semis + octave),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.95,
          peak: 0.025,
          attackRatio: 0.02,
          cutoff: 3000,
        });
      }
      // 윗 멜로디 카운터라인(메이저, 듬성듬성).
      for (let b = 0; b < beats; b += 4) {
        const degree = MAJOR[(bar + b) % MAJOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + 12 + degree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 3,
          peak: 0.035,
          attackRatio: 0.05,
          cutoff: 3400,
        });
      }
      // 가벼운 비트(빠른 템포라 4박 킥 + 오프비트 하이햇).
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.13);
      for (let b = 2; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.03);
    },
  },
  {
    // 🌸 로맨스 산책 — E 믹솔리디안, 살짝 엇박인 발걸음과 부드러운 코드 스탭.
    id: "funky",
    name: "로맨스 산책",
    emoji: "🌸",
    beatDuration: 0.25,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 64; // E4
      const progression = [0, 0, 5, 7]; // I–I–IV–V 그루브 루프.
      const rootShift = progression[bar % progression.length] ?? 0;
      // 당김음(syncopated) 펑크 베이스 — 16분 자리 일부만 때려 그루브를 만들어요.
      const bassHits = [0, 3, 6, 7, 10, 11, 14];
      bassHits.forEach((b) => {
        const degree = MIXOLYDIAN[(bar + b) % MIXOLYDIAN.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 24 + rootShift + (b % 7 === 0 ? 0 : degree % 12)),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.4,
          peak: 0.06,
          attackRatio: 0.04,
          cutoff: 1100,
        });
      });
      // 와카(wah) 코드 스탭 — 오프비트에 짧게 끊어 치는 메이저 화음.
      const stabAt = [2, 6, 10, 14];
      stabAt.forEach((b) => {
        MAJOR_TRIAD.forEach((semis, i) => {
          scheduleVoice(ctx, out, {
            type: "triangle",
            frequency: midiToFreq(root + rootShift + semis),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 1.1,
            peak: 0.022,
            attackRatio: 0.05,
            cutoff: 2400,
            detune: i === 1 ? 6 : 0,
          });
        });
      });
      // 디스코 비트: 4-on-the-floor 킥 + 백비트 스네어 + 오픈 하이햇 오프비트.
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.15);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.07);
      for (let b = 2; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.05, 0.08);
    },
  },
  {
    // ⚔️ 판타지 모험 — A 리디안, 넓은 add9 패드 + 옥타브 베이스 + 영웅적인 리드.
    id: "synthwave",
    name: "판타지 모험",
    emoji: "⚔️",
    beatDuration: 0.34, // ≈88 BPM, 8분 펄스.
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 69; // A4
      const progression = [0, 5, 7, 4]; // I–IV–V–iii(살짝 드라마틱한 밝음).
      const rootShift = progression[bar % progression.length] ?? 0;
      // 넓은 saw add9 패드.
      scheduleChordBed(sc, {
        rootMidi: root - 12 + rootShift,
        chord: ADD9,
        type: "triangle",
        peak: 0.035,
        cutoff: 1500,
        attackRatio: 0.3,
      });
      // 신스웨이브 옥타브 베이스 펄스(8분음표, 루트↔옥타브).
      for (let b = 0; b < beats; b += 2) {
        const oct = (b / 2) % 2 === 0 ? 0 : 12;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 24 + rootShift + oct),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.7,
          peak: 0.05,
          attackRatio: 0.05,
          cutoff: 800,
        });
      }
      // 반짝이는 리드 아르페지오(리디안 #4 가 레트로 느낌).
      for (let b = 0; b < beats; b++) {
        if (b % 2 === 0 || secureRandom() > 0.6) {
          const degree = LYDIAN[(bar * 2 + b) % LYDIAN.length] ?? 0;
          scheduleVoice(ctx, out, {
            type: "triangle",
            frequency: midiToFreq(root + rootShift + degree + (b % 8 >= 4 ? 12 : 0)),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 1.3,
            peak: 0.03,
            attackRatio: 0.04,
            cutoff: 3600,
          });
        }
      }
      // 가벼운 비트: 4박 킥 + 백비트 스네어 + 8분 하이햇.
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.14);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.05);
      for (let b = 1; b < beats; b += 2) scheduleHat(ctx, out, startAt + b * beatDuration, 0.03);
    },
  },
  {
    // 🌈 엔딩 크레딧 — F 메이저, 여운 있는 add9와 웃으며 돌아보는 상승 멜로디.
    id: "happy",
    name: "엔딩 크레딧",
    emoji: "🌈",
    beatDuration: 0.27, // ≈110 BPM, 8분 그리드.
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 65; // F4
      // I–IV–V–I(가장 밝고 결정적인 진행).
      const progression = [0, 5, 7, 0];
      const rootShift = progression[bar % progression.length] ?? 0;
      // add9 패드로 활기.
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: ADD9,
        type: "triangle",
        peak: 0.045,
        cutoff: 2600,
      });
      // 점프하는 베이스(루트→5도 바운스).
      for (let b = 0; b < beats; b += 2) {
        const fifth = (b / 2) % 2 === 1 ? 7 : 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 12 + rootShift + fifth),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.5,
          peak: 0.08,
          attackRatio: 0.08,
          cutoff: 900,
        });
      }
      // 밝은 멜로디 아르페지오(트라이어드 + 옥타브 점프, 신나게).
      const jump = [...MAJOR_TRIAD, 12, 7, 4];
      for (let b = 0; b < beats; b++) {
        const semis = jump[(bar + b) % jump.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + semis),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.9,
          peak: 0.03,
          attackRatio: 0.05,
          cutoff: 2900,
        });
      }
      // 축제 비트: 4박 킥 + 2·4박 박수(스네어×2 살짝 겹쳐 박수감) + 8분 하이햇.
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.15);
      for (let b = 4; b < beats; b += 8) {
        scheduleSnare(ctx, out, startAt + b * beatDuration, 0.06);
        scheduleSnare(ctx, out, startAt + b * beatDuration + 0.02, 0.04); // 박수 더블.
      }
      for (let b = 2; b < beats; b += 2) scheduleHat(ctx, out, startAt + b * beatDuration, 0.035);
    },
  },
  {
    // ⚡ 열혈 배틀 — E 마이너 / 왕도 펜타토닉, 강렬한 리프와 하이텐션 비트.
    id: "battle",
    name: "열혈 배틀",
    emoji: "⚡",
    beatDuration: 0.22, // 쾌속 BPM
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 64; // E4
      const progression = [0, 3, 5, 7]; // i-III-iv-V 강렬한 배틀 루프
      const rootShift = progression[bar % progression.length] ?? 0;
      // 옥타브 파워 듀얼 베이스
      for (let b = 0; b < beats; b += 2) {
        scheduleVoice(ctx, out, {
          type: "sawtooth",
          frequency: midiToFreq(root - 24 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.5,
          peak: 0.06,
          attackRatio: 0.02,
          cutoff: 1400,
        });
      }
      // 배틀 펜타토닉 질주 리드
      const riff = [0, 3, 5, 7, 10, 12, 10, 7];
      for (let b = 0; b < beats; b++) {
        const semis = riff[b % riff.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "square",
          frequency: midiToFreq(root + rootShift + semis),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.8,
          peak: 0.025,
          attackRatio: 0.03,
          cutoff: 2800,
        });
      }
      // 드럼 타격감 (헤비 킥 + 연속 하이햇 + 백비트 스네어)
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.18);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.08);
      for (let b = 1; b < beats; b += 2) scheduleHat(ctx, out, startAt + b * beatDuration, 0.045);
    },
  },
  {
    // 🎐 일상 코미디 — G 메이저, 목금/글록켄슈필 같은 톡톡 튀는 멜로디.
    id: "slice_of_life",
    name: "일상 코미디",
    emoji: "🎐",
    beatDuration: 0.24,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 67; // G4
      const progression = [0, 5, 7, 0];
      const rootShift = progression[bar % progression.length] ?? 0;
      // 통통 튀는 바운스 베이스
      for (let b = 0; b < beats; b += 4) {
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 19 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.5,
          peak: 0.07,
          attackRatio: 0.05,
          cutoff: 900,
        });
      }
      // 맑은 16분음표 목금/벨 아르페지오
      for (let b = 0; b < beats; b++) {
        if (b % 3 !== 0) {
          const degree = PENTATONIC_MAJOR[(b + bar) % PENTATONIC_MAJOR.length] ?? 0;
          scheduleVoice(ctx, out, {
            type: "sine",
            frequency: midiToFreq(root + 12 + rootShift + degree),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 0.7,
            peak: 0.035,
            attackRatio: 0.02,
            cutoff: 4000,
          });
        }
      }
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.12);
      for (let b = 2; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.03);
    },
  },
  {
    // 🌌 감성 시티팝 — A 메이저 7th, 플랑크톤 빛나는 레트로 레전드 OST 분위기.
    id: "citypop",
    name: "감성 시티팝",
    emoji: "🌌",
    beatDuration: 0.28,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 69; // A4
      const progression = [0, 5, 2, 7]; // IV-V-iii-vi 변형
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root - 12 + rootShift,
        chord: MAJOR_SEVENTH,
        type: "triangle",
        peak: 0.04,
        cutoff: 1800,
        attackRatio: 0.3,
      });
      // 슬랩 느낌의 엇박 신스 베이스
      const bassPattern = [0, 3, 6, 10, 12, 14];
      bassPattern.forEach((b) => {
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 24 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.2,
          peak: 0.055,
          attackRatio: 0.04,
          cutoff: 1200,
        });
      });
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.14);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.06);
      for (let b = 2; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.045, 0.09);
    },
  },
  {
    // 🏆 영웅의 각성 — D 클라이맥스, 벅차오르는 하모닉 팡파레와 웅장한 아르페지오.
    id: "climax",
    name: "영웅의 각성",
    emoji: "🏆",
    beatDuration: 0.26,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 62; // D4
      const progression = [0, 7, 9, 5]; // 벅차오르는 왕도 진행
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: ADD9,
        type: "triangle",
        peak: 0.05,
        cutoff: 2400,
        attackRatio: 0.2,
      });
      for (let b = 0; b < beats; b += 2) {
        scheduleVoice(ctx, out, {
          type: "sawtooth",
          frequency: midiToFreq(root - 12 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.6,
          peak: 0.06,
          attackRatio: 0.05,
          cutoff: 1000,
        });
      }
      for (let b = 0; b < beats; b++) {
        const semis = MAJOR[(bar + b) % MAJOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + 12 + rootShift + semis),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.9,
          peak: 0.03,
          attackRatio: 0.04,
          cutoff: 3200,
        });
      }
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.16);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.07);
      for (let b = 1; b < beats; b += 2) scheduleHat(ctx, out, startAt + b * beatDuration, 0.04);
    },
  },
  {
    // 🎨 작가의 작업실 — 낮은 피아노 질감과 넓은 메이저7 패드. 긴 작업 세션용 저자극 포커스.
    id: "atelier_focus",
    name: "작가의 작업실",
    emoji: "🎨",
    beatDuration: 0.42,
    beatsPerBar: 12,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 60; // C4
      const progression = [0, 5, 9, 7];
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root - 12 + rootShift,
        chord: MAJOR_SEVENTH,
        type: "sine",
        peak: 0.026,
        cutoff: 1450,
        attackRatio: 0.42,
      });
      for (let b = 0; b < beats; b += 3) {
        const degree = PENTATONIC_MAJOR[(bar + b / 3) % PENTATONIC_MAJOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + degree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.2,
          peak: 0.027,
          attackRatio: 0.05,
          cutoff: 2100,
          pan: b % 6 === 0 ? -0.22 : 0.22,
        });
      }
      for (let b = 1; b < beats; b += 4) {
        scheduleHat(ctx, out, startAt + b * beatDuration, 0.009, 0.08);
      }
    },
  },
  {
    // 📚 밤의 자료실 — 느린 add9 패드와 드문 벨. 검색·학습·자료 읽기에 맞춘 정적 앰비언스.
    id: "library_night",
    name: "밤의 자료실",
    emoji: "📚",
    beatDuration: 0.5,
    beatsPerBar: 12,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 62; // D4
      const progression = [0, 7, 5, 9];
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root - 12 + rootShift,
        chord: ADD9,
        type: "sine",
        peak: 0.022,
        cutoff: 1250,
        attackRatio: 0.48,
      });
      scheduleVoice(ctx, out, {
        type: "sine",
        frequency: midiToFreq(root - 24 + rootShift),
        startAt,
        duration: beatDuration * beats * 0.92,
        peak: 0.035,
        attackRatio: 0.28,
        cutoff: 520,
      });
      for (let b = 2; b < beats; b += 4) {
        const degree = LYDIAN[(bar + b) % LYDIAN.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "sine",
          frequency: midiToFreq(root + 12 + rootShift + degree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.8,
          peak: 0.018,
          attackRatio: 0.04,
          cutoff: 3800,
          pan: b % 8 === 2 ? -0.38 : 0.38,
        });
      }
    },
  },
  {
    // 👑 로판 무도회 — 3박 왈츠 펄스와 실내악풍 화음. 로맨스 판타지·캐릭터 페이지용.
    id: "royal_waltz",
    name: "로판 무도회",
    emoji: "👑",
    beatDuration: 0.34,
    beatsPerBar: 12,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 67; // G4
      const progression = [0, 5, 9, 7];
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root - 12 + rootShift,
        chord: MAJOR_SEVENTH,
        type: "triangle",
        peak: 0.032,
        cutoff: 2300,
        attackRatio: 0.24,
      });
      for (let b = 0; b < beats; b += 3) {
        scheduleVoice(ctx, out, {
          type: "sine",
          frequency: midiToFreq(root - 24 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.5,
          peak: 0.055,
          attackRatio: 0.06,
          cutoff: 700,
        });
        for (const offset of [1, 2]) {
          MAJOR_TRIAD.forEach((semitone, index) => {
            scheduleVoice(ctx, out, {
              type: "triangle",
              frequency: midiToFreq(root + rootShift + semitone),
              startAt: startAt + (b + offset) * beatDuration,
              duration: beatDuration * 0.78,
              peak: 0.012,
              attackRatio: 0.05,
              cutoff: 2600,
              pan: (index - 1) * 0.24,
            });
          });
        }
      }
      for (let b = 0; b < beats; b += 3) {
        const degree = MAJOR[(bar + b / 3) % MAJOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "sine",
          frequency: midiToFreq(root + 12 + rootShift + degree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.4,
          peak: 0.024,
          attackRatio: 0.08,
          cutoff: 3900,
          pan: b % 6 === 0 ? -0.3 : 0.3,
        });
      }
    },
  },
  {
    // 🔍 비밀의 복선 — D 도리안 기반의 저역 펄스와 유리성 단서음. 미스터리·운세·분석 페이지용.
    id: "mystery_noir",
    name: "비밀의 복선",
    emoji: "🔍",
    beatDuration: 0.4,
    beatsPerBar: 12,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 50; // D3
      const progression = [0, 3, 7, 5];
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: MINOR_ADD9,
        type: "sine",
        peak: 0.026,
        cutoff: 1050,
        attackRatio: 0.5,
      });
      for (let b = 0; b < beats; b += 2) {
        const degree = DORIAN[(bar + b) % DORIAN.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 12 + rootShift + (b % 4 === 0 ? 0 : degree)),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.25,
          peak: 0.032,
          attackRatio: 0.08,
          cutoff: 780,
          pan: b % 4 === 0 ? -0.12 : 0.12,
        });
      }
      for (const b of [3, 8, 11]) {
        const degree = NATURAL_MINOR[(bar + b) % NATURAL_MINOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "sine",
          frequency: midiToFreq(root + 24 + rootShift + degree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.9,
          peak: 0.018,
          attackRatio: 0.03,
          cutoff: 4200,
          pan: b === 8 ? 0.4 : -0.4,
        });
      }
      for (let b = 1; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.008, 0.11);
    },
  },
  {
    // 🌿 힐링 산책 — 따뜻한 펜타토닉 플럭과 숨 쉬는 저역. 소개·지원·휴식 페이지용.
    id: "healing_walk",
    name: "힐링 산책",
    emoji: "🌿",
    beatDuration: 0.38,
    beatsPerBar: 12,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 57; // A3
      const progression = [0, 5, 2, 7];
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: ADD9,
        type: "sine",
        peak: 0.024,
        cutoff: 1650,
        attackRatio: 0.38,
      });
      for (let b = 0; b < beats; b += 3) {
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 12 + rootShift + (b % 6 === 0 ? 0 : 7)),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.4,
          peak: 0.04,
          attackRatio: 0.08,
          cutoff: 850,
        });
      }
      for (let b = 1; b < beats; b += 2) {
        const degree = PENTATONIC_MAJOR[(bar * 2 + b) % PENTATONIC_MAJOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + 12 + rootShift + degree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.18,
          peak: 0.018,
          attackRatio: 0.04,
          cutoff: 2500,
          pan: b % 4 === 1 ? -0.32 : 0.32,
        });
      }
    },
  },
  {
    // 🌠 세계관 항해 — 리디안 장패드와 먼 별빛 아르페지오. 세계관·기술·3D 탐색 페이지용.
    id: "worldbuilding",
    name: "세계관 항해",
    emoji: "🌠",
    beatDuration: 0.52,
    beatsPerBar: 12,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 53; // F3
      const progression = [0, 7, 5, 2];
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: ADD9,
        type: "sine",
        peak: 0.028,
        cutoff: 1350,
        attackRatio: 0.55,
      });
      scheduleVoice(ctx, out, {
        type: "triangle",
        frequency: midiToFreq(root - 12 + rootShift),
        startAt,
        duration: beatDuration * beats * 0.94,
        peak: 0.028,
        attackRatio: 0.35,
        cutoff: 560,
      });
      for (let b = 0; b < beats; b += 2) {
        const degree = LYDIAN[(bar + b / 2) % LYDIAN.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "sine",
          frequency: midiToFreq(root + 24 + rootShift + degree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.3,
          peak: 0.014,
          attackRatio: 0.08,
          cutoff: 4300,
          pan: b % 4 === 0 ? -0.46 : 0.46,
        });
      }
    },
  },
];

/** 한 묶음(1회 schedule)의 길이(초). */
const barDuration = (preset: BgmPreset): number => preset.beatDuration * preset.beatsPerBar;

/* ────────────────────────────────────────────────────────────────────────── *
 * 4. BGM 엔진 — lookahead 스케줄러 + 무드 로테이션(crossfade)
 * ────────────────────────────────────────────────────────────────────────── */

/** 프리셋 1개 재생 길이(초) — 이후 다음 무드로 로테이션. */
const PRESET_DURATION_S = 75;
/** crossfade 길이(초). */
const FADE_S = 2.5;
/** 스케줄러 lookahead(초). */
const SCHEDULE_AHEAD_S = 1.5;
/** 스케줄러 틱 주기(ms). */
const SCHEDULER_INTERVAL_MS = 250;

interface ActivePreset {
  preset: BgmPreset;
  out: GainNode;
  /** 다음으로 스케줄을 채워야 할 절대 시각(초). */
  nextBarAt: number;
  bar: number;
}

let active: ActivePreset | null = null;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let rotationTimer: ReturnType<typeof setTimeout> | null = null;
let presetIndex = 0;
let bgmPlaying = false;

/**
 * (선택) 호스티드 플레이리스트 트랙. `registerBgmPlaylist(['/audio/a.mp3', …])` 로 등록하면
 * 생성형 대신 이 mp3 들을 crossfade 로테이션해요. 비어 있으면 항상 생성형으로 폴백.
 */
interface PlaylistTrack {
  url: string;
  /** 라벨에 쓸 무드명(없으면 파일명에서 추론). */
  label: string;
  /** (선택) 아티스트명 — UI 크레딧 표기용. */
  artist?: string;
  /** (선택) 원본 출처/크레딧 링크 — UI 크레딧 표기용. */
  creditUrl?: string;
}
let playlist: PlaylistTrack[] = [];
let playlistIndex = 0;

const createPresetOut = (ctx: AudioContext): GainNode => {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.connect(ensureBgmBus(ctx));
  return out;
};

/** lookahead 범위 안의 묶음들을 채워요. */
const runScheduler = (): void => {
  const ctx = getAudioContext();
  if (!ctx || !active) return;
  const horizon = ctx.currentTime + SCHEDULE_AHEAD_S;
  let guard = 0;
  while (active.nextBarAt < horizon && guard < 16) {
    const { preset, out, nextBarAt, bar } = active;
    try {
      preset.schedule({
        ctx,
        out,
        startAt: nextBarAt,
        beatDuration: preset.beatDuration,
        beats: preset.beatsPerBar,
        bar,
      });
    } catch {
      // 한 묶음 합성 실패는 무시.
    }
    active.nextBarAt = nextBarAt + barDuration(preset);
    active.bar = bar + 1;
    guard += 1;
  }
};

/** 현재 프리셋을 페이드아웃하고 일정 시간 뒤 정리. */
const fadeOutAndDispose = (entry: ActivePreset): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  try {
    entry.out.gain.cancelScheduledValues(now);
    entry.out.gain.setValueAtTime(Math.max(0.0002, entry.out.gain.value), now);
    entry.out.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S);
  } catch {
    // 무시.
  }
  setTimeout(
    () => {
      try {
        entry.out.disconnect();
      } catch {
        // 무시.
      }
    },
    (FADE_S + 4) * 1000,
  );
};

const normalizeIndex = (index: number): number =>
  ((index % BGM_PRESETS.length) + BGM_PRESETS.length) % BGM_PRESETS.length;

/** 인덱스 프리셋을 시작(페이드인)하고 스케줄러를 돌려요. */
const startPreset = (index: number): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  presetIndex = normalizeIndex(index);
  const preset = BGM_PRESETS[presetIndex];
  if (!preset) return;

  const out = createPresetOut(ctx);
  const startAt = Math.max(audioNow(), ctx.currentTime) + 0.05;
  try {
    out.gain.setValueAtTime(0.0001, startAt);
    out.gain.exponentialRampToValueAtTime(1, startAt + FADE_S);
  } catch {
    // 무시.
  }

  active = { preset, out, nextBarAt: startAt, bar: 0 };
  syncTrackName(preset.name);

  runScheduler();
  if (!schedulerTimer) {
    schedulerTimer = setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
  }
  if (rotationTimer) clearTimeout(rotationTimer);
  rotationTimer = setTimeout(() => {
    if (bgmPlaying) advance(1);
  }, PRESET_DURATION_S * 1000);
};

/** delta(보통 +1)만큼 무드를 전환(crossfade). */
const advance = (delta: number): void => {
  if (!getAudioContext()) return;
  const previous = active;
  startPreset(presetIndex + delta);
  if (previous) fadeOutAndDispose(previous);
};

/** BGM 재생 시작/재개(엔진 메커니즘). 제스처 안에서 호출되면 컨텍스트가 언락돼요. */
const engineStart = (): void => {
  if (!isBgmContextAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  void resumeAudio();
  ensureMasterGain(ctx);
  if (bgmPlaying) return;
  bgmPlaying = true;
  startPreset(presetIndex);
};

/** BGM 정지(페이드아웃 + 타이머 정리). 재개 시 같은 무드부터 다시 시작. */
const engineStop = (): void => {
  bgmPlaying = false;
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (rotationTimer) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
  }
  if (active) {
    fadeOutAndDispose(active);
    active = null;
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 4b. (선택) 호스티드 mp3 플레이리스트 엔진 — 있으면 우선, 없으면 생성형 폴백
 *      HTMLAudioElement → MediaElementSource → masterGain 으로 라우팅해
 *      mute/volume/visibility 가드를 생성형과 똑같이 공유해요.
 * ────────────────────────────────────────────────────────────────────────── */

interface PlaylistVoice {
  el: HTMLAudioElement;
  node: GainNode;
  /** 한 트랙당 1번만 만드는 MediaElementSource(재사용 불가라 el 과 1:1). */
  src: MediaElementAudioSourceNode | null;
}
let playlistVoice: PlaylistVoice | null = null;
let playlistPlaying = false;

/** mp3 URL → 사람이 읽을 라벨(파일명 베이스). */
const labelFromUrl = (url: string): string => {
  try {
    const base = url.split("/").pop() ?? url;
    return decodeURIComponent(base.replace(/\.[a-z0-9]+$/i, "")).replace(/[-_]+/g, " ").trim() || "트랙";
  } catch {
    return "트랙";
  }
};

/** 한 트랙을 새 <audio> 로 만들어 master 로 라우팅하고 fade-in 재생. */
const startPlaylistTrack = (index: number): void => {
  const ctx = getAudioContext();
  if (!ctx || playlist.length === 0) return;
  playlistIndex = ((index % playlist.length) + playlist.length) % playlist.length;
  const track = playlist[playlistIndex];
  if (!track) return;

  let el: HTMLAudioElement;
  try {
    el = new Audio(track.url);
  } catch {
    return;
  }
  el.crossOrigin = "anonymous";
  el.preload = "auto";
  el.loop = false;

  const node = ctx.createGain();
  node.gain.setValueAtTime(0.0001, ctx.currentTime);
  node.connect(ensureBgmBus(ctx));

  // CORS/미지원이면 라우팅 실패 → 엘리먼트 직접 재생(볼륨 가드만 못 받음).
  const src = ((): MediaElementAudioSourceNode | null => {
    try {
      const created = ctx.createMediaElementSource(el);
      created.connect(node);
      return created;
    } catch {
      return null;
    }
  })();

  const voice: PlaylistVoice = { el, node, src };
  playlistVoice = voice;
  syncTrackName(track.label);

  // 파일 누락·디코딩 실패 시 보컬 플레이리스트 상태에 멈춰 있지 않고 생성형 OST로 복구한다.
  const fallbackToProcedural = () => {
    if (!playlistPlaying || playlistVoice !== voice) return;
    playlistPlaying = false;
    playlistVoice = null;
    disposePlaylistVoice(voice);
    engineStart();
  };

  try {
    node.gain.setValueAtTime(0.0001, ctx.currentTime);
    node.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE_S);
  } catch {
    // 무시.
  }
  // 트랙 끝나면 다음 트랙으로(crossfade).
  el.addEventListener(
    "ended",
    () => {
      if (playlistPlaying && playlistVoice === voice) advancePlaylist(1);
    },
    { once: true },
  );
  el.addEventListener("error", fallbackToProcedural, { once: true });
  void el.play().catch((error: unknown) => {
    // 정책상 자동재생 차단은 다음 제스처를 기다리고, 실제 미디어 실패만 생성형 OST로 폴백한다.
    if (
      error instanceof DOMException &&
      (error.name === "NotAllowedError" || error.name === "AbortError")
    ) {
      return;
    }
    fallbackToProcedural();
  });
};

/** 현재 트랙을 페이드아웃 후 정리. */
const disposePlaylistVoice = (voice: PlaylistVoice): void => {
  const ctx = getAudioContext();
  try {
    if (ctx) {
      const now = ctx.currentTime;
      voice.node.gain.cancelScheduledValues(now);
      voice.node.gain.setValueAtTime(Math.max(0.0002, voice.node.gain.value), now);
      voice.node.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S);
    }
  } catch {
    // 무시.
  }
  setTimeout(
    () => {
      try {
        releasePlaylistMedia(voice.el);
        voice.src?.disconnect();
        voice.node.disconnect();
      } catch {
        // 무시.
      }
    },
    (FADE_S + 1) * 1000,
  );
};

/** delta 만큼 플레이리스트 트랙 전환(crossfade). */
const advancePlaylist = (delta: number): void => {
  if (!getAudioContext() || playlist.length === 0) return;
  const previous = playlistVoice;
  startPlaylistTrack(playlistIndex + delta);
  if (previous) disposePlaylistVoice(previous);
};

const playlistStart = (): void => {
  if (!isBgmContextAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx || playlist.length === 0) return;
  void resumeAudio();
  ensureMasterGain(ctx);
  if (playlistPlaying) return;
  playlistPlaying = true;
  startPlaylistTrack(playlistIndex);
};

const playlistStop = (): void => {
  playlistPlaying = false;
  if (playlistVoice) {
    disposePlaylistVoice(playlistVoice);
    playlistVoice = null;
  }
};

/* ── 디스패처 — 플레이리스트가 있으면 그쪽, 없으면 생성형 ───────────────────── */

const usingPlaylist = (): boolean => playlist.length > 0;
const bgmSuspensionReasons = new Set<string>();
const isBgmContextAllowed = (): boolean => bgmSuspensionReasons.size === 0;

/** BGM 시작(제스처 안에서). 호스티드 플레이리스트 우선, 없으면 생성형. */
const bgmStart = (): void => {
  if (!isBgmContextAllowed()) return;
  if (usingPlaylist()) playlistStart();
  else engineStart();
};

/** BGM 정지(페이드아웃 + 정리). 두 엔진 모두 안전하게 멈춰요. */
const bgmStop = (): void => {
  if (playlistPlaying) playlistStop();
  if (bgmPlaying) engineStop();
};

/** 어느 엔진이든 재생 중인지. */
const anyBgmPlaying = (): boolean => bgmPlaying || playlistPlaying;

/* ────────────────────────────────────────────────────────────────────────── *
 * 5. 상태 · 영속(opt-in) · 구독 — 엔진의 "두뇌"
 * ────────────────────────────────────────────────────────────────────────── */

const SFX_KEY = "ts_fx_sfx_enabled";
const BGM_KEY = "ts_fx_bgm_enabled";
const BGM_VOL_KEY = "ts_fx_bgm_volume";
const MUTE_KEY = "ts_fx_muted";
const VOL_KEY = "ts_fx_volume";

/** 공개 오디오 상태 스냅샷. */
export interface AudioState {
  /** 효과음 opt-in(기본 ON; reduce-motion 이면 OFF). */
  sfxEnabled: boolean;
  /** BGM opt-in(기본 OFF — autoplay 차단 회피). */
  bgmEnabled: boolean;
  /** 마스터 음소거. */
  muted: boolean;
  /** 마스터 볼륨(0~1). */
  volume: number;
  /** BGM 전용 볼륨(0~1). */
  bgmVolume: number;
  /** 현재(또는 다음 시작할) 무드명. */
  currentMood: string;
  /** 현재(또는 다음 시작할) 무드 id. */
  currentMoodId: string;
  /** 현재 트랙 아티스트(플레이리스트 모드에서만, 없으면 ""). */
  currentTrackArtist: string;
  /** 현재 트랙 크레딧 링크(플레이리스트 모드에서만, 없으면 ""). */
  currentTrackCreditUrl: string;
}

export type AudioStateListener = (state: AudioState) => void;

const hasWindow = (): boolean => typeof window !== "undefined";

const readStoredBool = (key: string): boolean | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return raw === "1" || raw === "true";
  } catch {
    return null;
  }
};

const writeStoredBool = (key: string, value: boolean): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // 무시(프라이빗 모드 등).
  }
};

const readStoredNumber = (key: string): number | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

const writeStoredNumber = (key: string, value: number): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 무시.
  }
};

const prefersReducedMotion = (): boolean => {
  if (!hasWindow() || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// 영속값을 모듈 로드 시 1회 읽어 초기 상태/마스터에 반영.
const initialMuted = readStoredBool(MUTE_KEY) ?? false;
const initialVolume = clamp01(readStoredNumber(VOL_KEY) ?? DEFAULT_VOLUME);
const initialBgmVolume = clamp01(readStoredNumber(BGM_VOL_KEY) ?? DEFAULT_BGM_VOLUME);
muted = initialMuted;
userVolume = initialVolume;
bgmUserVolume = initialBgmVolume;

const state: AudioState = {
  sfxEnabled: readStoredBool(SFX_KEY) ?? !prefersReducedMotion(),
  bgmEnabled: readStoredBool(BGM_KEY) ?? false,
  muted: initialMuted,
  volume: initialVolume,
  bgmVolume: initialBgmVolume,
  currentMood: BGM_PRESETS[presetIndex]?.name ?? "",
  currentMoodId: BGM_PRESETS[presetIndex]?.id ?? "",
  currentTrackArtist: "",
  currentTrackCreditUrl: "",
};

const listeners = new Set<AudioStateListener>();
let pausedByVisibility = false;
let wired = false;

// useSyncExternalStore 호환을 위해 스냅샷을 캐시한다 — getSnapshot 이 매번 새 객체를 주면
// React 가 "변경됨"으로 보고 무한 렌더 루프에 빠진다. 상태가 실제로 바뀔 때(emit)만
// 새 불변 스냅샷을 만들고, 그 사이엔 동일 참조를 돌려준다.
let cachedSnapshot: AudioState = { ...state };

const snapshot = (): AudioState => cachedSnapshot;

const emit = (): void => {
  const snap: AudioState = { ...state };
  cachedSnapshot = snap;
  listeners.forEach((listener) => {
    try {
      listener(snap);
    } catch {
      // 한 구독자 오류가 다른 구독자/엔진을 막지 않도록.
    }
  });
};

/** 엔진의 무드명 변경을 상태에 반영. 플레이리스트 모드면 트랙 인덱스를 id 로, 크레딧 메타도 동기화. */
const syncTrackName = (name: string): void => {
  const usingList = playlist.length > 0;
  const id = usingList ? `playlist:${playlistIndex}` : (BGM_PRESETS[presetIndex]?.id ?? "");
  const artist = usingList ? (playlist[playlistIndex]?.artist ?? "") : "";
  const creditUrl = usingList ? (playlist[playlistIndex]?.creditUrl ?? "") : "";
  if (
    state.currentMood !== name ||
    state.currentMoodId !== id ||
    state.currentTrackArtist !== artist ||
    state.currentTrackCreditUrl !== creditUrl
  ) {
    state.currentMood = name;
    state.currentMoodId = id;
    state.currentTrackArtist = artist;
    state.currentTrackCreditUrl = creditUrl;
    emit();
  }
};

/** 가시성 일시정지 등 1회성 전역 배선. */
const ensureWired = (): void => {
  if (wired || !hasWindow()) return;
  wired = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // 탭/앱이 숨겨지면 두 엔진(생성형·플레이리스트) 모두 자동 일시정지(배터리/예의).
        if (state.bgmEnabled && anyBgmPlaying()) {
          pausedByVisibility = true;
          bgmStop();
        }
      } else if (document.visibilityState === "visible") {
        if (pausedByVisibility && state.bgmEnabled) {
          pausedByVisibility = false;
          bgmStart();
        }
        pausedByVisibility = false;
      }
    });
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 6. 공개 API — 상태 읽기/구독, 토글, mute/volume, BGM 제어
 * ────────────────────────────────────────────────────────────────────────── */

/** 현재 오디오 상태 스냅샷. */
export const getAudioState = (): AudioState => snapshot();

/** 상태 변경 구독. 반환된 함수로 구독 해제(useSyncExternalStore 호환). */
export const onAudioStateChange = (listener: AudioStateListener): (() => void) => {
  ensureWired();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 효과음 opt-in 여부. */
export const isSfxEnabled = (): boolean => state.sfxEnabled;

/** BGM opt-in 여부. */
export const isBgmEnabled = (): boolean => state.bgmEnabled;

/** 효과음 on/off(영속). */
export const setSfxEnabled = (enabled: boolean): void => {
  ensureWired();
  if (state.sfxEnabled === enabled) return;
  state.sfxEnabled = enabled;
  writeStoredBool(SFX_KEY, enabled);
  emit();
};

/**
 * BGM on/off(영속). ON 토글은 제스처로 간주해 즉시 첫 무드 재생(컨텍스트 언락),
 * OFF 는 페이드아웃하며 정지해요.
 */
export const setBgmEnabled = (enabled: boolean): void => {
  ensureWired();
  if (state.bgmEnabled === enabled) {
    if (enabled && !anyBgmPlaying()) bgmStart();
    if (!enabled && anyBgmPlaying()) bgmStop();
    return;
  }
  state.bgmEnabled = enabled;
  writeStoredBool(BGM_KEY, enabled);
  pausedByVisibility = false;
  if (enabled) bgmStart();
  else bgmStop();
  emit();
};

/** BGM 재생 시작(opt-in ON). 제스처 안에서 호출하세요. */
export const bgmPlay = (): void => setBgmEnabled(true);

/** BGM 정지(opt-in OFF). */
export const bgmPause = (): void => setBgmEnabled(false);

/** BGM on↔off 토글. 새 상태(켜졌으면 true) 반환. */
export const bgmToggle = (): boolean => {
  setBgmEnabled(!state.bgmEnabled);
  return state.bgmEnabled;
};

/**
 * 다음 무드/트랙으로 전환. 정지 상태면 다음 인덱스만 기억해 둬요(다음 시작 시 반영).
 * 플레이리스트 모드면 다음 mp3 트랙으로 넘어가요.
 */
export const bgmNext = (): void => {
  ensureWired();
  if (usingPlaylist()) {
    if (!playlistPlaying) {
      playlistIndex = (playlistIndex + 1) % playlist.length;
      syncTrackName(playlist[playlistIndex]?.label ?? "");
      return;
    }
    advancePlaylist(1);
    return;
  }
  if (!bgmPlaying) {
    presetIndex = normalizeIndex(presetIndex + 1);
    syncTrackName(BGM_PRESETS[presetIndex]?.name ?? "");
    return;
  }
  advance(1);
};

/**
 * 특정 무드 id 로 직접 전환(없으면 무시). 재생 중이면 즉시 crossfade.
 * 플레이리스트 모드에서는 `playlist:<index>` 형태 id 또는 순수 인덱스 문자열도 받아요.
 */
export const bgmSetMood = (moodId: string): void => {
  ensureWired();
  if (usingPlaylist()) {
    const raw = moodId.startsWith("playlist:") ? moodId.slice("playlist:".length) : moodId;
    const index = Number.parseInt(raw, 10);
    if (!Number.isInteger(index) || index < 0 || index >= playlist.length) return;
    if (!playlistPlaying) {
      playlistIndex = index;
      syncTrackName(playlist[index]?.label ?? "");
      return;
    }
    advancePlaylist(index - playlistIndex);
    return;
  }
  const index = BGM_PRESETS.findIndex((p) => p.id === moodId);
  if (index < 0) return;
  if (!bgmPlaying) {
    presetIndex = index;
    syncTrackName(BGM_PRESETS[index]?.name ?? "");
    return;
  }
  advance(index - presetIndex);
};

/** 현재(또는 다음 시작할) 무드명. */
export const getCurrentMoodName = (): string => state.currentMood;

/** BGM 재생 중 여부(생성형/플레이리스트 어느 엔진이든). */
export const isBgmPlaying = (): boolean => anyBgmPlaying();

/** 오디오 편집·통화처럼 배경음악이 방해되는 컨텍스트에서 opt-in 상태를 보존한 채 잠시 멈춘다. */
export const suspendBgmForContext = (reason: string): void => {
  const normalized = reason.trim();
  if (!normalized || bgmSuspensionReasons.has(normalized)) return;
  const wasAllowed = isBgmContextAllowed();
  bgmSuspensionReasons.add(normalized);
  if (wasAllowed && anyBgmPlaying()) bgmStop();
};

/** 해당 컨텍스트의 일시정지를 해제하고, 사용자가 켜 둔 경우에만 부드럽게 재개한다. */
export const resumeBgmForContext = (reason: string): void => {
  const normalized = reason.trim();
  if (!normalized || !bgmSuspensionReasons.delete(normalized)) return;
  const visible = typeof document === "undefined" || document.visibilityState !== "hidden";
  if (isBgmContextAllowed() && visible && state.bgmEnabled) bgmStart();
};

/** 현재 하나 이상의 컨텍스트가 BGM을 일시정지했는지. */
export const isBgmSuspended = (): boolean => !isBgmContextAllowed();

/** registerBgmPlaylist 입력 항목 — URL 문자열 또는 크레딧 메타 포함 객체. */
export interface BgmPlaylistEntry {
  url: string;
  label?: string;
  /** (선택) 아티스트명 — UI 크레딧 표기용. */
  artist?: string;
  /** (선택) 원본 출처/크레딧 링크. */
  creditUrl?: string;
}

/**
 * (선택) 호스티드 mp3 플레이리스트를 등록해요. 비어 있지 않으면 BGM 켤 때 생성형 대신
 * 이 트랙들을 crossfade 로테이션합니다(없으면 생성형 폴백). 항목은 URL 문자열 또는
 * `{ url, label, artist, creditUrl }`. 보통 앱 부팅 시 manifest(`/audio/playlist.json`)를
 * 읽어 1회 호출하세요.
 *
 * 예) `registerBgmPlaylist(['/audio/upbeat-1.mp3', { url: '/audio/funky.mp3', label: '펑키' }])`
 * 빈 배열을 넘기면 등록 해제(생성형으로 복귀).
 */
export const registerBgmPlaylist = (
  tracks: ReadonlyArray<string | BgmPlaylistEntry>,
): void => {
  ensureWired();
  const wasPlaying = anyBgmPlaying();
  // 전환 전에 현재 재생을 깔끔히 멈춰요(엔진 교체).
  if (wasPlaying) bgmStop();
  playlist = tracks
    .map((t) => (typeof t === "string" ? ({ url: t } as BgmPlaylistEntry) : t))
    .filter((t): t is BgmPlaylistEntry => Boolean(t?.url))
    .map((t) => ({
      url: t.url,
      label: t.label?.trim() || labelFromUrl(t.url),
      artist: t.artist?.trim() || undefined,
      creditUrl: t.creditUrl?.trim() || undefined,
    }));
  playlistIndex = 0;
  // 라벨/상태를 새 소스 기준으로 갱신.
  syncTrackName(
    playlist.length > 0
      ? (playlist[0]?.label ?? "")
      : (BGM_PRESETS[presetIndex]?.name ?? ""),
  );
  // opt-in 이 켜져 있었고 막 재생 중이었다면 새 엔진으로 이어 재생.
  if (wasPlaying && state.bgmEnabled) bgmStart();
};

/** 등록된 호스티드 플레이리스트 트랙 수(0 이면 생성형 사용 중). */
export const getBgmPlaylistSize = (): number => playlist.length;

/** 마스터 음소거 on/off(영속). 모든 SFX/BGM 출력에 즉시 반영. */
export const setMuted = (value: boolean): void => {
  ensureWired();
  if (muted === value) return;
  muted = value;
  state.muted = value;
  writeStoredBool(MUTE_KEY, value);
  applyMasterGain();
  emit();
};

/** mute 토글. 새 상태 반환. */
export const toggleMuted = (): boolean => {
  setMuted(!muted);
  return muted;
};

/** 현재 음소거 여부. */
export const isMuted = (): boolean => muted;

/** 마스터 볼륨 설정(0~1, 영속). */
export const setMasterVolume = (volume: number): void => {
  ensureWired();
  const next = clamp01(volume);
  if (userVolume === next) return;
  userVolume = next;
  state.volume = next;
  writeStoredNumber(VOL_KEY, next);
  applyMasterGain();
  emit();
};

/** 현재 마스터 볼륨(0~1). */
export const getMasterVolume = (): number => userVolume;

/** BGM 전용 볼륨 설정(0~1, 영속). SFX와 알림음의 크기는 바꾸지 않는다. */
export const setBgmVolume = (volume: number): void => {
  ensureWired();
  const next = clamp01(volume);
  if (bgmUserVolume === next) return;
  bgmUserVolume = next;
  state.bgmVolume = next;
  writeStoredNumber(BGM_VOL_KEY, next);
  applyBgmGain();
  emit();
};

/** 현재 BGM 전용 볼륨(0~1). */
export const getBgmVolume = (): number => bgmUserVolume;

let pausedForAd = false;
let bgmWasPlayingBeforeAd = false;

/** 광고 재생 시 BGM과 오디오 컨텍스트를 일시정지해요. */
export const pauseAudioForAd = (): void => {
  if (pausedForAd) return;
  pausedForAd = true;
  ensureWired();

  bgmWasPlayingBeforeAd = state.bgmEnabled && anyBgmPlaying();

  if (bgmWasPlayingBeforeAd) {
    bgmStop();
  }

  if (playlistVoice?.el) {
    try {
      playlistVoice.el.pause();
    } catch {
      // no-op
    }
  }

  const ctx = getAudioContext();
  if (ctx && ctx.state === "running") {
    void ctx.suspend().catch(() => {});
  }
};

/** 광고 재생이 끝나면 BGM과 오디오 컨텍스트를 재개해요. */
export const resumeAudioAfterAd = (): void => {
  if (!pausedForAd) return;
  pausedForAd = false;

  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume()
      .then(() => {
        if (bgmWasPlayingBeforeAd && state.bgmEnabled) {
          bgmStart();
          if (playlistVoice?.el) {
            void playlistVoice.el.play().catch(() => {});
          }
        }
      })
      .catch(() => {
        if (bgmWasPlayingBeforeAd && state.bgmEnabled) {
          bgmStart();
        }
      });
  } else {
    if (bgmWasPlayingBeforeAd && state.bgmEnabled) {
      bgmStart();
      if (playlistVoice?.el) {
        void playlistVoice.el.play().catch(() => {});
      }
    }
  }
};
