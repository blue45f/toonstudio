/**
 * 글로벌 마스터 무료 브러시 60종 팁별 순수 2D Canvas 그리기 헬퍼(파트 1: 잉크·로판·자연·수묵·수채·유화·마커·건식).
 */
import {
  evaluateDryPaperPeakCatch,
  samplePaperTooth,
} from "./global-master-brush-renderer-dabs";
import type {
  GlobalMasterBrushDab,
  GlobalMasterBrushPreset,
  GlobalMasterRgbTuple,
} from "./global-master-brush-types";

export function clampChannel(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v)));
}

export function rgbaCss(rgb: GlobalMasterRgbTuple, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${clampChannel(rgb[0])}, ${clampChannel(rgb[1])}, ${clampChannel(rgb[2])}, ${a.toFixed(3)})`;
}

export function shiftLightness(rgb: GlobalMasterRgbTuple, delta: number): GlobalMasterRgbTuple {
  return [
    clampChannel(rgb[0] + delta),
    clampChannel(rgb[1] + delta),
    clampChannel(rgb[2] + delta),
  ];
}

export function drawSafeEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation = 0,
): void {
  const safeRx = Math.max(0.4, rx);
  const safeRy = Math.max(0.4, ry);
  ctx.beginPath();
  if (typeof ctx.ellipse === "function") {
    ctx.ellipse(cx, cy, safeRx, safeRy, rotation, 0, Math.PI * 2);
  } else if (typeof ctx.arc === "function") {
    ctx.arc(cx, cy, (safeRx + safeRy) * 0.5, 0, Math.PI * 2);
  }
}

export function fillSafeEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation = 0,
): void {
  drawSafeEllipse(ctx, cx, cy, rx, ry, rotation);
  ctx.fill();
}

export function strokeSafeSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  if (typeof ctx.moveTo !== "function" || typeof ctx.lineTo !== "function") return;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  if (typeof ctx.stroke === "function") ctx.stroke();
}

export function fillSafeRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (typeof ctx.fillRect === "function") {
    ctx.fillRect(x, y, w, h);
  } else {
    fillSafeEllipse(ctx, x + w * 0.5, y + h * 0.5, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
  }
}

export function paintWebtoonInkTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  if (dab.tipShape === "speed-dip") {
    ctx.fillStyle = rgbaCss(rgb, opacity);
    if (typeof ctx.moveTo === "function" && typeof ctx.lineTo === "function") {
      ctx.beginPath();
      ctx.moveTo(-rx * 1.08, 0);
      ctx.lineTo(0, -ry * 0.92);
      ctx.lineTo(rx * 1.08, 0);
      ctx.lineTo(0, ry * 0.92);
      ctx.closePath();
      ctx.fill();
    } else {
      fillSafeEllipse(ctx, 0, 0, rx, ry);
    }
    return;
  }
  if (dab.tipShape === "rough-sumi-nib") {
    ctx.fillStyle = rgbaCss(rgb, opacity * dab.grainFactor);
    fillSafeEllipse(ctx, 0, 0, rx * 0.92, ry * 0.84);
    for (let k = 0; k < 5; k += 1) {
      const ox = (rng() * 2 - 1) * rx * 0.95;
      const oy = (rng() * 2 - 1) * ry * 1.05;
      ctx.fillStyle = rgbaCss(rgb, opacity * (0.38 + rng() * 0.5));
      fillSafeEllipse(ctx, ox, oy, rx * (0.28 + rng() * 0.34), ry * (0.22 + rng() * 0.3));
    }
    return;
  }
  if (dab.tipShape === "felt-liner") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.96);
    fillSafeEllipse(ctx, 0, 0, rx * 1.06, ry * 1.06);
    ctx.strokeStyle = rgbaCss(shiftLightness(rgb, -18), opacity * 0.52);
    ctx.lineWidth = Math.max(0.7, rx * 0.14);
    drawSafeEllipse(ctx, 0, 0, rx * 0.94, ry * 0.94);
    if (typeof ctx.stroke === "function") ctx.stroke();
    return;
  }
  ctx.fillStyle = rgbaCss(rgb, opacity * dab.grainFactor);
  fillSafeEllipse(ctx, 0, 0, rx, ry);
}

export function paintDecoTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  const bright = shiftLightness(rgb, 56);
  const dark = shiftLightness(rgb, -48);

  if (dab.tipShape === "frill-ribbon") {
    const waveShift = (dab.index % 2 === 0 ? -1 : 1) * ry * 0.22;
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.88);
    fillSafeEllipse(ctx, 0, -ry * 0.52 + waveShift, rx * 0.62, ry * 0.92);
    ctx.fillStyle = rgbaCss(bright, opacity * 0.72);
    fillSafeEllipse(ctx, -rx * 0.12, -ry * 0.85 + waveShift, rx * 0.38, ry * 0.34);
    ctx.strokeStyle = rgbaCss(dark, opacity * 0.86);
    ctx.lineWidth = Math.max(0.9, ry * 0.14);
    strokeSafeSegment(ctx, -rx * 0.28, -ry * 0.95 + waveShift, -rx * 0.12, ry * 0.45);
    strokeSafeSegment(ctx, rx * 0.28, -ry * 0.9 + waveShift, rx * 0.12, ry * 0.45);
    strokeSafeSegment(ctx, -rx * 0.75, ry * 0.42, rx * 0.75, ry * 0.42);
    return;
  }

  if (dab.tipShape === "antique-lace") {
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.9);
    ctx.lineWidth = Math.max(0.9, ry * 0.16);
    drawSafeEllipse(ctx, 0, 0, rx * 0.78, ry * 0.78);
    if (typeof ctx.stroke === "function") ctx.stroke();
    ctx.fillStyle = rgbaCss(bright, opacity * 0.45);
    fillSafeEllipse(ctx, 0, 0, rx * 0.24, ry * 0.24);
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      ctx.fillStyle = rgbaCss(rgb, opacity * 0.78);
      fillSafeEllipse(ctx, Math.cos(a) * rx * 0.52, Math.sin(a) * ry * 0.52, rx * 0.14, ry * 0.14);
    }
    return;
  }

  if (dab.tipShape === "diamond-brooch-chain") {
    ctx.strokeStyle = rgbaCss(shiftLightness(rgb, -24), opacity * 0.85);
    ctx.lineWidth = Math.max(1, ry * 0.16);
    strokeSafeSegment(ctx, -rx * 1.1, 0, -rx * 0.58, 0);
    strokeSafeSegment(ctx, rx * 0.58, 0, rx * 1.1, 0);
    if (typeof ctx.moveTo === "function" && typeof ctx.lineTo === "function") {
      ctx.beginPath();
      ctx.moveTo(0, -ry * 0.92);
      ctx.lineTo(rx * 0.68, 0);
      ctx.lineTo(0, ry * 0.92);
      ctx.lineTo(-rx * 0.68, 0);
      ctx.closePath();
      ctx.fillStyle = rgbaCss(rgb, opacity * 0.92);
      ctx.fill();
      ctx.strokeStyle = rgbaCss(bright, opacity * 0.9);
      if (typeof ctx.stroke === "function") ctx.stroke();
    }
    ctx.fillStyle = rgbaCss([252, 254, 255], opacity * 0.82);
    fillSafeEllipse(ctx, -rx * 0.18, -ry * 0.22, rx * 0.16, ry * 0.16);
    return;
  }

  if (dab.tipShape === "pearl-strand") {
    ctx.fillStyle = rgbaCss(dark, opacity * 0.58);
    fillSafeEllipse(ctx, rx * 0.14, ry * 0.18, rx * 0.92, ry * 0.92);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.98);
    fillSafeEllipse(ctx, 0, 0, rx * 0.88, ry * 0.88);
    ctx.fillStyle = rgbaCss(shiftLightness(rgb, 54), opacity * 0.82);
    fillSafeEllipse(ctx, -rx * 0.16, -ry * 0.16, rx * 0.54, ry * 0.52);
    ctx.fillStyle = rgbaCss([255, 254, 252], opacity * 0.95);
    fillSafeEllipse(ctx, -rx * 0.3, -ry * 0.3, rx * 0.24, ry * 0.2);
    return;
  }

  ctx.strokeStyle = rgbaCss(rgb, opacity * 0.94);
  ctx.lineWidth = Math.max(1.1, ry * 0.2);
  drawSafeEllipse(ctx, -rx * 0.35, -ry * 0.18, rx * 0.42, ry * 0.36);
  if (typeof ctx.stroke === "function") ctx.stroke();
  drawSafeEllipse(ctx, rx * 0.35, ry * 0.18, rx * 0.42, ry * 0.36);
  if (typeof ctx.stroke === "function") ctx.stroke();
  ctx.fillStyle = rgbaCss(bright, opacity * (0.65 + rng() * 0.3));
  fillSafeEllipse(ctx, 0, 0, rx * 0.22, ry * 0.22);
}

export function paintNatureTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  const light = shiftLightness(rgb, 48);
  const deep = shiftLightness(rgb, -38);

  if (dab.tipShape === "watercolor-cloud") {
    ctx.fillStyle = rgbaCss(deep, opacity * 0.26);
    fillSafeEllipse(ctx, 0, ry * 0.22, rx * 1.05, ry * 0.72);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.36);
    fillSafeEllipse(ctx, -rx * 0.35, 0, rx * 0.65, ry * 0.62);
    fillSafeEllipse(ctx, rx * 0.32, -ry * 0.08, rx * 0.62, ry * 0.56);
    ctx.fillStyle = rgbaCss(light, opacity * 0.42);
    fillSafeEllipse(ctx, 0, -ry * 0.28, rx * 0.58, ry * 0.46);
    return;
  }

  if (dab.tipShape === "sakura-petal") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.88);
    fillSafeEllipse(ctx, -rx * 0.2, -ry * 0.06, rx * 0.46, ry * 0.8, -0.32);
    fillSafeEllipse(ctx, rx * 0.2, -ry * 0.06, rx * 0.46, ry * 0.8, 0.32);
    ctx.fillStyle = rgbaCss(light, opacity * 0.62);
    fillSafeEllipse(ctx, 0, ry * 0.24, rx * 0.24, ry * 0.42);
    return;
  }

  if (dab.tipShape === "broadleaf-cluster") {
    for (let k = 0; k < 4; k += 1) {
      const a = -0.9 + k * 0.6 + (rng() - 0.5) * 0.25;
      const dist = rx * (0.28 + rng() * 0.32);
      ctx.fillStyle = rgbaCss(k % 2 === 0 ? rgb : deep, opacity * (0.72 + rng() * 0.24));
      fillSafeEllipse(ctx, Math.cos(a) * dist, Math.sin(a) * dist, rx * 0.46, ry * 0.22, a);
    }
    return;
  }

  if (dab.tipShape === "grass-tuft") {
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.92);
    ctx.lineWidth = Math.max(0.9, rx * 0.12);
    for (let b = -2; b <= 2; b += 1) {
      const tipX = b * rx * 0.26 + (rng() - 0.5) * rx * 0.16;
      const tipY = -ry * (0.95 + rng() * 0.45);
      strokeSafeSegment(ctx, b * rx * 0.08, ry * 0.45, tipX, tipY);
    }
    return;
  }

  ctx.fillStyle = rgbaCss(rgb, opacity * 0.86);
  fillSafeEllipse(ctx, 0, 0, rx * 0.88, ry * 0.84);
  ctx.strokeStyle = rgbaCss(deep, opacity * 0.72);
  ctx.lineWidth = Math.max(0.9, rx * 0.12);
  drawSafeEllipse(ctx, 0, 0, rx * 0.62, ry * 0.58, 0.35);
  if (typeof ctx.stroke === "function") ctx.stroke();
  ctx.fillStyle = rgbaCss(light, opacity * 0.52);
  fillSafeEllipse(ctx, -rx * 0.14, -ry * 0.14, rx * 0.34, ry * 0.3);
  ctx.fillStyle = rgbaCss(deep, opacity * 0.76);
  fillSafeEllipse(ctx, 0, 0, rx * 0.16, ry * 0.16);
}

export function paintOrientalAndWatercolorTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  preset: GlobalMasterBrushPreset,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  const dark = shiftLightness(rgb, -46);
  const bright = shiftLightness(rgb, 72);

  if (dab.tipShape === "dry-sumi" || dab.tipShape === "flat-calligraphy") {
    const strands = Math.max(4, preset.tipProfile.bristleCount);
    for (let i = 0; i < strands; i += 1) {
      if (dab.tipShape === "dry-sumi" && rng() < 0.28 + dab.progress * 0.38) continue;
      const frac = strands > 1 ? i / (strands - 1) - 0.5 : 0;
      const yOff = frac * ry * 1.9;
      ctx.fillStyle = rgbaCss(rgb, opacity * (0.68 + rng() * 0.3) * dab.grainFactor);
      fillSafeEllipse(ctx, (rng() - 0.5) * rx * 0.2, yOff, rx * 0.92, Math.max(0.65, ry * 0.2));
    }
    return;
  }

  if (dab.tipShape === "hangul-fine") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.96);
    fillSafeRect(ctx, -rx * 0.92, -ry * 0.52, rx * 1.84, ry * 1.04);
    ctx.fillStyle = rgbaCss(dark, opacity * 0.65);
    fillSafeEllipse(ctx, rx * 0.45, 0, rx * 0.48, ry * 0.52);
    return;
  }

  if (dab.tipShape === "hanji-bleed") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.26 * dab.grainFactor);
    fillSafeEllipse(ctx, 0, 0, rx * 1.24, ry * 1.08);
    ctx.fillStyle = rgbaCss(dark, opacity * 0.44);
    fillSafeEllipse(ctx, 0, 0, rx * 0.56, ry * 0.46);
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.34);
    ctx.lineWidth = 0.75;
    for (let f = 0; f < 5; f += 1) {
      const a = rng() * Math.PI * 2;
      const len = rx * (0.75 + rng() * 0.65);
      strokeSafeSegment(ctx, 0, 0, Math.cos(a) * len, Math.sin(a) * len * 0.85);
    }
    return;
  }

  if (dab.tipShape === "ink-splatter") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.92);
    fillSafeEllipse(ctx, 0, 0, rx * 0.55, ry * 0.52);
    for (let d = 0; d < 5; d += 1) {
      const a = rng() * Math.PI * 2;
      const dist = rx * (0.55 + rng() * 0.95);
      const r = Math.max(0.6, rx * (0.1 + rng() * 0.2));
      fillSafeEllipse(ctx, Math.cos(a) * dist, Math.sin(a) * dist, r, r * 0.9);
    }
    return;
  }

  if (dab.tipShape === "granulating-wash") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.24);
    fillSafeEllipse(ctx, 0, 0, rx * 1.12, ry * 1.06);
    for (let g = 0; g < 11; g += 1) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * rx * 0.92;
      ctx.fillStyle = rgbaCss(g % 3 === 0 ? dark : rgb, opacity * (0.45 + rng() * 0.42));
      fillSafeEllipse(ctx, Math.cos(a) * d, Math.sin(a) * d * 0.86, 1.4 + rng() * 1.3, 1.2 + rng());
    }
    return;
  }

  if (dab.tipShape === "wet-edge-backrun") {
    ctx.fillStyle = rgbaCss(bright, opacity * 0.16);
    fillSafeEllipse(ctx, 0, 0, rx * 0.72, ry * 0.72);
    ctx.strokeStyle = rgbaCss(dark, opacity * 0.74);
    ctx.lineWidth = Math.max(1.2, rx * 0.14);
    drawSafeEllipse(ctx, 0, 0, rx * 0.98, ry * 0.92);
    if (typeof ctx.stroke === "function") ctx.stroke();
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.46);
    ctx.lineWidth = Math.max(0.8, rx * 0.08);
    drawSafeEllipse(ctx, rx * 0.08, -ry * 0.06, rx * 0.78, ry * 0.72);
    if (typeof ctx.stroke === "function") ctx.stroke();
    return;
  }

  if (dab.tipShape === "flat-wash") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.36 * dab.grainFactor);
    fillSafeRect(ctx, -rx, -ry, rx * 2, ry * 2);
    return;
  }

  if (dab.tipShape === "salt-crystal") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.34);
    fillSafeEllipse(ctx, 0, 0, rx * 1.02, ry * 0.98);
    ctx.fillStyle = rgbaCss([246, 250, 255], opacity * 0.86);
    fillSafeEllipse(ctx, 0, 0, rx * 0.36, ry * 0.36);
    ctx.strokeStyle = rgbaCss([248, 252, 255], opacity * 0.88);
    ctx.lineWidth = Math.max(1.0, rx * 0.08);
    for (let s = 0; s < 6; s += 1) {
      const a = (s * Math.PI) / 3 + (rng() - 0.5) * 0.25;
      strokeSafeSegment(ctx, 0, 0, Math.cos(a) * rx * 0.88, Math.sin(a) * ry * 0.88);
    }
    return;
  }

  ctx.fillStyle = rgbaCss(shiftLightness(rgb, 24), opacity * 0.16);
  fillSafeEllipse(ctx, 0, 0, rx * 1.32, ry * 1.24);
  ctx.fillStyle = rgbaCss(rgb, opacity * 0.24);
  fillSafeEllipse(ctx, (rng() - 0.5) * rx * 0.3, (rng() - 0.5) * ry * 0.3, rx * 0.88, ry * 0.82);
}

export function paintImpastoAndDryTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  preset: GlobalMasterBrushPreset,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  const light = shiftLightness(rgb, 62);
  const shadow = shiftLightness(rgb, -52);

  if (dab.tipShape === "gold-foil") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.94);
    if (typeof ctx.moveTo === "function" && typeof ctx.lineTo === "function") {
      ctx.beginPath();
      ctx.moveTo(-rx * 0.8, -ry * 0.4);
      ctx.lineTo(rx * 0.4, -ry * 0.85);
      ctx.lineTo(rx * 0.9, ry * 0.25);
      ctx.lineTo(-rx * 0.2, ry * 0.8);
      ctx.closePath();
      ctx.fill();
    } else {
      fillSafeEllipse(ctx, 0, 0, rx * 0.8, ry * 0.72);
    }
    ctx.fillStyle = rgbaCss([255, 248, 212], opacity * (0.42 + rng() * 0.35));
    fillSafeEllipse(ctx, -rx * 0.16, -ry * 0.18, rx * 0.36, ry * 0.2);
    return;
  }

  if (dab.tipShape === "palette-knife") {
    ctx.fillStyle = rgbaCss(shadow, opacity * 0.62);
    fillSafeRect(ctx, -rx + 1.6, -ry + 1.8, rx * 2, ry * 2);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.95);
    fillSafeRect(ctx, -rx, -ry, rx * 2, ry * 2);
    ctx.strokeStyle = rgbaCss(light, opacity * 0.86);
    ctx.lineWidth = Math.max(1.2, ry * 0.32);
    strokeSafeSegment(ctx, -rx, -ry * 0.82, rx, -ry * 0.82);
    return;
  }

  if (dab.tipShape === "bristle-rib") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.92);
    fillSafeRect(ctx, -rx * 0.9, -ry * 0.92, rx * 1.8, ry * 1.84);
    const ribs = 7;
    for (let i = 0; i < ribs; i += 1) {
      const yOff = (i / (ribs - 1) - 0.5) * ry * 1.75;
      ctx.strokeStyle = rgbaCss(shadow, opacity * 0.72);
      ctx.lineWidth = Math.max(0.9, ry * 0.14);
      strokeSafeSegment(ctx, -rx * 0.9, yOff + 0.8, rx * 0.9, yOff + 0.8);
      ctx.strokeStyle = rgbaCss(light, opacity * 0.76);
      ctx.lineWidth = Math.max(0.8, ry * 0.12);
      strokeSafeSegment(ctx, -rx * 0.9, yOff - 0.5, rx * 0.9, yOff - 0.5);
    }
    return;
  }

  if (dab.tipShape === "hog-filbert" || dab.tipShape === "wet-oil-mix") {
    const ridgeOffset = Math.max(0.9, dab.impastoRidge * 2.1);
    if (dab.tipShape === "wet-oil-mix") {
      const warmTint: GlobalMasterRgbTuple = [
        clampChannel(rgb[0] + dab.progress * 44),
        clampChannel(rgb[1] + 22),
        clampChannel(rgb[2] - dab.progress * 32),
      ];
      ctx.fillStyle = rgbaCss(rgb, opacity * 0.54);
      fillSafeEllipse(ctx, 0, 0, rx * 1.15, ry * 1.05);
      ctx.fillStyle = rgbaCss(warmTint, opacity * 0.58);
      fillSafeEllipse(ctx, -rx * 0.15, -ry * 0.12, rx * 0.82, ry * 0.68);
      return;
    }
    ctx.fillStyle = rgbaCss(shadow, opacity * 0.48);
    fillSafeEllipse(ctx, ridgeOffset, ridgeOffset, rx, ry);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.9);
    fillSafeEllipse(ctx, 0, 0, rx, ry);
    ctx.fillStyle = rgbaCss(light, opacity * 0.52);
    fillSafeEllipse(ctx, -ridgeOffset * 0.7, -ridgeOffset * 0.7, rx * 0.72, ry * 0.42);
    for (let i = 0; i < 4; i += 1) {
      if (rng() < 0.35) continue;
      ctx.strokeStyle = rgbaCss(shadow, opacity * 0.42);
      ctx.lineWidth = 0.85;
      const yOff = (i / 3 - 0.5) * ry * 1.35;
      strokeSafeSegment(ctx, -rx * 0.65, yOff, rx * 0.65, yOff);
    }
    return;
  }

  if (dab.tipShape === "copic-brush") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.42);
    fillSafeEllipse(ctx, 0, 0, rx * 1.05, ry * 0.96);
    return;
  }

  if (dab.tipShape === "chisel-marker" || dab.tipShape === "highlighter") {
    ctx.fillStyle = rgbaCss(rgb, dab.tipShape === "highlighter" ? opacity * 0.4 : opacity * 0.44);
    fillSafeRect(ctx, -rx, -ry, rx * 2, ry * 2);
    return;
  }

  if (dab.tipShape === "dry-board-marker") {
    const bands = 6;
    for (let i = 0; i < bands; i += 1) {
      if ((i === 2 || i === 4) && rng() < 0.62) continue;
      const yOff = (i / (bands - 1) - 0.5) * ry * 1.9;
      ctx.fillStyle = rgbaCss(rgb, opacity * (0.55 + rng() * 0.4));
      fillSafeRect(ctx, -rx * 0.95, yOff - ry * 0.14, rx * 1.9, Math.max(0.7, ry * 0.26));
    }
    return;
  }

  const cosA = Math.cos(dab.angleRad);
  const sinA = Math.sin(dab.angleRad);
  const worldTooth = (lx: number, ly: number, scalePx: number, sheetSeed = 0x51a7_2026): number => {
    const wx = dab.x + lx * cosA - ly * sinA;
    const wy = dab.y + lx * sinA + ly * cosA;
    return samplePaperTooth(wx, wy, scalePx, sheetSeed);
  };

  if (dab.tipShape === "square-charcoal") {
    // 크로키 각목탄: 거친 판화지/목탄지(5.2px) 위 납작한 사각 블록 + 가장자리 숯가루 부스러기
    const toothScale = 5.2;
    const blockCount = 14;
    for (let i = 0; i < blockCount; i += 1) {
      const ox = (rng() * 2 - 1) * rx * 0.88;
      const oy = (rng() * 2 - 1) * ry * 0.82;
      const tooth = worldTooth(ox, oy, toothScale, 0x51a7_2026);
      const bite = evaluateDryPaperPeakCatch(tooth, dab.pressure, 0.64, 0.14, 0.12);
      if (bite <= 0.04) continue;
      const bw = rx * (0.2 + rng() * 0.28);
      const bh = Math.max(0.75, ry * (0.28 + rng() * 0.36));
      ctx.fillStyle = rgbaCss(
        tooth > 0.72 ? shadow : rgb,
        opacity * bite * (0.58 + rng() * 0.36),
      );
      fillSafeRect(ctx, ox - bw * 0.5, oy - bh * 0.5, bw, bh);
    }
    // 사각 목탄 모서리 바깥으로 떨어지는 건조 목탄 가루 부스러기
    for (let c = 0; c < 4; c += 1) {
      const side = c % 2 === 0 ? 1 : -1;
      const cx = side * rx * (0.76 + rng() * 0.34);
      const cy = (rng() * 2 - 1) * ry * 1.15;
      const tooth = worldTooth(cx, cy, toothScale * 0.75, 0x51a7_2026);
      if (tooth < 0.52) continue;
      const cr = Math.max(0.55, Math.min(rx, ry) * (0.14 + rng() * 0.18));
      ctx.fillStyle = rgbaCss(rgb, opacity * (0.34 + (tooth - 0.52) * 0.9));
      fillSafeRect(ctx, cx - cr * 0.6, cy - cr * 0.5, cr * 1.2, cr);
    }
    return;
  }

  if (dab.tipShape === "oil-pastel") {
    // 오일 파스텔 크레용: 굵은 왁스 골(Groove) + 날카로운 피크-캐치(골짜기 뚝 끊김) + 외곽 왁스 부스러기
    const toothScale = 5.6;
    const lanes = 4;
    for (let lane = 0; lane < lanes; lane += 1) {
      const laneFrac = lane / (lanes - 1) - 0.5;
      const baseY = laneFrac * ry * 1.48;
      for (let k = 0; k < 3; k += 1) {
        const ox = ((k - 1) * 0.58 + (rng() - 0.5) * 0.38) * rx;
        const oy = baseY + (rng() - 0.5) * ry * 0.24;
        const tooth = worldTooth(ox, oy, toothScale, 0x7c3b_2026);
        const bite = evaluateDryPaperPeakCatch(tooth, dab.pressure, 0.67, 0.12, 0.1);
        if (bite <= 0.05) continue;
        const w = rx * (0.34 + rng() * 0.26);
        const h = Math.max(0.9, ry * (0.24 + rng() * 0.2));
        const waxTone = tooth > 0.78 && lane === 0 ? light : rgb;
        ctx.fillStyle = rgbaCss(waxTone, opacity * bite * (0.76 + rng() * 0.24));
        fillSafeRect(ctx, ox - w * 0.5, oy - h * 0.5, w, h);
      }
    }
    // 왁스 스틱 외곽 부스러기(Crumb Flecks)
    for (let c = 0; c < 4; c += 1) {
      const a = rng() * Math.PI * 2;
      const dist = 0.78 + rng() * 0.34;
      const cx = Math.cos(a) * rx * dist;
      const cy = Math.sin(a) * ry * dist;
      const tooth = worldTooth(cx, cy, toothScale * 0.85, 0x7c3b_2026);
      if (tooth < 0.56) continue;
      const cr = Math.max(0.7, rx * (0.08 + rng() * 0.1));
      ctx.fillStyle = rgbaCss(c === 0 ? light : rgb, opacity * (0.58 + (tooth - 0.56) * 0.8));
      fillSafeRect(ctx, cx - cr, cy - cr * 0.75, cr * 2, cr * 1.5);
    }
    return;
  }

  if (dab.tipShape === "colored-pencil") {
    // 색연필 종이결 쉐이딩: 3.6px 코튼지 이빨에 끊기며 쌓이는 왁스 심 사선 해칭 + 미세 이빨 점
    const toothScale = 3.6;
    ctx.lineWidth = Math.max(0.75, Math.min(1.35, ry * 0.14));
    for (let i = -2; i <= 2; i += 1) {
      const off = i * ry * 0.36 + (rng() - 0.5) * ry * 0.14;
      for (let seg = 0; seg < 3; seg += 1) {
        const s0 = -0.88 + seg * 0.6;
        const s1 = s0 + 0.52;
        const midX = ((s0 + s1) * 0.5) * rx;
        const midY = off + ((s0 + s1) * 0.5) * ry * 0.32;
        const tooth = worldTooth(midX, midY, toothScale, 0x3b91_2026);
        const bite = evaluateDryPaperPeakCatch(tooth, dab.pressure, 0.62, 0.16, 0.13);
        if (bite <= 0.05) continue;
        ctx.strokeStyle = rgbaCss(rgb, opacity * bite * (0.52 + rng() * 0.34));
        strokeSafeSegment(
          ctx,
          s0 * rx,
          off + s0 * ry * 0.32,
          s1 * rx,
          off + s1 * ry * 0.32,
        );
      }
    }
    for (let g = 0; g < 6; g += 1) {
      const gx = (rng() * 2 - 1) * rx * 0.9;
      const gy = (rng() * 2 - 1) * ry * 0.84;
      const tooth = worldTooth(gx, gy, toothScale, 0x3b91_2026);
      const bite = evaluateDryPaperPeakCatch(tooth, dab.pressure, 0.66, 0.2, 0.12);
      if (bite <= 0.08) continue;
      ctx.fillStyle = rgbaCss(rgb, opacity * bite * 0.56);
      fillSafeEllipse(ctx, gx, gy, Math.max(0.55, rx * 0.12), Math.max(0.45, ry * 0.11));
    }
    return;
  }

  if (dab.tipShape === "pastel-chalk") {
    // 소프트 파스텔 초크: 거친 파스텔지(4.6px) 봉우리에 보송하게 얹히는 분필 가루 입자 구름
    const toothScale = 4.6;
    for (let i = 0; i < 16; i += 1) {
      const ox = (rng() * 2 - 1) * rx * 0.98;
      const oy = (rng() * 2 - 1) * ry * 0.96;
      const tooth = worldTooth(ox, oy, toothScale, 0x9f23_2026);
      const bite = evaluateDryPaperPeakCatch(tooth, dab.pressure, 0.58, 0.1, 0.17);
      if (bite <= 0.04) continue;
      const isHighlightDust = i % 4 === 0 && tooth > 0.66;
      ctx.fillStyle = rgbaCss(
        isHighlightDust ? light : rgb,
        opacity * bite * (0.24 + rng() * 0.36),
      );
      fillSafeEllipse(
        ctx,
        ox,
        oy,
        Math.max(0.65, rx * (0.14 + rng() * 0.18)),
        Math.max(0.55, ry * (0.13 + rng() * 0.17)),
      );
    }
    return;
  }

  // 6B 거친 흑연 연필(graphite-6b) 및 기타 건식 팁:
  // 3.3px 스케치북 종이 높이장 위 고주파 흑연 심 코어 + 사선 쉐이딩 입자
  const graphiteScale = 3.3;
  for (let c = 0; c < 5; c += 1) {
    const cx = (c / 4 - 0.5) * rx * 1.15 + (rng() - 0.5) * rx * 0.22;
    const cy = (rng() - 0.5) * ry * 0.64;
    const tooth = worldTooth(cx, cy, graphiteScale, 0x41d5_2026);
    const bite = evaluateDryPaperPeakCatch(tooth, dab.pressure, 0.62, 0.12, 0.12);
    if (bite <= 0.04) continue;
    ctx.fillStyle = rgbaCss(tooth > 0.7 ? shadow : rgb, opacity * bite * (0.64 + rng() * 0.3));
    fillSafeEllipse(
      ctx,
      cx,
      cy,
      Math.max(0.6, rx * (0.22 + rng() * 0.16)),
      Math.max(0.45, ry * (0.18 + rng() * 0.14)),
    );
  }
  const specks = preset.grainTexture.depth > 0.45 ? 11 : 6;
  for (let i = 0; i < specks; i += 1) {
    const ox = (rng() * 2 - 1) * rx * 0.96;
    const oy = (rng() * 2 - 1) * ry * 0.92;
    const tooth = worldTooth(ox, oy, graphiteScale, 0x41d5_2026);
    const bite = evaluateDryPaperPeakCatch(tooth, dab.pressure, 0.68, 0.16, 0.12);
    if (bite <= 0.05) continue;
    ctx.fillStyle = rgbaCss(rgb, opacity * bite * (0.42 + rng() * 0.42));
    fillSafeEllipse(
      ctx,
      ox,
      oy,
      Math.max(0.45, rx * (0.1 + rng() * 0.11)),
      Math.max(0.4, ry * (0.09 + rng() * 0.1)),
    );
  }
}
