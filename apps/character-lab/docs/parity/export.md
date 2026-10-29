# Character Lab 패리티 — export-paint (모델 위 드로잉 · 투명 PNG · 레이어 PSD · 레시피 · GLB)

상태: **current** (2026-10-28). 작업자 `export-paint`(W6)가 소유하는 행만 적는다. core가 `docs/shaper-parity-checklist.md`로 집계한다.
기본 기능 행은 2026-10-01 기록이며 2026-10-28 변경은 §8·§9에 명시한다. 이번 변경의 Node·jsdom·NullEngine 검증과 실제 GPU·외부 편집기 검증을 구분하며, 실행하지 않은 브라우저 검증은 "미검증"으로 적는다.

## 1. 기능 행 (SHAPER 항목 × 구현/Node 검증/브라우저 검증)

| SHAPER 항목 | 세부 요구 | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고(베타·사유) |
| --- | --- | --- | --- | --- | --- |
| 모델 위 드로잉 | 부위별 페인트 레이어(1024², RGBA8 straight, top-down) | 구현됨 | `src/paint/paint-layer.test.ts` | 미검증 | `createPaintLayer`, `PAINT_LAYER_DEFAULT_SIZE` |
| 모델 위 드로잉 | 소프트 dab(경도 0 가우시안·1 하드 엣지 AA), alpha = opacity×pressure, 선형 공간 source-over | 구현됨 | `paint-layer.test.ts`(중심 알파 = opacity, 경도 0/1 프로파일, 흰 바탕 50% 검정 ≈ sRGB 188) | 미검증 | Porter-Duff 1984 straight 식, sRGB↔linear LUT |
| 모델 위 드로잉 | spacing 보간(세그먼트 간 carry), UV 랩 최단 경로 | 구현됨 | `uv-stroke.test.ts`(간격 일정·carry·랩 [0,1)) | 미검증 | `interpolateDabs(from, to, brush, size, { wrap, carry })` |
| 모델 위 드로잉 | 타일(64px) undo 토큰, 1 스트로크 = 1 undo, undo 후 바이트 동일 | 구현됨 | `paint-layer.test.ts`, `stroke-session.test.ts`, `paint-session.test.ts` | 미검증 | 역토큰(redo) 반환, 가장자리 타일 잘림, 부위 불일치 throw |
| 모델 위 드로잉 | 뷰포트 포인터 → `engine.pick` → 스트로크 → `engine.updatePaintTexture` → `paint/stroke` dispatch | 구현됨(순수 드라이버) | `paint-bridge.test.ts`(1 토큰, 빈 공간/타 부위 통과 시 세그먼트 분리, cancel 원복, 압력) | 미검증 | `createPointerPaintDriver`는 Babylon을 모른다. ViewportPane(render 작업자)이 `pick/upload/commit` 콜백을 꽂는다. UV v 방향(glTF v=0 첫 행)·Babylon `invertY`는 브라우저 검증 항목 |
| 모델 위 드로잉 | history undo/redo가 페인트 토큰을 레이어·텍스처에 반영 | 구현됨(핸들러) | `paint-bridge.test.ts` | 미검증 | `createPaintUndoHandler(session, upload)` → `createLabStore({ onPaintUndo })`에 연결 필요(§4) |
| 모델 위 드로잉 | PaintPanel: 크기·색·불투명도·경도·간격, 레이어(부위) 선택, UV 랩, 되돌리기, 레이어 비우기 | 구현됨 | `app/shell/panels/PaintPanel.test.tsx`(jsdom) | 미검증 | 되돌리기 = `history/undo` 1회, 비우기 = 전체 타일 토큰을 `paint/stroke`로 dispatch |
| 투명 배경 출력 | 요청 해상도(16..4096) lit 패스 캡처, 뷰포트 크기 유도 금지, settle N스텝 | 구현됨 | `export/export-session.test.ts`(모의 엔진 호출 인자·크기 불일치·settle 실패·패스 실패) | 미검증 | `exportTransparentPng(engine, { width, height, framing, settleSteps })` |
| 투명 배경 출력 | readback → top-down·straight·sRGB 변환(flipY·premultiplied는 backend 상수) | 구현됨 | `export/raster-convert.test.ts`(왕복 알파 극단 0·1·255, 길이 오류) | 미검증 | `toTopDownStraight`, `decodeIdPass`, `decodeMaterialIdPass`, `decodeDepth(f32\|r8\|rgba-packed)` |
| 투명 배경 출력 | 자체 PNG 인코더(IHDR 8bit RGBA, sRGB·gAMA, IDAT deflate(CompressionStream), CRC32, IEND) + 디코더 | 구현됨 | `export/png-encoder.test.ts`(CRC 벡터, `node:zlib.inflateSync` 원본 일치, 필터 none/adaptive 왕복, CRC 손상 거부) | 미검증 | 의존성 0. `MAX_PNG_DIMENSION` 16384 |
| 레이어 PSD | 주선 추출: 휘도·알파 Sobel + depth 불연속 + normal 각도 + partId·materialId 경계, 선폭, 임계값 | 구현됨 | `export/line-extract.test.ts`(검은 평면 내부 0 회귀, 원 경계만, depth 계단 검출·램프 미검출, 크리즈·ID·휘도 채널 분리, 선폭 3 실루엣 내 팽창) | 미검증 | Sobel CPU 참조(연구 numericTarget: GPU Sobel 대비 일치율 ≥99.9%는 GPU 패스 구현 후 측정) |
| 레이어 PSD | tone-split: lit ≈ screen(multiply(flat, 음영), 하이라이트), 재합성 MAE ≤ 2/255 | 구현됨 | `export/tone-split.test.ts`(결정적 패턴·극단값·LCG 랜덤 패턴 MAE ≤ 2) | 미검증 | alpha=0 픽셀 제외, `opaqueMae`로 영수증 기록 |
| 레이어 PSD | 레이어 계획(bottom→top): 참조/깊이·법선(숨김) → 부위 ID 마스크(숨김 그룹) → 밑색(normal) → 음영(multiply) → 하이라이트(screen) → 페인트/<부위>(숨김, UV 공간) → 주선(normal) | 구현됨 | `export/psd-plan.test.ts`(이름·순서·blend·숨김 스냅샷, 건너뜀 사유, 2048 상한·패스 누락·크기 불일치 실패) | 미검증 | `PSD_MAX_DIMENSION` 2048, 영수증(`layerCount`, `groupCount`, `names`, `skippedKo`, `lineArtPixels`, `recomposeMae`) |
| 레이어 PSD | ag-psd `writePsdUint8Array` 조립(루트 imageData = lit, generateThumbnail:false), Node round-trip | 구현됨 | `export/psd-assemble.test.ts`(`readPsd` 왕복: 이름·순서·blend·숨김·크기·픽셀·합성 일치) | 미검증(Photoshop/CSP 열기) | Node는 `testing/psd-canvas-stub`, 브라우저는 `export/psd-canvas.browser.ts`를 ExportPanel이 PSD 직전 1회 등록 |
| 레이어 PSD | ExportPanel 옵션(ID 마스크·참조 패스), 진행·영수증·실패 표시 | 구현됨 | `app/shell/panels/ExportPanel.test.tsx`(jsdom) | 미검증 | 캔버스 등록 실패는 `export-psd-canvas` 사유 |
| 레시피 | 레시피 JSON 저장(키 정렬·결정적 바이트, 페인트 레이어 PNG base64 포함)·불러오기(strict zod, 미래 버전 거부, 손상 사유) | 구현됨 | `export/recipe-file.test.ts`, `export/paint-layer-record.test.ts`, `ExportPanel.test.tsx`(`recipe/load` dispatch·레이어 복원·업로드) | 미검증(파일 선택 UI) | `*.character.json`, 상한 64 MiB, `MAX_RECIPE_FILE_BYTES` |
| glTF/GLB | 엔진 `exportGlb` 호출 → 매직(`glTF`, v2) 검사 → 다운로드 | 구현됨(호출 계약) | `export/export-session.test.ts`(매직 검사·예외 → `export-glb`) | 미검증(Babylon GLTF2Export 실파일 재import) | GLB 내용은 render 작업자(`render/babylon/glb-exporter.ts`) 책임 |
| 다운로드 | Blob URL 생성 → `<a download>` 클릭 → URL revoke **정확히 1회**(성공은 지연, 실패는 즉시) | 구현됨 | `export/save-bytes.test.ts`(포트 주입: 성공·클릭 실패·URL 실패·빈 바이트·파일명 정리) | 미검증 | 브라우저 바인딩은 `export/download.browser.ts`(테스트 import 금지 규칙 준수) |

## 2. 공개 API 요약

### `src/paint/`
- `paint-layer.ts`: `createPaintLayer(part, w=1024, h=w)`, `stampDab(layer, dab, brush, { wrap, snapshots })` → `PaintUndoToken`, `dabMask(d, r, hardness)`, `compositePixelLinear`, `createTileSnapshotSet`/`snapshotTile`/`snapshotAllTiles`/`toUndoToken`/`mergeUndoTokens`, `applyUndoToken(layer, token)` → 역토큰, `clonePaintLayer`, `isPaintLayerEmpty`, `readPixel`, `effectiveRadius`, `wrapUnit`.
- `uv-stroke.ts`: `interpolateDabs(from, to, brush, size, { wrap, carry })` → `{ dabs, carry, lengthPx }`, `spacingPx`, `shortestUvDelta`, `uvDistancePx`.
- `stroke-session.ts`: `createStrokeSession(layer, brush, { wrap })` → `begin/extend/end`(1 스트로크 = 1 토큰).
- `paint-session.ts`: `createPaintSession(options)` → React 밖 스토어(`getState/subscribe/setBrush/setActivePart/setWrap/layer/beginStroke/extendStroke/endStroke/applyToken/replaceLayers/clearLayer/layersForExport`), `clampBrush`, `getDefaultPaintSession()`.
- `paint-bridge.ts`: `createPaintUndoHandler(session, upload)`, `createPointerPaintDriver(session, { pick, upload, commit })` → `down/move/up/cancel`, `clientToNdc(clientX, clientY, rect)`, `normalizePointerPressure(event)`.

### `src/export/`
- `raster-convert.ts`: `toTopDownStraight`, `toCapturedRaster`, `fromTopDownStraight`, `decodeIdPass`, `decodeMaterialIdPass`, `decodeDepth`.
- `png-encoder.ts`: `encodePng(raster, { filter: "none" | "adaptive", srgb })`, `decodePng`, `crc32`, `deflateBytes`/`inflateBytes`, `readPngChunks`, `parseIhdr`, `buildScanlines`, `isPng`, `PNG_MIME`.
- `line-extract.ts`: `extractLineArt(input, opts)` → `Uint8ClampedArray` 마스크, `extractLineArtChannels`(silhouette/luma/depth/crease/partBoundary/materialBoundary/combined), `lineArtToRaster`, `sobelMagnitude`, `countLinePixels`, `DEFAULT_LINE_ART_OPTIONS`.
- `tone-split.ts`: `splitTones(flat, lit)` → `{ shade, highlight }`, `recompose`, `opaqueMae`, `multiplyByte`, `screenByte`.
- `psd-plan.ts`: `planCharacterPsd(capture, paintLayers, { includeIdMasks, includeReferencePasses, lineArt })` → `PlanPsdResult`, `buildIdMaskLayers`, `idMaskColor`, `depthToRaster`, `downsampleRaster`, `PSD_MAX_DIMENSION`, `PSD_LAYER_NAMES`.
- `psd-assemble.ts`: `assemblePsd(plan, { compress })` → `Uint8Array`, `toAgPsd`, `toAgPsdLayer`, `PSD_MIME`. `psd-canvas.browser.ts`: `installPsdBrowserCanvas()`(멱등).
- `export-session.ts`: `exportTransparentPng`, `exportLayeredPsd`, `exportGlb`, `exportRecipe` → `ExportOutcome{ ok, bytes, receipt | failure }`, `buildCaptureRequest`, `validateExportDimensions`, `exportFileName`, `isGlb`, 상수 `MIN_EXPORT_DIMENSION`(16)·`MAX_PNG_EXPORT_DIMENSION`(4096)·`MAX_PSD_EXPORT_DIMENSION`(2048)·`MAX_SETTLE_STEPS`(600).
- `recipe-file.ts`: `serializeRecipe`, `parseRecipeFile`, `recipeFileName`, `embedPaintLayers`, `extractPaintLayers`. `paint-layer-record.ts`: `encodePaintLayerRecord`/`decodePaintLayerRecord`, `bytesToBase64`/`base64ToBytes`.
- `save-bytes.ts`: `saveBytesWith(ports, name, bytes, mime, { revokeDelayMs, now })`, `sanitizeFileName`. `download.browser.ts`: `saveBytes(name, bytes, mime)`, `createDomSavePorts`.

### 패널
- `app/shell/panels/PaintPanel.tsx`(`session` 주입 가능), `app/shell/panels/ExportPanel.tsx`(`session`, `deps: { save, now, readFile, preparePsd }` 주입 가능).

## 3. 수치 목표(연구 numericTargets) 대비

| 목표 | 현재 상태 |
| --- | --- |
| 투명 PNG: 완전 투명 픽셀 RGB=0, 반투명 에지 색 번짐 0 | Node 검증(`unpremultiply` a=0 → RGB 0, premultiply 왕복 오차 ≤ ⌈255/α⌉) |
| 투명 PNG 2048² ≤ 500 ms(readback+un-premultiply+encode) | 미측정(브라우저·GPU 필요). 인코더는 adaptive 필터 + 네이티브 deflate |
| tone-split 재합성 MAE ≤ 2/255 | Node 검증(결정적·랜덤 패턴) + PSD 영수증 `recomposeMae`로 매 출력 기록 |
| 주선: GPU Sobel vs CPU 참조 일치율 ≥ 99.9% | CPU 참조만 구현. GPU 패스는 render 작업자 범위, 비교는 브라우저 검증 |
| PSD 2048² 레이어 ≥ 10, 생성 ≤ 3 s, blendMode·그룹 보존 | 레이어 수는 옵션에 따라 7~10+(ID 마스크 N), Node round-trip 보존 검증. 시간·Worker 생성·CSP/Photoshop 열기는 미검증 |
| 레시피 JSON 왕복 바이트 동일 | Node 검증(`serializeRecipe` 키 정렬) |

## 4. 다른 작업자에게 전달하는 배선·계약 메모

1. **core(`app/composition.ts`)**: `createLabStore({ ..., onPaintUndo: createPaintUndoHandler(paint, uploadLayer) })`로 연결되어 `history/undo`가 같은 세션의 레이어와 엔진 텍스처를 갱신한다(2026-10-28 소스 확인).
2. **render(`ViewportPane`)**: 드로잉 모드에서 `createSwitchingPaintDriver`에 `pick: (x, y, options) => engine.pick(x, y, options)`, upload·commit을 연결한다. 포인터 이벤트는 `clientToNdc`·`normalizePointerPressure`를 거쳐 CPU 또는 베타 투영 드라이버에 들어간다. 마스킹 OFF의 신체 페인트만 선택 부위 pick 옵션을 명시한다.
3. **render(`babylon/capture.ts`)**: `texture.readPixels()` 결과는 `toTopDownStraight(rgba, w, h, { flipY, premultiplied })`로 변환한다(backend 상수는 render가 결정, 브라우저 검증 항목). 깊이는 `decodeDepth(f32, w, h, { near, far, flipY })`.
4. **render(`updatePaintTexture`)**: 레이어는 straight alpha·top-down(UV v=0 = 첫 행). Babylon `RawTexture.CreateRGBATexture`는 `invertY`를 명시해야 UV와 행 방향이 맞는다(브라우저 검증 항목).
5. `contracts/engine.ts`의 선택적 `CharacterPickOptions`만 확장했다(통합 담당 승인). 기존 2인자 `pick`은 모든 보이는 부위 중 최근접 hit 동작을 유지한다. 페인트·캡처·이벤트의 저장 계약은 유지한다.

## 5. 라이선스·출처

| 항목 | 출처 | 라이선스 |
| --- | --- | --- |
| PSD 조립 | `ag-psd` 31.0.1(직접 의존성, `patches/ag-psd@31.0.1.patch`) | MIT |
| PNG 인코더/디코더 | PNG 사양(ISO/IEC 15948) §5.5 CRC, RFC 1950/1951, 필터 Sub/Up/Average/Paeth | 사양 자체 구현(의존성 없음) |
| dab 합성 | Porter & Duff 1984 straight-alpha source-over, sRGB↔linear | 공개 수식 |
| 주선 추출 | Sobel 연산자, Saito & Takahashi 1990(깊이·법선 G-buffer 에지), Bénard & Hertzmann 2019 튜토리얼 | 공개 수식·논문(코드 복제 없음; rtsc/Blender Line Art(GPL) 미열람) |
| tone-split | Photoshop multiply/screen 분리형 블렌드 수식 | 공개 수식 |
| OKLab/색 변환 | `shared/color.ts`(Björn Ottosson 2020) | 공개 |

## 6. 초기 브라우저 미검증 항목(이전 검증 범위)

초기 검증에서 남긴 항목은 실제 GPU readback 행 순서·premultiply 상수, 페인트 텍스처의 UV 방향·반영, `<a download>` 저장 동작, ag-psd 브라우저 캔버스 등록 후 PSD를 Photoshop/CLIP STUDIO PAINT에서 열기, PSD 레이어 재합성 MAE 실측, GLB 실파일 재import, 2048² PNG/PSD 처리 시간이다. 2026-10-29의 실제 GPU·PSD 재합성 확인 범위는 §10을 따른다. 외부 편집기 호환성과 큰 이미지 처리 시간은 여전히 별도 검증이 필요하다.

## 7. 키트 소스 행 (KT-12, 2026-10-08)

| 항목 | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| GLB 내보내기: 키트 조립 씬(스킨 1개·68 joint, 숨긴 몸 삼각형 제외, 현재 morph influence를 메시 `weights`로, recolor 파츠 `baseColorFactor` = 현재 색) | 구현됨 | `render/babylon-glb-sparse-export.test.ts`(키트 케이스 5, NullEngine) | **미검증**(외부 뷰어에서 열기) | 계약 8.2 '미검증' 문구가 이 테스트로 확정됨 |
| PSD 마스크 레이어에 새 역할 `underwear`('속옷') 반영 | 구현됨 | `export/psd-plan.test.ts`(8), `export/export-session.test.ts`(10) | 미검증 | 마스크 단위는 역할이라 눈 L/R은 한 레이어 |
| 페인트 키트 경고(`paint/paint-kit-warning.ts`): `skin`·`head` 외 역할은 의상 변형을 바꾸면 UV가 달라져 그림이 어긋남 → PaintPanel 경고, 레시피 불러온 직후 `kitPaintWarningsForLayers` | 구현됨 | `paint/paint-kit-warning.test.ts`(4), `app/shell/panels/PaintPanel.test.tsx`(8, 키트 경고 3) | 미검증 | 막지 않고 경고만 한다. 정식 해결(레이어를 변형 id로 키잉)은 레시피 v3 후보 |

## 8. 헤어 PSD 실분리 (2026-10-28)

상태: **이전 구현 기록**. `splitHairLayers`를 켜고 `part-id`에 헤어·헤어 부속 픽셀이 있으면 본체 밑색·음영·하이라이트·주선에서 해당 RGBA를 비우고 헤어 그룹으로 옮겼다. 이 방식만으로는 부위 ID 밖의 외곽선을 분류하지 못하므로, 현재 내보내기 경로는 §10의 기하 소유권 캡처를 요청한다. 아래 표는 2026-10-28 당시의 검증 기록이다.

| 항목 | 구현 상태 | Node 검증 | 브라우저·외부 편집기 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 헤어·헤어 부속의 실제 알파 분리, 그룹 숨김 시 헤어 픽셀 제거, 본체 픽셀 보존 | 구현됨 | `export/psd-plan.test.ts` | 미검증 | 입력 캡처·원본 래스터를 수정하지 않는다. ID 패스 또는 헤어 픽셀이 없으면 기존 전체 레이어를 유지하고 사유를 기록한다 |
| 헤어 3레이어의 색 재합성·반투명 가장자리 보존 | 구현됨 | `export/psd-plan.test.ts`의 독립 normal/multiply/screen 재합성 | 미검증 | 헤어 하이라이트는 밑색에 보존하며 음영·주선은 헤어 밑색 알파에 clipping한다. 3레이어 형식에서 별도 하이라이트 편집은 제공하지 않는다 |
| PSD 바이트에 clipping·분리 알파 저장 | 구현됨 | `export/psd-assemble.test.ts`의 `assemblePsd` → `readPsd` 왕복 | 미검증 | 글로벌 계약·새 의존성 없이 로컬 레이어 계획을 `ag-psd` clipping 플래그로 직렬화한다 |

페인트 레이어는 기존과 같이 숨김 UV 참조로 보존한다. 현재 캡처에는 화면 공간 독립 페인트 패스가 없어 UV 이미지를 화면 레이어로 표시하지 않는다. 화면 공간 페인트 분리는 해당 렌더 패스를 제공하는 후속 작업이 필요하다.

## 9. 실제 필압·의상 가림 연결 (2026-10-28)

상태: **current**. PaintPanel의 필압·가림 설정을 React 밖 `PaintSession`에 두고 뷰포트의 CPU·베타 투영 경로가 읽는다. 기존 고정 반지름을 기본값으로 유지한다. 펜 모드는 PointerEvent 압력에 따라 반지름·알파를 바꾸며, 가상 필압은 종료 시 기록한 경로를 양끝이 가늘어지는 sin 곡선으로 재생한다. 재생 전 미리보기를 복원해 한 포인터 스트로크가 undo 토큰 하나를 만든다.

| 항목 | 검증 근거 | 실제 GPU 검증 | 한계 |
| --- | --- | --- | --- |
| 패널 선택 → 실제 펜 반지름·알파 픽셀 차이, 업로드·undo | `PaintPanel.test.tsx`, `ViewportPane.test.tsx`, `stroke-session.test.ts` | 미검증 | 마우스·터치는 기존과 같이 압력 1로 정규화한다 |
| 가상 필압 종료 후 실제 양끝 축소, 중간 불투명도·undo/redo 바이트 보존 | `stroke-session.test.ts`, `projection-paint-driver.test.ts` | 미검증 | 경로 끝을 알 수 있는 종료 시점에 최종 두께를 확정한다. 짧은 점 입력은 남긴다 |
| 의상 앞/뒤 최근접 기하 hit, ON은 몸 페인트 차단·OFF만 선택 몸 표면 hit | `babylon-paint-pick.test.ts`, `app/paint-occlusion.integration.test.ts`(실제 NullEngine 메시) | 미검증 | 포인터 중심의 가림만 검사한다. 큰 UV dab 전체 픽셀 가림이나 제거된 몸 삼각형 복원은 제공하지 않는다 |
| 같은 PaintLayer가 엔진 텍스처 업로드와 레시피 내 PNG 바이트에 반영 | `app/paint-occlusion.integration.test.ts`의 inspectPaint·exportRecipe 왕복 | 미검증 | NullEngine은 실제 lit 캡처의 색·UV 방향을 확인하지 못한다 |
| 투영 드라이버 반지름·알파, 가상 필압 재생, 선택 부위 pick 옵션 | `projection-paint-driver.test.ts`의 실제 overlay 합성·단일 undo | 미검증 | 모의 포트는 GPU 셰이더·실제 투영 픽셀을 검증하지 않는다 |
| 셰이더 준비 대기 중 각 dab 브러시 비트맵 보존 | `babylon-projection-brush-queue.test.ts`의 업로드 브러시 바이트 재생 | 미검증 | 가변 GPU 텍스처 참조 대신 비트맵을 큐에 저장한다 |

카메라 조작 설정·F/L/T 시점 연결은 `render/viewport-controls.ts`의 엔진 중립 포트를 거친다. 앱이 Babylon 내부 모듈을 직접 가져오던 경계 위반을 제거하고, 포트의 등록·해제는 `viewport-controls.test.ts`, 실제 카메라 각도 변경·재연결·장면 해제는 `babylon-responsiveness.test.ts`의 회귀로 확인한다. 최신 main 통합에서 중복 입력 포트를 제거하고 이전 입력 소유자와 새 소유자의 수명 관리를 같은 포트로 모았다.

## 10. PSD 알파·외곽선 소유권 보존 — 2026-10-29

상태: **current**. 기존 PSD의 본체 음영·하이라이트·주선을 일반 source-over로 쌓으면 부분 알파가 불투명해지는 결함과, 부위 ID가 0인 헤어 외곽선이 본체에 남는 결함을 재현해 수정했다. 밑색은 실제 lit 알파를 사용하고 음영·하이라이트·선은 PSD clipping으로 그 알파를 보존한다. flat 밖의 실제 hull 픽셀은 이미 렌더된 lit RGB를 보존한다. 입력 래스터는 수정하지 않는다.

추가 추출 주선은 원본 선 성분의 완전한 역분해가 아니므로 본체·헤어 모두 기본 숨김이다. 원래 렌더에 있던 선은 밑색·톤 분해 안에 보존된다. 사용자가 추출 주선을 켜면 추가 선 효과가 합성되며, 기본 표시 레이어의 재합성·영수증은 원본 lit와 비교한다. 숨긴 UV 페인트 참조 그룹은 clipping 연결 사이에 끼워 넣지 않는다.

| 항목 | 구현·검증 범위 | 제한 |
| --- | --- | --- |
| 실제 헤어 소유권 | 분리 PSD만 `includeHairOwnership`를 요청한다. 원래 메시·본·morph·알파 컷아웃·깊이 순서와 실제 native/필압 hull 경로를 별도 RTT에서 그린다. 원본색 추정·ID 팽창을 사용하지 않는다 | 기본 PBR·일반 툰의 불투명·지원되는 컷아웃 재질에 한함 |
| 같은 포즈의 lit·소유권 | 보조 재질 준비 후 lit의 실제 GPU 제출과 소유권 제출을 같은 동기 구간에서 수행한다. readback 중 물리 프레임이 진행돼도 두 draw의 본 회전은 같다 | 기존 다른 패스 전체를 한 시점으로 고정하는 계약은 추가하지 않았다 |
| MSAA 공유 픽셀 | 가시 샘플의 과반 소유로 전체 RGBA를 한 그룹에 배정하며 동률은 헤어에 배정한다 | 공유 픽셀에 섞인 본체·헤어의 색을 서브픽셀별로 역분리하지 않는다. 그룹 숨김은 이 픽셀 단위 소유 정책을 따른다 |
| 미지원 사전 안내 | 겹친 BLEND, 실제 반투명 정점 알파, 별도 opacity 맵, PBR UV2 컷아웃, 사용자 클리핑·베이크 정점 애니메이션·베타/미확인 재질은 저장 전 사유를 표시한다 | 헤어 분리를 끄면 일반 PSD 경로를 사용할 수 있다. 실제 알파가 전부 1인 RGBA 정점 데이터는 지원한다 |
| 수명·예산 | 보조 RGBA 1패스를 메모리 추정에 포함한다. 실패 시 임시 재질·override·native 선 색을 복원하고 타깃 lease를 해제한다. clone 수정·해제 후 원본 uniform·재질 옵션·공유 텍스처 보존을 검증한다 | 장치별 대형 출력 성능·모든 제작 에셋 조합은 별도 측정이 필요하다 |

실제 Chrome의 Apple M2 Max Metal WebGPU(`apple`·`metal-3`·fallback false, 추가 GPU 플래그 없음)에서 384²의 16조건을 검사했다. 불투명·정점 알파 1·본체 가림·컷아웃 각각에 PBR/툰 선 없음/native hull/필압 hull을 적용했다. 보조 요청 전후 기존 6패스(lit·flat·normal·part-id·material-id·depth) 바이트 차이는 모두 0이다. 저장된 PSD를 다시 읽어 제품 합성 함수를 사용하지 않는 source-over·clipping 계산으로 합성한 결과 16조건 모두 RGB 최대 오차 0, 알파 최대 오차 0이다. 헤어 그룹을 숨기면 소유권으로 지정한 헤어 잔여 알파 0, 나머지 픽셀 변화 0이다. 별도 hair-only/body-only 실제 렌더와 비교해 헤어 단독 footprint 밖의 잘못된 헤어 소유 픽셀도 0임을 확인했다.

움직임 시험은 실제 PhysicsBridge·스킨·WebGPU 경로에 결정적인 이동 provider를 주입했다. lit와 소유권 draw는 step 1의 같은 본 회전을 기록했고 readback 동안 step 2가 진행됐다. 같은 step의 소유권 없는 lit와도 바이트가 같으며 이 PSD의 독립 재합성 RGBA 오차도 0이다. 이 시험은 내장 물리 solver의 품질·성능 비교가 아니다.

검증 원본은 ignored 배치 `batch_generated/tripo-studio-2026-10-28/verification/shaper-hair-ownership-final-metal-manual/`와 `shaper-hair-ownership-moving-metal-manual/`의 `evidence.json`·`independent-psd-composite.json`에 있다. 이 작은 fixture의 결과로 Photoshop/CLIP STUDIO PAINT 실사용, 모든 헤어·의상 조합, 반투명 혼합의 정확한 분리 또는 SHAPER 이상의 품질을 주장하지 않는다.

추가 GPU 플래그 없는 Chrome의 명시적 WebGL2(`ANGLE Metal Renderer: Apple M2 Max`)에서도 16조건의 GLSL·컷아웃·native/필압 hull을 확인했다. 소유권 포함과 이후 일반 캡처의 기존 6패스 차이 0, 실제 PSD 독립 합성 RGB·알파 오차 0, 헤어 숨김 잔여 0, GL·페이지 오류 0이다. 초기에는 소유권 없는 일반 PBR 캡처끼리도 차이가 났지만, 이후 직접 색 처리 변종·첫 그림자 준비를 고쳐 해결했다([렌더 기록](render.md) §13). 양 실제 backend의 3가지 시작 조건에서 첫 캡처부터 6패스 반복 차이 0이며, 수정 뒤 384² PSD 16조건도 다시 통과했다. 최신 원본은 `shaper-hair-ownership-post-pbr-metal-manual/`·`shaper-hair-ownership-post-pbr-metal-webgl2-manual/`이다. 최초 실패·원인 분리 기록은 보존했다. 소프트웨어 보조 검사는 기존 서버 종료와 겹친 응답 대기·연결 거부로 미완료이며 셰이더 실패·성공으로 집계하지 않는다.
