import { Coffee, EyeOff, Focus, Moon, Play, Users } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  visibleStudioPresenceExposures,
  type StudioPresenceExposure,
} from "./studio-presence-exposure-policy";
import { userStatusBadge } from "./studio-virtual-space-user-status";

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
  onStartSession,
}: {
  /** 함께 보기 세션이 열려 있는가. 닫혀 있으면 신호를 그리지 않는다. */
  readonly sessionActive: boolean;
  /** 정책 판정이 끝난 노출 목록 (deriveStudioPresenceExposures 결과). */
  readonly exposures: readonly StudioPresenceExposure[];
  readonly displayNames: ReadonlyMap<string, string>;
  readonly selfSessionId: string;
  /** 세션 시작 동선. 없으면 시작 버튼을 그리지 않는다. */
  readonly onStartSession?: () => void;
}) {
  const bt = useBilingual("StudioPresenceRoster");

  if (!sessionActive) {
    return (
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
    );
  }

  const visible = visibleStudioPresenceExposures(exposures);
  return (
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
