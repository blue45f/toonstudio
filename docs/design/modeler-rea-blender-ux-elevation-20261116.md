# REA MCP · Blender 5.2 MCP 기반 전 페이지 3D 모델러 품질·기능·직관성·UI/UX 고도화 설계서

- **작성일**: 2026-11-16
- **문서 상태**: `current` 실측 감사 + `target` 고도화 설계 및 구현 사양 (`AGENTS.md` §2·§7 준수)
- **증거 원장**: [`docs/evidence/rea-modeler-benchmark-20261116.json`](../evidence/rea-modeler-benchmark-20261116.json) (`22`개 REA 증거 레코드, 세션 번들 SHA-256 `52ed03aa42960d71da9b282b4b9d09ddf46a564a1279d107c9dd0a5aed287c72`, 미해결 `unknowns: 0`)
- **Blender 5.2 / GLBForge 증거**: [`apps/web/public/studio-assets/blender-modeler-kit-v13/provenance.json`](../../apps/web/public/studio-assets/blender-modeler-kit-v13/provenance.json) (`blend-ai` MCP `analyze_mesh_quality` 결함 `0`건 + `glbforge@0.8.0` `desktop-hero@1`·`mobile-hero@1` `100 / 100` 통과)
- **대상 브랜치**: `feat/modeler-rea-blender-ux-elevation-20261116`

---

## 1. 목적 및 전수 분석 범위

본 설계서는 **REA(`reverse-engineer-anything`) MCP**, **Blender 5.2.0 LTS(`blend-ai`) MCP**, **GLBForge(`glbforge`) MCP**, **Playwright / Chrome DevTools**를 결합해 외부 대표 웹 3D 모델러·조형·씬 저작 도구 3종(**SculptGL**, **Blockbench Web**, **three.js editor**)과 Blender 5.2 네이티브 모델링 규약을 역공학·대조하고, ToonStudio 내 **모든 3D 모델러·조형·공간·포즈·캐릭터 관련 페이지(총 15개 표면 × 데스크톱/모바일 30개 시나리오)**를 전수 정밀 감사한 결과를 바탕으로 모델러의 **기하 품질, 기능 확장, 첫 3초 직관성, UI/UX 인체공학(`44×44px`), 디자인 통일성**을 완성하기 위한 상세 설계다.

### 상태 구분 원칙 (`AGENTS.md` §2·§7)

1. **`current` (2026-11-16 실측 기준선)**:
   - 하이브리드 DCC 모델러(`/studio/3d/dcc/:mode`), 3D 배경·공간 모델러(`/studio/bg3d`), 포즈 스튜디오(`/studio/poser`), 2D→3D 변환(`/studio/lift3d`), 캐릭터 셰이퍼(`/studio/assets/characters/new`), 캐릭터 변환(`/studio/character-convert`), 공간 제작 허브(`/studio/immersive`), 에셋 허브(`/studio/assets`), 독립 실험 앱(`apps/character-lab`)에서 확인된 실제 DOM·터치 타깃·기능 공백·레이아웃 문제를 수치로 기록한다.
2. **`target` (본 작업 구현 및 검증 완료 목표)**:
   - 아래 **7대 워크스트림(WS1 ~ WS7)**을 구현·검증하여 모델러 전 페이지 터치 인체공학 준수, 8종 프리미티브 + Blender V13 베이스메시 1클릭 생성, 스컬프트 강도·X/Y/Z 대칭·세분화 확장, 표준 `.glb`/`.stl` 내보내기, 공간 모델러 카테고리 필터·건축 프리셋, 2D→3D 샘플 트라이얼, 포저 내부 기술 용어 제거 및 44px 규격화를 달성한다.
3. **`external-validation` (과장 금지 경계)**:
   - SketchUp 상용 데스크톱 전체 CAD 커널 동등성, 외부 유료 생성형 3D API 실과금 호출, 비공개 독점 포맷 전체 복원은 본 로컬 웹 모델러 고도화 범위와 구분하여 정직한 지원 경계를 유지한다.

---

## 2. REA MCP + Blender 5.2 MCP 역공학 및 전 페이지 실측 진단 (2026-11-16)

### 2.1 외부 웹 3D 모델러 & Blender 5.2 기준 역공학 요약 (`current`)

| 대상 | REA / MCP 증거 | 실측 DOM / AX / AST | 핵심 아키텍처·UX 메커니즘 | ToonStudio 내재화 반영 |
| --- | --- | --- | --- | --- |
| **SculptGL** (`stephaneginier.com/sculptgl/`) | `ev_642df8692d438429...` / `ev_611284ae2405bf5c...` | `1,179` DOM · `934` AX · `133,917` AST | 진입 즉시 조형 가능한 구체 배치, 브러시 반경·강도(Intensity) 연속 슬라이더, **X축 대칭(Symmetry)** 상시 토글, **세분화(Subdivide)·리메시(Remesh)** 1클릭 버튼, 정면(F)/상단(T)/좌측(L) 뷰 프리셋 | **WS2·WS3**: 조형 구체 1클릭 시작, 스컬프트 강도 슬라이더(`0.05~1.00`), 로컬 X/Y/Z 대칭 조형 커널 및 UI, 1클릭 세분화 버튼 |
| **Blockbench Web** (`web.blockbench.net`) | `ev_16422c28d3adeabc...` / `ev_3c92e49e7eea681c...` | `1,517` DOM · `393` AX · `1,204,746` AST | 작업 모드별 명확한 도구 격리(모드에 무관한 패널 비노출), 직관적인 시작 템플릿 선택, 표준 `.glb`/`.gltf`/`.obj` 즉시 내보내기 | **WS1·WS2**: DCC 6대 모드별 하위 도구 점진적 노출로 세로 스크롤 폭주 해소, 표준 `.glb`/`.stl` 원클릭 파일 저장 |
| **three.js editor** (`threejs.org/editor/`) | `ev_a2dc001ef8510a02...` | `1,210` DOM · `319` AX | 상단 프리미티브 팔레트(Box, Sphere, Cylinder, Cone, Torus, Plane), 뷰포트 기즈모(`이동/회전/스케일` + Local/World), 우측 아웃라이너 + 인스펙터 수치·바운딩 치수 표시 | **WS1·WS2**: 8종 프리미티브 + Blender V13 킷배시 퀵 팔레트, 선택 오브젝트 실시간 `W×H×D(m)` 치수 및 매니폴드 품질 배지 |
| **Blender 5.2.0 LTS** (`blend-ai` + `glbforge`) | `analyze_mesh_quality` + `desktop-hero@1` | 결함 `0`건 · `100/100` | 매니폴드 에지·고립 정점·0면적 면 0건 검증, 베벨(Bevel)·돌출(Extrude)·루프컷·서브디비전·대칭 조형·스마트 UV 전개 | **WS2·WS3·WS5**: `blender-modeler-kit-v13` 4종 오리지널 에셋 제작·탑재 및 DCC 인스펙터 토폴로지 무결성 지표 도입 |

### 2.2 ToonStudio 모델러 전 페이지 실측 결함 매트릭스 (`current` — 2026-11-16)

| 표면 / 경로 | REA 증거 ID | 실측 DOM / `<44px` 미달 | 확인된 핵심 기능·직관성·UI/UX 결함 | 해결 워크스트림 |
| --- | --- | --- | --- | --- |
| **`/studio/3d/dcc/:mode`** (`model`, `build`, `cad`, `sculpt`, `material`, `shot`) | `ev_e346ac37672a690e...` | `2,294~3,045` DOM / **`32`개** (`36px`) | 1) 상단 모드 탭이 우측 파일 버튼에 눌려 4번째 탭부터 클리핑<br>2) `sm:pointer-fine:min-h-9`로 뷰포트·스컬프트·스냅 버튼 `32`개 `36px` 미달, 모바일 뒤로가기 `41×44px`<br>3) 빈 무대 및 비폴리곤 모드(`sculpt`/`shot`/`build`)에서도 뷰포트 하단에 7개 폴리곤 하위 패널이 일괄 노출되어 `scrollHeight: 2,666px` 폭주 및 하단 sticky 푸터가 스냅 입력창을 가림<br>4) 시작 도형이 `큐브` 단일 위주이며 `.glb`/`.stl` 직접 저장 버튼 부재, 스컬프트에 **강도(Strength)** 및 **X/Y/Z 대칭(Symmetry)** 부재 | **WS1 · WS2 · WS3 · WS5** |
| **`/studio/bg3d`** (`StudioBg3dEditorModal`, `SpatialModeler`, `AdvancedWorkbenchHub`) | `ev_474eb39c127847ed...` | `2,162~2,603` DOM / **`14`개** (`32~40px`) | 1) 상단 `장면 도우미 / 정밀 편집` 스위치 `min-h-8`(`32px`) 및 모바일 단계 버튼 `40px` 미달<br>2) 초기 로딩 오버레이에 회전 스피너 노출(DESIGN.md §4 위반)<br>3) 헤더에서 `정밀 3D 모델러(DCC)` 직통 진입점 부재<br>4) `AdvancedWorkbenchHub` 19개 탭이 평면 나열되어 `공간 모델러` 탐색이 어려움, 건축 생성기에 원클릭 실용 치수 프리셋 부재 | **WS4 · WS5** |
| **`/studio/poser`** (`StudioPoserPage`, `StudioMannequinPoserPanel`) | `ev_6cfbc239f97e8292...` | `2,046~2,544` DOM / **`60~62`개** (`30~36px`) | 1) 좌상단에 내부 기술 용어 `"SQLite 불러오는 중"` 노출(UI/UX v2 계약 위반)<br>2) 머리글 `내보내기/가져오기/공유/사진 포즈`(`32px`), 우측 6개 탭(`36px`), 관절 회전 패드(`36×36px`), 렌즈·솔버 버튼(`30.2px`) 등 `62`개 컨트롤 `<44px` 미달 및 하드코딩 HEX 색상 잔존 | **WS6** |
| **`/studio/lift3d`** (`StudioLift3dPage`) | `ev_0d6841719db94f08...` | `436~963` DOM / **`6`개** (`16px`) | 1) 내장 샘플 원화가 없어 파일 없이 즉시 입체 변환을 체험할 수 없음<br>2) 슬라이더·체크박스 터치 높이 `16px` 미달<br>3) 변환 후 `정밀 3D 모델러(DCC)` 또는 `3D 배경 편집기`로 이어지는 제작 동선 브리지 부재 | **WS6** |
| **`/studio/assets/characters/new`**, **`/studio/character-convert`**, **`/studio/immersive`**, **`/studio/assets`** | `ev_8f51186b...` / `ev_e2debf6a...` | `365~1,858` DOM / **`1~7`개** | 1) `.studio-character-guide__stage-step` CSS `min-height: 2.25rem`(`36px`)이 `min-h-11`을 덮어씀<br>2) `CharacterShaperEditorLoading` 회전 스피너 잔존<br>3) `StudioSpecialistSuiteBar`에 핵심 3D 모델러·공간 모델러·포저·2D→3D 스위트 링크 누락 | **WS6** |
| **`apps/character-lab`** (`http://127.0.0.1:4176`) | `ev_c7e0e1e57de67ded...` | `944` DOM / **`72~114`개** | `.cl-button-small`, `select`, `summary`, 숫자 입력·슬라이더 래퍼 높이가 `17~23px`로 협소하며 모바일 뷰포트 도구바 가로 클리핑 발생 | **WS7** |

---

## 3. 7대 워크스트림 상세 구현 설계 (`target`)

### 아키텍처·품질 불변식 준수 원칙

- **`creatorRootFiles` 상한(`2506 / 2506`) 엄수**: `apps/web/src/domains/creator/` 루트 직하단에 파일을 추가하지 않고 모든 신규 모듈은 `hybrid-dcc/`, `bg3d/`, `lift3d/` 등 도메인 하위 디렉터리에 둔다.
- **소스 파일 크기 상한(`<= 800`줄) 엄수**: 신규 파일은 모두 `350`줄 이하의 응집도 높은 모듈로 작성하고, 기존 `800`줄 초과 파일(`StudioHybridDccPanel.tsx`, `StudioHybridDccViewportCore.tsx`, `StudioMannequinPoserPanel.tsx` 등)은 줄 수를 늘리지 않거나 보조 컴포넌트로 분리해 오히려 줄 수를 감축한다.
- **스튜디오 초기 번들(`check:studio-eager-graph`) 엄수**: 3D·모델러 코드는 기존 지연 로드(lazy chunk) 경계 내부에서만 확장한다.
- **UI/UX v2 계약(`verify-ui-ux-v2-contracts.mjs`) 엄수**: 정본 경로 사용(레거시 `/shaper` 링크 금지 → `/studio/assets/characters/new`), `min-h-11`(`44px`) 보장, 스피너 금지, 내부 구현 용어(`SQLite` 등) 사용자 노출 제거, Starlight OKLCH 시맨틱 토큰 및 `prefers-reduced-motion` 대응.

### WS1. 하이브리드 DCC 모델러 레이아웃 · 모드 인지형 도구 정돈 · 44px 인체공학

- **대상**:
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccPanel.tsx` (줄 수 비증가 유지)
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccWorkbenchChrome.tsx`
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccViewport.tsx`
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccViewportCore.tsx` (줄 수 비증가 유지)
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccViewportParts.tsx`
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccViewportInteractionBar.tsx`
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccRouteGate.tsx` & `StudioHybridDccDialog.tsx`
- **설계**:
  1. `SegmentedButton` 등 모든 인터랙티브 컨트롤에서 `sm:pointer-fine:min-h-9`를 제거하여 데스크톱·모바일 공통 `min-h-11 min-w-11`(`>= 44×44px`)을 보장하고, 뒤로가기 버튼에 `min-w-11`을 부여한다.
  2. 상단 모드 탭 바(`StudioHybridDccModeTabs`)가 파일 도구에 밀려 잘리지 않도록 전폭 우선 배치(`basis-full xl:basis-auto`)를 적용해 6대 작업 모드가 한눈에 드러나게 개선한다.
  3. `StudioHybridDccViewport.tsx`에서 폴리곤 정밀 보조 패널 묶음을 **모드·선택 인지형 접이식 작업 서랍**으로 정돈하여 `sculpt` / `shot` / `build` 모드나 빈 무대에서 불필요한 패널 나열을 억제하되, 활성 미리보기(`geometryActive` / `faceModeling.engaged` / `componentTransform.previewing`) 중이거나 사용자가 펼쳤을 때는 모든 기존 편집 컨트롤과 `data-studio-*` 앵커가 즉시 동작하도록 보장한다.
  4. 패널 하단 여백과 상태바 간격을 정돈하여 스냅 숫자 입력창 가림 현상을 해소한다.

### WS2. 8종 프리미티브 + Blender V13 베이스메시 팔레트 · 메시 품질 인스펙터 · `.glb`/`.stl` 내보내기

- **대상**:
  - 신규 `apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-primitives.ts` (순수 결정론적 프리미티브 & 토폴로지 요약 유틸)
  - 신규 `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccPrimitiveBar.tsx` (프리미티브 8종 + Blender V13 스타터 4종 원클릭 팔레트)
  - 신규 `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccSelectionMetrics.tsx` (실시간 바운딩 치수 `W×H×D` 및 매니폴드 품질 요약 카드)
  - `apps/web/src/domains/creator/hybrid-dcc/useStudioHybridDccFileTools.ts` & `StudioHybridDccFileTools.tsx`
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccIntro.tsx`
- **설계**:
  1. **결정론적 프리미티브 빌더(`studio-hybrid-dcc-primitives.ts`)**:
     - 기존 `Cube`, `Sphere`, `Cylinder`, `Grid` 외에 **`Sculpt Sphere`(Catmull-Clark 2단계 세분화 고밀도 쿼드 구체 — 즉시 부드러운 조형 가능)**, **`Cone`(원뿔)**, **`Torus`(도넛 링)**, **`Arch Block`(아치 블록)**을 닫힌(watertight) half-edge 메시로 생성하고 `workspaceRegisterGeneratedMesh`로 Undo/Redo 스택에 단일 스텝으로 등록한다.
     - 선택 메시의 바운딩 박스(`width × height × depth` m), 삼각형 수, 열린 경계 모서리(boundary half-edge) 유무를 순수 함수 `computeStudioHybridDccMeshQualitySummary`로 계산한다.
  2. **Blender V13 스타터 킷 즉시 반입**:
     - `StudioHybridDccPrimitiveBar`에서 `/studio-assets/blender-modeler-kit-v13/*.glb` 4종(`두상 베이스메시`, `아치 창호`, `나선 계단`, `벤치·가로등`)을 클릭 한 번으로 fetch → 기존 `modelImport.open(File)` 검증 파이프라인에 전달하여 안전하게 편집 오브젝트로 로드한다.
  3. **표준 `.glb` & `.stl` 파일 저장**:
     - `useStudioHybridDccFileTools.ts`에 `saveGlb`(선택 오브젝트의 모디파이어 스택 평가 메시 + 툰 재질 슬롯을 `exportStudioHybridDccMeshToGlb`로 검증·인코딩해 `.glb` 다운로드) 및 `saveStl`(`workspaceExportActiveMesh(ws, "stl")`)을 추가하고 상단 파일 도구바에 연결한다.

### WS3. 스컬프트(Sculpt) 엔진 고도화: 강도(Strength) · X/Y/Z 대칭(Symmetry) · 빠른 프리셋 · 1클릭 세분화

- **대상**:
  - `apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-sculpt-kernel.ts`
  - `apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-sculpt-stroke-session.ts`
  - `apps/web/src/domains/creator/hybrid-dcc/useStudioHybridDccSculptStroke.ts`
  - `apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccSculptTools.tsx`
- **설계**:
  1. `StudioSculptStroke`에 선택적 `symmetry?: { readonly x?: boolean; readonly y?: boolean; readonly z?: boolean }` 필드를 추가한다.
  2. `applyStudioSculptStroke`에서 활성 대칭축 조합(`1`개 축 → 최대 `2`개 미러 센터, `2`개 축 → `4`개, `3`개 축 → `8`개)을 생성하되, 중심점이 대칭 평면(`|c_axis| <= radius * 0.05` 근방 중복 좌표 제거)과 일치해 동일 좌표로 수렴하는 미러 패스는 자동 병합하여 대칭선 위에서 변위가 2배로 튀는 현상을 방지한다. `grab`/`snakeHook`/`flatten`/`scrape`의 `direction` 벡터도 반사축 부호를 정확히 반전한다.
  3. `useStudioHybridDccSculptStroke`에 사용자 조절 가능한 **`strength` (`0.05 ~ 1.00`, 기본 `0.25`)**와 **`symmetryX` / `symmetryY` / `symmetryZ` (기본 `symmetryX: false`로 기존 단위 테스트 기본 동작 100% 하위 호환 유지!)**를 추가한다.
  4. `StudioHybridDccSculptTools`에 브러시 반경 슬라이더 + 빠른 크기 칩(`0.2 / 0.45 / 0.8`), 강도 슬라이더(`5% ~ 100%`), **대칭 축 토글(`X 좌우 대칭` / `Y` / `Z`)**, 그리고 **`조형 구체 추가` & `메시 1단계 세분화(Subdivide)`** 원클릭 액션을 배치한다.

### WS4. 3D 배경 편집기(`/studio/bg3d`) & 공간 모델러 직관성·발견성·프리셋 고도화

- **대상**:
  - `apps/web/src/domains/creator/bg3d/StudioBg3dEditorModal.tsx`
  - `apps/web/src/domains/creator/bg3d/StudioBg3dSceneAssistantWorkspace.tsx` (모바일 40px 버튼 → 44px 격상 및 로딩 스피너 제거)
  - `apps/web/src/domains/creator/bg3d/StudioBg3dAdvancedWorkbenchHub.tsx`
  - `apps/web/src/domains/creator/bg3d/StudioBg3dArchitecturalModelingPanel.tsx`
  - `apps/web/src/domains/creator/bg3d/StudioBg3dSpatialModelerPanel.tsx`
- **설계**:
  1. `StudioBg3dEditorModal` 헤더의 `장면 도우미 / 정밀 편집` 전환 버튼을 `min-h-11`로 격상하고, 우측에 **`정밀 모델러 (DCC)`** 직통 진입 버튼을 추가한다.
  2. 초기 스타트업 안내 카드의 원형 회전 스피너를 비회전 Starlight 상태 배지로 교체하고 모바일 단계 버튼들을 `min-h-11`로 통일한다.
  3. `StudioBg3dAdvancedWorkbenchHub` 상단에 **그룹 필터 칩(`전체` / `공간·건축 모델러` / `캐릭터·DCC` / `셰이더·재질` / `환경·VFX` / `웹툰 연출` / `세트·XR`)** 및 **빠른 도구 검색 입력(`min-h-11`)**을 추가하고, 공간 모델러 바로가기 버튼을 상단에 고정해 19개 탭 사이에서 헤매지 않도록 개선한다.
  4. `StudioBg3dArchitecturalModelingPanel`에 **5종 실전 웹툰 건축 규격 프리셋(`학교 복도 계단`, `옥상 철제 나선계단`, `한옥 팔작 대문`, `아카데미 열주 회랑`, `유럽풍 아치 정문`)** 원클릭 적용 칩을 추가한다.

### WS5. Blender 5.2 V13 모듈러 스타터 키트 카탈로그 통합

- **대상**:
  - `apps/web/public/studio-assets/blender-modeler-kit-v13/*` (생성 및 `glbforge` 100/100 검증 완료)
  - `apps/web/src/domains/creator/bg3d/studio-bg3d-essential-pose-prop-catalog.ts`
  - `apps/web/src/domains/creator/bg3d/StudioBg3dEssentialPosePropPanel.tsx` 및 관련 카탈로그 테스트 갱신
- **설계**:
  - `blender-modeler-kit-v13-prop-3d` 카테고리(`블렌더 모듈러 모델링 킷 V13`, 4종)를 추가하여 총 **123종 CC0-1.0 1st-party 에셋**을 BG3D 에셋 라이브러리와 DCC 모델러 양쪽에서 즉시 사용할 수 있게 한다.

### WS6. 포즈(`/studio/poser`) · 2D→3D(`/studio/lift3d`) · 캐릭터 셰이퍼 · 에셋 허브 통합 개선

- **대상**:
  - `apps/web/src/domains/creator/scene-3d/StudioPoserPage.tsx`
  - `apps/web/src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx` (줄 수 비증가 유지)
  - `apps/web/src/domains/creator/scene-3d/StudioMannequinPoserHeaderActions.tsx`
  - `apps/web/src/domains/creator/scene-3d/StudioMannequinRotationControls.tsx`
  - `apps/web/src/domains/creator/lift3d/StudioLift3dPage.tsx` & `StudioLift3dUi.tsx` & 신규 `studio-lift3d-sample-presets.ts`
  - `apps/web/src/domains/creator/studio-3d-ui/studio-3d-illustrated-chrome.css` & `CharacterShaperEditorLoading.tsx`
  - `apps/web/src/domains/creator/studio-shell/StudioSpecialistSuiteBar.tsx`
- **설계**:
  1. `/studio/poser`: 사용자 노출 문구에서 `"SQLite"` 내부 용어를 제거해 `"포즈 보관함 불러오는 중"` / `"포즈 저장 중"`으로 순화하고, 머리글 액션(`size: "md"` / `min-h-11`), 6개 우측 탭(`min-h-11`), 좌하단 회전 패드(`size-11`), 렌즈·솔버 칩(`min-h-11`), 히스토리 버튼(`min-h-11`)을 전수 규격화하며 하드코딩 HEX 색상을 시맨틱 토큰으로 교체한다.
  2. `/studio/lift3d`: 파일이 없는 상태에서도 1클릭으로 즉시 변환 결과를 확인할 수 있는 **3종 내장 샘플 원화 생성기(`캐릭터 스탠딩`, `판타지 크리스탈 소품`, `도시 야경 배경`)**를 추가하고, 슬라이더/체크박스/파일 드롭존 `44px` 터치 규격 및 **`정밀 3D 모델러(DCC) 열기` / `3D 배경 편집기 열기`** 브리지를 연결한다.
  3. `/studio/assets/characters/new` & `StudioSpecialistSuiteBar`: `.studio-character-guide__stage-step` 최소 높이를 `2.75rem`(`44px`)으로 상향하고, `CharacterShaperEditorLoading`의 회전 스피너를 제거하며, `StudioSpecialistSuiteBar`에 `정밀 3D 모델러` · `3D 배경·공간 모델러` · `캐릭터 셰이퍼` · `포즈 스튜디오` · `2D→3D 변환` 직통 링크를 완비한다.

### WS7. `apps/character-lab` 3D 캐릭터 모델러 터치 인체공학 & 모바일 뷰포트 도구바 개선

- **대상**:
  - `apps/character-lab/src/app/styles/character-lab.css`
- **설계**:
  - `apps/character-lab/AGENTS.md` 경계 규칙을 엄수하면서 `character-lab.css` 내 인터랙티브 요소(`summary`, `select`, `input[type="number"]`, `input[type="range"]`, `.cl-button-small`)의 최소 높이를 `44px`로 정렬하고, 모바일 뷰포트 상단 도구바에 가로 스크롤(`overflow-x: auto`)을 허용해 클리핑을 해소한다.

---

## 4. 검증 및 병합 게이트 계획

1. **단위 및 통합 테스트 (`Vitest`)**:
   - 신규 프리미티브 빌더, 토폴로지 품질 요약, 스컬프트 강도·대칭(X/Y/Z) 커널 및 세션, DCC 패널/뷰포트/파일 도구(`.glb`/`.stl`), 공간 모델러 카테고리 필터·건축 프리셋, V13 에셋 카탈로그, 포즈 스튜디오, Lift3D 샘플 프리셋, Character Lab 테스트 전수 실행 및 통과.
2. **아키텍처·디자인·보안 게이트**:
   - `pnpm validate:architecture` (`validate-documentation`, `validate-source-layout` `2506/2506`, `validate-app-boundaries`, `check-source-file-size`, `check-studio-eager-graph`)
   - `node scripts/verify-ui-ux-v2-contracts.mjs`
   - `pnpm typecheck:character-lab && pnpm test:character-lab`
   - `pnpm harness:verify` 및 `pnpm quality:secrets:changed`
3. **실브라우저 전후 비교 재감사 (`Playwright`)**:
   - 수정 전 동일 스크립트(`15`개 모델러 표면 × 데스크톱 `1440×900` & 모바일 `390×844`)를 재실행하여 런타임 예외 `0`건, 가로 오버플로 `0`건, 터치 타깃 및 레이아웃 개선 수치, 실제 스컬프트 대칭/프리미티브 생성/GLB 다운로드 동작을 검증한다.
4. **PR 생성 및 `main` 병합**:
   - Conventional Commits 한글 요약으로 논리적 커밋을 작성하고 원격 브랜치 푸시 → GitHub PR 생성 → 필수 검증/CI 확인 후 `main` 병합까지 완료한다(운영 배포는 별도 범위이므로 수행하지 않음).
