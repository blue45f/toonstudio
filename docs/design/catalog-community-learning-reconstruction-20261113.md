# 독자·커뮤니티·학습과 개인 작업 화면 재구성

상태: **current — 2026-11-13 후보 소스 `2b00e21199501eed2ae0787a4bb56cc21929448a`의 구현 기록, 최종 검증·PR·병합 대기**. 이 문서는 담당 소스의 변경과 유지 판정을 구분한다. 전체 URL 소비 경로는 [전역 구현 소비표](sitewide-ux-implementation-coverage-20261113.md), 초기 시안은 [모바일 우선 설계](mobile-first-ux-20261113.md)를 참조한다. 전역 구조 판정은 본문 직접 59·공유 소비 194·기존 유지 135·별칭 44·권한/표면별 검증 분리 11 = **443주소**, 실제 연결 page source는 **243개**다. 이 문서의 행 수나 459개 시안 선택 항목을 독립 신규 UI 수로 세지 않는다.

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
| `/my` | `MySpaceHubPage` → 목적 선택·`SiteLinkCard` | **본문 직접 변경**. 기본 세 목적 선택 후 해당 링크만 표시. 전체 14개는 `role=all`, 검색은 목적 선택 없이도 가능. 일반 빈 작업은 `/create`의 작품 시작하기로 통일 | `role`, `q`의 URL 정본, 중복 query·hash·location.state·Back/Forward, 최근 작업·저장 위치·게스트/계정 구분 |
| `/market/publish` | `MarketPublishAuthorityPage` → `MarketplaceAuthoringWorkshop`, 서버 게시 폼 | **본문 직접 변경**. 두 목적 정문과 `section=workshop/publish` 분리. 준비 도구·시뮬레이터·마켓 이동은 뒤 보조 영역 | 양쪽 작업은 숨김 전환으로 미저장 입력 유지. 계정 교체·요청 세대·파일 검증·게시 확인·immutable 릴리스 권위 유지 |
| `/market/compare` | `MarketComparePage` → 실제 manifest 비교표 | **본문 직접 변경**. 실제 비교·빈 상태를 스펙·좌석 시뮬레이터 앞으로 이동 | 선택·해제·차이만 보기·관심 후보·제작 적합성·Markdown 내보내기 |
| `/market/manage` | `MarketOwnedResourcesPage` → 서버 패키지 목록·설치/공개 상태 조작 | **본문 직접 변경**. 계정 경계·실제 목록 뒤에서 셀러 안내·마켓 탭·장식 열기 | 서버 head·이력·새 버전·선택·비공개 확인·계정 변경·설치 핸들러 |
| `/market/seller` | `MarketSellerPage` → `TaskScreenNavigation`, 실제 리스팅·공동구매·관리 폼 | **본문 직접 변경**. `view=listings/group-buys/manage/simulator` 중 한 작업만 표시. 기본은 실제 리스팅, 정산 예시는 독립 목적 | 기존 3개 hash 진입, 미저장 양식 DOM·query/hash·Back, 포인트 원장·기존 거래 핸들러 유지 |
| `/collaborate/new`, `/collaborate/:id/edit` | `CollaborationEditorPage` → `TaskScreenNavigation`, 공고 양식 | **본문 직접 변경**. `view=write/preview`로 작성과 게시 전 미리보기 분리. PC에서도 단일 작업 본문 | 미저장 양식 DOM, query/hash·Back, 실제 제출·권리 확인·충돌·자동 초안 정리. 숨긴 작성 화면은 form과 submit을 함께 숨기고 오류/충돌은 form 밖에서 계속 표시 |
| `/community/promote/new`, `/community/promote/:id/edit` | `PromotionEditorPage` → `TaskScreenNavigation`, 소개 양식 | **본문 직접 변경**. `view=write/preview`로 작품 소개와 게시 전 미리보기 분리 | 미저장 양식 DOM, query/hash·Back, 실제 게시·권리 확인·초안 처리. 화면 전환 시 숨긴 form의 required가 보이는 별도 작업을 막지 않음 |
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
| `/character-chat/manage` | 새 캐릭터 버튼을 누를 때 편집기를 열고 기본은 내 캐릭터 목록 | 주 작업은 유지하되 조건부 테스트 대화의 `CharacterChatThread` 변경을 실제 소비하므로 전역 표에서는 **공유 UI 적용**. 공개·저장·실제 대화 권위는 별도 |
| `/creator/early-access` | 제목 다음 실제 정책 폼·정책 목록. 별도 REA 블록이 앞을 막지 않음 | 본문 유지. 유료 제공·정책 활성화 성공을 로컬 검증으로 주장하지 않음 |
| `/ecosystem/education`, `/ecosystem/library` | 교육 검색→기관 결과, 도서 검색→책장→선택한 ISBN 소장 조회 순서가 실제 작업의 연속 | 목록 우선 구조 유지. 부모/동료의 `CreatorEcosystemLayout` 메뉴·화면 안내 분리 소비 |
| `/automation` | 로딩/오류, 저장·내보내기, 레시피 목록 순서이며 별도 전단 시뮬레이터가 없음 | 본문 유지. 부모 `IntegrationPage` 셸 변경 소비. 실제 공급자 검증·자동 실행은 별도 |
| `/learn/education`, `/title/:slug/episodes` | 각각 정식 교육 허브와 상세 회차 위치로 가는 호환 주소 | 별도 신규 화면으로 집계하지 않음 |
| `/community/promote` 목록·기타 홍보 화면 | 작성/수정 두 Editor와 별도 page source를 소비 | 두 Editor의 직접 변경을 홍보 도메인 모든 본문에 중복 적용했다고 세지 않음 |
| 조직·뉴스레터·`/ecosystem/collaboration` | 별도 조직·발송·창작 생태계 도메인에 연결됨 | 다른 담당자의 목적 화면 분리를 전역 소비표에서 확인. 이 문서의 공고 작성 Editor와 생태계 협업 허브를 구분 |

## 3. 검증과 남은 경계

- 관련 Vitest: 후속 판매자·작성 화면까지 포함한 **24파일 178개**를 `3bd1cfea8c25c170279a6f9299f94438f940e610`에서 2026-11-13 17:44 KST에 합동 재실행해 통과했다. 로그는 `.qa/sitewide-ux-candidate-3bd-20261113/validation/owned-units.log`다. 이전 20파일 147개는 이보다 앞선 중간 범위다.
- 레거시 진입 계약 `product-ux-foundation` 10개·`LearnPage.navigation` 6개는 2026-11-13 18:06 KST에 별도로 통과했고 후보 `2b00e2119`에 포함됐다. 로그는 `.qa/sitewide-ux-final-20261113/legacy-contract-units.log`다. 두 실행은 시점과 SHA가 달라 **2b에서 26파일 194개를 일괄 재실행했다**고 쓰지 않는다.
- 변경 TSX·테스트·워크숍 E2E 파일 ESLint 통과. UI 소스 파일은 모두 800줄 이하를 유지했다.
- 기존 워크숍 E2E 두 파일은 정문에서 실제 목적 버튼을 누른 후 기존 검증을 수행하도록 갱신했다. 기존 검증을 삭제하거나 허용값을 느슨하게 바꾸지 않았다.
- fixture 없는 로컬 게스트 브라우저는 30개 URL × 390/1440px 관측 뒤, 최종 14개 URL × 두 폭을 다시 관측했다. 두 묶음은 중복이 있어 88개 고유 주소로 합산하지 않는다. `second-pass-reader-learning/results.json`과 `final-native-results.json`에 API 502·로그인 경계를 포함한 화면, 가로 넘침 0·uncaught JS 0을 기록했다. 정문·목적 전환·Back·초안 보존과 실제 유효 작품 읽기·계정 폼 제출·게시·결제·정산·AI 대화 성공은 별도다.
- 워크숍 목적 전환의 초기 측정은 비동기 전환이 끝나기 전의 관측이었다. visible/hidden 대기 후 단일 목적 표시를 확인했으며 이를 별도 UI 결함 수정으로 세지 않는다. 팔레트 삭제는 44×44px에서 실제 로컬 항목 삭제를 확인했고, 검색 새로고침은 모바일 44×48px·PC 44×44px다. 입력·필터·로그인 등 표본 조작 치수와 서버 작업 성공을 혼동하지 않는다. 근거는 `final-target-measurements.json`, `palette-target-results.json`이다.
- 기존 워크숍·인앱 E2E 6개도 통과했다. 이 중 native 화면 조작 5개와 sessionStorage 합성 handoff 1개를 구분하며 `.qa/second-pass-authoring/results.json`에 기록했다. 감사 Node 테스트 32개는 준비 상태 판정 코드의 회귀이며 제품 기능 32개를 완주한 수가 아니다.
- 위 PNG 28장은 2026-11-13 17:30 KST의 로컬 UI 기록이며 최종 후보를 다시 촬영한 자료가 아니다. 전체 검토집 **139장**의 1차/2차·fixture·수정 전/후 날짜 구분은 [전역 소비표의 캡처 표](sitewide-ux-implementation-coverage-20261113.md#캡처-날짜와-최종-후보의-관계)를 따른다. 실계정·실제 GPU/펜·저장·전송 권위 미검증은 별도 유지한다.
- 후보 `2b00e2119`의 새로운 443주소 × 2폭 전수 실행과 추가 목적 URL 검증은 진행/대기 중이다. 중단된 `00b` 실행이나 `3bd`의 서버 탐색 실패를 최종 후보 성과에 합산하지 않는다. 저장소 전체 하네스·타입 검사·빌드·원격 CI·PR 병합·배포도 별도 기록 전까지 완료로 판정하지 않는다.
