/**
 * 젖은 종이 정착 베이크 솔버(오케스트레이션): 이벤트 → 고정 스텝 → 마감.
 *
 * 한 스텝 = (1) 이번 스텝 차례의 dab 침착 → (2) 물이 있는 타일의 이웃 깨우기 → (3) 물 패스(LBM + 3층 교환 +
 * 증발) → (4) 안료 패스(수송 + 흡착·탈착 + 경화) → (5) 버퍼 교환. 스텝 수는 프로그램이 정한 고정값이고
 * (잔차 기반 종료 없음), 마감에서 남은 부유 안료를 제자리에 앉힌다(정착 = 마른 상태).
 *
 * 동기 베이크(`solveStudioWetPaperBakeUncached`)와 시분할 작업(`studio-wet-paper-host.ts`)은 정확히 같은
 * create → advance(1)·N → finish 순서를 밟으므로 시분할은 스케줄만 바꾸고 바이트는 바꾸지 않는다.
 * 결정성: 시드 해시와 정확한 반올림 연산만 쓴다(`Math.random`·`Date.now` 없음, 결과 경로에 초월 함수 없음).
 */

import { applyWetPaperDepositEvent, buildWetPaperDepositEvents } from "./studio-wet-paper-deposit";
import { createWetPaperKernel } from "./studio-wet-paper-kernel";
import { smoothstep } from "./studio-wet-paper-math";
import { createWetPaperTileFiller } from "./studio-wet-paper-paper";
import { stepWetPaperPigment } from "./studio-wet-paper-pigment";
import {
  STUDIO_WET_PAPER_BAKE_VERSION,
  studioWetPaperProgramSteps,
} from "./studio-wet-paper-programs";
import {
  createWetPaperState,
  planWetPaperGrid,
  prepareWetPaperStep,
  swapWetPaperBuffers,
  WET_PAPER_SPECIES,
} from "./studio-wet-paper-state";
import { stepWetPaperWater } from "./studio-wet-paper-water";

import type { WetPaperBristleSample } from "./studio-wet-paper-bristle";
import type { WetPaperDepositEvents, WetPaperInputDab } from "./studio-wet-paper-deposit";
import type { WetPaperKernel } from "./studio-wet-paper-kernel";
import type {
  StudioWetPaperBakeProgram,
  StudioWetPaperBakeProgramId,
  StudioWetPaperBakeSettings,
} from "./studio-wet-paper-programs";
import type { WetPaperState } from "./studio-wet-paper-state";

export interface StudioWetPaperBakeLedger {
  /** 넣은 물(표면 목표치까지 올린 양의 합). */
  readonly waterIn: number;
  readonly waterEvaporated: number;
  /** 마감 시점 격자에 남은 물(표면 + 흐름층 Σf + 모세관). */
  readonly waterRemaining: number;
  readonly pigmentIn: number;
  /** 마감 시점 격자의 안료(부유 + 침착 + 고정). */
  readonly pigmentOut: number;
}

/** 정착 베이크 결과(동결). 밀도는 광학 밀도(Beer–Lambert 지수)이며 색 합성은 `studio-wet-paper-composite.ts`. */
export interface StudioWetPaperBakeResult {
  readonly version: typeof STUDIO_WET_PAPER_BAKE_VERSION;
  readonly programId: StudioWetPaperBakeProgramId;
  /** 잘라낸 래스터 크기(셀)와 문서 좌표 배치. */
  readonly width: number;
  readonly height: number;
  readonly originXPx: number;
  readonly originYPx: number;
  readonly cellPx: number;
  /** 셀별 광학 밀도(width·height, 행 우선). */
  readonly density: Float32Array;
  /**
   * 셀별 덮임(0/1): 베이크 동안 젖었거나 안료가 앉은 셀. 합성이 이 이진 장을 보간한 0.5 등고선을 젖음 전선으로
   * 써서 격자보다 고운 해상도에서도 가장자리가 선명하다.
   */
  readonly coverage: Uint8Array;
  /** 종이 낱장(합성이 고운 종이 결을 같은 문서 좌표로 다시 읽는다). */
  readonly sheet: StudioWetPaperBakeProgram["sheet"];
  /** 고운 종이 결 대비(0..1) — 입자 침전 레인일수록 크다. */
  readonly grainDetail: number;
  readonly referenceDensity: number;
  readonly steps: number;
  /** 원래 격자 크기(진단). */
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly ledger: StudioWetPaperBakeLedger;
}

/** 덮임 판정: 이만큼 젖었거나 이만큼 안료가 앉은 셀. */
const COVERAGE_WATER = 0.02;
const COVERAGE_DENSITY = 0.015;

export interface WetPaperSolve {
  readonly programId: StudioWetPaperBakeProgramId;
  readonly program: StudioWetPaperBakeProgram;
  readonly kernel: WetPaperKernel;
  readonly events: WetPaperDepositEvents;
  readonly state: WetPaperState;
  readonly steps: number;
  readonly fillPaper: (state: WetPaperState, tileX: number, tileY: number) => void;
  readonly bristleScratch: WetPaperBristleSample;
  eventCursor: number;
}

/**
 * 이벤트에서 솔브를 만든다(테스트가 dab 없이 물리 시나리오를 직접 구성할 때도 쓴다). 상한 안에서 core dab 을
 * 셀 몇 개 너비로 풀 수 없는 획(아주 긴 가는 획)은 null — 호출자는 베이스 워시를 그린다.
 */
export function createWetPaperSolveFromEvents(
  events: WetPaperDepositEvents,
  programId: StudioWetPaperBakeProgramId,
  program: StudioWetPaperBakeProgram,
  steps: number,
): WetPaperSolve | null {
  const grid = planWetPaperGrid(events.extent, program.cellsAcross);
  if (!grid) return null;
  return {
    programId,
    program,
    kernel: createWetPaperKernel(program),
    events,
    state: createWetPaperState(grid),
    steps,
    fillPaper: createWetPaperTileFiller(program.sheet),
    bristleScratch: { bristle: 0, tuft: 0 },
    eventCursor: 0,
  };
}

/** dab 계획 → 솔브. 유한 dab이 없거나 격자로 풀 수 없으면 null. */
export function createWetPaperSolve(
  dabs: readonly WetPaperInputDab[],
  settings: StudioWetPaperBakeSettings,
): WetPaperSolve | null {
  const steps = studioWetPaperProgramSteps(settings.program);
  const events = buildWetPaperDepositEvents(dabs, settings.program, steps, settings.seed);
  if (!events) return null;
  return createWetPaperSolveFromEvents(events, settings.programId, settings.program, steps);
}

/** 건조 가속 배율(스텝 번호의 결정적 함수): 1 + gain·smoothstep(start, 1, t/N). */
export function wetPaperEvaporationScale(kernel: WetPaperKernel, step: number, steps: number): number {
  return 1 + kernel.dryRampGain * smoothstep(kernel.dryRampStart, 1, (step + 1) / Math.max(1, steps));
}

function stepWetPaperSolveOnce(solve: WetPaperSolve): void {
  const { state, events, program, kernel } = solve;
  const step = state.stepIndex;
  while (solve.eventCursor < events.count && (events.step[solve.eventCursor] ?? 0) <= step) {
    applyWetPaperDepositEvent(
      state,
      events,
      solve.eventCursor,
      program,
      solve.fillPaper,
      solve.bristleScratch,
    );
    solve.eventCursor += 1;
  }
  prepareWetPaperStep(state, solve.fillPaper);
  state.waterEvaporated += stepWetPaperWater(state, kernel, wetPaperEvaporationScale(kernel, step, solve.steps));
  stepWetPaperPigment(state, kernel);
  swapWetPaperBuffers(state);
  state.stepIndex += 1;
}

/** 최대 maxSteps 스텝 전진한다. 모든 고정 스텝을 마쳤으면 true. */
export function advanceWetPaperSolve(solve: WetPaperSolve, maxSteps: number): boolean {
  const budget = Math.max(1, Math.floor(maxSteps));
  for (let index = 0; index < budget && solve.state.stepIndex < solve.steps; index += 1) {
    stepWetPaperSolveOnce(solve);
  }
  return solve.state.stepIndex >= solve.steps;
}

/** 격자 전체의 물·안료 총량(진단·테스트용 — O(셀), 스텝 루프 밖에서만 부른다). */
export function measureWetPaperTotals(state: WetPaperState): { water: number; pigment: number } {
  const cells = state.grid.cells;
  let water = 0;
  let pigment = 0;
  for (let i = 0; i < cells; i += 1) {
    water += (state.wsCur[i] ?? 0) + (state.sCur[i] ?? 0);
    for (let q = 0; q < 9; q += 1) water += state.fCur[q * cells + i] ?? 0;
    for (let species = 0; species < WET_PAPER_SPECIES; species += 1) {
      const index = species * cells + i;
      pigment += (state.gCur[index] ?? 0) + (state.dep[index] ?? 0) + (state.fix[index] ?? 0);
    }
  }
  return { water, pigment };
}

/**
 * 마감: 남은 부유 안료를 제자리에 앉힌 총 광학 밀도를 만들고, 0이 아닌 영역(+1셀)으로 잘라낸다. 안료가 하나도
 * 들어가지 않았거나 덮인 셀이 없으면 null 이다(빈 래스터가 베이스 워시를 대신해 획이 사라지지 않게 한다).
 */
export function finishWetPaperSolve(solve: WetPaperSolve): StudioWetPaperBakeResult | null {
  const { state } = solve;
  const { width, height, cells, originXPx, originYPx, cellPx } = state.grid;
  const totals = measureWetPaperTotals(state);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const full = new Float32Array(cells);
  const fullCoverage = new Uint8Array(cells);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      let density = 0;
      for (let species = 0; species < WET_PAPER_SPECIES; species += 1) {
        const index = species * cells + i;
        density += (state.gCur[index] ?? 0) + (state.dep[index] ?? 0) + (state.fix[index] ?? 0);
      }
      full[i] = density;
      const covered = density > COVERAGE_DENSITY || (state.wetMax[i] ?? 0) > COVERAGE_WATER;
      if (covered) {
        fullCoverage[i] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || !(state.pigmentIn > 0)) return null;
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(width - 1, maxX + 1);
  maxY = Math.min(height - 1, maxY + 1);
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const density = new Float32Array(cropWidth * cropHeight);
  const coverage = new Uint8Array(cropWidth * cropHeight);
  for (let y = 0; y < cropHeight; y += 1) {
    const from = (minY + y) * width + minX;
    density.set(full.subarray(from, from + cropWidth), y * cropWidth);
    coverage.set(fullCoverage.subarray(from, from + cropWidth), y * cropWidth);
  }
  return Object.freeze({
    version: STUDIO_WET_PAPER_BAKE_VERSION,
    programId: solve.programId,
    width: cropWidth,
    height: cropHeight,
    originXPx: originXPx + minX * cellPx,
    originYPx: originYPx + minY * cellPx,
    cellPx,
    density,
    coverage,
    sheet: solve.program.sheet,
    grainDetail: solve.program.grainDetail,
    referenceDensity: solve.program.referenceDensity,
    steps: solve.steps,
    gridWidth: width,
    gridHeight: height,
    ledger: Object.freeze({
      waterIn: state.waterIn,
      waterEvaporated: state.waterEvaporated,
      waterRemaining: totals.water,
      pigmentIn: state.pigmentIn,
      pigmentOut: totals.pigment,
    }),
  });
}

/** 동기 전체 베이크(캐시 없음). 유한 dab이 없거나, 격자로 풀 수 없거나, 안료가 들어가지 않으면 null. */
export function solveStudioWetPaperBakeUncached(
  dabs: readonly WetPaperInputDab[],
  settings: StudioWetPaperBakeSettings,
): StudioWetPaperBakeResult | null {
  const solve = createWetPaperSolve(dabs, settings);
  if (!solve) return null;
  advanceWetPaperSolve(solve, solve.steps);
  return finishWetPaperSolve(solve);
}
