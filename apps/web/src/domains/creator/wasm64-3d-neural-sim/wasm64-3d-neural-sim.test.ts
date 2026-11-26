import { describe, expect, it } from "vitest";

import {
  CrossPlatform3dAssetCrdt,
  GazePoseLightController,
  XpbdClothHairSolver,
  bakeStylizedUvTexture,
  compareVectorClocks,
  compressBlockTexture,
  createClothGridAsset,
  createHairStrandBundleAsset,
  decimateMeshQem,
  decompressBlockTexture,
  multiplyQuaternions,
  probeMeshAccelTier,
  probeWebNnClothResidualSupport,
  probeWebNnExecutionProviders,
  quaternionFromAxisAngle,
  resolveHumanoidBoneName,
  retargetHumanoidAnimation,
  upscaleTexture2xEdgeDirected,
  type NeuralClothResidualHook,
  type Quat4,
  type SourceBoneRestSpec,
} from "./index";

function buildCurvedGridMesh(
  cols: number,
  rows: number,
  splitUvSeam = false,
): {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly uvs: Float32Array;
} {
  const halfCol = Math.floor(cols / 2);
  const posList: number[] = [];
  const uvList: number[] = [];
  const idxMap: number[][] = [];

  // splitUvSeam === true이면 중앙 열을 동일 3D 좌표 + 서로 다른 UV로 복제해 UV 심을 구성
  for (let r = 0; r <= rows; r += 1) {
    const rowIndices: number[] = [];
    const v = r / rows;
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const x = (u - 0.5) * 2;
      const z = (v - 0.5) * 2;
      const y = 0.25 * Math.cos(x * Math.PI * 0.5) * Math.cos(z * Math.PI * 0.5);
      const id = posList.length / 3;
      posList.push(x, y, z);
      uvList.push(u, v);
      rowIndices.push(id);
      if (splitUvSeam && c === halfCol) {
        const seamDupId = posList.length / 3;
        posList.push(x, y, z);
        uvList.push(u + 0.25, v);
        rowIndices.push(seamDupId);
      }
    }
    idxMap.push(rowIndices);
  }

  const indices: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    const row0 = idxMap[r];
    const row1 = idxMap[r + 1];
    if (!row0 || !row1) continue;
    for (let c = 0; c < cols; c += 1) {
      const colLeft = splitUvSeam && c >= halfCol ? c + 1 : c;
      const colRight = colLeft + 1;
      const a = row0[colLeft];
      const b = row0[colRight];
      const d = row1[colLeft];
      const e = row1[colRight];
      if (a === undefined || b === undefined || d === undefined || e === undefined) continue;
      indices.push(a, d, b, b, d, e);
    }
  }

  return {
    positions: new Float32Array(posList),
    indices: new Uint32Array(indices),
    uvs: new Float32Array(uvList),
  };
}

function buildClosedCubeSphereMesh(subdivisions: number): {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
} {
  const posList: number[] = [];
  const vertKeyMap = new Map<string, number>();
  const indices: number[] = [];

  const addVert = (x: number, y: number, z: number): number => {
    const len = Math.hypot(x, y, z) || 1;
    const sx = x / len;
    const sy = y / len;
    const sz = z / len;
    const key = `${Math.round(sx * 1e5)},${Math.round(sy * 1e5)},${Math.round(sz * 1e5)}`;
    const existing = vertKeyMap.get(key);
    if (existing !== undefined) return existing;
    const id = posList.length / 3;
    posList.push(sx, sy, sz);
    vertKeyMap.set(key, id);
    return id;
  };

  const faces: readonly (readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]])[] = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ];

  for (const [n, uAxis, vAxis] of faces) {
    const grid: number[][] = [];
    for (let r = 0; r <= subdivisions; r += 1) {
      const row: number[] = [];
      const tv = (r / subdivisions) * 2 - 1;
      for (let c = 0; c <= subdivisions; c += 1) {
        const tu = (c / subdivisions) * 2 - 1;
        row.push(
          addVert(
            n[0] + uAxis[0] * tu + vAxis[0] * tv,
            n[1] + uAxis[1] * tu + vAxis[1] * tv,
            n[2] + uAxis[2] * tu + vAxis[2] * tv,
          ),
        );
      }
      grid.push(row);
    }
    for (let r = 0; r < subdivisions; r += 1) {
      const g0 = grid[r];
      const g1 = grid[r + 1];
      if (!g0 || !g1) continue;
      for (let c = 0; c < subdivisions; c += 1) {
        const a = g0[c];
        const b = g0[c + 1];
        const d = g1[c];
        const e = g1[c + 1];
        if (a === undefined || b === undefined || d === undefined || e === undefined) continue;
        indices.push(a, b, e, a, e, d);
      }
    }
  }

  return {
    positions: new Float32Array(posList),
    indices: new Uint32Array(indices),
  };
}

function buildMixamoSourceSkeleton(scale = 1.2): readonly SourceBoneRestSpec[] {
  const id: Quat4 = [0, 0, 0, 1];
  const s = (x: number, y: number, z: number): readonly [number, number, number] => [x * scale, y * scale, z * scale];
  return [
    { name: "mixamorig:Hips", parent: null, restLocalPosition: s(0, 0.95, 0), restLocalRotation: id },
    { name: "mixamorig:Spine", parent: "mixamorig:Hips", restLocalPosition: s(0, 0.14, 0), restLocalRotation: id },
    { name: "mixamorig:Spine1", parent: "mixamorig:Spine", restLocalPosition: s(0, 0.16, 0), restLocalRotation: id },
    { name: "mixamorig:Spine2", parent: "mixamorig:Spine1", restLocalPosition: s(0, 0.14, 0), restLocalRotation: id },
    { name: "mixamorig:Neck", parent: "mixamorig:Spine2", restLocalPosition: s(0, 0.12, 0), restLocalRotation: id },
    { name: "mixamorig:Head", parent: "mixamorig:Neck", restLocalPosition: s(0, 0.12, 0), restLocalRotation: id },
    { name: "mixamorig:LeftShoulder", parent: "mixamorig:Spine2", restLocalPosition: s(0.09, 0.04, 0), restLocalRotation: id },
    { name: "mixamorig:LeftArm", parent: "mixamorig:LeftShoulder", restLocalPosition: s(0.1, 0, 0), restLocalRotation: id },
    { name: "mixamorig:LeftForeArm", parent: "mixamorig:LeftArm", restLocalPosition: s(0.28, 0, 0), restLocalRotation: id },
    { name: "mixamorig:LeftHand", parent: "mixamorig:LeftForeArm", restLocalPosition: s(0.26, 0, 0), restLocalRotation: id },
    { name: "mixamorig:RightShoulder", parent: "mixamorig:Spine2", restLocalPosition: s(-0.09, 0.04, 0), restLocalRotation: id },
    { name: "mixamorig:RightArm", parent: "mixamorig:RightShoulder", restLocalPosition: s(-0.1, 0, 0), restLocalRotation: id },
    { name: "mixamorig:RightForeArm", parent: "mixamorig:RightArm", restLocalPosition: s(-0.28, 0, 0), restLocalRotation: id },
    { name: "mixamorig:RightHand", parent: "mixamorig:RightForeArm", restLocalPosition: s(-0.26, 0, 0), restLocalRotation: id },
    { name: "mixamorig:LeftUpLeg", parent: "mixamorig:Hips", restLocalPosition: s(0.1, -0.04, 0), restLocalRotation: id },
    { name: "mixamorig:LeftLeg", parent: "mixamorig:LeftUpLeg", restLocalPosition: s(0, -0.43, 0), restLocalRotation: id },
    { name: "mixamorig:LeftFoot", parent: "mixamorig:LeftLeg", restLocalPosition: s(0, -0.41, 0), restLocalRotation: id },
    { name: "mixamorig:RightUpLeg", parent: "mixamorig:Hips", restLocalPosition: s(-0.1, -0.04, 0), restLocalRotation: id },
    { name: "mixamorig:RightLeg", parent: "mixamorig:RightUpLeg", restLocalPosition: s(0, -0.43, 0), restLocalRotation: id },
    { name: "mixamorig:RightFoot", parent: "mixamorig:RightLeg", restLocalPosition: s(0, -0.41, 0), restLocalRotation: id },
  ];
}

function quatAbsDot(a: Quat4, b: Quat4): number {
  return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
}

function buildCelGradientTexture(width: number, height: number, withAlphaRamp = false): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const o = (y * width + x) * 4;
      // 웹툰 셀 음영처럼 부드러운 피부/의상 그라데이션 + 대각 경계
      const band = u + v > 1.05 ? 1 : 0;
      rgba[o] = Math.round(band ? 228 - u * 35 : 82 + u * 60);
      rgba[o + 1] = Math.round(band ? 186 - v * 30 : 108 + v * 52);
      rgba[o + 2] = Math.round(band ? 162 - u * 20 : 168 + (1 - u) * 40);
      rgba[o + 3] = withAlphaRamp ? Math.round(40 + 215 * (0.5 * u + 0.5 * v)) : 255;
    }
  }
  return rgba;
}

describe("wasm64-3d-neural-sim: QEM 데시메이터 & 휴머노이드 오토 리타게터", () => {
  it("곡면 격자 메시를 목표 비율로 QEM 데시메이션하며 퇴화면 0·경계/바운드를 보존한다", () => {
    const mesh = buildCurvedGridMesh(12, 12, false);
    const tier = probeMeshAccelTier();
    expect(tier.zeroServerCost).toBe(true);

    const result = decimateMeshQem(mesh, {
      targetRatio: 0.45,
      preserveBoundaryEdges: true,
      preventFaceFlip: true,
    });

    expect(result.originalTriangleCount).toBe(288);
    expect(result.decimatedTriangleCount).toBeLessThanOrEqual(140);
    expect(result.decimatedTriangleCount).toBeGreaterThanOrEqual(40);
    expect(result.degenerateFaceCount).toBe(0);
    expect(result.collapseCount).toBeGreaterThan(20);
    expect(result.preservedBoundaryEdgeCount).toBeGreaterThan(0);

    // 외곽 경계 X/Z 바운드 보존 검증
    expect(Math.abs(result.bounds.min[0] - -1)).toBeLessThan(1e-3);
    expect(Math.abs(result.bounds.max[0] - 1)).toBeLessThan(1e-3);
    expect(Math.abs(result.bounds.min[2] - -1)).toBeLessThan(1e-3);
    expect(Math.abs(result.bounds.max[2] - 1)).toBeLessThan(1e-3);
    expect(result.bounds.max[1]).toBeGreaterThan(0.15);

    for (let i = 0; i + 2 < result.normals.length; i += 3) {
      const len = Math.hypot(result.normals[i], result.normals[i + 1], result.normals[i + 2]);
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it("폐곡면 수밀 큐브-스피어 메시를 데시메이션해 0-퇴화면 및 구면 바운드를 유지한다", () => {
    const sphere = buildClosedCubeSphereMesh(4);
    const result = decimateMeshQem(sphere, {
      targetRatio: 0.5,
      preserveBoundaryEdges: true,
      preventFaceFlip: true,
    });

    expect(result.originalTriangleCount).toBe(192);
    expect(result.decimatedTriangleCount).toBeLessThanOrEqual(105);
    expect(result.decimatedTriangleCount).toBeGreaterThanOrEqual(48);
    expect(result.degenerateFaceCount).toBe(0);
    expect(result.bounds.min[0]).toBeLessThan(-0.9);
    expect(result.bounds.max[0]).toBeGreaterThan(0.9);
    expect(result.bounds.min[1]).toBeLessThan(-0.9);
    expect(result.bounds.max[1]).toBeGreaterThan(0.9);
  });

  it("UV 심 분할 메시에서 UV 심 에지를 식별·보존하고 모든 출력 UV를 유한 값으로 유지한다", () => {
    const splitMesh = buildCurvedGridMesh(10, 10, true);
    const result = decimateMeshQem(splitMesh, {
      targetRatio: 0.55,
      preserveBoundaryEdges: true,
      preserveUvSeams: true,
    });

    expect(result.decimatedTriangleCount).toBeLessThan(result.originalTriangleCount);
    expect(result.degenerateFaceCount).toBe(0);
    expect(result.preservedUvSeamEdgeCount).toBeGreaterThan(0);
    expect(result.uvs).toBeDefined();
    if (result.uvs) {
      expect(result.uvs.length).toBe(result.decimatedVertexCount * 2);
      for (let i = 0; i < result.uvs.length; i += 1) {
        expect(Number.isFinite(result.uvs[i])).toBe(true);
      }
    }
  });

  it("Mixamo · VRM · FBX · Blender Rigify 본 별칭을 ToonStudio 표준 본으로 정확히 해석한다", () => {
    expect(resolveHumanoidBoneName("mixamorig:Hips")).toBe("hips");
    expect(resolveHumanoidBoneName("mixamorig1:LeftForeArm")).toBe("leftLowerArm");
    expect(resolveHumanoidBoneName("mixamorig:RightUpLeg")).toBe("rightUpperLeg");
    expect(resolveHumanoidBoneName("J_Bip_L_UpperArm")).toBe("leftUpperArm");
    expect(resolveHumanoidBoneName("J_Bip_R_LowerLeg")).toBe("rightLowerLeg");
    expect(resolveHumanoidBoneName("DEF-upper_arm.L")).toBe("leftUpperArm");
    expect(resolveHumanoidBoneName("DEF-shin.R")).toBe("rightLowerLeg");
    expect(resolveHumanoidBoneName("DEF-spine.006")).toBe("head");
    expect(resolveHumanoidBoneName("pelvis")).toBe("hips");
    expect(resolveHumanoidBoneName("clavicle_r")).toBe("rightShoulder");
    expect(resolveHumanoidBoneName("Bip01_L_Hand")).toBe("leftHand");
  });

  it("Mixamo A-pose → ToonStudio T-pose 델타 쿼터니언 정합성과 사지 스케일·Wave-2 IK 힌트를 보장한다", () => {
    const sourceBones = buildMixamoSourceSkeleton(1.2); // hips Y = 1.14m
    const aPoseRad = (40 * Math.PI) / 180;
    const armRestA = quaternionFromAxisAngle([0, 0, 1], -aPoseRad);
    const armLiftDelta = quaternionFromAxisAngle([1, 0, 0], (35 * Math.PI) / 180);
    // 소스 A-pose 월드 공간에서 armLiftDelta 만큼 회전된 프레임 로컬 회전 구성
    const animatedLeftArmLocal = multiplyQuaternions(armLiftDelta, armRestA);

    const retargeted = retargetHumanoidAnimation({
      sourceBones,
      sourceRestPose: "A-pose",
      aPoseArmAngleRad: aPoseRad,
      frames: [
        {
          timeSec: 0,
          rootTranslation: [0.24, 1.14, 0.12],
          localRotations: {
            "mixamorig:LeftArm": animatedLeftArmLocal,
          },
        },
        {
          timeSec: 0.5,
          rootTranslation: [0.24, -0.2, 0.12],
          localRotations: {
            "mixamorig:LeftArm": animatedLeftArmLocal,
          },
        },
      ],
      targetRig: {
        restPose: "T-pose",
        hipHeightMeters: 0.95,
        floorY: 0,
        footSoleOffset: 0.04,
      },
    });

    expect(retargeted.sourceConvention).toBe("mixamo");
    expect(Object.keys(retargeted.mappedBones).length).toBe(20);
    expect(retargeted.hipScaleRatio).toBeCloseTo(0.95 / 1.14, 5);

    // A-pose 소스에서 +35° X 델타 적용 시 T-pose 타깃 월드 회전도 정확히 +35° X가 되어야 함
    const frame0 = retargeted.frames[0];
    const frame1 = retargeted.frames[1];
    expect(frame0).toBeDefined();
    expect(frame1).toBeDefined();
    if (frame0 && frame1) {
      const targetLeftArmWorld = frame0.worldRotations.leftUpperArm;
      expect(targetLeftArmWorld).toBeDefined();
      if (targetLeftArmWorld) {
        expect(quatAbsDot(targetLeftArmWorld, armLiftDelta)).toBeGreaterThan(0.9999);
      }
      expect(frame0.rootTranslation[1]).toBeCloseTo(0.95, 4);
      expect(frame0.rootTranslation[0]).toBeCloseTo(0.24 * (0.95 / 1.14), 4);
      // 바닥 클램프 검증
      expect(frame1.rootTranslation[1]).toBeGreaterThanOrEqual(0.04);
    }

    // Wave-2 Rust humanoid_body_ik_kernel 호환 힌트 검증
    expect(retargeted.ikKernelHints.leftArm.upperLength).toBeGreaterThan(0.2);
    expect(retargeted.ikKernelHints.leftLeg.floorY).toBe(0);
    expect(retargeted.ikKernelHints.leftLeg.footSoleOffset).toBe(0.04);
    expect(retargeted.ikKernelHints.spineChain.jointNames).toEqual([
      "hips",
      "spine",
      "chest",
      "upperChest",
      "neck",
      "head",
    ]);
    expect(retargeted.ikKernelHints.spineChain.restBoneLengths.length).toBe(5);
  });

  it("Blender Rigify T-pose → ToonStudio A-pose 역변환 리타게팅 정합성을 검증한다", () => {
    const id: Quat4 = [0, 0, 0, 1];
    const rigifyBones: readonly SourceBoneRestSpec[] = [
      { name: "DEF-hips", parent: null, restLocalPosition: [0, 1.0, 0], restLocalRotation: id },
      { name: "DEF-spine.003", parent: "DEF-hips", restLocalPosition: [0, 0.42, 0], restLocalRotation: id },
      { name: "DEF-shoulder.L", parent: "DEF-spine.003", restLocalPosition: [0.09, 0.04, 0], restLocalRotation: id },
      { name: "DEF-upper_arm.L", parent: "DEF-shoulder.L", restLocalPosition: [0.1, 0, 0], restLocalRotation: id },
      { name: "DEF-forearm.L", parent: "DEF-upper_arm.L", restLocalPosition: [0.27, 0, 0], restLocalRotation: id },
      { name: "DEF-hand.L", parent: "DEF-forearm.L", restLocalPosition: [0.24, 0, 0], restLocalRotation: id },
    ];
    const aPoseRad = (36 * Math.PI) / 180;
    const waveDelta = quaternionFromAxisAngle([0, 1, 0], (25 * Math.PI) / 180);
    const res = retargetHumanoidAnimation({
      sourceBones: rigifyBones,
      sourceRestPose: "T-pose",
      aPoseArmAngleRad: aPoseRad,
      frames: [{ timeSec: 0, localRotations: { "DEF-upper_arm.L": waveDelta } }],
      targetRig: { restPose: "A-pose", hipHeightMeters: 0.94 },
    });

    expect(res.sourceConvention).toBe("rigify");
    const tgtRestA = quaternionFromAxisAngle([0, 0, 1], -aPoseRad);
    const expectedWorld = multiplyQuaternions(waveDelta, tgtRestA);
    const actualWorld = res.frames[0]?.worldRotations.leftUpperArm;
    expect(actualWorld).toBeDefined();
    if (actualWorld) expect(quatAbsDot(actualWorld, expectedWorld)).toBeGreaterThan(0.9999);
  });
});

describe("wasm64-3d-neural-sim: 120Hz XPBD 의상·헤어 물리 시뮬레이터", () => {
  it("120Hz 서브스테핑으로 중력+돌풍 의상을 120프레임 안정 적분하며 고정 정점 0-드리프트를 보장한다", () => {
    const cloth = createClothGridAsset({
      kind: "cape",
      columns: 8,
      rows: 8,
      widthMeters: 0.7,
      heightMeters: 0.9,
      origin: [0, 1.45, 0],
    });
    const solver = new XpbdClothHairSolver(cloth, {
      substepHz: 120,
      constraintIterations: 3,
      wind: {
        baseVelocity: [0, 0, 3.2],
        gustStrength: 2.1,
        gustFrequencyHz: 1.1,
        dragCoefficient: 1.1,
      },
    });

    let lastMetrics = solver.step(1 / 60);
    for (let f = 1; f < 120; f += 1) {
      lastMetrics = solver.step(1 / 60);
      expect(lastMetrics.hasNonFinite).toBe(false);
      expect(lastMetrics.pinnedMaxDrift).toBe(0);
    }

    expect(lastMetrics.substepsExecuted).toBeGreaterThanOrEqual(2);
    expect(lastMetrics.effectiveHz).toBeGreaterThanOrEqual(119.5);
    expect(lastMetrics.maxStretchRatio).toBeLessThan(1.18);
    expect(lastMetrics.kineticEnergy).toBeGreaterThan(0);
    expect(lastMetrics.kineticEnergy).toBeLessThan(200);
    expect(lastMetrics.residualBackend).toBe("deterministic-cpu-fallback");

    // 바람(+Z) 방향으로 하단 자락이 실제로 날렸는지 검증
    let bottomZSum = 0;
    const bottomRowStart = 7 * 8;
    for (let c = 0; c < 8; c += 1) {
      bottomZSum += solver.positions[(bottomRowStart + c) * 3 + 2];
    }
    expect(bottomZSum / 8).toBeGreaterThan(0.05);
  });

  it("인체 캡슐·구체 충돌 투영을 준수하며 헤어 가닥과 의상이 관통하지 않는다", () => {
    const hair = createHairStrandBundleAsset({
      strandCount: 6,
      segmentsPerStrand: 7,
      segmentLengthMeters: 0.075,
      rootArcRadiusMeters: 0.09,
      origin: [0, 1.68, 0],
    });
    const solver = new XpbdClothHairSolver(hair, {
      substepHz: 120,
      constraintIterations: 4,
      collisionThickness: 0.004,
      wind: { baseVelocity: [0, 0, 1.8], gustStrength: 0.8, gustFrequencyHz: 0.9 },
      sphereColliders: [{ id: "head", center: [0, 1.56, 0], radius: 0.105, friction: 0.2 }],
      capsuleColliders: [
        { id: "shoulders", start: [-0.22, 1.38, 0], end: [0.22, 1.38, 0], radius: 0.085, friction: 0.3 },
      ],
    });

    let totalContacts = 0;
    let worstCapsulePen = 0;
    let worstSpherePen = 0;
    for (let f = 0; f < 90; f += 1) {
      const m = solver.step(1 / 60);
      expect(m.hasNonFinite).toBe(false);
      expect(m.pinnedMaxDrift).toBe(0);
      totalContacts += m.collisionContactCount;
      worstCapsulePen = Math.max(worstCapsulePen, m.maxCapsulePenetration);
      worstSpherePen = Math.max(worstSpherePen, m.maxSpherePenetration);
    }

    expect(totalContacts).toBeGreaterThan(0);
    expect(worstCapsulePen).toBeLessThanOrEqual(5e-4);
    expect(worstSpherePen).toBeLessThanOrEqual(5e-4);
  });

  it("사용자 지정 WebNN 신경망 잔차 훅을 안전하게 연결하고 NaN 입력을 차단한다", () => {
    const probe = probeWebNnClothResidualSupport();
    expect(probe.zeroServerCost).toBe(true);

    const cloth = createClothGridAsset({ columns: 4, rows: 4, widthMeters: 0.4, heightMeters: 0.4 });
    const mockHook: NeuralClothResidualHook = {
      backend: "webnn-npu",
      predictVelocityResidual(input) {
        const deltas = new Float32Array(input.velocities.length);
        // 의도적 NaN 1개와 유효 잔차 혼합 → 솔버가 NaN을 안전히 무시해야 함
        deltas[3] = Number.NaN;
        deltas[4] = 0.05;
        deltas[5] = 0.12;
        return { velocityDeltas: deltas, backend: "webnn-npu", appliedEnergyRatio: 0.05 };
      },
    };
    const solver = new XpbdClothHairSolver(cloth, { substepHz: 120, neuralResidualHook: mockHook });
    const metrics = solver.step(1 / 60);
    expect(metrics.residualBackend).toBe("webnn-npu");
    expect(metrics.hasNonFinite).toBe(false);
    expect(metrics.pinnedMaxDrift).toBe(0);
  });

  it("수평 천이 인체 캡슐 콜라이더 위로 낙하 드레이핑될 때 관통 없이 안정 안착한다", () => {
    const drape = createClothGridAsset({
      kind: "skirt",
      columns: 7,
      rows: 7,
      widthMeters: 0.6,
      heightMeters: 0.6,
      origin: [0, 1.35, -0.3],
      orientation: "horizontal-xz",
      pinnedIndices: [],
    });
    const solver = new XpbdClothHairSolver(drape, {
      substepHz: 120,
      constraintIterations: 4,
      capsuleColliders: [
        { id: "torso", start: [-0.25, 1.15, 0], end: [0.25, 1.15, 0], radius: 0.14, friction: 0.35 },
      ],
    });
    let contacts = 0;
    let worstPen = 0;
    for (let f = 0; f < 90; f += 1) {
      const m = solver.step(1 / 60);
      expect(m.hasNonFinite).toBe(false);
      contacts += m.collisionContactCount;
      worstPen = Math.max(worstPen, m.maxCapsulePenetration);
    }
    expect(contacts).toBeGreaterThan(10);
    expect(worstPen).toBeLessThanOrEqual(5e-4);
  });
});

describe("wasm64-3d-neural-sim: 4×4 블록 텍스처 코덱 · 2× 업스케일러 · NPR UV 베이커", () => {
  it("8:1(BC1) 및 4:1(BC3) 4×4 블록 압축이 4× 이상 메모리 절감과 높은 PSNR을 달성한다", () => {
    const rgbaOpaque = buildCelGradientTexture(64, 64, false);
    const bc1 = compressBlockTexture({ width: 64, height: 64, rgba: rgbaOpaque }, "bc1-rgb565-8to1");
    expect(bc1.telemetry.compressionRatio).toBe(8);
    expect(bc1.telemetry.compressedByteLength).toBe(2048);
    expect(bc1.telemetry.psnrRgbDb).toBeGreaterThanOrEqual(34);

    const decodedBc1 = decompressBlockTexture(bc1);
    expect(decodedBc1.rgba.length).toBe(rgbaOpaque.length);

    const rgbaAlpha = buildCelGradientTexture(64, 64, true);
    const bc3 = compressBlockTexture({ width: 64, height: 64, rgba: rgbaAlpha }, "bc3-rgba-4to1");
    expect(bc3.telemetry.compressionRatio).toBe(4);
    expect(bc3.telemetry.compressedByteLength).toBe(4096);
    expect(bc3.telemetry.psnrRgbDb).toBeGreaterThanOrEqual(34);
    expect(bc3.telemetry.psnrRgbaDb).toBeGreaterThanOrEqual(34);
  });

  it("2× 에지-디렉티드 업스케일러가 해상도를 2배로 키우고 WebNN 프로바이더를 탐지한다", () => {
    const providers = probeWebNnExecutionProviders();
    expect(providers.zeroServerCost).toBe(true);
    expect(providers.availableProviders).toContain("cpu-deterministic");

    const src = buildCelGradientTexture(32, 32, false);
    const up = upscaleTexture2xEdgeDirected({ width: 32, height: 32, rgba: src });
    expect(up.width).toBe(64);
    expect(up.height).toBe(64);
    expect(up.rgba.length).toBe(64 * 64 * 4);
    expect(up.edgePixelRatio).toBeGreaterThan(0.03);
    expect(up.provider).toBe("cpu-deterministic");
  });

  it("아티스트 NPR 스타일 트랜스퍼·셀 섀도우·Cavity AO·심 딜레이션을 UV 아틀라스로 베이크한다", () => {
    const w = 32;
    const h = 32;
    const albedo = buildCelGradientTexture(w, h, false);
    const normals = new Uint8ClampedArray(w * h * 4);
    const cavityAo = new Float32Array(w * h);
    const uvMask = new Uint8Array(w * h);

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        const o = idx * 4;
        const u = (x / (w - 1)) * 2 - 1;
        const v = (y / (h - 1)) * 2 - 1;
        const nz = Math.sqrt(Math.max(0.05, 1 - Math.min(0.95, u * u * 0.45 + v * v * 0.45)));
        normals[o] = Math.round((u * 0.65 * 0.5 + 0.5) * 255);
        normals[o + 1] = Math.round((v * 0.65 * 0.5 + 0.5) * 255);
        normals[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        normals[o + 3] = 255;
        cavityAo[idx] = x < 8 ? 0.25 : 0.95;
        uvMask[idx] = x >= 2 && x <= w - 3 && y >= 2 && y <= h - 3 ? 1 : 0;
      }
    }

    const baked = bakeStylizedUvTexture(
      { width: w, height: h, albedoRgba: albedo, normalMapRgba: normals, cavityAo, uvCoverageMask: uvMask },
      {
        keyLightDirection: [0.6, 0.55, 0.58],
        celBandCount: 3,
        aoStrength: 0.75,
        palette: [
          [0.92, 0.78, 0.68],
          [0.45, 0.52, 0.72],
          [0.18, 0.2, 0.3],
        ],
        paletteBlend: 0.5,
        brushGrainStrength: 0.06,
        seamDilationPx: 2,
        compressMode: "bc1-rgb565-8to1",
      },
    );

    expect(baked.width).toBe(w);
    expect(baked.height).toBe(h);
    expect(baked.celBandHistogram.length).toBe(3);
    expect(baked.celBandHistogram.reduce((acc, n) => acc + n, 0)).toBe(w * h);
    expect(baked.paletteSnappedRatio).toBe(1);
    expect(baked.dilatedSeamTexels).toBeGreaterThan(0);
    expect(baked.rimLitTexelRatio).toBeGreaterThan(0);
    expect(baked.compressed?.telemetry.compressionRatio).toBe(8);

    // Cavity AO가 낮은 좌측 영역이 우측보다 평균적으로 더 어둡게 베이크되어야 함
    let leftLuma = 0;
    let rightLuma = 0;
    for (let y = 8; y < 24; y += 1) {
      const lo = (y * w + 4) * 4;
      const ro = (y * w + 24) * 4;
      leftLuma += baked.rgba[lo] + baked.rgba[lo + 1] + baked.rgba[lo + 2];
      rightLuma += baked.rgba[ro] + baked.rgba[ro + 1] + baked.rgba[ro + 2];
    }
    expect(leftLuma).toBeLessThan(rightLuma);
  });
});

describe("wasm64-3d-neural-sim: 크로스 플랫폼 CRDT 동기화 & 시선 연동 조명 컨트롤러", () => {
  it("Desktop · Mobile · Web 3-복제본 동시 편집이 병합 순서와 무관하게 동일 매니페스트로 수렴한다", () => {
    const desktop = new CrossPlatform3dAssetCrdt("replica-desktop", "desktop", "char-hero-01");
    const mobile = new CrossPlatform3dAssetCrdt("replica-mobile", "mobile", "char-hero-01");
    const web = new CrossPlatform3dAssetCrdt("replica-web", "web", "char-hero-01");

    desktop.updateAssetMetadata(
      { title: "Heroine V2", format: "vrm", meshTriangleCount: 18400, compressionProfile: "bc1-rgb565-8to1" },
      1000,
    );
    desktop.updateRigPreset({ restPose: "T-pose", clothSubstepHz: 120, floorY: 0 }, 1010);
    desktop.setTag("heroine", true, 1020);

    // 모바일·웹에서 오프라인 동시 충돌 편집
    mobile.updateLightingRig({ keyDirection: [0.2, 0.8, 0.56], celBandCount: 4, rimIntensity: 0.6 }, 1050);
    mobile.updateRigPreset({ activePosePresetId: "xp_wave_greeting", hairStiffness: 0.84 }, 1055);
    mobile.setTag("mobile-baked", true, 1060);

    web.updateLightingRig({ keyDirection: [-0.3, 0.7, 0.64], celBandCount: 3, gazeSyncEnabled: true }, 1080);
    web.updateAssetMetadata({ title: "Heroine V2 Final" }, 1090);

    const dDesktop = desktop.exportDeltaBinary();
    const dMobile = mobile.exportDeltaBinary();
    const dWeb = web.exportDeltaJson();

    // 서로 다른 병합 순서로 적용
    desktop.importDeltaBinary(dMobile);
    desktop.importDeltaJson(dWeb);

    mobile.importDeltaJson(dWeb);
    mobile.importDeltaBinary(dDesktop);

    web.importDeltaBinary(dDesktop);
    web.importDeltaBinary(dMobile);
    // 멱등성 검증: 중복 병합
    const dupSummary = web.importDeltaBinary(dMobile);
    expect(dupSummary.appliedEntries).toBe(0);

    const mDesktop = desktop.materializeManifest();
    const mMobile = mobile.materializeManifest();
    const mWeb = web.materializeManifest();

    expect(mDesktop).toEqual(mMobile);
    expect(mMobile).toEqual(mWeb);
    expect(mDesktop.assetMetadata.title).toBe("Heroine V2 Final");
    expect(mDesktop.lightingRig.celBandCount).toBe(3);
    expect(mDesktop.rigPreset.activePosePresetId).toBe("xp_wave_greeting");
    expect(mDesktop.tags).toEqual(["heroine", "mobile-baked"]);

    // 동기화 이후 증분 델타는 0건이어야 함
    const incDelta = desktop.computeDeltaSince(mobile.getVectorClock());
    expect(incDelta.entries.length).toBe(0);
    expect(compareVectorClocks(desktop.getVectorClock(), mobile.getVectorClock())).toBe("equal");

    // 인과적 후속 편집(causal override) 검증: 시계가 역행해도 벡터 시계 인과 우세로 덮어써야 함
    mobile.updateLightingRig({ celBandCount: 2 }, 900);
    const causalMerge = desktop.importDeltaBinary(mobile.exportDeltaBinary(desktop.getVectorClock()));
    expect(causalMerge.causalOverrides).toBeGreaterThanOrEqual(1);
    expect(desktop.materializeManifest().lightingRig.celBandCount).toBe(2);
  });

  it("CRDT 바이너리 패킷 변조를 FNV-1a 체크섬으로 즉시 탐지·차단한다", () => {
    const sender = new CrossPlatform3dAssetCrdt("rep-a", "desktop", "prop-sword");
    sender.updateAssetMetadata({ title: "Katana", meshTriangleCount: 4200 }, 2000);
    const bin = sender.exportDeltaBinary();

    const tampered = new Uint8Array(bin);
    tampered[tampered.length - 1] ^= 0xff;

    const receiver = new CrossPlatform3dAssetCrdt("rep-b", "mobile", "prop-sword");
    expect(() => receiver.importDeltaBinary(tampered)).toThrow();
  });

  it("임계 감쇠 스프링 시선-조명 컨트롤러가 오버슈트 0 수렴·지터 데드존·소프트 클램프를 유지한다", () => {
    const ctrl = new GazePoseLightController({
      neutralAzimuthRad: 0,
      neutralElevationRad: 0.4,
      deadzoneRad: 0.04,
      maxAzimuthRad: 1.2,
      minElevationRad: -0.2,
      maxElevationRad: 1.15,
      naturalFrequencyHz: 2.5,
      minConfidence: 0.5,
    });

    // 1) 데드존 내부 미세 지터 무시 검증
    const jitterState = ctrl.update(
      { headYawRad: 0.015, headPitchRad: -0.01, gazeX: 0.02, gazeY: -0.01, confidence: 0.95 },
      1 / 60,
    );
    expect(jitterState.isInDeadzone).toBe(true);
    expect(Math.abs(jitterState.azimuthRad)).toBeLessThan(1e-6);

    // 2) 스텝 입력에 대한 임계 감쇠 무-오버슈트 수렴 검증
    let peakAz = 0;
    let state = jitterState;
    for (let i = 0; i < 120; i += 1) {
      state = ctrl.update(
        { headYawRad: 0.7, headPitchRad: 0.35, gazeX: 0.4, gazeY: 0.25, confidence: 0.98 },
        1 / 60,
      );
      peakAz = Math.max(peakAz, state.azimuthRad);
    }
    expect(state.isSettled).toBe(true);
    expect(peakAz).toBeLessThanOrEqual(state.targetAzimuthRad + 1e-4);
    expect(state.azimuthRad).toBeCloseTo(state.targetAzimuthRad, 3);

    // 단위 벡터 정규화 검증
    const keyLen = Math.hypot(...state.keyLightDirection);
    const rimLen = Math.hypot(...state.rimLightDirection);
    const fillLen = Math.hypot(...state.fillLightDirection);
    expect(keyLen).toBeCloseTo(1, 5);
    expect(rimLen).toBeCloseTo(1, 5);
    expect(fillLen).toBeCloseTo(1, 5);

    // 3) 극단 각도 소프트 클램핑 검증
    for (let i = 0; i < 90; i += 1) {
      state = ctrl.update(
        { headYawRad: Math.PI, headPitchRad: Math.PI * 0.5, gazeX: 1, gazeY: 1, confidence: 1 },
        1 / 60,
      );
    }
    expect(state.azimuthRad).toBeLessThanOrEqual(1.2);
    expect(state.elevationRad).toBeLessThanOrEqual(1.15);

    // 4) 저신뢰도 프레임 홀드 검증
    const lockedBeforeLowConf = state.targetAzimuthRad;
    const lowConfState = ctrl.update(
      { headYawRad: -1.5, headPitchRad: -1.0, gazeX: -1, gazeY: -1, confidence: 0.1 },
      1 / 60,
    );
    expect(lowConfState.confidenceAccepted).toBe(false);
    expect(lowConfState.targetAzimuthRad).toBeCloseTo(lockedBeforeLowConf, 6);
  });
});
