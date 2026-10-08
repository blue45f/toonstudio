import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringMapId } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 세미나 발표(talk) 슬라이드의 데이터 계약.
 *
 * 원본 데이터(`engineering-talk-deck.ts`)가 1,000줄 안에 머물도록 타입과 슬라이드 본문을 나눴다.
 * 이 파일은 타입만 가진다. 슬라이드 본문은 `engineering-talk-slides-*.ts`, 집계와 시간표는 `engineering-talk-deck.ts`다.
 */

export type TalkSectionId =
  | "opening"
  | "product"
  | "architecture"
  | "core"
  | "quality"
  | "operations"
  | "lessons"
  | "qa";

export interface TalkSection {
  readonly id: TalkSectionId;
  readonly title: LocalizedText;
}

export type TalkSlideLayout =
  | "cover"
  | "agenda"
  | "statement"
  | "modules"
  | "demo"
  | "diagram"
  | "tech"
  | "metrics"
  | "lessons"
  | "qa"
  /** 기술 도감 카드의 도식·코드·사용처를 그대로 보여주는 슬라이드(`atlas` 필드 필요). */
  | "atlas"
  /** 열 제목과 행으로 된 지도(오픈소스·무료 서비스·벤치마크 등, `table` 필드 필요). */
  | "table";

export type TalkModuleIcon = "canvas" | "character" | "space" | "collab" | "ai" | "publish";

export interface TalkModule {
  readonly id: string;
  readonly icon: TalkModuleIcon;
  readonly title: LocalizedText;
  readonly body: LocalizedText;
  readonly href?: string;
  /** 이 작업 공간을 떠받치는 기술 이름(칩, engineering-external-links 로 링크를 해결한다). */
  readonly stack?: readonly string[];
}

/** 슬라이드가 도감 카드의 어느 면을 보여줄지. 도감이 정본이라 내용을 복제하지 않는다. */
export interface TalkAtlasRef {
  readonly id: string;
  readonly view: "diagram" | "code" | "usage";
  /** `code` 뷰에서 쓸 샘플 번호(0부터). 기본 0. */
  readonly sample?: number;
}

export interface TalkTable {
  readonly columns: readonly LocalizedText[];
  readonly rows: readonly (readonly LocalizedText[])[];
  readonly caption?: LocalizedText;
}

/**
 * 표 슬라이드가 어디에서 옮겨 온 내용인지. 콘텐츠 테스트가 근거가 실제로 있는지, 상태·기록일·숫자가 근거와 맞는지 대조한다.
 * - `map`: 기술 지도의 행 id(표의 행 순서와 같다).
 * - `map-grouped`: 지도의 행을 `groupCell` 칸의 값(예: 영역)으로 묶어 한 행씩 만든 표. 행 목록은 코드가 지도에서 계산한다
 *   (묶는 규칙과 감시 목록 제외는 `engineering-talk-benchmarks.ts`).
 * - `atlas`: 도감 카드 id(표의 행 순서와 같다).
 */
export type TalkTableSource =
  | { readonly kind: "map"; readonly mapId: EngineeringMapId; readonly rowIds: readonly string[] }
  | { readonly kind: "map-grouped"; readonly mapId: EngineeringMapId; readonly groupCell: string }
  | { readonly kind: "atlas"; readonly cardIds: readonly string[] };

export interface TalkQrLink {
  readonly href: string;
  readonly label: LocalizedText;
}

export interface TalkDemoStep {
  readonly href: string;
  readonly action: LocalizedText;
  readonly expected: LocalizedText;
  readonly fallback: LocalizedText;
}

export interface TalkFact {
  /** 숫자·설정값은 문자열 그대로, 말로 된 값은 번역 쌍으로 둔다. */
  readonly value: string | LocalizedText;
  readonly label: LocalizedText;
}

export interface TalkLink {
  readonly href: string;
  readonly label: LocalizedText;
}

/** 슬라이드에 곁들이는 브랜드 콘셉트 아트. 실제 편집 화면이 아니라는 표기를 항상 함께 보여준다. */
export interface TalkArt {
  readonly src: string;
  readonly alt: LocalizedText;
}

export interface TalkSlide {
  readonly id: string;
  readonly section: TalkSectionId;
  readonly layout: TalkSlideLayout;
  readonly eyebrow: LocalizedText;
  readonly title: LocalizedText;
  readonly lead: LocalizedText;
  readonly points: readonly LocalizedText[];
  /** 발표자가 읽는 대본. 청중 화면에는 나오지 않는다. */
  readonly notes: LocalizedText;
  /** 계획한 발표 시간(초). 구간 예산은 이 값의 합이다. */
  readonly seconds: number;
  readonly flow?: readonly LocalizedText[];
  readonly stack?: readonly string[];
  readonly facts?: readonly TalkFact[];
  readonly modules?: readonly TalkModule[];
  readonly demoSteps?: readonly TalkDemoStep[];
  readonly links?: readonly TalkLink[];
  readonly art?: TalkArt;
  readonly question?: LocalizedText;
  readonly chapterId?: string;
  /** 슬라이드에 현재 상태 배지로 보여줄 기술 스토리 챕터. 상태 값은 챕터 데이터가 소유한다. */
  readonly statusChapterIds?: readonly string[];
  readonly evidence?: readonly string[];
  /** `atlas` 레이아웃: 도감 카드의 도식·코드·사용처. 카드가 없으면 테스트가 실패한다. */
  readonly atlas?: TalkAtlasRef;
  /** `diagram` 레이아웃: 지정하면 기본 아키텍처 도식 대신 이 도식을 그린다. */
  readonly diagram?: EngineeringDiagram;
  /** `table` 레이아웃의 표. */
  readonly table?: TalkTable;
  /** `qa` 레이아웃: 링크 옆에 보여줄 QR 코드의 대상. */
  readonly qr?: TalkQrLink;
  /** 발표자 패널에 "이 슬라이드에서 질문이 나오면 열 도감 카드"로 보여줄 카드 id. */
  readonly relatedAtlasIds?: readonly string[];
}
