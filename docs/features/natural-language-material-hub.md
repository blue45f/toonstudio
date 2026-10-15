# 자연어 소재·자료 허브 (문장으로 소재 찾기)

작성 기준일: 2026-10-15 · 대상 라우트: `/research`, `/market/browse`

이 문서는 장면을 문장 하나로 적으면 필요한 종류의 소재·자료를 권리와 출처와 함께 모아 보여 주는 기능의 **현재 구현(current)** 과 **목표(target)** 를 나눠 적는다. 구현되지 않은 것을 현재 기능처럼 쓰지 않는다.

## 1. 상태 요약

| 영역 | 상태 | 근거 |
| --- | --- | --- |
| 규칙 기반 계획기 `planMaterialIntent` | current | `packages/core/src/material-intent-plan.ts`, `material-intent-lexicon.ts`, `material-intent-plan.test.ts` |
| `/research` "문장으로 소재 찾기" 패널 | current | `apps/web/src/domains/creator-resources/material-hub/` |
| 마켓 "문장으로 찾기" | current | `apps/web/src/domains/market/components/MarketSentenceSearch.tsx`, `models/market-sentence.ts` |
| "AI로 다듬기"(선택) | current, 앱 계층 주입 | `apps/web/src/app/routes/groups/research-home-route.tsx`, `research-material-refine.ts`, `material-hub-refine.ts` |
| 스튜디오로 보내기 | current(보내는 쪽만) | 스튜디오 쪽에서 `MATERIAL_DROP_KEY` 를 읽는 화면은 아직 없다 → 8장 |
| 서버 쪽 문장 단위 일괄 검색 API | target | 현재는 브라우저가 제공처별로 기존 검색 API 를 부른다 |
| AI·번역 모델로 의미 검색 | target | 계획기는 사전과 규칙만 쓴다 |

새 서버 API, 새 DB 마이그레이션, 새 런타임 의존성은 없다. 이 기능이 부르는 서버 경로는 모두 이미 있던 것이다.

## 2. 사용자 흐름 (current)

### `/research`

1. 문장을 입력한다(예: `비 오는 골목 야경`, `조선시대 한복 입은 인물 포즈`, `1980년대 서울 시장 사진`). 입력하는 동안에는 계획기(순수 함수)만 돌고 "이렇게 이해했어요"가 바뀐다. 어떤 제공처도 부르지 않는다.
2. 이해 칩을 고친다. 종류(렌즈) 칩, 읽은 단서 칩, 사전에 없는 낱말 칩은 켜고 끌 수 있고, 렌즈별 검색어는 직접 고칠 수 있다. 고치는 것만으로는 아무것도 부르지 않으며, 결과와 이해가 어긋나면 "바꾼 대로 다시 찾기" 안내가 뜬다.
3. `소재 찾기`(Enter 또는 버튼)를 제출하면 그때 렌즈별 선두 제공처만 부른다.
4. 결과는 렌즈(종류) → 제공처 순으로 묶인다. 제공처마다 로딩·빈 결과·오류와 `다시 시도`가 따로 있고, 처음에는 제공처당 4개만 보여 주며 `더 보기`로 펼친다.
5. 카드에서 할 수 있는 일: 원문 열기, 장면 보드에 담기/빼기, (CC0 3D·재질만) 스튜디오로 보내기. 카드 묶음 아래에서 마켓 열기, 내 소재장(3D 포함) 열기, 브리프 내보내기를 할 수 있다.
6. `?mq=<문장>` 으로 들어오면 입력창만 채우고 자동으로 찾지 않는다(마켓의 "소재·자료 허브에서 같은 문장으로 찾기" 링크가 이 형식을 쓴다).

### 마켓 `/market/browse`

검색창 아래 `문장으로 찾기` 토글을 열고 문장을 입력하면 "이렇게 이해했어요" 칩(종류·태그·라이선스·검색어)이 보인다. 칩은 하나씩 뺄 수 있고, `이 조건으로 찾기`를 누르면 그때 기존 URL 필터 `q`·`kind`·`license`·`tag` 가 바뀐다. 새 API 호출은 없다. 문장은 새 검색 의도로 보고 네 필터를 통째로 바꾸며 `publisher`·`layout` 은 건드리지 않는다. 검색어가 없으면 관련도순 정렬도 풀어 기본 정렬로 돌린다.

## 3. 계획기 계약 (current)

위치: `packages/core/src/material-intent-plan.ts`(`@toonstudio/core/material-intent-plan` 으로 가져온다). 순수 함수이고 결정적이며 네트워크·AI·시간·난수를 쓰지 않는다. 단서 사전은 `material-intent-lexicon.ts` 이고, 한글 낱말의 영문 검색어는 기존 `reference-query-language` 어휘를 그대로 쓴다.

```ts
planMaterialIntent(input: string, options?: { exclude?: readonly string[] }): MaterialIntentPlan
// MaterialIntentPlan = { input, truncated, status: "empty" | "ready" | "fallback",
//   cues[], lenses[], alternatives[], market, myLibrary, unresolved[], passthrough[], conflicts[] }
```

- 입력은 NFKC 로 정규화하고 제어 문자를 공백으로 바꾸며 80자로 자른다. 잘렸는지는 `truncated` 로 알린다.
- `lenses[]` 는 `{ id, label, providers[], providerQuery, reason, confidence }` 를 가진다(제공처별 실제 검색어는 `providerQueries`). `confidence` 는 근거 단서의 세기와 충돌 수로 정한 상대 신호이며 정확도 보증이 아니다.
- `market` 은 `{ kind?, license?, tags[], query }`, `myLibrary` 는 `{ keywords[] }` 이다. `materialMarketParams()` 가 마켓 URL 필터(`q`, `kind`, `license`, `tag`)로 바꿔 주며, 마켓은 태그를 하나만 받으므로 나머지는 검색어로 돌린다.
- `unresolved[]` 는 사전에 없어 번역하지 못한 한글 낱말이다. 지우지 않고 검색어에 그대로 보존한다(최대 2개).
- `conflicts[]` 는 서로 어긋나는 단서(낮과 밤, 맑음과 비, 계절과 눈, 시대, 마켓 종류, 라이선스)를 지우지 않고 알린다. 사용자가 칩으로 끈다.
- `exclude` 는 사용자가 끈 단서 id(`weather:비` 같은 `MaterialIntentCue.id`, 또는 `free:<낱말>`)이다. 끈 단서는 점수·검색어·충돌·마켓에서 빠진다.

### 렌즈와 제공처

| 렌즈 `id` | 제공처 (우선순위 순) | 제출 직후 부르는 수 |
| --- | --- | --- |
| `3d-material` | `polyhaven`, `ambientcg` | 2 |
| `reference-art` | `met`, `aic`, `cleveland`, `rijksmuseum`, `vam` | 2 |
| `photo-archive` | `internetarchive`, `wikimedia`, `smithsonian`, `europeana`, `dpla` | 1 |
| `korean-place` | `kheritage`, `tourapi`, `korean` | 2 |
| `weather-light` | `metweather` | 1 (도시를 고른 뒤) |
| `creature` | `gbif` | 1 |
| `font` | `googlefonts` | 1 |
| `market-resource` | 제공처 호출 없음(마켓 URL 필터) | 0 |
| `my-library` | 제공처 호출 없음(저장 보드에서만 찾음) | 0 |

제공처별로 검색어를 따로 만든다. 예: `polyhaven`·`googlefonts` 는 모든 낱말이 맞아야 하므로 핵심 낱말만, `wikimedia` 는 한국어판 문서 제목이므로 한글 낱말, `metweather` 는 지원 도시 이름, `gbif` 는 한글 별칭이 통째로 있는 질의만 보낸다. 규칙으로 만든 검색어는 제공처가 받는 길이(2~80자) 안으로 맞춘다.

### 규칙의 한계 (current)

- 사전과 규칙 기반이라 사전에 없는 표현은 이해하지 못한다. 못 읽은 낱말은 `unresolved` 로 남기고 UI 가 그 낱말이 원인일 수 있다고 짚는다. 영문 인덱스 제공처에서는 한글 낱말이 결과를 비게 만들 수 있어 칩으로 끄거나 검색어를 고쳐야 한다.
- 띄어쓰기 없는 긴 문장은 모든 조각이 사전 표면형일 때만 나눈다. 일부만 알면 나누지 않는다.
- 단서 사전(`material-intent-lexicon.ts`, 2026-10-15 기준 단서 약 900개)은 장면·공간·소품·복식·인물 자세·생물·날씨·시대·지명 같은 일상 어휘를 다룬다. 다음 두 가지는 일부러 넣지 않았다. (1) `국`·`차`·`해`·`코트` 처럼 뜻이 갈리는 한 글자·동음이의 낱말, (2) 한 글자 낱말이 `국가` 같은 다른 낱말의 일부로 잘못 읽히는 경우(조사 처리는 낱말 끝에서만 한다).
- `나무` 바로 뒤에 가구·무기·건축·재질 낱말이 오면(`나무 의자`·`나무 문`·`나무 벽`) tree 가 아니라 목재(wood)로 읽는다. 3D 제공처는 모든 낱말이 맞아야 해서 `tree chair` 로는 결과가 비기 때문이다. 사이에 다른 낱말이 있으면(`나무 아래 의자`) 나무 그대로이고, 칩에는 사용자가 쓴 `나무` 가 그대로 보인다.
- `20년대` 처럼 세기가 모호한 시대는 읽지 않고 미해결 낱말로 둔다.
- 날씨 도시 목록(`MATERIAL_WEATHER_CITIES`: 서울·부산·제주·도쿄·오키나와·런던·파리·뉴욕)은 서버 `met-weather-provider` 의 지원 도시표를 복제한 것이다. 서버 표가 바뀌면 어긋날 수 있다 → target: 서버가 지원 도시를 노출해 복제를 없앤다.

## 4. 제공처 호출 정책 (current)

제공처 검색 API(`GET /api/creator-resources/search?provider=<제공처>&q=<검색어>&page=<쪽>`)는 **사용자의 명시적 행동에서만** 불린다. 서버는 클라이언트당 분당 20회로 제한하고(초과 시 429) 한 쪽에 12개를 돌려준다.

| 행동 | 제공처 호출 |
| --- | --- |
| 화면 열기, `?mq=` 로 들어오기 | 없음 |
| 입력(타이핑), 예시·최근 검색 칩 누르기 | 없음 (계획기 미리보기만) |
| 단서·종류 칩 켜고 끄기, 검색어 고치기 | 없음 |
| `소재 찾기` 제출(Enter·버튼) | 켜 둔 렌즈의 선두 제공처만. 한 번에 최대 10곳(위 표의 합) |
| 도시 고르기 | `metweather` 1회 |
| `다시 시도` | 실패한 제공처 1회 |
| `더 보기` | 이미 받은 자료를 먼저 펼친다. 다 보여 준 뒤 누르면 다음 쪽 1회 |
| `다른 제공처에서도 찾기` | 그 렌즈의 남은 제공처 |
| `바꾼 대로 다시 찾기` | 검색어가 바뀐 제공처만. `제공처::검색어` 로 받아 둔 결과는 다시 부르지 않는다 |
| `AI로 다듬기` | 제공처는 부르지 않는다(AI 호출은 6장) |
| `제공처 연결 상태 확인` 펼치기 | 상태 조회 `GET /api/creator-resources/providers` 1회(검색이 아니다). 접혀 있으면 부르지 않는다 |

화면을 떠나면 진행 중인 요청을 취소한다. 훅은 렌더링·effect 에서 요청을 시작하지 않는다. 이 정책은 `MaterialSentencePanel.test.tsx`(`제공처 호출은 명시적 행동으로만 일어난다`)가 fetch 를 가로채 확인한다.

## 5. 데이터와 권리의 경계 (current)

### 데이터

| 데이터 | 어디에 | 비고 |
| --- | --- | --- |
| 입력 문장·칩 조정 | 브라우저 메모리 | 서버로 보내지 않는다(AI 다듬기를 누른 경우만 예외, 아래 행) |
| 제공처로 나가는 값 | 렌즈별로 만든 검색어(2~80자) | 원문 문장 전체가 아니다. 사전에 없는 낱말은 검색어에 그대로 들어갈 수 있다 |
| 최근 검색 | `localStorage` `toonstudio.material-recent-searches.v1` (최대 5개) | `기록 지우기`로 삭제 |
| 장면 보드 | 기존 리서치 저장 보드(브라우저 `localStorage`, 계정별 분리) | 이 기능이 새 저장소를 만들지 않는다 |
| 스튜디오 전달 | `sessionStorage` `toonstudio.material-drop.v1` (`MATERIAL_DROP_KEY`) | 탭 세션 한정. 계약은 바꾸지 않았다 |
| 브리프 | 사용자가 누르면 Markdown 파일로 내려받음 | 서버로 보내지 않는다 |
| AI 다듬기에 보낸 문장 | 버튼을 누른 때만, 공유 무료 풀(서버) 또는 사용자가 연결한 개인 AI | 응답은 입력창에만 넣고 저장하지 않는다 |

### 권리

- 모든 카드는 이용 상태 배지(CC0·CC BY 4.0·REF·BOOK·META)와 문구, 제공기관 표기, 조회일, 원문 링크(`rel="noopener noreferrer"`)를 보여 준다. 문구는 기존 `resourceUsageLabel`·`resourceUsageDescription` 을 그대로 쓰고 완화하지 않는다.
- 스튜디오로 보낼 수 있는 것은 CC0 로 확인된 Poly Haven·ambientCG 의 3D·재질·HDRI 뿐이다. 레퍼런스 전용(`reference-only`)·메타데이터 자료는 보내지 않고 보드에 담아 참고하도록 안내한다.
- 브리프는 기존 `attributionMarkdown` 으로 담은 자료의 출처·이용조건을 적는다. **권리 허가서나 법률 검토를 대신하지 않는다.** 초상·상표 등 다른 권리는 사용자가 따로 확인해야 한다.
- 마켓의 라이선스 필터는 URL 필터일 뿐이다. 무료 여부와 상업 이용 가능 여부는 다르므로 상세 화면의 사용권 요약을 다시 확인한다.

## 6. "AI로 다듬기" (current, 선택)

- 버튼은 앱 계층이 `refineMaterialSentence` 를 주입한 `/research` 에서만 보인다(`research-home-route.tsx` 가 `research-material-refine.ts` 의 함수를 넘긴다).
- 사용자가 버튼을 누른 때에만 기존 자동 무료 텍스트 AI(`completeAutomaticFreeText`, 사용자의 AI 설정에 따라 공유 무료 풀과 사용자가 연결한 개인 무료 키를 차례로 시도, 공유 풀은 `POST /api/studio-ai/chat`)를 한 번 부른다. 이때 **문장 하나만** 사용자의 설정에 따라 ToonStudio 서버의 공유 무료 풀 또는 사용자가 연결한 개인 AI 제공처로 간다. 화면 도움말에도 그렇게 적혀 있다. 이 클라이언트는 누를 때 처음 내려받는다.
- 응답은 첫 줄만 정리해 입력창에 넣고, **자동으로 찾지 않는다.** 원래 문장으로 되돌리기 버튼이 있다.
- 로그인 필요·무료 한도 소진·형식 오류·빈 응답·80자 초과·계획기가 읽지 못하는 응답은 모두 조용히 규칙 기반 해석을 그대로 둔다(오류 경고 없음, 짧은 안내만).
- 도메인 경계: `creator-resources` 도메인은 `creator` 도메인을 가져오지 않는다. 프롬프트 정리는 `material-hub-refine.ts`(순수), 실제 호출은 앱 계층 래퍼가 맡는다.

## 7. 접근성·모션·언어 (current)

- 검색 폼은 이름 있는 `search` 랜드마크이고 입력에 라벨·도움말·`maxLength` 가 연결돼 있다. 모든 조작은 키보드로 되며 칩과 버튼의 터치 영역은 44px 이상이다.
- 진행은 `aria-live="polite"` 영역이 "N곳에서 찾는 중" → "자료 N개 · 비어 있음 N곳 · 오류 N곳" 으로 알린다. 마켓은 칩을 뺄 때마다 남은 조건 수를, 적용할 때 적용한 조건을 알린다.
- 카드는 입력·이해 카드 하나뿐이다(DESIGN.md: 중첩 카드 금지). 이해 칩과 종류별 결과 구역은 평면이고, 결과 카드는 기존 검색 화면과 같은 표면(`rounded-2xl border bg-panel`)으로 페이지 위에 놓인다.
- 스켈레톤은 `motion-reduce:animate-none` 이다. 새 화면 문구는 `bt(ko, en)`(허브)·`t(ko, en)`(마켓) 한·영 짝으로 둔다.
- 알려진 편차: `I18N_GUIDE.md` 는 새 화면에 키 기반 문구를 권하지만, 이웃 파일(`MarketBrowsePage`, `ResearchSearchPanel`)이 쓰는 인라인 한·영 짝을 따랐다.

## 8. 목표와 알려진 공백 (target)

- 스튜디오에서 `MATERIAL_DROP_KEY` 를 읽어 소재 서랍에 넣는 화면이 없다(`readMaterialDrop` 은 있으나 쓰는 화면이 없다). 지금은 보내는 쪽(저장)까지만 구현돼 있어, 화면 안내도 "전달함에 담았어요. 스튜디오에서 불러오는 기능은 아직 연결되지 않았어요" 라고 솔직히 적는다.
- 서버가 문장 단위로 여러 제공처를 묶어 검색하고 분당 제한을 한 번에 관리하는 API.
- 날씨 지원 도시 목록의 서버 단일 출처화.
- 사전 밖 표현을 위한 번역·의미 검색(AI 또는 온디바이스 모델). 지금은 `AI로 다듬기`가 문장을 계획기 어휘로 풀어쓰는 것까지만 한다.
- 브라우저 스크린샷 기반의 시각 검증(별도 단계).

## 9. 검증

저장소 루트에서 실행한다. 모두 읽기 전용이며 네트워크를 쓰지 않는다(제공처 호출은 테스트에서 `fetch` 를 가로챈다).

```sh
pnpm exec vitest run packages/core/src/material-intent-plan.test.ts \
  apps/web/src/domains/creator-resources/material-hub \
  apps/web/src/domains/creator-resources/CreatorHubPage.material-hub.test.tsx \
  apps/web/src/domains/market/models/market-sentence.test.ts \
  apps/web/src/domains/market/components/MarketSentenceSearch.test.tsx \
  apps/web/src/domains/market/pages/MarketBrowsePage.sentence.test.tsx \
  apps/web/src/app/routes/groups/research-home-route.test.tsx
pnpm harness:check
```

## 10. 관련 문서

- [창작 자료 리서치 기반(영문)](../creator-resources.md) — `/research` 리서치 데스크, 제공처 레지스트리, 출처 내보내기.
- [시각 레퍼런스 아틀라스](../reference-assets-atlas.md) — 레퍼런스 전용 자료의 이용 경계.
- [리서치 근거 종합](../research-evidence-synthesis.md) — 저장 보드와 종합 메모.
- [DESIGN.md](../../DESIGN.md) — 시각 규칙의 권위(중첩 카드 금지, 의미 토큰).
