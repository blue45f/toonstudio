/**
 * Wave-39: 표면 곡률 유도 만화 펜 크로스해칭(Curvature-Guided Cross-Hatching) 및
 * 광원·실루엣·깊이 반응형 동적 선굵기 변조(Dynamic Line-Weight Modulation) 커널.
 *
 * 표면 주곡률 접선장(Principal Curvature Tangent Field)과 명암 암부 농도(0..1)를 따라
 * 1단 평행 해칭, 2단 직교 크로스해칭, 3단 심부 밀집 먹선을 유기적인 시작·끝 필압 테이퍼로 생성하고,
 * 기존 벡터 선화의 외곽·내부 선굵기를 주광원 방향은 날렵하게, 그림자·실루엣·전경은 힘 있게 변조한다.
 */

export type CrossHatchTier = 1 | 2 | 3;
export type ObservedCrossHatchTier = 0 | CrossHatchTier;

export interface SurfaceCurvatureToneField {
  readonly width: number;
  readonly height: number;
  readonly pixelStepPx?: number;
  /** 명암 암부 농도 [0..1]: 0 = 밝은 하이라이트(여백), 1 = 가장 깊은 핵심 암부 */
  readonly darknessField: Float32Array | readonly number[];
  readonly tangentX: Float32Array | readonly number[];
  readonly tangentY: Float32Array | readonly number[];
  readonly curvatureMagnitude?: Float32Array | readonly number[];
  /** 선택적 먹선 허용 마스크 [0..1]: 0.5 미만 구간(말풍선·안광 등)은 해칭 생성 차단 */
  readonly mask?: Float32Array | readonly number[];
}

export interface CurvatureCrossHatchOptions {
  readonly pixelStepPx?: number;
  readonly tier1MinDarkness?: number;
  readonly tier2MinDarkness?: number;
  readonly tier3MinDarkness?: number;
  readonly baseSpacingPx?: number;
  readonly maxStrokeLengthPx?: number;
  readonly minStrokeLengthPx?: number;
  readonly stepSizePx?: number;
  readonly baseNibWidthPx?: number;
  /** 2단 크로스해칭 교차 각도(deg, 기본값 90 = 직교) */
  readonly crossAngleDeg?: number;
  /** 3단 심부 보조 해칭 각도(deg, 기본값 45) */
  readonly tier3AngleDeg?: number;
  readonly entryTaperRatio?: number;
  readonly exitTaperRatio?: number;
  readonly tipFloorRatio?: number;
  readonly jitterAmountPx?: number;
  readonly seed?: number;
}

export interface CrossHatchStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly u: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly localDarkness: number;
  readonly taperFactor: number;
  readonly widthPx: number;
}

export interface CrossHatchInkStroke {
  readonly id: string;
  readonly tier: CrossHatchTier;
  readonly arcLengthPx: number;
  readonly meanDarkness: number;
  readonly samples: readonly CrossHatchStrokeSample[];
}

export interface CurvatureCrossHatchResult {
  readonly strokes: readonly CrossHatchInkStroke[];
  readonly tierStrokeCounts: { readonly tier1: number; readonly tier2: number; readonly tier3: number };
  readonly maxObservedTier: ObservedCrossHatchTier;
  readonly meanTangentAlignmentCosine: number;
  readonly meanTier1ToTier2OrthogonalitySin: number;
  readonly meanEndToMidTaperRatio: number;
  readonly inkCoverageEstimate01: number;
}

export interface VectorInkEdgeSample {
  readonly x: number;
  readonly y: number;
  readonly baseWidthPx: number;
  readonly edgeNormalX: number;
  readonly edgeNormalY: number;
  readonly edgeNormalZ?: number;
  /** 카메라 깊이(m): 작을수록 전경, 클수록 원경 */
  readonly zDepthMeters?: number;
  readonly ambientOcclusion01?: number;
}

export interface VectorInkEdgeStroke {
  readonly id: string;
  readonly isSilhouette?: boolean;
  readonly isOcclusionCrease?: boolean;
  readonly samples: readonly VectorInkEdgeSample[];
}

export interface InkLightingAndDepthContext {
  readonly keyLightDirX: number;
  readonly keyLightDirY: number;
  readonly keyLightDirZ?: number;
  readonly keyLightIntensity?: number;
  readonly nearDepthMeters?: number;
  readonly farDepthMeters?: number;
}

export interface LineWeightModulationOptions {
  readonly lightThinningStrength?: number;
  readonly shadowThickeningStrength?: number;
  readonly silhouetteBoostRatio?: number;
  readonly foregroundBoostRatio?: number;
  readonly backgroundAttenuationRatio?: number;
  readonly minWidthScale?: number;
  readonly maxWidthScale?: number;
  readonly smoothAlongStroke?: boolean;
}

export interface ModulatedVectorInkSample extends VectorInkEdgeSample {
  readonly ndotl: number;
  readonly widthScale: number;
  readonly modulatedWidthPx: number;
}

export interface ModulatedVectorInkStroke {
  readonly id: string;
  readonly isSilhouette: boolean;
  readonly isOcclusionCrease: boolean;
  readonly samples: readonly ModulatedVectorInkSample[];
  readonly meanWidthScale: number;
}

export interface LineWeightModulationResult {
  readonly strokes: readonly ModulatedVectorInkStroke[];
  readonly meanLitEdgeScale: number;
  readonly meanShadowEdgeScale: number;
  readonly meanSilhouetteScale: number;
  readonly meanForegroundScale: number;
  readonly meanBackgroundScale: number;
  readonly shadowToLitWidthRatio: number;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = Math.imul(state ^ (state >>> 15), 1 | state);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize2D(x: number, y: number): readonly [number, number] {
  const len = Math.hypot(x, y);
  return len > 1e-8 && Number.isFinite(len) ? [x / len, y / len] : [1, 0];
}

function normalize3D(x: number, y: number, z: number): readonly [number, number, number] {
  const len = Math.hypot(x, y, z);
  return len > 1e-8 && Number.isFinite(len) ? [x / len, y / len, z / len] : [0, 0, 1];
}

function rotate2D(x: number, y: number, rad: number): readonly [number, number] {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c - y * s, x * s + y * c];
}

function sampleScalarBilinear(
  arr: Float32Array | readonly number[] | undefined,
  width: number,
  height: number,
  gx: number,
  gy: number,
  fallback: number,
): number {
  if (!arr || arr.length < width * height) return fallback;
  const x = clamp(gx, 0, width - 1);
  const y = clamp(gy, 0, height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const v00 = arr[y0 * width + x0] ?? fallback;
  const v10 = arr[y0 * width + x1] ?? fallback;
  const v01 = arr[y1 * width + x0] ?? fallback;
  const v11 = arr[y1 * width + x1] ?? fallback;
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

/** 비방향성 주곡률 접선장의 ±부호 반전 상쇄를 방지하도록 진행 방향과 부호를 정렬해 보간한다. */
function sampleSignAlignedTangent(
  field: SurfaceCurvatureToneField,
  gx: number,
  gy: number,
  rotRad: number,
  refDir?: readonly [number, number],
): readonly [number, number] {
  const { width, height, tangentX, tangentY } = field;
  const x = clamp(gx, 0, width - 1);
  const y = clamp(gy, 0, height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const readCorner = (cx: number, cy: number): readonly [number, number] => {
    const idx = cy * width + cx;
    const [nx, ny] = normalize2D(tangentX[idx] ?? 1, tangentY[idx] ?? 0);
    return rotate2D(nx, ny, rotRad);
  };

  const c00Raw = readCorner(x0, y0);
  const anchor = refDir ?? c00Raw;
  const align = (v: readonly [number, number]): readonly [number, number] =>
    v[0] * anchor[0] + v[1] * anchor[1] < 0 ? [-v[0], -v[1]] : v;

  const c00 = align(c00Raw);
  const c10 = align(readCorner(x1, y0));
  const c01 = align(readCorner(x0, y1));
  const c11 = align(readCorner(x1, y1));

  const bx = (c00[0] * (1 - tx) + c10[0] * tx) * (1 - ty) + (c01[0] * (1 - tx) + c11[0] * tx) * ty;
  const by = (c00[1] * (1 - tx) + c10[1] * tx) * (1 - ty) + (c01[1] * (1 - tx) + c11[1] * tx) * ty;
  const [ux, uy] = normalize2D(bx, by);
  return refDir && ux * refDir[0] + uy * refDir[1] < 0 ? [-ux, -uy] : [ux, uy];
}

/** 만화용 G펜·마루펜의 비대칭 진입(Entry) 및 끝단 날림(Exit Flick) 필압 테이퍼 곡선을 계산한다. */
export function computeOrganicPenTaperProfile(
  u: number,
  entryRatio = 0.24,
  exitRatio = 0.3,
  tipFloorRatio = 0.14,
): number {
  const pos = clamp01(u);
  const eIn = clamp(entryRatio, 0.04, 0.48);
  const eOut = clamp(exitRatio, 0.04, 0.48);
  const floor = clamp(tipFloorRatio, 0.02, 0.5);
  const envelope =
    pos < eIn
      ? smoothstep01(pos / eIn)
      : pos > 1 - eOut
        ? Math.pow(smoothstep01((1 - pos) / eOut), 1.15)
        : 1;
  return floor + (1 - floor) * envelope;
}

interface RawTracePoint {
  readonly x: number;
  readonly y: number;
  readonly darkness: number;
}

function traceHalfStreamline(
  field: SurfaceCurvatureToneField,
  startX: number,
  startY: number,
  initialDir: readonly [number, number],
  rotRad: number,
  minDarkness: number,
  stepPx: number,
  maxHalfLenPx: number,
  pixelStepPx: number,
): readonly RawTracePoint[] {
  const maxX = Math.max(0, (field.width - 1) * pixelStepPx);
  const maxY = Math.max(0, (field.height - 1) * pixelStepPx);
  const out: RawTracePoint[] = [];
  let px = startX;
  let py = startY;
  let dir = initialDir;
  let traveled = 0;

  while (traveled + stepPx <= maxHalfLenPx + 1e-6) {
    const d1 = sampleSignAlignedTangent(field, px / pixelStepPx, py / pixelStepPx, rotRad, dir);
    const midX = px + d1[0] * stepPx * 0.5;
    const midY = py + d1[1] * stepPx * 0.5;
    if (midX < 0 || midX > maxX || midY < 0 || midY > maxY) break;

    const d2 = sampleSignAlignedTangent(field, midX / pixelStepPx, midY / pixelStepPx, rotRad, d1);
    const nextX = px + d2[0] * stepPx;
    const nextY = py + d2[1] * stepPx;
    if (nextX < 0 || nextX > maxX || nextY < 0 || nextY > maxY) break;

    const nextGx = nextX / pixelStepPx;
    const nextGy = nextY / pixelStepPx;
    const maskVal = sampleScalarBilinear(field.mask, field.width, field.height, nextGx, nextGy, 1);
    const darkVal = clamp01(sampleScalarBilinear(field.darknessField, field.width, field.height, nextGx, nextGy, 0));
    if (maskVal < 0.5 || darkVal < minDarkness * 0.92) break;

    out.push({ x: nextX, y: nextY, darkness: darkVal });
    px = nextX;
    py = nextY;
    dir = d2;
    traveled += stepPx;
  }
  return out;
}

/** 표면 곡률 접선장과 명암 암부 농도(0..1)로부터 0/1/2/3단 만화 펜 크로스해칭 스트로크를 생성한다. */
export function generateCurvatureCrossHatching(
  field: SurfaceCurvatureToneField,
  options: CurvatureCrossHatchOptions = {},
): CurvatureCrossHatchResult {
  const width = Math.max(1, Math.floor(field.width));
  const height = Math.max(1, Math.floor(field.height));
  if (
    field.darknessField.length < width * height ||
    field.tangentX.length < width * height ||
    field.tangentY.length < width * height
  ) {
    throw new RangeError("SurfaceCurvatureToneField 배열 길이가 width * height 보다 작습니다.");
  }

  const pixelStepPx = Math.max(0.25, options.pixelStepPx ?? field.pixelStepPx ?? 1);
  const tier1Min = clamp(options.tier1MinDarkness ?? 0.22, 0.02, 0.9);
  const tier2Min = clamp(options.tier2MinDarkness ?? 0.48, tier1Min + 0.04, 0.95);
  const tier3Min = clamp(options.tier3MinDarkness ?? 0.74, tier2Min + 0.04, 0.99);
  const baseSpacingPx = Math.max(2, options.baseSpacingPx ?? 8);
  const maxStrokeLenPx = Math.max(4, options.maxStrokeLengthPx ?? 28);
  const minStrokeLenPx = Math.max(1.5, options.minStrokeLengthPx ?? 4);
  const stepSizePx = clamp(options.stepSizePx ?? 2, 0.5, maxStrokeLenPx * 0.4);
  const baseNibWidthPx = Math.max(0.2, options.baseNibWidthPx ?? 1.25);
  const crossAngleRad = ((options.crossAngleDeg ?? 90) * Math.PI) / 180;
  const tier3AngleRad = ((options.tier3AngleDeg ?? 45) * Math.PI) / 180;
  const entryRatio = options.entryTaperRatio ?? 0.24;
  const exitRatio = options.exitTaperRatio ?? 0.3;
  const tipFloor = options.tipFloorRatio ?? 0.14;
  const jitterPx = Math.max(0, options.jitterAmountPx ?? 0.35);
  const rng = createMulberry32(options.seed ?? 20261127);

  const canvasW = Math.max(pixelStepPx, (width - 1) * pixelStepPx);
  const canvasH = Math.max(pixelStepPx, (height - 1) * pixelStepPx);
  const tierConfigs: ReadonlyArray<{
    readonly tier: CrossHatchTier;
    readonly minDarkness: number;
    readonly spacingScale: number;
    readonly rotRad: number;
    readonly widthMult: number;
  }> = [
    { tier: 1, minDarkness: tier1Min, spacingScale: 1, rotRad: 0, widthMult: 1 },
    { tier: 2, minDarkness: tier2Min, spacingScale: 0.88, rotRad: crossAngleRad, widthMult: 0.94 },
    { tier: 3, minDarkness: tier3Min, spacingScale: 0.66, rotRad: tier3AngleRad, widthMult: 1.12 },
  ];

  const strokes: CrossHatchInkStroke[] = [];
  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  let alignCosSum = 0;
  let alignCosWeight = 0;
  let orthoSinSum = 0;
  let orthoSinWeight = 0;
  let taperRatioSum = 0;
  let totalInkAreaPx2 = 0;

  for (const cfg of tierConfigs) {
    const cellPx = Math.max(1.5, baseSpacingPx * cfg.spacingScale);
    const cols = Math.max(1, Math.ceil(canvasW / cellPx));
    const rows = Math.max(1, Math.ceil(canvasH / cellPx));

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const seedX = clamp((c + 0.5) * cellPx + (rng() - 0.5) * 2 * jitterPx, 0, canvasW);
        const seedY = clamp((r + 0.5) * cellPx + (rng() - 0.5) * 2 * jitterPx, 0, canvasH);
        const seedGx = seedX / pixelStepPx;
        const seedGy = seedY / pixelStepPx;
        if (sampleScalarBilinear(field.mask, width, height, seedGx, seedGy, 1) < 0.5) continue;

        const seedDarkness = clamp01(sampleScalarBilinear(field.darknessField, width, height, seedGx, seedGy, 0));
        const curvMag = Math.max(0, sampleScalarBilinear(field.curvatureMagnitude, width, height, seedGx, seedGy, 0));
        const effectiveDarkness = clamp01(seedDarkness + curvMag * 0.04);
        if (effectiveDarkness < cfg.minDarkness) continue;

        const seedDir = sampleSignAlignedTangent(field, seedGx, seedGy, cfg.rotRad);
        const halfLen = maxStrokeLenPx * 0.5 * (0.85 + 0.3 * effectiveDarkness);
        const backward = traceHalfStreamline(field, seedX, seedY, [-seedDir[0], -seedDir[1]], cfg.rotRad, cfg.minDarkness, stepSizePx, halfLen, pixelStepPx);
        const forward = traceHalfStreamline(field, seedX, seedY, seedDir, cfg.rotRad, cfg.minDarkness, stepSizePx, halfLen, pixelStepPx);

        const rawPts: RawTracePoint[] = [...[...backward].reverse(), { x: seedX, y: seedY, darkness: seedDarkness }, ...forward];
        if (rawPts.length < 3) continue;

        const cumLen: number[] = [0];
        for (let i = 1; i < rawPts.length; i += 1) {
          const prev = rawPts[i - 1];
          const curr = rawPts[i];
          const prevCum = cumLen[i - 1] ?? 0;
          cumLen.push(prev && curr ? prevCum + Math.hypot(curr.x - prev.x, curr.y - prev.y) : prevCum);
        }
        const arcLen = cumLen[cumLen.length - 1] ?? 0;
        if (arcLen < minStrokeLenPx) continue;

        let darkSum = 0;
        const samples: CrossHatchStrokeSample[] = rawPts.map((pt, idx) => {
          const prev = rawPts[Math.max(0, idx - 1)] ?? pt;
          const next = rawPts[Math.min(rawPts.length - 1, idx + 1)] ?? pt;
          const [tx, ty] = normalize2D(next.x - prev.x, next.y - prev.y);
          const u = arcLen > 1e-6 ? (cumLen[idx] ?? 0) / arcLen : 0.5;
          const taperFactor = computeOrganicPenTaperProfile(u, entryRatio, exitRatio, tipFloor);
          const widthPx = baseNibWidthPx * cfg.widthMult * (0.82 + 0.48 * pt.darkness) * taperFactor;
          darkSum += pt.darkness;

          const baseTan = sampleSignAlignedTangent(field, pt.x / pixelStepPx, pt.y / pixelStepPx, 0);
          if (cfg.tier === 1) {
            alignCosSum += clamp01(Math.abs(tx * baseTan[0] + ty * baseTan[1]));
            alignCosWeight += 1;
          } else if (cfg.tier === 2) {
            orthoSinSum += clamp01(Math.abs(tx * baseTan[1] - ty * baseTan[0]));
            orthoSinWeight += 1;
          }
          return { x: pt.x, y: pt.y, u, tangentX: tx, tangentY: ty, localDarkness: pt.darkness, taperFactor, widthPx };
        });

        const midSample = samples[Math.floor(samples.length * 0.5)];
        const startSample = samples[0];
        const endSample = samples[samples.length - 1];
        if (!midSample || !startSample || !endSample) continue;
        taperRatioSum += midSample.widthPx > 1e-6 ? (startSample.widthPx + endSample.widthPx) * 0.5 / midSample.widthPx : 1;
        totalInkAreaPx2 += arcLen * midSample.widthPx * 0.72;

        if (cfg.tier === 1) tier1Count += 1;
        else if (cfg.tier === 2) tier2Count += 1;
        else tier3Count += 1;

        strokes.push({
          id: `hatch-t${cfg.tier}-${strokes.length}`,
          tier: cfg.tier,
          arcLengthPx: arcLen,
          meanDarkness: darkSum / samples.length,
          samples,
        });
      }
    }
  }

  const maxObservedTier: ObservedCrossHatchTier = tier3Count > 0 ? 3 : tier2Count > 0 ? 2 : tier1Count > 0 ? 1 : 0;
  return {
    strokes,
    tierStrokeCounts: { tier1: tier1Count, tier2: tier2Count, tier3: tier3Count },
    maxObservedTier,
    meanTangentAlignmentCosine: alignCosWeight > 0 ? alignCosSum / alignCosWeight : 1,
    meanTier1ToTier2OrthogonalitySin: orthoSinWeight > 0 ? orthoSinSum / orthoSinWeight : 1,
    meanEndToMidTaperRatio: strokes.length > 0 ? taperRatioSum / strokes.length : 0,
    inkCoverageEstimate01: clamp01(totalInkAreaPx2 / Math.max(1, canvasW * canvasH)),
  };
}

/** 주광원 각도, 외곽 실루엣 여부, 전경·배경 Z-깊이에 맞춰 기존 벡터 먹선 굵기를 비파괴 변조한다. */
export function modulateLineWeightByLightAndDepth(
  strokes: readonly VectorInkEdgeStroke[],
  lighting: InkLightingAndDepthContext,
  options: LineWeightModulationOptions = {},
): LineWeightModulationResult {
  const [lx, ly, lz] = normalize3D(lighting.keyLightDirX, lighting.keyLightDirY, lighting.keyLightDirZ ?? 0.25);
  const lightIntensity = clamp(lighting.keyLightIntensity ?? 1, 0, 2);
  const nearDepth = lighting.nearDepthMeters ?? 0.5;
  const farDepth = Math.max(nearDepth + 0.1, lighting.farDepthMeters ?? 12);
  const lightThin = clamp(options.lightThinningStrength ?? 0.42, 0, 0.85);
  const shadowThick = clamp(options.shadowThickeningStrength ?? 0.48, 0, 1.4);
  const silhouetteBoost = clamp(options.silhouetteBoostRatio ?? 0.28, 0, 1);
  const fgBoost = clamp(options.foregroundBoostRatio ?? 0.22, 0, 0.8);
  const bgAtten = clamp(options.backgroundAttenuationRatio ?? 0.3, 0, 0.75);
  const minScale = clamp(options.minWidthScale ?? 0.35, 0.08, 1);
  const maxScale = Math.max(minScale + 0.1, options.maxWidthScale ?? 2.4);
  const smoothAlongStroke = options.smoothAlongStroke ?? true;

  const stats = { litS: 0, litN: 0, shdS: 0, shdN: 0, silS: 0, silN: 0, fgS: 0, fgN: 0, bgS: 0, bgN: 0 };

  const modulatedStrokes: ModulatedVectorInkStroke[] = strokes.map((stroke) => {
    const isSilhouette = Boolean(stroke.isSilhouette);
    const isOcclusionCrease = Boolean(stroke.isOcclusionCrease);

    const rawComputed = stroke.samples.map((sample) => {
      const [nx, ny, nz] = normalize3D(sample.edgeNormalX, sample.edgeNormalY, sample.edgeNormalZ ?? 0);
      const ndotl = clamp(nx * lx + ny * ly + nz * lz, -1, 1);
      const lightDelta = ndotl >= 0 ? -lightThin * Math.pow(ndotl, 0.85) * lightIntensity : shadowThick * Math.pow(-ndotl, 0.9);
      const contourBonus =
        (isSilhouette ? silhouetteBoost : 0) +
        (isOcclusionCrease ? silhouetteBoost * 0.55 : 0) +
        clamp01(sample.ambientOcclusion01 ?? 0) * 0.2;
      const zDepth = sample.zDepthMeters ?? (nearDepth + farDepth) * 0.35;
      const depthT = clamp01((zDepth - nearDepth) / (farDepth - nearDepth));
      const depthMult = (1 + fgBoost * (1 - depthT)) * (1 - bgAtten * depthT);
      return { sample, ndotl, depthT, rawScale: clamp((1 + lightDelta + contourBonus) * depthMult, minScale, maxScale) };
    });

    const finalSamples: ModulatedVectorInkSample[] = rawComputed.map((entry, idx) => {
      const prevScale = rawComputed[Math.max(0, idx - 1)]?.rawScale ?? entry.rawScale;
      const nextScale = rawComputed[Math.min(rawComputed.length - 1, idx + 1)]?.rawScale ?? entry.rawScale;
      const widthScale =
        smoothAlongStroke && rawComputed.length >= 3
          ? clamp(prevScale * 0.2 + entry.rawScale * 0.6 + nextScale * 0.2, minScale, maxScale)
          : entry.rawScale;
      const modulatedWidthPx = Math.max(0.05, entry.sample.baseWidthPx) * widthScale;

      if (entry.ndotl > 0.2) { stats.litS += widthScale; stats.litN += 1; }
      else if (entry.ndotl < -0.2) { stats.shdS += widthScale; stats.shdN += 1; }
      if (isSilhouette) { stats.silS += widthScale; stats.silN += 1; }
      if (entry.depthT <= 0.25) { stats.fgS += widthScale; stats.fgN += 1; }
      else if (entry.depthT >= 0.75) { stats.bgS += widthScale; stats.bgN += 1; }
      return { ...entry.sample, ndotl: entry.ndotl, widthScale, modulatedWidthPx };
    });

    const scaleSum = finalSamples.reduce((acc, s) => acc + s.widthScale, 0);
    return {
      id: stroke.id,
      isSilhouette,
      isOcclusionCrease,
      samples: finalSamples,
      meanWidthScale: finalSamples.length > 0 ? scaleSum / finalSamples.length : 1,
    };
  });

  const meanLitEdgeScale = stats.litN > 0 ? stats.litS / stats.litN : 1;
  const meanShadowEdgeScale = stats.shdN > 0 ? stats.shdS / stats.shdN : 1;
  return {
    strokes: modulatedStrokes,
    meanLitEdgeScale,
    meanShadowEdgeScale,
    meanSilhouetteScale: stats.silN > 0 ? stats.silS / stats.silN : 1,
    meanForegroundScale: stats.fgN > 0 ? stats.fgS / stats.fgN : 1,
    meanBackgroundScale: stats.bgN > 0 ? stats.bgS / stats.bgN : 1,
    shadowToLitWidthRatio: meanLitEdgeScale > 1e-6 ? meanShadowEdgeScale / meanLitEdgeScale : 1,
  };
}
