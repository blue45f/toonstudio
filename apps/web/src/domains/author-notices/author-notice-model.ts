/**
 * 작가 공지 순수 모델 — 검증, 독자용 목록 필터, 상태 전환 제안 템플릿.
 *
 * 스토어·화면과 분리된 순수 함수만 둔다(뉴스레터 newsletter-model과 같은 경계).
 */

import type { SeriesStatus } from "@/platform/creator-client";

import type {
  AuthorNotice,
  AuthorNoticeDraftSeed,
  AuthorNoticeValidation,
} from "./author-notice-types";

/** 공지 초안 검증 — 빈 제목/본문은 게시할 수 없다(뉴스레터와 같은 가드). */
export function validateAuthorNoticeDraft(input: {
  title: string;
  body: string;
}): AuthorNoticeValidation {
  if (input.title.trim().length === 0) return { ok: false, reason: "empty-title" };
  if (input.body.trim().length === 0) return { ok: false, reason: "empty-body" };
  return { ok: true };
}

function sameAuthor(notice: AuthorNotice, authorName: string): boolean {
  return notice.authorName.trim() === authorName.trim();
}

function byPublishedDesc(a: AuthorNotice, b: AuthorNotice): number {
  const aTime = a.publishedAt ?? a.updatedAt;
  const bTime = b.publishedAt ?? b.updatedAt;
  return bTime.localeCompare(aTime);
}

/** 작가 페이지용 목록 — 게시된 공지만, 최신순. 작가 전체 공지와 그 작가의 작품 공지를 모두 포함한다. */
export function listPublishedNoticesForAuthor(
  notices: readonly AuthorNotice[],
  authorName: string,
): readonly AuthorNotice[] {
  return notices
    .filter((notice) => notice.status === "published" && sameAuthor(notice, authorName))
    .sort(byPublishedDesc);
}

/**
 * 작품 페이지용 목록 — 게시된 것 중 작가 전체 공지 + 이 작품의 공지만, 최신순.
 *
 * 작품 매칭은 제목 기준이다: 카탈로그 작품 ID와 크리에이터 시리즈 ID는 서로 다른
 * ID 공간이라, 두 표면을 잇는 공통 키가 공개 제목뿐이다(파일럿 범위의 명시적 한계).
 */
export function listPublishedNoticesForWork(
  notices: readonly AuthorNotice[],
  authorName: string,
  workTitle: string,
): readonly AuthorNotice[] {
  const normalizedTitle = workTitle.trim();
  return notices
    .filter((notice) => {
      if (notice.status !== "published" || !sameAuthor(notice, authorName)) return false;
      if (notice.scope.kind === "author") return true;
      return notice.scope.workTitle.trim() === normalizedTitle;
    })
    .sort(byPublishedDesc);
}

/**
 * 연재 상태 전환 → 공지 초안 제안.
 *
 * 휴재 진입과 휴재→연재 재개만 제안한다. 완결·그 외 전이는 공지를 만들지 않는다
 * (null). 본문은 사실만 담은 틀이다 — 사유·일정 같은 작가 사정은 작가가 직접 채운다.
 */
export function buildStatusTransitionNoticeDraft(input: {
  authorName: string;
  workTitle: string;
  from: SeriesStatus;
  to: SeriesStatus;
}): AuthorNoticeDraftSeed | null {
  const { authorName, workTitle, from, to } = input;
  if (to === "hiatus" && from !== "hiatus") {
    return {
      kind: "hiatus",
      title: `「${workTitle}」 휴재 안내`,
      body: [
        `안녕하세요, ${authorName}입니다.`,
        ``,
        `「${workTitle}」가 잠시 휴재에 들어갑니다. 기다려 주시는 독자분들께 죄송하고 감사한 마음입니다.`,
        `휴재 사유와 재개 일정은 아래에 적어 두겠습니다.`,
        ``,
        `(휴재 사유와 예상 재개 일정을 여기에 적어 주세요.)`,
      ].join("\n"),
    };
  }
  if (from === "hiatus" && to === "ongoing") {
    return {
      kind: "resume",
      title: `「${workTitle}」 연재 재개 안내`,
      body: [
        `안녕하세요, ${authorName}입니다.`,
        ``,
        `기다려 주셔서 감사합니다. 「${workTitle}」 연재를 다시 시작합니다.`,
        `재개 회차 공개 일정을 아래에 적어 두겠습니다.`,
        ``,
        `(첫 재개 회차 공개 일정을 여기에 적어 주세요.)`,
      ].join("\n"),
    };
  }
  return null;
}
