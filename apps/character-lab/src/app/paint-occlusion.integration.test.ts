import { describe, expect, it } from "vitest";

import { createDefaultRecipe } from "../contracts";
import { exportRecipe } from "../export/export-session";
import { extractPaintLayers, parseRecipeFile } from "../export/recipe-file";
import { createPointerPaintDriver } from "../paint/paint-bridge";
import { createPaintSession } from "../paint/paint-session";
import { createNullEngineHarness } from "../render/testing/null-engine-harness";
import { createProceduralFixture } from "../render/testing/procedural-fixture";

import type { PaintUndoToken } from "../contracts";

describe("의상 가림 → 페인트 → 엔진 텍스처·레시피", () => {
  it("실제 의상 뒤 신체 중심을 ON에서는 차단하고 OFF에서만 칠하며 업로드·내보내기·undo가 같은 바이트를 쓴다", async () => {
    const harness = await createNullEngineHarness({ size: 128 });
    try {
      await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
      const chest = harness.engine.jointHandles().find((handle) => handle.bone === "chest");
      if (!chest) throw new Error("가슴 핸들 없음");
      const camera = harness.engine.viewportCamera();
      const ndc = { ndcX: chest.screen[0] / camera.width * 2 - 1, ndcY: 1 - chest.screen[1] / camera.height * 2, pressure: 1 };
      expect(harness.engine.pick(ndc.ndcX, ndc.ndcY)?.role).toBe("top");
      const session = createPaintSession({ layerSize: 32, activePart: "skin", brush: { radiusPx: 3, color: "#ff0000", hardness: 1, opacity: 1 } });
      const commits: PaintUndoToken[] = [];
      const driver = createPointerPaintDriver(session, { pick: (x, y, options) => harness.engine.pick(x, y, options), upload: (layer) => harness.engine.updatePaintTexture(layer), commit: (token) => commits.push(token) });
      expect(driver.down(ndc)).toBe(false);
      expect(driver.up()).toBeNull();
      expect(session.layersForExport()).toEqual([]);
      session.setBodyLineMaskEnabled(false);
      expect(driver.down(ndc)).toBe(true);
      const token = driver.up();
      if (!token) throw new Error("페인트 토큰 없음");
      expect(commits).toHaveLength(1);
      const layer = session.layer("skin");
      expect(layer.rgba.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
      expect(harness.engine.inspectPaint()).toEqual([expect.objectContaining({ part: "skin", revision: layer.revision, decalEnabled: true, decalMeshes: 1 })]);
      const output = await exportRecipe(createDefaultRecipe(), session.layersForExport(), { now: () => 1 });
      if (!output.ok) throw new Error(output.failure.reasonKo);
      const parsed = parseRecipeFile(new TextDecoder().decode(output.bytes), 1);
      if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
      const restored = await extractPaintLayers(parsed.recipe, 1);
      expect(restored.failures).toEqual([]);
      expect(restored.layers[0]?.rgba).toEqual(layer.rgba);
      session.applyToken(token);
      harness.engine.updatePaintTexture(layer);
      expect(layer.rgba.every((value) => value === 0)).toBe(true);
      expect(harness.engine.inspectPaint()[0]?.revision).toBe(layer.revision);
      session.setBodyLineMaskEnabled(true);
      expect(driver.down(ndc)).toBe(false);
      expect(driver.up()).toBeNull();
      expect(commits).toHaveLength(1);
    } finally {
      harness.dispose();
    }
  });
});
