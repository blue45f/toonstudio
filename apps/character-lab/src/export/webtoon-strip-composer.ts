/**
 * 한국형·글로벌(KO/EN/JA · 가로/세로쓰기 Tategaki) 세로 스크롤 웹툰 4컷 콘티 스트립 합성 모듈:
 * - 다국어(한국어·영어·일본어) 로컬라이징 모드 및 일본어 세로쓰기(縦書き · 단행본식 우→좌 열 조판) 말풍선 가로세로 종횡비(rx·ry) 자동 스케일링
 * - 1→2, 2→3, 3→4컷 개별 스크롤 여백 호흡(빠른 템포·표준·서스펜스·클리프행어) 및 시간대 원고 분위기 색온도 무드(주간·황혼·심야·역광)
 * - 1~4컷 개별 흑백·컬러 할프톤 망점 스크린톤(`screentones`) 및 모바일 웹툰 리더 오토패닝 타임라인
 * - 1~4컷 개별 카메라 구도(로우·하이·와이드 투샷) 및 더치 틸트(Dutch Tilt ±9° 쌍선형 알파 보간 회전) 디렉터
 * - 발화자(주연·상대역·자동 교차)별 말풍선 좌우 배치 및 꼬리 자동 조준, 레이어 PSD 만화 연출 투명 분리 레이어 빌더
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure } from "../contracts";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";
import { buildActingCutPlan, findWebtoonStripActingArc } from "./webtoon-strip-acting";
import { bakeSpeechBubbleBalloon } from "./webtoon-strip-bubbles";
import { resolveSpeakerBubblePlacement } from "./webtoon-strip-fx-options";
import { bakePanelActionLines, bakePanelSfxStamp } from "./webtoon-strip-manga-fx";
import {
  DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  WEBTOON_JA_WRITING_MODES,
  WEBTOON_JA_WRITING_MODE_LABELS_KO,
  WEBTOON_MANUSCRIPT_MOODS,
  WEBTOON_MANUSCRIPT_MOOD_IDS,
  WEBTOON_STRIP_GUTTER_PACES,
  WEBTOON_STRIP_GUTTER_PACE_IDS,
  computeVariableGutterHeights,
  gradeCharacterPixelByMood,
  normalizeTategakiGlyph,
  splitJapaneseTategakiColumns,
} from "./webtoon-strip-pacing-tategaki";
import {
  DEFAULT_WEBTOON_STRIP_SCREENTONES,
  WEBTOON_SCREENTONE_IDS,
  WEBTOON_SCREENTONE_SPECS,
  bakePanelHalftoneScreentone,
  computeStripAutoPanTimeline,
  renderTransparentScreentoneLayer,
  sampleAutoPanScrollState,
} from "./webtoon-strip-screentone";

import type {
  ApplyPlan,
  CameraFramingMode,
  CaptureProvenance,
  CapturedRaster,
  CharacterEngine,
  LabFailure,
} from "../contracts";
import type { ExportDeps, ExportOutcome } from "./export-session";
import type { WebtoonStripActingArcId } from "./webtoon-strip-acting";
import type {
  WebtoonDialogueLocale,
  WebtoonSfxStampOption,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleShape,
  WebtoonStripFxLinesKind,
  WebtoonStripMangaFxOptions,
  WebtoonStripSpeakerTarget,
} from "./webtoon-strip-fx-options";
import type {
  WebtoonJaWritingMode,
  WebtoonManuscriptMoodId,
  WebtoonManuscriptMoodSpec,
  WebtoonStripGutterPaceId,
  WebtoonStripGutterPaceSpec,
  WebtoonStripGutterPaces,
} from "./webtoon-strip-pacing-tategaki";
import type {
  StripAutoPanSegment,
  StripAutoPanTimeline,
  WebtoonScreentoneId,
  WebtoonScreentoneSpec,
  WebtoonStripScreentones,
} from "./webtoon-strip-screentone";

export {
  WEBTOON_STRIP_ACTING_ARCS,
  buildActingCutPlan,
  findWebtoonStripActingArc,
} from "./webtoon-strip-acting";
export {
  DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  WEBTOON_JA_WRITING_MODES,
  WEBTOON_JA_WRITING_MODE_LABELS_KO,
  WEBTOON_MANUSCRIPT_MOODS,
  WEBTOON_MANUSCRIPT_MOOD_IDS,
  WEBTOON_STRIP_GUTTER_PACES,
  WEBTOON_STRIP_GUTTER_PACE_IDS,
  computeVariableGutterHeights,
  gradeCharacterPixelByMood,
  normalizeTategakiGlyph,
  splitJapaneseTategakiColumns,
};
export {
  DEFAULT_WEBTOON_STRIP_SCREENTONES,
  WEBTOON_SCREENTONE_IDS,
  WEBTOON_SCREENTONE_SPECS,
  bakePanelHalftoneScreentone,
  computeStripAutoPanTimeline,
  renderTransparentScreentoneLayer,
  sampleAutoPanScrollState,
};
export type {
  WebtoonStripActingArcId,
  WebtoonStripActingArcSpec,
  WebtoonStripCutActingKeyframe,
} from "./webtoon-strip-acting";
export type {
  WebtoonJaWritingMode,
  WebtoonManuscriptMoodId,
  WebtoonManuscriptMoodSpec,
  WebtoonStripGutterPaceId,
  WebtoonStripGutterPaceSpec,
  WebtoonStripGutterPaces,
};
export type {
  StripAutoPanSegment,
  StripAutoPanTimeline,
  WebtoonScreentoneId,
  WebtoonScreentoneSpec,
  WebtoonStripScreentones,
};

export {
  renderTransparentDialogueTextLayer,
  renderTransparentSpeechBubbleFrameLayer,
  splitLocalizedBubbleDialogue,
} from "./webtoon-strip-bubbles";
export {
  WEBTOON_DIALOGUE_LOCALES,
  WEBTOON_DIALOGUE_LOCALE_LABELS,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_BY_LOCALE,
  DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO,
  WEBTOON_STRIP_FONT_SCALE_LABELS_KO,
  WEBTOON_STRIP_SPEAKER_LABELS_KO,
  WEBTOON_SFX_STAMP_KO_TEXT,
  resolveSfxGlyphByLocale,
  resolveLocalizedBubbleAspect,
  resolveSpeakerBubblePlacement,
} from "./webtoon-strip-fx-options";
export type {
  WebtoonDialogueLocale,
  WebtoonStripFxLinesKind,
  WebtoonStripBubbleShape,
  WebtoonStripBubbleFontScale,
  WebtoonSfxStampOption,
  WebtoonStripSpeakerTarget,
  WebtoonStripDialogueLines,
  WebtoonStripBubbleShapes,
  WebtoonStripBubbleFontScales,
  WebtoonStripSfxStamps,
  WebtoonStripSpeakerTargets,
  LocalizedSfxStampSpec,
  LocalizedBubbleAspect,
  SpeakerBubblePlacement,
  WebtoonStripMangaFxOptions,
} from "./webtoon-strip-fx-options";
export { renderTransparentActionLinesLayer, renderTransparentSfxStampLayer } from "./webtoon-strip-manga-fx";

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

export interface WebtoonStripLayout {
  readonly stripWidth: number;
  readonly stripHeight: number;
  readonly cutWidth: number;
  readonly cutHeight: number;
  readonly marginX: number;
  readonly marginY: number;
  readonly gutterY: number;
  readonly gutterHeights?: readonly [number, number, number];
  readonly borderPx: number;
  readonly bubbleSafeTopPx: number;
}

export interface ExportWebtoonVerticalStripOptions {
  /** 요청 원고 가로 폭(px, 기본 800px · 최대 1024px) */
  readonly stripWidth: number;
  /** 각 컷 상단에 말풍선 배치용 안전 여백을 확보할지 여부(기본 true) */
  readonly includeBubbleSafeZone?: boolean;
  /** 1→2, 2→3, 3→4컷 사이의 스크롤 여백 호흡 프리셋(선택) */
  readonly gutterPaces?: WebtoonStripGutterPaces;
  /** 시간대 원고 분위기·색온도 무드(mangaFx 비활성 시에도 단독 적용 가능) */
  readonly manuscriptMood?: WebtoonManuscriptMoodId;
  /** 1~4컷 개별 할프톤 망점 스크린톤(mangaFx 비활성 시에도 단독 적용 가능) */
  readonly screentones?: WebtoonStripScreentones;
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

export function clampWebtoonStripLayout(
  requestedWidth: number,
  includeBubbleSafeZone = true,
  gutterPaces: WebtoonStripGutterPaces = DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
): WebtoonStripLayout {
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
  const gutterHeights = computeVariableGutterHeights(gutterY, gutterPaces);
  const totalGutterHeight = gutterHeights[0] + gutterHeights[1] + gutterHeights[2];
  const bubbleSafeTopPx = includeBubbleSafeZone ? Math.max(4, Math.round(safeStripW * 0.052)) : 0;

  const fixedVerticalOverhead = marginY * 2 + totalGutterHeight + cutCount * (borderPx * 2 + bubbleSafeTopPx);
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
    gutterHeights,
    borderPx,
    bubbleSafeTopPx,
  };
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
  manuscriptMoodOverride?: WebtoonManuscriptMoodId,
  screentonesOverride?: WebtoonStripScreentones,
): CapturedRaster {
  if (panels.length !== WEBTOON_VERTICAL_STRIP_CUTS.length) {
    throw new Error(`웹툰 4컷 스트립 합성에는 ${WEBTOON_VERTICAL_STRIP_CUTS.length}개의 컷이 필요합니다(전달됨: ${panels.length}).`);
  }
  const moodId: WebtoonManuscriptMoodId = manuscriptMoodOverride ?? mangaFx?.manuscriptMood ?? "daylight-paper";
  const moodSpec = WEBTOON_MANUSCRIPT_MOODS[moodId] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];

  const out = new Uint8ClampedArray(layout.stripWidth * layout.stripHeight * 4);
  fillRectRgba(
    out,
    layout.stripWidth,
    0,
    0,
    layout.stripWidth,
    layout.stripHeight,
    moodSpec.stripMarginRgb[0],
    moodSpec.stripMarginRgb[1],
    moodSpec.stripMarginRgb[2],
    255,
  );

  const frameWidth = layout.cutWidth + layout.borderPx * 2;
  const frameHeight = layout.bubbleSafeTopPx + layout.cutHeight + layout.borderPx * 2;
  const gutterHeights = layout.gutterHeights ?? [layout.gutterY, layout.gutterY, layout.gutterY];
  const fxEnabled = mangaFx?.enabled === true;
  const fxLinesKind: WebtoonStripFxLinesKind = fxEnabled ? (mangaFx?.linesKind ?? "focus-radial") : "none";
  const fxIncludeBubbles = fxEnabled && mangaFx?.includeSpeechBubbles !== false;
  const fxIntensity = Math.min(1, Math.max(0.2, Number.isFinite(mangaFx?.intensity) ? (mangaFx?.intensity ?? 0.75) : 0.75));
  const partnerSide: "left" | "right" = mangaFx?.partnerSide ?? "right";
  const locale: WebtoonDialogueLocale = mangaFx?.locale ?? "ko";
  const jaWritingMode: WebtoonJaWritingMode = mangaFx?.jaWritingMode ?? "horizontal";

  let cursorY = layout.marginY;
  for (let idx = 0; idx < panels.length; idx += 1) {
    const panel = panels[idx];
    if (!panel) continue;
    if (panel.width !== layout.cutWidth || panel.height !== layout.cutHeight) {
      throw new Error(
        `${idx + 1}번째 컷 크기(${panel.width}×${panel.height})가 레이아웃 컷 크기(${layout.cutWidth}×${layout.cutHeight})와 다릅니다.`,
      );
    }

    const frameX = layout.marginX;
    const frameY = cursorY;
    cursorY += frameHeight + (idx < 3 ? (gutterHeights[idx as 0 | 1 | 2] ?? layout.gutterY) : 0);

    fillRectRgba(
      out,
      layout.stripWidth,
      frameX,
      frameY,
      frameWidth,
      frameHeight,
      moodSpec.borderRgb[0],
      moodSpec.borderRgb[1],
      moodSpec.borderRgb[2],
      255,
    );

    const innerX = frameX + layout.borderPx;
    const innerY = frameY + layout.borderPx;
    const innerHeight = layout.bubbleSafeTopPx + layout.cutHeight;

    const [topR, topG, topB] = moodSpec.panelTopRgb;
    const [botR, botG, botB] = moodSpec.panelBottomRgb;
    for (let py = 0; py < innerHeight; py += 1) {
      const t = innerHeight > 1 ? py / (innerHeight - 1) : 0;
      const bgR = Math.round(topR + (botR - topR) * t);
      const bgG = Math.round(topG + (botG - topG) * t);
      const bgB = Math.round(topB + (botB - topB) * t);
      let dst = ((innerY + py) * layout.stripWidth + innerX) * 4;
      for (let px = 0; px < layout.cutWidth; px += 1) {
        out[dst] = bgR;
        out[dst + 1] = bgG;
        out[dst + 2] = bgB;
        out[dst + 3] = 255;
        dst += 4;
      }
    }

    const cutScreentone: WebtoonScreentoneId = screentonesOverride?.[idx] ?? mangaFx?.screentones?.[idx] ?? "none";
    if (cutScreentone !== "none") {
      bakePanelHalftoneScreentone(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, cutScreentone, fxIntensity);
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
          const [gr, gg, gb] = gradeCharacterPixelByMood(
            panel.rgba[src] ?? 0,
            panel.rgba[src + 1] ?? 0,
            panel.rgba[src + 2] ?? 0,
            moodSpec,
          );
          out[dst] = gr;
          out[dst + 1] = gg;
          out[dst + 2] = gb;
        } else if (srcA > 0) {
          const [gr, gg, gb] = gradeCharacterPixelByMood(
            panel.rgba[src] ?? 0,
            panel.rgba[src + 1] ?? 0,
            panel.rgba[src + 2] ?? 0,
            moodSpec,
          );
          const alpha = srcA / 255;
          const inv = 1 - alpha;
          out[dst] = Math.round(gr * alpha + (out[dst] ?? 255) * inv);
          out[dst + 1] = Math.round(gg * alpha + (out[dst + 1] ?? 255) * inv);
          out[dst + 2] = Math.round(gb * alpha + (out[dst + 2] ?? 255) * inv);
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
        jaWritingMode,
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

export type CaptureWebtoonVerticalStripOutcome =
  | {
      readonly ok: true;
      readonly composed: CapturedRaster;
      readonly layout: WebtoonStripLayout;
      readonly provenance: CaptureProvenance;
      readonly settleSteps: number;
      readonly effectiveMood: WebtoonManuscriptMoodId;
      readonly suffixTags: string;
    }
  | {
      readonly ok: false;
      readonly failure: LabFailure;
    };

/**
 * 4컷 웹툰 스트립을 캡처·합성해 PNG 및 9:16 숏폼 WebM 모션 티저 내보내기가 공통으로 재사용하는 래스터를 반환한다.
 */
export async function captureWebtoonVerticalStripRaster(
  engine: CharacterEngine,
  options: ExportWebtoonVerticalStripOptions,
  deps: Pick<ExportDeps, "now"> = {},
): Promise<CaptureWebtoonVerticalStripOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const layout = clampWebtoonStripLayout(
    options.stripWidth,
    options.includeBubbleSafeZone ?? true,
    options.gutterPaces ?? DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  );

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
  let lastProvenance: CaptureProvenance | undefined = undefined;
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
    const effectiveMood = options.manuscriptMood ?? options.mangaFx?.manuscriptMood ?? "daylight-paper";
    const effectiveScreentones = options.screentones ?? options.mangaFx?.screentones;
    const composed = composeWebtoonVerticalStrip(panels, layout, options.mangaFx, effectiveMood, effectiveScreentones);
    const actingTag = resolvedArc ? "-acting" : "";
    const fxTag = options.mangaFx?.enabled ? "-fx" : "";
    const toneTag = effectiveScreentones?.some((tone) => tone !== "none") ? "-tone" : "";
    const localeTag =
      options.mangaFx?.enabled && options.mangaFx.locale && options.mangaFx.locale !== "ko"
        ? `-${options.mangaFx.locale}`
        : "";
    const tategakiTag =
      options.mangaFx?.enabled && options.mangaFx.locale === "ja" && options.mangaFx.jaWritingMode === "vertical-tategaki"
        ? "-tategaki"
        : "";
    const suffixTags = `-webtoon-4cut${actingTag}${fxTag}${toneTag}${localeTag}${tategakiTag}`;
    return {
      ok: true,
      composed,
      layout,
      provenance: lastProvenance,
      settleSteps,
      effectiveMood,
      suffixTags,
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-strip-compose", "웹툰 4컷 스트립 합성에 실패했습니다.", error, started) };
  }
}

export async function exportWebtoonVerticalStripPng(
  engine: CharacterEngine,
  options: ExportWebtoonVerticalStripOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const captured = await captureWebtoonVerticalStripRaster(engine, options, { now });
  if (!captured.ok) return captured;

  try {
    const bytes = await encodePng(captured.composed, { filter: "adaptive" });
    const baseName = exportFileName("png", captured.provenance.recipeDigest, captured.composed.width, captured.composed.height);
    const fileName = baseName.replace(/\.png$/u, `${captured.suffixTags}-strip.png`);
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName,
        mime: PNG_MIME,
        bytes: bytes.length,
        width: captured.composed.width,
        height: captured.composed.height,
        settleSteps: captured.settleSteps,
        provenance: captured.provenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-png-encode", "웹툰 4컷 스트립 PNG 인코딩에 실패했습니다.", error, started) };
  }
}
