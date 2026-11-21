export type ReaderCutsPresetId = "flutter" | "chase" | "linger" | "impact";

export type ReaderMoodId = "heart" | "tension" | "afterglow" | "twist";

export interface ReaderMoodOption {
  readonly id: ReaderMoodId;
  readonly presetId: ReaderCutsPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly toneToken: "accent" | "accent-2" | "cool" | "good";
}

export const READER_FOCUS_STORAGE_KEY = "toonstudio.reader-focus-calm.v1";

export const READER_CUTS_MOODS: readonly ReaderMoodOption[] = [
  {
    id: "heart",
    presetId: "flutter",
    labelKo: "설렘",
    labelEn: "Heartfelt",
    hintKo: "부드러운 여운과 감성 전환으로 이어가요",
    hintEn: "Soft emotional pacing with gentle drift",
    toneToken: "accent",
  },
  {
    id: "tension",
    presetId: "chase",
    labelKo: "긴박",
    labelEn: "Tension",
    hintKo: "빠른 컷 전환과 강한 타격 리듬을 입혀요",
    hintEn: "Snappy cuts with crisp impact timing",
    toneToken: "accent-2",
  },
  {
    id: "afterglow",
    presetId: "linger",
    labelKo: "여운",
    labelEn: "Afterglow",
    hintKo: "대사와 표정에 숨을 고르는 시네마 템포예요",
    hintEn: "Cinematic swells for dialogue and expressions",
    toneToken: "cool",
  },
  {
    id: "twist",
    presetId: "impact",
    labelKo: "반전",
    labelEn: "Twist",
    hintKo: "정적 뒤에 결정적 컷을 힘 있게 띄워요",
    hintEn: "Hold the silence before revealing the key panel",
    toneToken: "good",
  },
] as const;

export function resolveReaderMood(id: ReaderMoodId): ReaderMoodOption {
  return READER_CUTS_MOODS.find((item) => item.id === id) ?? READER_CUTS_MOODS[0];
}

export function resolveCutsRhythmPresetFromQuery(
  raw: string | null | undefined,
): ReaderCutsPresetId | null {
  if (!raw) return null;
  const normalized = raw.trim();
  if (
    normalized === "flutter"
    || normalized === "chase"
    || normalized === "linger"
    || normalized === "impact"
  ) {
    return normalized;
  }
  const byMood = READER_CUTS_MOODS.find((item) => item.id === normalized);
  return byMood ? byMood.presetId : null;
}

export function buildReaderCutsStudioHref(input: {
  readonly slug: string;
  readonly episode: number;
  readonly mood?: ReaderMoodId;
}): string {
  const params = new URLSearchParams();
  params.set("fromTitle", input.slug);
  params.set("ep", String(input.episode));
  if (input.mood) {
    params.set("mood", resolveReaderMood(input.mood).presetId);
  }
  return `/cuts/studio?${params.toString()}`;
}

/**
 * 읽기 전용 복원 — 마운트·스크롤 중에는 절대 localStorage에 쓰지 않는다.
 */
export function loadReaderFocusCalm(): boolean {
  try {
    return window.localStorage.getItem(READER_FOCUS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 사용자가 직접 집중 읽기 버튼을 클릭했을 때만 호출한다.
 */
export function saveReaderFocusCalm(enabled: boolean): void {
  try {
    window.localStorage.setItem(READER_FOCUS_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // 저장소가 제한된 환경에서도 화면 상태는 정상 동작한다.
  }
}
