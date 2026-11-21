import { describe, expect, it } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { BRUSH_PRESETS } from "../studio-brush";
import { readStudioCuttoonEditorSource } from "../studio-cuttoon-editor/read-studio-cuttoon-editor-source";
import { mergeHydratedStudioToolOperationMemory, normalizeStudioToolOperationMemory, rememberStudioToolOperationSnapshot } from "../studio-tool-operation-memory";
import { studioCoreBrushCatalogSelection } from "./studio-brush-selection";
import { studioBrushCatalogSelectionSnapshot, studioBrushSlotSelectionSnapshot } from "./studio-brush-selection-snapshot";
import { assignStudioBrushSlot, emptyStudioBrushSlots, normalizeStudioBrushSlotsState, rememberStudioBrushSlot } from "./studio-brush-slots";
import { studioMaterialBrushConfig } from "./studio-material-brush-runtime";

import { createStudioBuiltInBrushDefaultRestoreProfile } from "./studio-brush-default-restore";
import { DEFAULT_STUDIO_BRUSH_SNAPSHOT, sanitizeBrushSnapshot } from "./studio-brush-library";
import { resolveStudioStampBrushStyle } from "./studio-brush-stamp-engine";

const material = () => createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));

describe("material brush selection transitions", () => {
  it.each(["pen", "brush", "standard-eraser"])("releases material authority when selecting built-in %s", (id) => {
    const preset = BRUSH_PRESETS.find((candidate) => candidate.id === id)!;
    const saved = material();
    const oil = { bristlePhysics: true, bristleLoadDynamics: false, impastoRelief: true };
    const current = { ...saved, enginePrograms: { ...saved.enginePrograms!, oil } };
    const selection = studioCoreBrushCatalogSelection(preset);
    const next = studioBrushCatalogSelectionSnapshot(current, selection, {
      brushId: id, strokeWidth: preset.defaultWidth, brushOpacity: preset.defaultOpacity, color: current.color,
    });
    expect(next.brushId).toBe(id);
    expect(next.enginePrograms?.material).toBeUndefined();
    expect(next.enginePrograms).toBeNull();
    expect(studioMaterialBrushConfig({
      points: [0, 0, 20, 20], stroke: next.color, strokeWidth: next.strokeWidth,
      brushEnginePrograms: next.enginePrograms ?? undefined,
    })).toBeNull();
    const initialMemory = normalizeStudioToolOperationMemory(null);
    const merged = mergeHydratedStudioToolOperationMemory({
      hydratedMemory: rememberStudioToolOperationSnapshot(initialMemory, "paint", saved),
      initialMemory, activeOperation: preset.operation, activeSnapshot: next,
      operationTransitionTouched: true,
    });
    expect(merged.memory[preset.operation].enginePrograms?.material).toBeUndefined();
    expect(merged.shouldApplyHydratedActiveSnapshot).toBe(false);
  });

  it("clears material for legacy recent slots, and recalls a material slot's own program after reload", () => {
    const saved = material();
    const legacy = { brushId: "pen", strokeWidth: 6, brushOpacity: 1 };
    expect(studioBrushSlotSelectionSnapshot(saved, legacy).enginePrograms).toBeNull();
    const slots = assignStudioBrushSlot(emptyStudioBrushSlots(), 0, {
      brushId: saved.brushId, strokeWidth: 240, brushOpacity: 0.01,
      brushDynamics: saved.brushDynamics, enginePrograms: saved.enginePrograms,
    });
    const reloaded = normalizeStudioBrushSlotsState(JSON.parse(JSON.stringify(slots)));
    const recalled = studioBrushSlotSelectionSnapshot(studioBrushSlotSelectionSnapshot(saved, legacy), reloaded.slots[0]!);
    expect(recalled.enginePrograms).toEqual(saved.enginePrograms);
    expect(recalled.strokeWidth).toBe(240);
    expect(recalled.brushOpacity).toBe(0.01);
    expect(studioBrushSlotSelectionSnapshot(saved, { ...legacy, enginePrograms: null }).enginePrograms).toBeNull();
  });

  it("recalls colour and stabilizer when present while legacy slots preserve current values", () => {
    const current = material();
    const legacy = studioBrushSlotSelectionSnapshot(current, {
      brushId: "pen", strokeWidth: 6, brushOpacity: 1,
    });
    expect(legacy.color).toBe(current.color);
    expect(legacy.stabilizer).toBe(current.stabilizer);

    const recalled = studioBrushSlotSelectionSnapshot(current, {
      brushId: "pen",
      strokeWidth: 6,
      brushOpacity: 1,
      color: "#aabbcc",
      stabilizer: 8,
    });
    expect(recalled.color).toBe("#aabbcc");
    expect(recalled.stabilizer).toBe(8);
  });

  it("keeps two material slots with the same base id and different pigments independently recallable", () => {
    const a = material();
    // mineral-bloom uses private-grant inkwash nodes: created under the explicit
    // noncommercial-full opt-in (P0 license decision); the default profile
    // refuses it, as the persistence BLOCKED cases verify.
    const b = createBrushStudioV6ProductBrush(createBrushStudioV6Program("mineral-bloom"), "noncommercial-full");
    const shared = { brushId: "brush", strokeWidth: 24, brushOpacity: 0.5 };
    const slots = rememberStudioBrushSlot(rememberStudioBrushSlot(emptyStudioBrushSlots(), {
      ...shared, enginePrograms: a.enginePrograms,
    }), { ...shared, enginePrograms: b.enginePrograms });
    expect(slots.slots.filter(Boolean)).toHaveLength(2);
  });

  it("wires each host selection to its snapshot and captures authority before React setters", () => {
    const source = readStudioCuttoonEditorSource();
    for (const [name, next, helper] of [
      ["applyStudioBrushCatalogSelection", "applyBuiltInBrushPreset", "studioBrushCatalogSelectionSnapshot"],
      ["applyBrushSlot", "applyDynamicsPreset", "studioBrushSlotSelectionSnapshot"],
    ]) {
      const start = source.indexOf(`function ${name}(`);
      const block = source.slice(start, source.indexOf(`function ${next}(`, start));
      expect(block).toContain(helper);
      expect(block).toContain("setBrushEnginePrograms(snapshot.enginePrograms ?? null)");
      expect(block).toContain("toolOperationMemoryRef.current = rememberStudioToolOperationSnapshot(");
      expect(block.indexOf("currentBrushSnapshotRef.current = snapshot")).toBeGreaterThan(-1);
      expect(block.indexOf("currentBrushSnapshotRef.current = snapshot")).toBeLessThan(block.indexOf("setBrush("));
      expect(block.indexOf("toolOperationMemoryTouchedRef.current = true")).toBeLessThan(block.indexOf("setBrush("));
      if (name === "applyBrushSlot") {
        expect(block).toContain("setColor(snapshot.color)");
        expect(block).toContain("setStabilizer(snapshot.stabilizer)");
      }
    }
  });

  it("captures the current colour and stabilizer in recent and numbered slot writes", () => {
    const source = readStudioCuttoonEditorSource();
    const recentStart = source.indexOf("rememberStudioBrushSlot(prev, {");
    const recentBlock = source.slice(recentStart, recentStart + 1_600);
    expect(recentBlock).toContain("color: snapshot.color");
    expect(recentBlock).toContain("stabilizer: snapshot.stabilizer");

    const assignedStart = source.indexOf("assignStudioBrushSlot(prev, index, {");
    const assignedBlock = source.slice(assignedStart, assignedStart + 1_200);
    expect(assignedBlock).toContain("color,");
    expect(assignedBlock).toContain("stabilizer,");
  });
});

describe("Fringe authored stamp controls", () => {
  const fringe = BRUSH_PRESETS.find(({ id }) => id === "mypaint-cc0--watercolor-fringe")!;
  const selection = studioCoreBrushCatalogSelection(fringe);
  const stock = { flow: 0.26, hardness: 0.28, minSize: 0.55 };
  const authored = { flow: 0.7752, hardness: 0.9, minSize: 1 };
  const custom = { flow: 0.43, hardness: 0.51, minSize: 0.67 };
  const current = { ...DEFAULT_STUDIO_BRUSH_SNAPSHOT, stampTuning: custom };

  it("uses the authored Fringe controls on fresh selection, slot recall, and built-in reset", () => {
    const applied = { brushId: fringe.id, strokeWidth: 34, brushOpacity: 0.55, color: current.color };
    const next = studioBrushCatalogSelectionSnapshot(current, selection, applied);
    expect(next.stampTuning).toEqual(authored);
    const reloaded = normalizeStudioBrushSlotsState(JSON.parse(JSON.stringify(
      assignStudioBrushSlot(emptyStudioBrushSlots(), 0, applied),
    )));
    expect(studioBrushSlotSelectionSnapshot(current, reloaded.slots[0]!).stampTuning).toEqual(authored);
    expect(createStudioBuiltInBrushDefaultRestoreProfile(selection).values.stampTuning).toEqual(authored);
  });

  it.each(["wash-brush", "mypaint-cc0--watercolor-expressive", "pen"])(
    "leaves %s authoring controls unchanged",
    (id) => {
      const preset = BRUSH_PRESETS.find((brush) => brush.id === id)!;
      const selected = studioCoreBrushCatalogSelection(preset);
      const next = studioBrushCatalogSelectionSnapshot(current, selected, {
        brushId: id, strokeWidth: preset.defaultWidth, brushOpacity: preset.defaultOpacity, color: current.color,
      });
      const expected = id === "pen" ? null : stock;
      expect(next.stampTuning).toEqual(expected);
      expect(createStudioBuiltInBrushDefaultRestoreProfile(selected).values.stampTuning).toEqual(expected);
    },
  );

  it("keeps serialized custom tuning and honors the existing committed stroke's stamp receipt", () => {
    const savedSnapshot = sanitizeBrushSnapshot(JSON.parse(JSON.stringify({
      ...current, brushId: fringe.id,
    }))).snapshot;
    expect(savedSnapshot.stampTuning).toEqual(custom);
    const readStyle = (stamp: typeof stock) => {
      const receipt = JSON.parse(JSON.stringify({ brush: fringe.id, stamp, strokeWidth: 34, opacity: 0.55 }));
      return resolveStudioStampBrushStyle("watercolor", {
        color: current.color, size: receipt.strokeWidth, opacity: receipt.opacity,
      }, receipt.stamp, receipt.brush);
    };
    expect(readStyle(stock)).toMatchObject({ flow: stock.flow, hardness: stock.hardness, minSizeRatio: stock.minSize });
    expect(readStyle(custom)).toMatchObject({ flow: custom.flow, hardness: custom.hardness, minSizeRatio: custom.minSize });
    expect(readStyle(authored)).toMatchObject({ flow: authored.flow, hardness: authored.hardness, minSizeRatio: authored.minSize });
  });
});
