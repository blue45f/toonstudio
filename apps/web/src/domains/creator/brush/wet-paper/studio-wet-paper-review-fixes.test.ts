/**
 * 젖은 종이 굽기 적대적 리뷰 확정 결함의 회귀 시험.
 *
 * - 셀을 키워야만 상한에 맞는 긴 가는 획은 빈 래스터 대신 null(베이스 워시)이다.
 * - 셀보다 가는 dab 의 곧은 획도 길이 전체에 안료가 앉는다(셀 중심 표본이 셀 경계 위 획을 놓치지 않는다).
 * - 타일 생략은 모든 타일을 매 스텝 처리한 결과와 비트 단위로 같다(마른 시점이 타일이 깬 시점에 따르지 않는다).
 * - 첫 core dab 도 획의 진행 방향을 쓴다.
 * - 결정적 2^k 표는 반복 곱셈과 비트 단위로 같다.
 * - 강모 지도는 시분할 단위로 나눠 만들어도 예전 한 번에 만든 지도와 비트 단위로 같다.
 */

import type { WetPaperBristleField } from "./studio-wet-paper-bristle";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { planWatercolorBrushDabs } from "../studio-watercolor-brush";

import { createWetPaperBristleFieldBuilder, wetPaperBristleField } from "./studio-wet-paper-bristle";
import { applyWetPaperDepositEvent, buildWetPaperDepositEvents } from "./studio-wet-paper-deposit";
import { detExp } from "./studio-wet-paper-math";
import { stepWetPaperPigment } from "./studio-wet-paper-pigment";
import {
  normalizeStudioWetPaperBakeSettings,
  STUDIO_WET_PAPER_BAKE_PROGRAM_IDS,
  studioWetPaperProgramSteps,
  type StudioWetPaperBakeProgramId,
  type StudioWetPaperBakeSettings,
} from "./studio-wet-paper-programs";
import {
  createWetPaperSolve,
  finishWetPaperSolve,
  solveStudioWetPaperBakeUncached,
  wetPaperEvaporationScale,
} from "./studio-wet-paper-solver";
import { prepareWetPaperStep, swapWetPaperBuffers, wakeWetPaperTile } from "./studio-wet-paper-state";
import { stepWetPaperWater } from "./studio-wet-paper-water";

import type { WetPaperInputDab } from "./studio-wet-paper-deposit";

function settingsFor(programId: StudioWetPaperBakeProgramId, seed = 77): StudioWetPaperBakeSettings {
  const settings = normalizeStudioWetPaperBakeSettings({ seed, phase: "settled", programId });
  if (!settings) throw new Error(`unknown program ${programId}`);
  return settings;
}

function lineDabs(x0: number, y0: number, x1: number, y1: number, radius: number, spacing: number): WetPaperInputDab[] {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const dabs: WetPaperInputDab[] = [];
  for (let along = 0; along <= length; along += spacing) {
    const t = along / length;
    dabs.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, radius, opacity: 0.6, role: "core" });
  }
  return dabs;
}

describe("젖은 종이 굽기 · 격자로 풀 수 없는 획", () => {
  it("셀을 키워야만 상한에 맞는 긴 가는 획은 빈 래스터 대신 null 이다(베이스 워시를 그린다)", () => {
    for (const programId of STUDIO_WET_PAPER_BAKE_PROGRAM_IDS) {
      // 1800px 세로 획(core 반지름 1.73px): 예전에는 셀 3.6px 로 키워 안료 0의 3×3 래스터를 돌려줘 획이 사라졌다.
      expect(createWetPaperSolve(lineDabs(400, 100, 400, 1_900, 1.73, 0.6), settingsFor(programId)), programId).toBeNull();
      // 같은 붓의 400px 획은 그대로 굽는다.
      const short = solveStudioWetPaperBakeUncached(lineDabs(400, 100, 400, 500, 1.73, 0.6), settingsFor(programId));
      expect(short, programId).not.toBeNull();
      expect(short!.ledger.pigmentIn, programId).toBeGreaterThan(0);
    }
  });
});

describe("젖은 종이 굽기 · 셀보다 가는 dab", () => {
  it("셀 경계를 따라가는 가는 가로·세로 직선도 길이 전체에 안료가 앉는다", () => {
    for (const programId of STUDIO_WET_PAPER_BAKE_PROGRAM_IDS) {
      for (const vertical of [false, true]) {
        // 반지름 0.43px(굵기 1px), x 간격은 정수가 아니다. 예전에는 격자 중심이 셀 경계에 와 안료가 0이었다.
        const dabs = vertical ? lineDabs(300, 100, 300, 300, 0.43, 0.37) : lineDabs(100, 300, 300, 300, 0.43, 0.37);
        const result = solveStudioWetPaperBakeUncached(dabs, settingsFor(programId));
        expect(result, `${programId} ${vertical}`).not.toBeNull();
        if (!result) continue;
        expect(result.ledger.pigmentIn, programId).toBeGreaterThan(0);
        // 획 길이를 따라 덮인 칸의 비율.
        const along = vertical ? result.height : result.width;
        const across = vertical ? result.width : result.height;
        let inked = 0;
        for (let a = 0; a < along; a += 1) {
          let any = false;
          for (let c = 0; c < across && !any; c += 1) {
            const index = vertical ? a * result.width + c : c * result.width + a;
            any = (result.density[index] as number) > 0.01;
          }
          if (any) inked += 1;
        }
        const spanCells = 200 / result.cellPx;
        // 갈필은 붓 폭의 6배 길이에서 먹이 마르는 모델이라 1px 획은 앞쪽만 짙다(그래도 예전처럼 비지는 않는다).
        const minimum = programId === "chu-tai-dry-brush" ? 0.1 : 0.95;
        expect(inked / spanCells, `${programId} ${vertical ? "세로" : "가로"}`).toBeGreaterThan(minimum);
      }
    }
  });
});

describe("젖은 종이 굽기 · 타일 생략의 정확성", () => {
  /** 제품 순서로 굽되, full 이면 처음부터 모든 비벽 타일을 깨워 매 스텝 전부 처리한다. */
  function bake(dabs: readonly WetPaperInputDab[], programId: StudioWetPaperBakeProgramId, full: boolean): Float32Array {
    const solve = createWetPaperSolve(dabs, settingsFor(programId, 3));
    if (!solve) throw new Error(programId);
    const { state, events, program, kernel } = solve;
    const { tilesX, tilesY } = state.grid;
    if (full) {
      for (let ty = 0; ty < tilesY; ty += 1) {
        for (let tx = 0; tx < tilesX; tx += 1) wakeWetPaperTile(state, tx, ty, solve.fillPaper);
      }
    }
    for (let step = 0; step < solve.steps; step += 1) {
      while (solve.eventCursor < events.count && (events.step[solve.eventCursor] as number) <= step) {
        applyWetPaperDepositEvent(state, events, solve.eventCursor, program, solve.fillPaper, solve.bristleScratch);
        solve.eventCursor += 1;
      }
      prepareWetPaperStep(state, solve.fillPaper);
      if (full) {
        let count = 0;
        for (let tile = 0; tile < tilesX * tilesY; tile += 1) {
          if (state.tileAwake[tile] === 1) {
            state.processList[count] = tile;
            count += 1;
          }
        }
        state.processCount = count;
      }
      state.waterEvaporated += stepWetPaperWater(state, kernel, wetPaperEvaporationScale(kernel, step, solve.steps));
      stepWetPaperPigment(state, kernel);
      swapWetPaperBuffers(state);
      state.stepIndex += 1;
    }
    return finishWetPaperSolve(solve)!.density;
  }

  it("깨어난 타일만 처리해도 모든 타일을 처리한 결과와 비트 단위로 같다(마른 시점이 깨는 순서에 따르지 않는다)", () => {
    // 사인 곡선을 갔다가 돌아오는 획: 먼저 마른 가장자리를 나중에 다시 적신다.
    const points: number[] = [];
    for (let k = 0; k <= 30; k += 1) points.push(100 + k * 8, 100 + 40 * Math.sin(k / 5));
    for (let k = 30; k >= 0; k -= 1) points.push(100 + k * 8 + 3, 112 + 40 * Math.sin(k / 5));
    const dabs = planWatercolorBrushDabs({ points, baseWidth: 22, seed: 3, diffuse: true });
    for (const programId of STUDIO_WET_PAPER_BAKE_PROGRAM_IDS) {
      const skipped = bake(dabs, programId, false), everything = bake(dabs, programId, true);
      expect(skipped.length, programId).toBe(everything.length);
      let differing = 0;
      for (let index = 0; index < skipped.length; index += 1) if (skipped[index] !== everything[index]) differing += 1;
      expect(differing, programId).toBe(0);
    }
  });
});

describe("젖은 종이 굽기 · 첫 dab 의 방향", () => {
  it("첫 core 와 그 앞 dab 도 획의 첫 진행 방향을 쓴다(한 dab 짜리 콕 찍기만 (1, 0))", () => {
    const settings = settingsFor("curtis-watercolor-backrun");
    const steps = studioWetPaperProgramSteps(settings.program);
    const down = buildWetPaperDepositEvents(lineDabs(100, 50, 100, 250, 10, 3.5), settings.program, steps, 7)!;
    expect([down.dirX[0], down.dirY[0]]).toEqual([down.dirX[1], down.dirY[1]]);
    expect(down.dirX[0]).toBeCloseTo(0, 9);
    expect(down.dirY[0]).toBeCloseTo(1, 9);
    const left = buildWetPaperDepositEvents(lineDabs(250, 80, 50, 80, 10, 3.5), settings.program, steps, 7)!;
    expect(left.dirX[0]).toBeCloseTo(-1, 9);
    const tap = buildWetPaperDepositEvents([{ x: 10, y: 10, radius: 6, opacity: 0.5, role: "core" }], settings.program, steps, 7)!;
    expect([tap.dirX[0], tap.dirY[0]]).toEqual([1, 0]);
  });
});

describe("젖은 종이 굽기 · 결정적 지수", () => {
  /** 예전 구현: 2^k 를 |k|번 곱한다. */
  function referencePow2(k: number): number {
    let result = 1;
    if (k >= 0) {
      for (let index = 0; index < k; index += 1) result *= 2;
      return result;
    }
    for (let index = 0; index < -k; index += 1) result *= 0.5;
    return result;
  }

  it("2^k 표는 반복 곱셈과 비트 단위로 같아 detExp 결과가 바뀌지 않는다", () => {
    const LN2 = 0.6931471805599453;
    for (let k = -1074; k <= 1023; k += 1) {
      // detExp(k·ln2) 는 r = k·ln2 − k·LN2 = 0 이 되어 테일러 항이 정확히 1 이므로 2^k 를 그대로 돌려준다.
      if (k * LN2 > -700 && k * LN2 <= 700) expect(Object.is(detExp(k * LN2), referencePow2(k)), String(k)).toBe(true);
    }
    expect(detExp(-700.5)).toBe(0);
    expect(detExp(0)).toBe(1);
  });
});

describe("젖은 종이 굽기 · 강모 지도 시분할", () => {
  const hashOf = (field: WetPaperBristleField): string => createHash("sha256")
    .update(Buffer.from(field.bristle.buffer, field.bristle.byteOffset, field.bristle.byteLength))
    .update(Buffer.from(field.tuft.buffer, field.tuft.byteOffset, field.tuft.byteLength))
    .digest("hex");

  it("한 단위씩 만들어도 한 번에 만든 지도와 비트 단위로 같고, 단계가 작은 단위로 나뉜다", () => {
    const builder = createWetPaperBristleFieldBuilder();
    let units = 0;
    let field: WetPaperBristleField | null = null;
    while (!field) {
      field = builder.step();
      units += 1;
    }
    // 다발 지도 512행 ÷ 32 + 강모 64가닥 ÷ 8 + 바닥 잡음·평활화 3 단위.
    expect(units).toBe(512 / 32 + 64 / 8 + 3);
    expect(hashOf(field)).toBe(hashOf(wetPaperBristleField()));
    // 수정 전(한 번에 만들고 2^k 를 루프로 구하던 구현)에서 잰 지도 해시.
    expect(hashOf(field)).toBe("71096b3dd2f875960a21931c60e57a3aa4f851310cc1b0a9f5ab1473ed34193e");
  });
});
