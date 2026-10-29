# 텍스처 브러시 셰이더의 필압 LUT·종이 이빨 단계

작성 기준일: 2026-10-29 · 대상: `apps/web/src/domains/creator/render/` 의 텍스처 브러시 WebGPU 런타임(`studio-engine-webgpu-textured-brush-runtime.ts`)

이 문서는 dab 필압을 256칸 단조 LUT 로 바꿔 크기·불투명도·흐름에 반영하고, 종이 결을 "이빨 문턱"으로 평가하는 계산을 **셰이더 안에서** 하는 단계의 현재 구현, 검증 범위, 한계를 적는다. **검증 상태: Node 에서만 검증했다(WGSL 구문 해석, 산술 TS 재현, 가짜 GPU 장치 시험). 이 컨테이너에는 GPU 가 없어 실기기 GPU 픽셀은 검증하지 않았다.**

## 1. 상태 요약

| 영역 | 상태 | 근거 |
| --- | --- | --- |
| 셰이더 단계(정점: 필압 LUT·크기·알파 비율, 조각: 이빨 문턱) | current, Node 검증 | `render/studio-engine-webgpu-textured-brush-shader.ts`, `render/studio-webgpu-pressure-tooth.ts` |
| 계획 선택 필드 `gpuPressureTooth`와 지문 포함 | current | `render/studio-engine-webgpu-textured-brush-plan.ts` |
| 런타임 uniform(@binding(5))·검증·업로드 | current | `render/studio-engine-webgpu-textured-brush-runtime.ts` |
| LUT 원천: 기기 필압 프로필, 필압 곡선 그래프 지수 | current | `studioWebGpuPressureLutFromStylusProfile`, `studioWebGpuPressureLutFromCurveExponent` |
| 이빨 문턱 원천: 건식 매체 침착 프리셋(peak-catch) | current | `studioWebGpuPaperToothForMedium` |
| 기본값(단계 없음)의 동작 | 기존과 같음: 비율은 정확히 1.0, 결 변조는 기존 식을 select 로 고름, 인스턴스 버퍼 배치·계획 지문 불변 | 3장 |
| 제품 드라이 미디어 캔버스에서 단계 켜기 | target(꺼짐) | 5장 |
| 실기기 GPU 픽셀 | 미검증 | 4장 |

## 2. 구조

### 2.1 계획과 지문

- 텍스처 브러시 계획에 선택 필드 `gpuPressureTooth`(`StudioWebGpuPressureToothResponse`, 계약은 `render/studio-webgpu-pressure-tooth-contract.ts`)를 둔다. 값은 `createStudioWebGpuPressureToothResponse`가 만든 정규형만 허용한다. 항등 LUT 는 `null`로, LUT 와 이빨이 모두 꺼지면 응답 자체가 `null`(계획에 싣지 않음)이 된다.
- 계획 지문(`fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics`)은 필드가 있을 때만 그 값을 넣는다. 필드가 없으면 키 자체가 없어 **기존 계획의 지문이 바뀌지 않는다.** 필드가 있으면 지문이 달라지므로 영수증·발표 임대의 `sourceFrameFingerprint`가 픽셀 의미를 그대로 대변한다.
- 런타임은 정규형이 아닌 응답(길이·범위·단조·문턱 순서 위반, 다른 kind)을 실은 계획을 GPU 쓰기 전에 `invalid-frame`으로 거부한다.
- `withStudioWebGpuPressureTooth(plan, response)`가 응답을 싣거나 떼고, 계획에 지문이 있었다면 다시 계산한다.

### 2.2 uniform 배치(@group(0) @binding(5), 정점·조각 단계, 1,072바이트)

| float | 뜻 |
| --- | --- |
| 0 | LUT 사용(0/1) |
| 1~3 | 크기·불투명도·흐름이 필압을 따르는 비중(0~1) |
| 4 | 이빨 사용(0/1) |
| 5, 6, 7 | 가벼운 필압 문턱, 강한 필압 문턱, 페더 |
| 8 | 문턱 보간 필압 감마 |
| 12~267 | LUT 256칸(꺼져 있으면 항등 i/255) |

런타임은 생성 때 항등 값을 올리고, 실행마다 계획의 응답(없으면 항등)을 인스턴스 버퍼보다 먼저 올린다. 필압·이빨 단계 때문에 인스턴스 버퍼(dab 28 float)는 바뀌지 않는다. 계획의 `pressure`는 이미 정점 속성(location 6)에 있었고 이번에 처음 셰이더가 읽는다.

### 2.3 셰이더 산술

정점 단계(dab 마다):

1. q = LUT(p): p·255 의 칸 i0 = min(floor, 254), 분율 f 로 `mix(LUT[i0], LUT[i0+1], f)`.
2. 채널 비율 = r(q)/max(r(p), 1/64) (0~64 로 자름), r(x) = 1 − gain + gain·x. r(q) = r(p)이면 정확히 1.0 이다.
3. 크기: 사각형 기저 오프셋에 크기 비율을 곱한다(팁 UV 는 그대로라 팁이 함께 커진다). 알파: 불투명도 비율 × 흐름 비율을 premultiplied 색 전체에 곱하되, 최종 알파가 1을 넘지 않도록 1/알파 로 상한을 둔다.
4. 이빨 문턱 = light + (heavy − light)·q^curve. 필압이 셀수록 내려간다(heavy ≤ light 를 검증).

조각 단계(픽셀마다): 높이 = 기존 결 값(절차 노이즈 또는 R8 에셋, 대비·반전 적용 뒤). 이빨이 켜져 있으면 침착 = smoothstep(문턱 − 페더, 문턱 + 페더, 높이), 결 변조 = mix(1, 침착, dab 결 깊이). 꺼져 있으면 기존 식 mix(1, 높이, 결 깊이)를 select 로 그대로 고른다.

비율 모델의 뜻: 계획의 크기·불투명도·흐름은 CPU 가 이미 필압 응답을 적용한 값이다. 이 단계는 "같은 dab 의 필압이 q 였다면"을 선형 응답 r(x)로 근사해 그 비율만 곱한다. 계획의 실제 응답 곡선이 선형이 아니면 근사다.

### 2.4 이빨 문턱과 CPU 권위

이빨 수학은 `brush/studio-paper-media-profile-v1.ts`의 `resolveStudioPaperDepositScaleForHeightV1` peak-catch 식(문턱 보간 + smoothstep)과 같다. `studioWebGpuPaperToothForMedium(medium)`이 건식 매체(크레용·초크·목탄·파스텔·연필·건식 일반)의 프리셋 값을 그대로 옮긴다. 수채·유화 등 다른 모드는 `null`이다. 높이 원천은 계획의 결이므로 CPU 문서 렌더러의 종이 타일(de-tiled 높이장)과 같은 픽셀을 내지는 않는다.

## 3. 기본값이 기존 동작과 같다는 근거

- 셰이더: 비율은 단계가 꺼져 있으면 select 로 정확한 1.0 이 되고, 1.0 곱셈은 IEEE 에서 정확하다. 결 변조는 기존 식과 같은 식을 select 로 고른다.
- TS 재현 시험: 항등 uniform 에서 임의 dab 2,000개의 크기·알파 비율이 정확히 1, 결 변조가 기존 식의 f32 재현과 `Object.is`로 같다.
- 런타임 시험(가짜 GPU 장치): 인스턴스 버퍼가 단계 유무와 무관하게 바이트 단위로 같고, 단계를 뗀 계획의 지문이 원래 지문과 같다.
- 한계: 실제 GPU 컴파일러가 바뀐 셰이더 전체를 다르게 최적화(FMA 결합 등)할 가능성은 실기기에서 확인하지 않았다.

## 4. 검증 방법과 결과

| 항목 | 방법 | 결과 |
| --- | --- | --- |
| WGSL 구문·식별자 | `wesl` 링커로 셰이더 전체 해석, 문법 오류 음성 대조 (`render/studio-webgpu-pressure-tooth.test.ts`) | 통과 |
| WGSL 타입 검사(저장소 밖) | 스크래치 디렉터리의 naga 30.0.1 `Validator`(ValidationFlags::all)로 변경 전·후 셰이더를 검증. 저장소와 CI 에는 넣지 않았다 | 변경 전(함수 3·진입점 2)·후(함수 7·진입점 2) 모두 통과 |
| 산술 재현 | LUT 표본(기기 프로필 곡선과 1/255 안), 비율 식, 알파 상한(최종 알파 ≤ 1), 이빨 침착이 CPU 권위와 2e-6 안(건식 매체 전부), 문턱의 필압 단조성 | 통과 |
| 런타임 | 가짜 GPU 장치: 항등 uniform 업로드, @binding(5) 레이아웃(정점+조각), 선언된 응답 업로드와 이후 항등 복원, 정규형이 아닌 응답의 GPU 쓰기 전 거부, 자원 1회 해제 | 통과 |
| 실기기 GPU 픽셀 | 실브라우저 하니스(`scripts/studio-engine-webgpu-textured-brush-browser.ts`)에 이 단계의 사례를 더하지 않았다 | **미검증** |

## 5. 제품 경로에서의 위치

- 이 런타임은 제품의 드라이 미디어 캔버스(`StudioCanonicalVNextDryMediaCanvas.tsx` → `studio-canonical-vnext-dry-media-presentation-controller.ts`)가 쓰는 바로 그 런타임이다. 새 렌더러를 만들지 않았고, 계획이 단계를 선언하면 같은 경로에서 셰이더가 평가한다.
- 현재 제품 어댑터(`studio-canonical-vnext-dry-media-product-adapter.ts`)는 단계를 싣지 않는다. 그 캔버스는 GPU 프레임이 Canvas 문서 렌더러와 **채널 오차 0**으로 같을 때만 화면 권한을 주는데(`studio-canonical-dry-media-document-parity.ts`), 문서 렌더러는 필압 프로필을 입력 때 이미 적용해 저장하고 GPU LUT·이빨 문턱을 평가하지 않는다. 이 상태에서 단계를 켜면 패리티가 깨져 GPU 프레임이 표시되지 않는다. 켜려면 CPU 기준 렌더러가 같은 단계를 먼저 채택해야 한다(target).

## 6. 한계와 열린 항목

- 비율 모델은 선형 응답 근사다(2.3장).
- 이빨 높이 원천은 계획의 결이며 CPU 종이 타일과 다르다(2.4장).
- 실기기 GPU 픽셀과 실브라우저 하니스 사례는 없다.
- 새 시험 파일(`render/studio-webgpu-pressure-tooth.test.ts`)은 필수 CI 목록에 넣지 않았다. 전체 `pnpm test`에는 포함된다.
- 런타임 파일은 셰이더 문자열을 `render/studio-engine-webgpu-textured-brush-shader.ts`로 옮겨 1,607줄에서 1,501줄로 줄었다(파일 크기 기준선 이하).
