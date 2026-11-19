import { describe, expect, it } from "vitest";

import {
  SCENE_FX_PRESETS,
  createDefaultSceneFxConfig,
  renderSceneDirectionFx,
} from "./scene-direction-fx";

describe("scene-direction-fx", () => {
  it("12종의 웹툰 특수효과 프리셋을 모두 결정적으로 렌더링한다", () => {
    expect(SCENE_FX_PRESETS.length).toBe(12);
    for (const preset of SCENE_FX_PRESETS) {
      const cfg = createDefaultSceneFxConfig(preset.id, 800, 1280);
      const first = renderSceneDirectionFx(cfg);
      const second = renderSceneDirectionFx(cfg);

      expect(first.svgMarkup).toBe(second.svgMarkup);
      expect(first.svgMarkup).toContain(`data-fx-preset="${preset.id}"`);
      expect(first.elementCount).toBeGreaterThan(0);
      expect(first.scrollKeyframes.length).toBeGreaterThanOrEqual(2);
      expect(first.layerMetadata.layerName).toContain("[FX]");
    }
  });

  it("잘못된 색상과 범위를 벗어난 수치를 안전하게 정규화한다", () => {
    const cfg = {
      ...createDefaultSceneFxConfig("chromatic-glitch-split", 20, 99999),
      primaryColor: "not-a-color",
      intensity: 200,
      density: -5,
      opacity: 3,
    };
    const artifact = renderSceneDirectionFx(cfg);
    expect(artifact.opacity).toBe(1);
    expect(artifact.svgMarkup).toContain('width="64"');
    expect(artifact.svgMarkup).toContain('height="16384"');
    expect(artifact.svgMarkup).not.toContain("not-a-color");
  });
});
