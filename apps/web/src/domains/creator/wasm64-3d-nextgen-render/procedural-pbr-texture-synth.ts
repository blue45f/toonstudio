/**
 * 결정적 절차적 PBR 텍스처 합성기(타일 가능 Value fBm · Worley 셀룰러 · Sobel 탄젠트 노멀맵).
 *
 * - 외부 텍스처 파일 0B로 `concrete`, `wood-grain`, `brick-wall`, `manga-screentone` 4종 재질 생성
 * - 알베도 RGBA8 + 탄젠트 공간 노멀맵 RGBA8 + 러프니스맵 RGBA8 동시 합성
 */

export type ProceduralMaterialKind =
  | "concrete"
  | "wood-grain"
  | "brick-wall"
  | "manga-screentone";

export interface ProceduralPbrTextureOptions {
  readonly material: ProceduralMaterialKind;
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly scale?: number;
  readonly normalStrength?: number;
}

export interface ProceduralPbrTextureStats {
  readonly width: number;
  readonly height: number;
  readonly material: ProceduralMaterialKind;
  readonly seed: number;
  readonly meanAlbedoLuma: number;
  readonly albedoStdDev: number;
  readonly meanRoughness: number;
  readonly meanNormalZ: number;
  readonly minNormalZ: number;
}

export interface ProceduralPbrTextureSet {
  readonly material: ProceduralMaterialKind;
  readonly width: number;
  readonly height: number;
  readonly albedoRgba: Uint8ClampedArray;
  readonly normalRgba: Uint8ClampedArray;
  readonly roughnessRgba: Uint8ClampedArray;
  readonly heightField: Float32Array;
  readonly stats: ProceduralPbrTextureStats;
}

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function hash2Periodic(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let h = (px * 374761393 + py * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function fadeSmooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoiseTileable(u: number, v: number, freq: number, seed: number): number {
  const period = Math.max(1, Math.round(freq));
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fadeSmooth(x - x0);
  const fy = fadeSmooth(y - y0);

  const v00 = hash2Periodic(x0, y0, period, seed);
  const v10 = hash2Periodic(x0 + 1, y0, period, seed);
  const v01 = hash2Periodic(x0, y0 + 1, period, seed);
  const v11 = hash2Periodic(x0 + 1, y0 + 1, period, seed);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fy;
}

function fbmTileable(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o += 1) {
    sum += valueNoiseTileable(u, v, freq, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

function worleyTileable(u: number, v: number, freq: number, seed: number): number {
  const period = Math.max(2, Math.round(freq));
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let minD2 = 9.0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const cx = ix + ox;
      const cy = iy + oy;
      const jx = hash2Periodic(cx, cy, period, seed + 17);
      const jy = hash2Periodic(cx, cy, period, seed + 73);
      const dx = cx + jx - x;
      const dy = cy + jy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
    }
  }
  return Math.min(1, Math.sqrt(minD2));
}

interface SampledTexelPbr {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly height: number;
  readonly roughness: number;
}

function evaluateMaterialTexel(
  material: ProceduralMaterialKind,
  u: number,
  v: number,
  scale: number,
  seed: number,
): SampledTexelPbr {
  if (material === "concrete") {
    const macro = fbmTileable(u, v, scale, 4, seed);
    const pit = worleyTileable(u, v, scale * 3, seed + 303);
    const micro = valueNoiseTileable(u, v, scale * 8, seed + 907);
    const height = clampNum(macro * 0.65 + pit * 0.22 + micro * 0.13, 0, 1);
    const tone = 0.58 + height * 0.24 - (1 - pit) * 0.08;
    return {
      r: tone * 1.01,
      g: tone,
      b: tone * 0.96,
      height,
      roughness: clampNum(0.68 + (1 - height) * 0.22 + (1 - pit) * 0.08, 0.45, 0.96),
    };
  }
  if (material === "wood-grain") {
    const warp = fbmTileable(u, v, scale, 3, seed + 19) * 0.18;
    const rings = 0.5 + 0.5 * Math.sin((u * scale * 2.5 + warp * 8.0) * Math.PI * 2);
    const fibers = fbmTileable(u * 4, v * 0.5, scale * 2, 3, seed + 511);
    const height = clampNum(rings * 0.65 + fibers * 0.35, 0, 1);
    return {
      r: 0.44 + height * 0.28,
      g: 0.28 + height * 0.21,
      b: 0.16 + height * 0.12,
      height,
      roughness: clampNum(0.38 + (1 - rings) * 0.2 + fibers * 0.12, 0.25, 0.78),
    };
  }
  if (material === "brick-wall") {
    const rows = Math.max(2, Math.round(scale * 2));
    const cols = Math.max(2, Math.round(scale));
    const rowF = v * rows;
    const rowI = Math.floor(rowF);
    const rowFrac = rowF - rowI;
    const colF = u * cols + ((rowI & 1) === 1 ? 0.5 : 0.0);
    const colI = Math.floor(colF);
    const colFrac = colF - colI;
    const inMortar = rowFrac < 0.11 || rowFrac > 0.89 || colFrac < 0.06 || colFrac > 0.94;
    const grain = fbmTileable(u, v, scale * 4, 3, seed + 221);
    if (inMortar) {
      return {
        r: 0.72 + grain * 0.08,
        g: 0.7 + grain * 0.08,
        b: 0.65 + grain * 0.07,
        height: 0.18 + grain * 0.14,
        roughness: clampNum(0.86 + grain * 0.1, 0.78, 0.98),
      };
    }
    const brickTint = hash2Periodic(colI, rowI, Math.max(rows, cols) * 2, seed + 613);
    return {
      r: 0.56 + brickTint * 0.18 + grain * 0.06,
      g: 0.24 + brickTint * 0.09 + grain * 0.05,
      b: 0.18 + brickTint * 0.06 + grain * 0.04,
      height: 0.68 + grain * 0.28,
      roughness: clampNum(0.62 + (1 - grain) * 0.22, 0.5, 0.9),
    };
  }

  // manga-screentone: 45도 회전 하프톤 망점 + 켄트지 종이 결
  const pitch = Math.max(4, Math.round(scale * 3));
  const cos45 = 0.70710678;
  const ru = (u * cos45 - v * cos45) * pitch;
  const rv = (u * cos45 + v * cos45) * pitch;
  const dist = Math.hypot(ru - Math.floor(ru) - 0.5, rv - Math.floor(rv) - 0.5);
  const tooth = fbmTileable(u, v, scale * 4, 3, seed + 809);
  const dotMask = dist < 0.24 ? 0 : dist > 0.3 ? 1 : (dist - 0.24) / 0.06;
  const height = clampNum(0.35 + dotMask * 0.45 + tooth * 0.2, 0, 1);
  const ink = 0.12 + dotMask * 0.82 - (1 - tooth) * 0.04;
  return {
    r: ink * 0.99,
    g: ink * 0.98,
    b: ink * 0.96,
    height,
    roughness: clampNum(0.76 + (1 - dotMask) * 0.14 + tooth * 0.08, 0.65, 0.96),
  };
}

/** Worley / Value fBm 기반으로 알베도 · 탄젠트 노멀 · 러프니스 PBR 맵 세트를 결정적으로 합성한다. */
export function synthesizeProceduralPbrTextures(options: ProceduralPbrTextureOptions): ProceduralPbrTextureSet {
  const width = Math.max(16, Math.min(1024, Math.floor(options.width ?? 128)));
  const height = Math.max(16, Math.min(1024, Math.floor(options.height ?? 128)));
  const seed = Math.floor(options.seed ?? 1337);
  const scale = clampNum(options.scale ?? 4.0, 1.0, 32.0);
  const normalStrength = clampNum(options.normalStrength ?? 2.4, 0.2, 12.0);

  const pixelCount = width * height;
  const albedoRgba = new Uint8ClampedArray(pixelCount * 4);
  const normalRgba = new Uint8ClampedArray(pixelCount * 4);
  const roughnessRgba = new Uint8ClampedArray(pixelCount * 4);
  const heightField = new Float32Array(pixelCount);

  let lumaSum = 0;
  let lumaSqSum = 0;
  let roughSum = 0;

  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      const texel = evaluateMaterialTexel(options.material, x / width, v, scale, seed);

      heightField[idx] = texel.height;
      const cr = Math.round(clampNum(texel.r, 0, 1) * 255);
      const cg = Math.round(clampNum(texel.g, 0, 1) * 255);
      const cb = Math.round(clampNum(texel.b, 0, 1) * 255);
      albedoRgba[off] = cr;
      albedoRgba[off + 1] = cg;
      albedoRgba[off + 2] = cb;
      albedoRgba[off + 3] = 255;

      const rByte = Math.round(clampNum(texel.roughness, 0, 1) * 255);
      roughnessRgba[off] = rByte;
      roughnessRgba[off + 1] = rByte;
      roughnessRgba[off + 2] = rByte;
      roughnessRgba[off + 3] = 255;

      const luma = (cr * 0.299 + cg * 0.587 + cb * 0.114) / 255;
      lumaSum += luma;
      lumaSqSum += luma * luma;
      roughSum += texel.roughness;
    }
  }

  const sampleH = (x: number, y: number): number => {
    const wx = ((x % width) + width) % width;
    const wy = ((y % height) + height) % height;
    return heightField[wy * width + wx];
  };

  let normalZSum = 0;
  let minNormalZ = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const htl = sampleH(x - 1, y - 1); const htc = sampleH(x, y - 1); const htr = sampleH(x + 1, y - 1);
      const hml = sampleH(x - 1, y); const hmr = sampleH(x + 1, y);
      const hbl = sampleH(x - 1, y + 1); const hbc = sampleH(x, y + 1); const hbr = sampleH(x + 1, y + 1);

      const gx = (-htl + htr - 2 * hml + 2 * hmr - hbl + hbr) * 0.25 * normalStrength;
      const gy = (-htl - 2 * htc - htr + hbl + 2 * hbc + hbr) * 0.25 * normalStrength;
      const invLen = 1 / Math.hypot(-gx, -gy, 1);
      const nx = -gx * invLen;
      const ny = -gy * invLen;
      const nz = invLen;
      normalZSum += nz;
      if (nz < minNormalZ) minNormalZ = nz;

      const off = (y * width + x) * 4;
      normalRgba[off] = Math.round(clampNum(nx * 0.5 + 0.5, 0, 1) * 255);
      normalRgba[off + 1] = Math.round(clampNum(ny * 0.5 + 0.5, 0, 1) * 255);
      normalRgba[off + 2] = Math.round(clampNum(nz * 0.5 + 0.5, 0, 1) * 255);
      normalRgba[off + 3] = 255;
    }
  }

  const meanAlbedoLuma = lumaSum / pixelCount;
  const albedoVariance = Math.max(0, lumaSqSum / pixelCount - meanAlbedoLuma * meanAlbedoLuma);

  return {
    material: options.material,
    width,
    height,
    albedoRgba,
    normalRgba,
    roughnessRgba,
    heightField,
    stats: {
      width,
      height,
      material: options.material,
      seed,
      meanAlbedoLuma,
      albedoStdDev: Math.sqrt(albedoVariance),
      meanRoughness: roughSum / pixelCount,
      meanNormalZ: normalZSum / pixelCount,
      minNormalZ,
    },
  };
}
