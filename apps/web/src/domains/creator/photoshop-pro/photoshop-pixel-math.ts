/**
 * Photoshop Pro 픽셀 합성·보정 엔진 공용 수학 및 커널 유틸리티.
 * RGB/HSL/CIE Lab 색공간 변환, 분리 가우시안 블러, Felzenszwalb-Huttenlocher 2D EDT를 제공한다.
 */

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface RgbaImageBuffer {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

export function luminance255(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rgb01ToHslDeg(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) * 0.5;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h / 6) * 360, s, l];
}

export function hslDegToRgb01(hDeg: number, s: number, l: number): [number, number, number] {
  if (s <= 1e-6) return [l, l, l];
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (tIn: number): number => {
    let t = tIn;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 0.5) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

export function srgb01ToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lr = lin(clamp01(r));
  const lg = lin(clamp01(g));
  const lb = lin(clamp01(b));
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToSrgb01(L: number, A: number, B: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = A / 500 + fy;
  const fz = fy - B / 200;
  const invF = (t: number): number => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  const x = invF(fx) * 0.95047;
  const y = invF(fy);
  const z = invF(fz) * 1.08883;
  const delin = (v: number): number => {
    const c = clamp01(v);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  return [
    delin(x * 3.2404542 - y * 1.5371385 - z * 0.4985314),
    delin(-x * 0.969266 + y * 1.8760108 + z * 0.041556),
    delin(x * 0.0556434 - y * 0.2040259 + z * 1.0572252),
  ];
}

function buildGaussianKernel(radiusPx: number, maxRadius = 32): Float32Array {
  const r = Math.max(0, Math.min(maxRadius, Math.ceil(radiusPx)));
  if (r === 0) return new Float32Array([1]);
  const sigma = Math.max(0.5, radiusPx * 0.5);
  const kernel = new Float32Array(r * 2 + 1);
  let sum = 0;
  const inv2s2 = 1 / (2 * sigma * sigma);
  for (let i = -r; i <= r; i += 1) {
    const w = Math.exp(-(i * i) * inv2s2);
    kernel[i + r] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] = (kernel[i] ?? 0) / sum;
  return kernel;
}

export function blurFloatFieldSeparable(
  field: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
): Float32Array {
  if (radiusPx <= 0.25) return new Float32Array(field);
  const kernel = buildGaussianKernel(radiusPx, 48);
  const half = (kernel.length - 1) >> 1;
  const temp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -half; k <= half; k += 1) {
        const sx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        acc += (field[row + sx] ?? 0) * (kernel[k + half] ?? 0);
      }
      temp[row + x] = acc;
    }
  }
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -half; k <= half; k += 1) {
        const sy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        acc += (temp[sy * width + x] ?? 0) * (kernel[k + half] ?? 0);
      }
      out[row + x] = acc;
    }
  }
  return out;
}

export function blurByteMaskSeparable(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
): Uint8Array<ArrayBuffer> {
  if (radiusPx <= 0.25) return new Uint8Array(mask);
  const f = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) f[i] = mask[i] ?? 0;
  const blurred = blurFloatFieldSeparable(f, width, height, radiusPx);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i += 1) out[i] = clampByte(blurred[i] ?? 0);
  return out;
}

export function blurRgbaSeparable(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radiusPx: number,
): Uint8ClampedArray {
  if (radiusPx <= 0.25) return new Uint8ClampedArray(src);
  const kernel = buildGaussianKernel(radiusPx, 32);
  const half = (kernel.length - 1) >> 1;
  const temp = new Float32Array(width * height * 4);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let k = -half; k <= half; k += 1) {
        const sx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        const off = (y * width + sx) * 4;
        const w = kernel[k + half] ?? 0;
        rr += (src[off] ?? 0) * w;
        gg += (src[off + 1] ?? 0) * w;
        bb += (src[off + 2] ?? 0) * w;
        aa += (src[off + 3] ?? 0) * w;
      }
      const d = (y * width + x) * 4;
      temp[d] = rr;
      temp[d + 1] = gg;
      temp[d + 2] = bb;
      temp[d + 3] = aa;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let k = -half; k <= half; k += 1) {
        const sy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        const off = (sy * width + x) * 4;
        const w = kernel[k + half] ?? 0;
        rr += (temp[off] ?? 0) * w;
        gg += (temp[off + 1] ?? 0) * w;
        bb += (temp[off + 2] ?? 0) * w;
        aa += (temp[off + 3] ?? 0) * w;
      }
      const d = (y * width + x) * 4;
      out[d] = clampByte(rr);
      out[d + 1] = clampByte(gg);
      out[d + 2] = clampByte(bb);
      out[d + 3] = clampByte(aa);
    }
  }
  return out;
}

function edt1d(f: Float32Array, n: number, v: Int32Array, z: Float32Array, out: Float32Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q += 1) {
    let s: number;
    while (true) {
      const r = v[k] ?? 0;
      s = ((f[q] ?? 0) + q * q - ((f[r] ?? 0) + r * r)) / (2 * q - 2 * r);
      if (s <= (z[k] ?? -1e20)) {
        k -= 1;
        if (k < 0) { k = 0; break; }
      } else {
        break;
      }
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while ((z[k + 1] ?? 1e20) < q) k += 1;
    const diff = q - (v[k] ?? 0);
    out[q] = diff * diff + (f[v[k] ?? 0] ?? 0);
  }
}

export function computeDistanceField(
  mask: Float32Array,
  width: number,
  height: number,
  measureOutside: boolean,
): Float32Array {
  const INF = 1e12;
  const maxDim = Math.max(width, height);
  const f = new Float32Array(maxDim);
  const d = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);
  const grid = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const inside = (mask[i] ?? 0) >= 0.5;
    grid[i] = (measureOutside ? inside : !inside) ? 0 : INF;
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = grid[y * width + x] ?? INF;
    edt1d(f, height, v, z, d);
    for (let y = 0; y < height; y += 1) grid[y * width + x] = d[y] ?? INF;
  }
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) f[x] = grid[row + x] ?? INF;
    edt1d(f, width, v, z, d);
    for (let x = 0; x < width; x += 1) grid[row + x] = Math.sqrt(Math.max(0, d[x] ?? 0));
  }
  return grid;
}
