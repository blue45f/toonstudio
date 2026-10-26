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

export type Tripo3dMcpGeneratedModelDomain = "bg3d" | "mannequin" | "character-lab";

export interface Tripo3dMcpGeneratedModelEntry {
  readonly id: string;
  readonly domain: Tripo3dMcpGeneratedModelDomain;
  readonly nameKo: string;
  readonly descriptionKo: string;
  readonly url: `/models/tripo3d-mcp/${string}.glb`;
  readonly fileName: `${string}.glb`;
  readonly byteSize: number;
  readonly sha256: `sha256:${string}`;
  readonly triangles: number;
  readonly vertices: number;
  readonly drawCalls: number;
  readonly materials: number;
  readonly glbforgeScore: number;
  readonly glbforgeProfile: "desktop-hero@1" | "mobile-hero@1";
  readonly mcpPipelineKo: string;
  readonly recommendedPosePresetId?: StudioVarco3dMannequinPosePresetId;
}

export const TRIPO3D_MCP_GENERATED_MODELS: readonly Tripo3dMcpGeneratedModelEntry[] = Object.freeze([
  {
    id: "tripo3d-h31-bg-korean-convenience-store",
    domain: "bg3d",
    nameKo: "웹툰 한국 편의점 매장 & 야외 파라솔 세트 (Tripo H3.1 Ultra 8K)",
    descriptionKo: "Tripo Studio H3.1 최고 품질 + 울트라 메시 + 8K PBR + 조명 제거(Delight)로 생성하고 GLBForge Meshopt·WebP로 최적화한 한국 웹툰 편의점 배경 3D 모델",
    url: "/models/tripo3d-mcp/tripo_h31_korean_convenience_store.glb",
    fileName: "tripo_h31_korean_convenience_store.glb",
    byteSize: 1_669_120,
    sha256: "sha256:b0dce15ee9b6ddaac15f33c0c566126ba67d10ac01af46123f1e2d22538ac324",
    triangles: 24_000,
    vertices: 24_562,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra 8K PBR Delight, 1.84M Tri) → glbforge.optimize_glb(24k Tri, -97.4%)",
    recommendedPosePresetId: "sitting",
  },
  {
    id: "tripo3d-h31-bg-romance-fantasy-palace-courtyard",
    domain: "bg3d",
    nameKo: "로판 황실 대리석 분수 정원 파빌리온 (Tripo H3.1 Ultra 8K)",
    descriptionKo: "Tripo Studio H3.1 최고 품질 + 울트라 메시 + 8K PBR로 생성한 로맨스 판타지 황실 아치 기둥·대리석 분수대·황금 장식 정원 배경 3D 모델",
    url: "/models/tripo3d-mcp/tripo_h31_romance_fantasy_palace_courtyard.glb",
    fileName: "tripo_h31_romance_fantasy_palace_courtyard.glb",
    byteSize: 1_576_404,
    sha256: "sha256:912efa91db2c43143a5dfa383b0964ea0912daee82a8c5c503d62f219f96f2cc",
    triangles: 24_000,
    vertices: 24_828,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra 8K PBR Delight, 1.83M Tri) → glbforge.optimize_glb(24k Tri, -97.6%)",
    recommendedPosePresetId: "dramatic",
  },
  {
    id: "tripo3d-h31-bg-industrial-rooftop-hvac",
    domain: "bg3d",
    nameKo: "웹툰 도심 옥상 물탱크 & 공조 설비 클러스터 (Tripo Studio HD)",
    descriptionKo: "액션/스릴러 웹툰 옥상 결투 컷을 위한 대형 물탱크·배관·HVAC 실외기·철골 구조물 PBR 배경 3D 모델",
    url: "/models/tripo3d-mcp/tripo_h31_industrial_rooftop_hvac_facility.glb",
    fileName: "tripo_h31_industrial_rooftop_hvac_facility.glb",
    byteSize: 1_910_048,
    sha256: "sha256:b5273917417f6f6bd329209b3568ef574fcf5d1df413e4e9ac311990f3ada750",
    triangles: 23_999,
    vertices: 31_545,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(HD PBR, 1.74M Tri) → glbforge.optimize_glb(24k Tri, -96.8%)",
    recommendedPosePresetId: "action",
  },
  {
    id: "tripo3d-mcp-bg-korean-alley-stairway",
    domain: "bg3d",
    nameKo: "웹툰 한국 골목 계단 모듈 (Tripo3D MCP)",
    descriptionKo: "10단 콘크리트 경사 계단·적벽돌 담장·스테인리스 양측 핸드레일·계량기함·보안등·화분이 결합된 한국 골목 배경 3D 모델",
    url: "/models/tripo3d-mcp/webtoon_korean_alley_stairway_module.glb",
    fileName: "webtoon_korean_alley_stairway_module.glb",
    byteSize: 49_756,
    sha256: "sha256:bafb41827f37f79c6354f6e05a2d444644e8b2df9d919b9b947589b62c6bb4be",
    triangles: 3140,
    vertices: 6000,
    drawCalls: 2,
    materials: 2,
    glbforgeScore: 100,
    glbforgeProfile: "desktop-hero@1",
    mcpPipelineKo: "tripo3d(Blender 5.2) → glbforge.optimize_glb(meshopt+weld) → analyze_glb(100/100)",
    recommendedPosePresetId: "walking",
  },
  {
    id: "tripo3d-mcp-bg-cafe-counter-cluster",
    domain: "bg3d",
    nameKo: "웹툰 카페 카운터 집기 클러스터 (Tripo3D MCP)",
    descriptionKo: "월넛 원목·쿼츠 상판 카운터, 듀얼 에스프레소 머신, 그라인더, 유리 쇼케이스, 백바 선반, 바 스툴 3종과 펜던트 조명 3종으로 구성된 카페 실내 배경 3D 모델",
    url: "/models/tripo3d-mcp/webtoon_cafe_counter_fixture_cluster.glb",
    fileName: "webtoon_cafe_counter_fixture_cluster.glb",
    byteSize: 38_936,
    sha256: "sha256:953c4de026e46413bb70c7c665756b9d86d2ab10cd54246e46aa5fb32d79dd69",
    triangles: 2260,
    vertices: 4404,
    drawCalls: 2,
    materials: 2,
    glbforgeScore: 100,
    glbforgeProfile: "desktop-hero@1",
    mcpPipelineKo: "tripo3d(Blender 5.2) → glbforge.optimize_glb(meshopt+weld) → analyze_glb(100/100)",
    recommendedPosePresetId: "sitting",
  },
  {
    id: "tripo3d-mcp-bg-rooftop-neon-signboard",
    domain: "bg3d",
    nameKo: "웹툰 네온 엠블럼 간판 릴리프 (GLBForge + Tripo3D MCP)",
    descriptionKo: "2D 그래픽 실루엣을 2레이어 베벨 릴리프로 돌출(extrude_image)하여 생성한 네온 엠블럼 간판 3D 소품 모델",
    url: "/models/tripo3d-mcp/webtoon_rooftop_neon_signboard.glb",
    fileName: "webtoon_rooftop_neon_signboard.glb",
    byteSize: 27_712,
    sha256: "sha256:80bb1cb8a844ece05d7bd3104d006316a311296d46cbb6d1ae0688756e8fdd9a",
    triangles: 2492,
    vertices: 1872,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 100,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "glbforge.extrude_image(neon 2-layer) → optimize_glb(meshopt) → analyze_glb(100/100)",
    recommendedPosePresetId: "dramatic",
  },
  {
    id: "tripo3d-h31-mannequin-articulated-body",
    domain: "mannequin",
    nameKo: "3D 데생인형 8등신 볼조인트 전신 마네킹 (Tripo H3.1 Ultra 8K)",
    descriptionKo: "Tripo Studio H3.1 최고 품질 + 울트라 메시 + 8K PBR로 생성한 해부학 랜드마크·가슴 중심선·볼조인트 관절 링이 각인된 T-Pose 8등신 데생인형 전신 GLB 모델",
    url: "/models/tripo3d-mcp/tripo_h31_articulated_artist_mannequin.glb",
    fileName: "tripo_h31_articulated_artist_mannequin.glb",
    byteSize: 1_561_152,
    sha256: "sha256:5ccb8e98dfffda8ef2e268d8772217545290e7204a7157f6ade33f44544bb484",
    triangles: 23_999,
    vertices: 16_892,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra 8K PBR, 1.97M Tri) → glbforge.optimize_glb(24k Tri, SSIM 0.933)",
    recommendedPosePresetId: "standing",
  },
  {
    id: "tripo3d-mcp-mannequin-calibration-rig",
    domain: "mannequin",
    nameKo: "3D 데생인형 8등신 관절·무게중심 캘리브레이션 리그",
    descriptionKo: "두상 시선 바이저·흉곽·골반 블록·좌우 12관절 구체와 수직 무게중심 추(Plumb Line)가 결합된 3D 데생인형 비례 교정 레퍼런스 모델",
    url: "/models/tripo3d-mcp/mannequin_articulated_calibration_rig.glb",
    fileName: "mannequin_articulated_calibration_rig.glb",
    byteSize: 124_740,
    sha256: "sha256:fcef181ae7fed30616c99b67704ea36008f7a60e0df908524cc254c1ebadb8b6",
    triangles: 7152,
    vertices: 15188,
    drawCalls: 4,
    materials: 4,
    glbforgeScore: 95,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "tripo3d(create_object/set_material/execute_blender_code) → glbforge.optimize_glb(-80.3%)",
    recommendedPosePresetId: "standing",
  },
  {
    id: "tripo3d-mcp-mannequin-action-pedestal",
    domain: "mannequin",
    nameKo: "3D 데생인형 45° 앵글 턴테이블 & 8등신 눈금 스탠드",
    descriptionKo: "45° 방사형 카메라 앵글 마커 원판, 고저 단차 액션 스텝 블록 2종, 8등신 수직 신장 눈금 기둥으로 구성된 3D 데생인형 포즈 스테이지 모델",
    url: "/models/tripo3d-mcp/mannequin_action_stage_pedestal.glb",
    fileName: "mannequin_action_stage_pedestal.glb",
    byteSize: 37_084,
    sha256: "sha256:943ff31967e78f5455c66ade1a21715f06e33a2ad51f9caf2f3fb1758eed0f5a",
    triangles: 2300,
    vertices: 4680,
    drawCalls: 3,
    materials: 3,
    glbforgeScore: 95,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "tripo3d(Blender 5.2) → glbforge.optimize_glb(-81.7% 바이트 절감)",
    recommendedPosePresetId: "action",
  },
  {
    id: "tripo3d-h31-character-lab-protagonist",
    domain: "character-lab",
    nameKo: "3D 캐릭터 랩 웹툰 주인공 전신 T-Pose + 스마트 메시 리토폴로지 (Tripo H3.1 8K)",
    descriptionKo: "Tripo Studio H3.1 최고 품질 + 울트라 메시 + 8K PBR + Smart Mesh P1.0 리토폴로지(17,733 Tri, SSIM 0.9976)가 적용된 웹툰 주인공 전신 캐릭터 GLB 모델",
    url: "/models/tripo3d-mcp/tripo_h31_webtoon_protagonist_character.glb",
    fileName: "tripo_h31_webtoon_protagonist_character.glb",
    byteSize: 4_704_536,
    sha256: "sha256:01dc6309a68e6329e30d7fc1dcae7dd27f6682f39f7744b86d41ed8d7d40d06a",
    triangles: 17_733,
    vertices: 19_992,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra 8K + Smart Mesh P1.0 17.7k Tri) → glbforge.optimize_glb(SSIM 0.9976)",
    recommendedPosePresetId: "standing",
  },
  {
    id: "tripo3d-h31-character-lab-archmage-regalia",
    domain: "character-lab",
    nameKo: "3D 캐릭터 랩 대마법사 로열 케이프 & 마도서 스태프 세트 (Tripo H3.1 Ultra 8K)",
    descriptionKo: "Tripo Studio H3.1 최고 품질 + 울트라 메시 + 8K PBR로 생성한 로맨스 판타지 대마법사 망토·골드 필리그리 견갑·아케인 마도서 스태프 세트 GLB 모델",
    url: "/models/tripo3d-mcp/tripo_h31_archmage_cape_grimoire_staff.glb",
    fileName: "tripo_h31_archmage_cape_grimoire_staff.glb",
    byteSize: 2_029_660,
    sha256: "sha256:c0c92d4b2f7b72118462f4303da2bb8a01af5aa2f1f5404bceed8b5e52f6eaaf",
    triangles: 24_342,
    vertices: 18_507,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra 8K PBR, 1.96M Tri) → glbforge.optimize_glb(24.3k Tri, -97.1%)",
    recommendedPosePresetId: "dramatic",
  },
  {
    id: "tripo3d-h31-character-lab-knight-arms",
    domain: "character-lab",
    nameKo: "3D 캐릭터 랩 황실 성기사 검 & 문장 방패 무장 세트 (Tripo H3.1 Ultra 8K)",
    descriptionKo: "Tripo Studio H3.1 최고 품질 + 울트라 메시 + 8K PBR로 생성한 웹툰 판타지 성기사 롱소드·황금 문장 방패·무기 거치대 GLB 모델",
    url: "/models/tripo3d-mcp/tripo_h31_royal_knight_sword_shield.glb",
    fileName: "tripo_h31_royal_knight_sword_shield.glb",
    byteSize: 1_945_548,
    sha256: "sha256:1fc7775ecd81ff9bccb4c8f472b0d47f1da4f46674c7a2bc53b24fc304c7cb87",
    triangles: 24_000,
    vertices: 18_156,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra 8K PBR, 1.95M Tri) → glbforge.optimize_glb(24k Tri, -97.1%)",
    recommendedPosePresetId: "action",
  },
  {
    id: "tripo3d-mcp-character-lab-shoulder-pauldron",
    domain: "character-lab",
    nameKo: "3D 캐릭터 랩 아카데미 스타 크레스트 숄더 폴드런",
    descriptionKo: "로열 네이비 돔 장갑·골드 가드 트림·스타 엠블럼 코어 젬으로 구성된 3D 캐릭터 랩(Character Lab) 모듈형 어태치먼트 소품 GLB 모델",
    url: "/models/tripo3d-mcp/character_lab_crest_shoulder_pauldron.glb",
    fileName: "character_lab_crest_shoulder_pauldron.glb",
    byteSize: 41_980,
    sha256: "sha256:37566397f24ef35a0cb22e5d7f1fac012e1ae618c3624593ff51b81874e7cea2",
    triangles: 1856,
    vertices: 4246,
    drawCalls: 3,
    materials: 3,
    glbforgeScore: 95,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "tripo3d(Blender 5.2) → glbforge.optimize_glb(-75.6% 바이트 절감)",
    recommendedPosePresetId: "action",
  },
]);

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
