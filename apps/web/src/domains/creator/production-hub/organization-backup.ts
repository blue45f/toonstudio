import type { TeamWorkspaceDetail } from "@toonstudio/contracts/production-workspace";
import type { OrganizationNotice, OrganizationProfile } from "./organization-model";

/**
 * 조직 단위 데이터 내보내기/백업 모델.
 *
 * 개인 서재 백업(library-backup.ts)이 독서 데이터만 다루던 자리를 조직 단위로 넓힌다.
 * - 담는 것: 조직 설정(프로필·공지·연결 팀), 연결 팀의 구성원 명단, 작품 목록, 팀 감사 로그.
 * - 담지 않는 것: 원고·이미지 같은 작품 본문, 초대 토큰, 이메일 주소. 백업 파일은
 *   "조직이 무엇으로 이뤄졌는지"를 다른 환경에서 검증하기 위한 명부이며 접근 수단이 아니다.
 * - 감사 로그는 팀 관리자만 읽을 수 있는 서버 기록이라, 읽지 못한 팀은 조용히 빠지지 않고
 *   coverage.missingAuditWorkspaceIds에 이름으로 남긴다. 0으로 위장하지 않는 기존 원칙과 같다.
 * - 파일에는 내용 체크섬(FNV-1a)이 들어가고, parseOrganizationBackup이 구조·개수·체크섬을
 *   다시 계산해 대조한다. 검증에 실패한 파일은 어떤 상태도 만들지 않는다(전량 거부).
 */

export type OrganizationBackupSection = "settings" | "members" | "projects" | "audit";

export const ORGANIZATION_BACKUP_SECTIONS: readonly OrganizationBackupSection[] = [
  "settings",
  "members",
  "projects",
  "audit",
];

export const ORGANIZATION_BACKUP_SECTION_LABELS: Record<
  OrganizationBackupSection,
  { readonly ko: string; readonly en: string }
> = {
  settings: { ko: "조직 설정", en: "Organization settings" },
  members: { ko: "구성원 명단", en: "Member roster" },
  projects: { ko: "작품 목록", en: "Project list" },
  audit: { ko: "감사 로그", en: "Audit log" },
};

export const ORGANIZATION_BACKUP_APP = "toonstudio-organization";
export const ORGANIZATION_BACKUP_VERSION = 1;
export const MAX_ORGANIZATION_BACKUP_BYTES = 10 * 1024 * 1024;
/** 팀당 감사 로그 상한. 패널이 페이지네이션으로 이만큼까지만 모으고, 넘으면 truncated로 남긴다. */
export const ORGANIZATION_BACKUP_AUDIT_PAGE_LIMIT = 500;

export interface OrganizationBackupSettings {
  readonly profile: OrganizationProfile;
  readonly notices: readonly OrganizationNotice[];
  readonly linkedWorkspaceIds: readonly string[];
}

export interface OrganizationBackupMember {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly userId: string;
  readonly displayName: string;
  readonly role: string;
  readonly joinedAt: string;
}

export interface OrganizationBackupProject {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly id: string;
  readonly workId: string;
  readonly title: string;
}

/** 감사 항목은 계약 타입에 묶지 않는 구조적 스냅샷이다. action은 서버 기록 코드를 그대로 둔다. */
export interface OrganizationBackupAuditEntry {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly id: number;
  readonly actorUserId: string;
  readonly actorDisplayName: string;
  readonly action: string;
  readonly targetId: string;
  readonly targetDisplayName: string | null;
  readonly revision: number;
  readonly occurredAt: string;
}

export interface OrganizationBackupTeamSource {
  readonly detail: TeamWorkspaceDetail;
  /** 감사 로그를 읽었으면 항목 배열, 읽지 못했으면(권한·오류) undefined. */
  readonly auditEntries?: readonly Omit<OrganizationBackupAuditEntry, "workspaceId" | "workspaceName">[];
  /** 상한에 걸려 감사 로그 일부만 담겼는지. */
  readonly auditTruncated?: boolean;
}

export interface OrganizationBackupSource {
  readonly profile: OrganizationProfile;
  readonly notices: readonly OrganizationNotice[];
  readonly linkedWorkspaceIds: readonly string[];
  readonly teams: readonly OrganizationBackupTeamSource[];
}

export interface OrganizationBackupCounts {
  readonly teams: number;
  readonly members: number;
  readonly projects: number;
  readonly auditEntries: number;
  readonly notices: number;
}

export interface OrganizationBackup {
  readonly _app: typeof ORGANIZATION_BACKUP_APP;
  readonly version: typeof ORGANIZATION_BACKUP_VERSION;
  readonly exportedAt: string;
  readonly organization: { readonly id: string; readonly name: string };
  readonly sections: readonly OrganizationBackupSection[];
  readonly counts: OrganizationBackupCounts;
  readonly coverage: {
    /** 감사 로그를 읽지 못한 연결 팀 id. 빈 배열이면 전 팀 감사 로그를 담았다는 뜻이다. */
    readonly missingAuditWorkspaceIds: readonly string[];
    /** 감사 로그가 상한에 걸려 일부만 담긴 팀 id. */
    readonly truncatedAuditWorkspaceIds: readonly string[];
  };
  /** sections에 고른 항목만 키가 생긴다. 고르지 않은 구역은 파일에 아예 없다. */
  readonly data: {
    readonly settings?: OrganizationBackupSettings;
    readonly members?: readonly OrganizationBackupMember[];
    readonly projects?: readonly OrganizationBackupProject[];
    readonly audit?: readonly OrganizationBackupAuditEntry[];
  };
  /** data만의 체크섬. 검증 시 같은 방식으로 다시 계산해 대조한다. */
  readonly checksum: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** FNV-1a 32비트. 암호학적 용도가 아니라 전송·복사 중 내용 변형 탐지용이다. */
export function organizationBackupChecksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalDataText(data: OrganizationBackup["data"]): string {
  return JSON.stringify(data);
}

export function buildOrganizationBackup(
  source: OrganizationBackupSource,
  sections: readonly OrganizationBackupSection[],
  exportedAt: Date,
): OrganizationBackup {
  const selected = ORGANIZATION_BACKUP_SECTIONS.filter((section) => sections.includes(section));
  const teams = [...source.teams].sort(
    (a, b) => compareText(a.detail.workspace.name, b.detail.workspace.name) || compareText(a.detail.workspace.id, b.detail.workspace.id),
  );

  const members: OrganizationBackupMember[] = teams.flatMap((team) =>
    [...team.detail.members]
      .sort((a, b) => compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId))
      .map((member) => ({
        workspaceId: team.detail.workspace.id,
        workspaceName: team.detail.workspace.name,
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
  );
  const projects: OrganizationBackupProject[] = teams.flatMap((team) =>
    [...team.detail.projects]
      .sort((a, b) => compareText(a.title, b.title) || compareText(a.id, b.id))
      .map((project) => ({
        workspaceId: team.detail.workspace.id,
        workspaceName: team.detail.workspace.name,
        id: project.id,
        workId: project.workId,
        title: project.title,
      })),
  );
  const audit: OrganizationBackupAuditEntry[] = teams
    .flatMap((team) =>
      (team.auditEntries ?? []).map((entry) => ({
        // 필드 순서는 검증 파서의 재생성 순서와 같아야 체크섬이 일치한다. 스프레드로 덧붙이지 않는다.
        workspaceId: team.detail.workspace.id,
        workspaceName: team.detail.workspace.name,
        id: entry.id,
        actorUserId: entry.actorUserId,
        actorDisplayName: entry.actorDisplayName,
        action: entry.action,
        targetId: entry.targetId,
        targetDisplayName: entry.targetDisplayName,
        revision: entry.revision,
        occurredAt: entry.occurredAt,
      })),
    )
    .sort((a, b) => compareText(b.occurredAt, a.occurredAt) || b.id - a.id);

  const data: OrganizationBackup["data"] = {
    ...(selected.includes("settings")
      ? {
          settings: {
            profile: source.profile,
            notices: [...source.notices],
            linkedWorkspaceIds: [...source.linkedWorkspaceIds],
          },
        }
      : {}),
    ...(selected.includes("members") ? { members } : {}),
    ...(selected.includes("projects") ? { projects } : {}),
    ...(selected.includes("audit") ? { audit } : {}),
  };

  return {
    _app: ORGANIZATION_BACKUP_APP,
    version: ORGANIZATION_BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    organization: { id: source.profile.id, name: source.profile.name },
    sections: selected,
    counts: {
      teams: teams.length,
      members: selected.includes("members") ? members.length : 0,
      projects: selected.includes("projects") ? projects.length : 0,
      auditEntries: selected.includes("audit") ? audit.length : 0,
      notices: selected.includes("settings") ? source.notices.length : 0,
    },
    coverage: {
      missingAuditWorkspaceIds: selected.includes("audit")
        ? teams.filter((team) => team.auditEntries === undefined).map((team) => team.detail.workspace.id)
        : [],
      truncatedAuditWorkspaceIds: selected.includes("audit")
        ? teams.filter((team) => team.auditTruncated).map((team) => team.detail.workspace.id)
        : [],
    },
    data,
    checksum: organizationBackupChecksum(canonicalDataText(data)),
  };
}

export function serializeOrganizationBackup(backup: OrganizationBackup): string {
  return JSON.stringify(backup, null, 2);
}

/** 파일명용 조직 이름 조각. 파일 시스템에서 안전한 문자만 남기고 길이를 자른다. */
export function organizationBackupFileName(backup: OrganizationBackup, exportedAt: Date): string {
  const slug = backup.organization.name
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const day = exportedAt.toISOString().slice(0, 10);
  return `toonstudio-organization-backup${slug ? `-${slug}` : ""}-${day}.json`;
}

// ── 검증(다른 환경에서 백업 파일 열기) ─────────────────────────────────────

export interface OrganizationBackupVerification {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly exportedAt: string;
  readonly sections: readonly OrganizationBackupSection[];
  readonly counts: OrganizationBackupCounts;
  readonly missingAuditWorkspaceIds: readonly string[];
  readonly truncatedAuditWorkspaceIds: readonly string[];
  readonly checksum: string;
}

const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);

function invalid(): never {
  throw new Error("Invalid ToonStudio organization backup");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return invalid();
  return value;
}

function readText(value: unknown, maximum = 512): string {
  if (typeof value !== "string" || value.length > maximum) return invalid();
  return value;
}

function readIdentity(value: unknown): string {
  const result = readText(value);
  if (!result.trim() || unsafeKeys.has(result)) return invalid();
  return result;
}

function readCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return invalid();
  return value;
}

function readArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return invalid();
  return value;
}

function readSections(value: unknown): OrganizationBackupSection[] {
  const items = readArray(value, ORGANIZATION_BACKUP_SECTIONS.length);
  const sections = items.map((item) => {
    if (!ORGANIZATION_BACKUP_SECTIONS.includes(item as OrganizationBackupSection)) return invalid();
    return item as OrganizationBackupSection;
  });
  if (new Set(sections).size !== sections.length) return invalid();
  return sections;
}

function readCounts(value: unknown): OrganizationBackupCounts {
  const record = readRecord(value);
  return {
    teams: readCount(record.teams),
    members: readCount(record.members),
    projects: readCount(record.projects),
    auditEntries: readCount(record.auditEntries),
    notices: readCount(record.notices),
  };
}

function readSettings(value: unknown): OrganizationBackupSettings {
  const record = readRecord(value);
  const profile = readRecord(record.profile);
  const notices = readArray(record.notices, 100_000).map((item) => {
    const notice = readRecord(item);
    return { id: readIdentity(notice.id), body: readText(notice.body, 100_000), createdAt: readText(notice.createdAt, 64) };
  });
  return {
    profile: {
      id: readIdentity(profile.id),
      name: readText(profile.name, 1_000),
      kind: profile.kind === "company" || profile.kind === "team-circle" ? profile.kind : "studio",
      description: readText(profile.description, 100_000),
      ownerUserId: readIdentity(profile.ownerUserId),
      createdAt: readText(profile.createdAt, 64),
      updatedAt: readText(profile.updatedAt, 64),
    },
    notices,
    linkedWorkspaceIds: readArray(record.linkedWorkspaceIds, 100_000).map(readIdentity),
  };
}

function readMembers(value: unknown): OrganizationBackupMember[] {
  return readArray(value, 1_000_000).map((item) => {
    const member = readRecord(item);
    return {
      workspaceId: readIdentity(member.workspaceId),
      workspaceName: readText(member.workspaceName, 1_000),
      userId: readIdentity(member.userId),
      displayName: readText(member.displayName, 1_000),
      role: readText(member.role, 64),
      joinedAt: readText(member.joinedAt, 64),
    };
  });
}

function readProjects(value: unknown): OrganizationBackupProject[] {
  return readArray(value, 1_000_000).map((item) => {
    const project = readRecord(item);
    return {
      workspaceId: readIdentity(project.workspaceId),
      workspaceName: readText(project.workspaceName, 1_000),
      id: readIdentity(project.id),
      workId: readIdentity(project.workId),
      title: readText(project.title, 1_000),
    };
  });
}

function readAudit(value: unknown): OrganizationBackupAuditEntry[] {
  return readArray(value, 1_000_000).map((item) => {
    const entry = readRecord(item);
    return {
      workspaceId: readIdentity(entry.workspaceId),
      workspaceName: readText(entry.workspaceName, 1_000),
      id: readCount(entry.id),
      actorUserId: readIdentity(entry.actorUserId),
      actorDisplayName: readText(entry.actorDisplayName, 1_000),
      action: readText(entry.action, 128),
      targetId: readText(entry.targetId),
      targetDisplayName: entry.targetDisplayName === null ? null : readText(entry.targetDisplayName, 1_000),
      revision: readCount(entry.revision),
      occurredAt: readText(entry.occurredAt, 64),
    };
  });
}

/**
 * 백업 파일을 검증하고 요약만 돌려준다. library-backup과 같은 원칙:
 * 전체를 먼저 검증하고, 하나라도 어긋나면(구조·개수·체크섬) 전량 거부한다.
 * 돌려주는 것은 요약뿐이라 검증만으로 조직 상태가 복원·변경되지 않는다.
 */
export function parseOrganizationBackup(source: string): OrganizationBackupVerification {
  if (new TextEncoder().encode(source).byteLength > MAX_ORGANIZATION_BACKUP_BYTES) return invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(source, (property: string, value: unknown) => {
      if (unsafeKeys.has(property)) throw new Error("unsafe-backup-key");
      return value;
    });
  } catch {
    return invalid();
  }
  const root = readRecord(parsed);
  if (root._app !== ORGANIZATION_BACKUP_APP || root.version !== ORGANIZATION_BACKUP_VERSION) return invalid();

  const exportedAt = readText(root.exportedAt, 64);
  if (!Number.isFinite(Date.parse(exportedAt))) return invalid();
  const organization = readRecord(root.organization);
  const organizationId = readIdentity(organization.id);
  const organizationName = readText(organization.name, 1_000);
  const sections = readSections(root.sections);
  const counts = readCounts(root.counts);
  const coverage = readRecord(root.coverage);
  const missingAuditWorkspaceIds = readArray(coverage.missingAuditWorkspaceIds, 100_000).map(readIdentity);
  const truncatedAuditWorkspaceIds = readArray(coverage.truncatedAuditWorkspaceIds, 100_000).map(readIdentity);
  const checksum = readText(root.checksum, 16);

  const rawData = readRecord(root.data);
  const data: OrganizationBackup["data"] = {
    ...(sections.includes("settings") ? { settings: readSettings(rawData.settings) } : {}),
    ...(sections.includes("members") ? { members: readMembers(rawData.members) } : {}),
    ...(sections.includes("projects") ? { projects: readProjects(rawData.projects) } : {}),
    ...(sections.includes("audit") ? { audit: readAudit(rawData.audit) } : {}),
  };
  // 고르지 않은 구역이 파일에 끼어 있으면 거부한다 — 내보낸 사람이 약속한 범위가 정본이다.
  for (const key of Object.keys(rawData)) {
    if (!sections.includes(key as OrganizationBackupSection)) return invalid();
  }
  if (data.settings && data.settings.profile.id !== organizationId) return invalid();
  const actual: OrganizationBackupCounts = {
    teams: new Set([
      ...(data.members ?? []).map((member) => member.workspaceId),
      ...(data.projects ?? []).map((project) => project.workspaceId),
      ...(data.audit ?? []).map((entry) => entry.workspaceId),
      ...(data.settings?.linkedWorkspaceIds ?? []),
    ]).size,
    members: data.members?.length ?? 0,
    projects: data.projects?.length ?? 0,
    auditEntries: data.audit?.length ?? 0,
    notices: data.settings?.notices.length ?? 0,
  };
  // teams 개수는 데이터에서 재계산할 수 있는 하한과 비교한다: 연결 팀이 전부 비어 있으면
  // 데이터만으로 셀 수 없으므로, counts.teams가 재계산값보다 작은 경우만 모순으로 본다.
  if (
    counts.members !== actual.members ||
    counts.projects !== actual.projects ||
    counts.auditEntries !== actual.auditEntries ||
    counts.notices !== actual.notices ||
    counts.teams < actual.teams
  ) {
    return invalid();
  }
  if (organizationBackupChecksum(canonicalDataText(data)) !== checksum) return invalid();

  return {
    organizationId,
    organizationName,
    exportedAt,
    sections,
    counts,
    missingAuditWorkspaceIds,
    truncatedAuditWorkspaceIds,
    checksum,
  };
}
