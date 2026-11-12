export interface BrushStudioV7BackrunLobe {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angle: number;
  readonly opacity: number;
  readonly mix: number;
}

export interface BrushStudioV7SedimentMark {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angle: number;
  readonly opacity: number;
  readonly mix: number;
}

export interface BrushStudioV7BristleBundleSample {
  readonly split: number;
  readonly merge: number;
  readonly splayGain: number;
  readonly widthGain: number;
  readonly branchOffset: number;
  readonly branchOpacity: number;
}

export interface BrushStudioV7CurveControlSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tilt: number;
  readonly twist: number;
}

export interface BrushStudioV7CentripetalSubPoint extends BrushStudioV7CurveControlSample {
  readonly curvatureInvPx: number;
  readonly stepTighteningFactor: number;
}

const TAU = Math.PI * 2;
const unit = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function hashNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function wrapAngleDelta(a: number, b: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  return delta;
}

/**
 * V7.3 구심(Centripetal, alpha=0.5) Catmull-Rom 스플라인 보간 및 곡률 기반 스텝 조밀화(`physics-centripetal-adaptive-stamp`).
 * 비균일 포인터 간격에서도 자기교차(cusp) 없이 곡선을 복원하고 급회전 구간에서 간격을 촘촘히 줄인다.
 */
export function interpolateBrushStudioV7CentripetalSegment(
  p0: BrushStudioV7CurveControlSample,
  p1: BrushStudioV7CurveControlSample,
  p2: BrushStudioV7CurveControlSample,
  p3: BrushStudioV7CurveControlSample,
  subdivisions = 4,
): readonly BrushStudioV7CentripetalSubPoint[] {
  const count = Math.max(1, Math.min(12, Math.round(subdivisions)));
  const knotStep = (a: BrushStudioV7CurveControlSample, b: BrushStudioV7CurveControlSample) =>
    Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));

  const t0 = 0;
  const t1 = t0 + knotStep(p0, p1);
  const t2 = t1 + knotStep(p1, p2);
  const t3 = t2 + knotStep(p2, p3);

  const lerpSample = (
    a: BrushStudioV7CurveControlSample,
    b: BrushStudioV7CurveControlSample,
    ta: number,
    tb: number,
    t: number,
  ): BrushStudioV7CurveControlSample => {
    const w = (t - ta) / Math.max(1e-5, tb - ta);
    const twistDelta = ((b.twist - a.twist + 540) % 360) - 180;
    return {
      x: a.x + (b.x - a.x) * w,
      y: a.y + (b.y - a.y) * w,
      pressure: a.pressure + (b.pressure - a.pressure) * w,
      tilt: a.tilt + (b.tilt - a.tilt) * w,
      twist: a.twist + twistDelta * w,
    };
  };

  const pts: BrushStudioV7CurveControlSample[] = [];
  for (let i = 0; i <= count; i++) {
    const t = t1 + (i / count) * (t2 - t1);
    const a1 = lerpSample(p0, p1, t0, t1, t);
    const a2 = lerpSample(p1, p2, t1, t2, t);
    const a3 = lerpSample(p2, p3, t2, t3, t);
    const b1 = lerpSample(a1, a2, t0, t2, t);
    const b2 = lerpSample(a2, a3, t1, t3, t);
    const out = lerpSample(b1, b2, t1, t2, t);
    pts.push({ ...out, pressure: unit(out.pressure), tilt: unit(out.tilt) });
  }

  return Object.freeze(
    pts.slice(1).map((pt, idx) => {
      const prev = pts[idx]!;
      const next = pts[Math.min(pts.length - 1, idx + 2)]!;
      const a1 = Math.atan2(pt.y - prev.y, pt.x - prev.x);
      const a2 = Math.atan2(next.y - pt.y, next.x - pt.x);
      const halfChord = Math.max(0.25, Math.hypot(next.x - prev.x, next.y - prev.y) * 0.5);
      const curvatureInvPx = idx + 2 < pts.length ? Math.abs(wrapAngleDelta(a1, a2)) / halfChord : 0;
      const stepTighteningFactor = Math.max(0.38, 1 / (1 + curvatureInvPx * 18));
      return Object.freeze({
        ...pt,
        curvatureInvPx,
        stepTighteningFactor,
      });
    }),
  );
}

/**
 * V7.3 원심 강모 급선회 부채꼴 벌어짐(`physics-centrifugal-bristle-turn`).
 */
export function sampleBrushStudioV7CentrifugalBristleTurn(input: {
  readonly lanePositionSigned: number;
  readonly radius: number;
  readonly angularDeltaRad: number;
  readonly segmentDistancePx: number;
  readonly tilt01: number;
  readonly stiffness01: number;
}): {
  readonly normalOffsetGainPx: number;
  readonly tiltWidthScale: number;
} {
  const turnIntensity = Math.min(
    1.4,
    (Math.abs(input.angularDeltaRad) * Math.max(1, input.segmentDistancePx)) /
      Math.max(2, input.radius * (0.45 + unit(input.stiffness01) * 0.85)),
  );
  const outwardSign = input.angularDeltaRad >= 0 ? -1 : 1;
  const isOuter = input.lanePositionSigned * outwardSign >= 0;
  const fanShift = outwardSign * turnIntensity * input.radius * (isOuter ? 0.58 : 0.16) * (0.35 + Math.abs(input.lanePositionSigned));
  const tiltWidthScale = 1 + unit(input.tilt01) * 0.85;
  return Object.freeze({
    normalOffsetGainPx: fanShift,
    tiltWidthScale,
  });
}

/**
 * V7.3 서브픽셀 SDF 이중 엔벨로프 안티앨리어싱 및 입출필 칼끝 테이퍼(`finish-subpixel-sdf-aa`).
 */
export function sampleBrushStudioV7SubpixelEnvelopeTaper(input: {
  readonly dabIndex: number;
  readonly pressure01: number;
  readonly radiusPx: number;
}): {
  readonly coreRadiusScale: number;
  readonly haloRadiusPx: number;
  readonly haloOpacityScale: number;
} {
  const entryRamp = Math.min(1, (input.dabIndex + 1) / 4);
  const pressureTaper = input.pressure01 < 0.22 ? Math.max(0.24, input.pressure01 / 0.22) : 1;
  const coreRadiusScale = Math.max(0.28, 0.35 + 0.65 * entryRamp * pressureTaper);
  const coreRadius = Math.max(0.18, input.radiusPx * coreRadiusScale);
  const haloRadiusPx = coreRadius + Math.min(1.15, Math.max(0.45, coreRadius * 0.26));
  const haloOpacityScale = 0.22;
  return Object.freeze({
    coreRadiusScale,
    haloRadiusPx,
    haloOpacityScale,
  });
}

/**
 * V7.4 듀얼 브러시 실루엣 보존 불리언 각인(`physics-dual-mask-boolean`).
 */
export function sampleBrushStudioV7DualMaskCarve(input: {
  readonly x: number;
  readonly y: number;
  readonly seed: number;
  readonly surfaceTooth01: number;
  readonly granulation01: number;
}): {
  readonly opacityScale: number;
  readonly minorRadiusScale: number;
} {
  const coarse = hashNoise(Math.floor(input.x / 3.5), Math.floor(input.y / 3.5), input.seed ^ 0x4455414c);
  const fine = hashNoise(Math.floor((input.x + 7.1) / 1.7), Math.floor((input.y - 4.3) / 1.7), input.seed ^ 0x43415256);
  const mask = unit(coarse * 0.64 + fine * 0.36);
  const depth = unit(0.28 + unit(input.surfaceTooth01) * 0.42 + unit(input.granulation01) * 0.24);
  const opacityScale = Math.max(0.14, Math.min(1, 1 - depth * (1 - mask) * 0.86));
  const minorRadiusScale = Math.max(0.58, Math.min(1, 1 - depth * (1 - coarse) * 0.32));
  return Object.freeze({ opacityScale, minorRadiusScale });
}

/**
 * V7.4 스타일러스 배럴 트위스트(0~360°) + 기울기 3D 치즐 닙 투영(`physics-barrel-twist-chisel`).
 */
export function sampleBrushStudioV7BarrelTwistChisel(input: {
  readonly baseRadiusPx: number;
  readonly twistDeg: number;
  readonly tilt01: number;
  readonly strokeDirectionRad: number;
}): {
  readonly majorRadiusPx: number;
  readonly minorRadiusPx: number;
  readonly nibAngleRad: number;
} {
  const twistRad = ((input.twistDeg % 360) * Math.PI) / 180;
  const tilt = unit(input.tilt01);
  const majorRadiusPx = Math.max(0.25, input.baseRadiusPx * (1.12 + tilt * 0.42));
  const minorRadiusPx = Math.max(0.16, input.baseRadiusPx * (0.16 + tilt * 0.22));
  const nibAngleRad = twistRad + Math.sin(twistRad - input.strokeDirectionRad) * 0.08;
  return Object.freeze({ majorRadiusPx, minorRadiusPx, nibAngleRad });
}

/**
 * V7.4 딥펜(G펜·마루펜) 코너 체류 잉크 고임 & 고필압 펜촉 트윈 레일 분리(`physics-nib-split-pooling`).
 */
export function sampleBrushStudioV7NibSplitPooling(input: {
  readonly radiusPx: number;
  readonly pressure01: number;
  readonly angularDeltaRad: number;
  readonly segmentDistancePx: number;
}): {
  readonly dwellOpacityBoost: number;
  readonly tineSplitOffsetPx: number;
  readonly railRadiusPx: number;
} {
  const turnNorm = unit(Math.abs(input.angularDeltaRad) / (Math.PI * 0.65));
  const slowNorm = Math.exp(-Math.max(0, input.segmentDistancePx) / Math.max(1.5, input.radiusPx * 1.8));
  const dwellOpacityBoost = 1 + (0.12 * slowNorm + 0.16 * turnNorm * (0.45 + 0.55 * slowNorm));
  const splitOver = unit((unit(input.pressure01) - 0.66) / 0.34);
  const tineSplitOffsetPx = input.radiusPx * splitOver * 0.44;
  const railRadiusPx = Math.max(0.16, input.radiusPx * (0.42 - splitOver * 0.08));
  return Object.freeze({ dwellOpacityBoost, tineSplitOffsetPx, railRadiusPx });
}

export function sampleBrushStudioV7BackrunLobes(input: {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly direction: number;
  readonly index: number;
  readonly seed: number;
  readonly wetness: number;
  readonly diffusion: number;
  readonly absorbency: number;
  readonly evaporation: number;
  readonly advection: number;
  readonly fiberAngle: number;
  readonly anisotropy: number;
  readonly tooth: number;
}): readonly BrushStudioV7BackrunLobe[] {
  if (input.index % 3 !== 0) return [];
  const dryingFront = unit(input.wetness * (0.3 + input.evaporation * 0.7)
    * (1.08 - input.absorbency * 0.38));
  if (dryingFront < 0.08) return [];
  const count = 2 + Math.round(unit(input.diffusion) * 2);
  const result: BrushStudioV7BackrunLobe[] = [];
  for (let lane = 0; lane < count; lane++) {
    const random = hashNoise(input.index, lane, input.seed ^ 0x4241434b);
    const side = lane % 2 === 0 ? -1 : 1;
    const fiberPull = Math.sin(input.fiberAngle - input.direction) * unit(input.anisotropy) * 0.48;
    const boundaryAngle = input.direction + side * Math.PI / 2
      + (random - 0.5) * (0.45 + input.advection * 0.8) + fiberPull;
    const distance = input.radius * (0.78 + input.diffusion * 0.62 + random * 0.32);
    const radius = input.radius * (0.12 + input.diffusion * 0.18)
      * (0.72 + random * 0.56) * (0.8 + input.tooth * 0.35);
    result.push(Object.freeze({
      x: input.x + Math.cos(boundaryAngle) * distance,
      y: input.y + Math.sin(boundaryAngle) * distance,
      radiusX: Math.max(0.2, radius * (1 + input.anisotropy * 0.85)),
      radiusY: Math.max(0.16, radius * (0.52 + (1 - input.anisotropy) * 0.24)),
      angle: input.fiberAngle + (random - 0.5) * 0.42,
      opacity: unit(dryingFront * (0.16 + input.diffusion * 0.2) * (0.75 + random * 0.5)),
      mix: unit(0.16 + input.tooth * 0.18 + random * 0.18),
    }));
  }
  return Object.freeze(result);
}

export function sampleBrushStudioV7Sediment(input: {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly index: number;
  readonly seed: number;
  readonly granulation: number;
  readonly absorbency: number;
  readonly tooth: number;
  readonly fiberAngle: number;
  readonly anisotropy: number;
}): readonly BrushStudioV7SedimentMark[] {
  const granulation = unit(input.granulation);
  if (granulation < 0.08 || input.index % 2 !== 0) return [];
  const valleyLoad = unit((0.3 + input.tooth * 0.7) * (0.45 + input.absorbency * 0.55));
  const count = 2 + Math.round(granulation * 3);
  const result: BrushStudioV7SedimentMark[] = [];
  for (let lane = 0; lane < count; lane++) {
    const angleNoise = hashNoise(input.index, lane, input.seed ^ 0x53454449);
    const distanceNoise = hashNoise(input.index, lane, input.seed ^ 0x4d454e54);
    const turn = angleNoise * TAU;
    const distance = Math.sqrt(distanceNoise) * input.radius * 0.82;
    const radius = Math.max(0.18, input.radius * (0.025 + granulation * 0.055)
      * (0.65 + hashNoise(lane, input.index, input.seed) * 0.7));
    result.push(Object.freeze({
      x: input.x + Math.cos(turn) * distance,
      y: input.y + Math.sin(turn) * distance,
      radiusX: radius * (1 + input.anisotropy * 0.9),
      radiusY: radius * (0.42 + (1 - input.anisotropy) * 0.28),
      angle: input.fiberAngle + (angleNoise - 0.5) * 0.35,
      opacity: unit(granulation * valleyLoad * (0.32 + distanceNoise * 0.46)),
      mix: unit(0.04 + input.tooth * 0.18 + angleNoise * 0.12),
    }));
  }
  return Object.freeze(result);
}

export function sampleBrushStudioV7BristleBundle(input: {
  readonly lane: number;
  readonly laneCount: number;
  readonly pathLength: number;
  readonly size: number;
  readonly seed: number;
  readonly pressure: number;
  readonly friction: number;
  readonly viscosity: number;
}): BrushStudioV7BristleBundleSample {
  const cluster = Math.floor(input.lane / Math.max(2, Math.round(input.laneCount / 12)));
  const phase = hashNoise(cluster, input.lane, input.seed ^ 0x42524953) * TAU;
  const wavelength = Math.max(6, input.size * (0.58 + hashNoise(cluster, 7, input.seed) * 0.8));
  const wave = Math.sin(input.pathLength / wavelength * TAU + phase) * 0.5 + 0.5;
  const edge = Math.abs(input.lane / Math.max(1, input.laneCount - 1) - 0.5) * 2;
  const split = unit((wave - 0.38) * 1.8) * unit(0.34 + input.friction * 0.62)
    * unit(0.62 + edge * 0.58) * unit(1.12 - input.pressure * 0.42);
  const merge = unit((0.58 - wave) * 1.7) * unit(0.32 + input.viscosity * 0.62)
    * unit(0.45 + input.pressure * 0.7);
  return Object.freeze({
    split,
    merge,
    splayGain: Math.max(0.68, 1 + split * 0.52 - merge * 0.24),
    widthGain: Math.max(0.72, 1 - split * 0.25 + merge * 0.34),
    branchOffset: (hashNoise(input.lane, cluster, input.seed ^ 0x53504c54) - 0.5)
      * input.size * split * 0.12,
    branchOpacity: unit(split * (0.38 + (1 - input.pressure) * 0.36)),
  });
}

export function sampleBrushStudioV7VectorField(
  id: string,
  x: number,
  y: number,
  seed: number,
  scale: number,
  jitter: number,
): number {
  const cell = Math.max(3, 18 * Math.max(0.1, scale));
  const nx = x / cell;
  const ny = y / cell;
  const wobble = (hashNoise(Math.floor(nx), Math.floor(ny), seed) - 0.5) * jitter * 0.6;
  if (id === "pattern-vector-vortex") {
    const cx = (Math.floor(nx / 5) * 5 + 2.5) * cell;
    const cy = (Math.floor(ny / 5) * 5 + 2.5) * cell;
    return Math.atan2(y - cy, x - cx) + Math.PI / 2 + wobble;
  }
  if (id === "pattern-vector-contour") {
    return Math.atan2(Math.sin(nx * 0.7) * 0.9, 1) + Math.cos(ny * 0.52) * 0.32 + wobble;
  }
  if (id === "pattern-textile-twill") {
    const row = Math.floor(ny);
    return Math.PI / 4 + ((row & 3) - 1.5) * 0.045 + wobble * 0.35;
  }
  if (id === "pattern-textile-satin") {
    const warp = Math.abs(Math.sin(nx * Math.PI));
    return warp > 0.28 ? Math.PI / 2 + wobble * 0.24 : wobble * 0.18;
  }
  return Math.sin(nx * 0.64 + seed * 0.00001) * 0.46
    + Math.cos(ny * 0.51 - seed * 0.000013) * 0.34 + wobble;
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

export function shadeBrushStudioV7ReliefColor(
  hex: string,
  angle: number,
  height: number,
  gloss: number,
): string {
  if (!/^#[0-9a-f]{6}$/iu.test(hex) || height <= 0) return hex;
  const lightAngle = -Math.PI * 0.28;
  const facing = Math.cos(angle - lightAngle);
  const highlight = Math.max(0, facing) * unit(height) * (0.08 + unit(gloss) * 0.24);
  const shadow = Math.max(0, -facing) * unit(height) * (0.06 + (1 - unit(gloss)) * 0.11);
  const amount = highlight - shadow;
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.min(0.34, Math.abs(amount));
  const values = [1, 3, 5].map((offset) => Math.round(channel(hex, offset) * (1 - weight) + target * weight));
  return `#${values.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export interface BrushStudioV7ImpastoShadingInput {
  readonly hex: string;
  readonly strokeAngleRad: number;
  readonly height: number;
  readonly gloss: number;
  readonly bristleFurrow?: number;
  readonly lightAzimuthRad?: number;
  readonly lightElevationRad?: number;
}

export interface BrushStudioV7ImpastoShadingResult {
  readonly shadedHex: string;
  readonly diffuseFactor: number;
  readonly specularBoost: number;
  readonly furrowDepth: number;
}

/**
 * V7.2/V7.3 고해상도 임파스토 법선 + Blinn-Phong 스페큘러 + 브리슬 고랑(furrow) 미세 음영 계산기.
 */
export function computeBrushStudioV7ImpastoShading(
  input: BrushStudioV7ImpastoShadingInput,
): BrushStudioV7ImpastoShadingResult {
  const safeHeight = unit(input.height);
  if (!/^#[0-9a-f]{6}$/iu.test(input.hex) || safeHeight <= 0) {
    return Object.freeze({
      shadedHex: input.hex,
      diffuseFactor: 1,
      specularBoost: 0,
      furrowDepth: 0,
    });
  }
  const safeGloss = unit(input.gloss);
  const safeFurrow = unit(input.bristleFurrow ?? 0.35);
  const lightAzimuth = input.lightAzimuthRad ?? -Math.PI * 0.28;
  const lightElevation = Math.max(0.15, Math.min(1.4, input.lightElevationRad ?? 0.82));

  const ridgeNormalAngle = input.strokeAngleRad;
  const facing = Math.cos(ridgeNormalAngle - lightAzimuth);
  const crossFacing = Math.abs(Math.sin(ridgeNormalAngle - lightAzimuth));
  const furrowDepth = unit(safeHeight * safeFurrow * (0.35 + crossFacing * 0.65));

  const slope = safeHeight * (0.45 + furrowDepth * 0.35);
  const lambertDelta = facing * slope * Math.cos(lightElevation);
  const diffuseFactor = Math.max(0.62, Math.min(1.28, 1 + lambertDelta * 0.42 - furrowDepth * 0.08));

  const halfAngleCos = Math.max(0, facing * 0.55 + Math.sin(lightElevation) * 0.45);
  const shininess = 12 + safeGloss * 28;
  const rawSpec = Math.pow(halfAngleCos, shininess) * safeHeight * (0.12 + safeGloss * 0.42);
  const specularBoost = facing > 0 ? unit(rawSpec * (1 + furrowDepth * 0.25)) : 0;

  const rgb = [1, 3, 5].map((offset) => {
    const base = channel(input.hex, offset);
    const lit = base * diffuseFactor + specularBoost * 255;
    return Math.max(0, Math.min(255, Math.round(lit)));
  });

  return Object.freeze({
    shadedHex: `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`,
    diffuseFactor: Number(diffuseFactor.toFixed(4)),
    specularBoost: Number(specularBoost.toFixed(4)),
    furrowDepth: Number(furrowDepth.toFixed(4)),
  });
}
