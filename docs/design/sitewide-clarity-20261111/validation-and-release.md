# 화면 명료성 개선 검증·배포 인계 — 2026-11-11

상태: **migration**. 아래 표는 실행한 검증과 남은 릴리스 조건을 구분한다. 디자인 갤러리,
정적 경로 조사, 게스트 시각 관측, 실제 로그인 업무, 운영 반영은 서로 다른 증거다.

## 현재 확인 범위

| 항목 | 상태 | 근거와 한계 |
| --- | --- | --- |
| 정적 경로 조사 | 확인 | 정본 AST 수집기에서 주소 441개. 별칭·리다이렉트와 동적 경로의 `visual-audit` 표본을 포함하며 독립 페이지 수가 아니다. [경로 원장](./route-inventory.json) 참조 |
| 초기 개발 서버 관측 | 중단·진단용 | Vite 초기 모듈 로딩과 동시 HMR 중 주요 경로 15조건, 전수 실행 6조건을 기록한 뒤 중단했다. 준비 시간 초과를 제품의 최종 회귀로 확정하지 않는다. 로컬 `.qa/clarity-20261111/initial-partial-status.json`에 중단 전 수치를 동결했다 |
| 최종 빌드·전체 주소 시각 관측 | 대기 | 최종 빌드 성공과 산출물 확인 뒤 다시 실행한다. 초기 개발 서버 관측이나 시안 갤러리의 441행 검증으로 대신하지 않는다 |
| 모바일 메뉴·서재 키보드 | 수정 후 22항목 통과·개발 서버 범위 | 390px·게스트/API fixture·GPU 비활성 조건. 서재 사용법·쿼리 현재 위치, native Enter/Space, 닫힌 링크 제외, Tab 48회·Shift+Tab, 포커스 진입·Escape 복귀·스크롤 잠금·배경 inert·해제·링크 이동과 Back 스크롤·포커스 복원 통과. Vite hot update 0건 |
| 리더의 부가 도구 접힘 | 1차 소스 12항목 통과 | 1440·390px에서 기본 닫힘·부가 링크의 접근성 트리 제외·Enter로 3개 도구 표시·Space로 닫힘 확인. 당시 공식 플랫폼·다음 회차 링크 보존 확인. 실제 카탈로그 작품 fixture를 사용했으며, 외부 플랫폼의 회차를 읽거나 실제 회차 데이터를 검증한 결과는 아니다. 후속 공식 감상·회차 계약 변경 검증과 구분한다 |
| 제목 크기 실측 | 1차 소스 6항목 통과 | 1440·390px에서 공통 기본 헤더(`/community/title`) 32·24px, 명시적 마켓 hero 60·32px. 자체 헤더를 쓰는 `/community`는 기존 36·24px이며 공통 기본 헤더의 32px 규칙과 구분한다 |
| 배포 안내 정리 | 통과 | 기존 문서·정본 진입점 계약 2파일 20테스트, `pnpm harness:check`, 변경 안내 3파일 Secretlint, 해당 diff 공백 검사 통과. 명령·별칭·상시 승인·운영 정책 코드는 변경하지 않았다 |
| 정적 웹 preflight | 차단 | 올바른 정적 웹 명령은 `blocked`를 반환했다. 작업트리 변경 및 현재 세션의 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID` 부재가 원인이다. 원격 권한 검증·배포 완료를 뜻하지 않는다 |
| 실제 로그인·GPU 편집·저장·내보내기 | 미실행 | 게스트·API fixture·GPU 비활성 시각 관측으로 보증하지 않는다 |
| 원격 main 반영·필수 CI | 미확인 | 해당 릴리스 SHA의 `core`·`verify` 성공을 별도로 확인해야 한다 |
| 운영 배포·배포 후 스모크 | 미실행 | 현 세션의 배포 인증이 없다. Worker 버전·배포 ID·운영 반영을 확인하지 않았다 |

초기 관측은 `guest-fixture`, 다른 API의 `503-fixture`, GPU 비활성 조건이다. 닫힌 브라우저가
SIGTERM 이후 기록한 탐색 실패는 초기 검증 수치에 포함하지 않는다. 향후 전수 관측에서도
접근 안내·장애·기능 저하·준비 시간 초과와 정상 본문을 분리하여 보고한다.

수정 전 모바일 메뉴의 복원 결함은 `/community`의 `scrollY=220`에서 메뉴를 열어 랭킹으로 이동한 뒤
브라우저 Back으로 돌아왔을 때 확인했다. 실제 커뮤니티 제목과 `route-state=ready`까지 기다렸으나
`scrollY=0`, `BODY` 포커스가 남았다. 메뉴를 열 때는 220px 위치가 유지되어, 잠금 자체의 위치
손실과 구분했다. 로컬 증거는 `.qa/clarity-20261111/mobile-navigation-confirmed/report.json`과
`starlight-mobile-menu-back-state.png`다. 이 증거는 수정 전 상태로 보존했다.

후속 클릭 계측에서는 capture 단계 뒤 메뉴 링크가 DOM에서 제거되고 bubble 단계의
`defaultPrevented=false`가 남은 채 실제 문서가 교체됐다. 메뉴의 capture 닫기가 RouterLink의
이벤트 처리를 앞서는 경로다. `.qa/clarity-20261111/menu-click-diagnostic.json`에 문서 교체와
이벤트 단계의 관측을 남겼다.

메뉴의 capture 닫기를 제거하고 React Router의 `location.key`가 실제로 바뀐 뒤 닫도록 수정했다.
동일 경로 이동은 닫히고, 가드 취소·수정키·새 탭은 원래 이벤트 처리를 유지한다. 네비게이션 기억
범위·저장 정책은 변경하지 않았다. 실제 메뉴를 unmount하는 회귀·이동 취소·수정키와 기존 Link
계약 2파일 38테스트, 변경 TSX ESLint·Secretlint·공백 검사를 통과했다.

수정 후 같은 모바일 22항목이 모두 통과했다. 실제 커뮤니티로 Back 시 `scrollY=220`과 연결된
버튼 포커스가 복원됐고, 추가 계측에서 bubble 단계의 `defaultPrevented=true`, 연결된 메뉴 링크,
동일 문서 ID를 확인했다. 두 실행 모두 Vite hot update는 0건이다. 수정 후 증거는
`.qa/clarity-20261111/dot-review-after/mobile-navigation/report.json`과
`.qa/clarity-20261111/dot-review-after/menu-click-diagnostic.json`에 있다.

앞선 QA의 잘못된 헤더 선택자와 닫힌 서재 사용법 미활성화는 제품 결함으로 세지 않는다.
해당 시도는 `.qa/clarity-20261111/automation-corrections.json`에 제외 사유와 함께 보존했다.
닫힌 native `<details>`의 자식은 레이아웃 좌표가 남을 수 있어 `getClientRects()`만으로 표시를
판정하지 않았다. 리더의 부가 링크는 브라우저 역할 가시성으로 다시 확인했고 12항목 모두 통과했다.
1차 개발 서버 표본은 메뉴 22·리더 12·제목 6개, 총 40항목 중 38통과·복원 2실패였다.
위 메뉴 수정 후 해당 22항목을 다시 검증해 22통과를 확인했다. 이전 리더·제목 수치를 후속 변경의
최신 검증으로 합산하지 않으며 최종 번들·441개 주소 전수 관측·로그인 업무 검증을 대체하지 않는다.

## 배포할 때 실행할 명령

실행 위치는 검토된 저장소 루트다. 현행 정적 웹 진입점은 다음 하나이며, 웹 빌드·R2 동기화와
기존 Cloudflare Worker의 운영 코드를 변경한다.

```bash
pnpm run deploy:web
```

현재 세션에서 이 명령을 실행한 것은 아니다. [배포 가이드](../../../DEPLOY.md#2-정적-웹과-core-api-배포)와
[정본 5단계 안내](../../operations/ai-deployment-quickstart.md)에 따라 다음을 먼저 준비한다.

1. clean `main`의 소문자 40자리 SHA와 배포 시점 `origin/main` 끝이 일치하고, 그 SHA의 `core`·`verify`가 성공해야 한다. 유효한 정적 웹 상시 승인은 매 릴리스 승인 변수를 대체하며 나머지 조건은 유지한다.
2. `deploy:verify`, 정적 웹 목적 preflight, 빌드·번들 검사와 dry-run을 통과하고, `dist/.vite/build-meta.json`의 `gitSha`가 릴리스 SHA와 같은지 확인한다. preflight 명령은 `pnpm run deploy:preflight --operation static-deploy --unit static-worker`다. pnpm 인자 사이에 별도 `--`를 넣지 않는다.
3. 기존 승인된 secret store에서 `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`만 필요한 배포 세션에 제공한다. 기존 `toonspectrum-web`의 코드·Static Assets 배포와 `toonspectrum-public-assets`의 객체 목록 조회·업로드 권한이 필요하다. 현재 R2 REST 동기화에는 API 토큰이 필요하며 OAuth 로그인만으로 전체 배포 가능성을 주장하지 않는다. 원문 비밀값·로컬 env·Keychain을 복사하거나 요청하지 않는다.
4. 직전 정상인 컷오버 이후 Worker 버전을 기록하고 `.git/toonstudio-deploy-ledger/cloudflare-static/<sha>.json`의 중복 여부를 확인한다. 같은 SHA를 자동 재배포하지 않는다.
5. 배포 후 실제 Worker 버전·SHA·배포 원장, 원점 readiness, 에지 출처 인증, 주요 화면·로그인, 제품 투어 실재생과 Studio의 `crossOriginIsolated`를 확인한다. 실패하면 기록한 정상 Worker 버전으로 복구하고 같은 스모크를 반복한다.

이 웹 작업에 onpod 이미지·DB·DNS·기존 runtime secret 변경은 포함하지 않는다. 접근 권한이
거절된 서비스를 다른 도구로 우회하지 않으며, 인증이 없는 동안 배포·사후 검증은 미실행 상태로 남긴다.
