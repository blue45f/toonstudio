/**
 * 글로벌 마스터 무료 브러시 60종 순수 2D Canvas 스트로크 렌더러.
 *
 * 60종 모든 팁을 고유 기하·질감·광택·혼색 문법으로 렌더링한다.
 */
import {
  buildMasterBrushSamplePoints,
  createDeterministicRng,
  generateMasterBrushDabs,
} from "./global-master-brush-renderer-dabs";
import {
  drawSafeEllipse,
  fillSafeEllipse,
  fillSafeRect,
  paintDecoTip,
  paintImpastoAndDryTip,
  paintNatureTip,
  paintOrientalAndWatercolorTip,
  paintWebtoonInkTip,
  rgbaCss,
  shiftLightness,
  strokeSafeSegment,
} from "./global-master-brush-renderer-tips";
import type {
  GlobalMasterBrushDab,
  GlobalMasterBrushPreset,
  GlobalMasterRgbTuple,
  GlobalMasterStrokePoint,
  GlobalMasterStrokeRenderResult,
  RenderMasterBrushStrokeOptions,
} from "./global-master-brush-types";

export { buildMasterBrushSamplePoints, generateMasterBrushDabs };

function paintLightFxAndMangaTip(
  ctx: CanvasRenderingContext2D,
  dab: GlobalMasterBrushDab,
  rng: () => number,
): void {
  const { radiusX: rx, radiusY: ry, rgb, opacity } = dab;

  if (dab.tipShape === "neon-rim") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.18);
    fillSafeEllipse(ctx, 0, 0, rx * 1.9, ry * 1.9);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.38);
    fillSafeEllipse(ctx, 0, 0, rx * 1.15, ry * 1.15);
    return;
  }

  if (dab.tipShape === "anamorphic-flare") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.26);
    fillSafeEllipse(ctx, 0, 0, rx * 1.9, ry * 1.6);
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.56);
    fillSafeEllipse(ctx, 0, 0, rx * 1.12, ry * 1.0);
    ctx.fillStyle = rgbaCss([252, 254, 255], opacity * 0.94);
    fillSafeEllipse(ctx, 0, 0, rx * 0.46, ry * 0.42);
    return;
  }

  if (dab.tipShape === "sparkle-bokeh") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.22);
    fillSafeEllipse(ctx, 0, 0, rx * 0.92, ry * 0.92);
    ctx.strokeStyle = rgbaCss(shiftLightness(rgb, 48), opacity * 0.64);
    ctx.lineWidth = Math.max(0.8, rx * 0.08);
    drawSafeEllipse(ctx, 0, 0, rx * 0.92, ry * 0.92);
    if (typeof ctx.stroke === "function") ctx.stroke();
    ctx.strokeStyle = rgbaCss([255, 252, 236], opacity * 0.95);
    ctx.lineWidth = Math.max(0.9, rx * 0.13);
    strokeSafeSegment(ctx, -rx * 1.05, 0, rx * 1.05, 0);
    strokeSafeSegment(ctx, 0, -ry * 1.05, 0, ry * 1.05);
    ctx.fillStyle = rgbaCss([255, 255, 255], opacity * 0.92);
    fillSafeEllipse(ctx, 0, 0, rx * 0.24, ry * 0.24);
    return;
  }

  if (dab.tipShape === "nebula-dust") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.16);
    fillSafeEllipse(ctx, (rng() - 0.5) * rx * 0.4, (rng() - 0.5) * ry * 0.4, rx * 1.38, ry * 0.96);
    ctx.fillStyle = rgbaCss(shiftLightness(rgb, 44), opacity * 0.22);
    fillSafeEllipse(ctx, (rng() - 0.5) * rx * 0.5, (rng() - 0.5) * ry * 0.5, rx * 0.72, ry * 0.52);
    ctx.fillStyle = rgbaCss([255, 250, 255], opacity * 0.92);
    for (let s = 0; s < 5; s += 1) {
      const sx = (rng() * 2 - 1) * rx * 1.1;
      const sy = (rng() * 2 - 1) * ry * 0.9;
      fillSafeEllipse(ctx, sx, sy, 0.8 + rng() * 0.7, 0.8 + rng() * 0.7);
    }
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

  if (dab.tipShape === "focus-speedline") {
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.94);
    ctx.lineWidth = Math.max(0.8, ry * 0.45);
    for (let line = -2; line <= 2; line += 1) {
      const yOff = line * Math.max(1.4, ry * 1.4);
      const len = rx * (0.7 + rng() * 0.55);
      strokeSafeSegment(ctx, -len, yOff, len, yOff);
    }
    return;
  }

  if (dab.tipShape === "action-speed") {
    ctx.strokeStyle = rgbaCss(rgb, opacity * 0.92);
    for (let line = -2; line <= 2; line += 1) {
      const yOff = line * Math.max(2.6, ry * 1.15);
      ctx.lineWidth = line === 0 ? 1.5 : 0.75;
      const len = rx * (0.85 + rng() * 0.45);
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
  const bright = shiftLightness(rgb, 66);
  const dark = shiftLightness(rgb, -44);

  if (dab.tipShape === "glossy-hair") {
    const lines = 9;
    const isSheenBand = Math.abs(dab.progress - 0.48) < 0.14;
    for (let i = 0; i < lines; i += 1) {
      const frac = i / (lines - 1) - 0.5;
      const yOff = frac * ry * 2.1;
      const color = isSheenBand && Math.abs(frac) < 0.34 ? shiftLightness(rgb, 96) : i % 3 === 0 ? bright : rgb;
      ctx.strokeStyle = rgbaCss(color, opacity * (0.68 + rng() * 0.28));
      ctx.lineWidth = Math.max(0.8, ry * 0.14);
      strokeSafeSegment(ctx, -rx * 0.95, yOff, rx * 0.95, yOff);
    }
    return;
  }

  if (dab.tipShape === "fur-tuft") {
    for (let i = -3; i <= 3; i += 1) {
      const spreadY = i * ry * 0.34;
      ctx.strokeStyle = rgbaCss(i === 0 ? bright : i % 2 === 0 ? rgb : dark, opacity * (0.62 + rng() * 0.32));
      ctx.lineWidth = Math.max(0.75, ry * 0.16);
      strokeSafeSegment(ctx, -rx * 0.7, spreadY * 0.35, rx * (0.75 + rng() * 0.35), spreadY * 1.45);
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
    fillSafeRect(ctx, -rx * 0.86, -ry * 0.68, rx * 0.8, ry * 0.58);
    fillSafeRect(ctx, rx * 0.06, -ry * 0.68, rx * 0.8, ry * 0.58);
    fillSafeRect(ctx, -rx * 0.44, ry * 0.08, rx * 0.88, ry * 0.58);
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
    if (dab.tipShape === "kneaded-eraser") {
      for (let s = 0; s < 10; s += 1) {
        const ox = (rng() * 2 - 1) * rx * 0.92;
        const oy = (rng() * 2 - 1) * ry * 0.92;
        ctx.fillStyle = rgbaCss(paperRgb, opacity * (0.45 + rng() * 0.42));
        fillSafeEllipse(ctx, ox, oy, rx * (0.28 + rng() * 0.28), ry * (0.24 + rng() * 0.26));
      }
      return;
    }
    ctx.fillStyle = rgbaCss([255, 255, 255], opacity);
    fillSafeEllipse(ctx, 0, 0, rx * 1.05, ry * 0.92);
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

  if (dab.tipShape === "oil-smudge") {
    for (let i = -2; i <= 2; i += 1) {
      const yOff = i * ry * 0.48;
      ctx.strokeStyle = rgbaCss(i % 2 === 0 ? rgb : bright, opacity * 0.56);
      ctx.lineWidth = Math.max(1.2, ry * 0.34);
      strokeSafeSegment(ctx, -rx * 0.95, yOff, rx * 0.95, yOff + (rng() - 0.5) * ry * 0.22);
    }
    return;
  }

  if (dab.tipShape === "wet-blender") {
    ctx.fillStyle = rgbaCss(rgb, opacity * 0.2);
    fillSafeEllipse(ctx, 0, 0, rx * 1.28, ry * 1.22);
    ctx.fillStyle = rgbaCss(shiftLightness(rgb, 88), opacity * 0.28);
    fillSafeEllipse(ctx, 0, 0, rx * 0.72, ry * 0.72);
    return;
  }

  ctx.fillStyle = rgbaCss(rgb, opacity * 0.22);
  fillSafeEllipse(ctx, 0, 0, rx * 1.15, ry * 0.92);
  ctx.fillStyle = rgbaCss(bright, opacity * 0.26);
  fillSafeEllipse(ctx, 0, 0, rx * 0.62, ry * 0.52);
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
    paintWebtoonInkTip(ctx, dab, rng);
  }

  ctx.restore();
}

function paintBlenderEraserUnderwash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  darkPaper: boolean,
  isEraser: boolean,
): void {
  const bandRgb: GlobalMasterRgbTuple = darkPaper ? [134, 148, 174] : isEraser ? [62, 70, 88] : [86, 98, 122];
  ctx.save();
  ctx.fillStyle = rgbaCss(bandRgb, isEraser ? 0.52 : 0.24);
  if (typeof ctx.fillRect === "function") {
    ctx.fillRect(width * 0.08, height * 0.2, width * 0.84, height * 0.6);
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
    maxDabs: options.maxDabs,
  });
  const darkPaper = options.darkPaper ?? false;

  for (const dab of dabs) {
    paintSingleDab(ctx, dab, preset, darkPaper);
  }

  if (preset.tipProfile.shape === "neon-rim") {
    for (const dab of dabs) {
      ctx.save();
      ctx.translate(dab.x, dab.y);
      ctx.rotate(dab.angleRad);
      ctx.fillStyle = rgbaCss([252, 254, 255], dab.opacity * 0.94);
      fillSafeEllipse(ctx, 0, 0, dab.radiusX * 0.42, dab.radiusY * 0.42);
      ctx.restore();
    }
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
    paintBlenderEraserUnderwash(ctx, safeW, safeH, darkPaper, preset.blendBehavior === "erase");
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
