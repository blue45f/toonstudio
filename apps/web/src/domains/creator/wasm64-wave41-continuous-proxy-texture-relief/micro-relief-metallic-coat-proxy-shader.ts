/**
 * Wave 41: 스튜디오 물리 재질 규율(`Metallic` 이진 `0.0 | 1.0`, `Coat`, `Sheen`, `Anisotropy`, `Subsurface`)을
 * 엄수하는 마이크로 표면 요철(`Height -> Scharr/Sobel Normal + Horizon Cavity AO`) 프록시 셰이더 평가기.
 *
 * - 유전체(목재·천·종이·피부)는 `metallic = 0.0`, 금속(황동·강철)은 `metallic = 1.0`으로 엄격히 이진화한다.
 * - 2D 높이 필드에서 회전 대칭 Scharr/Sobel 단위 법선과 8방향 수평선 공동 차폐(Horizon Cavity AO)를 산출하고,
 *   WebGPU `16B` 정렬 유니폼 버퍼(`80B`)로 직렬화한다.
 */

/** WebGPU `std140`/`uniform` 16바이트 정렬 유니폼 버퍼 크기 (`5 * vec4<f32> = 80 bytes`). */
export const MICRO_RELIEF_UNIFORM_BYTE_LENGTH = 80 as const;
/** WebGPU 유니폼 버퍼의 `Float32Array` 원소 개수 (`20`). */
export const MICRO_RELIEF_UNIFORM_FLOAT_COUNT = 20 as const;
/** 표준 유전체 프레넬 수직 반사율 (`IOR = 1.5 -> 0.04`). */
export const DIELECTRIC_DEFAULT_F0 = 0.04 as const;

export type StudioMaterialClass = "dielectric" | "conductor";
export type MicroReliefGradientKernel = "scharr" | "sobel";
export type StudioMicroReliefPresetId =
  | "wood-satin-varnish"
  | "cloth-matte-weave"
  | "paper-hanji"
  | "skin-warm-subsurface"
  | "metal-brushed-brass"
  | "metal-forged-steel";

export interface LinearRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Vec3Direction {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioMicroReliefMaterialInput {
  readonly materialClass?: StudioMaterialClass;
  readonly labelKo?: string;
  readonly baseLinearColor: LinearRgbColor;
  readonly metallic?: number;
  readonly roughness: number;
  readonly coatWeight?: number;
  readonly coatRoughness?: number;
  readonly sheenWeight?: number;
  readonly sheenRoughness?: number;
  readonly anisotropyStrength?: number;
  readonly anisotropyAngleRad?: number;
  readonly subsurfaceWeight?: number;
  readonly reliefStrength?: number;
  readonly cavityStrength?: number;
}

export interface SanitizedStudioMaterialParams {
  readonly materialClass: StudioMaterialClass;
  readonly labelKo: string;
  readonly baseLinearColor: LinearRgbColor;
  readonly metallic: 0 | 1;
  readonly metallicBinarySnapped: boolean;
  readonly roughness: number;
  readonly coatWeight: number;
  readonly coatRoughness: number;
  readonly sheenWeight: number;
  readonly sheenRoughness: number;
  readonly anisotropyStrength: number;
  readonly anisotropyAngleRad: number;
  readonly subsurfaceWeight: number;
  readonly reliefStrength: number;
  readonly cavityStrength: number;
}

export const STUDIO_MICRO_RELIEF_PRESETS: Readonly<Record<StudioMicroReliefPresetId, StudioMicroReliefMaterialInput>> = {
  "wood-satin-varnish": {
    materialClass: "dielectric", labelKo: "사틴 바니시 원목", baseLinearColor: { r: 0.28, g: 0.14, b: 0.06 },
    metallic: 0, roughness: 0.48, coatWeight: 0.68, coatRoughness: 0.16, anisotropyStrength: 0.15, reliefStrength: 1.6, cavityStrength: 0.75,
  },
  "cloth-matte-weave": {
    materialClass: "dielectric", labelKo: "무광 직물 망토", baseLinearColor: { r: 0.12, g: 0.16, b: 0.24 },
    metallic: 0, roughness: 0.82, sheenWeight: 0.76, sheenRoughness: 0.52, subsurfaceWeight: 0.05, reliefStrength: 1.25, cavityStrength: 0.85,
  },
  "paper-hanji": {
    materialClass: "dielectric", labelKo: "전통 한지 표면", baseLinearColor: { r: 0.84, g: 0.8, b: 0.71 },
    metallic: 0, roughness: 0.88, sheenWeight: 0.2, sheenRoughness: 0.65, subsurfaceWeight: 0.22, reliefStrength: 0.9, cavityStrength: 0.55,
  },
  "skin-warm-subsurface": {
    materialClass: "dielectric", labelKo: "따뜻한 피부 결", baseLinearColor: { r: 0.68, g: 0.42, b: 0.33 },
    metallic: 0, roughness: 0.54, coatWeight: 0.08, coatRoughness: 0.38, sheenWeight: 0.06, subsurfaceWeight: 0.44, reliefStrength: 0.45, cavityStrength: 0.35,
  },
  "metal-brushed-brass": {
    materialClass: "conductor", labelKo: "브러시드 황동 장식", baseLinearColor: { r: 0.88, g: 0.66, b: 0.24 },
    metallic: 1, roughness: 0.28, coatWeight: 0.12, coatRoughness: 0.08, anisotropyStrength: 0.78, anisotropyAngleRad: 0, reliefStrength: 1.4, cavityStrength: 0.7,
  },
  "metal-forged-steel": {
    materialClass: "conductor", labelKo: "단조 강철 갑옷", baseLinearColor: { r: 0.58, g: 0.6, b: 0.63 },
    metallic: 1, roughness: 0.34, anisotropyStrength: 0.46, anisotropyAngleRad: Math.PI * 0.25, reliefStrength: 1.85, cavityStrength: 0.82,
  },
};

export interface MicroReliefFieldBuildOptions {
  readonly reliefStrength?: number;
  readonly cavityStrength?: number;
  readonly horizonRadiusPx?: number;
  readonly gradientKernel?: MicroReliefGradientKernel;
}

export interface MicroReliefNormalCavityField {
  readonly width: number;
  readonly height: number;
  readonly normalsXyz: Float32Array;
  readonly cavityAo: Float32Array;
}

export interface MicroReliefLightEnvironment {
  readonly lightDirection: Vec3Direction;
  readonly viewDirection?: Vec3Direction;
  readonly keyLightIntensity?: number;
  readonly ambientIntensity?: number;
}

export interface MicroReliefShaderEvaluation {
  readonly width: number;
  readonly height: number;
  readonly material: SanitizedStudioMaterialParams;
  readonly shadedLinearRgb: Float32Array;
  readonly shadedSrgbRgba8: Uint8ClampedArray;
  readonly maxSpecularLuma: number;
  readonly meanLuminance: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeVec3(v: Vec3Direction, fallbackZ = 1): Vec3Direction {
  const x = Number.isFinite(v.x) ? v.x : 0;
  const y = Number.isFinite(v.y) ? v.y : 0;
  const z = Number.isFinite(v.z) ? v.z : fallbackZ;
  const len = Math.hypot(x, y, z);
  return len < 1e-8 ? { x: 0, y: 0, z: 1 } : { x: x / len, y: y / len, z: z / len };
}

function linearToSrgbByte(linear: number): number {
  const v = clamp(linear, 0, 1);
  const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp(srgb * 255, 0, 255));
}

/** 스튜디오 물리 재질 규율에 따라 `Metallic`을 이진값(`0 | 1`)으로 강제 정규화한다. */
export function sanitizeStudioMaterialParams(
  input: StudioMicroReliefMaterialInput,
): SanitizedStudioMaterialParams {
  const rawMetallic = Number.isFinite(input.metallic) ? (input.metallic ?? 0) : 0;
  const resolvedClass: StudioMaterialClass =
    input.materialClass ?? (rawMetallic >= 0.5 ? "conductor" : "dielectric");
  const metallic: 0 | 1 = resolvedClass === "conductor" ? 1 : 0;

  return {
    materialClass: resolvedClass,
    labelKo: input.labelKo ?? (metallic === 1 ? "금속 표면" : "유전체 표면"),
    baseLinearColor: {
      r: clamp(input.baseLinearColor.r, 0, 1),
      g: clamp(input.baseLinearColor.g, 0, 1),
      b: clamp(input.baseLinearColor.b, 0, 1),
    },
    metallic,
    metallicBinarySnapped: Math.abs(rawMetallic - metallic) > 1e-6,
    roughness: clamp(input.roughness, 0.045, 1),
    coatWeight: clamp(input.coatWeight ?? 0, 0, 1),
    coatRoughness: clamp(input.coatRoughness ?? 0.15, 0.045, 1),
    sheenWeight: metallic === 0 ? clamp(input.sheenWeight ?? 0, 0, 1) : 0,
    sheenRoughness: clamp(input.sheenRoughness ?? 0.5, 0.08, 1),
    anisotropyStrength: clamp(input.anisotropyStrength ?? 0, -0.95, 0.95),
    anisotropyAngleRad: Number.isFinite(input.anisotropyAngleRad) ? (input.anisotropyAngleRad ?? 0) : 0,
    subsurfaceWeight: metallic === 0 ? clamp(input.subsurfaceWeight ?? 0, 0, 1) : 0,
    reliefStrength: clamp(input.reliefStrength ?? 1.0, 0, 8),
    cavityStrength: clamp(input.cavityStrength ?? 0.65, 0, 1),
  };
}

const HORIZON_DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
];

function sampleHeightClamped(field: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
  const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
  return field[cy * w + cx];
}

/** 2D 마이크로 높이 맵에서 Scharr/Sobel 단위 법선장과 8방향 수평선 공동 차폐(Horizon Cavity AO)를 생성한다. */
export function computeMicroReliefNormalAndCavityField(
  heightField: Float32Array,
  width: number,
  height: number,
  options: MicroReliefFieldBuildOptions = {},
): MicroReliefNormalCavityField {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const total = safeW * safeH;
  const normalsXyz = new Float32Array(total * 3);
  const cavityAo = new Float32Array(total);

  if (heightField.length < total) {
    for (let i = 0; i < total; i += 1) {
      normalsXyz[i * 3 + 2] = 1;
      cavityAo[i] = 1;
    }
    return { width: safeW, height: safeH, normalsXyz, cavityAo };
  }

  const reliefStrength = clamp(options.reliefStrength ?? 1.2, 0, 12);
  const cavityStrength = clamp(options.cavityStrength ?? 0.7, 0, 1);
  const horizonRadiusPx = Math.max(1, Math.min(6, Math.floor(options.horizonRadiusPx ?? 3)));
  const useScharr = (options.gradientKernel ?? "scharr") === "scharr";
  const cw = useScharr ? 3 : 1;
  const aw = useScharr ? 10 : 2;
  const div = useScharr ? 32 : 8;

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const h00 = sampleHeightClamped(heightField, safeW, safeH, x - 1, y - 1);
      const h10 = sampleHeightClamped(heightField, safeW, safeH, x, y - 1);
      const h20 = sampleHeightClamped(heightField, safeW, safeH, x + 1, y - 1);
      const h01 = sampleHeightClamped(heightField, safeW, safeH, x - 1, y);
      const hCenter = sampleHeightClamped(heightField, safeW, safeH, x, y);
      const h21 = sampleHeightClamped(heightField, safeW, safeH, x + 1, y);
      const h02 = sampleHeightClamped(heightField, safeW, safeH, x - 1, y + 1);
      const h12 = sampleHeightClamped(heightField, safeW, safeH, x, y + 1);
      const h22 = sampleHeightClamped(heightField, safeW, safeH, x + 1, y + 1);

      const gx = (cw * (h20 - h00) + aw * (h21 - h01) + cw * (h22 - h02)) / div;
      const gy = (cw * (h02 - h00) + aw * (h12 - h10) + cw * (h22 - h20)) / div;
      const rawNx = -gx * reliefStrength * 4;
      const rawNy = -gy * reliefStrength * 4;
      const invLen = 1 / Math.hypot(rawNx, rawNy, 1);
      const idx = y * safeW + x;
      normalsXyz[idx * 3] = rawNx * invLen;
      normalsXyz[idx * 3 + 1] = rawNy * invLen;
      normalsXyz[idx * 3 + 2] = invLen;

      let occlusionSum = 0;
      for (const [dx, dy] of HORIZON_DIRS) {
        const stepWorldDist = Math.hypot(dx, dy);
        let maxSlope = 0;
        for (let step = 1; step <= horizonRadiusPx; step += 1) {
          const sampleH = sampleHeightClamped(heightField, safeW, safeH, x + dx * step, y + dy * step);
          const slope = ((sampleH - hCenter) * (1 + reliefStrength * 2.5)) / (step * stepWorldDist * 0.25);
          if (slope > maxSlope) maxSlope = slope;
        }
        occlusionSum += (maxSlope * maxSlope) / (1 + maxSlope * maxSlope);
      }
      const laplacian = Math.max(0, (h10 + h12 + h01 + h21 - 4 * hCenter) * 3.5);
      const rawOcc = clamp((occlusionSum / HORIZON_DIRS.length) * 0.8 + laplacian * 0.2, 0, 1);
      cavityAo[idx] = clamp(1 - rawOcc * cavityStrength, 0.08, 1);
    }
  }

  return { width: safeW, height: safeH, normalsXyz, cavityAo };
}

function evaluateAnisotropicGgxD(ndoth: number, tdoth: number, bdoth: number, alphaT: number, alphaB: number): number {
  const vx = tdoth / alphaT;
  const vy = bdoth / alphaB;
  const denomTerm = vx * vx + vy * vy + ndoth * ndoth;
  const denom = Math.PI * alphaT * alphaB * denomTerm * denomTerm;
  return denom > 1e-8 ? 1 / denom : 0;
}

function evaluateSmithGgxVis(ndotl: number, ndotv: number, alpha: number): number {
  const a2 = alpha * alpha;
  const sum = ndotv * Math.sqrt(a2 + (1 - a2) * ndotl * ndotl) + ndotl * Math.sqrt(a2 + (1 - a2) * ndotv * ndotv);
  return sum > 1e-6 ? 0.5 / sum : 0;
}

/** 마이크로 요철 법선·공동 차폐 필드와 물리 재질 규율로 2D/2.5D 프록시 표면 조명을 평가한다. */
export function evaluateMicroReliefProxyShader(
  heightField: Float32Array,
  width: number,
  height: number,
  materialInput: StudioMicroReliefMaterialInput,
  lightEnv: MicroReliefLightEnvironment,
  fieldOptions: MicroReliefFieldBuildOptions = {},
): MicroReliefShaderEvaluation {
  const material = sanitizeStudioMaterialParams(materialInput);
  const reliefField = computeMicroReliefNormalAndCavityField(heightField, width, height, {
    reliefStrength: fieldOptions.reliefStrength ?? material.reliefStrength,
    cavityStrength: fieldOptions.cavityStrength ?? material.cavityStrength,
    horizonRadiusPx: fieldOptions.horizonRadiusPx,
    gradientKernel: fieldOptions.gradientKernel,
  });

  const lDir = normalizeVec3(lightEnv.lightDirection);
  const vDir = normalizeVec3(lightEnv.viewDirection ?? { x: 0, y: 0, z: 1 });
  const hDir = normalizeVec3({ x: lDir.x + vDir.x, y: lDir.y + vDir.y, z: lDir.z + vDir.z });
  const keyIntensity = Math.max(0, lightEnv.keyLightIntensity ?? 1.35);
  const ambientIntensity = Math.max(0, lightEnv.ambientIntensity ?? 0.28);

  const aspect = Math.sqrt(1 - Math.abs(material.anisotropyStrength) * 0.85);
  const baseAlpha = material.roughness * material.roughness;
  const alphaT = Math.max(0.002, material.anisotropyStrength >= 0 ? baseAlpha / aspect : baseAlpha * aspect);
  const alphaB = Math.max(0.002, material.anisotropyStrength >= 0 ? baseAlpha * aspect : baseAlpha / aspect);
  const cosAniso = Math.cos(material.anisotropyAngleRad);
  const sinAniso = Math.sin(material.anisotropyAngleRad);
  const coatAlpha = material.coatRoughness * material.coatRoughness;

  const f0R = material.metallic === 1 ? material.baseLinearColor.r : DIELECTRIC_DEFAULT_F0;
  const f0G = material.metallic === 1 ? material.baseLinearColor.g : DIELECTRIC_DEFAULT_F0;
  const f0B = material.metallic === 1 ? material.baseLinearColor.b : DIELECTRIC_DEFAULT_F0;

  const total = reliefField.width * reliefField.height;
  const shadedLinearRgb = new Float32Array(total * 3);
  const shadedSrgbRgba8 = new Uint8ClampedArray(total * 4);
  let maxSpecularLuma = 0;
  let lumaSum = 0;

  for (let i = 0; i < total; i += 1) {
    const nx = reliefField.normalsXyz[i * 3];
    const ny = reliefField.normalsXyz[i * 3 + 1];
    const nz = reliefField.normalsXyz[i * 3 + 2];
    const ao = reliefField.cavityAo[i];

    const nDotRef = nx * cosAniso + ny * sinAniso;
    let tx = cosAniso - nx * nDotRef;
    let ty = sinAniso - ny * nDotRef;
    let tz = -nz * nDotRef;
    const tLen = Math.max(1e-8, Math.hypot(tx, ty, tz));
    tx /= tLen;
    ty /= tLen;
    tz /= tLen;
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;

    const rawNdotL = nx * lDir.x + ny * lDir.y + nz * lDir.z;
    const ndotl = clamp(rawNdotL, 0, 1);
    const ndotv = clamp(nx * vDir.x + ny * vDir.y + nz * vDir.z, 1e-4, 1);
    const ndoth = clamp(nx * hDir.x + ny * hDir.y + nz * hDir.z, 0, 1);
    const vdoth = clamp(vDir.x * hDir.x + vDir.y * hDir.y + vDir.z * hDir.z, 0, 1);
    const tdoth = tx * hDir.x + ty * hDir.y + tz * hDir.z;
    const bdoth = bx * hDir.x + by * hDir.y + bz * hDir.z;

    const schlick = (1 - vdoth) ** 5;
    const fR = f0R + (1 - f0R) * schlick;
    const fG = f0G + (1 - f0G) * schlick;
    const fB = f0B + (1 - f0B) * schlick;

    const specScale =
      evaluateAnisotropicGgxD(ndoth, tdoth, bdoth, alphaT, alphaB) *
      evaluateSmithGgxVis(Math.max(1e-4, ndotl), ndotv, baseAlpha) *
      ndotl *
      keyIntensity *
      (0.35 + 0.65 * ao);

    const coatFresnel = (DIELECTRIC_DEFAULT_F0 + (1 - DIELECTRIC_DEFAULT_F0) * schlick) * material.coatWeight;
    const coatSpec =
      material.coatWeight *
      evaluateAnisotropicGgxD(ndoth, tdoth, bdoth, coatAlpha, coatAlpha) *
      evaluateSmithGgxVis(Math.max(1e-4, ndotl), ndotv, coatAlpha) *
      ndotl *
      keyIntensity;

    const sheenRim =
      material.sheenWeight > 0
        ? material.sheenWeight * (1 - ndotv) ** (2 + 3 * (1 - material.sheenRoughness)) * (0.25 + 0.75 * ndotl) * keyIntensity * 0.35
        : 0;

    const wrapDiffuse =
      material.subsurfaceWeight > 0
        ? clamp((rawNdotL + material.subsurfaceWeight) / (1 + material.subsurfaceWeight), 0, 1)
        : ndotl;
    const diffuseFactor =
      material.metallic === 0 ? ((wrapDiffuse * keyIntensity) / Math.PI + ambientIntensity * ao) * (1 - coatFresnel) : 0;

    const subWarmR = 1 + material.subsurfaceWeight * 0.14 * (1 - ndotl);
    const subWarmG = 1 - material.subsurfaceWeight * 0.03 * (1 - ndotl);
    const subWarmB = 1 - material.subsurfaceWeight * 0.08 * (1 - ndotl);

    const specR = fR * specScale * (1 - coatFresnel) + coatSpec + sheenRim * (0.6 + 0.4 * material.baseLinearColor.r);
    const specG = fG * specScale * (1 - coatFresnel) + coatSpec + sheenRim * (0.6 + 0.4 * material.baseLinearColor.g);
    const specB = fB * specScale * (1 - coatFresnel) + coatSpec + sheenRim * (0.6 + 0.4 * material.baseLinearColor.b);

    const metalAmb = material.metallic === 1 ? ambientIntensity * ao * 0.45 : 0;
    const outR = material.baseLinearColor.r * (diffuseFactor * subWarmR + metalAmb) + specR;
    const outG = material.baseLinearColor.g * (diffuseFactor * subWarmG + metalAmb) + specG;
    const outB = material.baseLinearColor.b * (diffuseFactor * subWarmB + metalAmb) + specB;

    shadedLinearRgb[i * 3] = outR;
    shadedLinearRgb[i * 3 + 1] = outG;
    shadedLinearRgb[i * 3 + 2] = outB;

    const specLuma = 0.2126 * specR + 0.7152 * specG + 0.0722 * specB;
    if (specLuma > maxSpecularLuma) maxSpecularLuma = specLuma;
    lumaSum += 0.2126 * outR + 0.7152 * outG + 0.0722 * outB;

    shadedSrgbRgba8[i * 4] = linearToSrgbByte(outR);
    shadedSrgbRgba8[i * 4 + 1] = linearToSrgbByte(outG);
    shadedSrgbRgba8[i * 4 + 2] = linearToSrgbByte(outB);
    shadedSrgbRgba8[i * 4 + 3] = 255;
  }

  return {
    width: reliefField.width,
    height: reliefField.height,
    material,
    shadedLinearRgb,
    shadedSrgbRgba8,
    maxSpecularLuma,
    meanLuminance: total > 0 ? lumaSum / total : 0,
  };
}

/** 마이크로 요철 재질 및 조명 파라미터를 WebGPU `16B` 정렬 유니폼 버퍼(`80B`)로 직렬화한다. */
export function packMicroReliefUniformBuffer(
  materialInput: StudioMicroReliefMaterialInput,
  lightEnv: MicroReliefLightEnvironment,
): Float32Array {
  const m = sanitizeStudioMaterialParams(materialInput);
  const l = normalizeVec3(lightEnv.lightDirection);
  const v = normalizeVec3(lightEnv.viewDirection ?? { x: 0, y: 0, z: 1 });
  const buf = new Float32Array(MICRO_RELIEF_UNIFORM_FLOAT_COUNT);
  buf.set([m.baseLinearColor.r, m.baseLinearColor.g, m.baseLinearColor.b, m.metallic], 0);
  buf.set([m.roughness, m.coatWeight, m.coatRoughness, m.sheenWeight], 4);
  buf.set([m.sheenRoughness, m.anisotropyStrength, m.anisotropyAngleRad, m.subsurfaceWeight], 8);
  buf.set(
    [m.reliefStrength, m.cavityStrength, Math.max(0, lightEnv.keyLightIntensity ?? 1.35), Math.max(0, lightEnv.ambientIntensity ?? 0.28)],
    12,
  );
  buf.set([l.x, l.y, l.z, v.z], 16);
  return buf;
}

/** `packMicroReliefUniformBuffer`가 생성한 `80B` 유니폼 버퍼에서 재질·조명 설정을 역직렬화한다. */
export function unpackMicroReliefUniformBuffer(buffer: Float32Array): {
  readonly material: SanitizedStudioMaterialParams;
  readonly lightEnvironment: MicroReliefLightEnvironment;
} {
  if (buffer.byteLength !== MICRO_RELIEF_UNIFORM_BYTE_LENGTH) {
    throw new RangeError(
      `Expected ${MICRO_RELIEF_UNIFORM_BYTE_LENGTH}B uniform buffer, received ${buffer.byteLength}B`,
    );
  }
  return {
    material: sanitizeStudioMaterialParams({
      materialClass: buffer[3] >= 0.5 ? "conductor" : "dielectric",
      baseLinearColor: { r: buffer[0], g: buffer[1], b: buffer[2] },
      metallic: buffer[3],
      roughness: buffer[4],
      coatWeight: buffer[5],
      coatRoughness: buffer[6],
      sheenWeight: buffer[7],
      sheenRoughness: buffer[8],
      anisotropyStrength: buffer[9],
      anisotropyAngleRad: buffer[10],
      subsurfaceWeight: buffer[11],
      reliefStrength: buffer[12],
      cavityStrength: buffer[13],
    }),
    lightEnvironment: {
      lightDirection: normalizeVec3({ x: buffer[16], y: buffer[17], z: buffer[18] }),
      viewDirection: { x: 0, y: 0, z: clamp(buffer[19], 1e-4, 1) },
      keyLightIntensity: buffer[14],
      ambientIntensity: buffer[15],
    },
  };
}
