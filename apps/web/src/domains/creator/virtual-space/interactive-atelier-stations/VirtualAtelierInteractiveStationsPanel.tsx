import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { Brush, Coffee, Disc3, Footprints, Lightbulb, RotateCw, Sparkles, StickyNote, Volume2, VolumeX } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  ATELIER_FOOTSTEP_ORDER, ATELIER_FOOTSTEP_SPECS, AtelierProceduralAudioSynth, EASEL_PIGMENT_TONES,
  createInitialAtelierStationsState, reduceAtelierStationsState,
  type AtelierAudioContextFactory, type AtelierBrewId, type AtelierFootstepSurface, type AtelierSemanticTone,
  type AtelierStationId, type EaselPigmentId, type LightingPresetId, type MannequinPoseId,
  type PomodoroPhaseId, type TurntableTrackId,
} from "./virtual-atelier-stations-engine";

export interface VirtualAtelierInteractiveStationsPanelProps {
  readonly currentZoneId?: string | null;
  readonly weather?: string | null;
  readonly reducedMotion?: boolean;
  readonly audioContextFactory?: AtelierAudioContextFactory;
}

const TONE_DOT: Readonly<Record<AtelierSemanticTone, string>> = Object.freeze({ accent: "bg-accent", cool: "bg-cool", good: "bg-good", warn: "bg-warn" });
const TONE_SURFACE: Readonly<Record<AtelierSemanticTone, string>> = Object.freeze({
  accent: "border-accent bg-accent-soft text-accent", cool: "border-line-strong bg-info-soft text-cool",
  good: "border-line-strong bg-good-soft text-good", warn: "border-line-strong bg-warning-soft text-warn",
});
const PIGMENTS: readonly (readonly [EaselPigmentId, string, string])[] = [
  ["persimmon", "주홍", "Persimmon"], ["cobalt", "코발트", "Cobalt"], ["emerald", "에메랄드", "Emerald"], ["ochre", "황토", "Ochre"],
];
const TRACKS: readonly (readonly [TurntableTrackId, string, string])[] = [
  ["lofi-ink", "로파이 잉크", "Lo-fi Ink"], ["rain-jazz", "비 재즈", "Rain Jazz"], ["midnight-vinyl", "심야 LP", "Midnight LP"],
];
const POSES: readonly (readonly [MannequinPoseId, string, string])[] = [
  ["hero-stance", "히어로", "Hero"], ["action-leap", "도약", "Leap"], ["seated-sketch", "좌식", "Seated"], ["dialogue-turn", "대화", "Dialogue"],
];
const BREWS: readonly (readonly [AtelierBrewId, string, string])[] = [
  ["hand-drip", "핸드드립", "Hand Drip"], ["espresso", "에스프레소", "Espresso"], ["matcha-latte", "말차 라떼", "Matcha"],
];
const PHASES: readonly (readonly [PomodoroPhaseId, string, string])[] = [
  ["focus-25", "집중 25분", "Focus 25m"], ["break-5", "휴식 5분", "Break 5m"], ["deep-50", "딥워크 50분", "Deep 50m"],
];
const LIGHTINGS: readonly (readonly [LightingPresetId, string, string, AtelierSemanticTone])[] = [
  ["morning-sun", "아침 햇살", "Morning Sun", "warn"], ["golden-hour", "노을 아워", "Golden Hour", "accent"],
  ["blue-dusk", "블루 더스크", "Blue Dusk", "cool"], ["midnight-desk", "심야 스탠드", "Midnight Desk", "good"],
];

function readOsReducedMotion(): boolean {
  return typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 가상 스튜디오 6종 상호작용 스테이션 + 4종 바닥 재질 발걸음 음향·파티클 패널. */
export function VirtualAtelierInteractiveStationsPanel({
  currentZoneId = null,
  weather = null,
  reducedMotion: reducedMotionProp,
  audioContextFactory,
}: VirtualAtelierInteractiveStationsPanelProps) {
  const bt = useBilingual("VirtualAtelierInteractiveStations");
  const [osReducedMotion] = useState(readOsReducedMotion);
  const reducedMotion = reducedMotionProp ?? osReducedMotion;
  const [noteDraft, setNoteDraft] = useState("");
  const [state, dispatch] = useReducer(
    reduceAtelierStationsState,
    { zoneId: currentZoneId, weather },
    createInitialAtelierStationsState,
  );
  const synthRef = useRef<AtelierProceduralAudioSynth | null>(null);

  useEffect(() => () => {
    synthRef.current?.dispose();
    synthRef.current = null;
  }, []);

  const ensureSynth = (): AtelierProceduralAudioSynth => {
    if (!synthRef.current) synthRef.current = new AtelierProceduralAudioSynth(audioContextFactory);
    return synthRef.current;
  };
  const playCue = (station: AtelierStationId, volume = 0.5): void => {
    if (state.soundEnabled) ensureSynth().playStationCue(station, volume);
  };
  const triggerFootstep = (surface?: AtelierFootstepSurface): void => {
    const targetSurface = surface ?? state.footstep.surface;
    const foot = state.footstep.nextFoot;
    dispatch({ type: "footstep-step", surface: targetSurface, reducedMotion });
    if (state.soundEnabled) ensureSynth().playFootstep(targetSurface, foot);
  };
  const handleNoteSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    dispatch({ type: "sticky-add", text: noteDraft, reducedMotion });
    setNoteDraft("");
    playCue("sticky-board");
  };

  const activeLighting = LIGHTINGS.find(([id]) => id === state.lighting.preset) ?? LIGHTINGS[1];
  const lightingKo = activeLighting ? activeLighting[1] : "노을 아워";
  const lightingEn = activeLighting ? activeLighting[2] : "Golden Hour";
  const lightingTone: AtelierSemanticTone = activeLighting ? activeLighting[3] : "accent";
  const motionCls = reducedMotion ? "transition-none" : "transition-transform duration-200 motion-reduce:transition-none";
  const unresolvedCount = state.stickyBoard.notes.filter((note) => !note.resolved).length;

  return (
    <section
      className="mt-5 rounded-2xl border border-line bg-panel p-4 text-fg"
      aria-label={bt("아틀리에 상호작용 스테이션", "Interactive Atelier Stations")}
      data-testid="virtual-atelier-stations-panel"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-lighting-preset={state.lighting.preset}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
            <Sparkles size={16} className="text-accent" aria-hidden="true" />
            {bt("만지고 누르는 아틀리에 스테이션 · 발걸음 음향", "Tactile Atelier Stations & Footstep Audio")}
          </h3>
          <p className="mt-0.5 text-xs text-fg-2">
            {bt("6종 소품 인터랙션과 4종 바닥 재질 Web Audio 발소리를 바로 체험해요.", "Try 6 tactile studio stations and 4 procedural Web Audio floor footsteps.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.soundEnabled}
          onClick={() => dispatch({ type: "sound-toggle" })}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${state.soundEnabled ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg-2"}`}
        >
          {state.soundEnabled ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
          {state.soundEnabled ? bt("효과음 켜짐", "Audio On") : bt("효과음 꺼짐", "Audio Muted")}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2">
        <p className="text-xs font-medium text-fg" aria-live="polite" data-testid="atelier-live-feedback">
          {bt(state.lastFeedbackKo, state.lastFeedbackEn)}
        </p>
        <div className="flex items-center gap-2">
          {!reducedMotion && state.particles.length > 0 ? (
            <span className="pointer-events-none relative inline-flex h-6 w-24 items-center justify-center" aria-hidden="true" data-testid="atelier-particle-stage">
              {state.particles.map((p) => (
                <span
                  key={p.id}
                  data-particle-kind={p.kind}
                  className={`pointer-events-none absolute h-2 w-2 rounded-full ${motionCls} ${TONE_DOT[p.tone]}`}
                  style={{ opacity: p.opacity, willChange: "transform, opacity", transform: `translate3d(${p.txPx}px, ${p.tyPx}px, 0) scale(${p.scale}) rotate(${p.rotateDeg}deg)` }}
                />
              ))}
            </span>
          ) : null}
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE_SURFACE[lightingTone]}`}>
            {bt(lightingKo, lightingEn)} · {state.lighting.brightness}%
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* ① 원목 이젤 실시간 획 스파크 */}
        <article className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-card p-3" data-station="easel">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Brush size={14} className="text-accent" aria-hidden="true" />
              {bt("원목 이젤 실시간 획", "Wood Easel Live Stroke")}
            </h4>
            <span className="text-[11px] font-semibold text-fg-2" data-testid="easel-stroke-count">
              {bt(`${state.easel.strokeCount}획`, `${state.easel.strokeCount} strokes`)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PIGMENTS.map(([id, ko, en]) => (
              <button
                key={id}
                type="button"
                aria-pressed={state.easel.pigment === id}
                onClick={() => dispatch({ type: "easel-pigment", pigment: id })}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${state.easel.pigment === id ? TONE_SURFACE[EASEL_PIGMENT_TONES[id]] : "border-line bg-raised text-fg-2"}`}
              >
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[EASEL_PIGMENT_TONES[id]]}`} aria-hidden="true" />
                {bt(ko, en)}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { dispatch({ type: "easel-stroke", reducedMotion }); playCue("easel"); }} className="min-h-11 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent">
            {bt("이젤 한 획 긋기 · 스파크", "Draw Live Stroke · Spark")}
          </button>
        </article>

        {/* ② 턴테이블 앰비언트/BGM 믹서 */}
        <article className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-card p-3" data-station="turntable">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Disc3 size={14} className="text-cool" aria-hidden="true" />
              {bt("턴테이블 BGM 믹서", "Turntable BGM Mixer")}
            </h4>
            <button type="button" onClick={() => { dispatch({ type: "turntable-rpm" }); playCue("turntable", 0.3); }} className="rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] font-semibold text-fg-2">
              {state.turntable.rpm} RPM
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TRACKS.map(([id, ko, en]) => (
              <button key={id} type="button" aria-pressed={state.turntable.track === id} onClick={() => { dispatch({ type: "turntable-track", track: id }); playCue("turntable", 0.35); }} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${state.turntable.track === id ? TONE_SURFACE.cool : "border-line bg-raised text-fg-2"}`}>
                {bt(ko, en)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={state.turntable.playing} onClick={() => { dispatch({ type: "turntable-toggle", reducedMotion }); playCue("turntable", state.turntable.volume / 100); }} className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-bold ${state.turntable.playing ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg"}`}>
              {state.turntable.playing ? bt("턴테이블 멈춤", "Pause Deck") : bt("턴테이블 재생", "Spin Deck")}
            </button>
            <input type="range" min={0} max={100} value={state.turntable.volume} aria-label={bt("턴테이블 믹서 음량", "Turntable mixer volume")} onChange={(e) => dispatch({ type: "turntable-volume", volume: Number(e.target.value) })} className="w-full accent-accent" />
            <span className="w-9 text-right text-[11px] font-semibold text-fg-2">{state.turntable.volume}%</span>
          </div>
        </article>

        {/* ③ 3D 포즈 마네킹 받침대 회전 */}
        <article className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-card p-3" data-station="mannequin">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <RotateCw size={14} className="text-accent" aria-hidden="true" />
              {bt("3D 포즈 마네킹 받침대", "3D Pose Mannequin Stand")}
            </h4>
            <span className="text-[11px] font-semibold text-fg-2" data-testid="mannequin-angle">{state.mannequin.angleDeg}°</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-raised" aria-hidden="true">
              <span className={`inline-block h-6 w-2 rounded-full bg-accent ${motionCls}`} style={{ willChange: "transform", transform: `rotate(${state.mannequin.angleDeg}deg)` }} />
            </div>
            <div className="flex flex-wrap gap-1">
              {POSES.map(([id, ko, en]) => (
                <button key={id} type="button" aria-pressed={state.mannequin.pose === id} onClick={() => { dispatch({ type: "mannequin-pose", pose: id, reducedMotion }); playCue("mannequin"); }} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${state.mannequin.pose === id ? TONE_SURFACE.accent : "border-line bg-raised text-fg-2"}`}>
                  {bt(ko, en)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => { dispatch({ type: "mannequin-rotate", deltaDeg: -45, reducedMotion }); playCue("mannequin"); }} className="min-h-11 rounded-lg border border-line bg-raised px-2 text-xs font-semibold text-fg">{bt("반시계 -45°", "Rotate -45°")}</button>
            <button type="button" onClick={() => { dispatch({ type: "mannequin-rotate", deltaDeg: 45, reducedMotion }); playCue("mannequin"); }} className="min-h-11 rounded-lg border border-accent bg-accent-soft px-2 text-xs font-semibold text-accent">{bt("시계 +45°", "Rotate +45°")}</button>
          </div>
        </article>

        {/* ④ 팀 수정 포스트잇 보드 */}
        <article className="flex flex-col justify-between gap-2 rounded-xl border border-line bg-card p-3" data-station="sticky-board">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <StickyNote size={14} className="text-warn" aria-hidden="true" />
              {bt("팀 수정 포스트잇 보드", "Team Revision Sticky Board")}
            </h4>
            <button type="button" onClick={() => dispatch({ type: "sticky-clear-resolved" })} className="text-[11px] font-medium text-fg-3 underline-offset-2 hover:underline">
              {bt(`미완료 ${unresolvedCount} · 완료 정리`, `${unresolvedCount} open · Clear done`)}
            </button>
          </div>
          <ul className="flex max-h-24 flex-col gap-1 overflow-y-auto" data-testid="sticky-notes-list">
            {state.stickyBoard.notes.map((note) => (
              <li key={note.id}>
                <button type="button" aria-pressed={note.resolved} onClick={() => { dispatch({ type: "sticky-toggle", id: note.id }); playCue("sticky-board", 0.35); }} className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-[11px] ${note.resolved ? "border-line bg-panel text-fg-3 line-through" : TONE_SURFACE[note.tone]}`}>
                  <span className="truncate">{bt(note.textKo, note.textEn)}</span>
                  <span className="shrink-0 text-[10px] font-bold">{note.resolved ? bt("완료", "Done") : bt("진행", "Open")}</span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleNoteSubmit} className="flex gap-1.5">
            <input type="text" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder={bt("수정 메모 입력 (비우면 추천 스탬프)", "Add note (blank for quick stamp)")} aria-label={bt("수정 포스트잇 내용", "Revision sticky note text")} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg placeholder:text-fg-3" />
            <button type="submit" className="min-h-11 shrink-0 rounded-lg border border-line-strong bg-raised px-3 text-xs font-bold text-fg">{bt("붙이기", "Pin")}</button>
          </form>
        </article>

        {/* ⑤ 아틀리에 커피·뽀모도로 휴식 바 */}
        <article className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-card p-3" data-station="coffee-bar">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Coffee size={14} className="text-warn" aria-hidden="true" />
              {bt("커피 · 뽀모도로 휴식 바", "Coffee & Pomodoro Bar")}
            </h4>
            <span className="text-[11px] font-semibold text-fg-2" data-testid="coffee-cup-count">
              {bt(`${state.coffeeBar.cupsBrewed}잔 · ${state.coffeeBar.remainingMinutes}분`, `${state.coffeeBar.cupsBrewed} cups · ${state.coffeeBar.remainingMinutes}m`)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BREWS.map(([id, ko, en]) => (
              <button key={id} type="button" aria-pressed={state.coffeeBar.brew === id} onClick={() => { dispatch({ type: "coffee-brew", brew: id, reducedMotion }); playCue("coffee-bar"); }} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${state.coffeeBar.brew === id ? TONE_SURFACE.warn : "border-line bg-raised text-fg-2"}`}>
                {bt(ko, en)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PHASES.map(([id, ko, en]) => (
              <button key={id} type="button" aria-pressed={state.coffeeBar.phase === id} onClick={() => dispatch({ type: "coffee-phase", phase: id })} className={`rounded-md border px-2 py-1 text-[11px] font-medium ${state.coffeeBar.phase === id ? TONE_SURFACE.good : "border-line bg-raised text-fg-2"}`}>
                {bt(ko, en)}
              </button>
            ))}
            <button type="button" aria-pressed={state.coffeeBar.running} onClick={() => { dispatch({ type: "coffee-toggle-timer" }); playCue("coffee-bar", 0.4); }} className={`ml-auto min-h-11 rounded-lg border px-3 text-xs font-bold ${state.coffeeBar.running ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg"}`}>
              {state.coffeeBar.running ? bt("타이머 정지", "Stop Timer") : bt("뽀모도로 시작", "Start Timer")}
            </button>
          </div>
        </article>

        {/* ⑥ 채광·시간대 디머 스위치 */}
        <article className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-card p-3" data-station="lighting-dimmer">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Lightbulb size={14} className="text-warn" aria-hidden="true" />
              {bt("채광 · 시간대 디머 스위치", "Daylight & Time Dimmer")}
            </h4>
            <span className="text-[11px] font-semibold text-fg-2" data-testid="lighting-brightness">{state.lighting.brightness}%</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {LIGHTINGS.map(([id, ko, en, tone]) => (
              <button key={id} type="button" aria-pressed={state.lighting.preset === id} onClick={() => { dispatch({ type: "lighting-preset", preset: id, reducedMotion }); playCue("lighting-dimmer"); }} className={`min-h-11 rounded-lg border px-2 text-xs font-semibold ${state.lighting.preset === id ? TONE_SURFACE[tone] : "border-line bg-raised text-fg-2"}`}>
                {bt(ko, en)}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <input type="range" min={20} max={100} value={state.lighting.brightness} aria-label={bt("아틀리에 채광 밝기", "Atelier daylight brightness")} onChange={(e) => dispatch({ type: "lighting-brightness", brightness: Number(e.target.value) })} className="w-full accent-accent" />
            <div className="h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
              <div className={`h-full origin-left rounded-full bg-warn ${motionCls}`} style={{ willChange: "transform", transform: `scaleX(${state.lighting.brightness / 100})` }} />
            </div>
          </div>
        </article>
      </div>

      {/* 4종 바닥 재질별 발걸음 Web Audio 합성 패드 */}
      <div className="mt-4 rounded-xl border border-line bg-card p-3" data-testid="atelier-footstep-deck">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Footprints size={15} className="text-cool" aria-hidden="true" />
            {bt("4종 바닥 재질 발걸음 음향 · 시각 파티클", "4 Floor Material Footstep Synth & Particles")}
          </h4>
          <button type="button" onClick={() => triggerFootstep()} className="min-h-11 rounded-lg border border-accent bg-accent-soft px-3 text-xs font-bold text-accent" data-testid="footstep-step-button">
            {bt(`한 걸음 디디기 (${state.footstep.stepCount})`, `Take a Step (${state.footstep.stepCount})`)}
          </button>
        </div>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ATELIER_FOOTSTEP_ORDER.map((surface) => {
            const spec = ATELIER_FOOTSTEP_SPECS[surface];
            const selected = state.footstep.surface === surface;
            return (
              <button key={surface} type="button" aria-pressed={selected} data-surface={surface} onClick={() => triggerFootstep(surface)} className={`flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-left ${selected ? TONE_SURFACE[spec.tone] : "border-line bg-raised text-fg-2"}`}>
                <span className="text-xs font-bold">{bt(spec.labelKo, spec.labelEn)}</span>
                <span className="text-[11px] opacity-85">{bt(spec.vibeKo, spec.vibeEn)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
