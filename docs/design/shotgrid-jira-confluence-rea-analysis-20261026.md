# REA 기반 ShotGrid(샷그리드)·Jira(지라)·Confluence(콘플루언스) 정밀 역공학 분석 및 ToonStudio 고도화 내재화 명세 (2026-10-26)

- **작성일**: `2026-10-26`
- **문서 상태**: `current` (설계 및 클린룸 내재화 기준 문서)
- **관련 문서**:
  - [`docs/design/creco-rea-full-analysis-20261026.md`](./creco-rea-full-analysis-20261026.md)
  - [`docs/design/production-workflows-20260927.md`](./production-workflows-20260927.md)
  - [`docs/design/creco-feature-internalization-20260923.md`](./creco-feature-internalization-20260923.md)

---

## 1. REA 역공학 증거 원장 (Evidence Ledger)

본 분석은 글로벌 VFX·게임·IT 스튜디오에서 초대형 웹툰(노블코믹스 등) 제작 파이프라인으로 이식해 사용하는 **ShotGrid(Autodesk Flow Production Tracking, 구 Shotgun)**, **Atlassian Jira**, **Atlassian Confluence** 3대 협업 플랫폼을 대상으로 REA(Reverse Engineer Anything) MCP 도구 체인(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`, `export_evidence_bundle`)을 실행해 확보한 실측 증거에 기반한다.

| Evidence ID | REA 도구 | 분석 대상 및 산출 요약 |
| --- | --- | --- |
| `ev_8532ca15e68e56d327a31f2349e715f1d2ac57da9a6657299698eb5bd8f0e969` | `capture_browser_scenario` | `https://developer.shotgridsoftware.com/rest-api/` 초기 리다이렉트 체인 및 429개 네트워크 이벤트 캡처 |
| `ev_d74a871fe4bbd4e242167267f94d25abfe474377a634f17a2f8c05b9d14c5030` | `export_web_scripts` | ShotGrid 초기 캡처(`ev_8532ca15...`) 내 10개 정적 스크립트 추출 및 매니페스트 생성 |
| `ev_db808dc14035d7922105a90f7351d30b735cdf6e71d366fde7bafd7bd8f0e969` (`ev_db808dc14035d7922105a90f7351d30b735cdf6e71d366fde7bafd7bd8834c32`) | `capture_browser_scenario` | `https://developers.shotgridsoftware.com/rest-api/` 대용량 전체 예산(DOM + Accessibility + Network Body) 캡처 |
| `ev_71c5547ba8e68500aa4a7b238da62e8696943a1f846a8b883fc50ad606d2c3d2` | `capture_browser_scenario` | `https://developers.shotgridsoftware.com/rest-api/` REST API v1.x 엔티티·필터·S3 멀티파트 업로드·스키마·활동 스트림 명세 캡처 (552,501 bytes A11y 트리, 128개 이벤트) |
| `ev_ea3b61c2269a6507f93a7688f315bea5d88e9415dd8e1e0f337ddda3b5c8a3c3` | `export_web_scripts` | `developers.shotgridsoftware.com/rest-api/javascripts/all.js` (117,722 bytes) 번들 추출 |
| `ev_0f73b3b132670ce1eb1d8fea459203abd70d8c7ef9efd5df32ecb749aca419a8` (요약 `ev_a46cf74f94624b4fb70f89ac19ac8b71004fe81d8e535693936da6404e65105b`) | `analyze_javascript_application` | ShotGrid REST API 프론트엔드 번들(`all.js`) 정적 AST 분석 (39,390 AST 노드, 268개 발견) |
| `ev_9ff8c6fe888fef51fd2332b3893282cea750400a34963ad94b97c19240640c02` | `capture_browser_scenario` | `https://developers.shotgridsoftware.com/python-api/reference.html` 전체 예산 DOM·네트워크 캡처 |
| `ev_e124ccb42e166019e1aa6d433851ac9b752104f2d7aca30abd7bb0acceaf0cc7` | `capture_browser_scenario` | ShotGrid Python API Reference (`Shotgun` CRUD, `Version`, `PublishedFile`, `Note`, `EventLogEntry`, 19종 데이터 타입, 복합 필터 프리셋) 캡처 (248,371 bytes A11y 트리) |
| `ev_da04c35022cc6b08c541042711e29fd10c4ab387ad5ad5f430268f9d9c02caef` | `export_web_scripts` | ShotGrid Python API 문서 앱의 8개 스크립트 번들 추출 |
| `ev_1642467130970f826ed6d664919e1f05247481f997971c68f0261a87c2a7f376` (요약 `ev_1e9f9f54960ed206b947e9f83e7d615d951ec5c9c2b1fd111a4b86e7827ec0f0`) | `analyze_javascript_application` | ShotGrid Python API 스크립트 정적 AST 분석 (8개 파일, 45,896 bytes, 6,020 AST 노드) |
| `ev_df71e25bbaf60089e5bb6e8a4f72708efd99beafc6dc85c3bc6cf88bbfd6d801` | `capture_browser_scenario` | `https://www.atlassian.com/software/jira` 제품 아키텍처 전체 예산 캡처 |
| `ev_f4c216aacff3318fb222f90a147ad9d0956022ea40ce2ae6dd6cd6fbea63a255` | `capture_browser_scenario` | `https://www.atlassian.com/software/jira/features` 핵심 기능(Plan, Track, Collaborate, Automate Workflows, Dependencies) 캡처 (131개 이벤트) |
| `ev_8cd7772d74b9cf4830c1cb2bf3ceb04d607717621ad5ff1db67b758e72f5968b` | `export_web_scripts` | Jira Features 런타임 스크립트 5개 번들 추출 |
| `ev_2fb04946ec5bd0cb2d04f62113d3ae483e56069f8efb60a37c12b07e910c24ce` (요약 `ev_454c4e55a960499979e57e45c87174980bbd9366e1d0b0beff639a7d901d8828`) | `analyze_javascript_application` | Jira Features 번들 정적 AST 분석 (5개 파일, 73,868 bytes, 18,063 AST 노드, 85개 발견) |
| `ev_a5f789f3cfe88069c088dfe51ffdc72f7d79b6ff7621c422061fee2f0246ff3f` | `capture_browser_scenario` | `https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/` Jira Cloud REST API v3 명세(Issues, Workflows, Transitions, Issue Links, Webhooks, Watchers) 캡처 |
| `ev_5d1f514eae94a4cb918ebd157eb793433ac9a85cb6593bb08368cc938c1633af` | `export_web_scripts` | Jira Cloud REST API v3 정적 스크립트 추출 |
| `ev_e8698042f0db7cdc9d77835672d40938fea3fcde07e6b396fad86cb859290abc` (요약 `ev_2bdcbc68eea24d48925b7c54f45e7f498e197b6153a9eeaf723374c8ba6b45f8`) | `analyze_javascript_application` | Jira REST API v3 클라이언트 번들 정적 AST 분석 (4,048 AST 노드) |
| `ev_c43e88172ea59b4d9bae64b2eb3ed27c5828af7c6f6a55baf24a999dee6b4636` | `capture_browser_scenario` | `https://www.atlassian.com/software/confluence` 제품 아키텍처 전체 예산 캡처 |
| `ev_379bcdcb9c518af45e9692e409839eed2fcc0a13b3d9c3e68257d7822692b85a` | `capture_browser_scenario` | `https://www.atlassian.com/software/confluence/features` 기능(Spaces, Structured Content Tree, Macros, Page Versioning, Whiteboards) 캡처 (175개 이벤트) |
| `ev_ede9af46525dafb3a596d8d63c2c062e90fef1635e959c633ad67c6793784e44` | `export_web_scripts` | Confluence Features 런타임 스크립트 6개 번들 추출 |
| `ev_4c542cb371b54f79b5fee564d0ba1e5612c18516c0aeb79cc27e9609904f2d72` (요약 `ev_8586945c871c74dfd3e3a9376979e988314439668891577ea940d83b1f65394b`) | `analyze_javascript_application` | Confluence Features 번들 정적 AST 분석 (6개 파일, 26,889 bytes, 5,555 AST 노드, 16개 발견) |
| `ev_1e52f0b2674ed7d2fb482905e6a4453d5dbf848fa5265e0af68b7719eaaff405` | `capture_browser_scenario` | `https://developer.atlassian.com/cloud/confluence/rest/v2/intro/` Confluence REST API v2(Page, Space, Version, Comment, Smart Link, Label, Ancestors/Children) 캡처 |
| `ev_741938ab8f7be9b6345fd39ac21912d3e2e9d19258ee53e7f15d506664c7c4db` (요약 `ev_928aaf510fad5473d7d6193c07895f9be6973a5eb4391fa160b41868049d3454`) | `analyze_javascript_application` | Confluence REST API v2 번들 정적 AST 분석 (4,048 AST 노드) |

---

## 2. 플랫폼별 역공학 아키텍처 분석 및 웹툰 스튜디오 도메인 매핑

### 2.1 ShotGrid (Autodesk Flow Production Tracking — 구 Shotgun) 역공학 분석 (`ev_71c5547b...`, `ev_e124ccb4...`)

할리우드 VFX 및 트리플A 3D 게임 스튜디오의 표준 파이프라인 관리 도구인 ShotGrid는 최근 노블코믹스(예: 『화산귀환』 등 대규모 각색·분업 웹툰) 제작사에서 **원고의 수정 전(Before) ↔ 수정 후(After) 히스토리 추적 및 에셋 의존성 관리** 용도로 도입되고 있다.

1. **엔티티 관계 스키마 (`Entity Record` & `Hierarchy Expand`)**:
   - **VFX 원형 계층**: `Project` → `Sequence` → `Shot` / `Asset` → `Step` (Pipeline Step) → `Task` → `Version` (리뷰용 미디어) ↔ `PublishedFile` (실제 작업 원본 파일) ↔ `Note` / `Reply` (검수 피드백) ↔ `Playlist` (데일리 검수 목록).
   - **웹툰(노블코믹스) 스튜디오 매핑**:
     - `Sequence` → **회차(`Episode`, 예: 48화)**
     - `Shot` → **컷 구간 또는 개별 컷(`Cut / Panel`, `sg_cut_in`, `sg_cut_out`, `sg_cut_order`)**
     - `Asset` → **캐릭터 모델 시트·3D 배경(`.skp`/`.blend`)·무공 이펙트 브러시·소품**
     - `Step` → **웹툰 7대 표준 공정**: `콘티(Storyboard)` → `선화(LineArt)` → `밑색(BaseColor)` → `명암·채색(Shading)` → `배경·3D(Background3D)` → `후보정·이펙트(LightingFX)` → `식자·최종(Typesetting)`
2. **세계 최고 수준의 이미지/미디어 버전 히스토리(`Version`) 및 수정 전/후(`Before / After`) 계보 추적**:
   - 모든 `Version`(`v001`, `v002`, `v003`...)은 불변(Immutable) 스냅샷으로 생성되며, `parentVersionId`를 통해 **수정 전 버전(`Before`)과 수정 후 버전(`After`)의 인과 계보(Lineage Chain)**를 100% 보존한다.
   - **Screening Room / RV 비교 모드**:
     - `Side-by-Side (나란히 비교)`, `A/B Wipe (와이프 분할선 비교)`, `Onion Skin (어니언 스킨 투명도 중첩)`, `Difference Matte (픽셀 변경 영역 ΔE 색차 하이라이트)` 4종 모드를 지원한다.
   - **리테이크 노트(`Note`) ↔ 픽셀 변경 영역(`CutChangeRegion`) 자동 교차 검증**:
     - 메인 PD가 `v002`의 특정 컷(예: 14컷 매화검기 광원, 27컷 도복 명암)에 남긴 리테이크 노트(`triggeredByNoteId`)가 후속 버전 `v003`에서 실제로 해당 컷 영역의 픽셀 해시·색차(`ΔE`) 변경을 수반했는지 자동 대조하여 `검증 완료(Verified)` vs `미반영 의심(Unverified)`을 판별한다.
3. **`Version`과 `PublishedFile`의 이원화 및 업스트림/다운스트림 의존성 그래프**:
   - `Version`은 PD 검수용 프리뷰 이미지(PNG/JPG/WebP)이고, `PublishedFile`은 `.clip`, `.psd`, `.skp`, `.vrm` 등 실제 레이어·3D 원본이다.
   - `PublishedFile`은 `upstream_published_files` 배열로 상위 공정 파일을 참조한다. 예를 들어 `선화(.clip) v002`가 `v003`으로 재발행되면, `v002`를 참조해 작업 중이던 `밑색(.psd)`과 `후보정(.psd)` 파일이 자동으로 **`상위 버전 변경됨(Upstream Outdated)`** 경고를 표시한다.
4. **ShotGrid 상태 단축코드(`status_list`)**:
   - `wtg` (Waiting to Start / 대기), `rdy` (Ready to Start / 준비 완료), `ip` (In Progress / 작업 중), `rev` (Pending Review / PD 검수 대기), `fix` (Needs Fix / 리테이크 요청), `cda` (Conditional Approval / 조건부 승인), `apr` (Approved / 승인 완료), `fin` (Final / 최종 마감).

---

### 2.2 Atlassian Jira & Confluence 역공학 분석 (`ev_a5f789f3...`, `ev_f4c216aa...`, `ev_1e52f0b2...`, `ev_379bcdcb...`)

글로벌 IT·게임 업계의 표준 애자일 티켓 시스템인 **Jira**와 문서 지식베이스인 **Confluence**는 웹툰 스튜디오에서 **메인 PD의 일감 티켓 발행 → 작업자의 자율 Pull(가져가기) → 작업 완료 시 담당 PD에게 자동 검수 알림 전송 → 설정집·컬러 가이드 실시간 양방향 연결** 파이프라인으로 사용된다.

1. **Jira 웹툰 일감 티켓 스키마 및 Pull 기반 자율 배정(`Claim & Start`)**:
   - **티켓 키 체계**: `<작품 약어>-<회차+일련번호>` (예: `HSGH-4801` `'화산귀환 48화 선화 요청'`, `HSGH-4802` `'화산귀환 48화 채색 요청'`, `HSGH-4803` `'화산귀환 48화 후보정·식자 요청'`).
   - **5단계 웹툰 애자일 워크플로 상태 머신**:
     1. `READY_FOR_PULL` (`일감 대기열 / 발행됨`): 메인 PD가 일감 티켓을 발행한 상태.
     2. `IN_PROGRESS` (`가져감 / 작업 중`): 채색 담당자가 대기열에서 **`일감 가져가기 (Claim & Start)`**를 실행하면 본인이 담당자(`assignee`)로 자동 지정되고 작업 시작 시각(`claimedAt`)이 기록됨.
     3. `PENDING_PD_REVIEW` (`작업 완료 / PD 검수 대기`): 담당자가 ShotGrid 버전(예: `v003`)을 첨부하고 **`작업 완료 및 검수 요청`**을 누른 상태.
     4. `RETAKE_REQUESTED` (`리테이크 요청`): 담당 PD가 수정 전/후 비교 후 반려 사유와 함께 재작업을 요청한 상태.
     5. `PD_APPROVED` (`PD 최종 승인 / 마감`): 담당 PD가 검수를 승인한 상태.
2. **작업 완료 시 담당 PD 자동 검수 알림 및 후속 공정 블로커(`blocks`) 자동 해제 엔진**:
   - **자동 검수 알림 규칙 (`When Issue Transitioned to PENDING_PD_REVIEW`)**:
     - 채색 담당자가 티켓을 `PENDING_PD_REVIEW`로 전환하는 즉시, 티켓 발행자인 **담당 메인 PD(`reporterPdId`)에게 인앱 알림 + 웹 푸시 + 웹훅 채널로 자동 검수 요청 알림(`PdReviewAutoNotification`)**이 발행된다(첨부된 ShotGrid 버전 코드 및 변경 컷 요약 포함).
   - **선행·후행 공정 의존성 (`blockedByIssueKeys` ↔ `blocksIssueKeys`)**:
     - 예: `HSGH-4801 (선화 요청)`이 `PD_APPROVED`가 되기 전에는 후속 공정인 `HSGH-4802 (채색 요청)`이 `선행 공정 대기(Blocked)` 배지를 표시하며, 선화 티켓이 승인되는 순간 채색 티켓의 블로커가 자동 해제되어 채색 담당자가 즉시 가져갈 수 있다.
3. **Confluence 지식베이스 & 양방향 스마트 링크(`Smart Link Macro`)**:
   - Confluence REST API v2의 `Space`, `Page`, `Version`, `Smart Link`, `Inline Comment` 구조를 웹툰 스튜디오 맞춤형 **설정집·컬러 스크립트 지식베이스**로 내재화한다.
   - **티켓 ↔ 설정 문서 양방향 바인딩**:
     - 메인 PD가 `'화산귀환 48화 채색 요청'` 티켓을 발행할 때 Confluence 페이지(`청명 매화검기 & 화산파 도복 표준 컬러 시트 v4`, `48화 야간 객잔 조명 컬러 스크립트 v2`)를 연결하면, 채색 담당자는 티켓 카드 안에서 곧바로 **표준 HEX 컬러 스와치, 채색 금지/필수 규칙, 문서 버전**을 열람할 수 있다.
     - 작업 도중 설정 문서가 새 버전(예: `v4 → v5`)으로 업데이트되면, 해당 문서를 참조 중인 모든 `IN_PROGRESS` 티켓에 **`설정집 업데이트됨 — 최신 기준본 확인 필요(Spec Outdated)`** 배지가 자동 점등되며, 작업자가 변경점을 확인·동기화할 수 있다.

---

## 3. ToonStudio 클린룸 내재화 매핑 (Clean-Room Implementation Mapping)

| 외부 전문 협업 툴 핵심 역량 | ToonStudio 내재화 모듈 및 표면 | 구현 및 고도화 세부 내용 |
| --- | --- | --- |
| **ShotGrid 버전 계보(`v001→v002→v003`), 수정 전(Before)/수정 후(After) 컷별 변경 영역(`ΔE` 색차·변경 픽셀 비율) 비교, 4종 Screening Room 뷰어 모드(`나란히`/`A/B 와이프`/`어니언 스킨`/`픽셀 변경 매트`), 리테이크 노트 반영 자동 검증** | [`production-shotgrid-version-lineage-model.ts`](../../apps/web/src/domains/creator/production-hub/production-shotgrid-version-lineage-model.ts), [`ProductionShotGridVersionLineageSuite.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionShotGridVersionLineageSuite.tsx), [`CompareReviewRoom.tsx`](../../apps/web/src/domains/creator/production-hub/CompareReviewRoom.tsx), [`ProductionManuscriptSnapshotPanel.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionManuscriptSnapshotPanel.tsx) | 수정 전/수정 후 버전 선택기, 4종 비교 렌즈, 컷별 변경 바운딩 박스·색차(`ΔE`)·바이트 해시 대조표, PD 리테이크 노트가 후속 버전에서 실제 수정되었는지 자동 판별(`검증됨`/`미반영`), ShotGrid 8단계 상태(`wtg`~`fin`) 전이 및 신규 버전 등록 |
| **ShotGrid `PublishedFile` 원본 에셋(`.clip`/`.psd`/`.skp`/`.vrm`) 업스트림·다운스트림 의존성 트리 및 상위 버전 변경 영향 추적** | [`production-shotgrid-version-lineage-model.ts`](../../apps/web/src/domains/creator/production-hub/production-shotgrid-version-lineage-model.ts), [`ProductionShotGridVersionLineageSuite.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionShotGridVersionLineageSuite.tsx) | 선화 `.clip` 등 상위 공정 원본 파일이 새 버전으로 갱신될 때 이를 참조하는 하위 밑색·채색·후보정 `.psd` 파일들의 `상위 파일 변경됨(Upstream Outdated)` 영향도를 DAG 탐색으로 즉시 검출 |
| **Jira 메인 PD 일감 티켓 발행(예: `'화산귀환 48화 채색 요청'`), 담당자 자율 가져가기(`Claim & Start`), 작업 완료 시 담당 PD 자동 검수 알림(`PdReviewAutoNotification`), 선행 공정 블로커(`blocks`) 자동 해제 및 JQL 필터** | [`production-jira-confluence-workflow-model.ts`](../../apps/web/src/domains/creator/production-hub/production-jira-confluence-workflow-model.ts), [`ProductionJiraConfluenceWorkflowSuite.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionJiraConfluenceWorkflowSuite.tsx), [`ProductionEpisodeOperationsWorkspace.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionEpisodeOperationsWorkspace.tsx), [`ProductionTeamSurface.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionTeamSurface.tsx) | 메인 PD 티켓 발행 폼, 작업자 원클릭 `일감 가져가기`, ShotGrid 버전 연동 `작업 완료 및 PD 검수 요청`, 완료 즉시 담당 PD 인앱·푸시·웹훅 자동 검수 알림 발행, PD 승인 시 후속 공정 블로커 자동 해제, JQL 스타일 필터 바 |
| **Confluence 설정집·컬러 스크립트 양방향 스마트 링크(`Smart Link Macro`) 및 설정 문서 버전 변경(`Spec Outdated`) 동기화** | [`production-jira-confluence-workflow-model.ts`](../../apps/web/src/domains/creator/production-hub/production-jira-confluence-workflow-model.ts), [`ProductionJiraConfluenceWorkflowSuite.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionJiraConfluenceWorkflowSuite.tsx) | 티켓 내 Confluence 설정 문서(표준 HEX 컬러 스와치, 연출 수칙, 문서 버전) 실시간 임베드, 설정 문서 개정(`vN → vN+1`) 시 진행 중 티켓에 설정 변경 경고 표시 및 원클릭 기준본 동기화 |
