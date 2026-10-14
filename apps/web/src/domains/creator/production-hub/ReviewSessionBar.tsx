import { CircleDot, DoorOpen, Focus, MapPin, Navigation, Play, ScrollText, Square, Users } from "lucide-react";

import {
  formatPresenceLocation,
  isSamePresenceLocation,
  type PresenceLocation,
} from "./presence-location-model";
import {
  deriveSessionPresence,
  summarizeReviewSession,
  type ReviewSession,
} from "./review-session-model";
import type { ReviewSessionSummaryExport } from "./review-session-summary-export";
import { ProductionAvatar, ProductionPill } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface ReviewSessionBarProps {
  /** null이면 열린 세션이 없다. */
  readonly session: ReviewSession | null;
  readonly selfActorId: string | null;
  /** 세션을 열 수 있는 사람인가 (작품 편집 권한 기준 — 호스트가 정한다). */
  readonly canHost: boolean;
  /** 전송·저장 오류가 있으면 세션 상태 대신 이 사유를 먼저 알린다. */
  readonly error: string | null;
  /**
   * 참여자별 지금 위치(회차·페이지·공정). 라이브 뷰에서 도출한다.
   * 위치를 모르는 참여자는 칩에 위치를 붙이지 않는다. 집중 모드 참여자는
   * 정책상 위치가 있어도 표시하지 않는다.
   */
  readonly participantLocations?: Readonly<Record<string, PresenceLocation>>;
  /** 그 사람의 위치로 이동한다 (그 사람이 보는 화면 따라가기). */
  readonly onLocateParticipant?: (actorId: string) => void;
  /**
   * 종료된 세션의 요약이 회차 검수 기록에 붙은 상태. 호스트가 세션 종료를
   * 감지해 자동으로 붙이고 그 결과를 넘긴다. 있으면 종료 화면에
   * "검수 기록·인계에 붙었다"고 알리고, 없으면(아직 안 붙었거나 붙일 수
   * 없으면) 알리지 않는다 — 붙지 않은 것을 붙었다고 말하지 않는다.
   */
  readonly summaryExport?: ReviewSessionSummaryExport | null;
  readonly onStart: () => void;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
  readonly onToggleFocus: () => void;
  readonly onEnd: () => void;
  readonly now: Date;
}

/**
 * 검수 세션 바 — "함께 보기"의 시작과 끝, 그리고 세션 안에서의 약속을 보여 준다.
 *
 * - 세션이 없을 때는 시작 버튼만 있다. 누가 온라인인지 같은 상시 신호는 없다.
 * - 세션 중에는 참여자 명단이 열리되, 집중 중인 사람은 이름만 보인다
 *   (커서·위치를 숨기는 정책은 모델 deriveSessionPresence가 정한다).
 * - 참여자 칩에는 지금 보고 있는 회차·페이지·공정(위치 맥락)을 함께 달고,
 *   다른 자리에 있는 사람에게는 그 위치로 이동하는 액션을 붙인다. 회차와
 *   공정이 여럿인 제작 허브에서는 이름만으로는 "어디를 보는지"가 동선이
 *   되지 않기 때문이다 (presence-location-model이 라벨·판정을 담당).
 * - 세션이 끝나면 결정 이력 요약을 보여 준다. 검수는 채팅처럼 흘러가지 않고
 *   "누가 무엇을 판정했는가"로 남는다.
 */
export function ReviewSessionBar({
  session,
  selfActorId,
  canHost,
  error,
  participantLocations,
  onLocateParticipant,
  summaryExport,
  onStart,
  onJoin,
  onLeave,
  onToggleFocus,
  onEnd,
  now,
}: ReviewSessionBarProps) {
  const bt = useBilingual("ReviewSessionBar");
  const display = deriveSessionPresence(session, selfActorId, now);
  const selfParticipant = display.participants.find((p) => p.isSelf);
  const isHost = Boolean(session && selfActorId && session.hostActorId === selfActorId);
  const sessionLive = Boolean(session && display.reason !== "ended" && session.state === "live");

  if (error) {
    return (
      <div data-review-session="error" className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn/35 bg-warn/10 px-3 py-2.5" role="alert">
        <p className="min-w-0 text-xs font-semibold leading-5 text-fg">
          {bt("세션 상태를 불러오지 못했습니다.", "The session state could not be loaded.")}
          <span className="text-fg-2"> {error}</span>
        </p>
      </div>
    );
  }

  // 종료된 세션: 결정 이력 요약
  if (session && !sessionLive) {
    const summary = summarizeReviewSession(session, now);
    return (
      <div data-review-session="ended" className="rounded-2xl border border-line bg-panel px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Users className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
          <p className="text-xs font-semibold leading-5 text-fg" role="status">
            {bt(
              `함께 보기가 끝났습니다. 참여 ${summary.participantCount}명 · 승인 ${summary.approvals}건 · 수정 요청 ${summary.changeRequests}건이 기록됐어요.`,
              `The review session ended. ${summary.participantCount} joined · ${summary.approvals} approvals · ${summary.changeRequests} change requests recorded.`,
            )}
          </p>
        </div>
        {summary.decisions.length ? (
          <ul className="mt-2 space-y-1" aria-label={bt("세션 결정 이력", "Session decisions")}>
            {summary.decisions.map((decision) => (
              <li key={decision.id} className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] leading-4 text-fg-2">
                <ProductionPill tone={decision.kind === "approve" ? "success" : decision.kind === "request-changes" ? "warning" : "neutral"}>
                  {decision.kind === "approve"
                    ? bt("승인", "Approved")
                    : decision.kind === "request-changes"
                      ? bt("수정 요청", "Changes requested")
                      : bt("메모", "Note")}
                </ProductionPill>
                <span className="font-semibold text-fg">{decision.displayName}</span>
                <span className="min-w-0">{decision.summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
            {bt("이 세션에서 남긴 판정은 없습니다.", "No decisions were recorded in this session.")}
          </p>
        )}
        {summaryExport ? (
          <p
            data-review-session-summary-exported={summaryExport.sessionId}
            className="mt-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold leading-4 text-accent"
            role="status"
          >
            <ScrollText className="size-3.5 shrink-0" aria-hidden="true" />
            {bt(
              "이 요약이 회차 검수 기록에 붙었어요. 다음 단계 인계에도 자동으로 포함됩니다.",
              "This summary is attached to the episode's review record and will be included in the next handoff.",
            )}
          </p>
        ) : null}
      </div>
    );
  }

  // 열린 세션이 없음: 시작만 조용히 제안한다 (상시 프레즌스 신호 없음)
  if (!session) {
    return (
      <div data-review-session="none" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Users className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
          <p className="min-w-0 text-xs font-semibold leading-5 text-fg">
            {bt(
              "함께 보기를 시작하면, 세션 동안만 서로의 커서와 보고 있는 위치가 보입니다.",
              "Start a shared viewing session — cursors and positions are visible only during the session.",
            )}
          </p>
        </div>
        <div className="ml-auto">
          {selfActorId && canHost ? (
            <button type="button" onClick={onStart} className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })}>
              <Play className="size-4" aria-hidden="true" />
              {bt("함께 보기 시작", "Start shared viewing")}
            </button>
          ) : (
            <span className="text-[0.6875rem] font-semibold text-fg-3">
              {bt("열린 세션이 없습니다", "No session is open")}
            </span>
          )}
        </div>
      </div>
    );
  }

  // 세션이 열려 있지만 나는 아직 참여 전: 명단은 보이지 않고 참여만 제안한다
  if (!display.visible) {
    return (
      <div data-review-session="open" className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-3 py-2.5">
        <p className="min-w-0 text-xs font-semibold leading-5 text-fg" role="status">
          {bt("함께 보기 세션이 열려 있습니다. 참여하면 서로의 커서가 보이기 시작해요.", "A shared viewing session is open. Join to start seeing each other's cursors.")}
        </p>
        <div className="ml-auto">
          {selfActorId ? (
            <button type="button" onClick={onJoin} className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })}>
              <DoorOpen className="size-4" aria-hidden="true" />
              {bt("세션 참여하기", "Join session")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // 세션 참여 중
  return (
    <div data-review-session="live" className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <CircleDot className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <p className="min-w-0 text-xs font-semibold leading-5 text-fg" role="status">
          {selfParticipant?.attention === "focus"
            ? bt("집중 모드입니다. 내 위치는 다른 사람에게 보이지 않아요.", "You are in focus mode. Your position is hidden from others.")
            : bt("함께 보는 중입니다. 서로의 커서와 위치가 보여요.", "Viewing together. Cursors and positions are visible to each other.")}
        </p>
      </div>

      <ul className="flex flex-wrap items-center gap-1.5" aria-label={bt("세션 참여자", "Session participants")}>
        {display.participants.map((participant) => {
          // 위치 맥락: 칩에 지금 보고 있는 회차·페이지·공정을 함께 단다.
          // 집중 모드인 사람은 세션 정책상 위치 신호를 숨기므로 라벨도 붙이지
          // 않고, 위치를 모르는 사람에게는 지어내지 않는다.
          const location = participant.attention === "focus"
            ? null
            : (participantLocations?.[participant.actorId] ?? null);
          const locationLabel = location ? formatPresenceLocation(location) : null;
          const selfLocation = selfActorId ? (participantLocations?.[selfActorId] ?? null) : null;
          // 이동 액션: 남의 위치이면서 나와 다른 자리일 때만 낸다. 이미 같은
          // 자리를 보는 중이면 눌러도 달라질 게 없어 버튼 자체를 두지 않는다.
          const canLocate = Boolean(
            onLocateParticipant
            && location
            && !participant.isSelf
            && !(selfLocation && isSamePresenceLocation(selfLocation, location)),
          );
          return (
            <li key={participant.actorId} className="inline-flex items-center gap-1">
              <span
                className={cn(
                  "inline-flex min-h-7 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[0.6875rem] font-semibold",
                  participant.attention === "focus" ? "border-line bg-panel text-fg-3" : "border-accent/40 bg-card text-fg",
                )}
                title={participant.attention === "focus"
                  ? bt(`${participant.displayName} · 집중 중 (위치 숨김)`, `${participant.displayName} · focusing (position hidden)`)
                  : locationLabel
                    ? bt(`${participant.displayName} · ${locationLabel.ko}`, `${participant.displayName} · ${locationLabel.en}`)
                    : bt(`${participant.displayName} · 함께 보는 중`, `${participant.displayName} · viewing together`)}
              >
                <ProductionAvatar name={participant.displayName} size="sm" />
                <span className="max-w-28 truncate">
                  {participant.displayName}
                  {participant.isSelf ? bt(" (나)", " (you)") : ""}
                  {participant.isHost ? bt(" · 진행자", " · host") : ""}
                </span>
                {locationLabel ? (
                  <span className="inline-flex items-center gap-0.5 text-fg-3">
                    <MapPin className="size-3" aria-hidden="true" />
                    <span className="max-w-44 truncate">{bt(locationLabel.ko, locationLabel.en)}</span>
                  </span>
                ) : null}
                {participant.attention === "focus" ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Focus className="size-3" aria-hidden="true" />
                    {bt("집중 중", "Focusing")}
                  </span>
                ) : null}
              </span>
              {canLocate && onLocateParticipant ? (
                <button
                  type="button"
                  onClick={() => onLocateParticipant(participant.actorId)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border border-accent/40 bg-card px-2 text-[0.6875rem] font-bold text-accent outline-none transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  aria-label={bt(`${participant.displayName}님 위치로 이동`, `Go to where ${participant.displayName} is`)}
                  title={bt(`${participant.displayName}님이 보는 화면으로 이동합니다`, `Jump to what ${participant.displayName} is viewing`)}
                >
                  <Navigation className="size-3" aria-hidden="true" />
                  {bt("이동", "Go")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="ml-auto flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onToggleFocus}
          aria-pressed={selfParticipant?.attention === "focus"}
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
        >
          <Focus className="size-4" aria-hidden="true" />
          {selfParticipant?.attention === "focus" ? bt("집중 모드 끄기", "Leave focus mode") : bt("집중 모드", "Focus mode")}
        </button>
        <button type="button" onClick={onLeave} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
          <DoorOpen className="size-4" aria-hidden="true" />
          {bt("세션 나가기", "Leave session")}
        </button>
        {isHost ? (
          <button type="button" onClick={onEnd} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
            <Square className="size-4" aria-hidden="true" />
            {bt("세션 종료", "End session")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
