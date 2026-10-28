import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const VIEWPORT_SOURCE = ["./StudioHybridDccViewportCore.tsx", "./StudioHybridDccViewportParts.tsx", "./studio-hybrid-dcc-geometry-resource.ts"]
  .map((file) => readFileSync(resolve(import.meta.dirname, file), "utf8"))
  .join("\n");

describe("웹 3D 뷰포트의 파생 자원 소유권", () => {
  it("로컬 IBL·그림자·변·기하 자원을 생성하고 해제한다", () => {
    expect(VIEWPORT_SOURCE).toContain("new RoomEnvironment()");
    expect(VIEWPORT_SOURCE).toContain("new THREE.PMREMGenerator(gl)");
    expect(VIEWPORT_SOURCE).toContain("target.dispose()");
    expect(VIEWPORT_SOURCE).toContain("generator.dispose()");
    expect(VIEWPORT_SOURCE).toContain("room.dispose()");
    expect(VIEWPORT_SOURCE).toContain("return () => next.dispose()");
    expect(VIEWPORT_SOURCE).toContain("edges.dispose()");
    expect(VIEWPORT_SOURCE).toContain("geometry.dispose()");
    expect(VIEWPORT_SOURCE).toContain("indexed.toNonIndexed()");
    expect(VIEWPORT_SOURCE).toContain("THREE.PCFShadowMap");
    expect(VIEWPORT_SOURCE).not.toContain("THREE.PCFSoftShadowMap");
    expect(VIEWPORT_SOURCE).toContain("inspectStudioMeshSurfaceForInteractiveProjection");
    expect(VIEWPORT_SOURCE).toContain("projectStudioMeshSurfaceForRender");
    expect(VIEWPORT_SOURCE).not.toContain("estimatedFaceScanWork");
    expect(VIEWPORT_SOURCE).not.toContain("faceCount * faceCount");
  });
});
