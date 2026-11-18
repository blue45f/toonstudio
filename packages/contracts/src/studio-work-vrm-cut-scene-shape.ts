/** v6 원본의 구조 검사. 파일 바이트·권리·작품 범위는 컷 저장 경로에서 검사한다. */
import {
  hasStudioVrmV6Fields, hasVrmSceneFields as exact, STUDIO_VRM_HUMANOID_BONES, STUDIO_VRM_FINGER_BONES,
  normalizeCanonicalData, SAFE_DATA_KEY_PATTERN, UNSAFE_REFERENCE_KEY_PATTERN, FORBIDDEN_KEYS, containsControlCharacter, UNSAFE_REFERENCE_PATTERN,
} from "./studio-vrm-scene-fields";
import { canonicalizeStudioVrmTexturePaintChannel, studioVrmTexturePaintChannelEncoding } from "./studio-vrm-texture-paint-channel";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function number(value: unknown, low: number, high: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
}
function vector(value: unknown, limit = 10_000): value is number[] {
  return Array.isArray(value) && value.length === 3 && value.every(n => number(n, -limit, limit));
}
function color(value: unknown): boolean {
  return typeof value === "string" && /^#(?:[a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/u.test(value);
}
function rotation(value: unknown): boolean { return vector(value, Math.PI) && value.every(n => n < Math.PI); }
const bones = new Set<string>(STUDIO_VRM_HUMANOID_BONES), fingers = new Set<string>(STUDIO_VRM_FINGER_BONES);
function oneOf(v: unknown, options: readonly string[]): boolean { return typeof v === "string" && options.includes(v); }
function dataKey(key: string): boolean { return SAFE_DATA_KEY_PATTERN.test(key) && !UNSAFE_REFERENCE_KEY_PATTERN.test(key) && !FORBIDDEN_KEYS.has(key.toLowerCase()); }
function canonicalData(v: unknown): boolean { return normalizeCanonicalData(v, { nodes: 0 }) !== undefined; }
function pose(value: unknown): boolean {
  if (!exact(value, ["bones", "yOffset", "bodyRotationY", "fingerOverrides", "translations", "ikConstraints"])
    || !number(value.yOffset, -10, 10) || !number(value.bodyRotationY, -Math.PI, Math.PI) || value.bodyRotationY === Math.PI
    || !record(value.bones) || Object.keys(value.bones).length > 64
    || !Object.entries(value.bones).every(([key, bone]) => bones.has(key) && exact(bone, ["rotation"]) && rotation(bone.rotation))
    || !record(value.fingerOverrides) || Object.keys(value.fingerOverrides).length > 32 || !Object.entries(value.fingerOverrides).every(([key, v]) => fingers.has(key) && rotation(v))) return false;
  const t = value.translations;
  if (!exact(t, ["version", "root", "hips", "spine"]) || t.version !== 1 || !vector(t.root, 10) || t.root[1] !== 0
    || !vector(t.hips, 2) || !vector(t.spine, 0.75) || !Array.isArray(value.ikConstraints) || value.ikConstraints.length > 4) return false;
  const effectors = new Set(["leftHand", "rightHand", "leftFoot", "rightFoot"]);
  return value.ikConstraints.every(pin => exact(pin, ["effector", "enabled", "locked", "target", "pole"])
    && typeof pin.effector === "string" && effectors.delete(pin.effector) && typeof pin.enabled === "boolean" && typeof pin.locked === "boolean"
    && vector(pin.target) && (pin.pole === null || vector(pin.pole)));
}
function appearance(v: unknown): boolean {
  if (!exact(v, ["bodyScale", "customColors", "materialFx", "mannequin", "avatarForge", "costume", "wardrobe"])
    || typeof v.mannequin !== "boolean" || !exact(v.bodyScale, ["height", "width"])
    || !number(v.bodyScale.height, 0.5, 1.6) || !number(v.bodyScale.width, 0.5, 1.6)
    || !record(v.customColors) || Object.keys(v.customColors).length > 32 || !Object.entries(v.customColors).every(([key, c]) => dataKey(key) && color(c))
    || ![v.avatarForge, v.costume, v.wardrobe].every(canonicalData)) return false;
  const fx = v.materialFx;
  return exact(fx, ["shadeColor", "outlineColor", "rimColor", "emissiveColor", "rimIntensity", "emissiveIntensity"])
    && [fx.shadeColor, fx.outlineColor, fx.rimColor, fx.emissiveColor].every(c => c === null || color(c))
    && number(fx.rimIntensity, 0, 1) && number(fx.emissiveIntensity, 0, 1);
}
function model(v: unknown): boolean {
  if (!record(v) || typeof v.name !== "string" || !v.name.length || Array.from(v.name).length > 128 || v.name.trim() !== v.name || containsControlCharacter(v.name) || UNSAFE_REFERENCE_PATTERN.test(v.name)) return false;
  if (v.source === "bundled") return exact(v, ["source", "id", "name"]) && typeof v.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(v.id) && !FORBIDDEN_KEYS.has(v.id.toLowerCase());
  return exact(v, ["source", "hash", "byteSize", "mime", "name"]) && v.source === "attachment"
    && typeof v.hash === "string" && /^sha256:[a-f0-9]{64}$/u.test(v.hash) && Number.isSafeInteger(v.byteSize) && number(v.byteSize, 1, 96 * 1024 * 1024)
    && (v.mime === "model/gltf-binary" || v.mime === "model/vrm");
}

function teamSurfacePaint(v: unknown): boolean {
  if (!exact(v, ["version", "textures"]) || (v.version !== 1 && v.version !== 2) || !Array.isArray(v.textures) || v.textures.length > 128) return false;
  const keys = ["bindingKey", "materialLocator", "textureSlot", "mime", "hash", "byteSize", "width", "height"];
  if (v.version === 2) keys.push("colorSpace", "channelPacking");
  let last = "", pixels = 0;
  const byHash = new Map<string, { size: number; width: number; height: number }>();
  for (const layer of v.textures) {
    if (!exact(layer, keys)) return false;
    const slot = canonicalizeStudioVrmTexturePaintChannel(layer.textureSlot);
    if (!slot || (v.version === 1 && slot !== "baseColor")) return false;
    const encoding = studioVrmTexturePaintChannelEncoding(slot);
    if (layer.mime !== "image/png"
      || (v.version === 2 && (layer.colorSpace !== encoding.colorSpace || layer.channelPacking !== encoding.channelPacking))
      || typeof layer.bindingKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(layer.bindingKey) || FORBIDDEN_KEYS.has(layer.bindingKey.toLowerCase())
      || typeof layer.materialLocator !== "string" || layer.materialLocator.length > 256
      || !/^(?:gltf-material:(?:0|[1-9][0-9]{0,5})|scene-path:[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,7})$/u.test(layer.materialLocator)
      || typeof layer.hash !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(layer.hash)
      || !Number.isInteger(layer.width) || !number(layer.width, 1, 4096) || !Number.isInteger(layer.height) || !number(layer.height, 1, 4096)
      || !Number.isInteger(layer.byteSize) || !number(layer.byteSize, 1, 8 * 1024 * 1024)) return false;
    const identity = `${layer.materialLocator}\u0000${slot}`;
    if (identity <= last) return false;
    last = identity;
    const previous = byHash.get(layer.hash);
    if (previous && (previous.size !== layer.byteSize || previous.width !== layer.width || previous.height !== layer.height)) return false;
    if (!previous) {
      pixels += layer.width * layer.height;
      byHash.set(layer.hash, { size: layer.byteSize, width: layer.width, height: layer.height });
    }
  }
  return pixels <= 2 * 4096 * 4096;
}

export function isWorkVrmCutActorScene(value: unknown): boolean {
  if (!hasStudioVrmV6Fields(value)
    || !model(value.model) || !pose(value.pose) || !appearance(value.appearance) || !record(value.expressions)
    || Object.keys(value.expressions).length > 64 || !Object.entries(value.expressions).every(([key, n]) => dataKey(key) && number(n, 0, 1))
    || !canonicalData(value.props) || !canonicalData(value.sceneProps)) return false;
  const { camera, rig, lighting, physics, render, surfacePaint } = value;
  if (!exact(camera, ["projection", "position", "up", "target", "fovDegrees", "near", "far"])
    || camera.projection !== "perspective" || !vector(camera.position) || !vector(camera.up) || !vector(camera.target)
    || Math.abs(Math.hypot(...camera.up) - 1) > 1e-12 || !number(camera.fovDegrees, 5, 150)
    || !number(camera.near, 0.001, 10) || !number(camera.far, 0.01, 100_000) || camera.far <= camera.near) return false;
  if (!exact(rig, ["version", "jointProfile", "fullBodyIk", "footPlant", "floorHeight"]) || rig.version !== 1
    || typeof rig.fullBodyIk !== "boolean" || typeof rig.footPlant !== "boolean" || !number(rig.floorHeight, -10, 10)
    || !exact(rig.jointProfile, ["version", "purpose", "id"]) || rig.jointProfile.version !== 1
    || rig.jointProfile.purpose !== "stylized-drawing-reference-only" || !oneOf(rig.jointProfile.id, ["neutral", "child", "teen", "adult", "senior", "flexible", "limited"])) return false;
  if (!exact(lighting, ["intensity", "colorTemp", "directionDeg"]) || !number(lighting.intensity, 0.1, 4)
    || !number(lighting.colorTemp, 0, 1) || !number(lighting.directionDeg, -180, 180)
    || !oneOf(value.lightingTone, ["morning", "sunset", "night", "studio"]) || !oneOf(value.env, ["none", "floor", "wall", "room", "outdoor"])) return false;
  if (!exact(physics, ["version", "stiffnessScale", "gravityScale", "windDirectionDeg", "windStrength"]) || physics.version !== 1
    || !number(physics.stiffnessScale, 0, 2) || !number(physics.gravityScale, 0, 2) || !number(physics.windStrength, 0, 2) || !number(physics.windDirectionDeg, -180, 180)) return false;
  if (!exact(render, ["width", "height", "transparentBackground", "backgroundColor"])
    || !Number.isInteger(render.width) || !Number.isInteger(render.height) || !number(render.width, 64, 8192) || !number(render.height, 64, 8192)
    || render.width * render.height > 33_554_432 || typeof render.transparentBackground !== "boolean" || !color(render.backgroundColor)) return false;
  return teamSurfacePaint(surfacePaint);
}
