# Brush Lab 표시 경계 계약 및 브라우저 프로브 (`presentation-boundary-probe`)

이 문서는 `apps/brush-lab`의 엔진 readback 산출물(`LabImage`, sRGB straight RGBA8)을 HTML5 `<canvas>`에 반영하는 표시 경계(`presentLabImage`), 흰 종이 배경 합성 경계(`flattenOnWhite`), 그리고 입력 유효성 검증 계약(`validateLabImage`)의 명세와 이를 실제 Chromium 브라우저 DOM에서 검증하는 전용 회귀 프로브(`scripts/presentation-boundary-probe/presentation-boundary-probe.mjs`)를 정의한다.

---

## 1. `LabImage` 입력 검증 계약 (`validateLabImage`)

`presentLabImage(canvas, img)`와 `flattenOnWhite(img)`는 픽셀 버퍼를 할당하거나 DOM `<canvas>` 상태를 변경하기 전에 반드시 `validateLabImage(img)`를 먼저 통과해야 한다. 검증에 실패하면 무음 대체나 부분 복사 없이 즉시 `SumiError("lab-image-invalid", message, { reason, ... })`를 던진다.

| 검증 항목 | 계약 조건 및 상수 | 위반 시 `details.reason` |
| --- | --- | --- |
| 객체 형태 | `img !== null && typeof img === "object"` | `"invalid-image-object"` |
| 유한 정수 차원 | `Number.isInteger(width) && Number.isInteger(height)` (`NaN`, `±Infinity`, 소수점 거부) | `"non-integer-dimensions"` |
| 양수 차원 | `width >= 1 && height >= 1` (`0`, 음수, `-4 × -4` 부호 상쇄 거부) | `"non-positive-dimensions"` |
| 크기·픽셀·바이트 상한 (산술 선검증) | `width <= MAX_LAB_IMAGE_SIDE_PX (2048)`, `height <= 2048`, `pixels <= MAX_LAB_IMAGE_PIXELS (4,194,304)`, `expectedBytes <= MAX_LAB_IMAGE_BYTES (16,777,216)` — 거대 버퍼 할당 전에 산술 선검증으로 차단 | `"dimensions-exceed-budget"` |
| 버퍼 타입 | `img.data instanceof Uint8ClampedArray` (`Uint8Array`, 일반 배열, `null` 등 거부) | `"invalid-buffer-type"` |
| 정확한 바이트 길이 | `img.data.byteLength === width * height * 4` (짧은 버퍼·초과 길이 버퍼 모두 거부) | `"buffer-length-mismatch"` |

---

## 2. 비파괴 캔버스 표시 순서 (`presentLabImage`)

HTML5 사양상 `canvas.width` 또는 `canvas.height`에 값을 대입하는 순간 브라우저의 캔버스 백킹 스토어는 즉시 투명 검정(`(0, 0, 0, 0)`)으로 초기화된 뒤 크기가 변경된다. 따라서 기존처럼 검증이나 컨텍스트 확보 전에 `canvas.width = img.width`를 먼저 수행하면, 잘못된 `LabImage`나 컨텍스트 오류가 발생했을 때 이미 그려져 있던 유효한 그림이 파괴된다.

`presentLabImage(canvas, img)`는 다음 **5단계 비파괴 순서**를 강제한다.

1. **`validateLabImage(img)`**: 차원·예산·버퍼 타입·바이트 길이를 선검증한다. 실패 시 `canvas.width`, `canvas.height`, 기존 캔버스 픽셀, 원본 `img.data`는 **1바이트도 변경되지 않는다**.
2. **`canvas.getContext("2d")`**: 2D 컨텍스트를 확보한다. `null`이면 `SumiError("canvas-2d-unavailable")`를 던지며, 리사이즈 이전이므로 기존 캔버스 크기와 픽셀이 보존된다.
3. **`ctx.createImageData(width, height)` + `imageData.data.set(img.data)`**: 스테이징 `ImageData`를 먼저 생성하고 픽셀 복사를 완료한다. 이 단계에서 예외가 발생하더라도 아직 `canvas.width`/`canvas.height`를 건드리지 않았으므로 기존 캔버스 크기와 픽셀이 그대로 보존된다.
4. **조건부 리사이즈 (`canvas.width !== width`, `canvas.height !== height`)**: 모든 검증과 스테이징 복사가 성공한 뒤에만 DOM 캔버스 크기를 맞춘다.
5. **`ctx.putImageData(imageData, 0, 0)`**: 스테이징된 픽셀을 1:1로 기록한다. 이후 다음 유효한 `presentLabImage` 호출이 들어오면 별도 재초기화 없이 즉시 정상 렌더링으로 복구된다.

---

## 3. 실제 브라우저 DOM 동작 vs 주입된 컨텍스트 결함 구분 (`executionKind`)

프로브 리포트는 검증 성격을 과장하지 않도록 실행 종류(`executionKind`)와 HTML5 Canvas의 물리적 한계를 명시적으로 구분한다.

1. **실제 브라우저 DOM 경계 검증 (`executionKind: "real-browser-dom"`)**:
   - `cpu-reference`(`ink-g-pen`) 및 `wasm-cpu`(`watercolor-wet`) 레인이 실제로 렌더링한 `64×48` 스트로크 이미지를 DOM `<canvas>`에 표시하고 `ctx.getImageData(0, 0, 64, 48)`로 실제 픽셀 해시(`baselineHash`)를 읽는다.
   - 9종의 무효 입력(`zero-dim`, `negative-sign-cancel`, `fractional-dim`, `nan-dim`, `inf-dim`, `over-budget-precheck`, `wrong-buffer-type`, `short-buffer`, `oversized-buffer`)이 거부된 직후 실제 DOM `canvas.width === 64`, `canvas.height === 48` 및 `getImageData` 해시가 `baselineHash`와 100% 일치함을 검증한다.
2. **주입된 2D 컨텍스트 결함 검증 (`executionKind: "browser-dom-with-injected-context-faults"`)**:
   - 정상 Chromium DOM에서는 유효한 `64×48` / `96×64` 캔버스에 대해 `getContext("2d")`, `createImageData`, `putImageData`가 실패하지 않으므로, 해당 방어 경로는 DOM 메서드 1회성 몽키패치(fault injection)로 검증하고 리포트에 `executionKind: "browser-dom-with-injected-context-faults"`로 정직하게 태깅한다.
   - **크기 변경 중 `putImageData` 예외의 비원자성 명시 (`crossSizePutImageDataClearsBackingStore: true`)**:
     - 동일 크기(`64×48` → `64×48`)에서 `putImageData`가 던지면 `canvas.width` 재할당이 일어나지 않으므로 기존 픽셀(`baselineHash`)이 그대로 보존된다.
     - 반면 교차 크기(`64×48` → `96×64`)에서는 4단계(`canvas.width = 96; canvas.height = 64`)가 실행되는 순간 HTML5 Canvas 사양에 의해 백킹 스토어가 `96×64` 투명 상태로 초기화된 뒤 5단계 `putImageData`가 호출된다. 따라서 5단계에서 강제 예외가 발생하면 이전 `64×48` 픽셀이 원자적으로 롤백되지 않으며, 프로브는 이를 원자적 롤백으로 과장하지 않고 `crossSizePutImageDataClearsBackingStore: true`로 정직하게 기록한 뒤 다음 정상 `presentLabImage` 호출에서 즉시 복구(`recoveredInkPixels > 0`)됨을 검증한다.

---

## 4. 흰 종이 배경 합성 경계 (`flattenOnWhite`)

PNG 스냅샷 저장에 쓰이는 `flattenOnWhite(img)`는 투명 배경의 sRGB straight RGBA8 이미지를 흰 종이(`#ffffff`) 위에 합성하여 불투명 RGBA8(`alpha = 255`) 새 `LabImage`를 반환한다.

1. **합성 수식 (채널별 $C \in \{R, G, B\}$)**:
   $$a = \frac{\alpha}{255}, \quad C_{\text{out}} = \operatorname{round}\!\left(C_{\text{src}} \cdot a + 255 \cdot (1 - a)\right), \quad \alpha_{\text{out}} = 255$$
   - 기준 픽셀(`R=40, G=120, B=200`)에서 $\alpha = [0, 1, 127, 254, 255]$일 때 결과는 정확히 `[255,255,255,255]`, `[254,254,255,255]`, `[148,188,228,255]`, `[41,121,200,255]`, `[40,120,200,255]`이다.
2. **원본 불변성 (Source Immutability)**:
   - 항상 새 `Uint8ClampedArray`를 할당하여 반환하며, 입력 `img.data`의 바이트는 절대 변경하지 않는다.
3. **짧은/손상된 버퍼의 백지 위장 금지**:
   - 과거 구현처럼 `src[i + 3] ?? 0`으로 누락된 바이트를 `alpha = 0`으로 채우면 잘린 버퍼가 정상적인 흰 종이(`255, 255, 255, 255`)로 둔갑해 손상이 은폐된다.
   - `flattenOnWhite`는 할당 전에 `validateLabImage(img)`를 호출하여 짧은 버퍼, 음수 차원(`-2×-2`), 예산 초과 차원(`2049×2048`)을 즉시 `SumiError("lab-image-invalid")`로 거부한다.

---

## 5. 음성 대조군(Negative Controls)

프로브와 단위 테스트는 검증기가 실제로 버그를 잡아내는지 확인하기 위해 2종의 음성 대조군을 실행하고 결정론적 실패(`detectedFailure: true`)를 확인한다.

1. **`legacyPresentMutatesBeforeValidate`**: 검증 전에 `canvas.width = img.width`를 먼저 대입하고 `img.data.subarray(...)`로 부분 복사하던 구형 로직을 스크래치 캔버스에서 실행했을 때, 무효/짧은 버퍼 호출로 기존 캔버스 크기나 픽셀이 훼손됨(`canvasWipedOrCorrupted: true`, `detectedFailure: true`)을 검증기가 탐지한다.
2. **`legacyFlattenDisguisesShortBufferAsWhite`**: 검증 없이 `?? 0` 폴백으로 루프를 돌던 구형 로직을 짧은 버퍼에 실행했을 때, 누락된 픽셀이 불투명 흰색(`255, 255, 255, 255`)으로 위장됨(`disguisedAsWhitePaper: true`, `detectedFailure: true`)을 검증기가 탐지한다.

---

## 6. 실행 방법

```bash
# 단위 테스트 (Vitest — 순수 판정기, 흰 배경 합성 정확도, 음성 대조군, 인자 파서, 소스 프로비넌스)
NODE_OPTIONS="--max-old-space-size=2048" pnpm exec vitest run apps/brush-lab/scripts/presentation-boundary-probe/presentation-boundary-probe.test.mjs --pool=forks --maxWorkers=1

# 실제 Chromium 브라우저 프로브 실행 (BRUSH_LAB_BROWSER_PROBE=1 게이트 필수)
BRUSH_LAB_BROWSER_PROBE=1 BRUSH_LAB_CHROMIUM_PATH=/usr/bin/chromium TMPDIR=/tmp node apps/brush-lab/scripts/presentation-boundary-probe/presentation-boundary-probe.mjs --out /tmp/brush-present-probe-test
```
