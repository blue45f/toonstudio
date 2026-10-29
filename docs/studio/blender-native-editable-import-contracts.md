# 자체 웹 모델 가져오기와 편집 메시 계약

상태: **migration**. 2026-10-29의 후속 브랜치에 구현한 설치 없는 모델 가져오기 계약이다.
운영 배포 완료 기록이 아니다. Blender 동작을 분석해 ToonStudio의 자체 웹 도구로 구현하는 방향은
[모델링 분석 계약](blender-native-modifier-contracts.md), 코너 UV 정본은
[UV 편집 계약](blender-native-uv-contracts.md), 아일랜드 정리는
[UV 정리 계약](blender-native-uv-pack-contracts.md)을 따른다.

## current — 기존 경로와 원본 형식의 근거

정밀 작업대의 기존 Grade A 분석 보고서만으로는 편집 메시 등록을 증명할 수 없었다.
후속 구현의 성공 조건은 원본 파일에서 실제 메시를 만들고 geometry authority에 등록하는 것이다.
Blender의 화면을 연결하거나 사용자의 컴퓨터에서 프로그램을 실행하는 흐름은 이 계약에 포함하지 않는다.

glTF 입력 규칙은 [Khronos glTF 2.0 명세](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)의
accessor·bufferView·primitive·node 계약에 근거한다. Blender와의 UV 방향 대응은 앞선 native UV 관측을
재사용한다. 이번 importer를 Ghidra로 디컴파일한 알고리즘의 복제라고 설명하지 않는다.

## migration — 실제 등록 경로

`workspaceImportBytes`는 파일 확장자별 decoder를 통해 GLB·embedded glTF·VRM·OBJ를 읽는다.
한 파일의 모든 대상 자산을 먼저 검증하고 `hybridDccRegisterAssets`로 한 번에 등록한다.
새 고유 ID를 사용하며, 한 자산이라도 등록 검증에 실패하면 일부만 확정하지 않는다.
원본 파일 해시·원본 노드/메시/primitive 대응과 실제 정점·면·UV 코너 수를 보고서에 기록한다.
등록 전체가 하나의 undo/redo 명령이며 `.toon3d` 작업파일에 정본과 이력을 저장한다.

기존의 실제 메시 adapter도 모든 메시를 등록한다. 분석 보고서만 얻은 형식은 `committed: false`와
`metadata-only` 또는 `unsupported`로 구분한다. 사용자 UI는 지원하지 않는 파일을 편집 성공으로 표시하지 않는다.
파일을 읽는 동안 계정·인증 세대·프로젝트·문서·원본 workspace가 바뀌거나 다른 편집이 시작되면 늦은 결과를 폐기한다.
FileReader 취소·재선택·unmount와 최종 `run.canCommit` 경계를 함께 확인한다.

### GLB·embedded glTF·VRM

- 활성 장면의 노드 계층과 모든 triangle primitive·instance를 해석한다. 원본 인덱스가 같은 참조만
  공유하고, 좌표가 같은 서로 다른 정점은 합치지 않는다. primitive가 실제로 참조하는 정점만 압축한
  로컬 색인을 만들어 shared accessor의 미사용 정점을 반복 복사하지 않는다.
- triangle list·strip·fan의 winding을 보존한다. 반복 인덱스나 편집 면적 한도 이하의 삼각형은
  진단과 함께 제외하며 유효 면이 하나도 없으면 실패한다. 점·선 primitive는 제외 사실을 안내한다.
- 부모 변환을 합성한 world 배치를 보존한다. 표현 가능한 TRS는 자산 변환으로 두고, 전단 또는
  변환 범위 때문에 그대로 표현할 수 없는 행렬은 위치에 bake한다. 반사 bake의 winding을 보정한다.
  계층 평탄화·primitive 분리·instance의 독립 복사도 보고서에 명시한다.
- `TEXCOORD_0`을 원본 색인으로 읽어 코너 UV로 옮긴다. glTF의 V를 정본의 `1-v`로 변환하고
  Float32에 확정한다. 범위 밖 UV도 유한하면 보존한다. 추가 UV layer는 현재 대상이 아니다.
- 축 반전 전 원본 UV와 확정 좌표를 비교한다. 원본에 있던 양수 edge·폭·높이 또는 비영 fan 면적이
  새로 접히거나 방향을 잃으면 실패한다. 입력부터 접힌 UV는 허용한다.
- sparse accessor·implicit zero accessor·stride·component alignment·attribute의 상대 offset과
  행렬 column padding을 검증한다. 예약 최대 인덱스, 잘못된 참조·순환 계층·비유한 값은 거부한다.
  `KHR_mesh_quantization`의 허용 component/semantic을 검사한다.
- 재질 슬롯 번호와 정적 geometry를 보존한다. 일반 외부 재질 외형·이미지·커스텀 법선·tangent·색·리깅·현재 포즈·
  모프·애니메이션·카메라는 가져오지 않는 사실을 안내한다. 이미지·외부 buffer URI를 요청하지 않는다.
  외부 파일을 참조하는 glTF와 필수 Draco/Meshopt 압축은 현재 decoder에서 지원하지 않는다.

### OBJ

- `v/f/vt/vn/o/g/usemtl/s`, 양수·음수 색인, UTF-8 텍스트와 유한 수를 검증한다.
  위치 색인은 원본 대응을 유지하며 좌표만으로 weld하지 않는다. 재질 슬롯과 면별 smooth Boolean을 보존한다.
- object/group과 UV가 있는 면·없는 면을 별도 자산으로 나누어 모두 등록한다.
  한 면 내부의 부분 UV는 빈 좌표를 추측하지 않고 오류로 설명한다.
- 평면 다각형 중 안전한 원본 fan은 유지한다. 오목하거나 fan으로 표현할 수 없는 면은 검증한
  ear clipping으로 나누고 모든 원본 코너·UV 대응을 유지한다. 지원하지 않는 비평면·파라미터 곡면은 거부한다.
- OBJ UV는 V-up을 유지한다. Float64 원본과 Float32 확정값 사이에 각 twin 끝점의 연결 관계가
  새로 합쳐지면 거부한다. 0으로 축소되는 UV도 성공 처리하지 않는다.
- 외부 MTL·이미지, 커스텀 `vn`, 양수 smoothing group 사이의 별도 hard 경계는 보존하지 않는 사실을 안내한다.
  서로 다른 object/group 또는 UV 유무로 분리하는 변화도 보고서에 남긴다.

### 입력·작업 예산

파일은 읽기 전후 모두 128 MiB 이하, JSON은 16 MiB 이하이며 현재 문서의 편집 자산은 256개 이하로 제한한다.
각 자산은 기존 HE 메시의 정점·면·코너 한도를 따른다. 파일 전체에는 256 MiB의 **예상 작업량** 한도를 둔다.
자산 추정은 `V*256 + C*(256 + UV가 있으면 96) + F*192` byte이며 GLB는 실제 참조한 정점·출력 코너를 센다.
OBJ는 여기에 디코딩한 텍스트·원본 배열·코너/면 참조와 bounded scratch 추정을 더한다.
이는 admission 계산이며 브라우저의 실제 heap 사용량이나 메모리 hard cap을 측정한 수치가 아니다.
accessor는 고정 정점 수 대신 전체 16M component 검사 예산을 따르므로 실제 출력이 작은 sparse/shared
배열을 불필요하게 거부하지 않는다. instance마다 `indexCount + triangleCandidates*12`의 순회량을
별도 16M 예산에서 먼저 차감한다. 퇴화 면만 반복되어 출력 메모리가 증가하지 않는 입력도 제한한다.
노드·깊이·OBJ 줄·토큰·다각형 검증의 실행량도 출력 할당 전에 제한한다.

## migration — 혼합 flat/smooth 표시

일반 OBJ의 smooth 및 혼합 flat/smooth 면을 표시하기 위해 원본 half-edge 연결에서 코너 법선을 계산한다.
맞닿은 두 면이 모두 smooth인 연결만 묶고 UV seam이 나뉘기 전 정점의 smooth 연결을 사용한다.
flat 면은 기존 fan 삼각형 법선, smooth 면은 연결된 원본 면의 Newell 법선 합을 사용한다.
실제 Three geometry에 비색인 position·UV와 같은 코너 순서의 normal attribute를 전달한다.
법선 길이·유한성·단위 길이를 GPU 자원 생성 전에 검증하고 정본 메시를 변경하지 않는다.
모든 면이 smooth인 원본도 이 코너 법선을 사용해 quad fan의 대각선 중복 때문에 화면과 GLB의
정점 법선 가중치가 달라지지 않도록 한다. 평가 캐시의 기존 smooth 법선 경로는 별도 후속 범위다.

이 절의 기준인 `7ccb2684`의 modifier 평가 캐시는 혼합 음영의 코너 법선 메타데이터를 저장하지 않아
그 조합을 경고와 함께 원본 편집 메시로 fallback했다. 후속 공통 표면 구현은 코너 법선·UV·재질 슬롯을
평가 캐시에 함께 전달한다. 적용한 수정자와 crease의 실제 지원 범위는
[공통 표면 계약](blender-native-shared-surface-contracts.md)을 따른다.

## migration — 실행한 검증

2026-10-29의 `7ccb2684` 후보 집중 회귀는 **14파일 168개**가 exit 0으로 통과했다. decoder·예산·atomic 등록·취소/계정 변경 UI·
파일 도구·실제 snapshot·Three normal attribute·GLB/작업파일 왕복을 함께 검증했다.
추가 authoring 회귀는 가져온 GLB의 Sculpt→UV 정리→작업파일→GLB 흐름에서 위치·코너 UV·winding을
비교하고, smooth·혼합 smooth OBJ가 실제 표시 geometry와 파일로 이어지는지 확인했다.
sparse accessor의 실제 compact 출력, 퇴화 primitive의 반복 instance 작업 예산, UV 좌표 변환에서의
새 접힘 거부와 기존 접힘 허용도 작은 fixture로 검증했다.

저장소의 실제 `Sendagaya_Shino.vrm`도 무조건 존재해야 하는 fixture로 읽었다.
SHA-256은 `ef8f05c5e0c718a07ad6f455b3f302cd4d76c4e526aec68ae362a3c3569d1832`,
파일은 15,074,328 byte다. 가져온 결과는 **67개 자산·22,967개 참조 정점·31,211개 삼각형**이며
모든 자산의 실제 snapshot·UV·world TRS와 한 번의 undo를 확인했다.
미사용 shared 정점을 반복 복사한 이전 계산의 709,490개 정점과 구분한다.

이 후속 브랜치의 전체 타입 검사·하네스·프로덕션 Web 빌드·실제 브라우저 파일 선택 검증은
공유 검사 순서가 돌아온 뒤 실행한다. 앞선 `9903b0094`의 통과 기록을 이 브랜치의 검증으로 대체하지 않는다.

## target — 남은 기능

후속 구현의 자체 툰 GLB는 metadata와 실제 재질 payload를 대조한 뒤 초기 재질까지 atomic 복원한다.
이 범위는 [툰 재질 계약](blender-native-toon-material-contracts.md), BG3D의 backend별 실제 표시·출력 연결은
[BG3D 소비 계약](blender-native-bg3d-toon-runtime-contracts.md)의 migration 상태를 따른다.

- 압축된 Draco/Meshopt 모델의 설치 없는 안전한 preparation과 실제 해제 fixture
- 재질·이미지·리깅/포즈·애니메이션의 정본과 실제 소비자 연결
- 공통 표면 계약에 receipt가 없는 나머지 수정자의 코너 속성 전달
- `.blend`의 브라우저 decoder 또는 변환 경계
- 두 톤 편집을 넘는 범용 shader graph, Grease Pencil 형태의 스트로크·레이어, 사용자 keyframe authoring

기존 기능 카탈로그나 보고서만으로 위 항목의 구현 완료를 판정하지 않는다.

소스는 [native-import](../../apps/web/src/domains/creator/hybrid-dcc/native-import),
[혼합 코너 법선](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-split-normal-render.ts),
[실제 roundtrip 테스트](../../apps/web/src/domains/creator/hybrid-dcc/native-import/studio-hybrid-dcc-native-import-roundtrip.test.ts)가 정본이다.
