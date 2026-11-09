# 탐색 화면 밀도 보완 — 2026-11-09

상태: current. 로컬 변경이며 커밋·원격 반영·배포는 하지 않았다.

## 범위

사용자가 제공한 `discover-responsive-concept.png`의 실제 픽셀을 확인하고 탐색 화면의 트랙과 오류 안내만 보완했다. 다른 작업이 수정 중인 Labs·마케팅 파일은 변경하지 않았다.

- 다섯 연재 트랙을 한 줄로 표시하며 짧은 시각 라벨과 기존 상세 접근성 이름을 구분했다.
- 기존 키보드 방향키·Home·End, 선택 상태, 각 트랙의 두 목적지를 보존했다.
- 탐색 오류만 작은 가로 안내로 배치했다. 오류 원인·다음 행동·재시도를 유지했고 공통 오류 컴포넌트는 수정하지 않았다.
- 시안과 전체 화면이 동일하다는 의미가 아니다. 오류 일러스트, 상세 트랙 패널, 상단 공통 셸과 안내, 대표작 성공 상태의 최종 시안 대조는 범위 밖이다.

## 검증

- 관련 Vitest 3파일 23개 통과. 변경 TS/TSX ESLint 통과.
- 변경 범위 `git diff --check` 통과. 공유 체크아웃의 다른 문서에는 별도 공백 경고가 있었다.
- `pnpm harness:doctor` 통과.
- 첫 `pnpm harness:verify`는 타입검사 중 입력 변경 감지로 중단했다. 최종 하네스 결과는 아래 후속 기록으로 구분한다.
- `qa.cjs`는 로컬 앱에 합성 카탈로그 오류를 주입하고 외부 origin을 차단한다. 실제 운영 데이터 검증이 아니다. 320·390·834·1440px × starlight·light·contrast, 가로 넘침, 탭 한 줄/높이, 오류 높이, 키보드 선택, 검색 지우기/입력/이동/Back 복원을 검사한다.
- 개발 서버의 이전 CSS 캐시가 확인되어 서버 재시작 후 최종 코드로 다시 검증한다. 앞선 실패 화면은 최종 통과 근거가 아니다.

## 재현

저장소 루트에서 다음을 실행한다. 이미 사용 중인 포트와 서버를 임의로 중지하지 않는다.

```sh
node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts --host 127.0.0.1 --port 5299 --strictPort
node docs/discover-density-20261109/qa.cjs
node node_modules/vitest/vitest.mjs run apps/web/src/domains/catalog/DiscoverHubPage.layout.test.tsx apps/web/src/domains/catalog/DiscoverHubPage.test.tsx apps/web/src/domains/catalog/DiscoverShelves.test.tsx
```

## 최종 결과

- 재시작한 로컬 서버의 최종 코드로 12개 반응형/테마 조합이 모두 통과했다. `results.json`은 조합별 탭/오류 측정과 장르 측정을 각각 저장하여 24개 기록이다. 문서 가로 넘침 0, 탭 한 줄·44px 이상 높이·글자 넘침 0, 오류 카드 210px 미만, 검색·Back 복원·키보드 선택·페이지 오류 0을 확인했다.
- 390px light 및 1440px starlight 최종 이미지 픽셀을 직접 확인했다. 시안의 오류 폴더 일러스트나 전체 페이지 구성이 일치한다는 주장은 하지 않는다.
- 최종 코드 관련 Vitest 23개, 변경 TS/TSX ESLint, 7개 텍스트 파일 Secretlint, 변경 범위 diff 검사가 통과했다.
- 두 번째 전체 하네스도 타입검사 도중 프로젝트 입력 변경 감지로 종료 코드 1로 중단됐다. 일부 타입 샤드에 진단 10개가 보고되어 전체 타입검사 통과를 주장하지 않는다. 파일 변경이 멈춘 상태에서 전체 하네스 재실행이 남아 있다.
- 프로덕션 빌드·전체 테스트·원격 CI·커밋·푸시·배포는 하지 않았다.

## 격리 통합 검증 — 2026-11-09

- 기준 커밋: `d856e71ee2724a81d6820589b3ba54b086ab09a9`. 원격 요청 없이 로컬 저장소에서 독립 복제하고 탐색 소유 변경만 복사했다. 의존성도 독립 복사했으며 19패키지·29개 workspace 의존성 소유권 검사와 doctor를 통과했다.
- 원본 최종 소스 5파일의 SHA-256 일치를 확인했다. 격리본 관련 테스트 3파일 23개가 다시 통과했다. `SHA256SUMS.txt`에 소스·화면 증거 해시를 기록했다.
- `pnpm harness:verify`는 lint·Secretlint·아키텍처 등 선행 검사를 거쳐 웹 타입검사 26,529/26,529개를 완료했지만 진단 15개로 실패했다. 시작·종료 fingerprint가 일치하여 이번 결과는 동시 수정으로 중단된 결과가 아니다.
- 진단은 Labs ES target 불일치 10개, BG3D lens ID 불일치 2개, Blender 검증 스크립트 속성 불일치 3개다. 이 변경에서 수정하지 않은 파일들이며 탐색 소유 파일에는 진단이 없다. 기준 커밋만 대상으로 별도 전체 검사를 수행한 것은 아니므로 기준 커밋 전체 통과/실패를 추정하지 않는다. 상세는 `isolated-typecheck-result.json`을 참고한다.
- 웹 타입검사 실패 뒤 API/도구 타입검사는 실행되지 않았다. 통합 준비용 변경 보존과 전체 검증 통과는 구분한다. 원본 main 변경·원격 반영·배포는 하지 않았다.
