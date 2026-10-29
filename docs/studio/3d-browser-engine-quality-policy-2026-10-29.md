# 3D 브라우저·게임 엔진의 성능과 품질 기준

상태: **current — 사용자 결정과 현재 구현**, **target — 비교·지원 확정**을 구분한다.
결정일: **2026-10-29**. 사용자는 3D 기능의 최상 성능·품질을 우선하며, 필요하면 Chrome만 지원해도 되고
Safari는 같은 기준을 만족할 때 지원하도록 허용했다. 필요한 경우 다양한 게임 엔진도 검토한다.
같은 날 공유 3D 조사 채팅에서 사용자가 Safari Technology Preview를 기준으로 지정했으므로,
검증 대상은 **Chrome과 macOS Safari Technology Preview**다. 정식 Safari·iOS 지원은 별도로 판정한다.

## current — 적용 범위

- 3D 제작·뷰포트·GPU 작업·래스터/파일 출력을 Chrome과 macOS Safari Technology Preview에서 같은 품질로 검증한다.
  현재 실행 증거는 설치된 Chrome의 작은 GPU probe에 한정되고 STP 제품 검증은 남아 있다.
- Safari 계열의 API 지원과 실제 제작 기능의 품질·성능을 따로 검증한다. 지원이 확인된 기능은 유지하며,
  동일 기준을 충족하지 못한 고급 3D 기능에는 Chrome 사용을 안내할 수 있다.
- 브라우저 수를 늘리기 위해 모델·재질·외곽선·그림자·texture·해상도·출력 의미를 조용히 낮추지 않는다.
- 사이트 전체를 Chrome 전용으로 막는 결정은 아니다. 일반 페이지·2D·문서 접근과 3D 기능의 자격을 분리한다.
- 실제 기능·limit·backend와 측정 결과를 확인한다. 브라우저 이름/UA만으로 하드웨어 GPU나 같은 기능 집합을 보증하지 않는다.
- 새로운 엔진의 문서상 지원, 설치된 버전, 실제 제품 소비, 비교 테스트 통과, 운영 배포를 각각 기록한다.

Safari는 [공식 Safari 26.0 발표](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)에서 WebGPU 지원을 명시한다.
따라서 Safari가 WebGPU를 제공하지 않는다는 전제로 배제하지 않는다. 실제 기기·버전·재질·작업으로 평가한다.
Chrome도 GPU가 차단되거나 소프트웨어 렌더러로 실행될 수 있으므로 실제 adapter/renderer를 확인한다.

### current — STP와 Memory64를 구분하는 근거

2026-10-29에 확인한 [Apple 공식 preview 목록](https://developer.apple.com/safari/resources/)의 현재 버전은
macOS **Safari Technology Preview 255, 2026-10-22**다. STP 251의
[Memory64 기본 활성화 변경](https://github.com/WebKit/WebKit/commit/0d0080ea539d2c07b06d92edb5705cbcc24fe3cc)과
[STP 252 발표](https://webkit.org/blog/18304/release-notes-for-safari-technology-preview-252/)의
Memory64·multiple memories 추가를 확인했다. STP 255 범위 끝의
[고정 WebKit 설정 소스](https://github.com/WebKit/WebKit/blob/bb5913e37d019186e368a72dbde122306da9d75d/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml)는
Memory64·MultiMemory를 `stable`·기본 `true`로 정의한다. STP에서 수동 flag가 항상 필요하다고 분류하지 않는다.

이것은 설치된 STP의 실행 결과나 Unity WASM64 build 지원 보증이 아니다. 설치본 버전·설정,
작은 해당 기능 module의 validate/instantiate, 실제 엔진 build, 작업·저장·출력 및 장기 세션의 peak를 확인해야 한다.
아직 STP에서 이 실행 검증을 하지 않았다. macOS STP 성공을 정식 Safari·iOS 성공으로 확장하지 않는다.

WASM32의 단일 선형 메모리 주소 한도와 JS heap·GPU buffer/texture·브라우저 전체 메모리는 서로 다른 경계다.
Memory64가 있다고 무제한 할당이나 모든 메모리 병목 해소를 보증하지 않는다.
현재 native 모델러의 half-edge·Sculpt 경로는 JS·TypedArray 기반이며 Memory64를 요구하는 직접 호출은 확인하지 못했다.
반면 [future-only vNext worker profile](../../apps/web/src/domains/creator/render/studio-engine-worker-protocol.ts)은
Memory64를 요구한다. [scratch accelerator 계약](../../apps/web/src/domains/creator/kernel/WasmMemory64Capability.ts)은
계산용 메모리에 정본·영구 저장 권위를 주지 않는다. 현재 경로와 미래 profile의 요구를 섞지 않는다.
GLB decode·geometry projection·readback·PNG worker의 동시 복사와 GPU 자원은 별도 계측한다.
필요 기능 검출을 위해 수 GiB 강제 할당을 실행하지 않는다.

## current — 저장소에서 확인한 엔진 경계

2026-10-29의 `3a17b2c1ded27a55336e60de81fe5b6e9073df08` 위 작업트리 기준이다.

| 표면 | 실제 현재 구현 | 비교에서 지킬 경계 |
| --- | --- | --- |
| BG3D interactive canvas | 명시 선택한 Three WebGPU 또는 WebGL2 한 개 | 선택 실패 뒤 다른 backend를 자동 mount하지 않음 |
| native 모델링 작업대 | half-edge 정본·공통 표면·Three 표시·명령/파일 권위 | 엔진의 mutable scene graph가 편집 정본을 대체하지 않음 |
| 자체 툰 재질 | slot DTO·WebGL MToon·WebGPU NodeMaterial 후속 연결 | PBR 대체 표시를 같은 툰 기능의 성공으로 판정하지 않음 |
| Babylon | 설치된 core/loaders 9.31.0, 승인된 lazy specialist entry·capture/runtime | 정본 SceneDocument와 검증된 GLB byte snapshot만 전달하고 엔진 자원은 격리 |
| PlayCanvas·기타 후보 | 조사·catalog와 실제 adapter 구현을 구분 | catalog의 기능/activation 숫자를 구현·품질·성능 근거로 사용하지 않음 |
| 비교 계약 | renderer 중립 benchmark report와 승인 corpus/build/profile/device 문맥 | 다른 장면·해상도·GPU·빌드의 숫자를 직접 순위로 합치지 않음 |

현재 직접 의존성은 Three 0.186.1, Babylon 9.31.0이다. 2026-10-01의
[character-lab 비교 보고서](../reports/character-lab-engine-alternatives-2026-10-01.md)는 역사 자료이며,
그 버전·미설치·미지원 분류를 최신 제품에 그대로 적용하지 않는다.
랩의 독립 앱 경계와 본 서비스 승격 절차는 [ADR-0026](../adr/0026-labs-experimental-apps-engine-selection-and-promotion.md),
단일 작업의 엔진 권위는 [ADR-0018](../adr/0018-no-automatic-engine-fallback-vello-primary.md)을 따른다.

## current — 공식 문서에서 재확인한 후보

이 표는 공식 지원 표면 조사이며 아직 동일 장면의 성능 순위가 아니다.

| 후보 | 확인한 웹 표면 | 추가 확인할 품질·통합 경계 |
| --- | --- | --- |
| Three | [WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer)의 TSL·MRT·WebGPU/WebGL2 backend | 모든 장면에서 WebGPU가 더 빠르다고 가정하지 않음. 기존 shader/onBeforeCompile 경로와 NodeMaterial의 차이 확인 |
| Babylon.js | [공식 WebGPU](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU.md), native WGSL·NodeMaterial·WebGL | 기존 specialist를 재사용하되 자체 MToon·UV·normal/depth·tile·VRM 의미 일치부터 확인 |
| PlayCanvas | [공식 브라우저 지원](https://developer.playcanvas.com/user-manual/engine/supported-browsers/)의 WebGPU/WebGL2 | [실제 factory](https://github.com/playcanvas/engine/blob/main/src/platform/graphics/graphics-device-create.js)가 WebGL2를 추가하므로 반환 backend를 검사. hosted Editor와 Engine 구분 |
| Godot | [stable 웹 export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)의 WASM·WebGL2 Compatibility | native Forward+/Mobile·WebGPU를 현재 웹 기능으로 분류하지 않음. threads/COOP·COEP·WASM/asset/GPU 메모리 동시 사용량 확인 |
| Unity 6000.6 | [공식 Web Graphics 발표](https://discussions.unity.com/t/webgpu-out-of-experimental-in-unity-6-6/1734694), [6.6 출시 공지](https://discussions.unity.com/t/unity-6-6-is-now-available/1735357)의 정식 WebGPU 지원 | 6000.3 LTS의 Experimental과 구분. WebGL2가 기본이며 API 목록·실제 graphicsDeviceType·compatibility mode 확인. 문서의 compute/occlusion/skinning 지원을 우리 출력 parity로 승격하지 않음 |
| Bevy | [공식 WebGPU examples](https://bevy.org/examples-webgpu/), [WASM build 경계](https://github.com/bevyengine/bevy/tree/main/examples#wasm) | 직접 WASM/WebGPU 후보. 별도 WebGL2 build와 release/main 상태·JS/WASM 복사·shader/readback·문서 소비 비용을 구분 |
| Unreal | [공식 packaging](https://dev.epicgames.com/documentation/unreal-engine/packaging-your-project), [Pixel Streaming](https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine?lang=en-US) | current 공식 target 목록에서 직접 Web/WASM을 확인하지 못함. Pixel Streaming은 native 앱 프레임의 WebRTC 전송이므로 브라우저 직접 엔진과 구분 |
| O3DE | [공식 지원 플랫폼](https://www.docs.o3de.org/docs/welcome-guide/supported-platforms/), [build toolchain](https://www.docs.o3de.org/docs/user-guide/build/configure-and-build/) | 현재 조사한 공식 표면에서 직접 웹 export 미확인. native Atom의 기능을 브라우저 지원으로 분류하지 않음 |

Three·PlayCanvas·Unity의 기본 fallback 설명을 그대로 제품에 도입하지 않는다.
작업 전에 고른 정확한 backend를 확인하고, 실패를 다른 backend의 성공으로 가리지 않는 현재 계약을 유지한다.
Unity의 WebGPU 정식 지원은 엔진 지원 상태다. ToonStudio에 대한 우수한 성능·툰 품질·작업파일 보존을 아직 측정하지 않았다.
Unity 6.6의 [공식 새 기능](https://docs.unity.com/en-us/engine/6000.6/manual/whats-new/unity66)은
선택적 WASM64의 주소 한도와 Unity가 문서화한 Safari build 지원 범위를 구분한다.
상세 [Unity WASM64 prerequisites](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/wasm-64bit-support/wasm-64bit-prereq)의
Safari 설명은 26.5를 특정한다. 이 제품 지원 표를 모든 WebKit/STP의 Memory64 미지원으로 일반화하지 않는다.
주소 한도를 실제 안전 메모리·성능 보증으로 쓰지 않는다.
native C++/Burst jobs 병렬과 managed C#의 웹 single-thread 제약, secure context/SharedArrayBuffer·COOP/COEP도
각각 확인해야 한다. 이 조사를 이유로 현재 서비스 헤더나 인프라를 변경하지 않는다.

## target — 같은 품질을 먼저 확인하는 비교 corpus

각 corpus는 source bytes/hash·geometry/UV/material/rig 의미·camera·조명·배경·색공간·픽셀 크기·sample 수를 고정한다.
원본 장면을 엔진마다 임의로 단순화하거나 다른 에셋으로 대체하지 않는다.

| 작업 | 필수 품질 확인 | 측정 항목 |
| --- | --- | --- |
| 반복 배경 | instance별 선택/ID·가시성·material override·negative scale·shadow/outline·culling·파일 복원 | draw submission·CPU/GPU frame·pick/transform 응답·peak memory |
| 편집 메시·UV | 공통 삼각형/normal·비선형 corner UV·seam·slot·선택/undo·정본 불변 | 실제 component/Sculpt 입력→표시 지연·geometry build·할당/GC |
| 툰 캐릭터·알파 | shade 경계·작은 outline·원근/직교·cutout·animated UV·morph/skin/표정 의미 | animation/skin/update 비용·cold shader compile·frame 분포 |
| 고해상도 출력 | 원본 색/alpha·기하 normal·정규화 depth·전체 높이의 screen outline·halo/tile 이음새·동일 시각 | 4K colour, 작은 multi-pass 제어군, GPU readback·PNG/ZIP·동시 메모리 |
| 수명·복구 | 취소/재진입·device/context loss·늦은 결과 차단·문서/이력 보존·소유 자원 해제 | 장시간 증가·실패/복구·미정리 작업·dispose 종료 |

숫자 비교는 API 지원 검출과 분리한다. renderer/adapter가 hardware인지 확인하고, browser·OS·GPU·driver/backend·
실제 source/build·corpus·capture profile을 receipt에 기록한다. headless 실행이라는 이유만으로 software 또는 hardware라고 단정하지 않는다.
GPU timestamp-query가 없으면 GPU 시간을 추정값으로 채우지 않고 미측정 사유를 남긴다.
CPU 제출 시간·RAF frame 간격·GPU pass 시간·사용자 입력에서 표시까지의 시간은 다른 지표다.

성능 비교는 cold/warm을 나누고 raw sample과 p50/p95/p99, 반복 편차를 보존한다.
열 상태·전원 모드·화면 주사율·백그라운드 작업·DevTools·warm-up·shader/asset cache 조건을 기록한다.
비교를 위해 숨은 DPR/LOD/textureScale·sample 수 변경을 허용하지 않는다. 다른 세션과의 자원 경쟁도 통제한다.

## current — 기존 승격 gate와 추가 품질 조건

실제 [benchmark 분석 소스](../../apps/web/src/domains/creator/bg3d/studio-bg3d-engine-benchmark-analysis.ts)의 정책은
큰 장면 frame p95 25% 개선 또는 editable capacity 2배, 장면별 frame 회귀 5% 이내,
input p95 100ms 이하, tool-open gzip 증가 15% 이내, 30분 soak와 문서/자원 보존을 검사한다.
이 값은 현재 구현된 gate다. 이번 조사에서 실행하거나 결과를 새로 얻은 수치가 아니다.
숫자 gate를 통과하더라도 사용자에게 보이는 기능·재질·해상도·출력 누락이 있으면 승격하지 않는다.
픽셀 허용오차의 기존 수치를 늘려 엔진 채택을 통과시키지 않는다.

짧은 GPU correctness probe는 장시간 성능·회수 검증을 대신하지 않는다.
현재 Apple M2 Max/Chrome의 작은 MToon GPU 캡처 성공은 [BG3D 툰 계약](blender-native-bg3d-toon-runtime-contracts.md)의
범위에 한정되며 Safari 지원·다른 GPU·엔진 우위나 4K 전체 제품 흐름의 완료 증거가 아니다.

## target — 작업 분담과 적용

공간 모델러 작업은 자동 DPR/품질 governor·장면 GLB 출력·모바일 조작을 맡고,
native 모델러 작업은 component/UV/Sculpt/작업파일·툰 재질/GLB·BG3D MToon 소비/캡처를 맡는다.
브라우저/엔진 비교 corpus와 source hash·quality gate는 공유한다. 새 무거운 검사는 릴리스 조정자의 슬롯을 따른다.

cache는 후속 native 브랜치에서 storage ID와 backend runtime variant로 분리된다.
장면 export 통합은 raw `cache.get(storageId)` 대신 실제 표시 backend의 entry를 읽고,
source snapshot과 late-result fence에 같은 entry·variant를 고정해야 한다. 키 문자열을 추측해 분해하지 않는다.

현재 검증 대상은 Chrome과 macOS STP이며, STP 실행·정식 Safari 자격 판정·새 엔진의 실제 adapter·실측·제품 승격은 남아 있다.
이번 문서 작성으로 브라우저를 차단하거나 dependency/lockfile·인프라·유료 실행·운영 배포를 변경하지 않았다.
