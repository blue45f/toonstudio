# 랭킹 보조 정보 밀도 보완 · 2026-11-09

상태: current. 로컬 `6dcbf82f` 기준의 독립 worktree에서 검증한 변경을 `0e8fca6c` 위 로컬 main에 충돌 없이 통합했다. 원격·배포는 변경하지 않았다.

## 범위

- 사용자 제공 `ranking-responsive-concept.png`의 실제 픽셀과 기존 390px 로컬 화면을 대조했다. 주요 필터는 이미 구현되어 있어 유지했다.
- 페이지 전용 두 접기 설명의 여백과 아이콘을 줄였다. 제목·요약·본문·기본 접힘·키보드 조작은 유지했다.
- 탐색·비교·커뮤니티의 다음 행동 카드를 간결한 링크로 바꿨다. 목적지와 상세 접근성 설명은 보존했다. 390·834·1440px에서는 높이 44px, 320px에서는 두 줄 92px이며 각 링크의 눌림 영역은 44px 이상이다.
- 밝은 테마에서 기존 보드 접기 제목이 매우 옅게 표시되는 문제를 확인해 페이지 안의 summary에 기존 전경색 토큰을 적용했다.
- 공용 카드·보드 컴포넌트·다른 페이지·랭킹 데이터·필터 상태는 변경하지 않았다. 오류 패널, 공통 셸, 성공 데이터 화면은 이번 구현 범위 밖이며 시안 전체 일치를 뜻하지 않는다.

## 검증

- 관련 Vitest 3파일 13개 통과: RankingPage, ranking-primary-controls, ranking-board.reference-layout.
- Chrome 320·390·834·1440px × starlight·light·contrast 12조합 통과. 가로 넘침 0, 링크 크기·높이, 두 설명 반복 Enter 열기/닫기, 필터 열기/닫기, 탐색 이동 후 Back 복원, 페이지 오류 0을 확인했다.
- 첫 캡처는 시작 화면이 가려 재촬영했다. 최종 390px light와 1440px starlight의 실제 픽셀을 확인했다. 최종 스크린샷은 시작 화면 종료를 기다린 결과다.
- 검증은 모든 외부 origin을 차단하고 합성 503 응답을 사용했다. 운영 데이터나 실제 순위를 검증한 결과가 아니다.
- `git diff --check`, `pnpm harness:check`, 변경 파일 Secretlint 통과. `pnpm harness:verify` 종료 코드 0: 웹 26,486개 소스 타입검사 진단 0, API·도구 타입검사, 변경 lint·Secretlint·아키텍처 및 번들 경계 검사 통과. 최종 CSS·문서에는 추가 Secretlint와 브라우저 검증을 적용했다. 전체 회귀·프로덕션 빌드·원격 CI·배포는 실행하지 않았다.
- 320px·텍스트 200%에서 가로 넘침 0과 세 다음 행동 링크의 키보드 초점·44px 이상 높이를 확인했다.

## 재현

이 worktree는 오프라인 캐시로 독립 설치했고 다른 checkout의 node_modules를 연결하지 않았다. 아래 명령은 저장소 루트에서 실행하며 이미 사용 중인 서버·포트를 임의로 중지하지 않는다.

```sh
node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts --host 127.0.0.1 --port 5301 --strictPort
node docs/ranking-density-20261109/qa.cjs
node node_modules/vitest/vitest.mjs run apps/web/src/domains/catalog/RankingPage.test.tsx apps/web/src/shared/components/ranking-primary-controls.test.tsx apps/web/src/shared/components/ranking-board.reference-layout.test.tsx
pnpm harness:verify
```

## 로컬 main 통합 검증

2026-11-09에 clean main과 대상 파일 변경 없음·인덱스 잠금 없음·활성 Git 작업 없음을 확인했다. 다른 랩스 4파일 변경을 보존하고 관련 3파일 13개 테스트 및 main 로컬 서버의 브라우저 12조합을 다시 통과했다. 독립 브랜치·사본은 보존했고 원격 조회·푸시·배포는 실행하지 않았다.
