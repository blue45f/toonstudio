# Brush Lab 교차 크기 스테이징·스냅샷-롤백 원자성 계약 및 브라우저 프로브 (`presentation-atomicity-probe`)

이 문서는 `692ce068`의 입력 선검증(`validateLabImage`) 및 비파괴 표시 순서 위에 구축된 **교차 크기(cross-size) 스테이징·스냅샷-롤백 원자성 계약**(`presentLabImage`, `presentLabImageWithReceipt`, `getPresentRollbackDiagnostics`)과, 이를 실제 Chromium 브라우저 DOM 및 2D 컨텍스트 결함 주입 환경에서 검증하는 전용 회귀 프로브(`scripts/presentation-atomicity-probe/presentation-atomicity-probe.mjs`)를 정의한다.

---

## 1. 스테이징·스냅샷·커밋·롤백 파이프라인

HTML5 Canvas 사양상 `canvas.width` 또는 `canvas.height`에 값을 대입하는 즉시 브라우저 백킹 스토어가 투명 검정(`(0, 0, 0, 0)`)으로 초기화된다. 따라서 교차 크기 전환(`prevWidth !== width || prevHeight !== height`) 도중 `ctx.putImageData`가 실패할 때도 이전 화면을 보존하려면 리사이즈 직전에 이전 백킹 스토어 스냅샷을 확보하고 실패 시 크기와 픽셀을 함께 되돌려야 한다.

`presentLabImage(canvas, img)`와 `presentLabImageWithReceipt(canvas, img)`는 다음 **6단계 파이프라인**을 강제한다.

1. **`validateLabImage(img)` (산술 선검증)**:
   - 객체 형태, 유한 양의 정수 차원, 도메인 상한(`MAX_LAB_IMAGE_SIDE_PX = 2048`, `MAX_LAB_IMAGE_PIXELS = 4,194,304`, `MAX_LAB_IMAGE_BYTES = 16,777,216`), `Uint8ClampedArray` 타입, 정확한 바이트 길이(`width * height * 4`)를 할당 및 DOM 변경 전에 검증한다.
   - 위반 시 `SumiError("lab-image-invalid")`를 던지며, 스테이징 버퍼 할당이나 캔버스 변형은 전혀 일어나지 않는다.
2. **`canvas.getContext("2d")` 확보**:
   - 2D 컨텍스트가 `null`이면 리사이즈 전에 즉시 `SumiError("canvas-2d-unavailable")`를 던져 기존 캔버스 크기와 픽셀을 보존한다.
3. **오프스크린 `ImageData` 스테이징 (`ctx.createImageData(width, height)` + `data.set(img.data)`)**:
   - DOM 캔버스 크기를 건드리기 전에 타깃 크기의 `ImageData`를 먼저 할당하고 픽셀 복사를 끝낸다.
   - 이 단계에서 예외가 발생하면 `canvas.width`/`canvas.height`는 변경되지 않은 상태이므로 기존 화면이 100% 유지된다(`atomicityStatus: "preserved-pre-resize"`, `dimensionsRestored: true`, `pixelsRestored: true`).
4. **조건부 리사이즈 전 스냅샷 캡처 (`crossSize === true`일 때만)**:
   - `crossSize = (prevWidth !== width || prevHeight !== height)`이고 기존 캔버스가 유효 차원(`prevWidth >= 1 && prevHeight >= 1 && prevWidth * prevHeight <= MAX_LAB_IMAGE_PIXELS`)을 가질 때만 `ctx.getImageData(0, 0, prevWidth, prevHeight)`로 이전 백킹 스토어 스냅샷(`prevSnapshot`)을 캡처한다.
   - **동일 크기 스트로크 핫패스(`crossSize === false`)에서는 `getImageData`를 호출하지 않는다**(`snapshotCaptured: false`, `snapshotBytes: 0`).
   - 오염된(tainted) 캔버스 등으로 `getImageData`가 `SecurityError`를 던지면 예외를 삼키지 않고 `snapshotCaptured = false`로 기록한 뒤 커밋을 시도하되, 후속 롤백 시 픽셀 복원 불가를 정직하게 리포트한다.
5. **타깃 리사이즈 및 `ctx.putImageData(stagedImageData, 0, 0)` 커밋**:
   - `crossSize === true`일 때만 `canvas.width = width; canvas.height = height`를 대입하고 `ctx.putImageData(stagedImageData, 0, 0)`를 호출한다.
   - 성공 시 `PresentCommitReceipt`(`committed: true`, `atomicityStatus: "committed-same-size"` 또는 `"committed-cross-size"`)를 반환한다.
6. **`putImageData` 실패 시 원자적 롤백 및 진단 부착 (`getPresentRollbackDiagnostics`)**:
   - **동일 크기(`crossSize === false`)**: `canvas.width`/`height`를 건드리지 않았으므로 기존 백킹 스토어 픽셀이 그대로 유지된다(`atomicityStatus: "preserved-same-size"`, `dimensionsRestored: true`, `pixelsRestored: true`).
   - **교차 크기(`crossSize === true`)**: 즉시 `canvas.width = prevWidth; canvas.height = prevHeight`로 치수를 복원하고, `prevSnapshot`이 있으면 `ctx.putImageData(prevSnapshot, 0, 0)`를 호출해 이전 픽셀까지 완전 복원한다(`atomicityStatus: "restored-from-snapshot"`, `dimensionsRestored: true`, `pixelsRestored: true`).
   - 발생한 예외 객체에 `error.presentRollback`(`PresentRollbackDiagnostics`)을 부착(`getPresentRollbackDiagnostics(error)`로 조회 가능)한 뒤 원래 예외를 다시 던진다.

---

## 2. 메모리 및 성능 비용 상한 (Memory & Performance Cost Bounds)

| 경로 구분 | 조건 | `snapshotCaptured` | `snapshotBytes` | `stagedBytes` | `peakStagingBytes` | 추가 readback 오버헤드 |
| --- | --- | --- | --- | --- | --- | --- |
| 동일 크기 스트로크 핫패스 | `crossSize === false` (예: `64×48 → 64×48`) | `false` | `0 B` | `width * height * 4` (`<= 16 MiB`) | `width * height * 4` (`<= 16 MiB`) | **`0 B`** (`getImageData` 미호출) |
| 교차 크기 전환 | `crossSize === true` (예: `64×48 → 96×64`) | `true` (정상 2D 컨텍스트) | `prevW * prevH * 4` (`<= 16 MiB`) | `width * height * 4` (`<= 16 MiB`) | `snapshotBytes + stagedBytes` (`<= 32 MiB`) | 리사이즈 시 1회 일시 할당 후 즉시 해제 |

- 모든 크기는 `validateLabImage`의 픽셀 상한(`MAX_LAB_IMAGE_PIXELS = 4,194,304`, `MAX_LAB_IMAGE_BYTES = 16,777,216 B = 16 MiB`)으로 제한되므로, 교차 크기 전환의 순간 최대 스테이징 메모리(`peakStagingBytes`)도 `32 MiB`(`33,554,432 B`)를 절대 넘지 않으며 함수 종료와 함께 참조가 해제된다.

---

## 3. 완전한 픽셀 원자성을 보장할 수 없는 잔여 경계 (Explicit Non-Atomic Boundaries)

다음 3가지 물리적·플랫폼 한계 상황에서는 픽셀 단위 완전 롤백이 불가능하거나 동기 JS 턴 내부에서 중간 상태가 노출될 수 있으며, 구현과 프로브는 이를 은폐하거나 원자적 성공으로 위장하지 않고 명시적 상태 코드로 정직하게 보고한다.

1. **`dimensions-only-rollback-put-failed` (영구적 컨텍스트/디바이스 실패)**:
   - 교차 크기 커밋의 `ctx.putImageData(stagedImageData, 0, 0)`가 실패한 뒤, 롤백 단계의 `ctx.putImageData(prevSnapshot, 0, 0)`마저 연속으로 예외를 던지는 영구 결함 상황이다.
   - 이 경우 `canvas.width = prevWidth; canvas.height = prevHeight`로 **캔버스 치수는 복원(`dimensionsRestored: true`)**되지만, 백킹 스토어 픽셀은 리사이즈로 초기화된 투명 상태(`inkPixelsAfter === 0`)로 남으므로 **`pixelsRestored: false`, `atomicityStatus: "dimensions-only-rollback-put-failed"`**로 정직하게 기록한다. 이후 컨텍스트가 정상화되면 다음 `presentLabImage` 호출에서 즉시 복구된다.
2. **`dimensions-only-snapshot-unavailable` (스냅샷 캡처 불가 / 오염된 캔버스)**:
   - 교차 크기 리사이즈 직전 `ctx.getImageData(0, 0, prevWidth, prevHeight)`가 교차 출처 오염(`SecurityError`) 등으로 실패해 `prevSnapshot`을 확보하지 못한 상태에서 커밋 `putImageData`까지 실패한 경우이다.
   - 치수는 `prevWidth × prevHeight`로 복원(`dimensionsRestored: true`)되지만 되돌릴 스냅샷이 없으므로 **`snapshotCaptured: false`, `pixelsRestored: false`, `atomicityStatus: "dimensions-only-snapshot-unavailable"`**로 기록한다.
3. **동기 JS 턴 내부의 일시적 DOM `width`/`height` 속성 변경**:
   - 교차 크기 롤백은 동일 JS 실행 턴 안에서 `canvas.width = width` → `putImageData` 실패 → `canvas.width = prevWidth` 순서로 동기 수행된다. 브라우저 화면 합성(compositing)은 JS 턴이 끝난 뒤에 일어나므로 사용자 화면에는 중간 크기가 보이지 않지만, 같은 턴 안에서 동기 getter나 계측 훅이 개입하면 일시적인 치수 변경이 관측될 수 있다.

---

## 4. 음성 대조군 (Negative Controls)

프로브와 단위 테스트는 평가기(`evaluateCrossSizeAtomicityReport`)가 실제 화면 소실이나 허위 원자성 주장을 결정론적으로 잡아내는지 확인하기 위해 2종의 음성 대조군을 실행한다.

1. **`legacyCrossSizeWipesScreenOnTransientFault` (롤백 없는 구형 `692ce068` 교차 크기 동작)**:
   - 스냅샷·롤백 없이 리사이즈 후 1회성 `putImageData` 결함이 발생했을 때 캔버스가 `96×64` 빈 화면(`inkPixelsAfter === 0`)으로 남는 구형 동작을 재현하고, 검증기가 `detectedFailure: true`, `screenWipedOnTransientCrossSizeFault: true`로 이를 거부함을 확인한다.
2. **`dishonestPersistentFaultAtomicityClaim` (영구 결함 시 허위 픽셀 복원 보고)**:
   - 영구적 `putImageData` 결함으로 실제 DOM 백킹 스토어가 비워졌음(`inkPixelsAfter === 0`)에도 `pixelsRestored: true`로 허위 보고하는 리포트를 주입했을 때, 검증기가 `detectedFailure: true` 및 `reasons` 내 `"dishonest-pixel-restoration-claim"`으로 이를 거부함을 확인한다.

---

## 5. 실행 방법

```bash
# 단위 테스트 (Vitest — 스테이징 예산 평가기, 교차 크기 원자성 평가기, 음성 대조군 2종, 프로비넌스, CLI 인자)
NODE_OPTIONS="--max-old-space-size=2048" pnpm exec vitest run apps/brush-lab/scripts/presentation-atomicity-probe/presentation-atomicity-probe.test.mjs --pool=forks --maxWorkers=1

# 실제 Chromium 브라우저 프로브 실행 (BRUSH_LAB_BROWSER_PROBE=1 게이트 필수)
BRUSH_LAB_BROWSER_PROBE=1 BRUSH_LAB_CHROMIUM_PATH=/usr/bin/chromium TMPDIR=/tmp node apps/brush-lab/scripts/presentation-atomicity-probe/presentation-atomicity-probe.mjs --out /tmp/brush-atomicity-probe-test
```
