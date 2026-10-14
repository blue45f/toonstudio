/**
 * 외부 검수 링크 진입 기본값 — 순수 모델.
 *
 * 외부 검수자의 기본 경로는 "계정 가입·프로젝트 합류 없이 링크 하나로 진입"이다.
 * 이 모듈은 그 진입 화면이 의존하는 판정을 순수 함수로 고정한다:
 * - 연결 상태 분류(온라인/저속/오프라인) → 폴백 안내 문구 선택
 * - 작성 중 의견의 기기 내 임시 저장(오프라인·저속에서도 의견이 유실되지 않게)
 * - 검수 응답의 검색·태그 자산화(코멘트 본문에서 #태그 추출, 이름·본문·결정·태그 검색)
 *
 * 네트워크·스토리지 접근은 호출부가 주입하고, 여기서는 직렬화·판정만 담당한다.
 */

export type ReviewConnectionKind = "online" | "slow" | "offline";

/** navigator.connection 류의 최소 형태 — 테스트에서 그대로 주입할 수 있게 구조만 본다. */
export interface ConnectionInfoLike {
  effectiveType?: string;
  saveData?: boolean;
}

/**
 * 연결 상태를 3분류한다. 오프라인이 최우선이고, saveData나 2G 계열이면 저속으로 본다.
 * 정보가 없으면 온라인으로 간주한다(안내를 띄우지 않는 쪽이 기본 경로를 방해하지 않는다).
 */
export function classifyReviewConnection(input: {
  online: boolean;
  connection?: ConnectionInfoLike | null;
}): ReviewConnectionKind {
  if (!input.online) return "offline";
  const connection = input.connection;
  if (connection?.saveData) return "slow";
  const effectiveType = connection?.effectiveType?.toLowerCase() ?? "";
  if (effectiveType === "slow-2g" || effectiveType === "2g") return "slow";
  return "online";
}

/** 폴백 안내가 필요한 상태인지 — 온라인에서는 안내를 띄우지 않는다. */
export function needsConnectionFallback(kind: ReviewConnectionKind): boolean {
  return kind !== "online";
}

/* ── 작성 중 의견 임시 저장 ─────────────────────────────────────────────── */

export interface ExternalReviewDraft {
  reviewerName: string;
  decision: string;
  note: string;
  savedAt: string;
}

export function externalReviewDraftKey(reviewId: string): string {
  return `toonstudio.external-review-draft.${reviewId}`;
}

export function serializeExternalReviewDraft(draft: ExternalReviewDraft): string {
  return JSON.stringify(draft);
}

/** 깨진 저장값은 null — 화면은 빈 폼으로 폴백하고, 잘못된 값을 복원해 보여주지 않는다. */
export function parseExternalReviewDraft(raw: string | null): ExternalReviewDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ExternalReviewDraft>;
    if (typeof value.reviewerName !== "string" || typeof value.note !== "string") return null;
    if (typeof value.decision !== "string" || typeof value.savedAt !== "string") return null;
    return {
      reviewerName: value.reviewerName,
      decision: value.decision,
      note: value.note,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

/** 이름·의견이 모두 비면 저장할 초안이 아니다 — 빈 값으로 저장소를 덮지 않는다. */
export function isDraftWorthSaving(draft: Pick<ExternalReviewDraft, "reviewerName" | "note">): boolean {
  return draft.reviewerName.trim().length > 0 || draft.note.trim().length > 0;
}

/* ── 코멘트·태그 검색 자산화 ────────────────────────────────────────────── */

export interface ReviewResponseLike {
  reviewerName: string;
  decision: string;
  note: string;
}

/** 본문에서 #태그를 추출한다. 중복은 첫 등장 순서를 유지해 제거하고, 선행 #는 떼어 돌려준다. */
export function extractReviewTags(notes: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const note of notes) {
    for (const match of note.matchAll(/#([^\s#]+)/gu)) {
      const tag = match[1]!.replace(/[.,!?~)"'”’]+$/u, "");
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * 응답 검색 — 이름·본문·결정 라벨·태그를 한 번에 찾는다.
 * 질의가 비면 전체를 그대로 돌려준다(동일 참조가 아닌 새 배열 — 호출부의 정렬·표시와 분리).
 * 질의 앞의 #는 태그 검색으로 본다.
 */
export function filterReviewResponses<T extends ReviewResponseLike>(
  responses: readonly T[],
  query: string,
  decisionLabel: (decision: T["decision"]) => string,
): T[] {
  const needle = query.trim().replace(/^#/u, "").toLowerCase();
  if (!needle) return [...responses];
  return responses.filter((response) => {
    const haystacks = [
      response.reviewerName,
      response.note,
      decisionLabel(response.decision),
      ...extractReviewTags([response.note]),
    ];
    return haystacks.some((value) => value.toLowerCase().includes(needle));
  });
}

/* ── 권한 범위 표시 ─────────────────────────────────────────────────────── */

export type ExternalReviewPermission = "view" | "comment" | "approve" | "download";

/** 권한 범위 표시에 쓰는 고정 순서 — 화면은 이 순서대로 허용/차단을 한 줄씩 보여준다. */
export const EXTERNAL_REVIEW_PERMISSION_ORDER: readonly ExternalReviewPermission[] = [
  "view",
  "comment",
  "approve",
  "download",
];

export function permissionScopeRows(
  permissions: readonly ExternalReviewPermission[],
): { permission: ExternalReviewPermission; allowed: boolean }[] {
  const granted = new Set(permissions);
  // 보기는 링크 진입 자체의 전제다 — 서버가 view를 빠뜨려도 허용으로 표시해 진입 동선을 흔들지 않는다.
  granted.add("view");
  return EXTERNAL_REVIEW_PERMISSION_ORDER.map((permission) => ({
    permission,
    allowed: granted.has(permission),
  }));
}
