import { describe, expect, it, vi } from "vitest";

import {
  createStudioBg3dOrganizationController,
  type StudioBg3dOrganizationResult,
} from "./studio-bg3d-organization-controller";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { buildStudioBg3dOrganizationView } from "./studio-bg3d-scene-organization";

import type { StudioBg3dOrganizationAction } from "./studio-bg3d-organization-mutation";

function setup() {
  const apply = vi.fn<(action: StudioBg3dOrganizationAction) => StudioBg3dOrganizationResult>(() => ({ ok: true }));
  const selectEntities = vi.fn();
  const view = buildStudioBg3dOrganizationView({
    entities: [{ id: "a", tags: ["벽"] }],
    document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  });
  const skpSourceByEntityId = new Map([["a", { contentHash: `sha256:${"0".repeat(64)}`, name: "의자.skp" }]]);
  const controller = createStudioBg3dOrganizationController({ view, skpSourceByEntityId, apply, selectEntities });
  return { apply, selectEntities, view, skpSourceByEntityId, controller };
}

describe("createStudioBg3dOrganizationController", () => {
  it("읽기 모델과 .skp 원본 정보를 그대로 노출하고 얼린다", () => {
    const { controller, view, skpSourceByEntityId } = setup();
    expect(controller.view).toBe(view);
    expect(controller.skpSourceByEntityId).toBe(skpSourceByEntityId);
    expect(Object.isFrozen(controller)).toBe(true);
  });

  it("태그 명령을 기존 변경 경로의 액션으로 옮긴다", () => {
    const { controller, apply } = setup();
    controller.addTag(["a", "b"], "교실");
    controller.removeTag(["a"], "벽");
    controller.toggleTagVisibility("벽");
    expect(apply.mock.calls.map(([action]) => action)).toEqual([
      { type: "add-tag", ids: ["a", "b"], tag: "교실" },
      { type: "remove-tag", ids: ["a"], tag: "벽" },
      { type: "toggle-tag-visibility", tag: "벽" },
    ]);
  });

  it("컴포넌트와 장면 정보 명령을 액션으로 옮기고 넘기지 않은 키는 보내지 않는다", () => {
    const { controller, apply } = setup();
    controller.groupComponent(["a"], "의자");
    controller.ungroupComponent(["a"]);
    controller.renameComponent("comp-1", "책상");
    controller.setSceneMeta({ name: "교실" });
    controller.setSceneMeta({ memo: "" });
    expect(apply.mock.calls.map(([action]) => action)).toEqual([
      { type: "group-component", ids: ["a"], name: "의자" },
      { type: "ungroup-component", ids: ["a"] },
      { type: "rename-component", componentId: "comp-1", name: "책상" },
      { type: "set-scene-meta", name: "교실" },
      { type: "set-scene-meta", memo: "" },
    ]);
  });

  it("apply 의 결과를 그대로 돌려주고 선택은 주입된 함수로 위임한다", () => {
    const { controller, apply, selectEntities } = setup();
    apply.mockReturnValueOnce({ ok: false, reason: "limit-exceeded" });
    expect(controller.addTag(["a"], "x")).toEqual({ ok: false, reason: "limit-exceeded" });
    controller.selectEntities(["a", "b"]);
    expect(selectEntities).toHaveBeenCalledWith(["a", "b"]);
  });
});
