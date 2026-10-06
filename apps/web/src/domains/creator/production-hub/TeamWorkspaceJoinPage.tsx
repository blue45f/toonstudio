import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/shared/lib/store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { TeamAreaNavigation } from "@/shared/components/TeamAreaNavigation";
import { getApiErrorMessage } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { acceptTeamInvite } from "./team-workspace-api";
import {
  parseStudioSpatialInviteFragment,
  studioSpatialInviteDestination,
  type StudioSpatialInviteContext,
} from "../virtual-space/studio-spatial-invite-context";

const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const fieldClass = "min-h-11 rounded-lg border border-line bg-canvas px-3 text-fg";

/** 수락 뒤 도착할 장소를 사람의 말로. 링크 프래그먼트가 알려 주는 입장 안내만으로 확정할 수 있는
 *  정보이며, 워크스페이스 이름·역할은 서버 미리보기 계약이 없어 수락 전에는 표시하지 않는다. */
function entryDestinationCopy(context: StudioSpatialInviteContext): { ko: string; en: string } {
  if (context.kind === "project-space") {
    return { ko: "수락하면 초대받은 작품의 협업 공간으로 입장해요.", en: "Accepting takes you to the invited work's collaboration space." };
  }
  if (context.kind === "interview-waiting") {
    return { ko: "수락하면 면접·협업 대기실로 입장해요.", en: "Accepting takes you to the interview & collaboration waiting room." };
  }
  return { ko: "수락하면 내 팀 공간(협업 홈)으로 입장해요.", en: "Accepting takes you to your team space (collaboration home)." };
}

function StepItem({ index, title, description, state }: {
  readonly index: number;
  readonly title: string;
  readonly description: string;
  readonly state: "done" | "current" | "todo";
}) {
  return <li aria-current={state === "current" ? "step" : undefined} className={`flex gap-3 rounded-xl border p-3 ${state === "current" ? "border-accent/50 bg-accent-soft/50" : "border-line"}`}>
    <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${state === "done" ? "bg-accent text-on-accent" : "bg-raised text-fg-2"}`}>{state === "done" ? "✓" : index}</span>
    <span><strong className="block text-sm">{title}</strong><span className="mt-0.5 block text-sm leading-6 text-fg-2">{description}</span></span>
  </li>;
}

/**
 * 합류 시트 — 모든 합류 진입점(초대 링크·초대 코드·구인 확정 후 초대)의 유일한 종착 화면.
 * 초대 링크 프래그먼트(#invite=)와 레거시 쿼리(?token=)를 모두 받아 코드를 미리 채우고,
 * 비밀은 읽는 즉시 주소창에서 지운다. 무엇에 합류하는지(입장 안내)·어떤 권한을 받는지·
 * 수락 뒤 무엇이 일어나는지를 수락 전에 같은 화면에서 보여 준다.
 */
export function TeamWorkspaceJoinPage() {
  const bt = useBilingual("TeamWorkspaceJoinPage");
  const userId = useApp((state) => state.userId);
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const [entryContext, setEntryContext] = useState<StudioSpatialInviteContext>({ kind: "team-lobby" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const parsed = parseStudioSpatialInviteFragment(window.location.hash);
    let resolved = parsed.token;
    const url = new URL(window.location.href);
    const queryToken = url.searchParams.get("token");
    if (!resolved && queryToken && INVITE_TOKEN.test(queryToken.trim())) resolved = queryToken.trim();
    if (resolved) { setToken(resolved); setFromLink(true); }
    setEntryContext(parsed.context);
    // 비밀(프래그먼트·토큰 쿼리)은 읽는 즉시 주소창에서 제거해 기록·공유로 새지 않게 한다.
    if (window.location.hash || url.searchParams.has("token")) {
      url.hash = "";
      url.searchParams.delete("token");
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
  }, []);
  const tokenReady = INVITE_TOKEN.test(token.trim());
  const destination = entryDestinationCopy(entryContext);
  const branches = [
    { href: "/collaborate/positions", title: bt("모집 자리 찾기", "Find open positions"), description: bt("역할·도구·보수로 공개 모집 자리를 찾고 지원해 보세요. 지원이 확정되면 팀 초대가 도착해요.", "Search public openings by role, tools, and pay, then apply. Once accepted, a team invite follows.") },
    { href: "/collaborate", title: bt("구인·의뢰 게시판", "Gigs board"), description: bt("공개 모집 글과 함께할 작업자를 둘러보세요.", "Browse public gig posts and the creators behind them.") },
    { href: "/team/people", title: bt("내 팀·사람 권한", "My teams & people"), description: bt("이미 소속된 팀이 있다면 팀 공간과 내 권한을 확인하세요.", "If you already belong to a team, open your team space and check your access.") },
  ];
  return <div data-creator-workflow="team-join" data-route-ready="team-workspace-join" className="min-h-dvh bg-canvas px-4 py-6 text-fg"><div className="mx-auto max-w-3xl space-y-5">
    <TeamAreaNavigation />
    <section aria-labelledby="team-join-title" className="rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft via-card to-card p-5 sm:p-6">
      <p className="eyebrow text-accent">TEAM · JOIN</p>
      <h1 id="team-join-title" className="mt-2 text-2xl font-black">{bt("팀 합류", "Join a team")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">{bt("초대받은 팀에 합류하면 팀 공간에서 함께 만들기를 시작할 수 있어요. 어느 문으로 들어왔든 합류는 이 한 화면에서 끝나요.", "Join the team you were invited to and start creating together in the team space. Whichever door you came through, joining ends on this one sheet.")}</p>
      {fromLink && <p role="status" className="mt-3 rounded-xl border border-accent/40 bg-panel px-3 py-2 text-sm font-semibold">{bt("초대 링크를 확인했어요. 초대 코드가 자동으로 입력됐습니다.", "Invite link recognized. Your invite code was filled in automatically.")}</p>}
      <p className="mt-3 text-sm font-semibold text-fg">{bt(destination.ko, destination.en)}</p>
    </section>
    <section aria-labelledby="team-join-steps-title" className="creator-workflow-panel rounded-2xl border border-line bg-card p-5">
      <h2 id="team-join-steps-title" className="mb-4 text-lg font-bold">{bt("합류는 이렇게 진행돼요", "How joining works")}</h2>
      <ol className="space-y-3">
        <StepItem index={1} state={tokenReady ? "done" : "current"}
          title={bt("초대 확인", "Check the invite")}
          description={tokenReady ? bt("초대 코드가 준비됐어요.", "Your invite code is ready.") : bt("받은 초대 코드를 아래에 입력하세요. 초대 링크로 왔다면 자동으로 채워져요.", "Enter the invite code you received below. Invite links fill it in automatically.")} />
        <StepItem index={2} state={userId ? "done" : tokenReady ? "current" : "todo"}
          title={bt("로그인 확인", "Verify sign-in")}
          description={userId ? bt("로그인되어 있어요.", "You're signed in.") : bt("초대받은 이메일로 로그인하고 이메일 인증을 완료해 주세요.", "Sign in with the invited email and finish email verification.")} />
        <StepItem index={3} state={tokenReady && userId ? "current" : "todo"}
          title={bt("합류하고 입장", "Join & enter")}
          description={bt("수락하면 팀 소속이 생기고, 안내된 공간으로 바로 이동해요.", "Accepting joins you to the team and takes you straight to the guided space.")} />
      </ol>
    </section>
    <section aria-labelledby="team-join-form-title" className="creator-workflow-panel rounded-2xl border border-line bg-card p-5">
      <h2 id="team-join-form-title" className="mb-4 text-lg font-bold">{bt("초대 코드로 합류", "Join with an invite code")}</h2>
      {error && <p role="alert" className="mb-4 rounded-xl border border-bad p-3 text-sm">{error}</p>}
      {!userId && <p className="mb-4 text-sm leading-6 text-fg-2">{fromLink
        ? bt("로그인하면 입력된 코드로 바로 수락할 수 있어요.", "Sign in to accept with the code already filled in.")
        : bt("로그인 후 원래 초대 링크를 다시 열거나 초대 코드를 입력해 주세요.", "After signing in, reopen the original invite link or enter the invite code.")}{" "}
        <button type="button" className="font-semibold underline" onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "team-workspace-invite", mode: "login" })}>{bt("로그인", "Sign in")}</button></p>}
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError("");
        void acceptTeamInvite(token.trim()).then((result) => {
          setToken("");
          navigate(studioSpatialInviteDestination(entryContext, result.workspaceId), { replace: true });
        })
          .catch(async (cause: unknown) => setError(await getApiErrorMessage(cause, bt("초대를 수락하지 못했습니다.", "Couldn't accept the invite.")))).finally(() => setBusy(false)); }}>
        <label className="flex flex-col gap-2">{bt("초대 코드", "Invite code")}<input className={fieldClass} value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} maxLength={43} /></label>
        <div className="rounded-xl border border-line bg-raised p-3">
          <h3 className="text-sm font-bold">{bt("합류하면 받는 권한", "What you get when you join")}</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">{bt("역할(관리자·구성원·게스트)은 초대한 팀이 정해 두고 수락과 함께 적용돼요. 정확한 역할은 합류 후 사람·권한 화면에서 확인할 수 있어요. 작품별 접근 권한은 팀 합류와 별도로 주어지며, 팀 소속만으로 비공개 원고가 열리지는 않아요.", "Your role (admin, member, or guest) is set by the inviting team and applies as soon as you accept. You can check the exact role afterwards under People & access. Per-work access is granted separately — team membership alone never opens private manuscripts.")}</p>
        </div>
        <button disabled={!userId || busy || !tokenReady} className={buttonClass()} type="submit">{bt("초대 수락하기", "Accept invite")}</button>
      </form>
    </section>
    <section aria-labelledby="team-join-branches-title" className="creator-workflow-panel rounded-2xl border border-line bg-card p-5">
      <h2 id="team-join-branches-title" className="mb-1 text-lg font-bold">{bt("아직 초대가 없나요?", "No invite yet?")}</h2>
      <p className="mb-4 text-sm leading-6 text-fg-2">{bt("초대는 팀 관리자만 보낼 수 있어요. 합류할 팀을 찾는 중이라면 아래에서 시작하세요.", "Only team managers can send invites. If you're still looking for a team to join, start below.")}</p>
      <div className="grid gap-3 sm:grid-cols-3">{branches.map((branch) => <Link key={branch.href} to={branch.href} className="rounded-xl border border-line p-4 hover:bg-raised">
        <strong className="block text-sm">{branch.title}</strong><span className="mt-1 block text-sm leading-6 text-fg-2">{branch.description}</span></Link>)}</div>
    </section>
    <p className="text-sm"><Link to="/team/people" className="underline">{bt("팀 목록으로", "Back to teams")}</Link>{" · "}<Link to="/team" className="underline">{bt("협업 홈", "Collaboration home")}</Link></p>
  </div></div>;
}
