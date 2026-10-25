import { Check, Footprints, Hand, UsersRound, X } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioSpaceSocialRequest } from "../StudioVirtualSpaceSocialPanel";
import type { StudioVirtualSpaceGreeting } from "../studio-virtual-space-social";
import { readSpaceProximityPreferences } from "./space-dock-model";

/** 받은 요청·손 흔들기 토스트가 떠 있는 시간. 사라져도 요청은 참가자 패널에 남는다. */
const SPACE_REQUEST_TOAST_MS = 10_000;

const ACTION_LABELS: Readonly<Record<StudioSpaceSocialRequest["action"], readonly [string, string]>> = {
  talk: ["대화 요청", "conversation request"],
  follow: ["함께 이동 요청", "follow request"],
  lead: ["따라오라는 요청", "follow-me request"],
  review: ["함께 검토 초대", "review invitation"],
  "high-five": ["함께 축하 요청", "celebration request"],
};

/**
 * 상단 요청·인사 토스트: 가장 최근에 받은 요청이나 손 흔들기(Gather Wave Reply 대응) 하나를 10초 동안 보여 준다.
 * 수락·거절은 참가자 패널과 같은 응답 경로(respondSocial·respondReview)를 쓰고, 손 흔들기에는 바로 '인사 돌려주기'와 '다가가기'를 제공한다.
 * 따라가기 요청 자동 거절(WorkAdventure ignoreFollowRequests 대응)이 켜져 있으면 follow·lead 토스트를 띄우지 않는다.
 */
export const SpaceRequestToast = memo(function SpaceRequestToast({
  requests, greetings = [], acceptDisabledReason, ignoreFollowRequests, onRespond, onOpenPeople, onWaveBack, onApproach,
}: {
  /** 방향이 incoming이고 상태가 offered인 요청. */
  readonly requests: readonly StudioSpaceSocialRequest[];
  /** 받은 손 흔들기 인사 목록(Gather Wave 대응). */
  readonly greetings?: readonly StudioVirtualSpaceGreeting[];
  readonly acceptDisabledReason: string | null;
  /** 따라가기 요청 자동 거절(WorkAdventure LocalUserStore.ignoreFollowRequests 대응). */
  readonly ignoreFollowRequests?: boolean;
  readonly onRespond: (id: string, response: "accept" | "decline") => void;
  readonly onOpenPeople: () => void;
  /** 손 흔들기에 바로 인사 돌려주기(Wave back). */
  readonly onWaveBack?: (peerId: string) => void;
  /** 인사한 동료에게 걸어가기(Walk to). */
  readonly onApproach?: (peerId: string) => void;
}) {
  const bt = useBilingual("SpaceRequestToast");
  const [expired, setExpired] = useState<ReadonlySet<string>>(() => new Set());
  const dismiss = (id: string) => setExpired((current) => new Set(current).add(id));
  const shouldIgnoreFollow = ignoreFollowRequests ?? readSpaceProximityPreferences().ignoreFollowRequests;
  const visibleRequests = shouldIgnoreFollow
    ? requests.filter((item) => item.action !== "follow" && item.action !== "lead")
    : requests;
  const request = visibleRequests.find((item) => !expired.has(item.id)) ?? null;
  const greeting = !request
    ? greetings.find((item) => item.direction === "incoming" && item.status === "received" && !expired.has(item.id)) ?? null
    : null;
  const activeId = request?.id ?? greeting?.id ?? null;
  useEffect(() => {
    if (!activeId) return undefined;
    const timer = globalThis.setTimeout(() => setExpired((current) => new Set(current).add(activeId)), SPACE_REQUEST_TOAST_MS);
    return () => globalThis.clearTimeout(timer);
  }, [activeId]);
  if (request) {
    const [actionKo, actionEn] = ACTION_LABELS[request.action];
    const name = request.peer.displayName;
    return <section className="space-request-toast" aria-label={bt(`${name}님의 ${actionKo}`, `${actionEn} from ${name}`)} data-space-interactive="true">
      <UsersRound size={18} aria-hidden />
      <p role="status"><strong>{name}</strong> · {bt(`${actionKo}이 왔어요`, `sent a ${actionEn}`)}
        {acceptDisabledReason ? <span className="space-request-toast__reason">{acceptDisabledReason}</span> : null}
      </p>
      <div className="space-request-toast__actions">
        <button type="button" className="space-pill-button space-pill-button--primary" aria-disabled={acceptDisabledReason ? true : undefined}
          title={acceptDisabledReason ?? undefined}
          aria-label={bt(`${name}님의 ${actionKo} 수락`, `Accept ${actionEn} from ${name}`)}
          onClick={() => { if (!acceptDisabledReason) onRespond(request.id, "accept"); }}>
          <Check size={16} aria-hidden />{bt("수락", "Accept")}
        </button>
        <button type="button" className="space-pill-button" aria-label={bt(`${name}님의 ${actionKo} 거절`, `Decline ${actionEn} from ${name}`)}
          onClick={() => onRespond(request.id, "decline")}>
          <X size={16} aria-hidden />{bt("거절", "Decline")}
        </button>
        <button type="button" className="space-pill-button" onClick={onOpenPeople}>{bt("자세히", "Details")}</button>
      </div>
    </section>;
  }
  if (!greeting) return null;
  const peerName = greeting.peer.displayName;
  const peerId = greeting.peer.sessionId;
  return <section className="space-request-toast" aria-label={bt(`${peerName}님의 손 흔들기`, `Wave from ${peerName}`)} data-space-interactive="true">
    <Hand size={18} aria-hidden />
    <p role="status"><strong>{peerName}</strong> · {bt("님이 손을 흔들었어요", "waved at you")}</p>
    <div className="space-request-toast__actions">
      {onWaveBack ? <button type="button" className="space-pill-button space-pill-button--primary"
        aria-label={bt(`${peerName}님에게 인사 돌려주기`, `Wave back to ${peerName}`)}
        onClick={() => { dismiss(greeting.id); onWaveBack(peerId); }}>
        <Hand size={16} aria-hidden />{bt("인사 돌려주기", "Wave back")}
      </button> : null}
      {onApproach ? <button type="button" className="space-pill-button"
        aria-label={bt(`${peerName}님에게 다가가기`, `Walk to ${peerName}`)}
        onClick={() => { dismiss(greeting.id); onApproach(peerId); }}>
        <Footprints size={16} aria-hidden />{bt("다가가기", "Walk to")}
      </button> : null}
      <button type="button" className="space-pill-button" aria-label={bt("인사 알림 닫기", "Dismiss wave notice")}
        onClick={() => dismiss(greeting.id)}>
        <X size={16} aria-hidden />{bt("닫기", "Dismiss")}
      </button>
    </div>
  </section>;
});
