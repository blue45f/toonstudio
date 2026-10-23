/**
 * 생산자 구조화 에러 해석 모듈 — comments 클러스터 구간: studio-comments 오류 17코드
 * (+작성자 라벨 3키) · studio-team-comment-client 오류 27코드 · studio-writer-room
 * 제안·결정 오류 13코드 (A4 D4, R14, 설계 r10-d4-trace-3.md §2.6·§2.23·§2.27).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고(message = 코드 문자열), 표시는 이 모듈의
 * 리졸버로만 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은
 * 신규 번역이다. comments.invalidActor의 {label}은 생산자가 라벨 코드
 * (author·resolver·assignee)로 방출하고, 이 모듈의 라벨 표로 표시 라벨로 되돌린다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioCommentErrorCode } from "./studio-comments-error";
import type { StudioTeamCommentErrorCode } from "./studio-team-comment-error";
import type { StudioWriterRoomErrorCode } from "./studio-writer-room-error";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.comments.invalidTime": "댓글 작업 시간이 올바르지 않아요.",
  "studio.producerError.comments.invalidDocument": "댓글 문서가 손상되었습니다. 먼저 댓글 데이터를 정규화해 주세요.",
  "studio.producerError.comments.invalidActor": "{label} 정보가 올바르지 않아요.",
  "studio.producerError.comments.actorAuthor": "작성자",
  "studio.producerError.comments.actorResolver": "해결한 사람",
  "studio.producerError.comments.actorAssignee": "담당자",
  "studio.producerError.comments.invalidMentions": "멘션 목록이 올바르지 않아요.",
  "studio.producerError.comments.invalidReferenceList": "레퍼런스 첨부 목록이 올바르지 않아요.",
  "studio.producerError.comments.tooManyReferences": "레퍼런스는 최대 {max}개까지 첨부할 수 있어요.",
  "studio.producerError.comments.invalidReference": "레퍼런스 첨부가 올바르지 않아요.",
  "studio.producerError.comments.duplicateReferenceId": "레퍼런스 ID가 중복됐어요.",
  "studio.producerError.comments.emptyBody": "댓글 내용을 입력해 주세요.",
  "studio.producerError.comments.invalidId": "댓글 ID는 클라이언트에서 발급한 유효한 문자열이어야 해요.",
  "studio.producerError.comments.invalidAnchor": "댓글 연결 위치가 올바르지 않아요.",
  "studio.producerError.comments.tooManyThreads": "댓글 스레드는 최대 {max}개까지 저장할 수 있어요.",
  "studio.producerError.comments.tooManyMessages": "댓글과 답글은 합쳐서 최대 {max}개까지 저장할 수 있어요.",
  "studio.producerError.comments.duplicateId": "이미 사용 중인 댓글 또는 답글 ID예요.",
  "studio.producerError.comments.tooManyReplies": "답글은 스레드당 최대 {max}개까지 저장할 수 있어요.",
  "studio.producerError.comments.invalidPatch": "댓글 수정 내용이 올바르지 않아요.",
  "studio.producerError.comments.forbiddenField": "수정할 수 없는 댓글 필드예요: {field}",
  "studio.producerError.teamComment.invalidWorkId": "댓글을 연결할 작품 ID가 올바르지 않습니다.",
  "studio.producerError.teamComment.invalidThreadId": "댓글 스레드 ID가 올바르지 않습니다.",
  "studio.producerError.teamComment.invalidListOptions": "댓글 목록 조건이 올바르지 않습니다.",
  "studio.producerError.teamComment.invalidThreadOptions": "댓글 상세 조회 조건이 올바르지 않습니다.",
  "studio.producerError.teamComment.invalidCreateInput": "새 댓글 내용 또는 연결 위치가 올바르지 않습니다.",
  "studio.producerError.teamComment.invalidReplyInput": "답글 내용이 올바르지 않습니다.",
  "studio.producerError.teamComment.invalidReanchorInput": "댓글의 새 위치 또는 변경 기준이 올바르지 않습니다.",
  "studio.producerError.teamComment.mutationIdUnavailable": "이 브라우저에서는 안전한 댓글 요청 식별자를 만들 수 없습니다.",
  "studio.producerError.teamComment.invalidLocalDocument": "기존 로컬 댓글 문서가 올바르지 않습니다.",
  "studio.producerError.teamComment.contractListResponse": "팀 댓글 목록 응답 형식이 올바르지 않습니다.",
  "studio.producerError.teamComment.contractThreadResponse": "팀 댓글 상세 응답 형식이 올바르지 않습니다.",
  "studio.producerError.teamComment.contractCreateResponse": "새 팀 댓글 응답 형식이 올바르지 않습니다.",
  "studio.producerError.teamComment.contractReplyResponse": "팀 댓글 답글 응답 형식이 올바르지 않습니다.",
  "studio.producerError.teamComment.contractReanchorResponse": "팀 댓글 위치 변경 응답 형식이 올바르지 않습니다.",
  "studio.producerError.teamComment.contractTransitionResponse": "팀 댓글 상태 응답 형식이 올바르지 않습니다.",
  "studio.producerError.teamComment.contractReadResponse": "팀 댓글 읽음 응답 형식이 올바르지 않습니다.",
  "studio.producerError.teamComment.contractReadAllResponse": "팀 댓글 전체 읽음 응답 형식이 올바르지 않습니다.",
  "studio.producerError.teamComment.contractScopeMismatch": "다른 작품 또는 댓글 스레드의 응답을 받았습니다.",
  "studio.producerError.teamComment.contractPageRangeExceeded": "요청한 댓글 페이지 범위를 벗어난 응답을 받았습니다.",
  "studio.producerError.teamComment.contractMessageRangeExceeded": "요청한 댓글 메시지 범위를 벗어난 응답을 받았습니다.",
  "studio.producerError.teamComment.contractCapabilitiesChanged": "댓글 목록을 불러오는 동안 팀 권한이 변경되었습니다.",
  "studio.producerError.teamComment.contractIncompleteHistory": "전체 댓글 기록이 포함되지 않은 응답을 받았습니다.",
  "studio.producerError.teamComment.contractDuplicateThread": "페이지 사이에 중복된 댓글 스레드를 받았습니다.",
  "studio.producerError.teamComment.contractSnapshotThreadLimit": "팀 댓글 스냅샷이 지원 한도를 벗어났습니다.",
  "studio.producerError.teamComment.contractSnapshotMessageLimit": "팀 댓글 메시지 스냅샷이 지원 한도를 벗어났습니다.",
  "studio.producerError.teamComment.contractCursorCycle": "댓글 페이지 커서가 순환했습니다.",
  "studio.producerError.teamComment.contractSnapshotIncomplete": "팀 댓글 전체 페이지를 안전한 범위 안에서 불러오지 못했습니다.",
  "studio.producerError.writerRoom.invalidTimestamp": "결정 시각은 유효한 ISO 날짜여야 해요.",
  "studio.producerError.writerRoom.unknownStage": "알 수 없는 Writer Room 단계예요.",
  "studio.producerError.writerRoom.invalidSuggestionId": "제안 ID 형식이 올바르지 않아요.",
  "studio.producerError.writerRoom.targetNotAllowed": "제안 대상 경로가 허용 목록에 없어요.",
  "studio.producerError.writerRoom.targetMissing": "제안 대상이 현재 Writer Room 문서에 없어요.",
  "studio.producerError.writerRoom.valueMismatch": "제안 값이 대상 필드 형식과 맞지 않아요.",
  "studio.producerError.writerRoom.sameValue": "현재 값과 다른 제안 값이 필요해요.",
  "studio.producerError.writerRoom.invalidSourceRef": "출처 참조 형식이 올바르지 않아요.",
  "studio.producerError.writerRoom.batchLimit": "한 번에 최대 {max}개 제안만 결정할 수 있어요.",
  "studio.producerError.writerRoom.duplicateFieldInBatch": "한 번의 승인 묶음에서 같은 필드를 두 번 변경할 수 없어요.",
  "studio.producerError.writerRoom.batchTargetInvalid": "승인할 제안의 대상 경로가 올바르지 않아요.",
  "studio.producerError.writerRoom.targetChanged": "제안 이후 대상 값이 바뀌었어요. 새 제안으로 다시 검토해 주세요.",
  "studio.producerError.writerRoom.batchValueMismatch": "승인할 제안 값이 대상 필드와 맞지 않아요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.comments.invalidTime": "The comment operation time is invalid.",
  "studio.producerError.comments.invalidDocument": "The comment document is corrupted. Please normalize the comment data first.",
  "studio.producerError.comments.invalidActor": "The {label} information is invalid.",
  "studio.producerError.comments.actorAuthor": "author",
  "studio.producerError.comments.actorResolver": "resolver",
  "studio.producerError.comments.actorAssignee": "assignee",
  "studio.producerError.comments.invalidMentions": "The mention list is invalid.",
  "studio.producerError.comments.invalidReferenceList": "The reference attachment list is invalid.",
  "studio.producerError.comments.tooManyReferences": "You can attach at most {max} references.",
  "studio.producerError.comments.invalidReference": "The reference attachment is invalid.",
  "studio.producerError.comments.duplicateReferenceId": "The reference ID is duplicated.",
  "studio.producerError.comments.emptyBody": "Please enter a comment.",
  "studio.producerError.comments.invalidId": "The comment ID must be a valid string issued by the client.",
  "studio.producerError.comments.invalidAnchor": "The comment anchor location is invalid.",
  "studio.producerError.comments.tooManyThreads": "You can save at most {max} comment threads.",
  "studio.producerError.comments.tooManyMessages": "You can save at most {max} comments and replies combined.",
  "studio.producerError.comments.duplicateId": "This comment or reply ID is already in use.",
  "studio.producerError.comments.tooManyReplies": "You can save at most {max} replies per thread.",
  "studio.producerError.comments.invalidPatch": "The comment edit is invalid.",
  "studio.producerError.comments.forbiddenField": "This comment field cannot be edited: {field}",
  "studio.producerError.teamComment.invalidWorkId": "The work ID to attach the comment to is invalid.",
  "studio.producerError.teamComment.invalidThreadId": "The comment thread ID is invalid.",
  "studio.producerError.teamComment.invalidListOptions": "The comment list options are invalid.",
  "studio.producerError.teamComment.invalidThreadOptions": "The comment detail query options are invalid.",
  "studio.producerError.teamComment.invalidCreateInput": "The new comment content or anchor location is invalid.",
  "studio.producerError.teamComment.invalidReplyInput": "The reply content is invalid.",
  "studio.producerError.teamComment.invalidReanchorInput": "The comment's new location or change basis is invalid.",
  "studio.producerError.teamComment.mutationIdUnavailable": "This browser cannot create a secure comment request identifier.",
  "studio.producerError.teamComment.invalidLocalDocument": "The existing local comment document is invalid.",
  "studio.producerError.teamComment.contractListResponse": "The team comment list response format is invalid.",
  "studio.producerError.teamComment.contractThreadResponse": "The team comment detail response format is invalid.",
  "studio.producerError.teamComment.contractCreateResponse": "The new team comment response format is invalid.",
  "studio.producerError.teamComment.contractReplyResponse": "The team comment reply response format is invalid.",
  "studio.producerError.teamComment.contractReanchorResponse": "The team comment reanchor response format is invalid.",
  "studio.producerError.teamComment.contractTransitionResponse": "The team comment status response format is invalid.",
  "studio.producerError.teamComment.contractReadResponse": "The team comment read response format is invalid.",
  "studio.producerError.teamComment.contractReadAllResponse": "The team comment read-all response format is invalid.",
  "studio.producerError.teamComment.contractScopeMismatch": "Received a response for a different work or comment thread.",
  "studio.producerError.teamComment.contractPageRangeExceeded": "Received a response outside the requested comment page range.",
  "studio.producerError.teamComment.contractMessageRangeExceeded": "Received a response outside the requested comment message range.",
  "studio.producerError.teamComment.contractCapabilitiesChanged": "Team permissions changed while the comment list was loading.",
  "studio.producerError.teamComment.contractIncompleteHistory": "Received a response that does not include the full comment history.",
  "studio.producerError.teamComment.contractDuplicateThread": "Received duplicate comment threads across pages.",
  "studio.producerError.teamComment.contractSnapshotThreadLimit": "The team comment snapshot exceeds the supported limit.",
  "studio.producerError.teamComment.contractSnapshotMessageLimit": "The team comment message snapshot exceeds the supported limit.",
  "studio.producerError.teamComment.contractCursorCycle": "The comment page cursor cycled.",
  "studio.producerError.teamComment.contractSnapshotIncomplete": "Could not load all team comment pages within the safe range.",
  "studio.producerError.writerRoom.invalidTimestamp": "The decision time must be a valid ISO date.",
  "studio.producerError.writerRoom.unknownStage": "This is an unknown Writer Room stage.",
  "studio.producerError.writerRoom.invalidSuggestionId": "The suggestion ID format is invalid.",
  "studio.producerError.writerRoom.targetNotAllowed": "The suggestion target path is not on the allowlist.",
  "studio.producerError.writerRoom.targetMissing": "The suggestion target is not in the current Writer Room document.",
  "studio.producerError.writerRoom.valueMismatch": "The suggested value does not match the target field format.",
  "studio.producerError.writerRoom.sameValue": "A suggested value different from the current value is required.",
  "studio.producerError.writerRoom.invalidSourceRef": "The source reference format is invalid.",
  "studio.producerError.writerRoom.batchLimit": "You can decide at most {max} suggestions at a time.",
  "studio.producerError.writerRoom.duplicateFieldInBatch": "The same field cannot be changed twice in one approval batch.",
  "studio.producerError.writerRoom.batchTargetInvalid": "The target path of the suggestion to approve is invalid.",
  "studio.producerError.writerRoom.targetChanged": "The target value changed after the suggestion. Please review it again as a new suggestion.",
  "studio.producerError.writerRoom.batchValueMismatch": "The suggested value to approve does not match the target field.",
});

const COMMENT_ERROR_KEYS: Readonly<Record<StudioCommentErrorCode, string>> = {
  invalidTime: "studio.producerError.comments.invalidTime",
  invalidDocument: "studio.producerError.comments.invalidDocument",
  invalidActor: "studio.producerError.comments.invalidActor",
  invalidMentions: "studio.producerError.comments.invalidMentions",
  invalidReferenceList: "studio.producerError.comments.invalidReferenceList",
  tooManyReferences: "studio.producerError.comments.tooManyReferences",
  invalidReference: "studio.producerError.comments.invalidReference",
  duplicateReferenceId: "studio.producerError.comments.duplicateReferenceId",
  emptyBody: "studio.producerError.comments.emptyBody",
  invalidId: "studio.producerError.comments.invalidId",
  invalidAnchor: "studio.producerError.comments.invalidAnchor",
  tooManyThreads: "studio.producerError.comments.tooManyThreads",
  tooManyMessages: "studio.producerError.comments.tooManyMessages",
  duplicateId: "studio.producerError.comments.duplicateId",
  tooManyReplies: "studio.producerError.comments.tooManyReplies",
  invalidPatch: "studio.producerError.comments.invalidPatch",
  forbiddenField: "studio.producerError.comments.forbiddenField",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const COMMENT_ERROR_KO: Readonly<Record<StudioCommentErrorCode, string>> = {
  invalidTime: "댓글 작업 시간이 올바르지 않아요.",
  invalidDocument: "댓글 문서가 손상되었습니다. 먼저 댓글 데이터를 정규화해 주세요.",
  invalidActor: "{label} 정보가 올바르지 않아요.",
  invalidMentions: "멘션 목록이 올바르지 않아요.",
  invalidReferenceList: "레퍼런스 첨부 목록이 올바르지 않아요.",
  tooManyReferences: "레퍼런스는 최대 {max}개까지 첨부할 수 있어요.",
  invalidReference: "레퍼런스 첨부가 올바르지 않아요.",
  duplicateReferenceId: "레퍼런스 ID가 중복됐어요.",
  emptyBody: "댓글 내용을 입력해 주세요.",
  invalidId: "댓글 ID는 클라이언트에서 발급한 유효한 문자열이어야 해요.",
  invalidAnchor: "댓글 연결 위치가 올바르지 않아요.",
  tooManyThreads: "댓글 스레드는 최대 {max}개까지 저장할 수 있어요.",
  tooManyMessages: "댓글과 답글은 합쳐서 최대 {max}개까지 저장할 수 있어요.",
  duplicateId: "이미 사용 중인 댓글 또는 답글 ID예요.",
  tooManyReplies: "답글은 스레드당 최대 {max}개까지 저장할 수 있어요.",
  invalidPatch: "댓글 수정 내용이 올바르지 않아요.",
  forbiddenField: "수정할 수 없는 댓글 필드예요: {field}",
};

/** 작성자 라벨 코드 → 표시 라벨 키. 라벨 자체는 로케일별로 해석한다. */
const COMMENT_ACTOR_LABEL_KEYS: Readonly<Record<string, string>> = {
  author: "studio.producerError.comments.actorAuthor",
  resolver: "studio.producerError.comments.actorResolver",
  assignee: "studio.producerError.comments.actorAssignee",
};

const COMMENT_ACTOR_LABEL_KO: Readonly<Record<string, string>> = {
  author: "작성자",
  resolver: "해결한 사람",
  assignee: "담당자",
};

/** 표시 지점 전용 해석 (comments): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioCommentError(
  error: { readonly code: StudioCommentErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  let params = error.params;
  if (error.code === "invalidActor" && params?.label) {
    const labelKey = COMMENT_ACTOR_LABEL_KEYS[params.label];
    if (labelKey) {
      const label = resolveProducerError(labelKey, COMMENT_ACTOR_LABEL_KO[params.label] ?? params.label);
      params = { ...params, label };
    }
  }
  return resolveProducerError(COMMENT_ERROR_KEYS[error.code], COMMENT_ERROR_KO[error.code], params);
}

/**
 * 표시 지점 전용 해석 (comments, 원인 객체 덕 타이핑): Panel·Popover의 catch가
 * 원인 객체만으로 부른다. 생산자 클래스를 런타임 import하면 진입 그래프에 생산자가
 * 끌려올 수 있어 이름+코드 덕 타이핑으로 판정한다. 해당하지 않으면 null —
 * 호출자는 기존 메시지 경로를 유지한다.
 */
export function resolveStudioCommentErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioCommentError" || typeof code !== "string") return null;
  if (!Object.hasOwn(COMMENT_ERROR_KEYS, code)) return null;
  return resolveStudioCommentError({
    code: code as StudioCommentErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

const TEAM_COMMENT_ERROR_KEYS: Readonly<Record<StudioTeamCommentErrorCode, string>> = {
  invalidWorkId: "studio.producerError.teamComment.invalidWorkId",
  invalidThreadId: "studio.producerError.teamComment.invalidThreadId",
  invalidListOptions: "studio.producerError.teamComment.invalidListOptions",
  invalidThreadOptions: "studio.producerError.teamComment.invalidThreadOptions",
  invalidCreateInput: "studio.producerError.teamComment.invalidCreateInput",
  invalidReplyInput: "studio.producerError.teamComment.invalidReplyInput",
  invalidReanchorInput: "studio.producerError.teamComment.invalidReanchorInput",
  mutationIdUnavailable: "studio.producerError.teamComment.mutationIdUnavailable",
  invalidLocalDocument: "studio.producerError.teamComment.invalidLocalDocument",
  contractListResponse: "studio.producerError.teamComment.contractListResponse",
  contractThreadResponse: "studio.producerError.teamComment.contractThreadResponse",
  contractCreateResponse: "studio.producerError.teamComment.contractCreateResponse",
  contractReplyResponse: "studio.producerError.teamComment.contractReplyResponse",
  contractReanchorResponse: "studio.producerError.teamComment.contractReanchorResponse",
  contractTransitionResponse: "studio.producerError.teamComment.contractTransitionResponse",
  contractReadResponse: "studio.producerError.teamComment.contractReadResponse",
  contractReadAllResponse: "studio.producerError.teamComment.contractReadAllResponse",
  contractScopeMismatch: "studio.producerError.teamComment.contractScopeMismatch",
  contractPageRangeExceeded: "studio.producerError.teamComment.contractPageRangeExceeded",
  contractMessageRangeExceeded: "studio.producerError.teamComment.contractMessageRangeExceeded",
  contractCapabilitiesChanged: "studio.producerError.teamComment.contractCapabilitiesChanged",
  contractIncompleteHistory: "studio.producerError.teamComment.contractIncompleteHistory",
  contractDuplicateThread: "studio.producerError.teamComment.contractDuplicateThread",
  contractSnapshotThreadLimit: "studio.producerError.teamComment.contractSnapshotThreadLimit",
  contractSnapshotMessageLimit: "studio.producerError.teamComment.contractSnapshotMessageLimit",
  contractCursorCycle: "studio.producerError.teamComment.contractCursorCycle",
  contractSnapshotIncomplete: "studio.producerError.teamComment.contractSnapshotIncomplete",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const TEAM_COMMENT_ERROR_KO: Readonly<Record<StudioTeamCommentErrorCode, string>> = {
  invalidWorkId: "댓글을 연결할 작품 ID가 올바르지 않습니다.",
  invalidThreadId: "댓글 스레드 ID가 올바르지 않습니다.",
  invalidListOptions: "댓글 목록 조건이 올바르지 않습니다.",
  invalidThreadOptions: "댓글 상세 조회 조건이 올바르지 않습니다.",
  invalidCreateInput: "새 댓글 내용 또는 연결 위치가 올바르지 않습니다.",
  invalidReplyInput: "답글 내용이 올바르지 않습니다.",
  invalidReanchorInput: "댓글의 새 위치 또는 변경 기준이 올바르지 않습니다.",
  mutationIdUnavailable: "이 브라우저에서는 안전한 댓글 요청 식별자를 만들 수 없습니다.",
  invalidLocalDocument: "기존 로컬 댓글 문서가 올바르지 않습니다.",
  contractListResponse: "팀 댓글 목록 응답 형식이 올바르지 않습니다.",
  contractThreadResponse: "팀 댓글 상세 응답 형식이 올바르지 않습니다.",
  contractCreateResponse: "새 팀 댓글 응답 형식이 올바르지 않습니다.",
  contractReplyResponse: "팀 댓글 답글 응답 형식이 올바르지 않습니다.",
  contractReanchorResponse: "팀 댓글 위치 변경 응답 형식이 올바르지 않습니다.",
  contractTransitionResponse: "팀 댓글 상태 응답 형식이 올바르지 않습니다.",
  contractReadResponse: "팀 댓글 읽음 응답 형식이 올바르지 않습니다.",
  contractReadAllResponse: "팀 댓글 전체 읽음 응답 형식이 올바르지 않습니다.",
  contractScopeMismatch: "다른 작품 또는 댓글 스레드의 응답을 받았습니다.",
  contractPageRangeExceeded: "요청한 댓글 페이지 범위를 벗어난 응답을 받았습니다.",
  contractMessageRangeExceeded: "요청한 댓글 메시지 범위를 벗어난 응답을 받았습니다.",
  contractCapabilitiesChanged: "댓글 목록을 불러오는 동안 팀 권한이 변경되었습니다.",
  contractIncompleteHistory: "전체 댓글 기록이 포함되지 않은 응답을 받았습니다.",
  contractDuplicateThread: "페이지 사이에 중복된 댓글 스레드를 받았습니다.",
  contractSnapshotThreadLimit: "팀 댓글 스냅샷이 지원 한도를 벗어났습니다.",
  contractSnapshotMessageLimit: "팀 댓글 메시지 스냅샷이 지원 한도를 벗어났습니다.",
  contractCursorCycle: "댓글 페이지 커서가 순환했습니다.",
  contractSnapshotIncomplete: "팀 댓글 전체 페이지를 안전한 범위 안에서 불러오지 못했습니다.",
};

/** 표시 지점 전용 해석 (teamComment): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioTeamCommentError(
  error: { readonly code: StudioTeamCommentErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  return resolveProducerError(TEAM_COMMENT_ERROR_KEYS[error.code], TEAM_COMMENT_ERROR_KO[error.code], error.params);
}

/**
 * 표시 지점 전용 해석 (teamComment, 원인 객체 덕 타이핑): 입력 오류와 응답 계약
 * 오류 두 클래스가 같은 코드 공간을 공유하므로 이름은 둘 다 허용한다.
 * 해당하지 않으면 null — 호출자는 기존 메시지 경로를 유지한다.
 */
export function resolveStudioTeamCommentErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioTeamCommentInputError" && name !== "StudioTeamCommentResponseContractError") return null;
  if (typeof code !== "string" || !Object.hasOwn(TEAM_COMMENT_ERROR_KEYS, code)) return null;
  return resolveStudioTeamCommentError({
    code: code as StudioTeamCommentErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

const WRITER_ROOM_ERROR_KEYS: Readonly<Record<StudioWriterRoomErrorCode, string>> = {
  invalidTimestamp: "studio.producerError.writerRoom.invalidTimestamp",
  unknownStage: "studio.producerError.writerRoom.unknownStage",
  invalidSuggestionId: "studio.producerError.writerRoom.invalidSuggestionId",
  targetNotAllowed: "studio.producerError.writerRoom.targetNotAllowed",
  targetMissing: "studio.producerError.writerRoom.targetMissing",
  valueMismatch: "studio.producerError.writerRoom.valueMismatch",
  sameValue: "studio.producerError.writerRoom.sameValue",
  invalidSourceRef: "studio.producerError.writerRoom.invalidSourceRef",
  batchLimit: "studio.producerError.writerRoom.batchLimit",
  duplicateFieldInBatch: "studio.producerError.writerRoom.duplicateFieldInBatch",
  batchTargetInvalid: "studio.producerError.writerRoom.batchTargetInvalid",
  targetChanged: "studio.producerError.writerRoom.targetChanged",
  batchValueMismatch: "studio.producerError.writerRoom.batchValueMismatch",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const WRITER_ROOM_ERROR_KO: Readonly<Record<StudioWriterRoomErrorCode, string>> = {
  invalidTimestamp: "결정 시각은 유효한 ISO 날짜여야 해요.",
  unknownStage: "알 수 없는 Writer Room 단계예요.",
  invalidSuggestionId: "제안 ID 형식이 올바르지 않아요.",
  targetNotAllowed: "제안 대상 경로가 허용 목록에 없어요.",
  targetMissing: "제안 대상이 현재 Writer Room 문서에 없어요.",
  valueMismatch: "제안 값이 대상 필드 형식과 맞지 않아요.",
  sameValue: "현재 값과 다른 제안 값이 필요해요.",
  invalidSourceRef: "출처 참조 형식이 올바르지 않아요.",
  batchLimit: "한 번에 최대 {max}개 제안만 결정할 수 있어요.",
  duplicateFieldInBatch: "한 번의 승인 묶음에서 같은 필드를 두 번 변경할 수 없어요.",
  batchTargetInvalid: "승인할 제안의 대상 경로가 올바르지 않아요.",
  targetChanged: "제안 이후 대상 값이 바뀌었어요. 새 제안으로 다시 검토해 주세요.",
  batchValueMismatch: "승인할 제안 값이 대상 필드와 맞지 않아요.",
};

/** 표시 지점 전용 해석 (writerRoom): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioWriterRoomError(
  error: { readonly code: StudioWriterRoomErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  return resolveProducerError(WRITER_ROOM_ERROR_KEYS[error.code], WRITER_ROOM_ERROR_KO[error.code], error.params);
}

/** 표시 지점 전용 해석 (writerRoom, 원인 객체 덕 타이핑). 해당하지 않으면 null. */
export function resolveStudioWriterRoomErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioWriterRoomError" || typeof code !== "string") return null;
  if (!Object.hasOwn(WRITER_ROOM_ERROR_KEYS, code)) return null;
  return resolveStudioWriterRoomError({
    code: code as StudioWriterRoomErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

/**
 * 댓글 표시 지점 공용 진입점: 로컬 댓글 생산자와 팀 댓글 클라이언트 생산자의
 * 원인만 해석한다. 두 생산자가 한 표시 지점(Panel·Popover·런타임)에 함께 닿기
 * 때문이다. 타 생산자 오류·미지 코드는 null — 호출자는 기존 메시지 경로를 유지한다.
 */
export function resolveStudioCommentClusterErrorFromCause(cause: unknown): string | null {
  return resolveStudioCommentErrorFromCause(cause) ?? resolveStudioTeamCommentErrorFromCause(cause);
}
