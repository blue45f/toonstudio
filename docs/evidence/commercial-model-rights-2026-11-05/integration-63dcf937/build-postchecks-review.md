# 통합 후보 최종 검증 (2026-11-05)

검증 작업 위치는 `/workspace/scratch/toonstudio-commercial-main-validation`, 후보 커밋은 `7a118fc4ea1c1dadd96090351a35580b0e93d3d1`다. 검증 시작은 부모 `63dcf937ca8658fbae52396595416daa1a796043` + 동결 작업분이었고, 부모 작업이 같은 바이트를 `7a118fc4`로 커밋했다. 독립 해시 비교에서도 non-doc source/config 29,873개 추가·삭제·변경이 모두 0개였다. 빌드 시작 시 미커밋 변경은 부모 작업의 `.github/workflows/ci.yml` Node fixture CI였으며 TypeScript Program 입력에는 포함되지 않는다. 일반 main 자체를 검증했다는 뜻이 아니다. 최종 미커밋 항목은 `final-candidate.json`에 기록했다.

검증 담당자는 저장소 소스를 수정하지 않았고, 로그·복사본·보조 스크립트는 이 `/tmp` 디렉터리에만 작성했다. Mixbox·Remotion 소스/의존성 변경, 커밋·push·PR·병합·배포·인증 작업은 수행하지 않았다.

## 통과한 검증과 범위

- 집중 Vitest: 19개 파일, 250개 테스트 통과. legal 5, native export 3, registry 2, Gaussian 1, live filter provider 2, ONNX 4, notice generator 2.
- 집중 Node: controller/model policy/notice helper 13개 테스트 통과.
- 정식 `pnpm harness:verify --base=HEAD`: 종료 0. 변경 범위 lint/Secretlint/architecture, 웹 전체 의미 검사, API의 3개 TS 프로젝트 모두 통과했다. `--skip-typecheck`를 사용하지 않았다. 일반 하네스는 저장소 전체 root test를 실행하는 `--full` 모드가 아니므로 전체 테스트 완료를 뜻하지 않는다.
- 웹 전체 타입 보고서: `complete=true`, 26,247/26,247개 검사, 진단 0개, worker 16개, 재시도 0개, TS6.0.3, 단일 worker heap8192MiB/source budget12MiB. 시작·최종 fingerprint 모두 `8114eca5062c95ab9d524e26bf866133b00b291a77937e5629f598ad4bfdf8ce`. 새 `canonical-web-report.json`과 `canonical-harness.exit=0` 보존.
- 일반 `pnpm run build:bundle` lifecycle 종료 0. 반복 prebuild → Vite15,528개 모듈·4분3초 → postbuild 고지 생성597pnpm entries/446license texts → CSP까지 통과했다.
- 정적 Studio bundle 구조 게이트 종료 0: Studio448chunks / 8374.4KiB raw / 2741.5KiB gzip; StudioPage2469.5KiB raw / 761.2KiB gzip. 크기·요청15개 관측은 비차단 정책이다. 스크립트가 출력한 과거 startup baseline은 이번 실측이 아니다. fresh returning Studio UI/CWV 또는 전체 Studio E2E를 측정하지 않았다.
- Remotion 게이트 종료 0: vite dedupe 유지, lockfile 각1개 인스턴스, ProductTourPage 진입점 확인. 정적 청크 내부 모듈을 manifest로 직접 세었다는 뜻은 아니다.
- 별도 strict CSP 종료 0: hashed inline data block1개.
- 새 dist 전체20,153개 파일을 제거한4개WASM의 길이+SHA256으로 검사: 동일바이트0개, 외부wasm-vips manifest0개. 22개 다른WASM은 보존됐고 자체 runtime manifest entry `assets/studio-native-resize-runtime-CcqsUgQn.js`가 존재한다. 파일명을 바꿔도 같은 길이/바이트는 검출한다. 변환·재압축한 코드의 모든 권리 문제를 보증하는 검사는 아니다.
- 새 제한 모델 검사: 실제 종료1, 예상한 배포 차단2개(Paprika/Tag2Pix), 출처 검토1개(FacePaint). ONNX6개를 검사했다. 정책이 작동한다는 증거이며 출시 허가를 뜻하지 않는다.
- 실제 로컬 source browser native probe 종료0: `/usr/bin/chromium`154.0.8037.57. 257×129→61×31, 결과7564bytes, 반복바이트 일치, 입력불변, identity독립복사, 상수색/alpha보존, upscale거부, 8단계pyramid 모두 확인했다. SHA256 `038e30b0fecf6941edcba206db916caab8c4cdefcba0ecab95b7ea3db495db13`, 외부origin/외부vips요청0개. localhost4178 전용·envDir:false·proxyoff 서버를 사용했고 종료 후 정리했다. 이는 isolated source native export 검증이며 production bundle의 전체 UI/E2E 검증이 아니다.
- `pnpm audit:licenses` 종료0:597pnpm entries,86/142Vello crates,3opaqueWASM inventories,446license texts. 고지 검사 통과가 제한 모델의 상용 권리 해결을 뜻하지 않는다.
- `pnpm audit:security` 종료0: 권고 제외 없음, 알려진 취약점 없음.
- 기존 cgroup oom_kill2는 이번 전체 타입/빌드에서도 증가하지 않았다.

## 실제 실패와 복구 기록

첫 빌드 후 inventory 자체는 종료0이었지만 비교 assertion은 종료1이었다. 부모 작업이 새로 추가한 증거 `native-resize-comparison/compare.mts`1개가 루트TS 검사 대상에 들어가 Program26248개/fingerprint1c30...로 달라졌기 때문이다. 기존 source/input/options 변경은0개였다. `postbuild-inventory.json`, `postbuild-fingerprint-check.json`, `postbuild-inventory-diff.json`, `build-review-blocked.md`는 그대로 보존했다.

부모 작업이 증거를 바이트 SHA2568878f941... 동일하게 `compare.mts.txt`로 포장하고 원래 실행본은 `/tmp`에 보존했다. TS설정·앱코드·패키지 입력을 완화하지 않았다. 이후 **새 전체 Program inventory**와 비교를 실행해26,247개, 전체identity동일, 모든 파일/입력 추가·삭제·변경0개, fingerprint`8114eca5062c95ab9d524e26bf866133b00b291a77937e5629f598ad4bfdf8ce` 복구를 확인했다. 원래와 같은 입력이므로 Vite를 반복하지 않았다. 복구 근거는 `restored-inventory.json`, `restored-fingerprint-check.json`, `restored-fingerprint.exit=0`이다.

첫 browser launch는 Playwright 번들 Chromium revision1248이 없어 실제 종료1이었다. 브라우저는 시작되지 않았다. 실패 script/log/exit를 보존했고, 부모 지시에 따라 이미 설치된 `/usr/bin/chromium`경로/버전을 확인한 후 새 `/tmp` probe의 launch executablePath만 지정해 실제 assertion을1회 실행해 통과했다. assertion·품질 기준 변경, browser설치·다운로드·로그인은 없었다. 테스트 서버 두 번의 종료143은 검증 후 의도한SIGTERM 정리이며 probe실패로 보지 않는다. cleanupJSON과 서비스 로그/exit를 보존했다.

## 명령과 실제 종료 코드

공통 환경 override는 `npm_config_manage_package_manager_versions=false PNPM_HOME=/tmp/toonstudio-pnpm XDG_DATA_HOME=/tmp/toonstudio-xdg`; Node24.19.0/pnpm11.25.0이다. 각 `<label>.command.json`에 정확한 argv·cwd·override·시작시각, `<label>.log`에 stdout/stderr, `<label>.exit`에 외부 실제 종료 코드를 저장했다. `index.jsonl`에는 시작·종료 시각도 있다.

| 단계 | 실제 argv | 종료 코드 |
| --- | --- | --- |
| `focused-vitest` | `pnpm exec vitest run --maxWorkers=2 apps/web/src/domains/legal/technology/EngineeringLicensesPage.test.tsx apps/web/src/domains/legal/technology/engineering-library-guide-areas-b.test.ts apps/web/src/domains/legal/technology/engineering-license-inventory.test.ts apps/web/src/domains/legal/technology/engineering-seminar-prep.test.ts apps/web/src/domains/legal/technology/product-tour-tech-links.test.ts apps/web/src/domains/creator/export/studio-native-lanczos.test.ts apps/web/src/domains/creator/export/studio-vips-export.test.ts apps/web/src/domains/creator/export/studio-export-presets.vips-route.test.ts packages/studio-engine-registry/src/__tests__/effect-compiler.test.ts packages/studio-engine-registry/src/__tests__/manifest-governance.test.ts tests/benchmarks/harness/native-gaussian.test.ts apps/web/src/domains/creator/live/studio-live-surface-filter-provider.test.ts apps/web/src/domains/creator/live/studio-live-surface-filter-provider-boundary.test.ts apps/web/src/domains/creator/studio-onnx-animegan.test.ts apps/web/src/domains/creator/studio-onnx-tag2pix.test.ts apps/web/src/domains/creator/studio-onnx-inference-provider.test.ts apps/web/src/domains/creator/studio-onnx-inference-provider-boundary.test.ts scripts/__tests__/generate-third-party-notices.test.mjs scripts/generate-third-party-notices-remotion.test.mjs` | 0 |
| `focused-node` | `node --test scripts/typecheck-shards.test.mjs scripts/check-restricted-model-distribution.test.mjs scripts/third-party-license-files.test.mjs` | 0 |
| `prebuild` | `pnpm prebuild` | 0 |
| `canonical-harness` | `pnpm harness:verify --base=HEAD` | 0 |
| `build-bundle` | `pnpm run build:bundle` | 0 |
| `postbuild-inventory` | `node --max-old-space-size=8192 scripts/typecheck-shards-worker.mjs /tmp/toonstudio-pr-validation-20261105-63dcf937-w7n5y97h/postbuild-inventory-job.json` | 0 |
| `restored-inventory` | `node --max-old-space-size=8192 scripts/typecheck-shards-worker.mjs /tmp/toonstudio-pr-validation-20261105-63dcf937-w7n5y97h/restored-inventory-job.json` | 0 |
| `restored-fingerprint` | `python3 /tmp/toonstudio-pr-validation-20261105-63dcf937-w7n5y97h/check-restored-fingerprint.py` | 0 |
| `studio-bundle` | `env UPDATE_BUNDLE_BASELINE=0 TIGHTEN_BUNDLE_BASELINE=0 STUDIO_BUNDLE_RUNTIME=0 STUDIO_BUNDLE_PUBLIC_RUNTIME=0 pnpm run check:studio-bundle` | 0 |
| `remotion-chunks` | `pnpm run check:product-tour-remotion-chunks` | 0 |
| `csp` | `node scripts/verify-static-csp.mjs dist/index.html` | 0 |
| `restricted-models` | `node scripts/check-restricted-model-distribution.mjs dist --json` | 1 |
| `vips-residues` | `python3 /tmp/toonstudio-pr-validation-20261105-63dcf937-w7n5y97h/check-vips-residues.py` | 0 |
| `native-browser-probe` | `node /tmp/toonstudio-pr-validation-20261105-63dcf937-w7n5y97h/native-browser-probe.mjs` | 1 |
| `browser-version` | `/usr/bin/chromium --version` | 0 |
| `native-browser-system-chromium` | `node /tmp/toonstudio-pr-validation-20261105-63dcf937-w7n5y97h/native-browser-probe-system-chromium.mjs` | 0 |
| `audit-licenses` | `pnpm audit:licenses` | 0 |
| `audit-security` | `pnpm audit:security` | 0 |

## 남은 한계

상용 출시 차단2개와 출처 검토1개는 여전히 남아 있다. 자체 축소 구현의 과거WASM대비 성능 저하는 부모 작업의 새 동일환경 비교 보고서가 따로 다룬다. 이 검증은 모든 기존WASM API·성능·전체UI 동등성을 주장하지 않는다. 검증 증거는 이 후보에 대한 것이며 이후 main갱신·입력변경에는 다시 판단해야 한다.
