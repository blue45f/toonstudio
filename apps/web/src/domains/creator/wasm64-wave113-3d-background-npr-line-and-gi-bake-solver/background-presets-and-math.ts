/**
 * Wave 113 — 3D 배경 메쉬 공용 수학·타입 계약 및 파라메트릭 웹툰 배경 프리셋 3종
 * (`korean-classroom`, `seoul-alley`, `cafe-interior`).
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type RgbLinear = readonly [number, number, number];

export type BackgroundPresetId = "korean-classroom" | "seoul-alley" | "cafe-interior";

export type NprEdgeClass =
  | "silhouette-boundary"
  | "hard-crease"
  | "material-seam"
  | "smooth-interior";

export type VisibleNprEdgeClass = Exclude<NprEdgeClass, "smooth-interior">;

export interface BackgroundFaceInput {
  readonly id?: string;
  /** 외측(또는 실내 가시면)에서 볼 때 반시계(CCW) 순서의 정점 인덱스(삼각형 또는 볼록 다각형). */
  readonly vertexIndices: readonly number[];
  readonly materialId: string;
  readonly albedoRgb: RgbLinear;
  readonly surfaceTag?: string;
}

export interface PinholeCamera3d {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up?: Vec3;
  readonly fovYDeg: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly nearPlaneMeters?: number;
  readonly farPlaneMeters?: number;
}

export interface BackgroundMesh3d {
  readonly id: string;
  readonly labelKo: string;
  readonly presetId?: BackgroundPresetId;
  readonly vertices: readonly Vec3[];
  readonly faces: readonly BackgroundFaceInput[];
  readonly defaultCamera?: PinholeCamera3d;
  readonly recommendedCharacterDepthMeters?: number;
}

export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length3(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function normalize3(a: Vec3, fallback: Vec3 = [0, 0, -1]): Vec3 {
  const len = length3(a);
  if (!Number.isFinite(len) || len <= 1e-9) return fallback;
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function sanitizeRgb(rgb: RgbLinear, maxVal: number = 1): RgbLinear {
  return [clamp(rgb[0], 0, maxVal), clamp(rgb[1], 0, maxVal), clamp(rgb[2], 0, maxVal)];
}

interface MutableMeshBuilder {
  readonly vertices: Vec3[];
  readonly faces: BackgroundFaceInput[];
}

function appendQuad(
  builder: MutableMeshBuilder,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
  v3: Vec3,
  materialId: string,
  albedoRgb: RgbLinear,
  surfaceTag?: string,
): void {
  const base = builder.vertices.length;
  builder.vertices.push(v0, v1, v2, v3);
  builder.faces.push({
    vertexIndices: [base, base + 1, base + 2, base + 3],
    materialId,
    albedoRgb,
    surfaceTag: surfaceTag ?? materialId,
  });
}

/** 외측 법선이 바깥쪽을 향하는 닫힌 직육면체 솔리드(6면 12삼각형)를 추가한다. */
function appendSolidBox(
  builder: MutableMeshBuilder,
  minPt: Vec3,
  maxPt: Vec3,
  materialId: string,
  albedoRgb: RgbLinear,
  surfaceTag?: string,
): void {
  const [x0, y0, z0] = minPt;
  const [x1, y1, z1] = maxPt;
  appendQuad(builder, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], materialId, albedoRgb, surfaceTag);
  appendQuad(builder, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], materialId, albedoRgb, surfaceTag);
  appendQuad(builder, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], materialId, albedoRgb, surfaceTag);
  appendQuad(builder, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], materialId, albedoRgb, surfaceTag);
  appendQuad(builder, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], materialId, albedoRgb, surfaceTag);
  appendQuad(builder, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], materialId, albedoRgb, surfaceTag);
}

/** 한국 웹툰 3D 배경 프리셋 메쉬(`korean-classroom`, `seoul-alley`, `cafe-interior`)를 생성한다. */
export function createParametricBackgroundPreset(presetId: BackgroundPresetId): BackgroundMesh3d {
  const builder: MutableMeshBuilder = { vertices: [], faces: [] };

  if (presetId === "korean-classroom") {
    const floorRgb: RgbLinear = [0.85, 0.42, 0.18];
    const wallRgb: RgbLinear = [0.92, 0.92, 0.90];
    const ceilingRgb: RgbLinear = [0.94, 0.94, 0.93];
    const boardRgb: RgbLinear = [0.16, 0.30, 0.22];
    const deskRgb: RgbLinear = [0.76, 0.48, 0.24];
    const wainscotRgb: RgbLinear = [0.80, 0.78, 0.72];

    appendQuad(builder, [-3.4, 0, 1.5], [3.4, 0, 1.5], [3.4, 0, -2.0], [-3.4, 0, -2.0], "oak-floor", floorRgb, "floor");
    appendQuad(builder, [-3.4, 0, -2.0], [3.4, 0, -2.0], [3.4, 0, -5.2], [-3.4, 0, -5.2], "oak-floor", floorRgb, "floor");
    appendQuad(builder, [-3.4, 0, -5.2], [3.4, 0, -5.2], [3.4, 1.15, -5.2], [-3.4, 1.15, -5.2], "lower-wall-plaster", wallRgb, "back-wall");
    appendQuad(builder, [-3.4, 1.15, -5.2], [3.4, 1.15, -5.2], [3.4, 3.1, -5.2], [-3.4, 3.1, -5.2], "upper-wall-plaster", wallRgb, "back-wall");
    appendQuad(builder, [-3.4, 0, 1.5], [-3.4, 0, -5.2], [-3.4, 3.1, -5.2], [-3.4, 3.1, 1.5], "window-wall", wallRgb, "side-wall");
    appendQuad(builder, [3.4, 0, -5.2], [3.4, 0, 1.5], [3.4, 3.1, 1.5], [3.4, 3.1, -5.2], "corridor-wall", wainscotRgb, "side-wall");
    appendQuad(builder, [-3.4, 3.1, -5.2], [3.4, 3.1, -5.2], [3.4, 3.1, 1.5], [-3.4, 3.1, 1.5], "ceiling-tile", ceilingRgb, "ceiling");
    appendSolidBox(builder, [-1.9, 1.05, -5.16], [1.9, 2.35, -5.08], "chalkboard-slate", boardRgb, "chalkboard");
    appendSolidBox(builder, [-0.55, 0, -4.1], [0.55, 1.02, -3.55], "teacher-podium", deskRgb, "podium");
    appendSolidBox(builder, [-1.95, 0, -0.35], [-0.85, 0.74, 0.25], "student-desk", deskRgb, "desk");
    appendSolidBox(builder, [0.55, 0, -0.45], [1.65, 0.74, 0.15], "student-desk", deskRgb, "desk");
    appendSolidBox(builder, [-1.95, 0, -2.25], [-0.85, 0.74, -1.65], "student-desk", deskRgb, "desk");
    appendSolidBox(builder, [0.55, 0, -2.35], [1.65, 0.74, -1.75], "student-desk", deskRgb, "desk");

    return {
      id: "preset-korean-classroom",
      labelKo: "한국 고등학교 교실",
      presetId,
      vertices: builder.vertices,
      faces: builder.faces,
      defaultCamera: { eye: [-0.25, 1.58, 2.35], target: [0.05, 1.18, -4.8], fovYDeg: 54, widthPx: 960, heightPx: 540 },
      recommendedCharacterDepthMeters: 3.1,
    };
  }

  if (presetId === "seoul-alley") {
    const asphaltRgb: RgbLinear = [0.34, 0.35, 0.38];
    const brickRgb: RgbLinear = [0.80, 0.36, 0.22];
    const stuccoRgb: RgbLinear = [0.92, 0.91, 0.89];
    const poleRgb: RgbLinear = [0.52, 0.54, 0.56];
    const crateRgb: RgbLinear = [0.76, 0.52, 0.26];

    appendQuad(builder, [-2.4, 0, 2.5], [2.4, 0, 2.5], [2.4, 0, -10.5], [-2.4, 0, -10.5], "asphalt-road", asphaltRgb, "floor");
    appendQuad(builder, [-3.3, 0, 2.5], [-2.4, 0, 2.5], [-2.4, 0, -10.5], [-3.3, 0, -10.5], "curb-concrete", [0.74, 0.70, 0.65], "sidewalk");
    appendQuad(builder, [2.4, 0, 2.5], [3.3, 0, 2.5], [3.3, 0, -10.5], [2.4, 0, -10.5], "curb-concrete", [0.74, 0.70, 0.65], "sidewalk");
    appendSolidBox(builder, [-5.6, 0, -9.8], [-3.2, 4.8, 1.2], "red-brick-villa", brickRgb, "left-building");
    appendQuad(builder, [3.2, 0, -9.8], [3.2, 0, 1.2], [3.2, 4.6, 1.2], [3.2, 4.6, -9.8], "cream-stucco", stuccoRgb, "right-wall");
    appendQuad(builder, [-3.4, 0, -10.5], [3.4, 0, -10.5], [3.4, 3.8, -10.5], [-3.4, 3.8, -10.5], "alley-end-wall", stuccoRgb, "back-wall");
    appendSolidBox(builder, [-1.55, 0, -0.45], [-1.20, 4.4, -0.10], "utility-pole", poleRgb, "pillar");
    appendSolidBox(builder, [1.25, 0, -1.2], [2.15, 0.92, -0.35], "delivery-crate", crateRgb, "prop");
    appendSolidBox(builder, [-2.8, 2.35, -3.8], [-1.95, 2.52, -1.8], "shop-awning", [0.22, 0.42, 0.62], "awning");

    return {
      id: "preset-seoul-alley",
      labelKo: "서울 주택가 골목길",
      presetId,
      vertices: builder.vertices,
      faces: builder.faces,
      defaultCamera: { eye: [0.15, 1.62, 2.8], target: [-0.1, 1.45, -9.5], fovYDeg: 52, widthPx: 960, heightPx: 540 },
      recommendedCharacterDepthMeters: 4.1,
    };
  }

  const tileFloorRgb: RgbLinear = [0.83, 0.44, 0.21];
  const limeWallRgb: RgbLinear = [0.93, 0.92, 0.90];
  const counterRgb: RgbLinear = [0.64, 0.40, 0.22];
  const menuRgb: RgbLinear = [0.22, 0.24, 0.27];
  const tableRgb: RgbLinear = [0.74, 0.54, 0.34];

  appendQuad(builder, [-3.2, 0, 2.0], [3.2, 0, 2.0], [3.2, 0, -5.0], [-3.2, 0, -5.0], "terracotta-floor", tileFloorRgb, "floor");
  appendQuad(builder, [-3.2, 0, -5.0], [3.2, 0, -5.0], [3.2, 1.25, -5.0], [-3.2, 1.25, -5.0], "limewash-lower", limeWallRgb, "back-wall");
  appendQuad(builder, [-3.2, 1.25, -5.0], [3.2, 1.25, -5.0], [3.2, 3.2, -5.0], [-3.2, 3.2, -5.0], "limewash-upper", limeWallRgb, "back-wall");
  appendQuad(builder, [-3.2, 0, 2.0], [-3.2, 0, -5.0], [-3.2, 3.2, -5.0], [-3.2, 3.2, 2.0], "cafe-side-wall", limeWallRgb, "side-wall");
  appendQuad(builder, [3.2, 0, -5.0], [3.2, 0, 2.0], [3.2, 3.2, 2.0], [3.2, 3.2, -5.0], "cafe-side-wall", [0.88, 0.85, 0.80], "side-wall");
  appendQuad(builder, [-3.2, 3.2, -5.0], [3.2, 3.2, -5.0], [3.2, 3.2, 2.0], [-3.2, 3.2, 2.0], "cafe-ceiling", [0.94, 0.93, 0.91], "ceiling");
  appendSolidBox(builder, [-1.8, 0, -3.2], [1.85, 1.05, -2.35], "espresso-counter", counterRgb, "counter");
  appendSolidBox(builder, [-1.45, 1.65, -4.96], [1.45, 2.55, -4.88], "menu-board", menuRgb, "menu-board");
  appendSolidBox(builder, [-1.65, 0, -0.35], [-0.55, 0.74, 0.55], "cafe-table", tableRgb, "table");
  appendSolidBox(builder, [0.85, 0, -0.85], [1.95, 0.74, 0.05], "cafe-table", tableRgb, "table");

  return {
    id: "preset-cafe-interior",
    labelKo: "성수동 로스터리 카페 내부",
    presetId,
    vertices: builder.vertices,
    faces: builder.faces,
    defaultCamera: { eye: [0.08, 1.56, 2.45], target: [0, 1.15, -4.6], fovYDeg: 52, widthPx: 960, heightPx: 540 },
    recommendedCharacterDepthMeters: 3.4,
  };
}
