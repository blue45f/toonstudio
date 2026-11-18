import { BadRequestException, ForbiddenException } from "@nestjs/common";
import {
  createOperationsWorkspace, projectWorkspaceScope,
  type AdminWorkspace, type AdminWorkspaceAccess, type AdminWorkspaceAreaAccess, type AdminWorkspaceGrantInput, type AdminWorkspaceScope,
} from "@toonstudio/contracts/admin-workspace";

export interface WorkspaceBusinessGrant { can_write: boolean; can_export: boolean }

const denied = (): AdminWorkspaceAreaAccess => ({ canRead: false, canWrite: false, canExport: false, canManageAccess: false });

export function workspaceAccess(role: "admin" | "operator", actor: string, owner: string | null, grant: WorkspaceBusinessGrant | undefined): AdminWorkspaceAccess {
  const isOwner = owner !== null && owner === actor;
  return {
    operations: { canRead: true, canWrite: role === "admin", canExport: true, canManageAccess: false },
    business: owner === null || (!isOwner && !grant) ? denied() : {
      canRead: true, canWrite: isOwner || grant?.can_write === true,
      canExport: isOwner || grant?.can_export === true, canManageAccess: isOwner,
    },
  };
}

export function requireWorkspaceScope(value: unknown): AdminWorkspaceScope {
  if (value === undefined || value === "operations") return "operations";
  if (value === "business") return "business";
  throw new BadRequestException("작업 보드의 조회 범위를 확인해 주세요.");
}

export function requireBusinessGrant(value: unknown): AdminWorkspaceGrantInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("접근 권한 요청을 확인해 주세요.");
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).some(key => !["mutationId", "userId", "canRead", "canWrite", "canExport"].includes(key))
    || typeof entry.mutationId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(entry.mutationId)
    || typeof entry.userId !== "string" || !entry.userId.trim() || entry.userId.length > 256
    || typeof entry.canRead !== "boolean" || typeof entry.canWrite !== "boolean" || typeof entry.canExport !== "boolean"
    || (!entry.canRead && (entry.canWrite || entry.canExport))) throw new BadRequestException("대상 계정과 읽기·편집·내보내기 권한을 확인해 주세요.");
  return { mutationId: entry.mutationId, userId: entry.userId, canRead: entry.canRead, canWrite: entry.canWrite, canExport: entry.canExport };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => sameValue(value, b[index]));
  const left = a as Record<string, unknown>; const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

/** 권한 밖 필드를 조용히 받아들이거나 전체 대체하지 않는다. */
export function requireScopedWorkspace(state: AdminWorkspace, scope: AdminWorkspaceScope): void {
  if (!sameValue(state, projectWorkspaceScope(state, scope))) throw new ForbiddenException("허용된 작업 범위의 기록만 저장할 수 있습니다. 비공개 원문은 별도 권한으로 확인해 주세요.");
}

/** 화면에서 제거한 원문 연결과 다른 영역은 원본에서 복원하여 그대로 보존한다. */
export function mergeWorkspaceScope(previous: AdminWorkspace | null, next: AdminWorkspace, scope: AdminWorkspaceScope): AdminWorkspace {
  requireScopedWorkspace(next, scope);
  const before = previous ?? createOperationsWorkspace();
  const visibleBefore = projectWorkspaceScope(before, scope);
  const originals = new Map(before.records.map(record => [record.id, record]));
  const visible = new Map(visibleBefore.records.map(record => [record.id, record]));
  const records = next.records.map(record => {
    const old = originals.get(record.id);
    if (old && (old.module === "business") !== (scope === "business")) throw new ForbiddenException("허용된 작업 범위의 기록만 저장할 수 있습니다.");
    const projected = visible.get(record.id);
    return {
      ...record,
      origin: scope === "operations" && old ? old.origin : record.origin,
      taskId: old && projected && old.taskId !== projected.taskId && record.taskId === projected.taskId ? old.taskId : record.taskId,
    };
  });
  const otherRecords = before.records.filter(record => (record.module === "business") !== (scope === "business"));
  if (scope === "operations") return { ...before, records: [...otherRecords, ...records] };
  const oldMentor = new Map(before.mentor.map(item => [item.id, item]));
  const visibleMentor = new Map(visibleBefore.mentor.map(item => [item.id, item]));
  return {
    ...next, records: [...otherRecords, ...records],
    mentor: next.mentor.map(item => {
      const old = oldMentor.get(item.id); const projected = visibleMentor.get(item.id);
      return old && projected && old.taskId !== projected.taskId && item.taskId === projected.taskId ? { ...item, taskId: old.taskId } : item;
    }),
  };
}
