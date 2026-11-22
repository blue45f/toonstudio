/**
 * 가상 스튜디오 효과음 합성 레시피 (순수 데이터).
 *
 * 음원 파일을 추가하지 않고 WebAudio 오실레이터·노이즈로 만드는 짧은 소리들의
 * 파라미터 표다. 발소리는 표면(카펫/나무/타일)별 필터·톤 조합으로 음색을 나누고,
 * 상호작용 SFX는 이벤트당 하나의 절제된 톤 패턴만 쓴다.
 * 실제 재생(노드 그래프·게인·스로틀)은 studio-virtual-space-sound-engine.ts가 담당한다.
 */
import type { StudioExtendedFootstepSurface, StudioFootstepFoot } from "./studio-virtual-space-footsteps";

/** 상호작용 효과음 종류. 이벤트 하나에 소리 하나가 원칙이다. */
export type StudioSfxKind =
  | "activate"
  | "peer-join"
  | "peer-leave"
  | "emote"
  | "focus-start"
  | "focus-break"
  | "wellness-chime"
  | "dance-beat"
  | "seat-settle"
  | "seat-stand"
  | "jump"
  | "land"
  | "skid"
  | "sprint-start"
  | "portal";

export interface StudioSfxToneStep {
  readonly wave: "sine" | "triangle";
  /** 시작 주파수(Hz). */
  readonly fromHz: number;
  /** 끝 주파수(Hz). fromHz와 다르면 글라이드한다. */
  readonly toHz: number;
  /** 소리 시작점으로부터의 지연(ms). */
  readonly startOffsetMs: number;
  readonly durationMs: number;
  /** 0~1 상대 세기. 마스터 게인과 다시 곱해진다. */
  readonly peak: number;
}

/** 스우시·착지 마찰·쿠션 스침 등에 쓰이는 필터링 노이즈 레이어. */
export interface StudioSfxNoiseStep {
  readonly filterType: "lowpass" | "bandpass" | "highpass";
  readonly fromHz: number;
  readonly toHz: number;
  readonly filterQ: number;
  readonly startOffsetMs: number;
  readonly durationMs: number;
  readonly peak: number;
}

export interface StudioSfxSpec {
  readonly steps: readonly StudioSfxToneStep[];
  readonly noiseSteps?: readonly StudioSfxNoiseStep[];
  /** 같은 종류 소리의 최소 간격(ms). 연속 이벤트의 소리 겹침을 막는다. */
  readonly throttleMs: number;
}

const SFX_SPECS: Record<StudioSfxKind, StudioSfxSpec> = {
  // 오브젝트 활성화: 짧은 두 층의 상승 블립. 확인음처럼 가볍게 끝난다.
  activate: {
    throttleMs: 180,
    steps: [
      { wave: "sine", fromHz: 660, toHz: 990, startOffsetMs: 0, durationMs: 80, peak: 0.45 },
      { wave: "sine", fromHz: 1320, toHz: 1980, startOffsetMs: 10, durationMs: 60, peak: 0.12 },
    ],
  },
  // 피어 입장: 낮은 음에서 높은 음으로 부드럽게 두 톤.
  "peer-join": {
    throttleMs: 400,
    steps: [
      { wave: "sine", fromHz: 523, toHz: 523, startOffsetMs: 0, durationMs: 90, peak: 0.3 },
      { wave: "sine", fromHz: 784, toHz: 784, startOffsetMs: 70, durationMs: 110, peak: 0.3 },
    ],
  },
  // 피어 퇴장: 입장의 역순(하강 두 톤).
  "peer-leave": {
    throttleMs: 400,
    steps: [
      { wave: "sine", fromHz: 784, toHz: 784, startOffsetMs: 0, durationMs: 90, peak: 0.28 },
      { wave: "sine", fromHz: 523, toHz: 523, startOffsetMs: 70, durationMs: 120, peak: 0.28 },
    ],
  },
  // 이모트: 경쾌하게 튀어 오르는 맑은 팝.
  emote: {
    throttleMs: 150,
    steps: [
      { wave: "sine", fromHz: 780, toHz: 1040, startOffsetMs: 0, durationMs: 75, peak: 0.36 },
    ],
  },
  // 포모도로 집중 시작: 맑은 완전 5도 상승 차임.
  "focus-start": {
    throttleMs: 300,
    steps: [
      { wave: "sine", fromHz: 587, toHz: 587, startOffsetMs: 0, durationMs: 90, peak: 0.34 },
      { wave: "sine", fromHz: 880, toHz: 880, startOffsetMs: 65, durationMs: 110, peak: 0.32 },
    ],
  },
  // 포모도로 휴식 전환: 부드럽고 따뜻한 안정 2톤.
  "focus-break": {
    throttleMs: 300,
    steps: [
      { wave: "triangle", fromHz: 659, toHz: 523, startOffsetMs: 0, durationMs: 95, peak: 0.3 },
      { wave: "sine", fromHz: 523, toHz: 523, startOffsetMs: 70, durationMs: 115, peak: 0.28 },
    ],
  },
  // 웰니스(체조·요가·타이치): 맑은 싱잉볼 고역 하모닉 차임.
  "wellness-chime": {
    throttleMs: 220,
    steps: [
      { wave: "sine", fromHz: 740, toHz: 740, startOffsetMs: 0, durationMs: 100, peak: 0.28 },
      { wave: "sine", fromHz: 1110, toHz: 1110, startOffsetMs: 35, durationMs: 120, peak: 0.22 },
    ],
  },
  // 댄스·그루브·문워크: 경쾌한 리듬 스냅.
  "dance-beat": {
    throttleMs: 160,
    steps: [
      { wave: "triangle", fromHz: 220, toHz: 140, startOffsetMs: 0, durationMs: 75, peak: 0.38 },
      { wave: "sine", fromHz: 960, toHz: 720, startOffsetMs: 20, durationMs: 60, peak: 0.25 },
    ],
  },
  // 의자 착석 안착음: 부드러운 저중역 쿠션 톤 + 은은한 패브릭 스침.
  "seat-settle": {
    throttleMs: 250,
    steps: [
      { wave: "triangle", fromHz: 310, toHz: 195, startOffsetMs: 0, durationMs: 88, peak: 0.32 },
    ],
    noiseSteps: [
      { filterType: "lowpass", fromHz: 560, toHz: 320, filterQ: 0.8, startOffsetMs: 0, durationMs: 70, peak: 0.22 },
    ],
  },
  // 의자 기립음: 가볍게 일어나는 상승 톤 + 짧은 스침.
  "seat-stand": {
    throttleMs: 240,
    steps: [
      { wave: "sine", fromHz: 230, toHz: 370, startOffsetMs: 0, durationMs: 75, peak: 0.26 },
    ],
    noiseSteps: [
      { filterType: "bandpass", fromHz: 680, toHz: 1280, filterQ: 1.1, startOffsetMs: 0, durationMs: 56, peak: 0.18 },
    ],
  },
  // 점프 도약음: 경쾌한 상승 스우시(whoosh) + 산뜻한 도약 톤.
  jump: {
    throttleMs: 180,
    steps: [
      { wave: "sine", fromHz: 270, toHz: 580, startOffsetMs: 0, durationMs: 88, peak: 0.34 },
      { wave: "triangle", fromHz: 440, toHz: 740, startOffsetMs: 10, durationMs: 58, peak: 0.14 },
    ],
    noiseSteps: [
      { filterType: "bandpass", fromHz: 360, toHz: 1520, filterQ: 1.2, startOffsetMs: 0, durationMs: 92, peak: 0.32 },
    ],
  },
  // 점프 착지음: 부드러운 쿵(thud) 저역 톤 + 바닥 접지 먼지 탭.
  land: {
    throttleMs: 140,
    steps: [
      { wave: "triangle", fromHz: 176, toHz: 68, startOffsetMs: 0, durationMs: 82, peak: 0.42 },
      { wave: "sine", fromHz: 340, toHz: 170, startOffsetMs: 4, durationMs: 44, peak: 0.16 },
    ],
    noiseSteps: [
      { filterType: "lowpass", fromHz: 520, toHz: 210, filterQ: 0.9, startOffsetMs: 0, durationMs: 62, peak: 0.36 },
    ],
  },
  // 급회전·급정지 스키드: 신발 밑창과 먼지 마찰 스키드음.
  skid: {
    throttleMs: 200,
    steps: [
      { wave: "triangle", fromHz: 480, toHz: 210, startOffsetMs: 0, durationMs: 68, peak: 0.22 },
    ],
    noiseSteps: [
      { filterType: "bandpass", fromHz: 1880, toHz: 760, filterQ: 1.5, startOffsetMs: 0, durationMs: 86, peak: 0.42 },
    ],
  },
  // 달리기 시작 대시 스우시: 순간 추진 마찰과 경쾌한 어택 톤.
  "sprint-start": {
    throttleMs: 260,
    steps: [
      { wave: "sine", fromHz: 320, toHz: 640, startOffsetMs: 0, durationMs: 64, peak: 0.24 },
    ],
    noiseSteps: [
      { filterType: "bandpass", fromHz: 640, toHz: 1960, filterQ: 1.35, startOffsetMs: 0, durationMs: 74, peak: 0.34 },
    ],
  },
  // 문·포털 이동음: 부드러운 공간 이동 쉬머 2톤 + 공기 흐름.
  portal: {
    throttleMs: 360,
    steps: [
      { wave: "sine", fromHz: 528, toHz: 792, startOffsetMs: 0, durationMs: 110, peak: 0.3 },
      { wave: "sine", fromHz: 792, toHz: 1188, startOffsetMs: 42, durationMs: 115, peak: 0.24 },
    ],
    noiseSteps: [
      { filterType: "bandpass", fromHz: 880, toHz: 2320, filterQ: 1.8, startOffsetMs: 0, durationMs: 115, peak: 0.2 },
    ],
  },
};

export function studioSfxSpec(kind: StudioSfxKind): StudioSfxSpec {
  return SFX_SPECS[kind];
}

/** 이모트 성격(웰니스/댄스/일반)에 맞는 효과음 종류를 돌려준다. */
export function studioEmoteSfxKind(emoteId?: string | null): StudioSfxKind {
  if (!emoteId) return "emote";
  if (
    emoteId === "stretch"
    || emoteId === "calisthenics"
    || emoteId === "yoga"
    || emoteId === "neck-stretch"
    || emoteId === "tai-chi"
  ) {
    return "wellness-chime";
  }
  if (
    emoteId === "dance"
    || emoteId === "groove"
    || emoteId === "kpop-dance"
    || emoteId === "shuffle"
    || emoteId === "moonwalk"
  ) {
    return "dance-beat";
  }
  return "emote";
}

/** 발소리 합성 레시피. 노이즈 버스트(필터) + 표면에 따라 짧은 톤(노크/클릭) + 달리기 2단 톤·마찰음을 겹친다. */
export interface StudioFootstepSynthSpec {
  readonly durationMs: number;
  readonly filterType: "lowpass" | "bandpass" | "highpass";
  readonly filterFrequency: number;
  readonly filterQ: number;
  /** 노이즈 버스트의 상대 세기 0~1. 이벤트 볼륨과 다시 곱해진다. */
  readonly noisePeak: number;
  readonly tone: {
    readonly wave: "sine" | "triangle";
    readonly frequency: number;
    readonly peak: number;
    readonly durationMs: number;
  } | null;
  /** 달리기(sprinting) 발걸음의 경쾌한 2단 앞꿈치 추진 톤. */
  readonly secondaryTone: {
    readonly wave: "sine" | "triangle";
    readonly frequency: number;
    readonly peak: number;
    readonly startOffsetMs: number;
    readonly durationMs: number;
  } | null;
  /** 달리기 발걸음의 미세 신발 마찰음 레이어. */
  readonly frictionNoise: StudioSfxNoiseStep | null;
}

/** 왼발/오른발의 미세한 음높이 차이. 사람이 걷는 소리의 단조로움을 줄인다. */
const FOOT_FREQUENCY_FACTOR: Record<StudioFootstepFoot, number> = { left: 0.93, right: 1.07 };

interface StudioFootstepSynthBase {
  readonly durationMs: number;
  readonly filterType: StudioFootstepSynthSpec["filterType"];
  readonly baseFrequency: number;
  readonly filterQ: number;
  readonly noisePeak: number;
  readonly tone: { wave: "sine" | "triangle"; baseFrequency: number; peak: number; durationMs: number } | null;
  readonly sprintPushHz: number;
}

const FOOTSTEP_SPECS: Record<StudioExtendedFootstepSurface | "grass", StudioFootstepSynthBase> = {
  // 카펫: 낮은 저역만 남긴 뭉툭한 소리. 톤은 없다.
  carpet: { durationMs: 55, filterType: "lowpass", baseFrequency: 480, filterQ: 0.7, noisePeak: 0.55, tone: null, sprintPushHz: 260 },
  // 나무: 중간 대역 노이즈에 낮은 노크를 겹친다.
  wood: {
    durationMs: 75, filterType: "bandpass", baseFrequency: 820, filterQ: 1.1, noisePeak: 0.7,
    tone: { wave: "triangle", baseFrequency: 150, peak: 0.3, durationMs: 55 },
    sprintPushHz: 245,
  },
  // 타일: 높은 대역의 맑은 클릭.
  tile: {
    durationMs: 45, filterType: "bandpass", baseFrequency: 2500, filterQ: 1.6, noisePeak: 0.75,
    tone: { wave: "sine", baseFrequency: 1900, peak: 0.14, durationMs: 25 },
    sprintPushHz: 2350,
  },
  // 석재 홀: 단단한 중·고역 미네랄 공명.
  stone: {
    durationMs: 52, filterType: "bandpass", baseFrequency: 1680, filterQ: 1.45, noisePeak: 0.72,
    tone: { wave: "sine", baseFrequency: 980, peak: 0.19, durationMs: 34 },
    sprintPushHz: 1320,
  },
  // 야외 테라스: 산뜻한 모래/우드덱 그릿감과 가벼운 저중역 탭.
  terrace: {
    durationMs: 68, filterType: "bandpass", baseFrequency: 1320, filterQ: 0.95, noisePeak: 0.78,
    tone: { wave: "triangle", baseFrequency: 290, peak: 0.22, durationMs: 44 },
    sprintPushHz: 430,
  },
  // 잔디: 산뜻한 풀잎 스침과 포근한 토양 울림.
  grass: {
    durationMs: 64, filterType: "bandpass", baseFrequency: 1120, filterQ: 0.85, noisePeak: 0.66,
    tone: { wave: "triangle", baseFrequency: 210, peak: 0.14, durationMs: 38 },
    sprintPushHz: 330,
  },
};

export function studioFootstepSynthSpec(
  surface: StudioExtendedFootstepSurface | "grass",
  foot: StudioFootstepFoot,
  sprinting = false,
): StudioFootstepSynthSpec {
  const base = FOOTSTEP_SPECS[surface] ?? FOOTSTEP_SPECS.wood;
  const factor = FOOT_FREQUENCY_FACTOR[foot];
  const speedFreqScale = sprinting ? 1.22 : 1;
  const durationMs = sprinting ? Math.max(28, Math.round(base.durationMs * 0.8)) : base.durationMs;
  const noisePeak = sprinting ? Math.min(1, Number((base.noisePeak * 1.15).toFixed(3))) : base.noisePeak;
  const primaryTone = base.tone
    ? Object.freeze({
      wave: base.tone.wave,
      frequency: Math.round(base.tone.baseFrequency * factor * (sprinting ? 1.16 : 1)),
      peak: sprinting ? Math.min(0.48, Number((base.tone.peak * 1.2).toFixed(3))) : base.tone.peak,
      durationMs: sprinting ? Math.max(18, Math.round(base.tone.durationMs * 0.78)) : base.tone.durationMs,
    })
    : null;
  const secondaryTone = sprinting
    ? Object.freeze({
      wave: (base.tone?.wave ?? "triangle") as "sine" | "triangle",
      frequency: Math.round(base.sprintPushHz * factor),
      peak: base.tone ? Math.min(0.32, Number((base.tone.peak * 0.82).toFixed(3))) : 0.14,
      startOffsetMs: 16,
      durationMs: 26,
    })
    : null;
  const frictionNoise = sprinting
    ? Object.freeze({
      filterType: "bandpass" as const,
      fromHz: Math.min(6200, Math.round(base.baseFrequency * 1.55 * factor)),
      toHz: Math.max(300, Math.round(base.baseFrequency * 0.95 * factor)),
      filterQ: 1.35,
      startOffsetMs: 12,
      durationMs: 36,
      peak: Math.min(0.42, Number((base.noisePeak * 0.45).toFixed(3))),
    })
    : null;
  return Object.freeze({
    durationMs,
    filterType: base.filterType,
    filterFrequency: Math.round(base.baseFrequency * factor * speedFreqScale),
    filterQ: base.filterQ,
    noisePeak,
    tone: primaryTone,
    secondaryTone,
    frictionNoise,
  });
}
