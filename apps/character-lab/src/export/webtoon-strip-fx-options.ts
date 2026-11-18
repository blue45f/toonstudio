/** 컷별 다국어 식자·발화자·말풍선·효과음 옵션과 기본 배치 규칙. */
import type { WebtoonJaWritingMode, WebtoonManuscriptMoodId } from "./webtoon-strip-pacing-tategaki";
import type { SfxStampId } from "../contracts";

export const WEBTOON_DIALOGUE_LOCALES = ["ko", "en", "ja"] as const;
export type WebtoonDialogueLocale = (typeof WEBTOON_DIALOGUE_LOCALES)[number];

export const WEBTOON_DIALOGUE_LOCALE_LABELS: Readonly<Record<WebtoonDialogueLocale, string>> = Object.freeze({
  ko: "한국어 (KO · 표준 타원)",
  en: "English (EN · 와이드 가로형)",
  ja: "日本語 (JA · 세로 확장형)",
});

export type WebtoonStripFxLinesKind = "none" | "focus-radial" | "speed-diagonal" | "romance-sparkle";
export type WebtoonStripBubbleShape = "oval" | "shout-burst" | "monologue-box" | "whisper-dashed" | "none";
export type WebtoonStripBubbleFontScale = "sm" | "md" | "lg";
export type WebtoonSfxStampOption = "none" | SfxStampId;
export type WebtoonStripSpeakerTarget = "auto" | "protagonist" | "partner";

export type WebtoonStripDialogueLines = readonly [string, string, string, string];
export type WebtoonStripBubbleShapes = readonly [
  WebtoonStripBubbleShape,
  WebtoonStripBubbleShape,
  WebtoonStripBubbleShape,
  WebtoonStripBubbleShape,
];
export type WebtoonStripBubbleFontScales = readonly [
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleFontScale,
];
export type WebtoonStripSfxStamps = readonly [
  WebtoonSfxStampOption,
  WebtoonSfxStampOption,
  WebtoonSfxStampOption,
  WebtoonSfxStampOption,
];
export type WebtoonStripSpeakerTargets = readonly [
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTarget,
];

export const DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES: WebtoonStripDialogueLines = Object.freeze([
  "여기서부터는 내 구역이야.",
  "기다리고 있었어, 그 말.",
  "지금 이 순간을 전부 기억해.",
  "끝까지 함께 가자.",
]) as WebtoonStripDialogueLines;

export const DEFAULT_WEBTOON_STRIP_DIALOGUE_BY_LOCALE: Readonly<Record<WebtoonDialogueLocale, WebtoonStripDialogueLines>> = Object.freeze({
  ko: DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  en: Object.freeze([
    "From here on, this is my turf.",
    "I was waiting to hear you say that.",
    "Remember every second of this moment.",
    "Let's see this through together.",
  ]) as WebtoonStripDialogueLines,
  ja: Object.freeze([
    "ここからは私の領域よ。",
    "その言葉をずっと待っていた。",
    "この瞬間をすべて刻み込んで。",
    "最後まで一緒に行こう。",
  ]) as WebtoonStripDialogueLines,
});

export const DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES: WebtoonStripBubbleShapes = Object.freeze([
  "oval",
  "oval",
  "shout-burst",
  "oval",
]) as WebtoonStripBubbleShapes;

export const DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES: WebtoonStripBubbleFontScales = Object.freeze([
  "md",
  "md",
  "lg",
  "md",
]) as WebtoonStripBubbleFontScales;

export const DEFAULT_WEBTOON_STRIP_SFX_STAMPS: WebtoonStripSfxStamps = Object.freeze([
  "none",
  "none",
  "none",
  "none",
]) as WebtoonStripSfxStamps;

export const DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS: WebtoonStripSpeakerTargets = Object.freeze([
  "auto",
  "auto",
  "auto",
  "auto",
]) as WebtoonStripSpeakerTargets;

export const WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO: Readonly<Record<WebtoonStripBubbleShape, string>> = Object.freeze({
  oval: "일반 타원",
  "shout-burst": "외침 가시",
  "monologue-box": "독백 박스",
  "whisper-dashed": "속삭임 점선",
  none: "말풍선 숨김",
});

export const WEBTOON_STRIP_FONT_SCALE_LABELS_KO: Readonly<Record<WebtoonStripBubbleFontScale, string>> = Object.freeze({
  sm: "소형 (속삭임)",
  md: "표준",
  lg: "강조 (클라이맥스)",
});

export const WEBTOON_STRIP_SPEAKER_LABELS_KO: Readonly<Record<WebtoonStripSpeakerTarget, string>> = Object.freeze({
  auto: "자동 교차",
  protagonist: "주연 발화",
  partner: "상대역 발화",
});

export interface LocalizedSfxStampSpec {
  readonly glyphKo: string;
  readonly glyphEn: string;
  readonly glyphJa: string;
  readonly tiltDeg: number;
  readonly accentRgb: readonly [number, number, number];
  readonly inkRgb: readonly [number, number, number];
}

export const WEBTOON_SFX_STAMP_KO_TEXT: Readonly<Record<SfxStampId, LocalizedSfxStampSpec>> = Object.freeze({
  seureung: { glyphKo: "스릉", glyphEn: "SHING", glyphJa: "スッ", tiltDeg: -11, accentRgb: [92, 232, 242], inkRgb: [18, 22, 34] },
  dugeun: { glyphKo: "두근", glyphEn: "THUMP", glyphJa: "ドキッ", tiltDeg: 8, accentRgb: [244, 134, 168], inkRgb: [42, 18, 28] },
  kugugung: { glyphKo: "쿠구궁", glyphEn: "RUMBLE", glyphJa: "ゴゴゴ", tiltDeg: -7, accentRgb: [240, 184, 86], inkRgb: [24, 19, 18] },
  pat: { glyphKo: "팟", glyphEn: "FLASH", glyphJa: "パッ", tiltDeg: 10, accentRgb: [255, 224, 118], inkRgb: [24, 21, 28] },
  ssaa: { glyphKo: "싸아", glyphEn: "SHHH", glyphJa: "ザァァ", tiltDeg: -6, accentRgb: [147, 197, 253], inkRgb: [20, 28, 42] },
  beonjjeok: { glyphKo: "번쩍", glyphEn: "ZAP", glyphJa: "ビカッ", tiltDeg: 12, accentRgb: [250, 204, 21], inkRgb: [36, 18, 54] },
});

export function resolveSfxGlyphByLocale(stamp: SfxStampId, locale: WebtoonDialogueLocale = "ko"): string {
  const spec = WEBTOON_SFX_STAMP_KO_TEXT[stamp];
  if (locale === "en") return spec.glyphEn;
  if (locale === "ja") return spec.glyphJa;
  return spec.glyphKo;
}

export interface LocalizedBubbleAspect {
  readonly scaleX: number;
  readonly scaleY: number;
}

/** 다국어(KO/EN/JA) 및 일본어 세로쓰기(Tategaki) 식자 특성과 글자 길이에 맞춰 말풍선 가로·세로 반경 배율을 자동 산출한다. */
export function resolveLocalizedBubbleAspect(
  locale: WebtoonDialogueLocale = "ko",
  dialogueText?: string,
  jaWritingMode: WebtoonJaWritingMode = "horizontal",
): LocalizedBubbleAspect {
  const len = (dialogueText ?? "").trim().length;
  if (locale === "en") {
    const extraW = len > 24 ? Math.min(0.1, (len - 24) * 0.005) : 0;
    return { scaleX: Number((1.18 + extraW).toFixed(3)), scaleY: 0.94 };
  }
  if (locale === "ja") {
    if (jaWritingMode === "vertical-tategaki") {
      const extraTategakiH = len > 12 ? Math.min(0.12, (len - 12) * 0.006) : 0;
      return { scaleX: 0.78, scaleY: Number((1.28 + extraTategakiH).toFixed(3)) };
    }
    const extraH = len > 14 ? Math.min(0.1, (len - 14) * 0.006) : 0;
    return { scaleX: 0.86, scaleY: Number((1.18 + extraH).toFixed(3)) };
  }
  const extraKoW = len > 18 ? Math.min(0.08, (len - 18) * 0.004) : 0;
  return { scaleX: Number((1 + extraKoW).toFixed(3)), scaleY: 1 };
}

export interface SpeakerBubblePlacement {
  readonly placeRight: boolean;
  readonly centerXRatio: number;
  /** null이면 기본 교차 내측 꼬리, 숫자(0..1)면 해당 수평 비율의 발화자 머리 위치를 향해 꼬리를 조준 */
  readonly tailTargetXRatio: number | null;
}

export function resolveSpeakerBubblePlacement(
  cutIndex: number,
  speakerTarget: WebtoonStripSpeakerTarget = "auto",
  partnerSide: "left" | "right" = "right",
): SpeakerBubblePlacement {
  if (speakerTarget === "protagonist") {
    const placeRight = partnerSide === "left";
    return {
      placeRight,
      centerXRatio: placeRight ? 0.68 : 0.32,
      tailTargetXRatio: placeRight ? 0.54 : 0.46,
    };
  }
  if (speakerTarget === "partner") {
    const placeRight = partnerSide === "right";
    return {
      placeRight,
      centerXRatio: placeRight ? 0.72 : 0.28,
      tailTargetXRatio: placeRight ? 0.8 : 0.2,
    };
  }
  const placeRight = cutIndex % 2 === 1;
  return {
    placeRight,
    centerXRatio: placeRight ? 0.72 : 0.28,
    tailTargetXRatio: null,
  };
}

export interface WebtoonStripMangaFxOptions {
  readonly enabled: boolean;
  readonly linesKind?: WebtoonStripFxLinesKind;
  readonly includeSpeechBubbles?: boolean;
  readonly intensity?: number;
  /** 다국어 식자 및 말풍선 가로세로 비율 로컬라이징 모드(기본 `ko`) */
  readonly locale?: WebtoonDialogueLocale;
  /** 일본어(`ja`) 선택 시 가로쓰기(`horizontal`) vs 단행본 세로쓰기(`vertical-tategaki`) */
  readonly jaWritingMode?: WebtoonJaWritingMode;
  /** 시간대별 원고 배경 및 캐릭터 림라이트 색온도 무드(기본 `daylight-paper`) */
  readonly manuscriptMood?: WebtoonManuscriptMoodId;
  /** 1~4컷 말풍선 내부에 직접 래스터 식자(타이포그래피 합성)할 대사 4줄 */
  readonly dialogueLines?: WebtoonStripDialogueLines;
  /** 1~4컷 개별 말풍선 모양(미지정 시 4컷 모두 기본 타원 `oval`) */
  readonly bubbleShapes?: WebtoonStripBubbleShapes;
  /** 1~4컷 개별 대사 폰트 강조 배율(미지정 시 `md`) */
  readonly bubbleFontScales?: WebtoonStripBubbleFontScales;
  /** 1~4컷 개별 오노마토페 효과음 스탬프(미지정 시 `none`) */
  readonly sfxStamps?: WebtoonStripSfxStamps;
  /** 1~4컷 발화자 지정(주연 발화·상대역 발화·자동 교차) */
  readonly speakerTargets?: WebtoonStripSpeakerTargets;
  /** 3D 듀오 상대역 배치 방향(기본 `right`) — 발화자별 말풍선 위치와 꼬리 방향 결정에 사용 */
  readonly partnerSide?: "left" | "right";
}
