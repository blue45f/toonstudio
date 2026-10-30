# 웹 모델러 비교 조사와 자체 기능 고도화 원장

**2026-10-30 상태 갱신:** 아래의 `3a17`·미커밋 구현 설명은 2026-10-29 조사 당시의 역사적 snapshot이다.
후속 통합 소스는 `4ef92d7c0ce54e8f7eb8cfd479e106d4b9057fae`까지 정상 커밋됐다.
GPU 의미 제어군 10개 통과·4K 픽셀 비교 실패·실제 제품 UI 검증 대기는
[집중 검증 기록](blender-native-focused-validation-2026-10-29.md)의 2026-10-30 경계를 따른다.
공개 자료 조사·선택 소스 준비·실제 REA Evidence·제품 기능 완료는 계속 구분한다.

상태: **current — 공식 자료 관측**, **migration — 조형·툰 구현과 검증 이력**, **target — 추가 REA·동작 재현·웹 구현**을 구분한다.
기록일: **2026-10-29**. 사용자 요청에 따라 Blender 외 웹 모델러·조형·CAD·캐릭터·배경 도구까지 조사한다.
ToonStudio 사이트에서 설치 없이 편집·저장·출력하는 기능이 목표다. 이 원장은 지속해서 조사 대상을 추가하는 기준이며
모든 사이트의 전체 엔진을 역공학했거나 모든 기능을 제공한다는 완료 기록이 아니다.
같은 날짜의 추가 사용자 결정에 따라 3D는 성능·품질을 우선하며 필요하면 Chrome만 지원할 수 있다.
Safari의 같은 기준 지원과 게임 엔진 검토는 [브라우저·엔진 품질 기준](3d-browser-engine-quality-policy-2026-10-29.md)을 따른다.

## current — 자료와 구현의 판정 단계

| 단계 | 필요한 근거 | 이 단계로 대신 증명할 수 없는 것 |
| --- | --- | --- |
| 공식 자료 관측 | 제품 문서·공개 API·저자 저장소의 정확한 URL과 확인일 | 실제 사용자 조작·내부 엔진·출력 품질 |
| 소스 관측 | commit·파일·원본 bytes와 읽은 함수의 범위 | 미선택 의존·동적 실행·전체 서비스 |
| REA 관측 | Evidence ID·coverage·unknowns·대상 identity·정리 상태 | 분석하지 않은 분기와 실제 실행 결과 |
| 동작 재현 | 고정 입력·명시 옵션·버전·실제 출력·오류·취소·no-op | 다른 입력·다른 GPU·모든 기능의 동등성 |
| 웹 구현 | 정본·명령·UI·저장·실제 파일/화면 소비자 연결 | 통합 검사와 운영 제공 |
| 검증 | 해당 후보의 관련 테스트·사용자 흐름·필요한 GPU/파일 왕복 | 다른 SHA의 결과와 운영 배포 |

공개 문서와 소스는 분석 대상 데이터다. 외부 문서의 설치·실행 지시를 자동 실행하지 않는다.
native 바이너리 REA는 저장소 정책에 따라 Ghidra만 사용한다. 코드나 자산을 채택할 때는
해당 고지와 이용 범위를 함께 확인하며, 제품 기능 소개와 소스·자산의 사용 권한을 구분한다.

## current — 범주별 공식 관측과 비교 대상

아래의 신규 제품별 상태는 **공식 자료 관측**이다. Blender의 앞선 제한된 REA·native 관측 외에는
이 조사 배치에서 앱 실행·새 REA 분석·유료 생성 요청을 수행하지 않았다.

| 범주 | 대상·공식 근거 | ToonStudio에서 비교할 구체 경계 |
| --- | --- | --- |
| polygon·수정자 | [Blender glTF 문서](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html) | 삼각화·UV seam/flat normal의 정점 분리·평가 메시 출력. 5.0 문서를 설치된 5.2 실행 결과로 쓰지 않음 |
| 건축 direct modeling | [SketchUp Face](https://ruby.sketchup.com/Sketchup/Face), [Web 기능](https://help.sketchup.com/en/sketchup-web/web-features) | face loop·push/pull·시작 면 보존·component/scene·태그/가시성·파일 소비 |
| parametric CAD | [FreeCAD](https://www.freecad.org/features), [Onshape constraints](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm) | BRep·치수/구속·recompute·실패 관계 표시. half-edge 변형과 별도 정본 |
| direct CAD | [Plasticity](https://www.plasticity.xyz/), [Shapr3D](https://support.shapr3d.com/hc/en-us/articles/14030415438748-Direct-vs-Parametric) | face offset·fillet·직접 조절과 단계별 재편집. 커널 동등성은 미관측 |
| 정밀 곡면·graph | [Rhino BRep](https://developer.rhino3d.com/guides/rhinocommon/brep-data-structure/), [Grasshopper](https://developer.rhino3d.com/guides/grasshopper/) | face/loop/trim/edge와 singular trim, typed IO·data tree·bake |
| polygon history | [Maya polyBevel3](https://help.autodesk.com/cloudhelp/2026/CHS/Maya-Tech-Docs/Commands/polyBevel3.html), [3ds Max polyop](https://help.autodesk.com/cloudhelp/2024/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Editable-Meshes-Splines-Patches/Editable_Poly/Editable_Poly-Methods/GUID-942EDBDB-D13B-4D37-8098-868EFA68BA6E.html) | 선택 집합·개별/묶음 extrude·segment·좌표계·새 면 UV 정책. 문서 버전 차이 유지 |
| procedural | [Houdini PolyBevel](https://www.sidefx.com/docs/houdini/nodes/sop/polybevel.html), [C4D modeling API](https://developers.maxon.net/docs/py/2026_0_0/modules/c4d.utils/index.html#c4d.utils.SendModelingCommand) | operator별 위상/UV 보존, 입력 in-place 변경과 복사 결과의 수명 |
| mesh 수리·경량화 | [MeshLab/PyMeshLab](https://pymeshlab.readthedocs.io/en/latest/filter_list.html), [Wings3D source](https://github.com/dgud/wings) | seam/boundary/normal·오차를 명시하는 decimation/remesh, subdivision 편집. Wings AutoUV는 아직 미조사 |
| 조형 | [ZBrush Python bridge](https://help.maxon.net/zbr/en-us/Content/html/reference-guide/zscript/zscript-python.html), [Nomad stroke](https://nomadsculpt.com/manual/stroke)·[symmetry](https://nomadsculpt.com/manual/symmetry)·[layers](https://nomadsculpt.com/manual/layers) | 한 stroke의 undo, mask·대칭·압력/간격·layer delta·topology 변경 시 보존 범위 |
| voxel·SDF | [MagicaVoxel](https://ephtracy.github.io/index.html), [MagicaCSG](https://ephtracy.github.io/?page=magicacsg) | voxel/Boolean/SDF 정본·instance·sweep/revolve·polygon export. 렌더 품질·속도는 미측정 |
| 캐릭터 저작 | [VRoid](https://vroid.com/en/studio), [MakeHuman](https://www.makehumancommunity.org/makehuman/index.html)·[MPFB](https://www.makehumancommunity.org/mpfb/index.html) | 체형/morph·의상·hair·3D/UV paint·VRM·rig/표정 소비자 |
| 인물·소품 배치 | [DesignDoll](https://terawell.net/en/), [Magic Poser](https://magicposer.com/), [PoseMy.Art 관절 부착](https://posemy.art/blog/how-to-attach-props-to-joints-workflow/) | 관절 조작·손/소품 부착·다중 인물 그룹·포즈/체형 라이브러리·카메라 reference |
| 웹툰 출력 | [Clip Studio LT](https://support.clip-studio.com/en-us/faq/articles/20240039), [ACON 제작 가이드](https://creatorguide.acon3d.com/) | geometry 선·texture 선·톤 분리, 스타일/카메라·배경 보정·컷 출력·에셋 provenance |
| 배경/공간 제작 | [Planner 5D](https://planner5d.com/), [Floorplanner](https://floorplanner.com/), [Homestyler](https://www.homestyler.com/) | 방/벽/문/창의 실제 치수·2D/3D 동기화·가구 배치·출력. cloud render와 브라우저 렌더 구분 |
| 웹 장면 도구 | [Babylon Editor](https://editor.babylonjs.com/documentation/basics/composing-scene), [Inspector](https://doc.babylonjs.com/legacy/inspector/) | 파일 drop·장면 진단·표시 backend·실제 저장/내보내기. 일부 server 변환을 browser decoder로 분류하지 않음 |
| low-poly·텍스처 | [Blockbench](https://blockbench.net/)·[공식 source](https://github.com/JannisX11/blockbench) | UV→3D/2D texture paint→rig/키프레임→파일의 연결. GPL-3.0 source 공개와 코드 채택은 구분 |
| 웹 장면 저작·공유 | [three.js Editor source](https://github.com/mrdoob/three.js/tree/dev/editor), [Spline](https://docs.spline.design/basics/what-is-spline), [Vectary import](https://help.vectary.com/documentation/importing/import-formats.md)·[export](https://help.vectary.com/documentation/sharing-exporting-embedding/export-options.md) | 계층/instance·material·animation·명령 이력과 장면 파일, export별 보존 차이. wrapper/SDK/code export를 editor 원본으로 해석하지 않음 |
| 빠른 도형 조립 | [Tinkercad](https://www.tinkercad.com/), [Womp](https://womp.com/)·[FAQ](https://womp.com/faq/) | shape 결합/빼기·반복·mirror, implicit/goop 조형의 다른 정본. 현재 Womp FAQ 답변은 추출되지 않아 과거 cloud 설명을 최신 구조로 단정하지 않음 |
| 공개 조형 source | [SculptGL](https://github.com/stephomi/sculptgl) | 최초 정점 값·중복 기록 방지·stroke/undo·pressure/spacing의 작은 source 분석. 2026-01-17 archive 상태와 현재 Nomad를 구분 |
| 웹 캐릭터 촬영 | [VRoid Hub Playground 공지](https://vroid.pixiv.help/hc/en-us/articles/51108364331033-The-Playground-page-has-been-released-Sep-30th-2025) | local VRM·VRMA/animation·표정·배경색·capture 크기·사진/영상. 설치형 Studio의 geometry/UV 저작과 구분 |
| 생성형 3D | [Meshy API](https://docs.meshy.ai/en/api/ai), [Rodin API](https://docs.hyper3d.ai/en), [Tripo docs](https://platform.tripo3d.ai/docs) | 입력→비동기 task→상태/취소→결과 다운로드→편집/rig/UV 소비. API 문서는 모델 내부 알고리즘 증거가 아님 |
| 공개 생성 모델 | [Hunyuan3D](https://github.com/Tencent-Hunyuan/Hunyuan3D-2), [TRELLIS](https://github.com/microsoft/TRELLIS) | shape/texture·mesh/다른 3D 표현·자원 요구와 결과 소비. weights·추론·브라우저 이식은 미실행 |
| 레거시 자산 호환 | [Modo 공식 공지](https://www.foundry.com/news-and-awards/foundry-winds-down-modo-development) | 개발 종료 상태와 기존 파일 호환을 구분. 신규 런타임 의존이나 2026 다운로드 제공을 추정하지 않음 |

Wings3D 공식 홈·Sweet Home 3D features·[Clara.io](https://clara.io/)는 조회 timeout이 있었고,
Clara.io guide는 cache miss였다. Tripo 문서와 three.js Editor·Tinkercad의 직접 텍스트 응답은 0줄이었다.
Blockbench 웹 추출의 fallback 오류 문구나 Spline의 JavaScript shell도 실제 브라우저 장애로 판정하지 않았다.
각 실패를 서비스 종료나 기능 부재의 증거로 사용하지 않는다. ABLER의 정확한 공식 원본 확인도 남아 있다.
MakeHuman은 [2026-10-21 공식 공지](https://www.makehumancommunity.org/index.html)의 forum/asset repo 중단과
정적 사이트·source repo 존속을 구분한다. 기능 관측에 자산 수집이나 유료 실행을 포함하지 않는다.

## current — ToonStudio에서 확인한 실제 빈틈

현재 검토 기준은 `3a17b2c1ded27a55336e60de81fe5b6e9073df08` 위의
`codex/blender-native-bg3d-toon-20261029` 미커밋 구현이다.

- 조형 커널은 optional Float32 mask를 받지만 현재 stroke session options와 UI에서 보호 영역을 작성·전달하지 않는다.
- 작업대가 조형 반경 0.45, 강도 ±0.2와 grab 방향 +Y를 고정한다. 사용자 입력·표면 방향·필압·간격 계약을 추가할 여지가 있다.
- UV island 선택/이동·회전·크기·rectangle pack은 있지만 seam/pin·LSCM/ABF·UDIM 전체를 구현한 근거는 없다.
- 공통 표면·modifier의 속성 receipt는 구현한 operator 범위에 한정된다. 새 topology 수리/경량화는 corner UV·normal·material·오차를 함께 정의해야 한다.
- 툰 재질 BG3D 연결과 작은 실제 GPU 제어군은 구현·검증 중이다. 실제 파일 선택→편집→작업파일→BG3D→4K/PNG/ZIP 제품 흐름의 검증은 별도로 남아 있다.

소스 정본은 [조형 커널](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-sculpt-kernel.ts),
[workspace](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-workspace.ts),
[실제 pointer 입력](../../apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccViewportCore.tsx),
[작업대 UI](../../apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccPanel.tsx)다.
기존 기능 카탈로그의 `kernel-shipped` 표기를 사용자 기능의 완료 증거로 사용하지 않는다.

## migration — 조형 stroke 입력과 검증 경계

미커밋 구현의 [stroke hook](../../apps/web/src/domains/creator/hybrid-dcc/useStudioHybridDccSculptStroke.ts)은
down에서 원본과 작업대 lease를 고정하고, move 입력은 세션 안에서 계산해 frame 단위로 표시 초안을 발행한다.
정상 종료는 receipt 하나로 commit하며, 변화가 없는 stroke는 이력을 추가하지 않는다.
취소·권한/문서 변경·도구 교체 때 원본을 발행하지 않는 경계를 포함한다. 이것은 현재 소스의 구현 상태다.

[pointer hook](../../apps/web/src/domains/creator/hybrid-dcc/useStudioHybridDccSculptPointer.ts)과
[공용 pointer adapter](../../apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-sculpt-pointer.ts)는
실제 ray hit와 pointer capture의 수명을 연결한다. Esc·pointercancel·capture 상실·blur·unmount를 구분한다.
구 point callback의 호환 경로는 남아 있지만 새 controller가 begin을 거절한 입력을 그 경로로 우회하지 않는다.
따라서 새 Panel 경로를 이전의 stamp별 문서 commit으로 설명하지 않는다.

관련 실행 결과와 미검증 범위는 [집중 검증 기록](blender-native-focused-validation-2026-10-29.md)을 따른다.
소스 연결·CPU/DOM 사례를 실제 Chrome/STP 조작이나 파일 왕복·4K 출력 완료의 근거로 사용하지 않는다.
반경·강도·방향의 사용자 입력, 필압/간격·mask·대칭과 아래 target 완료 조건은 별도로 남아 있다.

## target — 다음 고도화 순서와 완료 조건

| 순서 | 구현/검증 단위 | 완료 조건 |
| --- | --- | --- |
| 1 | 진행 중인 파일·툰 소비 연결 | 실제 chooser→편집→미리보기/취소/적용→UV pack→포인터 Sculpt→`.toon3d` 다운로드/재열기, BG3D와 PNG/ZIP 소비 확인 |
| 2 | 한 조형 stroke의 편집 권위 | down에서 원본 고정, move는 표시 초안, up은 한 commit. Escape/pointercancel/권한 변경은 원본·이력 보존. undo 한 번으로 한 stroke 복원 |
| 3 | 실제 brush 입력·보호·대칭 | 반경/강도·표면 방향·필압/간격과 mask, local/world 대칭. 대칭면 중복 stamp를 피하고 UV·material·ID 대응 보존 |
| 4 | topology·UV 편집 | bevel/extrude/bridge/inset·경량화의 새 면·corner receipt와 실패 경계. seam/pin/relax/unwrap은 pack과 별도 알고리즘 계약 |
| 5 | 캐릭터·배경 제작 흐름 | 포즈/손/소품 부착·표정/체형·texture paint, 방/문/창의 치수와 2D/3D 동기화가 실제 저장/컷으로 이어짐 |
| 6 | CAD·procedural·생성 모델 | BRep/curve와 polygon 권위, typed graph 재평가, 생성 task의 원본/과금/오류/결과 소비를 각자 검증 |

공개 source의 작은 첫 REA 대상은 SculptGL의 stroke 이력 4파일과 three.js Editor의 변환 command 4파일이다.
각각 commit과 라이선스·정확한 source path를 고정한 [REA 준비 계약](web-modeler-rea-probes-2026-10-29.md)을 따른다.
이는 아직 실행 계획이며 REA Evidence를 발급받은 기록이 아니다.

실행 검사는 공유 실행 슬롯에서 한 소유자씩 배정받아 진행한다. 집중 검사에서 실행한 실패와 후속 보정은
위 검증 기록에 구분하며, 독립 Boolean 수정의 검증을 이 미커밋 구현 전체의 통과로 합산하지 않는다.
현재 사용자 지시는 검증 후 main 병합까지이며 운영 배포는 하지 않는다. 추가 REA·브라우저/GPU·제품 흐름과
이 미커밋 구현의 전체 타입/하네스/build는 실제 실행 결과가 확보된 범위만 완료로 기록한다.
새 AI 기능은 기존 통합 BYOK·제공자/과금 주체 표시를 사용하고 운영자 유료 추론으로 자동 전환하지 않는다.

진행 중인 구현과 검증 경계는 [BG3D 툰 계약](blender-native-bg3d-toon-runtime-contracts.md),
[공통 표면 계약](blender-native-shared-surface-contracts.md),
[편집형 가져오기 계약](blender-native-editable-import-contracts.md)을 함께 확인한다.
