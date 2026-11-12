# 마켓 모바일 검색 우선 배치 제안 — 2026-11-12

상태: **migration**. [원본 HTML 목업](./market-search-first.html)과 [동결 기록](./market-search-first-manifest.json)은 실제 구현 화면과 구분한다. [사용자가 열 수 있는 공유 시안](https://chatgpt.com/space/page_1e4bdd165d908191b152ae11b81a568c) 마지막 절에 동일 HTML을 다운로드 파일로 먼저 공유했다.

390px의 실제 784d/2163 번들에서 검색 입력은 y817.55–865.55에 놓여 하단 메뉴에 가렸다. 이 제안은 제목·검색을 먼저 두고 기존 두 내비게이션과 전체 링크·현재 선택을 그 아래에 유지한다. 검색어·IME·필터·API·권리·뒤로 가기 계약은 변경하지 않는다. 목록·결과 자리 표시는 별도 재설계 시안이 아니다.

원본 HTML은 외부 자산과 스크립트를 포함하지 않는다. 로컬 file:// 브라우저 렌더링이 `ERR_BLOCKED_BY_ADMINISTRATOR`로 거절되어 PNG를 만들지 않았고 다른 렌더러로 우회하지 않았다. HTML 파일 공유 완료를 PNG 시각 검토나 구현 충실도 통과로 표시하지 않는다.

공유 후 `MarketBrowsePage.tsx`의 기존 DOM 순서를 최소 변경했고 기존 2파일 29테스트·ESLint·Secretlint·구문 검사를 통과했다. 새 통합 번들에서 검색 첫 화면 노출·가림·키보드·PC 회귀와 목업 충실도는 아직 검증 대기다.
