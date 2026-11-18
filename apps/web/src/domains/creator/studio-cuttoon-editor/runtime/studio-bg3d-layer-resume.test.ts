import { describe, expect, it } from "vitest";

import { createStudioLinked3dRenderPageFixture } from "../../studio-linked-3d-render-test-fixture";
import { readStudioBg3dHistoryTarget, resolveStudioBg3dHistoryTarget } from "./studio-bg3d-layer-resume";

describe("3D 배경 재편집 항목 복구", () => {
  const page = createStudioLinked3dRenderPageFixture();
  const layer = page.elements[0]!;
  const scope = JSON.stringify(["creator", "work:manuscript", "room"]);
  const target = { scope, pageId: page.id, layerId: layer.id };

  it("같은 원고의 정확한 페이지와 레이어에서 최신 정본을 다시 읽는다", () => {
    expect(resolveStudioBg3dHistoryTarget(target, scope, [{ ...page, id: "another-page" }, page], false, true))
      .toMatchObject({ pageId: page.id, layerId: layer.id, source: { scene: layer.type === "image" ? layer.bg3dScene : null } });
  });

  it("새 배경 진입과 손상된 기존 레이어 기록을 구분한다", () => {
    expect(readStudioBg3dHistoryTarget({})).toBeUndefined();
    expect(readStudioBg3dHistoryTarget({ studioBg3dEditTarget: null })).toBeNull();
    expect(readStudioBg3dHistoryTarget({ studioBg3dEditTarget: target })).toBe(target);
  });

  it.each([
    ["다른 계정", JSON.stringify(["other", "work:manuscript", "room"])],
    ["다른 원고", JSON.stringify(["creator", "work:other", "room"])],
    ["다른 룸", JSON.stringify(["creator", "work:manuscript", "other"])],
  ])("%s의 같은 레이어 ID를 거부한다", (_name, differentScope) => {
    expect(resolveStudioBg3dHistoryTarget(target, differentScope, [page], false, true)).toBeNull();
  });

  it("원고 쓰기 권한 철회, 페이지 검토 잠금, 레이어 잠금 이후에는 대상을 열지 않는다", () => {
    expect(resolveStudioBg3dHistoryTarget(target, scope, [page], true, true)).toBeNull();
    expect(resolveStudioBg3dHistoryTarget(target, scope, [
      { ...page, review: { status: "approved", locked: true } },
    ], false, true)).toBeNull();
    expect(resolveStudioBg3dHistoryTarget(target, scope, [
      { ...page, elements: [{ ...layer, locked: true }] },
    ], false, true)).toBeNull();
  });

  it("삭제·중복 페이지/레이어와 3D 원본이 없는 이미지를 거부한다", () => {
    expect(resolveStudioBg3dHistoryTarget(target, scope, [], false, true)).toBeNull();
    expect(resolveStudioBg3dHistoryTarget(target, scope, [page, page], false, true)).toBeNull();
    for (const elements of [[], [layer, layer], [{ ...layer, bg3dScene: undefined, src: "plain.png" }]]) {
      expect(resolveStudioBg3dHistoryTarget(target, scope, [{ ...page, elements }], false, true)).toBeNull();
    }
  });
});
