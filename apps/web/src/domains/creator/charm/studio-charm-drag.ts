/**
 * 참 칩을 캔버스로 끌어다 놓을 때 쓰는 드래그 페이로드 기록기.
 *
 * 새 MIME 이나 소재 포맷을 만들지 않는다. 캔버스 드롭 핸들러가 이미 이해하는 세 계약을 그대로 쓴다.
 * - 이미지형(SVG·내 소재): `application/json-asset` (`serializeStudioLocalAssetDragPayload`)
 * - 스티커·말풍선: `application/json-insert` (`writeStudioInsertDragPayload`)
 * - 3D 오브젝트: `application/x-studio-object-insert+json` (`writeStudioObjectInsertDragPayload`)
 * 놓은 위치에 배치하는 규칙과 되돌리기 단계는 기존 드롭 경로의 것을 따른다.
 * 일러스트(원본 파일을 받아 와야 함)와 효과음(텍스트 요소)은 끌어다 놓기 계약이 없어 누르기로만 붙인다.
 */

import { svgToDataUrl } from "../studio-characters";
import { writeStudioAssetDragPayload, writeStudioInsertDragPayload } from "../studio-insert-drag-writer";
import { findStudioObjectInsertItem, planStudioObjectInsertPlacement } from "../studio-object-insert-catalog";
import { writeStudioObjectInsertDragPayload } from "../studio-object-insert-drag";
import {
  parseStudioAssetDragPayload,
  serializeStudioLocalAssetDragPayload,
} from "../studio-shared-asset-drag";

import type { StudioWritableDataTransfer } from "../studio-insert-drag-core";
import type { StudioCharmDescriptor } from "./studio-charm-descriptor";

export interface StudioCharmDragCanvas {
  readonly width: number;
  readonly height: number;
}

/** 이 종류의 참이 끌어다 놓기 계약을 가졌는지. 렌더 중에 싸게 부를 수 있는 판정이다. */
export function isStudioCharmDraggable(descriptor: StudioCharmDescriptor): boolean {
  switch (descriptor.action.type) {
    case "svg-image":
    case "library-image":
    case "emoji-sticker":
    case "native-bubble":
    case "open-3d":
      return true;
    case "raster-asset":
    case "sfx-text":
      return false;
  }
}

function writeLocalImage(
  dataTransfer: StudioWritableDataTransfer,
  src: string,
  width: number,
  height: number,
): boolean {
  const serialized = serializeStudioLocalAssetDragPayload({ src, width, height });
  // 드롭 쪽 파서가 거절할 페이로드(허용되지 않은 SVG 요소, 너무 큰 이미지 등)는 끌기를 시작하지 않는다.
  if (!parseStudioAssetDragPayload(serialized)) return false;
  writeStudioAssetDragPayload(dataTransfer, serialized);
  return true;
}

/**
 * 드래그 세션에 참 페이로드를 쓴다. 끌 수 없는 참이거나 드롭 쪽이 거절할 페이로드면 false 를 돌려주며,
 * 호출자는 그때 `preventDefault()` 로 끌기를 막고 누르기로 안내한다.
 */
export function writeStudioCharmDragPayload(
  dataTransfer: StudioWritableDataTransfer,
  descriptor: StudioCharmDescriptor,
  canvas: StudioCharmDragCanvas,
): boolean {
  const { action } = descriptor;
  switch (action.type) {
    case "svg-image":
      return writeLocalImage(dataTransfer, svgToDataUrl(action.svg), action.width, action.height);
    case "library-image":
      return writeLocalImage(dataTransfer, action.dataUrl, action.width, action.height);
    case "emoji-sticker":
      writeStudioInsertDragPayload(dataTransfer, { kind: "sticker", emoji: action.emoji });
      return true;
    case "native-bubble":
      writeStudioInsertDragPayload(dataTransfer, { kind: "bubble", variant: action.variant });
      return true;
    case "open-3d": {
      const item = findStudioObjectInsertItem(action.itemId);
      const plan = planStudioObjectInsertPlacement({
        itemId: action.itemId,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        existingCount: 0,
      });
      if (!item || !plan) return false;
      writeStudioObjectInsertDragPayload(dataTransfer, { item, plan });
      return true;
    }
    case "raster-asset":
    case "sfx-text":
      return false;
  }
}
