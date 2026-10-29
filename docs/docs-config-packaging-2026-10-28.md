# 문서·설정 종류별 패키징 검토 — PR #2536에 누적되는 세 번째 문서 (동작 변경 없음)

> 이 문서는 패키징 지도이다. 문서·설정 파일을 물리적으로 옮기거나 지우지 않는다.
> 이유는 아래 4번에 있다. 옮기려면 링크·스크립트·CI 참조를 같은 커밋에서 고쳐야 하고,
> 지우려면 내용 중복·폐기 증거가 있어야 한다. 그 증거가 아직 없는 파일은 지우지 않는다.

## 1. 문서 종류별 패키징 — 루트 문서 → docs/ 카테고리 (이동 전 지도)

루트 문서는 20개 이상이다. 아래는 종류별 패키징 제안이며, 실제 이동은 참조 확인 뒤에 한다.

| 종류 | 루트 문서 | 패키징 위치 (제안) | 상태 |
|---|---|---|---|
| 제품·전략 | `PRODUCT.md` (10,467B), `DESIGN.md` (13,350B), `DIFFERENTIATION.md` (10,072B), `MONETIZATION.md` (14,717B), `UX_FLOW_BACKLOG.md` (2,555B) | `docs/product/` | 이동 전 참조 확인 필요. MONETIZATION은 코드 언급 0건이지만, 전략 문서라 언급 0건이 폐기 근거가 아니다 |
| 아키텍처·엔지니어링 | `ARCHITECTURE.md` (14,351B), `AGENTS.md` (11,723B), `CLAUDE.md` (938B), `GEMINI.md` (795B), `CONTRIBUTING.md` (6,618B), `SECURITY.md` (1,325B) | `docs/architecture/` + `docs/engineering/` | AGENTS/CLAUDE/GEMINI는 도구별 지침이라, 이동하면 도구 로더가 못 찾을 수 있다. 이동 전 로더 확인 필요 |
| 매뉴얼·가이드 | `STUDIO_MANUAL.md` (45,004B), `STUDIO_3D_DCC_MANUAL.md` (36,589B), `DEPLOY.md` (32,058B) | `docs/guides/` (제안) | 삭제 금지. STUDIO_MANUAL은 `scripts/generate-studio-manual.mjs`, `PRODUCT.md`, `docs/studio/user-manual-page.md` 등 17건에서 언급된다. 생성 스크립트가 있으면, 매뉴얼은 원본이 아니라 생성물일 수 있어 이동 전 생성 경로 확인 필요 |
| 인벤토리·법무 | `ASSET-INVENTORY.md` (14,777B), `THIRD_PARTY_NOTICES.md` (17,983B) | `docs/reference/` + `docs/legal/` (제안) | 삭제 금지. THIRD_PARTY_NOTICES는 README, ASSET-INVENTORY 등 51건에서 언급된다 |
| 진행 중 티켓 | `PENDING-TICKETS-MOBILE-DRAW.md` (1,549B) | `docs/maintenance/` (제안) | 삭제 금지. 코드 언급 0건이지만, 진행 중 티켓 목록일 수 있어 지우면 할 일이 사라진다. 완료 여부 확인 전에는 이동만 검토한다 |
| 입구 | `README.md` (39,499B) | 루트 유지 | 루트에 남긴다. 목차·입구 역할이다. 정본은 docs로, README는 지도로만 남긴다 |

## 2. docs/ 내부 패키징 — 이미 있는 카테고리와 평탄 파일 문제

`docs/`는 이미 종류별로 나뉘어 있다. 확인된 하위 디렉토리(일부):
`architecture`, `audits`, `automation`, `benchmarks`, `brand`, `candidates`,
`creator-resources`, `creator-runtime`, `design`, `engineering`, `engines`,
`events-and-promotions`, `evidence`, `features`, `feedback-community`,
`implementation`, `integration`, `interfaces`, `learn`, `maintenance`,
`marketing`, `operations`, `ops`, `perf`, `product`, `qa`, `quality`,
`recovery`, `reference`, `reports`, `research`, `rewrite`, `screenshots`,
`studio`, `superpowers`, `support`, `technology`, `third-party`,
`user-funded-ai-and-creator-ecosystem`, `ux`, `validation`, `adr`, `data-pipeline` 계열 등.

문제는 평탄 파일이다. `docs/` 루트에 직접 있는 파일이 100개가 넘고,
대부분 `studio-*`, `creator-*`, `webtoon-*` 접두사이다. 예시:
- `studio-*` 벤치마크·설계·통합 문서가 수십 개로 평탄하게 있다.
  예: `studio-selection-benchmark.md`, `studio-selection-benchmark-2026-09-09.md`,
  `studio-selection-benchmark-2026-09-12.md`처럼 날짜 변형이 있다.
  날짜 변형이 있다고 해서 오래된 것이 폐기라는 증거는 아니다.
  벤치마크는 시점별 증거라, 날짜가 다르다는 것 자체가 존재 이유일 수 있다.
- `creator-*` 문서는 `creator-resources/`, `creator-runtime/` 하위와 평탄 파일이 섞여 있다.
- `webtoon-*` 문서는 제품·생산·시장 카테고리와 섞여 있다.

패키징 원칙:
1. 평탄 파일을 무작정 하위로 옮기지 않는다. 파일명에 날짜가 있으면 증거·스냅샷으로 취급한다.
2. 새 문서는 반드시 카테고리 하위에 만든다. 평탄 루트에 새 문서를 만들지 않는다.
3. 기존 평탄 파일의 이동은, 그 파일을 링크하는 다른 문서·스크립트·CI를 같은 커밋에서 고칠 때만 한다.
4. `docs/README.md`는 이미 존재한다. 이 지도가 그 README를 대체하지 않는다.
   다음 단계는 `docs/README.md`에 카테고리별 입구를 추가하는 것이지, 파일을 옮기는 것이 아니다.

## 3. 설정파일 종류별 패키징 — 물리 이동 금지, 종류별 인덱스가 정답

설정파일은 도구가 위치를 요구하는 경우가 많아, 폴더로 옮기면 빌드·테스트·CI가 깨진다.
그래서 패키징은 "폴더 이동"이 아니라 "종류별 인덱스 + 공유 베이스"이다.

| 종류 | 파일 | 패키징 방식 |
|---|---|---|
| 빌드 | `turbo.json`, `tsconfig.json` + 6개 변형, `vite.feedback-review.config.ts`, `postcss.config.mjs` | 루트 유지. 변형 tsconfig는 베이스 상속 관계를 문서로 먼저 밝힌다 |
| 테스트 | `vitest.config.ts`, `vitest.perf.config.ts`, `vitest.sonar.config.ts`, `vitest.setup.ts`, `vitest.perf-budget-files.mjs`, `vitest.serial-test-files.mjs`, Playwright 약 20개 | 루트 유지. 공유 베이스 + 스위트별 얇은 설정 + 실행 매트릭스로 수렴한다. 개별 변형 폐기 여부는 미확인 |
| 린트·품질 | `eslint.config.mjs` (17,796B), `eslint.legacy-exceptions.json`, `knip.json` + `knip.jsonc`, `sonar-project.properties`, `lighthouserc.json`, `commitlint.config.cjs`, `.secretlintrc.json`, `.husky/` | 루트 유지. knip 2개 중 권위를 먼저 확정한다. 권위 확정 전에는 어느 쪽도 지우지 않는다 |
| 패키지·워크스페이스 | `package.json` (46,469B, 스크립트 313개), `pnpm-workspace.yaml`, `pnpm-lock.yaml` (606,038B) | 루트 유지. 스크립트 313개는 삭제 대상이 아니라, 진입점 문서화 대상이다 |
| 환경 예시 | `.env.example` (35,775B), `.env.production.example` (28,127B), `.env.creator-resources.example`, `.env.fortune.example`, `.env.supporter.example` | 루트 유지. 두 대형 예시 간 중복 키 드리프트를 비교한 뒤, 한쪽을 베이스로 삼을지 검토한다. 비밀값이 없는 예시 범위에서만 한다 |
| 정책·데이터 설정 | `config/*.json` 11개 + `config/blender/` | 이미 `config/`로 패키징되어 있다. 정본 지도는 `config/README.md` 참조 |
| 배포 설정 | `deploy/*.env.example`, `render.yaml` (10,088B), `deploy/README.md` | `deploy/`로 패키징되어 있다. 단위별 가동 여부는 미확인 |
| 에이전트 설정 | `.agents/`, `.claude/`, `.codex/`, `.cursor/`, `.opencode/`, `.opencode.jsonc`, `opencode.json`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | 도구별 로더가 위치를 요구할 수 있어 이동 금지. 공통 지침 1개 + 도구별 최소 차이로 수렴하는 것이 순서이다. `docs/AGENTS.md`는 CI 워크플로우와 `scripts/agent-harness.mjs`에서 언급되어 삭제 금지이다 |
| 기타 루트 설정 | `.gitignore`, `.gitattributes`, `.dockerignore`, `.nvmrc`, `.openwikiignore`, `.gitmessage.ko` | 루트 유지. 도구·Git이 요구하는 위치이다 |

## 4. 불필요한 문서 세세 확인 결과 — 이번 커밋에서 삭제한 파일: 0개

아래는 이번에 실제로 확인한 항목이다. "언급 0건"을 삭제 근거로 삼지 않았다.
문서는 코드가 아니어서, 코드에서 언급되지 않는 것이 곧 불필요하다는 뜻이 아니다.
전략·법무·증거·진행 중 티켓 문서는 언급이 없어도 존재 이유가 있다.

| 확인한 문서 | 확인 결과 | 결론 |
|---|---|---|
| `STUDIO_MANUAL.md` | 언급 17건, 생성 스크립트 존재 | 유지 |
| `STUDIO_3D_DCC_MANUAL.md` | 언급 5건, `config/documentation-authority.json`에서도 언급 | 유지 |
| `THIRD_PARTY_NOTICES.md` | 언급 51건, README·법무 경로와 연결 | 유지 |
| `UX_FLOW_BACKLOG.md` | 언급 2건 (`docs/ux-audit-2026-10-13.md`, e2e 테스트) | 유지 |
| `MONETIZATION.md` | 언급 0건 | 유지. 전략 문서라 언급 0건은 폐기 근거가 아니다. 내용 폐기 여부는 별도 확인 필요 |
| `PENDING-TICKETS-MOBILE-DRAW.md` | 언급 0건 | 유지. 진행 중 티켓일 수 있어 완료 확인 전 삭제 금지 |
| `docs/AGENTS.md` | CI 워크플로우·에이전트 하네스에서 언급 | 유지 |
| `openwiki/INSTRUCTIONS.md` + `quickstart.md` | `openwiki/`는 4개 항목만 있다 (`INSTRUCTIONS.md`, `applications/`, `architecture/`, `quickstart.md`). docs와 중복이라는 증거 없음 | 유지. openwiki는 별도 입구로 취급한다 |
| `hidden_files/` | 문서가 아니다 (`render-smoke.tsx`, `run-entry.mjs`, `scratch/`, `vitest-shim.mjs`). 문서 삭제 범위 밖 | 범위 외 |
| `onnx-poc/` | PoC 문서·코드·모델 3개 항목. 제품 문서가 아니다 | 범위 외, PoC 분리 유지 |

삭제가 안전해지려면 다음 중 하나가 필요하다:
1. 두 파일의 내용이 동일하거나, 한쪽이 다른 쪽의 완전한 부분집합이라는 내용 비교 결과.
2. 문서 자체에 "이 문서는 X로 대체되었다"는 명시, 또는 X가 그 내용을 포함한다는 확인.
3. 빈 파일, 또는 링크가 전부 깨진 고아 파일이라는 확인.
이번 배치에서는 위 세 가지 중 어느 것도 확인되지 않았다.
특히 날짜 변형 벤치마크(`studio-selection-benchmark*` 등)는 내용 비교 없이는
오래된 쪽을 지울 수 없다. 벤치마크는 시점별 증거이기 때문이다.

## 5. 다음 단계 — 삭제가 아니라, 삭제 가능한지 증명하는 순서

1. 내용 비교 대상 쌍을 먼저 정한다: `studio-selection-benchmark*` 변형,
   `studio-*` 날짜 변형, `creator-*` 평탄 파일 대 하위 디렉토리 파일.
2. 각 쌍의 내용을 비교하고, 중복이면 어느 쪽을 정본으로 남길지 정한다.
3. 정본을 남기고, 나머지 파일을 지우기 전에 그 파일을 링크하는 문서·스크립트를 같은 커밋에서 고친다.
4. 그 뒤에야 같은 PR #2536에 삭제 커밋을 추가한다.
5. 이 순서 없이 "불필요해 보인다"는 이유만으로 지우면, 증거·전략·법무 문서를 잃을 수 있다.
   그건 점수를 올리는 것이 아니라 내리는 것이다.
