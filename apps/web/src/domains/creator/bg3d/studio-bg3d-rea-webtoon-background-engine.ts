/**
 * REA(reverse-engineer-anything) 기반 3D 웹툰 배경 유사 서비스 역공학 합성 엔진
 * 및 VARCO 3D(22 디오라마 · 21 한국형 소품) · Tripo 3D(8종 배경 GLB) 실전 퀄리티 업그레이드 모듈.
 *
 * 역공학 근거:
 * 1. Live CDP Observation (`ev_8f271517d59033d5b725f054dedfb4c477d65388fc8716da94dba131282f90c9`,
 *    `ev_9d214c7906f4fa9d464d4234e584a2b1c69b35d61bed4cd87d447fd7e25259e9`):
 *    `https://studio.tripo3d.ai/ko/workspace/generate` (Smart Mesh P2.0 Quad / H3.1 PBR / 시맨틱 파츠 분할)
 * 2. GLBForge `inspect_geometry` 전수 실측:
 *    `apps/web/public/models/tripo3d-mcp/*.glb` 8종 배경 GLB의 월드 바운딩 박스, 피벗 오프셋(`min.y`),
 *    폴리곤 밀도 및 웹툰 인체 비례(1.70m 기준) 휴먼 스케일 자동 보정 계수(`calibratedScale`, `groundYOffset`)
 * 3. 글로벌 3D 웹툰 배경 생태계 8대 서비스 아키텍처 역공학 내재화:
 *    - 에이콘3D (Acon3D / Carpenstreet)
 *    - 스냅툰 (SnapToon Unreal NPR)
 *    - 클립스튜디오 3D LT (Clip Studio Paint EX LT Conversion)
 *    - 스케치업 웹툰 워크플로우 (SketchUp Webtoon Dynamic Components & Section Cut)
 *    - NC AI VARCO 3D (아이소메트릭 컷어웨이 디오라마 22종 & 한국형 소품 21종)
 *    - Tripo 3D Studio MCP (Smart Mesh P2.0 Quad & H3.1 Ultra 8K Delight PBR)
 *    - 돈드로우 (DonDraw 웹툰 3D 세트장 & 카메라 북마크)
 *    - 블렌더 Freestyle / LineArt & EEVEE Toon Shader
 */

import {
  TRIPO3D_MCP_GENERATED_MODELS,
  type Tripo3dMcpGeneratedModelEntry,
} from "../scene-3d/studio-tripo3d-customizer-engine";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type {
  Bg3dGlbItem,
  Bg3dPrimitiveItem,
  Bg3dPrimitiveShape,
  Vec3,
} from "../studio-background-3d-stage-types";

export {
  buildVarco3dDioramaDetailedPrimitives,
  buildVarco3dPropDetailedPrimitives,
  resolveReaDioramaSummaryKo,
} from "./studio-bg3d-varco-detailed-builders";

export function toBgPrimitives(items: readonly Bg3dPrimitiveItem[]): BgPrimitive[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.shape,
    name: item.componentRef?.name ?? item.id,
    position: [item.position[0], item.position[1], item.position[2]],
    rotation: [item.rotation[0], item.rotation[1], item.rotation[2]],
    scale: [item.scale[0], item.scale[1], item.scale[2]],
    color: item.color,
    visible: item.visible,
    locked: item.locked,
    materialOverride: {
      roughness: item.roughness,
      metalness: item.metalness,
    },
    ...(item.tags ? { tags: item.tags } : {}),
    ...(item.componentRef ? { componentRef: item.componentRef } : {}),
  }));
}

export type StudioBg3dReaCompetitorId =
  | "acon3d-carpenstreet"
  | "snaptoon-unreal-npr"
  | "clip-studio-3d-lt"
  | "sketchup-webtoon-warehouse"
  | "varco-3d-ncsoft"
  | "tripo-3d-studio-mcp"
  | "dondraw-webtoon-stage"
  | "blender-freestyle-lineart";

export type StudioBg3dTimeOfDayMoodId =
  | "daylight-clean"
  | "sunset-golden"
  | "night-neon"
  | "overcast-noir";

export interface StudioBg3dReaCompetitorProfile {
  readonly id: StudioBg3dReaCompetitorId;
  readonly serviceNameKo: string;
  readonly vendorOrOrigin: string;
  readonly evidenceKind: "rea-cdp-live" | "glbforge-static-audit" | "workflow-architecture-synthesis";
  readonly coreStrengthKo: string;
  readonly reverseEngineeredSystemsKo: readonly string[];
  readonly cameraPreset: {
    readonly fovDeg: number;
    readonly elevationDeg: number;
    readonly azimuthDeg: number;
    readonly twoPointPerspectiveLock: boolean;
  };
  readonly toonRenderProfile: {
    readonly silhouetteLineMm: number;
    readonly creaseLineMm: number;
    readonly detailLineMm: number;
    readonly shadowRampSteps: 2 | 3 | 4;
    readonly contactAoStrength: number;
    readonly windowBloomIntensity: number;
    readonly defaultMoodId: StudioBg3dTimeOfDayMoodId;
    readonly ambientKelvin: number;
  };
  readonly architecturalDressingFlags: {
    readonly cutawayWalls: boolean;
    readonly ceilingLightGrid: boolean;
    readonly windowMullionsAndBlinds: boolean;
    readonly baseboardAndCorniceMolding: boolean;
    readonly utilityAndSignageClutter: boolean;
  };
}

export const STUDIO_BG3D_REA_COMPETITOR_PROFILES: readonly StudioBg3dReaCompetitorProfile[] =
  Object.freeze([
    {
      id: "acon3d-carpenstreet",
      serviceNameKo: "에이콘3D (Acon3D 웹툰 배경 아키텍처)",
      vendorOrOrigin: "Carpenstreet / Acon3D",
      evidenceKind: "workflow-architecture-synthesis",
      coreStrengthKo: "한국형 상권·학교·오피스텔·로판 궁궐 모듈러 스냅과 카메라 시선 벽면 자동 컷어웨이",
      reverseEngineeredSystemsKo: [
        "카메라 시선 방향 벽·천장 자동 숨김(Cutaway Layer Group)",
        "0.5m/1.0m 건축 모듈 그리드 스냅 및 문·창문 개폐 힌지",
        "간판·전신주·배관·도어락·실외기 등 한국 웹툰 생활감 세트 드레싱",
      ],
      cameraPreset: {
        fovDeg: 34,
        elevationDeg: 24,
        azimuthDeg: 42,
        twoPointPerspectiveLock: true,
      },
      toonRenderProfile: {
        silhouetteLineMm: 1.8,
        creaseLineMm: 1.1,
        detailLineMm: 0.65,
        shadowRampSteps: 3,
        contactAoStrength: 0.48,
        windowBloomIntensity: 0.42,
        defaultMoodId: "daylight-clean",
        ambientKelvin: 5400,
      },
      architecturalDressingFlags: {
        cutawayWalls: true,
        ceilingLightGrid: true,
        windowMullionsAndBlinds: true,
        baseboardAndCorniceMolding: true,
        utilityAndSignageClutter: true,
      },
    },
    {
      id: "snaptoon-unreal-npr",
      serviceNameKo: "스냅툰 (SnapToon 실시간 툰 조명·무드 엔진)",
      vendorOrOrigin: "SnapToon (Unreal Engine NPR)",
      evidenceKind: "workflow-architecture-synthesis",
      coreStrengthKo: "실시간 시간대별(낮·노을·야경·느와르) 색온도 변환과 창문 발광 블룸·원경 외곽선 감쇠",
      reverseEngineeredSystemsKo: [
        "4단계 시간대 켈빈 프리셋(주간 5600K · 노을 3400K · 야경 네온 6600K · 흐린 느와르 4800K)",
        "원경 외곽선 두께 자동 감쇠(Depth-Attenuated Outline) 및 캐릭터 림라이트 분리",
        "창문·간판 이미시브 블룸과 실내 고드레이(God-Ray) 채광 대비",
      ],
      cameraPreset: {
        fovDeg: 32,
        elevationDeg: 22,
        azimuthDeg: 38,
        twoPointPerspectiveLock: true,
      },
      toonRenderProfile: {
        silhouetteLineMm: 1.6,
        creaseLineMm: 0.95,
        detailLineMm: 0.55,
        shadowRampSteps: 4,
        contactAoStrength: 0.55,
        windowBloomIntensity: 0.78,
        defaultMoodId: "sunset-golden",
        ambientKelvin: 3600,
      },
      architecturalDressingFlags: {
        cutawayWalls: true,
        ceilingLightGrid: true,
        windowMullionsAndBlinds: true,
        baseboardAndCorniceMolding: true,
        utilityAndSignageClutter: true,
      },
    },
    {
      id: "clip-studio-3d-lt",
      serviceNameKo: "클립스튜디오 3D LT (선화·스크린톤 3계층 추출)",
      vendorOrOrigin: "Celsys Clip Studio Paint EX",
      evidenceKind: "workflow-architecture-synthesis",
      coreStrengthKo: "외곽선·모서리선·재질 경계선 3계층 선화 분리와 3단계 망점 스크린톤 음영 양자화",
      reverseEngineeredSystemsKo: [
        "3계층 라인 추출(실루엣 2.2mm / 법선 크리즈 1.2mm / 머티리얼 경계 0.7mm)",
        "음영 밝기 구간별 스크린톤 농도 자동 분리(Core Shadow 65% / Mid Tone 25%)",
        "3소실점 투시 눈금자(Perspective Ruler) 수직선 보정",
      ],
      cameraPreset: {
        fovDeg: 30,
        elevationDeg: 26,
        azimuthDeg: 45,
        twoPointPerspectiveLock: true,
      },
      toonRenderProfile: {
        silhouetteLineMm: 2.2,
        creaseLineMm: 1.2,
        detailLineMm: 0.7,
        shadowRampSteps: 3,
        contactAoStrength: 0.62,
        windowBloomIntensity: 0.25,
        defaultMoodId: "daylight-clean",
        ambientKelvin: 5500,
      },
      architecturalDressingFlags: {
        cutawayWalls: true,
        ceilingLightGrid: true,
        windowMullionsAndBlinds: true,
        baseboardAndCorniceMolding: true,
        utilityAndSignageClutter: false,
      },
    },
    {
      id: "sketchup-webtoon-warehouse",
      serviceNameKo: "스케치업 웹툰 표준 (단면 커팅·휴먼 스케일 체계)",
      vendorOrOrigin: "SketchUp Webtoon Workflow",
      evidenceKind: "workflow-architecture-synthesis",
      coreStrengthKo: "1.70m 웹툰 캐릭터 기준 건축 비례(문 2.1m, 책상 0.75m, 계단 0.18m)와 단면 플레인",
      reverseEngineeredSystemsKo: [
        "Section Plane 단면 커팅 및 은선(Hidden-Line) 클린 에지 스타일",
        "구조체(Structure)·창호(Fixture)·가구(Furniture)·소품(Prop) 태그 계층 분리",
        "1.70m 성인 캐릭터 기준 문 높이 2.10m·천장고 2.80m~3.20m 휴먼 스케일 규격화",
      ],
      cameraPreset: {
        fovDeg: 35,
        elevationDeg: 28,
        azimuthDeg: 45,
        twoPointPerspectiveLock: true,
      },
      toonRenderProfile: {
        silhouetteLineMm: 1.7,
        creaseLineMm: 1.0,
        detailLineMm: 0.6,
        shadowRampSteps: 2,
        contactAoStrength: 0.4,
        windowBloomIntensity: 0.3,
        defaultMoodId: "daylight-clean",
        ambientKelvin: 5600,
      },
      architecturalDressingFlags: {
        cutawayWalls: true,
        ceilingLightGrid: false,
        windowMullionsAndBlinds: true,
        baseboardAndCorniceMolding: true,
        utilityAndSignageClutter: false,
      },
    },
    {
      id: "varco-3d-ncsoft",
      serviceNameKo: "NC AI VARCO 3D (디오라마 22종 · 한국형 소품 21종)",
      vendorOrOrigin: "NC AI VARCO 3D Cloud",
      evidenceKind: "rea-cdp-live",
      coreStrengthKo: "한국 학원·로판·무림·헌터·사이버펑크 22종 아이소메트릭 디오라마와 21종 실측 소품 결합",
      reverseEngineeredSystemsKo: [
        "아이소메트릭 L자형 컷어웨이 디오라마(카메라 방위각 35°~50°, 고도각 26°~34°)",
        "21종 한국형 웹툰 소품 실측 풋프린트(교실 책걸상, 3연동 사물함, 한옥 솟을대문, 포장마차 등)",
        "장르별 켈빈 색온도(3600K 로판 연회장 ~ 6800K 헌터 보스 던전) 자동 동조",
      ],
      cameraPreset: {
        fovDeg: 34,
        elevationDeg: 30,
        azimuthDeg: 45,
        twoPointPerspectiveLock: false,
      },
      toonRenderProfile: {
        silhouetteLineMm: 1.5,
        creaseLineMm: 0.9,
        detailLineMm: 0.55,
        shadowRampSteps: 3,
        contactAoStrength: 0.5,
        windowBloomIntensity: 0.52,
        defaultMoodId: "daylight-clean",
        ambientKelvin: 5000,
      },
      architecturalDressingFlags: {
        cutawayWalls: true,
        ceilingLightGrid: true,
        windowMullionsAndBlinds: true,
        baseboardAndCorniceMolding: true,
        utilityAndSignageClutter: true,
      },
    },
    {
      id: "tripo-3d-studio-mcp",
      serviceNameKo: "Tripo 3D Studio (Smart Mesh P2.0 & H3.1 8K PBR)",
      vendorOrOrigin: "Tripo AI (studio.tripo3d.ai)",
      evidenceKind: "glbforge-static-audit",
      coreStrengthKo: "Smart Mesh P2.0 쿼드 토폴로지·H3.1 8K Delight PBR·시맨틱 파츠 분할 및 GLBForge 스케일 보정",
      reverseEngineeredSystemsKo: [
        "REA CDP 실측(ev_8f271517d59033d5b725f054dedfb4c477d65388fc8716da94dba131282f90c9) 기반 워크스페이스 파이프라인",
        "GLBForge inspect_geometry 실측 기반 정규화 큐브(~0.98m) → 웹툰 휴먼 스케일 자동 증폭 및 바닥 피벗 보정",
        "8종 배경 키트별 4~5개 시맨틱 서브파츠(customizableParts) 개별 ON/OFF 및 프로시저럴 트윈 합성",
      ],
      cameraPreset: {
        fovDeg: 33,
        elevationDeg: 25,
        azimuthDeg: 40,
        twoPointPerspectiveLock: true,
      },
      toonRenderProfile: {
        silhouetteLineMm: 1.6,
        creaseLineMm: 1.0,
        detailLineMm: 0.6,
        shadowRampSteps: 3,
        contactAoStrength: 0.52,
        windowBloomIntensity: 0.6,
        defaultMoodId: "daylight-clean",
        ambientKelvin: 5200,
      },
      architecturalDressingFlags: {
        cutawayWalls: true,
        ceilingLightGrid: true,
        windowMullionsAndBlinds: true,
        baseboardAndCorniceMolding: true,
        utilityAndSignageClutter: true,
      },
    },
    {
      id: "dondraw-webtoon-stage",
      serviceNameKo: "돈드로우 (DonDraw 웹툰 연출 컷 카메라·소품 밀도)",
      vendorOrOrigin: "DonDraw Webtoon Stage",
      evidenceKind: "workflow-architecture-synthesis",
      coreStrengthKo: "웹툰 원고 컷 연출용 5대 카메라 앵글 북마크와 생활감 소품 밀도(Clutter) 제어",
      reverseEngineeredSystemsKo: [
        "웹툰 컷별 카메라 북마크(설정 롱샷·오버더숄더·하이앵글 압박·로우앵글 각성·아이소메트릭)",
        "배경 소품 밀도 3단계(미니멀·표준·고밀도 생활감) 즉시 전환",
        "인물 포커스 유지를 위한 배경 채도·명도 대비 자동 정돈",
      ],
      cameraPreset: {
        fovDeg: 36,
        elevationDeg: 20,
        azimuthDeg: 32,
        twoPointPerspectiveLock: true,
      },
      toonRenderProfile: {
        silhouetteLineMm: 1.9,
        creaseLineMm: 1.1,
        detailLineMm: 0.6,
        shadowRampSteps: 3,
        contactAoStrength: 0.45,
        windowBloomIntensity: 0.48,
        defaultMoodId: "daylight-clean",
        ambientKelvin: 5300,
      },
      architecturalDressingFlags: {
        cutawayWalls: true,
        ceilingLightGrid: true,
        windowMullionsAndBlinds: true,
        baseboardAndCorniceMolding: true,
        utilityAndSignageClutter: true,
      },
    },
    {
      id: "blender-freestyle-lineart",
      serviceNameKo: "블렌더 Freestyle / LineArt & EEVEE 툰 셰이더",
      vendorOrOrigin: "Blender NPR / Grease Pencil LineArt",
      evidenceKind: "workflow-architecture-synthesis",
      coreStrengthKo: "크리즈 각도(118°) 에지 검출·캐비티 하이라이트·바닥 접지 AO 그림자 캐처",
      reverseEngineeredSystemsKo: [
        "Crease Angle 118° 기준 구조 모서리 잉크선 검출 및 교차점 오버슈트 억제",
        "Cavity Curvature 하이라이트와 3단 ColorRamp 셀 셰이딩 결합",
        "바닥 접지면 Shadow Catcher Contact AO(0.55)로 공중 부양감 완전 제거",
      ],
      cameraPreset: {
        fovDeg: 32,
        elevationDeg: 27,
        azimuthDeg: 44,
        twoPointPerspectiveLock: true,
      },
      toonRenderProfile: {
        silhouetteLineMm: 2.0,
        creaseLineMm: 1.15,
        detailLineMm: 0.65,
        shadowRampSteps: 3,
        contactAoStrength: 0.58,
        windowBloomIntensity: 0.5,
        defaultMoodId: "daylight-clean",
        ambientKelvin: 5400,
      },
      architecturalDressingFlags: {
        cutawayWalls: true,
        ceilingLightGrid: true,
        windowMullionsAndBlinds: true,
        baseboardAndCorniceMolding: true,
        utilityAndSignageClutter: true,
      },
    },
  ]);

/**
 * GLBForge `inspect_geometry`로 실측한 Tripo 3D 배경 GLB 8종의 바운딩 박스·피벗·휴먼스케일 보정 원장.
 */
export interface StudioBg3dTripoGlbCalibrationSpec {
  readonly modelId: string;
  readonly labelKo: string;
  readonly url: `/models/tripo3d-mcp/${string}.glb`;
  readonly rawSizeMeters: readonly [number, number, number];
  readonly rawMinY: number;
  readonly pivotAtBase: boolean;
  readonly calibratedScale: number;
  readonly groundYOffset: number;
  readonly humanScaleDimensionsMeters: readonly [number, number, number];
  readonly recommendedAnchorPosition: Vec3;
  readonly linkedUniverseId: string;
}

export const STUDIO_BG3D_TRIPO_GLB_CALIBRATION_CATALOG: readonly StudioBg3dTripoGlbCalibrationSpec[] =
  Object.freeze([
    {
      modelId: "tripo3d-h31-bg-bus-stop-vending-shelter",
      labelKo: "한국 버스 정류장 쉘터 & 야간 음료 자판기 세트 (Tripo v3.1 PBR)",
      url: "/models/tripo3d-mcp/tripo_h31_korean_bus_stop_vending_shelter.glb",
      rawSizeMeters: [0.985, 0.742, 0.618],
      rawMinY: 0,
      pivotAtBase: true,
      calibratedScale: 3.8,
      groundYOffset: 0,
      humanScaleDimensionsMeters: [3.74, 2.82, 2.35],
      recommendedAnchorPosition: [0, 0, -1.2],
      linkedUniverseId: "daily-cafe-street",
    },
    {
      modelId: "tripo3d-p2-bg-street-cafe-kit",
      labelKo: "어반 스트리트 카페 모듈러 키트 (Smart Mesh P2.0)",
      url: "/models/tripo3d-mcp/tripo_p2_quad_street_cafe_kit.glb",
      rawSizeMeters: [0.994, 0.971, 1.0],
      rawMinY: -0.478,
      pivotAtBase: false,
      calibratedScale: 4.2,
      groundYOffset: 2.01,
      humanScaleDimensionsMeters: [4.17, 4.08, 4.2],
      recommendedAnchorPosition: [0, 2.01, -1.2],
      linkedUniverseId: "cafe-terrace",
    },
    {
      modelId: "tripo3d-h31-bg-classroom-furniture-kit",
      labelKo: "한국 고등학교 교실 가구 모듈러 키트 (H3.1 PBR)",
      url: "/models/tripo3d-mcp/tripo_h31_korean_classroom_furniture_kit.glb",
      rawSizeMeters: [0.978, 0.431, 0.781],
      rawMinY: -0.215,
      pivotAtBase: false,
      calibratedScale: 2.2,
      groundYOffset: 0.47,
      humanScaleDimensionsMeters: [2.15, 0.95, 1.72],
      recommendedAnchorPosition: [0, 0.47, 0],
      linkedUniverseId: "school-romance",
    },
    {
      modelId: "tripo3d-h31-bg-korean-convenience-store",
      labelKo: "한국 편의점 매장 & 야외 파라솔 세트 (H3.1 Ultra 8K)",
      url: "/models/tripo3d-mcp/tripo_h31_korean_convenience_store.glb",
      rawSizeMeters: [0.983, 0.823, 0.717],
      rawMinY: 0,
      pivotAtBase: true,
      calibratedScale: 5.2,
      groundYOffset: 0,
      humanScaleDimensionsMeters: [5.11, 4.28, 3.73],
      recommendedAnchorPosition: [0, 0, -1.5],
      linkedUniverseId: "convenience-alley",
    },
    {
      modelId: "tripo3d-h31-bg-romance-fantasy-palace-courtyard",
      labelKo: "로판 황실 대리석 분수 정원 파빌리온 (H3.1 Ultra 8K)",
      url: "/models/tripo3d-mcp/tripo_h31_romance_fantasy_palace_courtyard.glb",
      rawSizeMeters: [0.975, 0.828, 0.978],
      rawMinY: 0.001,
      pivotAtBase: true,
      calibratedScale: 7.4,
      groundYOffset: 0,
      humanScaleDimensionsMeters: [7.22, 6.13, 7.24],
      recommendedAnchorPosition: [0, 0, -1.8],
      linkedUniverseId: "rofan-palace",
    },
    {
      modelId: "tripo3d-h31-bg-industrial-rooftop-hvac",
      labelKo: "도심 옥상 물탱크 & 공조 설비 클러스터 (Tripo HD)",
      url: "/models/tripo3d-mcp/tripo_h31_industrial_rooftop_hvac_facility.glb",
      rawSizeMeters: [0.969, 0.857, 0.981],
      rawMinY: 0,
      pivotAtBase: true,
      calibratedScale: 4.5,
      groundYOffset: 0,
      humanScaleDimensionsMeters: [4.36, 3.86, 4.41],
      recommendedAnchorPosition: [0, 0, -1.4],
      linkedUniverseId: "cyberpunk-neon",
    },
    {
      modelId: "tripo3d-mcp-bg-korean-alley-stairway",
      labelKo: "한국 골목 10단 계단 & 적벽돌 담장 모듈 (Tripo3D MCP)",
      url: "/models/tripo3d-mcp/webtoon_korean_alley_stairway_module.glb",
      rawSizeMeters: [2.68, 2.69, 4.5],
      rawMinY: 0,
      pivotAtBase: true,
      calibratedScale: 1.0,
      groundYOffset: 0,
      humanScaleDimensionsMeters: [2.68, 2.69, 4.5],
      recommendedAnchorPosition: [0, 0, -1.0],
      linkedUniverseId: "convenience-alley",
    },
    {
      modelId: "tripo3d-mcp-bg-cafe-counter-cluster",
      labelKo: "카페 원목·쿼츠 카운터 집기 클러스터 (Tripo3D MCP)",
      url: "/models/tripo3d-mcp/webtoon_cafe_counter_fixture_cluster.glb",
      rawSizeMeters: [3.18, 2.32, 2.25],
      rawMinY: 0,
      pivotAtBase: true,
      calibratedScale: 1.0,
      groundYOffset: 0,
      humanScaleDimensionsMeters: [3.18, 2.32, 2.25],
      recommendedAnchorPosition: [0, 0, -1.2],
      linkedUniverseId: "cafe-terrace",
    },
    {
      modelId: "tripo3d-mcp-bg-rooftop-neon-signboard",
      labelKo: "웹툰 네온 엠블럼 간판 릴리프 (GLBForge + Tripo3D MCP)",
      url: "/models/tripo3d-mcp/webtoon_rooftop_neon_signboard.glb",
      rawSizeMeters: [1.13, 1.13, 0.12],
      rawMinY: -0.563,
      pivotAtBase: false,
      calibratedScale: 1.8,
      groundYOffset: 2.65,
      humanScaleDimensionsMeters: [2.03, 2.03, 0.22],
      recommendedAnchorPosition: [0, 2.65, -3.2],
      linkedUniverseId: "cyberpunk-neon",
    },
  ]);

export function getStudioBg3dTripoGlbCalibration(
  modelId: string,
): StudioBg3dTripoGlbCalibrationSpec {
  return (
    STUDIO_BG3D_TRIPO_GLB_CALIBRATION_CATALOG.find((item) => item.modelId === modelId) ??
    STUDIO_BG3D_TRIPO_GLB_CALIBRATION_CATALOG[0]!
  );
}

export function buildCalibratedTripoBg3dGlbPlacement(
  modelId: string,
  options?: {
    readonly positionOffset?: Vec3;
    readonly scaleMultiplier?: number;
    readonly rotationYRad?: number;
    readonly idPrefix?: string;
  },
): Bg3dGlbItem {
  const spec = getStudioBg3dTripoGlbCalibration(modelId);
  const modelEntry: Tripo3dMcpGeneratedModelEntry | undefined = TRIPO3D_MCP_GENERATED_MODELS.find(
    (m) => m.id === spec.modelId,
  );
  const mult = Math.max(0.25, Math.min(3.0, options?.scaleMultiplier ?? 1));
  const finalScale = Number((spec.calibratedScale * mult).toFixed(3));
  const offset = options?.positionOffset ?? [0, 0, 0];
  const groundedY = Number((spec.groundYOffset * mult + offset[1]).toFixed(3));
  const idPrefix = options?.idPrefix ?? "tripo3d-glb";

  return {
    id: `${idPrefix}-${spec.modelId}`,
    name: modelEntry?.nameKo ?? spec.labelKo,
    kind: "glb",
    url: spec.url,
    position: [
      Number((spec.recommendedAnchorPosition[0] + offset[0]).toFixed(3)),
      groundedY,
      Number((spec.recommendedAnchorPosition[2] + offset[2]).toFixed(3)),
    ],
    rotation: [0, options?.rotationYRad ?? 0, 0],
    scale: [finalScale, finalScale, finalScale],
    visible: true,
    locked: false,
  };
}

export function makeReaBg3dPrim(
  id: string,
  shape: Bg3dPrimitiveShape,
  position: Vec3,
  scale: Vec3,
  color: string,
  roughness: number,
  metalness: number,
  tags: readonly string[],
  componentRef?: { readonly id: string; readonly name: string },
  rotation: Vec3 = [0, 0, 0],
): Bg3dPrimitiveItem {
  return {
    id,
    kind: "primitive",
    shape,
    position: [
      Number(position[0].toFixed(3)),
      Number(position[1].toFixed(3)),
      Number(position[2].toFixed(3)),
    ],
    rotation,
    scale: [
      Math.max(0.03, Number(scale[0].toFixed(3))),
      Math.max(0.03, Number(scale[1].toFixed(3))),
      Math.max(0.03, Number(scale[2].toFixed(3))),
    ],
    color,
    roughness,
    metalness,
    visible: true,
    locked: false,
    tags,
    ...(componentRef ? { componentRef } : {}),
  };
}

const makePrim = makeReaBg3dPrim;

/**
 * Tripo 3D 배경 키트 8종의 시맨틱 파츠(`customizableParts`)를 즉각 편집 가능한 다중 프리미티브 트윈으로 합성한다.
 */
export function buildTripoBg3dProceduralTwinPrimitives(
  modelId: string,
  options?: {
    readonly enabledPartIds?: readonly string[];
    readonly anchorXZ?: readonly [number, number];
  },
): readonly Bg3dPrimitiveItem[] {
  const model =
    TRIPO3D_MCP_GENERATED_MODELS.find((m) => m.id === modelId && m.domain === "bg3d") ??
    TRIPO3D_MCP_GENERATED_MODELS.find((m) => m.domain === "bg3d")!;
  const cal = getStudioBg3dTripoGlbCalibration(model.id);
  const [ax, az] = options?.anchorXZ ?? [cal.recommendedAnchorPosition[0], cal.recommendedAnchorPosition[2]];
  const enabledSet = new Set(
    options?.enabledPartIds && options.enabledPartIds.length > 0
      ? options.enabledPartIds
      : model.customizableParts.map((p) => p.id),
  );
  const compRef = { id: `tripo3d-kit:${model.id}`, name: model.nameKo };
  const baseTag = ["tripo3d-bg-kit", model.topologyMode, model.id] as const;

  const partColors = ["#38bdf8", "#f59e0b", "#cbd5e1", "#94a3b8", "#f472b6"] as const;
  const activeParts = model.customizableParts.filter((p) => enabledSet.has(p.id));
  const partsToBuild = activeParts.length > 0 ? activeParts : model.customizableParts;

  const [hw, hh, hd] = cal.humanScaleDimensionsMeters;
  const items: Bg3dPrimitiveItem[] = [
    // 베이스 플랫폼/바운딩 앵커
    makePrim(
      `tripo-kit-base-${model.id}`,
      "box",
      [ax, Math.max(0.12, hh * 0.08), az],
      [hw * 0.92, Math.max(0.24, hh * 0.16), hd * 0.88],
      "#334155",
      0.42,
      0.38,
      baseTag,
      compRef,
    ),
  ];

  partsToBuild.forEach((part, index) => {
    const ratio = (index - (partsToBuild.length - 1) / 2) / Math.max(1, partsToBuild.length);
    const px = ax + ratio * hw * 0.65;
    const py = Math.max(0.45, hh * (0.32 + (index % 3) * 0.18));
    const pz = az + ((index % 2 === 0 ? -1 : 1) * hd * 0.18);
    const shape: Bg3dPrimitiveShape =
      part.id.includes("pillar") || part.id.includes("tank") || part.id.includes("stool") || part.id.includes("lamp")
        ? "cylinder"
        : part.id.includes("dome") || part.id.includes("fountain")
          ? "sphere"
          : "box";
    items.push(
      makePrim(
        `tripo-kit-part-${model.id}-${part.id}`,
        shape,
        [px, py, pz],
        [
          Math.max(0.45, hw / Math.max(2, partsToBuild.length)),
          Math.max(0.45, hh * 0.46),
          Math.max(0.38, hd * 0.36),
        ],
        partColors[index % partColors.length]!,
        0.35,
        0.25,
        [...baseTag, `part:${part.id}`],
        { id: `tripo3d-part:${model.id}:${part.id}`, name: `${model.nameKo} · ${part.labelKo}` },
      ),
    );
  });

  return items;
}
