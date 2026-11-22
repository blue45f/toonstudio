/# Brush Library Internalization — 리버스엔지니어링 내재화 계획

**날짜:** 2026-10-18
**상태:** active
**목표:** Perfect Freehand, Libmypaint, Krita Core, Mixbox 네 라이브러리를 각각의 라이선스 게이트 안에서 개념/수식 단위로 내재화한다. Krita(GPL)와 Mixbox(CC BY-NC)는 코드 포팅이 금지되므로 개념·수식·검증 골든값만 참고한다.

---

## 라이선스 규약 (반드시 지킬 것)

| 라이브러리 | 라이선스 | 허용 범위 | 금지 |
|---|---|---|---|
| Krita (KDE) | GPL-2.0/LGPL | 브러시 파이프라인 개념, 파라미터 의미, 알고리즘 아이디어 | 코드 문자열 복사, 파일 단위 이식, 동일 식별자/주석/오프셋 |
| Mixbox (Spectral Iterations) | CC BY-NC (BANNED) | 수식 아이디어, 골든값 검증 | 코드·셰이더·에셋 복사, 패키지 import |
| Perfect Freehand | MIT | 전체 수식·로직 (게이트 통과 전 제출 금지) | — |
| Libmypaint | LGPL-2.1 | 개념·설정 맵·스프링 다이내믹 아이디어 (우린 기존 `libmypaint-lane.ts` 패턴 유지) | GPL 강제 연결 (LGPL 코드 포팅 시) |

**내재화 검증 원칙:** 신규 pigment 수식 파일은 `apps/brush-lab/src/engine/pigment/` 아래에 두고, 골든값은 원본 라이브러리 실행 결과를 기록한 JSON fixture로만 비교한다. 원본 소스 문자열이 테스트/구현 파일에 등장하면 `license-policy.test.ts` 게이트가 실패해야 한다.

---

## 파일 구조 (작업 시작 전 확정)

```
apps/brush-lab/
  docs/
    license-policy.md                       # 게이트 문서 (Phase 0 갱신)
  src/
    license-policy.test.ts                  # 게이트 테스트 (Phase 0 갱신)
    engine/
      pigment/
        kubelka-munk.ts                     # 기존 (Mixbox 검증 참조)
        km-mix.ts                           # 기존 (수식 관례)
        km-tables.ts                        # 기존
        km-transport.ts                     # 기존
        pigment-table.ts                    # 기존
        mixbox-compat.ts                    # 신규 (Phase 2)
        mixbox-compat.test.ts               # 신규
        krita-dynamics.ts                   # 신규 (Phase 1)
        krita-dynamics.test.ts              # 신규
      stroke/
        perfect-freehand/                   # 기존 (Phase 3 감사 후 보강)
          index.ts
          *.ts, *.test.ts
      brush-engine/
        krita-concepts.ts                   # 신규 (Phase 1)
        krita-concepts.test.ts              # 신규
    lanes/
      lane.ts                               # 계약 (probe→init→beginStroke→addSamples→endStroke→readback→dispose)
      krita-lane.ts                         # 신규 (Phase 1, concepts만)
      krita-lane.test.ts                    # 신규
      mixbox-lane.ts                        # 신규 (Phase 2, math만)
      mixbox-lane.test.ts                   # 신규
  test-data/
    mixbox-golden.json                      # 신규 (골든값 fixture)
    krita-golden.json                       # 신규 (골든값 fixture)
```

---

## 범위 밖 (아직 안 함)

- Krita GPL 코드 이식, Mixbox 코드/셰이더 이식
- WebGPU 셰이더로 mixbox_lerp 직접 포팅 (f32 GPU mirror는 기존 결정대로 8-bit quantization 초과분이 작아서 생략)
- Libmypaint LGPL 코드 이식 (기존 `libmypaint-lane.ts` 외부 엔진 비교 패턴 유지)
- `apps/web`의 pigment 브라우저 패치 (`apps/web/src/domains/creator/brush-lab/pigment/` — 독립 패치가 필요하면 Phase 6에서 별도 처리)
- Perfect Freehand WebGPU화 (추후 별도 계획)

---

## 검증 명령 (테스크마다, 최종)

```bash
cd apps/brush-lab && pnpm test                # 전체 단위 테스트
pnpm vitest run src/engine/pigment/            # pigment 모듈만
pnpm vitest run src/lanes/                     # lane 계약 준수 확인
pnpm vitest run src/license-policy.test.ts     # 라이선스 게이트
pnpm harness:verify                            # 저장소 전체 게이트
```

---

## Phase 0 — 라이선스 게이트 강화 (선행)

### Task 0.1 — license-policy.md에 내재화 규약 추가

**Files:**
- Edit: `apps/brush-lab/docs/license-policy.md`

**Must:**
- "내재화(Interalization)" 섹션 신설: Krita concepts-only, Mixbox math-only, Perfect Freehand full, Libmypaint concept-only 경로를 명시한다.
- BANNED_PACKAGES 테이블에 `mixbox` 항목에 "수식 아이디어만 허용, 코드/셰이더 금지" 주석을 단다 (패키지 import 자체는 여전히 금지).
- 허용 SPDX 목록은 건드리지 않는다.

**Test:** `pnpm vitest run src/license-policy.test.ts` (이 테스트는 코드를 바꾸지 않으므로 항상 통과해야 함)

---

### Task 0.2 — license-policy.test.ts에 내재화 위치 게이트 추가

**Files:**
- Edit: `apps/brush-lab/src/license-policy.test.ts`

**Must:**
- `REVIEWED`/`EMBEDDED_WASM`/`BINARY_COMPONENTS` 상수는 건드리지 않는다.
- 새 describe block `describe("internalization location gate", ...)` 추가:
  - `src/engine/pigment/mixbox-compat.ts`와 `src/engine/pigment/krita-dynamics.ts`가 존재할 경우, 파일 내용에 `import.*from.*["']mixbox["']` 또는 `import.*from.*["']krita["']` 패턴이 없음을 단언한다.
  - 신규 pigment 파일 위치가 `src/engine/pigment/` 밖이면 실패하는 guard 추가 (경로 assert).
- 기존 SPDX·BANNED·binary WASM 테스트는 손대지 않는다.

**Test:** `pnpm vitest run src/license-policy.test.ts` — 새 describe block이 0건으로 통과해야 하고, 나중 Phase에서 파일이 추가되면 여전히 통과해야 한다 (negative assertion).

**Commit:** `test(studio): brush-lab 라이선스 게이트에 내재화 위치 가드 추가`

---

## Phase 1 — Krita Core (concepts only, GPL)

### Task 1.1 — Krita 브러시 파이프라인 개념 정리 (읽기 전용)

**Files:**
- Read: 외부 Krita 소스 (`kis_paint_device`, `kis_brush_mask_applicator`, `KisCurveCircleRangeModel`, `KisSqueegeeEngine`) — **코드는 복사하지 않는다.**
- Create: `apps/brush-lab/docs/krita-concepts.md`

**Must:**
- 다음 개념을 우리 언어로 정리:
  1. **Dab generation**: 브러시 팁(dab)을 좌표 오프셋에 따라 마스크로 생성 → 색·브러시 크기·경도(hardness)로 조합.
  2. **Auto-increment / time-based parameters**: pressure, tilt, speed, time delta가 stroke 중 어떻게 파라미터를 업데이트하는지 (Krita의 `updateCurrentValues` 패턴).
  3. **Color smoothing**: `KisCurveCircleRangeModel`의 원형 보간 → 색공간에서 브러시 커서를 따라가는 부드러운 전환.
  4. **Mask applicator**: dab mask × 색 → paint device에 합성 (additive, multiplicative, erase mode 등).
- 각 개념마다 "우리 코드에 이미 있는 것 / 새로 만들 것" 표시.
- Krita 소스 코드 문자열은 복사 금지 — 개념 설명은 자연어로.

**Test:** 문서 검토 (자동 테스트 없음)

**Commit:** `docs(studio): Krita 브러시 파이프라인 개념 정리 문서 추가`

---

### Task 1.2 — krita-dynamics.ts: time-based 파라미터 다이내믹

**Files:**
- Create: `apps/brush-lab/src/engine/pigment/krita-dynamics.ts`
- Create: `apps/brush-lab/src/engine/pigment/krita-dynamics.test.ts`
- Create: `apps/brush-lab/test-data/krita-golden.json`

**Must:**
- `KritaDynamicsConfig` 타입: `{ pressureSmoothing: number; tiltSensitivity: number; speedDecay: number; timeConstant: number }`.
- `updateDynamics(state, sample, dtMs)` 함수: 입력 `state` (현재 파라미터값), `sample` (`{ pressure, tiltX, tiltY, dx, dy }`), `dtMs` (프레임 간격) → 업데이트된 파라미터 상태.
- 색 smoothing은 `updateDynamics` 밖에 두고, `smoothColor(prev, target, alpha)`로 분리 (원형 보간은 `kubelka-munk.ts`의 색공간 함수를 재사용).
- `Math.fround`로 f32 정확도 유지 (기존 `km-mix.ts` 관례 따름).
- 오류: `SumiError("kd-invalid-config", ...)`로 구조적 검증.

**Test (TDD):**
1. 빈 실패 테스트 먼저 작성: `updateDynamics`가 `pressureSmoothing=0`이면 즉시 `target.pressure`로 수렴, `speedDecay=0`이면 속도 무시.
2. 골든값 fixture: `krita-golden.json`에 3-5개 입력 시퀀스 (`pressure` ramp, `tilt` sweep, `speed` spike)와 기대 출력 (원본 Krita에서 추출한 concept 검증값 — 직접 실행하지 않았으므로 "우리가 기대하는 concept 동작" 기준으로 생성).
3. 경계: `dtMs <= 0` → `SumiError`, `pressureSmoothing` 범위 [0,1] 벗어나면 throw.

**Commit:** `feat(studio): Krita 다이내믹 concept 수식을 pigment 엔진에 내재화`

---

### Task 1.3 — krita-concepts.ts: dab mask applicator (mask × color 합성)

**Files:**
- Create: `apps/brush-lab/src/engine/brush-engine/krita-concepts.ts`
- Create: `apps/brush-lab/src/engine/brush-engine/krita-concepts.test.ts`

**Must:**
- `generateDabMask(size: number, hardness: number): Float32Array` — 원형 dab 마스크, hardness 0..1 (0=soft, 1=hard edge).
- `applyDab(mask, color, canvas: Float32Array, offsetX, offsetY, mode: "additive"|"multiply"|"erase")` — mask × color를 canvas에 합성.
- `canvas`는 RGBA interleaved (기존 `lane.ts`의 `StrokeColor` 규약 따름).
- 오류: 모드 미지원 → `SumiError("kc-invalid-mode")`, offset out of bounds → 무시 (paint device와 동일하게 클리핑).
- 색 변환은 `kubelka-munk.ts`의 `reflectanceToKsRatio` 등 재사용 — 새로 만드는 mixer 금지.

**Test (TDD):**
1. `generateDabMask(16, 1.0)` → 중심 픽셀 1.0, 가장자리 0.0 (hard edge).
2. `generateDabMask(16, 0.0)` → 그라디언트.
3. `applyDab` additive 모드: 기존 canvas 값 + mask × color.
4. `applyDab` erase 모드: 기존 canvas 값 × (1 - mask) 감쇠.
5. offset out of bounds → 경계 밖 픽셀 무시, 예외 없음.

**Commit:** `feat(studio): Krita dab mask applicator concept을 brush-engine에 내재화`

---

### Task 1.4 — krita-lane.ts: concepts-only lane (계약 준수)

**Files:**
- Create: `apps/brush-lab/src/lanes/krita-lane.ts`
- Create: `apps/brush-lab/src/lanes/krita-lane.test.ts`

**Must:**
- `lane.ts`의 `Lane` 계약을 따른다: `probe()`, `init()`, `beginStroke()`, `addSamples()`, `endStroke()`, `readback()`, `dispose()`.
- 내부 구현: `krita-dynamics.ts` + `krita-concepts.ts` 사용 — 원본 Krita 코드 미포팅.
- `probe()`는 절대 throw 금지 (ADR-0018) — 항상 `{ supported: true, reason: "concepts-only" }`.
- `abortStroke()` 중간 오류 보고 (`StrokeAbortReceipt.documentPreserved: true`).
- 등록: `registry.ts`에 추가하지 않는다 (Phase 1은 concepts-only 검증용, 별도 PR로 등록).

**Test (TDD):**
1. 계약 준수: `probe() → init() → beginStroke() → addSamples() → endStroke() → readback() → dispose()` 순서 통과.
2. `probe()`가 어떤 입력에서도 throw 하지 않음을 단언.
3. `abortStroke()` 호출 시 `documentPreserved: true` 반환.
4. `dispose()` 후 `readback()` → 기존 frame 그대로 (no mutation).

**Commit:** `feat(studio): Krita concepts-only stroke lane 추가 (계약 준수 검증)`

---

## Phase 2 — Mixbox (math only, CC BY-NC)

### Task 2.1 — mixbox-compat.ts: KM 기반 mixbox 호환 수식

**Files:**
- Create: `apps/brush-lab/src/engine/pigment/mixbox-compat.ts`
- Create: `apps/brush-lab/src/engine/pigment/mixbox-compat.test.ts`
- Create: `apps/brush-lab/test-data/mixbox-golden.json`

**Must:**
- `mixboxLerp(colorA: RGBA, colorB: RGBA, t: number): RGBA` — 우리 KM mixer(`km-mix.ts`)를 사용한 호환 API.
- 내부 구현: linear sRGB → KS ratio (기존 `kubelka-munk.ts`의 `reflectanceToKsRatio`) → linear mix → `ksRatioToReflectance` → linear sRGB.
- 색 검증: `resolveStrokeColor()` 패턴 (`lane.ts`) 따라 0..1 clamp, invalid → `SumiError("mxc-invalid-color")`.
- `Math.fround`로 f32 유지.
- `mixbox` 패키지 import 금지 (라이선스 게이트).

**Test (TDD):**
1. `mixboxLerp([0,0,0,1], [1,1,1,1], 0.5)` → 중간색 (기대값 fixture).
2. `t=0` → colorA 그대로, `t=1` → colorB 그대로.
3. `mixboxLerp(red, blue, 0.5)` → 보라 (KM mixing 검증).
4. 경계: alpha < 0 또는 > 1 → throw, `t` out of [0,1] → clamp.
5. `mixbox-golden.json` fixture: 5-10개 색 조합 × 3 t값, 기대 RGBA (우리 concept 기준으로 생성 — 원본 mixbox 코드 미참조).

**Commit:** `feat(studio): Mixbox 호환 lerp를 KM mixer 기반으로 내재화`

---

### Task 2.2 — mixbox-lane.ts: math-only lane (계약 준수)

**Files:**
- Create: `apps/brush-lab/src/lanes/mixbox-lane.ts`
- Create: `apps/brush-lab/src/lanes/mixbox-lane.test.ts`

**Must:**
- `lane.ts` 계약 준수: `probe()`, `init()`, `beginStroke()`, `addSamples()`, `endStroke()`, `readback()`, `dispose()`.
- 내부 구현: `mixbox-compat.ts` 사용 — `mixbox` 패키지 미포팅.
- `probe()` 절대 throw 금지.
- `endStroke()`에서 `mixboxLerp`로 색 blending 계산 후 frame에 합성.
- 등록: `registry.ts` 미등록 (Phase 2 검증용).

**Test (TDD):**
1. 계약 준수 시퀀스 통과.
2. `probe()` throw 안 함.
3. `endStroke()` 후 `readback()` → 올바른 blending 결과.
4. `dispose()` 후 frame 보존.

**Commit:** `feat(studio): Mixbox math-only stroke lane 추가 (계약 준수 검증)`

---

## Phase 3 — Perfect Freehand (MIT, 전체 내재화)

### Task 3.1 — perfect-freehand 현황 감사

**Files:**
- Read: `apps/brush-lab/src/engine/stroke/perfect-freehand/` 전체
- Create: `apps/brush-lab/docs/perfect-freehand-audit.md`

**Must:**
- 기존 `index.ts`와 테스트 파일을 읽고, 다음 항목을 체크:
  1. `getStrokePoints` — 스포인트 생성 (시뮬레이션 점 보간)
  2. `getOutlinePoints` — 아웃라인 생성 (압력/속도 기반 폭)
  3. `perfectFreehand` 메인 함수 — 점 → 아웃라인 폴리곤
  4. `taper` / `easing` 함수들
- 각 항목: "구현 완료 / 부분 / 없음" 표시.
- 누락된 항목이 있으면 Phase 3.2-3.5로 분기.

**Test:** 문서 검토 (자동 테스트 없음)

**Commit:** `docs(studio): Perfect Freehand 내재화 현황 감사 문서 추가`

---

### Task 3.2+ — (감사 결과에 따라 결정)

감사 결과 누락 항목이 있으면:
- 각 항목별로 TDD 테스크 추가 (failing test → 구현 → 커밋).
- 골든값: Perfect Freehand 원본 (MIT 허용) 실제 실행 결과를 fixture로 남긴다 — 라이선스 게이트 통과 후.
- `perfect-freehand.test.ts`에 계약 테스트 (probe/abortStroke 포함) 추가.

**Commit:** `feat(studio): Perfect Freehand [누락 항목] 내재화`

---

## Phase 4 — Libmypaint (LGPL, concept-only)

### Task 4.1 — libmypaint-lane.ts 현황 감사

**Files:**
- Read: `apps/brush-lab/src/lanes/libmypaint-lane.ts`, `mypaint-settings-map.ts`
- Create: `apps/brush-lab/docs/libmypaint-audit.md`

**Must:**
- 기존 외부 엔진 비교 패턴 (`hokusai-lane.ts` 참조)이 유지되어 있는지 확인.
- `mypaint-settings-map.ts`가 Libmypaint 파라미터를 우리 파라미터로 매핑하는지 확인.
- 누락된 concept (스프링 다이내믹, color wash mode 등)이 있으면 Phase 4.2로.

**Test:** 문서 검토

**Commit:** `docs(studio): Libmypaint lane 현황 감사 문서 추가`

---

### Task 4.2+ — (감사 결과에 따라 결정)

감사 결과 concept 누락 시:
- `src/engine/pigment/libmypaint-dynamics.ts` 신규 생성 (TDD).
- `libmypaint-lane.ts`에 통합.
- LGPL 코드 포팅 금지 — concept만.

**Commit:** `feat(studio): Libmypaint [누락 concept] 내재화`

---

## Phase 5 — 최종 검증

### Task 5.1 — 전체 harness:verify

**Files:** 없음 (명령만)

**Must:**
```bash
cd apps/brush-lab && pnpm test
pnpm harness:verify
```
- `license-policy.test.ts` 통과 (Phase 0 게이트 포함).
- `pnpm validate:architecture` 통과.
- Secretlint 통과 (변경 파일).
- `git status --short` 비어있어야 함 (모든 변경이 커밋되었는지).

**Test:** 위 명령 전부 exit code 0.

**Commit:** 없음 (검증 전용)

---

### Task 5.2 — docs/license-policy.md 최종 갱신

**Files:**
- Edit: `apps/brush-lab/docs/license-policy.md`

**Must:**
- "내재화(Interalization)" 섹션에 Phase 1-4 결과를 기록: 어떤 concept이 어디에 내재화되었는지.
- `reviewed` 목록에 신규 파일 추가 (필요 시).

**Test:** `pnpm vitest run src/license-policy.test.ts`

**Commit:** `docs(studio): brush-lab 내재화 결과를 license-policy에 기록`

---

## Dependency 그래프

```
Task 0.1 ─┐
Task 0.2 ─┘ (선행)
Task 1.1 → Task 1.2 → Task 1.3 → Task 1.4
Task 2.1 → Task 2.2
Task 3.1 → Task 3.2+ (감사 결과 분기)
Task 4.1 → Task 4.2+ (감사 결과 분기)
Task 5.1 (전체 검증)
Task 5.2 (최종 문서)
```

Phase 1/2/3/4은 독립적이므로 병렬 진행 가능. Phase 5는 전체 완료 후.

---

## 골든값 fixture 원칙

- `test-data/mixbox-golden.json`과 `test-data/krita-golden.json`은 **우리 concept 기준 기대값**을 기록한다 (원본 코드 미참조).
- 향후 원본 라이브러리를 실행한 결과와 비교할 수 있도록, fixture 스키마에 `source` 필드 추가: `"concept-verification"` (지금) → `"original-run"` (추후 원본 실행 후).
- fixture는 `apps/brush-lab/test-data/` 아래에 두고, `license-policy.test.ts`가 커밋되지 않음을 단언하는 guard와 함께 관리.

---

## 완료 정의

- [ ] Phase 0: 라이선스 게이트 내재화 가드 추가, 테스트 통과
- [ ] Phase 1: `krita-dynamics.ts`, `krita-concepts.ts`, `krita-lane.ts` 구현, 테스트 통과
- [ ] Phase 2: `mixbox-compat.ts`, `mixbox-lane.ts` 구현, 테스트 통과
- [ ] Phase 3: Perfect Freehand 현황 감사 + 누락 항목 내재화, 테스트 통과
- [ ] Phase 4: Libmypaint 현황 감사 + 누락 concept 내재화, 테스트 통과
- [ ] Phase 5: `pnpm harness:verify` + `license-policy.test.ts` + `validate:architecture` 전부 통과
- [ ] `git status --short` 비어있음, 모든 변경이 커밋됨

---

**다음 단계:** Task 0.1부터 시작 (라이선스 게이트 문서 갱신). Phase 0 완료 후 Phase 1-4 병렬 진행 가능.
