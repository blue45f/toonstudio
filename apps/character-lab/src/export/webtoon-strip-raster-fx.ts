/**
 * 웹툰 4컷 스트립 픽셀 래스터 합성(집중선·속도선·스파클·발화자 말풍선·다국어 가로/세로쓰기 식자) 보조 모듈.
 */
import {
  resolveLocalizedBubbleAspect,
} from "./webtoon-strip-composer";
import {
  splitJapaneseTategakiColumns,
  tryRasterizeJapaneseTategakiCanvas2d,
} from "./webtoon-strip-pacing-tategaki";

import type {
  SpeakerBubblePlacement,
  WebtoonDialogueLocale,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleShape,
  WebtoonStripFxLinesKind,
} from "./webtoon-strip-composer";
import type { WebtoonJaWritingMode } from "./webtoon-strip-pacing-tategaki";

function deterministicHash01(index: number, seed: number): number {
  const raw = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

export function blendPixelRgba(
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

export function drawClippedLineRgba(
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

const JA_KINSOKU_INLINE = new Set(["。", "、", "！", "？", "…", "ー", "っ", "ゃ", "ゅ", "ょ"]);

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
    if (mid < chars.length - 1 && JA_KINSOKU_INLINE.has(chars[mid] ?? "")) {
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

export function resolveFontStackByLocale(locale: WebtoonDialogueLocale): string {
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
  const scale = 2;
  const w = Math.max(12, Math.floor(boxWidth * scale));
  const h = Math.max(8, Math.floor(boxHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  try {
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
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function bakeDeterministicTategakiColumns(
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
  columns: readonly string[],
  fontScale: WebtoonStripBubbleFontScale = "md",
  inkRgb: readonly [number, number, number] = [24, 21, 28],
): void {
  if (columns.length === 0) return;
  const { mul } = resolveFontScaleMultiplier(fontScale);
  const maxRow = Math.max(...columns.map((c) => Array.from(c).length), 1);
  const colCount = columns.length;
  const baseCellH = Math.max(3, Math.min(Math.floor((ry * 1.56) / maxRow), Math.floor((rx * 1.35) / Math.max(1, colCount))));
  const cellH = Math.max(2, Math.round(baseCellH * mul));
  const cellW = Math.max(2, Math.round(cellH * 0.96));
  const stepX = Math.max(cellW + 2, Math.round(cellW * 1.36));
  const stroke = Math.max(0.5, cellW * 0.12);
  const [ir, ig, ib] = inkRgb;

  const totalColsW = (colCount - 1) * stepX;
  const rightmostX = cx + totalColsW * 0.5;

  columns.forEach((col, colIdx) => {
    const chars = Array.from(col);
    const colX = rightmostX - colIdx * stepX;
    const startY = cy - ((chars.length - 1) * cellH) * 0.5;

    chars.forEach((ch, rowIdx) => {
      if (ch.trim() === "") return;
      const charCy = startY + rowIdx * cellH;
      const gx0 = colX - cellW * 0.34;
      const gx1 = colX + cellW * 0.34;
      const gy0 = charCy - cellH * 0.34;
      const gy1 = charCy + cellH * 0.34;

      if (ch === "。" || ch === "、") {
        blendPixelRgba(rgba, canvasWidth, Math.round(gx1), Math.round(gy0), clipX0, clipY0, clipX1, clipY1, ir, ig, ib, 0.92);
        return;
      }
      if (ch === "｜" || ch === "⋮") {
        drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, colX, gy0, colX, gy1, stroke, ir, ig, ib, 0.9);
        return;
      }
      drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gx1, gy0, stroke, ir, ig, ib, 0.9);
      drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, colX, gy0, colX, gy1, stroke, ir, ig, ib, 0.88);
      if ((ch.codePointAt(0) ?? 0) % 2 === 0) {
        drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, charCy, gx1, charCy, stroke, ir, ig, ib, 0.85);
      }
    });
  });
}

export function bakeDeterministicDialogueGlyphs(
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
  jaWritingMode: WebtoonJaWritingMode = "horizontal",
) {
  const border = Math.max(1, Math.round(innerWidth * 0.0042));
  const aspect = resolveLocalizedBubbleAspect(locale, dialogueText, jaWritingMode);
  const rawRx = Math.max(8, Math.round(innerWidth * 0.21 * aspect.scaleX));
  const rawRy = Math.max(5, Math.round(innerHeight * 0.092 * aspect.scaleY));
  const safePadX = border + 4;
  const rx = Math.min(rawRx, Math.max(8, Math.floor(innerWidth * 0.44) - safePadX));
  const ry = Math.min(rawRy, Math.max(5, Math.floor(innerHeight * 0.26)));
  const rawCx = innerX + Math.round(innerWidth * placement.centerXRatio);
  const minCx = innerX + rx + safePadX;
  const maxCx = innerX + innerWidth - rx - safePadX;
  const cx = minCx <= maxCx ? Math.min(maxCx, Math.max(minCx, rawCx)) : innerX + Math.round(innerWidth * 0.5);
  const cy = innerY + Math.round(ry * 1.28);
  return { rx, ry, cx, cy, border };
}

export function bakeSpeechBubbleFrame(
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
  jaWritingMode: WebtoonJaWritingMode = "horizontal",
): void {
  if (shape === "none") return;
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const { rx, ry, cx, cy, border } = computeSpeechBubbleMetrics(
    innerX,
    innerY,
    innerWidth,
    innerHeight,
    placement,
    locale,
    dialogueText,
    jaWritingMode,
  );

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

function downsample2xAlphaRasterOnto(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  clipX1: number,
  clipY1: number,
  cx: number,
  cy: number,
  boxW: number,
  boxH: number,
  raster: { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray },
): void {
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
}

export function bakeSpeechBubbleDialogueText(
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
  jaWritingMode: WebtoonJaWritingMode = "horizontal",
): void {
  if (shape === "none" || !dialogueText || dialogueText.trim().length === 0) return;
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const { rx, ry, cx, cy } = computeSpeechBubbleMetrics(
    innerX,
    innerY,
    innerWidth,
    innerHeight,
    placement,
    locale,
    dialogueText,
    jaWritingMode,
  );
  const boxW = Math.max(8, Math.round(rx * 1.66));
  const boxH = Math.max(6, Math.round(ry * 1.52));

  if (locale === "ja" && jaWritingMode === "vertical-tategaki") {
    const columns = splitJapaneseTategakiColumns(dialogueText);
    const { mul, weight } = resolveFontScaleMultiplier(fontScale);
    const raster = tryRasterizeJapaneseTategakiCanvas2d(boxW, boxH, columns, mul, weight, resolveFontStackByLocale("ja"));
    if (raster) {
      downsample2xAlphaRasterOnto(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, cx, cy, boxW, boxH, raster);
    } else {
      bakeDeterministicTategakiColumns(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, cx, cy, rx, ry, columns, fontScale);
    }
    return;
  }

  const [line1, line2] = splitLocalizedBubbleDialogue(dialogueText, locale);
  const raster = tryRasterizeDialogueCanvas2d(boxW, boxH, line1, line2, fontScale, locale);
  if (raster) {
    downsample2xAlphaRasterOnto(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, cx, cy, boxW, boxH, raster);
  } else {
    bakeDeterministicDialogueGlyphs(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, cx, cy, rx, ry, line1, line2, fontScale);
  }
}

export function bakeSpeechBubbleBalloon(
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
  jaWritingMode: WebtoonJaWritingMode = "horizontal",
): void {
  if (shape === "none") return;
  bakeSpeechBubbleFrame(rgba, canvasWidth, innerX, innerY, innerWidth, innerHeight, placement, shape, locale, dialogueText, jaWritingMode);
  bakeSpeechBubbleDialogueText(
    rgba,
    canvasWidth,
    innerX,
    innerY,
    innerWidth,
    innerHeight,
    placement,
    dialogueText,
    shape,
    fontScale,
    locale,
    jaWritingMode,
  );
}
