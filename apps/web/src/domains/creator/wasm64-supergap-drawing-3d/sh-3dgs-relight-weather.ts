/**
 * Super-Gap Pillar B (#6): 3DGS Spherical-Harmonics Time-of-Day Relighting & Weather Pass.
 * 3D Gaussian Splatting의 SH L0(DC) · L1(1차 방향성) 계수를 `dawn` · `noon` · `sunset` ·
 * `night` 시간대 조명장으로 ₩0 로컬 재조명하고, 카메라 깊이 인식 대기 안개(depth fog) 및
 * 비·눈·안개 파티클 패스를 생성한다.
 */

export type TimeOfDayPreset = "dawn" | "noon" | "sunset" | "night";
export type WeatherPassKind = "clear" | "fog" | "rain" | "snow";
export type RgbTuple = readonly [number, number, number];
export type Vec3Tuple = readonly [number, number, number];

export const SH_C0 = 0.28209479177387814;
export const SH_C1 = 0.4886025119029199;

export interface TimeOfDayShSpec {
  readonly id: TimeOfDayPreset;
  readonly labelKo: string;
  readonly sunDirection: Vec3Tuple;
  readonly sunColorRgb: RgbTuple;
  readonly skyAmbientRgb: RgbTuple;
  readonly groundBounceRgb: RgbTuple;
  readonly exposure: number;
  readonly directionalStrength: number;
  readonly fogColorRgb: RgbTuple;
  readonly baseFogDensity: number;
  readonly colorTempKelvin: number;
}

export const TIME_OF_DAY_SH_PRESETS: Readonly<Record<TimeOfDayPreset, TimeOfDayShSpec>> = {
  dawn: {
    id: "dawn",
    labelKo: "새벽 여명 (Dawn)",
    sunDirection: [0.82, 0.24, 0.52],
    sunColorRgb: [1.0, 0.72, 0.56],
    skyAmbientRgb: [0.58, 0.64, 0.88],
    groundBounceRgb: [0.34, 0.31, 0.38],
    exposure: 0.88,
    directionalStrength: 0.68,
    fogColorRgb: [0.76, 0.72, 0.82],
    baseFogDensity: 0.022,
    colorTempKelvin: 4100,
  },
  noon: {
    id: "noon",
    labelKo: "정오 맑음 (Noon)",
    sunDirection: [0.18, 0.94, 0.28],
    sunColorRgb: [1.0, 0.98, 0.94],
    skyAmbientRgb: [0.78, 0.86, 1.0],
    groundBounceRgb: [0.46, 0.44, 0.4],
    exposure: 1.08,
    directionalStrength: 0.75,
    fogColorRgb: [0.82, 0.88, 0.95],
    baseFogDensity: 0.008,
    colorTempKelvin: 5800,
  },
  sunset: {
    id: "sunset",
    labelKo: "노을 황혼 (Sunset)",
    sunDirection: [-0.88, 0.19, 0.43],
    sunColorRgb: [1.0, 0.48, 0.22],
    skyAmbientRgb: [0.48, 0.34, 0.56],
    groundBounceRgb: [0.38, 0.24, 0.2],
    exposure: 0.92,
    directionalStrength: 0.86,
    fogColorRgb: [0.84, 0.52, 0.38],
    baseFogDensity: 0.025,
    colorTempKelvin: 3100,
  },
  night: {
    id: "night",
    labelKo: "심야 월광 (Night)",
    sunDirection: [-0.36, 0.78, -0.51],
    sunColorRgb: [0.34, 0.46, 0.78],
    skyAmbientRgb: [0.12, 0.18, 0.34],
    groundBounceRgb: [0.06, 0.08, 0.14],
    exposure: 0.56,
    directionalStrength: 0.52,
    fogColorRgb: [0.1, 0.14, 0.24],
    baseFogDensity: 0.032,
    colorTempKelvin: 7800,
  },
};

export interface GaussianSplatSceneInput {
  readonly count: number;
  /** 월드 좌표: splat * 3 (x, y, z) */
  readonly positions: Float32Array;
  /** SH L0 DC 계수: splat * 3 (r, g, b) */
  readonly shL0: Float32Array;
  /** SH L1 방향성 계수: splat * 9 ([y, z, x] × [r, g, b]) */
  readonly shL1: Float32Array;
  readonly opacities: Float32Array;
}

export interface RelightCameraView {
  readonly position: Vec3Tuple;
  readonly forward: Vec3Tuple;
  readonly fovYDeg?: number;
  readonly aspect?: number;
  readonly nearDepthM?: number;
  readonly farDepthM?: number;
}

export interface Relight3dgsOptions {
  readonly timeOfDay: TimeOfDayPreset;
  readonly weather: WeatherPassKind;
  readonly weatherIntensity?: number;
  readonly relightStrength?: number;
  readonly fogStartM?: number;
  readonly fogDensityMultiplier?: number;
  readonly particleCount?: number;
  readonly windVelocity?: Vec3Tuple;
  readonly timeSec?: number;
  readonly seed?: number;
  readonly camera?: RelightCameraView;
}

export interface WeatherParticle {
  readonly index: number;
  readonly kind: Exclude<WeatherPassKind, "clear">;
  readonly position: Vec3Tuple;
  readonly velocity: Vec3Tuple;
  readonly cameraDepthM: number;
  readonly depthLayer: "near" | "mid" | "far";
  readonly sizePx: number;
  readonly streakLengthPx: number;
  readonly alpha: number;
  readonly occludedByScene: boolean;
}

export interface Relight3dgsResult {
  readonly count: number;
  readonly timeOfDay: TimeOfDayPreset;
  readonly weather: WeatherPassKind;
  readonly shL0Relit: Float32Array;
  readonly shL1Relit: Float32Array;
  readonly splatFogFactors: Float32Array;
  readonly meanLuminanceBefore: number;
  readonly meanLuminanceAfter: number;
  readonly meanWarmthRatioAfter: number;
  readonly meanFogFactor: number;
  readonly particles: readonly WeatherParticle[];
  readonly elapsedMs: number;
}

export interface RelightWgslValidation {
  readonly valid: boolean;
  readonly hasComputeEntry: boolean;
  readonly hasShL0L1Transform: boolean;
  readonly hasDepthFogPass: boolean;
}

export const WGSL_3DGS_SH_RELIGHT_WEATHER = /* wgsl */ `
// 3DGS Spherical-Harmonics L0/L1 Time-of-Day Relighting & Depth-Aware Fog Compute Pass
struct RelightUniforms {
  splatCount: u32,
  fogStartM: f32,
  fogDensity: f32,
  relightStrength: f32,
  sunDirAndExposure: vec4<f32>,
  sunColorAndDirStrength: vec4<f32>,
  skyAmbientAndPad: vec4<f32>,
  fogColorAndPad: vec4<f32>,
  camPosAndPad: vec4<f32>,
  camFwdAndPad: vec4<f32>,
};

const SH_C0: f32 = 0.28209479;
const SH_C1: f32 = 0.48860251;

@group(0) @binding(0) var<uniform> u: RelightUniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> shL0In: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> shL1In: array<f32>;
@group(0) @binding(4) var<storage, read_write> shL0Out: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> shL1Out: array<f32>;

@compute @workgroup_size(64, 1, 1)
fn relight3dgsShPass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u.splatCount) {
    return;
  }
  let pos = positions[i].xyz;
  let relPos = pos - u.camPosAndPad.xyz;
  let camDepth = max(0.0, dot(relPos, u.camFwdAndPad.xyz));

  let dcIn = shL0In[i].xyz;
  let baseRgb = clamp(vec3<f32>(0.5) + dcIn * SH_C0, vec3<f32>(0.0), vec3<f32>(2.0));
  let lightTint = (u.skyAmbientAndPad.xyz * 0.58 + u.sunColorAndDirStrength.xyz * 0.42) * u.sunDirAndExposure.w;
  var litRgb = mix(baseRgb, baseRgb * lightTint, u.relightStrength);

  let fogDist = max(0.0, camDepth - u.fogStartM);
  let fogArg = u.fogDensity * fogDist;
  let fogFactor = clamp(1.0 - exp(-(fogArg * fogArg)), 0.0, 0.96);
  litRgb = mix(litRgb, u.fogColorAndPad.xyz, fogFactor);
  shL0Out[i] = vec4<f32>((litRgb - vec3<f32>(0.5)) / SH_C0, shL0In[i].w);

  let sunDir = normalize(u.sunDirAndExposure.xyz);
  let dirScale = u.sunColorAndDirStrength.w * u.relightStrength * (1.0 - fogFactor);
  let basis = array<f32, 3>(sunDir.y, sunDir.z, sunDir.x);
  let baseIdx = i * 9u;
  for (var b: u32 = 0u; b < 3u; b = b + 1u) {
    let shTerm = SH_C1 * basis[b] * dirScale;
    let offset = baseIdx + b * 3u;
    shL1Out[offset] = mix(shL1In[offset], shL1In[offset] * 0.35 + litRgb.x * u.sunColorAndDirStrength.x * shTerm, u.relightStrength);
    shL1Out[offset + 1u] = mix(shL1In[offset + 1u], shL1In[offset + 1u] * 0.35 + litRgb.y * u.sunColorAndDirStrength.y * shTerm, u.relightStrength);
    shL1Out[offset + 2u] = mix(shL1In[offset + 2u], shL1In[offset + 2u] * 0.35 + litRgb.z * u.sunColorAndDirStrength.z * shTerm, u.relightStrength);
  }
}
`;

export function validate3dgsRelightWgslSource(
  source: string = WGSL_3DGS_SH_RELIGHT_WEATHER,
): RelightWgslValidation {
  const hasComputeEntry =
    source.indexOf("@compute") >= 0 && source.indexOf("fn relight3dgsShPass") >= 0;
  const hasShL0L1Transform =
    source.indexOf("shL0Out") >= 0 && source.indexOf("shL1Out") >= 0 && source.indexOf("SH_C1") >= 0;
  const hasDepthFogPass =
    source.indexOf("fogFactor") >= 0 && source.indexOf("camDepth") >= 0;
  return {
    valid: hasComputeEntry && hasShL0L1Transform && hasDepthFogPass,
    hasComputeEntry,
    hasShL0L1Transform,
    hasDepthFogPass,
  };
}

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function normalizeVec3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= 1e-8) return [0, 0, -1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function deterministicUnitRand(index: number, channel: number, seed: number): number {
  let n = Math.imul(index + 1, 374761393) + Math.imul(channel + 17, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967295;
}

function luminanceRgb(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 깊이 인식 날씨 파티클(안개·비·눈) 생성기.
 * 카메라 절두체 깊이 구간(near/mid/far)과 장면 깊이 경계를 반영해 백-투-프론트 정렬한다.
 */
export function generateDepthAwareWeatherParticles(params: {
  readonly weather: WeatherPassKind;
  readonly intensity: number;
  readonly count: number;
  readonly camera: RelightCameraView;
  readonly sceneMaxDepthM: number;
  readonly windVelocity: Vec3Tuple;
  readonly timeSec: number;
  readonly seed: number;
}): WeatherParticle[] {
  if (params.weather === "clear" || params.count <= 0 || params.intensity <= 0.001) {
    return [];
  }
  const weatherKind = params.weather;
  const intensity = clamp01(params.intensity);
  const nearM = Math.max(0.4, params.camera.nearDepthM ?? 1.2);
  const farM = Math.max(nearM + 2, params.camera.farDepthM ?? 42);
  const fovRad = ((params.camera.fovYDeg ?? 50) * Math.PI) / 180;
  const aspect = params.camera.aspect ?? 16 / 9;
  const tanHalfY = Math.tan(fovRad * 0.5);

  const fwd = normalizeVec3(params.camera.forward);
  const upHint: Vec3Tuple = Math.abs(fwd[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
  // right = normalize(cross(fwd, upHint))
  const right = normalizeVec3([
    fwd[1] * upHint[2] - fwd[2] * upHint[1],
    fwd[2] * upHint[0] - fwd[0] * upHint[2],
    fwd[0] * upHint[1] - fwd[1] * upHint[0],
  ]);
  // camUp = cross(right, fwd)
  const camUp: Vec3Tuple = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];

  const particles: WeatherParticle[] = [];
  for (let i = 0; i < params.count; i += 1) {
    const uDepth = deterministicUnitRand(i, 0, params.seed);
    const uX = deterministicUnitRand(i, 1, params.seed) * 2 - 1;
    const uY = deterministicUnitRand(i, 2, params.seed) * 2 - 1;
    const uPhase = deterministicUnitRand(i, 3, params.seed);

    const depthM = nearM + uDepth * (farM - nearM);
    const halfH = depthM * tanHalfY;
    const halfW = halfH * aspect;

    let fallSpeedY: number;
    let sizePx: number;
    let streakLengthPx: number;
    let baseAlpha: number;
    let lateralSway = 0;

    if (weatherKind === "rain") {
      fallSpeedY = -(11 + uPhase * 7) * (0.7 + 0.5 * intensity);
      sizePx = Math.max(1, (2.2 / Math.max(1, depthM * 0.25)) * (0.8 + 0.4 * intensity));
      streakLengthPx = Math.max(6, (34 / Math.max(1, depthM * 0.22)) * (0.75 + 0.5 * intensity));
      baseAlpha = clamp01((0.32 + 0.42 * intensity) * (1 - uDepth * 0.55));
    } else if (weatherKind === "snow") {
      fallSpeedY = -(1.1 + uPhase * 1.4);
      lateralSway = Math.sin(params.timeSec * (1.4 + uPhase * 2) + i * 0.7) * 0.85;
      sizePx = Math.max(1.5, (7.5 / Math.max(1, depthM * 0.28)) * (0.7 + 0.5 * uPhase));
      streakLengthPx = 0;
      baseAlpha = clamp01((0.45 + 0.45 * intensity) * (1 - uDepth * 0.4));
    } else {
      fallSpeedY = -0.15;
      lateralSway = Math.sin(params.timeSec * 0.35 + uPhase * 6.28) * 0.45;
      sizePx = Math.max(18, (88 / Math.max(1, depthM * 0.16)) * (0.8 + 0.6 * uPhase));
      streakLengthPx = 0;
      baseAlpha = clamp01((0.14 + 0.28 * intensity) * (0.4 + 0.6 * uDepth));
    }

    const vx = params.windVelocity[0] + lateralSway;
    const vy = params.windVelocity[1] + fallSpeedY;
    const vz = params.windVelocity[2];

    const wrappedY = ((((uY * halfH + vy * params.timeSec) % (2 * halfH)) + 3 * halfH) % (2 * halfH)) - halfH;
    const localX = uX * halfW + vx * (params.timeSec % 4) * 0.15;

    const worldPos: Vec3Tuple = [
      params.camera.position[0] + fwd[0] * depthM + right[0] * localX + camUp[0] * wrappedY,
      params.camera.position[1] + fwd[1] * depthM + right[1] * localX + camUp[1] * wrappedY,
      params.camera.position[2] + fwd[2] * depthM + right[2] * localX + camUp[2] * wrappedY,
    ];

    const depthLayer: WeatherParticle["depthLayer"] =
      uDepth < 0.33 ? "near" : uDepth < 0.68 ? "mid" : "far";
    const occludedByScene = depthM > params.sceneMaxDepthM;

    particles.push({
      index: i,
      kind: weatherKind,
      position: worldPos,
      velocity: [vx, vy, vz],
      cameraDepthM: depthM,
      depthLayer,
      sizePx,
      streakLengthPx,
      alpha: occludedByScene ? baseAlpha * 0.12 : baseAlpha,
      occludedByScene,
    });
  }

  // 원거리 -> 근거리(back-to-front) 정렬
  particles.sort((a, b) => b.cameraDepthM - a.cameraDepthM);
  return particles;
}

/**
 * 3DGS SH L0/L1 시간대 재조명 + 깊이 인식 대기 안개 + 날씨 파티클 패스.
 */
export function relight3dgsSceneSh(
  scene: GaussianSplatSceneInput,
  options: Relight3dgsOptions,
): Relight3dgsResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const count = Math.max(
    0,
    Math.min(
      scene.count,
      Math.floor(scene.positions.length / 3),
      Math.floor(scene.shL0.length / 3),
      Math.floor(scene.shL1.length / 9),
    ),
  );

  const spec = TIME_OF_DAY_SH_PRESETS[options.timeOfDay];
  const sunDir = normalizeVec3(spec.sunDirection);
  const relightStrength = clamp01(options.relightStrength ?? 1.0);
  const weatherIntensity = clamp01(
    options.weatherIntensity ?? (options.weather === "clear" ? 0 : 0.72),
  );
  const camera: RelightCameraView = options.camera ?? {
    position: [0, 1.6, 5],
    forward: [0, 0, -1],
    fovYDeg: 50,
    aspect: 16 / 9,
    nearDepthM: 1.0,
    farDepthM: 45,
  };
  const camFwd = normalizeVec3(camera.forward);

  const weatherFogBoost =
    options.weather === "fog"
      ? 2.8 * weatherIntensity
      : options.weather === "rain"
        ? 1.45 * weatherIntensity
        : options.weather === "snow"
          ? 1.75 * weatherIntensity
          : 0;
  const fogDensity =
    (spec.baseFogDensity + weatherFogBoost * 0.028) *
    Math.max(0, options.fogDensityMultiplier ?? 1);
  const fogStartM = Math.max(0, options.fogStartM ?? 2.0);

  const lightTintR = (spec.skyAmbientRgb[0] * 0.56 + spec.sunColorRgb[0] * 0.44) * spec.exposure;
  const lightTintG = (spec.skyAmbientRgb[1] * 0.56 + spec.sunColorRgb[1] * 0.44) * spec.exposure;
  const lightTintB = (spec.skyAmbientRgb[2] * 0.56 + spec.sunColorRgb[2] * 0.44) * spec.exposure;

  const shL0Relit = new Float32Array(count * 3);
  const shL1Relit = new Float32Array(count * 9);
  const splatFogFactors = new Float32Array(count);

  let lumBeforeSum = 0;
  let lumAfterSum = 0;
  let warmSum = 0;
  let fogSum = 0;
  let sceneMaxDepthM = camera.nearDepthM ?? 1.0;

  // SH L1 3개 방향 기저: (y, z, x)
  const sunBasis: readonly [number, number, number] = [sunDir[1], sunDir[2], sunDir[0]];

  for (let i = 0; i < count; i += 1) {
    const p3 = i * 3;
    const dx = scene.positions[p3] - camera.position[0];
    const dy = scene.positions[p3 + 1] - camera.position[1];
    const dz = scene.positions[p3 + 2] - camera.position[2];
    const camDepth = Math.max(0, dx * camFwd[0] + dy * camFwd[1] + dz * camFwd[2]);
    if (camDepth > sceneMaxDepthM) sceneMaxDepthM = camDepth;

    const baseR = Math.max(0, 0.5 + scene.shL0[p3] * SH_C0);
    const baseG = Math.max(0, 0.5 + scene.shL0[p3 + 1] * SH_C0);
    const baseB = Math.max(0, 0.5 + scene.shL0[p3 + 2] * SH_C0);
    lumBeforeSum += luminanceRgb(baseR, baseG, baseB);

    const litR = baseR + relightStrength * (baseR * lightTintR - baseR);
    const litG = baseG + relightStrength * (baseG * lightTintG - baseG);
    const litB = baseB + relightStrength * (baseB * lightTintB - baseB);

    const fogDist = Math.max(0, camDepth - fogStartM);
    const fogArg = fogDensity * fogDist;
    const fogFactor = clamp01(1 - Math.exp(-(fogArg * fogArg))) * 0.96;
    splatFogFactors[i] = fogFactor;
    fogSum += fogFactor;

    const finalR = litR * (1 - fogFactor) + spec.fogColorRgb[0] * fogFactor;
    const finalG = litG * (1 - fogFactor) + spec.fogColorRgb[1] * fogFactor;
    const finalB = litB * (1 - fogFactor) + spec.fogColorRgb[2] * fogFactor;

    lumAfterSum += luminanceRgb(finalR, finalG, finalB);
    warmSum += finalR / Math.max(0.02, finalB);

    shL0Relit[p3] = (finalR - 0.5) / SH_C0;
    shL0Relit[p3 + 1] = (finalG - 0.5) / SH_C0;
    shL0Relit[p3 + 2] = (finalB - 0.5) / SH_C0;

    // SH L1: 기존 방향성을 35% 보존하면서 신규 태양/천공 방향성 쌍극자를 주입한다.
    const l1Base = i * 9;
    const dirGain = spec.directionalStrength * relightStrength * (1 - fogFactor);
    for (let b = 0; b < 3; b += 1) {
      const shTerm = SH_C1 * sunBasis[b] * dirGain;
      const off = l1Base + b * 3;
      const skyBounceY = b === 0 ? (spec.skyAmbientRgb[0] - spec.groundBounceRgb[0]) * 0.2 : 0;
      const skyBounceG = b === 0 ? (spec.skyAmbientRgb[1] - spec.groundBounceRgb[1]) * 0.2 : 0;
      const skyBounceB = b === 0 ? (spec.skyAmbientRgb[2] - spec.groundBounceRgb[2]) * 0.2 : 0;

      const targetR = scene.shL1[off] * 0.35 + finalR * spec.sunColorRgb[0] * shTerm + skyBounceY;
      const targetG = scene.shL1[off + 1] * 0.35 + finalG * spec.sunColorRgb[1] * shTerm + skyBounceG;
      const targetB = scene.shL1[off + 2] * 0.35 + finalB * spec.sunColorRgb[2] * shTerm + skyBounceB;

      shL1Relit[off] = scene.shL1[off] + relightStrength * (targetR - scene.shL1[off]);
      shL1Relit[off + 1] = scene.shL1[off + 1] + relightStrength * (targetG - scene.shL1[off + 1]);
      shL1Relit[off + 2] = scene.shL1[off + 2] + relightStrength * (targetB - scene.shL1[off + 2]);
    }
  }

  const defaultParticles =
    options.weather === "clear" ? 0 : options.weather === "fog" ? 48 : 160;
  const particles = generateDepthAwareWeatherParticles({
    weather: options.weather,
    intensity: weatherIntensity,
    count: options.particleCount ?? defaultParticles,
    camera,
    sceneMaxDepthM,
    windVelocity: options.windVelocity ?? [1.8, 0, -0.4],
    timeSec: options.timeSec ?? 0,
    seed: options.seed ?? 2026,
  });

  const denom = Math.max(1, count);
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    count,
    timeOfDay: options.timeOfDay,
    weather: options.weather,
    shL0Relit,
    shL1Relit,
    splatFogFactors,
    meanLuminanceBefore: lumBeforeSum / denom,
    meanLuminanceAfter: lumAfterSum / denom,
    meanWarmthRatioAfter: warmSum / denom,
    meanFogFactor: fogSum / denom,
    particles,
    elapsedMs: Math.max(0, t1 - t0),
  };
}
