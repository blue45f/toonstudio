import { parseStudioGpuColor } from "../render/studio-webgpu-color";
import type { StudioOilRibbonNativeReadback, StudioOilRibbonPaintInput } from "./studio-oil-ribbon-carrier-types";
import type { StudioOilWetIntoWetSettings } from "./studio-oil-wet-into-wet";

export type StudioOilAffineTransform = Readonly<{ a: number; b: number; c: number; d: number; e: number; f: number }>;
export type StudioOilDeviceRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export const STUDIO_OIL_IDENTITY_TRANSFORM: StudioOilAffineTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function studioOilMapPoint(transform: StudioOilAffineTransform, x: number, y: number): { x: number; y: number } {
  return { x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f };
}

/** 정본·증분·retained가 같은 반올림과 clipping으로 혼색 영역을 읽는다. */
export function studioOilDeviceBounds(
  points: readonly { readonly x: number; readonly y: number }[],
  padding: number,
  transform: StudioOilAffineTransform,
  canvasWidth: number,
  canvasHeight: number,
): StudioOilDeviceRect | null {
  if (points.length === 0) return null;
  let minX = points[0]!.x;
  let minY = points[0]!.y;
  let maxX = minX;
  let maxY = minY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const corners = [
    studioOilMapPoint(transform, minX - padding, minY - padding),
    studioOilMapPoint(transform, maxX + padding, minY - padding),
    studioOilMapPoint(transform, minX - padding, maxY + padding),
    studioOilMapPoint(transform, maxX + padding, maxY + padding),
  ];
  const x = Math.max(0, Math.floor(Math.min(...corners.map(point => point.x))));
  const y = Math.max(0, Math.floor(Math.min(...corners.map(point => point.y))));
  const width = Math.min(canvasWidth, Math.ceil(Math.max(...corners.map(point => point.x)))) - x;
  const height = Math.min(canvasHeight, Math.ceil(Math.max(...corners.map(point => point.y)))) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

export function studioOilWetSettings(input: Pick<StudioOilRibbonPaintInput, "radiusPx" | "stroke" | "mixModel">): StudioOilWetIntoWetSettings {
  const parsed = parseStudioGpuColor(input.stroke);
  return {
    radiusPx: Number.isFinite(input.radiusPx) && input.radiusPx > 0 ? input.radiusPx : 8,
    hardness: 0.55, strength: 0.88, wetness: 0.65, pickup: 0.55,
    paintColor: parsed ? { r: Math.round(parsed[0] * 255), g: Math.round(parsed[1] * 255), b: Math.round(parsed[2] * 255) }
      : { r: 0, g: 0, b: 0 },
    loadDepletion: 0, mixModel: input.mixModel ?? "spectral-wgm",
  };
}

export function studioOilReadbackPlan(native: StudioOilRibbonNativeReadback, input: StudioOilRibbonPaintInput) {
  const transform = native.getTransform?.() ?? STUDIO_OIL_IDENTITY_TRANSFORM;
  const settings = studioOilWetSettings(input);
  const rect = studioOilDeviceBounds(input.points, Math.ceil(settings.radiusPx + 2), transform, native.canvas.width, native.canvas.height);
  return rect ? { transform, settings, rect } : null;
}
