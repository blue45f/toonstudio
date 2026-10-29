import { office2dGeneratedAtlas, type Office2dAtlasPoint, type Office2dAtlasRect, type Office2dAtlasSheet } from "./office2d-generated-atlases";
import { OFFICE2D_FOOT_RATIO } from "./office2d-actor-geometry";
import { OFFICE2D_CHARACTER_CELL, type Office2dCharacterKey, type Office2dImageSource } from "./office2d-sprite-catalog";

export interface Office2dAtlasDrawFrame {
  readonly source: Office2dAtlasRect;
  /** 기존 128×192 논리셀 안의 표시 영역. 원본 해상도·셀 경계와 독립적이다. */
  readonly destination: Office2dAtlasRect;
  /** 이미지와 같은 접지/머리 변환으로 기존 꾸미기 템플릿을 옮긴다. */
  readonly accessoryOffset: Office2dAtlasPoint;
}

/** v2가 오래된 캐시/잘못된 크기면 renderer가 실제 기존 시트로 돌아가게 한다. */
export function office2dAtlasImageMatches(character: Office2dCharacterKey, sheet: Office2dAtlasSheet, row: number, col: number, image: Office2dImageSource): boolean {
  const atlas = office2dGeneratedAtlas(character, sheet);
  return !atlas || (image.width === atlas.width && image.height === atlas.height
    && row >= 0 && row < atlas.rows && col >= 0 && col < atlas.columns
    && Boolean(atlas.frames[row * atlas.columns + col]));
}

export function office2dAtlasDrawFrame(
  character: Office2dCharacterKey,
  sheet: Office2dAtlasSheet,
  row: number,
  col: number,
  image: Office2dImageSource,
  crop = 1,
  generatedImage = true,
): Office2dAtlasDrawFrame {
  const { width, height } = OFFICE2D_CHARACTER_CELL;
  const foot = height * OFFICE2D_FOOT_RATIO;
  const clipped = Math.max(0, Math.min(1, crop));
  const atlas = generatedImage ? office2dGeneratedAtlas(character, sheet) : null;
  const frame = atlas && image.width === atlas.width && image.height === atlas.height
    ? atlas.frames[row * atlas.columns + col] : undefined;
  if (!atlas || !frame) return {
    source: { x: col * width, y: row * height, width, height: height * clipped },
    destination: { x: 0, y: 0, width, height: height * clipped },
    accessoryOffset: { x: 0, y: 0 },
  };
  const scaleX = atlas.width / atlas.columns / width;
  const scaleY = atlas.height / atlas.rows / height;
  const destination = {
    x: width / 2 + (frame.source.x - frame.anchor.x) / scaleX,
    y: foot + (frame.source.y - frame.anchor.y) / scaleY,
    width: frame.source.width / scaleX,
    height: frame.source.height / scaleY,
  };
  // 뒤 착석의 하반신 자르기도 원본 픽셀이 아닌 동일한 논리셀 좌표로 적용한다.
  const drawHeight = Math.max(0, Math.min(destination.height, height * clipped - destination.y));
  return {
    source: { ...frame.source, height: drawHeight * scaleY },
    destination: { ...destination, height: drawHeight },
    accessoryOffset: {
      x: width / 2 + (frame.head.x - frame.anchor.x) / scaleX - frame.referenceHead.x,
      y: foot + (frame.head.y - frame.anchor.y) / scaleY - frame.referenceHead.y,
    },
  };
}
