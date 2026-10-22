# i18n 가이드 — 신규 표면은 키 기반 하나로 고정

이 문서는 `apps/web`의 다국어(i18n) 방식 계약이다. 새 화면·새 네임스페이스를
만들 때 여기 적힌 방식 하나만 쓴다. 계약은
`apps/web/src/shared/lib/__tests__/i18n-namespace-contract.test.ts`가
자동으로 검사하므로, 어기면 테스트가 실패한다.

## 1. 계약 요약

- **신규 표면의 모든 사용자 문구는 키 기반**으로만 작성한다.
  정본은 `apps/web/public/i18n/app/<네임스페이스>/<로케일>.json`이고,
  화면에서는 `useT()`(`@/shared/lib/i18n`)의 `t("네임스페이스.키")`로 해소한다.
- **ko/en 두 로케일을 사람이 직접 작성**하는 것이 정본 쌍이다.
  나머지 73개 로케일은 동기화 스크립트가 채우고, 실제 번역은 기존 런타임
  번역 파이프라인이 담당한다. 코드 안에 번역문을 지어 넣지 않는다.
- **인라인 쌍 방식은 신규 사용 금지**다. `useBilingual`,
  `defineBilingualText` 등 `i18n-bilingual-copy.ts`의 문구 작성 API는
  기존 표면 유지용으로만 남는다(§5).

왜 하나로 고정하는가: 인라인 쌍은 ko/en만 코드에 남아 나머지 로케일이
런타임 기계번역에만 의존하고, 문구가 카탈로그·커버리지 검사에서 보이지
않는다. 방식이 섞인 것이 하드코딩 문구가 계속 재생산되는 구조적 원인이었다.

## 2. 정본 구조

| 층 | 위치 | 역할 |
| --- | --- | --- |
| 정본 사전 | `public/i18n/app/<네임스페이스>/<로케일>.json` | 네임스페이스당 75개 로케일 파일. ko/en은 직접 작성 |
| 런타임 매니페스트 | `src/shared/lib/i18n-asset-manifest.ts`의 `APP_I18N_NAMESPACES` | 런타임이 불러올 네임스페이스 목록. 디렉터리와 정확히 일치해야 함 |
| 내장 사전 | `src/shared/i18n/generated/i18n-app-builtins.json` | ko/en을 셸에 컴파일한 생성물. 손으로 고치지 않음 |
| 로케일 카탈로그 | `src/shared/lib/i18n-locale-catalog.ts` | 로케일 목록·번역 비율의 생성물. 손으로 고치지 않음 |
| 해소 | `useT()` → `resolveTranslation` | 폴백 체인은 en → ko 순. 키가 없으면 폴백 문구가 보임 |

키 규칙:

- 키는 반드시 자기 네임스페이스 접두사로 시작한다: `guide.axes.title`.
- 접두사 뒤는 점으로 나눈 camelCase 구간으로 쓴다: `toast.bookmarkAdded`.
- 하나의 키는 하나의 네임스페이스에만 속한다. 다른 표면과 공유할 문구는
  소유 네임스페이스(예: `common`, `app`)에 두고 그 키를 참조한다.

## 3. 신규 네임스페이스 절차

1. `public/i18n/app/<네임스페이스>/` 디렉터리를 만들고 **ko.json과 en.json을
   함께** 작성한다. 한쪽만 먼저 만드는 것은 계약 위반이다.
2. `i18n-asset-manifest.ts`의 `APP_I18N_NAMESPACES`에 네임스페이스를
   등록한다(알파벳 순 유지). 디렉터리만 있거나 등록만 있으면 테스트가 실패한다.
3. 나머지 로케일 파일을 채운다:
   `node scripts/sync-i18n-legacy-assets.mjs`
   (병합 레거시 자산까지 한 번에 동기화된다. 로케일 파일이 아직 없는
   네임스페이스는 이 단계가 새로 만들고, 미번역 로케일은 영문 폴백 값을
   받으며, 임의 번역문을 지어 넣지 않는다. 같은 규칙이 app과 studio 묶음의
   모든 로케일 팩에 적용되고 admin은 ko/en 정본만 갖는다. 평면 자산은 항상
   네임스페이스 병합 결과로 다시 쓰이므로, 평면 `<locale>.json`을 직접 고쳐도
   다음 동기화에서 사라진다 — 문구는 네임스페이스 파일에서 고친다.)
4. 생성물을 재생성한다:
   - `node scripts/generate-i18n-builtins.mjs` — 내장 사전
   - `node scripts/generate-app-i18n-catalog.mjs` — 로케일 카탈로그
5. 화면에서는 키로만 참조한다:
   `const t = useT(); … {t("네임스페이스.키")}`
   동적 값이 있으면 `t("네임스페이스.키", { count })` 형태의 템플릿 변수를 쓴다.
   불러오기·복구 효과나 콜백 안에서 실패 안내를 만들 때 `t`를 의존성에 넣으면
   언어를 바꿀 때 그 효과가 다시 돌아 같은 자원을 다시 불러온다(`t`는 로케일마다
   하나로 캐시돼 언어가 바뀔 때만 달라진다). 그런 곳에서는 호출한 시점의 언어로
   바로 풀어 주는 `translateNow("네임스페이스.키", …)`(`@/shared/lib/i18n`, 훅이
   아니라서 의존성이 필요 없다)를 쓰고, 화면에 그리는 문구에는 `t`를 쓴다.
6. 계약 테스트로 확인한다(§6). 이 순서까지 끝나야 네임스페이스 신설이
   완료된 것이다.

## 4. 기존 네임스페이스에 키를 추가할 때

1. 소유 네임스페이스의 ko.json·en.json에 **같은 키를 동시에** 추가한다.
2. §3의 3~4단계(동기화·재생성)를 그대로 실행한다. 이 단계를 빼면 다른
   로케일 자산과 카탈로그가 드리프트해 기존 테스트가 실패한다.
3. 하드코딩 문구·인라인 쌍으로 우회하지 않는다. 로딩·실패·에러 문구도
   예외 없이 키로 쓴다.

## 5. 금지 목록과 예외

신규 표면에서 사용 금지(`i18n-namespace-contract.ts`의
`FORBIDDEN_INLINE_BILINGUAL_APIS`가 정본 목록):

- `useBilingual`, `useBilingualLocalizer`
- `defineBilingualText`, `defineBilingualAutoText`, `defineBilingualMap`,
  `defineStaticSourceText`
- `translateBilingual*` 계열, `translateAuthoredSourceText`,
  `translateCurrentStaticSourceText`, `translateLocaleBranchForLocale`,
  `translateCurrentLocaleBranch` 등 쌍·분기 해소 함수

금지 아님: `useBilingualI18nRevision`(재렌더 구독일 뿐 문구를 만들지 않음),
`formatI18nTemplate`(해소된 문구의 자리표시자 서식), 로케일 조회 함수.

예외는 하나뿐이다.

- **기존 인라인 쌍 표면**: 이미 인라인 쌍으로 작성된 표면은 그대로 둔다.
  그 표면을 고칠 때도 새 문구는 키로 추가하는 것이 원칙이며, 표면 전체의
  이관은 별도 작업으로 진행한다.

역방향 레거시 네임스페이스 3개(`contact`·`fortune`·`play`)는 ko/en
JSON 없이 6개 로케일만 게시하던 구조였으나, 2026-10-14에 정본 쌍과 전 로케일
자산을 게시해 통일됐다. 계약 테스트의 예외 목록(`LEGACY_REVERSED_NAMESPACES`)은
비어 있으며, **새 예외를 이 목록에 추가하는 것은 금지**다. 역방향 구조로
되돌아가는 네임스페이스는 예외로 숨기지 않고 계약 검사에서 실패해야 한다.

불가피하게 한 줄만 예외가 필요하면 그 줄에 `i18n-exempt` 주석과 사유를
남긴다. 파일 단위·표면 단위 면제는 없다.

## 6. 검증

- 계약 테스트: `i18n-namespace-contract.test.ts` — 네임스페이스 계약,
  매니페스트 정합, 신규 표면 파일의 인라인 쌍 부재를 검사한다.
  새 표면의 파일은 이 테스트의 `GUARDED_NEW_SURFACE_FILES`에 등록하는
  것까지가 신설 절차의 일부다.
- 함께 돌려야 하는 기존 검사: `i18n-locale-assets.test.ts`(카탈로그
  드리프트·자산 커버), `i18n-asset-manifest.test.ts`(평면 자산과 네임스페이스
  자산의 일치), `i18n-source-coverage.test.ts`(전 소스 `t()` 키가
  사전에 존재 — 지연 번들로 분리한 네임스페이스는 이 테스트가 가져오는
  등록 모듈 목록에도 더해야 한다), `generate-i18n-builtins.mjs --check`(내장
  사전 드리프트).
- 문구 가드: `shared/language/*.guard.test.ts`(용어·말투·에러 문구)는 평면
  `ko.json`을 읽는다. 동기화 뒤의 평면 자산이 가드를 통과해야 하므로 문구는
  네임스페이스 파일에서 고치고 §3의 동기화를 다시 돌린다. 가드가 잡은 문구는
  가드를 고치지 말고 문구를 고친다. 실패 단어가 들었지만 오류가 아닌 동작
  라벨만 가드의 예외 목록에 사유와 함께 등록한다.
- 번역 하한: 카탈로그의 번역 비율은 영어 기준 키 중 영어 원문과 다른 값을
  가진 키의 비율이다. ko/en에만 쓴 키는 나머지 로케일이 영문 폴백으로 받으므로
  분모만 키워 비율을 낮춘다. 비율이 하한(0.5) 아래인 로케일은 `LanguagePicker`의
  기본 목록(검색어 없음)에서 빠지고 검색으로만 찾는다. 번역 로딩과 폴백 동작은
  달라지지 않는다. 2026-10-15 기준 ko(0.9786)·en(1)을 뺀 73개 로케일이
  0.40~0.44로 하한 아래이며, `i18n-locale-assets.test.ts`의
  `BELOW_TRANSLATED_FLOOR`가 이 목록을 동결한다. 번역을 채워 하한을 넘은
  로케일은 목록에서 빼야 테스트가 통과한다. 새 로케일이나 ko·en이 하한 아래로
  내려가면 목록에 더하지 말고 원인을 고친다.
- 생성기 부산물: `generate-app-i18n-catalog.mjs`는 카탈로그와 함께
  `i18n-locale-completeness-report.json`도 쓰지만 정본이 아니어서 추적하지
  않는다(`.gitignore`). 커밋에 넣지 않는다.
