/**
 * cuts-rhythm-director.ts — 컷츠 감정 템포·시네마 연출 모델 & 로컬 영속 저장소.
 *
 * 초보자도 1초 만에 4종 감정 템포 프리셋을 선택하고 배속·샷별 길이·시네마 프레임을
 * 조절해 9:16 컷츠 플레이어와 게시 클립에 즉시 반영할 수 있게 한다.
 */

import type { CutsClip, CutsShot } from "./cuts-types";

export type CutsRhythmPresetId = "flutter" | "chase" | "linger" | "impact";
export type CutsPlaybackRate = 0.75 | 1 | 1.25 | 1.5;
export type CutsReactionId = "chills" | "heart" | "quote" | "art";

export interface CutsRhythmPreset {
  readonly id: CutsRhythmPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly defaultRate: CutsPlaybackRate;
  readonly easing: string;
  readonly durationScale: number;
  readonly defaultLetterbox: boolean;
  readonly accentToken: "accent" | "accent-2" | "cool" | "good" | "warn";
}

export interface CutsRhythmConfig {
  readonly presetId: CutsRhythmPresetId;
  readonly playbackRate: CutsPlaybackRate;
  readonly letterbox: boolean;
  readonly shotDurationOffsetsMs: Readonly<Record<string, number>>;
}

export interface CutsReactionOption {
  readonly id: CutsReactionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly accentToken: "accent" | "accent-2" | "cool" | "good";
}

export const CUTS_PLAYBACK_RATES: readonly CutsPlaybackRate[] = [0.75, 1, 1.25, 1.5];

export const CUTS_RHYTHM_PRESETS: readonly CutsRhythmPreset[] = [
  {
    id: "flutter",
    labelKo: "봄날 설렘",
    labelEn: "Warm flutter",
    hintKo: "부드러운 줌과 따뜻한 프리즘 빛으로 로맨스 장면을 살려요",
    hintEn: "Soft zoom with a warm prism rim for romantic beats",
    defaultRate: 1,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    durationScale: 1,
    defaultLetterbox: false,
    accentToken: "accent",
  },
  {
    id: "chase",
    labelKo: "긴박 추격",
    labelEn: "High-tempo chase",
    hintKo: "빠른 컷 전환과 속도감 있는 움직임으로 액션 몰입을 높여요",
    hintEn: "Snappy pacing and crisp camera push for action scenes",
    defaultRate: 1.25,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    durationScale: 0.82,
    defaultLetterbox: true,
    accentToken: "warn",
  },
  {
    id: "linger",
    labelKo: "깊은 여운",
    labelEn: "Cinematic linger",
    hintKo: "천천히 머무는 카메라와 영화 프레임으로 감정선을 길게 남긴다",
    hintEn: "Slow drift and widescreen letterbox for emotional pauses",
    defaultRate: 0.75,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    durationScale: 1.2,
    defaultLetterbox: true,
    accentToken: "cool",
  },
  {
    id: "impact",
    labelKo: "임팩트 반전",
    labelEn: "Twist impact",
    hintKo: "강한 대비 림 라이트와 탄력 있는 진입으로 반전 컷을 강조해요",
    hintEn: "Bold contrast rim and punchy spring cadence for plot twists",
    defaultRate: 1.25,
    easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    durationScale: 0.9,
    defaultLetterbox: false,
    accentToken: "accent-2",
  },
];

export const CUTS_REACTION_OPTIONS: readonly CutsReactionOption[] = [
  { id: "chills", labelKo: "소름", labelEn: "Chills", accentToken: "cool" },
  { id: "heart", labelKo: "심쿵", labelEn: "Heart", accentToken: "accent" },
  { id: "quote", labelKo: "명대사", labelEn: "Iconic line", accentToken: "accent-2" },
  { id: "art", labelKo: "작화최고", labelEn: "Peak art", accentToken: "good" },
];

export const DEFAULT_CUTS_RHYTHM_CONFIG: CutsRhythmConfig = {
  presetId: "flutter",
  playbackRate: 1,
  letterbox: false,
  shotDurationOffsetsMs: {},
};

const RHYTHM_STORAGE_KEY = "toonstudio.cuts-rhythm-director.v1";
const REACTION_STORAGE_KEY = "toonstudio.cuts-reactions.v1";

const MIN_SHOT_MS = 1400;
const MAX_SHOT_MS = 9000;

export function getCutsRhythmPreset(presetId: CutsRhythmPresetId): CutsRhythmPreset {
  return CUTS_RHYTHM_PRESETS.find((preset) => preset.id === presetId) ?? CUTS_RHYTHM_PRESETS[0]!;
}

export function applyPresetToRhythmConfig(
  current: CutsRhythmConfig,
  presetId: CutsRhythmPresetId,
): CutsRhythmConfig {
  const preset = getCutsRhythmPreset(presetId);
  return {
    ...current,
    presetId: preset.id,
    playbackRate: preset.defaultRate,
    letterbox: preset.defaultLetterbox,
  };
}

export function nudgeShotDurationOffset(
  current: CutsRhythmConfig,
  shotId: string,
  deltaMs: number,
): CutsRhythmConfig {
  const prev = current.shotDurationOffsetsMs[shotId] ?? 0;
  const next = Math.max(-2500, Math.min(3000, prev + deltaMs));
  return {
    ...current,
    shotDurationOffsetsMs: {
      ...current.shotDurationOffsetsMs,
      [shotId]: next,
    },
  };
}

export function applyRhythmToClip(clip: CutsClip, config: CutsRhythmConfig): CutsClip {
  const preset = getCutsRhythmPreset(config.presetId);
  let cursorMs = 0;
  const shots: CutsShot[] = clip.shots.map((shot) => {
    const offset = config.shotDurationOffsetsMs[shot.id] ?? 0;
    const scaled = Math.round(shot.durationMs * preset.durationScale) + offset;
    const durationMs = Math.max(MIN_SHOT_MS, Math.min(MAX_SHOT_MS, scaled));
    const adjusted: CutsShot = {
      ...shot,
      startMs: cursorMs,
      durationMs,
    };
    cursorMs += durationMs;
    return adjusted;
  });

  return {
    ...clip,
    shots,
    durationMs: cursorMs,
  };
}

export function parseCutsRhythmPresetParam(
  raw: string | null | undefined,
): CutsRhythmPresetId | null {
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
  return null;
}

export function loadCutsRhythmConfig(): CutsRhythmConfig {
  if (typeof window === "undefined") return DEFAULT_CUTS_RHYTHM_CONFIG;
  try {
    const raw = window.localStorage.getItem(RHYTHM_STORAGE_KEY);
    if (!raw) return DEFAULT_CUTS_RHYTHM_CONFIG;
    const parsed = JSON.parse(raw) as Partial<CutsRhythmConfig>;
    const presetId: CutsRhythmPresetId =
      parsed.presetId === "chase" || parsed.presetId === "linger" || parsed.presetId === "impact"
        ? parsed.presetId
        : "flutter";
    const playbackRate: CutsPlaybackRate =
      parsed.playbackRate === 0.75 || parsed.playbackRate === 1.25 || parsed.playbackRate === 1.5
        ? parsed.playbackRate
        : 1;
    const letterbox = Boolean(parsed.letterbox);
    const offsets: Record<string, number> = {};
    if (parsed.shotDurationOffsetsMs && typeof parsed.shotDurationOffsetsMs === "object") {
      for (const [key, value] of Object.entries(parsed.shotDurationOffsetsMs)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          offsets[key] = Math.max(-2500, Math.min(3000, Math.round(value)));
        }
      }
    }
    return { presetId, playbackRate, letterbox, shotDurationOffsetsMs: offsets };
  } catch {
    return DEFAULT_CUTS_RHYTHM_CONFIG;
  }
}

export function saveCutsRhythmConfig(config: CutsRhythmConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 저장소 한도/프라이빗 모드에서는 메모리 상태만 유지한다.
  }
}

export type CutsClipReactionCounts = Readonly<Record<CutsReactionId, number>>;
type StoredReactionMap = Record<string, Record<CutsReactionId, number>>;

const EMPTY_REACTIONS: CutsClipReactionCounts = {
  chills: 0,
  heart: 0,
  quote: 0,
  art: 0,
};

function readReactionMap(): StoredReactionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REACTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as StoredReactionMap) : {};
  } catch {
    return {};
  }
}

export function loadClipReactions(clipId: string): CutsClipReactionCounts {
  const map = readReactionMap();
  const entry = map[clipId];
  if (!entry) return EMPTY_REACTIONS;
  return {
    chills: typeof entry.chills === "number" && entry.chills >= 0 ? entry.chills : 0,
    heart: typeof entry.heart === "number" && entry.heart >= 0 ? entry.heart : 0,
    quote: typeof entry.quote === "number" && entry.quote >= 0 ? entry.quote : 0,
    art: typeof entry.art === "number" && entry.art >= 0 ? entry.art : 0,
  };
}

export function incrementClipReaction(
  clipId: string,
  reactionId: CutsReactionId,
): CutsClipReactionCounts {
  const current = loadClipReactions(clipId);
  const next: Record<CutsReactionId, number> = {
    chills: current.chills,
    heart: current.heart,
    quote: current.quote,
    art: current.art,
    [reactionId]: current[reactionId] + 1,
  };
  if (typeof window !== "undefined") {
    try {
      const map = readReactionMap();
      map[clipId] = next;
      window.localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // 프라이빗 모드에서도 즉시 UI 카운트는 반영한다.
    }
  }
  return next;
}
