/**
 * 실시간 임파스토 높이장(Heightmap) 범프/노멀 셰이딩 & 30° 측면 자연광(Raking Light)
 * WGSL Compute 셰이더(`@workgroup_size(8, 8, 1)`) + 1:1 `Math.fround` CPU 등가 구현 +
 * 건·습 하이브리드(습윤층 위 건식 긁힘 Sgraffito · 마른 밑칠 높이장 위 덧칠 Relief 계승).
 *
 * - 100% 클린룸 수학·물리 구현, WebGPU 최소 스토리지 버퍼 한도(8) 내 5버퍼 설계.
 * - `wesl` `link()`로 WGSL 구문 및 바인딩 계약을 검증할 수 있다.
 */

export const STUDIO_IMPASTO_RAKING_LIGHT_WORKGROUP_X = 8;
export const STUDIO_IMPASTO_RAKING_LIGHT_WORKGROUP_Y = 8;
export const STUDIO_IMPASTO_RAKING_LIGHT_ENTRY = "impasto_raking_light_shade";
/** 30° 측면 자연광 고도각(라디안, π/6). */
export const STUDIO_IMPASTO_DEFAULT_RAKING_ELEVATION_RAD = Math.PI / 6;

export interface ImpastoRakingLightParams {
  /** 광원 방위각(라디안, 기본 -135° 화면 좌상단 자연광). */
  readonly lightAzimuthRad: number;
  /** 광원 고도각(라디안, 기본 30° 측면 자연광). */
  readonly lightElevationRad: number;
  /** Sobel 기울기 증폭(부조 깊이감). */
  readonly heightScale: number;
  /** 환경광 계수. */
  readonly ambientStrength: number;
  /** 난반사(디퓨즈) 계수. */
  readonly diffuseStrength: number;
  /** GGX 미세면 스펙큘러 하이라이트 강도. */
  readonly specularStrength: number;
  /** 미세 골(Crevice) 라플라시안 음영 강도. */
  readonly creviceAoStrength: number;
  /** 유화·아크릴 유전체 바인더 프레넬 F0. */
  readonly f0Dielectric: number;
  /** 마른 밑칠 높이장 위 덧칠 시 relief 계승 비율 [0..1]. */
  readonly dryReliefInheritance: number;
  /** 건식 긁힘(sgraffito) 시 파낸 물감이 옆 둑으로 밀려 올라가는 계수 [0..1]. */
  readonly sgraffitoRidgePush: number;
  /** 종이 높이장이 최종 부조에 결합되는 강도 [0..1]. */
  readonly paperToothCoupling: number;
  /** 측면 자연광 색온도 웜톤 틴트 [-0.25..0.25]. */
  readonly lightWarmth: number;
  /** 출력 노출 배율. */
  readonly exposure: number;
  /** 습윤층의 유효 거칠기 감소(광택 부스트) 비율 [0..0.75]. */
  readonly wetSheenBoost: number;
}

export const DEFAULT_IMPASTO_RAKING_LIGHT_PARAMS: ImpastoRakingLightParams = Object.freeze({
  lightAzimuthRad: -Math.PI * 0.75,
  lightElevationRad: STUDIO_IMPASTO_DEFAULT_RAKING_ELEVATION_RAD,
  heightScale: 3.2,
  ambientStrength: 0.26,
  diffuseStrength: 0.78,
  specularStrength: 0.42,
  creviceAoStrength: 0.48,
  f0Dielectric: 0.04,
  dryReliefInheritance: 0.68,
  sgraffitoRidgePush: 0.35,
  paperToothCoupling: 0.25,
  lightWarmth: 0.06,
  exposure: 1.0,
  wetSheenBoost: 0.32,
});

/** WGSL `ImpastoRakingLightParams` 구조체(16 × 4B = 64B, 16바이트 정렬) 필드 순서. */
export const STUDIO_IMPASTO_RAKING_LIGHT_PARAM_FIELDS = Object.freeze([
  "width",
  "height",
  "light_azimuth_rad",
  "light_elevation_rad",
  "height_scale",
  "ambient_strength",
  "diffuse_strength",
  "specular_strength",
  "crevice_ao_strength",
  "f0_dielectric",
  "dry_relief_inheritance",
  "sgraffito_ridge_push",
  "paper_tooth_coupling",
  "light_warmth",
  "exposure",
  "wet_sheen_boost",
] as const);

export interface ImpastoCpuShadeInput {
  readonly width: number;
  readonly height: number;
  /** 선형 sRGB RGBA [r, g, b, a] stride 4. */
  readonly baseColorIn: Float32Array;
  /** [paintHeight, dryUnderHeight, roughness, wetness] stride 4. */
  readonly heightPropsIn: Float32Array;
  /** 종이 높이장 [0..1] stride 1. */
  readonly paperHeightIn: Float32Array;
  readonly params?: Partial<ImpastoRakingLightParams>;
}

export interface ImpastoCpuShadeOutput {
  readonly width: number;
  readonly height: number;
  /** 30° 측면광 + GGX + 미세 골 음영 합성 선형 RGBA stride 4. */
  readonly litRgbaOut: Float32Array;
  /** [nx, ny, nz, creviceAo] stride 4. */
  readonly normalAoOut: Float32Array;
}

export interface SgraffitoCarveInput {
  readonly width: number;
  readonly height: number;
  /** [paintHeight, dryUnderHeight, roughness, wetness] stride 4 (in-place 갱신). */
  readonly heightProps: Float32Array;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  /** 긁기 도구 반경(픽셀). */
  readonly radius: number;
  /** 파내기 깊이 강도 [0..1]. */
  readonly carveStrength: number;
  /** 파낸 물감이 좌우 둑으로 밀려 올라가는 비율 [0..1]. */
  readonly ridgePush?: number;
  /** 최소 습윤도 문턱 이하(완전 건조)에서는 긁힘 저항 적용. */
  readonly dryResistance?: number;
}

export interface SgraffitoCarveDiagnostics {
  readonly carvedVolume: number;
  readonly pushedRidgeVolume: number;
  readonly exposedUnderlayerPixels: number;
  readonly maxCarveDepth: number;
}

export interface OverpaintReliefInput {
  /** 마른 밑칠의 기존 높이 [0..1]. */
  readonly dryUnderHeight: number;
  /** 새로 얹는 물감 두께 [0..1]. */
  readonly newPaintThickness: number;
  /** 새 물감 점도 (0 = 투명 글레이즈, 1 = 되직한 임파스토). */
  readonly paintViscosity: number;
  /** 새 붓자국 자체의 리지 프로파일 [-0.5..1]. */
  readonly brushStrokeRelief: number;
  /** 밑칠 계승 상한 계수 [0..1]. */
  readonly dryReliefInheritance?: number;
}

export interface OverpaintReliefResult {
  readonly effectiveTotalHeight: number;
  readonly inheritedUnderRelief: number;
  readonly preservedDryRatio: number;
  readonly combinedRoughnessDelta: number;
}

const f32 = Math.fround;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function f32Clamp(v: number, lo: number, hi: number): number {
  const x = f32(v);
  const fLo = f32(lo);
  const fHi = f32(hi);
  return x < fLo ? fLo : x > fHi ? fHi : x;
}

export function normalizeImpastoRakingLightParams(
  input?: Partial<ImpastoRakingLightParams>,
): ImpastoRakingLightParams {
  const src = { ...DEFAULT_IMPASTO_RAKING_LIGHT_PARAMS, ...input };
  return Object.freeze({
    lightAzimuthRad: clamp(src.lightAzimuthRad, -Math.PI * 2, Math.PI * 2),
    lightElevationRad: clamp(src.lightElevationRad, 0.08, Math.PI * 0.49),
    heightScale: clamp(src.heightScale, 0, 16),
    ambientStrength: clamp(src.ambientStrength, 0, 1),
    diffuseStrength: clamp(src.diffuseStrength, 0, 2),
    specularStrength: clamp(src.specularStrength, 0, 2.5),
    creviceAoStrength: clamp(src.creviceAoStrength, 0, 2),
    f0Dielectric: clamp(src.f0Dielectric, 0.01, 0.25),
    dryReliefInheritance: clamp(src.dryReliefInheritance, 0, 1),
    sgraffitoRidgePush: clamp(src.sgraffitoRidgePush, 0, 1),
    paperToothCoupling: clamp(src.paperToothCoupling, 0, 1),
    lightWarmth: clamp(src.lightWarmth, -0.25, 0.25),
    exposure: clamp(src.exposure, 0.25, 2.5),
    wetSheenBoost: clamp(src.wetSheenBoost, 0, 0.75),
  });
}

/** WGSL `ImpastoRakingLightParams`(64B)와 바이트 단위로 동일한 균일 버퍼를 패킹한다. */
export function packImpastoRakingLightUniforms(
  width: number,
  height: number,
  params?: Partial<ImpastoRakingLightParams>,
): ArrayBuffer {
  const p = normalizeImpastoRakingLightParams(params);
  const buffer = new ArrayBuffer(64);
  const u32 = new Uint32Array(buffer);
  const floats = new Float32Array(buffer);
  u32[0] = Math.max(1, Math.trunc(width)) >>> 0;
  u32[1] = Math.max(1, Math.trunc(height)) >>> 0;
  floats[2] = p.lightAzimuthRad;
  floats[3] = p.lightElevationRad;
  floats[4] = p.heightScale;
  floats[5] = p.ambientStrength;
  floats[6] = p.diffuseStrength;
  floats[7] = p.specularStrength;
  floats[8] = p.creviceAoStrength;
  floats[9] = p.f0Dielectric;
  floats[10] = p.dryReliefInheritance;
  floats[11] = p.sgraffitoRidgePush;
  floats[12] = p.paperToothCoupling;
  floats[13] = p.lightWarmth;
  floats[14] = p.exposure;
  floats[15] = p.wetSheenBoost;
  return buffer;
}

/** WebGPU Compute 디스패치 워크그룹 크기를 계산한다. */
export function computeImpastoDispatchSize(
  width: number,
  height: number,
): { readonly workgroupsX: number; readonly workgroupsY: number; readonly workgroupsZ: 1 } {
  return {
    workgroupsX: Math.max(1, Math.ceil(width / STUDIO_IMPASTO_RAKING_LIGHT_WORKGROUP_X)),
    workgroupsY: Math.max(1, Math.ceil(height / STUDIO_IMPASTO_RAKING_LIGHT_WORKGROUP_Y)),
    workgroupsZ: 1,
  };
}

/**
 * 실시간 임파스토 높이장 3×3 Sobel 법선 + 30° 측면 자연광 디퓨즈 + GGX 미세면 스펙큘러 +
 * 미세 골(Crevice) 음영 WGSL Compute 셰이더.
 */
export const STUDIO_IMPASTO_RAKING_LIGHT_WGSL = /* wgsl */ `
struct ImpastoRakingLightParams {
  width: u32,
  height: u32,
  light_azimuth_rad: f32,
  light_elevation_rad: f32,
  height_scale: f32,
  ambient_strength: f32,
  diffuse_strength: f32,
  specular_strength: f32,
  crevice_ao_strength: f32,
  f0_dielectric: f32,
  dry_relief_inheritance: f32,
  sgraffito_ridge_push: f32,
  paper_tooth_coupling: f32,
  light_warmth: f32,
  exposure: f32,
  wet_sheen_boost: f32,
}

@group(0) @binding(0) var<uniform> params: ImpastoRakingLightParams;
@group(0) @binding(1) var<storage, read> base_color_in: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> height_props_in: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> paper_height_in: array<f32>;
@group(0) @binding(4) var<storage, read_write> lit_rgba_out: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> normal_ao_out: array<vec4<f32>>;

fn clamp_coord(v: i32, limit: u32) -> u32 {
  if (v <= 0) {
    return 0u;
  }
  let u = u32(v);
  if (u >= limit) {
    return limit - 1u;
  }
  return u;
}

fn effective_height_at(ix: i32, iy: i32) -> f32 {
  let x = clamp_coord(ix, params.width);
  let y = clamp_coord(iy, params.height);
  let idx = y * params.width + x;
  let hp = height_props_in[idx];
  let paint_h = hp.x;
  let dry_under_h = hp.y;
  let paper_h = paper_height_in[idx];
  let inherited = dry_under_h * params.dry_relief_inheritance * (1.0 - 0.35 * clamp(paint_h, 0.0, 1.0));
  return paint_h + inherited + paper_h * params.paper_tooth_coupling;
}

@compute @workgroup_size(8, 8, 1)
fn impasto_raking_light_shade(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let ix = i32(gid.x);
  let iy = i32(gid.y);
  let idx = gid.y * params.width + gid.x;

  // 3x3 Sobel 높이장 샘플링
  let h_tl = effective_height_at(ix - 1, iy - 1);
  let h_t  = effective_height_at(ix,     iy - 1);
  let h_tr = effective_height_at(ix + 1, iy - 1);
  let h_l  = effective_height_at(ix - 1, iy);
  let h_c  = effective_height_at(ix,     iy);
  let h_r  = effective_height_at(ix + 1, iy);
  let h_bl = effective_height_at(ix - 1, iy + 1);
  let h_b  = effective_height_at(ix,     iy + 1);
  let h_br = effective_height_at(ix + 1, iy + 1);

  let gx = (-h_tl - 2.0 * h_l - h_bl) + (h_tr + 2.0 * h_r + h_br);
  let gy = (-h_tl - 2.0 * h_t - h_tr) + (h_bl + 2.0 * h_b + h_br);

  let raw_nx = -gx * params.height_scale * 0.25;
  let raw_ny = -gy * params.height_scale * 0.25;
  let n_len = sqrt(raw_nx * raw_nx + raw_ny * raw_ny + 1.0);
  let nx = raw_nx / n_len;
  let ny = raw_ny / n_len;
  let nz = 1.0 / n_len;

  // 미세 골(Crevice) 라플라시안 음영
  let avg_nbr = (h_tl + h_t + h_tr + h_l + h_r + h_bl + h_b + h_br) * 0.125;
  let concavity = max(0.0, avg_nbr - h_c);
  let crevice_ao = clamp(
    1.0 - concavity * params.crevice_ao_strength * params.height_scale * 1.4,
    0.28,
    1.0,
  );

  // 30도 측면 자연광 벡터 L 및 Half-Vector H (시선 V = (0, 0, 1))
  let cos_el = cos(params.light_elevation_rad);
  let sin_el = sin(params.light_elevation_rad);
  let lx_raw = cos(params.light_azimuth_rad) * cos_el;
  let ly_raw = sin(params.light_azimuth_rad) * cos_el;
  let lz_raw = sin_el;
  let l_len = max(1e-6, sqrt(lx_raw * lx_raw + ly_raw * ly_raw + lz_raw * lz_raw));
  let lx = lx_raw / l_len;
  let ly = ly_raw / l_len;
  let lz = lz_raw / l_len;

  let hx_raw = lx;
  let hy_raw = ly;
  let hz_raw = lz + 1.0;
  let h_len = max(1e-6, sqrt(hx_raw * hx_raw + hy_raw * hy_raw + hz_raw * hz_raw));
  let hx = hx_raw / h_len;
  let hy = hy_raw / h_len;
  let hz = hz_raw / h_len;

  // GGX 미세면 스펙큘러 + Schlick 프레넬 + Smith-GGX 기하 감쇠
  let props = height_props_in[idx];
  let roughness = clamp(props.z, 0.08, 0.98);
  let wetness = clamp(props.w, 0.0, 1.0);
  let eff_rough = clamp(roughness * (1.0 - wetness * params.wet_sheen_boost), 0.08, 0.98);
  let alpha = eff_rough * eff_rough;
  let a2 = alpha * alpha;

  let ndotl = max(0.0, nx * lx + ny * ly + nz * lz);
  let ndotv = max(0.001, nz);
  let ndoth = max(0.0, nx * hx + ny * hy + nz * hz);
  let vdoth = max(0.0, hz);

  let denom = ndoth * ndoth * (a2 - 1.0) + 1.0;
  let ggx_d = a2 / (3.14159265 * denom * denom + 1e-6);

  let k_base = eff_rough + 1.0;
  let k_smith = (k_base * k_base) * 0.125;
  let g_v = ndotv / (ndotv * (1.0 - k_smith) + k_smith);
  let g_l = ndotl / (ndotl * (1.0 - k_smith) + k_smith);
  let ggx_g = g_v * g_l;

  let om = 1.0 - vdoth;
  let om2 = om * om;
  let fresnel = params.f0_dielectric + (1.0 - params.f0_dielectric) * (om2 * om2 * om);

  let spec_brdf = (ggx_d * ggx_g * fresnel) / (4.0 * ndotv * max(ndotl, 0.001) + 1e-5);
  let spec = spec_brdf * ndotl * params.specular_strength * crevice_ao;

  // 자연광 색온도 틴트 적용 및 최종 합성
  let tint_r = 1.0 + params.light_warmth;
  let tint_g = 1.0 + params.light_warmth * 0.25;
  let tint_b = 1.0 - params.light_warmth;

  let base = base_color_in[idx];
  let amb = params.ambient_strength * crevice_ao;
  let diff = params.diffuse_strength * ndotl * crevice_ao;

  let lit_r = clamp((base.x * (amb + diff * tint_r) + spec * tint_r) * params.exposure, 0.0, 1.0);
  let lit_g = clamp((base.y * (amb + diff * tint_g) + spec * tint_g) * params.exposure, 0.0, 1.0);
  let lit_b = clamp((base.z * (amb + diff * tint_b) + spec * tint_b) * params.exposure, 0.0, 1.0);

  lit_rgba_out[idx] = vec4<f32>(lit_r, lit_g, lit_b, base.w);
  normal_ao_out[idx] = vec4<f32>(nx, ny, nz, crevice_ao);
}
`;

/**
 * `STUDIO_IMPASTO_RAKING_LIGHT_WGSL`의 1:1 `Math.fround` CPU 등가 구현.
 * WGSL과 연산 순서·`f32` 반올림을 맞춰 1e-5 이내 수치 일치를 유지한다.
 */
export function shadeImpastoRakingLightCpu(input: ImpastoCpuShadeInput): ImpastoCpuShadeOutput {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const p = normalizeImpastoRakingLightParams(input.params);
  const count = width * height;
  const litRgbaOut = new Float32Array(count * 4);
  const normalAoOut = new Float32Array(count * 4);

  const pAz = f32(p.lightAzimuthRad);
  const pEl = f32(p.lightElevationRad);
  const pHeightScale = f32(p.heightScale);
  const pAmbient = f32(p.ambientStrength);
  const pDiffuse = f32(p.diffuseStrength);
  const pSpec = f32(p.specularStrength);
  const pCrevice = f32(p.creviceAoStrength);
  const pF0 = f32(p.f0Dielectric);
  const pDryInherit = f32(p.dryReliefInheritance);
  const pPaperCouple = f32(p.paperToothCoupling);
  const pWarmth = f32(p.lightWarmth);
  const pExposure = f32(p.exposure);
  const pWetSheen = f32(p.wetSheenBoost);

  const cosEl = f32(Math.cos(pEl));
  const sinEl = f32(Math.sin(pEl));
  const lxRaw = f32(f32(Math.cos(pAz)) * cosEl);
  const lyRaw = f32(f32(Math.sin(pAz)) * cosEl);
  const lzRaw = sinEl;
  const lLen = Math.max(f32(1e-6), f32(Math.sqrt(f32(f32(lxRaw * lxRaw) + f32(lyRaw * lyRaw) + f32(lzRaw * lzRaw)))));
  const lx = f32(lxRaw / lLen);
  const ly = f32(lyRaw / lLen);
  const lz = f32(lzRaw / lLen);

  const hxRaw = lx;
  const hyRaw = ly;
  const hzRaw = f32(lz + f32(1));
  const hLen = Math.max(f32(1e-6), f32(Math.sqrt(f32(f32(hxRaw * hxRaw) + f32(hyRaw * hyRaw) + f32(hzRaw * hzRaw)))));
  const hx = f32(hxRaw / hLen);
  const hy = f32(hyRaw / hLen);
  const hz = f32(hzRaw / hLen);

  const tintR = f32(f32(1) + pWarmth);
  const tintG = f32(f32(1) + f32(pWarmth * f32(0.25)));
  const tintB = f32(f32(1) - pWarmth);

  const effectiveHeightAt = (ix: number, iy: number): number => {
    const x = ix < 0 ? 0 : ix >= width ? width - 1 : ix;
    const y = iy < 0 ? 0 : iy >= height ? height - 1 : iy;
    const idx = y * width + x;
    const off4 = idx * 4;
    const paintH = f32(input.heightPropsIn[off4] ?? 0);
    const dryUnderH = f32(input.heightPropsIn[off4 + 1] ?? 0);
    const paperH = f32(input.paperHeightIn[idx] ?? 0);
    const clampedPaint = f32Clamp(paintH, 0, 1);
    const inherited = f32(f32(dryUnderH * pDryInherit) * f32(f32(1) - f32(f32(0.35) * clampedPaint)));
    return f32(f32(paintH + inherited) + f32(paperH * pPaperCouple));
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off4 = idx * 4;

      const hTl = effectiveHeightAt(x - 1, y - 1);
      const hT = effectiveHeightAt(x, y - 1);
      const hTr = effectiveHeightAt(x + 1, y - 1);
      const hL = effectiveHeightAt(x - 1, y);
      const hC = effectiveHeightAt(x, y);
      const hR = effectiveHeightAt(x + 1, y);
      const hBl = effectiveHeightAt(x - 1, y + 1);
      const hB = effectiveHeightAt(x, y + 1);
      const hBr = effectiveHeightAt(x + 1, y + 1);

      const gx = f32(f32(f32(-hTl - f32(f32(2) * hL)) - hBl) + f32(f32(hTr + f32(f32(2) * hR)) + hBr));
      const gy = f32(f32(f32(-hTl - f32(f32(2) * hT)) - hTr) + f32(f32(hBl + f32(f32(2) * hB)) + hBr));

      const rawNx = f32(f32(-gx * pHeightScale) * f32(0.25));
      const rawNy = f32(f32(-gy * pHeightScale) * f32(0.25));
      const nLen = f32(Math.sqrt(f32(f32(f32(rawNx * rawNx) + f32(rawNy * rawNy)) + f32(1))));
      const nx = f32(rawNx / nLen);
      const ny = f32(rawNy / nLen);
      const nz = f32(f32(1) / nLen);

      const sumNbr = f32(
        f32(f32(f32(hTl + hT) + f32(hTr + hL)) + f32(f32(hR + hBl) + f32(hB + hBr))),
      );
      const avgNbr = f32(sumNbr * f32(0.125));
      const concavity = Math.max(f32(0), f32(avgNbr - hC));
      const creviceAo = f32Clamp(
        f32(f32(1) - f32(f32(f32(concavity * pCrevice) * pHeightScale) * f32(1.4))),
        0.28,
        1.0,
      );

      const roughness = f32Clamp(input.heightPropsIn[off4 + 2] ?? 0.5, 0.08, 0.98);
      const wetness = f32Clamp(input.heightPropsIn[off4 + 3] ?? 0, 0.0, 1.0);
      const effRough = f32Clamp(f32(roughness * f32(f32(1) - f32(wetness * pWetSheen))), 0.08, 0.98);
      const alpha = f32(effRough * effRough);
      const a2 = f32(alpha * alpha);

      const ndotl = Math.max(f32(0), f32(f32(f32(nx * lx) + f32(ny * ly)) + f32(nz * lz)));
      const ndotv = Math.max(f32(0.001), nz);
      const ndoth = Math.max(f32(0), f32(f32(f32(nx * hx) + f32(ny * hy)) + f32(nz * hz)));
      const vdoth = Math.max(f32(0), hz);

      const denom = f32(f32(f32(ndoth * ndoth) * f32(a2 - f32(1))) + f32(1));
      const ggxD = f32(a2 / f32(f32(f32(3.14159265) * f32(denom * denom)) + f32(1e-6)));

      const kBase = f32(effRough + f32(1));
      const kSmith = f32(f32(kBase * kBase) * f32(0.125));
      const gV = f32(ndotv / f32(f32(ndotv * f32(f32(1) - kSmith)) + kSmith));
      const gL = f32(ndotl / f32(f32(ndotl * f32(f32(1) - kSmith)) + kSmith));
      const ggxG = f32(gV * gL);

      const om = f32(f32(1) - vdoth);
      const om2 = f32(om * om);
      const fresnel = f32(pF0 + f32(f32(f32(1) - pF0) * f32(f32(om2 * om2) * om)));

      const specBrdf = f32(
        f32(f32(ggxD * ggxG) * fresnel) /
          f32(f32(f32(f32(4) * ndotv) * Math.max(ndotl, f32(0.001))) + f32(1e-5)),
      );
      const spec = f32(f32(f32(specBrdf * ndotl) * pSpec) * creviceAo);

      const baseR = f32(input.baseColorIn[off4] ?? 0);
      const baseG = f32(input.baseColorIn[off4 + 1] ?? 0);
      const baseB = f32(input.baseColorIn[off4 + 2] ?? 0);
      const baseA = f32(input.baseColorIn[off4 + 3] ?? 1);

      const amb = f32(pAmbient * creviceAo);
      const diff = f32(f32(pDiffuse * ndotl) * creviceAo);

      litRgbaOut[off4] = f32Clamp(f32(f32(f32(baseR * f32(amb + f32(diff * tintR))) + f32(spec * tintR)) * pExposure), 0, 1);
      litRgbaOut[off4 + 1] = f32Clamp(f32(f32(f32(baseG * f32(amb + f32(diff * tintG))) + f32(spec * tintG)) * pExposure), 0, 1);
      litRgbaOut[off4 + 2] = f32Clamp(f32(f32(f32(baseB * f32(amb + f32(diff * tintB))) + f32(spec * tintB)) * pExposure), 0, 1);
      litRgbaOut[off4 + 3] = baseA;

      normalAoOut[off4] = nx;
      normalAoOut[off4 + 1] = ny;
      normalAoOut[off4 + 2] = nz;
      normalAoOut[off4 + 3] = creviceAo;
    }
  }

  return { width, height, litRgbaOut, normalAoOut };
}

/**
 * 건·습 하이브리드 ①: 습윤층 위 건식 긁힘(Sgraffito Height Carving).
 * 선분 스트로크 중심의 젖은 물감을 깎아 밑칠을 드러내고, 파낸 물감을 좌우 가장자리 둑(berm)에 쌓아 올린다.
 */
export function applySgraffitoHeightCarving(input: SgraffitoCarveInput): SgraffitoCarveDiagnostics {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const radius = Math.max(0.75, input.radius);
  const strength = clamp(input.carveStrength, 0, 1);
  const ridgePush = clamp(input.ridgePush ?? DEFAULT_IMPASTO_RAKING_LIGHT_PARAMS.sgraffitoRidgePush, 0, 1);
  const dryResist = clamp(input.dryResistance ?? 0.85, 0, 1);

  const dx = input.endX - input.startX;
  const dy = input.endY - input.startY;
  const segLenSq = dx * dx + dy * dy;
  const outerRadius = radius * 1.85;

  const minX = Math.max(0, Math.floor(Math.min(input.startX, input.endX) - outerRadius - 1));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(input.startX, input.endX) + outerRadius + 1));
  const minY = Math.max(0, Math.floor(Math.min(input.startY, input.endY) - outerRadius - 1));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(input.startY, input.endY) + outerRadius + 1));

  let carvedVolume = 0;
  let pushedRidgeVolume = 0;
  let exposedUnderlayerPixels = 0;
  let maxCarveDepth = 0;

  // 1패스: 선분 중심 깎아내기 + 2패스용 좌우 둑 가중 누적
  const ridgeWeights = new Float32Array((maxX - minX + 1) * (maxY - minY + 1));
  const roiWidth = maxX - minX + 1;
  let totalRidgeWeight = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t =
        segLenSq > 1e-6
          ? clamp(((px - input.startX) * dx + (py - input.startY) * dy) / segLenSq, 0, 1)
          : 0;
      const projX = input.startX + dx * t;
      const projY = input.startY + dy * t;
      const dist = Math.hypot(px - projX, py - projY);
      const off4 = (y * width + x) * 4;
      const paintH = input.heightProps[off4] ?? 0;
      const wetness = clamp(input.heightProps[off4 + 3] ?? 0, 0, 1);

      if (dist <= radius) {
        const u = dist / radius;
        // 나이프/스틱 날 프로파일: 중심 35%는 평평하게 깊게 긁고 바깥쪽은 매끄럽게 감쇠
        const edgeU = u <= 0.35 ? 0 : (u - 0.35) / 0.65;
        const profile = (1 - edgeU * edgeU) * (1 - edgeU * edgeU);
        // 젖은 층일수록 쉽게 파이고, 마른 층은 dryResist 만큼 저항
        const malleability = wetness + (1 - wetness) * (1 - dryResist);
        const carve = Math.min(paintH, paintH * Math.min(1, strength * 1.12) * profile * malleability);
        if (carve > 0) {
          const nextH = Math.max(0, paintH - carve);
          input.heightProps[off4] = nextH;
          // 깎여 드러난 홈은 종이/밑칠 노출로 거칠기가 소폭 상승
          const curRough = input.heightProps[off4 + 2] ?? 0.5;
          input.heightProps[off4 + 2] = clamp(curRough + carve * 0.25, 0.08, 0.98);
          carvedVolume += carve;
          if (carve > maxCarveDepth) maxCarveDepth = carve;
          if (nextH < 0.08 && paintH >= 0.08) exposedUnderlayerPixels += 1;
        }
      } else if (dist <= outerRadius) {
        const ringT = (dist - radius) / (outerRadius - radius);
        // 둑은 반경 직후(ringT ~ 0.35)에서 가장 높게 솟는다
        const berm = Math.sin(ringT * Math.PI);
        const w = berm * berm * (0.35 + 0.65 * wetness);
        ridgeWeights[(y - minY) * roiWidth + (x - minX)] = w;
        totalRidgeWeight += w;
      }
    }
  }

  // 2패스: 파낸 물감의 `ridgePush` 비율을 좌우 가장자리 둑으로 분배
  if (carvedVolume > 0 && ridgePush > 0 && totalRidgeWeight > 1e-6) {
    const pushTotal = carvedVolume * ridgePush;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const w = ridgeWeights[(y - minY) * roiWidth + (x - minX)] ?? 0;
        if (w <= 0) continue;
        const off4 = (y * width + x) * 4;
        const add = (pushTotal * w) / totalRidgeWeight;
        const curH = input.heightProps[off4] ?? 0;
        const nextH = Math.min(2.0, curH + add);
        pushedRidgeVolume += nextH - curH;
        input.heightProps[off4] = nextH;
      }
    }
  }

  return {
    carvedVolume,
    pushedRidgeVolume,
    exposedUnderlayerPixels,
    maxCarveDepth,
  };
}

/**
 * 건·습 하이브리드 ②: 마른 밑칠 높이장 위 덧칠 Relief 계승 계산.
 * 묽은 글레이즈일수록 마른 밑칠의 요철을 그대로 계승하고,
 * 되직한 임파스토일수록 밑칠 골짜기를 메우며 새 붓자국 높이장을 형성한다.
 */
export function computeOverpaintReliefInheritance(
  input: OverpaintReliefInput,
): OverpaintReliefResult {
  const dryH = clamp(input.dryUnderHeight, 0, 2);
  const thick = clamp(input.newPaintThickness, 0, 1.5);
  const viscosity = clamp(input.paintViscosity, 0, 1);
  const strokeRelief = clamp(input.brushStrokeRelief, -0.5, 1.5);
  const baseInherit = clamp(
    input.dryReliefInheritance ?? DEFAULT_IMPASTO_RAKING_LIGHT_PARAMS.dryReliefInheritance,
    0,
    1,
  );

  // 되직하고 두꺼운 덧칠일수록 마른 밑칠 골짜기를 채워 계승률이 감소
  const fillingFactor = clamp(viscosity * clamp(thick, 0, 1) * 0.72, 0, 0.85);
  const preservedDryRatio = clamp(baseInherit * (1 - fillingFactor), 0.05, 1);
  const inheritedUnderRelief = dryH * preservedDryRatio;
  const newPaintContribution = Math.max(0, thick * (0.45 + 0.55 * viscosity) + strokeRelief * 0.25 * viscosity);
  const effectiveTotalHeight = inheritedUnderRelief + newPaintContribution;
  // 묽은 글레이즈(낮은 점도)는 광택이 증가(거칠기 감소), 되직한 임파스토는 미세면 증가
  const combinedRoughnessDelta = (viscosity - 0.4) * thick * 0.22;

  return {
    effectiveTotalHeight,
    inheritedUnderRelief,
    preservedDryRatio,
    combinedRoughnessDelta,
  };
}
