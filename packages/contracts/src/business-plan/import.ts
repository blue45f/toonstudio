import { validateClaim } from "./evidence";
import { parseDate, plain, safeUrl } from "./primitives";
import { APPROVAL_TYPES, BUSINESS_PLAN_MAX_IMPORT_BYTES, CLAIM_KINDS, FACT_STATUS, STATUS } from "./types";

import type { BusinessPlanParseResult, BusinessPlanState, BusinessPlanValidationResult } from "./types";

const CAPS = { tasks: 200, claims: 1000, documents: 100, mentor: 300, checks: 300, approvals: 4, activity: 1000 } as const;
type ListKey = keyof typeof CAPS;
const CLAIM_STRINGS = [
  "title", "text", "value", "unit", "period", "scope", "sourceUrl", "sourceTitle", "publisher", "publishedAt", "sourceLocation",
  "originalExcerpt", "crossSourceUrl", "crossSourceTitle", "crossNotes", "verifiedAt", "reviewer", "notes", "assumptions", "formula",
] as const;

/** v1 백업과 서버 저장에 같은 구조·근거·참조 검사를 적용한다. 원문을 네트워크로 전송하지 않는다. */
export function validateImport(obj: unknown, now: Date = new Date()): BusinessPlanValidationResult {
  const errors: string[] = [];
  const fail = (message: string): void => { if (errors.length < 40) errors.push(message); };
  let nodes = 0;
  const seen = new WeakSet<object>();
  function inspect(value: unknown, depth = 0): void {
    if (++nodes > 60_000) throw new Error("데이터 항목이 너무 많습니다.");
    if (depth > 12) throw new Error("데이터 중첩이 너무 깊습니다.");
    if (typeof value === "string") {
      if (value.length > 524_288) throw new Error("하나의 텍스트가 허용 크기를 초과합니다.");
      return;
    }
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
    if (typeof value !== "object" || (!Array.isArray(value) && !plain(value))) throw new Error("지원하지 않는 데이터 형식입니다.");
    if (seen.has(value)) throw new Error("순환하거나 중복 참조된 데이터는 가져올 수 없습니다.");
    seen.add(value);
    if (Object.getOwnPropertySymbols(value).length) throw new Error("JSON으로 보존할 수 없는 속성이 포함되어 있습니다.");
    if (Array.isArray(value)) {
      if (value.length > 60_000) throw new Error("데이터 항목이 너무 많습니다.");
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) throw new Error("비어 있는 배열 항목은 가져올 수 없습니다.");
      }
    }
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("안전하지 않은 속성이 포함되어 있습니다.");
      if (descriptor.get || descriptor.set) throw new Error("실행 가능한 속성은 가져올 수 없습니다.");
      if (Array.isArray(value) && key === "length") continue;
      inspect(descriptor.value, depth + 1);
    }
  }
  try {
    inspect(obj);
    if (new TextEncoder().encode(JSON.stringify(obj)).byteLength > BUSINESS_PLAN_MAX_IMPORT_BYTES) {
      throw new Error("가져오기 파일은 2MiB 이하여야 합니다.");
    }
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "데이터를 읽을 수 없습니다."] };
  }
  if (!plain(obj)) return { ok: false, errors: ["보드 데이터는 JSON 객체여야 합니다."] };
  if (!Number.isFinite(now.getTime())) return { ok: false, errors: ["검증 기준 시각이 올바르지 않습니다."] };
  if (obj.schemaVersion !== 1) fail("지원하는 데이터 버전은 schemaVersion 1입니다.");
  if (!plain(obj.project)) fail("프로젝트 정보가 없습니다.");
  for (const [key, cap] of Object.entries(CAPS)) {
    const value = obj[key];
    if (!Array.isArray(value)) fail(`${key} 목록이 없습니다.`);
    else if (value.length > cap) fail(`${key} 목록은 ${cap}개 이하여야 합니다.`);
  }
  if (errors.length) return { ok: false, errors };
  // 위에서 배열임을 검사했다. 각 행의 객체 검사는 아래에서 별도로 수행한다.
  const rows = (key: ListKey): unknown[] => obj[key] as unknown[];
  if (rows("approvals").length !== 4) fail("코드 수정·외부 제출·계정 설정·외부 배포의 승인 대기 항목 4개가 필요합니다.");
  const ids = new Set<string>();
  const checkText = (
    item: Record<string, unknown>, field: string, where: string,
    { required = false, limit = 40_000 }: { required?: boolean; limit?: number } = {},
  ): void => {
    const value = item[field];
    if (value === undefined && !required) return;
    if (typeof value !== "string" || value.length > limit || (required && !value.trim())) fail(`${where}: ${field} 텍스트 형식이 올바르지 않습니다.`);
  };
  const checkUrl = (item: Record<string, unknown>, field: string, where: string): void => {
    const value = item[field];
    if (value === undefined) return;
    if (typeof value !== "string" || (value.trim() && !safeUrl(value))) fail(`${where}: ${field} 링크는 인증 정보 없는 http(s) 주소여야 합니다.`);
  };
  const checkDate = (item: Record<string, unknown>, field: string, where: string): void => {
    const value = item[field];
    if (value === undefined) return;
    if (typeof value !== "string" || (value && !parseDate(value))) fail(`${where}: ${field} 날짜 형식이 올바르지 않습니다.`);
  };
  if (obj.savedAt !== undefined && !parseDate(obj.savedAt)) fail("저장 시각 savedAt은 유효한 날짜여야 합니다.");
  for (const key of Object.keys(CAPS) as ListKey[]) {
    if (key === "activity") continue;
    rows(key).forEach((item, index) => {
      const where = `${key} ${index + 1}`;
      if (!plain(item)) { fail(`${where}: 항목은 객체여야 합니다.`); return; }
      if (typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(item.id)) fail(`${where}: 유효한 고유 ID가 필요합니다.`);
      else if (ids.has(item.id)) fail(`${where}: 중복 ID가 있습니다.`);
      else ids.add(item.id);
      checkText(item, "title", where, { limit: 500 });
      checkDate(item, "updatedAt", where);
    });
  }
  const taskIds = new Set(rows("tasks").filter(plain).map((item) => item.id));
  const documentIds = new Set(rows("documents").filter(plain).map((item) => item.id));
  rows("tasks").forEach((item, index) => {
    if (!plain(item)) return;
    const where = `작업 ${index + 1}`;
    checkText(item, "title", where, { required: true, limit: 500 });
    if (!STATUS.some((status) => status === item.status)) fail(`${where}: 지원하지 않는 작업 상태입니다.`);
    for (const key of ["sourceUrl", "evidenceUrl"]) checkUrl(item, key, where);
    for (const key of ["owner", "assignedWork", "assignment", "nextAction", "notes", "note", "description", "category", "priority", "sourceTitle"]) checkText(item, key, where);
    for (const key of ["verifiedAt", "dueDate"]) checkDate(item, key, where);
    if (item.documentId !== undefined && item.documentId !== "" && !documentIds.has(item.documentId)) fail(`${where}: 연결된 문서를 찾을 수 없습니다.`);
  });
  rows("claims").forEach((item, index) => {
    if (!plain(item)) return;
    const where = `주장 ${index + 1}`;
    if (!taskIds.has(item.taskId)) fail(`${where}: 연결된 작업을 찾을 수 없습니다.`);
    if (!CLAIM_KINDS.some((kind) => kind === item.kind)) fail(`${where}: 지원하지 않는 주장 유형입니다.`);
    if (!FACT_STATUS.some((status) => status === item.factStatus)) fail(`${where}: 지원하지 않는 사실 확인 상태입니다.`);
    for (const field of CLAIM_STRINGS) {
      if (typeof item[field] !== "string") fail(`${where}: ${field}는 빈 값 또는 텍스트로 기록해야 합니다.`);
      else checkText(item, field, where);
    }
    checkText(item, "title", where, { required: true, limit: 500 });
    for (const field of ["sourceUrl", "crossSourceUrl"]) checkUrl(item, field, where);
    for (const field of ["verifiedAt", "publishedAt"]) checkDate(item, field, where);
    if (!parseDate(item.updatedAt)) fail(`${where}: 유효한 updatedAt 날짜가 필요합니다.`);
    if (typeof item.reviewDays !== "number" || !Number.isInteger(item.reviewDays) || item.reviewDays < 1 || item.reviewDays > 365) {
      fail(`${where}: 검토 주기는 1~365 사이의 정수여야 합니다.`);
    }
    if (item.factStatus === "근거 확인") {
      const result = validateClaim(item, now);
      if (!result.ok) fail(`${where}: 근거 확인 상태에 필요한 기록이 부족합니다. ${result.errors[0]}`);
    }
  });
  rows("documents").forEach((item, index) => {
    if (!plain(item)) return;
    const where = `문서 ${index + 1}`;
    checkText(item, "title", where, { required: true, limit: 500 });
    if (!parseDate(item.updatedAt)) fail(`${where}: 유효한 updatedAt 날짜가 필요합니다.`);
    for (const field of ["workingText", "previousText"]) {
      const value = item[field];
      if (typeof value !== "string" || value.length > 524_288) fail(`${where}: ${field} 원문이 없거나 너무 큽니다.`);
    }
    if (!Array.isArray(item.history) || item.history.length > 100 || item.history.some((entry) => !plain(entry))) {
      fail(`${where}: 변경 이력 형식이 올바르지 않거나 100개를 초과합니다.`);
    } else {
      item.history.forEach((entry: Record<string, unknown>, historyIndex: number) => {
        const historyWhere = `${where} 이력 ${historyIndex + 1}`;
        if (typeof entry.text !== "string" || entry.text.length > 524_288) fail(`${historyWhere}: text 원문이 없거나 너무 큽니다.`);
        if (typeof entry.label !== "string" || entry.label.length > 40_000) fail(`${historyWhere}: label은 텍스트여야 합니다.`);
        if (entry.type !== "작업용" && entry.type !== "제출 후보") fail(`${historyWhere}: 지원하지 않는 이력 유형입니다.`);
        if (!parseDate(entry.createdAt || entry.at)) fail(`${historyWhere}: 유효한 createdAt 또는 at 날짜가 필요합니다.`);
        for (const field of ["createdAt", "at", "sourceUpdatedAt"]) {
          if (entry[field] !== undefined && !parseDate(entry[field])) fail(`${historyWhere}: ${field} 날짜가 올바르지 않습니다.`);
        }
      });
    }
    if (item.submission !== null) {
      if (!plain(item.submission)) fail(`${where}: 제출용 버전 형식이 올바르지 않습니다.`);
      else {
        if (typeof item.submission.text !== "string") fail(`${where}: 제출용 원문은 텍스트여야 합니다.`);
        checkText(item.submission, "label", where, { required: true, limit: 500 });
        for (const field of ["createdAt", "sourceUpdatedAt"]) {
          if (!parseDate(item.submission[field])) fail(`${where}: 제출용 버전의 ${field} 날짜가 필요합니다.`);
        }
      }
    }
    for (const field of ["sourceUrl", "fileUrl"]) checkUrl(item, field, where);
    for (const field of ["workingLabel", "previousLabel", "fileName", "notes"]) checkText(item, field, where);
  });
  rows("mentor").forEach((item, index) => {
    if (!plain(item)) return;
    const where = `멘토 요청 ${index + 1}`;
    if (typeof item.reflected !== "boolean") fail(`${where}: 반영 여부는 true/false여야 합니다.`);
    for (const field of ["evidence", "location", "request", "round", "note"]) checkText(item, field, where);
    if (typeof item.documentId !== "string" || (item.documentId && !documentIds.has(item.documentId))) fail(`${where}: 연결된 문서를 찾을 수 없습니다.`);
    if (item.taskId !== undefined && item.taskId !== "" && !taskIds.has(item.taskId)) fail(`${where}: 연결된 작업을 찾을 수 없습니다.`);
    checkUrl(item, "sourceUrl", where);
  });
  rows("checks").forEach((item, index) => {
    if (!plain(item)) return;
    const where = `수동 점검 ${index + 1}`;
    if (typeof item.checked !== "boolean") fail(`${where}: 점검 여부는 true/false여야 합니다.`);
    checkText(item, "note", where);
    checkText(item, "group", where);
    checkUrl(item, "evidenceUrl", where);
  });
  rows("approvals").forEach((item, index) => {
    if (!plain(item)) return;
    if (item.status !== "승인 대기") fail(`승인 항목 ${index + 1}: 승인 대기 상태만 가져올 수 있습니다.`);
    if (!APPROVAL_TYPES.some((type) => type === item.type)) fail(`승인 항목 ${index + 1}: 지원하지 않는 승인 유형입니다.`);
    checkText(item, "scope", `승인 항목 ${index + 1}`);
    checkText(item, "note", `승인 항목 ${index + 1}`);
  });
  if (new Set(rows("approvals").filter(plain).map((item) => item.type)).size !== 4) fail("승인 대기 항목의 4개 실행 유형이 각각 하나씩 있어야 합니다.");
  if (plain(obj.project)) {
    checkText(obj.project, "title", "프로젝트", { required: true, limit: 500 });
    checkText(obj.project, "subtitle", "프로젝트");
    checkDate(obj.project, "createdAt", "프로젝트");
    if (!Array.isArray(obj.project.deadlines) || obj.project.deadlines.length > 20) fail("프로젝트 마감 일정 목록이 필요하며 20개 이하여야 합니다.");
    else {
      const deadlineIds = new Set<string>();
      obj.project.deadlines.forEach((item: unknown, index: number) => {
        const where = `마감 일정 ${index + 1}`;
        if (!plain(item)) { fail(`${where}: 일정 형식이 올바르지 않습니다.`); return; }
        if (typeof item.id !== "string" || !item.id || item.id.length > 120 || deadlineIds.has(item.id)) fail(`${where}: 고유 ID가 필요합니다.`);
        else deadlineIds.add(item.id);
        // 새 빈 템플릿은 일정 값을 추정하지 않는다. 기존 v1의 등록된 ISO 시각도 그대로 받는다.
        if (item.at !== "" || item.verified !== false) {
          if (!parseDate(item.at)?.exact) fail(`${where}: 시각과 시간대가 포함된 유효한 일정 날짜가 필요합니다.`);
        }
        checkText(item, "label", where, { required: true, limit: 500 });
        if (typeof item.verified !== "boolean") fail(`${where}: 확인 여부는 true/false여야 합니다.`);
        checkUrl(item, "sourceUrl", where);
        if (item.verified && !safeUrl(item.sourceUrl)) fail(`${where}: 확인된 일정에는 원문 출처 링크가 필요합니다.`);
        checkText(item, "note", where);
      });
    }
  }
  rows("activity").forEach((item, index) => {
    if (!plain(item)) { fail("활동 이력 항목은 객체여야 합니다."); return; }
    for (const field of ["id", "type", "text"]) {
      if (typeof item[field] !== "string") fail(`활동 이력 ${index + 1}: ${field}는 텍스트여야 합니다.`);
      else checkText(item, field, `활동 이력 ${index + 1}`);
    }
    if (!parseDate(item.at)) fail(`활동 이력 ${index + 1}: 유효한 at 날짜가 필요합니다.`);
  });
  return { ok: errors.length === 0, errors };
}

/**
 * 검사를 통과한 v1 데이터를 복제한다. 원문 공백·이력·안전한 확장 필드는 보존하고,
 * 초기 v1에서 선택 입력이던 텍스트만 빈 값으로 채워 두 소비자의 타입을 통일한다.
 */
export function parseBusinessPlanState(obj: unknown, now: Date = new Date()): BusinessPlanParseResult {
  const result = validateImport(obj, now);
  if (!result.ok) return { ok: false, errors: result.errors };
  const board = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  const rows = (key: ListKey): Record<string, unknown>[] => board[key] as Record<string, unknown>[];
  const fill = (item: Record<string, unknown>, fields: readonly string[]): void => {
    for (const field of fields) if (item[field] === undefined) item[field] = "";
  };
  const project = board.project as Record<string, unknown>;
  fill(project, ["subtitle", "createdAt"]);
  for (const deadline of project.deadlines as Record<string, unknown>[]) fill(deadline, ["sourceUrl", "note"]);
  for (const item of rows("tasks")) {
    item.assignment ??= item.assignedWork ?? "";
    item.notes ??= item.note ?? "";
    item.evidenceUrl ??= item.sourceUrl ?? "";
    fill(item, ["category", "priority", "description", "owner", "nextAction", "sourceTitle", "verifiedAt", "dueDate", "updatedAt"]);
  }
  for (const item of rows("documents")) fill(item, ["sourceUrl", "fileName", "workingLabel", "previousLabel", "notes"]);
  for (const item of rows("mentor")) fill(item, ["title", "request", "round", "sourceUrl", "taskId", "location", "evidence", "note"]);
  for (const item of rows("checks")) fill(item, ["title", "note", "evidenceUrl", "group"]);
  for (const item of rows("approvals")) fill(item, ["title", "scope", "note"]);
  // validateImport가 필수 타입·상태·참조를 확인했고 누락 가능한 텍스트는 위에서 정규화했다.
  return { ok: true, value: board as unknown as BusinessPlanState };
}
