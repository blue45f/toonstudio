/**
 * Studio BG3D 필수 3D 포즈 마네킹(8종) · 필수 건축 소품(8종) · Refined V8 히어로 소품(11종) 카탈로그.
 *
 * `apps/web/public/creator-essentials/*.glb` (16종) 및
 * `apps/web/public/assets/3d/refined-v8/*.glb` (11종)의 총 27종 CC0-1.0 1st-party GLB 모델을
 * 3D 배경 편집기(BG3D) 에셋 라이브러리에서 원클릭으로 가져와 배치할 수 있게 한다.
 */

export type StudioBg3dEssentialAssetCategory =
  | "pose-3d"
  | "essential-prop-3d"
  | "refined-v8-prop-3d";

export interface StudioBg3dEssentialCategoryMeta {
  readonly id: StudioBg3dEssentialAssetCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
}

export const STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES: readonly StudioBg3dEssentialCategoryMeta[] =
  Object.freeze([
    {
      id: "pose-3d",
      labelKo: "인체 포즈 마네킹",
      labelEn: "3D Pose Mannequins",
      descriptionKo: "웹툰 구도·투시 데생 확인용 8종 인체 포즈 마네킹 (3면도 SVG 동반)",
    },
    {
      id: "essential-prop-3d",
      labelKo: "필수 건축 소품",
      labelEn: "Essential Architectural Props",
      descriptionKo: "책상·의자·벤치·책장·가로등·창문벽·문틀·계단 8종 경량 배경 모듈",
    },
    {
      id: "refined-v8-prop-3d",
      labelKo: "고품질 히어로 소품 V8",
      labelEn: "Refined Hero Props V8",
      descriptionKo: "칠판·신호등·우체통·소파·버블티·여우가면·로봇펫 등 11종 디테일 소품",
    },
  ]);

export interface StudioBg3dEssentialAssetEntry {
  readonly id: string;
  readonly category: StudioBg3dEssentialAssetCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly glbUrl: string;
  readonly previewUrl: string;
  /** 3D 포즈 마네킹 전용 3면도(정면·측면·후면) 데생 가이드 SVG 경로. */
  readonly turnaround2dUrl: string | null;
  readonly fileName: string;
  readonly license: "CC0-1.0";
  readonly tags: readonly string[];
}

type RawPoseRow = readonly [slug: string, labelKo: string, labelEn: string];
type RawEssentialPropRow = readonly [slug: string, labelKo: string, labelEn: string];
type RawRefinedV8Row = readonly [slug: string, labelKo: string, labelEn: string];

const RAW_POSE_ROWS: readonly RawPoseRow[] = [
  ["neutral", "기본 서기 마네킹", "Neutral Standing Pose"],
  ["weight-shift", "한쪽 체중 싣기 마네킹", "Weight Shift Pose"],
  ["walking", "걷기 키 포즈 마네킹", "Walking Key Pose"],
  ["running", "달리기 키 포즈 마네킹", "Running Key Pose"],
  ["seated", "앉기 참고 마네킹", "Seated Study Pose"],
  ["reaching", "위로 팔 뻗기 마네킹", "Overhead Reach Pose"],
  ["crouching", "웅크리기 참고 마네킹", "Crouching Study Pose"],
  ["arm-extension", "옆으로 팔 뻗기 마네킹", "Side Arm Extension Pose"],
];

const RAW_ESSENTIAL_PROP_ROWS: readonly RawEssentialPropRow[] = [
  ["desk", "작업 책상", "Work Desk"],
  ["chair", "등받이 의자", "Slatted Chair"],
  ["bench", "공원 벤치", "Park Bench"],
  ["bookshelf", "모듈 책장", "Modular Bookshelf"],
  ["streetlamp", "거리 가로등", "Street Lamp"],
  ["window-wall", "창문이 있는 벽 모듈", "Window Wall Module"],
  ["doorway", "출입문 틀", "Doorway Frame"],
  ["stairs", "6단 계단 모듈", "Six-Step Staircase"],
];

const RAW_REFINED_V8_ROWS: readonly RawRefinedV8Row[] = [
  ["blackboard", "교실 칠판 (V8)", "Classroom Blackboard V8"],
  ["desk", "교실·서재 책상 (V8)", "Study Desk V8"],
  ["chair", "원목 의자 (V8)", "Wooden Chair V8"],
  ["sofa", "라운지 소파 (V8)", "Lounge Sofa V8"],
  ["hanging_sign", "상점 돌출 간판 (V8)", "Hanging Shop Sign V8"],
  ["traffic_light", "보행자 신호등 (V8)", "Traffic Light V8"],
  ["mailbox", "거리 우체통 (V8)", "Street Mailbox V8"],
  ["bubble_tea", "버블티 컵 (V8)", "Bubble Tea Cup V8"],
  ["ice_cream_cone", "아이스크림 콘 (V8)", "Ice Cream Cone V8"],
  ["fox_mask", "축제 여우 가면 (V8)", "Festival Fox Mask V8"],
  ["robot_pet", "반려 로봇 펫 (V8)", "Companion Robot Pet V8"],
];

export const STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG: readonly StudioBg3dEssentialAssetEntry[] =
  Object.freeze([
    ...RAW_POSE_ROWS.map(([slug, labelKo, labelEn]): StudioBg3dEssentialAssetEntry =>
      Object.freeze({
        id: `pose-${slug}-3d`,
        category: "pose-3d",
        labelKo,
        labelEn,
        glbUrl: `/creator-essentials/pose-${slug}-3d.glb`,
        previewUrl: `/creator-essentials/pose-${slug}-3d.preview.svg`,
        turnaround2dUrl: `/creator-essentials/pose-${slug}-2d.svg`,
        fileName: `ToonStudio-pose-${slug}-3d.glb`,
        license: "CC0-1.0",
        tags: Object.freeze(["character", "pose", "mannequin", "포즈", "마네킹", labelKo]),
      }),
    ),
    ...RAW_ESSENTIAL_PROP_ROWS.map(([slug, labelKo, labelEn]): StudioBg3dEssentialAssetEntry =>
      Object.freeze({
        id: `prop-${slug}`,
        category: "essential-prop-3d",
        labelKo,
        labelEn,
        glbUrl: `/creator-essentials/prop-${slug}.glb`,
        previewUrl: `/creator-essentials/prop-${slug}.preview.png`,
        turnaround2dUrl: null,
        fileName: `ToonStudio-prop-${slug}.glb`,
        license: "CC0-1.0",
        tags: Object.freeze(["background", "prop", "essential", "배경", "소품", labelKo]),
      }),
    ),
    ...RAW_REFINED_V8_ROWS.map(([slug, labelKo, labelEn]): StudioBg3dEssentialAssetEntry => {
      const normalizedSlug = slug.replace(/_/gu, "-");
      return Object.freeze({
        id: `refined-v8-${normalizedSlug}`,
        category: "refined-v8-prop-3d",
        labelKo,
        labelEn,
        glbUrl: `/assets/3d/refined-v8/${slug}.glb`,
        previewUrl: `/assets/3d/refined-v8/thumbnails/${slug}.png`,
        turnaround2dUrl: null,
        fileName: `ToonStudio-refined-v8-${normalizedSlug}.glb`,
        license: "CC0-1.0",
        tags: Object.freeze(["background", "prop", "refined-v8", "히어로소품", labelKo]),
      });
    }),
  ]);

const ESSENTIAL_BY_ID = new Map(
  STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG.map((entry) => [entry.id, entry] as const),
);

export function findStudioBg3dEssentialAsset(
  id: string,
): StudioBg3dEssentialAssetEntry | undefined {
  return ESSENTIAL_BY_ID.get(id);
}

export function listStudioBg3dEssentialAssetsByCategory(
  category: StudioBg3dEssentialAssetCategory | null,
): readonly StudioBg3dEssentialAssetEntry[] {
  if (category === null) return STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG;
  return STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG.filter((entry) => entry.category === category);
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_MAX_BYTES = 16 * 1024 * 1024;

/**
 * 카탈로그 항목의 GLB 바이너리를 가져와 GLB 헤더를 검증한 뒤 `File` 객체로 반환한다.
 */
export async function fetchStudioBg3dEssentialGlbAsFile(
  entry: StudioBg3dEssentialAssetEntry,
  fetchImpl: typeof fetch = fetch,
): Promise<File> {
  const response = await fetchImpl(entry.glbUrl);
  if (!response.ok) {
    throw new Error(`3D 에셋을 불러오지 못했습니다 (${response.status}): ${entry.labelKo}`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 24 || bytes.byteLength > GLB_MAX_BYTES) {
    throw new Error(`유효하지 않은 GLB 파일 크기입니다: ${entry.labelKo}`);
  }
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== GLB_MAGIC || header.getUint32(4, true) !== 2) {
    throw new Error(`유효한 glTF 2.0 바이너리(GLB) 헤더가 아닙니다: ${entry.labelKo}`);
  }
  return new File([bytes], entry.fileName, { type: "model/gltf-binary" });
}
