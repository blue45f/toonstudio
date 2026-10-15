export const CREATOR_COMMUNITY_METADATA_VERSION = 1 as const;
export const CREATOR_COMMUNITY_RELEASE_VERSION = 1 as const;

export const CREATOR_COMMUNITY_CONTENT_KINDS = [
  "illustration",
  "illustration_set",
  "art_project",
  "webtoon_episode",
  "one_shot",
  "page_comic",
  "short_comic",
  "process",
  "wip",
] as const;

export const CREATOR_COMMUNITY_CONTENT_GROUPS = [
  "all",
  "illustration",
  "webtoon",
  "process",
] as const;

export const CREATOR_COMMUNITY_PROVENANCES = [
  "human",
  "ai_assisted",
  "agent_assisted",
  "ai_generated",
  "mixed",
] as const;

export const CREATOR_COMMUNITY_CONTENT_DESCRIPTORS = [
  "violence",
  "gore",
  "horror",
  "sexuality",
  "language",
  "drugs",
  "self_harm",
  "sensitive_topic",
] as const;

export const CREATOR_COMMUNITY_FEEDBACK_TOPICS = [
  "general",
  "composition",
  "color",
  "anatomy",
  "background",
  "direction",
  "lettering",
  "portfolio",
  "none",
] as const;

/**
 * 작품·회차 단위 AI 학습 허용 표기. 작가가 밝힌 의사를 독자에게 알리는 표시이며 라이선스나
 * 계약이 아니다. `unspecified`는 "작가가 밝히지 않음"이고 어떤 경우에도 `allowed`로 해석하지 않는다.
 * 허용·불허 어휘는 자산 권리 명세(`allowed`/`prohibited`/`unknown`)와 같고, 시스템이 모른다는 뜻의
 * `unknown` 대신 작가가 말하지 않았다는 뜻의 `unspecified`를 쓴다.
 */
export const CREATOR_COMMUNITY_AI_TRAINING_CONSENTS = [
  "unspecified",
  "allowed",
  "prohibited",
] as const;

export const CREATOR_COMMUNITY_RELEASE_STATES = [
  "review",
  "approved",
  "published",
  "superseded",
  "withdrawn",
] as const;
export const CREATOR_COMMUNITY_APPROVAL_STATES = [
  "pending",
  "approved",
  "rejected",
] as const;
export const CREATOR_COMMUNITY_PUBLICATION_STATES = [
  "scheduled",
  "published",
  "unpublished",
] as const;
export const CREATOR_COMMUNITY_EXTERNAL_PLATFORMS = [
  "naver",
  "webtoon_canvas",
  "tapas",
  "postype",
  "pixiv",
  "globalcomix",
  "other",
] as const;
export const CREATOR_COMMUNITY_EXTERNAL_STATUSES = [
  "draft",
  "published",
  "updated",
  "removed",
] as const;

export type CreatorCommunityContentKind =
  (typeof CREATOR_COMMUNITY_CONTENT_KINDS)[number];
export type CreatorCommunityContentGroup =
  (typeof CREATOR_COMMUNITY_CONTENT_GROUPS)[number];
export type CreatorCommunityProvenance =
  (typeof CREATOR_COMMUNITY_PROVENANCES)[number];
export type CreatorCommunityContentDescriptor =
  (typeof CREATOR_COMMUNITY_CONTENT_DESCRIPTORS)[number];
export type CreatorCommunityFeedbackTopic =
  (typeof CREATOR_COMMUNITY_FEEDBACK_TOPICS)[number];
export type CreatorCommunityAiTrainingConsent =
  (typeof CREATOR_COMMUNITY_AI_TRAINING_CONSENTS)[number];
export type CreatorCommunityReleaseState =
  (typeof CREATOR_COMMUNITY_RELEASE_STATES)[number];
export type CreatorCommunityApprovalState =
  (typeof CREATOR_COMMUNITY_APPROVAL_STATES)[number];
export type CreatorCommunityPublicationState =
  (typeof CREATOR_COMMUNITY_PUBLICATION_STATES)[number];
export type CreatorCommunityExternalPlatform =
  (typeof CREATOR_COMMUNITY_EXTERNAL_PLATFORMS)[number];
export type CreatorCommunityExternalStatus =
  (typeof CREATOR_COMMUNITY_EXTERNAL_STATUSES)[number];

export interface CreatorCommunityMetadata {
  version: typeof CREATOR_COMMUNITY_METADATA_VERSION;
  kind: CreatorCommunityContentKind;
  portfolio: boolean;
  provenance: CreatorCommunityProvenance;
  contentDescriptors: CreatorCommunityContentDescriptor[];
  feedbackTopics: CreatorCommunityFeedbackTopic[];
  downloadAllowed: boolean;
  /**
   * 레거시 호환용 파생 값으로 `aiTraining === "allowed"`일 때만 true다. 새 코드는 직접 읽지 말고
   * `resolveCreatorCommunityAiTraining`을 쓴다.
   */
  trainingAllowed: boolean;
  /**
   * 작품·회차 단위 AI 학습 허용 표기(선택 필드, 기본 `unspecified`). 이 필드가 없는 기존 게시물과
   * 이전 릴리스 manifest는 `trainingAllowed === true`일 때만 `allowed`, 그 외에는 `unspecified`로
   * 읽는다. 작가의 의사 표시일 뿐 외부 사업자에 대한 강제력은 없고 별도 계약을 대체하지 않는다.
   */
  aiTraining?: CreatorCommunityAiTrainingConsent;
  attributionText: string;
  altText: string;
}

export interface CreatorCommunityReleaseManifest {
  version: typeof CREATOR_COMMUNITY_RELEASE_VERSION;
  workId: string;
  workRevision: number;
  title: string;
  description: string;
  cover: string;
  tags: string[];
  format: "cuttoon" | "upload";
  pages: string[];
  doc: Record<string, unknown>;
  seriesId: string | null;
  episodeNo: number | null;
  challengeId: string | null;
  remixFromId: string | null;
  author: { id: string; name: string; avatar: string };
  community: CreatorCommunityMetadata;
  capturedAt: string;
}

export interface CreatorCommunityReleaseApproval {
  userId: string;
  name: string;
  avatar: string;
  state: CreatorCommunityApprovalState;
  note: string;
  decidedAt: string | null;
}

export interface CreatorCommunityReleaseSummary {
  id: string;
  workId: string;
  releaseNo: number;
  workRevision: number;
  fingerprint: string;
  state: CreatorCommunityReleaseState;
  title: string;
  kind: CreatorCommunityContentKind;
  provenance: CreatorCommunityProvenance;
  approvals: CreatorCommunityReleaseApproval[];
  createdAt: string;
  publishedAt: string | null;
}

export interface CreatorCommunityPublicationSummary {
  id: string;
  workId: string;
  releaseId: string;
  state: CreatorCommunityPublicationState;
  visibility: "public" | "unlisted" | "private";
  scheduledAt: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  canonicalSlug: string;
}

export interface CreatorCommunityPortfolioEntry {
  workId: string;
  releaseId: string;
  position: number;
  featured: boolean;
  createdAt: string;
  work: {
    title: string;
    description: string;
    cover: string;
    tags: string[];
    kind: CreatorCommunityContentKind;
    provenance: CreatorCommunityProvenance;
    author: { id: string; name: string; avatar: string };
  };
}

export interface CreatorCommunityExternalPublication {
  id: string;
  workId: string;
  releaseId: string;
  platform: CreatorCommunityExternalPlatform;
  externalUrl: string;
  status: CreatorCommunityExternalStatus;
  publishedAt: string | null;
  updatedAt: string;
}

const ILLUSTRATION_KINDS = new Set<CreatorCommunityContentKind>([
  "illustration",
  "illustration_set",
  "art_project",
]);
const WEBTOON_KINDS = new Set<CreatorCommunityContentKind>([
  "webtoon_episode",
  "one_shot",
  "page_comic",
  "short_comic",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function uniqueValues<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  maximum: number,
): Value[] {
  if (!Array.isArray(value)) return [];
  const result: Value[] = [];
  for (const candidate of value) {
    if (!allowed.includes(candidate as Value) || result.includes(candidate as Value)) continue;
    result.push(candidate as Value);
    if (result.length >= maximum) break;
  }
  return result;
}

function stripDisallowedControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 9 ||
      codePoint === 10 ||
      codePoint === 13 ||
      (codePoint >= 32 && codePoint !== 127)
    ) {
      result += character;
    }
  }
  return result;
}

function cleanText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") return "";
  return stripDisallowedControlCharacters(value).trim().slice(0, maximumLength);
}

/** 작가가 아무것도 밝히지 않은 상태. 새 작품과 근거 없는 입력은 모두 이 값으로 읽는다. */
export const DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT: CreatorCommunityAiTrainingConsent =
  "unspecified";

function isAiTrainingConsent(value: unknown): value is CreatorCommunityAiTrainingConsent {
  return CREATOR_COMMUNITY_AI_TRAINING_CONSENTS.some((consent) => consent === value);
}

export function parseCreatorCommunityAiTrainingConsent(
  value: unknown,
): CreatorCommunityAiTrainingConsent | null {
  return isAiTrainingConsent(value) ? value : null;
}

/**
 * 저장된 메타데이터(릴리스 manifest, 구버전 문서 포함)에서 AI 학습 표기를 읽는다.
 *
 * - 유효한 `aiTraining`이 있으면 그 값이 우선한다(레거시 불리언과 어긋나도 이쪽이 이긴다).
 * - 없거나 알 수 없는 값이면 레거시 `trainingAllowed === true`(작가가 명시적으로 켠 체크박스)만
 *   `allowed`로 읽는다. 레거시 `false`는 "꺼 둔 것"과 "건드리지 않은 것"을 구분할 수 없으므로
 *   `prohibited`가 아니라 `unspecified`다.
 * - 어떤 경우에도 근거 없이 `allowed`가 되지 않는다.
 */
export function resolveCreatorCommunityAiTraining(
  metadata:
    | { readonly aiTraining?: unknown; readonly trainingAllowed?: unknown }
    | null
    | undefined,
): CreatorCommunityAiTrainingConsent {
  if (!metadata) return DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT;
  return (
    parseCreatorCommunityAiTrainingConsent(metadata.aiTraining)
    ?? (metadata.trainingAllowed === true
      ? "allowed"
      : DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT)
  );
}

/** 새 표기를 적용하면서 레거시 파생 불리언도 함께 맞춘 사본을 돌려준다. */
export function withCreatorCommunityAiTraining(
  metadata: CreatorCommunityMetadata,
  consent: CreatorCommunityAiTrainingConsent,
): CreatorCommunityMetadata {
  const aiTraining =
    parseCreatorCommunityAiTrainingConsent(consent)
    ?? DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT;
  return { ...metadata, aiTraining, trainingAllowed: aiTraining === "allowed" };
}

export function defaultCreatorCommunityContentKind(
  format: unknown,
): CreatorCommunityContentKind {
  return format === "upload" ? "illustration" : "webtoon_episode";
}

export function createDefaultCreatorCommunityMetadata(
  format: unknown = "cuttoon",
): CreatorCommunityMetadata {
  return {
    version: CREATOR_COMMUNITY_METADATA_VERSION,
    kind: defaultCreatorCommunityContentKind(format),
    portfolio: false,
    provenance: "human",
    contentDescriptors: [],
    feedbackTopics: ["general"],
    downloadAllowed: false,
    trainingAllowed: false,
    aiTraining: DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT,
    attributionText: "",
    altText: "",
  };
}

export function normalizeCreatorCommunityMetadata(
  value: unknown,
  options: { format?: unknown } = {},
): CreatorCommunityMetadata {
  const source = isRecord(value) ? value : {};
  const fallback = createDefaultCreatorCommunityMetadata(options.format);
  const feedbackTopics = uniqueValues(
    source.feedbackTopics,
    CREATOR_COMMUNITY_FEEDBACK_TOPICS,
    8,
  );
  const aiTraining = resolveCreatorCommunityAiTraining(source);
  return {
    version: CREATOR_COMMUNITY_METADATA_VERSION,
    kind: oneOf(source.kind, CREATOR_COMMUNITY_CONTENT_KINDS, fallback.kind),
    portfolio: typeof source.portfolio === "boolean" ? source.portfolio : false,
    provenance: oneOf(
      source.provenance,
      CREATOR_COMMUNITY_PROVENANCES,
      fallback.provenance,
    ),
    contentDescriptors: uniqueValues(
      source.contentDescriptors,
      CREATOR_COMMUNITY_CONTENT_DESCRIPTORS,
      8,
    ),
    feedbackTopics: feedbackTopics.includes("none")
      ? ["none"]
      : feedbackTopics.length > 0
        ? feedbackTopics
        : fallback.feedbackTopics,
    downloadAllowed:
      typeof source.downloadAllowed === "boolean" ? source.downloadAllowed : false,
    trainingAllowed: aiTraining === "allowed",
    aiTraining,
    attributionText: cleanText(source.attributionText, 240),
    altText: cleanText(source.altText, 1_000),
  };
}

export function readCreatorCommunityMetadata(
  doc: unknown,
  options: { format?: unknown } = {},
): CreatorCommunityMetadata {
  if (!isRecord(doc)) return createDefaultCreatorCommunityMetadata(options.format);
  return normalizeCreatorCommunityMetadata(doc.community, options);
}

export function writeCreatorCommunityMetadata(
  doc: unknown,
  metadata: CreatorCommunityMetadata,
  options: { format?: unknown } = {},
): Record<string, unknown> {
  return {
    ...(isRecord(doc) ? doc : {}),
    community: normalizeCreatorCommunityMetadata(metadata, options),
  };
}

export function creatorCommunityContentGroupOf(
  kind: CreatorCommunityContentKind,
): Exclude<CreatorCommunityContentGroup, "all"> {
  if (ILLUSTRATION_KINDS.has(kind)) return "illustration";
  if (WEBTOON_KINDS.has(kind)) return "webtoon";
  return "process";
}

export function creatorCommunityKindMatchesGroup(
  kind: CreatorCommunityContentKind,
  group: CreatorCommunityContentGroup,
): boolean {
  return group === "all" || creatorCommunityContentGroupOf(kind) === group;
}

export function parseCreatorCommunityContentGroup(
  value: unknown,
): CreatorCommunityContentGroup {
  return oneOf(value, CREATOR_COMMUNITY_CONTENT_GROUPS, "all");
}

export function parseCreatorCommunityProvenance(
  value: unknown,
): CreatorCommunityProvenance | null {
  return CREATOR_COMMUNITY_PROVENANCES.includes(value as CreatorCommunityProvenance)
    ? (value as CreatorCommunityProvenance)
    : null;
}

export const CREATOR_COMMUNITY_METADATA_ISSUE_CODES = [
  "ALT_TEXT_REQUIRED",
  "ASSISTANCE_DISCLOSURE_REQUIRED",
  "RIGHTS_ATTRIBUTION_RECOMMENDED",
] as const;
export type CreatorCommunityMetadataIssueCode =
  (typeof CREATOR_COMMUNITY_METADATA_ISSUE_CODES)[number];

export interface CreatorCommunityMetadataIssue {
  readonly code: CreatorCommunityMetadataIssueCode;
  readonly severity: "warning";
  readonly message: string;
  readonly path: "altText" | "attributionText";
}

export function validateCreatorCommunityMetadata(
  value: unknown,
  options: { format?: unknown; pageCount?: number } = {},
): CreatorCommunityMetadataIssue[] {
  const metadata = normalizeCreatorCommunityMetadata(value, options);
  const issues: CreatorCommunityMetadataIssue[] = [];
  if ((options.pageCount ?? 1) > 0 && metadata.altText.length === 0) {
    issues.push({
      code: "ALT_TEXT_REQUIRED",
      severity: "warning",
      message: "독자가 이미지를 이해할 수 있도록 작품 대체 텍스트를 입력해 주세요.",
      path: "altText",
    });
  }
  if (
    metadata.provenance !== "human"
    && metadata.attributionText.length === 0
  ) {
    issues.push({
      code: "ASSISTANCE_DISCLOSURE_REQUIRED",
      severity: "warning",
      message: "AI 또는 에이전트가 참여한 제작 방식과 최종 검수 주체를 공개해 주세요.",
      path: "attributionText",
    });
  }
  if (
    (metadata.downloadAllowed || metadata.aiTraining === "allowed")
    && metadata.attributionText.length === 0
  ) {
    issues.push({
      code: "RIGHTS_ATTRIBUTION_RECOMMENDED",
      severity: "warning",
      message: "다운로드·학습 허용 범위와 필요한 출처 표기를 함께 안내해 주세요.",
      path: "attributionText",
    });
  }
  return issues;
}

export function creatorCommunityPageAltText(
  value: unknown,
  title: string,
  pageIndex: number,
  pageCount: number,
): string {
  const metadata = normalizeCreatorCommunityMetadata(value);
  const normalizedTitle = cleanText(title, 160) || "창작 작품";
  const pageLabel = pageCount > 1 ? ` ${pageIndex + 1}/${pageCount}페이지` : "";
  return metadata.altText
    ? `${metadata.altText}${pageLabel}`
    : `${normalizedTitle}${pageLabel || " 작품 이미지"}`;
}
