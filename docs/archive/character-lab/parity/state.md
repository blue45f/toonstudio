# SHAPER 패리티 — state-presets 영역 (상태·프리셋·슬롯 패널)

- 작성: state-presets 작업자, 2026-10-01(2026-10-23 S-1 화풍·내 룩 행 추가 — 6절). core가 `docs/shaper-parity-checklist.md`로 집계한다(열 구조 동일).
- 소유 파일: `src/state/**`(29), `src/presets/**`(11), `src/app/shell/panels/SlotPanel.tsx`(+`.test.tsx`), 이 문서. 2026-10-23 S-1은 `scripts/measure-3d-diversity.mts`의 `characterLab.*` 섹션과 `docs/studio/3d-diversity-ledger.json`의 그 섹션도 고쳤다.
- 열 의미: **구현 상태** 구현됨/부분/미구현 · **Node 검증** vitest 파일 · **브라우저 검증** 미검증 또는 `YYYY-MM-DD·기기·backend` · **비고** 베타·사유.

## 1. 항목별 상태

| 항목(SHAPER 대응) | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고 |
|---|---|---|---|---|
| 15슬롯 구성 중 외형 12슬롯 × 64 프리셋(얼굴형 6·눈 6·눈동자 5·코 5·입 5·귀 4·헤어 7·체형 6·상의 5·하의 5·신발 4·액세서리 6) | 구현됨 | `presets/appearance-presets.test.ts`(64개, 어휘 안, id·라벨 유일, 같은 슬롯 안 patch 상호 상이, `catalogInvariants` 통과) | 미검증(썸네일 픽셀) | 어휘는 `contracts/preset-vocabulary.ts`에 동결. 연기 30개(표정 12·포즈 10·손 8)는 animation 영역 |
| 프리셋 patch가 실제 외형을 바꿈(params/parts/colors 조합) | 구현됨 | 같은 파일(파라미터 프리셋은 슬롯 키 전부 기록·0 포함, 파츠 프리셋은 어휘 이름, 의상·신발·액세서리는 기본색 포함) | 미검증(실제 렌더) | 파라미터 프리셋은 교체 시 이전 잔여 값이 남지 않도록 다루는 키 전부를 적는다 |
| 프리셋 `requires`(소스가 제공해야 할 morph) 결정적 유도 | 구현됨 | 같은 파일(`requiresForPatch`) | — | `morph:param:<key>:<±>` 형식. 불충족 시 플래너가 미지원 사유로 노출(대체 없음) |
| 프리셋 간 충돌 선언(`conflictsWith`, 대칭) | 구현됨 | 같은 파일(참조 유효·대칭·슬롯 상이) | — | 히메컷/트윈테일 ↔ 캡/귀걸이/헤드폰, 후드티 ↔ 헤드폰, 세일러복 ↔ 초커 |
| 슬롯 탭 15개(얼굴/몸·의상/연기 그룹) + 카드 그리드 + 현재 선택 표시 | 구현됨 | `app/shell/panels/SlotPanel.test.tsx`(jsdom: 탭 15·카드 수·`aria-pressed`) | 미검증(레이아웃) | 활성 슬롯은 셸 UI 상태(`useUiState`)와 공유. 스타일 클래스 `cl-slot-panel/toolbar/tabs/tab/grid/card/badge/thumb/…`는 core CSS에 아직 없음(§4) |
| 카드 클릭 = `slot/apply` dispatch 1회, 액세서리 "없음" 카드 | 구현됨 | 같은 파일 | — | 실제 store 연결 테스트에서 클릭 → 레시피 변경 → 선택 카드 이동 → 실행 취소 복귀까지 확인 |
| 슬롯 능력 배지: `unavailable`은 disabled + 사유(tooltip·텍스트), `partial`은 경고 배지 + 사유 | 구현됨 | 같은 파일 | — | 탭 자체에도 배지를 단다(제작 패키지 소스에서 교체형 헤어 미제공 등) |
| 미지원 사유 표시(플래너 `unsupported`: requires 불충족·카탈로그 밖) | 구현됨 | 같은 파일 + `state/apply-plan.test.ts` | — | 마지막 적용 플랜(`useApplyPlan`)에서 읽어 해당 슬롯·카드에 "미적용" 배지와 사유를 보여준다 |
| 충돌 카드 "겹침 주의" 배지(적용은 가능) | 구현됨 | 같은 파일 | — | `presetConflicts(entry, recipe, catalog)` |
| 썸네일 카드(ready 래스터·pending·failed 사유) | 구현됨 | 같은 파일(pending/failed 배지) | 미검증(실제 썸네일 픽셀·canvas 표시) | 래스터 → `ImageData`/canvas. 요청은 셸 thumbnail-driver가 활성 슬롯 우선으로 한다 |
| 실행 취소/다시 실행 버튼 + 깊이 표시 | 구현됨 | 같은 파일 | — | TopBar에도 undo/redo가 있으면 같은 명령을 보낸다 |
| 레시피 reducer(명령 11종: slot/apply·param/set·color/set·expression/set·pose/set·hand-pose/set·shading/set·physics/set-provider·source/set·recipe/load, +history·paint는 store) | 구현됨 | `state/recipe-reducer.test.ts`(불변성, patch만 적용, 클램프, 정규화, 거부 코드·한글 사유) | — | 잘못된 명령은 `RecipeCommandError`로 거부하고 store가 `failures`에 쌓는다(무음 금지) |
| undo/redo: 1 명령 = history 1단계 | 구현됨 | `state/history.test.ts`, `state/lab-store.test.ts` | — | 레시피가 바뀌지 않는 명령은 단계를 만들지 않는다 |
| 슬라이더 연속 드래그 병합(`param/set` + `coalesceKey`, 250 ms 윈도우) | 구현됨 | 같은 파일들(병합·윈도우 밖 분리·`before` 유지) | — | undo 한 번에 드래그 전체가 되돌아간다 |
| history 용량 200(초과 시 가장 오래된 항목 제거), redo 소거 | 구현됨 | `state/history.test.ts`(205회 push → 200), `state/lab-store.test.ts`(limit 3) | — | |
| 페인트 스트로크 undo 토큰 history 통합(`paint/stroke`, 방향 콜백) | 구현됨 | `state/lab-store.test.ts` | 미검증(실제 텍스처 복원은 paint 영역) | `onPaintUndo(token, direction)`로 paint 도메인이 주입 |
| 소스 전환(`source/set`)이 능력 맵까지 undo/redo | 구현됨 | `state/lab-store.test.ts` | — | 같은 소스라도 능력 맵이 바뀌면 단계 생성 |
| 적용 플랜(morphWeights = 파라미터 ± 분리 + FACS, boneRotations = pose ∪ handPose 정규화, 파츠 가시성·재질·색) | 구현됨 | `state/apply-plan.test.ts`(가중치 [0,1], 단위 쿼터니언, 레이아웃·variant 가시성) | 미검증(엔진 반영은 render 영역) | `createApplyPlanner({ partLayout, features, settleSteps })`로 소스별 레이아웃·feature 주입 |
| 미지원 슬롯 미적용 + 사유, 대체 없음; `conflictsWith`·partial 능력 → partial 사유 | 구현됨 | 같은 파일 | — | 미지원 프리셋의 파라미터 morph도 제외, 파츠는 소스 기본값 유지 |
| 플랜 revision 메모(`getPlan`)·프리셋 임시 적용 플랜(`planForPreset`/`planWithPreset`) | 구현됨 | `state/lab-store.test.ts`, `state/apply-plan.test.ts` | — | 셸 thumbnail-scheduler의 `planForPreset`과 같은 의미 |
| 레시피 저장(정규형 JSON, `character-<digest8>.json`)·불러오기(손상 JSON·스키마·미래 버전 한글 사유) | 구현됨 | `state/recipe-io.test.ts`(round-trip 바이트 동일, 키 순서 무관, 사유 코드) | — | ExportPanel(export 영역)은 자체 `export/recipe-file.ts`(`.character.json`, 페인트 레이어 포함)를 쓴다 — 통합 시 한쪽으로 합치기 권장(§4) |
| 브라우저 파일 열기/저장(File System Access 우선, 없으면 `<input type=file>`/`<a download>` + `revokeObjectURL`) | 구현됨 | `state/recipe-io.test.ts`(capability 판정 `openMethodFor`/`saveMethodFor`, 취소 판정 `isAbortError`) | 미검증(실제 피커·다운로드) | DOM 경로 자체는 `recipe-io.browser.ts`(테스트 import 금지 규약) |
| 썸네일 캐시 키(해당 슬롯·그 프리셋 patch 키·연기 필드 제외 digest + 셰이딩 모드)와 LRU 400 | 구현됨 | `state/thumbnail-cache.test.ts`(키 불변·변화 조건, LRU 순서·한도) | — | 페인트 레이어·후처리는 키에 영향 없음. 2026-10-23부터 v3 값과 툰 모드의 툰·look이 키에 들어간다(6절) |
| React 연결(`useSyncExternalStore`, 선택자 얕은 비교로 리렌더 억제) | 구현됨 | `state/useLabStore.test.tsx`(jsdom) | — | 컨텍스트 훅(`useLabState`/`useLabSelector`)은 core `lab-store-context.tsx`; state의 훅은 store를 인자로 받는 `useLabStoreState`/`useLabStoreSelector` |
| 이벤트 반영(engine/physics/vision 상태, failure·dismiss, thumbnail/update) | 구현됨 | `state/lab-store.test.ts`(testing/mock-store 참조 구현과 동치) | — | |

## 2. 공개 API 요약

- `state/recipe-reducer.ts`: `reduceRecipe(recipe, cmd, catalog)`, `RecipeCommandError`, `isRecipeCommand`, `normalizePose`, `mergePoseScoped`, `describeCommandKo`.
- `state/history.ts`: `createHistory(limit | { limit, coalesceWindowMs })` → `push/undo/redo/canUndo/canRedo/depth/redoDepth/peekUndo/peekRedo/canCoalesce/entries/clear`; `HistoryEntry = RecipeHistoryEntry | PaintHistoryEntry`; `HISTORY_DEFAULT_LIMIT = 200`, `HISTORY_COALESCE_WINDOW_MS = 250`.
- `state/lab-store.ts`: `createLabStore({ catalog, planner?, initial?, history?, now?, onPaintUndo? })` → `LabStoreHandle`(`getState/dispatch/subscribe/applyEvent` + `getPlan/planForPreset/getHistory/catalog`); `applyLabEvent(state, event)`.
- `state/apply-plan.ts`: `planApply: ApplyPlanner`, `createApplyPlanner(options)`, `planWithPreset`, `unmetRequirement`, `presetConflicts`, `layoutFromPalette`, `materialPresetFor`, `DEFAULT_PART_LAYOUT`, `SLOT_PART_ROLES`, `PART_COLOR_KEYS`, `PRESET_MATERIALS`, `DetailedApplyPlan`(= ApplyPlan + `partial`).
- `state/recipe-io.ts`: `serializeRecipe`, `deserializeRecipe`, `recipeFileName`, `openMethodFor`, `saveMethodFor`, `isAbortError`; `state/recipe-io.browser.ts`: `openRecipeFile(win?)`, `saveTextFile(name, text, mime?, win?)`.
- `state/thumbnail-cache.ts`: `thumbnailCacheKey(presetId, recipe, shadingMode, catalog?)`, `createThumbnailCache(limit = 400)`.
- `state/useLabStore.ts`: `useLabStoreState(store)`, `useLabStoreSelector(store, selector, isEqual?)`, `shallowEqual`.
- `presets/index.ts`: `APPEARANCE_PRESETS`(64), 슬롯별 배열 12개, `appearancePresetsForSlot`, `requiresForPatch`, `APPEARANCE_PRESET_COUNT`.
- `app/shell/panels/SlotPanel.tsx`: `SlotPanel`, `NULLABLE_SLOTS`.

## 3. 검증 명령

```sh
pnpm exec eslint --max-warnings=0 apps/character-lab/src/state apps/character-lab/src/presets apps/character-lab/src/app/shell/panels/SlotPanel.tsx apps/character-lab/src/app/shell/panels/SlotPanel.test.tsx
pnpm exec vitest run apps/character-lab/src/state apps/character-lab/src/presets apps/character-lab/src/app/shell/panels/SlotPanel.test.tsx
pnpm --filter @toonstudio/character-lab typecheck
```

## 4. 브라우저 미검증·다른 영역 의존(통합 시 확인)

- 미검증: 썸네일 픽셀·canvas 표시, 파일 피커/`<a download>` 실제 동작, 패널 레이아웃. 이 컨테이너에는 GPU·브라우저가 없다.
- core CSS(`src/app/styles/character-lab.css`)에 SlotPanel 클래스(`cl-slot-panel`, `cl-slot-toolbar`, `cl-slot-title`, `cl-slot-history`, `cl-slot-undo/redo`, `cl-slot-history-depth`, `cl-slot-tabs`, `cl-slot-tab-group(-label)`, `cl-slot-tab(--active)`, `cl-slot-grid-wrap`, `cl-slot-grid(-caption/-reason/-unsupported)`, `cl-slot-grid`, `cl-slot-card(--selected/--disabled/--none)`, `cl-slot-card-thumb/-label/-reason`, `cl-slot-badge(--unavailable/--partial/--unsupported/--conflict)`, `cl-slot-thumb(--text/--pending/--failed)`, `cl-slot-empty`, `cl-slot-footer`)가 아직 없다. Export·Paint 패널과 같은 상황이며 core가 한 번에 추가한다(작업자는 공유 CSS를 편집하지 않는다).
- 레시피 파일 모듈이 둘이다: `state/recipe-io.ts`(스펙 5.1, `character-<digest8>.json`)와 `export/recipe-file.ts`(`.character.json`, 페인트 레이어 PNG 포함). ExportPanel은 후자를 쓴다. 저장 포맷을 하나로 합칠지 core가 결정한다(둘 다 `parseRecipe` strict 스키마를 쓰므로 서로 읽을 수 있다).
- 카탈로그 병합(`APPEARANCE_PRESETS` + `PERFORMANCE_PRESETS`)과 불변식 실행은 core `catalog-registry.ts`.
- core `lab-runtime.ts`는 2026-10-23 현재 `cacheKey(presetId, recipe, recipe.shading.mode, catalog)` 4인자로 호출한다(카탈로그 patch가 덮어쓰는 값은 키에서 빠진다). 화풍 카드 썸네일은 다섯째 인자 `{ shading }`(= `ThumbnailRequest.shading`)으로 키를 만들어야 팩마다 캐시가 갈린다 — U-1(셸)이 화풍 카드 요청을 붙일 때 같이 넘긴다(6절).

## 5. 키트 소스 행 (KT-12, 2026-10-08)

계약은 `docs/authored-kit-spec.md`, 렌더·패널 상태는 `docs/parity/render.md` §10. 아래는 상태·레시피·셸 쪽 행이다. 테스트 수는 2026-10-08 `pnpm exec vitest run <파일>` 실측이다. 모두 합성 키트·모의 엔진 기준이며 **브라우저 미검증**이다.

| 항목 | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 레시피 v2(`source.kind === "kit"`), v1→v2 명시 마이그레이션(`migrateRecipeV1ToV2`), `createKitDefaultRecipe()` | 구현됨 | `contracts/recipe.test.ts`(15), `contracts/character-kit.test.ts`(37), `state/recipe-io.test.ts`(14) | 미검증 | 구버전 앱은 v2 파일을 '지원하지 않는 버전'으로 정직하게 거부 |
| 키트 툰 기본값(A-10): `KIT_DEFAULT_TOON`(램프 2단·림 끔), `applyKitToonDefaults`, `source/set`이 절차·패키지 → 키트로 **처음** 옮길 때만 적용(사용자가 바꾼 값 유지, 키트 안 베이스 전환·같은 소스 재선택은 불변·같은 참조) | 구현됨 | `state/recipe-reducer.test.ts`(22), `contracts/recipe.test.ts`, `contracts/character-kit.test.ts` | SwiftShader 뷰어(램프 2단)만. 앱 뷰포트 미검증 | 절차 소스 기본값(`DEFAULT_SHADING`, 3단·림 켬)은 바꾸지 않음 |
| 부팅 기본 소스 `DEFAULT_BOOT_SOURCE = "procedural"`(키트 에셋 안착 전까지), `composeCharacterLab({ defaultSource })` | 구현됨 | `app/composition.test.ts`(13). 상수를 임시로 `"kit"`로 바꿔 `src/app`·`src/state`·`babylon-character-engine.test.ts` 48파일 488 테스트 통과를 FIX-A1이 확인 | 미검증 | KT-11에서 `"kit"`로 전환하고 테스트 갱신 |
| `describeCommandKo`의 kit 소스 문구('소스: 키트(<베이스>)'), 프리셋 단위 비활성(`unavailablePresets`)·`plan.partial` 표시 정책(슬롯 배지·툴팁에만) | 구현됨 | `state/recipe-reducer.test.ts`, `app/shell/panels/SlotPanel.test.tsx`(14) | 미검증 | 플래너 동작(partial 사유를 올림)은 테스트로 고정되어 있고 표시 정책만 바뀌었다 |
| 키트 plan 레지스트리(`app/shell/kit-plan-registry.ts`)·`lab-runtime` 키트 분기(재시도·`kit-loader-unavailable`·임시 키트 썸네일 소스·적용 루프 소스 키 통일) | 구현됨 | `app/shell/kit-plan-registry.test.ts`(14), `app/shell/lab-runtime.test.ts`(18), `app/shell/apply-loop.test.ts`(19) | 미검증 | 실패 사유는 그대로 노출하고 절차 소스로 자동 전환하지 않는다 |

## 6. 레시피 v3 화풍·내 룩 행 (S-1, 2026-10-23)

설계 `docs/art-style-customization-design-20261023.md` §5·§6·§9(S-1)·§11. 계약은 CORE-1(`contracts/art-style.ts`·`customization.ts`·`character-look*.ts`)이 만들었고 이 절은 그 위의 데이터·상태 행이다.
테스트 수는 2026-10-23 `node_modules/.bin/vitest run apps/character-lab/src/presets apps/character-lab/src/state` 실측(16파일 235개 통과)이다. 모두 Node 순수 시험이며 **브라우저 미검증**이다 — 화면(U-2 화풍 뷰·U-3 커스텀 뷰)과 엔진(R-3a 룩·R-3b 커스텀)이 아직 붙지 않았다.

| 항목 | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 화풍 팩 T1 8종 데이터(`presets/art-style-packs.ts`): 두신·다리비·눈폭·램프/그림자·선·톤·종이·팔레트(설계 §5.1) | 구현됨 | `presets/art-style-packs.test.ts`(13: `artStylePackSchema` strict 통과·표 값 일치·v3 셰이딩 조립 통과·라벨 금지어·깊이 동결·꺼진 그룹 숨은 값 없음) | 미검증(look을 그리는 엔진 R-3a 전) | 실측은 로맨스 두신 7.8/9.0·눈폭 0.22와 가이드 §1 관찰 범위 중앙값뿐(`ART_STYLE_PACK_PROVENANCE`), 나머지는 [제안] 초기값. 로맨스는 v2 hull·피부 틴트 그대로라 지금 엔진에서도 같은 선·그림자 |
| 화풍 → 소스별 매핑(`presets/art-style-lab-bindings.ts`): 눈 계열 표(§5.3)·중립 FACS·체형 오프셋·`style/apply` 명령 조립 | 구현됨 | `presets/art-style-lab-bindings.test.ts`(14: §5.3 절차 열 일치·키트 열·프리셋 존재·속눈썹 partial·SD 키트 unavailable·패키지 거부·체형 오프셋이 비례 축과 겹치지 않음) | 미검증 | 키트 SD 눈은 SD 베이스가 없어 거부(대체 없음). 체형 오프셋은 계약 `style/apply`에 실을 자리가 없어 섞기만 쓴다(계약 요청) |
| 코디 세트 24(`presets/look-sets.ts`: 교복 6·캐주얼 6·직장/직업 4·운동 3·판타지/전통풍 3·홈웨어 2) + 소품 앵커 궁합(`accessory-anchors.ts`)·층 궁합(`layering.ts`) | 구현됨 | `presets/look-sets.test.ts`(14: 세트 스키마·어휘 프리셋만·색 조합 유일·패턴 6종 사용·세트 안 충돌 없음·층 궁합 준수·3레시피 × 24세트 적용이 v3 스키마 통과·의상 밖 사용자 값 보존) | 미검증 | 적용은 `composeLookSetLook(세트, 레시피)` → look/1(scope full) 한 장 = `look-preset/apply` 1단계. 헤어 슬롯은 세트에 넣지 않는다 |
| 섞기(랜덤 + 잠금, `state/look-mixer.ts`·`look-mixer-parts.ts`) | 구현됨 | `state/look-mixer.test.ts`(17: 같은 시드·잠금 → 같은 문서·레시피, 잠금 63조합 × 시드 × 능력 유무에서 계약 유효·잠근 값 불변, 그룹별 PRNG 독립, 능력·충돌·층 궁합 존중, 한글 설명) | 미검증 | mulberry32 그룹별 스트림. 커스텀 능력이 없으면(지금 엔진) 층·추가 소품·무늬·헤어 흐름·세부 채널은 섞지 않고 지금 값을 둔다. look/1은 셰이딩 모드를 못 실어 PBR이면 `needsToonMode` 안내 |
| 내 룩 저장·불러오기(`state/look-library.ts` + `.browser.ts`): 범위 저장·이름 중복(번호/덮어쓰기/거부)·용량 상한(60개·150만 자·썸네일 4.8만 자)·손상 저장본 백업·`.look.json` 내보내기/가져오기 | 구현됨(순수 로직) | `state/look-library.test.ts`(12: 범위 저장·적용, 목록 정렬, 중복 정책, 이름 검사, 썸네일 형식, 용량 거부, 직렬화 왕복, 가짜 저장소 왕복·손상 백업·쓰기 실패 5종 한글 사유, 파일 왕복·가져오기 충돌) | 미검증(localStorage·파일 피커 실제 동작, `.browser.ts`는 시험 import 금지) | 캐릭터 랩에 저장소 선례가 없어(레시피는 파일 피커) localStorage 한 키를 골랐다 |
| 구성 공간 측정기(`state/config-space.ts`, 성공 지표 Q1~Q6) + 원장 `characterLab.customization` | 구현됨 | `state/config-space.test.ts`(10: 계약 상한·v2 엔진 값 고정, Q5 항목별 식, 능력 민감도, look 축 표 ↔ look 값 모양 대조, 원장 지표) | — | 원장 실측: 계약 상한 색 27·형태 152·동시 착용 19·이산 log10 67.26·연속 454 / 커스텀 없는 소스 색 8·착용 5·log10 13.83·연속 64. `node_modules/.bin/tsx scripts/measure-3d-diversity.mts --check` 통과 |
| 썸네일 캐시 키 v3(`state/thumbnail-cache.ts`): 상속 채널 지정색·옷장·형태 값·표면·헤어 흐름·비례·중립 표정 + 툰 모드의 툰·look, 화풍 카드 `options.shading`(`|style|` 표지) | 구현됨 | `state/thumbnail-cache.test.ts`(16: 기존 11 유지 + v3 5) | 미검증(화풍 카드 썸네일은 엔진 `thumbnailShading` 지원 뒤) | PBR 모드는 툰·look을 그리지 않아 키에서 뺀다. 화풍 출처(packId)는 copy-on-apply라 키에서 뺀다 |

### 6.1 공개 API(후속 U-2·U-3·U-1이 쓰는 것)

- `presets/art-style-packs.ts`: `ART_STYLE_PACKS`(8), `artStylePack(id)`, `ART_STYLE_PACK_PROVENANCE`, `ART_STYLE_PACK_REVISION`.
- `presets/art-style-lab-bindings.ts`: `styleSourceBinding(pack, "procedural" | "kit")` → `{ faceStatus, faceReasonKo?, face: StyleFaceBinding | null, body, bodyNoteKo? }`, `styleBindingSourceOf(source)`, `defaultStyleFigure(source)`, `buildStyleApplyCommand({ pack, source, scope, figure?, paletteIndex? })` → `{ ok, command, binding, noticesKo } | { ok: false, code, reasonKo }`, `mixerStyleBindingFor(source)`, `EYE_FAMILY_BINDINGS`, `STYLE_BODY_OFFSET_KEYS`.
- `presets/look-sets.ts`: `LOOK_SETS`(24), `LOOK_SET_GENRES`·`LOOK_SET_GENRE_LABELS_KO`, `lookSetsForGenre`, `lookSetById`, `composeLookSetLook(set, recipe)` → look/1, `lookSetWardrobe`, `lookSetSchema`.
- `presets/accessory-anchors.ts`: `accessoryAnchorsFor(presetId)`, `ACCESSORY_ANCHOR_AFFINITY`. `presets/layering.ts`: `layerOptionsFor(layer, base)`, `WARDROBE_LAYER_COMPATIBILITY`.
- `state/look-mixer.ts`: `mixLook({ recipe, catalog, capabilities, custom?, packs, styleBinding?, accessoryAnchors?, layerOptions?, figure, locks, seed })` → `{ ok, result: { look, recipe, lines, descriptionKo, noticesKo, needsToonMode } }`, `nextMixSeed(seed)`, `LOOK_MIXER_VERSION`.
- `state/look-library.ts`: `createLookLibrary`, `saveLookToLibrary`, `addLookToLibrary`, `renameLookInLibrary`, `setLookThumbnail`, `removeLookFromLibrary`, `listLibraryLooks`, `lookApplyCommand`, `createLookLibraryStore(storage)`, `serializeLookFile`·`parseLookFileText`·`importLookFileText`·`lookFileName`. `state/look-library.browser.ts`: `createBrowserLookLibraryStore(win?)`, `saveLookFile(look, win?)`, `openLookFile(win?)`.
- `state/config-space.ts`: `measureConfigSpace({ catalog, capabilities, custom })`, `CONTRACT_MAX_CONFIG_CAPABILITIES`, `configCapabilitiesFromCustom(custom, { look })`, `configSpaceLedgerMetrics(report, prefix)`.
- `state/thumbnail-cache.ts`: `thumbnailCacheKey(presetId, recipe, shadingMode, catalog?, { shading? })`.

### 6.2 브라우저 미검증·다른 영역 의존

- 섞기·코디 세트·내 룩은 화면이 아직 없다(U-3). 섞기 결과의 층·추가 소품·무늬는 엔진이 `SourceCapabilities.custom`을 보고해야 나오고(R-3b·A-1·O-1), 화풍 look은 R-3a 전에는 v2 엔진이 그리지 않는다.
- 화풍 카드 썸네일은 엔진 `thumbnailShading`과 셸 요청(U-1)이 붙은 뒤에 확인한다.
- 계약 요청(core): `style/apply`(또는 `StyleFaceBinding`)에 체형 오프셋 `body`, look/1 `toon` 부분에 셰이딩 `mode` — 지금은 화풍 룩을 PBR 레시피에 적용하면 화면에 보이지 않는다.
