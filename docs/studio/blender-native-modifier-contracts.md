# Blender 5.2 동작 분석과 웹 모델링 구현 계약

상태: **current** 관측과 기존 웹 동작, **target** 추가 계약, **legacy exception** 호환 동작을 구분한다.
관측일은 2026-10-29이며 웹 기준점은 `7177969d4`다. 이 문서는 원본 화면 송출이 아닌
ToonStudio 자체 메시 기능을 구현하기 위한 분석 기록이다.

## current — 설치 없는 웹 편집 경로

`/studio/3d/dcc/model`의 Hybrid DCC가 자체 브라우저 메시 편집기다. 브라우저에서 Three.js로
표시하고 기존 half-edge 원본, 명령 저널, 자동 저장 권위를 사용한다. 사용자 컴퓨터의 Blender
실행이나 원격 Blender 화면 세션을 요구하지 않는다. 아래 구현 범위의 동작을 검증한 것이며,
Blender 전체 UI나 전체 엔진을 웹으로 이식했다는 뜻은 아니다.

- **선택 요소 변형**: 정점·모서리·면을 선택해 로컬 X/Y/Z 이동·회전·크기를 입력한다.
  회전과 크기의 중심은 선택에 포함된 고유 정점의 평균이다. 입력하는 회전 단위는 도이고
  커널은 intrinsic XYZ 라디안을 사용한다.
- **미리보기와 적용**: 복사한 작업공간으로 미리보기하며 적용 전 원본과 undo 저널을 바꾸지 않는다.
  적용은 한 개 명령으로 기록한다. 취소·Escape·문서/선택 변경은 임시 미리보기를 버린다.
  면 모델링 미리보기와 요소 변형 미리보기는 동시에 편집 권위를 갖지 않는다.
- **비파괴 수정자**: 기존 9종 stack에서 아래 Array 상대 간격과 Solidify offset을 추가했다.
  원본 메시와 평가 결과를 구분하며 undo/redo·기존 저장 형식·GLB 전달 경계를 유지한다.
- **비평면 사각면 표시**: 유효한 두 fan 삼각형과 단순한 convex 투영을 가진 비평면 quad는
  원본 정점·면 ID를 유지하고 파생 삼각형으로 표시한다. GLB도 같은 대각선과 flat normal을 사용한다.
  자교차·퇴화·비평면 n-gon의 일반 삼각화 지원은 이 변경의 보증 범위가 아니다.
  표시 가능했던 면을 미지원 형태로 바꾸는 요소 변형은 적용 전에 오류를 표시하고 원본·저널을 보존한다.

구현 권위는 `hybrid-dcc/studio-hybrid-dcc-component-transform.ts`,
`useStudioHybridDccComponentTransform.ts`, `studio-hybrid-dcc-polygon-validation.ts`,
`studio-hybrid-dcc-render-face.ts`, `studio-hybrid-dcc-glb-export.ts`와 관련 테스트다.

## current — 작업파일과 메시 출력

작업대의 **작업파일 저장/열기**와 Quick/Expert의 `.toon3d` 도구는 실제 브라우저 다운로드와
파일 선택기로 연결한다. 새 파일은 `toonstudio.hybrid-dcc-workfile`, version 1의 portable JSON이며
MIME은 `application/vnd.toonstudio.toon3d+json`이다. 기존 `studio-toon3d-package.ts`의 로그용
패키지와 별도 계약이다. 이전 패키지나 `.blend` 파일을 이 새 형식으로 읽을 수 있다고 약속하지 않는다.

- 원본 메시, 오브젝트 변환, 수정자, 문서 상태와 검증된 undo/redo 이력을 저장한다.
- 크기·형식·UTF-8·byte length·SHA-256 및 기존 workspace persistence 검증을 모두 통과한 뒤
  현재 작업 교체 확인을 표시한다. 취소하거나 검증이 실패하면 현재 작업을 바꾸지 않는다.
- 파일 안의 문서 ID를 접근 권한으로 쓰지 않는다. 현재 문서 ID로 현재/undo/redo 스냅샷·BOM을
  다시 결합하고 해시를 재계산한다. 계정·프로젝트·작업공간이 읽기나 수정자 재평가 도중 바뀌면
  오래된 파일의 최종 적용을 폐기한다.
- 파일의 협업 참여자·잠금·원격 작업 상태는 가져오지 않는다. 파생 render/cloth/pass cache도
  재사용하지 않으며 원본에서 필요한 미리보기를 다시 생성한다. SHA-256은 저자 인증이 아니다.
- **OBJ 저장**은 선택한 원본 메시의 로컬 좌표를 실제 파일로 다운로드한다. 수정자 stack이
  남아 있으면 기존 거부 계약에 따라 먼저 적용하도록 안내한다. 전체 작업 보관은 `.toon3d`,
  평가 결과의 BG3D 전달은 기존 GLB 경계를 사용한다.

구현 권위는 `hybrid-dcc/studio-hybrid-dcc-workfile.ts`, `studio-hybrid-dcc-workfile-rebind.ts`,
`studio-hybrid-dcc-file-io.ts`, `useStudioHybridDccFileTools.ts`와 관련 테스트다.

## current — 분석 대상과 재현

- 실제 실행 파일: `/Applications/Blender.app/Contents/MacOS/Blender`, Darwin arm64.
- 버전: **5.2.0 LTS**, build `fbe6228777e7`.
- 바이너리 SHA-256: `60ba7a9b6743f7acf101274361fa76409e382ae07cd2007ce07dea30f6b129f2`.
- [재현 프로브](../../tools/blender-research/observe_mesh_modifiers.py)는 새 background 프로세스에서
  18개 작은 입력만 평가한다. `.blend` 파일을 읽거나 저장하지 않고 다른 Blender 프로세스에 연결하지 않는다.
- [작은 관측 fixture](../../tests/corpus/blender-modifiers/array-solidify-5.2.json)는 입력, 로컬 정점 그룹,
  범위, 개수, 핵심 face/triangle winding과 Evidence ID를 보존한다. 좌표 출력은 소수점 여섯 자리다.

저장소 루트에서 Blender 5.2가 설치된 환경으로 실행한다. `--output`에 지정한 JSON 파일만 쓴다.
성공 기준은 프로세스 exit 0, 버전/build 확인, JSON의 `cases` 18개다.

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec --python-exit-code 42 \
  --python tools/blender-research/observe_mesh_modifiers.py \
  -- --output /tmp/blender-mesh-modifiers-5.2.json
```

REA `open_binary`는 `provider_id: "ghidra"`로 호출했다. Ghidra 12.1.4/JDK 21의 준비 상태는
`REA_ANALYSIS_PROVIDER=ghidra rea doctor --json`에서 정상 확인했다. 전체 엔진의 auto-analysis와
네이티브 함수 디컴파일은 수행하지 않았다. 아래 Evidence는 실제 배포 바이너리의 심볼/동봉 바이트코드
관측이며, 정점 결과는 위 프로브의 별도 실행 관측이다.

| REA 관측 | Evidence ID | 확인 범위 |
| --- | --- | --- |
| Mach-O inventory | `ev_b7cf5597c066f808ba69e781c8a2eefdc98803794d277540a039972f02f7919e` | 바이너리 해시·아키텍처·export 목록 |
| Array offset getter/setter | `ev_17fee6f347ff211a8c98f9e077278ebfdb3052a0bf8c9a93eb4b9567a08d9fd2` | constant getter `0x1014c3098`, relative getter `0x1014c310c` |
| Solidify native entry | `ev_56ac249a61e9d67d5c8deed84bd2dc2e8d11e8c5356b5cf11abf61efdc6b76a6` | `MOD_solidify_extrude_modifyMesh`, `0x1011c0cb0` |
| 동봉 Extrude dispatcher | `ev_cca275eb88d88be065d7721ccacd43e6a2bd888301306dc9812c3ee969b86ca2` | Python 3.13 code object의 호출 이름·상수. C++ 위상 구현의 증거는 아니다. |

## current — Array의 좌표·순서 계약

Fixed Count, Object Offset 꺼짐, Merge 꺼짐 조건이다. Array에 들어온 **직전 수정자 출력 메시의 로컬**
축별 범위를 `b = max - min`, relative 벡터를 `r`, constant 벡터를 `c`라고 한다.

```text
step = (useConstantOffset ? c : 0) + (useRelativeOffset ? r ⊙ b : 0)
copy[i].vertex[j] = input.vertex[j] + i * step
```

두 설정은 동시에 켤 수 있고 성분별로 더해진다. bbox는 각 복제를 추가할 때 다시 키우는 값이 아니다.
현재 메시의 bbox를 한 번 사용한다. 공식 [MOD_array.cc](https://raw.githubusercontent.com/blender/blender/v5.2.0/source/blender/modifiers/intern/MOD_array.cc)의
`arrayModifier_doArray`는 constant 이동량을 누적한 뒤 `mesh->bounds_min_max()` 범위와 relative 값을 더한다.

기본 입력은 normal +Z인 `Q=[(0,0,0),(2,0,0),(2,1,0),(0,1,0)]`, face `[0,1,2,3]`다.
`r=(1,2,0)`, `c=(.5,-.25,3)`, count=3이면 다음과 같다. 네 경우 모두 12 vertices/12 edges/3 quad faces다.

| Relative / Constant | 한 단계 이동 | 정점 0 / 4 / 8 |
| --- | --- | --- |
| 켜짐 / 켜짐 | `(2.5,1.75,3)` | `(0,0,0)` / `(2.5,1.75,3)` / `(5,3.5,6)` |
| 켜짐 / 꺼짐 | `(2,2,0)` | `(0,0,0)` / `(2,2,0)` / `(4,4,0)` |
| 꺼짐 / 켜짐 | `(.5,-.25,3)` | `(0,0,0)` / `(.5,-.25,3)` / `(1,-.5,6)` |
| 꺼짐 / 꺼짐 | `(0,0,0)` | 세 그룹이 같은 좌표에 겹친다. Merge가 꺼져 있어 위상은 복제된다. |

- Object Scale `(3,4,5)`가 **미적용**이면 로컬 정점은 그대로다. 첫 복제의 world 정점은
  `(7.5,7,15)`다. 같은 scale을 mesh에 적용한 뒤에는 bbox `(6,4,0)`가 되어 로컬 step이
  `(6.5,7.75,3)`으로 바뀐다. 이동량을 world 단위로 재해석하면 이 계약이 깨진다.
- X가 `1..2`인 quad에 Mirror X를 먼저 적용하면 bbox X는 `-2..2`다. relative X=1,
  constant X=.5인 후속 Array는 `4.5`씩 이동하며 정점 0 `(1,0,0)`의 다음 복제는 `(5.5,0,0)`이다.
- Q에 Solidify thickness=2/offset=0을 먼저 적용하면 Z 범위는 `-1..1`이다. 후속 Array의
  relative Z=1/constant Z=.5는 `2.5`씩 이동한다. 순서를 뒤집으면 Array가 보는 Z 크기는 0이어서
  `.5`씩 이동한다. 최종 Z 집합은 각각 `[-1,1,1.5,3.5]`, `[-1,-.5,1,1.5]`다.
- 각 복제는 입력 면의 winding을 보존한다. 기존 웹의 `radial` 모드와 Blender Object Offset의
  동등성은 이번 관측에 포함하지 않았다.

## current — Solidify의 좌표·위상 계약

Simple/`EXTRUDE`, Even Thickness 꺼짐, Quality Normals 꺼짐, Clamp=0, Flip Normals 꺼짐 조건이다.
정점 로컬 위치 `p`, 로컬 단위 normal `n`, signed thickness `t`, offset `o`에 대해 두 층의 위치는 다음과 같다.

```text
layerA = p + n * t * (1 + o) / 2
layerB = p + n * t * (o - 1) / 2
```

공식 [MOD_solidify_extrude.cc](https://raw.githubusercontent.com/blender/blender/v5.2.0/source/blender/modifiers/intern/MOD_solidify_extrude.cc)의
`ofs_orig`/`ofs_new`와 실제 정점이 일치했다. `t > 0`이면 first group이 A, second group이 B다.
`t < 0`이면 그룹이 교환되어 first group이 B, second group이 A다. 면의 바깥 방향은 유지된다.
normal +Z인 Q에서 두께 `.2`의 first/second group Z는 아래와 같다.

| t | o | first 4 Z | second 4 Z |
| --- | --- | --- | --- |
| .2 | -1 | 0 | -.2 |
| .2 | 0 | .1 | -.1 |
| .2 | 1 | .2 | 0 |
| .2 | .25 | .125 | -.075 |
| -.2 | .25 | .075 | -.125 |

예를 들어 `t=.2,o=.25`의 first 4는 `(0,0,.125),(2,0,.125),(2,1,.125),(0,1,.125)`,
second 4는 같은 XY에서 Z가 `-.075`다. 음수 두께 사례는 각각 Z가 `.075`, `-.125`이며 아래 winding은 동일하다.

| 면 | quad winding | 관측된 loop triangles | normal |
| --- | --- | --- | --- |
| first surface | `[0,1,2,3]` | `[0,1,2]`, `[0,2,3]` | +Z |
| second surface | `[4,7,6,5]` | `[4,7,6]`, `[4,6,5]` | -Z |
| left rim | `[0,3,7,4]` | `[0,3,7]`, `[0,7,4]` | -X |
| bottom rim | `[1,0,4,5]` | `[1,0,4]`, `[1,4,5]` | -Y |
| right rim | `[2,1,5,6]` | `[2,1,5]`, `[2,5,6]` | +X |
| top rim | `[3,2,6,7]` | `[3,2,6]`, `[3,6,7]` | +Y |

Rim 켜짐은 8 vertices/12 edges/6 quad faces, 꺼짐은 8 vertices/8 edges/2 quad faces다.
Object Scale `(2,3,4)`를 적용하지 않은 `t=.2,o=0`은 로컬 Z `±.1`, world Z `±.4`다.
면 방향을 뒤집으면 normal이 -Z가 되어 변위 방향도 뒤집힌다. 두께 0에서도 Blender는 겹친 두 층과 rim을 만든다.

Blender의 기본값은 thickness=.01/offset=-1이다. [RNA 정의](https://raw.githubusercontent.com/blender/blender/v5.2.0/source/blender/makesrna/intern/rna_modifier.cc)의
offset UI 범위는 `[-1,1]`이며 내부 hard range는 float 범위다. 이번 위치 공식은 복잡한 모서리의
Even Thickness, vertex group, Clamp, Complex/Non-Manifold 모드까지 검증했다는 뜻은 아니다.

## current 구현 — 기존 웹 stack의 배치 옵션

권위는 [studio-mesh-modifier-stack.ts](../../apps/web/src/domains/creator/studio-mesh-modifier-stack.ts)와
hybrid-dcc workspace다. Array에는 optional `useConstantOffset`/`useRelativeOffset`/`relativeOffset`을 추가했고,
Solidify에는 optional `offset`을 추가했다. 명시한 Solidify offset 경로에서 위 층 좌표와 바깥 winding을 사용한다.
저장·재가져오기·해시·undo와 선행 stack bbox를 제품 테스트로 검증한다. 관측 fixture 18사례 중 비제로 두께의 좌표 배치와 바깥 winding을 대조하고, 두께 0의 웹 호환 예외는 아래와 같이 별도로 유지한다. Blender의 모든 수정자를 이식했다는 뜻은 아니다.
웹에서 새 Solidify를 만들 때는 기존 작업대와 같은 양의 두께 방향을 유지하도록 `offset=1`로 시작한다.
이는 Blender의 기본 `offset=-1`과 다르며, 사용자가 `-1/0/1`과 중간값을 직접 선택할 수 있다.

## legacy exception — 생략 필드의 기존 의미

- 기존 Array의 `offset`은 고정 이동량이다. 새 필드가 없으면 기존 계산·serialization·hash를 유지한다.
- 기존 Solidify는 원본 `p`를 보존하고 복제에 `p+n*t`를 사용한다. 좌표 범위만 보면 Blender offset=+1에
  해당하지만 기존 면 winding까지 같다는 뜻은 아니다. `offset` 누락 경로를 새 기본값 -1로 바꾸지 않는다.
- 기존 Solidify thickness=0은 source를 반환한다. Blender의 겹친 두 층 위상과 다르며 별도 호환 동작이다.
- 로컬 좌표계의 bbox·normal을 사용한다. Blender Z-up과 웹 표시축의 변환이 필요하면 경계에서 일관되게 적용하고,
  수정자 계산 중 object scale을 추가로 곱하지 않는다.

## target — 별도 구현과 검증이 필요한 범위

Blender의 범용 셰이더 노드 편집기, UV island 편집기, Grease Pencil 작화, 키프레임 저작,
Mantaflow/Cloth 등의 전체 시뮬레이션은 이 변경으로 구현되지 않는다. 기존 배경 패널의 설정값·
프리미티브 생성만으로 이 엔진들과 동등하다고 판정하지 않는다. 후속 기능은 실제 문서 변경,
화면 결과, 저장·복원·출력, 실패 경계를 갖춘 단위로 구현하고 각 Blender 입력 관측과 대조한다.
