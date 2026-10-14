/**
 * review-playlist-model.ts
 *
 * ShotGrid(Flow Production Tracking)의 "리뷰 플레이리스트/Screening Room" 패턴:
 * 오늘 검수할 회차·컷 버전을 하나의 재생 목록으로 조립해 순서대로 판정하고,
 * 중단해도 미판정 항목부터 재개하는 세션 모델. 검수 핀·승인 게이트와 경쟁하지 않고
 * "검수 순서와 진행"만 담당한다 (판정 결과는 호스트가 기존 게이트로 되돌린다).
 *
 * 초안(tool-strengths/drafts/review-playlist-model.ts, 검증 완료)을 그대로 승격하고
 * 배선에 필요한 직렬화·복원·판정 병합·게이트 결정값 매핑만 덧붙인다.
 */
import type { ReviewDecisionValue } from "@toonstudio/core/production";

export type ReviewVerdict = "pending" | "approved" | "changes-requested" | "skipped";

export interface ReviewPlaylistItem {
  readonly id: string;
  readonly episodeId: string;
  readonly episodeLabel: string;
  /** 컷/페이지 식별 (없으면 회차 전체). */
  readonly cutLabel?: string;
  readonly versionLabel: string;
  readonly openPinCount: number;
  readonly verdict: ReviewVerdict;
  readonly verdictNote?: string;
}

export interface ReviewPlaylist {
  readonly version: 1;
  readonly id: string;
  readonly title: string;
  readonly items: readonly ReviewPlaylistItem[];
}

export function buildReviewPlaylist(input: {
  id: string;
  title: string;
  items: readonly Omit<ReviewPlaylistItem, "verdict">[];
}): ReviewPlaylist {
  const items = [...input.items]
    .sort((a, b) =>
      a.episodeLabel.localeCompare(b.episodeLabel, "ko") ||
      (a.cutLabel ?? "").localeCompare(b.cutLabel ?? "", "ko"),
    )
    .map((item) => ({ ...item, verdict: "pending" as ReviewVerdict }));
  return { version: 1, id: input.id, title: input.title, items };
}

export function setReviewVerdict(
  playlist: ReviewPlaylist,
  itemId: string,
  verdict: Exclude<ReviewVerdict, "pending">,
  note?: string,
): ReviewPlaylist {
  return {
    ...playlist,
    items: playlist.items.map((item) =>
      item.id === itemId ? { ...item, verdict, verdictNote: note } : item,
    ),
  };
}

/** 재개 지점: 첫 미판정 항목의 인덱스. 전부 판정됐으면 -1. */
export function resumeIndex(playlist: ReviewPlaylist): number {
  return playlist.items.findIndex((item) => item.verdict === "pending");
}

export function nextPending(playlist: ReviewPlaylist, fromIndex: number): number {
  for (let i = fromIndex + 1; i < playlist.items.length; i += 1) {
    if (playlist.items[i]!.verdict === "pending") return i;
  }
  return -1;
}

export function reviewProgress(playlist: ReviewPlaylist): {
  total: number;
  decided: number;
  approved: number;
  changesRequested: number;
  skipped: number;
  pending: number;
  /** 0..1 */
  ratio: number;
  /** 긴급도 가중: 미해결 핀이 많은 항목이 남은 경우의 잔여 핀 합. */
  remainingOpenPins: number;
} {
  const count = (v: ReviewVerdict) => playlist.items.filter((i) => i.verdict === v).length;
  const approved = count("approved");
  const changesRequested = count("changes-requested");
  const skipped = count("skipped");
  const pending = count("pending");
  const decided = approved + changesRequested + skipped;
  return {
    total: playlist.items.length,
    decided,
    approved,
    changesRequested,
    skipped,
    pending,
    ratio: playlist.items.length === 0 ? 1 : decided / playlist.items.length,
    remainingOpenPins: playlist.items
      .filter((i) => i.verdict === "pending")
      .reduce((sum, i) => sum + i.openPinCount, 0),
  };
}

/** 검수 우선순위 큐: 미판정 중 핀 많은 순 (오늘 먼저 볼 것). */
export function priorityQueue(playlist: ReviewPlaylist): readonly ReviewPlaylistItem[] {
  return playlist.items
    .filter((i) => i.verdict === "pending")
    .sort((a, b) => b.openPinCount - a.openPinCount);
}

/**
 * 판정 → 승인 게이트 결정값.
 * 승인은 "approve", 수정 요청은 "request-changes"로 기존 게이트에 되돌리고,
 * 건너뜀은 게이트에 기록하지 않는다(세션 안에서만 의미를 가진다).
 */
export function verdictGateValue(verdict: Exclude<ReviewVerdict, "pending">): ReviewDecisionValue | null {
  switch (verdict) {
    case "approved":
      return "approve";
    case "changes-requested":
      return "request-changes";
    case "skipped":
      return null;
  }
}

/** 프로젝트별 플레이리스트 저장 키. 플레이리스트 id에 날짜가 들어가 날이 바뀌면 새로 시작한다. */
export function reviewPlaylistStorageKey(projectId: string): string {
  return `toonstudio:review-playlist:${projectId}`;
}

export function serializeReviewPlaylist(playlist: ReviewPlaylist): string {
  return JSON.stringify(playlist);
}

const REVIEW_VERDICTS: readonly ReviewVerdict[] = ["pending", "approved", "changes-requested", "skipped"];

/** 저장된 플레이리스트 복원. 형식이 어긋나면 null — 세션을 새로 조립하게 한다. */
export function parseReviewPlaylist(raw: string | null): ReviewPlaylist | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ReviewPlaylist> | null;
    if (
      !data ||
      data.version !== 1 ||
      typeof data.id !== "string" ||
      typeof data.title !== "string" ||
      !Array.isArray(data.items)
    ) {
      return null;
    }
    const items: ReviewPlaylistItem[] = [];
    for (const entry of data.items as readonly Partial<ReviewPlaylistItem>[]) {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        typeof entry.episodeId !== "string" ||
        typeof entry.episodeLabel !== "string" ||
        typeof entry.versionLabel !== "string"
      ) {
        return null;
      }
      items.push({
        id: entry.id,
        episodeId: entry.episodeId,
        episodeLabel: entry.episodeLabel,
        cutLabel: typeof entry.cutLabel === "string" ? entry.cutLabel : undefined,
        versionLabel: entry.versionLabel,
        openPinCount:
          typeof entry.openPinCount === "number" && Number.isFinite(entry.openPinCount) ? entry.openPinCount : 0,
        verdict: REVIEW_VERDICTS.includes(entry.verdict as ReviewVerdict)
          ? (entry.verdict as ReviewVerdict)
          : "pending",
        verdictNote: typeof entry.verdictNote === "string" ? entry.verdictNote : undefined,
      });
    }
    return { version: 1, id: data.id, title: data.title, items };
  } catch {
    return null;
  }
}

/**
 * 새로 조립한 목록에 저장된 판정을 항목 id 기준으로 되살린다.
 * 플레이리스트 id(날짜 포함)가 다르면 다른 날의 세션이라 되살리지 않고,
 * 사라진 항목의 판정은 버리고 새 항목은 미판정으로 시작한다.
 */
export function mergeSavedVerdicts(fresh: ReviewPlaylist, saved: ReviewPlaylist | null): ReviewPlaylist {
  if (!saved || saved.id !== fresh.id) return fresh;
  const byId = new Map(saved.items.map((item) => [item.id, item]));
  return {
    ...fresh,
    items: fresh.items.map((item) => {
      const prior = byId.get(item.id);
      return prior && prior.verdict !== "pending"
        ? { ...item, verdict: prior.verdict, verdictNote: prior.verdictNote }
        : item;
    }),
  };
}
