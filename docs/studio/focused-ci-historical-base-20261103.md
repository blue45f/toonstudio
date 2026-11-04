# Focused CI의 이전 PR 기준 SHA 누락 수정 — 2026-11-03

상태: current. PR #2674의 새 실행 [41702241984](https://github.com/blue45f/toonstudio/actions/runs/41702241984)는 변경 코드 검사 전에 실패했다.

## 재현 원인

checkout은 `8bfe55a5…` 병합 커밋을 depth 2로 받았다. 이 커밋의 main 부모는 `ba7786ed…`였지만 이벤트의 `pull_request.base.sha`는 더 이전 `2451c4a…`였다. 깊이 2에는 새 main 부모와 PR head만 들어올 수 있어, `git cat-file -e "$BASE_SHA^{commit}"`가 `Not a valid object name`으로 끝났다.

PR의 최초 인증된 checkout에서 커밋 이력을 확보하도록 PR fetch depth를 0으로 바꾼다. 수동 실행은 깊이 1을 유지한다. `blob:none` 필터와 기존 sparse 자산 범위, `persist-credentials: false`, `GIT_NO_LAZY_FETCH=1`은 유지한다. 체크아웃 뒤 추가 인증·원격 fetch를 하지 않는다. 전체 커밋·tree 메타데이터를 받는 비용은 늘어나지만 과거 원문 blob 전체를 내려받는 변경은 아니다.

## 검증

로컬 Git fixture에서 PR 기준 뒤 main을 네 번 전진시키고 병합했다. 기존 depth 2에는 이전 기준 커밋이 없음을 재현했다. 새 filtered 전체 이력 checkout은 원격을 사용할 수 없게 한 뒤에도 기준 commit·tree와 변경 경로를 읽으며, 이전 blob을 받지 않았다. CI 실행 게이트 테스트와 새 회귀 검사 총 29개가 통과했다.

기존 실패 실행은 재실행하지 않는다. 새 커밋의 일반 PR CI 결과를 별도로 확인하며, 통과 전 병합하지 않는다. 운영 배포·보호 설정·자격증명 정책은 변경하지 않는다.
