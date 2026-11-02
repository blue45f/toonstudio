# 전수 경쟁사 REA 역공학 통합 분석 및 세분화 직군·맞춤 메뉴·최소권한 RBAC 고도화 설계서 (2026-11-02)

- **문서 상태**: `current` (2026-11-02 REA 전수 역공학 통합 분석 및 25개 창작 직군·20개 프로덕션 역할·맞춤형 메뉴바·최소권한 RBAC 가드레일 내재화 완료)
- **증거 원장**: [`docs/evidence/rea-comprehensive-competitor-role-ux-20261102.json`](../evidence/rea-comprehensive-competitor-role-ux-20261102.json)
- **연계 원장**:
  - [`docs/evidence/rea-collaboration-division-of-labor-20261027.json`](../evidence/rea-collaboration-division-of-labor-20261027.json)
  - [`docs/evidence/rea-webtoon-ai-assist-15-platforms-20261026.json`](../evidence/rea-webtoon-ai-assist-15-platforms-20261026.json)
  - [`docs/evidence/rea-pms-collaboration-benchmark-20261026.json`](../evidence/rea-pms-collaboration-benchmark-20261026.json)
  - [`docs/evidence/rea-competitor-benchmark-20261026.json`](../evidence/rea-competitor-benchmark-20261026.json)
- **분석 도구**: `rea` (`reverse-engineer-anything` MCP 서버 — `list_browser_targets`, `inspect_web_page`, `capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`)

---

## 1. 목적 및 배경

웹툰·디지털 만화·스토리텔링 스튜디오 생태계는 1인 창작자부터 10~30인 규모의 분업 스튜디오까지 폭넓은 협업 스펙트럼을 갖는다. 특히 실제 현업에서는 단순히 "어시스턴트" 또는 "작가"로 뭉뚱그리지 않고 다음과 같이 직군과 권한이 정교하게 세분화된다.

1. **집필·서사·콘티 직군 세분화**:
   - **원작·메인 글작가(`story` / `writer`)**: 세계관 바이블(Canon), 시즌 플롯, 캐릭터 아크, 대사 최종 확정 권한 보유
   - **각색·콘티 대본 작가(`adaptation` / `adaptation-writer`)**: 웹소설·원작 서사를 웹툰 호흡과 컷/연출 대본으로 각색·재구성
   - **보조 글작가·자료조사(`associate-writer`)**: 시대·전문직 고증 자료조사, 서브 에피소드 초안, 배경 인물 대사 초안 및 설정집 레퍼런스 정리 (세계관 바이블 직접 덮어쓰기 대신 제안 권한)
   - **그림콘티·연출 작가(`storyboard` / `storyboard-artist`)**: 세로 스크롤 시선 유도, 컷 분할, 카메라 앵글·연출 설계
2. **작화·채색·배경·후보정·식자 전문 어시스턴트 세분화**:
   - **보조 그림작가·데생(`associate-artist`)**: 메인 작화가의 그림체 유지 하에 서브 캐릭터 데생·러프 브레이크다운·의상/소품 작화 보강
   - **선화·펜터치 어시스턴트(`line-assistant`)**: 러프/콘티 위 펜터치, 벡터 선 정리, 선 두께·외곽선 클린업 전담 (`sketch`, `line`, `ink` 레이어 그룹 한정 쓰기)
   - **밑색 어시스턴트(`flat-color-assistant`)**: 폐쇄 영역 채우기, 부위별 레이어 색상 분리(색분할), 지정 캐릭터 팔레트 매핑 전담 (`undercolor`, `flat` 레이어 그룹 한정 쓰기)
   - **명암·채색 어시스턴트(`shading-assistant`)**: 셀식·브러시 명암, 재질 하이라이트, 피부·의상 볼륨 렌더링 (`shading`, `color`, `lighting` 레이어 그룹 한정 쓰기)
   - **배경·3D 어시스턴트(`background-assistant`)**: 3D 씬 배치, 카메라 투시 정렬, LT 은선 추출 및 배경 동화 합성 (`background`, `3d`, `prop` 레이어 그룹 한정 쓰기)
   - **후보정·이펙트 어시스턴트(`effect-assistant`)**: 집중선·속도선·오라·마법 이펙트, 색수차·블룸·그라데이션 맵 후보정 (`effect`, `tone`, `retouch` 레이어 그룹 한정 쓰기)
   - **식자·효과음 어시스턴트(`lettering-assistant`)**: 말풍선 식자 배치, 타이포그래피 스타일, 효과음(SFX) 레터링 및 다국어 식자 치환 (`balloon`, `text`, `sfx` 레이어 그룹 한정 쓰기)

본 설계서는 경쟁 제품들의 직군별 워크스페이스·메뉴·권한 구조를 `rea`로 전수 역공학한 관찰 사실(Observed Facts)을 바탕으로, ToonStudio의 **직군 세분화**, **직군 특화 메뉴바·워크스페이스 자동 최적화**, **최소권한(Least-Privilege) RBAC 및 레이어/컷 범위 가드레일**, **UI/UX 통일성**을 일관되게 내재화·고도화한 아키텍처를 정의한다.

---

## 2. REA 역공학 증거 요약 (Observed Facts / Inferences / Unknowns)

### 2.1 2026-11-02 라이브 CDP (`http://127.0.0.1:9223`) REA 캡처 증거

| 대상 서비스 | URL | REA Evidence ID (`inspect_web_page`) | 관찰된 A11y / 스크립트 / 스토리지 메트릭 | 핵심 역공학 관찰 사실 (Observed Facts) |
| --- | --- | --- | --- | --- |
| **Clip Studio Paint EX / PRO** | `https://www.clipstudio.net/en/functions/` | `ev_68c2adf355106848f099fefe77ba6e991535ec1c581740f26ee41243d357c0f9` | A11y 노드 1,274개, 스크립트 28개, LocalStorage 15키 (21,293 B), SessionStorage 6키 | 코믹·웹툰 제작 기능을 콘티/컷선, 벡터 선화, 틈새 닫기 밑색 채우기(Close and Fill), 자동 음영(Shading Assist), 3D 포즈/배경 LT 변환, 말풍선/스토리 에디터, 멀티페이지 Teamwork 분업으로 명확히 분리하여 공정별 도구 팔레트 전환을 제공함. |
| **CGWire Kitsu** | `https://www.cg-wire.com/kitsu/` | `ev_8213b75228375857009ed2a9b36da2ba9595072f4c8a17dbd3c30fe0daabf2f3` | A11y 노드 544개, 스크립트 11개 | 스튜디오 파이프라인을 세부 공정(Task Type: Storyboard, Layout, Line, Color, BG, FX, Compositing)별로 분리하고, 작업자(Artist/Assistant)는 자신에게 할당된 샷/컷 큐만 편집하며 감독/리드(Supervisor)의 승인 없이는 후속 공정으로 확정 전이할 수 없도록 통제함. |
| **Celtx** | `https://www.celtx.com/` | `ev_d59b92495272d5ac27e3b6f44a95b4b606cadb49aa43c568d4016b81b9d02776` | A11y 노드 415개, 스크립트 3개, LocalStorage 10키 (`gbFeaturesCache` 등) | 시나리오 집필(Scriptwriting), 스토리보드/비트시트(Adaptation/Storyboard), 프로덕션 카탈로그(Breakdown)를 역할별로 분리하고, 보조 집필자/리서처가 원고 본문을 직접 파손하지 않도록 리비전 모드와 코멘트/제안 모드를 구분함. |
| **Milanote** | `https://milanote.com/` | `ev_d35003893d3f2f9fcce8cd4eb23f5910d5de485f66c589357ff7e2c9ffc27d63` | A11y 노드 481개, 스크립트 2개, LocalStorage 5키, SessionStorage 7키 | 세계관·자료조사 보드와 시각 레퍼런스 보드를 계층형 서브보드로 구성하여 보조 글작가(리서치)와 보조 그림작가(무드보드·캐릭터 시트)가 시각적 맥락을 유지한 채 협업하도록 설계함. |
| **Figma** | `https://www.figma.com/ko-kr/` | `ev_02066fbf71b534ea69d50acceb6662db472157aeef40ef207f8a70aa16f50a6e` | A11y 노드 961개, 스크립트 108개, IndexedDB `sentry-offline` | Design Mode / Dev Mode / FigJam처럼 직무 렌즈(Role Lens)에 따라 상단 메뉴와 우측 인스펙터의 우선 노출 항목을 즉시 재정렬하되 전체 기능 접근성은 유지하며, 파일/섹션/브랜치 단위로 편집 권한을 격리함. |
| **Campfire Writing** | `https://www.campfirewriting.com/` | `ev_c2603a5fa111d2ab4558b2deff967600663b2d4759ffe566cc26e589897c0121` | A11y 노드 420개, 스크립트 136개, IndexedDB 2개 (3,264 B) | 캐릭터·세계관·타임라인·아크·관계도 모듈을 분리하여 원작 글작가, 각색작가, 보조 글작가가 각각의 모듈 단위로 열람/편집 권한을 다르게 부여받을 수 있도록 구조화함. |

### 2.2 Inferences (역공학 추론 및 ToonStudio 고도화 원칙)

1. **직군 세분화(Role Granularity)와 무손실 기능 접근성(Zero-Hidden-Capability)의 조화**:
   - 현업 분업 스튜디오에서는 `선화 어시`, `밑색 어시`, `명암 어시`, `배경/3D 어시`, `후보정/이펙트 어시`, `식자 어시`, `보조 그림작가`, `보조 글작가`, `각색작가`가 각기 다른 도구와 메뉴를 가장 빈번하게 사용한다.
   - 그러나 특정 직군을 선택했다고 해서 다른 메뉴를 아예 삭제해 버리면 복합 작업 시 불편이 발생한다. 따라서 **상단 메뉴바(`StudioMainMenu`, `StudioMenubarContent`)에서 현재 활성 직군에 핵심적인 메뉴 카테고리와 추천 명령을 최상단·배지로 강조 및 우선 정렬**하고, 원클릭으로 **직군 맞춤 정렬 ↔ 표준 전체 정렬**을 전환할 수 있어야 한다.
2. **최소권한(Least-Privilege) RBAC 프로파일 및 레이어/컷 범위 가드레일**:
   - 어시스턴트나 보조작가를 프로젝트에 배정할 때 수동으로 권한 문자열을 입력하게 하면 과도한 전체 작품(`project`) 쓰기 권한이 부여되거나, 반대로 필요한 레이어 쓰기 권한이 누락되기 쉽다.
   - 따라서 20개 `ProductionRoleType` 각각에 대해 **표준 최소권한 프로파일(`PRODUCTION_ROLE_PERMISSION_PROFILES`)**—기본 Capability 목록, 허용 레이어 그룹(`allowedLayerGroups`), 권장 작업 범위(`recommendedScopeKind`: `project` | `episode` | `scene` | `cut`), 세계관/대본 접근 수준(`canonWriteAccess`: `full` | `propose-only` | `read-only`), 리드 검수 필수 여부(`requiresLeadReview`)—을 정의하고, 원클릭 프리셋 적용과 과권한(Over-Privilege) 실시간 경고 배지를 제공한다.

### 2.3 Explicit Unknowns (명시적 미확정 영역)

- 경쟁사 비공개 엔터프라이즈 테넌트 내부의 DB 스키마 및 사설 인증 토큰 교환 프로토콜은 공개 브라우저 캡처 범위 밖이므로 `unknown`으로 기록하며, ToonStudio 내재화 시에는 `@toonstudio/core` 및 `@toonstudio/contracts`의 결정론적 TypeScript 계약으로 클린룸 구현한다.

---

## 3. 세분화 직군 아키텍처 (25개 CreatorRoleId × 20개 ProductionRoleType)

### 3.1 창작자 직군 (`CreatorRoleId` — 총 25개)

| 분류 | 직군 ID (`CreatorRoleId`) | 한글 명칭 | 핵심 워크스페이스 프리셋 | 주력 메뉴 우선순위 |
| --- | --- | --- | --- | --- |
| **통합·연출** | `creator` | 1인·통합 웹툰 작가 | `general` | 파일, 그리기, 컷·대사, 컬러·후보정, 3D·배경, AI, 협업·검수, 출력 |
| **통합·연출** | `director` | 총괄 연출·아트디렉터 | `review` | 협업·검수, 보기·보조, 컷·대사, 컬러·후보정, AI, 출력 |
| **글·각색·기획** | `story` | 글작가·원작 시나리오 | `story` | 컷·대사, 파일, AI, 협업·검수, 출력 |
| **글·각색·기획** | `adaptation` | 각색·콘티 대본 작가 | `story` | 컷·대사, 보기·보조, AI, 협업·검수, 파일, 출력 |
| **글·각색·기획** | `associate-writer` | 보조 글작가·자료조사 | `story` | 컷·대사, AI, 협업·검수, 파일, 보기·보조 |
| **글·각색·기획** | `storyboard` | 그림콘티·연출 작가 | `storyboard` | 컷·대사, 그리기, 보기·보조, 3D·배경, 협업·검수 |
| **메인 작화·아트** | `character` | 캐릭터 디자이너 | `lineart` | 그리기, 컬러·후보정, 3D·배경, AI, 레이어 |
| **메인 작화·아트** | `associate-artist` | 보조 그림작가·데생 | `lineart` | 그리기, 레이어, 3D·배경, 보기·보조, 협업·검수 |
| **메인 작화·아트** | `line-art` | 메인 선화 작가 | `lineart` | 그리기, 레이어, 선택·변형, 보기·보조, 협업·검수 |
| **메인 작화·아트** | `background` | 메인 배경 작가 | `pose-3d` | 3D·배경, 레이어, 컬러·후보정, 보기·보조, 그리기 |
| **메인 작화·아트** | `color` | 메인 채색·명암 작가 | `coloring` | 컬러·후보정, 레이어, 그리기, 선택·변형, AI |
| **메인 작화·아트** | `lighting` | 조명·후보정 작가 | `coloring` | 컬러·후보정, 레이어, AI, 보기·보조, 출력 |
| **메인 작화·아트** | `lettering` | 메인 식자·타이포 디자이너 | `lettering` | 컷·대사, 레이어, 출력, 협업·검수, AI |
| **메인 작화·아트** | `three-d` | 3D 에셋·포즈 작가 | `pose-3d` | 3D·배경, 보기·보조, 레이어, AI, 출력 |
| **메인 작화·아트** | `motion` | 컷툰·모션 작가 | `general` | 애니메이션, 레이어, 컬러·후보정, 출력, AI |
| **전문 어시스턴트** | `assistant` | 종합 작화 어시스턴트 | `lineart` | 그리기, 레이어, 컬러·후보정, 3D·배경, 협업·검수 |
| **전문 어시스턴트** | `line-assistant` | 선화·펜터치 어시스턴트 | `lineart` | 그리기, 레이어, 선택·변형, 보기·보조, 협업·검수 |
| **전문 어시스턴트** | `flat-color-assistant` | 밑색·색분할 어시스턴트 | `coloring` | 컬러·후보정, 선택·변형, 레이어, 그리기, 협업·검수 |
| **전문 어시스턴트** | `shading-assistant` | 명암·렌더링 어시스턴트 | `coloring` | 컬러·후보정, 그리기, 레이어, AI, 협업·검수 |
| **전문 어시스턴트** | `background-assistant` | 배경·3D 배치 어시스턴트 | `pose-3d` | 3D·배경, 보기·보조, 레이어, 컬러·후보정, 협업·검수 |
| **전문 어시스턴트** | `effect-assistant` | 후보정·이펙트 어시스턴트 | `coloring` | 컬러·후보정, 그리기, 레이어, AI, 출력 |
| **전문 어시스턴트** | `lettering-assistant` | 식자·효과음 어시스턴트 | `lettering` | 컷·대사, 레이어, 보기·보조, 출력, 협업·검수 |
| **제작·편집·교육** | `editor` | 편집자·원고 매니저 | `review` | 협업·검수, 컷·대사, 출력, 보기·보조, 파일 |
| **제작·편집·교육** | `producer` | 프로듀서·제작 PD | `review` | 협업·검수, 파일, 출력, AI, 컷·대사 |
| **제작·편집·교육** | `reviewer` | 품질·식자 검수자 | `review` | 협업·검수, 보기·보조, 출력, 컷·대사, 레이어 |
| **제작·편집·교육** | `educator` | 강사·멘토·아카데미 | `review` | 보기·보조, 협업·검수, 그리기, 컷·대사, 파일 |

*(참고: `CREATOR_ROLE_IDS`는 총 25개 직군으로 구성된다.)*

### 3.2 프로덕션 협업 역할 및 최소권한 RBAC (`ProductionRoleType` — 총 20개)

`packages/core/src/production/role-workflow.ts`의 `PRODUCTION_ROLE_PERMISSION_PROFILES`는 각 역할에 대해 다음 최소권한 정책을 강제·권고한다:

- **글·각색·기획 부서**:
  - `writer` (원작·스토리 작가): `canonWriteAccess: "full"`, 권장 범위 `project`, 기본 권한 `["canon:write", "script:approve", "episode:write"]`
  - `adaptation-writer` (각색·콘티 대본 작가): `canonWriteAccess: "propose-only"`, 권장 범위 `episode`, 기본 권한 `["script:adaptation:write", "cut:dialogue:write", "canon:read"]`
  - `associate-writer` (보조 글작가·자료조사): `canonWriteAccess: "propose-only"`, 권장 범위 `episode`, 리드 검수 필수(`requiresLeadReview: true`), 기본 권한 `["script:draft:write", "canon:research:propose", "reference:write"]`
- **콘티·작화·전문 어시스턴트 부서**:
  - `associate-artist` (보조 그림작가): 권장 범위 `scene`, 허용 레이어 `["sketch", "rough", "line", "character-sub"]`, 리드 검수 필수
  - `line-assistant` (선화 어시스턴트): 권장 범위 `cut`, 허용 레이어 `["sketch", "line", "ink"]`, 리드 검수 필수
  - `flat-color-assistant` (밑색 어시스턴트): 권장 범위 `cut`, 허용 레이어 `["undercolor", "flat", "mask"]`, 리드 검수 필수
  - `shading-assistant` (명암·채색 어시스턴트): 권장 범위 `cut`, 허용 레이어 `["shading", "color", "lighting"]`, 리드 검수 필수
  - `background-assistant` (배경·3D 어시스턴트): 권장 범위 `scene`, 허용 레이어 `["background", "3d", "prop"]`, 리드 검수 필수
  - `effect-assistant` (후보정·이펙트 어시스턴트): 권장 범위 `cut`, 허용 레이어 `["effect", "tone", "retouch"]`, 리드 검수 필수
  - `lettering-assistant` (식자·효과음 어시스턴트): 권장 범위 `episode`, 허용 레이어 `["balloon", "text", "sfx"]`, 리드 검수 필수

`evaluateRoleAssignmentPermissionGuardrails()` 함수는 배정된 역할의 범위(`scope.kind`)나 권한(`capabilities`), 리드 여부(`lead`)가 최소권한 기준을 초과할 때(예: 선화 어시스턴트에게 `cut`/`episode` 대신 `project` 전체 범위가 부여된 경우, 또는 보조 글작가에게 `canon:write` 직접 수정 권한이 부여된 경우) 구체적인 보안/분업 경고를 반환하여 `ProductionCollaborationRoleEditor`, `ProductionScopedWritePanel`, `ProductionTeamSurface`에서 즉시 시각적 경고와 원클릭 최소권한 교정 버튼을 제공한다.
