import { ExternalLink, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./promo-clip-player.css";

interface PromoClipPlayerProps {
  readonly src: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly poster?: string;
}

type PlaybackPhase = "idle" | "loading" | "playing" | "paused" | "ended" | "failed";

// 목록의 다른 영상을 고르면 앞 미디어의 decoder와 네트워크도 해제한다.
let activePromoClip: { readonly video: HTMLVideoElement; readonly release: () => void } | null = null;

export function PromoClipPlayer(props: PromoClipPlayerProps) {
  return <PromoClipPlayback key={props.src} {...props} />;
}

function PromoClipPlayback({ src, title, width, height, poster }: PromoClipPlayerProps) {
  const bt = useBilingual("PromoClipPlayer");
  const statusId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const attemptRef = useRef(0);
  const failedAttemptRef = useRef<number | null>(null);
  const previousTimeRef = useRef(0);
  const returnToRetryRef = useRef(false);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [delayed, setDelayed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [loadingCycle, setLoadingCycle] = useState(0);

  const release = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const preserveFailure = failedAttemptRef.current === attemptRef.current;
    attemptRef.current += 1;
    video.pause();
    video.removeAttribute("src");
    video.load();
    previousTimeRef.current = 0;
    setPhase(preserveFailure ? "failed" : "idle");
    setDelayed(false);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      attemptRef.current += 1;
      if (activePromoClip?.video === video) activePromoClip = null;
      if (video?.hasAttribute("src")) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => setDelayed(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [phase, loadingCycle]);

  useLayoutEffect(() => {
    if (phase !== "failed" || !returnToRetryRef.current) return;
    returnToRetryRef.current = false;
    retryRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const failPlayback = useCallback(() => {
    if (!videoRef.current?.hasAttribute("src")) return;
    failedAttemptRef.current = attemptRef.current;
    returnToRetryRef.current = Boolean(rootRef.current?.contains(document.activeElement));
    setPhase("failed");
    setDelayed(false);
  }, []);

  const claimPlayback = useCallback((video: HTMLVideoElement) => {
    if (activePromoClip?.video !== video) activePromoClip?.release();
    activePromoClip = { video, release };
  }, [release]);

  const startPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    claimPlayback(video);
    const attempt = ++attemptRef.current;
    failedAttemptRef.current = null;
    previousTimeRef.current = 0;
    setPhase("loading");
    setLoadingCycle((cycle) => cycle + 1);
    setDelayed(false);
    // 소스 연결과 play를 같은 사용자 이벤트 안에서 실행해 모바일 재생 권한을 유지한다.
    video.src = src;
    video.load();
    video.focus({ preventScroll: true });
    try {
      const playback = video.play();
      void playback.catch((error: unknown) => {
        if (attempt !== attemptRef.current) return;
        if (error instanceof DOMException && error.name === "AbortError" && video.paused) return;
        failPlayback();
      });
    } catch {
      if (attempt === attemptRef.current) failPlayback();
    }
  };

  const canHandlePlaybackEvent = (video: HTMLVideoElement) =>
    video.hasAttribute("src") && !video.error && failedAttemptRef.current !== attemptRef.current;
  const waitingForData = (video: HTMLVideoElement) => {
    if (video.paused || video.ended || !canHandlePlaybackEvent(video)) return;
    setPhase("loading");
  };
  const idle = phase === "idle";
  const failed = phase === "failed";
  const showRecovery = failed || (phase === "loading" && delayed);
  const status = phase === "playing" ? bt("재생 중", "Playing")
    : phase === "paused" ? bt("일시정지됨", "Paused")
      : phase === "ended" ? bt("재생이 끝났어요", "Playback finished")
        : phase === "loading" ? bt("영상을 불러오는 중이에요", "Loading the video") : "";

  return (
    <div ref={rootRef} className="promo-clip-player" data-promo-clip-state={phase} data-promo-clip-orientation={width < height ? "portrait" : "landscape"}>
      <video
        ref={videoRef}
        controls
        muted
        playsInline
        preload="none"
        width={width}
        height={height}
        poster={idle || posterFailed ? undefined : poster}
        aria-label={title}
        aria-describedby={statusId}
        tabIndex={idle || failed ? -1 : 0}
        onPlay={(event) => {
          if (canHandlePlaybackEvent(event.currentTarget)) { claimPlayback(event.currentTarget); setPhase("loading"); }
        }}
        onPlaying={(event) => {
          if (canHandlePlaybackEvent(event.currentTarget) && !event.currentTarget.paused) { setPhase("playing"); setDelayed(false); }
        }}
        onPause={(event) => {
          if (canHandlePlaybackEvent(event.currentTarget) && !event.currentTarget.ended) setPhase("paused");
        }}
        onWaiting={(event) => waitingForData(event.currentTarget)}
        onStalled={(event) => waitingForData(event.currentTarget)}
        onError={(event) => { if (event.currentTarget.error) failPlayback(); }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (canHandlePlaybackEvent(video) && video.currentTime > previousTimeRef.current && !video.paused && !video.ended) {
            setPhase("playing");
            setDelayed(false);
          }
          previousTimeRef.current = video.currentTime;
        }}
        onEnded={(event) => {
          if (canHandlePlaybackEvent(event.currentTarget)) { setPhase("ended"); setDelayed(false); }
        }}
      />
      {idle ? (
        <div className="promo-clip-player__cover">
          {poster && !posterFailed ? <img src={poster} alt="" loading="lazy" decoding="async" onError={() => setPosterFailed(true)} className="promo-clip-player__poster" /> : null}
          <button type="button" onClick={startPlayback} className="mk-button mk-button--primary promo-clip-player__play" aria-label={`${title} · ${bt("재생", "Play")}`}>
            <Play size={18} aria-hidden="true" />{bt("재생", "Play")}
          </button>
          <span className="promo-clip-player__hint">{posterFailed ? bt("미리보기를 불러오지 못했어요. 재생을 눌러 확인해 주세요.", "The preview could not load. Press play to try the video.") : bt("재생할 때 영상을 불러와요", "The video loads when you play it")}</span>
        </div>
      ) : null}
      {showRecovery ? (
        <div className="promo-clip-player__recovery" role={failed ? "alert" : "status"}>
          <strong>{failed ? bt("영상을 재생하지 못했어요", "The video could not play") : bt("재생을 기다리고 있어요", "Waiting for playback")}</strong>
          <p>{failed ? bt("다시 시도하거나 원본을 새 창에서 열어 주세요.", "Try again or open the original in a new tab.") : bt("연결이 느리면 시간이 더 걸릴 수 있어요. 다시 시도하거나 원본을 열 수 있어요.", "A slow connection may need more time. You can retry or open the original.")}</p>
          <div className="promo-clip-player__actions">
            <button ref={retryRef} type="button" onClick={startPlayback} className="mk-button mk-button--primary"><RotateCcw size={16} aria-hidden="true" />{bt("다시 재생", "Retry playback")}</button>
            <a href={src} target="_blank" rel="noopener noreferrer" className="mk-button"><ExternalLink size={16} aria-hidden="true" />{bt("원본 열기", "Open original")}</a>
          </div>
        </div>
      ) : null}
      <span id={statusId} className="sr-only" role="status">{status}</span>
    </div>
  );
}
