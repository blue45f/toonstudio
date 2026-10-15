# 3D 배경 추론(Inference) — SketchUp식 스냅·축 잠금·정확한 길이 입력

상태: `current` (2026-10-15 기준 구현). 아직 구현하지 않은 항목은 [알려진 한계](#알려진-한계와-후속-과제)에 따로 적었다.
브라우저(실제 WebGL 뷰포트)에서 사람이 조작해 확인한 기록은 없다. 이 문서의 동작 설명은 순수 단위 테스트,
합성 three.js 장면 테스트, jsdom 컴포넌트 테스트로 검증한 범위를 뜻한다.

## 한 줄 요약

끝점·중간점·중심·교차점·선 위·면 위·축 정렬·기준점 연장·평행·수직 추론을 **하나의 순수 TypeScript 파이프라인**으로
모으고, 줄자·기즈모 이동·모델 배치·밀기/당기기·(공개 훅으로) 방 빌더 벽 그리기가 같은 규칙을 쓰게 했다.
키보드(방향키 축 잠금, Shift 유지, Esc 취소, 숫자 입력 후 Enter)만으로도 마우스와 같은 결과에 도달한다.

## 1. 호출 그래프 분류 — 무엇이 실제로 연결되어 있었나

작업 시작 시점(기준 커밋 `7e0a4571`)에 추론·스냅과 관련된 3D 모듈을 import 그래프로 분류했다.

| 모듈 | 시작 시점 | 이번 변경 후 |
| --- | --- | --- |
| `scene-3d/studio-3d-inference-engine.ts` (`Studio3DInferenceEngine`) | **연결 없음.** 배럴(`studio-3d-dcc-suite.ts`) 재수출, 자기 테스트, 역량 증빙 JSON에서만 참조 | 단일 파이프라인에 위임하는 호환 어댑터 |
| `studio-build-inference-snap.ts` (`resolveStudioBuildInferenceSnap`) | **카탈로그 자가진단 전용.** DCC 카탈로그 러너(`BLD-001/002`)와 게이팅 테스트에서만 호출, 뷰포트 미연결 | 단일 파이프라인에 위임하는 호환 어댑터 |
| `bg3d/studio-bg3d-transform-snap-planner.ts` | **테스트 전용.** `planStudioBg3dTransformSnap`은 자기 테스트에서만 호출(측정 모듈은 상수·타입만 import) | 기즈모 이동 드래그와 합류 (`studio-bg3d-inference-transform.ts`) |
| `bg3d/studio-bg3d-measurement.ts` + 패널·뷰포트 | **연결됨** (줄자). 단 마우스 래이 교점만 쓰고 끝점·축 정렬 추론은 없음. 사후 분류(`classifyStudioBg3dMeasurementInference`)만 있음 | 클릭·미리보기 점이 추론 점으로 치환, 사후 분류는 패널 칩으로 유지 |
| `bg3d/studio-bg3d-surface-snap.ts` | 연결됨 ("표면 붙이기") | 변경 없음 |
| `bg3d/studio-bg3d-object-ops.ts` `applyStudioBg3dSnapToTransform` | 연결됨 (눈금 증분 스냅, 마우스 업 시) | 변경 없음. 기하 스냅이 이긴 드래그에서는 건너뜀 |
| `bg3d/studio-bg3d-push-pull.ts` + `StudioBg3dShapesPanelPushPull.tsx` | 연결됨 (숫자 `<input type="number">`) | 길이 입력 필드로 교체 (단위 해석, 정확한 길이) |
| `bg3d/studio-bg3d-placement-session.ts` + 포인터 컨트롤러 | 연결됨 (모델 배치) | 목표점을 추론 점으로 치환 |

2D 캔버스 스냅(`studio-object-drag-snap.ts`, `canvas/studio-object-smart-snapping.ts`, `drawing/studio-perspective-pen-snap.ts`)은
3D 추론과 별개의 모듈이라 건드리지 않았다.

## 2. 구조

```
순수 코어 (three.js·DOM 비의존, studio-bg3d-inference-*.ts)
  math · units(길이 파서) · kinds(종류·스타일·예산) · sources(도형 특징 표→후보) · index(격자 해시)
  probe · ray · engine(우선순위 해석) · session(키 리듀서) · timing(프레임 게이트·안내 속도 제한)
  transform(변형 스냅 계획기 합류) · adhoc(레거시 어댑터용 일회성 해석)
        │
서비스 (프레임워크 비의존)  studio-bg3d-inference-service.ts
  장면 색인 캐시 · 세션 상태 · 커서 해석 · 평행/수직 기준 방향 · 스크린리더 안내 · 키보드 점 고르기
        │
연결층   pointer(레이 커서) · pointer-binding(DOM 리스너) · keyboard(창 캡처 라우팅) · drag(기즈모 세션)
         placement(배치 목표점) · scene(에디터 상태→입력) · overlay-model(표시 규칙)
        │
화면     StudioBg3dInferenceMarker · StudioBg3dInferenceOverlay(R3F) · StudioBg3dInferenceController(R3F)
         StudioBg3dInferenceHud · StudioBg3dInferenceKeyboardPicker · StudioBg3dLengthField
        │
호스트   useStudioBg3dInferenceHost(에디터 연결) · useStudioBg3dInference(공개 훅)
```

- 정점을 순회하지 않는다. 도형 13종은 `makeGeometry`와 테스트로 맞춘 **특징 표**(끝점·중간점·중심·모서리·상자 면)에서,
  커스텀 모델은 **로컬 경계 상자**에서 후보를 만든다. 경계 상자에서 파생한 후보는 `approximate`로 표시되고 툴팁에
  "(경계 상자 기준)"이 붙는다.
- 컨트롤러(`StudioBg3dInferenceController`)는 반드시 `View` 포털 안에 마운트한다. 루트 수준 `useThree().camera`는
  View가 실제로 그리는 카메라와 다를 수 있다.
- 에디터 공유 파일(호스트 백 기반, 타입 검사 제외)은 훅 한 줄·JSX 몇 줄·점 치환 몇 곳만 고쳤다. 로직은 타입 검사되는 새 파일에 있다.

## 3. 추론 종류, 우선순위, 표시

우선순위: 점(끝점·교차점·중간점·중심) > 선 위 > 정렬(축·기준점 연장·평행·수직) > 면 위 > 격자 > 자유.
같은 구간에서는 화면 거리(px)가 가까운 쪽이 이기고, 같으면 종류 순번, 그다음 ID 순이다.
활성 반경은 점 10px, 선 8px, 정렬 8px이며 펜 ×1.4, 터치 ×2.2다.

| 종류 | 툴팁 문구 | 마커 모양 | 마커 색 토큰 |
| --- | --- | --- | --- |
| 끝점 | 끝점 | 채운 사각형 | `good` |
| 교차점 | 교차점 | X | `bad` |
| 중간점 | 중간점 | 삼각형 | `cool` |
| 중심 | 중심 | 점이 있는 원 | `accent` |
| 선 위 | 선 위 | 굵은 막대 | `warn` |
| 축 정렬 | X축 정렬 · Y축 정렬 · Z축 정렬 | 화살표 선 | 축 색 |
| 기준점 연장 | 기준점에서 X축 연장 … | 점 + 점선 | 축 색 |
| 평행 | 평행 | 두 줄 | `accent` |
| 수직 | 수직 | 직각 | `accent` |
| 면 위 | 면 위 | 평행사변형 | `cool` |
| 격자 | 격자 | 십자 | `fg-3` |

모양과 색을 함께 쓰므로 색을 구분하지 못해도 모양과 문구로 알 수 있다. 마커는 `role="img"`이며 접근성 이름이 툴팁 문구와 같다.

축 색은 three.js `AxesHelper`와 같은 관례다: **빨강=X(좌우), 초록=Y(상하·높이), 파랑=Z(앞뒤)**. 이 장면의 up 축은
카메라 기본 up 벡터(`STUDIO_BG3D_CAMERA_DEFAULT_UP = [0,1,0]`)에서 코드로 읽으므로 Y-up이다. 유도선은 축마다 점선 간격도
다르다(X 0.12/0.06, Y 0.2/0.06, Z 0.06/0.06 m).

## 4. 키보드와 길이 입력(VCB)

| 키 | 동작 |
| --- | --- |
| `→` | 첫 번째 수평 축(X) 잠금/해제 |
| `←` | 두 번째 수평 축(Z) 잠금/해제. up 축이 Z인 장면이라면 Y로 바뀐다 |
| `↑` | 수직(up) 축(Y) 잠금/해제 |
| `↓` | 현재 평행·수직 추론 잠금/해제 (잠글 추론이 없으면 안내만) |
| `Shift` (누르는 동안) | 현재 추론 유지 — 선 위/축 정렬은 직선, 면 위는 평면, 끝점은 점으로 고정 |
| `Alt` (누르는 동안) | 추론 일시 해제 (잠금·유지 중인 제약은 그대로) |
| 숫자·`.`·`-` | 입력창으로 포커스를 옮기며 입력 시작 |
| `Backspace` | 입력창 밖에 쌓인 숫자를 지움 (선택 삭제로 새지 않음) |
| `Enter` | 입력한 길이를 기준점에서 잠금/마지막 추론 방향으로 정확히 적용 |
| `Esc` | 입력이 있으면 입력만 지움, 다시 누르면 취소(줄자는 시작점 → 도구 순서) |

길이 파서(`parseStudioBg3dLengthInput`)는 엄격하다. 받는 예: `2.4m`, `80cm`, `1200mm`, `3'6"`, `1.5` (단위 없으면 문서 단위).
거부하는 예(이유와 예시를 돌려준다): 빈 입력, `2.4x`(알 수 없는 단위), `3'6'`(단위 반복), `1e3m`(과학 표기), `2,4m`(소수점 쉼표),
`1 1/2"`(분수), `0`, 20,000m 초과, 불허된 음수. `3'`처럼 한 단위만 있는 입력은 올바른 값이다.
음수는 방향을 뒤집는다(밀기/당기기는 안쪽).

방향키 소유권: 탭 목록·라디오 그룹·리스트박스·슬라이더·select·패널 폭 조절 분할선(`role=separator`)·다른 텍스트 입력 안에서는 방향키를 가로채지 않는다. 길이 입력창에서는
`↑`/`↓`가 항상 잠금 키이고, `←`/`→`는 입력이 비어 있을 때만 잠금 키다(글자가 있으면 커서 이동 — 스크린리더 사용자가
입력 내용을 한 글자씩 확인할 수 있게). 한글 IME 조합 중에는 어떤 키도 가로채지 않는다. 처리한 키만 `preventDefault`와 전파 차단을
하므로 Esc가 모달 닫기로, Backspace가 선택 삭제로 새지 않는다. 세션이 없을 때는 아무 키도 소비하지 않는다.

### 포인터 없이 같은 결과에 도달하기

1. 줄자를 켠다.
2. HUD의 **키보드로 점 고르기**를 열고 `↑↓`로 가까운 끝점·중간점·중심을 골라 `Enter` (시작점).
3. `→`/`←`/`↑`로 축을 잠근다 (HUD의 잠금 버튼 4개는 같은 일을 하며 `aria-pressed`·`aria-keyshortcuts`를 가진다).
4. 숫자를 입력하고 `Enter` (또는 **적용** 버튼). 마우스로 클릭해 얻은 것과 같은 정확한 끝점이 만들어진다.

## 5. 성능 예산

모든 값은 `STUDIO_BG3D_INFERENCE_BUDGET`에 있고 `studio-bg3d-inference-budget.test.ts`가 증명한다.

| 항목 | 상한 |
| --- | --- |
| 쿼리 하나가 훑는 특징 수 | 2,048 (넘으면 중단하고 `truncated`로 알림) |
| 쿼리 하나가 방문하는 격자 셀 | 768 |
| 점 / 모서리 / 면 후보 | 64 / 48 / 32 |
| 교차 검사 쌍 | 1,128 |
| 한 모서리가 걸치는 셀 | 256 (넘으면 색인에서 제외하고 집계) |
| 포인터 이동 쿼리 간격 | 16ms (마지막 샘플은 반드시 처리) |
| 처리 한 번이 느릴 때의 간격 | 최근 5회 처리 시간의 중앙값 × 3, 최대 120ms (첫 처리는 워밍업이라 제외) |
| 스크린리더 일반 안내 간격 | 450ms (잠금·취소·오류는 즉시) |
| 색인 객체 / 특징 | 4,096 / 200,000 |

장면 객체가 문서 한도(512)의 4배인 2,000개여도 쿼리가 훑는 특징은 상한 이하임을 테스트가 확인한다. 같은 장면은 서명이
같으면 색인을 다시 만들지 않는다.

후보 수·셀 수 상한은 순수 쿼리의 비용만 묶는다. 표면 레이캐스트(three.js `Raycaster`)는 삼각형 수에 비례하는데 이 비용은
미리 알 수 없으므로 **실제로 걸린 시간을 재어** 프레임 게이트에 먹인다. 처리 한 번이 20ms 걸리는 장면을 모의한 테스트에서
추론이 쓰는 시간은 고정 간격일 때 95% 가까이였지만 적응형 간격에서는 전체의 약 1/3 안쪽으로 묶인다.
한두 번 튀는 값(JIT·GC)에는 반응하지 않고, 처리가 다시 가벼워지면 16ms로 돌아온다.

`studio-bg3d-inference-properties.test.ts`는 시드를 고정한 무작위 장면으로 세 가지를 브루트포스와 대조한다.
(1) 색인은 반경 안의 점·모서리·면을 하나도 놓치지 않는다. (2) 비정상 변환·좌표·배율·방향을 섞어도 엔진은 예외 없이
유한한 결과만 낸다. (3) 임계값 안에 점 후보가 있으면 점 계열이 이기고 가장 가까운 점이 이긴다.
색인에서 이웃 셀 탐색을 빼거나 선 위의 우선순위를 점보다 앞으로 옮기면 이 테스트가 실패함을 직접 확인했다.

## 6. 통합 지점

| 도구 | 동작 |
| --- | --- |
| 줄자 | 클릭·미리보기 점이 방금 계산된 추론 점으로 치환된다 (`resolveFreshPoint`). 방향키·Shift·Alt·Esc·숫자 입력·키보드 점 고르기 지원. 영구 측정 가이드의 끝점은 후보, 방향은 평행/수직 기준이 된다 |
| 기즈모 이동 | 경계 상자 기준점 9개(바닥 중심 + 모서리 8)를 이웃 객체의 끝점·중간점·중심·상자 면에 붙인다. 기즈모 축 제약과 로컬/글로벌 좌표를 따르고 `Alt`로 끈다. 기하 스냅이 이긴 드래그에서는 눈금 증분 스냅을 건너뛴다. 사면(quad) 뷰에서는 카메라가 여럿이라 끈다 |
| 모델 배치 | 미리보기가 따라가는 표면/바닥 목표점을 추론 점으로 치환한다. 바닥을 가리킬 때는 바닥 위(y≈0) 점만 받는다 |
| 밀기/당기기 | 숫자 입력이 길이 입력 필드로 바뀌었다. 단위를 읽고, 직접 입력한 길이는 눈금 스냅으로 반올림하지 않는다 |
| 방 빌더 벽 그리기 | 공개 훅 `useStudioBg3dInference` / 서비스 `createStudioBg3dInferenceService`. 방 빌더 코드는 수정하지 않았다 |

호스트 배선은 `studio-bg3d-editor-inference-wiring.test.ts`(줄자·모델 배치 호스트 ↔ 서비스)가, 마운트 위치와 모듈 경계는
`studio-bg3d-inference-integration-boundary.test.ts`(소스 검사)가 고정한다. 실제 WebGL 뷰포트에서의 조작은 이 테스트들이 대신하지 못한다.

방 빌더 연결 예 (벽 그리기 도구가 있다면 이렇게 붙인다):

```tsx
const { service } = useStudioBg3dInference();          // 창 키보드 라우팅 포함
service.begin("wall", {
  handlers: { applyLength: ({ reference, endPoint }) => addWall(reference, endPoint) },
});
// View 안:  <StudioBg3dInferenceController service={service} active objectsRef={objectsRef} />
//           <StudioBg3dInferenceOverlay service={service} />
// 바깥:     <StudioBg3dInferenceHud service={service} onPickPoint={(point) => startOrEndWall(point)} />
// 클릭:     const { point } = service.resolveFreshPoint(hit.point);   // 추론이 있으면 그 점
```

## 7. 접근성

- 스크린리더용 live region 두 개(polite / assertive)가 **항상 마운트**되어 있다. 오류만 assertive, 나머지는 polite다.
  같은 문구가 반복돼도 매번 새 노드로 갱신해 다시 읽힌다.
- 일반 추론 안내는 450ms 간격으로 제한하고 마지막 것만 읽는다. 잠금·취소·오류·점 선택은 즉시 읽는다. 자유 위치는 읽지 않는다.
- 모든 잠금 버튼은 `aria-pressed`, `aria-keyshortcuts`, 축 이름·의미·색 이름을 담은 접근성 이름을 가진다.
- 길이 입력 오류는 `role="alert"`이고 `aria-describedby`로 입력창에 묶인다. 입력 중에는 덜 끝난 형식(`3'`)에 경고하지 않는다.
- 키보드 점 고르기는 ARIA listbox(`aria-activedescendant`)이며 터치 목표 높이 44px 이상이다.
- 모든 새 컨트롤은 `focus-visible` 윤곽선을 유지한다. 디자인 토큰만 쓰고 하드코딩 색을 쓰지 않는다 (3D 선은 three 재질이라 hex를 쓴다).

## 8. 매뉴얼과 코드의 차이 (정리 결과)

기존 `STUDIO_3D_DCC_MANUAL.md` 부록 "SketchUp 스타일 추론 스냅 엔진"은 구현 없이 쓰인 설명이었다. 이번에 코드를 기준으로 고쳤다.

| 기존 매뉴얼 주장 | 실제 코드 |
| --- | --- |
| `↓` = Z축 잠금 | `←` = Z축, `↓` = 평행·수직 잠금 |
| `Shift` = 축 잠금 토글 | `Shift`(누르는 동안) = 현재 추론 유지. 축 잠금은 방향키 |
| `Tab` = 치수 직접 입력 모드 | **구현하지 않음.** `Tab`은 모달의 포커스 이동 키라 가로채면 키보드 접근성이 깨진다. 숫자를 치거나 "길이 직접 입력" 필드로 이동 |
| `G` = 격자 간격 변경 | **구현하지 않음.** 2D 편집기의 `G`(채우기)와 겹치고, 간격은 기존 스냅 설정 UI가 맡는다 |
| 드래그 중 축 근접 시 자동 잠금 | 자동 잠금은 없다. 정렬은 소프트 스냅(추론)으로 붙고 잠금은 방향키로 건다. 기즈모 드래그에서는 방향키를 쓰지 않는다(기즈모 축 핸들이 제약을 정한다) |
| 중심 = 보라 | 마커는 디자인 토큰 `accent`(모양이 1차 신호). 3D 선만 hex를 쓴다 |
| 역량 증빙(`docs/evidence/studio-competitor-capability-audit.json`)의 `inference-modeling` "product-wiring: verified" | 시작 시점에는 사실이 아니었다(뷰포트 미연결). 증빙 파일은 생성물이라 고치지 않았다 |

## 알려진 한계와 후속 과제

- **브라우저 실측 없음.** WebGL 뷰포트에서 사람이 조작해 본 검증은 하지 못했다. 마커 위치, 포인터 감도, 점선 가시성은 실기기 확인이 필요하다.
- 모델 후보는 경계 상자 기준이라 실제 정점이 아닐 수 있다 (`approximate`). 정적 배치(instanced) 모델은 객체가 등록되지 않으면 모델 루트 경계 상자로 대체한다.
- 사면(quad) 뷰에서는 줄자와 이동 스냅을 쓰지 않는다 (카메라가 여럿).
- "선 위" 후보는 기즈모 이동 드래그에는 쓰지 않는다 (계획기가 점·면 후보만 받는다).
- `Tab`(치수 입력 모드)·`G`(격자 간격)는 구현하지 않았다. 격자 종류는 엔진에 있으나 도구에서 켜지 않았다.
- 레이 쿼리가 매우 길 때는 셀 상한(768)에서 멈추고 먼 쪽 후보를 놓칠 수 있다 (`truncated`로 알림).
- 표면 교점은 `Raycaster`를 그대로 쓰며 가속 구조(BVH)가 없다. 삼각형이 아주 많은 모델이 있으면 한 번의 레이캐스트 자체가
  길어질 수 있다. 적응형 간격이 추론의 시간 점유율은 묶지만 한 번의 레이캐스트를 쪼개지는 못한다 (줄자·배치 중에는
  R3F 이벤트 쪽의 레이캐스트도 따로 돈다).
- 호버 기준점은 같은 점에 700ms 머물러야 등록된다. 히스테리시스(후보 사이 깜빡임 방지)는 넣지 않았다.
- 레거시 어댑터에서 `tangent` 추론은 더는 생성하지 않는다 (타입은 유지). `parallel`/`perpendicular`는 축 잠금 원점을 기준으로 한다.
- 이번 범위 밖에서 발견한 기존 문제: `studio-bg3d-push-pull.ts`의 `rotateLocalVector`와 `studio-bg3d-object-ops.ts`의 `rotateLocalPoint`/`worldAabbHalfExtents`는
  여러 축이 동시에 회전한 객체에서 three.js Euler `XYZ` 순서와 다르다 (수치로 확인). `localHalfExtentsForPrimitiveKind`는 plane/ring/torus/hemisphere에서
  `makeGeometry`의 실제 크기와 다르다. 이번 추론 코드는 `makeGeometry`와 three Euler를 기준으로 하며 이 함수들을 쓰지 않는다.

## 검증 명령

```sh
# 작업 위치: 저장소 루트. 추론 관련 단위·컴포넌트 테스트 (외부 네트워크 불필요, 인자는 경로 부분 문자열 필터)
pnpm exec vitest run studio-bg3d-inference StudioBg3dInference StudioBg3dLengthField useStudioBg3dInference StudioBg3dShapesPanelPushPull studio-bg3d-editor-inference-wiring
pnpm exec vitest run studio-bg3d-inference-budget
pnpm exec vitest run studio-3d-inference-engine studio-hybrid-dcc-p0p1.gating
node scripts/generate-studio-manual.mjs --check
pnpm harness:check
```

일부 `bg3d` 환경 팩 테스트(`studio-bg3d-environment-*`)는 공개 에셋(GLB)이 있는 전체 체크아웃이 필요하다. 희소(sparse) 체크아웃에서는
에셋이 없어 이 변경과 무관하게 실패한다.
