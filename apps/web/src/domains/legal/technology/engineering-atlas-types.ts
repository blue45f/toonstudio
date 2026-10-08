import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringStatus, LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감(Atlas)의 데이터 계약.
 *
 * 도감은 서비스에 실제로 쓰인 기술을 한 장의 카드로 정리한다. 카드마다 같은 순서로
 * ① 한 줄 정의 → ② 배경 지식 → ③ 서비스에서 쓰인 곳(기능·파일) → ④ 샘플 코드 → ⑤ 참고 링크 → ⑥ 발표 보조
 * 를 담아, 발표자가 질문을 받았을 때 한 장에서 답을 찾을 수 있게 한다.
 *
 * 작성 규칙 (테스트가 강제한다):
 * - 모든 `usage.paths`와 `samples[].source`는 저장소에 실제로 존재하는 경로여야 한다.
 * - 링크는 https 공식 문서·표준·저장소만 쓴다. 주소를 지어내지 않는다.
 * - 샘플 코드는 단순화한 교육용 예제이며 비밀값·실제 계정을 넣지 않는다.
 * - 상태(`status`)는 코드·설정으로 확인한 현재 상태만 쓴다. 과장하지 않는다.
 */

export type EngineeringAtlasCategoryId =
  | "drawing"
  | "local-first"
  | "realtime"
  | "virtual-space"
  | "three-d"
  | "ai"
  | "interaction"
  | "web-platform"
  | "open-data"
  | "platform-ops";

export type EngineeringCodeLanguage =
  | "ts"
  | "tsx"
  | "js"
  | "json"
  | "bash"
  | "css"
  | "html"
  | "python"
  | "rust"
  | "sql"
  | "toml"
  | "yaml"
  | "text";

export interface EngineeringAtlasUsage {
  /** 사용자가 보는 기능 이름. 예: "캔버스 편집기 · 브러시". */
  readonly feature: LocalizedText;
  /** 그 기능 안에서 이 기술이 맡은 일(어떻게 쓰였는지). */
  readonly role: LocalizedText;
  /** 근거가 되는 저장소 경로. 심볼 힌트가 필요하면 `경로#심볼`로 덧붙인다. */
  readonly paths: readonly string[];
  /** 제품 안에서 직접 열어볼 수 있는 경로(선택). */
  readonly route?: string;
}

export type EngineeringAtlasSampleKind =
  /** 아이디어만 남긴 교육용 최소 예제. */
  | "teaching"
  /** 실제 구현을 줄여 옮긴 예제(원본 경로를 `source`에 둔다). */
  | "simplified";

/**
 * - `types`: 저장소 TypeScript 설정으로 타입까지 검증한다(웹 표준 API·설치된 패키지만 사용).
 * - `syntax`: 구문만 검증한다(기본값, ts/tsx/js/json).
 * - `none`: 검증하지 않는다(bash·python·rust 등).
 */
export type EngineeringAtlasSampleVerify = "types" | "syntax" | "none";

export interface EngineeringAtlasSample {
  readonly kind: EngineeringAtlasSampleKind;
  readonly title: LocalizedText;
  readonly language: EngineeringCodeLanguage;
  /** 한국어 주석 기본. 줄 수는 4~28줄. */
  readonly code: string;
  /** 영어 화면용 코드(주석만 다를 때). 없으면 `code`를 그대로 쓴다. */
  readonly codeEn?: string;
  /** 이 예제가 보여주는 핵심 아이디어와 읽는 법. */
  readonly explain: LocalizedText;
  /** `simplified`일 때 단순화 전의 실제 구현 경로. */
  readonly source?: string;
  readonly verify?: EngineeringAtlasSampleVerify;
}

export type EngineeringAtlasLinkKind = "spec" | "docs" | "guide" | "repo" | "article";

export interface EngineeringAtlasLink {
  /** 제품·문서의 고유한 이름. 예: "MDN · Origin private file system". */
  readonly title: string;
  readonly url: string;
  readonly kind: EngineeringAtlasLinkKind;
  /** 왜 읽을 만한지 한 줄(선택). */
  readonly note?: LocalizedText;
}

export interface EngineeringAtlasQuestion {
  readonly question: LocalizedText;
  readonly answer: LocalizedText;
}

export interface EngineeringAtlasTalkAid {
  /** 30초 안에 말할 수 있는 설명. */
  readonly pitch: LocalizedText;
  /** 비전문가를 위한 쉬운 비유(선택). */
  readonly analogy?: LocalizedText;
  /** 자주 받는 질문과 답변 요지. */
  readonly questions: readonly EngineeringAtlasQuestion[];
  /** 흔한 오해·과장하기 쉬운 지점(선택).*/
  readonly pitfall?: LocalizedText;
}

export interface EngineeringAtlasFact {
  /** 숫자·설정값은 문자열 그대로. */
  readonly value: string;
  readonly label: LocalizedText;
  /** 값을 확인한 저장소 경로. */
  readonly source: string;
}

export interface EngineeringAtlasEntry {
  /** 소문자 kebab-case 고유 id. 앵커(`#id`)로도 쓴다. */
  readonly id: string;
  readonly category: EngineeringAtlasCategoryId;
  /** 고유명사 중심의 짧은 이름. 예: "OPFS". */
  readonly name: string;
  /** 쉬운 이름. 예: "브라우저 안의 비공개 파일 시스템". */
  readonly title: LocalizedText;
  readonly status: EngineeringStatus;
  /** 한 줄 정의(60자 안팎). */
  readonly tagline: LocalizedText;
  /** 배경 지식: 왜 필요한가, 어떻게 동작하나, 대안과 한계. 문단 2~4개. */
  readonly background: readonly LocalizedText[];
  /** 발표 슬라이드용 핵심 요점 2~4개(각 40자 안팎). */
  readonly keyPoints: readonly LocalizedText[];
  /** 도식: 이 기술이 어떻게 흐르고 누가 무엇을 소유하는지(필수). */
  readonly diagram: EngineeringDiagram;
  /** 서비스에서 어느 기능에 어떻게 쓰였는지. 1~4개. */
  readonly usage: readonly EngineeringAtlasUsage[];
  /** 샘플 코드. 1~2개. */
  readonly samples: readonly EngineeringAtlasSample[];
  /** 참고 링크 2~6개. */
  readonly links: readonly EngineeringAtlasLink[];
  /** 관련 제작 스토리 챕터 id. */
  readonly chapterIds: readonly string[];
  readonly talk: EngineeringAtlasTalkAid;
  /** 칩으로 보여줄 기술 이름(engineering-external-links 레지스트리로 링크를 해결한다). */
  readonly technologies: readonly string[];
  readonly facts?: readonly EngineeringAtlasFact[];
  /** 마지막으로 코드와 대조한 날짜(YYYY-MM-DD). */
  readonly reviewedAt: string;
}

export interface EngineeringAtlasCategoryMeta {
  readonly id: EngineeringAtlasCategoryId;
  readonly label: LocalizedText;
  readonly description: LocalizedText;
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export const ENGINEERING_ATLAS_CATEGORIES = [
  {
    id: "drawing",
    label: t("드로잉·렌더링", "Drawing · rendering"),
    description: t("손의 입력이 픽셀과 문서가 되기까지: 브러시, 렌더러, 합성, 내보내기", "From hand input to pixels and documents: brushes, renderers, compositing, export"),
  },
  {
    id: "local-first",
    label: t("로컬 우선·저장", "Local-first · storage"),
    description: t("서버가 없어도 작업이 남는 구조: OPFS, SQLite WASM, Worker, PWA, 복구", "Work that survives without a server: OPFS, SQLite WASM, Workers, PWA, recovery"),
  },
  {
    id: "realtime",
    label: t("협업·WebRTC", "Collaboration · WebRTC"),
    description: t("함께 편집하고 대화하기: CRDT, Socket.IO, Durable Objects, WebRTC, TURN", "Editing and talking together: CRDT, Socket.IO, Durable Objects, WebRTC, TURN"),
  },
  {
    id: "virtual-space",
    label: t("가상 스튜디오", "Virtual studio"),
    description: t("걸어서 만나는 2D 협업 공간: Phaser, 근접 규칙, 월드 권위, 에셋 파이프라인", "A 2D space you walk through: Phaser, proximity rules, world authority, asset pipeline"),
  },
  {
    id: "three-d",
    label: t("3D·캐릭터", "3D · characters"),
    description: t("그리기 위한 3D: three.js, VRM, MediaPipe, glTF, Blender, 정밀 형상", "3D for drawing: three.js, VRM, MediaPipe, glTF, Blender, precise geometry"),
  },
  {
    id: "ai",
    label: t("AI·추론", "AI · inference"),
    description: t("제안은 AI, 확정은 사람: 온디바이스 추론, 무료 우선 라우팅, 승인 게이트", "AI proposes, people decide: on-device inference, free-first routing, approval gates"),
  },
  {
    id: "interaction",
    label: t("입력·상호작용", "Input · interaction"),
    description: t("포인터, 드래그 앤 드롭, 단축키, 접근성 대체 경로", "Pointers, drag and drop, shortcuts and accessible alternatives"),
  },
  {
    id: "web-platform",
    label: t("차세대 웹·한계 돌파", "Next-gen web · beyond limits"),
    description: t("WebGPU, WASM, 워커, 격리 환경 등 브라우저의 한계를 넘는 표준 기능과 폴백", "WebGPU, WASM, Workers and isolation: standards that stretch the browser, with fallbacks"),
  },
  {
    id: "open-data",
    label: t("오픈소스·Open API", "Open source · Open APIs"),
    description: t("오픈소스를 쓰는 법과 외부 API를 스키마·권리·출처 계약 뒤에서 쓰는 법", "Using open source and external APIs behind schema, rights and provenance contracts"),
  },
  {
    id: "platform-ops",
    label: t("백엔드·품질·운영", "Backend · quality · ops"),
    description: t("NestJS, PostgreSQL, Cloudflare, 테스트·접근성·보안 게이트와 수동 배포", "NestJS, PostgreSQL, Cloudflare, test, accessibility and security gates, manual releases"),
  },
] as const satisfies readonly EngineeringAtlasCategoryMeta[];

export const ENGINEERING_ATLAS_CATEGORY_IDS: readonly EngineeringAtlasCategoryId[] = ENGINEERING_ATLAS_CATEGORIES.map(
  (category) => category.id,
);

export const ENGINEERING_ATLAS_LINK_KIND_LABEL: Record<EngineeringAtlasLinkKind, LocalizedText> = {
  spec: t("표준·명세", "Standard"),
  docs: t("공식 문서", "Docs"),
  guide: t("가이드", "Guide"),
  repo: t("저장소", "Repository"),
  article: t("글", "Article"),
};
