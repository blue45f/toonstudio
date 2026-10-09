// 쇼케이스 스포트라이트의 순수 계산 — 화면과 분리해 단위 테스트한다.
import type { WorkSummary } from "@/platform/creator-client";

/**
 * 좋아요순 목록에서 주인공 작품을 고른다.
 * 표지가 있는 작품을 우선해 첫 화면이 실제 작화로 차도록 하고, 표지가 전혀 없으면 목록의 첫 작품을 쓴다.
 */
export function pickSpotlightWork(works: readonly WorkSummary[]): WorkSummary | null {
  if (works.length === 0) return null;
  return works.find((work) => work.cover.trim().length > 0) ?? works[0] ?? null;
}

/**
 * 첫 화면 무대(표지 모자이크 + 표지 레일)에 올릴 작품 순서.
 * 실제 표지가 있는 작품을 앞으로 모아 무대가 빈 타일로 시작하지 않게 하고,
 * 같은 묶음 안에서는 좋아요순(입력 순서)을 그대로 유지한다. 표지가 없는 작품도
 * 뒤에 남겨 두어 레일에서 타이포 폴백 타일로 정직하게 보여 준다.
 */
export function pickStageWorks(works: readonly WorkSummary[], limit = 12): WorkSummary[] {
  const withCover = works.filter((work) => work.cover.trim().length > 0);
  const withoutCover = works.filter((work) => work.cover.trim().length === 0);
  return [...withCover, ...withoutCover].slice(0, Math.max(0, limit));
}
