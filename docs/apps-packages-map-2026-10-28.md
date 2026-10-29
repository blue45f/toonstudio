# apps/ + packages/ 지도 — PR #2536에 누적되는 두 번째 문서 (동작 변경 없음)

> 기준 HEAD: `a166b435` (main, 2026-10-27 커밋 기준)
> 이 문서는 추가 문서일 뿐이다. 코드 삭제·이동·설정 변경은 없다.
> 아래 개수는 디렉토리 목록·첫 페이지 검색 기준이며, 전체 재귀 센서스가 아니다.
> 특히 `apps/web/src/domains/creator`의 1000건은 API 페이지 상한이라 하한값이다.

## 1. apps/ — 7개

- `apps/web`: 루트 호스트 앱. `src/`는 `app/`, `domains/`, `platform/`, `shared/`, `vite-env.d.ts`.
  `src/app` 56건, `src/domains` 26개 도메인, `src/platform` 44건, `src/shared` 22건,
  `src/shared/components` 231건, `src/app/routes` 33건.
  주의: `apps/web` 자체에는 `package.json`이 없다. 루트 `package.json`이 사실상 웹 앱이다.
- `apps/api`: NestJS `@webtoon-nest/api`, 32개 의존성·6개 dev 의존성, `src/modules/` 42개 모듈.
- `apps/admin-web`: `@toonstudio/admin-web`, 자체 Vite·Playwright 설정.
- `apps/brush-lab`: `@toonstudio/brush-lab`, 자체 Vite 앱 + `wasm/`, `test-data/`.
- `apps/character-lab`: 자체 Vite 앱 + `kit-preview.html`, `public/`.
- `apps/mobile`: Capacitor, `android/`, `ios/`, `shell/`, `resources/`.
- `apps/desktop-sync`: 자체 Vitest 설정, `tsconfig.build.json`.

## 2. packages/ — 13개

- `packages/contracts/src` 86개 파일, `packages/core/src` 64건,
  `packages/format-gateway/src` 37개 파일,
  `packages/studio-engine-registry/src` 23건,
  `packages/studio-project-model/src` 14개 상위 항목
  (`assets/`, `authority/`, `capability/`, `command/`, `compat/`, `graph/`,
  `interchange/`, `ir/`, `browser/`, `node/`),
  `packages/studio-brush-platform/src` 24건,
  `packages/studio-engine-skia/src` 15건,
  `packages/studio-engine-vello/src` 12건,
  `packages/studio-engine-thorvg/src` 7건,
  `packages/play-core/src` 12건,
  `packages/studio-command-registry/src` 8건,
  `packages/product-tour-film/src` 2개 파일,
  `packages/studio-hokusai-wasm`: Rust 패키지(`Cargo.toml`, `Cargo.lock`, `src/`, `tests/`, `pkg/`).
  자체 루트에 `package.json`이 목록에 보이지 않는다.

## 3. 루트 설정 — 확인된 사실

- 루트 `package.json`: private, `pnpm@11.4.0`, Node `>=24.16.0`,
  스크립트 313개, 의존성 105개, dev 의존성 60개.
  내부 의존성은 `@toonstudio/contracts`, `core`, `play-core`, `product-tour-film`,
  `studio-brush-platform`, `studio-command-registry`, `studio-engine-registry`,
  `studio-engine-skia`, `studio-engine-thorvg`, `studio-engine-vello`,
  `studio-format-gateway`, `studio-project-model`이다.
  이 목록에 `@toonstudio/studio-hokusai-wasm`은 보이지 않는다.
- `turbo.json`: `build`·`typecheck`·`test`가 모두 `^build`에 의존,
  `lint`, `dev`(persistent, 캐시 없음). 출력에 `dist/**`, `build/**`, `out/**`,
  `storybook-static/**`, `public/**` 포함.
- 기본 빌드 경로는 Turbo가 아니다. 기본 `build`는 직접 `tsc` + Vite,
  기본 `test`는 `test:root && test:perf`, `build:all`·`dev:all`은 `pnpm -r`이다.
  두 오케스트레이터 중 어느 것이 정본인지 설정 자체에서는 문서화되어 있지 않다.

## 4. 실제 아키텍처 — 강한 점과 90점을 가로막는 점

강한 점:
- 웹 도메인 계층이 실제로 존재한다: `src/app`(셸·라우트) → `src/domains/*` →
  `src/platform/*`(수작업 API 클라이언트) → `src/shared/*`.
- 계약·엔진 경계가 강하다: `contracts`, `studio-project-model`(프로젝트 IR·그래프),
  `studio-engine-registry`(`renderer-roles.ts`, `registry.ts`, `tournament.ts`, `planner.ts`)가
  Skia·ThorVG·Vello·Hokusai를 중재하고, `format-gateway`가 포맷 코덱을 담당한다.
  레지스트리 + capability 패턴이지, 즉흥 import가 아니다.
- 번들 래칫(`check:studio-bundle`)과 경계·검증 스크립트가 있다.

가로막는 점:
- 루트 호스트 앱: 웹을 루트와 독립적으로 빌드·버전·의존성 감사할 수 없다.
- 메가 도메인: `apps/web/src/domains/creator`가 1000건 이상으로,
  스튜디오 에디터·마켓·크리에이터·가상 공간 표면을 한 도메인에 모은다.
  하위 폴더(`brush/`, `canvas/`, `render/`, `live/`, `virtual-space/`,
  `project-graph/`, `work-session/`, `artcraft-suite/`, `comic/`, `lettering/` 등)는 확인되나,
  그 자체로 도메인 분리가 된 것은 아니다.
- 공유 UI 패키지 부재: `packages/`에 `ui`·디자인 시스템 패키지가 없고,
  공유 UI는 `apps/web/src/shared/components`(231건)에 있다.
  `admin-web`과 랩 앱은 각자 `src/`를 가진다.
- God 패키지: `core`는 `business.ts`, `catalog/`, `commerce.ts`, `community/`,
  `creator-ecosystem.ts`, `membership-wallet.ts`, `studio-music.ts`, `taxonomy.ts` 등을
  하나의 `index.ts` 뒤에 둔다. "지갑만"·"카탈로그만" 의존할 수 없다.
  `contracts`도 86개 파일로 같은 문제를 가진다.
- 웹 26개 도메인과 API 42개 모듈은 이름이 겹치지만 1:1이 아니다. 드리프트 위험이 있다.
- 빌드 메모리: `build`·`typecheck`가 16GB 비증분 `tsc`를 쓰고, `lint`는 8GB를 쓴다.
  메모리를 낮추는 것만으로는 해결되지 않는다. 그래프를 쪼개야 한다.
- 번들 수작업: `apps/web/vite.config.ts`(23,133자)와
  `apps/web/config/vite-manual-chunks.ts`(17,824자), React Compiler 필터,
  프리로드 제외 목록, 서비스 워커 프리캐시, COOP/COEP 게이트가 얽혀 있다.
  래칫 주석 자체가 잘못된 병합이 번들을 키운다고 경고한다.
  청크 이름을 함부로 바꾸지 말고, 래칫 검증을 통과해야 한다.
- 엔진 확산: Skia + ThorVG + Vello + Hokusai + libmypaint + WGSL/Wesl +
  생성된 Rust `pkg/` 출력이 WASM·COOP/COEP·프리캐시 표면을 키운다.
- 테스트 가중치: Vitest 테스트 루트가 `apps`, `deploy`, `packages`, `scripts`, `tests`이고,
  `maxWorkers: 4`, 타임아웃 30초이다. 커버리지는 `apps/web/src/**`와 `apps/api/src/**`만 포함하고,
  `packages/*`는 그 게이트에 없다.

## 5. 참조 확인된 것 — 삭제하면 안 되는 것

다음은 `search_code`로 확인되어 삭제 대상이 아니다:
- `@toonstudio/studio-hokusai-wasm`: `studio-engine-registry/src/renderer-roles.ts`에서 참조된다.
  더 넓은 검색에서도 문서·`brush-lab`·검증 스크립트·ESLint·knip에서 나온다.
  레지스트리 진입점 하나가 사실상 유일한 JS 연결점이므로, 진입점을 지우면 고립된다.
- `@toonstudio/play-core`: 웹 플레이 게임 여러 파일에서 사용된다. 삭제 금지.
- `@toonstudio/product-tour-film`: 2개 파일로 작지만, 마케팅·법무·브랜드 필름 도구에서 사용된다.
  삭제가 아니라 통합 후보이다.
- `@toonstudio/studio-engine-thorvg`, `vello`, `skia`, `format-gateway`,
  `studio-project-model`, `studio-brush-platform`, `studio-command-registry`:
  모두 웹에서 실제 소비자가 있다. 삭제 금지.
- `apps/brush-lab`, `apps/character-lab`: ADR 0026의 실험·프로모션 트랙이며,
  웹 안에 대응 런타임이 있다. 사망 확인이 아니다.

## 6. 미확인 후보 — 확인 전에는 삭제·이동 금지

- `knip.json` 대 `knip.jsonc`: 어느 쪽을 Knip이 실제로 로드하는지 미확인. 둘 다 지우지 않는다.
- `studio-command-catalog.ts` 대 `studio-command-catalog-base.ts`:
  베이스가 "역사적 증거"로 남는다고 헤더에 있으나, 직접 참조 여부는 미확인.
- Playwright·tsconfig·Vitest 변형들의 개별 폐기 여부는 미확인. 파편화는 확인, 폐기는 미확인.
- 이 조사만으로는 삭제 목록을 만들 수 없다. Knip 실행 보고서와 경계 검증 결과가 삭제 목록의 근거가 되어야 한다.

## 7. 안전한 다음 단계와 파괴적 단계의 구분

안전 (이 PR에 누적 가능):
- Knip + 경계 검증 보고서를 실행·공개하고, 그 보고서가 미사용을 지명하게 한다.
- knip 권위를 문서로 확정한다 (로더 확인 뒤).
- 정본 빌드 경로(Turbo 대 `pnpm -r` 대 직접)를 `ARCHITECTURE.md`·README에 문서화한다. 기본값은 아직 바꾸지 않는다.
- `packages/*`에 없는 README를 보완하고, `domains/creator` 하위 지도를 만든다. 문서만 추가한다.
- 번들 작업은 `check:studio-bundle` 래칫 안에서만 한다.

중간 (re-export 먼저, 이동 나중):
- `domains/creator`를 하위 폴더별 배럴 + import 규칙부터 만들고, 그 뒤에 파일을 옮긴다.
- `packages/core`를 기존 `index.ts` re-export 뒤에서 쪼갠다.
- `apps/web/src/shared/components`를 `packages/ui`로 점진적으로 옮긴다. re-export부터, 일괄 이동 금지.

파괴적 (별도 명시적 확인 필요, 정리 PR에 섞지 않음):
- 테스트·랩 앱·엔진 패키지·포맷 게이트웨이 코덱·명령 카탈로그 베이스 삭제.
- 루트 `package.json`을 `apps/web/package.json`으로 이동, Turbo를 기본 빌드로 전환,
  `tsc --incremental false` 변경, 빌드 메모리 하향, pnpm overrides·`minimumReleaseAge`·`patches/braces` 변경.
- `.env.production` 제거·재작성, Playwright·tsconfig·Vitest 변형 제거, knip 중복 제거(로더 확인 전).

## 8. 이 영역만의 잠정 평가

이 영역에 대한 검토자 판단으로 약 72–78/100이다. 전체 레포 잠정 점수 61/100과 다르다.
전체 점수는 루트·백엔드·테스트·문서·CI까지 포함한 것이고, 이 수치는 apps/packages 구조만 본 것이다.
90+에 도달하려면 UI 추출 → creator 분할 → core 분할 → 단일 정본 빌드 경로라는 단계적 프로그램이 필요하고,
단일 PR 한 번으로 끝낼 수 있는 작업이 아니다. 이 문서는 그 프로그램의 지도일 뿐, 완료 선언이 아니다.

## 9. 보안 별도 트랙

- 루트 `.env.production`은 존재만 확인했고, 내용은 조회하지 않았다.
  `.gitignore`·secretlint 적용 여부와 실제 값 여부는 별도 확인으로 분리한다.
