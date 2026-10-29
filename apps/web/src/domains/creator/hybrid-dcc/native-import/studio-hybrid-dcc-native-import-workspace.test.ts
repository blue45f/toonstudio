import { describe, expect, it } from "vitest";

import { hashStudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { sha256HexPortable } from "../../studio-sha256";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "../studio-hybrid-dcc-workfile";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceImportBytes, workspaceRedo, workspaceUndo } from "../studio-hybrid-dcc-workspace";
import { STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES } from "./studio-hybrid-dcc-native-import-contracts";
import { readStudioNativeWorkspaceImportReport } from "./studio-hybrid-dcc-native-import-workspace";
import { nativeImportGlbFixture, nativeImportObjFixture } from "./studio-hybrid-dcc-native-import.test-fixtures";

describe("실제 파일의 native workspace 등록", () => {
  it("GLB 모든 노드·primitive의 실제 메시·UV·재질slot·TRS를 단일 undo로 등록하고 파일 재열기도 보존한다", () => {
    const before = workspaceAddUnitCube(createStudioHybridDccWorkspace("import-target"), "existing");
    const bytes = nativeImportGlbFixture(true); const next = workspaceImportBytes(before, "scene.glb", bytes);
    const report = readStudioNativeWorkspaceImportReport(next.lastImportReport);
    if (!report) throw new Error("가져오기 정본 보고서가 없습니다.");
    expect(report).toMatchObject({ committed: true, outcome: "registered", sourceHash: `sha256:${sha256HexPortable(bytes)}` });
    expect(report.assets).toHaveLength(4); expect(next.session.undoStack).toHaveLength(before.session.undoStack.length + 1);
    expect(next.session.state.geometry.records.existing).toBe(before.session.state.geometry.records.existing);
    for (const asset of report.assets) {
      const record = next.session.state.geometry.records[asset.assetId]; if (!record) throw new Error("등록 자산이 없습니다.");
      expect(record.mesh.vertices.length).toBeGreaterThan(0); expect(record.mesh.faces).toHaveLength(12);
      expect(record.mesh.uvLayer?.corners).toHaveLength(record.mesh.halfEdges.length);
      expect(record.meshHash).toBe(hashStudioEditableMesh(record.mesh)); expect(record.meshHash).toBe(asset.meshHash);
      expect(record.mesh.faces.every(({ materialSlot }) => materialSlot === asset.sourcePrimitiveIndex)).toBe(true);
      expect(next.session.state.objectTransforms[asset.assetId]?.position).toEqual(asset.sourceNodeIndex === 0 ? [2, 3, 4] : [-2, 0, 1]);
      expect(next.session.state.rightsBom.find(({ assetId }) => assetId === asset.assetId)).toMatchObject({ license: "unknown", useScope: "editorial" });
    }
    expect(Object.keys(before.session.state.geometry.records)).toEqual(["existing"]);
    expect(Object.keys(workspaceUndo(next).session.state.geometry.records)).toEqual(["existing"]);
    expect(Object.keys(workspaceRedo(workspaceUndo(next)).session.state.geometry.records)).toHaveLength(5);
    const reopened = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(next), { documentId: "reopened-import" });
    expect(reopened.session.state.geometry.records).toEqual(next.session.state.geometry.records);
    expect(reopened.session.state.objectTransforms).toEqual(next.session.state.objectTransforms);
    expect(reopened.lastImportReport).toEqual(next.lastImportReport);
  });

  it("같은 파일을 다시 가져와도 기존 자산을 덮어쓰지 않고 새 ID를 발급한다", () => {
    const bytes = nativeImportGlbFixture(); const first = workspaceImportBytes(createStudioHybridDccWorkspace("unique-import"), "cube.glb", bytes);
    const second = workspaceImportBytes(first, "cube.glb", bytes);
    const firstId = first.activeAssetId; if (!firstId) throw new Error("첫 자산 ID가 없습니다.");
    expect(Object.keys(second.session.state.geometry.records)).toHaveLength(2);
    expect(second.activeAssetId).not.toBe(firstId);
    expect(second.session.state.geometry.records[firstId]).toBe(first.session.state.geometry.records[firstId]);
    expect(Object.keys(workspaceUndo(second).session.state.geometry.records)).toEqual([firstId]);
  });

  it("OBJ도 실제 독립 자산과 corner UV를 등록하고 외부재질·법선 손실을 보고한다", () => {
    const next = workspaceImportBytes(createStudioHybridDccWorkspace("obj-target"), "parts.obj", nativeImportObjFixture());
    const report = readStudioNativeWorkspaceImportReport(next.lastImportReport);
    expect(report?.committed).toBe(true); expect(report?.assets).toHaveLength(2);
    expect(report?.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["obj-external-material", "obj-custom-normals"]));
    for (const record of Object.values(next.session.state.geometry.records)) { expect(record.mesh.vertices).toHaveLength(3); expect(record.mesh.uvLayer?.corners).toHaveLength(3); }
    expect(next.session.undoStack).toHaveLength(1);
  });

  it("실제 STL adapter는 유지하고 모델 없는 분석 결과는 committed false로 구분한다", () => {
    const before = createStudioHybridDccWorkspace("legacy-import");
    const stl = new TextEncoder().encode("solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle");
    const actual = workspaceImportBytes(before, "triangle.stl", stl);
    expect(Object.keys(actual.session.state.geometry.records)).toHaveLength(1); expect(readStudioNativeWorkspaceImportReport(actual.lastImportReport)?.committed).toBe(true);
    const metadata = workspaceImportBytes(before, "plan.dxf", new TextEncoder().encode("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"));
    expect(metadata.session).toBe(before.session); expect(readStudioNativeWorkspaceImportReport(metadata.lastImportReport)).toMatchObject({ committed: false, outcome: "metadata-only", assets: [] });
    const unsupported = workspaceImportBytes(before, "source.blend", new TextEncoder().encode("BLENDER-v300"));
    expect(unsupported.session).toBe(before.session); expect(readStudioNativeWorkspaceImportReport(unsupported.lastImportReport)).toMatchObject({ committed: false, outcome: "unsupported", assets: [] });
  });

  it("파일 손상·크기 검사는 원본과 journal을 바꾸지 않는다", () => {
    const source = workspaceAddUnitCube(createStudioHybridDccWorkspace("failed-import"), "original"); const state = source.session.state; const journal = source.session.journal;
    expect(() => workspaceImportBytes(source, "invalid.glb", new Uint8Array([1, 2, 3]))).toThrow();
    const oversized = new Uint8Array([1]); Object.defineProperty(oversized, "byteLength", { value: STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES + 1 });
    expect(() => workspaceImportBytes(source, "huge.glb", oversized)).toThrow(/128 MiB/u);
    expect(source.session.state).toBe(state); expect(source.session.journal).toBe(journal); expect(Object.keys(state.geometry.records)).toEqual(["original"]);
  });
});
