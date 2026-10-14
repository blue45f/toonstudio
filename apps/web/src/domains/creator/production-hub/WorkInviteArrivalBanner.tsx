import { useEffect, useState } from "react";
import { ArrowRight, Inbox, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { getApiErrorMessage } from "@/platform/api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  getStudioTeamInvitations,
  type StudioTeamInvitationSummary,
} from "../studio-team-client";
import { workInviteArrivalModel } from "./work-invite-arrival-model";

type ArrivalState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly invitations: readonly StudioTeamInvitationSummary[] }
  | { readonly kind: "error"; readonly message: string };

const INVITED_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
});

function formatInvitedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return INVITED_DATE_FORMATTER.format(date);
}

/**
 * 작품 초대 도착 배너 — 협업 홈(/team)과 사람·권한(/team/people)처럼 합류
 * 동선의 착지 표면에 "대기 중인 작품 초대 N건"을 보여 주고, 각 초대를 그
 * 작품의 수락 지점(팀·권한 표면의 StudioTeamPanel)으로 1회 이동에 잇는다.
 *
 * 정직성 규칙:
 * - 비로그인(enabled=false)이면 조회 자체를 하지 않고 아무것도 그리지 않는다.
 * - 로딩 중에는 건수를 말하지 않는다(스켈레톤만).
 * - 조회 실패는 "초대 없음"으로 위장하지 않고, 확인 실패 + 재시도를 말한다.
 * - 초대가 0건이면 배너를 숨긴다(빈 신호는 소음).
 * 수락·거절 자체는 여기서 복제하지 않는다 — 409 stale 처리와 포커스 관리를
 * 이미 갖춘 StudioTeamPanel 받은 초대함이 정본이다.
 */
export function WorkInviteArrivalBanner({
  enabled,
}: {
  readonly enabled: boolean;
}) {
  const bt = useBilingual("WorkInviteArrivalBanner");
  const [state, setState] = useState<ArrivalState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    setState({ kind: "loading" });
    void getStudioTeamInvitations(20, controller.signal)
      .then((invitations) => {
        if (active) setState({ kind: "ready", invitations });
      })
      .catch(async (cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        const message = await getApiErrorMessage(
          cause,
          bt("받은 작품 초대를 불러오지 못했습니다.", "Couldn't load your work invitations."),
        );
        if (active && !controller.signal.aborted) {
          setState({ kind: "error", message });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [bt, enabled, attempt]);

  if (!enabled) return null;

  if (state.kind === "loading") {
    return (
      <section
        aria-label={bt("작품 초대 확인 중", "Checking work invitations")}
        className="creator-workflow-panel rounded-2xl border border-line bg-card p-5"
      >
        <div role="status">
          <p className="text-sm font-bold">
            {bt("작품 초대를 확인하고 있어요…", "Checking for work invitations…")}
          </p>
          <div
            aria-hidden="true"
            className="mt-3 animate-pulse space-y-2 motion-reduce:animate-none"
          >
            <div className="h-5 w-1/2 rounded bg-raised" />
            <div className="h-5 w-2/3 rounded bg-raised" />
          </div>
        </div>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="creator-workflow-panel rounded-2xl border border-line bg-card p-5">
        <p role="alert" className="text-sm leading-6 text-fg-2">
          {bt(
            "작품 초대가 있는지 확인하지 못했어요.",
            "Couldn't check whether you have work invitations.",
          )}{" "}
          {state.message}
        </p>
        <button
          type="button"
          className={buttonClass({ variant: "outline", className: "mt-3" })}
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {bt("다시 확인", "Retry")}
        </button>
      </section>
    );
  }

  const arrival = workInviteArrivalModel(state.invitations);
  if (!arrival) return null;

  return (
    <section
      aria-labelledby="work-invite-arrival-title"
      className="creator-workflow-panel rounded-2xl border border-accent/40 bg-gradient-to-br from-accent-soft/60 via-card to-card p-5"
    >
      <p className="eyebrow flex items-center gap-1.5 text-accent">
        <Inbox aria-hidden="true" className="size-4" />
        WORK INVITATIONS
      </p>
      <h2 id="work-invite-arrival-title" className="mt-2 text-lg font-black">
        {bt(arrival.headline.ko, arrival.headline.en)}
      </h2>
      <p className="mt-1 text-sm leading-6 text-fg-2">
        {bt(arrival.description.ko, arrival.description.en)}
      </p>
      <ul className="mt-4 space-y-2">
        {arrival.items.map((item) => (
          <li key={item.workId}>
            <Link
              to={item.acceptHref}
              aria-label={bt(
                `${item.workTitle} 초대 확인·수락하러 가기`,
                `Review and accept the invitation to ${item.workTitle}`,
              )}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 hover:bg-raised"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="truncate text-sm font-bold">
                    {item.workTitle}
                  </strong>
                  <span className="inline-flex min-h-6 items-center rounded-full border border-accent/35 bg-accent-soft px-2 text-xs font-semibold text-accent">
                    {bt(item.roleLabel.ko, item.roleLabel.en)}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm leading-6 text-fg-2">
                  {bt(
                    `${item.ownerName} 님이 초대했어요`,
                    `Invited by ${item.ownerName}`,
                  )}
                  {formatInvitedAt(item.invitedAt)
                    ? ` · ${formatInvitedAt(item.invitedAt)}`
                    : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-accent">
                {bt("수락하러 가기", "Review & accept")}
                <ArrowRight aria-hidden="true" className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {arrival.moreLabel ? (
        <p className="mt-3 text-sm leading-6 text-fg-2">
          {bt(arrival.moreLabel.ko, arrival.moreLabel.en)}
        </p>
      ) : null}
    </section>
  );
}
