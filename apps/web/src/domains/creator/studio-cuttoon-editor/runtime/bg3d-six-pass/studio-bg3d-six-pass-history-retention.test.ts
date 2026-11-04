import { expect, it } from "vitest";
import { createBg3dBundleProjectFixture } from "../../../bg3d/studio-bg3d-bundle-project.test-fixture";
import { retainStudioBg3dSixPassHistory } from "./studio-bg3d-six-pass-history-retention";
import type { PageState } from "../../../studio-page-state";

it("첫 삽입 이전 undo snapshot에도 원본을 보존하고 active만 null로 남긴다", async () => {
  const fixture = await createBg3dBundleProjectFixture();
  const inserted: PageState = fixture.project.pagesList[0];
  const before: PageState = { ...inserted, elements: [], bg3dLtBundles: undefined };
  const previous = [[before]], next = [...previous, [inserted]];
  const history = retainStudioBg3dSixPassHistory(previous, next);
  expect(history[0][0].elements).toEqual([]);
  expect(history[0][0].bg3dLtBundles?.bundles[0]).toMatchObject({ activeRevisionId: null, revisions: [fixture.manifest] });
  expect(history[1][0].bg3dLtBundles?.bundles[0].activeRevisionId).toBe(fixture.manifest.renderRevisionId);
  expect(before.bg3dLtBundles).toBeUndefined();
  expect(retainStudioBg3dSixPassHistory(history, history)).toBe(history);
});
it("recapture·undo·redo·history trim에서도 stable 원본과 artist presentation을 유지한다", async () => {
  const fixture = await createBg3dBundleProjectFixture(true), second: PageState = fixture.project.pagesList[0];
  const bundle = fixture.state.bundles[0], original = bundle.revisions[0];
  const first: PageState = { ...second, elements: second.elements.map((element) => ({ ...element, x: 52, name: "작가 표시명" })),
    bg3dLtBundles: { ...fixture.state, bundles: [{ ...bundle, activeRevisionId: original.renderRevisionId, revisions: [original] }] } };
  const previous = [[first]], next = [...previous, [second]];
  const history = retainStudioBg3dSixPassHistory(previous, next);
  expect(history[0][0].bg3dLtBundles?.bundles[0]).toMatchObject({ activeRevisionId: original.renderRevisionId, revisions: bundle.revisions });
  expect(history[0][0].elements).toBe(first.elements);
  expect(history[0][0].elements[0]).toMatchObject({ x: 52, name: "작가 표시명", opacity: .5, hidden: true, blendMode: "multiply" });
  const trimmed = retainStudioBg3dSixPassHistory(history, history.slice(1));
  expect(trimmed[0][0].bg3dLtBundles?.bundles[0].revisions).toHaveLength(2);
  expect(trimmed[0][0].bg3dLtBundles?.bundles[0].activeRevisionId).toBe(bundle.activeRevisionId);
});
it("동일 page id의 새 문서 완전 교체에 이전 원본을 섞거나 삭제한 페이지를 되살리지 않는다", async () => {
  const fixture = await createBg3dBundleProjectFixture(), page: PageState = fixture.project.pagesList[0];
  const previous = [[page]], replacement = [[{ ...page, elements: [], bg3dLtBundles: undefined }]];
  expect(retainStudioBg3dSixPassHistory(previous, replacement)).toBe(replacement);
  const deleted = [...previous, []];
  expect(retainStudioBg3dSixPassHistory(previous, deleted)[1]).toEqual([]);
});
