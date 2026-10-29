/**
 * dab 계획 → 침착 이벤트 → 격자 침착.
 *
 * 입력은 제품 수채 플래너의 dab 계획(재질 스케일 적용 후)이다. 정착 베이크는 획을 "시간 순서대로" 다시 칠한다:
 * dab k는 스텝 ⌊k·D/n⌋(D = depositFraction·steps)에 내려앉는다. 그래서 획이 자기 자신을 다시 지나가면(교차·
 * 되돌림) 앞쪽 획이 이미 마르기 시작한 곳을 다시 적시고, 모세관 흐름이 안료를 바깥으로 밀어 백런이 생긴다.
 * 수채 백런 프로그램은 획 끝에 물웅덩이(붓을 뗄 때 고이는 물)를 늦게 떨어뜨려 같은 현상을 일으킨다.
 *
 * 물은 "최댓값" 의미로 들어간다(지나가는 붓이 그 자리 물을 붓의 적심 수준까지 올린다 — Sumi의 MAX 블렌딩과
 * 같은 생각). 안료는 dab 불투명도를 광학 밀도 −ln(1 − a)로 바꿔 더한다: 베이스 워시의 알파 누적
 * 1 − Π(1 − aᵢ)과 같은 밀도 합이라, 안료를 움직이지 않으면 Beer–Lambert 합성이 베이스 워시 농도와 맞는다.
 */

import {
  clamp01,
  clampNumber,
  detExp,
  detLn,
  finiteOr,
  wetPaperHash01,
} from "./studio-wet-paper-math";
import {
  sampleWetPaperBristle,
  wetPaperBristleField,
  wetPaperDryBrushMask,
} from "./studio-wet-paper-bristle";
import { WET_PAPER_TILE, wakeWetPaperTile } from "./studio-wet-paper-state";

import type { StudioWetPaperBakeProgram } from "./studio-wet-paper-programs";
import type { WetPaperBristleSample } from "./studio-wet-paper-bristle";
import type { WetPaperGridExtent, WetPaperState } from "./studio-wet-paper-state";

/** 베이크가 읽는 dab 필드(제품 `WatercolorBrushDab`의 부분 집합). */
export interface WetPaperInputDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
  readonly role: "core" | "diffuse";
}

export const WET_PAPER_PROFILE_FLAT = 0;
export const WET_PAPER_PROFILE_SOFT = 1;

/** 침착 이벤트(SoA, step 오름차순). */
export interface WetPaperDepositEvents {
  readonly count: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly radius: Float64Array;
  /** 중심 표면 물 목표치. */
  readonly water: Float32Array;
  /** 중심 광학 밀도(안료 질량). */
  readonly pigment: Float32Array;
  readonly step: Int32Array;
  readonly profile: Uint8Array;
  /** 1이면 갈필 강모 마스크를 적용한다. */
  readonly bristle: Uint8Array;
  /** 획 중심선 누적 거리(px)와 진행 방향, 붓의 먹 잔량, 필압 대용값. */
  readonly along: Float64Array;
  readonly dirX: Float32Array;
  readonly dirY: Float32Array;
  readonly load: Float32Array;
  readonly pressure: Float32Array;
  /**
   * 획 방향 dab 간격(px). 0이면 정규화하지 않는다(탭). 안료는 셀마다 "간격 / 그 셀을 덮는 dab 중심 구간 길이"를
   * 곱해 겹치는 dab 합이 한 dab의 광학 밀도로 평평해진다(Sumi의 chord 정규화 — 몸통이 고르고 끝이 단단하다).
   * 구간은 셀의 현(chord) 2√(r² − ℓ²)을 획 시작·끝으로 자른 길이다(제자리 머문 붓도 진하게 고인다).
   */
  readonly spacing: Float32Array;
  /** 획 중심선 전체 길이(px) — 구간 자르기용. */
  readonly strokeLength: number;
  /** 강모 지도 획 방향 축척(px당 주기). */
  readonly alongScale: number;
  /** 획 시드에서 나온 강모 지도 위상. */
  readonly alongPhase: number;
  readonly extent: WetPaperGridExtent;
}

const MAX_DAB_OPACITY = 0.95;
const MIN_RADIUS = 0.05;

function opticalDensity(opacity: number): number {
  const a = clampNumber(opacity, 0, MAX_DAB_OPACITY);
  return -detLn(1 - a);
}

function allocateEvents(
  count: number,
): Omit<WetPaperDepositEvents, "count" | "alongScale" | "alongPhase" | "extent" | "strokeLength"> {
  return {
    x: new Float64Array(count),
    y: new Float64Array(count),
    radius: new Float64Array(count),
    water: new Float32Array(count),
    pigment: new Float32Array(count),
    step: new Int32Array(count),
    profile: new Uint8Array(count),
    bristle: new Uint8Array(count),
    along: new Float64Array(count),
    dirX: new Float32Array(count),
    dirY: new Float32Array(count),
    load: new Float32Array(count),
    pressure: new Float32Array(count),
    spacing: new Float32Array(count),
  };
}

/** core dab 사이 간격의 중앙값(px). core가 둘 미만이면 0(정규화 없음). */
function medianCoreSpacing(dabs: readonly WetPaperInputDab[], finite: readonly number[]): number {
  const gaps: number[] = [];
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  for (const index of finite) {
    const dab = dabs[index] as WetPaperInputDab;
    if (dab.role !== "core") continue;
    if (Number.isFinite(lastX)) {
      const dx = dab.x - lastX;
      const dy = dab.y - lastY;
      const gap = Math.sqrt(dx * dx + dy * dy);
      if (gap > 1e-6) gaps.push(gap);
    }
    lastX = dab.x;
    lastY = dab.y;
  }
  if (gaps.length === 0) return 0;
  const sorted = Float64Array.from(gaps).sort();
  return sorted[Math.floor(sorted.length / 2)] as number;
}

/**
 * dab 계획을 침착 이벤트로 바꾼다. 유한한 dab만 쓰며, 하나도 없으면 null. 프로그램이 번짐 후광에 물도 안료도
 * 싣지 않으면(갈필) diffuse dab은 버린다 — 아무것도 내려놓지 않는 dab이 격자 범위를 넓혀 해상도를 깎지 않게.
 */
export function buildWetPaperDepositEvents(
  dabs: readonly WetPaperInputDab[],
  program: StudioWetPaperBakeProgram,
  steps: number,
  seed: number,
): WetPaperDepositEvents | null {
  const keepDiffuse = program.haloWater > 0 || program.haloPigment > 0;
  const finite: number[] = [];
  for (let index = 0; index < dabs.length; index += 1) {
    const dab = dabs[index] as WetPaperInputDab;
    if (!keepDiffuse && dab.role !== "core") continue;
    if (Number.isFinite(dab.x) && Number.isFinite(dab.y)) finite.push(index);
  }
  if (finite.length === 0) return null;
  const pool = program.endPoolWater > 0 ? 1 : 0;
  const count = finite.length + pool;
  const events = allocateEvents(count);
  const depositSteps = Math.max(1, Math.round(steps * clamp01(program.depositFraction)));

  // 획 중심선: core dab 순서대로의 누적 거리와 진행 방향, 필압 대용값(core 불투명도 / 평균).
  let coreOpacitySum = 0;
  let coreRadiusSum = 0;
  let coreCount = 0;
  for (const index of finite) {
    const dab = dabs[index] as WetPaperInputDab;
    if (dab.role !== "core") continue;
    coreOpacitySum += clamp01(finiteOr(dab.opacity, 0));
    coreRadiusSum += Math.max(MIN_RADIUS, finiteOr(dab.radius, MIN_RADIUS));
    coreCount += 1;
  }
  const meanCoreOpacity = coreCount > 0 ? coreOpacitySum / coreCount : 0.5;
  let meanCoreRadius = coreCount > 0 ? coreRadiusSum / coreCount : 0;
  if (!(meanCoreRadius > 0)) {
    let sum = 0;
    for (const index of finite) sum += Math.max(MIN_RADIUS, finiteOr((dabs[index] as WetPaperInputDab).radius, MIN_RADIUS));
    meanCoreRadius = sum / finite.length;
  }
  const brushWidth = meanCoreRadius * 2;
  const coreSpacing = medianCoreSpacing(dabs, finite);
  const dryLength = Math.max(1, program.dryLengthWidths) * brushWidth;
  const dryStrength = clamp01(program.dryBrush);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxRadius = MIN_RADIUS;
  let depositAreaPx = 0;
  let along = 0;
  let lastCoreX = Number.NaN;
  let lastCoreY = Number.NaN;
  let dirX = 1;
  let dirY = 0;
  let load = 1;
  let pressure = 1;
  let lastCoreRadius = meanCoreRadius;
  let lastCoreOpacity = meanCoreOpacity;
  for (let slot = 0; slot < finite.length; slot += 1) {
    const dab = dabs[finite[slot] as number] as WetPaperInputDab;
    const radius = Math.max(MIN_RADIUS, finiteOr(dab.radius, MIN_RADIUS));
    const opacity = clamp01(finiteOr(dab.opacity, 0));
    const core = dab.role === "core";
    if (core) {
      if (Number.isFinite(lastCoreX)) {
        const dx = dab.x - lastCoreX;
        const dy = dab.y - lastCoreY;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 1e-6) {
          along += length;
          dirX = dx / length;
          dirY = dy / length;
        }
      }
      lastCoreX = dab.x;
      lastCoreY = dab.y;
      lastCoreRadius = radius;
      lastCoreOpacity = opacity;
      pressure = clampNumber(meanCoreOpacity > 1e-6 ? opacity / meanCoreOpacity : 1, 0.4, 1.6);
      // 붓은 거리에 따라 마른다(Chu & Tai 먹 잔량): load = 1 − 세기·(1 − e^(−s/L)).
      load = 1 - dryStrength * (1 - detExp(-along / dryLength));
    }
    events.x[slot] = dab.x;
    events.y[slot] = dab.y;
    events.radius[slot] = radius;
    events.water[slot] = core ? program.coreWater : program.haloWater;
    events.pigment[slot] = program.pigmentLoad * opticalDensity(opacity) * (core ? 1 : program.haloPigment);
    events.spacing[slot] = coreSpacing;
    events.step[slot] = Math.min(depositSteps - 1, Math.floor((slot * depositSteps) / finite.length));
    events.profile[slot] = core ? WET_PAPER_PROFILE_FLAT : WET_PAPER_PROFILE_SOFT;
    events.bristle[slot] = dryStrength > 0 ? 1 : 0;
    events.along[slot] = along;
    events.dirX[slot] = dirX;
    events.dirY[slot] = dirY;
    events.load[slot] = load;
    events.pressure[slot] = pressure;
    minX = Math.min(minX, dab.x - radius);
    minY = Math.min(minY, dab.y - radius);
    maxX = Math.max(maxX, dab.x + radius);
    maxY = Math.max(maxY, dab.y + radius);
    maxRadius = Math.max(maxRadius, radius);
    depositAreaPx += Math.PI * radius * radius;
  }
  if (pool === 1 && Number.isFinite(lastCoreX)) {
    // 붓을 뗄 때 고이는 묽은 물웅덩이: 마르기 시작한 획 끝으로 번져 백런을 만든다.
    const slot = finite.length;
    const radius = lastCoreRadius * 1.7;
    events.x[slot] = lastCoreX;
    events.y[slot] = lastCoreY;
    events.radius[slot] = radius;
    events.water[slot] = program.endPoolWater;
    events.pigment[slot] = program.pigmentLoad * opticalDensity(lastCoreOpacity) * 0.35;
    events.step[slot] = Math.min(
      Math.max(1, steps) - 1,
      Math.max(depositSteps, Math.round(steps * clamp01(program.endPoolAt))),
    );
    events.profile[slot] = WET_PAPER_PROFILE_SOFT;
    events.bristle[slot] = 0;
    events.along[slot] = along;
    events.dirX[slot] = dirX;
    events.dirY[slot] = dirY;
    events.load[slot] = 1;
    events.pressure[slot] = 1;
    events.spacing[slot] = 0;
    minX = Math.min(minX, lastCoreX - radius);
    minY = Math.min(minY, lastCoreY - radius);
    maxX = Math.max(maxX, lastCoreX + radius);
    maxY = Math.max(maxY, lastCoreY + radius);
    maxRadius = Math.max(maxRadius, radius);
    depositAreaPx += Math.PI * radius * radius;
  }
  const realCount = pool === 1 && !Number.isFinite(lastCoreX) ? finite.length : count;
  return Object.freeze({
    ...events,
    count: realCount,
    strokeLength: along,
    alongScale: 1 / Math.max(1, brushWidth * 24),
    alongPhase: wetPaperHash01(seed, 0x0b15, 0x7e11),
    extent: Object.freeze({
      minX,
      minY,
      maxX,
      maxY,
      meanCoreRadius,
      maxRadius,
      strokeLength: along,
      depositAreaPx,
      eventCount: realCount,
    }),
  });
}

/**
 * 물 프로파일: 붓이 적신 자리는 고르게 젖는다(가장자리 15%만 어깨). 물이 dab 안에서 기울면 가장자리 이동이
 * 넓은 띠 전체로 번져 테두리가 흐려진다 — 젖은 면은 평평하고 기울기는 젖음 전선에만 있어야 한다.
 */
function waterProfile(normalizedDistance: number): number {
  if (normalizedDistance >= 1) return 0;
  if (normalizedDistance <= 0.85) return 1;
  const t = (1 - normalizedDistance) / 0.15;
  return t * t * (3 - 2 * t);
}

/** 안료 침착 프로파일(1 = 중심 안료 100%). */
function depositProfile(profile: number, normalizedDistance: number): number {
  if (normalizedDistance >= 1) return 0;
  if (profile === WET_PAPER_PROFILE_FLAT) {
    // core: 평평한 몸통 + 가장자리 20% 부드러운 어깨(그리기 dab의 안티앨리어스 가장자리 대응).
    if (normalizedDistance <= 0.8) return 1;
    const t = (1 - normalizedDistance) / 0.2;
    return t * t * (3 - 2 * t);
  }
  // diffuse: 제품 방사 그라디언트와 같은 꼴(45%까지 평평, 가장자리 0으로 선형).
  if (normalizedDistance <= 0.45) return 1;
  return (1 - normalizedDistance) / 0.55;
}

/**
 * 이벤트 하나를 격자에 침착한다(이벤트 원이 닿는 타일을 깨운다). 할당 없음 — 실제로 넣은 물·안료는
 * 상태 장부(`waterIn`·`pigmentIn`)에 바로 더한다.
 */
export function applyWetPaperDepositEvent(
  state: WetPaperState,
  events: WetPaperDepositEvents,
  eventIndex: number,
  program: StudioWetPaperBakeProgram,
  fillPaper: (state: WetPaperState, tileX: number, tileY: number) => void,
  bristleScratch: WetPaperBristleSample,
): void {
  const { width, height, cells, originXPx, originYPx, cellPx, tilesX } = state.grid;
  const ex = events.x[eventIndex] ?? 0;
  const ey = events.y[eventIndex] ?? 0;
  const radius = events.radius[eventIndex] ?? MIN_RADIUS;
  const gx = (ex - originXPx) / cellPx;
  const gy = (ey - originYPx) / cellPx;
  const radiusCells = Math.max(0.5, radius / cellPx);
  const minX = Math.max(0, Math.floor(gx - radiusCells - 1));
  const maxX = Math.min(width - 1, Math.ceil(gx + radiusCells + 1));
  const minY = Math.max(0, Math.floor(gy - radiusCells - 1));
  const maxY = Math.min(height - 1, Math.ceil(gy + radiusCells + 1));
  if (minX > maxX || minY > maxY) return;
  // 원이 닿는 타일(+ 한 겹)을 먼저 깨워 종이 필드를 채운다.
  const tileMinX = Math.floor(minX / WET_PAPER_TILE) - 1;
  const tileMaxX = Math.floor(maxX / WET_PAPER_TILE) + 1;
  const tileMinY = Math.floor(minY / WET_PAPER_TILE) - 1;
  const tileMaxY = Math.floor(maxY / WET_PAPER_TILE) + 1;
  for (let ty = tileMinY; ty <= tileMaxY; ty += 1) {
    for (let tx = tileMinX; tx <= tileMaxX; tx += 1) wakeWetPaperTile(state, tx, ty, fillPaper);
  }
  const water = events.water[eventIndex] ?? 0;
  const pigment = events.pigment[eventIndex] ?? 0;
  const profile = events.profile[eventIndex] ?? WET_PAPER_PROFILE_FLAT;
  const dry = events.bristle[eventIndex] === 1;
  const field = dry ? wetPaperBristleField() : null;
  const dirX = events.dirX[eventIndex] ?? 1;
  const dirY = events.dirY[eventIndex] ?? 0;
  const along0 = events.along[eventIndex] ?? 0;
  const load = events.load[eventIndex] ?? 1;
  const pressure = events.pressure[eventIndex] ?? 1;
  const share0 = program.pigments[0].share;
  const share1 = program.pigments[1].share;
  const shareTotal = share0 + share1 > 1e-9 ? share0 + share1 : 1;
  const split0 = share0 / shareTotal;
  const split1 = share1 / shareTotal;
  const invRadius = 1 / radiusCells;
  const dryThreshold = 0.004;
  // chord 정규화: 셀의 가로 오프셋 ℓ에서 dab 중심들이 지나가며 그 셀을 덮는 구간 = 2√(r² − ℓ²)을 획 범위로 자른 길이.
  const spacingCells = (events.spacing[eventIndex] ?? 0) / cellPx;
  const strokeLengthCells = events.strokeLength / cellPx;
  const alongCells0 = along0 / cellPx;
  let addedWater = 0;
  let addedPigment = 0;
  for (let y = minY; y <= maxY; y += 1) {
    const dy = y + 0.5 - gy;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - gx;
      const distance = Math.sqrt(dx * dx + dy * dy) * invRadius;
      let weight = depositProfile(profile, distance);
      let waterWeight = waterProfile(distance);
      if (waterWeight <= 0) continue;
      const index = y * width + x;
      // 바깥 벽 한 겹에는 아무것도 넣지 않는다(격자 여유가 충분해 정상 입력에서는 닿지 않는다).
      if (state.wall[index] === 1) continue;
      if (field) {
        // 획 좌표(가로 u, 세로 along)에서 강모 지도를 읽는다(Chu & Tai / Sumi).
        const lateral = (dx * -dirY + dy * dirX) * invRadius;
        const alongPx = along0 + (dx * dirX + dy * dirY) * cellPx;
        sampleWetPaperBristle(
          field,
          lateral,
          alongPx * events.alongScale + events.alongPhase,
          bristleScratch,
        );
        const mask = wetPaperDryBrushMask(
          bristleScratch,
          load,
          pressure,
          lateral,
          state.height[index] ?? 0.5,
        );
        weight *= mask;
        waterWeight *= mask;
        if (waterWeight <= 1e-4) continue;
      }
      const targetWater = water * waterWeight;
      const currentWater = state.wsCur[index] ?? 0;
      if (targetWater > currentWater) {
        state.wsCur[index] = targetWater;
        addedWater += targetWater - currentWater;
      }
      let mass = pigment * weight;
      if (spacingCells > 0) {
        const lateralCells = dx * -dirY + dy * dirX;
        const half = radiusCells * radiusCells - lateralCells * lateralCells;
        const halfChord = half > 0 ? Math.sqrt(half) : 0;
        const alongCell = alongCells0 + dx * dirX + dy * dirY;
        const runEnd = alongCell + halfChord < strokeLengthCells ? alongCell + halfChord : strokeLengthCells;
        const runStart = alongCell - halfChord > 0 ? alongCell - halfChord : 0;
        const run = runEnd - runStart;
        if (run > spacingCells) mass *= spacingCells / run;
      }
      if (mass <= 0) continue;
      addedPigment += mass;
      const wetHere = (state.wsCur[index] ?? 0) + (state.rhoCur[index] ?? 0) > dryThreshold;
      if (wetHere) {
        state.gCur[index] = (state.gCur[index] ?? 0) + mass * split0;
        state.gCur[cells + index] = (state.gCur[cells + index] ?? 0) + mass * split1;
      } else {
        // 물이 없는 강모 자국: 안료가 종이에 곧바로 걸린다(마른 붓 = 번짐 없음).
        state.dep[index] = (state.dep[index] ?? 0) + mass * split0;
        state.dep[cells + index] = (state.dep[cells + index] ?? 0) + mass * split1;
      }
    }
  }
  // 이 이벤트가 닿은 타일은 이제 물(또는 안료)이 있다 — 다음 확산 단계가 이웃을 깨운다.
  for (let ty = Math.floor(minY / WET_PAPER_TILE); ty <= Math.floor(maxY / WET_PAPER_TILE); ty += 1) {
    for (let tx = Math.floor(minX / WET_PAPER_TILE); tx <= Math.floor(maxX / WET_PAPER_TILE); tx += 1) {
      state.tileWet[ty * tilesX + tx] = 1;
    }
  }
  state.waterIn += addedWater;
  state.pigmentIn += addedPigment;
}
