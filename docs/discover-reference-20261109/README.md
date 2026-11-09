# 탐색 장르 바로가기 시안 보완 · 2026-11-09

상태: current. 기준은 확보한 원격 main `0104238b85194e321e78fc32b2f00b430ed66495`이다. 원격에 반영한 변경은 아니며 운영 배포도 하지 않았다.

## 구현과 시각 비교

- 사용자 제공 `discover-responsive-concept.png`의 실제 픽셀을 확인했다. 모바일 시안은 장르 3개 뒤에 전체 장르가 즉시 보이지만 기존 앱은 전체 장르를 가로 스크롤 끝으로 밀어냈다.
- 모바일·태블릿에서는 장르 3개와 전체 장르, 데스크톱에서는 장르 7개와 전체 장르를 표시한다. 폭이 부족하면 줄바꿈하며 나머지 장르는 기존 `/explore`에서 선택한다.
- 검색어 지우기를 36px에서 44px로 확대했다. 검색 URL·입력 보존·연재 트랙·API 오류 안내는 변경하지 않았다.
- 원본 시안과 전체 화면이 동일하다는 주장이 아니다. 시안의 연재 트랙 밀도, 오류 카드 일러스트, 대표작 성공 상태는 이번 변경 범위 밖이다.

## 검증

- **의존성 수정 완료(2026-11-09)**: 다른 checkout의 node_modules 링크 17개를 별도 로컬 폴더로 옮겨 보존하고 `pnpm install --frozen-lockfile`로 독립 설치했다. 다른 worktree의 node_modules는 변경하지 않았다. 소유권 검사 19패키지·29개 workspace 의존성과 `pnpm harness:doctor`가 통과했다. 전체 `pnpm harness:verify`는 종료 코드 0으로 통과했다. 변경 파일 lint·Secretlint·아키텍처 검증, 웹 타입검사 26,380/26,380개(진단 0), API 및 도구 타입검사를 완료했다. 이는 저장소 전체 테스트를 실행하는 `--full` 모드와는 구분한다. GitHub 원격 접근 정책 거부로 원격 재확인·PR·main 병합은 하지 않았다.

- 독립 설치 후 재검증: Vitest: `DiscoverHubPage.layout.test.tsx`, `DiscoverHubPage.test.tsx` 2파일 21개 통과.
- Chrome: 320·390·834·1440px 및 starlight·light·contrast 12조합 통과. 문서와 장르 목록의 가로 넘침 0, 전체 장르 노출, 44px 링크·검색어 지우기, 검색어 지우기와 재입력, 전체 장르 이동 후 Back 입력 복원, 검색 제출 인코딩, 페이지 오류 0을 확인했다.
- `before-*.png` 및 `discover-*-*.png`는 로컬 앱에서 합성 카탈로그 오류를 주입한 화면이며 실제 운영 데이터가 아니다. 외부 origin 요청은 차단했다. 390px 변경 전·후 픽셀을 직접 대조했다.
- 키보드 Tab으로 전체 장르 도달, Enter 이동, Back 복귀도 별도 재검증했다. 390px light와 1440px starlight의 실제 픽셀을 확인했다.
- `git diff --check` 통과. 전체 테스트·운영 API·프로덕션 빌드·원격 CI·운영 배포는 실행하지 않았다.

## 재현

저장소 루트에서 해당 worktree에 독립 설치한 의존성을 사용한다. 다른 checkout의 node_modules를 연결하거나 수정하지 않는다.

```sh
node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts --host 127.0.0.1 --port 5299 --strictPort
node docs/discover-reference-20261109/qa.cjs
node node_modules/vitest/vitest.mjs run apps/web/src/domains/catalog/DiscoverHubPage.layout.test.tsx apps/web/src/domains/catalog/DiscoverHubPage.test.tsx
```
