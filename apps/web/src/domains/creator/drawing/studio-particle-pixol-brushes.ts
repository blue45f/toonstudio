/**
 * Wave 22: Corel Painter 입자 물리(Spring/Gravity/Curl-Flow)·WeaveSilk 이면군($D_n$) 조화 리본·
 * SculptGL/ZBrush 2.5D Pixol MatCap 부조·HeavyPaint 블록인·ArtRage(Gloop/Felt/Glitter)·
 * Adobe Fresco 다중색 스와치·Piskel/Pixelorama 픽셀 램프·Milton 슈퍼샘플 캡슐 SDF 클린룸 커널.
 */

export interface ParticlePixolPoint2D {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function createSeededRng(seed: number): () => number {
  let state = (Math.trunc(Number.isFinite(seed) ? seed : 1) ^ 0x9e3779b9) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 1. Corel Painter Particle Brushes (Spring / Gravity / Curl-Flow)
// ============================================================================

export type CorelParticlePhysicsFamily = "spring" | "gravity" | "curl_flow";

export type CorelParticlePresetId =
  | "silk-harmonic-spring"
  | "spiderweb-tension"
  | "hair-lock-spring"
  | "rain-ballistic-splatter"
  | "welding-sparks-bounce"
  | "waterfall-mist-gravity"
  | "cosmic-nebula-curl"
  | "phoenix-flame-wisp"
  | "marble-vein-advection";

export interface CorelParticlePreset {
  readonly id: CorelParticlePresetId;
  readonly labelKo: string;
  readonly family: CorelParticlePhysicsFamily;
  readonly emitterCount: number;
  readonly springStiffness: number;
  readonly damping01: number;
  readonly gravityY: number;
  readonly curlFrequency: number;
}

export const COREL_PARTICLE_BRUSH_PRESETS: readonly CorelParticlePreset[] = [
  { id: "silk-harmonic-spring", labelKo: "실크 조화 스프링 입자", family: "spring", emitterCount: 12, springStiffness: 0.24, damping01: 0.82, gravityY: 0, curlFrequency: 0.02 },
  { id: "spiderweb-tension", labelKo: "거미줄 장력 스프링 입자", family: "spring", emitterCount: 10, springStiffness: 0.35, damping01: 0.76, gravityY: 0.1, curlFrequency: 0.015 },
  { id: "hair-lock-spring", labelKo: "웹툰 머리카락 다발 스프링", family: "spring", emitterCount: 14, springStiffness: 0.28, damping01: 0.85, gravityY: 0.05, curlFrequency: 0.01 },
  { id: "rain-ballistic-splatter", labelKo: "폭우 탄도 중력 입자", family: "gravity", emitterCount: 12, springStiffness: 0.04, damping01: 0.92, gravityY: 1.8, curlFrequency: 0.01 },
  { id: "welding-sparks-bounce", labelKo: "용접 불꽃 반발 탄도 입자", family: "gravity", emitterCount: 16, springStiffness: 0.05, damping01: 0.88, gravityY: 1.35, curlFrequency: 0.03 },
  { id: "waterfall-mist-gravity", labelKo: "폭포 물보라 중력 입자", family: "gravity", emitterCount: 14, springStiffness: 0.08, damping01: 0.9, gravityY: 1.5, curlFrequency: 0.025 },
  { id: "cosmic-nebula-curl", labelKo: "성운 컬-노이즈 유동 입자", family: "curl_flow", emitterCount: 12, springStiffness: 0.1, damping01: 0.86, gravityY: -0.1, curlFrequency: 0.045 },
  { id: "phoenix-flame-wisp", labelKo: "불사조 화염 와류 입자", family: "curl_flow", emitterCount: 14, springStiffness: 0.12, damping01: 0.84, gravityY: -0.65, curlFrequency: 0.055 },
  { id: "marble-vein-advection", labelKo: "대리석 결 이류 입자", family: "curl_flow", emitterCount: 10, springStiffness: 0.15, damping01: 0.89, gravityY: 0, curlFrequency: 0.038 },
] as const;

export interface CorelParticleTrajectorySegment {
  readonly emitterIndex: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly opacity01: number;
  readonly widthPx: number;
}

/**
 * Corel Painter 3대 입자 브러시(Spring/Gravity/Curl-Flow) 물리 궤적 합성기.
 */
export function stepCorelPainterParticleBrush(params: {
  readonly presetId: CorelParticlePresetId;
  readonly points: readonly ParticlePixolPoint2D[];
  readonly radiusPx?: number;
  readonly seed?: number;
}): readonly CorelParticleTrajectorySegment[] {
  const preset =
    COREL_PARTICLE_BRUSH_PRESETS.find((item) => item.id === params.presetId) ??
    COREL_PARTICLE_BRUSH_PRESETS[0];
  const valid = params.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length < 2) return [];

  const radius = clampRange(params.radiusPx ?? 20, 2, 160, 20);
  const rng = createSeededRng(params.seed ?? 701);
  const count = preset.emitterCount;

  const posX = new Float64Array(count);
  const posY = new Float64Array(count);
  const velX = new Float64Array(count);
  const velY = new Float64Array(count);

  for (let e = 0; e < count; e += 1) {
    const angle = (e / count) * Math.PI * 2;
    const r = radius * (0.25 + 0.75 * rng());
    posX[e] = valid[0].x + Math.cos(angle) * r;
    posY[e] = valid[0].y + Math.sin(angle) * r;
    velX[e] = (rng() - 0.5) * 2;
    velY[e] = (rng() - 0.5) * 2;
  }

  const segments: CorelParticleTrajectorySegment[] = [];

  for (let i = 1; i < valid.length; i += 1) {
    const pt = valid[i];
    const pressure = clamp01(pt.pressure01 ?? 0.75);

    for (let e = 0; e < count; e += 1) {
      const prevX = posX[e];
      const prevY = posY[e];
      const phaseAngle = (e / count) * Math.PI * 2 + i * 0.18;
      const anchorX = pt.x + Math.cos(phaseAngle) * radius * 0.45;
      const anchorY = pt.y + Math.sin(phaseAngle) * radius * 0.45;

      if (preset.family === "spring") {
        const fx = (anchorX - prevX) * preset.springStiffness;
        const fy = (anchorY - prevY) * preset.springStiffness;
        velX[e] = (velX[e] + fx) * preset.damping01;
        velY[e] = (velY[e] + fy + preset.gravityY) * preset.damping01;
      } else if (preset.family === "gravity") {
        const pullX = (anchorX - prevX) * preset.springStiffness;
        const pullY = (anchorY - prevY) * preset.springStiffness;
        velX[e] = (velX[e] + pullX + (rng() - 0.5) * 1.4) * preset.damping01;
        velY[e] = (velY[e] + pullY + preset.gravityY * (1 + pressure)) * preset.damping01;
      } else {
        // 2D 무발산(Divergence-Free) Curl-Noise 포텐셜 ψ(x, y) = sin(ωx)cos(ωy)
        const omega = preset.curlFrequency;
        const curlVx = -Math.sin(prevX * omega) * Math.sin(prevY * omega) * 3.2;
        const curlVy = -Math.cos(prevX * omega) * Math.cos(prevY * omega) * 3.2;
        velX[e] = (velX[e] + (anchorX - prevX) * preset.springStiffness + curlVx) * preset.damping01;
        velY[e] = (velY[e] + (anchorY - prevY) * preset.springStiffness + curlVy + preset.gravityY) * preset.damping01;
      }

      const nextX = prevX + velX[e];
      const nextY = prevY + velY[e];
      posX[e] = nextX;
      posY[e] = nextY;

      segments.push({
        emitterIndex: e,
        x0: prevX,
        y0: prevY,
        x1: nextX,
        y1: nextY,
        opacity01: clampRange(0.2 + 0.65 * pressure * (1 - e / (count * 1.4)), 0.1, 0.95, 0.5),
        widthPx: Math.max(0.6, (radius / count) * (0.7 + 0.6 * pressure)),
      });
    }
  }

  return segments;
}

// ============================================================================
// 2. WeaveSilk Symmetrical Harmonic Ribbon Glow Brush (D_n Symmetry)
// ============================================================================

export interface WeaveSilkRibbonVertex {
  readonly sectorIndex: number;
  readonly mirrored: boolean;
  readonly x: number;
  readonly y: number;
  readonly hueDeg: number;
  readonly glowAlpha01: number;
}

/**
 * WeaveSilk 이면군($D_n$) 회전·거울 대칭 + 이중 나선 조화 진동자 리본 생성기.
 */
export function synthesizeWeaveSilkSymmetryRibbons(params: {
  readonly points: readonly ParticlePixolPoint2D[];
  readonly centerX: number;
  readonly centerY: number;
  readonly symmetryFolds?: number;
  readonly mirrorSector?: boolean;
  readonly spiralAmplitudePx?: number;
  readonly baseHueDeg?: number;
}): readonly WeaveSilkRibbonVertex[] {
  const valid = params.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return [];

  const folds = Math.round(clampRange(params.symmetryFolds ?? 6, 2, 16, 6));
  const mirror = params.mirrorSector !== false;
  const amp = clampRange(params.spiralAmplitudePx ?? 10, 0, 80, 10);
  const baseHue = params.baseHueDeg ?? 210;
  const vertices: WeaveSilkRibbonVertex[] = [];

  for (let i = 0; i < valid.length; i += 1) {
    const pt = valid[i];
    const phase = i * 0.35;
    const oscX = Math.cos(phase) * amp;
    const oscY = Math.sin(phase * 1.5) * amp;
    const relX = pt.x + oscX - params.centerX;
    const relY = pt.y + oscY - params.centerY;
    const hueDeg = (baseHue + i * 4.5) % 360;
    const glowAlpha01 = clampRange(0.28 + 0.52 * (pt.pressure01 ?? 0.75), 0.15, 0.9, 0.55);

    for (let s = 0; s < folds; s += 1) {
      const theta = (s * Math.PI * 2) / folds;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const rotX = relX * cosT - relY * sinT;
      const rotY = relX * sinT + relY * cosT;

      vertices.push({
        sectorIndex: s,
        mirrored: false,
        x: params.centerX + rotX,
        y: params.centerY + rotY,
        hueDeg,
        glowAlpha01,
      });

      if (mirror) {
        const mirX = -relX * cosT - relY * sinT;
        const mirY = -relX * sinT + relY * cosT;
        vertices.push({
          sectorIndex: s,
          mirrored: true,
          x: params.centerX + mirX,
          y: params.centerY + mirY,
          hueDeg: (hueDeg + 25) % 360,
          glowAlpha01: glowAlpha01 * 0.85,
        });
      }
    }
  }

  return vertices;
}

// ============================================================================
// 3. SculptGL / ZBrush 2.5D Pixol Relief & MatCap Brush
// ============================================================================

export type SculptGlBrushMode =
  | "standard"
  | "clay"
  | "inflate"
  | "crease"
  | "flatten"
  | "pinch"
  | "smooth";

export interface Pixol25DSampleResult {
  readonly x: number;
  readonly y: number;
  readonly heightZ: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly matCapU01: number;
  readonly matCapV01: number;
  readonly quarticFalloff01: number;
}

/**
 * REA `sculptgl-Brush.js` / `sculptgl-Crease.js` / `sculptgl-Flatten.js` (`ev_b116ab58b81a3c1b837bf82855bc8b574fefc8c0c8fda21399c1a6ef8a725df1`)
 * 정밀 수식 내재화:
 * 4차 다항식 폴오프 `f(d) = 3d^4 - 4d^3 + 1` ($d \in [0, 1]$) 및 MatCap 구면 법선 UV 투영.
 */
export function evaluateSculptGlQuarticFalloff01(normalizedDist01: number): number {
  if (!Number.isFinite(normalizedDist01) || normalizedDist01 >= 1) return 0;
  if (normalizedDist01 <= 0) return 1;
  const d = normalizedDist01;
  const d2 = d * d;
  return clamp01(3 * d2 * d2 - 4 * d2 * d + 1);
}

export function applySculptGlPixol25DBrushDab(params: {
  readonly mode: SculptGlBrushMode;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusPx: number;
  readonly intensity01: number;
  readonly sampleX: number;
  readonly sampleY: number;
  readonly currentHeightZ: number;
  readonly planeAverageHeightZ?: number;
  readonly negative?: boolean;
}): Pixol25DSampleResult {
  const radius = Math.max(1, params.radiusPx);
  const dx = params.sampleX - params.centerX;
  const dy = params.sampleY - params.centerY;
  const dist01 = Math.hypot(dx, dy) / radius;
  const falloff = evaluateSculptGlQuarticFalloff01(dist01);
  const sign = params.negative ? -1 : 1;
  const intensity = clamp01(params.intensity01);

  let nextZ = params.currentHeightZ;
  if (falloff > 0) {
    if (params.mode === "standard" || params.mode === "inflate") {
      const gain = params.mode === "inflate" ? 0.16 : 0.1;
      nextZ += sign * falloff * intensity * radius * gain;
    } else if (params.mode === "clay") {
      const targetPlaneZ = (params.planeAverageHeightZ ?? params.currentHeightZ) + sign * radius * 0.1;
      const distToPlane = nextZ - targetPlaneZ;
      if (distToPlane * sign < 0) {
        nextZ -= distToPlane * falloff * intensity;
      }
    } else if (params.mode === "crease") {
      // SculptGL Crease: Math.pow(fallOff, 5) 날카로운 홈/능선
      const sharpCrease = Math.pow(falloff, 5) * intensity * radius * 0.12;
      nextZ += (params.negative !== false ? -1 : 1) * sharpCrease;
    } else if (params.mode === "flatten") {
      const planeZ = params.planeAverageHeightZ ?? 0;
      nextZ -= (nextZ - planeZ) * falloff * intensity;
    } else if (params.mode === "pinch") {
      nextZ += sign * falloff * (1 - dist01) * intensity * radius * 0.05;
    } else if (params.mode === "smooth") {
      const avgZ = params.planeAverageHeightZ ?? 0;
      nextZ = nextZ * (1 - falloff * intensity) + avgZ * (falloff * intensity);
    }
  }

  // 해석적 법선 근사 (df/dx, df/dy) -> MatCap UV (0.5 + 0.5*nx, 0.5 - 0.5*ny)
  const dFalloffDr = dist01 > 0 && dist01 < 1 ? 12 * dist01 * dist01 * (dist01 - 1) : 0;
  const gradScale = (-dFalloffDr * intensity * sign) / radius;
  const gx = dist01 > 1e-4 ? (dx / (dist01 * radius)) * gradScale : 0;
  const gy = dist01 > 1e-4 ? (dy / (dist01 * radius)) * gradScale : 0;
  const invLen = 1 / Math.hypot(gx, gy, 1);
  const nx = -gx * invLen;
  const ny = -gy * invLen;
  const nz = invLen;

  return {
    x: params.sampleX,
    y: params.sampleY,
    heightZ: nextZ,
    normalX: nx,
    normalY: ny,
    normalZ: nz,
    matCapU01: clamp01(0.5 + 0.5 * nx),
    matCapV01: clamp01(0.5 - 0.5 * ny),
    quarticFalloff01: falloff,
  };
}

// ============================================================================
// 4. HeavyPaint Block-In / ArtRage Gloop-Felt / Fresco Multicolor Swatch
// ============================================================================

export type HeavyPaintToolKind = "rake" | "fan" | "fill_lasso" | "dry_slab" | "air_grad";

export interface HeavyPaintBlockSlab {
  readonly kind: HeavyPaintToolKind;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly angleDeg: number;
  readonly hueShiftDeg: number;
  readonly lightnessShift01: number;
}

/**
 * HeavyPaint 스타일 그래픽 블록인(Block-In) 브러시: 스트로크별 HSB Note Jitter + 각진 슬래브 스탬프.
 */
export function synthesizeHeavyPaintBlockInPolygons(params: {
  readonly kind: HeavyPaintToolKind;
  readonly points: readonly ParticlePixolPoint2D[];
  readonly baseSizePx?: number;
  readonly colorJitter01?: number;
  readonly seed?: number;
}): readonly HeavyPaintBlockSlab[] {
  const valid = params.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return [];
  const size = clampRange(params.baseSizePx ?? 28, 4, 200, 28);
  const jitter = clamp01(params.colorJitter01 ?? 0.25);
  const rng = createSeededRng(params.seed ?? 909);

  return valid.map((pt, idx) => {
    const prev = idx > 0 ? valid[idx - 1] : pt;
    const angleDeg =
      params.kind === "fan"
        ? idx * 14 - 45
        : (Math.atan2(pt.y - prev.y, pt.x - prev.x) * 180) / Math.PI;
    const aspect = params.kind === "rake" ? 0.35 : params.kind === "dry_slab" ? 0.5 : 0.85;
    return {
      kind: params.kind,
      x: pt.x,
      y: pt.y,
      widthPx: size * (0.7 + 0.3 * (pt.pressure01 ?? 0.8)),
      heightPx: size * aspect,
      angleDeg,
      hueShiftDeg: (rng() * 2 - 1) * jitter * 24,
      lightnessShift01: (rng() * 2 - 1) * jitter * 0.15,
    };
  });
}

export interface ArtRageFrescoStepEvaluation {
  readonly gloopViscosityRadiusPx: number;
  readonly copicSecondCoatDarkening01: number;
  readonly multicolorBandRgb: readonly { readonly offsetNorm: number; readonly hexColor: string }[];
}

/**
 * ArtRage Gloop Pen(저속 점성 방울 팽창 ↔ 고속 병목 수축) + Copic Felt 마커 2차 덧칠 암화 +
 * Adobe Fresco 다중색 스와치(Multicolor Swatch) 횡방향 색띠 투영.
 */
export function evaluateArtRageAndFrescoBrushStep(params: {
  readonly baseRadiusPx: number;
  readonly speedPxPerFrame: number;
  readonly pressure01: number;
  readonly existingWetness01: number;
  readonly swatchPaletteHex: readonly string[];
}): ArtRageFrescoStepEvaluation {
  const r = clampRange(params.baseRadiusPx, 1, 200, 18);
  const speed = Math.max(0, params.speedPxPerFrame);
  const p = clamp01(params.pressure01);
  // Gloop Pen: 정지·저속일수록 표면장력 방울이 부풀고, 고속일수록 가늘게 늘어남
  const viscositySwelling = 1 + 1.15 / (1 + speed * 0.18);
  const neckThinning = Math.max(0.28, 1 - speed * 0.015);
  const gloopViscosityRadiusPx = r * viscositySwelling * neckThinning * (0.45 + 0.55 * p);

  // Copic 알코올 마커: 기존 알코올 습윤층 위에 덧칠할 때 Beer-Lambert 암화
  const copicSecondCoatDarkening01 = clamp01(params.existingWetness01 * 0.42 + p * 0.25);

  const palette =
    params.swatchPaletteHex.length > 0
      ? params.swatchPaletteHex
      : ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"];
  const multicolorBandRgb = palette.map((hexColor, idx) => ({
    offsetNorm: palette.length === 1 ? 0 : (idx / (palette.length - 1)) * 2 - 1,
    hexColor,
  }));

  return {
    gloopViscosityRadiusPx,
    copicSecondCoatDarkening01,
    multicolorBandRgb,
  };
}

// ============================================================================
// 5. Piskel / Pixelorama Pixel-Art Suite & Milton 4x RGSS Capsule SDF
// ============================================================================

export interface PixelArtAdvancedStepResult {
  readonly col: number;
  readonly row: number;
  readonly outputHex: string;
  readonly mirroredCol: number;
}

/**
 * REA `piskel-DitheringTool.js` (`(col + row) % 2`), `piskel-Lighten.js` (`oncePerPixel`),
 * `piskel-VerticalMirrorPen.js` 및 Pixelorama 팔레트 인덱스 램프 셰이딩 결합 커널.
 */
export function applyPixelArtAdvancedBrush(params: {
  readonly mode: "checker_dither" | "palette_ramp_lighten" | "palette_ramp_darken";
  readonly col: number;
  readonly row: number;
  readonly canvasWidthCols: number;
  readonly currentColorIndex: number;
  readonly paletteHexRamp: readonly string[];
  readonly secondaryColorHex?: string;
  readonly rightButtonInverted?: boolean;
}): PixelArtAdvancedStepResult {
  const col = Math.trunc(params.col);
  const row = Math.trunc(params.row);
  const ramp =
    params.paletteHexRamp.length > 0
      ? params.paletteHexRamp
      : ["#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070", "#38b764", "#f4f4f4"];
  const safeIdx = Math.max(0, Math.min(ramp.length - 1, Math.trunc(params.currentColorIndex)));

  let outputHex = ramp[safeIdx];
  if (params.mode === "checker_dither") {
    let usePrimary = (Math.abs(col + row) % 2) === 1;
    if (params.rightButtonInverted) usePrimary = !usePrimary;
    outputHex = usePrimary ? ramp[safeIdx] : (params.secondaryColorHex ?? ramp[0]);
  } else if (params.mode === "palette_ramp_lighten") {
    outputHex = ramp[Math.min(ramp.length - 1, safeIdx + 1)];
  } else if (params.mode === "palette_ramp_darken") {
    outputHex = ramp[Math.max(0, safeIdx - 1)];
  }

  return {
    col,
    row,
    outputHex,
    mirroredCol: Math.max(0, params.canvasWidthCols - 1 - col),
  };
}

/**
 * Milton 무한 캔버스 스타일 4× 회전 격자 슈퍼샘플링(RGSS) 해석적 캡슐 SDF 커버리지 평가기.
 */
export function evaluateMiltonAnalyticalCapsuleSdfCoverage01(params: {
  readonly pixelCenterX: number;
  readonly pixelCenterY: number;
  readonly segAx: number;
  readonly segAy: number;
  readonly segBx: number;
  readonly segBy: number;
  readonly radiusA: number;
  readonly radiusB: number;
}): number {
  // 4x RGSS 서브픽셀 오프셋
  const rgssOffsets: readonly [number, number][] = [
    [-0.125, -0.375],
    [0.375, -0.125],
    [-0.375, 0.125],
    [0.125, 0.375],
  ];

  const abx = params.segBx - params.segAx;
  const aby = params.segBy - params.segAy;
  const abLenSq = abx * abx + aby * aby;

  let insideAccum = 0;
  for (const [ox, oy] of rgssOffsets) {
    const px = params.pixelCenterX + ox;
    const py = params.pixelCenterY + oy;
    const t =
      abLenSq > 1e-6
        ? clamp01(((px - params.segAx) * abx + (py - params.segAy) * aby) / abLenSq)
        : 0;
    const closestX = params.segAx + abx * t;
    const closestY = params.segAy + aby * t;
    const radiusAtT = Math.max(0.25, params.radiusA + (params.radiusB - params.radiusA) * t);
    const sdf = Math.hypot(px - closestX, py - closestY) - radiusAtT;

    // 0.5px 폭 스무스스텝 안티에일리어싱
    if (sdf <= -0.5) {
      insideAccum += 1;
    } else if (sdf < 0.5) {
      const u = clamp01(0.5 - sdf);
      insideAccum += u * u * (3 - 2 * u);
    }
  }

  return insideAccum * 0.25;
}
