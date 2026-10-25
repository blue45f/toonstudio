# AI 만화·인스타툰 제작 사이트, 전문 드로잉 프로그램, 3D 배경 스토어, 범용 디자인 툴 11대 플랫폼 REA 전수 역공학 및 내재화 보고서 (2026-10-26)

- **작성일**: `2026-10-26`
- **문서 상태**: `current` (구현 및 검증 완료)
- **증거 원장**: [`docs/evidence/rea-ai-webtoon-and-drawing-platforms-20261026.json`](../evidence/rea-ai-webtoon-and-drawing-platforms-20261026.json), [`docs/evidence/rea-sketchup-asset-marketplace-20261026.json`](../evidence/rea-sketchup-asset-marketplace-20261026.json)

---

## 1. 분석 대상 11대 플랫폼 및 REA 증거 요약

| 분류 | 플랫폼 | 분석 대상 URL / 번들 | 핵심 REA Evidence ID | 루트 SHA-256 / 규모 |
| --- | --- | --- | --- | --- |
| **1. AI 만화/인스타툰** | **투닝 (Tooning)** | `https://tooning.io/` · `https://plus.tooning.io/` | `ev_531772c38f8241d483ff8b801e56f5c9ac258f65d4f6a5648863f573d3d46750` | 7개 마이크로 프론트엔드 (`TG·TD·ED·MG·DV·TB·CM`) |
| **1. AI 만화/인스타툰** | **망고툰 (Mangotoon)** | `https://toon.mangoboard.net/` (`/h/library/design`, `/h/library/animation`, `/edit`) | `ev_527073ef7d5785233fe9bad4eb26add494d0367fa9035c91c8e41fa9a584403a` / `ev_50a74315bd20ceab9a71239725e1f15c2985664d06adc38ea46613baa56e9a33` | `47878d95b9b226b3456f01af4313484110c3ee8ebd41b10510a78adc8f886c7f` (46,118 AST nodes) |
| **1. AI 만화/인스타툰** | **젠툰 (GenToon)** | `https://www.gentoon.ai/` | `ev_ba66bd0ff65327ea155bb3e83cd741bb4831054e8c4b10d584f987dcd8fdedf1` / `ev_7abd2720a7057df1cb1372e89999ee9c5d3e3d1519694d7c6afca7cad06e9195` | `a10c77c96418c45cc42e9539e1edc156ded3298102319d3b6e9e690973c53ca6` (316,813 AST nodes) |
| **1. AI 만화/인스타툰** | **라마젠 (LlamaGen AI)** | `https://llamagen.ai/ko/features/ai-webtoon-generator` | `ev_61bf5933bc005a7141978cca08bb046cf62a79c91e0fc52b37a1d846521ea3c4` / `ev_31c6c173f4c810eb6d2411407d7990c2593083b47457cedd6eb4a669a20c7f95` | `d71bd6ccd35d71bb4cd0e8f5adcc7503fa6adfe44f65330377a09de3386b5e02` (303,034 AST nodes) |
| **2. 전문 드로잉/편집** | **클립스튜디오 페인트 v5.1.5** | `/Applications/CLIP STUDIO 1.5/App/CLIP STUDIO PAINT.app` & `/kr/comics-manga/` | `ev_a17ead8ed3475ba765556bf231b0b05197320b98fafa2e3b36baf55318692b16` / `ev_6bcb35a4ed91dae8e4c599f83d1aacc131cdde7280a4e8b8082abc0d3d6ff6cc` | `ddc2e3e8d20461111c37f4b0de038994601ad376dc17f58257b23a07fe89e36a` (48,701 AST nodes) |
| **2. 전문 드로잉/편집** | **메디방 페인트 / 팔레타** | `https://medibangpaint.com/ko/` | `ev_5dd7a1541fcae721613e7574980948a6e1657c409b9c6cc2d12bca12d4a9195d` / `ev_1fc3d4a13b1911569b4dfb62b316fc1dec6364e50f60f7892001946f4eb949ca` | `e677e7c5d74be82992b0f44483bfadddd74191ae615fe419a4a408ef8b73e604` (78,366 AST nodes) |
| **2. 전문 드로잉/편집** | **BlankComic** | `https://blankcomic.com/ko` & `/editor` | `ev_b8d56892d3587ff0e4960bfde94f4574d077238e582c821307a23ad1ab401039` / `ev_3ec33f998f149d30c43627474ddc2b0f911a5721db412443d7efd952b05b2a8f` | `b9cf9bce55adb7f700bdd029dc8596ba9defc9d99a9e7f64269e51717b568a8b` (22,656 AST nodes) |
| **3. 웹툰 배경 스토어** | **돈드로우 (DontDraw)** | `https://www.dontdraw.com/` | `ev_4d76ddc32c5f1ca5607359ca2709b6b494cf22fe54edc0f0db16eb7bd085aca8` / `ev_8dc39f905d683f4d7df6c3d9ede00202816e2dfb78a01ff98315b0a6da97c95c` | `0495abe7f4baa6d4f9a18b50302df1e605f72e43dff5fb8c58b399eac5691f5e` (34,619 AST nodes) |
| **3. 웹툰 배경 스토어** | **에이콘3D (ACON3D)** | `https://www.acon3d.com/ko` (`307 -> /ko/toon`) | `ev_b852ff1361da15c0a051f7c94facc8d8e81aedcbcad7cce7353cb50d3b3faa8f` | `844c018e0154127048d1e1a371408feb6a40e3e00b10edafe20fc7b50b432783` |
| **3. 웹툰 배경 스토어** | **텀블벅 (Tumblbug)** | `https://tumblbug.com/` | `ev_114e14c6182079be767bbed019f37e815d32ae28ea51bec0d53577b2787d807d` | `a3993c008f031c0da3d2df965bf351ef255bdc214dce06831c05c27e7438ccb0` |
| **4. 범용 디자인 툴** | **캔바 (Canva) 만화 메이커** | `https://www.canva.com/ko_kr/create/comic-strips/` | `ev_920aba703fa7614547380dc1050b37758a367d53fe2177621ae80fee12d7e0f4` / `ev_eb4a93a1ce2082e739e9f50d2b11248322c847544500179f8ed28f071a16e1c8` | `c8ecb6c27e7dc3c2a411432794d60ebf1ec5e445337f6777fdc1e03af7d037a7` |

---

## 2. 영역별 관측 사실(`observedFacts`) 및 클린룸 내재화 설계

### 2.1 AI 만화/인스타툰 제작 사이트 (투닝 · 망고툰 · 젠툰 · 라마젠)
1. **젠툰 (GenToon)**:
   - **관측 사실**: Webpack 모듈 `88698`/`50342`에서 9종 모델 카탈로그(`gemini-3.1-flash-image-preview` 13cr, `gemini-3-pro-image-preview` 25cr, `gpt-image-2.5-sunburst-*`, `gpt-image-2-medium` 웹툰 2:3, `gpt-image-2-low` 인스타툰 2:3)와 구독 티어(`FREE: 150` ~ `PREMIUM: 27000`), 모듈 `65576`의 `1080×1920` 30fps 숏폼 릴스 합성기(`sec = clamp(1.2 + chars/6.5 + 0.4*(cuts-1), 1.6, 9.0)`, 39.5초 초과 시 비례 축소, 순환 켄번즈 줌 `1.06/1.0/1.04`), 모듈 `71184`의 6분할 스티커 시트(`sheet`)·양면 머그컵(`mug_twin`) DPI 선명도 판정기(`sharp/ok/soft`)가 확인됨.
   - **내재화 모듈**: `apps/web/src/domains/creator/ai/ai-webtoon-platform-suite.ts` 및 `StudioAiWebtoonPlatformSuitePanel.tsx`.
2. **망고툰 (Mangotoon)**:
   - **관측 사실**: `library.js`에서 7개 탭(`page` 302px, `title` 272px, `cut` 272px, `background` 324px, `character` 420px, `horizontal` 330px, `vertical` 270px), 캐릭터 표정(`headCount`) × 포즈(`bodyCount`) 매트릭스, 소품 `interactWithCharacter` 플래그, `createContentData`의 7파라미터 필터 및 9방향 `blurEdge` 구조가 확인됨.
   - **내재화 모듈**: `createMangotoonContentPayload`, `MANGOTOON_LIBRARY_TABS`, `MANGOTOON_CHARACTER_PRESETS`.
3. **라마젠 (LlamaGen AI)**:
   - **관측 사실**: chunk `25338`에서 황금비 `1.618` 기반 세로 웹툰 스트립 기하학(`Smart Comic Grid`, `Smart Wide-Panel Strip`), chunk `20920`/`93340`에서 `ComicV2` 에피소드 연속성 스키마(`comicRoles`, `comicLocations`, `ComicV2GenerationCheckpoint`)가 확인됨.
   - **내재화 모듈**: `buildLlamaGenComicV2EpisodeSequence`.
4. **투닝 (Tooning)**:
   - **관측 사실**: 문장 입력 기반 교육·홍보용 컷툰 표정·포즈·배경·말풍선 추천 및 `plus.tooning.io` 7개 서브서비스(`TG·TD·ED·MG·DV·TB·CM`) 연동 구조가 확인됨.
   - **내재화 모듈**: `recommendTooningCutFromSentence` 및 `StudioTooningPlusSuitePanel.tsx`.

### 2.2 전문 드로잉/편집 프로그램 & 범용 만화 메이커 (클립스튜디오 v5.1.5 · 메디방 · BlankComic · 캔바)
1. **BlankComic**:
   - **관측 사실**: 30종 패널 템플릿, 12종 다각형·곡선 패널 도형, 6종 말풍선(`말하기`, `생각`, `외침`, `속삭임`, `내레이션`, `캡션`), 6종 페이지 규격(`US Comic`, `A4`, `Manga`, `Square`, `Webtoon`, `Custom`) 인쇄 여백·재단선·안전 영역 가이드, 5종 내보내기(`PNG`, `JPG`, `PDF`, `SVG`, `.blank`)가 확인됨.
   - **내재화 모듈**: `apps/web/src/domains/creator/manga-toolkit/blankcomic-canva-medibang-suite.ts` 및 `StudioBlankComicProDrawingSubPanel.tsx`.
2. **클립스튜디오 페인트 v5.1.5**:
   - **관측 사실**: 로컬 `CLIP STUDIO PAINT.app/Contents/Info.plist`에서 `.clip`, `.cmc`, `.csnf`, `.cs3c`, `.cs3o`, `.cs3s`, `.pep`, `.c2fr`, `.c2fc`, `.sut`, `.sutg`, `.laf`, `.cls`, `.xdts` 포맷이 확인되었고, 웹 페이지에서 스마트폰 표시 영역 비율 프리뷰, 세로 웹툰 분할 내보내기, 레이어 망점 스크린톤 변환 기능이 확인됨.
   - **내재화 모듈**: `CSP_V5_NATIVE_DOCUMENT_FORMATS`, `calculateCspWebtoonSmartphoneViewportAndSlices`, `convertLayerToHalftoneScreentone`.
3. **메디방 페인트 & 팔레타 / 캔바 만화 메이커**:
   - **관측 사실**: 메디방 클라우드 팀 프로젝트 페이지 잠금·버전 관리 및 iPad 팔레타 제스처 단축키, 캔바 4컷 만화 스트립 템플릿·타이포그래피 조합이 확인됨.
   - **내재화 모듈**: `evaluateMediBangCloudTeamPageLock`, `MEDIBANG_PALETTA_GESTURE_SHORTCUTS`, `CANVA_COMIC_STRIP_TEMPLATES`.

### 2.3 웹툰 배경 & 소스 스토어 (돈드로우 · 에이콘3D · 텀블벅)
- **관측 사실**: 돈드로우(`dontdraw.com`) HTML·JS 분석에서 `현대`(9개 소분류), `판타지`(6개 소분류), `동/서양`, `패키지`, `3D 소품/소재`(탈것·무기·의상/장신구·음식/식기), `360도 파노라마` 분류 체계와 11종 다중 포맷 배지(`skp`, `cs3o`, `cs3c`, `clip`, `laf`, `db`, `blend`, `fbx`, `obj`, `mtl`, `pdf`)가 확인됨.
- **내재화 모듈**: `apps/web/src/domains/creator/scene-3d/studio-3d-dontdraw-store-taxonomy.ts`, `studio-3d-dynamic-components.ts`, `studio-3d-webtoon-archetype-packs.ts`, `StudioBg3dDynamicComponentsPanel.tsx`.
