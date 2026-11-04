import { describe, expect, it } from "vitest";

import { renderStudioBg3dLtLayers, type StudioBg3dLtRasterInput } from "./studio-bg3d-lt-render";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT } from "../contracts/studio-bg3d-six-pass-settings";

function settings() {
  return {
    line: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line, enabled: false },
    tone: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone, type: "color" as const },
    sixPassLt: { ...DEFAULT_STUDIO_BG3D_SIX_PASS_LT, fogNearMeters: 3, fogFarMeters: 7 },
  };
}

function capture(): StudioBg3dLtRasterInput {
  return {
    width: 3, height: 1,
    rgba: Uint8Array.of(10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255),
    flatColorRgba: Uint8Array.of(200, 30, 20, 255, 20, 200, 30, 255, 30, 20, 200, 255),
    shadowRgba: Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 255),
    linearDepth: Float32Array.of(0, 0.5, 1),
    linearDepthNearMeters: 1, linearDepthFarMeters: 9,
  };
}

describe("실제 캡처를 사용하는 웹툰 6패스 LT", () => {
  it("밑색과 톤을 함께 만들고 실제 그림자·미터 깊이로 별도 레이어를 만든다", () => {
    const input = capture();
    const before = structuredClone(input);
    const result = renderStudioBg3dLtLayers(input, settings());
    expect(result.sixPassLtVersion).toBe(1);
    expect(result.layers.map((layer) => layer.role)).toEqual(["color", "tone", "shadow", "depth", "texture-line", "main-line"]);
    expect(Array.from(result.layers[0].data)).toEqual(Array.from(input.flatColorRgba ?? []));
    expect(result.layers[0].data).not.toBe(input.flatColorRgba);
    expect(result.layers[1].data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    expect(Array.from(result.layers[2].data)).toEqual(Array.from(input.shadowRgba ?? []));
    expect(result.layers[3].data.filter((_value, index) => index % 4 === 3)).toEqual(Uint8ClampedArray.of(0, 128, 255));
    expect(result.layers[3].data.slice(4, 7)).toEqual(Uint8ClampedArray.of(254, 215, 170));
    expect(result.layers.map((layer) => [layer.blendMode, layer.opacity, layer.visible])).toEqual([
      ["normal", 1, true], ["multiply", 0.85, true], ["multiply", 0.68, true],
      ["screen", 0.32, true], ["normal", 0.78, true], ["normal", 1, true],
    ]);
    expect(input).toEqual(before);
  });

  it("완전히 투명하거나 선이 없는 캡처도 여섯 개의 편집 가능한 패스를 유지한다", () => {
    const input = capture();
    const result = renderStudioBg3dLtLayers({
      ...input, rgba: new Uint8Array(12), flatColorRgba: new Uint8Array(12),
    }, settings());
    expect(result.layers).toHaveLength(6);
    expect(result.layers.every((layer) => layer.data.every((value) => value === 0))).toBe(true);
  });

  it("그림자와 공기원근 불투명도 0을 레이어 설정으로 보존한다", () => {
    const config = settings();
    const result = renderStudioBg3dLtLayers(capture(), { ...config, sixPassLt: { ...config.sixPassLt, shadowOpacity: 0, depthFogOpacity: 0 } });
    expect(result.layers[2].opacity).toBe(0);
    expect(result.layers[3].opacity).toBe(0);
  });

  it.each(["flatColorRgba", "shadowRgba", "linearDepth", "linearDepthNearMeters", "linearDepthFarMeters"] as const)("실제 %s 캡처가 없으면 beauty 이미지로 대체하지 않는다", (field) => {
    const input = { ...capture(), [field]: undefined };
    expect(() => renderStudioBg3dLtLayers(input, settings())).toThrow(/6패스/u);
  });

  it.each([Number.NaN, -0.01, 1.01])("잘못된 선형 깊이 %s를 거부한다", (sample) => {
    expect(() => renderStudioBg3dLtLayers({ ...capture(), linearDepth: Float32Array.of(0, sample, 1) }, settings())).toThrow(/깊이/u);
  });

  it("일반 LT는 기존 색/톤 선택과 최대 세 레이어를 유지한다", () => {
    const config = settings();
    const input = capture();
    const result = renderStudioBg3dLtLayers({ width: input.width, height: input.height, rgba: input.rgba }, { line: config.line, tone: config.tone });
    expect(result.sixPassLtVersion).toBeUndefined();
    expect(result.layers.map((layer) => layer.role)).toEqual(["color"]);
  });
});
