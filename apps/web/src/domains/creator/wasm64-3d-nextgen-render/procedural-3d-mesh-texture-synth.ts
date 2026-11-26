/**
 * 제로-스토리지 절차적 3D 건축·소품 메쉬 생성기 및 결정적 PBR 텍스처 합성기.
 *
 * - 5종 건축·소품(`staircase`, `colonnade-pillar`, `studio-window-frame`, `room-shell`, `stylized-tree`)을
 *   외부 에셋 0B로 실시간 생성(실세계 미터 단위 `1.0 = 1m`, `minY === 0` 바닥 접지, 퇴화 삼각형 0, 수밀 2-매니폴드).
 * - 타일 가능 Value fBm · Worley 셀룰러 노이즈 기반 4종 PBR 재질(`concrete`, `wood-grain`, `brick-wall`, `manga-screentone`)의
 *   RGBA8 알베도 + 탄젠트 공간 노멀맵 + 러프니스맵을 결정적으로 합성한다.
 */

export {
  synthesizeProceduralPbrTextures,
  type ProceduralMaterialKind,
  type ProceduralPbrTextureOptions,
  type ProceduralPbrTextureSet,
  type ProceduralPbrTextureStats,
} from "./procedural-pbr-texture-synth";

export type ProceduralAssetKind =
  | "staircase"
  | "colonnade-pillar"
  | "studio-window-frame"
  | "room-shell"
  | "stylized-tree";

export interface ProceduralMesh3d {
  readonly kind: ProceduralAssetKind;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
  readonly materialSlotNames: readonly string[];
}

export interface ProceduralMeshQualityReport {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly degenerateTriangleCount: number;
  readonly looseVertexCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly isWatertightManifold: boolean;
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly depthMeters: number;
  readonly isGroundedAtZero: boolean;
  readonly hasValidNormals: boolean;
  readonly hasValidUvs: boolean;
  readonly degenerateUvTriangleCount: number;
}

export interface ProceduralStaircaseOptions {
  readonly stepCount?: number;
  readonly widthMeters?: number;
  readonly stepHeightMeters?: number;
  readonly stepDepthMeters?: number;
}

export interface ProceduralPillarOptions {
  readonly heightMeters?: number;
  readonly shaftRadiusMeters?: number;
  readonly radialSegments?: number;
  readonly fluteCount?: number;
}

export interface ProceduralWindowFrameOptions {
  readonly widthMeters?: number;
  readonly heightMeters?: number;
  readonly depthMeters?: number;
  readonly frameThicknessMeters?: number;
}

export interface ProceduralRoomShellOptions {
  readonly widthMeters?: number;
  readonly heightMeters?: number;
  readonly depthMeters?: number;
  readonly wallThicknessMeters?: number;
}

export interface ProceduralTreeOptions {
  readonly heightMeters?: number;
  readonly trunkRadiusMeters?: number;
  readonly canopyRadiusMeters?: number;
  readonly radialSegments?: number;
  readonly canopySubdivisions?: number;
  readonly seed?: number;
}

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

class ManifoldMeshBuilder {
  private readonly pos: number[] = [];
  private readonly norm: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];

  addVertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    const len = Math.hypot(nx, ny, nz);
    const inv = len > 1e-8 ? 1 / len : 1;
    const id = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.norm.push(len > 1e-8 ? nx * inv : 0, len > 1e-8 ? ny * inv : 1, len > 1e-8 ? nz * inv : 0);
    this.uv.push(u, v);
    return id;
  }

  addTriangle(i0: number, i1: number, i2: number): void {
    this.idx.push(i0, i1, i2);
  }

  addQuad(i0: number, i1: number, i2: number, i3: number): void {
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  /** 오른손 외향 법선 + 비퇴화 평면 UV를 갖춘 닫힌 2-매니폴드 직육면체를 추가한다. */
  addClosedBox(
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
  ): void {
    const sx = Math.max(maxX - minX, 1e-4);
    const sy = Math.max(maxY - minY, 1e-4);
    const sz = Math.max(maxZ - minZ, 1e-4);

    const addFace = (
      p0: readonly [number, number, number],
      p1: readonly [number, number, number],
      p2: readonly [number, number, number],
      p3: readonly [number, number, number],
      n: readonly [number, number, number],
      uScale: number,
      vScale: number,
    ): void => {
      const v0 = this.addVertex(p0[0], p0[1], p0[2], n[0], n[1], n[2], 0, 0);
      const v1 = this.addVertex(p1[0], p1[1], p1[2], n[0], n[1], n[2], uScale, 0);
      const v2 = this.addVertex(p2[0], p2[1], p2[2], n[0], n[1], n[2], uScale, vScale);
      const v3 = this.addVertex(p3[0], p3[1], p3[2], n[0], n[1], n[2], 0, vScale);
      this.addQuad(v0, v1, v2, v3);
    };

    // +Z (앞면)
    addFace([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1], sx, sy);
    // -Z (뒷면)
    addFace([maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1], sx, sy);
    // +X (우측면)
    addFace([maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [1, 0, 0], sz, sy);
    // -X (좌측면)
    addFace([minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [-1, 0, 0], sz, sy);
    // +Y (윗면)
    addFace([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0], sx, sz);
    // -Y (아랫면)
    addFace([minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0], sx, sz);
  }

  /**
   * 닫힌 회전체(Lathe) 솔리드를 추가한다. 하단/상단 평면 캡을 포함해 수밀 2-매니폴드를 보장한다.
   * `profile`은 아래에서 위로 단조 증가하는 `(radius, y, fluteAmp)` 목록이어야 한다.
   */
  addClosedLathe(
    profile: readonly { readonly r: number; readonly y: number; readonly fluteAmp?: number; readonly bendX?: number }[],
    radialSegments: number,
    fluteCount: number,
  ): void {
    const segs = Math.max(8, Math.floor(radialSegments));
    const rings = profile.length;
    if (rings < 2) return;

    const ringAngles: number[] = [];
    const ringCos: number[] = [];
    const ringSin: number[] = [];
    for (let s = 0; s <= segs; s += 1) {
      const a = s === segs ? 0 : (s / segs) * Math.PI * 2;
      ringAngles.push(a);
      ringCos.push(Math.cos(a));
      ringSin.push(Math.sin(a));
    }

    const totalH = Math.max(profile[rings - 1].y - profile[0].y, 1e-4);
    const ringStarts: number[] = [];

    for (let i = 0; i < rings; i += 1) {
      const curr = profile[i];
      const prev = profile[Math.max(0, i - 1)];
      const next = profile[Math.min(rings - 1, i + 1)];
      const dy = next.y - prev.y;
      const dr = next.r - prev.r;
      const vCoord = (curr.y - profile[0].y) / totalH;
      const fluteAmp = curr.fluteAmp ?? 0;
      const bendX = curr.bendX ?? 0;
      ringStarts.push(this.pos.length / 3);

      for (let s = 0; s <= segs; s += 1) {
        const theta = ringAngles[s];
        const flute = fluteAmp > 0 ? 1 - fluteAmp * (0.5 - 0.5 * Math.cos(fluteCount * theta)) : 1;
        const r = Math.max(curr.r * flute, 0.005);
        const cx = ringCos[s];
        const sz = ringSin[s];
        const x = bendX + cx * r;
        const z = sz * r;
        const nr = Math.abs(dy) > 1e-5 ? dy : 1;
        const ny = Math.abs(dy) > 1e-5 ? -dr : 0;
        this.addVertex(x, curr.y, z, cx * nr, ny, sz * nr, s / segs, vCoord);
      }
    }

    for (let i = 0; i < rings - 1; i += 1) {
      const r0 = ringStarts[i];
      const r1 = ringStarts[i + 1];
      for (let s = 0; s < segs; s += 1) {
        const a = r0 + s;
        const b = r0 + s + 1;
        const c = r1 + s + 1;
        const d = r1 + s;
        this.addQuad(a, d, c, b);
      }
    }

    // 하단 캡(y = profile[0].y, 법선 -Y)
    const bot = profile[0];
    const botBendX = bot.bendX ?? 0;
    const botCenter = this.addVertex(botBendX, bot.y, 0, 0, -1, 0, 0.5, 0.5);
    const botRingStart = this.pos.length / 3;
    for (let s = 0; s <= segs; s += 1) {
      const flute = (bot.fluteAmp ?? 0) > 0 ? 1 - (bot.fluteAmp ?? 0) * (0.5 - 0.5 * Math.cos(fluteCount * ringAngles[s])) : 1;
      const r = Math.max(bot.r * flute, 0.005);
      this.addVertex(
        botBendX + ringCos[s] * r,
        bot.y,
        ringSin[s] * r,
        0, -1, 0,
        0.5 + 0.45 * ringCos[s],
        0.5 + 0.45 * ringSin[s],
      );
    }
    for (let s = 0; s < segs; s += 1) {
      this.addTriangle(botCenter, botRingStart + s, botRingStart + s + 1);
    }

    // 상단 캡(y = profile[rings - 1].y, 법선 +Y)
    const top = profile[rings - 1];
    const topBendX = top.bendX ?? 0;
    const topCenter = this.addVertex(topBendX, top.y, 0, 0, 1, 0, 0.5, 0.5);
    const topRingStart = this.pos.length / 3;
    for (let s = 0; s <= segs; s += 1) {
      const flute = (top.fluteAmp ?? 0) > 0 ? 1 - (top.fluteAmp ?? 0) * (0.5 - 0.5 * Math.cos(fluteCount * ringAngles[s])) : 1;
      const r = Math.max(top.r * flute, 0.005);
      this.addVertex(
        topBendX + ringCos[s] * r,
        top.y,
        ringSin[s] * r,
        0, 1, 0,
        0.5 + 0.45 * ringCos[s],
        0.5 + 0.45 * ringSin[s],
      );
    }
    for (let s = 0; s < segs; s += 1) {
      this.addTriangle(topCenter, topRingStart + s + 1, topRingStart + s);
    }
  }

  /** 극점 핀칭 없는 큐브 투영 쿼드 구체(수밀 2-매니폴드 유기체/수관용)를 추가한다. */
  addOrganicQuadSphere(
    cx: number, cy: number, cz: number,
    rx: number, ry: number, rz: number,
    subdivisions: number,
    seed: number,
  ): void {
    const n = Math.max(2, Math.floor(subdivisions));
    const faces: readonly {
      readonly origin: readonly [number, number, number];
      readonly uAxis: readonly [number, number, number];
      readonly vAxis: readonly [number, number, number];
    }[] = [
      { origin: [-1, -1, 1], uAxis: [2, 0, 0], vAxis: [0, 2, 0] },
      { origin: [1, -1, -1], uAxis: [-2, 0, 0], vAxis: [0, 2, 0] },
      { origin: [1, -1, 1], uAxis: [0, 0, -2], vAxis: [0, 2, 0] },
      { origin: [-1, -1, -1], uAxis: [0, 0, 2], vAxis: [0, 2, 0] },
      { origin: [-1, 1, 1], uAxis: [2, 0, 0], vAxis: [0, 0, -2] },
      { origin: [-1, -1, -1], uAxis: [2, 0, 0], vAxis: [0, 0, 2] },
    ];

    for (let f = 0; f < faces.length; f += 1) {
      const face = faces[f];
      const baseVertex = this.pos.length / 3;
      const stride = n + 1;
      for (let j = 0; j <= n; j += 1) {
        const tv = j / n;
        for (let i = 0; i <= n; i += 1) {
          const tu = i / n;
          const px = face.origin[0] + face.uAxis[0] * tu + face.vAxis[0] * tv;
          const py = face.origin[1] + face.uAxis[1] * tu + face.vAxis[1] * tv;
          const pz = face.origin[2] + face.uAxis[2] * tu + face.vAxis[2] * tv;
          const len = Math.hypot(px, py, pz);
          const ux = px / len;
          const uy = py / len;
          const uz = pz / len;
          const ripple = 1 + 0.07 * Math.sin(ux * 4.2 + seed) * Math.cos(uz * 4.2 - seed * 0.7) + 0.04 * Math.sin(uy * 5.0 + seed * 1.3);
          this.addVertex(
            cx + ux * rx * ripple,
            cy + uy * ry * ripple,
            cz + uz * rz * ripple,
            ux / Math.max(rx, 1e-3),
            uy / Math.max(ry, 1e-3),
            uz / Math.max(rz, 1e-3),
            tu,
            tv,
          );
        }
      }
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          const a = baseVertex + j * stride + i;
          const b = a + 1;
          const c = a + stride + 1;
          const d = a + stride;
          this.addQuad(a, b, c, d);
        }
      }
    }
  }

  /** 모든 정점을 `minY === 0`으로 정확히 바닥 접지해 최종 `ProceduralMesh3d`를 빌드한다. */
  build(kind: ProceduralAssetKind, materialSlotNames: readonly string[]): ProceduralMesh3d {
    const vertexCount = this.pos.length / 3;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < vertexCount; i += 1) {
      const x = this.pos[i * 3];
      const y = this.pos[i * 3 + 1];
      const z = this.pos[i * 3 + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    const yShift = Number.isFinite(minY) ? -minY : 0;
    const positions = new Float32Array(this.pos.length);
    for (let i = 0; i < vertexCount; i += 1) {
      positions[i * 3] = this.pos[i * 3];
      const shiftedY = this.pos[i * 3 + 1] + yShift;
      positions[i * 3 + 1] = Math.abs(shiftedY) < 1e-7 ? 0 : shiftedY;
      positions[i * 3 + 2] = this.pos[i * 3 + 2];
    }

    let finalMinY = Infinity;
    let finalMaxY = -Infinity;
    for (let i = 0; i < vertexCount; i += 1) {
      const y = positions[i * 3 + 1];
      if (y < finalMinY) finalMinY = y;
      if (y > finalMaxY) finalMaxY = y;
    }

    return {
      kind,
      positions,
      normals: new Float32Array(this.norm),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.idx),
      vertexCount,
      triangleCount: this.idx.length / 3,
      boundsMin: [vertexCount > 0 ? minX : 0, vertexCount > 0 ? finalMinY : 0, vertexCount > 0 ? minZ : 0],
      boundsMax: [vertexCount > 0 ? maxX : 0, vertexCount > 0 ? finalMaxY : 0, vertexCount > 0 ? maxZ : 0],
      materialSlotNames,
    };
  }
}

/** 1. 단일 수밀 2-매니폴드 건축 계단(`staircase`)을 생성한다. */
export function generateProceduralStaircase(options: ProceduralStaircaseOptions = {}): ProceduralMesh3d {
  const steps = Math.max(2, Math.min(32, Math.floor(options.stepCount ?? 8)));
  const width = clampNum(options.widthMeters ?? 1.2, 0.4, 8.0);
  const rise = clampNum(options.stepHeightMeters ?? 0.18, 0.08, 0.4);
  const run = clampNum(options.stepDepthMeters ?? 0.28, 0.14, 0.8);

  const halfW = width * 0.5;
  const totalRun = steps * run;
  const totalRise = steps * rise;
  const builder = new ManifoldMeshBuilder();

  // 단면 윤곽(Z, Y)을 반시계 순서로 구성: P0(0,0) -> 계단 단 -> P_2N(totalRun, totalRise) -> C(totalRun, 0)
  const profile: [number, number][] = [[0, 0]];
  for (let s = 0; s < steps; s += 1) {
    profile.push([s * run, (s + 1) * rise]);
    profile.push([(s + 1) * run, (s + 1) * rise]);
  }
  profile.push([totalRun, 0]);
  const cornerIdx = profile.length - 1;
  const cornerZ = profile[cornerIdx][0];
  const cornerY = profile[cornerIdx][1];

  // +X 측면 캡 (C에서 모든 계단 선분으로 팬 삼각분할: 극각 단조 감소 -> 퇴화 0 · T접합 0)
  const rCenter = builder.addVertex(halfW, cornerY, cornerZ, 1, 0, 0, cornerZ / totalRun, cornerY / totalRise);
  const rRing: number[] = [];
  for (let i = 0; i < cornerIdx; i += 1) {
    rRing.push(builder.addVertex(halfW, profile[i][1], profile[i][0], 1, 0, 0, profile[i][0] / totalRun, profile[i][1] / totalRise));
  }
  for (let i = 0; i < cornerIdx - 1; i += 1) {
    builder.addTriangle(rCenter, rRing[i], rRing[i + 1]);
  }

  // -X 측면 캡 (반대 와인딩)
  const lCenter = builder.addVertex(-halfW, cornerY, cornerZ, -1, 0, 0, cornerZ / totalRun, cornerY / totalRise);
  const lRing: number[] = [];
  for (let i = 0; i < cornerIdx; i += 1) {
    lRing.push(builder.addVertex(-halfW, profile[i][1], profile[i][0], -1, 0, 0, profile[i][0] / totalRun, profile[i][1] / totalRise));
  }
  for (let i = 0; i < cornerIdx - 1; i += 1) {
    builder.addTriangle(lCenter, lRing[i + 1], lRing[i]);
  }

  // 외곽 압출 스트립(디딤판 · 챌판 · 후면벽 · 바닥)
  const nPts = profile.length;
  for (let i = 0; i < nPts; i += 1) {
    const p0 = profile[i];
    const p1 = profile[(i + 1) % nPts];
    const dz = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const segLen = Math.hypot(dz, dy);
    if (segLen < 1e-6) continue;
    // (z, y) 반시계 윤곽의 외향 법선: (-dy, dz) -> 3D (0, dz, -dy)
    const ny = dz / segLen;
    const nz = -dy / segLen;
    const v0 = builder.addVertex(-halfW, p0[1], p0[0], 0, ny, nz, 0, 0);
    const v1 = builder.addVertex(halfW, p0[1], p0[0], 0, ny, nz, width, 0);
    const v2 = builder.addVertex(halfW, p1[1], p1[0], 0, ny, nz, width, segLen);
    const v3 = builder.addVertex(-halfW, p1[1], p1[0], 0, ny, nz, 0, segLen);
    builder.addQuad(v0, v1, v2, v3);
  }

  return builder.build("staircase", ["concrete", "tread-stone"]);
}

/** 2. 주초·플루팅 주신·주두를 갖춘 고전 열주(`colonnade-pillar`)를 생성한다. */
export function generateProceduralColonnadePillar(options: ProceduralPillarOptions = {}): ProceduralMesh3d {
  const height = clampNum(options.heightMeters ?? 3.4, 1.0, 12.0);
  const r = clampNum(options.shaftRadiusMeters ?? 0.24, 0.08, 1.5);
  const radialSegments = Math.max(16, Math.min(64, Math.floor(options.radialSegments ?? 24)));
  const fluteCount = Math.max(6, Math.min(24, Math.floor(options.fluteCount ?? 12)));

  const builder = new ManifoldMeshBuilder();
  const profile = [
    { r: r * 1.48, y: 0.0, fluteAmp: 0 },
    { r: r * 1.48, y: height * 0.06, fluteAmp: 0 },
    { r: r * 1.32, y: height * 0.085, fluteAmp: 0 },
    { r: r * 1.18, y: height * 0.115, fluteAmp: 0 },
    { r: r * 1.04, y: height * 0.14, fluteAmp: 0.05 },
    { r: r * 1.0, y: height * 0.45, fluteAmp: 0.06 },
    { r: r * 0.94, y: height * 0.78, fluteAmp: 0.055 },
    { r: r * 0.91, y: height * 0.86, fluteAmp: 0.03 },
    { r: r * 1.14, y: height * 0.905, fluteAmp: 0 },
    { r: r * 1.38, y: height * 0.945, fluteAmp: 0 },
    { r: r * 1.44, y: height * 0.96, fluteAmp: 0 },
    { r: r * 1.44, y: height, fluteAmp: 0 },
  ];

  builder.addClosedLathe(profile, radialSegments, fluteCount);
  return builder.build("colonnade-pillar", ["stone-plaster", "capital-trim"]);
}

/** 3. 창틀·멀리언·트랜섬·유리창으로 구성된 스튜디오 창문 프레임(`studio-window-frame`)을 생성한다. */
export function generateProceduralStudioWindowFrame(options: ProceduralWindowFrameOptions = {}): ProceduralMesh3d {
  const width = clampNum(options.widthMeters ?? 1.8, 0.6, 6.0);
  const height = clampNum(options.heightMeters ?? 2.0, 0.6, 5.0);
  const depth = clampNum(options.depthMeters ?? 0.16, 0.06, 0.6);
  const frameT = clampNum(options.frameThicknessMeters ?? 0.09, 0.03, Math.min(width, height) * 0.2);

  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const gap = 0.002; // 2mm 건축 섀도우 갭(비중첩 수밀 솔리드 보장)
  const sillH = frameT * 1.15;
  const mullionW = frameT * 0.55;
  const transomY = height * 0.68;

  const builder = new ManifoldMeshBuilder();
  // 하부 창대(sill, y = 0 접지)
  builder.addClosedBox(-halfW - 0.03, 0, -halfD - 0.02, halfW + 0.03, sillH, halfD + 0.03);
  // 좌·우 프레임(jamb)
  builder.addClosedBox(-halfW, sillH + gap, -halfD, -halfW + frameT, height - frameT - gap, halfD);
  builder.addClosedBox(halfW - frameT, sillH + gap, -halfD, halfW, height - frameT - gap, halfD);
  // 상부 인방(lintel)
  builder.addClosedBox(-halfW, height - frameT, -halfD, halfW, height, halfD);
  // 중앙 수직 멀리언
  builder.addClosedBox(-mullionW * 0.5, sillH + gap, -halfD * 0.65, mullionW * 0.5, height - frameT - gap, halfD * 0.65);
  // 좌·우 수평 트랜섬
  builder.addClosedBox(-halfW + frameT + gap, transomY - mullionW * 0.5, -halfD * 0.55, -mullionW * 0.5 - gap, transomY + mullionW * 0.5, halfD * 0.55);
  builder.addClosedBox(mullionW * 0.5 + gap, transomY - mullionW * 0.5, -halfD * 0.55, halfW - frameT - gap, transomY + mullionW * 0.5, halfD * 0.55);
  // 4분할 유리 패널(프레임 내부 2mm 여유로 교차/Z-파이팅 차단)
  const gHalfD = 0.006;
  const xL0 = -halfW + frameT + gap * 2;
  const xL1 = -mullionW * 0.5 - gap * 2;
  const xR0 = mullionW * 0.5 + gap * 2;
  const xR1 = halfW - frameT - gap * 2;
  const yB0 = sillH + gap * 2;
  const yB1 = transomY - mullionW * 0.5 - gap * 2;
  const yT0 = transomY + mullionW * 0.5 + gap * 2;
  const yT1 = height - frameT - gap * 2;
  builder.addClosedBox(xL0, yB0, -gHalfD, xL1, yB1, gHalfD);
  builder.addClosedBox(xR0, yB0, -gHalfD, xR1, yB1, gHalfD);
  builder.addClosedBox(xL0, yT0, -gHalfD, xL1, yT1, gHalfD);
  builder.addClosedBox(xR0, yT0, -gHalfD, xR1, yT1, gHalfD);

  return builder.build("studio-window-frame", ["wood-frame", "studio-glass"]);
}

/** 4. 바닥·3면 벽·천장·걸레받이로 구성된 스튜디오 룸 셸(`room-shell`)을 생성한다. */
export function generateProceduralRoomShell(options: ProceduralRoomShellOptions = {}): ProceduralMesh3d {
  const width = clampNum(options.widthMeters ?? 6.0, 2.0, 30.0);
  const height = clampNum(options.heightMeters ?? 3.2, 2.0, 12.0);
  const depth = clampNum(options.depthMeters ?? 5.0, 2.0, 30.0);
  const wallT = clampNum(options.wallThicknessMeters ?? 0.18, 0.08, 0.6);

  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const gap = 0.002;
  const builder = new ManifoldMeshBuilder();

  // 바닥 슬래브(y = 0 접지)
  builder.addClosedBox(-halfW, 0, -halfD, halfW, wallT, halfD);
  // 후면 벽
  builder.addClosedBox(-halfW, wallT + gap, -halfD, halfW, height - wallT - gap, -halfD + wallT);
  // 좌측 벽
  builder.addClosedBox(-halfW, wallT + gap, -halfD + wallT + gap, -halfW + wallT, height - wallT - gap, halfD);
  // 우측 벽
  builder.addClosedBox(halfW - wallT, wallT + gap, -halfD + wallT + gap, halfW, height - wallT - gap, halfD);
  // 천장 슬래브
  builder.addClosedBox(-halfW, height - wallT, -halfD, halfW, height, halfD);
  // 후면 걸레받이(baseboard)
  builder.addClosedBox(-halfW + wallT + gap * 2, wallT + gap * 2, -halfD + wallT + gap, halfW - wallT - gap * 2, wallT + 0.11, -halfD + wallT + 0.026);

  return builder.build("room-shell", ["floor-wood", "wall-plaster", "ceiling-matte"]);
}

/** 5. 뿌리 플레어 줄기 + 큐브 투영 쿼드-스피어 다층 수관의 스타일화 나무(`stylized-tree`)를 생성한다. */
export function generateProceduralStylizedTree(options: ProceduralTreeOptions = {}): ProceduralMesh3d {
  const height = clampNum(options.heightMeters ?? 4.2, 1.5, 16.0);
  const trunkR = clampNum(options.trunkRadiusMeters ?? 0.22, 0.06, 0.9);
  const canopyR = clampNum(options.canopyRadiusMeters ?? 1.25, 0.4, 5.0);
  const radialSegments = Math.max(12, Math.min(36, Math.floor(options.radialSegments ?? 16)));
  const canopySubdiv = Math.max(2, Math.min(8, Math.floor(options.canopySubdivisions ?? 4)));
  const seed = Math.floor(options.seed ?? 42);

  const trunkH = height * 0.62;
  const builder = new ManifoldMeshBuilder();

  const trunkProfile = [
    { r: trunkR * 1.45, y: 0.0, bendX: 0.0 },
    { r: trunkR * 1.1, y: trunkH * 0.14, bendX: 0.02 },
    { r: trunkR * 0.92, y: trunkH * 0.42, bendX: 0.06 },
    { r: trunkR * 0.74, y: trunkH * 0.72, bendX: 0.02 },
    { r: trunkR * 0.52, y: trunkH, bendX: -0.02 },
  ];
  builder.addClosedLathe(trunkProfile, radialSegments, 0);

  // 다층 스타일화 수관(극점 핀칭 없는 쿼드 구체)
  builder.addOrganicQuadSphere(0.0, height - canopyR * 0.85, 0.0, canopyR, canopyR * 0.82, canopyR, canopySubdiv, seed);
  builder.addOrganicQuadSphere(-canopyR * 0.62, trunkH + canopyR * 0.35, canopyR * 0.34, canopyR * 0.62, canopyR * 0.54, canopyR * 0.6, canopySubdiv, seed + 17);
  builder.addOrganicQuadSphere(canopyR * 0.58, trunkH + canopyR * 0.48, -canopyR * 0.32, canopyR * 0.58, canopyR * 0.5, canopyR * 0.56, canopySubdiv, seed + 31);

  return builder.build("stylized-tree", ["bark-wood", "foliage-canopy"]);
}

/** 생성된 3D 메쉬의 매니폴드 무결성 · 퇴화 삼각형 · 접지 · 법선 · UV 품질을 정밀 검사한다. */
export function inspectProceduralMeshQuality(mesh: ProceduralMesh3d): ProceduralMeshQualityReport {
  const { positions, normals, uvs, indices, vertexCount, triangleCount } = mesh;
  const referenced = new Uint8Array(vertexCount);
  const edgeCounts = new Map<string, number>();

  const posKey = (vi: number): string => {
    const qx = Math.round(positions[vi * 3] * 10000);
    const qy = Math.round(positions[vi * 3 + 1] * 10000);
    const qz = Math.round(positions[vi * 3 + 2] * 10000);
    return `${qx},${qy},${qz}`;
  };

  let degenerateTriangleCount = 0;
  let degenerateUvTriangleCount = 0;

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    referenced[i0] = 1;
    referenced[i1] = 1;
    referenced[i2] = 1;

    const ax = positions[i0 * 3]; const ay = positions[i0 * 3 + 1]; const az = positions[i0 * 3 + 2];
    const bx = positions[i1 * 3]; const by = positions[i1 * 3 + 1]; const bz = positions[i1 * 3 + 2];
    const cx = positions[i2 * 3]; const cy = positions[i2 * 3 + 1]; const cz = positions[i2 * 3 + 2];
    const e1x = bx - ax; const e1y = by - ay; const e1z = bz - az;
    const e2x = cx - ax; const e2y = cy - ay; const e2z = cz - az;
    const crossLen = Math.hypot(
      e1y * e2z - e1z * e2y,
      e1z * e2x - e1x * e2z,
      e1x * e2y - e1y * e2x,
    );
    if (!Number.isFinite(crossLen) || crossLen * 0.5 <= 1e-7) {
      degenerateTriangleCount += 1;
    }

    const u0 = uvs[i0 * 2]; const v0 = uvs[i0 * 2 + 1];
    const u1 = uvs[i1 * 2]; const v1 = uvs[i1 * 2 + 1];
    const u2 = uvs[i2 * 2]; const v2 = uvs[i2 * 2 + 1];
    const uvArea = Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)) * 0.5;
    if (!Number.isFinite(uvArea) || uvArea <= 1e-9) {
      degenerateUvTriangleCount += 1;
    }

    const keys = [posKey(i0), posKey(i1), posKey(i2)];
    for (let e = 0; e < 3; e += 1) {
      const ka = keys[e];
      const kb = keys[(e + 1) % 3];
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      edgeCounts.set(ek, (edgeCounts.get(ek) ?? 0) + 1);
    }
  }

  let looseVertexCount = 0;
  let hasValidNormals = vertexCount > 0;
  let hasValidUvs = vertexCount > 0;
  for (let i = 0; i < vertexCount; i += 1) {
    if (referenced[i] === 0) looseVertexCount += 1;
    const nLen = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    if (!Number.isFinite(nLen) || Math.abs(nLen - 1) > 1e-3) hasValidNormals = false;
    if (!Number.isFinite(uvs[i * 2]) || !Number.isFinite(uvs[i * 2 + 1])) hasValidUvs = false;
  }

  let nonManifoldEdgeCount = 0;
  let boundaryEdgeCount = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    else if (count > 2) nonManifoldEdgeCount += 1;
  }

  const widthMeters = mesh.boundsMax[0] - mesh.boundsMin[0];
  const heightMeters = mesh.boundsMax[1] - mesh.boundsMin[1];
  const depthMeters = mesh.boundsMax[2] - mesh.boundsMin[2];
  const isGroundedAtZero = Math.abs(mesh.boundsMin[1]) <= 1e-6;
  const isWatertightManifold =
    triangleCount > 0 &&
    degenerateTriangleCount === 0 &&
    looseVertexCount === 0 &&
    nonManifoldEdgeCount === 0 &&
    boundaryEdgeCount === 0;

  return {
    vertexCount,
    triangleCount,
    degenerateTriangleCount,
    looseVertexCount,
    nonManifoldEdgeCount,
    boundaryEdgeCount,
    isWatertightManifold,
    boundsMin: mesh.boundsMin,
    boundsMax: mesh.boundsMax,
    widthMeters,
    heightMeters,
    depthMeters,
    isGroundedAtZero,
    hasValidNormals,
    hasValidUvs: hasValidUvs && degenerateUvTriangleCount === 0,
    degenerateUvTriangleCount,
  };
}
