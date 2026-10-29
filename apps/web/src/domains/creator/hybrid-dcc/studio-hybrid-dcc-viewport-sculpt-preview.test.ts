import { describe, expect, it } from "vitest";
import { serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { createStudioHybridDccSculptStrokeSession } from "./studio-hybrid-dcc-sculpt-stroke-workspace";
import { appendStudioSculptStrokeSample } from "./studio-hybrid-dcc-sculpt-stroke-session";
import { deriveStudioHybridDccViewportSnapshot } from "./studio-hybrid-dcc-viewport-snapshot";
import { workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

function fixture(legacy = false) {
  const initial = workspaceUnwrapUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("sculpt-preview"), "cube"));
  const workspace: StudioHybridDccWorkspace = legacy ? { ...initial, session: { ...initial.session,
    state: { ...initial.session.state, objectTransforms: {} } } } : initial;
  const record = workspace.session.state.geometry.records.cube;
  if (!record) throw new Error("조형 원본 fixture가 없습니다.");
  const session = createStudioHybridDccSculptStrokeSession(workspace, { kind: "grab", radius: 4, strength: .2, direction: { x: 0, y: 0, z: 1 } });
  const step = appendStudioSculptStrokeSample(session, { x: -.5, y: -.5, z: -.5 });
  if (!step.ok || !step.preview) throw new Error("조형 fixture의 실제 preview를 만들지 못했습니다.");
  return { workspace, record, preview: step.preview };
}
describe("문서 mutation 없는 Sculpt 표시 projection", () => {
  it("실제 session preview의 공통 triangle·UV·normal buffer를 표시하고 원본 authority는 그대로 둔다", () => {
    const { workspace, record, preview } = fixture();
    const state = workspace.session.state, journal = workspace.session.commandJournal;
    const source = serializeStudioEditableMesh(record.mesh);
    const snapshot = deriveStudioHybridDccViewportSnapshot(workspace, "object", true, undefined, preview);
    expect(snapshot.errors).toEqual([]); expect(snapshot.warnings).toEqual([]);
    const asset = snapshot.assets[0]; if (!asset) throw new Error("조형 표시 결과가 없습니다.");
    const plan = inspectStudioMeshSurfaceForInteractiveProjection(preview.mesh);
    if (!plan.ok) throw new Error(plan.message);
    const expected = projectStudioMeshSurfaceForRender(preview.mesh, plan.value.plan);
    expect(asset.renderSource).toBe("sculpt-preview"); expect(asset.renderHash).toBe(preview.meshHash);
    expect(asset.positions).toBe(expected.positions); expect(asset.indices).toBe(expected.indices);
    expect(asset.cornerUvs).toEqual(expected.cornerUvs); expect(asset.cornerNormals).toEqual(expected.cornerNormals);
    expect(asset.mesh).toBe(record.mesh); expect(asset.meshHash).toBe(record.meshHash); expect(asset.meshRevision).toBe(record.revision);
    expect(workspace.session.state).toBe(state); expect(workspace.session.commandJournal).toBe(journal);
    expect(serializeStudioEditableMesh(record.mesh)).toEqual(source);
  });
  it.each(["identity", "source-hash", "revision", "candidate-hash"] as const)("%s가 다른 preview는 원본 cage로 돌아가고 경고한다", (kind) => {
    const { workspace, record, preview } = fixture();
    const invalid = kind === "identity" ? { ...preview, sourceMesh: { ...record.mesh } }
      : kind === "source-hash" ? { ...preview, sourceMeshHash: "mesh:00000000" }
        : kind === "revision" ? { ...preview, sourceMeshRevision: record.revision + 1 }
          : { ...preview, meshHash: "mesh:00000000" };
    const before = deriveStudioHybridDccViewportSnapshot(workspace, "object", true);
    const after = deriveStudioHybridDccViewportSnapshot(workspace, "object", true, undefined, invalid);
    expect(after.errors).toEqual([]); expect(after.warnings).toHaveLength(1);
    expect(after.assets[0]?.renderSource).toBe("authority-edit-cage");
    expect(after.assets[0]?.positions).toBe(before.assets[0]?.positions);
    expect(after.assets[0]?.renderHash).toBe(record.meshHash);
  });
  it.each([false, true])("canonical/legacy=%s에서도 그리는 동안 표시 TRS를 원본 위치에 고정한다", (legacy) => {
    const { workspace, preview } = fixture(legacy);
    const before = deriveStudioHybridDccViewportSnapshot(workspace, "object", true).assets[0];
    const after = deriveStudioHybridDccViewportSnapshot(workspace, "object", true, undefined, preview).assets[0];
    if (!before || !after) throw new Error("조형 TRS 표시 결과가 없습니다.");
    expect(after.renderSource).toBe("sculpt-preview"); expect(after.positions).not.toEqual(before.positions);
    expect(after.position).toEqual(before.position); expect(after.rotationEulerRad).toEqual(before.rotationEulerRad); expect(after.scale).toEqual(before.scale);
    expect(after.worldMin).not.toEqual(before.worldMin);
    if (legacy) expect(workspace.session.state.objectTransforms).toEqual({});
  });
  it("비활성 asset의 preview나 명시 source 검사 없는 요청은 임시 후보를 채택하지 않는다", () => {
    const { workspace, preview } = fixture();
    expect(deriveStudioHybridDccViewportSnapshot({ ...workspace, activeAssetId: null }, "object", true, undefined, preview).assets[0]?.renderSource).toBe("authority-edit-cage");
    expect(deriveStudioHybridDccViewportSnapshot(workspace, "object", false, undefined, preview).assets[0]?.renderSource).not.toBe("sculpt-preview");
  });
});
