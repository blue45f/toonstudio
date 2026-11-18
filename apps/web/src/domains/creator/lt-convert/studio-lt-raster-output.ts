import type { StudioLtConvertLayerPayload } from "./studio-lt-convert-layer";

export interface StudioLtPng {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly src: string;
}
export type StudioLtPngPair = readonly [line: StudioLtPng, tone: StudioLtPng];
export type StudioLtInsertLayers = (layers: StudioLtPngPair, signal: AbortSignal) => Promise<boolean>;

export function encodeStudioLtPng(layer: StudioLtConvertLayerPayload): StudioLtPng {
  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PNG를 만들 수 없습니다.");
    ctx.putImageData(layer.imageData, 0, 0);
    const src = canvas.toDataURL("image/png");
    if (!src.startsWith("data:image/png;base64,")) throw new Error("PNG를 만들 수 없습니다.");
    return { src, name: layer.name, width: layer.width, height: layer.height };
  } finally { canvas.width = 0; canvas.height = 0; }
}
