# 3D 스테이징·6패스 LT 영속 경로 조사

- 상태: **current — 기준 main 조사와 사용자 승인 후 로컬 구현**, 병합·배포 전
- 조사일: 2026-11-04
- 기준 main: `ac09b2353986eacd13e7e30f6f7d7469337d8dba`
- 관련 변경: [PR #2667](https://github.com/blue45f/toonstudio/pull/2667), 2026-11-03 22:08:09 KST 병합
- 승인: 2026-11-04 사용자가 실제 6패스와 저장 계약 확장 진행을 명시 승인했다. 운영 배포는 별도다.
- 이 작업: 구현 범위 안내 보완, 창틀·문 회전 수정, 실제 6패스 및 조건부 scene/project v4 구현.

## 1. 조사 기준 main의 적용 범위

다음 표는 위 기준 main SHA에 있던 스테이징 섹션의 소비자를 기준으로 한다. 다른 기존 도구에 비슷한 기능이 있다는
사실을 이 섹션의 적용 완료로 취급하지 않는다.

| 기능 | 실제 결과 | 저장 범위와 한계 |
| --- | --- | --- |
| 관통 개구부·창틀·몰딩·배열 | 고정 규격 입력으로 벽 조각 등의 `BgPrimitive[]` 생성 후 장면 삽입 | 기존 장면/history 경로 진입. 임의 메시의 선택 면을 편집하는 범용 SketchUp Push/Pull과 구분 |
| 2점 투시 | 수평 target·lens shift 계산 후 카메라 적용 콜백 | 기존 camera/history/scene 경로 진입 |
| 실내 단면·외부 그림자 보존 | 가시성·shadow caster 계획 및 요약 | 장면 가시성/renderer에 미적용, 이 설정의 저장 없음 |
| 시간대별 태양광·softness | 고도·방위·강도 등 수치 계산 및 요약 | 이 섹션에서는 실제 광원 변경·저장 없음 |
| 스타일·Outliner 태그 | 프리셋 해석 및 요약 | 이 섹션에서는 renderer/태그 가시성 변경·저장 없음 |
| 동적 구성요소 | 문·창·서랍·조명 모양 4개를 계산한 transform/color로 삽입 | 정적인 새 도형 삽입. 슬라이더가 기존 삽입 소품을 계속 구동하지 않음. 조명 ON은 cylinder 색상이며 실제 광원이 아님 |
| 연속 3컷 | 스냅샷 3개 계산 후 이름 나열 | 실제 shot 생성·저장·재생 없음 |
| 웹툰 6패스 LT | 이름·role·blend·opacity 레시피 6개 표시 | 픽셀 생성·문서 레이어 삽입·저장·재열기·undo/redo·원고 전달 미연결 |
| Mangaka 패널 | 예제 cast/panel로 strip·식자·QA·camera bridge 계획 계산 | 현재 원고·장면 입력/저장 콜백 없음. 실제 사진 변환·외부 Higgsfield 실행 아님 |

주요 소스:

- [스테이징 UI](../../apps/web/src/domains/creator/bg3d/StudioBg3dSketchUpWebtoonStagingSection.tsx)
- [계산·레시피 브리지](../../apps/web/src/domains/creator/bg3d/studio-bg3d-sketchup-webtoon-staging-bridge.ts)
- [기존 워크벤치 연결](../../apps/web/src/domains/creator/bg3d/StudioBg3dAdvancedWorkbenchHub.tsx)
- [Mangaka 패널](../../apps/web/src/domains/creator/manga-toolkit/StudioHiggsfieldMangakaPanel.tsx)

## 2. 기준 main의 실제 LT 경로와 6패스 레시피의 차이

기존 LT는 실제 제품 경로다. 새 레시피는 이 경로에 전달되지 않는다.

```text
StudioBackground3D의 handleInsert
 → 현재 장면·카메라를 canonical scene으로 변환
 → scene.output.line/tone 스냅샷
 → RGBA 및 필요한 depth/normal 캡처
 → LT Worker 렌더 → PNG 및 composite 인코딩
 → onInsert({layers, compositePngDataUrl, bg3dScene, ...})
 → planStudioBg3dLtLayers
 → OPFS/CAS 저장 + 기존 commit
 → pagesHistory/CRDT 문서 전이
```

- [삽입 호스트](../../apps/web/src/domains/creator/bg3d/studio-bg3d-editor-insert-host.ts)의
  `handleInsert`가 위 경로를 수행한다. 캡처·인코딩 실패 시 원고 삽입 완료로 처리하지 않는다.
- [실제 LT 렌더러](../../apps/web/src/domains/creator/bg3d/studio-bg3d-lt-render.ts)는
  `color` **또는** `tone` 한 장과 `texture-line`, `main-line`을 생성한다. 비어 있는 출력은
  생략하므로 항상 세 장이라는 보장도 없다.
- [삽입 계약](../../apps/web/src/domains/creator/scene-3d/studio-3d-insert-contract.ts)의 역할은
  `color | tone | texture-line | main-line` 네 종류다.
- [장면 출력 계약](../../apps/web/src/domains/creator/bg3d/studio-bg3d-scene-document-types.ts)의
  `output`은 `line`, `tone`을 보존한다. 레시피 전체를 저장하는 필드는 없다.
- depth Float32 캡처는 기존 선 검출에 쓰인다. 독립된 screen 합성 Depth Fog 문서 레이어는 없다.
- shadow artifact는 중립 계약에 선언돼 있지만 현재 Babylon executor는 해당 요청을
  `unsupported-artifact`로 거부한다. beauty의 그림자와 독립 shadow coverage는 다르다.
- [production multipass](../../apps/web/src/domains/creator/bg3d/studio-bg3d-production-multipass.ts)는
  shadow를 deferred 목록으로 분리한다. batch의 depth 출력도 새 6패스 문서 레이어와 별도다.

## 3. 기준 main의 저장·재열기·실행 취소·원고 전달

| 단계 | 기존 일반 LT | 새 6패스 레시피 |
| --- | --- | --- |
| 실제 레이어 생성 | `planStudioBg3dLtLayers`가 이미지·그룹을 계획 | 호출 없음 |
| 장면 보존 | bundle anchor에 `bg3dScene`, 각 이미지에 bundle ID·role·renderMode | 레시피를 scene에 넣지 않음 |
| 원고 재편집 | `resolveBg3dEditSource`가 linked authority 또는 anchor scene을 읽음 | 복원할 저장 데이터 없음 |
| 프로젝트 파일 왕복 | `studio-project-file`이 페이지·마스터 scene 정규화/검증 | 6패스 필드 없음 |
| 3D 창 undo/redo | document/primitive/model/camera snapshot 복원 | 칩 설정은 로컬 UI 상태 |
| 일반 페이지 원고 undo | 기존 `commit`에서 LT·Scene/Shot·Stage를 한 전이로 반영 | 이 commit에 도달하지 않음 |
| 실시간 협업 | 다중 raster receipt 미지원으로 composite + scene 한 장 저장 | 6층 전달 지원 아님 |
| 마스터 영역 | 그룹 미지원으로 composite + scene 한 장 저장 | 6층 전달 지원 아님 |
| 소재 라이브러리 | 썸네일 PNG + 직렬화 scene 저장 | 6층 문서 bundle 저장 아님 |

근거:

- [LT bundle planner](../../apps/web/src/domains/creator/bg3d/studio-bg3d-lt-layer-plan.ts)
- [원고 삽입 adapter](../../apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-bg3d-insert.ts)
- [원고 editor host](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx)의 `resolveBg3dEditSource`
- [프로젝트 파일](../../apps/web/src/domains/creator/studio-project-file.ts)
- [3D 편집·history 호스트](../../apps/web/src/domains/creator/bg3d/studio-bg3d-editor-scene-ops-host.ts)

일반 이미지로 shadow/depth를 우회 삽입하는 안은 채택하지 않는다. 같은 group에 bundle 밖
이미지가 섞이면 planner는 `mixed-bundle-group`로 거부하고, 다른 group에 두면 재캡처 시
갱신·삭제·정렬 대상에서 빠진다. 새 역할 없이 안전한 6패스 재편집을 구현한 것으로 볼 수 없다.

## 4. 이번 변경

- 근거 범위가 불분명한 `REA Verified`, `1-Click … 6패스 LT 레이어 스택` 표시를 제거한다.
- 실제 장면 편집 버튼과 계산·레시피 미리보기의 범위를 한글·영어로 안내한다.
- 연속 컷을 저장된 탭 대신 구성 미리보기로 표시하고, 동적 도형의 조명 색상 동작을 설명한다.
- Mangaka 전체 계획이 예제 데이터 기반임을 안내하고, 실제 사진 변환으로 오해할 수 있는 문구를 보완한다.
- 관련 직무 파이프라인·워크스페이스 추천의 6패스 추출 표현을 구성 검토로 보완한다.
- 실제 화면에서 Offset 창틀이 개구부 전체를 막는 단일 box인 결함을 확인했다. 새 창틀을
  테두리 네 조각으로 생성하는 수정과 실제 광선 관통 회귀를 추가한다. 변경 전 삽입 성공을
  관통 성공으로 보고하지 않는다. 이 수정은 신규 도형 생성에만 적용하며 이미 저장된 box를
  자동 변환하지 않는다.
- 동적 문 위치 계산은 라디안을 쓰지만 저장 rotation에는 각도를 넣던 단위 불일치를
  `rotation: [0, -rad, 0]`로 고친다. 0°/45°/90°/180°의 실제 변환 행렬에서 경첩 고정과
  자유 끝점 원호를 확인한다. 기존 문서에 저장된 도형을 자동으로 회전시키지 않는다.
- 기존 도형 삽입 콜백·카메라 적용·문서 저장·history 권위를 재사용하고 일반 LT 동작을 유지한다.

승인 후에는 아래 5절의 실제 6패스를 기존 LT 캡처·Worker·PNG·bundle·문서 commit 경로에
연결했다. 이전 섹션의 6패스 미연결 판정은 기준 main에 대한 것으로, 이 로컬 변경 이후와
혼동하지 않는다. 새 경로는 Three.js WebGL2와 일반 원고 페이지를 지원한다. 실시간 공동 편집,
마스터, 컷 배치 출력은 자동 일반 LT 변환 대신 명시적으로 거부한다.

캡처 지원은 불투명 표준 재질에 한정한다. 사용자 셰이더·알파 컷·반투명·변위·투과 재질,
WebGPU/Babylon, reverse/log depth를 지원 완료로 표시하지 않는다. 요청은 명시적으로 거부하며
다른 렌더러로 자동 재실행하지 않는다. 실제 shadow map 가림률을 쓰며 광원 에너지 가중
기여도와 완전히 같은 물리 합성이라고 주장하지 않는다. 현재 6패스 GPU/CPU 메모리 예산은
4,194,304픽셀까지이며 초과하면 출력 해상도를 몰래 낮추지 않고 오류를 반환한다.

## 5. 승인된 실제 6패스 구현과 저장 영향

사용자가 아래 저장 계약 확장을 승인한 뒤 로컬 코드에 구현했다. 운영 배포 승인은 포함하지 않는다.

1. 기존 artifact capture를 재사용해 실제 shadow coverage를 생성한다. beauty 이미지의 이름만
   shadow로 바꾸지 않는다. 기존 `color` 출력은 캡처한 beauty 색상을 사용하므로 독립 shadow를
   곱하기만 하면 음영이 중복될 수 있다. 밑색의 조명/그림자 포함 여부를 정의하고 실제 분리
   캡처와 합성 픽셀 회귀를 함께 구현한다. 지원하지 않는 renderer에서는 명시적으로 실패한다.
2. 기존 LT Worker에서 color와 halftone을 함께 생성하고, depth를 fog RGBA로 변환한다.
3. 기존 `bg3dLtRole`에 `shadow`, `depth`를 추가한다. planner·linked metadata·삽입 adapter의
   whitelist, 역할 순서, blend/opacity, ID 할당을 함께 확장한다.
4. 제안 필드 `scene.output.sixPassLt`에 레시피 버전, 역할별 blend/opacity/visible과 fog 설정을
   보존한다. 6패스를 사용한 장면만 scene v4로 쓰고 v3/v4를 함께 읽는다. 기존 v3 문서·고정 컷의
   sourceHash·템플릿 sceneJson을 일괄 변환하지 않는다. 6패스가 들어간 프로젝트에만 최소 reader
   version 4를 요구하도록 파일·snapshot/autosave·envelope의 버전 선택을 함께 확장한다.
5. 기존 `onInsert`·OPFS/CAS·문서 `commit`·history 경로를 재사용한다. 별도 저장소를 만들지 않는다.
6. bundle 재캡처·anchor 삭제/분리·복사·Magic Layer 선택과 PNG/PSD 전달을 회귀 검증한다.

**저장 호환성 영향:** 구버전 planner는 새 `shadow`/`depth` 역할의 bundle 재적용을 거부한다.
구버전의 느슨한 scene 정규화는 새 output 필드를 버리고 strict parse는 손실 정규화를 거부한다.
optional 필드 추가만으로 구버전 편집 호환을
보장할 수 없다. 구버전은 프로젝트 v4를 열지 못하도록 명시적으로 거부하고, 새 앱에서 기존
v2/v3 프로젝트·v1/v2/v3 장면의 동작을 보존하는 것이 제안이다. 독립 장면/소재에도 설정을
보존하려면 page 메타데이터에만 레시피를 두는 우회로는 부족하다. 일반 페이지 6층부터 검증하며,
실시간 협업·마스터의 6층 지원은 별도 receipt/
그룹 제약 해결이 필요하다. 기존 합성 저장 동작을 6층 지원으로 보고하지 않는다.

완료 기준은 실제 픽셀 여섯 장, 순서·blend·opacity 보존, 저장/재열기, 같은 bundle 갱신,
undo/redo 각 한 단계, 잠금·실패의 원자성, 프로젝트 파일 왕복, 원고 전달·export의 화면 증거다.

## 6. 외부 전문 도구 호환성과 동등성

- SKP import는 OpenSKP → GLB → 기존 import 경로가 있다. 실제 SDK가 만든 native camera
  golden fixture는 삼각형 한 면·카메라 세 개의 제한된 코퍼스다. `FOVIsHeight`/aspectRatio 등
  현재 parser의 결손도 테스트가 명시한다. 임의 건축 프로젝트·재질·동적 컴포넌트 호환 보증이 아니다.
- 기존 SKP export 회귀의 magic/크기 검사는 SketchUp native 앱 재열기 성공과 다르다.
- `.blend`는 로컬 ToonBridge/Blender adapter로 evaluated GLB·PNG를 생산하는 경로다.
  Blender modifier stack·Geometry Nodes·compositor를 ToonStudio에서 native 편집하는 기능이 아니다.
- 내부 primitive/camera/LT 테스트가 SketchUp·Blender 기능 동등성이나 Higgsfield 외부 서비스
  연동을 입증하지 않는다.

## 7. 검증 기록

독립 작업트리에서 결과를 기록한다. 초기 공유 의존성으로 수행한 테스트는 최종 근거에서 제외하고,
`pnpm install --offline --frozen-lockfile --ignore-scripts`로 이 작업트리 전용 의존성을 설치한 뒤
재검증한다. lockfile 변경과 신규 다운로드는 없다.

- `pnpm harness:doctor`, `pnpm harness:check`: 통과.
- 최종 관련 Vitest 37파일, 455개: 통과. staging/Mangaka/직무·추천, 창틀·문 회전 회귀,
  LT 픽셀 렌더·bundle planner,
  primitive 삽입·camera/history, 실시간 합성 전달, scene/project 파일 왕복과 native SKP golden 포함.
  SKP golden 4개는 앞서 명시한 제한된 자체 제작 코퍼스의 결과다.
  strict 설정·역할/합성·Worker·픽셀·파일/복구·미지원 표면 거부, 제품 authority `stat`,
  재캡처 후 사용자 숨김·불투명도·합성 모드 보존, 누락 역할 재생성 기본값도 포함한다.
- `pnpm validate:documentation`: 신규 보고서 포함 통과(검증 테스트 15개).
- 변경 소스 lint·Secretlint, 신규 보고서 Secretlint, `git diff --check`: 통과.
- `pnpm harness:verify`: 아키텍처·문서·source layout·앱 경계·파일 크기·Studio eager graph 및
  workspace 소유권 검사 통과. 전체 Web/API typecheck 종료 결과는 검증 완료 후 기록한다.
- 실제 Blender 5.2.0 LTS(`fbe6228777e7`)의 `tools/toonbridge/test/blender-adapters.integration.py`:
  종료 코드 0. 자체 `.blend` 저장·재열기, frame 7·96×80 PNG, 평가된 mesh GLB(48 triangles),
  선화 PNG(검은 픽셀 81·흰 픽셀 7,453), Shape Key, compositor 주 이미지·원본 hash 보존,
  카메라 누락·충돌 modifier·script 모드 거부를 확인했다. ToonBridge HTTP·웹 UI import 전체
  흐름을 검증한 것은 아니다. 로그 SHA-256:
  `ace7270ce05e5d4451bb1c05a2bc841df6806aed514f4eab0feee23bdd270033`.
- 실제 브라우저: 제품 `StudioBackground3D`를 여는 기존 harness에서 로드·정밀 편집,
  새 도형 삽입 0→18, undo 0, redo 18, 동적 소품 포함 22개를 관측했다. 기존 LT 캡처는
  3개 레이어·2451×1710 PNG를 생성했다. 재열기 후 ID·이름·transform 및 camera JSON
  전체 보존을 확인했고 pageerror는 0개다. 창틀 사이로 바닥 격자가 보이는 화면을 확인했다.
  문 회전 단위 수정 후 같은 전체 smoke를 다시 통과했다. 45° 문의 저장 rotation은
  `[0,-0.7853981633974492,0]`이며 재열기 후 동일하다. 이 harness의 부모 저장 콜백은
  localStorage에 scene을 보관하므로 제품 원고의 OPFS/pagesHistory 전체 검증과 구분한다.
- 실제 GPU 픽셀: 투사체 그림자 58픽셀 → `castShadow=false`에서 0픽셀, 두 밑색 배열은
  바이트 동일, 비수신 상자 표면 그림자 누출 0, 빈 장면 alpha 0, 원본 재질·렌더 상태 복원.
- 실제 6패스 모달: WebGL2를 UI에서 선택한 뒤 출력 설정 apply→undo→redo,
  22개 노드·2451×1710 PNG·6개 레이어·scene v4 저장. 새 모달에서 재열고 다시 캡처해도
  6개 레이어, recipe·camera·ID·이름·transform을 보존했다. 미지원 WebGPU의 비활성 안내도 확인했다.
- 실제 원고 결합 fixture: 합성한 16×16 PNG 여섯 장을 실제 삽입 adapter에 전달해 제품 OPFS
  CAS 133bytes 저장 → 6층/1그룹/commit 1회 → 실제 history hook에서 undo 0층/redo 6층 →
  실제 ZIP 14,011bytes/첨부 6개/프로젝트 v4 저장 → 빈 native OPFS 영역으로 import 후
  6층/1그룹과 role·opacity·blend 보존을 확인했다. 원고 fixture 픽셀은 GPU 증거와 별도다.
  전체 editor host·Konva 표시·CRDT·SQLite 재시작·클라우드 저장·권한 검증은 이 fixture 범위 밖이다.
- 별도 전체 원고 guest 검증: `/studio/canvas`의 실제 제품 파일 입력으로 위 ZIP을 가져와
  `StudioCuttoonEditorHost`·Konva Image 6개(decode 완료), 1그룹, 실제 절대 불투명도
  `[1,.85,.68,.32,.78,1]`과 상위 Group의 합성 모드
  `[normal,multiply,multiply,screen,normal,normal]`을 확인했다. ⌘Z에서 이미지 0개,
  ⌘⇧Z에서 6개를 복원했고, 처음 import한 Stage와 redo Stage PNG의 SHA-256이
  `a1df83bb6a209776c9077e06f6ec75dd3fc5a798c1775c6763c0811c09a52a32`로 같았다.
  입력은 합성 PNG ZIP이며 화면 미감·클라우드·SQLite 재시작 복구를 검증한 것은 아니다.
- 위 ZIP 실검증에서 제품 authority가 기존 CAS `stat`을 노출하지 않는 누락을 확인해
  기존 메서드를 전달하도록 수정했다. 새 저장소나 권한 우회 경로를 만들지 않았다.
- 미래 복구 가드: 현재 앱은 미지원 primary/sidecar/journal/OPFS checkpoint를 정상 읽기·쓰기·
  compaction에서 거부하고 원본을 보존한다. SQLite 긴급 쓰기는 기존 무대기 계약을 유지해
  이미 관측한 미래 값만 거부한다. 미관측 다른 탭의 동시 쓰기 및 이미 설치된 구앱의 코드를
  이 패치가 통제한다고 보장하지 않는다. DB schema·저장키 변경·데이터 이동은 실행하지 않았다.
- 이번 변경의 운영 배포, 커밋, PR 생성, 병합: 수행하지 않음.

기준 main의 범위는 “브라우저 3D 도형 배치·2점 투시 적용 및 기존 LT 원고 삽입 기반을 갖추고,
고급 스테이징·6패스 LT·Mangaka 제작 계획을 계산/미리보기로 제공”이다. 이번 로컬 구현의
6패스는 별도의 검증 결과와 지원 범위를 붙여 설명해야 하며, 병합·운영 반영 완료로 쓰지 않는다.
“SketchUp·Blender 전체 기능 통합”, “원클릭 6패스 원고 생성 완성”, “Higgsfield 사진 변환 연동
완료”는 이번 조사와 검증으로 뒷받침되지 않는다.
