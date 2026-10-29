# PR #2536 최종 검증 — 2026-10-29 11시 마감용 (동작 변경 없음, 추가 문서만)

> 이 문서는 2026-10-29 오전 11시 마감을 위해, 그 전에 검증이 끝난 항목을 한 번에 정리한다.
> 코드·설정 변경은 없다. CI 전체 검증은 아래 4번에 적힌 이유로 11/1 이후로 남는다.

## 1. knip 정본 — 삭제하지 않는 이유가 확정됐다

- `package.json` 스크립트: `quality:imports = knip --include unlisted,unresolved`,
  `quality:deadcode = knip`, `quality:cycles = knip --cycles`.
  어느 스크립트도 `--config`를 지정하지 않는다.
  따라서 어느 파일이 로드되는지는 Knip의 기본 발견 순서에 달려 있고, 레포 안에는 그 순서가 문서화되어 있지 않다.
- `knip.json`(398B): `ignoreDependencies: [cloudflare, opentype.js]`,
  좁은 `ignoreUnresolved` 4개만 있다.
- `knip.jsonc`(1,251B): 주석으로 이유가 적혀 있다.
  `ignoreDependencies: [cloudflare]`, 넓은 `ignoreUnresolved: ^/src/.+, ^/scripts/.+, ^/offline-draw/.+`,
  `rules.cycles: warn`, wasm `pkg/**` 무시 3개가 있다.
- 결론: 둘 중 하나를 지우면, 미사용 코드 검사가 조용히 꺼지거나 거짓 양성이 쏟아질 수 있다.
  로컬에서 Knip이 실제로 어느 파일을 로드하는지 확인하기 전에는 둘 다 유지한다.
  이것이 이 PR에서 knip 파일을 삭제하지 않는 확정 근거이다.

## 2. a11y 스펙 — accessibility-smoke는 삭제하지 않는다

- `package.json` 스크립트:
  `test:a11y = playwright test e2e/a11y-smoke.spec.ts`,
  `test:a11y:editor = playwright test --config playwright.studio-editor-a11y.config.ts`.
  `accessibility-smoke.spec.ts`를 직접 실행하는 스크립트는 없다.
- `playwright.a11y.config.ts`: `testDir: ./e2e`, `testMatch: a11y-smoke.spec.ts`로만 제한한다.
- 기본 `playwright.config.ts`: `testDir: ./e2e`이고, 확인된 범위에서는 testMatch 제한이 보이지 않는다.
  즉 수동으로 기본 config를 돌리면 `accessibility-smoke`도 포함될 수 있다.
  그러나 그 실행이 스크립트·워크플로로 고정되어 있다는 증거는 없다.
- 내용 비교: `a11y-smoke`는 데스크톱·모바일 경로(`/`, `/discover`, `/community`, `/market`,
  `/home`, `/studio`, `/studio/new`, `/production` 등)를 검사한다.
  `accessibility-smoke`는 공개 경로(`/`, `/about`, `/market`)만 검사한다.
  `/about`은 `a11y-smoke` 경로 목록에 없다. 따라서 `accessibility-smoke`는
  `a11y-smoke`에 완전히 포함되지 않는다. `/about` 검사를 `a11y-smoke`에 합치기 전에는 삭제하지 않는다.
- 결론: 병합 후보로는 남기되, 이번 마감에서는 삭제하지 않는다.

## 3. 이 마감까지 확정된 전체 목록

- 추가 문서 8개: 설계, deploy 인덱스, config 인덱스, apps/packages 지도,
  docs/config 패키징, tests/docs/CI 지도, 후속 정리, 이 최종 검증 문서.
- 실제 삭제 2개 (브랜치에서만): `hidden_files/run-entry.mjs`, `hidden_files/vitest-shim.mjs`.
- 유지 확정: knip 2개, a11y 스펙 2개, DB 계약 단수·복수, cleanup 워크플로 2개,
  소크 2종, market 스펙 3종, `extract-zip-disabled` 패치, `tests/` 얇은 러너,
  AGENTS 2개, 벤치마크 2건, ADR, 생성물 문서, 벤더 엔진, 대형 패치.
- 미확인으로 남은 후보 (삭제하지 않음):
  `qa-live-studio-cross-browser-audit` v1 대 v2,
  `verify-studio-dynamic-dual-tip-webgpu` v1,
  `qa-*`/`verify-*` 대량 스크립트, `tools/godot-3d-poc` 아카이브 이동,
  `onnx-poc` 모델 확인, `hidden_files/render-smoke.tsx`와 `scratch/`,
  `docs/ops/` 흡수, 날짜형 문서 연월 이동 (링크 대조 필요).

## 4. 11/1 이후로 남는 유일한 전체 검증 — 솔직한 한계

- GitHub Actions 분은 2026-11-01에 초기화되는 것으로 알려져 있고,
  2026-10-29 오전 11시까지는 여전히 소진 상태이다.
  과금·지출 한도 인상은 이 작업에서 승인되지 않았다.
  따라서 PR #2536의 CI 전체 그린 확인은 11/1 이후로 남는다.
- 그 외의 모든 검증(참조 검색, 파일 내용 대조, 스크립트·config 대조)은
  2026-10-29 11시 전에 끝났다. CI 그린 확인이 없다고 해서
  문서·인덱스·삭제 2건의 근거가 흔들리지는 않는다. 삭제 2건은 CI·package.json에서
  참조가 없다는 것이 이미 확인됐고, 추가 문서는 import·빌드 경로에 영향이 없다.

## 5. 마감 상태

- PR #2536은 draft로 유지하고, 머지는 하지 않는다. 머지는 소유자가 직접 확인 뒤에 한다.
- 이 문서를 마지막으로, 2026-10-29 11시 마감 범위의 작업은 완료된 것으로 본다.
  11/1 이후 CI 확인과 위 미확인 후보 대조는 별도 후속 작업이다.
