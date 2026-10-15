# 코드 구조와 번들 경계 패턴

- 상태: **current**(가드레일·신규 코드 패턴) · **migration**(기록된 기존 초과 파일과 지연 무효화 모듈) · **target**(레지스트리 지연 provider 전환)
- 적용일: **2026-10-15** (기준 커밋 `7e0a45710b1b1c9517005b0fee98be5c410269ed`)
- 권위: 규칙의 권위는 스크립트와 기준선이다. 이 문서는 그 해설과 개발 패턴이다.
  - `scripts/check-source-file-size.mjs` + `scripts/source-file-size-baseline.json`
  - `scripts/check-studio-eager-graph.mjs` + `scripts/studio-eager-graph-baseline.json`
  - 빌드 후 최종 판정: `scripts/check-studio-bundle.mjs` ([`../perf/bundle-gate.md`](../perf/bundle-gate.md))

## 1. 왜 필요한가

번들 예산 초과가 반복되는 근본 원인은 예산 숫자가 아니라 구조였다.

1. **한 파일이 너무 커졌다.** 가장 큰 `apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx`는 29,365줄이고 import 문이 505개다. `StudioCuttoonEditor` 함수 선언 하나가 1,474~29,365줄(구간 27,892줄)을 차지한다. 거대한 함수는 리뷰, 부분 테스트, React Compiler 최적화를 모두 어렵게 한다.
   빌드 게이트 주석(`scripts/check-studio-bundle.mjs`)에도 큰 모듈을 쪼개자 Babel의 코드 생성 deopt가 풀렸다는 기록이 남아 있다(2026-07-19 Inspector 분리, 2026-07-26 BG3D Shapes/View/LT 분리).
2. **Studio 진입점에서 정적으로 닿는 모듈이 너무 많다.** 앱 셸과 Studio 어댑터에서 정적 import만 따라가면 1,583개 모듈, 원본 18.53 MiB가 첫 청크 그래프에 묶인다.
3. **성장이 PR 시점에는 보이지 않았다.** 번들 초과는 무거운 빌드 뒤에야 `check:studio-bundle`이 알려 주므로, PR 작성자는 어떤 import 한 줄이 원인인지 알 수 없었다.

그래서 이 문서는 (가) 성장을 빌드 없이 몇 초 안에 원인 파일과 함께 드러내는 가드레일 두 개, (나) 같은 문제를 새 코드가 반복하지 않게 하는 개발 패턴을 정한다.

### 제품 정책과 범위

- 바이트와 정적 요청 수는 텔레메트리이고 그리기 지연·품질이 우선한다(`scripts/check-studio-bundle.mjs` 상단 정책 주석). **드로잉 입력 경로(브러시·포인터·캔버스 합성의 핫패스)는 번들 바이트를 이유로 분할하거나 지연시키지 않는다.**
- 이 문서의 가드레일은 기존 거대 파일을 지금 쪼개지 않는다. 현재 상태를 기준선으로 기록해 **더 나빠지는 것만** 막고, 분해는 별도 작업이 기준선을 낮추면서 진행한다.

### 현황 수치 (2026-10-15, 기준 커밋)

재현: 저장소 루트에서 `node scripts/check-source-file-size.mjs`, `node scripts/check-studio-eager-graph.mjs --verbose`.

| 항목 | 값 |
| --- | --- |
| 측정 대상 소스(테스트·생성물·선언·벤더·픽스처 제외) | 10,093개 |
| 800줄 초과 파일 / 총 초과 줄 수 | 761개 / 382,985줄 |
| 초과 파일 분포 | 3,000줄 이상 10 · 2,000~2,999 53 · 1,500~1,999 117 · 1,000~1,499 272 · 801~999 309 |
| 실제 `// @ts-nocheck` 지시문 파일 | 50개 (`bg3d` 24 · `studio-cuttoon-editor` 26) |
| Studio 정적 도달 모듈 / 원본 크기 | 1,583개 / 18.53 MiB (앱 셸 239개 1.21 MiB, Studio 어댑터 1,389개 17.69 MiB) |
| 금지 도메인으로 정적 도달하는 모듈 | 55개 (`vrm` 13 · `bg3d` 17 · `character-platform` 6 · `hybrid-dcc` 7 · `scene3d` 4 · `scene-3d` 4 · `virtual-space` 3 · `lift3d` 1) |
| 지연 선언이 정적으로도 도달해 무효화된 모듈 | 14개 (270 KiB) |

> 수치 정의가 다르면 값이 달라진다. 위 값은 이 문서의 제외 규칙과 줄 수 규칙(§3)으로 계산한 재현 가능한 값이다.
> `@ts-nocheck`는 파일 선두 주석의 지시문만 센다. 본문에서 이 표현을 언급한 주석(예: `StudioAiToolPopoverBody.tsx`)은 지시문이 아니다.

## 2. 가드레일 한눈에 보기

| 가드레일 | 막는 것 | 규칙 | 걸리는 시간 |
| --- | --- | --- | --- |
| 소스 파일 크기 래칫 | 파일이 다시 커지는 것 | 신규·기준선 밖 파일 800줄 상한 · 기록된 초과 파일은 기록 줄 수보다 늘 수 없음 · 새 `// @ts-nocheck` 금지 | 약 0.5초 |
| Studio 진입 그래프 래칫 | 정적 import로 번들이 조용히 커지는 것 | 총 정적 도달 원본 크기와 앱 셸 폐포 크기 기준선 +1% 초과 불가 · 금지 도메인 신규 도달 금지 · 새 지연 무효화 금지 | 약 3~5초 |
| `check:studio-bundle` (기존, 빌드 후) | 실제 번들의 구조·예산·eager-dynamic | [`bundle-gate.md`](../perf/bundle-gate.md) | 빌드 필요 |

두 가드레일은 빌드 없이 소스만 읽는다. 빌드 후 게이트를 대체하지 않고 **PR 시점의 선행 지표**를 준다.

실행 위치(2026-10-15 기준):

- 로컬: `pnpm run check:source-file-size`, `pnpm run check:studio-eager-graph`
- `pnpm run validate:architecture` 안에 두 검사가 연결되어 있다. `.husky/pre-push`가 이 명령을 이미 실행하므로 **푸시 전에 자동으로 돈다**.
- CI: `.github/workflows/ci.yml`의 `typecheck` job(Core preflight and application typecheck)에서 의존성 설치 전에 파일 크기 래칫, 설치 직후 typecheck 이전에 진입 그래프 래칫이 돈다.
  `static` job의 product shard도 `validate:architecture`로 한 번 더 실행하므로 로컬 `pnpm run validate:architecture`와 CI가 같은 검사를 한다.
- 전체 시험(`pnpm test`, Full Test Diagnostic): `apps/web/src/shared/lib/__tests__/file-size-ratchet.test.ts`가 같은 판정 함수(`scripts/lib/source-file-size-*.mjs`)와 같은 기준선을 읽어 규칙을 한 번 더 확인한다. 이 시험은 상한이나 기준선을 따로 두지 않는다.

파일 크기 규칙의 기준선은 `scripts/source-file-size-baseline.json` 한 곳이다. 2026-10-15 이전에는 위 시험이 웹 소스만 "새 파일 1,000줄"과 별도 기준선(`file-size-ratchet-baseline.json`, 327개)으로 세었다(폐기된 옛 방식).
그 기준선은 이 게이트가 생긴 뒤에도 갱신되지 않아 기록 줄 수를 넘긴 파일 48개와 천장이 없는 1,000줄 초과 파일 13개가 쌓였고, CI가 지키는 이 게이트와 서로 다른 말을 했다. 그래서 시험이 이 게이트의 판정 함수와 기준선을 그대로 읽도록 합쳤다.
합친 결과 새 파일 상한은 1,000줄에서 800줄로 조여졌고 대상은 웹 소스에서 저장소 전체 소스로 넓어졌다. 이 게이트의 규칙과 판정 코드는 바꾸지 않았고, 기준선은 줄어든 4개 파일의 값만 `--tighten`으로 낮췄다.
옛 기준선보다 천장이 높은 파일 48개는 모두 옛 시험이 이미 넘겨서 실패시키던 파일이며, 새 기준선이 실측 줄 수(여유분 0)로 기록한 값을 따른다.

두 가드레일은 소스와 `git ls-files`만 필요하고 `docs/`나 정적 자산을 읽지 않는다. 파일 크기 래칫은 의존성 설치 전에도 실행되며,
CI의 sparse checkout(자산·`docs/` 제외)에서 체크아웃되지 않은 파일은 건너뛴다. 기준선의 해당 항목은 위반이 아니라 "정리 가능"으로만 보고된다.

pre-commit에는 넣지 않았다. 커밋 훅은 "지금 스테이징한 것"만 보도록 설계되어 있고(`.husky/pre-commit` 주석), 진입 그래프 검사는 수 초가 걸려 WIP 커밋마다 지불하기에 과하다. pre-push는 이미 전체 typecheck(수 분)를 지불하므로 같은 자리의 수 초 추가는 부담이 작다.

## 3. 파일 크기 한도와 이유

규칙(`scripts/check-source-file-size.mjs`):

1. **신규·기준선에 없는 파일은 800줄 이하**여야 한다.
2. **기준선에 기록된 기존 초과 파일은 기록된 줄 수보다 늘 수 없다.** 줄어들면 `--tighten`으로 기준선만 낮출 수 있다.
3. **새 `// @ts-nocheck`를 둘 수 없다.** 기존 파일은 기준선의 `tsNoCheck` 목록에 있다.
4. `--update-baseline`은 증가를 허용하지 않는다. 새 초과 파일 등록에만 쓰고 **사유(`--reason`)가 필수**다.

800줄은 목표 크기가 아니라 **상한**이다. 파일은 책임 하나로 나눈다.
한도가 필요한 이유는 다음과 같다.

- 리뷰 가능성: 한 화면에서 훑을 수 없는 파일은 변경 의도와 부작용을 검토하기 어렵다.
- 테스트 가능성: 순수 로직이 컴포넌트·훅과 한 파일에 섞이면 단위 테스트가 DOM과 React를 끌고 온다.
- 도구: 큰 모듈은 React Compiler/Babel 코드 생성에서 deopt를 만들었고, 분리하자 풀렸다(`scripts/check-studio-bundle.mjs` 2026-07-19·2026-07-26 주석).
- 번들 경계: 지연 로딩의 단위는 모듈이다. 파일이 크면 한 기능만 필요해도 전부 따라온다.
- 병렬 작업: 한 파일을 여러 작업이 동시에 고치면 충돌과 의도치 않은 동작 변경이 늘어난다.

측정 규칙(오탐을 막기 위해 한 가지로 고정):

- 대상: git이 추적하거나 아직 스테이징하지 않았지만 무시되지 않은 `.ts` `.tsx` `.mts` `.mjs` `.cjs`.
- 제외: `*.test.*` · `*.spec.*` · `*.generated.*` · `generated/` · `*.d.ts` · `vendor/` · `third_party/` · `fixtures/` · `__fixtures__/` · `node_modules/`.
- 줄 수: 개행(LF) 개수이며 마지막 줄이 개행 없이 끝나면 1을 더한다. CRLF 파일도 같은 값이다.
- 작업트리에 없는 파일(sparse-checkout, 삭제)은 건너뛰고 기준선의 해당 항목은 "정리 가능"으로만 알린다.

출력 예(실패, 합성 변경):

```text
소스 파일 크기 래칫 실패 (상한 800줄 · 대상 10,094개 · 599ms)
위반 3건
 1. apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx
      29,396줄 > 기준선 29,365줄 (+31줄). 기록된 초과 파일은 늘 수 없습니다.
 2. apps/web/src/domains/creator/new-panel.ts
      새 파일/기준선 밖 파일이 900줄입니다 (상한 800줄, 초과 +100).
 3. apps/web/src/domains/creator/fresh.ts
      새 // @ts-nocheck 입니다. 기준선 목록 밖의 파일에는 둘 수 없습니다.
고치는 방법 … 분할 가이드: docs/engineering/code-structure-and-bundle-patterns.md
요약  … 상위 초과 파일 10개와 총 초과 줄 수
```

## 4. 기능 슬라이스 구조

새 기능은 파일 종류별로 나눈다. 한 파일은 한 종류의 책임만 갖는다.

| 종류 | 책임 | 하지 않는 일 | 이 저장소의 좋은 예 |
| --- | --- | --- | --- |
| 순수 로직 `.ts` | 계산·검증·정규화. React·DOM·전역 상태 없음 | UI 문구, 부작용 | `apps/web/src/domains/creator/studio-release-schedule.ts` (릴리스 플래너) |
| 상태 훅 `use*.ts` | 상태 소유, 타입이 있는 옵션 인자, 반환 타입 명시 | 렌더링, 거대 클로저 공유 | `apps/web/src/domains/creator/studio-cuttoon-editor/runtime/useStudioDocumentAccessRuntime.ts` |
| 표시 컴포넌트 `.tsx` | props로만 그리기, 접근성 이름·상태 표시 | 데이터 로딩 정책, 전역 접근 | `apps/web/src/domains/creator/StudioLazySurfaceFallback.tsx` |
| 타입·상수 | 계약 | 로직 | `*-types.ts`, `*-constants.ts` |
| 지연 경계 파일 `*-loader.ts` | `import()`와 preload만. 캐시된 Promise와 실패 시 재시도 | 비즈니스 로직 | `studio-background-3d-loader.ts`, `studio-release-schedule-loader.ts` |

규칙:

- **지연 경계 파일은 구현을 정적 import하지 않는다.** 타입만 `import type`으로 가져온다.
- **가볍고 첫 화면에 필요한 메타데이터와 무거운 구현을 다른 파일에 둔다**(§9).
- 훅 모듈의 상한은 이미 `studio-cuttoon-editor/runtime/`에서 300줄로 고정되어 있다(`apps/web/src/domains/creator/studio-host-architecture-ratchet.test.ts`). 새 추출도 이 모양을 따른다.
- 배럴(`index.ts`)을 새로 만들지 않는다(§7).
- 새 파일은 800줄 상한과 위 종류별 책임을 모두 지킨다. 한 종류에 책임이 둘 이상이면 그 지점에서 나눈다.

## 5. 거대 파일 분해 절차

원칙은 **동작 보존**이다. 사용자에게 보이는 동작, 공개 API, 테스트 기대가 바뀌면 분해가 아니다.

**절차: 추출 → 재노출 → 호출처 이전 → 재노출 제거**

1. **완료 조건과 검증 명령을 먼저 정한다.** 관련 테스트 목록, 범위 타입체크, 전후 크기 측정 명령(§10)을 적는다.
2. **추출.** 응집된 한 단위(순수 로직 → 훅 → 컴포넌트 순서가 쉽다)를 새 파일로 옮긴다. 로직은 그대로 옮기고 이름과 시그니처를 바꾸지 않는다.
   새 파일은 800줄을 넘기지 않고 순환 import를 만들지 않는다.
3. **재노출.** 원래 모듈에서 `export { name } from "./new-file"`로 다시 내보내 호출처를 깨지 않는다.
   단, 원래 모듈이 정적 import 대상이므로 **재노출은 정적 간선**이다. 지연 로딩 대상으로 옮긴 코드를 재노출하면 지연이 무효화된다(§6.7).
4. **호출처 이전.** 필요한 곳부터 점진적으로 새 경로로 바꾼다. 한 번에 전부 바꾸지 않는다.
5. **재노출 제거.** 모든 호출처가 이전된 뒤에만 제거한다.
6. **기준선 하향.** `--tighten`으로 줄어든 값만 잠그고 전후 지표를 커밋 본문에 남긴다.

한 커밋은 응집된 한 단위의 추출 또는 전환이다. 커밋마다 관련 테스트와 범위 타입체크로 증명한다.

**하지 말아야 할 것**

- 이동과 동작 변경을 한 커밋에 섞기. 문제가 생겼을 때 원인을 분리할 수 없다.
- 새 `// @ts-nocheck`·`any` 호스트 백으로 추출하기(§8). 줄 수는 줄어도 타입 안전성과 최적화가 사라진다.
- 거대 파일 안에 새 로직 추가하기. 새 파일에 두고 거대 파일에는 호출만 남긴다.
- 배럴 신설로 호출처를 한 번에 모으기(§7).
- 드로잉 입력 경로(브러시·포인터·캔버스 합성 핫패스)를 번들 바이트 때문에 쪼개거나 지연 로드하기.
- 대상 목록 밖의 광범위한 포맷 변경·파일 이동. 다른 작업과 충돌한다.
- 실패하는 테스트를 skip하거나 삭제해 통과시키기.

## 6. 지연 로딩 패턴

### 6.1 지연 경계는 사용자 의도 시점에 둔다

도구 선택, 패널 열기, 내보내기 실행처럼 **사용자가 명시적으로 요청한 시점**에 둔다.
마운트 직후 `await import()`나 조건 없이 렌더되는 `React.lazy`는 지연이 아니라 순서만 늦춘 eager다
(`docs/perf/bundle-gate.md` §4: manifest는 dynamic이라 불렀지만 입력 없이 기동 중 로드된 청크 55개).

### 6.2 라우트 단위: `lazyRetry`

`apps/web/src/shared/lib/lazy-retry.ts`는 `React.lazy`에 배포 청크 실패 복구(`chunk-load-recovery.ts`)를 붙인다.
라우트 그룹이 사용한다: `apps/web/src/app/routes/groups/market.routes.tsx`.

```tsx
const MarketHomePage = lazyRetry(
  () => import("@/domains/market/pages/MarketHomePage").then((module) => ({ default: module.MarketHomePage })),
  "MarketHomePage",
);
```

`chunkId`는 같은 화면의 다른 청크와 겹치지 않게 컴포넌트 이름을 쓴다.

### 6.3 패널·도구 단위: 로더와 preload를 한 쌍으로

`apps/web/src/domains/creator/studio-intent-lazy-loader.ts`의 `createStudioIntentLazyLoader`는
`load`(진행 중·완료 요청 공유, 실패 시 캐시 초기화)와 `preload`(실패를 삼키는 예열)를 같은 요청으로 묶는다.

```ts
// studio-all-tools-catalog-loader.ts
const loader = createStudioIntentLazyLoader(() => import("./StudioAllToolsCatalog"));
export const loadStudioAllToolsCatalog = loader.load;
export const preloadStudioAllToolsCatalog = loader.preload;
```

### 6.4 React 밖 런타임: 캐시된 Promise + 실패 시 재시도

`studio-background-3d-loader.ts`(3D 배경 편집기), `studio-release-schedule-loader.ts`, `studio-publication-analytics-loader.ts`가 같은 모양이다.
필요한 순간까지 무거운 엔진을 진입 그래프 밖에 둔다. 빈 상태처럼 엔진이 필요 없는 경로는 엔진을 로드하지 않고 처리한다
(`createEmptyStudioReleaseScheduleSnapshot`).

### 6.5 프리로드: 의도 신호에서만

- hover, 키보드 focus, 터치 pointer처럼 **곧 쓸 것이 확실한 신호**에서 예열한다. 예: `studio-main-menu-intent-preload.ts`.
- 예열은 코드만 불러온다. 문서를 읽거나 바꾸지 않는다. 실패는 삼키고, 실제 활성화에서 `lazyRetry` 오류 경계가 다시 시도한다.
- **idle 시점 프리로드는 첫 입력 지연을 만들 수 있다.** 네트워크·메인 스레드 경합이 그리기와 겹치지 않는지 측정한 뒤에만 쓰고,
  드로잉 중에는 쓰지 않는다. 입력 핸들러 안에서 `await import()`로 입력을 막지 않는다.

### 6.6 로딩 폴백과 오류 안내

비동기 화면에는 loading·empty·error·retry를 명시한다(`apps/web/AGENTS.md`).
`apps/web/src/domains/creator/StudioLazySurfaceFallback.tsx`는 `role="status"`, `aria-live`, 스크린 리더용 라벨, 스켈레톤을 제공하는 기준 구현이다.
청크 로드 실패는 `lazyRetry`가 한 번 자동 복구하고, 그래도 실패하면 오류 경계가 재시도를 안내한다.

### 6.7 지연이 무효화되는 흔한 원인

진입 그래프 가드레일이 "지연 선언이 정적으로도 도달해 무효화됨"으로 보고하는 유형이다.

| 원인 | 설명 |
| --- | --- |
| 같은 모듈의 정적 import | 어딘가의 `import { x } from "./m"` 하나가 `import("./m")`의 분할 효과를 없앤다. 예: `studio-opfs-recovery-journal.ts`는 `studio-autosave-opfs-session.ts`가 정적으로, `studio-storage-recovery-runtime.ts`가 동적으로 가져온다. |
| 재노출 | 추출한 모듈을 원래 모듈에서 `export … from`으로 재노출하면 정적 간선이 된다. |
| 배럴 경유 | 도메인 배럴이 페이지를 정적 export하면, 배럴을 import한 쪽의 청크가 페이지 전체를 끌고 가 라우트의 `lazyRetry`가 소용없어진다(§7). |
| 타입 때문에 들어오는 값 import | `import { type X } from "./heavy"`는 `verbatimModuleSyntax`에서 `import "./heavy"`로 남는다. `import type { X }`를 쓴다. |
| 레지스트리가 구현을 직접 import | 메타데이터 표가 모든 구현을 가져온다(§9). |

타입 위치의 `typeof import("./x")`는 런타임 간선이 아니다. 모듈 타입이 필요하면 이 형태가 안전하다
(`apps/web/src/domains/creator/studio-page-editor-runtime-loaders.ts`).

## 7. 배럴 파일과 정적 import가 진입 그래프를 키우는 방식

번들러는 정적 `import`·`export … from`을 따라 모듈을 같은 청크 그래프에 묶는다.
**배럴(`index.ts`)은 그 간선을 한 곳에 모아 두는 파일**이라, 하나만 필요해도 배럴이 다시 내보내는 모두가 후보가 된다.
트리 셰이킹이 부수효과 없음을 증명하지 못하는 모듈은 그래프에 남는다. 이 저장소의 지표는 그래서 보수적 **상한**이다.

실측(2026-10-15, 커밋하지 않은 임시 파일로 합성한 회귀): Studio 어댑터 쪽에서 `apps/web/src/domains/market/index.ts` 배럴을
정적 import한 한 줄이 모듈 176개, 원본 1,794 KiB를 진입 그래프에 더했고 시장 도메인 모듈 88개가 금지 도메인 도달로 보고되었다.
시장 페이지는 앱 라우트가 `lazyRetry`로 따로 부르는데도, 배럴을 정적으로 가져온 쪽의 청크가 페이지 전체를 끌고 간다.
가드레일은 이 한 줄(`원인 import`)과 최단 경로를 함께 출력한다.

규칙:

- 도메인 배럴(`domains/*/index.ts`)을 Studio 쪽에서 import하지 않는다. 필요한 파일을 정확한 경로로 import한다.
- 새 배럴을 만들지 않는다. 호출처 편의를 위한 `export *`는 진입 그래프를 키우는 지름길이다.
- 패키지는 하위 경로 export를 쓴다. 예: `@toonstudio/studio-engine-registry/renderer-roles`, `@toonstudio/core/creator-role`.
- 크기가 큰 생성 데이터·카탈로그는 메타데이터와 본문을 나누고 본문을 지연 경계 뒤에 둔다.
- 부수효과가 있는 모듈(전역 등록, 이벤트 리스너, 모듈 로드 시 계산)은 정적 import 대상이 되기 쉽다. 부수효과를 명시적 `init()`으로 옮긴다.

## 8. 호스트 백(`h`) 패턴과 `// @ts-nocheck`

**현황(legacy exception).** 거대 클로저를 기계적으로 쪼갠 추출 파일들이 같은 모양을 쓴다.
선두에 `// @ts-nocheck`와 `"use no memo"`가 있고, 원래 클로저 변수는 가변 객체 `h`(호스트 백)를 `any`로 받아 읽는다.
예: `apps/web/src/domains/creator/bg3d/StudioBg3dEditorSceneGraph.tsx`,
`apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-stage-pointers-up.ts`.
`bg3d` 24개와 `studio-cuttoon-editor` 26개, 합계 50개가 기준선의 `tsNoCheck`에 기록되어 있다. 컴파일러 옵트아웃과 클로저 백 목록은 `eslint.legacy-exceptions.json`이 별도로 고정한다.

**새로 쓰지 않는 이유**

- **타입 안전성이 사라진다.** `@ts-nocheck` 파일의 호출 지점은 props 누락을 타입이 잡지 못한다(`StudioAiToolPopoverBody.tsx`의 주석이 같은 문제를 기록한다).
- **React Compiler를 포기한다.** 가변 `h`를 렌더마다 재대입하므로 컴파일러가 참조 동일성만 보고 캐시하면 UI가 동결된다. 그래서 `"use no memo"`가 필요하다.
- **의존성이 보이지 않는다.** 한 객체가 수십 개의 값을 들고 다니면 파일이 무엇을 읽고 쓰는지 import와 시그니처로 알 수 없다.
- **분해가 어려워진다.** 이 패턴으로 쪼갠 조각은 서로 `h`로 묶여 있어 독립 모듈로 다시 나누기 어렵다.

**대안**

1. **타입이 있는 옵션 인자 객체 + 반환 타입 명시 훅.** `useStudioDocumentAccessRuntime`처럼 `readonly` 필드로 필요한 값만 받는다.
2. **순수 함수 + 명시적 인자.** 상태를 읽고 쓰는 곳은 호출자에 남기고 계산만 옮긴다.
3. **좁은 컨텍스트나 스토어.** 여러 조각이 공유하는 상태는 소유자를 하나로 정하고 선택자로 읽는다.
4. **상태 소유자를 슬라이스로 이동.** 거대 컴포넌트에서 상태와 그 파생 계산을 훅으로 올리고 컴포넌트는 표시만 남긴다.

**규칙**

- 새 파일에 `// @ts-nocheck`를 쓰지 않는다. 가드레일이 실패시킨다.
- 기준선의 기존 파일은 타입이 있는 훅으로 점진 치환하고, 치환이 끝난 파일은 `--tighten`으로 목록에서 뺀다.
- 광범위한 `as` 단언과 `any`는 임시 해결책으로 쓰지 않는다(루트·`apps/web` AGENTS.md, 타입 커버리지 95% 하한).

## 9. 레지스트리를 지연 provider 맵으로 만드는 방법

**문제.** 도구·패널·브러시 같은 레지스트리가 `{ id, label, component: Foo }` 배열이면 레지스트리를 import하는 순간 모든 `Foo`가 정적으로 따라온다.

**패턴.** 첫 화면에 필요한 가벼운 메타데이터와 무거운 구현(provider)을 다른 파일로 나눈다.

```ts
// studio-feature-registry.ts — 정적, 가벼움. 구현을 import하지 않는다.
export const STUDIO_FEATURE_META = [
  { id: "liquify", labelKey: "studio.feature.liquify" },
  { id: "texture-paint", labelKey: "studio.feature.texturePaint" },
] as const;
export type StudioFeatureId = (typeof STUDIO_FEATURE_META)[number]["id"];

// studio-feature-providers.ts — 지연 경계. 구현은 import() 뒤에만 있다.
import { createStudioIntentLazyLoader, type StudioIntentLazyLoader } from "./studio-intent-lazy-loader";
import type { StudioFeatureId } from "./studio-feature-registry";

const providers = {
  liquify: createStudioIntentLazyLoader(() => import("./liquify/StudioLiquifyPanel")),
  "texture-paint": createStudioIntentLazyLoader(() => import("./texture-paint/StudioTexturePaintPanel")),
} satisfies Record<StudioFeatureId, StudioIntentLazyLoader<unknown>>;

export const loadStudioFeature = (id: StudioFeatureId) => providers[id].load();
export const preloadStudioFeature = (id: StudioFeatureId) => providers[id].preload();
```

- `satisfies Record<StudioFeatureId, …>`가 provider 누락을 컴파일 시점에 잡는다.
- 메뉴·툴바는 메타데이터만으로 그리고, 선택·hover·focus 시점에 `load`/`preload`를 호출한다.
- 메타데이터 파일이 구현을 import하면 지연이 무효화된다. 진입 그래프 가드레일의 `지연 무효화`와 `금지 도메인` 검사가 이를 잡는다.
- 이 저장소에서 같은 방향의 기존 사례: `studio-page-menu-asset-loaders.ts`(메뉴가 열릴 때만 카탈로그를 로드하는 표 기반 훅), `studio-all-tools-catalog-loader.ts`.

상태: 신규 코드에는 이 패턴을 쓴다(current). 기존 레지스트리를 전환하는 일은 별도 작업이다(target).

## 10. 가드레일 사용법

### 10.1 소스 파일 크기

```bash
# 저장소 루트에서 실행. 읽기 전용, 약 0.5초.
node scripts/check-source-file-size.mjs
# 파일을 줄였다면 줄어든 값만 기준선에 잠근다(상한 이하가 된 파일은 목록에서 정리된다).
node scripts/check-source-file-size.mjs --tighten
# 정말 나눌 수 없는 신규 초과 파일만 사유와 함께 등록한다. 기록 줄 수 증가와 새 @ts-nocheck 는 거부된다.
node scripts/check-source-file-size.mjs --update-baseline --reason "<왜 800줄 안으로 나눌 수 없는지>"
# 기준선 파일을 쓰지 않고 어떤 항목이 바뀔지만 본다(--tighten, --update-baseline 과 함께 사용).
node scripts/check-source-file-size.mjs --tighten --dry-run
```

종료 코드: 0 통과 · 1 래칫 위반 또는 갱신 거부 · 2 사용법·기준선 오류. `--json`은 기계 판독 출력이다.
새 초과 파일 등록은 허용 범위를 넓히는 일이므로 사유가 필수이며 기준선의 `registrations`에 날짜·사유·파일이 남는다.

기준선 JSON을 손으로 올리는 것은 정책 우회다. 불가피하면 사유를 커밋 본문과 PR에 적고 리뷰어의 승인을 받는다.

### 10.2 Studio 진입 그래프

```bash
# 저장소 루트에서 실행. 읽기 전용, 빌드 없음, 약 3~5초.
node scripts/check-studio-eager-graph.mjs
# 전체 폴더 표와 지연 무효화 목록
node scripts/check-studio-eager-graph.mjs --verbose
# 줄어든 값만 잠근다(금지 도메인에서 빠진 모듈, 해소된 지연 무효화 포함).
node scripts/check-studio-eager-graph.mjs --tighten
# 늘어난 값을 수용한다. 늘어난 항목이 있으면 사유가 필수이고 기준선의 registrations 에 남는다.
node scripts/check-studio-eager-graph.mjs --update-baseline --reason "<왜 지연 로딩으로 막을 수 없는지>"
# 기준선 파일을 쓰지 않고 바뀔 내용만 본다.
node scripts/check-studio-eager-graph.mjs --tighten --dry-run
```

계산 방식:

- 진입점: `apps/web/index.html`의 `<script type="module">`이 가리키는 앱 셸(`apps/web/src/app/main.tsx`)과
  `apps/web/src/domains/creator/studio-legacy-editor-adapter.tsx`(`scripts/check-studio-bundle.mjs`의 `studioEntry`와 같은 모듈).
- 모듈 해석은 TypeScript `ts.resolveModuleName`과 `tsconfig.json`의 `paths`를 쓴다. 워크스페이스 패키지(`packages/*`)는 1부 소스로 센다.
- 정적 `import`·`export … from`만 따라간다. `import type`, `export type`은 제외하고 `import()`는 지연 간선이다.
  CSS·이미지·`?url`·`?worker`는 그래프 밖이고 JSON·`?raw`는 데이터 모듈로 센다.
- 크기는 최소화 전 원본 바이트다(CRLF는 LF로 센다). 번들 바이트의 대체값이 아니라 증가를 먼저 보여 주는 선행 지표다.

래칫 규칙과 금지 도메인:

1. 총 정적 도달 원본 크기는 기준선 +1%를 넘을 수 없다.
2. 금지 도메인은 기준선에 기록된 모듈 집합에 없는 파일이 새로 닿을 수 없다. 수가 같아도 교체는 새 모듈로 본다.
3. 지연 선언이 정적으로도 도달해 무효화된 모듈은 기준선 목록에 없는 것이 새로 생길 수 없다.
   판정 기준은 `import()`를 선언한 모듈이 실행될 때 이미 적재된 정적 그래프다. 앱 셸은 항상 적재되어 있고 Studio 어댑터는 그 폐포의 모듈이 실행될 때만 적재되어 있으므로,
   앱 셸이 Studio 어댑터를 `import()`로 부르는 정상 패턴은 무효화가 아니다.
4. 앱 셸(첫 진입점) 폐포 크기도 기준선 +1%를 넘을 수 없다. Studio 모듈을 앱 셸이 정적으로 가져오면 합집합 크기는 그대로인데 모든 방문자의 첫 로드가 무거워지므로 따로 막는다.
   기준선의 `modules`는 각 모듈이 어느 진입점 폐포에 속하는지(비트 1=앱 셸, 2=Studio 어댑터)를 함께 기록한다.

금지 도메인 정책은 `scripts/lib/studio-eager-graph-policy.mjs`(총 41개)다. "Studio 첫 화면에 필요 없는 도메인"만 넣는다.

| 분류 | 도메인 | 현재 도달(2026-10-15) |
| --- | --- | --- |
| 3D·캐릭터 런타임 | `creator/vrm` 13 · `bg3d` 17 · `scene3d` 4 · `scene-3d` 4 · `lift3d` 1 · `character-platform` 6 · `hybrid-dcc` 7 · `character-shaper` · `xr-webtoon` | 합계 52개 |
| 자체 표면 | `creator/virtual-space` 3 · `storyworld` · `planning` · `production-hub` · `spatial-reader` · `spatial` · `series-launch` · `growth-ip` · `promo` · `animatic` · `motion-webtoon` · `music` · `pdf-workbench` | 3개 |
| 내보내기·게시 | `creator/publish` · `review-export` · `review-share` · `review-production` · `timelapse-share` | 0개 |
| 앱 도메인 | `market` · `community` · `admin` · `fortune` · `play` · `promotion` · `monetization` · `messages` · `engagement` · `integrations` · `creator-ecosystem` · `creator-resources` · `creator-mentor-chat` · `character-interview` | 0개 |

도메인을 추가하려면 정책 파일에 접두어와 사유를 추가하고 `--update-baseline`으로 현재 도달 수를 기록한다.
현재 도달 수가 0이 아닌 도메인은 줄이는 방향(`--tighten`)만 허용된다.

실패 출력은 원인 import(기준선에 없던 첫 노드와 그 직전 노드), 최단 경로, 폴더별 증가, 고치는 방법을 한 화면에 보여 준다.
아래는 커밋하지 않은 임시 파일이 시장 모듈을 정적으로 가져오게 만든 합성 회귀의 출력 일부다.

```text
[금지 도메인 정적 도달 증가] apps/web/src/domains/market: 0개 → 88개 (기준선에 없는 모듈 88개)
  원인 import: apps/web/src/domains/creator/studio-legacy-editor-adapter.tsx  →  apps/web/src/domains/creator/zz-synthetic-probe.ts   [모듈 88개, 673.0 KiB]
  도메인 진입: apps/web/src/domains/creator/zz-synthetic-probe.ts  →  apps/web/src/domains/market/index.ts
  + apps/web/src/domains/market/components/MarketResourceDetailArticle.tsx (51.0 KiB)
  + apps/web/src/domains/market/pages/MarketBrowsePage.tsx (30.6 KiB)
  + apps/web/src/domains/market/components/MarketSellerDashboard.tsx (26.3 KiB)
  … 외 85개
  가장 큰 모듈의 최단 경로:
      apps/web/src/domains/creator/studio-legacy-editor-adapter.tsx
    → apps/web/src/domains/creator/zz-synthetic-probe.ts
    → apps/web/src/domains/market/index.ts
    → apps/web/src/domains/market/pages/MarketResourceDetailPage.tsx
    → apps/web/src/domains/market/components/MarketResourceDetailArticle.tsx
```
`원인 import`는 기준선에 없던 첫 모듈로 들어오는 import 한 줄이고, `도메인 진입`은 금지 도메인으로 처음 들어가는 간선이다.

### 10.3 기준선 하향 절차

분해·지연 로딩 전환 PR이 끝나기 전에 다음을 실행한다. 하향은 상향과 한 커밋에 섞지 않는다.

```bash
node scripts/check-source-file-size.mjs --tighten
node scripts/check-studio-eager-graph.mjs --tighten
git add scripts/source-file-size-baseline.json scripts/studio-eager-graph-baseline.json
```

커밋 본문에 같은 명령으로 잰 전후 값(줄 수, 정적 도달 모듈 수·MiB, 금지 도메인 도달 수, 지연 무효화 수)을 남긴다.

### 10.4 한계

- 정적 도달은 번들러가 제외하지 못할 수 있는 모듈의 **상한**이다. 트리 셰이킹, 분할 휴리스틱, 압축은 반영하지 않는다.
- `import(변수)`처럼 지정자가 리터럴이 아닌 동적 import는 간선으로 세지 않는다(`--verbose`와 `--json`에 개수만 보고한다).
- Worker(`?worker`, `new Worker(new URL(...))`)와 CSS·자산은 그래프 밖이다. Worker 고립 계약은 `check:studio-bundle`이 판정한다.
- 최종 판정은 빌드 후 `pnpm run check:studio-bundle`이다. 이 가드레일이 통과해도 그 게이트가 실패할 수 있고, 반대도 가능하다.
- 교차 검증(2026-10-15, 일회성 수동 확인): `scripts/check-studio-bundle.mjs`가 "Studio 정적 그래프에 있으면 실패"로 고정한 모듈 패턴 37개
  (SVG/PSD 엔진, 선택적 패널·오버레이, 3D 런타임, 릴리스·분석 엔진 등)는 이 그래프에도 하나도 도달하지 않았다. 소스 기준 그래프와 빌드 기준 그래프가 서로 모순되지 않는다는 뜻이며 자동화된 검사는 아니다.
  이 가드레일은 실제 빌드 산출물과 대조하지 않았으므로(전체 빌드는 이 작업에서 실행하지 않았다) 절대 바이트 값이 아니라 기준선 대비 변화를 신뢰한다.

## 11. PR 점검표

- [ ] 새 파일과 수정한 파일이 800줄 이하인가. 기록된 초과 파일을 고쳤다면 줄 수가 늘지 않았는가(`pnpm run check:source-file-size`).
- [ ] 새 `// @ts-nocheck`, `any` 호스트 백, 광범위한 `as` 단언이 없는가. 파일은 순수 로직 · 훅 · 표시 컴포넌트 · 타입·상수 · 지연 경계 중 한 종류인가.
- [ ] 새 정적 import가 Studio 진입 그래프로 들어오는가. 3D·내보내기·패널 같은 무거운 코드는 사용자 의도 시점의 `import()` 뒤에 있는가(`pnpm run check:studio-eager-graph`).
- [ ] 타입만 필요한 import는 `import type`인가. 배럴 대신 정확한 파일 경로를 import하는가.
- [ ] 지연 경계에 loading · error · retry 상태와 접근성 이름이 있는가. 청크 실패 때 `lazyRetry` 또는 동등한 재시도가 있는가.
- [ ] 프리로드는 hover·focus·터치 의도에서만 시작하고 입력 핸들러를 막지 않는가. 드로잉 핫패스를 건드리지 않았는가.
- [ ] 분해라면 로직을 그대로 옮기고 원래 모듈에서 재노출했는가. 이동과 동작 변경이 한 커밋에 섞이지 않았는가.
- [ ] 기준선 하향(`--tighten`)과 상향(`--update-baseline --reason`)을 분리해 커밋했고 상향에는 사유가 있는가.
- [ ] 크기·번들 지표를 같은 명령으로 전후 측정해 커밋 본문에 남겼는가.
- [ ] 관련 테스트와 범위 타입체크를 실행했고, 실행하지 않은 검증을 한 것처럼 쓰지 않았는가.

## 12. 관련 자료

- 규칙 정본: `scripts/check-source-file-size.mjs`, `scripts/check-studio-eager-graph.mjs`, 두 baseline JSON, `scripts/lib/studio-eager-graph-policy.mjs`
- 배선 계약 테스트: `scripts/code-structure-gates-contract.test.mjs`
- 빌드 후 게이트와 eager-dynamic 판정: [`../perf/bundle-gate.md`](../perf/bundle-gate.md)
- 호스트 구조 래칫: `apps/web/src/domains/creator/studio-host-architecture-ratchet.test.ts`
- 프런트엔드 계층 규칙: [`../architecture/frontend-layered-architecture.md`](../architecture/frontend-layered-architecture.md)
- Studio 현재 경계: [`../architecture/studio-current-boundaries.md`](../architecture/studio-current-boundaries.md)
