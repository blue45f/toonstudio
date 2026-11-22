/**
 * 자동 명암(`shading/`)과 OKLCH 장면 색온도(2700K~8500K) 3-톤 팔레트·색약 명도 대비 검증 브리지.
 *
 * - 기존 4종 분위기 프리셋(`warm-dawn` / `neutral-day` / `cool-moon` / `sunset-golden`)을
 *   장면 색온도 켈빈값과 양방향 연동한다.
 * - 탁한 회색 Multiply 대신 한색 그림자·난색 하이라이트·반사광 3-톤 HEX 스와치를 산출한다.
 */

import {
  auditPaletteLuminanceContrast,
  type PaletteLuminanceContrastAudit,
} from "../color/oklch-colorblind-softproof";
import {
  clampSceneTemperatureKelvin,
  generateOklchThreeTonePalette,
  type OklchThreeTonePalette,
} from "../color/oklch-scene-temperature-palette";

import type { AmbientLightingTemperature } from "../ai/studio-ai-shading-assist";

export const AMBIENT_TEMPERATURE_DEFAULT_KELVIN: Readonly<Record<AmbientLightingTemperature, number>> =
  Object.freeze({
    "sunset-golden": 3200,
    "warm-dawn": 4500,
    "neutral-day": 5500,
    "cool-moon": 8200,
  });

export interface OklchShadingTemperatureBridgeResult {
  readonly kelvin: number;
  readonly mappedTemperature: AmbientLightingTemperature;
  readonly palette: OklchThreeTonePalette;
  readonly contrastAudit: PaletteLuminanceContrastAudit;
  readonly shadow1ColorHex: string;
  readonly shadow2ColorHex: string;
  readonly rimLightColorHex: string;
}

export function kelvinToAmbientLightingTemperature(kelvinInput: number): AmbientLightingTemperature {
  const kelvin = clampSceneTemperatureKelvin(kelvinInput);
  if (kelvin <= 3600) return "sunset-golden";
  if (kelvin <= 4900) return "warm-dawn";
  if (kelvin <= 6600) return "neutral-day";
  return "cool-moon";
}

export function ambientLightingTemperatureToKelvin(temp: AmbientLightingTemperature): number {
  return AMBIENT_TEMPERATURE_DEFAULT_KELVIN[temp];
}

/**
 * 선택 밑색과 장면 색온도(2700K~8500K)·강도(%)로 OKLCH 3-톤 음영 팔레트와 색약 명도 대비 검증 결과를 산출한다.
 */
export function computeOklchTemperatureShading(params: {
  readonly baseHex: string;
  readonly kelvin: number;
  readonly intensityPercent?: number;
  readonly bounceColorHex?: string;
}): OklchShadingTemperatureBridgeResult {
  const kelvin = clampSceneTemperatureKelvin(params.kelvin);
  const intensity = typeof params.intensityPercent === "number" && Number.isFinite(params.intensityPercent)
    ? Math.min(100, Math.max(10, params.intensityPercent))
    : 75;
  const contrast = 0.65 + (intensity / 100) * 0.7;

  const palette = generateOklchThreeTonePalette(params.baseHex, {
    kelvin,
    contrast,
    chromaPreserve: 0.8,
    bounceColorHex: params.bounceColorHex,
  });

  // 2차 깊은 음영은 1차 핵심 그림자에서 한 단계 더 짙고 한색으로 이동
  const deepPalette = generateOklchThreeTonePalette(palette.coreShadow.hex, {
    kelvin,
    contrast: Math.min(1.5, contrast * 0.9),
    chromaPreserve: 0.85,
  });

  const contrastAudit = auditPaletteLuminanceContrast([
    palette.lightTone.hex,
    palette.midTone.hex,
    palette.coreShadow.hex,
    palette.bounceTone.hex,
  ]);

  return {
    kelvin,
    mappedTemperature: kelvinToAmbientLightingTemperature(kelvin),
    palette,
    contrastAudit,
    shadow1ColorHex: palette.coreShadow.hex,
    shadow2ColorHex: deepPalette.coreShadow.hex,
    rimLightColorHex: palette.lightTone.hex,
  };
}
