import { describe, expect, it } from "vitest";

import {
  brushStudioV6Node,
  createBrushStudioV6Program,
  type BrushStudioV6Program,
} from "./brush-studio-v6-engine";
import { planBrushStudioV6ProviderRuntime } from "./brush-studio-v6-provider-runtime";

function nodes(program: BrushStudioV6Program) {
  return [
    program.slots.input,
    program.slots.motion,
    program.slots.carrier,
    program.slots.tip,
    program.slots.surface,
    program.slots.deposition,
    program.slots.pickup,
    program.slots.pigment,
    ...program.slots.physics,
    program.slots.pattern,
    ...program.slots.finish,
    program.slots.output,
  ].map(brushStudioV6Node);
}

describe("Brush Studio V6 provider runtime", () => {
  it("기존 유화의 자체 안료와 호환 어댑터를 별도 실행 정체성으로 기록한다", () => {
    // 기존 유화의 다른 제한 어댑터는 해당 권리 프로필을 계속 요구한다.
    const plan = planBrushStudioV6ProviderRuntime(nodes(createBrushStudioV6Program("mixbox-oil-bristle")), "noncommercial-full");
    expect(plan).toMatchObject({ version: 2, fallbackPolicy: "none", valid: true, blockedNodeIds: [] });
    expect(plan.bindings.map((entry) => entry.providerId)).toEqual(expect.arrayContaining([
      "toonstudio-latent-pigment-v1",
      "krita-contact-adapter-gpl-v1",
      "pigment-painter-contact-adapter-v1",
      "toonstudio-cpu-contact-v2",
    ]));
  });

  it("blocks an unavailable pigment provider instead of substituting another engine", () => {
    const base = createBrushStudioV6Program("clean-ink");
    const program = {
      ...base,
      slots: { ...base.slots, pigment: "pigment-painter-lut" },
    };
    const plan = planBrushStudioV6ProviderRuntime(nodes(program));
    expect(plan.valid).toBe(false);
    expect(plan.blockedNodeIds).toContain("pigment-painter-lut");
    expect(plan.fallbackPolicy).toBe("none");
  });

  it("enforces permissive, copyleft and noncommercial profiles independently", () => {
    const program = createBrushStudioV6Program("mixbox-oil-bristle");
    const permissive = planBrushStudioV6ProviderRuntime(nodes(program), "permissive-only");
    expect(permissive.blockedNodeIds).toEqual(expect.arrayContaining([
      "carrier-krita-hairy",
      "tip-pigment-normal",
    ]));

    const sourceAvailable = planBrushStudioV6ProviderRuntime(nodes(program), "source-available");
    expect(sourceAvailable.blockedNodeIds).toEqual([]);

    const noncommercial = planBrushStudioV6ProviderRuntime(nodes(program), "noncommercial-full");
    expect(noncommercial.valid).toBe(true);
  });

  it("records compatibility adapters explicitly instead of claiming exact external execution", () => {
    const plan = planBrushStudioV6ProviderRuntime(nodes(createBrushStudioV6Program("mixbox-watercolor-bloom")));
    const hokusai = plan.bindings.find((entry) => entry.providerId === "hokusai-contact-adapter-v1");
    expect(hokusai).toMatchObject({ execution: "compatibility-adapter" });
    expect(hokusai?.nodeIds).toContain("carrier-hokusai-dabs");
  });
  it("rejects exact engines that belong to a different product path", () => {
    for (const [slot, id, productPath] of [
      ["motion", "motion-google-ink", "vector-runtime"],
      ["carrier", "carrier-google-mesh", "vector-runtime"],
      ["carrier", "carrier-p5-flow", "settled-generator"],
      ["pattern", "pattern-flow-field", "settled-generator"],
    ] as const) {
      const base = createBrushStudioV6Program("clean-ink");
      const program = { ...base, slots: { ...base.slots, [slot]: id } };
      const plan = planBrushStudioV6ProviderRuntime(nodes(program));
      expect(plan.valid).toBe(false);
      expect(plan.blockedNodes).toContainEqual(expect.objectContaining({
        nodeId: id, reason: "wrong-product-path", productPath,
      }));
    }
  });

  it("keeps manifest and material execution admission in one source of truth", () => {
    // 자체 안료를 사용해도 다른 제한 어댑터의 권리 프로필은 그대로 검사한다.
    for (const [recipeId, profile] of [
      ["clean-ink", undefined],
      ["natural-calligraphy", undefined],
      ["mixbox-watercolor-bloom", "noncommercial-full"],
      ["mixbox-oil-bristle", "noncommercial-full"],
    ] as const) {
      const plan = planBrushStudioV6ProviderRuntime(nodes(createBrushStudioV6Program(recipeId)), profile);
      expect(plan.valid, recipeId).toBe(true);
      expect(plan.bindings.every((binding) => binding.productPath === "material-contact")).toBe(true);
    }
  });

});
