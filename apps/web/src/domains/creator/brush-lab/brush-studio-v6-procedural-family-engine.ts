import { createConceptKernel } from "./brush-studio-v6-procedural-concept-kernels";
import { createHarmonyKernel, isHarmonyModel } from "./brush-studio-v6-procedural-harmony-kernels";
import { createKlecksKernel, isKlecksModel } from "./brush-studio-v6-procedural-klecks-kernels";
import { clamp, createProceduralSink, type ProceduralEnv, type ProceduralKernel } from "./brush-studio-v6-procedural-kit";
import type { BrushStudioV6MaterialProgram } from "./brush-studio-v6-material-engine";
import type { BrushStudioV6ProceduralModel } from "./brush-studio-v6-procedural-family-catalog";
import type { BrushTopologyStroke } from "./brush-studio-v6-topology-engine";

/** 모든 절차 모델이 지키는 덥당 프리미티브 상한(공용 위상 예산 66 이하). */
export const BRUSH_STUDIO_V6_PROCEDURAL_PRIMITIVE_CAP = 64;

function createKernel(model: BrushStudioV6ProceduralModel, env: ProceduralEnv): ProceduralKernel {
  if (isHarmonyModel(model)) return createHarmonyKernel(model, env);
  if (isKlecksModel(model)) return createKlecksKernel(model, env);
  return createConceptKernel(model, env);
}

/**
 * 절차 브러시 계열의 위상 획. 거리 시계(재표본 덥)만 보고, 캔버스를 읽지 않으며, 획마다 고정 크기 상태만 둔다.
 * 잘못된 접점(유한하지 않은 값)은 무시하고, 필압 0 은 획 상태를 비운다. 순간이동(덥 생략) 구간도 상태를 지우지 않고,
 * 길이 상한을 넘는 본선만 점으로 접는다 — 지난 점 반경 검사가 먼 점과의 연결을 이미 막는다.
 */
export function createBrushStudioV6ProceduralStroke(
  program: BrushStudioV6MaterialProgram, model: BrushStudioV6ProceduralModel, sampleStep: number,
): BrushTopologyStroke {
  const size = clamp(program.tuning.size, 1, 240);
  const env: ProceduralEnv = { t: program.tuning, size, seed: program.seed | 0, step: clamp(sampleStep, 0.01, 96) };
  const kernel = createKernel(model, env);
  const cap = Math.min(BRUSH_STUDIO_V6_PROCEDURAL_PRIMITIVE_CAP, kernel.maxPrimitivesPerDab);
  const maxLength = Math.max(size * 6, env.step * 3);
  return {
    maxPrimitivesPerDab: cap, retainedStateBytes: kernel.retainedStateBytes, reset: () => kernel.reset(),
    deposit(c, emit) {
      if (![c.x, c.y, c.radius, c.pressure, c.direction, c.index].every(Number.isFinite)) return;
      if (c.pressure <= 0) { kernel.reset(); return; }
      kernel.deposit(c, createProceduralSink(emit, cap, maxLength, c.direction));
    },
  };
}
