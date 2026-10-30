import { StudioScopedWriteManagementCommandSchema, type StudioScopedWriteManagementCommand } from "@toonstudio/contracts/studio-scoped-write";
import { getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";

const PREFIX = "toonstudio:scoped-write-management:v1:", TTL = 7 * 24 * 60 * 60_000, LIMIT = 1_048_576;
export const scopedManagementRecoveryKey = (actorId: string, workId: string) => `${PREFIX}${encodeURIComponent(actorId)}:${encodeURIComponent(workId)}`;
export function clearScopedManagementRecovery(actorId: string, workId: string): void {
  try { window.sessionStorage.removeItem(scopedManagementRecoveryKey(actorId, workId)); } catch { /* 같은 화면의 pending 참조는 계속 보존한다. */ }
}
export function saveScopedManagementRecovery(actorId: string, workId: string, request: StudioScopedWriteManagementCommand): boolean {
  try {
    const parsed = StudioScopedWriteManagementCommandSchema.parse(request), raw = JSON.stringify({ version: 1, actorId, workId, queuedAt: Date.now(), request: parsed });
    if (raw.length > LIMIT) return false;
    window.sessionStorage.setItem(scopedManagementRecoveryKey(actorId, workId), raw); return true;
  } catch { return false; }
}
export function loadScopedManagementRecovery(actorId: string, workId: string): StudioScopedWriteManagementCommand | null {
  try {
    const raw = window.sessionStorage.getItem(scopedManagementRecoveryKey(actorId, workId));
    if (raw === null) return null;
    if (raw.length > LIMIT) throw new Error("너무 큰 복구 기록입니다.");
    const envelope: unknown = JSON.parse(raw);
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("복구 기록 형식이 다릅니다.");
    const value = envelope as Record<string, unknown>;
    if (value.version !== 1 || value.actorId !== actorId || value.workId !== workId || typeof value.queuedAt !== "number"
      || !Number.isSafeInteger(value.queuedAt) || value.queuedAt > Date.now() || Date.now() - value.queuedAt >= TTL) throw new Error("현재 계정의 복구 기록이 아닙니다.");
    return StudioScopedWriteManagementCommandSchema.parse(value.request);
  } catch { clearScopedManagementRecovery(actorId, workId); return null; }
}
listeners.add(() => {
  const actorId = getAuthUserId(), retained = actorId ? `${PREFIX}${encodeURIComponent(actorId)}:` : null;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(PREFIX) && (!retained || !key.startsWith(retained))) window.sessionStorage.removeItem(key);
    }
  } catch { /* 저장소가 막히면 다른 계정의 기록을 복원하지 않는다. */ }
});
