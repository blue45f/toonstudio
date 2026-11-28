import { describe, expect, it } from "vitest";

import {
  ARAP_WGSL_UNIFORM_BYTE_LENGTH,
  auditArapMeshDistortion,
  buildArapMeshWarpWgsl,
  computeArapEdgeWeights,
  computeArapPoseFingerprint,
  computeMeanValueCoordinates2d,
  createSampleArapPoseScenario,
  createSampleCharacterRigMesh,
  deformPointsWithMvcCage,
  extractClosestRotation2d,
  renderArapPoseAuditSvg,
  runArap2dPoseTweakPipeline,
  sha256ArapHex,
  solveArapDeformation,
  solveArapGlobalStepPcg,
  solveArapLocalStep,
  solveBoneChainHandleTargets,
  solveSafeArapDeformation,
  summarizeArapPoseAuditKo,
  triangleSignedArea2d,
  validateArapMeshWarpWgsl,
  type ArapBoneChain2d,
  type ArapMesh2d,
  type ArapPinHandle,
  type CagePolygon2d,
  type Mat2,
  type Vec2,
} from "./index";

function makeRotationMatrix(deg: number): Mat2 {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { m00: c, m01: -s, m10: s, m11: c };
}

function det2(m: Mat2): number {
  return m.m00 * m.m11 - m.m01 * m.m10;
}

function orthogonalityError(m: Mat2): number {
  return Math.max(
    Math.abs(m.m00 * m.m00 + m.m10 * m.m10 - 1),
    Math.abs(m.m00 * m.m01 + m.m10 * m.m11),
    Math.abs(m.m01 * m.m01 + m.m11 * m.m11 - 1),
  );
}

function maxMatDiff(a: Mat2, b: Mat2): number {
  return Math.max(
    Math.abs(a.m00 - b.m00),
    Math.abs(a.m01 - b.m01),
    Math.abs(a.m10 - b.m10),
    Math.abs(a.m11 - b.m11),
  );
}

function reconstructMvcPoint(weights: readonly number[], cage: CagePolygon2d): Vec2 {
  let x = 0;
  let y = 0;
  for (let i = 0; i < cage.vertices.length; i += 1) {
    x += weights[i] * cage.vertices[i].x;
    y += weights[i] * cage.vertices[i].y;
  }
  return { x, y };
}

describe("Wave 159: 2×2 SO(2) 극분해 회전 추출(extractClosestRotation2d)", () => {
  it("30°, -45°, 90°, 135° 기지 회전을 오차 1e-9 미만으로 정확히 복원한다", () => {
    for (const deg of [30, -45, 90, 135] as const) {
      const expected = makeRotationMatrix(deg);
      const recovered = extractClosestRotation2d(expected);
      expect(maxMatDiff(recovered, expected)).toBeLessThan(1e-9);
      expect(orthogonalityError(recovered)).toBeLessThan(1e-12);
      expect(Math.abs(det2(recovered) - 1)).toBeLessThan(1e-12);
    }
  });

  it("양의 스케일이 곱해진 회전 행렬에서도 동일한 단위 SO(2) 회전을 복원한다", () => {
    const target = makeRotationMatrix(62);
    for (const s of [0.25, 17.5]) {
      const recovered = extractClosestRotation2d({
        m00: target.m00 * s,
        m01: target.m01 * s,
        m10: target.m10 * s,
        m11: target.m11 * s,
      });
      expect(maxMatDiff(recovered, target)).toBeLessThan(1e-12);
      expect(Math.abs(det2(recovered) - 1)).toBeLessThan(1e-12);
    }
  });

  it("반사 성분이 포함된 음의 행렬식 공분산에서도 항상 det(R) = +1 인 SO(2)를 유지한다", () => {
    const rot = extractClosestRotation2d({ m00: 1.4, m01: 0.3, m10: 0.3, m11: -0.9 });
    expect(Math.abs(det2(rot) - 1)).toBeLessThan(1e-12);
    expect(orthogonalityError(rot)).toBeLessThan(1e-12);
  });

  it("영행렬(퇴화 공분산) 및 비유한 입력 시 NaN 없이 항등 행렬을 반환한다", () => {
    const id = { m00: 1, m01: 0, m10: 0, m11: 1 };
    expect(extractClosestRotation2d({ m00: 0, m01: 0, m10: 0, m11: 0 })).toEqual(id);
    expect(extractClosestRotation2d({ m00: Number.NaN, m01: 0, m10: 1, m11: 1 })).toEqual(id);
  });

  it("가중 회전 간선 구름 공분산에서 48° 회전을 정확히 추출한다", () => {
    const trueRot = makeRotationMatrix(48);
    const edges: readonly Vec2[] = [{ x: 1.5, y: 0.2 }, { x: -0.8, y: 1.1 }, { x: 0.4, y: -1.7 }];
    let c00 = 0, c01 = 0, c10 = 0, c11 = 0;
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      const w = i + 1;
      const epx = trueRot.m00 * e.x + trueRot.m01 * e.y;
      const epy = trueRot.m10 * e.x + trueRot.m11 * e.y;
      c00 += w * epx * e.x;
      c01 += w * epx * e.y;
      c10 += w * epy * e.x;
      c11 += w * epy * e.y;
    }
    expect(maxMatDiff(extractClosestRotation2d({ m00: c00, m01: c01, m10: c10, m11: c11 }), trueRot)).toBeLessThan(1e-12);
  });
});

describe("Wave 159: 캐릭터 메쉬 생성 및 양수 코탄젠트 가중치", () => {
  it("샘플 캐릭터 리깅 메쉬의 모든 삼각형은 엄격한 양의 부호 넓이와 정규 UV를 가진다", () => {
    const preset = createSampleCharacterRigMesh();
    expect(preset.mesh.vertices.length).toBeGreaterThanOrEqual(45);
    expect(preset.mesh.triangles.length).toBeGreaterThanOrEqual(60);

    for (const [a, b, c] of preset.mesh.triangles) {
      expect(triangleSignedArea2d(preset.mesh.vertices[a], preset.mesh.vertices[b], preset.mesh.vertices[c])).toBeGreaterThan(0);
    }
    for (const v of preset.mesh.vertices) {
      expect(v.u).toBeGreaterThanOrEqual(0);
      expect(v.u).toBeLessThanOrEqual(1);
      expect(v.v).toBeGreaterThanOrEqual(0);
      expect(v.v).toBeLessThanOrEqual(1);
    }
  });

  it("computeArapEdgeWeights가 대칭적이고 엄격히 양수인 인접 가중치를 생성한다", () => {
    const { mesh } = createSampleCharacterRigMesh();
    const graph = computeArapEdgeWeights(mesh, { minCotangentWeight: 0.02 });
    expect(graph.edgeCount).toBeGreaterThan(0);
    expect(graph.minWeight).toBeGreaterThanOrEqual(0.02);

    for (let i = 0; i < graph.vertexCount; i += 1) {
      for (const nb of graph.neighbors[i]) {
        const rev = graph.neighbors[nb.to].find((entry) => entry.to === i);
        expect(rev).toBeDefined();
        expect(Math.abs((rev?.weight ?? 0) - nb.weight)).toBeLessThan(1e-12);
      }
    }
  });

  it("둔각 삼각형에서도 음수 코탄젠트를 양수 하한으로 클램프한다", () => {
    const obtuseMesh: ArapMesh2d = {
      id: "obtuse-test",
      labelKo: "둔각 삼각형",
      vertices: [
        { id: "v0", x: 0, y: 0, u: 0, v: 0 },
        { id: "v1", x: 10, y: 0, u: 1, v: 0 },
        { id: "v2", x: 5, y: 0.8, u: 0.5, v: 1 },
      ],
      triangles: [[0, 1, 2]],
    };
    expect(computeArapEdgeWeights(obtuseMesh, { minCotangentWeight: 0.05 }).minWeight).toBeGreaterThanOrEqual(0.05);
  });

  it("균일 가중치 옵션(useCotangentWeights: false)이 모든 간선에 양수 가중치 1.0을 부여한다", () => {
    const graph = computeArapEdgeWeights(createSampleCharacterRigMesh().mesh, { useCotangentWeights: false });
    expect(graph.minWeight).toBeCloseTo(1.0, 9);
    expect(graph.maxWeight).toBeCloseTo(1.0, 9);
  });

  it("핸들이 비어 있어도 원본 좌표를 안전하게 반환한다", () => {
    const { mesh } = createSampleCharacterRigMesh();
    const res = solveArapDeformation(mesh, []);
    expect(res.converged).toBe(true);
    expect(res.finalEnergy).toBe(0);
    expect(res.audit.invertedTriangleCount).toBe(0);
    expect(res.deformedPositions[0]).toEqual({ x: mesh.vertices[0].x, y: mesh.vertices[0].y });
  });
});

describe("Wave 159: ARAP 강체 운동 불변성(Rigid Motion Invariance)", () => {
  it("모든 핀 핸들의 순수 평행 이동에서 뒤집힘 0, 신축 오차 < 1e-3, 근사 0 에너지를 유지한다", () => {
    const preset = createSampleCharacterRigMesh();
    const dx = 42.5;
    const dy = -18.25;
    const handles: readonly ArapPinHandle[] = preset.torsoAnchorHandles.map((h) => ({
      ...h,
      target: { x: h.target.x + dx, y: h.target.y + dy },
    }));
    const res = solveArapDeformation(preset.mesh, handles);
    expect(res.audit.invertedTriangleCount).toBe(0);
    expect(Math.abs(res.audit.maxStretchRatio - 1)).toBeLessThan(1e-3);
    expect(Math.abs(res.audit.minStretchRatio - 1)).toBeLessThan(1e-3);
    expect(res.finalEnergy).toBeLessThan(1e-6);

    const movedCrown = res.deformedPositions[preset.landmarks.headCrown];
    const restCrown = preset.mesh.vertices[preset.landmarks.headCrown];
    expect(Math.hypot(movedCrown.x - (restCrown.x + dx), movedCrown.y - (restCrown.y + dy))).toBeLessThan(1e-3);
  });

  it("모든 핀 핸들의 순수 37° 강체 회전에서 왜곡 없이 정확히 회전한다", () => {
    const preset = createSampleCharacterRigMesh();
    const rot = makeRotationMatrix(37);
    const pivot = { x: 200, y: 200 };
    const pins = [
      preset.landmarks.pelvisCenter,
      preset.landmarks.chestCenter,
      preset.landmarks.leftWrist,
      preset.landmarks.rightWrist,
    ];
    const handles: readonly ArapPinHandle[] = pins.map((idx, i) => {
      const p = preset.mesh.vertices[idx];
      return {
        id: `rot-pin-${i}`,
        labelKo: `회전 핀 ${i}`,
        vertexIndex: idx,
        target: {
          x: pivot.x + rot.m00 * (p.x - pivot.x) + rot.m01 * (p.y - pivot.y),
          y: pivot.y + rot.m10 * (p.x - pivot.x) + rot.m11 * (p.y - pivot.y),
        },
        weight: 2500,
      };
    });
    const res = solveArapDeformation(preset.mesh, handles);
    expect(res.audit.invertedTriangleCount).toBe(0);
    expect(Math.abs(res.audit.maxStretchRatio - 1)).toBeLessThan(1e-3);
    expect(Math.abs(res.audit.minStretchRatio - 1)).toBeLessThan(1e-3);
    expect(res.finalEnergy).toBeLessThan(1e-6);
  });

  it("큰 각도(-120°) 강체 회전 + 평행 이동 조합도 Saddle 정체 없이 정확히 수렴한다", () => {
    const preset = createSampleCharacterRigMesh();
    const rot = makeRotationMatrix(-120);
    const handles: readonly ArapPinHandle[] = [
      preset.landmarks.pelvisCenter,
      preset.landmarks.headCrown,
      preset.landmarks.rightWrist,
    ].map((idx, i) => {
      const rv = preset.mesh.vertices[idx];
      return {
        id: `big-rot-${i}`,
        labelKo: `대각도 핀 ${i}`,
        vertexIndex: idx,
        target: { x: rot.m00 * rv.x + rot.m01 * rv.y - 35, y: rot.m10 * rv.x + rot.m11 * rv.y + 55 },
        weight: 2500,
      };
    });
    const res = solveArapDeformation(preset.mesh, handles);
    expect(res.audit.invertedTriangleCount).toBe(0);
    expect(Math.abs(res.audit.maxStretchRatio - 1)).toBeLessThan(1e-3);
    expect(res.finalEnergy).toBeLessThan(1e-5);
  });

  it("단일 핀 핸들 이동 시 전체 메쉬가 신축 없이 평행 이동한다", () => {
    const preset = createSampleCharacterRigMesh();
    const idx = preset.landmarks.chestCenter;
    const rest = preset.mesh.vertices[idx];
    const res = solveArapDeformation(preset.mesh, [
      { id: "single", labelKo: "단일 핀", vertexIndex: idx, target: { x: rest.x + 15, y: rest.y - 25 }, weight: 2000 },
    ]);
    expect(res.audit.invertedTriangleCount).toBe(0);
    expect(Math.abs(res.audit.maxStretchRatio - 1)).toBeLessThan(1e-4);
  });
});

describe("Wave 159: 비강체 캐릭터 포즈 보정 및 에너지 단조 수렴", () => {
  it("오른팔 들어 올리기 포즈가 뒤집힘 0과 타이트한 신축(maxStretchRatio < 1.35)으로 수렴한다", () => {
    const preset = createSampleCharacterRigMesh();
    const bonePose = solveBoneChainHandleTargets(preset.rightArmChain, [
      { jointId: "rightShoulder", deltaAngleDeg: -22 },
      { jointId: "rightElbow", deltaAngleDeg: -24 },
    ]);
    const res = solveArapDeformation(preset.mesh, [...preset.torsoAnchorHandles, ...bonePose.handles], {
      maxIterations: 30,
    });
    expect(res.audit.invertedTriangleCount).toBe(0);
    expect(res.audit.maxStretchRatio).toBeLessThan(1.35);
    expect(res.audit.minStretchRatio).toBeGreaterThan(0.75);
    expect(res.audit.status).toBe("PASS");
  });

  it("로컬-글로벌 반복 동안 총 에너지가 단조 비증가하며 초기 에너지보다 감소한다", () => {
    const preset = createSampleCharacterRigMesh();
    const wristRest = preset.mesh.vertices[preset.landmarks.rightWrist];
    const res = solveArapDeformation(
      preset.mesh,
      [
        ...preset.torsoAnchorHandles,
        {
          id: "bend-wrist",
          labelKo: "손목 올림",
          vertexIndex: preset.landmarks.rightWrist,
          target: { x: wristRest.x - 16, y: wristRest.y - 46 },
          weight: 2600,
        },
      ],
      { maxIterations: 24 },
    );
    expect(res.iterations.length).toBeGreaterThanOrEqual(2);
    expect(res.finalEnergy).toBeLessThan(res.initialEnergy);
    for (let i = 1; i < res.iterations.length; i += 1) {
      expect(res.iterations[i].totalEnergy).toBeLessThanOrEqual(res.iterations[i - 1].totalEnergy + 1e-6);
    }
  });

  it("솔버 결과의 모든 정점 로컬 회전 행렬이 엄격한 SO(2) 직교성을 만족한다", () => {
    const preset = createSampleCharacterRigMesh();
    const bonePose = solveBoneChainHandleTargets(preset.rightArmChain, [
      { jointId: "rightShoulder", deltaAngleDeg: -28 },
      { jointId: "rightElbow", deltaAngleDeg: -30 },
    ]);
    const res = solveArapDeformation(preset.mesh, [...preset.torsoAnchorHandles, ...bonePose.handles]);
    for (const rot of res.localRotations) {
      expect(orthogonalityError(rot)).toBeLessThan(1e-11);
      expect(Math.abs(det2(rot) - 1)).toBeLessThan(1e-11);
    }
  });

  it("고강성 핀 핸들 정점이 목표 좌표를 정밀하게 추적한다(maxHandleError < 1.0px)", () => {
    const preset = createSampleCharacterRigMesh();
    const bonePose = solveBoneChainHandleTargets(preset.rightArmChain, [
      { jointId: "rightShoulder", deltaAngleDeg: -18 },
      { jointId: "rightElbow", deltaAngleDeg: -20 },
    ]);
    const res = solveArapDeformation(preset.mesh, [...preset.torsoAnchorHandles, ...bonePose.handles]);
    expect(res.audit.maxHandleError).toBeLessThan(1.0);
  });

  it("글로벌 스텝 Jacobi-PCG가 매우 낮은 상대 잔차(< 1e-8)로 수렴한다", () => {
    const preset = createSampleCharacterRigMesh();
    const graph = computeArapEdgeWeights(preset.mesh);
    const restPos = preset.mesh.vertices.map((v) => ({ x: v.x, y: v.y }));
    const wristRest = preset.mesh.vertices[preset.landmarks.rightWrist];
    const step = solveArapGlobalStepPcg(
      graph,
      solveArapLocalStep(graph, restPos),
      [
        ...preset.torsoAnchorHandles,
        {
          id: "pcg-check",
          labelKo: "PCG 검증 핀",
          vertexIndex: preset.landmarks.rightWrist,
          target: { x: wristRest.x - 10, y: wristRest.y - 30 },
          weight: 2500,
        },
      ],
      restPos,
    );
    expect(step.pcgResidualNorm).toBeLessThan(1e-8);
    expect(step.pcgIterations).toBeGreaterThan(0);
  });
});

describe("Wave 159: 메쉬 접힘(Fold-Over) 감지 및 안전 이진 탐색 감쇠 복구", () => {
  it("극단적인 교차 핸들 당김은 원본 솔버에서 삼각형 뒤집힘과 FAIL 상태를 감지한다", () => {
    const scenario = createSampleArapPoseScenario("extremeTwist");
    const raw = solveArapDeformation(scenario.mesh, scenario.extraHandles ?? [], { maxIterations: 24 });
    expect(raw.audit.invertedTriangleCount).toBeGreaterThan(0);
    expect(raw.audit.invertedTriangleIndices.length).toBe(raw.audit.invertedTriangleCount);
    expect(raw.audit.status).toBe("FAIL");
  });

  it("solveSafeArapDeformation이 극단 핸들 변위를 자동 감쇠해 뒤집힘 0개로 복구한다", () => {
    const scenario = createSampleArapPoseScenario("extremeTwist");
    const safe = solveSafeArapDeformation(scenario.mesh, scenario.extraHandles ?? [], scenario.solverOptions);
    expect(safe.dampingTriggered).toBe(true);
    expect(safe.rawInvertedTriangleCount).toBeGreaterThan(0);
    expect(safe.dampingAttempts).toBeGreaterThan(0);
    expect(safe.appliedDisplacementScale).toBeGreaterThan(0);
    expect(safe.appliedDisplacementScale).toBeLessThan(1);
    expect(safe.audit.invertedTriangleCount).toBe(0);
  });

  it("정상 포즈에서는 안전 감쇠를 불필요하게 발동하지 않는다", () => {
    const scenario = createSampleArapPoseScenario("gentlePose");
    const boneChain = scenario.boneChain;
    if (!boneChain) {
      throw new Error("gentlePose 시나리오에 boneChain이 있어야 합니다.");
    }
    const bonePose = solveBoneChainHandleTargets(boneChain, scenario.boneRequests ?? []);
    const safe = solveSafeArapDeformation(scenario.mesh, [...(scenario.extraHandles ?? []), ...bonePose.handles]);
    expect(safe.dampingTriggered).toBe(false);
    expect(safe.appliedDisplacementScale).toBe(1);
    expect(safe.dampingAttempts).toBe(0);
    expect(safe.audit.invertedTriangleCount).toBe(0);
  });

  it("auditArapMeshDistortion이 뒤집힌 단일 삼각형의 인덱스와 음의 부호 넓이를 정확히 보고한다", () => {
    const triMesh: ArapMesh2d = {
      id: "single-tri",
      labelKo: "단일 삼각형",
      vertices: [
        { id: "a", x: 0, y: 0, u: 0, v: 0 },
        { id: "b", x: 10, y: 0, u: 1, v: 0 },
        { id: "c", x: 0, y: 10, u: 0, v: 1 },
      ],
      triangles: [[0, 1, 2]],
    };
    const audit = auditArapMeshDistortion(triMesh, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: -10 },
    ]);
    expect(audit.invertedTriangleCount).toBe(1);
    expect(audit.invertedTriangleIndices).toEqual([0]);
    expect(audit.minSignedArea).toBeLessThan(0);
    expect(audit.status).toBe("FAIL");
  });
});

describe("Wave 159: Mean Value Coordinates(MVC) 케이지 정확도 및 워프", () => {
  const squareCage: CagePolygon2d = {
    id: "square-cage",
    labelKo: "정사각형 케이지",
    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  };

  const nonConvexCage: CagePolygon2d = {
    id: "l-shape-cage",
    labelKo: "비볼록 L자 케이지",
    vertices: [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 },
      { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 },
    ],
  };

  it("볼록 사각형 내부 점에서 단위 분할(|sum(w)-1|<1e-9)과 선형 재현(|sum(w_i v_i)-p|<1e-9)을 만족한다", () => {
    const query: Vec2 = { x: 32.5, y: 71.25 };
    const row = computeMeanValueCoordinates2d(query, squareCage);
    expect(row.exactBoundaryKind).toBe("interior");
    expect(Math.abs(row.weightSum - 1)).toBeLessThan(1e-9);
    const recon = reconstructMvcPoint(row.weights, squareCage);
    expect(Math.hypot(recon.x - query.x, recon.y - query.y)).toBeLessThan(1e-9);
  });

  it("비볼록 L자 다각형 내부 점에서도 정확한 단위 분할과 선형 재현을 만족한다", () => {
    const query: Vec2 = { x: 22, y: 65 };
    const row = computeMeanValueCoordinates2d(query, nonConvexCage);
    expect(row.exactBoundaryKind).toBe("interior");
    expect(Math.abs(row.weightSum - 1)).toBeLessThan(1e-9);
    const recon = reconstructMvcPoint(row.weights, nonConvexCage);
    expect(Math.hypot(recon.x - query.x, recon.y - query.y)).toBeLessThan(1e-9);
  });

  it("케이지 꼭짓점과 일치하는 질의 점에 크로네커 델타 가중치를 정확히 반환한다", () => {
    const row = computeMeanValueCoordinates2d({ x: 100, y: 0 }, squareCage);
    expect(row.exactBoundaryKind).toBe("vertex");
    expect(row.boundaryIndex).toBe(1);
    expect(row.weights).toEqual([0, 1, 0, 0]);
  });

  it("케이지 경계 변 위의 질의 점에 정확한 선형 보간 가중치를 반환한다", () => {
    const row = computeMeanValueCoordinates2d({ x: 25, y: 0 }, squareCage);
    expect(row.exactBoundaryKind).toBe("edge");
    expect(row.boundaryIndex).toBe(0);
    expect(row.weights[0]).toBeCloseTo(0.75, 10);
    expect(row.weights[1]).toBeCloseTo(0.25, 10);
    expect(Math.abs(row.weightSum - 1)).toBeLessThan(1e-12);
  });

  it("deformPointsWithMvcCage가 변형된 케이지에 따라 내부 정점을 매끄럽게 이동시킨다", () => {
    const shiftedCage: CagePolygon2d = {
      ...squareCage,
      vertices: [{ x: 10, y: 5 }, { x: 120, y: 5 }, { x: 120, y: 115 }, { x: 10, y: 115 }],
    };
    const center = { x: 50, y: 50 };
    const [warped] = deformPointsWithMvcCage([center], squareCage, shiftedCage);
    expect(warped.x).toBeCloseTo(65, 6);
    expect(warped.y).toBeCloseTo(60, 6);
    const [identity] = deformPointsWithMvcCage([center], squareCage, squareCage);
    expect(Math.hypot(identity.x - center.x, identity.y - center.y)).toBeLessThan(1e-9);
  });

  it("꼭짓점 3개 미만 케이지나 꼭짓점 수 불일치 입력 시 명확한 오류를 던진다", () => {
    const tinyCage: CagePolygon2d = {
      id: "tiny",
      labelKo: "잘못된 케이지",
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    };
    expect(() => computeMeanValueCoordinates2d({ x: 5, y: 5 }, tinyCage)).toThrow();
    expect(() => deformPointsWithMvcCage([{ x: 50, y: 50 }], squareCage, nonConvexCage)).toThrow();
  });
});

describe("Wave 159: 해부학적 본 체인 FK 및 각도 클램핑", () => {
  it("허용 범위를 초과한 어깨·팔꿈치 회전 요청을 안전 각도 한계로 클램프한다", () => {
    const { rightArmChain } = createSampleCharacterRigMesh();
    const solution = solveBoneChainHandleTargets(rightArmChain, [
      { jointId: "rightShoulder", deltaAngleDeg: -160 },
      { jointId: "rightElbow", deltaAngleDeg: 80 },
    ]);
    expect(solution.clampedCount).toBe(2);
    expect(solution.clampAudit.find((a) => a.jointId === "rightShoulder")?.appliedAngleDeg).toBe(-75);
    expect(solution.clampAudit.find((a) => a.jointId === "rightElbow")?.appliedAngleDeg).toBe(15);
  });

  it("FK 회전 후에도 상완·전완 본 길이가 기계 정밀도로 보존된다", () => {
    const { rightArmChain } = createSampleCharacterRigMesh();
    const solution = solveBoneChainHandleTargets(rightArmChain, [
      { jointId: "rightShoulder", deltaAngleDeg: -35 },
      { jointId: "rightElbow", deltaAngleDeg: -50 },
    ]);
    const [j0, j1, j2] = rightArmChain.joints;
    const s1 = solution.jointPositions.rightShoulder;
    const e1 = solution.jointPositions.rightElbow;
    const w1 = solution.jointPositions.rightWrist;
    expect(Math.hypot(e1.x - s1.x, e1.y - s1.y)).toBeCloseTo(
      Math.hypot(j1.restPosition.x - j0.restPosition.x, j1.restPosition.y - j0.restPosition.y),
      9,
    );
    expect(Math.hypot(w1.x - e1.x, w1.y - e1.y)).toBeCloseTo(
      Math.hypot(j2.restPosition.x - j1.restPosition.x, j2.restPosition.y - j1.restPosition.y),
      9,
    );
  });

  it("요청이 생략된 관절은 0° 변화로 유지되며 클램프되지 않는다", () => {
    const { leftArmChain } = createSampleCharacterRigMesh();
    const solution = solveBoneChainHandleTargets(leftArmChain, []);
    expect(solution.clampedCount).toBe(0);
    expect(solution.jointPositions.leftWrist).toEqual(leftArmChain.joints[2].restPosition);
  });

  it("순환 부모 참조가 있는 잘못된 본 체인은 오류를 발생시킨다", () => {
    const cyclicChain: ArapBoneChain2d = {
      id: "cyclic",
      labelKo: "순환 본",
      joints: [
        { id: "j1", labelKo: "관절1", parentId: "j2", restPosition: { x: 0, y: 0 }, vertexIndex: 0, minAngleDeg: -30, maxAngleDeg: 30 },
        { id: "j2", labelKo: "관절2", parentId: "j1", restPosition: { x: 10, y: 0 }, vertexIndex: 1, minAngleDeg: -30, maxAngleDeg: 30 },
      ],
    };
    expect(() => solveBoneChainHandleTargets(cyclicChain, [])).toThrow();
  });
});

describe("Wave 159: WGSL 64B 유니폼 셰이더 빌더 및 정적 계약 검증기", () => {
  it("기본 64바이트 정렬 WGSL 셰이더 번들이 모든 정적 검증을 통과한다", () => {
    const bundle = buildArapMeshWarpWgsl({ activeHandleCount: 8, wireframeOpacity: 0.4 });
    const validation = validateArapMeshWarpWgsl(bundle);
    expect(bundle.uniformByteLength).toBe(ARAP_WGSL_UNIFORM_BYTE_LENGTH);
    expect(bundle.uniformData.byteLength).toBe(64);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
    expect(validation.braceDelta).toBe(0);
    expect(validation.bindingCount).toBe(3);
  });

  it("중괄호 불균형 WGSL 소스를 정확히 거부한다", () => {
    const base = buildArapMeshWarpWgsl();
    const validation = validateArapMeshWarpWgsl({ ...base, wgslSource: `${base.wgslSource}\nfn orphan() {` });
    expect(validation.valid).toBe(false);
    expect(validation.braceDelta).toBe(1);
    expect(validation.issues.some((msg) => msg.includes("중괄호"))).toBe(true);
  });

  it("중복된 @group/@binding 슬롯 선언을 거부한다", () => {
    const base = buildArapMeshWarpWgsl();
    const validation = validateArapMeshWarpWgsl({
      ...base,
      wgslSource: base.wgslSource.replace("@binding(2)", "@binding(0)"),
    });
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((msg) => msg.includes("중복된 바인딩"))).toBe(true);
  });

  it("16바이트 비정렬 유니폼 크기를 거부한다", () => {
    const base = buildArapMeshWarpWgsl();
    const validation = validateArapMeshWarpWgsl({
      ...base,
      uniformByteLength: 52,
      uniformData: new Float32Array(13),
    });
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((msg) => msg.includes("16바이트"))).toBe(true);
  });

  it("GLSL 금지 토큰(vec2/vec3/vec4/texture2D/gl_Position) 혼입을 거부한다", () => {
    const base = buildArapMeshWarpWgsl();
    const validation = validateArapMeshWarpWgsl({
      ...base,
      wgslSource: `${base.wgslSource}\nfn bad() { let p = vec4(0.0); let c = texture2D(a, vec2(0.0)); let g = gl_Position; }`,
    });
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((msg) => msg.includes("GLSL"))).toBe(true);
  });

  it("NaN 또는 Infinity가 들어간 유니폼 버퍼를 거부한다", () => {
    const validation = validateArapMeshWarpWgsl(
      buildArapMeshWarpWgsl({ meshScale: Number.NaN, offsetX: Number.POSITIVE_INFINITY }),
    );
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((msg) => msg.includes("비유한 숫자"))).toBe(true);
  });
});

describe("Wave 159: FIPS 180-4 SHA-256, 순수 OKLCH SVG, 한국어 QA 및 전체 파이프라인", () => {
  it("순수 ES2017 SHA-256 구현이 FIPS 180-4 표준 테스트 벡터와 완전히 일치한다", () => {
    expect(sha256ArapHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256ArapHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256ArapHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    const ko = sha256ArapHex("툰스튜디오 포즈 보정");
    expect(ko).toBe(sha256ArapHex("툰스튜디오 포즈 보정"));
    expect(ko).toMatch(/^[0-9a-f]{64}$/);
  });

  it("포즈 지문이 결정론적이며 단 하나의 정점 좌표 변경에도 해시가 즉시 바뀐다", () => {
    const result = runArap2dPoseTweakPipeline(createSampleArapPoseScenario("gentlePose"));
    const fp1 = computeArapPoseFingerprint(
      result.mesh,
      result.arapResult.deformedPositions,
      result.arapResult.effectiveHandles,
      result.arapResult.audit,
    );
    expect(fp1).toBe(result.fingerprintSha256);

    const tweaked = result.arapResult.deformedPositions.map((p, idx) => (idx === 0 ? { x: p.x + 0.005, y: p.y } : p));
    const fp2 = computeArapPoseFingerprint(result.mesh, tweaked, result.arapResult.effectiveHandles, result.arapResult.audit);
    expect(fp2).not.toBe(fp1);
  });

  it("감사 SVG가 순수 oklch() 색상만 사용하고 raw hex/rgb/hsl, NaN, XSS 없이 렌더링된다", () => {
    const result = runArap2dPoseTweakPipeline(createSampleArapPoseScenario("gentlePose"));
    const svg = renderArapPoseAuditSvg({
      titleKo: `포즈 감사 <script>alert("xss")</script> & '체크'`,
      mesh: result.mesh,
      deformedPositions: result.arapResult.deformedPositions,
      handles: result.arapResult.effectiveHandles,
      audit: result.arapResult.audit,
      cageRest: createSampleCharacterRigMesh().restCage,
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("한국어 QA 요약이 PASS/WARN/FAIL 상태와 안전 감쇠·본 클램핑 안내를 자연스럽게 출력한다", () => {
    const gentle = runArap2dPoseTweakPipeline(createSampleArapPoseScenario("gentlePose"));
    expect(gentle.summaryKo).toContain("[PASS]");
    expect(gentle.summaryKo).toContain("뒤집힌 삼각형이 없고");

    const extreme = runArap2dPoseTweakPipeline(createSampleArapPoseScenario("extremeTwist"));
    expect(extreme.summaryKo).toContain("안전 감쇠가 작동");

    const warnSummary = summarizeArapPoseAuditKo({
      arapResult: {
        ...gentle.arapResult,
        audit: { ...gentle.arapResult.audit, maxStretchRatio: 1.48, status: "WARN" },
      },
    });
    expect(warnSummary).toContain("[WARN]");

    const failSummary = summarizeArapPoseAuditKo({
      arapResult: {
        ...gentle.arapResult,
        audit: { ...gentle.arapResult.audit, invertedTriangleCount: 2, status: "FAIL" },
      },
      wgslValid: false,
    });
    expect(failSummary).toContain("[FAIL]");
    expect(failSummary).toContain("WGSL 셰이더 계약 오류");
  });

  it("전체 파이프라인 오케스트레이터(기본 gentlePose 시나리오)가 결정론적 PASS로 완료된다", () => {
    const run1 = runArap2dPoseTweakPipeline(createSampleArapPoseScenario("gentlePose"));
    const run2 = runArap2dPoseTweakPipeline(createSampleArapPoseScenario("gentlePose"));
    expect(run1.status).toBe("PASS");
    expect(run1.wgslValidation.valid).toBe(true);
    expect(run1.arapResult.audit.invertedTriangleCount).toBe(0);
    expect(run1.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(run1.fingerprintSha256).toBe(run2.fingerprintSha256);
    expect(run1.auditSvg).toContain("<svg");
  });

  it("extremeTwist와 cageStretch 대표 시나리오 모두 뒤집힘 0개로 안정 종료한다", () => {
    const extreme = runArap2dPoseTweakPipeline(createSampleArapPoseScenario("extremeTwist"));
    expect(extreme.arapResult.dampingTriggered).toBe(true);
    expect(extreme.arapResult.audit.invertedTriangleCount).toBe(0);
    expect(extreme.wgslValidation.valid).toBe(true);

    const cageStretch = runArap2dPoseTweakPipeline(createSampleArapPoseScenario("cageStretch"));
    expect(cageStretch.cagePreDeformedPositions).not.toBeNull();
    expect(cageStretch.arapResult.audit.invertedTriangleCount).toBe(0);
    expect(cageStretch.status).toBe("PASS");
  });
});
