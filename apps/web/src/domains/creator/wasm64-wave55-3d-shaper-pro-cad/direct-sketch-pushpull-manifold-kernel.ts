/**
 * Wave 55 3D 셰이퍼+ 직관적 스케치 Push/Pull 돌출·회전·로프트·면 인셋 및 수밀 검증 커널.
 *
 * - 2D 닫힌 스케치 폴리곤(웹툰 실내 평면도·소품 단면)에서 즉시 수밀 3D 솔리드 메쉬를 생성한다.
 * - 모든 출력 솔리드는 실측 미터 단위(`1.0 = 1m`), 바닥 접지(`Y = 0`), 외향 법선 일관성,
 *   비퇴화 UV, 그리고 오일러-푸앵카레 수밀 지표(`nonManifoldEdges === 0`)를 만족한다.
 */

import {
  type CadEdgePair,
  type CadSolidMesh,
  type CadTriangle,
  triangleNormalAndArea,
  type Vec2,
  type Vec3,
  vec3Add,
  vec3Cross,
  vec3Dot,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  weldAndFinalizeSolidMesh,
} from "./cad-manifold-primitives";

export { auditSolidManifoldIntegrity } from "./cad-manifold-integrity-audit";

export interface PushPullExtrudeInput {
  readonly id?: string;
  readonly label?: string;
  readonly polygon: readonly Vec2[];
  readonly heightMeters: number;
  readonly topScale?: number;
  readonly baseElevationY?: number;
  readonly groundToFloorY0?: boolean;
}

export interface RevolveProfileInput {
  readonly id?: string;
  readonly label?: string;
  readonly profile: readonly Vec2[];
  readonly segments?: number;
  readonly closedLoop?: boolean;
  readonly groundToFloorY0?: boolean;
}

export interface LoftCrossSection {
  readonly yMeters: number;
  readonly polygon: readonly Vec2[];
}

export interface LoftSolidInput {
  readonly id?: string;
  readonly label?: string;
  readonly sections: readonly LoftCrossSection[];
  readonly resampleCount?: number;
  readonly groundToFloorY0?: boolean;
}

export interface FaceInsetExtrudeInput {
  readonly id?: string;
  readonly label?: string;
  readonly targetNormal?: Vec3;
  readonly angleToleranceDeg?: number;
  readonly insetMeters: number;
  readonly extrudeDepthMeters: number;
  readonly groundToFloorY0?: boolean;
}

export function signedArea2D(polygon: readonly Vec2[]): number {
  let area2 = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    if (!curr || !next) continue;
    area2 += curr[0] * next[1] - next[0] * curr[1];
  }
  return area2 * 0.5;
}

function sanitizePolygon2D(raw: readonly Vec2[]): Vec2[] {
  const deduped: Vec2[] = [];
  for (const pt of raw) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 1e-6) continue;
    deduped.push([pt[0], pt[1]]);
  }
  while (deduped.length >= 2) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (!first || !last) break;
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) {
      deduped.pop();
    } else {
      break;
    }
  }
  if (deduped.length < 3) {
    throw new Error("닫힌 2D 스케치 폴리곤은 최소 3개의 서로 다른 꼭짓점이 필요합니다.");
  }
  const area = signedArea2D(deduped);
  if (Math.abs(area) < 1e-9) {
    throw new Error("면적이 0에 가까운 스케치 폴리곤은 솔리드로 돌출할 수 없습니다.");
  }
  return area < 0 ? deduped.reverse() : deduped;
}

function cross2D(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle2D(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const c1 = cross2D(a, b, p);
  const c2 = cross2D(b, c, p);
  const c3 = cross2D(c, a, p);
  return c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9;
}

/**
 * 단순 2D 다각형(볼록·오목 평면도 모두 지원)을 원래 경계 정점만 사용해 CCW 삼각분할한다.
 */
export function triangulateSimplePolygon2D(polygon: readonly Vec2[]): CadTriangle[] {
  const n = polygon.length;
  if (n < 3) return [];
  const area = signedArea2D(polygon);
  const remaining: number[] = [];
  if (area >= 0) {
    for (let i = 0; i < n; i += 1) remaining.push(i);
  } else {
    for (let i = n - 1; i >= 0; i -= 1) remaining.push(i);
  }

  const triangles: CadTriangle[] = [];
  let guard = n * n + 16;
  while (remaining.length > 3 && guard > 0) {
    guard -= 1;
    let earFound = false;
    const len = remaining.length;
    for (let i = 0; i < len; i += 1) {
      const prevIdx = remaining[(i + len - 1) % len] ?? 0;
      const currIdx = remaining[i] ?? 0;
      const nextIdx = remaining[(i + 1) % len] ?? 0;
      const a = polygon[prevIdx];
      const b = polygon[currIdx];
      const c = polygon[nextIdx];
      if (!a || !b || !c) continue;
      if (cross2D(a, b, c) <= 1e-10) continue;

      let containsOther = false;
      for (let j = 0; j < len; j += 1) {
        const testIdx = remaining[j] ?? 0;
        if (testIdx === prevIdx || testIdx === currIdx || testIdx === nextIdx) continue;
        const p = polygon[testIdx];
        if (p && pointInTriangle2D(p, a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;

      triangles.push([prevIdx, currIdx, nextIdx]);
      remaining.splice(i, 1);
      earFound = true;
      break;
    }

    if (!earFound) {
      // 공선 정점 등 수치적 경계 사례를 안전하게 정리
      let bestIndex = 0;
      let bestCross = Number.NEGATIVE_INFINITY;
      const lenNow = remaining.length;
      for (let i = 0; i < lenNow; i += 1) {
        const a = polygon[remaining[(i + lenNow - 1) % lenNow] ?? 0];
        const b = polygon[remaining[i] ?? 0];
        const c = polygon[remaining[(i + 1) % lenNow] ?? 0];
        if (!a || !b || !c) continue;
        const val = cross2D(a, b, c);
        if (val > bestCross) {
          bestCross = val;
          bestIndex = i;
        }
      }
      const prevIdx = remaining[(bestIndex + lenNow - 1) % lenNow] ?? 0;
      const currIdx = remaining[bestIndex] ?? 0;
      const nextIdx = remaining[(bestIndex + 1) % lenNow] ?? 0;
      triangles.push([prevIdx, currIdx, nextIdx]);
      remaining.splice(bestIndex, 1);
    }
  }

  if (remaining.length === 3) {
    triangles.push([remaining[0] ?? 0, remaining[1] ?? 0, remaining[2] ?? 0]);
  }
  return triangles;
}

/**
 * 2D 닫힌 평면도·단면 스케치를 Y축 수직으로 Push/Pull 돌출해 수밀 3D 솔리드를 생성한다.
 */
export function extrudeSketchPushPull(input: PushPullExtrudeInput): CadSolidMesh {
  if (!Number.isFinite(input.heightMeters) || input.heightMeters <= 1e-5) {
    throw new Error("Push/Pull 돌출 높이는 0보다 큰 유한한 미터 값이어야 합니다.");
  }
  const poly = sanitizePolygon2D(input.polygon);
  const topScale = input.topScale ?? 1;
  if (!Number.isFinite(topScale) || topScale <= 0.05) {
    throw new Error("상단 테이퍼 배율(topScale)은 0.05보다 커야 합니다.");
  }
  const n = poly.length;
  const baseY = input.baseElevationY ?? 0;
  const topY = baseY + input.heightMeters;

  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p[0];
    cz += p[1];
  }
  cx /= n;
  cz /= n;

  const rawVertices: Vec3[] = [];
  for (const p of poly) {
    rawVertices.push([p[0], baseY, p[1]]);
  }
  for (const p of poly) {
    rawVertices.push([
      cx + (p[0] - cx) * topScale,
      topY,
      cz + (p[1] - cz) * topScale,
    ]);
  }

  const capTris = triangulateSimplePolygon2D(poly);
  const rawTriangles: CadTriangle[] = [];
  // XZ 평면 CCW 삼각형의 오른손 법선은 -Y(바닥 외향), 상단 캡은 역순(+Y 외향)
  for (const [i0, i1, i2] of capTris) {
    rawTriangles.push([i0, i1, i2]);
    rawTriangles.push([n + i0, n + i2, n + i1]);
  }

  const hardEdges: CadEdgePair[] = [];
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const b0 = i;
    const b1 = next;
    const t0 = n + i;
    const t1 = n + next;
    rawTriangles.push([b1, b0, t0]);
    rawTriangles.push([b1, t0, t1]);
    hardEdges.push([b0, b1], [t0, t1], [b0, t0]);
  }

  return weldAndFinalizeSolidMesh({
    id: input.id ?? "solid-pushpull",
    label: input.label ?? "스케치 Push/Pull 솔리드",
    rawVertices,
    rawTriangles,
    groundToFloorY0: input.groundToFloorY0 ?? true,
    hardEdges,
    metadata: {
      generator: "push-pull-extrude",
      heightMeters: input.heightMeters,
      sketchVertexCount: n,
    },
  });
}

/**
 * 2D 단면 프로파일 `(반지름 r, 높이 y)`을 Y축 중심으로 회전해 수밀 회전체(기둥·병·토러스)를 생성한다.
 */
export function revolveProfileSolid(input: RevolveProfileInput): CadSolidMesh {
  const segments = Math.max(8, Math.floor(input.segments ?? 24));
  if (input.profile.length < 2) {
    throw new Error("축 회전 프로파일은 최소 2개 이상의 단면점이 필요합니다.");
  }

  const cleaned: Vec2[] = [];
  for (const pt of input.profile) {
    const r = Math.max(0, pt[0]);
    const y = pt[1];
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.hypot(r - prev[0], y - prev[1]) < 1e-6) continue;
    cleaned.push([r, y]);
  }
  if (cleaned.length < 2) {
    throw new Error("유효한 회전 프로파일 구간이 부족합니다.");
  }

  const isClosedLoop = input.closedLoop ?? false;
  const points: Vec2[] = [...cleaned];
  if (!isClosedLoop) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first && first[0] > 1e-5) {
      points.unshift([0, first[1]]);
    }
    if (last && last[0] > 1e-5) {
      points.push([0, last[1]]);
    }
  } else if (points.length < 3 || points.some((p) => p[0] <= 1e-5)) {
    throw new Error("닫힌 루프 회전(토러스형)은 3개 이상이며 모든 점의 반지름이 0보다 커야 합니다.");
  }

  const rawVertices: Vec3[] = [];
  const ringIndices: number[][] = [];
  const isPole: boolean[] = [];

  for (const pt of points) {
    if (pt[0] <= 1e-5) {
      const idx = rawVertices.length;
      rawVertices.push([0, pt[1], 0]);
      ringIndices.push([idx]);
      isPole.push(true);
    } else {
      const ring: number[] = [];
      for (let s = 0; s < segments; s += 1) {
        const angle = (s / segments) * Math.PI * 2;
        const idx = rawVertices.length;
        rawVertices.push([Math.cos(angle) * pt[0], pt[1], Math.sin(angle) * pt[0]]);
        ring.push(idx);
      }
      ringIndices.push(ring);
      isPole.push(false);
    }
  }

  const rawTriangles: CadTriangle[] = [];
  const pairCount = isClosedLoop ? points.length : points.length - 1;
  for (let i = 0; i < pairCount; i += 1) {
    const nextI = (i + 1) % points.length;
    const rA = ringIndices[i];
    const rB = ringIndices[nextI];
    const poleA = isPole[i] ?? false;
    const poleB = isPole[nextI] ?? false;
    if (!rA || !rB || (poleA && poleB)) continue;

    for (let s = 0; s < segments; s += 1) {
      const nextS = (s + 1) % segments;
      if (poleA) {
        rawTriangles.push([rA[0] ?? 0, rB[s] ?? 0, rB[nextS] ?? 0]);
      } else if (poleB) {
        rawTriangles.push([rA[s] ?? 0, rB[0] ?? 0, rA[nextS] ?? 0]);
      } else {
        const a0 = rA[s] ?? 0;
        const a1 = rA[nextS] ?? 0;
        const b0 = rB[s] ?? 0;
        const b1 = rB[nextS] ?? 0;
        rawTriangles.push([a0, b0, b1]);
        rawTriangles.push([a0, b1, a1]);
      }
    }
  }

  return weldAndFinalizeSolidMesh({
    id: input.id ?? "solid-revolve",
    label: input.label ?? "축 회전 솔리드",
    rawVertices,
    rawTriangles,
    groundToFloorY0: input.groundToFloorY0 ?? true,
    metadata: {
      generator: "revolve-profile",
      segments,
      closedLoop: isClosedLoop,
    },
  });
}

function resampleClosedPolygon2D(polygon: readonly Vec2[], targetCount: number): Vec2[] {
  const n = polygon.length;
  const cumulative: number[] = [0];
  let totalLength = 0;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i] ?? [0, 0];
    const b = polygon[(i + 1) % n] ?? [0, 0];
    totalLength += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cumulative.push(totalLength);
  }
  const result: Vec2[] = [];
  for (let k = 0; k < targetCount; k += 1) {
    const dist = (k / targetCount) * totalLength;
    let seg = 0;
    while (seg < n - 1 && (cumulative[seg + 1] ?? 0) < dist) {
      seg += 1;
    }
    const segStart = cumulative[seg] ?? 0;
    const segEnd = cumulative[seg + 1] ?? totalLength;
    const t = segEnd > segStart ? (dist - segStart) / (segEnd - segStart) : 0;
    const a = polygon[seg] ?? [0, 0];
    const b = polygon[(seg + 1) % n] ?? [0, 0];
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return result;
}

function alignRingPhase(prev: readonly Vec2[], curr: readonly Vec2[]): Vec2[] {
  const m = curr.length;
  let bestShift = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let shift = 0; shift < m; shift += 1) {
    let cost = 0;
    for (let i = 0; i < m; i += 1) {
      const a = prev[i] ?? [0, 0];
      const b = curr[(i + shift) % m] ?? [0, 0];
      const dx = a[0] - b[0];
      const dz = a[1] - b[1];
      cost += dx * dx + dz * dz;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestShift = shift;
    }
  }
  return Array.from({ length: m }, (_, i) => curr[(i + bestShift) % m] ?? [0, 0]);
}

/**
 * 높이가 다른 다단 2D 닫힌 단면들을 꼬임 없이 보간 연결해 수밀 로프트 솔리드를 생성한다.
 */
export function loftCrossSectionsSolid(input: LoftSolidInput): CadSolidMesh {
  if (input.sections.length < 2) {
    throw new Error("다단 로프트 솔리드에는 최소 2개 이상의 단면이 필요합니다.");
  }
  const sorted = [...input.sections].sort((a, b) => a.yMeters - b.yMeters);
  for (let i = 1; i < sorted.length; i += 1) {
    const prevY = sorted[i - 1]?.yMeters ?? 0;
    const currY = sorted[i]?.yMeters ?? 0;
    if (currY - prevY <= 1e-5) {
      throw new Error("로프트 단면들의 높이(yMeters)는 서로 달라야 합니다.");
    }
  }

  const maxInputVerts = Math.max(...sorted.map((s) => s.polygon.length));
  const ringCount = Math.max(8, input.resampleCount ?? maxInputVerts);
  const resampledRings: Vec2[][] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const sec = sorted[i];
    if (!sec) continue;
    const clean = sanitizePolygon2D(sec.polygon);
    const sampled = resampleClosedPolygon2D(clean, ringCount);
    const prevRing = resampledRings[i - 1];
    resampledRings.push(prevRing ? alignRingPhase(prevRing, sampled) : sampled);
  }

  const rawVertices: Vec3[] = [];
  for (let sIdx = 0; sIdx < sorted.length; sIdx += 1) {
    const y = sorted[sIdx]?.yMeters ?? 0;
    const ring = resampledRings[sIdx] ?? [];
    for (const p of ring) {
      rawVertices.push([p[0], y, p[1]]);
    }
  }

  const rawTriangles: CadTriangle[] = [];
  const bottomTris = triangulateSimplePolygon2D(resampledRings[0] ?? []);
  for (const [i0, i1, i2] of bottomTris) {
    rawTriangles.push([i0, i1, i2]);
  }
  const topOffset = (sorted.length - 1) * ringCount;
  const topTris = triangulateSimplePolygon2D(resampledRings[sorted.length - 1] ?? []);
  for (const [i0, i1, i2] of topTris) {
    rawTriangles.push([topOffset + i0, topOffset + i2, topOffset + i1]);
  }

  const hardEdges: CadEdgePair[] = [];
  for (let sIdx = 0; sIdx < sorted.length - 1; sIdx += 1) {
    const baseA = sIdx * ringCount;
    const baseB = (sIdx + 1) * ringCount;
    for (let i = 0; i < ringCount; i += 1) {
      const next = (i + 1) % ringCount;
      const b0 = baseA + i;
      const b1 = baseA + next;
      const t0 = baseB + i;
      const t1 = baseB + next;
      rawTriangles.push([b1, b0, t0]);
      rawTriangles.push([b1, t0, t1]);
      if (sIdx === 0) hardEdges.push([b0, b1]);
      if (sIdx === sorted.length - 2) hardEdges.push([t0, t1]);
    }
  }

  return weldAndFinalizeSolidMesh({
    id: input.id ?? "solid-loft",
    label: input.label ?? "다단 로프트 솔리드",
    rawVertices,
    rawTriangles,
    groundToFloorY0: input.groundToFloorY0 ?? true,
    hardEdges,
    metadata: {
      generator: "loft-cross-sections",
      sectionCount: sorted.length,
      ringVertexCount: ringCount,
    },
  });
}

/**
 * 기존 수밀 솔리드의 지정 평면(기본: 상단 +Y 면)을 내측으로 오프셋 인셋한 뒤
 * 양수(돌출 보스) 또는 음수(오목 리세스·창틀) 깊이로 Push/Pull 변형한다.
 */
export function insetExtrudePlanarFace(
  solid: CadSolidMesh,
  input: FaceInsetExtrudeInput,
): CadSolidMesh {
  if (!Number.isFinite(input.insetMeters) || input.insetMeters <= 1e-5) {
    throw new Error("면 인셋 거리(insetMeters)는 0보다 큰 미터 값이어야 합니다.");
  }
  const targetNormal = vec3Normalize(input.targetNormal ?? [0, 1, 0]);
  const cosTol = Math.cos(((input.angleToleranceDeg ?? 5) * Math.PI) / 180);

  // 목표 법선과 일치하고 가장 바깥쪽 평면에 놓인 삼각형 집합 선택
  const matching: Array<{ index: number; planeOffset: number; normal: Vec3 }> = [];
  let maxPlaneOffset = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < solid.triangles.length; i += 1) {
    const tri = solid.triangles[i];
    if (!tri) continue;
    const a = solid.vertices[tri[0]];
    const b = solid.vertices[tri[1]];
    const c = solid.vertices[tri[2]];
    if (!a || !b || !c) continue;
    const { normal } = triangleNormalAndArea(a, b, c);
    if (vec3Dot(normal, targetNormal) < cosTol) continue;
    const offset = vec3Dot(a, targetNormal);
    if (offset > maxPlaneOffset) maxPlaneOffset = offset;
    matching.push({ index: i, planeOffset: offset, normal });
  }

  const selectedSet = new Set<number>();
  for (const item of matching) {
    if (Math.abs(item.planeOffset - maxPlaneOffset) <= 1e-4) {
      selectedSet.add(item.index);
    }
  }
  if (selectedSet.size === 0) {
    throw new Error("지정한 법선 방향에 해당하는 평면 영역을 솔리드에서 찾지 못했습니다.");
  }

  // 선택 영역의 경계 방향 반모서리(외곽 루프) 추출
  const halfEdgeCounts = new Map<string, { from: number; to: number; count: number }>();
  for (const triIdx of selectedSet) {
    const tri = solid.triangles[triIdx];
    if (!tri) continue;
    const edges: Array<[number, number]> = [
      [tri[0], tri[1]],
      [tri[1], tri[2]],
      [tri[2], tri[0]],
    ];
    for (const [from, to] of edges) {
      const revKey = `${to}->${from}`;
      const existingRev = halfEdgeCounts.get(revKey);
      if (existingRev && existingRev.count > 0) {
        existingRev.count -= 1;
        if (existingRev.count === 0) halfEdgeCounts.delete(revKey);
      } else {
        const key = `${from}->${to}`;
        const cur = halfEdgeCounts.get(key);
        if (cur) cur.count += 1;
        else halfEdgeCounts.set(key, { from, to, count: 1 });
      }
    }
  }

  const nextVertexMap = new Map<number, number>();
  for (const edge of halfEdgeCounts.values()) {
    nextVertexMap.set(edge.from, edge.to);
  }
  const startVertex = nextVertexMap.keys().next().value;
  if (startVertex === undefined) {
    throw new Error("선택한 평면의 경계 루프를 구성할 수 없습니다.");
  }

  const loopIndices: number[] = [];
  let cursor: number | undefined = startVertex;
  let guard = nextVertexMap.size + 4;
  while (cursor !== undefined && guard > 0) {
    guard -= 1;
    loopIndices.push(cursor);
    const next = nextVertexMap.get(cursor);
    if (next === startVertex) break;
    cursor = next;
  }
  if (loopIndices.length < 3 || loopIndices.length !== nextVertexMap.size) {
    throw new Error("단일 단순 경계 루프를 가진 평면만 인셋 돌출할 수 있습니다.");
  }

  // 평면 내 오프셋 교차점 계산
  const loopPoints: Vec3[] = loopIndices.map((idx) => solid.vertices[idx] ?? [0, 0, 0]);
  const n = loopPoints.length;
  const insetPoints: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = loopPoints[(i + n - 1) % n] ?? [0, 0, 0];
    const curr = loopPoints[i] ?? [0, 0, 0];
    const next = loopPoints[(i + 1) % n] ?? [0, 0, 0];
    const d1 = vec3Normalize(vec3Sub(curr, prev));
    const d2 = vec3Normalize(vec3Sub(next, curr));
    const in1 = vec3Normalize(vec3Cross(targetNormal, d1));
    const in2 = vec3Normalize(vec3Cross(targetNormal, d2));
    const p1 = vec3Add(curr, vec3Scale(in1, input.insetMeters));
    const p2 = vec3Add(curr, vec3Scale(in2, input.insetMeters));
    const denom = vec3Dot(d1, in2);
    if (Math.abs(denom) < 1e-6) {
      insetPoints.push(p1);
    } else {
      const s = -vec3Dot(vec3Sub(p1, p2), in2) / denom;
      const clampedS = Math.max(-input.insetMeters * 4, Math.min(input.insetMeters * 4, s));
      insetPoints.push(vec3Add(p1, vec3Scale(d1, clampedS)));
    }
  }

  // 평면 2D 기저로 투영해 인셋 폴리곤 유효성 및 삼각분할 수행
  const refAxis: Vec3 = Math.abs(targetNormal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const basisU = vec3Normalize(vec3Cross(refAxis, targetNormal));
  const basisV = vec3Cross(targetNormal, basisU);
  const origin = insetPoints[0] ?? [0, 0, 0];
  const insetPoly2D: Vec2[] = insetPoints.map((pt) => {
    const rel = vec3Sub(pt, origin);
    return [vec3Dot(rel, basisU), vec3Dot(rel, basisV)];
  });
  if (signedArea2D(insetPoly2D) <= 1e-7) {
    throw new Error("인셋 거리가 대상 면 크기보다 너무 커서 자기 교차가 발생했습니다.");
  }

  const rawVertices: Vec3[] = [...solid.vertices];
  const insetBaseIdx = rawVertices.length;
  for (const pt of insetPoints) rawVertices.push(pt);

  const depth = input.extrudeDepthMeters;
  const hasExtrude = Math.abs(depth) > 1e-6;
  const extrudeBaseIdx = hasExtrude ? rawVertices.length : insetBaseIdx;
  if (hasExtrude) {
    const delta = vec3Scale(targetNormal, depth);
    for (const pt of insetPoints) {
      rawVertices.push(vec3Add(pt, delta));
    }
  }

  const rawTriangles: CadTriangle[] = [];
  for (let i = 0; i < solid.triangles.length; i += 1) {
    if (selectedSet.has(i)) continue;
    const tri = solid.triangles[i];
    if (tri) rawTriangles.push(tri);
  }

  const hardEdges: CadEdgePair[] = [...solid.hardEdges];
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const out0 = loopIndices[i] ?? 0;
    const out1 = loopIndices[next] ?? 0;
    const in0 = insetBaseIdx + i;
    const in1 = insetBaseIdx + next;
    rawTriangles.push([out0, out1, in1]);
    rawTriangles.push([out0, in1, in0]);
    hardEdges.push([in0, in1]);

    if (hasExtrude) {
      const ex0 = extrudeBaseIdx + i;
      const ex1 = extrudeBaseIdx + next;
      rawTriangles.push([in0, in1, ex1]);
      rawTriangles.push([in0, ex1, ex0]);
      hardEdges.push([ex0, ex1], [in0, ex0]);
    }
  }

  const capTris = triangulateSimplePolygon2D(insetPoly2D);
  for (const [i0, i1, i2] of capTris) {
    rawTriangles.push([
      extrudeBaseIdx + i0,
      extrudeBaseIdx + i1,
      extrudeBaseIdx + i2,
    ]);
  }

  return weldAndFinalizeSolidMesh({
    id: input.id ?? `${solid.id}-inset`,
    label: input.label ?? `${solid.label} (면 인셋 돌출)`,
    rawVertices,
    rawTriangles,
    groundToFloorY0: input.groundToFloorY0 ?? true,
    hardEdges,
    metadata: {
      generator: "face-inset-extrude",
      insetMeters: input.insetMeters,
      extrudeDepthMeters: input.extrudeDepthMeters,
    },
  });
}
