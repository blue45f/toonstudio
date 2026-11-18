import { describe, expect, it } from "vitest";

import { deriveStudioMeshUvIslands } from "../mesh-uv/studio-mesh-uv-authority";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { HEAD_DIVISIONS, type CustomPrimitive } from "./studio-hybrid-dcc-custom-primitive";
import { analyzeStudioEditableMeshIntegrity } from "./studio-hybrid-dcc-face-modeling-mesh";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { computeStudioHybridDccMeshQualitySummary, createStudioHybridDccStarterPrimitiveMesh, workspaceAddStarterPrimitive } from "./studio-hybrid-dcc-primitives";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";
import { createStudioHybridDccWorkspace, workspaceRedo, workspaceUndo } from "./studio-hybrid-dcc-workspace";

const head = { kind: "sculpt-head", heightCm: 23, jawPercent: 78, divisions: 18 } as const;
const stairs = { kind: "stairs", steps: 8, widthCm: 120, riseCm: 17, treadCm: 28 } as const;

describe("맞춤 두상·계단 모델링", () => {
  it.each(HEAD_DIVISIONS)("두상 %i분할은 실측 높이를 유지하고 매니폴드 사각면으로 닫힌다", (divisions) => {
    const mesh = createStudioHybridDccStarterPrimitiveMesh({ ...head, divisions });
    const summary = computeStudioHybridDccMeshQualitySummary(mesh);
    expect(deriveStudioMeshUvIslands(mesh)).toHaveLength(6);
    expect(summary.dimensions.height).toBeCloseTo(0.23, 10);
    expect(Math.min(...mesh.vertices.map(({ position }) => position.y))).toBe(0);
    expect(mesh.faces).toHaveLength(6 * divisions ** 2);
    expect(mesh.vertices).toHaveLength(6 * divisions ** 2 + 2);
    expect(mesh.halfEdges).toHaveLength(4 * mesh.faces.length);
    const integrity = analyzeStudioEditableMeshIntegrity(mesh);
    expect(integrity).toMatchObject({ canonical: true, closed: true, bowTieVertices: 0, eulerCharacteristic: 2 });
    expect(integrity.signedVolume).toBeGreaterThan(0);
    expect(exportStudioHybridDccMeshGlb({ assetId: "head", mesh, sourceHash: hashStudioEditableMesh(mesh), sourceRevision: 1 }).ok).toBe(true);
  });

  it("턱 너비 변경이 두개골이나 높이를 바꾸지 않는다", () => {
    const narrow = createStudioHybridDccStarterPrimitiveMesh({ ...head, jawPercent: 60 });
    const broad = createStudioHybridDccStarterPrimitiveMesh({ ...head, jawPercent: 100 });
    const lowerWidths = [narrow, broad].map((mesh) => Math.max(...mesh.vertices.filter(({ position }) => position.y < 0.08).map(({ position }) => position.x)));
    expect(lowerWidths[0]!).toBeLessThan(lowerWidths[1]!);
    expect(narrow.vertices.filter(({ position }) => position.y >= 0.115)).toEqual(broad.vertices.filter(({ position }) => position.y >= 0.115));
  });

  it.each([1, 8, 32])("실제 %i단 계단의 폭·전체 높이·깊이와 닫힌 면을 만든다", (steps) => {
    const mesh = createStudioHybridDccStarterPrimitiveMesh({ ...stairs, steps });
    expect(mesh.uvLayer?.corners).toHaveLength(mesh.halfEdges.length);
    const { dimensions } = computeStudioHybridDccMeshQualitySummary(mesh);
    expect(Math.min(...mesh.vertices.map(({ position }) => position.y))).toBe(0);
    expect(dimensions.width).toBeCloseTo(1.2, 10);
    expect(dimensions.height).toBeCloseTo(steps * 0.17, 10);
    expect(dimensions.depth).toBeCloseTo(steps * 0.28, 10);
    expect(new Set(mesh.vertices.map(({ position }) => position.y)).size).toBe(steps + 1);
    expect(mesh.vertices).toHaveLength(4 * steps + 4);
    expect(analyzeStudioEditableMeshIntegrity(mesh).signedVolume).toBeCloseTo(1.2 * 0.17 * 0.28 * steps * (steps + 1) / 2, 10);
    expect(analyzeStudioEditableMeshIntegrity(mesh)).toMatchObject({ canonical: true, closed: true, bowTieVertices: 0, eulerCharacteristic: 2 });
  });

  it.each<CustomPrimitive>([{ ...head, divisions: 3000 }, { ...head, divisions: 7 }, { ...head, heightCm: Infinity },
    { ...head, jawPercent: NaN }, { ...stairs, steps: 1.5 }, { ...stairs, treadCm: 0 }])("잘못된 치수는 편집 이력을 만들기 전에 거부한다 ($kind)", (shape) => {
    const ws = createStudioHybridDccWorkspace("invalid");
    expect(() => workspaceAddStarterPrimitive(ws, shape)).toThrow(RangeError);
    expect(Object.keys(ws.session.state.geometry.records)).toHaveLength(0);
  });

  it.each([head, stairs])("생성한 $kind 원본은 되돌리기·다시 실행·작업파일 재열기 뒤에도 같다", (shape) => {
    const ws = workspaceAddStarterPrimitive(createStudioHybridDccWorkspace("custom"), shape);
    const id = ws.activeAssetId!;
    const original = ws.session.state.geometry.records[id]!.meshHash;
    const undone = workspaceUndo(ws);
    expect(undone.session.state.geometry.records[id]).toBeUndefined();
    expect(workspaceRedo(undone).session.state.geometry.records[id]!.meshHash).toBe(original);
    const restored = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(ws), { documentId: "reopened" });
    expect(restored.session.state.geometry.records[id]!.meshHash).toBe(original);
  });
});
