/**
 * 2026-10-27 REA 역공학 기반 Studio 3D 생태계 통합 엔진 (프론트엔드 전용).
 * - Tripo Studio Web (`studio.tripo3d.ai`) 12-Workspace 허브 & Text-to-Motion('텍스트를 동작으로')
 * - GLBForge (`@glbforge/core@0.4.0` & `@glbforge/mcp@0.4.1`) 17-Rule 성능 린터 & 2D→3D 부조/간판/굿즈 압출기
 * - Meshy 7 (`@meshy-ai/meshy-mcp-server@0.5.2`) Smart Topology(`meshy-t2`) & 7종 크리에이티브 랩 굿즈 · 8종 슬라이서
 * - Hyper3D Rodin (`@hyper3d/cli` `https://api.hyper3d.com/api/mcp`) 7-Tool 공식 MCP & Deemos BANG 파츠 분해기
 * - VRM Toolkit (`vrm-toolkit-mcp@0.1.1`) 4-View 카메라 프레이밍 & Blend-AI 실측 스케일(1.75m) · 3점 조명(3:1:1.5)
 */

import type { StudioVarco3dMannequinPosePresetId } from "./studio-varco3d-character-lab-diorama-catalog";

export type TripoStudioWorkspaceId =
  | "generate-image"
  | "generate"
  | "segmentation"
  | "fill-parts"
  | "retopology"
  | "smart-uv"
  | "texture"
  | "texture-edit"
  | "texture-upscale"
  | "texture-pbr"
  | "rigging"
  | "animate";

export interface TripoStudioWorkspaceItem {
  readonly id: TripoStudioWorkspaceId;
  readonly route: string;
  readonly labelKo: string;
  readonly badgeKo?: string;
  readonly creditCost: number;
  readonly summaryKo: string;
  readonly guardrailKo: string;
}

export const TRIPO_STUDIO_12_WORKSPACES: readonly TripoStudioWorkspaceItem[] = Object.freeze([
  {
    id: "generate-image",
    route: "/ko/workspace/generate-image",
    labelKo: "이미지 생성",
    creditCost: 5,
    summaryKo: "T-Pose/4-View 멀티뷰 캐릭터 및 소품 레퍼런스 시트 생성",
    guardrailKo: "배경 알파 실루엣 분리 후 Image-to-3D 직결",
  },
  {
    id: "generate",
    route: "/ko/workspace/generate",
    labelKo: "3D 생성 (H3.1/P2.0)",
    badgeKo: "H3.1 HD",
    creditCost: 65,
    summaryKo: "H3.1 최고 품질(~1.75M 삼각형 HD) vs 스마트 메시 P2.0(쿼드 & 편집)",
    guardrailKo: "부분별 생성 체험 ×1 · 8K 텍스처 체험 ×1 · 깔끔한 토폴로지 ×2",
  },
  {
    id: "segmentation",
    route: "/ko/workspace/segmentation",
    labelKo: "시맨틱 분할",
    creditCost: 40,
    summaryKo: "브러시 스트로크 기반 시맨틱 파츠 분리 및 병합",
    guardrailKo: "쿼드(Quad) 모델·리깅된 모델 사용 불가 · 업로드 ≤ 150MB (OBJ/FBX/STL/GLB)",
  },
  {
    id: "fill-parts",
    route: "/ko/workspace/fill-parts",
    labelKo: "파트 보완",
    creditCost: 20,
    summaryKo: "분할된 서브메시 내부의 가려진 단면을 방수(Watertight) 메시로 보완",
    guardrailKo: "선행 시맨틱 분할(Segmentation) 완료 에셋 필수",
  },
  {
    id: "retopology",
    route: "/ko/workspace/retopology",
    labelKo: "리토폴로지",
    creditCost: 10,
    summaryKo: "Smart Mesh P2.0 기반 균일 쿼드/삼각 폴리곤 리메시",
    guardrailKo: "권장 목표 면수: 캐릭터 15k~35k / 배경 소품 2k~12k",
  },
  {
    id: "smart-uv",
    route: "/ko/workspace/smart-uv",
    labelKo: "스마트 UV",
    badgeKo: "무료 체험",
    creditCost: 0,
    summaryKo: "AI 자동 재봉선(Seam) 탐색 및 왜곡 최소화 UV 언랩",
    guardrailKo: "삼각형 면 ≤ 80,000개 / 사각형 면 ≤ 40,000개 상한 강제",
  },
  {
    id: "texture",
    route: "/ko/workspace/texture",
    labelKo: "AI 텍스처",
    creditCost: 10,
    summaryKo: "v3.5 Delight(베이킹 그림자 제거) 무광 알베도 및 스타일 텍스처링",
    guardrailKo: "웹툰 툰셰이더 연동 시 Delight 활성 권장",
  },
  {
    id: "texture-edit",
    route: "/ko/workspace/texture-edit",
    labelKo: "매직 브러시",
    badgeKo: "Magic Brush",
    creditCost: 5,
    summaryKo: "3D 뷰포트 마스킹 + 텍스트 프롬프트 기반 국소 텍스처 인페인팅",
    guardrailKo: "간판 문구·의상 엠블럼·얼굴 문양 등 부분 무손실 수정",
  },
  {
    id: "texture-upscale",
    route: "/ko/workspace/texture-upscale",
    labelKo: "4K/8K 업스케일",
    badgeKo: "8K",
    creditCost: 15,
    summaryKo: "표준 2K 텍스처를 4K(4096px) 또는 8K(8192px) 초고해상도로 업스케일",
    guardrailKo: "모바일 뷰어 배포 시 GLBForge 2K 다운샘플 병행 권장",
  },
  {
    id: "texture-pbr",
    route: "/ko/workspace/texture-pbr",
    labelKo: "PBR 맵 합성",
    creditCost: 10,
    summaryKo: "BaseColor · Normal · Metallic · Roughness · AO 5채널 동기화 생성",
    guardrailKo: "노멀맵 WebP nearLossless 또는 KTX2 UASTC 보존 권장",
  },
  {
    id: "rigging",
    route: "/ko/workspace/rigging",
    labelKo: "3D 리깅 v3.0",
    creditCost: 15,
    summaryKo: "8종 체형 × 6종 스펙(VRM/Mixamo/Unity/Unreal/ActorCore/Tripo) 자동 리깅",
    guardrailKo: "rig-check 사전 게이트 통과 후 실행 (최대 300k faces)",
  },
  {
    id: "animate",
    route: "/ko/workspace/animate",
    labelKo: "텍스트를 동작으로",
    badgeKo: "Text-to-Motion",
    creditCost: 10,
    summaryKo: "휴머노이드 리깅 모델에 자연어 모션 프롬프트 및 프리셋 리타게팅",
    guardrailKo: "태스크당 최대 5개 모션 클립 연속 추출 지원",
  },
]);

export interface TripoTextToMotionPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly motionPrompt: string;
  readonly tripoPresetId: string;
  readonly mannequinPosePresetId: StudioVarco3dMannequinPosePresetId;
  readonly category: "action" | "daily" | "fantasy" | "rigging";
}

export const TRIPO_TEXT_TO_MOTION_PRESETS: readonly TripoTextToMotionPreset[] = Object.freeze([
  {
    id: "slash-leap",
    labelKo: "검격 도약 (Slash Jump)",
    motionPrompt: "leaping forward while swinging a two-handed sword diagonally",
    tripoPresetId: "preset:slash",
    mannequinPosePresetId: "action",
    category: "action",
  },
  {
    id: "heroic-sprint",
    labelKo: "전력 질주 돌파 (Sprint)",
    motionPrompt: "high-speed forward sprint with dynamic arm swing, anime action",
    tripoPresetId: "preset:run",
    mannequinPosePresetId: "running",
    category: "action",
  },
  {
    id: "arcane-cast",
    labelKo: "마법 영창 (Arcane Cast)",
    motionPrompt: "floating slightly with one hand raised channeling arcane spell energy",
    tripoPresetId: "preset:cast",
    mannequinPosePresetId: "dramatic",
    category: "fantasy",
  },
  {
    id: "combat-guard",
    labelKo: "전투 경계 스탠스 (Guard)",
    motionPrompt: "defensive martial arts stance with balanced center of gravity",
    tripoPresetId: "preset:boxing",
    mannequinPosePresetId: "action",
    category: "action",
  },
  {
    id: "casual-stroll",
    labelKo: "일상 산책/대화 (Walk)",
    motionPrompt: "relaxed natural walking cycle down a city alley",
    tripoPresetId: "preset:walk",
    mannequinPosePresetId: "walking",
    category: "daily",
  },
  {
    id: "tpose-calibration",
    labelKo: "T-Pose 리깅 기준",
    motionPrompt: "strict symmetric T-pose for humanoid rigging calibration",
    tripoPresetId: "preset:idle",
    mannequinPosePresetId: "standing",
    category: "rigging",
  },
]);

export function evaluateTripoStudioWorkspaceGuard(options: {
  readonly workspaceId: TripoStudioWorkspaceId;
  readonly faceCount: number;
  readonly quad: boolean;
  readonly rigged?: boolean;
}) {
  const workspace =
    TRIPO_STUDIO_12_WORKSPACES.find((w) => w.id === options.workspaceId) ??
    TRIPO_STUDIO_12_WORKSPACES[1]!;
  const blockersKo: string[] = [];

  if (options.workspaceId === "smart-uv") {
    const ceiling = options.quad ? 40_000 : 80_000;
    if (options.faceCount > ceiling) {
      blockersKo.push(
        `Smart UV 상한 초과: ${options.quad ? "사각형(Quad) ≤ 40,000면" : "삼각형(Tri) ≤ 80,000면"} (현재 ${options.faceCount.toLocaleString()}면)`,
      );
    }
  }
  if (options.workspaceId === "segmentation") {
    if (options.quad) {
      blockersKo.push("시맨틱 분할(Segmentation)은 쿼드(Quad) 모델에서 사용할 수 없습니다.");
    }
    if (options.rigged) {
      blockersKo.push("시맨틱 분할(Segmentation)은 리깅된(Rigged) 모델에서 사용할 수 없습니다.");
    }
  }

  return {
    workspace,
    allowed: blockersKo.length === 0,
    blockersKo,
  };
}

export type GlbForgeBudgetProfileId =
  | "mobile-hero"
  | "desktop-hero"
  | "product-configurator"
  | "webtoon-scene-cluster";

export interface GlbForgeProfileSummary {
  readonly id: GlbForgeBudgetProfileId;
  readonly labelKo: string;
  readonly maxTriangles: number;
  readonly maxDrawCalls: number;
  readonly maxTextureSize: number;
  readonly maxFileMiB: number;
  readonly maxMaterials: number;
}

export const GLBFORGE_PROFILES: readonly GlbForgeProfileSummary[] = Object.freeze([
  {
    id: "mobile-hero",
    labelKo: "모바일 히어로 (150k Tri / 4 DC)",
    maxTriangles: 150_000,
    maxDrawCalls: 4,
    maxTextureSize: 2048,
    maxFileMiB: 6,
    maxMaterials: 2,
  },
  {
    id: "desktop-hero",
    labelKo: "데스크톱 히어로 (500k Tri / 8 DC)",
    maxTriangles: 500_000,
    maxDrawCalls: 8,
    maxTextureSize: 4096,
    maxFileMiB: 20,
    maxMaterials: 4,
  },
  {
    id: "product-configurator",
    labelKo: "소품 컨피규레이터 (250k Tri / 12 DC)",
    maxTriangles: 250_000,
    maxDrawCalls: 12,
    maxTextureSize: 2048,
    maxFileMiB: 12,
    maxMaterials: 8,
  },
  {
    id: "webtoon-scene-cluster",
    labelKo: "웹툰 배경 클러스터 (40k Tri / 2 DC)",
    maxTriangles: 40_000,
    maxDrawCalls: 2,
    maxTextureSize: 1024,
    maxFileMiB: 2,
    maxMaterials: 3,
  },
]);

export function simulateGlbForgeAuditAndOptimization(options: {
  readonly profileId: GlbForgeBudgetProfileId;
  readonly triangles: number;
  readonly drawCalls: number;
  readonly materials: number;
  readonly textureSizePx: number;
}) {
  const profile =
    GLBFORGE_PROFILES.find((p) => p.id === options.profileId) ?? GLBFORGE_PROFILES[0]!;
  const findingsKo: string[] = [];
  let penalty = 0;

  if (options.triangles > profile.maxTriangles) {
    findingsKo.push(
      `perf/triangles: ${options.triangles.toLocaleString()} > ${profile.maxTriangles.toLocaleString()} (Meshopt [0.001..0.1] 래칫 필요)`,
    );
    penalty += 25;
  }
  if (options.drawCalls > profile.maxDrawCalls) {
    findingsKo.push(
      `perf/draw-calls: ${options.drawCalls} > ${profile.maxDrawCalls} (palette min:5 + flatten + join 병합 필요)`,
    );
    penalty += 25;
  }
  if (options.materials > profile.maxMaterials) {
    findingsKo.push(
      `perf/materials: ${options.materials} > ${profile.maxMaterials} (아틀라스 통합 권장)`,
    );
    penalty += 10;
  }
  if (options.textureSizePx > profile.maxTextureSize) {
    findingsKo.push(
      `tex/oversize: ${options.textureSizePx}px > ${profile.maxTextureSize}px (Lanczos3 리사이즈 + WebP quality:82)`,
    );
    penalty += 20;
  }

  const score = Math.max(0, 100 - penalty);
  const optimizedTriangles = Math.min(options.triangles, profile.maxTriangles);
  const optimizedDrawCalls = Math.min(options.drawCalls, profile.maxDrawCalls);

  return {
    profile,
    score,
    passed: findingsKo.length === 0,
    findingsKo,
    optimizedTriangles,
    optimizedDrawCalls,
    lod1Triangles: Math.max(100, Math.round(optimizedTriangles * 0.25)),
    lod2Triangles: Math.max(48, Math.round(optimizedTriangles * 0.06)),
  };
}

export type ReliefExtrudePresetId = "enamel" | "chrome" | "rubber" | "neon" | "acrylic";

export interface ReliefExtrudePresetSpec {
  readonly id: ReliefExtrudePresetId;
  readonly labelKo: string;
  readonly metallic: number;
  readonly roughness: number;
  readonly transmission: number;
  readonly emissive: boolean;
  readonly useCaseKo: string;
}

export const GLBFORGE_EXTRUDE_PRESETS: readonly ReliefExtrudePresetSpec[] = Object.freeze([
  {
    id: "neon",
    labelKo: "야경 네온사인 간판 (Neon)",
    metallic: 0.0,
    roughness: 0.2,
    transmission: 0,
    emissive: true,
    useCaseKo: "웹툰 밤거리 상가 간판 · 사이버펑크 홀로그램 (emissive 100%, baseColor 15%)",
  },
  {
    id: "acrylic",
    labelKo: "투명 아크릴 스탠드 (Acrylic)",
    metallic: 0.0,
    roughness: 0.1,
    transmission: 0.85,
    emissive: false,
    useCaseKo: "캐릭터 굿즈 디오라마 스탠드 (KHR_materials_transmission 0.85)",
  },
  {
    id: "enamel",
    labelKo: "칠보/에나멜 배지 (Enamel)",
    metallic: 0.1,
    roughness: 0.18,
    transmission: 0,
    emissive: false,
    useCaseKo: "교복 학년 배지 · 길드 문장 (황동 림 Layer 0 + 유광 에나멜)",
  },
  {
    id: "chrome",
    labelKo: "크롬 메탈 엠블럼 (Chrome)",
    metallic: 1.0,
    roughness: 0.08,
    transmission: 0,
    emissive: false,
    useCaseKo: "로판 황실 문장 · 차량/무기 금속 장식",
  },
  {
    id: "rubber",
    labelKo: "소프트 PVC 러버 (Rubber)",
    metallic: 0.0,
    roughness: 0.95,
    transmission: 0,
    emissive: false,
    useCaseKo: "SD 캐릭터 키링 · 무광 스탬프 소품",
  },
]);

export function planWebtoonSignageReliefExtrusion(options: {
  readonly presetId: ReliefExtrudePresetId;
  readonly layers: number;
  readonly depthCm: number;
  readonly pillowCm: number;
}) {
  const preset =
    GLBFORGE_EXTRUDE_PRESETS.find((p) => p.id === options.presetId) ?? GLBFORGE_EXTRUDE_PRESETS[0]!;
  const layers = Math.max(1, Math.min(6, Math.round(options.layers)));
  const depthCm = Math.max(0.2, Math.min(10, Number(options.depthCm.toFixed(2))));
  const pillowCm = Math.max(0, Math.min(2.5, Number(options.pillowCm.toFixed(2))));

  return {
    preset,
    layers,
    depthCm,
    pillowCm,
    sharpCornerDeg: 42,
    watertightStlReady: true,
    summaryKo: `${preset.labelKo} · K-Means ${layers}층 적층 · 두께 ${depthCm}cm · EDT 돔 볼륨 ${pillowCm}cm (Chaikin 42° 모서리 보존)`,
  };
}

export const MESHY_CREATIVE_PRODUCTS = Object.freeze([
  { id: "figure", labelKo: "피규어 (베이스 포함)", credits: 25 },
  { id: "lamp", labelKo: "무드 램프 (광확산 쉘)", credits: 30 },
  { id: "keychain", labelKo: "키체인 (일체형 고리)", credits: 20 },
  { id: "fridge-magnet", labelKo: "냉장고 자석", credits: 20 },
  { id: "vinyl-figure", labelKo: "바이닐 아트토이", credits: 25 },
  { id: "brick-figure", labelKo: "브릭 피규어", credits: 25 },
  { id: "keycap", labelKo: "기계식 키캡 (Cherry MX)", credits: 20 },
] as const);

export const MESHY_SLICERS = Object.freeze([
  "auto",
  "bambu",
  "orcaslicer",
  "creality_print",
  "elegoo_slicer",
  "anycubic_slicer",
  "prusaslicer",
  "cura",
] as const);

export const VRM_FRAMING_PRESETS = Object.freeze([
  {
    id: "front",
    labelKo: "VRM 전신 정면",
    mannequinAngle: "front" as const,
    fovDeg: 28,
    focusHeightRatio: 0.52,
    descriptionKo: "턴어라운드 시트 정면 기준 (FOV 28°)",
  },
  {
    id: "three_quarter",
    labelKo: "VRM 3/4 쿼터뷰",
    mannequinAngle: "front" as const,
    fovDeg: 30,
    focusHeightRatio: 0.54,
    descriptionKo: "웹툰 캐릭터 소개 컷 표준 32° 쿼터뷰",
  },
  {
    id: "side",
    labelKo: "VRM 측면 실루엣",
    mannequinAngle: "side" as const,
    fovDeg: 26,
    focusHeightRatio: 0.52,
    descriptionKo: "체형 두께·무기 장착 밸런스 검수용 측면",
  },
  {
    id: "face",
    labelKo: "VRM 얼굴 클로즈업",
    mannequinAngle: "high" as const,
    fovDeg: 20,
    focusHeightRatio: 0.86,
    descriptionKo: "대화 컷/표정 검수용 망원(FOV 20°) 인물화",
  },
]);

export const BLEND_AI_SCALE_GUIDES = Object.freeze([
  { id: "adult", labelKo: "성인 표준", meters: 1.75 },
  { id: "eye", labelKo: "카메라 눈높이", meters: 1.6 },
  { id: "door", labelKo: "실내 방문", meters: 2.1 },
  { id: "desk", labelKo: "책상/식탁", meters: 0.75 },
  { id: "chair", labelKo: "의자 좌판", meters: 0.45 },
  { id: "ceiling", labelKo: "표준 천장고", meters: 2.4 },
]);

export {
  buildTripo3dCustomizationRecipe,
  TRIPO_STUDIO_FREE_TRIAL_LEDGER,
  TRIPO3D_CUSTOMIZER_PALETTES,
  TRIPO3D_HAND_POSE_VARIANTS,
  TRIPO3D_MCP_GENERATED_MODELS,
  type Tripo3dCustomizablePartSpec,
  type Tripo3dCustomizationInput,
  type Tripo3dCustomizationRecipe,
  type Tripo3dCustomizerPalette,
  type Tripo3dCustomizerPaletteId,
  type Tripo3dHandPoseVariantId,
  type Tripo3dMcpGeneratedModelDomain,
  type Tripo3dMcpGeneratedModelEntry,
  type Tripo3dTopologyMode,
  type TripoStudioFreeTrialItem,
} from "./studio-tripo3d-customizer-engine";

export const VRM_TOOLKIT_MCP_INSPECTED_AVATARS = Object.freeze([
  {
    id: "Avatar_Orion.vrm",
    nameKo: "오리온 (Avatar_Orion.vrm)",
    specFamily: "vrm1" as const,
    mappedBoneCount: 53,
    totalTriangles: 8104,
    totalVertices: 12683,
    materialCount: 5,
    imageCount: 3,
    maxTextureDimension: 1024,
    bytes: 2_893_304,
    ok: true,
  },
  {
    id: "AliciaSolid.vrm",
    nameKo: "알리시아 솔리드 (AliciaSolid.vrm)",
    specFamily: "vrm0" as const,
    mappedBoneCount: 55,
    totalTriangles: 22192,
    totalVertices: 16480,
    materialCount: 12,
    imageCount: 8,
    maxTextureDimension: 2048,
    bytes: 7_878_712,
    ok: true,
  },
]);
