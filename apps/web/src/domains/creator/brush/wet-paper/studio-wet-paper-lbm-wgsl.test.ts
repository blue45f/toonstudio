import { describe, expect, it } from "vitest";
import { link } from "wesl";

import { createWetPaperKernel } from "./studio-wet-paper-kernel";
import { wetPaperHash01 } from "./studio-wet-paper-math";
import {
  STUDIO_WET_PAPER_LBM_WGSL,
  STUDIO_WET_PAPER_LBM_WGSL_ENTRY_POINT,
  STUDIO_WET_PAPER_LBM_WGSL_PARAM_FIELDS,
  STUDIO_WET_PAPER_LBM_WGSL_WORKGROUP_SIZE,
} from "./studio-wet-paper-lbm-wgsl";
import { createWetPaperTileFiller } from "./studio-wet-paper-paper";
import { STUDIO_WET_PAPER_BAKE_PROGRAMS } from "./studio-wet-paper-programs";
import {
  createWetPaperState,
  prepareWetPaperStep,
  swapWetPaperBuffers,
  WET_PAPER_TILE,
  type WetPaperGrid,
} from "./studio-wet-paper-state";
import { stepWetPaperWater } from "./studio-wet-paper-water";

import type { WetPaperKernel } from "./studio-wet-paper-kernel";

interface MirrorBuffers {
  readonly width: number;
  readonly cells: number;
  readonly fIn: Float32Array;
  readonly fOut: Float32Array;
  readonly rhoIn: Float32Array;
  readonly rhoOut: Float32Array;
  readonly kappa: Float32Array;
  readonly wall: Uint32Array;
  readonly surface: Float32Array;
  readonly capillary: Float32Array;
  readonly invCapacity: Float32Array;
  readonly paperHeight: Float32Array;
  readonly velocity: Float32Array;
}

/** WGSL 방향 표(셰이더의 stream_link 호출 인자와 같은 순서·값). */
const LINKS = [
  { q: 1, opp: 3, linkClass: 0, forward: true, dx: 1, dy: 0 },
  { q: 2, opp: 4, linkClass: 1, forward: true, dx: 0, dy: 1 },
  { q: 3, opp: 1, linkClass: 0, forward: false, dx: -1, dy: 0 },
  { q: 4, opp: 2, linkClass: 1, forward: false, dx: 0, dy: -1 },
  { q: 5, opp: 7, linkClass: 2, forward: true, dx: 1, dy: 1 },
  { q: 6, opp: 8, linkClass: 3, forward: false, dx: -1, dy: 1 },
  { q: 7, opp: 5, linkClass: 2, forward: false, dx: -1, dy: -1 },
  { q: 8, opp: 6, linkClass: 3, forward: true, dx: 1, dy: -1 },
] as const;

function clampMagnitude(x: number, y: number, limit: number): [number, number] {
  const m2 = x * x + y * y;
  if (m2 > limit * limit) {
    const scale = limit / Math.sqrt(m2);
    return [x * scale, y * scale];
  }
  return [x, y];
}

/**
 * `wet_paper_lbm_step`의 CPU 미러 — 셰이더 본문을 줄 단위로 옮긴 것(호출 한 번 = 셀 하나).
 * 셰이더 식이 바뀌면 이 미러와 아래 제품 물 패스 대조가 함께 깨진다.
 */
function mirrorWetPaperLbmStep(kernel: WetPaperKernel, buffers: MirrorBuffers): void {
  const { width, cells, fIn, fOut, rhoIn, rhoOut, kappa, wall, surface, capillary, invCapacity, paperHeight, velocity } =
    buffers;
  const halfInvRhoFull = 0.5 / kernel.rhoFull;
  const indicator = (cell: number) => {
    const wet = (surface[cell] as number) + (rhoIn[cell] as number);
    return wet >= kernel.blurFull ? 1 : wet / kernel.blurFull;
  };
  const writeCell = (i: number, values: readonly number[], target: number, vx: number, vy: number) => {
    for (let q = 0; q < 9; q += 1) fOut[q * cells + i] = values[q] as number;
    rhoOut[i] = target;
    velocity[2 * i] = vx;
    velocity[2 * i + 1] = vy;
  };
  const zero = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < cells; i += 1) {
    if (wall[i] !== 0) {
      writeCell(i, zero, 0, 0, 0);
      continue;
    }
    const rhoHere = rhoIn[i] as number;
    let rho = fIn[i] as number;
    let jx = 0;
    let jy = 0;
    for (const link of LINKS) {
      const up = i - (link.dy * width + link.dx);
      const bounced = fIn[link.opp * cells + i] as number;
      let value = bounced;
      if (wall[up] === 0) {
        const owner = link.forward ? up : i;
        const kappaPaper = kappa[link.linkClass * cells + owner] as number;
        const rhoUp = rhoIn[up] as number;
        let linkKappa = kappaPaper;
        const lo = Math.min(rhoUp, rhoHere);
        const hi = Math.max(rhoUp, rhoHere);
        if (lo < kernel.rhoDry && hi < kernel.pinThreshold * (0.3 + kappaPaper)) {
          linkKappa = 1;
        } else {
          const fill = (rhoUp + rhoHere) * halfInvRhoFull;
          if (fill < 1) {
            const sigma = kernel.surfaceTension;
            linkKappa = 1 - (1 - kappaPaper) * (fill * (1 - sigma + sigma * fill));
          }
        }
        value = (1 - linkKappa) * (fIn[link.q * cells + up] as number) + linkKappa * bounced;
      }
      rho += value;
      jx += link.dx * value;
      jy += link.dy * value;
    }
    const east = i + 1;
    const west = i - 1;
    const south = i + width;
    const north = i - width;
    const [ax, ay] = clampMagnitude(
      -kernel.capillaryForce * 0.5 * (
        (capillary[east] as number) * (invCapacity[east] as number)
        - (capillary[west] as number) * (invCapacity[west] as number)
      )
        - kernel.slopeForce * 0.5 * ((paperHeight[east] as number) - (paperHeight[west] as number))
        - kernel.edgeFlow * 0.5 * (indicator(east) - indicator(west)),
      -kernel.capillaryForce * 0.5 * (
        (capillary[south] as number) * (invCapacity[south] as number)
        - (capillary[north] as number) * (invCapacity[north] as number)
      )
        - kernel.slopeForce * 0.5 * ((paperHeight[south] as number) - (paperHeight[north] as number))
        - kernel.edgeFlow * 0.5 * (indicator(south) - indicator(north)),
      kernel.aMax,
    );
    let flow: [number, number] = [0, 0];
    let eq: [number, number] = [0, 0];
    if (rho > 1e-7) {
      const inv = 1 / rho;
      flow = clampMagnitude(jx * inv + 0.5 * ax, jy * inv + 0.5 * ay, kernel.uMax);
      eq = clampMagnitude(jx * inv + ax, jy * inv + ay, kernel.uMax);
    }
    const target = rho;
    if ((surface[i] as number) + target + (capillary[i] as number) < kernel.waterEps) {
      writeCell(i, zero, 0, 0, 0);
      continue;
    }
    let keep = 0;
    if (rho > 0) keep = target < rho ? target / rho : 1;
    const scaled = rho * keep;
    const face = scaled / 9;
    const diagonal = scaled / 36;
    const base = 1 - 1.5 * (eq[0] * eq[0] + eq[1] * eq[1]);
    const cuE = 3 * eq[0];
    const cuS = 3 * eq[1];
    const cuSE = 3 * (eq[0] + eq[1]);
    const cuNE = 3 * (eq[0] - eq[1]);
    const values = [
      (4 / 9) * scaled * base,
      face * (base + cuE + 0.5 * cuE * cuE),
      face * (base + cuS + 0.5 * cuS * cuS),
      face * (base - cuE + 0.5 * cuE * cuE),
      face * (base - cuS + 0.5 * cuS * cuS),
      diagonal * (base + cuSE + 0.5 * cuSE * cuSE),
      diagonal * (base - cuNE + 0.5 * cuNE * cuNE),
      diagonal * (base - cuSE + 0.5 * cuSE * cuSE),
      diagonal * (base + cuNE + 0.5 * cuNE * cuNE),
    ];
    let total = 0;
    for (const value of values) total += value;
    values[0] = Math.max((values[0] as number) + (target - total), 0);
    writeCell(i, values, target, target > 0 ? flow[0] : 0, target > 0 ? flow[1] : 0);
  }
}

/** 교환·증발을 끈 흐름층 시나리오: 섬유 종이 위 물방울 두 개(젖음 전선 · 고정 · 부분 bounce-back이 모두 일한다). */
function scenario() {
  const program = {
    ...STUDIO_WET_PAPER_BAKE_PROGRAMS["moxi-sumi-dispersion"],
    evaporation: 0,
    seepRate: 0,
  };
  const kernel = createWetPaperKernel(program);
  const width = 40;
  const height = 32;
  const grid: WetPaperGrid = {
    width,
    height,
    cells: width * height,
    tilesX: width / WET_PAPER_TILE,
    tilesY: height / WET_PAPER_TILE,
    originXPx: 0,
    originYPx: 0,
    cellPx: 4,
  };
  const state = createWetPaperState(grid);
  state.tileWet.fill(1);
  prepareWetPaperStep(state, createWetPaperTileFiller(program.sheet));
  // 흡수(흐름층 → 모세관)를 꺼서 순수 흐름층만 남긴다. 표면·모세관 물은 0이다.
  state.absorb.fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (state.wall[i] === 1) continue;
      const blobA = (x - 14) ** 2 + (y - 14) ** 2 < 36;
      const blobB = (x - 26) ** 2 + (y - 18) ** 2 < 16;
      if (!blobA && !blobB) continue;
      const rho = blobA ? 0.4 : 0.12;
      const weights = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
      let total = 0;
      for (let q = 0; q < 9; q += 1) {
        const jitter = 0.9 + 0.2 * wetPaperHash01(91, i, q);
        const value = Math.fround(rho * (weights[q] as number) * jitter);
        state.fCur[q * grid.cells + i] = value;
        total += value;
      }
      state.rhoCur[i] = total;
    }
  }
  return { kernel, state, fill: createWetPaperTileFiller(program.sheet) };
}

describe("wet-paper MoXi LBM step — WGSL compute kernel (experimental, not wired)", () => {
  it("parses and links with wesl into a single compute entry point with the documented layout", async () => {
    const linked = await link({
      weslSrc: { main: STUDIO_WET_PAPER_LBM_WGSL },
      rootModuleName: "main",
    });
    const wgsl = linked.dest;
    expect(wgsl).toContain(`@compute @workgroup_size(${STUDIO_WET_PAPER_LBM_WGSL_WORKGROUP_SIZE})`);
    expect(wgsl).toContain(`fn ${STUDIO_WET_PAPER_LBM_WGSL_ENTRY_POINT}(`);
    expect(wgsl.match(/@compute/gu)).toHaveLength(1);
    for (let binding = 0; binding <= 11; binding += 1) {
      expect(wgsl, `binding ${binding}`).toContain(`@binding(${binding})`);
    }
    // 균일 버퍼 구조체의 필드 수 = 문서화된 순서(16 × 4 B).
    const struct = /struct WetPaperLbmParams \{([\s\S]*?)\}/u.exec(wgsl)?.[1] ?? "";
    expect(struct.split(",").filter((line) => line.includes(":")).length).toBe(
      STUDIO_WET_PAPER_LBM_WGSL_PARAM_FIELDS.length,
    );
  });

  it("mirrors the product water pass's flow layer step for step (CPU mirror of the shader)", () => {
    const { kernel, state, fill } = scenario();
    const { width, cells } = state.grid;
    const mirror: MirrorBuffers = {
      width,
      cells,
      fIn: Float32Array.from(state.fCur),
      fOut: new Float32Array(cells * 9),
      rhoIn: Float32Array.from(state.rhoCur),
      rhoOut: new Float32Array(cells),
      kappa: state.kappa,
      wall: Uint32Array.from(state.wall),
      surface: new Float32Array(cells),
      capillary: new Float32Array(cells),
      invCapacity: state.invCapacity,
      paperHeight: state.height,
      velocity: new Float32Array(cells * 2),
    };
    let fIn = mirror.fIn;
    let fOut = mirror.fOut;
    let rhoIn = mirror.rhoIn;
    let rhoOut = mirror.rhoOut;
    const initialMass = state.fCur.reduce((sum, value) => sum + value, 0);
    let maxError = 0;
    for (let step = 0; step < 12; step += 1) {
      mirrorWetPaperLbmStep(kernel, { ...mirror, fIn, fOut, rhoIn, rhoOut });
      stepWetPaperWater(state, kernel, 1);
      for (let index = 0; index < cells * 9; index += 1) {
        const expected = state.fNext[index] as number;
        const error = Math.abs((fOut[index] as number) - expected) / (1e-6 + Math.abs(expected));
        if (error > maxError) maxError = error;
      }
      for (let i = 0; i < cells; i += 1) {
        expect(Math.abs((rhoOut[i] as number) - (state.rhoNext[i] as number))).toBeLessThan(1e-6);
        expect(Math.abs((mirror.velocity[2 * i] as number) - (state.ux[i] as number))).toBeLessThan(1e-6);
        expect(Math.abs((mirror.velocity[2 * i + 1] as number) - (state.uy[i] as number))).toBeLessThan(1e-6);
      }
      swapWetPaperBuffers(state);
      prepareWetPaperStep(state, fill);
      [fIn, fOut] = [fOut, fIn];
      [rhoIn, rhoOut] = [rhoOut, rhoIn];
    }
    expect(maxError, `max relative distribution error ${maxError.toExponential(2)}`).toBeLessThan(1e-5);
    // 접힘 문턱 위의 물은 흐름층에서 보존된다(부분 bounce-back은 링크 양 끝이 같은 κ를 쓴다).
    const finalMass = fIn.reduce((sum, value) => sum + value, 0);
    expect(Math.abs(finalMass - initialMass) / initialMass).toBeLessThan(1e-5);
    // 두 물방울 사이 마른 종이로는 전선이 고정돼 물이 다 번지지 않는다.
    let dryCells = 0;
    for (let i = 0; i < cells; i += 1) {
      if (mirror.wall[i] === 0 && (rhoIn[i] as number) === 0) dryCells += 1;
    }
    expect(dryCells).toBeGreaterThan(cells * 0.3);
  });
});
