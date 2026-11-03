# SketchUp 3D 배경 제작·연출 및 Higgsfield Mangaka REA 역공학 내재화 설계서 (2026-11-03)

## 1. 개요 및 역공학 근거 (`current`)

상태 구분: 1~3절은 기존 구현과 외부 관측을 기록한 이력이다. 아래 Evidence ID와 외부 서비스의 현재 기능·규격을 이번 후속 검토에서 다시 관측했다고 주장하지 않는다. 새 15파일의 실제 동작 범위는 4절이 정본이며, 외부 제품의 기능 설명을 ToonStudio의 구현·렌더 통합 검증 결과로 간주하지 않는다.

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

## 4. 직무별 공정 계획과 프리셋 후속 검토

### 4.1 기존 외부 참고 기록 (`legacy exception`)

다음 목록은 보존 커밋 `55c8afa11955a32819977598f474f87dac685a06`에 포함된 참고 대상과 관측 ID다. 원본 값은 보존하며, 이번 검토의 새 REA 실행이나 현재 사이트 사양 검증, 해당 기능의 제품 통합 증거로 보고하지 않는다.
- **Clip Studio Paint EX (`ev_865bd9f8...`)**: 3D LT 선·톤 추출, Sub View 레퍼런스 컬러 피커, Story Editor 멀티페이지 대본 동기화, TeamWork 페이지 잠금.
- **Wonder Unit Storyboarder (`ev_42478694...`)**: 3D Shot Generator 카메라 지시문, 대사·액션 노트 스트립 매핑.
- **Blender Story Artist Grease Pencil (`ev_5467d629...`)**: 3D 카메라 평면 위 2D 드로잉 하이브리드 레이아웃.
- **ACON3D ABLE (`ev_e8700e1d...`)**: 웹툰 3D 배경 후보정(대기원근 Z-Depth 안개, AO 그림자 소프트니스) 및 직군별 3D 렌즈 분리.
- **WEBTOON Canvas Creators 101 (`ev_908441f5...`)**: 800×1280px 세로 스크롤 슬라이스 검증 및 8단계 웹툰 전문 직군 분업 체계.
- **Rive (`ev_ea91a96e...`)**: 인터랙티브 무빙툰 상태머신 트리거(`scroll-parallax`, `tap-shake`, `sfx-bounce`).

### 4.2 현재 구현 (`current`)

`webtoon-role-pipeline-orchestrator.ts`와 `StudioWebtoonRolePipelineSubPanel.tsx`는 **분업 계획·권한 예시**다. 18개 그룹은 정적 레이어 분류이며 실제 원고에 18개 잠금 레이어를 만드는 기능이 아니다. 화면에서 고른 개인 직무는 인증 증거가 아니며, 실제 편집 권한은 기존 서버의 문서 접근 권한과 팀 설정을 따른다.

공정 순서는 실제 `WEBTOON_E2E_ROLE_PIPELINE_STAGES`와 같다.

| 단계 | 계획 공정 | 예시 그룹 |
| --- | --- | --- |
| 1 | 글·각색 대본 | `story-notes`, `dialogue-draft` |
| 2 | 콘티·연출 | `storyboard`, `panel-frame`, `camera-guide` |
| 3 | 3D 배경·LT | `background-3d`, `background-line`, `background-tone` |
| 4 | 메인 선화·보조 펜터치 | `main-lineart`, `assistant-line` |
| 5 | 밑색·마스크 | `flat-color`, `color-mask` |
| 6 | 명암·효과 | `shading`, `fx-overlay` |
| 7 | 식자·효과음 | `balloon`, `dialogue-text`, `sfx-typography` |
| 8 | 편집·PD 검수 | `review-annotation` |

- 계획 안의 인계는 현재 공정의 담당 직무와 총괄 직무를 검사하고 누적 동결 그룹을 예시 판정에 반영한다. 최종 동결 이후 반복 실행은 새 이력을 만들지 않는다. 이 검사는 서버 인가를 대신하지 않는다.
- 계획의 직무·단계·인계 기록은 패널 안의 지역 상태다. 탭을 떠나면 초기화되며 실제 원고, 저장 데이터, 담당자와 작업공간을 바꾸지 않는다.
- 기존 독립 온보딩 컴포넌트는 직무별 작업분담을 미리 보여 주고 자체 프로필 저장 계약을 유지한다. 현재 설정 화면에 중복 프로필 편집기를 새로 마운트하지 않으며 해당 컴포넌트의 검증은 단위 범위로 구분한다.
- 공개 진입점은 `/settings/role?tab=workspace`의 **분업 계획·만화 프리셋 펼치기**다. 사용자 의도 시점에만 도구 청크를 불러오며 계획·만화 예제 탭을 전환할 수 있다. 경쟁사 참고 패널은 직군과 검색어를 함께 필터링하고, 선택은 기존 `/studio/canvas?roleWorkspace=<검증한 배치 ID>`로 정상 이동한다. 실제 메뉴와 참고 패널은 검색 별칭을 공유한다.
- Mangaka의 장르 프리셋은 스타일·포털·폭·여백·글자 크기를 바꾸어 **패널 안의 스트립 계산**을 갱신한다. 포털 참조 너비는 로컬 `MANGAKA_PORTAL_SPECS`에서 읽으며 현재 외부 포털 제출 규격의 보증이 아니다. 기존 계산 엔진은 800px 정규화 캔버스를 사용하므로 포털 선택만으로 계산 캔버스의 너비를 바꾸거나 출고 파일을 생성하지 않는다.
- 로어북은 샘플 대본 참조이고 무빙툰 트리거는 계획 선택이다. 외부 로어북 동기화, Rive·Spine·Live2D 연결, 실제 원고·카메라·내보내기 효과 적용은 실행하지 않는다.
- BG3D 렌즈는 스타일·태그·카메라·태양광 설정 프리셋이다. 장면 배치와 카메라 변경은 기존 명시적 적용 버튼을 사용한다. 삽입 콜백이 `false`를 반환하면 성공으로 표시하지 않는다. 편집 권한, 동선 잠금, AO 또는 Grease Pencil 통합을 새로 수행하지 않는다.

### 4.3 후속 통합 대상 (`target`)

실제 문서 레이어 권한, 서버 담당자 인계·승인·영속성, 외부 로어북과 무빙툰 렌더 연결은 별도의 권한·저장·동시 편집 계약 검토가 필요한 후속 범위다. 이 변경은 해당 경로를 미리 활성화하거나 새 권한 정본을 만들지 않는다. 검증 결과는 해당 PR의 정확한 코드 입력과 로컬 영수증에 별도 기록한다.
