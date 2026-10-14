import "../studio-shell/creator-workflow-surfaces.css";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TeamWorkspaceRole, TeamWorkspaceSummary } from "@toonstudio/contracts/production-workspace";
import {
  isOrganizationManager,
  type InvitableOrganizationRole,
  type OrganizationDetail,
  type OrganizationInvitePreview,
  type OrganizationSummary,
} from "@toonstudio/contracts/production-organization";
import { useApp } from "@/shared/lib/store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage } from "@/platform/api";
import { TeamAreaNavigation } from "@/shared/components/TeamAreaNavigation";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listTeamWorkspaces } from "./team-workspace-api";
import {
  acceptOrganizationInvite,
  commandOrganization,
  createOrganization,
  getOrganization,
  listOrganizations,
  previewOrganizationInvite,
} from "./organization-api";
import { organizationDirectory } from "./organization-directory";
import {
  ORGANIZATION_KIND_LABELS,
  ORGANIZATION_ROLE_LABELS,
  organizationRoleCan,
  summarizeOrganizationRollup,
  type LocalOrganizationState,
  type OrganizationAction,
  type OrganizationKind,
  type OrganizationRole,
} from "./organization-model";

const WORKSPACE_ROLE_LABELS: Record<TeamWorkspaceRole, { readonly ko: string; readonly en: string }> = {
  owner: { ko: "소유자", en: "Owner" },
  admin: { ko: "관리자", en: "Admin" },
  member: { ko: "구성원", en: "Member" },
  guest: { ko: "게스트", en: "Guest" },
};

const ACTION_LABELS: Record<OrganizationAction, { readonly ko: string; readonly en: string }> = {
  "edit-profile": { ko: "프로필 편집", en: "Edit profile" },
  "manage-links": { ko: "팀 연결 관리", en: "Manage team links" },
  "post-notice": { ko: "공지 작성", en: "Post notices" },
  "view-rollup": { ko: "조직 현황 열람", en: "View rollup" },
};
const ACTIONS: readonly OrganizationAction[] = ["edit-profile", "manage-links", "post-notice", "view-rollup"];
const ROLES: readonly OrganizationRole[] = ["owner", "admin", "manager", "member", "guest"];
const INVITABLE_ROLES: readonly InvitableOrganizationRole[] = ["admin", "manager", "member", "guest"];

const fieldClass = "min-h-11 rounded-lg border border-line bg-canvas px-3 text-fg";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="creator-workflow-panel rounded-2xl border border-line bg-card p-5"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}

function kindValue(value: string): OrganizationKind {
  return value === "company" || value === "team-circle" ? value : "studio";
}

export function OrganizationHomePage() {
  const userId = useApp((state) => state.userId);
  return <OrganizationConsole key={userId ?? "signed-out"} userId={userId} />;
}

function OrganizationConsole({ userId }: { userId: string | null }) {
  const bt = useBilingual("OrganizationHomePage");
  const [organizations, setOrganizations] = useState<readonly OrganizationSummary[]>([]);
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [workspaces, setWorkspaces] = useState<readonly TeamWorkspaceSummary[]>([]);
  const [legacy, setLegacy] = useState<LocalOrganizationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<OrganizationKind>("studio");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [noticeBody, setNoticeBody] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitableOrganizationRole>("member");
  const [inviteToken, setInviteToken] = useState("");
  const [acceptToken, setAcceptToken] = useState("");
  const [preview, setPreview] = useState<OrganizationInvitePreview | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function selectOrganization(id: string | null) {
    selectedIdRef.current = id;
    setSelectedId(id);
  }

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError("");
    setLegacy(organizationDirectory.load(userId));
    void (async () => {
      try {
        const [orgResult, teamResult] = await Promise.all([listOrganizations(), listTeamWorkspaces()]);
        if (!active) return;
        setOrganizations(orgResult.organizations);
        setWorkspaces(teamResult.workspaces);
        const kept = selectedIdRef.current;
        const targetId = kept && orgResult.organizations.some((org) => org.id === kept)
          ? kept
          : orgResult.organizations[0]?.id ?? null;
        selectOrganization(targetId);
        setDetail(targetId ? await getOrganization(targetId) : null);
      } catch (cause) {
        const message = await getApiErrorMessage(cause, bt("조직 정보를 불러오지 못했습니다.", "Couldn't load organization data."));
        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // 선택 조직은 ref로 유지한다 — 새로고침 때 선택이 풀리지 않게 하기 위해서다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bt, userId, refresh]);

  async function switchOrganization(id: string) {
    selectOrganization(id);
    setEditing(false);
    setPreview(null);
    setLoading(true);
    try {
      setDetail(await getOrganization(id));
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("조직 정보를 불러오지 못했습니다.", "Couldn't load organization data.")));
    } finally {
      setLoading(false);
    }
  }

  async function runMutation(action: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setError("");
    try {
      await action();
      setNotice(successMessage);
      setRefresh((value) => value + 1);
      return true;
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("요청을 처리하지 못했습니다.", "Couldn't process that request.")));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const profile = detail?.organization ?? null;
  const myRole = profile?.role ?? null;
  const canEdit = myRole ? organizationRoleCan(myRole, "edit-profile") : false;
  const canLinks = myRole ? organizationRoleCan(myRole, "manage-links") : false;
  const canNotice = myRole ? organizationRoleCan(myRole, "post-notice") : false;
  const canRollup = myRole ? organizationRoleCan(myRole, "view-rollup") : false;
  const canManageMembers = myRole ? isOrganizationManager(myRole) : false;
  const rollup = detail ? summarizeOrganizationRollup(workspaces, detail.linkedWorkspaceIds) : null;

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (detail && profile) {
      void runMutation(
        () => commandOrganization(profile.id, profile.revision, { type: "update-profile", name: trimmed, kind, description: description.trim() }),
        bt("조직 프로필을 저장했습니다.", "Organization profile saved."),
      ).then((saved) => { if (saved) setEditing(false); });
    } else {
      void runMutation(async () => {
        const created = await createOrganization({ name: trimmed, kind, description: description.trim() });
        selectOrganization(created.organizationId);
      }, bt("조직을 만들었습니다. 아래에서 소속 팀을 연결해 보세요.", "Organization created. Link your teams below."));
    }
  }

  function startEdit() {
    if (!profile) return;
    setName(profile.name); setKind(profile.kind); setDescription(profile.description); setEditing(true);
  }

  function submitNotice(event: FormEvent) {
    event.preventDefault();
    if (!detail || !profile) return;
    const body = noticeBody.trim();
    if (!body || busy) return;
    void runMutation(
      () => commandOrganization(profile.id, profile.revision, { type: "post-notice", body }),
      bt("공지를 등록했습니다.", "Notice posted."),
    ).then((posted) => { if (posted) setNoticeBody(""); });
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const email = inviteEmail.trim();
    if (!email || busy) return;
    setBusy(true); setError("");
    void (async () => {
      try {
        const result = await commandOrganization(profile.id, profile.revision, { type: "invite", email, role: inviteRole });
        setInviteToken(result.token ?? "");
        setInviteEmail("");
        setNotice(bt("초대를 만들었습니다. 아래 토큰을 초대할 분에게 직접 전달해주세요.", "Invite created. Share the token below with the invitee directly."));
        setRefresh((value) => value + 1);
      } catch (cause) {
        setError(await getApiErrorMessage(cause, bt("초대를 만들지 못했습니다.", "Couldn't create the invite.")));
      } finally {
        setBusy(false);
      }
    })();
  }

  async function submitPreview(event: FormEvent) {
    event.preventDefault();
    const token = acceptToken.trim();
    if (!token || busy) return;
    setBusy(true); setError("");
    try {
      setPreview(await previewOrganizationInvite(token));
    } catch (cause) {
      setPreview(null);
      setError(await getApiErrorMessage(cause, bt("사용 가능한 초대가 없습니다. 초대받은 이메일로 로그인해주세요.", "No usable invite. Sign in with the invited email.")));
    } finally {
      setBusy(false);
    }
  }

  async function submitAccept() {
    const token = acceptToken.trim();
    if (!token || busy) return;
    setBusy(true); setError("");
    try {
      const result = await acceptOrganizationInvite(token);
      selectOrganization(result.organizationId);
      setAcceptToken("");
      setPreview(null);
      setNotice(bt("조직에 합류했습니다.", "You've joined the organization."));
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("초대를 수락하지 못했습니다.", "Couldn't accept the invite.")));
    } finally {
      setBusy(false);
    }
  }

  async function importLegacy() {
    if (!legacy?.profile || busy) return;
    setBusy(true); setError("");
    try {
      const created = await createOrganization({ name: legacy.profile.name, kind: legacy.profile.kind, description: legacy.profile.description });
      let revision = created.revision;
      for (const workspaceId of legacy.linkedWorkspaceIds) {
        try {
          const linked = await commandOrganization(created.organizationId, revision, { type: "link-workspace", workspaceId });
          revision = linked.revision;
        } catch {
          // 이미 사라졌거나 권한이 없는 팀 연결은 건너뛴다. 나머지는 그대로 가져온다.
        }
      }
      for (const item of [...legacy.notices].reverse()) {
        try {
          const posted = await commandOrganization(created.organizationId, revision, { type: "post-notice", body: item.body });
          revision = posted.revision;
        } catch {
          break;
        }
      }
      selectOrganization(created.organizationId);
      setNotice(bt("이 기기의 조직을 서버로 가져왔습니다. 이제 모든 기기에서 같은 조직이 보입니다.", "Your on-device organization was imported to the server. It now looks the same on every device."));
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("조직을 가져오지 못했습니다.", "Couldn't import the organization.")));
    } finally {
      setBusy(false);
    }
  }

  const profileForm = (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitProfile}>
      <label className="flex flex-col gap-2 text-sm font-semibold">{bt("조직 이름", "Organization name")}
        <input required maxLength={40} className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder={bt("예: 희준 스튜디오", "e.g. Heejun Studio")} /></label>
      <label className="flex flex-col gap-2 text-sm font-semibold">{bt("조직 종류", "Organization type")}
        <select className={fieldClass} value={kind} onChange={(event) => setKind(kindValue(event.target.value))}>
          {(Object.keys(ORGANIZATION_KIND_LABELS) as OrganizationKind[]).map((value) => (
            <option key={value} value={value}>{bt(ORGANIZATION_KIND_LABELS[value].ko, ORGANIZATION_KIND_LABELS[value].en)}</option>
          ))}
        </select></label>
      <label className="flex flex-col gap-2 text-sm font-semibold sm:col-span-2">{bt("소개", "Description")}
        <textarea maxLength={200} rows={2} className="rounded-lg border border-line bg-canvas px-3 py-2 text-fg" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={bt("어떤 작품을 만드는 조직인지 짧게 적어주세요.", "A short line about what this organization makes.")} /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={!name.trim() || busy} className={buttonClass()}>{profile ? bt("프로필 저장", "Save profile") : bt("조직 만들기", "Create organization")}</button>
        {profile && editing && <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => setEditing(false)}>{bt("취소", "Cancel")}</button>}
      </div>
    </form>
  );

  return (
    <div data-creator-workflow="organization" data-route-ready="organization-home" className="min-h-dvh bg-canvas px-4 py-6 text-fg">
      <div className="mx-auto max-w-6xl space-y-5">
        <TeamAreaNavigation />
        <header className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
          <p className="eyebrow text-accent">ORGANIZATION · 회사·스튜디오</p>
          <h1 className="mt-2 text-2xl font-black">{bt("조직 홈", "Organization home")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {bt("회사·스튜디오 단위로 팀과 작품 현황을 모아 봅니다. 조직은 기존 팀(워크스페이스)을 연결해 묶을 뿐, 팀과 작품의 권한 계약은 그대로 유지됩니다.",
              "See your teams and projects rolled up at company or studio level. An organization only links existing teams (workspaces) — team and project permission contracts stay exactly as they are.")}
          </p>
          <nav aria-label={bt("조직 관련 화면", "Organization screens")} className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link className="underline" to="/team/people">{bt("사람·권한 관리", "People & access")}</Link>
            <Link className="underline" to="/team">{bt("협업 홈", "Collaboration home")}</Link>
          </nav>
        </header>

        {error && (
          <div role="alert" className="rounded-xl border border-bad p-4">
            {error}
            <button type="button" className="ml-3 underline" onClick={() => setRefresh((value) => value + 1)}>{bt("다시 시도", "Retry")}</button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}

        {!userId ? (
          <section aria-labelledby="organization-signed-out-title" className="rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft via-card to-card p-5 sm:p-6">
            <h2 id="organization-signed-out-title" className="text-lg font-black text-fg">{bt("로그인하면 조직을 만들고 팀을 묶을 수 있어요", "Sign in to create an organization and group your teams")}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">{bt("조직은 회사·스튜디오 단위 묶음입니다. 먼저 팀을 만든 뒤 이 화면에서 조직에 연결하세요.", "An organization groups things at company or studio level. Create a team first, then link it here.")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={buttonClass({ className: "min-h-11" })} onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "organization-home", mode: "login" })}>{bt("로그인하고 조직 만들기", "Sign in to create an organization")}</button>
              <Link className={buttonClass({ variant: "outline", className: "min-h-11" })} to="/team/people">{bt("팀 먼저 둘러보기", "Explore teams first")}</Link>
            </div>
          </section>
        ) : (
          <>
            <p className="rounded-xl border border-line bg-raised p-4 text-sm leading-6 text-fg-2">
              {bt("조직 프로필·연결·구성원·공지는 서버에 저장되어 로그인한 모든 기기에서 같은 상태로 보입니다. 조직 역할은 서버가 강제합니다. 조직에 소속돼도 원고 접근 권한은 생기지 않습니다 — 작품 권한은 지금처럼 작품별로 부여합니다.",
                "The organization profile, links, members, and notices live on the server, so they look the same on every signed-in device. Organization roles are enforced by the server. Belonging to an organization never grants manuscript access — project permissions are still granted per project, as today.")}
            </p>

            {loading && <p role="status">{bt("조직 정보를 불러오는 중입니다.", "Loading organization…")}</p>}

            {organizations.length > 1 && (
              <Card title={bt("소속 조직", "Your organizations")}>
                <ul className="flex flex-wrap gap-2">
                  {organizations.map((org) => (
                    <li key={org.id}>
                      <button type="button" aria-pressed={org.id === selectedId} className={buttonClass({ variant: org.id === selectedId ? "solid" : "outline", size: "sm" })} onClick={() => void switchOrganization(org.id)}>
                        {org.name} · {bt(ORGANIZATION_ROLE_LABELS[org.role].ko, ORGANIZATION_ROLE_LABELS[org.role].en)}
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {!detail && organizations.length === 0 && legacy?.profile && (
              <Card title={bt("이 기기의 조직 가져오기", "Import the organization on this device")}>
                <p className="text-sm leading-6 text-fg-2">{bt(`이 기기에만 저장된 조직 "${legacy.profile.name}"이(가) 있습니다. 서버로 가져오면 구성원 초대와 다기기 동기화가 열립니다.`, `An organization "${legacy.profile.name}" is stored only on this device. Import it to the server to unlock member invites and cross-device sync.`)}</p>
                <button type="button" disabled={busy} className={`${buttonClass()} mt-4`} onClick={() => void importLegacy()}>{bt("서버로 가져오기", "Import to server")}</button>
              </Card>
            )}

            <Card title={bt("조직 프로필", "Organization profile")}>
              {profile && !editing ? (
                <div>
                  <p className="text-xl font-black">{profile.name}</p>
                  <p className="mt-1 text-sm text-fg-2">{bt(ORGANIZATION_KIND_LABELS[profile.kind].ko, ORGANIZATION_KIND_LABELS[profile.kind].en)}{myRole && <> · {bt("내 역할", "Your role")}: {bt(ORGANIZATION_ROLE_LABELS[myRole].ko, ORGANIZATION_ROLE_LABELS[myRole].en)}</>}</p>
                  {profile.description && <p className="mt-2 text-sm leading-6 text-fg-2">{profile.description}</p>}
                  {canEdit && <button type="button" className={`${buttonClass({ variant: "outline" })} mt-4`} onClick={startEdit}>{bt("프로필 편집", "Edit profile")}</button>}
                </div>
              ) : (
                <>
                  {!profile && !loading && <p className="mb-4 text-sm leading-6 text-fg-2">{bt("아직 만든 조직이 없습니다. 회사·스튜디오 이름으로 조직을 만들면 소속 팀을 한곳에 묶을 수 있습니다.", "No organization yet. Create one under your company or studio name to group your teams in one place.")}</p>}
                  {!loading && (!profile || canEdit) && profileForm}
                </>
              )}
            </Card>

            {profile && rollup && canRollup && (
              <Card title={bt("조직 현황", "Organization rollup")}>
                <dl className="grid gap-3 sm:grid-cols-4">
                  <div><dt className="text-sm text-fg-2">{bt("연결한 팀", "Linked teams")}</dt><dd className="mt-1 text-xl font-black">{rollup.teams.length}</dd></div>
                  <div><dt className="text-sm text-fg-2">{bt("연결 작품", "Linked projects")}</dt><dd className="mt-1 text-xl font-black">{rollup.projectCount}</dd></div>
                  <div><dt className="text-sm text-fg-2">{bt("팀별 구성원 합", "Members across teams")}</dt><dd className="mt-1 text-xl font-black">{rollup.memberSlotCount}</dd></div>
                  <div><dt className="text-sm text-fg-2">{bt("대기 초대", "Pending invites")}</dt><dd className="mt-1 text-xl font-black">{rollup.pendingInvites}</dd></div>
                </dl>
                <p className="mt-3 text-xs leading-6 text-fg-3">{bt("수치는 연결한 팀이 서버에 보고하는 카운터의 합입니다. 구성원 수는 팀별 합계라 같은 사람이 여러 팀에 있으면 중복 계산됩니다.", "Figures are sums of the counters your linked teams report to the server. Member counts are per-team sums, so a person in several teams is counted more than once.")}</p>
                {rollup.missingCount > 0 && <p className="mt-2 text-sm text-warn">{bt(`연결 목록 중 ${rollup.missingCount}개 팀은 현재 팀 목록에서 확인할 수 없어 합산에서 제외했습니다. 나갔거나 삭제된 팀일 수 있습니다.`, `${rollup.missingCount} linked team(s) aren't in your current team list and were left out of the totals. They may be teams you left or that were deleted.`)}</p>}
              </Card>
            )}

            {detail && canRollup && (
              <Card title={bt("팀 연결", "Link teams")}>
                {workspaces.length === 0 && !loading && (
                  <p className="text-sm leading-6 text-fg-2">{bt("아직 참여한 팀이 없습니다. 팀을 만들거나 초대를 수락하면 여기서 조직에 연결할 수 있습니다.", "No teams yet. Create a team or accept an invite, then link it to this organization here.")} <Link className="underline" to="/team/people">{bt("팀 관리로 이동", "Go to team management")}</Link></p>
                )}
                <ul className="space-y-3">
                  {workspaces.map((workspace) => {
                    const linked = detail.linkedWorkspaceIds.includes(workspace.id);
                    return (
                      <li key={workspace.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                        <strong className="mr-auto">{workspace.name}</strong>
                        <span className="text-sm text-fg-2">{bt(WORKSPACE_ROLE_LABELS[workspace.role].ko, WORKSPACE_ROLE_LABELS[workspace.role].en)} · {bt(`작품 ${workspace.projectCount}개 · 구성원 ${workspace.memberCount}명`, `${workspace.projectCount} projects · ${workspace.memberCount} members`)}</span>
                        <Link className="underline" to={`/team/people/${workspace.id}`}>{bt("팀 열기", "Open team")}</Link>
                        <button
                          type="button"
                          aria-pressed={linked}
                          disabled={!canLinks || busy}
                          className={buttonClass({ variant: linked ? "outline" : "solid", size: "sm" })}
                          onClick={() => void runMutation(
                            () => commandOrganization(detail.organization.id, detail.organization.revision, { type: linked ? "unlink-workspace" : "link-workspace", workspaceId: workspace.id }),
                            linked ? bt("팀 연결을 해제했습니다.", "Team unlinked.") : bt("팀을 조직에 연결했습니다.", "Team linked to the organization."),
                          )}
                        >
                          {linked ? bt("연결 해제", "Unlink") : bt("조직에 연결", "Link to organization")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs leading-6 text-fg-3">{bt("연결은 조직 홈의 모아보기 범위만 정합니다. 팀의 소유자·구성원·작품 권한은 바뀌지 않습니다.", "Linking only sets what this organization home rolls up. Team ownership, members, and project permissions don't change.")}</p>
              </Card>
            )}

            {detail && myRole !== "guest" && (
              <Card title={bt("조직 구성원", "Organization members")}>
                <ul className="space-y-3">
                  {detail.members.map((member) => (
                    <li key={member.userId} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                      <strong className="mr-auto">{member.displayName}{member.userId === userId && <span className="ml-2 text-xs text-fg-3">{bt("(나)", "(you)")}</span>}</strong>
                      <span className="text-sm text-fg-2">{bt(ORGANIZATION_ROLE_LABELS[member.role].ko, ORGANIZATION_ROLE_LABELS[member.role].en)}</span>
                      {canManageMembers && member.role !== "owner" && (
                        <>
                          <label className="sr-only" htmlFor={`org-role-${member.userId}`}>{bt("역할 변경", "Change role")}</label>
                          <select
                            id={`org-role-${member.userId}`}
                            className="min-h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-fg"
                            value={member.role}
                            disabled={busy}
                            onChange={(event) => void runMutation(
                              () => commandOrganization(detail.organization.id, detail.organization.revision, { type: "change-member-role", userId: member.userId, role: event.target.value as InvitableOrganizationRole }),
                              bt("구성원 역할을 바꿨습니다.", "Member role updated."),
                            )}
                          >
                            {INVITABLE_ROLES.map((role) => (
                              <option key={role} value={role}>{bt(ORGANIZATION_ROLE_LABELS[role].ko, ORGANIZATION_ROLE_LABELS[role].en)}</option>
                            ))}
                          </select>
                          <button type="button" disabled={busy} className="underline" onClick={() => void runMutation(
                            () => commandOrganization(detail.organization.id, detail.organization.revision, { type: "remove-member", userId: member.userId }),
                            bt("구성원을 내보냈습니다.", "Member removed."),
                          )}>{bt("내보내기", "Remove")}</button>
                          {myRole === "owner" && (
                            <button type="button" disabled={busy} className="underline" onClick={() => {
                              if (!window.confirm(bt("대표 권한을 이 구성원에게 이전합니다. 회원님은 운영 관리자가 됩니다.", "Transfer the owner role to this member? You will become an admin."))) return;
                              void runMutation(
                                () => commandOrganization(detail.organization.id, detail.organization.revision, { type: "transfer-owner", userId: member.userId }),
                                bt("대표 권한을 이전했습니다.", "Ownership transferred."),
                              );
                            }}>{bt("대표로 이전", "Make owner")}</button>
                          )}
                        </>
                      )}
                      {member.userId === userId && member.role !== "owner" && (
                        <button type="button" disabled={busy} className="underline" onClick={() => void runMutation(
                          () => commandOrganization(detail.organization.id, detail.organization.revision, { type: "remove-member", userId: member.userId }),
                          bt("조직에서 나갔습니다.", "You left the organization."),
                        )}>{bt("나가기", "Leave")}</button>
                      )}
                    </li>
                  ))}
                </ul>

                {canManageMembers && (
                  <>
                    <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={submitInvite}>
                      <label className="flex flex-col gap-2 text-sm font-semibold">{bt("이메일로 초대", "Invite by email")}
                        <input type="email" required maxLength={320} className={fieldClass} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" /></label>
                      <label className="flex flex-col gap-2 text-sm font-semibold">{bt("부여할 역할", "Role to grant")}
                        <select className={fieldClass} value={inviteRole} onChange={(event) => setInviteRole(event.target.value as InvitableOrganizationRole)}>
                          {INVITABLE_ROLES.map((role) => (
                            <option key={role} value={role} disabled={role === "admin" && myRole !== "owner"}>{bt(ORGANIZATION_ROLE_LABELS[role].ko, ORGANIZATION_ROLE_LABELS[role].en)}</option>
                          ))}
                        </select></label>
                      <button type="submit" disabled={!inviteEmail.trim() || busy} className={`${buttonClass()} self-end`}>{bt("초대 만들기", "Create invite")}</button>
                    </form>
                    {inviteToken && (
                      <div className="mt-3 rounded-lg border border-line p-3">
                        <p className="text-sm font-semibold">{bt("초대 토큰 (한 번만 표시됩니다)", "Invite token (shown once)")}</p>
                        <code className="mt-1 block break-all text-sm">{inviteToken}</code>
                        <p className="mt-1 text-xs leading-6 text-fg-3">{bt("초대할 분에게 이 토큰을 직접 전달하세요. 받은 분은 이 화면 아래 '초대 수락'에서 토큰을 붙여 넣어 합류합니다. 토큰은 7일 동안 유효합니다.", "Share this token with the invitee directly. They paste it into “Accept an invite” below to join. The token is valid for 7 days.")}</p>
                      </div>
                    )}
                    {detail.invites.length > 0 && (
                      <ul className="mt-4 space-y-2">
                        {detail.invites.map((invite) => (
                          <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 text-sm">
                            <span className="mr-auto">{invite.email} · {bt(ORGANIZATION_ROLE_LABELS[invite.role].ko, ORGANIZATION_ROLE_LABELS[invite.role].en)}</span>
                            <span className="text-fg-3">{new Date(invite.expiresAt).toLocaleDateString(bt("ko-KR", "en-US"))} {bt("만료", "expires")}</span>
                            <button type="button" disabled={busy} className="underline" onClick={() => void runMutation(
                              () => commandOrganization(detail.organization.id, detail.organization.revision, { type: "revoke-invite", invitationId: invite.id }),
                              bt("초대를 취소했습니다.", "Invite revoked."),
                            )}>{bt("초대 취소", "Revoke")}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Card>
            )}

            <Card title={bt("초대 수락", "Accept an invite")}>
              <form className="flex flex-col gap-3" onSubmit={submitPreview}>
                <label className="flex flex-col gap-2 text-sm font-semibold">{bt("초대 토큰", "Invite token")}
                  <input maxLength={43} className={fieldClass} value={acceptToken} onChange={(event) => { setAcceptToken(event.target.value); setPreview(null); }} placeholder={bt("전달받은 토큰을 붙여 넣으세요", "Paste the token you received")} /></label>
                <button type="submit" disabled={acceptToken.trim().length !== 43 || busy} className={`${buttonClass({ variant: "outline" })} self-start`}>{bt("초대 확인", "Check invite")}</button>
              </form>
              {preview && (
                <div className="mt-4 rounded-lg border border-line p-3 text-sm leading-6">
                  <p><strong>{preview.organizationName}</strong> · {bt(ORGANIZATION_KIND_LABELS[preview.kind].ko, ORGANIZATION_KIND_LABELS[preview.kind].en)}</p>
                  <p className="text-fg-2">{bt(`부여 역할: ${ORGANIZATION_ROLE_LABELS[preview.role].ko} · 초대한 사람: ${preview.inviterName} · 만료: ${new Date(preview.expiresAt).toLocaleDateString(bt("ko-KR", "en-US"))}`, `Role: ${ORGANIZATION_ROLE_LABELS[preview.role].en} · Invited by: ${preview.inviterName} · Expires: ${new Date(preview.expiresAt).toLocaleDateString("en-US")}`)}</p>
                  {preview.alreadyMember
                    ? <p className="mt-2 text-fg-2">{bt("이미 이 조직의 구성원입니다.", "You are already a member of this organization.")}</p>
                    : <button type="button" disabled={busy} className={`${buttonClass()} mt-2`} onClick={() => void submitAccept()}>{bt("초대 수락하고 합류", "Accept and join")}</button>}
                </div>
              )}
            </Card>

            <Card title={bt("조직 역할", "Organization roles")}>
              <ul className="space-y-3">
                {ROLES.map((role) => (
                  <li key={role} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                    <strong className="mr-auto">{bt(ORGANIZATION_ROLE_LABELS[role].ko, ORGANIZATION_ROLE_LABELS[role].en)}</strong>
                    {ACTIONS.map((action) => (
                      <span key={action} className={`rounded-full border px-2 py-1 text-xs ${organizationRoleCan(role, action) ? "border-accent/45 bg-accent-soft text-fg" : "border-line text-fg-3"}`}>
                        {bt(ACTION_LABELS[action].ko, ACTION_LABELS[action].en)}{organizationRoleCan(role, action) ? "" : bt(" 불가", " — no")}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-6 text-fg-3">{bt("조직 역할은 조직 화면(프로필·연결·공지·현황)에 대한 권한일 뿐 워크스페이스·작품 접근권이 아닙니다. 구성원 초대·역할 변경은 서버가 같은 역할 표로 강제합니다. 직군 프리셋은 사용성 설정이며 이 권한 체계와 무관합니다.", "Organization roles govern organization surfaces (profile, links, notices, rollup) only — they are not workspace or project access rights. Member invites and role changes are enforced by the server with this same role table. Role presets for jobs are usability settings and are unrelated to this permission model.")}</p>
            </Card>

            {profile && detail && canRollup && (
              <Card title={bt("조직 공지", "Organization notices")}>
                {canNotice && (
                  <form className="flex flex-col gap-3" onSubmit={submitNotice}>
                    <label className="flex flex-col gap-2 text-sm font-semibold">{bt("새 공지", "New notice")}
                      <textarea maxLength={300} rows={2} className="rounded-lg border border-line bg-canvas px-3 py-2 text-fg" value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} placeholder={bt("예: 다음 주 월요일 전체 회의", "e.g. All-hands next Monday")} /></label>
                    <button type="submit" disabled={!noticeBody.trim() || busy} className={`${buttonClass()} self-start`}>{bt("공지 등록", "Post notice")}</button>
                  </form>
                )}
                {detail.notices.length === 0
                  ? <p className="mt-4 text-sm text-fg-2">{bt("아직 등록한 공지가 없습니다.", "No notices yet.")}</p>
                  : <ul className="mt-4 space-y-2">{detail.notices.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-line p-3">
                      <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6">{item.body}</p>
                      <span className="text-xs text-fg-3">{item.authorName} · {new Date(item.createdAt).toLocaleDateString(bt("ko-KR", "en-US"))}</span>
                      {canNotice && <button type="button" disabled={busy} className="underline" onClick={() => void runMutation(
                        () => commandOrganization(detail.organization.id, detail.organization.revision, { type: "delete-notice", noticeId: item.id }),
                        bt("공지를 삭제했습니다.", "Notice deleted."),
                      )}>{bt("삭제", "Delete")}</button>}
                    </li>
                  ))}</ul>}
                <p className="mt-3 text-xs leading-6 text-fg-3">{bt("공지는 서버에 저장되어 조직 구성원 모두에게 같은 내용으로 보입니다.", "Notices are stored on the server and shown identically to every organization member.")}</p>
              </Card>
            )}

            <Card title={bt("서버 계약이 필요한 조직 기능", "Organization features that need a server contract")}>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-fg-2">
                <li>{bt("조직 포인트 풀 — 포인트 원장이 개인 단위라 조직 지갑과 배분은 서버 원장이 필요합니다. 현금 결제·충전은 만들지 않습니다.", "Organization point pool — the point ledger is per-person today, so an organization wallet and distribution need a server ledger. No cash payments or top-ups will be added.")}</li>
                <li>{bt("조직 공용 라이브러리 — 스튜디오 공용 에셋·폰트·템플릿은 라이브러리 스코프 계약이 필요합니다.", "Shared organization library — studio-wide assets, fonts, and templates need a library scope contract.")}</li>
                <li>{bt("조직 사용량 정책 — 현재 무료 한도는 워크스페이스 단위 정책이라 조직 단위 합산 한도는 서버 정책 확장이 필요합니다.", "Organization usage policy — current free limits are per-workspace, so organization-level limits need a server policy extension.")}</li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
