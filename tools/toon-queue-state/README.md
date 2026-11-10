# toon-queue-state (`gemini-toon-queue-state-20261110-8472`)

툰스튜디오(ToonStudio) 생성 작업 큐의 **순수 상태머신(Pure State Machine)**, 결정론적 가상 시계(`FakeClock`), 그리고 무비용 모의 실행기(`MockExecutor` / `QueueHarness`) 구현 패키지입니다.

## 1. 소유 범위 및 프로젝트 규칙 준수

- **기준 저장소 확인**: `/Users/hjunkim/WebstormProjects/toonstudio`의 `AGENTS.md`, `ARCHITECTURE.md`, `packages/core/src/production/automation-execution.ts`, `apps/web/src/domains/creator/bg3d/studio-bg3d-shot-batch-queue.ts`, `apps/api/src/platform/adapters/backend-capabilities/backend-capability-durable-queue.port.ts`의 불변 객체(`Object.freeze`)·FNV-1a 해시(`hash32`)·멱등성 키 패턴에 맞춰 작성했습니다.
- **비공유 경계 준수**:
  - 기존 **12 UI 설계**, **예약 코어(Reservation Core)**, **JSON Manifest 검증기**와 코드·파일 소유를 공유하지 않습니다.
  - 원본 저장소(`/Users/hjunkim/WebstormProjects/toonstudio`)는 읽기만 수행했으며 수정하지 않았습니다(`git status` clean 유지).
  - 외부 API 호출, 실제 이미지 생성, 네트워크 접근, 유료 비용 발생이 전혀 없습니다.

## 2. 테스트 실행 명령 및 검증

```bash
/Users/hjunkim/.nvm/versions/node/v24.22.1/bin/node --test /Users/hjunkim/WebstormProjects/gemini-toon-queue-state-20261110-8472/test/queueStateMachine.test.mjs
```

## 3. 원본 ToonStudio 앱 통합 안내

1. 본 폴더의 `src/queueStateMachine.mjs` 및 `src/index.d.ts`를 ToonStudio 내 목표 위치(예: `packages/core/src/production/generation-queue-state.ts` 또는 Creator 도메인 내부 큐 모듈)로 가져옵니다.
2. 큐 이벤트 발생 시 `const { state, effects, outcome } = transitionQueueState(currentState, event)`로 순수 상태 전이를 수행합니다.
3. 반환된 `effects`(`EXECUTE_JOB`, `SCHEDULE_RETRY_TIMER`, `ABORT_RUNNING_ATTEMPT`)를 워커 실행기 및 타이머 어댑터에 연결하고, 워커 완료/실패/진행률 콜백 시 `effect.runToken`과 `effect.attempt`를 함께 전달하여 지연 도착 이벤트 및 중복 완료를 펜싱 차단합니다.
