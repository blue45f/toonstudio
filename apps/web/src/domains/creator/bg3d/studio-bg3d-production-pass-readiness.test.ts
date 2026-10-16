import { describe, expect, it } from "vitest";

import {
  detectStudioBg3dProductionBatchPresetForLook,
  evaluateStudioBg3dProductionPassReadiness,
  resolveStudioBg3dProductionBatchPresetForLook,
  summarizeStudioBg3dProductionLook,
  type StudioBg3dProductionLookState,
} from "./studio-bg3d-production-pass-readiness";
import { renderStudioBg3dLtLayers } from "./studio-bg3d-lt-render";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

const AVAILABLE = [
  "beauty",
  "lt-composite",
  "color",
  "tone",
  "texture-line",
  "main-line",
  "depth",
  "normal",
] as const;

const COLOR_LOOK: StudioBg3dProductionLookState = Object.freeze({
  lineEnabled: true,
  lineStrength: 0.8,
  textureLineEnabled: true,
  textureLineStrength: 0.5,
  toneMode: "flat",
  toneType: "color",
  toneOpacity: 1,
});

const SCREEN_TONE_LOOK: StudioBg3dProductionLookState = Object.freeze({
  ...COLOR_LOOK,
  toneMode: "screentone",
  toneType: "pattern",
});

describe("Studio BG3D production pass readiness", () => {
  it("keeps color and non-color tone mutually exclusive in manuscript presets", () => {
    expect(resolveStudioBg3dProductionBatchPresetForLook(
      AVAILABLE,
      "manuscript",
      COLOR_LOOK,
    )).toEqual(["lt-composite", "color", "texture-line", "main-line"]);

    expect(resolveStudioBg3dProductionBatchPresetForLook(
      AVAILABLE,
      "manuscript",
      SCREEN_TONE_LOOK,
    )).toEqual(["lt-composite", "tone", "texture-line", "main-line"]);
  });

  it("explains every selected pass that the active LT look cannot generate", () => {
    const readiness = evaluateStudioBg3dProductionPassReadiness(
      ["beauty", "main-line", "texture-line", "color", "tone"],
      {
        ...COLOR_LOOK,
        lineEnabled: false,
        toneMode: "none",
      },
    );

    expect(readiness.readyPasses).toEqual(["beauty"]);
    expect(readiness.issues.map((issue) => issue.pass)).toEqual([
      "main-line",
      "texture-line",
      "color",
      "tone",
    ]);
    expect(readiness.blockingReason).toContain("4개 선택 패스");
  });

  it("never flags the renderer-proven beauty and depth passes as LT-dependent", () => {
    const readiness = evaluateStudioBg3dProductionPassReadiness(
      ["beauty", "depth"],
      {
        ...COLOR_LOOK,
        lineEnabled: false,
        toneMode: "none",
      },
    );

    expect(readiness.readyPasses).toEqual(["beauty", "depth"]);
    expect(readiness.issues).toEqual([]);
    expect(readiness.blockingReason).toBeNull();
  });

  it("never flags the promoted normal pass as LT-dependent", () => {
    const readiness = evaluateStudioBg3dProductionPassReadiness(
      ["normal"],
      {
        ...COLOR_LOOK,
        lineEnabled: false,
        toneMode: "none",
      },
    );

    expect(readiness.readyPasses).toEqual(["normal"]);
    expect(readiness.issues).toEqual([]);
    expect(readiness.blockingReason).toBeNull();
  });

  it("detects purpose presets against the actual configured LT pass set", () => {
    expect(detectStudioBg3dProductionBatchPresetForLook(
      AVAILABLE,
      ["lt-composite", "color", "texture-line", "main-line"],
      COLOR_LOOK,
    )).toBe("manuscript");

    expect(detectStudioBg3dProductionBatchPresetForLook(
      AVAILABLE,
      ["lt-composite", "color", "tone", "texture-line", "main-line"],
      COLOR_LOOK,
    )).toBe("custom");
  });
});

describe("Studio BG3D production pass readiness: interior suppression", () => {
  function look(line: Record<string, unknown>) {
    const output = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output;
    return summarizeStudioBg3dProductionLook({
      ...output,
      line: { ...output.line, textureLineEnabled: true, textureLineStrength: 0.5, ...line },
    });
  }

  it("marks the texture line as erased only when suppression is on at 100%", () => {
    expect(look({}).textureLineSuppressed).toBeUndefined();
    expect(look({ interiorSuppressionEnabled: true }).textureLineSuppressed).toBeUndefined(); // 기본 강도 0.6
    expect(look({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.99 }).textureLineSuppressed)
      .toBeUndefined();
    expect(look({ interiorSuppressionEnabled: false, interiorSuppressionStrength: 1 }).textureLineSuppressed)
      .toBeUndefined();
    expect(look({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 }).textureLineSuppressed).toBe(true);
  });

  it("warns before the run that the texture-line pass will be empty, and keeps the other passes ready", () => {
    const suppressed = look({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 });
    const readiness = evaluateStudioBg3dProductionPassReadiness(["main-line", "texture-line", "lt-composite"], suppressed);
    expect(readiness.readyPasses).toEqual(["main-line", "lt-composite"]);
    expect(readiness.issues).toHaveLength(1);
    expect(readiness.issues[0]!.pass).toBe("texture-line");
    expect(readiness.issues[0]!.reason).toContain("내부선 억제");
    expect(readiness.issues[0]!.reason).toContain("100%");
    expect(readiness.blockingReason).toContain("1개 선택 패스");

    // 질감선 자체를 꺼 둔 경우에는 예전 사유 그대로다.
    const textureOff = look({
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 1,
      textureLineEnabled: false,
    });
    expect(evaluateStudioBg3dProductionPassReadiness(["texture-line"], textureOff).issues[0]!.reason)
      .toContain("질감선 강도가 0");
  });

  it("drops texture-line from the manuscript preset while suppression erases it", () => {
    const suppressed = look({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 });
    const colorLook = { ...suppressed, toneMode: "flat", toneType: "color", toneOpacity: 1 } as const;
    expect(resolveStudioBg3dProductionBatchPresetForLook(AVAILABLE, "manuscript", colorLook)).toEqual([
      "lt-composite",
      "color",
      "main-line",
    ]);
  });

  it("agrees with the renderer: the texture-line layer is really absent exactly when the look says so", () => {
    // 휘도 대비가 낮은 점이 있는 작은 장면: 억제가 없으면 질감선 레이어가 나온다.
    const width = 21;
    const height = 21;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      const dot = index === 6 * width + 6 || index === 12 * width + 14;
      rgba.set(dot ? [142, 142, 142, 255] : [128, 128, 128, 255], index * 4);
    }
    const render = (line: Record<string, unknown>) =>
      renderStudioBg3dLtLayers(
        { width, height, rgba },
        {
          line: {
            ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
            strength: 1,
            textureLineEnabled: true,
            textureLineStrength: 1,
            creaseAngleDegrees: 0,
            ...line,
          },
          tone: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone, mode: "none", type: "grayscale" },
        } as never,
      ).layers.some((layer) => layer.role === "texture-line");
    expect(render({})).toBe(true);
    expect(render({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.99 })).toBe(true);
    expect(render({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 })).toBe(false);
  });
});
