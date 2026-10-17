# Krita 브러시 파이프라인 개념 정리

이 문서는 Krita Core(GPL)의 브러시 파이프라인 개념을 **개념·수식 수준에서만** 우리 소스 코드(`src/engine/brush-engine/krita-*`)에 내재화하기 위한 참고 문서다.

## 원본 및 라이선스 경계

- 참조 대상(외부, 읽기 전용): `kis_paint_device`, `kis_brush_mask_applicator`, `KisCurveCircleRangeModel`, `KisSqueegeeEngine` 등 Krita 브러시 파이프라인 구성 요소.
- Krita Core는 **GPL**이다(license-policy.md 1절 `reject`). **Krita 소스 코드 문자열·식별자·주석·오프셋을 복사하거나 포팅하지 않는다.** 아래 모든 설명은 자연어로 재표현한 개념 요약이며, 허용 범위는 **개념·파라미터·수식 아이디어만**이다(license-policy.md 4.5절).
- 이 문서는 코드가 아니므로 `src/license-policy.test.ts` 게이트 대상이 아니고, 자동 테스트도 없다. 문서 검토만 수행한다.

## 1. Dab generation (브러시 팁 마스크 생성)

**개념(우리 언어):** 브러시 팁(dab)을 좌표 오프셋에 따라 마스크로 만들고, 여기에 색·브러시 크기·경도(hardness)를 조합해 하나의 찍기(dab)를 구성한다. 경도가 1이면 가장자리가 선명한 원형 마스크, 0이면 중심으로 갈수록 옅어지는 그라데이션 마스크가 된다.

**우리 코드에 이미 있는 것:** 없음(신규 개념).

**새로 만들 것:** `src/engine/brush-engine/krita-concepts.ts`의 `generateDabMask(size, hardness): Float32Array` — 원형 dab 마스크 생성(Task 1.3).

## 2. Auto-increment / time-based 파라미터 (압력·기울기·속도·시간 업데이트)

**개념(우리 언어):** 획 도중 압력·기울기·속도·시간 간격이 현재 파라미터 상태를 어떻게 갱신하는지(Krita의 `updateCurrentValues` 패턴). 예컨대 `pressureSmoothing = 0`이면 목표 압력으로 즉시 수렴하고, `speedDecay = 0`이면 속도 영향을 무시한다. dtMs(프레임 간격)에 따라 가속/감속 곡선이 적용된다.

**우리 코드에 이미 있는 것:** `src/engine/pigment/km-mix.ts`의 `Math.fround` f32 관례, `kubelka-munk.ts`의 색공간 함수(`reflectanceToKsRatio` 등).

**새로 만들 것:** `src/engine/pigment/krita-dynamics.ts`의 `updateDynamics(state, sample, dtMs)`와 `KritaDynamicsConfig`(Task 1.2). 색 smoothing은 `updateDynamics` 밖에 두고 `smoothColor(prev, target, alpha)`로 분리한다.

## 3. Color smoothing (색 보간)

**개념(우리 언어):** `KisCurveCircleRangeModel`의 원형 보간을 색공간에서 브러시 커서를 따라가는 부드러운 전환으로 적용한다. 색상은 RGB 직선 보간이 아닌 Kubelka–Munk 안료 혼색 공간에서 다뤄야 혼탁 없이 자연스럽게 혼합된다.

**우리 코드에 이미 있는 것:** `src/engine/pigment/kubelka-munk.ts`의 `reflectanceToKsRatio` 등 색공간 변환 함수.

**새로 만들 것:** `smoothColor(prev, target, alpha)` (Task 1.2에서 `updateDynamics` 밖에 둠). 원형 보간 로직은 `kubelka-munk.ts`의 색공간 함수를 재사용하고, 새 mixer를 만들지 않는다(license-policy.md 4절).

## 4. Mask applicator (dab 마스크 × 색 → paint device 합성)

**개념(우리 언어):** 생성된 dab mask에 색을 곱한 뒤 paint device에 합성한다. 합성 모드에는 additive(덧셈), multiplicative(곱셈), erase(지우개) 등이 있다. 오프셋이 캔버스 범위를 벗어나면 해당 픽셀은 클리핑되고 예외는 던지지 않는다(paint device와 동일).

**우리 코드에 이미 있는 것:** `src/lanes/lane.ts`의 `StrokeColor` 규약(RGBA interleaved).

**새로 만들 것:** `src/engine/brush-engine/krita-concepts.ts`의 `applyDab(mask, color, canvas, offsetX, offsetY, mode)`(Task 1.3). 미지원 모드는 `SumiError("kc-invalid-mode")`, offset out of bounds는 무시.

## 포팅 금지 사항(재확인)

- Krita 소스 코드 문자열, 식별자, 주석, 수치 오프셋: 복사 금지.
- `updateCurrentValues` 등 Krita 내부 함수명/구현체: 우리 코드에 그대로 사용 금지(개념 이름만 참고).
- Krita 코드를 실행해 얻은 골든값을 "원본 출력"으로 주장 금지: 기대값은 "우리가 정의한 concept 동작" 기준으로 생성하며 `source: "concept-verification"`로 표기(license-policy.md 6절 golden fixture 원칙).