/** 단행본 표지·목차의 RGBA 도형·재단선·비트맵 문자 그리기. */
/** 대문자 영문·숫자·기호 3×5 비트맵 폰트 (`VOL.01`, `CONTENTS`, `CH.01`, `P.03`, `ISBN` 표기용) */
const ASCII_BITMAP_3X5: Readonly<Record<string, readonly [number, number, number, number, number]>> = Object.freeze({
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b111, 0b101, 0b101, 0b101, 0b101],
  O: [0b111, 0b101, 0b101, 0b101, 0b111],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b111],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  ".": [0b000, 0b000, 0b000, 0b000, 0b010],
  "-": [0b000, 0b000, 0b111, 0b000, 0b000],
  ":": [0b000, 0b010, 0b000, 0b010, 0b000],
  "0": [0b111, 0b101, 0b101, 0b101, 0b111],
  "1": [0b010, 0b110, 0b010, 0b010, 0b111],
  "2": [0b111, 0b001, 0b111, 0b100, 0b111],
  "3": [0b111, 0b001, 0b111, 0b001, 0b111],
  "4": [0b101, 0b101, 0b111, 0b001, 0b001],
  "5": [0b111, 0b100, 0b111, 0b001, 0b111],
  "6": [0b111, 0b100, 0b111, 0b101, 0b111],
  "7": [0b111, 0b001, 0b001, 0b010, 0b010],
  "8": [0b111, 0b101, 0b111, 0b101, 0b111],
  "9": [0b111, 0b101, 0b111, 0b001, 0b111],
});

export function fillRectBooklet(
  rgba: Uint8ClampedArray,
  canvasW: number,
  canvasH: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
): void {
  const xStart = Math.max(0, Math.floor(x0));
  const yStart = Math.max(0, Math.floor(y0));
  const xEnd = Math.min(canvasW, Math.floor(x0 + w));
  const yEnd = Math.min(canvasH, Math.floor(y0 + h));
  for (let y = yStart; y < yEnd; y += 1) {
    let dst = (y * canvasW + xStart) * 4;
    for (let x = xStart; x < xEnd; x += 1) {
      rgba[dst] = r;
      rgba[dst + 1] = g;
      rgba[dst + 2] = b;
      rgba[dst + 3] = 255;
      dst += 4;
    }
  }
}

export function drawOutlineBox(
  rgba: Uint8ClampedArray,
  canvasW: number,
  canvasH: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  borderPx: number,
  r: number,
  g: number,
  b: number,
): void {
  fillRectBooklet(rgba, canvasW, canvasH, x0, y0, w, borderPx, r, g, b);
  fillRectBooklet(rgba, canvasW, canvasH, x0, y0 + h - borderPx, w, borderPx, r, g, b);
  fillRectBooklet(rgba, canvasW, canvasH, x0, y0, borderPx, h, r, g, b);
  fillRectBooklet(rgba, canvasW, canvasH, x0 + w - borderPx, y0, borderPx, h, r, g, b);
}

export function drawCornerCropMarks(
  rgba: Uint8ClampedArray,
  pageW: number,
  pageH: number,
  trimInset: number,
  r: number,
  g: number,
  b: number,
): void {
  const arm = Math.max(4, Math.floor(trimInset * 0.62));
  const gap = Math.max(1, Math.floor(trimInset * 0.22));
  const left = trimInset;
  const right = pageW - 1 - trimInset;
  const top = trimInset;
  const bottom = pageH - 1 - trimInset;

  fillRectBooklet(rgba, pageW, pageH, Math.max(0, left - gap - arm), top, arm, 1, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, left, Math.max(0, top - gap - arm), 1, arm, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, Math.min(pageW - arm, right + gap), top, arm, 1, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, right, Math.max(0, top - gap - arm), 1, arm, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, Math.max(0, left - gap - arm), bottom, arm, 1, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, left, Math.min(pageH - arm, bottom + gap), 1, arm, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, Math.min(pageW - arm, right + gap), bottom, arm, 1, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, right, Math.min(pageH - arm, bottom + gap), 1, arm, r, g, b);
}

export function stampAsciiBitmapText(
  rgba: Uint8ClampedArray,
  canvasW: number,
  canvasH: number,
  text: string,
  x: number,
  y: number,
  scale: number,
  rgb: readonly [number, number, number],
): number {
  const upper = text.toUpperCase();
  const s = Math.max(1, Math.floor(scale));
  const glyphW = 3 * s;
  const spacing = Math.max(1, s);
  let cursorX = Math.round(x);
  for (const ch of upper) {
    if (ch === " ") {
      cursorX += glyphW;
      continue;
    }
    const rows = ASCII_BITMAP_3X5[ch];
    if (rows) {
      for (let r = 0; r < 5; r += 1) {
        const bits = rows[r]!;
        for (let c = 0; c < 3; c += 1) {
          if (((bits >> (2 - c)) & 1) === 1) {
            fillRectBooklet(rgba, canvasW, canvasH, cursorX + c * s, y + r * s, s, s, rgb[0], rgb[1], rgb[2]);
          }
        }
      }
    }
    cursorX += glyphW + spacing;
  }
  return cursorX - Math.round(x);
}
