/**
 * 투고 패키지 — 타입과 상한.
 *
 * 투고 패키지는 작품 하나에서 에피소드 3화 이상, 캐릭터 시트, 로그라인·시놉시스를 모아 ZIP 하나(+Markdown
 * 표지, 선택적 요약 PDF)로 내보내는 기능이다. 전부 브라우저 안에서 만들고 어떤 서버로도 보내지 않는다.
 *
 * 이 파일은 순수 타입과 상수만 둔다. 규칙 평가는 `submission-package-preflight.ts`, ZIP 조립은
 * `submission-package-build.ts`가 맡는다.
 */
import type { StudioWebtoonWidthStandardId } from "../studio-webtoon-canvas-presets";

/** 투고에 필요한 최소 회차 수. 이 미만이면 패키지를 만들 수 없다. */
export const SUBMISSION_PACKAGE_MIN_EPISODES = 3;

/** 앱이 정한 상한 모음. 리터럴이 아니라 숫자 타입이라 시험이나 호출부가 더 낮은 값으로 바꿔 넘길 수 있다. */
export interface SubmissionPackageLimits {
  readonly maxEpisodes: number;
  readonly maxPagesPerEpisode: number;
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly softFileBytes: number;
  readonly softTotalBytes: number;
  readonly maxCharacters: number;
  readonly titleChars: number;
  readonly authorChars: number;
  readonly loglineChars: number;
  readonly synopsisChars: number;
  readonly episodeTitleChars: number;
  readonly episodeNoteChars: number;
  readonly characterFieldChars: number;
  readonly signatureLines: number;
}

const MIB = 1024 * 1024;

/**
 * 크기·개수 상한. 모두 "이 앱이 브라우저 메모리를 지키려고 정한 값"이지 투고처의 규정이 아니다.
 *
 * - 용량은 화면이 쓰는 `formatStudioByteSize`(1MB = 1024×1024바이트)와 같은 단위로 적는다.
 * - `maxTotalBytes`: ZIP 작성기(`studio-package-archive`)는 항목을 하나씩 통째로 읽어 CRC 를 계산하고 결과를
 *   Blob 조각으로 이어 붙인다. 항목 하나가 최대 `maxFileBytes`만큼 메모리에 올라오고, 전체는 Blob 으로
 *   모이므로 전체 합계를 300MB 로 묶어 중저사양 기기에서도 끝까지 가도록 한다.
 * - `softFileBytes`·`softTotalBytes`: 넘어도 만들 수 있지만 메일·클라우드 업로드가 느리거나 막힐 수 있어
 *   알려 주는 권장선이다.
 */
export const SUBMISSION_PACKAGE_LIMITS: SubmissionPackageLimits = Object.freeze({
  maxEpisodes: 100,
  maxPagesPerEpisode: 200,
  maxFiles: 600,
  maxFileBytes: 50 * MIB,
  maxTotalBytes: 300 * MIB,
  softFileBytes: 20 * MIB,
  softTotalBytes: 150 * MIB,
  maxCharacters: 30,
  titleChars: 100,
  authorChars: 60,
  loglineChars: 300,
  synopsisChars: 4_000,
  episodeTitleChars: 100,
  episodeNoteChars: 300,
  characterFieldChars: 1_500,
  signatureLines: 3,
});

export type SubmissionPackageLocale = "ko" | "en";

/** 패키지에 담을 수 있는 이미지 형식. 판독은 파일 머리의 서명으로 하고 확장자는 믿지 않는다. */
export const SUBMISSION_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export type SubmissionImageMime = (typeof SUBMISSION_IMAGE_MIMES)[number];

/** 가로 폭 점검 기준. `any` 는 폭을 점검하지 않는다. */
export type SubmissionTargetWidthId = StudioWebtoonWidthStandardId | "any";

export type SubmissionProbeFailure = "unsupported" | "unreadable" | "empty";

/**
 * 사용자가 고른 이미지 한 장. 크기·형식·가로세로는 파일 머리만 읽어 얻는다(전체 디코딩 없음).
 * `blob` 은 메모리 안에서만 쓰며 저장하지 않는다.
 */
export interface SubmissionPageFile {
  readonly id: string;
  /** 사용자가 고른 원래 파일 이름. 표시와 매니페스트에만 쓴다. */
  readonly name: string;
  readonly size: number;
  readonly blob: Blob;
  readonly mime: SubmissionImageMime | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly failure: SubmissionProbeFailure | null;
}

export interface SubmissionEpisode {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  /** 회차를 한 줄로 설명하는 메모(선택). 표지의 회차 표에 들어간다. */
  readonly note: string;
  readonly pages: readonly SubmissionPageFile[];
}

export interface SubmissionCharacterRelation {
  readonly withName: string;
  /** `outgoing`: 이 캐릭터가 상대를 향한 관계, `incoming`: 상대가 이 캐릭터를 향한 관계. */
  readonly direction: "outgoing" | "incoming";
  /** 관계 종류(`family`·`friend` 등). 작가가 라벨을 비워 두면 종류 이름으로 대신한다. */
  readonly kind: string;
  readonly label: string;
  readonly note: string;
}

/** 스토리 바이블의 캐릭터 시트(`StudioStoryCharacterProfile`)를 투고용으로 평평하게 편 것. */
export interface SubmissionCharacterSheet {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly personality: string;
  readonly speechStyle: string;
  readonly background: string;
  readonly motivation: string;
  readonly signatureLines: readonly string[];
  readonly appearanceNotes: string;
  readonly relations: readonly SubmissionCharacterRelation[];
}

export interface SubmissionPackageDraft {
  readonly title: string;
  readonly authorName: string;
  readonly logline: string;
  readonly synopsis: string;
  readonly targetWidth: SubmissionTargetWidthId;
  readonly episodes: readonly SubmissionEpisode[];
  readonly characters: readonly SubmissionCharacterSheet[];
}

/** 점검 결과의 심각도. `error` 가 하나라도 있으면 만들 수 없다. */
export type SubmissionIssueSeverity = "error" | "warning" | "info";

export const SUBMISSION_ISSUE_CODES = [
  "title-missing",
  "text-too-long",
  "episodes-too-few",
  "episodes-too-many",
  "episode-number-invalid",
  "episode-number-duplicate",
  "episode-number-gap",
  "episode-empty",
  "episode-pages-too-many",
  "page-unsupported",
  "page-unreadable",
  "page-empty",
  "page-too-large",
  "page-large",
  "package-files-too-many",
  "package-too-large",
  "package-large",
  "width-mismatch",
  "width-mixed",
  "platform-file-over",
  "platform-episode-over",
  "logline-missing",
  "synopsis-missing",
  "author-missing",
  "characters-missing",
  "character-sheet-thin",
  "characters-too-many",
] as const;

export type SubmissionIssueCode = (typeof SUBMISSION_ISSUE_CODES)[number];

/** 화면이 해당 위치로 안내할 수 있도록 어느 입력에서 비롯된 문제인지 적는다. */
export type SubmissionIssueTarget =
  | { readonly kind: "story"; readonly field: "title" | "author" | "logline" | "synopsis" }
  | { readonly kind: "episodes" }
  | { readonly kind: "episode"; readonly episodeId: string }
  | { readonly kind: "page"; readonly episodeId: string; readonly pageId: string }
  | { readonly kind: "characters" }
  | { readonly kind: "character"; readonly characterId: string }
  | { readonly kind: "package" };

export interface SubmissionIssue {
  readonly code: SubmissionIssueCode;
  readonly severity: SubmissionIssueSeverity;
  readonly target: SubmissionIssueTarget;
  /** 메시지 템플릿에 채울 값. 화면·표지가 같은 값으로 문구를 만든다. */
  readonly params: Readonly<Record<string, string | number>>;
}

/** 투고처가 알려진 규격이 있을 때 점검에 쓰는 용량 기준. 값이 없으면 그 항목은 점검하지 않는다. */
export interface SubmissionPlatformSizeLimits {
  readonly label: string;
  readonly maxFileBytes?: number;
  readonly maxEpisodeBytes?: number;
}

export interface SubmissionEpisodeStats {
  readonly episodeId: string;
  readonly number: number;
  readonly title: string;
  readonly pageCount: number;
  readonly readablePageCount: number;
  readonly totalBytes: number;
  /** 읽을 수 있는 쪽의 가로 폭 목록(중복 제거, 오름차순). */
  readonly widths: readonly number[];
}

export type SubmissionCompletenessKey = "title" | "episodes" | "logline" | "synopsis" | "characters" | "author";

export interface SubmissionCompletenessItem {
  readonly key: SubmissionCompletenessKey;
  readonly done: boolean;
  /** 투고 패키지에 있어야 하는 구성인가. 아니면 있으면 좋은 항목이다. */
  readonly required: boolean;
}

export interface SubmissionPreflightReport {
  readonly issues: readonly SubmissionIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  /** 만들 수 있는가: 오류가 없다(회차 수 부족도 오류다). */
  readonly canBuild: boolean;
  readonly episodeStats: readonly SubmissionEpisodeStats[];
  readonly totalBytes: number;
  readonly totalFiles: number;
  readonly completeness: {
    readonly done: number;
    readonly total: number;
    readonly items: readonly SubmissionCompletenessItem[];
  };
}
