import { sha256HexPortable } from "../sha256-portable";

import { createAdminWorkspace, createWorkspaceRecord, validateWorkspaceTransition, workspaceEqual } from "./domain";
import { MAX_WORKSPACE_BYTES, MAX_WORKSPACE_RECOVERY_BYTES, WORKSPACE_APPROVAL_TYPES, WORKSPACE_CLAIM_KINDS, WORKSPACE_MODULES, WORKSPACE_STATUSES } from "./types";
import { parseAdminWorkspace, workspaceDate, workspaceJson, workspaceNumeric, workspaceObject, WORKSPACE_EXECUTION_CATEGORIES } from "./validation";

import type { AdminWorkspace, WorkspaceApproval, WorkspaceCheckItem, WorkspaceDocument, WorkspaceDocumentContent, WorkspaceMentorItem, WorkspaceModule, WorkspaceRecord, WorkspaceResult, WorkspaceSnapshot } from "./types";

/** 가져온 과거 기록은 원문으로 보존하며 현재 사실 확인으로 승격하지 않는다. */
export function importAdminWorkspace(input: unknown, previous?: AdminWorkspace, now = new Date()): WorkspaceResult<AdminWorkspace> {
  if (!workspaceObject(input)) return failure("가져오기 자료는 JSON 객체여야 합니다.");
  let value: unknown = input;
  if (input.kind === "toonstudio-admin-recovery") {
    if (input.schemaVersion !== 1 || !(input.storedRaw === null || typeof input.storedRaw === "string") || !(input.legacyRaw === null || typeof input.legacyRaw === "string")) return failure("복구 파일 형식이 올바르지 않습니다.");
    try { if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_WORKSPACE_RECOVERY_BYTES) return failure("복구 파일은 64MiB 이하여야 합니다."); }
    catch { return failure("복구 파일을 읽을 수 없습니다."); }
    // 저장 원문 문자열은 실행하거나 재해석하지 않고 검증한 working 자료만 사용한다.
    value = input.working;
  }
  const json = workspaceJson(value); if (!json.ok) return json;
  if (!workspaceObject(json.value)) return failure("가져오기 자료는 객체여야 합니다.");
  const data = json.value;
  if (data.kind === "toonstudio-admin-workspace") {
    const parsed = parseAdminWorkspace(data, now); if (!parsed.ok) return parsed;
    const known = new Map(previous?.records.map(record => [record.id, record]));
    let invalidated = false;
    const records = parsed.value.records.map(record => {
      const before = known.get(record.id);
      const reset = !before || (record.factStatus === "확인" && before.factStatus !== "확인")
        || (record.status === "최종 확인" && before.status !== "최종 확인");
      const next = reset ? resetVerification(record) : record;
      if (!workspaceEqual(next, record)) invalidated = true;
      return next;
    });
    const imports = [...parsed.value.imports, ...(previous?.imports.filter(item => !parsed.value.imports.some(entry => entry.id === item.id)) ?? [])];
    if (invalidated) {
      const importId = `import-native-${sha256HexPortable(new TextEncoder().encode(JSON.stringify(data))).slice(0, 32)}`;
      if (!imports.some(item => item.id === importId)) imports.push({ id: importId, label: "관리자 작업실 이전 검증 기록", importedAt: now.toISOString(), format: "native-backup", archive: json.value });
    }
    const state: AdminWorkspace = { ...parsed.value, records, imports };
    const checked = parseAdminWorkspace(state, now); if (!checked.ok) return checked;
    const errors = validateWorkspaceTransition(previous ?? null, checked.value, now);
    return errors.length ? { ok: false, value: null, errors } : checked;
  }
  const unified = data.kind === "toonstudio-admin-integration";
  if ((unified && data.schemaVersion !== 1) || (!unified && data.schemaVersion !== 1)) return failure("지원하지 않는 이전 보드 버전입니다.");
  const business = unified ? data.business : data;
  const operations = unified ? data.operations : null;
  if (!workspaceObject(business) || business.schemaVersion !== 1 || (unified && (!workspaceObject(operations) || operations.schemaVersion !== 1))) return failure("사업계획 또는 운영 보드 구조가 올바르지 않습니다.");
  for (const field of ["tasks", "claims", "documents", "mentor", "checklist", "approvals"]) {
    if (!Array.isArray(business[field]) || business[field].length === 0) return failure(`${field}: 이전 보드의 필수 목록이 없습니다.`);
  }
  if (unified && (!workspaceObject(operations) || !Array.isArray(operations.records) || !operations.records.length)) return failure("운영 보드 원문 항목이 없습니다.");
  const importId = `import-${sha256HexPortable(new TextEncoder().encode(JSON.stringify(data))).slice(0, 32)}`;
  if (previous?.imports.some(item => item.id === importId)) return { ok: true, value: previous, errors: [] };
  const reader = new LegacyReader(importId, now);
  const records = [
    ...reader.list(business.tasks, "tasks").map(item => reader.record(item, "business", "task")),
    ...reader.list(business.claims, "claims").map(item => reader.record(item, "business", "claim")),
  ];
  if (workspaceObject(operations)) {
    for (const item of reader.list(operations.records, "operations.records")) {
      const module = WORKSPACE_MODULES.find(candidate => candidate.id !== "business" && candidate.id === item.module)?.id;
      if (!module) reader.errors.push("운영 모듈이 올바르지 않습니다.");
      else records.push(reader.record(item, module, "operation"));
    }
  }
  const imported: AdminWorkspace = {
    kind: "toonstudio-admin-workspace", schemaVersion: 1, records,
    documents: reader.list(business.documents, "documents").map(item => reader.document(item)),
    mentor: reader.list(business.mentor, "mentor").map(item => reader.mentor(item)),
    checklist: reader.list(business.checklist, "checklist").map(item => reader.check(item)),
    approvals: reader.list(business.approvals, "approvals").map(item => reader.approval(item)),
    imports: [{ id: importId, label: unified ? "Sites 관리자 통합 백업" : "Sites 사업계획 백업", importedAt: now.toISOString(), format: unified ? "legacy-unified" : "legacy-business", archive: json.value }],
    settings: { freshnessDays: 30, deadline: "", deadlineSource: "" },
  };
  if (workspaceObject(business.settings)) {
    if (typeof business.settings.freshnessDays === "number" && Number.isSafeInteger(business.settings.freshnessDays) && business.settings.freshnessDays >= 1 && business.settings.freshnessDays <= 365) imported.settings.freshnessDays = business.settings.freshnessDays;
    else reader.errors.push("기존 재확인 주기가 올바르지 않습니다.");
    imported.settings.deadline = reader.text(business.settings.deadline, "settings.deadline");
    imported.settings.deadlineSource = reader.text(business.settings.deadlineSource, "settings.deadlineSource");
  } else reader.errors.push("기존 설정이 필요합니다.");
  if (reader.errors.length) return { ok: false, value: null, errors: reader.errors.slice(0, 100) };
  const parsed = parseAdminWorkspace(imported, now); if (!parsed.ok) return parsed;
  if (!previous) return parsed;
  const initial = createAdminWorkspace();
  function merge<T extends { id: string }>(current: T[], incoming: T[], defaults: T[]): T[] {
    const merged = current.map(item => {
      const replacement = incoming.find(entry => entry.id === item.id);
      return replacement && defaults.some(entry => workspaceEqual(entry, item)) ? replacement : item;
    });
    return [...merged, ...incoming.filter(item => !current.some(entry => entry.id === item.id))];
  }
  const result: AdminWorkspace = {
    ...previous,
    records: merge(previous.records, parsed.value.records, initial.records), documents: merge(previous.documents, parsed.value.documents, initial.documents),
    mentor: merge(previous.mentor, parsed.value.mentor, initial.mentor), checklist: merge(previous.checklist, parsed.value.checklist, initial.checklist),
    approvals: merge(previous.approvals, parsed.value.approvals, initial.approvals), imports: [...previous.imports, ...parsed.value.imports],
    settings: workspaceEqual(previous.settings, initial.settings) ? parsed.value.settings : previous.settings,
  };
  const valid = parseAdminWorkspace(result, now); if (!valid.ok) return valid;
  const errors = validateWorkspaceTransition(previous, valid.value, now);
  return errors.length ? { ok: false, value: null, errors } : valid;
}
function failure(message: string): WorkspaceResult<AdminWorkspace> { return { ok: false, value: null, errors: [message] }; }
function resetVerification(record: WorkspaceRecord): WorkspaceRecord {
  return { ...record, factStatus: "미확인", verifiedAt: "", reviewer: "", verificationNote: "", status: record.approvalOnly ? "승인 대기" : record.status === "최종 확인" ? "검토 필요" : record.status };
}
class LegacyReader {
  readonly errors: string[] = [];
  constructor(readonly importId: string, readonly now: Date) {}
  text(value: unknown, path: string, optional = false): string {
    if (optional && value === undefined) return "";
    if (typeof value !== "string") { this.errors.push(`${path}: 문자열이 필요합니다.`); return ""; } return value;
  }
  list(value: unknown, path: string): Record<string, unknown>[] {
    if (!Array.isArray(value) || value.length > 2000) { this.errors.push(`${path}: 항목 배열이 필요합니다.`); return []; }
    return value.flatMap(item => { if (workspaceObject(item)) return [item]; this.errors.push(`${path}: 객체가 필요합니다.`); return []; });
  }
  id(value: unknown): string {
    const id = this.text(value, "id"); if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,149}$/u.test(id)) this.errors.push("기존 항목 ID가 올바르지 않습니다."); return id;
  }
  record(item: Record<string, unknown>, module: WorkspaceModule, recordType: WorkspaceRecord["recordType"]): WorkspaceRecord {
    const id = this.id(item.id); const result = createWorkspaceRecord(id, module, recordType);
    const get = (key: string, optional = true) => this.text(item[key], `${id}.${key}`, optional);
    result.title = get("title", false); result.category = get("category"); result.project = get("project") || "ToonStudio";
    const status = WORKSPACE_STATUSES.find(value => value === item.status);
    if (recordType !== "claim" && !status) this.errors.push(`${id}: 작업 상태가 올바르지 않습니다.`);
    result.status = status === "최종 확인" ? "검토 필요" : status ?? "초안";
    result.taskId = get("taskId"); result.owner = get("owner"); result.assignment = get("assignment"); result.nextAction = get("nextAction"); result.notes = get("notes");
    result.text = get("text");
    const kind = WORKSPACE_CLAIM_KINDS.find(value => value === item.kind);
    if (recordType === "claim" && !kind) this.errors.push(`${id}: 주장 유형이 올바르지 않습니다.`);
    result.kind = kind ?? "일반";
    if (item.value !== undefined && item.value !== null && item.value !== "") {
      if (workspaceNumeric(item.value)) result.value = item.value; else this.errors.push(`${id}: 미확인 값은 null이며 숫자는 유한한 값이어야 합니다.`);
    }
    for (const key of ["unit", "period", "scope", "quote", "secondSourceTitle", "secondSourceUrl", "formula", "assumptions"] as const) result[key] = get(key);
    result.sourceTitle = get("sourceTitle") || get("source"); result.sourceUrl = get("sourceUrl") || get("evidenceUrl"); result.sourceDate = get("sourceDate");
    for (const key of ["localSha", "remoteSha", "mainSha", "deployedSha"] as const) {
      const value = get(key); if (value && !/^[a-f0-9]{40}$/iu.test(value)) this.errors.push(`${id}.${key}: 전체 40자리 SHA가 필요합니다.`); result[key] = value;
    }
    if (item.freshnessDays !== undefined) {
      if (typeof item.freshnessDays === "number" && Number.isInteger(item.freshnessDays) && item.freshnessDays >= 1 && item.freshnessDays <= 365) result.freshnessDays = item.freshnessDays;
      else this.errors.push(`${id}: 재확인 주기가 올바르지 않습니다.`);
    }
    if (item.approvalOnly !== undefined && typeof item.approvalOnly !== "boolean") this.errors.push(`${id}: 승인 전용 여부가 올바르지 않습니다.`);
    result.approvalOnly = item.approvalOnly === true || WORKSPACE_EXECUTION_CATEGORIES.has(result.category);
    result.approvalReason = get("approvalReason") || (result.approvalOnly ? "외부 작업은 별도 승인 대기 기록으로만 관리합니다." : "");
    if (result.approvalOnly) result.status = "승인 대기";
    const raw = workspaceJson(item); if (!raw.ok) this.errors.push(...raw.errors);
    result.origin = { importId: this.importId, sourceId: get("sourceId") || "business", sourceRecordId: get("sourceRecordId") || id, raw: raw.ok ? raw.value : null };
    return result;
  }
  content(value: unknown, path: string): WorkspaceDocumentContent {
    if (!workspaceObject(value)) { this.errors.push(`${path}: 문서 내용이 필요합니다.`); return { label: "", url: "", content: "", updatedAt: "" }; }
    return { label: this.text(value.label, `${path}.label`), url: this.text(value.url, `${path}.url`), content: this.text(value.content, `${path}.content`), updatedAt: this.text(value.updatedAt, `${path}.updatedAt`) };
  }
  snapshot(value: unknown, documentId: string, index: number): WorkspaceSnapshot {
    const content = this.content(value, documentId); const source = workspaceObject(value) ? value : {};
    const frozen = typeof source.frozenAt === "string" && workspaceDate(source.frozenAt) !== null ? source.frozenAt : content.updatedAt || this.now.toISOString();
    // 이전 고정 근거는 archive에 보존한다. 새 계약의 고정 근거로 추측 변환하지 않는다.
    return { ...content, id: `${documentId}-imported-${index}`, frozenAt: frozen, status: "승인 대기", basis: null };
  }
  document(item: Record<string, unknown>): WorkspaceDocument {
    const id = this.id(item.id); const history = this.list(item.history, `${id}.history`).map((entry, index) => this.snapshot(entry, id, index));
    if (item.purpose !== undefined && item.purpose !== "submission" && item.purpose !== "reference") this.errors.push(`${id}: 문서 용도가 올바르지 않습니다.`);
    return { id, title: this.text(item.title, `${id}.title`), purpose: item.purpose === "reference" ? "reference" : "submission", working: this.content(item.working, `${id}.working`), submission: item.submission === null ? null : this.snapshot(item.submission, id, history.length), history };
  }
  mentor(item: Record<string, unknown>): WorkspaceMentorItem {
    const id = this.id(item.id); const text = (key: string) => this.text(item[key], `${id}.${key}`);
    if (!["미반영", "반영 중", "반영 완료", "확인 필요"].includes(text("status"))) this.errors.push(`${id}: 멘토 반영 상태가 올바르지 않습니다.`);
    return { id, text: text("text"), taskId: text("taskId"), status: item.status === "반영 중" ? "반영 중" : "미반영", source: text("source"), location: text("location"), evidence: text("evidence"), notes: text("notes") };
  }
  check(item: Record<string, unknown>): WorkspaceCheckItem {
    const id = this.id(item.id); const text = (key: string) => this.text(item[key], `${id}.${key}`);
    if (typeof item.done !== "boolean") this.errors.push(`${id}: 완료 여부가 올바르지 않습니다.`);
    return { id, label: text("label"), done: false, source: text("source"), notes: text("notes"), verifiedAt: "" };
  }
  approval(item: Record<string, unknown>): WorkspaceApproval {
    const id = this.id(item.id); const type = WORKSPACE_APPROVAL_TYPES.find(value => value === item.type);
    if (!type || item.status !== "승인 대기") this.errors.push(`${id}: 외부 작업은 승인 대기로만 가져올 수 있습니다.`);
    return { id, type: type ?? "코드 수정", title: this.text(item.title, `${id}.title`), description: this.text(item.description, `${id}.description`), notes: this.text(item.notes, `${id}.notes`), status: "승인 대기" };
  }
}

/** 파일 크기를 먼저 검사해 브라우저에서 과도한 JSON 파싱을 막는다. */
export function workspaceImportSizeAllowed(bytes: number, recovery = false): boolean {
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= (recovery ? MAX_WORKSPACE_RECOVERY_BYTES : MAX_WORKSPACE_BYTES);
}
