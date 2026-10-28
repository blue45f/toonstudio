// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioEditableMeshFromPolygons } from "../studio-editable-half-edge-mesh";

import {
  handoffStudioHybridDccWorkspaceToBg3d,
  type StudioHybridDccBg3dPersistRequest,
} from "./studio-hybrid-dcc-bg3d-handoff";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import {
  createStudioHybridDccWorkspace,
  synchronizeWorkspaceGeometryAuthority,
  workspaceAddUnitCube,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import {
  decodeStudioHybridDccWorkspacePersistenceEnvelope,
  encodeStudioHybridDccWorkspacePersistenceEnvelope,
} from "./studio-hybrid-dcc-workspace-persistence";
import { StudioHybridDccPanel } from "./StudioHybridDccPanel";

const SCOPE = { userId: "placement-test-user", workId: "placement-test-work" };

function geometry(workspace: StudioHybridDccWorkspace) {
  const id = workspace.activeAssetId;
  if (!id || !workspace.session.state.geometry.records[id]) throw new Error("활성 원본 메시가 없습니다.");
  return workspace.session.state.geometry.records[id]!;
}

function bounds(positions: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index++) {
    const axis = index % 3;
    min[axis] = Math.min(min[axis]!, positions[index]!);
    max[axis] = Math.max(max[axis]!, positions[index]!);
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]!) };
}

function evaluatedBounds(workspace: StudioHybridDccWorkspace) {
  const cache = geometry(workspace).renderCache;
  if (!cache) throw new Error("화면에 표시할 평가 메시가 아직 없습니다.");
  return bounds(cache.positions);
}

function mount(initialWorkspace: StudioHybridDccWorkspace) {
  let current = initialWorkspace;
  const view = render(<StrictMode><StudioHybridDccPanel
    initialWorkspace={initialWorkspace}
    onWorkspaceChange={(workspace) => { current = workspace; }}
  /></StrictMode>);
  return { view, workspace: () => current };
}

async function addModifier(host: ReturnType<typeof mount>, kind: "array" | "solidify") {
  fireEvent.change(screen.getByRole("combobox", { name: "추가할 변형 종류" }), { target: { value: kind } });
  fireEvent.click(screen.getByRole("button", { name: "변형 추가" }));
  await waitFor(() => {
    expect(geometry(host.workspace()).modifierStack.modifiers[0]?.kind).toBe(kind);
    expect(geometry(host.workspace()).renderCache).not.toBeNull();
  });
}

function reopen(workspace: StudioHybridDccWorkspace) {
  const encoded = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace, scope: SCOPE, savedAt: 1234 });
  const decoded = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes: encoded.bytes, scope: SCOPE });
  if (!decoded.workspace) throw new Error("저장한 모델링 작업공간을 복원하지 못했습니다.");
  return decoded.workspace;
}

/** 전달 영수증뿐 아니라 실제 GLB POSITION 바이트가 평가 메시와 같은지 읽는다. */
function glbPositionBounds(bytes: Uint8Array) {
  interface GlbDocument {
    readonly meshes: readonly { readonly primitives: readonly { readonly attributes: { readonly POSITION: number } }[] }[];
    readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly componentType: number; readonly count: number }[];
    readonly bufferViews: readonly { readonly byteOffset?: number; readonly byteStride?: number }[];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  const jsonLength = view.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GlbDocument;
  const positionIndex = document.meshes[0]!.primitives[0]!.attributes.POSITION;
  const accessor = document.accessors[positionIndex]!;
  expect(accessor.componentType).toBe(5126);
  const bufferView = document.bufferViews[accessor.bufferView]!;
  const start = 20 + jsonLength + 8 + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const positions = new Float32Array(accessor.count * 3);
  for (let vertex = 0; vertex < accessor.count; vertex++) {
    for (let axis = 0; axis < 3; axis++) {
      positions[vertex * 3 + axis] = view.getFloat32(start + vertex * (bufferView.byteStride ?? 12) + axis * 4, true);
    }
  }
  return bounds(positions);
}

afterEach(cleanup);

describe("Blender 유사 배치 옵션의 실제 모델링 패널 경계", () => {
  it("Array 상대 간격을 화면에서 바꾸면 평가 결과만 변하고 한 번의 undo·redo로 돌아온다", async () => {
    const initial = workspaceAddUnitCube(createStudioHybridDccWorkspace("array-placement-ui"), "window");
    const source = geometry(initial);
    const host = mount(initial);
    await addModifier(host, "array");
    const constantBounds = evaluatedBounds(host.workspace());
    fireEvent.click(screen.getByRole("switch", { name: /모델 크기에 비례한 간격$/u }));
    await waitFor(() => {
      expect(geometry(host.workspace()).modifierStack.modifiers[0]).toMatchObject({ kind: "array", useRelativeOffset: true });
      expect(screen.getByRole("spinbutton", { name: /상대 간격 X$/u })).toBeTruthy();
    });
    expect(evaluatedBounds(host.workspace()).size[0]).toBeGreaterThan(constantBounds.size[0]!);
    const beforeEdit = host.workspace();
    const beforeHash = geometry(beforeEdit).renderCache!.derivedFromHash;
    fireEvent.change(screen.getByRole("spinbutton", { name: /상대 간격 X$/u }), { target: { value: "2" } });
    await waitFor(() => {
      expect(geometry(host.workspace()).modifierStack.modifiers[0]).toMatchObject({ relativeOffset: { x: 2, y: 0, z: 0 } });
      expect(host.workspace().session.state.commandCount).toBe(beforeEdit.session.state.commandCount + 1);
    });
    const edited = host.workspace();
    const editedHash = geometry(edited).renderCache!.derivedFromHash;
    expect(editedHash).not.toBe(beforeHash);
    expect(evaluatedBounds(edited).size[0]).toBeGreaterThan(evaluatedBounds(beforeEdit).size[0]!);
    expect(geometry(edited).mesh).toBe(source.mesh);
    expect(geometry(edited).meshHash).toBe(source.meshHash);
    expect(edited.session.undoStack).toHaveLength(beforeEdit.session.undoStack.length + 1);

    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" }));
    await waitFor(() => {
      expect(geometry(host.workspace()).renderCache?.derivedFromHash).toBe(beforeHash);
      expect(host.workspace().session.state.commandCount).toBe(beforeEdit.session.state.commandCount);
    });
    fireEvent.click(screen.getByRole("button", { name: "되돌린 3D 편집 다시 실행" }));
    await waitFor(() => expect(geometry(host.workspace()).renderCache?.derivedFromHash).toBe(editedHash));
    for (const [axis, value, index] of [["Y", "0.5", 1], ["Z", "-0.75", 2]] as const) {
      const previous = host.workspace();
      const previousBounds = evaluatedBounds(previous);
      fireEvent.change(screen.getByRole("spinbutton", { name: new RegExp(`상대 간격 ${axis}$`, "u") }), {
        target: { value },
      });
      await waitFor(() => {
        const modifier = geometry(host.workspace()).modifierStack.modifiers[0];
        if (modifier?.kind !== "array") throw new Error("Array 변형이 없습니다.");
        expect(modifier.relativeOffset?.[axis === "Y" ? "y" : "z"]).toBe(Number(value));
        expect(host.workspace().session.state.commandCount).toBe(previous.session.state.commandCount + 1);
      });
      expect(evaluatedBounds(host.workspace()).size[index]).toBeGreaterThan(previousBounds.size[index]!);
    }
    expect(geometry(host.workspace()).meshHash).toBe(source.meshHash);
  });

  it("Solidify 두께 배치를 바꾸고 저장 후 다시 열어도 원본 면과 두께·배치가 보존된다", async () => {
    const initial = createStudioHybridDccWorkspace("solidify-placement-ui");
    const plane = createStudioEditableMeshFromPolygons([
      { x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 },
    ], [[0, 1, 2, 3]]);
    const session = hybridDccRegisterAsset(initial.session, "wall", plane, {
      source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
    });
    const prepared = { ...synchronizeWorkspaceGeometryAuthority(initial, session), activeAssetId: "wall" };
    const host = mount(prepared);
    await addModifier(host, "solidify");
    const originalBounds = evaluatedBounds(host.workspace());
    const beforeCount = host.workspace().session.state.commandCount;
    fireEvent.change(screen.getByRole("spinbutton", { name: /두께 배치$/u }), { target: { value: "0" } });
    await waitFor(() => {
      expect(geometry(host.workspace()).modifierStack.modifiers[0]).toMatchObject({ kind: "solidify", offset: 0 });
      expect(host.workspace().session.state.commandCount).toBe(beforeCount + 1);
    });
    const centered = host.workspace();
    const centeredBounds = evaluatedBounds(centered);
    expect(centeredBounds.size[2]).toBeCloseTo(originalBounds.size[2]!, 6);
    expect(centeredBounds.min[2]).not.toBe(originalBounds.min[2]);
    expect(centeredBounds.max[2]).not.toBe(originalBounds.max[2]);
    expect(geometry(centered).mesh).toBe(plane);
    expect(geometry(centered).mesh.vertices.every(({ position }) => position.z === 0)).toBe(true);
    const expectedHash = geometry(centered).renderCache!.derivedFromHash;
    const restored = reopen(centered);
    expect(restored.session.state.stateHash).toBe(centered.session.state.stateHash);
    host.view.unmount();
    const reopened = mount(restored);
    await waitFor(() => {
      expect(geometry(reopened.workspace()).renderCache?.derivedFromHash).toBe(expectedHash);
      expect((screen.getByRole("spinbutton", { name: /두께 배치$/u }) as HTMLInputElement).value).toBe("0");
    });
    expect(geometry(reopened.workspace()).meshHash).toBe(geometry(prepared).meshHash);
  });

  it("저장한 Array 간격 옵션이 재진입 UI와 배경 전달용 실제 GLB 정점까지 이어진다", async () => {
    const initial = workspaceAddUnitCube(createStudioHybridDccWorkspace("array-handoff-ui"), "fence");
    const host = mount(initial);
    await addModifier(host, "array");
    fireEvent.click(screen.getByRole("switch", { name: /모델 크기에 비례한 간격$/u }));
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: /상대 간격 X$/u })).toBeTruthy());
    fireEvent.change(screen.getByRole("spinbutton", { name: /상대 간격 X$/u }), { target: { value: "2" } });
    await waitFor(() => expect(geometry(host.workspace()).modifierStack.modifiers[0]).toMatchObject({ relativeOffset: { x: 2, y: 0, z: 0 } }));
    fireEvent.click(screen.getByRole("switch", { name: /고정 거리 사용$/u }));
    await waitFor(() => expect(geometry(host.workspace()).modifierStack.modifiers[0]).toMatchObject({ useConstantOffset: false, useRelativeOffset: true }));
    const saved = host.workspace();
    const expectedBounds = evaluatedBounds(saved);
    const expectedHash = geometry(saved).renderCache!.derivedFromHash;
    const restored = reopen(saved);
    host.view.unmount();
    const reopened = mount(restored);
    await waitFor(() => {
      expect(geometry(reopened.workspace()).renderCache?.derivedFromHash).toBe(expectedHash);
      expect(screen.getByRole("switch", { name: /고정 거리 사용$/u }).getAttribute("aria-checked")).toBe("false");
      expect(screen.getByRole("switch", { name: /모델 크기에 비례한 간격$/u }).getAttribute("aria-checked")).toBe("true");
      expect((screen.getByRole("spinbutton", { name: /상대 간격 X$/u }) as HTMLInputElement).value).toBe("2");
    });
    const persisted: StudioHybridDccBg3dPersistRequest[] = [];
    const persistAttachments = vi.fn(async (requests: readonly StudioHybridDccBg3dPersistRequest[]) => requests.map((request) => {
      persisted.push(request);
      return { assetId: request.assetId, attachment: {
        id: request.attachmentId, name: request.fileName, mime: "model/gltf-binary" as const,
        byteSize: request.bytes.byteLength, hash: request.expectedSha256, rights: request.rights,
        source: "local-library" as const,
        generic3dWorkflow: { version: 1 as const, classification: "prop" as const, sourceFormat: "glb" as const },
      } };
    }));
    const handoff = await handoffStudioHybridDccWorkspaceToBg3d(reopened.workspace(), {
      ports: { glbExportExecutionBackend: "direct", persistAttachments },
    });
    expect(persistAttachments).toHaveBeenCalledOnce();
    expect(handoff.assets[0]).toMatchObject({
      sourceAuthorityMeshHash: geometry(initial).meshHash,
      sourceMeshHash: expectedHash, sourceGeometryKind: "evaluated-modifier-stack",
    });
    expect(persisted).toHaveLength(1);
    const exportedBounds = glbPositionBounds(persisted[0]!.bytes);
    for (let axis = 0; axis < 3; axis++) {
      expect(exportedBounds.min[axis]).toBeCloseTo(expectedBounds.min[axis]!, 6);
      expect(exportedBounds.max[axis]).toBeCloseTo(expectedBounds.max[axis]!, 6);
    }
    expect(exportedBounds.size[0]).toBeGreaterThan(1);
    expect(geometry(reopened.workspace()).meshHash).toBe(geometry(initial).meshHash);
  });
});
