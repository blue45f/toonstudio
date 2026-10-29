import { createHash } from "node:crypto";
import { Color } from "three";
import { describe, expect, it } from "vitest";

import { mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { hybridDccRegisterAsset, hybridDccSetModifierStack } from "../hybrid-dcc/studio-hybrid-dcc-document";
import { commitStudioHybridDccFaceModeling } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-workspace";
import { pushPullStudioEditableMeshFaces } from "../hybrid-dcc/studio-hybrid-dcc-face-pushpull";
import { workspaceCommitObjectTransform, workspaceComponentSelectionSource, workspaceReconcileSelectionAfterHistory, workspaceRedo, workspaceUndo } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { withStudioMeshModifier } from "../studio-mesh-modifier-stack";
import { readStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { exportStudioBg3dFaceEditAsset } from "./studio-bg3d-face-edit-export";
import { createStudioBg3dFaceEditWorkspaceBase } from "./studio-bg3d-face-edit-workspace-base";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { readStudioBg3dPrimitiveEditAuthoringGlb } from "./studio-bg3d-primitive-edit-authoring-glb";
import { STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS, STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY } from "./studio-bg3d-primitive-edit-material-runtime";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";

import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import type { StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import type { StudioBg3dFaceEditWorkspaceBase } from "./studio-bg3d-face-edit-workspace-base";

const COLOR = "#2244aa";
function rights() { return { source: "원본 모델 권리 정보", creator: "원제작자", license: "시험 사용권",
  useScope: "원본과 같은 이용 범위", derivative: "선택 모델의 면 편집" }; }
function transform() {
  return { revision: 1, position: [7.25, 1.125, -2.5], rotationEulerRad: [0.21, -0.4, 0.72], scale: [1.8, 0.6, 2.6] } satisfies StudioHybridDccObjectTransform;
}
function box() {
  const result = convertStudioBg3dPrimitiveToEditableMesh({ id: "original-box", kind: "box" });
  if (!result.ok) throw Error(result.detail); return result.value.mesh;
}
function doubleMesh() {
  const result = pushPullStudioEditableMeshFaces(box(), [2], 0.12345678901234566);
  if (!result.ok) throw Error(result.detail); return result.value.mesh;
}
function base(mesh = doubleMesh()): StudioBg3dFaceEditWorkspaceBase {
  const result = createStudioBg3dFaceEditWorkspaceBase({ kind: "authored-model", displayName: "현재 모델 이름", assetId: "current-model-node",
    mesh, transform: transform(), rights: rights() });
  if (!result.ok) throw Error(result.messageKo); return result.value;
}
function edit(context: StudioBg3dFaceEditWorkspaceBase, workspace = context.workspace, distance = 0.25): StudioHybridDccWorkspace {
  const source = workspaceComponentSelectionSource(workspace);
  if (!source) throw Error("실제 작업공간의 면 선택 원본이 필요합니다.");
  const selection = workspaceReconcileSelectionAfterHistory(workspace, context.selection);
  const selected = mutateStudioHybridDccComponentSelection(selection, { mode: "face", operation: "replace", ids: [2], activeId: 2, source });
  if (!selected.ok) throw Error("실제 면 선택이 필요합니다.");
  return commitStudioHybridDccFaceModeling(workspace, selected.value, { tool: "push-pull", distance }).workspace;
}
function exported(context: StudioBg3dFaceEditWorkspaceBase, workspace: StudioHybridDccWorkspace) {
  const result = exportStudioBg3dFaceEditAsset(context, workspace, COLOR);
  if (!result.ok) throw Error(`${result.stage}: ${result.messageKo}`); return result;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw Error("GLB 객체가 필요합니다."); return value; }
function first(value: unknown): unknown { if (!Array.isArray(value) || !value.length) throw Error("GLB 배열이 필요합니다."); return value[0]; }

describe("공통 면 편집 작업공간·최종 자산 내보내기 계약", () => {
  it("원본 double 메시·TRS·권리 BOM의 내부 참조까지 분리하고 현재 모델 이름으로 등록한다", () => {
    const original = doubleMesh(), mesh = { ...original, vertices: original.vertices.map((vertex) => ({ ...vertex, position: { ...vertex.position } })) };
    const placement = transform(), attribution = rights(), before = JSON.stringify(mesh);
    const result = createStudioBg3dFaceEditWorkspaceBase({ kind: "authored-model", displayName: "현재 모델 이름", assetId: "current-model-node",
      mesh, transform: placement, rights: attribution });
    if (!result.ok) throw Error(result.messageKo);
    const context = result.value, local = context.workspace.session.state.geometry.records[context.assetId].mesh;
    expect(context.kind).toBe("authored-model"); expect(context.displayName).toBe("현재 모델 이름");
    expect(JSON.stringify(local)).toBe(before); expect(hashStudioEditableMesh(local)).toBe(context.initialMeshHash);
    expect(local.vertices).toHaveLength(8); expect(local.faces).toHaveLength(6);
    expect(local.vertices.some(({ position }) => Math.fround(position.y) !== position.y)).toBe(true);
    expect(local).not.toBe(mesh); expect(local.vertices[0].position).not.toBe(mesh.vertices[0].position);
    expect(context.initialTransform).toEqual(placement); expect(context.initialTransform.position).not.toBe(placement.position);
    expect(context.workspace.session.state.rightsBom).toEqual([{ assetId: context.assetId, ...attribution,
      contentHash: `sha256:${createHash("sha256").update(context.initialMeshHash).digest("hex")}` }]);
    mesh.vertices[0].position.x += 2; placement.position[0] += 10; attribution.license = "나중에 바꾼 입력";
    expect(JSON.stringify(local)).toBe(before); expect(context.initialTransform).toEqual(transform());
    expect(context.workspace.session.state.rightsBom[0].license).toBe("시험 사용권");
  });

  it("두 번 확정한 현재 record revision·hash·double 메시·TRS와 단색 PBR를 실제 codec/strict GLB에 함께 기록한다", async () => {
    const context = base(), workspace = edit(context, edit(context), 0.1111111111111111), before = JSON.stringify(workspace);
    const current = workspace.session.state.geometry.records[context.assetId], result = exported(context, workspace);
    expect(current.revision).toBe(context.workspace.session.state.geometry.records[context.assetId].revision + 2);
    expect(result.authoring.envelope.source).toMatchObject({ assetId: context.assetId, revision: current.revision, meshHash: current.meshHash });
    expect(result.authoring.mesh).toEqual(current.mesh); expect(result.authoring.envelope.objectTransformAtExport).toEqual(context.initialTransform);
    expect(result.authoring.envelope.coordinates).toEqual({ space: "object-local", units: "meters", upAxis: "Y", trsBaked: false });
    const read = readStudioBg3dPrimitiveEditAuthoringGlb(result.bytes);
    if (!read.ok) throw Error(read.messageKo);
    expect(read.value.mesh).toEqual(current.mesh); expect(read.value.envelope.source.revision).toBe(current.revision);
    expect(read.value.envelope.mesh.revision).toBe(1);
    expect(read.value.envelope.objectTransformAtExport).toEqual(context.initialTransform);
    const glb = readStudioVrmExportGlb(result.bytes), material = record(first(glb.json.materials));
    expect(record(material.pbrMetallicRoughness)).toEqual({ baseColorFactor: [...new Color(COLOR).toArray(), 1], roughnessFactor: 1, metallicFactor: 0 });
    expect(record(material.extras)[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]).toEqual(STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS);
    expect(record(record(glb.json.extras).toonSpectrum).provenance).toMatchObject({ sourceHash: current.meshHash, sourceRevision: current.revision });
    const hash = createHash("sha256").update(result.bytes).digest("hex");
    const verified = await validateStudioBg3dGlb(result.bytes, { declared: { byteSize: result.bytes.byteLength, sha256: hash },
      cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 }, profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES });
    expect(verified.ok).toBe(true); expect(JSON.stringify(workspace)).toBe(before);
    expect(workspace.session.state.rightsBom[0]).toMatchObject({ ...rights(), contentHash: `sha256:${createHash("sha256").update(current.meshHash).digest("hex")}` });
  });

  it("변경 없음·Undo 원복은 export 단계에서 거부하고 Redo는 authoring·재질을 포함한 전체 bytes를 정확히 복원한다", () => {
    const context = base(), workspace = edit(context), first = exported(context, workspace);
    for (const unchanged of [context.workspace, workspaceUndo(workspace)]) {
      const result = exportStudioBg3dFaceEditAsset(context, unchanged, COLOR);
      expect(result).toMatchObject({ ok: false, stage: "export", messageKo: expect.stringContaining("변경이 없습니다") });
      expect("bytes" in result).toBe(false);
    }
    const repeated = exported(context, workspace), redone = exported(context, workspaceRedo(workspaceUndo(workspace)));
    expect(repeated.bytes).toEqual(first.bytes); expect(redone.bytes).toEqual(first.bytes);
    expect(redone.authoring.envelope).toEqual(first.authoring.envelope);
  });

  it.each(["active-object", "extra-object", "object-transform", "modifier"])("%s를 조용히 버리지 않고 공통 export 단계에서 중단한다", (mode) => {
    const context = base(); let workspace = edit(context);
    if (mode === "active-object") workspace = { ...workspace, activeAssetId: null };
    if (mode === "extra-object") workspace = { ...workspace, session: hybridDccRegisterAsset(workspace.session, "foreign-asset", box(), rights()) };
    if (mode === "object-transform") workspace = workspaceCommitObjectTransform(workspace, context.assetId, { ...context.initialTransform, position: [0, 0, 0] });
    if (mode === "modifier") {
      const record = workspace.session.state.geometry.records[context.assetId];
      const stack = withStudioMeshModifier(record.modifierStack, { id: "unapplied-solidify", kind: "solidify", enabled: true,
        thickness: 0.1, evenThickness: true, rim: true });
      workspace = { ...workspace, session: hybridDccSetModifierStack(workspace.session, context.assetId, stack) };
    }
    const before = JSON.stringify(workspace), result = exportStudioBg3dFaceEditAsset(context, workspace, COLOR);
    expect(result).toMatchObject({ ok: false, stage: "export" }); expect("bytes" in result).toBe(false);
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it("잘못된 색은 material 단계, 유효한 GLB지만 authoring 한도 밖인 메시에는 authoring 단계의 실패만 반환한다", () => {
    const context = base(), invalidColor = exportStudioBg3dFaceEditAsset(context, edit(context), "red");
    expect(invalidColor).toMatchObject({ ok: false, stage: "material" }); expect("bytes" in invalidColor).toBe(false);
    const soup = serializeStudioEditableMesh(box()), positions: StudioMeshVec3[] = [], faces: number[][] = [];
    // 513개의 닫힌 상자는 일반 exporter 한도 안이지만 authoring의 4096 정점 ceiling을 넘는다.
    for (let index = 0; index < 513; index += 1) {
      const start = positions.length;
      for (const [x, y, z] of soup.positions) positions.push({ x: x + index * 2, y, z });
      for (const face of soup.faces) faces.push(face.map((id) => start + id));
    }
    const large = base(createStudioEditableMeshFromPolygons(positions, faces)), workspace = edit(large);
    expect(workspace.session.state.geometry.records[large.assetId].mesh.vertices.length).toBeGreaterThan(4096);
    const result = exportStudioBg3dFaceEditAsset(large, workspace, COLOR);
    expect(result).toMatchObject({ ok: false, stage: "authoring", messageKo: expect.stringContaining("한도") });
    expect("bytes" in result).toBe(false);
  });
});
