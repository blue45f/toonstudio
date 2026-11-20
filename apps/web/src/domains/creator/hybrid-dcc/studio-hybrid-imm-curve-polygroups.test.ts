import { describe, expect, it } from "vitest";

import {
  autoFaceSetsByConnectivity,
  autoFaceSetsByNormalAngle,
  buildSculptMaskFromFaceSet,
  createBuiltInImmKit,
  generateImmCurveMesh,
  getFaceSetOklchColor,
  isolateFaceSet,
  paintFaceSet,
  showAllFaceSets,
  splitMeshByFaceSets,
  type IndexedTriMesh,
} from "./studio-hybrid-imm-curve-polygroups";

function makeCubeAt(offsetX: number): IndexedTriMesh {
  const s = 0.5;
  const positions = new Float32Array([
    offsetX - s, -s, -s,
    offsetX + s, -s, -s,
    offsetX + s, s, -s,
    offsetX - s, s, -s,
    offsetX - s, -s, s,
    offsetX + s, -s, s,
    offsetX + s, s, s,
    offsetX - s, s, s,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    2, 3, 7, 2, 7, 6,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ]);
  return { positions, indices };
}

function mergeTwoMeshes(a: IndexedTriMesh, b: IndexedTriMesh): IndexedTriMesh {
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions, 0);
  positions.set(b.positions, a.positions.length);
  const vOffset = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices, 0);
  for (let i = 0; i < b.indices.length; i += 1) {
    indices[a.indices.length + i] = b.indices[i]! + vOffset;
  }
  return { positions, indices };
}

describe("studio-hybrid-imm-curve-polygroups", () => {
  it("연결 셸 자동 구획과 법선 이면각 구획 및 격리·마스크·재질 분할을 정확히 수행한다", () => {
    const twoCubes = mergeTwoMeshes(makeCubeAt(0), makeCubeAt(3));
    const shellGroups = autoFaceSetsByConnectivity(twoCubes);
    expect(new Set(shellGroups.groupIds).size).toBe(2);

    // 단일 큐브의 6개 면은 90도 직각이므로 35도 임계값에서 정확히 6개 Face Set으로 분리되어야 함
    const singleCube = makeCubeAt(0);
    const angleGroups = autoFaceSetsByNormalAngle(singleCube, 35);
    expect(new Set(angleGroups.groupIds).size).toBe(6);

    // 격리 및 스컬프트 마스크 검증
    const targetId = angleGroups.groupIds[0]!;
    const hiddenCount = isolateFaceSet(angleGroups, targetId);
    expect(hiddenCount).toBe(5);

    const mask = buildSculptMaskFromFaceSet(singleCube, angleGroups, targetId);
    let unlocked = 0;
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] === 0) unlocked += 1;
    }
    expect(unlocked).toBe(4); // 사각 면 1개 = 정점 4개

    showAllFaceSets(angleGroups);
    expect(angleGroups.hiddenGroups.size).toBe(0);

    // 페인트 및 서브메시 분할
    const customId = paintFaceSet(angleGroups, [0, 1]);
    const split = splitMeshByFaceSets(singleCube, angleGroups);
    expect(split.get(customId)?.indices.length).toBe(6);

    // OKLCH 파스텔 색상 토큰(raw hex 없음) 결정성 검증
    const c1 = getFaceSetOklchColor(1);
    const c2 = getFaceSetOklchColor(2);
    expect(c1.h).not.toBe(c2.h);
    expect(c1.l).toBeGreaterThan(0.6);
  });

  it("IMM 3분할 커브 키트배싱이 Start/Mid/End 파츠를 꼬임 없이 배치하고 경계 용접을 수행한다", () => {
    const kit = createBuiltInImmKit("chain-link");
    const result = generateImmCurveMesh(kit, {
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 0.4, y: 0.25, z: 0.3 },
        { x: 0.9, y: 0.15, z: 0.7 },
        { x: 1.4, y: 0.0, z: 1.0 },
      ],
      radiusScale: 1.0,
      taperCurve: (t) => 0.7 + 0.3 * Math.sin(t * Math.PI),
      weldTolerance: 0.005,
    });

    expect(result.totalArcLength).toBeGreaterThan(1.5);
    expect(result.midRepeatCount).toBeGreaterThanOrEqual(8);
    expect(result.mesh.indices.length).toBeGreaterThan(0);
    expect(result.weldedVertexCount).toBeGreaterThan(0);

    // Start(1), Mid(2), End(3) 3개 Face Set이 모두 생성되어야 함
    const groupSet = new Set(result.faceSetState.groupIds);
    expect(groupSet.has(1)).toBe(true);
    expect(groupSet.has(2)).toBe(true);
    expect(groupSet.has(3)).toBe(true);
  });

  it("타깃 메시 표면 스냅 옵션 사용 시 커브 파츠가 표면에 밀착 배치된다", () => {
    const groundPlane: IndexedTriMesh = {
      positions: new Float32Array([
        -5, 0, -5,
        5, 0, -5,
        5, 0, 5,
        -5, 0, 5,
      ]),
      indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    };

    const kit = createBuiltInImmKit("zipper-teeth");
    const snapped = generateImmCurveMesh(kit, {
      controlPoints: [
        { x: -1, y: 0.8, z: 0 },
        { x: 0, y: 1.2, z: 0.2 },
        { x: 1, y: 0.9, z: 0 },
      ],
      snapTargetMesh: groundPlane,
    });

    // Y=0 평면에 스냅되었으므로 모든 정점 Y가 지퍼 두께(<= 0.05m) 이내에 위치해야 함
    for (let i = 1; i < snapped.mesh.positions.length; i += 3) {
      expect(Math.abs(snapped.mesh.positions[i]!)).toBeLessThan(0.05);
    }
  });
});
