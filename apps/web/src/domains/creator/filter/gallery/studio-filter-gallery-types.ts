/**
 * 필터 갤러리 공용 계약 — 가져오는 모듈이 없는 순수 타입·상수·가벼운 정규화만 둔다.
 *
 * 필터 갤러리는 다른 드로잉·사진 프로그램의 필터를 공개 매뉴얼의 기능 설명과 공개 알고리즘으로 독립 구현해 모은
 * 비파괴 효과 묶음이다. 문서에는 효과 id 와 매개변수만 저장하고(`StudioFilterGalleryStack`), 픽셀 커널은 지연 로드되는
 * 필터 엔진 청크에서만 실행된다. 이 파일은 즉시 로드되는 필드 모듈이 타입만 가져가도록 가볍게 유지한다.
 */

/** 커널이 받는 이미지. Konva ImageData 와 같은 모양(직선 알파 RGBA8, 행 우선)이며 제자리에서 고친다. */
export interface StudioFilterGalleryImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** 갤러리 분류. 사진 편집기 필터 메뉴와 그림 프로그램 필터 묶음을 합친 상위 분류다. */
export const STUDIO_FILTER_GALLERY_CATEGORIES = [
  "artistic",
  "brush-strokes",
  "sketch",
  "texture",
  "stylize",
  "distort",
  "pixelate",
  "render",
  "noise",
  "blur",
  "sharpen",
  "color",
  "edge",
  "light",
  "decor",
  "map",
] as const;

export type StudioFilterGalleryCategory = (typeof STUDIO_FILTER_GALLERY_CATEGORIES)[number];

export const STUDIO_FILTER_GALLERY_CATEGORY_LABELS: Readonly<Record<StudioFilterGalleryCategory, string>> = {
  artistic: "예술 효과",
  "brush-strokes": "붓 터치",
  sketch: "스케치",
  texture: "텍스처",
  stylize: "스타일화",
  distort: "왜곡",
  pixelate: "픽셀화",
  render: "렌더",
  noise: "노이즈",
  blur: "흐림",
  sharpen: "선명",
  color: "색",
  edge: "가장자리",
  light: "빛과 그림자",
  decor: "장식",
  map: "매핑",
};

export type StudioFilterGalleryParamValue = number | string | boolean;
export type StudioFilterGalleryParams = Readonly<Record<string, StudioFilterGalleryParamValue>>;

export type StudioFilterGalleryParamSpec =
  | {
    readonly key: string;
    readonly label: string;
    readonly control: "slider";
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly default: number;
    readonly suffix?: string;
  }
  | {
    readonly key: string;
    readonly label: string;
    readonly control: "select";
    readonly options: readonly { readonly value: string; readonly label: string }[];
    readonly default: string;
  }
  | { readonly key: string; readonly label: string; readonly control: "color"; readonly default: string }
  | { readonly key: string; readonly label: string; readonly control: "toggle"; readonly default: boolean };

/** 실행 문맥. seed 는 스택마다 고정이고 scale 은 문서 px 하나가 이미지 px 몇 개인지다(크기 매개변수 보정). */
export interface StudioFilterGalleryContext {
  readonly seed: number;
  readonly scale: number;
}

export interface StudioFilterGalleryEffectDef {
  /** `분류.이름` 형식의 안정 id. 문서에 저장되므로 바꾸지 않는다. */
  readonly id: string;
  readonly category: StudioFilterGalleryCategory;
  readonly label: string;
  readonly description: string;
  /**
   * 같은 기능을 가진 외부 프로그램의 공개 메뉴 이름(예: "Photoshop · 드라이 브러시"). 코드 출처가 아니라
   * 기능 대응표다. 구현은 공개 알고리즘과 기능 설명만으로 새로 썼다.
   */
  readonly references: readonly string[];
  readonly params: readonly StudioFilterGalleryParamSpec[];
  /** 픽셀당 상대 작업량(1 = 3×3 이웃 한 번 정도). 예산 거절과 미리보기 축소에 쓴다. */
  readonly cost: number;
  readonly apply: (
    image: StudioFilterGalleryImage,
    params: StudioFilterGalleryParams,
    context: StudioFilterGalleryContext,
  ) => void;
}

/** 문서에 저장되는 효과 한 개. */
export interface StudioFilterGalleryEntry {
  readonly id: string;
  readonly params: StudioFilterGalleryParams;
  /** 0~1. 효과 결과를 원본 위에 섞는 비율. 생략하면 1. */
  readonly opacity?: number;
  /** false 면 건너뛴다. 생략하면 true. */
  readonly enabled?: boolean;
}

/** 이미지 요소에 저장되는 비파괴 갤러리 스택. 위에서 아래 순서로 적용한다. */
export interface StudioFilterGalleryStack {
  readonly version: 1;
  readonly seed: number;
  readonly entries: readonly StudioFilterGalleryEntry[];
}

export const STUDIO_FILTER_GALLERY_MAX_ENTRIES = 8;
/** 한 번 실행에 허용하는 작업량 상한(픽셀 수 × cost 합). 넘으면 커널을 실행하지 않는다. */
export const STUDIO_FILTER_GALLERY_WORK_BUDGET = 4096 * 4096 * 24;
const ID_PATTERN = /^[a-z]+(?:-[a-z]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isStudioFilterGalleryEffectId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && ID_PATTERN.test(value);
}
