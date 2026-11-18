/** 재질 바인딩·원고 저장·PNG 내보내기가 함께 쓰는 채색 채널 규격. */
export const STUDIO_VRM_TEXTURE_PAINT_CHANNELS = Object.freeze([
  "baseColor",
  "roughness",
  "metalness",
  "emissive",
  "opacity",
] as const);

export type StudioVrmTexturePaintChannel = typeof STUDIO_VRM_TEXTURE_PAINT_CHANNELS[number];
export type StudioVrmTexturePaintColorSpace = "srgb" | "linear";
export type StudioVrmTexturePaintChannelPacking = "rgba" | "rgb" | "grayscale";

export interface StudioVrmTexturePaintChannelEncoding {
  readonly colorSpace: StudioVrmTexturePaintColorSpace;
  /** 단일 값 PNG는 RGB에 같은 값을 저장하고 알파는 255로 유지한다. */
  readonly channelPacking: StudioVrmTexturePaintChannelPacking;
}

const CHANNEL_ENCODINGS: Readonly<Record<
  StudioVrmTexturePaintChannel,
  StudioVrmTexturePaintChannelEncoding
>> = Object.freeze({
  baseColor: Object.freeze({ colorSpace: "srgb", channelPacking: "rgba" }),
  roughness: Object.freeze({ colorSpace: "linear", channelPacking: "grayscale" }),
  metalness: Object.freeze({ colorSpace: "linear", channelPacking: "grayscale" }),
  emissive: Object.freeze({ colorSpace: "srgb", channelPacking: "rgb" }),
  opacity: Object.freeze({ colorSpace: "linear", channelPacking: "grayscale" }),
});

export function canonicalizeStudioVrmTexturePaintChannel(
  value: unknown,
): StudioVrmTexturePaintChannel | null {
  return typeof value === "string"
    && STUDIO_VRM_TEXTURE_PAINT_CHANNELS.includes(value as StudioVrmTexturePaintChannel)
    ? value as StudioVrmTexturePaintChannel
    : null;
}

export function studioVrmTexturePaintChannelEncoding(
  channel: StudioVrmTexturePaintChannel,
): StudioVrmTexturePaintChannelEncoding {
  return CHANNEL_ENCODINGS[channel];
}

export function isStudioVrmTexturePaintScalarChannel(
  channel: StudioVrmTexturePaintChannel,
): boolean {
  return CHANNEL_ENCODINGS[channel].channelPacking === "grayscale";
}
