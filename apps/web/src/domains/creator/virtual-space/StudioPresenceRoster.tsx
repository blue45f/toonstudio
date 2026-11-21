import { ChevronDown, Coffee, EyeOff, Focus, Moon, Play, ShieldCheck, Users } from "lucide-react";
import { Suspense, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import {
  visibleStudioPresenceExposures,
  type StudioPresenceExposure,
} from "./studio-presence-exposure-policy";
import { userStatusBadge } from "./studio-virtual-space-user-status";
import type { StudioParticipantConnectionState } from "./use-studio-virtual-peer-connection-tracker";

const StudioAiQaCompliancePanel = lazyRetry(
  () =>
    import("../ai-qa-compliance/StudioAiQaCompliancePanel").then((module) => ({
      default: module.StudioAiQaCompliancePanel,
    })),
  "StudioAiQaCompliancePanel",
);

/**
 * 프레즌스 명단 — 세션 한정·집중 존중 표시.
 *
 * 노출 정책(studio-presence-exposure-policy)의 판정만 소비한다:
 * - 세션이 없으면 명단 대신 "신호 없음" 안내만 보인다. 온라인 표시를
 *   상시로 붙여 접속 압박을 만들지 않는 것이 이 표면의 존재 이유다.
 * - 집중 중·자리 비움·휴식 중인 참여자는 초록 점 없이 이름과 상태,
 *   "지금 답을 기대하지 마세요" 류의 문구만으로 표시한다.
 * - 실시간 참여자만 초록 점과 상태 뱃지를 단다.
 *
 * 아이콘은 JSX 요소로만 쓴다 (식별자를 인자로 넘기지 않는다).
 */
export function StudioPresenceRoster({
  sessionActive,
  exposures,
  displayNames,
  selfSessionId,
  connectionStates,
  onStartSession,
}: {
  /** 함께 보기 세션이 열려 있는가. 닫혀 있으면 신호를 그리지 않는다. */
  readonly sessionActive: boolean;
  /** 정책 판정이 끝난 노출 목록 (deriveStudioPresenceExposures 결과). */
  readonly exposures: readonly StudioPresenceExposure[];
  readonly displayNames: ReadonlyMap<string, string>;
  readonly selfSessionId: string;
  /** 참여자별 실시간 연결 상태(연결됨·재연결 중·연결 끊김). */
  readonly connectionStates?: ReadonlyMap<string, StudioParticipantConnectionState>;
  /** 세션 시작 동선. 없으면 시작 버튼을 그리지 않는다. */
  readonly onStartSession?: () => void;
}) {
  const bt = useBilingual("StudioPresenceRoster");
  const [qaPanelOpen, setQaPanelOpen] = useState(false);

  const qaComplianceDisclosure = (
    <details
      data-testid="studio-ai-qa-compliance-disclosure"
      className="group/ai-qa-compliance rounded-2xl border border-line bg-panel"
      aria-label={bt(
        "7대 웹툰 AI 자동 검수 · 심의·말투·시선·픽셀·라이선스 게이트",
        "7-Suite Webtoon AI QA · Compliance, Register, Eyeline, Pixel & Rights Gate",
      )}
      onToggle={(event) => setQaPanelOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2.5">
          <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 [word-break:keep-all]">
            {bt(
              "7대 웹툰 AI 자동 검수 · 심의·말투·시선·픽셀·라이선스 게이트",
              "7-Suite Webtoon AI QA · Compliance, Register, Eyeline, Pixel & Rights Gate",
            )}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-fg-3 transition-transform group-open/ai-qa-compliance:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      {qaPanelOpen ? (
        <div className="border-t border-line p-3 sm:p-4">
          <Suspense
            fallback={
              <div role="status" className="rounded-xl border border-line bg-card p-4 text-xs text-fg-2">
                {bt(
                  "7대 웹툰 AI 자동 검수 관제판을 불러오는 중입니다.",
                  "Loading 7-Suite Webtoon AI QA Compliance panel.",
                )}
              </div>
            }
          >
            <StudioAiQaCompliancePanel />
          </Suspense>
        </div>
      ) : null}
    </details>
  );

  if (!sessionActive) {
    return (
      <div className="space-y-3">
        <div className="studio-vspace-presence-roster studio-vspace-presence-roster--off">
          <p className="studio-vspace-presence-roster__off-note">
            <EyeOff size={14} aria-hidden />
            {bt(
              "함께 보기 세션이 아니면 서로의 접속 상태를 보여주지 않아요.",
              "Outside a co-viewing session, no one's online status is shown.",
            )}
          </p>
          {onStartSession ? (
            <button type="button" className="studio-vspace-presence-roster__start" onClick={onStartSession}>
              <Play size={14} aria-hidden />
              {bt("함께 보기 시작", "Start co-viewing")}
            </button>
          ) : null}
        </div>
        {qaComplianceDisclosure}
      </div>
    );
  }

  const visible = visibleStudioPresenceExposures(exposures);
  return (
    <div className="space-y-3">
      <div
        className="studio-vspace-presence-roster"
        aria-label={bt("함께 보는 중", "Co-viewing now")}
      >
        <div className="studio-vspace-presence-roster__head">
          <Users size={14} aria-hidden />
          <strong>{bt("함께 보는 중", "Co-viewing")}</strong>
          <span>{visible.length}</span>
        </div>
        <ul className="studio-vspace-presence-roster__list">
          {visible.map((exposure) => {
            const name = displayNames.get(exposure.sessionId)
              ?? bt("참여자", "Participant");
            const badge = userStatusBadge(exposure.status ?? "available");
            return (
              <li
                key={exposure.sessionId}
                className="studio-vspace-presence-roster__item"
                data-presence-exposure={exposure.rosterOnly ? "roster-only" : "live"}
                data-reply-expectation={exposure.replyExpectation}
              >
                {exposure.showOnlineDot ? (
                  <span className="studio-vspace-presence-roster__dot" aria-hidden />
                ) : null}
                <span className="studio-vspace-presence-roster__name">
                  {name}
                  {exposure.sessionId === selfSessionId
                    ? bt(" (나)", " (you)")
                    : ""}
                </span>
                {exposure.rosterOnly ? (
                  <span className="studio-vspace-presence-roster__quiet">
                    {exposure.status === "focusing" ? (
                      <Focus size={13} aria-hidden />
                    ) : exposure.status === "break" ? (
                      <Coffee size={13} aria-hidden />
                    ) : (
                      <Moon size={13} aria-hidden />
                    )}
                    {bt(badge.ko, badge.en)}
                  </span>
                ) : (
                  <span className="studio-vspace-presence-roster__badge">
                    {bt(badge.ko, badge.en)}
                  </span>
                )}
                {exposure.note ? (
                  <small className="studio-vspace-presence-roster__note">
                    {bt(exposure.note.ko, exposure.note.en)}
                  </small>
                ) : null}
                {connectionStates?.get(exposure.sessionId) ? (
                  <small
                    className="studio-vspace-presence-roster__conn"
                    data-connection-state={connectionStates.get(exposure.sessionId)}
                  >
                    {connectionStates.get(exposure.sessionId) === "connected"
                      ? bt("연결됨", "Connected")
                      : connectionStates.get(exposure.sessionId) === "reconnecting"
                        ? bt("재연결 중", "Reconnecting")
                        : bt("연결 끊김", "Disconnected")}
                  </small>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      {qaComplianceDisclosure}
    </div>
  );
}
