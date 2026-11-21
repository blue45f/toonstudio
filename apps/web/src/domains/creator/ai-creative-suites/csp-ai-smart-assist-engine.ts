/**
 * 클립스튜디오(CSP) AI 스마트 어시스트 클린룸 로컬 엔진
 *
 * REA 실증 근거: ev_fdfcf2986498edaa140f587634b97917ca621eff7d792be6c7dd1784606105f9
 * (libailia.dylib arm64 sha256:d38313a26544005d257730abc4586be4b5ea4dbdead98837017929192d40a1fc,
 *  Ghidra 정적 분석, PretrainedWeights/SuperResolution/{x2,x3,x4}[_denoise].caffemodel)
 * 독점 가중치나 외부 API 없이 100% 자체 수학·영상처리 알고리즘으로 구현한다.
 */

export interface CspRgbaBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type SuperResolutionScale = 2 | 3 | 4;
export type ResampleKernelKind = "catmull-rom" | "lanczos3";
export interface SmartSuperResolutionOptions {
  readonly scale: SuperResolutionScale;
  readonly denoise: boolean;
  readonly denoiseStrength?: number;
  readonly kernel?: ResampleKernelKind;
  readonly edgeSharpen?: number;
}
export interface SmartSuperResolutionResult {
  readonly image: CspRgbaBuffer;
  readonly scale: SuperResolutionScale;
  readonly denoiseApplied: boolean;
  readonly kernel: ResampleKernelKind;
  readonly presetCode: string;
  readonly edgeSharpnessScore: number;
}

export interface ShadingAssistOptions {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly lineThreshold?: number;
  readonly celSplitRatio?: number;
  readonly shadowStrength?: number;
  readonly ambientStrength?: number;
  readonly shadowRgb?: readonly [number, number, number];
  readonly ambientRgb?: readonly [number, number, number];
}
export interface ShadingAssistResult {
  readonly shadowLayer: CspRgbaBuffer;
  readonly enclosedPixelCount: number;
  readonly shadowCoverageRatio: number;
  readonly lightVector3d: readonly [number, number, number];
  readonly meanDistancePx: number;
}

export type PoseJointName =
  | "hips" | "spine" | "chest" | "neck" | "head"
  | "leftShoulder" | "leftElbow" | "leftWrist"
  | "rightShoulder" | "rightElbow" | "rightWrist"
  | "leftHip" | "leftKnee" | "leftAnkle"
  | "rightHip" | "rightKnee" | "rightAnkle";

export interface PoseLandmark2D {
  readonly name: PoseJointName;
  readonly x: number;
  readonly y: number;
  readonly visibility?: number;
}
export interface HandFingerLandmark2D {
  readonly finger: "thumb" | "index" | "middle" | "ring" | "pinky";
  readonly mcp: readonly [number, number];
  readonly pip: readonly [number, number];
  readonly tip: readonly [number, number];
}
export interface HumanoidBoneRotationDeg {
  readonly bone: string;
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly rollDeg: number;
  readonly confidence: number;
}
export interface HandFingerCurlSummary {
  readonly finger: HandFingerLandmark2D["finger"];
  readonly curlDeg: number;
  readonly spreadDeg: number;
}
export interface NormalizedPoseRigBridgeResult {
  readonly bones: readonly HumanoidBoneRotationDeg[];
  readonly fingerCurls: readonly HandFingerCurlSummary[];
  readonly torsoScalePx: number;
  readonly validJointCount: number;
  readonly symmetryScore: number;
}

export interface AntiAiProtectionOptions {
  readonly maxDelta?: number;
  readonly seed?: number;
  readonly frequencyCycles?: number;
}
export interface AntiAiProtectionResult {
  readonly protectedImage: CspRgbaBuffer;
  readonly psnrDb: number;
  readonly maxChannelDelta: number;
  readonly meanAbsDelta: number;
  readonly alteredChannelRatio: number;
  readonly protectionCompliant: boolean;
}

const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
const clampRange = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const lumaAt = (data: Uint8ClampedArray, offset: number): number =>
  0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];

function catmullRomWeight(t: number): number {
  const x = Math.abs(t);
  if (x >= 2) return 0;
  return x < 1 ? 1.5 * x * x * x - 2.5 * x * x + 1 : -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
}
function lanczos3Weight(t: number): number {
  const x = Math.abs(t);
  if (x >= 3) return 0;
  if (x < 1e-6) return 1;
  const px = Math.PI * x;
  return (Math.sin(px) / px) * (Math.sin(px / 3) / (px / 3));
}

/** 엣지 보존 바이래터럴 선화 노이즈 제거 필터 (Smart Smoothing / Denoise). */
function applyBilateralDenoise(source: CspRgbaBuffer, strength: number): CspRgbaBuffer {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data.length);
  const s = clampRange(strength, 0.1, 1);
  const inv2Spatial = 1 / (2 * (1.0 + s * 1.1) ** 2);
  const inv2Range = 1 / (2 * (18 + s * 26) ** 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const co = (y * width + x) * 4;
      const [cr, cg, cb] = [data[co], data[co + 1], data[co + 2]];
      let [wSum, rSum, gSum, bSum] = [0, 0, 0, 0];
      for (let dy = -2; dy <= 2; dy += 1) {
        const ny = clampRange(y + dy, 0, height - 1);
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = clampRange(x + dx, 0, width - 1);
          const o = (ny * width + nx) * 4;
          const colorDistSq = (data[o] - cr) ** 2 + (data[o + 1] - cg) ** 2 + (data[o + 2] - cb) ** 2;
          const w = Math.exp(-(dx * dx + dy * dy) * inv2Spatial - colorDistSq * inv2Range);
          wSum += w;
          rSum += data[o] * w;
          gSum += data[o + 1] * w;
          bSum += data[o + 2] * w;
        }
      }
      const inv = wSum > 0 ? 1 / wSum : 1;
      out[co] = clampByte(rSum * inv);
      out[co + 1] = clampByte(gSum * inv);
      out[co + 2] = clampByte(bSum * inv);
      out[co + 3] = data[co + 3];
    }
  }
  return { width, height, data: out };
}

function buildKernelTaps(
  srcSize: number,
  dstSize: number,
  kernel: ResampleKernelKind,
): readonly { readonly indices: readonly number[]; readonly weights: readonly number[] }[] {
  const support = kernel === "lanczos3" ? 3 : 2;
  const weightFn = kernel === "lanczos3" ? lanczos3Weight : catmullRomWeight;
  const scale = srcSize / dstSize;
  const table: { readonly indices: readonly number[]; readonly weights: readonly number[] }[] = [];

  for (let i = 0; i < dstSize; i += 1) {
    const center = (i + 0.5) * scale - 0.5;
    const indices: number[] = [];
    const weights: number[] = [];
    let sum = 0;
    for (let s = Math.floor(center) - support + 1; s <= Math.floor(center) + support; s += 1) {
      const w = weightFn(center - s);
      if (Math.abs(w) < 1e-6) continue;
      indices.push(clampRange(s, 0, srcSize - 1));
      weights.push(w);
      sum += w;
    }
    const inv = sum !== 0 ? 1 / sum : 1;
    table.push({ indices, weights: weights.map((w) => w * inv) });
  }
  return table;
}

function resampleSeparable(
  source: CspRgbaBuffer,
  dstWidth: number,
  dstHeight: number,
  kernel: ResampleKernelKind,
): CspRgbaBuffer {
  const xTaps = buildKernelTaps(source.width, dstWidth, kernel);
  const yTaps = buildKernelTaps(source.height, dstHeight, kernel);
  const temp = new Float32Array(dstWidth * source.height * 4);

  for (let y = 0; y < source.height; y += 1) {
    const rowBase = y * source.width * 4;
    for (let x = 0; x < dstWidth; x += 1) {
      const tap = xTaps[x];
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let k = 0; k < tap.indices.length; k += 1) {
        const w = tap.weights[k];
        const so = rowBase + tap.indices[k] * 4;
        r += source.data[so] * w;
        g += source.data[so + 1] * w;
        b += source.data[so + 2] * w;
        a += source.data[so + 3] * w;
      }
      const dst = (y * dstWidth + x) * 4;
      temp[dst] = r;
      temp[dst + 1] = g;
      temp[dst + 2] = b;
      temp[dst + 3] = a;
    }
  }

  const out = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  for (let y = 0; y < dstHeight; y += 1) {
    const tap = yTaps[y];
    for (let x = 0; x < dstWidth; x += 1) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let k = 0; k < tap.indices.length; k += 1) {
        const w = tap.weights[k];
        const to = (tap.indices[k] * dstWidth + x) * 4;
        r += temp[to] * w;
        g += temp[to + 1] * w;
        b += temp[to + 2] * w;
        a += temp[to + 3] * w;
      }
      const dst = (y * dstWidth + x) * 4;
      out[dst] = clampByte(r);
      out[dst + 1] = clampByte(g);
      out[dst + 2] = clampByte(b);
      out[dst + 3] = clampByte(a);
    }
  }
  return { width: dstWidth, height: dstHeight, data: out };
}

function applyDirectionalEdgeUnsharp(
  source: CspRgbaBuffer,
  amount: number,
): { readonly image: CspRgbaBuffer; readonly sharpnessScore: number } {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  const s = clampRange(amount, 0, 1.2);
  let gradEnergy = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const o = (y * width + x) * 4;
      const gx = Math.abs(lumaAt(data, o + 4) - lumaAt(data, o - 4));
      const gy = Math.abs(lumaAt(data, o + width * 4) - lumaAt(data, o - width * 4));
      gradEnergy += gx + gy;
      const eff = s * clampRange((gx + gy) / 48, 0, 1) * 0.45;
      for (let c = 0; c < 3; c += 1) {
        const blur = (data[o - 4 + c] + data[o + 4 + c] + data[o - width * 4 + c] + data[o + width * 4 + c]) * 0.25;
        out[o + c] = clampByte(data[o + c] + (data[o + c] - blur) * eff);
      }
    }
  }
  return {
    image: { width, height, data: out },
    sharpnessScore: Math.round((gradEnergy / Math.max(1, (width - 2) * (height - 2))) * 100) / 100,
  };
}

/** Smart Smoothing / Super-Resolution (2x / 3x / 4x + Denoise 옵션). */
export function runSmartSuperResolution(
  source: CspRgbaBuffer,
  options: SmartSuperResolutionOptions,
): SmartSuperResolutionResult {
  const kernel: ResampleKernelKind = options.kernel ?? "catmull-rom";
  const prepared = options.denoise ? applyBilateralDenoise(source, options.denoiseStrength ?? 0.65) : source;
  const upscaled = resampleSeparable(prepared, source.width * options.scale, source.height * options.scale, kernel);
  const sharpened = applyDirectionalEdgeUnsharp(upscaled, options.edgeSharpen ?? 0.45);
  return {
    image: sharpened.image,
    scale: options.scale,
    denoiseApplied: options.denoise,
    kernel,
    presetCode: `x${options.scale}${options.denoise ? "_denoise" : ""}`,
    edgeSharpnessScore: sharpened.sharpnessScore,
  };
}

/** Shading Assist: 구면 3D 광원과 닫힌 선화 거리장 기반 2단 셀 섀도 + 앰비언트 음영 RGBA 생성. */
export function computeShadingAssist(lineArt: CspRgbaBuffer, options: ShadingAssistOptions): ShadingAssistResult {
  const { width, height, data } = lineArt;
  const total = width * height;
  const threshold = options.lineThreshold ?? 108;
  const celSplitRatio = clampRange(options.celSplitRatio ?? 0.42, 0.15, 0.85);
  const shadowStrength = clampRange(options.shadowStrength ?? 0.68, 0.1, 1);
  const ambientStrength = clampRange(options.ambientStrength ?? 0.35, 0, 1);
  const shadowRgb = options.shadowRgb ?? [58, 66, 108];
  const ambientRgb = options.ambientRgb ?? [88, 84, 122];

  const isInk = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if (data[i * 4 + 3] >= 24 && lumaAt(data, i * 4) < threshold) isInk[i] = 1;
  }

  const exterior = new Uint8Array(total);
  const queue = new Int32Array(total);
  let [head, tail] = [0, 0];
  const enqueue = (x: number, y: number): void => {
    const idx = y * width + x;
    if (isInk[idx] === 0 && exterior[idx] === 0) {
      exterior[idx] = 1;
      queue[tail] = idx;
      tail += 1;
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (head < tail) {
    const idx = queue[head];
    head += 1;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  const INF = 1e6;
  const dist = new Float32Array(total);
  let enclosedCount = 0;
  for (let i = 0; i < total; i += 1) {
    if (isInk[i] === 0 && exterior[i] === 0) {
      dist[i] = INF;
      enclosedCount += 1;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (dist[idx] === 0) continue;
      let d = dist[idx];
      if (x > 0) d = Math.min(d, dist[idx - 1] + 1);
      if (y > 0) d = Math.min(d, dist[idx - width] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dist[idx - width - 1] + 1.414);
      if (x + 1 < width && y > 0) d = Math.min(d, dist[idx - width + 1] + 1.414);
      dist[idx] = d;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const idx = y * width + x;
      if (dist[idx] === 0) continue;
      let d = dist[idx];
      if (x + 1 < width) d = Math.min(d, dist[idx + 1] + 1);
      if (y + 1 < height) d = Math.min(d, dist[idx + width] + 1);
      if (x + 1 < width && y + 1 < height) d = Math.min(d, dist[idx + width + 1] + 1.414);
      if (x > 0 && y + 1 < height) d = Math.min(d, dist[idx + width - 1] + 1.414);
      dist[idx] = d;
    }
  }

  let [maxDist, distSum] = [1, 0];
  for (let i = 0; i < total; i += 1) {
    if (dist[i] > 0 && dist[i] < INF) {
      if (dist[i] > maxDist) maxDist = dist[i];
      distSum += dist[i];
    }
  }

  const azRad = (options.azimuthDeg * Math.PI) / 180;
  const elRad = (clampRange(options.elevationDeg, 5, 85) * Math.PI) / 180;
  const [lx, ly, lz] = [Math.cos(elRad) * Math.cos(azRad), Math.cos(elRad) * Math.sin(azRad), Math.sin(elRad)];
  const lLen = Math.hypot(lx, ly, lz) || 1;
  const [ux, uy, uz] = [lx / lLen, ly / lLen, lz / lLen];

  const shadowLayer = new Uint8ClampedArray(total * 4);
  let shadowedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (dist[idx] <= 0 || dist[idx] >= INF) continue;
      const gx = ((x + 1 < width ? dist[idx + 1] : 0) - (x > 0 ? dist[idx - 1] : 0)) * 0.5;
      const gy = ((y + 1 < height ? dist[idx + width] : 0) - (y > 0 ? dist[idx - width] : 0)) * 0.5;
      const normDist = dist[idx] / maxDist;
      const nz = Math.max(0.25, Math.sqrt(Math.max(0.05, normDist)) * 1.45);
      const nLen = Math.hypot(-gx, -gy, nz) || 1;
      const dot = (-gx / nLen) * ux + (-gy / nLen) * uy + (nz / nLen) * uz;
      const celFactor = dot < celSplitRatio * 0.6 ? 1.0 : dot < celSplitRatio ? 0.55 : 0;
      const creviceAo = Math.pow(clampRange(1 - normDist * 1.5, 0, 1), 1.8) * ambientStrength;
      const alphaNorm = clampRange(celFactor * shadowStrength + creviceAo * 0.65, 0, 0.92);
      if (alphaNorm > 0.05) {
        shadowedPixels += 1;
        const o = idx * 4;
        const cw = celFactor > 0 ? 0.72 : 0.25;
        shadowLayer[o] = clampByte(shadowRgb[0] * cw + ambientRgb[0] * (1 - cw));
        shadowLayer[o + 1] = clampByte(shadowRgb[1] * cw + ambientRgb[1] * (1 - cw));
        shadowLayer[o + 2] = clampByte(shadowRgb[2] * cw + ambientRgb[2] * (1 - cw));
        shadowLayer[o + 3] = clampByte(alphaNorm * 255);
      }
    }
  }

  return {
    shadowLayer: { width, height, data: shadowLayer },
    enclosedPixelCount: enclosedCount,
    shadowCoverageRatio: enclosedCount > 0 ? Math.round((shadowedPixels / enclosedCount) * 1000) / 1000 : 0,
    lightVector3d: [Math.round(ux * 1000) / 1000, Math.round(uy * 1000) / 1000, Math.round(uz * 1000) / 1000],
    meanDistancePx: enclosedCount > 0 ? Math.round((distSum / enclosedCount) * 100) / 100 : 0,
  };
}

/** Pose / Hand Scanner 브리지: 2D 관절 랜드마크 → 3D 휴머노이드 본 회전각 정규화. */
export function normalizePoseAndHandLandmarks(
  landmarks: readonly PoseLandmark2D[],
  hands: readonly HandFingerLandmark2D[] = [],
): NormalizedPoseRigBridgeResult {
  const map = new Map<PoseJointName, PoseLandmark2D>();
  let validJointCount = 0;
  for (const lm of landmarks) {
    if (Number.isFinite(lm.x) && Number.isFinite(lm.y) && (lm.visibility ?? 1) >= 0.2) {
      map.set(lm.name, lm);
      validJointCount += 1;
    }
  }

  const hips = map.get("hips");
  const neck = map.get("neck") ?? map.get("chest");
  const torsoScalePx = hips && neck ? Math.max(12, Math.hypot(neck.x - hips.x, neck.y - hips.y)) : 100;

  const specs: readonly (readonly [string, PoseJointName, PoseJointName, number, number, number])[] = [
    ["Spine", "hips", "chest", -90, 45, 35],
    ["Head", "neck", "head", -90, 55, 40],
    ["LeftUpperArm", "leftShoulder", "leftElbow", 145, 120, 150],
    ["LeftLowerArm", "leftElbow", "leftWrist", 145, 135, 145],
    ["RightUpperArm", "rightShoulder", "rightElbow", 35, 120, 150],
    ["RightLowerArm", "rightElbow", "rightWrist", 35, 135, 145],
    ["LeftUpperLeg", "leftHip", "leftKnee", 90, 115, 60],
    ["LeftLowerLeg", "leftKnee", "leftAnkle", 90, 130, 30],
    ["RightUpperLeg", "rightHip", "rightKnee", 90, 115, 60],
    ["RightLowerLeg", "rightKnee", "rightAnkle", 90, 130, 30],
  ];

  const bones: HumanoidBoneRotationDeg[] = [];
  for (const [bone, from, to, restDeg, maxPitch, maxRoll] of specs) {
    const a = map.get(from);
    const b = map.get(to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let deltaRoll = (Math.atan2(dy, dx) * 180) / Math.PI - restDeg;
    while (deltaRoll > 180) deltaRoll -= 360;
    while (deltaRoll < -180) deltaRoll += 360;
    const ratio = clampRange(Math.hypot(dx, dy) / Math.max(8, torsoScalePx * 0.48), 0.2, 1);
    const pitch = ((Math.acos(ratio) * 180) / Math.PI) * 0.55;
    bones.push({
      bone,
      pitchDeg: Math.round(clampRange(pitch, -maxPitch, maxPitch) * 10) / 10,
      yawDeg: Math.round(clampRange((dx >= 0 ? 1 : -1) * (1 - ratio) * 24, -45, 45) * 10) / 10,
      rollDeg: Math.round(clampRange(deltaRoll, -maxRoll, maxRoll) * 10) / 10,
      confidence: Math.round(Math.min(a.visibility ?? 1, b.visibility ?? 1) * 100) / 100,
    });
  }

  const fingerCurls: HandFingerCurlSummary[] = hands.map((hand) => {
    const [v1x, v1y] = [hand.pip[0] - hand.mcp[0], hand.pip[1] - hand.mcp[1]];
    const [v2x, v2y] = [hand.tip[0] - hand.pip[0], hand.tip[1] - hand.pip[1]];
    const denom = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1;
    const bendDeg = (Math.acos(clampRange((v1x * v2x + v1y * v2y) / denom, -1, 1)) * 180) / Math.PI;
    return {
      finger: hand.finger,
      curlDeg: Math.round(clampRange(bendDeg, 0, 110) * 10) / 10,
      spreadDeg: Math.round(clampRange((Math.atan2(v1y, v1x) * 180) / Math.PI, -45, 45) * 10) / 10,
    };
  });

  const [ls, le, rs, re] = [map.get("leftShoulder"), map.get("leftElbow"), map.get("rightShoulder"), map.get("rightElbow")];
  let symmetryScore = 1;
  if (ls && le && rs && re) {
    const lLen = Math.hypot(le.x - ls.x, le.y - ls.y);
    const rLen = Math.hypot(re.x - rs.x, re.y - rs.y);
    symmetryScore = Math.round((1 - Math.abs(lLen - rLen) / Math.max(lLen, rLen, 1)) * 1000) / 1000;
  }

  return { bones, fingerCurls, torsoScalePx: Math.round(torsoScalePx * 10) / 10, validJointCount, symmetryScore };
}

/** Anti-AI Scraping Protection: 육안 열화 최소(|ΔRGB| <= 3, PSNR > 38 dB) 미세 주파수 보호 필터. */
export function applyAntiAiScrapingProtection(
  source: CspRgbaBuffer,
  options?: AntiAiProtectionOptions,
): AntiAiProtectionResult {
  const { width, height, data } = source;
  const maxDelta = clampRange(Math.round(options?.maxDelta ?? 3), 1, 3);
  const seed = options?.seed ?? 20261121;
  const freq = clampRange(options?.frequencyCycles ?? 2.35, 1.0, 4.0);
  const out = new Uint8ClampedArray(data.length);

  let [sqErr, absErr, obsMax, altered] = [0, 0, 0, 0];
  const totalRgb = width * height * 3;
  const phaseX = ((seed & 0xff) / 255) * Math.PI * 2;
  const phaseY = (((seed >>> 8) & 0xff) / 255) * Math.PI * 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      out[o + 3] = data[o + 3];
      if (data[o + 3] < 8) {
        out[o] = data[o];
        out[o + 1] = data[o + 1];
        out[o + 2] = data[o + 2];
        continue;
      }
      const leftO = (y * width + Math.max(0, x - 1)) * 4;
      const upO = (Math.max(0, y - 1) * width + x) * 4;
      const contrast = Math.abs(lumaAt(data, o) - lumaAt(data, leftO)) + Math.abs(lumaAt(data, o) - lumaAt(data, upO));
      const gain = contrast > 12 ? 1.0 : 0.62;
      const waves = [
        Math.sin(x * freq + y * (freq * 0.67) + phaseX),
        Math.cos(x * (freq * 0.71) - y * freq + phaseY),
        Math.sin((x + y) * (freq * 1.13) + phaseX * 0.5),
      ];
      for (let c = 0; c < 3; c += 1) {
        const delta = clampRange(Math.round(waves[c] * maxDelta * gain), -maxDelta, maxDelta);
        const nextVal = clampByte(data[o + c] + delta);
        const actual = nextVal - data[o + c];
        out[o + c] = nextVal;
        const absD = Math.abs(actual);
        if (absD > obsMax) obsMax = absD;
        if (absD > 0) altered += 1;
        absErr += absD;
        sqErr += actual * actual;
      }
    }
  }

  const mse = totalRgb > 0 ? sqErr / totalRgb : 0;
  const psnrDb = mse <= 1e-9 ? 99.99 : Math.round(10 * Math.log10((255 * 255) / mse) * 100) / 100;
  return {
    protectedImage: { width, height, data: out },
    psnrDb,
    maxChannelDelta: obsMax,
    meanAbsDelta: totalRgb > 0 ? Math.round((absErr / totalRgb) * 1000) / 1000 : 0,
    alteredChannelRatio: totalRgb > 0 ? Math.round((altered / totalRgb) * 1000) / 1000 : 0,
    protectionCompliant: obsMax <= 3 && psnrDb > 38,
  };
}

/** 기본 휴머노이드 2D 포즈 + 손가락 랜드마크 샘플을 반환한다. */
export function createSamplePoseAndHandLandmarks(): {
  readonly pose: readonly PoseLandmark2D[];
  readonly hands: readonly HandFingerLandmark2D[];
} {
  return {
    pose: [
      { name: "hips", x: 120, y: 150, visibility: 0.98 },
      { name: "chest", x: 120, y: 100, visibility: 0.98 },
      { name: "neck", x: 120, y: 84, visibility: 0.97 },
      { name: "head", x: 122, y: 54, visibility: 0.96 },
      { name: "leftShoulder", x: 96, y: 94, visibility: 0.95 },
      { name: "leftElbow", x: 76, y: 124, visibility: 0.94 },
      { name: "leftWrist", x: 64, y: 154, visibility: 0.91 },
      { name: "rightShoulder", x: 144, y: 94, visibility: 0.95 },
      { name: "rightElbow", x: 168, y: 118, visibility: 0.94 },
      { name: "rightWrist", x: 188, y: 102, visibility: 0.92 },
      { name: "leftHip", x: 106, y: 154, visibility: 0.96 },
      { name: "leftKnee", x: 102, y: 204, visibility: 0.95 },
      { name: "leftAnkle", x: 100, y: 252, visibility: 0.93 },
      { name: "rightHip", x: 134, y: 154, visibility: 0.96 },
      { name: "rightKnee", x: 140, y: 204, visibility: 0.95 },
      { name: "rightAnkle", x: 144, y: 252, visibility: 0.93 },
    ],
    hands: [
      { finger: "thumb", mcp: [0, 0], pip: [12, -10], tip: [22, -14] },
      { finger: "index", mcp: [0, 0], pip: [2, -18], tip: [6, -32] },
      { finger: "middle", mcp: [0, 0], pip: [0, -20], tip: [4, -34] },
      { finger: "ring", mcp: [0, 0], pip: [-4, -18], tip: [-12, -26] },
      { finger: "pinky", mcp: [0, 0], pip: [-8, -14], tip: [-18, -18] },
    ],
  };
}
