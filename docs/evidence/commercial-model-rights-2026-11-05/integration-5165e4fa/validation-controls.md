# 정식 검증 제어 확인 (2026-11-05)

- 상태: current. 검증 위치는 `/workspace/scratch/toonstudio-commercial-main-validation`이다. 검증 담당자는 소스·설정·Git ref를 수정하지 않는다. prebuild는 저장소의 정상 생성 절차로 실행했다.
- 정상 명령은 `pnpm harness:verify --base=origin/main`이다. `scripts/agent-harness.mjs:251`의 범위 계산은 base 대비 커밋 차이, 현재 작업 변경과 untracked 파일을 포함한다. 이번 정식 실행은 변경 445개 파일을 대상으로 했으며 변경 파일 ESLint 175개를 검사했다.
- `package.json:54`의 정식 typecheck는 전체 웹 Program 검사와 API의 세 TypeScript 프로젝트를 실행한다. `scripts/typecheck-shards-worker.mjs:33`은 원래 rootNames/options/references로 Program을 구성하고 전체 getSourceFiles를 검사 범위로 사용한다.
- 원본 strict/noEmit 옵션을 유지하고 단일 worker, 8192MiB heap, 12MiB source budget을 사용한다. 별도의 skip 옵션이나 입력 범위 축소는 적용하지 않는다.
- 이번 정상 harness는 typed identifier `check:type-coverage`, 저장소 전체 `lint:strict`, 보안·라이선스 audit를 자동으로 실행하지 않는다. 결과에서 실행한 것으로 표시하지 않는다. 변경 파일 ESLint의 max-warnings=0과 TypeScript strict 모드만 해당 실행에서 확인한다.
- prebuild 후 모든 Git 추적·untracked 소스/설정 파일을 해시한다. 기존 방식에서 빠졌던 .mts/.cts도 포함한다. 별도 pre-harness inventory와 최종 report에서 원본 Program 전체 입력 identity/fingerprint를 비교한다. 파일 수는 새 결과에서 읽으며 과거 26,247개를 가정하지 않는다.
- 보고서 검토는 fresh mtime, complete:true, 진단 0, failure 부재, 전체 파일 중복 없는 의미 검사 coverage, 원본/최종 fingerprint 일치를 확인한다. 정식 harness의 외부 종료 코드도 별도 파일로 보존한다.

하네스 통과 후 Vite 빌드 전에 중단한다. 부모 작업의 통합 커밋과 실행 지시를 받은 뒤에만 새 빌드·postbuild·브라우저·모델·audit 검증으로 진행한다.
