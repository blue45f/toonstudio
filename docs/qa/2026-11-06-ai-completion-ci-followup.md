# AI 도구 완료 대기 CI 후속 검증 — 2026-11-06

상태: `current` 후속 테스트 보강 기록. 분리 기준 main은 `d23160182887b66baa3540f5c47430cc287fdcc4`다. 제품 수정·전체 제작 재검증·운영 배포 완료 기록이 아니다.

## 확인된 실패와 수정 범위

PR #2727의 source `69f5d30a867935a411c8190a693689344ef1a725`에서 [session-goals 실행 42066578234](https://github.com/blue45f/toonstudio/actions/runs/42066578234/job/127382188805)는 5,683개 통과·1개 source 계약 실패와 별도로 `window is not defined` 미처리 오류 네 건을 기록했다. `ai-webtoon-platform-suite.test.tsx`가 시작한 Category4 비동기 작업의 완료 뒤 `handleRunWave27Tool`·`handleRunWave30Tool`·`handleRunWave33Tool`·`handleRunWave36Tool`이 상태를 갱신할 때 테스트 환경이 이미 닫힌 경로다.

이 PR은 해당 UI 테스트 한 파일에서 시작한 작업마다 고유 완료 결과를 순차적으로 기다리게 한다. Category3의 단행본 결과, 결과 카드 하나를 공유하는 Category4 네 작업, notice 하나를 공유하는 REA 여섯 작업을 각각 확인한다. 기존 네 작업의 완료·버튼 재활성화 단언도 유지한다. 제품 코드·예외 처리·timeout·mock·skip·품질 임계값은 바꾸지 않는다.

분리 전 변경 전 로컬 두 파일 28개도 통과했으므로 **로컬 RED 재현으로 표시하지 않는다**. 원격 오류에 대응하는 완료 대기 누락을 보강한 것이며, 새 PR head에서 해당 원격 검사가 끝까지 통과하는지 별도로 확인해야 한다.

## 다른 작업과 증거의 경계

모바일 helper 선택자·import·두 호출과 도형 source 검사 범위를 보강하는 공통 테스트 세 파일은 [PR #2726](https://github.com/blue45f/toonstudio/pull/2726) 소유 범위다. 이 PR에 복제하거나 그 검사 결과를 이 PR의 실행 결과로 계산하지 않는다.

기존 같은 6컷의 실제 계정·협업·검수·기술 ZIP 증거는 실행 source `f63dd7cf3c90804c077bd31868ca68de2b54fca8`에 고정된 역사 기록이다. 이를 분리 기준 main `d23160182887b66baa3540f5c47430cc287fdcc4` 이후 내보내기 구현의 실제 검증 완료로 확장하지 않는다. 이 PR에서는 6컷 브라우저 시나리오나 새 최종 패키지를 다시 실행·생성하지 않는다.

기존 원고·로컬 증거·저장 형식·제품·권한·CI 기준을 보존한다. 운영 배포·운영 DB·migration·유료 runner 작업은 수행하지 않는다.

## 이 분리 변경의 검증

실행 위치는 저장소 루트다. AI 패널과 상위 모달의 두 파일을 확인하고 공통 브라우저 경계 테스트는 이 분리 PR의 검사 목록에 포함하지 않는다.

```sh
pnpm exec vitest run \
  apps/web/src/domains/creator/ai/ai-webtoon-platform-suite.test.tsx \
  apps/web/src/domains/creator/ai/StudioAiSuperSuiteModal.test.tsx \
  --pool=forks --maxWorkers=2
pnpm harness:verify --base=origin/main
```

분리 기준 main에 이 변경만 적용한 위 두 파일의 실행은 **2파일·28개 모두 통과, 미처리 오류 0, exit 0**이었다(2026-11-06 03:10 KST, 약 16.2초).

실행 로그와 시작·종료·exit code·source 영수증은 Git에서 제외된 `.qa/ci-main-recovery-20261106-ai-only/`에 로컬 전용 권한으로 보관한다. 전체 하네스·정상 commit hook·정상 pre-push 결과는 해당 로컬 영수증과 PR의 검증란에서 확인하며, 원격 CI와 병합은 별개다.
