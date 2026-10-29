# 테스트·문서·CI 지도 — PR #2536에 누적되는 네 번째 문서

> 기준: main `a166b435`, 최상위 목록 기준. 재귀 총합은 GitHub 429로 미검증이다.
> 아래 숫자를 재귀 총합으로 인용하지 않는다. 이 문서는 추가 문서이며,
> 마지막 절의 삭제 2건만이 이 PR의 첫 번째 실제 삭제이다.

## 1. 규모 — 최상위 기준

- `.github/workflows/`: 101개 워크플로 파일. `ci.yml`(21,898B)이 별도이고,
  나머지는 도메인별 품질 게이트에 가깝다. 단일 CI가 아니라 100개 단위 게이트 팩이다.
- `.github/` 기타: `copilot-instructions.md`, `dependabot.yml`,
  `pull_request_template.md`, `secret_scanning.yml` + `workflows/`.
- `tests/`: 최상위 18개 = 파일 10개 + 디렉토리 8개.
  디렉토리: `benchmarks/`, `blender/`, `corpus/`, `fault-injection/`,
  `format-gateway/`, `integration/`, `lib/`, `visual/` (하위 수 미검증).
- `e2e/`: 최상위 68개 = 약 53개 스펙 + `helpers/`, `fixtures/` + 하네스 + 스모크.
  `studio-3d-visual-verification.spec.ts`는 62,755B로 단일 스펙이 매우 크다.
- `scripts/`: 최상위 부분 목록만으로 300개 이상, 재귀 총합 미검증.
  접두사: `verify-*`가 지배적, `generate-*`, `qa-*`, `studio-*`, `validate-*`,
  `run-*`, `provision-*`, `plan-*`, `sync-*`, `import-*`, `probe-*`, `render-*`.
  대형 예: `verify-studio-brushes.mts` 253,984B, `verify-studio-3d-console.mts` 130,567B,
  `verify-studio-groups.mts` 118,494B, `run-production-database-migrations.mjs` 115,532B.
  `*.test.mjs/ts`가 스크립트와 1:1로 대량 존재한다.
  즉 테스트는 3층(`scripts/*.test.*`, `tests/`, `e2e/`) + `scripts/verify-*` 브라우저 QA로 분산돼 있다.
- `tools/`: 최상위 17개. `tools/README.md` 경계: "제품 앱은 runtime에서 tool source를 import하지 않는다".
- `docs/`: 최상위 256개. 하위 디렉토리 30개 이상.
- 루트 문서: `*.md` 18개 (README 39,499B, STUDIO_MANUAL 45,004B 등, 앞 문서 참조).
- `openwiki/`: 4개. `INSTRUCTIONS.md`는 OpenWiki를 탐색·설명·증거 연결 계층일 뿐,
  소스·테스트·ADR을 덮어쓰지 않는다고 못 박는다. `quickstart.md`는 자동 병합하지 않는다.
- `hidden_files/`: 4개. `render-smoke.tsx`(7,338B), `run-entry.mjs`(167B),
  `vitest-shim.mjs`(2,227B), `scratch/`(내용 미검증).
- `third_party/`: 디렉토리 8개 (벤더 엔진 묶음).
- `onnx-poc/`: 3개 파일, 모델 `u2netp.onnx` 4,574,861B.
- `patches/`: 9개. 대형 패치: `p5.brush` 312,368B, `ktx2-encoder` 208,029B,
  `manifold-3d` 148,467B + `braces/`, `extract-zip-disabled/` 디렉토리.
- 루트 테스트 설정: Playwright 20개, Vitest 6개, Knip 2개, ESLint 2개.

## 2. 이름만 보고 지우면 안 되는 것 — 참조 확인됨

- `production-operation-database-contract.mjs`(단수) 대
  `production-operations-database-contract.mjs`(복수): 둘 다 참조된다.
  DB 마이그레이션 계약이라 통합은 별도 설계·마이그레이션 검증이 필요한 고위험 작업이다.
- `cleanup-merged-branches.yml` 대 `cleanup-merged-pr-branches.yml`: 둘 다 실존 워크플로이며,
  후자는 정리 스크립트와 CI 스코프 테스트에서 참조된다. 보호 목록에서도 다른 워크플로이다.
- `studio-five-hour-soak` 대 `studio-soak-10h`: 지속 시간이 다른 별개 소크이다.
- `e2e/market.spec.ts` 대 `market-live.spec.ts` 대 `market-asset-experience.spec.ts`:
  live 스펙은 별도 라이브 게이트이다.
- `patches/extract-zip-disabled/`: pnpm-workspace, README, 테스트에서 참조되는 활성 패치이다.
- `tests/` 얇은 러너(175–211B): 15,645–18,635B짜리 `*-cases.ts`를 import하는 케이스 분리 패턴이다.
  껍데기가 아니다.

## 3. 미확인 후보 — 삭제 전 대조 필요

- `knip.json`(398B) 대 `knip.jsonc`(1,251B): 내용이 다르다.
  전자는 `ignoreDependencies: [cloudflare, opentype.js]`, 좁은 무시 목록.
  후자는 주석 포함, `ignoreDependencies: [cloudflare]`, 넓은 무시 목록,
  `rules.cycles: warn`, wasm `pkg/**` 무시. `CONTRIBUTING.md`는 `knip.json`만 언급한다.
  어느 쪽이 실제 실행 설정인지는 `package.json` knip 스크립트 확인 전에는 미확인이다. 둘 다 지우지 않는다.
- `e2e/a11y-smoke.spec.ts`(11,173B) 대 `e2e/accessibility-smoke.spec.ts`(1,434B):
  전자는 a11y config와 package.json에서 참조된다. 후자는 본문 검색 0건이나,
  파일명으로만 실행되는 경우를 잡지 못한다. config 스펙 목록 대조 전 미확인이다.
- `qa-live-studio-cross-browser-audit.mjs` 대 `*-v2.mjs`: 본문 검색 둘 다 0건.
  v2가 계승본인지, v1이 워크플로 파일명으로 실행되는지 미확인이다.
- `verify-studio-dynamic-dual-tip-webgpu.mjs` 대 `*-v2.mjs`:
  v2는 package.json·워크플로·소크 설정에서 참조되는 활성본이다. v1은 미확인이다.
- `qa-*`/`verify-*` 대량 스크립트: 파일명만으로 실행 주체를 알 수 없고,
  워크플로·package.json 대조 전에는 전부 미확인이다. 100KB급 `verify-*`는
  테스트가 아니라 브라우저 QA 하네스일 가능성이 높아, 삭제하면 QA 커버리지가 통째로 사라진다.
- `tools/godot-3d-poc/`: `docs/README.md`(2026-10-22)가 2026-10-21 소유자 결정(PR #2354)으로
  운영 Godot 섬이 제거됐고 ADR-0028은 Superseded, 현재 기능이 아니라고 명시한다.
  삭제가 아니라 `docs/evidence/`로의 아카이브 이동 후보이다.
- `onnx-poc/`: README가 후속 경로가 프로덕션 배선됐다고 말한다.
  PoC 스크립트 참조 여부와 4.57MB 모델이 테스트 픽스처인지 미확인이다. 모델 단독 삭제 금지이다.
- `hidden_files/render-smoke.tsx`, `hidden_files/scratch/`: 참조·내용 미확인이다.

## 4. 문서 패키징 고도화 — 이미 있는 권위 체계를 깨지 않는다

`docs/README.md`(2026-10-22) 권위 순서:
소스·테스트·manifest > 기계 원장·ratchet > 현재 아키텍처 문서 > 승인 ADR >
역사 보고서·벤치마크 > OpenWiki 탐색 문서. 문서가 소스와 다르면 소스를 우선한다.

겹침 지점:
1. 에이전트 지침 4중복: 루트 `AGENTS.md` + `CLAUDE.md` + `GEMINI.md` + `docs/AGENTS.md`(1,045B).
   정본은 `AGENTS.md`로 하고 나머지는 포인터 1줄로 축소하는 것이 안전하다.
   단, 도구 자동 로드 요구사항 대조가 선행돼야 한다.
2. 제품 전략 4분산: 루트 PRODUCT·DESIGN·DIFFERENTIATION·MONETIZATION·UX_FLOW_BACKLOG와
   `docs/product/`·`marketing/`·`features/`가 또 있다. `docs/product/`를 정본으로 삼고
   루트는 포인터로 바꾸는 방안이 있다 (링크 대조 후).
3. Studio 매뉴얼 분산: 루트 두 매뉴얼 + `docs/studio/` + `docs/engines/renderer-roles.md` +
   `docs/studio-*.md` 수십 개. `docs/studio/`를 `current/`와 `history/`로 나누는 것이 순서이다.
4. 운영 디렉토리 이중명: `docs/operations/`와 `docs/ops/`가 동시에 있다.
   `ops/`를 `operations/`로 흡수하는 것이 가장 저위험 통합이다 (링크 대조 후).
5. 증거·품질 디렉토리 난립: `reports/` + `evidence/` + `audits/` + `validation/` +
   `quality/` + `qa/` + `benchmarks/` + `tests/benchmarks/` + `rewrite/`.
   `docs/README.md`는 `reports/`·`evidence/`를 해당 시점 증거, `rewrite/`를 역사 자료로 규정한다.
   날짜형 파일을 최상위에 방치하지 말고 `docs/evidence/<연월>/`로 내용 무수정 이동한다.
6. 아키텍처 3층 중복: 루트 ARCHITECTURE + `docs/architecture/` + `docs/engineering/` +
   `docs/engines/` + `docs/technology/` + `openwiki/architecture/` + `docs/adr/`.
   OpenWiki는 권위가 아니므로, OpenWiki에 현재 구조를 또 쓰지 않는다.
7. 생성물과 수기 문서 혼재: `THIRD_PARTY_NOTICES.md`는 생성 스크립트(81,280B)의 생성물로 보이며
   수기 편집 대상이 아니다. `ASSET-INVENTORY.md`도 원장 성격이다. 생성 파이프라인 소유로 분리한다.

카테고리 제안 (이동이 아니라 인덱스·포인터·아카이브 3단계):
- 진입·권위: 루트 README → ARCHITECTURE → docs/README → modular-monorepo-target 순 유지.
- 제품·전략: `docs/product/` 정본, 루트는 포인터.
- Studio: `docs/studio/current/`와 `history/` 분리, 루트 매뉴얼은 이동 후 포인터 유지.
- 운영·보안: `docs/operations/`에 `ops/` 흡수, DEPLOY·SECURITY·COMPLIANCE·예외 문서를 인덱스에 연결.
- 엔지니어링·아키텍처: architecture(현재·목표) + engineering(패턴·가드레일) + engines(엔진 계약) + adr(결정) 유지,
  `technology/`는 흡수 검토.
- 증거·역사: `docs/evidence/<연월>/`에 날짜형 파일 연월별 묶음, 내용 무수정, 현재 사실 인용 금지 라벨.
- 도메인 기능: `docs/features/`를 도메인별 하위로 나누고, 최상위 `creator-*`·`studio-*` 등을 이동 (역링크 대조 후).
- OpenWiki: 수기 문서 추가 금지, 생성 전용 유지, 비자동병합 정책 유지.

하지 말아야 할 것: THIRD_PARTY_NOTICES 수기 편집, 날짜형 증거 내용 수정,
`docs/adr/` 결정문 삭제, `docs/README.md` 권위 순서와 다른 새 정본 선언.

## 5. CI·툴링 리스크

- 워크플로 101개 + Playwright 20개: 트리거·동시 실행·캐시 감사 없이는 불필요 판정이 안 된다.
  장시간 소크가 러너를 점유한다.
- Knip 이중 설정: 어느 쪽이 실행 설정인지 모른 채 하나를 지우면 검사가 조용히 꺼지거나 거짓 양성이 쏟아진다.
- ESLint 레거시 예외: ratchet 성격이라 삭제가 아니라 예외를 줄이는 방향으로만 다룬다.
- Dependabot: 주간, npm 5건 + Actions 5건 + cargo/pip 각 3건 상한. PR 상한 합계만으로 주 20건 이상이 될 수 있다.
- 대형 패치 3건: 업그레이드 시 충돌·재작성 비용이 크다. 패치 삭제는 업그레이드와 함께 검토한다.
- 벤더 엔진 8개: 라이선스·출처가 THIRD_PARTY_NOTICES와 연결돼 있다.
- `.env.production`(627B) 추적 파일 존재: 내용 미조회, 비밀 포함 여부 단정 불가.
  정리 명목으로 함부로 건드리지 않고, 소유자 비밀 확인이 선행 조건이다.
- secret_scanning + secretlint가 존재하므로, 정리 PR에도 비밀 스캔이 걸린다는 전제가 있다.

## 6. 이 PR의 첫 번째 실제 삭제 — hidden_files 2건 (최종 대조 완료)

삭제 파일:
- `hidden_files/run-entry.mjs` (167B)
- `hidden_files/vitest-shim.mjs` (2,227B)

근거:
- `vitest-shim` 본문 검색 총 1건이 `run-entry.mjs` 자체뿐이다.
- `hidden_files/run-entry` 문자열 검색 총 0건이다. package.json·워크플로에서 import하지 않는다.
- `run-entry.mjs`는 `./run/apps/web/src/domains/creator/planning/studio-episode-metrics-overlay.test.ts`를
  import하는데, `hidden_files/` 최상위에는 `run/` 디렉토리가 없다. 현재 형태로는 실행 불가능한 고아 러너이다.
- `vitest-shim.mjs` 본문에도 "local verification only (not shipped)"라고 적혀 있다.
- `hidden_files` 전체 검색 10건 중 어느 것도 이 두 파일을 CI·package.json에서 import하지 않는다.
  나머지 10건은 `scratch/gen_test.py` 등 다른 파일이다.

삭제하지 않은 것:
- `hidden_files/render-smoke.tsx`, `hidden_files/scratch/`: 참조·내용 미확인이라 유지한다.
- 위 3번의 미확인 후보 전부와 2번의 참조 확인된 파일 전부를 유지한다.

이 삭제는 main이 아니라 이 PR 브랜치에서만 일어난다. 머지는 소유자가 직접 확인 뒤에 한다.
