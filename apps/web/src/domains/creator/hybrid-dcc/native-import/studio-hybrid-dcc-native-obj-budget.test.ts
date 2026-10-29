import { describe, expect, it, vi } from "vitest";

import { STUDIO_EDITABLE_MESH_LIMITS } from "../../studio-editable-half-edge-mesh";

import { STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES, estimateStudioNativeImportAssetBytes } from "./studio-hybrid-dcc-native-import-contracts";
import { estimateStudioNativeObjPartBytes, estimateStudioNativeObjWorkingBytes } from "./studio-hybrid-dcc-native-obj-budget";

const empty = { textCharacters: 0, sourceVertices: 0, sourceUvs: 0, sourceCorners: 0, outputCorners: 0, outputFaces: 0, assetBytes: 0 };

describe("OBJ 개별 메시와 파일 작업 예산", () => {
  it("실제 큰 배열 없이 다중 자산·원본 parsing 누계가 단일 메시 상한을 넘어도 작업 예산 안임을 확인한다", () => {
    const corners = 255_000; const faces = 42_500;
    const partBytes = estimateStudioNativeObjPartBytes(3, corners, faces, false);
    expect(partBytes).toBe(estimateStudioNativeImportAssetBytes(3, corners, faces, false));
    const total = estimateStudioNativeObjWorkingBytes({ ...empty, textCharacters: 3_000_000,
      sourceVertices: STUDIO_EDITABLE_MESH_LIMITS.maxVertices + 1, sourceCorners: corners * 2,
      outputCorners: corners * 2, outputFaces: faces * 2, assetBytes: partBytes * 2 });
    expect(corners * 2).toBeGreaterThan(STUDIO_EDITABLE_MESH_LIMITS.maxEdges);
    expect(total).toBeLessThan(STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES);
    expect(estimateStudioNativeObjWorkingBytes({ ...empty, sourceUvs: STUDIO_EDITABLE_MESH_LIMITS.maxEdges + 1 }))
      .toBeLessThan(STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES);
  });

  it("개별 메시 초과와 source 객체·decoded text를 포함한 작업 초과는 그대로 거부 가능한 값이다", () => {
    expect(estimateStudioNativeObjPartBytes(STUDIO_EDITABLE_MESH_LIMITS.maxVertices + 1, 3, 1, false)).toBe(Infinity);
    expect(estimateStudioNativeObjPartBytes(3, STUDIO_EDITABLE_MESH_LIMITS.maxEdges + 1, 1, false)).toBe(Infinity);
    expect(estimateStudioNativeObjPartBytes(3, 3, STUDIO_EDITABLE_MESH_LIMITS.maxFaces + 1, false)).toBe(Infinity);
    expect(estimateStudioNativeObjWorkingBytes({ ...empty, sourceVertices: 3_000_000 })).toBeGreaterThan(STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES);
    expect(estimateStudioNativeObjWorkingBytes({ ...empty, textCharacters: 128 * 1024 * 1024 })).toBeGreaterThan(STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES);
    expect(estimateStudioNativeObjWorkingBytes({ ...empty, assetBytes: -1 })).toBe(Infinity);
  });

  it("작은 메시 한도에서도 여러 OBJ part와 전역 v/vt/vn은 복원하고 단일 part 초과만 거부한다", async () => {
    vi.resetModules();
    vi.doMock("../../studio-editable-half-edge-mesh", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../studio-editable-half-edge-mesh")>();
      return { ...actual, STUDIO_EDITABLE_MESH_LIMITS: { ...actual.STUDIO_EDITABLE_MESH_LIMITS, maxVertices: 4, maxEdges: 6, maxFaces: 2 } };
    });
    try {
      const { decodeStudioNativeObj } = await import("./studio-hybrid-dcc-native-obj");
      const vertices = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 2 0 0\nv 3 0 0\nv 3 1 0\nv 2 1 0\n";
      const uv = "vt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n";
      const normals = "vn 0 0 1\n".repeat(8);
      const encode = (tail: string) => new TextEncoder().encode(vertices + uv + normals + tail);
      const multi = decodeStudioNativeObj(encode("o A\nf 1/1/1 2/2/2 3/3/3 4/4/4\no B\nf 5/5/5 6/6/6 7/7/7 8/8/8\n"));
      expect(multi.ok).toBe(true);
      if (!multi.ok) throw new Error(JSON.stringify(multi.issues));
      expect(multi.value.assets.map(({ mesh }) => [mesh.vertices.length, mesh.halfEdges.length])).toEqual([[4, 4], [4, 4]]);
      const single = decodeStudioNativeObj(encode("o A\nf 1 2 3 4\nf 5 6 7 8\n"));
      expect(single.ok).toBe(false);
      if (single.ok) throw new Error("단일 메시 한도를 넘어섰습니다.");
      expect(single.issues.at(-1)?.code).toBe("obj-budget-exceeded");
    } finally { vi.doUnmock("../../studio-editable-half-edge-mesh"); vi.resetModules(); }
  });

  it("작은 파싱 회귀에서도 작업 예산 초과가 공개 오류 계약으로 반환된다", async () => {
    vi.resetModules();
    vi.doMock("./studio-hybrid-dcc-native-import-contracts", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./studio-hybrid-dcc-native-import-contracts")>();
      return { ...actual, STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES: 8 * 1024 * 1024 + 4096 };
    });
    try {
      const { decodeStudioNativeObj } = await import("./studio-hybrid-dcc-native-obj");
      const result = decodeStudioNativeObj(new TextEncoder().encode("v 0 0 0\n".repeat(50)));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("작업 예산 초과를 받아들였습니다.");
      expect(result.issues.at(-1)?.code).toBe("obj-working-budget");
    } finally { vi.doUnmock("./studio-hybrid-dcc-native-import-contracts"); vi.resetModules(); }
  });
});
