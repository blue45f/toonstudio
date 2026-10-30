/** 과거 해시를 검증하는 테스트 입력은 현재 도구의 기본값에 의존하지 않는다. */
import type { StudioMeshArrayModifier, StudioMeshSolidifyModifier } from "../studio-mesh-modifier-stack";

import { hybridDccSetModifierStack } from "./studio-hybrid-dcc-document";
import { workspaceRefreshModifierPreviews } from "./studio-hybrid-dcc-modifier-workspace";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube } from "./studio-hybrid-dcc-workspace";

export async function createPreSliceArraySolidifyWorkspace() {
  let workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("legacy-modifier-preview"), "cube");
  const array: StudioMeshArrayModifier = {
    kind: "array", id: "modifier-array", enabled: true, count: 3,
    offset: { x: 1.25, y: 0, z: 0 }, mode: "linear", radialAngleRad: Math.PI * 2,
    realizeInstances: true,
  };
  const solidify: StudioMeshSolidifyModifier = {
    kind: "solidify", id: "modifier-solidify", enabled: true,
    thickness: 0.08, evenThickness: true, rim: true,
  };
  // offset/상대 간격 필드가 없었던 문서의 명령 수·stack 해시를 그대로 재현한다.
  for (const modifiers of [[array], [array, solidify]]) {
    workspace = { ...workspace, session: hybridDccSetModifierStack(workspace.session, "cube", modifiers) };
  }
  return workspaceRefreshModifierPreviews(workspace);
}
