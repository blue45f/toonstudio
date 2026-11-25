/**
 * AtelierSolid Pro — CPU 프리셋 삼각 메시·Half-Edge 위상·오프셋 조립 참고값 계산.
 * Binary STL 버퍼와 원근 치수 참고도·LT 페이로드를 생성하며 실제 원고·권리 출고는 미연동이다.
 * 전체 형상·재가져오기가 미검증인 STEP AP214 출력은 차단한다.
 * 미터 스케일(1.0 = 1m) · 바닥 접지(minY = 0.000m) · OKLCH 전용(바이올렛 270~320° 0%).
 */

export type AtelierSolidPresetId = "rofan-arch-balcony" | "scifi-mech-actuator" | "cafe-glass-showcase" | "precision-stylus-stand" | "handcrafted-tea-vessel";
export type SolidFeatureKind = "direct-push-pull" | "revolve" | "loft" | "sweep" | "shell" | "fillet" | "chamfer" | "draft-angle" | "linear-circular-pattern" | "assembly-mate";
export type PatternMode = "none" | "linear" | "circular";
export type AssemblyMateMode = "concentric" | "coincident" | "distance";
export type PerspectiveMode = "2-point" | "3-point";
export type SolidFeatureStatus = "ok" | "suppressed" | "failed-guard";
export type ProfileShapeKind = "rounded-rect" | "octagon" | "circle" | "arch-rib" | "trapezoid";
export type SolidBuildTopology = "sweep-arch" | "toroid-bore" | "open-shell-loft" | "solid-loft" | "revolve-vessel";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface Vec2 { readonly x: number; readonly y: number; }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }
export interface Bounds3Meters { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; readonly minZ: number; readonly maxZ: number; }

export interface AtelierSolidParams {
  readonly presetId: AtelierSolidPresetId; readonly pushPullMm: number; readonly revolveAngleDeg: number;
  readonly loftScaleRatio: number; readonly sweepSpanMm: number; readonly wallThicknessMm: number;
  readonly filletRadiusMm: number; readonly chamferSizeMm: number; readonly draftAngleDeg: number;
  readonly patternMode: PatternMode; readonly patternCount: number; readonly patternSpacingMm: number;
  readonly mateMode: AssemblyMateMode; readonly mateOffsetMm: number; readonly suppressedFeatures: readonly SolidFeatureKind[];
}

export interface AtelierSolidPresetSpec {
  readonly id: AtelierSolidPresetId; readonly nameKo: string; readonly nameEn: string;
  readonly categoryKo: string; readonly categoryEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly topology: SolidBuildTopology; readonly baseProfile: ProfileShapeKind; readonly topProfile: ProfileShapeKind;
  readonly baseWidthMm: number; readonly baseDepthMm: number; readonly baseHeightMm: number;
  readonly accentOklch: OklchColor; readonly defaultParams: Omit<AtelierSolidParams, "presetId">;
}

export interface WatertightSolidMesh {
  readonly positions: Float32Array; readonly indices: Uint32Array; readonly faceNormals: Float32Array; readonly uvs: Float32Array;
  readonly vertexCount: number; readonly triangleCount: number; readonly componentIds: Uint16Array;
  readonly componentNames: readonly string[]; readonly boundsMeters: Bounds3Meters;
}

export interface HalfEdgeTopologyReport {
  readonly watertight: boolean; readonly nonManifoldEdges: number; readonly boundaryEdges: number;
  readonly looseVertices: number; readonly degenerateFaces: number; readonly vertexCount: number;
  readonly edgeCount: number; readonly faceCount: number; readonly componentCount: number;
  readonly genus: number; readonly eulerCharacteristic: number; readonly signedVolumeCm3: number;
  readonly surfaceAreaCm2: number; readonly minYMeters: number; readonly floorGroundedY0: boolean; readonly allFinite: boolean;
}

export interface SolidFeatureEvalEntry {
  readonly kind: SolidFeatureKind; readonly labelKo: string; readonly labelEn: string; readonly status: SolidFeatureStatus;
  readonly valueSummary: string; readonly guardReasonKo: string | null; readonly guardReasonEn: string | null;
}

export interface AssemblyInterferenceReport {
  readonly mateMode: AssemblyMateMode; readonly mateOffsetMm: number; readonly matedPartNameKo: string; readonly matedPartNameEn: string;
  readonly hasInterference: boolean; readonly interferenceMm: number; readonly clearanceMm: number;
  readonly primaryBoundsMm: { readonly w: number; readonly h: number; readonly d: number };
  readonly matedBoundsMm: { readonly w: number; readonly h: number; readonly d: number };
}

export interface AtelierSolidEvaluation {
  readonly preset: AtelierSolidPresetSpec; readonly params: AtelierSolidParams; readonly mesh: WatertightSolidMesh;
  readonly topology: HalfEdgeTopologyReport; readonly features: readonly SolidFeatureEvalEntry[];
  readonly assembly: AssemblyInterferenceReport; readonly guardViolations: readonly SolidFeatureEvalEntry[];
  readonly dimensionsMm: { readonly width: number; readonly height: number; readonly depth: number }; readonly regenHash: string;
}

export interface GdtCalloutSpec { readonly id: string; readonly symbol: string; readonly labelKo: string; readonly labelEn: string; readonly nominalMm: number; readonly toleranceMm: number; readonly datum: string; }
export interface ProjectedLine2D { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly kind: "silhouette" | "crease" | "contour" | "guide"; readonly strokeWidthPx: number; readonly dihedralDeg?: number; }
export interface EngineeringDrawingViewSpec { readonly id: "front" | "top" | "right" | "isometric"; readonly titleKo: string; readonly titleEn: string; readonly lines: readonly ProjectedLine2D[]; readonly widthMm: number; readonly heightMm: number; }
export interface EngineeringDrawingSpec { readonly schema: "toonstudio.atelier-solid-drawing.v1"; readonly presetId: AtelierSolidPresetId; readonly toleranceClass: string; readonly views: readonly EngineeringDrawingViewSpec[]; readonly gdtCallouts: readonly GdtCalloutSpec[]; readonly svgMarkup: string; }
export interface LtCameraOptions { readonly yawDeg?: number; readonly pitchDeg?: number; readonly creaseAngleDeg?: number; readonly perspectiveMode?: PerspectiveMode; readonly fovDeg?: number; readonly viewportWidth?: number; readonly viewportHeight?: number; readonly sectionCutActive?: boolean; readonly sectionCutPercent?: number; }
export interface ProjectedFace2D { readonly points: readonly Vec2[]; readonly depth: number; readonly shade01: number; readonly componentId: number; readonly fillOklch: string; }
export interface VanishingPoint2D { readonly axis: "X" | "Y" | "Z"; readonly x: number; readonly y: number; readonly inFrame: boolean; }

export interface WebtoonLtLineartPayload {
  readonly schema: "toonstudio.atelier-solid-lt-lineart.v1"; readonly bridgeTarget: "AtelierStage-2D-LT";
  readonly presetId: AtelierSolidPresetId; readonly perspectiveMode: PerspectiveMode; readonly creaseAngleDeg: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly silhouetteEdges: readonly ProjectedLine2D[]; readonly creaseEdges: readonly ProjectedLine2D[];
  readonly contourEdges: readonly ProjectedLine2D[]; readonly perspectiveGuides: readonly ProjectedLine2D[];
  readonly vanishingPoints: readonly VanishingPoint2D[]; readonly shadedFaces: readonly ProjectedFace2D[];
  readonly summary: { readonly totalEdges: number; readonly silhouetteCount: number; readonly creaseCount: number; readonly tonePolygonCount: number; readonly watertightVerified: boolean; };
}

export const SOLID_FEATURE_META: Record<SolidFeatureKind, { readonly ko: string; readonly en: string }> = {
  "direct-push-pull": { ko: "직접 면 밀기/당기기", en: "Direct Push-Pull" },
  revolve: { ko: "회전체 생성", en: "Revolve" },
  loft: { ko: "이종 단면 로프트", en: "Profile Loft" },
  sweep: { ko: "경로 곡선 스윕", en: "Path Sweep" },
  shell: { ko: "중공 쉘 벽두께", en: "Hollow Shell" },
  fillet: { ko: "모서리 필렛", en: "Edge Fillet" },
  chamfer: { ko: "45° 모따기", en: "Edge Chamfer" },
  "draft-angle": { ko: "금형 구배 각도", en: "Mold Draft" },
  "linear-circular-pattern": { ko: "선형/원형 패턴", en: "Linear/Circular Pattern" },
  "assembly-mate": { ko: "어셈블리 메이트·간섭검사", en: "Assembly Mate & Clash" },
};

export const SOLID_FEATURE_ORDER: readonly SolidFeatureKind[] = [
  "direct-push-pull", "revolve", "loft", "sweep", "shell", "fillet", "chamfer", "draft-angle", "linear-circular-pattern", "assembly-mate",
];

export const ATELIER_SOLID_PRESETS: readonly AtelierSolidPresetSpec[] = [
  {
    id: "rofan-arch-balcony", nameKo: "로판 아치 난간 모듈", nameEn: "Rofan Arch Balcony Module",
    categoryKo: "로판 건축 · 배경", categoryEn: "Rofan Architecture",
    summaryKo: "반원 아치 스윕·선형 난간 배열·상단 핸드레일 메이트 건축 모듈", summaryEn: "Swept arch rib module with linear balustrade pattern and mated top rail",
    topology: "sweep-arch", baseProfile: "arch-rib", topProfile: "rounded-rect", baseWidthMm: 440, baseDepthMm: 92, baseHeightMm: 360, accentOklch: { l: 0.56, c: 0.13, h: 48 },
    defaultParams: { pushPullMm: 24, revolveAngleDeg: 360, loftScaleRatio: 0.92, sweepSpanMm: 440, wallThicknessMm: 10, filletRadiusMm: 4, chamferSizeMm: 2, draftAngleDeg: 1.5, patternMode: "linear", patternCount: 2, patternSpacingMm: 520, mateMode: "coincident", mateOffsetMm: 2, suppressedFeatures: ["revolve", "shell"] },
  },
  {
    id: "scifi-mech-actuator", nameKo: "SF 메카 관절 액추에이터", nameEn: "Sci-Fi Mech Joint Actuator",
    categoryKo: "SF 메카 · 하드서피스", categoryEn: "Sci-Fi Mecha",
    summaryKo: "중앙 관통 보어(Genus 1) 하우징과 동심 피스톤 샤프트 메이트 하드서피스", summaryEn: "Through-bore genus-1 housing with concentric shaft mate and chamfered bevels",
    topology: "toroid-bore", baseProfile: "octagon", topProfile: "octagon", baseWidthMm: 170, baseDepthMm: 170, baseHeightMm: 120, accentOklch: { l: 0.52, c: 0.14, h: 218 },
    defaultParams: { pushPullMm: 18, revolveAngleDeg: 360, loftScaleRatio: 0.94, sweepSpanMm: 170, wallThicknessMm: 26, filletRadiusMm: 3, chamferSizeMm: 4, draftAngleDeg: 2, patternMode: "none", patternCount: 1, patternSpacingMm: 220, mateMode: "concentric", mateOffsetMm: 3, suppressedFeatures: ["revolve", "sweep"] },
  },
  {
    id: "cafe-glass-showcase", nameKo: "현대극 카페 쇼케이스", nameEn: "Modern Cafe Glass Showcase",
    categoryKo: "현대극 소품 · 공간", categoryEn: "Modern Interior Prop",
    summaryKo: "이종 단면 로프트·중공 진열 내부 쉘·내부 선반 메이트 카운터 쇼케이스", summaryEn: "Lofted counter showcase with hollow display shell and mated interior tray",
    topology: "open-shell-loft", baseProfile: "rounded-rect", topProfile: "trapezoid", baseWidthMm: 380, baseDepthMm: 220, baseHeightMm: 230, accentOklch: { l: 0.54, c: 0.12, h: 162 },
    defaultParams: { pushPullMm: 20, revolveAngleDeg: 360, loftScaleRatio: 0.84, sweepSpanMm: 380, wallThicknessMm: 14, filletRadiusMm: 5, chamferSizeMm: 2.5, draftAngleDeg: 2.5, patternMode: "none", patternCount: 1, patternSpacingMm: 440, mateMode: "distance", mateOffsetMm: 8, suppressedFeatures: ["revolve", "sweep"] },
  },
  {
    id: "precision-stylus-stand", nameKo: "정밀 스타일러스 거치대", nameEn: "Precision Stylus Stand",
    categoryKo: "제품 · 산업 디자인", categoryEn: "Industrial Product Design",
    summaryKo: "육각→원형 로프트·사출 금형 구배(3°)·동심 무게추 조립 정밀 거치대", summaryEn: "Octagonal-to-round lofted dock with 3-deg mold draft and concentric base",
    topology: "solid-loft", baseProfile: "octagon", topProfile: "circle", baseWidthMm: 108, baseDepthMm: 108, baseHeightMm: 112, accentOklch: { l: 0.50, c: 0.13, h: 235 },
    defaultParams: { pushPullMm: 10, revolveAngleDeg: 360, loftScaleRatio: 0.72, sweepSpanMm: 108, wallThicknessMm: 9, filletRadiusMm: 4.5, chamferSizeMm: 2.5, draftAngleDeg: 3, patternMode: "none", patternCount: 1, patternSpacingMm: 140, mateMode: "concentric", mateOffsetMm: 2, suppressedFeatures: ["revolve", "sweep", "shell"] },
  },
  {
    id: "handcrafted-tea-vessel", nameKo: "도자기 찻잔 회전체", nameEn: "Handcrafted Tea Vessel",
    categoryKo: "시대극 · 공예 소품", categoryEn: "Craft & Ceramic Prop",
    summaryKo: "360° 도자기 곡선 회전체·중공 내벽 쉘·원형 받침 접시 메이트 수밀 기물", summaryEn: "360-deg revolved ceramic vessel with hollow wall shell and mated saucer",
    topology: "revolve-vessel", baseProfile: "circle", topProfile: "circle", baseWidthMm: 94, baseDepthMm: 94, baseHeightMm: 96, accentOklch: { l: 0.55, c: 0.12, h: 32 },
    defaultParams: { pushPullMm: 8, revolveAngleDeg: 360, loftScaleRatio: 1.08, sweepSpanMm: 94, wallThicknessMm: 6.5, filletRadiusMm: 2.2, chamferSizeMm: 1.2, draftAngleDeg: 1, patternMode: "circular", patternCount: 1, patternSpacingMm: 120, mateMode: "coincident", mateOffsetMm: 1.5, suppressedFeatures: ["sweep", "loft"] },
  },
];

const RING_SEGMENTS = 24, MM_TO_M = 0.001;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const round1 = (v: number): number => Math.round(v * 10) / 10;

export const isVioletSlopHue = (hueDeg: number): boolean => { const n = ((hueDeg % 360) + 360) % 360; return n >= 270 && n <= 320; };
export const sanitizeNonVioletHue = (hueDeg: number): number => { const n = ((hueDeg % 360) + 360) % 360; return isVioletSlopHue(n) ? 228 : round1(n); };
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = round3(clamp(color.l, 0, 1)), c = round3(clamp(color.c, 0, 0.4)), h = sanitizeNonVioletHue(color.h);
  return alpha !== undefined && alpha < 0.999 ? `oklch(${l} ${c} ${h} / ${round3(clamp(alpha, 0, 1))})` : `oklch(${l} ${c} ${h})`;
}
export const getAtelierSolidPreset = (id: AtelierSolidPresetId): AtelierSolidPresetSpec => ATELIER_SOLID_PRESETS.find((p) => p.id === id) ?? ATELIER_SOLID_PRESETS[0];
export function createDefaultAtelierSolidParams(presetId: AtelierSolidPresetId): AtelierSolidParams {
  const preset = getAtelierSolidPreset(presetId);
  return { presetId: preset.id, ...preset.defaultParams };
}

function sampleProfile2D(shape: ProfileShapeKind, hw: number, hd: number, segs: number, round01: number): Vec2[] {
  return Array.from({ length: segs }, (_, i) => {
    const th = (2 * Math.PI * i) / segs, cs = Math.cos(th), sn = Math.sin(th);
    if (shape === "circle") return { x: hw * cs, y: hd * sn };
    if (shape === "octagon") {
      const b = lerp(1, 1 / Math.max(Math.abs(cs), Math.abs(sn), (Math.abs(cs) + Math.abs(sn)) * 0.7071, 1e-6), 1 - round01 * 0.25);
      return { x: hw * cs * b, y: hd * sn * b };
    }
    if (shape === "trapezoid") {
      const k = Math.max(Math.abs(cs), Math.abs(sn), 1e-6);
      return { x: hw * lerp((cs / k) * (sn > 0 ? 0.86 : 1), cs, round01 * 0.4), y: hd * lerp(sn / k, sn, round01 * 0.4) };
    }
    const exp = lerp(0.28, 0.85, clamp(round01, 0, 1));
    return { x: hw * Math.sign(cs) * Math.pow(Math.abs(cs), exp), y: hd * Math.sign(sn) * Math.pow(Math.abs(sn), exp) };
  });
}

interface RawSolidBuilder { positions: number[]; indices: number[]; uvs: number[]; componentIds: number[]; componentNames: string[]; }
function pushVertex(b: RawSolidBuilder, p: Vec3, u: number, v: number, compId: number): number {
  const idx = b.positions.length / 3;
  b.positions.push(p.x, p.y, p.z); b.uvs.push(u, v); b.componentIds.push(compId);
  return idx;
}

function appendClosedRingSolid(b: RawSolidBuilder, rings: readonly (readonly Vec3[])[], compId: number, cyclic: boolean): void {
  const kCount = rings.length, nCount = rings[0]?.length ?? 0;
  if (kCount < 2 || nCount < 3) return;
  const rows = rings.map((ring, k) => ring.map((pt, i) => pushVertex(b, pt, i / nCount, k / Math.max(1, kCount - 1), compId)));
  for (let k = 0; k < (cyclic ? kCount : kCount - 1); k += 1) {
    const r0 = rows[k], r1 = rows[(k + 1) % kCount];
    for (let i = 0; i < nCount; i += 1) { const j = (i + 1) % nCount; b.indices.push(r0[i], r0[j], r1[j], r0[i], r1[j], r1[i]); }
  }
  if (!cyclic) {
    const avg = (r: readonly Vec3[]): Vec3 => ({ x: r.reduce((s, p) => s + p.x, 0) / nCount, y: r.reduce((s, p) => s + p.y, 0) / nCount, z: r.reduce((s, p) => s + p.z, 0) / nCount });
    const cBot = pushVertex(b, avg(rings[0]), 0.5, 0, compId), cTop = pushVertex(b, avg(rings[kCount - 1]), 0.5, 1, compId);
    const rBot = rows[0], rTop = rows[kCount - 1];
    for (let i = 0; i < nCount; i += 1) { const j = (i + 1) % nCount; b.indices.push(cBot, rBot[j], rBot[i], cTop, rTop[i], rTop[j]); }
  }
}

function measureBounds(positions: readonly number[], compIds: readonly number[], targetComp: number | null): Bounds3Meters {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length / 3; i += 1) {
    if (targetComp !== null && compIds[i] !== targetComp) continue;
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function finalizeWatertightMesh(b: RawSolidBuilder): WatertightSolidMesh {
  const vertexCount = b.positions.length / 3, triangleCount = b.indices.length / 3;
  const raw = measureBounds(b.positions, b.componentIds, null), yOff = Number.isFinite(raw.minY) ? raw.minY : 0;
  const positions = new Float32Array(b.positions.length);
  for (let i = 0; i < vertexCount; i += 1) {
    positions[i * 3] = b.positions[i * 3];
    const gy = b.positions[i * 3 + 1] - yOff;
    positions[i * 3 + 1] = Math.abs(gy) < 1e-8 ? 0 : gy;
    positions[i * 3 + 2] = b.positions[i * 3 + 2];
  }
  const indices = new Uint32Array(b.indices), faceNormals = new Float32Array(triangleCount * 3);
  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = indices[t * 3] * 3, i1 = indices[t * 3 + 1] * 3, i2 = indices[t * 3 + 2] * 3;
    const nx = (positions[i1 + 1] - positions[i0 + 1]) * (positions[i2 + 2] - positions[i0 + 2]) - (positions[i1 + 2] - positions[i0 + 2]) * (positions[i2 + 1] - positions[i0 + 1]);
    const ny = (positions[i1 + 2] - positions[i0 + 2]) * (positions[i2] - positions[i0]) - (positions[i1] - positions[i0]) * (positions[i2 + 2] - positions[i0 + 2]);
    const nz = (positions[i1] - positions[i0]) * (positions[i2 + 1] - positions[i0 + 1]) - (positions[i1 + 1] - positions[i0 + 1]) * (positions[i2] - positions[i0]);
    const len = Math.hypot(nx, ny, nz) || 1;
    faceNormals[t * 3] = nx / len; faceNormals[t * 3 + 1] = ny / len; faceNormals[t * 3 + 2] = nz / len;
  }
  return {
    positions, indices, faceNormals, uvs: new Float32Array(b.uvs), vertexCount, triangleCount,
    componentIds: new Uint16Array(b.componentIds), componentNames: [...b.componentNames],
    boundsMeters: { minX: round3(raw.minX), maxX: round3(raw.maxX), minY: 0, maxY: round3(raw.maxY - yOff), minZ: round3(raw.minZ), maxZ: round3(raw.maxZ) },
  };
}

/** 실측 Half-Edge 매니폴드 검증기 — null 없이 모든 위상·수밀 지표를 실측 계산한다. */
export function verifyManifoldHalfEdgeTopology(mesh: WatertightSolidMesh): HalfEdgeTopologyReport {
  const { positions, indices } = mesh, vCount = Math.floor(positions.length / 3), fCount = Math.floor(indices.length / 3);
  let allFinite = vCount > 0 && fCount > 0, minY = Infinity;
  for (let i = 0; i < vCount; i += 1) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) allFinite = false;
    if (y < minY) minY = y;
  }
  const used = new Uint8Array(vCount), parent = Int32Array.from({ length: vCount }, (_, i) => i);
  const findRoot = (a: number): number => { let c = a; while (parent[c] !== c) { parent[c] = parent[parent[c]]; c = parent[c]; } return c; };
  const unionV = (a: number, b: number): void => { const ra = findRoot(a), rb = findRoot(b); if (ra !== rb) parent[ra] = rb; };
  const edgeCounts = new Map<number, { fwd: number; rev: number }>();
  let degenerateFaces = 0, surfaceAreaM2 = 0, signedVolumeM3 = 0;
  for (let t = 0; t < fCount; t += 1) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    if (a >= vCount || b >= vCount || c >= vCount || a === b || b === c || c === a) { degenerateFaces += 1; continue; }
    used[a] = 1; used[b] = 1; used[c] = 1; unionV(a, b); unionV(b, c);
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2], bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2], cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const area = 0.5 * Math.hypot((by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az), (bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    if (!Number.isFinite(area) || area < 1e-11) degenerateFaces += 1;
    surfaceAreaM2 += area;
    signedVolumeM3 += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const key = (u < v ? u : v) * vCount + (u < v ? v : u);
      let e = edgeCounts.get(key);
      if (!e) { e = { fwd: 0, rev: 0 }; edgeCounts.set(key, e); }
      if (u < v) e.fwd += 1; else e.rev += 1;
    }
  }
  let boundaryEdges = 0, nonManifoldEdges = 0, looseVertices = 0;
  for (const { fwd, rev } of edgeCounts.values()) { if (fwd + rev === 1) boundaryEdges += 1; else if (fwd + rev !== 2 || fwd !== 1 || rev !== 1) nonManifoldEdges += 1; }
  const roots = new Set<number>();
  for (let i = 0; i < vCount; i += 1) { if (used[i] === 0) looseVertices += 1; else roots.add(findRoot(i)); }
  const edgeCount = edgeCounts.size, eulerCharacteristic = vCount - looseVertices - edgeCount + fCount, componentCount = roots.size;
  const genus = componentCount > 0 ? Math.max(0, Math.round(componentCount - eulerCharacteristic / 2)) : 0;
  const minYMeters = Number.isFinite(minY) ? Math.round(minY * 1e6) / 1e6 : 0;
  return {
    watertight: allFinite && fCount > 0 && nonManifoldEdges === 0 && boundaryEdges === 0 && looseVertices === 0 && degenerateFaces === 0 && signedVolumeM3 > 0,
    nonManifoldEdges, boundaryEdges, looseVertices, degenerateFaces, vertexCount: vCount, edgeCount, faceCount: fCount,
    componentCount, genus, eulerCharacteristic,
    signedVolumeCm3: Math.round(signedVolumeM3 * 1e8) / 100, surfaceAreaCm2: Math.round(surfaceAreaM2 * 1e6) / 100,
    minYMeters, floorGroundedY0: allFinite && Math.abs(minYMeters) <= 1e-5, allFinite,
  };
}

interface ResolvedBuildParams {
  readonly heightMm: number; readonly widthMm: number; readonly depthMm: number; readonly filletMm: number; readonly chamferMm: number;
  readonly draftDeg: number; readonly wallMm: number; readonly loftScale: number; readonly revolveDeg: number;
  readonly shellActive: boolean; readonly sweepActive: boolean; readonly revolveActive: boolean;
  readonly patternActive: boolean; readonly mateActive: boolean; readonly features: readonly SolidFeatureEvalEntry[];
}

function resolveFeatureEvaluations(preset: AtelierSolidPresetSpec, params: AtelierSolidParams): ResolvedBuildParams {
  const sup = new Set(params.suppressedFeatures), isSup = (k: SolidFeatureKind): boolean => sup.has(k);
  const pushPullMm = isSup("direct-push-pull") ? 0 : clamp(params.pushPullMm, -40, 160);
  const heightMm = Math.max(36, preset.baseHeightMm + pushPullMm);
  const widthMm = Math.max(44, preset.topology === "sweep-arch" ? clamp(params.sweepSpanMm, 260, 640) : preset.baseWidthMm);
  const depthMm = Math.max(44, preset.baseDepthMm), minSpan = Math.min(widthMm, depthMm), minHalf = minSpan * 0.5;
  const shellActive = !isSup("shell") && (preset.topology === "toroid-bore" || preset.topology === "open-shell-loft" || preset.topology === "revolve-vessel" || params.wallThicknessMm > 0);
  let wallMm = clamp(params.wallThicknessMm, 1.5, 45), shellGKo: string | null = null, shellGEn: string | null = null;
  if (shellActive && wallMm * 2 >= minSpan * 0.82) {
    const safe = round1(minSpan * 0.36);
    shellGKo = `쉘 벽두께(${wallMm}mm)가 최소 단면 폭의 82%를 초과해 안전 상한(${safe}mm)으로 차단했습니다.`;
    shellGEn = `Shell wall (${wallMm}mm) exceeds 82% min span; Fail-Closed clamped to ${safe}mm.`;
    wallMm = safe;
  }
  const maxFillet = round1(Math.min(minHalf * 0.42, heightMm * 0.24, shellActive ? wallMm * 0.72 : 999));
  let filletMm = isSup("fillet") ? 0 : Math.max(0, params.filletRadiusMm), flGKo: string | null = null, flGEn: string | null = null;
  if (!isSup("fillet") && filletMm > maxFillet) {
    flGKo = `필렛 반경 R${filletMm}mm가 자기교차 안전 상한 R${maxFillet}mm를 초과해 Fail-Closed 롤백했습니다.`;
    flGEn = `Fillet R${filletMm}mm exceeds self-intersection limit R${maxFillet}mm; Fail-Closed rolled back.`;
    filletMm = Math.max(0.5, round1(maxFillet * 0.75));
  }
  const maxChamfer = round1(Math.min(minHalf * 0.38, heightMm * 0.22, shellActive ? wallMm * 0.65 : 999));
  let chamferMm = isSup("chamfer") ? 0 : Math.max(0, params.chamferSizeMm), chGKo: string | null = null, chGEn: string | null = null;
  if (!isSup("chamfer") && chamferMm > maxChamfer) {
    chGKo = `챔퍼 C${chamferMm}mm가 안전 상한 C${maxChamfer}mm를 초과해 Fail-Closed 차단했습니다.`;
    chGEn = `Chamfer C${chamferMm}mm exceeds safe limit C${maxChamfer}mm; Fail-Closed clamped.`;
    chamferMm = Math.max(0.5, round1(maxChamfer * 0.75));
  }
  let draftDeg = isSup("draft-angle") ? 0 : Math.max(0, params.draftAngleDeg), drGKo: string | null = null, drGEn: string | null = null;
  if (!isSup("draft-angle") && (draftDeg > 15 || heightMm * Math.tan((draftDeg * Math.PI) / 180) >= minHalf * 0.65)) {
    const safeD = Math.min(15, round1((Math.atan((minHalf * 0.5) / heightMm) * 180) / Math.PI));
    drGKo = `금형 구배 ${draftDeg}°가 상단 단면 붕괴 상한(${safeD}°)을 초과해 차단했습니다.`;
    drGEn = `Draft ${draftDeg} deg exceeds collapse limit (${safeD} deg); Fail-Closed clamped.`;
    draftDeg = safeD;
  }
  const loftScale = !isSup("loft") ? clamp(params.loftScaleRatio, 0.55, 1.25) : 1;
  const sweepActive = !isSup("sweep") && preset.topology === "sweep-arch", revolveActive = !isSup("revolve") && preset.topology === "revolve-vessel";
  const revolveDeg = clamp(params.revolveAngleDeg, 90, 360), patternActive = !isSup("linear-circular-pattern") && params.patternMode !== "none" && params.patternCount > 1, mateActive = !isSup("assembly-mate");
  const entry = (k: SolidFeatureKind, val: string, gKo: string | null = null, gEn: string | null = null): SolidFeatureEvalEntry => ({
    kind: k, labelKo: SOLID_FEATURE_META[k].ko, labelEn: SOLID_FEATURE_META[k].en,
    status: isSup(k) ? "suppressed" : gKo ? "failed-guard" : "ok", valueSummary: val, guardReasonKo: isSup(k) ? null : gKo, guardReasonEn: isSup(k) ? null : gEn,
  });
  return {
    heightMm, widthMm, depthMm, filletMm, chamferMm, draftDeg, wallMm, loftScale, revolveDeg, shellActive, sweepActive, revolveActive, patternActive, mateActive,
    features: [
      entry("direct-push-pull", `${pushPullMm >= 0 ? "+" : ""}${pushPullMm}mm (H=${Math.round(heightMm)}mm)`),
      entry("revolve", revolveActive ? `${revolveDeg}°` : "대기"),
      entry("loft", !isSup("loft") ? `×${loftScale.toFixed(2)}` : "억제"),
      entry("sweep", sweepActive ? `아치 스팬 ${Math.round(widthMm)}mm` : "직선 축"),
      entry("shell", shellActive ? `벽 ${wallMm.toFixed(1)}mm` : "솔리드 충실", shellGKo, shellGEn),
      entry("fillet", `R${filletMm.toFixed(1)}mm`, flGKo, flGEn),
      entry("chamfer", `C${chamferMm.toFixed(1)}mm`, chGKo, chGEn),
      entry("draft-angle", `${draftDeg.toFixed(1)}°`, drGKo, drGEn),
      entry("linear-circular-pattern", patternActive ? `${params.patternMode} ×${clamp(params.patternCount, 1, 4)}` : "단일 1개"),
      entry("assembly-mate", mateActive ? `${params.mateMode} (${params.mateOffsetMm >= 0 ? "+" : ""}${params.mateOffsetMm}mm)` : "비활성"),
    ],
  };
}

function buildPrimaryBodyRings(preset: AtelierSolidPresetSpec, res: ResolvedBuildParams, offset: Vec3, rotY: number): { rings: Vec3[][]; cyclic: boolean } {
  const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
  const xf = (p: Vec3): Vec3 => ({ x: p.x * cosR + p.z * sinR + offset.x, y: p.y + offset.y, z: -p.x * sinR + p.z * cosR + offset.z });
  const hM = res.heightMm * MM_TO_M, hwM = res.widthMm * 0.5 * MM_TO_M, hdM = res.depthMm * 0.5 * MM_TO_M;
  const flM = res.filletMm * MM_TO_M, chM = res.chamferMm * MM_TO_M, wallM = res.wallMm * MM_TO_M;
  const dTan = Math.tan((res.draftDeg * Math.PI) / 180), rnd = clamp(res.filletMm / 12, 0.12, 0.92);
  const hRing = (yM: number, rx: number, rz: number, t: number, sA: ProfileShapeKind, sB: ProfileShapeKind): Vec3[] => {
    const pA = sampleProfile2D(sA, Math.max(0.004, rx), Math.max(0.004, rz), RING_SEGMENTS, rnd);
    const pB = sampleProfile2D(sB, Math.max(0.004, rx), Math.max(0.004, rz), RING_SEGMENTS, rnd);
    return pA.map((pt, i) => xf({ x: lerp(pt.x, pB[i].x, t), y: yM, z: -lerp(pt.y, pB[i].y, t) }));
  };

  if (res.sweepActive) {
    const archR = Math.max(0.09, hwM * 0.82), legH = Math.max(0.06, hM - archR), secU = Math.max(0.014, hwM * 0.14), secV = Math.max(0.018, hdM * 0.45);
    const prof = sampleProfile2D("rounded-rect", secU, secV, RING_SEGMENTS, rnd), cSc = 1 - clamp(chM / secU, 0, 0.22);
    const st: { p: Vec3; t: Vec3; s: number }[] = [
      { p: { x: -archR, y: 0, z: 0 }, t: { x: 0, y: 1, z: 0 }, s: cSc }, { p: { x: -archR, y: Math.max(0.004, chM), z: 0 }, t: { x: 0, y: 1, z: 0 }, s: 1 }, { p: { x: -archR, y: legH, z: 0 }, t: { x: 0, y: 1, z: 0 }, s: 1 },
      ...Array.from({ length: 7 }, (_, i) => { const a = Math.PI - (Math.PI * (i + 1)) / 8; return { p: { x: Math.cos(a) * archR, y: legH + Math.sin(a) * archR, z: 0 }, t: { x: Math.sin(a), y: -Math.cos(a), z: 0 }, s: lerp(1, res.loftScale, Math.sin((Math.PI * (i + 1)) / 8)) }; }),
      { p: { x: archR, y: legH, z: 0 }, t: { x: 0, y: -1, z: 0 }, s: 1 }, { p: { x: archR, y: Math.max(0.004, chM), z: 0 }, t: { x: 0, y: -1, z: 0 }, s: 1 }, { p: { x: archR, y: 0, z: 0 }, t: { x: 0, y: -1, z: 0 }, s: cSc },
    ];
    return { cyclic: false, rings: st.map((n) => prof.map((q) => xf({ x: n.p.x + q.x * n.s * n.t.y, y: n.p.y - q.x * n.s * n.t.x, z: n.p.z - q.y * n.s }))) };
  }

  if (preset.topology === "toroid-bore" && res.shellActive) {
    const inR = Math.max(0.012, Math.min(hwM, hdM) - wallM), ch = Math.min(chM, hM * 0.16, (hwM - inR) * 0.35), fl = Math.min(flM, hM * 0.16, (hwM - inR) * 0.35);
    const tW = Math.max(inR + 0.008, hwM * res.loftScale - hM * dTan), tD = Math.max(inR + 0.008, hdM * res.loftScale - hM * dTan);
    return {
      cyclic: true,
      rings: [
        hRing(0, hwM - ch, hdM - ch, 0, preset.baseProfile, preset.topProfile), hRing(Math.max(0.002, ch), hwM, hdM, 0.1, preset.baseProfile, preset.topProfile),
        hRing(hM * 0.5, lerp(hwM, tW, 0.5), lerp(hdM, tD, 0.5), 0.5, preset.baseProfile, preset.topProfile), hRing(hM - Math.max(0.002, fl), tW, tD, 0.9, preset.baseProfile, preset.topProfile),
        hRing(hM, Math.max(inR + 0.004, tW - fl), Math.max(inR + 0.004, tD - fl), 1, preset.baseProfile, preset.topProfile),
        hRing(hM, inR, inR, 1, "circle", "circle"), hRing(hM * 0.5, inR, inR, 0.5, "circle", "circle"), hRing(0, inR, inR, 0, "circle", "circle"),
      ],
    };
  }

  if (preset.topology === "revolve-vessel") {
    const belly = [[0, 0.66], [0.06, 0.72], [0.25, 0.92], [0.55, 1.04], [0.85, 0.98 * res.loftScale], [1, 0.93 * res.loftScale]] as const;
    if (res.revolveActive && res.revolveDeg < 359) {
      const inR = Math.max(0.006, hwM * 0.25), maxRad = (res.revolveDeg * Math.PI) / 180;
      const mer: Vec2[] = [{ x: inR, y: 0 }, ...belly.map(([f, s], idx) => ({ x: Math.max(inR + 0.006, hwM * s - f * hM * dTan - (idx === 0 ? chM * 0.4 : 0)), y: f * hM })), { x: inR, y: hM }];
      return { cyclic: false, rings: Array.from({ length: 17 }, (_, k) => mer.map((m) => xf({ x: m.x * Math.cos((maxRad * k) / 16), y: m.y, z: m.x * Math.sin((maxRad * k) / 16) }))) };
    }
    const outer = belly.map(([f, s], idx) => { const y = f * hM, r = Math.max(0.012, hwM * s - y * dTan - (idx === 0 ? chM * 0.4 : 0)); return hRing(y, r, r, f, "circle", "circle"); });
    if (!res.shellActive) return { rings: outer, cyclic: false };
    const rimO = Math.max(0.016, hwM * belly[5][1] - hM * dTan), rimI = Math.max(0.008, rimO - wallM), flY = Math.min(hM * 0.45, Math.max(0.006, wallM * 1.15));
    return { cyclic: false, rings: [...outer, hRing(hM + Math.max(0.001, flM * 0.4), (rimO + rimI) * 0.5, (rimO + rimI) * 0.5, 1, "circle", "circle"), hRing(hM, rimI, rimI, 1, "circle", "circle"), hRing(lerp(flY, hM, 0.55), Math.max(0.008, rimI * 0.98), Math.max(0.008, rimI * 0.98), 0.5, "circle", "circle"), hRing(flY, Math.max(0.006, hwM * 0.66 - wallM), Math.max(0.006, hwM * 0.66 - wallM), 0, "circle", "circle")] };
  }

  const ch = Math.min(chM, hM * 0.14, Math.min(hwM, hdM) * 0.25), fl = Math.min(flM, hM * 0.16, Math.min(hwM, hdM) * 0.28);
  const tW = Math.max(0.014, hwM * res.loftScale - hM * dTan), tD = Math.max(0.014, hdM * res.loftScale - hM * dTan);
  const outer: Vec3[][] = [
    hRing(0, Math.max(0.01, hwM - ch), Math.max(0.01, hdM - ch), 0, preset.baseProfile, preset.topProfile), hRing(Math.max(0.002, ch), hwM, hdM, 0.08, preset.baseProfile, preset.topProfile),
    hRing(hM * 0.45, lerp(hwM, tW, 0.45), lerp(hdM, tD, 0.45), 0.45, preset.baseProfile, preset.topProfile), hRing(hM - Math.max(0.003, fl), tW, tD, 0.88, preset.baseProfile, preset.topProfile),
    hRing(hM - Math.max(0.001, fl * 0.35), Math.max(0.01, tW - fl * 0.3), Math.max(0.01, tD - fl * 0.3), 0.96, preset.baseProfile, preset.topProfile), hRing(hM, Math.max(0.01, tW - fl), Math.max(0.01, tD - fl), 1, preset.baseProfile, preset.topProfile),
  ];
  if (!res.shellActive) return { rings: outer, cyclic: false };
  const inTW = Math.max(0.006, tW - fl - wallM), inTD = Math.max(0.006, tD - fl - wallM), inBW = Math.max(0.006, hwM - wallM), inBD = Math.max(0.006, hdM - wallM), flY = Math.min(hM * 0.42, Math.max(0.006, wallM));
  return { cyclic: false, rings: [...outer, hRing(hM, inTW, inTD, 1, preset.baseProfile, preset.topProfile), hRing(lerp(flY, hM, 0.5), lerp(inBW, inTW, 0.5), lerp(inBD, inTD, 0.5), 0.5, preset.baseProfile, preset.topProfile), hRing(flY, inBW, inBD, 0, preset.baseProfile, preset.topProfile)] };
}

function buildMatedComponentMesh(b: RawSolidBuilder, preset: AtelierSolidPresetSpec, res: ResolvedBuildParams, params: AtelierSolidParams, pB: Bounds3Meters): AssemblyInterferenceReport {
  const labels: Record<AtelierSolidPresetId, readonly [string, string]> = {
    "rofan-arch-balcony": ["상단 핸드레일 바", "Top Handrail Bar"], "scifi-mech-actuator": ["동심 피스톤 샤프트", "Concentric Piston Shaft"],
    "cafe-glass-showcase": ["내부 진열 선반 트레이", "Interior Display Tray"], "precision-stylus-stand": ["동심 무게추 베이스", "Concentric Counterweight Base"],
    "handcrafted-tea-vessel": ["원형 받침 접시", "Circular Saucer Plate"],
  };
  const [ko, en] = labels[preset.id];
  const pDim = { w: round1((pB.maxX - pB.minX) * 1000), h: round1((pB.maxY - pB.minY) * 1000), d: round1((pB.maxZ - pB.minZ) * 1000) };
  if (!res.mateActive) return { mateMode: params.mateMode, mateOffsetMm: params.mateOffsetMm, matedPartNameKo: ko, matedPartNameEn: en, hasInterference: false, interferenceMm: 0, clearanceMm: 0, primaryBoundsMm: pDim, matedBoundsMm: { w: 0, h: 0, d: 0 } };
  const offM = params.mateOffsetMm * MM_TO_M, compId = b.componentNames.length;
  b.componentNames.push(en);
  let hw = Math.max(0.018, (pB.maxX - pB.minX) * 0.42), hd = Math.max(0.018, (pB.maxZ - pB.minZ) * 0.42), partH = Math.max(0.014, (pB.maxY - pB.minY) * 0.14), baseY = pB.maxY + offM;
  let shape: ProfileShapeKind = "rounded-rect";
  if (params.mateMode === "concentric") {
    const inAvail = Math.max(10, Math.min(res.widthMm, res.depthMm) * 0.5 - res.wallMm);
    const radM = preset.topology === "toroid-bore" ? clamp(inAvail - params.mateOffsetMm, 8, Math.min(res.widthMm, res.depthMm) * 0.46) * MM_TO_M : Math.max(0.018, res.widthMm * 0.24 * MM_TO_M);
    hw = radM; hd = radM; shape = "circle"; partH = preset.topology === "toroid-bore" ? res.heightMm * 1.18 * MM_TO_M : Math.max(0.014, res.heightMm * 0.16 * MM_TO_M); baseY = preset.topology === "toroid-bore" ? 0 : pB.maxY + offM;
  } else if (preset.id === "handcrafted-tea-vessel") {
    hw = res.widthMm * 0.62 * MM_TO_M; hd = res.depthMm * 0.62 * MM_TO_M; partH = 0.012; baseY = pB.minY - partH - offM; shape = "circle";
  }
  const prof = sampleProfile2D(shape, hw, hd, RING_SEGMENTS, 0.35), bev = Math.min(partH * 0.22, hw * 0.12);
  appendClosedRingSolid(b, [
    prof.map((q) => ({ x: q.x * 0.94, y: baseY, z: -q.y * 0.94 })), prof.map((q) => ({ x: q.x, y: baseY + bev, z: -q.y })),
    prof.map((q) => ({ x: q.x, y: baseY + partH - bev, z: -q.y })), prof.map((q) => ({ x: q.x * 0.94, y: baseY + partH, z: -q.y * 0.94 })),
  ], compId, false);
  const mB = measureBounds(b.positions, b.componentIds, compId), hasInterference = params.mateOffsetMm < 0;
  return {
    mateMode: params.mateMode, mateOffsetMm: params.mateOffsetMm, matedPartNameKo: ko, matedPartNameEn: en, hasInterference,
    interferenceMm: hasInterference ? Math.round(Math.abs(params.mateOffsetMm) * 100) / 100 : 0,
    clearanceMm: hasInterference ? 0 : Math.round(params.mateOffsetMm * 100) / 100,
    primaryBoundsMm: pDim, matedBoundsMm: { w: round1((mB.maxX - mB.minX) * 1000), h: round1((mB.maxY - mB.minY) * 1000), d: round1((mB.maxZ - mB.minZ) * 1000) },
  };
}

function buildAssemblyInternal(paramsInput?: Partial<AtelierSolidParams>) {
  const preset = getAtelierSolidPreset(paramsInput?.presetId ?? "rofan-arch-balcony");
  const params: AtelierSolidParams = { ...createDefaultAtelierSolidParams(preset.id), ...paramsInput, presetId: preset.id };
  const resolved = resolveFeatureEvaluations(preset, params);
  const builder: RawSolidBuilder = { positions: [], indices: [], uvs: [], componentIds: [], componentNames: [] };
  const count = resolved.patternActive ? clamp(Math.round(params.patternCount), 1, 4) : 1, spM = clamp(params.patternSpacingMm, 80, 900) * MM_TO_M;
  for (let idx = 0; idx < count; idx += 1) {
    let offset: Vec3 = { x: 0, y: 0, z: 0 }, rotY = 0;
    if (count > 1 && params.patternMode === "linear") offset = { x: (idx - (count - 1) * 0.5) * spM, y: 0, z: 0 };
    else if (count > 1 && params.patternMode === "circular") { const a = (2 * Math.PI * idx) / count, r = Math.max(spM * 0.65, resolved.widthMm * 0.72 * MM_TO_M); offset = { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r }; rotY = a; }
    const compId = builder.componentNames.length;
    builder.componentNames.push(idx === 0 ? preset.nameEn : `${preset.nameEn} #${idx + 1}`);
    const built = buildPrimaryBodyRings(preset, resolved, offset, rotY);
    appendClosedRingSolid(builder, built.rings, compId, built.cyclic);
  }
  const assembly = buildMatedComponentMesh(builder, preset, resolved, params, measureBounds(builder.positions, builder.componentIds, 0));
  return { preset, params, resolved, mesh: finalizeWatertightMesh(builder), assembly };
}

/** CPU 폴리헤드랄 메시 빌더 (1.0 = 1m, 바닥 자동 접지 minY === 0). */
export const buildWatertightSolidMesh = (paramsInput?: Partial<AtelierSolidParams>): WatertightSolidMesh => buildAssemblyInternal(paramsInput).mesh;

/** AtelierSolid Pro 전체 파라메트릭·수밀·어셈블리 통합 평가. */
export function evaluateAtelierSolidModel(paramsInput?: Partial<AtelierSolidParams>): AtelierSolidEvaluation {
  const { preset, params, resolved, mesh, assembly } = buildAssemblyInternal(paramsInput);
  const topology = verifyManifoldHalfEdgeTopology(mesh);
  const dimensionsMm = { width: round1((mesh.boundsMeters.maxX - mesh.boundsMeters.minX) * 1000), height: round1((mesh.boundsMeters.maxY - mesh.boundsMeters.minY) * 1000), depth: round1((mesh.boundsMeters.maxZ - mesh.boundsMeters.minZ) * 1000) };
  const sig = JSON.stringify({ p: params, v: topology.vertexCount, f: topology.faceCount, vol: topology.signedVolumeCm3 });
  let h = 2166136261;
  for (let i = 0; i < sig.length; i += 1) { h ^= sig.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return { preset, params, mesh, topology, features: resolved.features, assembly, guardViolations: resolved.features.filter((f) => f.status === "failed-guard"), dimensionsMm, regenHash: `aspro-${h.toString(16).padStart(8, "0")}` };
}

/** 실제 유효한 Binary STL 버퍼 생성 (80B 헤더 + uint32 삼각형 수 + 50B × N, 단위 mm). */
export function exportBinaryStlBuffer(mesh: WatertightSolidMesh, label = "AtelierSolid-Model"): Uint8Array {
  const n = mesh.triangleCount, buf = new ArrayBuffer(84 + 50 * n), view = new DataView(buf), bytes = new Uint8Array(buf);
  const hdr = `AtelierSolid KilnExport Binary STL (mm) ${label}`.slice(0, 79);
  for (let i = 0; i < hdr.length; i += 1) bytes[i] = hdr.charCodeAt(i) & 0x7f;
  view.setUint32(80, n, true);
  let off = 84;
  for (let t = 0; t < n; t += 1) {
    view.setFloat32(off, mesh.faceNormals[t * 3], true); view.setFloat32(off + 4, mesh.faceNormals[t * 3 + 1], true); view.setFloat32(off + 8, mesh.faceNormals[t * 3 + 2], true); off += 12;
    for (let k = 0; k < 3; k += 1) { const vi = mesh.indices[t * 3 + k] * 3; view.setFloat32(off, mesh.positions[vi] * 1000, true); view.setFloat32(off + 4, mesh.positions[vi + 1] * 1000, true); view.setFloat32(off + 8, mesh.positions[vi + 2] * 1000, true); off += 12; }
    view.setUint16(off, 0, true); off += 2;
  }
  return bytes;
}

export class StepAp214ExportUnavailableError extends Error {
  readonly code = "STEP_AP214_UNVERIFIED";
  readonly exportPerformed = false;
  constructor(readonly presetId: AtelierSolidPresetId) {
    super(`STEP_AP214_UNVERIFIED: ${presetId} — complete topology and import round-trip are not verified`);
    this.name = "StepAp214ExportUnavailableError";
  }
}

/** 전체 형상·AP214 재가져오기 검증 전에는 잘린 STEP 파일을 반환하지 않는다. */
export function exportStepAp214Ascii(evaluation: AtelierSolidEvaluation): never {
  throw new StepAp214ExportUnavailableError(evaluation.preset.id);
}

function projectPoint3D(p: Vec3, c: Vec3, yR: number, pR: number, mode: PerspectiveMode, sc: number, d: number, cx: number, cy: number) {
  const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, rx = dx * Math.cos(yR) - dz * Math.sin(yR), rz1 = dx * Math.sin(yR) + dz * Math.cos(yR);
  const ep = mode === "2-point" ? pR * 0.45 : pR, ry = dy * Math.cos(ep) - rz1 * Math.sin(ep), rz = dy * Math.sin(ep) + rz1 * Math.cos(ep), f = (d / Math.max(0.25, d - rz)) * sc;
  return { x: cx + rx * f, y: cy - ry * (mode === "2-point" ? sc : f), zCam: rz };
}

/** ToonStudio 독점: 1-클릭 웹툰 3D→2D LT 선화(실루엣+주름각>=30°)+2점/3점 원근선 페이로드. */
export function exportWebtoonLtLineartPayload(evaluation: AtelierSolidEvaluation, options?: LtCameraOptions): WebtoonLtLineartPayload {
  const yawDeg = options?.yawDeg ?? 34, pitchDeg = options?.pitchDeg ?? 22, creaseAngleDeg = clamp(options?.creaseAngleDeg ?? 30, 10, 85);
  const perspectiveMode: PerspectiveMode = options?.perspectiveMode ?? "2-point", width = options?.viewportWidth ?? 480, height = options?.viewportHeight ?? 320;
  const sectionActive = options?.sectionCutActive ?? false, sectionPct = clamp(options?.sectionCutPercent ?? 55, 15, 85);
  const { mesh, preset, topology } = evaluation, b = mesh.boundsMeters;
  const ctr: Vec3 = { x: (b.minX + b.maxX) * 0.5, y: (b.minY + b.maxY) * 0.5, z: (b.minZ + b.maxZ) * 0.5 };
  const span = Math.max(0.05, b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ), camD = span * 2.9, sc = (Math.min(width, height) * 0.64) / span, cx = width * 0.5, cy = height * 0.53;
  const yR = (yawDeg * Math.PI) / 180, pR = (pitchDeg * Math.PI) / 180, cutX = lerp(b.minX, b.maxX, sectionPct / 100);
  const pVerts = Array.from({ length: mesh.vertexCount }, (_, i) => projectPoint3D({ x: mesh.positions[i * 3], y: mesh.positions[i * 3 + 1], z: mesh.positions[i * 3 + 2] }, ctr, yR, pR, perspectiveMode, sc, camD, cx, cy));
  const vDir: Vec3 = { x: Math.sin(yR) * Math.cos(pR), y: Math.sin(pR), z: Math.cos(yR) * Math.cos(pR) }, lLen = Math.hypot(0.48, 0.76, 0.44);
  const triF = new Uint8Array(mesh.triangleCount), triV = new Uint8Array(mesh.triangleCount), shadedFaces: ProjectedFace2D[] = [];
  for (let t = 0; t < mesh.triangleCount; t += 1) {
    const a = mesh.indices[t * 3], bi = mesh.indices[t * 3 + 1], c = mesh.indices[t * 3 + 2];
    if (sectionActive && (mesh.positions[a * 3] + mesh.positions[bi * 3] + mesh.positions[c * 3]) / 3 > cutX) continue;
    triV[t] = 1;
    const nx = mesh.faceNormals[t * 3], ny = mesh.faceNormals[t * 3 + 1], nz = mesh.faceNormals[t * 3 + 2], front = nx * vDir.x + ny * vDir.y + nz * vDir.z > 0;
    triF[t] = front ? 1 : 0;
    if (front || sectionActive) {
      const p0 = pVerts[a], p1 = pVerts[bi], p2 = pVerts[c], compId = mesh.componentIds[a] ?? 0, sh = clamp(0.32 + ((nx * 0.48 + ny * 0.76 + nz * 0.44) / lLen) * 0.56, 0.16, 0.94);
      shadedFaces.push({ points: [{ x: round3(p0.x), y: round3(p0.y) }, { x: round3(p1.x), y: round3(p1.y) }, { x: round3(p2.x), y: round3(p2.y) }], depth: (p0.zCam + p1.zCam + p2.zCam) / 3, shade01: round3(sh), componentId: compId, fillOklch: formatOklch({ l: lerp(0.46, 0.91, sh), c: compId === 0 ? 0.045 : 0.085, h: compId === 0 ? preset.accentOklch.h : (preset.accentOklch.h + 150) % 360 }) });
    }
  }
  shadedFaces.sort((fa, fb) => fa.depth - fb.depth);
  const edgeT = new Map<number, [number, number, number, number]>();
  for (let t = 0; t < mesh.triangleCount; t += 1) {
    if (triV[t] === 0) continue;
    const a = mesh.indices[t * 3], bi = mesh.indices[t * 3 + 1], c = mesh.indices[t * 3 + 2];
    for (const [u, v] of [[a, bi], [bi, c], [c, a]] as const) { const lo = u < v ? u : v, hi = u < v ? v : u, key = lo * mesh.vertexCount + hi, prev = edgeT.get(key); if (!prev) edgeT.set(key, [lo, hi, t, -1]); else prev[3] = t; }
  }
  const silhouetteEdges: ProjectedLine2D[] = [], creaseEdges: ProjectedLine2D[] = [], contourEdges: ProjectedLine2D[] = [], creaseCos = Math.cos((creaseAngleDeg * Math.PI) / 180);
  for (const [lo, hi, t0, t1] of edgeT.values()) {
    const p0 = pVerts[lo], p1 = pVerts[hi];
    if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.75) continue;
    if (t1 < 0 || triF[t0] !== triF[t1]) silhouetteEdges.push({ x1: round3(p0.x), y1: round3(p0.y), x2: round3(p1.x), y2: round3(p1.y), kind: "silhouette", strokeWidthPx: 2.2 });
    else if (triF[t0] === 1) {
      const dot = clamp(mesh.faceNormals[t0 * 3] * mesh.faceNormals[t1 * 3] + mesh.faceNormals[t0 * 3 + 1] * mesh.faceNormals[t1 * 3 + 1] + mesh.faceNormals[t0 * 3 + 2] * mesh.faceNormals[t1 * 3 + 2], -1, 1);
      const deg = round1((Math.acos(dot) * 180) / Math.PI);
      if (dot <= creaseCos) creaseEdges.push({ x1: round3(p0.x), y1: round3(p0.y), x2: round3(p1.x), y2: round3(p1.y), kind: "crease", strokeWidthPx: 1.35, dihedralDeg: deg });
      else if (deg >= 10) contourEdges.push({ x1: round3(p0.x), y1: round3(p0.y), x2: round3(p1.x), y2: round3(p1.y), kind: "contour", strokeWidthPx: 0.7, dihedralDeg: deg });
    }
  }
  const far = span * 18;
  const makeVp = (axis: "X" | "Y" | "Z", pt: Vec3): VanishingPoint2D => { const q = projectPoint3D(pt, ctr, yR, pR, perspectiveMode, sc, camD, cx, cy); return { axis, x: round3(clamp(q.x, -width * 1.5, width * 2.5)), y: round3(clamp(q.y, -height * 1.5, height * 2.5)), inFrame: q.x >= 0 && q.x <= width && q.y >= 0 && q.y <= height }; };
  const vanishingPoints: VanishingPoint2D[] = [makeVp("X", { x: ctr.x + far, y: ctr.y, z: ctr.z }), makeVp("Z", { x: ctr.x, y: ctr.y, z: ctr.z + far })];
  if (perspectiveMode === "3-point") vanishingPoints.push(makeVp("Y", { x: ctr.x, y: ctr.y - far, z: ctr.z }));
  const perspectiveGuides = vanishingPoints.flatMap((vp) => [{ x: cx, y: cy }, { x: cx - width * 0.28, y: cy + height * 0.22 }, { x: cx + width * 0.28, y: cy + height * 0.22 }].map((an): ProjectedLine2D => ({ x1: vp.x, y1: vp.y, x2: round3(an.x), y2: round3(an.y), kind: "guide", strokeWidthPx: 0.75 })));
  return {
    schema: "toonstudio.atelier-solid-lt-lineart.v1", bridgeTarget: "AtelierStage-2D-LT", presetId: preset.id, perspectiveMode, creaseAngleDeg, viewport: { width, height },
    silhouetteEdges, creaseEdges, contourEdges, perspectiveGuides, vanishingPoints, shadedFaces,
    summary: { totalEdges: silhouetteEdges.length + creaseEdges.length + contourEdges.length, silhouetteCount: silhouetteEdges.length, creaseCount: creaseEdges.length, tonePolygonCount: shadedFaces.length, watertightVerified: topology.watertight },
  };
}

/** 원근 4방향 치수 참고도. 표시 공차는 예시값이며 정투상·제조 정밀도를 검증하지 않는다. */
export function exportEngineeringDrawingSvgSpec(evaluation: AtelierSolidEvaluation): EngineeringDrawingSpec {
  const { preset, dimensionsMm, topology, params } = evaluation;
  const gdtCallouts: GdtCalloutSpec[] = [
    { id: "gdt-w", symbol: "↔", labelKo: "전체 폭 (X)", labelEn: "Overall Width (X)", nominalMm: dimensionsMm.width, toleranceMm: 0.05, datum: "A" },
    { id: "gdt-h", symbol: "↕", labelKo: "전체 높이 (Y)", labelEn: "Overall Height (Y)", nominalMm: dimensionsMm.height, toleranceMm: 0.05, datum: "A" },
    { id: "gdt-d", symbol: "⤢", labelKo: "전체 깊이 (Z)", labelEn: "Overall Depth (Z)", nominalMm: dimensionsMm.depth, toleranceMm: 0.05, datum: "A" },
    { id: "gdt-flat", symbol: "⏥", labelKo: "바닥 접지면 평면도 (Y=0)", labelEn: "Datum Floor Flatness (Y=0)", nominalMm: 0, toleranceMm: 0.03, datum: "A" },
    { id: "gdt-perp", symbol: "⊥", labelKo: "수직도 공차", labelEn: "Perpendicularity", nominalMm: 90, toleranceMm: 0.05, datum: "A" },
  ];
  const vSpec = (id: EngineeringDrawingViewSpec["id"], titleKo: string, titleEn: string, yawDeg: number, pitchDeg: number, widthMm: number, heightMm: number): EngineeringDrawingViewSpec => {
    const p = exportWebtoonLtLineartPayload(evaluation, { yawDeg, pitchDeg, creaseAngleDeg: 28, perspectiveMode: "3-point", viewportWidth: 210, viewportHeight: 135 });
    return { id, titleKo, titleEn, lines: [...p.silhouetteEdges, ...p.creaseEdges], widthMm, heightMm };
  };
  const views: EngineeringDrawingViewSpec[] = [
    vSpec("front", "정면도 (Front XY)", "Front View (XY)", 0, 0, dimensionsMm.width, dimensionsMm.height),
    vSpec("top", "평면도 (Top XZ)", "Top View (XZ)", 0, 88, dimensionsMm.width, dimensionsMm.depth),
    vSpec("right", "우측면도 (Right ZY)", "Right View (ZY)", 90, 0, dimensionsMm.depth, dimensionsMm.height),
    vSpec("isometric", "등각투영 (Isometric)", "Isometric View", 35, 28, dimensionsMm.width, dimensionsMm.height),
  ];
  const bg = formatOklch({ l: 0.985, c: 0.005, h: 90 }), border = formatOklch({ l: 0.34, c: 0.02, h: 230 }), ink = formatOklch({ l: 0.22, c: 0.02, h: 235 }), dim = formatOklch({ l: 0.45, c: 0.14, h: 220 });
  const offsets: readonly [number, number][] = [[14, 18], [240, 18], [14, 166], [240, 166]];
  const panels = views.map((v, idx) => {
    const [ox, oy] = offsets[idx];
    const segs = v.lines.slice(0, 160).map((l) => `<line x1="${round3(ox + l.x1)}" y1="${round3(oy + l.y1)}" x2="${round3(ox + l.x2)}" y2="${round3(oy + l.y2)}" stroke="${ink}" stroke-width="${l.kind === "silhouette" ? "1.3" : "0.8"}" stroke-linecap="round"/>`).join("");
    return `<rect x="${ox}" y="${oy}" width="212" height="138" rx="4" fill="none" stroke="${border}" stroke-width="0.9"/><text x="${ox + 8}" y="${oy + 15}" font-size="9" font-family="monospace" fill="${dim}">${v.titleEn} (${v.widthMm}x${v.heightMm}mm +-0.05)</text>${segs}`;
  }).join("");
  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 468 334" data-schema="toonstudio.atelier-solid-drawing.v1" data-preset="${preset.id}"><rect x="0" y="0" width="468" height="334" fill="${bg}"/><rect x="6" y="6" width="456" height="322" fill="none" stroke="${border}" stroke-width="1.4"/>${panels}<text x="14" y="321" font-size="8.5" font-family="monospace" fill="${ink}">AtelierSolid Pro | ${preset.id} | GD&amp;T +-0.05mm | Watertight=${topology.watertight} | Vol=${topology.signedVolumeCm3}cm3 | R${params.filletRadiusMm} C${params.chamferSizeMm}</text></svg>`;
  return { schema: "toonstudio.atelier-solid-drawing.v1", presetId: preset.id, toleranceClass: "ISO-2768-f / GD&T ±0.05mm", views, gdtCallouts, svgMarkup };
}
