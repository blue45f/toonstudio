# 서비스 소개 반응형·탐색 개선 — 2026-11-07

상태: **current — 로컬 구현·검증 기록**. 원격 CI·main 통합·운영 배포와 구분한다.

## 범위와 기존 디자인 대조

- 대상은 `/about` 한 페이지다. `AboutPage.tsx`, 전용 CSS, 단위 테스트와 이 검증 기록만 변경한다.
- 작업 기준은 `origin/main`의 `0dbc750223`이며, 최종 검증 전에 `3698e5162d`를 fast-forward 반영했다.
- 기존 `AboutSectionNav`, `AboutFeatureShowcase`, HeroBlock, StudioWindowMock, 브랜드 이미지와 테마 토큰을 재사용했다. 다른 페이지의 공용 컴포넌트는 수정하지 않았다.
- `docs/design/reference-design-audit-20260928.md`의 공통 시각 방향과 기존 구현을 대조했다. `docs/design/sitewide-experience-predevelopment-20260916/wireframes-and-flows.md`는 제품 전체 정보구조 참고 자료이며 `/about` 전용 3기기 시안은 아니다.
- 접근 가능한 저장소의 tracked 파일명·디자인 문서에서 `/about` 전용 모바일·태블릿·PC 독립 시안 파일은 확인하지 못했다. 외부 디자인 서비스 전체의 부재를 뜻하지 않는다. 기존 아트를 재생성하지 않았다.
- 이 폴더의 PNG는 **실제 구현 화면의 검증 캡처**다. 구현 전 시안·외부 승인본으로 표시하지 않는다.

## 개선한 내용

1. 첫 화면의 약속 세 가지를 가로 스크롤 대신 줄바꿈 가능한 카드로 모두 표시한다.
2. 핵심 기능·제작 흐름·역할·영상으로 가는 네 가지 페이지 내 바로가기를 추가했다. 네이티브 앵커는 기존 제목의 `tabIndex=-1`과 스크롤 여백을 사용한다.
3. 제작 네 단계를 의미 있는 순서 목록과 2열/4열 그리드로 표시한다. 기존 기획·제작·검토·발행 목적지를 유지한다.
4. 좁은 역할 카드에서는 아이콘을 위에 두어 문장이 불필요하게 여러 줄로 꺾이지 않게 했다.
5. 모바일 소개 영상은 두 편 모두 보이는 작은 가로 카드, 태블릿·PC에서는 2열 포스터 카드로 표시한다.
6. 보조 자료 11개는 네이티브 펼침 안에서 읽기 쉬운 1열/2열/3열 목록으로 제공한다. 모든 기존 링크를 유지했다.
7. 신규 조작은 최소 48px 높이, 키보드 초점 표시, 강제 색상 모드 경계선을 갖는다. 한·영 문구는 기존 bilingual 경로에 함께 등록한다.

## 실제 검증

- 관련 Vitest 3파일 **11개 통과**: 새 페이지 동작, 기존 링크 보존, About 라우트 계약.
- `verify-about.mjs`: **11조건 통과**. 320/390px 모바일, 768px 태블릿, 1440px PC, CSS 200% 확대, light, contrast, reduced-motion, forced-colors, 영어 모바일, 이미지 요청 실패.
- 모든 조건에서 페이지 가로 넘침 0, 새 약속/단계/영상 레일 잘림 0, 약속 3개·단계 4개·영상 2개·자료 링크 11개 보존.
- axe WCAG 2/2.1/2.2 A·AA 자동 검사: 자료 펼침을 연 본문 범위에서 11조건 모두 위반 0. 페이지 런타임 오류 0.
- 키보드 Enter로 섹션 제목 초점 이동, Space로 보조 자료 열기·닫기 반복, ArrowRight로 기능 탭 이동을 확인했다.
- 390px 터치에서 브랜드 필름 링크를 눌러 이동하고 브라우저 뒤로·앞으로·뒤로 복귀했다. 별도 탐색 검사에서는 390/1440px 모두 브랜드 필름 재생 버튼과 실제 제목, 전체 기능 페이지의 고유 제목이 렌더된 뒤 복귀하는 것까지 확인했다. URL 변화나 이전 화면의 제목을 도착 완료로 취급하지 않는다.
- 첫 방문 장식 인트로가 끝난 뒤 캡처하도록 readiness 조건을 추가했으며, 모바일·태블릿·PC 실제 픽셀을 재검토했다.
- `pnpm harness:doctor` 통과. `pnpm harness:verify` 최종 종료 코드 **0**. 하네스·lockfile·변경 lint·Secretlint·아키텍처, 웹 전체 **26,341/26,341 파일·16샤드·진단 0**, API 기본·work-session-browser·postgres-tools 타입 검사까지 통과했다.
- 최초 공유 node_modules 연결은 worktree 소유권 검사에서 실패했다. 연결을 제거하고 이 checkout에서 `pnpm install --offline --frozen-lockfile`로 격리 설치한 뒤 재검증했다. 원본 checkout 의존성은 수정하지 않았다.
- 첫 기준점의 기존 MySpace 테스트 타입 오류 4개는 이 페이지와 무관했고, 후속 main `3698e5162d`에 포함된 수정 반영 후 검사를 다시 시작했다.

## 실행 방법

저장소 루트에서, 격리 의존성이 설치된 환경에서 실행한다. API를 모두 503 fixture로 처리하며 운영 데이터를 읽거나 바꾸지 않는다.

```sh
pnpm harness:verify
pnpm exec vitest run apps/web/src/domains/legal/AboutPage.test.tsx apps/web/src/domains/legal/about-pages-links.test.ts apps/web/src/app/routes/groups/about-routes.test.tsx
node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts --host 127.0.0.1 --port 4197 --strictPort
# 별도 터미널, 로컬 서버가 준비된 뒤
node docs/about-responsive-20261107/verify-about.mjs
node docs/about-responsive-20261107/verify-about-navigation.mjs
```

기본 포트가 사용 중이면 자신이 소유한 로컬 서버 주소를 `ABOUT_QA_BASE`로 지정한다. 스크립트는 localhost 이외 주소를 거부한다.

## 증거와 미검증 범위

- `browser-report.json`: 조건별 치수·자동 접근성·키보드·오류 기록.
- `navigation-report.json`: 모바일·PC의 실제 도착 화면과 돌아오기 검증 결과.
- `validation-summary.json`: 최종 하네스·타입·단위·브라우저 검증 요약.
- `screenshots/`: 기존 390px 화면, 개선한 각 조건과 보조 자료 펼침 화면.
- 200%는 CSS zoom 2 검증이다. OS·브라우저 메뉴의 실제 확대, 실기기 Safari/VoiceOver·TalkBack은 실행하지 않았다.
- 정적 소개 페이지는 사용자 목록의 빈 상태가 없다. 모든 API 실패와 장식 이미지 실패에서도 핵심 텍스트와 링크가 남는 것을 검사했다.
- 로그인·프로젝트 생성·저장·발행 완료, 결제, 실제 영상 재생 끝까지는 이 페이지 변경의 검증 범위가 아니다. 목적지 URL만으로 이 기능들의 완료를 주장하지 않는다.
- 이 작업에서 원격 push·PR·main 병합·운영 배포를 실행하지 않았다. main 통합은 별도 담당 검증과 조율한다.
