# 전문 협업 및 웹툰 공정 관리(PMS) 3대 툴 REA 역공학 분석 및 ToonStudio 내재화·고도화 설계서 (2026-10-26)

- **문서 상태**: `current`
- **작성일**: `2026-10-26`
- **대상 영역**: `apps/web/src/domains/creator/production-hub/*`
- **증거 번들 정본**: [`docs/evidence/rea-pms-collaboration-benchmark-20261026.json`](../evidence/rea-pms-collaboration-benchmark-20261026.json)

---

## 1. 목적 및 배경

대형 웹툰 스튜디오와 분업화된 에이전시 프로덕션은 다음 3가지 축의 협업·공정 관리 도구를 병행 사용해 왔다.

1. **오토데스크 샷그리드 (Autodesk ShotGrid / Flow Production Tracking)**: 대형 스튜디오용 고사양 미디어 버전, 업스트림/다운스트림 에셋 퍼블리시 계보(Lineage), 검수 플레이리스트(Screening Room/RV), 파이프라인 스텝 상태 매트릭스 관리
2. **아틀라시안 지라 (Atlassian Jira)**: 에픽·태스크·서브태스크 기반 일감 배정, 회차 스프린트 마감·컷 가중치 용량(Capacity) 밸런싱, 선후행 블로커(`blocks` / `is-blocked-by`) 추적, 조건부 워크플로 자동화 규칙 엔진
3. **노션 (Notion)**: 멀티뷰(캘린더·테이블·보드·타임라인) 콘텐츠 연재·프로모션 캘린더 및 양방향 `Relation`·`Rollup` 기반 작품 설정집(Lore Bible: 캐릭터·배경·소품·세계관 사건 연표·설정 검증 만료 관리) 아카이빙 데이터베이스

본 문서는 `reverse-engineer-anything`(REA) MCP 도구를 사용하여 세 타깃의 런타임 시나리오 캡처·웹 스크립트 추출·정적 AST 분석 증거를 수집하고, `Observed Facts` / `Inferences` / `Unknowns`를 엄격히 분리한 뒤 ToonStudio `production-hub`에 클린룸 내재화·고도화한 아키텍처를 기록한다.

---

## 2. REA 증거 원장 (Evidence Ledger)

| 분석 대상 | 캡처 URL | 브라우저 시나리오 캡처 (`capture_browser_scenario`) | 스크립트 추출 (`export_web_scripts`) | JS AST 정적 분석 (`analyze_javascript_application`) |
| --- | --- | --- | --- | --- |
| **Autodesk ShotGrid** (Flow Production Tracking) | `https://developer.shotgridsoftware.com/` → `https://help.autodesk.com/view/SGDEV/ENU/` | `ev_aff0ee7dd10d3acb861c5ed6469b649109b31cece96fa1591d4fea49d60f00fb` (`sha256: a4aeb304...`, 178 events) | `ev_c05801dbe36a5529fc9ab72c5d2bec7c11edabc46c86714063f0d82989c304bd` (`manifest sha256: e4a37538...`) | `ev_acbbc16f9f1887b1fbfc340c142419b3ce3f3c1a4ca6456f5949cf8a6336e3a9` (`root sha256: 4c9b7e5d...`, 6 files, 225,401B, **59,026 AST nodes**, 225 findings) + 보조 번들 `ev_1642467130970f826ed6d664919e1f05247481f997971c68f0261a87c2a7f376` (8 files, **6,020 AST nodes**) |
| **Atlassian Jira** | `https://www.atlassian.com/ko/software/jira` | `ev_c4090dfee4baf2efd3e915497486fc10947d37d2f2df3b3266cce7819e91ce8c` (`sha256: c205238c...`, 430 events) | `ev_c8bbfe2c2795daff9e0852071fafcaa90ffe31549d125cf8e9c8e7ba73c49de3` (`manifest sha256: cfec7b64...`) | `ev_bc107f283a68f10ebb9e3ad675afe2520f2847a6c0f7bf60a2088f916c8392d1` (`root sha256: a5e5f433...`, 27 files, 594,865B, **140,129 AST nodes**, 483 findings, 458 graph items) + 보조 번들 `ev_2fb04946ec5bd0cb2d04f62113d3ae483e56069f8efb60a37c12b07e910c24ce` (5 files, **18,063 AST nodes**) |
| **Notion** | `https://www.notion.com/ko` | `ev_f813facc074b879c443e6df28b767e06e8e47dd81b1b788521be66eddeaf83ef` (`sha256: cf0ed6f1...`, 552 events) | `ev_964363ea78ff5a1e2fcea569e490d3226bd5fb9d5f23ae35ab61685f8592455c` (`manifest sha256: b43bd02a...`) | `ev_ab3cdc9fe09fcb3feeeb879163117b23b8a00a43002023c12a2501aa53a22b45` (`root sha256: 9e2ac4ea...`, 37 files, 929,244B, **240,903 AST nodes**, 262 findings) + 코어 레코드 스토어 `ev_6722571e7e85be3397fc0b8d583e7de4cb00f34fab4f21dee5b1498cf2804954` (`RecordModel`/`RecordStore`, **174,175 AST nodes**, **3,187 findings**) |

---

## 3. 도구별 역공학 분석 결과 (`Observed Facts` / `Inferences` / `Unknowns`)

### 3.1 오토데스크 샷그리드 (Autodesk ShotGrid / Flow Production Tracking)

#### Observed Facts
- **런타임 및 스크립트 구조** (`ev_aff0ee7dd10d3acb861c5ed6469b649109b31cece96fa1591d4fea49d60f00fb`, `ev_acbbc16f9f1887b1fbfc340c142419b3ce3f3c1a4ca6456f5949cf8a6336e3a9`):
  - `developer.shotgridsoftware.com` 진입 시 Autodesk Flow Production Tracking 개발자 문서 허브(`help.autodesk.com/view/SGDEV/ENU/`)로 연결되며, `bhvPKCEauth.js`(PKCE 인증), `TableOfContents.js`·`Index.js`(스키마 및 엔티티 트리 내비게이션), `athena-core.js`·`common-core.js`(상태/이벤트 버스) 등 6개 핵심 JS 파일(59,026 AST 노드)과 REST/Python 스키마 번들(6,020 AST 노드)이 로드된다.
  - **핵심 도메인 엔티티 계층**:
    - `Project` → `Episode` / `Sequence` → `Shot` (웹툰의 컷/장면) & `Asset` (캐릭터 모델 시트, 3D 배경, 소품) → `Task` (파이프라인 스텝: Layout/콘티, Line/선화, Flat/밑색, Shade/명암, BG3D/배경, Comp/후보정·식자)
    - `Version`: 작업자가 업로드한 검수용 미디어 단위. 고해상도 작업 원본(`path_to_frames` / PSD·CLIP·EXR·PNG)과 스트리밍 프록시(`sg_uploaded_movie` / WebP·MP4), 색공간(sRGB / Display-P3 / ACEScg), 해상도/세로 스크롤 픽셀 범위, 프레임/컷 주석(`Note`)을 보유한다.
    - `PublishedFile`: 업스트림 에셋(예: `북부 대공 성채 3D 세트 v3`, `카엘 기사단 복장 시트 v2`)과 이를 참조하여 렌더링/작화한 다운스트림 컷 `Version` 간의 불변 의존성 계보(Dependency Lineage)를 기록한다.
    - `Playlist` (Screening Room / RV): 데일리즈(Dailies) 검수 회의용 순서화 버전 목록으로, A/B 리비전 비교와 일괄 승인/반려 상태 전이를 수행한다.
  - **파이프라인 상태 코드 (`sg_status_list`)**:
    - `wtg` (Waiting to Start / 선행 대기), `rdy` (Ready to Start / 착수 가능), `ip` (In Progress / 작업 중), `rev` (Pending Review / 검수 대기), `cbb` (Could Be Better / 추가 보완 권고), `apr` (Approved / 승인 완료), `fin` (Final / 최종 마감), `omt` (Omitted / 컷 제외).

#### Inferences (ToonStudio 웹툰 스튜디오 고도화 추론)
- 웹툰 제작 현장에서 가장 빈번한 사고인 **"구버전 3D 배경이나 수정 전 캐릭터 복장 시트를 그대로 대고 그린 컷이 최종 원고에 섞이는 문제"**는 ShotGrid의 `PublishedFile` 업스트림 리비전 핀과 컷 `Version`의 참조 리비전을 비교하는 **Out-of-Date 의존성 감지기**로 완벽히 예방할 수 있다.
- 고사양 원고 파일(수백 MB PSD/CLIP)을 열지 않고도 브라우저에서 즉시 버전 메타데이터(작품 코드, 회차·컷 번호, 버전 리비전, 담당 작가, 색공간, 캔버스 픽셀 규격, 업스트림 에셋 상태)를 오버레이하는 **Burn-in Slate 생성기**와 **Screening Room 플레이리스트 검수기**를 제공하면 총괄 PD의 검수 속도를 비약적으로 높일 수 있다.

#### Unknowns
- Autodesk 엔터프라이즈 클라우드 백엔드의 서버 사이드 FFmpeg/RV 미디어 트랜스코딩 큐 스케줄러 내부 구현은 클라이언트 번들 외부 영역이다.

---

### 3.2 아틀라시안 지라 (Atlassian Jira)

#### Observed Facts
- **런타임 및 스크립트 구조** (`ev_c4090dfee4baf2efd3e915497486fc10947d37d2f2df3b3266cce7819e91ce8c`, `ev_bc107f283a68f10ebb9e3ad675afe2520f2847a6c0f7bf60a2088f916c8392d1`):
  - `jira-software-page.d23c4811.js`, `datasourceTableView.304c0848.js`, `status.8d5bd879.js`, `jira-switcher.07649b19.js`, `create-payload.90824b57.js` 등 27개 JS 번들(594,865 bytes, 140,129 AST 노드, 483 findings)에서 애자일 보드, 백로그/스프린트 계획, 이슈 링크 그래프, 데이터소스 테이블 뷰, 자동화 규칙 빌더 구성을 확인했다.
  - **핵심 도메인 구조**:
    - **3단계 이슈 계층**: `Epic` (회차/시즌 단위 목표) → `Task` / `Story` (공정별·컷 묶음별 일감) → `Sub-task` (개별 컷 수정·말풍선 식자·배경 보정 등 세부 할 일).
    - **이슈 의존성 링크 (`IssueLink`)**: `blocks` / `is-blocked-by` / `relates-to` 방향성 간선을 통해 선행 작업 미완료 시 후행 작업의 착수 가능 여부를 제어한다.
    - **스프린트 용량 및 WIP 제한**: 담당자별 할당 스토리 포인트(Story Points) 합계와 가용 용량(Capacity), 칼럼별 WIP(Work In Progress) 상한선을 대조해 병목을 시각화한다.
    - **워크플로 자동화 (`WHEN` → `IF` → `THEN`)**: 상태 변경·기한 임박·블로커 해제 등 트리거 발생 시 조건식을 평가하여 후속 공정 담당자 자동 배정, 상태 전이, 우선순위 격상을 수행한다.

#### Inferences (ToonStudio 웹툰 스튜디오 고도화 추론)
- 웹툰 스튜디오에서는 단순 컷 개수만 세면 "일상 대화 10컷(10pt)"과 "대규모 공성전 액션 10컷(40pt)"의 작업 부하 차이를 반영하지 못한다. **컷 난이도 가중 포인트(Cut Effort Point: 일반 1pt, 연출 2pt, 고난도 액션/3D 합성 4pt)** 기반의 **작가별 용량 밸런서(Assignee Capacity Load Balancer)**와 **자동 재배정 추천 엔진**을 도입하면 마감 과부하를 정량적으로 해소할 수 있다.
- 선행 공정(예: 콘티 확정, 3D 배경 배치)이 지연될 때 후속 공정(선화, 채색)의 마감 위험도를 자동 승격하는 **크리티컬 패스 & 블로커 전파 계산기**와 **무코드 자동화 규칙 시뮬레이터**를 내장한다.

#### Unknowns
- Atlassian Cloud 서버의 분산 JQL 역색인 엔진 내부 구현은 공개 클라이언트 번들에 포함되지 않는다.

---

### 3.3 노션 (Notion)

#### Observed Facts
- **런타임 및 스크립트 구조** (`ev_f813facc074b879c443e6df28b767e06e8e47dd81b1b788521be66eddeaf83ef`, `ev_ab3cdc9fe09fcb3feeeb879163117b23b8a00a43002023c12a2501aa53a22b45`, `ev_6722571e7e85be3397fc0b8d583e7de4cb00f34fab4f21dee5b1498cf2804954`):
  - 37개 웹 스크립트(929,244 bytes, 240,903 AST 노드) 및 코어 데이터 계층(`RecordModel-b75d072993769b60.js`, `RecordStore-2d8aa62bac747f6d.js`, 174,175 AST 노드, 3,187 findings)을 분석한 결과, 모든 페이지·데이터베이스 행이 통합 `RecordModel` 블록 트리와 스키마 속성(`title`, `select`, `multi_select`, `status`, `person`, `date`, `relation`, `rollup`, `formula`)으로 표현된다.
  - 동일한 컬렉션 데이터셋 위에 `Table`, `Calendar`, `Board`, `Timeline` 등 다중 뷰 프로젝션을 즉석 전환하며, 위키 문서의 신뢰도를 유지하기 위한 **Verification(검증 상태: 검증됨 / 만료 임박 / 만료됨 + 검증 책임자)** 메타데이터와 **데이터베이스 템플릿 인스턴스화**를 지원한다.

#### Inferences (ToonStudio 웹툰 스튜디오 고도화 추론)
- 웹툰 연재 스튜디오에 맞춘 **이중 결합 데이터베이스 아키텍처**:
  1. **콘텐츠 연재·프로모션 멀티뷰 캘린더 (`Content Calendar`)**: 네이버웹툰·카카오페이지·글로벌 번역판 런칭·SNS 프로모션·특별 외전 일정을 `캘린더` / `테이블` / `보드` / `타임라인` 뷰로 전환하고, 세이브 원고 버퍼(Save Manuscript Buffer) 임계치와 D-Day 경고를 자동 계산한다.
  2. **관계형 작품 설정집 아카이브 (`Lore Bible Database`)**: `캐릭터(Character)`, `배경·장소(Location/3D Set)`, `핵심 소품·무기(Prop/Artifact)`, `세계관 사건 연표(Timeline Event)` 레코드를 회차 캘린더와 양방향 `Relation`으로 묶고, `Rollup` 엔진이 **등장 회차 수, 첫 등장/최근 등장 회차, 미해결 설정 충돌(Continuity Warning), 위키 설정 검증 만료 상태**를 실시간으로 집계한다.

#### Unknowns
- Notion 백엔드의 SQLite/PostgreSQL 샤드 간 실시간 트랜잭션 브로커 세부는 서버 사이드 전용이다.

---

## 4. ToonStudio 클린룸 내재화 매핑표

| 외부 툴 및 역공학 핵심 기법 | ToonStudio 내재화 도메인 모델 (`.ts`) | ToonStudio 내재화 UI 스위트 (`.tsx`) | 연결된 Production Hub 워크스페이스 |
| --- | --- | --- | --- |
| **Autodesk ShotGrid**: 엔티티 계층(`Shot/Cut`·`Asset`·`Task`·`Version`·`PublishedFile`), 8단계 파이프라인 상태 매트릭스(`wtg`~`fin`), 업스트림 구버전 에셋 참조 감지(Out-of-Date Lineage), Burn-in Slate & Screening Room 플레이리스트 | `apps/web/src/domains/creator/production-hub/production-shotgrid-version-lineage-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionShotGridVersionLineageSuite.tsx` | `ProductionManuscriptSnapshotPanel.tsx` / `CompareReviewRoom.tsx` |
| **Atlassian Jira**: 에픽→태스크→서브태스크 계층, `blocks`/`is-blocked-by` 블로커 전파 및 크리티컬 패스, 컷 난이도 가중치 기반 작가 용량(Capacity) 밸런서, WIP 병목 감지, `WHEN-IF-THEN` 스마트 자동화 규칙 엔진 | `apps/web/src/domains/creator/production-hub/production-jira-agile-workflow-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionJiraAgileWorkflowSuite.tsx` | `ProductionActivityWorkspace.tsx` |
| **Notion**: 멀티뷰(`calendar`/`table`/`board`/`timeline`) 연재·프로모션 캘린더, 양방향 `Relation` & `Rollup` 기반 작품 설정집(Lore Bible: 캐릭터·배경·소품·연표), 설정 검증 만료(`verified`/`expiring_soon`/`expired`) 추적, 원클릭 설정 템플릿 생성 | `apps/web/src/domains/creator/production-hub/production-notion-knowledge-calendar-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionNotionKnowledgeCalendarSuite.tsx` | `ProductionScheduleWorkspace.tsx` |
