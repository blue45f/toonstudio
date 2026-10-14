/**
 * 검수 코멘트 — 컷/주제 단위 스레드 + 결정 이력 모델
 *
 * 설계 원칙 (프레즌스 세션 한정·집중 존중):
 * 검수 코멘트는 시간순으로 흘러가 버리는 채팅 피드가 아니다. 코멘트는
 * 컷(프레임)·페이지·요소 같은 "주제"에 묶인 스레드로 남고, 스레드가
 * 해결(resolved)되는 순간 "누가·언제·무엇으로 결론 냈는지"가 결정 이력으로
 * 고정된다. 세션이 끝나도 결정은 스레드에 남아 다음 작업자가 읽는다.
 *
 * 서버 계약(studio-team-comment)의 스레드는 이미 앵커·해결자·해결 시각을
 * 갖고 있다. 이 모듈은 그 위에 (1) 앵커 기준 주제 그룹핑과 (2) 결정 이력
 * 도출만 얹는 순수 뷰 모델이다. 앵커 동일성은 기존 정본
 * `canonicalStudioCommentAnchorKey`를 그대로 쓴다 — 새 키 규칙을 만들지
 * 않는다.
 */

import { canonicalStudioCommentAnchorKey } from "./studio-comments";
import type { StudioTeamCommentThread } from "./studio-team-comment-client";

/** 스레드가 묶이는 주제 종류. frame이 웹툰의 "컷"이다. */
export type ReviewThreadSubjectKind = "page" | "cut" | "element" | "pin" | "pdf-page" | "compare-image";

/** 컷/주제 단위 주제 식별. UI는 pageId·frameId를 실제 표시명으로 바꿔 단다. */
export interface ReviewThreadSubject {
  /** canonicalStudioCommentAnchorKey 와 동일한 그룹 키. */
  readonly key: string;
  readonly kind: ReviewThreadSubjectKind;
  readonly pageId: string | null;
  readonly frameId: string | null;
  readonly elementId: string | null;
}

export interface ReviewThreadSubjectGroup {
  readonly subject: ReviewThreadSubject;
  /** 최근 활동순 스레드. */
  readonly threads: readonly StudioTeamCommentThread[];
  readonly openCount: number;
  readonly resolvedCount: number;
  /** 그룹 내 가장 최근 활동 시각 (ISO). 정렬 기준. */
  readonly latestActivityAt: string;
}

/** 스레드 하나의 결정 상태. 해결된 스레드만 결정으로 인정한다. */
export interface ReviewThreadDecision {
  readonly threadId: string;
  readonly outcome: "open" | "resolved";
  /** 해결한 사람 이름. 미해결이면 null. */
  readonly decidedByName: string | null;
  /** 해결 시각 (ISO). 미해결이면 null. */
  readonly decidedAt: string | null;
  /**
   * 결론 메모 — 해결 시점의 마지막 메시지 본문 발췌.
   * 서버 스레드에는 별도 "결론" 필드가 없어, 스레드의 마지막 메시지를
   * 결론으로 간주한다. 메시지가 잘려 온 경우(messagesTruncated)에는
   * 발췌가 비어 있을 수 있어 null을 허용한다.
   */
  readonly closingNote: string | null;
}

/** 결정 이력 한 줄. 세션 종료 요약·인계가 이 목록을 그대로 쓴다. */
export interface ReviewDecisionLogEntry extends ReviewThreadDecision {
  readonly outcome: "resolved";
  readonly subject: ReviewThreadSubject;
  readonly messageCount: number;
}

const CLOSING_NOTE_MAX_LENGTH = 140;

function subjectKind(thread: StudioTeamCommentThread): ReviewThreadSubjectKind {
  switch (thread.anchor.type) {
    case "frame":
      return "cut";
    case "point":
      return "pin";
    default:
      return thread.anchor.type;
  }
}

/** 스레드의 주제(컷/페이지/요소)를 도출한다. */
export function reviewThreadSubject(thread: StudioTeamCommentThread): ReviewThreadSubject {
  const anchor = thread.anchor;
  return Object.freeze({
    key: canonicalStudioCommentAnchorKey(anchor),
    kind: subjectKind(thread),
    pageId: "pageId" in anchor ? anchor.pageId : null,
    frameId: anchor.type === "frame" || anchor.type === "element" ? (anchor.frameId ?? null) : null,
    elementId: anchor.type === "element" ? anchor.elementId : null,
  });
}

function closingNoteOf(thread: StudioTeamCommentThread): string | null {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return null;
  const body = last.body.trim();
  if (!body) return null;
  return body.length > CLOSING_NOTE_MAX_LENGTH
    ? `${body.slice(0, CLOSING_NOTE_MAX_LENGTH)}…`
    : body;
}

/** 스레드의 결정 상태를 도출한다. 열린 스레드는 아직 결정이 아니다. */
export function reviewThreadDecision(thread: StudioTeamCommentThread): ReviewThreadDecision {
  if (thread.status !== "resolved") {
    return Object.freeze({
      threadId: thread.id,
      outcome: "open" as const,
      decidedByName: null,
      decidedAt: null,
      closingNote: null,
    });
  }
  return Object.freeze({
    threadId: thread.id,
    outcome: "resolved" as const,
    decidedByName: thread.resolvedBy?.name ?? null,
    decidedAt: thread.resolvedAt,
    closingNote: closingNoteOf(thread),
  });
}

/**
 * 스레드를 컷/주제 단위로 묶는다. 채팅 피드처럼 시간순 한 줄로 섞지 않는다.
 * 정렬: 미해결이 있는 그룹 먼저, 그 안에서 최근 활동순.
 */
export function groupReviewThreadsBySubject(
  threads: readonly StudioTeamCommentThread[],
): readonly ReviewThreadSubjectGroup[] {
  const byKey = new Map<string, StudioTeamCommentThread[]>();
  for (const thread of threads) {
    const key = canonicalStudioCommentAnchorKey(thread.anchor);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(thread);
    else byKey.set(key, [thread]);
  }
  const groups: ReviewThreadSubjectGroup[] = [];
  for (const bucket of byKey.values()) {
    const sorted = [...bucket].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const first = sorted[0];
    if (!first) continue;
    groups.push(Object.freeze({
      subject: reviewThreadSubject(first),
      threads: Object.freeze(sorted),
      openCount: sorted.filter((thread) => thread.status === "open").length,
      resolvedCount: sorted.filter((thread) => thread.status === "resolved").length,
      latestActivityAt: first.updatedAt,
    }));
  }
  groups.sort((a, b) => {
    const openDelta = (b.openCount > 0 ? 1 : 0) - (a.openCount > 0 ? 1 : 0);
    if (openDelta !== 0) return openDelta;
    return Date.parse(b.latestActivityAt) - Date.parse(a.latestActivityAt);
  });
  return Object.freeze(groups);
}

/**
 * 결정 이력 전체를 도출한다. 해결된 스레드만, 해결 시각 내림차순.
 * 세션이 끝나 프레즌스가 사라져도 이 이력은 스레드에 남아 남는다.
 */
export function buildReviewDecisionLog(
  threads: readonly StudioTeamCommentThread[],
): readonly ReviewDecisionLogEntry[] {
  const entries: ReviewDecisionLogEntry[] = [];
  for (const thread of threads) {
    const decision = reviewThreadDecision(thread);
    if (decision.outcome !== "resolved") continue;
    entries.push(Object.freeze({
      ...decision,
      outcome: "resolved" as const,
      subject: reviewThreadSubject(thread),
      messageCount: thread.messageCount,
    }));
  }
  entries.sort(
    (a, b) => Date.parse(b.decidedAt ?? "") - Date.parse(a.decidedAt ?? ""),
  );
  return Object.freeze(entries);
}

/** 아직 결정이 필요한(열린) 스레드 수. 세션 바의 "남은 결정" 표시용. */
export function countOpenReviewThreads(
  threads: readonly StudioTeamCommentThread[],
): number {
  return threads.filter((thread) => thread.status === "open").length;
}
