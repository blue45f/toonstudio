/**
 * 가상 스튜디오 물리 발걸음 & 어쿠스틱 공간 효과음 합성 레시피 (순수 데이터).
 *
 * 음원 파일을 추가하지 않고 성형 노이즈(핑크·브라운·그릿)와 댐핑 공명 필터로
 * 6종 바닥(카펫·나무·타일·석재·테라스·잔디)의 2~3단계 발걸음(뒤꿈치 착지 →
 * 발바닥 구름 → 미세 스침)과 따뜻한 나무·세라믹·펠트 상호작용 폴리를 정의한다.
 * 실제 재생(노드 그래프·공간 패닝·공기 흡음·실내 초기반사)은
 * studio-virtual-space-sound-engine.ts가 담당한다.
 */
import type { StudioExtendedFootstepSurface, StudioFootstepFoot } from "./studio-virtual-space-footsteps";

/** 물리 성형 노이즈 버퍼 종류(원시 화이트 노이즈 대체). */
export type StudioNoiseColor = "pink" | "brown" | "grit";

/** 상호작용 효과음 종류. 이벤트 하나에 절제된 어쿠스틱 폴리 하나가 원칙이다. */
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
  /** 끝 주파수(Hz). fromHz와 다르면 자연스럽게 감쇠 글라이드한다. */
  readonly toHz: number;
  /** 소리 시작점으로부터의 지연(ms). */
  readonly startOffsetMs: number;
  readonly durationMs: number;
  /** 0~1 상대 세기. 마스터 게인과 다시 곱해진다. */
  readonly peak: number;
  /** 90년대 raw 비프음을 없애는 따뜻한 공명 로우패스 컷오프(Hz). */
  readonly lowpassHz?: number;
  /** 펠트·나무 타건감용 부드러운 어택 시간(ms). */
  readonly attackMs?: number;
}

/** 타건 촉감·공기 스우시·바닥 마찰·쿠션 스침에 쓰이는 성형 필터링 노이즈 레이어. */
export interface StudioSfxNoiseStep {
  readonly filterType: "lowpass" | "bandpass" | "highpass";
  readonly fromHz: number;
  readonly toHz: number;
  readonly filterQ: number;
  readonly startOffsetMs: number;
  readonly durationMs: number;
  readonly peak: number;
  /** 사용할 물리 성형 노이즈 버퍼 종류(기본 "pink"). */
  readonly noiseColor?: StudioNoiseColor;
}

export interface StudioSfxSpec {
  readonly steps: readonly StudioSfxToneStep[];
  readonly noiseSteps?: readonly StudioSfxNoiseStep[];
  /** 같은 종류 소리의 최소 간격(ms). 연속 이벤트의 소리 겹침을 막는다. */
  readonly throttleMs: number;
}

const SFX_SPECS: Record<StudioSfxKind, StudioSfxSpec> = {
  // 오브젝트 활성화: 따뜻한 시더 우드블록 + 세라믹 공명 2단 탭(전자 비프 제거).
  activate: {
    throttleMs: 180,
    steps: [
      { wave: "sine", fromHz: 460, toHz: 554, startOffsetMs: 0, durationMs: 74, peak: 0.38, lowpassHz: 1850, attackMs: 3 },
      { wave: "sine", fromHz: 880, toHz: 830, startOffsetMs: 12, durationMs: 62, peak: 0.14, lowpassHz: 2350, attackMs: 4 },
    ],
    noiseSteps: [
      { noiseColor: "pink", filterType: "bandpass", fromHz: 1580, toHz: 960, filterQ: 1.05, startOffsetMs: 0, durationMs: 24, peak: 0.22 },
    ],
  },
  // 피어 입장: 펠트 마림바 상승 5도 + 부드러운 문틈 공기 스침.
  "peer-join": {
    throttleMs: 400,
    steps: [
      { wave: "sine", fromHz: 440, toHz: 440, startOffsetMs: 0, durationMs: 92, peak: 0.28, lowpassHz: 1650, attackMs: 4 },
      { wave: "sine", fromHz: 659, toHz: 659, startOffsetMs: 68, durationMs: 112, peak: 0.28, lowpassHz: 2150, attackMs: 4 },
    ],
    noiseSteps: [
      { noiseColor: "pink", filterType: "bandpass", fromHz: 760, toHz: 1320, filterQ: 0.9, startOffsetMs: 0, durationMs: 52, peak: 0.15 },
    ],
  },
  // 피어 퇴장: 입장의 역순 하강 펠트 마림바 + 나직한 닫힘 공기감.
  "peer-leave": {
    throttleMs: 400,
    steps: [
      { wave: "sine", fromHz: 659, toHz: 659, startOffsetMs: 0, durationMs: 88, peak: 0.26, lowpassHz: 1850, attackMs: 4 },
      { wave: "sine", fromHz: 440, toHz: 440, startOffsetMs: 68, durationMs: 115, peak: 0.25, lowpassHz: 1450, attackMs: 5 },
    ],
    noiseSteps: [
      { noiseColor: "brown", filterType: "lowpass", fromHz: 720, toHz: 340, filterQ: 0.75, startOffsetMs: 6, durationMs: 58, peak: 0.16 },
    ],
  },
  // 이모트: 맑은 펠트 말렛 우드·세라믹 팝(찌르는 고역 제거).
  emote: {
    throttleMs: 150,
    steps: [
      { wave: "sine", fromHz: 523, toHz: 659, startOffsetMs: 0, durationMs: 76, peak: 0.34, lowpassHz: 2100, attackMs: 3 },
    ],
    noiseSteps: [
      { noiseColor: "pink", filterType: "bandpass", fromHz: 1420, toHz: 940, filterQ: 1.0, startOffsetMs: 0, durationMs: 20, peak: 0.18 },
    ],
  },
  // 포모도로 집중 시작: 따뜻한 나무 공명 싱잉볼 완전 5도 상승.
  "focus-start": {
    throttleMs: 300,
    steps: [
      { wave: "sine", fromHz: 494, toHz: 494, startOffsetMs: 0, durationMs: 92, peak: 0.32, lowpassHz: 1800, attackMs: 5 },
      { wave: "sine", fromHz: 740, toHz: 740, startOffsetMs: 64, durationMs: 112, peak: 0.3, lowpassHz: 2300, attackMs: 5 },
    ],
    noiseSteps: [
      { noiseColor: "pink", filterType: "bandpass", fromHz: 1320, toHz: 860, filterQ: 0.95, startOffsetMs: 0, durationMs: 26, peak: 0.13 },
    ],
  },
  // 포모도로 휴식 전환: 포근하게 내려앉는 펠트 피아노/마림바 2톤 + 숨결 노이즈.
  "focus-break": {
    throttleMs: 300,
    steps: [
      { wave: "triangle", fromHz: 587, toHz: 494, startOffsetMs: 0, durationMs: 94, peak: 0.28, lowpassHz: 1580, attackMs: 5 },
      { wave: "sine", fromHz: 392, toHz: 392, startOffsetMs: 68, durationMs: 114, peak: 0.26, lowpassHz: 1350, attackMs: 6 },
    ],
    noiseSteps: [
      { noiseColor: "pink", filterType: "lowpass", fromHz: 920, toHz: 460, filterQ: 0.7, startOffsetMs: 0, durationMs: 62, peak: 0.15 },
    ],
  },
  // 웰니스(체조·요가·타이치): 부드러운 세라믹·싱잉볼 하모닉 + 나무 채 스침.
  "wellness-chime": {
    throttleMs: 220,
    steps: [
      { wave: "sine", fromHz: 528, toHz: 528, startOffsetMs: 0, durationMs: 102, peak: 0.26, lowpassHz: 1850, attackMs: 6 },
      { wave: "sine", fromHz: 792, toHz: 792, startOffsetMs: 36, durationMs: 118, peak: 0.2, lowpassHz: 2400, attackMs: 7 },
    ],
    noiseSteps: [
      { noiseColor: "pink", filterType: "bandpass", fromHz: 1080, toHz: 1580, filterQ: 1.0, startOffsetMs: 0, durationMs: 44, peak: 0.11 },
    ],
  },
  // 댄스·그루브·문워크: 카혼 저역 바디 + 우드 림 스냅 + 그릿 셰이커.
  "dance-beat": {
    throttleMs: 160,
    steps: [
      { wave: "triangle", fromHz: 174, toHz: 112, startOffsetMs: 0, durationMs: 72, peak: 0.36, lowpassHz: 430, attackMs: 3 },
      { wave: "sine", fromHz: 540, toHz: 390, startOffsetMs: 18, durationMs: 56, peak: 0.22, lowpassHz: 1750, attackMs: 3 },
    ],
    noiseSteps: [
      { noiseColor: "grit", filterType: "bandpass", fromHz: 1820, toHz: 1120, filterQ: 1.2, startOffsetMs: 14, durationMs: 38, peak: 0.25 },
    ],
  },
  // 의자 착석 안착음: 원목 프레임 저역 울림 + 브라운 쿠션 압착 + 핑크 패브릭 스침.
  "seat-settle": {
    throttleMs: 250,
    steps: [
      { wave: "triangle", fromHz: 215, toHz: 132, startOffsetMs: 0, durationMs: 92, peak: 0.32, lowpassHz: 460, attackMs: 4 },
    ],
    noiseSteps: [
      { noiseColor: "brown", filterType: "lowpass", fromHz: 480, toHz: 220, filterQ: 0.72, startOffsetMs: 0, durationMs: 80, peak: 0.28 },
      { noiseColor: "pink", filterType: "bandpass", fromHz: 1140, toHz: 680, filterQ: 0.9, startOffsetMs: 14, durationMs: 56, peak: 0.16 },
    ],
  },
  // 의자 기립음: 가벼운 목재 복원 울림 + 의복 패브릭 스침.
  "seat-stand": {
    throttleMs: 240,
    steps: [
      { wave: "sine", fromHz: 186, toHz: 278, startOffsetMs: 0, durationMs: 74, peak: 0.24, lowpassHz: 860, attackMs: 4 },
    ],
    noiseSteps: [
      { noiseColor: "pink", filterType: "bandpass", fromHz: 640, toHz: 1280, filterQ: 1.0, startOffsetMs: 0, durationMs: 62, peak: 0.2 },
    ],
  },
  // 점프 도약음: 아케이드 상승 휘슬 제거 → 신발 앞꿈치 박차기 + 옷깃 공기 흐름.
  jump: {
    throttleMs: 180,
    steps: [
      { wave: "triangle", fromHz: 168, toHz: 248, startOffsetMs: 0, durationMs: 58, peak: 0.3, lowpassHz: 520, attackMs: 3 },
    ],
    noiseSteps: [
      { noiseColor: "grit", filterType: "bandpass", fromHz: 1420, toHz: 880, filterQ: 1.05, startOffsetMs: 0, durationMs: 28, peak: 0.22 },
      { noiseColor: "pink", filterType: "bandpass", fromHz: 390, toHz: 1260, filterQ: 0.95, startOffsetMs: 8, durationMs: 88, peak: 0.3 },
    ],
  },
  // 점프 착지음: 양발 묵직한 저역 마루/지면 충격 + 브라운 충격파 + 그릿 먼지 안착.
  land: {
    throttleMs: 140,
    steps: [
      { wave: "triangle", fromHz: 148, toHz: 62, startOffsetMs: 0, durationMs: 86, peak: 0.42, lowpassHz: 340, attackMs: 3 },
      { wave: "sine", fromHz: 242, toHz: 126, startOffsetMs: 6, durationMs: 48, peak: 0.16, lowpassHz: 680, attackMs: 3 },
    ],
    noiseSteps: [
      { noiseColor: "brown", filterType: "lowpass", fromHz: 460, toHz: 170, filterQ: 0.8, startOffsetMs: 0, durationMs: 74, peak: 0.42 },
      { noiseColor: "grit", filterType: "bandpass", fromHz: 1460, toHz: 780, filterQ: 1.1, startOffsetMs: 10, durationMs: 44, peak: 0.22 },
    ],
  },
  // 급회전·급정지 스키드: 신발 밑창 고무 마찰 + 바닥 그릿 미끄러짐.
  skid: {
    throttleMs: 200,
    steps: [
      { wave: "triangle", fromHz: 280, toHz: 148, startOffsetMs: 0, durationMs: 64, peak: 0.22, lowpassHz: 720, attackMs: 3 },
    ],
    noiseSteps: [
      { noiseColor: "grit", filterType: "bandpass", fromHz: 1760, toHz: 720, filterQ: 1.35, startOffsetMs: 0, durationMs: 92, peak: 0.4 },
      { noiseColor: "pink", filterType: "bandpass", fromHz: 980, toHz: 460, filterQ: 0.9, startOffsetMs: 16, durationMs: 64, peak: 0.22 },
    ],
  },
  // 달리기 시작 대시: 앞꿈치 견인 박차기 + 짧은 공기 추진.
  "sprint-start": {
    throttleMs: 260,
    steps: [
      { wave: "triangle", fromHz: 196, toHz: 312, startOffsetMs: 0, durationMs: 54, peak: 0.24, lowpassHz: 680, attackMs: 3 },
    ],
    noiseSteps: [
      { noiseColor: "grit", filterType: "bandpass", fromHz: 1480, toHz: 920, filterQ: 1.15, startOffsetMs: 0, durationMs: 36, peak: 0.3 },
      { noiseColor: "pink", filterType: "bandpass", fromHz: 560, toHz: 1620, filterQ: 1.1, startOffsetMs: 8, durationMs: 72, peak: 0.26 },
    ],
  },
  // 문·포털 이동음: 따뜻한 나무·세라믹 풍경 차임 + 부드러운 문풍 공기 스윕.
  portal: {
    throttleMs: 360,
    steps: [
      { wave: "sine", fromHz: 440, toHz: 587, startOffsetMs: 0, durationMs: 108, peak: 0.28, lowpassHz: 1880, attackMs: 6 },
      { wave: "sine", fromHz: 659, toHz: 880, startOffsetMs: 42, durationMs: 114, peak: 0.22, lowpassHz: 2450, attackMs: 7 },
    ],
    noiseSteps: [
      { noiseColor: "pink", filterType: "bandpass", fromHz: 640, toHz: 1860, filterQ: 1.2, startOffsetMs: 0, durationMs: 118, peak: 0.22 },
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

/** 2단계(발바닥 구름) 물리 엔벨로프 파라미터. */
export interface StudioFootstepSoleRollSpec {
  /** 뒤꿈치 착지 후 발바닥이 구르며 닿는 지연(ms). */
  readonly delayMs: number;
  /** 뒤꿈치 임팩트 대비 발바닥 구름 상대 피크(0~1). */
  readonly peakRatio: number;
  /** 발바닥 구름 감쇠 길이(ms). */
  readonly durationMs: number;
}

/**
 * 2~3단계 물리 발소리 합성 레시피.
 * 1) 뒤꿈치 착지(Heel Impact) + 표면 공명 바디
 * 2) 발바닥 구름(Sole Roll: 필터 스윕 + 2차 무게 이동 엔벨로프)
 * 3) 미세 스침(Micro-Scuff: 보행 시 scuffNoise / 달리기 시 frictionNoise + 2단 추진 톤)
 */
export interface StudioFootstepSynthSpec {
  readonly durationMs: number;
  readonly filterType: "lowpass" | "bandpass" | "highpass";
  readonly filterFrequency: number;
  readonly filterQ: number;
  /** 뒤꿈치→발바닥 구름 전환 시 스윕되는 목표 필터 주파수(Hz). */
  readonly heelToSoleHz: number;
  /** 주 임팩트·구름에 사용하는 성형 노이즈 버퍼 종류. */
  readonly noiseColor: StudioNoiseColor;
  /** 노이즈 버스트의 상대 세기 0~1. 이벤트 볼륨과 다시 곱해진다. */
  readonly noisePeak: number;
  /** 2단계 발바닥 구름(Sole Roll) 파라미터. */
  readonly soleRoll: StudioFootstepSoleRollSpec;
  readonly tone: {
    readonly wave: "sine" | "triangle";
    readonly frequency: number;
    /** 감쇠하며 떨어지는 공명 끝 주파수(Hz). */
    readonly endFrequency?: number;
    /** 전자음 성분을 걷어내는 바디 로우패스(Hz). */
    readonly lowpassHz?: number;
    readonly peak: number;
    readonly durationMs: number;
  } | null;
  /** 달리기(sprinting) 발걸음의 경쾌한 2단 앞꿈치 추진 톤. */
  readonly secondaryTone: {
    readonly wave: "sine" | "triangle";
    readonly frequency: number;
    readonly endFrequency?: number;
    readonly lowpassHz?: number;
    readonly peak: number;
    readonly startOffsetMs: number;
    readonly durationMs: number;
  } | null;
  /** 보행 시 3단계 미세 밑창/바닥 스침(Micro-Scuff). 달리기 중에는 frictionNoise가 대체한다. */
  readonly scuffNoise: StudioSfxNoiseStep | null;
  /** 달리기 발걸음의 추진 신발 마찰·스침 레이어. */
  readonly frictionNoise: StudioSfxNoiseStep | null;
}

/** 왼발/오른발의 미세한 음높이 차이. 사람이 걷는 소리의 단조로움을 줄인다. */
const FOOT_FREQUENCY_FACTOR: Record<StudioFootstepFoot, number> = { left: 0.93, right: 1.07 };

interface StudioFootstepSynthBase {
  readonly durationMs: number;
  readonly filterType: StudioFootstepSynthSpec["filterType"];
  readonly baseFrequency: number;
  readonly soleRollFrequency: number;
  readonly filterQ: number;
  readonly noiseColor: StudioNoiseColor;
  readonly noisePeak: number;
  readonly soleRoll: StudioFootstepSoleRollSpec;
  readonly tone: {
    readonly wave: "sine" | "triangle";
    readonly baseFrequency: number;
    readonly endFrequency: number;
    readonly lowpassHz: number;
    readonly peak: number;
    readonly durationMs: number;
  } | null;
  readonly scuff: {
    readonly noiseColor: StudioNoiseColor;
    readonly filterType: "lowpass" | "bandpass" | "highpass";
    readonly fromHz: number;
    readonly toHz: number;
    readonly filterQ: number;
    readonly startOffsetMs: number;
    readonly durationMs: number;
    readonly peak: number;
  };
  readonly sprintPushHz: number;
  readonly sprintPushEndHz: number;
  readonly sprintPushLowpassHz: number;
}

const FOOTSTEP_SPECS: Record<StudioExtendedFootstepSurface | "grass", StudioFootstepSynthBase> = {
  // 카펫: 브라운 노이즈 섬유질 저역 압착 + 미세 원단 스침. 톤(오실레이터) 없음.
  carpet: {
    durationMs: 76,
    filterType: "lowpass",
    baseFrequency: 390,
    soleRollFrequency: 240,
    filterQ: 0.65,
    noiseColor: "brown",
    noisePeak: 0.62,
    soleRoll: { delayMs: 24, peakRatio: 0.58, durationMs: 42 },
    tone: null,
    scuff: { noiseColor: "pink", filterType: "bandpass", fromHz: 680, toHz: 460, filterQ: 0.8, startOffsetMs: 26, durationMs: 38, peak: 0.22 },
    sprintPushHz: 210,
    sprintPushEndHz: 135,
    sprintPushLowpassHz: 420,
  },
  // 나무: 감쇠된 저역 원목 마루 공명(LP 320Hz) + 브라운 임팩트·발바닥 구름 + 핑크 밑창 스침.
  wood: {
    durationMs: 84,
    filterType: "bandpass",
    baseFrequency: 720,
    soleRollFrequency: 410,
    filterQ: 0.95,
    noiseColor: "brown",
    noisePeak: 0.68,
    soleRoll: { delayMs: 24, peakRatio: 0.62, durationMs: 48 },
    tone: { wave: "triangle", baseFrequency: 142, endFrequency: 82, lowpassHz: 320, peak: 0.34, durationMs: 56 },
    scuff: { noiseColor: "pink", filterType: "bandpass", fromHz: 1180, toHz: 760, filterQ: 1.05, startOffsetMs: 22, durationMs: 36, peak: 0.24 },
    sprintPushHz: 196,
    sprintPushEndHz: 118,
    sprintPushLowpassHz: 440,
  },
  // 타일: 그릿 노이즈 기반의 단정한 세라믹 뒤꿈치 탭 + 짧은 세라믹 댐핑 클릭 + 평면 밑창 안착.
  tile: {
    durationMs: 54,
    filterType: "bandpass",
    baseFrequency: 2150,
    soleRollFrequency: 1280,
    filterQ: 1.35,
    noiseColor: "grit",
    noisePeak: 0.72,
    soleRoll: { delayMs: 16, peakRatio: 0.44, durationMs: 30 },
    tone: { wave: "sine", baseFrequency: 1260, endFrequency: 740, lowpassHz: 2200, peak: 0.14, durationMs: 22 },
    scuff: { noiseColor: "pink", filterType: "bandpass", fromHz: 1950, toHz: 1250, filterQ: 1.15, startOffsetMs: 16, durationMs: 28, peak: 0.26 },
    sprintPushHz: 1560,
    sprintPushEndHz: 920,
    sprintPushLowpassHz: 2500,
  },
  // 석재 홀: 단단한 미네랄 뒤꿈치 임팩트 + 저중역 석재 울림 + 미세 돌가루 그릿.
  stone: {
    durationMs: 62,
    filterType: "bandpass",
    baseFrequency: 1540,
    soleRollFrequency: 860,
    filterQ: 1.2,
    noiseColor: "grit",
    noisePeak: 0.7,
    soleRoll: { delayMs: 19, peakRatio: 0.5, durationMs: 34 },
    tone: { wave: "sine", baseFrequency: 640, endFrequency: 310, lowpassHz: 1350, peak: 0.19, durationMs: 32 },
    scuff: { noiseColor: "grit", filterType: "bandpass", fromHz: 2200, toHz: 1350, filterQ: 1.25, startOffsetMs: 18, durationMs: 32, peak: 0.25 },
    sprintPushHz: 840,
    sprintPushEndHz: 460,
    sprintPushLowpassHz: 1650,
  },
  // 야외 테라스: 그릿 자갈·우드덱 착지 + 개방된 목재 덱 공명 + 자갈 밟히는 미세 스크래치.
  terrace: {
    durationMs: 76,
    filterType: "bandpass",
    baseFrequency: 1240,
    soleRollFrequency: 720,
    filterQ: 0.88,
    noiseColor: "grit",
    noisePeak: 0.76,
    soleRoll: { delayMs: 22, peakRatio: 0.65, durationMs: 44 },
    tone: { wave: "triangle", baseFrequency: 225, endFrequency: 122, lowpassHz: 480, peak: 0.22, durationMs: 42 },
    scuff: { noiseColor: "grit", filterType: "highpass", fromHz: 1750, toHz: 1200, filterQ: 0.85, startOffsetMs: 20, durationMs: 44, peak: 0.32 },
    sprintPushHz: 320,
    sprintPushEndHz: 185,
    sprintPushLowpassHz: 680,
  },
  // 잔디: 핑크 노이즈 토양 쿠션 착지 + 나직한 흙 울림 + 산뜻한 풀잎 스침.
  grass: {
    durationMs: 78,
    filterType: "bandpass",
    baseFrequency: 1080,
    soleRollFrequency: 620,
    filterQ: 0.78,
    noiseColor: "pink",
    noisePeak: 0.64,
    soleRoll: { delayMs: 24, peakRatio: 0.68, durationMs: 46 },
    tone: { wave: "triangle", baseFrequency: 165, endFrequency: 92, lowpassHz: 340, peak: 0.14, durationMs: 36 },
    scuff: { noiseColor: "pink", filterType: "bandpass", fromHz: 2450, toHz: 1580, filterQ: 0.9, startOffsetMs: 18, durationMs: 48, peak: 0.34 },
    sprintPushHz: 240,
    sprintPushEndHz: 140,
    sprintPushLowpassHz: 520,
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
  const durationMs = sprinting ? Math.max(28, Math.round(base.durationMs * 0.78)) : base.durationMs;
  const noisePeak = sprinting ? Math.min(1, Number((base.noisePeak * 1.15).toFixed(3))) : base.noisePeak;
  const soleRoll = Object.freeze({
    delayMs: sprinting ? Math.max(11, Math.round(base.soleRoll.delayMs * 0.65)) : base.soleRoll.delayMs,
    peakRatio: sprinting ? Math.min(0.85, Number((base.soleRoll.peakRatio * 1.08).toFixed(3))) : base.soleRoll.peakRatio,
    durationMs: sprinting ? Math.max(20, Math.round(base.soleRoll.durationMs * 0.72)) : base.soleRoll.durationMs,
  });

  const primaryTone = base.tone
    ? Object.freeze({
      wave: base.tone.wave,
      frequency: Math.round(base.tone.baseFrequency * factor * (sprinting ? 1.16 : 1)),
      endFrequency: Math.round(base.tone.endFrequency * factor * (sprinting ? 1.14 : 1)),
      lowpassHz: Math.round(base.tone.lowpassHz * (sprinting ? 1.12 : 1)),
      peak: sprinting ? Math.min(0.48, Number((base.tone.peak * 1.18).toFixed(3))) : base.tone.peak,
      durationMs: sprinting ? Math.max(18, Math.round(base.tone.durationMs * 0.78)) : base.tone.durationMs,
    })
    : null;

  const secondaryTone = sprinting
    ? Object.freeze({
      wave: (base.tone?.wave ?? "triangle") as "sine" | "triangle",
      frequency: Math.round(base.sprintPushHz * factor),
      endFrequency: Math.round(base.sprintPushEndHz * factor),
      lowpassHz: base.sprintPushLowpassHz,
      peak: base.tone ? Math.min(0.32, Number((base.tone.peak * 0.82).toFixed(3))) : 0.14,
      startOffsetMs: 15,
      durationMs: 26,
    })
    : null;

  const scuffNoise: StudioSfxNoiseStep | null = sprinting
    ? null
    : Object.freeze({
      noiseColor: base.scuff.noiseColor,
      filterType: base.scuff.filterType,
      fromHz: Math.round(base.scuff.fromHz * factor),
      toHz: Math.round(base.scuff.toHz * factor),
      filterQ: base.scuff.filterQ,
      startOffsetMs: base.scuff.startOffsetMs,
      durationMs: base.scuff.durationMs,
      peak: base.scuff.peak,
    });

  const frictionNoise: StudioSfxNoiseStep | null = sprinting
    ? Object.freeze({
      noiseColor: base.scuff.noiseColor,
      filterType: "bandpass" as const,
      fromHz: Math.min(5400, Math.round(base.scuff.fromHz * 1.24 * factor)),
      toHz: Math.max(300, Math.round(base.scuff.toHz * 1.05 * factor)),
      filterQ: 1.25,
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
    heelToSoleHz: Math.round(base.soleRollFrequency * factor * speedFreqScale),
    noiseColor: base.noiseColor,
    noisePeak,
    soleRoll,
    tone: primaryTone,
    secondaryTone,
    scuffNoise,
    frictionNoise,
  });
}
