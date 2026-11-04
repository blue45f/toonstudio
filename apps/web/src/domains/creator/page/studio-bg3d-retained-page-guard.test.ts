import { expect, it } from "vitest";
import { createBg3dBundleProjectFixture } from "../bg3d/studio-bg3d-bundle-project.test-fixture";
import { studioBg3dRetainedPageRemovalReason } from "./studio-page-set-commit-admission";
import type { PageState } from "../studio-page-state";

it("native 원본 페이지 제거와 전역 교체를 거부하고 동일 페이지의 레이어 비우기는 허용한다", async () => {
  const fixture = await createBg3dBundleProjectFixture(), native: PageState = fixture.project.pagesList[0];
  const ordinary: PageState = { id: "ordinary", elements: [], bg: "#fff", bgGrad: null, canvasH: 1080 };
  expect(studioBg3dRetainedPageRemovalReason([native, ordinary], [ordinary])).toContain("전체 삭제는 아직 지원하지 않습니다");
  expect(studioBg3dRetainedPageRemovalReason([native], [])).toContain("전체 삭제는 아직 지원하지 않습니다");
  expect(studioBg3dRetainedPageRemovalReason([native], [{ ...native, elements: [] }])).toBeNull();
  expect(studioBg3dRetainedPageRemovalReason([native, ordinary], [native])).toBeNull();
});
it("첫 삽입 undo로 레이어가 없는 retained 페이지도 보호하고 일반 페이지 삭제는 유지한다", async () => {
  const fixture = await createBg3dBundleProjectFixture(), native: PageState = { ...fixture.project.pagesList[0], elements: [] };
  const ordinary: PageState = { id: "ordinary", elements: [], bg: "#fff", bgGrad: null, canvasH: 1080 };
  expect(studioBg3dRetainedPageRemovalReason([native, ordinary], [ordinary])).not.toBeNull();
  expect(studioBg3dRetainedPageRemovalReason([ordinary], [])).toBeNull();
});
