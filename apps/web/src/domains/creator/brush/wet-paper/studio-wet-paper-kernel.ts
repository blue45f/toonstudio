/**
 * 프로그램 → 스텝 상수(베이크당 한 번 계산). 내부 스케일 상수의 근거는 같은 디렉터리의
 * `studio-wet-paper-solver.test.ts` 보정 기록(가장자리 짙어짐·백런·질량 보존 게이트)이다.
 */

import { clamp01, clampNumber } from "./studio-wet-paper-math";

import type { StudioWetPaperBakeProgram, StudioWetPaperPigmentProgram } from "./studio-wet-paper-programs";

export interface WetPaperPigmentKernel {
  /** 이 종을 계산하는가(비율 0이면 건너뛴다). */
  readonly active: boolean;
  readonly mobility: number;
  readonly granulation: number;
  readonly staining: number;
  readonly settleRate: number;
  readonly liftRate: number;
  /** 골 방향 미끄러짐(면 유출 비율). */
  readonly grainDrift: number;
}

export interface WetPaperKernel {
  // ---- 흐름층(LBM) ----
  /** 링크 투과율이 1이 되는 링크 평균 밀도. */
  readonly rhoFull: number;
  /** 젖음 판정(표면 + 흐름층 물). */
  readonly rhoDry: number;
  /** 젖음 전선 고정 문턱 배율: ρ_pin = pinThreshold·(0.3 + κ_종이). */
  readonly pinThreshold: number;
  readonly surfaceTension: number;
  readonly uMax: number;
  readonly aMax: number;
  readonly capillaryForce: number;
  readonly slopeForce: number;
  readonly edgeFlow: number;
  // ---- 물 교환 ----
  readonly surfaceCap: number;
  readonly seepRate: number;
  readonly seepSplit: number;
  readonly flowAbsorb: number;
  readonly capillaryDiffusion: number;
  readonly capillaryThreshold: number;
  readonly evapSurface: number;
  readonly evapFlow: number;
  readonly evapCapillary: number;
  readonly edgeBoost: number;
  readonly waterEps: number;
  readonly blurKeepWet: number;
  readonly blurKeepDry: number;
  readonly blurFull: number;
  // ---- 안료 ----
  readonly pigmentDiffusion: number;
  readonly invGref: number;
  readonly edgeDrift: number;
  readonly capillaryCarry: number;
  /** 마르면서 앉는 비율: 흡착률 += dryingCapture·(1 − 젖음)². 젖은 동안 안료는 움직이고 마를 때 내려앉는다. */
  readonly dryingCapture: number;
  readonly depthRef: number;
  /** 건조 가속: 증발 배율 = 1 + dryRampGain·smoothstep(dryRampStart, 1, t/N) — 고정 스텝 안에 마르게 한다. */
  readonly dryRampStart: number;
  readonly dryRampGain: number;
  readonly granulationGain: number;
  readonly fiberCapture: number;
  readonly captureSpeedRef: number;
  readonly rewet: number;
  readonly cureSteps: number;
  readonly species: readonly [WetPaperPigmentKernel, WetPaperPigmentKernel];
}

function pigmentKernel(pigment: StudioWetPaperPigmentProgram): WetPaperPigmentKernel {
  const granulation = clamp01(pigment.granulation);
  return Object.freeze({
    active: pigment.share > 0,
    mobility: clamp01(pigment.mobility),
    granulation,
    staining: clamp01(pigment.staining),
    settleRate: clampNumber(pigment.settleRate, 0, 0.4),
    liftRate: clampNumber(pigment.liftRate, 0, 0.2),
    grainDrift: 0.2 * granulation,
  });
}

export function createWetPaperKernel(program: StudioWetPaperBakeProgram): WetPaperKernel {
  const edge = clampNumber(program.edgeDarkening, 0, 2);
  const evaporation = clampNumber(program.evaporation, 0, 0.05);
  const k0 = clampNumber(program.sheet.fiberBlocking, 0, 0.9);
  return Object.freeze({
    rhoFull: 0.06,
    rhoDry: 0.004,
    pinThreshold: 0.32 * clamp01(program.pinning),
    surfaceTension: clamp01(program.surfaceTension),
    uMax: 0.18,
    aMax: 0.04,
    capillaryForce: clampNumber(program.capillaryForce, 0, 0.2),
    slopeForce: 0.02,
    edgeFlow: 0.05 * edge,
    surfaceCap: 1.2,
    seepRate: clampNumber(program.seepRate, 0, 0.5),
    seepSplit: clamp01(program.seepSplit),
    flowAbsorb: 0.04,
    capillaryDiffusion: clampNumber(program.capillaryDiffusion, 0, 0.25),
    capillaryThreshold: clamp01(program.capillaryThreshold),
    evapSurface: evaporation,
    evapFlow: evaporation * 0.75,
    evapCapillary: evaporation * 0.35,
    edgeBoost: 2 * edge,
    waterEps: 1e-4,
    blurKeepWet: 0.95,
    blurKeepDry: 0.85,
    blurFull: 0.08,
    pigmentDiffusion: 0.05,
    invGref: 1 / Math.max(0.05, 1 - k0),
    edgeDrift: 0.3 * edge,
    capillaryCarry: 0.9,
    dryingCapture: 0.35,
    depthRef: 0.3,
    dryRampStart: clamp01(program.dryRampStart),
    dryRampGain: clampNumber(program.dryRampGain, 0, 8),
    granulationGain: 1.2,
    fiberCapture: 0.02 * clamp01(program.pinning),
    captureSpeedRef: 0.05,
    rewet: clamp01(program.rewet),
    cureSteps: Math.max(1, Math.round(clampNumber(program.cureSteps, 1, 64))),
    species: Object.freeze([
      pigmentKernel(program.pigments[0]),
      pigmentKernel(program.pigments[1]),
    ] as const),
  });
}
