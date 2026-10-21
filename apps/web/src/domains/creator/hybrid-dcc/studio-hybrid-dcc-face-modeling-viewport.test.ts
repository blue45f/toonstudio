// @vitest-environment jsdom

/**
 * 면 모델링 미리보기가 실제 뷰포트의 투영 경로를 통과하는지 본다. 뷰포트는 미리보기 작업공간을 그대로 받아
 * `deriveStudioHybridDccViewportSnapshot` 으로 화면용 메시를 만들므로, 이 함수가 오류 없이 받아 주면
 * 미리보기는 (WebGL 캔버스를 제외하면) 같은 검증을 통과한 것이다.
 */
import { describe, expect, it } from "vitest";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import {
  commitStudioHybridDccFaceModeling,
  previewStudioHybridDccFaceModeling,
  type StudioFaceModelingRequest,
} from "./studio-hybrid-dcc-face-modeling-workspace";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { deriveStudioHybridDccViewportSnapshot } from "./StudioHybridDccViewportCore";

const TOP = 3;

function cubeWorkspace(): StudioHybridDccWorkspace {
  return workspaceAddUnitCube(createStudioHybridDccWorkspace("face-modeling-viewport"), "cube");
}

function selectionOf(workspace: StudioHybridDccWorkspace, ids: readonly number[]): StudioHybridDccComponentSelection {
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids,
    activeId: ids.at(-1),
    source: workspaceComponentSelectionSource(workspace)!,
  });
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join(" · "));
  return result.value;
}

describe("면 모델링 미리보기와 실제 뷰포트 투영", () => {
  const SQUARE = [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]] as const;
  const REQUESTS: readonly (readonly [string, StudioFaceModelingRequest])[] = [
    ["밀기", { tool: "push-pull", distance: 0.25 }],
    ["당기기", { tool: "push-pull", distance: -0.3 }],
    ["안쪽 테두리", { tool: "inset", distance: 0.1 }],
    ["안쪽 오프셋", { tool: "offset", distance: 0.1, direction: "inward" }],
    ["면 그리기", { tool: "draw", points: SQUARE }],
  ];

  it.each(REQUESTS)("%s 미리보기 작업공간을 실제 뷰포트 스냅샷 유도가 오류 없이 받아 준다", (_name, request) => {
    const workspace = cubeWorkspace();
    const preview = previewStudioHybridDccFaceModeling(workspace, selectionOf(workspace, [TOP]), request);
    if (!preview.ok) throw new Error(preview.detail);
    for (const mode of ["object", "face"] as const) {
      const snapshot = deriveStudioHybridDccViewportSnapshot(preview.value.workspace, mode);
      expect(snapshot.errors, `errors (${mode})`).toEqual([]);
      expect(snapshot.warnings, `warnings (${mode})`).toEqual([]);
      expect(snapshot.assets).toHaveLength(1);
      expect(snapshot.assets[0]!.meshHash).toBe(preview.value.workspace.session.state.geometry.records.cube!.meshHash);
      expect(snapshot.assets[0]!.triangleCount).toBeGreaterThanOrEqual(12);
    }
  });

  it("그린 면을 다시 오프셋·당기는 연쇄 미리보기도 뷰포트가 받아 준다", () => {
    let workspace = cubeWorkspace();
    let selection = selectionOf(workspace, [TOP]);
    for (const request of [
      { tool: "draw", points: SQUARE },
      { tool: "offset", distance: 0.05, direction: "outward" },
      { tool: "inset", distance: 0.02 },
    ] satisfies StudioFaceModelingRequest[]) {
      const result = commitStudioHybridDccFaceModeling(workspace, selection, request);
      workspace = result.workspace;
      selection = result.selection!;
    }
    const pit = previewStudioHybridDccFaceModeling(workspace, selection, { tool: "push-pull", distance: -0.1 });
    if (!pit.ok) throw new Error(pit.detail);
    const snapshot = deriveStudioHybridDccViewportSnapshot(pit.value.workspace, "face");
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.assets).toHaveLength(1);
  });
});
