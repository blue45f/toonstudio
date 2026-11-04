import type { StudioBg3dLtRasterInput, StudioBg3dLtRasterLayer } from "./studio-bg3d-lt-render";
import type { StudioBg3dSixPassLtSettings } from "./studio-bg3d-scene-document-types";
import { parseStudioBg3dSixPassLtSettings } from "../contracts/studio-bg3d-six-pass-settings";
import { buildSketchUpWebtoonSixPassLtRecipe } from "./studio-bg3d-six-pass-lt-recipe";

export function isStudioBg3dSixPassLtSettings(value: unknown): value is StudioBg3dSixPassLtSettings {
  return parseStudioBg3dSixPassLtSettings(value) !== null;
}

export function assertStudioBg3dSixPassLtInput(input: StudioBg3dLtRasterInput, settings: StudioBg3dSixPassLtSettings): void {
  if (!isStudioBg3dSixPassLtSettings(settings)) throw new RangeError("6패스 LT 설정을 확인하지 못했습니다.");
  const pixels = input.width * input.height;
  for (const data of [input.flatColorRgba, input.shadowRgba]) {
    if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== pixels * 4) {
      throw new RangeError("6패스 LT에는 실제 밑색·그림자 캡처가 필요합니다.");
    }
  }
  if (!(input.linearDepth instanceof Float32Array) || input.linearDepth.length !== pixels
    || typeof input.linearDepthNearMeters !== "number" || !Number.isFinite(input.linearDepthNearMeters) || input.linearDepthNearMeters < 0
    || typeof input.linearDepthFarMeters !== "number" || !Number.isFinite(input.linearDepthFarMeters) || input.linearDepthFarMeters <= input.linearDepthNearMeters) {
    throw new RangeError("6패스 LT에는 선형 깊이와 카메라 near/far가 필요합니다.");
  }
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const value = input.linearDepth[pixel];
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("6패스 선형 깊이는 0..1이어야 합니다.");
  }
}

/** 실제 albedo·shadow coverage·선형 깊이로 출력하며 빈 선도 동일한 6레이어 구조를 유지한다. */
export function assembleStudioBg3dSixPassLtLayers(
  input: StudioBg3dLtRasterInput,
  settings: StudioBg3dSixPassLtSettings,
  generated: {
    readonly toneLayer: StudioBg3dLtRasterLayer | null;
    readonly textureLayer: StudioBg3dLtRasterLayer | null;
    readonly mainLayer: StudioBg3dLtRasterLayer | null;
  },
): readonly StudioBg3dLtRasterLayer[] {
  assertStudioBg3dSixPassLtInput(input, settings);
  const { flatColorRgba, shadowRgba, linearDepth, linearDepthNearMeters: near, linearDepthFarMeters: far } = input;
  if (!flatColorRgba || !shadowRgba || !linearDepth || near === undefined || far === undefined) throw new Error("6패스 캡처가 없습니다.");
  const color = new Uint8ClampedArray(flatColorRgba);
  const shadow = new Uint8ClampedArray(color.length);
  const depth = new Uint8ClampedArray(color.length);
  const tint = [1, 3, 5].map((offset) => Number.parseInt(settings.fogTintHex.slice(offset, offset + 2), 16));
  for (let pixel = 0; pixel < input.width * input.height; pixel += 1) {
    const offset = pixel * 4;
    const sourceAlpha = color[offset + 3];
    if (sourceAlpha === 0) {
      color.fill(0, offset, offset + 4);
      continue;
    }
    shadow[offset + 3] = Math.round(shadowRgba[offset + 3] * sourceAlpha / 255);
    const distance = near + linearDepth[pixel] * (far - near);
    const fog = Math.max(0, Math.min(1, (distance - settings.fogNearMeters) / (settings.fogFarMeters - settings.fogNearMeters)));
    depth[offset] = tint[0];
    depth[offset + 1] = tint[1];
    depth[offset + 2] = tint[2];
    depth[offset + 3] = Math.round(fog * sourceAlpha);
  }
  const dataByRole = {
    color, shadow, depth,
    tone: generated.toneLayer?.data ?? new Uint8ClampedArray(color.length),
    "texture-line": generated.textureLayer?.data ?? new Uint8ClampedArray(color.length),
    "main-line": generated.mainLayer?.data ?? new Uint8ClampedArray(color.length),
  };
  return buildSketchUpWebtoonSixPassLtRecipe().map((recipe) => ({
    role: recipe.role,
    width: input.width,
    height: input.height,
    data: dataByRole[recipe.role],
    blendMode: recipe.blendMode,
    opacity: recipe.role === "shadow" ? settings.shadowOpacity : recipe.role === "depth" ? settings.depthFogOpacity : recipe.opacity,
    visible: recipe.visibleByDefault,
  }));
}
