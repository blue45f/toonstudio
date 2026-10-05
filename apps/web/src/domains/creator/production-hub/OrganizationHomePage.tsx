import "../studio-shell/creator-workflow-surfaces.css";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TeamWorkspaceRole, TeamWorkspaceSummary } from "@toonstudio/contracts/production-workspace";
import { useApp } from "@/shared/lib/store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage } from "@/platform/api";
import { TeamAreaNavigation } from "@/shared/components/TeamAreaNavigation";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listTeamWorkspaces } from "./team-workspace-api";
import { organizationDirectory } from "./organization-directory";
import {
  ORGANIZATION_KIND_LABELS,
  ORGANIZATION_ROLE_LABELS,
  createOrganizationProfile,
  organizationRoleCan,
  summarizeOrganizationRollup,
  toggleLinkedWorkspace,
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
  const [local, setLocal] = useState<LocalOrganizationState | null>(null);
  const [workspaces, setWorkspaces] = useState<readonly TeamWorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<OrganizationKind>("studio");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [noticeBody, setNoticeBody] = useState("");

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError("");
    setLocal(organizationDirectory.load(userId));
    void listTeamWorkspaces()
      .then((result) => { if (active) setWorkspaces(result.workspaces); })
      .catch(async (cause: unknown) => {
        const message = await getApiErrorMessage(cause, bt("팀 목록을 불러오지 못했습니다.", "Couldn't load your teams."));
        if (active) setError(message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bt, userId, refresh]);

  function persist(next: LocalOrganizationState) {
    if (!userId) return;
    setLocal(next);
    organizationDirectory.save(userId, next);
  }

  const profile = local?.profile ?? null;
  const rollup = local ? summarizeOrganizationRollup(workspaces, local.linkedWorkspaceIds) : null;

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    if (!userId || !local) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (profile) {
      persist({ ...local, profile: { ...profile, name: trimmed, kind, description: description.trim(), updatedAt: new Date().toISOString() } });
      setEditing(false);
      setNotice(bt("조직 프로필을 저장했습니다.", "Organization profile saved."));
    } else {
      const created = createOrganizationProfile({ name: trimmed, kind, description }, userId, new Date(), crypto.randomUUID());
      persist({ ...local, profile: created });
      setNotice(bt("조직을 만들었습니다. 아래에서 소속 팀을 연결해 보세요.", "Organization created. Link your teams below."));
    }
  }

  function startEdit() {
    if (!profile) return;
    setName(profile.name); setKind(profile.kind); setDescription(profile.description); setEditing(true);
  }

  function submitNotice(event: FormEvent) {
    event.preventDefault();
    if (!local) return;
    const body = noticeBody.trim();
    if (!body) return;
    persist({
      ...local,
      notices: [{ id: crypto.randomUUID(), body, createdAt: new Date().toISOString() }, ...local.notices],
    });
    setNoticeBody("");
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
        <button type="submit" disabled={!name.trim()} className={buttonClass()}>{profile ? bt("프로필 저장", "Save profile") : bt("조직 만들기", "Create organization")}</button>
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
              {bt("현재 단계에서 조직 프로필·연결·공지는 이 기기에만 저장됩니다. 조직 초대, 조직 역할의 서버 강제, 조직 포인트 풀, 조직 공용 라이브러리는 조직 서버 계약이 생긴 뒤에 열립니다. 조직에 소속돼도 원고 접근 권한은 생기지 않습니다 — 작품 권한은 지금처럼 작품별로 부여합니다.",
                "At this stage the organization profile, links, and notices are stored only on this device. Organization invites, server-enforced org roles, a shared point pool, and a shared library open once an organization server contract exists. Belonging to an organization never grants manuscript access — project permissions are still granted per project, as today.")}
            </p>

            {loading && <p role="status">{bt("조직 정보를 불러오는 중입니다.", "Loading organization…")}</p>}

            <Card title={bt("조직 프로필", "Organization profile")}>
              {profile && !editing ? (
                <div>
                  <p className="text-xl font-black">{profile.name}</p>
                  <p className="mt-1 text-sm text-fg-2">{bt(ORGANIZATION_KIND_LABELS[profile.kind].ko, ORGANIZATION_KIND_LABELS[profile.kind].en)}</p>
                  {profile.description && <p className="mt-2 text-sm leading-6 text-fg-2">{profile.description}</p>}
                  <button type="button" className={`${buttonClass({ variant: "outline" })} mt-4`} onClick={startEdit}>{bt("프로필 편집", "Edit profile")}</button>
                </div>
              ) : (
                <>
                  {!profile && <p className="mb-4 text-sm leading-6 text-fg-2">{bt("아직 만든 조직이 없습니다. 회사·스튜디오 이름으로 조직을 만들면 소속 팀을 한곳에 묶을 수 있습니다.", "No organization yet. Create one under your company or studio name to group your teams in one place.")}</p>}
                  {profileForm}
                </>
              )}
            </Card>

            {profile && rollup && (
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

            {local && (
              <Card title={bt("팀 연결", "Link teams")}>
                {workspaces.length === 0 && !loading && (
                  <p className="text-sm leading-6 text-fg-2">{bt("아직 참여한 팀이 없습니다. 팀을 만들거나 초대를 수락하면 여기서 조직에 연결할 수 있습니다.", "No teams yet. Create a team or accept an invite, then link it to this organization here.")} <Link className="underline" to="/team/people">{bt("팀 관리로 이동", "Go to team management")}</Link></p>
                )}
                <ul className="space-y-3">
                  {workspaces.map((workspace) => {
                    const linked = local.linkedWorkspaceIds.includes(workspace.id);
                    return (
                      <li key={workspace.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                        <strong className="mr-auto">{workspace.name}</strong>
                        <span className="text-sm text-fg-2">{bt(WORKSPACE_ROLE_LABELS[workspace.role].ko, WORKSPACE_ROLE_LABELS[workspace.role].en)} · {bt(`작품 ${workspace.projectCount}개 · 구성원 ${workspace.memberCount}명`, `${workspace.projectCount} projects · ${workspace.memberCount} members`)}</span>
                        <Link className="underline" to={`/team/people/${workspace.id}`}>{bt("팀 열기", "Open team")}</Link>
                        <button
                          type="button"
                          aria-pressed={linked}
                          className={buttonClass({ variant: linked ? "outline" : "solid", size: "sm" })}
                          onClick={() => persist(toggleLinkedWorkspace(local, workspace.id, !linked))}
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
              <p className="mt-3 text-xs leading-6 text-fg-3">{bt("조직 역할은 조직 화면(프로필·연결·공지·현황)에 대한 권한일 뿐 워크스페이스·작품 접근권이 아닙니다. 구성원을 조직에 초대하고 역할을 강제하는 기능은 조직 서버 계약 이후에 열립니다. 직군 프리셋은 사용성 설정이며 이 권한 체계와 무관합니다.", "Organization roles govern organization surfaces (profile, links, notices, rollup) only — they are not workspace or project access rights. Inviting members and enforcing roles opens after the organization server contract lands. Role presets for jobs are usability settings and are unrelated to this permission model.")}</p>
            </Card>

            {profile && local && (
              <Card title={bt("조직 공지", "Organization notices")}>
                <form className="flex flex-col gap-3" onSubmit={submitNotice}>
                  <label className="flex flex-col gap-2 text-sm font-semibold">{bt("새 공지", "New notice")}
                    <textarea maxLength={300} rows={2} className="rounded-lg border border-line bg-canvas px-3 py-2 text-fg" value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} placeholder={bt("예: 다음 주 월요일 전체 회의", "e.g. All-hands next Monday")} /></label>
                  <button type="submit" disabled={!noticeBody.trim()} className={`${buttonClass()} self-start`}>{bt("공지 등록", "Post notice")}</button>
                </form>
                {local.notices.length === 0
                  ? <p className="mt-4 text-sm text-fg-2">{bt("아직 등록한 공지가 없습니다.", "No notices yet.")}</p>
                  : <ul className="mt-4 space-y-2">{local.notices.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-line p-3">
                      <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6">{item.body}</p>
                      <span className="text-xs text-fg-3">{new Date(item.createdAt).toLocaleDateString(bt("ko-KR", "en-US"))}</span>
                      <button type="button" className="underline" onClick={() => persist({ ...local, notices: local.notices.filter((noticeItem) => noticeItem.id !== item.id) })}>{bt("삭제", "Delete")}</button>
                    </li>
                  ))}</ul>}
                <p className="mt-3 text-xs leading-6 text-fg-3">{bt("공지는 현재 이 기기에만 저장됩니다. 조직 구성원 모두에게 보이는 공지는 조직 서버 계약 이후에 열립니다.", "Notices are currently stored only on this device. Notices visible to every organization member open after the organization server contract lands.")}</p>
              </Card>
            )}

            <Card title={bt("서버 계약이 필요한 조직 기능", "Organization features that need a server contract")}>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-fg-2">
                <li>{bt("조직 초대와 역할 강제 — 이메일 초대, 수락, 역할 변경을 서버가 보장해야 다른 기기에서도 같은 조직이 보입니다.", "Organization invites and role enforcement — invites, acceptance, and role changes need server guarantees before the same organization appears on other devices.")}</li>
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
