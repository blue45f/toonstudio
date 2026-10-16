import { beforeAll, describe, expect, it } from "vitest";

import { STUDIO_RASTER_ASSETS } from "../render/studio-raster-assets";
import {
  STUDIO_ASSET_DRAG_MIME,
  STUDIO_INSERT_DRAG_MIME,
} from "../studio-insert-drag-core";
import { parseStudioInsertDragPayload } from "../studio-insert-drag";
import {
  STUDIO_OBJECT_INSERT_DRAG_MIME,
  parseStudioObjectInsertDragPayload,
} from "../studio-object-insert-drag";
import { parseStudioAssetDragPayload } from "../studio-shared-asset-drag";
import { buildStudioCharmCatalog, type StudioCharmCatalog } from "./studio-charm-catalog";
import { loadStudioCharmCatalogData } from "./studio-charm-catalog-data";
import { isStudioCharmDraggable, writeStudioCharmDragPayload } from "./studio-charm-drag";
import { createStudioCharmId } from "./studio-charm-model";

import type { StudioCharmDescriptor } from "./studio-charm-descriptor";

let catalog: StudioCharmCatalog;
const CANVAS = { width: 720, height: 1280 } as const;

beforeAll(async () => {
  catalog = buildStudioCharmCatalog({ data: await loadStudioCharmCatalogData(), library: [], libraryReady: true });
});

function recorder() {
  const written = new Map<string, string>();
  return {
    written,
    transfer: {
      effectAllowed: "none" as DataTransfer["effectAllowed"],
      setData(format: string, value: string) { written.set(format, value); },
    },
  };
}

function ready(id: Parameters<StudioCharmCatalog["resolve"]>[0]): StudioCharmDescriptor {
  const resolution = catalog.resolve(id);
  if (resolution.status !== "ready") throw new Error(`${id} 를 해석하지 못했습니다`);
  return resolution.descriptor;
}

function custom(overrides: Partial<StudioCharmDescriptor> & Pick<StudioCharmDescriptor, "action">): StudioCharmDescriptor {
  return { ...ready(createStudioCharmId("fx", "radial-focus")), ...overrides };
}

describe("참 끌어다 놓기: 기존 캔버스 드롭 계약을 그대로 쓴다", () => {
  it("SVG 효과는 json-asset 로컬 이미지 페이로드이고 드롭 쪽 파서가 받아들인다", () => {
    const { written, transfer } = recorder();
    expect(writeStudioCharmDragPayload(transfer, ready(createStudioCharmId("fx", "radial-focus")), CANVAS)).toBe(true);
    expect(transfer.effectAllowed).toBe("copy");
    expect([...written.keys()]).toEqual([STUDIO_ASSET_DRAG_MIME]);
    const parsed = parseStudioAssetDragPayload(written.get(STUDIO_ASSET_DRAG_MIME) ?? "");
    expect(parsed).toMatchObject({ source: "local", width: 480, height: 480 });
  });

  it("이모지는 sticker, 말풍선은 bubble 삽입 페이로드다", () => {
    const emoji = recorder();
    expect(writeStudioCharmDragPayload(emoji.transfer, ready(createStudioCharmId("emoji", "1f4a7")), CANVAS)).toBe(true);
    expect(parseStudioInsertDragPayload(emoji.written.get(STUDIO_INSERT_DRAG_MIME) ?? "")).toEqual({ kind: "sticker", emoji: "💧" });
    const bubble = recorder();
    expect(writeStudioCharmDragPayload(bubble.transfer, ready(createStudioCharmId("bubble", "thought")), CANVAS)).toBe(true);
    expect(parseStudioInsertDragPayload(bubble.written.get(STUDIO_INSERT_DRAG_MIME) ?? "")).toEqual({ kind: "bubble", variant: "thought" });
  });

  it("3D 오브젝트는 object-insert 페이로드로, 놓으면 해당 3D 도구가 열린다", () => {
    const item = catalog.descriptors.find((descriptor) => descriptor.action.type === "open-3d");
    expect(item).toBeDefined();
    if (!item || item.action.type !== "open-3d") return;
    const { written, transfer } = recorder();
    expect(writeStudioCharmDragPayload(transfer, item, CANVAS)).toBe(true);
    const parsed = parseStudioObjectInsertDragPayload(written.get(STUDIO_OBJECT_INSERT_DRAG_MIME) ?? "");
    expect(parsed).toMatchObject({ itemId: item.action.itemId, sourceId: item.action.sourceId, openTarget: item.action.openTarget });
  });

  it("끌어다 놓기 계약이 없는 일러스트·효과음은 거절하고 아무것도 쓰지 않는다", () => {
    const raster = recorder();
    expect(writeStudioCharmDragPayload(raster.transfer, ready(createStudioCharmId("raster", STUDIO_RASTER_ASSETS[0].id)), CANVAS)).toBe(false);
    expect(raster.written.size).toBe(0);
    const sfx = recorder();
    expect(writeStudioCharmDragPayload(sfx.transfer, ready(createStudioCharmId("sfx", "sfx-kwang")), CANVAS)).toBe(false);
    expect(sfx.written.size).toBe(0);
    expect(isStudioCharmDraggable(ready(createStudioCharmId("raster", STUDIO_RASTER_ASSETS[0].id)))).toBe(false);
    expect(isStudioCharmDraggable(ready(createStudioCharmId("sfx", "sfx-kwang")))).toBe(false);
    expect(isStudioCharmDraggable(ready(createStudioCharmId("fx", "radial-focus")))).toBe(true);
  });

  it("드롭 쪽이 거절할 페이로드(허용되지 않은 SVG 요소·알 수 없는 데이터 URL)는 끌기를 시작하지 않는다", () => {
    const unsafeSvg = custom({
      action: { type: "svg-image", svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', width: 10, height: 10 },
    });
    const first = recorder();
    expect(writeStudioCharmDragPayload(first.transfer, unsafeSvg, CANVAS)).toBe(false);
    expect(first.written.size).toBe(0);

    const badLibrary = custom({ action: { type: "library-image", dataUrl: "data:text/html;base64,PGgxPg==", width: 10, height: 10 } });
    const second = recorder();
    expect(writeStudioCharmDragPayload(second.transfer, badLibrary, CANVAS)).toBe(false);
    expect(second.written.size).toBe(0);
  });

  it("허용된 래스터 데이터 URL 의 내 소재는 끌 수 있다", () => {
    const png = custom({
      action: {
        type: "library-image",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        width: 1,
        height: 1,
      },
    });
    const { written, transfer } = recorder();
    expect(writeStudioCharmDragPayload(transfer, png, CANVAS)).toBe(true);
    expect(parseStudioAssetDragPayload(written.get(STUDIO_ASSET_DRAG_MIME) ?? "")).toMatchObject({ source: "local", width: 1, height: 1 });
  });
});
