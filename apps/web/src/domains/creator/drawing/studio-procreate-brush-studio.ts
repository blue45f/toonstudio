/**
 * studio-procreate-brush-studio.ts
 *
 * REA(`reverse-engineer-anything`)를 통해 정적·구조 역공학한 Procreate (Valkyrie / Silica Engine)
 * 12대 카테고리 Brush Studio(`SilicaBrush`) 엔진의 클린룸 내재화 모듈.
 *
 * 역공학 근거(REA Evidence IDs):
 * - `Brush.archive` (`SilicaBrush` NSKeyedArchiver 바이너리 plist): `ev_64a6768d4a708ba542ac20e920973ef0542a12a5e00d6bc36894ddd738781faf`
 * - `Procreate_Brush.brush` 아카이브: `ev_a22371fb13e34c0c2ee15a6558a0598c4040694e1cfbc92347cf81cb121cb920`
 * - `procreate-ipad-features.js` (`fucbpo-V.js` / `ypN6-mlN.js` / `app-CzuPj2sI.js`): `ev_22482a99a70629842037dbdb72528f372d0c9ce1aad19bfdb38d710af886704a`
 */

export type ProcreateBrushSetCategoryId =
  | "sketching"
  | "inking"
  | "drawing"
  | "painting"
  | "artistic"
  | "calligraphy"
  | "airbrushing"
  | "textures"
  | "abstract"
  | "charcoals"
  | "elements"
  | "spraypaints"
  | "touchups"
  | "vintage"
  | "luminance"
  | "industrial"
  | "organic"
  | "water";

export type ProcreateRenderingMode =
  | "light-glaze"
  | "uniform-glaze"
  | "intense-glaze"
  | "heavy-glaze"
  | "uniform-blending"
  | "intense-blending";

export type ProcreateGrainMode = "moving" | "texturized";

export type ProcreateGrainBlendMode =
  | "multiply"
  | "linear-burn"
  | "color-burn"
  | "overlay"
  | "soft-light"
  | "height";

export type ProcreateDualBrushBlendMode =
  | "multiply"
  | "difference"
  | "color-burn"
  | "linear-burn"
  | "darken"
  | "lighten";

export interface ProcreateStrokePathSettings {
  readonly plotSpacing01: number;
  readonly plotJitter01: number;
  readonly fallOff01: number;
}

export interface ProcreateStabilizationSettings {
  readonly streamlineAmount01: number;
  readonly streamlinePressure01: number;
  readonly stabilizationAmount01: number;
  readonly motionFilteringAmount01: number;
  readonly motionFilteringExpression01: number;
}

export interface ProcreateTaperSettings {
  readonly startLength01: number;
  readonly endLength01: number;
  readonly linkStartAndEnd: boolean;
  readonly pressureSize01: number;
  readonly pressureOpacity01: number;
  readonly touchSize01: number;
  readonly touchOpacity01: number;
  readonly tipSharpness01: number;
  readonly classicTaper: boolean;
}

export interface ProcreateShapeSettings {
  readonly scatter01: number;
  /** -1 = 역방향 스트로크 추종, 0 = 고정, 1 = 스트로크 진행 방향 추종 */
  readonly rotationFollowStroke: number;
  readonly azimuth: boolean;
  readonly count: number;
  readonly countJitter01: number;
  readonly randomized: boolean;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly roundness01: number;
  readonly softness01: number;
}

export interface ProcreateGrainSettings {
  readonly mode: ProcreateGrainMode;
  readonly movementRolling01: number;
  readonly scale01: number;
  readonly zoom01: number;
  readonly depth01: number;
  readonly depthMinimum01: number;
  readonly depthJitter01: number;
  readonly blendMode: ProcreateGrainBlendMode;
  readonly brightness: number;
  readonly contrast: number;
  readonly offsetJitter: boolean;
}

export interface ProcreateRenderingSettings {
  readonly mode: ProcreateRenderingMode;
  readonly wetEdges01: number;
  readonly burntEdges01: number;
  readonly burntEdgesBlendMode: "multiply" | "linear-burn" | "color-burn" | "darken";
  readonly blendMode: "normal" | "multiply" | "screen" | "add";
}

export interface ProcreateWetMixSettings {
  readonly dilution01: number;
  readonly charge01: number;
  readonly attack01: number;
  readonly pull01: number;
  readonly grade01: number;
  readonly blur01: number;
  readonly wetJitter01: number;
}

export interface ProcreateColorDynamicsSettings {
  readonly stampHue01: number;
  readonly stampSaturation01: number;
  readonly stampBrightness01: number;
  readonly stampDarkness01: number;
  readonly stampSecondaryColor01: number;
  readonly strokeHue01: number;
  readonly strokeSaturation01: number;
  readonly strokeBrightness01: number;
  readonly strokeSecondaryColor01: number;
  readonly pressureHue01: number;
  readonly pressureSaturation01: number;
  readonly pressureBrightness01: number;
  readonly pressureSecondaryColor01: number;
  readonly tiltHue01: number;
  readonly tiltSaturation01: number;
  readonly tiltBrightness01: number;
  readonly tiltSecondaryColor01: number;
  readonly barrelRollHue01: number;
  readonly barrelRollSecondaryColor01: number;
}

export interface ProcreateDynamicsSettings {
  readonly speedSize: number;
  readonly speedOpacity: number;
  readonly jitterSize01: number;
  readonly jitterOpacity01: number;
}

export interface ProcreateApplePencilSettings {
  readonly pressureSize: number;
  readonly pressureOpacity01: number;
  readonly pressureBleed01: number;
  readonly pressureSoftness01: number;
  readonly tiltAngleThresholdDeg: number;
  readonly tiltSize01: number;
  readonly tiltOpacity01: number;
  readonly tiltGradation01: number;
  readonly tiltCompression: boolean;
  readonly barrelRollAzimuth: boolean;
}

export interface ProcreatePropertiesSettings {
  readonly orientToScreen: boolean;
  readonly smudgePull01: number;
  readonly maxSize01: number;
  readonly minSize01: number;
  readonly maxOpacity01: number;
  readonly minOpacity01: number;
}

export interface ProcreateMaterials3dSettings {
  readonly metallicScale01: number;
  readonly pressureMetallic01: number;
  readonly tiltMetallic01: number;
  readonly roughnessScale01: number;
  readonly pressureRoughness01: number;
  readonly tiltRoughness01: number;
}

export interface ProcreateDualBrushSettings {
  readonly enabled: boolean;
  readonly blendMode: ProcreateDualBrushBlendMode;
  readonly secondarySpacing01: number;
  readonly secondarySizeRatio01: number;
}

export interface ProcreateSilicaBrushConfig {
  readonly strokePath: ProcreateStrokePathSettings;
  readonly stabilization: ProcreateStabilizationSettings;
  readonly taper: ProcreateTaperSettings;
  readonly shape: ProcreateShapeSettings;
  readonly grain: ProcreateGrainSettings;
  readonly rendering: ProcreateRenderingSettings;
  readonly wetMix: ProcreateWetMixSettings;
  readonly colorDynamics: ProcreateColorDynamicsSettings;
  readonly dynamics: ProcreateDynamicsSettings;
  readonly applePencil: ProcreateApplePencilSettings;
  readonly properties: ProcreatePropertiesSettings;
  readonly materials3d: ProcreateMaterials3dSettings;
  readonly dualBrush: ProcreateDualBrushSettings;
  readonly authorName: string;
}

export interface ProcreateSilicaBrushPreset {
  readonly id: string;
  readonly nameEn: string;
  readonly nameKo: string;
  readonly setCategory: ProcreateBrushSetCategoryId;
  readonly descriptionKo: string;
  readonly crafts: readonly ("sketch" | "lineart" | "coloring" | "tone" | "effect")[];
  readonly config: ProcreateSilicaBrushConfig;
}

const clamp = (v: number, min: number, max: number): number =>
  !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;

function deterministicNoise01(seed: number, step: number): number {
  const x = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const wrappedH = ((h % 1) + 1) % 1;
  const i = Math.floor(wrappedH * 6);
  const f = wrappedH * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

export {
  DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG,
  makeProcreatePresetConfig,
  STUDIO_PROCREATE_BRUSH_PRESETS,
  STUDIO_PROCREATE_BRUSH_SETS,
} from "./studio-procreate-brush-presets";

export interface ProcreateSilicaDabSampleInput {
  readonly baseSizePx: number;
  readonly pressure01: number;
  readonly tiltDeg: number;
  readonly azimuthRad: number;
  readonly barrelRollRad?: number;
  readonly strokeDirectionRad: number;
  readonly speed01: number;
  readonly strokeProgress01: number;
  readonly primaryColor: { readonly r: number; readonly g: number; readonly b: number };
  readonly secondaryColor: { readonly r: number; readonly g: number; readonly b: number };
  readonly stampIndex: number;
  readonly strokeSeed: number;
}

export interface ProcreateSilicaDabEvaluation {
  readonly diameterPx: number;
  readonly roundness01: number;
  readonly rotationRad: number;
  readonly opacity01: number;
  readonly stampCount: number;
  readonly grainDepthEffective01: number;
  readonly grainUvOffset: { readonly u: number; readonly v: number };
  readonly glazeCeiling01: number;
  readonly wetEdgeRingGain01: number;
  readonly burntEdgeDarkening01: number;
  readonly wetDilution01: number;
  readonly paintChargeRemaining01: number;
  readonly wetPullStrength01: number;
  readonly dualBrushMaskGain01: number;
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly material3d: {
    readonly metallic01: number;
    readonly roughness01: number;
  };
}

export function combineProcreateDualBrushMask(
  primaryAlpha01: number,
  secondaryAlpha01: number,
  mode: ProcreateDualBrushBlendMode,
): number {
  const a = clamp(primaryAlpha01, 0, 1);
  const b = clamp(secondaryAlpha01, 0, 1);
  switch (mode) {
    case "multiply":
      return a * b;
    case "difference":
      return Math.abs(a - b);
    case "color-burn":
      return b <= 1e-4 ? 0 : clamp(1 - (1 - a) / b, 0, 1);
    case "linear-burn":
      return clamp(a + b - 1, 0, 1);
    case "darken":
      return Math.min(a, b);
    case "lighten":
      return Math.max(a, b);
  }
}

export function evaluateProcreateSilicaDab(
  config: ProcreateSilicaBrushConfig,
  input: ProcreateSilicaDabSampleInput,
): ProcreateSilicaDabEvaluation {
  const p = clamp(input.pressure01, 0, 1);
  const speed = clamp(input.speed01, 0, 1);
  const progress = clamp(input.strokeProgress01, 0, 1);
  const barrelRoll01 = clamp(((input.barrelRollRad ?? 0) % (Math.PI * 2)) / (Math.PI * 2), 0, 1);

  const randSize = deterministicNoise01(input.strokeSeed, input.stampIndex * 7 + 1) - 0.5;
  const randOpacity = deterministicNoise01(input.strokeSeed, input.stampIndex * 7 + 2) - 0.5;
  const randCount = deterministicNoise01(input.strokeSeed, input.stampIndex * 7 + 3);

  const thresholdDeg = clamp(config.applePencil.tiltAngleThresholdDeg, 0, 89);
  const tiltExcess01 =
    input.tiltDeg <= thresholdDeg
      ? 0
      : clamp((input.tiltDeg - thresholdDeg) / Math.max(1, 90 - thresholdDeg), 0, 1);

  const pressureSizeFactor =
    config.applePencil.pressureSize >= 0
      ? 1 - config.applePencil.pressureSize * (1 - p)
      : 1 + Math.abs(config.applePencil.pressureSize) * (1 - p);
  const speedSizeFactor = 1 + config.dynamics.speedSize * speed * 0.65;
  const tiltSizeBoost = 1 + tiltExcess01 * config.applePencil.tiltSize01 * 1.85;
  const jitterSizeFactor = 1 + randSize * config.dynamics.jitterSize01 * 0.8;
  const fallOffFactor = clamp(1 - config.strokePath.fallOff01 * progress * 0.9, 0.05, 1);

  const minRatio = clamp(config.properties.minSize01, 0.01, 1);
  const maxRatio = Math.max(minRatio, clamp(config.properties.maxSize01, 0.05, 2));
  const rawDiameter =
    Math.max(1, input.baseSizePx) *
    clamp(pressureSizeFactor, minRatio, maxRatio * 2) *
    speedSizeFactor *
    tiltSizeBoost *
    jitterSizeFactor *
    fallOffFactor;
  const diameterPx = Math.max(0.5, Math.round(rawDiameter * 100) / 100);

  const baseRoundness = clamp(config.shape.roundness01, 0.05, 1);
  const roundness01 = config.applePencil.tiltCompression
    ? clamp(baseRoundness * (1 - tiltExcess01 * 0.55), 0.08, 1)
    : baseRoundness;

  let rotationRad = 0;
  if (config.applePencil.barrelRollAzimuth && input.barrelRollRad !== undefined) {
    rotationRad = input.barrelRollRad;
  } else if (config.shape.azimuth) {
    rotationRad = input.azimuthRad;
  } else if (Math.abs(config.shape.rotationFollowStroke) > 1e-3) {
    rotationRad = input.strokeDirectionRad * config.shape.rotationFollowStroke;
  }
  if (config.shape.scatter01 > 0) {
    rotationRad +=
      (deterministicNoise01(input.strokeSeed, input.stampIndex * 11 + 4) - 0.5) *
      config.shape.scatter01 *
      Math.PI *
      2;
  }

  const pressureOpacityFactor = 1 - config.applePencil.pressureOpacity01 * (1 - p);
  const tiltOpacityFactor = 1 - tiltExcess01 * config.applePencil.tiltOpacity01 * 0.7;
  const tiltGradationFactor = 1 - tiltExcess01 * config.applePencil.tiltGradation01 * 0.45;
  const speedOpacityFactor = 1 + config.dynamics.speedOpacity * speed * 0.5;
  const jitterOpacityFactor = 1 + randOpacity * config.dynamics.jitterOpacity01 * 0.7;

  const glazeModeMultiplier: Record<ProcreateRenderingMode, number> = {
    "light-glaze": 0.38,
    "uniform-glaze": 0.58,
    "intense-glaze": 0.82,
    "heavy-glaze": 0.96,
    "uniform-blending": 0.74,
    "intense-blending": 0.92,
  };
  const glazeCeiling01 = clamp(
    glazeModeMultiplier[config.rendering.mode] * (0.35 + 0.65 * p),
    config.properties.minOpacity01,
    config.properties.maxOpacity01,
  );
  const opacity01 = clamp(
    pressureOpacityFactor *
      tiltOpacityFactor *
      tiltGradationFactor *
      speedOpacityFactor *
      jitterOpacityFactor *
      glazeCeiling01 *
      fallOffFactor,
    config.properties.minOpacity01,
    config.properties.maxOpacity01,
  );

  const grainDepthEffective01 = clamp(
    config.grain.depthMinimum01 +
      (config.grain.depth01 - config.grain.depthMinimum01) * p +
      config.applePencil.pressureBleed01 * (1 - p) * 0.25,
    0,
    1,
  );
  const grainUvOffset =
    config.grain.mode === "moving"
      ? {
          u:
            Math.cos(input.strokeDirectionRad) *
            progress *
            (0.2 + 0.8 * config.grain.movementRolling01),
          v:
            Math.sin(input.strokeDirectionRad) *
            progress *
            (0.2 + 0.8 * config.grain.movementRolling01),
        }
      : {
          u: config.grain.offsetJitter
            ? deterministicNoise01(input.strokeSeed, 901)
            : 0,
          v: config.grain.offsetJitter
            ? deterministicNoise01(input.strokeSeed, 902)
            : 0,
        };

  const wetDilution01 = clamp(config.wetMix.dilution01, 0, 1);
  const paintChargeRemaining01 = clamp(
    config.wetMix.charge01 * (1 - progress * (1 - config.wetMix.charge01 * 0.85)),
    0,
    1,
  );
  const wetPullStrength01 = clamp(
    config.wetMix.pull01 * (0.3 + 0.7 * p * config.wetMix.attack01),
    0,
    1,
  );

  const cd = config.colorDynamics;
  const stampNoise = deterministicNoise01(input.strokeSeed, input.stampIndex * 13 + 5) - 0.5;
  const strokeNoise = deterministicNoise01(input.strokeSeed, 77) - 0.5;

  const secondaryMix01 = clamp(
    Math.abs(stampNoise) * cd.stampSecondaryColor01 +
      Math.abs(strokeNoise) * cd.strokeSecondaryColor01 +
      (1 - p) * cd.pressureSecondaryColor01 +
      tiltExcess01 * cd.tiltSecondaryColor01 +
      barrelRoll01 * cd.barrelRollSecondaryColor01,
    0,
    1,
  );

  const mixedR =
    input.primaryColor.r * (1 - secondaryMix01) + input.secondaryColor.r * secondaryMix01;
  const mixedG =
    input.primaryColor.g * (1 - secondaryMix01) + input.secondaryColor.g * secondaryMix01;
  const mixedB =
    input.primaryColor.b * (1 - secondaryMix01) + input.secondaryColor.b * secondaryMix01;

  const [baseH, baseS, baseV] = rgbToHsv(mixedR, mixedG, mixedB);
  const hueShift =
    stampNoise * cd.stampHue01 +
    strokeNoise * cd.strokeHue01 +
    (p - 0.5) * cd.pressureHue01 * 0.5 +
    tiltExcess01 * cd.tiltHue01 * 0.5 +
    (barrelRoll01 - 0.5) * cd.barrelRollHue01;
  const satShift =
    stampNoise * cd.stampSaturation01 +
    strokeNoise * cd.strokeSaturation01 +
    (p - 0.5) * cd.pressureSaturation01 * 0.5 +
    tiltExcess01 * cd.tiltSaturation01 * 0.5;
  const valShift =
    stampNoise * (cd.stampBrightness01 - cd.stampDarkness01) +
    strokeNoise * cd.strokeBrightness01 +
    (p - 0.5) * cd.pressureBrightness01 * 0.5 +
    tiltExcess01 * cd.tiltBrightness01 * 0.5;

  const [outR, outG, outB] = hsvToRgb(
    baseH + hueShift,
    clamp(baseS + satShift, 0, 1),
    clamp(baseV + valShift, 0, 1),
  );

  const secondaryMaskSample =
    0.55 + 0.45 * deterministicNoise01(input.strokeSeed, input.stampIndex * 19 + 9);
  const dualBrushMaskGain01 = config.dualBrush.enabled
    ? combineProcreateDualBrushMask(1, secondaryMaskSample, config.dualBrush.blendMode)
    : 1;

  const baseCount = Math.max(1, Math.min(16, Math.round(config.shape.count)));
  const stampCount = Math.max(
    1,
    Math.round(baseCount * (1 - config.shape.countJitter01 * 0.5 * randCount)),
  );

  const metallic01 = clamp(
    config.materials3d.metallicScale01 *
      (1 - config.materials3d.pressureMetallic01 * (1 - p)) *
      (1 + tiltExcess01 * config.materials3d.tiltMetallic01 * 0.5),
    0,
    1,
  );
  const roughness01 = clamp(
    config.materials3d.roughnessScale01 *
      (1 - config.materials3d.pressureRoughness01 * (1 - p)) *
      (1 + tiltExcess01 * config.materials3d.tiltRoughness01 * 0.5),
    0,
    1,
  );

  return {
    diameterPx,
    roundness01,
    rotationRad,
    opacity01,
    stampCount,
    grainDepthEffective01,
    grainUvOffset,
    glazeCeiling01,
    wetEdgeRingGain01: clamp(config.rendering.wetEdges01 * (0.4 + 0.6 * wetDilution01), 0, 1),
    burntEdgeDarkening01: clamp(config.rendering.burntEdges01 * p, 0, 1),
    wetDilution01,
    paintChargeRemaining01,
    wetPullStrength01,
    dualBrushMaskGain01,
    color: {
      r: clamp(outR, 0, 1),
      g: clamp(outG, 0, 1),
      b: clamp(outB, 0, 1),
    },
    material3d: {
      metallic01,
      roughness01,
    },
  };
}

export interface ProcreateHoverPreviewResult {
  readonly footprintDiameterPx: number;
  readonly azimuthAngleRad: number;
  readonly roundness01: number;
  readonly projectedGrainScale01: number;
  readonly predictedColor: { readonly r: number; readonly g: number; readonly b: number };
}

export function evaluateProcreateHoverPreview(
  config: ProcreateSilicaBrushConfig,
  hoverInput: {
    readonly baseSizePx: number;
    readonly hoverAltitude01: number;
    readonly tiltDeg: number;
    readonly azimuthRad: number;
    readonly barrelRollRad?: number;
    readonly primaryColor: { readonly r: number; readonly g: number; readonly b: number };
    readonly secondaryColor: { readonly r: number; readonly g: number; readonly b: number };
  },
): ProcreateHoverPreviewResult {
  const altitude = clamp(hoverInput.hoverAltitude01, 0, 1);
  const simulatedPressure = clamp(0.65 * (1 - altitude * 0.45), 0.15, 0.85);
  const dab = evaluateProcreateSilicaDab(config, {
    baseSizePx: hoverInput.baseSizePx,
    pressure01: simulatedPressure,
    tiltDeg: hoverInput.tiltDeg,
    azimuthRad: hoverInput.azimuthRad,
    barrelRollRad: hoverInput.barrelRollRad,
    strokeDirectionRad: hoverInput.azimuthRad,
    speed01: 0,
    strokeProgress01: 0,
    primaryColor: hoverInput.primaryColor,
    secondaryColor: hoverInput.secondaryColor,
    stampIndex: 0,
    strokeSeed: 101,
  });

  const projectedGrainScale01 = clamp(
    config.grain.scale01 *
      (1 - config.grain.zoom01 * 0.35 + (1 - config.grain.zoom01) * (dab.diameterPx / Math.max(1, hoverInput.baseSizePx)) * 0.35),
    0.05,
    1,
  );

  return {
    footprintDiameterPx: dab.diameterPx,
    azimuthAngleRad: dab.rotationRad,
    roundness01: dab.roundness01,
    projectedGrainScale01,
    predictedColor: dab.color,
  };
}

export interface ProcreateBrushResetPointSnapshot {
  readonly createdAtIso: string;
  readonly authorName: string;
  readonly frozenConfigJson: string;
}

export function createProcreateBrushResetPoint(
  config: ProcreateSilicaBrushConfig,
  createdAtIso = "2026-10-26T00:00:00.000Z",
): ProcreateBrushResetPointSnapshot {
  return Object.freeze({
    createdAtIso,
    authorName: config.authorName,
    frozenConfigJson: JSON.stringify(config),
  });
}

export function restoreProcreateBrushToResetPoint(
  snapshot: ProcreateBrushResetPointSnapshot,
): ProcreateSilicaBrushConfig {
  return JSON.parse(snapshot.frozenConfigJson) as ProcreateSilicaBrushConfig;
}

