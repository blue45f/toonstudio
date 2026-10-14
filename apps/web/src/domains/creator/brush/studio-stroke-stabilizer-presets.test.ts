import { describe, expect, it } from "vitest";

import { STABILIZER_MAX } from "../studio-brush";
import {
  createStudioStrokeStabilizerState,
  isStudioStabilizerMode,
  stabilizeStudioStrokeSample,
} from "./studio-stroke-stabilizer";
import {
  findActiveStudioStabilizerPreset,
  isStudioStabilizerPresetId,
  normalizeStudioStabilizerPresetId,
  resolveStudioStabilizerOptionsForState,
  resolveStudioStabilizerPreset,
  resolveStudioStabilizerPresetOptions,
  STUDIO_STABILIZER_PRESETS,
} from "./studio-stroke-stabilizer-presets";

describe("studio stroke stabilizer presets", () => {
  it("ships the six purpose presets with checklist labels", () => {
    expect(STUDIO_STABILIZER_PRESETS.map((preset) => preset.label)).toEqual([
      "은은하게",
      "긴 선화",
      "큰 획",
      "무게 추",
      "느릴 때만",
      "펜 정밀",
    ]);
    expect(STUDIO_STABILIZER_PRESETS.map((preset) => preset.id)).toEqual([
      "subtle",
      "pulled-string",
      "massive",
      "weighted",
      "speed-smooth",
      "precision-ink",
    ]);
  });

  it("keeps every preset inside the engine strength scale and a valid mode", () => {
    for (const preset of STUDIO_STABILIZER_PRESETS) {
      expect(preset.strength).toBeGreaterThan(0);
      expect(preset.strength).toBeLessThanOrEqual(STABILIZER_MAX);
      expect(isStudioStabilizerMode(preset.mode)).toBe(true);
    }
    // Preset identity is the (mode, strength) pair, so pairs must be unique.
    const pairs = STUDIO_STABILIZER_PRESETS.map((preset) => `${preset.mode}:${preset.strength}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("normalizes preset ids without accepting arbitrary persisted values", () => {
    expect(isStudioStabilizerPresetId("weighted")).toBe(true);
    expect(isStudioStabilizerPresetId("heavy")).toBe(false);
    expect(normalizeStudioStabilizerPresetId("speed-smooth")).toBe("speed-smooth");
    expect(normalizeStudioStabilizerPresetId("bogus")).toBe("subtle");
    expect(resolveStudioStabilizerPreset("massive").strength).toBe(9);
  });

  it("resolves preset options, attaching the speed gate only to speed-smooth", () => {
    const speedSmooth = resolveStudioStabilizerPresetOptions(
      resolveStudioStabilizerPreset("speed-smooth"),
      2
    );
    expect(speedSmooth).toEqual({
      mode: "adaptive",
      strength: 5.5,
      coordinateScale: 2,
      speedGate: { minSpeed: 0, maxSpeed: 0.6 },
    });

    const weighted = resolveStudioStabilizerPresetOptions(
      resolveStudioStabilizerPreset("weighted")
    );
    expect(weighted.mode).toBe("weighted");
    expect(weighted).not.toHaveProperty("speedGate");
  });

  it("finds the active preset from persisted (mode, strength) state only", () => {
    expect(findActiveStudioStabilizerPreset("adaptive", 5.5)?.id).toBe("speed-smooth");
    expect(findActiveStudioStabilizerPreset("weighted", 6)?.id).toBe("weighted");
    expect(findActiveStudioStabilizerPreset("precision", 8.5)?.id).toBe("precision-ink");
    expect(findActiveStudioStabilizerPreset("adaptive", 3)).toBeNull();
    expect(findActiveStudioStabilizerPreset("bogus", 6)).toBeNull();
    expect(findActiveStudioStabilizerPreset("weighted", Number.NaN)).toBeNull();
  });

  it("restores the speed gate from state without extra persisted fields", () => {
    const gated = resolveStudioStabilizerOptionsForState("adaptive", 5.5, 1);
    expect(gated.speedGate).toEqual({ minSpeed: 0, maxSpeed: 0.6 });

    const manual = resolveStudioStabilizerOptionsForState("adaptive", 3, 1);
    expect(manual).not.toHaveProperty("speedGate");
    expect(manual).toMatchObject({ mode: "adaptive", strength: 3, coordinateScale: 1 });
  });

  it("changes the felt correction per preset against the same raw stroke", () => {
    const runStroke = (presetId: Parameters<typeof resolveStudioStabilizerPreset>[0]) => {
      const options = resolveStudioStabilizerPresetOptions(
        resolveStudioStabilizerPreset(presetId)
      );
      let state = createStudioStrokeStabilizerState({ x: 0, y: 0, timeStamp: 0 });
      let lagAtEnd = 0;
      for (let timeStamp = 16; timeStamp <= 160; timeStamp += 16) {
        const result = stabilizeStudioStrokeSample(
          state,
          { x: timeStamp, y: 0, timeStamp },
          options
        );
        state = result.state;
        lagAtEnd = timeStamp - result.point[0];
      }
      return lagAtEnd;
    };
    const subtleLag = runStroke("subtle");
    const massiveLag = runStroke("massive");
    expect(subtleLag).toBeGreaterThanOrEqual(0);
    expect(massiveLag).toBeGreaterThan(subtleLag);
  });

  it("runs the weighted preset through the engine with derived pressure", () => {
    const options = resolveStudioStabilizerPresetOptions(
      resolveStudioStabilizerPreset("weighted")
    );
    let state = createStudioStrokeStabilizerState({ x: 0, y: 0, timeStamp: 0 });
    let pressure = 1;
    for (let timeStamp = 16; timeStamp <= 192; timeStamp += 16) {
      const result = stabilizeStudioStrokeSample(
        state,
        { x: timeStamp * 2, y: 0, timeStamp },
        options
      );
      state = result.state;
      pressure = result.derivedPressure ?? 1;
    }
    expect(pressure).toBeLessThan(0.6);
    expect(pressure).toBeGreaterThanOrEqual(0.25);
  });
});
