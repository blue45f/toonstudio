/**
 * 한국형·글로벌(KO/EN/JA) 세로 스크롤 웹툰 4컷 콘티 스트립 합성 모듈:
 * - 다국어(한국어·영어·일본어) 로컬라이징 모드에 따른 말풍선 가로세로 종횡비(rx·ry) 자동 스케일링 및 언어별 줄바꿈·폰트 스택·효과음 번역
 * - 1~4컷 개별 카메라 구도(로우·하이·와이드 투샷) 및 더치 틸트(Dutch Tilt ±9° 쌍선형 알파 보간 회전) 디렉터
 * - 발화자(주연·상대역·자동 교차)별 말풍선 좌우 배치 및 꼬리 자동 조준
 * - 1~4컷 개별 말풍선 도형(타원·외침 가시·독백 박스·속삭임 점선·숨김), 식자 폰트 배율, 오노마토페 효과음 스탬프(6종)
 * - 레이어 PSD 만화 연출 투명 분리 레이어 빌더 및 4컷 연기 키프레임 스냅샷 시퀀스
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure } from "../contracts";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";
import { buildActingCutPlan, findWebtoonStripActingArc } from "./webtoon-strip-acting";

import type { ExportDeps, ExportOutcome } from "./export-session";
import type { WebtoonStripActingArcId } from "./webtoon-strip-acting";
import type {
  ApplyPlan,
  CameraFramingMode,
  CapturedRaster,
  CharacterEngine,
  LabFailure,
  SfxStampId,
} from "../contracts";

export {
  WEBTOON_STRIP_ACTING_ARCS,
  buildActingCutPlan,
  findWebtoonStripActingArc,
} from "./webtoon-strip-acting";
export type {
  WebtoonStripActingArcId,
  WebtoonStripActingArcSpec,
  WebtoonStripCutActingKeyframe,
} from "./webtoon-strip-acting";

export interface WebtoonStripCutSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly mode: Exclude<CameraFramingMode, "custom">;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly distanceScale: number;
  readonly dutchTiltDeg?: number;
}

export const WEBTOON_VERTICAL_STRIP_CUTS: readonly WebtoonStripCutSpec[] = Object.freeze([
  { id: "intro-low", labelKo: "1컷 · 등장 전신 로우앵글", mode: "full-body", yawDeg: 0, pitchDeg: -14, distanceScale: 1, dutchTiltDeg: 0 },
  { id: "dialogue-side", labelKo: "2컷 · 대화 상반신 반측면", mode: "bust", yawDeg: 28, pitchDeg: 0, distanceScale: 1, dutchTiltDeg: 0 },
  { id: "emotion-face", labelKo: "3컷 · 감정 클로즈업 정면", mode: "face", yawDeg: -10, pitchDeg: 0, distanceScale: 1, dutchTiltDeg: 0 },
  { id: "linger-high", labelKo: "4컷 · 여운 상반신 하이앵글", mode: "bust", yawDeg: -26, pitchDeg: 18, distanceScale: 1, dutchTiltDeg: 0 },
]);

export type WebtoonStripCutCameraPresetId =
  | "default"
  | "low-full"
  | "side-bust"
  | "front-face"
  | "high-bust"
  | "dutch-left-bust"
  | "dutch-right-face"
  | "duo-wide";

export interface WebtoonCutCameraPresetSpec {
  readonly id: WebtoonStripCutCameraPresetId;
  readonly labelKo: string;
  readonly mode?: Exclude<CameraFramingMode, "custom">;
  readonly yawDeg?: number;
  readonly pitchDeg?: number;
  readonly distanceScale?: number;
  readonly dutchTiltDeg: number;
}

export const WEBTOON_CUT_CAMERA_PRESETS: Readonly<Record<WebtoonStripCutCameraPresetId, WebtoonCutCameraPresetSpec>> = Object.freeze({
  default: { id: "default", labelKo: "컷 기본 앵글", dutchTiltDeg: 0 },
  "low-full": { id: "low-full", labelKo: "전신 로우앵글 (-16°)", mode: "full-body", yawDeg: 0, pitchDeg: -16, distanceScale: 1, dutchTiltDeg: 0 },
  "side-bust": { id: "side-bust", labelKo: "대화 반측면 (28°)", mode: "bust", yawDeg: 28, pitchDeg: 0, distanceScale: 1, dutchTiltDeg: 0 },
  "front-face": { id: "front-face", labelKo: "감정 클로즈업 (정면)", mode: "face", yawDeg: -8, pitchDeg: 0, distanceScale: 0.96, dutchTiltDeg: 0 },
  "high-bust": { id: "high-bust", labelKo: "여운 하이앵글 (+20°)", mode: "bust", yawDeg: -24, pitchDeg: 20, distanceScale: 1.04, dutchTiltDeg: 0 },
  "dutch-left-bust": { id: "dutch-left-bust", labelKo: "스릴러 더치 틸트 (-9°)", mode: "bust", yawDeg: 18, pitchDeg: -8, distanceScale: 0.96, dutchTiltDeg: -9 },
  "dutch-right-face": { id: "dutch-right-face", labelKo: "역동 더치 클로즈업 (+9°)", mode: "face", yawDeg: -14, pitchDeg: -6, distanceScale: 0.94, dutchTiltDeg: 9 },
  "duo-wide": { id: "duo-wide", labelKo: "투샷 와이드 대치 (1.25×)", mode: "full-body", yawDeg: 12, pitchDeg: -6, distanceScale: 1.25, dutchTiltDeg: 0 },
});

export type WebtoonStripCutCameraPresets = readonly [
  WebtoonStripCutCameraPresetId,
  WebtoonStripCutCameraPresetId,
  WebtoonStripCutCameraPresetId,
  WebtoonStripCutCameraPresetId,
];

export const DEFAULT_WEBTOON_STRIP_CUT_CAMERA_PRESETS: WebtoonStripCutCameraPresets = Object.freeze([
  "default",
  "default",
  "default",
  "default",
]) as WebtoonStripCutCameraPresets;

export function resolveWebtoonCutCameraSpec(cutIndex: number, presetId: WebtoonStripCutCameraPresetId = "default"): WebtoonStripCutSpec {
  const base = WEBTOON_VERTICAL_STRIP_CUTS[cutIndex] ?? WEBTOON_VERTICAL_STRIP_CUTS[0]!;
  if (presetId === "default") return base;
  const preset = WEBTOON_CUT_CAMERA_PRESETS[presetId] ?? WEBTOON_CUT_CAMERA_PRESETS.default;
  return {
    id: `${base.id}-${preset.id}`,
    labelKo: `${cutIndex + 1}컷 · ${preset.labelKo}`,
    mode: preset.mode ?? base.mode,
    yawDeg: preset.yawDeg ?? base.yawDeg,
    pitchDeg: preset.pitchDeg ?? base.pitchDeg,
    distanceScale: preset.distanceScale ?? base.distanceScale,
    dutchTiltDeg: preset.dutchTiltDeg,
  };
}

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

/** 다국어(KO/EN/JA) 식자 특성과 글자 길이에 맞춰 말풍선 가로·세로 반경 배율을 자동 산출한다. */
export function resolveLocalizedBubbleAspect(
  locale: WebtoonDialogueLocale = "ko",
  dialogueText?: string,
): LocalizedBubbleAspect {
  const len = (dialogueText ?? "").trim().length;
  if (locale === "en") {
    const extraW = len > 24 ? Math.min(0.1, (len - 24) * 0.005) : 0;
    return { scaleX: Number((1.18 + extraW).toFixed(3)), scaleY: 0.94 };
  }
  if (locale === "ja") {
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

export interface WebtoonStripLayout {
  readonly stripWidth: number;
  readonly stripHeight: number;
  readonly cutWidth: number;
  readonly cutHeight: number;
  readonly marginX: number;
  readonly marginY: number;
  readonly gutterY: number;
  readonly borderPx: number;
  readonly bubbleSafeTopPx: number;
}

export interface ExportWebtoonVerticalStripOptions {
  /** 요청 원고 가로 폭(px, 기본 800px · 최대 1024px) */
  readonly stripWidth: number;
  /** 각 컷 상단에 말풍선 배치용 안전 여백을 확보할지 여부(기본 true) */
  readonly includeBubbleSafeZone?: boolean;
  /** 말풍선 풍선 프레임과 집중선·속도선·반짝이·효과음 스탬프를 PNG 래스터에 직접 베이킹할지 여부(선택) */
  readonly mangaFx?: WebtoonStripMangaFxOptions;
  /** 1~4컷 개별 카메라 구도 및 더치 틸트 프리셋(선택, 미지정 시 기본 4컷 구도) */
  readonly cutCameraPresets?: WebtoonStripCutCameraPresets;
  /** 1~4컷마다 서로 다른 표정·시선·고개 연기가 이어지는 4컷 서사 키프레임 옵션(선택, 캡처 후 basePlan 자동 복원) */
  readonly actingArc?: {
    readonly arcId: Exclude<WebtoonStripActingArcId, "none">;
    readonly basePlan: ApplyPlan;
  };
  readonly settleSteps?: number;
  readonly onProgress?: (stepIndex: number, totalSteps: number, labelKo: string) => void;
}

const defaultNow = (): number => Date.now();
const MAX_STRIP_WIDTH = 1024;

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

function deterministicHash01(index: number, seed: number): number {
  const raw = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

/** 더치 틸트(Dutch Angle) 연출을 위해 투명 배경 RGBA 패널을 중심 기준으로 쌍선형(bilinear) 회전한다. */
export function rotateRasterBilinear(
  source: CapturedRaster,
  angleDeg: number,
  zoomScale = 1.06,
): CapturedRaster {
  if (!Number.isFinite(angleDeg) || Math.abs(angleDeg) < 0.05) return source;
  const { width, height } = source;
  const out = new Uint8ClampedArray(width * height * 4);
  const rad = (-angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad) / Math.max(0.5, zoomScale);
  const sinA = Math.sin(rad) / Math.max(0.5, zoomScale);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const src = source.rgba;

  for (let y = 0; y < height; y += 1) {
    const dy = y - cy;
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const sx = cx + dx * cosA - dy * sinA;
      const sy = cy + dx * sinA + dy * cosA;
      if (sx < 0 || sx > width - 1 || sy < 0 || sy > height - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;

      const a00 = (src[i00 + 3] ?? 0) * w00;
      const a10 = (src[i10 + 3] ?? 0) * w10;
      const a01 = (src[i01 + 3] ?? 0) * w01;
      const a11 = (src[i11 + 3] ?? 0) * w11;
      const aSum = a00 + a10 + a01 + a11;
      if (aSum <= 0.5) continue;

      const dst = (y * width + x) * 4;
      out[dst] = Math.round(((src[i00] ?? 0) * a00 + (src[i10] ?? 0) * a10 + (src[i01] ?? 0) * a01 + (src[i11] ?? 0) * a11) / aSum);
      out[dst + 1] = Math.round(((src[i00 + 1] ?? 0) * a00 + (src[i10 + 1] ?? 0) * a10 + (src[i01 + 1] ?? 0) * a01 + (src[i11 + 1] ?? 0) * a11) / aSum);
      out[dst + 2] = Math.round(((src[i00 + 2] ?? 0) * a00 + (src[i10 + 2] ?? 0) * a10 + (src[i01 + 2] ?? 0) * a01 + (src[i11 + 2] ?? 0) * a11) / aSum);
      out[dst + 3] = Math.round(aSum);
    }
  }
  return { width, height, rgba: out };
}

export function clampWebtoonStripLayout(requestedWidth: number, includeBubbleSafeZone = true): WebtoonStripLayout {
  const cutCount = WEBTOON_VERTICAL_STRIP_CUTS.length;
  const safeStripW = Number.isFinite(requestedWidth)
    ? Math.min(MAX_STRIP_WIDTH, Math.max(MIN_EXPORT_DIMENSION + 8, Math.floor(requestedWidth)))
    : 800;

  const borderPx = Math.max(1, Math.round(safeStripW * 0.00375));
  const maxMarginX = Math.max(1, Math.floor((safeStripW - MIN_EXPORT_DIMENSION - borderPx * 2) / 2));
  const marginX = Math.min(maxMarginX, Math.max(2, Math.round(safeStripW * 0.046)));
  const cutWidth = Math.max(MIN_EXPORT_DIMENSION, safeStripW - (marginX + borderPx) * 2);

  const marginY = Math.max(2, Math.round(safeStripW * 0.038));
  const gutterY = Math.max(4, Math.round(safeStripW * 0.065));
  const bubbleSafeTopPx = includeBubbleSafeZone ? Math.max(4, Math.round(safeStripW * 0.052)) : 0;

  const fixedVerticalOverhead = marginY * 2 + gutterY * (cutCount - 1) + cutCount * (borderPx * 2 + bubbleSafeTopPx);
  const maxCutHeight = Math.floor((MAX_PNG_EXPORT_DIMENSION - fixedVerticalOverhead) / cutCount);
  const idealCutHeight = Math.round(cutWidth * 1.12);
  const cutHeight = Math.max(MIN_EXPORT_DIMENSION, Math.min(maxCutHeight, idealCutHeight));
  const stripHeight = fixedVerticalOverhead + cutCount * cutHeight;

  return {
    stripWidth: safeStripW,
    stripHeight,
    cutWidth,
    cutHeight,
    marginX,
    marginY,
    gutterY,
    borderPx,
    bubbleSafeTopPx,
  };
}

function blendPixelRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  x: number,
  y: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
  r: number,
  g: number,
  b: number,
  alpha01: number,
): void {
  if (x < clipX0 || x >= clipX1 || y < clipY0 || y >= clipY1 || alpha01 <= 0) return;
  const a = alpha01 >= 1 ? 1 : alpha01;
  const dst = (y * canvasWidth + x) * 4;
  const dstAlphaByte = rgba[dst + 3] ?? 0;
  if (dstAlphaByte === 255) {
    const inv = 1 - a;
    rgba[dst] = Math.round(r * a + (rgba[dst] ?? 255) * inv);
    rgba[dst + 1] = Math.round(g * a + (rgba[dst + 1] ?? 255) * inv);
    rgba[dst + 2] = Math.round(b * a + (rgba[dst + 2] ?? 255) * inv);
    rgba[dst + 3] = 255;
    return;
  }
  const dstA = dstAlphaByte / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 0.0001) return;
  const dstWeight = dstA * (1 - a);
  rgba[dst] = Math.round((r * a + (rgba[dst] ?? 0) * dstWeight) / outA);
  rgba[dst + 1] = Math.round((g * a + (rgba[dst + 1] ?? 0) * dstWeight) / outA);
  rgba[dst + 2] = Math.round((b * a + (rgba[dst + 2] ?? 0) * dstWeight) / outA);
  rgba[dst + 3] = Math.round(outA * 255);
}

function drawClippedLineRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radiusPx: number,
  r: number,
  g: number,
  b: number,
  opacity01: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const steps = Math.ceil(len * 1.5);
  const pad = Math.ceil(radiusPx + 1);
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;
    const ix0 = Math.max(clipX0, Math.floor(cx - pad));
    const ix1 = Math.min(clipX1 - 1, Math.ceil(cx + pad));
    const iy0 = Math.max(clipY0, Math.floor(cy - pad));
    const iy1 = Math.min(clipY1 - 1, Math.ceil(cy + pad));
    for (let py = iy0; py <= iy1; py += 1) {
      for (let px = ix0; px <= ix1; px += 1) {
        const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        if (dist <= radiusPx + 0.75) {
          const cov = dist <= radiusPx - 0.35 ? 1 : Math.max(0, 1 - (dist - (radiusPx - 0.35)) / 1.1);
          blendPixelRgba(rgba, canvasWidth, px, py, clipX0, clipY0, clipX1, clipY1, r, g, b, cov * opacity01);
        }
      }
    }
  }
}

function bakePanelActionLines(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  kind: WebtoonStripFxLinesKind,
  intensity: number,
  cutIndex: number,
): void {
  if (kind === "none") return;
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const cx = innerX + innerWidth * 0.5;
  const cy = innerY + innerHeight * 0.46;
  const strokeScale = Math.max(0.55, innerWidth / 720);

  if (kind === "focus-radial") {
    const lineCount = Math.round(32 + intensity * 36);
    const minDim = Math.min(innerWidth, innerHeight);
    for (let i = 0; i < lineCount; i += 1) {
      const ang = (i / lineCount) * Math.PI * 2 + (deterministicHash01(i, cutIndex + 1.3) - 0.5) * 0.06;
      const rIn = minDim * (0.31 + deterministicHash01(i, cutIndex + 4.1) * 0.11);
      const rOut = Math.hypot(innerWidth, innerHeight) * 0.65;
      drawClippedLineRgba(
        rgba,
        canvasWidth,
        innerX,
        innerY,
        clipX1,
        clipY1,
        cx + Math.cos(ang) * rIn,
        cy + Math.sin(ang) * rIn,
        cx + Math.cos(ang) * rOut,
        cy + Math.sin(ang) * rOut,
        (0.65 + deterministicHash01(i, 7.7) * 0.95) * strokeScale,
        24,
        21,
        28,
        0.55 * intensity,
      );
    }
  } else if (kind === "speed-diagonal") {
    const lineCount = Math.round(22 + intensity * 26);
    const dirX = 0.88;
    const dirY = -0.475;
    const perpX = -dirY;
    const perpY = dirX;
    for (let i = 0; i < lineCount; i += 1) {
      const lane = ((i / Math.max(1, lineCount - 1)) - 0.5) * (innerWidth + innerHeight) * 0.62;
      const side = i % 2 === 0 ? -1 : 1;
      const startOff = side < 0 ? -innerWidth * 0.72 : innerWidth * (0.20 + deterministicHash01(i, 2.9) * 0.16);
      const segLen = innerWidth * (0.28 + deterministicHash01(i, 6.1) * 0.28);
      const bx = cx + perpX * lane;
      const by = cy + perpY * lane;
      drawClippedLineRgba(
        rgba,
        canvasWidth,
        innerX,
        innerY,
        clipX1,
        clipY1,
        bx + dirX * startOff,
        by + dirY * startOff,
        bx + dirX * (startOff + segLen),
        by + dirY * (startOff + segLen),
        (0.6 + deterministicHash01(i, 9.2) * 0.85) * strokeScale,
        24,
        21,
        28,
        0.52 * intensity,
      );
    }
  } else if (kind === "romance-sparkle") {
    const spots = [
      [0.16, 0.22, 0.036],
      [0.84, 0.20, 0.042],
      [0.14, 0.62, 0.030],
      [0.86, 0.58, 0.034],
    ] as const;
    for (const [ux, uy, ur] of spots) {
      const sx = innerX + innerWidth * ux;
      const sy = innerY + innerHeight * uy;
      const arm = Math.max(3, innerWidth * ur * (0.75 + intensity * 0.35));
      drawClippedLineRgba(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, sx - arm, sy, sx + arm, sy, 0.9 * strokeScale, 240, 201, 120, 0.88);
      drawClippedLineRgba(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, sx, sy - arm, sx, sy + arm, 0.9 * strokeScale, 240, 201, 120, 0.88);
    }
  }
}

export function splitLocalizedBubbleDialogue(
  rawText: string,
  locale: WebtoonDialogueLocale = "ko",
): readonly [string, string | null] {
  const cleaned = rawText.trim();
  if (!cleaned) return ["", null];

  if (locale === "en") {
    if (cleaned.length <= 20) return [cleaned, null];
    const mid = Math.ceil(cleaned.length / 2);
    const leftSpace = cleaned.lastIndexOf(" ", mid + 4);
    const rightSpace = cleaned.indexOf(" ", Math.max(0, mid - 4));
    const splitAt = leftSpace >= 5 ? leftSpace : rightSpace > 4 ? rightSpace : mid;
    return [cleaned.slice(0, splitAt).trim(), cleaned.slice(splitAt).trim()];
  }

  if (locale === "ja") {
    const chars = Array.from(cleaned);
    if (chars.length <= 10) return [cleaned, null];
    let mid = Math.ceil(chars.length / 2);
    const kinsoku = new Set(["。", "、", "！", "？", "…", "ー", "っ", "ゃ", "ゅ", "ょ"]);
    if (mid < chars.length - 1 && kinsoku.has(chars[mid] ?? "")) {
      mid += 1;
    }
    return [chars.slice(0, mid).join(""), chars.slice(mid).join("")];
  }

  if (cleaned.length <= 13) return [cleaned, null];
  const mid = Math.ceil(cleaned.length / 2);
  const spaceIdx = cleaned.lastIndexOf(" ", mid + 3);
  if (spaceIdx >= 3 && spaceIdx < cleaned.length - 2) {
    return [cleaned.slice(0, spaceIdx).trim(), cleaned.slice(spaceIdx + 1).trim()];
  }
  return [cleaned.slice(0, mid), cleaned.slice(mid)];
}

function resolveFontStackByLocale(locale: WebtoonDialogueLocale): string {
  if (locale === "en") return `"Inter", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  if (locale === "ja") return `"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif`;
  return `"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
}

function resolveFontScaleMultiplier(fontScale: WebtoonStripBubbleFontScale): { readonly mul: number; readonly weight: number } {
  if (fontScale === "sm") return { mul: 0.8, weight: 400 };
  if (fontScale === "lg") return { mul: 1.24, weight: 700 };
  return { mul: 1.0, weight: 600 };
}

function tryRasterizeDialogueCanvas2d(
  boxWidth: number,
  boxHeight: number,
  line1: string,
  line2: string | null,
  fontScale: WebtoonStripBubbleFontScale,
  locale: WebtoonDialogueLocale = "ko",
): { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray } | null {
  if (typeof document === "undefined" || boxWidth < 12 || boxHeight < 8) return null;
  try {
    const scale = 2;
    const w = Math.max(12, Math.floor(boxWidth * scale));
    const h = Math.max(8, Math.floor(boxHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    const { mul, weight } = resolveFontScaleMultiplier(fontScale);
    const maxChars = Math.max(line1.length, line2 ? line2.length : 0, 6);
    const charWidthRatio = locale === "en" ? 0.56 : 0.9;
    const fitByWidth = Math.floor((w * 0.86) / Math.max(4, maxChars * charWidthRatio));
    const fitByHeight = Math.floor(h * (line2 ? 0.3 : 0.44));
    const basePx = Math.min(fitByWidth, fitByHeight);
    const fontPx = Math.max(9, Math.min(Math.floor(h * (line2 ? 0.42 : 0.64)), Math.round(basePx * mul)));
    ctx.font = `${weight} ${fontPx}px ${resolveFontStackByLocale(locale)}`;
    ctx.fillStyle = "#18151C";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (line2) {
      const gap = Math.round(fontPx * 0.6);
      ctx.fillText(line1, w * 0.5, h * 0.5 - gap, w * 0.92);
      ctx.fillText(line2, w * 0.5, h * 0.5 + gap, w * 0.92);
    } else {
      ctx.fillText(line1, w * 0.5, h * 0.5, w * 0.92);
    }
    const img = ctx.getImageData(0, 0, w, h);
    let nonZeroAlpha = 0;
    for (let i = 3; i < img.data.length; i += 4) {
      if ((img.data[i] ?? 0) > 16) {
        nonZeroAlpha += 1;
        break;
      }
    }
    return nonZeroAlpha > 0 ? { width: w, height: h, data: img.data } : null;
  } catch {
    return null;
  }
}

function bakeDeterministicDialogueGlyphs(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  line1: string,
  line2: string | null,
  fontScale: WebtoonStripBubbleFontScale = "md",
  inkRgb: readonly [number, number, number] = [24, 21, 28],
): void {
  const { mul } = resolveFontScaleMultiplier(fontScale);
  const lines = line2 ? [line1, line2] : [line1];
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const baseCellW = Math.max(3, Math.min(Math.floor((rx * 1.48) / maxLen), Math.floor(ry * 0.52)));
  const cellW = Math.max(2, Math.min(Math.floor((rx * 1.82) / maxLen), Math.round(baseCellW * mul)));
  const cellH = Math.max(2, Math.round(cellW * 1.05));
  const stroke = Math.max(0.5, cellW * 0.11 * (fontScale === "lg" ? 1.25 : 1));
  const [ir, ig, ib] = inkRgb;

  lines.forEach((line, lineIdx) => {
    const chars = Array.from(line);
    const totalW = chars.length * cellW;
    const startX = cx - totalW * 0.5;
    const baseY = lines.length === 2 ? cy + (lineIdx === 0 ? -cellH * 0.68 : cellH * 0.68) : cy;

    chars.forEach((ch, idx) => {
      if (ch.trim() === "") return;
      const code = ch.codePointAt(0) ?? 46;
      const gx0 = startX + idx * cellW + cellW * 0.14;
      const gx1 = startX + (idx + 1) * cellW - cellW * 0.14;
      const gy0 = baseY - cellH * 0.42;
      const gy1 = baseY + cellH * 0.42;
      const gmx = (gx0 + gx1) * 0.5;
      const gmy = (gy0 + gy1) * 0.5;

      if (ch === "." || ch === "," || ch === "…" || ch === "。" || ch === "、") {
        blendPixelRgba(rgba, canvasWidth, Math.round(gmx), Math.round(gy1), clipX0, clipY0, clipX1, clipY1, ir, ig, ib, 0.92);
        return;
      }
      if (code >= 0xac00 && code <= 0xd7a3) {
        const syl = code - 0xac00;
        const cho = Math.floor(syl / 588);
        const jung = Math.floor((syl % 588) / 28);
        const jong = syl % 28;
        const topBottom = jong > 0 ? gmy : gy1;
        drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gmx, gy0, stroke, ir, ig, ib, 0.9);
        if (cho % 3 !== 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gx0, topBottom, stroke, ir, ig, ib, 0.88);
        }
        if (cho % 2 === 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, (gy0 + topBottom) * 0.5, gmx, (gy0 + topBottom) * 0.5, stroke, ir, ig, ib, 0.86);
        }
        if (jung < 8 || jung >= 18) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx1, gy0, gx1, topBottom, stroke, ir, ig, ib, 0.92);
        } else {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, topBottom, gx1, topBottom, stroke, ir, ig, ib, 0.92);
        }
        if (jong > 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0 + stroke, gy1, gx1, gy1, stroke, ir, ig, ib, 0.9);
          if (jong % 2 === 1) {
            drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0 + stroke, gmy + stroke, gx0 + stroke, gy1, stroke, ir, ig, ib, 0.85);
          }
        }
      } else if (code >= 0x3040 && code <= 0x9fff) {
        drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gx1, gy0, stroke, ir, ig, ib, 0.9);
        drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gmx, gy0, gmx, gy1, stroke, ir, ig, ib, 0.88);
        if (code % 2 === 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gmy, gx1, gmy, stroke, ir, ig, ib, 0.86);
        }
      } else {
        drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gx0, gy1, stroke, ir, ig, ib, 0.9);
        if (code % 2 === 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gx1, gy0, stroke, ir, ig, ib, 0.85);
        }
        if (code % 3 === 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gmy, gx1, gmy, stroke, ir, ig, ib, 0.85);
        }
      }
    });
  });
}

function computeSpeechBubbleMetrics(
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  placement: SpeakerBubblePlacement,
  locale: WebtoonDialogueLocale = "ko",
  dialogueText?: string,
) {
  const border = Math.max(1, Math.round(innerWidth * 0.0042));
  const aspect = resolveLocalizedBubbleAspect(locale, dialogueText);
  const rawRx = Math.max(8, Math.round(innerWidth * 0.21 * aspect.scaleX));
  const rawRy = Math.max(5, Math.round(innerHeight * 0.092 * aspect.scaleY));
  const safePadX = border + 4;
  const rx = Math.min(rawRx, Math.max(8, Math.floor(innerWidth * 0.44) - safePadX));
  const ry = Math.min(rawRy, Math.max(5, Math.floor(innerHeight * 0.24)));
  const rawCx = innerX + Math.round(innerWidth * placement.centerXRatio);
  const minCx = innerX + rx + safePadX;
  const maxCx = innerX + innerWidth - rx - safePadX;
  const cx = minCx <= maxCx ? Math.min(maxCx, Math.max(minCx, rawCx)) : innerX + Math.round(innerWidth * 0.5);
  const cy = innerY + Math.round(ry * 1.28);
  return { rx, ry, cx, cy, border };
}

function bakeSpeechBubbleFrame(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  placement: SpeakerBubblePlacement,
  shape: WebtoonStripBubbleShape = "oval",
  locale: WebtoonDialogueLocale = "ko",
  dialogueText?: string,
): void {
  if (shape === "none") return;
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const { rx, ry, cx, cy, border } = computeSpeechBubbleMetrics(innerX, innerY, innerWidth, innerHeight, placement, locale, dialogueText);

  if (shape === "monologue-box") {
    const x0 = Math.max(innerX, cx - rx - border);
    const x1 = Math.min(clipX1 - 1, cx + rx + border);
    const y0 = Math.max(innerY, cy - ry - border);
    const y1 = Math.min(clipY1 - 1, cy + ry + border);
    const inset = Math.max(2, border * 2 + 1);
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const isOuterBorder = px < cx - rx || px > cx + rx || py < cy - ry || py > cy + ry;
        if (isOuterBorder) {
          blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 24, 21, 28, 0.95);
        } else {
          const isInsetHairline =
            (Math.abs(px - (cx - rx + inset)) === 0 || Math.abs(px - (cx + rx - inset)) === 0) &&
              py >= cy - ry + inset &&
              py <= cy + ry - inset
              ? true
              : (Math.abs(py - (cy - ry + inset)) === 0 || Math.abs(py - (cy + ry - inset)) === 0) &&
                px >= cx - rx + inset &&
                px <= cx + rx - inset;
          if (isInsetHairline) {
            blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 24, 21, 28, 0.42);
          } else {
            blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 250, 247, 240, 0.96);
          }
        }
      }
    }
  } else if (shape === "shout-burst") {
    const padX = Math.ceil(rx * 1.24 + border + 1);
    const padY = Math.ceil(ry * 1.24 + border + 1);
    const x0 = Math.max(innerX, cx - padX);
    const x1 = Math.min(clipX1 - 1, cx + padX);
    const y0 = Math.max(innerY, cy - padY);
    const y1 = Math.min(clipY1 - 1, cy + padY);
    const borderNorm = Math.max(0.045, border / Math.max(8, Math.min(rx, ry)));
    const spikeCount = 22;
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const nx = (px - cx) / rx;
        const ny = (py - cy) / ry;
        const rNorm = Math.hypot(nx, ny);
        if (rNorm > 1.3) continue;
        const theta = Math.atan2(ny, nx);
        const phase = ((theta + Math.PI) / (Math.PI * 2)) * spikeCount;
        const tri = Math.abs((phase - Math.floor(phase)) * 2 - 1);
        const maxR = 0.86 + tri * 0.34;
        if (rNorm > maxR) continue;
        if (rNorm <= maxR - borderNorm) {
          blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 255, 253, 247, 0.98);
        } else {
          blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 24, 21, 28, 0.96);
        }
      }
    }
  } else {
    const isWhisper = shape === "whisper-dashed";
    const x0 = Math.max(innerX, cx - rx - border - 1);
    const x1 = Math.min(clipX1 - 1, cx + rx + border + 1);
    const y0 = Math.max(innerY, cy - ry - border - 1);
    const y1 = Math.min(clipY1 - 1, cy + ry + border + 1);

    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const ndOuter = Math.hypot((px - cx) / (rx + border), (py - cy) / (ry + border));
        if (ndOuter > 1.0) continue;
        const ndInner = Math.hypot((px - cx) / rx, (py - cy) / ry);
        if (ndInner <= 1.0) {
          blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 255, 254, 251, isWhisper ? 0.93 : 0.97);
        } else if (!isWhisper) {
          blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 24, 21, 28, 0.95);
        } else {
          const theta = Math.atan2(py - cy, px - cx);
          const dashIdx = Math.floor(((theta + Math.PI) / (Math.PI * 2)) * 24);
          if (dashIdx % 2 === 0) {
            blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 24, 21, 28, 0.88);
          } else {
            blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 255, 254, 251, 0.9);
          }
        }
      }
    }

    const fallbackDir = placement.placeRight ? -1 : 1;
    const tailTipX =
      placement.tailTargetXRatio !== null
        ? innerX + Math.round(innerWidth * placement.tailTargetXRatio)
        : cx + fallbackDir * Math.round(rx * 0.72);
    const tailDeltaX = tailTipX - cx;
    const tailDirSign = tailDeltaX === 0 ? fallbackDir : Math.sign(tailDeltaX);
    const tailStartX =
      placement.tailTargetXRatio !== null
        ? cx + tailDirSign * Math.min(Math.round(rx * 0.4), Math.round(Math.abs(tailDeltaX) * 0.5))
        : cx + fallbackDir * Math.round(rx * 0.34);
    const tailStartY = cy + Math.round(ry * 0.88);
    const tailTipY = cy + Math.round(ry * (placement.tailTargetXRatio !== null ? 1.56 : 1.48));

    if (!isWhisper) {
      drawClippedLineRgba(
        rgba,
        canvasWidth,
        innerX,
        innerY,
        clipX1,
        clipY1,
        tailStartX,
        tailStartY,
        tailTipX,
        tailTipY,
        Math.max(1, border * 0.9),
        24,
        21,
        28,
        0.95,
      );
    } else {
      const dot1X = Math.round(tailStartX + (tailTipX - tailStartX) * 0.4);
      const dot1Y = Math.round(tailStartY + (tailTipY - tailStartY) * 0.42);
      const dot2X = Math.round(tailStartX + (tailTipX - tailStartX) * 0.82);
      const dot2Y = Math.round(tailStartY + (tailTipY - tailStartY) * 0.84);
      drawClippedLineRgba(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, dot1X - 1, dot1Y, dot1X + 1, dot1Y, Math.max(1, border), 24, 21, 28, 0.85);
      drawClippedLineRgba(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, dot2X - 1, dot2Y, dot2X + 1, dot2Y, Math.max(1, border * 0.8), 24, 21, 28, 0.8);
    }
  }
}

function bakeSpeechBubbleDialogueText(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  placement: SpeakerBubblePlacement,
  dialogueText: string | undefined,
  shape: WebtoonStripBubbleShape = "oval",
  fontScale: WebtoonStripBubbleFontScale = "md",
  locale: WebtoonDialogueLocale = "ko",
): void {
  if (shape === "none" || !dialogueText || dialogueText.trim().length === 0) return;
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const { rx, ry, cx, cy } = computeSpeechBubbleMetrics(innerX, innerY, innerWidth, innerHeight, placement, locale, dialogueText);
  const [line1, line2] = splitLocalizedBubbleDialogue(dialogueText, locale);
  const boxW = Math.max(8, Math.round(rx * 1.66));
  const boxH = Math.max(6, Math.round(ry * 1.44));
  const raster = tryRasterizeDialogueCanvas2d(boxW, boxH, line1, line2, fontScale, locale);
  if (raster) {
    const dstLeft = Math.round(cx - boxW * 0.5);
    const dstTop = Math.round(cy - boxH * 0.5);
    for (let ty = 0; ty < boxH; ty += 1) {
      for (let tx = 0; tx < boxW; tx += 1) {
        const sx = tx * 2;
        const sy = ty * 2;
        let aSum = 0;
        for (let oy = 0; oy < 2; oy += 1) {
          for (let ox = 0; ox < 2; ox += 1) {
            const idx = ((sy + oy) * raster.width + (sx + ox)) * 4;
            aSum += raster.data[idx + 3] ?? 0;
          }
        }
        const alpha01 = aSum / (255 * 4);
        if (alpha01 > 0.04) {
          blendPixelRgba(rgba, canvasWidth, dstLeft + tx, dstTop + ty, innerX, innerY, clipX1, clipY1, 24, 21, 28, alpha01);
        }
      }
    }
  } else {
    bakeDeterministicDialogueGlyphs(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, cx, cy, rx, ry, line1, line2, fontScale);
  }
}

function bakeSpeechBubbleBalloon(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  placement: SpeakerBubblePlacement,
  dialogueText?: string,
  shape: WebtoonStripBubbleShape = "oval",
  fontScale: WebtoonStripBubbleFontScale = "md",
  locale: WebtoonDialogueLocale = "ko",
): void {
  if (shape === "none") return;
  bakeSpeechBubbleFrame(rgba, canvasWidth, innerX, innerY, innerWidth, innerHeight, placement, shape, locale, dialogueText);
  bakeSpeechBubbleDialogueText(rgba, canvasWidth, innerX, innerY, innerWidth, innerHeight, placement, dialogueText, shape, fontScale, locale);
}

function tryRasterizeSfxCanvas2d(
  boxWidth: number,
  boxHeight: number,
  glyphText: string,
  tiltDeg: number,
  accentRgb: readonly [number, number, number],
  inkRgb: readonly [number, number, number],
  locale: WebtoonDialogueLocale = "ko",
): { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray } | null {
  if (typeof document === "undefined" || boxWidth < 14 || boxHeight < 10) return null;
  try {
    const scale = 2;
    const w = Math.max(14, Math.floor(boxWidth * scale));
    const h = Math.max(10, Math.floor(boxHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate((tiltDeg * Math.PI) / 180);
    const widthFactor = locale === "en" ? 0.62 : 0.92;
    const fontPx = Math.max(12, Math.min(Math.floor(h * 0.58), Math.floor((w * 0.82) / Math.max(1.4, glyphText.length * widthFactor))));
    ctx.font = `800 ${fontPx}px ${resolveFontStackByLocale(locale)}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, Math.round(fontPx * 0.24));
    ctx.strokeStyle = "#FFFDF8";
    ctx.strokeText(glyphText, 0, 0);
    ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.12));
    ctx.strokeStyle = `rgb(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]})`;
    ctx.strokeText(glyphText, 0, 0);
    ctx.fillStyle = `rgb(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]})`;
    ctx.fillText(glyphText, 0, 0);
    ctx.restore();
    const img = ctx.getImageData(0, 0, w, h);
    let hasPixels = false;
    for (let i = 3; i < img.data.length; i += 4) {
      if ((img.data[i] ?? 0) > 16) {
        hasPixels = true;
        break;
      }
    }
    return hasPixels ? { width: w, height: h, data: img.data } : null;
  } catch {
    return null;
  }
}

function bakePanelSfxStamp(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  placeRight: boolean,
  stamp: WebtoonSfxStampOption,
  locale: WebtoonDialogueLocale = "ko",
): void {
  if (stamp === "none") return;
  const spec = WEBTOON_SFX_STAMP_KO_TEXT[stamp];
  const glyphText = resolveSfxGlyphByLocale(stamp, locale);
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const cx = placeRight ? innerX + Math.round(innerWidth * 0.76) : innerX + Math.round(innerWidth * 0.24);
  const cy = innerY + Math.round(innerHeight * 0.13);
  const rx = Math.max(8, Math.round(innerWidth * 0.145));
  const ry = Math.max(5, Math.round(innerHeight * 0.064));
  const [ar, ag, ab] = spec.accentRgb;
  const [ir, ig, ib] = spec.inkRgb;
  const stroke = Math.max(0.8, innerWidth * 0.0032);

  drawClippedLineRgba(
    rgba,
    canvasWidth,
    innerX,
    innerY,
    clipX1,
    clipY1,
    cx - rx * 0.92,
    cy + ry * 0.42,
    cx + rx * 0.92,
    cy - ry * 0.42,
    stroke * 2.4,
    255,
    253,
    248,
    0.94,
  );
  drawClippedLineRgba(
    rgba,
    canvasWidth,
    innerX,
    innerY,
    clipX1,
    clipY1,
    cx - rx * 0.86,
    cy + ry * 0.38,
    cx + rx * 0.86,
    cy - ry * 0.38,
    stroke * 1.45,
    ar,
    ag,
    ab,
    0.92,
  );

  const boxW = Math.max(10, Math.round(rx * 1.95));
  const boxH = Math.max(8, Math.round(ry * 1.9));
  const raster = tryRasterizeSfxCanvas2d(boxW, boxH, glyphText, spec.tiltDeg, spec.accentRgb, spec.inkRgb, locale);
  if (raster) {
    const dstLeft = Math.round(cx - boxW * 0.5);
    const dstTop = Math.round(cy - boxH * 0.5);
    for (let ty = 0; ty < boxH; ty += 1) {
      for (let tx = 0; tx < boxW; tx += 1) {
        const sx = tx * 2;
        const sy = ty * 2;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let aSum = 0;
        for (let oy = 0; oy < 2; oy += 1) {
          for (let ox = 0; ox < 2; ox += 1) {
            const idx = ((sy + oy) * raster.width + (sx + ox)) * 4;
            const a = raster.data[idx + 3] ?? 0;
            rSum += (raster.data[idx] ?? 0) * a;
            gSum += (raster.data[idx + 1] ?? 0) * a;
            bSum += (raster.data[idx + 2] ?? 0) * a;
            aSum += a;
          }
        }
        if (aSum > 40) {
          const alpha01 = aSum / (255 * 4);
          blendPixelRgba(
            rgba,
            canvasWidth,
            dstLeft + tx,
            dstTop + ty,
            innerX,
            innerY,
            clipX1,
            clipY1,
            Math.round(rSum / aSum),
            Math.round(gSum / aSum),
            Math.round(bSum / aSum),
            alpha01,
          );
        }
      }
    }
  } else {
    bakeDeterministicDialogueGlyphs(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, cx + 1, cy + 1, rx, ry, glyphText, null, "lg", [255, 253, 248]);
    bakeDeterministicDialogueGlyphs(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, cx, cy, rx, ry, glyphText, null, "lg", [ir, ig, ib]);
  }
}

// ---------------------------------------------------------------- 레이어 PSD 만화 연출 투명 분리 레이어 빌더

export function renderTransparentActionLinesLayer(
  width: number,
  height: number,
  kind: WebtoonStripFxLinesKind,
  intensity = 0.78,
  cutIndex = 0,
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const safeIntensity = Math.min(1, Math.max(0.2, Number.isFinite(intensity) ? intensity : 0.78));
  bakePanelActionLines(rgba, width, 0, 0, width, height, kind, safeIntensity, cutIndex);
  return { width, height, rgba };
}

export function renderTransparentSpeechBubbleFrameLayer(
  width: number,
  height: number,
  options: {
    readonly shape?: WebtoonStripBubbleShape;
    readonly speakerTarget?: WebtoonStripSpeakerTarget;
    readonly partnerSide?: "left" | "right";
    readonly locale?: WebtoonDialogueLocale;
    readonly dialogueText?: string;
    readonly cutIndex?: number;
  } = {},
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const placement = resolveSpeakerBubblePlacement(
    options.cutIndex ?? 0,
    options.speakerTarget ?? "auto",
    options.partnerSide ?? "right",
  );
  bakeSpeechBubbleFrame(
    rgba,
    width,
    0,
    0,
    width,
    height,
    placement,
    options.shape ?? "oval",
    options.locale ?? "ko",
    options.dialogueText,
  );
  return { width, height, rgba };
}

export function renderTransparentDialogueTextLayer(
  width: number,
  height: number,
  options: {
    readonly dialogueText?: string;
    readonly shape?: WebtoonStripBubbleShape;
    readonly fontScale?: WebtoonStripBubbleFontScale;
    readonly speakerTarget?: WebtoonStripSpeakerTarget;
    readonly partnerSide?: "left" | "right";
    readonly locale?: WebtoonDialogueLocale;
    readonly cutIndex?: number;
  } = {},
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const placement = resolveSpeakerBubblePlacement(
    options.cutIndex ?? 0,
    options.speakerTarget ?? "auto",
    options.partnerSide ?? "right",
  );
  bakeSpeechBubbleDialogueText(
    rgba,
    width,
    0,
    0,
    width,
    height,
    placement,
    options.dialogueText,
    options.shape ?? "oval",
    options.fontScale ?? "md",
    options.locale ?? "ko",
  );
  return { width, height, rgba };
}

export function renderTransparentSfxStampLayer(
  width: number,
  height: number,
  options: {
    readonly stamp?: WebtoonSfxStampOption;
    readonly speakerTarget?: WebtoonStripSpeakerTarget;
    readonly partnerSide?: "left" | "right";
    readonly locale?: WebtoonDialogueLocale;
    readonly cutIndex?: number;
  } = {},
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const placement = resolveSpeakerBubblePlacement(
    options.cutIndex ?? 0,
    options.speakerTarget ?? "auto",
    options.partnerSide ?? "right",
  );
  bakePanelSfxStamp(
    rgba,
    width,
    0,
    0,
    width,
    height,
    !placement.placeRight,
    options.stamp ?? "none",
    options.locale ?? "ko",
  );
  return { width, height, rgba };
}

function fillRectRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const xEnd = x0 + w;
  const yEnd = y0 + h;
  for (let y = y0; y < yEnd; y += 1) {
    let offset = (y * canvasWidth + x0) * 4;
    for (let x = x0; x < xEnd; x += 1) {
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = a;
      offset += 4;
    }
  }
}

export function composeWebtoonVerticalStrip(
  panels: readonly CapturedRaster[],
  layout: WebtoonStripLayout,
  mangaFx?: WebtoonStripMangaFxOptions,
): CapturedRaster {
  if (panels.length !== WEBTOON_VERTICAL_STRIP_CUTS.length) {
    throw new Error(`웹툰 4컷 스트립 합성에는 ${WEBTOON_VERTICAL_STRIP_CUTS.length}개의 컷이 필요합니다(전달됨: ${panels.length}).`);
  }
  const out = new Uint8ClampedArray(layout.stripWidth * layout.stripHeight * 4);
  out.fill(255);

  const frameWidth = layout.cutWidth + layout.borderPx * 2;
  const frameHeight = layout.bubbleSafeTopPx + layout.cutHeight + layout.borderPx * 2;
  const fxEnabled = mangaFx?.enabled === true;
  const fxLinesKind: WebtoonStripFxLinesKind = fxEnabled ? (mangaFx?.linesKind ?? "focus-radial") : "none";
  const fxIncludeBubbles = fxEnabled && mangaFx?.includeSpeechBubbles !== false;
  const fxIntensity = Math.min(1, Math.max(0.2, Number.isFinite(mangaFx?.intensity) ? (mangaFx?.intensity ?? 0.75) : 0.75));
  const partnerSide: "left" | "right" = mangaFx?.partnerSide ?? "right";
  const locale: WebtoonDialogueLocale = mangaFx?.locale ?? "ko";

  for (let idx = 0; idx < panels.length; idx += 1) {
    const panel = panels[idx];
    if (!panel) continue;
    if (panel.width !== layout.cutWidth || panel.height !== layout.cutHeight) {
      throw new Error(
        `${idx + 1}번째 컷 크기(${panel.width}×${panel.height})가 레이아웃 컷 크기(${layout.cutWidth}×${layout.cutHeight})와 다릅니다.`,
      );
    }

    const frameX = layout.marginX;
    const frameY = layout.marginY + idx * (frameHeight + layout.gutterY);

    fillRectRgba(out, layout.stripWidth, frameX, frameY, frameWidth, frameHeight, 24, 21, 28, 255);

    const innerX = frameX + layout.borderPx;
    const innerY = frameY + layout.borderPx;
    const innerHeight = layout.bubbleSafeTopPx + layout.cutHeight;

    for (let py = 0; py < innerHeight; py += 1) {
      const t = innerHeight > 1 ? py / (innerHeight - 1) : 0;
      const bgR = Math.round(250 - 11 * t);
      const bgG = Math.round(247 - 13 * t);
      const bgB = Math.round(242 - 18 * t);
      let dst = ((innerY + py) * layout.stripWidth + innerX) * 4;
      for (let px = 0; px < layout.cutWidth; px += 1) {
        out[dst] = bgR;
        out[dst + 1] = bgG;
        out[dst + 2] = bgB;
        out[dst + 3] = 255;
        dst += 4;
      }
    }

    if (fxLinesKind !== "none") {
      bakePanelActionLines(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, fxLinesKind, fxIntensity, idx);
    }

    const cutStartY = innerY + layout.bubbleSafeTopPx;
    for (let cy = 0; cy < layout.cutHeight; cy += 1) {
      let src = cy * layout.cutWidth * 4;
      let dst = ((cutStartY + cy) * layout.stripWidth + innerX) * 4;
      for (let cx = 0; cx < layout.cutWidth; cx += 1) {
        const srcA = panel.rgba[src + 3] ?? 0;
        if (srcA === 255) {
          out[dst] = panel.rgba[src] ?? 0;
          out[dst + 1] = panel.rgba[src + 1] ?? 0;
          out[dst + 2] = panel.rgba[src + 2] ?? 0;
        } else if (srcA > 0) {
          const alpha = srcA / 255;
          const inv = 1 - alpha;
          out[dst] = Math.round((panel.rgba[src] ?? 0) * alpha + (out[dst] ?? 255) * inv);
          out[dst + 1] = Math.round((panel.rgba[src + 1] ?? 0) * alpha + (out[dst + 1] ?? 255) * inv);
          out[dst + 2] = Math.round((panel.rgba[src + 2] ?? 0) * alpha + (out[dst + 2] ?? 255) * inv);
        }
        out[dst + 3] = 255;
        src += 4;
        dst += 4;
      }
    }

    const cutSpeaker: WebtoonStripSpeakerTarget = mangaFx?.speakerTargets?.[idx] ?? "auto";
    const placement = resolveSpeakerBubblePlacement(idx, cutSpeaker, partnerSide);
    if (fxIncludeBubbles) {
      const cutDialogue = mangaFx?.dialogueLines?.[idx];
      const cutShape: WebtoonStripBubbleShape = mangaFx?.bubbleShapes?.[idx] ?? "oval";
      const cutFontScale: WebtoonStripBubbleFontScale = mangaFx?.bubbleFontScales?.[idx] ?? "md";
      bakeSpeechBubbleBalloon(
        out,
        layout.stripWidth,
        innerX,
        innerY,
        layout.cutWidth,
        innerHeight,
        placement,
        cutDialogue,
        cutShape,
        cutFontScale,
        locale,
      );
    }

    if (fxEnabled) {
      const cutSfx: WebtoonSfxStampOption = mangaFx?.sfxStamps?.[idx] ?? "none";
      if (cutSfx !== "none") {
        bakePanelSfxStamp(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, !placement.placeRight, cutSfx, locale);
      }
    }
  }

  return { width: layout.stripWidth, height: layout.stripHeight, rgba: out };
}

export async function exportWebtoonVerticalStripPng(
  engine: CharacterEngine,
  options: ExportWebtoonVerticalStripOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const layout = clampWebtoonStripLayout(options.stripWidth, options.includeBubbleSafeZone ?? true);

  if (layout.stripHeight > MAX_PNG_EXPORT_DIMENSION || layout.stripWidth > MAX_PNG_EXPORT_DIMENSION) {
    return {
      ok: false,
      failure: failVisible(
        "export-webtoon-strip-size",
        `세로 4컷 웹툰 스트립 크기(${layout.stripWidth}×${layout.stripHeight}px)가 최대 허용 해상도(${MAX_PNG_EXPORT_DIMENSION}px)를 초과합니다.`,
        undefined,
        started,
      ),
    };
  }

  const settleSteps = Math.min(MAX_SETTLE_STEPS, Math.max(0, Math.floor(options.settleSteps ?? 0)));
  if (settleSteps > 0) {
    try {
      await engine.settle(settleSteps);
    } catch (error) {
      return { ok: false, failure: toFailure("export-settle", "웹툰 콘티 스트립 캡처 전 물리 settle에 실패했습니다.", error, started) };
    }
  }

  const resolvedArc = options.actingArc ? findWebtoonStripActingArc(options.actingArc.arcId) : null;
  const panels: CapturedRaster[] = [];
  let lastProvenance = undefined;
  let appliedActingKeyframe = false;

  try {
    for (let idx = 0; idx < WEBTOON_VERTICAL_STRIP_CUTS.length; idx += 1) {
      const cutPresetId = options.cutCameraPresets?.[idx] ?? "default";
      const cut = resolveWebtoonCutCameraSpec(idx, cutPresetId);
      const keyframe = resolvedArc?.cuts[idx];
      const stepLabel = keyframe ? `${cut.labelKo} (${keyframe.beatKo})` : cut.labelKo;
      options.onProgress?.(idx + 1, WEBTOON_VERTICAL_STRIP_CUTS.length, stepLabel);

      if (keyframe && options.actingArc) {
        try {
          engine.applyPlan(buildActingCutPlan(options.actingArc.basePlan, keyframe, idx));
          appliedActingKeyframe = true;
        } catch (error) {
          return { ok: false, failure: toFailure("export-acting-plan", `${stepLabel} 연기 스냅샷 적용에 실패했습니다.`, error, started) };
        }
      }

      try {
        const captured = await engine.renderPasses({
          width: layout.cutWidth,
          height: layout.cutHeight,
          passes: ["lit"],
          transparentBackground: true,
          settleSteps: 0,
          camera: {
            ...DEFAULT_FRAMING,
            mode: cut.mode,
            yawDeg: cut.yawDeg,
            pitchDeg: cut.pitchDeg,
            distanceScale: cut.distanceScale,
          },
        });
        if (captured.width !== layout.cutWidth || captured.height !== layout.cutHeight) {
          return {
            ok: false,
            failure: failVisible(
              "export-capture-size",
              `엔진이 컷 크기 ${layout.cutWidth}×${layout.cutHeight} 대신 ${captured.width}×${captured.height}를 반환했습니다.`,
              undefined,
              started,
            ),
          };
        }
        const lit = captured.passes.lit;
        if (!lit) {
          return { ok: false, failure: failVisible("export-missing-lit", `${cut.labelKo} 캡처에 lit 패스가 없습니다.`, undefined, started) };
        }
        const finalPanel = cut.dutchTiltDeg ? rotateRasterBilinear(lit, cut.dutchTiltDeg) : lit;
        panels.push(finalPanel);
        lastProvenance = captured.provenance;
      } catch (error) {
        return { ok: false, failure: toFailure("export-capture", `웹툰 4컷 스트립(${cut.labelKo}) 캡처에 실패했습니다.`, error, started) };
      }
    }
  } finally {
    if (appliedActingKeyframe && options.actingArc) {
      try {
        engine.applyPlan(options.actingArc.basePlan);
      } catch {
        // 엔진이 해제된 경우 복원 실패는 무시한다
      }
    }
  }

  if (!lastProvenance) {
    return { ok: false, failure: failVisible("export-missing-lit", "웹툰 4컷 스트립 캡처 결과가 비어 있습니다.", undefined, started) };
  }

  try {
    const composed = composeWebtoonVerticalStrip(panels, layout, options.mangaFx);
    const bytes = await encodePng(composed, { filter: "adaptive" });
    const baseName = exportFileName("png", lastProvenance.recipeDigest, composed.width, composed.height);
    const actingTag = resolvedArc ? "-acting" : "";
    const fxTag = options.mangaFx?.enabled ? "-fx" : "";
    const localeTag =
      options.mangaFx?.enabled && options.mangaFx.locale && options.mangaFx.locale !== "ko"
        ? `-${options.mangaFx.locale}`
        : "";
    const suffix = `-webtoon-4cut${actingTag}${fxTag}${localeTag}-strip.png`;
    const fileName = baseName.replace(/\.png$/u, suffix);
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName,
        mime: PNG_MIME,
        bytes: bytes.length,
        width: composed.width,
        height: composed.height,
        settleSteps,
        provenance: lastProvenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-png-encode", "웹툰 4컷 스트립 PNG 인코딩에 실패했습니다.", error, started) };
  }
}
