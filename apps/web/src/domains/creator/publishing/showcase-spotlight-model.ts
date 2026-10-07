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
