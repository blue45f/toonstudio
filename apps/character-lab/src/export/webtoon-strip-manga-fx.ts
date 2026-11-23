/** 컷 내부 효과선·효과음 스탬프와 PSD용 독립 투명 레이어. */
import { bakeDeterministicDialogueGlyphs, resolveFontStackByLocale } from "./webtoon-strip-bubbles";
import { WEBTOON_SFX_STAMP_KO_TEXT, resolveSfxGlyphByLocale, resolveSpeakerBubblePlacement } from "./webtoon-strip-fx-options";
import { blendPixelRgba, drawClippedLineRgba } from "./webtoon-strip-raster";

import type { CapturedRaster } from "../contracts";
import type {
  WebtoonDialogueLocale,
  WebtoonSfxStampOption,
  WebtoonStripFxLinesKind,
  WebtoonStripSpeakerTarget,
} from "./webtoon-strip-fx-options";

function deterministicHash01(index: number, seed: number): number {
  const raw = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

export function bakePanelActionLines(
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
