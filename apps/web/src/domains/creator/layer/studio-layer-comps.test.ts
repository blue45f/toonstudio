import { describe, expect, it } from "vitest";

import {
  applyLayerComp,
  captureLayerComp,
  planLayerCompsBatchExport,
  updateLayerCompWithCurrentLayers,
  type StudioLayerLikeItem,
} from "./studio-layer-comps";

describe("studio-layer-comps", () => {
  const sampleLayers: readonly StudioLayerLikeItem[] = [
    { id: "layer-line", visible: true, opacity: 1.0 },
    { id: "layer-color", visible: true, opacity: 0.9 },
    { id: "layer-bubbles", visible: true, opacity: 1.0 },
  ];

  describe("Capture and Apply Layer Comps", () => {
    it("captures current layer states into a comp", () => {
      const comp = captureLayerComp("완성본", sampleLayers, "comp-full");
      expect(comp.id).toBe("comp-full");
      expect(comp.name).toBe("완성본");
      expect(comp.layerStates["layer-line"].visible).toBe(true);
      expect(comp.layerStates["layer-color"].visible).toBe(true);
      expect(comp.layerStates["layer-bubbles"].visible).toBe(true);
    });

    it("applies a saved comp to switch layer visibility states", () => {
      // Create a "clean no bubbles" comp where layer-bubbles is hidden
      const cleanLayers = sampleLayers.map((l) =>
        l.id === "layer-bubbles" ? { ...l, visible: false } : l,
      );
      const cleanComp = captureLayerComp("대사 제거본", cleanLayers, "comp-clean");

      // Current layers have bubbles visible
      const applied = applyLayerComp(sampleLayers, cleanComp);
      expect(applied.find((l) => l.id === "layer-line")?.visible).toBe(true);
      expect(applied.find((l) => l.id === "layer-color")?.visible).toBe(true);
      expect(applied.find((l) => l.id === "layer-bubbles")?.visible).toBe(false); // Hidden!
    });

    it("updates an existing comp with current layer changes", () => {
      const comp = captureLayerComp("초기 콤프", sampleLayers);
      const modifiedLayers = sampleLayers.map((l) => ({ ...l, opacity: 0.5 }));

      const updatedComp = updateLayerCompWithCurrentLayers(comp, modifiedLayers);
      expect(updatedComp.layerStates["layer-line"].opacity).toBe(0.5);
    });
  });

  describe("Blend Mode Restore (regression)", () => {
    it("removes blendMode when the captured state had none", () => {
      const comp = captureLayerComp("블렌드 없음", sampleLayers, "comp-plain");
      const current = sampleLayers.map((l) =>
        l.id === "layer-line" ? { ...l, blendMode: "multiply" } : l,
      );
      const applied = applyLayerComp(current, comp);
      const line = applied.find((l) => l.id === "layer-line");
      expect(line).toBeDefined();
      expect(Object.hasOwn(line!, "blendMode")).toBe(false);
    });

    it("restores blendMode when the captured state had one", () => {
      const blended = sampleLayers.map((l) =>
        l.id === "layer-line" ? { ...l, blendMode: "overlay" } : l,
      );
      const comp = captureLayerComp("블렌드 있음", blended, "comp-blended");
      const applied = applyLayerComp(sampleLayers, comp);
      expect(applied.find((l) => l.id === "layer-line")?.blendMode).toBe("overlay");
    });
  });

  describe("Batch Export Planning", () => {
    it("generates structured file export list for all comps", () => {
      const comp1 = captureLayerComp("선화_초안", sampleLayers);
      const comp2 = captureLayerComp("완성본", sampleLayers);

      const plan = planLayerCompsBatchExport([comp1, comp2], "episode_01", "png");
      expect(plan).toHaveLength(2);
      expect(plan[0].fileName).toBe("episode_01_선화_초안.png");
      expect(plan[1].fileName).toBe("episode_01_완성본.png");
    });

    it("separates file names that collide after sanitizing (regression)", () => {
      // "야간 버전" / "야간/버전" / "야간:버전" all sanitize to "야간_버전".
      const comps = [
        captureLayerComp("야간 버전", sampleLayers),
        captureLayerComp("야간/버전", sampleLayers),
        captureLayerComp("야간:버전", sampleLayers),
      ];
      const plan = planLayerCompsBatchExport(comps, "ep", "png");
      const names = plan.map((p) => p.fileName);
      expect(new Set(names).size).toBe(3);
      expect(names[0]).toBe("ep_야간_버전.png");
      expect(names[1]).toBe("ep_야간_버전-2.png");
      expect(names[2]).toBe("ep_야간_버전-3.png");
    });

    it("treats case-only differences as collisions (regression)", () => {
      const comps = [
        captureLayerComp("Night", sampleLayers),
        captureLayerComp("night", sampleLayers),
      ];
      const plan = planLayerCompsBatchExport(comps, "ep", "png");
      expect(plan[0].fileName).toBe("ep_Night.png");
      expect(plan[1].fileName).toBe("ep_night-2.png");
    });
  });
});
