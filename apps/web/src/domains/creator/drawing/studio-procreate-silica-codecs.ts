/**
 * studio-procreate-silica-codecs.ts
 *
 * REA(`reverse-engineer-anything`)를 통해 역공학한 Procreate:
 * - 3D Model Painting & Lighting Studio (`evaluateProcreate3dLightingStudio`)
 * - Accessibility Single-Touch Gestures (`evaluateProcreateSingleTouchGesture`)
 * - Native File Format Codecs (`.swatches` `Swatches.json`, `.procreate` `SilicaDocument`, `.brush` `SilicaBrush`)
 */

import {
  DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG,
  evaluateProcreateHoverPreview,
  evaluateProcreateSilicaDab,
  STUDIO_PROCREATE_BRUSH_PRESETS,
  STUDIO_PROCREATE_BRUSH_SETS,
  type ProcreateSilicaBrushConfig,
} from "./studio-procreate-brush-studio";

const clamp = (v: number, min: number, max: number): number =>
  !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;

function hsvToRgb01(h01: number, s01: number, v01: number): { r: number; g: number; b: number } {
  const h = ((h01 % 1) + 1) % 1;
  const s = clamp(s01, 0, 1);
  const v = clamp(v01, 0, 1);
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    default:
      return { r: v, g: p, b: q };
  }
}

function rgb01ToHex(rgb: { readonly r: number; readonly g: number; readonly b: number }): string {
  const toHex = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/* ============================================================================
 * 1. 3D Model Painting & Lighting Studio (4 Lights + 11 Environments)
 * ========================================================================== */

export type Procreate3dEnvironmentPresetId =
  | "studio"
  | "daylight"
  | "nightclub"
  | "sunset"
  | "industrial"
  | "forest"
  | "arctic"
  | "neon"
  | "warm-interior"
  | "dramatic"
  | "overcast";

export interface Procreate3dStudioLight {
  readonly id: string;
  readonly direction: { readonly x: number; readonly y: number; readonly z: number };
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly intensity01: number;
}

export function evaluateProcreate3dLightingStudio(input: {
  readonly baseColor: { readonly r: number; readonly g: number; readonly b: number };
  readonly metallic01: number;
  readonly roughness01: number;
  readonly surfaceNormal: { readonly x: number; readonly y: number; readonly z: number };
  readonly lights: readonly Procreate3dStudioLight[];
  readonly environmentPreset: Procreate3dEnvironmentPresetId;
  readonly environmentExposure01?: number;
}): {
  readonly litColor: { readonly r: number; readonly g: number; readonly b: number };
  readonly specularHighlight01: number;
  readonly activeLightCount: number;
} {
  const activeLights = input.lights.slice(0, 4);
  const nLen =
    Math.hypot(input.surfaceNormal.x, input.surfaceNormal.y, input.surfaceNormal.z) || 1;
  const nx = input.surfaceNormal.x / nLen;
  const ny = input.surfaceNormal.y / nLen;
  const nz = input.surfaceNormal.z / nLen;

  const metallic = clamp(input.metallic01, 0, 1);
  const roughness = clamp(input.roughness01, 0.04, 1);
  const envExposure = clamp(input.environmentExposure01 ?? 0.6, 0, 1);

  let diffR = input.baseColor.r * (0.15 + envExposure * 0.25) * (1 - metallic * 0.65);
  let diffG = input.baseColor.g * (0.15 + envExposure * 0.25) * (1 - metallic * 0.65);
  let diffB = input.baseColor.b * (0.15 + envExposure * 0.25) * (1 - metallic * 0.65);
  let specTotal = 0;

  const shininess = (1 - roughness) * 48 + 2;

  for (const light of activeLights) {
    const lLen = Math.hypot(light.direction.x, light.direction.y, light.direction.z) || 1;
    const lx = light.direction.x / lLen;
    const ly = light.direction.y / lLen;
    const lz = light.direction.z / lLen;
    const nDotL = Math.max(0, nx * lx + ny * ly + nz * lz);
    const intensity = clamp(light.intensity01, 0, 2);

    diffR += input.baseColor.r * light.color.r * nDotL * intensity * (1 - metallic * 0.5);
    diffG += input.baseColor.g * light.color.g * nDotL * intensity * (1 - metallic * 0.5);
    diffB += input.baseColor.b * light.color.b * nDotL * intensity * (1 - metallic * 0.5);

    const hx = lx;
    const hy = ly;
    const hz = lz + 1;
    const hLen = Math.hypot(hx, hy, hz) || 1;
    const nDotH = Math.max(0, (nx * hx + ny * hy + nz * hz) / hLen);
    const spec = Math.pow(nDotH, shininess) * intensity * (0.25 + 0.75 * metallic);
    specTotal += spec;

    diffR += light.color.r * spec;
    diffG += light.color.g * spec;
    diffB += light.color.b * spec;
  }

  return {
    litColor: {
      r: clamp(diffR, 0, 1),
      g: clamp(diffG, 0, 1),
      b: clamp(diffB, 0, 1),
    },
    specularHighlight01: clamp(specTotal, 0, 1),
    activeLightCount: activeLights.length,
  };
}

/* ============================================================================
 * 2. Accessibility Single-Touch Gestures
 * ========================================================================== */

export function evaluateProcreateSingleTouchGesture(input: {
  readonly mode: "pan" | "zoom" | "rotate" | "fit-screen";
  readonly deltaX: number;
  readonly deltaY: number;
  readonly currentZoom: number;
  readonly currentRotationDeg: number;
}): {
  readonly panDeltaX: number;
  readonly panDeltaY: number;
  readonly nextZoom: number;
  readonly nextRotationDeg: number;
} {
  if (input.mode === "fit-screen") {
    return { panDeltaX: 0, panDeltaY: 0, nextZoom: 1, nextRotationDeg: 0 };
  }
  if (input.mode === "pan") {
    return {
      panDeltaX: input.deltaX,
      panDeltaY: input.deltaY,
      nextZoom: input.currentZoom,
      nextRotationDeg: input.currentRotationDeg,
    };
  }
  if (input.mode === "zoom") {
    const scaleFactor = clamp(1 + (input.deltaX - input.deltaY) * 0.005, 0.25, 4);
    return {
      panDeltaX: 0,
      panDeltaY: 0,
      nextZoom: clamp(input.currentZoom * scaleFactor, 0.1, 64),
      nextRotationDeg: input.currentRotationDeg,
    };
  }
  return {
    panDeltaX: 0,
    panDeltaY: 0,
    nextZoom: input.currentZoom,
    nextRotationDeg: (input.currentRotationDeg + input.deltaX * 0.45) % 360,
  };
}

/* ============================================================================
 * 3. Native Procreate File Format Codecs (.swatches, .brush, .procreate)
 * ========================================================================== */

export interface ProcreateSwatchEntry {
  readonly hue: number;
  readonly saturation: number;
  readonly brightness: number;
  readonly alpha: number;
  readonly colorSpace: number;
  readonly hex: string;
}

export interface ProcreateSwatchesPalette {
  readonly name: string;
  readonly swatches: readonly (ProcreateSwatchEntry | null)[];
}

export function parseProcreateSwatchesJson(jsonText: string): ProcreateSwatchesPalette {
  const parsed = JSON.parse(jsonText) as
    | { name?: string; swatches?: (Record<string, number> | null)[] }
    | { name?: string; swatches?: (Record<string, number> | null)[] }[];
  const root = Array.isArray(parsed) ? (parsed[0] ?? {}) : parsed;
  const name = typeof root.name === "string" && root.name.trim() ? root.name.trim() : "Untitled Palette";
  const rawList = Array.isArray(root.swatches) ? root.swatches : [];

  const swatches: (ProcreateSwatchEntry | null)[] = [];
  for (let i = 0; i < 30; i += 1) {
    const item = rawList[i];
    if (!item || typeof item.hue !== "number") {
      swatches.push(null);
      continue;
    }
    const h = clamp(item.hue, 0, 1);
    const s = clamp(item.saturation ?? 1, 0, 1);
    const v = clamp(item.brightness ?? 1, 0, 1);
    const a = clamp(item.alpha ?? 1, 0, 1);
    const rgb = hsvToRgb01(h, s, v);
    swatches.push({
      hue: h,
      saturation: s,
      brightness: v,
      alpha: a,
      colorSpace: item.colorSpace ?? 0,
      hex: rgb01ToHex(rgb),
    });
  }
  return { name, swatches };
}

export function serializeProcreateSwatchesJson(palette: {
  readonly name: string;
  readonly swatches: readonly ({
    readonly hue: number;
    readonly saturation: number;
    readonly brightness: number;
    readonly alpha?: number;
    readonly colorSpace?: number;
  } | null)[];
}): string {
  return JSON.stringify([
    {
      name: palette.name,
      swatches: Array.from({ length: 30 }, (_, idx) => {
        const s = palette.swatches[idx];
        if (!s) return null;
        return {
          hue: clamp(s.hue, 0, 1),
          saturation: clamp(s.saturation, 0, 1),
          brightness: clamp(s.brightness, 0, 1),
          alpha: clamp(s.alpha ?? 1, 0, 1),
          colorSpace: s.colorSpace ?? 0,
        };
      }),
    },
  ]);
}

export function parseProcreateSilicaDocumentDescriptor(rawArchive: {
  readonly name?: string;
  readonly size: string;
  readonly tileSize?: number;
  readonly orientation?: number;
  readonly flippedHorizontally?: boolean;
  readonly flippedVertically?: boolean;
  readonly strokeCount?: number;
  readonly videoEnabled?: boolean;
  readonly authorName?: string;
}): {
  readonly name: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly tileSizePx: number;
  readonly tileColumns: number;
  readonly tileRows: number;
  readonly totalTileCount: number;
  readonly strokeCount: number;
  readonly videoEnabled: boolean;
} {
  const matches = rawArchive.size.match(/(\d+)\s*,\s*(\d+)/);
  const widthPx = Math.max(1, Number(matches?.[1] ?? 2048));
  const heightPx = Math.max(1, Number(matches?.[2] ?? 2048));
  const tileSizePx = Math.max(64, rawArchive.tileSize ?? 256);
  const tileColumns = Math.ceil(widthPx / tileSizePx);
  const tileRows = Math.ceil(heightPx / tileSizePx);

  return {
    name: rawArchive.name ?? "Untitled Artwork",
    widthPx,
    heightPx,
    tileSizePx,
    tileColumns,
    tileRows,
    totalTileCount: tileColumns * tileRows,
    strokeCount: Math.max(0, rawArchive.strokeCount ?? 0),
    videoEnabled: Boolean(rawArchive.videoEnabled),
  };
}

export function parseProcreateSilicaBrushArchiveDescriptor(
  rawArchive: Readonly<Record<string, unknown>>,
): ProcreateSilicaBrushConfig {
  const num = (key: string, fallback: number): number =>
    typeof rawArchive[key] === "number" ? (rawArchive[key] as number) : fallback;
  const bool = (key: string, fallback: boolean): boolean =>
    typeof rawArchive[key] === "boolean" ? (rawArchive[key] as boolean) : fallback;

  return {
    ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG,
    strokePath: {
      plotSpacing01: clamp(num("plotSpacing", 0.1), 0, 1),
      plotJitter01: clamp(num("plotJitter", 0), 0, 1),
      fallOff01: clamp(num("fallOff", 0), 0, 1),
    },
    stabilization: {
      streamlineAmount01: clamp(num("streamlineAmount", 0.45), 0, 1),
      streamlinePressure01: clamp(num("streamlinePressure", 0.2), 0, 1),
      stabilizationAmount01: clamp(num("stabilizationAmount", 0.15), 0, 1),
      motionFilteringAmount01: clamp(num("motionFilteringAmount", 0.25), 0, 1),
      motionFilteringExpression01: clamp(num("motionFilteringExpression", 0.35), 0, 1),
    },
    taper: {
      ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.taper,
      startLength01: clamp(num("taperStartLength", 0.15), 0, 0.49),
      endLength01: clamp(num("taperEndLength", 0.22), 0, 0.49),
      pressureSize01: clamp(num("taperSize", 0.75), 0, 1),
      pressureOpacity01: clamp(num("taperOpacity", 0.25), 0, 1),
      touchSize01: clamp(num("taperTouchSize", 0.85), 0, 1),
      touchOpacity01: clamp(num("taperTouchOpacity", 0.4), 0, 1),
      classicTaper: bool("taperClassic", false),
    },
    grain: {
      ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.grain,
      mode: bool("grainMoving", false) ? "moving" : "texturized",
      depth01: clamp(num("grainDepth", 0.5), 0, 1),
      depthMinimum01: clamp(num("grainDepthMinimum", 0.15), 0, 1),
      scale01: clamp(num("grainScale", 0.35), 0, 1),
      zoom01: clamp(num("grainZoom", 0.5), 0, 1),
    },
    wetMix: {
      ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.wetMix,
      dilution01: clamp(num("wetMixDilution", 0), 0, 1),
      charge01: clamp(num("wetMixCharge", 0.85), 0, 1),
      attack01: clamp(num("wetMixAttack", 0.65), 0, 1),
      pull01: clamp(num("wetMixPull", 0), 0, 1),
      grade01: clamp(num("wetMixGrade", 0.5), 0, 1),
    },
    materials3d: {
      ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.materials3d,
      metallicScale01: clamp(num("metallicScale", 0), 0, 1),
      roughnessScale01: clamp(num("roughnessScale", 0.5), 0, 1),
    },
    authorName:
      typeof rawArchive.authorName === "string"
        ? rawArchive.authorName
        : DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.authorName,
  };
}

export function measureProcreateSilicaEngineBenchmark(): {
  readonly procreateBrushSetCount: number;
  readonly procreatePresetCount: number;
  readonly vineCharcoalTiltExpansionRatio: number;
  readonly hoverAltitudeFootprintRatio: number;
} {
  const vine = STUDIO_PROCREATE_BRUSH_PRESETS.find(
    (p) => p.id === "procreate-vine-charcoal",
  )!;
  const upright = evaluateProcreateSilicaDab(vine.config, {
    baseSizePx: 24,
    pressure01: 0.8,
    tiltDeg: 10,
    azimuthRad: 0.25,
    strokeDirectionRad: 0.25,
    speed01: 0.2,
    strokeProgress01: 0.1,
    primaryColor: { r: 0.15, g: 0.15, b: 0.15 },
    secondaryColor: { r: 0.85, g: 0.85, b: 0.85 },
    stampIndex: 0,
    strokeSeed: 2026,
  });
  const tilted = evaluateProcreateSilicaDab(vine.config, {
    baseSizePx: 24,
    pressure01: 0.8,
    tiltDeg: 80,
    azimuthRad: 0.25,
    strokeDirectionRad: 0.25,
    speed01: 0.2,
    strokeProgress01: 0.1,
    primaryColor: { r: 0.15, g: 0.15, b: 0.15 },
    secondaryColor: { r: 0.85, g: 0.85, b: 0.85 },
    stampIndex: 0,
    strokeSeed: 2026,
  });
  const hoverNear = evaluateProcreateHoverPreview(vine.config, {
    baseSizePx: 24,
    hoverAltitude01: 0.05,
    tiltDeg: 45,
    azimuthRad: 0.3,
    primaryColor: { r: 0.2, g: 0.5, b: 0.9 },
    secondaryColor: { r: 0.9, g: 0.4, b: 0.2 },
  });
  const hoverFar = evaluateProcreateHoverPreview(vine.config, {
    baseSizePx: 24,
    hoverAltitude01: 0.95,
    tiltDeg: 45,
    azimuthRad: 0.3,
    primaryColor: { r: 0.2, g: 0.5, b: 0.9 },
    secondaryColor: { r: 0.9, g: 0.4, b: 0.2 },
  });
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  return {
    procreateBrushSetCount: STUDIO_PROCREATE_BRUSH_SETS.length,
    procreatePresetCount: STUDIO_PROCREATE_BRUSH_PRESETS.length,
    vineCharcoalTiltExpansionRatio: round2(
      tilted.diameterPx / Math.max(1, upright.diameterPx),
    ),
    hoverAltitudeFootprintRatio: round2(
      hoverNear.footprintDiameterPx / Math.max(1, hoverFar.footprintDiameterPx),
    ),
  };
}
