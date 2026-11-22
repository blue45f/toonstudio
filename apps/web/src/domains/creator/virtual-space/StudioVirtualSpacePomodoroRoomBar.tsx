import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, PenTool } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_AMBIENT_AUDIO_DEFAULT_GAIN,
  VIRTUAL_SPACE_SEAT_STATUS_META,
  VIRTUAL_SPACE_SEAT_STATUS_ORDER,
  computePomodoroProgressRing,
  createVirtualSpaceSeatStatusMap,
  detectPomodoroRoomBellTransition,
  evaluatePomodoroRoomClock,
  formatPomodoroSolidaritySummary,
  getVirtualSpaceSeatStatus,
  playPomodoroRoomBellChime,
  resolveSilentTabletDrawingMotion,
  setVirtualSpaceSeatStatus,
  type VirtualSpaceSeatStatus,
} from "./virtual-space-pomodoro-room";

export interface VirtualSpacePomodoroSeatItem {
  readonly seatId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly isSelf?: boolean;
}

export interface StudioVirtualSpacePomodoroRoomBarProps {
  readonly seats: readonly VirtualSpacePomodoroSeatItem[];
  readonly seatStatuses?: Readonly<Record<string, VirtualSpaceSeatStatus>>;
  readonly onSeatStatusChange?: (seatId: string, nextStatus: VirtualSpaceSeatStatus) => void;
  /** 테스트·결정론 렌더링용 고정 로컬 시계 epoch(ms). 미지정 시 1초 주기로 로컬 시계를 동기화한다. */
  readonly nowMs?: number;
  readonly reducedMotion?: boolean;
}

export function StudioVirtualSpacePomodoroRoomBar({
  seats,
  seatStatuses: controlledStatuses,
  onSeatStatusChange,
  nowMs,
  reducedMotion = false,
}: StudioVirtualSpacePomodoroRoomBarProps) {
  const bt = useBilingual("StudioVirtualSpacePomodoroRoomBar");
  const [localNowMs, setLocalNowMs] = useState<number>(() => nowMs ?? Date.now());
  const effectiveNowMs = nowMs ?? localNowMs;
  const [bellSoundEnabled, setBellSoundEnabled] = useState(false);
  const [bellNotice, setBellNotice] = useState<string | null>(null);
  const [internalStatuses, setInternalStatuses] = useState<
    Readonly<Record<string, VirtualSpaceSeatStatus>>
  >(() =>
    createVirtualSpaceSeatStatusMap(
      seats.map((seat) => seat.seatId),
      "do-not-disturb",
    ),
  );
  const activeStatuses = controlledStatuses ?? internalStatuses;

  useEffect(() => {
    if (nowMs !== undefined) return undefined;
    const timer = window.setInterval(() => {
      setLocalNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [nowMs]);

  const clock = useMemo(() => evaluatePomodoroRoomClock(effectiveNowMs), [effectiveNowMs]);
  const ring = useMemo(
    () => computePomodoroProgressRing(clock.progress, { radius: 20, strokeWidth: 3.5 }),
    [clock.progress],
  );
  const selfSeat = seats.find((seat) => seat.isSelf) ?? seats[0] ?? null;
  const selfSeatStatus = selfSeat
    ? getVirtualSpaceSeatStatus(activeStatuses, selfSeat.seatId)
    : "do-not-disturb";
  const motion = useMemo(
    () =>
      resolveSilentTabletDrawingMotion({
        phase: clock.phase,
        seatStatus: selfSeatStatus,
        elapsedMs: clock.elapsedMs,
        reducedMotion,
      }),
    [clock.phase, clock.elapsedMs, selfSeatStatus, reducedMotion],
  );
  const solidarity = useMemo(
    () => formatPomodoroSolidaritySummary(seats.length, clock.phase),
    [seats.length, clock.phase],
  );

  const previousNowRef = useRef<number>(effectiveNowMs);
  useEffect(() => {
    const previousNow = previousNowRef.current;
    previousNowRef.current = effectiveNowMs;
    const bellEvent = detectPomodoroRoomBellTransition(previousNow, effectiveNowMs);
    if (!bellEvent) return;
    setBellNotice(bt(bellEvent.messageKo, bellEvent.messageEn));
    if (bellSoundEnabled) {
      playPomodoroRoomBellChime({
        kind: bellEvent.kind,
        enabled: true,
        gain: STUDIO_AMBIENT_AUDIO_DEFAULT_GAIN,
        reducedMotion,
      });
    }
  }, [effectiveNowMs, bellSoundEnabled, reducedMotion, bt]);

  const handleSeatStatusSelect = (seatId: string, nextStatus: VirtualSpaceSeatStatus) => {
    if (!controlledStatuses) {
      setInternalStatuses((prev) => setVirtualSpaceSeatStatus(prev, seatId, nextStatus));
    }
    onSeatStatusChange?.(seatId, nextStatus);
  };

  const center = ring.size / 2;

  return (
    <section
      aria-label={bt("포모도로 공동 마감실 및 좌석 상태", "Pomodoro cowork room and seat status")}
      data-testid="studio-vspace-pomodoro-room-bar"
      data-room-mode={clock.roomMode}
      data-pomodoro-phase={clock.phase}
      data-mic-required={String(clock.micRequired)}
      data-tablet-motion={motion.motionKind}
      data-reduced-motion={String(reducedMotion)}
      className="space-y-3 rounded-xl border border-line bg-panel/95 p-3 text-fg transition-colors motion-reduce:transition-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={bt(
              `${clock.phaseLabelKo} 진행률 ${ring.percent}%`,
              `${clock.phaseLabelEn} progress ${ring.percent}%`,
            )}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ring.percent}
            data-testid="pomodoro-room-progress-ring"
            className="relative grid shrink-0 place-items-center"
            style={{ width: ring.size, height: ring.size }}
          >
            <svg
              width={ring.size}
              height={ring.size}
              viewBox={`0 0 ${ring.size} ${ring.size}`}
              aria-hidden="true"
              className="-rotate-90"
            >
              <circle
                cx={center}
                cy={center}
                r={ring.radius}
                fill="none"
                stroke="var(--color-line)"
                strokeWidth={ring.strokeWidth}
              />
              <circle
                cx={center}
                cy={center}
                r={ring.radius}
                fill="none"
                stroke={clock.phase === "silent-drawing" ? "var(--color-accent)" : "var(--color-good)"}
                strokeWidth={ring.strokeWidth}
                strokeLinecap="round"
                strokeDasharray={ring.strokeDasharray}
                strokeDashoffset={ring.strokeDashoffset}
                className="transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
                style={{ transition: reducedMotion ? "none" : undefined }}
              />
            </svg>
            <span className="pointer-events-none absolute text-[10px] font-bold tabular-nums text-fg">
              {ring.percent}%
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="pomodoro-room-phase-label"
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  clock.phase === "silent-drawing"
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-good bg-good-soft text-good"
                }`}
              >
                {bt(clock.phaseLabelKo, clock.phaseLabelEn)}
              </span>
              <span
                role="timer"
                aria-label={bt(
                  `${clock.phaseLabelKo} 남은 시간 ${clock.clockLabel}`,
                  `${clock.phaseLabelEn} remaining ${clock.clockLabel}`,
                )}
                data-testid="pomodoro-room-clock"
                className="text-base font-bold tabular-nums text-fg"
              >
                {clock.clockLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-0.5 text-[11px] text-fg-2">
                <PenTool
                  size={12}
                  aria-hidden="true"
                  style={{
                    transform: reducedMotion
                      ? "none"
                      : `translate(${motion.stylusOffsetX}px, ${motion.stylusOffsetY}px)`,
                  }}
                />
                {bt("마이크 강요 없음", "No mic required")}
              </span>
            </div>
            <p className="text-xs text-fg-2" data-testid="pomodoro-room-solidarity">
              {bt(solidarity.ko, solidarity.en)} · {bt(motion.solidarityCaptionKo, motion.solidarityCaptionEn)}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="pomodoro-room-bell-toggle-btn"
          aria-pressed={bellSoundEnabled}
          onClick={() => setBellSoundEnabled((enabled) => !enabled)}
          className={`inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors motion-reduce:transition-none ${
            bellSoundEnabled
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:text-fg"
          }`}
        >
          {bellSoundEnabled ? <Bell size={14} aria-hidden="true" /> : <BellOff size={14} aria-hidden="true" />}
          <span>
            {bellSoundEnabled
              ? bt("휴식 벨 소리 켜짐", "Break bell on")
              : bt("휴식 벨 소리 꺼짐", "Break bell off")}
          </span>
        </button>
      </div>

      {bellNotice ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="pomodoro-room-bell-notice"
          className="rounded-lg border border-good bg-good-soft px-2.5 py-1.5 text-xs font-medium text-good"
        >
          {bellNotice}
        </p>
      ) : null}

      <div
        className="space-y-2 border-t border-line pt-2.5"
        aria-label={bt("좌석별 상태 전환", "Per-seat status toggle")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-fg">
            {bt("좌석별 2상태 전환", "Per-seat focus status")}
          </span>
          <span className="text-fg-2">
            {bt("말 걸기 전 좌석 상태를 한눈에 확인해요", "Check each seat status before reaching out")}
          </span>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2" data-testid="pomodoro-room-seat-list">
          {seats.map((seat) => {
            const seatStatus = getVirtualSpaceSeatStatus(activeStatuses, seat.seatId);
            return (
              <li
                key={seat.seatId}
                data-testid={`pomodoro-seat-row-${seat.seatId}`}
                data-seat-status={seatStatus}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-fg">
                    {bt(seat.labelKo, seat.labelEn)}
                  </div>
                  <div className="text-[11px] text-fg-2">
                    {bt(
                      VIRTUAL_SPACE_SEAT_STATUS_META[seatStatus].descriptionKo,
                      VIRTUAL_SPACE_SEAT_STATUS_META[seatStatus].descriptionEn,
                    )}
                  </div>
                </div>
                <div
                  role="group"
                  aria-label={bt(`${seat.labelKo} 좌석 상태`, `${seat.labelEn} seat status`)}
                  className="flex shrink-0 items-center gap-1.5"
                >
                  {VIRTUAL_SPACE_SEAT_STATUS_ORDER.map((statusId) => {
                    const meta = VIRTUAL_SPACE_SEAT_STATUS_META[statusId];
                    const selected = seatStatus === statusId;
                    return (
                      <button
                        key={statusId}
                        type="button"
                        data-testid={`seat-status-${seat.seatId}-${statusId}`}
                        aria-pressed={selected}
                        onClick={() => handleSeatStatusSelect(seat.seatId, statusId)}
                        className={`min-h-11 min-w-11 rounded-lg border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                          selected
                            ? statusId === "do-not-disturb"
                              ? "border-accent bg-accent-soft text-accent"
                              : "border-good bg-good-soft text-good"
                            : "border-line bg-panel text-fg-2 hover:text-fg"
                        }`}
                      >
                        {bt(meta.labelKo, meta.labelEn)}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
