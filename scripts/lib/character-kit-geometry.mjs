/**
 * 캐릭터 키트 검증기 — 키트 v2 규칙(V14 흐름 UV1·V21 형태 관통·V22 층 간격·V23 헤어 UV0·V24 UV1 밀도)이 쓰는 순수 기하 함수(2026-10-23, WP B-1).
 *
 * 모두 TypedArray만 받는 순수 함수라 합성 입력으로 시험한다(`scripts/verify-character-kit-v2.test.mjs`).
 *
 * - 표면 거리(`createSurface`·`closestOnSurface`): 가장 가까운 정점의 2-ring 삼각형 안에서 가장 가까운 점을 찾는다(Ericson 점-삼각형).
 *   부호는 그 점에서 보간한 정점 법선(없으면 면 법선) 방향이다: 양수 = 표면 바깥, 음수 = 안쪽(관통).
 *   정점 간격이 수 mm인 몸·머리 메시에서 오차는 곡률 반지름 R일 때 대략 간격²/(2R)로 0.1 mm 안팎이다.
 * - 가닥 흐름(`analyzeStrandField`): 헤어 메시의 프리미티브를 합치고 같은 위치·같은 값의 정점을 하나로 붙인다(v2 헤어는 색 영역이
 *   프리미티브라 가닥이 영역 경계에서 잘려 있다). 같은 값으로 이어진 정점 묶음(평탄 영역)마다 더 낮은·더 높은 이웃이 있는지 보고,
 *   국소 최소(뿌리)·최대(끝) 영역을 모은다. 영역을 지웠을 때 그 성분의 나머지가 둘 이상으로 갈라지면 가닥 **중간의** 극값(접힘)이다.
 *   뿌리 방향은 두피 거리로 본다: 성분에서 값이 가장 낮은 정점들이 가장 높은 정점들보다 두피에서 멀면 방향이 거꾸로다.
 * - UV 밀도(`measureUvDensity`): 삼각형마다 UV 면적/3D 면적에서 선형 배율(기대값 1 = 1 UV 단위가 `cmPerUnit` cm)과 이방성(UV 야코비안의
 *   특이값 비)을 재고, 3D 면적 가중 분위수를 낸다.
 */
import { PointGrid } from "./character-kit-glb-model.mjs";

// ---------------------------------------------------------------- 분위수(가중)

/** 값 배열의 분위수(q=1이면 최댓값). 빈 입력은 NaN */
export function quantile(values, q) {
  if (values.length === 0) return Number.NaN;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

/** 가중 분위수: 가중치 누적이 q·합에 처음 닿는 값 */
export function weightedQuantile(values, weights, q) {
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
  let total = 0;
  for (const index of order) total += weights[index];
  if (!(total > 0)) return Number.NaN;
  let running = 0;
  for (const index of order) {
    running += weights[index];
    if (running >= q * total) return values[index];
  }
  return values[order[order.length - 1]];
}

// ---------------------------------------------------------------- 표면 거리

/**
 * 여러 메시(정점 위치·인덱스·선택 법선)를 하나의 표면으로 묶는다. `cell`은 최근접 정점 탐색 격자 크기(m) — 멀리 떨어진 점까지 재야 하면 키운다.
 * @param {Array<{positions: Float32Array, indices: Uint32Array | null, normals?: Float32Array | null}>} meshes
 */
export function createSurface(meshes, { cell = 0.01 } = {}) {
  let vertexCount = 0;
  let triangleCount = 0;
  for (const mesh of meshes) {
    vertexCount += mesh.positions.length / 3;
    triangleCount += Math.floor((mesh.indices === null ? mesh.positions.length / 3 : mesh.indices.length) / 3);
  }
  const positions = new Float64Array(vertexCount * 3);
  const normals = new Float64Array(vertexCount * 3);
  const triangles = new Uint32Array(triangleCount * 3);
  let vertexOffset = 0;
  let triangleOffset = 0;
  for (const mesh of meshes) {
    const count = mesh.positions.length / 3;
    positions.set(mesh.positions, vertexOffset * 3);
    if (mesh.normals) normals.set(mesh.normals, vertexOffset * 3);
    const indexCount = mesh.indices === null ? count : mesh.indices.length - (mesh.indices.length % 3);
    for (let i = 0; i < indexCount; i += 1) triangles[triangleOffset * 3 + i] = (mesh.indices === null ? i : mesh.indices[i]) + vertexOffset;
    vertexOffset += count;
    triangleOffset += indexCount / 3;
  }
  const hasNormals = meshes.every((mesh) => mesh.normals);
  const grid = new PointGrid(positions, cell);
  // 같은 위치 정점(몸·머리 목 이음매, UV 이음매)을 한 꼭짓점으로 본다 — 안 그러면 이음매 한쪽 정점의 이웃 삼각형만 보고 반대쪽의 더 가까운 면을 놓친다
  const canonical = new Int32Array(vertexCount).fill(-1);
  for (let v = 0; v < vertexCount; v += 1) {
    if (canonical[v] >= 0) continue;
    canonical[v] = v;
    for (const other of grid.within(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], 1e-6)) if (canonical[other] < 0) canonical[other] = v;
  }
  // 대표 정점 → 삼각형(CSR)
  const degree = new Uint32Array(vertexCount + 1);
  for (let i = 0; i < triangles.length; i += 1) degree[canonical[triangles[i]] + 1] += 1;
  for (let v = 0; v < vertexCount; v += 1) degree[v + 1] += degree[v];
  const incident = new Uint32Array(triangles.length);
  const fill = degree.slice(0, vertexCount);
  for (let i = 0; i < triangles.length; i += 1) incident[fill[canonical[triangles[i]]]++] = Math.floor(i / 3);
  return { positions, normals, hasNormals, triangles, canonical, start: degree, incident, grid, vertexCount };
}

/** 점 p에서 삼각형 abc 위 가장 가까운 점의 무게중심 좌표(Ericson, Real-Time Collision Detection 5.1.5) */
function closestBarycentric(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [1 - v, v, 0];
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [1 - w, 0, w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [0, 1 - w, w];
  }
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return [1 - v - w, v, w];
}

/**
 * 표면 위 가장 가까운 점과 부호 거리(m). 가장 가까운 정점이 `radius`보다 멀면 null.
 * @returns {{distance: number, signed: number} | null}
 */
export function closestOnSurface(surface, x, y, z, radius) {
  const nearest = surface.grid.nearest(x, y, z, radius);
  if (nearest < 0) return null;
  const { positions: P, normals: N, triangles: T, canonical, start, incident } = surface;
  // 후보: 가장 가까운 정점(과 그보다 2 mm 안쪽으로 더 먼 정점들)의 삼각형, 그리고 그 삼각형 꼭짓점들의 삼각형(2-ring). 이음매 정점은 대표 정점으로 합친다.
  const seeds = new Set([canonical[nearest]]);
  const nearestDistance = Math.hypot(P[nearest * 3] - x, P[nearest * 3 + 1] - y, P[nearest * 3 + 2] - z);
  if (nearestDistance + 0.002 <= surface.grid.cell) for (const other of surface.grid.within(x, y, z, nearestDistance + 0.002)) seeds.add(canonical[other]);
  const candidates = new Set();
  for (const seed of seeds) {
    for (let k = start[seed]; k < start[seed + 1]; k += 1) {
      const t = incident[k];
      for (let c = 0; c < 3; c += 1) {
        const vertex = canonical[T[t * 3 + c]];
        for (let m = start[vertex]; m < start[vertex + 1]; m += 1) candidates.add(incident[m]);
      }
    }
  }
  let best = null;
  for (const t of candidates) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const [u, v, w] = closestBarycentric(x, y, z, P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], P[c * 3], P[c * 3 + 1], P[c * 3 + 2]);
    const qx = u * P[a * 3] + v * P[b * 3] + w * P[c * 3];
    const qy = u * P[a * 3 + 1] + v * P[b * 3 + 1] + w * P[c * 3 + 1];
    const qz = u * P[a * 3 + 2] + v * P[b * 3 + 2] + w * P[c * 3 + 2];
    const distance = Math.hypot(x - qx, y - qy, z - qz);
    // 퇴화 삼각형(두 꼭짓점이 겹친 극점 등)은 무게중심 식이 0/0이 되어 NaN이 나온다 — 그 후보는 버린다(안 버리면 최솟값 비교가 깨진다)
    if (!Number.isFinite(distance) || (best !== null && distance >= best.distance)) continue;
    let nx, ny, nz;
    if (surface.hasNormals) {
      nx = u * N[a * 3] + v * N[b * 3] + w * N[c * 3];
      ny = u * N[a * 3 + 1] + v * N[b * 3 + 1] + w * N[c * 3 + 1];
      nz = u * N[a * 3 + 2] + v * N[b * 3 + 2] + w * N[c * 3 + 2];
    } else {
      const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
      const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
      nx = e1y * e2z - e1z * e2y;
      ny = e1z * e2x - e1x * e2z;
      nz = e1x * e2y - e1y * e2x;
    }
    const sign = (x - qx) * nx + (y - qy) * ny + (z - qz) * nz >= 0 ? 1 : -1;
    best = { distance, signed: sign * distance };
  }
  return best;
}

/**
 * 점 집합의 표면 부호 거리 통계. `radius` 밖의 점은 비교하지 않고 센다.
 * @returns {{signed: Float64Array, matched: number, unmatched: number, worstIndex: number}}
 */
export function signedDistances(surface, points, radius) {
  const count = points.length / 3;
  const signed = new Float64Array(count).fill(Number.NaN);
  let matched = 0;
  let worstIndex = -1;
  for (let i = 0; i < count; i += 1) {
    const hit = closestOnSurface(surface, points[i * 3], points[i * 3 + 1], points[i * 3 + 2], radius);
    if (hit === null) continue;
    signed[i] = hit.signed;
    matched += 1;
    if (worstIndex < 0 || hit.signed < signed[worstIndex]) worstIndex = i;
  }
  return { signed, matched, unmatched: count - matched, worstIndex };
}

// ---------------------------------------------------------------- 가닥 흐름(헤어 UV의 v)

/**
 * 프리미티브들을 합쳐 같은 위치(`weldTolerance`)·같은 값(`epsilon`)의 정점을 붙이고, 가닥 흐름 값의 국소 극값 영역을 찾는다.
 * @param {Array<{positions: Float32Array, indices: Uint32Array | null, values: Float32Array}>} prims  `values`는 정점마다 값 하나(UV의 v)
 * @returns {{positions: Float64Array, values: Float64Array, component: Int32Array, components: Array<{min: number, max: number, size: number}>, extrema: Array<{kind: "min" | "max", value: number, size: number, component: number, interior: boolean, vertex: number}>}}
 */
export function analyzeStrandField(prims, { epsilon = 1e-4, weldTolerance = 1e-6 } = {}) {
  let total = 0;
  for (const prim of prims) total += prim.positions.length / 3;
  const raw = new Float64Array(total * 3);
  const rawValues = new Float64Array(total);
  let offset = 0;
  const edges = [];
  for (const prim of prims) {
    const count = prim.positions.length / 3;
    raw.set(prim.positions, offset * 3);
    for (let v = 0; v < count; v += 1) rawValues[offset + v] = prim.values[v];
    const indexCount = prim.indices === null ? count : prim.indices.length - (prim.indices.length % 3);
    for (let i = 0; i < indexCount; i += 3) {
      const a = (prim.indices === null ? i : prim.indices[i]) + offset;
      const b = (prim.indices === null ? i + 1 : prim.indices[i + 1]) + offset;
      const c = (prim.indices === null ? i + 2 : prim.indices[i + 2]) + offset;
      edges.push(a, b, b, c, c, a);
    }
    offset += count;
  }
  // 용접: 같은 위치·같은 값
  const grid = new PointGrid(raw, Math.max(weldTolerance * 10, 1e-5));
  const weld = new Int32Array(total).fill(-1);
  let welded = 0;
  for (let v = 0; v < total; v += 1) {
    if (weld[v] >= 0) continue;
    weld[v] = welded;
    for (const other of grid.within(raw[v * 3], raw[v * 3 + 1], raw[v * 3 + 2], weldTolerance)) {
      if (weld[other] < 0 && Math.abs(rawValues[other] - rawValues[v]) <= epsilon) weld[other] = welded;
    }
    welded += 1;
  }
  const positions = new Float64Array(welded * 3);
  const values = new Float64Array(welded);
  for (let v = 0; v < total; v += 1) {
    positions.set(raw.subarray(v * 3, v * 3 + 3), weld[v] * 3);
    values[weld[v]] = rawValues[v];
  }
  const neighbors = Array.from({ length: welded }, () => new Set());
  for (let i = 0; i < edges.length; i += 2) {
    const a = weld[edges[i]];
    const b = weld[edges[i + 1]];
    if (a === b) continue;
    neighbors[a].add(b);
    neighbors[b].add(a);
  }
  // 연결 성분
  const component = new Int32Array(welded).fill(-1);
  const components = [];
  for (let seed = 0; seed < welded; seed += 1) {
    if (component[seed] >= 0) continue;
    const id = components.length;
    const info = { min: Infinity, max: -Infinity, size: 0 };
    const stack = [seed];
    component[seed] = id;
    while (stack.length > 0) {
      const v = stack.pop();
      info.size += 1;
      info.min = Math.min(info.min, values[v]);
      info.max = Math.max(info.max, values[v]);
      for (const w of neighbors[v]) if (component[w] < 0) {
        component[w] = id;
        stack.push(w);
      }
    }
    components.push(info);
  }
  // 평탄 영역(같은 값으로 이어진 정점)
  const parent = Int32Array.from({ length: welded }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let v = 0; v < welded; v += 1) for (const w of neighbors[v]) if (Math.abs(values[v] - values[w]) <= epsilon) {
    const a = find(v);
    const b = find(w);
    if (a !== b) parent[a] = b;
  }
  const regions = new Map();
  for (let v = 0; v < welded; v += 1) {
    const root = find(v);
    let region = regions.get(root);
    if (region === undefined) {
      region = { members: [], lower: false, higher: false };
      regions.set(root, region);
    }
    region.members.push(v);
    for (const w of neighbors[v]) {
      if (values[w] < values[v] - epsilon) region.lower = true;
      else if (values[w] > values[v] + epsilon) region.higher = true;
    }
  }
  const extrema = [];
  for (const region of regions.values()) {
    const first = region.members[0];
    const info = components[component[first]];
    if (info.max - info.min <= epsilon) continue; // 값이 하나뿐인 성분(두피 덮개 등)은 흐름이 없다
    for (const kind of ["min", "max"]) {
      if (kind === "min" ? region.lower : region.higher) continue;
      extrema.push({ kind, value: values[first], size: region.members.length, component: component[first], interior: separates(region.members, neighbors), vertex: first });
    }
  }
  return { positions, values, component, components, extrema };
}

/** 영역(정점 집합)을 지우면 그 이웃들이 둘 이상의 덩어리로 갈라지는지(가닥 중간의 극값인지) */
function separates(members, neighbors) {
  const removed = new Set(members);
  const boundary = new Set();
  for (const v of members) for (const w of neighbors[v]) if (!removed.has(w)) boundary.add(w);
  if (boundary.size <= 1) return false;
  const [start] = boundary;
  const seen = new Set([start]);
  const stack = [start];
  let reached = 1;
  while (stack.length > 0 && reached < boundary.size) {
    const v = stack.pop();
    for (const w of neighbors[v]) {
      if (removed.has(w) || seen.has(w)) continue;
      seen.add(w);
      if (boundary.has(w)) reached += 1;
      stack.push(w);
    }
  }
  return reached < boundary.size;
}

/**
 * 성분마다 뿌리(값이 가장 낮은 정점들)가 끝(가장 높은 정점들)보다 두피에 가까운지. `fraction`은 성분 값 범위에서 양 끝으로 볼 비율.
 * @returns {Array<{component: number, rootDistance: number, tipDistance: number}>}  두피 거리를 잴 수 있었던 성분(흐름이 있는 성분만)
 */
export function strandRootDistances(field, scalp, { fraction = 0.05, radius = 0.25 } = {}) {
  const sums = new Map();
  const { positions, values, component, components } = field;
  for (let v = 0; v < values.length; v += 1) {
    const info = components[component[v]];
    const range = info.max - info.min;
    if (!(range > 0)) continue;
    const low = values[v] <= info.min + fraction * range;
    const high = values[v] >= info.max - fraction * range;
    if (!low && !high) continue;
    const hit = closestOnSurface(scalp, positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], radius);
    if (hit === null) continue;
    const entry = sums.get(component[v]) ?? { root: 0, rootN: 0, tip: 0, tipN: 0 };
    if (low) {
      entry.root += hit.distance;
      entry.rootN += 1;
    }
    if (high) {
      entry.tip += hit.distance;
      entry.tipN += 1;
    }
    sums.set(component[v], entry);
  }
  const out = [];
  for (const [id, entry] of sums) if (entry.rootN > 0 && entry.tipN > 0) out.push({ component: id, rootDistance: entry.root / entry.rootN, tipDistance: entry.tip / entry.tipN });
  return out;
}

// ---------------------------------------------------------------- UV 밀도

/**
 * UV 밀도: 삼각형마다 선형 배율 s = √(UV 면적/3D 면적) ÷ (100/cmPerUnit)(기대 1)과 이방성(UV 야코비안 특이값 비, ≥ 1).
 * @returns {{triangles: number, scaleP05: number, scaleP50: number, scaleP95: number, anisotropyP95: number, skipped: number}}
 */
export function measureUvDensity({ positions, indices, uvs, cmPerUnit }) {
  const expected = 100 / cmPerUnit; // UV 단위 / m
  const count = Math.floor((indices === null ? positions.length / 3 : indices.length) / 3);
  const scales = [];
  const anisotropy = [];
  const weights = [];
  let skipped = 0;
  for (let t = 0; t < count; t += 1) {
    const a = indices === null ? t * 3 : indices[t * 3];
    const b = indices === null ? t * 3 + 1 : indices[t * 3 + 1];
    const c = indices === null ? t * 3 + 2 : indices[t * 3 + 2];
    // 3D 삼각형을 자기 평면의 직교 좌표(e1, e2)로 옮긴다
    const ux = positions[b * 3] - positions[a * 3], uy = positions[b * 3 + 1] - positions[a * 3 + 1], uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const vx = positions[c * 3] - positions[a * 3], vy = positions[c * 3 + 1] - positions[a * 3 + 1], vz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const lu = Math.hypot(ux, uy, uz);
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(nx, ny, nz);
    if (!(lu > 0) || !(area > 1e-12)) {
      skipped += 1;
      continue;
    }
    const x1 = lu;
    const x2 = (ux * vx + uy * vy + uz * vz) / lu;
    const y2 = (2 * area) / lu;
    const du1 = uvs[b * 2] - uvs[a * 2], dv1 = uvs[b * 2 + 1] - uvs[a * 2 + 1];
    const du2 = uvs[c * 2] - uvs[a * 2], dv2 = uvs[c * 2 + 1] - uvs[a * 2 + 1];
    // UV = J · (x, y): 첫 변 (x1, 0) → (du1, dv1), 둘째 변 (x2, y2) → (du2, dv2)
    const j11 = du1 / x1, j21 = dv1 / x1;
    const j12 = (du2 - j11 * x2) / y2, j22 = (dv2 - j21 * x2) / y2;
    const frob = j11 * j11 + j12 * j12 + j21 * j21 + j22 * j22;
    const det = Math.abs(j11 * j22 - j12 * j21);
    const root = Math.sqrt(Math.max(0, frob * frob - 4 * det * det));
    const sigmaMax = Math.sqrt((frob + root) / 2);
    const sigmaMin = Math.sqrt(Math.max(0, (frob - root) / 2));
    if (!(det > 0) || !(sigmaMin > 0)) {
      skipped += 1;
      continue;
    }
    scales.push(Math.sqrt(det) / expected);
    anisotropy.push(sigmaMax / sigmaMin);
    weights.push(area);
  }
  return {
    triangles: scales.length,
    scaleP05: weightedQuantile(scales, weights, 0.05),
    scaleP50: weightedQuantile(scales, weights, 0.5),
    scaleP95: weightedQuantile(scales, weights, 0.95),
    anisotropyP95: weightedQuantile(anisotropy, weights, 0.95),
    skipped,
  };
}
