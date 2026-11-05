/** 감사 전용 근거. 프로그램 표는 UI 의미 표시 경로에서 정적으로 읽지 않는다. */
import { createWetPaperKernel } from "./studio-wet-paper-kernel";
import { resolveStudioWetPaperBakeProgram } from "./studio-wet-paper-programs";
import { resolveStudioWetPaperBakeProgramIdForBrush } from "./studio-watercolor-settled-surface";

import type { StudioBrushEngineProgramSet } from "../studio-brush-engine-program-set";
import type { StudioWetPaperBakeProgram } from "./studio-wet-paper-programs";

/** 합성 단계의 종이 무늬와 구분하여 실제 활성 안료의 골 침전 커널만 인정한다. */
export function studioWetPaperProgramSupportsPigmentGranulation(
  program: StudioWetPaperBakeProgram,
): boolean {
  const kernel = createWetPaperKernel(program);
  return kernel.granulationGain > 0 && kernel.species.some((pigment) => (
    pigment.active && pigment.granulation > 0 && pigment.settleRate > 0
  ));
}

/** 렌더러와 같은 프로그램 해석을 써서 블룸·리빙잉크 오버라이드도 존중한다. */
export function profileStudioWetPaperSemanticEvidence(
  brushId: unknown,
  enginePrograms?: StudioBrushEngineProgramSet | null,
) {
  const programId = resolveStudioWetPaperBakeProgramIdForBrush(brushId, enginePrograms);
  const program = resolveStudioWetPaperBakeProgram(programId);
  return program ? Object.freeze({
    programId,
    pigmentGranulationResponse: studioWetPaperProgramSupportsPigmentGranulation(program),
  }) : null;
}
