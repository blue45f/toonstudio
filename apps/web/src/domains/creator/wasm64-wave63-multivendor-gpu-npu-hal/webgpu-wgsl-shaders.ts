/**
 * Wave-63: WebGPU WGSL 컴퓨트 셰이더 모음.
 *
 * - `FSR_EASU_WGSL`: 12-tap 방향성 에지 적응 업스케일
 * - `FSR_RCAS_WGSL`: 5-tap 로버스트 대비 적응 샤프닝(할로·링잉 클램핑)
 * - `SPLIT_RES_NATIVE_LINEART_COMPOSITE_WGSL`: 업스케일 채색 + 100% 네이티브 2D 선화 무손실 합성
 * - `RADIANCE_CASCADES_25D_WGSL`: 2.5D 방향성 Radiance Cascades 간접광 레이마칭·상위 병합
 */

/** 12-tap 방향성 에지 적응 업스케일(FSR EASU) WebGPU WGSL 컴퓨트 셰이더. */
export const FSR_EASU_WGSL = /* wgsl */ `
struct FsrEasuParams {
  srcWidth: u32,
  srcHeight: u32,
  dstWidth: u32,
  dstHeight: u32,
  edgeDirectionality: f32,
  negativeLobeStrength: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> params: FsrEasuParams;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var dstTex: texture_storage_2d<rgba8unorm, write>;

fn clampCoord(coord: vec2<i32>) -> vec2<i32> {
  return clamp(
    coord,
    vec2<i32>(0, 0),
    vec2<i32>(i32(params.srcWidth) - 1, i32(params.srcHeight) - 1)
  );
}

fn loadSrc(coord: vec2<i32>) -> vec4<f32> {
  return textureLoad(srcTex, clampCoord(coord), 0);
}

fn lumaFsr(rgb: vec3<f32>) -> f32 {
  return rgb.g * 0.5 + (rgb.r + rgb.b) * 0.25;
}

fn easuAccumulateDir(
  dirAcc: ptr<function, vec2<f32>>,
  lenAcc: ptr<function, f32>,
  weight: f32,
  lTop: f32,
  lLeft: f32,
  lCenter: f32,
  lRight: f32,
  lBottom: f32
) {
  let dx = lRight - lLeft;
  let dy = lBottom - lTop;
  let absDx = max(abs(lRight - lCenter), abs(lCenter - lLeft));
  let absDy = max(abs(lBottom - lCenter), abs(lCenter - lTop));
  let lenX = select(0.0, clamp(abs(dx) / max(absDx, 1e-4), 0.0, 1.0), absDx > 1e-4);
  let lenY = select(0.0, clamp(abs(dy) / max(absDy, 1e-4), 0.0, 1.0), absDy > 1e-4);
  (*dirAcc) += vec2<f32>(dx, dy) * weight;
  (*lenAcc) += (lenX * lenX + lenY * lenY) * 0.5 * weight;
}

fn easuTapWeight(
  offset: vec2<f32>,
  dir: vec2<f32>,
  invScale: vec2<f32>,
  lob: f32,
  clp: f32
) -> f32 {
  let rotX = offset.x * dir.x + offset.y * dir.y;
  let rotY = -offset.x * dir.y + offset.y * dir.x;
  let scaledX = rotX * invScale.x;
  let scaledY = rotY * invScale.y;
  let d2 = min(scaledX * scaledX + scaledY * scaledY, clp);
  let wB = (2.0 / 5.0) * d2 - 1.0;
  let wA = lob * d2 - 1.0;
  return ((25.0 / 16.0) * (wB * wB) - (25.0 / 16.0 - 1.0)) * (wA * wA);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.dstWidth || gid.y >= params.dstHeight) {
    return;
  }

  let sx = (f32(gid.x) + 0.5) * f32(params.srcWidth) / f32(params.dstWidth) - 0.5;
  let sy = (f32(gid.y) + 0.5) * f32(params.srcHeight) / f32(params.dstHeight) - 0.5;
  let base = vec2<i32>(i32(floor(sx)), i32(floor(sy)));
  let frac = vec2<f32>(sx - floor(sx), sy - floor(sy));

  let b = loadSrc(base + vec2<i32>(0, -1));
  let c = loadSrc(base + vec2<i32>(1, -1));
  let e = loadSrc(base + vec2<i32>(-1, 0));
  let f = loadSrc(base + vec2<i32>(0, 0));
  let g = loadSrc(base + vec2<i32>(1, 0));
  let h = loadSrc(base + vec2<i32>(2, 0));
  let i = loadSrc(base + vec2<i32>(-1, 1));
  let j = loadSrc(base + vec2<i32>(0, 1));
  let k = loadSrc(base + vec2<i32>(1, 1));
  let l = loadSrc(base + vec2<i32>(2, 1));
  let n = loadSrc(base + vec2<i32>(0, 2));
  let o = loadSrc(base + vec2<i32>(1, 2));

  var dir = vec2<f32>(0.0, 0.0);
  var len = 0.0;
  easuAccumulateDir(&dir, &len, (1.0 - frac.x) * (1.0 - frac.y), lumaFsr(b.rgb), lumaFsr(e.rgb), lumaFsr(f.rgb), lumaFsr(g.rgb), lumaFsr(j.rgb));
  easuAccumulateDir(&dir, &len, frac.x * (1.0 - frac.y), lumaFsr(c.rgb), lumaFsr(f.rgb), lumaFsr(g.rgb), lumaFsr(h.rgb), lumaFsr(k.rgb));
  easuAccumulateDir(&dir, &len, (1.0 - frac.x) * frac.y, lumaFsr(f.rgb), lumaFsr(i.rgb), lumaFsr(j.rgb), lumaFsr(k.rgb), lumaFsr(n.rgb));
  easuAccumulateDir(&dir, &len, frac.x * frac.y, lumaFsr(g.rgb), lumaFsr(j.rgb), lumaFsr(k.rgb), lumaFsr(l.rgb), lumaFsr(o.rgb));

  let dirSq = dot(dir, dir);
  if (dirSq < 1e-6) {
    dir = vec2<f32>(1.0, 0.0);
  } else {
    dir = dir * inverseSqrt(dirSq);
  }

  let edgeAniso = clamp(len * len * params.edgeDirectionality, 0.0, 1.0);
  let stretch = 1.0 / max(abs(dir.x), abs(dir.y));
  let invScale = vec2<f32>(
    1.0 / max(0.5, 1.0 - 0.5 * edgeAniso),
    1.0 / (1.0 + (stretch - 1.0) * edgeAniso)
  );
  let lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * edgeAniso * params.negativeLobeStrength;
  let clp = 1.0 / max(lob, 0.05);

  var colorAcc = vec4<f32>(0.0);
  var weightAcc = 0.0;
  let taps = array<vec4<f32>, 12>(b, c, e, f, g, h, i, j, k, l, n, o);
  let offsets = array<vec2<f32>, 12>(
    vec2<f32>(0.0, -1.0), vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 0.0), vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(2.0, 0.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(2.0, 1.0),
    vec2<f32>(0.0, 2.0), vec2<f32>(1.0, 2.0)
  );
  for (var t = 0u; t < 12u; t = t + 1u) {
    let w = easuTapWeight(offsets[t] - frac, dir, invScale, lob, clp);
    colorAcc += taps[t] * w;
    weightAcc += w;
  }

  let min4 = min(min(f, g), min(j, k));
  let max4 = max(max(f, g), max(j, k));
  textureStore(dstTex, vec2<i32>(i32(gid.x), i32(gid.y)), clamp(colorAcc / max(weightAcc, 1e-5), min4, max4));
}
`;

/** 5-tap 로버스트 대비 적응 샤프닝(FSR RCAS) WebGPU WGSL 컴퓨트 셰이더. */
export const FSR_RCAS_WGSL = /* wgsl */ `
struct FsrRcasParams {
  width: u32,
  height: u32,
  sharpness: f32,
  denoiseFlag: u32,
};

@group(0) @binding(0) var<uniform> params: FsrRcasParams;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var dstTex: texture_storage_2d<rgba8unorm, write>;

fn loadClamped(coord: vec2<i32>) -> vec4<f32> {
  let c = clamp(coord, vec2<i32>(0, 0), vec2<i32>(i32(params.width) - 1, i32(params.height) - 1));
  return textureLoad(srcTex, c, 0);
}

fn rcasLuma(rgb: vec3<f32>) -> f32 {
  return rgb.g * 0.5 + (rgb.r + rgb.b) * 0.25;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let p = vec2<i32>(i32(gid.x), i32(gid.y));
  let b = loadClamped(p + vec2<i32>(0, -1));
  let d = loadClamped(p + vec2<i32>(-1, 0));
  let e = loadClamped(p);
  let f = loadClamped(p + vec2<i32>(1, 0));
  let h = loadClamped(p + vec2<i32>(0, 1));

  let min4 = min(min(b.rgb, d.rgb), min(f.rgb, h.rgb));
  let max4 = max(max(b.rgb, d.rgb), max(f.rgb, h.rgb));
  let min5 = min(min4, e.rgb);
  let max5 = max(max4, e.rgb);

  let hitMin = min5 / max(4.0 * max4, vec3<f32>(1e-4));
  let hitMax = (vec3<f32>(1.0) - max5) / min(4.0 * min4 - vec3<f32>(4.0), vec3<f32>(-1e-4));
  let lobeVec = max(-hitMin, hitMax);
  var lobe = max(-0.1875, min(max(lobeVec.r, max(lobeVec.g, lobeVec.b)), 0.0));

  if (params.denoiseFlag != 0u) {
    let lb = rcasLuma(b.rgb);
    let ld = rcasLuma(d.rgb);
    let le = rcasLuma(e.rgb);
    let lf = rcasLuma(f.rgb);
    let lh = rcasLuma(h.rgb);
    let nz = 0.25 * (lb + ld + lf + lh) - le;
    let lRange = max(max(max(lb, ld), max(lf, lh)), le) - min(min(min(lb, ld), min(lf, lh)), le);
    lobe = lobe * (1.0 - 0.5 * clamp(abs(nz) / max(lRange, 1e-4), 0.0, 1.0));
  }

  let w = lobe * clamp(params.sharpness, 0.0, 1.0);
  let sharpenedRgb = (w * (b.rgb + d.rgb + f.rgb + h.rgb) + e.rgb) / max(1.0 + 4.0 * w, 0.25);
  textureStore(dstTex, p, vec4<f32>(clamp(sharpenedRgb, min5, max5), e.a));
}
`;

/** 업스케일된 채색/3D 레이어 위에 100% 네이티브 2D 잉크 선화를 무손실 합성하는 WGSL 셰이더. */
export const SPLIT_RES_NATIVE_LINEART_COMPOSITE_WGSL = /* wgsl */ `
struct SplitResCompositeParams {
  width: u32,
  height: u32,
  lineartOpacity: f32,
  _pad0: f32,
};

@group(0) @binding(0) var<uniform> params: SplitResCompositeParams;
@group(0) @binding(1) var upscaledPaintTex: texture_2d<f32>;
@group(0) @binding(2) var nativeLineartTex: texture_2d<f32>;
@group(0) @binding(3) var finalCanvasTex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let p = vec2<i32>(i32(gid.x), i32(gid.y));
  let paint = textureLoad(upscaledPaintTex, p, 0);
  let ink = textureLoad(nativeLineartTex, p, 0);
  let srcA = clamp(ink.a * params.lineartOpacity, 0.0, 1.0);
  if (srcA >= 0.9999) {
    textureStore(finalCanvasTex, p, vec4<f32>(ink.rgb, 1.0));
    return;
  }
  let invA = 1.0 - srcA;
  let outA = srcA + paint.a * invA;
  let outRgb = select(
    vec3<f32>(0.0),
    (ink.rgb * srcA + paint.rgb * paint.a * invA) / outA,
    outA > 1e-5
  );
  textureStore(finalCanvasTex, p, vec4<f32>(clamp(outRgb, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(outA, 0.0, 1.0)));
}
`;

/** 2.5D 방향성 Radiance Cascades 캐스케이드 레이마칭 및 상위 병합 WGSL 셰이더. */
export const RADIANCE_CASCADES_25D_WGSL = /* wgsl */ `
struct RadianceCascadeParams {
  width: u32,
  height: u32,
  cascadeIndex: u32,
  probeStride: u32,
  angularRays: u32,
  intervalStart: f32,
  intervalEnd: f32,
  distanceFalloff: f32,
  emissionGain: f32,
  emitterElevation: f32,
  hasUpperCascade: u32,
  _pad0: u32,
};

@group(0) @binding(0) var<uniform> params: RadianceCascadeParams;
@group(0) @binding(1) var emissiveTex: texture_2d<f32>;
@group(0) @binding(2) var occluderHeightTex: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> upperCascadeBins: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outCascadeBins: array<vec4<f32>>;

const TWO_PI: f32 = 6.28318530718;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let probeCountX = (params.width + params.probeStride - 1u) / params.probeStride;
  let probeCountY = (params.height + params.probeStride - 1u) / params.probeStride;
  if (gid.x >= probeCountX || gid.y >= probeCountY) {
    return;
  }

  let origin = vec2<f32>(
    f32(min(gid.x * params.probeStride + params.probeStride / 2u, params.width - 1u)) + 0.5,
    f32(min(gid.y * params.probeStride + params.probeStride / 2u, params.height - 1u)) + 0.5
  );
  let probeIdx = gid.y * probeCountX + gid.x;
  let upperCountX = max(1u, (probeCountX + 1u) / 2u);
  let upperCountY = max(1u, (probeCountY + 1u) / 2u);
  let upperProbeIdx = min(gid.y / 2u, upperCountY - 1u) * upperCountX + min(gid.x / 2u, upperCountX - 1u);
  let upperAngularRays = params.angularRays * 2u;
  let rayCountF = f32(params.angularRays);
  let stepLen = max(0.75, (params.intervalEnd - params.intervalStart) / 16.0);

  for (var r = 0u; r < params.angularRays; r = r + 1u) {
    let angle = (f32(r) + 0.5) * (TWO_PI / rayCountF);
    let dir = vec2<f32>(cos(angle), sin(angle));
    var rayRad = vec3<f32>(0.0);
    var transmittance = 1.0;

    var dist = params.intervalStart;
    loop {
      if (dist >= params.intervalEnd || transmittance <= 0.015) {
        break;
      }
      let pos = origin + dir * dist;
      if (pos.x < 0.0 || pos.y < 0.0 || pos.x >= f32(params.width) || pos.y >= f32(params.height)) {
        break;
      }
      let texCoord = vec2<i32>(i32(pos.x), i32(pos.y));
      let em = textureLoad(emissiveTex, texCoord, 0);
      let occH = textureLoad(occluderHeightTex, texCoord, 0);

      let attenuation = 1.0 / (1.0 + params.distanceFalloff * dist * dist);
      rayRad += em.rgb * em.a * params.emissionGain * attenuation * transmittance * stepLen;

      let opacity = select(occH.r * 0.12, occH.r, occH.g >= params.emitterElevation);
      transmittance *= clamp(1.0 - opacity, 0.0, 1.0);
      dist += stepLen;
    }

    var merged = rayRad;
    if (params.hasUpperCascade != 0u) {
      let baseUpper = upperProbeIdx * upperAngularRays + r * 2u;
      merged += 0.5 * (upperCascadeBins[baseUpper].rgb + upperCascadeBins[baseUpper + 1u].rgb) * transmittance;
    }
    outCascadeBins[probeIdx * params.angularRays + r] = vec4<f32>(merged, transmittance);
  }
}
`;
