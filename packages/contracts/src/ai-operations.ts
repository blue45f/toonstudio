import { z } from "zod";

/** 검토 상태는 외부 서비스 실행 또는 배포 성공을 뜻하지 않는다. */
export const STATUSES = ["미확인", "분석 중", "검토 필요", "승인 대기", "검증 완료", "main 반영 완료"] as const;
export const MAX_AI_OPERATIONS_BYTES = 2 * 1024 * 1024;
export type BoardStatus = typeof STATUSES[number];
export interface BoardItem {
  id: string;
  type: "model" | "retired-model" | "alert" | "hypothesis" | "task" | "config" | "change";
  provider: "Cloudflare" | "Onpod" | "공통";
  title: string; description: string; status: BoardStatus; priority: "P0" | "P1" | "P2";
  assurance: "확인됨" | "부분 확인" | "가설" | "미확인";
  fields: { key: string; label: string; value: string }[];
  sourceIds: string[]; owner: string; nextAction: string; notes: string;
  verifiedAt: string | null; verificationNote: string; mainSha: string | null;
  tags: string[]; approvalRequired: boolean;
}
export interface BoardSource {
  id: string; title: string; url: string;
  kind: "공식 문서" | "메일" | "코드" | "PR" | "커밋" | "CI" | "배포" | "저장소 문서";
  observedAt: string; scope: string;
}
/** 가져온 보드의 과거 기록이며 서버가 확인한 감사 이력이 아니다. */
export interface ImportedActivity { id: string; itemId: string; title: string; at: string }
export interface BoardSnapshot {
  meta: {
    title: string; snapshotAt: string; mainSha: string; mainCommitUrl: string;
    deadline: string; noticeUrl: string; caveats: string[];
  };
  items: BoardItem[]; sources: BoardSource[]; importedActivity?: ImportedActivity[];
}
export interface AiOperationsAudit {
  revision: number; actorUserId: string; at: string; beforeDigest: string; afterDigest: string;
}
export interface AiOperationsView {
  snapshot: BoardSnapshot | null; revision: number; updatedAt: string | null;
  canEdit: boolean; audit: AiOperationsAudit[];
}
export interface AiOperationsSave { expectedRevision: number; mutationId: string; snapshot: BoardSnapshot }

const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/u).refine((value) => !reservedKeys.has(value));
const nonempty = (max: number) => z.string().min(1).max(max).refine((value) => Boolean(value.trim()));
const sha = z.string().regex(/^[a-f0-9]{40}$/iu);
const unknownSha = z.union([sha, z.literal("")]);

export function safeEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const unsafeWhitespace = Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
    return value.length <= 4000 && !unsafeWhitespace && url.protocol === "https:" && Boolean(url.hostname)
      && !url.username && !url.password;
  } catch { return false; }
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.test(value)
    && validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
const instant = z.string().max(40).refine(validInstant);
const unknownInstant = z.union([instant, z.literal("")]);
const url = z.string().max(4000).refine(safeEvidenceUrl);
const unknownUrl = z.union([url, z.literal("")]);
const field = z.object({ key: id, label: nonempty(100), value: z.string().max(8000) }).strict();
const itemSchema = z.object({
  id, type: z.enum(["model", "retired-model", "alert", "hypothesis", "task", "config", "change"]),
  provider: z.enum(["Cloudflare", "Onpod", "공통"]), title: nonempty(240), description: z.string().max(12000),
  status: z.enum(STATUSES), priority: z.enum(["P0", "P1", "P2"]), assurance: z.enum(["확인됨", "부분 확인", "가설", "미확인"]),
  fields: z.array(field).max(60), sourceIds: z.array(id).max(60), owner: z.string().max(200),
  nextAction: z.string().max(8000), notes: z.string().max(16000), verifiedAt: unknownInstant.nullable(),
  verificationNote: z.string().max(8000), mainSha: unknownSha.nullable(), tags: z.array(nonempty(100)).max(30),
  approvalRequired: z.boolean(),
}).strict();
const sourceSchema = z.object({
  id, title: nonempty(240), url,
  kind: z.enum(["공식 문서", "메일", "코드", "PR", "커밋", "CI", "배포", "저장소 문서"]),
  observedAt: unknownInstant, scope: z.string().max(8000),
}).strict();
const activitySchema = z.object({ id, itemId: id, title: nonempty(500), at: instant }).strict();
const snapshotSchema = z.object({
  meta: z.object({
    title: nonempty(240), snapshotAt: unknownInstant, mainSha: unknownSha, mainCommitUrl: unknownUrl,
    deadline: z.string().max(10).refine((value) => value === "" || validDate(value)), noticeUrl: unknownUrl,
    caveats: z.array(z.string().max(8000)).max(80),
  }).strict(),
  items: z.array(itemSchema).max(500), sources: z.array(sourceSchema).max(500),
  importedActivity: z.array(activitySchema).max(100).optional(),
}).strict();
const saveSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  mutationId: z.string().uuid(), snapshot: snapshotSchema,
}).strict();

function requireSize(value: unknown): void {
  let text: string | undefined;
  try { text = JSON.stringify(value); } catch { throw new Error("보드 기록을 JSON으로 읽을 수 없습니다."); }
  if (text === undefined || new TextEncoder().encode(text).byteLength > MAX_AI_OPERATIONS_BYTES) {
    throw new Error("보드 기록은 UTF-8 기준 2 MiB 이내여야 합니다. 긴 로그는 근거 링크로 기록하세요.");
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldPath = result.error.issues[0]?.path.map(String).join(".");
    throw new Error(`${label} 형식이 올바르지 않습니다${fieldPath ? ` (${fieldPath})` : ""}.`);
  }
  return result.data;
}
function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label}에 중복 식별자가 있습니다.`);
}
function requireObservedAt(value: string | null, now: number, label: string): void {
  if (value && Date.parse(value) > now) throw new Error(`${label}에 미래의 확인 시각을 기록할 수 없습니다.`);
}
function isCommitEvidence(value: string, commit: string): boolean {
  const parsed = new URL(value);
  return parsed.origin === "https://github.com"
    && parsed.pathname.toLowerCase() === `/blue45f/toonstudio/commit/${commit.toLowerCase()}`;
}
function validateSnapshot(snapshot: BoardSnapshot, prior: BoardSnapshot | null | undefined, now: number): void {
  if (!Number.isFinite(now)) throw new Error("검증 기준 시각이 올바르지 않습니다.");
  requireUnique(snapshot.items.map((item) => item.id), "항목");
  requireUnique(snapshot.sources.map((source) => source.id), "근거");
  requireUnique((snapshot.importedActivity ?? []).map((entry) => entry.id), "가져온 이력");
  requireObservedAt(snapshot.meta.snapshotAt, now, "기준 스냅샷");
  if (snapshot.meta.mainCommitUrl && (!snapshot.meta.mainSha || !isCommitEvidence(snapshot.meta.mainCommitUrl, snapshot.meta.mainSha))) {
    throw new Error("기준 main SHA와 ToonStudio 커밋 링크가 일치해야 합니다.");
  }
  const sources = new Map(snapshot.sources.map((source) => [source.id, source]));
  for (const source of snapshot.sources) requireObservedAt(source.observedAt, now, "근거");
  for (const entry of snapshot.importedActivity ?? []) requireObservedAt(entry.at, now, "가져온 이력");
  for (const item of snapshot.items) {
    requireUnique(item.fields.map((entry) => entry.key), "상세 필드");
    requireUnique(item.sourceIds, "항목의 근거");
    if (item.sourceIds.some((sourceId) => !sources.has(sourceId))) throw new Error("등록되지 않은 출처 ID가 있습니다.");
    requireObservedAt(item.verifiedAt, now, "항목");
    if (item.approvalRequired && item.status !== "승인 대기") throw new Error("운영 변경 승인 항목은 승인 대기로 유지해야 합니다.");
    const extraUrl = item.fields.find((entry) => entry.key === "userEvidenceUrl")?.value;
    if (extraUrl && !safeEvidenceUrl(extraUrl)) throw new Error("추가 증빙 링크는 로그인 정보가 없는 HTTPS URL이어야 합니다.");
    if (item.status !== "검증 완료" && item.status !== "main 반영 완료") continue;
    if (!item.verifiedAt || !item.verificationNote.trim()) throw new Error("완료 상태에는 실제 검증 시각과 검증 결과가 필요합니다.");
    const evidence = item.sourceIds.map((sourceId) => sources.get(sourceId)!.url);
    if (extraUrl) evidence.push(extraUrl);
    if (!evidence.length) throw new Error("완료 상태에는 검증 증빙 링크가 필요합니다.");
    // URL의 형식만 검증한다. PR·CI·배포의 실제 내용 일치는 운영자가 별도로 확인한다.
    if (item.status === "main 반영 완료" && (!item.mainSha || !evidence.some((entry) => isCommitEvidence(entry, item.mainSha!)))) {
      throw new Error("main 반영 완료에는 전체 SHA와 정확히 일치하는 ToonStudio 커밋 증빙이 필요합니다.");
    }
  }
  const next = new Map(snapshot.items.map((item) => [item.id, item]));
  for (const item of prior?.items ?? []) {
    const replacement = next.get(item.id);
    if (item.approvalRequired && (!replacement || !replacement.approvalRequired)) {
      throw new Error("기존 운영 변경 항목의 승인 제한을 해제하거나 삭제할 수 없습니다.");
    }
    if (replacement && item.type !== replacement.type) throw new Error("기존 항목의 종류는 변경할 수 없습니다.");
  }
}

/** 저장·가져오기는 관측 시각을 자동 갱신하지 않는다. */
export function parseAiOperationsSnapshot(value: unknown, prior?: BoardSnapshot | null, now = Date.now()): BoardSnapshot {
  requireSize(value);
  const result = parse(snapshotSchema, value, "보드 기록");
  validateSnapshot(result, prior, now);
  return result;
}
export function parseAiOperationsSave(value: unknown, prior?: BoardSnapshot | null, now = Date.now()): AiOperationsSave {
  requireSize(value);
  const result = parse(saveSchema, value, "저장 요청");
  validateSnapshot(result.snapshot, prior, now);
  return result;
}

const importSchema = snapshotSchema.extend({
  activity: z.array(activitySchema).max(100).optional(),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(), exportedAt: instant.optional(),
}).strict();
const wrapperSchema = z.object({
  kind: z.literal("toonstudio-ai-operations"), schemaVersion: z.literal(1), snapshot: snapshotSchema,
  exportedAt: instant.optional(),
}).strict();

/** Sites의 원본 JSON도 읽되, 원본 revision과 이력을 서버 권한으로 승격하지 않는다. */
export function parseAiOperationsImport(text: string, now = Date.now()): BoardSnapshot {
  if (new TextEncoder().encode(text).byteLength > MAX_AI_OPERATIONS_BYTES) throw new Error("가져올 JSON은 UTF-8 기준 2 MiB 이내여야 합니다.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("올바른 JSON 파일이 아닙니다. 기존 기록은 변경되지 않았습니다."); }
  if (value && typeof value === "object" && "kind" in value) {
    const wrapper = parse(wrapperSchema, value, "내보낸 보드");
    requireObservedAt(wrapper.exportedAt ?? null, now, "내보내기");
    return parseAiOperationsSnapshot(wrapper.snapshot, undefined, now);
  }
  const legacy = parse(importSchema, value, "가져온 보드");
  const { activity, revision: _revision, exportedAt, ...snapshot } = legacy;
  requireObservedAt(exportedAt ?? null, now, "내보내기");
  if (activity && snapshot.importedActivity) throw new Error("과거 이력 필드가 중복되어 있습니다. 원본 보드에서 다시 내보내세요.");
  return parseAiOperationsSnapshot({ ...snapshot, ...(activity ? { importedActivity: activity } : {}) }, undefined, now);
}

export function aiOperationsEvidenceAge(snapshot: BoardSnapshot, now = Date.now()): number | null {
  const at = snapshot.meta.snapshotAt;
  return at && validInstant(at) && Number.isFinite(now) && Date.parse(at) <= now ? now - Date.parse(at) : null;
}
