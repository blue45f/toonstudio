# 홈 성능 후보 회수 후 검증

상태: current — 2026-11-07 UTC 로컬 보완본. 원격 반영·운영 배포는 하지 않았다.

## 원본과 경계

- 원본 feature: `457a6e7bdc289ae088be283a62844545f8e07444`.
- 회수 patch: 52,004바이트, SHA256 `d52438bf2de24ae2ea73ae09774e78db2e4dcba6e8d5871a1e83183c60fd66e7`.
- 원본 회수 기준 main: `0dbc75022387fa9ebac662733ec04436f8dca6ab`.
- 기존 8파일의 preimage와 신규 문서를 포함한 9파일 postimage Git blob을 각각 확인했다. 텍스트 충돌 없이 적용했다.
- 원본 회수 커밋 `066291f07e`와 후속 보완을 분리했다. 원본 담당의 소유 이양과 파일 보존을 확인했다.
- 원본 README의 성능 측정 수치는 재측정하지 않았다. 점진 표시이며 전체 가상화는 아니다. 끝까지 펼치면 모든 카드가 마운트된다.

## 재현과 수정

1. 문서·exact-resume만 바뀔 때 목록/언어 기반 캐시가 오래된 링크와 설명을 반환했다.
   - 같은 탭의 문서/이어하기 이벤트, 다른 탭의 해당 저장소 키, focus/pageshow/가시성 복귀를 구독한다.
   - 해당 프로젝트만 무효화하고 연속 이어하기 알림은 한 microtask로 묶는다. 검색·선택만 바뀔 때는 읽기 결과를 재사용한다.
   - 저장 스키마와 쓰기·삭제·복구 권한 모델은 변경하지 않았다.
2. 임시·저장·복구 목록의 중간 확장에서 새 카드가 Tab 순서상 건너뛰어지고 마지막에는 버튼 제거로 초점이 body로 빠졌다.
   - 키보드의 더 보기 활성화 후 처음 추가된 작업의 선택 버튼으로 초점을 옮긴다. 다음 Tab은 그 작업의 제목 또는 복원 동작으로 이어진다.
   - 포인터 활성화는 초점을 강제로 이동시키지 않는다.
3. 수정 전 신규 13개 검사 중 실제 회귀 10개 실패, 기존 계약 3개 통과를 확인했다. 수정 후 13개 전부 통과했다.
   - 캐시 갱신 4개와 세 목록의 중간/마지막 확장 6개가 실패했다.
   - 저장소 전체 초기화, IME 조합 Enter/Escape, 접힌 항목을 포함한 30개 전체 선택·삭제 확인 취소/실행은 기존 동작을 유지했다.

## 현재 검증

- 검증 기준은 최신 main 반영 커밋 `3698e5162db8d20afefe15c15994dd9e2d7fa777`과 회수·보완본이다. 검사 중 원격 main이 `8016d94f45d8de64b3946ae467418624c43ed167`로 이동했으며, 홈 소유 파일과 겹치는 변경은 없음을 확인했다. 이 후속 원격 상태를 로컬 전체 검증 완료로 간주하지 않는다.
- 9파일 81개 Vitest 통과, shuffle seed 457. 홈 원본 5파일 47개, 신규 회귀 13개·캐시 수명/재사용 5개, 기준 main의 MySpace·SpatialReader 16개를 포함한다.
- 브라우저 15조건을 각 2회 반복해 30개 전부 통과했다. 320/390/768/1440 CSS px와 200% 상당 reflow, starlight/light/contrast를 검사했다. 문서·exact-resume 갱신, 세 목록의 중간/마지막 키보드 확장, 다음 Tab, 뒤로/앞으로 탐색을 확인했다.
- 펼친 작업 카드 영역의 axe 위반 0개, pageerror 0개, 가로 넘침 없음. 각 조건의 초점 스크린샷을 남겼다.
- 전체 `pnpm harness:verify` 통과. 웹 26,343/26,343개 타입 검사 진단 0개, API/tools 타입 검사, 구조·문서·소스 크기·초기 로딩 그래프·ESLint·Secretlint 검증을 통과했다.
- 변경 파일 ESLint 0오류/0경고, diff 공백 검사 통과. 원본의 별도 MySpace 타입 오류는 기준 main 수정 반영 후 재검증했다.
- 확대 검사는 1440×1000의 200%에 해당하는 CSS viewport 720×500 reflow다. 브라우저 자체 확대 버튼을 조작한 검사는 아니다. CSS zoom:2 스트레스에서는 고대비 3열이 유지되어 문맥 설명이 숨는 제약을 발견했으며, 이를 200% 반응형 확대 통과로 세지 않는다.
- 모든 테스트의 프로젝트·문서·삭제 대상은 메모리/격리 브라우저의 합성 데이터다. 사용자 원본 데이터에 접근하거나 변경하지 않았다.
- 원격 push·PR·main 통합·운영 배포는 이 작업에서 실행하지 않았다. 로컬 커밋을 통합 담당에게 전달한다.

## 재실행

저장소 루트에서 의존성이 설치된 상태로 실행한다.

- `pnpm exec vitest run apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.recovery-regressions.test.tsx apps/web/src/domains/creator/studio-shell/studio-project-library-resume-cache.test.ts`
- `pnpm exec playwright test e2e/studio-home-recovery.spec.ts`
- `pnpm harness:verify`

브라우저 검사는 localhost의 가상 API 응답만 사용한다. 프로젝트 저장소 초기화는 해당 Playwright 브라우저 컨텍스트에 한정된다.
