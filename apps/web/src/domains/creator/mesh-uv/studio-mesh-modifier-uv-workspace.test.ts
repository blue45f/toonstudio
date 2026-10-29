import { describe, expect, it } from "vitest";

import { handoffStudioHybridDccWorkspaceToBg3d, type StudioHybridDccBg3dHandoffPorts, type StudioHybridDccBg3dPersistRequest } from "../hybrid-dcc/studio-hybrid-dcc-bg3d-handoff";
import { workspaceAddActiveModifier, workspaceApplyActiveModifierStack, workspacePatchActiveModifier, workspaceRedoWithModifierPreviews, workspaceUndoWithModifierPreviews } from "../hybrid-dcc/studio-hybrid-dcc-modifier-workspace";
import { workspaceUnwrapUvActive } from "../hybrid-dcc/studio-hybrid-dcc-uv-edit";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "../hybrid-dcc/studio-hybrid-dcc-workfile";
import { hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { hashStudioMeshUvLayer } from "./studio-mesh-uv-authority";

interface GltfUvOutput {
  readonly meshes: readonly { readonly primitives: readonly { readonly attributes: { readonly TEXCOORD_0?: number } }[] }[];
  readonly accessors: readonly { readonly bufferView: number; readonly count: number }[];
  readonly bufferViews: readonly { readonly byteOffset: number; readonly byteLength: number }[];
}

function uvStream(bytes: Uint8Array): readonly number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength))) as GltfUvOutput;
  const index = json.meshes[0]?.primitives[0]?.attributes.TEXCOORD_0;
  expect(index).toBeDefined();
  if (index === undefined) throw new Error("GLB UV accessor가 없습니다.");
  const accessor = json.accessors[index]!;
  const buffer = json.bufferViews[accessor.bufferView]!;
  expect(buffer.byteLength).toBe(accessor.count * 8);
  const offset = 20 + jsonLength + 8 + buffer.byteOffset;
  return Array.from({ length: accessor.count * 2 }, (_, component) => view.getFloat32(offset + component * 4, true));
}

describe("UV 모디파이어의 실제 작업공간 전달", () => {
  it("Array 미리보기·적용·단일 undo/redo·작업파일 재진입이 UV 정본을 함께 유지한다", async () => {
    const original = workspaceUnwrapUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-array-apply"), "cube"));
    const originalRecord = original.session.state.geometry.records.cube!;
    const originalSnapshot = serializeStudioEditableMesh(originalRecord.mesh);
    const preview = await workspaceAddActiveModifier(original, "array");
    expect(preview.session.state.geometry.records.cube!.mesh).toBe(originalRecord.mesh);
    const previewHash = preview.session.state.geometry.records.cube!.renderCache!.derivedFromHash;
    const beforeApply = preview.session.state.commandCount;
    const applied = await workspaceApplyActiveModifierStack(preview);
    const appliedRecord = applied.session.state.geometry.records.cube!;
    expect(applied.session.state.commandCount).toBe(beforeApply + 1);
    expect(appliedRecord.modifierStack.modifiers).toEqual([]);
    expect(appliedRecord.meshHash).toBe(previewHash);
    expect(appliedRecord.mesh.uvLayer?.corners.length).toBe(108);
    expect(appliedRecord.mesh.uvLayer!.topologyHash).not.toBe(originalRecord.mesh.uvLayer!.topologyHash);
    expect(hashStudioEditableMesh(appliedRecord.mesh)).toBe(appliedRecord.meshHash);
    const undone = await workspaceUndoWithModifierPreviews(applied);
    expect(undone.session.state.geometry.records.cube!.mesh.uvLayer).toEqual(originalRecord.mesh.uvLayer);
    expect(undone.session.state.geometry.records.cube!.modifierStack.modifiers).toHaveLength(1);
    const redone = await workspaceRedoWithModifierPreviews(undone);
    expect(redone.session.state.geometry.records.cube!.meshHash).toBe(appliedRecord.meshHash);
    const imported = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(redone), { documentId: "uv-array-import" });
    expect(hashStudioMeshUvLayer(imported.session.state.geometry.records.cube!.mesh.uvLayer!)).toBe(hashStudioMeshUvLayer(appliedRecord.mesh.uvLayer!));
    expect(serializeStudioEditableMesh(originalRecord.mesh)).toEqual(originalSnapshot);
  });

  it("UV 있는 Array 결과를 실제 BG3D handoff GLB의 TEXCOORD_0로 전달한다", async () => {
    const original = workspaceUnwrapUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-array-handoff"), "cube"));
    let preview = await workspaceAddActiveModifier(original, "array");
    const modifierId = preview.session.state.geometry.records.cube!.modifierStack.modifiers[0]!.id;
    preview = await workspacePatchActiveModifier(preview, modifierId, { count: 2 });
    const persisted: StudioHybridDccBg3dPersistRequest[] = [];
    const ports: StudioHybridDccBg3dHandoffPorts = {
      glbExportExecutionBackend: "direct",
      persistAttachments: async (requests) => {
        persisted.push(...requests);
        return requests.map((request) => ({ assetId: request.assetId, attachment: {
          id: request.attachmentId, name: request.fileName, mime: "model/gltf-binary" as const,
          byteSize: request.bytes.byteLength, hash: request.expectedSha256, rights: request.rights,
          source: "local-library" as const,
          generic3dWorkflow: { version: 1 as const, classification: "prop" as const, sourceFormat: "glb" as const },
        } }));
      },
    };
    const result = await handoffStudioHybridDccWorkspaceToBg3d(preview, { ports });
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]!.sourceGeometryKind).toBe("evaluated-modifier-stack");
    expect(persisted).toHaveLength(1);
    const values = uvStream(persisted[0]!.bytes);
    expect(values.length).toBeGreaterThan(0);
    const sourcePairs = new Set(original.session.state.geometry.records.cube!.mesh.uvLayer!.corners.map(({ u, v }) => `${u}|${Math.fround(1 - v)}`));
    for (let index = 0; index < values.length; index += 2) expect(sourcePairs.has(`${values[index]}|${values[index + 1]}`)).toBe(true);
    expect(preview.session.state.geometry.records.cube!.mesh.uvLayer).toBe(original.session.state.geometry.records.cube!.mesh.uvLayer);
  });
});
