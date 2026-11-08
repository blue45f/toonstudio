import { beforeEach, describe, expect, it } from "vitest";

import { planCausalWatercolorBrushDabs } from "../studio-causal-watercolor-brush";

import { applyStudioBrushAliasWatercolorMaterial } from "./studio-brush-alias-profile";
import { planStudioWetRibbonCarrier } from "./studio-wet-ribbon-carrier";
import {
  planStudioWetWashLivePipeline,
  resetStudioWetWashLivePipelineCacheForTests,
} from "./studio-wet-wash-live-pipeline";

const BRUSHES = ["watercolor--granular", "ink-wash--dry-brush"] as const;
const SEED = 4171;

function inputFor(copy: number, copies: number, count: number) {
  const angle = copy * 2 * Math.PI / copies;
  const points: number[] = [];
  const pressures: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = 20 + index * 7;
    const y = 40 + Math.sin(index * 0.4) * 10;
    points.push(x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle));
    pressures.push(0.3 + index % 5 * 0.1);
  }
  return { points, pressures, baseWidth: 24, seed: SEED, maxDabs: 512, previewEndpoint: true };
}

beforeEach(resetStudioWetWashLivePipelineCacheForTests);

describe("대칭 워시의 보관/배치 경로 호환성", () => {
  // 런타임 전환은 아직 도입하지 않는다. 8슬롯 경계 양쪽에서 대안 배치 체인의 값만 검증한다.
  for (const brushId of BRUSHES) {
    it.each([1, 8, 9, 12])(`${brushId}: %i개 대칭의 매 prefix가 활성 배치 체인과 같다`, (copies) => {
      for (const count of [2, 6, 12]) {
        for (let copy = 0; copy < copies; copy += 1) {
          const input = inputFor(copy, copies, count);
          const live = planStudioWetWashLivePipeline(`symmetry#${copy}`, { brushId, input, carrierSeed: SEED });
          const dabs = applyStudioBrushAliasWatercolorMaterial(
            brushId, planCausalWatercolorBrushDabs(input, false), SEED, "live",
          );
          expect(live).not.toBeNull();
          expect(live?.dabs).toEqual(dabs);
          expect(live?.carrierPlan).toEqual(planStudioWetRibbonCarrier(dabs, { seed: SEED }));
        }
      }
    });
  }

  it("별도 키의 활성 획이 끼어들어도 대칭별 기하가 섞이지 않는다", () => {
    const firstInput = inputFor(0, 8, 6);
    const first = planStudioWetWashLivePipeline("first#0", { brushId: BRUSHES[0], input: firstInput, carrierSeed: SEED });
    const expected = structuredClone(first);
    for (let copy = 0; copy < 12; copy += 1) {
      planStudioWetWashLivePipeline(`other#${copy}`, { brushId: BRUSHES[0], input: inputFor(copy, 12, 12), carrierSeed: SEED });
    }
    expect(planStudioWetWashLivePipeline("first#0", { brushId: BRUSHES[0], input: firstInput, carrierSeed: SEED })).toEqual(expected);
  });
});
