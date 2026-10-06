import { Link } from "react-router-dom";
import { isWorkspaceManager, type TeamWorkspaceSummary } from "@toonstudio/contracts/production-workspace";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { buttonClass } from "@/shared/components/ui/button-utils";

/**
 * 사람·권한 목록(/team/people) 첫 화면의 개요 스트립.
 * 워크스페이스 목록 요약(서버 계약)만으로 합산해 보여 주며 새 조회를 만들지 않는다.
 * 다음 행동은 두 가지로 고정한다: 관리 중인 팀이 있으면 그 팀의 초대 카드로,
 * 없으면 새 팀 만들기 폼으로. 초대받은 사람은 합류 시트로 보낸다.
 */
export function TeamPeopleOverviewStrip({ items }: { items: readonly TeamWorkspaceSummary[] }) {
  const bt = useBilingual("TeamPeopleOverview");
  const memberTotal = items.reduce((sum, item) => sum + item.memberCount, 0);
  const pendingTotal = items.reduce((sum, item) => sum + item.pendingInvites, 0);
  const projectTotal = items.reduce((sum, item) => sum + item.projectCount, 0);
  const managed = items.find((item) => isWorkspaceManager(item.role));
  return (
    <section aria-labelledby="team-people-overview-title" className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="team-people-overview-title" className="text-lg font-bold">{bt("사람 한눈에", "People at a glance")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">{bt("참여 중인 모든 팀의 사람과 초대를 모았습니다. 팀을 열면 구성원·역할·사용량을 그 자리에서 관리할 수 있어요.", "Everyone and every invite across your teams, in one place. Open a team to manage its members, roles, and usage right there.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {managed
            ? <Link className={buttonClass({ className: "min-h-11" })} to={`/team/people/${managed.id}#team-invite`}>{bt("사람 초대하기", "Invite people")}</Link>
            : <a className={buttonClass({ className: "min-h-11" })} href="#team-create-workspace">{bt("새 팀 만들기", "Create a team")}</a>}
          <Link className={buttonClass({ variant: "outline", className: "min-h-11" })} to="/team/people/join">{bt("초대 코드로 참여", "Join with an invite code")}</Link>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-xs font-semibold text-fg-3">{bt("참여 팀", "Teams")}</dt>
          <dd className="mt-1 text-lg font-black">{bt(`${items.length}곳`, `${items.length}`)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-xs font-semibold text-fg-3">{bt("전체 구성원", "Members")}</dt>
          <dd className="mt-1 text-lg font-black">{bt(`${memberTotal}명`, `${memberTotal}`)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-xs font-semibold text-fg-3">{bt("대기 중 초대", "Pending invites")}</dt>
          <dd className="mt-1 text-lg font-black">{bt(`${pendingTotal}건`, `${pendingTotal}`)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-xs font-semibold text-fg-3">{bt("연결된 작품", "Linked projects")}</dt>
          <dd className="mt-1 text-lg font-black">{bt(`${projectTotal}개`, `${projectTotal}`)}</dd>
        </div>
      </dl>
    </section>
  );
}
