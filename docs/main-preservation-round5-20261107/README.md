# Round 5 툰 통합 보존 후속 읽기 전용 감사 보고서 (`2026-11-07`)

## 1. 감사 개요 및 운영 원칙 준수 현황

- **감사 식별자**: `main-preservation-round5-20261107`
- **감사 검증 시각 (UTC)**: `2026-11-07T13:50:07.222Z`
- **최신 `origin/main` HEAD**: `65da4036cec52f1d5b048855a51085c9b7503264` (`65da4036`, 커밋 시각 `2026-11-07T13:11:54+00:00`)
- **오픈 PR `#2740` 최신 HEAD**: `c4fce43c307fa5f124105e8cfb4719c1b9998d93` (`c4fce43c`, 커밋 시각 `2026-11-07T21:41:36+09:00` / `2026-11-07T12:41:36Z`, 초기 `f508de8f`에서 5커밋 추가 전진)
- **독립 보존 브랜치**: `docs/main-preservation-round5-20261107`
- **포함 증거 산출물 (저장소 상대경로 링크)**:
  - 후속 감사 보고서: [`README.md`](./README.md)
  - 후속 감사 기준 데이터 및 합성 픽스처 모듈: [`preservation-audit-round5-data.mjs`](./preservation-audit-round5-data.mjs)
  - 읽기 전용 검증 도구: [`verify-main-preservation-round5.mjs`](./verify-main-preservation-round5.mjs)
  - 단위·계약 테스트: [`verify-main-preservation-round5.test.mjs`](./verify-main-preservation-round5.test.mjs)
  - 실행 검증 리포트: [`verification-report.json`](./verification-report.json)

### 엄격 준수 사항 점검

| 통제 항목 | 상태 | 비고 |
| --- | --- | --- |
| 56개 전체 세션 로그 재스캔 금지 | 준수 (`PASS`) | 요청된 4개 커밋(`65da4036`, `4b1be6d4`, `01d8f995`, `75f34f8d`), `origin/main`, `#2740`, 최신 CI만 좁게 확인 |
| 앱 코드·`main`·활성 브랜치·기존 `README` 수정/삭제/머지/배포 금지 | 준수 (`PASS`) | `docs/main-preservation-round5-20261107/` 외부 파일 변경 `0건` |
| 문서 링크 CI 및 카탈로그 i18n 별도 담당 범위 중복 보정 금지 | 준수 (`PASS`) | `docs/character-keyboard-round4-20261107/README.md` 및 `TagsPage.tsx`/`catalog-status-i18n.ts` 직접 수정 없이 정확한 상태·대상 파일·담당 범위만 보고 |
| 증거 문서 내 저장소 상대경로 링크 사용 | 준수 (`PASS`) | 본 보고서 내 모든 파일 참조를 `./` 및 `../../` 상대경로로만 작성 |

---

## 2. 신규 완료 4개 커밋(`65da4036`, `4b1be6d4`, `01d8f995`, `75f34f8d`) `origin/main` Ancestry 포함 검증

검증 시각 `2026-11-07T13:50:07.222Z` 기준, `origin/main` HEAD(`65da4036cec52f1d5b048855a51085c9b7503264`)에 대해 `git merge-base --is-ancestor` 및 `git ls-tree`를 수행한 결과 **3건(`65da4036`, `01d8f995`, `75f34f8d`)은 실제 ancestry 및 파일 트리에 완전히 포함되어 있고, 1건(`4b1be6d4`, 홈 200작품)은 원격 미보존(누락) 상태**임을 확인했습니다.

| 기능 구분 | 요청 SHA | 실제 Full SHA (부모 기능 SHA) | 커밋 시각 (UTC) | `origin/main` Ancestry 포함 | 트리 파일 보존 | 판정 및 상세 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| **Character 키보드** | `65da4036` | `65da4036cec52f1d5b048855a51085c9b7503264` (부모 `7b2db38b2d7050b5aebc0d206952662b97e4e7f7`) | `2026-11-07T13:11:54+00:00` | **`true` (`HEAD`)** | `26 / 26` | **보존 완료 (`PRESERVED_IN_ORIGIN_MAIN`)** — [`InspectorTabs.tsx`](../../apps/character-lab/src/app/shell/InspectorTabs.tsx), [`TopBar.tsx`](../../apps/character-lab/src/app/shell/TopBar.tsx), [`PosePanel.tsx`](../../apps/character-lab/src/app/shell/panels/PosePanel.tsx), [`ExportPanel.tsx`](../../apps/character-lab/src/app/shell/panels/ExportPanel.tsx), [`SlotPanel.tsx`](../../apps/character-lab/src/app/shell/panels/SlotPanel.tsx) 및 [`docs/character-keyboard-fixes-round5-20261107/README.md`](../character-keyboard-fixes-round5-20261107/README.md) 포함 |
| **홈 200작품** | `4b1be6d4` | `null` (`unknown revision`, 원격 `origin/main`·`origin` 브랜치/PR 참조 미존재) | 미상 (원격 미푸시) | **`false` (`MISSING`)** | `0` (원격 미반영) | **원격 미보존·누락 (`MISSING_FROM_ORIGIN_MAIN_AND_REMOTE_REFS`)** — 아래 2-1절에 정확한 상태·대상 파일·담당 범위 명시 |
| **브러시** | `01d8f995` | `01d8f99569ddc3fe0029dba504f37ac487427790` (부모 `69008b4dcf1c22cb7880f59c7f469d2c5491982b`) | `2026-11-07T11:57:43+00:00` | **`true`** | `11 / 11` | **보존 완료 (`PRESERVED_IN_ORIGIN_MAIN`)** — [`CompareView.tsx`](../../apps/brush-lab/src/app/views/CompareView.tsx), [`PresetComparisonBar.tsx`](../../apps/brush-lab/src/app/ui/PresetComparisonBar.tsx), [`PresetCard.tsx`](../../apps/brush-lab/src/app/ui/PresetCard.tsx), [`LaneCanvas.tsx`](../../apps/brush-lab/src/app/ui/LaneCanvas.tsx) 및 [`docs/brush-comparison-round4-20261107/README.md`](../brush-comparison-round4-20261107/README.md) 포함 |
| **카탈로그** | `75f34f8d` | `75f34f8dbf4a454ce0418c88c24700fa2523e3c9` (부모 `0bc10e551e99bd4e11b56ab525fff48cfd7e6161`) | `2026-11-07T12:25:40+00:00` | **`true`** | `12 / 12` | **보존 완료 (`PRESERVED_IN_ORIGIN_MAIN`)** — [`AuthorPage.tsx`](../../apps/web/src/domains/catalog/AuthorPage.tsx), [`AuthorsPage.tsx`](../../apps/web/src/domains/catalog/AuthorsPage.tsx), [`ExplorePage.tsx`](../../apps/web/src/domains/catalog/ExplorePage.tsx), [`TagsPage.tsx`](../../apps/web/src/domains/catalog/TagsPage.tsx), [`TitleDetailHero.tsx`](../../apps/web/src/domains/catalog/TitleDetailHero.tsx), [`TitleDetailPage.tsx`](../../apps/web/src/domains/catalog/TitleDetailPage.tsx) 및 [`docs/catalog-provenance-round4-20261107/README.md`](../catalog-provenance-round4-20261107/README.md) 포함 |

### 2-1. 누락 커밋 `4b1be6d4` (홈 200작품) 상세 보고

- **정확한 상태**: `origin/main`(`65da4036cec52f1d5b048855a51085c9b7503264`)의 ancestry에 포함되어 있지 않으며(`ANCESTOR_FALSE`), `git ls-remote origin`의 모든 원격 브랜치(`refs/heads/*`) 및 PR 참조(`refs/pull/*/head`)에도 푸시되지 않은 **원격 미보존 상태**입니다.
- **대상 파일 범위**: `apps/web/src/domains/home/*` 및 `scripts/bench-toon-home-200.mjs` (홈 200작품 대규모 목록 렌더링·가상화·성능 검증 영역)
- **담당 범위**: **홈 200작품 담당 세션 (Home 도메인)** 소유 — 본 읽기 전용 감사에서는 앱 코드·타 브랜치 수정/병합이 금지되어 있으므로, 해당 홈 담당 세션에서 `4b1be6d4` 커밋을 원격 독립 브랜치로 푸시하고 최신 `origin/main` 리베이스 검증 후 병합해야 합니다.

---

## 3. 오픈 PR `#2740` 최신 상태 (`f508de8f` -> `c4fce43c`)

앞선 Round 4 보고 시점의 초기 커밋 `f508de8f`(`2026-11-07T19:47:42+09:00`) 이후, PR `#2740`(`codex/character-package-panel-modules-20261107`)은 최신 `main` 동기화 및 회귀 보정 커밋 5건을 추가하여 **`c4fce43c307fa5f124105e8cfb4719c1b9998d93`** 으로 업데이트되었습니다.

- **PR 번호 / 제목**: `#2740` — `fix(ci): 패키지 모듈 분리와 피드·태그 회귀 보정`
- **PR 상태**: `OPEN` (`origin/main` `65da4036` 대비 **`ahead 6, behind 2`**, 공통 조상 `9e85ad9b69fd5d820704fa32f66aa660fd40d0b4`)
- **최신 HEAD SHA**: `c4fce43c307fa5f124105e8cfb4719c1b9998d93` (`2026-11-07T21:41:36+09:00` / `2026-11-07T12:41:36Z`)
- **PR `#2740` 최신 CI 결론 (`c4fce43c` 기준)**: **전 워크플로우 `SUCCESS` 통과**
  - `CI` (Run `42375379091`, 완료 `2026-11-07T13:36:08Z`): `Core preflight and application typecheck`(`128411769695`), `Core regression shard / product`(`128411769752`), `core`(`128418582825`), `verify`(`128418607315`) 포함 **전 샤드 `SUCCESS`**
  - `Architecture boundaries` (Run `42375379137`, 완료 `2026-11-07T13:15:50Z`): **`SUCCESS`**
  - `CodeQL` (Run `42375379077`, 완료 `2026-11-07T13:32:08Z`): **`SUCCESS`**
  - `Lighthouse CI` (Run `42375379078`, 완료 `2026-11-07T13:16:08Z`): **`SUCCESS`**

### PR `#2740` 포함 커밋 체인 (`354af37a..c4fce43c`)

| 순서 | 커밋 SHA (Full SHA) | 커밋 시각 | 커밋 제목 및 핵심 보정 내용 |
| --- | --- | --- | --- |
| 1 | `f508de8f` (`f508de8fd00b9bb6bb40efa85751c90a9dfd62b6`) | `2026-11-07T19:47:42+09:00` | `refactor(character-lab): 패키지 상세 표시를 독립 모듈로 분리한다` — [`PackagePanel.tsx`](../../apps/character-lab/src/app/shell/panels/PackagePanel.tsx)에서 `package-panel/PackageDetail.tsx` 분리 (`840줄 -> 708줄`) |
| 2 | `45f35ec2` (`45f35ec29b790457ec94263c4555a2465d512436`) | `2026-11-07T21:23:18+09:00` | `test(cuts): 피드 하이드레이션 경계를 결정적으로 검증한다` |
| 3 | `0474e1dc` (`0474e1dc5f7e7d271758a9079087c06b3271f981`) | `2026-11-07T21:24:36+09:00` | `chore(sync): 최신 main 변경을 CI 수정 브랜치에 반영한다` (`b21be412` 병합) |
| 4 | `abb378f1` (`abb378f1dc62ac9aff9f578f08e8e9a6e05f9c98`) | `2026-11-07T21:29:47+09:00` | `chore(sync): 최신 카탈로그와 접근성 감사 변경을 반영한다` (`75f34f8d` 및 `9e85ad9b` 병합) |
| 5 | `5a077ae0` (`5a077ae0a3999c12fc313cdb2cfb534c358e41b7`) | `2026-11-07T21:36:11+09:00` | `fix(catalog): 태그 목록 빈 상태의 한국어와 영어 번역을 등록한다` — [`TagsPage.tsx`](../../apps/web/src/domains/catalog/TagsPage.tsx), [`catalog-status-i18n.ts`](../../apps/web/src/domains/catalog/catalog-status-i18n.ts), [`catalog-status-i18n-r3c08.test.ts`](../../apps/web/src/domains/catalog/catalog-status-i18n-r3c08.test.ts) 보정 |
| 6 | `c4fce43c` (`c4fce43c307fa5f124105e8cfb4719c1b9998d93`) | `2026-11-07T21:41:36+09:00` | `docs(character-lab): 키보드 감사 증거 링크를 저장소 상대경로로 수정한다` — [`docs/character-keyboard-round4-20261107/README.md`](../character-keyboard-round4-20261107/README.md) 내 `file:///` 절대경로 링크 63건을 상대경로로 보정 |

---

## 4. 최신 `origin/main` (`65da4036`) CI 결론 및 실패 항목별 상태·대상 파일·담당 범위

- **`origin/main` (`65da4036cec52f1d5b048855a51085c9b7503264`) 최신 워크플로우 실행 결과**:
  - `CI` (Run `42375861658`, `2026-11-07T13:11:57Z` ~ `13:24:27Z`): **`failure`**
  - `Architecture boundaries` (Run `42375861677`, 완료 `13:19:16Z`): **`success`**
  - `Market CC0 delivery` (Run `42375861657`, 완료 `13:18:01Z`): **`success`**
  - `Cleanup merged branches and stale Actions runs` (Run `42375861596`, 완료 `13:13:55Z`): **`success`**
  - `CI` 내부 통과 Job: `Core strict lint`(`128413173187`), `Core production build`(`128413173026`), `Core accessibility smoke`(`128413173022`), `Core review database invariants`(`128413173211`), `Core serial performance regressions`(`128413173120`), `studio-editing`(`128413173130`), `studio-character`(`128413173153`), `studio-3d`(`128413173219`), `studio-foundation`(`128413173299`) 모두 **`success`**

### `origin/main` CI 차단 항목 정밀 매핑 (중복 보정 금지)

| 항목 구분 | CI Job ID / 단계 | 정확한 실패·누락 상태 | 대상 파일 (상대경로) | 담당 범위 및 현재 해결 상태 |
| --- | --- | --- | --- | --- |
| **1. `PackagePanel` 파일 크기 상한 초과** | Job `128413172981` (`Core preflight and application typecheck` -> `Source file size ratchet`) | `origin/main`에서 `840줄`로 상한 `800줄`을 `+40줄` 초과하여 실패 (`2026-11-07T13:13:36Z`) | [`apps/character-lab/src/app/shell/panels/PackagePanel.tsx`](../../apps/character-lab/src/app/shell/panels/PackagePanel.tsx) | **PR `#2740` (`f508de8f..c4fce43c`) 담당 소유** — `package-panel/PackageDetail.tsx` 분리로 `708줄` 축소 및 PR CI(`42375379091`) 통과 완료 (**중복 수정 금지**) |
| **2. 문서 링크 CI 실패 (63건)** | Job `128413173274` (`Core regression shard / product` -> `validate:documentation`) | `874ff7a8`(`a86f3739`)에서 병합된 문서 내 `file:///home/antigravity/...` 절대경로 링크 63건으로 `문서 검증 실패: 63건` 발생 (`2026-11-07T13:17:03Z`) | [`docs/character-keyboard-round4-20261107/README.md`](../character-keyboard-round4-20261107/README.md) | **문서 링크 CI 별도 담당 및 PR `#2740` 커밋 `c4fce43c` 소유** — 이미 저장소 상대경로로 수정하여 PR CI(`42375379091`) 통과 완료 (**중복 보정 금지**) |
| **3. 카탈로그 태그 빈 상태 i18n 계약** | Job `128413173274` (`Core regression shard / product` -> `catalog-status-i18n`) | `75f34f8d`(`0bc10e55`) 태그 페이지 변경에 대응하는 빈 상태 한/영 번역 키 등록 필요 | [`apps/web/src/domains/catalog/TagsPage.tsx`](../../apps/web/src/domains/catalog/TagsPage.tsx), [`apps/web/src/domains/catalog/catalog-status-i18n.ts`](../../apps/web/src/domains/catalog/catalog-status-i18n.ts), [`apps/web/src/domains/catalog/catalog-status-i18n-r3c08.test.ts`](../../apps/web/src/domains/catalog/catalog-status-i18n-r3c08.test.ts) | **카탈로그 i18n 별도 담당 및 PR `#2740` 커밋 `5a077ae0` 소유** — 이미 한·영 번역 등록 및 PR CI(`42375379091`) 통과 완료 (**중복 보정 금지**) |

---

## 5. 읽기 전용 검증 도구 및 실제 브라우저(`320/390/768/1440·200%`) 검증 결과

### 재현 명령

```bash
# Round 5 후속 감사 읽기 전용 검증 + 헤드리스 Chromium 뷰포트 검증
node docs/main-preservation-round5-20261107/verify-main-preservation-round5.mjs --browser

# 단위·계약 테스트 실행
node --test docs/main-preservation-round5-20261107/verify-main-preservation-round5.test.mjs
```

### 브라우저 뷰포트 및 200% 확대 검증 결과

| 뷰포트 / 배율 조건 | 해상도 (`W × H`) | 확대 배율 | `clientWidth` | `scrollWidth` | 가로 오버플로우 (`px`) | 카드 렌더링 | 필터 전환 상호작용 | 콘솔 / 페이지 에러 | 결과 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `320px-mobile` | `320 × 640` | `100%` | `320` | `320` | `0px` | `4 / 4` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `390px-mobile` | `390 × 844` | `100%` | `390` | `390` | `0px` | `4 / 4` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `768px-tablet` | `768 × 1024` | `100%` | `768` | `768` | `0px` | `4 / 4` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `1440px-desktop` | `1440 × 900` | `100%` | `1440` | `1440` | `0px` | `4 / 4` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `1440px-zoom-200pct` | `1440 × 900` | `200%` | `1440` | `1440` | `0px` | `4 / 4` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `320px-zoom-200pct` | `320 × 640` | `200%` | `320` | `320` | `0px` | `4 / 4` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
