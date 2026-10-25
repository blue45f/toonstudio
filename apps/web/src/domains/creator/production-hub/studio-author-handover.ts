/**
 * studio-author-handover.ts — 작가 교체 인수인계 패키지 (순수 모듈, fetch 없음).
 *
 * 글·그림 작가 교체 전용 장치는 없었으나 역할 변경·대표 이전·이탈
 * 체크리스트·공유 설정 기반은 있었다. 이 모듈은 교체 시 신규 작가에게
 * 넘길 인계 패키지와 체크리스트를 묶는 것만 담당한다. 권한 변경 자체는
 * 기존 조직·역할 경로가 수행하고, 화풍 승계는 텍스트 분석까지만 다루며
 * 이미지 화풍 학습·모방은 다루지 않는다(라이선스·동의 장치 전제).
 */

export interface StudioAuthorHandoverInput {
  readonly workId: string;
  readonly workTitle: string;
  readonly outgoingAuthor: string;
  readonly incomingAuthor: string;
  readonly bibleSummary: string | null;
  readonly styleDnaProfileId: string | null;
  readonly referencePackId: string | null;
  readonly inProgressCutIds: readonly string[];
  readonly pendingReviewItems: readonly string[];
}

export interface StudioAuthorHandoverPackage {
  readonly workId: string;
  readonly workTitle: string;
  readonly outgoingAuthor: string;
  readonly incomingAuthor: string;
  readonly bibleSummary: string | null;
  readonly styleDnaProfileId: string | null;
  readonly referencePackId: string | null;
  readonly inProgressCutIds: readonly string[];
  readonly pendingReviewItems: readonly string[];
  readonly checklist: readonly string[];
  readonly createdAt: number;
}

export type StudioAuthorHandoverResult =
  | { readonly ok: true; readonly handover: StudioAuthorHandoverPackage }
  | { readonly ok: false; readonly reason: "empty_work" | "empty_authors" };

/** 인계 패키지와 체크리스트를 만든다. */
export function buildAuthorHandoverPackage(
  input: StudioAuthorHandoverInput,
  now: number = Date.now(),
): StudioAuthorHandoverResult {
  if (!input.workId.trim() || !input.workTitle.trim()) {
    return { ok: false, reason: "empty_work" };
  }
  if (!input.outgoingAuthor.trim() || !input.incomingAuthor.trim()) {
    return { ok: false, reason: "empty_authors" };
  }
  const checklist: string[] = [
    "캐릭터 바이블을 신규 작가와 함께 확인한다",
    "화풍·팔레트 기준을 신규 작가 첫 작업 전에 공유한다",
  ];
  if (input.referencePackId) {
    checklist.push("참조 팩을 신규 작가에게 전달한다");
  }
  if (input.inProgressCutIds.length > 0) {
    checklist.push(
      `진행 중 컷 ${input.inProgressCutIds.length}장의 상태를 인계한다`,
    );
  }
  if (input.pendingReviewItems.length > 0) {
    checklist.push(
      `미결 검수 항목 ${input.pendingReviewItems.length}건을 인계한다`,
    );
  }
  checklist.push("신규 작가 첫 작업 시 일관성 감사를 실행한다");
  return {
    ok: true,
    handover: {
      workId: input.workId,
      workTitle: input.workTitle,
      outgoingAuthor: input.outgoingAuthor,
      incomingAuthor: input.incomingAuthor,
      bibleSummary: input.bibleSummary,
      styleDnaProfileId: input.styleDnaProfileId,
      referencePackId: input.referencePackId,
      inProgressCutIds: Object.freeze([...input.inProgressCutIds]),
      pendingReviewItems: Object.freeze([...input.pendingReviewItems]),
      checklist: Object.freeze(checklist),
      createdAt: now,
    },
  };
}
