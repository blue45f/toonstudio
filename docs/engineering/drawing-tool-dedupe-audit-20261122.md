# Drawing Tool 브러시·필터·커스텀 브러시 제작 툴 중복 감사 및 통합 보고서

- **작성일**: `2026-11-22`
- **브랜치**: `refactor/drawing-tool-dedupe-consolidation`
- **문서 상태**: `current` (코드 실측 감사·통합 구현·자동화 회귀 계약 테스트 및 게이트 검증 완료)
- **관련 소스**:
  - [brush-studio-v6-recipe-dedupe.ts](../../apps/web/src/domains/creator/brush-lab/brush-studio-v6-recipe-dedupe.ts)
  - [studio-brush-canonical-dedupe.ts](../../apps/web/src/domains/creator/brush/studio-brush-canonical-dedupe.ts)
  - [studio-brush-authoring-hierarchy.ts](../../apps/web/src/domains/creator/brush/studio-brush-authoring-hierarchy.ts)
  - [studio-canonical-filter-registry.ts](../../apps/web/src/domains/creator/filter/studio-canonical-filter-registry.ts)
  - [StudioLegacyFilterCompatibilityDrawer.tsx](../../apps/web/src/domains/creator/filter/StudioLegacyFilterCompatibilityDrawer.tsx)
  - [StudioCanonicalFilterNotice.tsx](../../apps/web/src/domains/creator/filter/StudioCanonicalFilterNotice.tsx)
  - [StudioImageAdjustmentsPanel.tsx](../../apps/web/src/domains/creator/StudioImageAdjustmentsPanel.tsx)
  - [StudioBrushStudio.tsx](../../apps/web/src/domains/creator/brush/StudioBrushStudio.tsx)
  - [StudioBrushEngineMixer.tsx](../../apps/web/src/domains/creator/brush/StudioBrushEngineMixer.tsx)
  - [StudioBrushV6Workbench.tsx](../../apps/web/src/domains/creator/brush-lab/StudioBrushV6Workbench.tsx)
  - [StudioBrushProductCataloguePanel.tsx](../../apps/web/src/domains/creator/brush-lab/StudioBrushProductCataloguePanel.tsx)
  - [drawing-tool-dedupe-contract.test.ts](../../apps/web/src/domains/creator/brush/drawing-tool-dedupe-contract.test.ts)

---

## 1. 감사 요약 (Before → After 실측 비교)

코드 전수 스크립트와 런타임 인벤토리 분석을 기준으로 실제 확인한 중복 항목만 통합했다. 기존 저장 문서·즐겨찾기·최근 목록·URL 링크가 참조하는 레거시 ID는 100% 별칭(alias) fallback으로 호환을 유지한다.

| 점검 영역 | 지표 | Before (통합 전) | After (통합 후) | 비고 |
| --- | --- | ---: | ---: | --- |
| 브러시 프리셋·레시피 | 전체 등록 ID 중복 | 0건 | 0건 | 404종(Classic 비검역 246 + V6 158) ID 유일 |
| 브러시 프리셋·레시피 | V6 12슬롯 완전 중복 노출 | 2건 (158종 노출) | **0건 (156종 정본 노출)** | 별칭 2건 정본 통합 + 기존 ID 복원 유지 |
| 브러시 프리셋·레시피 | 아티스트 라이브러리 교차 중복 노출 | 6건 (404종 노출) | **0건 (398종 정본 노출)** | V6 완전 중복 2건 + Classic↔V6/확장 중복 4건 |
| 브러시 프리셋·레시피 | 카탈로그 단축 라벨(`shortName`) 충돌 | 8그룹 · 27종 충돌 | **0그룹 · 0종 충돌** | `"수묵 ·"`(7종)·`"수채 ·"`(4종)·`"유화 ·"`(4종) 등 절단 충돌 해소 |
| 필터 시스템 | 인스펙터 최상위 아코디언 노출 수 | 31개 평면 나열 | **11개 정본 + 1개 호환 서랍** | 중복 레거시 패널 21종을 접이식 서랍 1곳으로 격리 |
| 필터 시스템 | `StudioImageAdjustmentsPanel.tsx` 크기 | 1,019줄 (>800줄) | **372줄 (<800줄)** | 647줄 축소(레거시 호환 서랍 분리) |
| 필터 시스템 | 정본 필터 레지스트리 미매핑 CSP REA·다이얼로그 별칭 | 분산(별칭 표 부재) | **0건 (46/46 · 6/6 전수 매핑)** | 단일 정본 레지스트리에서 해석·감사 |
| 필터 시스템 | `studio-filter-catalog.ts` 내부 중복 키워드 | 1건 (`tileable-blur`) | **0건** | `"타일러블 블러"` 중복 제거 |
| 커스텀 브러시 제작 툴 | `StudioBrushStudio` 내 물성 섹션 중복 렌더 | 4개 탭 중복 렌더 | **1개 탭(`동적 반응`) 단일 배치** | `presets`·`tip`·`engines` 탭 중복 3곳 제거 |
| 커스텀 브러시 제작 툴 | UI 하드코딩 구수치 표기 | 2종 (`48종`, `241종`) | **0건 (실시간 카탈로그 수 연동)** | 실제 95종 / 246종 반영 |
| 커스텀 브러시 제작 툴 | 활성 라우트·페이지 내 퇴역 V5 제작기 노출 | 0건 (명시 계약 없음) | **0건 (회귀 계약 테스트 고정)** | 2단계 역할 계층(빠른 튜닝 → 전체 제작 V6) 명문화 |

---

## 2. 영역별 상세 감사 및 통합 내역

### 2.1 브러시 프리셋 및 V6 레시피 중복 정리

- **실측 인벤토리**:
  - Classic 브러시: 총 384종 등록(`core` 177 + `pro` 207), 기존 검역(`studio-brush-quarantine.ts`) 138종 제외 후 **246종 노출**(`defaultQuality` 95종[채색 93 + 지우개 2], `extended` 151종).
  - Brush Studio V6 레시피: 11개 카탈로그 모듈(`core` 23, `showcase` 8, `v7-material` 24, `v7-advanced` 24, `v8` 3, `v9-webtoon` 8, `km7-spectral` 5, `texture` 6, `mixbox` 23, `topology` 18, `procedural` 16) 합계 **158종**.
  - 아티스트 전체 라이브러리(`STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS`): **404종**.
- **발견한 실제 중복 및 충돌**:
  1. **V6 12슬롯 실행 서명 완전 중복 2쌍** (별도 R8 텍스처 사양 없이 스칼라 튜닝만 미세 차이):
     - `v7-split-raking-impasto`("스플릿 레이킹 임파스토") → 정본 `v7-split-fan-oil`("스플릿 팬 브러시 오일")
     - `mixbox-oil-pastel-film`("자체 안료 오일파스텔 필름") → 정본 `mixbox-pastel-smudge`("자체 안료 파스텔 스머지")
  2. **아티스트 라이브러리 교차 카탈로그 기능 중복 4건**:
     - `v6:zipper-teeth`("지퍼 이빨") → 정본 `material-zipper-teeth`("엇갈린 지퍼 이빨", 품질 검증 대표)
     - `v6:hatching-crosshatch`("문서 고정 교차 해칭 펜") → 정본 `web-cross-hatch-pen`("교차 해칭 펜", 품질 검증 대표)
     - `cross-hatch`("교차 해칭", 확장) → 정본 `web-cross-hatch-pen`
     - `oil--knife-edge`("유화 · 팔레트 나이프", 확장) → 정본 `palette-knife-edge`("팔레트 나이프 날", 품질 검증 대표)
  3. **상용 라이선스(`permissive-only`) 차단 구형 Mixbox 중복 12건**:
     - `BRUSH_STUDIO_V6_COMMERCIAL_REPLACEMENT_MAP`에 7밴드 분광(`km7-*`)·코어·토폴로지 상용 안전 정본 매핑을 단일 표로 등록(`mixbox-oil-bristle` → `km7-oil-impasto-bristle`, `mixbox-watercolor-bloom` → `km7-watercolor-wet-edge-bloom` 등 12건).
  4. **단축 라벨(`shortName`) 절단 충돌 8그룹 · 27종 (공백 정규화 기준)**:
     - 기존 `name.slice(0, 4)` 절단 때문에 `"수묵 ·"`(7종), `"수채 ·"`(4종), `"유화 ·"`(4종), `"붓 ·"`(3종), `"파스텔"`(3종), `"MyPa"`(2종), `"G펜"`(2종), `"크레용"`(2종)이 동일 단축명으로 표기되었다.
     - `studioBrushDistinctShortName`을 [studio-brush-catalog-core.ts](../../apps/web/src/domains/creator/brush/studio-brush-catalog-core.ts)와 [studio-brush-v6-catalog.ts](../../apps/web/src/domains/creator/brush/studio-brush-v6-catalog.ts)에 적용해 충돌을 0건으로 해소했다.
- **통합 구조 및 하위 호환**:
  - [brush-studio-v6-recipe-dedupe.ts](../../apps/web/src/domains/creator/brush-lab/brush-studio-v6-recipe-dedupe.ts): `BRUSH_STUDIO_V6_CANONICAL_RECIPES`(156종) 생성, `createBrushStudioV6Program` 및 `StudioBrushV6RecipeShelf` 정본 중복 제거·별칭 검색 연동.
  - [studio-brush-canonical-dedupe.ts](../../apps/web/src/domains/creator/brush/studio-brush-canonical-dedupe.ts): `STUDIO_CANONICAL_LIBRARY_BRUSH_CATALOG_ITEMS`(398종) 생성, `filterStudioBrushCatalogItems`의 기본 라이브러리 노출 중복 차단, `studioBrushCatalogItemById`·`materializeStudioBrushCatalogSelection` 별칭 fallback 연결.

### 2.2 필터 중복 감사 및 정본 필터 레지스트리 통합

- **실측 인벤토리 (5개 필터 표면)**:
  - 비파괴 스마트 필터(`STUDIO_FILTER_CATALOG`): **86종** (내부 ID 중복 0건, 효과 작업공간 웹툰 레시피 15종이 동일 스택 공유).
  - 모달 필터 다이얼로그(`STUDIO_FILTER_DIALOG_CATALOG`): **58종** (6종 별칭: `hue-saturation-brightness→hue-saturation`, `color-curves→curves`, `mosaic→pixelate`, `radial-blur→spin-blur`, `threshold→ink-threshold`, `noise-add→noise`).
  - 스택형 필터 갤러리(`STUDIO_FILTER_GALLERY_EFFECTS`): **107종** (WebGPU/CPU 7밴드 KM 분광 안료 필터 4종 포함).
  - CSP REA 필터 사양(`CSP_REA_ALL_FILTER_SPECS`): **46종** 중 **42종**이 스마트 필터 정본 엔진과 기능 중복, **4종**은 고유 레이어 변환/외곽선 작업.
  - 이미지 보정 인스펙터(`StudioImageAdjustmentsPanel.tsx`): 최상위 아코디언 **31개**가 평면 나열되어 있었으며, 이 중 **21개 개별 레거시 필터 패널**(`StudioImageFilterPanel` 18필드, `StudioBlurPanel`, `StudioClarityPanel`, `StudioDetailPanel`, `StudioDistortPanel`, `StudioPhotoFilterPanel`, `StudioOutlinePanel` 등)이 스마트 필터 스택·레이어 스타일(`selected.outline` 이중 편집 포함)과 직접 겹쳤다.
- **통합 조치**:
  1. [studio-canonical-filter-registry.ts](../../apps/web/src/domains/creator/filter/studio-canonical-filter-registry.ts)를 신설해 10대 정본 기능군, 다이얼로그 6종 별칭, CSP REA 46종(정본 42 + 고유 4), KM7 분광 필터 4종, 레거시 인스펙터 패널 21종을 단일 정본 ID 체계로 통합했다.
  2. [StudioLegacyFilterCompatibilityDrawer.tsx](../../apps/web/src/domains/creator/filter/StudioLegacyFilterCompatibilityDrawer.tsx)로 중복 레거시 패널 21종을 단일 접이식 서랍으로 격리해 최상위 노출을 31개 → 11개 정본 섹션 + 1개 호환 서랍으로 단순화했다. 기존 문서에 레거시 필터 값이 저장된 경우 적용 건수 배지와 함께 자동 전개되어 하위 호환 편집이 깨지지 않는다.
  3. [StudioCanonicalFilterNotice.tsx](../../apps/web/src/domains/creator/filter/StudioCanonicalFilterNotice.tsx)를 `StudioImageFilterPanel`, `StudioPhotoFilterPanel`, `StudioBlurPanel`, `StudioClarityPanel`, `StudioDetailPanel`, `StudioDistortPanel`에 연결해 각 패널에서 정본 비파괴 필터 경로를 일관되게 안내한다.
  4. [studio-filter-catalog.ts](../../apps/web/src/domains/creator/filter/studio-filter-catalog.ts)의 `tileable-blur` 중복 키워드(`"타일러블 블러"`)를 정리했다.

### 2.3 커스텀 브러시 제작 툴 역할 계층 일원화

- **발견한 중복·혼선**:
  1. `StudioBrushStudio.tsx` 내부에 자연매체 통합 물성 블록(`unifiedMediaSection`)이 `presets`·`response`·`tip`·`engines` 4개 탭에 중복 렌더링되고 있었으며, 헤더와 설명에 구형 하드코딩 수치(`"전 241종 브러시"`, `"전 241 브러시 통합 편집"`)가 남아 있었다.
  2. `StudioBrushEngineMixer.tsx`의 `StudioBrushComposerIntro`가 캔버스 빠른 조합과 V6 전체 스튜디오의 역할 경계를 안내하지 않아 두 제작 도구의 차이가 불명확했다.
  3. `StudioBrushProductCataloguePanel.tsx`가 실제 95종 카탈로그(`BRUSH_QUALITY_CATALOG.length`)를 `"시작 브러시 48종"` / `"48종 보기"`로 잘못 표기하고 있었다.
  4. `StudioBrushV6Workbench.tsx`가 중복 별칭이 포함된 158종 원본 목록을 그대로 노출하고 있었다.
- **통합 조치**:
  1. [studio-brush-authoring-hierarchy.ts](../../apps/web/src/domains/creator/brush/studio-brush-authoring-hierarchy.ts)로 **2단계 단일 제작 계층**을 정본화했다.
     - **1단계 (`canvas-quick-tune`)**: `StudioBrushStudio` + `StudioBrushEngineMixer` — 캔버스 작업을 끊지 않는 빠른 튜닝·조합·내 브러시 저장.
     - **2단계 (`full-studio-v6`)**: `StudioBrushLabPage` → `StudioBrushIntegratedWorkbench` → `StudioBrushV6Workbench` — 12슬롯 물리·재료 그래프·A/B 시험지 비교·정본 레시피 기반 신규 제작.
     - **퇴역 계층 (`legacy-v5-retired`)**: `StudioBrushV5Composer`, `StudioBrushV5QualityWorkbench`, `StudioBrushV5RuntimeWorkbench` — 활성 라우트 및 UI 노출 0건 계약 고정.
  2. `StudioBrushStudio.tsx`의 중복 `{unifiedMediaSection}` 3곳을 제거해 `동적 반응` 탭 1곳으로 일원화하고, 구형 `241` 문구를 실시간 카탈로그 수로 교체했다.
  3. `StudioBrushEngineMixer.tsx`의 `StudioBrushComposerIntro`에 2단계 브러시 스튜디오(V6) 직접 이동 링크(`data-studio-brush-tier2-handoff`)를 연결했다.
  4. `StudioBrushProductCataloguePanel.tsx`의 `"48종"` 하드코딩을 `{BRUSH_QUALITY_CATALOG.length}종`으로 교체했다.
  5. `StudioBrushV6Workbench.tsx`가 `BRUSH_STUDIO_V6_CANONICAL_RECIPES`(156종)와 `StudioBrushV6RecipeShelf(dedupeCanonical)`을 사용하도록 연결했다.

---

## 3. 의도적으로 유지한 구분 항목

아래 항목은 중복으로 오인하기 쉽지만 실제 실행 파이프라인·물리 모델이 달라 의도적으로 분리 유지한다.

1. **V6 R8 그레인 텍스처 페어 2쌍**:
   - `eroding-charcoal`(코어) vs `texture-rough-charcoal`(R8 `charcoal-tooth` height-combine 타일 바인딩)
   - `oil-hair-mixer`(코어) vs `texture-canvas-oil`(R8 `canvas-weave` height-combine 타일 바인딩)
2. **WebGPU/CPU 7밴드 Kubelka-Munk 분광 안료 필터 4종**:
   - `color.km7-spectral-gradient-map`, `color.km7-pigment-temperature-shift`, `color.km7-traditional-glazing`, `color.km7-pigment-harmonizer`는 선형 RGB 틴트(`StudioPhotoFilterPanel` 등)와 다른 물리적 감산 혼색 모델이므로 필터 갤러리 고유 계층(`filter.spectral-km7`)으로 유지한다.
3. **Classic 검역 프리셋(138종) 및 V6 원본 레지스트리(158종)**:
   - 기존 저장 문서·협업 스트로크의 픽셀 단위 결정적 재생을 깨뜨리지 않기 위해 등록 표와 별칭 해석은 보존하고, 아티스트 노출 표면만 정본 집합으로 제한한다.
4. **CSP REA 고유 레이어 연산 4종**:
   - `border-effect`(레이어 스타일 외곽선), `color-transfer`(색감 맞추기), `change-line-color`, `raster-to-vector`는 스마트 필터와 성격이 다른 레이어 단위 작업으로 유지한다.

---

## 4. 검증 결과 (`2026-11-22`)

- **신규 회귀 계약 테스트**: `apps/web/src/domains/creator/brush/drawing-tool-dedupe-contract.test.ts` — 브러시·필터·커스텀 브러시 제작 툴 중복 0건 및 별칭 호환 검증.
- **기존 브러시·필터·워크벤치 Vitest**: 관련 스위트 전체 통과.
- **브러시 12종 100/100 벤치마크 게이트**: `node scripts/verify-brush-100-competitor-score.mjs --min-score 100` — 12/12종 최소 100.0점 / 평균 100.0점 통과.
- **저장소 구조·품질 게이트**: `pnpm run harness:check`, `pnpm run validate:architecture`, `pnpm run check:unconnected-code:gate`, `pnpm run check:source-file-size` 전부 통과.
