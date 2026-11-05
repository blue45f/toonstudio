import { expect, it } from "vitest";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../bg3d/studio-bg3d-scene-document";
import { createStudioShared3dStageDocument } from "../studio-shared-3d-stage-document";
import { studioShared3dStageVisibilityOverlayElementIds } from "../studio-shared-3d-stage-collection";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { StudioCrdtSceneElementRecord } from "./studio-crdt-document";
import type { StudioCrdtSceneGraphFrontier } from "./studio-crdt-history";
import { rebaseStudioCrdtPendingScenePropertyHistory } from "./studio-crdt-pending-frontier-history";

function text(value: string, x: number): El {
  return { id: "node", type: "text", text: value, x, y: 0, width: 100, fontSize: 24, fill: "#000", rotation: 0 };
}
function page(elements: El[]): PageState { return { id: "page", elements, bg: "#fff", bgGrad: null, canvasH: 1000 }; }
function record(props: Record<string, string | number>): StudioCrdtSceneElementRecord {
  return { id: "node", pageId: "page", layerId: "page-root", deleted: false, orderIndex: 0,
    payload: { version: 1, type: "text", props } };
}
function frontier(...sceneElements: StudioCrdtSceneElementRecord[]): StudioCrdtSceneGraphFrontier {
  return { sceneElements, strokes: [], pages: [], layerGroups: [] };
}
function rebase(history: PageState[][], before: StudioCrdtSceneElementRecord, after: StudioCrdtSceneElementRecord) {
  return rebaseStudioCrdtPendingScenePropertyHistory({ history, before: frontier(before), after: frontier(after), changedSceneElementIds: new Set(["node"]) });
}

it("원격 text 변경만 즉시 반영해 동일 요소의 서로 다른 로컬 좌표 이력을 보존한다", () => {
  const history = [[page([text("original", 0)])], [page([text("original", 10)])]];
  const result = rebase(history, record({ text: "original", x: 10 }), record({ text: "remote", x: 10 }));
  expect(result.changed).toBe(true);
  expect(result.handledSceneElementIds).toEqual(new Set(["node"]));
  expect(result.history.map((pages) => pages[0]?.elements[0])).toMatchObject([{ text: "remote", x: 0 }, { text: "remote", x: 10 }]);
  expect(history.map((pages) => pages[0]?.elements[0])).toMatchObject([{ text: "original", x: 0 }, { text: "original", x: 10 }]);
});

it("원격 값으로 rebased된 undo 대상 뒤의 로컬 재편집은 별도 snapshot으로 남는다", () => {
  const original = [[page([text("original", 0)])], [page([text("local-before", 0)])]];
  const result = rebase(original, record({ text: "local-before", x: 0 }), record({ text: "remote", x: 0 }));
  const afterLocal = [...result.history, [page([text("local-after", 0)])]];
  expect(afterLocal.map((pages) => pages[0]?.elements[0])).toMatchObject([{ text: "remote" }, { text: "remote" }, { text: "local-after" }]);
});

it("구조화·불리언 필터 unset을 모든 기존 snapshot에 반영하고 다른 로컬 필터는 보존한다", () => {
  const image: El = { id: "node", type: "image", src: "work-asset://image/node", x: 0, y: 0, width: 100, height: 100, rotation: 0,
    grayscale: true, blurFx: { type: "gaussian", strength: 25, radius: 4, angle: 0 }, contrast: 10 };
  const history = [[page([image])], [page([{ ...image, contrast: 30 }])]];
  const before: StudioCrdtSceneElementRecord = { ...record({}), payload: { version: 1, type: "reference", props: {
    elementType: "image", src: image.src, grayscale: true, blurFx: { type: "gaussian", strength: 25, radius: 4, angle: 0 }, contrast: 30 } } };
  const after: StudioCrdtSceneElementRecord = { ...before, payload: { ...before.payload, props: { elementType: "image", src: image.src, contrast: 30 } } };
  const result = rebase(history, before, after);
  for (const pages of result.history) {
    expect(pages[0]?.elements[0]).not.toHaveProperty("grayscale");
    expect(pages[0]?.elements[0]).not.toHaveProperty("blurFx");
  }
  expect(result.history.map((pages) => Reflect.get(pages[0]?.elements[0] ?? {}, "contrast"))).toEqual([10, 30]);
});

it("동일 요소가 없는 과거 snapshot에는 원격 속성만으로 요소를 새로 만들지 않는다", () => {
  const history = [[page([])], [page([text("original", 0)])]];
  const result = rebase(history, record({ text: "original" }), record({ text: "remote" }));
  expect(result.history[0]).toBe(history[0]);
  expect(result.history[1]?.[0]?.elements[0]).toMatchObject({ text: "remote" });
});

it.each(["delete", "restore", "page", "layer", "order", "type", "source"])("%s 전이는 속성만으로 처리하지 않는다", (change) => {
  const before = record({ text: "original" });
  const after = record({ text: "remote" });
  if (change === "delete") after.deleted = true;
  if (change === "restore") before.deleted = true;
  if (change === "page") after.pageId = "other-page";
  if (change === "layer") after.layerId = "other-layer";
  if (change === "order") after.orderIndex = 1;
  if (change === "type") after.payload.type = "sticker";
  if (change === "source") after.payload.props.src = "new-source";
  const history = [[page([text("original", 0)])]];
  const result = rebase(history, before, after);
  expect(result.history).toBe(history);
  expect(result.changed).toBe(false);
  expect(result.handledSceneElementIds.size).toBe(0);
});

it("변경하지 않은 ID와 실제 차이가 없는 속성은 원래 참조를 재사용한다", () => {
  const history = [[page([text("original", 0)])]], value = record({ text: "original" });
  const result = rebase(history, value, value);
  expect(result.history).toBe(history); expect(result.changed).toBe(false);
  const unrelated = rebaseStudioCrdtPendingScenePropertyHistory({ history, before: frontier(value), after: frontier(record({ text: "remote" })), changedSceneElementIds: new Set() });
  expect(unrelated.history).toBe(history); expect(unrelated.handledSceneElementIds.size).toBe(0);
});

it.each(["false", "unset"])("원격 hidden %s는 기존 Stage 영수증의 숨김 overlay를 지우지 않고 해제 이력에는 반영한다", (mode) => {
  const image: El = { id: "node", type: "image", src: "blob:character", x: 0, y: 0, width: 100, height: 100, rotation: 0,
    hidden: true, vrmScene: createStudioVrmSceneDocument() };
  const shared3dStage = createStudioShared3dStageDocument({ backgroundBundleId: "bundle-a",
    elements: [{ id: "background", type: "image", bg3dLtBundleId: "bundle-a", bg3dScene: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT }, image],
    characterElementIds: [image.id], hiddenByStageElementIds: [image.id] });
  if (!shared3dStage) throw new Error("Stage 영수증 fixture를 만들지 못했습니다.");
  const history = [[{ ...page([image]), shared3dStage }], [page([{ ...image }])]];
  expect(studioShared3dStageVisibilityOverlayElementIds(shared3dStage, [image])).toEqual(new Set(["node"]));
  const before: StudioCrdtSceneElementRecord = { ...record({}), payload: { version: 1, type: "reference", props: { elementType: "image", hidden: true } } };
  const after: StudioCrdtSceneElementRecord = { ...before, payload: { ...before.payload, props: { elementType: "image", ...(mode === "false" ? { hidden: false } : {}) } } };
  const result = rebase(history, before, after);
  expect(result.history[0]?.[0]?.elements[0]).toMatchObject({ hidden: true });
  if (mode === "false") expect(result.history[1]?.[0]?.elements[0]).toMatchObject({ hidden: false });
  else expect(result.history[1]?.[0]?.elements[0]).not.toHaveProperty("hidden");
  expect(image.hidden).toBe(true);
});
