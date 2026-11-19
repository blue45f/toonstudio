/**
 * BG3D REA 공용 프리미티브·경쟁사 프로파일 리프 모듈 —
 * studio-bg3d-rea-webtoon-background-engine.ts ↔ studio-bg3d-prop-diorama-builders.ts
 * 순환 의존성 제거용.
 */
import type { BgPrimitiveKind } from "../studio-background-3d-metadata";

export type Bg3dPrimitiveShape = BgPrimitiveKind;
export type Vec3 = readonly [number, number, number];

export interface Bg3dPrimitiveItem {
  readonly id: string;
  readonly kind: "primitive";
  readonly shape: Bg3dPrimitiveShape;
  readonly position: [number, number, number];
  readonly rotation: Vec3;
  readonly scale: [number, number, number];
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly tags: readonly string[];
  readonly componentRef?: {
    readonly id: string;
    readonly name: string;
  };
}

export interface Bg3dGlbItem {
  readonly id: string;
  readonly name: string;
  readonly kind: "glb";
  readonly url: string;
  readonly position: [number, number, number];
  readonly rotation: [number, number, number];
  readonly scale: [number, number, number];
  readonly visible: boolean;
  readonly locked: boolean;
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
      cameraPreset: { fovDeg: 34, elevationDeg: 24, azimuthDeg: 42, twoPointPerspectiveLock: true },
      toonRenderProfile: { silhouetteLineMm: 1.8, creaseLineMm: 1.1, detailLineMm: 0.65, shadowRampSteps: 3, contactAoStrength: 0.48, windowBloomIntensity: 0.42, defaultMoodId: "daylight-clean", ambientKelvin: 5400 },
      architecturalDressingFlags: { cutawayWalls: true, ceilingLightGrid: true, windowMullionsAndBlinds: true, baseboardAndCorniceMolding: true, utilityAndSignageClutter: true },
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
      cameraPreset: { fovDeg: 32, elevationDeg: 22, azimuthDeg: 38, twoPointPerspectiveLock: true },
      toonRenderProfile: { silhouetteLineMm: 1.6, creaseLineMm: 0.95, detailLineMm: 0.55, shadowRampSteps: 4, contactAoStrength: 0.55, windowBloomIntensity: 0.78, defaultMoodId: "sunset-golden", ambientKelvin: 3600 },
      architecturalDressingFlags: { cutawayWalls: true, ceilingLightGrid: true, windowMullionsAndBlinds: true, baseboardAndCorniceMolding: true, utilityAndSignageClutter: true },
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
      cameraPreset: { fovDeg: 30, elevationDeg: 26, azimuthDeg: 45, twoPointPerspectiveLock: true },
      toonRenderProfile: { silhouetteLineMm: 2.2, creaseLineMm: 1.2, detailLineMm: 0.7, shadowRampSteps: 3, contactAoStrength: 0.62, windowBloomIntensity: 0.25, defaultMoodId: "daylight-clean", ambientKelvin: 5500 },
      architecturalDressingFlags: { cutawayWalls: true, ceilingLightGrid: true, windowMullionsAndBlinds: true, baseboardAndCorniceMolding: true, utilityAndSignageClutter: false },
    },
    {
      id: "sketchup-webtoon-warehouse",
      serviceNameKo: "단면·인체 비례 배경 프리셋",
      vendorOrOrigin: "SketchUp Webtoon Workflow",
      evidenceKind: "workflow-architecture-synthesis",
      coreStrengthKo: "1.70m 웹툰 캐릭터 기준 건축 비례(문 2.1m, 책상 0.75m, 계단 0.18m)와 단면 플레인",
      reverseEngineeredSystemsKo: [
        "Section Plane 단면 커팅 및 은선(Hidden-Line) 클린 에지 스타일",
        "구조체(Structure)·창호(Fixture)·가구(Furniture)·소품(Prop) 태그 계층 분리",
        "1.70m 성인 캐릭터 기준 문 높이 2.10m·천장고 2.80m~3.20m 휴먼 스케일 규격화",
      ],
      cameraPreset: { fovDeg: 35, elevationDeg: 28, azimuthDeg: 45, twoPointPerspectiveLock: true },
      toonRenderProfile: { silhouetteLineMm: 1.7, creaseLineMm: 1.0, detailLineMm: 0.6, shadowRampSteps: 2, contactAoStrength: 0.4, windowBloomIntensity: 0.3, defaultMoodId: "daylight-clean", ambientKelvin: 5600 },
      architecturalDressingFlags: { cutawayWalls: true, ceilingLightGrid: false, windowMullionsAndBlinds: true, baseboardAndCorniceMolding: true, utilityAndSignageClutter: false },
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
      cameraPreset: { fovDeg: 34, elevationDeg: 30, azimuthDeg: 45, twoPointPerspectiveLock: false },
      toonRenderProfile: { silhouetteLineMm: 1.5, creaseLineMm: 0.9, detailLineMm: 0.55, shadowRampSteps: 3, contactAoStrength: 0.5, windowBloomIntensity: 0.52, defaultMoodId: "daylight-clean", ambientKelvin: 5000 },
      architecturalDressingFlags: { cutawayWalls: true, ceilingLightGrid: true, windowMullionsAndBlinds: true, baseboardAndCorniceMolding: true, utilityAndSignageClutter: true },
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
      cameraPreset: { fovDeg: 33, elevationDeg: 25, azimuthDeg: 40, twoPointPerspectiveLock: true },
      toonRenderProfile: { silhouetteLineMm: 1.6, creaseLineMm: 1.0, detailLineMm: 0.6, shadowRampSteps: 3, contactAoStrength: 0.52, windowBloomIntensity: 0.6, defaultMoodId: "daylight-clean", ambientKelvin: 5200 },
      architecturalDressingFlags: { cutawayWalls: true, ceilingLightGrid: true, windowMullionsAndBlinds: true, baseboardAndCorniceMolding: true, utilityAndSignageClutter: true },
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
      cameraPreset: { fovDeg: 36, elevationDeg: 20, azimuthDeg: 32, twoPointPerspectiveLock: true },
      toonRenderProfile: { silhouetteLineMm: 1.9, creaseLineMm: 1.1, detailLineMm: 0.6, shadowRampSteps: 3, contactAoStrength: 0.45, windowBloomIntensity: 0.48, defaultMoodId: "daylight-clean", ambientKelvin: 5300 },
      architecturalDressingFlags: { cutawayWalls: true, ceilingLightGrid: true, windowMullionsAndBlinds: true, baseboardAndCorniceMolding: true, utilityAndSignageClutter: true },
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
      cameraPreset: { fovDeg: 32, elevationDeg: 27, azimuthDeg: 44, twoPointPerspectiveLock: true },
      toonRenderProfile: { silhouetteLineMm: 2.0, creaseLineMm: 1.15, detailLineMm: 0.65, shadowRampSteps: 3, contactAoStrength: 0.58, windowBloomIntensity: 0.5, defaultMoodId: "daylight-clean", ambientKelvin: 5400 },
      architecturalDressingFlags: { cutawayWalls: true, ceilingLightGrid: true, windowMullionsAndBlinds: true, baseboardAndCorniceMolding: true, utilityAndSignageClutter: true },
    },
  ]);

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
