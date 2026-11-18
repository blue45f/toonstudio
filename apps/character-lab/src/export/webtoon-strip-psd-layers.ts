/**
 * 레이어 PSD 내보내기용 만화 연출(효과선·말풍선 프레임·대사 식자·효과음 스탬프) 투명 분리 레이어 빌더 및
 * 래스터 회전·사각 영역 채우기·효과음 스탬프 합성 모듈.
 */
import {
  WEBTOON_SFX_STAMP_KO_TEXT,
  resolveSfxGlyphByLocale,
  resolveSpeakerBubblePlacement,
} from "./webtoon-strip-composer";
import {
  bakeDeterministicDialogueGlyphs,
  bakePanelActionLines,
  bakeSpeechBubbleDialogueText,
  bakeSpeechBubbleFrame,
  blendPixelRgba,
  drawClippedLineRgba,
  resolveFontStackByLocale,
} from "./webtoon-strip-raster-fx";

import type {
  WebtoonDialogueLocale,
  WebtoonSfxStampOption,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleShape,
  WebtoonStripFxLinesKind,
  WebtoonStripSpeakerTarget,
} from "./webtoon-strip-composer";
import type { WebtoonJaWritingMode } from "./webtoon-strip-pacing-tategaki";
import type { CapturedRaster } from "../contracts";

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

export function fillRectRgba(
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
  const scale = 2;
  const w = Math.max(14, Math.floor(boxWidth * scale));
  const h = Math.max(10, Math.floor(boxHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  try {
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
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function bakePanelSfxStamp(
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
    readonly jaWritingMode?: WebtoonJaWritingMode;
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
    options.jaWritingMode ?? "horizontal",
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
    readonly jaWritingMode?: WebtoonJaWritingMode;
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
    options.jaWritingMode ?? "horizontal",
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
