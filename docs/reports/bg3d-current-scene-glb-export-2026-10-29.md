# BG3D 현재 장면 GLB 출력 검증 — 2026-10-29

- 상태: `migration` — 현재 장면·RGBA·affine UV의 실제 GPU 왕복과 초기 복원을 확인했으며 최종 UI·타입·전체 검사를 마감 중이다.
- 작업 브랜치: `codex/sketchup-scene-export`, 기반 `35307f655e0ce855cca0f363c9b98c448e4ea8f9`.
- 전체 SketchUp 요구 SK28의 부분 구현이다. 다른 CAD 형식·연결 캐릭터·모든 셰이더·완전한 편집 문서 복원을 완료로 판정하지 않는다.
- 실제 native writer의 관측과 공식 계약은 [REA 기록](sketchup-scene-export-rea-2026-10-29.md)에서 분리한다.

## 실제 구현

아래 UI 증거는 이름 변경 전 `보기 → 배경 건축 · 3D 도구 열기 → 배경 건축 · SketchUp → 현재 표시 장면 GLB 저장`에서
현재 배경 문서의 표시 오브젝트를 저장한 결과다. 고정 상자 예제를 출력하던 CAD 생성기와 별도 경로다.
13종 기본 도형과 검증 모델, 부모 local TRS, 현재 재질·페인트·포즈를 독립 Three 그래프로 조립한다.
캐시의 정규화 배율 k는 그대로 두고 문서의 인스턴스 배율을 바깥 그룹에 적용한다.

원본 cached Blob과 최종 GLB를 Worker에서 검증한다. 준비 중 runtime·정본·렌즈·세션·renderer·cache·권리·
양방향 연결이 바뀌면 다운로드하지 않는다. 원본 문서·history·보관함을 쓰지 않으며 파일 주소는 소유 호출이 해제한다.
현재 원근 zoom·직교 높이/zoom·up/roll·near와 실제 화면 비율을 보존하고, stock exporter의 직교 배율 오류를 보정한다.
프로젝트의 연결 캐릭터, 손실 없이 표현하지 못하는 projection·재질·UV는 조용히 누락하지 않고 실패로 안내한다.

원본 clip은 복제 UUID에 연결한다. 현재 포즈와 추가 pose/constraints/morph를 합성한 상태를 보관하지만
합성된 전체 animation을 새 clip으로 bake한 것은 아니다. 원본 GLB의 extras/extensions는 버전이 있는
별도 provenance metadata로 보관하며 새로운 장면의 편집 원본 권위로 재해석하지 않는다.
단면은 자르기 전 형상과 실제 단면 설정을 구분하고, 배경·환경·NPR 등 표준 glTF로 재현되지 않는 효과는 설정으로 보관한다.

2026-10-29 후속 사용자 지시로 제품 이름을 **공간 모델러**로 변경했다. 현재 경로는
`보기 → 공간 모델러 열기 → 공간 모델러 → 현재 표시 장면 GLB 저장`이다.
주 패널·예제 컴포넌트와 탭 식별자를 `SpatialModeler`·`spatial-modeler`로 옮겼고,
이전 GPU/UI 기록의 27개 소스 지문은 이름 변경 전 상태를 가리킨다. 후속 모바일 패널 높이·접힘 변경도
아래 30개 UI 확인의 검증 범위에 자동으로 포함하지 않는다. 이후
[이름·모바일·품질 보존 검증](spatial-modeler-quality-validation-2026-10-29.md)의 scoped 타입·113회귀·정적 검사는 통과했으며 새 화면 검증은 대기 중이다.

## RGBA·UV 추가 보완 전 중간 검사

| 검증 | 결과 |
| --- | --- |
| 새 GLB 관련 9개 파일 회귀 | **164/164 통과**, maxWorkers 2, 12.49초 |
| 기존 ViewPanel·launcher·workbench·host ports 8파일 | **43/43 통과**, maxWorkers 2, 20.29초 |
| root 진입점·전이 import·새 회귀의 strict scoped TSC | exit 0, 4096 MiB 제한 |
| 카메라·graph·UV·texture·source/command/host의 영역별 TSC·ESLint·Secretlint | 통과 |

위 결과는 전체 저장소 타입 검사·전체 harness·production build를 대신하지 않는다. 마지막 보완 후 최종
고정 소스의 검사·브라우저·해시와 커밋 상태는 이 기록에 추가한다.

## RGBA·UV 추가 보완의 현재 검사

- 새 GLB·이미지·UV·복원·공통 GLB writer를 묶은 **16파일 270회귀**가 단일 worker에서 exit 0, 9.09초로 통과했다.
- 이 묶음에는 UV helper 15개, graph/texture helper와 묶은 61개, metadata/bridge/공통 writer의 40개가 포함된다.
  별도 실행 수치를 더해서 테스트 개수를 부풀리지 않는다.
- 공통 writer의 literal `__proto__` 키 복사를 own property로 바꿨다. 원본 GLB extras를 실제 검증 record로 만든 뒤
  source metadata·camera finalize·attribution 기록을 거쳐 같은 키를 보존하는 회귀가 통과했다.
- 추가 scoped TSC는 4096 MiB에서 exit 2로 종료했다. 첫 fixture 오류를 실제 타입 가드·HTMLCanvas·typed bytes로
  맞췄고, 두 번째에는 WebGPU 색 노드의 vec3 연결 1곳만 남았다. 설치된 공개 `ConvertNode<"vec3">` 생성자로
  런타임의 실제 출력 형식을 명시했다. 이후 같은 narrow 설정의 재확인은 exit 0이며 위 후속 검증 기록에 입력 지문을 남겼다.
  두 번째 실행 전후 변경 입력 44개의 SHA가 같았음을 확인했다. 메모리·검사 범위·타입 기준은 완화하지 않았다.
- alpha0·alpha1·alpha128과 UV bake를 포함한 새 GPU probe는 첫 wrapper 시도가 readiness 60초에서 실패해
  브라우저·GPU·Worker 0회로 종료했다. 원시 실패와 소유 프로세스 0을 별도 기록했다.
  로그를 파일로 확보하는 root 소유 서버에서 실제 listen을 확인한 뒤 브라우저 1회를 명시적으로 다시 실행 중이다.
  첫 startup 실패 원인은 미확인이다. 이후 root 정상 launcher 경로에서 아래 20개 사례를 실제 완료했다.

이 상태는 커밋·최신 전체 하네스·production build의 완료가 아니다.

## 최신 fresh UI 출력 확인

추가 RGBA·UV 경로를 포함한 production 27파일을 동결한 뒤 새 CFT context에서 WebGL2 fallback→정밀 편집→
실제 사용자 버튼 다운로드를 확인했다. **30개 확인 항목이 모두 true**였고 표시 3개·숨김 1개의 계층·현재 PBR·
world matrix/AABB·직교 카메라·권리·단면 metadata와 원본 불변을 GLTFLoader로 대조했다.
파일은 `현재 학원 배경.glb`, **19,440 bytes**, SHA-256
`b480f9b4a57806a80a586c7cc7beae496a4edfcfb3f4579b7944bde0eedbf799`다.

390/1600 px와 light/dark/contrast 6조건의 axe violation·incomplete·가로 넘침은 모두 0이었다.
이 접근성 검사는 해당 출력 panel의 범위다. 모바일 전체 편집기와 모든 기능의 조작 완료로 확대하지 않는다.
원시 `flow-proof.json` SHA-256은 `0624224cf8da9ecff682dffbf71bdd2886663cd8aeb43cb375c22f632887129d`이며
실행 전후 27파일 해시가 같았다. 최종 요약과 6개 화면은 `scene-export-browser-2026-10-29/`에 보관했다.
독립 import가 빠진 첫 UI 보조 스크립트 실패도 보존하고 수정 뒤의 성공과 구분한다.
브라우저를 닫고 root 소유 서버를 SIGTERM으로 종료한 뒤 PID·58647 listener 부재를 확인했다.

## 실제 사용자 버튼의 중간 증거

Chrome for Testing `156.0.8078.4`, WebGL2/SwiftShader에서 부모 상자·자식 원기둥·직접 편집한 자식 모델을
실제 UI 버튼으로 내려받았다. GLB는 19,444 bytes이며 숨긴 구 하나를 제외하고 표시 노드 3개를 담는다.
실제 GLTFLoader로 재로드한 부모 관계·world matrix·world AABB·PBR 색/roughness/metalness가 화면과 일치했다.
원래 H8/zoom2의 직교 높이 4와 실제 viewport projection·pose를 유지했다. 정본 노드 4개와 숨김·단면 설정,
원래 attribution은 metadata에 남고 private 저장 ID는 없다. export 전후 live 장면은 같았다.

이 warm 실행의 확인 28개가 전부 true였고 page error·console error·HTTP 실패는 0이었다.
390/1600 px × light/dark/contrast 6조건의 axe-core 4.14.0은 위반·incomplete·가로 넘침 모두 0이었다.
이 자료만으로 fresh 초기 모델 복원까지 통과했다고 판정하지 않는다.

## 실제 압축 텍스처 GPU 증거

자체 제작 2,772-byte `KHR_texture_basisu` GLB를 실제 Worker atomic OPFS import·재검증·verified loader·
source capture·graph·artifact 최종 Worker 검증·GLTFLoader에 연결했다. 실제 runtime은 ASTC 4×4, 8×8, k1이다.
KHR manual 비균일 배율/회전과 Three uniform 배율/중심점/회전의 두 사례에서 UV 행렬 오차는 1.11e-16,
원본/최종 render RGBA 최대 차이는 0이었다. 개인 GPU context는 각 1개만 만들고 반환 시 해제됐다.
원본 texture·geometry·material dispose는 0회, 기존 canvas/context·Source version·mipmap 바이트도 유지됐다.
소유 OPFS record 삭제 뒤 같은 ID 조회가 null이었고 소유 Chrome PID 잔존·console/page error는 0이었다.

별도 자체 DXT5 sRGB·Linear normal map·불투명/alpha128 네 사례도 실제 개인 GPU·PNG 왕복을 통과했다.
WebGPU는 adapter 미지원으로 명시 실패했으며 자동 WebGL 전환은 없었다. WebGPU 픽셀 성공은 미확인이다.
세부 산출물은 visualization의 `scene-export-texture-browser-2026-10-29/`에 보관했다.
최종 `texture-proof.json` SHA-256은 `f9e4b1a465ecd1435bd6896d8b9a23d56d5ef128c51215fcdab8f3126c15a81e`다.

## RGBA와 affine UV의 추가 GPU 검증

WebGL2 SwiftShader의 실제 추가 검증 **함수 15/15·asset artifact 5/5**가 통과했다.
BC3/DXT5 4×4의 alpha 0·1·128을 OPAQUE baseColor·normal·공유 ORM에 적용한 9개와,
DataTexture 2·3·5×2의 양쪽 flipY 6개를 실제 helper→bridge→exporter→image registry→GLTFLoader로 확인했다.
모든 현재 물성 렌더의 최대 채널 차이는 **0**이었다. baseColor·ORM·DataTexture의 raw RGBA 차이도 0이다.
normal은 glTF의 부호/방향 변환에서 의미 없는 alpha가 255로 바뀌는 사례를 raw 동일성 성공으로 계산하지 않았으며,
실제 normal 물성 렌더의 차이 0으로 판정했다.

별도로 자체 PNG 3×5 GLB를 실제 Worker·OPFS에 저장한 뒤 verified loader·source capture·artifact 최종 Worker·
GLTFLoader를 거친 5개도 raw RGBA와 현재 렌더 차이가 모두 0이었다. baseColor·normal·ORM 기본 3개와,
검증용 cache에 auto 비균일 반복/회전/중심점 또는 manual shear를 적용한 baseColor 2개다.
두 UV 사례의 최종 baked attribute×texture matrix 오차는 각각 약 `3.395e-8`, `4.101e-8`이었다.
이는 원본 asset identity UV와 검증용 runtime cache의 변경을 구분한 함수·artifact 증거이며 앱 UI UV 편집 완료 증거는 아니다.

GPU가 필요한 사례마다 개인 context 1개가 반환 시 해제됐고, DataTexture 경로는 개인 GPU를 만들지 않았다.
원래 Source·pixel bytes·sampler·UV·live canvas는 같았고 실제 asset record 5개는 삭제 후 같은 ID 조회가 null이었다.
소유 Chrome PID 잔존·pageerror·console error·requestfailed는 모두 0이다. WebGPU 픽셀 성공은 여전히 미확인이다.

산출물은 `scene-export-texture-browser-2026-10-29-alpha-preservation/`에 보관했고, 원시 `alpha-proof.json`
SHA-256은 `c18544632823efe44ca8186962a566f17f9692a1920e1a425eafdb42b3fd22e7`다.
같은 동결 production 27파일의 해시는 별도 `source-manifest.json`에 연결했다. 앞선 readiness·interpreter·
자식 launcher 실패 기록은 삭제하지 않았고 최종 root launcher 성공과 구분한다. 권한 상승은 사용하지 않았다.

## fresh 초기 복원의 추가 회귀와 남은 목표

새 context에서 초기 모델 복원과 WebGPU→WebGL2·정밀 편집 renderer 전환이 겹치면 초기 노드 4개가
렌더 노드 0개로 남는 실패를 실제 재현했다. 35307 기반의 새 export 미커밋 작업트리에서 관측했고,
당시 복원 hook은 35307과 SHA-256 `590df92634bca0cdd4c7f0d9b8a34ea572e7fd9404f36a85ab15668724900ec3`로 같았다.
clean 35307 단독 실행이나 origin/main 직접 재현은 하지 않았다. 진행 중인 초기 복원과 완료 후 remount를
구분하고 현재 attempt만 완료를 발행하도록 보완했다. helper·실제 hook·remount의 3파일 12회귀는
단일 worker에서 exit 0, 2.60초로 통과했다. 늦은 이전 조회가 reject된 경우의 삭제 reconciliation도 포함한다.
동일한 fresh CFT context의 실제 Worker 원본 import→WebGL2 fallback→정밀 편집에서 4node 복원을 확인했다.
hook SHA-256은 `50f85c7b995726b85d6290efa4de49e4bf2e4bebe002de47be3025a4183e488d`,
helper는 `75b2faa85a494b90fba8565f3d9fda507e386c8ab0fdc51db04de6f0a0d00094`다.
`scene-export-browser-2026-10-29/cold-start-after-restore-fix/`의 JSON·화면에 기록했고 브라우저·서버는 정상 종료했다.
이 확인은 초기 복원 회귀의 범위이며 RGBA 보완 후의 최종 다운로드 검증과 분리한다.

기존 압축 GPU 증거만으로는 alpha0 데이터맵 보존을 입증하지 못했다. Canvas 합성 경계를 raw RGBA capture·
직접 PNG 인코딩·최종 GLB image 참조 교체로 보완했고 위 추가 GPU 검증을 통과했다.

UV는 Three의 T×S×R과 KHR의 T×R×S가 다르다. 표현 가능한 행렬은 동등 KHR 경로를 유지하며, Mesh의 비균일
배율/일반 회전·affine shear는 개인 geometry의 UV에 굽는 fallback을 추가 연결했다. helper 15개와 graph·
texture helper 3파일 61개 회귀가 단일 worker에서 통과했다. projective·다섯 번째 recipe·UV morph·UV 누락,
Lines/Points의 미표현 변환은 명시 실패한다. 실제 bake·RGBA 결합의 추가 GPU 검증은 위 20개 사례 범위다.
float/HDR·custom shader·wireframe·instanced morph·procedural surface 등도 잔여다.
서로 다른 metalness/roughness texture는 stock 합성에서 한쪽 UV·sampler만 남기고 반투명 RGB까지 합성될 수 있다.
현재는 같은 texture를 공유하는 ORM을 보존하고 별도 map은 명시 거부한다. 개인 이미지 packing·공통 UV 보존은
후속 구현 대상이며 같은 UV 행렬만 검사해 이 경계를 해결한 것으로 처리하지 않는다.
cutout 재질에 opacity multiplier를 적용한 `transparent && alphaTest > 0`도 stock BLEND 출력이
원래 cutoff를 버리므로 현재 명시 거부한다. cutoff와 혼합을 함께 보존하는 bake가 잔여다.
raw GLTFLoader의 미터·형상 왕복과 ToonStudio의 전체 정본 편집 복원·기존 2m import 정책은 별도 요구다.

전체 heavy 검사는 조정한 순서의 명시 신호를 기다린다. 4d86의 clean 35307 후보는 별도 보존하며
이 새 작업트리의 push·PR·병합·배포는 수행하지 않았다. 전체 33개 요구의 완료 판정은 계속 미완료다.
