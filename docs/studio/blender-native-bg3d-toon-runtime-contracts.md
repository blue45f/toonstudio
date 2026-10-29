# 자체 웹 툰 재질의 BG3D 소비 계약

상태: **migration**. 2026-10-29의 `codex/blender-native-bg3d-toon-20261029` 작업 중 상태다.
검사 후보 `3a17b2c1ded27a55336e60de81fe5b6e9073df08`의 후속 구현이며 운영 제공 완료 기록이 아니다.
사용자에게 Blender 설치나 원격 Blender 서버를 요구하지 않고 ToonStudio의 웹 편집 경로에서 처리한다.
정본·편집·GLB 출력은 [툰 재질 계약](blender-native-toon-material-contracts.md)을 따른다.

## migration — 실제 GLB parser와 backend

일반 GLB loader와 검증된 BG3D loader는 공통 lazy factory에서 설치된 SDK의
`MToonMaterialLoaderPlugin`을 등록한다. VRM humanoid·meta가 없는 자체 툰 GLB도 같은 재질 경로를 사용한다.
`LoadingManager`, Meshopt, 필수 KTX2 초기화·실패 정리 순서는 유지한다.

실제 renderer의 단일 `isWebGLRenderer`·`isWebGPURenderer` 표식으로 재질 backend를 선택한다.
선언과 실제 renderer가 다르거나 표식이 모호하면 거부한다. renderer 없는 기존 CPU 소비자만
명시 backend 또는 기존 WebGL 기본값을 사용한다. GLB 검증의 worker/local 실행 위치와 구분한다.
WebGPU SDK는 승인된 `studio-bg3d-three-webgpu-entry.ts`를 통해서만 지연 로드한다.

WebGL의 `StudioMToonMaterial`은 실제 SDK compiler와 cache key를 유지하며 동일 경계의 step과
직교 screen outline 보정을 적용한다. 원본·clone·copy 대상마다 callback을 소유하여 원본의 closure를 복사하지 않는다.
WebGPU의 `StudioMToonNodeMaterial`은 공개 SDK lighting model과 TSL을 사용한다.
동일 경계에서 양쪽 select 분기가 계산되어도 분모가 0이 되지 않게 하며 직교·원근 폭을 구분한다.
기본 조명 계수·간접광·rim 처리는 SDK를 유지한다.

설치 SDK의 GLSL UV mask는 B, 공개 TSL UV node는 R을 읽는 차이를 확인했다.
공식 [MToon UV mask 규격](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_materials_mtoon-1.0/README.md#uvanimationmasktexture)에
따라 공통 TSL helper에서 B를 사용한다. texture별 후속 transform, 기존 회전·scroll 순서를 유지한다.
body·outline·clone의 전체 WGSL build에서 실제 mask 샘플 채널을 확인했으며 GPU 픽셀 검증과 구분한다.

재질 승인 표식은 private WeakMap에 둔다. 직렬화된 `userData`만으로 승인하지 않는다.
등록한 callback·shader·node 계약이 바뀌면 재질 갱신 또는 node build를 거부한다.
이는 임의 사용자 shader나 모든 외부 MToon 기능의 출력 동등성을 보증하는 계약이 아니다.

## migration — 인스턴스와 캐시의 수명

편집 가능한 clone은 자신의 재질 목록만 갱신한다. override·reset 이후 opacity와 texture matrix를
동기화하고 outline의 BackSide를 유지한다. 같은 재질이 여러 mesh에 쓰이면 프레임마다 한 번만 갱신한다.
애니메이션 clip이 없는 모델도 UV 재질 시간을 진행한다. 원본 cache와 형제 clone의 시간·override를 바꾸지 않는다.
늦게 준비된 clone은 unmount·대상 교체 이후 화면에 공개하지 않고 자신의 자원만 정리한다.

cache·pending·admission policy는 storage ID와 `studio-bg3d-mtoon/1:<backend>`의 조합을 사용한다.
첨부·DB·callback의 실제 storage ID는 바꾸지 않으며 raw ID cache 조회로 되돌아가지 않는다.
선택·배치·변환·물리·추론·컷·썸네일은 현재 backend의 root를 읽는다.
rollback은 자신이 설치한 정확한 variant와 객체를 검사하고 dispose 성공 후에만 제거한다.
사용자가 모델을 삭제하면 모든 backend variant를 분리하고 중복 없이 정리한다.
residency의 참조·고정 여부는 원래 record ID로 계산하여 실제 사용 중인 variant를 보호한다.

renderer/backend lease는 commit된 scope를 사용한다. A→B→A 전환 뒤 예전 A의 요청은 다시 유효해지지 않는다.
동일한 renderer/backend를 가진 새 host 객체는 기존 scope를 유지한다.
실제 renderer와 새 engine plan이 맞지 않는 전환 구간, unmount 이후 요청은 공개하지 않는다.
모델 import·템플릿 배치·inplace 저장·컷 준비·recipe·썸네일은 캡처한 lease와 renderer를 함께 확인한다.
썸네일은 content hash가 같아도 중간에 cache entry 객체가 교체되면 저장하지 않는다.

이전 썸네일 작업의 늦은 finally는 자신이 획득한 지역 GPU lease만 반납한다.
새 batch가 소유한 전역 lease를 읽어 해제하지 않는다. 같은 backend에서 가져오기가 교체되는 경우도
마지막 controller를 ref 객체별로 기억하여 진행 표시·오류·보관함·AI 안내·후속 썸네일의 오래된 UI 쓰기를 막는다.
새 요청이 완료해 ref가 다시 null이 되어도 이전 요청은 부활하지 않는다. 정상 완료한 가져오기의
요청된 AI 사용 표기 저장과 자기 완료 안내는 유지한다. backend가 폐기된 자기 작업은 후속 요청이 없고
같은 modal session이 현재일 때 busy/progress만 정리하며, 데이터·알림·썸네일은 폐기된 backend에 발행하지 않는다.
이 후속 비동기 회귀는 작성했으며 실행 검증은 공유 quiet 해제 뒤 남아 있다.
별도 SKP singleton의 stage/activity/result 발행 소유권은 공간 모델러 세션과 통합 검토 중이며 아직 해결됐다고 판정하지 않는다.
SKP 모듈을 기다리는 요청은 별도 지연 loader에서 await 전·후의 현재 소유권과 취소 신호를 검사한다.
기다리는 동안 교체·취소된 요청은 singleton `begin`이나 후속 변환을 시작하지 않는다.
loader 실패 원문은 그대로 호출자에 전달하고, 호출자의 소유권 fence로 오래된 오류 UI를 차단한다.
이 시작 경계의 보완과 run 내부의 stage/complete 게시 소유권은 별도 계약이며, 후자는 여전히 통합 검증 전이다.

같은 backend의 이전 scope 요청이 취소된 경우, 현재 요청은 확인된 이전 취소만 한 번 이어받는다.
파싱·권한 오류, 현재 요청의 취소, 교체된 pending/cache는 재실행하지 않는다.
이전 요청의 늦은 finally는 새 요청이 설치한 pending을 삭제하지 않는다.

## migration — 래스터 제출과 기하 pass

단일 capture는 등록된 앱 재질에만 scope를 적용하고 미등록 레거시의 기존 캡처 동작은 유지한다.
tile은 정상 등록·backend·수치와 기존 custom/stochastic 제약을 모두 검사한다.
등록됐지만 계약이 손상된 재질을 레거시로 취급하지 않는다. 앱 표식만으로 custom shader를 허용하지 않는다.
출력에서 제외한 subtree는 검사·clock 고정 대상에서도 제외하고 원래 visibility를 복원한다.

scope는 세션 동안 재질 clock을 고정한다. screen 폭은 `fullHeight / window.height`로 보정하며
`window.height`에는 halo를 포함한다. world 폭은 유지하고 모든 보정값의 Float32 유한 범위를 변경 전에 검사한다.
제출 동안만 outline이 원래 geometry bounds 밖으로 뻗는 mesh의 frustum culling을 해제한다.
draw/copy 제출 직후 첫 await 전에 폭·culling을 복원하고, clock lease는 모든 복사 작업의 종료까지 유지한다.
단일 capture의 비율은 1이다. viewport 전체의 culling을 일괄 해제하지 않는다.
WebGL/WebGPU capture adapter의 작업 중 implementation revision은 v5다.

기하 pass의 공통 scope는 한 번만 제출한다. 본체는 제출 순간의 side·clipping·live uniform을 복제하고
외곽선 슬롯은 그리지 않는다. 원본 geometry/groups/재질 배열은 변경하지 않는다.
준비 후 visible mesh의 구성·재질 연결·원본 visibility·등록 계약이 바뀌면 제출 전에 거부한다.
임시 재질은 첫 await 전에 원래 재질로 돌려놓고 GPU 복사 종료 뒤에만 해제한다.

WebGL 법선은 SDK의 debug normal 출력에서 normalMap을 제거하여 기하 view-space normal을 사용한다.
깊이는 SDK coverage와 공개 Three의 high-precision clip z/w·packing을 함께 사용한다.
캡처 복제본에 `update(0)`를 호출하지 않고 실제 beauty에 업로드된 opacity·alphaTest·UV 행렬·시각을 보존한다.
WebGPU는 같은 본체 scope에서 표준 alphaTest 이후 `outputNode`로 packed RGBA를 쓰고 외부 MRT에 기하 법선을 전달한다.
공통 packer는 far=1을 공개 Three와 같은 흰색으로 처리하며 opaque 출력이 마지막 alpha byte를 덮어쓰지 않게 한다.
map·mask는 독립 TextureSource의 sampling snapshot을 소유하고 이미지 payload만 읽기 전용으로 빌린다.
실제 WebGPU clipping은 기존 beauty의 ClippingGroup context를 유지한다. legacy Material.clippingPlanes를 새로 강제 적용하지 않는다.
AlphaToCoverage/MSAA의 정확한 픽셀 일치와 모든 장면의 GPU·픽셀 동등성은 아직 검증하지 않았다.

## migration — 2026-10-29 실제 GPU 회귀

Chrome `156.0.8078.48`, Apple M2 Max에서 실제 adapter 요청을 기록했다.
WebGPU는 `apple / metal-3`, `isFallbackAdapter:false`, 실제 `WebGPUBackend`였으며 WebGL은
`ANGLE Metal Renderer: Apple M2 Max`였다. forward depth와 loopback secure context를 사용했다.

128×128의 얇은 면을 뒤에서 보고 DoubleSide 본체·BackSide 외곽선에 양수 world 폭 `1e-10`을 적용했을 때
기존 Node 외곽선이 본체를 검정으로 덮었다. 본체의 직접광도 최종 누적 변수에 남지 않아 밝기가 달랐다.
최종 clip vec4의 outline만 window depth `5e-7`만큼 먼 쪽으로 이동하고,
직접광의 diffuse/specular는 변환한 임시 변수 대신 원래 lvalue에 누적하도록 수정했다.
clip 좌표계와 reversed 방향을 구분하되 원본 본체의 깊이·저장 폭은 변경하지 않는다.

| 중앙 RGBA | WebGL 본체 | WebGL 외곽선 포함 | Node 본체 | Node 외곽선 포함 |
| --- | --- | --- | --- | --- |
| 수정 전 실제 관측 | 246,155,111,255 | 246,155,111,255 | 218,137,97,255 | 0,0,0,255 |
| 수정 후 같은 입력 | 246,155,111,255 | 246,155,111,255 | 246,155,111,255 | 246,155,111,255 |

수정 후 두 backend의 tiny 제어군, 구의 world/screen 외곽선·원근/직교, animated B-mask cutout까지
실제 생산 factory·capture adapter를 통해 14개 color/normal/depth 캡처가 통과했다.
shader compilation 오류·uncaptured error·pageerror는 없었고 validation·out-of-memory·internal scope는 모두 null이었다.
브라우저와 loopback 서버는 정상 종료했다. 이 관측을 다른 GPU·reversed depth·고해상도 타일·모든 색의 일치로 일반화하지 않는다.

## migration — 증거와 남은 경계

집중 CPU 검증은 실제 SDK parser·재질 clone/copy·uniform 동기화·node build,
cache variant·정확한 소유권·실제 hook rerender와 host의 늦은 결과 차단을 다룬다.
WebGPU 전체 WGSL node build 성공은 GPU 초기화·화면 렌더·픽셀 일치의 증거로 사용하지 않는다.
실행한 명령의 최종 통합 결과와 전체 검사는 커밋·검사 기록에서 별도로 확인해야 한다.

고해상도 raster/tile·반전 깊이·전체 PNG 출력 흐름에는 실제 화면 검증이 더 남아 있다.
검사 후보의 기존 tile admission은 custom shader/MToon을 거부했고, 이 브랜치에서는 위 adapter와 함께 정상 등록한 재질만 처리한다.
폭·시간·수명과 CPU 제출 검증을 실제 픽셀의 경계·타일 이음새 검증으로 대신하지 않는다.
일반 재질만 표시한다는 기존 고정 경고는 제거하고, 실제 전달되는 툰 설정·외곽선 정보를 안내한다.
새 handoff에는 `toon-material-display-fallback` 손실을 무조건 추가하지 않는다. 과거 loss code의 타입은 읽기 호환성을 위해 유지한다.
전체 타입·하네스·프로덕션 빌드·브라우저/GPU·접근성 검증과 운영 배포는 별도 완료 조건이다.

SDK·Three 기반 수식의 출처와 MIT 고지는 [제3자 고지](blender-native-toon-third-party-notices.md)에 보존한다.

소스 정본은 [공통 재질 runtime](../../apps/web/src/domains/creator/mesh-materials),
[GLB loader](../../apps/web/src/domains/creator/bg3d/studio-bg3d-gltf-loader.ts),
[cache variant](../../apps/web/src/domains/creator/bg3d/studio-bg3d-model-material-variant.ts),
[renderer/backend lease](../../apps/web/src/domains/creator/bg3d/useStudioBg3dModelMaterialLease.ts)다.
