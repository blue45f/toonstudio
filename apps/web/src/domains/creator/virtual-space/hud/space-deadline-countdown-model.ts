export interface SpaceDeadlineCountdownSummary {
  readonly dDayLabel: string;
  readonly clockLabel: string;
  readonly overdue: boolean;
  readonly remainingMs: number;
}

export function formatDeadlineCountdown(targetIso: string, nowMs: number): SpaceDeadlineCountdownSummary {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs)) {
    return { dDayLabel: "D-?", clockLabel: "--:--:--", overdue: false, remainingMs: 0 };
  }
  const diff = targetMs - nowMs;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const totalSeconds = Math.floor(abs / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dDayLabel = overdue
    ? `D+${days}`
    : days === 0
      ? "D-DAY"
      : `D-${days}`;
  return {
    dDayLabel,
    clockLabel: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    overdue,
    remainingMs: diff,
  };
}

export function defaultEpisodeDeadlineIso(nowMs = Date.now()): string {
  const next = new Date(nowMs + 3 * 86_400_000);
  next.setHours(22, 0, 0, 0);
  return next.toISOString();
}
