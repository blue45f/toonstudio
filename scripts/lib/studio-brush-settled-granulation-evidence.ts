import { resolveStudioWetPaperBakeProgramIdForBrush } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-watercolor-settled-surface";
import { createWetPaperKernel } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-kernel";
import { createWetPaperSheetSampler } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-paper";
import { stepWetPaperPigment } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-pigment";
import { resolveStudioWetPaperBakeProgram } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-programs";
import { createWetPaperState } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-state";

import type { StudioBrushEngineProgramSet } from "../../apps/web/src/domains/creator/brush/studio-brush-engine-program-set";
import type { WetPaperKernel } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-kernel";
import type { StudioWetPaperBakeProgram, StudioWetPaperBakeProgramId } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-programs";

export interface StudioWetPaperGranulationResponse {
  readonly valleyHeight: number;
  readonly ridgeHeight: number;
  readonly valleySettledMass: number;
  readonly ridgeSettledMass: number;
  readonly valleyCaptureExcess: number;
  readonly responsive: boolean;
}

export interface StudioBrushSettledGranulationEvidence extends StudioWetPaperGranulationResponse {
  readonly programId: StudioWetPaperBakeProgramId;
}

/** 이웃을 말려 수송을 끄고 같은 젖음·안료 조건에서 종이 높이에 따른 실제 침착 패스만 측정한다. */
function settledMassAtHeight(
  program: StudioWetPaperBakeProgram,
  kernel: WetPaperKernel,
  height: number,
): number {
  const state = createWetPaperState({
    width: 16, height: 16, cells: 256, tilesX: 4, tilesY: 4,
    originXPx: 0, originYPx: 0, cellPx: 1,
  });
  const cell = 6 * state.grid.width + 6;
  state.processList[0] = 5;
  state.processCount = 1;
  state.height[cell] = height;
  state.wetNext[cell] = kernel.depthRef;
  state.dryStep[cell] = -1;
  const totalShare = program.pigments[0].share + program.pigments[1].share;
  for (let species = 0; species < 2; species += 1) {
    const share = program.pigments[species as 0 | 1].share;
    state.gCur[species * state.grid.cells + cell] = totalShare > 0 ? share / totalShare : 0;
  }
  stepWetPaperPigment(state, kernel);
  return state.dep[cell] + state.fix[cell]
    + state.dep[state.grid.cells + cell] + state.fix[state.grid.cells + cell];
}

/**
 * 기존 종이 샘플러와 안료 패스의 작은 기전 증거다. 전체 정착 래스터·분사 산포·외관 품질을 보증하지 않는다.
 * 양의 granulation 설정만 확인하지 않고 실제 낱장의 골·마루를 같은 안료 조건으로 비교한다.
 */
export function measureStudioWetPaperGranulationResponse(
  program: StudioWetPaperBakeProgram,
): StudioWetPaperGranulationResponse {
  const sampler = createWetPaperSheetSampler(program.sheet);
  const sample = { height: 0.5, fiber: 0, fiberCos: 1, fiberSin: 0 };
  let valleyHeight = 1;
  let ridgeHeight = 0;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      sampler.sample(x + 0.5, y + 0.5, sample);
      valleyHeight = Math.min(valleyHeight, sample.height);
      ridgeHeight = Math.max(ridgeHeight, sample.height);
    }
  }
  const kernel = createWetPaperKernel(program);
  const valleySettledMass = settledMassAtHeight(program, kernel, valleyHeight);
  const ridgeSettledMass = settledMassAtHeight(program, kernel, ridgeHeight);
  const valleyCaptureExcess = valleySettledMass - ridgeSettledMass;
  return {
    valleyHeight, ridgeHeight, valleySettledMass, ridgeSettledMass, valleyCaptureExcess,
    responsive: ridgeHeight > valleyHeight && valleyCaptureExcess > 0,
  };
}

/** 렌더러와 같은 오버라이드 우선순위를 통과한 정착 프로그램만 감사 증거로 사용한다. */
export function profileStudioBrushSettledGranulationEvidence(
  brushId: string,
  enginePrograms?: StudioBrushEngineProgramSet | null,
): StudioBrushSettledGranulationEvidence | null {
  const programId = resolveStudioWetPaperBakeProgramIdForBrush(brushId, enginePrograms);
  const program = resolveStudioWetPaperBakeProgram(programId);
  if (!programId || !program) return null;
  return { programId, ...measureStudioWetPaperGranulationResponse(program) };
}
