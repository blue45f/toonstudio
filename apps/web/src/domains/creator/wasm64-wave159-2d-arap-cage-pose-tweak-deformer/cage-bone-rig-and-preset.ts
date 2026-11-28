/**
 * Wave 159: 2D 웹툰 캐릭터 리깅 메쉬 생성기, 해부학 각도 제한 본 체인 FK 솔버,
 * 그리고 Floater-Hormann 평균값 좌표(Mean Value Coordinates, MVC) 케이지 변형기.
 */

import type {
  ArapBodyRegion,
  ArapBoneChain2d,
  ArapMesh2d,
  ArapMeshVertex2d,
  ArapPinHandle,
  ArapTriangle,
  BoneAngleRequest,
  BoneChainPoseSolution,
  BoneClampAuditItem,
  CagePolygon2d,
  CharacterRigLandmarkIndices,
  CharacterRigPreset,
  MvcCoordinateRow,
  Vec2,
} from "./arap-deform-types";
import { triangleSignedArea2d } from "./arap-mesh-graph-and-audit";

const MVC_EPSILON = 1e-10;
const DEG_TO_RAD = Math.PI / 180;

function normalizeUv(x: number, y: number): { readonly u: number; readonly v: number } {
  const u = Math.max(0, Math.min(1, (x - 20) / 360));
  const v = Math.max(0, Math.min(1, (y - 50) / 300));
  return { u, v };
}

function makePositiveTriangle(
  vertices: readonly ArapMeshVertex2d[],
  a: number,
  b: number,
  c: number,
): ArapTriangle {
  const area = triangleSignedArea2d(vertices[a], vertices[b], vertices[c]);
  return area >= 0 ? [a, b, c] : [a, c, b];
}

/**
 * 결정론적 2D 캐릭터 상반신(머리·몸통·좌우 팔) 삼각화 메쉬와 기본 본 체인·케이지 프리셋을 생성한다.
 * 모든 삼각형은 엄격히 양의 부호 넓이(`signedArea > 0`)를 만족하며 수밀 연결 단일 메쉬를 이룬다.
 */
export function createSampleCharacterRigMesh(
  meshId = "wave159-webtoon-hero-upper-rig",
): CharacterRigPreset {
  const vertices: ArapMeshVertex2d[] = [];
  const triangles: ArapTriangle[] = [];

  const pushVertex = (id: string, x: number, y: number, region: ArapBodyRegion): number => {
    const { u, v } = normalizeUv(x, y);
    const idx = vertices.length;
    vertices.push({ id, x, y, u, v, region });
    return idx;
  };

  // 1. 몸통 그리드: 5열(좌측 끝, 좌측 내측, 정중선, 우측 내측, 우측 끝) × 7행
  const torsoXs = [152, 176, 200, 224, 248] as const;
  const torsoYs = [130, 150, 170, 210, 250, 290, 330] as const;
  const torsoGrid: number[][] = [];

  for (let row = 0; row < torsoYs.length; row += 1) {
    const rowIndices: number[] = [];
    const region: ArapBodyRegion = row >= 5 ? "hips" : "torso";
    for (let col = 0; col < torsoXs.length; col += 1) {
      const idx = pushVertex(
        `torso_r${row}_c${col}`,
        torsoXs[col],
        torsoYs[row],
        region,
      );
      rowIndices.push(idx);
    }
    torsoGrid.push(rowIndices);
  }

  for (let row = 0; row < torsoYs.length - 1; row += 1) {
    for (let col = 0; col < torsoXs.length - 1; col += 1) {
      const v00 = torsoGrid[row][col];
      const v10 = torsoGrid[row][col + 1];
      const v11 = torsoGrid[row + 1][col + 1];
      const v01 = torsoGrid[row + 1][col];
      triangles.push(makePositiveTriangle(vertices, v00, v10, v11));
      triangles.push(makePositiveTriangle(vertices, v00, v11, v01));
    }
  }

  // 2. 머리: 목(col 1..3, row 0)에 자연스럽게 접합
  const neckLeft = torsoGrid[0][1];
  const neckBase = torsoGrid[0][2];
  const neckRight = torsoGrid[0][3];

  const headNeckLeft = pushVertex("head_neck_left", 180, 106, "head");
  const headNeckMid = pushVertex("head_neck_mid", 200, 106, "head");
  const headNeckRight = pushVertex("head_neck_right", 220, 106, "head");

  const headCheekLeft = pushVertex("head_cheek_left", 172, 82, "head");
  const headCenter = pushVertex("head_center", 200, 82, "head");
  const headCheekRight = pushVertex("head_cheek_right", 228, 82, "head");

  const headCrown = pushVertex("head_crown", 200, 58, "head");

  triangles.push(makePositiveTriangle(vertices, headNeckLeft, headNeckMid, neckBase));
  triangles.push(makePositiveTriangle(vertices, headNeckLeft, neckBase, neckLeft));
  triangles.push(makePositiveTriangle(vertices, headNeckMid, headNeckRight, neckRight));
  triangles.push(makePositiveTriangle(vertices, headNeckMid, neckRight, neckBase));

  triangles.push(makePositiveTriangle(vertices, headCheekLeft, headCenter, headNeckMid));
  triangles.push(makePositiveTriangle(vertices, headCheekLeft, headNeckMid, headNeckLeft));
  triangles.push(makePositiveTriangle(vertices, headCenter, headCheekRight, headNeckRight));
  triangles.push(makePositiveTriangle(vertices, headCenter, headNeckRight, headNeckMid));

  triangles.push(makePositiveTriangle(vertices, headCrown, headCenter, headCheekLeft));
  triangles.push(makePositiveTriangle(vertices, headCrown, headCheekRight, headCenter));

  // 3. 오른팔: 몸통 우측 상단(col 4, row 0..2)에서 오른쪽으로 4구간 연장
  const rightArmStations = [
    { x: 278, halfThick: 18, tag: "upper" },
    { x: 308, halfThick: 16, tag: "elbow" },
    { x: 338, halfThick: 15, tag: "forearm" },
    { x: 366, halfThick: 13, tag: "wrist" },
  ] as const;

  const rightArmCols: (readonly [number, number, number])[] = [
    [torsoGrid[0][4], torsoGrid[1][4], torsoGrid[2][4]],
  ];

  for (let s = 0; s < rightArmStations.length; s += 1) {
    const st = rightArmStations[s];
    const topIdx = pushVertex(`rarm_${st.tag}_top`, st.x, 150 - st.halfThick, "rightArm");
    const midIdx = pushVertex(`rarm_${st.tag}_mid`, st.x, 150, "rightArm");
    const botIdx = pushVertex(`rarm_${st.tag}_bot`, st.x, 150 + st.halfThick, "rightArm");
    rightArmCols.push([topIdx, midIdx, botIdx]);
  }

  for (let s = 0; s < rightArmCols.length - 1; s += 1) {
    const c0 = rightArmCols[s];
    const c1 = rightArmCols[s + 1];
    for (let r = 0; r < 2; r += 1) {
      const v00 = c0[r];
      const v10 = c1[r];
      const v11 = c1[r + 1];
      const v01 = c0[r + 1];
      triangles.push(makePositiveTriangle(vertices, v00, v10, v11));
      triangles.push(makePositiveTriangle(vertices, v00, v11, v01));
    }
  }

  // 4. 왼팔: 몸통 좌측 상단(col 0, row 0..2)에서 왼쪽으로 4구간 연장
  const leftArmStations = [
    { x: 122, halfThick: 18, tag: "upper" },
    { x: 92, halfThick: 16, tag: "elbow" },
    { x: 62, halfThick: 15, tag: "forearm" },
    { x: 34, halfThick: 13, tag: "wrist" },
  ] as const;

  const leftArmCols: (readonly [number, number, number])[] = [
    [torsoGrid[0][0], torsoGrid[1][0], torsoGrid[2][0]],
  ];

  for (let s = 0; s < leftArmStations.length; s += 1) {
    const st = leftArmStations[s];
    const topIdx = pushVertex(`larm_${st.tag}_top`, st.x, 150 - st.halfThick, "leftArm");
    const midIdx = pushVertex(`larm_${st.tag}_mid`, st.x, 150, "leftArm");
    const botIdx = pushVertex(`larm_${st.tag}_bot`, st.x, 150 + st.halfThick, "leftArm");
    leftArmCols.push([topIdx, midIdx, botIdx]);
  }

  for (let s = 0; s < leftArmCols.length - 1; s += 1) {
    const c0 = leftArmCols[s];
    const c1 = leftArmCols[s + 1];
    for (let r = 0; r < 2; r += 1) {
      // 좌측으로 진행하므로 c1이 x가 작고 c0이 x가 큼
      const v00 = c1[r];
      const v10 = c0[r];
      const v11 = c0[r + 1];
      const v01 = c1[r + 1];
      triangles.push(makePositiveTriangle(vertices, v00, v10, v11));
      triangles.push(makePositiveTriangle(vertices, v00, v11, v01));
    }
  }

  const landmarks: CharacterRigLandmarkIndices = {
    pelvisCenter: torsoGrid[6][2],
    waistCenter: torsoGrid[4][2],
    chestCenter: torsoGrid[2][2],
    neckBase,
    headCrown,
    leftShoulder: torsoGrid[1][0],
    leftElbow: leftArmCols[2][1],
    leftWrist: leftArmCols[4][1],
    rightShoulder: torsoGrid[1][4],
    rightElbow: rightArmCols[2][1],
    rightWrist: rightArmCols[4][1],
  };

  const mesh: ArapMesh2d = {
    id: meshId,
    labelKo: "웹툰 캐릭터 상반신 2D 리깅 메쉬",
    vertices,
    triangles,
  };

  const vPos = (idx: number): Vec2 => ({ x: vertices[idx].x, y: vertices[idx].y });

  const rightArmChain: ArapBoneChain2d = {
    id: "right-arm-fk-chain",
    labelKo: "오른팔 관절 본 체인",
    joints: [
      {
        id: "rightShoulder",
        labelKo: "오른쪽 어깨",
        parentId: null,
        restPosition: vPos(landmarks.rightShoulder),
        vertexIndex: landmarks.rightShoulder,
        minAngleDeg: -75,
        maxAngleDeg: 75,
        handleWeight: 2600,
      },
      {
        id: "rightElbow",
        labelKo: "오른쪽 팔꿈치",
        parentId: "rightShoulder",
        restPosition: vPos(landmarks.rightElbow),
        vertexIndex: landmarks.rightElbow,
        minAngleDeg: -115,
        maxAngleDeg: 15,
        handleWeight: 2600,
      },
      {
        id: "rightWrist",
        labelKo: "오른쪽 손목",
        parentId: "rightElbow",
        restPosition: vPos(landmarks.rightWrist),
        vertexIndex: landmarks.rightWrist,
        minAngleDeg: -45,
        maxAngleDeg: 45,
        handleWeight: 2800,
      },
    ],
  };

  const leftArmChain: ArapBoneChain2d = {
    id: "left-arm-fk-chain",
    labelKo: "왼팔 관절 본 체인",
    joints: [
      {
        id: "leftShoulder",
        labelKo: "왼쪽 어깨",
        parentId: null,
        restPosition: vPos(landmarks.leftShoulder),
        vertexIndex: landmarks.leftShoulder,
        minAngleDeg: -75,
        maxAngleDeg: 75,
        handleWeight: 2600,
      },
      {
        id: "leftElbow",
        labelKo: "왼쪽 팔꿈치",
        parentId: "leftShoulder",
        restPosition: vPos(landmarks.leftElbow),
        vertexIndex: landmarks.leftElbow,
        minAngleDeg: -15,
        maxAngleDeg: 115,
        handleWeight: 2600,
      },
      {
        id: "leftWrist",
        labelKo: "왼쪽 손목",
        parentId: "leftElbow",
        restPosition: vPos(landmarks.leftWrist),
        vertexIndex: landmarks.leftWrist,
        minAngleDeg: -45,
        maxAngleDeg: 45,
        handleWeight: 2800,
      },
    ],
  };

  const torsoAnchorHandles: readonly ArapPinHandle[] = [
    {
      id: "anchor-pelvis",
      labelKo: "골반 고정 핀",
      vertexIndex: landmarks.pelvisCenter,
      target: vPos(landmarks.pelvisCenter),
      weight: 3000,
      locked: true,
    },
    {
      id: "anchor-waist",
      labelKo: "허리 고정 핀",
      vertexIndex: landmarks.waistCenter,
      target: vPos(landmarks.waistCenter),
      weight: 2800,
      locked: true,
    },
    {
      id: "anchor-chest",
      labelKo: "가슴 고정 핀",
      vertexIndex: landmarks.chestCenter,
      target: vPos(landmarks.chestCenter),
      weight: 2600,
      locked: true,
    },
    {
      id: "anchor-left-shoulder",
      labelKo: "왼쪽 어깨 고정 핀",
      vertexIndex: landmarks.leftShoulder,
      target: vPos(landmarks.leftShoulder),
      weight: 2400,
      locked: true,
    },
    {
      id: "anchor-left-wrist",
      labelKo: "왼쪽 손목 고정 핀",
      vertexIndex: landmarks.leftWrist,
      target: vPos(landmarks.leftWrist),
      weight: 2200,
      locked: true,
    },
  ];

  // 전체 캐릭터 메쉬를 넉넉히 감싸는 반시계 방향(화면 좌표계 기준) 단순 케이지 다각형
  const restCage: CagePolygon2d = {
    id: "character-envelope-cage",
    labelKo: "캐릭터 외곽 MVC 워프 케이지",
    vertices: [
      { x: 20, y: 120 },
      { x: 145, y: 112 },
      { x: 162, y: 46 },
      { x: 238, y: 46 },
      { x: 255, y: 112 },
      { x: 380, y: 120 },
      { x: 380, y: 184 },
      { x: 264, y: 186 },
      { x: 264, y: 344 },
      { x: 136, y: 344 },
      { x: 136, y: 186 },
      { x: 20, y: 184 },
    ],
  };

  return {
    mesh,
    landmarks,
    rightArmChain,
    leftArmChain,
    torsoAnchorHandles,
    restCage,
  };
}

/**
 * 해부학적 관절 각도 한계(minAngleDeg ~ maxAngleDeg)를 강제 적용하면서
 * 본 체인 순기구학(FK)을 계산해 ARAP 핀 핸들 목표 좌표를 생성한다.
 */
export function solveBoneChainHandleTargets(
  chain: ArapBoneChain2d,
  requests: readonly BoneAngleRequest[],
): BoneChainPoseSolution {
  const requestMap = new Map<string, number>();
  for (let i = 0; i < requests.length; i += 1) {
    requestMap.set(requests[i].jointId, requests[i].deltaAngleDeg);
  }

  const jointById = new Map<string, ArapBoneChain2d["joints"][number]>();
  for (let i = 0; i < chain.joints.length; i += 1) {
    jointById.set(chain.joints[i].id, chain.joints[i]);
  }

  // 부모 우선 위상 정렬(순환 참조 방어)
  const ordered: ArapBoneChain2d["joints"][number][] = [];
  const state = new Map<string, "visiting" | "done">();

  const visit = (jointId: string): void => {
    const current = state.get(jointId);
    if (current === "done") {
      return;
    }
    if (current === "visiting") {
      throw new Error(`본 체인 '${chain.id}'에 순환 부모 참조가 있습니다: ${jointId}`);
    }
    const joint = jointById.get(jointId);
    if (!joint) {
      return;
    }
    state.set(jointId, "visiting");
    if (joint.parentId !== null && jointById.has(joint.parentId)) {
      visit(joint.parentId);
    }
    state.set(jointId, "done");
    ordered.push(joint);
  };

  for (let i = 0; i < chain.joints.length; i += 1) {
    visit(chain.joints[i].id);
  }

  const jointPositions: Record<string, Vec2> = {};
  const jointWorldAnglesRad: Record<string, number> = {};
  const clampAudit: BoneClampAuditItem[] = [];
  const handles: ArapPinHandle[] = [];
  let clampedCount = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    const joint = ordered[i];
    const requestedDeg = requestMap.get(joint.id) ?? 0;
    const minDeg = Math.min(joint.minAngleDeg, joint.maxAngleDeg);
    const maxDeg = Math.max(joint.minAngleDeg, joint.maxAngleDeg);
    const appliedDeg = Math.max(minDeg, Math.min(maxDeg, requestedDeg));
    const clamped = Math.abs(appliedDeg - requestedDeg) > 1e-9;
    if (clamped) {
      clampedCount += 1;
    }

    clampAudit.push({
      jointId: joint.id,
      labelKo: joint.labelKo,
      requestedAngleDeg: requestedDeg,
      appliedAngleDeg: appliedDeg,
      minAngleDeg: minDeg,
      maxAngleDeg: maxDeg,
      clamped,
    });

    const deltaRad = appliedDeg * DEG_TO_RAD;
    const parentJoint = joint.parentId !== null ? jointById.get(joint.parentId) : undefined;
    if (!parentJoint || !jointPositions[parentJoint.id]) {
      jointPositions[joint.id] = { x: joint.restPosition.x, y: joint.restPosition.y };
      jointWorldAnglesRad[joint.id] = deltaRad;
    } else {
      const parentPos = jointPositions[parentJoint.id];
      const parentAngle = jointWorldAnglesRad[parentJoint.id];
      const rx = joint.restPosition.x - parentJoint.restPosition.x;
      const ry = joint.restPosition.y - parentJoint.restPosition.y;
      const cosA = Math.cos(parentAngle);
      const sinA = Math.sin(parentAngle);
      jointPositions[joint.id] = {
        x: parentPos.x + cosA * rx - sinA * ry,
        y: parentPos.y + sinA * rx + cosA * ry,
      };
      jointWorldAnglesRad[joint.id] = parentAngle + deltaRad;
    }

    handles.push({
      id: `bone-handle-${joint.id}`,
      labelKo: `${joint.labelKo} 본 핸들`,
      vertexIndex: joint.vertexIndex,
      target: jointPositions[joint.id],
      weight: joint.handleWeight ?? 2500,
    });
  }

  return {
    chainId: chain.id,
    jointPositions,
    jointWorldAnglesRad,
    handles,
    clampAudit,
    clampedCount,
  };
}

/**
 * Floater-Hormann 평균값 좌표(Mean Value Coordinates, MVC)를 계산한다.
 * 볼록·오목 단순 다각형 모두에서 `sum(w_i) === 1` 및 선형 재현 `sum(w_i * v_i) === p`를 만족하며,
 * 꼭짓점 및 경계 변 위의 점은 특이점 없이 정확히 처리한다.
 */
export function computeMeanValueCoordinates2d(
  point: Vec2,
  cage: CagePolygon2d,
): MvcCoordinateRow {
  const verts = cage.vertices;
  const n = verts.length;
  if (n < 3) {
    throw new Error(`MVC 케이지 다각형은 최소 3개의 꼭짓점이 필요합니다 (현재 ${n}개).`);
  }

  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const r = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    const dx = verts[i].x - point.x;
    const dy = verts[i].y - point.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= MVC_EPSILON) {
      const weights = new Array<number>(n).fill(0);
      weights[i] = 1;
      return {
        weights,
        weightSum: 1,
        exactBoundaryKind: "vertex",
        boundaryIndex: i,
      };
    }
    sx[i] = dx;
    sy[i] = dy;
    r[i] = dist;
  }

  const tanHalf = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const cross = sx[i] * sy[next] - sy[i] * sx[next];
    const dot = sx[i] * sx[next] + sy[i] * sy[next];
    const rProd = r[i] * r[next];

    // 점이 선분 (v_i, v_{i+1}) 위에 정확히 놓이는 경계 조건
    if (Math.abs(cross) <= MVC_EPSILON * rProd && dot < 0) {
      const denom = r[i] + r[next];
      const weights = new Array<number>(n).fill(0);
      weights[i] = r[next] / denom;
      weights[next] = r[i] / denom;
      return {
        weights,
        weightSum: weights[i] + weights[next],
        exactBoundaryKind: "edge",
        boundaryIndex: i,
      };
    }

    const alpha = Math.atan2(cross, dot);
    tanHalf[i] = Math.tan(0.5 * alpha);
  }

  const rawWeights = new Float64Array(n);
  let totalWeight = 0;
  for (let i = 0; i < n; i += 1) {
    const prev = (i - 1 + n) % n;
    const wi = (tanHalf[prev] + tanHalf[i]) / r[i];
    rawWeights[i] = wi;
    totalWeight += wi;
  }

  if (!Number.isFinite(totalWeight) || Math.abs(totalWeight) <= 1e-15) {
    const uniform = 1 / n;
    return {
      weights: new Array<number>(n).fill(uniform),
      weightSum: 1,
      exactBoundaryKind: "interior",
      boundaryIndex: -1,
    };
  }

  const weights = new Array<number>(n);
  let normalizedSum = 0;
  for (let i = 0; i < n; i += 1) {
    const nw = rawWeights[i] / totalWeight;
    weights[i] = nw;
    normalizedSum += nw;
  }

  return {
    weights,
    weightSum: normalizedSum,
    exactBoundaryKind: "interior",
    boundaryIndex: -1,
  };
}

/**
 * 기준 케이지(`restCage`) 대비 변형 케이지(`deformedCage`)의 Mean Value Coordinates로
 * 임의의 2D 점 배열을 매끄럽게 워프 변형한다.
 */
export function deformPointsWithMvcCage(
  points: readonly Vec2[],
  restCage: CagePolygon2d,
  deformedCage: CagePolygon2d,
): readonly Vec2[] {
  if (restCage.vertices.length !== deformedCage.vertices.length) {
    throw new Error(
      `기준 케이지(${restCage.vertices.length}개)와 변형 케이지(${deformedCage.vertices.length}개)의 꼭짓점 개수가 일치해야 합니다.`,
    );
  }
  const n = restCage.vertices.length;
  const defVerts = deformedCage.vertices;
  const result: Vec2[] = new Array<Vec2>(points.length);

  for (let pIdx = 0; pIdx < points.length; pIdx += 1) {
    const row = computeMeanValueCoordinates2d(points[pIdx], restCage);
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i += 1) {
      const w = row.weights[i];
      x += w * defVerts[i].x;
      y += w * defVerts[i].y;
    }
    result[pIdx] = { x, y };
  }

  return result;
}
