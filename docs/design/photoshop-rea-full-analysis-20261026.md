# Adobe Photoshop (`Photoshop on the Web` v2026.21.0.0 & 바이너리 포맷 엔진) REA 전수 역공학 분석 및 ToonStudio 내재화 설계서

- **작성일**: 2026-10-26
- **상태**: `current` (구현 및 단위 테스트 검증 완료)
- **증거 번들**: [`docs/evidence/rea-photoshop-benchmark-20261026.json`](../evidence/rea-photoshop-benchmark-20261026.json)
- **관련 경쟁사 문서**: [`docs/studio-competitor-features.md`](../studio-competitor-features.md)

---

## 1. 개요 및 목적

본 문서는 `reverse-engineer-anything` (REA) MCP 도구를 사용하여 **Adobe Photoshop on the Web (`https://photoshop.adobe.com/`, 릴리스 `2026.21.0.0`, 빌드 `b0d20acb1bc01166f2d89379c0bb899204f6f9ff`)** 라이브 웹 애플리케이션과 **Adobe Photoshop 바이너리 포맷 엔진(`PSD`/`PSB`/`ABR`/`ASE`/`CSH`/`ActionDescriptor`/`LayerEffects`/`TextEngineData`)** 을 전수 역공학 분석하고, 발견된 6대 핵심 서브시스템을 ToonStudio 창작 스튜디오(`packages/studio-format-gateway` 및 `apps/web/src/domains/creator`)에 클린룸(Clean-Room) 자체 구현으로 내재화한 결과를 기록한다.

---

## 2. REA 역공학 증거 원장 (Evidence Ledger)

| 구분 | 대상 (Target) | REA 도구 | Evidence ID | SHA-256 Digest / 메트릭 |
| --- | --- | --- | --- | --- |
| 포맷 엔진 전체 | `node_modules/ag-psd/dist` (55 files) | `analyze_javascript_application` | `ev_d310f9f07eadffde37ee8ad798384d58908843d9307d4c2dfe320c5152772c9a` | Root SHA-256: `040b0bec82441e907261f645d31b8ae3fbc797452e420edfa12a5cb369c22ab0` |
| 포맷 코어 13종 | `psdReader.js`, `psdWriter.js`, `additionalInfo.js`, `descriptor.js`, `effectsHelpers.js`, `abr.js`, `csh.js`, `ase.js`, `text.js`, `engineData.js` 등 | `analyze_javascript_application` | Parent: `ev_1389c786e149edcb794d7345acc24456164a5b89c20bc5cac89540e43f7f60ff`<br>Summary: `ev_baf7e9b90ef7d44256e3d11a8711223f9089249aaa818f98933df3bbe98bdd66` | 470,246 bytes, 13 files parsed, 68,360 AST nodes, 373 findings |
| 라이브 캡처 1 | `https://photoshop.adobe.com/` 초기 부트스트랩 | `capture_browser_scenario` | `ev_3268cb6c719c0e5402006ebd7d9938ee08860e9a4a6a13e1e3775a8fee763be8` | HTML SHA-256: `ea7082ebeff0a78c2380c033398e2bbd523024a3e1504595c391c4eea7ee62e1`, 843 events |
| 라이브 캡처 2 | `https://photoshop.adobe.com/` 확장 네트워크 캡처 | `capture_browser_scenario` | `ev_6b29d1e1d54c69c8b15da0be918dc2c752bb561240e75d76fe7815ebf959d3bd` | 릴리스 `2026.21.0.0`, 빌드 `b0d20acb1bc01166f2d89379c0bb899204f6f9ff` |
| 라이브 캡처 3 | `https://photoshop.adobe.com/` 5MB 예산 전체 청크 캡처 | `capture_browser_scenario` | `ev_ff8af3693732ff12745cb3f95e0dbe43a99d1f5df1adbea25bdc62a81f3525d5` | Capture SHA-256: `356bea781687fb6c2bdb3600e421f93e20f3e520311d04726cdcb854f7fd17d8` |
| 스크립트 추출 1 | `export_web_scripts` (기본 캡처) | `export_web_scripts` | `ev_919699d957c7968f3ed9f6b73f64b12bab8ccb4ae0598675b3f1e1f2395ff82a` | 53 script files exported |
| 스크립트 추출 2 | `export_web_scripts` (5MB 캡처) | `export_web_scripts` | `ev_502b394046ace9b337ec7ce8eaa53144e39942978e28fae834c513f06af34040` | 58 script files exported |
| 정적 번들 분석 1 | Photoshop Web 기본 JS 청크 51종 | `analyze_javascript_application` | Parent: `ev_0fb6b10eccb962217a3bc3ff81417f7676422fa68a1e356b4b72b34f4007a9fa`<br>Summary: `ev_b7fa3a4c99257a2e1590e38056a0a1e751e0c9eb22c259d41e63c1adfdd65d1d` | Root SHA-256: `929f0c7d1092dd5262c3a31ac234a018b4c350da7d33002ad2153947eccacd1e`, 385,619 bytes, 76,416 AST nodes, 1,386 findings |
| 정적 번들 분석 2 | 대형 핵심 청크 4종 (`WebFilterPresets`, `AppHomePage`, `index`, `Localization`) | `analyze_javascript_application` | Parent: `ev_b13e529664f4df24e94b0247bdd1e8f19c044b2f1ce8703d520eb1e90b525a18`<br>Summary: `ev_973faac206a14eecb13f02df2d8d99e11806c47c95fabcdf52c9d57736b02b0a` | Root SHA-256: `bd84802a9c9a9f476626a0830baf61aa8ae511b41c6650834609a607b3d67506`, 561,370 bytes, 98,068 AST nodes, 630 findings |
| 정적 번들 분석 3 | 추가 핵심 청크 2종 (`adjustmentPresetsV2`, `SenseiService`) | `analyze_javascript_application` | Parent: `ev_effe0ee2754b2ce89afba22c9e65666598e2f08453a64f66a716f9c75cd969c4`<br>Summary: `ev_22fe4bb97fc6cc13f65ac8165ba8237ddf5db41320e2a4fbd0e57c9d4567d30e` | Root SHA-256: `8956eb6e29933669d88f35cd168c36441ac0098ecafc647371e47ac51f82b5f1`, 99,208 bytes, 24,561 AST nodes, 42 findings |

---

## 3. 인식론적 구분 (Observed Facts / Inferences / Unknowns)

### 3.1 관측된 사실 (Observed Facts)

1. **절차적 웹 필터 24종 및 Super-Presets (`WebFilterPresets.chunk.C-Wm1ZUu.js`, `ev_973faac206a14eecb13f02df2d8d99e11806c47c95fabcdf52c9d57736b02b0a`)**:
   - 일반 절차적 필터 18종(`analogPhotography`, `glitch`, `grain`, `halftone`, `bokeh`, `motionBlur`, `lensDistortion`, `retro90s`, `loFi`, `risograph`, `duotone`, `thermal`, `crtMonitor`, `nightVision`, `photocopy`, `chromaticAberration`, `vignette`, `vhs`, `filmNoir`, `oilPaint`, `watercolor`, `charcoalSketch`) 및 `psweb_procedural_filters_enable_advanced` 기능 플래그로 제어되는 고급 절차적 필터 6종(`lightLeak`, `linearRepeater`, `prism`, `sparkles`, `tileGrid`, `radialWaves`)이 존재한다.
   - 각 프리셋은 `[default, min, max, step]` 튜플 스키마와 정규화 파라미터를 가지며, `Super-Presets`는 복수의 필터 단계(`steps`)를 순차 체이닝한다.
2. **Quick Actions 4대 카테고리 & Adjustment Presets V2 (`index.chunk.DxDAUNGD.js`, `adjustmentPresetsV2.chunk.Oj-cp__5.js`, `ev_22fe4bb97fc6cc13f65ac8165ba8237ddf5db41320e2a4fbd0e57c9d4567d30e`)**:
   - Quick Actions는 `lighting`, `bg`, `cinematic`, `subject` 4개 카테고리와 13개 액션으로 구성되며, 실행 가능 여부를 판별하는 결정 트리(`canExecuteQuickAction`)가 잠긴 배경 레이어(`locked_background`), 조정 레이어(`adjustment_layer`), 빈 픽셀 레이어(`empty_pixel_layer`), 숨김 레이어(`hidden_layer`), 최대 레이어 수 초과 그룹(`group_exceeds_max_layers`)을 사전 차단한다.
   - 실행 시 `appliedActionSetId`로 태그된 비파괴 조정 레이어·마스크·스마트 필터를 생성하고, 되돌리기(`revert`) 시 해당 `appliedActionSetId`에 속한 레이어·마스크·필터만 원자적으로 제거한다.
   - `adjustmentPresetsV2`는 7개 그룹(`Landscape`, `Portrait`, `BlackAndWhite`, `Cinematic`, `Vintage`, `Duotone`, `ColorGrading`)에 걸쳐 31개 비파괴 조정 프리셋을 정의한다.
3. **ActionDescriptor BatchPlay 및 25종 블렌드 모드 (`AppHomePage.chunk.C3FbMFNP.js`, `descriptor.js`, `ev_973faac206a14eecb13f02df2d8d99e11806c47c95fabcdf52c9d57736b02b0a`, `ev_baf7e9b90ef7d44256e3d11a8711223f9089249aaa818f98933df3bbe98bdd66`)**:
   - `IntentHandler.Kt`가 25종 포토샵 블렌드 모드(`normal`, `dissolve`, `darken`, `multiply`, `colorBurn`, `linearBurn`, `darkerColor`, `lighten`, `screen`, `colorDodge`, `linearDodge`, `lighterColor`, `overlay`, `softLight`, `hardLight`, `vividLight`, `linearLight`, `pinLight`, `hardMix`, `difference`, `exclusion`, `subtract`, `divide`, `hue`, `saturation`, `color`, `luminosity`)와 8BIM 4문자 코드(`norm`, `diss`, `dark`, `mul `, `idiv`, `lbrn`, `dkCl`, `lite`, `scrn`, `div `, `lddg`, `lgCl`, `over`, `sLit`, `hLit`, `vLit`, `lLit`, `pLit`, `hMix`, `diff`, `smud`, `fsub`, `fdiv`, `hue `, `sat `, `colr`, `lum `)를 양방향 매핑한다.
   - BatchPlay ActionDescriptor가 브러시/지우개/스팟힐/복제 도장(`paint`, `erase`, `spotHeal`, `cloneStamp`), 칠 레이어(`makeFillLayer`), 조정 레이어(`makeAdjustmentLayer`), 레이어 속성(`setLayerProperties`), 스마트 오브젝트 변환(`convertToSmartObject`), 스마트 필터(`applySmartFilter`)를 구조화된 JSON 명령으로 실행한다.
4. **레이어 스타일 10종 (`lfx2`/`lrFX`) 및 썸네일 클리핑·래스터화 가드 (`effectsHelpers.js`, `index.chunk.DxDAUNGD.js`, `ev_baf7e9b90ef7d44256e3d11a8711223f9089249aaa818f98933df3bbe98bdd66`)**:
   - `DrSh`(Drop Shadow), `IrSh`(Inner Shadow), `OrGl`(Outer Glow), `IrGl`(Inner Glow), `ebbl`(Bevel & Emboss), `SoFi`(Solid Fill), `GrFl`(Gradient Fill), `patternFill`(Pattern Overlay), `FrFX`(Stroke), `ChFX`(Satin) 10종 레이어 스타일과 `useGlobalAngle` 전역 조명 동기화 규칙이 관측되었다.
   - 레이어 패널 썸네일 경계 클리핑(`layerPaletteClipThumbsToDocumentBounds` vs `layerPaletteClipThumbsToLayerBounds`)과 비픽셀 레이어(`text`, `shape`, `smartObject`)에 대한 픽셀 편집 시 `RasterizeWarningModal` 트리거 조건이 확인되었다.
5. **Face-Aware Liquify, Harmonize, Select Details & Sensei SPL (`Localization.chunk.DRYaYpi8.js`, `SenseiService.chunk.CxTFqGqz.js`, `ev_973faac206a14eecb13f02df2d8d99e11806c47c95fabcdf52c9d57736b02b0a`, `ev_22fe4bb97fc6cc13f65ac8165ba8237ddf5db41320e2a4fbd0e57c9d4567d30e`)**:
   - Face-Aware Liquify는 5종 모델 매니페스트(`face_detection`, `face_landmarks`, `face_semantics`, `skin_segmentation`, `depth_estimation`)와 눈·코·입·얼굴형 16개 슬라이더를 제공한다.
   - Harmonize는 전경 피사체 레이어의 루미넌스·RGB 색온도·채도를 배경 레이어 통계에 맞춰 합성한다.
   - Object-Based Select Details는 인물 세그멘테이션을 12개 세부 부위(`hair`, `eyebrows`, `eyes`, `pupils`, `nose`, `lips`, `teeth`, `facialSkin`, `neck`, `ears`, `upperClothes`, `lowerClothes`, `headwear`, `eyewear`, `accessories`)로 분할한다.
   - Sensei SPL 클라이언트는 8비트 상태 비트마스크(`SENSEI_GEN_STATUS_FLAGS`)와 고급 생성 파라미터(`referenceImageWeight`, `styleEffects`, `contentType`)를 사용한다.
6. **Adobe `.ase` 및 `.csh` 바이너리 포맷 (`ase.js`, `csh.js`, `ev_baf7e9b90ef7d44256e3d11a8711223f9089249aaa818f98933df3bbe98bdd66`)**:
   - `.ase`는 `ASEF` 헤더와 빅엔디안 블록(`0xc001`, `0xc002`, `0x0001`)에 UTF-16BE 이름 및 `RGB `/`CMYK`/`LAB `/`Gray` Float32 채널을 저장한다.
   - `.csh`는 `cush` 버전 2 헤더와 26바이트 베지어 매듭 레코드(8.24 고정소수점 좌표)로 커스텀 벡터 도형을 직렬화한다.

### 3.2 추론 (Inferences)

- **INF-PS-01**: Photoshop on the Web이 WebAssembly(`ps-wasm`)로 수행하는 절차적 필터, 하모나이즈 색 일치, 얼굴 랜드마크 기반 유동화(Liquify) 변형은 순수 TypeScript 결정론적 RGBA 커널 및 역방향 쌍선형 메쉬 워프(Inverse Bilinear Mesh Warp)로 클린룸 구현하여 브라우저 외부 의존성 없이 동작시킬 수 있다.
- **INF-PS-02**: ActionDescriptor BatchPlay 및 `lfx2`/`lrFX` 레이어 이펙트 모델은 ToonStudio의 기존 `@toonstudio/studio-format-gateway` 및 `LayerStylePatch` 구조와 1:1 무손실 변환이 가능하다.

### 3.3 미확인 영역 (Unknowns)

- **UNK-PS-01**: Adobe Firefly/Sensei 클라우드 백엔드 내부의 서버 전용 Diffusion 가중치는 클라이언트 번들에 포함되지 않는다. ToonStudio는 클라이언트 측 프로토콜(`SENSEI_GEN_STATUS_FLAGS`, 고급 스타일 프롬프트 빌더)과 결정론적 로컬 픽셀 하모나이즈/부위별 마스크 생성기로 이를 대체한다.

---

## 4. ToonStudio 클린룸 내재화 모듈 매핑

| 서브시스템 | 구현 파일 | 테스트 파일 | 핵심 내재화 기능 |
| --- | --- | --- | --- |
| 1. ASE & CSH 바이너리 코덱 | `packages/studio-format-gateway/src/ase-csh.ts` | `packages/studio-format-gateway/src/__tests__/ase-csh.test.ts` | `.ase` 색상 견본집 & `.csh` 커스텀 벡터 셰이프 양방향 바이너리 인코더/디코더 및 SVG 변환 |
| 2. 웹 필터 프리셋 & 슈퍼프리셋 | `apps/web/src/domains/creator/filter/studio-photoshop-web-filter-presets.ts` | `apps/web/src/domains/creator/filter/studio-photoshop-web-filter-presets.test.ts` | 24개 절차적 필터 카테고리, 고급 필터 플래그 게이팅, Super-Presets 체이닝, RGBA 픽셀 커널 |
| 3. 퀵 액션 & 조정 프리셋 V2 | `apps/web/src/domains/creator/filter/studio-photoshop-quick-actions.ts` | `apps/web/src/domains/creator/filter/studio-photoshop-quick-actions.test.ts` | 4대 퀵 액션 카테고리(13종), 활성화 결정 트리, `appliedActionSetId` 원자적 롤백, 31종 조정 프리셋 V2 |
| 4. ActionDescriptor & 25종 블렌드 모드 | `apps/web/src/domains/creator/filter/studio-photoshop-action-descriptor.ts` | `apps/web/src/domains/creator/filter/studio-photoshop-action-descriptor.test.ts` | 25종 블렌드 모드(`IntentHandler.Kt` + 8BIM 4문자 코드) 픽셀 합성기, BatchPlay 인터프리터, NGE 씬 임포터 |
| 5. 레이어 스타일 10종 & 썸네일/래스터화 가드 | `apps/web/src/domains/creator/layer/studio-photoshop-layer-styles.ts` | `apps/web/src/domains/creator/layer/studio-photoshop-layer-styles.test.ts` | 10종 `lfx2`/`lrFX` 코덱, Global Light 동기화, `LayerStylePatch` 브리지, 썸네일 클리핑 & 래스터화 경고 가드 |
| 6. 얼굴 인식 유동화·하모나이즈·세부 선택·Sensei SPL | `apps/web/src/domains/creator/filter/studio-photoshop-liquify-harmonize.ts` | `apps/web/src/domains/creator/filter/studio-photoshop-liquify-harmonize.test.ts` | 5종 모델 매니페스트, 16-파라미터 얼굴 유동화 워프, 하모나이즈 조명/색온도 매칭, 12부위 마스크, Sensei 8비트 상태 디코더 |
| 7. 통합 포토샵 기능 스위트 UI 패널 | `apps/web/src/domains/creator/filter/StudioPhotoshopFeatureSuitePanel.tsx` | `apps/web/src/domains/creator/filter/StudioPhotoshopFeatureSuitePanel.test.tsx` | 5개 탭 접근성(ARIA tablist/tabpanel) 기반 통합 조작 UI 컴포넌트 |
