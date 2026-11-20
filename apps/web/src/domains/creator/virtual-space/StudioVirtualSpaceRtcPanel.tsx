import { Camera, CheckCircle2, CircleHelp, LockKeyhole, Mic, Network, Presentation, RefreshCw, ScreenShare, ScreenShareOff, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import type { StudioLiveCollaborationContextValue } from "../live/studio-live-collaboration-context";
import { STUDIO_HUDDLE_AVAILABILITY_COPY } from "../live/huddle/studio-p2p-huddle-availability";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioLocalScreenShareError, StudioLocalScreenShareStatus } from "./studio-virtual-space-screen-share";
import type { StudioShareBandwidth, StudioShareRoute } from "./studio-virtual-space-bubble-share";
import { STUDIO_SHARE_BANDWIDTH_HINTS } from "./studio-virtual-space-bubble-share";
import { readStudioMediaDiagnostics, studioRtcLiveStatus, type StudioMediaPermission } from "./studio-virtual-space-rtc-diagnostics";

/**
 * 스포트라이트 방송이 켜져 있을 때 진단 패널에 표시하는 최소 정보다.
 * 진단 패널은 미디어 파이프라인을 직접 제어하지 않으며, 실제 P2P 우선 송출 연결은
 * studio-p2p-huddle-controller가 studioSpotlightSendPriority()를 소비하는 후속 작업에서 처리한다.
 */
export interface StudioVirtualSpaceRtcSpotlight {
  readonly active: boolean;
  readonly presenterLabel: string;
  /** 원격 WebRTC P2P 스포트라이트 송출 경로가 활성 연결된 경우 true. */
  readonly liveConnected?: boolean;
}

export interface StudioVirtualSpaceRtcScreenShare {
  readonly status: StudioLocalScreenShareStatus;
  readonly canShare: boolean;
  readonly error: StudioLocalScreenShareError | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
  /** 원격 WebRTC 피어 및 3D 시어터 실송출이 연결된 경우 true. */
  readonly liveConnected?: boolean;
  /** 공유 경로. bubble=근접 그룹, broadcast=스포트라이트/메가폰 방송. */
  readonly scope?: StudioShareRoute;
  readonly onScopeChange?: (scope: StudioShareRoute) => void;
  /** 대역폭 스로틀. */
  readonly bandwidth?: StudioShareBandwidth;
  readonly onBandwidthChange?: (bandwidth: StudioShareBandwidth) => void;
}

function screenShareStatusCopy(
  status: StudioLocalScreenShareStatus,
  error: StudioLocalScreenShareError | null,
  liveConnected: boolean,
  bt: (ko: string, en: string) => string,
): string {
  switch (status) {
    case "requesting": return bt("공유할 화면을 선택하는 중입니다…", "Choosing a screen to share…");
    case "previewing":
      return liveConnected
        ? bt("실시간 화면 공유가 활성 상태입니다. WebRTC 피어 및 3D 리뷰 시어터 월 스크린에 송출됩니다.", "Live screen share is active and streaming to WebRTC peers and the 3D review theater wall screen.")
        : bt("이 브라우저에서만 보이는 로컬 미리보기로 공유 중입니다. 실제 원격 송출은 연결되지 않았습니다.", "Sharing as a local preview in this browser only. Live remote streaming is not connected.");
    case "failed":
      if (error === "unsupported") return bt("이 브라우저는 화면 공유를 지원하지 않습니다. 최신 Chrome·Edge에서 다시 시도해 주세요.", "This browser does not support screen sharing. Please try the latest Chrome or Edge.");
      if (error === "denied") return bt("화면 공유 권한이 거부됐습니다. 브라우저 주소창의 권한 설정을 확인한 뒤 다시 시도해 주세요.", "Screen sharing permission was denied. Check the permission settings in your browser address bar and try again.");
      return bt("화면을 가져오지 못했습니다. 공유할 창을 다시 선택해 주세요.", "Could not capture the screen. Please choose the window to share again.");
    case "idle":
    default:
      return liveConnected
        ? bt("30fps 화면 또는 ToonStudio 2D 캔버스를 근처 팀원과 3D 시어터 스크린에 실시간 공유합니다.", "Stream your 30fps screen or live ToonStudio 2D canvas to nearby teammates and the 3D theater wall.")
        : bt("이 브라우저에서만 보이는 로컬 미리보기로 공유됩니다. 실제 송출이 아닙니다.", "Shared as a local preview in this browser only. Not streamed remotely.");
  }
}

function permissionCopy(value: StudioMediaPermission, bt: (ko: string, en: string) => string): string {
  switch (value) {
    case "granted": return bt("허용됨", "Allowed");
    case "denied": return bt("브라우저에서 차단됨", "Blocked by browser");
    case "prompt": return bt("사용할 때 물어봄", "Ask when used");
    case "unsupported": return bt("지원하지 않음", "Unsupported");
    case "unknown": return bt("아직 요청하지 않음", "Not requested yet");
  }
}

export function StudioVirtualSpaceRtcPanel({ live, entryOnly = false, spotlight = null, screenShare = null }: {
  readonly live?: StudioLiveCollaborationContextValue;
  readonly entryOnly?: boolean;
  readonly spotlight?: StudioVirtualSpaceRtcSpotlight | null;
  readonly screenShare?: StudioVirtualSpaceRtcScreenShare | null;
}) {
  const bt = useBilingual("StudioVirtualSpaceRtcPanel");
  const [media, setMedia] = useState<Awaited<ReturnType<typeof readStudioMediaDiagnostics>> | null>(null);
  const refresh = () => { void readStudioMediaDiagnostics().then(setMedia); };
  useEffect(refresh, []);
  const status = live ? studioRtcLiveStatus(live) : null;
  const copy = status && status !== "ready" ? STUDIO_HUDDLE_AVAILABILITY_COPY[status] : null;
  return <section className="vs2-panel studio-vspace-rtc-panel" aria-label={bt("실시간 협업 진단", "Live collaboration diagnostics")} data-space-interactive="true">
    <header><div><p><Network size={15} aria-hidden /> LIVE CONNECTION</p><h2>{bt("연결과 장치 상태", "Connection & device status")}</h2></div>
      <button type="button" onClick={refresh} aria-label={bt("상태 다시 확인", "Check again")}><RefreshCw size={15} aria-hidden /></button></header>
    <p>{bt("공간 입장 권한, 실시간 전송 연결, 브라우저 미디어 권한은 서로 다른 상태입니다. 입장만으로 마이크나 카메라 권한을 요청하지 않습니다.", "Space admission, live transport and browser media permission are separate. Entering never requests microphone or camera access.")}</p>
    <div className="studio-vspace-rtc-grid">
      <span data-ok={media?.secureContext || undefined}><LockKeyhole size={15} aria-hidden /><b>HTTPS</b><small>{media?.secureContext ? bt("안전한 주소", "Secure context") : bt("HTTPS 필요", "HTTPS required")}</small></span>
      <span data-ok={media?.webRtcSupported || undefined}><Network size={15} aria-hidden /><b>WebRTC</b><small>{media?.webRtcSupported ? bt("브라우저 지원", "Browser supported") : bt("지원하지 않음", "Unsupported")}</small></span>
      <span data-ok={media?.microphone === "granted" || undefined}><Mic size={15} aria-hidden /><b>{bt("마이크", "Microphone")}</b><small>{media ? permissionCopy(media.microphone, bt) : "…"}</small></span>
      <span data-ok={media?.camera === "granted" || undefined}><Camera size={15} aria-hidden /><b>{bt("카메라", "Camera")}</b><small>{media ? permissionCopy(media.camera, bt) : "…"}</small></span>
    </div>
    {!entryOnly && status ? <div className="studio-vspace-live-status" data-status={status}>
      {status === "ready" ? <CheckCircle2 size={17} aria-hidden /> : status === "connecting" ? <CircleHelp size={17} aria-hidden /> : <TriangleAlert size={17} aria-hidden />}
      <div><strong>{status === "ready" ? bt("실시간 팀 연결 준비됨", "Live team connection ready") : bt(copy?.[0] ?? "연결 상태를 확인해 주세요.", copy?.[1] ?? "Check the connection status.")}</strong>
        {status === "ready" ? <small>{bt("텍스트·P2P 데이터는 준비됐습니다. 회의 참여와 미디어 장치는 각각 명시적으로 선택합니다.", "Text and P2P data are ready. Meeting participation and media devices remain explicit choices.")}</small> : null}</div>
    </div> : null}
    {spotlight?.active ? <div className="studio-vspace-live-status" data-status={spotlight.liveConnected ? "ready" : "fallback"}>
      <Presentation size={17} aria-hidden />
      <div><strong>{bt("스포트라이트 우선 송출", "Spotlight priority send")}</strong>
        <small>{spotlight.liveConnected
          ? bt(`발표자 ${spotlight.presenterLabel}의 음성과 공유 화면을 우선 송출합니다.`, `Prioritizing voice and shared screen from presenter ${spotlight.presenterLabel}.`)
          : bt(`로컬 발표자 ${spotlight.presenterLabel}로 지정됐습니다. 원격 자동 음소거·우선 송출은 아직 연결되지 않았습니다.`, `Set local presenter ${spotlight.presenterLabel}. Remote auto-mute and priority send are not connected yet.`)}</small></div>
    </div> : null}
    {!entryOnly && screenShare ? <div className="studio-vspace-live-status" data-status={screenShare.status === "previewing" ? (screenShare.liveConnected ? "ready" : "fallback") : screenShare.status === "failed" ? "error" : screenShare.status === "requesting" ? "connecting" : "idle"}>
      {screenShare.status === "previewing" ? <ScreenShare size={17} aria-hidden /> : <ScreenShareOff size={17} aria-hidden />}
      <div><strong>{bt("화면 공유", "Screen sharing")}</strong>
        <small>{screenShareStatusCopy(screenShare.status, screenShare.error, Boolean(screenShare.liveConnected), bt)}</small>
        {screenShare.status === "previewing" && screenShare.scope
          ? <small>{screenShare.scope === "broadcast"
            ? (screenShare.liveConnected
              ? bt("방송 경로 활성 · 3D 시어터 & 스포트라이트 송출 중", "Broadcast route active · streaming to 3D theater & spotlight")
              : bt("방송 경로 미리보기 · 실제 원격 송출 미연결", "Broadcast route preview · remote streaming not connected"))
            : (screenShare.liveConnected
              ? bt("버블 경로 활성 · 근접 팀원 & 3D 시어터 송출 중", "Bubble route active · streaming to nearby peers & 3D theater")
              : bt("버블 경로 미리보기 · 실제 원격 송출 미연결", "Bubble route preview · remote streaming not connected"))}</small>
          : null}
      </div>
      {screenShare.onScopeChange ? <div className="studio-vspace-rtc-share-options" role="group" aria-label={bt("공유 경로", "Share route")}>
        <button type="button" aria-pressed={(screenShare.scope ?? "bubble") === "bubble"}
          onClick={() => screenShare.onScopeChange?.("bubble")} disabled={screenShare.status === "requesting"}>
          {bt("버블", "Bubble")}</button>
        <button type="button" aria-pressed={screenShare.scope === "broadcast"}
          onClick={() => screenShare.onScopeChange?.("broadcast")} disabled={screenShare.status === "requesting"}>
          {bt("방송", "Broadcast")}</button>
      </div> : null}
      {screenShare.onBandwidthChange ? <label className="studio-vspace-rtc-share-options">
        <span>{bt("화질", "Quality")}</span>
        <select value={screenShare.bandwidth ?? "balanced"}
          onChange={(event) => screenShare.onBandwidthChange?.(event.target.value as StudioShareBandwidth)}
          disabled={screenShare.status === "requesting"}>
          {STUDIO_SHARE_BANDWIDTH_HINTS.map((hint) => (
            <option key={hint.id} value={hint.id}>
              {hint.id === "full" ? bt("높음", "High") : hint.id === "low" ? bt("낮음", "Low") : bt("보통", "Balanced")}
              {` · ${hint.maxWidth}p${hint.maxFps}`}
            </option>
          ))}
        </select>
      </label> : null}
      {screenShare.status === "previewing"
        ? <button type="button" onClick={screenShare.onStop}>{bt("화면 미리보기 중지", "Stop screen preview")}</button>
        : <button type="button" onClick={screenShare.onStart} disabled={!screenShare.canShare || screenShare.status === "requesting"}>{bt("화면 미리보기 시작", "Start screen preview")}</button>}
    </div> : null}
  </section>;
}
