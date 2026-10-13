/**
 * Studio BG3D 실제 HDRI 환경 에셋 카탈로그 (Poly Haven, CC0).
 *
 * 기존 "HDRI 느낌" 조명 프리셋(studio-bg3d-hdri-lighting-presets.ts)이 데이터만으로
 * 흉내 내던 환경광을, 실제 등거리(equirectangular) HDRI 이미지 기반 조명(IBL)으로
 * 승격하기 위한 에셋 정본입니다. 파일 자체는 이 레포에 커밋하지 않고 릴리스 단계에서
 * `remoteUrl`로 내려받아 `apps/web/public/assets/3d/hdri/`에 배치합니다(PLAN.md 참조).
 *
 * 라이선스 메타데이터 필드 구성은 번들 환경 카탈로그
 * (studio-bg3d-environment-catalog.ts)의 선례(license/licenseUrl/attributionRequired)를
 * 그대로 따릅니다. Poly Haven 전 에셋은 CC0라 출처 표기 의무가 없지만, 출처 추적을
 * 위해 sourceUrl과 체크섬을 함께 보존합니다.
 */

export type StudioBg3dHdriEnvironmentAssetId =
  | "combination-room"
  | "cobblestone-street-night"
  | "konigsallee";

/** HDRI 파일 해상도 티어. 1k는 모바일·기본, 2k는 데스크톱 품질 프로파일용입니다. */
export type StudioBg3dHdriFileTier = "1k" | "2k";

export interface StudioBg3dHdriRemoteFile {
  /** Poly Haven 파일 CDN 원본 URL (릴리스 단계 다운로드 소스). */
  readonly remoteUrl: string;
  readonly byteSize: number;
  /** Poly Haven 공개 API(/files/<id>)가 제공하는 md5. 무결성 검증용. */
  readonly md5: string;
}

export interface StudioBg3dHdriEnvironmentAsset {
  readonly id: StudioBg3dHdriEnvironmentAssetId;
  /** Poly Haven 에셋 ID (API 경로와 파일명의 기준). */
  readonly polyHavenId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /**
   * 이 환경이 어울리는 조명 프리셋 시간대. 프리셋 ID와 같은 어휘를 쓰지만,
   * 순환 임포트를 피하기 위해 이 모듈 안에서 독립 유니온으로 선언합니다.
   */
  readonly suggestedTimeOfDay: "daylight" | "twilight" | "night" | "studio";
  readonly sourceName: "Poly Haven";
  readonly sourceUrl: `https://polyhaven.com/a/${string}`;
  readonly license: "CC0-1.0";
  readonly licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/";
  readonly attributionRequired: false;
  readonly files: Readonly<Record<StudioBg3dHdriFileTier, StudioBg3dHdriRemoteFile>>;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * 선정 근거 (2026-10-13 Poly Haven 공개 API 실측):
 * 번들 환경 12종(아파트 실내·카페·교실·네온 골목·한국 편의점 밤·서울 지하철·학교 옥상 등)의
 * 조명 조건을 실내 주간 / 도시 야간 / 도시 황혼 3묶음으로 나누고, 묶음마다 1종씩 골랐습니다.
 * 상세 선정 과정과 대체 후보는 wave6/polyhaven/PLAN.md를 보세요.
 */
export const STUDIO_BG3D_HDRI_ENVIRONMENT_ASSETS: readonly StudioBg3dHdriEnvironmentAsset[] =
  deepFreeze([
    {
      id: "combination-room",
      polyHavenId: "combination_room",
      labelKo: "실내 · 낮",
      labelEn: "Indoor Day",
      descriptionKo:
        "창가의 자연광과 실내등이 섞인 일반적인 실내. 아파트·카페·교실 같은 실내 배경 전반의 환경광 기준입니다.",
      descriptionEn:
        "A generic interior mixing window daylight and practicals. The reference environment for apartment, cafe, and classroom scenes.",
      suggestedTimeOfDay: "daylight",
      sourceName: "Poly Haven",
      sourceUrl: "https://polyhaven.com/a/combination_room",
      license: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      attributionRequired: false,
      files: {
        "1k": {
          remoteUrl:
            "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/combination_room_1k.hdr",
          byteSize: 1_661_444,
          md5: "490f50c323b9329e5aa4a2ea32dc23aa",
        },
        "2k": {
          remoteUrl:
            "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/combination_room_2k.hdr",
          byteSize: 6_532_595,
          md5: "1f43bc52010775159f5c4270c68596b9",
        },
      },
    },
    {
      id: "cobblestone-street-night",
      polyHavenId: "cobblestone_street_night",
      labelKo: "거리 · 밤",
      labelEn: "Street Night",
      descriptionKo:
        "가로등과 상점 불빛이 젖은 돌바닥에 반사되는 도시 야간 거리. 네온 골목·편의점 밤 장면의 환경광 기준입니다.",
      descriptionEn:
        "An urban night street with lamps and shop lights reflecting on wet cobblestones. The reference for neon-alley and night-store scenes.",
      suggestedTimeOfDay: "night",
      sourceName: "Poly Haven",
      sourceUrl: "https://polyhaven.com/a/cobblestone_street_night",
      license: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      attributionRequired: false,
      files: {
        "1k": {
          remoteUrl:
            "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/cobblestone_street_night_1k.hdr",
          byteSize: 1_760_191,
          md5: "38d828b13e9ac07ab6fa80a1255c4459",
        },
        "2k": {
          remoteUrl:
            "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/cobblestone_street_night_2k.hdr",
          byteSize: 7_064_424,
          md5: "739ade89e23a42a52e1ffb051eef8dcd",
        },
      },
    },
    {
      id: "konigsallee",
      polyHavenId: "konigsallee",
      labelKo: "거리 · 황혼",
      labelEn: "Boulevard Dusk",
      descriptionKo:
        "해 질 녘 가로수 거리의 낮은 따뜻한 빛과 긴 그림자. 옥상·거리 황혼 장면의 환경광 기준입니다.",
      descriptionEn:
        "Low warm light and long shadows on a tree-lined boulevard at sunset. The reference for rooftop and street scenes at dusk.",
      suggestedTimeOfDay: "twilight",
      sourceName: "Poly Haven",
      sourceUrl: "https://polyhaven.com/a/konigsallee",
      license: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      attributionRequired: false,
      files: {
        "1k": {
          remoteUrl:
            "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/konigsallee_1k.hdr",
          byteSize: 1_652_556,
          md5: "cacb43f0552e659ba929fdb153a4ae79",
        },
        "2k": {
          remoteUrl:
            "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/konigsallee_2k.hdr",
          byteSize: 6_438_733,
          md5: "b2a10fa34b2d98f11b9692bb07d1f902",
        },
      },
    },
  ]);

/** ID로 HDRI 환경 에셋을 찾습니다. 없으면 undefined를 돌립니다. */
export function getStudioBg3dHdriEnvironmentAsset(
  id: string | null | undefined,
): StudioBg3dHdriEnvironmentAsset | undefined {
  if (typeof id !== "string") return undefined;
  return STUDIO_BG3D_HDRI_ENVIRONMENT_ASSETS.find((asset) => asset.id === id);
}

/** 저장된 문서 값 등이 카탈로그 ID인지 판정합니다(정규화용 타입 가드). */
export function isStudioBg3dHdriEnvironmentAssetId(
  value: unknown,
): value is StudioBg3dHdriEnvironmentAssetId {
  return (
    typeof value === "string" &&
    STUDIO_BG3D_HDRI_ENVIRONMENT_ASSETS.some((asset) => asset.id === value)
  );
}

/** 에셋 파일이 앱 안에서 서빙되는 로컬 파일명. `public/assets/3d/hdri/` 아래에 둡니다. */
export function studioBg3dHdriEnvironmentFileName(
  asset: StudioBg3dHdriEnvironmentAsset,
  tier: StudioBg3dHdriFileTier,
): `${string}.hdr` {
  return `${asset.polyHavenId}_${tier}.hdr`;
}

/** 뷰포트가 실제로 요청하는 로컬 URL. 환경 GLB 카탈로그와 같은 `/assets/3d/` 루트를 씁니다. */
export function resolveStudioBg3dHdriEnvironmentLocalUrl(
  asset: StudioBg3dHdriEnvironmentAsset,
  tier: StudioBg3dHdriFileTier,
): `/assets/3d/hdri/${string}.hdr` {
  return `/assets/3d/hdri/${studioBg3dHdriEnvironmentFileName(asset, tier)}`;
}
