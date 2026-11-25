import type { RelightBridge2dPayload } from "./hdri-sky-rig-engine";
import { SEASON_IDS, SKY_PRESET_IDS } from "./lighting-input-contract";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const flag = (value: unknown): value is boolean => typeof value === "boolean";
const oneOf = (value: unknown, values: readonly string[]): boolean => typeof value === "string" && values.includes(value);
const tuple = (value: unknown, max = 1): boolean => Array.isArray(value) && value.length === 3 && value.every((part) => num(part, 0, max));

function color(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^oklch\(([-+\d.e]+) ([-+\d.e]+) ([-+\d.e]+)\)$/u.exec(value);
  return Boolean(match && num(Number(match[1]), 0, 1) && num(Number(match[2]), 0, 0.4) && num(Number(match[3]), 0, 360));
}

function light(value: unknown): boolean {
  if (!record(value) || !record(value.direction3d)) return false;
  const direction = value.direction3d;
  return oneOf(value.id, ["key", "fill", "rim", "architectural-bounce"]) && flag(value.enabled)
    && num(value.azimuthDeg, 0, 360) && num(value.elevationDeg, -90, 90)
    && num(direction.x, -1, 1) && num(direction.y, -1, 1) && num(direction.z, -1, 1)
    && Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 0.01
    && num(value.intensity, 0, 3) && num(value.kelvin, 2200, 10000) && num(value.softness, 0, 1)
    && tuple(value.linearRgb) && color(value.oklchCss);
}

/** 외부 JSON을 타입으로 단정하기 전에 전체 필수 필드를 검사한다. */
export function isRelightBridge(value: unknown): value is RelightBridge2dPayload {
  if (!record(value) || value.schemaVersion !== "toonstudio.3d-lighting-bridge.v1" || value.sourceEngine !== "studio-3d-lighting-rig") return false;
  const { location, sky, threeLayer2dRelight: relight, dynamicLights, shadowCatcher: shadow } = value;
  if (!record(location) || !record(sky) || !record(relight) || !record(shadow) || !Array.isArray(dynamicLights)) return false;
  if (dynamicLights.length !== 4 || !dynamicLights.every(light)) return false;
  if (new Set(dynamicLights.map((item: unknown) => record(item) ? item.id : null)).size !== 4) return false;
  return location.city === "Seoul" && num(location.latitudeDeg, -66, 66) && num(location.longitudeDeg, -180, 180)
    && oneOf(location.season, SEASON_IDS) && num(location.hourKst, 5, 22) && typeof location.formattedHourKst === "string" && /^(?:0[5-9]|1\d|2[0-2]):[0-5]\d$/u.test(location.formattedHourKst)
    && oneOf(sky.presetId, SKY_PRESET_IDS) && text(sky.presetNameKo) && oneOf(sky.skyPhase, ["daylight", "golden-hour", "blue-hour", "night"])
    && num(sky.sunElevationDeg, -90, 90) && num(sky.sunAzimuthDeg, 0, 360) && num(sky.turbidity, 1, 10) && num(sky.cloudCoverage, 0, 1)
    && color(sky.zenithOklch) && color(sky.horizonOklch) && color(sky.groundBounceOklch) && num(sky.hemisphereIrradianceLux, 0)
    && oneOf(relight.suggestedPresetId, ["noon", "sunset", "moonlight", "indoor"]) && num(relight.kelvin, 2200, 10000)
    && tuple(relight.albedoTint, 2) && tuple(relight.shadowTint) && tuple(relight.keyColor) && tuple(relight.bounceColor)
    && num(relight.shadowDepth, 0, 1) && num(relight.keyIntensity, 0, 1.4) && num(relight.bounceIntensity, 0, 1.1)
    && num(relight.ambientFloor, 0, 1) && num(relight.exposure, 0)
    && flag(shadow.enabled) && flag(shadow.isAmbientOnly) && num(shadow.shadowAzimuthDeg, 0, 360)
    && num(shadow.castLengthM, 0) && num(shadow.semiMajorAxisM, 0) && num(shadow.semiMinorAxisM, 0)
    && num(shadow.castOpacity, 0, 1) && num(shadow.contactAoOpacity, 0, 1) && num(shadow.penumbraBlurPx, 0)
    && color(shadow.shadowTintOklch) && num(value.characterBackgroundMatchScore, 0, 100);
}
