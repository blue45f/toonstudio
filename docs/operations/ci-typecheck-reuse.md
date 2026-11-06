# Core 타입 검사 결과의 조건부 재사용

상태: migration — 2026-11-06 구현·PR 검증 단계. main 적용·원격 절감 실측 완료를 뜻하지 않는다.

## 목적과 유지 범위

Finishing static과 Feedback의 명시적 전체 웹·API 타입 검사는 이미 완료한 Core의 동일 검사 결과가 있으면 재사용한다. 기존 workflow의 PR/push 경로·수동 실행·job 이름·독립 시작·timeout을 유지한다. Core의 전체 타입 검사·Cloudflare realtime·coverage 95% 기준, ARM Scene3D, 각 도메인의 lint·DB·브라우저·build와 Feedback의 8개 실제 성공 집계는 유지한다.

정확히 한 번 실행하는 orchestration 전환은 아니다. Core 결과가 아직 없거나 호환되지 않으면 각 소비자가 기존 `pnpm run typecheck`를 실행한다. 전체 build 안의 웹 타입 검사도 이번 변경에 포함하지 않는다.

## 재사용 계약

Core typecheck는 세 정본 명령이 성공한 뒤 작은 JSON 영수증을 1일 보존 artifact로 올린다. 소비자는 읽기 전용 `actions: read`를 해당 job에서만 사용한다. API 조회는 전체 최대 10초·후보 2개로 제한하며 polling·자동 재시도를 추가하지 않는다.

다음 조건이 모두 맞아야 성공 결과를 재사용한다.

- 같은 저장소·checkout SHA/tree·이벤트/ref·PR 번호·base/head 및 저장소
- 같은 Linux x64·Ubuntu 24 이미지·정확한 Node/pnpm 버전·lockfile
- 정본 검사 명령·설정, 변경 없는 tracked 입력 및 untracked/ignored 타입 입력 부재
- 지정된 CI workflow의 typecheck job이 실제 완료·success이고 run/attempt가 일치
- 같은 run/attempt에 속한 만료되지 않은 32 KiB 이하 artifact와 16 KiB 이하 JSON

PR API의 head SHA와 checkout의 synthetic merge SHA를 구분한다. artifact 안의 상태 주장만 신뢰하지 않고 GitHub API의 실제 job 결과와 대조한다. 고정 JSON 파일만 읽으며 artifact의 코드를 실행하지 않는다. 임시 ZIP은 성공·실패 모두 정리하고 인증값·서명 URL은 기록하지 않는다.

조회 실패·시간 초과·누락·만료·신원/입력/환경 불일치는 실제 전체 타입 검사 한 번으로 돌아간다. 이 fallback의 실패·signal·프로세스 시작 오류를 성공으로 처리하지 않는다. API 조회 토큰은 타입 검사 자식 프로세스에 전달하지 않는다. 발행 실패는 Core 실패로 전파되며 실패·취소·skip은 재사용 근거가 아니다.

## 성능과 제한

이전 후보 [e48390e Finishing](https://github.com/blue45f/toonstudio/actions/runs/42123161396)와 [Feedback](https://github.com/blue45f/toonstudio/actions/runs/42123161512)의 중복 typecheck step은 각각 23분 17초·18분 26초였다. 두 영수증이 모두 재사용되는 가정에서 후보당 41분 43초가 절감 후보이며 현재 변경의 보장 수치가 아니다. 준비된 결과가 없으면 원래 검사 시간에 조회 비용이 추가될 수 있다.

특히 Feedback의 `ubuntu-latest`가 Ubuntu 26이면 Core Ubuntu 24와 달라 재사용하지 않는다. 검증 범위를 위해 OS 이미지를 강제로 바꾸지 않는다. 신규 재사용·fallback 로그와 각 job의 실제 시간을 비교해 별도로 측정한다. 현재 public 저장소·표준 runner의 compute 무료 조건과 실제 runner 시간은 별개다. 플랜·유료 runner·예산·cache 용량·운영 배포는 변경하지 않는다.

## 검증과 복구

저장소 루트에서 다음을 실행한다. 실제 GitHub API나 전체 제품 타입 검사를 새 단위 테스트가 호출하지 않는다.

```sh
node --test scripts/ci-shared-typecheck.test.mjs scripts/ci-typecheck-receipt.test.mjs scripts/ci-typecheck-lookup.test.mjs
node --test scripts/ci-core-gate.test.mjs scripts/ci-executed-gates.test.mjs scripts/ci-enospc-followup-policy.test.mjs scripts/ci-merge-reliability.test.mjs
python3 scripts/verify-pr-workflow-fanout.py
pnpm harness:verify
```

GitHub PR에서 기존 core/verify와 소비자 결과를 확인한다. 복구는 이 변경을 검토 후 revert하여 기존 명시적 전체 타입 검사로 되돌린다. 제품 재배포나 DB 작업은 필요하지 않다.

