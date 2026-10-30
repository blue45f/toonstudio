# 3D 웹 구현의 품질·성능·브라우저 기준

- 상태: `current` 사용자 결정 / `migration` 구현·검증.
- 결정일: 2026-10-29.
- 범위: 공간 모델러, 3D 배경·캐릭터·에셋·가상 스튜디오. 사이트 전체나 2D 엔진의 브라우저 정책을 일괄 변경하지 않는다.
- 사용자 결정: 3D는 최상의 성능과 품질을 우선한다. 필요한 기능은 Chrome만 지원할 수 있으며 Safari는 동일한 기준을 충족하면 지원한다. 게임엔진도 검토하고 관련 3D 세션과 협의해 최대한 웹에서 구현한다.
- 같은 날 추가 결정: 「번들 자산 활용 계획 및 적용」 세션에서 사용자가 명시한 Safari Technology Preview 기준을 실제 사용자 메시지로 확인했다. Safari 쪽의 선행 검증 대상은 macOS Safari Technology Preview로 맞춘다. 정식 Safari·iOS의 지원 여부는 별도로 판정한다.

## 브라우저와 품질

**Chrome을 우선 구현하고, Chrome과 macOS Safari Technology Preview를 같은 품질·성능 기준으로 검증한다.**
Safari 호환을 위해 모델 정확도, 텍스처 해상도, 재질·조명·선화,
화면·파일 출력 품질을 조용히 줄이지 않는다. 필요한 GPU 기능이나 같은 품질의 실행을 보장하지 못하면
해당 기능의 실패 이유와 Chrome 사용 경로를 안내한다. Chrome 이름만으로 기기 성능·GPU 지원을 보장하지 않는다.

2026-10-29 확인한 공식 선행 배포는 [Safari Technology Preview 255](https://webkit.org/blog/18482/release-notes-for-safari-technology-preview-255/)
(2026-10-22)다. 비교 실행에는 실제 설치본의 정확한 버전·빌드를 기록한다. Preview의 성공을 정식 Safari·iOS의
성공으로 승격하거나 정식 반영 일정을 보장하지 않는다. 이 정책 작성 시점에는 이 작업의 STP 실행 증거가 없다.

Safari 계열은 단순히 WebGPU API가 있다는 이유로 전체 기능 지원으로 표시하지 않는다. 공식 WebKit은
[Safari 26의 WebGPU 제공](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)을 명시하지만,
ToonStudio의 특정 shader·codec·thread·파일·GPU 수명 계약은 별도 검증 대상이다.
UA 문자열만으로 모든 Safari 사용을 차단하는 변경도 실제 기능 검토 없이 추가하지 않는다.

낮은 프레임 시간을 얻으려고 장면 수·효과·해상도·DPR·texture·리깅·출력 해상도를 몰래 줄인 결과는
성능 개선으로 집계하지 않는다. 사용자가 명시적으로 선택한 품질과 원본을 유지한다.
기기 안전을 위한 실제 메모리·렌더 타깃·검증 admission 한도는 삭제하지 않으며, 같은 품질을 처리하지 못하면
작업과 원본을 보존한 채 실패 이유를 알린다. 자동 engine/provider 전환도 하지 않는다.

## 동일 조건의 성능 검증

| 구분 | 고정 입력 또는 수집 내용 | 판정 경계 |
| --- | --- | --- |
| 실제 하드웨어 | OS·브라우저 빌드·실행 파일·flags·실제 renderer adapter·fallback 여부·필수 기능/limits | 별도 새 adapter probe의 성공을 실제 렌더러의 adapter 증거로 대체하지 않는다. 소프트웨어/미확인 GPU는 하드웨어 성능 비교에서 제외한다. |
| 장면·품질 | source SHA, geometry/topology, 원본 texture 크기·색공간·sampler, 재질·조명·카메라·AA·DPR·출력 픽셀·인원/모션 | 엔진마다 다른 품질 설정으로 얻은 숫자는 직접 순위화하지 않는다. |
| 초기 실행 | 전송 bytes, cold load, shader/texture 준비, 첫 실제 렌더와 첫 파일 캡처 | HTTP 성공·첫 RAF·빈 캔버스와 준비된 장면을 구분한다. |
| 편집 중 | warm frame p50/p95/p99, main-thread 작업, 실제 GPU 시간, 입력→표시 지연, 긴 작업·메모리 | RAF 간격·React UI 갱신 시간·GPU timestamp를 서로 대체하지 않는다. background/demand-frame 간격도 GPU 시간으로 집계하지 않는다. |
| 누적 장면 | 반복 instance, 서로 다른 재질·texture, skin/morph/animation, 투명·NPR·외곽선·그림자 | 한 모델이나 작은 삼각형 성공을 누적 제작 장면 합격으로 확대하지 않는다. |
| 결과 품질 | 현재 pose·UV·alpha0 RGB·표면 색·선화·normal/depth·카메라, GLB/PNG/PSD 실제 결과 | 화면이 비슷하다는 이유로 출력·재편집·편집 이력의 손실을 허용하지 않는다. |
| 수명 | 재열기·backend 명시 전환·취소·device loss·cache 폐기·세션 교체·메모리 회수 | stale 결과 게시, 공유 자원 dispose, 무한 재시도와 새 유료 요청을 금지한다. |

편집 60fps는 검토 목표이며 모든 장면·기기에서 이미 달성한 보장이 아니다. 조용한 실제 GPU 환경에서 측정하고
실제 결과와 한계를 기록한다. CI의 불안정한 wall-clock 한도를 맞추려고 기준을 완화하거나 품질을 줄이지 않는다.
기존 `studio-bg3d-engine-benchmark-contract.ts`, `studio-bg3d-engine-benchmark-analysis.ts`와
`studio-bg3d-professional-quality-corpus.ts`의 동일 장면·adapter·capture·회복/장시간·이점 판정 계약을 재사용한다.
새 문서가 기존 검증 기준을 완화하거나 이미 그 기준을 달성했다는 뜻은 아니다.

Chrome 자동화는 [Playwright의 실제 Chrome/Chromium 채널](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge)과
headless shell을 구분한다. headless 여부만으로 GPU를 추정하지 않으며 실제 renderer의 adapter와 flags를 보존한다.
현재 GLB의 SwiftShader WebGL2 20사례는 픽셀·형식 정확성 근거이고 실제 GPU 성능·WebGPU 성공의 증거가 아니다.

## 게임엔진 검토와 통합

1. 현재 Three.js WebGPU/WebGL2를 기준으로 hot path·draw call·instance·재질/texture 캐시·Worker 경계를 먼저 계측한다.
2. Babylon.js·PlayCanvas는 실제 웹 렌더·에디터 통합 후보로 같은 장면을 비교한다. 현재 Babylon specialist/Character Lab의 존재를 BG3D primary 교체 완료로 표시하지 않는다.
3. Godot·Unity·Unreal·Bevy 등은 공식 버전별 웹 배포 경로, shader/스레드·모바일·메모리·초기 다운로드·편집 bridge 제약부터 확인한다. native 수치나 원격 스트리밍 성능을 브라우저 안 실행 성능으로 표시하지 않는다.
4. 엔진 도입은 canonical 문서·command/Undo·asset 권리·선택/편집·camera/pose·파일 출력의 보존과 실제 성능 이점이 함께 확인된 뒤 결정한다.
5. 무거운 engine·WASM·editor는 사용자 의도에서 지연 로드하며 하나의 interactive canvas authority를 유지한다. 엔진마다 별도 문서 정본·history를 만들지 않는다.

공식 문서의 지원 상태는 정확한 버전과 함께 기록한다. 예를 들어 Unity의 LTS 문서와 더 새 Current 문서의
WebGPU 상태가 다를 수 있으므로 `Unity WebGPU는 experimental`처럼 제품 전체에 하나의 상태를 붙이지 않는다.
새 엔진 자동 설치·유료 서비스·GPU 서버·외부 asset 업로드는 이 검토의 실행 결과가 아니다.

### 공식 웹 경로의 1차 비교

2026-10-29 공식 자료 확인이며 실제 ToonStudio 장면의 엔진별 속도 순위가 아니다.
실험 순서는 기존 Three 경로 → 기존 Babylon specialist → 작은 PlayCanvas adapter로 잡는다.
이는 기존 구현 재사용성과 비교 규모를 위한 순서다.

| 후보 | 공식 웹 경로·상태 | 우선 확인할 통합 경계 |
| --- | --- | --- |
| [Three WebGPU](https://threejs.org/manual/pages/webgpurenderer) | 공식 가이드는 실험 상태와 WebGL 이행 차이를 설명 | 현재 Three primary를 기준으로 ShaderMaterial·NPR·capture·device 수명과 WebGL2의 동일 품질 대조 |
| [Babylon.js](https://doc.babylonjs.com/setup/support/webGPU) | WebGPU/WebGL, 비동기 초기화·compute | 기존 specialist/Character Lab을 재사용한 같은 snapshot의 capture·메모리·입력 지연 비교 |
| [PlayCanvas](https://developer.playcanvas.com/user-manual/graphics/) | 기본 WebGL2, WebGPU 요청·fallback, 공식 Graphics 문서의 Beta 표기 | [standalone AppBase](https://developer.playcanvas.com/user-manual/engine/standalone/)로 필요한 system만 쓰는 lazy adapter; 자동 fallback 대신 실제 backend·품질 확인 |
| [Godot Web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) | stable 문서의 WASM+WebGL2 Compatibility, single-thread 기본과 선택적 threaded export | WebGPU·Forward+/Mobile web 미지원, C#·readback·배포 headers·초기 bytes·편집 bridge 제한을 분리 |
| [Unity Web 6000.6](https://discussions.unity.com/t/webgpu-out-of-experimental-in-unity-6-6/1734694) | WebGPU 공식 지원 전환. 6000.3 LTS Experimental과 구분 | WebGL2 기본/명시 WebGPU 선택, 실제 backend 확인, native/Burst 병렬성과 managed C# single-thread를 구분하고 WASM startup·메모리·출력·편집 bridge 비교 |
| [Unreal](https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine?lang=en-US) | 확인한 first-party 브라우저 경로는 서버 렌더→WebRTC Pixel Streaming | 브라우저 안 실행 후보와 별도로 encode·네트워크·decode 지연·영상 품질·서버 비용을 비교. community HTML5를 공식 WebGPU target으로 취급하지 않음 |
| [Bevy WASM](https://github.com/bevyengine/bevy/blob/latest/examples/README.md#wasm) | 공식 latest 문서의 experimental WebGPU, webgpu가 webgl2를 override하는 빌드 계약 | 웹 single-thread·JS/asset bridge·shader/capture·초기 로딩을 측정; native ECS 병렬 수치를 웹 결과로 사용하지 않음 |

후속 원본 관측에는 engine 버전·배포 source SHA·선택한 graphics API를 고정한다.
예전 블로그·다른 LTS 버전의 한계나 지원 상태를 현재 모든 버전에 일반화하지 않는다.

### WebAssembly 메모리와 Safari의 버전 경계

WebGPU 제공과 WebAssembly Memory64·threads·multiple memories 지원은 서로 다른 계약이다.
Unity 6000.6의 [WebAssembly64 설명](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/wasm-64bit-support)은
heap 주소 범위와 코드 크기/실행 overhead를 구분하며,
[브라우저 전제](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/wasm-64bit-support/wasm-64bit-prereq)는
Safari **26.5**의 64-bit WebAssembly 미지원을 명시한다. 이것을 모든 Safari 버전의 영구 미지원으로 일반화하지 않는다.
반면 [Safari Technology Preview 251](https://webkit.org/blog/18194/release-notes-for-safari-technology-preview-251/)에는
Memory64 지원이, [252의 2026-09-11 기록](https://webkit.org/blog/18304/release-notes-for-safari-technology-preview-252/)에는
`memory64`와 multiple memories의 결합 지원이 추가돼 있다.
[WebKit의 Memory64 기본 활성화 변경](https://github.com/WebKit/WebKit/commit/0d0080ea539d2c07b06d92edb5705cbcc24fe3cc)도
확인했으므로 STP에서도 항상 수동 flag가 필요하다고 일반화하지 않는다. 실제 설치본·설정·engine 빌드와
validate/instantiate 결과를 함께 기록한다. WASM32로 빌드한 engine은 브라우저의 Memory64 지원만으로 바뀌지 않는다.
Preview의 기록을 정식 Safari에서 같은 Unity 빌드가 동작했다는 증거로 사용하지 않는다.
정식 Safari의 이후 버전은 해당 버전·설정·실제 모듈별로 확인한다.

WASM32의 단일 선형 메모리 주소 한도, JS heap, GPU 자원, 브라우저 프로세스의 실제 가용 메모리를 분리해 측정한다.
Unity WebAssembly64의 16GB 표기도 실기기 안전 할당량·GPU 메모리·성능 보장이 아니다.
작은 모듈의 validate/compile 및 실제 decoder/mesh 처리 경로로 기능을 확인하고, 단순 capability 확인을 위해
수 GiB를 강제 할당하지 않는다. Memory64·multi-memory·shared memory·threads를 하나의 Boolean 지원으로 합치지 않는다.

공통 장면 검증에서는 원본/복사 bytes, WASM decode heap, JS 구조/이미지, GPU upload, PNG/GLB 중간 버퍼와 최종 산출물의
동시 생존 구간을 구분한다. scene export의 raw RGBA 예산만으로 전체 JS/GPU peak를 보장했다고 보고하지 않는다.
현재 이 작업의 113회귀·scoped 타입 검사는 Memory64·large-scene peak·장기 성능 실증이 아니다.

## 2026-10-29 세션 간 협의와 통합 경계

사용자의 직접 지시를 근거로 아래 세션의 현재 구현·증거·담당 경계를 확인하고 기술 조정 메시지를 교환했다.
다른 checkout의 미커밋 변경을 이 작업트리의 구현·검증 결과로 합산하지 않는다.

| 세션의 실제 제목 | 담당 경계와 협의 결과 | 현재 증거의 한계 |
| --- | --- | --- |
| 툰스튜디오 기본 웹툰 브러시 추가 | native 모델링·UV/Sculpt·MToon loader/clone/backend cache·beauty/normal/depth·타일. 공간 모델러·DPR governor와 분리 | Chrome/Metal MToon 14캡처는 해당 경로의 정확성 증거다. 전체 픽셀·4K·앱 전체·성능 benchmark는 미인증이다. |
| Tripo3D 크레딧 활용 계획 수립 | Character Lab Babylon 경계, Three VRM/Shaper·Rapier 포트, PSD·첫 캡처·검수함 자산. 공통 VRM viewport/CSS와 후보를 덮지 않고 통합 | 과거 실제 Metal/WebGPU·WebGL2 probe와 PSD 검증은 해당 source에 한정한다. 새 후보와 GPU p95·일반 장기 안정성 검증은 별도다. |
| 번들 자산 활용 계획 및 적용 | virtual-space 3D 테마 분리·자산 공급·근접 상태/peer 수명/metrics. 실제 원본 SHA를 가진 팩을 공통 bench 후보로 사용 | 8팩 원본 1,764 GLB와 8대표 렌더는 모든 누적 장면·휴대폰 fps·운영 서빙 완료의 증거가 아니다. 새 Tripo 101은 개별 provenance/품질 검수 전이다. |

중요한 통합 요구는 다음과 같다.

- MToon 세션은 cache key를 storageId 단독에서 backend variant를 포함한 키로 바꾼다. 이 작업의 `studio-bg3d-scene-glb-source.ts`에는 storageId 직접 lookup과 동일 entry 재검사가 남아 있다. 통합 시 실제 shared `readStudioBg3dModelCacheEntry` 계약과 snapshot backend를 사용하고 ABA·late result·원본 권리·양방향 attachment 검증을 유지한다. key 문자열을 나눠 ID로 추측하거나 다른 backend를 자동 선택하지 않는다.
- 자산 원본·atlas/리깅·권리와 quarantine 상태를 유지한다. 새 유료 생성물을 기존 free-provider metadata나 외부권리 승인으로 재해석하지 않는다.
- frame governor는 계측을 유지하고 기본 해상도를 보존하는 `resolutionPolicy`로 변경했다. adaptive DPR은 명시적 `adaptive`에서만 동작한다. 고품질 load 실패 뒤 global quality reset도 제거했다. 두 경계는 [집중 113회귀와 scoped 검사](../reports/spatial-modeler-quality-validation-2026-10-29.md)를 통과했다. 이후 품질 패널·복구·MR packing 후속 변경은 별도 검증 대상이며 device profile 자동 선택은 남은 검토 경계다.
- 현재 릴리스 조정자의 heavy 검사 순서를 따른다. 다른 세션에 메시지를 보낸 것을 엔진 교체·검증·병합·배포 완료로 표시하지 않는다.

### 소스 검토에서 남은 품질 보존 경계

2026-10-29 추가 소스 검토에서 확인한 경계와 후속 구현 상태다. 이전 113회귀의 성공을 아래 변경으로 확대하지 않는다.

- `Studio3dAssetQualityPanel.tsx`의 inactive·cleanup·context/device loss가 전역 메모리 모드를 `auto`로 바꾸던 처리를 제거하고 실제 `ownerCanvas` 복구 상태로 pending checkpoint를 취소하도록 연결했다. 알려진 미복구 상태는 canvas별 snapshot으로 승계하며 재설치를 healthy 복구로 표시하지 않는다. 패널·복구 회귀는 후속 25파일 실행에서 통과했으며 실제 브라우저 검증은 대기 중이다.
- `StudioBg3dCaptureBridge.tsx`의 반복 WebGL context loss 뒤 `DPR × 0.75`를 적용하던 별도 휴리스틱도 제거했다. 진단·복구·retry·안전 pixel cap은 유지한다. 실제 component의 새 회귀 4개는 통과했으며 실제 GPU 복구 성공으로 집계하지 않는다.
- live `studio-bg3d-editor-view-model.ts`의 device quality 계산은 현재 explicit render preference를 받지 않는다. 자동 profile은 실제 DPR·HDRI 1k/2k 선택에 영향을 준다. desktop profile을 강제하면 GLB admission profile까지 바뀔 수 있으므로 화면 품질 요구와 안전 예산을 먼저 분리해야 한다.
- 수정 전 `StudioBg3dHdriEnvironment.tsx`는 실제 renderer를 WebGL PMREM 경로로 cast했다. 현재 source는 실제 backend별 factory와 공통 슬롯 owner를 사용하며 binding의 적용·실패·정리 진단 snapshot을 보관한다. 후속 source 증분은 항상 존재하는 scene/renderer 환경 권위가 layout에 요청을 게시하고, HDRI·파노라마의 실제 적용을 합성해 PNG·타일 캡처에 전달하도록 연결한다. 현재 새 생산자/인계 검증은 대기 중이며 특정 backend의 실제 GPU 품질 성공을 입증하지 않는다. native 담당 세션과 중복되지 않는 소유 범위를 합의했다.
- HDRI의 URL/tier·renderer·scene·배경 사용 여부 또는 파노라마의 환경 owner·scene만 바뀔 때 새 binding에 같은 밝기·회전을 다시 적용하지 않던 effect 의존성을 보완했다. 값 변경은 기존 setter를 사용해 재로드하지 않는다. HDRI 배경 사용 시 파노라마의 배경 소유 양보도 연결했다. 실제 component와 typed binding seam의 회귀 입력은 현재 11개이며 실행 대기 중이다. 위 359통과 실행 뒤 증분이므로 그 성공에 포함하지 않는다.

메모리 모드의 `high`는 모델별 texture admission allowance이며 전체 렌더 품질 설정과 같지 않다.
이를 기본으로 강제하거나 기기 안전 cap을 완화하는 변경으로 최고 품질 요구를 대신하지 않는다.
다음 변경은 패널 수명에서의 선택 보존 → render preference와 safety profile 분리 → 같은 장면의 실측 순서로 검토한다.
다음 render plan은 요청·실제 적용·제한/미지원 상태를 나누고, 입출력·엔진 admission의 safety profile은 별도로 유지해야 한다.
메인 target의 pixel cap만 유지했다고 shadow map·HDRI decode/PMREM·LOD residency·동시 target/capture의 GPU 예산까지
동일하다고 판정하지 않는다. 검증되지 않은 상향은 최대 품질 달성으로 표시하지 않으며, 캡처는 실제 적용 환경과
출력 크기의 snapshot이 요청과 일치하는지 확인해야 한다. 후속 환경 영수증은 동결 문서의 fingerprint와
실제 적용 세대를 캡처 전후·PNG 인코딩 뒤·타일 전체·현재 shot commit에서 대조하도록 작성했다.
타일마다 새 세대를 허가하거나 준비 실패를 이전 환경 성공으로 바꾸지 않는다. 인계한 독립 PNG와 이미 commit한
shot을 이후 정상 환경 해제에 종속시키지 않는다. 이 새 입력의 실행 검증은 아직 대기 중이다.
상위 UI의 요청/적용 상태 표시, render preference/safety profile 분리와 전역 GPU capture pin은 남은 범위다.

같은 교차 검토에서 SKP run의 singleton 진행·결과 게시에 실행 소유권 누락도 확인했다.
이전 run의 metadata 저장은 유지하면서 stage·진행 해제·await 뒤 결과 게시를 현재 run으로 제한하는 후속 source와
11개 회귀 입력을 제품에 반영했다. modal generation callback도 연결했으며, peer의 최신 import/backend lease guard는
해당 source가 통합될 때 함께 보존한다. 이 11개와 기존 importer/AI 표기 회귀는 후속 25파일 실행에서 통과했다.
그 실행 전체는 MR 경로 fixture 2건 실패로 exit 1이었다. fixture 수정 후 별도 좁은 실행에서 해당 MR 6개와 기존 scoped TSC는
통과했고, 변경 ESLint 4오류를 보정해 재검증 대기 중이다. [실제 검사와 실패 수정 기록](../reports/spatial-modeler-packing-ownership-2026-10-29.md)을
별도로 유지하며 이전 113회귀와 합산하거나 전체 완료로 표시하지 않는다.
