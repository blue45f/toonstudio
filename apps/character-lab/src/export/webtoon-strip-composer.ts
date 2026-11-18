/**
 * 한국형 세로 스크롤 웹툰 4컷 콘티 스트립(등장 로우앵글 · 대화 반측면 · 감정 클로즈업 · 여운 하이앵글)
 * 원고 여백·먹선 테두리·말풍선 상단 안전 여백, 1~4컷 개별 말풍선 도형(타원·외침 가시·독백 박스·속삭임 점선·숨김),
 * 컷별 한국어 식자 폰트 강조 배율(소형·표준·강조), 컷별 오노마토페 효과음 스탬프(스릉·두근·쿠구궁·팟),
 * 및 1~4컷 개별 표정·시선·고개 연기 키프레임 스냅샷 시퀀스 합성 모듈.
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure } from "../contracts";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";
import { buildActingCutPlan, findWebtoonStripActingArc } from "./webtoon-strip-acting";
import { bakePanelActionLines, bakePanelSfxStamp, bakeSpeechBubbleBalloon, fillRectRgba } from "./webtoon-strip-raster-fx";

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
}

export const WEBTOON_VERTICAL_STRIP_CUTS: readonly WebtoonStripCutSpec[] = Object.freeze([
  { id: "intro-low", labelKo: "1컷 · 등장 전신 로우앵글", mode: "full-body", yawDeg: 0, pitchDeg: -14, distanceScale: 1 },
  { id: "dialogue-side", labelKo: "2컷 · 대화 상반신 반측면", mode: "bust", yawDeg: 28, pitchDeg: 0, distanceScale: 1 },
  { id: "emotion-face", labelKo: "3컷 · 감정 클로즈업 정면", mode: "face", yawDeg: -10, pitchDeg: 0, distanceScale: 1 },
  { id: "linger-high", labelKo: "4컷 · 여운 상반신 하이앵글", mode: "bust", yawDeg: -26, pitchDeg: 18, distanceScale: 1 },
]);

export type WebtoonStripFxLinesKind = "none" | "focus-radial" | "speed-diagonal" | "romance-sparkle";
export type WebtoonStripBubbleShape = "oval" | "shout-burst" | "monologue-box" | "whisper-dashed" | "none";
export type WebtoonStripBubbleFontScale = "sm" | "md" | "lg";
export type WebtoonSfxStampOption = "none" | SfxStampId;

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

export const DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES: WebtoonStripDialogueLines = Object.freeze([
  "여기서부터는 내 구역이야.",
  "기다리고 있었어, 그 말.",
  "지금 이 순간을 전부 기억해.",
  "끝까지 함께 가자.",
]) as WebtoonStripDialogueLines;

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

export const WEBTOON_SFX_STAMP_KO_TEXT: Readonly<Record<SfxStampId, { readonly glyphKo: string; readonly tiltDeg: number; readonly accentRgb: readonly [number, number, number]; readonly inkRgb: readonly [number, number, number] }>> = Object.freeze({
  seureung: { glyphKo: "스릉", tiltDeg: -11, accentRgb: [92, 232, 242], inkRgb: [18, 22, 34] },
  dugeun: { glyphKo: "두근", tiltDeg: 8, accentRgb: [244, 134, 168], inkRgb: [42, 18, 28] },
  kugugung: { glyphKo: "쿠구궁", tiltDeg: -7, accentRgb: [240, 184, 86], inkRgb: [24, 19, 18] },
  pat: { glyphKo: "팟", tiltDeg: 10, accentRgb: [255, 224, 118], inkRgb: [24, 21, 28] },
});

export interface WebtoonStripMangaFxOptions {
  readonly enabled: boolean;
  readonly linesKind?: WebtoonStripFxLinesKind;
  readonly includeSpeechBubbles?: boolean;
  readonly intensity?: number;
  /** 1~4컷 말풍선 내부에 직접 래스터 식자(타이포그래피 합성)할 한국어 대사 4줄 */
  readonly dialogueLines?: WebtoonStripDialogueLines;
  /** 1~4컷 개별 말풍선 모양(미지정 시 4컷 모두 기본 타원 `oval`) */
  readonly bubbleShapes?: WebtoonStripBubbleShapes;
  /** 1~4컷 개별 한국어 대사 폰트 강조 배율(미지정 시 `md`) */
  readonly bubbleFontScales?: WebtoonStripBubbleFontScales;
  /** 1~4컷 개별 한국어 효과음(오노마토페) 스탬프(미지정 시 `none`) */
  readonly sfxStamps?: WebtoonStripSfxStamps;
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

    const bubbleRight = idx % 2 === 1;
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
        bubbleRight,
        cutDialogue,
        cutShape,
        cutFontScale,
      );
    }

    if (fxEnabled) {
      const cutSfx: WebtoonSfxStampOption = mangaFx?.sfxStamps?.[idx] ?? "none";
      if (cutSfx !== "none") {
        bakePanelSfxStamp(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, !bubbleRight, cutSfx);
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
      const cut = WEBTOON_VERTICAL_STRIP_CUTS[idx];
      if (!cut) continue;
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
        panels.push(lit);
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
    const suffix = `-webtoon-4cut${actingTag}${fxTag}-strip.png`;
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
