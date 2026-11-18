/**
 * 클립스튜디오 페인트 5.1.5 색 섞기(Blend) 확장: 흐리기·선명화 브러시 라우터 및 타 레이어 참조(`BrushUseReferLayer`) 합성기.
 *
 * 역공학 행동 기준 근거 (REA MCP 정적 분석):
 * - `EditImageTool.todb` (`ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`):
 *   `Blend > Blend (var=19), Blur (var=111), Finger tip (var=113), Painterly blender (var=649),
 *   Wet bleed blender (var=124), Textured blender (var=581)`, `BrushBlur*`, `BrushUseReferLayer`.
 *
 * 기존 `studio-editing-brush-kernels.ts`의 결정론적 픽셀 커널(`applyStudioBlurBrush`, `applyStudioSharpenBrush`)을
 * 스튜디오 색 섞기 표면과 직결하고, 여러 표시 레이어의 색을 읽어 현재 활성 레이어에만 결과를 기록하는
 * 비파괴 참조 합성(`BrushUseReferLayer`)을 제공한다.
 */

import {
  applyStudioBlurBrush,
  applyStudioSharpenBrush,
  type StudioEditingBrushMask,
  type StudioEditingBrushRgbaImage,
} from "../studio-editing-brush-kernels";

export type StudioBlendBrushSubMode = "smudge" | "blur" | "sharpen";

export interface StudioBlendReferLayerOptions {
  readonly subMode: StudioBlendBrushSubMode;
  readonly referVisibleLayers: boolean;
  readonly excludeDraftLayers: boolean;
  readonly excludeTextLayers: boolean;
}

export interface StudioBlendLayerSource {
  readonly id: string;
  readonly visible: boolean;
  readonly isDraft?: boolean;
  readonly isText?: boolean;
  readonly opacity?: number;
  readonly image: StudioEditingBrushRgbaImage;
}

export const DEFAULT_STUDIO_BLEND_REFER_OPTIONS: StudioBlendReferLayerOptions = Object.freeze({
  subMode: "smudge",
  referVisibleLayers: false,
  excludeDraftLayers: true,
  excludeTextLayers: true,
});

export function normalizeStudioBlendReferOptions(
  input?: Partial<StudioBlendReferLayerOptions> | null,
): StudioBlendReferLayerOptions {
  if (!input) return DEFAULT_STUDIO_BLEND_REFER_OPTIONS;
  const subModes: readonly StudioBlendBrushSubMode[] = ["smudge", "blur", "sharpen"];
  return {
    subMode: subModes.includes(input.subMode as StudioBlendBrushSubMode)
      ? (input.subMode as StudioBlendBrushSubMode)
      : "smudge",
    referVisibleLayers: Boolean(input.referVisibleLayers),
    excludeDraftLayers: input.excludeDraftLayers ?? true,
    excludeTextLayers: input.excludeTextLayers ?? true,
  };
}

/**
 * 아래에서 위로 정렬된 표시 레이어들을 Porter-Duff `source-over`로 합성해
 * 색 섞기/흐리기 브러시가 참조할 단일 읽기 전용 샘플 버퍼를 생성한다.
 */
export function composeBlendReferLayerSample(
  targetImage: StudioEditingBrushRgbaImage,
  layerStackBottomToTop: readonly StudioBlendLayerSource[],
  rawOptions?: Partial<StudioBlendReferLayerOptions> | null,
): StudioEditingBrushRgbaImage {
  const options = normalizeStudioBlendReferOptions(rawOptions);
  if (!options.referVisibleLayers || layerStackBottomToTop.length === 0) {
    return targetImage;
  }

  const { width, height } = targetImage;
  const out = new Uint8ClampedArray(width * height * 4);

  for (const layer of layerStackBottomToTop) {
    if (!layer.visible) continue;
    if (options.excludeDraftLayers && layer.isDraft) continue;
    if (options.excludeTextLayers && layer.isText) continue;
    if (layer.image.width !== width || layer.image.height !== height) continue;

    const layerOpacity = Math.min(1, Math.max(0, layer.opacity ?? 1));
    if (layerOpacity <= 0) continue;

    const src = layer.image.data;
    for (let i = 0; i < out.length; i += 4) {
      const sa = (src[i + 3]! / 255) * layerOpacity;
      if (sa <= 0) continue;
      const da = out[i + 3]! / 255;
      const outA = sa + da * (1 - sa);
      if (outA <= 1e-6) continue;
      out[i] = Math.round((src[i]! * sa + out[i]! * da * (1 - sa)) / outA);
      out[i + 1] = Math.round((src[i + 1]! * sa + out[i + 1]! * da * (1 - sa)) / outA);
      out[i + 2] = Math.round((src[i + 2]! * sa + out[i + 2]! * da * (1 - sa)) / outA);
      out[i + 3] = Math.round(outA * 255);
    }
  }

  return { width, height, data: out };
}

/**
 * 흐리기(`blur`) 또는 선명화(`sharpen`) 브러시 커널을 참조 샘플 위에서 계산한 뒤,
 * 브러시 마스크 영역의 결과만 대상(`targetLayer`) 버퍼에 반영하고 원본 참조 레이어는 절대 변경하지 않는다.
 */
export function applyStudioBlendKernelWithReferLayers(input: Readonly<{
  targetLayer: StudioEditingBrushRgbaImage;
  brushMask: StudioEditingBrushMask;
  layerStackBottomToTop?: readonly StudioBlendLayerSource[];
  mode: "blur" | "sharpen";
  radiusPx: number;
  strengthNormalized: number;
}>): StudioEditingBrushRgbaImage {
  const referSample = composeBlendReferLayerSample(
    input.targetLayer,
    input.layerStackBottomToTop ?? [],
    {
      subMode: input.mode,
      referVisibleLayers: (input.layerStackBottomToTop?.length ?? 0) > 0,
    },
  );

  // 커널이 알파가 0인 빈 타겟 픽셀에서도 참조 색을 받아올 수 있도록 합성 알파가 있는 샘플에 대해 실행한다.
  const radius = Math.max(1, Math.min(32, Math.round(input.radiusPx)));
  const flow = Math.min(1, Math.max(0.05, input.strengthNormalized));
  const kernelResult =
    input.mode === "blur"
      ? applyStudioBlurBrush({
          source: referSample,
          brushMask: input.brushMask,
          flow,
          options: { radius },
        })
      : applyStudioSharpenBrush({
          source: referSample,
          brushMask: input.brushMask,
          flow,
          options: { radius: Math.min(8, radius), amount: flow * 2 },
        });

  if (kernelResult.status !== "applied") {
    return input.targetLayer;
  }

  const out = new Uint8ClampedArray(input.targetLayer.data);
  const filtered = kernelResult.image.data;
  const mask = input.brushMask.data;
  const pixelCount = input.targetLayer.width * input.targetLayer.height;

  for (let p = 0; p < pixelCount; p += 1) {
    const m = (mask[p]! / 255) * flow;
    if (m <= 0) continue;
    const idx = p * 4;
    const fa = filtered[idx + 3]! / 255;
    if (fa <= 0) continue;
    const ta = out[idx + 3]! / 255;
    const nextA = ta + fa * m * (1 - ta);
    if (nextA <= 1e-6) continue;
    out[idx] = Math.round((filtered[idx]! * m + out[idx]! * (1 - m)));
    out[idx + 1] = Math.round((filtered[idx + 1]! * m + out[idx + 1]! * (1 - m)));
    out[idx + 2] = Math.round((filtered[idx + 2]! * m + out[idx + 2]! * (1 - m)));
    out[idx + 3] = Math.round(Math.max(out[idx + 3]!, nextA * 255));
  }

  return {
    width: input.targetLayer.width,
    height: input.targetLayer.height,
    data: out,
  };
}
