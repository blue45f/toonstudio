/**
 * Wave 81 — 비파괴 만화 선화 SVG 익스포터 및 결정적 미터 glTF 호환 메쉬 매니페스트 생성기.
 *
 * - `renderReprojectedSceneInkSvg`: 4개 분리 `<g>` 레이어(`horizon-guides`, `architecture-shell`,
 *   `foreground-props`, `ink-silhouette`)로 웹툰 오버레이용 비파괴 선화 SVG를 출력한다.
 * - `exportParametricSceneMeshManifest`: 미터 단위(`1.0 = 1m`, 오른손 Y-Up, 바닥 `Y = 0`),
 *   수밀 매니폴드 쿼드/삼각형 토폴로지, 비퇴화 UV, 절제된 PBR 재질 슬롯을 검증한 glTF 호환 JSON을 생성한다.
 */

import {
  computeBoxWorldGeometry,
  type ProjectedInkSegment2d,
  type ReprojectedSceneResult,
} from "./multicam-ink-dna-reprojector";
import type {
  ArchitecturalPlane3d,
  ParametricBoxProp3d,
  ParametricScene3d,
  Vec2,
  Vec3,
} from "./perspective-vanishing-point-lifter";

export interface SceneInkSvgExportOptions {
  readonly includeHorizonGuides?: boolean;
  readonly precision?: number;
  readonly guideOpacity?: number;
  readonly textureOpacity?: number;
}

export interface RenderedSceneInkSvg {
  readonly svg: string;
  readonly viewBox: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly layerSegmentCounts: {
    readonly horizonGuides: number;
    readonly architectureShell: number;
    readonly foregroundProps: number;
    readonly inkSilhouette: number;
  };
  readonly totalPaths: number;
}

export interface GltfMaterialSlotDescriptor {
  readonly id: string;
  readonly labelKo: string;
  readonly baseColorLinearRgb: readonly [number, number, number];
  readonly metallicFactor: 0 | 1;
  readonly roughnessFactor: number;
  readonly doubleSided: boolean;
}

export interface GltfCompatibleMeshNode {
  readonly id: string;
  readonly label: string;
  readonly kind: "enclosure-plane" | "parametric-prop";
  readonly materialSlotId: string;
  readonly vertexCount: number;
  readonly quadCount: number;
  readonly triangleCount: number;
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly uvs: readonly number[];
  readonly indices: readonly number[];
  readonly boundingBoxMeters: { readonly min: Vec3; readonly max: Vec3 };
  readonly isWatertightManifold: boolean;
  readonly nonManifoldEdgeCount: number;
  readonly openBoundaryEdgeCount: number;
  readonly eulerCharacteristic: number;
}

export interface ParametricSceneMeshManifestAudit {
  readonly units: "meters";
  readonly upAxis: "Y";
  readonly floorPlaneY: 0;
  readonly allStandingPropsGroundedAtZero: boolean;
  readonly allStackedPropsFlush: boolean;
  readonly allPropMeshesWatertightManifold: boolean;
  readonly hasNonFiniteVertex: boolean;
  readonly maxGroundingErrorMeters: number;
  readonly totalVertexCount: number;
  readonly totalQuadCount: number;
  readonly totalTriangleCount: number;
}

export interface ParametricSceneMeshManifest {
  readonly schemaVersion: "toonstudio.wave81.gltf-mesh-manifest.v1";
  readonly sceneId: string;
  readonly archetype: ParametricScene3d["archetype"];
  readonly units: "meters";
  readonly coordinateSystem: "right-handed-y-up-gltf";
  readonly camera: {
    readonly positionMeters: Vec3;
    readonly yawDeg: number;
    readonly pitchDeg: number;
    readonly rollDeg: number;
    readonly focalLengthMm: number;
    readonly verticalFovDeg: number;
  };
  readonly materialSlots: readonly GltfMaterialSlotDescriptor[];
  readonly nodes: readonly GltfCompatibleMeshNode[];
  readonly sceneBoundsMeters: { readonly min: Vec3; readonly max: Vec3 };
  readonly audit: ParametricSceneMeshManifestAudit;
}

const DEFAULT_MATERIAL_SLOTS: readonly GltfMaterialSlotDescriptor[] = [
  { id: "matte-plaster-wall", labelKo: "무광 회반죽 벽면", baseColorLinearRgb: [0.84, 0.82, 0.78], metallicFactor: 0, roughnessFactor: 0.88, doubleSided: true },
  { id: "warm-floor-timber", labelKo: "우드·노면 바닥재", baseColorLinearRgb: [0.58, 0.49, 0.39], metallicFactor: 0, roughnessFactor: 0.72, doubleSided: false },
  { id: "furniture-oak-fabric", labelKo: "목재·패브릭 가구", baseColorLinearRgb: [0.46, 0.36, 0.27], metallicFactor: 0, roughnessFactor: 0.64, doubleSided: false },
  { id: "architectural-metal-trim", labelKo: "건축 브러시드 금속 프레임", baseColorLinearRgb: [0.32, 0.34, 0.36], metallicFactor: 1, roughnessFactor: 0.36, doubleSided: false },
];

const BOX_TRIANGLE_INDICES: readonly number[] = [
  0, 1, 5, 0, 5, 4,
  2, 3, 7, 2, 7, 6,
  1, 2, 6, 1, 6, 5,
  3, 0, 4, 3, 4, 7,
  4, 5, 6, 4, 6, 7,
  3, 2, 1, 3, 1, 0,
];

function formatFiniteNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`유한하지 않은 SVG 수치 발견: ${String(value)}`);
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

const escapeXmlAttr = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildPolylinePathData(points: readonly Vec2[], precision: number): string {
  return points
    .map((pt, i) => `${i === 0 ? "M" : "L"}${formatFiniteNumber(pt.x, precision)} ${formatFiniteNumber(pt.y, precision)}`)
    .join(" ");
}

function renderSegmentPathXml(segment: ProjectedInkSegment2d, precision: number, opacity: number): string {
  const d = buildPolylinePathData(segment.polylinePx, precision);
  const width = formatFiniteNumber(segment.strokeWidthPx, precision);
  const opAttr = opacity < 0.999 ? ` stroke-opacity="${formatFiniteNumber(opacity, 2)}"` : "";
  return `    <path id="${escapeXmlAttr(segment.id)}" data-entity="${escapeXmlAttr(segment.sourceEntityId)}" data-role="${segment.edgeRole}" d="${d}" stroke-width="${width}"${opAttr} />`;
}

/** 재투영된 2D 선화 결과를 4개 분리 `<g>` 레이어의 비파괴 만화 오버레이 SVG로 렌더링한다. */
export function renderReprojectedSceneInkSvg(
  reprojection: ReprojectedSceneResult,
  options: SceneInkSvgExportOptions = {},
): RenderedSceneInkSvg {
  const precision = Math.max(0, Math.min(4, Math.trunc(options.precision ?? 2)));
  const includeHorizonGuides = options.includeHorizonGuides ?? true;
  const guideOpacity = Math.max(0.08, Math.min(0.9, options.guideOpacity ?? 0.34));
  const textureOpacity = Math.max(0.15, Math.min(1, options.textureOpacity ?? 0.62));
  const [w, h] = [reprojection.camera.viewportWidthPx, reprojection.camera.viewportHeightPx];
  const viewBox = `0 0 ${formatFiniteNumber(w, precision)} ${formatFiniteNumber(h, precision)}`;

  const guideLines: string[] = [];
  const archLines: string[] = [];
  const propLines: string[] = [];
  const silhouetteLines: string[] = [];

  if (includeHorizonGuides) {
    const hl = reprojection.perspectiveGuides.horizonLine;
    guideLines.push(
      `    <line id="eye-level-horizon" x1="${formatFiniteNumber(hl.startPx.x, precision)}" y1="${formatFiniteNumber(hl.startPx.y, precision)}" x2="${formatFiniteNumber(hl.endPx.x, precision)}" y2="${formatFiniteNumber(hl.endPx.y, precision)}" stroke-width="1" stroke-dasharray="8 5" />`,
    );
    reprojection.perspectiveGuides.convergenceRays.forEach((ray, i) => {
      guideLines.push(
        `    <line id="vp-ray-${ray.axis}-${i}" data-axis="${ray.axis}" x1="${formatFiniteNumber(ray.startPx.x, precision)}" y1="${formatFiniteNumber(ray.startPx.y, precision)}" x2="${formatFiniteNumber(ray.endPx.x, precision)}" y2="${formatFiniteNumber(ray.endPx.y, precision)}" stroke-width="0.75" stroke-dasharray="3 4" />`,
      );
    });
    const vps: Array<readonly [string, Vec2 | null]> = [
      ["vp-x", reprojection.perspectiveGuides.vanishingPoints.vpX],
      ["vp-z", reprojection.perspectiveGuides.vanishingPoints.vpZ],
      ["vp-y", reprojection.perspectiveGuides.vanishingPoints.vpY],
    ];
    for (const [vpId, vp] of vps) {
      if (vp && vp.x >= -w * 0.5 && vp.x <= w * 1.5 && vp.y >= -h * 0.5 && vp.y <= h * 1.5) {
        guideLines.push(
          `    <circle id="${vpId}" cx="${formatFiniteNumber(vp.x, precision)}" cy="${formatFiniteNumber(vp.y, precision)}" r="4" fill="none" stroke-width="1.2" />`,
        );
      }
    }
  }

  for (const seg of reprojection.visibleSegments) {
    const pathXml = renderSegmentPathXml(seg, precision, seg.edgeRole === "surface-texture" ? textureOpacity : 1);
    if (seg.edgeRole === "silhouette-outer") silhouetteLines.push(pathXml);
    else if (seg.sourceEntityKind === "enclosure") archLines.push(pathXml);
    else propLines.push(pathXml);
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${formatFiniteNumber(w, precision)}" height="${formatFiniteNumber(h, precision)}" data-scene-id="${escapeXmlAttr(reprojection.sceneId)}" data-ink-profile="${escapeXmlAttr(reprojection.inkDna.profileName)}">`,
    `  <g id="horizon-guides" data-layer="horizon-guides" fill="none" stroke="currentColor" stroke-opacity="${formatFiniteNumber(guideOpacity, 2)}" stroke-linecap="round">`,
    ...guideLines,
    `  </g>`,
    `  <g id="architecture-shell" data-layer="architecture-shell" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">`,
    ...archLines,
    `  </g>`,
    `  <g id="foreground-props" data-layer="foreground-props" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">`,
    ...propLines,
    `  </g>`,
    `  <g id="ink-silhouette" data-layer="ink-silhouette" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">`,
    ...silhouetteLines,
    `  </g>`,
    `</svg>`,
  ].join("\n");

  return {
    svg, viewBox, widthPx: w, heightPx: h,
    layerSegmentCounts: {
      horizonGuides: guideLines.length,
      architectureShell: archLines.length,
      foregroundProps: propLines.length,
      inkSilhouette: silhouetteLines.length,
    },
    totalPaths: archLines.length + propLines.length + silhouetteLines.length,
  };
}

function analyzeIndexedMeshTopology(vertexCount: number, indices: readonly number[]): {
  readonly nonManifoldEdgeCount: number;
  readonly openBoundaryEdgeCount: number;
  readonly isWatertightManifold: boolean;
  readonly eulerCharacteristic: number;
} {
  const edgeUseCounts = new Map<string, number>();
  const triCount = Math.floor(indices.length / 3);
  for (let t = 0; t < triCount; t += 1) {
    const [i0, i1, i2] = [indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!];
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCounts.set(key, (edgeUseCounts.get(key) ?? 0) + 1);
    }
  }
  let nonManifoldEdgeCount = 0;
  let openBoundaryEdgeCount = 0;
  for (const count of edgeUseCounts.values()) {
    if (count > 2) nonManifoldEdgeCount += 1;
    else if (count < 2) openBoundaryEdgeCount += 1;
  }
  return {
    nonManifoldEdgeCount,
    openBoundaryEdgeCount,
    isWatertightManifold: nonManifoldEdgeCount === 0 && openBoundaryEdgeCount === 0,
    eulerCharacteristic: vertexCount - edgeUseCounts.size + triCount,
  };
}

function computeBoundingBox(positions: readonly number[]): { readonly min: Vec3; readonly max: Vec3 } {
  let [minX, minY, minZ] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let [maxX, maxY, maxZ] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

function buildPlaneMeshNode(plane: ArchitecturalPlane3d): GltfCompatibleMeshNode {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const c of plane.corners) {
    positions.push(c.x, c.y, c.z);
    normals.push(plane.normal.x, plane.normal.y, plane.normal.z);
  }
  const indices = [0, 1, 2, 0, 2, 3];
  const topo = analyzeIndexedMeshTopology(4, indices);
  return {
    id: plane.id, label: plane.role, kind: "enclosure-plane",
    materialSlotId: plane.role === "floor" || plane.role === "road-surface" ? "warm-floor-timber" : "matte-plaster-wall",
    vertexCount: 4, quadCount: 1, triangleCount: 2, positions, normals,
    uvs: [0, 0, plane.widthMeters, 0, plane.widthMeters, plane.heightMeters, 0, plane.heightMeters],
    indices, boundingBoxMeters: computeBoundingBox(positions), ...topo,
  };
}

function buildPropBoxMeshNode(prop: ParametricBoxProp3d): GltfCompatibleMeshNode {
  const geom = computeBoxWorldGeometry(prop);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    const c = geom.corners[i]!;
    positions.push(c.x, c.y, c.z);
    const [nx, ny, nz] = [c.x - prop.centerMeters.x, c.y - prop.centerMeters.y, c.z - prop.centerMeters.z];
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / len, ny / len, nz / len);
    uvs.push(i === 1 || i === 2 || i === 5 || i === 6 ? prop.sizeMeters.x : 0, i >= 4 ? prop.sizeMeters.y : 0);
  }
  const topo = analyzeIndexedMeshTopology(8, BOX_TRIANGLE_INDICES);
  const materialSlotId =
    prop.category === "window" || prop.category === "streetlamp" ? "architectural-metal-trim"
      : prop.category === "building" ? "matte-plaster-wall" : "furniture-oak-fabric";
  return {
    id: prop.id, label: prop.label, kind: "parametric-prop", materialSlotId,
    vertexCount: 8, quadCount: 6, triangleCount: 12, positions, normals, uvs,
    indices: [...BOX_TRIANGLE_INDICES], boundingBoxMeters: computeBoundingBox(positions), ...topo,
  };
}

/** 3D 파라메트릭 씬을 미터 규격 glTF 호환 메쉬 매니페스트(매니폴드·바닥 접지·NaN 검증 포함)로 내보낸다. */
export function exportParametricSceneMeshManifest(scene: ParametricScene3d): ParametricSceneMeshManifest {
  const planeNodes = scene.enclosurePlanes.map(buildPlaneMeshNode);
  const propNodes = scene.props.map(buildPropBoxMeshNode);
  const nodes: GltfCompatibleMeshNode[] = [...planeNodes, ...propNodes];

  let hasNonFiniteVertex = false;
  let totalVertexCount = 0;
  let totalQuadCount = 0;
  let totalTriangleCount = 0;
  const allPositions: number[] = [];
  for (const node of nodes) {
    totalVertexCount += node.vertexCount;
    totalQuadCount += node.quadCount;
    totalTriangleCount += node.triangleCount;
    for (const val of node.positions) {
      if (!Number.isFinite(val)) hasNonFiniteVertex = true;
      allPositions.push(val);
    }
  }

  return {
    schemaVersion: "toonstudio.wave81.gltf-mesh-manifest.v1",
    sceneId: scene.sceneId, archetype: scene.archetype, units: "meters", coordinateSystem: "right-handed-y-up-gltf",
    camera: {
      positionMeters: { ...scene.calibratedCamera.positionMeters },
      yawDeg: scene.calibratedCamera.yawDeg, pitchDeg: scene.calibratedCamera.pitchDeg,
      rollDeg: scene.calibratedCamera.rollDeg, focalLengthMm: scene.calibratedCamera.focalLengthMm,
      verticalFovDeg: scene.calibratedCamera.verticalFovDeg,
    },
    materialSlots: DEFAULT_MATERIAL_SLOTS,
    nodes,
    sceneBoundsMeters: allPositions.length >= 3 ? computeBoundingBox(allPositions) : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    audit: {
      units: "meters", upAxis: "Y", floorPlaneY: 0,
      allStandingPropsGroundedAtZero: scene.groundingAudit.allStandingPropsFloorSeated,
      allStackedPropsFlush: scene.groundingAudit.allStackedPropsFlush,
      allPropMeshesWatertightManifold: propNodes.every((n) => n.isWatertightManifold && n.nonManifoldEdgeCount === 0),
      hasNonFiniteVertex,
      maxGroundingErrorMeters: scene.groundingAudit.maxGroundingErrorMeters,
      totalVertexCount, totalQuadCount, totalTriangleCount,
    },
  };
}

/** glTF 호환 메쉬 매니페스트를 결정적인 포맷의 JSON 문자열로 직렬화한다. */
export function serializeParametricSceneMeshManifestJson(manifest: ParametricSceneMeshManifest): string {
  return JSON.stringify(manifest, null, 2);
}
