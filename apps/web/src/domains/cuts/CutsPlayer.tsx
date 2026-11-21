/**
 * 컷츠 플레이어 — 9:16 세로형 클립을 브라우저에서 실시간 렌더링한다.
 *
 * MP4 파일을 재생하는 대신 클립 재생 명세(CutsClip)를 따라
 * 샷별 켄 번즈 카메라(Web Animations API) + 자막 + 내레이션(Web Speech)을
 * 동기화한다. 피드에서는 화면에 들어온(active) 클립만 재생하며,
 * 감정 템포 프리셋·배속·시네마 프레임·샷 점프·재생/일시정지를 지원한다.
 */

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { shotIndexAt } from "./cuts-clip-builder";
import {
  getCutsRhythmPreset,
  type CutsPlaybackRate,
  type CutsRhythmPresetId,
} from "./cuts-rhythm-director";
import type { CutsClip, CutsShot, KenBurnsMove } from "./cuts-types";
import { useCutsNarration } from "./use-cuts-narration";

import "./cuts.css";
import "./cuts-rhythm-fx.css";

interface CutsPlayerProps {
  readonly clip: CutsClip;
  /** 피드에서 화면에 들어와 재생해야 하는 상태. */
  readonly active: boolean;
  readonly muted: boolean;
  readonly onToggleMute: () => void;
  readonly rhythmPreset?: CutsRhythmPresetId;
  readonly playbackRate?: CutsPlaybackRate;
  readonly letterbox?: boolean;
  readonly jumpRequest?: { readonly shotIndex: number; readonly nonce: number } | null;
  readonly onShotChange?: (shotIndex: number) => void;
}

function kenBurnsKeyframes(move: KenBurnsMove): Keyframe[] {
  const from = `scale(${move.from.scale}) translate(${move.from.x}%, ${move.from.y}%)`;
  const to = `scale(${move.to.scale}) translate(${move.to.x}%, ${move.to.y}%)`;
  return [{ transform: from }, { transform: to }];
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ShotView({
  shot,
  visible,
  paused,
  easing,
  playbackRate,
}: Readonly<{
  shot: CutsShot;
  visible: boolean;
  paused: boolean;
  easing: string;
  playbackRate: number;
}>) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || !visible || paused) return;
    if (prefersReducedMotion()) return;
    if (typeof image.animate !== "function") return;
    const duration = Math.max(400, Math.round(shot.durationMs / playbackRate));
    const animation = image.animate(kenBurnsKeyframes(shot.kenBurns), {
      duration,
      easing,
      fill: "forwards",
    });
    return () => animation.cancel();
  }, [shot, visible, paused, easing, playbackRate]);

  return (
    <div className="cuts-shot" aria-hidden={!visible}>
      <img
        ref={imageRef}
        src={shot.imageUrl}
        alt={visible ? shot.alt : ""}
        className="cuts-shot__image"
        draggable={false}
      />
      {visible ? (
        <p key={shot.id} className="cuts-shot__caption cuts-shot__caption--kinetic">
          {shot.caption}
        </p>
      ) : null}
    </div>
  );
}

export function CutsPlayer({
  clip,
  active,
  muted,
  onToggleMute,
  rhythmPreset = "flutter",
  playbackRate = 1,
  letterbox = false,
  jumpRequest = null,
  onShotChange,
}: CutsPlayerProps) {
  const t = useBilingual("cuts");
  const narration = useCutsNarration();
  const [positionMs, setPositionMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const positionRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const loopCountRef = useRef(0);

  const preset = getCutsRhythmPreset(rhythmPreset);
  const shotIndex = shotIndexAt(clip, positionMs);
  const shot = clip.shots[shotIndex];
  const playing = active && !paused;

  const jumpToShot = useCallback(
    (index: number) => {
      const target = clip.shots[index];
      if (!target) return;
      positionRef.current = target.startMs;
      setPositionMs(target.startMs);
    },
    [clip.shots],
  );

  useEffect(() => {
    if (!jumpRequest) return;
    jumpToShot(jumpRequest.shotIndex);
  }, [jumpRequest, jumpToShot]);

  useEffect(() => {
    onShotChange?.(shotIndex);
  }, [shotIndex, onShotChange]);

  // 재생 루프 — playing일 때만 playbackRate 배속으로 position을 전진시키고 클립 끝에서 반복한다.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const delta = (now - lastTickRef.current) * playbackRate;
      lastTickRef.current = now;
      positionRef.current += delta;
      if (positionRef.current >= clip.durationMs) {
        positionRef.current = 0;
        loopCountRef.current += 1;
      }
      setPositionMs(positionRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, clip.durationMs, playbackRate]);

  // 샷이 바뀌면 내레이션 — 음소거 또는 일시정지 상태면 말하지 않는다.
  const loopCount = loopCountRef.current;
  useEffect(() => {
    if (!playing || muted || !shot) {
      if (!playing) narration.stop();
      return;
    }
    narration.speakShot(shot);
  }, [playing, muted, shot, loopCount, narration]);

  // 비활성화되면 내레이션 중지.
  useEffect(() => {
    if (!active) narration.stop();
  }, [active, narration]);

  const progress = clip.durationMs > 0 ? Math.min(1, positionMs / clip.durationMs) : 0;

  return (
    <div
      className="cuts-player"
      data-rhythm-preset={rhythmPreset}
      data-letterbox={letterbox ? "true" : "false"}
      role="region"
      aria-label={`${clip.title} ${clip.episodeNumber}화 컷츠`}
    >
      <div className="cuts-player__stage">
        {clip.shots.map((candidate, index) => (
          <ShotView
            key={candidate.id}
            shot={candidate}
            visible={index === shotIndex && active}
            paused={paused}
            easing={preset.easing}
            playbackRate={playbackRate}
          />
        ))}
        {!active ? (
          <img src={clip.thumbnailUrl} alt="" className="cuts-shot__image" draggable={false} />
        ) : null}
      </div>

      <span className="cuts-player__prism-rim" aria-hidden="true" />
      <span className="cuts-player__letterbox-top" aria-hidden="true" />
      <span className="cuts-player__letterbox-bottom" aria-hidden="true" />

      {clip.shots.length > 1 ? (
        <div
          className="cuts-player__segments"
          role="group"
          aria-label={t("컷별 구간 이동", "Jump between shots")}
        >
          {clip.shots.map((candidate, index) => {
            const fillRatio =
              index < shotIndex
                ? 1
                : index > shotIndex
                  ? 0
                  : candidate.durationMs > 0
                    ? Math.max(0, Math.min(1, (positionMs - candidate.startMs) / candidate.durationMs))
                    : 0;
            return (
              <button
                key={candidate.id}
                type="button"
                className="cuts-player__segment-btn"
                onClick={() => jumpToShot(index)}
                aria-current={index === shotIndex ? "true" : undefined}
                aria-label={t(
                  `컷 ${index + 1}로 이동: ${candidate.caption}`,
                  `Jump to shot ${index + 1}: ${candidate.caption}`,
                )}
              >
                <span className="cuts-player__segment-track" aria-hidden="true">
                  <span
                    className="cuts-player__segment-fill"
                    style={{ transform: `scaleX(${fillRatio})` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className="cuts-player__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label={t("재생 진행률", "Playback progress")}
      >
        <div className="cuts-player__progress-bar" style={{ width: `${progress * 100}%` }} />
      </div>

      <button
        type="button"
        className="cuts-player__play-toggle"
        onClick={() => setPaused((value) => !value)}
        aria-pressed={paused}
        aria-label={paused ? t("다시 재생", "Resume playback") : t("일시정지", "Pause playback")}
      >
        {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
      </button>

      <button
        type="button"
        className="cuts-player__mute"
        onClick={onToggleMute}
        aria-pressed={!muted}
        aria-label={muted ? t("소리 켜기", "Unmute") : t("음소거", "Mute")}
      >
        {muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
