/** 모션 티저의 투명 컷 오버레이·카메라 영역·RGBA 프레임을 결정적으로 합성하는 순수 CPU 렌더러. */
import { clampMotionTeaserNumber as clampNumber } from "./webtoon-motion-teaser-frame";
import {
  DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  WEBTOON_MANUSCRIPT_MOODS,
  renderTransparentDialogueTextLayer,
  renderTransparentSfxStampLayer,
  renderTransparentSpeechBubbleFrameLayer,
} from "./webtoon-strip-composer";

import type { CutKineticOverlayPlacement, MotionTeaserCameraWindow, MotionTeaserFrameSample } from "./webtoon-motion-teaser-frame";
import type { WebtoonManuscriptMoodId, WebtoonStripLayout, WebtoonStripMangaFxOptions } from "./webtoon-strip-composer";
import type { CapturedRaster } from "../contracts";

/**
 * 4컷 각각의 투명 말풍선(프레임+대사)과 투명 효과음 스탬프 오버레이 래스터를 생성한다.
 */
export function buildCutKineticOverlays(
  layout: WebtoonStripLayout,
  mangaFx?: WebtoonStripMangaFxOptions,
): readonly CutKineticOverlayPlacement[] {
  if (!mangaFx?.enabled) return [];
  const innerWidth = layout.cutWidth;
  const innerHeight = layout.bubbleSafeTopPx + layout.cutHeight;
  const frameHeight = innerHeight + layout.borderPx * 2;
  const gutterHeights = layout.gutterHeights ?? [layout.gutterY, layout.gutterY, layout.gutterY];

  const overlays: CutKineticOverlayPlacement[] = [];
  let cursorY = layout.marginY;
  for (let idx = 0; idx < 4; idx += 1) {
    const cutIdx = idx as 0 | 1 | 2 | 3;
    const innerX = layout.marginX + layout.borderPx;
    const innerY = cursorY + layout.borderPx;
    cursorY += frameHeight + (idx < 3 ? (gutterHeights[idx as 0 | 1 | 2] ?? layout.gutterY) : 0);

    const shape = (mangaFx.bubbleShapes ?? DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES)[cutIdx];
    const dialogueText = (mangaFx.dialogueLines ?? DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES)[cutIdx];
    const fontScale = (mangaFx.bubbleFontScales ?? DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES)[cutIdx];
    const speakerTarget = (mangaFx.speakerTargets ?? DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS)[cutIdx];
    const sfx = (mangaFx.sfxStamps ?? DEFAULT_WEBTOON_STRIP_SFX_STAMPS)[cutIdx];

    let bubbleOverlay: CapturedRaster | null = null;
    if (mangaFx.includeSpeechBubbles !== false && shape !== "none") {
      const frameLayer = renderTransparentSpeechBubbleFrameLayer(innerWidth, innerHeight, {
        shape,
        speakerTarget,
        partnerSide: mangaFx.partnerSide ?? "right",
        locale: mangaFx.locale ?? "ko",
        jaWritingMode: mangaFx.jaWritingMode ?? "horizontal",
        dialogueText,
        cutIndex: cutIdx,
      });
      const textLayer = renderTransparentDialogueTextLayer(innerWidth, innerHeight, {
        dialogueText,
        shape,
        fontScale,
        speakerTarget,
        partnerSide: mangaFx.partnerSide ?? "right",
        locale: mangaFx.locale ?? "ko",
        jaWritingMode: mangaFx.jaWritingMode ?? "horizontal",
        cutIndex: cutIdx,
      });
      const merged = new Uint8ClampedArray(frameLayer.rgba);
      for (let p = 0; p < merged.length; p += 4) {
        const ta = (textLayer.rgba[p + 3] ?? 0) / 255;
        if (ta <= 0) continue;
        const ba = (merged[p + 3] ?? 0) / 255;
        const outA = ta + ba * (1 - ta);
        if (outA <= 0) continue;
        merged[p] = Math.round(((textLayer.rgba[p] ?? 0) * ta + (merged[p] ?? 0) * ba * (1 - ta)) / outA);
        merged[p + 1] = Math.round(((textLayer.rgba[p + 1] ?? 0) * ta + (merged[p + 1] ?? 0) * ba * (1 - ta)) / outA);
        merged[p + 2] = Math.round(((textLayer.rgba[p + 2] ?? 0) * ta + (merged[p + 2] ?? 0) * ba * (1 - ta)) / outA);
        merged[p + 3] = Math.round(outA * 255);
      }
      bubbleOverlay = { width: innerWidth, height: innerHeight, rgba: merged };
    }

    const sfxOverlay =
      sfx !== "none"
        ? renderTransparentSfxStampLayer(innerWidth, innerHeight, {
            stamp: sfx,
            speakerTarget,
            partnerSide: mangaFx.partnerSide ?? "right",
            locale: mangaFx.locale ?? "ko",
            cutIndex: cutIdx,
          })
        : null;

    overlays.push({
      cutIndex: cutIdx,
      innerX,
      innerY,
      innerWidth,
      innerHeight,
      bubbleOverlay,
      sfxOverlay,
    });
  }
  return overlays;
}

/**
 * 세로 4컷 스트립(`stripWidth × stripHeight`) 안에서 9:16 세로형 카메라가 비추는 소스 영역을 계산한다.
 */
export function computeMotionTeaserCameraWindow(
  stripWidth: number,
  stripHeight: number,
  scrollRatio01: number,
  dwellZoom = 1,
  outAspectWidthOverHeight = 9 / 16,
  shakeOffsetX = 0,
  shakeOffsetY = 0,
): MotionTeaserCameraWindow {
  const safeZoom = clampNumber(dwellZoom, 1, 1.12, 1);
  const safeRatio = clampNumber(scrollRatio01, 0, 1, 0);
  const srcWidth = Math.max(8, stripWidth / safeZoom);
  const idealHeight = srcWidth / Math.max(0.25, outAspectWidthOverHeight);
  const srcHeight = Math.min(stripHeight, Math.max(8, idealHeight));
  const maxSrcX = Math.max(0, stripWidth - srcWidth);
  const maxScrollY = Math.max(0, stripHeight - srcHeight);
  const srcX = Math.min(maxSrcX, Math.max(0, (stripWidth - srcWidth) * 0.5 + shakeOffsetX));
  const srcY = Math.min(maxScrollY, Math.max(0, maxScrollY * safeRatio + shakeOffsetY));
  return { srcX, srcY, srcWidth, srcHeight };
}

function compositeKineticOverlayOnStripCoord(
  sx: number,
  sy: number,
  overlay: CutKineticOverlayPlacement,
  popAlpha01: number,
  popScale: number,
): readonly [number, number, number, number] | null {
  if (popAlpha01 <= 0.01) return null;
  const cx = overlay.innerX + overlay.innerWidth * 0.5;
  const cy = overlay.innerY + overlay.innerHeight * 0.22;
  const invScale = 1 / Math.max(0.5, popScale);
  const lx = cx + (sx - cx) * invScale - overlay.innerX;
  const ly = cy + (sy - cy) * invScale - overlay.innerY;
  if (lx < 0 || lx >= overlay.innerWidth - 1 || ly < 0 || ly >= overlay.innerHeight - 1) return null;
  const ix = Math.round(lx);
  const iy = Math.round(ly);
  const idx = (iy * overlay.innerWidth + ix) * 4;

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  if (overlay.bubbleOverlay) {
    const ba = ((overlay.bubbleOverlay.rgba[idx + 3] ?? 0) / 255) * popAlpha01;
    if (ba > 0.01) {
      r = overlay.bubbleOverlay.rgba[idx] ?? 0;
      g = overlay.bubbleOverlay.rgba[idx + 1] ?? 0;
      b = overlay.bubbleOverlay.rgba[idx + 2] ?? 0;
      a = ba;
    }
  }
  if (overlay.sfxOverlay) {
    const sa = ((overlay.sfxOverlay.rgba[idx + 3] ?? 0) / 255) * popAlpha01;
    if (sa > 0.01) {
      const outA = sa + a * (1 - sa);
      r = Math.round(((overlay.sfxOverlay.rgba[idx] ?? 0) * sa + r * a * (1 - sa)) / outA);
      g = Math.round(((overlay.sfxOverlay.rgba[idx + 1] ?? 0) * sa + g * a * (1 - sa)) / outA);
      b = Math.round(((overlay.sfxOverlay.rgba[idx + 2] ?? 0) * sa + b * a * (1 - sa)) / outA);
      a = outA;
    }
  }
  return a > 0.01 ? [r, g, b, a] : null;
}

/**
 * 순수 CPU 쌍선형(bilinear) 보간으로 특정 프레임 샘플의 9:16 RGBA 버퍼를 결정적으로 렌더링한다.
 */
export function renderMotionTeaserFrameRgba(
  strip: CapturedRaster,
  outWidth: number,
  outHeight: number,
  sample: Pick<
    MotionTeaserFrameSample,
    "scrollRatio01" | "dwellZoom" | "progress01"
  > &
    Partial<Pick<MotionTeaserFrameSample, "cutBubbleAlphas" | "cutBubbleScales" | "shakeOffsetX" | "shakeOffsetY">>,
  moodId: WebtoonManuscriptMoodId = "daylight-paper",
  includeProgressBar = true,
  kineticOverlays: readonly CutKineticOverlayPlacement[] = [],
): CapturedRaster {
  const safeW = Math.max(16, Math.floor(outWidth));
  const safeH = Math.max(16, Math.floor(outHeight));
  const out = new Uint8ClampedArray(safeW * safeH * 4);
  const moodSpec = WEBTOON_MANUSCRIPT_MOODS[moodId] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];
  const [mr, mg, mb] = moodSpec.stripMarginRgb;

  const cam = computeMotionTeaserCameraWindow(
    strip.width,
    strip.height,
    sample.scrollRatio01,
    sample.dwellZoom,
    safeW / safeH,
    sample.shakeOffsetX ?? 0,
    sample.shakeOffsetY ?? 0,
  );

  const aspectRatio = cam.srcWidth / Math.max(1, cam.srcHeight);
  const targetAspect = safeW / safeH;
  const drawHeight = aspectRatio > targetAspect ? Math.max(1, Math.round(safeW / aspectRatio)) : safeH;
  const dstTop = Math.floor((safeH - drawHeight) * 0.5);
  const dstBottom = dstTop + drawHeight;

  for (let i = 0; i < out.length; i += 4) {
    out[i] = mr;
    out[i + 1] = mg;
    out[i + 2] = mb;
    out[i + 3] = 255;
  }

  const src = strip.rgba;
  const sw = strip.width;
  const sh = strip.height;
  const alphas = sample.cutBubbleAlphas ?? [1, 1, 1, 1];
  const scales = sample.cutBubbleScales ?? [1, 1, 1, 1];

  for (let py = dstTop; py < dstBottom; py += 1) {
    const ny = drawHeight > 1 ? (py - dstTop) / (drawHeight - 1) : 0;
    const sy = Math.min(sh - 1, Math.max(0, cam.srcY + ny * (cam.srcHeight - 1)));
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;

    for (let px = 0; px < safeW; px += 1) {
      const nx = safeW > 1 ? px / (safeW - 1) : 0;
      const sx = Math.min(sw - 1, Math.max(0, cam.srcX + nx * (cam.srcWidth - 1)));
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      let r = Math.round((src[i00] ?? 0) * w00 + (src[i10] ?? 0) * w10 + (src[i01] ?? 0) * w01 + (src[i11] ?? 0) * w11);
      let g = Math.round((src[i00 + 1] ?? 0) * w00 + (src[i10 + 1] ?? 0) * w10 + (src[i01 + 1] ?? 0) * w01 + (src[i11 + 1] ?? 0) * w11);
      let b = Math.round((src[i00 + 2] ?? 0) * w00 + (src[i10 + 2] ?? 0) * w10 + (src[i01 + 2] ?? 0) * w01 + (src[i11 + 2] ?? 0) * w11);

      for (let oi = 0; oi < kineticOverlays.length; oi += 1) {
        const ov = kineticOverlays[oi]!;
        const sampledOv = compositeKineticOverlayOnStripCoord(
          sx,
          sy,
          ov,
          alphas[ov.cutIndex],
          scales[ov.cutIndex],
        );
        if (sampledOv) {
          const oa = sampledOv[3];
          r = Math.round(sampledOv[0] * oa + r * (1 - oa));
          g = Math.round(sampledOv[1] * oa + g * (1 - oa));
          b = Math.round(sampledOv[2] * oa + b * (1 - oa));
        }
      }

      const dst = (py * safeW + px) * 4;
      out[dst] = r;
      out[dst + 1] = g;
      out[dst + 2] = b;
      out[dst + 3] = 255;
    }
  }

  if (includeProgressBar) {
    const barHeight = Math.max(3, Math.round(safeH * 0.005));
    const yStart = Math.max(0, safeH - barHeight);
    const filledWidth = Math.min(safeW, Math.max(2, Math.round(safeW * clampNumber(sample.progress01, 0, 1, 0))));
    for (let py = yStart; py < safeH; py += 1) {
      const rowOffset = py * safeW * 4;
      for (let px = 0; px < safeW; px += 1) {
        const dst = rowOffset + px * 4;
        if (px < filledWidth) {
          out[dst] = 228;
          out[dst + 1] = 179;
          out[dst + 2] = 99;
        } else {
          out[dst] = Math.round((out[dst] ?? 0) * 0.45 + 18 * 0.55);
          out[dst + 1] = Math.round((out[dst + 1] ?? 0) * 0.45 + 17 * 0.55);
          out[dst + 2] = Math.round((out[dst + 2] ?? 0) * 0.45 + 15 * 0.55);
        }
        out[dst + 3] = 255;
      }
    }
  }

  return { width: safeW, height: safeH, rgba: out };
}
