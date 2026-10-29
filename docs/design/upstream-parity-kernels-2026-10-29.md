# 드로잉 커널의 업스트림 수치 대조 (2026-10-29)

- **상태**: `current` — fit-curve·perfect-freehand·roughjs(해칭 6종)는 업스트림과 같은 수치를 내도록 다시 적었고, simplify-js·rbush·roughjs 난수는 원래 같았음을 확인했다. 전부 설치된 업스트림을 직접 실행하는 테스트로 고정했다.
- **작성일**: 2026-10-29
- **구현 모듈**: [`studio-fit-curve-schneider.ts`](../../apps/web/src/domains/creator/drawing/studio-fit-curve-schneider.ts), [`studio-perfect-freehand-stroke.ts`](../../apps/web/src/domains/creator/drawing/studio-perfect-freehand-stroke.ts), [`studio-rough-sketch-renderer.ts`](../../apps/web/src/domains/creator/drawing/studio-rough-sketch-renderer.ts)
- **연결한 기존 모듈**: [`studio-bezier-curve-fit-brushes.ts`](../../apps/web/src/domains/creator/drawing/studio-bezier-curve-fit-brushes.ts), [`studio-freehand-rough-spatial-brushes.ts`](../../apps/web/src/domains/creator/drawing/studio-freehand-rough-spatial-brushes.ts)
- **테스트**: [`studio-upstream-parity.test.ts`](../../apps/web/src/domains/creator/drawing/__tests__/studio-upstream-parity.test.ts)

---

## 1. 배경

"업스트림을 내재화했다"고 적힌 커널이 실제로 업스트림과 같은 값을 내는지 확인하는 테스트가 없었다. 기존 테스트는 형태·개수·정규식 같은 스모크였고, 업스트림 패키지를 실행해 수치를 비교하는 테스트는 0건이었다. 조사에서 대상은 다섯 함수였다.

| 자체 함수 | 대조 대상 (이미 프로덕션 의존성) |
| --- | --- |
| `fitSchneiderCubicBezierSpline` | fit-curve 0.2.0 |
| `synthesizePerfectFreehandStrokeOutline` | perfect-freehand 1.2.3 |
| `synthesizeRoughSketchyStrokeAndHachureFill`, `RoughLehmerPrng` | roughjs 4.6.6 (해칭은 hachure-fill 0.5.2) |
| `simplifyStrokePolylineRdp` | simplify-js 1.2.4 |
| `queryStrokeSpatialRTreeBBox` | rbush 4.0.1 |

제품의 실제 벡터화·도형 경로는 이 패키지들을 직접 쓴다(`studio-vector-ink-geometry.ts`, `studio-rough-shape.ts` 등). 이 커널들은 브러시 랩 화면(`StudioUniversalBrushEngineBar.tsx`)에서만 쓰인다. 그래서 틀린 값이 제품 결과로 나가지는 않았지만, 문서와 테스트 이름이 "정확히 동작한다"고 주장하는 것은 사실이 아니었다.

---

## 2. 측정 결과

같은 입력을 자체 구현과 업스트림에 넣어 비교했다.

| 커널 | 대조 전 | 대조 후 |
| --- | --- | --- |
| fit-curve | **달랐다.** 지그재그 30점은 업스트림 29세그먼트, 기존 16세그먼트(허용오차 1·2·4px 모두). 잡음 80점 1px은 30 대 18, 4점 예제 1px은 3 대 2. 알고리즘 변형이 달랐다(3.1절). | 882건 비트 일치 |
| perfect-freehand | **다른 알고리즘이었다.** 같은 옵션으로 윤곽 점 수가 G펜 12(업스트림 10), 캘리그라피 12(9), 마커 14(43)였고 대응하는 점끼리 약 60px 떨어졌다. 압력·테이퍼·급커브·캡 처리가 단순화된 별도 설계였다. | 444건 비트 일치(스트로크 점과 윤곽 좌표) |
| roughjs 선·해칭 | **구조가 달랐다.** 난수를 부르는 순서, 반쪽·전체 오프셋 구분, 휘어짐(bowing) 무작위화, 해칭 선 계산이 달랐다. 같은 시드의 첫 이중선 시작점이 업스트림 (8.60, 9.67), 기존 (10.47, 10.37)이었다. | 선 360건과 다각형 외곽선·채움 360건 일치(채움 6종) |
| roughjs 난수 | 같았다. | 시드 9개 × 2만 회 일치(스크래치 측정은 시드 10개 × 10만 회) |
| simplify-js | 같았다. | 1,600건 점열 일치(스크래치 측정 4,000건) |
| rbush | 결과 집합과 트리 높이는 같았다. **R-트리가 아니라 선형 스캔**이었는데 주석은 OMT 벌크 로드라고 적혀 있었다. | 질의 1,800건과 트리 300개 일치, 주석 정정 |

### 2.1 fit-curve: 허용오차 계약 위반이 있었다

기존 구현은 구간이 3점 이하이거나 재귀 깊이가 8이면 오차와 무관하게 곡선 하나를 돌려줬다. 지그재그 30점에 허용오차 1~4px을 요청했을 때, 입력 꼭짓점에서 맞춘 스플라인까지의 최대 거리를 독립적으로 재면 다음과 같았다.

| 입력 | 허용오차 | 기존 구현의 최대 거리 | 새 구현의 최대 거리 |
| --- | --- | --- | --- |
| 지그재그 30점 | 1·2·4px | **20.39px** | 0.00px |

매끈한 입력에서는 기존 구현도 허용오차 안에 들어 있어서 스모크 테스트로는 드러나지 않았다.

### 2.2 fit-curve 0.2.0이 정석 Schneider와 다른 점

기존 구현은 교과서의 Schneider였고 fit-curve는 변형이다. 수치를 맞추려고 변형을 그대로 따랐다.

- 오차를 곡선 매개변수 u가 아니라 곡선 호 길이 10분할 표에서 찾은 t로 잰다.
- 재매개화는 `maxError < error * error`일 때 시도한다(`error`는 이미 제곱 허용오차).
- 뉴턴 단계 분모가 `|q'|² + 2·(q-p)·q''`다. 정석은 계수 2가 없다.
- 재매개화한 u로 곡선을 만들지만 오차는 처음 chord-length u로 잰다.

---

## 3. 대조 방법

- **오라클**: 설치된 업스트림 패키지를 매번 실행한다. 기대값을 손으로 적지 않는다.
- **말뭉치**: 시드 고정 mulberry32 난수와 손으로 고른 경계 사례다. 연속한 시드에서도 첫 출력이 고르게 퍼지는 난수를 쓴다(선형 합동 난수는 말뭉치가 치우쳐 한 변이 시험에서 살아남았다).
- **비교**: 좌표는 `===`로 비교하고 허용오차를 두지 않는다. 불일치는 구현을 고치거나 주장을 정정해서 해소한다.
- **커버리지 단언**: 말뭉치가 분기를 실제로 지나는지 센다. 예를 들어 점 1·2개 스트로크, 급커브가 있는 스트로크, 테이퍼·평평한 캡이 있는 스트로크가 각각 일정 수 이상이다.
- **변이 검사**: 저장소 모듈에 결함을 하나씩 넣고 대조 테스트가 실패하는지 확인했다. 29개를 넣어 29개가 실패했다. 처음 22개를 넣었을 때는 두 개가 살아남았다. 급커브 판정 경계(`<`와 `<=`)는 정수 좌표 계단형 스트로크를 모든 옵션으로 돌리도록 말뭉치를 보강해 잡았다. Douglas-Peucker 임계의 `>`를 `>=`로 바꾼 변이는 `index >= 0` 검사 때문에 동작이 같은 동치 변이여서, 최대 거리 동률 처리 변이로 바꿔 넣었다.

변이 검사에서 넣은 결함의 종류: 뉴턴 분모 계수, 재매개화 조건, 거리표 분할 수, 오차 기준 매개변수, 구간 처리 순서, 멈춤 판정 구간, 압력 변화율, 급커브 판정 경계(현재·다음 점), 두 점 보간 수, 끝 근처 건너뛰기 거리, 캡 분할 수, 프리셋 매핑, `divergePoint` 계수, 해칭 건너뛰기 임계, 해칭 반올림·각도, 지그재그라인 반복 횟수, 대시 시작 오프셋, 솔리드 채움 오프셋, 이중선 오프셋 크기, 방사형 필터 경계·마지막 점, Douglas-Peucker 동률, rbush 경계 포함과 높이 계산과 `maxEntries` 하한, 난수 곱셈 상수.

---

## 4. 업스트림과 일부러 다르게 둔 것

| 항목 | 업스트림 | 여기 | 이유 |
| --- | --- | --- | --- |
| fit-curve 분할점이 양 끝 | `undefined`를 읽어 던진다 | 안쪽 점으로 당긴다 | 항상 더 짧은 구간으로만 나뉘어 종료가 보장된다. 대조 말뭉치 1,984건에서 이 경로는 발동하지 않았다. |
| fit-curve 재귀 | 재귀 호출 | 명시적 스택 | 점이 많고 들쭉날쭉할 때 호출 스택 넘침을 막는다. 세그먼트 순서는 같다. |
| `fitSchneiderCubicBezierSpline` 입력 | 제한 없음 | 4,096점 초과 시 균등 솎기 | 최악 계산량이 점 수의 제곱이라 상한을 둔다. 처음과 끝은 유지한다. |
| roughjs 시드 0 | 호출마다 달라지는 `Math.random()` | 호출자가 준 난수원을 그대로 사용 | 같은 입력에서 같은 결과를 내려고. 난수원이 결정적이면 결과도 결정적이다. |
| `RoughLehmerPrng` 시드 정규화 | 시드를 그대로 사용 | 절댓값·나머지로 정규화하고 0은 고정 시드 | 양의 정수 시드에서는 수열이 같다. |
| 해칭이 입력 좌표를 회전했다 되돌림 | 입력 배열을 제자리에서 바꾼다 | 복사본에서 수행 | 호출자 데이터를 건드리지 않는다. 교차 해칭 두 번째 패스가 첫 패스의 부동소수 오차를 이어받는 동작은 그대로다. |
| dots 채움 | `Math.random()`과 타원 연산 | 같은 해칭 선분 위의 짧은 대각선(자체 설계) | 업스트림은 같은 시드로 재현되지 않는다. |
| `queryStrokeSpatialRTreeBBox` | R-트리 순회 | `minX`, `minY` 정렬 후 선형 검사 | 결과 집합과 높이만 같다. 항목이 많거나 질의가 잦으면 `studio-engine-scene-spatial-index.ts`처럼 rbush를 직접 쓴다. |
| `simplifyStrokePolylineRdp` 기본 허용오차 | 1px | 1.5px | 허용오차를 명시하면 같다. |

---

## 5. 범위 밖과 후속

- roughjs의 곡선·타원·호·SVG 경로 연산과 dots 채움은 옮기지 않았다.
- perfect-freehand는 `dist` 동작을 따랐다. 업스트림이 이후 버전에서 바뀌면 대조 테스트가 고정된 1.2.3 기준이다. 버전을 올릴 때 이 테스트가 먼저 깨져야 한다.
- 조사에서 확인했지만 이번에 하지 않은 것
  - brush-lab의 perfect-freehand·lazy-brush 골든은 아직 "원본 미실행" 값이다. 업스트림을 실행해 만든 골든으로 바꾸는 작업이 남았다.
  - signature_pad·atrament 실행형 오라클은 새 devDependency와 보안·라이선스 감사가 필요해 미착수다. 조사에서 signature_pad 핸들 순서(급커브 호 길이 +0.29%)와 atrament 스무딩 계수가 다르다는 전사 계산 결과가 있으나 실제 실행으로 확인한 값이 아니다.
  - croquis.js snake 안정기 포팅은 미착수다.
  - `mrdoob/harmony`(LICENSE 원문이 GPL-3.0-or-later)와 같은 수치 상수를 쓰는 자체 구현이 web·brush-lab에 있다. 파생 여부는 이번에 harmony 소스를 읽지 않아 판단하지 않았고, 코드는 바꾸지 않았다. 법무 확인이 필요한 사안이다.

---

## 6. 라이선스와 고지

- 세 모듈은 fit-curve 0.2.0(MIT, Copyright (c) 2014 Volker Poplawski), perfect-freehand 1.2.3(MIT, Copyright (c) 2021 Stephen Ruiz Ltd), roughjs 4.6.6(MIT, Copyright (c) 2019 Preet Shihn)과 hachure-fill 0.5.2(MIT, Copyright (c) 2023 Preet Shihn)의 동작을 따라 새로 적은 코드다. 각 파일 머리에 출처 버전과 저작권자를 적었다.
- 네 패키지는 모두 루트 `dependencies`의 프로덕션 폐포에 있어서 MIT 허가 문구가 릴리스 고지 산출물(`dist/legal/THIRD_PARTY_NOTICES.generated.md`)에 실린다. 새 의존성은 추가하지 않았다.
- 이 환경은 프로덕션 의존성 일부가 설치되지 않아(`@dimforge/rapier2d-compat`) `pnpm audit:licenses`를 실행하지 못했다. 고지 포함 여부는 `pnpm-lock.yaml`에서 폐포를 확인했다.

---

## 7. 재현

```bash
pnpm exec vitest run apps/web/src/domains/creator/drawing/__tests__/studio-upstream-parity.test.ts
```

변이 검사는 모듈의 해당 줄을 바꾼 뒤 같은 명령을 실행해 실패하는지 확인하고 원복하는 방식으로 했다. 스크립트는 저장소에 두지 않았다.
