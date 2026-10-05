/**
 * 작가 공지 타입 — 작가 전체 공지와 작품 단위 공지를 한 구조로 다룬다.
 *
 * 뉴스레터와 같은 로컬-퍼스트 파일럿이다: 정본은 이 브라우저의 IndexedDB이고,
 * 서버 공지/알림 계약이 생기면 스토어의 동기화 지점만 교체한다.
 */

/** 공지 유형 — 휴재·재개는 연재 상태 전환 제안과 연결된다. */
export type AuthorNoticeKind = "general" | "hiatus" | "resume" | "schedule";

/**
 * 공지 범위. 작가 전체 공지는 그 작가의 모든 작품 페이지에 함께 보이고,
 * 작품 공지는 해당 작품 페이지에만 보인다.
 */
export type AuthorNoticeScope =
  | { readonly kind: "author" }
  | { readonly kind: "work"; readonly workId: string; readonly workTitle: string };

export type AuthorNoticeStatus = "draft" | "published";

export interface AuthorNotice {
  readonly id: string;
  /** 작성 계정 ID. 구 persist 데이터에는 없을 수 있어 미귀속(null)을 허용한다. */
  readonly ownerId: string | null;
  /** 독자 표면에서 매칭하는 공개 작가 이름(필명). */
  readonly authorName: string;
  readonly scope: AuthorNoticeScope;
  readonly kind: AuthorNoticeKind;
  readonly title: string;
  readonly body: string;
  readonly status: AuthorNoticeStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** 마지막으로 게시한 시각. 게시한 적 없으면 null. */
  readonly publishedAt: string | null;
}

export type AuthorNoticeValidationReason = "empty-title" | "empty-body";

export type AuthorNoticeValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: AuthorNoticeValidationReason };

/** 상태 전환 제안으로 만든 공지 초안의 재료 — 스토어가 이걸로 초안을 생성한다. */
export interface AuthorNoticeDraftSeed {
  readonly kind: AuthorNoticeKind;
  readonly title: string;
  readonly body: string;
}
