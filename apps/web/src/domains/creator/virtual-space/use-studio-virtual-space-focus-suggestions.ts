import { useEffect, useMemo, useRef, useState } from "react";

import {
  computeStudioAtelierPulse,
  type StudioAtelierPeerSample,
  type StudioAtelierPulseSnapshot,
} from "./studio-virtual-space-atelier-pulse";
import {
  acceptStudioSuggestion,
  dismissStudioSuggestion,
  EMPTY_STUDIO_SUGGESTION_STATE,
  pickStudioSuggestion,
  reduceStudioSuggestion,
  studioSuggestionPlaceKind,
  type StudioContextSuggestion,
  type StudioSuggestionState,
} from "./studio-virtual-space-context-suggestions";
import {
  createStudioFocusSession,
  pauseStudioFocusSession,
  resumeStudioFocusSession,
  startStudioFocusSession,
  stopStudioFocusSession,
  studioFocusSessionActive,
  tickStudioFocusSession,
  type StudioFocusSession,
} from "./studio-virtual-space-focus-session";
import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import type { StudioWorkDecision } from "./studio-virtual-space-work-bridge";

export interface UseStudioVirtualSpaceFocusSuggestionsInput {
  readonly worldReady: boolean;
  readonly authoringMode: boolean;
  readonly roomId: string | null;
  readonly privateZone: boolean;
  readonly selfSeatedAtDesk: boolean;
  readonly selfActivity: StudioVirtualSpaceActivity;
  readonly selfUserStatus: StudioUserStatus | null;
  readonly peers: readonly StudioAtelierPeerSample[];
  readonly spotlightActive: boolean;
  readonly bt: (ko: string, en: string) => string;
  readonly notify: (message: string, tone?: "info" | "success" | "warn" | "error") => void;
  readonly onApplyWorkStatus: (userStatus: StudioUserStatus, nextActivity?: "focused" | "available") => void;
  readonly onApplyWorkDecisions: (decisions: readonly StudioWorkDecision[], setFocusSession: React.Dispatch<React.SetStateAction<StudioFocusSession>>) => void;
}

export interface StudioVirtualSpaceFocusSuggestionsResult {
  readonly focusSession: StudioFocusSession;
  readonly focusNow: number;
  readonly focusActive: boolean;
  readonly activeSuggestion: StudioContextSuggestion | null;
  readonly atelierPulse: StudioAtelierPulseSnapshot;
  readonly acceptSuggestion: () => void;
  readonly dismissSuggestion: () => void;
  readonly startFocusPulse: () => void;
  readonly pauseFocusSession: () => void;
  readonly resumeFocusSession: () => void;
  readonly stopFocusSession: () => void;
}

/**
 * 공간 맥락 제안·집중 세션(Track J) 및 공감각 아틀리에 펄스(Atelier Pulse 2.0) 통합 훅.
 * 장소(룸)·자세(책상 착석) 신호를 제안 엔진에 넣고, 집중 타이머와 아틀리에 공명 지수를 동기화한다.
 */
export function useStudioVirtualSpaceFocusSuggestions({
  worldReady,
  authoringMode,
  roomId,
  privateZone,
  selfSeatedAtDesk,
  selfActivity,
  selfUserStatus,
  peers,
  spotlightActive,
  bt,
  notify,
  onApplyWorkStatus,
  onApplyWorkDecisions,
}: UseStudioVirtualSpaceFocusSuggestionsInput): StudioVirtualSpaceFocusSuggestionsResult {
  const [focusSession, setFocusSession] = useState<StudioFocusSession>(() => createStudioFocusSession());
  const [focusNow, setFocusNow] = useState(() => Date.now());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [suggestionState, setSuggestionState] = useState<StudioSuggestionState>(EMPTY_STUDIO_SUGGESTION_STATE);
  const focusSessionRef = useRef(focusSession);
  focusSessionRef.current = focusSession;

  const suggestionZoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!worldReady || authoringMode) return;
    if (suggestionZoneRef.current === roomId) return;
    suggestionZoneRef.current = roomId;
    setSuggestionState((current) =>
      reduceStudioSuggestion(
        current,
        roomId ? { kind: "enter-place", place: studioSuggestionPlaceKind(roomId) } : { kind: "exit-place" },
      ),
    );
  }, [authoringMode, roomId, worldReady]);

  const suggestionSeatedRef = useRef(false);
  useEffect(() => {
    if (!worldReady || authoringMode) return;
    if (suggestionSeatedRef.current === selfSeatedAtDesk) return;
    suggestionSeatedRef.current = selfSeatedAtDesk;
    setSuggestionState((current) =>
      reduceStudioSuggestion(current, selfSeatedAtDesk ? { kind: "seated-at-desk" } : { kind: "stood-up" }),
    );
  }, [authoringMode, selfSeatedAtDesk, worldReady]);

  const focusTimerActive = focusSession.phase === "running" || focusSession.phase === "break";
  useEffect(() => {
    if (!focusTimerActive) return undefined;
    const tick = () => {
      const now = Date.now();
      setFocusNow(now);
      const { session, event } = tickStudioFocusSession(focusSessionRef.current, now);
      if (session !== focusSessionRef.current) setFocusSession(session);
      if (event === "focus-completed") {
        notify(bt("집중 세션을 마쳤어요. 잠깐 쉬어 가세요.", "Focus session complete. Take a short break."), "success");
        setSuggestionState((current) => reduceStudioSuggestion(current, { kind: "focus-completed" }));
      } else if (event === "break-completed") {
        notify(bt("휴식이 끝났어요.", "Your break is over."), "info");
      }
    };
    tick();
    const id = globalThis.setInterval(tick, 1000);
    return () => globalThis.clearInterval(id);
  }, [bt, focusTimerActive, notify]);

  useEffect(() => {
    const id = globalThis.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => globalThis.clearInterval(id);
  }, []);

  const focusActive = studioFocusSessionActive(focusSession);
  const activeSuggestion =
    worldReady && !authoringMode
      ? pickStudioSuggestion(
          suggestionState,
          { userStatus: selfUserStatus, focusActive },
          clockNow,
        )
      : null;

  const acceptSuggestion = () => {
    if (!activeSuggestion) return;
    const accepted = acceptStudioSuggestion(suggestionState, activeSuggestion.id, Date.now());
    setSuggestionState(accepted.state);
    onApplyWorkDecisions(accepted.decisions, setFocusSession);
  };

  const dismissSuggestion = () => {
    if (!activeSuggestion) return;
    setSuggestionState((current) => dismissStudioSuggestion(current, activeSuggestion.id, Date.now()));
  };

  const startFocusPulse = () => {
    const now = Date.now();
    setFocusNow(now);
    setFocusSession((current) => startStudioFocusSession(current, now));
    onApplyWorkStatus("focusing", "focused");
    notify(
      bt("25분 아틀리에 집중 세션을 시작했어요.", "Started a 25-minute Atelier focus session."),
      "info",
    );
  };

  const pauseFocusSession = () => setFocusSession((current) => pauseStudioFocusSession(current, Date.now()));
  const resumeFocusSession = () => setFocusSession((current) => resumeStudioFocusSession(current, Date.now()));
  const stopFocusSession = () => {
    setFocusSession((current) => stopStudioFocusSession(current));
    if (selfUserStatus === "focusing") onApplyWorkStatus("available", "available");
  };

  const atelierPulse = useMemo(
    () =>
      computeStudioAtelierPulse({
        roomId,
        privateZone,
        selfActivity,
        selfUserStatus,
        selfSeated: selfSeatedAtDesk,
        focusActive,
        focusPhase: focusSession.phase,
        peers,
        spotlightActive,
      }),
    [focusActive, focusSession.phase, peers, privateZone, roomId, selfActivity, selfSeatedAtDesk, selfUserStatus, spotlightActive],
  );

  return {
    focusSession,
    focusNow,
    focusActive,
    activeSuggestion,
    atelierPulse,
    acceptSuggestion,
    dismissSuggestion,
    startFocusPulse,
    pauseFocusSession,
    resumeFocusSession,
    stopFocusSession,
  };
}
