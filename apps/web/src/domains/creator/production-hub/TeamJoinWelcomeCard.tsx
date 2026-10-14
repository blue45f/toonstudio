import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";

import type { TeamWorkspaceDetail } from "@toonstudio/contracts/production-workspace";

import { getApiErrorMessage } from "@/platform/api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { RolePermissionSummary } from "./RolePermissionSummary";
import { getTeamWorkspace } from "./team-workspace-api";
import { teamJoinWelcomeModel } from "./team-join-welcome-model";

type WelcomeState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly detail: TeamWorkspaceDetail }
  | { readonly kind: "error"; readonly message: string };

/**
 * 합류 환영 카드 — 초대 수락 직후 도착지(/team?workspace=…&lobby=1)에서만 뜬다.
 * 도착 URL이 실어 온 워크스페이스 식별자로 팀 상세(기존 API)를 읽어
 * "어느 팀에·어떤 역할로 합류했고, 먼저 뭘 하면 되는지"를 그 자리에서 알려 준다.
 * 닫으면 호스트가 workspace·lobby 파라미터를 정리해 다시 뜨지 않는다.
 */
export function TeamJoinWelcomeCard({
  workspaceId,
  onDismiss,
}: {
  readonly workspaceId: string;
  readonly onDismiss: () => void;
}) {
  const bt = useBilingual("TeamJoinWelcomeCard");
  const [state, setState] = useState<WelcomeState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void getTeamWorkspace(workspaceId)
      .then((detail) => {
        if (active) setState({ kind: "ready", detail });
      })
      .catch(async (cause: unknown) => {
        if (!active) return;
        const message = await getApiErrorMessage(
          cause,
          bt("합류한 팀 정보를 불러오지 못했습니다.", "Couldn't load your joined team."),
        );
        if (active) setState({ kind: "error", message });
      });
    return () => {
      active = false;
    };
  }, [bt, workspaceId, attempt]);

  return (
    <section
      aria-labelledby="team-join-welcome-title"
      className="creator-workflow-panel relative rounded-2xl border border-accent/40 bg-gradient-to-br from-accent-soft/60 via-card to-card p-5"
    >
      <button
        type="button"
        aria-label={bt("환영 안내 닫기", "Dismiss welcome")}
        onClick={onDismiss}
        className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-fg-2 hover:bg-raised"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
      <p className="eyebrow flex items-center gap-1.5 text-accent">
        <Sparkles aria-hidden="true" className="size-4" />
        TEAM · WELCOME
      </p>
      {state.kind === "loading" && (
        <div role="status">
          <p className="mt-2 text-lg font-black">
            {bt("합류한 팀을 확인하고 있어요…", "Checking the team you joined…")}
          </p>
          <div aria-hidden="true" className="mt-3 animate-pulse space-y-2 motion-reduce:animate-none">
            <div className="h-5 w-2/3 rounded bg-raised" />
            <div className="h-5 w-1/2 rounded bg-raised" />
          </div>
        </div>
      )}
      {state.kind === "error" && (
        <div>
          <h2 id="team-join-welcome-title" className="mt-2 text-lg font-black">
            {bt("팀 합류는 끝났어요", "You're on the team")}
          </h2>
          <p role="alert" className="mt-1.5 text-sm leading-6 text-fg-2">
            {state.message}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass({ variant: "outline" })}
              onClick={() => setAttempt((value) => value + 1)}
            >
              {bt("다시 확인", "Retry")}
            </button>
            <Link className={buttonClass({ variant: "ghost" })} to="/team/people">
              {bt("사람·권한에서 내 팀 보기", "See my team in People & access")}
            </Link>
          </div>
        </div>
      )}
      {state.kind === "ready" && (
        <ReadyWelcome detail={state.detail} workspaceId={workspaceId} />
      )}
    </section>
  );
}

function ReadyWelcome({
  detail,
  workspaceId,
}: {
  readonly detail: TeamWorkspaceDetail;
  readonly workspaceId: string;
}) {
  const bt = useBilingual("TeamJoinWelcomeCard");
  const welcome = teamJoinWelcomeModel({
    workspaceId,
    workspaceName: detail.workspace.name,
    role: detail.workspace.role,
    projects: detail.projects.map((project) => ({
      id: project.id,
      title: project.title,
    })),
  });
  return (
    <div>
      <h2 id="team-join-welcome-title" className="mt-2 pr-10 text-xl font-black">
        {bt(welcome.headline.ko, welcome.headline.en)}
      </h2>
      <p className="mt-1 text-sm leading-6 text-fg-2">
        {welcome.hasProjectAccess
          ? bt(
              "아래 순서대로 시작하면 돼요. 내 권한으로 할 수 있는 일도 함께 정리했어요.",
              "Start with the steps below — what your access lets you do is summarized too.",
            )
          : bt(
              "팀 소속은 끝났어요. 작품을 열려면 작품 권한이 따로 필요해서, 먼저 요청부터 안내할게요.",
              "You're on the team. Opening a work needs separate project access, so the first step is asking for it.",
            )}
      </p>
      <div className="mt-3">
        <RolePermissionSummary scope="workspace" role={detail.workspace.role} compact />
      </div>
      <ol className="mt-4 space-y-2">
        {welcome.steps.map((step, index) =>
          step.primary ? (
            <li key={step.id}>
              <Link
                to={step.href}
                className={buttonClass({ className: "w-full justify-between gap-3 sm:w-auto" })}
              >
                <span>
                  <span className="block text-left font-bold">
                    {index + 1}. {bt(step.title.ko, step.title.en)}
                  </span>
                  <span className="block text-left text-xs font-medium opacity-80">
                    {bt(step.description.ko, step.description.en)}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            </li>
          ) : (
            <li key={step.id}>
              <Link
                to={step.href}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 hover:bg-raised"
              >
                <span>
                  <span className="block text-sm font-bold">
                    {index + 1}. {bt(step.title.ko, step.title.en)}
                  </span>
                  <span className="mt-0.5 block text-sm leading-6 text-fg-2">
                    {bt(step.description.ko, step.description.en)}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
              </Link>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
