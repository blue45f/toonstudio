import type { AtmosphericScatteringParams, SeoulSunPosition, StudioRigConfig } from "./hdri-sky-rig-engine";

export const SKY_PRESET_IDS = ["noon-clear", "golden-sunset", "blue-hour", "rainy-overcast", "moonlit-courtyard", "winter-noon"];
export const SEASON_IDS = ["spring", "summer", "autumn", "winter"];
export const SURFACE_IDS = ["warm-plaster", "hanok-wood", "wet-asphalt", "concrete-courtyard", "snow-slate"];

export function finite(values: readonly number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError("조명 계산 입력은 유한한 수여야 합니다.");
}

export function choice(value: string, choices: readonly string[]): void {
  if (!choices.includes(value)) throw new RangeError("등록되지 않은 조명 예제 모드입니다.");
}

export function flags(values: readonly boolean[]): void {
  if (values.some((value) => typeof value !== "boolean")) throw new RangeError("조명 활성 표시는 boolean이어야 합니다.");
}

export function assertAtmosphere(params: AtmosphericScatteringParams): void {
  finite([params.rayleighCoeff, params.mieCoeff, params.mieG, params.turbidity, params.cloudCoverage, params.groundAlbedo, params.ozoneStrength]);
}

export function assertSun(sun: SeoulSunPosition): void {
  choice(sun.season, SEASON_IDS);
  finite([sun.elevationDeg, sun.estimatedKelvin, sun.directTransmittance, sun.airMass]);
  flags([sun.isAboveHorizon]);
}

export function assertRig(config: StudioRigConfig): void {
  choice(config.presetId, SKY_PRESET_IDS); choice(config.season, SEASON_IDS);
  choice(config.bounce.surfaceMaterial, SURFACE_IDS);
  finite([config.hourKst]); flags([config.syncKeyWithSun, config.bounce.enabled, config.shadowCatcher.enabled]);
  assertAtmosphere(config.atmosphere);
  for (const light of [config.key, config.fill, config.rim]) {
    flags([light.enabled]);
    finite([light.azimuthDeg, light.elevationDeg, light.intensity, light.kelvin, light.softness]);
  }
  finite([config.bounce.azimuthDeg, config.bounce.reflectance, config.bounce.intensity, config.bounce.kelvin]);
  const shadow = config.shadowCatcher;
  finite([shadow.subjectHeightM, shadow.subjectRadiusM, shadow.groundRoughness, shadow.contactAoStrength, shadow.maxShadowLengthM, shadow.catcherOpacityScale]);
}
