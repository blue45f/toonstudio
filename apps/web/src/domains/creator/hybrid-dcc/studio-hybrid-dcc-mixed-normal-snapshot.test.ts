// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { assertRenderCacheIsNotAuthority } from "../studio-geometry-authority";
import { validateStudioMeshRenderCacheSurface } from "../mesh-surface/studio-mesh-render-cache-surface";

import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { workspaceAddActiveModifier } from "./studio-hybrid-dcc-modifier-workspace";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import { deriveStudioHybridDccViewportSnapshot } from "./StudioHybridDccViewportCore";

function mixedWorkspace(allSmooth = false) {
  const original = createStudioHybridDccWorkspace("mixed-import");
  const cube = createStudioUnitCubeMesh();
  const mesh = { ...cube, faces: cube.faces.map((face) => ({ ...face, smooth: allSmooth || face.id < 3 })) };
  const session = hybridDccRegisterAsset(original.session, "mixed", mesh, { source: "mixed.obj", creator: "import", license: "unknown", useScope: "editorial", derivative: "imported" });
  return { ...synchronizeWorkspaceGeometryAuthority(original, session), activeAssetId: "mixed" };
}

describe("혼합 음영의 원본·캐시 표시 경계", () => {
  it.each([false, true])("전체 smooth=%s 원본의 fan 순서·실제 코너 법선·권위 해시를 유지한다", (allSmooth) => {
    const workspace = mixedWorkspace(allSmooth);
    const source = workspace.session.state.geometry.records.mixed?.mesh;
    if (!source) throw new Error("혼합 음영 원본이 없습니다.");
    const snapshot = deriveStudioHybridDccViewportSnapshot(workspace);
    expect(snapshot.errors).toEqual([]); expect(snapshot.warnings).toEqual([]);
    const asset = snapshot.assets[0];
    expect(asset).toMatchObject({ normalMode: allSmooth ? "smooth" : "split", renderSource: "authority-source", triangleCount: 12 });
    expect(asset?.cornerNormals).toHaveLength(108);
    expect(asset?.renderHash).toBe(hashStudioEditableMesh(source));
    expect(asset?.mesh).toBe(source);
  });

  it("정상 Array 캐시는 혼합 코너 법선을 세 복사본에 보존하고 요소 모드에서만 원본 케이지를 표시한다", async () => {
    const original = mixedWorkspace();
    const source = original.session.state.geometry.records.mixed;
    const sourceNormals = deriveStudioHybridDccViewportSnapshot(original).assets[0]?.cornerNormals;
    if (!source || !sourceNormals) throw new Error("Array 전 혼합 음영 원본과 코너 법선이 없습니다.");
    const sourceBytes = serializeStudioEditableMesh(source.mesh);
    const sourceRevision = source.revision;
    expect(sourceNormals).toHaveLength(108);

    const workspace = await workspaceAddActiveModifier(original, "array");
    const record = workspace.session.state.geometry.records.mixed;
    const cache = record?.renderCache, surface = cache?.surface;
    if (!record || !cache || !surface) throw new Error("Array의 공통 표면 캐시가 없습니다.");
    expect(record.modifierStack.modifiers.find((modifier) => modifier.kind === "array")).toMatchObject({ count: 3, mode: "linear", offset: { x: 1.25, y: 0, z: 0 } });
    expect(assertRenderCacheIsNotAuthority(record)).toBe(true);
    expect(validateStudioMeshRenderCacheSurface(surface, {
      derivedMeshHash: cache.derivedFromHash, geometryContentHash: cache.contentHash, indexCount: cache.indices.length,
    })).toBe(true);
    expect(cache.indices).toHaveLength(108);
    expect(surface.cornerNormals).toHaveLength(324);

    const snapshot = deriveStudioHybridDccViewportSnapshot(workspace), asset = snapshot.assets[0];
    expect(snapshot.errors).toEqual([]); expect(snapshot.warnings).toEqual([]);
    expect(asset).toMatchObject({ normalMode: "split", renderSource: "modifier-cache", triangleCount: 36 });
    expect(asset?.positions).toBe(cache.positions); expect(asset?.indices).toBe(cache.indices);
    expect(asset?.cornerNormals).toBe(surface.cornerNormals);
    expect(asset?.renderHash).toBe(cache.derivedFromHash);
    // 평행이동 Array는 authored flat/smooth 법선을 회전시키지 않는다. 각 복사본의 실제 F32 값을 비교한다.
    for (let copy = 0; copy < 3; copy += 1) {
      expect(surface.cornerNormals.subarray(copy * sourceNormals.length, (copy + 1) * sourceNormals.length)).toEqual(sourceNormals);
    }
    expect(asset?.mesh).toBe(source.mesh); expect(record.mesh).toBe(source.mesh);
    expect(record.meshHash).toBe(source.meshHash);
    // 수정자 기록 변경은 자산 revision만 진행시키며 원본 메시와 이전 기록은 바꾸지 않는다.
    expect(record.revision).toBe(sourceRevision + 1); expect(source.revision).toBe(sourceRevision);
    expect(serializeStudioEditableMesh(record.mesh)).toEqual(sourceBytes);
    expect(original.session.state.geometry.records.mixed).toBe(source);
    expect(workspace.session.state.geometry.records.mixed).toBe(record);

    const cage = deriveStudioHybridDccViewportSnapshot(workspace, "face");
    expect(cage.errors).toEqual([]); expect(cage.warnings).toEqual([]);
    expect(cage.assets[0]).toMatchObject({ normalMode: "split", renderSource: "authority-edit-cage", triangleCount: 12 });
    expect(cage.assets[0]?.cornerNormals).toEqual(sourceNormals); expect(cage.assets[0]?.mesh).toBe(source.mesh);
  });

  it("공통 표면을 실제로 제거한 레거시 캐시는 혼합 음영 원본으로 명시적으로 fallback한다", async () => {
    const workspace = await workspaceAddActiveModifier(mixedWorkspace(), "array");
    const record = workspace.session.state.geometry.records.mixed;
    const cache = record?.renderCache;
    if (!record || !cache) throw new Error("레거시 경계를 검사할 Array 캐시가 없습니다.");
    const { surface: removedSurface, ...legacyCache } = cache;
    expect(removedSurface).toBeDefined(); expect(legacyCache.indices).toHaveLength(108);
    expect(Object.hasOwn(legacyCache, "surface")).toBe(false);
    // 표시 캐시만 복사해 메타데이터 없는 입력을 만든다. 정본 메시·기하 hash·bridge는 바꾸지 않는다.
    const legacyRecord = { ...record, renderCache: legacyCache };
    const legacyWorkspace: StudioHybridDccWorkspace = {
      ...workspace,
      session: { ...workspace.session, state: {
        ...workspace.session.state,
        geometry: { ...workspace.session.state.geometry, records: { ...workspace.session.state.geometry.records, mixed: legacyRecord } },
      } },
    };
    expect(assertRenderCacheIsNotAuthority(legacyRecord)).toBe(true);
    const sourceNormals = deriveStudioHybridDccViewportSnapshot(workspace, "face").assets[0]?.cornerNormals;
    if (!sourceNormals) throw new Error("fallback에 사용할 원본 코너 법선이 없습니다.");
    const snapshot = deriveStudioHybridDccViewportSnapshot(legacyWorkspace);
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.assets[0]).toMatchObject({ normalMode: "split", renderSource: "authority-cache-fallback", triangleCount: 12 });
    expect(snapshot.assets[0]?.cornerNormals).toHaveLength(108);
    expect(snapshot.assets[0]?.cornerNormals).toEqual(sourceNormals);
    expect(snapshot.assets[0]?.mesh).toBe(record.mesh);
    expect(snapshot.assets[0]?.renderHash).toBe(record.meshHash);
    expect(snapshot.warnings).toEqual([{ assetId: "mixed", message: "화면용 캐시에 공통 표면 속성이 없어 원본 편집 메시로 표시합니다." }]);
    expect(legacyWorkspace.bridge).toBe(workspace.bridge);
    expect(legacyWorkspace.session.state.stateHash).toBe(workspace.session.state.stateHash);
    expect(legacyWorkspace.session.state.geometry.records.mixed).toBe(legacyRecord);
    expect(workspace.session.state.geometry.records.mixed).toBe(record);
    expect(record.renderCache).toBe(cache); expect(cache.surface).toBe(removedSurface);
    const cage = deriveStudioHybridDccViewportSnapshot(legacyWorkspace, "face");
    expect(cage.assets[0]?.renderSource).toBe("authority-edit-cage"); expect(cage.warnings).toEqual([]);
  });
});
