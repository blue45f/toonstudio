/**
 * /product-tour 챕터별 "이 장면에 쓰인 기술" 연결 데이터.
 *
 * 투어 화면은 수백 KB 의 기술 도감·제작 스토리 데이터를 가져오지 않는다. 그래서 여기에는 도감 카드 id 와 화면에
 * 보일 이름(정적 문자열)만 두고, 링크는 `/about/technology/atlas#<카드 id>`·`/about/technology/story#<챕터 id>` 문자열로 만든다.
 * 카드·챕터가 실제로 있는지, 성숙도(status)가 제작 스토리 챕터의 상태와 같은지는
 * legal/technology/product-tour-tech-links.test.ts 가 도감·스토리 데이터와 대조한다.
 *
 * 이 파일은 `public/` 경계에 둔다. 위 대조 테스트가 기술 문서 도메인(legal/technology)에 있어서, 마케팅 도메인의 내부 모듈을
 * 깊게 가져오지 않고 이 공개 경계만 거치게 하려는 것이다(도메인 경계 래칫을 늘리지 않는다).
 */

/** LocalizedText(engineering-story-content)와 같은 모양. 기술 문서 모듈을 가져오지 않으려고 따로 선언한다. */
export interface ProductTourTechText {
  readonly ko: string;
  readonly en: string;
}

/** 제작 스토리 챕터 상태 중 투어가 쓰는 네 가지. 값과 라벨은 engineering-story-content 의 ENGINEERING_STATUS_META 와 같아야 한다(테스트). */
export type ProductTourTechStatus = "live" | "configured" | "experimental" | "documented";

export type ProductTourTechChapterId =
  | "overview"
  | "plan"
  | "draw"
  | "comic"
  | "three-d"
  | "assist"
  | "production"
  | "learn"
  | "finish";

export interface ProductTourTechAtlasLink {
  /** 기술 도감 카드 id. */
  readonly atlasId: string;
  /** 칩에 보일 이름(기술 이름 중심, 짧게). */
  readonly label: ProductTourTechText;
}

export interface ProductTourTechStoryLink {
  /** 제작 스토리 챕터 id (PUBLISHED_ENGINEERING_CHAPTERS). */
  readonly chapterId: string;
  /** 그 챕터의 현재 상태. 챕터 상태가 바뀌면 테스트가 실패해 이 값을 고치게 한다. */
  readonly status: ProductTourTechStatus;
  /** 링크에 보일 챕터 이름(짧게). */
  readonly label: ProductTourTechText;
}

export interface ProductTourChapterTech {
  /** 장면에 실제로 쓰인 기술의 도감 카드. 1~3장. */
  readonly atlas: readonly ProductTourTechAtlasLink[];
  readonly story: ProductTourTechStoryLink;
}

const t = (ko: string, en: string): ProductTourTechText => ({ ko, en });

/**
 * 투어 챕터 id → 쓰인 기술. 카드는 챕터가 여는 화면(feature)의 도감 `usage` 와 실제 코드를 대조해 골랐다.
 * - plan: 스토리 연구실은 외부 AI 없이 직접 쓰는 로컬 폼이라 맞는 카드가 하나뿐이다(탭 간 쓰기 잠금).
 * - production: 공정 보드(칸반)는 영상 이후에 더해진 화면이라 영상 챕터의 기술로 연결하지 않았다.
 */
export const PRODUCT_TOUR_TECH_LINKS: Readonly<Record<ProductTourTechChapterId, ProductTourChapterTech>> = {
  overview: {
    atlas: [
      { atlasId: "autosave-crash-recovery-journal", label: t("자동저장·복구", "Autosave and recovery") },
      { atlasId: "service-worker-app-shell-policy", label: t("오프라인 편집기", "Offline editor") },
      { atlasId: "sqlite-wasm-opfs-sah-pool", label: t("브라우저 안의 DB", "In-browser database") },
    ],
    story: { chapterId: "product-intent", status: "documented", label: t("왜 브라우저 웹툰 제작실인가", "Why a browser-native webtoon studio") },
  },
  plan: {
    atlas: [{ atlasId: "web-locks-broadcastchannel-single-author", label: t("Web Locks 쓰기 잠금", "Web Locks write lock") }],
    story: { chapterId: "storage", status: "live", label: t("로컬 우선 저장과 개인 클라우드", "Local-first storage and personal cloud") },
  },
  draw: {
    atlas: [
      { atlasId: "stroke-smoothing-one-euro", label: t("손떨림 보정", "Stroke smoothing") },
      { atlasId: "layer-compositing-blend-flatten", label: t("레이어 혼합", "Layer blending") },
      { atlasId: "material-physics-paper-tooth", label: t("종이 질감", "Paper texture") },
    ],
    story: { chapterId: "brush-engine", status: "experimental", label: t("브러시 입력에서 문서 commit까지", "From brush input to document commit") },
  },
  comic: {
    atlas: [
      { atlasId: "konva-transform-snap", label: t("끌기·스냅", "Drag and snap") },
      { atlasId: "intl-segmenter-korean-lines", label: t("대사 글자 세기", "Dialogue text counting") },
    ],
    story: { chapterId: "performance", status: "live", label: t("웹 성능을 기능 계약으로", "Web performance as a feature contract") },
  },
  "three-d": {
    atlas: [
      { atlasId: "three-r3f-viewport", label: t("3D 뷰포트", "3D viewport") },
      { atlasId: "vrm-humanoid-rig", label: t("VRM 뼈대", "VRM rig") },
      { atlasId: "toon-shading-outline", label: t("툰 선·톤", "Toon lines and tones") },
    ],
    story: { chapterId: "web-3d-engine", status: "experimental", label: t("역할별 3D 권위 분리", "Separating 3D authority by role") },
  },
  assist: {
    atlas: [
      { atlasId: "creator-inference-service", label: t("내 GPU 런타임", "Your own GPU runtime") },
      { atlasId: "ai-proposal-not-commit", label: t("AI는 제안만", "AI only proposes") },
      { atlasId: "free-first-ai-routing", label: t("무료 우선 라우팅", "Free-first routing") },
    ],
    story: { chapterId: "ai-routing", status: "configured", label: t("AI 공급자를 제품 계약 뒤에", "AI providers behind a product contract") },
  },
  production: {
    atlas: [
      { atlasId: "virtual-studio-architecture-overview", label: t("가상 스튜디오", "Virtual studio") },
      { atlasId: "yjs-crdt-document", label: t("동시 편집 CRDT", "Co-editing CRDT") },
      { atlasId: "crdt-lock-revision", label: t("편집 잠금", "Edit locks") },
    ],
    story: { chapterId: "collaborative-crdt-boundary", status: "experimental", label: t("CRDT 의미 범위와 저장 권위", "CRDT scope and storage authority") },
  },
  learn: {
    atlas: [
      { atlasId: "resource-engine-one-contract", label: t("자료 검색 엔진", "Reference search engine") },
      { atlasId: "opfs-content-addressed-store", label: t("에셋 보관함", "Asset store") },
      { atlasId: "music-generation-guarded", label: t("AI 음악(안전장치)", "Guarded AI music") },
    ],
    story: { chapterId: "sound-generation", status: "configured", label: t("사운드 생성과 권리를 한 흐름에", "Generated sound and rights in one flow") },
  },
  finish: {
    atlas: [
      { atlasId: "export-engine-deterministic-pdf", label: t("PDF·PNG 내보내기", "PDF and PNG export") },
      { atlasId: "ai-provenance-rights", label: t("AI 출처 기록", "AI provenance") },
      { atlasId: "file-system-access-resave", label: t("같은 파일에 저장", "Re-save to the same file") },
    ],
    story: { chapterId: "share-distribution-boundary", status: "live", label: t("공유는 유입·미리보기·개인정보 계약", "Sharing as an acquisition, preview and privacy contract") },
  },
};

/** 상태 배지 라벨. engineering-story-content 의 ENGINEERING_STATUS_META 와 같은 문구여야 한다(테스트가 대조). */
export const PRODUCT_TOUR_TECH_STATUS_LABEL: Readonly<Record<ProductTourTechStatus, ProductTourTechText>> = {
  live: t("운영 경로", "Live path"),
  configured: t("설정 필요", "Setup required"),
  experimental: t("실험 기능", "Experimental"),
  documented: t("문서화", "Documented"),
};

/**
 * 이 영상을 만든 기술(영상·미디어 전달) 도감 카드. 특정 챕터의 기능이 아니라 재생기 자체의 기술이라
 * 챕터 카드가 아니라 "이 영상은 어떻게 만들었나" 노트에서 연결한다.
 */
export const PRODUCT_TOUR_MEDIA_ATLAS_LINKS: readonly ProductTourTechAtlasLink[] = [
  { atlasId: "remotion-composition-player", label: t("Remotion 컴포지션·Player", "Remotion composition and Player") },
  { atlasId: "webvtt-caption-tracks", label: t("WebVTT 자막", "WebVTT captions") },
  { atlasId: "http-range-blob-seekable-media", label: t("Range·Blob 탐색 재생", "Range and Blob seeking") },
  { atlasId: "video-object-json-ld", label: t("영상 JSON-LD", "Video JSON-LD") },
  { atlasId: "aria-tabs-site-section-tabs", label: t("접근 가능한 탭", "Accessible tabs") },
];

export function productTourAtlasHref(atlasId: string): string {
  return `/about/technology/atlas#${atlasId}`;
}

export function productTourStoryHref(chapterId: string): string {
  return `/about/technology/story#${chapterId}`;
}
