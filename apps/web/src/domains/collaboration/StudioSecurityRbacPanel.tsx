import { Lock, Shield, ShieldCheck, UserCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  SECURITY_PERMISSION_LABELS,
  SECURITY_ROLE_CATALOG,
  createSecurityAuditEntry,
  evaluateSecurityPermission,
  resolveEffectivePermissions,
  type RoleAssignmentRecord,
  type SecurityAuditEntry,
  type SecurityPermissionId,
  type SecurityRoleId,
} from "@toonstudio/contracts/studio-security-rbac";

import { studioEcosystemClient } from "@/platform/studio-ecosystem-client";
import { useStudioEcosystemStream } from "@/platform/use-studio-ecosystem-stream";

export interface StudioSecurityRbacPanelProps {
  readonly initialAssignments?: readonly RoleAssignmentRecord[];
  readonly onRoleChanged?: (assignment: RoleAssignmentRecord, audit: SecurityAuditEntry) => void;
}

const DEFAULT_ASSIGNMENTS: readonly RoleAssignmentRecord[] = [
  {
    userId: "u-owner",
    displayName: "김대표 (스튜디오 오너)",
    roleId: "studio_owner",
    scopeType: "studio",
    scopeId: "studio-chronicle",
  },
  {
    userId: "u-line",
    displayName: "루나 (선화 어시)",
    roleId: "line_assistant",
    scopeType: "work",
    scopeId: "work-gate-breaker",
  },
  {
    userId: "u-guest",
    displayName: "외부 편집자 (검수)",
    roleId: "guest_reviewer",
    scopeType: "project",
    scopeId: "proj-s2-relaunch",
  },
];

const SIMULATED_PERMISSIONS: readonly SecurityPermissionId[] = [
  "manuscript:read",
  "manuscript:write_assigned_layer",
  "manuscript:write_all",
  "manuscript:export_raw",
  "ip:view_contracts",
  "rbac:manage_roles",
  "mcp:execute_draw",
];

export function StudioSecurityRbacPanel({
  initialAssignments = DEFAULT_ASSIGNMENTS,
  onRoleChanged,
}: StudioSecurityRbacPanelProps) {
  const [assignments, setAssignments] = useState<readonly RoleAssignmentRecord[]>(initialAssignments);
  const [selectedUserId, setSelectedUserId] = useState<string>(initialAssignments[1]?.userId ?? initialAssignments[0].userId);
  const [simulatedClientIp, setSimulatedClientIp] = useState("");
  const [auditLogs, setAuditLogs] = useState<SecurityAuditEntry[]>([]);
  const stream = useStudioEcosystemStream(true);
  const latestRbacEventId = useMemo(
    () => stream.events.find((e) => e.type === "rbac.role_assigned")?.id ?? null,
    [stream.events],
  );

  useEffect(() => {
    let active = true;
    void studioEcosystemClient
      .listAuditLogs()
      .then((res) => {
        if (!active || !Array.isArray(res?.items) || res.items.length === 0) return;
        setAuditLogs((prev) => {
          const remoteIds = new Set(res.items.map((item) => item.id));
          return [...res.items, ...prev.filter((item) => !remoteIds.has(item.id))].slice(0, 8);
        });
      })
      .catch(() => {
        // 오프라인/로컬 미리보기 환경에서는 로컬 감사 로그를 유지한다.
      });
    return () => {
      active = false;
    };
  }, [latestRbacEventId]);

  const selectedMember = useMemo(
    () => assignments.find((m) => m.userId === selectedUserId) ?? assignments[0],
    [assignments, selectedUserId],
  );
  const effectivePermissions = useMemo(
    () => resolveEffectivePermissions(selectedMember),
    [selectedMember],
  );

  const handleRoleUpdate = (nextRole: SecurityRoleId) => {
    const updated: RoleAssignmentRecord = { ...selectedMember, roleId: nextRole };
    setAssignments((prev) => prev.map((m) => (m.userId === updated.userId ? updated : m)));
    const audit = createSecurityAuditEntry({
      actorUserId: "u-owner",
      action: `role.changed:${selectedMember.roleId}->${nextRole}`,
      targetUserId: updated.userId,
      scopeType: updated.scopeType,
      scopeId: updated.scopeId,
    });
    setAuditLogs((prev) => [audit, ...prev].slice(0, 8));
    onRoleChanged?.(updated, audit);
    void studioEcosystemClient
      .assignRole({
        actorUserId: "u-owner",
        targetUserId: updated.userId,
        displayName: updated.displayName,
        roleId: nextRole,
        scopeType: updated.scopeType,
        scopeId: updated.scopeId,
      })
      .catch(() => {
        // 오프라인/로컬 미리보기 환경에서는 낙관적 감사 로그를 유지한다.
      });
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [overflow-wrap:break-word] [word-break:keep-all] sm:p-5"
      aria-label="보안 역할별 롤 및 권한 관리 패널"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Shield className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg">
            보안 역할(RBAC) · 세분화 권한 관리
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 text-xs text-fg-2">
          <Lock className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
          최소 권한 · 워터마크 가드 · {stream.status === "connected" ? "실시간" : "로컬"}
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-[248px_1fr]">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium text-fg-2">멤버 및 스코프</p>
          <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:flex-col md:overflow-visible md:pb-0">
            {assignments.map((member) => (
              <button
                key={member.userId}
                type="button"
                onClick={() => setSelectedUserId(member.userId)}
                className={`min-h-12 w-52 shrink-0 snap-start rounded-lg border px-3 py-2 text-left text-xs transition-colors duration-150 md:w-auto ${
                  member.userId === selectedMember.userId
                    ? "border-accent bg-accent-soft/60 font-medium text-fg"
                    : "border-line bg-card text-fg-2 hover:border-accent/45"
                }`}
              >
                <div className="truncate">{member.displayName}</div>
                <div className="mt-0.5 truncate text-xs text-fg-3">
                  {member.scopeType}:{member.scopeId} · {member.roleId}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-card p-3.5 text-xs sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-fg">
              <UserCog className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{selectedMember.displayName}</span>
            </div>
            <select
              aria-label="보안 역할 선택"
              value={selectedMember.roleId}
              onChange={(e) => handleRoleUpdate(e.target.value as SecurityRoleId)}
              className="min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-9 sm:w-auto"
            >
              {SECURITY_ROLE_CATALOG.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.labelKo}
                </option>
              ))}
            </select>
          </div>

          <label className="flex flex-col gap-1 text-fg-2 sm:flex-row sm:items-center sm:justify-between">
            <span>접속 IP 모의 검증 (선택)</span>
            <input
              type="text"
              value={simulatedClientIp}
              onChange={(e) => setSimulatedClientIp(e.target.value)}
              placeholder="예: 10.0.1.5 또는 203.0.113.10"
              className="min-h-11 rounded-lg border border-line bg-panel px-3 font-mono text-xs text-fg [word-break:normal] sm:min-h-8 sm:w-56"
            />
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SIMULATED_PERMISSIONS.map((perm) => {
              const evalResult = evaluateSecurityPermission(
                selectedMember,
                perm,
                simulatedClientIp.trim() || undefined,
              );
              return (
                <div
                  key={perm}
                  className={`flex min-h-10 items-center justify-between gap-2 rounded-lg border px-3 py-1.5 sm:min-h-9 ${
                    evalResult.allowed
                      ? "border-good/35 bg-good/10 text-fg"
                      : "border-line bg-panel text-fg-3"
                  }`}
                >
                  <span className="truncate">{SECURITY_PERMISSION_LABELS[perm]}</span>
                  <span className="shrink-0 font-medium">
                    {evalResult.allowed ? "허용" : "차단"}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="flex items-center gap-1.5 text-xs tabular-nums text-fg-3">
            <ShieldCheck className="size-3.5 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
            총 활성 권한 {effectivePermissions.length}개 · 워터마크 강제:{" "}
            {evaluateSecurityPermission(selectedMember, "manuscript:read", simulatedClientIp.trim() || undefined).enforceWatermark
              ? "활성"
              : "비활성"}
          </p>
        </div>
      </div>

      {auditLogs.length > 0 && (
        <div className="rounded-lg border border-line bg-card p-3 text-xs text-fg-3">
          <p className="mb-1.5 font-medium text-fg-2">최근 보안 감사 로그</p>
          <ul className="space-y-1 overflow-x-auto font-mono text-[11px] [word-break:normal]">
            {auditLogs.map((log) => (
              <li key={log.id} className="whitespace-nowrap">
                [{log.scopeType}:{log.scopeId}] {log.targetUserId} — {log.action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
