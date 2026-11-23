/**
 * 글로벌 마스터 무료 브러시 60종 순수 2D Canvas 스트로크 렌더러.
 *
 * 리본·레이스·체인·진주·자수·구름·벚꽃·나뭇잎·갈필·수묵·과립·백런·소금결정·
 * 임파스토·금박·마커·연필·네온·보케·플레어·마법진·집중선·해칭·망점·헤어·브레이드·
 * 벽돌·니트·털·블렌더·지우개 팁을 수학적으로 그려낸다.
 */
import {
  buildMasterBrushSamplePoints,
  createDeterministicRng,
  generateMasterBrushDabs,
} from "./global-master-brush-renderer-dabs";
import type {
  GlobalMasterBrushDab,
  GlobalMasterBrushPreset,
  GlobalMasterRgbTuple,
  GlobalMasterStrokePoint,
  GlobalMasterStrokeRenderResult,
  RenderMasterBrushStrokeOptions,
} from "./global-master-brush-types";

export { buildMasterBrushSamplePoints, generateMasterBrushDabs };

function clampChannel(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v)));
}

function rgbaCss(rgb: GlobalMasterRgbTuple, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${clampChannel(rgb[0])}, ${clampChannel(rgb[1])}, ${clampChannel(rgb[2])}, ${a.toFixed(3)})`;
}

function shiftLightness(rgb: GlobalMasterRgbTuple, delta: number): GlobalMasterRgbTuple {
  return [
    clampChannel(rgb[0] + delta),
    clampChannel(rgb[1] + delta),
    clampChannel(rgb[2] + delta),
  ];
}

function drawSafeEllipse(
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

function fillSafeEllipse(
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

function strokeSafeSegment(
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

function paintDecoTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  const bright = shiftLightness(rgb, 56);
  const dark = shiftLightness(rgb, -48);

  if (dab.tipShape === "frill-ribbon") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.88);
    fillSafeEllipse(ctx, 0, -ry * 0.35, rx * 0.85, ry * 0.72);
    ctx.fillStyle = rgbaCss(bright, opacity * 0.55);
    fillSafeEllipse(ctx, 0, -ry * 0.52, rx * 0.48, ry * 0.28);
    ctx.strokeStyle = rgbaCss(dark, opacity * 0.78);
    ctx.lineWidth = Math.max(0.8, ry * 0.14);
    strokeSafeSegment(ctx, -rx * 0.75, ry * 0.15, rx * 0.75, ry * 0.15);
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
    // 링크 체인 + 컷팅 다이아몬드 베젤
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
    ctx.fillStyle = rgbaCss(dark, opacity * 0.45);
    fillSafeEllipse(ctx, rx * 0.12, ry * 0.16, rx * 0.86, ry * 0.86);
    ctx.fillStyle = rgbaCss(shiftLightness(rgb, 36), opacity * 0.96);
    fillSafeEllipse(ctx, 0, 0, rx * 0.82, ry * 0.82);
    ctx.fillStyle = rgbaCss([255, 254, 252], opacity * 0.9);
    fillSafeEllipse(ctx, -rx * 0.28, -ry * 0.28, rx * 0.24, ry * 0.2);
    return;
  }

  // gold-embroidery: 바로크 스크롤 자수
  ctx.strokeStyle = rgbaCss(rgb, opacity * 0.94);
  ctx.lineWidth = Math.max(1.1, ry * 0.2);
  drawSafeEllipse(ctx, -rx * 0.35, -ry * 0.18, rx * 0.42, ry * 0.36);
  if (typeof ctx.stroke === "function") ctx.stroke();
  drawSafeEllipse(ctx, rx * 0.35, ry * 0.18, rx * 0.42, ry * 0.36);
  if (typeof ctx.stroke === "function") ctx.stroke();
  ctx.fillStyle = rgbaCss(bright, opacity * (0.65 + rng() * 0.3));
  fillSafeEllipse(ctx, 0, 0, rx * 0.22, ry * 0.22);
}

function paintNatureTip(
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
    fillSafeEllipse(ctx, -rx * 0.18, 0, rx * 0.52, ry * 0.78, -0.25);
    fillSafeEllipse(ctx, rx * 0.18, 0, rx * 0.52, ry * 0.78, 0.25);
    ctx.fillStyle = rgbaCss(light, opacity * 0.55);
    fillSafeEllipse(ctx, 0, ry * 0.2, rx * 0.22, ry * 0.44);
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

  // rose-blossom: 동심 나선 꽃잎
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

function paintOrientalAndWatercolorTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  preset: GlobalMasterBrushPreset,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  const dark = shiftLightness(rgb, -38);
  const bright = shiftLightness(rgb, 56);

  if (dab.tipShape === "dry-sumi" || dab.tipShape === "flat-calligraphy") {
    const strands = Math.max(4, preset.tipProfile.bristleCount);
    for (let i = 0; i < strands; i += 1) {
      if (dab.tipShape === "dry-sumi" && rng() < 0.26 + dab.progress * 0.32) continue;
      const frac = strands > 1 ? i / (strands - 1) - 0.5 : 0;
      const yOff = frac * ry * 1.9;
      ctx.fillStyle = rgbaCss(rgb, opacity * (0.68 + rng() * 0.3) * dab.grainFactor);
      fillSafeEllipse(ctx, (rng() - 0.5) * rx * 0.2, yOff, rx * 0.92, Math.max(0.65, ry * 0.2));
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

  // 수채/한지 번짐: 부드러운 코어 + 웨트 엣지 링 + 과립/소금 결정
  ctx.fillStyle = rgbaCss(rgb, opacity * 0.38 * dab.grainFactor);
  fillSafeEllipse(ctx, 0, 0, rx * 1.04, ry * 1.04);

  if (dab.wetEdgeStrength >= 0.65) {
    ctx.strokeStyle = rgbaCss(dark, opacity * dab.wetEdgeStrength * 0.44);
    ctx.lineWidth = Math.max(0.8, rx * 0.12);
    drawSafeEllipse(ctx, 0, 0, rx * 0.96, ry * 0.96);
    if (typeof ctx.stroke === "function") ctx.stroke();
  }

  if (dab.tipShape === "granulating-wash" || dab.tipShape === "hanji-bleed") {
    const grains = 6;
    ctx.fillStyle = rgbaCss(dark, opacity * 0.48);
    for (let g = 0; g < grains; g += 1) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * rx * 0.85;
      fillSafeEllipse(ctx, Math.cos(a) * d, Math.sin(a) * d * (ry / Math.max(1, rx)), 1.2, 1.1);
    }
  }

  if (dab.tipShape === "salt-crystal") {
    ctx.fillStyle = rgbaCss(bright, opacity * 0.65);
    fillSafeEllipse(ctx, 0, 0, rx * 0.34, ry * 0.34);
    ctx.strokeStyle = rgbaCss(bright, opacity * 0.55);
    ctx.lineWidth = 0.8;
    for (let s = 0; s < 4; s += 1) {
      const a = (s * Math.PI) / 4;
      strokeSafeSegment(ctx, Math.cos(a) * rx * 0.6, Math.sin(a) * ry * 0.6, -Math.cos(a) * rx * 0.6, -Math.sin(a) * ry * 0.6);
    }
  }
}

function paintImpastoAndDryTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  preset: GlobalMasterBrushPreset,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  const light = shiftLightness(rgb, 54);
  const shadow = shiftLightness(rgb, -46);

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

  // 임파스토 3D 융기 하이라이트/그림자
  if (dab.impastoRidge >= 0.35) {
    const ridgeOffset = Math.max(0.9, dab.impastoRidge * 2.2);
    ctx.fillStyle = rgbaCss(shadow, opacity * 0.42);
    fillSafeEllipse(ctx, ridgeOffset, ridgeOffset, rx, ry);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.92);
    fillSafeEllipse(ctx, 0, 0, rx, ry);
    ctx.fillStyle = rgbaCss(light, opacity * 0.46);
    fillSafeEllipse(ctx, -ridgeOffset * 0.7, -ridgeOffset * 0.7, rx * 0.78, ry * 0.45);
    if (dab.tipShape === "bristle-rib" || dab.tipShape === "hog-filbert") {
      const ribs = Math.min(8, Math.max(3, preset.tipProfile.bristleCount));
      ctx.strokeStyle = rgbaCss(light, opacity * 0.38);
      ctx.lineWidth = 0.75;
      for (let i = 0; i < ribs; i += 1) {
        const yOff = (i / (ribs - 1) - 0.5) * ry * 1.5;
        strokeSafeSegment(ctx, -rx * 0.75, yOff, rx * 0.75, yOff);
      }
    }
    return;
  }

  // 연필·목탄·파스텔·마커
  if (dab.tipShape === "chisel-marker" || dab.tipShape === "highlighter") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.58);
    if (typeof ctx.fillRect === "function") {
      ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
    } else {
      fillSafeEllipse(ctx, 0, 0, rx, ry);
    }
    return;
  }

  // 거친 건식 그레인 스탬프
  const specks = preset.grainTexture.depth > 0.45 ? 7 : 3;
  for (let i = 0; i < specks; i += 1) {
    const ox = (rng() * 2 - 1) * rx * 0.62;
    const oy = (rng() * 2 - 1) * ry * 0.62;
    ctx.fillStyle = rgbaCss(rgb, opacity * dab.grainFactor * (0.45 + rng() * 0.48));
    fillSafeEllipse(ctx, ox, oy, rx * (0.34 + rng() * 0.36), ry * (0.32 + rng() * 0.34));
  }
}

function paintLightFxAndMangaTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;

  if (dab.tipShape === "neon-rim" || dab.tipShape === "anamorphic-flare") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.24);
    fillSafeEllipse(ctx, 0, 0, rx * 1.85, ry * 1.85);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.54);
    fillSafeEllipse(ctx, 0, 0, rx * 1.12, ry * 1.12);
    ctx.fillStyle = rgbaCss([252, 254, 255], opacity * 0.92);
    fillSafeEllipse(ctx, 0, 0, rx * 0.46, ry * 0.46);
    return;
  }

  if (dab.tipShape === "sparkle-bokeh" || dab.tipShape === "nebula-dust") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.28);
    fillSafeEllipse(ctx, 0, 0, rx * 1.15, ry * 1.15);
    ctx.strokeStyle = rgbaCss([255, 252, 236], opacity * 0.9);
    ctx.lineWidth = Math.max(0.8, rx * 0.12);
    strokeSafeSegment(ctx, -rx * 0.95, 0, rx * 0.95, 0);
    strokeSafeSegment(ctx, 0, -ry * 0.95, 0, ry * 0.95);
    ctx.fillStyle = rgbaCss([255, 255, 255], opacity * 0.85);
    fillSafeEllipse(ctx, 0, 0, rx * 0.22, ry * 0.22);
    return;
  }

  if (dab.tipShape === "magic-rune") {
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.86);
    ctx.lineWidth = Math.max(0.9, rx * 0.09);
    drawSafeEllipse(ctx, 0, 0, rx * 0.92, ry * 0.92);
    if (typeof ctx.stroke === "function") ctx.stroke();
    drawSafeEllipse(ctx, 0, 0, rx * 0.62, ry * 0.62);
    if (typeof ctx.stroke === "function") ctx.stroke();
    for (let t = 0; t < 6; t += 1) {
      const a = (t * Math.PI) / 3;
      strokeSafeSegment(
        ctx,
        Math.cos(a) * rx * 0.64,
        Math.sin(a) * ry * 0.64,
        Math.cos(a) * rx * 0.9,
        Math.sin(a) * ry * 0.9,
      );
    }
    return;
  }

  if (dab.tipShape === "focus-speedline" || dab.tipShape === "action-speed") {
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.94);
    ctx.lineWidth = Math.max(0.8, ry * 0.45);
    for (let line = -2; line <= 2; line += 1) {
      const yOff = line * Math.max(1.4, ry * 1.4);
      const len = rx * (0.7 + rng() * 0.55);
      strokeSafeSegment(ctx, -len, yOff, len, yOff);
    }
    return;
  }

  if (dab.tipShape === "crosshatch-pen") {
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.82);
    ctx.lineWidth = 0.85;
    for (let k = -2; k <= 2; k += 1) {
      const d = k * rx * 0.28;
      strokeSafeSegment(ctx, -rx * 0.72, d, rx * 0.72, d);
      strokeSafeSegment(ctx, d, -ry * 0.72, d, ry * 0.72);
    }
    return;
  }

  // halftone-dot / sand-noise
  const count = dab.tipShape === "halftone-dot" ? 9 : 12;
  ctx.fillStyle = rgbaCss(rgb, opacity * 0.88);
  for (let i = 0; i < count; i += 1) {
    const gx =
      dab.tipShape === "halftone-dot"
        ? ((i % 3) - 1) * rx * 0.52
        : (rng() * 2 - 1) * rx * 0.82;
    const gy =
      dab.tipShape === "halftone-dot"
        ? (Math.floor(i / 3) - 1) * ry * 0.52
        : (rng() * 2 - 1) * ry * 0.82;
    const dotR =
      dab.tipShape === "halftone-dot"
        ? Math.max(0.7, rx * 0.14 * dab.pressure)
        : Math.max(0.55, rx * (0.06 + rng() * 0.08));
    fillSafeEllipse(ctx, gx, gy, dotR, dotR);
  }
}

function paintSurfaceAndBlenderTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  rng: () => number,
  darkPaper: boolean,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;
  const bright = shiftLightness(rgb, 56);
  const dark = shiftLightness(rgb, -42);

  if (dab.tipShape === "glossy-hair" || dab.tipShape === "fur-tuft") {
    const lines = 7;
    for (let i = 0; i < lines; i += 1) {
      const yOff = (i / (lines - 1) - 0.5) * ry * 1.9;
      ctx.strokeStyle = rgbaCss(i === 3 ? bright : rgb, opacity * (0.62 + rng() * 0.34));
      ctx.lineWidth = Math.max(0.75, ry * 0.18);
      strokeSafeSegment(ctx, -rx * 0.9, yOff, rx * 0.9, yOff + (rng() - 0.5) * ry * 0.25);
    }
    return;
  }

  if (dab.tipShape === "braid-plait") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.92);
    fillSafeEllipse(ctx, -rx * 0.24, -ry * 0.28, rx * 0.56, ry * 0.34, 0.45);
    fillSafeEllipse(ctx, rx * 0.24, ry * 0.28, rx * 0.56, ry * 0.34, -0.45);
    ctx.strokeStyle = rgbaCss(bright, opacity * 0.6);
    ctx.lineWidth = 0.85;
    strokeSafeSegment(ctx, -rx * 0.45, -ry * 0.4, rx * 0.3, ry * 0.1);
    return;
  }

  if (dab.tipShape === "brick-mortar") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.92);
    if (typeof ctx.fillRect === "function") {
      ctx.fillRect(-rx * 0.86, -ry * 0.68, rx * 0.8, ry * 0.58);
      ctx.fillRect(rx * 0.06, -ry * 0.68, rx * 0.8, ry * 0.58);
      ctx.fillRect(-rx * 0.44, ry * 0.08, rx * 0.88, ry * 0.58);
    } else {
      fillSafeEllipse(ctx, 0, 0, rx * 0.85, ry * 0.62);
    }
    ctx.strokeStyle = rgbaCss(dark, opacity * 0.45);
    ctx.lineWidth = 0.8;
    strokeSafeSegment(ctx, -rx * 0.86, 0, rx * 0.86, 0);
    return;
  }

  if (dab.tipShape === "knit-weave") {
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.9);
    ctx.lineWidth = Math.max(1, rx * 0.13);
    strokeSafeSegment(ctx, -rx * 0.52, -ry * 0.48, 0, ry * 0.42);
    strokeSafeSegment(ctx, rx * 0.52, -ry * 0.48, 0, ry * 0.42);
    ctx.strokeStyle = rgbaCss(bright, opacity * 0.45);
    strokeSafeSegment(ctx, -rx * 0.26, -ry * 0.44, 0, ry * 0.14);
    return;
  }

  if (dab.blendBehavior === "erase") {
    const paperRgb: GlobalMasterRgbTuple = darkPaper ? [34, 36, 44] : [248, 246, 241];
    ctx.fillStyle = rgbaCss(
      paperRgb,
      dab.tipShape === "kneaded-eraser" ? opacity * 0.58 * dab.grainFactor : opacity * 0.96,
    );
    fillSafeEllipse(ctx, 0, 0, rx, ry);
    return;
  }

  if (dab.blendBehavior === "chroma-bleed") {
    ctx.fillStyle = rgbaCss([226, 98, 126], opacity * 0.28);
    fillSafeEllipse(ctx, -rx * 0.18, 0, rx * 1.05, ry * 1.05);
    ctx.fillStyle = rgbaCss([92, 162, 224], opacity * 0.24);
    fillSafeEllipse(ctx, rx * 0.18, 0, rx * 1.05, ry * 1.05);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.34);
    fillSafeEllipse(ctx, 0, 0, rx * 0.78, ry * 0.78);
    return;
  }

  // wet-blender / oil-smudge / alcohol-blender
  ctx.fillStyle = rgbaCss(rgb, opacity * 0.28);
  fillSafeEllipse(ctx, 0, 0, rx * 1.12, ry * 1.12);
  ctx.fillStyle = rgbaCss(bright, opacity * 0.22);
  fillSafeEllipse(ctx, 0, 0, rx * 0.65, ry * 0.65);
}

function paintSingleDab(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  preset: GlobalMasterBrushPreset,
  darkPaper: boolean,
): void {
  const rng = createDeterministicRng(dab.seed);
  ctx.save();
  ctx.translate(dab.x, dab.y);
  ctx.rotate(dab.angleRad);

  if (preset.category === "rofan-deco") {
    paintDecoTip(ctx, dab, rng);
  } else if (preset.category === "nature-foliage") {
    paintNatureTip(ctx, dab, rng);
  } else if (
    preset.category === "oriental-calligraphy" ||
    preset.category === "granulating-watercolor"
  ) {
    paintOrientalAndWatercolorTip(ctx, dab, preset, rng);
  } else if (
    preset.category === "impasto-oil" ||
    preset.category === "graphite-pastel" ||
    (preset.category === "alcohol-marker" && dab.blendBehavior !== "smudge")
  ) {
    paintImpastoAndDryTip(ctx, dab, preset, rng);
  } else if (
    preset.category === "light-fx-glitter" ||
    preset.category === "manga-tone-speed"
  ) {
    paintLightFxAndMangaTip(ctx, dab, rng);
  } else if (
    preset.category === "hair-fabric-surface" ||
    preset.category === "blender-eraser-pro" ||
    dab.blendBehavior === "smudge"
  ) {
    paintSurfaceAndBlenderTip(ctx, dab, rng, darkPaper);
  } else {
    // webtoon-ink 기본 펜촉
    ctx.fillStyle = rgbaCss(dab.rgb, dab.opacity * dab.grainFactor);
    fillSafeEllipse(ctx, 0, 0, dab.radiusX, dab.radiusY);
    if (dab.tipShape === "rough-sumi-nib") {
      ctx.fillStyle = rgbaCss(dab.rgb, dab.opacity * 0.45);
      fillSafeEllipse(ctx, (rng() - 0.5) * dab.radiusX * 0.6, (rng() - 0.5) * dab.radiusY * 0.6, dab.radiusX * 0.55, dab.radiusY * 0.45);
    }
  }

  ctx.restore();
}

function paintBlenderEraserUnderwash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  darkPaper: boolean,
): void {
  const bandRgb: GlobalMasterRgbTuple = darkPaper ? [134, 148, 174] : [86, 98, 122];
  ctx.save();
  ctx.fillStyle = rgbaCss(bandRgb, 0.24);
  if (typeof ctx.fillRect === "function") {
    ctx.fillRect(width * 0.08, height * 0.26, width * 0.84, height * 0.48);
  }
  ctx.restore();
}

/**
 * 사용자가 라이브 테스트 패드에서 직접 그린 포인터 스트로크를 2D 캔버스에 렌더링한다.
 */
export function renderMasterBrushUserStroke(
  ctx: CanvasRenderingContext2D,
  preset: GlobalMasterBrushPreset,
  points: readonly GlobalMasterStrokePoint[],
  options: RenderMasterBrushStrokeOptions = {},
): GlobalMasterStrokeRenderResult {
  const dabs = generateMasterBrushDabs(preset, points, {
    sizeScale: options.sizeScale,
    inkRgb: options.inkRgb,
  });
  const darkPaper = options.darkPaper ?? false;

  for (const dab of dabs) {
    paintSingleDab(ctx, dab, preset, darkPaper);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const dab of dabs) {
    minX = Math.min(minX, dab.x - dab.radiusX);
    maxX = Math.max(maxX, dab.x + dab.radiusX);
    minY = Math.min(minY, dab.y - dab.radiusY);
    maxY = Math.max(maxY, dab.y + dab.radiusY);
  }

  return {
    presetId: preset.id,
    dabCount: dabs.length,
    boundingWidth: dabs.length > 0 ? Math.max(0, Math.round(maxX - minX)) : 0,
    boundingHeight: dabs.length > 0 ? Math.max(0, Math.round(maxY - minY)) : 0,
  };
}

/**
 * 2D 캔버스에 해당 프리셋의 대표 스트로크 프리뷰 샘플을 결정론적으로 렌더링한다.
 */
export function renderMasterBrushStrokeSample(
  ctx: CanvasRenderingContext2D,
  preset: GlobalMasterBrushPreset,
  width: number,
  height: number,
  options: RenderMasterBrushStrokeOptions = {},
): GlobalMasterStrokeRenderResult {
  const safeW = Math.max(32, Math.round(width));
  const safeH = Math.max(24, Math.round(height));
  const shouldClear = options.clearCanvas ?? true;
  const darkPaper = options.darkPaper ?? preset.category === "light-fx-glitter";

  if (shouldClear && typeof ctx.clearRect === "function") {
    ctx.clearRect(0, 0, safeW, safeH);
  }

  if (preset.category === "light-fx-glitter" && shouldClear && typeof ctx.fillRect === "function") {
    ctx.fillStyle = rgbaCss([18, 22, 34], 0.94);
    ctx.fillRect(0, 0, safeW, safeH);
  } else if (preset.category === "blender-eraser-pro") {
    paintBlenderEraserUnderwash(ctx, safeW, safeH, darkPaper);
  }

  const autoScale =
    options.sizeScale ?? Math.min(1.1, Math.max(0.52, safeH / 64));
  const samplePoints = buildMasterBrushSamplePoints(safeW, safeH, preset);

  return renderMasterBrushUserStroke(ctx, preset, samplePoints, {
    sizeScale: autoScale,
    inkRgb: options.inkRgb,
    darkPaper,
    clearCanvas: false,
  });
}
