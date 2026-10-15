/**
 * 실습 미션 딥링크(`practice=lesson&lesson=<id>&mission=<id>`)의 주소 모양만 값싸게 확인한다.
 *
 * 강좌 콘텐츠(learning-content)를 읽지 않으므로 에디터가 상시 렌더하는 슬롯
 * (StudioLessonMissionBarSlot)이 시작 경로에서 써도 된다. 미션 id가 그 강좌의 미션과 같은지까지는
 * parseStudioLessonMission(studio-lesson-mission.ts)이 바 본체 안에서 판정한다 — 이 확인은 그보다
 * 넓거나 같은 조건이어야 하며(유효한 딥링크를 가리면 안 된다), 두 판정이 어긋나지 않는지는 슬롯
 * 테스트가 실제 강좌 미션으로 잠근다.
 *
 * 컴포넌트 파일에 함께 두면 Fast Refresh 가 모듈 전체를 새로고침하므로(react-refresh 규칙) 별도
 * 모듈로 분리했다.
 */
export function hasStudioLessonMissionLinkShape(search: URLSearchParams): boolean {
  return (
    search.get("practice") === "lesson"
    && (search.get("lesson")?.trim() ?? "") !== ""
    && (search.get("mission")?.trim() ?? "") !== ""
  );
}
