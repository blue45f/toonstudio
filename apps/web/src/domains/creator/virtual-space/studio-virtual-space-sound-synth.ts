/**
 * 가상 스튜디오 효과음 합성 레시피 (순수 데이터).
 *
 * 음원 파일을 추가하지 않고 WebAudio 오실레이터·노이즈로 만드는 짧은 소리들의
 * 파라미터 표다. 발소리는 표면(카펫/나무/타일)별 필터·톤 조합으로 음색을 나누고,
 * 상호작용 SFX는 이벤트당 하나의 절제된 톤 패턴만 쓴다.
 * 실제 재생(노드 그래프·게인·스로틀)은 studio-virtual-space-sound-engine.ts가 담당한다.
 */
import type { StudioFootstepFoot, StudioFootstepSurface } from "./studio-virtual-space-footsteps";

/** 상호작용 효과음 종류. 이벤트 하나에 소리 하나가 원칙이다. */
export type StudioSfxKind = "activate" | "peer-join" | "peer-leave" | "emote";

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

export interface StudioSfxSpec {
  readonly steps: readonly StudioSfxToneStep[];
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
  // 이모트: 아래로 떨어지는 짧은 팝 하나.
  emote: {
    throttleMs: 150,
    steps: [
      { wave: "sine", fromHz: 880, toHz: 660, startOffsetMs: 0, durationMs: 70, peak: 0.35 },
    ],
  },
};

export function studioSfxSpec(kind: StudioSfxKind): StudioSfxSpec {
  return SFX_SPECS[kind];
}

/** 발소리 합성 레시피. 노이즈 버스트(필터) + 표면에 따라 짧은 톤(노크/클릭)을 겹친다. */
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
}

const FOOTSTEP_SPECS: Record<StudioFootstepSurface, StudioFootstepSynthBase> = {
  // 카펫: 낮은 저역만 남긴 뭉툭한 소리. 톤은 없다.
  carpet: { durationMs: 55, filterType: "lowpass", baseFrequency: 480, filterQ: 0.7, noisePeak: 0.55, tone: null },
  // 나무: 중간 대역 노이즈에 낮은 노크를 겹친다.
  wood: {
    durationMs: 75, filterType: "bandpass", baseFrequency: 820, filterQ: 1.1, noisePeak: 0.7,
    tone: { wave: "triangle", baseFrequency: 150, peak: 0.3, durationMs: 55 },
  },
  // 타일: 높은 대역의 맑은 클릭.
  tile: {
    durationMs: 45, filterType: "bandpass", baseFrequency: 2500, filterQ: 1.6, noisePeak: 0.75,
    tone: { wave: "sine", baseFrequency: 1900, peak: 0.14, durationMs: 25 },
  },
};

export function studioFootstepSynthSpec(surface: StudioFootstepSurface, foot: StudioFootstepFoot): StudioFootstepSynthSpec {
  const base = FOOTSTEP_SPECS[surface];
  const factor = FOOT_FREQUENCY_FACTOR[foot];
  return Object.freeze({
    durationMs: base.durationMs,
    filterType: base.filterType,
    filterFrequency: Math.round(base.baseFrequency * factor),
    filterQ: base.filterQ,
    noisePeak: base.noisePeak,
    tone: base.tone
      ? Object.freeze({
        wave: base.tone.wave,
        frequency: Math.round(base.tone.baseFrequency * factor),
        peak: base.tone.peak,
        durationMs: base.tone.durationMs,
      })
      : null,
  });
}
