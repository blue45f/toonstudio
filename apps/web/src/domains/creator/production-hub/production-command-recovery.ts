import { getAuthSession, listeners } from "@/domains/auth/public/session/auth-session-state";

/**
 * 서버 ACK 전의 작업·검수·참여 역할 명령을 같은 탭의 새로고침 복구용으로 보관한다.
 * 서버 상태의 권위가 아니며 복원 뒤 현재 권한 조회와 동일 ID 영수증 확인이 필요하다.
 * 통합 설정·초대·외부 검수·상업 기록은 보관하지 않는다. 토큰·키는 저장하지 않는다.
 */
export const PRODUCTION_COMMAND_RECOVERY_PREFIX = "toonstudio:production-command-recovery:v1:";
export const PRODUCTION_COMMAND_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_RECORD_LENGTH = 1_048_576;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SAFE_COMMANDS = new Set(["upsert-task", "upsert-task-batch", "transition-task-batch", "upsert-submission", "submit-task-output", "record-review-decision", "upsert-clarification", "configure-collaboration"]);
const SECRET_FIELD = /(?:token|secret|password|credential|authorization|cookie|api[-_]?key|private[-_]?key|oauth|signed[-_]?url)/iu;
const SECRET_TEXT = /(?:\bBearer\s+\S+|[?&](?:token|access_token|key|signature|x-amz-signature|x-goog-signature)=|\bsk-[a-z0-9_-]{12,})/iu;

export interface PendingProductionCommand {
  readonly mutationId: string;
  readonly expectedRevision: number;
  readonly command: unknown;
  readonly confirmedRevision: number | null;
  readonly queuedAt: number;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function secretFree(value: unknown): boolean {
  if (typeof value === "string") return !SECRET_TEXT.test(value);
  if (Array.isArray(value)) return value.every(secretFree);
  if (isRecord(value)) return Object.entries(value).every(([key, nested]) => !SECRET_FIELD.test(key) && secretFree(nested));
  return value == null || typeof value === "number" || typeof value === "boolean";
}
function safeCommand(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string" || !SAFE_COMMANDS.has(value.type) || !secretFree(value)) return false;
  // 역할 편집만 보관한다. 헌장·통합 설정·초대 payload를 이 허용으로 확장하지 않는다.
  return value.type !== "configure-collaboration" || (Object.keys(value).sort().join(",") === "assignments,authorityRules,parties,type"
    && Array.isArray(value.parties) && Array.isArray(value.assignments) && Array.isArray(value.authorityRules));
}
export function productionCommandRecoveryKey(actorId: string, projectId: string): string {
  return `${PRODUCTION_COMMAND_RECOVERY_PREFIX}${encodeURIComponent(actorId)}:${encodeURIComponent(projectId)}`;
}
export function clearProductionCommandRecovery(actorId: string, projectId: string): boolean {
  try { window.sessionStorage.removeItem(productionCommandRecoveryKey(actorId, projectId)); return true; }
  catch { return false; }
}
export function clearProductionCommandRecoveriesForActor(actorId: string): void {
  const prefix = `${PRODUCTION_COMMAND_RECOVERY_PREFIX}${encodeURIComponent(actorId)}:`;
  removeMatchingRecoveries((key) => key.startsWith(prefix));
}
function removeMatchingRecoveries(matches: (key: string) => boolean): void {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key && matches(key)) window.sessionStorage.removeItem(key);
    }
  } catch { /* 저장소가 차단되면 서버 권한 확인 없이 복원하지 않는다. */ }
}
// 제작 화면을 떠난 뒤의 로그아웃도 처리한다. 같은 계정의 인증 갱신은 기록을 유지한다.
listeners.add(() => {
  const actorId = getAuthSession()?.user.id;
  const retainedPrefix = actorId ? `${PRODUCTION_COMMAND_RECOVERY_PREFIX}${encodeURIComponent(actorId)}:` : null;
  removeMatchingRecoveries((key) => key.startsWith(PRODUCTION_COMMAND_RECOVERY_PREFIX)
    && (retainedPrefix === null || !key.startsWith(retainedPrefix)));
});
export function saveProductionCommandRecovery(actorId: string, projectId: string, request: PendingProductionCommand): boolean {
  if (!safeCommand(request.command)) return false;
  try {
    const value = JSON.stringify({ version: 1, actorId, projectId, request });
    if (value.length > MAX_RECORD_LENGTH) return false;
    const key = productionCommandRecoveryKey(actorId, projectId);
    window.sessionStorage.setItem(key, value);
    return window.sessionStorage.getItem(key) === value;
  } catch { return false; }
}
export function loadProductionCommandRecovery(actorId: string, projectId: string, now = Date.now()): PendingProductionCommand | null {
  try {
    const raw = window.sessionStorage.getItem(productionCommandRecoveryKey(actorId, projectId));
    if (raw === null) return null;
    if (raw.length > MAX_RECORD_LENGTH) throw new Error("invalid recovery envelope");
    const value: unknown = JSON.parse(raw);
    const request = isRecord(value) ? value.request : null;
    if (!isRecord(value) || value.version !== 1 || value.actorId !== actorId || value.projectId !== projectId || !isRecord(request)
      || typeof request.mutationId !== "string" || !UUID.test(request.mutationId)
      || typeof request.expectedRevision !== "number" || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0
      || typeof request.queuedAt !== "number" || !Number.isSafeInteger(request.queuedAt) || request.queuedAt > now
      || now - request.queuedAt >= PRODUCTION_COMMAND_RECOVERY_TTL_MS
      || (request.confirmedRevision !== null && (typeof request.confirmedRevision !== "number"
        || !Number.isSafeInteger(request.confirmedRevision) || request.confirmedRevision <= request.expectedRevision))
      || !safeCommand(request.command)) throw new Error("invalid recovery envelope");
    return { mutationId: request.mutationId, expectedRevision: request.expectedRevision, command: request.command,
      confirmedRevision: typeof request.confirmedRevision === "number" ? request.confirmedRevision : null, queuedAt: request.queuedAt };
  } catch {
    clearProductionCommandRecovery(actorId, projectId);
    return null;
  }
}
