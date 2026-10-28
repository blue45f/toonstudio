# 자체 웹 툰 재질의 정본·렌더·출력 계약

상태: **migration**. 2026-10-29의 `codex/blender-native-toon-material-20261029`에서 구현 중이다.
기준 후보는 `7ccb26843454d9f1ff00adffc04e9ab40a718304`이며 운영 배포 완료 기록이 아니다.
Blender 동작 분석을 바탕으로 ToonStudio 자체 웹 기능을 제공하는 목표를 유지한다.

## current — 원본 관측과 기존 소비자

REA의 설치 번들 정적 resource 관측은 Blender 5.2.0 표기와 shader 메뉴 선언을 확인했다.
Evidence는 `ev_d7d6979e664c40c4a332475309c8b9a1b39c61f96adccaae24ec3bdae9941bb7`이다.
이는 native 렌더 출력이나 실행 파일 전체 분석의 증거가 아니다. resource session은 관측 뒤 닫았다.

공식 [Toon BSDF 선언](https://github.com/blender/blender/blob/v5.2.0/source/blender/nodes/shader/nodes/node_shader_bsdf_toon.cc)의
Color·Size·Smooth·Normal과 BSDF 출력 중 Size/Smooth는 Cycles의 각도 기반 조절이다.
EEVEE의 [Shader to RGB](https://github.com/blender/blender/blob/v5.2.0/source/blender/nodes/shader/nodes/node_shader_shader_to_rgb.cc)와
[ColorRamp](https://github.com/blender/blender/blob/v5.2.0/source/blender/nodes/shader/nodes/node_shader_color_ramp.cc)는
조명 결과의 색 변환과 여러 stop·보간을 사용하는 별도 경로다. 동봉 메뉴도 두 렌더 경로를 구분한다.

이번 웹의 밝은색·그림자색·경계·선명도는 두 톤 표현을 편집하는 자체 계약이다.
MToon의 `N·L` 기반 shift/toony를 원본 Size/Smooth와 같은 수치로 설명하지 않는다.
shell 외곽선은 별도 구현이며 원본 Toon BSDF socket의 복제가 아니다.
Blender와 같은 픽셀 또는 범용 shader graph를 재현했다는 증거는 아직 없다.

기존 정밀 작업대는 고정 PBR 재질을 사용했고 일부 specialist 적용 콜백은 문구만 바꿨다.
generic BG3D GLB loader에는 현재 MToon plugin 등록이 없다. 별도 VRM 지원과 구분한다.

## migration — 정본과 편집

`StudioHybridDccToonMaterial`은 version 1의 불투명 2톤 재질이다. sRGB 6자리 hex의 밝은색·그림자색,
`shadingShift` -1..1, `shadingToony` 0..1과 외곽선 활성·모드·폭·색을 보유한다.
알 수 없는 필드·getter·비유한 값은 거부한다. 폭은 유한 Float32 표현 범위를 검사하며 임의 상한을 추가하지 않는다.

문서의 optional `materials`는 revision 1의 definitions·bindings를 가진다.
`toon-material:sha256:…` 내용 ID와 실제 `assetId + materialSlot`으로 결합한다.
내용 ID 불일치·상속 속성·없는 자산/면 슬롯 참조는 복원에서 거부하고 쓰이지 않는 정의는 정리한다.
복제·삭제·geometry 변경·undo/redo에서도 binding을 보존하거나 정리한다.

`hybridDccSetAssetToonMaterial`은 적용/해제를 한 명령으로 기록한다. 같은 내용은 no-op이다.
geometry·UV hash를 변경하지 않고, 재질 없는 문서와 빈 표는 기존 hash·snapshot bytes로 정규화한다.
`.toon3d`의 현재·undo·redo 상태와 OPFS checkpoint에 재질을 포함한다.
legacy hash fallback으로 재질 권위 검증을 우회하는 입력은 거부한다.

재질 작업의 **툰 재질**에서 슬롯별/전체 설정과 미리보기·적용·취소·기본 재질 복원을 제공한다.
UV와 툰 편집은 각각 하나의 표시 초안만 사용한다. 미리보기는 정본·journal·작업파일을 변경하지 않는다.
계정·인증 세대·프로젝트·문서·workspace identity·읽기 전용 전환과 ABA 재진입은 늦은 적용을 폐기한다.
구역 안 Escape는 미리보기를 취소하며 더 안쪽 dialog의 Escape는 가로채지 않는다.

## migration — 실제 렌더와 수명

직접 dependency인 `@pixiv/three-vrm` facade의 실제 `MToonMaterial`을 필요한 때 lazy 로드한다.
본체와 BackSide shell은 geometry를 공유하고 소유 disposer가 재질을 생성·폐기한다.
원본 position·index·UV·normal과 face 선택 순서는 바꾸지 않고 fan 순서의 draw group을 추가한다.
선택 강조가 작성한 툰 색을 대체하지 않는다. UV checker/wire에서 돌아오면 재질을 복원한다.

slot은 기존의 nonnegative safe integer 계약을 유지한다. CPU stream은 Float64로 보존하고
draw material index만 조밀하게 만든다. 같은 style의 슬롯은 하나의 표시 재질로 묶는다.
색만 바뀌고 분리 관계가 같으면 geometry의 슬롯 stream을 재사용한다.
원본 면이 같은 style이면 modifier 캐시에도 적용한다. 서로 다른 style의 slot provenance가 캐시에 없으면
경고와 함께 원본 편집 메시로 표시한다. 평가 캐시의 전체 재질 지원 완료로 설명하지 않는다.

toony=1에서 선형 구간 양끝이 같은 경우만 step으로 정의하고 screen outline은 원근·직교를 구분한다.
정확한 shader 문장 match, 원래 compiler 호출, 별도 program cache key를 유지하며 소스 불일치/중복 패치를 거부한다.
world 폭은 장면 단위, screen 폭은 SDK factor다. SDK의 NDC convention에서 실루엣의 높이 비율은 factor/2이므로
UI는 화면 높이 %로 변환한다. 단위 표시만으로 원래 factor가 반올림되어 달라지지 않게 보존한다.
[MToon outline 사양](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_materials_mtoon-1.0/README.md#outline-width)과 설치 SDK 소스를 함께 확인한다.

## migration — GLB·worker·자체 가져오기

실제 exporter와 batch worker는 slot별 primitive, linear RGB의 실제 `materials[]`,
`VRMC_materials_mtoon`과 일반 viewer용 PBR fallback을 작성한다. 같은 style은 재사용한다.
index·source face ID를 함께 묶어 winding·UV·normal·원본 정점 대응을 보존한다.
primitive provenance는 해당 삼각형만 가리킨다. 무재질 입력은 기존 bytes·report·metrics를 유지한다.

packed manifest·CRC·report source의 optional `toonMaterialsHash`로 재질을 검증한다.
geometry hash가 같아도 다른 재질의 응답은 거부한다. actual handoff 결과에도 사용한 hash를 남긴다.
호스트 lease는 재질 변경과 전달 권한 해제 시 진행 중 작업을 abort하고 늦은 결과를 폐기한다.
자체 GLB는 DTO·내용 hash와 실제 PBR·VRMC payload 전체를 대조한 뒤 복원한다.
추가 texture나 설정 불일치는 전체 가져오기를 취소한다. 초기 geometry·재질을 한 번의 batch 등록·undo로 묶는다.
일반 외부 material·texture·rig를 모두 가져온다고 표시하지 않는다.

## current — BG3D 표시·래스터의 미완성 경계

현재 BG3D는 자체 툰 GLB에서도 PBR fallback을 사용한다. 원본 payload 보존과 툰 픽셀 표시를 구분한다.
실제 전달된 툰 자산에 `toon-material-display-fallback` 보고를 붙이고 전달 전 설명과 전환 callback에 안내한다.
generic MToon plugin, clone의 compiler guard, override의 outline/opacity, WebGPU node material,
native PNG와 고해상도 raster/tile은 후속 required 작업이다.
기존 tile admission은 custom shader/MToon을 거부하며 단순 허용으로 바꾸지 않는다.
screen outline은 전체 출력 높이·tile 높이를 함께 처리하고 beauty와 normal/depth pass 의미도 검증해야 한다.

## target — 화면과 GLB의 공통 surface 삼각화

독립 actual buffer 대조에서 기존 Viewport의 원본 fan과 GLB의 planar ear clipping이 다른 대각선을 쓰는
경우를 확인했다. 단위 평면 quad의 코너 UV `[(0,0),(2,0),(1,1),(0,1)]`에서 점 `(0.6,0.3,0)`은
화면 fan에서 V-up `(0.9,0.3)`, 실제 GLB에서 V-down `(1.2,0.7)`이었다.
GLB를 명시적으로 V-up으로 변환해도 `(1.2,0.3)`이므로 U 보간 차이 약 0.3은 좌표계 차이가 아니다.
corner 값만 비교해서는 표면 내부 UV의 일치를 증명할 수 없다.

작은 nonplanar warp `1e-7`을 GLB가 planar epsilon 아래로 처리하는 경우 flat normal 규칙도 다르다.
이 차이를 tiny rounding으로 치부하지 않는다. shared surface planner로 삼각화·법선·코너 UV·선택 대응을
일치시키는 수정과 실제 픽셀 검증 전에는 일반 surface 출력 fidelity를 완료로 보지 않는다.
이 항목은 현재 툰 명령·재질 payload 보존 테스트와 별개의 남은 required 작업이다.

## migration — 검증 경계

집중 검증은 DTO·권위·OPFS/작업파일, 실제 Editor/hook·lease, Three group/normal,
재질 부착·폐기, GLTFLoader parse·실제 worker entry·자체 import를 포함한다.
무재질 state/snapshot/등록과 exporter는 `7ccb2684` 원문 reference와 직접 대조했다.
최종 집중 회귀는 **18파일 214개가 exit 0**으로 통과했다. material·자체 import·workspace lease와
기존 FileTools·Viewport·handoff·실제 worker client·GLB exporter를 한 명령에서 실행했다.
이는 위에 기록한 surface 보간 불일치를 해결했다는 증거가 아니다.
전체 타입·하네스·프로덕션 빌드·브라우저 shader/픽셀·desktop/mobile·테마·접근성은 아직 실행하지 않았다.
앞선 후보의 검증으로 대체하지 않으며 기능 전체나 운영 제공 완료를 선언하지 않는다.

소스는 [materials](../../apps/web/src/domains/creator/hybrid-dcc/materials),
[문서 상태](../../apps/web/src/domains/creator/hybrid-dcc/document/studio-hybrid-dcc-document-state.ts),
[자체 가져오기](../../apps/web/src/domains/creator/hybrid-dcc/native-import/studio-hybrid-dcc-native-toon-material.ts)가 정본이다.
