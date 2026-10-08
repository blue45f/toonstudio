import "../studio-shell/creator-workflow-surfaces.css";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  TeamWorkspaceDetail,
  TeamWorkspaceRole,
  WorkspaceUsageResponse,
} from "@toonstudio/contracts/production-workspace";
import { useApp } from "@/shared/lib/store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage, httpStatus } from "@/platform/api";
import { TeamAreaNavigation } from "@/shared/components/TeamAreaNavigation";
import { getTeamUsage, getTeamWorkspace } from "./team-workspace-api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ROLE_LABELS: Record<TeamWorkspaceRole, { ko: string; en: string }> = {
  owner: { ko: "소유자", en: "Owner" },
  admin: { ko: "관리자", en: "Admin" },
  member: { ko: "구성원", en: "Member" },
  guest: { ko: "게스트", en: "Guest" },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="creator-workflow-panel rounded-2xl border border-line bg-card p-5"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${Math.round((bytes / 1024 ** 3) * 10) / 10}GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

interface GaugeSpec {
  readonly key: string;
  readonly label: string;
  readonly current: number;
  readonly limit: number;
  readonly detail: string;
  readonly emptyNote?: string;
}

/** 한도와 현재 사용량을 함께 보여 주는 게이지 한 줄. 0인 카운터는 오류가 아니라
 *  정상 상태로 표시하고, 항목별 빈 안내를 곁들인다. */
function UsageGauge({ gauge }: { gauge: GaugeSpec }) {
  const percent = gauge.limit > 0 ? Math.min(100, Math.round((gauge.current / gauge.limit) * 100)) : 0;
  const reached = gauge.limit > 0 && gauge.current >= gauge.limit;
  return <div>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="font-semibold">{gauge.label}</dt>
      <dd className="text-sm text-fg-2">{gauge.current} / {gauge.limit} · {percent}%</dd>
    </div>
    <div
      role="progressbar"
      aria-label={gauge.label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="mt-2 h-2 overflow-hidden rounded-full bg-raised"
    >
      <div className={`h-full rounded-full ${reached ? "bg-warn" : "bg-accent"}`} style={{ width: `${percent}%` }} />
    </div>
    <p className="mt-2 text-sm text-fg-2">{gauge.detail}</p>
    {gauge.current === 0 && gauge.emptyNote && <p className="mt-1 text-sm text-fg-3">{gauge.emptyNote}</p>}
    {reached && <p className="mt-1 text-sm text-warn">한도에 도달했어요. 새 항목을 추가하려면 기존 항목을 정리해 주세요. 기존 자료는 자동 삭제되지 않습니다.</p>}
  </div>;
}

/** 사용량 로딩 스켈레톤. 게이지 3줄과 한도 목록이 앉을 자리를 같은 크기로 채운다. */
function UsagePageSkeleton() {
  return <div aria-hidden="true" data-testid="workspace-usage-page-skeleton" className="animate-pulse space-y-5 motion-reduce:animate-none">
    <section className="creator-workflow-panel rounded-2xl border border-line bg-card p-5">
      <div className="mb-4 h-7 w-40 rounded bg-raised" />
      <div className="space-y-5">
        {[0, 1, 2].map((index) => <div key={index}>
          <div className="flex justify-between gap-2"><div className="h-5 w-28 rounded bg-raised" /><div className="h-5 w-20 rounded bg-raised" /></div>
          <div className="mt-2 h-2 rounded-full bg-raised" />
          <div className="mt-2 h-4 w-2/3 rounded bg-raised" />
        </div>)}
      </div>
    </section>
    <section className="creator-workflow-panel rounded-2xl border border-line bg-card p-5">
      <div className="mb-4 h-7 w-48 rounded bg-raised" />
      <div className="space-y-3">{[0, 1, 2, 3].map((index) => <div key={index} className="h-5 w-3/4 rounded bg-raised" />)}</div>
    </section>
  </div>;
}

type UsagePageState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly detail: TeamWorkspaceDetail; readonly usage: WorkspaceUsageResponse }
  | { readonly kind: "forbidden"; readonly detail: TeamWorkspaceDetail }
  | { readonly kind: "not-found" }
  | { readonly kind: "error"; readonly message: string };

export function TeamWorkspaceUsagePage() {
  const userId = useApp((state) => state.userId);
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return <TeamWorkspaceUsageConsole key={`${userId ?? "signed-out"}:${workspaceId ?? ""}`} userId={userId} workspaceId={workspaceId ?? ""} />;
}

function TeamWorkspaceUsageConsole({ userId, workspaceId }: { userId: string | null; workspaceId: string }) {
  const bt = useBilingual("TeamWorkspaceUsagePage");
  const [state, setState] = useState<UsagePageState>({ kind: "loading" });
  const [refresh, setRefresh] = useState(0);

  // 사용량 화면은 정식 /team/people 패밀리 아래에만 있고, 상세 복귀도 같은 패밀리로 고정한다.
  // (옛 /production/workspaces 주소는 라우트에서 이쪽으로 리다이렉트된다.)
  const detailPath = `/team/people/${workspaceId}`;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setState({ kind: "loading" });
    void (async () => {
      let detail: TeamWorkspaceDetail;
      try {
        detail = await getTeamWorkspace(workspaceId);
      } catch (cause) {
        if (!active) return;
        // 서버는 비구성원에게 상세를 404로 감춘다(접근 가능한 워크스페이스가 없습니다).
        if (httpStatus(cause) === 404) setState({ kind: "not-found" });
        else setState({ kind: "error", message: await getApiErrorMessage(cause, bt("워크스페이스를 불러오지 못했습니다.", "Couldn't load the workspace.")) });
        return;
      }
      if (!active) return;
      try {
        const usage = await getTeamUsage(workspaceId);
        if (active) setState({ kind: "ready", detail, usage });
      } catch (cause) {
        if (!active) return;
        const status = httpStatus(cause);
        // 사용량 API의 권한 판정(관리자 전용 403)을 화면 분기와 일치시킨다.
        if (status === 403) setState({ kind: "forbidden", detail });
        else if (status === 404) setState({ kind: "not-found" });
        else setState({ kind: "error", message: await getApiErrorMessage(cause, bt("사용량을 불러오지 못했습니다.", "Couldn't load usage.")) });
      }
    })();
    return () => { active = false; };
  }, [bt, userId, workspaceId, refresh]);

  const detail = state.kind === "ready" || state.kind === "forbidden" ? state.detail : null;

  return <div data-creator-workflow="team" data-route-ready="team-workspace-usage" className="min-h-dvh bg-canvas px-4 py-6 text-fg">
    <div className="mx-auto max-w-6xl space-y-5"><TeamAreaNavigation />
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-panel p-5 sm:p-6">
      <div>
        <p className="eyebrow text-accent">TEAM · USAGE</p>
        <h1 className="mt-2 text-2xl font-black">{detail ? bt(`${detail.workspace.name} 사용량`, `${detail.workspace.name} usage`) : bt("워크스페이스 사용량", "Workspace usage")}</h1>
        <p className="mt-2 text-sm text-fg-2">{bt("공통 이용 한도와 지금 쓰는 양을 한 화면에서 확인합니다. 한도를 넘어도 기존 자료는 자동 삭제되지 않습니다.", "Check plan limits and current usage in one place. Exceeding a limit never auto-deletes your existing data.")}</p>
      </div>
      <nav aria-label={bt("사용량 바로가기", "Usage shortcuts")} className="flex flex-wrap gap-3">
        <Link to={detailPath}>{bt("워크스페이스 상세", "Workspace detail")}</Link>
        <Link to="/team/people">{bt("전체 팀", "All teams")}</Link>
      </nav>
    </header>

    {!userId ? <Section title={bt("로그인하면 사용량을 확인할 수 있어요", "Sign in to see usage")}>
      <p className="text-sm leading-6 text-fg-2">{bt("사용량은 워크스페이스 구성원만, 그중에서도 소유자·관리자만 확인할 수 있습니다. 로그인한 뒤 다시 열어 주세요.", "Usage is visible only to workspace members, and among them only owners and admins. Sign in and open this page again.")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={buttonClass({ className: "min-h-11" })} onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "team-workspace-usage", mode: "login" })}>{bt("로그인하기", "Sign in")}</button>
        <Link className={buttonClass({ variant: "outline", className: "min-h-11" })} to="/team/people">{bt("팀 목록으로", "Go to teams")}</Link>
      </div>
    </Section> : <>
    {state.kind === "loading" && <><p role="status">{bt("사용량을 불러오는 중입니다.", "Loading usage…")}</p><UsagePageSkeleton /></>}
    {state.kind === "error" && <div role="alert" className="rounded-xl border border-bad p-4">
      {state.message}
      <button type="button" className="ml-3 underline" onClick={() => setRefresh((value) => value + 1)}>{bt("다시 시도", "Retry")}</button>
    </div>}
    {state.kind === "not-found" && <Section title={bt("접근할 수 있는 워크스페이스가 없어요", "No workspace you can access")}>
      <p className="text-sm leading-6 text-fg-2">{bt("참여 중인 워크스페이스가 아니거나 주소가 올바르지 않습니다. 내가 속한 팀은 전체 팀 목록에서 확인할 수 있어요.", "You're not a member of this workspace, or the address is incorrect. Find your teams in the full list.")}</p>
      <Link className={`${buttonClass({ variant: "outline" })} mt-4`} to="/team/people">{bt("전체 팀 보기", "View all teams")}</Link>
    </Section>}
    {state.kind === "forbidden" && state.detail && <Section title={bt("사용량은 관리자만 확인할 수 있어요", "Only admins can see usage")}>
      <p className="text-sm leading-6 text-fg-2">{bt(`운영 사용량은 워크스페이스 소유자·관리자만 확인할 수 있습니다. 현재 내 역할은 ${ROLE_LABELS[state.detail.workspace.role].ko}입니다.`, `Operational usage is visible only to the workspace owner and admins. Your current role is ${ROLE_LABELS[state.detail.workspace.role].en}.`)}</p>
      <p className="mt-2 text-sm leading-6 text-fg-2">{bt("구성원과 초대 현황은 워크스페이스 상세에서 계속 확인할 수 있어요.", "You can still check members and invites on the workspace detail page.")}</p>
      <Link className={`${buttonClass({ variant: "outline" })} mt-4`} to={detailPath}>{bt("워크스페이스 상세로", "Go to workspace detail")}</Link>
    </Section>}
    {state.kind === "ready" && <UsageSections usage={state.usage} />}
    </>}
    </div></div>;
}

function UsageSections({ usage }: { usage: WorkspaceUsageResponse }) {
  const bt = useBilingual("TeamWorkspaceUsagePage");
  const { counters, policy } = usage;
  const resetLabel = new Date(usage.nextDailyResetAt).toLocaleString(bt("ko-KR", "en-US"), { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const gauges: readonly GaugeSpec[] = [
    {
      key: "projects",
      label: bt("연결한 작품", "Linked projects"),
      current: counters.projects,
      limit: policy.projectsPerWorkspace,
      detail: bt("이 워크스페이스에 연결된 제작 프로젝트 수입니다.", "Production projects linked to this workspace."),
      emptyNote: bt("아직 연결한 작품이 없어요. 상세 화면에서 소유한 프로젝트를 연결할 수 있습니다.", "No linked projects yet. Link an owned project from the detail page."),
    },
    {
      key: "members",
      label: bt("구성원 · 대기 초대", "Members & pending invites"),
      current: counters.members + counters.pendingInvites,
      limit: policy.membersPerWorkspace,
      detail: bt(`구성원 ${counters.members}명 · 대기 초대 ${counters.pendingInvites}건 — 대기 중인 초대도 한도에 함께 셉니다.`, `${counters.members} members · ${counters.pendingInvites} pending invites — pending invites count toward the limit too.`),
      emptyNote: bt("아직 구성원이 없어요. 상세 화면에서 초대 링크를 만들 수 있습니다.", "No members yet. Create an invite link from the detail page."),
    },
    {
      key: "owned",
      label: bt("소유 워크스페이스", "Owned workspaces"),
      current: counters.ownedWorkspaces,
      limit: policy.ownedWorkspaces,
      detail: bt("내가 소유한 전체 워크스페이스 수입니다.", "Workspaces you own in total."),
    },
  ];
  return <>
    <Section title={bt("현재 사용량", "Current usage")}>
      <dl className="space-y-6">{gauges.map((gauge) => <UsageGauge key={gauge.key} gauge={gauge} />)}</dl>
    </Section>
    <Section title={bt("공통 이용 한도", "Plan limits")}>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="font-semibold">{bt("원고 원본 저장 한도", "Manuscript original storage limit")}</dt>
          <dd className="mt-1 text-sm text-fg-2">{bt(`워크스페이스당 ${formatBytes(policy.workspaceOriginalBytes)} · 소유자 전체 ${formatBytes(policy.ownerOriginalBytes)}`, `${formatBytes(policy.workspaceOriginalBytes)} per workspace · ${formatBytes(policy.ownerOriginalBytes)} per owner`)}</dd>
          <dd className="mt-1 text-sm text-fg-3">{bt("저장 사용량은 아직 측정하지 않습니다. 측정하지 않은 사용량을 0으로 표시하지 않습니다.", "Storage usage isn't metered yet. Unmetered usage is not shown as zero.")}</dd></div>
        <div><dt className="font-semibold">{bt("이미지 한 장", "Per image")}</dt>
          <dd className="mt-1 text-sm text-fg-2">{bt(`용량 ${formatBytes(policy.imageBytes)} · 최대 ${policy.imagePixels.toLocaleString(bt("ko-KR", "en-US"))} 화소`, `${formatBytes(policy.imageBytes)} · up to ${policy.imagePixels.toLocaleString(bt("ko-KR", "en-US"))} pixels`)}</dd></div>
        <div><dt className="font-semibold">{bt("PDF 한 개", "Per PDF")}</dt>
          <dd className="mt-1 text-sm text-fg-2">{bt(`용량 ${formatBytes(policy.pdfBytes)} · 최대 ${policy.pdfPages}쪽`, `${formatBytes(policy.pdfBytes)} · up to ${policy.pdfPages} pages`)}</dd></div>
        <div><dt className="font-semibold">{bt("하루 내보내기", "Daily exports")}</dt>
          <dd className="mt-1 text-sm text-fg-2">{bt(`${policy.dailyExports}회 · 다음 초기화 ${resetLabel}`, `${policy.dailyExports} per day · resets ${resetLabel}`)}</dd></div>
        <div><dt className="font-semibold">{bt("공유 링크", "Share links")}</dt>
          <dd className="mt-1 text-sm text-fg-2">{bt(`동시 활성 ${policy.activeShares}개 · 기본 유지 ${policy.defaultShareDays}일`, `${policy.activeShares} active · kept ${policy.defaultShareDays} days by default`)}</dd></div>
        <div><dt className="font-semibold">{bt("검수 보기 · 변환 작업", "Review views & conversion jobs")}</dt>
          <dd className="mt-1 text-sm text-fg-2">{bt(`비교 보기 ${policy.comparisonViews}개 · 나란히 보기 ${policy.sideViews}개 · 대기 작업 ${policy.queuedJobs}개 · 동시 실행 ${policy.runningJobs}개`, `${policy.comparisonViews} comparison views · ${policy.sideViews} side-by-side · ${policy.queuedJobs} queued jobs · ${policy.runningJobs} running at once`)}</dd></div>
      </dl>
    </Section>
    <Section title={bt("운영 정책", "Operation policy")}>
      <p className="text-sm leading-6 text-fg-2">{usage.operationMode === "free"
        ? bt("현재 무료 운영입니다. 외부 유료 AI와 사용량 과금 공급자는 제공하지 않습니다.", "Currently on the free plan. External paid AI and metered providers are not offered.")
        : bt("유료 운영 정책이 적용되어 있습니다. 실제 결제는 아직 제공하지 않습니다.", "A paid policy is in effect. Actual billing is not available yet.")}</p>
      <p className="mt-2 text-xs text-fg-3">{bt(`정책 ${policy.version} · revision ${usage.policyRevision} · 기존 작품 권한은 유지합니다.`, `Policy ${policy.version} · revision ${usage.policyRevision} · existing project permissions are kept.`)}</p>
    </Section>
  </>;
}
