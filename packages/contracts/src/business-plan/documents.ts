import { parseDate, substantive } from "./primitives";
import { BUSINESS_PLAN_DOCUMENT_HISTORY_LIMIT } from "./types";

import type { BusinessPlanDiffLine, BusinessPlanDocument, BusinessPlanParseResult } from "./types";

/** 새 제출 후보를 만들어 반환한다. 입력 문서와 기존 후보는 변경하지 않는다. */
export function createSubmissionSnapshot(
  document: BusinessPlanDocument,
  label: string,
  now: Date = new Date(),
): BusinessPlanParseResult<BusinessPlanDocument> {
  const errors: string[] = [];
  if (!label.trim() || label.length > 500) errors.push("제출 후보 이름은 1~500자로 입력해 주세요.");
  if (!substantive(document.workingText)) errors.push("제출 후보에 보관할 작업용 원문이 없습니다.");
  if (!parseDate(document.updatedAt)) errors.push("작업용 문서의 수정 시각이 올바르지 않습니다.");
  if (!Number.isFinite(now.getTime())) errors.push("제출 후보의 생성 시각이 올바르지 않습니다.");
  if (errors.length) return { ok: false, errors };
  const history = document.history.map((item) => ({ ...item }));
  if (document.submission) history.push({ ...document.submission, type: "제출 후보" });
  return {
    ok: true,
    value: {
      ...document,
      history: history.slice(-BUSINESS_PLAN_DOCUMENT_HISTORY_LIMIT),
      submission: {
        label, text: document.workingText, createdAt: now.toISOString(), sourceUpdatedAt: document.updatedAt,
      },
    },
  };
}

/** 줄 단위 비교. 큰 입력은 텍스트를 버리지 않고 변경 블록으로 표시한다. */
export function diffLines(before = "", after = ""): BusinessPlanDiffLine[] {
  const leftText = before.replace(/\r\n?/g, "\n");
  const rightText = after.replace(/\r\n?/g, "\n");
  if (!leftText && !rightText) return [];
  const left = leftText ? leftText.split("\n") : [];
  const right = rightText ? rightText.split("\n") : [];
  if (left.length + right.length > 10_000) {
    if (leftText === rightText) return [{ type: "equal", text: leftText }];
    const blocks: BusinessPlanDiffLine[] = [];
    if (leftText) blocks.push({ type: "remove", text: leftText });
    if (rightText) blocks.push({ type: "add", text: rightText });
    return blocks;
  }
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix++;
  const a = left.slice(prefix, left.length - suffix);
  const b = right.slice(prefix, right.length - suffix);
  const result: BusinessPlanDiffLine[] = left.slice(0, prefix).map((line) => ({ type: "equal", text: line }));
  if (a.length * b.length <= 250_000) {
    const width = b.length + 1;
    const lengths = new Uint16Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        lengths[i * width + j] = a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        result.push({ type: "equal", text: a[i] }); i++; j++;
      } else if (i < a.length && (j >= b.length || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) {
        result.push({ type: "remove", text: a[i++] });
      } else {
        result.push({ type: "add", text: b[j++] });
      }
    }
  } else {
    if (a.length) result.push({ type: "remove", text: a.join("\n") });
    if (b.length) result.push({ type: "add", text: b.join("\n") });
  }
  return result.concat(left.slice(left.length - suffix).map((line) => ({ type: "equal", text: line })));
}
