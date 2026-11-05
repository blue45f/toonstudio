# 빌드 후 검증 차단 기록 (2026-11-05)

후보 `7a118fc4ea1c1dadd96090351a35580b0e93d3d1` + 부모 작업의 미커밋 `.github/workflows/ci.yml`에서 정상 `pnpm run build:bundle` lifecycle이 종료 코드 0으로 통과했다. Vite 15,528개 모듈, 빌드 4분 3초, 반복 prebuild 및 postbuild의 고지 생성/CSP까지 통과했다. 실제 시작 `2026-11-05T12:03:41.646067+00:00`, 종료 `2026-11-05T12:08:05.749496+00:00`. 정확한 명령/로그/외부 종료 코드는 `build-bundle.command.json`, `build-bundle.log`, `build-bundle.exit`다. cgroup oom_kill은 기존 2에서 증가하지 않았다.

새 전체 Program inventory 명령 `node --max-old-space-size=8192 scripts/typecheck-shards-worker.mjs /tmp/toonstudio-pr-validation-20261105-63dcf937-w7n5y97h/postbuild-inventory-job.json`도 종료 코드 0이었다. 그러나 이를 기존 전체 타입 보고서와 비교하는 Python assertion이 실제 종료 코드 **1**로 실패했다 (`AssertionError: Build regenerated different TypeScript inputs`).

- 이전 fingerprint: `8114eca5062c95ab9d524e26bf866133b00b291a77937e5629f598ad4bfdf8ce` (26,247개 파일)
- 이후 fingerprint: `1c30cd459f43a806704f2b930355c5d0c77319c0506e9e5ceef4455decfb93c3` (26,248개 파일)
- 유일한 추가 source/root/input: `docs/evidence/commercial-model-rights-2026-11-05/native-resize-comparison/compare.mts`, 10,553바이트, SHA-256 `8878f941242fdce868cad40df56aaece36be6be19c1d9c497a3867c50437bc07`
- 기존 파일·읽기 입력·options 변경 0개, 삭제 0개. 근거: `postbuild-inventory-diff.json`.

이 증거 `.mts` 파일은 부모 작업의 새 비교 실험에서 추가됐고 루트 tsconfig의 새 검사 root가 됐다. 이 검증 담당자는 파일을 이동·삭제·수정하지 않았다. 부모 작업에 정확한 경로와 해시를 알렸으며, 보존 위치 조정 또는 새 입력 전체 재검증 결정을 기다린다.

첫 실질 차단 시 중단하라는 지시에 따라 studio bundle, Remotion chunks, 별도 CSP 재확인, 제한 모델 scanner, vips 해시/manifest 잔재 검사, Chromium probe, dependency audit는 아직 실행하지 않았다. 예상 모델 차단(2개 차단·1개 검토)은 그대로 남는다. 기존 체크포인트 보고서와 정식 전체 타입 증거는 수정하지 않았다.
