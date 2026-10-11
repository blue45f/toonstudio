import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { GodotMeetingRoute } from "./studio-godot-meeting-session";

/**
 * Godot 무대 회의 구역 화상 패널 (재개발 3단계 — DESIGN §2.2).
 *
 * 화상은 셸(DOM)이 소유한다: 이 패널은 구역 진입 시 열리고, 연결 경로를
 * 정직하게 표기한다 — P2P 직접 연결인지, P2P가 막혀 폴백 상태인지,
 * 권한이 거부됐는지를 사용자가 구분할 수 있어야 한다.
 */

export interface StudioGodotMeetingPanelProps {
  readonly route: GodotMeetingRoute;
  readonly localStream: MediaStream | null;
  readonly remoteStream: MediaStream | null;
  readonly selfName: string;
  readonly peerName: string | null;
  readonly presenterName: string | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onToggleMic: (enabled: boolean) => void;
  readonly onToggleCam: (enabled: boolean) => void;
}

// 라이브 화상은 실시간 음성이라 자막 트랙이 없다 — 빈 WebVTT를 명시해
// 미디어 자막 규칙을 정직하게 충족한다 (사운드 패널과 같은 방식).
const EMPTY_CAPTIONS = "data:text/vtt;charset=utf-8,WEBVTT%0A%0A";

function routeCopy(
  route: GodotMeetingRoute,
  bt: (ko: string, en: string) => string,
): string {
  switch (route) {
    case "ready":
      return bt(
        "회의 구역에 함께 있어요. 시작하면 카메라·마이크 권한을 요청합니다.",
        "You're together in the meeting zone. Starting asks for camera and microphone permission.",
      );
    case "connecting":
      return bt("화상 연결을 협상하는 중이에요…", "Negotiating the video connection…");
    case "p2p":
      return bt(
        "P2P 직접 연결로 화상 중이에요 (STUN만 사용, 중계 서버 없음).",
        "Video is connected directly peer-to-peer (STUN only, no relay server).",
      );
    case "relay-fallback":
      return bt(
        "이 네트워크에서는 P2P 직접 연결이 막혀 화상을 잇지 못했어요. 공간 프레즌스와 채팅은 WebSocket 보장 경로로 계속 동작합니다.",
        "Peer-to-peer is blocked on this network, so video couldn't connect. Space presence and chat keep working over the guaranteed WebSocket path.",
      );
    case "media-denied":
      return bt(
        "카메라·마이크 권한이 거부됐어요. 브라우저 주소창의 권한 설정을 확인한 뒤 다시 시작해 주세요.",
        "Camera or microphone permission was denied. Check the browser permission settings, then start again.",
      );
    case "failed":
      return bt(
        "화상 연결에 실패했어요. 잠시 후 다시 시작해 주세요.",
        "The video connection failed. Please start again in a moment.",
      );
    case "idle":
    default:
      return bt(
        "회의 구역에 상대가 들어오면 화상을 시작할 수 있어요.",
        "Once your partner enters the meeting zone, you can start video.",
      );
  }
}

export function StudioGodotMeetingPanel({
  route,
  localStream,
  remoteStream,
  selfName,
  peerName,
  presenterName,
  onStart,
  onStop,
  onToggleMic,
  onToggleCam,
}: StudioGodotMeetingPanelProps) {
  const bt = useBilingual("StudioGodotMeetingPanel");
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const active = route === "connecting" || route === "p2p" || route === "relay-fallback";
  const canStart = route === "ready" || route === "media-denied" || route === "failed";

  return (
    <section
      aria-label={bt("회의 구역 화상", "Meeting zone video")}
      data-testid="godot-meeting-panel"
      className="mt-3 rounded-3xl border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold">{bt("회의 구역 화상", "Meeting video")}</h2>
        {presenterName ? (
          <p className="text-sm font-semibold" data-testid="godot-presenter-label">
            {bt(`발표 중: ${presenterName}`, `Presenting: ${presenterName}`)}
          </p>
        ) : null}
        <p role="status" className="text-sm text-fg-2" data-testid="godot-meeting-route">
          {routeCopy(route, bt)}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <figure>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            data-testid="godot-remote-video"
            className="aspect-video w-full rounded-2xl bg-black/80"
          >
            <track kind="captions" src={EMPTY_CAPTIONS} srcLang="zxx" label="No speech" />
          </video>
          <figcaption className="mt-1 text-xs text-fg-2">
            {peerName ?? bt("상대", "Partner")}
          </figcaption>
        </figure>
        <figure>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            data-testid="godot-local-video"
            className="aspect-video w-full rounded-2xl bg-black/80"
          >
            <track kind="captions" src={EMPTY_CAPTIONS} srcLang="zxx" label="No speech" />
          </video>
          <figcaption className="mt-1 text-xs text-fg-2">
            {bt(`나 (${selfName})`, `Me (${selfName})`)}
          </figcaption>
        </figure>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canStart ? (
          <button
            type="button"
            className="text-sm font-bold underline underline-offset-4"
            onClick={onStart}
          >
            {bt("화상 시작", "Start video")}
          </button>
        ) : null}
        {active ? (
          <button
            type="button"
            className="text-sm font-bold underline underline-offset-4"
            onClick={onStop}
          >
            {bt("화상 종료", "Stop video")}
          </button>
        ) : null}
        {localStream ? (
          <>
            <button
              type="button"
              aria-pressed={micOn}
              className="text-sm font-bold underline underline-offset-4"
              onClick={() => {
                const next = !micOn;
                setMicOn(next);
                onToggleMic(next);
              }}
            >
              {micOn ? bt("마이크 끄기", "Mute") : bt("마이크 켜기", "Unmute")}
            </button>
            <button
              type="button"
              aria-pressed={camOn}
              className="text-sm font-bold underline underline-offset-4"
              onClick={() => {
                const next = !camOn;
                setCamOn(next);
                onToggleCam(next);
              }}
            >
              {camOn ? bt("카메라 끄기", "Camera off") : bt("카메라 켜기", "Camera on")}
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default StudioGodotMeetingPanel;
