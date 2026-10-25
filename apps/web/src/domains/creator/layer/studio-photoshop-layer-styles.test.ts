import { describe, expect, it } from "vitest";
import {
  applyPhotoshopGlobalLightAngle,
  computePhotoshopLayerThumbnailViewport,
  decodePhotoshopLrFxBlock,
  doesPhotoshopLayerNeedRasterization,
  encodePhotoshopLrFxBlock,
  photoshopLayerEffectsToStudioPatch,
  renderPhotoshopLayerEffectsToRgba,
  type PhotoshopLayerEffectsStack,
} from "./studio-photoshop-layer-styles";

describe("studio-photoshop-layer-styles", () => {
  it("lrFX 바이너리 블록(cmnS, dsdw, isdw, oglw, sofi)을 무손실 인코딩/디코딩한다", () => {
    const stack: PhotoshopLayerEffectsStack = {
      dropShadow: {
        enabled: true,
        blendMode: "multiply",
        color: { r: 20, g: 30, b: 40 },
        opacity: 0.75,
        angle: 120,
        useGlobalLight: true,
        distancePx: 8,
        sizePx: 14,
      },
      innerShadow: {
        enabled: true,
        blendMode: "multiply",
        color: { r: 10, g: 10, b: 10 },
        opacity: 0.5,
        angle: 120,
        useGlobalLight: false,
        distancePx: 4,
        sizePx: 6,
      },
      outerGlow: {
        enabled: true,
        blendMode: "screen",
        color: { r: 56, g: 189, b: 248 },
        opacity: 0.9,
        sizePx: 20,
      },
      colorOverlay: {
        enabled: true,
        blendMode: "normal",
        color: { r: 255, g: 80, b: 120 },
        opacity: 0.4,
      },
    };

    const bytes = encodePhotoshopLrFxBlock(stack);
    const decoded = decodePhotoshopLrFxBlock(bytes);

    expect(decoded.dropShadow?.enabled).toBe(true);
    expect(decoded.dropShadow?.sizePx).toBeCloseTo(14, 2);
    expect(decoded.dropShadow?.distancePx).toBeCloseTo(8, 2);
    expect(decoded.dropShadow?.color).toEqual({ r: 20, g: 30, b: 40 });
    expect(decoded.innerShadow?.useGlobalLight).toBe(false);
    expect(decoded.outerGlow?.color).toEqual({ r: 56, g: 189, b: 248 });
    expect(decoded.colorOverlay?.color).toEqual({ r: 255, g: 80, b: 120 });
  });

  it("글로벌 라이트 각도 동기화 및 Konva LayerStylePatch 변환, RGBA 픽셀 합성을 수행한다", () => {
    const stack: PhotoshopLayerEffectsStack = {
      dropShadow: {
        enabled: true,
        blendMode: "multiply",
        color: { r: 0, g: 0, b: 0 },
        opacity: 0.5,
        angle: 120,
        useGlobalLight: true,
        distancePx: 10,
        sizePx: 12,
      },
      innerShadow: {
        enabled: true,
        blendMode: "multiply",
        color: { r: 0, g: 0, b: 0 },
        opacity: 0.5,
        angle: 45,
        useGlobalLight: false,
        distancePx: 5,
        sizePx: 5,
      },
      bevelEmboss: {
        enabled: true,
        style: "inner bevel",
        direction: "up",
        sizePx: 6,
        strength: 2,
        angle: 120,
        useGlobalLight: true,
        highlightBlendMode: "screen",
        highlightColor: { r: 255, g: 255, b: 255 },
        highlightOpacity: 0.7,
        shadowBlendMode: "multiply",
        shadowColor: { r: 0, g: 0, b: 0 },
        shadowOpacity: 0.6,
      },
      stroke: {
        enabled: true,
        position: "inside",
        blendMode: "normal",
        color: { r: 255, g: 255, b: 255 },
        opacity: 1,
        sizePx: 1,
      },
    };

    const synced = applyPhotoshopGlobalLightAngle(stack, 30);
    expect(synced.dropShadow?.angle).toBe(30);
    expect(synced.bevelEmboss?.angle).toBe(30);
    expect(synced.innerShadow?.angle).toBe(45);

    const patch = photoshopLayerEffectsToStudioPatch(synced);
    expect(patch.shadowColor).toBe("#000000");
    expect(patch.shadowBlur).toBe(12);

    const src = new Uint8ClampedArray(4 * 4 * 4).fill(180);
    const rendered = renderPhotoshopLayerEffectsToRgba(src, 4, 4, synced);
    expect(rendered.length).toBe(src.length);
    expect([...rendered].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(
      true,
    );
  });

  it("LayersPanelStore 썸네일 클리핑(doc vs layer) 및 LiquifyUtils 래스터화 가드를 재현한다", () => {
    const docClip = computePhotoshopLayerThumbnailViewport({
      documentBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      layerBounds: { x: 240, y: 180, width: 320, height: 400 },
      clipMode: "doc",
      thumbnailSize: "M",
    });
    expect(docClip.preferenceEventName).toBe("layerPaletteClipThumbsToDoc");
    expect(docClip.sourceCrop.width).toBe(1920);
    expect(docClip.thumbnailPixelSide).toBe(40);

    const layerClip = computePhotoshopLayerThumbnailViewport({
      documentBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      layerBounds: { x: 240, y: 180, width: 320, height: 400 },
      clipMode: "layer",
      thumbnailSize: "L",
    });
    expect(layerClip.preferenceEventName).toBe("layerPaletteClipThumbsToLayer");
    expect(layerClip.sourceCrop.width).toBe(320);
    expect(layerClip.thumbnailPixelSide).toBe(64);

    expect(doesPhotoshopLayerNeedRasterization("text")).toBe(true);
    expect(doesPhotoshopLayerNeedRasterization("vector")).toBe(true);
    expect(doesPhotoshopLayerNeedRasterization("smart_object")).toBe(true);
    expect(doesPhotoshopLayerNeedRasterization("pixel")).toBe(false);
    expect(doesPhotoshopLayerNeedRasterization("adjustment")).toBe(false);
  });
});
