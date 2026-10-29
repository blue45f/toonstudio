# BG3D 현재 표시 장면의 GLB 출력

- 상태: `migration` — 현재 표시 장면의 GLB 경로를 구현·검증 중이며 SK28 전체 완료는 아니다.
- 기준일: `2026-10-29`.
- 추적 요구: [SketchUp 기능 원장 SK28](sketchup-feature-coverage.md).
- 검증 기록: [현재 장면 GLB 통합 기록](../reports/bg3d-current-scene-glb-export-2026-10-29.md).
- 원본 조사: [공식 출력 계약·Ghidra 정적 분석](../reports/sketchup-scene-export-rea-2026-10-29.md).

초기 복원 중 renderer가 전환되는 fresh context의 빈 장면 문제는 실제 4node 복원과 12회귀로 보완을 확인했다.
추가 raw RGBA·affine UV는 실제 GPU 20사례, 최신 fresh UI 출력은 30개 확인과 6조건 axe 검사로 확인했다.
이 GPU20·UI30은 후속 MR packing·HDRI·저장 출처 제한 구현 전 체크포인트의 증거이며 현재 후보를 검증하지 않는다.
최신 타입 재검사·전체 하네스·production build의 완료 판정은 별도다.
최종 통합 검사 결과와 완료 판정은 통합 기록에서 별도로 마감한다.

## 사용자 경로와 파일의 범위

3D 배경 편집기의 **보기 → 공간 모델러 열기 → 공간 모델러 → 현재 표시 장면 GLB 저장**에서 파일 이름을 정하고 GLB를
다운로드한다. 진행·취소·실패·재시도를 표시하며, 준비 중 원본 장면이나 카메라·renderer가 바뀌면
이전 결과를 다운로드하지 않는다. 라이브러리의 개별 정규화 GLB 원본 다운로드는 별도 기능이다.

출력은 canonical 문서와 실제 viewport framing에서 캡처한 현재 표시 배경 오브젝트를 대상으로 한다.
부모·태그를 포함한 유효 가시성을 계산하며 숨긴 오브젝트의 기하는 제외한다. 숨긴 노드 정보는
아카이브 metadata에 구분해 보관한다. 프로젝트에 연결된 캐릭터까지 묶는 출력은 현재 명시적으로 거부한다.

기본 도형 factory의 13종 `box`, `cylinder`, `plane`, `sphere`, `hemisphere`, `cone`, `pyramid`,
`triangularPrism`, `hexPrism`, `torus`, `tube`, `ring`, `capsule`과 검증된 custom model graph를 구성한다.
canonical `parentId`의 부모 관계와 local TRS를 실제 Three 계층에 연결한다. 모델 root의 정규화 배율
`k`와 현재 instance TRS를 함께 사용해 현재 장면의 배치·치수를 유지한다. 이름과 공개 node/attachment
식별자를 보존하며 비공개 로컬 저장소 키를 새 장면의 공개 식별자로 사용하지 않는다.

## 재질·표면 페인트·현재 pose와 원본 clip

export용 geometry·material·texture는 cache 소유 자원과 분리한다. 현재 재질 override, 지원하는 CC0 PBR
맵과 표면 페인트를 개인 사본에 적용하고 실제 이미지가 준비됐는지 확인한다. 원본 texture의 Source/version,
공유 재질·픽셀·라이브 캔버스를 바꾸거나 dispose하지 않는다.

지원하는 LDR 압축 2D 텍스처는 선택된 엔진의 개인 renderer에서 같은 픽셀 크기로 디코드해 PNG로
출력한다. `maxTextureSize: Infinity`를 유지하며 조용히 해상도를 줄이지 않는다. GPU 미지원·준비 실패는
명시적인 실패다. WebGPU로 선택된 작업을 WebGL로 자동 전환하지 않는다. 개인 GPU와 decoded canvas/texture는
진행 중 작업이 물리적으로 끝난 뒤 정리한다. 실제 WebGPU 픽셀 성공은 현재 확보한 headless 증거에 없다.

현재 joint·morph·애니메이션 frame의 pose를 사본에 적용하고, 원본 animation clip은 사본 인스턴스의
대상에 맞춰 다시 연결한다. **현재 화면의 pose**와 **재생 가능한 원본 clip**을 구분한다. clip 선택·혼합·
속도·반복을 포함한 ToonStudio의 합성 playback 전체를 새 animation으로 bake한 것으로 설명하지 않는다.
동일한 clip 이름을 가진 복수 모델도 노드별 연결을 분리한다.

## 카메라·단위·구도

현재 viewport의 eye/target/up·projection·zoom·framing을 읽는다. 원근 카메라는 zoom을 포함한 유효 화각을,
직교 카메라는 명시 높이 또는 실제 viewport에서 읽은 legacy frustum을 사용한다. GLB 카메라를 실제
GLTFLoader로 다시 읽었을 때 같은 구도가 되도록 투영값과 pose를 기록한다. legacy 문서에 새 직교 높이를
추측해 채워 넣지 않는다.

장면 GLB의 좌표는 미터·Y-up으로 기록한다. 현재 증거의 복원 비교는 **raw GLTFLoader의 metre parity**다.
다음 항목의 완료를 뜻하지 않는다.

- ToonStudio의 전체 canonical 문서·asset registry·편집 이력을 그대로 재생성하는 editable 복원.
- 내보낸 GLB를 기존 일반 모델 가져오기로 다시 넣을 때의 legacy 최장 변 2 m 정규화 정책 해결.
- SKP·CAD·벡터·영상 등 SK28의 다른 형식 전체 출력.

## UV 행렬과 개인 정점 bake

Three의 UV `center`·별도 matrix를 stock exporter 속성에 그대로 넘기면 위치가 달라질 수 있다.
특히 Three의 S×R와 현재 GLTFLoader의 KHR R×S 순서를 구분한다. 개인 texture의 실제 행렬을 기준으로
동등한 KHR offset/scale/rotation을 계산하고, `center=0`·수동 행렬로 유지한다.

표현 가능한 manual KHR 비균일 배율·회전과 uniform 배율·center·회전의 기존 경로는 실제 GPU 렌더와
행렬 대조를 통과했다. KHR로 표현할 수 없는 Mesh의 auto 비균일 배율+회전·affine shear는 개인 geometry의
UV attribute에 굽는 경로를 추가 연결했다. 같은 source channel·행렬은 같은 recipe를 재사용하고 최대 4개
UV channel에 개인 material/texture를 연결한다. 원본 UV·geometry·Source는 바꾸지 않으며 같은 ORM pointer도 유지한다.
정점·법선·index·tangent·morph position은 복사해 유지한다. helper 15회귀와 graph를 포함한 집중 61회귀를 확인했다.
추가 bake의 실제 artifact 두 사례는 현재 렌더 차이 0과 합성 UV 오차 약 4.101e-8 이하를 확인했다.
이는 검증용 cache 변환을 사용한 함수 증거이며 앱 UI의 모든 UV 편집 동작을 입증한 것은 아니다.

projective UV, 다섯 번째 recipe, 누락·비유한 UV와 UV morph, Lines/Points의 표현 불가 변환은 현재 명시 실패다.
이를 SketchUp의 모든 UV 편집·사영 UI와 파일 왕복 지원 완료로 취급하지 않는다.

metalness·roughness가 같은 ORM texture를 공유하면 그 연결을 유지한다. 서로 다른 두 texture를 stock
exporter로 직접 합치면 한쪽 UV·sampler만 남고 alpha RGB도 합성될 수 있다. 이를 직접 넘기는 경로는 계속 거부한다.
2026-10-29 후속 `migration` 구현에서는 artifact만 개인 packing을 유예하고, 같은 크기·선형 색공간·UV·sampler의
캡처에서 roughness G·metalness B를 정확하게 옮긴 별도 RGBA8/PNG를 두 슬롯에 같은 pointer로 연결한다.
단일 map은 없는 채널을 255로 채우고 material scalar는 유지한다. AO가 원래 map을 공유하면 AO의 R은 별도로 보존한다.
추가 raw RGBA 예산·자원 소유권·실패 원자성을 함께 연결 중이며 아직 이 후속 구현의 실행 검증은 하지 않았다.
후속 source와 이전 검사 경계는 [표면 출력·품질 선택·실행 소유권 기록](../reports/spatial-modeler-packing-ownership-2026-10-29.md)에 구분했다.
기존 GPU20·UI30·113회귀는 이 packing 구현의 증거가 아니다. 서로 다른 recipe·sampler·크기와 사용 중 authored mip은
무손실 결합이 확인되지 않아 명시 거부한다. 자동 mip 재생성·외부 viewer의 anisotropy 동등성도 별도 범위다.
가져온 cutout 재질의 불투명도를 낮춰 `transparent`와 `alphaTest`가 동시에 유효해진 경우도 GLB의
단일 alphaMode가 cutoff를 버리므로 명시 거부한다. 같은 모양을 보존하는 별도 bake가 남아 있다.

raw capture·직접 PNG 인코딩·공식 exporter plugin의 image 참조 치환을 연결해 alpha0 RGB가 Canvas 합성에서
사라지는 경로를 보완 중이다. baseColor/emissive 등 색 슬롯은 sRGB, 데이터 슬롯은 linear/NoColorSpace라는
glTF 계약과 다른 원본을 임의 변환하지 않는다. PNG는 base mip의 RGBA8을 보관하며 authored mipchain 전체나
viewer가 다시 생성한 mip의 동등성은 이번 증거에 포함되지 않는다.

## 검증·권리·metadata와 읽기 전용 수명

준비 시 canonical 지문, 모달 세션, 현재 renderer identity, 원본 record·attachment 양방향 연결·권리,
cache root identity와 `k`를 묶어 읽고 비동기 경계에서 다시 확인한다. 저장된 원본 Blob의 실제 바이트를
Worker로 재검증한 개인 snapshot을 사용하며, 완성한 출력도 SHA·바이트·기하·텍스처 예산을 Worker로
검증한 후에만 다운로드한다. 원본 자산을 덮어쓰거나 새 모델로 admission하는 명령은 아니다.

검증 record와 attachment의 권리를 일치시키고 필요한 attribution을 파일의 copyright와 node metadata에
보존한다. 사용자가 원본 파일에 담은 extras/extensions는 원래 index·source hash와 함께 source metadata
아카이브로 분리한다. renderer cache·GPU 객체·앱의 runtime userData를 현재 내보내기 graph에 그대로
붙이지 않는다. 아카이브 metadata의 존재를 출처·소유권 인증이나 ToonStudio 편집 권위로 승격하지 않는다.

2026-10-29 후속 `migration` 구현은 실제 표시 모델마다 현재 V12 manifest/CAS 또는 exact 배포 catalog의
출처를 확인하는 preflight를 연결한다. `commercialUse:true`와 원본 3D 파일 다운로드 허가는 다른 계약이다.
서비스 전용 번들 또는 그 파생본이 표시 범위에 있으면 전체 GLB 요청을 `rights-restricted`로 거부한다.
출처를 확인하지 못하면 `rights-unavailable`로 끝내며 모델을 조용히 누락하거나 권리 라벨로 허가하지 않는다.
숨긴 부모·태그 아래 자산은 출력 bytes에 포함되지 않으므로 이 파일 요청의 권위 조회 대상에도 넣지 않는다.

새 저장 record의 optional `sourceRestriction` V1은 파일 출력 상태, 최초 origin의 record ID/SHA-256과
직전 parent ID/SHA-256을 구분한다. 파생물의 `contentHash`로 최초 SHA를 덮지 않는다. 실제 사용자 파일과
자체 생성물의 명시 등록, 가공 원본의 실제 재조회, 동일 transaction의 source/CAS 재검사를 구분한다.
필드가 없는 레거시는 현재 사용·렌더 형태를 유지하며 파일 출력 판단만 `unknown`이다. 같은 bytes라도
다른 제한·권리·계보를 조용히 합치지 않는다. 동등한 명시 신규 등록과 내용이 같은 원본의 no-op 파생은
기존 origin을 유지하는 dedup으로 다룬다.

서비스 내 가공·미리보기·적용은 유지하며, 선택 원본의 결과 파일과 project archive의 raw GLB 인계도 같은
출처를 확인한다. archive 안의 직렬화된 허가 표기만으로 새 허가를 만들지 않는다. 기존 저장소에 동일한
검증 원본과 권리·출처가 있으면 그것을 확인해 정상 왕복에 재사용하고, 다른 기기·원본 부재·레거시 미확인
archive는 `unknown`을 유지한다. 이 호환성 경계는 아직 구현·회귀 검증 중이다.

원본 ID와 파생 제한은 내부 저장/검증 권위이며 GLB의 공개 extras에 추가하지 않는다. 출력 준비와 개인 자원
정리가 끝난 뒤, 실제 파일 인계 직전에 exact record/CAS/catalog를 다시 읽는다. 다른 모델이나 썸네일의
정상 revision 증가만으로 실패하지 않으며 원본 내용·제한·출처 변경은 거부한다. 최종 재조회가 모든 탭의
writer를 파일 인계까지 잠그는 전역 transaction이라고 주장하지 않는다. 이 후속 source의 실행 검증은 별도다.

저장 호환성은 한 방향이다. 새 reader는 `sourceRestriction`이 없는 기존 manifest를 읽지만, 이전 exact-key
reader는 새 필드가 기록된 manifest를 읽지 못한다. 따라서 향후 운영 배포 전에는 새 codec을 유지한 호환
rollback/roll-forward 후보로 실제 자료 보존을 확인해야 한다. 단순 구버전 바이너리 전환, 제한 필드 삭제,
`unknown`을 허가로 바꾸는 처리를 복구로 사용하지 않는다. 현재 main 병합 범위에는 운영 배포나 저장 자료
마이그레이션 실행이 포함되지 않는다.

명령은 canonical 문서·선택·장면 actor·history를 변경하지 않는다. 성공·취소·실패에서 원본 scene/cache를
보존하고 개인 graph·GPU·texture·object URL만 정리한다. 같은 장면의 이후 명령을 오래된 snapshot으로
내보내지 않도록 scope 검사를 유지한다.

## 단면·화면 효과와 미완료 기능

UI가 명시하듯 단면은 **자르기 전 기하**로 출력한다. 실제 활성 단면 상태를 metadata로 보관하지만
절단 mesh·단면 채움의 파일 출력을 완료한 것은 아니다. 렌더러/NPR 선화·안개·sky·배경·환경/ambient·
출력 효과·그림자 표시 설정도 metadata의 보관 범위를 구분하며 GLB viewer의 같은 화면 렌더를 보장하지 않는다.

다음은 전체 목표의 잔여다. 일부는 현재 명시적으로 거부하며, 나머지도 동등한 출력 완료로 표시하지 않는다.

- HDR float/BC6H, custom shader, wireframe의 같은 의미·화질 보존.
- instanced morph와 procedural surface 등 별도 형상·재생 권위.
- 프로젝트 연결 캐릭터·합성 playback bake와 모든 렌더 효과의 실제 파일 표현.
- projective·UV morph·4채널 초과 등 표현 불가능한 UV, 전체 canonical editable 복원, 형식별 왕복.
- WebGPU의 실제 픽셀, authored mipchain과 미지원 색공간/정밀도·별도 metal/rough 이미지 packing.
- 최신 후보의 전체 검사·production build.

## 현재 확보한 중간 증거

- 실제 UI 다운로드의 warm context에서 표시 노드 3개·숨김 1개, 28개 확인 항목이 모두 true였다.
- 실제 테마 3종×desktop/390 px 6조합의 axe 검사에서 violation 0·incomplete 0을 확인했다.
- 실제 Worker/OPFS KTX2 원본→verified loader→source/graph/artifact→GLTFLoader의 표현 가능한 두 UV 사례는
  렌더 RGBA 최대 차이 0, 행렬 최대 차이 약 `1.11e-16`이었다. 지원하지 않는 shear는 원본을 유지하며 거부했다.
- 위 GPU 검증에서 원본 texture/geometry/material dispose 0회, 개인 context 해제, 기존 live context 유지,
  소유 테스트 record 삭제·브라우저 PID 정리와 console error/pageerror 0을 확인했다.
- 추가 alpha 보존은 BC3/DataTexture 15사례와 실제 Worker·OPFS·artifact 5사례가 통과했다. 현재 물성 렌더
  차이는 모두 0이며 normal의 의미 없는 alpha·부호 변환은 raw 동일성 성공으로 계산하지 않았다.
- 최신 fresh UI의 30개 확인, production 27파일 해시 불변, 6조건 axe·overflow 0은 통합 기록에 연결했다.

GPU 원본 증거는 artifact 이름 `scene-export-texture-browser-2026-10-29/texture-proof.json`, SHA-256
`f9e4b1a465ecd1435bd6896d8b9a23d56d5ef128c51215fcdab8f3126c15a81e`다. 파일 위치와 UI·최종 통합 수치는
[통합 검증 기록](../reports/bg3d-current-scene-glb-export-2026-10-29.md)을 따른다. raw stock exporter를 graph 없이
호출한 반례와 현재 제품 경로의 성공·거부를 구분한다.

이 문서 작업에서는 CPU heavy 검증을 실행하지 않았고 동결된 4d86를 수정하지 않았다. 기능의 최종 전체
완료·검사 수치·커밋·배포 판정은 이 중간 증거와 분리한다.
