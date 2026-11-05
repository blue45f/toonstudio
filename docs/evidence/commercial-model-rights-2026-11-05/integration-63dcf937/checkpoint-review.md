# 통합 후보 검증 체크포인트 (2026-11-05)

- 작업 위치: `/workspace/scratch/toonstudio-commercial-main-validation`
- 시작 HEAD: `63dcf937ca8658fbae52396595416daa1a796043` + 동결된 작업 변경분
- 검증 종료 HEAD: `7a118fc4ea1c1dadd96090351a35580b0e93d3d1`. 부모 작업이 207개 파일의 동결 변경분을 커밋했으며, 독립 비교에서도 기존 29,873개 source/config 파일 추가·삭제·변경이 모두 0개였다.
- 이후 부모 작업의 유일한 미커밋 변경: `.github/workflows/ci.yml` Node fixture CI 추가. 해당 파일이 TypeScript Program 읽기 입력에 없음을 확인했다.
- 검증 담당자는 저장소 소스를 수정하지 않았다. 실행 준비·로그·결과 복사본은 이 `/tmp` 디렉터리에만 작성했다.

| 검증 | 실제 명령 | 종료 코드 | 결과 |
| --- | --- | --- | --- |
| 집중 Vitest | `pnpm exec vitest run --maxWorkers=2` + `focused-vitest.command.json`의 19개 명시 대상 | 0 | 19개 파일, 250개 테스트 통과 |
| 집중 Node | `node --test scripts/typecheck-shards.test.mjs scripts/check-restricted-model-distribution.test.mjs scripts/third-party-license-files.test.mjs` | 0 | 13개 테스트 통과 |
| 사전 생성 | `pnpm prebuild` | 0 | 운영 호환성·workspace 링크·catalog/i18n 생성 통과 |
| 정식 하네스 | `pnpm harness:verify --base=HEAD` | 0 | 변경 범위 lint/Secretlint/architecture + 전체 웹 의미 검사 + API 3개 TS 프로젝트 통과 |

모든 실행의 정확한 argv·작업 디렉터리·환경 override는 `<label>.command.json`, 전체 stdout/stderr는 `<label>.log`, 외부 프로세스의 실제 종료 코드는 `<label>.exit`에 별도 저장했다. `index.jsonl`에는 실행 시작·종료 시각도 있다.

웹 전체 타입 보고서 `canonical-web-report.json`: `complete=true`, 26,247/26,247개 파일 의미 검사, 진단 0개, worker 16개, 재시도 0개. TypeScript 6.0.3; worker concurrency 1, heap 8192MiB, source budget 12MiB. 최대 worker RSS 8,642,781,184바이트. 시작/최종 fingerprint가 모두 `8114eca5062c95ab9d524e26bf866133b00b291a77937e5629f598ad4bfdf8ce`다. 보고서 SHA-256: `6afad357c6b2fe4d50ad2b20bbcb477d8004f220a2eb8cf13e18bc4ee2fca291`. API는 `tsc -p tsconfig.json --noEmit && tsc -p tools/tsconfig.work-session-browser.json --noEmit && tsc -p tools/tsconfig.postgres-tools.json --noEmit`가 종료 0이었다. 기존 cgroup `oom_kill=2`가 이번 실행에서도 증가하지 않았다.

부모 작업 요청에 따라 **Vite 빌드 전에 대기**한다. 최신 main/병합 순서 확인 후 별도 진행 신호가 필요하다. 따라서 이 후보의 새 Vite 빌드, postbuild/CSP, 산출물 bundle/Remotion 게이트, Chromium probe, 모델 scanner 및 audit는 아직 실행하지 않았다. `/tmp`용 probe/server 복사본만 준비했으며 서버는 시작하지 않았다. 예전 dist나 과거 검증 결과를 새 검증 통과로 사용하지 않았다.

모델 권리 검증의 2개 차단(Tag2Pix, Paprika)과 1개 검토(FacePaint)는 이 기술 검증 통과로 해소되지 않는다. 상용 출시 준비 완료를 뜻하지 않는다. Mixbox·Remotion 소스/의존성 수정, 게시·병합·배포를 수행하지 않았다.
