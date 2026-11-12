# 첨부 컨셉의 채택·구현 차이 — 2026-11-12

상태: **migration**. 아래 두 비교는 c3449c504c 시점의 소스 검토 기록이다. 내 작업·제작 홈의 후속 구현 착수와 새 번들 시각 검증은 구분한다.

# 새 사용자 시안 채택 기준: 제작 홈·드로잉·작업 시작

기준 소스는 ToonStudio c3449c504cbdff4c38b80ecf252d40c0502c8066이다. 이 기록은 부모 담당자가 전달한 새 첨부 시안의 명세와 실제 소스를 대조한 결과다. 새 첨부 원본 파일이 이 담당자에게 직접 전달되지 않았으므로 새 첨부 이미지의 직접 시각 검토 완료를 뜻하지 않는다. 기존 로컬 390px 제작·드로잉 제안 PNG 두 장은 직접 열어 보았다. 새 번들 브라우저 검증·배포는 별도 단계다.

## 이미 반영된 부분과 남은 차이

| 화면 | 현재 소스에 있는 동작 | 새 시안에서 채택할 부분·남은 차이 |
|---|---|---|
| 제작 비로그인 홈 `/production` | 샘플 프로젝트 체험이 주 행동이며 `/create` 작품 시작이 보조다. 작품 이미지와 보라 포인트가 있고 샘플의 브라우저 범위를 안내한다. | 현재 4개 FlowCards 뒤 ModuleGrid 전체가 항상 펼쳐진다. 샘플 진입 뒤에는 공정 정리→원고 피드백→검수라는 3개 목적을 우선하고 제작 도구 목록을 이름 있는 더 보기로 정리하는 방향이 적합하다. 새 사용자용 목적 카드에 사람·권한까지 같은 강조로 올리지 않는다. |
| 드로잉 편집 | 실제 펜·지우개·색상·더 보기, 현재 문서명, 저장·실제 저장 신호, 되돌리기/다시 실행이 있다. 모바일 협업·페이지·내보내기는 더 보기에서 실행한다. | 새 첨부와 기존 드로잉 PNG는 레이어를 하단에 직접 제공하지만 현재 코드는 더 보기 안에 둔다. 직접 레이어 1회 접근은 채택 후보이며 전체 레거시 도구 재노출은 제외한다. PC 상시 레이어와 태블릿 접힘은 폭·현재 작업 상태를 보고 결정하며 캔버스 공간을 먼저 확보한다. |
| 내 작업 `/studio` 및 개인 작업 홈 | 최근 개인 원고는 실제 재개 주소와 미리보기를 재사용하며 마지막 열기와 저장 문제 확인을 제공한다. 예제 원고는 개인 최근 작업에서 제외한다. | c3449에도 시작 버튼 3개·큰 첫 작품 안내·탭·검색·일괄 선택·관리 도구가 목록보다 앞선다. 예제 2개가 있어도 개인 작업은 없을 수 있음을 정직하게 안내하고 첫 안내를 짧게 줄인다. 작품/이어하기와 검색이 먼저, 가져오기·일괄 관리는 낮은 강조의 보조 동선으로 정리한다. 이 좁은 후속 구현만 별도 승인되었다. |
| 작품 시작 `/create`, `/studio/new` | 최근 작업·실제 이미지·새 작업 진입, 주제별 제작 도구 더 보기, 5형식 이미지 선택과 다음 단계가 있다. | 신규 첨부의 큰 작품 이미지·짧은 제목·하나의 다음 행동을 시각 기준으로 수용한다. 이미 접힌 제작 도구를 다시 넓은 카드 군으로 펼치지 않는다. 새 구성과 동일 상태·뷰포트 실제 캡처 대조는 아직 필요하다. |
| 공개 홈 `/` | UnifiedHomePage→CreatorHomePage→CreatorHomeExperience이며 기존 소개 hash는 `/about/studio`로 보존된다. `/home`은 별도 개인 Workspace 진입이다. | 공개 소개와 내 작업을 하나의 새로운 로컬 메뉴로 혼합하지 않는다. dark navy/lavender·큰 이미지·간결한 계층을 쓰되 방문 목적에 따른 실제 주 행동을 유지한다. |

## 샘플과 저장의 사실성을 우선한다

`apps/web/src/domains/creator/production-hub/ProductionLandingPage.tsx`가 실제 제작 홈이다. 샘플 주소는 `/production/projects/sample-project/overview`이며 `production-demo-adapter.ts`는 같은 탭 안의 변경만 유지하고 새로고침 시 초기화한다. 서버·다른 사용자·기기에 저장되지 않는다. `use-production-project-session.ts`는 샘플 명령을 demo.reduce로 처리하며 실제 프로젝트는 인증 준비·프로젝트 일치·역할 권한과 서버 명령 경로를 유지한다. 샘플의 실제 원고 제출은 서버 저장 원고 검증이 필요하므로 차단되어 있다. 시안의 검수/내보내기 그림만 보고 샘플이 실제 작업물을 제출하거나 파일을 출력·게시했다고 표시하지 않는다.

편집기 `StudioDrawingClarityReceipt.tsx`는 마지막 실제 기기 저장 receipt의 시각을 확인한다. 저장 위치 지정, 최근 열기, 프로필 수정 시각을 저장 성공으로 바꾸지 않는다. `StudioDrawingClaritySaveButton.tsx`의 실제 저장 콜백·busy/locked/scoped 조건과 저장 오류·복구를 유지한다. 새 시안의 고정 '저장됨' 문구나 임의 시각은 구현 데이터로 사용하지 않는다.

## 공통 기준과 검증 순서

모바일 공개 동선은 내 작업/작품 찾기/소재 찾기/내 정보의 4목적을 따른다. 첨부별 4/5탭 변형을 그대로 복사하지 않는다. Workspace의 More 유틸리티 예외와 공통 메뉴를 재사용한다. 운영 메뉴의 실제 권한 guard는 유지한다. dark navy/lavender는 기본 Starlight와 기존 9테마 토큰 안에서 구현하고 사용자 테마를 덮지 않는다. 새 고정 색상 팔레트나 별도 메뉴를 늘리지 않는다.

기존 1323장은 441주소×390/768/1440의 정적 제안 목록이다. `/production`의 기존 390px 제안은 '오늘의 제작/프로젝트 고르기' 개인 업무 구성으로, 새 게스트 샘플 홈과 같은 상태가 아니다. 기존 드로잉 390px 제안에는 직접 레이어와 정적 저장 시각이 있다. 새 첨부 834px 태블릿은 기존 768px 이미지로 검증 완료 처리할 수 없다. 주소 수·정적 이미지 수는 고유 과업 성공 수가 아니다.

다음 실검증은 동일 테마·상태·뷰포트로 시안과 실제 구현을 나란히 두고, 내 작업 0/예제만 2/개인 최근 작업/검색 결과/저장 오류를 구분한다. 최근 작업→실제 원고 열기→저장→재진입, 샘플 공정→피드백→검수 후 초기화 범위, 도구 선택→그리기→Undo→레이어→저장의 실제 동작을 확인한다. 390/834/1440뿐 아니라 320px에서 가림·48px 조작 영역·키보드 초점·긴 제목·오류·모션 감소도 확인한다. 새 번들 전에는 충실도나 실사용 성공을 선언하지 않는다.

참조 소스: production-hub/ProductionLandingPage.tsx, ProductionSampleJourneyGuide.tsx, production-demo-adapter.ts, use-production-project-session.ts; studio-cuttoon-editor/StudioDrawingClarity{Bar,MobileBar,CoreTools,Receipt,SaveButton}.tsx; studio-shell/StudioProjectLibrary{ManagementHeader,ManagementContent,ResumeCard}.tsx, studio-library-recent-work.ts, StudioCreateChoiceSteps.tsx; creator-resources/CreatorHomePage.tsx, marketing/UnifiedHomePage.tsx. 이 목록은 모두 apps/web/src/domains 하위이며 새로운 URL 제안은 현재 라우터 연결을 뜻하지 않는다.


---

# 새 참조 기준과 소스 대조 (읽기 전용)

보고 기준: root 전달 baseline `c3449c504cbdff4c38b80ecf252d40c0502c8066`. 각 파일의 실제 읽은 SHA는 `report.json`에 기록했다.

**첨부 시각 검토가 아니다.** root가 직접 확인한 inline 참조의 기준을 전달받아 소스와 대조했다. 이 작업에서는 이미지·브라우저·모션·390/834/1440 실제 사용 흐름을 검증하지 않았다.

## 다음 작업 우선순위

1. **explore** — 먼저 390/834/1440 동일 상태 시안/현재 캡처로 첫 결과까지의 조작·길이를 비교하고 결과 우선안 공유 후 구현. 담당 범위: `ExplorePage.tsx + explore-page-layout.css + focused tests; no shared SearchExplorer rewrite`.
2. **title** — 동일 작품 상태로 3개 직접 이동+더 보기 구성 시안 공유, 앵커/초점/모바일 선택 보존 검증. 담당 범위: `TitleDetailHero.tsx + adjacent nav styling/tests; no API contract change`.
3. **community** — 피드/검색/글쓰기 중심안과 보조 목적 메뉴 시안을 공유하고 로그인/게스트 각각 검증. 담당 범위: `CommunityPage.tsx + adjacent styles/header tests; FanCafePanel auth/API untouched`.
4. **calendar** — 다음 빌드에서 오늘 아닌 요일 선택→카드→Back을 390/834/1440 및 키보드로 실행해 날짜·스크롤·초점 복원을 확인. 실패 확인 후 기존 복원 계약에 최소 연결. 담당 범위: `CalendarPage.tsx + its focused tests, only if actual Back repro fails`.

**동결:** 현재 pending build에 새 구조 변경을 넣지 않는다. Explore/Title/Community는 다음 실측·시안 공유 단계의 제안이다. Calendar는 실제 Back 재현 전 수정하지 않는다. 공통 셸·라우팅·통합 빌드·Git은 root가 조율한다.

## 9개 화면 상태

| 화면 | 소스 기준 기반영 | 잔여/주의 |
|---|---|---|
| calendar | 모바일 선택 요일 한 날 목록, 표지/작품명, 키보드 요일 이동, 더 보기, 오늘 복귀, 오류/빈 상태 분리 | selectedDayIdx가 컴포넌트 로컬 state이며 카드 Link에 route-return-focus opt-in이 없다. 상세→Back 시 요일/초점 소실 가능성을 다음 빌드에서 실제 재현해야 한다. |
| community | 대화 피드 우선 섹션, 모집/홍보/가이드 접기, Escape로 접고 summary 초점 복귀 | 헤더에서 쇼케이스/협업/행사/새 작업 4개 목적이 피드 전 경쟁한다. 피드/검색/권한에 맞는 글쓰기를 직접 제공하고 나머지 목적은 명명된 이동 메뉴로 정리할 후보. |
| discover | 검색 입력/제출 우선, 실제 자료에 따른 추천/작품 선반, 부가 안내 접기 | 동일 상태 390/834/1440 실제 렌더 충실도는 이 작업에서 검증하지 않음. |
| explore | 태그·가이드 접기, 필터 토글, URL 기반 검색/필터, 결과/오류/빈 상태 분리 | 3개 탐색 방법과 기본 8개 장르 선택이 결과 앞에 상시 배치된다. 간결한 제목/선택 조건/결과를 우선하고 모든 장르는 찾기 쉬운 기존 필터 진입으로 모으는 신규 시안 후보. |
| ranking | 랭킹 목록이 설명보다 먼저, 세부 신호/산식/출처 접기, 모바일 한 축 선택으로 8축 모두 접근, 기간/플랫폼 직접 접근 | 단일 축 select 규칙은 max639px. 834px에서는 4축 버튼+나머지 선택과 기간/플랫폼이 두 줄 구조여서 받은 태블릿 기준과 차이가 있다. 과밀 여부는 실렌더 전 미확정. |
| read | 상단 돌아가기/작품/설정, 하단 이전/목록/다음, 실제 공식 플랫폼 링크/없음 안내, 오류와 미발행/없는 회차 구분 | 현재 데이터 계약에는 실제 회차 패널이 없다. 첨부의 만화 패널을 실제 서비스 구현처럼 복제하거나 감상 완료·진도 저장으로 표시하면 안 됨. |
| title | 모바일 표지/제목/소개 더 보기, 공식 감상/회차 안내/서재 행동, 실제 회차 섹션 우선 배치 | 상단 5개 수평 바로가기에 완성 지표/캐릭터 대화까지 노출된다. 회차/리뷰/정보를 직접 제공하고 추가 목적은 더 보기로 묶는 후보. |
| search | 짧은 작품 검색 제목, 다른 찾기 방법 native details, 실제 검색 결과 중심, 모바일 필터 aria-modal sheet, 선택 조건/검색 입력 직접 접근 | 현재 최신 검색 개선을 다시 구현할 필요 없음. 결과 첫 화면/필터 복귀/834px는 다음 통합 렌더에서 재사용 검증. |
| research | 실제 /research는 CreatorHubPage. 자료 찾기/명시적 선택 AI, 진행·초점·노트·보드 4탭, 첫 근거 다음 행동, 출처/이용조건 및 브라우저 저장 상태 | /research/catalog의 별도 작품 조사 노트를 동일 화면으로 오인해 4탭을 중복 구현하지 않아야 한다. |

## 판단 경계

- 랭킹은 8축 모두 남아 있고 목록 우선/세부 접기가 이미 반영됐다. 다만 834px는 단일 select 모바일 규칙 범위 밖이다. 현재 실제 과밀이나 터치 결함을 확정하지 않는다.
- `/research`는 CreatorHubPage이고 `/research/catalog`와 다른 작업이다. AI는 선택 실행이며 이 작업에서 실행하지 않았다.
- reader는 실제 패널 데이터 없는 공식 감상 안내 셸이다. 참조의 만화 이미지를 실데이터처럼 넣거나 안내 이동을 읽기 완료로 보고하지 않는다.
- default Starlight를 참조 기준으로 삼되 9개 테마 설정을 보존한다. 441개 경로·정적 시안 수·기존 단위 테스트 통과는 실사용 성공 수가 아니다.
- 오류/오프라인/로딩과 정상 빈 응답을 분리한다. 예시 502·요일·작품·표지·건수를 실제 응답으로 고정하지 않는다.
- 기존 768/1024 캡처로 834px 검증을 대체하지 않는다. 실제 기기·Android·운영 배포를 검증했다는 주장도 하지 않는다.

## 사용자 문구 담당에게 전달만 할 위치

- `apps/web/src/domains/catalog/ExplorePage.tsx`: `GENRE SPECTRUM / 탐색`, `GENRE SPECTRUM · EMPTY RESULT`.
- `apps/web/src/shared/components/site-experience/site-art-direction.ts`: `01 / OBSERVE`.
- `apps/web/src/domains/creator-resources/CatalogResearchNotebook.tsx`: `OBSERVE → QUESTION → CREATE`.
- `apps/web/src/domains/creator-resources/CreatorHubPage.tsx`: `MY RESEARCH`.
- `apps/web/src/domains/catalog/CalendarPage.tsx`: `STARLIGHT SCHEDULE`.
- `apps/web/src/domains/catalog/TitleDetailPage.tsx`: `WHERE TO READ · ROUTER`.

기술 문구는 기존 copy 담당과 중복 수정하지 않았다. 내부 컴포넌트 이름까지 일괄 변경하라는 뜻이 아니다. 현재 source/copy 동시 작업으로 이 목록의 문자열이 이미 정리됐을 수 있다.

## 다음 빌드에서 확인할 동작

1. 같은 실제 데이터/상태에서 390/834/1440 참조→제안→구현 비교. 첫 결과/주 행동, 표지·타이포·간격·초점/모션을 구분해 기록.
2. calendar: 오늘 아닌 요일 선택→상세→Back 후 요일·스크롤·초점. 키보드 tab/arrow/Home/End와 ICS/필터도 보존.
3. search/explore: 필터 열기→선택→닫기→상세→Back. URL/선택 조건/실제 결과/초점·스크롤 유지.
4. title/read: 공식 링크와 회차 안내 명칭, 서재 상태, 모든 보조 앵커 재접근, 상하단 겹침.
5. community/research: 게스트/회원 글쓰기 권한, 탭의 URL·로컬 저장/오류·권리정보, 빈 상태와 API 실패 분리.

소스·제품 파일 수정 0, Git 작업 0, 브라우저 0, 타입/빌드/새 테스트 0, 이미지 생성 0. 이 파일과 JSON만 ignored `.qa`에 작성했다.
