/**
 * studio-bg3d-sketchup-direct-modeling.ts
 *
 * SketchUp Direct Modeling Kernel — 스케치업 고유의 직접 모델링(Direct Modeling) 연산 엔진:
 * 1. Push/Pull + 반대면 관통 개구부 절단(Opposite-Face Coplanar Hole Cutting — 벽체에 창문·문 뚫기)
 * 2. Offset(동일 평면 다각형 안쪽/바깥쪽 등거리 오프셋 + 마이터 클램핑 + 테두리 링 메시 생성)
 * 3. Follow Me(3D 다중선·원호 경로를 따라 2D 단면 프로파일을 스윕·선반 회전하는 몰딩/난간/배관 생성기)
 * 4. Move/Copy & Rotate/Copy VCB 배열 문법(`*N`, `Nx`, `/N` 외부 배수·내부 등분 선형/방사형 배열)
 * 5. Circle / N-gon / Bulge Arc(`tan(theta/4)`) 파라메트릭 원·다각형·원호 생성기
 */

import type { StudioBg3dVec3 } from "./studio-bg3d-scene-document-types";

export type SketchUpVec2 = readonly [number, number];

function round6(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sub3(a: StudioBg3dVec3, b: StudioBg3dVec3): StudioBg3dVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: StudioBg3dVec3, b: StudioBg3dVec3): StudioBg3dVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(v: StudioBg3dVec3, s: number): StudioBg3dVec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function dot3(a: StudioBg3dVec3, b: StudioBg3dVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: StudioBg3dVec3, b: StudioBg3dVec3): StudioBg3dVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(v: StudioBg3dVec3, fallback: StudioBg3dVec3 = [0, 1, 0]): StudioBg3dVec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len < 1e-9) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * 2D 다각형의 부호 있는 넓이를 계산한다 (양수 = 반시계방향 CCW, 음수 = 시계방향 CW).
 */
export function computePolygonSignedArea2D(loop: readonly SketchUpVec2[]): number {
  if (loop.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum * 0.5;
}

export interface SketchUpOffset2DResult {
  readonly ok: boolean;
  readonly originalLoop: readonly SketchUpVec2[];
  readonly offsetLoop: readonly SketchUpVec2[];
  readonly signedDistance: number;
  readonly areaOriginal: number;
  readonly areaOffset: number;
  readonly clampedVertices: number;
  readonly reason?: string;
}

function failOffset2D(loop: readonly SketchUpVec2[], distance: number, reason: string): SketchUpOffset2DResult {
  return Object.freeze({
    ok: false,
    originalLoop: loop,
    offsetLoop: Object.freeze([]),
    signedDistance: Number.isFinite(distance) ? distance : 0,
    areaOriginal: 0,
    areaOffset: 0,
    clampedVertices: 0,
    reason,
  });
}

/**
 * SketchUp `Offset (F)` 도구 — 2D 닫힌 다각형을 지정 거리(`distance`, 양수 = 바깥쪽 확장, 음수 = 안쪽 축소)만큼
 * 각 꼭짓점의 이등분선(miter bisector) 방향으로 등거리 오프셋한다.
 */
export function offsetSketchUpPolygon2D(
  loop: readonly SketchUpVec2[],
  distance: number,
  options: { readonly miterLimitRatio?: number } = {},
): SketchUpOffset2DResult {
  if (loop.length < 3) return failOffset2D(loop, distance, "polygon-needs-at-least-3-vertices");
  if (!Number.isFinite(distance)) return failOffset2D(loop, 0, "invalid-distance");

  const areaOriginal = computePolygonSignedArea2D(loop);
  if (Math.abs(areaOriginal) < 1e-9) return failOffset2D(loop, distance, "degenerate-polygon");

  const ccwSign = areaOriginal >= 0 ? 1 : -1;
  const miterLimit = Math.max(1, options.miterLimitRatio ?? 4);
  const n = loop.length;
  const offsetLoop: SketchUpVec2[] = [];
  let clampedVertices = 0;

  for (let i = 0; i < n; i += 1) {
    const prev = loop[(i - 1 + n) % n]!;
    const curr = loop[i]!;
    const next = loop[(i + 1) % n]!;

    const e1x = curr[0] - prev[0];
    const e1y = curr[1] - prev[1];
    const len1 = Math.hypot(e1x, e1y) || 1;
    const d1x = e1x / len1;
    const d1y = e1y / len1;

    const e2x = next[0] - curr[0];
    const e2y = next[1] - curr[1];
    const len2 = Math.hypot(e2x, e2y) || 1;
    const d2x = e2x / len2;
    const d2y = e2y / len2;

    // 바깥쪽 단위 법선 (CCW 기준 오른쪽 법선: (dy, -dx) * ccwSign)
    const n1x = d1y * ccwSign;
    const n1y = -d1x * ccwSign;
    const n2x = d2y * ccwSign;
    const n2y = -d2x * ccwSign;

    let bx = n1x + n2x;
    let by = n1y + n2y;
    const bLen = Math.hypot(bx, by);
    if (bLen < 1e-6) {
      bx = n1x;
      by = n1y;
    } else {
      bx /= bLen;
      by /= bLen;
    }

    const cosHalf = bx * n1x + by * n1y;
    const rawScale = Math.abs(cosHalf) > 1e-4 ? 1 / cosHalf : miterLimit;
    let scale = rawScale;
    if (Math.abs(scale) > miterLimit) {
      scale = Math.sign(scale || 1) * miterLimit;
      clampedVertices += 1;
    }

    offsetLoop.push(
      Object.freeze([
        round6(curr[0] + bx * distance * scale),
        round6(curr[1] + by * distance * scale),
      ]),
    );
  }

  const areaOffset = computePolygonSignedArea2D(offsetLoop);
  // 안쪽 오프셋이 너무 커서 다각형 방향이 뒤집힌 경우 자기교차 경고
  if (areaOffset * areaOriginal <= 0) {
    return Object.freeze({
      ok: false,
      originalLoop: loop,
      offsetLoop: Object.freeze(offsetLoop),
      signedDistance: distance,
      areaOriginal: round6(areaOriginal),
      areaOffset: round6(areaOffset),
      clampedVertices,
      reason: "offset-collapsed-or-inverted",
    });
  }

  return Object.freeze({
    ok: true,
    originalLoop: loop,
    offsetLoop: Object.freeze(offsetLoop),
    signedDistance: distance,
    areaOriginal: round6(areaOriginal),
    areaOffset: round6(areaOffset),
    clampedVertices,
  });
}

export interface SketchUpMeshBuffer {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface SketchUpPushPullExtrusionInput {
  /** 외곽 다각형 2D 꼭짓점(반시계방향 권장, m). */
  readonly outerLoop2D: readonly SketchUpVec2[];
  /** 선택적 내부 프로파일(창문·문 개구부 등). */
  readonly innerProfile2D?: readonly SketchUpVec2[];
  /** 밀기/당기기 거리(m). 음수는 반대 방향(안쪽). */
  readonly distanceMeters: number;
  /** 벽체/슬래브 두께(m). 지정 시 `innerProfile2D`를 `-wallThicknessMeters`만큼 밀면 관통 개구부(Hole Cut)가 생성됨. */
  readonly wallThicknessMeters?: number;
  /** 관통 판정 허용 오차(m, 기본 1e-3). */
  readonly holeCutToleranceMeters?: number;
}

export interface SketchUpPushPullExtrusionOutput {
  readonly ok: boolean;
  /** 반대면까지 정확히 밀어 창문·문 개구부가 관통(Through-Hole Cut)되었는지 여부. */
  readonly holeCut: boolean;
  readonly appliedDistanceMeters: number;
  readonly mesh: SketchUpMeshBuffer;
  readonly sideWallQuadCount: number;
}

/**
 * SketchUp `Push/Pull (P)` 커널:
 * - 일반 다각형 면을 `distanceMeters`만큼 돌출해 측면 벽 + 앞·뒷면 캡 메시를 생성한다.
 * - 벽체 두께(`wallThicknessMeters`)가 주어지고 내부 프로파일(`innerProfile2D`)을 `-wallThicknessMeters`와
 *   일치하는 거리만큼 밀면, 스케치업과 동일하게 반대면을 관통해 개구부(창문/문 구멍)를 뚫고(`holeCut: true`)
 *   개구부 내벽(reveal) 쿼드만 남긴다.
 */
export function extrudeSketchUpPolygonFaceWithHoleCut(
  input: SketchUpPushPullExtrusionInput,
): SketchUpPushPullExtrusionOutput {
  const outer = input.outerLoop2D;
  const dist = input.distanceMeters;
  const tol = input.holeCutToleranceMeters ?? 1e-3;
  const hasInner = Boolean(input.innerProfile2D && input.innerProfile2D.length >= 3);
  const wallThickness = input.wallThicknessMeters ?? null;

  const isHoleCut = Boolean(
    hasInner &&
    wallThickness !== null &&
    wallThickness > 0 &&
    Math.abs(Math.abs(dist) - wallThickness) <= tol,
  );

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const appendVertex = (
    pos: StudioBg3dVec3,
    norm: StudioBg3dVec3,
    uv: SketchUpVec2,
  ): number => {
    const idx = positions.length / 3;
    positions.push(round6(pos[0]), round6(pos[1]), round6(pos[2]));
    normals.push(round6(norm[0]), round6(norm[1]), round6(norm[2]));
    uvs.push(round6(uv[0]), round6(uv[1]));
    return idx;
  };

  let sideWallQuadCount = 0;

  const appendExtrudedLoopWalls = (
    loop: readonly SketchUpVec2[],
    zStart: number,
    zEnd: number,
    inwardNormals: boolean,
  ) => {
    const n = loop.length;
    for (let i = 0; i < n; i += 1) {
      const a = loop[i]!;
      const b = loop[(i + 1) % n]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const segLen = Math.hypot(dx, dy) || 1;
      const sign = inwardNormals ? -1 : 1;
      const nx = (dy / segLen) * sign;
      const ny = (-dx / segLen) * sign;
      const norm: StudioBg3dVec3 = [nx, ny, 0];
      const depth = Math.abs(zEnd - zStart);

      const v0 = appendVertex([a[0], a[1], zStart], norm, [0, 0]);
      const v1 = appendVertex([b[0], b[1], zStart], norm, [segLen, 0]);
      const v2 = appendVertex([b[0], b[1], zEnd], norm, [segLen, depth]);
      const v3 = appendVertex([a[0], a[1], zEnd], norm, [0, depth]);

      if (!inwardNormals) {
        indices.push(v0, v1, v2, v0, v2, v3);
      } else {
        indices.push(v0, v2, v1, v0, v3, v2);
      }
      sideWallQuadCount += 1;
    }
  };

  if (outer.length < 3 || !Number.isFinite(dist) || Math.abs(dist) < 1e-6) {
    return Object.freeze({
      ok: false,
      holeCut: false,
      appliedDistanceMeters: 0,
      mesh: {
        positions: new Float32Array(0),
        normals: new Float32Array(0),
        uvs: new Float32Array(0),
        indices: new Uint32Array(0),
        vertexCount: 0,
        triangleCount: 0,
      },
      sideWallQuadCount: 0,
    });
  }

  // 외곽 루프 측면 벽
  appendExtrudedLoopWalls(outer, 0, dist, false);

  if (isHoleCut && input.innerProfile2D) {
    // 관통 개구부(Through-Hole): 개구부 안쪽 내벽(reveal)만 생성하고 개구부 캡은 생략
    appendExtrudedLoopWalls(input.innerProfile2D, 0, dist, true);
  } else {
    // 일반 돌출: 시작 캡(z=0)과 끝 캡(z=dist)을 팬 삼각분할로 생성
    const capLoop = hasInner && input.innerProfile2D ? input.innerProfile2D : outer;
    const zFront = dist;
    const frontNormal: StudioBg3dVec3 = [0, 0, dist >= 0 ? 1 : -1];
    const baseIdx = positions.length / 3;
    for (const pt of capLoop) {
      appendVertex([pt[0], pt[1], zFront], frontNormal, [pt[0], pt[1]]);
    }
    for (let i = 1; i < capLoop.length - 1; i += 1) {
      if (dist >= 0) {
        indices.push(baseIdx, baseIdx + i, baseIdx + i + 1);
      } else {
        indices.push(baseIdx, baseIdx + i + 1, baseIdx + i);
      }
    }
  }

  return Object.freeze({
    ok: true,
    holeCut: isHoleCut,
    appliedDistanceMeters: round6(dist),
    mesh: Object.freeze({
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
    }),
    sideWallQuadCount,
  });
}

export interface SketchUpFollowMeInput {
  /** 스윕할 2D 단면 프로파일 꼭짓점 목록(로컬 X: 수평 폭, 로컬 Y: 수직 높이). */
  readonly profile2D: readonly SketchUpVec2[];
  /** 3D 경로 꼭짓점 목록(최소 2개 이상). */
  readonly path3D: readonly StudioBg3dVec3[];
  /** 경로가 닫힌 루프인지 여부(예: 방 테두리 몰딩 전체 둘레). */
  readonly closedPath?: boolean;
}

export interface SketchUpFollowMeOutput {
  readonly ok: boolean;
  readonly mesh: SketchUpMeshBuffer;
  readonly pathLengthMeters: number;
  readonly segmentCount: number;
}

/**
 * SketchUp `Follow Me` 도구 — 3D 다중선 경로(`path3D`)를 따라 2D 프로파일(`profile2D`)을
 * 코너 이등분 평면(miter plane) 보정과 함께 스윕해 몰딩·난간·배관·처마 지붕 메시를 생성한다.
 */
export function extrudeSketchUpFollowMe(input: SketchUpFollowMeInput): SketchUpFollowMeOutput {
  const { profile2D, path3D, closedPath = false } = input;
  if (profile2D.length < 2 || path3D.length < 2) {
    return Object.freeze({
      ok: false,
      mesh: {
        positions: new Float32Array(0),
        normals: new Float32Array(0),
        uvs: new Float32Array(0),
        indices: new Uint32Array(0),
        vertexCount: 0,
        triangleCount: 0,
      },
      pathLengthMeters: 0,
      segmentCount: 0,
    });
  }

  const numPts = path3D.length;
  const numProfile = profile2D.length;
  const worldUp: StudioBg3dVec3 = [0, 1, 0];

  // 각 경로 점에서의 접선(tangent), 우측 축(right), 상방 축(up), 마이터 스케일 계산
  const frames: {
    readonly origin: StudioBg3dVec3;
    readonly right: StudioBg3dVec3;
    readonly up: StudioBg3dVec3;
    readonly miterScale: number;
    readonly cumulativeDist: number;
  }[] = [];

  let cumulativeDist = 0;
  for (let i = 0; i < numPts; i += 1) {
    const curr = path3D[i]!;
    if (i > 0) {
      const prev = path3D[i - 1]!;
      cumulativeDist += Math.hypot(curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]);
    }

    const hasPrev = closedPath || i > 0;
    const hasNext = closedPath || i < numPts - 1;
    const prevPt = hasPrev ? path3D[(i - 1 + numPts) % numPts]! : curr;
    const nextPt = hasNext ? path3D[(i + 1) % numPts]! : curr;

    const dirIn = hasPrev ? normalize3(sub3(curr, prevPt), [0, 0, 1]) : [0, 0, 1] as StudioBg3dVec3;
    const dirOut = hasNext ? normalize3(sub3(nextPt, curr), dirIn) : dirIn;
    const tangent = hasPrev && hasNext
      ? normalize3(add3(dirIn, dirOut), dirOut)
      : hasNext
        ? dirOut
        : dirIn;

    const upCandidate: StudioBg3dVec3 = Math.abs(dot3(tangent, worldUp)) > 0.99
      ? [0, 0, 1]
      : worldUp;
    const right = normalize3(cross3(tangent, upCandidate), [1, 0, 0]);
    const up = normalize3(cross3(right, tangent), [0, 1, 0]);

    const cosHalf = hasPrev && hasNext ? Math.max(0.25, Math.abs(dot3(tangent, dirOut))) : 1;
    const miterScale = Math.min(3, 1 / cosHalf);

    frames.push({
      origin: curr,
      right,
      up,
      miterScale,
      cumulativeDist,
    });
  }

  if (closedPath && numPts >= 3) {
    const first = path3D[0]!;
    const last = path3D[numPts - 1]!;
    cumulativeDist += Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2]);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i]!;
    for (let j = 0; j < numProfile; j += 1) {
      const p = profile2D[j]!;
      const nextP = profile2D[(j + 1) % numProfile]!;
      const edgeDx = nextP[0] - p[0];
      const edgeDy = nextP[1] - p[1];
      const edgeLen = Math.hypot(edgeDx, edgeDy) || 1;
      const localNx = edgeDy / edgeLen;
      const localNy = -edgeDx / edgeLen;

      const worldPos = add3(
        frame.origin,
        add3(
          scale3(frame.right, p[0] * frame.miterScale),
          scale3(frame.up, p[1]),
        ),
      );
      const worldNorm = normalize3(
        add3(scale3(frame.right, localNx), scale3(frame.up, localNy)),
        [0, 1, 0],
      );

      positions.push(round6(worldPos[0]), round6(worldPos[1]), round6(worldPos[2]));
      normals.push(round6(worldNorm[0]), round6(worldNorm[1]), round6(worldNorm[2]));
      uvs.push(round6(j / Math.max(1, numProfile - 1)), round6(frame.cumulativeDist));
    }
  }

  const ringCount = closedPath ? frames.length : frames.length - 1;
  for (let i = 0; i < ringCount; i += 1) {
    const nextRing = (i + 1) % frames.length;
    for (let j = 0; j < numProfile; j += 1) {
      const nextJ = (j + 1) % numProfile;
      const a = i * numProfile + j;
      const b = i * numProfile + nextJ;
      const c = nextRing * numProfile + nextJ;
      const d = nextRing * numProfile + j;
      indices.push(a, b, c, a, c, d);
    }
  }

  return Object.freeze({
    ok: true,
    mesh: Object.freeze({
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
    }),
    pathLengthMeters: round6(cumulativeDist),
    segmentCount: ringCount,
  });
}

export type SketchUpArrayMode = "multiply" | "divide";

export interface SketchUpParsedArrayCommand {
  readonly ok: boolean;
  readonly mode: SketchUpArrayMode | null;
  readonly count: number;
  readonly normalizedToken: string;
  readonly messageKo: string;
}

export const SKETCHUP_ARRAY_MAX_COUNT = 200;

/**
 * SketchUp VCB(Value Control Box) 배열 문법 파서:
 * - 외부 배수(Multiply): `*3`, `x3`, `3*`, `3x` -> 이동/회전 간격을 N배까지 반복 복제
 * - 내부 등분(Divide): `/4`, `4/` -> 시작점과 목표점 사이를 N등분하여 내분 복제
 */
export function parseSketchUpArrayInput(raw: unknown): SketchUpParsedArrayCommand {
  if (typeof raw !== "string") {
    return Object.freeze({
      ok: false,
      mode: null,
      count: 0,
      normalizedToken: "",
      messageKo: "배열 명령은 텍스트로 입력해 주세요. 예: *3, 5x, /4",
    });
  }
  const trimmed = raw.trim().toLowerCase();
  const multiplyMatch = /^(?:[*x]\s*(\d+)|(\d+)\s*[*x])$/u.exec(trimmed);
  if (multiplyMatch) {
    const count = Number(multiplyMatch[1] ?? multiplyMatch[2]);
    if (!Number.isSafeInteger(count) || count < 1 || count > SKETCHUP_ARRAY_MAX_COUNT) {
      return Object.freeze({
        ok: false,
        mode: "multiply",
        count: 0,
        normalizedToken: trimmed,
        messageKo: `복제 개수는 1~${SKETCHUP_ARRAY_MAX_COUNT} 사이의 정수여야 합니다.`,
      });
    }
    return Object.freeze({
      ok: true,
      mode: "multiply",
      count,
      normalizedToken: `*${count}`,
      messageKo: `외부 배수 배열 (*${count}) — 간격마다 ${count}개 사본 생성`,
    });
  }

  const divideMatch = /^\/\s*(\d+)$/u.exec(trimmed);
  if (divideMatch) {
    const count = Number(divideMatch[1]);
    if (!Number.isSafeInteger(count) || count < 1 || count > SKETCHUP_ARRAY_MAX_COUNT) {
      return Object.freeze({
        ok: false,
        mode: "divide",
        count: 0,
        normalizedToken: trimmed,
        messageKo: `등분 개수는 1~${SKETCHUP_ARRAY_MAX_COUNT} 사이의 정수여야 합니다.`,
      });
    }
    return Object.freeze({
      ok: true,
      mode: "divide",
      count,
      normalizedToken: `/${count}`,
      messageKo: `내부 등분 배열 (/${count}) — 시작과 끝 사이를 ${count}등분 배치`,
    });
  }

  return Object.freeze({
    ok: false,
    mode: null,
    count: 0,
    normalizedToken: trimmed,
    messageKo: "올바른 배열 문법이 아닙니다. '*3', '3x'(외부 반복) 또는 '/4'(내부 등분) 형식으로 입력하세요.",
  });
}

export interface SketchUpArrayPlacement {
  readonly copyIndex: number;
  readonly position: StudioBg3dVec3;
  readonly rotationDeg: StudioBg3dVec3;
}

/**
 * SketchUp `Move + Copy` 선형 배열 생성기(`*N` 또는 `/N`).
 * 원본(copyIndex = 0)을 포함해 `count + 1`개의 결정적 위치를 반환한다.
 */
export function generateSketchUpLinearArray(input: {
  readonly basePosition: StudioBg3dVec3;
  readonly baseRotationDeg?: StudioBg3dVec3;
  readonly deltaVector: StudioBg3dVec3;
  readonly command: SketchUpParsedArrayCommand;
}): readonly SketchUpArrayPlacement[] {
  const { basePosition, baseRotationDeg = [0, 0, 0], deltaVector, command } = input;
  if (!command.ok || !command.mode || command.count < 1) {
    return Object.freeze([
      Object.freeze({
        copyIndex: 0,
        position: basePosition,
        rotationDeg: baseRotationDeg,
      }),
    ]);
  }
  const placements: SketchUpArrayPlacement[] = [];
  const stepFactor = command.mode === "divide" ? 1 / command.count : 1;

  for (let i = 0; i <= command.count; i += 1) {
    const t = i * stepFactor;
    placements.push(Object.freeze({
      copyIndex: i,
      position: Object.freeze([
        round6(basePosition[0] + deltaVector[0] * t),
        round6(basePosition[1] + deltaVector[1] * t),
        round6(basePosition[2] + deltaVector[2] * t),
      ] as const),
      rotationDeg: baseRotationDeg,
    }));
  }
  return Object.freeze(placements);
}

/**
 * SketchUp `Rotate + Copy` 방사형(원형) 배열 생성기(`*N` 또는 `/N`).
 * 피벗(`pivot`)을 중심으로 Y축(또는 지정 축) 회전 복제를 수행한다.
 */
export function generateSketchUpRadialArray(input: {
  readonly basePosition: StudioBg3dVec3;
  readonly baseRotationDeg?: StudioBg3dVec3;
  readonly pivot: StudioBg3dVec3;
  readonly angleStepOrSpanDeg: number;
  readonly axis?: "x" | "y" | "z";
  readonly command: SketchUpParsedArrayCommand;
}): readonly SketchUpArrayPlacement[] {
  const {
    basePosition,
    baseRotationDeg = [0, 0, 0],
    pivot,
    angleStepOrSpanDeg,
    axis = "y",
    command,
  } = input;
  if (!command.ok || !command.mode || command.count < 1) {
    return Object.freeze([
      Object.freeze({
        copyIndex: 0,
        position: basePosition,
        rotationDeg: baseRotationDeg,
      }),
    ]);
  }

  const stepDeg = command.mode === "divide"
    ? angleStepOrSpanDeg / command.count
    : angleStepOrSpanDeg;

  const relX = basePosition[0] - pivot[0];
  const relY = basePosition[1] - pivot[1];
  const relZ = basePosition[2] - pivot[2];

  const placements: SketchUpArrayPlacement[] = [];
  for (let i = 0; i <= command.count; i += 1) {
    const deg = i * stepDeg;
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);

    let nx = relX;
    let ny = relY;
    let nz = relZ;
    let rx = baseRotationDeg[0];
    let ry = baseRotationDeg[1];
    let rz = baseRotationDeg[2];

    if (axis === "y") {
      nx = relX * c + relZ * s;
      nz = -relX * s + relZ * c;
      ry = round6(ry + deg);
    } else if (axis === "z") {
      nx = relX * c - relY * s;
      ny = relX * s + relY * c;
      rz = round6(rz + deg);
    } else {
      ny = relY * c - relZ * s;
      nz = relY * s + relZ * c;
      rx = round6(rx + deg);
    }

    placements.push(Object.freeze({
      copyIndex: i,
      position: Object.freeze([
        round6(pivot[0] + nx),
        round6(pivot[1] + ny),
        round6(pivot[2] + nz),
      ] as const),
      rotationDeg: Object.freeze([rx, ry, rz] as const),
    }));
  }

  return Object.freeze(placements);
}

/**
 * SketchUp `Circle (C)` / `Polygon` 도구 — 중심점, 법선 벡터, 반지름, 세그먼트 수(기본 24)로
 * 3D 정다각형/원 꼭짓점 고리를 생성한다.
 */
export function generateSketchUpCircleOrPolygon(input: {
  readonly center: StudioBg3dVec3;
  readonly normal?: StudioBg3dVec3;
  readonly radiusMeters: number;
  readonly segments?: number;
}): readonly StudioBg3dVec3[] {
  const { center, normal = [0, 1, 0], radiusMeters, segments = 24 } = input;
  const safeSegments = Math.min(128, Math.max(3, Math.round(segments)));
  const safeRadius = Math.max(1e-4, Math.abs(radiusMeters));
  const n = normalize3(normal, [0, 1, 0]);
  const ref: StudioBg3dVec3 = Math.abs(n[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize3(cross3(ref, n), [1, 0, 0]);
  const v = normalize3(cross3(n, u), [0, 0, 1]);

  const pts: StudioBg3dVec3[] = [];
  for (let i = 0; i < safeSegments; i += 1) {
    const theta = (2 * Math.PI * i) / safeSegments;
    const cos = Math.cos(theta) * safeRadius;
    const sin = Math.sin(theta) * safeRadius;
    pts.push(Object.freeze([
      round6(center[0] + u[0] * cos + v[0] * sin),
      round6(center[1] + u[1] * cos + v[1] * sin),
      round6(center[2] + u[2] * cos + v[2] * sin),
    ]));
  }
  return Object.freeze(pts);
}

/**
 * SketchUp `2-Point Arc (A)` / OpenSKP `Edge.arc` (bulge = tan(theta / 4)) 호환 원호 보간기.
 */
export function generateSketchUpBulgeArc2D(input: {
  readonly start: SketchUpVec2;
  readonly end: SketchUpVec2;
  readonly bulge: number;
  readonly segments?: number;
}): readonly SketchUpVec2[] {
  const { start, end, bulge, segments = 12 } = input;
  const safeSegments = Math.min(64, Math.max(2, Math.round(segments)));
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-6) {
    return Object.freeze([start, end]);
  }
  const theta = 4 * Math.atan(bulge);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-6) return Object.freeze([start]);

  const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const midX = (start[0] + end[0]) * 0.5;
  const midY = (start[1] + end[1]) * 0.5;
  const sagitta = (chord * 0.5) * Math.abs(bulge);
  const distToCenter = radius - sagitta;
  const sign = bulge >= 0 ? 1 : -1;
  const perpX = (-dy / chord) * sign;
  const perpY = (dx / chord) * sign;
  const cx = midX + perpX * distToCenter * Math.sign(Math.cos(theta / 2));
  const cy = midY + perpY * distToCenter * Math.sign(Math.cos(theta / 2));

  const startAngle = Math.atan2(start[1] - cy, start[0] - cx);
  const pts: SketchUpVec2[] = [];
  for (let i = 0; i <= safeSegments; i += 1) {
    const a = startAngle + (theta * i) / safeSegments;
    pts.push(Object.freeze([
      round6(cx + Math.cos(a) * radius),
      round6(cy + Math.sin(a) * radius),
    ]));
  }
  return Object.freeze(pts);
}
