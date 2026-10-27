/**
 * 2026-10-27 Tripo Studio 브라우저 실생성 22종 GLB 카탈로그 & 파츠별·머티리얼·체형 커스터마이징 엔진.
 * - Tripo Studio 무료 체험 크레딧(Smart Mesh P2.0 ×2, Smart UV ×2, 부분별 생성 ×1, 8K 텍스처 ×1) 전량 소진 원장
 * - 3D 배경(8종) · 3D 데생인형(6종) · 3D 캐릭터 랩(8종) 파츠별 ON/OFF, 툰셰이더·PBR·체형·커스텀 GLB 레시피 계산
 */

import { TRIPO3D_MCP_GENERATED_BATCH2_MODELS } from "./studio-tripo3d-mcp-catalog-batch2";
import type { StudioVarco3dMannequinPosePresetId } from "./studio-varco3d-character-lab-diorama-catalog";

export type Tripo3dMcpGeneratedModelDomain = "bg3d" | "mannequin" | "character-lab";

export type Tripo3dTopologyMode =
  | "quad-p2"
  | "segmented-parts"
  | "rigged-humanoid"
  | "h31-pbr"
  | "procedural-mcp";

export interface Tripo3dCustomizablePartSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly defaultEnabled: boolean;
}

export interface Tripo3dMcpGeneratedModelEntry {
  readonly id: string;
  readonly domain: Tripo3dMcpGeneratedModelDomain;
  readonly topologyMode: Tripo3dTopologyMode;
  readonly uvUnwrapped: boolean;
  readonly freeTrialBadgeKo?: string;
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
  readonly customizableParts: readonly Tripo3dCustomizablePartSpec[];
}

export interface TripoStudioFreeTrialItem {
  readonly id: string;
  readonly labelKo: string;
  readonly totalCount: number;
  readonly usedCount: number;
  readonly remainingCount: number;
  readonly generatedAssetIds: readonly string[];
}

export const TRIPO_STUDIO_FREE_TRIAL_LEDGER: readonly TripoStudioFreeTrialItem[] = Object.freeze([
  {
    id: "smart_mesh_v2_generation",
    labelKo: "스마트 메시 P2.0: 쿼드 & 편집 (Smart Mesh P2.0)",
    totalCount: 2,
    usedCount: 2,
    remainingCount: 0,
    generatedAssetIds: ["tripo3d-p2-bg-street-cafe-kit", "tripo3d-p2-mannequin-quad-body"],
  },
  {
    id: "uv_edit_generation",
    labelKo: "스마트 UV: AI 자동 언랩 (Smart UV)",
    totalCount: 2,
    usedCount: 2,
    remainingCount: 0,
    generatedAssetIds: ["tripo3d-p2-character-lab-anime-head-bust", "tripo3d-p2-mannequin-quad-body"],
  },
  {
    id: "ai-segmentation-free-trial",
    labelKo: "부분별 생성 / 시맨틱 파츠 분할 (Generate Parts)",
    totalCount: 1,
    usedCount: 1,
    remainingCount: 0,
    generatedAssetIds: ["tripo3d-seg-character-lab-knight-outfit", "tripo3d-seg-character-lab-school-uniform"],
  },
  {
    id: "ultra-texture-free-trial",
    labelKo: "울트라 8K 텍스처 생성 (8K Texture)",
    totalCount: 1,
    usedCount: 1,
    remainingCount: 0,
    generatedAssetIds: ["tripo3d-h31-bg-korean-convenience-store"],
  },
]);

function makeParts(entries: readonly [string, string][]): readonly Tripo3dCustomizablePartSpec[] {
  return Object.freeze(entries.map(([id, labelKo]) => ({ id, labelKo, defaultEnabled: true })));
}

export const TRIPO3D_MCP_GENERATED_MODELS: readonly Tripo3dMcpGeneratedModelEntry[] = Object.freeze([
  // ── 3D 배경 (bg3d: 9종) ──
  {
    id: "tripo3d-h31-bg-bus-stop-vending-shelter",
    domain: "bg3d",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
    freeTrialBadgeKo: "Tripo v3.1 실생성 #신규",
    nameKo: "웹툰 한국 버스 정류장 쉘터 & 야간 음료 자판기 세트 (Tripo v3.1 PBR)",
    descriptionKo: "Tripo v3.1(v3.1-20260211) PBR + Detailed 텍스처로 실생성하고 GLBForge Meshopt·WebP로 최적화한 버스 정류장 부스·벤치·발광 음료 자판기 배경 키트",
    url: "/models/tripo3d-mcp/tripo_h31_korean_bus_stop_vending_shelter.glb",
    fileName: "tripo_h31_korean_bus_stop_vending_shelter.glb",
    byteSize: 1_245_944,
    sha256: "sha256:b7f68a5e941d31bf0c0a8f5cecd206573fe01c77599fdac390cf5b6fa80e67c4",
    triangles: 25_000,
    vertices: 21_420,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 90,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "tripo-cli(v3.1-20260211 task 0dc4fcac) → glbforge.optimize_glb(25k Tri, -97.4%)",
    recommendedPosePresetId: "sitting",
    customizableParts: makeParts([["bus-shelter-roof", "정류장 캐노피 지붕"], ["waiting-bench", "대기석 벤치"], ["vending-machine", "발광 음료 자판기"], ["route-signpost", "노선 안내판"]]),
  },
  {
    id: "tripo3d-p2-bg-street-cafe-kit",
    domain: "bg3d",
    topologyMode: "quad-p2",
    uvUnwrapped: true,
    freeTrialBadgeKo: "Smart Mesh P2.0 무료 체험 #1",
    nameKo: "웹툰 어반 스트리트 카페 모듈러 커스터마이징 키트 (Smart Mesh P2.0 Quad)",
    descriptionKo: "스마트 메시 P2.0(쿼드 & 편집) 무료 체험으로 생성한 탈부착 어닝·간판·창틀·테이크아웃 카운터·야외 파라솔 모듈형 배경 키트",
    url: "/models/tripo3d-mcp/tripo_p2_quad_street_cafe_kit.glb",
    fileName: "tripo_p2_quad_street_cafe_kit.glb",
    byteSize: 166_128,
    sha256: "sha256:3c0f8a45d52e6ef42284546cb3d94c6da191b87ff9e36717fdbd9c6ca57b5f66",
    triangles: 23_999,
    vertices: 13_287,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 95,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(Smart Mesh P2.0 Quad 무료 체험 #1) → Blender 5.2 GLB → glbforge.optimize_glb(95/100)",
    recommendedPosePresetId: "sitting",
    customizableParts: makeParts([["awning-canopy", "어닝 캐노피"], ["neon-signboard", "전면 간판"], ["window-frame", "폴딩 창틀"], ["counter-bar", "테이크아웃 바"], ["parasol-table", "야외 파라솔 테이블"]]),
  },
  {
    id: "tripo3d-h31-bg-classroom-furniture-kit",
    domain: "bg3d",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
    nameKo: "웹툰 한국 고등학교 교실 가구 모듈러 커스터마이징 키트 (Tripo H3.1 PBR)",
    descriptionKo: "학생 책상·교실 의자·교탁·칠판·사물함을 개별 배치·스케일·색상 커스터마이징할 수 있는 한국 학원물 웹툰 실내 배경 키트",
    url: "/models/tripo3d-mcp/tripo_h31_korean_classroom_furniture_kit.glb",
    fileName: "tripo_h31_korean_classroom_furniture_kit.glb",
    byteSize: 1_278_248,
    sha256: "sha256:2b453f8a8d24770cf76a66d4f3d0e18f94db3f3948374a93e2dc22f780bf0d92",
    triangles: 23_999,
    vertices: 20_185,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra PBR Delight) → glbforge.optimize_glb(24k Tri, -92.4%)",
    recommendedPosePresetId: "sitting",
    customizableParts: makeParts([["student-desk", "학생 책상"], ["classroom-chair", "교실 의자"], ["teacher-podium", "교탁"], ["blackboard-wall", "칠판 모듈"], ["hallway-locker", "뒷문 사물함"]]),
  },
  {
    id: "tripo3d-h31-bg-korean-convenience-store",
    domain: "bg3d",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
    freeTrialBadgeKo: "8K 텍스처 무료 체험 #1",
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
    customizableParts: makeParts([["store-signboard", "편의점 간판"], ["glass-showcase", "전면 통유리 진열대"], ["outdoor-parasol", "야외 파라솔"], ["plastic-table-chairs", "편의점 테이블·의자"], ["beverage-cooler", "음료 쇼케이스"]]),
  },
  {
    id: "tripo3d-h31-bg-romance-fantasy-palace-courtyard",
    domain: "bg3d",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["marble-fountain-tier", "대리석 분수대"], ["corinthian-arch-pillars", "코린트 아치 기둥"], ["gold-filigree-dome", "황금 필리그리 돔"], ["courtyard-balustrade", "정원 난간"]]),
  },
  {
    id: "tripo3d-h31-bg-industrial-rooftop-hvac",
    domain: "bg3d",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["water-tank-tower", "옥상 물탱크"], ["hvac-condenser-bank", "HVAC 실외기 뱅크"], ["steel-catwalk-railing", "철골 난간·캣워크"], ["duct-piping", "공조 배관 라인"]]),
  },
  {
    id: "tripo3d-mcp-bg-korean-alley-stairway",
    domain: "bg3d",
    topologyMode: "procedural-mcp",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["concrete-steps-10", "10단 콘크리트 계단"], ["red-brick-wall", "적벽돌 담장"], ["stainless-handrail", "양측 핸드레일"], ["utility-meter-box", "가스·전기 계량기함"], ["alley-street-lamp", "골목 보안등"]]),
  },
  {
    id: "tripo3d-mcp-bg-cafe-counter-cluster",
    domain: "bg3d",
    topologyMode: "procedural-mcp",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["walnut-quartz-counter", "원목·쿼츠 카운터"], ["dual-espresso-machine", "듀얼 에스프레소 머신"], ["pastry-glass-showcase", "유리 쇼케이스"], ["bar-stools-x3", "바 스툴 3종"], ["pendant-lamps-x3", "펜던트 조명 3종"]]),
  },
  {
    id: "tripo3d-mcp-bg-rooftop-neon-signboard",
    domain: "bg3d",
    topologyMode: "procedural-mcp",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["neon-tube-front", "전면 네온 릴리프"], ["backing-frame-plate", "후면 베벨 프레임"]]),
  },

  // ── 3D 데생인형 (mannequin: 7종) ──
  {
    id: "tripo3d-h31-mannequin-artist-easel-kit",
    domain: "mannequin",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
    freeTrialBadgeKo: "Tripo v3.1 실생성 #신규",
    nameKo: "3D 데생인형 화실 원목 이젤·캔버스·포즈 교정 소품 키트 (Tripo v3.1 PBR)",
    descriptionKo: "Tripo v3.1(v3.1-20260211) PBR로 실생성한 화실 원목 이젤·캔버스·팔레트 및 듀얼 포즈 캘리브레이션 데생인형 소품 키트",
    url: "/models/tripo3d-mcp/tripo_h31_mannequin_artist_easel_prop_kit.glb",
    fileName: "tripo_h31_mannequin_artist_easel_prop_kit.glb",
    byteSize: 1_652_776,
    sha256: "sha256:038e3bfba90407baea20b28252ffa97c4f28dfd7f654066773485d1d578f210c",
    triangles: 24_998,
    vertices: 20_840,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 90,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "tripo-cli(v3.1-20260211 task 755bc3b4) → glbforge.optimize_glb(25k Tri, -96.5%)",
    recommendedPosePresetId: "standing",
    customizableParts: makeParts([["wooden-easel-frame", "화실 원목 이젤"], ["canvas-board", "드로잉 캔버스"], ["artist-palette", "물감 팔레트"], ["pose-prop-stand", "포즈 교정 거치대"]]),
  },
  {
    id: "tripo3d-p2-mannequin-quad-body",
    domain: "mannequin",
    topologyMode: "quad-p2",
    uvUnwrapped: true,
    freeTrialBadgeKo: "Smart Mesh P2.0 #2 + Smart UV #2",
    nameKo: "3D 데생인형 스마트 메시 P2.0 쿼드 & Smart UV 커스터마이징 바디",
    descriptionKo: "스마트 메시 P2.0 쿼드 무료 체험 및 Smart UV 자동 언랩 무료 체험으로 생성한 파츠별 체형·비례 편집용 데생인형 전신 GLB 모델",
    url: "/models/tripo3d-mcp/tripo_p2_quad_articulated_mannequin.glb",
    fileName: "tripo_p2_quad_articulated_mannequin.glb",
    byteSize: 159_484,
    sha256: "sha256:78b185e245883f3f7acc0ea4aa510117df305d24d7c895f8410c306b8a544eea",
    triangles: 23_999,
    vertices: 12_496,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 95,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(Smart Mesh P2.0 #2 + Smart UV #2) → Blender 5.2 GLB → glbforge(95/100)",
    recommendedPosePresetId: "standing",
    customizableParts: makeParts([["head-visor-block", "두상·시선 블록"], ["thorax-ribcage", "흉곽·상체"], ["pelvis-hip-block", "골반·힙 블록"], ["upper-lower-limbs", "상·하지 림"], ["ball-joint-rings", "관절 볼조인트 링"]]),
  },
  {
    id: "tripo3d-h31-mannequin-hands-grip-kit",
    domain: "mannequin",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
    nameKo: "3D 데생인형 교체형 손 포즈 & 무기 그립 레퍼런스 키트 (Tripo H3.1 PBR)",
    descriptionKo: "검 그립·마법 영창·주먹·펼친 손·스마트폰 파지 등 웹툰 작화 난도가 높은 손 관절 포즈를 파츠별로 골라 적용하는 데생인형 핸드 키트",
    url: "/models/tripo3d-mcp/tripo_h31_mannequin_expressive_hands_kit.glb",
    fileName: "tripo_h31_mannequin_expressive_hands_kit.glb",
    byteSize: 1_390_496,
    sha256: "sha256:1c02983a23c476ab8763ff03078f2aba86dbcb5c291e7c92c99383b06ff0b743",
    triangles: 24_000,
    vertices: 18_601,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra PBR, SSIM 0.924) → glbforge.optimize_glb(24k Tri, -92.3%)",
    recommendedPosePresetId: "action",
    customizableParts: makeParts([["sword-grip-hand", "검·무기 그립 손"], ["arcane-cast-hand", "마법 영창 손"], ["clenched-fist-hand", "타격 주먹 손"], ["open-palm-hand", "자연스러운 펼친 손"], ["wrist-ball-socket", "손목 볼 소켓"]]),
  },
  {
    id: "tripo3d-h31-mannequin-rigged-humanoid",
    domain: "mannequin",
    topologyMode: "rigged-humanoid",
    uvUnwrapped: true,
    nameKo: "3D 데생인형 자동 리깅 v3.0 휴머노이드 스켈레톤 모델 (Tripo Auto-Rig)",
    descriptionKo: "Tripo Studio 3D 리깅 v3.0(Mixamo/VRM 호환 스켈레톤 본 + 스킨 웨이트)이 적용되어 실시간 관절 회전 및 Text-to-Motion 리타게팅이 가능한 모델",
    url: "/models/tripo3d-mcp/tripo_h31_rigged_protagonist_humanoid.glb",
    fileName: "tripo_h31_rigged_protagonist_humanoid.glb",
    byteSize: 4_718_312,
    sha256: "sha256:f1ce2988647a0c764bf307b38ab6ed30227a583ba75e00a62216e8add6d4b3b2",
    triangles: 17_733,
    vertices: 19_992,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 70,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(Auto-Rigging v3.0 Mixamo Skeleton + 17.7k Retopo) → glbforge.optimize_glb",
    recommendedPosePresetId: "action",
    customizableParts: makeParts([["humanoid-armature-rig", "휴머노이드 스켈레톤 본"], ["upper-body-skinned", "상체 스킨 메시"], ["lower-body-skinned", "하체 스킨 메시"], ["head-neck-skinned", "두상·목 스킨 메시"]]),
  },
  {
    id: "tripo3d-h31-mannequin-articulated-body",
    domain: "mannequin",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["head-sight-line", "두상 중심 십자선"], ["sternum-thorax", "흉골·쇄골 랜드마크"], ["pelvis-landmark", "장골능·골반 블록"], ["limb-ball-joints", "사지 볼조인트"]]),
  },
  {
    id: "tripo3d-mcp-mannequin-calibration-rig",
    domain: "mannequin",
    topologyMode: "procedural-mcp",
    uvUnwrapped: true,
    nameKo: "3D 데생인형 8등신 관절·무게중심 캘리브레이션 리그",
    descriptionKo: "두상 시선 바이저·흉곽·골반 블록·좌우 12관절 구체와 수직 무게중심 추(Plumb Line)가 결합된 3D 데생인형 비례 교정 레퍼런스 모델",
    url: "/models/tripo3d-mcp/mannequin_articulated_calibration_rig.glb",
    fileName: "mannequin_articulated_calibration_rig.glb",
    byteSize: 124_740,
    sha256: "sha256:fcef181ae7fed30616c99b67704ea36008f7a60e0df908524cc254c1ebadb8b6",
    triangles: 7152,
    vertices: 15_188,
    drawCalls: 4,
    materials: 4,
    glbforgeScore: 95,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "tripo3d(create_object/set_material/execute_blender_code) → glbforge.optimize_glb(-80.3%)",
    recommendedPosePresetId: "standing",
    customizableParts: makeParts([["head-visor", "시선 방향 바이저"], ["ribcage-block", "흉곽 블록"], ["pelvis-block", "골반 블록"], ["joint-spheres-12", "12관절 피벗 구체"], ["plumb-line-axis", "수직 무게중심 추"]]),
  },
  {
    id: "tripo3d-mcp-mannequin-action-pedestal",
    domain: "mannequin",
    topologyMode: "procedural-mcp",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["angle-turntable-disc", "45° 앵글 턴테이블"], ["step-riser-low", "저단 스텝 블록"], ["step-riser-high", "고단 스텝 블록"], ["height-ruler-pillar", "8등신 신장 눈금 기둥"]]),
  },

  // ── 3D 캐릭터 랩 (character-lab: 9종) ──
  {
    id: "tripo3d-h31-character-lab-crystal-crown-halo-kit",
    domain: "character-lab",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
    freeTrialBadgeKo: "Tripo v3.1 실생성 #신규",
    nameKo: "3D 캐릭터 랩 로열 크리스탈 크라운 헤일로 & 날개 브로치 키트 (Tripo v3.1 PBR)",
    descriptionKo: "Tripo v3.1(v3.1-20260211) PBR로 실생성한 로열 크리스탈 왕관·헤일로 링·날개 숄더 브로치 캐릭터 소품 키트",
    url: "/models/tripo3d-mcp/tripo_h31_character_crystal_crown_halo_kit.glb",
    fileName: "tripo_h31_character_crystal_crown_halo_kit.glb",
    byteSize: 2_844_784,
    sha256: "sha256:a765d9eb04ad79c9ee889ce4b3a5dccc8df26b58f39588330b3da117202901f4",
    triangles: 24_999,
    vertices: 22_110,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 90,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "tripo-cli(v3.1-20260211 task e108ef66) → glbforge.optimize_glb(25k Tri, -94.3%)",
    recommendedPosePresetId: "dramatic",
    customizableParts: makeParts([["crystal-crown-tiara", "크리스탈 티아라 왕관"], ["radiant-halo-ring", "성광 헤일로 링"], ["winged-shoulder-brooch", "날개 숄더 브로치"], ["gem-pendant-chain", "보석 펜던트 체인"]]),
  },
  {
    id: "tripo3d-seg-character-lab-knight-outfit",
    domain: "character-lab",
    topologyMode: "segmented-parts",
    uvUnwrapped: true,
    freeTrialBadgeKo: "부분별 생성(Segmentation) 무료 체험 #1",
    nameKo: "3D 캐릭터 랩 판타지 기사단 파츠 분할 커스터마이징 의상 세트 (Tripo 부분별 생성)",
    descriptionKo: "부분별 생성(Generate Parts) 무료 체험으로 생성하여 왕관/투구·견갑·망토·튜닉 갑주·벨트·부츠를 개별 파츠로 ON/OFF·염색할 수 있는 GLB 모델",
    url: "/models/tripo3d-mcp/tripo_seg_fantasy_knight_outfit_set.glb",
    fileName: "tripo_seg_fantasy_knight_outfit_set.glb",
    byteSize: 174_136,
    sha256: "sha256:39e631b15beacbd183486a986c7b96364f2a410e696eaa7838c98710474ba0bc",
    triangles: 23_988,
    vertices: 13_663,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 80,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 + 부분별 생성 무료 체험 #1) → glbforge.optimize_glb(24k Tri, -98.2%)",
    recommendedPosePresetId: "standing",
    customizableParts: makeParts([["crown-helm", "왕관·헤드기어"], ["shoulder-pauldron", "문장 견갑"], ["royal-cape", "로열 망토"], ["tunic-armor", "튜닉 상의 갑주"], ["belt-tasset", "벨트·타셋"], ["greaves-boots", "그리브 부츠"]]),
  },
  {
    id: "tripo3d-seg-character-lab-school-uniform",
    domain: "character-lab",
    topologyMode: "segmented-parts",
    uvUnwrapped: true,
    nameKo: "3D 캐릭터 랩 로판/아카데미 여주인공 파츠 분할 교복·케이프 세트 (Tripo Segmented)",
    descriptionKo: "헤어 리본·케이프 블레이저·보타이 칼라·플리츠 스커트·로퍼 부츠가 시맨틱 파츠로 분할되어 슬롯별 색상·표시 여부를 커스터마이징할 수 있는 GLB 모델",
    url: "/models/tripo3d-mcp/tripo_seg_school_uniform_outfit_set.glb",
    fileName: "tripo_seg_school_uniform_outfit_set.glb",
    byteSize: 170_648,
    sha256: "sha256:002fc45754046521259278fad56a64263509764b6f3a8b987319aab1d40ba4ad",
    triangles: 23_996,
    vertices: 13_033,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 80,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 + 시맨틱 파츠 분할) → glbforge.optimize_glb(24k Tri, -98.2%)",
    recommendedPosePresetId: "standing",
    customizableParts: makeParts([["hair-ribbon", "헤어 리본"], ["capelet-blazer", "케이프 블레이저"], ["collar-bowtie", "칼라·보타이"], ["pleated-skirt", "플리츠 스커트"], ["loafers-socks", "로퍼·니삭스"]]),
  },
  {
    id: "tripo3d-h31-character-lab-hair-headgear-kit",
    domain: "character-lab",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
    nameKo: "3D 캐릭터 랩 트윈테일 헤어·헤일로 왕관·사이버펑크 헤드셋 커스터마이징 키트",
    descriptionKo: "캐릭터 헤드 슬롯에 교체 장착할 수 있는 레이어드 트윈테일 가발·성스러운 헤일로 크라운·사이버펑크 바이저 헤드셋 모듈형 키트",
    url: "/models/tripo3d-mcp/tripo_h31_character_hair_headgear_kit.glb",
    fileName: "tripo_h31_character_hair_headgear_kit.glb",
    byteSize: 1_575_056,
    sha256: "sha256:c817f3ed624bb32392798b04116c6a1ef96f29b3655a36f33e3e9a0bf819d247",
    triangles: 23_999,
    vertices: 19_595,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 85,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(H3.1 Ultra PBR) → glbforge.optimize_glb(24k Tri, -91.6%)",
    recommendedPosePresetId: "standing",
    customizableParts: makeParts([["twintail-hair-wig", "트윈테일 헤어 가발"], ["halo-crown-ring", "헤일로 크라운"], ["cyberpunk-visor-headset", "사이버펑크 헤드셋"], ["bust-mannequin-stand", "전시 거치대"]]),
  },
  {
    id: "tripo3d-p2-character-lab-anime-head-bust",
    domain: "character-lab",
    topologyMode: "quad-p2",
    uvUnwrapped: true,
    freeTrialBadgeKo: "Smart UV 무료 체험 #1",
    nameKo: "3D 캐릭터 랩 스마트 메시 쿼드 & Smart UV 애니메 헤드·헤어 버스트",
    descriptionKo: "Smart Mesh 쿼드 토폴로지 및 Smart UV 자동 언랩 무료 체험을 적용해 얼굴 문양·안구·헤어 브릿지 텍스처 페인팅이 용이한 헤드 버스트 GLB 모델",
    url: "/models/tripo3d-mcp/tripo_p2_quad_anime_head_bust.glb",
    fileName: "tripo_p2_quad_anime_head_bust.glb",
    byteSize: 73_796,
    sha256: "sha256:b5da0c3b5a3613170538e7f82d3e5051d9a338c474b6d1f851210fde6c2da6ff",
    triangles: 10_250,
    vertices: 5_492,
    drawCalls: 1,
    materials: 1,
    glbforgeScore: 95,
    glbforgeProfile: "mobile-hero@1",
    mcpPipelineKo: "studio.tripo3d.ai(Smart Mesh Quad + Smart UV 무료 체험 #1) → glbforge.optimize_glb(SSIM 0.9993)",
    recommendedPosePresetId: "standing",
    customizableParts: makeParts([["face-contour-quad", "안면 쿼드 메시"], ["front-bangs-layer", "앞머리 레이어"], ["side-twintail-locks", "양갈래 사이드 락"], ["neck-collar-base", "목·칼라 베이스"]]),
  },
  {
    id: "tripo3d-h31-character-lab-protagonist",
    domain: "character-lab",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["protagonist-hair", "주인공 헤어"], ["layered-blazer-jacket", "레이어드 재킷"], ["cargo-trousers", "슬랙스·팬츠"], ["combat-boots", "워커 부츠"]]),
  },
  {
    id: "tripo3d-h31-character-lab-archmage-regalia",
    domain: "character-lab",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["archmage-velvet-cape", "대마법사 벨벳 케이프"], ["gold-filigree-collar", "황금 필리그리 칼라"], ["floating-grimoire-tome", "부유 마도서"], ["arcane-crystal-staff", "아케인 크리스탈 스태프"]]),
  },
  {
    id: "tripo3d-h31-character-lab-knight-arms",
    domain: "character-lab",
    topologyMode: "h31-pbr",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["paladin-longsword", "성기사 롱소드"], ["royal-crest-shield", "황실 문장 방패"], ["gem-hilt-guard", "보석 크로스 가드"], ["display-armory-stand", "무기 거치대"]]),
  },
  {
    id: "tripo3d-mcp-character-lab-shoulder-pauldron",
    domain: "character-lab",
    topologyMode: "procedural-mcp",
    uvUnwrapped: true,
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
    customizableParts: makeParts([["pauldron-navy-dome", "네이비 장갑 돔"], ["gold-trim-rim", "골드 가드 트림"], ["star-emblem-gem", "스타 엠블럼 코어 젬"]]),
  },
  ...TRIPO3D_MCP_GENERATED_BATCH2_MODELS,
]);

export type Tripo3dCustomizerPaletteId =
  | "webtoon-cel-day"
  | "romance-gold-palace"
  | "academy-navy-crimson"
  | "cyberpunk-neon-night"
  | "noir-monochrome";

export interface Tripo3dCustomizerPalette {
  readonly id: Tripo3dCustomizerPaletteId;
  readonly labelKo: string;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly accentHex: string;
  readonly defaultToonRampSteps: 2 | 3 | 4;
  readonly defaultOutlineWidthMm: number;
}

export const TRIPO3D_CUSTOMIZER_PALETTES: readonly Tripo3dCustomizerPalette[] = Object.freeze([
  { id: "webtoon-cel-day", labelKo: "일상·학원 클린 셀셰이딩", primaryHex: "#F4EFEA", secondaryHex: "#38527D", accentHex: "#F59E0B", defaultToonRampSteps: 3, defaultOutlineWidthMm: 1.5 },
  { id: "romance-gold-palace", labelKo: "로판 황실 화이트·골드", primaryHex: "#FAF5EE", secondaryHex: "#1E293B", accentHex: "#D4AF37", defaultToonRampSteps: 4, defaultOutlineWidthMm: 1.2 },
  { id: "academy-navy-crimson", labelKo: "아카데미 네이비·크림슨", primaryHex: "#1E3A8A", secondaryHex: "#991B1B", accentHex: "#FBBF24", defaultToonRampSteps: 3, defaultOutlineWidthMm: 1.8 },
  { id: "cyberpunk-neon-night", labelKo: "사이버펑크 야경 네온", primaryHex: "#0F172A", secondaryHex: "#06B6D4", accentHex: "#EC4899", defaultToonRampSteps: 2, defaultOutlineWidthMm: 2.2 },
  { id: "noir-monochrome", labelKo: "스릴러·느와르 먹선", primaryHex: "#E2E8F0", secondaryHex: "#1E293B", accentHex: "#EF4444", defaultToonRampSteps: 2, defaultOutlineWidthMm: 2.8 },
]);

export type Tripo3dHandPoseVariantId = "relaxed" | "sword-grip" | "arcane-cast" | "clenched-fist" | "peace-sign" | "smartphone-hold";

export const TRIPO3D_HAND_POSE_VARIANTS: readonly {
  readonly id: Tripo3dHandPoseVariantId;
  readonly labelKo: string;
  readonly mannequinPosePresetId: StudioVarco3dMannequinPosePresetId;
}[] = Object.freeze([
  { id: "relaxed", labelKo: "자연스러운 손", mannequinPosePresetId: "standing" },
  { id: "sword-grip", labelKo: "검·무기 그립", mannequinPosePresetId: "action" },
  { id: "arcane-cast", labelKo: "마법 영창 손", mannequinPosePresetId: "dramatic" },
  { id: "clenched-fist", labelKo: "전투 주먹", mannequinPosePresetId: "action" },
  { id: "peace-sign", labelKo: "브이·제스처", mannequinPosePresetId: "walking" },
  { id: "smartphone-hold", labelKo: "스마트폰 파지", mannequinPosePresetId: "sitting" },
]);

export interface Tripo3dCustomizationInput {
  readonly modelId: string;
  readonly customGlbUrl?: string;
  readonly enabledPartIds: readonly string[];
  readonly paletteId: Tripo3dCustomizerPaletteId;
  readonly primaryColorHex?: string;
  readonly accentColorHex?: string;
  readonly toonRampSteps?: 2 | 3 | 4;
  readonly outlineWidthMm?: number;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly scaleMultiplier?: number;
  readonly mannequinHeadRatio?: number;
  readonly handPoseVariantId?: Tripo3dHandPoseVariantId;
}

export interface Tripo3dCustomizationRecipe {
  readonly model: Tripo3dMcpGeneratedModelEntry;
  readonly effectiveGlbUrl: string;
  readonly isCustomUrlOverride: boolean;
  readonly activePartIds: readonly string[];
  readonly activePartCount: number;
  readonly totalPartCount: number;
  readonly estimatedActiveTriangles: number;
  readonly palette: Tripo3dCustomizerPalette;
  readonly primaryColorHex: string;
  readonly accentColorHex: string;
  readonly toonRampSteps: 2 | 3 | 4;
  readonly outlineWidthMm: number;
  readonly roughness: number;
  readonly metallic: number;
  readonly scaleMultiplier: number;
  readonly mannequinHeadRatio: number;
  readonly handPoseVariantId: Tripo3dHandPoseVariantId;
  readonly mannequinBodySliders: {
    readonly heightCm: number; readonly headCount: number; readonly build: number;
    readonly shoulderWidth: number; readonly hipWidth: number; readonly height: number;
    readonly muscle: number; readonly chest: number; readonly pelvis: number; readonly legRatio: number;
  };
  readonly shaderSummaryKo: string;
  readonly exportableJson: string;
}

export function buildTripo3dCustomizationRecipe(input: Tripo3dCustomizationInput): Tripo3dCustomizationRecipe {
  const model = TRIPO3D_MCP_GENERATED_MODELS.find((m) => m.id === input.modelId) ?? TRIPO3D_MCP_GENERATED_MODELS[0]!;
  const palette = TRIPO3D_CUSTOMIZER_PALETTES.find((p) => p.id === input.paletteId) ?? TRIPO3D_CUSTOMIZER_PALETTES[0]!;
  const trimmedCustomUrl = (input.customGlbUrl ?? "").trim();
  const isCustomUrlOverride =
    trimmedCustomUrl.length > 0 &&
    (trimmedCustomUrl.endsWith(".glb") || trimmedCustomUrl.endsWith(".vrm") || trimmedCustomUrl.startsWith("/models/") || trimmedCustomUrl.startsWith("https://"));
  const effectiveGlbUrl = isCustomUrlOverride ? trimmedCustomUrl : model.url;
  const validPartIds = new Set(model.customizableParts.map((p) => p.id));
  const filteredParts = input.enabledPartIds.filter((id) => validPartIds.has(id));
  const activePartIds = filteredParts.length > 0 ? filteredParts : model.customizableParts.map((p) => p.id);
  const totalPartCount = Math.max(1, model.customizableParts.length);
  const activePartCount = activePartIds.length;
  const estimatedActiveTriangles = Math.max(120, Math.round(model.triangles * (activePartCount / totalPartCount)));

  const primaryColorHex = input.primaryColorHex ?? palette.primaryHex;
  const accentColorHex = input.accentColorHex ?? palette.accentHex;
  const toonRampSteps = input.toonRampSteps ?? palette.defaultToonRampSteps;
  const outlineWidthMm = Number(Math.min(5, Math.max(0, input.outlineWidthMm ?? palette.defaultOutlineWidthMm)).toFixed(2));
  const roughness = Number(Math.min(1, Math.max(0, input.roughness ?? 0.38)).toFixed(2));
  const metallic = Number(Math.min(1, Math.max(0, input.metallic ?? 0.12)).toFixed(2));
  const scaleMultiplier = Number(Math.min(2.5, Math.max(0.4, input.scaleMultiplier ?? 1.0)).toFixed(2));
  const mannequinHeadRatio = Number(Math.min(9.0, Math.max(5.0, input.mannequinHeadRatio ?? 7.5)).toFixed(1));
  const handPoseVariantId = input.handPoseVariantId ?? "relaxed";

  const ratioDelta = (mannequinHeadRatio - 7.5) / 1.5;
  const mannequinBodySliders = {
    heightCm: Math.round(170 + ratioDelta * 14),
    headCount: mannequinHeadRatio,
    build: Number(Math.min(2.2, Math.max(0.6, 1 + (scaleMultiplier - 1) * 0.6)).toFixed(2)),
    shoulderWidth: Number(Math.min(1.3, Math.max(0.8, 1 + (scaleMultiplier - 1) * 0.25)).toFixed(2)),
    hipWidth: 1,
    height: Math.round(Math.min(100, Math.max(0, 65 + ratioDelta * 25))),
    muscle: Math.round(Math.min(100, Math.max(0, 50 + (scaleMultiplier - 1) * 30))),
    chest: Math.round(Math.min(100, Math.max(0, 52 + ratioDelta * 12))),
    pelvis: 48,
    legRatio: Math.round(Math.min(100, Math.max(0, 58 + ratioDelta * 22))),
  };
  const shaderSummaryKo = `${palette.labelKo} (${primaryColorHex}/${accentColorHex}) · ${toonRampSteps}단 셀셰이딩 · 외곽선 ${outlineWidthMm}mm · PBR R${roughness}/M${metallic} · 활성 파츠 ${activePartCount}/${totalPartCount} (${estimatedActiveTriangles.toLocaleString("ko-KR")} Tri)`;
  const exportableJson = JSON.stringify({
    schema: "toonstudio.tripo3d-customization-recipe.v1",
    modelId: model.id, domain: model.domain, topologyMode: model.topologyMode, effectiveGlbUrl,
    activePartIds, paletteId: palette.id, primaryColorHex, accentColorHex, toonRampSteps,
    outlineWidthMm, roughness, metallic, scaleMultiplier, mannequinHeadRatio, handPoseVariantId,
  });

  return {
    model, effectiveGlbUrl, isCustomUrlOverride, activePartIds, activePartCount, totalPartCount,
    estimatedActiveTriangles, palette, primaryColorHex, accentColorHex, toonRampSteps, outlineWidthMm,
    roughness, metallic, scaleMultiplier, mannequinHeadRatio, handPoseVariantId, mannequinBodySliders,
    shaderSummaryKo, exportableJson,
  };
}
