import { useCallback, useSyncExternalStore } from "react";

import { readOffice2dSoundMuted, writeOffice2dSoundMuted } from "./office2d/office2d-stage-extensions";
import { setStudioSoundEngineMuted } from "./studio-virtual-space-sound-engine";

export const STUDIO_WEBTOON_WORK_STATUS_IDS = [
  "storyboard",
  "inking",
  "coloring-bg",
  "review-request",
  "short-break",
] as const;

export type StudioWebtoonWorkStatusId = (typeof STUDIO_WEBTOON_WORK_STATUS_IDS)[number];

export interface StudioWebtoonWorkStatusOption {
  readonly id: StudioWebtoonWorkStatusId;
  readonly glyph: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortKo: string;
  readonly shortEn: string;
  /** CSS 토큰 기반 OKLCH 포인트 색 (UI 스타일링 전용). */
  readonly accentOklch: string;
  /** 2D 캔버스 2DContext dot 렌더링용 색. */
  readonly canvasDotColor: string;
}

export const STUDIO_WEBTOON_WORK_STATUSES: readonly StudioWebtoonWorkStatusOption[] = Object.freeze([
  Object.freeze({
    id: "storyboard",
    glyph: "📝",
    labelKo: "콘티 작업 중",
    labelEn: "Storyboarding",
    shortKo: "콘티",
    shortEn: "Board",
    accentOklch: "oklch(0.72 0.14 250)",
    canvasDotColor: "oklch(0.72 0.14 250)",
  }),
  Object.freeze({
    id: "inking",
    glyph: "✒️",
    labelKo: "선화 집중",
    labelEn: "Inking focus",
    shortKo: "선화",
    shortEn: "Inking",
    accentOklch: "oklch(0.74 0.15 294)",
    canvasDotColor: "oklch(0.74 0.15 294)",
  }),
  Object.freeze({
    id: "coloring-bg",
    glyph: "🎨",
    labelKo: "채색·배경",
    labelEn: "Color & BG",
    shortKo: "채색·배경",
    shortEn: "Color",
    accentOklch: "oklch(0.76 0.14 162)",
    canvasDotColor: "oklch(0.76 0.14 162)",
  }),
  Object.freeze({
    id: "review-request",
    glyph: "🔍",
    labelKo: "검수 요청",
    labelEn: "Review needed",
    shortKo: "검수",
    shortEn: "Review",
    accentOklch: "oklch(0.8 0.15 78)",
    canvasDotColor: "oklch(0.8 0.15 78)",
  }),
  Object.freeze({
    id: "short-break",
    glyph: "☕",
    labelKo: "잠시 휴식",
    labelEn: "Short break",
    shortKo: "휴식",
    shortEn: "Break",
    accentOklch: "oklch(0.75 0.14 38)",
    canvasDotColor: "oklch(0.75 0.14 38)",
  }),
]);

export const STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY = "toonstudio:virtual-space:work-status:v1";
export const STUDIO_WEBTOON_WORK_STATUS_EVENT = "toonstudio:virtual-space:work-status-change";
export const STUDIO_SPACE_SOUND_MUTED_EVENT = "toonstudio:virtual-space:sound-muted-change";

const WORK_STATUS_BY_ID: ReadonlyMap<StudioWebtoonWorkStatusId, StudioWebtoonWorkStatusOption> = new Map(
  STUDIO_WEBTOON_WORK_STATUSES.map((item) => [item.id, item] as const),
);

export function isStudioWebtoonWorkStatusId(value: unknown): value is StudioWebtoonWorkStatusId {
  return typeof value === "string" && WORK_STATUS_BY_ID.has(value as StudioWebtoonWorkStatusId);
}

export function studioWebtoonWorkStatusOption(
  id: StudioWebtoonWorkStatusId | null | undefined,
): StudioWebtoonWorkStatusOption | null {
  if (!id) return null;
  return WORK_STATUS_BY_ID.get(id) ?? null;
}

export function readStudioWebtoonWorkStatus(): StudioWebtoonWorkStatusId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY);
    return isStudioWebtoonWorkStatusId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStudioWebtoonWorkStatus(next: StudioWebtoonWorkStatusId | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (next === null) {
      window.localStorage.removeItem(STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY);
    } else if (isStudioWebtoonWorkStatusId(next)) {
      window.localStorage.setItem(STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY, next);
    } else {
      return false;
    }
    window.dispatchEvent(new CustomEvent(STUDIO_WEBTOON_WORK_STATUS_EVENT, { detail: { status: next } }));
    return true;
  } catch {
    return false;
  }
}

export function formatStudioWebtoonWorkStatusBadge(
  id: StudioWebtoonWorkStatusId | null | undefined,
  language: "ko" | "en",
): string | null {
  const option = studioWebtoonWorkStatusOption(id);
  if (!option) return null;
  return `${option.glyph} ${language === "en" ? option.labelEn : option.labelKo}`;
}

export function readStudioWebtoonWorkStatusBadge(language: "ko" | "en"): string | null {
  return formatStudioWebtoonWorkStatusBadge(readStudioWebtoonWorkStatus(), language);
}

function subscribeStudioWebtoonWorkStatus(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY) listener();
  };
  window.addEventListener(STUDIO_WEBTOON_WORK_STATUS_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STUDIO_WEBTOON_WORK_STATUS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * 2D 캔버스·3D 오버레이·HUD·로스터 전역에서 공유하는 웹툰 업무 상태 배지 훅.
 */
export function useStudioWebtoonWorkStatus(): {
  readonly statusId: StudioWebtoonWorkStatusId | null;
  readonly option: StudioWebtoonWorkStatusOption | null;
  readonly setStatusId: (next: StudioWebtoonWorkStatusId | null) => void;
} {
  const statusId = useSyncExternalStore(
    subscribeStudioWebtoonWorkStatus,
    readStudioWebtoonWorkStatus,
    () => null,
  );
  const setStatusId = useCallback((next: StudioWebtoonWorkStatusId | null) => {
    writeStudioWebtoonWorkStatus(next);
  }, []);
  return {
    statusId,
    option: studioWebtoonWorkStatusOption(statusId),
    setStatusId,
  };
}

/** 2D/3D 무대·워크스테이션·축하 차임 간 음소거 상태를 단일 진실 소스로 동기화한다. */
export function setStudioSpaceSoundMuted(muted: boolean): void {
  writeOffice2dSoundMuted(muted);
  setStudioSoundEngineMuted(muted);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STUDIO_SPACE_SOUND_MUTED_EVENT, { detail: { muted } }));
  }
}

export function subscribeStudioSpaceSoundMuted(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === "toonstudio.office2d.soundMuted.v1") listener();
  };
  window.addEventListener(STUDIO_SPACE_SOUND_MUTED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STUDIO_SPACE_SOUND_MUTED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStudioSpaceSoundMuted(): readonly [boolean, (muted: boolean) => void] {
  const muted = useSyncExternalStore(
    subscribeStudioSpaceSoundMuted,
    readOffice2dSoundMuted,
    () => false,
  );
  const setMuted = useCallback((next: boolean) => {
    setStudioSpaceSoundMuted(next);
  }, []);
  return [muted, setMuted] as const;
}

export type StudioCelebrationKind = "focus-sprint" | "milestone-check";

export interface StudioCelebrationEvent {
  readonly id: number;
  readonly kind: StudioCelebrationKind;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly completedCount: number;
}

let celebrationSeq = 0;

export function createStudioCelebrationEvent(input: {
  readonly kind: StudioCelebrationKind;
  readonly completedCount: number;
  readonly workStatusId?: StudioWebtoonWorkStatusId | null;
}): StudioCelebrationEvent {
  celebrationSeq += 1;
  const option = studioWebtoonWorkStatusOption(input.workStatusId);
  const statusTagKo = option ? `${option.glyph} ${option.labelKo}` : "공정 체크포인트";
  const statusTagEn = option ? `${option.glyph} ${option.labelEn}` : "Production checkpoint";
  if (input.kind === "focus-sprint") {
    return Object.freeze({
      id: celebrationSeq,
      kind: input.kind,
      titleKo: `집중 스프린트 완료 · 누적 ${input.completedCount}회`,
      titleEn: `Focus sprint complete · ${input.completedCount} total`,
      detailKo: `${statusTagKo} 구간을 마쳤어요. 잠깐 어깨를 풀고 이어가세요.`,
      detailEn: `Wrapped up ${statusTagEn}. Take a quick breather before the next stretch.`,
      completedCount: input.completedCount,
    });
  }
  return Object.freeze({
    id: celebrationSeq,
    kind: input.kind,
    titleKo: `공정 체크포인트 완료 · ${statusTagKo}`,
    titleEn: `Checkpoint complete · ${statusTagEn}`,
    detailKo: `오늘 누적 ${input.completedCount}번째 마감 체크를 기록했어요.`,
    detailEn: `Recorded milestone check #${input.completedCount} for today.`,
    completedCount: input.completedCount,
  });
}

function systemPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 집중 스프린트 또는 공정 체크포인트 완료 Web Audio 차임.
 * 음소거 상태면 즉시 생략하고, prefers-reduced-motion 환경에서는 절제된 단음 차임으로 완화한다.
 */
export function playStudioCelebrationChime(options?: {
  readonly muted?: boolean;
  readonly reducedMotion?: boolean;
}): boolean {
  const muted = options?.muted ?? readOffice2dSoundMuted();
  if (muted || typeof window === "undefined") return false;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return false;
  const reduced = options?.reducedMotion ?? systemPrefersReducedMotion();
  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes: readonly number[] = reduced ? [523.25] : [523.25, 659.25, 783.99, 1046.5];
    const step = reduced ? 0 : 0.075;
    const peakGain = reduced ? 0.035 : 0.06;
    const noteDuration = reduced ? 0.16 : 0.24;

    notes.forEach((hz, idx) => {
      const startAt = now + idx * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === notes.length - 1 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(hz, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + noteDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + noteDuration + 0.01);
    });

    const totalMs = Math.ceil((notes.length * step + noteDuration + 0.12) * 1000);
    globalThis.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, totalMs);
    return true;
  } catch {
    return false;
  }
}
