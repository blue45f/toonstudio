import { z } from "zod";

/**
 * 스튜디오 댓글 문서의 원시 계약 — 저장 한도 상수, 재시도 안전 메시지 ID, 필드·작성자·앵커 스키마와
 * 앵커 정규 키를 소유한다. 스레드·답글·문서 스키마와 정규화·변경 연산은 상위 studio-comments.ts 가
 * 이 원시 계약 위에서 조립하며, 기존 소비자는 계속 studio-comments 경로로만 가져온다.
 */

export const STUDIO_COMMENTS_VERSION = 1 as const;
export const STUDIO_COMMENTS_MAX_THREADS = 200;
export const STUDIO_COMMENTS_MAX_REPLIES_PER_THREAD = 50;
export const STUDIO_COMMENTS_MAX_TOTAL_MESSAGES = 1_000;
export const STUDIO_COMMENTS_MAX_ID_LENGTH = 120;
// Team-comment API user names are bounded to the same 160-character contract.
export const STUDIO_COMMENTS_MAX_DISPLAY_NAME_LENGTH = 160;
export const STUDIO_COMMENTS_MAX_BODY_LENGTH = 4_000;
export const STUDIO_COMMENTS_MAX_MENTIONS = 20;

/**
 * Creates one retry-safe local message identifier that is also accepted as a team-comment
 * mutation id. Callers should keep the returned value for the whole submit/retry lifecycle.
 */
export function createStudioCommentMessageId(prefix: "comment" | "reply"): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Prevents a late mutation receipt from closing a newer comment draft. */
export function studioCommentMutationReceiptOwnsDraft(
  currentMessageId: string | null | undefined,
  receiptMessageId: string
): boolean {
  return currentMessageId === receiptMessageId;
}

export const IdSchema = z.string().trim().min(1).max(STUDIO_COMMENTS_MAX_ID_LENGTH);
const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(STUDIO_COMMENTS_MAX_DISPLAY_NAME_LENGTH);
export const BodySchema = z.string().trim().min(1).max(STUDIO_COMMENTS_MAX_BODY_LENGTH);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalTimestamp(value: string): boolean {
  if (value.length > 40 || !Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export const TimestampSchema = z.string().refine(isCanonicalTimestamp, "UTC ISO timestamp required");

export const StudioCommentActorSchema = z
  .object({
    id: IdSchema.optional(),
    displayName: DisplayNameSchema,
  })
  .strict();

export type StudioCommentActor = z.infer<typeof StudioCommentActorSchema>;

const PageCommentAnchorSchema = z
  .object({
    type: z.literal("page"),
    pageId: IdSchema,
  })
  .strict();

const FrameCommentAnchorSchema = z
  .object({
    type: z.literal("frame"),
    pageId: IdSchema,
    frameId: IdSchema,
  })
  .strict();

const ElementCommentAnchorSchema = z
  .object({
    type: z.literal("element"),
    pageId: IdSchema,
    frameId: IdSchema.optional(),
    elementId: IdSchema,
  })
  .strict();

/** Figma식 자유 위치 핀 — 캔버스 논리 좌표를 0..1 로 정규화해 문서 크기와 무관하게 재투영한다. */
const PointCommentAnchorSchema = z
  .object({
    type: z.literal("point"),
    pageId: IdSchema,
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

/**
 * 가져온 PDF의 원본 페이지를 가리키는 앵커 (cat7 T3 저장 통합, 2026-10-08).
 * 스튜디오 페이지가 아니라 파일 내용 지문(SHA-256)이 문서 스코프이고, 페이지 번호는
 * 원본 기준이라 워크벤치에서 재배열·삭제해도 따라 움직이지 않는다. 좌표는 선택 —
 * 둘 다 없으면 페이지 전체 앵커, 있으면 페이지 위 핀이다.
 */
const PdfPageCommentAnchorSchema = z
  .object({
    type: z.literal("pdf-page"),
    documentId: IdSchema,
    sourcePageIndex: z.number().int().min(0),
    x: z.number().finite().min(0).max(1).optional(),
    y: z.number().finite().min(0).max(1).optional(),
  })
  .strict();

export const StudioCommentAnchorSchema = z.discriminatedUnion("type", [
  PageCommentAnchorSchema,
  FrameCommentAnchorSchema,
  ElementCommentAnchorSchema,
  PointCommentAnchorSchema,
  PdfPageCommentAnchorSchema,
]);

export type StudioCommentAnchor = z.infer<typeof StudioCommentAnchorSchema>;

const STUDIO_COMMENT_POINT_KEY_DECIMALS = 4;

/**
 * Returns the one canonical identity used everywhere an anchor is grouped or compared.
 *
 * Point coordinates intentionally use the same four-decimal bucket as canvas pins. At the
 * largest practical Webtoon canvas this absorbs sub-pixel serialization noise without mutating
 * the persisted v1 coordinate. JSON tuples keep arbitrary user-generated IDs collision-safe,
 * and an element's optional frame remains part of its identity.
 */
export function canonicalStudioCommentAnchorKey(value: StudioCommentAnchor): string {
  const anchor = StudioCommentAnchorSchema.parse(value);
  if (anchor.type === "page") return JSON.stringify(["page", anchor.pageId]);
  if (anchor.type === "frame") {
    return JSON.stringify(["frame", anchor.pageId, anchor.frameId]);
  }
  if (anchor.type === "element") {
    // Studio element IDs are page-global. A legacy frameId is descriptive metadata, not a
    // second identity axis; treating it as identity would render duplicate pins for one element.
    return JSON.stringify(["element", anchor.pageId, anchor.elementId]);
  }
  if (anchor.type === "pdf-page") {
    // Ported verbatim from the workbench's canonicalPdfPageAnchorKey so both key spaces stay
    // byte-identical: page-only anchors omit the coordinate pair entirely, and pins share the
    // point four-decimal bucket. The document fingerprint keeps PDFs collision-safe even when
    // two files share a page number.
    const base = ["pdf-page", anchor.documentId, anchor.sourcePageIndex];
    if (anchor.x === undefined || anchor.y === undefined) return JSON.stringify(base);
    return JSON.stringify([
      ...base,
      anchor.x.toFixed(STUDIO_COMMENT_POINT_KEY_DECIMALS),
      anchor.y.toFixed(STUDIO_COMMENT_POINT_KEY_DECIMALS),
    ]);
  }
  return JSON.stringify([
    "point",
    anchor.pageId,
    anchor.x.toFixed(STUDIO_COMMENT_POINT_KEY_DECIMALS),
    anchor.y.toFixed(STUDIO_COMMENT_POINT_KEY_DECIMALS),
  ]);
}
