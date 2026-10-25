import type { CharacterGeometryStrokeVector3 } from "./character-geometry-stroke";

/**
 * StudioHORANG SHAPER (v1.05, Assembly-CSharp.dll) 역공학 명세 기반
 * 무게중심(Barycentric) 3D 서피스 펜 라인 엔진:
 * - LineData (0x02000043) / AlignLinesByPartMesh
 * - LinePressureMode (fake, real, none)
 * - LineColorMode (baseLineColor, baseHairColor, baseSkinColor, unique)
 * - BaseMeshType (head, body, costume, all)
 * - SymmetryLineHelper (0x0200007b) & Step Point 직선/곡선 보간
 */

export const SHAPER_BARYCENTRIC_PEN_LINE_VERSION = 1 as const;

export type LinePressureMode = "fake" | "real" | "none";

export type LineColorMode =
  | "baseLineColor"
  | "baseHairColor"
  | "baseSkinColor"
  | "unique";

export type BaseMeshType = "head" | "body" | "costume" | "all";

export type PartMeshType = Exclude<BaseMeshType, "all">;

export type ShaperRgbaColor = readonly [number, number, number, number];

export interface ShaperThemeColorPalette {
  readonly baseLineColor: ShaperRgbaColor;
  readonly baseHairColor: ShaperRgbaColor;
  readonly baseSkinColor: ShaperRgbaColor;
}

export interface ShaperPartMeshGeometry {
  readonly partMeshId: string;
  readonly baseMeshType: PartMeshType;
  readonly vertices: readonly CharacterGeometryStrokeVector3[];
  readonly vertexNormals?: readonly CharacterGeometryStrokeVector3[];
  readonly mirroredVertexMap?: Readonly<Record<number, number>>;
}

export interface ShaperPenLinePoint {
  readonly pointId: string;
  readonly baseMeshType: PartMeshType;
  readonly partMeshId: string;
  readonly triangleIndex: number;
  readonly v0: number;
  readonly v1: number;
  readonly v2: number;
  readonly v0d: number;
  readonly v1d: number;
  readonly normalOffset: number;
  readonly worldPosition: CharacterGeometryStrokeVector3;
  readonly worldNormal: CharacterGeometryStrokeVector3;
  readonly pressure: number;
  readonly thickness: number;
  readonly isStepPoint: boolean;
}

export interface ShaperPenLineStroke {
  readonly lineId: string;
  readonly baseMeshType: BaseMeshType;
  readonly pressureMode: LinePressureMode;
  readonly colorMode: LineColorMode;
  readonly uniqueColor: ShaperRgbaColor;
  readonly baseThickness: number;
  readonly stepInterpolation: "linear" | "catmullRom";
  readonly symmetryPartnerId: string | null;
  readonly points: readonly ShaperPenLinePoint[];
}

export class ShaperBarycentricPenLineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ShaperBarycentricPenLineError";
  }
}

const EPSILON = 1e-7;
const DEFAULT_NORMAL_OFFSET = 0.0008;

export const DEFAULT_SHAPER_THEME_PALETTE: ShaperThemeColorPalette = {
  baseLineColor: [0.12, 0.1, 0.11, 1.0],
  baseHairColor: [0.22, 0.16, 0.14, 1.0],
  baseSkinColor: [0.58, 0.39, 0.34, 1.0],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function add3(
  a: CharacterGeometryStrokeVector3,
  b: CharacterGeometryStrokeVector3,
): CharacterGeometryStrokeVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub3(
  a: CharacterGeometryStrokeVector3,
  b: CharacterGeometryStrokeVector3,
): CharacterGeometryStrokeVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(
  v: CharacterGeometryStrokeVector3,
  scalar: number,
): CharacterGeometryStrokeVector3 {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

function cross3(
  a: CharacterGeometryStrokeVector3,
  b: CharacterGeometryStrokeVector3,
): CharacterGeometryStrokeVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(
  v: CharacterGeometryStrokeVector3,
  fallback: CharacterGeometryStrokeVector3 = [0, 1, 0],
): CharacterGeometryStrokeVector3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > EPSILON ? [v[0] / len, v[1] / len, v[2] / len] : fallback;
}

function clampBarycentric(v0dInput: number, v1dInput: number): readonly [number, number] {
  if (!Number.isFinite(v0dInput) || !Number.isFinite(v1dInput)) {
    throw new ShaperBarycentricPenLineError(
      "INVALID_BARYCENTRIC",
      "Barycentric weights v0d and v1d must be finite numbers.",
    );
  }
  let v0d = clamp(v0dInput, 0, 1);
  let v1d = clamp(v1dInput, 0, 1);
  const sum = v0d + v1d;
  if (sum > 1) {
    v0d /= sum;
    v1d /= sum;
  }
  return [v0d, v1d];
}

/**
 * Shaper `LinePressureMode`(`fake`, `real`, `none`)에 따른 포인트 두께를 계산한다.
 */
export function computePenLinePointThickness(params: {
  readonly baseThickness: number;
  readonly pressureMode: LinePressureMode;
  readonly pointIndex: number;
  readonly totalPoints: number;
  readonly rawPressure: number;
  readonly minPressureRatio?: number;
}): number {
  const {
    baseThickness,
    pressureMode,
    pointIndex,
    totalPoints,
    rawPressure,
  } = params;
  if (!Number.isFinite(baseThickness) || baseThickness <= 0) {
    throw new ShaperBarycentricPenLineError(
      "INVALID_BASE_THICKNESS",
      "baseThickness must be a positive finite number.",
    );
  }

  const minRatio = clamp(params.minPressureRatio ?? 0.18, 0.02, 1.0);

  if (pressureMode === "none") {
    return baseThickness;
  }

  if (pressureMode === "real") {
    const p = clamp(Number.isFinite(rawPressure) ? rawPressure : 1, 0, 1);
    const factor = minRatio + (1 - minRatio) * p;
    return Number((baseThickness * factor).toFixed(6));
  }

  // pressureMode === "fake": 스트로크 양 끝 자동 테이퍼링 곡선 (sin(pi * t))
  if (totalPoints <= 1) {
    return baseThickness;
  }
  const t = clamp(pointIndex / (totalPoints - 1), 0, 1);
  const envelope = Math.sin(Math.PI * t);
  const factor = minRatio + (1 - minRatio) * envelope;
  return Number((baseThickness * factor).toFixed(6));
}

/**
 * Shaper `LineColorMode`(`baseLineColor`, `baseHairColor`, `baseSkinColor`, `unique`)에 따른 최종 RGBA 색상을 해석한다.
 */
export function resolvePenLineColor(
  stroke: Pick<ShaperPenLineStroke, "colorMode" | "uniqueColor">,
  palette: ShaperThemeColorPalette = DEFAULT_SHAPER_THEME_PALETTE,
): ShaperRgbaColor {
  const normalizeColor = (c: ShaperRgbaColor): ShaperRgbaColor => [
    clamp(c[0], 0, 1),
    clamp(c[1], 0, 1),
    clamp(c[2], 0, 1),
    clamp(c[3], 0, 1),
  ];

  switch (stroke.colorMode) {
    case "baseLineColor":
      return normalizeColor(palette.baseLineColor);
    case "baseHairColor":
      return normalizeColor(palette.baseHairColor);
    case "baseSkinColor":
      return normalizeColor(palette.baseSkinColor);
    case "unique":
      return normalizeColor(stroke.uniqueColor);
  }
}

/**
 * RGBA(`[0..1]`) 색상을 `#rrggbbaa` 16진수 문자열로 변환한다.
 */
export function shaperRgbaToHex(color: ShaperRgbaColor): string {
  const toHex = (channel: number) =>
    Math.round(clamp(channel, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color[0])}${toHex(color[1])}${toHex(color[2])}${toHex(color[3])}`;
}

/**
 * 단일 `ShaperPenLinePoint`를 대상 파츠 메쉬의 현재 정점 배열 위로 재투영한다.
 */
export function projectPenLinePointOnMesh(
  point: ShaperPenLinePoint,
  mesh: ShaperPartMeshGeometry,
): ShaperPenLinePoint {
  const p0 = mesh.vertices[point.v0];
  const p1 = mesh.vertices[point.v1];
  const p2 = mesh.vertices[point.v2];
  if (!p0 || !p1 || !p2) {
    throw new ShaperBarycentricPenLineError(
      "VERTEX_INDEX_OUT_OF_RANGE",
      `Triangle vertices (${point.v0}, ${point.v1}, ${point.v2}) out of range for mesh ${mesh.partMeshId}.`,
    );
  }

  const [v0d, v1d] = clampBarycentric(point.v0d, point.v1d);
  const w0 = Math.max(0, 1 - v0d - v1d);

  const surfacePos: CharacterGeometryStrokeVector3 = [
    p0[0] * w0 + p1[0] * v0d + p2[0] * v1d,
    p0[1] * w0 + p1[1] * v0d + p2[1] * v1d,
    p0[2] * w0 + p1[2] * v0d + p2[2] * v1d,
  ];

  let worldNormal: CharacterGeometryStrokeVector3;
  const n0 = mesh.vertexNormals?.[point.v0];
  const n1 = mesh.vertexNormals?.[point.v1];
  const n2 = mesh.vertexNormals?.[point.v2];
  if (n0 && n1 && n2) {
    worldNormal = normalize3([
      n0[0] * w0 + n1[0] * v0d + n2[0] * v1d,
      n0[1] * w0 + n1[1] * v0d + n2[1] * v1d,
      n0[2] * w0 + n1[2] * v0d + n2[2] * v1d,
    ]);
  } else {
    const edge1 = sub3(p1, p0);
    const edge2 = sub3(p2, p0);
    worldNormal = normalize3(cross3(edge1, edge2), point.worldNormal);
  }

  const normalOffset = Number.isFinite(point.normalOffset)
    ? point.normalOffset
    : DEFAULT_NORMAL_OFFSET;
  const worldPosition = add3(surfacePos, scale3(worldNormal, normalOffset));

  return {
    ...point,
    v0d,
    v1d,
    normalOffset,
    worldPosition,
    worldNormal,
  };
}

/**
 * Shaper `AlignLinesByPartMesh` 구현:
 * 헤드·바디·의상 파츠 모프나 서브디비전으로 정점 위치가 변했을 때,
 * 바인딩된 삼각형(`v0, v1, v2`)과 무게중심 계수(`v0d, v1d`)로 모든 3D 펜 라인을 표면에 재정렬한다.
 */
export function alignPenLinesByPartMesh(
  strokes: readonly ShaperPenLineStroke[],
  meshesById: Readonly<Record<string, ShaperPartMeshGeometry>>,
  filterMeshType: BaseMeshType = "all",
): readonly ShaperPenLineStroke[] {
  return strokes.map((stroke) => {
    if (
      filterMeshType !== "all"
      && stroke.baseMeshType !== "all"
      && stroke.baseMeshType !== filterMeshType
    ) {
      return stroke;
    }

    const totalPoints = stroke.points.length;
    const alignedPoints = stroke.points.map((point, index) => {
      const thickness = computePenLinePointThickness({
        baseThickness: stroke.baseThickness,
        pressureMode: stroke.pressureMode,
        pointIndex: index,
        totalPoints,
        rawPressure: point.pressure,
      });

      if (filterMeshType !== "all" && point.baseMeshType !== filterMeshType) {
        return { ...point, thickness };
      }

      const mesh = meshesById[point.partMeshId];
      if (!mesh) {
        return { ...point, thickness };
      }

      const projected = projectPenLinePointOnMesh(point, mesh);
      return {
        ...projected,
        thickness,
      };
    });

    return {
      ...stroke,
      points: alignedPoints,
    };
  });
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5
    * (2 * p1
      + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function catmullRomVec3(
  p0: CharacterGeometryStrokeVector3,
  p1: CharacterGeometryStrokeVector3,
  p2: CharacterGeometryStrokeVector3,
  p3: CharacterGeometryStrokeVector3,
  t: number,
): CharacterGeometryStrokeVector3 {
  return [
    catmullRomScalar(p0[0], p1[0], p2[0], p3[0], t),
    catmullRomScalar(p0[1], p1[1], p2[1], p3[1], t),
    catmullRomScalar(p0[2], p1[2], p2[2], p3[2], t),
  ];
}

/**
 * 스텝 포인트(`isStepPoint: true`) 기반 직선(`linear`) 또는 곡선(`catmullRom`) 보간으로
 * 펜 스트로크 포인트 시퀀스를 촘촘하게 생성하고 두께를 재계산한다.
 */
export function interpolateStepPointPenLine(
  stroke: ShaperPenLineStroke,
  subdivisionsPerSpan = 4,
): ShaperPenLineStroke {
  if (!Number.isInteger(subdivisionsPerSpan) || subdivisionsPerSpan < 1 || subdivisionsPerSpan > 32) {
    throw new ShaperBarycentricPenLineError(
      "INVALID_SUBDIVISIONS",
      "subdivisionsPerSpan must be an integer between 1 and 32.",
    );
  }

  const keyPoints = stroke.points.filter((p) => p.isStepPoint);
  const anchors = keyPoints.length >= 2 ? keyPoints : stroke.points;
  if (anchors.length < 2 || subdivisionsPerSpan === 1) {
    const total = stroke.points.length;
    return {
      ...stroke,
      points: stroke.points.map((pt, idx) => ({
        ...pt,
        thickness: computePenLinePointThickness({
          baseThickness: stroke.baseThickness,
          pressureMode: stroke.pressureMode,
          pointIndex: idx,
          totalPoints: total,
          rawPressure: pt.pressure,
        }),
      })),
    };
  }

  const rawInterpolated: ShaperPenLinePoint[] = [];

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const p0 = anchors[Math.max(0, i - 1)]!;
    const p1 = anchors[i]!;
    const p2 = anchors[i + 1]!;
    const p3 = anchors[Math.min(anchors.length - 1, i + 2)]!;

    const steps = i === anchors.length - 2 ? subdivisionsPerSpan : subdivisionsPerSpan;
    for (let step = 0; step < steps; step += 1) {
      const t = step / subdivisionsPerSpan;
      const isAnchor = step === 0;
      const sameTriangle =
        p1.partMeshId === p2.partMeshId && p1.triangleIndex === p2.triangleIndex;

      const [v0d, v1d] = sameTriangle
        ? clampBarycentric(
            p1.v0d + (p2.v0d - p1.v0d) * t,
            p1.v1d + (p2.v1d - p1.v1d) * t,
          )
        : [p1.v0d, p1.v1d];

      const worldPosition: CharacterGeometryStrokeVector3 =
        stroke.stepInterpolation === "catmullRom"
          ? catmullRomVec3(
              p0.worldPosition,
              p1.worldPosition,
              p2.worldPosition,
              p3.worldPosition,
              t,
            )
          : [
              p1.worldPosition[0] + (p2.worldPosition[0] - p1.worldPosition[0]) * t,
              p1.worldPosition[1] + (p2.worldPosition[1] - p1.worldPosition[1]) * t,
              p1.worldPosition[2] + (p2.worldPosition[2] - p1.worldPosition[2]) * t,
            ];

      const worldNormal = normalize3([
        p1.worldNormal[0] + (p2.worldNormal[0] - p1.worldNormal[0]) * t,
        p1.worldNormal[1] + (p2.worldNormal[1] - p1.worldNormal[1]) * t,
        p1.worldNormal[2] + (p2.worldNormal[2] - p1.worldNormal[2]) * t,
      ]);

      const pressure = clamp(p1.pressure + (p2.pressure - p1.pressure) * t, 0, 1);

      rawInterpolated.push({
        ...p1,
        pointId: isAnchor ? p1.pointId : `${p1.pointId}_sub_${step}`,
        v0d,
        v1d,
        worldPosition,
        worldNormal,
        pressure,
        isStepPoint: isAnchor,
      });
    }
  }

  const lastAnchor = anchors[anchors.length - 1]!;
  rawInterpolated.push({
    ...lastAnchor,
    isStepPoint: true,
  });

  const totalPoints = rawInterpolated.length;
  const finalizedPoints = rawInterpolated.map((pt, index) => ({
    ...pt,
    thickness: computePenLinePointThickness({
      baseThickness: stroke.baseThickness,
      pressureMode: stroke.pressureMode,
      pointIndex: index,
      totalPoints,
      rawPressure: pt.pressure,
    }),
  }));

  return {
    ...stroke,
    points: finalizedPoints,
  };
}

function mirrorVecX(v: CharacterGeometryStrokeVector3): CharacterGeometryStrokeVector3 {
  return [v[0] === 0 ? 0 : -v[0], v[1], v[2]];
}

/**
 * `SymmetryLineHelper` (`0x0200007b`) 명세:
 * X=0 대칭 평면을 기준으로 3D 서피스 펜 스트로크와 무게중심 바인딩을 미러링한다.
 */
export function mirrorPenLineStroke(
  stroke: ShaperPenLineStroke,
  options: {
    readonly mirroredLineId: string;
    readonly meshesById?: Readonly<Record<string, ShaperPartMeshGeometry>>;
  },
): ShaperPenLineStroke {
  if (!options.mirroredLineId.trim()) {
    throw new ShaperBarycentricPenLineError(
      "INVALID_MIRRORED_LINE_ID",
      "mirroredLineId must be a non-empty string.",
    );
  }

  const totalPoints = stroke.points.length;
  const mirroredPoints: ShaperPenLinePoint[] = stroke.points.map((pt, index) => {
    const mesh = options.meshesById?.[pt.partMeshId];
    const vMap = mesh?.mirroredVertexMap;
    // 미러링 시 삼각형 와인딩 반전을 보존하기 위해 v1 <-> v2 및 v0d <-> v1d 스왑
    const mirroredV0 = vMap?.[pt.v0] ?? pt.v0;
    const mirroredV1 = vMap?.[pt.v2] ?? pt.v2;
    const mirroredV2 = vMap?.[pt.v1] ?? pt.v1;
    const [mirroredV0d, mirroredV1d] = clampBarycentric(pt.v1d, pt.v0d);

    const candidatePoint: ShaperPenLinePoint = {
      ...pt,
      pointId: `${options.mirroredLineId}_pt_${index}`,
      v0: mirroredV0,
      v1: mirroredV1,
      v2: mirroredV2,
      v0d: mirroredV0d,
      v1d: mirroredV1d,
      worldPosition: mirrorVecX(pt.worldPosition),
      worldNormal: normalize3(mirrorVecX(pt.worldNormal)),
      thickness: computePenLinePointThickness({
        baseThickness: stroke.baseThickness,
        pressureMode: stroke.pressureMode,
        pointIndex: index,
        totalPoints,
        rawPressure: pt.pressure,
      }),
    };

    if (mesh && vMap) {
      return projectPenLinePointOnMesh(candidatePoint, mesh);
    }
    return candidatePoint;
  });

  return {
    ...stroke,
    lineId: options.mirroredLineId,
    symmetryPartnerId: stroke.lineId,
    points: mirroredPoints,
  };
}
