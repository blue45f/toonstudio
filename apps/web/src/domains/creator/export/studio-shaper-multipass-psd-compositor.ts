/**
 * studio-shaper-multipass-psd-compositor.ts
 *
 * SHAPER (`com.StudioHORANG.SHAPER` v1.05, `Assembly-CSharp.dll`
 * SHA-256: `cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d`)
 * `ExportManager` (`0x02000026`: `RenderLayers`, `SavePSD`, `SavePNG`, `CropImage`, `SetResolusion`,
 * `layerObjects`, `onlyOutlineObjects`, `disableShadowObjects`) 및 `user_strings` (`0x70001167..0x700011d9`)
 * 역공학 분석에 기반한 8-Pass 레이어드 PSD 렌더 플랜 및 픽셀 컴포지터.
 */

export const SHAPER_EXPORT_RE_EVIDENCE = {
  assemblySha256: "cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d",
  exportManagerToken: "0x02000026",
  userStringsRange: "0x70001167..0x700011d9",
  methods: [
    "RenderLayers",
    "SavePSD",
    "SavePNG",
    "CropImage",
    "SetResolusion",
  ],
  sceneObjectLists: [
    "layerObjects",
    "onlyOutlineObjects",
    "disableShadowObjects",
  ],
} as const;

export type ShaperRenderPassId =
  | "Base"
  | "Shadow"
  | "Eyeball"
  | "OutLine"
  | "Hair Base"
  | "Hair Shadow"
  | "Hair Line"
  | "Clip";

export const SHAPER_CANONICAL_PASS_ORDER: readonly ShaperRenderPassId[] = [
  "Base",
  "Shadow",
  "Eyeball",
  "OutLine",
  "Hair Base",
  "Hair Shadow",
  "Hair Line",
  "Clip",
] as const;

export type ShaperResolutionScale = "1x" | "2x" | "4x" | "custom";

export type ShaperLayerBlendMode = "normal" | "multiply";

export type ShaperLayerObjectGroup =
  | "body-costume"
  | "eyeball"
  | "hair"
  | "silhouette-mask";

export interface CropBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShaperResolutionInput {
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly scale: ShaperResolutionScale;
  readonly customWidth?: number;
  readonly customHeight?: number;
}

export interface ShaperResolutionPlan {
  readonly scale: ShaperResolutionScale;
  readonly width: number;
  readonly height: number;
  readonly scaleFactorX: number;
  readonly scaleFactorY: number;
}

export interface ShaperPassRenderFlags {
  readonly disableShadowObjects: boolean;
  readonly onlyOutlineObjects: boolean;
  readonly layerObjectGroup: ShaperLayerObjectGroup;
}

export interface ShaperMultipassLayerDescriptor {
  readonly passId: ShaperRenderPassId;
  readonly layerName: string;
  readonly stackOrder: number;
  readonly blendMode: ShaperLayerBlendMode;
  readonly opacity: number;
  readonly visible: boolean;
  readonly isUtilityMaskPass: boolean;
  readonly clippedToPassId: "Base" | "Hair Base" | null;
  readonly clippingMaskEnabled: boolean;
  readonly renderFlags: ShaperPassRenderFlags;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface BuildShaperMultipassPsdStackInput {
  readonly width: number;
  readonly height: number;
  readonly passes: Partial<Record<ShaperRenderPassId, Uint8ClampedArray>>;
  readonly cropToContent?: boolean;
  readonly cropBounds?: CropBounds;
  readonly alphaThreshold?: number;
  readonly cropPadding?: number;
  readonly shadowBlendMode?: ShaperLayerBlendMode;
}

export interface ShaperMultipassPsdStack {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly cropBounds: CropBounds;
  readonly layers: readonly ShaperMultipassLayerDescriptor[];
  readonly clipMaskAlpha: Uint8Array;
}

interface PassSpec {
  readonly passId: ShaperRenderPassId;
  readonly stackOrder: number;
  readonly defaultBlendMode: ShaperLayerBlendMode;
  readonly visibleInComposite: boolean;
  readonly isUtilityMaskPass: boolean;
  readonly clippedToPassId: "Base" | "Hair Base" | null;
  readonly renderFlags: ShaperPassRenderFlags;
}

const PASS_SPECS: readonly PassSpec[] = [
  {
    passId: "Clip",
    stackOrder: 0,
    defaultBlendMode: "normal",
    visibleInComposite: false,
    isUtilityMaskPass: true,
    clippedToPassId: null,
    renderFlags: {
      disableShadowObjects: true,
      onlyOutlineObjects: false,
      layerObjectGroup: "silhouette-mask",
    },
  },
  {
    passId: "Base",
    stackOrder: 1,
    defaultBlendMode: "normal",
    visibleInComposite: true,
    isUtilityMaskPass: false,
    clippedToPassId: null,
    renderFlags: {
      disableShadowObjects: true,
      onlyOutlineObjects: false,
      layerObjectGroup: "body-costume",
    },
  },
  {
    passId: "Shadow",
    stackOrder: 2,
    defaultBlendMode: "multiply",
    visibleInComposite: true,
    isUtilityMaskPass: false,
    clippedToPassId: "Base",
    renderFlags: {
      disableShadowObjects: false,
      onlyOutlineObjects: false,
      layerObjectGroup: "body-costume",
    },
  },
  {
    passId: "Eyeball",
    stackOrder: 3,
    defaultBlendMode: "normal",
    visibleInComposite: true,
    isUtilityMaskPass: false,
    clippedToPassId: null,
    renderFlags: {
      disableShadowObjects: false,
      onlyOutlineObjects: false,
      layerObjectGroup: "eyeball",
    },
  },
  {
    passId: "OutLine",
    stackOrder: 4,
    defaultBlendMode: "normal",
    visibleInComposite: true,
    isUtilityMaskPass: false,
    clippedToPassId: null,
    renderFlags: {
      disableShadowObjects: true,
      onlyOutlineObjects: true,
      layerObjectGroup: "body-costume",
    },
  },
  {
    passId: "Hair Base",
    stackOrder: 5,
    defaultBlendMode: "normal",
    visibleInComposite: true,
    isUtilityMaskPass: false,
    clippedToPassId: null,
    renderFlags: {
      disableShadowObjects: true,
      onlyOutlineObjects: false,
      layerObjectGroup: "hair",
    },
  },
  {
    passId: "Hair Shadow",
    stackOrder: 6,
    defaultBlendMode: "multiply",
    visibleInComposite: true,
    isUtilityMaskPass: false,
    clippedToPassId: "Hair Base",
    renderFlags: {
      disableShadowObjects: false,
      onlyOutlineObjects: false,
      layerObjectGroup: "hair",
    },
  },
  {
    passId: "Hair Line",
    stackOrder: 7,
    defaultBlendMode: "normal",
    visibleInComposite: true,
    isUtilityMaskPass: false,
    clippedToPassId: null,
    renderFlags: {
      disableShadowObjects: true,
      onlyOutlineObjects: true,
      layerObjectGroup: "hair",
    },
  },
] as const;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * `ExportManager.SetResolusion` (`0x02000026`) 대응 해상도 배율(`1x`, `2x`, `4x`, `custom`) 계산.
 */
export function resolveShaperExportResolution(
  input: ShaperResolutionInput,
): ShaperResolutionPlan {
  const baseWidth = clampInt(input.baseWidth, 1, 16384);
  const baseHeight = clampInt(input.baseHeight, 1, 16384);

  if (input.scale === "custom") {
    const width = clampInt(input.customWidth ?? baseWidth, 1, 16384);
    const height = clampInt(input.customHeight ?? baseHeight, 1, 16384);
    return {
      scale: "custom",
      width,
      height,
      scaleFactorX: width / baseWidth,
      scaleFactorY: height / baseHeight,
    };
  }

  const multiplier = input.scale === "4x" ? 4 : input.scale === "2x" ? 2 : 1;
  const width = clampInt(baseWidth * multiplier, 1, 16384);
  const height = clampInt(baseHeight * multiplier, 1, 16384);
  return {
    scale: input.scale,
    width,
    height,
    scaleFactorX: multiplier,
    scaleFactorY: multiplier,
  };
}

/**
 * `ExportManager.CropImage` 대응: 알파 채널 임계값을 기준으로 유효 픽셀 바운딩 박스를 산출한다.
 */
export function computeAlphaCropBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: { readonly alphaThreshold?: number; readonly padding?: number } = {},
): CropBounds {
  const safeWidth = clampInt(width, 1, 16384);
  const safeHeight = clampInt(height, 1, 16384);
  const threshold = clampInt(options.alphaThreshold ?? 1, 1, 255);
  const padding = clampInt(options.padding ?? 0, 0, 2048);

  let minX = safeWidth;
  let minY = safeHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const alpha = rgba[(y * safeWidth + x) * 4 + 3] ?? 0;
      if (alpha >= threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: safeWidth, height: safeHeight };
  }

  const x0 = Math.max(0, minX - padding);
  const y0 = Math.max(0, minY - padding);
  const x1 = Math.min(safeWidth - 1, maxX + padding);
  const y1 = Math.min(safeHeight - 1, maxY + padding);

  return {
    x: x0,
    y: y0,
    width: x1 - x0 + 1,
    height: y1 - y0 + 1,
  };
}

/**
 * 지정한 `CropBounds` 영역으로 RGBA 픽셀 버퍼를 잘라낸다.
 */
export function cropRgbaBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: CropBounds,
): Uint8ClampedArray {
  const safeWidth = clampInt(width, 1, 16384);
  const safeHeight = clampInt(height, 1, 16384);
  const cropX = clampInt(bounds.x, 0, safeWidth - 1);
  const cropY = clampInt(bounds.y, 0, safeHeight - 1);
  const cropW = clampInt(bounds.width, 1, safeWidth - cropX);
  const cropH = clampInt(bounds.height, 1, safeHeight - cropY);

  if (cropX === 0 && cropY === 0 && cropW === safeWidth && cropH === safeHeight) {
    return new Uint8ClampedArray(rgba);
  }

  const out = new Uint8ClampedArray(cropW * cropH * 4);
  const rowByteLength = cropW * 4;
  for (let row = 0; row < cropH; row += 1) {
    const srcOffset = ((cropY + row) * safeWidth + cropX) * 4;
    const dstOffset = row * rowByteLength;
    out.set(rgba.subarray(srcOffset, srcOffset + rowByteLength), dstOffset);
  }
  return out;
}

function buildSynthesizedClipPass(
  width: number,
  height: number,
  passes: Partial<Record<ShaperRenderPassId, Uint8ClampedArray>>,
): Uint8ClampedArray {
  const provided = passes.Clip;
  if (provided && provided.length === width * height * 4) {
    return new Uint8ClampedArray(provided);
  }

  const out = new Uint8ClampedArray(width * height * 4);
  for (const passId of SHAPER_CANONICAL_PASS_ORDER) {
    if (passId === "Clip") continue;
    const buf = passes[passId];
    if (!buf || buf.length < width * height * 4) continue;
    for (let i = 0; i < width * height; i += 1) {
      const idx = i * 4;
      const alpha = buf[idx + 3] ?? 0;
      if (alpha > (out[idx + 3] ?? 0)) {
        out[idx] = 255;
        out[idx + 1] = 255;
        out[idx + 2] = 255;
        out[idx + 3] = alpha;
      }
    }
  }
  return out;
}

/**
 * Shaper 8-Pass 렌더 결과를 아티스트 후보정용 PSD 레이어 스택으로 조립한다.
 */
export function buildShaperMultipassPsdStack(
  input: BuildShaperMultipassPsdStackInput,
): ShaperMultipassPsdStack {
  const sourceWidth = clampInt(input.width, 1, 16384);
  const sourceHeight = clampInt(input.height, 1, 16384);
  const expectedLength = sourceWidth * sourceHeight * 4;

  const synthesizedClip = buildSynthesizedClipPass(
    sourceWidth,
    sourceHeight,
    input.passes,
  );

  const cropBounds: CropBounds = input.cropBounds
    ? {
        x: clampInt(input.cropBounds.x, 0, sourceWidth - 1),
        y: clampInt(input.cropBounds.y, 0, sourceHeight - 1),
        width: clampInt(
          input.cropBounds.width,
          1,
          sourceWidth - clampInt(input.cropBounds.x, 0, sourceWidth - 1),
        ),
        height: clampInt(
          input.cropBounds.height,
          1,
          sourceHeight - clampInt(input.cropBounds.y, 0, sourceHeight - 1),
        ),
      }
    : input.cropToContent
      ? computeAlphaCropBounds(synthesizedClip, sourceWidth, sourceHeight, {
          alphaThreshold: input.alphaThreshold,
          padding: input.cropPadding,
        })
      : { x: 0, y: 0, width: sourceWidth, height: sourceHeight };

  const canvasWidth = cropBounds.width;
  const canvasHeight = cropBounds.height;

  const layers: ShaperMultipassLayerDescriptor[] = PASS_SPECS.map((spec) => {
    const rawPass =
      spec.passId === "Clip" ? synthesizedClip : input.passes[spec.passId];
    const normalizedPass =
      rawPass && rawPass.length === expectedLength
        ? rawPass
        : new Uint8ClampedArray(expectedLength);
    const cropped = cropRgbaBuffer(
      normalizedPass,
      sourceWidth,
      sourceHeight,
      cropBounds,
    );
    const isShadowPass =
      spec.passId === "Shadow" || spec.passId === "Hair Shadow";

    return {
      passId: spec.passId,
      layerName: spec.passId,
      stackOrder: spec.stackOrder,
      blendMode:
        isShadowPass && input.shadowBlendMode
          ? input.shadowBlendMode
          : spec.defaultBlendMode,
      opacity: 1,
      visible: spec.visibleInComposite,
      isUtilityMaskPass: spec.isUtilityMaskPass,
      clippedToPassId: spec.clippedToPassId,
      clippingMaskEnabled: spec.clippedToPassId !== null,
      renderFlags: spec.renderFlags,
      width: canvasWidth,
      height: canvasHeight,
      rgba: cropped,
    };
  });

  const clipLayer = layers.find((layer) => layer.passId === "Clip");
  const clipMaskAlpha = new Uint8Array(canvasWidth * canvasHeight);
  if (clipLayer) {
    for (let i = 0; i < canvasWidth * canvasHeight; i += 1) {
      clipMaskAlpha[i] = clipLayer.rgba[i * 4 + 3] ?? 0;
    }
  }

  return {
    canvasWidth,
    canvasHeight,
    sourceWidth,
    sourceHeight,
    cropBounds,
    layers,
    clipMaskAlpha,
  };
}

/**
 * 8-Pass PSD 스택을 클리핑 마스크(`Shadow -> Base`, `Hair Shadow -> Hair Base`) 및
 * 블렌드 모드(`normal` / `multiply`) 규칙에 맞춰 단일 RGBA 프리뷰 버퍼로 합성한다.
 */
export function compositeShaperMultipassPreview(
  stack: Pick<ShaperMultipassPsdStack, "canvasWidth" | "canvasHeight" | "layers">,
): Uint8ClampedArray {
  const pixelCount = stack.canvasWidth * stack.canvasHeight;
  const out = new Uint8ClampedArray(pixelCount * 4);

  const ordered = [...stack.layers].sort((a, b) => a.stackOrder - b.stackOrder);
  const layerMap = new Map<ShaperRenderPassId, ShaperMultipassLayerDescriptor>();
  for (const layer of ordered) {
    layerMap.set(layer.passId, layer);
  }

  for (const layer of ordered) {
    if (!layer.visible || layer.isUtilityMaskPass || layer.opacity <= 0) {
      continue;
    }

    const clipBase = layer.clippedToPassId
      ? layerMap.get(layer.clippedToPassId)
      : undefined;

    for (let i = 0; i < pixelCount; i += 1) {
      const idx = i * 4;
      let srcA = ((layer.rgba[idx + 3] ?? 0) / 255) * layer.opacity;
      if (srcA <= 0) continue;

      if (clipBase && layer.clippingMaskEnabled) {
        const baseAlpha = (clipBase.rgba[idx + 3] ?? 0) / 255;
        srcA *= baseAlpha;
        if (srcA <= 0) continue;
      }

      const srcR = (layer.rgba[idx] ?? 0) / 255;
      const srcG = (layer.rgba[idx + 1] ?? 0) / 255;
      const srcB = (layer.rgba[idx + 2] ?? 0) / 255;

      const dstR = (out[idx] ?? 0) / 255;
      const dstG = (out[idx + 1] ?? 0) / 255;
      const dstB = (out[idx + 2] ?? 0) / 255;
      const dstA = (out[idx + 3] ?? 0) / 255;

      const blendedR = layer.blendMode === "multiply" ? dstR * srcR : srcR;
      const blendedG = layer.blendMode === "multiply" ? dstG * srcG : srcG;
      const blendedB = layer.blendMode === "multiply" ? dstB * srcB : srcB;

      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) continue;

      const compR =
        (srcA * ((1 - dstA) * srcR + dstA * blendedR) + dstA * (1 - srcA) * dstR) /
        outA;
      const compG =
        (srcA * ((1 - dstA) * srcG + dstA * blendedG) + dstA * (1 - srcA) * dstG) /
        outA;
      const compB =
        (srcA * ((1 - dstA) * srcB + dstA * blendedB) + dstA * (1 - srcA) * dstB) /
        outA;

      out[idx] = Math.round(compR * 255);
      out[idx + 1] = Math.round(compG * 255);
      out[idx + 2] = Math.round(compB * 255);
      out[idx + 3] = Math.round(outA * 255);
    }
  }

  return out;
}
