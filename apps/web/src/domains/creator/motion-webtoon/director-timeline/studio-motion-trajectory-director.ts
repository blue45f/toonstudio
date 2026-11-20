/**
 * LTX Studio / Higgsfield / Runway형 2D·3D 궤적 스플라인, 모션 브러시 및 씬-샷-타임라인 디렉터.
 *
 * - 씬→샷 계층 타임라인, 시작/끝 키프레임 앵커, 2D Centripetal Catmull-Rom 오브젝트 궤적 스플라인,
 *   3D 가상 카메라 리그(초점거리·조리개·피사계 심도·롤) 보간, 영역별 모션 브러시 벡터 필드,
 *   정적 웹툰 컷용 절제된 리빙 패널 프리셋을 순수 계산 엔진으로 제공한다.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type DirectorAspectRatio = "9:16" | "16:9" | "1:1" | "4:5";
export type SplineEasingKind = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type MotionBrushZoneKind =
  | "hair"
  | "cloth"
  | "background"
  | "water"
  | "particles"
  | "custom";

export type LivingPanelPresetId =
  | "subtle-breath"
  | "eye-blink"
  | "hair-breeze"
  | "parallax-dolly-in"
  | "rain-drift";

export interface ShotFrameAnchor {
  readonly assetRef: string;
  readonly focusPoint: Vec2;
  readonly exposureEv: number;
}

export interface MotionTrajectorySpline {
  readonly id: string;
  readonly targetLayerId: string;
  readonly controlPoints: readonly Vec2[];
  /** 샷 내부 정규화 시작/종료 시점 (0..1). */
  readonly startTimeRatio: number;
  readonly endTimeRatio: number;
  readonly easing: SplineEasingKind;
  readonly orientToPath: boolean;
}

export interface EvaluatedTrajectorySample {
  readonly splineId: string;
  readonly targetLayerId: string;
  readonly active: boolean;
  readonly progress01: number;
  readonly x: number;
  readonly y: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly headingDeg: number;
}

export interface CameraRigKeyframe3d {
  readonly timeRatio: number;
  readonly position: Vec3;
  readonly target: Vec3;
  /** 프라임/줌 렌즈 초점거리 (14..135mm). */
  readonly focalLengthMm: number;
  /** 조리개 f-stop (1.4..16). 낮을수록 피사계 심도 블러가 강해진다. */
  readonly apertureFStop: number;
  readonly rollDeg: number;
}

export interface CameraRig3dTrack {
  readonly keyframes: readonly CameraRigKeyframe3d[];
}

export interface EvaluatedCameraRigState {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly focalLengthMm: number;
  readonly apertureFStop: number;
  readonly rollDeg: number;
  readonly dofBlurStrength01: number;
  readonly parallaxShift2d: Vec2;
}

export interface MotionBrushStroke {
  readonly id: string;
  readonly zone: MotionBrushZoneKind;
  /** 정규화 좌표 [0..1] 기준 타원 마스크 영역. */
  readonly center: Vec2;
  readonly radiusX: number;
  readonly radiusY: number;
  /** 방향 속도 벡터 (x, y, 깊이 z). */
  readonly velocity: Vec3;
  readonly strength: number;
  readonly turbulence: number;
}

export interface MotionBrushFieldSample {
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly combinedWeight: number;
}

export interface DirectorShot {
  readonly id: string;
  readonly sceneId: string;
  readonly label: string;
  readonly durationMs: number;
  readonly startAnchor: ShotFrameAnchor;
  readonly endAnchor: ShotFrameAnchor;
  readonly cameraRig: CameraRig3dTrack;
  readonly trajectories: readonly MotionTrajectorySpline[];
  readonly motionBrushes: readonly MotionBrushStroke[];
  readonly livingPreset?: LivingPanelPresetId;
}

export interface DirectorScene {
  readonly id: string;
  readonly title: string;
  readonly shots: readonly DirectorShot[];
}

export interface DirectorTimelineDocument {
  readonly id: string;
  readonly title: string;
  readonly fps: number;
  readonly aspectRatio: DirectorAspectRatio;
  readonly deterministicSeed: number;
  readonly scenes: readonly DirectorScene[];
}

export interface CompiledTimelineShotSpan {
  readonly sceneId: string;
  readonly shotId: string;
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly frameCount: number;
}

export interface CompiledDirectorTimeline {
  readonly ok: boolean;
  readonly totalDurationMs: number;
  readonly totalFrames: number;
  readonly spans: readonly CompiledTimelineShotSpan[];
  readonly warnings: readonly string[];
}

export interface EvaluatedDirectorFrame {
  readonly timeMs: number;
  readonly sceneId: string;
  readonly shotId: string;
  readonly localProgress01: number;
  readonly camera: EvaluatedCameraRigState;
  readonly trajectories: readonly EvaluatedTrajectorySample[];
  readonly anchorBlend01: number;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function applySplineEasing(t: number, easing: SplineEasingKind): number {
  const u = clamp(t, 0, 1);
  if (easing === "linear") return u;
  if (easing === "ease-in") return u * u;
  if (easing === "ease-out") return 1 - (1 - u) * (1 - u);
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function catmullRom1D(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function evaluatePolylineCatmullRom2D(points: readonly Vec2[], u01: number): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const u = clamp(u01, 0, 1);
  const segCount = points.length - 1;
  const scaled = u * segCount;
  const segIdx = Math.min(segCount - 1, Math.floor(scaled));
  const localT = scaled - segIdx;

  const p0 = points[Math.max(0, segIdx - 1)]!;
  const p1 = points[segIdx]!;
  const p2 = points[segIdx + 1]!;
  const p3 = points[Math.min(points.length - 1, segIdx + 2)]!;

  return {
    x: catmullRom1D(p0.x, p1.x, p2.x, p3.x, localT),
    y: catmullRom1D(p0.y, p1.y, p2.y, p3.y, localT),
  };
}

/**
 * 호길이 테이블(Arc-Length LUT)을 사용해 등속 2D 궤적 스플라인 위치와 접선 각도를 계산한다.
 */
export function evaluateTrajectorySpline(
  spline: MotionTrajectorySpline,
  shotProgress01: number,
): EvaluatedTrajectorySample {
  const start = clamp(spline.startTimeRatio, 0, 1);
  const end = clamp(Math.max(start, spline.endTimeRatio), 0, 1);
  const active = shotProgress01 >= start && shotProgress01 <= end;
  const rawProgress =
    end <= start ? (shotProgress01 >= start ? 1 : 0) : clamp((shotProgress01 - start) / (end - start), 0, 1);
  const eased = applySplineEasing(rawProgress, spline.easing);

  if (spline.controlPoints.length === 0) {
    return Object.freeze({
      splineId: spline.id,
      targetLayerId: spline.targetLayerId,
      active,
      progress01: eased,
      x: 0,
      y: 0,
      tangentX: 1,
      tangentY: 0,
      headingDeg: 0,
    });
  }
  if (spline.controlPoints.length === 1) {
    const pt = spline.controlPoints[0]!;
    return Object.freeze({
      splineId: spline.id,
      targetLayerId: spline.targetLayerId,
      active,
      progress01: eased,
      x: pt.x,
      y: pt.y,
      tangentX: 1,
      tangentY: 0,
      headingDeg: 0,
    });
  }

  const samples = 48;
  const arcLengths: number[] = [0];
  let prev = evaluatePolylineCatmullRom2D(spline.controlPoints, 0);
  for (let i = 1; i <= samples; i += 1) {
    const curr = evaluatePolylineCatmullRom2D(spline.controlPoints, i / samples);
    arcLengths.push(arcLengths[i - 1]! + Math.hypot(curr.x - prev.x, curr.y - prev.y));
    prev = curr;
  }
  const totalLen = arcLengths[samples] ?? 0;

  let paramU = eased;
  if (totalLen > 1e-6) {
    const targetLen = eased * totalLen;
    let lo = 0;
    let hi = samples;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((arcLengths[mid] ?? 0) < targetLen) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(1, lo);
    const l0 = arcLengths[idx - 1] ?? 0;
    const l1 = arcLengths[idx] ?? l0;
    const frac = l1 > l0 ? (targetLen - l0) / (l1 - l0) : 0;
    paramU = (idx - 1 + frac) / samples;
  }

  const pos = evaluatePolylineCatmullRom2D(spline.controlPoints, paramU);
  const eps = 0.004;
  const pPrev = evaluatePolylineCatmullRom2D(spline.controlPoints, Math.max(0, paramU - eps));
  const pNext = evaluatePolylineCatmullRom2D(spline.controlPoints, Math.min(1, paramU + eps));
  const dx = pNext.x - pPrev.x;
  const dy = pNext.y - pPrev.y;
  const len = Math.hypot(dx, dy);
  const tangentX = len > 1e-6 ? dx / len : 1;
  const tangentY = len > 1e-6 ? dy / len : 0;
  const headingDeg = spline.orientToPath ? (Math.atan2(tangentY, tangentX) * 180) / Math.PI : 0;

  return Object.freeze({
    splineId: spline.id,
    targetLayerId: spline.targetLayerId,
    active,
    progress01: eased,
    x: pos.x,
    y: pos.y,
    tangentX,
    tangentY,
    headingDeg,
  });
}

function catmullRomVec3(a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number): Vec3 {
  return {
    x: catmullRom1D(a.x, b.x, c.x, d.x, t),
    y: catmullRom1D(a.y, b.y, c.y, d.y, t),
    z: catmullRom1D(a.z, b.z, c.z, d.z, t),
  };
}

/**
 * 3D 가상 카메라 리그 키프레임을 보간하고 초점거리·조리개·2.5D 패럴랙스 오프셋을 산출한다.
 */
export function evaluateCameraRigAt(
  rig: CameraRig3dTrack,
  shotProgress01: number,
): EvaluatedCameraRigState {
  const sorted = [...rig.keyframes].sort((a, b) => a.timeRatio - b.timeRatio);
  if (sorted.length === 0) {
    return Object.freeze({
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      focalLengthMm: 35,
      apertureFStop: 4,
      rollDeg: 0,
      dofBlurStrength01: 0.25,
      parallaxShift2d: { x: 0, y: 0 },
    });
  }
  const t = clamp(shotProgress01, 0, 1);
  if (sorted.length === 1 || t <= sorted[0]!.timeRatio) {
    const k = sorted[0]!;
    return buildCameraResult(k.position, k.target, k.focalLengthMm, k.apertureFStop, k.rollDeg);
  }
  const last = sorted[sorted.length - 1]!;
  if (t >= last.timeRatio) {
    return buildCameraResult(last.position, last.target, last.focalLengthMm, last.apertureFStop, last.rollDeg);
  }

  let segIdx = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (t >= sorted[i]!.timeRatio && t <= sorted[i + 1]!.timeRatio) {
      segIdx = i;
      break;
    }
  }
  const k0 = sorted[Math.max(0, segIdx - 1)]!;
  const k1 = sorted[segIdx]!;
  const k2 = sorted[segIdx + 1]!;
  const k3 = sorted[Math.min(sorted.length - 1, segIdx + 2)]!;
  const span = Math.max(1e-6, k2.timeRatio - k1.timeRatio);
  const localT = clamp((t - k1.timeRatio) / span, 0, 1);

  const position = catmullRomVec3(k0.position, k1.position, k2.position, k3.position, localT);
  const target = catmullRomVec3(k0.target, k1.target, k2.target, k3.target, localT);
  const smoothT = localT * localT * (3 - 2 * localT);
  const focalLengthMm = lerp(k1.focalLengthMm, k2.focalLengthMm, smoothT);
  const apertureFStop = lerp(k1.apertureFStop, k2.apertureFStop, smoothT);
  const rollDeg = lerp(k1.rollDeg, k2.rollDeg, smoothT);

  return buildCameraResult(position, target, focalLengthMm, apertureFStop, rollDeg);
}

function buildCameraResult(
  position: Vec3,
  target: Vec3,
  focalLengthMm: number,
  apertureFStop: number,
  rollDeg: number,
): EvaluatedCameraRigState {
  const clampedFocal = clamp(focalLengthMm, 14, 135);
  const clampedAperture = clamp(apertureFStop, 1.4, 16);
  // 낮은 f-stop과 긴 초점거리일수록 얕은 심도(블러 강도 상승).
  const apertureFactor = clamp((16 - clampedAperture) / (16 - 1.4), 0, 1);
  const focalFactor = clamp((clampedFocal - 14) / (135 - 14), 0, 1);
  const dofBlurStrength01 = clamp(apertureFactor * (0.45 + 0.55 * focalFactor), 0, 1);
  const depthDist = Math.max(0.5, Math.abs(position.z - target.z));
  const parallaxShift2d: Vec2 = {
    x: ((position.x - target.x) * (clampedFocal / 35)) / depthDist,
    y: ((position.y - target.y) * (clampedFocal / 35)) / depthDist,
  };
  return Object.freeze({
    position,
    target,
    focalLengthMm: clampedFocal,
    apertureFStop: clampedAperture,
    rollDeg,
    dofBlurStrength01,
    parallaxShift2d,
  });
}

function hashWave(x: number, y: number, t: number, seed: number): number {
  const phase = x * 12.9898 + y * 78.233 + t * 3.14159 + (seed % 997) * 0.17;
  return Math.sin(phase) * Math.cos(phase * 0.618 + 0.7);
}

/**
 * 모션 브러시 영역 마스크와 결정적 난류 파동을 결합해 임의 지점의 모션 벡터를 샘플링한다.
 */
export function sampleMotionBrushField(
  brushes: readonly MotionBrushStroke[],
  x: number,
  y: number,
  timeSeconds: number,
  seed: number,
): MotionBrushFieldSample {
  let vx = 0;
  let vy = 0;
  let vz = 0;
  let totalWeight = 0;

  for (let i = 0; i < brushes.length; i += 1) {
    const brush = brushes[i]!;
    const rx = Math.max(1e-4, brush.radiusX);
    const ry = Math.max(1e-4, brush.radiusY);
    const nx = (x - brush.center.x) / rx;
    const ny = (y - brush.center.y) / ry;
    const distSq = nx * nx + ny * ny;
    if (distSq >= 1) continue;

    // 매끄러운 사차 감쇠 (1 - d^2)^2
    const falloff = (1 - distSq) * (1 - distSq);
    const weight = falloff * clamp(brush.strength, 0, 1);
    const turb = clamp(brush.turbulence, 0, 1);
    const waveX = turb > 0 ? hashWave(x * 4, y * 4, timeSeconds, seed + i * 31) * turb * 0.25 : 0;
    const waveY = turb > 0 ? hashWave(y * 4, x * 4, timeSeconds + 1.3, seed + i * 53) * turb * 0.25 : 0;

    vx += (brush.velocity.x + waveX) * weight;
    vy += (brush.velocity.y + waveY) * weight;
    vz += brush.velocity.z * weight;
    totalWeight += weight;
  }

  return Object.freeze({
    vx,
    vy,
    vz,
    combinedWeight: clamp(totalWeight, 0, 1),
  });
}

export interface LivingPanelPresetConfig {
  readonly cameraRig: CameraRig3dTrack;
  readonly motionBrushes: readonly MotionBrushStroke[];
  readonly descriptionKo: string;
}

/**
 * 정적 웹툰 컷의 선화를 훼손하지 않는 절제된 리빙 패널 프리셋 구성을 생성한다.
 */
export function buildLivingPanelPreset(presetId: LivingPanelPresetId): LivingPanelPresetConfig {
  if (presetId === "subtle-breath") {
    return Object.freeze<LivingPanelPresetConfig>({
      cameraRig: {
        keyframes: [
          { timeRatio: 0, position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 50, apertureFStop: 4, rollDeg: 0 },
          { timeRatio: 0.5, position: { x: 0, y: 0.04, z: 4.94 }, target: { x: 0, y: 0.02, z: 0 }, focalLengthMm: 51, apertureFStop: 4, rollDeg: 0 },
          { timeRatio: 1, position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 50, apertureFStop: 4, rollDeg: 0 },
        ],
      },
      motionBrushes: [
        { id: "breath-torso", zone: "cloth", center: { x: 0.5, y: 0.62 }, radiusX: 0.24, radiusY: 0.2, velocity: { x: 0, y: -0.04, z: 0.01 }, strength: 0.35, turbulence: 0.05 },
      ],
      descriptionKo: "어깨와 상반신에 미세한 호흡 상하 리듬만 더합니다.",
    });
  }
  if (presetId === "hair-breeze") {
    return Object.freeze<LivingPanelPresetConfig>({
      cameraRig: {
        keyframes: [
          { timeRatio: 0, position: { x: -0.04, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 50, apertureFStop: 2.8, rollDeg: 0 },
          { timeRatio: 1, position: { x: 0.04, y: 0, z: 4.9 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 52, apertureFStop: 2.8, rollDeg: 0 },
        ],
      },
      motionBrushes: [
        { id: "hair-wind", zone: "hair", center: { x: 0.5, y: 0.32 }, radiusX: 0.3, radiusY: 0.22, velocity: { x: 0.22, y: -0.03, z: 0 }, strength: 0.65, turbulence: 0.4 },
        { id: "cloth-wind", zone: "cloth", center: { x: 0.52, y: 0.72 }, radiusX: 0.28, radiusY: 0.22, velocity: { x: 0.16, y: 0.02, z: 0 }, strength: 0.45, turbulence: 0.3 },
      ],
      descriptionKo: "머리카락과 옷자락에만 잔잔한 측면 바람을 입힙니다.",
    });
  }
  if (presetId === "parallax-dolly-in") {
    return Object.freeze<LivingPanelPresetConfig>({
      cameraRig: {
        keyframes: [
          { timeRatio: 0, position: { x: 0, y: 0, z: 5.8 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 35, apertureFStop: 2.8, rollDeg: 0 },
          { timeRatio: 1, position: { x: 0, y: 0.03, z: 4.1 }, target: { x: 0, y: 0.02, z: 0 }, focalLengthMm: 55, apertureFStop: 2, rollDeg: 0 },
        ],
      },
      motionBrushes: [],
      descriptionKo: "피사체 중심으로 부드럽게 다가가며 2.5D 심도 시차를 강조합니다.",
    });
  }
  if (presetId === "rain-drift") {
    return Object.freeze<LivingPanelPresetConfig>({
      cameraRig: {
        keyframes: [
          { timeRatio: 0, position: { x: 0, y: 0.05, z: 5 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 35, apertureFStop: 3.5, rollDeg: -0.5 },
          { timeRatio: 1, position: { x: 0, y: -0.05, z: 4.85 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 35, apertureFStop: 3.5, rollDeg: 0.5 },
        ],
      },
      motionBrushes: [
        { id: "rain-field", zone: "particles", center: { x: 0.5, y: 0.5 }, radiusX: 0.7, radiusY: 0.7, velocity: { x: -0.18, y: 0.85, z: 0 }, strength: 0.8, turbulence: 0.25 },
      ],
      descriptionKo: "사선 빗줄기 입자와 차분한 하향 카메라 패닝을 조합합니다.",
    });
  }
  return Object.freeze<LivingPanelPresetConfig>({
    cameraRig: {
      keyframes: [
        { timeRatio: 0, position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 50, apertureFStop: 2.8, rollDeg: 0 },
        { timeRatio: 1, position: { x: 0, y: 0, z: 4.96 }, target: { x: 0, y: 0, z: 0 }, focalLengthMm: 50, apertureFStop: 2.8, rollDeg: 0 },
      ],
    },
    motionBrushes: [
      { id: "eye-blink-zone", zone: "custom", center: { x: 0.5, y: 0.38 }, radiusX: 0.16, radiusY: 0.08, velocity: { x: 0, y: 0.06, z: 0 }, strength: 0.5, turbulence: 0 },
    ],
    descriptionKo: "시선과 눈꺼풀 영역만 자연스럽게 깜빡이도록 집중 제어합니다.",
  });
}

export function compileDirectorTimeline(doc: DirectorTimelineDocument): CompiledDirectorTimeline {
  const fps = clamp(Math.round(doc.fps), 12, 60);
  const spans: CompiledTimelineShotSpan[] = [];
  const warnings: string[] = [];
  let cursorMs = 0;

  for (const scene of doc.scenes) {
    if (scene.shots.length === 0) {
      warnings.push(`빈 씬이 포함되어 있습니다: ${scene.title}`);
      continue;
    }
    for (const shot of scene.shots) {
      if (shot.durationMs <= 0) {
        warnings.push(`길이가 0 이하인 샷은 건너뛰었습니다: ${shot.id}`);
        continue;
      }
      const durationMs = Math.round(shot.durationMs);
      const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps));
      spans.push(
        Object.freeze({
          sceneId: scene.id,
          shotId: shot.id,
          label: shot.label,
          startMs: cursorMs,
          endMs: cursorMs + durationMs,
          durationMs,
          frameCount,
        }),
      );
      cursorMs += durationMs;
    }
  }

  return Object.freeze({
    ok: spans.length > 0 && warnings.every((w) => !w.includes("0 이하")),
    totalDurationMs: cursorMs,
    totalFrames: spans.reduce((acc, s) => acc + s.frameCount, 0),
    spans: Object.freeze(spans),
    warnings: Object.freeze(warnings),
  });
}

export function evaluateDirectorAtTime(
  doc: DirectorTimelineDocument,
  timeMs: number,
): EvaluatedDirectorFrame | null {
  const compiled = compileDirectorTimeline(doc);
  if (compiled.spans.length === 0) return null;
  const clampedTime = clamp(timeMs, 0, compiled.totalDurationMs);

  let chosenSpan = compiled.spans[compiled.spans.length - 1]!;
  for (const span of compiled.spans) {
    if (clampedTime >= span.startMs && clampedTime <= span.endMs) {
      chosenSpan = span;
      break;
    }
  }

  const scene = doc.scenes.find((s) => s.id === chosenSpan.sceneId);
  const shot = scene?.shots.find((sh) => sh.id === chosenSpan.shotId);
  if (!shot) return null;

  const localProgress01 =
    chosenSpan.durationMs > 0
      ? clamp((clampedTime - chosenSpan.startMs) / chosenSpan.durationMs, 0, 1)
      : 0;
  const camera = evaluateCameraRigAt(shot.cameraRig, localProgress01);
  const trajectories = shot.trajectories.map((spline) =>
    evaluateTrajectorySpline(spline, localProgress01),
  );
  const anchorBlend01 = localProgress01 * localProgress01 * (3 - 2 * localProgress01);

  return Object.freeze({
    timeMs: clampedTime,
    sceneId: chosenSpan.sceneId,
    shotId: chosenSpan.shotId,
    localProgress01,
    camera,
    trajectories: Object.freeze(trajectories),
    anchorBlend01,
  });
}
