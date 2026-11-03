# SketchUp 3D 배경 제작·연출 및 Higgsfield Mangaka REA 역공학 내재화 설계서 (2026-11-03)

## 1. 개요 및 역공학 근거 (`current`)

본 문서는 `rea` MCP 서버(CDP 엔드포인트 `http://127.0.0.1:9223` 및 정적 JS 애플리케이션 그래프 분석기)를 사용하여 **SketchUp 3D 배경 제작·연출 생태계(SketchUp for Web, 3D Warehouse, ACON3D, Section Planes, Real-World Shadows, Scenes, Styles, Push/Pull, Tags, Outliner)**와 **Higgsfield Mangaka (`https://higgsfield.ai/mangaka`)**를 역공학하고 툰스튜디오(`apps/web/src/domains/creator/`)에 내재화한 설계 및 구현 내역을 기록한다.

- **증거 레지스트리**: `docs/evidence/rea-sketchup-and-higgsfield-mangaka-20261103.json`
- **핵심 REA Evidence ID**:
  - 브라우저 타겟 목록: `ev_cd7ff2e9f8fbd4d59efed4eb0fa97e8da87343bf305de6262cb8700285aea083`
  - SketchUp 3D 배경 10개 타겟: `ev_a57c83ab...` (SketchUp for Web), `ev_6eb7a7b9...` (3D Warehouse), `ev_dcb60925...` (Section Planes), `ev_139ab871...` (Real-World Shadows), `ev_ccc4d33d...` (Scenes), `ev_3714961a...` (Styles), `ev_38a30425...` (Push/Pull), `ev_972305f4...` (Tags), `ev_a0d43a3a...` (Outliner), `ev_13d5f54c...` (ACON3D)
  - Higgsfield Mangaka 페이지 & JS 번들 정적 분석: `ev_c2fd39e05257a55857e911db95bf55cede404370ff48a0161e6750fec66bbbcb`, `ev_38830a55ec4ee1475619f0f3c2d66499208903db559d9d8a97c71de7050ab423` (8개 라우트 번들, `102,236` AST 노드, `40,457` 데이터 플로 관계)

---

## 2. Higgsfield Mangaka (`https://higgsfield.ai/mangaka`) 역공학 분석 및 내재화

### 2.1 역공학으로 복원한 핵심 메커니즘
1. **4대 만화/웹툰 비주얼 스타일 및 독서 방향(`6e23fedf-G7OJL620HCeJ0lCw.js`)**:
   - `manga-bw` (`page`, 기본 `rtl` 반전 허용, 레지스터 `shonen` / `shojo` / `seinen`)
   - `manga-color` (`page`, 기본 `rtl`, 채색 기법 `cel` / `watercolour`)
   - `comics` (`page`, 기본 `ltr`, 레지스터 `mainstream` / `graphic-novel`)
   - `webtoon` (`panel`, 기본 `ttb` 세로 스크롤, 레지스터 `action` / `romance` / `fantasy` / `drama` / `horror` / `comedy`)
2. **8대 글로벌 웹툰 포털 규격(`6e23fedf-h1a0JFWblGzjA9au.js` `at` 상수)**:
   - `webtoon` (800px, 슬라이스 1280px, 파일 2MB, 최대 100장), `tapas` (940px), `line` (800px), `naver` (690px, 5MB), `comico` (690px, 100장), `daum` (760px, 4MB), `kr700` (700px), `kr720` (720px).
3. **캐릭터 레퍼런스 시트 & 룩 시트 잠금(`6e23fedf-_g9o7S6LMP_XgDu6.js` `IDEA_PEOPLE_MAX = 6`)**:
   - 최대 6인의 실사 사진(PNG/JPEG/WebP, 최대 20MB) 또는 캐릭터 시트를 등록해 `Base look` / `Base state` 및 180도 대화 방향(`left`/`right`)을 씬 전체에서 고정.
4. **세로 스트립 자동 스테이징, 안전 슬라이스, `WT-*` 규칙 검증 엔진**:
   - 6종 컷 간격 클래스(`action`: 120~200px, `beat`: 240~400px, `pause`: 400~600px, `scene`: 600~1000px, `reveal`: 800~1000px, `timeSkip`: 1000~1600px)와 FNV-1a 해시 지터(`Uu`).
   - 1,600px 스크롤 창 내 최대 2패널 제한(`WT-L1.max`), 동일 간격 6회 초과 금지(`WT-L5.run`), 패널당 말풍선 3개·25단어·5줄 이하(`WT-T3`), 대사 Cap Height 22px 이상(`WT-T2`), 얼굴/말풍선/SFX 겹침 금지(`WT-T5.faces`, `WT-T5.overlap`, `WT-L15`), 씬당 상세 배경 필수 및 무배경 40% 이하(`WT-L11`).

### 2.2 내재화 모듈
- `apps/web/src/domains/creator/manga-toolkit/higgsfield-mangaka-engine.ts`
- `apps/web/src/domains/creator/manga-toolkit/StudioHiggsfieldMangakaPanel.tsx`
- `apps/web/src/domains/creator/manga-toolkit/StudioBlankComicProDrawingSubPanel.tsx` (`higgsfield-mangaka` 탭 통합)

---

## 3. SketchUp 3D 배경 제작·연출 7대 워크플로 내재화

### 3.1 내재화된 7대 핵심 기능
1. **Push/Pull(`P`) 관통 개구부 · Offset(`F`) 창틀 · Follow-Me 몰딩 · 축 추론 잠금 · `*N`/`/N` 배열 커밋**:
   - `commitSketchUpDirectModelingToPrimitives`를 통해 폴리곤 개구부 벽체와 몰딩·창틀 배열을 즉시 `BgPrimitive[]`로 생성하여 호스트 3D 뷰포트에 배치.
2. **2점 투시(Two-Point Perspective) 수평 Pitch 고정 & 수직 렌즈 시프트(`lensShiftY`) 잠금**:
   - `panSketchUpTwoPointPerspectiveLockedCamera`로 모든 수직 기둥의 평행을 유지한 채 상하 프레이밍만 이동.
3. **외부 태양 그림자 보존형 실내 방 자동 단면 컷어웨이(`computeShadowPreservingRoomCutawayPlan`)**:
   - 카메라 시야를 가리는 앞벽·천장을 카메라 레이에서만 투명화(`cameraVisible: false`)하고 태양광 그림자 캐스터(`preserveShadowCaster: true`)는 유지해 실내 창틀 채광 왜곡을 방지.
4. **천문 태양광 계산기 + 웹툰 시간대 프리셋(`WEBTOON_SKETCHUP_SOLAR_PRESETS`) + 그림자 소프트니스/진하기 통합**.
5. **SketchUp 6종 스타일 + Outliner 웹툰 태그 가시성 프리셋 세트(`WEBTOON_OUTLINER_TAG_VISIBILITY_PRESETS`) 원클릭 전환**.
6. **Dynamic Components 정본 프리미티브 변환 & 3컷 문 개폐 연속 연출 시퀀서(`generateDynamicComponentActionShotSequence`)**.
7. **1-Click 웹툰 6패스 LT 레이어 스택 레시피(`buildSketchUpWebtoonSixPassLtRecipe`: `color` + `tone` + `shadow` + `depth` + `texture-line` + `main-line` 동시 공존)**.

### 3.2 내재화 모듈
- `apps/web/src/domains/creator/bg3d/studio-bg3d-sketchup-webtoon-staging-bridge.ts`
- `apps/web/src/domains/creator/bg3d/StudioBg3dSketchUpWebtoonStagingSection.tsx`
- `apps/web/src/domains/creator/bg3d/StudioBg3dSpatialModelerSections.tsx`

---

## 4. 전 공정 경쟁사 추가 역공학 및 15개 세분화 직군·레이어 RBAC·8단계 인계 내재화

### 4.1 추가 REA 역공학 증거 (`ev_e2b33b07...`)
- **Clip Studio Paint EX (`ev_865bd9f8...`)**: 3D LT 선·톤 추출, Sub View 레퍼런스 컬러 피커, Story Editor 멀티페이지 대본 동기화, TeamWork 페이지 잠금.
- **Wonder Unit Storyboarder (`ev_42478694...`)**: 3D Shot Generator 카메라 지시문, 대사·액션 노트 스트립 매핑.
- **Blender Story Artist Grease Pencil (`ev_5467d629...`)**: 3D 카메라 평면 위 2D 드로잉 하이브리드 레이아웃.
- **ACON3D ABLE (`ev_e8700e1d...`)**: 웹툰 3D 배경 후보정(대기원근 Z-Depth 안개, AO 그림자 소프트니스) 및 직군별 3D 렌즈 분리.
- **WEBTOON Canvas Creators 101 (`ev_908441f5...`)**: 800×1280px 세로 스크롤 슬라이스 검증 및 8단계 웹툰 전문 직군 분업 체계.
- **Rive (`ev_ea91a96e...`)**: 인터랙티브 무빙툰 상태머신 트리거(`scroll-parallax`, `tap-shake`, `sfx-bounce`).

### 4.2 15개 세분화 직군 특화 메뉴·18종 레이어 RBAC·8단계 원클릭 인계 (`webtoon-role-pipeline-orchestrator.ts`)
1. **8단계 웹툰 표준 제작 공정(`WEBTOON_E2E_ROLE_PIPELINE_STAGES`)**:
   - `1. 글·각색·기획` (`story`, `adaptation`, `associate-writer`, `planner`)
   - `2. 콘티·연출·카메라` (`storyboard`)
   - `3. 3D 배경·소품 배치` (`background`, `background-assistant`, `three-d`)
   - `4. 메인 선화·원화` (`line-art`, `character`, `associate-artist`)
   - `5. 선화 클린업·펜터치 어시` (`line-assistant`, `assistant`)
   - `6. 밑색·마스킹 어시` (`flat-color-assistant`, `color`)
   - `7. 명암·후보정·무빙툰` (`shading-assistant`, `effect-assistant`)
   - `8. 식자·효과음·PD 검수` (`lettering`, `lettering-assistant`, `localization`, `editor`, `producer`, `reviewer`)
2. **18종 표준 레이어 그룹(`WEBTOON_CANONICAL_LAYER_GROUPS`) 최소권한(Least-Privilege) RBAC 가드**:
   - 각 전문 어시스턴트가 본인의 담당 레이어 그룹만 편집할 수 있고, 주연 원화(`main-lineart`), 대본(`script-beat`), 콘티(`rough-storyboard`), 3D 카메라 앵커(`bg3d-camera`)는 자동으로 잠금(`locked-by-role-rbac`) 처리되어 원화 훼손 사고를 원천 차단한다.
3. **UI/UX 직관성 및 원클릭 프리셋 허브 연동**:
   - `StudioWebtoonRolePipelineSubPanel.tsx`: 15개 직군 원클릭 전환, 직군별 특화 메뉴·단축 도구 모음 미리보기, 18종 레이어 그룹 편집 허용/차단 실시간 시뮬레이터, 8단계 공정 원클릭 잠금 인계 및 PD 최종 승인 동결(`approved-frozen`).
   - `StudioCompetitorCapabilityPanel.tsx`: 직군별 필터 바(`competitor-role-filter-bar`) 및 8단계 직군 분업 파이프라인 브리지(`competitor-role-pipeline-bridge`).
   - `CreatorRoleOnboarding.tsx`: 온보딩 1단계 직군 선택 시 해당 직군의 최소권한 RBAC 배지·허용/잠금 레이어 수·특화 메뉴 칩 실시간 프리뷰(`onboarding-role-rbac-preview`).
   - `StudioHiggsfieldMangakaPanel.tsx`: 1-Click 장르·포털 연출 프리셋 바(`mangaka-one-click-preset-bar`), 듀얼페인 로어북 시트(`mangaka-dual-pane-script-lore`), 무빙툰 상태머신 바인딩(`mangaka-moving-toon-state-machine`).
   - `StudioBg3dSketchUpWebtoonStagingSection.tsx`: 직군별 3D 배경 렌즈 프리셋(`sketchup-role-lens-bar`).
