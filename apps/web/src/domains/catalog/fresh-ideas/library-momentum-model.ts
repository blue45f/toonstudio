/**
 * library-momentum-model.ts — /library 내 서재 읽기 모멘텀 & 완독 마라톤 바 순수 모델.
 *
 * 실제 서재 상태(reading · want · done[completed] · hiatus) 카운트와 최근 본 기록만을 바탕으로
 * 완독률과 오늘 이어 볼 추천 작품 1건을 계산한다. 가짜 수치는 일절 생성하지 않는다.
 */

import type { ReadState } from "@/shared/lib/types";

export type LibraryMomentumFilterKey = "reading" | "want" | "done" | "hiatus";

export interface LibraryMomentumCounts {
  readonly reading: number;
  readonly want: number;
  readonly completed: number;
  readonly hiatus: number;
  readonly totalTracked: number;
}

export interface LibraryContinueCandidate {
  readonly titleId: string;
  readonly readState: LibraryMomentumFilterKey;
}

export interface LibraryMomentumStatusChip {
  readonly key: LibraryMomentumFilterKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly count: number;
  readonly toneOklch: string;
}

export interface LibraryMomentumSummary {
  readonly counts: LibraryMomentumCounts;
  readonly completionPercent: number;
  readonly isEmpty: boolean;
  readonly continueCandidate: LibraryContinueCandidate | null;
  readonly statusChips: readonly LibraryMomentumStatusChip[];
}

type RawReadMap = Readonly<Record<string, ReadState | "completed" | undefined>>;

function normalizeTrackedState(raw: ReadState | "completed" | undefined): LibraryMomentumFilterKey | null {
  if (raw === "reading") return "reading";
  if (raw === "want") return "want";
  if (raw === "done" || raw === "completed") return "done";
  if (raw === "hiatus") return "hiatus";
  return null;
}

function pickContinueCandidate(
  reads: RawReadMap,
  recentlyViewed: readonly string[],
): LibraryContinueCandidate | null {
  const buckets: Record<LibraryMomentumFilterKey, string[]> = {
    reading: [],
    want: [],
    done: [],
    hiatus: [],
  };

  for (const [titleId, state] of Object.entries(reads)) {
    const normalized = normalizeTrackedState(state);
    if (normalized) buckets[normalized].push(titleId);
  }

  const priorityOrder: readonly LibraryMomentumFilterKey[] = ["reading", "want", "hiatus"];
  for (const bucketKey of priorityOrder) {
    const ids = buckets[bucketKey];
    if (ids.length === 0) continue;
    const idSet = new Set(ids);
    const recentMatch = recentlyViewed.find((id) => idSet.has(id));
    return {
      titleId: recentMatch ?? ids[0]!,
      readState: bucketKey,
    };
  }

  return null;
}

export function buildLibraryMomentumSummary(input: {
  readonly reads: RawReadMap | undefined;
  readonly recentlyViewed?: readonly string[];
}): LibraryMomentumSummary {
  const reads = input.reads ?? {};
  const recentlyViewed = input.recentlyViewed ?? [];

  let reading = 0;
  let want = 0;
  let completed = 0;
  let hiatus = 0;

  for (const state of Object.values(reads)) {
    const normalized = normalizeTrackedState(state);
    if (normalized === "reading") reading += 1;
    else if (normalized === "want") want += 1;
    else if (normalized === "done") completed += 1;
    else if (normalized === "hiatus") hiatus += 1;
  }

  const totalTracked = reading + want + completed + hiatus;
  const completionPercent = totalTracked > 0 ? Math.round((completed / totalTracked) * 100) : 0;
  const continueCandidate = pickContinueCandidate(reads, recentlyViewed);

  const statusChips: readonly LibraryMomentumStatusChip[] = [
    {
      key: "reading",
      labelKo: "보는 중",
      labelEn: "Reading",
      count: reading,
      toneOklch: "var(--color-accent)",
    },
    {
      key: "want",
      labelKo: "관심",
      labelEn: "Want to read",
      count: want,
      toneOklch: "var(--color-cool)",
    },
    {
      key: "done",
      labelKo: "완독",
      labelEn: "Completed",
      count: completed,
      toneOklch: "var(--color-good)",
    },
    {
      key: "hiatus",
      labelKo: "휴재 대기",
      labelEn: "Hiatus",
      count: hiatus,
      toneOklch: "var(--color-warn)",
    },
  ];

  return {
    counts: {
      reading,
      want,
      completed,
      hiatus,
      totalTracked,
    },
    completionPercent,
    isEmpty: totalTracked === 0,
    continueCandidate,
    statusChips,
  };
}

export function buildLibraryFilterSearchParams(
  currentSearch: string,
  filterKey: LibraryMomentumFilterKey,
): string {
  const next = new URLSearchParams(currentSearch);
  next.set("tab", "shelf");
  next.set("libraryRead", filterKey);
  const serialized = next.toString();
  return serialized ? `?${serialized}` : "";
}
