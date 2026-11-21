/**
 * community-fan-pulse-model.ts — 오늘의 창작 응원 & 감상 펄스 보드 순수 모델.
 *
 * 커뮤니티 첫 방문 독자도 1초 만에 응원 반응과 한 줄 응원 스티커를 남기고
 * 브라우저 로컬 저장소에서 그대로 이어볼 수 있도록 관리한다.
 */

export type FanPulseMoodId = "art-peak" | "next-episode" | "goosebumps" | "deadline-cheer";

export interface FanPulseOption {
  readonly id: FanPulseMoodId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly toneVar: string;
}

export interface FanCheerNote {
  readonly id: string;
  readonly moodId: FanPulseMoodId;
  readonly text: string;
  readonly createdAt: string;
}

export interface FanPulseState {
  readonly counts: Readonly<Record<FanPulseMoodId, number>>;
  readonly myPicks: readonly FanPulseMoodId[];
  readonly notes: readonly FanCheerNote[];
}

export const FAN_PULSE_OPTIONS: readonly FanPulseOption[] = [
  {
    id: "art-peak",
    labelKo: "작화 최고",
    labelEn: "Peak artwork",
    hintKo: "선화·색감에 감탄한 컷 응원",
    hintEn: "Cheer for standout line and color",
    toneVar: "var(--color-accent)",
  },
  {
    id: "next-episode",
    labelKo: "다음 화 기대",
    labelEn: "Can't wait for next ep",
    hintKo: "엔딩 컷 보고 바로 누르는 기대감",
    hintEn: "Excitement right after a cliffhanger",
    toneVar: "var(--color-accent-2)",
  },
  {
    id: "goosebumps",
    labelKo: "연출 소름",
    labelEn: "Chills directing",
    hintKo: "스크롤 타이밍과 대사 연출 칭찬",
    hintEn: "Praise for scroll pacing and paneling",
    toneVar: "var(--color-cool)",
  },
  {
    id: "deadline-cheer",
    labelKo: "마감 파이팅",
    labelEn: "Deadline cheer",
    hintKo: "연재 중인 작가에게 전하는 한마디",
    hintEn: "Warm boost for creators on deadline",
    toneVar: "var(--color-good)",
  },
];

export const EMPTY_FAN_PULSE_STATE: FanPulseState = {
  counts: {
    "art-peak": 0,
    "next-episode": 0,
    goosebumps: 0,
    "deadline-cheer": 0,
  },
  myPicks: [],
  notes: [],
};

const STORAGE_KEY = "toonstudio.community-fan-pulse.v1";
const MAX_NOTES = 6;
const MAX_NOTE_LENGTH = 80;

export function toggleFanPulseMood(state: FanPulseState, moodId: FanPulseMoodId): {
  readonly state: FanPulseState;
  readonly added: boolean;
} {
  const alreadyPicked = state.myPicks.includes(moodId);
  const nextPicks = alreadyPicked
    ? state.myPicks.filter((id) => id !== moodId)
    : [...state.myPicks, moodId];
  const nextCount = Math.max(0, state.counts[moodId] + (alreadyPicked ? -1 : 1));
  return {
    added: !alreadyPicked,
    state: {
      ...state,
      myPicks: nextPicks,
      counts: {
        ...state.counts,
        [moodId]: nextCount,
      },
    },
  };
}

export function addFanCheerNote(
  state: FanPulseState,
  moodId: FanPulseMoodId,
  rawText: string,
): FanPulseState | null {
  const text = rawText.trim().slice(0, MAX_NOTE_LENGTH);
  if (!text) return null;
  const note: FanCheerNote = {
    id: `cheer-${Date.now()}-${state.notes.length + 1}`,
    moodId,
    text,
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    notes: [note, ...state.notes].slice(0, MAX_NOTES),
  };
}

export function removeFanCheerNote(state: FanPulseState, noteId: string): FanPulseState {
  return {
    ...state,
    notes: state.notes.filter((note) => note.id !== noteId),
  };
}

export function totalFanPulseVotes(state: FanPulseState): number {
  return (
    state.counts["art-peak"]
    + state.counts["next-episode"]
    + state.counts.goosebumps
    + state.counts["deadline-cheer"]
  );
}

export function loadFanPulseState(): FanPulseState {
  if (typeof window === "undefined") return EMPTY_FAN_PULSE_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FAN_PULSE_STATE;
    const parsed = JSON.parse(raw) as Partial<FanPulseState>;
    const validIds = new Set<FanPulseMoodId>([
      "art-peak",
      "next-episode",
      "goosebumps",
      "deadline-cheer",
    ]);
    const counts = {
      "art-peak": Math.max(0, Number(parsed.counts?.["art-peak"] ?? 0) || 0),
      "next-episode": Math.max(0, Number(parsed.counts?.["next-episode"] ?? 0) || 0),
      goosebumps: Math.max(0, Number(parsed.counts?.goosebumps ?? 0) || 0),
      "deadline-cheer": Math.max(0, Number(parsed.counts?.["deadline-cheer"] ?? 0) || 0),
    };
    const myPicks = Array.isArray(parsed.myPicks)
      ? parsed.myPicks.filter((id): id is FanPulseMoodId => validIds.has(id as FanPulseMoodId))
      : [];
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes
          .filter(
            (entry): entry is FanCheerNote =>
              Boolean(entry)
              && typeof entry.id === "string"
              && typeof entry.text === "string"
              && validIds.has(entry.moodId as FanPulseMoodId),
          )
          .slice(0, MAX_NOTES)
      : [];
    return { counts, myPicks, notes };
  } catch {
    return EMPTY_FAN_PULSE_STATE;
  }
}

export function saveFanPulseState(state: FanPulseState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 프라이빗 모드에서도 메모리 상태는 그대로 유지한다.
  }
}
