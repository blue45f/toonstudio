import {
  MAX_WORKSPACE_BYTES, WORKSPACE_APPROVAL_TYPES, WORKSPACE_CLAIM_KINDS, WORKSPACE_FACT_STATUSES,
  WORKSPACE_MODULES, WORKSPACE_STATUSES,
} from "./types";

import type {
  AdminWorkspace, AdminWorkspaceSave, AdminWorkspaceSaveAck, AdminWorkspaceView, WorkspaceApproval, WorkspaceBasis,
  WorkspaceCheckItem, WorkspaceDocument, WorkspaceDocumentContent, WorkspaceImport, WorkspaceJson,
  WorkspaceMentorItem, WorkspaceOrigin, WorkspaceRecord, WorkspaceResult, WorkspaceSettings, WorkspaceSnapshot,
} from "./types";

export const WORKSPACE_EXECUTION_CATEGORIES = new Set([
  "코드 수정", "원격 푸시", "푸시", "PR 병합", "main 병합", "병합", "외부 제출", "외부 배포",
  "운영 배포", "계정 설정 변경", "계정·인프라 변경", "운영 데이터 변경", "CI 실행", "런타임 검증 실행",
]);
export function workspaceObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function workspaceSafeUrl(value: string): boolean {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
export function workspaceDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/u.test(value)) return null;
  const time = value.match(/T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?/u);
  if (time && (Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] ?? 0) > 59)) return null;
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  // 날짜만 있는 검증일은 서울 날짜의 시작으로 해석한다.
  const timestamp = value.length === 10 ? day - 9 * 3_600_000 : Date.parse(/[Z+-]\d{0,2}(?::\d{2})?$/u.test(value.slice(10)) ? value : `${value}+09:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}
export function workspaceDataEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const entries = Object.entries(left); const other = Object.entries(right);
  return entries.length === other.length && entries.every(([key, value]) => other.some(([otherKey, otherValue]) => key === otherKey && workspaceDataEqual(value, otherValue)));
}
export function workspaceJson(value: unknown, maximumBytes = MAX_WORKSPACE_BYTES): WorkspaceResult<WorkspaceJson> {
  let nodes = 0;
  const ancestors = new Set<object>();
  function read(entry: unknown, depth: number): WorkspaceJson {
    if (++nodes > 250_000 || depth > 40) throw new Error("자료의 항목 수나 중첩이 허용 범위를 넘었습니다.");
    if (entry === null || typeof entry === "boolean") return entry;
    if (typeof entry === "string") { if (entry.length > 2_000_000) throw new Error("텍스트가 너무 깁니다."); return entry; }
    if (typeof entry === "number" && Number.isFinite(entry)) return entry;
    if (typeof entry !== "object" || entry === null || (!Array.isArray(entry) && !workspaceObject(entry))) throw new Error("일반 JSON 값만 사용할 수 있습니다.");
    if (ancestors.has(entry)) throw new Error("순환 참조는 가져올 수 없습니다.");
    ancestors.add(entry);
    let result: WorkspaceJson;
    if (Array.isArray(entry)) {
      if (entry.length > 5000) throw new Error("배열 항목이 너무 많습니다.");
      result = entry.map(item => read(item, depth + 1));
    } else {
      const output: { [key: string]: WorkspaceJson } = {};
      for (const [key, item] of Object.entries(entry)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("허용되지 않는 객체 속성이 있습니다.");
        output[key] = read(item, depth + 1);
      }
      result = output;
    }
    ancestors.delete(entry);
    return result;
  }
  try {
    const result = read(value, 0);
    if (new TextEncoder().encode(JSON.stringify(result, null, 2)).byteLength > maximumBytes) throw new Error("작업 자료는 12MiB 이하여야 합니다.");
    return { ok: true, value: result, errors: [] };
  } catch (error) { return { ok: false, value: null, errors: [error instanceof Error ? error.message : "자료를 읽을 수 없습니다."] }; }
}
export function workspaceEvidenceIssues(record: WorkspaceRecord, now = new Date()): string[] {
  const errors: string[] = [];
  if (!record.text.trim() && record.recordType === "claim") errors.push("검증할 주장 원문이 필요합니다.");
  if (!record.sourceTitle.trim()) errors.push("원문 출처·위치가 필요합니다.");
  if (!workspaceSafeUrl(record.sourceUrl)) errors.push("원문 근거 링크가 필요합니다.");
  if (!record.quote.trim() && record.recordType === "claim") errors.push("원문 인용 또는 쪽수·섹션이 필요합니다.");
  if (!record.sourceDate && record.recordType === "claim") errors.push("원문 기준일이 필요합니다.");
  const verified = workspaceDate(record.verifiedAt);
  if (verified === null || verified > now.getTime()) errors.push("현재 또는 과거의 유효한 검증일이 필요합니다.");
  const sourceDate = workspaceDate(record.sourceDate);
  if (sourceDate !== null && verified !== null && sourceDate > verified) errors.push("검증일은 원문 기준일보다 빠를 수 없습니다.");
  if (!record.reviewer.trim()) errors.push("검증자를 기록하세요.");
  if (!record.verificationNote.trim()) errors.push("원문 대조 결과를 기록하세요.");
  if (["숫자", "시장 규모", "매출 전망"].includes(record.kind)) {
    if (record.value === null || record.value === "" || !workspaceNumeric(record.value)) errors.push("확인된 수치가 필요합니다. 미확인을 0으로 대체하지 마세요.");
    if (!record.unit.trim() || !record.period.trim() || !record.scope.trim()) errors.push("단위·기간·조사 범위를 기록하세요.");
  }
  if (["시장 규모", "매출 전망", "비교"].includes(record.kind)) {
    if (!workspaceSafeUrl(record.secondSourceUrl) || !record.secondSourceTitle.trim()) errors.push("교차검증할 두 번째 원출처가 필요합니다.");
    if (workspaceNormalizedUrl(record.sourceUrl) === workspaceNormalizedUrl(record.secondSourceUrl)
      || normalizedTitle(record.sourceTitle) === normalizedTitle(record.secondSourceTitle)) errors.push("같은 원출처를 독립 출처로 사용할 수 없습니다.");
    const note = record.verificationNote.match(/독립성\s*[:：]\s*([^\n]+)/u)?.[1]?.trim() ?? "";
    if (note.replace(/\s/gu, "").length < 8 || /미확인|확인\s*필요|확인하지|미검증|불명확/u.test(note)) errors.push("검증 메모에 독립성: 발행기관·조사자료 대조 근거를 기록하세요.");
    if (!record.scope.trim()) errors.push("제품·버전·환경 또는 조사 범위를 기록하세요.");
  }
  if (record.kind === "매출 전망" && (!record.formula.trim() || !record.assumptions.trim())) errors.push("매출 전망의 산식과 입력 가정을 기록하세요.");
  return [...new Set(errors)];
}
export function workspaceNumeric(value: unknown): value is number | string {
  return typeof value === "number" ? Number.isFinite(value)
    : typeof value === "string" && /^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/u.test(value.trim());
}
function normalizedTitle(value: string): string { return value.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, ""); }
function workspaceNormalizedUrl(value: string): string {
  try {
    const url = new URL(value); url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/iu.test(key)) url.searchParams.delete(key);
    url.searchParams.sort(); return url.toString().replace(/\/$/u, "");
  } catch { return value; }
}

class Reader {
  readonly errors: string[] = [];
  constructor(readonly now: Date) {}
  error(path: string, message: string): void { if (this.errors.length < 100) this.errors.push(`${path}: ${message}`); }
  object(value: unknown, path: string): Record<string, unknown> { if (workspaceObject(value)) return value; this.error(path, "일반 JSON 객체가 필요합니다."); return {}; }
  text(value: unknown, path: string, max = 30_000, required = false): string {
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) { this.error(path, `유효한 ${max}자 이하 문자열이 필요합니다.`); return ""; } return value;
  }
  id(value: unknown, path: string): string { const result = this.text(value, path, 150, true); if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(result)) this.error(path, "ID 형식이 올바르지 않습니다."); return result; }
  enum<T extends string>(value: unknown, values: readonly T[], path: string): T {
    const result = values.find(item => item === value); if (result !== undefined) return result;
    this.error(path, "지원하지 않는 값입니다."); return values[0];
  }
  boolean(value: unknown, path: string): boolean { if (typeof value === "boolean") return value; this.error(path, "참/거짓 값이 필요합니다."); return false; }
  integer(value: unknown, path: string, min: number, max: number): number {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max) return value;
    this.error(path, `${min}~${max} 정수가 필요합니다.`); return min;
  }
  date(value: unknown, path: string, allowFuture = false): string {
    const result = this.text(value, path, 100);
    if (result) { const parsed = workspaceDate(result); if (parsed === null || (!allowFuture && parsed > this.now.getTime() + 5000)) this.error(path, "유효한 날짜가 필요하며 검증일은 미래일 수 없습니다."); }
    return result;
  }
  url(value: unknown, path: string): string { const result = this.text(value, path, 4000); if (result && !workspaceSafeUrl(result)) this.error(path, "사용자 정보가 없는 HTTP(S) 주소가 필요합니다."); return result; }
  array<T>(value: unknown, path: string, max: number, parse: (entry: unknown, path: string) => T): T[] {
    if (!Array.isArray(value) || value.length > max) { this.error(path, `최대 ${max}개 배열이 필요합니다.`); return []; }
    return value.map((entry, index) => parse(entry, `${path}[${index}]`));
  }
  json(value: unknown, path: string): WorkspaceJson {
    const result = workspaceJson(value); if (result.ok) return result.value; this.error(path, result.errors.join(" ")); return null;
  }
  origin(value: unknown, path: string): WorkspaceOrigin | null {
    if (value === null) return null;
    const item = this.object(value, path);
    return { importId: this.id(item.importId, `${path}.importId`), sourceId: this.text(item.sourceId, `${path}.sourceId`), sourceRecordId: this.text(item.sourceRecordId, `${path}.sourceRecordId`), raw: this.json(item.raw, `${path}.raw`) };
  }
  record = (value: unknown, path: string): WorkspaceRecord => {
    const item = this.object(value, path);
    const text = (key: string) => this.text(item[key], `${path}.${key}`);
    const sha = (key: string) => { const result = text(key); if (result && !/^[a-f0-9]{40}$/iu.test(result)) this.error(`${path}.${key}`, "전체 40자리 SHA가 필요합니다."); return result; };
    const numeric = item.value === null ? null : workspaceNumeric(item.value) ? item.value : null;
    if (item.value !== null && numeric === null) this.error(`${path}.value`, "수치가 미확인이면 null이어야 합니다.");
    const result: WorkspaceRecord = {
      id: this.id(item.id, `${path}.id`), module: this.enum(item.module, WORKSPACE_MODULES.map(module => module.id), `${path}.module`),
      recordType: this.enum(item.recordType, ["task", "claim", "operation"], `${path}.recordType`), taskId: text("taskId"), project: text("project"),
      title: this.text(item.title, `${path}.title`, 30_000, true), category: text("category"), status: this.enum(item.status, WORKSPACE_STATUSES, `${path}.status`),
      factStatus: this.enum(item.factStatus, WORKSPACE_FACT_STATUSES, `${path}.factStatus`), owner: text("owner"), assignment: text("assignment"), nextAction: text("nextAction"), notes: text("notes"),
      text: text("text"), kind: this.enum(item.kind, WORKSPACE_CLAIM_KINDS, `${path}.kind`), value: numeric, unit: text("unit"), period: text("period"), scope: text("scope"),
      sourceTitle: text("sourceTitle"), sourceUrl: this.url(item.sourceUrl, `${path}.sourceUrl`), sourceDate: this.date(item.sourceDate, `${path}.sourceDate`), quote: text("quote"),
      secondSourceTitle: text("secondSourceTitle"), secondSourceUrl: this.url(item.secondSourceUrl, `${path}.secondSourceUrl`), verifiedAt: this.date(item.verifiedAt, `${path}.verifiedAt`),
      reviewer: text("reviewer"), verificationNote: text("verificationNote"), formula: text("formula"), assumptions: text("assumptions"),
      freshnessDays: this.integer(item.freshnessDays, `${path}.freshnessDays`, 1, 365), localSha: sha("localSha"), remoteSha: sha("remoteSha"), mainSha: sha("mainSha"), deployedSha: sha("deployedSha"),
      approvalOnly: this.boolean(item.approvalOnly, `${path}.approvalOnly`), approvalReason: text("approvalReason"), origin: this.origin(item.origin, `${path}.origin`),
    };
    if ((result.approvalOnly || WORKSPACE_EXECUTION_CATEGORIES.has(result.category)) && result.status !== "승인 대기") this.error(path, "외부 실행 항목은 승인 대기로만 관리합니다.");
    if (WORKSPACE_EXECUTION_CATEGORIES.has(result.category) && !result.approvalOnly) this.error(path, "외부 실행 범주는 승인 전용이어야 합니다.");
    if (result.factStatus === "제외" && !result.notes.trim()) this.error(path, "제외 사유를 메모에 기록하세요.");
    if (result.factStatus === "확인") for (const issue of workspaceEvidenceIssues(result, this.now)) this.error(path, issue);
    if (result.status === "최종 확인" && result.factStatus !== "확인") this.error(path, "최종 확인에는 사실 확인이 필요합니다.");
    return result;
  };
  mentor = (value: unknown, path: string): WorkspaceMentorItem => {
    const item = this.object(value, path); const text = (key: string) => this.text(item[key], `${path}.${key}`);
    return { id: this.id(item.id, `${path}.id`), text: text("text"), taskId: text("taskId"), status: this.enum(item.status, ["미반영", "반영 중", "반영 완료"], `${path}.status`), source: text("source"), location: text("location"), evidence: text("evidence"), notes: text("notes") };
  };
  check = (value: unknown, path: string): WorkspaceCheckItem => {
    const item = this.object(value, path); const text = (key: string) => this.text(item[key], `${path}.${key}`);
    return { id: this.id(item.id, `${path}.id`), label: text("label"), done: this.boolean(item.done, `${path}.done`), source: text("source"), notes: text("notes"), verifiedAt: this.date(item.verifiedAt, `${path}.verifiedAt`) };
  };
  settings(value: unknown, path: string): WorkspaceSettings {
    const item = this.object(value, path);
    return { freshnessDays: this.integer(item.freshnessDays, `${path}.freshnessDays`, 1, 365), deadline: this.date(item.deadline, `${path}.deadline`, true), deadlineSource: this.text(item.deadlineSource, `${path}.deadlineSource`) };
  }
  content(value: unknown, path: string): WorkspaceDocumentContent {
    const item = this.object(value, path);
    return { label: this.text(item.label, `${path}.label`), url: this.url(item.url, `${path}.url`), content: this.text(item.content, `${path}.content`, 250_000), updatedAt: this.date(item.updatedAt, `${path}.updatedAt`) };
  }
  basis(value: unknown, path: string): WorkspaceBasis | null {
    if (value === null) return null; const item = this.object(value, path);
    const document = this.object(item.document, `${path}.document`);
    return { document: { id: this.id(document.id, `${path}.document.id`), title: this.text(document.title, `${path}.document.title`), purpose: this.enum(document.purpose, ["submission", "reference"], `${path}.document.purpose`) }, records: this.array(item.records, `${path}.records`, 2000, this.record), mentor: this.array(item.mentor, `${path}.mentor`, 500, this.mentor), checklist: this.array(item.checklist, `${path}.checklist`, 500, this.check), settings: this.settings(item.settings, `${path}.settings`) };
  }
  snapshot = (value: unknown, path: string): WorkspaceSnapshot => {
    const item = this.object(value, path); if (item.status !== "승인 대기") this.error(path, "고정본은 승인 대기 상태여야 합니다.");
    if (!item.frozenAt) this.error(path, "고정 시각이 필요합니다.");
    return { ...this.content(item, path), id: this.id(item.id, `${path}.id`), status: "승인 대기", frozenAt: this.date(item.frozenAt, `${path}.frozenAt`), basis: this.basis(item.basis, `${path}.basis`) };
  };
  document = (value: unknown, path: string): WorkspaceDocument => {
    const item = this.object(value, path);
    return { id: this.id(item.id, `${path}.id`), title: this.text(item.title, `${path}.title`, 30_000, true), purpose: this.enum(item.purpose, ["submission", "reference"], `${path}.purpose`), working: this.content(item.working, `${path}.working`), submission: item.submission === null ? null : this.snapshot(item.submission, `${path}.submission`), history: this.array(item.history, `${path}.history`, 100, this.snapshot) };
  };
  approval = (value: unknown, path: string): WorkspaceApproval => {
    const item = this.object(value, path); if (item.status !== "승인 대기") this.error(path, "외부 작업은 승인 대기로만 관리합니다.");
    return { id: this.id(item.id, `${path}.id`), type: this.enum(item.type, WORKSPACE_APPROVAL_TYPES, `${path}.type`), title: this.text(item.title, `${path}.title`), description: this.text(item.description, `${path}.description`), status: "승인 대기", notes: this.text(item.notes, `${path}.notes`) };
  };
  imported = (value: unknown, path: string): WorkspaceImport => {
    const item = this.object(value, path);
    if (!item.importedAt) this.error(path, "가져오기 시각이 필요합니다.");
    return { id: this.id(item.id, `${path}.id`), label: this.text(item.label, `${path}.label`), importedAt: this.date(item.importedAt, `${path}.importedAt`), format: this.enum(item.format, ["legacy-unified", "legacy-business", "native-backup"], `${path}.format`), archive: this.json(item.archive, `${path}.archive`) };
  };
}
export function parseAdminWorkspace(value: unknown, now = new Date()): WorkspaceResult<AdminWorkspace> {
  const json = workspaceJson(value); if (!json.ok) return json;
  const reader = new Reader(now); const item = reader.object(value, "workspace");
  if (item.kind !== "toonstudio-admin-workspace" || item.schemaVersion !== 1) reader.error("workspace", "지원하지 않는 작업실 형식입니다.");
  const result: AdminWorkspace = {
    kind: "toonstudio-admin-workspace", schemaVersion: 1,
    records: reader.array(item.records, "records", 2000, reader.record), documents: reader.array(item.documents, "documents", 100, reader.document),
    mentor: reader.array(item.mentor, "mentor", 500, reader.mentor), checklist: reader.array(item.checklist, "checklist", 500, reader.check),
    approvals: reader.array(item.approvals, "approvals", 500, reader.approval), imports: reader.array(item.imports, "imports", 20, reader.imported), settings: reader.settings(item.settings, "settings"),
  };
  const ids = new Set<string>();
  for (const collection of [result.records, result.documents, result.mentor, result.checklist, result.approvals, result.imports]) {
    for (const entry of collection) { if (ids.has(entry.id)) reader.error(entry.id, "중복 ID입니다."); ids.add(entry.id); }
  }
  const taskIds = new Set(result.records.filter(record => record.recordType === "task").map(record => record.id));
  const importIds = new Set(result.imports.map(entry => entry.id));
  const archiveIndexes = new Map<string, Map<string, { raw: Record<string, unknown>; module: string; recordType: string }>>();
  for (const imported of result.imports) {
    const index = new Map<string, { raw: Record<string, unknown>; module: string; recordType: string }>();
    const archive = workspaceObject(imported.archive) ? imported.archive : {};
    const business = imported.format === "legacy-unified" && workspaceObject(archive.business) ? archive.business : archive;
    if (archive.schemaVersion !== 1 || (imported.format === "legacy-unified" && archive.kind !== "toonstudio-admin-integration") || (imported.format === "native-backup" && archive.kind !== "toonstudio-admin-workspace")) reader.error(imported.id, "원문 보드 버전이 올바르지 않습니다.");
    const add = (entries: unknown, module: string, recordType: string) => {
      if (!Array.isArray(entries)) { reader.error(imported.id, "원문 작업 목록이 없습니다."); return; }
      for (const entry of entries) {
        if (!workspaceObject(entry) || typeof entry.id !== "string" || !entry.id) { reader.error(imported.id, "원문 항목 ID가 없습니다."); continue; }
        if (index.has(entry.id)) reader.error(imported.id, "원문 항목 ID가 중복되었습니다.");
        index.set(entry.id, { raw: entry, module: module || (typeof entry.module === "string" ? entry.module : ""), recordType: recordType || (typeof entry.recordType === "string" ? entry.recordType : "") });
      }
    };
    if (imported.format === "native-backup") add(archive.records, "", "");
    else { add(business.tasks, "business", "task"); add(business.claims, "business", "claim"); }
    if (imported.format === "legacy-unified") add(workspaceObject(archive.operations) ? archive.operations.records : null, "", "operation");
    archiveIndexes.set(imported.id, index);
  }
  const linkedOrigins = new Set<string>();
  for (const record of result.records) {
    if (record.taskId && !taskIds.has(record.taskId)) reader.error(record.id, "연결 작업이 없습니다.");
    if (record.origin && !importIds.has(record.origin.importId)) reader.error(record.id, "원문 가져오기 기록이 없습니다.");
    if (record.origin) {
      const rawId = workspaceObject(record.origin.raw) ? record.origin.raw.id : undefined;
      const archived = typeof rawId === "string" ? archiveIndexes.get(record.origin.importId)?.get(rawId) : undefined;
      const link = `${record.origin.importId}:${String(rawId)}`;
      if (linkedOrigins.has(link)) reader.error(record.id, "같은 원문 항목 연결이 중복되었습니다.");
      linkedOrigins.add(link);
      if (!archived || !workspaceDataEqual(archived.raw, record.origin.raw)) reader.error(record.id, "연결한 원문이 가져오기 자료와 일치하지 않습니다.");
      else if (archived.module !== record.module || archived.recordType !== record.recordType
        || record.origin.sourceId !== (typeof archived.raw.sourceId === "string" && archived.raw.sourceId ? archived.raw.sourceId : "business")
        || record.origin.sourceRecordId !== (typeof archived.raw.sourceRecordId === "string" && archived.raw.sourceRecordId ? archived.raw.sourceRecordId : rawId)) reader.error(record.id, "원문 출처·항목 연결이 올바르지 않습니다.");
    }
  }
  for (const mentor of result.mentor) if (mentor.taskId && !taskIds.has(mentor.taskId)) reader.error(mentor.id, "연결 작업이 없습니다.");
  for (const document of result.documents) {
    const snapshotIds = new Set<string>();
    for (const snapshot of [...document.history, ...(document.submission ? [document.submission] : [])]) {
      if (snapshotIds.has(snapshot.id)) reader.error(document.id, "고정본 ID가 중복되었습니다."); snapshotIds.add(snapshot.id);
    }
  }
  return reader.errors.length ? { ok: false, value: null, errors: reader.errors } : { ok: true, value: result, errors: [] };
}
export function parseAdminWorkspaceSave(value: unknown, now = new Date()): WorkspaceResult<AdminWorkspaceSave> {
  if (!workspaceObject(value)) return { ok: false, value: null, errors: ["저장 요청 객체가 필요합니다."] };
  if (Object.keys(value).some(key => !["expectedRevision", "mutationId", "state"].includes(key))) return { ok: false, value: null, errors: ["저장 요청에 허용되지 않은 필드가 있습니다."] };
  const parsed = parseAdminWorkspace(value.state, now); if (!parsed.ok) return parsed;
  if (typeof value.expectedRevision !== "number" || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0
    || typeof value.mutationId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(value.mutationId)) return { ok: false, value: null, errors: ["저장 revision과 UUID mutationId가 필요합니다."] };
  return { ok: true, value: { expectedRevision: value.expectedRevision, mutationId: value.mutationId, state: parsed.value }, errors: [] };
}
export function parseAdminWorkspaceView(value: unknown): WorkspaceResult<AdminWorkspaceView> {
  if (!workspaceObject(value) || value.boardId !== "toonstudio" || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0
    || typeof value.canEdit !== "boolean" || !(value.updatedAt === null || (typeof value.updatedAt === "string" && workspaceDate(value.updatedAt) !== null))) return { ok: false, value: null, errors: ["저장 응답 형식을 확인할 수 없습니다."] };
  const parsed = value.state === null ? null : parseAdminWorkspace(value.state); if (parsed && !parsed.ok) return parsed;
  return { ok: true, value: { boardId: "toonstudio", revision: value.revision, state: parsed?.value ?? null, updatedAt: value.updatedAt, canEdit: value.canEdit }, errors: [] };
}

export function parseAdminWorkspaceSaveAck(value: unknown): WorkspaceResult<AdminWorkspaceSaveAck> {
  if (!workspaceObject(value) || value.boardId !== "toonstudio" || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.updatedAt !== "string" || workspaceDate(value.updatedAt) === null || typeof value.replayed !== "boolean") return { ok: false, value: null, errors: ["저장 응답을 확인할 수 없습니다."] };
  return { ok: true, value: { boardId: "toonstudio", revision: value.revision, updatedAt: value.updatedAt, replayed: value.replayed }, errors: [] };
}
