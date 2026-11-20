/**
 * WebGPU WGSL 단일 정본 38밴드 Kubelka-Munk 혼색 셰이더 스니펫.
 * CPU 테이블(`spectral-38band-km.ts`)과 비트 단위 동일한 38밴드 가중치·기저를 내장한다.
 */
import {
  CIE_1931_D65_WEIGHTS_X,
  CIE_1931_D65_WEIGHTS_Y,
  CIE_1931_D65_WEIGHTS_Z,
  SPECTRAL_38BAND_BASIS,
} from "./spectral-38band-km";

function wgslArray(name: string, values: readonly number[]): string {
  return `const ${name}: array<f32, 38> = array<f32, 38>(${values.map((v) => v.toFixed(6)).join(", ")});`;
}

export const SPECTRAL_38BAND_KM_WGSL_SNIPPET: string = /* wgsl */ `
const SPECTRAL38_EPS: f32 = 0.0001;
${wgslArray("SPECTRAL38_WX", CIE_1931_D65_WEIGHTS_X)}
${wgslArray("SPECTRAL38_WY", CIE_1931_D65_WEIGHTS_Y)}
${wgslArray("SPECTRAL38_WZ", CIE_1931_D65_WEIGHTS_Z)}
${wgslArray("SPECTRAL38_BC", SPECTRAL_38BAND_BASIS.C)}
${wgslArray("SPECTRAL38_BM", SPECTRAL_38BAND_BASIS.M)}
${wgslArray("SPECTRAL38_BY", SPECTRAL_38BAND_BASIS.Y)}
${wgslArray("SPECTRAL38_BR", SPECTRAL_38BAND_BASIS.R)}
${wgslArray("SPECTRAL38_BG", SPECTRAL_38BAND_BASIS.G)}
${wgslArray("SPECTRAL38_BB", SPECTRAL_38BAND_BASIS.B)}

fn spectral38_srgb_to_lin_ch(c: f32) -> f32 {
  let x = clamp(c, 0.0, 1.0);
  return select(pow((x + 0.055) / 1.055, 2.4), x / 12.92, x <= 0.04045);
}

fn spectral38_lin_to_srgb_ch(c: f32) -> f32 {
  let x = clamp(c, 0.0, 1.0);
  return select(1.055 * pow(x, 1.0 / 2.4) - 0.055, x * 12.92, x <= 0.0031308);
}

fn spectral38_band_reflectance(lin: vec3<f32>, i: u32) -> f32 {
  let w = min(lin.r, min(lin.g, lin.b));
  let d = lin - vec3<f32>(w);
  let c = min(d.g, d.b);
  let m = min(d.r, d.b);
  let y = min(d.r, d.g);
  let pr = min(max(0.0, d.r - d.b), max(0.0, d.r - d.g));
  let pg = min(max(0.0, d.g - d.b), max(0.0, d.g - d.r));
  let pb = min(max(0.0, d.b - d.g), max(0.0, d.b - d.r));
  let val = w
    + c * SPECTRAL38_BC[i]
    + m * SPECTRAL38_BM[i]
    + y * SPECTRAL38_BY[i]
    + pr * SPECTRAL38_BR[i]
    + pg * SPECTRAL38_BG[i]
    + pb * SPECTRAL38_BB[i];
  return clamp(val, SPECTRAL38_EPS, 1.0);
}

fn spectral38_mix_srgb(col_a: vec3<f32>, col_b: vec3<f32>, t: f32) -> vec3<f32> {
  let mt = clamp(t, 0.0, 1.0);
  let la = vec3<f32>(
    spectral38_srgb_to_lin_ch(col_a.r),
    spectral38_srgb_to_lin_ch(col_a.g),
    spectral38_srgb_to_lin_ch(col_a.b),
  );
  let lb = vec3<f32>(
    spectral38_srgb_to_lin_ch(col_b.r),
    spectral38_srgb_to_lin_ch(col_b.g),
    spectral38_srgb_to_lin_ch(col_b.b),
  );
  var lum_a: f32 = 0.0;
  var lum_b: f32 = 0.0;
  for (var i: u32 = 0u; i < 38u; i = i + 1u) {
    lum_a = lum_a + spectral38_band_reflectance(la, i) * SPECTRAL38_WY[i];
    lum_b = lum_b + spectral38_band_reflectance(lb, i) * SPECTRAL38_WY[i];
  }
  let fa = 1.0 - mt;
  let ca = fa * fa * max(SPECTRAL38_EPS, lum_a);
  let cb = mt * mt * max(SPECTRAL38_EPS, lum_b);
  let inv_tot = 1.0 / max(SPECTRAL38_EPS, ca + cb);
  var xyz = vec3<f32>(0.0);
  for (var i: u32 = 0u; i < 38u; i = i + 1u) {
    let ra = spectral38_band_reflectance(la, i);
    let rb = spectral38_band_reflectance(lb, i);
    let ksa = ((1.0 - ra) * (1.0 - ra)) / (2.0 * ra);
    let ksb = ((1.0 - rb) * (1.0 - rb)) / (2.0 * rb);
    let ksm = (ksa * ca + ksb * cb) * inv_tot;
    let rmix = max(SPECTRAL38_EPS, 1.0 + ksm - sqrt(ksm * ksm + 2.0 * ksm));
    xyz = xyz + rmix * vec3<f32>(SPECTRAL38_WX[i], SPECTRAL38_WY[i], SPECTRAL38_WZ[i]);
  }
  let out_lin = vec3<f32>(
    clamp(3.240970 * xyz.x - 1.537383 * xyz.y - 0.498611 * xyz.z, 0.0, 1.0),
    clamp(-0.969244 * xyz.x + 1.875968 * xyz.y + 0.041555 * xyz.z, 0.0, 1.0),
    clamp(0.055630 * xyz.x - 0.203977 * xyz.y + 1.056972 * xyz.z, 0.0, 1.0),
  );
  return vec3<f32>(
    spectral38_lin_to_srgb_ch(out_lin.r),
    spectral38_lin_to_srgb_ch(out_lin.g),
    spectral38_lin_to_srgb_ch(out_lin.b),
  );
}
`;
