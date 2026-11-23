/**
 * 숏폼 MP4 익스포터 정적 프리셋·감정 오디오 프로파일·데모 웹툰 컷 카탈로그.
 *
 * `shorts-timeline-compiler.ts`와 `ShortsMp4ExporterPanel.tsx`가 공유하는 불변 상수 정의를 모은다.
 */

export type ShortsAspectRatio = "9:16" | "1:1" | "16:9";
export type ShortsFps = 30 | 60;
export type ShortsCutEmotion = "calm" | "tension" | "joy" | "impact" | "melancholy";
export type ShortsCameraEasing = "ease-out-cubic" | "ease-in-out-sine" | "ease-out-expo" | "linear";
export type ShortsCameraMotion =
  | "ken-burns-in"
  | "ken-burns-out"
  | "vertical-pan"
  | "horizontal-pan"
  | "dramatic-push";
export type ShortsSfxStyle = "chime" | "heartbeat" | "sparkle" | "impact-hit" | "soft-bell";

export interface ShortsFormatSpec {
  readonly aspectRatio: ShortsAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly safeTopRatio: number;
  readonly safeBottomRatio: number;
}

export const SHORTS_FORMAT_SPECS: Readonly<Record<ShortsAspectRatio, ShortsFormatSpec>> = Object.freeze({
  "9:16": {
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    labelKo: "9:16 릴스·쇼츠",
    labelEn: "9:16 Reels & Shorts",
    safeTopRatio: 0.12,
    safeBottomRatio: 0.18,
  },
  "1:1": {
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
    labelKo: "1:1 피드 정사각",
    labelEn: "1:1 Square Feed",
    safeTopRatio: 0.08,
    safeBottomRatio: 0.12,
  },
  "16:9": {
    aspectRatio: "16:9",
    width: 1920,
    height: 1080,
    labelKo: "16:9 와이드",
    labelEn: "16:9 Widescreen",
    safeTopRatio: 0.08,
    safeBottomRatio: 0.12,
  },
});

export interface ShortsEmotionAudioProfile {
  readonly emotion: ShortsCutEmotion;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly defaultMotion: ShortsCameraMotion;
  readonly defaultEasing: ShortsCameraEasing;
  readonly chordHz: readonly [number, number, number];
  readonly sfxPulseHz: number;
  readonly sfxStyle: ShortsSfxStyle;
  readonly sfxLabelKo: string;
  readonly sfxLabelEn: string;
  readonly bgmGain: number;
  readonly sfxGain: number;
}

export const SHORTS_EMOTION_PROFILES: Readonly<Record<ShortsCutEmotion, ShortsEmotionAudioProfile>> =
  Object.freeze({
    calm: {
      emotion: "calm",
      labelKo: "잔잔함",
      labelEn: "Calm",
      defaultMotion: "ken-burns-in",
      defaultEasing: "ease-in-out-sine",
      chordHz: [261.63, 329.63, 392.0],
      sfxPulseHz: 783.99,
      sfxStyle: "chime",
      sfxLabelKo: "바람 풍경 종",
      sfxLabelEn: "Soft Wind Chime",
      bgmGain: 0.18,
      sfxGain: 0.24,
    },
    tension: {
      emotion: "tension",
      labelKo: "긴장감",
      labelEn: "Tension",
      defaultMotion: "vertical-pan",
      defaultEasing: "ease-out-cubic",
      chordHz: [220.0, 261.63, 311.13],
      sfxPulseHz: 96.0,
      sfxStyle: "heartbeat",
      sfxLabelKo: "심박 펄스",
      sfxLabelEn: "Heartbeat Pulse",
      bgmGain: 0.2,
      sfxGain: 0.34,
    },
    joy: {
      emotion: "joy",
      labelKo: "설렘·기쁨",
      labelEn: "Joy",
      defaultMotion: "horizontal-pan",
      defaultEasing: "ease-in-out-sine",
      chordHz: [293.66, 369.99, 440.0],
      sfxPulseHz: 1046.5,
      sfxStyle: "sparkle",
      sfxLabelKo: "반짝임 아르페지오",
      sfxLabelEn: "Sparkle Arpeggio",
      bgmGain: 0.19,
      sfxGain: 0.26,
    },
    impact: {
      emotion: "impact",
      labelKo: "반전·임팩트",
      labelEn: "Impact",
      defaultMotion: "dramatic-push",
      defaultEasing: "ease-out-expo",
      chordHz: [164.81, 246.94, 329.63],
      sfxPulseHz: 146.83,
      sfxStyle: "impact-hit",
      sfxLabelKo: "임팩트 붐",
      sfxLabelEn: "Impact Boom",
      bgmGain: 0.22,
      sfxGain: 0.42,
    },
    melancholy: {
      emotion: "melancholy",
      labelKo: "여운",
      labelEn: "Melancholy",
      defaultMotion: "ken-burns-out",
      defaultEasing: "ease-in-out-sine",
      chordHz: [246.94, 293.66, 369.99],
      sfxPulseHz: 587.33,
      sfxStyle: "soft-bell",
      sfxLabelKo: "엔딩 벨",
      sfxLabelEn: "Ending Bell",
      bgmGain: 0.17,
      sfxGain: 0.25,
    },
  });

export const SHORTS_CAMERA_MOTION_LABELS: Readonly<
  Record<ShortsCameraMotion, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  "ken-burns-in": { ko: "켄번즈 줌인", en: "Ken Burns Zoom-In" },
  "ken-burns-out": { ko: "켄번즈 줌아웃", en: "Ken Burns Zoom-Out" },
  "vertical-pan": { ko: "세로 컷 패닝", en: "Vertical Scroll Pan" },
  "horizontal-pan": { ko: "가로 시선 팬", en: "Horizontal Pan" },
  "dramatic-push": { ko: "강조 푸시 줌", en: "Dramatic Push" },
});

export interface ShortsWebtoonCutInput {
  readonly cutId: string;
  readonly width: number;
  readonly height: number;
  readonly dialogue?: string;
  readonly dialogueEn?: string;
  readonly emotion: ShortsCutEmotion;
  readonly durationSec: number;
  readonly titleKo?: string;
  readonly titleEn?: string;
  readonly cameraMotion?: ShortsCameraMotion;
  readonly easing?: ShortsCameraEasing;
  readonly focalX?: number;
  readonly focalY?: number;
}

export const DEFAULT_SHORTS_DEMO_CUTS: readonly ShortsWebtoonCutInput[] = Object.freeze([
  {
    cutId: "cut-01",
    width: 800,
    height: 2200,
    titleKo: "1컷 · 비 갠 옥상",
    titleEn: "Cut 1 · Rooftop After Rain",
    dialogue: "비 온 뒤 옥상, 처음 마주친 그 순간",
    dialogueEn: "On the rooftop after rain, the moment our eyes met.",
    emotion: "calm",
    durationSec: 3,
    cameraMotion: "vertical-pan",
    focalX: 0.5,
    focalY: 0.35,
  },
  {
    cutId: "cut-02",
    width: 800,
    height: 1800,
    titleKo: "2컷 · 시선 교차",
    titleEn: "Cut 2 · Locked Gaze",
    dialogue: "“여기서 다시 만날 줄은 몰랐어.”",
    dialogueEn: '"I never expected to see you here again."',
    emotion: "tension",
    durationSec: 3,
    cameraMotion: "ken-burns-in",
    focalX: 0.52,
    focalY: 0.42,
  },
  {
    cutId: "cut-03",
    width: 800,
    height: 2400,
    titleKo: "3컷 · 스케치북 반전",
    titleEn: "Cut 3 · Sketchbook Reveal",
    dialogue: "손에 쥔 스케치북 마지막 장이 펼쳐졌다!",
    dialogueEn: "The final page of the sketchbook snapped open!",
    emotion: "impact",
    durationSec: 3,
    cameraMotion: "dramatic-push",
    focalX: 0.5,
    focalY: 0.5,
  },
  {
    cutId: "cut-04",
    width: 800,
    height: 1600,
    titleKo: "4컷 · 노을 엔딩",
    titleEn: "Cut 4 · Sunset Epilogue",
    dialogue: "다음 화에서 계속",
    dialogueEn: "To be continued in the next episode.",
    emotion: "melancholy",
    durationSec: 3,
    cameraMotion: "ken-burns-out",
    focalX: 0.48,
    focalY: 0.46,
  },
]);
