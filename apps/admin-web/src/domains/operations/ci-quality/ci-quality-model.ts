export const statusLabels = {
  done: "완료", progress: "진행 중", failed: "실패", unknown: "미확인", approval: "승인 대기",
} as const;

export type QualityStatus = keyof typeof statusLabels;
export type QualityGroup = "tests" | "quality" | "gates";
export type QualityJsonValue = null | boolean | number | string | QualityJsonValue[] | { [key: string]: QualityJsonValue };
export type QualityJsonObject = { [key: string]: QualityJsonValue };
export interface QualityStats {
  passed: number | null; failed: number | null; skipped: number | null; total: number | null; duration: number | null;
}
export interface QualityFailure {
  change: string; baseline: string; diff: string; cause: string; action: string;
  classification: "unknown" | "regression" | "transient";
}
export interface QualityCheck {
  id: string; name: string; subtitle: string; group: QualityGroup; icon: string; command: string; source: string;
  status: QualityStatus; sha: string; executedAt: string; scope: string; logUrl: string; summary: string;
  stats: QualityStats; failure: QualityFailure; ciJson: QualityJsonObject | null; updatedAt: string;
}
export interface QualityQaResult {
  id: string; title: string; status: QualityStatus; sha: string; executedAt: string; url: string; summary: string;
}
export interface QualityApproval {
  id: "code" | "deploy" | "account"; title: string; icon: string; category: string; description: string;
  note: string; status: "approval"; updatedAt: string;
}
export interface QualityHistoryEntry { id: string; at: string; text: string }
export interface QualityBoard {
  schemaVersion: 1; project: "ToonStudio"; mode: "manual"; snapshotAt: string;
  commit: { sha: string; message: string; committedAt: string; observedAt: string; source: "remote-main" | "manual"; url: string };
  ttlHours: number; checks: QualityCheck[];
  qa: { provider: "Testifly"; integration: "reference-only"; results: QualityQaResult[] };
  approvals: QualityApproval[]; history: QualityHistoryEntry[];
}
export interface QualityFreshness {
  kind: "missing" | "stale" | "invalid" | "fresh"; label: string; reason: string;
}
export const CI_QUALITY_REQUIRED_IDS = ["vitest", "playwright", "types", "lint", "csp", "licenses", "bundle", "harness", "architecture", "toolchain", "ci-core", "ci-verify"] as const;
export const QUALITY_JSON_MAX_LENGTH = 2_000_000;
export const QUALITY_HISTORY_LIMIT = 200;
const FUTURE_TOLERANCE = 300_000;
const SHA_PATTERN = /^[a-f0-9]{40}$/iu;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const STAT_KEYS = ["passed", "failed", "skipped", "total", "duration"] as const;
const APPROVAL_IDS = ["code", "deploy", "account"] as const;

export { createQualityBoard } from "./ci-quality-seed";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: 객체가 필요합니다.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 12_000, optional = false): string {
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || value.length > max) throw new Error(`${label}: 문자열 형식이나 길이를 확인하세요.`);
  return value;
}
function identifier(value: unknown, label: string): string {
  const id = text(value, label, 120);
  if (!id.trim()) throw new Error(`${label}: 비어 있는 ID는 허용하지 않습니다.`);
  return id;
}
function sha(value: unknown, label: string, optional = false): string {
  const result = text(value, label, 40, optional);
  if ((result || !optional) && !SHA_PATTERN.test(result)) throw new Error(`${label}: 40자리 커밋 SHA가 필요합니다.`);
  return result;
}
function validTimestamp(value: string): boolean {
  if (!DATE_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]
    && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60;
}
function date(value: unknown, label: string, now: number, optional = false): string {
  const result = text(value, label, 64, optional);
  if (optional && !result) return "";
  if (!validTimestamp(result)) throw new Error(`${label}: 시간대가 있는 올바른 ISO 시각이 필요합니다.`);
  if (Date.parse(result) > now + FUTURE_TOLERANCE) throw new Error(`${label}: 미래 시각은 허용하지 않습니다.`);
  return result;
}
export function isQualityHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch { return false; }
}
function url(value: unknown, label: string): string {
  const result = text(value, label, 4096, true);
  if (result && !isQualityHttpUrl(result)) throw new Error(`${label}: 인증 정보가 없는 http(s) URL이 필요합니다.`);
  return result;
}
function status(value: unknown, label: string): QualityStatus {
  if (typeof value !== "string" || !Object.hasOwn(statusLabels, value)) throw new Error(`${label}: 허용된 진행 상태가 아닙니다.`);
  return value as QualityStatus;
}
function list(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}: 최대 ${max}개 배열이 필요합니다.`);
  return value;
}
function uniqueIds<T extends { id: string }>(items: T[], label: string): T[] {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error(`${label}: 중복 ID는 허용하지 않습니다.`);
  return items;
}
function stats(value: unknown): QualityStats {
  const input = object(value, "테스트 통계");
  const result: QualityStats = { passed: null, failed: null, skipped: null, total: null, duration: null };
  for (const key of STAT_KEYS) {
    const n = input[key];
    if (n === null || n === undefined) continue;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER || (key !== "duration" && !Number.isSafeInteger(n))) {
      throw new Error("테스트 통계는 0 이상의 유효한 숫자여야 합니다.");
    }
    result[key] = n;
  }
  const counts = [result.passed, result.failed, result.skipped];
  const subtotal = counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
  if (result.total !== null && (subtotal > result.total || (counts.every(n => n !== null) && subtotal !== result.total))) {
    throw new Error("통과·실패·건너뜀 합계와 전체 테스트 수가 다릅니다.");
  }
  return result;
}
function jsonObject(value: unknown): QualityJsonObject | null {
  if (value === null || value === undefined) return null;
  object(value, "CI 요약 JSON");
  let nodes = 0;
  const visit = (item: unknown, depth: number): QualityJsonValue => {
    nodes += 1;
    if (depth > 20 || nodes > 10_000) throw new Error("CI 요약 JSON의 중첩 또는 항목 수가 너무 많습니다.");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item === "string" && item.length <= 200_000) return item;
    if (Array.isArray(item)) return item.map(entry => visit(entry, depth + 1));
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => {
        if (["__proto__", "constructor", "prototype"].includes(key) || key.length > 1000) throw new Error("CI 요약 JSON에 허용하지 않는 키가 있습니다.");
        return [key, visit(entry, depth + 1)];
      }));
    }
    throw new Error("CI 요약에는 JSON 값만 기록할 수 있습니다.");
  };
  const result = visit(value, 0);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("CI 요약 JSON은 객체여야 합니다.");
  return result;
}
function check(value: unknown, now: number): QualityCheck {
  const c = object(value, "검증 항목");
  const id = identifier(c.id, "검증 ID");
  const group = c.group;
  if (group !== "tests" && group !== "quality" && group !== "gates") throw new Error("검증 분류가 올바르지 않습니다.");
  const expectedGroup = ["vitest", "playwright"].includes(id) ? "tests" : ["types", "lint", "csp", "licenses", "bundle"].includes(id) ? "quality" : "gates";
  if (group !== expectedGroup) throw new Error("필수 검사와 전용 게이트의 분류를 변경할 수 없습니다.");
  const failure = object(c.failure, "실패 분석");
  const classification = failure.classification;
  if (classification !== "unknown" && classification !== "regression" && classification !== "transient") throw new Error("실패 분류가 올바르지 않습니다.");
  const name = text(c.name, "검증 이름", 160);
  if (!name.trim()) throw new Error("검증 이름이 필요합니다.");
  const result: QualityCheck = {
    id, name, group, subtitle: text(c.subtitle, "검증 설명", 500), icon: text(c.icon, "검증 아이콘", 50),
    command: text(c.command, "참조 명령", 8000), source: text(c.source, "근거 출처", 4096), status: status(c.status, "검증 상태"),
    sha: sha(c.sha, "근거 SHA", true), executedAt: date(c.executedAt, "실행 시각", now, true),
    scope: text(c.scope, "검증 범위", 1000), logUrl: url(c.logUrl, "로그 링크"), summary: text(c.summary, "검증 요약"),
    stats: stats(c.stats), failure: { classification, change: text(failure.change, "관련 변경"), baseline: text(failure.baseline, "이전 정상 상태"), diff: text(failure.diff, "이전 정상과의 차이"), cause: text(failure.cause, "실패 원인"), action: text(failure.action, "권장 조치") },
    ciJson: jsonObject(c.ciJson), updatedAt: date(c.updatedAt, "검증 수정 시각", now, true),
  };
  if (result.status === "done" && result.stats.failed !== null && result.stats.failed > 0) throw new Error("실패한 테스트가 있는 검사를 완료로 기록할 수 없습니다.");
  return result;
}
function qaResult(value: unknown, now: number): QualityQaResult {
  const q = object(value, "외부 QA 결과");
  const title = text(q.title, "외부 QA 제목", 160);
  if (!title.trim()) throw new Error("외부 QA 결과 제목이 필요합니다.");
  return { id: identifier(q.id, "외부 QA ID"), title, status: status(q.status, "외부 QA 상태"), sha: sha(q.sha, "외부 QA SHA", true), executedAt: date(q.executedAt, "외부 QA 실행 시각", now), url: url(q.url, "외부 QA 링크"), summary: text(q.summary, "외부 QA 요약") };
}
function approval(value: unknown, now: number): QualityApproval {
  const a = object(value, "승인 대기");
  if (a.id !== "code" && a.id !== "deploy" && a.id !== "account") throw new Error("허용하지 않는 승인 작업입니다.");
  if (a.status !== "approval") throw new Error("코드 수정·외부 배포·계정 변경은 승인 대기로만 기록합니다.");
  return { id: a.id, title: text(a.title, "승인 작업 제목", 160), icon: text(a.icon, "승인 아이콘", 50), category: text(a.category, "승인 분류", 100), description: text(a.description, "승인 설명", 1000), note: text(a.note, "검토 메모", 8000), status: "approval", updatedAt: date(a.updatedAt, "검토 수정 시각", now, true) };
}

/** 가져온 값을 직접 병합하지 않고 검증한 필드로 새 보드를 구성한다. */
export function validateQualityBoard(value: unknown, now = Date.now()): QualityBoard {
  const b = object(value, "보드 JSON");
  if (b.schemaVersion !== 1 || b.project !== "ToonStudio" || b.mode !== "manual") throw new Error("ToonStudio 수동 보드 schemaVersion 1 JSON이 필요합니다.");
  if (typeof b.ttlHours !== "number" || !Number.isFinite(b.ttlHours) || b.ttlHours < 1 || b.ttlHours > 720) throw new Error("TTL은 1~720시간이어야 합니다.");
  const commit = object(b.commit, "기준 커밋");
  if (commit.source !== "remote-main" && commit.source !== "manual") throw new Error("커밋 관측 출처가 올바르지 않습니다.");
  const checks = uniqueIds(list(b.checks, "검증 항목", 100).map(c => check(c, now)), "검증 항목");
  for (const id of CI_QUALITY_REQUIRED_IDS) if (!checks.some(c => c.id === id)) throw new Error(`필수 검증 항목 ${id}가 누락되었습니다.`);
  const qa = object(b.qa, "외부 QA 카탈로그");
  if (qa.provider !== "Testifly" || qa.integration !== "reference-only") throw new Error("Testifly는 reference-only 후보로만 관리합니다.");
  const approvals = uniqueIds(list(b.approvals, "승인 대기", 3).map(a => approval(a, now)), "승인 대기");
  if (approvals.length !== 3 || APPROVAL_IDS.some(id => !approvals.some(a => a.id === id))) throw new Error("코드 수정·외부 배포·계정 변경의 승인 대기 3종이 필요합니다.");
  const history = uniqueIds(list(b.history, "기록 이력", QUALITY_HISTORY_LIMIT).map(entry => {
    const h = object(entry, "기록 이력");
    return { id: identifier(h.id, "이력 ID"), at: date(h.at, "기록 시각", now), text: text(h.text, "기록 내용", 1000) };
  }), "기록 이력");
  return {
    schemaVersion: 1, project: "ToonStudio", mode: "manual", snapshotAt: date(b.snapshotAt, "보드 기록 시각", now),
    commit: { sha: sha(commit.sha, "기준 커밋 SHA"), message: text(commit.message, "커밋 메시지", 2000), committedAt: date(commit.committedAt, "커밋 시각", now, true), observedAt: date(commit.observedAt, "커밋 관측 시각", now), source: commit.source, url: url(commit.url, "커밋 링크") },
    ttlHours: b.ttlHours, checks, qa: { provider: "Testifly", integration: "reference-only", results: uniqueIds(list(qa.results, "외부 QA 결과", 200).map(q => qaResult(q, now)), "외부 QA 결과") },
    approvals, history,
  };
}
export function parseQualityBoardJson(input: string, now = Date.now()): QualityBoard {
  if (input.length > QUALITY_JSON_MAX_LENGTH || new TextEncoder().encode(input).byteLength > QUALITY_JSON_MAX_LENGTH) throw new Error("보드 JSON은 2MB 이하만 허용합니다.");
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw new Error("JSON 문법이 올바르지 않습니다."); }
  return validateQualityBoard(parsed, now);
}
export function getFreshness(check: QualityCheck, board: QualityBoard, now = Date.now()): QualityFreshness {
  const time = Date.parse(check.executedAt);
  if ((check.executedAt && (!validTimestamp(check.executedAt) || time > now + FUTURE_TOLERANCE)) || (check.sha && !SHA_PATTERN.test(check.sha)) || (check.logUrl && !isQualityHttpUrl(check.logUrl))) {
    return { kind: "invalid", label: "근거 형식 확인", reason: "SHA·실행 시각·로그 링크의 형식 또는 미래 시각을 확인하세요." };
  }
  if (!check.sha || !check.executedAt || !check.scope.trim() || !check.logUrl) return { kind: "missing", label: "근거 미등록", reason: "SHA·실행 시각·검증 범위·로그 링크가 필요합니다." };
  if (check.sha.toLowerCase() !== board.commit.sha.toLowerCase()) return { kind: "stale", label: "stale · SHA 불일치", reason: "근거의 커밋이 기준 커밋과 다릅니다." };
  if (now - time > board.ttlHours * 3_600_000) return { kind: "stale", label: "stale · TTL 초과", reason: `${board.ttlHours}시간의 최신성 기준을 초과했습니다.` };
  return { kind: "fresh", label: "fresh · 유효", reason: "기준 SHA와 일치하며 최신성 기준 내 근거입니다. 기록한 검증 범위에만 유효합니다." };
}
export function summarizeQualityBoard(board: QualityBoard, now = Date.now()) {
  const byStatus: Record<QualityStatus, number> = { done: 0, progress: 0, failed: 0, unknown: 0, approval: 0 };
  const freshness = { fresh: 0, stale: 0, missing: 0, invalid: 0 };
  let validCompleted = 0;
  for (const c of board.checks) { byStatus[c.status] += 1; const f = getFreshness(c, board, now); freshness[f.kind] += 1; if (c.status === "done" && f.kind === "fresh") validCompleted += 1; }
  const tests = board.checks.filter(c => c.id === "vitest" || c.id === "playwright");
  const testStats: QualityStats = { passed: null, failed: null, skipped: null, total: null, duration: null };
  for (const key of STAT_KEYS) {
    const values = tests.map(c => c.stats[key]).filter((n): n is number => n !== null);
    testStats[key] = values.length ? values.reduce((sum, n) => sum + n, 0) : null;
  }
  return { tracked: board.checks.length, byStatus, ...freshness, validCompleted, testStats: { ...testStats, recordedChecks: tests.filter(c => STAT_KEYS.some(k => c.stats[k] !== null)).length, incomplete: tests.some(c => STAT_KEYS.some(k => k !== "duration" && c.stats[k] === null)) } };
}
export function exportQualityBoardJson(board: QualityBoard, now = Date.now()): string {
  const validated = validateQualityBoard(board, now);
  const encoded = JSON.stringify({ ...validated, exportedAt: new Date(now).toISOString(), derivedSummary: { ...summarizeQualityBoard(validated, now), canonical: "Vitest · Playwright · repository scripts", ciConnection: "not-connected", externalQa: "reference-only", costPolicy: "free-only" } }, null, 2);
  if (new TextEncoder().encode(encoded).byteLength > QUALITY_JSON_MAX_LENGTH) throw new Error("보드 JSON은 2MB 이하만 허용합니다.");
  return encoded;
}
export function createQualityGate(input: { name: string; subtitle: string; command: string; source: string }, id: string = `gate-${crypto.randomUUID()}`): QualityCheck {
  if (!input.name.trim() || CI_QUALITY_REQUIRED_IDS.some(required => required === id)) throw new Error("새 전용 게이트의 이름과 고유 ID가 필요합니다.");
  return { ...input, id, group: "gates", icon: "shield", status: "unknown", sha: "", executedAt: "", scope: "", logUrl: "", summary: "", stats: { passed: null, failed: null, skipped: null, total: null, duration: null }, failure: { change: "", baseline: "", diff: "", cause: "", action: "", classification: "unknown" }, ciJson: null, updatedAt: "" };
}
export function appendQualityHistory(board: QualityBoard, message: string, now = Date.now(), id: string = crypto.randomUUID()): QualityBoard {
  return { ...board, snapshotAt: new Date(now).toISOString(), history: [{ id, at: new Date(now).toISOString(), text: message }, ...board.history].slice(0, QUALITY_HISTORY_LIMIT) };
}

export type CiQualityBoard = QualityBoard;
export type CiQualityCheck = QualityCheck;
export type CiQualityStatus = QualityStatus;
export type CiQualityQaResult = QualityQaResult;
export type CiQualityApproval = QualityApproval;
export type CiQualityFreshness = QualityFreshness;
