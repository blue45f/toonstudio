import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildWetPaperDepositEvents } from "./studio-wet-paper-deposit";
import {
  normalizeStudioWetPaperBakeSettings,
  STUDIO_WET_PAPER_BAKE_PROGRAM_IDS,
  STUDIO_WET_PAPER_BAKE_PROGRAMS,
  studioWetPaperProgramSteps,
  type StudioWetPaperBakeProgramId,
  type StudioWetPaperBakeSettings,
} from "./studio-wet-paper-programs";
import {
  advanceWetPaperSolve,
  createWetPaperSolve,
  createWetPaperSolveFromEvents,
  finishWetPaperSolve,
  solveStudioWetPaperBakeUncached,
  type StudioWetPaperBakeResult,
} from "./studio-wet-paper-solver";
import { planWetPaperGrid, STUDIO_WET_PAPER_GRID_LIMITS } from "./studio-wet-paper-state";

import type { WetPaperInputDab } from "./studio-wet-paper-deposit";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function settingsFor(programId: StudioWetPaperBakeProgramId, seed = 77): StudioWetPaperBakeSettings {
  const settings = normalizeStudioWetPaperBakeSettings({ seed, phase: "settled", programId });
  if (!settings) throw new Error(`unknown program ${programId}`);
  return settings;
}

/** 곧은 획: core dab을 간격마다 놓는다(제품 플래너와 같은 core 역할 · 같은 불투명도 의미). */
function lineDabs(x0: number, x1: number, y: number, radius: number, opacity: number, spacing: number): WetPaperInputDab[] {
  const dabs: WetPaperInputDab[] = [];
  for (let x = x0; x <= x1; x += spacing) dabs.push({ x, y, radius, opacity, role: "core" });
  return dabs;
}

/**
 * 침착 이벤트를 직접 짠다: 정한 스텝에 내려놓고 chord 정규화는 끈다(한 번 적신 자리 = dab 한 개의 밀도).
 * 격자 해상도는 제품과 같이 core 평균 반지름에서 나온다(붓 크기 대비 셀 수가 일정 — 결과가 붓 크기에 비례).
 */
function eventsAt(
  dabs: readonly WetPaperInputDab[],
  settings: StudioWetPaperBakeSettings,
  program: StudioWetPaperBakeSettings["program"],
  stepOf: (index: number) => number,
) {
  const events = buildWetPaperDepositEvents(dabs, program, studioWetPaperProgramSteps(program), settings.seed);
  if (!events) throw new Error("no events");
  for (let index = 0; index < events.count; index += 1) {
    events.step[index] = stepOf(index);
    events.spacing[index] = 0;
  }
  return events;
}

function bakeHash(result: StudioWetPaperBakeResult): string {
  let hash = 0x811c_9dc5;
  const mix = (bytes: Uint8Array) => {
    for (let index = 0; index < bytes.length; index += 1) {
      hash = Math.imul(hash ^ (bytes[index] ?? 0), 0x0100_0193) >>> 0;
    }
  };
  mix(new Uint8Array(result.density.buffer, result.density.byteOffset, result.density.byteLength));
  mix(result.coverage);
  mix(new Uint8Array(Float64Array.of(result.originXPx, result.originYPx, result.cellPx).buffer));
  return `${result.width}x${result.height}:${hash.toString(16).padStart(8, "0")}`;
}

/** 중심에서의 거리 구간 [r0, r1)에 든 셀들의 평균 광학 밀도. */
function annulusMean(result: StudioWetPaperBakeResult, cx: number, cy: number, r0: number, r1: number): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const dx = result.originXPx + (x + 0.5) * result.cellPx - cx;
      const dy = result.originYPx + (y + 0.5) * result.cellPx - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < r0 || r >= r1) continue;
      sum += result.density[y * result.width + x] ?? 0;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

describe("wet-paper settled bake solver (MoXi / Curtis / Chu & Tai)", () => {
  it("is byte-deterministic across runs and identical when time-sliced one step at a time", () => {
    const dabs = lineDabs(40, 160, 80, 9, 0.55, 2.5);
    const hashes: Record<string, string> = {};
    for (const programId of STUDIO_WET_PAPER_BAKE_PROGRAM_IDS) {
      const settings = settingsFor(programId);
      const whole = solveStudioWetPaperBakeUncached(dabs, settings);
      const again = solveStudioWetPaperBakeUncached(dabs, settings);
      const sliced = createWetPaperSolve(dabs, settings);
      expect(whole && again && sliced, programId).toBeTruthy();
      if (!whole || !again || !sliced) continue;
      while (!advanceWetPaperSolve(sliced, 1)) { /* 시분할 호스트와 같은 한 스텝씩 */ }
      const slicedResult = finishWetPaperSolve(sliced);
      expect(slicedResult, programId).not.toBeNull();
      if (!slicedResult) continue;
      expect(bakeHash(again), programId).toBe(bakeHash(whole));
      expect(bakeHash(slicedResult), programId).toBe(bakeHash(whole));
      expect(whole.steps).toBe(studioWetPaperProgramSteps(STUDIO_WET_PAPER_BAKE_PROGRAMS[programId]));
      hashes[programId] = bakeHash(whole);
    }
    // 시드가 바뀌면 같은 종이·같은 획이라도 강모 위상 등 시드 경로가 달라질 수 있지만, 같은 입력은 같은 바이트다.
    expect(new Set(Object.values(hashes)).size).toBe(STUDIO_WET_PAPER_BAKE_PROGRAM_IDS.length);
  });

  it("conserves water and pigment to float32 round-off (ledger)", () => {
    const dabs = lineDabs(30, 150, 70, 10, 0.6, 3);
    for (const programId of STUDIO_WET_PAPER_BAKE_PROGRAM_IDS) {
      const result = solveStudioWetPaperBakeUncached(dabs, settingsFor(programId));
      expect(result, programId).not.toBeNull();
      if (!result) continue;
      const { waterIn, waterEvaporated, waterRemaining, pigmentIn, pigmentOut } = result.ledger;
      expect(waterIn, programId).toBeGreaterThan(0);
      expect(Math.abs(waterIn - waterEvaporated - waterRemaining) / waterIn, programId).toBeLessThan(1e-5);
      expect(pigmentIn, programId).toBeGreaterThan(0);
      expect(Math.abs(pigmentIn - pigmentOut) / pigmentIn, programId).toBeLessThan(1e-5);
      // 정착 밀도의 합 = 남은 안료(부유분까지 제자리에 앉힌 값).
      let densitySum = 0;
      for (const value of result.density) densitySum += value;
      expect(Math.abs(densitySum - pigmentOut) / pigmentOut, programId).toBeLessThan(1e-4);
    }
  });

  it("입자 침전 계수를 끄면 같은 수분 수지에서도 정착 안료 분포가 달라진다", () => {
    const settings = settingsFor("curtis-granulating-wash");
    const dabs = lineDabs(40, 100, 60, 12, 0.6, 3);
    const [coarse, fine] = settings.program.pigments;
    const granular = solveStudioWetPaperBakeUncached(dabs, settings);
    const smooth = solveStudioWetPaperBakeUncached(dabs, {
      ...settings,
      program: {
        ...settings.program,
        pigments: [{ ...coarse, granulation: 0 }, { ...fine, granulation: 0 }],
      },
    });
    if (!granular || !smooth) throw new Error("입자 침전 대조군 베이크 실패");
    expect([granular.width, granular.height, granular.originXPx, granular.originYPx, granular.cellPx])
      .toEqual([smooth.width, smooth.height, smooth.originXPx, smooth.originYPx, smooth.cellPx]);
    expect(granular.ledger.waterIn).toBe(smooth.ledger.waterIn);
    expect(granular.ledger.waterEvaporated).toBe(smooth.ledger.waterEvaporated);
    expect(granular.ledger.waterRemaining).toBe(smooth.ledger.waterRemaining);
    expect(granular.ledger.pigmentIn).toBe(smooth.ledger.pigmentIn);
    let difference = 0;
    for (const [index, density] of granular.density.entries()) {
      difference += Math.abs(density - (smooth.density[index] ?? 0));
    }
    // 합성 무늬(grainDetail)가 적용되기 전 솔버 밀도 자체에 유의한 차이가 있어야 한다.
    expect(difference / granular.ledger.pigmentIn).toBeGreaterThan(0.01);
    for (const { ledger } of [granular, smooth]) {
      expect(Math.abs(ledger.pigmentIn - ledger.pigmentOut) / ledger.pigmentIn).toBeLessThan(1e-5);
    }
  });

  it("darkens the rim of a drying wash (Curtis edge darkening: rim > interior)", () => {
    const programId = "curtis-watercolor-backrun";
    const settings = settingsFor(programId);
    const program = { ...settings.program, endPoolWater: 0 };
    const washRadius = 36;
    const solve = createWetPaperSolveFromEvents(
      eventsAt([{ x: 100, y: 100, radius: washRadius, opacity: 0.5, role: "core" }], settings, program, () => 0),
      programId,
      program,
      studioWetPaperProgramSteps(program),
    )!;
    advanceWetPaperSolve(solve, solve.steps);
    const result = finishWetPaperSolve(solve)!;
    const interior = annulusMean(result, 100, 100, 0, washRadius * 0.5);
    const rim = annulusMean(result, 100, 100, washRadius * 0.7, washRadius);
    expect(interior).toBeGreaterThan(0.05);
    expect(rim / interior, `rim ${rim.toFixed(3)} interior ${interior.toFixed(3)}`).toBeGreaterThan(1.6);
  });

  it("pushes pigment into a backrun ring when a partially dry wash is rewetted", () => {
    const programId = "curtis-watercolor-backrun";
    const settings = settingsFor(programId);
    const program = { ...settings.program, endPoolWater: 0 };
    const steps = studioWetPaperProgramSteps(program);
    const washRadius = 30;
    const dropRadius = 12;
    const bake = (rewetStep: number | null) => {
      const dabs: WetPaperInputDab[] = [
        { x: 100, y: 100, radius: washRadius, opacity: 0.5, role: "core" },
        { x: 100, y: 100, radius: dropRadius, opacity: 0, role: "core" },
      ];
      // 물만 든 붓(안료 0)을 워시가 반쯤 마른 스텝에 떨어뜨린다. null이면 같은 자리를 다시 적시지 않는다.
      const events = eventsAt(dabs, settings, program, (index) => (index === 0 ? 0 : rewetStep ?? steps));
      events.pigment[1] = 0;
      const solve = createWetPaperSolveFromEvents(events, programId, program, steps)!;
      advanceWetPaperSolve(solve, steps);
      return finishWetPaperSolve(solve)!;
    };
    const dry = bake(null);
    const rewet = bake(Math.round(steps * 0.4));
    const ringOf = (result: StudioWetPaperBakeResult) =>
      annulusMean(result, 100, 100, dropRadius * 0.65, dropRadius);
    const centreOf = (result: StudioWetPaperBakeResult) => annulusMean(result, 100, 100, 0, dropRadius * 0.5);
    const ring = ringOf(rewet);
    const centre = centreOf(rewet);
    // 백런: 다시 적신 물이 아직 젖은 주변으로 번지며 들뜬 안료를 밀어 낸다 — 안쪽은 맑아지고(무재적심 워시보다
    // 옅다), 물이 멈춘 자리에 무재적심 워시보다 진한 고리가 남는다.
    expect(centre / centreOf(dry), `centre ${centre.toFixed(3)} vs dry ${centreOf(dry).toFixed(3)}`).toBeLessThan(0.6);
    expect(ring / ringOf(dry), `ring ${ring.toFixed(3)} vs dry ${ringOf(dry).toFixed(3)}`).toBeGreaterThan(1.15);
    expect(ring / centre, `ring ${ring.toFixed(3)} centre ${centre.toFixed(3)}`).toBeGreaterThan(2);
    // 질량 보존은 재적심에서도 그대로다.
    expect(Math.abs(rewet.ledger.pigmentIn - rewet.ledger.pigmentOut) / rewet.ledger.pigmentIn).toBeLessThan(1e-5);
  });

  it("opens dry-brush streak gaps that widen as the brush runs dry (Chu & Tai)", () => {
    const radius = 12;
    const dabs = lineDabs(20, 380, 100, radius, 0.85, 1.6);
    const result = solveStudioWetPaperBakeUncached(dabs, settingsFor("chu-tai-dry-brush"));
    expect(result).not.toBeNull();
    if (!result) return;
    const gapFraction = (x0: number, x1: number) => {
      let gaps = 0;
      let cells = 0;
      for (let y = 0; y < result.height; y += 1) {
        const wy = result.originYPx + (y + 0.5) * result.cellPx;
        if (Math.abs(wy - 100) > radius * 0.6) continue;
        for (let x = 0; x < result.width; x += 1) {
          const wx = result.originXPx + (x + 0.5) * result.cellPx;
          if (wx < x0 || wx >= x1) continue;
          cells += 1;
          if ((result.density[y * result.width + x] ?? 0) < 0.05) gaps += 1;
        }
      }
      return cells > 0 ? gaps / cells : 0;
    };
    const start = gapFraction(30, 90);
    const end = gapFraction(260, 370);
    expect(start, `start gaps ${start.toFixed(3)}`).toBeLessThan(0.08);
    expect(end, `end gaps ${end.toFixed(3)}`).toBeGreaterThan(0.25);
  });

  it("bleeds MoXi ink beyond the brushed footprint while carbon stays in the core", () => {
    const radius = 14;
    const result = solveStudioWetPaperBakeUncached(
      lineDabs(40, 200, 100, radius, 0.7, 2.5),
      settingsFor("moxi-sumi-dispersion"),
    );
    expect(result).not.toBeNull();
    if (!result) return;
    let reach = 0;
    for (let y = 0; y < result.height; y += 1) {
      for (let x = 0; x < result.width; x += 1) {
        const wx = result.originXPx + (x + 0.5) * result.cellPx;
        if (wx < 80 || wx > 160) continue;
        if ((result.density[y * result.width + x] ?? 0) < 0.03) continue;
        reach = Math.max(reach, Math.abs(result.originYPx + (y + 0.5) * result.cellPx - 100));
      }
    }
    // 번짐 후광은 붓 자리(반지름)보다 멀리 가고, 붓 자리 안쪽이 후광보다 진하다.
    expect(reach, `reach ${reach.toFixed(1)}px`).toBeGreaterThan(radius * 1.35);
    const core = annulusMean(result, 120, 100, 0, radius * 0.5);
    const halo = annulusMean(result, 120, 100, radius * 1.1, reach);
    expect(core / Math.max(1e-6, halo)).toBeGreaterThan(2);
    expect(halo).toBeGreaterThan(0.02);
  });

  it("caps the dense grid within explicit bounds and refuses extents the core dab cannot resolve", () => {
    const limits = STUDIO_WET_PAPER_GRID_LIMITS;
    for (const cellsAcross of [7, 10, 20]) {
      // 극단 범위: 상한을 맞추려면 셀을 키워 core dab(지름 12px)이 1.5셀보다 좁아진다 → 굽지 않는다(베이스 워시).
      expect(planWetPaperGrid({
        minX: -20_000,
        minY: -9_000,
        maxX: 20_000,
        maxY: 9_000,
        meanCoreRadius: 6,
        maxRadius: 60,
        strokeLength: 400_000,
        depositAreaPx: 1e9,
        eventCount: 16_384,
      }, cellsAcross)).toBeNull();
      // 상한 때문에 셀을 키워도 core dab(지름 60px)이 1.5셀 이상이면 상한 안의 격자를 만든다.
      const grid = planWetPaperGrid({
        minX: 0,
        minY: 0,
        maxX: 1_800,
        maxY: 1_200,
        meanCoreRadius: 30,
        maxRadius: 40,
        strokeLength: 6_000,
        depositAreaPx: 3e7,
        eventCount: 4_000,
      }, cellsAcross);
      expect(grid, String(cellsAcross)).not.toBeNull();
      if (!grid) continue;
      expect(grid.cellPx).toBeGreaterThan((30 * 2) / cellsAcross);
      expect((30 * 2) / grid.cellPx).toBeGreaterThanOrEqual(limits.minCoreCellsAcross);
      expect(grid.cells).toBeLessThanOrEqual(limits.maxCells);
      expect(grid.width).toBeLessThanOrEqual(limits.maxSide);
      expect(grid.height).toBeLessThanOrEqual(limits.maxSide);
      expect(grid.width % 4).toBe(0);
      expect(grid.height % 4).toBe(0);
    }
    expect(createWetPaperSolve([], settingsFor("moxi-sumi-dispersion"))).toBeNull();
    expect(createWetPaperSolve([{ x: Number.NaN, y: 0, radius: 4, opacity: 1, role: "core" }], settingsFor("moxi-sumi-dispersion")))
      .toBeNull();
  });

  it("fails closed on unknown programs and never bakes the live phase", () => {
    expect(normalizeStudioWetPaperBakeSettings({ programId: "no-such-program" })).toBeNull();
    expect(normalizeStudioWetPaperBakeSettings(null)).toBeNull();
    expect(normalizeStudioWetPaperBakeSettings({ programId: "moxi-sumi-dispersion" })?.phase).toBe("live");
  });

  it("keeps wall clocks, Math.random and inexact transcendental calls out of the result path", () => {
    const sources = readdirSync(HERE)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => {
        const text = readFileSync(path.join(HERE, name), "utf8")
          .replace(/\/\*[\s\S]*?\*\//gu, "")
          .replace(/(^|[^:])\/\/.*$/gmu, "$1");
        return { name, text };
      });
    expect(sources.length).toBeGreaterThan(8);
    for (const { name, text } of sources) {
      expect(text, name).not.toMatch(/Math\.random\s*\(/u);
      expect(text, name).not.toMatch(/Date\.now\s*\(/u);
      expect(text, name).not.toMatch(/Math\.(?:exp|log|pow|sin|cos|tan|atan2?|hypot|cbrt|expm1|log1p)\s*\(/u);
      // 벽시계는 시분할 호스트의 조각 예산에만 쓴다(결과 바이트에는 흘러들지 않는다).
      if (name !== "studio-wet-paper-host.ts") expect(text, name).not.toMatch(/performance\.now/u);
    }
  });
});
