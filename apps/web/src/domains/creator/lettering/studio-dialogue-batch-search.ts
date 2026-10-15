import { fuzzyFilterByTexts } from "@/shared/lib/fuzzy-search";

import {
  dialogueItemTypeLabel,
  type DialogueBatchItem,
} from "./studio-dialogue-batch";

/**
 * 목록 검색 — 대사 본문·종류 라벨에 부분일치(대소문자 무시)에 더해
 * 초성 검색을 지원한다: "ㅁㅍ" 으로 말풍선 라벨을, "ㅁㅅ" 로 '민수' 대사를 찾는다
 * (es-hangul 공용 유틸 matchesHangulText). 빈 질의는 전체.
 *
 * 여기에 퍼지(fuse.js 공용 엔진)를 얹었다: 부분·초성 일치가 원래 순서로
 * 먼저 오고, 한 글자 오타("민슈"·"말풍션"·"minsuu")로만 닿는 대사가
 * 점수순으로 뒤에 붙는다. 오탐 상한은 엔진이 고정하므로 무관한 대사는
 * 여전히 걸러진다("없는대사" → 0건 계약 유지).
 *
 * 번들 경계: 순수 코어(studio-dialogue-batch)는 에디터 시작 경로가 정적으로 import하므로
 * fuse.js·es-hangul을 끌어오는 검색은 이 파일로 분리했다. 사용자는 대사 일괄 편집 패널
 * (지연 로딩)뿐이다 — 동작과 반환 순서는 분리 전과 같다.
 */
export function filterDialogueItems(
  items: readonly DialogueBatchItem[],
  query: string
): DialogueBatchItem[] {
  if (!query.trim()) return [...items];
  return fuzzyFilterByTexts(items, query, (item) => [item.text, dialogueItemTypeLabel(item)]);
}
