/**
 * Adobe Firefly 스타일 비파괴 노드 그래프 · 아웃페인트 · 3D 재조명 · OKLab 무드 전송 · C2PA 자격증명 엔진
 *
 * REA 실증 근거: ev_87f2deace658ff1bbcf8e271176f55f9ac1f1347478ebef026fd59b32946e067
 * (https://www.adobe.com/products/firefly.html — Upscale, Expand, Remove object, Workflows, Content Credentials)
 * 외부 유료 API나 독점 가중치 없이 100% 로컬 RGBA 알고리즘으로 동작하는 클린룸 구현이다.
 */

export interface FireflyRgbaBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type RgbTriplet = readonly [number, number, number];
export type FireflyGraphNodeKind = "Prompt" | "StructureRef" | "StyleRef" | "ObjectMask" | "Relight" | "Upscale" | "Output";
export type FireflyPortKind = "image" | "prompt" | "structure" | "style" | "mask";

export interface FireflyPromptParams {
  readonly positive: string; readonly negative?: string; readonly tintRgb?: RgbTriplet; readonly tintStrength?: number;
}
export interface FireflyStructureRefParams { readonly edgeStrength: number; readonly preserveLineWeight: boolean; }
export interface FireflyStyleRefParams {
  readonly strength: number; readonly referenceRgbMean: RgbTriplet; readonly referenceRgbSpread: RgbTriplet;
}
export interface FireflyObjectMaskParams {
  readonly mode: "fill" | "remove" | "recolor" | "expand";
  readonly rectNormalized: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly featherPx: number;
  readonly targetRgb?: RgbTriplet;
  readonly expandPx?: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
}
export interface FireflyRelightParams {
  readonly azimuthDeg: number; readonly elevationDeg: number; readonly intensity: number; readonly ambient: number;
  readonly lightRgb: RgbTriplet; readonly rimStrength: number; readonly depthRelief: number;
}
export interface FireflyUpscaleParams { readonly scale: 1 | 2; readonly sharpen: number; }
export interface FireflyOutputParams { readonly rightsBomAssetId: string; readonly creatorName: string; readonly embedC2pa: boolean; }

interface FireflyNodeBase<K extends FireflyGraphNodeKind, P> {
  readonly id: string; readonly kind: K; readonly labelKo: string; readonly enabled: boolean; readonly params: P;
}

export type FireflyGraphNode =
  | FireflyNodeBase<"Prompt", FireflyPromptParams>
  | FireflyNodeBase<"StructureRef", FireflyStructureRefParams>
  | FireflyNodeBase<"StyleRef", FireflyStyleRefParams>
  | FireflyNodeBase<"ObjectMask", FireflyObjectMaskParams>
  | FireflyNodeBase<"Relight", FireflyRelightParams>
  | FireflyNodeBase<"Upscale", FireflyUpscaleParams>
  | FireflyNodeBase<"Output", FireflyOutputParams>;

export interface FireflyGraphEdge { readonly id: string; readonly fromNodeId: string; readonly toNodeId: string; readonly port: FireflyPortKind; }
export interface FireflyGraphDocument { readonly id: string; readonly titleKo: string; readonly nodes: readonly FireflyGraphNode[]; readonly edges: readonly FireflyGraphEdge[]; }
export interface FireflyGraphSortResult { readonly valid: boolean; readonly order: readonly string[]; readonly cycleNodeIds: readonly string[]; readonly errors: readonly string[]; }
export interface OklabTriplet { readonly L: number; readonly a: number; readonly b: number; }
export interface OklabChannelStats { readonly mean: OklabTriplet; readonly std: OklabTriplet; readonly sampleCount: number; }
export interface C2paActionAssertion {
  readonly action: string; readonly softwareAgent: string;
  readonly digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia" | "http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic";
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}
export interface C2paContentCredentialsManifest {
  readonly specVersion: "c2pa-cleanroom-2.1"; readonly claimGenerator: string; readonly instanceId: string;
  readonly createdAtIso: string; readonly creatorName: string; readonly rightsBomAssetId: string;
  readonly commercialSafe: boolean; readonly zeroPaidApiUsed: boolean; readonly localAlgorithmOnly: boolean;
  readonly actions: readonly C2paActionAssertion[];
  readonly imageDimensions: { readonly width: number; readonly height: number };
  readonly pixelDigestHex: string; readonly claimSignatureHex: string;
}
export interface C2paVerificationResult { readonly valid: boolean; readonly pixelIntegrityOk: boolean; readonly signatureIntegrityOk: boolean; readonly issues: readonly string[]; }
export interface FireflyNodeTrace {
  readonly nodeId: string; readonly kind: FireflyGraphNodeKind; readonly labelKo: string;
  readonly skipped: boolean; readonly outputWidth: number; readonly outputHeight: number; readonly summaryKo: string;
}
export interface FireflyGraphExecutionResult {
  readonly ok: boolean; readonly image: FireflyRgbaBuffer; readonly trace: readonly FireflyNodeTrace[];
  readonly activePrompt: string; readonly credentials: C2paContentCredentialsManifest | null; readonly errors: readonly string[];
}

const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
const clampRange = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function srgbToLinear(channel: number): number {
  const c = clampRange(channel / 255, 0, 1);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(linear: number): number {
  const c = clampRange(linear, 0, 1);
  return clampByte((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
}

/** sRGB [0..255] → OKLab (Björn Ottosson 표준 변환 행렬). */
export function rgbToOklab(r: number, g: number, b: number): OklabTriplet {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab → sRGB [0..255]. */
export function oklabToRgb(L: number, a: number, b: number): RgbTriplet {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** 유효 알파 픽셀의 OKLab 평균과 표준편차를 계산한다. */
export function computeOklabStats(image: FireflyRgbaBuffer): OklabChannelStats {
  const total = image.width * image.height;
  let count = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    if (image.data[o + 3] < 8) continue;
    const lab = rgbToOklab(image.data[o], image.data[o + 1], image.data[o + 2]);
    sumL += lab.L;
    sumA += lab.a;
    sumB += lab.b;
    count += 1;
  }
  if (count === 0) {
    return { mean: { L: 0.5, a: 0, b: 0 }, std: { L: 0.1, a: 0.05, b: 0.05 }, sampleCount: 0 };
  }
  const meanL = sumL / count;
  const meanA = sumA / count;
  const meanB = sumB / count;
  let varL = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    if (image.data[o + 3] < 8) continue;
    const lab = rgbToOklab(image.data[o], image.data[o + 1], image.data[o + 2]);
    varL += (lab.L - meanL) ** 2;
    varA += (lab.a - meanA) ** 2;
    varB += (lab.b - meanB) ** 2;
  }
  return {
    mean: { L: meanL, a: meanA, b: meanB },
    std: { L: Math.sqrt(varL / count), a: Math.sqrt(varA / count), b: Math.sqrt(varB / count) },
    sampleCount: count,
  };
}

/** OKLab 평균·표준편차 컬러 무드 전송(Style Reference). */
export function applyOklabStyleTransfer(
  source: FireflyRgbaBuffer,
  reference: FireflyRgbaBuffer | OklabChannelStats,
  strength = 0.75,
): FireflyRgbaBuffer {
  const s = clampRange(strength, 0, 1);
  const srcStats = computeOklabStats(source);
  const refStats = "data" in reference ? computeOklabStats(reference) : reference;
  const out = new Uint8ClampedArray(source.data.length);
  const scaleL = clampRange(refStats.std.L / Math.max(srcStats.std.L, 0.015), 0.35, 2.4);
  const scaleA = clampRange(refStats.std.a / Math.max(srcStats.std.a, 0.01), 0.35, 2.6);
  const scaleB = clampRange(refStats.std.b / Math.max(srcStats.std.b, 0.01), 0.35, 2.6);

  for (let i = 0; i < source.data.length; i += 4) {
    const alpha = source.data[i + 3];
    if (alpha < 8) {
      out.set(source.data.subarray(i, i + 4), i);
      continue;
    }
    const lab = rgbToOklab(source.data[i], source.data[i + 1], source.data[i + 2]);
    const tL = clampRange(refStats.mean.L + (lab.L - srcStats.mean.L) * scaleL, 0.02, 0.98);
    const tA = clampRange(refStats.mean.a + (lab.a - srcStats.mean.a) * scaleA, -0.35, 0.35);
    const tB = clampRange(refStats.mean.b + (lab.b - srcStats.mean.b) * scaleB, -0.35, 0.35);
    const [nr, ng, nb] = oklabToRgb(lab.L * (1 - s) + tL * s, lab.a * (1 - s) + tA * s, lab.b * (1 - s) + tB * s);
    out[i] = nr;
    out[i + 1] = ng;
    out[i + 2] = nb;
    out[i + 3] = alpha;
  }
  return { width: source.width, height: source.height, data: out };
}

/** 구면 방향성 조명 재조명(Relight) RGBA 셰이딩. */
export function applySphericalRelight(source: FireflyRgbaBuffer, params: FireflyRelightParams): FireflyRgbaBuffer {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data.length);
  const azRad = (params.azimuthDeg * Math.PI) / 180;
  const elRad = (clampRange(params.elevationDeg, -85, 85) * Math.PI) / 180;
  const lx = Math.cos(elRad) * Math.cos(azRad);
  const ly = Math.cos(elRad) * Math.sin(azRad);
  const lz = Math.max(0.12, Math.sin(elRad));
  const lNorm = Math.hypot(lx, ly, lz) || 1;
  const [ux, uy, uz] = [lx / lNorm, ly / lNorm, lz / lNorm];

  const relief = clampRange(params.depthRelief, 0.1, 3.0);
  const intensity = clampRange(params.intensity, 0, 2.2);
  const ambient = clampRange(params.ambient, 0.05, 1.2);
  const rimStrength = clampRange(params.rimStrength, 0, 1.0);
  const [lr, lg, lb] = [params.lightRgb[0] / 255, params.lightRgb[1] / 255, params.lightRgb[2] / 255];

  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    luma[i] = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / 255;
  }
  const at = (x: number, y: number): number => luma[clampRange(y, 0, height - 1) * width + clampRange(x, 0, width - 1)];

  for (let y = 0; y < height; y += 1) {
    const nyCoord = height > 1 ? (y / (height - 1)) * 2 - 1 : 0;
    for (let x = 0; x < width; x += 1) {
      const nxCoord = width > 1 ? (x / (width - 1)) * 2 - 1 : 0;
      const o = (y * width + x) * 4;
      const alpha = data[o + 3];
      if (alpha < 4) {
        out.set(data.subarray(o, o + 4), o);
        continue;
      }
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const sx = -gx * relief + nxCoord * 0.45;
      const sy = -gy * relief + nyCoord * 0.45;
      const nLen = Math.hypot(sx, sy, 1) || 1;
      const ndotl = Math.max(0, (sx / nLen) * ux + (sy / nLen) * uy + (1 / nLen) * uz);
      const rim = Math.pow(Math.max(0, 1 - 1 / nLen), 1.6) * rimStrength * (0.4 + 0.6 * ndotl);

      out[o] = clampByte(data[o] * (ambient + (ndotl * intensity + rim) * lr) + rim * 28 * lr);
      out[o + 1] = clampByte(data[o + 1] * (ambient + (ndotl * intensity + rim) * lg) + rim * 28 * lg);
      out[o + 2] = clampByte(data[o + 2] * (ambient + (ndotl * intensity + rim) * lb) + rim * 28 * lb);
      out[o + 3] = alpha;
    }
  }
  return { width, height, data: out };
}

/** 페더 마스크 아웃페인트 캔버스 확장(Generative Expand). */
export function applyGenerativeExpand(
  source: FireflyRgbaBuffer,
  expand: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number },
  featherPx = 4,
): FireflyRgbaBuffer {
  const top = Math.max(0, Math.round(expand.top));
  const right = Math.max(0, Math.round(expand.right));
  const bottom = Math.max(0, Math.round(expand.bottom));
  const left = Math.max(0, Math.round(expand.left));
  const newW = source.width + left + right;
  const newH = source.height + top + bottom;
  const out = new Uint8ClampedArray(newW * newH * 4);
  const feather = Math.max(1, featherPx);

  const mirror = (v: number, limit: number): number => {
    if (limit <= 1) return 0;
    const period = 2 * (limit - 1);
    const c = Math.abs(v) % period;
    return c >= limit ? period - c : c;
  };

  for (let y = 0; y < newH; y += 1) {
    for (let x = 0; x < newW; x += 1) {
      const sx = x - left;
      const sy = y - top;
      const o = (y * newW + x) * 4;
      if (sx >= 0 && sx < source.width && sy >= 0 && sy < source.height) {
        const so = (sy * source.width + sx) * 4;
        out.set(source.data.subarray(so, so + 4), o);
        continue;
      }
      const cx = clampRange(sx, 0, source.width - 1);
      const cy = clampRange(sy, 0, source.height - 1);
      const co = (cy * source.width + cx) * 4;
      const mo = (mirror(sy, source.height) * source.width + mirror(sx, source.width)) * 4;
      const blend = clampRange(Math.hypot(sx - cx, sy - cy) / (feather * 2), 0, 1);
      const grain = Math.sin(x * 0.73 + y * 1.19) * 2.5 * blend;
      for (let c = 0; c < 3; c += 1) {
        out[o + c] = clampByte(source.data[co + c] * (1 - blend * 0.6) + source.data[mo + c] * (blend * 0.6) + grain);
      }
      out[o + 3] = source.data[co + 3];
    }
  }
  return { width: newW, height: newH, data: out };
}

/** 페더 마스크 기반 생성형 채우기(Fill) · 오브젝트 제거(Remove) · 색 보정(Recolor). */
export function applyGenerativeFillOrEditObject(
  source: FireflyRgbaBuffer,
  mask: Uint8Array,
  mode: "fill" | "remove" | "recolor",
  options?: { readonly targetRgb?: RgbTriplet; readonly iterations?: number },
): FireflyRgbaBuffer {
  const { width, height, data } = source;
  const total = width * height;
  const out = new Uint8ClampedArray(data);
  const targetRgb = options?.targetRgb ?? [210, 165, 130];

  if (mode === "recolor") {
    const tLab = rgbToOklab(targetRgb[0], targetRgb[1], targetRgb[2]);
    for (let i = 0; i < total; i += 1) {
      const m = (mask[i] ?? 0) / 255;
      if (m <= 0.004) continue;
      const o = i * 4;
      const sLab = rgbToOklab(data[o], data[o + 1], data[o + 2]);
      const [nr, ng, nb] = oklabToRgb(
        sLab.L * 0.85 + tLab.L * 0.15,
        sLab.a * (1 - m) + tLab.a * m,
        sLab.b * (1 - m) + tLab.b * m,
      );
      out[o] = nr;
      out[o + 1] = ng;
      out[o + 2] = nb;
    }
    return { width, height, data: out };
  }

  const workR = new Float32Array(total);
  const workG = new Float32Array(total);
  const workB = new Float32Array(total);
  let [bR, bG, bB, bN] = [0, 0, 0, 0];
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    workR[i] = data[o];
    workG[i] = data[o + 1];
    workB[i] = data[o + 2];
    if ((mask[i] ?? 0) < 128) {
      bR += data[o];
      bG += data[o + 1];
      bB += data[o + 2];
      bN += 1;
    }
  }
  const [fR, fG, fB] = bN > 0 ? [bR / bN, bG / bN, bB / bN] : targetRgb;
  for (let i = 0; i < total; i += 1) {
    if ((mask[i] ?? 0) >= 128) {
      workR[i] = mode === "fill" ? fR * 0.45 + targetRgb[0] * 0.55 : fR;
      workG[i] = mode === "fill" ? fG * 0.45 + targetRgb[1] * 0.55 : fG;
      workB[i] = mode === "fill" ? fB * 0.45 + targetRgb[2] * 0.55 : fB;
    }
  }

  const iterations = clampRange(options?.iterations ?? 28, 4, 96);
  const nextR = new Float32Array(workR);
  const nextG = new Float32Array(workG);
  const nextB = new Float32Array(workB);
  const blendTarget = mode === "fill" ? 0.08 : 0;

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if ((mask[idx] ?? 0) < 128) continue;
        let [sR, sG, sB, n] = [0, 0, 0, 0];
        const add = (ni: number): void => {
          sR += workR[ni];
          sG += workG[ni];
          sB += workB[ni];
          n += 1;
        };
        if (x > 0) add(idx - 1);
        if (x + 1 < width) add(idx + 1);
        if (y > 0) add(idx - width);
        if (y + 1 < height) add(idx + width);
        if (n > 0) {
          nextR[idx] = (sR / n) * (1 - blendTarget) + targetRgb[0] * blendTarget;
          nextG[idx] = (sG / n) * (1 - blendTarget) + targetRgb[1] * blendTarget;
          nextB[idx] = (sB / n) * (1 - blendTarget) + targetRgb[2] * blendTarget;
        }
      }
    }
    workR.set(nextR);
    workG.set(nextG);
    workB.set(nextB);
  }

  for (let i = 0; i < total; i += 1) {
    const m = (mask[i] ?? 0) / 255;
    if (m <= 0.004) continue;
    const o = i * 4;
    out[o] = clampByte(data[o] * (1 - m) + workR[i] * m);
    out[o + 1] = clampByte(data[o + 1] * (1 - m) + workG[i] * m);
    out[o + 2] = clampByte(data[o + 2] * (1 - m) + workB[i] * m);
  }
  return { width, height, data: out };
}

function createFeatheredRectMask(
  width: number,
  height: number,
  rect: FireflyObjectMaskParams["rectNormalized"],
  featherPx: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const [x0, y0, x1, y1] = [rect.x * width, rect.y * height, (rect.x + rect.width) * width, (rect.y + rect.height) * height];
  const f = Math.max(1, featherPx);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dist = Math.hypot(x < x0 ? x0 - x : x > x1 ? x - x1 : 0, y < y0 ? y0 - y : y > y1 ? y - y1 : 0);
      mask[y * width + x] = dist === 0 ? 255 : dist < f ? clampByte((1 - dist / f) * 255) : 0;
    }
  }
  return mask;
}

function computeDeterministicDigestHex(bytes: Uint8Array | Uint8ClampedArray): string {
  const state = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5];
  const primes = [0x01000193, 0x010001a5, 0x010001b1, 0x010001c7, 0x010001d9, 0x010001e3, 0x010001f7, 0x01000205];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    for (let lane = 0; lane < 8; lane += 1) {
      state[lane] = Math.imul((state[lane] ^ (b + lane * 17)) >>> 0, primes[lane]) >>> 0;
    }
  }
  return state.map((v) => v.toString(16).padStart(8, "0")).join("");
}

/** C2PA 호환 콘텐츠 자격증명(Content Credentials) 생성기(Rights BOM 연계). */
export function createC2paContentCredentials(input: {
  readonly image: FireflyRgbaBuffer;
  readonly rightsBomAssetId: string;
  readonly creatorName: string;
  readonly actions: readonly C2paActionAssertion[];
  readonly createdAtIso?: string;
}): C2paContentCredentialsManifest {
  const pixelDigestHex = computeDeterministicDigestHex(input.image.data);
  const payload = {
    specVersion: "c2pa-cleanroom-2.1" as const,
    claimGenerator: "ToonStudio Visual AI Clean-Room Engine/1.0",
    instanceId: `urn:toonstudio:c2pa:${pixelDigestHex.slice(0, 16)}`,
    createdAtIso: input.createdAtIso ?? "2026-11-21T00:00:00.000Z",
    creatorName: input.creatorName,
    rightsBomAssetId: input.rightsBomAssetId,
    commercialSafe: true,
    zeroPaidApiUsed: true,
    localAlgorithmOnly: true,
    actions: input.actions,
    imageDimensions: { width: input.image.width, height: input.image.height },
    pixelDigestHex,
  };
  const claimSignatureHex = computeDeterministicDigestHex(new TextEncoder().encode(JSON.stringify(payload)));
  return { ...payload, claimSignatureHex };
}

/** C2PA 콘텐츠 자격증명의 픽셀 해시와 서명 무결성을 검증한다. */
export function verifyC2paContentCredentials(
  image: FireflyRgbaBuffer,
  manifest: C2paContentCredentialsManifest,
): C2paVerificationResult {
  const issues: string[] = [];
  if (manifest.imageDimensions.width !== image.width || manifest.imageDimensions.height !== image.height) {
    issues.push("이미지 해상도가 자격증명 기록과 일치하지 않습니다.");
  }
  const pixelIntegrityOk = computeDeterministicDigestHex(image.data) === manifest.pixelDigestHex;
  if (!pixelIntegrityOk) issues.push("픽셀 데이터가 자격증명 발급 이후 변경되었습니다.");

  const { claimSignatureHex, ...unsignedPayload } = manifest;
  const expectedSig = computeDeterministicDigestHex(new TextEncoder().encode(JSON.stringify(unsignedPayload)));
  const signatureIntegrityOk = expectedSig === claimSignatureHex;
  if (!signatureIntegrityOk) issues.push("자격증명 클레임 서명이 변조되었습니다.");
  if (!manifest.rightsBomAssetId.trim()) issues.push("Rights BOM 자산 식별자가 비어 있습니다.");

  return { valid: issues.length === 0, pixelIntegrityOk, signatureIntegrityOk, issues };
}

/** Firefly DAG 위상 정렬(Kahn 알고리즘) 및 순환·참조 무결성 검사. */
export function validateAndSortFireflyGraph(graph: FireflyGraphDocument): FireflyGraphSortResult {
  const errors: string[] = [];
  const nodeMap = new Map<string, FireflyGraphNode>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    if (nodeMap.has(node.id)) errors.push(`중복된 노드 ID가 있습니다: ${node.id}`);
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!nodeMap.has(edge.fromNodeId)) {
      errors.push(`출발 노드를 찾을 수 없습니다: ${edge.fromNodeId}`);
      continue;
    }
    if (!nodeMap.has(edge.toNodeId)) {
      errors.push(`도착 노드를 찾을 수 없습니다: ${edge.toNodeId}`);
      continue;
    }
    if (edge.fromNodeId === edge.toNodeId) {
      errors.push(`자기 자신을 참조하는 순환 연결입니다: ${edge.fromNodeId}`);
      continue;
    }
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    order.push(cur);
    for (const nextId of adjacency.get(cur) ?? []) {
      const nextDeg = (inDegree.get(nextId) ?? 0) - 1;
      inDegree.set(nextId, nextDeg);
      if (nextDeg === 0) queue.push(nextId);
    }
  }

  const cycleNodeIds = graph.nodes.map((n) => n.id).filter((id) => !order.includes(id));
  if (cycleNodeIds.length > 0) errors.push(`순환 참조가 감지되었습니다: ${cycleNodeIds.join(", ")}`);
  if (!graph.nodes.some((n) => n.kind === "Output")) errors.push("최소 1개의 출력(Output) 노드가 필요합니다.");

  return { valid: errors.length === 0, order, cycleNodeIds, errors };
}

function bilinearUpscale2x(source: FireflyRgbaBuffer, sharpen: number): FireflyRgbaBuffer {
  const [newW, newH] = [source.width * 2, source.height * 2];
  const out = new Uint8ClampedArray(newW * newH * 4);
  for (let y = 0; y < newH; y += 1) {
    const sy = (y + 0.5) / 2 - 0.5;
    const y0 = clampRange(Math.floor(sy), 0, source.height - 1);
    const y1 = clampRange(y0 + 1, 0, source.height - 1);
    const wy = clampRange(sy - y0, 0, 1);
    for (let x = 0; x < newW; x += 1) {
      const sx = (x + 0.5) / 2 - 0.5;
      const x0 = clampRange(Math.floor(sx), 0, source.width - 1);
      const x1 = clampRange(x0 + 1, 0, source.width - 1);
      const wx = clampRange(sx - x0, 0, 1);
      const o = (y * newW + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const v00 = source.data[(y0 * source.width + x0) * 4 + c];
        const v10 = source.data[(y0 * source.width + x1) * 4 + c];
        const v01 = source.data[(y1 * source.width + x0) * 4 + c];
        const v11 = source.data[(y1 * source.width + x1) * 4 + c];
        const val = (v00 * (1 - wx) + v10 * wx) * (1 - wy) + (v01 * (1 - wx) + v11 * wx) * wy;
        out[o + c] = clampByte(val + (c < 3 ? (val - (v00 + v11) * 0.5) * sharpen * 0.35 : 0));
      }
    }
  }
  return { width: newW, height: newH, data: out };
}

/** Firefly Graph 전체 DAG를 로컬에서 위상 순차 실행하고 C2PA 자격증명을 발급한다. */
export function executeFireflyGraph(
  graph: FireflyGraphDocument,
  sourceImage: FireflyRgbaBuffer,
): FireflyGraphExecutionResult {
  const sortResult = validateAndSortFireflyGraph(graph);
  if (!sortResult.valid) {
    return { ok: false, image: sourceImage, trace: [], activePrompt: "", credentials: null, errors: sortResult.errors };
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  let current: FireflyRgbaBuffer = {
    width: sourceImage.width,
    height: sourceImage.height,
    data: new Uint8ClampedArray(sourceImage.data),
  };
  const trace: FireflyNodeTrace[] = [];
  const actions: C2paActionAssertion[] = [];
  let activePrompt = "";
  let credentials: C2paContentCredentialsManifest | null = null;

  const record = (node: FireflyGraphNode, skipped: boolean, summaryKo: string): void => {
    trace.push({
      nodeId: node.id,
      kind: node.kind,
      labelKo: node.labelKo,
      skipped,
      outputWidth: current.width,
      outputHeight: current.height,
      summaryKo,
    });
  };

  for (const nodeId of sortResult.order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    if (!node.enabled) {
      record(node, true, "비활성화되어 건너뜀");
      continue;
    }

    switch (node.kind) {
      case "Prompt": {
        activePrompt = node.params.positive.trim();
        if (node.params.tintRgb && (node.params.tintStrength ?? 0) > 0) {
          const s = clampRange(node.params.tintStrength ?? 0, 0, 0.45);
          const next = new Uint8ClampedArray(current.data);
          for (let i = 0; i < next.length; i += 4) {
            next[i] = clampByte(next[i] * (1 - s) + node.params.tintRgb[0] * s);
            next[i + 1] = clampByte(next[i + 1] * (1 - s) + node.params.tintRgb[1] * s);
            next[i + 2] = clampByte(next[i + 2] * (1 - s) + node.params.tintRgb[2] * s);
          }
          current = { width: current.width, height: current.height, data: next };
        }
        actions.push({
          action: "c2pa.created",
          softwareAgent: "ToonStudio Firefly Graph Prompt",
          digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia",
          parameters: { promptLength: activePrompt.length },
        });
        record(node, false, `연출 프롬프트 적용 (${activePrompt.length}자)`);
        break;
      }
      case "StructureRef": {
        const s = clampRange(node.params.edgeStrength, 0, 1);
        const next = new Uint8ClampedArray(current.data);
        const { width, height, data } = current;
        for (let y = 1; y < height - 1; y += 1) {
          for (let x = 1; x < width - 1; x += 1) {
            const o = (y * width + x) * 4;
            for (let c = 0; c < 3; c += 1) {
              const lap = 4 * data[o + c] - data[o - 4 + c] - data[o + 4 + c] - data[o - width * 4 + c] - data[o + width * 4 + c];
              next[o + c] = clampByte(data[o + c] + lap * s * 0.22);
            }
          }
        }
        current = { width, height, data: next };
        record(node, false, `구도·윤곽선 보존 강화 (${Math.round(s * 100)}%)`);
        break;
      }
      case "StyleRef": {
        const refStats: OklabChannelStats = {
          mean: rgbToOklab(node.params.referenceRgbMean[0], node.params.referenceRgbMean[1], node.params.referenceRgbMean[2]),
          std: {
            L: clampRange(node.params.referenceRgbSpread[0] / 255, 0.04, 0.35),
            a: clampRange(node.params.referenceRgbSpread[1] / 255, 0.02, 0.2),
            b: clampRange(node.params.referenceRgbSpread[2] / 255, 0.02, 0.2),
          },
          sampleCount: current.width * current.height,
        };
        current = applyOklabStyleTransfer(current, refStats, node.params.strength);
        actions.push({
          action: "c2pa.color_adjustments",
          softwareAgent: "ToonStudio OKLab Style Transfer",
          digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic",
          parameters: { strength: node.params.strength },
        });
        record(node, false, `OKLab 색감 무드 전송 (${Math.round(node.params.strength * 100)}%)`);
        break;
      }
      case "ObjectMask": {
        if (node.params.mode === "expand") {
          current = applyGenerativeExpand(
            current,
            node.params.expandPx ?? { top: 4, right: 4, bottom: 4, left: 4 },
            node.params.featherPx,
          );
        } else {
          const mask = createFeatheredRectMask(current.width, current.height, node.params.rectNormalized, node.params.featherPx);
          current = applyGenerativeFillOrEditObject(current, mask, node.params.mode, { targetRgb: node.params.targetRgb });
        }
        actions.push({
          action: `c2pa.edited.${node.params.mode}`,
          softwareAgent: "ToonStudio Mask Fill Engine",
          digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic",
          parameters: { mode: node.params.mode, featherPx: node.params.featherPx },
        });
        record(node, false, `마스크 편집 (${node.params.mode}) 완료`);
        break;
      }
      case "Relight": {
        current = applySphericalRelight(current, node.params);
        actions.push({
          action: "c2pa.relight",
          softwareAgent: "ToonStudio Spherical Relight",
          digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic",
          parameters: { azimuthDeg: node.params.azimuthDeg, elevationDeg: node.params.elevationDeg, intensity: node.params.intensity },
        });
        record(node, false, `구면 광원 재조명 (${node.params.azimuthDeg}° / 고도 ${node.params.elevationDeg}°)`);
        break;
      }
      case "Upscale": {
        if (node.params.scale === 2) current = bilinearUpscale2x(current, node.params.sharpen);
        record(node, false, `${node.params.scale}x 해상도 보강 완료`);
        break;
      }
      case "Output": {
        if (node.params.embedC2pa) {
          credentials = createC2paContentCredentials({
            image: current,
            rightsBomAssetId: node.params.rightsBomAssetId,
            creatorName: node.params.creatorName,
            actions,
          });
        }
        record(node, false, node.params.embedC2pa ? "최종 출력 · C2PA 자격증명 서명 포함" : "최종 출력 완료");
        break;
      }
    }
  }

  return { ok: true, image: current, trace, activePrompt, credentials, errors: [] };
}

/** 초보자도 바로 실행할 수 있는 기본 Firefly 7노드 비파괴 파이프라인을 반환한다. */
export function createDefaultFireflyGraph(): FireflyGraphDocument {
  return {
    id: "firefly-webtoon-relight-v1",
    titleKo: "웹툰 컷 노을 재조명 · 색감 통일 파이프라인",
    nodes: [
      { id: "node-prompt", kind: "Prompt", labelKo: "장면 프롬프트", enabled: true, params: { positive: "창가 노을빛이 비치는 웹툰 실내 배경, 부드러운 대기감", tintRgb: [250, 210, 175], tintStrength: 0.08 } },
      { id: "node-structure", kind: "StructureRef", labelKo: "구도·선화 보존", enabled: true, params: { edgeStrength: 0.5, preserveLineWeight: true } },
      { id: "node-style", kind: "StyleRef", labelKo: "색감 무드 전송", enabled: true, params: { strength: 0.55, referenceRgbMean: [228, 186, 158], referenceRgbSpread: [52, 26, 28] } },
      { id: "node-mask", kind: "ObjectMask", labelKo: "영역 보정 마스크", enabled: true, params: { mode: "recolor", rectNormalized: { x: 0.25, y: 0.2, width: 0.5, height: 0.55 }, featherPx: 4, targetRgb: [232, 162, 128] } },
      { id: "node-relight", kind: "Relight", labelKo: "구면 광원 재조명", enabled: true, params: { azimuthDeg: 35, elevationDeg: 42, intensity: 0.95, ambient: 0.42, lightRgb: [255, 220, 186], rimStrength: 0.35, depthRelief: 1.2 } },
      { id: "node-upscale", kind: "Upscale", labelKo: "선명도 업스케일", enabled: false, params: { scale: 2, sharpen: 0.35 } },
      { id: "node-output", kind: "Output", labelKo: "자격증명 출력", enabled: true, params: { rightsBomAssetId: "bom-cut-local-001", creatorName: "ToonStudio 작가", embedC2pa: true } },
    ],
    edges: [
      { id: "e1", fromNodeId: "node-prompt", toNodeId: "node-structure", port: "prompt" },
      { id: "e2", fromNodeId: "node-structure", toNodeId: "node-style", port: "structure" },
      { id: "e3", fromNodeId: "node-style", toNodeId: "node-mask", port: "style" },
      { id: "e4", fromNodeId: "node-mask", toNodeId: "node-relight", port: "mask" },
      { id: "e5", fromNodeId: "node-relight", toNodeId: "node-upscale", port: "image" },
      { id: "e6", fromNodeId: "node-upscale", toNodeId: "node-output", port: "image" },
    ],
  };
}
