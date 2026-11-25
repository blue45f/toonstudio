/**
 * Wave 54B — 종이로 만드는 3D 페이퍼크래프트 전개도 & 웹툰 굿즈 디오라마 순수 결정론적 엔진.
 *
 * - 5종 웹툰 굿즈·배경 3D 로우폴리 프리셋(`PAPERCRAFT_MODEL_PRESETS`)
 * - 스패닝 트리 기반 등거리 3D→2D 전개도 계산(`unfoldPapercraftDieline`):
 *   재단 실선 · 산접기 파선 · 골접기 일점쇄선 · 쌍 번호 일치 풀칠 탭 · 페이지 분할 · 활용률 · 난이도
 * - 계층적 로드리게스 회전 기반 0%→100% 실시간 접힘 3D 투영 프리뷰(`evaluatePaperFoldPreview`)
 * - 1:1 mm 인쇄용 SVG 칼선 도면(`exportPapercraftDielineSvg`) 및 JSON 매니페스트(`exportPapercraftManifestJson`)
 */

import { MOUNTAIN_FOLD_DASH, VALLEY_FOLD_DASH, assertExportBudget, assertGeneratedResult, renderDielineSvg, serializePapercraftManifest } from "./papercraft-export-contract";

export { MOUNTAIN_FOLD_DASH, VALLEY_FOLD_DASH } from "./papercraft-export-contract";

export type PapercraftPresetId = "chibi-hero-cube" | "hanok-rooftop-diorama" | "cat-mascot-prism" | "cafe-props-set" | "fantasy-tower-mini";
export type PaperSizeId = "A4" | "A3" | "Letter";
export type PaperWeightGsm = 180 | 250 | 300;
export type FoldKind = "mountain" | "valley";
export type AssemblyDifficulty = "beginner" | "intermediate" | "advanced";
export type PapercraftFaceRole = "base" | "wall" | "roof" | "accent" | "stand";
export interface Vec2 { readonly x: number; readonly y: number; }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }
export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface PaperSizeSpec {
  readonly id: PaperSizeId; readonly labelKo: string; readonly labelEn: string;
  readonly widthMm: number; readonly heightMm: number; readonly printableMarginMm: number;
  readonly printableWidthMm: number; readonly printableHeightMm: number;
}
export interface PaperWeightSpec {
  readonly gsm: PaperWeightGsm; readonly labelKo: string; readonly labelEn: string;
  readonly thicknessMm: number; readonly foldAllowanceMm: number; readonly baseTabWidthMm: number;
  readonly scoreDepthRatio: number; readonly difficultyFactor: number;
  readonly recommendedGlueKo: string; readonly recommendedGlueEn: string;
  readonly scoringNoteKo: string; readonly scoringNoteEn: string;
}
export interface PapercraftFaceDef {
  readonly id: string; readonly islandId: string; readonly labelKo: string; readonly labelEn: string;
  readonly role: PapercraftFaceRole; readonly vertexIndices: readonly number[];
  readonly parentFaceId: string | null; readonly hingeEdgeVertices: readonly [number, number] | null;
  readonly colorOklch: OklchColor;
}
export interface PapercraftModelPreset {
  readonly id: PapercraftPresetId; readonly nameKo: string; readonly nameEn: string;
  readonly categoryKo: string; readonly categoryEn: string; readonly taglineKo: string; readonly taglineEn: string;
  readonly goodsUseKo: string; readonly goodsUseEn: string; readonly recommendedPaperWeight: PaperWeightGsm;
  readonly defaultCameraYawDeg: number; readonly defaultCameraPitchDeg: number;
  readonly accentOklch: OklchColor; readonly vertices3d: readonly Vec3[]; readonly faces: readonly PapercraftFaceDef[];
}
export interface PapercraftUnfoldInput {
  readonly presetId: PapercraftPresetId; readonly paperSize: PaperSizeId;
  readonly paperWeightGsm: PaperWeightGsm; readonly scale?: number;
}
export interface UnfoldedFace2D {
  readonly faceId: string; readonly islandId: string; readonly labelKo: string; readonly labelEn: string;
  readonly role: PapercraftFaceRole; readonly pageIndex: number; readonly polygonMm: readonly Vec2[];
  readonly centroidMm: Vec2; readonly areaMm2: number; readonly colorOklch: OklchColor;
}
export interface DielineEdge2D {
  readonly id: string; readonly faceId: string; readonly secondaryFaceId: string | null;
  readonly kind: "cut" | FoldKind; readonly pairNumber: number | null; readonly dihedralAngleDeg: number;
  readonly dashPattern: string | null; readonly pageIndex: number;
  readonly startMm: Vec2; readonly endMm: Vec2; readonly lengthMm: number;
}
export interface GlueTab2D {
  readonly tabId: string; readonly pairNumber: number; readonly hostFaceId: string; readonly targetFaceId: string;
  readonly hostEdgeId: string; readonly targetEdgeId: string; readonly pageIndex: number; readonly targetPageIndex: number;
  readonly polygonMm: readonly [Vec2, Vec2, Vec2, Vec2]; readonly labelPosMm: Vec2; readonly targetLabelPosMm: Vec2;
  readonly edgeLengthMm: number; readonly targetEdgeLengthMm: number; readonly tabWidthMm: number; readonly areaMm2: number;
}
export interface GlueTabPairIntegrity {
  readonly totalPairs: number; readonly verifiedPairs: number; readonly allPairsMatched: boolean;
  readonly unmatchedCount: number; readonly maxLengthMismatchMm: number;
}
export interface DielinePageSummary {
  readonly pageIndex: number; readonly faceIds: readonly string[]; readonly sheetOriginMm: Vec2;
  readonly usedAreaMm2: number; readonly utilizationPercent: number;
}
export interface PaperCompensationMetrics {
  readonly gsm: PaperWeightGsm; readonly thicknessMm: number; readonly foldAllowanceMm: number;
  readonly tabWidthMm: number; readonly scoreDepthRatio: number;
  readonly recommendedGlueKo: string; readonly recommendedGlueEn: string;
  readonly scoringNoteKo: string; readonly scoringNoteEn: string;
}
export interface PapercraftDielineResult {
  readonly preset: PapercraftModelPreset; readonly paperSpec: PaperSizeSpec;
  readonly paperCompensation: PaperCompensationMetrics; readonly scale: number;
  readonly faces: readonly UnfoldedFace2D[]; readonly cutEdges: readonly DielineEdge2D[];
  readonly mountainFoldEdges: readonly DielineEdge2D[]; readonly valleyFoldEdges: readonly DielineEdge2D[];
  readonly glueTabs: readonly GlueTab2D[]; readonly pairIntegrity: GlueTabPairIntegrity;
  readonly pages: readonly DielinePageSummary[]; readonly totalPages: number;
  readonly paperUtilizationPercent: number; readonly totalCutLengthMm: number; readonly totalFoldLengthMm: number;
  readonly boundingBoxMm: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number; readonly widthMm: number; readonly heightMm: number };
  readonly assemblyDifficulty: AssemblyDifficulty; readonly assemblyDifficultyLabelKo: string; readonly assemblyDifficultyLabelEn: string;
  readonly estimatedAssemblyMinutes: number;
}
export interface PaperFoldPreviewInput {
  readonly presetId: PapercraftPresetId; readonly foldProgress: number;
  readonly paperWeightGsm?: PaperWeightGsm; readonly scale?: number;
  readonly cameraYawDeg?: number; readonly cameraPitchDeg?: number;
}
export interface ProjectedFoldFace {
  readonly faceId: string; readonly islandId: string; readonly labelKo: string; readonly labelEn: string;
  readonly role: PapercraftFaceRole; readonly screenPoints: readonly Vec2[];
  readonly rimOffsetPoints: readonly Vec2[]; readonly shadowPoints: readonly Vec2[];
  readonly averageDepth: number; readonly lightFactor: number;
  readonly fillOklch: string; readonly rimOklch: string; readonly strokeOklch: string; readonly isBackfacing: boolean;
}
export interface PaperFoldPreviewResult {
  readonly presetId: PapercraftPresetId; readonly foldProgress: number; readonly foldAngleDeg: number;
  readonly cameraYawDeg: number; readonly cameraPitchDeg: number; readonly paperWeightGsm: PaperWeightGsm;
  readonly paperThicknessPx: number; readonly shadowOffsetPx: Vec2; readonly maxElevationMm: number;
  readonly viewportWidth: number; readonly viewportHeight: number; readonly faces: readonly ProjectedFoldFace[];
}

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;

const ZERO2: Vec2 = { x: 0, y: 0 };
const ZERO3: Vec3 = { x: 0, y: 0, z: 0 };
const r2 = (n: number): number => Math.round(n * 100) / 100;
const r1 = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number): number => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const mkFace = (
  id: string, islandId: string, labelKo: string, labelEn: string, role: PapercraftFaceRole,
  vertexIndices: readonly number[], parentFaceId: string | null, hingeEdgeVertices: readonly [number, number] | null,
  l: number, c: number, h: number,
): PapercraftFaceDef => ({ id, islandId, labelKo, labelEn, role, vertexIndices, parentFaceId, hingeEdgeVertices, colorOklch: { l, c, h } });

export function isVioletSlopHue(hueDeg: number): boolean {
  const norm = ((hueDeg % 360) + 360) % 360;
  return norm >= VIOLET_SLOP_MIN_HUE && norm <= VIOLET_SLOP_MAX_HUE;
}
export function sanitizeNonVioletHue(hueDeg: number): number {
  const norm = Number.isFinite(hueDeg) ? ((hueDeg % 360) + 360) % 360 : 240;
  return isVioletSlopHue(norm) ? (norm < 295 ? 252 : 342) : r1(norm);
}
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = clamp(color.l, 0, 1).toFixed(2);
  const c = clamp(color.c, 0, 0.32).toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
  const h = sanitizeNonVioletHue(color.h);
  return alpha !== undefined && alpha < 0.999 ? `oklch(${l} ${c} ${h} / ${clamp(alpha, 0, 1).toFixed(2)})` : `oklch(${l} ${c} ${h})`;
}

export const PAPER_SIZE_SPECS: readonly [PaperSizeSpec, PaperSizeSpec, PaperSizeSpec] = [
  { id: "A4", labelKo: "A4 (210×297mm)", labelEn: "A4 (210×297mm)", widthMm: 210, heightMm: 297, printableMarginMm: 10, printableWidthMm: 190, printableHeightMm: 277 },
  { id: "A3", labelKo: "A3 (297×420mm)", labelEn: "A3 (297×420mm)", widthMm: 297, heightMm: 420, printableMarginMm: 10, printableWidthMm: 277, printableHeightMm: 400 },
  { id: "Letter", labelKo: "Letter (215.9×279.4mm)", labelEn: "Letter (215.9×279.4mm)", widthMm: 215.9, heightMm: 279.4, printableMarginMm: 10, printableWidthMm: 195.9, printableHeightMm: 259.4 },
] as const;

export const PAPER_WEIGHT_SPECS: readonly [PaperWeightSpec, PaperWeightSpec, PaperWeightSpec] = [
  {
    gsm: 180, labelKo: "180gsm 도화지", labelEn: "180gsm Light Card",
    thicknessMm: 0.22, foldAllowanceMm: 0.28, baseTabWidthMm: 6.5, scoreDepthRatio: 0.35, difficultyFactor: 0.92,
    recommendedGlueKo: "목공용 백색 풀 · 얇은 양면테이프", recommendedGlueEn: "White PVA glue or thin tape",
    scoringNoteKo: "가벼운 송곳 누름선만으로 깔끔하게 접힘", scoringNoteEn: "Clean bend with light stylus score",
  },
  {
    gsm: 250, labelKo: "250gsm 탄트·머메이드지", labelEn: "250gsm Craft Cardstock",
    thicknessMm: 0.31, foldAllowanceMm: 0.42, baseTabWidthMm: 8.0, scoreDepthRatio: 0.45, difficultyFactor: 1.0,
    recommendedGlueKo: "속건성 목공본드(백색 PVA)", recommendedGlueEn: "Fast-grab PVA craft glue",
    scoringNoteKo: "산접기는 겉면, 골접기는 뒷면 스코어링 권장", scoringNoteEn: "Score mountain on front, valley on back",
  },
  {
    gsm: 300, labelKo: "300gsm 아트보드", labelEn: "300gsm Heavy Diorama Board",
    thicknessMm: 0.38, foldAllowanceMm: 0.56, baseTabWidthMm: 9.5, scoreDepthRatio: 0.55, difficultyFactor: 1.15,
    recommendedGlueKo: "공예용 접착제 · 제조사 사용법 확인", recommendedGlueEn: "Craft adhesive · follow its instructions",
    scoringNoteKo: "가정 공차(+0.56mm) · 종이별 접힘 시험 필요", scoringNoteEn: "Assumed +0.56mm allowance · test the chosen stock",
  },
] as const;

function buildHexCafePreset(): PapercraftModelPreset {
  const vertices: Vec3[] = [
    ...Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return v3(r2(-24 + 13 * Math.cos(a)), r2(13 * Math.sin(a)), 0); }),
    ...Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return v3(r2(-24 + 17.5 * Math.cos(a)), r2(17.5 * Math.sin(a)), 40); }),
    v3(10, -11, 0), v3(36, -11, 0), v3(10, 0, 34), v3(36, 0, 34), v3(10, 11, 0), v3(36, 11, 0),
    v3(10, -19, 0), v3(36, -19, 0), v3(10, 19, 0), v3(36, 19, 0),
  ];
  return {
    id: "cafe-props-set", nameKo: "웹툰 카페 소품 세트", nameEn: "Webtoon Cafe Props Set",
    categoryKo: "일상 · 소품 디오라마", categoryEn: "Slice-of-Life Props",
    taglineKo: "육각 테이크아웃 커피컵과 A-프레임 입간판 2종 미니 세트", taglineEn: "Hexagonal coffee cup & A-frame menu chalkboard duo",
    goodsUseKo: "로맨스·일상툰 팝업스토어 포토존 미니어처", goodsUseEn: "Popup-store desk prop & romance scene mini",
    recommendedPaperWeight: 250, defaultCameraYawDeg: -34, defaultCameraPitchDeg: 28,
    accentOklch: { l: 0.56, c: 0.11, h: 148 }, vertices3d: vertices,
    faces: [
      mkFace("cup-base", "cafe-cup", "컵 바닥", "Cup Base", "base", [0, 5, 4, 3, 2, 1], null, null, 0.78, 0.055, 68),
      mkFace("cup-wall-0", "cafe-cup", "컵 전면", "Cup Front", "wall", [0, 1, 7, 6], "cup-base", [1, 0], 0.72, 0.09, 148),
      mkFace("cup-wall-1", "cafe-cup", "컵 우측1", "Cup R1", "wall", [1, 2, 8, 7], "cup-wall-0", [1, 7], 0.82, 0.065, 64),
      mkFace("cup-wall-2", "cafe-cup", "컵 우측2", "Cup R2", "wall", [2, 3, 9, 8], "cup-wall-1", [2, 8], 0.72, 0.09, 148),
      mkFace("cup-wall-5", "cafe-cup", "컵 좌측1", "Cup L1", "wall", [5, 0, 6, 11], "cup-wall-0", [6, 0], 0.82, 0.065, 64),
      mkFace("cup-wall-4", "cafe-cup", "컵 좌측2", "Cup L2", "wall", [4, 5, 11, 10], "cup-wall-5", [11, 5], 0.72, 0.09, 148),
      mkFace("cup-wall-3", "cafe-cup", "컵 후면", "Cup Back", "wall", [3, 4, 10, 9], "cup-wall-4", [10, 4], 0.82, 0.065, 64),
      mkFace("cup-lid", "cafe-cup", "컵 뚜껑", "Cup Lid", "roof", [6, 7, 8, 9, 10, 11], "cup-wall-0", [7, 6], 0.91, 0.015, 86),
      mkFace("sign-ledge-front", "cafe-sign", "앞 받침대", "Front Ledge", "stand", [18, 19, 13, 12], null, null, 0.74, 0.085, 52),
      mkFace("sign-front", "cafe-sign", "칠판 앞면", "Menu Front", "wall", [12, 13, 15, 14], "sign-ledge-front", [13, 12], 0.38, 0.032, 232),
      mkFace("sign-back", "cafe-sign", "칠판 뒷면", "Menu Back", "wall", [17, 16, 14, 15], "sign-front", [15, 14], 0.38, 0.032, 232),
      mkFace("sign-ledge-back", "cafe-sign", "뒤 받침대", "Back Ledge", "stand", [16, 17, 21, 20], "sign-back", [17, 16], 0.74, 0.085, 52),
    ],
  };
}

export const PAPERCRAFT_MODEL_PRESETS: readonly [
  PapercraftModelPreset, PapercraftModelPreset, PapercraftModelPreset, PapercraftModelPreset, PapercraftModelPreset,
] = [
  {
    id: "chibi-hero-cube", nameKo: "SD 주인공 큐브 피규어", nameEn: "Chibi Hero Cube Figure",
    categoryKo: "캐릭터 굿즈 · 페이퍼토이", categoryEn: "Character Papertoy",
    taglineKo: "웹툰 주인공 SD 큐브 본체 + 접이식 배경 스탠드 2파트 구성", taglineEn: "SD protagonist cube figure with folding backdrop easel",
    goodsUseKo: "단행본 초판 부록 · 팬미팅 조립 키트", goodsUseEn: "First-edition book insert & fan event kit",
    recommendedPaperWeight: 250, defaultCameraYawDeg: -38, defaultCameraPitchDeg: 26, accentOklch: { l: 0.62, c: 0.16, h: 36 },
    vertices3d: [
      v3(-21, -21, 0), v3(21, -21, 0), v3(21, 21, 0), v3(-21, 21, 0), v3(-21, -21, 42), v3(21, -21, 42), v3(21, 21, 42), v3(-21, 21, 42),
      v3(-26, 28, 0), v3(26, 28, 0), v3(26, 50, 0), v3(-26, 50, 0), v3(-26, 50, 50), v3(26, 50, 50),
    ],
    faces: [
      mkFace("hero-base", "hero-cube", "바닥면", "Base", "base", [0, 3, 2, 1], null, null, 0.48, 0.08, 224),
      mkFace("hero-front", "hero-cube", "정면 얼굴", "Front Face", "accent", [0, 1, 5, 4], "hero-base", [1, 0], 0.88, 0.065, 58),
      mkFace("hero-right", "hero-cube", "우측면", "Right Side", "wall", [1, 2, 6, 5], "hero-base", [2, 1], 0.68, 0.145, 36),
      mkFace("hero-back", "hero-cube", "뒷면", "Back Side", "wall", [2, 3, 7, 6], "hero-base", [3, 2], 0.64, 0.135, 36),
      mkFace("hero-left", "hero-cube", "좌측면", "Left Side", "wall", [3, 0, 4, 7], "hero-base", [0, 3], 0.68, 0.145, 36),
      mkFace("hero-top", "hero-cube", "정수리", "Crown Top", "roof", [4, 5, 6, 7], "hero-back", [7, 6], 0.34, 0.055, 234),
      mkFace("stand-floor", "hero-stand", "스탠드 바닥", "Stand Floor", "stand", [8, 9, 10, 11], null, null, 0.84, 0.03, 86),
      mkFace("stand-backdrop", "hero-stand", "배경 패널", "Backdrop", "stand", [11, 10, 13, 12], "stand-floor", [10, 11], 0.78, 0.075, 196),
      mkFace("stand-wing-l", "hero-stand", "좌 지지 날개", "Left Gusset", "stand", [8, 11, 12], "stand-backdrop", [12, 11], 0.74, 0.06, 196),
      mkFace("stand-wing-r", "hero-stand", "우 지지 날개", "Right Gusset", "stand", [10, 9, 13], "stand-backdrop", [10, 13], 0.74, 0.06, 196),
    ],
  },
  {
    id: "hanok-rooftop-diorama", nameKo: "한옥 기와지붕 디오라마", nameEn: "Hanok Giwa Roof Diorama",
    categoryKo: "사극 · 배경 미니어처", categoryEn: "Historical Architecture",
    taglineKo: "처마가 오목하게 반전되는 전통 한옥 곡면 지붕(골접기)과 박공벽", taglineEn: "Concave Korean Hanok tiled roof eaves with valley-fold curvature",
    goodsUseKo: "사극·동양풍 배경 레퍼런스 및 전시 미니어처", goodsUseEn: "Historical webtoon reference & display diorama",
    recommendedPaperWeight: 300, defaultCameraYawDeg: -42, defaultCameraPitchDeg: 27, accentOklch: { l: 0.46, c: 0.065, h: 226 },
    vertices3d: [
      v3(-28, -20, 0), v3(28, -20, 0), v3(28, 20, 0), v3(-28, 20, 0), v3(-28, -20, 22), v3(28, -20, 22), v3(28, 20, 22), v3(-28, 20, 22),
      v3(-28, -10, 26), v3(28, -10, 26), v3(28, 10, 26), v3(-28, 10, 26), v3(-28, 0, 40), v3(28, 0, 40),
    ],
    faces: [
      mkFace("hanok-floor", "hanok-main", "대청 바닥", "Floor", "base", [0, 3, 2, 1], null, null, 0.72, 0.065, 72),
      mkFace("hanok-wall-f", "hanok-main", "전면 창호벽", "Front Lattice", "wall", [0, 1, 5, 4], "hanok-floor", [1, 0], 0.9, 0.024, 86),
      mkFace("hanok-wall-b", "hanok-main", "후면 벽체", "Back Wall", "wall", [2, 3, 7, 6], "hanok-floor", [3, 2], 0.87, 0.026, 86),
      mkFace("hanok-gable-l", "hanok-main", "좌측 박공벽", "Left Gable", "wall", [3, 0, 4, 8, 12, 11, 7], "hanok-floor", [0, 3], 0.84, 0.036, 78),
      mkFace("hanok-gable-r", "hanok-main", "우측 박공벽", "Right Gable", "wall", [1, 2, 6, 10, 13, 9, 5], "hanok-floor", [2, 1], 0.84, 0.036, 78),
      mkFace("hanok-eave-f", "hanok-main", "전면 처마 기와", "Front Eave", "roof", [4, 5, 9, 8], "hanok-wall-f", [5, 4], 0.44, 0.042, 230),
      mkFace("hanok-upper-f", "hanok-main", "전면 상단 기와", "Front Roof", "roof", [8, 9, 13, 12], "hanok-eave-f", [9, 8], 0.36, 0.038, 232),
      mkFace("hanok-eave-b", "hanok-main", "후면 처마 기와", "Back Eave", "roof", [6, 7, 11, 10], "hanok-wall-b", [7, 6], 0.44, 0.042, 230),
      mkFace("hanok-upper-b", "hanok-main", "후면 상단 기와", "Back Roof", "roof", [10, 11, 12, 13], "hanok-eave-b", [11, 10], 0.36, 0.038, 232),
    ],
  },
  {
    id: "cat-mascot-prism", nameKo: "마스코트 고양이 프리즘", nameEn: "Mascot Cat Prism",
    categoryKo: "마스코트 · 데스크 굿즈", categoryEn: "Mascot Desk Goods",
    taglineKo: "쫑긋 선 고양이 두 귀 사이의 오목한 정수리(골접기) 로우폴리 프리즘", taglineEn: "Tapered low-poly cat mascot prism with recessed valley-fold ears",
    goodsUseKo: "작가 채널 마스코트 · 크라우드펀딩 리워드", goodsUseEn: "Creator mascot reward & desk companion",
    recommendedPaperWeight: 180, defaultCameraYawDeg: -32, defaultCameraPitchDeg: 24, accentOklch: { l: 0.72, c: 0.125, h: 58 },
    vertices3d: [
      v3(-18, -15, 0), v3(18, -15, 0), v3(18, 15, 0), v3(-18, 15, 0),
      v3(-14, -11, 44), v3(-6, -11, 33), v3(6, -11, 33), v3(14, -11, 44),
      v3(-14, 11, 44), v3(-6, 11, 33), v3(6, 11, 33), v3(14, 11, 44),
    ],
    faces: [
      mkFace("cat-base", "cat-body", "바닥면", "Base", "base", [0, 3, 2, 1], null, null, 0.8, 0.06, 66),
      mkFace("cat-front", "cat-body", "고양이 얼굴", "Cat Face", "accent", [0, 1, 7, 6, 5, 4], "cat-base", [1, 0], 0.9, 0.065, 68),
      mkFace("cat-back", "cat-body", "뒷면 줄무늬", "Back Stripes", "wall", [2, 3, 8, 9, 10, 11], "cat-base", [3, 2], 0.78, 0.11, 56),
      mkFace("cat-side-l", "cat-body", "좌측면", "Left Side", "wall", [3, 0, 4, 8], "cat-base", [0, 3], 0.82, 0.1, 58),
      mkFace("cat-side-r", "cat-body", "우측면", "Right Side", "wall", [1, 2, 11, 7], "cat-base", [2, 1], 0.82, 0.1, 58),
      mkFace("cat-crown", "cat-body", "정수리 홈", "Crown Bridge", "roof", [5, 6, 10, 9], "cat-back", [9, 10], 0.86, 0.075, 62),
      mkFace("cat-ear-l", "cat-body", "왼쪽 귀 안쪽", "Left Inner Ear", "accent", [4, 5, 9, 8], "cat-crown", [9, 5], 0.82, 0.11, 24),
      mkFace("cat-ear-r", "cat-body", "오른쪽 귀 안쪽", "Right Inner Ear", "accent", [6, 7, 11, 10], "cat-crown", [6, 10], 0.82, 0.11, 24),
    ],
  },
  buildHexCafePreset(),
  {
    id: "fantasy-tower-mini", nameKo: "판타지 첨탑 미니어처", nameEn: "Fantasy Spire Tower Mini",
    categoryKo: "판타지 · 세계관 디오라마", categoryEn: "Fantasy World Miniature",
    taglineKo: "4면 성벽·돌출 흉벽(골접기 4곳)·뾰족 첨탑이 별 모양으로 펼쳐지는 구조", taglineEn: "Star-net medieval keep with 4 flared valley parapets & tall spire",
    goodsUseKo: "판타지 웹툰 세계관 지도 · 보드게임 탑 피스", goodsUseEn: "Fantasy map landmark & tabletop piece",
    recommendedPaperWeight: 300, defaultCameraYawDeg: -45, defaultCameraPitchDeg: 24, accentOklch: { l: 0.5, c: 0.115, h: 218 },
    vertices3d: [
      v3(-16, -16, 0), v3(16, -16, 0), v3(16, 16, 0), v3(-16, 16, 0), v3(-16, -16, 40), v3(16, -16, 40), v3(16, 16, 40), v3(-16, 16, 40),
      v3(-21, -21, 47), v3(21, -21, 47), v3(21, 21, 47), v3(-21, 21, 47), v3(0, 0, 86),
    ],
    faces: [
      mkFace("tower-base", "tower-main", "기단 바닥", "Base", "base", [0, 3, 2, 1], null, null, 0.68, 0.025, 86),
      mkFace("keep-f", "tower-main", "전면 성벽", "Front Keep", "wall", [0, 1, 5, 4], "tower-base", [1, 0], 0.8, 0.025, 84),
      mkFace("keep-r", "tower-main", "우측 성벽", "Right Keep", "wall", [1, 2, 6, 5], "tower-base", [2, 1], 0.77, 0.025, 84),
      mkFace("keep-b", "tower-main", "후면 성벽", "Back Keep", "wall", [2, 3, 7, 6], "tower-base", [3, 2], 0.75, 0.025, 84),
      mkFace("keep-l", "tower-main", "좌측 성벽", "Left Keep", "wall", [3, 0, 4, 7], "tower-base", [0, 3], 0.77, 0.025, 84),
      mkFace("parapet-f", "tower-main", "전면 흉벽", "Front Parapet", "accent", [4, 5, 9, 8], "keep-f", [5, 4], 0.7, 0.05, 66),
      mkFace("parapet-r", "tower-main", "우측 흉벽", "Right Parapet", "accent", [5, 6, 10, 9], "keep-r", [6, 5], 0.68, 0.05, 66),
      mkFace("parapet-b", "tower-main", "후면 흉벽", "Back Parapet", "accent", [6, 7, 11, 10], "keep-b", [7, 6], 0.66, 0.05, 66),
      mkFace("parapet-l", "tower-main", "좌측 흉벽", "Left Parapet", "accent", [7, 4, 8, 11], "keep-l", [4, 7], 0.68, 0.05, 66),
      mkFace("spire-f", "tower-main", "전면 첨탑", "Front Spire", "roof", [8, 9, 12], "parapet-f", [9, 8], 0.48, 0.11, 220),
      mkFace("spire-r", "tower-main", "우측 첨탑", "Right Spire", "roof", [9, 10, 12], "parapet-r", [10, 9], 0.44, 0.11, 220),
      mkFace("spire-b", "tower-main", "후면 첨탑", "Back Spire", "roof", [10, 11, 12], "parapet-b", [11, 10], 0.42, 0.105, 220),
      mkFace("spire-l", "tower-main", "좌측 첨탑", "Left Spire", "roof", [11, 8, 12], "parapet-l", [8, 11], 0.44, 0.11, 220),
    ],
  },
] as const;

export const getPapercraftPreset = (id: PapercraftPresetId): PapercraftModelPreset => structuredClone(PAPERCRAFT_MODEL_PRESETS.find((p) => p.id === id) ?? PAPERCRAFT_MODEL_PRESETS[0]);
export const getPaperSizeSpec = (id: PaperSizeId): PaperSizeSpec => structuredClone(PAPER_SIZE_SPECS.find((s) => s.id === id) ?? PAPER_SIZE_SPECS[0]);
export const getPaperWeightSpec = (gsm: PaperWeightGsm): PaperWeightSpec => structuredClone(PAPER_WEIGHT_SPECS.find((w) => w.gsm === gsm) ?? PAPER_WEIGHT_SPECS[1]);

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm3 = (a: Vec3): Vec3 => { const l = Math.hypot(a.x, a.y, a.z); return l > 1e-9 ? scale3(a, 1 / l) : v3(0, 0, 1); };
const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);
const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
const at3 = (arr: readonly Vec3[], idx: number): Vec3 => arr[idx] ?? ZERO3;
const at2 = (arr: readonly Vec2[], idx: number): Vec2 => arr[idx] ?? ZERO2;

function rotateAroundAxis(p: Vec3, origin: Vec3, axis: Vec3, angleRad: number): Vec3 {
  if (Math.abs(angleRad) < 1e-10) return p;
  const v = sub3(p, origin); const c = Math.cos(angleRad); const s = Math.sin(angleRad);
  const kv = cross3(axis, v); const kd = dot3(axis, v) * (1 - c);
  return add3(origin, v3(v.x * c + kv.x * s + axis.x * kd, v.y * c + kv.y * s + axis.y * kd, v.z * c + kv.z * s + axis.z * kd));
}
function computeNewellNormal(pts: readonly Vec3[]): Vec3 {
  let nx = 0; let ny = 0; let nz = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = at3(pts, i); const b = at3(pts, (i + 1) % pts.length);
    nx += (a.y - b.y) * (a.z + b.z); ny += (a.z - b.z) * (a.x + b.x); nz += (a.x - b.x) * (a.y + b.y);
  }
  return norm3(v3(nx, ny, nz));
}
function polygonArea2D(pts: readonly Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) { const a = at2(pts, i); const b = at2(pts, (i + 1) % pts.length); area += a.x * b.y - b.x * a.y; }
  return Math.abs(area) * 0.5;
}
function polygonCentroid2D(pts: readonly Vec2[]): Vec2 {
  let sx = 0; let sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  const n = Math.max(1, pts.length);
  return { x: r2(sx / n), y: r2(sy / n) };
}

interface UnfoldedFaceInternal {
  readonly def: PapercraftFaceDef; readonly index: number; readonly normal3d: Vec3; readonly dihedralRad: number;
  readonly pts2d: readonly Vec2[]; readonly flatPts3d: readonly Vec3[];
  readonly hingeOriginFlat3d: Vec3 | null; readonly hingeAxisFlat3d: Vec3 | null;
}

function unfoldPresetTopology(preset: PapercraftModelPreset, scale: number): readonly UnfoldedFaceInternal[] {
  const scaled = preset.vertices3d.map((v) => scale3(v, scale));
  const normals = new Map<string, Vec3>(preset.faces.map((f) => [f.id, computeNewellNormal(f.vertexIndices.map((idx) => at3(scaled, idx)))]));
  const rootBases = new Map<string, { origin: Vec3; eU: Vec3; eV: Vec3 }>();
  const resolved = new Map<string, UnfoldedFaceInternal>();
  const list: UnfoldedFaceInternal[] = [];

  for (let i = 0; i < preset.faces.length; i += 1) {
    const def = preset.faces[i];
    if (!def) continue;
    const normal3d = normals.get(def.id) ?? v3(0, 0, 1);
    if (def.parentFaceId === null || def.hingeEdgeVertices === null) {
      const origin = at3(scaled, def.vertexIndices[0] ?? 0);
      const eU = Math.abs(normal3d.z) > 0.99 ? v3(1, 0, 0) : norm3(sub3(at3(scaled, def.vertexIndices[1] ?? 0), origin));
      const eV = norm3(cross3(normal3d, eU));
      rootBases.set(def.islandId, { origin, eU, eV });
      const pts2d = def.vertexIndices.map((vi) => { const d = sub3(at3(scaled, vi), origin); return { x: dot3(d, eU), y: dot3(d, eV) }; });
      const flatPts3d = pts2d.map((p) => add3(origin, add3(scale3(eU, p.x), scale3(eV, p.y))));
      const item: UnfoldedFaceInternal = { def, index: i, normal3d, dihedralRad: 0, pts2d, flatPts3d, hingeOriginFlat3d: null, hingeAxisFlat3d: null };
      resolved.set(def.id, item); list.push(item); continue;
    }
    const parent = resolved.get(def.parentFaceId); const basis = rootBases.get(def.islandId);
    if (!parent || !basis) continue;
    const [vA, vB] = def.hingeEdgeVertices;
    const pA = parent.def.vertexIndices.indexOf(vA); const pB = parent.def.vertexIndices.indexOf(vB);
    const a2d = at2(parent.pts2d, pA); const b2d = at2(parent.pts2d, pB);
    const a3d = at3(scaled, vA); const b3d = at3(scaled, vB);
    const e3d = norm3(sub3(b3d, a3d)); const w3d = norm3(cross3(e3d, normal3d));
    const elen = Math.max(1e-9, dist2(a2d, b2d));
    const e2d: Vec2 = { x: (b2d.x - a2d.x) / elen, y: (b2d.y - a2d.y) / elen };
    const w2d: Vec2 = { x: e2d.y, y: -e2d.x };
    const dihedralRad = Math.atan2(dot3(cross3(parent.normal3d, normal3d), e3d), dot3(parent.normal3d, normal3d));
    const pts2d = def.vertexIndices.map((vi) => {
      const d = sub3(at3(scaled, vi), a3d); const s = dot3(d, e3d); const t = dot3(d, w3d);
      return { x: a2d.x + s * e2d.x + t * w2d.x, y: a2d.y + s * e2d.y + t * w2d.y };
    });
    const flatPts3d = pts2d.map((p) => add3(basis.origin, add3(scale3(basis.eU, p.x), scale3(basis.eV, p.y))));
    const item: UnfoldedFaceInternal = {
      def, index: i, normal3d, dihedralRad, pts2d, flatPts3d,
      hingeOriginFlat3d: at3(parent.flatPts3d, pA), hingeAxisFlat3d: norm3(sub3(at3(parent.flatPts3d, pB), at3(parent.flatPts3d, pA))),
    };
    resolved.set(def.id, item); list.push(item);
  }
  return list;
}

/** 3D 로우폴리 모델을 용지·평량·스케일에 맞춰 2D 페이퍼크래프트 전개도로 변환한다. */
export function unfoldPapercraftDieline(input: PapercraftUnfoldInput): PapercraftDielineResult {
  const preset = getPapercraftPreset(input.presetId);
  const paperSpec = getPaperSizeSpec(input.paperSize);
  const weightSpec = getPaperWeightSpec(input.paperWeightGsm);
  const scale = r2(clamp(input.scale ?? 1.0, 0.5, 2.5));
  const tabWidthMm = r2(weightSpec.baseTabWidthMm * clamp(scale, 0.72, 1.45));
  const paperCompensation: PaperCompensationMetrics = {
    gsm: weightSpec.gsm, thicknessMm: weightSpec.thicknessMm, foldAllowanceMm: weightSpec.foldAllowanceMm, tabWidthMm,
    scoreDepthRatio: weightSpec.scoreDepthRatio, recommendedGlueKo: weightSpec.recommendedGlueKo,
    recommendedGlueEn: weightSpec.recommendedGlueEn, scoringNoteKo: weightSpec.scoringNoteKo, scoringNoteEn: weightSpec.scoringNoteEn,
  };

  const unfoldedFaces = unfoldPresetTopology(preset, scale);
  const margin = paperSpec.printableMarginMm;
  const tabPad = tabWidthMm + weightSpec.foldAllowanceMm * 2;
  const islandGap = 8 + weightSpec.foldAllowanceMm * 2;
  const islandBoxes = Array.from(new Set(unfoldedFaces.map((f) => f.def.islandId))).map((islandId) => {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const f of unfoldedFaces) {
      if (f.def.islandId !== islandId) continue;
      for (const p of f.pts2d) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, -p.y); maxY = Math.max(maxY, -p.y); }
    }
    return { islandId, minX: minX - tabPad, minY: minY - tabPad, width: maxX - minX + tabPad * 2, height: maxY - minY + tabPad * 2 };
  });

  const placement = new Map<string, { readonly pageIndex: number; readonly dx: number; readonly dy: number; readonly tilesX: number }>();
  const pageOrigins = new Map<number, Vec2>([[0, ZERO2]]);
  let curPage = 0; let cx = margin; let cy = margin; let rowH = 0; let totalPages = 1;
  for (const box of islandBoxes) {
    if (curPage >= totalPages) { totalPages = curPage + 1; pageOrigins.set(curPage, ZERO2); }
    const txN = Math.max(1, Math.ceil(box.width / paperSpec.printableWidthMm));
    const tyN = Math.max(1, Math.ceil(box.height / paperSpec.printableHeightMm));
    if (txN > 1 || tyN > 1) {
      if (cx > margin || cy > margin) { curPage = totalPages; totalPages += 1; }
      for (let ty = 0; ty < tyN; ty += 1) {
        for (let tx = 0; tx < txN; tx += 1) pageOrigins.set(curPage + ty * txN + tx, { x: r2(tx * paperSpec.printableWidthMm), y: r2(ty * paperSpec.printableHeightMm) });
      }
      placement.set(box.islandId, { pageIndex: curPage, dx: margin - box.minX, dy: margin - box.minY, tilesX: txN });
      totalPages = Math.max(totalPages, curPage + txN * tyN);
      curPage = totalPages; cx = margin; cy = margin; rowH = 0; continue;
    }
    if (cx + box.width > paperSpec.widthMm - margin + 0.01) { cx = margin; cy += rowH + islandGap; rowH = 0; }
    if (cy + box.height > paperSpec.heightMm - margin + 0.01) {
      curPage = totalPages; totalPages += 1; cx = margin; cy = margin; rowH = 0; pageOrigins.set(curPage, ZERO2);
    }
    placement.set(box.islandId, { pageIndex: curPage, dx: cx - box.minX, dy: cy - box.minY, tilesX: 1 });
    cx += box.width + islandGap; rowH = Math.max(rowH, box.height);
  }

  const faceMap = new Map<string, UnfoldedFace2D>();
  const faces: UnfoldedFace2D[] = unfoldedFaces.map((uf) => {
    const pl = placement.get(uf.def.islandId) ?? { pageIndex: 0, dx: margin, dy: margin, tilesX: 1 };
    const poly = uf.pts2d.map((p) => ({ x: r2(p.x + pl.dx), y: r2(-p.y + pl.dy) }));
    const centroid = polygonCentroid2D(poly);
    const tc = Math.max(0, Math.floor((centroid.x - margin) / paperSpec.printableWidthMm));
    const tr = Math.max(0, Math.floor((centroid.y - margin) / paperSpec.printableHeightMm));
    const face: UnfoldedFace2D = {
      faceId: uf.def.id, islandId: uf.def.islandId, labelKo: uf.def.labelKo, labelEn: uf.def.labelEn,
      role: uf.def.role, pageIndex: Math.min(totalPages - 1, pl.pageIndex + tr * pl.tilesX + tc),
      polygonMm: poly, centroidMm: centroid, areaMm2: r2(polygonArea2D(poly)), colorOklch: uf.def.colorOklch,
    };
    faceMap.set(uf.def.id, face);
    return face;
  });

  const hingeByKey = new Map<string, { readonly childFace: UnfoldedFaceInternal; readonly parentFaceId: string }>();
  for (const uf of unfoldedFaces) {
    if (uf.def.parentFaceId && uf.def.hingeEdgeVertices) hingeByKey.set(edgeKey(uf.def.hingeEdgeVertices[0], uf.def.hingeEdgeVertices[1]), { childFace: uf, parentFaceId: uf.def.parentFaceId });
  }

  interface EdgeOcc { readonly faceId: string; readonly faceIndex: number; readonly edgeIndex: number; readonly pageIndex: number; readonly startMm: Vec2; readonly endMm: Vec2; readonly lengthMm: number; }
  const edgeOccs = new Map<string, EdgeOcc[]>();
  for (const uf of unfoldedFaces) {
    const f2 = faceMap.get(uf.def.id);
    if (!f2) continue;
    const n = uf.def.vertexIndices.length;
    for (let e = 0; e < n; e += 1) {
      const k = edgeKey(uf.def.vertexIndices[e] ?? 0, uf.def.vertexIndices[(e + 1) % n] ?? 0);
      const startMm = at2(f2.polygonMm, e); const endMm = at2(f2.polygonMm, (e + 1) % n);
      const arr = edgeOccs.get(k) ?? [];
      arr.push({ faceId: uf.def.id, faceIndex: uf.index, edgeIndex: e, pageIndex: f2.pageIndex, startMm, endMm, lengthMm: r2(dist2(startMm, endMm)) });
      edgeOccs.set(k, arr);
    }
  }

  const cutEdges: DielineEdge2D[] = [];
  const mountainFoldEdges: DielineEdge2D[] = [];
  const valleyFoldEdges: DielineEdge2D[] = [];
  const glueTabs: GlueTab2D[] = [];
  let pairSeq = 0; let edgeSeq = 0; let maxMismatch = 0;

  for (const [k, occs] of edgeOccs.entries()) {
    const hinge = hingeByKey.get(k);
    const first = occs[0];
    if (hinge && occs.length >= 2 && first) {
      const primary = occs.find((o) => o.faceId === hinge.parentFaceId) ?? first;
      const kind: FoldKind = hinge.childFace.dihedralRad >= 0 ? "mountain" : "valley";
      (kind === "mountain" ? mountainFoldEdges : valleyFoldEdges).push({
        id: `fold-${(edgeSeq += 1)}`, faceId: primary.faceId, secondaryFaceId: hinge.childFace.def.id, kind,
        pairNumber: null, dihedralAngleDeg: r1((hinge.childFace.dihedralRad * 180) / Math.PI),
        dashPattern: kind === "mountain" ? MOUNTAIN_FOLD_DASH : VALLEY_FOLD_DASH,
        pageIndex: primary.pageIndex, startMm: primary.startMm, endMm: primary.endMm, lengthMm: primary.lengthMm,
      });
      continue;
    }
    if (occs.length === 2) {
      const sorted = [...occs].sort((a, b) => a.faceIndex - b.faceIndex || a.edgeIndex - b.edgeIndex);
      const host = sorted[0]; const target = sorted[1];
      if (!host || !target) continue;
      pairSeq += 1;
      const hostEdgeId = `cut-${(edgeSeq += 1)}`; const targetEdgeId = `cut-${(edgeSeq += 1)}`;
      cutEdges.push(
        { id: hostEdgeId, faceId: host.faceId, secondaryFaceId: target.faceId, kind: "cut", pairNumber: pairSeq, dihedralAngleDeg: 0, dashPattern: null, pageIndex: host.pageIndex, startMm: host.startMm, endMm: host.endMm, lengthMm: host.lengthMm },
        { id: targetEdgeId, faceId: target.faceId, secondaryFaceId: host.faceId, kind: "cut", pairNumber: pairSeq, dihedralAngleDeg: 0, dashPattern: null, pageIndex: target.pageIndex, startMm: target.startMm, endMm: target.endMm, lengthMm: target.lengthMm },
      );
      const dx = host.endMm.x - host.startMm.x; const dy = host.endMm.y - host.startMm.y;
      const len = Math.max(1e-6, Math.hypot(dx, dy)); const ux = dx / len; const uy = dy / len;
      const midHX = (host.startMm.x + host.endMm.x) * 0.5; const midHY = (host.startMm.y + host.endMm.y) * 0.5;
      const hc = faceMap.get(host.faceId)?.centroidMm ?? { x: midHX, y: midHY };
      const sign = uy * (hc.x - midHX) - ux * (hc.y - midHY) > 0 ? -1 : 1;
      const nx = uy * sign; const ny = -ux * sign;
      const effW = r2(Math.min(tabWidthMm, len * 0.42)); const inset = r2(Math.min(effW * 0.65, len * 0.24));
      const tabPoly: readonly [Vec2, Vec2, Vec2, Vec2] = [
        host.startMm, { x: r2(host.startMm.x + ux * inset + nx * effW), y: r2(host.startMm.y + uy * inset + ny * effW) },
        { x: r2(host.endMm.x - ux * inset + nx * effW), y: r2(host.endMm.y - uy * inset + ny * effW) }, host.endMm,
      ];
      const midTX = (target.startMm.x + target.endMm.x) * 0.5; const midTY = (target.startMm.y + target.endMm.y) * 0.5;
      const tc = faceMap.get(target.faceId)?.centroidMm ?? { x: midTX, y: midTY };
      const inDx = tc.x - midTX; const inDy = tc.y - midTY; const inLen = Math.max(1e-6, Math.hypot(inDx, inDy));
      const inStep = Math.min(5.2, target.lengthMm * 0.24, inLen * 0.45);
      maxMismatch = Math.max(maxMismatch, Math.abs(host.lengthMm - target.lengthMm));
      glueTabs.push({
        tabId: `tab-${pairSeq}`, pairNumber: pairSeq, hostFaceId: host.faceId, targetFaceId: target.faceId,
        hostEdgeId, targetEdgeId, pageIndex: host.pageIndex, targetPageIndex: target.pageIndex, polygonMm: tabPoly,
        labelPosMm: { x: r2(midHX + nx * effW * 0.52), y: r2(midHY + ny * effW * 0.52) },
        targetLabelPosMm: { x: r2(midTX + (inDx / inLen) * inStep), y: r2(midTY + (inDy / inLen) * inStep) },
        edgeLengthMm: host.lengthMm, targetEdgeLengthMm: target.lengthMm, tabWidthMm: effW, areaMm2: r2(polygonArea2D(tabPoly)),
      });
      continue;
    }
    for (const occ of occs) {
      cutEdges.push({ id: `cut-${(edgeSeq += 1)}`, faceId: occ.faceId, secondaryFaceId: null, kind: "cut", pairNumber: null, dihedralAngleDeg: 0, dashPattern: null, pageIndex: occ.pageIndex, startMm: occ.startMm, endMm: occ.endMm, lengthMm: occ.lengthMm });
    }
  }

  const cutById = new Map(cutEdges.map((e) => [e.id, e]));
  const verifiedPairs = glueTabs.filter((t) => {
    const he = cutById.get(t.hostEdgeId); const te = cutById.get(t.targetEdgeId);
    return Boolean(he && te && he.pairNumber === t.pairNumber && te.pairNumber === t.pairNumber && Math.abs(he.lengthMm - te.lengthMm) <= 0.15);
  }).length;

  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const absorb = (p: Vec2): void => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
  faces.forEach((f) => f.polygonMm.forEach(absorb));
  glueTabs.forEach((t) => t.polygonMm.forEach(absorb));

  const sheetArea = paperSpec.widthMm * paperSpec.heightMm;
  let totalUsed = 0;
  const pages: DielinePageSummary[] = Array.from({ length: totalPages }, (_, p) => {
    const pFaces = faces.filter((f) => f.pageIndex === p);
    const pTabs = glueTabs.filter((t) => t.pageIndex === p);
    const used = r2(pFaces.reduce((a, f) => a + f.areaMm2, 0) + pTabs.reduce((a, t) => a + t.areaMm2, 0));
    totalUsed += used;
    return { pageIndex: p, faceIds: pFaces.map((f) => f.faceId), sheetOriginMm: pageOrigins.get(p) ?? ZERO2, usedAreaMm2: used, utilizationPercent: r1(clamp((used / sheetArea) * 100, 0, 99.5)) };
  });

  const complexity = (faces.length + glueTabs.length * 1.15 + valleyFoldEdges.length * 1.5) * weightSpec.difficultyFactor;
  const assemblyDifficulty: AssemblyDifficulty = complexity <= 24 ? "beginner" : complexity <= 31 ? "intermediate" : "advanced";

  return {
    preset, paperSpec, paperCompensation, scale, faces, cutEdges, mountainFoldEdges, valleyFoldEdges, glueTabs,
    pairIntegrity: { totalPairs: glueTabs.length, verifiedPairs, allPairsMatched: verifiedPairs === glueTabs.length, unmatchedCount: glueTabs.length - verifiedPairs, maxLengthMismatchMm: r2(maxMismatch) },
    pages, totalPages, paperUtilizationPercent: r1(clamp((totalUsed / (totalPages * sheetArea)) * 100, 1, 99.5)),
    totalCutLengthMm: r1(cutEdges.reduce((a, e) => a + e.lengthMm, 0)),
    totalFoldLengthMm: r1(mountainFoldEdges.reduce((a, e) => a + e.lengthMm, 0) + valleyFoldEdges.reduce((a, e) => a + e.lengthMm, 0)),
    boundingBoxMm: { minX: r2(minX), minY: r2(minY), maxX: r2(maxX), maxY: r2(maxY), widthMm: r2(maxX - minX), heightMm: r2(maxY - minY) },
    assemblyDifficulty,
    assemblyDifficultyLabelKo: assemblyDifficulty === "beginner" ? "초급" : assemblyDifficulty === "intermediate" ? "중급" : "상급",
    assemblyDifficultyLabelEn: assemblyDifficulty === "beginner" ? "Beginner" : assemblyDifficulty === "intermediate" ? "Intermediate" : "Advanced",
    estimatedAssemblyMinutes: Math.max(8, Math.round((faces.length * 1.1 + (mountainFoldEdges.length + valleyFoldEdges.length) * 0.75 + glueTabs.length * 1.55) * weightSpec.difficultyFactor)),
  };
}

/** 0%(평면 전개도) → 100%(입체 조립 완성) 사이의 강체 접힘 투영·종이 두께·그림자를 계산한다. */
export function evaluatePaperFoldPreview(input: PaperFoldPreviewInput): PaperFoldPreviewResult {
  const preset = getPapercraftPreset(input.presetId);
  const weightSpec = getPaperWeightSpec(input.paperWeightGsm ?? preset.recommendedPaperWeight);
  const scale = r2(clamp(input.scale ?? 1.0, 0.5, 2.5));
  const foldProgress = r2(clamp(input.foldProgress, 0, 1));
  const cameraYawDeg = r1(clamp(input.cameraYawDeg ?? preset.defaultCameraYawDeg, -180, 180));
  const cameraPitchDeg = r1(clamp(input.cameraPitchDeg ?? preset.defaultCameraPitchDeg, 8, 78));
  const unfoldedFaces = unfoldPresetTopology(preset, scale);

  const computeFolded = (progress: number): Map<string, readonly Vec3[]> => {
    const chains = new Map<string, readonly { readonly origin: Vec3; readonly axis: Vec3; readonly angle: number }[]>();
    for (const uf of unfoldedFaces) {
      const parentChain = uf.def.parentFaceId ? (chains.get(uf.def.parentFaceId) ?? []) : [];
      chains.set(uf.def.id, uf.hingeOriginFlat3d && uf.hingeAxisFlat3d
        ? [...parentChain, { origin: uf.hingeOriginFlat3d, axis: uf.hingeAxisFlat3d, angle: uf.dihedralRad * progress }] : parentChain);
    }
    return new Map(unfoldedFaces.map((uf) => {
      const chain = chains.get(uf.def.id) ?? [];
      return [uf.def.id, uf.flatPts3d.map((pt) => {
        let cur = pt;
        for (let k = chain.length - 1; k >= 0; k -= 1) {
          const step = chain[k];
          if (step) cur = rotateAroundAxis(cur, step.origin, step.axis, step.angle);
        }
        return cur;
      })];
    }));
  };

  const foldedNow = computeFolded(foldProgress);
  const yaw = (cameraYawDeg * Math.PI) / 180; const pitch = (cameraPitchDeg * Math.PI) / 180;
  const camRight = v3(Math.cos(yaw), Math.sin(yaw), 0);
  const camUp = v3(-Math.sin(yaw) * Math.sin(pitch), Math.cos(yaw) * Math.sin(pitch), Math.cos(pitch));
  const camFwd = v3(Math.sin(yaw) * Math.cos(pitch), -Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch));
  const lightDir = norm3(v3(-0.45, -0.35, 0.82));
  const projRaw = (p: Vec3) => ({ u: dot3(p, camRight), v: -dot3(p, camUp), d: dot3(p, camFwd) });

  let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
  for (const state of [computeFolded(0), computeFolded(1)]) {
    for (const pts of state.values()) {
      for (const p of pts) { const pr = projRaw(p); minU = Math.min(minU, pr.u); maxU = Math.max(maxU, pr.u); minV = Math.min(minV, pr.v); maxV = Math.max(maxV, pr.v); }
    }
  }
  const viewportWidth = 340; const viewportHeight = 260;
  const pxPerMm = Math.min((viewportWidth - 56) / Math.max(10, maxU - minU), (viewportHeight - 60) / Math.max(10, maxV - minV));
  const cU = (minU + maxU) * 0.5; const cV = (minV + maxV) * 0.5;
  const toScreen = (p: Vec3) => {
    const pr = projRaw(p);
    return { pt: { x: r1(viewportWidth * 0.5 + (pr.u - cU) * pxPerMm), y: r1(viewportHeight * 0.52 + (pr.v - cV) * pxPerMm) }, depth: pr.d };
  };

  let maxElevationMm = 0;
  const paperThicknessPx = r2(weightSpec.thicknessMm * 4.8);
  const sdx = 0.42; const sdy = 0.28;
  const faces: ProjectedFoldFace[] = unfoldedFaces.map((uf) => {
    const pts3d = foldedNow.get(uf.def.id) ?? uf.flatPts3d;
    const faceNormal = computeNewellNormal(pts3d);
    let depthSum = 0;
    const screenPoints: Vec2[] = []; const rimOffsetPoints: Vec2[] = []; const shadowPoints: Vec2[] = [];
    for (const p of pts3d) {
      if (p.z > maxElevationMm) maxElevationMm = p.z;
      const pr = toScreen(p);
      screenPoints.push(pr.pt);
      rimOffsetPoints.push({ x: r1(pr.pt.x + paperThicknessPx * 0.45), y: r1(pr.pt.y + paperThicknessPx) });
      shadowPoints.push(toScreen(v3(p.x + Math.max(0, p.z) * sdx, p.y + Math.max(0, p.z) * sdy, 0)).pt);
      depthSum += pr.depth;
    }
    const isBackfacing = dot3(faceNormal, camFwd) < -0.02;
    const lambert = clamp(0.45 + Math.max(0, dot3(isBackfacing ? scale3(faceNormal, -1) : faceNormal, lightDir)) * 0.55, 0.35, 1);
    const base = uf.def.colorOklch;
    const lit: OklchColor = isBackfacing
      ? { l: clamp(0.92 * (0.75 + lambert * 0.25), 0.52, 0.96), c: 0.014, h: 88 }
      : { l: clamp(base.l * (0.68 + lambert * 0.36), 0.2, 0.95), c: base.c, h: base.h };
    return {
      faceId: uf.def.id, islandId: uf.def.islandId, labelKo: uf.def.labelKo, labelEn: uf.def.labelEn, role: uf.def.role,
      screenPoints, rimOffsetPoints, shadowPoints, averageDepth: r2(depthSum / Math.max(1, pts3d.length)), lightFactor: r2(lambert),
      fillOklch: formatOklch(lit), rimOklch: formatOklch({ l: clamp(lit.l - 0.14, 0.14, 0.84), c: lit.c * 0.8, h: lit.h }),
      strokeOklch: formatOklch({ l: 0.24, c: 0.015, h: 240 }), isBackfacing,
    };
  }).sort((a, b) => a.averageDepth - b.averageDepth);

  return {
    presetId: preset.id, foldProgress, foldAngleDeg: r1(foldProgress * 90), cameraYawDeg, cameraPitchDeg,
    paperWeightGsm: weightSpec.gsm, paperThicknessPx, maxElevationMm: r1(maxElevationMm), viewportWidth, viewportHeight, faces,
    shadowOffsetPx: { x: r1(maxElevationMm * sdx * pxPerMm * 0.32), y: r1(maxElevationMm * sdy * pxPerMm * 0.32) },
  };
}

/** 생성한 형상을 검증한 뒤 명목 mm 단위의 SVG 도안을 만든다. */
export function exportPapercraftDielineSvg(dieline: PapercraftDielineResult, options?: { readonly pageIndex?: number; readonly includeLegend?: boolean }): string {
  validateDielineForExport(dieline);
  return renderDielineSvg(dieline, options, formatOklch);
}
function validateDielineForExport(dieline: PapercraftDielineResult): void {
  assertExportBudget(dieline);
  const canonical = unfoldPapercraftDieline({ presetId: dieline.preset?.id, paperSize: dieline.paperSpec?.id, paperWeightGsm: dieline.paperCompensation?.gsm, scale: dieline.scale });
  assertGeneratedResult(dieline, canonical);
}
/** 같은 모델·배율·용지 설정의 도안과 프리뷰만 직렬화한다. */
export function exportPapercraftManifestJson(dieline: PapercraftDielineResult, preview: PaperFoldPreviewResult): string {
  validateDielineForExport(dieline);
  assertExportBudget(preview);
  const canonical = evaluatePaperFoldPreview({ presetId: dieline.preset.id, paperWeightGsm: dieline.paperCompensation.gsm, scale: dieline.scale, foldProgress: preview.foldProgress, cameraYawDeg: preview.cameraYawDeg, cameraPitchDeg: preview.cameraPitchDeg });
  assertGeneratedResult(preview, canonical);
  return serializePapercraftManifest(dieline, preview);
}
