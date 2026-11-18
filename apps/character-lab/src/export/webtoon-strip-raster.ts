/** 말풍선·식자·효과선이 공유하는 클리핑과 알파 픽셀 합성. */
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
