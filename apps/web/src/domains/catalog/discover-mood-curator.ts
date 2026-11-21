/**
 * discover-mood-curator.ts — 디스커버 1초 무드 × 읽기 시간 큐레이터 순수 매칭 모델.
 *
 * 실제 공개 카탈로그 스냅샷(DiscoverHomeSnapshot)에 존재하는 작품만 추려 매칭한다.
 * 임의 작품이나 허구 수치를 만들지 않으며, 사용자의 최근 선택은 localStorage에 저장한다.
 */

import type { Title } from "@/shared/lib/types";

import type { DiscoverHomeSnapshot } from "./discover-home";

export type DiscoverMoodId = "heart" | "cider" | "healing" | "thrill";
export type DiscoverTempoId = "quick-5m" | "focus-30m" | "binge-complete";

export interface DiscoverMoodOption {
  readonly id: DiscoverMoodId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly keywords: readonly string[];
  readonly toneVar: string;
}

export interface DiscoverTempoOption {
  readonly id: DiscoverTempoId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface DiscoverMoodSelection {
  readonly moodId: DiscoverMoodId;
  readonly tempoId: DiscoverTempoId;
}

export interface CuratedStoryPick {
  readonly title: Title;
  readonly matchReasonKo: string;
  readonly matchReasonEn: string;
}

export const DISCOVER_MOOD_OPTIONS: readonly DiscoverMoodOption[] = [
  {
    id: "heart",
    labelKo: "두근두근 설렘",
    labelEn: "Heart-flutter",
    hintKo: "로맨스·로판·감정선 몰입",
    hintEn: "Romance, drama & slow-burn emotion",
    keywords: ["로맨스", "로판", "순정", "드라마", "학원", "romance", "drama"],
    toneVar: "var(--color-accent)",
  },
  {
    id: "cider",
    labelKo: "통쾌한 사이다",
    labelEn: "High-energy action",
    hintKo: "액션·판타지·무협·성장물",
    hintEn: "Action, fantasy & heroic momentum",
    keywords: ["액션", "판타지", "무협", "헌터", "회귀", "action", "fantasy"],
    toneVar: "var(--color-warn)",
  },
  {
    id: "healing",
    labelKo: "잔잔한 힐링",
    labelEn: "Calm & cozy",
    hintKo: "일상·개그·치유·감성 컷",
    hintEn: "Slice-of-life, comedy & cozy warmth",
    keywords: ["일상", "개그", "힐링", "감성", "코미디", "slice", "comedy"],
    toneVar: "var(--color-good)",
  },
  {
    id: "thrill",
    labelKo: "손에 땀 쥐는 반전",
    labelEn: "Sharp suspense",
    hintKo: "스릴러·미스터리·추리·SF",
    hintEn: "Thriller, mystery & dark twists",
    keywords: ["스릴러", "미스터리", "공포", "추리", "범죄", "SF", "thriller", "mystery"],
    toneVar: "var(--color-cool)",
  },
];

export const DISCOVER_TEMPO_OPTIONS: readonly DiscoverTempoOption[] = [
  {
    id: "quick-5m",
    labelKo: "5분 가볍게",
    labelEn: "Quick 5 min",
    detailKo: "최신 연재·가벼운 첫 화로 바로 진입",
    detailEn: "Fresh releases for an easy first chapter",
  },
  {
    id: "focus-30m",
    labelKo: "30분 몰입",
    labelEn: "30 min dive",
    detailKo: "평점 상위·무료/기다무 연재작 중심",
    detailEn: "Top-rated & wait-free ongoing picks",
  },
  {
    id: "binge-complete",
    labelKo: "완결 정주행",
    labelEn: "Completed binge",
    detailKo: "끝까지 끊김 없이 달릴 완결·고평점작",
    detailEn: "Finished stories ready to binge end-to-end",
  },
];

export const DEFAULT_MOOD_SELECTION: DiscoverMoodSelection = {
  moodId: "heart",
  tempoId: "focus-30m",
};

const STORAGE_KEY = "toonstudio.discover-mood-curator.v1";

function collectUniqueSnapshotTitles(snapshot: DiscoverHomeSnapshot | null): Title[] {
  if (!snapshot) return [];
  const seen = new Set<string>();
  const result: Title[] = [];
  const pools: readonly (readonly Title[] | Title | null | undefined)[] = [
    snapshot.spotlight,
    snapshot.featured,
    snapshot.topRated,
    snapshot.waitFree,
    snapshot.newest,
    snapshot.todayReleases,
  ];
  for (const pool of pools) {
    if (!pool) continue;
    const list = Array.isArray(pool) ? pool : [pool];
    for (const item of list) {
      if (!item || typeof item.id !== "string" || typeof item.slug !== "string" || typeof item.title !== "string" || seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}

export function curateStoriesForMood(
  snapshot: DiscoverHomeSnapshot | null,
  selection: DiscoverMoodSelection,
  limit = 3,
): readonly CuratedStoryPick[] {
  const pool = collectUniqueSnapshotTitles(snapshot);
  if (pool.length === 0) return [];

  const mood =
    DISCOVER_MOOD_OPTIONS.find((item) => item.id === selection.moodId) ?? DISCOVER_MOOD_OPTIONS[0]!;
  const newestIds = new Set((snapshot?.newest ?? []).map((item) => item.id));
  const waitFreeIds = new Set((snapshot?.waitFree ?? []).map((item) => item.id));

  const scored = pool.map((title) => {
    const tokens = [
      ...(Array.isArray(title.genres) ? title.genres : []),
      ...(Array.isArray(title.tags) ? title.tags : []),
    ]
      .join(" ")
      .toLowerCase();

    const genreHits = mood.keywords.filter((keyword) => tokens.includes(keyword.toLowerCase())).length;
    let score = genreHits * 40 + (title.stats?.ratingAvg ?? 0) * 6;
    let reasonKo = genreHits > 0 ? `${mood.labelKo} 장르 일치` : "카탈로그 상위 평점";
    let reasonEn = genreHits > 0 ? `Matches ${mood.labelEn}` : "Top catalog rating";

    if (selection.tempoId === "binge-complete") {
      if (title.status === "completed") {
        score += 36;
        reasonKo = genreHits > 0 ? `${mood.labelKo} · 완결 정주행` : "완결 정주행 추천";
        reasonEn = genreHits > 0 ? `${mood.labelEn} · Completed` : "Completed binge pick";
      }
    } else if (selection.tempoId === "quick-5m") {
      if (newestIds.has(title.id)) {
        score += 28;
        reasonKo = genreHits > 0 ? `${mood.labelKo} · 최신 공개` : "가볍게 시작할 신작";
        reasonEn = genreHits > 0 ? `${mood.labelEn} · Fresh release` : "Fresh easy start";
      }
    } else if (waitFreeIds.has(title.id) || title.status === "ongoing") {
      score += 22;
      reasonKo = genreHits > 0 ? `${mood.labelKo} · 지금 몰입` : "몰입감 높은 연재작";
      reasonEn = genreHits > 0 ? `${mood.labelEn} · Active series` : "Engaging ongoing pick";
    }

    return { title, score, matchReasonKo: reasonKo, matchReasonEn: reasonEn };
  });

  scored.sort(
    (a, b) => b.score - a.score || (b.title.stats?.ratingAvg ?? 0) - (a.title.stats?.ratingAvg ?? 0),
  );

  return scored.slice(0, limit).map(({ title, matchReasonKo, matchReasonEn }) => ({
    title,
    matchReasonKo,
    matchReasonEn,
  }));
}

export function exploreHrefForMoodSelection(selection: DiscoverMoodSelection): string {
  if (selection.tempoId === "binge-complete") return "/explore?status=completed&sort=binge";
  if (selection.tempoId === "quick-5m") return "/explore?sort=newest";
  return "/explore?status=ongoing&sort=popular";
}

export function loadMoodSelection(): DiscoverMoodSelection {
  if (typeof window === "undefined") return DEFAULT_MOOD_SELECTION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MOOD_SELECTION;
    const parsed = JSON.parse(raw) as Partial<DiscoverMoodSelection>;
    const moodId: DiscoverMoodId =
      parsed.moodId === "cider" || parsed.moodId === "healing" || parsed.moodId === "thrill"
        ? parsed.moodId
        : "heart";
    const tempoId: DiscoverTempoId =
      parsed.tempoId === "quick-5m" || parsed.tempoId === "binge-complete"
        ? parsed.tempoId
        : "focus-30m";
    return { moodId, tempoId };
  } catch {
    return DEFAULT_MOOD_SELECTION;
  }
}

export function saveMoodSelection(selection: DiscoverMoodSelection): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // 프라이빗 모드에서도 현재 세션 매칭은 그대로 동작한다.
  }
}
