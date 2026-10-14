import { useRef, useState, type ChangeEvent } from "react";
import type { TeamWorkspaceSummary } from "@toonstudio/contracts/production-workspace";
import { isWorkspaceManager } from "@toonstudio/contracts/production-workspace";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getTeamWorkspace, getTeamAuditLog } from "./team-workspace-api";
import type { LocalOrganizationState } from "./organization-model";
import {
  ORGANIZATION_BACKUP_AUDIT_PAGE_LIMIT,
  ORGANIZATION_BACKUP_SECTIONS,
  ORGANIZATION_BACKUP_SECTION_LABELS,
  buildOrganizationBackup,
  organizationBackupFileName,
  parseOrganizationBackup,
  serializeOrganizationBackup,
  type OrganizationBackupAuditEntry,
  type OrganizationBackupSection,
  type OrganizationBackupTeamSource,
  type OrganizationBackupVerification,
} from "./organization-backup";

type AuditDraft = Omit<OrganizationBackupAuditEntry, "workspaceId" | "workspaceName">;

/** 감사 로그는 관리자 전용 API라 페이지네이션으로 상한까지만 모은다. 넘으면 truncated로 정직하게 남긴다. */
async function loadTeamAudit(workspaceId: string): Promise<{ entries: AuditDraft[]; truncated: boolean }> {
  const entries: AuditDraft[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 10; page += 1) {
    const response = await getTeamAuditLog(workspaceId, { limit: 100, ...(cursor !== undefined ? { cursor } : {}) });
    entries.push(
      ...response.entries.map((entry) => ({
        id: entry.id,
        actorUserId: entry.actorUserId,
        actorDisplayName: entry.actorDisplayName,
        action: entry.action,
        targetId: entry.targetId,
        targetDisplayName: entry.targetDisplayName,
        revision: entry.revision,
        occurredAt: entry.occurredAt,
      })),
    );
    if (response.nextCursor === null) return { entries, truncated: false };
    if (entries.length >= ORGANIZATION_BACKUP_AUDIT_PAGE_LIMIT) return { entries, truncated: true };
    cursor = response.nextCursor;
  }
  return { entries, truncated: true };
}

function downloadBackup(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * 조직 단위 백업 표면. 조직 홈의 카드 하나로 붙는다.
 * 내보내기는 연결 팀 상세를 모아 파일 1개로 만들고, 검증은 파일을 읽어 요약만 보여 준다
 * (검증만으로 어떤 조직 상태도 바뀌지 않는다).
 */
export function OrganizationBackupPanel({
  local,
  linkedTeams,
}: {
  local: LocalOrganizationState;
  linkedTeams: readonly TeamWorkspaceSummary[];
}) {
  const bt = useBilingual("OrganizationBackupPanel");
  const [selected, setSelected] = useState<readonly OrganizationBackupSection[]>(ORGANIZATION_BACKUP_SECTIONS);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [verification, setVerification] = useState<OrganizationBackupVerification | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profile = local.profile;
  if (!profile) return null;

  function toggleSection(section: OrganizationBackupSection, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, section] : current.filter((item) => item !== section),
    );
  }

  async function exportBackup() {
    if (!profile || selected.length === 0 || busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const wantAudit = selected.includes("audit");
      const teams: OrganizationBackupTeamSource[] = [];
      for (const team of linkedTeams) {
        const detail = await getTeamWorkspace(team.id);
        let auditEntries: AuditDraft[] | undefined;
        let auditTruncated = false;
        if (wantAudit && isWorkspaceManager(team.role)) {
          try {
            const audit = await loadTeamAudit(team.id);
            auditEntries = audit.entries;
            auditTruncated = audit.truncated;
          } catch {
            auditEntries = undefined; // 읽지 못한 팀은 파일의 coverage에 이름으로 남는다.
          }
        }
        teams.push({ detail, ...(auditEntries ? { auditEntries, auditTruncated } : {}) });
      }
      const now = new Date();
      const backup = buildOrganizationBackup(
        { profile, notices: local.notices, linkedWorkspaceIds: local.linkedWorkspaceIds, teams },
        selected,
        now,
      );
      downloadBackup(serializeOrganizationBackup(backup), organizationBackupFileName(backup, now));
      const missing = backup.coverage.missingAuditWorkspaceIds.length;
      setStatus(
        missing > 0
          ? bt(
              `백업 파일을 만들었습니다. 감사 로그를 읽을 수 없는 팀 ${missing}개는 파일에 "포함 못 함"으로 표시했습니다.`,
              `Backup file created. ${missing} team(s) whose audit log couldn't be read are marked as not included in the file.`,
            )
          : bt("백업 파일을 만들었습니다.", "Backup file created."),
      );
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("백업을 만들지 못했습니다. 팀 정보를 다시 불러와 주세요.", "Couldn't create the backup. Please reload your team information.")));
    } finally {
      setBusy(false);
    }
  }

  async function verifyBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setVerifyError("");
    setVerification(null);
    try {
      const summary = parseOrganizationBackup(await file.text());
      setVerification(summary);
    } catch {
      setVerifyError(bt("올바른 조직 백업 파일이 아닙니다. 내용이 손상됐거나 다른 파일일 수 있습니다.", "This isn't a valid organization backup file. It may be damaged or a different file."));
    }
  }

  return (
    <div>
      <p className="text-sm leading-6 text-fg-2">
        {bt(
          "구성원 명단·작품 목록·감사 로그·조직 설정을 조직 단위 파일 1개로 내보냅니다. 원고 본문과 초대 이메일·토큰은 담지 않습니다. 받은 파일은 아래 검증으로 다른 환경에서도 내용을 확인할 수 있습니다.",
          "Export the member roster, project list, audit log, and organization settings as one organization-level file. Manuscript content and invite emails or tokens are never included. Anyone can check a received file with the verification below, in any environment.",
        )}
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">{bt("담을 항목", "Sections to include")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ORGANIZATION_BACKUP_SECTIONS.map((section) => (
            <label key={section} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(section)}
                onChange={(event) => toggleSection(section, event.target.checked)}
              />
              {bt(ORGANIZATION_BACKUP_SECTION_LABELS[section].ko, ORGANIZATION_BACKUP_SECTION_LABELS[section].en)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass()}
          disabled={busy || selected.length === 0 || linkedTeams.length === 0}
          onClick={() => void exportBackup()}
        >
          {busy ? bt("백업 만드는 중…", "Creating backup…") : bt("조직 백업 파일 내려받기", "Download organization backup")}
        </button>
        <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => fileInputRef.current?.click()}>
          {bt("백업 파일 검증하기", "Verify a backup file")}
        </button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void verifyBackupFile(event)} />
      </div>
      {linkedTeams.length === 0 && (
        <p className="mt-2 text-sm text-fg-2">{bt("연결한 팀이 없어 내보낼 구성원·작품이 없습니다. 먼저 위에서 팀을 연결해 주세요.", "No linked teams yet, so there are no members or projects to export. Link a team above first.")}</p>
      )}
      {status && <p role="status" className="mt-3 text-sm">{status}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}

      {verifyError && <p role="alert" className="mt-3 text-sm text-bad">{verifyError}</p>}
      {verification && (
        <div className="mt-4 rounded-lg border border-line p-3" role="status">
          <p className="font-bold">{bt("검증 완료 — 올바른 조직 백업 파일입니다", "Verified — this is a valid organization backup file")}</p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-fg-2">{bt("조직", "Organization")}</dt><dd>{verification.organizationName}</dd></div>
            <div><dt className="text-fg-2">{bt("내보낸 시각", "Exported at")}</dt><dd>{new Date(verification.exportedAt).toLocaleString(bt("ko-KR", "en-US"))}</dd></div>
            <div><dt className="text-fg-2">{bt("포함 항목", "Sections")}</dt><dd>{verification.sections.map((section) => bt(ORGANIZATION_BACKUP_SECTION_LABELS[section].ko, ORGANIZATION_BACKUP_SECTION_LABELS[section].en)).join(" · ")}</dd></div>
            <div>
              <dt className="text-fg-2">{bt("개수", "Counts")}</dt>
              <dd>{bt(`팀 ${verification.counts.teams} · 구성원 ${verification.counts.members} · 작품 ${verification.counts.projects} · 감사 기록 ${verification.counts.auditEntries} · 공지 ${verification.counts.notices}`, `Teams ${verification.counts.teams} · Members ${verification.counts.members} · Projects ${verification.counts.projects} · Audit entries ${verification.counts.auditEntries} · Notices ${verification.counts.notices}`)}</dd>
            </div>
          </dl>
          {verification.missingAuditWorkspaceIds.length > 0 && (
            <p className="mt-2 text-sm text-warn">{bt(`감사 로그가 포함되지 않은 팀이 ${verification.missingAuditWorkspaceIds.length}개 있습니다(권한·오류).`, `${verification.missingAuditWorkspaceIds.length} team(s) have no audit log in this file (permission or error).`)}</p>
          )}
          {verification.truncatedAuditWorkspaceIds.length > 0 && (
            <p className="mt-2 text-sm text-warn">{bt(`감사 로그가 상한까지만 담긴 팀이 ${verification.truncatedAuditWorkspaceIds.length}개 있습니다.`, `${verification.truncatedAuditWorkspaceIds.length} team(s) have a truncated audit log (page limit).`)}</p>
          )}
          <p className="mt-2 text-xs text-fg-3">{bt(`내용 체크섬 ${verification.checksum} — 구조·개수·체크섬이 모두 일치할 때만 이 화면이 표시됩니다.`, `Content checksum ${verification.checksum} — this panel only appears when structure, counts, and checksum all match.`)}</p>
        </div>
      )}
    </div>
  );
}
