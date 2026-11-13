# 독자·커뮤니티·학습과 개인 작업 화면 재구성

상태: **current — 2026-11-13 2차 구현·로컬 검증 기록**. 이 문서는 담당 소스의 변경과 유지 판정을 구분한다. 전체 URL 소비 경로는 [전역 구현 소비표](sitewide-ux-implementation-coverage-20261113.md), 초기 시안은 [모바일 우선 설계](mobile-first-ux-20261113.md)를 참조한다. 459개 시안 URL을 서로 다른 신규 본문으로 구현했다고 세지 않는다.

## 1. 설계와 실제 변경

모바일과 PC 모두 결과·진행 중인 작업을 본문 앞으로 둔다. 다른 목적의 내비게이션, 설명과 시뮬레이터는 목적 이름으로 여는 보조 영역에 보존한다. 작업 전환은 URL을 기준으로 하되 미저장 폼을 유지하며, UI 예시 선택을 서버 상태·권한·게시·정산 성공으로 승격하지 않는다.

| 정본 URL·라우트 패턴 | 실제 소비 컴포넌트 | 2차 판정·본문 변화 | 보존한 계약 |
| --- | --- | --- | --- |
| `/ranking` | `RankingPage` → `RankingBoard`, `SiteContextualSubNav`, `SiteDisclosure` | **본문 직접 변경**. 큰 히어로와 상단 창작·공유 행동을 짧은 제목과 보드 뒤 도구로 재배치 | `axis`, `platform`, 기존 보드·산식·비교/커뮤니티 연결 |
| `/calendar` | `CalendarPage` → `CalendarFilters`, `CalendarDayItems` | **본문 직접 변경**. 중복 제목·큰 히어로를 줄이고, 모바일 로딩은 선택한 하루만 표시. PC 7일 구조 보존 | 날짜·요일 URL, 기억한 필터, 실제 KST 오늘, ICS, 오류/빈 결과 구분 |
| `/tags` | `TagsPage` → 태그 필터·목록, `SiteDisclosure` | **본문 직접 변경**. 검색·정렬·태그 목록을 먼저 배치하고 큰 장식·설명을 뒤 안내로 이동 | `q`, `sort`, 120개씩 더 보기, 기존 탐색 링크·이미지 실패 대체 |
| `/insights` | `InsightsPage` → 집계 차트, `SiteDisclosure` | **본문 직접 변경**. 실제 차트를 먼저 배치하고 스펙트럼·설명은 보조 도구로 이동. 정상 빈 집계의 기존 렌더링 예외를 빈 상태로 보완 | 실측/추정 구분, 지표별 탐색 링크, 오류·재시도, 서버 집계 권위 |
| `/community` | `CommunityPage` → `FanCafePanel`, `CommunityDisclosure` | **본문 직접 변경**. 기본은 통합 피드 하나. `view=league/promote/all`은 각 목적 또는 명시 전체 보기. 종류별 공간·다중 CTA는 보조 메뉴 | 기존 검색값·fragment, Back/Forward, 모든 리그·홍보 도구·원래 목적지 |
| `/community/events` | `CommunityEventsPage` → `CommunityEventsBoard`, `FanCafePanel` | **본문 직접 변경**. 일정·게시물을 채널 비교와 이용 가이드 앞으로 이동 | `scope=pencafe`, `targetId=community-events`, `initialKind=event`, 작성 앵커·공식 이벤트 |
| `/pencafe/:name` | `PencafePage` → `PencafeFeedBoundary`, `FanCafePanel` | **본문 직접 변경**. 실제 피드 다음에 공유·참여·팬덤 시뮬레이터 제공 | 인코딩한 카페명·공유 주소, 피드 오류/재시도, 모든 등급·워치파티 조작 |
| `/community/timelapses` | `TimelapseGalleryPage` → `TimelapseClipCard`, `SiteDisclosure` | **본문 직접 변경**. 실제 클립 목록을 분석 모드·배속 예시보다 먼저 배치 | 소유자·공개 범위, 검색·정렬·내 클립, 기존 분석 모드·선택 유지 |
| `/showcase` | `ShowcasePage` → `GalleryToolbar`, `GalleryTabPanel`, `ShowcaseSpotlight` | **본문 직접 변경**. 검색·보기 조건·작품 결과 뒤에서 추천 한 편을 명시적으로 열기. 공통 페이지 메뉴는 한 번만 소비 | 검색 범위와 IME 입력, query 정본, 북마크·분류, 공개 작품·작가·태그 경로 |
| `/learn/*`, `/learn/recipes` | `LearnSectionShell` → `SectionNav`, 각 학습 본문 | **소비 셸 직접 변경**. 16개 목적지와 보조 진도는 PC·모바일 동일한 학습 메뉴에서 열기. 본문 앞 장식·진도 중첩 제거 | 각 레슨·경로·자료·기록·실습 본문, 현재 위치, 진행 저장소, Escape 초점 복귀 |
| `/learn`의 `view=today/paths/library/skills` | `LearningHome` → `SiteSectionTabs`, `SiteTabPanel` | **본문 직접 변경**. 이미 URL로 분리된 네 학습 목적 유지. 학습 뒤 도구 레일은 명시 보조 영역으로 분리 | 강좌 필터·앵커, 목표 설정·로컬 진도·메모·백업/초기화 |
| `/my` | `MySpaceHubPage` → 목적 선택·`SiteLinkCard` | **본문 직접 변경**. 기본 세 목적 선택 후 해당 링크만 표시. 전체 14개는 `role=all`, 검색은 목적 선택 없이도 가능 | `role`, `q`의 URL 정본, 중복 query·hash·location.state·Back/Forward, 최근 작업·저장 위치·게스트/계정 구분 |
| `/market/publish` | `MarketPublishAuthorityPage` → `MarketplaceAuthoringWorkshop`, 서버 게시 폼 | **본문 직접 변경**. 두 목적 정문과 `section=workshop/publish` 분리. 준비 도구·시뮬레이터·마켓 이동은 뒤 보조 영역 | 양쪽 작업은 숨김 전환으로 미저장 입력 유지. 계정 교체·요청 세대·파일 검증·게시 확인·immutable 릴리스 권위 유지 |
| `/market/compare` | `MarketComparePage` → 실제 manifest 비교표 | **본문 직접 변경**. 실제 비교·빈 상태를 스펙·좌석 시뮬레이터 앞으로 이동 | 선택·해제·차이만 보기·관심 후보·제작 적합성·Markdown 내보내기 |
| `/market/manage` | `MarketOwnedResourcesPage` → 서버 패키지 목록·설치/공개 상태 조작 | **본문 직접 변경**. 계정 경계·실제 목록 뒤에서 셀러 안내·마켓 탭·장식 열기 | 서버 head·이력·새 버전·선택·비공개 확인·계정 변경·설치 핸들러 |
| `/character-chat` | `CharacterChatPage` → 캐릭터 목록·`CharacterChatThread` | **본문 직접 변경**. 캐릭터 선택·대화 앞의 로어북/페르소나 예시·작가 CTA를 뒤 명시 도구로 이동 | 공개 opt-in, 작가 설정·금지 주제, AI 키 없는 입력 차단, 실제 엔진 호출 경계 |
| `/creator/membership` | `CreatorMembershipPage` → 실제 티어·편집기·독자 미리보기 | **본문 직접 변경**. 실제 티어·로그인 경계를 운영 예시보다 먼저 배치 | 티어 금액·편집·공개 상태·멤버 수, 로그인 권한, 미리보기 앵커 |
| `/creator/revenue` | `CreatorRevenueDashboardPage` → 실제 수익 요약·정산·`PayoutDialog` | **본문 직접 변경**. 실제 금액·정산 경계 뒤에서 시뮬레이터와 수익화 메뉴 열기 | 기간·수익원·지급 요청·확인 dialog·서버 가용성 구분. 예시 변경은 실제 금액을 변경하지 않음 |
| `/ecosystem/fandom` | `FandomCosplayPage` → 실제 팬 피드 | **본문 직접 변경**. 피드 뒤에서 세 가지 참여 가이드·행사 안내 열기 | 코스프레 초기 유형·대상 ID·기존 커뮤니티 권한, `#fandom-guide` 자동 펼침 호환 |

## 2. 기존 구조에 부합하여 유지한 소비 경로

| 경로군 | 소스 판독 결과 | 적용·검증의 경계 |
| --- | --- | --- |
| `/discover`, `/search`, `/explore` | 기본 검색·결과, 조건 sheet, 안내 disclosure가 이미 분리되어 있음 | 기존 본문 유지. 다른 찾기 방법의 URL 조건·IME·스크롤/초점 회귀를 기존 테스트가 검증하며 전역 메뉴 변경을 신규 본문으로 합산하지 않음 |
| `/title/:slug`, `/title/:slug/read/:episode` | 상세는 회차가 먼저이고 소개·리뷰·전문 도구는 명시 접기. 리더는 별도 읽기 표면 | 실제 유효 작품과 읽기 성공은 API/실데이터가 필요. 오류 표본을 정상 읽기 성공으로 세지 않음 |
| `/library`, `/authors`, `/author/:name`, `/news`, `/recommend`, `/compare`, `/random`, `/guide` | 각 화면의 목록·선택·랜덤 미리보기·설명 읽기가 단일 목적. 반복 탐색 메뉴는 공통 컴포넌트를 소비 | `SiteContextualSubNav` 소비 페이지는 부모 작업의 공통 페이지 메뉴 재구성을 적용. 상세 API 성공·권한 계정은 별도 검증 필요 |
| `/community/:scope`의 작품·작가·펜카페, `/community/cafes`, `/reviews` | 주제별 피드·카페 목록·리뷰가 핵심 본문이고 공유 페이지 메뉴를 소비 | `/community/pencafe`는 `/pencafe/:name`과 별도 본문임. 후자 직접 변경을 전자에 중복 적용했다고 세지 않음 |
| `/community/post/:id`, `/community/cafes/:slug`, `/community/cafes/:slug/manage` | 선택 게시물·카페·관리 폼의 단일 작업. 본문 오류·ACL·확정 조작은 원래 권위를 사용 | 예시 ID 렌더링은 존재하는 글·카페·운영 권한의 성공 검증이 아님 |
| `/character-chat/manage` | 새 캐릭터 버튼을 누를 때 편집기를 열고 기본은 내 캐릭터 목록 | 본문 유지. 공개·저장·테스트 대화의 권위와 초안 취급을 유지 |
| `/creator/early-access` | 제목 다음 실제 정책 폼·정책 목록. 별도 REA 블록이 앞을 막지 않음 | 본문 유지. 유료 제공·정책 활성화 성공을 로컬 검증으로 주장하지 않음 |
| `/ecosystem/education`, `/ecosystem/library` | 교육 검색→기관 결과, 도서 검색→책장→선택한 ISBN 소장 조회 순서가 실제 작업의 연속 | 목록 우선 구조 유지. 부모/동료의 `CreatorEcosystemLayout` 메뉴·화면 안내 분리 소비 |
| `/automation` | 로딩/오류, 저장·내보내기, 레시피 목록 순서이며 별도 전단 시뮬레이터가 없음 | 본문 유지. 부모 `IntegrationPage` 셸 변경 소비. 실제 공급자 검증·자동 실행은 별도 |
| `/learn/education`, `/title/:slug/episodes` | 각각 정식 교육 허브와 상세 회차 위치로 가는 호환 주소 | 별도 신규 화면으로 집계하지 않음 |
| `/community/promote/*`, 협업·조직·뉴스레터 | 라우트 그룹이 각각 `domains/promotion`, `domains/collaboration` 등의 별도 도메인으로 연결됨 | 이 문서의 직접 구현 수에서 제외. 전역 소비표의 담당 근거를 사용 |

## 3. 검증과 남은 경계

- 관련 Vitest: 첫 16파일 **127개 통과**, 추가 대화·수익화·팬덤 4파일 **20개 통과**. 합계 20파일 147개이며 서버·세션·엔진을 대체하는 단위 경계 검증을 포함한다.
- 변경 TSX·테스트·워크숍 E2E 파일 ESLint 통과. UI 소스 파일은 모두 800줄 이하를 유지했다.
- 기존 워크숍 E2E 두 파일은 정문에서 실제 목적 버튼을 누른 후 기존 검증을 수행하도록 갱신했다. 기존 검증을 삭제하거나 허용값을 느슨하게 바꾸지 않았다.
- 모바일 390×844·PC 1440px의 실제 브라우저 근거는 전체 소스 동결 뒤 이 문서에 추가한다. 그 전에는 단위 테스트 통과를 실서버 계정·정산·게시·AI 대화 성공으로 해석하지 않는다.
- 저장소 전체 하네스·타입 검사·빌드·원격 CI·PR 병합·배포는 부모 작업에서 따로 기록한다. 이 문서만으로 그 상태를 완료라고 판정하지 않는다.
