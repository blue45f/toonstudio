/**
 * WebGPU WGSL Compute 7밴드 분광 Kubelka-Munk 고속 브러시·타일 비닝·안료 필터 셰이더 모듈.
 *
 * - 지연 로드 전용(`studio-webgpu-km-wgsl.ts` 및 필터 갤러리 지연 청크에서만 참조).
 * - 7개 분광 밴드를 `vec4<f32>` 2개(`lo: 0..3`, `hi: 4..6 + w: luminance`)로 패킹해
 *   루프 없는 SIMD 연산으로 실행한다.
 * - 타일 브러시 Compute 커널은 `studio-webgpu-dab-tile-binning-compute.ts`의 CSR 버퍼
 *   (`tile_offsets`, `dab_indices`)와 호환되며 `@workgroup_size(8, 8, 1)` + `var<workgroup>`
 *   공유 메모리로 배치 로딩(`workgroupBarrier()`)을 수행한다.
 * - 필터 Compute 커널은 4종 분광 안료 필터(감산 그라데이션 맵 · 색온도 시프트 · 전통 글레이징 ·
 *   색조화 하모나이저)를 단일 16바이트 정렬 유니폼 계약(`96 bytes`)으로 실행한다.
 */

import {
  KM7_BASIS_B,
  KM7_BASIS_G,
  KM7_BASIS_R,
  KM7_DEFAULT_CONCENTRATION_GAMMA,
  KM7_RECONSTRUCT_B,
  KM7_RECONSTRUCT_G,
  KM7_RECONSTRUCT_R,
  KM7_REFLECTANCE_FLOOR,
} from "./studio-webgpu-km7-spectral-core";

export const STUDIO_WEBGPU_KM7_WORKGROUP_SIZE = 8 as const;
export const STUDIO_WEBGPU_KM7_TILE_SHARED_DABS = 64 as const;
export const STUDIO_WEBGPU_KM7_FILTER_UNIFORM_FLOATS = 24 as const;
export const STUDIO_WEBGPU_KM7_FILTER_UNIFORM_BYTES =
  STUDIO_WEBGPU_KM7_FILTER_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;

export const KM7_FILTER_OP_GRADIENT_MAP = 1 as const;
export const KM7_FILTER_OP_TEMP_SHIFT = 2 as const;
export const KM7_FILTER_OP_GLAZING = 3 as const;
export const KM7_FILTER_OP_HARMONIZER = 4 as const;

export type Km7FilterComputeOp =
  | typeof KM7_FILTER_OP_GRADIENT_MAP
  | typeof KM7_FILTER_OP_TEMP_SHIFT
  | typeof KM7_FILTER_OP_GLAZING
  | typeof KM7_FILTER_OP_HARMONIZER;

function fmtF32(value: number): string {
  const s = Number.isFinite(value) ? value.toFixed(6) : "0.000000";
  return s.includes(".") ? s : `${s}.0`;
}

function wgslVec4Lo(arr: readonly [number, number, number, number, number, number, number]): string {
  return `vec4<f32>(${fmtF32(arr[0])}, ${fmtF32(arr[1])}, ${fmtF32(arr[2])}, ${fmtF32(arr[3])})`;
}

function wgslVec3Hi(arr: readonly [number, number, number, number, number, number, number]): string {
  return `vec3<f32>(${fmtF32(arr[4])}, ${fmtF32(arr[5])}, ${fmtF32(arr[6])})`;
}

/**
 * 재사용 가능한 7밴드 분광 KM + Oklab 채도 보존 + 광학 글레이징 + 임파스토 음영 WGSL 라이브러리.
 * CPU 코어(`studio-webgpu-km7-spectral-core.ts`)에서 기저·복원 상수를 직접 주입한다.
 */
export const STUDIO_WEBGPU_KM7_SPECTRAL_WGSL_SNIPPET: string = /* wgsl */ `
const KM7_R_FLOOR: f32 = ${fmtF32(KM7_REFLECTANCE_FLOOR)};
const KM7_DEFAULT_GAMMA: f32 = ${fmtF32(KM7_DEFAULT_CONCENTRATION_GAMMA)};

const KM7_BR_LO: vec4<f32> = ${wgslVec4Lo(KM7_BASIS_R)};
const KM7_BR_HI: vec3<f32> = ${wgslVec3Hi(KM7_BASIS_R)};
const KM7_BG_LO: vec4<f32> = ${wgslVec4Lo(KM7_BASIS_G)};
const KM7_BG_HI: vec3<f32> = ${wgslVec3Hi(KM7_BASIS_G)};
const KM7_BB_LO: vec4<f32> = ${wgslVec4Lo(KM7_BASIS_B)};
const KM7_BB_HI: vec3<f32> = ${wgslVec3Hi(KM7_BASIS_B)};

const KM7_MR_LO: vec4<f32> = ${wgslVec4Lo(KM7_RECONSTRUCT_R)};
const KM7_MR_HI: vec3<f32> = ${wgslVec3Hi(KM7_RECONSTRUCT_R)};
const KM7_MG_LO: vec4<f32> = ${wgslVec4Lo(KM7_RECONSTRUCT_G)};
const KM7_MG_HI: vec3<f32> = ${wgslVec3Hi(KM7_RECONSTRUCT_G)};
const KM7_MB_LO: vec4<f32> = ${wgslVec4Lo(KM7_RECONSTRUCT_B)};
const KM7_MB_HI: vec3<f32> = ${wgslVec3Hi(KM7_RECONSTRUCT_B)};

struct Km7Spec {
  lo: vec4<f32>,
  hi: vec4<f32>,
}

fn km7_srgb_to_lin_ch(c: f32) -> f32 {
  let x = clamp(c, 0.0, 1.0);
  return select(pow((x + 0.055) / 1.055, 2.4), x / 12.92, x <= 0.04045);
}

fn km7_lin_to_srgb_ch(c: f32) -> f32 {
  let x = clamp(c, 0.0, 1.0);
  return select(1.055 * pow(x, 1.0 / 2.4) - 0.055, x * 12.92, x <= 0.0031308);
}

fn km7_srgb_to_lin(col: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    km7_srgb_to_lin_ch(col.r),
    km7_srgb_to_lin_ch(col.g),
    km7_srgb_to_lin_ch(col.b),
  );
}

fn km7_lin_to_srgb(col: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    km7_lin_to_srgb_ch(col.r),
    km7_lin_to_srgb_ch(col.g),
    km7_lin_to_srgb_ch(col.b),
  );
}

fn km7_cbrt_pos(x: f32) -> f32 {
  return select(0.0, pow(max(x, 0.0), 1.0 / 3.0), x > 0.0);
}

fn km7_lin_to_oklab(rgb: vec3<f32>) -> vec3<f32> {
  let l = km7_cbrt_pos(0.41222147 * rgb.r + 0.53633254 * rgb.g + 0.05144599 * rgb.b);
  let m = km7_cbrt_pos(0.21190350 * rgb.r + 0.68069955 * rgb.g + 0.10739696 * rgb.b);
  let s = km7_cbrt_pos(0.08830246 * rgb.r + 0.28171884 * rgb.g + 0.62997870 * rgb.b);
  return vec3<f32>(
    0.21045426 * l + 0.79361779 * m - 0.00407205 * s,
    1.97799850 * l - 2.42859220 * m + 0.45059371 * s,
    0.02590404 * l + 0.78277177 * m - 0.80867577 * s,
  );
}

fn km7_oklab_to_lin(lab: vec3<f32>) -> vec3<f32> {
  let l_r = lab.x + 0.39633778 * lab.y + 0.21580376 * lab.z;
  let m_r = lab.x - 0.10556135 * lab.y - 0.06385417 * lab.z;
  let s_r = lab.x - 0.08948418 * lab.y - 1.29148550 * lab.z;
  let l = l_r * l_r * l_r;
  let m = m_r * m_r * m_r;
  let s = s_r * s_r * s_r;
  return clamp(
    vec3<f32>(
      4.07674170 * l - 3.30771160 * m + 0.23096993 * s,
      -1.26843800 * l + 2.60975740 * m - 0.34131940 * s,
      -0.00419609 * l - 0.70341860 * m + 1.70761470 * s,
    ),
    vec3<f32>(0.0),
    vec3<f32>(1.0),
  );
}

fn km7_lin_to_spec(lin: vec3<f32>) -> Km7Spec {
  let lo = clamp(
    lin.r * KM7_BR_LO + lin.g * KM7_BG_LO + lin.b * KM7_BB_LO,
    vec4<f32>(KM7_R_FLOOR),
    vec4<f32>(1.0),
  );
  let hi3 = clamp(
    lin.r * KM7_BR_HI + lin.g * KM7_BG_HI + lin.b * KM7_BB_HI,
    vec3<f32>(KM7_R_FLOOR),
    vec3<f32>(1.0),
  );
  let lum = max(KM7_R_FLOOR, 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b);
  return Km7Spec(lo, vec4<f32>(hi3, lum));
}

fn km7_spec_to_lin(spec: Km7Spec) -> vec3<f32> {
  let r = dot(KM7_MR_LO, spec.lo) + dot(KM7_MR_HI, spec.hi.xyz);
  let g = dot(KM7_MG_LO, spec.lo) + dot(KM7_MG_HI, spec.hi.xyz);
  let b = dot(KM7_MB_LO, spec.lo) + dot(KM7_MB_HI, spec.hi.xyz);
  return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

// K/S = (1 - R)^2 / (2R), R = 1 / (1 + q + sqrt(q^2 + 2q)) === 1 + q - sqrt(q^2 + 2q)
fn km7_ks_vec4(r: vec4<f32>) -> vec4<f32> {
  let c = clamp(r, vec4<f32>(KM7_R_FLOOR), vec4<f32>(1.0));
  let d = vec4<f32>(1.0) - c;
  return (d * d) / (2.0 * c);
}

fn km7_ks_vec3(r: vec3<f32>) -> vec3<f32> {
  let c = clamp(r, vec3<f32>(KM7_R_FLOOR), vec3<f32>(1.0));
  let d = vec3<f32>(1.0) - c;
  return (d * d) / (2.0 * c);
}

fn km7_refl_vec4(ks: vec4<f32>) -> vec4<f32> {
  let q = max(ks, vec4<f32>(0.0));
  return vec4<f32>(1.0) / (vec4<f32>(1.0) + q + sqrt(q * q + 2.0 * q));
}

fn km7_refl_vec3(ks: vec3<f32>) -> vec3<f32> {
  let q = max(ks, vec3<f32>(0.0));
  return vec3<f32>(1.0) / (vec3<f32>(1.0) + q + sqrt(q * q + 2.0 * q));
}

fn km7_oklab_chroma_preserve(
  lin_a: vec3<f32>,
  lin_b: vec3<f32>,
  mixed_lin: vec3<f32>,
  t: f32,
  preserve: f32,
) -> vec3<f32> {
  if (preserve <= 0.0) {
    return mixed_lin;
  }
  let ok_a = km7_lin_to_oklab(lin_a);
  let ok_b = km7_lin_to_oklab(lin_b);
  let ok_m = km7_lin_to_oklab(mixed_lin);
  let c_a = length(ok_a.yz);
  let c_b = length(ok_b.yz);
  let c_m = length(ok_m.yz);
  let target_c = min(c_a, c_b) * 0.85 + max(c_a, c_b) * 0.15;
  if (c_m <= 0.015 || target_c <= c_m) {
    return mixed_lin;
  }
  let bell = 4.0 * t * (1.0 - t);
  let boost = 1.0 + preserve * bell * min(0.65, (target_c - c_m) / c_m);
  return km7_oklab_to_lin(vec3<f32>(ok_m.x, ok_m.y * boost, ok_m.z * boost));
}

fn km7_mix_srgb(
  col_a: vec3<f32>,
  col_b: vec3<f32>,
  t: f32,
  chroma_preserve: f32,
) -> vec3<f32> {
  let mt = clamp(t, 0.0, 1.0);
  if (mt <= 0.0) {
    return clamp(col_a, vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (mt >= 1.0) {
    return clamp(col_b, vec3<f32>(0.0), vec3<f32>(1.0));
  }
  let la = km7_srgb_to_lin(col_a);
  let lb = km7_srgb_to_lin(col_b);
  let sa = km7_lin_to_spec(la);
  let sb = km7_lin_to_spec(lb);
  let ca = pow(1.0 - mt, KM7_DEFAULT_GAMMA) * sa.hi.w;
  let cb = pow(mt, KM7_DEFAULT_GAMMA) * sb.hi.w;
  let inv_tot = 1.0 / max(0.0000001, ca + cb);
  let ks_lo = (km7_ks_vec4(sa.lo) * ca + km7_ks_vec4(sb.lo) * cb) * inv_tot;
  let ks_hi = (km7_ks_vec3(sa.hi.xyz) * ca + km7_ks_vec3(sb.hi.xyz) * cb) * inv_tot;
  let out_spec = Km7Spec(
    km7_refl_vec4(ks_lo),
    vec4<f32>(km7_refl_vec3(ks_hi), (sa.hi.w * ca + sb.hi.w * cb) * inv_tot),
  );
  let raw_lin = km7_spec_to_lin(out_spec);
  let preserved_lin = km7_oklab_chroma_preserve(la, lb, raw_lin, mt, clamp(chroma_preserve, 0.0, 1.0));
  return km7_lin_to_srgb(preserved_lin);
}

fn km7_glaze_srgb(
  base_srgb: vec3<f32>,
  glaze_srgb: vec3<f32>,
  opacity: f32,
  layers: f32,
  scatter: f32,
  paper_preserve: f32,
) -> vec3<f32> {
  let op = clamp(opacity, 0.0, 1.0);
  if (op <= 0.0) {
    return clamp(base_srgb, vec3<f32>(0.0), vec3<f32>(1.0));
  }
  let l_cnt = clamp(layers, 1.0, 8.0);
  let sc = clamp(scatter, 0.0, 1.0);
  let pp = clamp(paper_preserve, 0.0, 1.0);
  let lb = km7_srgb_to_lin(base_srgb);
  let lg = km7_srgb_to_lin(glaze_srgb);
  let sb = km7_lin_to_spec(lb);
  let sg = km7_lin_to_spec(lg);
  let shield = 1.0 - pp * sb.hi.w * sb.hi.w * 0.65;
  let eff_alpha = (1.0 - pow(1.0 - op, l_cnt)) * shield;
  let depth = eff_alpha * 1.45;
  let abs_lo = (vec4<f32>(1.0) - sg.lo) + 0.42 * log(vec4<f32>(1.0) / max(sg.lo, vec4<f32>(KM7_R_FLOOR)));
  let abs_hi = (vec3<f32>(1.0) - sg.hi.xyz) + 0.42 * log(vec3<f32>(1.0) / max(sg.hi.xyz, vec3<f32>(KM7_R_FLOOR)));
  let tr_lo = exp(-abs_lo * depth);
  let tr_hi = exp(-abs_hi * depth);
  let out_lo = clamp(sb.lo * tr_lo + sg.lo * (vec4<f32>(1.0) - tr_lo) * sc, vec4<f32>(KM7_R_FLOOR), vec4<f32>(1.0));
  let out_hi = clamp(sb.hi.xyz * tr_hi + sg.hi.xyz * (vec3<f32>(1.0) - tr_hi) * sc, vec3<f32>(KM7_R_FLOOR), vec3<f32>(1.0));
  return km7_lin_to_srgb(km7_spec_to_lin(Km7Spec(out_lo, vec4<f32>(out_hi, sb.hi.w))));
}

fn km7_impasto_shade(
  base_srgb: vec3<f32>,
  grad: vec2<f32>,
  relief: f32,
  gloss: f32,
) -> vec3<f32> {
  let r_str = clamp(relief, 0.0, 1.0);
  if (r_str <= 0.0) {
    return base_srgb;
  }
  let n = normalize(vec3<f32>(-grad.x * r_str * 2.4, -grad.y * r_str * 2.4, 1.0));
  let l_dir = normalize(vec3<f32>(-0.45, -0.55, 0.70));
  let ndl = max(0.0, dot(n, l_dir));
  let diffuse = 0.78 + 0.28 * ndl;
  let h = normalize(l_dir + vec3<f32>(0.0, 0.0, 1.0));
  let spec = pow(max(0.0, dot(n, h)), 24.0 + clamp(gloss, 0.0, 1.0) * 40.0) * clamp(gloss, 0.0, 1.0) * r_str * 0.26;
  let lin = clamp(km7_srgb_to_lin(base_srgb) * diffuse + vec3<f32>(spec), vec3<f32>(0.0), vec3<f32>(1.0));
  return km7_lin_to_srgb(lin);
}
`;

/**
 * 타일 비닝 호환 WebGPU WGSL Compute 7밴드 KM 브러시 합성 셰이더.
 * `studio-webgpu-dab-tile-binning-compute.ts`의 CSR(`tile_offsets`, `dab_indices`)을 읽어
 * 워크그룹 공유 메모리(`var<workgroup>`)로 배치 캐시한 뒤 8×8 픽셀을 병렬 합성한다.
 */
export const STUDIO_WEBGPU_KM7_TILE_BRUSH_COMPUTE_WGSL: string = /* wgsl */ `
${STUDIO_WEBGPU_KM7_SPECTRAL_WGSL_SNIPPET}

struct Km7TileUniforms {
  canvas_size: vec2<u32>,
  tile_grid: vec2<u32>,
  tile_size: u32,
  mode_flags: u32,
  chroma_preserve: f32,
  relief_gloss: f32,
}

struct Km7BinnedDab {
  geom: vec4<f32>,
  pigment: vec4<f32>,
  optics: vec4<f32>,
}

@group(0) @binding(0) var<uniform> u_tile: Km7TileUniforms;
@group(0) @binding(1) var src_canvas: texture_2d<f32>;
@group(0) @binding(2) var dst_canvas: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<storage, read> tile_offsets: array<u32>;
@group(0) @binding(4) var<storage, read> dab_indices: array<u32>;
@group(0) @binding(5) var<storage, read> dabs: array<Km7BinnedDab>;

var<workgroup> shared_dabs: array<Km7BinnedDab, ${STUDIO_WEBGPU_KM7_TILE_SHARED_DABS}>;

@compute @workgroup_size(${STUDIO_WEBGPU_KM7_WORKGROUP_SIZE}, ${STUDIO_WEBGPU_KM7_WORKGROUP_SIZE}, 1)
fn cs_km7_tile_brush(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_index) lidx: u32,
) {
  let tile_col = gid.x / max(1u, u_tile.tile_size);
  let tile_row = gid.y / max(1u, u_tile.tile_size);
  let tile_idx = min(tile_row * u_tile.tile_grid.x + tile_col, max(1u, u_tile.tile_grid.x * u_tile.tile_grid.y) - 1u);
  let start_ref = tile_offsets[tile_idx];
  let end_ref = tile_offsets[tile_idx + 1u];

  let in_bounds = gid.x < u_tile.canvas_size.x && gid.y < u_tile.canvas_size.y;
  var acc = vec4<f32>(0.0);
  if (in_bounds) {
    acc = textureLoad(src_canvas, vec2<i32>(gid.xy), 0);
  }
  let px = vec2<f32>(f32(gid.x) + 0.5, f32(gid.y) + 0.5);

  var batch_base = start_ref;
  loop {
    if (batch_base >= end_ref) {
      break;
    }
    let batch_count = min(${STUDIO_WEBGPU_KM7_TILE_SHARED_DABS}u, end_ref - batch_base);
    if (lidx < batch_count) {
      let dab_id = dab_indices[batch_base + lidx];
      shared_dabs[lidx] = dabs[dab_id];
    }
    workgroupBarrier();

    if (in_bounds) {
      for (var k: u32 = 0u; k < batch_count; k = k + 1u) {
        let dab = shared_dabs[k];
        let radius = max(dab.geom.z, 0.5);
        let delta = px - dab.geom.xy;
        let dist = length(delta);
        if (dist >= radius) {
          continue;
        }
        let norm_r = dist / radius;
        let hardness = clamp(dab.geom.w, 0.0, 0.99);
        let falloff = clamp(1.0 - smoothstep(hardness, 1.0, norm_r), 0.0, 1.0);
        let cov = clamp(falloff * dab.pigment.a, 0.0, 1.0);
        if (cov <= 0.0001) {
          continue;
        }
        let base_srgb = mix(vec3<f32>(1.0), clamp(acc.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), acc.a);
        let wetness = clamp(dab.optics.x, 0.0, 1.0);
        let glaze_mode = dab.optics.y;
        let edge_ring = clamp(dab.optics.z, 0.0, 1.0);
        let relief_amt = clamp(dab.optics.w, 0.0, 1.0);

        var mixed_srgb = km7_mix_srgb(base_srgb, dab.pigment.rgb, cov * (1.0 - wetness * 0.35), u_tile.chroma_preserve);
        if (glaze_mode > 0.5) {
          mixed_srgb = km7_glaze_srgb(base_srgb, dab.pigment.rgb, cov, 1.0, 0.18, 0.15);
        }
        if (edge_ring > 0.01 && norm_r > 0.65) {
          let rim = ((norm_r - 0.65) / 0.35) * edge_ring * 0.45;
          mixed_srgb = km7_glaze_srgb(mixed_srgb, dab.pigment.rgb, rim, 1.0, 0.12, 0.0);
        }
        if (relief_amt > 0.01) {
          let grad = (delta / max(radius, 1.0)) * (1.0 - norm_r);
          mixed_srgb = km7_impasto_shade(mixed_srgb, grad, relief_amt, u_tile.relief_gloss);
        }
        let out_a = cov + acc.a * (1.0 - cov);
        acc = vec4<f32>(mixed_srgb, out_a);
      }
    }
    workgroupBarrier();
    batch_base = batch_base + ${STUDIO_WEBGPU_KM7_TILE_SHARED_DABS}u;
  }

  if (in_bounds) {
    textureStore(dst_canvas, vec2<i32>(gid.xy), clamp(acc, vec4<f32>(0.0), vec4<f32>(1.0)));
  }
}
`;

/**
 * 4종 분광 안료 필터 통합 WebGPU WGSL Compute 셰이더.
 * - op=1: 분광 감산 그라데이션 맵 (shadow → midtone → highlight 7밴드 KM)
 * - op=2: 안료 색온도 시프트 (Warm Cadmium/Ochre ↔ Cool Ultramarine/Cerulean + Tint)
 * - op=3: 전통 화구 글레이징 필터 (Beer-Lambert / KM7 다층 광학 글레이징)
 * - op=4: 안료 색조화 하모나이저 (Mother-Color / Complementary Shadow / Split Warm-Cool)
 */
export const STUDIO_WEBGPU_KM7_FILTER_COMPUTE_WGSL: string = /* wgsl */ `
${STUDIO_WEBGPU_KM7_SPECTRAL_WGSL_SNIPPET}

struct Km7FilterUniforms {
  header: vec4<u32>,
  color0: vec4<f32>,
  color1: vec4<f32>,
  color2: vec4<f32>,
  params0: vec4<f32>,
  params1: vec4<f32>,
}

@group(0) @binding(0) var<uniform> u_filter: Km7FilterUniforms;
@group(0) @binding(1) var src_tex: texture_2d<f32>;
@group(0) @binding(2) var dst_tex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(${STUDIO_WEBGPU_KM7_WORKGROUP_SIZE}, ${STUDIO_WEBGPU_KM7_WORKGROUP_SIZE}, 1)
fn cs_km7_pigment_filter(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u_filter.header.x || gid.y >= u_filter.header.y) {
    return;
  }
  let pixel = textureLoad(src_tex, vec2<i32>(gid.xy), 0);
  if (pixel.a <= 0.0001) {
    textureStore(dst_tex, vec2<i32>(gid.xy), pixel);
    return;
  }
  let src_rgb = clamp(pixel.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  let op = u_filter.header.z;
  let lin = km7_srgb_to_lin(src_rgb);
  let luma = clamp(0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b, 0.0, 1.0);
  var out_rgb = src_rgb;

  if (op == ${KM7_FILTER_OP_GRADIENT_MAP}u) {
    let midpoint = clamp(u_filter.params0.x, 0.1, 0.9);
    let chroma_preserve = clamp(u_filter.params0.y, 0.0, 1.0);
    let mix_amount = clamp(u_filter.params0.z, 0.0, 1.0);
    let use_midtone = u_filter.params0.w > 0.5;
    var mapped = src_rgb;
    if (!use_midtone) {
      let warped = pow(luma, log(0.5) / log(midpoint));
      mapped = km7_mix_srgb(u_filter.color0.rgb, u_filter.color2.rgb, warped, chroma_preserve);
    } else if (luma < midpoint) {
      mapped = km7_mix_srgb(u_filter.color0.rgb, u_filter.color1.rgb, luma / midpoint, chroma_preserve);
    } else {
      mapped = km7_mix_srgb(u_filter.color1.rgb, u_filter.color2.rgb, (luma - midpoint) / max(0.0001, 1.0 - midpoint), chroma_preserve);
    }
    out_rgb = mix(src_rgb, mapped, mix_amount);
  } else if (op == ${KM7_FILTER_OP_TEMP_SHIFT}u) {
    let temp = clamp(u_filter.params0.x, -1.0, 1.0);
    let tint = clamp(u_filter.params0.y, -1.0, 1.0);
    let chroma_preserve = clamp(u_filter.params0.z, 0.0, 1.0);
    let strength = clamp(u_filter.params0.w, 0.0, 1.0);
    let warm_pigment = vec3<f32>(0.97, 0.62, 0.16);
    let cool_pigment = vec3<f32>(0.12, 0.42, 0.88);
    let green_pigment = vec3<f32>(0.14, 0.68, 0.42);
    let rose_pigment = vec3<f32>(0.84, 0.24, 0.56);
    let temp_target = select(cool_pigment, warm_pigment, temp >= 0.0);
    let tint_target = select(green_pigment, rose_pigment, tint >= 0.0);
    let step1 = km7_mix_srgb(src_rgb, temp_target, abs(temp) * 0.52 * strength, chroma_preserve);
    let step2 = km7_mix_srgb(step1, tint_target, abs(tint) * 0.36 * strength, chroma_preserve);
    let ok_src = km7_lin_to_oklab(lin);
    let ok_dst = km7_lin_to_oklab(km7_srgb_to_lin(step2));
    let l_restored = mix(ok_dst.x, ok_src.x, clamp(u_filter.params1.x, 0.0, 1.0));
    out_rgb = km7_lin_to_srgb(km7_oklab_to_lin(vec3<f32>(l_restored, ok_dst.y, ok_dst.z)));
  } else if (op == ${KM7_FILTER_OP_GLAZING}u) {
    let opacity = clamp(u_filter.params0.x, 0.0, 1.0);
    let layers = clamp(u_filter.params0.y, 1.0, 8.0);
    let scatter = clamp(u_filter.params0.z, 0.0, 1.0);
    let paper_preserve = clamp(u_filter.params0.w, 0.0, 1.0);
    out_rgb = km7_glaze_srgb(src_rgb, u_filter.color0.rgb, opacity, layers, scatter, paper_preserve);
  } else if (op == ${KM7_FILTER_OP_HARMONIZER}u) {
    let mode = u_filter.header.w;
    let strength = clamp(u_filter.params0.x, 0.0, 1.0);
    let chroma_preserve = clamp(u_filter.params0.y, 0.0, 1.0);
    let mother = u_filter.color0.rgb;
    let comp = vec3<f32>(1.0) - mother;
    var harmony_color = mother;
    var weight = strength * 0.55;
    if (mode == 1u) {
      let shadow_w = clamp(1.0 - luma, 0.0, 1.0);
      harmony_color = km7_mix_srgb(mother, comp, shadow_w, chroma_preserve);
      weight = strength * (0.25 + 0.45 * shadow_w);
    } else if (mode == 2u) {
      let warm_hi = km7_mix_srgb(mother, vec3<f32>(0.98, 0.78, 0.34), 0.45, chroma_preserve);
      let cool_sh = km7_mix_srgb(comp, vec3<f32>(0.16, 0.34, 0.72), 0.45, chroma_preserve);
      harmony_color = km7_mix_srgb(cool_sh, warm_hi, luma, chroma_preserve);
      weight = strength * 0.5;
    }
    out_rgb = km7_mix_srgb(src_rgb, harmony_color, weight, chroma_preserve);
  }

  textureStore(dst_tex, vec2<i32>(gid.xy), vec4<f32>(clamp(out_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), pixel.a));
}
`;

export interface Km7FilterComputeUniformInput {
  readonly width: number;
  readonly height: number;
  readonly op: Km7FilterComputeOp;
  readonly flags?: number;
  readonly color0?: readonly [number, number, number];
  readonly color1?: readonly [number, number, number];
  readonly color2?: readonly [number, number, number];
  readonly params0?: readonly [number, number, number, number];
  readonly params1?: readonly [number, number, number, number];
}

/** 16바이트 정렬된 96바이트 `Km7FilterUniforms` 버퍼를 제로-객체할당 친화적 ArrayBuffer로 패킹한다. */
export function packKm7FilterComputeUniforms(input: Km7FilterComputeUniformInput): ArrayBuffer {
  const buffer = new ArrayBuffer(STUDIO_WEBGPU_KM7_FILTER_UNIFORM_BYTES);
  const u32 = new Uint32Array(buffer, 0, 4);
  const f32 = new Float32Array(buffer, 16, 20);
  u32[0] = Math.max(1, Math.floor(input.width));
  u32[1] = Math.max(1, Math.floor(input.height));
  u32[2] = input.op;
  u32[3] = Math.max(0, Math.floor(input.flags ?? 0));

  const c0 = input.color0 ?? [0, 0, 0];
  const c1 = input.color1 ?? [0.5, 0.5, 0.5];
  const c2 = input.color2 ?? [1, 1, 1];
  const p0 = input.params0 ?? [0, 0, 0, 0];
  const p1 = input.params1 ?? [0, 0, 0, 0];

  f32[0] = c0[0];
  f32[1] = c0[1];
  f32[2] = c0[2];
  f32[3] = 1;
  f32[4] = c1[0];
  f32[5] = c1[1];
  f32[6] = c1[2];
  f32[7] = 1;
  f32[8] = c2[0];
  f32[9] = c2[1];
  f32[10] = c2[2];
  f32[11] = 1;
  f32[12] = p0[0];
  f32[13] = p0[1];
  f32[14] = p0[2];
  f32[15] = p0[3];
  f32[16] = p1[0];
  f32[17] = p1[1];
  f32[18] = p1[2];
  f32[19] = p1[3];
  return buffer;
}

export interface Km7WebGpuFilterDispatchReceipt {
  readonly backend: "webgpu-compute";
  readonly op: Km7FilterComputeOp;
  readonly workgroupsX: number;
  readonly workgroupsY: number;
  readonly uniformBytes: number;
}

const GPU_BUFFER_UNIFORM = 0x0040;
const GPU_BUFFER_COPY_DST = 0x0008;

/**
 * WebGPU Compute 7밴드 KM 필터 실행 파이프라인 래퍼.
 * `GPUDevice`가 제공되면 실제 `createComputePipeline` + `dispatchWorkgroups`를 실행하고,
 * 호출자는 GPU 미지원 환경에서 동일 수학 CPU 커널로 폴백한다.
 */
export class StudioWebGpuKm7FilterComputePipeline {
  private readonly device: GPUDevice;
  private readonly pipeline: GPUComputePipeline;
  private readonly uniformBuffer: GPUBuffer;
  private disposed = false;

  constructor(device: GPUDevice) {
    this.device = device;
    const module = device.createShaderModule({
      label: "studio-webgpu-km7-filter-compute",
      code: STUDIO_WEBGPU_KM7_FILTER_COMPUTE_WGSL,
    });
    this.pipeline = device.createComputePipeline({
      label: "studio-webgpu-km7-filter-pipeline",
      layout: "auto",
      compute: {
        module,
        entryPoint: "cs_km7_pigment_filter",
      },
    });
    this.uniformBuffer = device.createBuffer({
      label: "studio-webgpu-km7-filter-uniforms",
      size: STUDIO_WEBGPU_KM7_FILTER_UNIFORM_BYTES,
      usage: GPU_BUFFER_UNIFORM | GPU_BUFFER_COPY_DST,
    });
  }

  dispatch(
    sourceView: GPUTextureView,
    targetView: GPUTextureView,
    uniforms: Km7FilterComputeUniformInput,
  ): Km7WebGpuFilterDispatchReceipt {
    if (this.disposed) {
      throw new Error("StudioWebGpuKm7FilterComputePipeline이 이미 해제되었습니다.");
    }
    const packed = packKm7FilterComputeUniforms(uniforms);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, packed);
    const bindGroup = this.device.createBindGroup({
      label: "studio-webgpu-km7-filter-bind-group",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: sourceView },
        { binding: 2, resource: targetView },
      ],
    });
    const workgroupsX = Math.ceil(Math.max(1, uniforms.width) / STUDIO_WEBGPU_KM7_WORKGROUP_SIZE);
    const workgroupsY = Math.ceil(Math.max(1, uniforms.height) / STUDIO_WEBGPU_KM7_WORKGROUP_SIZE);
    const encoder = this.device.createCommandEncoder({
      label: "studio-webgpu-km7-filter-encoder",
    });
    const pass = encoder.beginComputePass({ label: "studio-webgpu-km7-filter-pass" });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return {
      backend: "webgpu-compute",
      op: uniforms.op,
      workgroupsX,
      workgroupsY,
      uniformBytes: packed.byteLength,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.uniformBuffer.destroy();
  }
}
