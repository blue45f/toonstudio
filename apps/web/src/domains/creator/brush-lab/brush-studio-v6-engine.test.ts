import { describe, expect, it } from "vitest";

import {
  BRUSH_STUDIO_V6_FULL_CAPABILITIES,
  BRUSH_STUDIO_V6_NODES,
  BRUSH_STUDIO_V6_RECIPES,
  BRUSH_STUDIO_V6_SCHEMA_VERSION,
  analyzeBrushStudioV6Program,
  createBrushStudioV6Program,
  normalizeBrushStudioV6Program,
  optimizeBrushStudioV6Program,
  patchBrushStudioV6Input,
  replaceBrushStudioV6Slot,
  toggleBrushStudioV6Node,
} from "./brush-studio-v6-engine";
import { isBrushStudioV6MaterialNodeImplemented, normalizeBrushStudioV6MaterialConfig } from "./brush-studio-v6-material-engine";

describe("Brush Studio V6 quality authority", () => {
  it("keeps node and recipe identities unique", () => {
    expect(new Set(BRUSH_STUDIO_V6_NODES.map((entry) => entry.id)).size).toBe(BRUSH_STUDIO_V6_NODES.length);
    expect(new Set(BRUSH_STUDIO_V6_RECIPES.map((entry) => entry.id)).size).toBe(BRUSH_STUDIO_V6_RECIPES.length);
  });

  it("creates recipes with the one actual contact output while preserving unsupported imported output intent", () => {
    const outputNodes = BRUSH_STUDIO_V6_NODES.filter((node) => node.slot === "output" && isBrushStudioV6MaterialNodeImplemented(node.id));
    expect(outputNodes.map((node) => node.id)).toEqual(["output-contact-canvas-svg"]);
    expect(outputNodes[0]).toMatchObject({ label: "Canvas Contacts + SVG", domain: "main", provider: "ToonStudio Contact Kernel", requires: [] });
    for (const recipe of BRUSH_STUDIO_V6_RECIPES) {
      expect(recipe.create().slots.output).toBe("output-contact-canvas-svg");
      expect(normalizeBrushStudioV6MaterialConfig(recipe.create())?.slots.output).toBe("output-contact-canvas-svg");
    }
    for (const output of ["output-raster-tiles", "output-hybrid", "output-vector"]) {
      const original = createBrushStudioV6Program();
      const imported = normalizeBrushStudioV6Program({ ...original, slots: { ...original.slots, output } });
      expect(imported.slots.output).toBe(output);
      expect(normalizeBrushStudioV6MaterialConfig(imported)?.slots.output).toBe(output);
      expect(isBrushStudioV6MaterialNodeImplemented(output)).toBe(false);
    }
  });

  it("기존 Mixbox 레시피의 실행 구조를 보존하고 자체 안료 제공자로 기록한다", () => {
    for (const recipe of BRUSH_STUDIO_V6_RECIPES.filter((entry) => entry.id.startsWith("mixbox-"))) {
      const analysis = analyzeBrushStudioV6Program(
        recipe.create(),
        BRUSH_STUDIO_V6_FULL_CAPABILITIES,
        // 다른 copyleft·private-grant 어댑터의 기존 권리 경계는 보존한다.
        "noncommercial-full",
      );
      expect(analysis.providerPlan.valid, `${recipe.id}: ${analysis.providerPlan.blockedNodeIds.join(", ")}`)
        .toBe(true);
      expect(analysis.valid, `${recipe.id}: ${analysis.issues.map((entry) => entry.id).join(", ")}`)
        .toBe(true);
      expect(analysis.providerPlan.bindings.some((entry) => entry.providerId === "toonstudio-latent-pigment-v1"))
        .toBe(true);
    }
  });

  it("compiles connected recipes and fails unavailable providers closed without fallback", () => {
    for (const recipe of BRUSH_STUDIO_V6_RECIPES) {
      const analysis = analyzeBrushStudioV6Program(recipe.create(), BRUSH_STUDIO_V6_FULL_CAPABILITIES);
      if (analysis.providerPlan.valid) {
        expect(analysis.valid, `${recipe.id}: ${analysis.issues.map((entry) => entry.id).join(", ")}`).toBe(true);
      } else {
        expect(analysis.valid).toBe(false);
        expect(analysis.providerPlan.fallbackPolicy).toBe("none");
        expect(analysis.providerPlan.blockedNodeIds.length).toBeGreaterThan(0);
        expect(analysis.providerPlan.blockedNodeIds.every((id) =>
          analysis.issues.some((entry) => entry.id === `provider-${id}`)
        )).toBe(true);
      }
      expect(analysis.passes.some((entry) => entry.phase === "commit")).toBe(true);
      expect(analysis.passes.some((entry) => entry.phase === "export")).toBe(true);
    }
  });

  it("does not migrate legacy V5 payloads into the new authority", () => {
    const program = normalizeBrushStudioV6Program({
      schemaVersion: 5,
      engineId: "inkwash",
      physicsIds: ["wet-flow"],
      tuning: { size: 999 },
    });
    expect(program.schemaVersion).toBe(BRUSH_STUDIO_V6_SCHEMA_VERSION);
    expect(program.id).toBe("clean-ink");
    expect(program.tuning.size).not.toBe(999);
  });

  it("fails closed when predicted samples can mutate canonical state", () => {
    const unsafe = patchBrushStudioV6Input(createBrushStudioV6Program(), { predictionPreviewOnly: false });
    const analysis = analyzeBrushStudioV6Program(unsafe, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.some((entry) => entry.id === "prediction-authority")).toBe(true);
  });

  it("이전 안료 노드를 자체 혼색으로 실행하고 색 결과 변경을 알린다", () => {
    const mixbox = replaceBrushStudioV6Slot(
      createBrushStudioV6Program(),
      "pigment",
      "pigment-mixbox",
    );
    const analysis = analyzeBrushStudioV6Program(mixbox, BRUSH_STUDIO_V6_FULL_CAPABILITIES, "noncommercial-full");
    expect(analysis.valid).toBe(true);
    expect(analysis.rightsProfile).toBe("commercial-safe");
    expect(analysis.issues.some((entry) =>
      entry.id === "legacy-pigment-internalized" && entry.severity === "info"
    )).toBe(true);
  });

  it("enforces permissive, source-available and noncommercial license profiles", () => {
    const mixbox = createBrushStudioV6Program("mixbox-watercolor-bloom");
    const permissive = analyzeBrushStudioV6Program(
      mixbox,
      BRUSH_STUDIO_V6_FULL_CAPABILITIES,
      "permissive-only",
    );
    expect(permissive.valid).toBe(false);
    expect(permissive.issues.some((entry) => entry.id === "license-pigment-mixbox"))
      .toBe(false);
    expect(permissive.providerPlan.blockedNodeIds).toContain("physics-inkwash");
    // Copyleft exemplar is synthetic: the authored presets that used the
    // copyleft adapters were remapped to internal nodes (license resolution),
    // so no catalog preset is copyleft-only anymore.
    const copyleftProgram = replaceBrushStudioV6Slot(
      createBrushStudioV6Program("clean-ink"),
      "tip",
      "tip-krita-dual",
    );
    const sourceAvailable = analyzeBrushStudioV6Program(
      copyleftProgram,
      BRUSH_STUDIO_V6_FULL_CAPABILITIES,
      "source-available",
    );
    expect(sourceAvailable.valid).toBe(true);
    expect(sourceAvailable.rightsProfile).toBe("copyleft-distribution");
    expect(analyzeBrushStudioV6Program(
      mixbox,
      BRUSH_STUDIO_V6_FULL_CAPABILITIES,
      "noncommercial-full",
    ).valid).toBe(true);
  });

  it("requires Inkwash or height input for thin-film physics", () => {
    const thinFilm = toggleBrushStudioV6Node(createBrushStudioV6Program(), "physics", "physics-thin-film");
    const analysis = analyzeBrushStudioV6Program(thinFilm, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.some((entry) => entry.id === "thin-film-source")).toBe(true);
  });

  it("requires bristle dynamics for the Krita Hairy carrier", () => {
    const hairy = replaceBrushStudioV6Slot(createBrushStudioV6Program(), "carrier", "carrier-krita-hairy");
    const analysis = analyzeBrushStudioV6Program(hairy, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.some((entry) => entry.id === "hairy-without-bristle")).toBe(true);
  });

  it("rejects vector-only output for physical brushes", () => {
    const wet = createBrushStudioV6Program("mineral-bloom");
    const vector = replaceBrushStudioV6Slot(wet, "output", "output-vector");
    const analysis = analyzeBrushStudioV6Program(vector, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.some((entry) => entry.id === "vector-physical-output")).toBe(true);
  });

  it("allocates the complete wet field set for Inkwash recipes", () => {
    const analysis = analyzeBrushStudioV6Program(createBrushStudioV6Program("mineral-bloom"), BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    const resources = new Set(analysis.resources.map((entry) => entry.id));
    expect(resources.has("mobile-pigment")).toBe(true);
    expect(resources.has("fixed-pigment")).toBe(true);
    expect(resources.has("wetness")).toBe(true);
    expect(resources.has("velocity")).toBe(true);
    expect(resources.has("pressure")).toBe(true);
  });

  it("fuses adjacent WebGPU nodes into a single live pass", () => {
    const analysis = analyzeBrushStudioV6Program(createBrushStudioV6Program("clean-ink"), BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    const livePasses = analysis.passes.filter((entry) => entry.phase === "live");
    expect(livePasses).toHaveLength(1);
    expect(livePasses[0]?.domain).toBe("webgpu");
    expect(livePasses[0]?.nodeIds.length).toBeGreaterThan(4);
  });

  it("keeps WASM carriers isolated from fused WebGPU passes", () => {
    // Fixture uses the permissive WASM carrier: oil-hair-mixer itself was
    // remapped off the copyleft Krita carrier (license resolution).
    const wasmCarrierProgram = replaceBrushStudioV6Slot(
      createBrushStudioV6Program("oil-hair-mixer"),
      "carrier",
      "carrier-libmypaint-dabs",
    );
    const analysis = analyzeBrushStudioV6Program(wasmCarrierProgram, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(analysis.passes.some((entry) => entry.domain === "wasm-worker" && entry.nodeIds.includes("carrier-libmypaint-dabs"))).toBe(true);
    expect(analysis.passes.some((entry) => entry.domain === "webgpu" && entry.nodeIds.includes("physics-bristle"))).toBe(true);
  });

  it("selects the best supported input transport", () => {
    const optimized = optimizeBrushStudioV6Program(createBrushStudioV6Program(), {
      ...BRUSH_STUDIO_V6_FULL_CAPABILITIES,
      pointerRawUpdate: false,
      sharedArrayBuffer: false,
      coalescedEvents: true,
    });
    expect(optimized.input.transport).toBe("move-coalesced");
  });

  it("falls back from explicitly selected unavailable input transports", () => {
    const raw = patchBrushStudioV6Input(createBrushStudioV6Program(), { transport: "raw-coalesced" });
    const basic = optimizeBrushStudioV6Program(raw, { ...BRUSH_STUDIO_V6_FULL_CAPABILITIES, pointerRawUpdate: false, coalescedEvents: false });
    expect(basic.input.transport).toBe("move-basic");
    const withoutSharedMemory = optimizeBrushStudioV6Program(raw, { ...BRUSH_STUDIO_V6_FULL_CAPABILITIES, sharedArrayBuffer: false });
    expect(withoutSharedMemory.input.transport).toBe("raw-coalesced");
  });

  it("never substitutes the selected Mixbox provider during optimization", () => {
    const mixbox = replaceBrushStudioV6Slot(
      createBrushStudioV6Program(),
      "pigment",
      "pigment-mixbox",
    );
    expect(optimizeBrushStudioV6Program(
      mixbox,
      BRUSH_STUDIO_V6_FULL_CAPABILITIES,
    ).slots.pigment).toBe("pigment-mixbox");
  });

  it("preserves deterministic recipe output", () => {
    expect(createBrushStudioV6Program("kaleido-swarm")).toEqual(createBrushStudioV6Program("kaleido-swarm"));
  });

  it("토폴로지 캐리어로 전환할 때 호환되는 pickup과 tip 노드를 유지하고 비호환 노드는 기본값으로 대체한다", () => {
    const base = createBrushStudioV6Program("clean-ink");
    const withCompatible = replaceBrushStudioV6Slot(
      replaceBrushStudioV6Slot(base, "pickup", "pickup-krita-smudge"),
      "tip",
      "tip-krita-dual",
    );
    const switchedCompatible = replaceBrushStudioV6Slot(
      withCompatible,
      "carrier",
      "carrier-cpu-spring-filaments-v1",
    );
    expect(switchedCompatible.slots.carrier).toBe("carrier-cpu-spring-filaments-v1");
    expect(switchedCompatible.slots.pickup).toBe("pickup-krita-smudge");
    expect(switchedCompatible.slots.tip).toBe("tip-krita-dual");

    const withIncompatible = replaceBrushStudioV6Slot(
      replaceBrushStudioV6Slot(base, "pickup", "pickup-pigment-reservoir"),
      "tip",
      "tip-motif-atlas",
    );
    const switchedIncompatible = replaceBrushStudioV6Slot(
      withIncompatible,
      "carrier",
      "carrier-cpu-spring-filaments-v1",
    );
    expect(switchedIncompatible.slots.pickup).toBe("pickup-none");
    expect(switchedIncompatible.slots.tip).toBe("tip-round-sdf");
  });
});
