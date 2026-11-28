/**
 * Wave 90 — 3D 파라메트릭 프롭(건물 블록·아치 출입구·열주·액션 집중선 터널)
 * 기하 생성기 및 면/모서리 구조 정의.
 */

import type { CurvilinearGeodesicPolyline, Vec3 } from "./curvilinear-math-types";

export type CurvilinearPropPresetKind =
  | "box-building"
  | "arch-doorway"
  | "pillar-row"
  | "action-speedline-tunnel";

export interface BoxBuildingPropSpec {
  readonly kind: "box-building";
  readonly id: string;
  readonly label?: string;
  readonly center: Vec3;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly floorDivisions?: number;
  readonly curveSteps?: number;
}

export interface ArchDoorwayPropSpec {
  readonly kind: "arch-doorway";
  readonly id: string;
  readonly label?: string;
  readonly center: Vec3;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly archSegments?: number;
  readonly curveSteps?: number;
}

export interface PillarRowPropSpec {
  readonly kind: "pillar-row";
  readonly id: string;
  readonly label?: string;
  readonly start: Vec3;
  readonly spacing: number;
  readonly count: number;
  readonly pillarWidth: number;
  readonly pillarHeight: number;
  readonly rowAxis?: "x" | "z";
  readonly curveSteps?: number;
}

export interface ActionSpeedlineTunnelPropSpec {
  readonly kind: "action-speedline-tunnel";
  readonly id: string;
  readonly label?: string;
  readonly center: Vec3;
  readonly radius: number;
  readonly nearDepth: number;
  readonly farDepth: number;
  readonly rayCount: number;
  readonly ringCount?: number;
  readonly twistRad?: number;
  readonly curveSteps?: number;
}

export type CurvilinearPropSpec =
  | BoxBuildingPropSpec
  | ArchDoorwayPropSpec
  | PillarRowPropSpec
  | ActionSpeedlineTunnelPropSpec;

export type BentCurveRole = "silhouette" | "interior" | "speedline" | "arch" | "ring";

export interface CurvilinearBentEdgeCurve {
  readonly edgeId: string;
  readonly role: BentCurveRole;
  readonly avgDepth: number;
  readonly frontFacing: boolean;
  readonly polyline: CurvilinearGeodesicPolyline;
}

export interface CurvilinearBentPropResult {
  readonly propId: string;
  readonly kind: CurvilinearPropPresetKind;
  readonly label: string;
  readonly curves: readonly CurvilinearBentEdgeCurve[];
  readonly culledBackFaceCount: number;
  readonly visibleFaceCount: number;
  readonly totalEdgeCount: number;
  readonly visibleEdgeCount: number;
  readonly maxBendDeviationPx: number;
  readonly meanBendDeviationPx: number;
  readonly depthRange: { readonly minDepth: number; readonly maxDepth: number };
}

export interface RawPropEdge {
  readonly id: string;
  readonly start: Vec3;
  readonly end: Vec3;
  readonly role: BentCurveRole;
  readonly faceIndices: readonly number[];
}

export interface RawPropFace {
  readonly center: Vec3;
  readonly outwardNormal: Vec3;
}

export interface BuiltPropGeometry {
  readonly faces: readonly RawPropFace[];
  readonly edges: readonly RawPropEdge[];
  readonly label: string;
}

function buildBoxGeometry(
  prefix: string,
  center: Vec3,
  width: number,
  height: number,
  depth: number,
  floorDivisions: number,
): { readonly faces: readonly RawPropFace[]; readonly edges: readonly RawPropEdge[] } {
  const hx = width * 0.5;
  const hy = height * 0.5;
  const hz = depth * 0.5;
  const v: readonly Vec3[] = [
    { x: center.x - hx, y: center.y - hy, z: center.z - hz },
    { x: center.x + hx, y: center.y - hy, z: center.z - hz },
    { x: center.x + hx, y: center.y + hy, z: center.z - hz },
    { x: center.x - hx, y: center.y + hy, z: center.z - hz },
    { x: center.x - hx, y: center.y - hy, z: center.z + hz },
    { x: center.x + hx, y: center.y - hy, z: center.z + hz },
    { x: center.x + hx, y: center.y + hy, z: center.z + hz },
    { x: center.x - hx, y: center.y + hy, z: center.z + hz },
  ];
  const faces: readonly RawPropFace[] = [
    { center: { x: center.x, y: center.y, z: center.z - hz }, outwardNormal: { x: 0, y: 0, z: -1 } },
    { center: { x: center.x, y: center.y, z: center.z + hz }, outwardNormal: { x: 0, y: 0, z: 1 } },
    { center: { x: center.x - hx, y: center.y, z: center.z }, outwardNormal: { x: -1, y: 0, z: 0 } },
    { center: { x: center.x + hx, y: center.y, z: center.z }, outwardNormal: { x: 1, y: 0, z: 0 } },
    { center: { x: center.x, y: center.y - hy, z: center.z }, outwardNormal: { x: 0, y: -1, z: 0 } },
    { center: { x: center.x, y: center.y + hy, z: center.z }, outwardNormal: { x: 0, y: 1, z: 0 } },
  ];
  const edgeSpecs: ReadonlyArray<readonly [number, number, readonly number[]]> = [
    [0, 1, [0, 4]], [1, 2, [0, 3]], [2, 3, [0, 5]], [3, 0, [0, 2]],
    [4, 5, [1, 4]], [5, 6, [1, 3]], [6, 7, [1, 5]], [7, 4, [1, 2]],
    [0, 4, [2, 4]], [1, 5, [3, 4]], [2, 6, [3, 5]], [3, 7, [2, 5]],
  ];

  const edges: RawPropEdge[] = [];
  for (let i = 0; i < edgeSpecs.length; i += 1) {
    const spec = edgeSpecs[i];
    const start = spec ? v[spec[0]] : undefined;
    const end = spec ? v[spec[1]] : undefined;
    if (spec && start && end) {
      edges.push({ id: `${prefix}-e${i}`, start, end, role: "silhouette", faceIndices: spec[2] });
    }
  }

  const divs = Math.max(0, Math.min(12, Math.round(floorDivisions)));
  for (let f = 1; f < divs; f += 1) {
    const yL = center.y - hy + (height * f) / divs;
    const pNL: Vec3 = { x: center.x - hx, y: yL, z: center.z - hz };
    const pNR: Vec3 = { x: center.x + hx, y: yL, z: center.z - hz };
    const pFL: Vec3 = { x: center.x - hx, y: yL, z: center.z + hz };
    const pFR: Vec3 = { x: center.x + hx, y: yL, z: center.z + hz };
    edges.push(
      { id: `${prefix}-fl${f}-n`, start: pNL, end: pNR, role: "interior", faceIndices: [0] },
      { id: `${prefix}-fl${f}-r`, start: pNR, end: pFR, role: "interior", faceIndices: [3] },
      { id: `${prefix}-fl${f}-l`, start: pNL, end: pFL, role: "interior", faceIndices: [2] },
    );
  }
  return { faces, edges };
}

/**
 * 파라메트릭 3D 프롭 사양을 면/모서리 와이어프레임 기하로 전개한다.
 */
export function buildCurvilinearPropGeometry(prop: CurvilinearPropSpec): BuiltPropGeometry {
  if (prop.kind === "box-building") {
    const box = buildBoxGeometry(
      prop.id,
      prop.center,
      Math.max(0.2, prop.width),
      Math.max(0.2, prop.height),
      Math.max(0.2, prop.depth),
      prop.floorDivisions ?? 3,
    );
    return { ...box, label: prop.label ?? `건물 블록 (${prop.id})` };
  }

  if (prop.kind === "arch-doorway") {
    const w = Math.max(0.4, prop.width);
    const h = Math.max(0.6, prop.height);
    const d = Math.max(0.2, prop.depth);
    const radius = w * 0.5;
    const baseY = prop.center.y - h * 0.5;
    const springY = baseY + Math.max(0.2, h - radius);
    const zN = prop.center.z - d * 0.5;
    const zF = prop.center.z + d * 0.5;
    const segs = Math.max(6, Math.min(24, Math.round(prop.archSegments ?? 12)));
    const faces: RawPropFace[] = [
      { center: { x: prop.center.x, y: prop.center.y, z: zN }, outwardNormal: { x: 0, y: 0, z: -1 } },
      { center: { x: prop.center.x, y: prop.center.y, z: zF }, outwardNormal: { x: 0, y: 0, z: 1 } },
    ];
    const edges: RawPropEdge[] = [
      { id: `${prop.id}-jamb-ln`, start: { x: prop.center.x - radius, y: baseY, z: zN }, end: { x: prop.center.x - radius, y: springY, z: zN }, role: "silhouette", faceIndices: [0] },
      { id: `${prop.id}-jamb-rn`, start: { x: prop.center.x + radius, y: baseY, z: zN }, end: { x: prop.center.x + radius, y: springY, z: zN }, role: "silhouette", faceIndices: [0] },
      { id: `${prop.id}-jamb-lf`, start: { x: prop.center.x - radius, y: baseY, z: zF }, end: { x: prop.center.x - radius, y: springY, z: zF }, role: "silhouette", faceIndices: [1] },
      { id: `${prop.id}-jamb-rf`, start: { x: prop.center.x + radius, y: baseY, z: zF }, end: { x: prop.center.x + radius, y: springY, z: zF }, role: "silhouette", faceIndices: [1] },
      { id: `${prop.id}-base-l`, start: { x: prop.center.x - radius, y: baseY, z: zN }, end: { x: prop.center.x - radius, y: baseY, z: zF }, role: "interior", faceIndices: [0, 1] },
      { id: `${prop.id}-base-r`, start: { x: prop.center.x + radius, y: baseY, z: zN }, end: { x: prop.center.x + radius, y: baseY, z: zF }, role: "interior", faceIndices: [0, 1] },
    ];
    for (let i = 0; i < segs; i += 1) {
      const a0 = Math.PI - (i / segs) * Math.PI;
      const a1 = Math.PI - ((i + 1) / segs) * Math.PI;
      const p0N: Vec3 = { x: prop.center.x + Math.cos(a0) * radius, y: springY + Math.sin(a0) * radius, z: zN };
      const p1N: Vec3 = { x: prop.center.x + Math.cos(a1) * radius, y: springY + Math.sin(a1) * radius, z: zN };
      const p0F: Vec3 = { x: p0N.x, y: p0N.y, z: zF };
      const p1F: Vec3 = { x: p1N.x, y: p1N.y, z: zF };
      edges.push(
        { id: `${prop.id}-arch-n-${i}`, start: p0N, end: p1N, role: "arch", faceIndices: [0] },
        { id: `${prop.id}-arch-f-${i}`, start: p0F, end: p1F, role: "arch", faceIndices: [1] },
      );
      if (i % 3 === 0) edges.push({ id: `${prop.id}-arch-rib-${i}`, start: p0N, end: p0F, role: "interior", faceIndices: [0, 1] });
    }
    return { faces, edges, label: prop.label ?? `아치 출입구 (${prop.id})` };
  }

  if (prop.kind === "pillar-row") {
    const count = Math.max(1, Math.min(20, Math.round(prop.count)));
    const axis = prop.rowAxis ?? "z";
    const faces: RawPropFace[] = [];
    const edges: RawPropEdge[] = [];
    for (let idx = 0; idx < count; idx += 1) {
      const offset = idx * prop.spacing;
      const pillarCenter: Vec3 =
        axis === "z"
          ? { x: prop.start.x, y: prop.start.y, z: prop.start.z + offset }
          : { x: prop.start.x + offset, y: prop.start.y, z: prop.start.z };
      const faceBase = faces.length;
      const box = buildBoxGeometry(
        `${prop.id}-p${idx}`,
        pillarCenter,
        Math.max(0.15, prop.pillarWidth),
        Math.max(0.4, prop.pillarHeight),
        Math.max(0.15, prop.pillarWidth),
        0,
      );
      for (const f of box.faces) faces.push(f);
      for (const e of box.edges) edges.push({ ...e, faceIndices: e.faceIndices.map((fi) => fi + faceBase) });
    }
    return { faces, edges, label: prop.label ?? `열주 배열 (${prop.id})` };
  }

  // action-speedline-tunnel
  const rayCount = Math.max(4, Math.min(48, Math.round(prop.rayCount)));
  const ringCount = Math.max(1, Math.min(12, Math.round(prop.ringCount ?? 3)));
  const twist = prop.twistRad ?? 0;
  const nearZ = prop.center.z + prop.nearDepth;
  const farZ = prop.center.z + prop.farDepth;
  const radius = Math.max(0.3, prop.radius);
  const faces: RawPropFace[] = [{ center: { x: prop.center.x, y: prop.center.y, z: nearZ }, outwardNormal: { x: 0, y: 0, z: -1 } }];
  const edges: RawPropEdge[] = [];

  for (let i = 0; i < rayCount; i += 1) {
    const a0 = (i / rayCount) * Math.PI * 2;
    const a1 = a0 + twist;
    edges.push({
      id: `${prop.id}-ray-${i}`,
      start: { x: prop.center.x + Math.cos(a0) * radius, y: prop.center.y + Math.sin(a0) * radius, z: nearZ },
      end: { x: prop.center.x + Math.cos(a1) * radius, y: prop.center.y + Math.sin(a1) * radius, z: farZ },
      role: "speedline",
      faceIndices: [0],
    });
  }
  const ringSegs = 24;
  for (let r = 0; r < ringCount; r += 1) {
    const zRing = nearZ + (farZ - nearZ) * (ringCount === 1 ? 0.5 : r / (ringCount - 1));
    for (let s = 0; s < ringSegs; s += 1) {
      const a0 = (s / ringSegs) * Math.PI * 2;
      const a1 = ((s + 1) / ringSegs) * Math.PI * 2;
      edges.push({
        id: `${prop.id}-ring-${r}-${s}`,
        start: { x: prop.center.x + Math.cos(a0) * radius, y: prop.center.y + Math.sin(a0) * radius, z: zRing },
        end: { x: prop.center.x + Math.cos(a1) * radius, y: prop.center.y + Math.sin(a1) * radius, z: zRing },
        role: "ring",
        faceIndices: [0],
      });
    }
  }
  return { faces, edges, label: prop.label ?? `액션 집중선 터널 (${prop.id})` };
}
