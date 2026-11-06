# Brush Lab 좌표계 계약 및 브라우저 프로브 (`coordinate-space-probe`)

이 문서는 `apps/brush-lab`의 포인터 입력(`src/platform/pointer-capture.ts`), 실시간 획 세션(`src/app/state/live-session.ts`), 캔버스 표시(`src/platform/canvas-present.ts`), 그리고 그리기 워크벤치(`src/app/views/DrawView.tsx` · `src/app/ui/DrawCanvas.tsx`)가 따르는 **5단계 좌표계 계약(Coordinate-Space Contract)** 과 이를 실제 Chromium 브라우저에서 검증하는 전용 회귀 프로브(`scripts/coordinate-space-probe/coordinate-space-probe.mjs`)의 명세를 정의한다.

---

## 1. 5대 좌표계 정의 및 변환 수식

그리기 표면(`#lab-draw-stage` 또는 프로브의 `#coord-stage`)에서 발생한 포인터 입력이 브러시 엔진의 다브(dab) 합성 및 최종 캔버스 픽셀로 그려지기까지 다음 5개의 좌표계가 순서대로 개입한다.

### (1) CSS 클라이언트 좌표 (`clientX, clientY`)
- 브라우저 `PointerEvent`가 제공하는 뷰포트(viewport) 기준 CSS 픽셀 좌표다.
- 브라우저는 OS/디스플레이 배율(`window.devicePixelRatio`)을 이미 반영하여 CSS 픽셀 단위로 `clientX, clientY`를 보고하며, 페이지 스크롤(`window.scrollX`, `window.scrollY`) 및 컨테이너 스크롤(`scrollLeft`, `scrollTop`)이 반영된 뷰포트 상대 위치를 나타낸다.

### (2) 표면 경계 사각형 (`rect = el.getBoundingClientRect()`)
- 입력을 수신하는 스테이지 요소(`el`)의 뷰포트 기준 CSS 픽셀 경계 상자(`left, top, width, height`)다.
- 레이아웃 여백(margin/padding/flex/grid 오프셋), 페이지·컨테이너 스크롤 오프셋, 반응형 뷰포트 폭(`320px`, `390px`, 태블릿 `768px`, 데스크톱 `1440px`), 그리고 조상 요소에 적용된 허용 CSS 배율 변환(`transform: scale(...)`)이 모두 반영된 실제 화면상 CSS 크기와 위치를 돌려준다.

### (3) 정규화 표면 좌표 (`u, v`)
- 표면 경계 사각형 내부에서의 상대 위치 비율($[0, 1]^2$ 기준, 표면 밖 드래그 시 클램프 범위 내 외삽 가능)이다.
- 수식 (`rect.width > 0` 및 `rect.height > 0`일 때):
  $$u = \frac{\text{clientX} - \text{rect.left}}{\text{rect.width}}, \quad v = \frac{\text{clientY} - \text{rect.top}}{\text{rect.height}}$$

### (4) 문서 좌표 (`x, y` in `logicalSize = { width: docW, height: docH }`)
- 브러시 엔진 레인(`BrushEngineLane`), 원시 표본(`RawSample`), 입력 파이프라인(`InputPipeline` / `RawStage`), 다브 합성기, 습식(wet) 레이어가 사용하는 정본 논리 문서 좌표계다.
- 수식:
  $$s_x = \frac{\text{docW}}{\text{rect.width}}, \quad s_y = \frac{\text{docH}}{\text{rect.height}}$$
  $$x = (\text{clientX} - \text{rect.left}) \cdot s_x = u \cdot \text{docW}, \quad y = (\text{clientY} - \text{rect.top}) \cdot s_y = v \cdot \text{docH}$$
- `LiveStrokeSession.attach`는 `attachPointerCapture`에 항상 `logicalSize: { width: this.opts.width, height: this.opts.height }`를 전달하므로, CSS 표시 크기(`rect.width × rect.height`)가 반응형 레이아웃이나 CSS `scale`로 줄거나 늘어나더라도 `RawSample.x, y`는 항상 문서 좌표(`0..docW`, `0..docH`)로 정확히 매핑된다.

### (5) 캔버스 백킹 스토어 픽셀 (`canvas.width × canvas.height`)
- 표시 캔버스(`presentCanvas`, `#lab-draw-present`)와 미리보기 캔버스(`previewCanvas`, `#lab-draw-preview`)의 DOM 속성 크기(`canvas.width`, `canvas.height`)는 문서 크기(`docW × docH`)와 **1:1로 일치**한다.
- `presentLabImage(canvas, img)`는 `canvas.width = img.width`(`docW`), `canvas.height = img.height`(`docH`)로 맞추고 `putImageData(imageData, 0, 0)`로 픽셀을 1:1 기록한다.
- `presentPreview(canvas, points, radiusPx, predicted)` 또한 2D 컨텍스트에 추가 스케일 변환 없이 문서 좌표 `(p.x, p.y)`에 반경 `r`의 원호를 직접 그린다.
- 화면 표시 배율은 CSS 스타일(`width: 100%; height: 100%` 및 스테이지의 `width: min(100%, ${cssWidth}px); aspect-ratio: ${docW} / ${docH}`)이 담당하여 백킹 스토어(`docW × docH`)를 화면의 `rect.width × rect.height` 영역에 신축 표시한다.

---

## 2. DPR / 줌 의미론 및 이중 DPR(Double-DPR) 방지 규칙

1. **`LiveStrokeSession.initLane`의 `dpr: 1` 고정 이유**:
   - `LiveStrokeSession.initLane`은 레인 초기화 시 `{ width: opts.width, height: opts.height, dpr: 1 }`을 넘긴다. 여기서 `opts.width × opts.height`는 이미 최종 확정된 문서 픽셀 크기(`docW × docH`)이기 때문이다.
   - 만약 레인 내부나 `toLocal`에서 `window.devicePixelRatio`를 한 번 더 곱하면(Double-DPR 버그), DPR 2에서는 좌표가 2배로 튀어 중앙 $(0.5, 0.5)$ 클릭이 우하단 끝 $(1.0, 1.0)$에 찍히거나 캔버스 밖으로 이탈한다.
2. **고정 문서 모드 vs `fit`("화면 맞춤") 모드**:
   - **고정 문서 모드(`1024x640`, `512`, `1024`)**: 문서 크기 `docW × docH`는 DPR(`1`, `2`, `3`)과 무관하게 일정하다. `displayScale(doc, maxCssWidth)`는 고정 문서를 컨테이너 폭 안에 최대 1배(`Math.min(1, maxCssWidth / doc.width)`)로 맞추는 CSS 표시 비율만 계산한다.
   - **화면 맞춤 모드(`fit`)**: `fitDocumentSize(availCssWidth, availCssHeight, dpr)`가 가용 CSS 영역에 `scale = clamp(dpr, 1, 2)`를 **단 한 번** 곱해 `document: { width: docW, height: docH }`와 `css: { width: cssW, height: cssH }`를 산출한다(최대 변 `2048px`, 최대 타일 수 `6000`개 상한 적용). 이후 `toLocal`은 `docW / rect.width`와 `docH / rect.height` 비율만 곱하므로 DPR 1·2·3 어디서나 정규화 표면 위치 $(u, v)$는 동일한 정규화 문서 위치 $(u, v)$에 대응한다.

---

## 3. 획 도중 리사이즈 · 레이아웃 변동 · 퇴화 경계 처리 정책

1. **완료된 이전 획 보존 (Resize / Scroll / CSS Scale 불변성)**:
   - 뷰포트 크기 변경(`1280px` ↔ `768px` ↔ `390px` ↔ `320px`), 페이지·컨테이너 스크롤 이동, 조상 CSS `transform: scale(...)` 변경이 일어나도 레인 내부의 문서 버퍼(`docW × docH`)에 이미 합성된 이전 획들은 소실되거나 어긋나지 않고 그대로 보존된다.
   - 레이아웃 변경 후 새로 그리는 획은 매 이벤트 시점의 최신 `el.getBoundingClientRect()`를 읽어 변경된 레이아웃·스크롤·배율을 즉시 반영한다.
2. **획 도중 리사이즈 + 포인터 취소 (`pointercancel` / `lostpointercapture`)**:
   - 획 진행 중 뷰포트 전환·캡처 상실(`lostpointercapture`)·포인터 취소(`pointercancel`)가 발생하면 `LiveStrokeSession`은 진행 중이던 획만 `lane.abortStroke()`로 폐기(`documentPreserved: true`, `laneReplaced: false`)하고, 이전에 완료된 획의 픽셀과 획 수(`session.strokes`)를 온전히 유지한다(유령 획 없음).
3. **퇴화 표면(0×0 / 숨김 / 비유한 사각형) 및 극단 좌표 방어**:
   - 표면 크기가 `0×0`(`width: 0; height: 0`)이거나 숨김 상태(`display: none` 또는 `visibility: hidden`)여서 `rect.width <= 0` 또는 `rect.height <= 0`일 때:
     - 새로운 `pointerdown`은 무효 표면으로 판정하여 획을 시작하지 않는다(0 strokes, 0 errors).
     - 획 도중 표면이 `display: none` 등으로 `0×0`이 된 채 `pointermove` / `pointerup`이 들어오면 `NaN`/`Infinity` 또는 `(0, 0)` 점프 대신 마지막 유효 문서 좌표(`lastX, lastY`)를 유지하여 안전하게 마무리한다.
   - `getBoundingClientRect()` 결과에 `NaN`/`Infinity`가 섞이거나 이벤트의 `clientX, clientY`가 비유한 값(`NaN`, `±Infinity`) 또는 극단적 외삽 좌표(`±1e308`)일 때도 문서 좌표는 유한 클램프 범위(`±16384` 문서 px) 안으로 제한되거나 마지막 유효 좌표를 유지해 엔진·WASM 커널에 `NaN`이 유입되지 않는다.

---

## 4. 허용 오차(Tolerance) 및 해상도 간 비교 기준

1. **표본 좌표 오차 허용치 (`maxSampleCoordErrorDocPx <= 0.5`)**:
   - CDP 마우스 디스패치 위치 및 CSS 레이아웃·`scale(0.75)`/`scale(1.25)`의 부동소수점 반올림 오차를 감안하여, 기대 문서 좌표 $(u \cdot \text{docW}, v \cdot \text{docH})$와 실제 수집된 `RawSample` $(x, y)$ 사이의 최대 오차는 **`0.5` 문서 px 이하**여야 한다(정수 정렬 시 `0.0` px).
2. **렌더링 잉크 경계 및 십자선(Crosshair) 교차 중심 오차 허용치 (`<= 2.5` 문서 px)**:
   - 수평 중심 획 $(0.15, 0.50) \to (0.85, 0.50)$과 수직 중심 획 $(0.50, 0.15) \to (0.50, 0.85)$의 교차 중심 및 전체 잉크 중심(centroid)은 브러시 팁 반경과 종이 결(grain)을 감안해 문서 정중앙 $(0.50 \cdot \text{docW}, 0.50 \cdot \text{docH})$에서 **`2.5` 문서 px 이하**(정규화 오차 `<= 0.012`)에 위치해야 한다.
   - 좌상단 모서리 획 $(0.06, 0.06) \to (0.18, 0.06)$ 및 우하단 모서리 획 $(0.82, 0.94) \to (0.94, 0.94)$을 포함한 전체 잉크 외접 사각형(`[minX, minY, maxX, maxY]`)의 정규화 경계 오차(`boundsErrorNorm`)는 **`0.04` 이하**여야 한다.
3. **서로 다른 백킹 스토어 해상도 간 비교 규칙 (`fit` 모드 DPR 1 vs DPR 2)**:
   - `fit` 모드에서 DPR 1(`256×256`)과 DPR 2(`512×512`)처럼 백킹 스토어 픽셀 해상도(`docW × docH`)가 달라질 때는 브러시 다브 개수와 픽셀 격자가 달라지므로 원시 `pixelHash`를 직접 비교하지 않는다.
   - 대신 문서 크기로 나눈 **정규화 문서 공간($[0, 1]^2$)의 표본 좌표, 십자선 교차 중심, 잉크 외접 경계(`inkBoundsNorm`)** 를 비교하여 해상도와 무관하게 동일한 문서 내 상대 위치에 그려지는지 검증한다.
4. **음성 대조군(Negative Control) 필수 검증**:
   - 프로브와 단위 테스트는 의도적으로 (a) `window.devicePixelRatio`를 중복 곱하는 **이중 DPR 매퍼(Double-DPR bug)** 와 (b) 스크롤 오프셋을 보정하지 않는 **스크롤 미보정 매퍼(Uncompensated scroll bug)** 를 주입했을 때 `evaluateStrokeCoordinateAccuracy`가 결정론적으로 **`ok: false` (`detectedFailure === true`, 오차 `> 50` 문서 px)** 를 반환하는지 함께 검증한다.

---

## 5. 실행 방법

```bash
# 단위 테스트 (Vitest — 좌표 정확도 판정기, 음성 대조군, 인자 파서, 소스 프로비넌스)
pnpm exec vitest run apps/brush-lab/scripts/coordinate-space-probe/coordinate-space-probe.test.mjs --pool=forks --maxWorkers=1

# 실제 Chromium 브라우저 프로브 실행 (BRUSH_LAB_BROWSER_PROBE=1 게이트 필수)
BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node apps/brush-lab/scripts/coordinate-space-probe/coordinate-space-probe.mjs
```
