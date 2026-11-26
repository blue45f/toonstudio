/**
 * Wasm64 Wave 26: 2D 표지 일러스트 임파스토(Impasto) 물감 융기 높이장 및
 * GGX 사광(Raking-Light) 미세 법선·자가 그림자 합성기.
 *
 * - 붓 터치 진행 방향(접선 `tangent`)과 폭 방향(종법선 `binormal`)을 따라 강모(bristle) 결 주기와
 *   붓 가장자리에 밀려 고이는 물감 테두리 융기(edge bead)를 `Float32Array` 높이장에 누적한다.
 * - Sobel 또는 중심차분(central-difference) 기울기로 미세 표면 법선을 유도하고,
 *   사광 방위각·고도각을 따라 다단계 화면 공간 지평선 자가 그림자(horizon self-shadowing)를 계산한다.
 * - 에너지 보존 유전체(dielectric) Cook-Torrance GGX 미세 하이라이트와 람베르트 확산 반사를
 *   `Float32Array` 선형 RGBA 버퍼 위에 합성한다.
 */

/** 선형 광량 RGBA 색상 (`0..1`) */
export interface LinearRgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** 물감 적층 물리 모드 */
export type ImpastoDepositionMode = "impasto-plow" | "additive-glaze";

/** 단일 임파스토 붓 자국(dab) 명세 */
export interface ImpastoBrushDab {
  readonly centerX: number;
  readonly centerY: number;
  /** 터치 진행 방향 반경 (px) */
  readonly radiusAlongPx: number;
  /** 붓 폭 방향 반경 (px) */
  readonly radiusAcrossPx: number;
  /** 터치 진행 방향 라디안 각도 */
  readonly tangentAngleRad: number;
  /** 중심 기준 물감 두께 */
  readonly thickness: number;
  /** 붓 폭 전체에 걸친 강모(bristle) 이랑 개수 */
  readonly bristleRidgeCount: number;
  /** 강모 홈 깊이 비율 `0..1` */
  readonly bristleGrooveDepth: number;
  /** 강모 위상 오프셋 (라디안) */
  readonly bristlePhaseRad?: number;
  /** 붓 가장자리 물감 밀림 테두리 융기(edge bead) 강도 `>= 0` */
  readonly edgeBeadStrength: number;
  /** 안료 선형 RGBA 색상 */
  readonly pigmentRgba: LinearRgbaColor;
  /** 기존 물감층과의 혼합 방식 (기본값: impasto-plow) */
  readonly depositionMode?: ImpastoDepositionMode;
}

/** 연속 폴리라인 스트로크 스탬핑 명세 */
export interface ImpastoStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface ImpastoStrokeSpec {
  readonly points: readonly ImpastoStrokePoint[];
  readonly brushRadiusPx: number;
  readonly spacingRatio?: number;
  readonly baseThickness: number;
  readonly bristleRidgeCount: number;
  readonly bristleGrooveDepth: number;
  readonly edgeBeadStrength: number;
  readonly pigmentRgba: LinearRgbaColor;
  readonly depositionMode?: ImpastoDepositionMode;
}

/** 높이장·안료 버퍼를 함께 담는 2D 임파스토 캔버스 */
export interface ImpastoSurfaceCanvas {
  readonly width: number;
  readonly height: number;
  /** 픽셀당 누적 물감 높이 (`width * height`) */
  readonly heightField: Float32Array;
  /** 픽셀당 선형 안료 RGBA (`width * height * 4`) */
  readonly albedoRgba: Float32Array;
}

/** 법선 추출 커널 종류 */
export type NormalGradientKernel = "sobel" | "central-difference";

export interface ImpastoNormalOptions {
  /** 픽셀 간격 대비 수직 융기 배율 (기본값: 2.4) */
  readonly heightScale?: number;
  /** 미분 커널 선택 (기본값: sobel) */
  readonly kernel?: NormalGradientKernel;
}

/** 사광(Raking Light) 및 재질 물리 조명 설정 */
export interface ImpastoRakingLightOptions {
  /** 광원 평면 방위각 (도, 0° = +X 우측, 90° = +Y 하단) */
  readonly lightAzimuthDeg: number;
  /** 캔버스 평면 위 광원 고도각 (도, 1°..90°, 15° = 강한 사광, 85° = 수직 조명) */
  readonly lightElevationDeg: number;
  /** 직사광 세기 (기본값: 1.15) */
  readonly lightIntensity?: number;
  /** 직사광 선형 RGB 색온도 (기본값: 따뜻한 갤러리 스폿 조명) */
  readonly lightColorRgb?: { readonly r: number; readonly g: number; readonly b: number };
  /** 스튜디오 반구 환경광 세기 (기본값: 0.22) */
  readonly ambientIntensity?: number;
  /** 수직 높이 배율 (기본값: 2.4) */
  readonly heightScale?: number;
  /** 법선 미분 커널 (기본값: sobel) */
  readonly normalKernel?: NormalGradientKernel;
  /** 유전체 바니시·유화 매질 굴절률 IOR (기본값: 1.5 -> F0 = 0.04) */
  readonly dielectricIor?: number;
  /** GGX 미세 거칠기 `0.06..1.0` (기본값: 0.26) */
  readonly roughness?: number;
  /** 화면 공간 지평선 그림자 추적 단계 수 (기본값: 16) */
  readonly shadowSteps?: number;
  /** 그림자 추적 스텝 간격 px (기본값: 1.25) */
  readonly shadowStepSizePx?: number;
  /** 반그림자(penumbra) 감쇠 부드러움 (기본값: 3.2) */
  readonly shadowSharpness?: number;
}

/** 붓 폭 단면 높이 프로파일 샘플 */
export interface CrossStrokeHeightSample {
  readonly offsetAcrossPx: number;
  readonly normalizedAcross: number;
  readonly height: number;
}

export interface CrossStrokeProfileMetrics {
  readonly samples: readonly CrossStrokeHeightSample[];
  readonly centerHeight: number;
  readonly leftRimPeakHeight: number;
  readonly rightRimPeakHeight: number;
  readonly edgeBeadToCenterRatio: number;
}

/** 사광 합성 결과 버퍼 및 입체감 정량 지표 */
export interface ImpastoRakingComposeResult {
  readonly width: number;
  readonly height: number;
  readonly shadedRgba: Float32Array;
  readonly normalField: Float32Array;
  readonly horizonVisibility: Float32Array;
  readonly peakHeight: number;
  readonly luminanceMean: number;
  readonly luminanceStdDev: number;
  /** 물감 영역 휘도 표준편차 / 평균 비율 (사광 입체 대비 지표) */
  readonly reliefContrastRatio: number;
  readonly shadowedPixelFraction: number;
  readonly specularGlintPixelCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-9) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 초기 배경 안료와 빈 높이장을 가진 임파스토 캔버스를 생성한다. */
export function createImpastoSurfaceCanvas(
  width: number,
  height: number,
  baseCanvasRgba: LinearRgbaColor = { r: 0.94, g: 0.92, b: 0.88, a: 1 }
): ImpastoSurfaceCanvas {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const pixelCount = safeW * safeH;
  const heightField = new Float32Array(pixelCount);
  const albedoRgba = new Float32Array(pixelCount * 4);

  const br = clamp(baseCanvasRgba.r, 0, 1);
  const bg = clamp(baseCanvasRgba.g, 0, 1);
  const bb = clamp(baseCanvasRgba.b, 0, 1);
  const ba = clamp(baseCanvasRgba.a, 0, 1);
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    albedoRgba[base] = br;
    albedoRgba[base + 1] = bg;
    albedoRgba[base + 2] = bb;
    albedoRgba[base + 3] = ba;
  }
  return { width: safeW, height: safeH, heightField, albedoRgba };
}

/**
 * 단일 임파스토 붓 자국(dab)을 캔버스에 적층한다.
 * 강모 결(`bristleRidgeCount`)과 가장자리 물감 고임(`edgeBeadStrength`)을 물리적으로 반영한다.
 */
export function accumulateImpastoDab(canvas: ImpastoSurfaceCanvas, dab: ImpastoBrushDab): void {
  const radAlong = Math.max(1, dab.radiusAlongPx);
  const radAcross = Math.max(1, dab.radiusAcrossPx);
  const maxReach = Math.ceil(Math.max(radAlong, radAcross)) + 1;
  const minX = Math.max(0, Math.floor(dab.centerX - maxReach));
  const maxX = Math.min(canvas.width - 1, Math.ceil(dab.centerX + maxReach));
  const minY = Math.max(0, Math.floor(dab.centerY - maxReach));
  const maxY = Math.min(canvas.height - 1, Math.ceil(dab.centerY + maxReach));

  const cosT = Math.cos(dab.tangentAngleRad);
  const sinT = Math.sin(dab.tangentAngleRad);
  const grooveDepth = clamp(dab.bristleGrooveDepth, 0, 0.95);
  const ridgeFreq = Math.max(0, dab.bristleRidgeCount);
  const phase = dab.bristlePhaseRad ?? 0;
  const beadStrength = Math.max(0, dab.edgeBeadStrength);
  const mode = dab.depositionMode ?? "impasto-plow";
  const pr = clamp(dab.pigmentRgba.r, 0, 1);
  const pg = clamp(dab.pigmentRgba.g, 0, 1);
  const pb = clamp(dab.pigmentRgba.b, 0, 1);
  const pa = clamp(dab.pigmentRgba.a, 0, 1);

  for (let py = minY; py <= maxY; py++) {
    const dy = py - dab.centerY;
    for (let px = minX; px <= maxX; px++) {
      const dx = px - dab.centerX;
      const alongNorm = (dx * cosT + dy * sinT) / radAlong;
      const acrossNorm = (-dx * sinT + dy * cosT) / radAcross;
      const radialSq = alongNorm * alongNorm + acrossNorm * acrossNorm;
      if (radialSq >= 1) continue;

      const radial = Math.sqrt(radialSq);
      const plateau = 1 - smoothstep(0.76, 1.0, radial);

      // 붓 양옆 가장자리(|acrossNorm| ≈ 0.82)로 밀려난 물감이 도톰한 테두리 융기(edge bead)를 형성
      const lateralRim = Math.exp(-Math.pow((Math.abs(acrossNorm) - 0.82) / 0.1, 2));
      const outerEnvelope = 1 - smoothstep(0.9, 1.0, radial);
      const longitudinalCore = smoothstep(0.0, 0.28, 1 - alongNorm * alongNorm);
      const beadDeposit = beadStrength * lateralRim * outerEnvelope * longitudinalCore;

      const grooveWave =
        ridgeFreq > 0 ? 0.5 * (1 - Math.cos(Math.PI * ridgeFreq * acrossNorm + phase)) : 0;
      const bristleFactor = 1 - grooveDepth * grooveWave * (1 - 0.55 * lateralRim);
      const dabHeight = Math.max(0, dab.thickness * (plateau * bristleFactor + beadDeposit));
      if (dabHeight <= 1e-7) continue;

      const idx = py * canvas.width + px;
      const prevHeight = canvas.heightField[idx] ?? 0;
      canvas.heightField[idx] =
        mode === "impasto-plow"
          ? prevHeight * (1 - 0.28 * plateau * pa) + dabHeight
          : prevHeight + dabHeight;

      const opacity = clamp(pa * smoothstep(0, 0.22, plateau + beadDeposit), 0, 1);
      const cBase = idx * 4;
      const oldR = canvas.albedoRgba[cBase] ?? 0;
      const oldG = canvas.albedoRgba[cBase + 1] ?? 0;
      const oldB = canvas.albedoRgba[cBase + 2] ?? 0;
      const oldA = canvas.albedoRgba[cBase + 3] ?? 1;

      canvas.albedoRgba[cBase] = oldR + opacity * (pr - oldR);
      canvas.albedoRgba[cBase + 1] = oldG + opacity * (pg - oldG);
      canvas.albedoRgba[cBase + 2] = oldB + opacity * (pb - oldB);
      canvas.albedoRgba[cBase + 3] = clamp(oldA + opacity * (1 - oldA), 0, 1);
    }
  }
}

/** 연속 폴리라인 경로를 따라 방향성 임파스토 스트로크를 스탬핑한다. */
export function accumulateImpastoStroke(
  canvas: ImpastoSurfaceCanvas,
  stroke: ImpastoStrokeSpec
): number {
  if (stroke.points.length === 0) return 0;
  if (stroke.points.length === 1) {
    const pt = stroke.points[0];
    if (!pt) return 0;
    accumulateImpastoDab(canvas, {
      centerX: pt.x,
      centerY: pt.y,
      radiusAlongPx: stroke.brushRadiusPx,
      radiusAcrossPx: stroke.brushRadiusPx,
      tangentAngleRad: 0,
      thickness: stroke.baseThickness * clamp(pt.pressure, 0.1, 1.5),
      bristleRidgeCount: stroke.bristleRidgeCount,
      bristleGrooveDepth: stroke.bristleGrooveDepth,
      edgeBeadStrength: stroke.edgeBeadStrength,
      pigmentRgba: stroke.pigmentRgba,
      depositionMode: stroke.depositionMode,
    });
    return 1;
  }

  const stepPx = Math.max(0.75, stroke.brushRadiusPx * clamp(stroke.spacingRatio ?? 0.35, 0.1, 1.2));
  let stampedDabs = 0;
  let carryDist = 0;

  for (let seg = 0; seg + 1 < stroke.points.length; seg++) {
    const p0 = stroke.points[seg];
    const p1 = stroke.points[seg + 1];
    if (!p0 || !p1) continue;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-5) continue;

    const angle = Math.atan2(dy, dx);
    let distAlong = carryDist;
    while (distAlong <= segLen) {
      const u = distAlong / segLen;
      const pressure = clamp(p0.pressure + u * (p1.pressure - p0.pressure), 0.1, 1.5);
      accumulateImpastoDab(canvas, {
        centerX: p0.x + u * dx,
        centerY: p0.y + u * dy,
        radiusAlongPx: stroke.brushRadiusPx * 0.85,
        radiusAcrossPx: stroke.brushRadiusPx * (0.75 + 0.25 * pressure),
        tangentAngleRad: angle,
        thickness: stroke.baseThickness * pressure,
        bristleRidgeCount: stroke.bristleRidgeCount,
        bristleGrooveDepth: stroke.bristleGrooveDepth,
        bristlePhaseRad: stampedDabs * 0.17,
        edgeBeadStrength: stroke.edgeBeadStrength,
        pigmentRgba: stroke.pigmentRgba,
        depositionMode: stroke.depositionMode,
      });
      stampedDabs += 1;
      distAlong += stepPx;
    }
    carryDist = distAlong - segLen;
  }
  return stampedDabs;
}

function sampleHeightBilinear(
  heightField: Float32Array,
  width: number,
  height: number,
  fx: number,
  fy: number
): number {
  const cx = clamp(fx, 0, width - 1);
  const cy = clamp(fy, 0, height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;

  const h00 = heightField[y0 * width + x0] ?? 0;
  const h10 = heightField[y0 * width + x1] ?? 0;
  const h01 = heightField[y1 * width + x0] ?? 0;
  const h11 = heightField[y1 * width + x1] ?? 0;
  return h00 + tx * (h10 - h00) + ty * (h01 + tx * (h11 - h01) - (h00 + tx * (h10 - h00)));
}

/**
 * 스트로크 중심에서 종법선(폭) 방향으로 단면 높이를 샘플링해
 * 가장자리 물감 테두리 융기(edge bead) 대비 중심 높이 비율을 정량 측정한다.
 */
export function sampleCrossStrokeHeightProfile(
  canvas: ImpastoSurfaceCanvas,
  centerX: number,
  centerY: number,
  tangentAngleRad: number,
  halfSpanPx: number,
  sampleCount = 41
): CrossStrokeProfileMetrics {
  const count = Math.max(5, Math.floor(sampleCount));
  const binormalX = -Math.sin(tangentAngleRad);
  const binormalY = Math.cos(tangentAngleRad);
  const samples: CrossStrokeHeightSample[] = [];
  let leftRimPeakHeight = 0;
  let rightRimPeakHeight = 0;

  for (let i = 0; i < count; i++) {
    const norm = (2 * i) / (count - 1) - 1;
    const offset = norm * halfSpanPx;
    const h = sampleHeightBilinear(
      canvas.heightField,
      canvas.width,
      canvas.height,
      centerX + offset * binormalX,
      centerY + offset * binormalY
    );
    samples.push({ offsetAcrossPx: offset, normalizedAcross: norm, height: h });
    if (norm <= -0.62 && norm >= -0.96 && h > leftRimPeakHeight) leftRimPeakHeight = h;
    if (norm >= 0.62 && norm <= 0.96 && h > rightRimPeakHeight) rightRimPeakHeight = h;
  }

  const centerHeight = sampleHeightBilinear(
    canvas.heightField,
    canvas.width,
    canvas.height,
    centerX,
    centerY
  );
  const rimPeak = Math.max(leftRimPeakHeight, rightRimPeakHeight);
  const edgeBeadToCenterRatio = centerHeight > 1e-6 ? rimPeak / centerHeight : 0;
  return { samples, centerHeight, leftRimPeakHeight, rightRimPeakHeight, edgeBeadToCenterRatio };
}

/**
 * Sobel(3×3) 또는 중심차분(central-difference) 연산자로 임파스토 높이장에서
 * 오른손 접선 공간 단위 법선장(`Nx, Ny, Nz`)을 유도한다.
 */
export function deriveImpastoMicroNormals(
  heightField: Float32Array,
  width: number,
  height: number,
  options: ImpastoNormalOptions = {}
): Float32Array {
  const heightScale = options.heightScale ?? 2.4;
  const kernel = options.kernel ?? "sobel";
  const normals = new Float32Array(width * height * 3);
  const read = (x: number, y: number): number =>
    heightField[clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)] ?? 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let gradX: number;
      let gradY: number;
      if (kernel === "sobel") {
        const tl = read(x - 1, y - 1);
        const tc = read(x, y - 1);
        const tr = read(x + 1, y - 1);
        const ml = read(x - 1, y);
        const mr = read(x + 1, y);
        const bl = read(x - 1, y + 1);
        const bc = read(x, y + 1);
        const br = read(x + 1, y + 1);
        gradX = (tr + 2 * mr + br - (tl + 2 * ml + bl)) / 8;
        gradY = (bl + 2 * bc + br - (tl + 2 * tc + tr)) / 8;
      } else {
        gradX = 0.5 * (read(x + 1, y) - read(x - 1, y));
        gradY = 0.5 * (read(x, y + 1) - read(x, y - 1));
      }

      const nxRaw = -heightScale * gradX;
      const nyRaw = -heightScale * gradY;
      const invLen = 1 / Math.hypot(nxRaw, nyRaw, 1);
      const outBase = (y * width + x) * 3;
      normals[outBase] = nxRaw * invLen;
      normals[outBase + 1] = nyRaw * invLen;
      normals[outBase + 2] = invLen;
    }
  }
  return normals;
}

/**
 * 사광 방위각·고도각 방향으로 다단계 화면 공간 레이마칭을 수행하여
 * 물감 능선이 인접 골짜기에 드리우는 지평선 자가 그림자 가시도(`0..1`)를 계산한다.
 */
export function computeRakingHorizonShadows(
  heightField: Float32Array,
  width: number,
  height: number,
  options: Pick<
    ImpastoRakingLightOptions,
    | "lightAzimuthDeg"
    | "lightElevationDeg"
    | "heightScale"
    | "shadowSteps"
    | "shadowStepSizePx"
    | "shadowSharpness"
  >
): Float32Array {
  const azimuthRad = (options.lightAzimuthDeg * Math.PI) / 180;
  const elevationRad = (clamp(options.lightElevationDeg, 1, 89.9) * Math.PI) / 180;
  const dirX = Math.cos(azimuthRad);
  const dirY = Math.sin(azimuthRad);
  const tanElevation = Math.tan(elevationRad);
  const heightScale = options.heightScale ?? 2.4;
  const steps = Math.max(1, Math.floor(options.shadowSteps ?? 16));
  const stepSizePx = Math.max(0.4, options.shadowStepSizePx ?? 1.25);
  const sharpness = Math.max(0.2, options.shadowSharpness ?? 3.2);
  const visibility = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const originZ = (heightField[idx] ?? 0) * heightScale;
      let maxSlopeExcess = 0;

      for (let step = 1; step <= steps; step++) {
        const distPx = step * stepSizePx;
        const sx = x + dirX * distPx;
        const sy = y + dirY * distPx;
        if (sx < 0 || sx > width - 1 || sy < 0 || sy > height - 1) break;

        const sampleZ = sampleHeightBilinear(heightField, width, height, sx, sy) * heightScale;
        const excess = sampleZ - (originZ + distPx * tanElevation);
        if (excess > 0) {
          const slopeExcess = excess / distPx;
          if (slopeExcess > maxSlopeExcess) maxSlopeExcess = slopeExcess;
        }
      }
      visibility[idx] =
        maxSlopeExcess <= 0 ? 1 : clamp(Math.exp(-sharpness * maxSlopeExcess), 0, 1);
    }
  }
  return visibility;
}

function evaluateSchlickFresnel(cosTheta: number, f0: number): number {
  const m = clamp(1 - cosTheta, 0, 1);
  return f0 + (1 - f0) * (m * m * m * m * m);
}

function smithG1GgX(nDotX: number, alphaSq: number): number {
  const u = Math.max(1e-4, nDotX);
  return (2 * u) / (u + Math.sqrt(alphaSq + (1 - alphaSq) * u * u));
}

/**
 * 임파스토 높이장·안료 캔버스 위에 사광 지평선 자가 그림자와
 * 에너지 보존 유전체 Cook-Torrance GGX + 람베르트 확산 셰이딩을 합성한다.
 */
export function composeImpastoRakingLight(
  canvas: ImpastoSurfaceCanvas,
  options: ImpastoRakingLightOptions
): ImpastoRakingComposeResult {
  const { width, height, heightField, albedoRgba } = canvas;
  const pixelCount = width * height;
  const heightScale = options.heightScale ?? 2.4;
  const lightIntensity = Math.max(0, options.lightIntensity ?? 1.15);
  const ambientIntensity = Math.max(0, options.ambientIntensity ?? 0.22);
  const lightColor = options.lightColorRgb ?? { r: 1.0, g: 0.98, b: 0.94 };

  const ior = Math.max(1.01, options.dielectricIor ?? 1.5);
  const f0 = Math.pow((ior - 1) / (ior + 1), 2);
  const roughness = clamp(options.roughness ?? 0.26, 0.06, 1.0);
  const alphaSq = Math.pow(roughness, 4);

  const normalField = deriveImpastoMicroNormals(heightField, width, height, {
    heightScale,
    kernel: options.normalKernel ?? "sobel",
  });
  const horizonVisibility = computeRakingHorizonShadows(heightField, width, height, {
    lightAzimuthDeg: options.lightAzimuthDeg,
    lightElevationDeg: options.lightElevationDeg,
    heightScale,
    shadowSteps: options.shadowSteps,
    shadowStepSizePx: options.shadowStepSizePx,
    shadowSharpness: options.shadowSharpness,
  });

  const azRad = (options.lightAzimuthDeg * Math.PI) / 180;
  const elRad = (clamp(options.lightElevationDeg, 1, 89.9) * Math.PI) / 180;
  const lx = Math.cos(elRad) * Math.cos(azRad);
  const ly = Math.cos(elRad) * Math.sin(azRad);
  const lz = Math.sin(elRad);

  const invHLen = 1 / Math.hypot(lx, ly, lz + 1);
  const hx = lx * invHLen;
  const hy = ly * invHLen;
  const hz = (lz + 1) * invHLen;
  const fresnelVH = evaluateSchlickFresnel(clamp(hz, 0, 1), f0);

  const shadedRgba = new Float32Array(pixelCount * 4);
  const paintedLuminances: number[] = [];
  let peakHeight = 0;
  let shadowedCount = 0;
  let glintCount = 0;

  for (let i = 0; i < pixelCount; i++) {
    const hVal = heightField[i] ?? 0;
    if (hVal > peakHeight) peakHeight = hVal;

    const nBase = i * 3;
    const nx = normalField[nBase] ?? 0;
    const ny = normalField[nBase + 1] ?? 0;
    const nz = normalField[nBase + 2] ?? 1;
    const nDotL = clamp(nx * lx + ny * ly + nz * lz, 0, 1);
    const nDotV = clamp(nz, 1e-4, 1);
    const nDotH = clamp(nx * hx + ny * hy + nz * hz, 0, 1);

    const shadowVis = horizonVisibility[i] ?? 1;
    if (hVal > 1e-4 && shadowVis < 0.65) shadowedCount += 1;

    let specBrdf = 0;
    if (nDotL > 0) {
      const denomD = nDotH * nDotH * (alphaSq - 1) + 1;
      const dTerm = alphaSq / (Math.PI * denomD * denomD);
      const gTerm = smithG1GgX(nDotV, alphaSq) * smithG1GgX(nDotL, alphaSq);
      specBrdf = (dTerm * gTerm * fresnelVH) / Math.max(1e-4, 4 * nDotV * nDotL);
    }

    const kd = (1 - evaluateSchlickFresnel(nDotL, f0)) * (1 - evaluateSchlickFresnel(nDotV, f0));
    const directIrradiance = lightIntensity * shadowVis * nDotL;
    const diffuseScale = ambientIntensity * (0.5 + 0.5 * nz) + directIrradiance * kd;
    const specContrib = directIrradiance * specBrdf;
    if (hVal > 1e-4 && specContrib > 0.12) glintCount += 1;

    const cBase = i * 4;
    const outR = clamp((albedoRgba[cBase] ?? 0) * diffuseScale + lightColor.r * specContrib, 0, 1);
    const outG = clamp((albedoRgba[cBase + 1] ?? 0) * diffuseScale + lightColor.g * specContrib, 0, 1);
    const outB = clamp((albedoRgba[cBase + 2] ?? 0) * diffuseScale + lightColor.b * specContrib, 0, 1);

    shadedRgba[cBase] = outR;
    shadedRgba[cBase + 1] = outG;
    shadedRgba[cBase + 2] = outB;
    shadedRgba[cBase + 3] = albedoRgba[cBase + 3] ?? 1;

    if (hVal > 1e-4) {
      paintedLuminances.push(0.2126 * outR + 0.7152 * outG + 0.0722 * outB);
    }
  }

  let luminanceMean = 0;
  for (const lum of paintedLuminances) luminanceMean += lum;
  if (paintedLuminances.length > 0) luminanceMean /= paintedLuminances.length;

  let varianceSum = 0;
  for (const lum of paintedLuminances) {
    const diff = lum - luminanceMean;
    varianceSum += diff * diff;
  }
  const luminanceStdDev =
    paintedLuminances.length > 0 ? Math.sqrt(varianceSum / paintedLuminances.length) : 0;

  return {
    width,
    height,
    shadedRgba,
    normalField,
    horizonVisibility,
    peakHeight,
    luminanceMean,
    luminanceStdDev,
    reliefContrastRatio: luminanceMean > 1e-6 ? luminanceStdDev / luminanceMean : 0,
    shadowedPixelFraction:
      paintedLuminances.length > 0 ? shadowedCount / paintedLuminances.length : 0,
    specularGlintPixelCount: glintCount,
  };
}
