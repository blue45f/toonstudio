# 3D 스테이징·6패스 LT 영속 경로 조사

- 상태: **historical — 최초 PR 기준 조사와 선행 구현 증거, 후속 저장 계약은 migration**
- 조사일: 2026-11-04
- 최신 후속: [2026-11-05 실제 묶음 구현·검증 보고](bg3d-six-pass-bundle-implementation-2026-11-05.md).
  아래 표의 칩/미연결 판정은 명시한 최초 기준 SHA에 대한 사실이다.
- 기준 main: `ac09b2353986eacd13e7e30f6f7d7469337d8dba`
- 관련 변경: [PR #2667](https://github.com/blue45f/toonstudio/pull/2667), 2026-11-03 22:08:09 KST 병합
- 승인: 2026-11-04 사용자가 실제 6패스와 저장 계약 확장 진행을 명시 승인했다. 운영 배포는 별도다.
- 이 작업: 구현 범위 안내 보완, 창틀·문 회전 수정, 실제 6패스 및 조건부 scene/project v4 구현.
- 후속 검증 기준: `650beb41c1269dfd978757e288134f7037956a1c`. 앞선 구현은 다른 세션에서
  이 커밋으로 main에 반영됐다. 아래 7절은 원래 독립 작업트리에서 기록한 검증이며,
  동일 제품 모달에서 원고로 바로 전달하는 경로의 추가 발견은 8절에서 구분한다.

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
연결했다. 이전 섹션의 6패스 미연결 판정은 기준 main에 대한 것으로, 구현 반영 이후와
혼동하지 않는다. Three.js WebGL2의 실제 분리 픽셀 생성과 비실시간 adapter 분기는 연결했다.
그러나 실제 제품의 새 원고도 CRDT를 사용하므로 이 분기를 일반 원고의 지원 완료로
표현할 수 없다. 아래 9절에서 확인한 제품 적용 실패와 구체적인 추가 계약을 구분한다.
실시간 표면·마스터·컷 배치 출력은 자동 일반 LT 변환 대신 명시적으로 거부한다.

캡처 지원은 불투명 표준 재질에 한정한다. 사용자 셰이더·알파 컷·반투명·변위·투과 재질,
WebGPU/Babylon, reverse/log depth를 지원 완료로 표시하지 않는다. 요청은 명시적으로 거부하며
다른 렌더러로 자동 재실행하지 않는다. 실제 shadow map 가림률을 쓰며 광원 에너지 가중
기여도와 완전히 같은 물리 합성이라고 주장하지 않는다. `650beb41c`의 6패스 GPU/CPU
메모리 예산은 4,194,304픽셀이며, 기존 삽입 품질 계획과의 불일치 및 후속 수정은 8절에 기록한다.

## 5. 승인된 실제 6패스 구현과 저장 영향

사용자가 아래 저장 계약 확장을 승인한 뒤 구현했다. 운영 배포 승인은 포함하지 않는다.

1. 실제 캡처 adapter에서 조명·그림자가 없는 MeshBasic 밑색과 ShadowMaterial의 shadow
   coverage를 별도로 생성한다. beauty를 shadow로 재명명하거나 beauty에 같은 음영을 중복
   적용하지 않는다. 지원하지 않는 renderer·재질에서는 명시적으로 실패한다.
2. 기존 LT Worker에서 color와 halftone을 함께 생성하고, depth를 fog RGBA로 변환한다.
3. 기존 `bg3dLtRole`에 `shadow`, `depth`를 추가한다. planner·linked metadata·삽입 adapter의
   whitelist, 역할 순서, blend/opacity, ID 할당을 함께 확장한다.
4. `scene.output.sixPassLt`에 레시피 버전, shadow/fog 불투명도와 fog 거리·색상 설정을
   보존한다. 역할별 blend/opacity/visible은 생성한 원고 레이어의 기존 속성으로 저장한다.
   6패스를 사용한 장면만 scene v4로 쓰고 v3/v4를 함께 읽는다. 기존 v3 문서·고정 컷의
   sourceHash·템플릿 sceneJson을 일괄 변환하지 않는다. 6패스가 들어간 프로젝트에만 최소 reader
   version 4를 요구하도록 파일·snapshot/autosave·envelope의 버전 선택을 함께 확장한다.
5. 기존 `onInsert`·OPFS/CAS·문서 `commit`·history 경로를 재사용한다. 별도 저장소를 만들지 않는다.
6. bundle 재캡처·anchor 삭제/분리·복사·Magic Layer 선택의 기존 역할 처리를 확장한다.
   기존 4역할 전용 PNG/PSD·배치 출력은 6패스를 명시적으로 거부하며 지원 완료로 표시하지 않는다.

**저장 호환성 영향:** 구버전 planner는 새 `shadow`/`depth` 역할의 bundle 재적용을 거부한다.
구버전의 느슨한 scene 정규화는 새 output 필드를 버리고 strict parse는 손실 정규화를 거부한다.
optional 필드 추가만으로 구버전 편집 호환을
보장할 수 없다. 구버전은 프로젝트 v4를 열지 못하도록 명시적으로 거부하고, 새 앱에서 기존
v2/v3 프로젝트·v1/v2/v3 장면을 읽는 경로를 유지했다. 기존 envelope의 parse→serialize 왕복은
reader 버전을 보존한다. 실제 편집 snapshot은 남은 데이터의 최소 reader 버전을 계산하므로,
6패스 역할과 scene v4를 모두 제거한 문서는 다시 v2/v3로 저장될 수 있다. 독립 장면/소재에도 설정을
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
  workspace 소유권 검사 통과. 초기 작업트리의 전체 typecheck는 여기서 완료 근거로 삼지
  않으며, 후속 작업트리의 최종 Web/API 통과는 8절에 별도로 기록한다.
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
- 위 독립 검증 시점에는 운영 배포·커밋·PR 생성·병합을 수행하지 않았다.
  후속 재개 때 앞선 구현의 main 커밋 `650beb41c`를 확인했다. 이 작업에서 운영 배포를 실행하지 않았다.

기준 main의 범위는 “브라우저 3D 도형 배치·2점 투시 적용 및 기존 LT 원고 삽입 기반을 갖추고,
고급 스테이징·6패스 LT·Mangaka 제작 계획을 계산/미리보기로 제공”이다. 이후 구현한
6패스는 별도의 검증 결과와 지원 범위를 붙여 설명해야 한다. `650beb41c`의 main 반영과
제품 모달의 연속 흐름 검증·운영 배포는 각각 구분한다.
“SketchUp·Blender 전체 기능 통합”, “원클릭 6패스 원고 생성 완성”, “Higgsfield 사진 변환 연동
완료”는 이번 조사와 검증으로 뒷받침되지 않는다.

## 8. 동일 제품 모달에서 원고로 전달하는 후속 검증

- 상태: **historical — 추가 저장 계약 승인 전의 GPU 예산 수정과 제품 원고 미지원 발견**.
- 승인 후 실제 원고 전달·재열기 성공은 상단의 2026-11-05 후속 보고를 따른다.
- 앞선 별도 모달 캡처와 합성 PNG ZIP 가져오기 통과를 동일 host의 연속 성공으로 합치지 않는다.
- 실제 `/studio/canvas` guest 원고에서 모달을 열고 22개 노드·6패스를 적용해 배경 추가를
  실행했을 때, 모달이 닫히지 않았고 원고 레이어는 0개였다. 자동 재시도는 하지 않았다.
- CDP 예외 진단에서 `RangeError: 3D capture exceeds the raster pixel budget.`를 확인했다.
  실제 요청은 `3155×2160 = 6,814,800`픽셀이었다. 삽입 품질 계획은 기존 LT 최대
  `8,388,608`픽셀을 사용하지만, 새 6패스의 동시 캡처 제한은 `4,194,304`픽셀이어서
  GPU 작업 제출 전에 거부됐다. 이는 6패스 레시피·원고 저장 단계의 성공으로 덮을 수 없는
  실제 연결 결함이다.
- 후속 수정은 6패스의 캡처만 순차 제출하여 동시 버퍼를 줄이고 기존 출력 해상도를 유지한다.
  일반 LT 캡처와 기존 도형 삽입·카메라 적용 경로는 재구현하지 않는다. 각 패스 제출 직후
  라이브 상태를 복원하고 fence 완료 후 자원을 폐기하며, 패스 사이 장면 변경은 혼합 출력
  저장 전에 거부한다. 새 저장 형식·DB schema·저장키 변경은 추가하지 않는다.
- 수정된 6패스 한도는 기존 LT와 같은 `8,388,608`픽셀이다. 색 패스 하나의
  HDR·depth·display·PBO·packed·정규화 버퍼는 약 28 B/px이고, 앞선 패스의 보관 배열은
  최대 16 B/px다. 반환 경계의 원본·소유 복사본은 최대 48 B/px다. 64 B/px·512 MiB는
  이 캡처 working buffer의 보수적 계산이며 장면·텍스처·브라우저 전체 메모리의 실측 또는
  상한 보증이 아니다. 일반 LT의 동시 제출 경로와 한도는 바꾸지 않았다.
- 카메라의 투영·world matrix를 entry에서 복사하고, 각 제출 전후 가시 계층·transform·
  geometry/morph/instance 업로드 버전·재질/텍스처·단면·광원·fog·renderer 출력 상태를
  검사한다. 애니메이션이나 턴테이블이 계속 변경되는 장면은 혼합된 여섯 장을 저장하지 않고
  중단한다. 각 패스의 helper·재질·renderer 임시 상태는 GPU 대기 전에 복원한다.
- 최종 관련 Vitest 40파일, 494개: 통과. 6패스·저장 계약, 기존 도형·카메라·history,
  실제 요청 `3155×2160` 및 최대 해상도 허용, 순차 fence·target 정리, 마지막 shadow 실패,
  장면 변경 거부와 renderer 파생 행렬의 무해한 갱신, 제한된 native SKP golden을 포함한다.
  수정 파일 ESLint·guard 단독 strict TypeScript 검사도 통과했다. 전체 하네스는 별도 확인 중이다.
- 순차 adapter의 독립 실제 GPU 픽셀 검증: shadow 58→0, albedo 바이트 동일,
  전경 그림자 누출 0, 빈 장면 alpha 0, 원본 재질·renderer 상태 복원, pageerror 0을 확인했다.
  같은 adapter의 `3155×2160` 직접 캡처는 `includeNormals: true`로 성공했다. 다섯 GPU
  readback이 모두 같은 해상도였고 관측된 동시 readback 최대치는 1개다. 여섯 원본 배열의
  합계는 163,555,200bytes(24 B/px)였다. 단순 시험 장면의 캡처 시간은 약 574ms이며,
  임의 복잡한 장면의 성능 보장이나 제품 원고 전달 성공을 대신하는 수치는 아니다.
- 실제 제품 `/studio/canvas`의 `전체 기능 → 삽입 → 장면 도우미`로 모달을 열고
  WebGL2·22개 노드·2점 투시·6패스를 적용했다. GPU 요청은 한 번만 실행했다.
  캡처·guard·Worker 예외는 없었지만 부모 원고가 실시간 표면이라는 이유로 거부했다.
  원고는 0층이며, 이 실행에서 ZIP·재열기·undo/redo가 성공했다고 보고할 수 없다.
  Chrome for Testing 156.0.8078.4, viewport 1600×1200, 외부 요청·pageerror는 0개였다.
- 기존 전체 하네스의 아키텍처·문서·source layout·앱 경계·파일 크기·eager graph·lint·
  Secretlint는 통과했다. Web TSC는 후속 UI 변경 전 소스로 실행 중이었고 약 28분 시점
  physical footprint 15.3 GiB를 관측했다. 해당 작업트리의 오래된 검사만 종료했으며(143),
  Web/API 전체 typecheck 통과로 기록하지 않는다. 다른 세션의 검사는 종료하지 않았다.
- 이후 최종 소스로 실행한 `pnpm harness:verify`는 **종료 코드 0**으로 통과했다. Web 전체
  typecheck와 API·work-session browser tools·Postgres tools typecheck를 포함한다.
  마지막 CSS 너비 조정 뒤 lint·Secretlint·`pnpm validate:architecture`를 추가로 통과했다.
  파일 크기·BG3D eager graph 기준선을 늘리지 않았고 `git diff --check`도 통과했다.
- 후속 변경은 `codex/bg3d-six-pass-handoff-20261104`의 로컬 작업 상태다. 기준 SHA는
  `650beb41c1269dfd978757e288134f7037956a1c`이며 새 커밋·push·PR·병합·운영 배포는 하지 않았다.

## 9. 실제 원고 표면과 추가 승인 범위

- 상태: **historical — 추가 계약 승인 전의 원고 실패와 승인 요청 근거**.

**일반 페이지와 비실시간 세션은 동의어가 아니다.** 새 guest 초안·로그인 초안·리믹스는
`!workId → liveJam → requiresStudioLiveServer`로 실시간 표면이 된다. 로그인한 저장 작품도
서버 협업 정본을 사용한다. 실제 guest에서 master/page/collaboration lock은 false였고
`studioCrdtOperationSyncReady=true`였다. 권한을 우회하면 해결되는 문제가 아니다.

추가 승인 전 image CRDT는 로컬 이미지의 topology를 전달했다. 여섯 PNG·LT 역할·blend·bundle·scene
본문을 원격 복원하는 계약이 없고, work asset 입장도 기본 비활성이며 개별 비동기 업로드다.
main-line만 OPFS/CAS 영수증으로 저장된다. 따라서 거부 가드를 없애거나 guest 예외를 넣으면
본 탭과 다른 탭의 결과가 달라질 수 있다.

- 당시 허가한 범위: 잘못된 지원 표시를 고쳐 GPU 작업 전에 미지원 이유를 알린다. 기존
  일반 LT·도형 삽입·카메라 적용과 최종 문서 권한 검사는 유지한다.
- 가져온 v4 장면의 일반 LT 전환도 수정했다. 보존된 컷에 6패스가 남아 있으면 기존 최소
  reader 계산으로 scene v4를 유지하며, 현재 출력만 일반 LT로 바꾼다. 컷 JSON과 active shot은
  보존한다. 실제 strict parser 호스트 회귀로 수정 전 실패와 수정 후 성공을 확인했다.
- 실제 화면 재검증: 새 guest의 6패스 적용 차단·이유·도형 18개·카메라 적용·일반 LT footer,
  합성 PNG v4 ZIP의 정식 `3D 배경 편집` 재열기·설정 보존·6패스 footer 차단·명시적 일반 LT
  전환·undo 차단 복원·redo 활성 모두 통과했다. 새 GPU 요청은 0회이며, 이 검증을 실제
  6패스 원고 전달 성공으로 취급하지 않는다. pageerror와 외부 요청은 0개다.
- LT 안내가 속성 패널에서 잘리는 문제는 실제 컨테이너 폭을 쓰는 카드 grid와 sidebar의
  `min-width` 제약을 고쳐 해결했다. sidebar right 1591px/width 360px, LT card right 1521px,
  viewport 1600px를 관측했고, 7개 가로 경계·overflow 검사를 통과했다.
- 추가 범위: 여섯 본문·scene·역할·presentation을 하나의 immutable render revision과
  manifest/receipt로 결박하고 단일 CRDT 전이·원격 복원·재캡처·undo/redo를 검증한다.
- 기존 `creator_work_asset`의 image 8 MiB·행 12 MiB SQL CHECK를 조용히 넓히지 않는다.
  별도 bundle revision/artifact 테이블·전용 namespace·API·조건부 project v5 등 저장 계약
  보강이 필요하다. 기존 로컬 6패스 v4 파일과 일반 이미지 계약은 유지한다.
- [추가 저장·동기화 계약 검토안](bg3d-six-pass-bundle-contract-proposal-2026-11-04.md)을
  제시하고 사용자 승인을 요청했다. 실제 운영 DB 적용·배포·quota 변경은 별도 승인 대상이다.

추가 승인 전 제품 수준은 **실제 6패스 픽셀 생성 및 로컬 파일/adapter 검증, 제품 원고 직접 적용은
미지원**이었다. 승인 뒤의 native 묶음 구현과 실제 화면 성공은 2026-11-05 후속 보고에서 따로
판정하며, 이 과거 기록을 현재 제품 지원 판정으로 사용하지 않는다.

### 2026-11-05 추가 저장 계약의 초기 파일·복구·구 reader 경계 기록

사용자 승인 뒤, 보존된 `bg3dLtBundles` revision이 있는 원고에만 프로젝트 v5를 적용하는
파일 경계를 구현했다. 기존 v2·v3·v4 원고와 정본 envelope의 일괄 변환은 하지 않는다.
자동저장은 `studio-six-pass-bundle-autosave`라는 별도 봉투를 사용하며 미래 reader 봉투를
기존 복구본 위에 덮어쓰지 않는다. 동기식 시작 codec은 작은 봉투만 검사하고, 실제 복구
입구 `restoreStudioAutosaveRecovery`가 전체 manifest·보존 본문·브라우저 PNG decode와 기존
선화 CAS를 재검증한 뒤 원고를 교체한다. 검증 실패 시 복구 후보와 현재 원고를 보존한다.

`.toonproject.zip`은 현재 표시 레이어를 일부/전부 삭제한 뒤에도 retained revision의 여섯
PNG와 원본 scene JSON을 모두 보관한다. 동일 digest 본문은 ZIP 안에서 한 번만 저장하고,
import는 새 bundle CAS와 기존 main-line CAS를 각각 복원한 뒤 문서를 한 번 반영한다.
정본 manifest는 파일 안의 보존 상태에서 재생성해 동일 hash로 native CAS에 복원한다.
scene에는 원본 모델 첨부가 없어야 하므로 외부 GLB·SKP 원본까지 담는 묶음으로 해석하지 않는다.

v5 retained 묶음 ZIP만 파일 544 MiB, 첨부 합계 512 MiB 상한을 사용한다. 기존 v2·v3·v4의
280,000,000/256,000,000바이트 상한과 별도 모바일 하한은 유지한다. 일반 ZIP intake는 절대
상한으로 중앙 디렉터리를 먼저 읽고, 프로젝트·계약 확인 뒤 해당 버전의 상한을 다시 검사한다.
비압축 store-only·entry 수·실제 크기·CRC·SHA-256·IHDR·원본 scene hash 검사는 유지한다.

구형 workspace `.toonstudio` formatVersion 1은 새 묶음 본문을 담지 못하므로 6패스 묶음
원고의 export/import를 명시적으로 거절하고 `.toonproject.zip` 사용을 안내한다. 불완전한
새 프로젝트를 생성하지 않는다. 구형 패키지 전체 형식의 확장은 이번 구현에 포함하지 않았다.

일반 v8 CRDT 메시지는 기존 구조를 유지한다. 보존 묶음 문서는 별도 reader 광고와
`requiredReaderCapabilities: ["bg3d-sixpass-bundle.v1"]`, `artifactScope`를 사용한다. 구 exact-key
reader는 신규 feature 봉투를 거부하며, 신규 앱도 구 reader의 변경·동기화 요청을 차단한다.
기기 전용 `origin` 본문은 명시적 same-origin primary만 사용하고 열린 RTC로 전달하지 않는다.
송신 feature 전이는 shadow 문서 검증 뒤 실제 Y 문서에 단일 업데이트로 반영한다.
수신은 CRDT 참조와 모든 native 본문을 검증한 뒤 편집 가능한 pages/history frontier를 재조정한다.
작품 범위 `work`는 인증된 서버 영수증을 확인한 manifest 집합에만 부여한다.

이 절의 합성 PNG·인메모리 native-interface 회귀는 저장/거절/보상 계약 증거다. 실제 GPU,
실제 native OPFS, 동일 origin 두 탭, 새 브라우저 문맥의 ZIP 재열기는 별도 화면 검증 결과로
기록한다. 배포·운영 DB migration을 실행했다는 뜻이 아니다.
