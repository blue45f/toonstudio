import spectral from "spectral.js";
import { prepareKmLayerComparison } from "./km-layer-comparison";
import { kmLayerSpectrum, kmRatioFromReflectance, openKmInfiniteReflectance, openKmMixCoefficients } from "./kubelka-munk";

export type ExternalPigmentProvider = "spectral-js-v3" | "open-km-spectral-v1" | "colormix-lab-v3";
export const EXTERNAL_PIGMENT_PROVIDERS = Object.freeze([
  { id: "spectral-js-v3", nodeId: "pigment-spectral-js", label: "Spectral.js · 분광 K/S", version: "3.0.0" },
  { id: "open-km-spectral-v1", nodeId: "pigment-open-km-spectral", label: "open-km · 합성 분광 K/S", version: "1" },
  { id: "colormix-lab-v3", nodeId: "pigment-colormix-lab", label: "ColorMix.js · Lab 비교", version: "3.2.0" },
] as const);

export function isExternalPigmentProvider(id: string): id is ExternalPigmentProvider {
  return EXTERNAL_PIGMENT_PROVIDERS.some((entry) => entry.id === id);
}

function validateHex(value: string): string {
  if (!/^#[0-9a-f]{6}$/iu.test(value)) throw new TypeError("Pigment color must be #RRGGBB");
  return value.toLowerCase();
}
function validateRatio(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Mix ratio must be in [0,1]");
}

/** Pure CIE D65 sRGB <-> XYZ <-> L*a*b* conversion matching ColorMix 3.2.0 bit-for-bit. */
function hexToLabD65(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => 100 * (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  const r = lin((n >>> 16) / 255), g = lin(((n >>> 8) & 255) / 255), b = lin((n & 255) / 255);
  const f = (u: number) => (u > 0.008856 ? Math.pow(u, 1 / 3) : 7.787 * u + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 95.047);
  const y = f((r * 0.2126 + g * 0.7152 + b * 0.0722) / 100);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 108.883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function labD65ToHex(L: number, a: number, b: number): string {
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const inv = (u: number) => (u ** 3 > 0.008856 ? u ** 3 : (u - 16 / 116) / 7.787);
  const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
  const enc = (u: number) => Math.round(255 * (u > 0.0031308 ? 1.055 * Math.pow(u, 1 / 2.4) - 0.055 : u * 12.92));
  const rgb = [
    enc(x * 3.2406 + y * -1.5372 + z * -0.4986),
    enc(x * -0.9689 + y * 1.8758 + z * 0.0415),
    enc(x * 0.0557 + y * -0.204 + z * 1.057),
  ];
  if (!rgb.every(Number.isFinite)) throw new Error("ColorMix produced a non-finite color");
  return `#${rgb.map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, "0")).join("")}`;
}

/** Spectral.js white basis peaks at 1.00116; normalize only synthetic physical-model inputs. */
function physicalReflectance(values: readonly number[]): number[] {
  if (!values.every((r) => Number.isFinite(r) && r >= 0)) throw new Error("Invalid reconstructed spectrum");
  return values.map((r) => Math.max(Number.EPSILON, Math.min(1, r)));
}

/** Prepare RGB->spectrum once per pair; only the bounded palette is computed, never per dab. */
export function prepareExternalPigmentPair(
  primary: string, secondary: string, provider: ExternalPigmentProvider,
): (ratio: number) => string {
  const a = validateHex(primary), b = validateHex(secondary);
  if (!isExternalPigmentProvider(provider)) throw new Error("Unknown external pigment provider");
  let mix: (t: number) => string;
  if (provider === "colormix-lab-v3") {
    const first = hexToLabD65(a), second = hexToLabD65(b);
    mix = (t) => {
      const w0 = (100 - t * 100) / 100, w1 = (t * 100) / 100;
      return labD65ToHex(
        first[0] * w0 + second[0] * w1,
        first[1] * w0 + second[1] * w1,
        first[2] * w0 + second[2] * w1,
      );
    };
  } else {
    const first = new spectral.Color(a), second = new spectral.Color(b);
    if (provider === "spectral-js-v3") {
      mix = (t) => spectral.mix([first, 1 - t], [second, t]).toString({ method: "map" }).toLowerCase();
    } else {
      // Open-km's separate K,S mixture. RGB supplies only reconstructed R and therefore K/S.
      // S=1 is an EXPLICIT approximation, not a measured pigment database or mass recipe.
      const firstK = physicalReflectance(first.R).map(kmRatioFromReflectance);
      const secondK = physicalReflectance(second.R).map(kmRatioFromReflectance);
      mix = (t) => {
        const r = firstK.map((k, i) => {
          const optical = openKmMixCoefficients([k, secondK[i]!], [1, 1], [1 - t, t]);
          return openKmInfiniteReflectance(optical.k, optical.s);
        });
        return new spectral.Color(r).toString({ method: "map" }).toLowerCase();
      };
    }
  }
  return (ratio) => {
    validateRatio(ratio);
    // RGB endpoint correction is part of this versioned authoring adapter, not the KM equations.
    if (ratio === 0 || a === b) return a;
    if (ratio === 1) return b;
    return validateHex(mix(ratio));
  };
}

export function createExternalPigmentPalette(
  first: string, second: string, provider: ExternalPigmentProvider, steps = 33,
): readonly string[] {
  if (!Number.isInteger(steps) || steps < 2 || steps > 257) throw new RangeError("Palette steps must be 2..257");
  const mix = prepareExternalPigmentPair(first, second, provider);
  return Object.freeze(Array.from({ length: steps }, (_, i) => mix(i / (steps - 1))));
}

/** Optical feasibility probe: synthetic spectrum, assumed S, no canvas pickup or physical units. */
export function simulatePigmentLayer(
  color: string, substrate: string, thickness: number, scattering = 1,
): string {
  validateHex(color); validateHex(substrate);
  if (!Number.isFinite(scattering) || scattering <= 0 || scattering > 100) {
    throw new RangeError("Synthetic scattering must be in (0,100]");
  }
  const pigment = new spectral.Color(color);
  const paper = new spectral.Color(substrate);
  const ratios = physicalReflectance(pigment.R).map(kmRatioFromReflectance);
  const reflectance = kmLayerSpectrum(
    ratios.map((ratio) => ratio * scattering),
    ratios.map(() => scattering), thickness, physicalReflectance(paper.R),
  );
  if (thickness === 0) return substrate.toLowerCase();
  return new spectral.Color(reflectance).toString({ method: "map" }).toLowerCase();
}

/** Prepared optical comparison only: RGB reconstruction + assumed S=1, not measured pigment data. */
export function prepareSyntheticPigmentLayers(primary: string, secondary: string, substrate: string) {
  const first = new spectral.Color(validateHex(primary)), second = new spectral.Color(validateHex(secondary));
  const baseHex = validateHex(substrate), paper = new spectral.Color(baseHex);
  const pigment = (color: InstanceType<typeof spectral.Color>) => {
    const absorption = physicalReflectance(color.R).map(kmRatioFromReflectance);
    return { absorption, scattering: absorption.map(() => 1) };
  };
  const evaluate = prepareKmLayerComparison(pigment(first), pigment(second), physicalReflectance(paper.R));
  const encode = (values: readonly number[]) => new spectral.Color([...values]).toString({ method: "map" }).toLowerCase();
  return (firstThickness: number, secondThickness: number) => {
    const result = evaluate(firstThickness, secondThickness);
    if (firstThickness === 0 && secondThickness === 0) {
      return Object.freeze({ premixed: baseHex, firstOnSecond: baseHex, secondOnFirst: baseHex });
    }
    return Object.freeze({ premixed: encode(result.premixed), firstOnSecond: encode(result.firstOnSecond), secondOnFirst: encode(result.secondOnFirst) });
  };
}
