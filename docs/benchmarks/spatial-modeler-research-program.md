# 공간 모델러 지속 조사·통합 원장

- 상태: `migration` — 2026-10-29 조사 범위를 여러 모델러·웹 기반 제작 도구로 확장했다. 전체 조사·구현 완료가 아니다.
- 제품 이름: **공간 모델러 / Spatial Modeler**. 외부 제품명은 출처·비교·파일 호환 설명에 사용한다.
- 사용자 요구: 유사한 사이트와 모델러를 계속 조사하고 REA로 동작을 확인하며 ToonStudio 기본 기능을 고도화한다.
- 기존 전체 요구: [기능 내재화 원장](../features/sketchup-feature-coverage.md)의 미완료 항목을 유지한다. 이 문서의 후보로 원래 요구를 축소하거나 대체하지 않는다.
- 실제 사용자 경로: [공간 모델러](../features/spatial-modeler.md).
- 브라우저·게임엔진·세션 협의: [3D 웹 품질·성능 기준](../features/3d-web-performance-policy.md). Chrome 우선 구현이며 Chrome과 macOS Safari Technology Preview에 같은 품질·성능 기준을 적용한다. 정식 Safari·iOS는 별도 판정하고 호환을 위해 품질을 축소하지 않는다.

## 증거와 완료 판정

대상 이름·기능 문구가 존재하는 것과 실제 구현을 구분한다. 각 기능은 아래 증거를 독립적으로 기록한다.

| 증거 | 기록할 내용 | 이 증거만으로 주장하지 않는 것 |
| --- | --- | --- |
| 공식 자료 | 공식 URL, 확인일, 기능 계약·제한 | 내부 알고리즘·실제 UI·파일 결과 관측 |
| 공개 소스 | repository, 정확한 revision·파일, 읽은 호출 경로 | 설치된 배포본과 같은 구현이라는 보장 |
| REA 정적 관측 | 대상 바이트 SHA-256·버전·provider·Evidence ID·분석 범위 | 해당 경로의 실제 실행 |
| REA 실행 관측 | 선언한 조작·입출력·실제 파일·소유 프로세스 정리·Evidence ID | 관측하지 않은 옵션·버전의 동일 동작 |
| ToonStudio 통합 | 사용자 진입점, canonical command, preview/확정/취소·Undo·저장·복원 | 독립 계산 함수나 샘플 패널만으로 전체 기능 완료 |
| 결과 비교 | 실제 사용자 장면, 형상·재질·UV·카메라·오류·GPU·파일 왕복 결과 | 테스트 수나 화면 존재만으로 손실 없는 동등성 |

REA native 분석은 `provider_id: "ghidra"`를 강제한다. 공개 소스가 충분한 내부 구조 분석에는 일반 소스 도구를
사용하며 REA 실행 증거를 만들어 붙이지 않는다. 기존 조사 기록을 재사용할 때 원본 SHA·버전·관측 범위를 확인한다.

## 조사 대상 지도

이 목록은 최초 작업 집합이며 발견한 유사 도구를 계속 추가한다. `조사 대기`는 기능을 제외한다는 뜻이 아니다.
과거 문서의 `구현 완료` 문구는 현재 source·tests·실제 사용자 경로와 재대조하기 전까지 새 완료 근거로 사용하지 않는다.

| 계열 | 대상 | 2026-10-29 확인 상태 | 다음 관측 질문 |
| --- | --- | --- | --- |
| 직접·파라메트릭 CAD | SketchUp | 기존 공식 계약·일부 Ghidra writer 관측·부분 구현 | 기존 SK01~SK33 전체 잔여 동작을 추적 |
| 직접·파라메트릭 CAD | [Shapr3D](https://support.shapr3d.com/hc/en-us/articles/14030415438748-Direct-vs-Parametric) | 공식 문서 확인 | 선택 면 직접 편집과 이력 카드 수정·억제·breakpoint의 실제 종속성 |
| 직접·파라메트릭 CAD | [Plasticity](https://www.plasticity.xyz/) | 공식 기능 소개 확인 | live 치수·필렛·면 수정·작도 평면·솔리드 실패의 실제 입력/결과 |
| 직접·파라메트릭 CAD | [Autodesk Fusion](https://help.autodesk.com/view/fusion360/ENU/?contextId=DESIGN_HISTORY) | 공식 문서 확인 | parameter 변경의 재계산·feature suppression·하위 의존성·직접 편집 경계 |
| 직접·파라메트릭 CAD | [Onshape](https://cad.onshape.com/help/Content/PartStudio/configurations.htm) | 공식 문서 확인 | 부품·조립체 변형의 독립 입력·재사용·동시 사용자 선택 상태 |
| 곡면·건축 도면 | [Rhino](https://docs.mcneel.com/rhino/8/help/en-us/commands/clippingplane.htm) | 공식 문서 확인 | 객체/레이어별 clipping, 단면 채움, 도면 갱신과 파일 출력 |
| 공개 CAD·규칙 모델링 | FreeCAD, OpenSCAD | FreeCAD 기능 페이지 조회 403; OpenSCAD 공식 매뉴얼 일부 확인 | parameter set·재계산·부품 참조·BIM·형식별 단위 계약의 공개 소스와 배포본 대조 |
| 입문 웹 모델러 | Tinkercad, [SelfCAD](https://www.selfcad.com/faq/3d-modeling) | 공식 안내 일부 확인 | 작업 평면·치수·정렬·경로 반복/돌출·면/모서리/정점 편집의 실제 동작 |
| 웹 장면·인터랙션 | Spline, Vectary | 공식 자료 확인; 아래 WEB01~WEB04·09 | 변수·상태·변형·표면 메모와 형식별 보존 범위 |
| 웹 장면·엔진 편집 | Three.js editor, Babylon Sandbox/Inspector, PlayCanvas | 공식 자료·공개 소스 구조 확인; 아래 WEB05~WEB06·08~09 | prefab override, 진단, UV1 lightmap, 실제 장면 출력 |
| 암시적 모델링 | Womp | 공식 제품 소개 확인; WEB07 | SDF/CSG 정의·blend·meshing·단위·품질·출력의 관측 |
| 범용 DCC·절차 모델링 | Blender, Houdini, Cinema 4D, Maya | 공식 모델링·릴리스 자료와 현재 source 대조 | modifier/절차 graph·인스턴스·NPR·pose·export의 재현 가능한 사례 |
| 레거시 DCC | [Modo](https://www.foundry.com/news-and-awards/foundry-winds-down-modo-development) | 공식 개발 종료를 확인; 유지 제품으로 분류하지 않음 | MeshOps·MeshFusion의 재평가·선택·Boolean을 레거시 설계 참고로만 비교 |
| sculpt·저해상도 모델링 | [Nomad Sculpt](https://nomadsculpt.com/), ZBrush, Blockbench; SculptGL | 앞 3종 공식 자료·현재 source 대조; SculptGL 조사 대기. Nomad 웹은 공식 지원 없음 | 대칭·remesh·레이어·PBR paint·UV·정밀 export의 실제 수명 |
| 공간·실내 설계 | [Sweet Home 3D](https://www.sweethome3d.com/features/), [Planner 5D](https://planner5d.com/), [Homestyler](https://www.homestyler.com/) | 공식 소개 확인 | 평면-3D 동시 편집·문창 개구부·가구 배치·장소 재사용의 실제 데이터 계약 |
| 공간·실내 설계 | Floorplanner, RoomSketcher | 조사 대기; Floorplanner `/features` 조회 실패 | 공식 유효 문서·실제 편집 경로부터 확인 |
| 웹툰 전용·에셋 작업 | SHAPER, Tooning, Clip Studio Paint의 3D, 소재 배경 제작 서비스 | 기존 조사 재검증 대상 | 포즈·컷·선화·레이어 출력·소재 권리·재사용을 실제 장면으로 대조 |

위 공식 자료 확인은 제품 소개 또는 문서가 설명하는 기능의 확인이다. 로그인 뒤 편집기, 상용 native 커널,
각 대상의 실제 출력 바이트는 이번 확장 조사에서 아직 관측하지 않았다. 지원 종료·제품 이전·버전 차이는
대상별 실제 공식 상태가 확인되기 전까지 단정하지 않는다.

## 웹 제작 도구에서 확인한 통합 후보

아래 WEB 번호는 요구 식별자이며 REA Evidence ID가 아니다. 현재 상태는 source 비교와 공식 문서 확인이다.

| ID | 외부 기능과 근거 | 현재 ToonStudio 상태 | 다음 통합 및 완료 증거 |
| --- | --- | --- | --- |
| WEB01 | [Spline 변수 binding](https://docs.spline.design/interaction-states-events-and-actions/variables-and-data/variables) | 노드 TRS·재질·건축 수치는 있으나 장면 변수 binding 정본은 미확인 | 창문 폭·간격·개수의 bounded parameter set → preview/확정/Undo/저장·복원; 순환·단위·잘못된 값 검사 |
| WEB02 | [Spline object state](https://docs.spline.design/interaction-states-events-and-actions/concepts/how-state-based-animation-works) | shot camera·가시성·조명, model pose/morph는 존재 | 문·창문·커튼 열림 상태를 기존 shot/history 권위와 통합; 컷 전환·Undo·재개방 확인 |
| WEB03 | [Vectary variants](https://help.vectary.com/documentation/3d-configurator/variants), [material swatch](https://help.vectary.com/documentation/3d-configurator/floating-ui/materials-ui) | 실제 재질 override·CC0 picker·shot visibility가 존재 | 정상/파손·계절·벽지 선택을 이름 있는 상호배타 그룹으로 묶고 한 명령의 가시성/재질 변경으로 검증 |
| WEB04 | [Vectary 표면 hotspot](https://help.vectary.com/documentation/3d-configurator/hotspots) | guide·source 정보와 예제 leader text가 존재 | node/submesh/triangle/barycentric anchor·occlusion·mesh revision을 저장하고 메모의 컷 포함 여부를 명시 |
| WEB05 | [PlayCanvas Template override](https://developer.playcanvas.com/user-manual/editor/templates/) | 실제 template·place-set version·영향 알림·appearance linked clone이 존재 | source version diff와 instance field override의 apply/revert를 기존 세트 권위·Undo에 연결; 일반 prefab 지원은 별도 판정 |
| WEB06 | [PlayCanvas lightmap](https://developer.playcanvas.com/user-manual/graphics/lighting/runtime-lightmaps/) | 조명·capture/pathtrace가 존재; node별 UV1/lightmap receipt는 미확인 | geometry/lighting 지문·UV1·원본 품질·stale·GPU 손실 뒤 복원을 갖춘 bake 결과 검증 |
| WEB07 | [Womp SDF/CSG 모델링](https://womp.com/) | half-edge/Boolean/modifier/sculpt source가 존재; 일반 3D implicit authority는 미확인 | parametric 정의와 derived mesh 분리, smooth blend·절삭·표면 오차·topology·최종 출력 검증 |
| WEB08 | [Babylon Inspector](https://doc.babylonjs.com/legacy/inspector/) | material/paint·normal·source·private texture capture가 존재 | 실제 선택 모델의 texture 크기·색공간·channel·UV·RGBA·normal·skeleton 읽기 전용 진단을 사용자 경로에 연결 |
| WEB09 | [Three editor 형식별 exporter](https://raw.githubusercontent.com/mrdoob/three.js/dev/editor/js/Menubar.File.js), [Spline GLB의 보존 범위](https://docs.spline.design/exporting-your-scene/files/exporting-as-gtlf-glb) | 실제 current-scene GLB 경계 구현·검증 중; 다른 CAD 예제는 고정 샘플 | 같은 source fence에 OBJ/MTL/PNG/권리 ZIP·STL 단위·DAE writer와 loss manifest를 연결; 실제 사용자 모델 왕복 비교 |

`componentRef`는 조직 표지, linked clone은 appearance 동기화라는 현재 source 계약을 따른다.
이를 일반 기하·계층 prefab 지원으로 바꾸어 설명하지 않는다. Push/Pull의 거리 필드 `signedDistance`도
Womp 형태의 3D SDF 엔진 근거가 아니다.

## DCC·조형 도구에서 확인한 통합 후보

아래 항목도 공식 자료·현재 source 비교 단계다. native/UI 동작 관측과 제품 통합은 각각 추가로 검증한다.

| ID | 근거와 목표 | 현재 출발점과 남은 경계 |
| --- | --- | --- |
| DCC01 | [Blender modifier](https://www.blender.org/features/modeling/), [Houdini 절차 모델링](https://www.sidefx.com/products/houdini/modeling/): 다시 열어 수정하는 비파괴 이력 | Hybrid DCC modifier DTO·inspector·Undo는 존재. BG3D 파생 모델을 저장·재열기한 뒤 stack 순서와 앞 단계 parameter를 바꾸는 연결은 별도 검증한다. |
| DCC02 | [Cinema 4D 모델링 중 UV 유지](https://www.maxon.net/en/cinema-4d/features/modeling), [Blockbench paint/UV](https://blockbench.net/): 간판·책·가구 표면의 편집 보존 | planar/box UV lite·GLB paint·affine export bake는 서로 다른 경로다. seam·face corner·topology 변경 후 paint와 새 면의 UV 정책을 실제 저장/출력으로 확인한다. |
| DCC03 | Houdini/Cinema 4D의 연결된 정의·인스턴스·반복 세트 | 현재 primitive 배열을 일반 component 정의 수정 전파로 확대하지 않는다. 중첩 정의·개별 TRS/material override·make unique·Undo·컷 visibility가 다음 계약이다. |
| DCC04 | Houdini/Cinema 4D의 곡선·단면 기반 모델링: 편집 가능한 난간·몰딩·파이프 sweep | 현재 실제 Follow Me는 열린 3D 다중선·볼록 단면 범위다. closed seam twist·급각·구멍 단면·자기 접촉과 곡선 원본의 재편집을 구분한다. |
| DCC05 | [Maya 모델링 기능](https://www.autodesk.com/products/maya/features), 레거시 Modo MeshFusion: bevel·Boolean·직접 편집의 연속 작업 | half-edge 면 도구·edge bevel·Boolean을 재사용하되 공면·작은 홈·재질/UV/hard edge·선택 remap·실패 원자성을 검증한다. |
| DCC06 | [Blockbench](https://blockbench.net/), [Nomad 레이어](https://nomadsculpt.com/manual/layers): 낮은 폴리곤 소품의 palette·2D/3D paint·레이어 | 실제 GLB paint와 단색 `plain-box-v1` authoring을 구분한다. 채널별 색공간·alpha0 RGB·roughness/metalness·레이어 순서·Undo·재열기를 연결한다. |
| DCC07 | [Nomad topology](https://nomadsculpt.com/manual/topology), [ZBrush](https://www.maxon.net/en/zbrush/new): 조형 레이어·multires·재토폴로지 | lite 조형 UI를 일반 multires 지원으로 계산하지 않는다. lower level 수정·topology 변경의 detail/mask/UV 재투영·표면 오차·실제 stylus stroke를 검증한다. |
| DCC08 | [Blender Line Art](https://docs.blender.org/manual/en/5.2/grease_pencil/modifiers/generate/line_art.html): 카메라별 선화와 작가 수정의 영속화 | raster/vector 추출과 임시 stroke ID를 stable source edge authority로 취급하지 않는다. 원근/평행·가림·투명·카메라 변경 후 artist correction을 저장·재투영한다. |

## REA 기존 증거의 재사용 상태

2026-10-29 live REA 서버에서 기존 writer SHA로 retained summary를 조회한 결과는 0건이었다.
이는 새 분석 성공이나 과거 분석 실패를 뜻하지 않는다. 기존 보존 파일의 SHA를 다시 읽어
`writer-evidence.json`은 `3984a839b103826eecc42c7c85576547d71cbd9b85d9a74d35875ab2c0a48c6f`,
close snapshot은 `002655254b31471aef4e78e2beef22cd6822c0be9030f720285bfe46dbff7d95`로 기록과 같음을 확인했다.
관측 범위는 [원본 REA 기록](../reports/sketchup-scene-export-rea-2026-10-29.md)을 따른다. 새 대상의
REA 관측은 공유 native/browser 실행 구간이 열린 뒤 진행하며 공식 웹 조사로 대체 완료 처리하지 않는다.

## 현재 작업과 실행 순서

1. **이름과 실제 진입점 일치:** 공간 모델러로 메뉴·패널·상태·파일 이름·가상 스튜디오·AI 보조 화면·현재 문서를 변경했다. 기존 SKP 보고서·외부 API·영속 ID는 용도를 구분한다. 변경 후 [14파일 113회귀·scoped 타입·정적 검사](../reports/spatial-modeler-quality-validation-2026-10-29.md)는 통과했으며 새 화면 검증은 대기 중이다.
2. **기존 표시 장면 출력 마감:** [현재 GLB 기능](../features/bg3d-current-scene-glb-export.md)과 [실제 검증 기록](../reports/bg3d-current-scene-glb-export-2026-10-29.md)을 기준으로 새 이름과 모바일 변경 뒤 입력 지문·타입·UI를 다시 확인한다. 선행 GPU20·UI30 결과를 변경 후 증거로 재표시하지 않는다.
3. **좁은 화면 조작 복구:** 실제 390px 화면에서 발견한 inspector 본문 압축을 보완하는 모바일 컷 패널 접힘·세로 스크롤을 적용했다. 작성 중 입력과 사용자 접힘 선택을 보존하고 실제 키보드·터치·오류·저장/취소 버튼 가시성을 확인해야 한다.
4. **형식·표면 정확성:** WEB09·WEB08을 먼저 연결한다. 형식별 정적 scene snapshot은 `/tmp` 초안이다. 별도 metalness/roughness packing은 [후속 제품 source·실제 검사](../reports/spatial-modeler-packing-ownership-2026-10-29.md)에 반영했다. builder·bridge 회귀는 통과했고 실제 graph 경로의 fixture 2실패도 수정 후 6개 회귀에서 통과했다. 후속 lint 보정·환경 증분과 실제 GPU·Worker 왕복은 별도이며 지원 완료로 계산하지 않는다.
5. **배경 재사용:** WEB03·WEB02를 shot/visibility/material/history와 통합하고, WEB05·WEB01을 장소 세트 권위와 연결한다. 단순 새 프리셋 목록을 해당 기능 전체 완료로 판정하지 않는다.
6. **기하·절차·조형 확장:** CAD의 직접/이력 편집·fillet·surface·단면 도면과 DCC·sculpt·SDF의 추가 요구를 원본 관측별로 확장한다. 새 소규모 구현이 전체 모델러 대체를 완료한 것으로 보고하지 않는다.

2026-10-29 현재 다른 세션의 Linux API 빌드와 native 검증이 단독 실행 구간을 사용하므로
새 Node·browser·native 분석·테스트는 시작하지 않고 읽기·편집·공식 웹 조사만 진행했다.
별도로 배정받은 좁은 구간에서 관련 113회귀·4096 MiB scoped 타입·변경 파일 정적 검사를 마쳤으며 소유 0으로 반환했다.
후속 좁은 구간은 scoped TSC exit 0 뒤 25파일 Vitest 359통과·2실패로 중단했다. 입력 지문과 실패 로그를 보존하고
테스트 fixture 한 곳만 수정했다. 이 구간의 새 정적 검사와 수정 후 회귀는 별도 GO를 기다린다.
이후 전체 하네스·빌드·번들·새 브라우저 검사는 별도 구간에서 수행한다. 운영 배포·외부 업로드·유료 서비스 설정은 이 조사 결과가 아니다.
