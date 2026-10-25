/**
 * studio-ai-review-checklist.ts — 검수 코멘트 → 수정 체크리스트 규칙 변환 (순수 모듈, fetch 없음).
 *
 * PD·검수자의 코멘트를 작가의 할 일로 자동 전환한다. LLM 의미 분석은
 * 유료 전제이므로, 이번 단계에서는 규칙 기반 1차 변환만 한다.
 * 규칙에 걸리지 않는 문장은 "확인 필요"로 원문 그대로 남긴다.
 */

export interface StudioAiReviewChecklistItem {
  readonly id: string;
  readonly cutNumber: number | null;
  readonly action: string;
  readonly detail: string;
  readonly verbatim: string;
}

const ACTION_RULES: readonly {
  readonly pattern: RegExp;
  readonly action: string;
}[] = Object.freeze([
  { pattern: /채도/, action: "채도 조정" },
  { pattern: /명도|밝기/, action: "명도 조정" },
  { pattern: /선화|선\b/, action: "선화 수정" },
  { pattern: /배경/, action: "배경 수정" },
  { pattern: /대사|말풍선/, action: "대사 수정" },
  { pattern: /위치|이동|배치/, action: "위치 조정" },
  { pattern: /색/, action: "색상 수정" },
]);

const CUT_PATTERN = /(\d+)\s*컷/;

function toChecklistItem(line: string, index: number): StudioAiReviewChecklistItem {
  const verbatim = line.trim();
  const cutMatch = CUT_PATTERN.exec(verbatim);
  const cutNumber = cutMatch ? Number(cutMatch[1]) : null;
  const rule = ACTION_RULES.find((entry) => entry.pattern.test(verbatim));
  return {
    id: `review-${index}`,
    cutNumber,
    action: rule ? rule.action : "확인 필요",
    detail: verbatim,
    verbatim,
  };
}

/** 코멘트를 줄·세미콜론 단위로 나눠 체크리스트로 변환한다. 빈 줄은 버린다. */
export function convertReviewCommentToChecklist(
  comment: string,
): readonly StudioAiReviewChecklistItem[] {
  const lines = comment
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return Object.freeze(lines.map((line, index) => toChecklistItem(line, index)));
}

export interface StudioAiReviewChecklistGroup {
  readonly cutNumber: number | null;
  readonly items: readonly StudioAiReviewChecklistItem[];
}

/** 컷 번호별로 묶는다. 컷 번호가 없는 항목은 마지막에 한 그룹으로 모은다. */
export function groupReviewChecklistByCut(
  items: readonly StudioAiReviewChecklistItem[],
): readonly StudioAiReviewChecklistGroup[] {
  const groups = new Map<number | null, StudioAiReviewChecklistItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.cutNumber) ?? [];
    bucket.push(item);
    groups.set(item.cutNumber, bucket);
  }
  const numbered = [...groups.entries()]
    .filter(([cutNumber]) => cutNumber !== null)
    .sort(([a], [b]) => (a as number) - (b as number))
    .map(([cutNumber, bucket]) => ({
      cutNumber,
      items: Object.freeze(bucket),
    }));
  const unnumbered = groups.get(null);
  if (unnumbered) {
    numbered.push({ cutNumber: null, items: Object.freeze(unnumbered) });
  }
  return Object.freeze(numbered);
}
