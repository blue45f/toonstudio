import type { PageState } from "../studio-page-state";
import { expect, it } from "vitest";
import * as Y from "yjs";
import { createBg3dBundleProjectFixture } from "../bg3d/studio-bg3d-bundle-project.test-fixture";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { asStudioCrdtDocumentHost } from "./studio-crdt-document-host";
import { publishStudioCrdtSceneGraphDiff } from "./studio-crdt-scene-publisher";
import { STUDIO_BG3D_BUNDLE_REVISIONS_ROOT, STUDIO_BG3D_BUNDLE_ACTIVE_ROOT } from "./studio-crdt-bg3d-bundle-refs";
import { studioCrdtElementToSceneElement } from "./studio-crdt-page-bridge";

it("본문 없는 작은 revision 참조와 여섯 역할·artist presentation을 같은 Y 전이로 보존한다", async () => {
  const f = await createBg3dBundleProjectFixture(), document = new StudioCrdtDocument();
  const page: PageState = { ...f.project.pagesList[0], elements: f.project.pagesList[0].elements.map((el) => el.type === "image" ? { ...el, bg3dLtRenderMode: "separated" as const } : el), groups: [{ id: "group-1", name: "6패스" }] };
  const doc = asStudioCrdtDocumentHost(document).doc;
  const vector = Y.encodeStateVector(doc);
  doc.transact(() => publishStudioCrdtSceneGraphDiff(document, [], [page]));
  const update = Y.encodeStateAsUpdate(doc, vector);
  expect(update.byteLength).toBeLessThan(47 * 1024);
  expect(new TextDecoder().decode(update)).not.toContain("data:image/png");
  expect(document.getSceneElements()).toHaveLength(6);
  expect(document.getPages()[0].bg3dLtBundleReferences?.active["bundle-1"]).toBe("rev-1");
  for (const record of document.getSceneElements()) {
    const element = page.elements.find(({ id }) => id === record.id)!;
    const projected = studioCrdtElementToSceneElement(record, element);
    expect(projected).toMatchObject({ id: element.id, type: "image", src: Reflect.get(element, "src"), opacity: .5, hidden: true, blendMode: "multiply" });
  }
  document.destroy();
});
it("삽입 실행취소는 revision 본문 참조를 보존하고 활성 포인터만 해제하며 다시 실행할 수 있다", async () => {
  const f = await createBg3dBundleProjectFixture(), document = new StudioCrdtDocument();
  const page: PageState = { ...f.project.pagesList[0], elements: f.project.pagesList[0].elements.map((el) => el.type === "image" ? { ...el, bg3dLtRenderMode: "separated" as const } : el), groups: [{ id: "group-1", name: "6패스" }] };
  const base: PageState = { ...page, elements: [], groups: [], bg3dLtBundles: undefined, shared3dStage: undefined, linked3dRender: undefined };
  publishStudioCrdtSceneGraphDiff(document, [base], [page]);
  publishStudioCrdtSceneGraphDiff(document, [page], [base]);
  const doc = asStudioCrdtDocumentHost(document).doc;
  expect(doc.getMap(STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).size).toBe(1);
  expect(doc.getMap(STUDIO_BG3D_BUNDLE_ACTIVE_ROOT).get(JSON.stringify([page.id, "bundle-1"]))).toBe("");
  publishStudioCrdtSceneGraphDiff(document, [base], [page]);
  expect(document.getPages()[0].bg3dLtBundleReferences?.active["bundle-1"]).toBe("rev-1");
  expect(document.getSceneElements()).toHaveLength(6); document.destroy();
});
it("불변 revision 교체와 전체 전이 예산 초과는 실제 문서 변경 전에 거부한다", async () => {
  const f = await createBg3dBundleProjectFixture(), document = new StudioCrdtDocument();
  const page: PageState = { ...f.project.pagesList[0], elements: f.project.pagesList[0].elements.map((el) => el.type === "image" ? { ...el, bg3dLtRenderMode: "separated" as const } : el), groups: [{ id: "group-1", name: "6패스" }] };
  publishStudioCrdtSceneGraphDiff(document, [], [page]);
  const doc = asStudioCrdtDocumentHost(document).doc, before = Y.encodeStateAsUpdate(doc);
  const damaged = structuredClone(page); damaged.bg3dLtBundles!.bundles[0].revisions[0].width = 2;
  expect(() => publishStudioCrdtSceneGraphDiff(document, [page], [damaged])).toThrow(/교체/);
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  const many = Array.from({ length: 30 }, (_, index) => ({ ...page, id: `page-big-${index}`, elements: [], groups: [], bg3dLtBundles: undefined,
    shared3dStage: undefined, linked3dRender: undefined, note: "가".repeat(2100) }));
  expect(() => publishStudioCrdtSceneGraphDiff(document, [page], [page, ...many])).toThrow(/예산/);
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before); document.destroy();
});
