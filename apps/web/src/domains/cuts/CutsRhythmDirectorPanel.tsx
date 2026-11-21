/**
 * CutsRhythmDirectorPanel.tsx — 컷츠 스튜디오 2단계 감정 템포·비트 연출기.
 *
 * 초보자도 1초 만에 4종 감정 템포 프리셋을 선택하고 배속·시네마 레터박스·샷별 길이
 * 미세 조정을 실시간 미리보기에 반영하며 로컬에 자동 저장한다.
 */

import { Film, Gauge, Minus, Plus, RotateCcw, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { formatClipDuration } from "./cuts-clip-builder";
import {
  CUTS_PLAYBACK_RATES,
  CUTS_RHYTHM_PRESETS,
  type CutsPlaybackRate,
  type CutsRhythmConfig,
  type CutsRhythmPresetId,
} from "./cuts-rhythm-director";
import type { CutsClip } from "./cuts-types";

import "./cuts-rhythm-fx.css";

interface CutsRhythmDirectorPanelProps {
  readonly clip: CutsClip;
  readonly config: CutsRhythmConfig;
  readonly activeShotIndex: number;
  readonly onSelectPreset: (presetId: CutsRhythmPresetId) => void;
  readonly onChangeRate: (rate: CutsPlaybackRate) => void;
  readonly onToggleLetterbox: () => void;
  readonly onNudgeShot: (shotId: string, deltaMs: number) => void;
  readonly onJumpShot: (index: number) => void;
  readonly onReset: () => void;
}

const TONE_VAR: Record<"accent" | "accent-2" | "cool" | "good" | "warn", string> = {
  accent: "var(--color-accent)",
  "accent-2": "var(--color-accent-2)",
  cool: "var(--color-cool)",
  good: "var(--color-good)",
  warn: "var(--color-warn)",
};

export function CutsRhythmDirectorPanel({
  clip,
  config,
  activeShotIndex,
  onSelectPreset,
  onChangeRate,
  onToggleLetterbox,
  onNudgeShot,
  onJumpShot,
  onReset,
}: CutsRhythmDirectorPanelProps) {
  const t = useBilingual("cuts");

  return (
    <section
      data-testid="cuts-rhythm-director-panel"
      aria-label={t("감정 템포·시네마 연출기", "Emotion tempo and cinema director")}
      className="cuts-rhythm-director mt-4 break-keep"
    >
      <span className="cuts-rhythm-director__ribbon" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Sparkles size={16} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden="true" />
            {t("장면 분위기 · 리듬 연출", "Scene mood & rhythm director")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {t(
              "분위기 카드 하나만 누르면 카메라 속도·시네마 프레임·컷 길이가 왼쪽 미리보기에 바로 반영돼요.",
              "Pick one mood card to update camera pacing, cinema frame, and shot timing in the preview right away.",
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="cuts-rhythm-reset-btn"
          onClick={onReset}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-[border-color,color,background-color] duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
          {t("기본 리듬 복원", "Reset rhythm")}
        </button>
      </div>

      {/* 4종 1클릭 감정 템포 프리셋 */}
      <div
        role="group"
        aria-label={t("감정 템포 프리셋", "Emotion tempo presets")}
        className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4"
      >
        {CUTS_RHYTHM_PRESETS.map((preset) => {
          const active = config.presetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`cuts-rhythm-preset-${preset.id}`}
              aria-pressed={active}
              onClick={() => onSelectPreset(preset.id)}
              style={{ "--preset-tone": TONE_VAR[preset.accentToken] } as CSSProperties}
              className="cuts-rhythm-preset-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-semibold text-fg">
                  {t(preset.labelKo, preset.labelEn)}
                </span>
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: TONE_VAR[preset.accentToken] }}
                />
              </span>
              <span className="text-xs leading-4 text-fg-2">
                {t(preset.hintKo, preset.hintEn)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 재생 속도 & 시네마 레터박스 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-line/70 pt-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t("재생 속도 선택", "Playback speed")}
        >
          <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-2">
            <Gauge size={14} strokeWidth={1.5} aria-hidden="true" />
            {t("재생 속도", "Speed")}
          </span>
          {CUTS_PLAYBACK_RATES.map((rate) => {
            const active = config.playbackRate === rate;
            return (
              <button
                key={rate}
                type="button"
                data-testid={`cuts-rhythm-rate-${rate}`}
                aria-pressed={active}
                onClick={() => onChangeRate(rate)}
                className={
                  active
                    ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent px-3 text-xs font-semibold tabular-nums text-on-accent transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                    : "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-medium tabular-nums text-fg-2 transition-[border-color,color,background-color] duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                }
              >
                {rate}x
              </button>
            );
          })}
        </div>

        <button
          type="button"
          data-testid="cuts-rhythm-letterbox-toggle"
          aria-pressed={config.letterbox}
          onClick={onToggleLetterbox}
          className={
            config.letterbox
              ? "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 text-xs font-semibold text-accent transition-[border-color,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              : "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-[border-color,background-color,color] duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          }
        >
          <Film size={14} strokeWidth={1.5} aria-hidden="true" />
          {config.letterbox
            ? t("영화 프레임 켜짐", "Cinema frame on")
            : t("영화 프레임 켜기", "Enable cinema frame")}
        </button>
      </div>

      {/* 샷별 비트 미세 조정 */}
      <div className="mt-3 border-t border-line/70 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg">
            {t("컷별 머무는 시간 조절", "Per-shot dwell timing")}
          </span>
          <span data-testid="cuts-rhythm-total-duration" className="text-xs font-medium tabular-nums text-fg-2">
            {t("전체 길이", "Total")} {formatClipDuration(clip.durationMs)}
          </span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {clip.shots.map((shot, index) => {
            const isActive = index === activeShotIndex;
            const sec = (shot.durationMs / 1000).toFixed(1);
            return (
              <li
                key={shot.id}
                className={
                  isActive
                    ? "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent bg-accent-soft/60 px-2.5 py-2"
                    : "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/85 px-2.5 py-2"
                }
              >
                <button
                  type="button"
                  onClick={() => onJumpShot(index)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-panel text-xs font-semibold tabular-nums text-fg">
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate text-xs font-medium text-fg">
                    {shot.caption}
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid={`cuts-rhythm-shot-dec-${shot.id}`}
                    aria-label={t(
                      `컷 ${index + 1} 시간 0.5초 줄이기`,
                      `Shorten shot ${index + 1} by 0.5s`,
                    )}
                    onClick={() => onNudgeShot(shot.id, -500)}
                    className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-panel text-fg-2 transition-[border-color,color] duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                  >
                    <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                  <span
                    data-testid={`cuts-rhythm-shot-sec-${shot.id}`}
                    className="min-w-[3.2rem] text-center text-xs font-semibold tabular-nums text-fg"
                  >
                    {sec}s
                  </span>
                  <button
                    type="button"
                    data-testid={`cuts-rhythm-shot-inc-${shot.id}`}
                    aria-label={t(
                      `컷 ${index + 1} 시간 0.5초 늘리기`,
                      `Extend shot ${index + 1} by 0.5s`,
                    )}
                    onClick={() => onNudgeShot(shot.id, 500)}
                    className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-panel text-fg-2 transition-[border-color,color] duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                  >
                    <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
