import { z } from "zod";

import { FINAL_SUBMISSION_MAX_BYTES, STATUSES } from "./types";

export function isSafeUrl(value: string): boolean {
  if (!value.trim() || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function isFinalSubmissionDate(value: string): boolean {
  if (!value) return true;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(value);
  if (!match) return false;
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return false;
  if (!match[2]) return true;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return false;
  return Number.isFinite(Date.parse(value.replace(" ", "T")));
}

/** 함수·접근자·순환 참조·프로토타입 확장을 받지 않고 JSON 크기 상한을 먼저 검사한다. */
export function checkJsonInput(value: unknown): string | null {
  const ancestors = new Set<object>();
  let count = 0;
  function visit(item: unknown, depth: number): boolean {
    if (++count > 100_000 || depth > 12) return false;
    if (item === null || typeof item === "boolean" || typeof item === "string") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item !== "object" || ancestors.has(item)) return false;
    const prototype = Object.getPrototypeOf(item);
    if (Array.isArray(item) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    ancestors.add(item);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (key === "__proto__" || key === "prototype" || key === "constructor" || !Object.hasOwn(descriptor, "value") || !visit(descriptor.value, depth + 1)) return false;
    }
    ancestors.delete(item);
    return true;
  }
  try {
    if (!visit(value, 0)) return "점검 보드는 확장 속성이나 순환 참조가 없는 JSON 기록이어야 합니다.";
    const text = JSON.stringify(value);
    if (!text || new TextEncoder().encode(text).byteLength > FINAL_SUBMISSION_MAX_BYTES) return "점검 기록은 2MB 이하여야 합니다.";
    return null;
  } catch { return "점검 기록의 JSON 형식을 확인할 수 없습니다."; }
}

const text = z.string().max(12_000);
const id = z.string().trim().min(1).max(120);
const date = text.refine(isFinalSubmissionDate, "실제 존재하는 YYYY-MM-DD 또는 날짜·시간을 입력해 주세요.");
const url = text.refine((value) => !value || isSafeUrl(value), "http 또는 https 근거 링크가 필요합니다.");
const link = z.object({ label: text.refine((value) => Boolean(value.trim()), "근거 이름이 필요합니다."), url: url.refine(Boolean, "근거 링크가 필요합니다.") }).strict();
const platform = z.object({
  status: z.enum(["미확인", "제출 확인", "미제출 확인"]), fileName: text, version: text, hash: text,
  uploadedAt: date, submittedAt: date, evidenceUrl: url, receipt: text, observedAt: date,
  comparison: z.enum(["미확인", "일치 확인", "차이 확인"]), comparisonNote: text,
}).strict();
const document = z.object({
  id, label: text.refine((value) => Boolean(value.trim()), "관리 파일 이름이 필요합니다."), fileName: text, version: text,
  versionBasis: text, authoredAt: date, modifiedAt: date, metadataNote: text, sourceUrl: url,
  availability: z.enum(["미확보", "메타데이터 확인", "내용 확인"]), candidateState: z.enum(["미확인", "검토 후보", "최종본 확정"]),
  candidateEvidence: url, finalizedAt: date, expectedFormat: text, formatStatus: z.enum(["미확인", "적합 확인", "문제 확인"]),
  fileHash: text, bytes: text.refine((value) => !value || /^\d+$/.test(value), "용량은 bytes 단위의 정수로 기록해 주세요."),
  lastConfirmedAt: date, notes: text, platform,
}).strict();
const task = z.object({
  id, title: text.refine((value) => Boolean(value.trim()), "점검 항목 제목이 필요합니다."), category: text, docId: text,
  status: z.enum(STATUSES), priority: z.enum(["높음", "보통"]), issueType: z.enum(["미확인", "차이 확인", "확인 필요"]),
  fileName: text, version: text, authoredAt: date, modifiedAt: date, evidenceLinks: z.array(link).max(30), attachments: z.array(link).max(30),
  discrepancy: text, nextAction: text, lastConfirmedAt: date, confirmedBy: text, confirmationNote: text,
  approvalRequired: z.boolean(), unresolved: z.boolean(), updatedAt: date, provenance: text,
}).strict();
const source = z.object({ id, title: text.refine((value) => Boolean(value.trim()), "기준 자료 이름이 필요합니다."), url, type: text, observedAt: date, note: text }).strict();
export const finalSubmissionBoardSchema = z.object({
  schemaVersion: z.literal(1), documents: z.array(document).max(50), tasks: z.array(task).max(300), sources: z.array(source).max(200),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), updatedAt: date,
}).strict();
