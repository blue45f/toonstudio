/**
 * 인터랙티브 습식 물리 조작 컨트롤러 (Rebelle 7/8 · Expresii 클린룸 구현).
 *
 * - 실시간 캔버스 기울기 중력 벡터 F_gravity(azimuth, tilt) 및 모바일 DeviceOrientation G-센서 보정
 * - 국소 가우시안 제트기류 바람 불기(Blow Tool) 외력장 주입(결정적 해시 난류 포함)
 * - 즉시 건조(dryLayerNow) 및 물붓 국소 재습윤(rewetRegion: fixed -> suspended 안료 재활성화)
 * - Curtis 수채 유체 / Lane B 그리드 호환 Float32Array 무할당 스텝 및 WGSL 유니폼 패킹
 */

export const WET_GRAVITY_BLOW_SCHEMA_VERSION = 1 as const;
export const WET_GRAVITY_MAX_SUBSTEPS = 8 as const;
export const WET_GRAVITY_MAX_BLOW_JETS = 16 as const;

const DEG_TO_RAD = Math.PI / 180;
const EPSILON = 1e-6;

export interface WetGravityVector2 { readonly x: number; readonly y: number; }
export interface TiltCompassState { readonly azimuthRad: number; readonly tiltDeg: number; readonly strength: number; }
export interface DeviceOrientationTiltSample { readonly betaDeg: number; readonly gammaDeg: number; readonly screenOrientationDeg?: number; }
export interface TiltSensorCalibration {
  readonly neutralBetaDeg: number; readonly neutralGammaDeg: number;
  readonly deadzoneDeg: number; readonly maxTiltDeg: number;
  readonly smoothingAlpha: number; readonly gain: number;
}

export const DEFAULT_TILT_SENSOR_CALIBRATION: Readonly<TiltSensorCalibration> = Object.freeze({
  neutralBetaDeg: 25, neutralGammaDeg: 0, deadzoneDeg: 3.5, maxTiltDeg: 55, smoothingAlpha: 0.35, gain: 1.0,
});

export interface BlowJetImpulse {
  readonly id: string;
  readonly x: number; readonly y: number;
  readonly dirX: number; readonly dirY: number;
  readonly radius: number; readonly pressure: number;
  readonly coneSpread: number; readonly turbulence: number; readonly seed: number;
}

export interface WetFluidPhysicsParams {
  readonly viscosity: number; readonly surfaceDrag: number; readonly slopeGain: number;
  readonly evaporationRate: number; readonly settlingRate: number;
  readonly granulationGamma: number; readonly capillarySpread: number; readonly minWetThreshold: number;
}

export const DEFAULT_WET_FLUID_PHYSICS_PARAMS: Readonly<WetFluidPhysicsParams> = Object.freeze({
  viscosity: 0.12, surfaceDrag: 0.08, slopeGain: 0.22, evaporationRate: 0.004,
  settlingRate: 0.14, granulationGamma: 0.72, capillarySpread: 0.06, minWetThreshold: 0.015,
});

export interface WetFluidGridState {
  readonly width: number; readonly height: number;
  readonly u: Float32Array; readonly v: Float32Array;
  readonly wetness: Float32Array; readonly water: Float32Array;
  readonly suspendedPigment: Float32Array; readonly fixedPigment: Float32Array;
  readonly paperHeight: Float32Array;
  stepIndex: number;
}

export interface WetFluidScratchBuffers {
  readonly nextU: Float32Array; readonly nextV: Float32Array;
  readonly nextWater: Float32Array; readonly nextSuspended: Float32Array; readonly nextWetness: Float32Array;
}

export interface DryLayerRegion {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
  readonly radial?: boolean;
}

export interface RewetBrushInput {
  readonly x: number; readonly y: number; readonly radius: number;
  readonly waterAmount: number; readonly liftRatio: number; readonly stainingResistance: number;
}

export interface WetGravityBlowControllerState {
  readonly gravity: WetGravityVector2;
  readonly tiltCompass: TiltCompassState;
  readonly blowJets: readonly BlowJetImpulse[];
  readonly params: WetFluidPhysicsParams;
}

export interface WetFluidStepMetrics {
  readonly substeps: number; readonly maxVelocity: number; readonly activeWetCells: number;
  readonly totalSuspendedPigment: number; readonly totalFixedPigment: number;
}

const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
const clamp01 = (v: number): number => clamp(v, 0, 1);
const finiteOr = (v: number | undefined, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** 결정적 정수 격자 해시 -> [-1, 1]. */
function hash2dSigned(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function smoothNoise2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const nx0 = hash2dSigned(ix, iy, seed) + (hash2dSigned(ix + 1, iy, seed) - hash2dSigned(ix, iy, seed)) * sx;
  const nx1 = hash2dSigned(ix, iy + 1, seed) + (hash2dSigned(ix + 1, iy + 1, seed) - hash2dSigned(ix, iy + 1, seed)) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

/** 초기 습식 유체 그리드를 생성한다. */
export function createWetFluidGrid(width: number, height: number, paperSeed = 101): WetFluidGridState {
  const safeW = Math.max(2, Math.floor(finiteOr(width, 16)));
  const safeH = Math.max(2, Math.floor(finiteOr(height, 16)));
  const count = safeW * safeH;
  const paperHeight = new Float32Array(count);
  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const coarse = smoothNoise2d(x * 0.25, y * 0.25, paperSeed);
      const fine = smoothNoise2d(x * 0.75, y * 0.75, paperSeed ^ 0x51f15);
      paperHeight[y * safeW + x] = clamp01(0.5 + 0.35 * coarse + 0.15 * fine);
    }
  }
  return {
    width: safeW, height: safeH,
    u: new Float32Array(count), v: new Float32Array(count),
    wetness: new Float32Array(count), water: new Float32Array(count),
    suspendedPigment: new Float32Array(count), fixedPigment: new Float32Array(count),
    paperHeight, stepIndex: 0,
  };
}

/** 무할당 스텝 실행용 재사용 스크래치 버퍼를 생성한다. */
export function createWetFluidScratchBuffers(width: number, height: number): WetFluidScratchBuffers {
  const count = Math.max(4, Math.floor(width) * Math.floor(height));
  return {
    nextU: new Float32Array(count), nextV: new Float32Array(count),
    nextWater: new Float32Array(count), nextSuspended: new Float32Array(count), nextWetness: new Float32Array(count),
  };
}

/** 원형 수채 물방울/안료 댑을 그리드에 도포한다. */
export function depositWetPigmentDab(
  state: WetFluidGridState, cx: number, cy: number, radius: number, waterLoad: number, pigmentLoad: number,
): number {
  const r = Math.max(0.5, finiteOr(radius, 3));
  const wLoad = Math.max(0, finiteOr(waterLoad, 1));
  const pLoad = Math.max(0, finiteOr(pigmentLoad, 1));
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(state.width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(state.height - 1, Math.ceil(cy + r));
  let affected = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > r) continue;
      const t = 1 - dist / r;
      const falloff = t * t * (3 - 2 * t);
      const idx = y * state.width + x;
      state.water[idx] = Math.min(2, state.water[idx]! + wLoad * falloff);
      state.wetness[idx] = clamp01(Math.max(state.wetness[idx]!, falloff * clamp01(wLoad)));
      state.suspendedPigment[idx] = state.suspendedPigment[idx]! + pLoad * falloff;
      affected += 1;
    }
  }
  return affected;
}

/** Tilt Compass 상태로부터 2D 캔버스 평면 중력 벡터를 계산한다. */
export function computeTiltCompassGravity(compass: TiltCompassState): WetGravityVector2 {
  const tiltClamped = clamp(finiteOr(compass.tiltDeg, 0), 0, 90);
  const strength = clamp(finiteOr(compass.strength, 1), 0, 4);
  const azimuth = finiteOr(compass.azimuthRad, Math.PI / 2);
  const mag = Math.sin(tiltClamped * DEG_TO_RAD) * strength;
  return { x: Math.cos(azimuth) * mag, y: Math.sin(azimuth) * mag };
}

/** 모바일 DeviceOrientation(beta/gamma) 샘플을 보정해 캔버스 중력 벡터와 나침반 상태를 산출한다. */
export function sampleTiltSensorGravity(
  sample: DeviceOrientationTiltSample,
  calibration: Partial<TiltSensorCalibration> = {},
  previousGravity?: WetGravityVector2,
): { readonly gravity: WetGravityVector2; readonly compass: TiltCompassState } {
  const d = DEFAULT_TILT_SENSOR_CALIBRATION;
  const cal: TiltSensorCalibration = {
    neutralBetaDeg: finiteOr(calibration.neutralBetaDeg, d.neutralBetaDeg),
    neutralGammaDeg: finiteOr(calibration.neutralGammaDeg, d.neutralGammaDeg),
    deadzoneDeg: Math.max(0, finiteOr(calibration.deadzoneDeg, d.deadzoneDeg)),
    maxTiltDeg: Math.max(5, finiteOr(calibration.maxTiltDeg, d.maxTiltDeg)),
    smoothingAlpha: clamp01(finiteOr(calibration.smoothingAlpha, d.smoothingAlpha)),
    gain: clamp(finiteOr(calibration.gain, d.gain), 0, 4),
  };

  const relBeta = finiteOr(sample.betaDeg, 0) - cal.neutralBetaDeg;
  const relGamma = finiteOr(sample.gammaDeg, 0) - cal.neutralGammaDeg;
  const orient = ((Math.round(finiteOr(sample.screenOrientationDeg, 0) / 90) * 90) % 360 + 360) % 360;
  let rawX = relGamma;
  let rawY = relBeta;
  if (orient === 90) { rawX = relBeta; rawY = -relGamma; }
  else if (orient === 180) { rawX = -relGamma; rawY = -relBeta; }
  else if (orient === 270) { rawX = -relBeta; rawY = relGamma; }

  const rawAngleDeg = Math.hypot(rawX, rawY);
  const azimuthRad = rawAngleDeg > EPSILON ? Math.atan2(rawY, rawX) : Math.PI / 2;
  let targetX = 0;
  let targetY = 0;
  let effectiveTiltDeg = 0;
  if (rawAngleDeg > cal.deadzoneDeg) {
    const norm = clamp01((rawAngleDeg - cal.deadzoneDeg) / Math.max(1, cal.maxTiltDeg - cal.deadzoneDeg));
    effectiveTiltDeg = norm * cal.maxTiltDeg;
    const mag = Math.sin(effectiveTiltDeg * DEG_TO_RAD) * cal.gain;
    targetX = Math.cos(azimuthRad) * mag;
    targetY = Math.sin(azimuthRad) * mag;
  }

  const alpha = previousGravity ? cal.smoothingAlpha : 1;
  const prevX = previousGravity ? finiteOr(previousGravity.x, 0) : 0;
  const prevY = previousGravity ? finiteOr(previousGravity.y, 0) : 0;
  return {
    gravity: { x: prevX + (targetX - prevX) * alpha, y: prevY + (targetY - prevY) * alpha },
    compass: { azimuthRad, tiltDeg: effectiveTiltDeg, strength: cal.gain },
  };
}

/** 특정 셀 위치에서 가우시안 바람 제트기류 외력 벡터를 평가한다. */
export function evaluateBlowJetForceAtCell(
  jet: BlowJetImpulse, cellX: number, cellY: number, stepIndex: number,
): WetGravityVector2 {
  const radius = Math.max(0.5, finiteOr(jet.radius, 6));
  const dx = cellX - jet.x;
  const dy = cellY - jet.y;
  const distSq = dx * dx + dy * dy;
  if (distSq > radius * radius * 4) return { x: 0, y: 0 };

  const dLen = Math.hypot(jet.dirX, jet.dirY);
  const nx = dLen > EPSILON ? jet.dirX / dLen : 1;
  const ny = dLen > EPSILON ? jet.dirY / dLen : 0;
  const along = dx * nx + dy * ny;
  const across = -dx * ny + dy * nx;
  const spread = clamp(finiteOr(jet.coneSpread, 0.5), 0.1, 1.0);
  const fwdScale = along >= 0 ? radius * 1.45 : radius * 0.45;
  const latScale = radius * spread;
  const envelope = Math.exp(-((along * along) / (2 * fwdScale * fwdScale) + (across * across) / (2 * latScale * latScale)));
  if (envelope < 1e-4) return { x: 0, y: 0 };

  const pressure = Math.max(0, finiteOr(jet.pressure, 0));
  const turb = clamp01(finiteOr(jet.turbulence, 0));
  let fx = nx * pressure * envelope;
  let fy = ny * pressure * envelope;
  if (turb > 0) {
    const phase = stepIndex * 0.17;
    const curlSample = smoothNoise2d(cellX * 0.35 + phase, cellY * 0.35 - phase, jet.seed);
    const swirl = curlSample * turb * pressure * envelope * (0.4 + 0.6 * Math.min(1, Math.sqrt(distSq) / radius));
    fx += -ny * swirl;
    fy += nx * swirl;
  }
  return { x: fx, y: fy };
}

/** 레이어 전체 또는 지정 영역의 습윤도를 즉시 0으로 동결하고 부유 안료를 고착한다. */
export function dryLayerNow(state: WetFluidGridState, region?: DryLayerRegion): number {
  const minX = region ? Math.max(0, Math.floor(region.minX)) : 0;
  const maxX = region ? Math.min(state.width - 1, Math.ceil(region.maxX)) : state.width - 1;
  const minY = region ? Math.max(0, Math.floor(region.minY)) : 0;
  const maxY = region ? Math.min(state.height - 1, Math.ceil(region.maxY)) : state.height - 1;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const rx = Math.max(0.5, (maxX - minX) * 0.5);
  const ry = Math.max(0.5, (maxY - minY) * 0.5);
  let driedCells = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (region?.radial && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      const idx = y * state.width + x;
      if (state.wetness[idx]! > 0 || state.water[idx]! > 0 || state.suspendedPigment[idx]! > 0) driedCells += 1;
      state.fixedPigment[idx] = state.fixedPigment[idx]! + state.suspendedPigment[idx]!;
      state.suspendedPigment[idx] = 0;
      state.wetness[idx] = 0;
      state.water[idx] = 0;
      state.u[idx] = 0;
      state.v[idx] = 0;
    }
  }
  return driedCells;
}

/** 물붓으로 건조 영역을 국소 재습윤하여 고착 안료를 다시 부유 상태로 활성화한다. */
export function rewetRegion(state: WetFluidGridState, brush: RewetBrushInput): {
  readonly rewettedCells: number; readonly liftedPigmentTotal: number;
} {
  const radius = Math.max(0.5, finiteOr(brush.radius, 4));
  const waterAmount = clamp01(finiteOr(brush.waterAmount, 0.7));
  const effectiveLift = clamp01(finiteOr(brush.liftRatio, 0.5)) * (1 - clamp01(finiteOr(brush.stainingResistance, 0.2)));
  const minX = Math.max(0, Math.floor(brush.x - radius));
  const maxX = Math.min(state.width - 1, Math.ceil(brush.x + radius));
  const minY = Math.max(0, Math.floor(brush.y - radius));
  const maxY = Math.min(state.height - 1, Math.ceil(brush.y + radius));
  let rewettedCells = 0;
  let liftedPigmentTotal = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x - brush.x, y - brush.y);
      if (dist > radius) continue;
      const t = 1 - dist / radius;
      const falloff = t * t * (3 - 2 * t);
      const idx = y * state.width + x;
      const addedWater = waterAmount * falloff;
      state.water[idx] = Math.min(2, state.water[idx]! + addedWater);
      state.wetness[idx] = clamp01(Math.max(state.wetness[idx]!, addedWater));
      const fixed = state.fixedPigment[idx]!;
      if (fixed > 0 && effectiveLift > 0) {
        const lifted = fixed * effectiveLift * falloff;
        state.fixedPigment[idx] = fixed - lifted;
        state.suspendedPigment[idx] = state.suspendedPigment[idx]! + lifted;
        liftedPigmentTotal += lifted;
      }
      rewettedCells += 1;
    }
  }
  return { rewettedCells, liftedPigmentTotal };
}

/** 실시간 중력·바람 외력을 주입하고 질량 보존형 이류로 습식 유체를 1프레임 전진시킨다. */
export function stepWetGravityBlowField(
  state: WetFluidGridState,
  controller: WetGravityBlowControllerState,
  dtSec: number,
  scratch?: WetFluidScratchBuffers,
): WetFluidStepMetrics {
  const { width, height } = state;
  const count = width * height;
  const safeDt = clamp(finiteOr(dtSec, 1 / 60), 0.001, 0.25);
  const params = controller.params;
  const buf = scratch ?? createWetFluidScratchBuffers(width, height);
  const jets = controller.blowJets.slice(0, WET_GRAVITY_MAX_BLOW_JETS);
  const gx = finiteOr(controller.gravity.x, 0);
  const gy = finiteOr(controller.gravity.y, 0);
  const drag = Math.exp(-(params.viscosity + params.surfaceDrag) * safeDt * 12);
  let maxVel = 0;

  for (let y = 0; y < height; y += 1) {
    const yPrev = y > 0 ? y - 1 : 0;
    const yNext = y < height - 1 ? y + 1 : height - 1;
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const wet = state.wetness[idx]!;
      if (wet <= params.minWetThreshold) { buf.nextU[idx] = 0; buf.nextV[idx] = 0; continue; }
      const xPrev = x > 0 ? x - 1 : 0;
      const xNext = x < width - 1 ? x + 1 : width - 1;
      const gradHx = (state.paperHeight[y * width + xNext]! - state.paperHeight[y * width + xPrev]!) * 0.5;
      const gradHy = (state.paperHeight[yNext * width + x]! - state.paperHeight[yPrev * width + x]!) * 0.5;
      let fx = gx * wet - gradHx * params.slopeGain;
      let fy = gy * wet - gradHy * params.slopeGain;
      for (let j = 0; j < jets.length; j += 1) {
        const blow = evaluateBlowJetForceAtCell(jets[j]!, x, y, state.stepIndex);
        fx += blow.x * wet;
        fy += blow.y * wet;
      }
      let nu = state.u[idx]! * drag + fx * safeDt * 12;
      let nv = state.v[idx]! * drag + fy * safeDt * 12;
      const speed = Math.hypot(nu, nv);
      if (speed > WET_GRAVITY_MAX_SUBSTEPS) {
        const inv = WET_GRAVITY_MAX_SUBSTEPS / speed;
        nu *= inv;
        nv *= inv;
      }
      if (speed > maxVel) maxVel = Math.min(speed, WET_GRAVITY_MAX_SUBSTEPS);
      buf.nextU[idx] = nu;
      buf.nextV[idx] = nv;
    }
  }
  state.u.set(buf.nextU.subarray(0, count));
  state.v.set(buf.nextV.subarray(0, count));

  const substeps = Math.min(WET_GRAVITY_MAX_SUBSTEPS, Math.max(1, Math.ceil(maxVel)));
  const subDt = 1 / substeps;
  for (let s = 0; s < substeps; s += 1) {
    buf.nextWater.fill(0, 0, count);
    buf.nextSuspended.fill(0, 0, count);
    buf.nextWetness.fill(0, 0, count);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const w = state.water[idx]!;
        const p = state.suspendedPigment[idx]!;
        const wet = state.wetness[idx]!;
        if (w <= 0 && p <= 0 && wet <= 0) continue;
        const tx = clamp(x + state.u[idx]! * subDt, 0, width - 1);
        const ty = clamp(y + state.v[idx]! * subDt, 0, height - 1);
        const x0 = Math.floor(tx);
        const y0 = Math.floor(ty);
        const x1 = Math.min(width - 1, x0 + 1);
        const y1 = Math.min(height - 1, y0 + 1);
        const fx = tx - x0;
        const fy = ty - y0;
        const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy] as const;
        const targets = [y0 * width + x0, y0 * width + x1, y1 * width + x0, y1 * width + x1] as const;
        const spreadWet = Math.min(1, wet + params.capillarySpread * subDt);
        for (let k = 0; k < 4; k += 1) {
          const wt = weights[k]!;
          if (wt <= 0) continue;
          const ti = targets[k]!;
          buf.nextWater[ti] = buf.nextWater[ti]! + w * wt;
          buf.nextSuspended[ti] = buf.nextSuspended[ti]! + p * wt;
          buf.nextWetness[ti] = Math.max(buf.nextWetness[ti]!, spreadWet * Math.min(1, wt + 0.5));
        }
      }
    }
    state.water.set(buf.nextWater.subarray(0, count));
    state.suspendedPigment.set(buf.nextSuspended.subarray(0, count));
    state.wetness.set(buf.nextWetness.subarray(0, count));
  }

  let activeWetCells = 0;
  let totalSuspendedPigment = 0;
  let totalFixedPigment = 0;
  const evap = params.evaporationRate * safeDt * 60;
  for (let i = 0; i < count; i += 1) {
    const nextW = Math.max(0, state.water[i]! - evap);
    const nextWet = clamp01(Math.min(state.wetness[i]!, nextW > 0 ? Math.max(state.wetness[i]! - evap, 0) : 0));
    state.water[i] = nextW;
    state.wetness[i] = nextWet;
    const suspended = state.suspendedPigment[i]!;
    if (suspended > 0) {
      if (nextWet <= params.minWetThreshold) {
        state.fixedPigment[i] = state.fixedPigment[i]! + suspended;
        state.suspendedPigment[i] = 0;
      } else {
        const valley = 1 + (1 - state.paperHeight[i]!) * params.granulationGamma;
        const settled = suspended * clamp01(params.settlingRate * safeDt * valley);
        state.suspendedPigment[i] = suspended - settled;
        state.fixedPigment[i] = state.fixedPigment[i]! + settled;
      }
    }
    if (state.wetness[i]! > params.minWetThreshold) activeWetCells += 1;
    totalSuspendedPigment += state.suspendedPigment[i]!;
    totalFixedPigment += state.fixedPigment[i]!;
  }
  state.stepIndex += 1;
  return { substeps, maxVelocity: maxVel, activeWetCells, totalSuspendedPigment, totalFixedPigment };
}

/** WebGPU 컴퓨트 패스 바인딩용 16-바이트 정렬 유니폼 버퍼를 패킹한다. */
export function packWetGravityBlowUniforms(
  controller: WetGravityBlowControllerState, gridWidth: number, gridHeight: number, dtSec: number, stepIndex: number,
): Float32Array {
  const jets = controller.blowJets.slice(0, WET_GRAVITY_MAX_BLOW_JETS);
  const out = new Float32Array(12 + WET_GRAVITY_MAX_BLOW_JETS * 8);
  out[0] = finiteOr(controller.gravity.x, 0);
  out[1] = finiteOr(controller.gravity.y, 0);
  out[2] = clamp(finiteOr(dtSec, 1 / 60), 0.001, 0.25);
  out[3] = jets.length;
  out[4] = Math.max(1, Math.floor(gridWidth));
  out[5] = Math.max(1, Math.floor(gridHeight));
  out[6] = controller.params.viscosity;
  out[7] = controller.params.slopeGain;
  out[8] = controller.params.evaporationRate;
  out[9] = controller.params.settlingRate;
  out[10] = controller.params.granulationGamma;
  out[11] = stepIndex;

  for (let i = 0; i < jets.length; i += 1) {
    const jet = jets[i]!;
    const base = 12 + i * 8;
    const dLen = Math.hypot(jet.dirX, jet.dirY);
    out[base] = jet.x;
    out[base + 1] = jet.y;
    out[base + 2] = dLen > EPSILON ? jet.dirX / dLen : 1;
    out[base + 3] = dLen > EPSILON ? jet.dirY / dLen : 0;
    out[base + 4] = Math.max(0.5, jet.radius);
    out[base + 5] = Math.max(0, jet.pressure);
    out[base + 6] = clamp(jet.coneSpread, 0.1, 1);
    out[base + 7] = clamp01(jet.turbulence);
  }
  return out;
}
