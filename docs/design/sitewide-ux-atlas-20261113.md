# 전체 페이지 UI/UX 시안집 · 2026-11-13

- 상태: **target + current inventory** — 현행 정본 경로에서 만든 목표 디자인 자료. 구현·API·권한·운영 검증과 구분한다.
- [검색 가능한 반응형 전체 시안집 열기](./sitewide-ux-atlas-20261113.html)
- 연결 설계: [모바일 중심 설계](./mobile-first-ux-20261113.md), [전수 경로 검사](./sitewide-ux-route-audit-20261113.md).

## 1. 포함 범위

정본 감사 URL **443개**에 실제 목적 메뉴 7개·시작 구역 6개·마켓 구역 3개를 더해 **459개 선택 항목**을 제공한다. 정본 목록의 동적 표본 주소 93개에는 실제 리소스 대신 visual-audit ID가 들어 있다. 이 주소는 작품·사용자·팀·관리자 데이터 성공 사례가 아니다.

전체 페이지는 같은 카드 한 종류로 그리지 않고 **21개 화면 구성**으로 나눈다. 같은 화면군에서도 선택한 URL의 표제·역할·주 행동·복귀 주소·보조 링크·소스 근거를 개별로 표시한다. 이는 459개의 독립적인 새 제품 UI를 모두 구현했다는 의미가 아니다. 기능별 상세 인터랙션과 실제 상태는 해당 도메인 소스가 계속 소유한다.

## 2. 시안집 사용 방법

1. 페이지 이름·주소·목적으로 검색하거나 목적/화면 구성 필터를 고른다.
2. 목록에서 경로를 선택한다. 현재 경로는 HTML hash에 남아 재열기할 수 있다.
3. 모바일 390·태블릿 834·PC 1440을 선택한다. iframe 내부의 실제 viewport 폭을 바꾸므로 단순 이미지 확대가 아니다.
4. 밝은 화면을 전환해 표면·콘텐츠 계층을 비교한다.
5. 시안 아래에서 페이지 목적·먼저 할 행동·복귀·보조 화면 분리 및 현행 소스 근거를 확인한다.

시안 안의 목적 링크는 시안집에 해당 주소가 있을 때 다른 시안으로 이동한다. 입력·검색·저장·공유·인증·결제·문서 편집은 실제 서비스 작업을 실행하지 않는다. 필터 전용 화면, 요일 선택, 도구 선택, 레이어 열기 등은 설계 판단용 상호작용이다.

## 3. 디자인과 구현 가능성

사용자가 첨부한 16개 시안의 잉크색·보라색 강조·콘텐츠 우선·보조 기능 접기를 현행 ToonStudio의 Pretendard·테마 토큰·브랜드 아트와 연결한다. 시안의 색은 디자인 예시이며 제품 구현에서는 기존 --color-* 정본을 사용한다.

모바일을 먼저 설계한다. 페이지에 핵심 목적 하나와 주 행동 한 가지를 두고, 관련 기능은 별도 URL·기존 전용 패널·명시적인 보조 화면으로 옮긴다. PC는 같은 순서를 유지하며 카드 열·목차·속성 영역만 넓힌다. 편집기·리더는 전체 사이트 메뉴와 긴 푸터를 제거한 자체 크롬을 사용한다. 일반 페이지 푸터는 브랜드·시작·전체 메뉴·도움말을 먼저 두고, 서비스 안내는 접고 정책 링크를 분리한다.

기존 라우터·메뉴 지도·문서/명령/저장 authority를 재사용할 수 있어 정보 구조 개선은 현재 구조에서 구현 가능하다. GPU 제작·다중 사용자 협업·실제 계정·마켓 결제·서버 상태는 별도 런타임 조건이 필요하다. 모바일에서 전문 3D·세밀한 편집을 PC와 완전히 동일하게 보장한다는 제안은 아니다. 해당 페이지는 실제 디바이스 조건과 실패·재시도 경로를 함께 확인해야 한다.

일반 공개 페이지의 모바일 하단은 현행 정본 **내 작업(/studio)·작품 찾기(/discover)·소재 찾기(/market)·내 정보(/my)** 네 목적을 유지하고, **전체 메뉴(/sitemap)**를 다섯 번째 utility로 추가한다. 이번 시안에서 목적 분류 전체를 바꾸지 않는다. 편집기·리더의 자체 크롬은 유지한다.

## 4. 정본과 근거 추출

- scripts/lib/sitewide-audit-route-inventory.mjs로 앱 라우트 import/spread·Studio registry/manifest·관리자 manifest·학습 콘텐츠 ID를 소스에서 수집했다. 수집기의 31개 정본 소스와 declaration 위치를 보존한다.
- route-manifest의 거버넌스·공개 번역 사전·site-route-authority·Studio title·관리자 명칭·학습 title을 우선한다. 없는 표제는 page source의 제목 또는 경로 보조명으로 명시적으로 보완한다.
- 소스의 정적 내부 링크·주요 표제를 읽어 연결을 제시한다. 동적 JSX 값·실제 사용자 제목·API 결과를 추정하지 않는다.
- /sitemap 목적 페이지는 SITE_NAVIGATION_GROUPS의 실제 7개 그룹과 항목을 투영한다. 새 기능 지도를 만들지 않는다.
- 권한·동적 ID 조건은 별도 배지로 표시하며 시안 자체가 접근을 허용하지 않는다. 선언·정적 링크만으로 권한 내부 기능 성공을 판정하지 않는다.

## 5. 화면 구성 분류

| 화면 구성 | 선택 항목 수 | 모바일 배치·분리 방향 |
| --- | ---: | --- |
| 홈 | 1 | 브랜드 장면과 시작·탐색 두 행동 |
| 목적 메뉴 | 10 | 목적 선택과 기능 선택의 별도 URL |
| 시작 선택 | 8 | 이야기·그리기 두 선택과 보조 시작 화면 |
| 검색·목록 | 111 | 검색·정렬·결과 우선, 상세 조건은 전용 패널 |
| 랭킹 | 1 | 순위 행 목록과 별도 산식·근거 |
| 캘린더 | 1 | 요일 선택과 선택한 하루의 목록 |
| 상세 | 5 | 표지·핵심 정보·주 행동, 리뷰와 기록 분리 |
| 리더 | 3 | 감상·공식 경로 안내와 회차 이동 전용 크롬 |
| 편집기 | 51 | 도구·캔버스·선택 속성의 고정 영역 |
| 보관함 | 18 | 내 항목·저장 위치·이어 하기와 보관 상태 |
| 작업 현황 | 52 | 현재 할 일과 상태, 이력·완료 항목 분리 |
| 입력·설정 | 26 | 현재 단계 입력, 안내와 전문 설정 분리 |
| 문서 | 34 | 문서 제목·목차·본문 중심의 읽기 폭 |
| 인증 | 5 | 계정 확인·오류·복구 중심의 단일 절차 |
| 학습 | 61 | 오늘의 한 학습과 실습·기록 별도 화면 |
| 리서치 데스크 | 1 | 검색→근거→판단 노트의 작업 데스크 |
| 피드 | 24 | 실제 피드 우선, 참여 안내·기타 구역 분리 |
| 메시지 | 3 | 대화 선택과 대화 본문의 별도 영역 |
| 관리자 | 22 | 관리자 권한·범위·검토 대상과 감사 기록 |
| 상태·복구 | 2 | 상태와 복구 행동, 빈 결과와 오류 구분 |
| 이전 주소 | 21 | 이전 URL에서 정식 목적지로 연결 |

## 6. 확인 결과

2026-11-13 Playwright Chromium의 실제 로컬 HTML 렌더로 아래를 확인했다. 현재 제품의 API·실제 로그인·GPU·저장·운영 번들 검증은 이 정적 설계 자료와 독립적이다.

- 선택 목록 459개·고유 주소 459개·이름/목적/주 행동/복귀 누락 0개·등록되지 않은 복귀 주소 0개.
- 시작 구역 검색 6개, 관리자 목적 필터 22개, 리더 화면 필터 2개와 URL 선택·기기/테마 전환 확인.
- 21개 화면군 × 모바일 390·태블릿 834·PC 1440 = 63개 대표 렌더에서 가로 넘침·깨진 아트·빈 본문 0개. 전체 459개의 모든 실제 데이터 상태를 렌더한 결과는 아니다.
- 시안집 바깥 화면도 390px에서 가로 넘침 없음. JavaScript 페이지 오류 0개.
- 두 문서 Secretlint 통과, pnpm harness:check 통과.

## 7. 페이지별 시안 인덱스

아래 모든 주소는 HTML의 페이지 선택 목록에 포함된다. 동적 표본·이전 주소·권한 조건을 구분해서 검토한다.

| 주소 | 표제 | 화면 구성 | 먼저 할 행동 |
| --- | --- | --- | --- |
| / | 홈 | 홈 | 작품 시작하기 |
| /about | 소개 | 문서 | 필요한 항목 찾기 |
| /about/crawler | 공개 데이터를 정직하게 연결합니다 | 문서 | 필요한 항목 찾기 |
| /about/data | 데이터 출처·상업 이용 준비 | 문서 | 필요한 항목 찾기 |
| /about/principles | 소개 · 제품 원칙 | 문서 | 필요한 항목 찾기 |
| /about/studio | 서비스 소개 | 문서 | 필요한 항목 찾기 |
| /about/technology | 브라우저에서 웹툰 제작 스튜디오를 만들기까지. | 문서 | 필요한 항목 찾기 |
| /about/technology/architecture | 구간 바로가기 | 문서 | 필요한 항목 찾기 |
| /about/technology/atlas | 기술 카드 | 문서 | 필요한 항목 찾기 |
| /about/technology/deck | 발표 미리보기와 조작 | 문서 | 필요한 항목 찾기 |
| /about/technology/field-notes | 저장소로 검증한 구현 수치 | 문서 | 필요한 항목 찾기 |
| /about/technology/glossary | 용어 검색과 분야 필터 | 문서 | 필요한 항목 찾기 |
| /about/technology/guides | 시작 전: 서비스 유형별 첫 경계·첫 완료·장애 훈련 | 문서 | 필요한 항목 찾기 |
| /about/technology/libraries | 영역 바로가기 | 문서 | 필요한 항목 찾기 |
| /about/technology/licenses | 사용한 기술과 소유하지 않는 역할을 함께 공개합니다. | 문서 | 필요한 항목 찾기 |
| /about/technology/playbook | 제작 기술 · 운영 안내 | 문서 | 필요한 항목 찾기 |
| /about/technology/references | 참고 자료 검색과 분류 | 문서 | 필요한 항목 찾기 |
| /about/technology/story | 상태 배지 읽는 법 | 문서 | 필요한 항목 찾기 |
| /about/technology/videos | 브라우저 제작실을 만든 판단과 검증 | 문서 | 필요한 항목 찾기 |
| /about/workflow | 소개 · 제작 과정 | 문서 | 필요한 항목 찾기 |
| /accessibility | 접근성 | 문서 | 필요한 항목 찾기 |
| /account/points | 포인트 지갑 | 입력·설정 | 입력 내용 확인 |
| /admin | 관리자 콘솔 | 관리자 | 선택 항목 검토 |
| /admin/analytics/traffic | 실시간 트래픽 | 관리자 | 선택 항목 검토 |
| /admin/analytics/web-vitals | 분석 · 웹 성능 | 관리자 | 선택 항목 검토 |
| /admin/community | 관리자 · 커뮤니티 | 관리자 | 선택 항목 검토 |
| /admin/engagement/announcements | 공지·배너 | 관리자 | 선택 항목 검토 |
| /admin/growth/inquiries | 고객 상담·비즈니스 문의 | 관리자 | 선택 항목 검토 |
| /admin/growth/promotions | 프로모션 | 관리자 | 선택 항목 검토 |
| /admin/integrations | 관리자 · 외부 연결 | 관리자 | 선택 항목 검토 |
| /admin/members | 관리자 · 회원 | 관리자 | 선택 항목 검토 |
| /admin/monetization/creator-support | 창작자 지원 | 관리자 | 선택 항목 검토 |
| /admin/monetization/funding | 캠페인 | 관리자 | 선택 항목 검토 |
| /admin/monetization/plans | 플랜 | 관리자 | 선택 항목 검토 |
| /admin/monetization/revenue | 정산 | 관리자 | 선택 항목 검토 |
| /admin/monetization/supporters | 운영비 후원 | 관리자 | 선택 항목 검토 |
| /admin/overview | 대시보드 | 관리자 | 선택 항목 검토 |
| /admin/platform/operations | 운영 | 관리자 | 선택 항목 검토 |
| /admin/security/access | 보안·IP | 관리자 | 선택 항목 검토 |
| /admin/security/audit | 감사 로그 | 관리자 | 선택 항목 검토 |
| /admin/trust/cases | 신고 심의 | 관리자 | 선택 항목 검토 |
| /admin/trust/community | 커뮤니티·소재 검수 | 관리자 | 선택 항목 검토 |
| /admin/users/members | 회원 | 관리자 | 선택 항목 검토 |
| /admin/web-vitals | 관리자 · 웹 성능 | 관리자 | 선택 항목 검토 |
| /asset-points | 포인트 지갑 | 검색·목록 | 검색하기 |
| /auth/visual-audit | 인증 · 예시 ID | 인증 | 로그인 계속하기 |
| /author/visual-audit | 작품 목록 · 예시 ID | 인증 | 로그인 계속하기 |
| /authors | 작가별 보기 | 인증 | 로그인 계속하기 |
| /automation | 자동화 | 작업 현황 | 현재 작업 열기 |
| /brand-film | 브랜드 필름 | 검색·목록 | 홍보 영상 자료실 204편 |
| /brush-lab | 브러시 실험실 | 편집기 | 작업 내용 저장 |
| /business | 투자·제휴·스폰서십 | 문서 | 필요한 항목 찾기 |
| /business-plan | 사업계획서 내려받기 | 문서 | 필요한 항목 찾기 |
| /calendar | 연재 캘린더 | 캘린더 | 탐색으로 작품 찾기 |
| /canvas | 캔버스 | 이전 주소 | 정식 화면으로 |
| /challenges | 창작 챌린지 | 이전 주소 | 정식 화면으로 |
| /character-chat | 캐릭터 토크 | 검색·목록 | 3D 캐릭터 셰이퍼 열기 |
| /character-chat/manage | 캐릭터 챗 관리 | 검색·목록 | 팬 화면 보기 |
| /collaborate | 다음 회차, 함께 완성할 사람을 찾으세요. | 검색·목록 | 모집 글 올리기 |
| /collaborate/gallery | 경력·포트폴리오 | 검색·목록 | 공개 링크 전시 보기 |
| /collaborate/moderation | 신고 검토 | 검색·목록 | 구인·의뢰로 돌아가기 |
| /collaborate/new | 작성 예시 미리 보기 | 입력·설정 | 입력 내용 확인 |
| /collaborate/positions | 조건 고르기 | 검색·목록 | 구인·의뢰 게시판 |
| /collaborate/visual-audit | 협업 조건 한눈에 · 예시 ID | 검색·목록 | 구인·의뢰 목록 |
| /collaborate/visual-audit/edit | 작성 예시 미리 보기 · 예시 ID | 입력·설정 | 입력 내용 확인 |
| /collaborate/workspace | 협업 · 작업공간 | 검색·목록 | 검색하기 |
| /community | 커뮤니티 | 피드 | 대화 살펴보기 |
| /community/cafes | 장르 카페 | 피드 | 대화 살펴보기 |
| /community/cafes/visual-audit | 커뮤니티를 찾을 수 없어요 · 예시 ID | 피드 | 회원 커뮤니티 |
| /community/cafes/visual-audit/manage | 카페 · 관리 · 예시 ID | 피드 | 대화 살펴보기 |
| /community/events | 이벤트 게시판 | 피드 | 공식 이벤트 보기 |
| /community/post/visual-audit | 토론 글을 찾을 수 없어요 · 예시 ID | 피드 | 커뮤니티 |
| /community/promote | 아직 발견하지 못한, 당신의 다음 웹툰. | 피드 | 첫 소개 작성하기 |
| /community/promote/moderation | 홍보 신고 관리 | 피드 | ← 홍보 커뮤니티 |
| /community/promote/new | 작품 정보 | 피드 | ← 홍보 커뮤니티 |
| /community/promote/visual-audit | 커뮤니티 · promote · 예시 ID | 피드 | ← 신작·작가 홍보 |
| /community/promote/visual-audit/edit | 작품 정보 · 예시 ID | 피드 | ← 홍보 커뮤니티 |
| /community/timelapses | 타임랩스 갤러리 | 피드 | 내 타임랩스 만들기 |
| /community/visual-audit | 커뮤니티 · 예시 ID | 피드 | 대화 살펴보기 |
| /compare | 작품 비교 | 검색·목록 | 검색하기 |
| /contact | 광고·제휴 문의 | 입력·설정 | 입력 내용 확인 |
| /copyright | 저작권·콘텐츠 안내 | 문서 | 필요한 항목 찾기 |
| /create | 작품 시작하기 | 시작 선택 | 이야기부터 시작 |
| /create?section=continue | 이어서 작업 | 시작 선택 | 내 작업 보기 |
| /create?section=lanes | 다른 시작 방법 | 시작 선택 | 내 작업 보기 |
| /create?section=pipeline | 제작 순서 | 시작 선택 | 내 작업 보기 |
| /create?section=presets | 작업별 프리셋 | 시작 선택 | 내 작업 보기 |
| /create?section=tools | 제작 도구 | 시작 선택 | 내 작업 보기 |
| /create?section=topics | 주제별 시작 | 시작 선택 | 내 작업 보기 |
| /create/challenges | 작품 시작 · 창작 챌린지 | 검색·목록 | 검색하기 |
| /create/promo | 작품 시작 · promo | 검색·목록 | 검색하기 |
| /create/series/visual-audit | 작품 시작 · series · 예시 ID | 검색·목록 | 검색하기 |
| /create/visual-audit | 작품 시작 · 예시 ID | 검색·목록 | 검색하기 |
| /creator-hub | 내 작업 | 이전 주소 | 정식 화면으로 |
| /creator-hub/references | 창작 허브 · 레퍼런스 | 이전 주소 | 정식 화면으로 |
| /creator-support | 창작자 지원 | 작업 현황 | 현재 작업 열기 |
| /creator/early-access | 창작자 · 사전 체험 | 작업 현황 | 현재 작업 열기 |
| /creator/membership | 창작자 · 멤버십 | 작업 현황 | 현재 작업 열기 |
| /creator/revenue | 창작자 · 수익 | 작업 현황 | 현재 작업 열기 |
| /creators | 창작자 | 작업 현황 | 현재 작업 열기 |
| /cuts | 컷츠 | 검색·목록 | 리워드 |
| /cuts/rewards | 리워드 펀드 정산 | 검색·목록 | 피드로 돌아가기 |
| /cuts/studio | 작가 설정 — 팬 리믹스 허용 | 검색·목록 | 리워드 정산 |
| /design | 디자인 시스템 | 문서 | 필요한 항목 찾기 |
| /developers | 개발자 | 문서 | 필요한 항목 찾기 |
| /discover | 다음 이야기를 찾아요 | 검색·목록 | 추천 |
| /discover/works | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /ecosystem | 제작 생태계 | 이전 주소 | 정식 화면으로 |
| /ecosystem/collaboration | 협업 가능한 작가 | 검색·목록 | 공동 캔버스 열기 |
| /ecosystem/education | 조건에 맞는 교육기관이 없어요 | 검색·목록 | 웹툰 지원사업 찾기 |
| /ecosystem/fandom | 팬덤 문화를 지키는 세 가지 약속 | 검색·목록 | 전체 팬 커뮤니티 |
| /ecosystem/library | 만화 · 단행본 검색 | 보관함 | 작업 이어 하기 |
| /events | 이벤트 | 검색·목록 | 검색하기 |
| /events/beta-open | 이벤트 · beta open | 검색·목록 | 검색하기 |
| /explore | 스펙트럼 탐색 | 검색·목록 | 필터 초기화 |
| /features | 기능 소개 | 검색·목록 | 검색하기 |
| /feedback | 의견 게시판 | 입력·설정 | 입력 내용 확인 |
| /fortune | 운세 | 검색·목록 | 검색하기 |
| /fortune/compatibility | 운세 · 궁합 | 검색·목록 | 검색하기 |
| /fortune/monthly | 운세 · 월간 | 검색·목록 | 검색하기 |
| /fortune/prescription | 운세 · 창작 처방 | 검색·목록 | 검색하기 |
| /fortune/saju | 운세 · 사주 | 검색·목록 | 검색하기 |
| /fortune/tarot | 운세 · 타로 | 검색·목록 | 검색하기 |
| /fortune/today | 운세 · 오늘 | 검색·목록 | 검색하기 |
| /fortune/yearly | 운세 · 연간 | 검색·목록 | 검색하기 |
| /fortune/zodiac | 운세 · 별자리 | 검색·목록 | 검색하기 |
| /guide | 랭킹 산정 방식 | 문서 | 필요한 항목 찾기 |
| /help | 도움말 | 문서 | 필요한 항목 찾기 |
| /home | 작업 홈 | 작업 현황 | 작품 목록 열기 |
| /hub | 둘러보기 | 작업 현황 | 작품 목록 열기 |
| /insights | 트렌드 인사이트 | 검색·목록 | 검색하기 |
| /insights/resources | 데이터 출처·상업 이용 준비 | 검색·목록 | 서비스 소개 |
| /install | 앱 설치 | 검색·목록 | 검색하기 |
| /ir | 웹툰의 기획부터 연재·운영까지, 흩어진 제작 도구와 협업 과정을 브라우저 하나로 연결합니다. | 검색·목록 | 발표 플레이어 전체판 열기 (24씬 · 내레이션 포함) |
| /ir/present | 발표 목차 | 검색·목록 | 검색하기 |
| /learn | 학습 홈 | 학습 | 학습 시작하기 |
| /learn/accessibility | 학습 · 접근성 | 학습 | 학습 시작하기 |
| /learn/careers | 학습 · 진로 | 학습 | 학습 시작하기 |
| /learn/classes | 학습 · 강좌 | 학습 | 학습 시작하기 |
| /learn/classroom | 학습 · 교실 | 학습 | 학습 시작하기 |
| /learn/contract-checklist | 학습 · 계약 점검 | 학습 | 학습 시작하기 |
| /learn/education | 학습 · 교육 | 이전 주소 | 정식 화면으로 |
| /learn/glossary | 학습 · 용어 사전 | 학습 | 학습 시작하기 |
| /learn/lessons/assessment-rubric | 평가 루브릭으로 피드백 기준 맞추기 | 학습 | 학습 시작하기 |
| /learn/lessons/assignment-design | 과제 설계: 목표·산출물·기한을 한 장으로 | 학습 | 학습 시작하기 |
| /learn/lessons/background-scene | 배경으로 장소·시간·관계를 설명하기 | 학습 | 학습 시작하기 |
| /learn/lessons/camera-perspective | 아이레벨과 소실점으로 공간 설계하기 | 학습 | 학습 시작하기 |
| /learn/lessons/character-consistency | 캐릭터 시트로 표정·비율·색을 고정하기 | 학습 | 학습 시작하기 |
| /learn/lessons/character-silhouette | 작게 보여도 읽히는 캐릭터와 명도 | 학습 | 학습 시작하기 |
| /learn/lessons/classroom-operations | 교실 단위 수업 운영 계획 세우기 | 학습 | 학습 시작하기 |
| /learn/lessons/color-layers | 밑색·음영·클리핑을 분리해서 이해하기 | 학습 | 학습 시작하기 |
| /learn/lessons/color-script | 컬러 스크립트로 회차 전체의 색 흐름 설계하기 | 학습 | 학습 시작하기 |
| /learn/lessons/episode-arc | 한 회차를 질문·고조·답으로 설계하기 | 학습 | 학습 시작하기 |
| /learn/lessons/feedback-revision | 피드백을 수정 지시로 바꾸고 버전으로 관리하기 | 학습 | 학습 시작하기 |
| /learn/lessons/hiatus-notice-ops | 휴재와 공지, 미리 쓰고 정직하게 알리기 | 학습 | 학습 시작하기 |
| /learn/lessons/inking | 선 굵기와 필압을 의도적으로 사용하기 | 학습 | 학습 시작하기 |
| /learn/lessons/lettering | 말풍선과 대사로 읽는 길 만들기 | 학습 | 학습 시작하기 |
| /learn/lessons/outsourcing-communication | 외주·어시스턴트와 범위와 일정을 합의하기 | 학습 | 학습 시작하기 |
| /learn/lessons/publish-check | 완성 원고를 게시용 파일로 검수하기 | 학습 | 학습 시작하기 |
| /learn/lessons/reader-data-reading | 독자 지표를 읽고 다음 회차에 반영하기 | 학습 | 공식 감상 경로 확인 |
| /learn/lessons/review-approval-flow | 검수·승인 흐름과 결정 기록 남기기 | 학습 | 학습 시작하기 |
| /learn/lessons/scroll-rhythm | 컷과 여백으로 스크롤의 호흡 만들기 | 학습 | 학습 시작하기 |
| /learn/lessons/season-arc-design | 시즌 아크로 여러 회차를 하나의 큰 질문으로 묶기 | 학습 | 학습 시작하기 |
| /learn/lessons/serial-schedule | 연재 일정과 단계별 마감 계획 세우기 | 학습 | 학습 시작하기 |
| /learn/lessons/story-board | 한 문장에서 세 컷의 이야기로 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-ai-coloring | 툰스튜디오 실습 ⑪ AI 자동 채색 후보 받고 검수하기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-background-practice | 툰스튜디오 실습 ③ 배경 배치와 카메라 잡기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-bg3d-practice | 툰스튜디오 실습 ⑨ 3D 배경을 배치하고 구도 기준으로 삼기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-classroom-practice | 툰스튜디오 실습 ⑧ 교실 템플릿으로 과정 짜기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-co-drawing | 툰스튜디오 실습 ⑦ 동시 드로잉으로 한 컷 함께 그리기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-compare-review | 툰스튜디오 실습 ⑫ 수정 전후를 나란히 놓고 비교 검수하기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-episode-assembly | 툰스튜디오 실습 ⑤ 컷을 이어 한 회차로 조립하기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-first-page | 툰스튜디오 실습 ① 세 컷 초안 만들기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-layer-practice | 툰스튜디오 실습 ② 선화와 색 수정하기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-lettering-practice | 툰스튜디오 실습 ④ 대사 넣고 말풍선 검수하기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-mannequin-pose | 툰스튜디오 실습 ⑩ 마네킹으로 포즈와 구도 잡기 | 학습 | 학습 시작하기 |
| /learn/lessons/studio-serial-calendar | 툰스튜디오 실습 ⑥ 연재 캘린더에 회차 배치하고 예약하기 | 학습 | 학습 시작하기 |
| /learn/lessons/team-roles-permissions | 역할 분담과 권한으로 협업 사고 줄이기 | 학습 | 학습 시작하기 |
| /learn/lessons/tone-effects | 톤과 효과로 질감·분위기를 구분하기 | 학습 | 학습 시작하기 |
| /learn/paths/advanced-craft | 심화 제작: 시즌·색·공간·검수 | 학습 | 학습 시작하기 |
| /learn/paths/character-consistency-path | 캐릭터 일관성 다지기 | 학습 | 학습 시작하기 |
| /learn/paths/classroom-teaching | 교실 운영과 과제 설계 | 학습 | 학습 시작하기 |
| /learn/paths/collaboration-production | 협업 제작 파이프라인 | 학습 | 학습 시작하기 |
| /learn/paths/episode-production | 한 회차 제작 워크플로 | 학습 | 학습 시작하기 |
| /learn/paths/first-three-panels | 첫 3컷 완성 | 학습 | 학습 시작하기 |
| /learn/paths/publish-ready | 첫 회차 게시 준비 | 학습 | 학습 시작하기 |
| /learn/paths/review-and-finish | 리뷰·수정으로 완성도 올리기 | 학습 | 학습 시작하기 |
| /learn/paths/serial-operations | 연재 운영 루틴 | 학습 | 학습 시작하기 |
| /learn/paths/story-direction | 스토리·연출 강화 | 학습 | 학습 시작하기 |
| /learn/paths/studio-quickstart | 툰스튜디오 빠른 시작 | 학습 | 학습 시작하기 |
| /learn/paths/visual-finish | 그림 완성도 올리기 | 학습 | 학습 시작하기 |
| /learn/process | 학습 · 작업 과정 | 학습 | 학습 시작하기 |
| /learn/recipes | 학습 · 실습 | 학습 | 학습 시작하기 |
| /learn/records | 학습 · 기록 | 학습 | 학습 시작하기 |
| /learn/resources | 학습 · 자료 | 학습 | 학습 시작하기 |
| /learn/studio | 학습 · 스튜디오 | 학습 | 학습 시작하기 |
| /learn/trace | 학습 · 따라 그리기 | 학습 | 학습 시작하기 |
| /library | 내 서재 | 보관함 | 작업 이어 하기 |
| /lists/visual-audit | 공개 리스트를 열 수 없습니다 · 예시 ID | 검색·목록 | 내 컬렉션 보기 |
| /make | 작품 시작 | 이전 주소 | 정식 화면으로 |
| /market | 창작 마켓 | 검색·목록 | 소재 검색하기 |
| /market?section=explore | 소재 둘러보기 | 검색·목록 | 전체 보기 |
| /market?section=guide | 소재 이용 안내 | 문서 | 필요한 항목 찾기 |
| /market?section=sell | 소재 공유 | 입력·설정 | 입력 내용 확인 |
| /market/browse | 마켓 탐색 | 검색·목록 | 나란히 비교하기 |
| /market/checkout/visual-audit | 마켓 결제 · 예시 ID | 입력·설정 | 입력 내용 확인 |
| /market/compare | 에셋 비교 | 검색·목록 | 적합성 프로필 설정 |
| /market/creator/visual-audit | 올바르지 않은 배급자 주소입니다 · 예시 ID | 상세 | 전체 마켓 목록으로 돌아가기 |
| /market/fit | 제작 적합성 랩 | 검색·목록 | 검색하기 |
| /market/fit-lab | 제작 적합성 랩 | 검색·목록 | 검색하기 |
| /market/library | 내 서재 | 보관함 | 구매·영수증 내역 |
| /market/manage | 내 등록 소재 | 검색·목록 | 첫 에셋 게시하기 |
| /market/orders | 주문·결제 내역 | 검색·목록 | 내 에셋 보관함 확인 |
| /market/publish | 소재 등록 | 입력·설정 | 입력 내용 확인 |
| /market/resource/visual-audit | 소재 마켓 · resource · 예시 ID | 상세 | 탐색 결과로 돌아가기 |
| /market/seller | 판매자 센터 | 검색·목록 | 7종 시각 매니페스트 빌더 열기 |
| /market/wishlist | 찜한 소재 | 보관함 | 더 둘러보기 |
| /marketplace | 마켓 | 이전 주소 | 정식 화면으로 |
| /me | 내 정보 | 보관함 | 작업 이어 하기 |
| /membership | 멤버십 | 작업 현황 | 현재 작업 열기 |
| /membership/usage | 멤버십 · 사용량 | 작업 현황 | 현재 작업 열기 |
| /memberships | 멤버십 | 작업 현황 | 현재 작업 열기 |
| /messages | 메시지 | 메시지 | 대화 열기 |
| /messages/new | 메시지 · 새로 만들기 | 메시지 | 대화 열기 |
| /messages/visual-audit | 메시지 · 예시 ID | 메시지 | 대화 열기 |
| /more | 전체 메뉴 | 이전 주소 | 정식 화면으로 |
| /motion-webtoon | 모션 웹툰 | 검색·목록 | 검색하기 |
| /music | 음악 | 편집기 | 작업 내용 저장 |
| /my | 내 공간 | 보관함 | 작업 이어 하기 |
| /new | 새로 만들기 | 이전 주소 | 정식 화면으로 |
| /news | 웹툰·웹소설 소식 | 검색·목록 | 검색하기 |
| /newsletter | 뉴스레터 | 피드 | 내 구독 관리 |
| /newsletter/compose | 뉴스레터 보내기 | 피드 | 내 구독 관리 |
| /notifications | 알림 | 검색·목록 | 알림 설정 열기 |
| /now | 오늘의 영감 | 검색·목록 | 검색하기 |
| /offline | 오프라인이에요 | 상태·복구 | 긴급 드로잉 보드 열기 |
| /onboarding/character | 캐릭터 선택 | 인증 | 로그인 계속하기 |
| /onboarding/taste | 맞춤 추천 | 인증 | 로그인 계속하기 |
| /opportunities | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /pencafe/visual-audit | 팬카페 · 예시 ID | 피드 | 창작 쇼케이스 |
| /play | 놀이터 | 검색·목록 | 드로잉 스튜디오 열기 |
| /pricing | 요금제 | 검색·목록 | 검색하기 |
| /principles | 제품 원칙 | 이전 주소 | 정식 화면으로 |
| /privacy | 개인정보처리방침 | 문서 | 필요한 항목 찾기 |
| /product-tour | 문서로 받아 가세요 | 검색·목록 | PDF 제품 소개서 ToonStudio가 뭘 하는 서비스인지, 네 쪽으로 정리했어요. PDF 내려받기 |
| /production | 제작 관리 | 작업 현황 | 작품 시작하기 |
| /production/pinned-review | 고정 검수본을 열 수 없습니다 | 작업 현황 | 공개 검수본 전시 보기 |
| /production/projects | 제작 프로젝트 | 작업 현황 | 작품 시작하기 |
| /production/projects/visual-audit | 제작 프로젝트 · 예시 ID | 이전 주소 | 정식 화면으로 |
| /production/projects/visual-audit/activity | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/control | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/episodes | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/episodes/visual-audit | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/handoff | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/manuscripts | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/overview | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/planning | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/procurement | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/production | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/review | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/rights | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/risks | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/schedule | 제작 프로젝트 · 예시 ID | 작업 현황 | 제작 관리 홈 |
| /production/projects/visual-audit/settings | 제작 프로젝트 · 예시 ID | 입력·설정 | 입력 내용 확인 |
| /production/review/visual-audit/visual-audit | 제작 관리 · 검수 · 예시 ID | 작업 현황 | 현재 작업 열기 |
| /production/workspaces | 제작 관리 · 작업공간 | 작업 현황 | 현재 작업 열기 |
| /production/workspaces/join | 작업공간 · 참여 | 작업 현황 | 현재 작업 열기 |
| /production/workspaces/visual-audit | 제작 관리 · 작업공간 · 예시 ID | 작업 현황 | 현재 작업 열기 |
| /production/workspaces/visual-audit/usage | 작업공간 · 사용량 · 예시 ID | 작업 현황 | 현재 작업 열기 |
| /promo-library | 영상 홍보관 | 검색·목록 | 검색하기 |
| /publish | 연재 센터 | 입력·설정 | 입력 내용 확인 |
| /publishing | 검수·내보내기 | 이전 주소 | 정식 화면으로 |
| /random | 랜덤 발견 | 검색·목록 | 검색하기 |
| /ranking | 통합 랭킹 | 랭킹 | 영감으로 작품 시작 |
| /read/spatial | 읽기 · 공간 감상 | 리더 | 공식 감상 경로 확인 |
| /recommend | 맞춤 추천 | 검색·목록 | 검색하기 |
| /references | 창작 레퍼런스 | 검색·목록 | 검색하기 |
| /research | 리서치 | 리서치 데스크 | 자료 찾기 |
| /research/3d-assets | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/archive | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/assets | 창작 레퍼런스 아틀라스 | 검색·목록 | 검색하기 |
| /research/books | 글로벌 만화·도서 판본 탐색 | 검색·목록 | 전체 연구 보드 |
| /research/catalog | 함께 조사할 소재 태그 | 검색·목록 | 자료를 찾는 리서치 데스크로 가기 |
| /research/catalog/notebook | 함께 조사할 소재 태그 | 검색·목록 | 자료를 찾는 리서치 데스크로 가기 |
| /research/checklist | 연재·출판 준비실 | 검색·목록 | 검색하기 |
| /research/creatures | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/fonts | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/material-assets | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/materials | 무료 소재 도감 | 검색·목록 | 스튜디오로 보내기 |
| /research/music-metadata | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-creation | 무료 창작 재료실 | 검색·목록 | 12개 장면 팩으로 연습하기 |
| /research/open-data | 공개 데이터 창작실 | 검색·목록 | 전체 저장 보드 |
| /research/open-data/ambientcg | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/dpla | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/europeana | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/gbif | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/internetarchive | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/kheritage | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/korean | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/musicbrainz | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/nasa | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/neis | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/smithsonian | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/tourapi | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/vam | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/open-data/wikimedia | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/packs | 오픈 콘텐츠 제작실 | 검색·목록 | 저장 보드·백업 관리 |
| /research/rijksmuseum | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/space-assets | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/story | 리서치 · 이야기 | 이전 주소 | 정식 화면으로 |
| /research/vam | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /research/weather-light | 검색 전에 둘러보기 | 검색·목록 | 전체 저장 보드 검색·정렬 |
| /reviews | 리뷰 | 피드 | 리뷰할 작품 찾기 |
| /search | 검색 | 검색·목록 | 검색하기 |
| /settings | 설정 | 입력·설정 | 변경 내용 저장 |
| /settings/ai | 설정 · ai | 입력·설정 | 변경 내용 저장 |
| /settings/api-keys | API 키 허브 | 입력·설정 | 입력 내용 확인 |
| /settings/integrations | 외부 연동 | 입력·설정 | 입력 내용 확인 |
| /settings/notifications | 설정 · 알림 | 입력·설정 | 변경 내용 저장 |
| /settings/role | 설정 · role | 입력·설정 | 변경 내용 저장 |
| /shaper | 캐릭터 만들기 | 편집기 | 작업 내용 저장 |
| /share/version/visual-audit | 비밀번호가 필요한 링크예요 · 예시 ID | 검색·목록 | 로그인하기 |
| /showcase | 전체 작품 둘러보기 | 피드 | 발행하러 가기 |
| /showcase/challenges | 창작 챌린지 | 피드 | 자유 주제로 그리기 |
| /showcase/promo | 당신의 웹툰을, 움직이는 예고편으로. | 피드 | 신작·작가 홍보 게시판 → |
| /showcase/reviews | 작가가 공개를 따로 승인한 검수본 | 피드 | 일반 작품 전시로 돌아가기 |
| /showcase/reviews/visual-audit | 고정 검수본을 열 수 없습니다 · 예시 ID | 피드 | 공개 검수본 전시 보기 |
| /showcase/series/visual-audit | 회차 목록 · 예시 ID | 피드 | 대화 살펴보기 |
| /showcase/work/visual-audit | 이 작품을 이어서 그린 리믹스 작품들 · 예시 ID | 상세 | 상세 내용 보기 |
| /sitemap | 전체 메뉴 | 목적 메뉴 | 목적 선택 |
| /sitemap/all | 사이트맵 | 목적 메뉴 | 전체 메뉴로 돌아가기 |
| /sitemap/connect | 함께 보기 | 목적 메뉴 | 전체 기능 목록 보기 |
| /sitemap/create | 만들기 | 목적 메뉴 | 전체 기능 목록 보기 |
| /sitemap/discover | 작품 찾기 | 목적 메뉴 | 전체 기능 목록 보기 |
| /sitemap/grow | 자료·성장 | 목적 메뉴 | 전체 기능 목록 보기 |
| /sitemap/personal | 내 기록 | 목적 메뉴 | 전체 기능 목록 보기 |
| /sitemap/publish | 연재·내보내기 | 목적 메뉴 | 전체 기능 목록 보기 |
| /sitemap/rest | 쉬어가기 | 목적 메뉴 | 전체 기능 목록 보기 |
| /sitemap/visual-audit | 사이트맵 · 예시 ID | 목적 메뉴 | 전체 기능 목록 보기 |
| /status | 마지막 상태 확인에 실패했습니다. | 상태·복구 | 문제 제보하기 |
| /story | 이야기 | 이전 주소 | 정식 화면으로 |
| /story-lab | 스토리 연구실 | 검색·목록 | AI 도구 열기 → |
| /studio | 내 작업 | 보관함 | 작업 이어 하기 |
| /studio/ai-lab | 외부 AI Runtime | 검색·목록 | 검색하기 |
| /studio/ai-runtime | AI Runtime 이전 경로 | 검색·목록 | 검색하기 |
| /studio/ai-settings | AI 설정 | 입력·설정 | 변경 내용 저장 |
| /studio/analytics | 창작자 애널리틱스 | 작업 현황 | 연재·배급 허브 |
| /studio/anchor-lab | 캐릭터 앵커 연구실 | 편집기 | 작업 내용 저장 |
| /studio/animation | 스튜디오 · 애니메이션 | 편집기 | 작업 내용 저장 |
| /studio/assets | 에셋 | 보관함 | 내 작업으로 |
| /studio/assets/3d | 3D 에셋 | 이전 주소 | 정식 화면으로 |
| /studio/assets/audio | 오디오 에셋 | 편집기 | 작업 내용 저장 |
| /studio/assets/brushes | 브러시 선택 | 이전 주소 | 정식 화면으로 |
| /studio/assets/brushes/new | 새 브러시 만들기 | 편집기 | 작업 내용 저장 |
| /studio/assets/brushes/visual-audit/edit | 브러시 설정 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/assets/characters/new | 새 캐릭터 만들기 | 편집기 | 작업 내용 저장 |
| /studio/bg3d | 스튜디오 · 3D 배경 | 편집기 | 작업 내용 저장 |
| /studio/branching-cuttoon | 분기형 컷툰 실험 | 편집기 | 작업 내용 저장 |
| /studio/brush-lab | 스튜디오 · 브러시 실험실 | 편집기 | 작업 내용 저장 |
| /studio/brushes | 스튜디오 · 브러시 | 보관함 | 작업 이어 하기 |
| /studio/canvas | 스튜디오 · 캔버스 | 편집기 | 작업 내용 저장 |
| /studio/character | 스튜디오 · 캐릭터 | 편집기 | 작업 내용 저장 |
| /studio/character-convert | 캐릭터 변환 | 입력·설정 | 입력 내용 확인 |
| /studio/comic | 스튜디오 · 웹툰 | 편집기 | 작업 내용 저장 |
| /studio/companion/navigator | 작업 동반 도구 · 이동 | 작업 현황 | 현재 작업 열기 |
| /studio/companion/reference | 작업 동반 도구 · 참고 자료 | 검색·목록 | 검색하기 |
| /studio/companion/review | 작업 동반 도구 · 검수 | 작업 현황 | 현재 작업 열기 |
| /studio/companion/workspace | 작업 동반 도구 · 작업공간 | 작업 현황 | 현재 작업 열기 |
| /studio/compose/visual-audit | 스튜디오 · 장면 구성 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/draft/visual-audit | 임시 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/ecosystem | 제작 생태계 | 검색·목록 | 자체 예제로 제작 시작 |
| /studio/ecosystem/viewer | 생태계 뷰어 | 검색·목록 | ← 제작 생태계 |
| /studio/engines | 설치·라이선스 | 문서 | 필요한 항목 찾기 |
| /studio/environment | 사용 환경 안내 | 문서 | 필요한 항목 찾기 |
| /studio/generate | 생성형 제작 | 입력·설정 | 입력 내용 확인 |
| /studio/growth | 독자 관리 · 집계 세그먼트 | 작업 현황 | 수익·정산 대시보드 |
| /studio/growth-ip | 작가 성장·IP 확장 | 작업 현황 | 창작 생태계 보기 |
| /studio/immersive | 공간 제작 | 편집기 | 작업 내용 저장 |
| /studio/import | 가져오기 | 입력·설정 | 입력 내용 확인 |
| /studio/jobs | 처리 중 작업 | 작업 현황 | 현재 작업 열기 |
| /studio/join | 스튜디오 · 참여 | 입력·설정 | 입력 내용 확인 |
| /studio/lift3d | 스튜디오 · lift3d | 입력·설정 | 입력 내용 확인 |
| /studio/manual | 공식 가이드 | 문서 | 필요한 항목 찾기 |
| /studio/manual/visual-audit | 가이드 · 예시 ID | 문서 | 필요한 항목 찾기 |
| /studio/motion-webtoon | 모션 웹툰 | 편집기 | 작업 내용 저장 |
| /studio/new | 새로 만들기 | 시작 선택 | 템플릿 없이 시작 |
| /studio/p/visual-audit | 프로젝트 · 예시 ID | 이전 주소 | 정식 화면으로 |
| /studio/p/visual-audit/assets | 에셋 · 예시 ID | 보관함 | 작업 이어 하기 |
| /studio/p/visual-audit/d/visual-audit | 문서 편집 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/p/visual-audit/export | 내보내기 · 예시 ID | 작업 현황 | 현재 작업 열기 |
| /studio/p/visual-audit/overview | 개요 · 예시 ID | 작업 현황 | 현재 작업 열기 |
| /studio/p/visual-audit/production | 제작 · 예시 ID | 작업 현황 | 현재 작업 열기 |
| /studio/p/visual-audit/review | 검토 · 예시 ID | 작업 현황 | 현재 작업 열기 |
| /studio/p/visual-audit/settings | 프로젝트 설정 · 예시 ID | 입력·설정 | 변경 내용 저장 |
| /studio/p/visual-audit/space | 협업 스튜디오 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/p/visual-audit/story | 스토리 · 예시 ID | 입력·설정 | 입력 내용 확인 |
| /studio/pdf-workbench | PDF 워크벤치 | 편집기 | 작업 내용 저장 |
| /studio/poser | 포즈 스튜디오 | 편집기 | 작업 내용 저장 |
| /studio/present | 스튜디오 · 프레젠테이션 | 편집기 | 작업 내용 저장 |
| /studio/projects | 스튜디오 · projects | 보관함 | 작업 이어 하기 |
| /studio/publish | 검수·내보내기 | 입력·설정 | 입력 내용 확인 |
| /studio/recovery | 복구 | 이전 주소 | 정식 화면으로 |
| /studio/remix/visual-audit | 스튜디오 · 리믹스 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/animation | 리믹스 · 애니메이션 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/assets | 리믹스 · 소재 · 예시 ID | 보관함 | 작업 이어 하기 |
| /studio/remix/visual-audit/bg3d | 리믹스 · 3D 배경 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/brush-lab | 질감·톤 실험실 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/brushes | 리믹스 · 브러시 · 예시 ID | 보관함 | 작업 이어 하기 |
| /studio/remix/visual-audit/canvas | 리믹스 · 캔버스 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/character | 리믹스 · 캐릭터 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/comic | 리믹스 · 웹툰 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/compose/visual-audit | 리믹스 · 장면 구성 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/poser | 리믹스 · 포즈 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/present | 리믹스 · 프레젠테이션 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/review | 리믹스 · 검수 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/storyworld | 리믹스 · 세계관 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/remix/visual-audit/versions | 리믹스 · 버전 · 예시 ID | 보관함 | 작업 이어 하기 |
| /studio/review | 스튜디오 · 검수 | 작업 현황 | 현재 작업 열기 |
| /studio/share | 스튜디오 · 공유 | 입력·설정 | 입력 내용 확인 |
| /studio/space | 내 가상스튜디오 | 편집기 | 작업 내용 저장 |
| /studio/storyworld | 스튜디오 · 세계관 | 편집기 | 작업 내용 저장 |
| /studio/support | 작가 지원 | 검색·목록 | 신인·학생 창작자 지원 안내 |
| /studio/templates | 템플릿 | 검색·목록 | 작품 시작하기로 돌아가기 |
| /studio/toolchain | 제작 도구 | 검색·목록 | 검색하기 |
| /studio/trash | 휴지통 | 이전 주소 | 정식 화면으로 |
| /studio/versions | 스튜디오 · 버전 | 보관함 | 작업 이어 하기 |
| /studio/work/visual-audit | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/animation | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/assets | Studio 작업 · 예시 ID | 보관함 | 작업 이어 하기 |
| /studio/work/visual-audit/bg3d | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/brush-lab | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/brushes | Studio 작업 · 예시 ID | 보관함 | 작업 이어 하기 |
| /studio/work/visual-audit/canvas | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/character | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/comic | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/compose/visual-audit | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/poser | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/present | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/publish | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/review | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/storyworld | Studio 작업 · 예시 ID | 편집기 | 작업 내용 저장 |
| /studio/work/visual-audit/versions | Studio 작업 · 예시 ID | 보관함 | 작업 이어 하기 |
| /support | 문의 | 검색·목록 | 공개 이용 질문 |
| /support-creators | 창작자 지원 | 피드 | 대화 살펴보기 |
| /support-us | ToonStudio 응원하기 | 검색·목록 | 검색하기 |
| /tags | 태그로 찾기 | 검색·목록 | 조건으로 작품 찾기 |
| /team | 팀 | 작업 현황 | 작품 목록 열기 |
| /team/organization | 조직 홈 | 작업 현황 | 팀 관리로 이동 |
| /team/people | 팀 · 구성원 | 작업 현황 | 현재 작업 열기 |
| /team/people/join | 팀 합류 | 작업 현황 | 팀 목록으로 |
| /team/people/visual-audit | 팀 · 구성원 · 예시 ID | 작업 현황 | 현재 작업 열기 |
| /team/people/visual-audit/usage | 구성원 · 사용량 · 예시 ID | 작업 현황 | 전체 팀 보기 |
| /team/recruiting | 인재·지원 관리 | 작업 현황 | 공개 구인·의뢰 보기 |
| /terms | 이용약관 | 문서 | 필요한 항목 찾기 |
| /title/visual-audit | 작품 상세 · 예시 ID | 상세 | 공식 감상 경로 확인 |
| /title/visual-audit/episodes | 작품 상세 · 예시 ID | 상세 | 공식 감상 경로 확인 |
| /title/visual-audit/read/visual-audit | 작품 읽기 · 예시 ID | 리더 | 공식 감상 경로 확인 |
| /tour | 제품 투어 | 이전 주소 | 정식 화면으로 |
| /u/visual-audit | 공개 프로필 · 예시 ID | 검색·목록 | 검색하기 |
