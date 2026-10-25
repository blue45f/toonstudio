# REA 기반 범용 웹툰 관리 및 데이터베이스 툴(노션 · 구글 워크스페이스) 역공학 분석 및 ToonStudio 내재화 명세 (2026-10-26)

- **작성일**: `2026-10-26`
- **문서 상태**: `current` (설계 및 클린룸 내재화 기준 문서)
- **관련 문서**:
  - [`docs/evidence/rea-notion-google-workspace-20261026.json`](../evidence/rea-notion-google-workspace-20261026.json)
  - [`docs/design/creco-rea-full-analysis-20261026.md`](./creco-rea-full-analysis-20261026.md)
  - [`docs/design/production-workflows-20260927.md`](./production-workflows-20260927.md)

---

## 1. 개요 및 목적

초기 구축 비용이 들지 않고 커스터마이징이 자유로워 **1인 작가 + 어시스턴트 구조의 소규모 팀이나 스타트업 웹툰 스튜디오**에서 가장 대중적으로 사용하는 범용 관리 및 데이터베이스 툴인 **노션(Notion)** 과 **구글 워크스페이스(Google Workspace: 스프레드시트 & 구글 드라이브)** 를 REA(Reverse Engineer Anything) MCP 도구 체인으로 정밀 역공학 분석하고, 이를 ToonStudio의 제작 운영 허브(`apps/web/src/domains/creator/production-hub`)에 웹툰 도메인 특화 형태로 클린룸 내재화한다.

### 내재화 4대 핵심 축

1. **노션(Notion) 콘텐츠 캘린더 & 어시스턴트 정산 데이터베이스 (`ProductionNotionContentCalendarSuite`)**:
   - **갤러리 뷰(Gallery View)** 및 **타임라인 뷰(Timeline View)** + **테이블 뷰(Table View)** 멀티 뷰 전환을 통해 각 회차별 마감일, 플랫폼 제출 여부(`미제출` / `검수 대기` / `플랫폼 제출 완료` / `연재 발행`), 고용된 어시스턴트별 정산 금액(컷당 단가 · 회차 정액 · 롤업 합산 `SUM` · 예산 대비 집행률)을 한눈에 관리한다.
2. **노션(Notion) 작품 설정집 · 시놉시스 · 인물 관계도 · 캐릭터 시트 위키 (`ProductionNotionLorebookWikiSuite`)**:
   - 세계관 설정, 회차별 시놉시스, 양방향 대칭 릴레이션(`AssociationRelationStore` / `relation_toggle_inverse_on`) 기반 **인물 관계도 매트릭스**, **캐릭터 시트 이미지 갤러리 카드**, 그리고 여러 회차에서 동일 설정을 실시간 참조하는 **동기화 블록(`SyncedBlock` / `transclusion_reference`)** 및 자동 **역링크(`Backlinks`)** 를 제공한다.
3. **구글 스프레드시트(Google Sheets) 마감 체크리스트 그리드 (`ProductionWorkspaceSheetDriveSuite`)**:
   - 복잡한 설정 없이 엑셀/시트 형태의 공유 표(회차 행 × 공정 열: 콘티 · 선화 · 밑색 · 명암 · 배경 · 식자 · 최종원고)에서 체크박스 한 번으로 마감을 점검하고, 조건부 서식(기한 초과 · 마감 임박 · 100% 완료 하이라이트), 실시간 수식(`COUNTIF` 진행률, `SUMIF` 어시스턴트 정산 합계), 담당자별 필터 뷰(`Filter View`), CSV/TSV 원클릭 내보내기를 지원한다.
4. **구글 드라이브(Google Drive) 원고 공유 폴더 상시 동기화 브리지 (`ProductionWorkspaceSheetDriveSuite`)**:
   - 회차·공정별 표준 원고 공유 폴더 트리(`/작품명/EP01_1화/01_콘티` … `07_최종원고`)를 자동 구성하고, 데스크톱 드라이브 클라이언트 수준의 상시 동기화 상태 머신(`동기화 완료` / `업로드 중` / `오프라인 대기열` / `버전 충돌 감지` 및 원클릭 충돌 해결)과 스프레드시트 체크리스트 셀 ↔ 원고 공유 폴더 간 직접 딥링크를 연결한다.

---

## 2. REA 역공학 증거 원장 (Evidence Ledger)

본 분석은 REA MCP의 `capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`를 통해 수집한 런타임 네트워크 캡처와 정적 번들 AST 분석 결과에 기반한다.

| Evidence ID | REA 도구 | 분석 대상 및 산출 요약 |
| --- | --- | --- |
| `ev_674df22c6921a2fde31d38435f65407096d1dfc59e2a66a27c6cc9e0c93428ac` | `capture_browser_scenario` | `https://www.notion.so/login` → `https://app.notion.com/login` 클라이언트(`23.13.20261025.1736`) 초기 런타임 및 830개 네트워크 청크 캡처 (`scenarioSha256: a05d94fc...`) |
| `ev_a4564f01a1714deb939b8e1ead11b22e4b960355e48af715f9e66fa087bb1ed0` | `capture_browser_scenario` | Notion 전체 스크립트 예산(full-budget, 10.53MB+) 런타임 시나리오 캡처 |
| `ev_08b8ea24f910e5888d9cb67b45c00b8132992036a3a48a5cb2feda35630be4dd` | `export_web_scripts` | Notion 클라이언트 스크립트 추출 (`captureSha256: c8f3a023...`) |
| `ev_0771429aa13ba1e422db4deef0e87f4e3a071f50e5228a2ff65f53bc25066b4a` | `analyze_javascript_application` | Notion 부트스트랩 번들 5개 파일 정적 분석 (`rootSha256: 715fe376...`, 21,426 AST 노드, 597개 발견, 191개 모듈) |
| `ev_a6a2d4aba21dbfd286465527cc4ac72e01db957fa9c249375b610de3aef938df` | `analyze_javascript_application` | Notion 코어 레코드·데이터베이스 번들(`RecordModel-b75d072993769b60.js`, `RecordStore-2d8aa62bac747f6d.js`) 정적 분석 (`rootSha256: eeaf6b04...`, 740,593 bytes, 174,175 AST 노드, 3,187개 발견, 142개 모듈) 및 `UISpacePermissionGroupToken-e2c98736acc18de7.js` (`f03bab53...`, 3,718,386 bytes) 심볼 추출 |
| `ev_0d54aa02530378da943ef2a52b44f250c10a302a1d1562a4cbd92d584d1bf699` | `inspect_analysis_view` | Notion `RecordModel` / `RecordStore` 142개 모듈 페이지 프로젝션 |
| `ev_c8da9620ea35f52260b80dec5cb3f8f1f13b0cfaff9f6f4bcb266e6dc20b0b5d` | `inspect_analysis_view` | Notion `CollectionViewsStore`, `PropertyValueStore`, `QueryStore`, `AssociationRelationStore` 상세 모듈 검사 |
| `ev_f308afe88aa69ed3a37727436a2f476f603c16e3f482d451ef16c410a70d037b` | `inspect_analysis_view` | Notion `Block`, `Page`, `CollectionRecord`, `WikiBlock` 심볼 및 릴레이션 그래프 검사 |
| `ev_8afb274c1900cbede7493e03a665af35daa06b1820566d8f320ada7ba3e5972d` | `capture_browser_scenario` | Google Workspace Sheets (`https://workspace.google.com/intl/ko/products/sheets/`) 시나리오 및 617개 네트워크 이벤트 캡처 (`scenarioSha256: 0ae4e6dc...`) |
| `ev_9231e6f3e9716af3809adeadf917d459f497b6c575fdbb75c096d385833fc6a3` | `export_web_scripts` | Google Workspace Sheets 59개 스크립트 파일 추출 (`manifestSha256: f6632fb2...`) |
| `ev_33b259bba45d9eef6e4676cd76422ce74bb077ee65ebffe2ba605323fa99386d` | `analyze_javascript_application` | Google Workspace Sheets 스크립트 트리 AST 정적 분석 (`rootSha256: 578f0069...`, 50,031 AST 노드, 634개 발견) |
| `ev_4836b46c114e6f543e9ec032b308b6554bf7a0189ba555c69868787ff73e7767` | `capture_browser_scenario` | Google Workspace Drive (`https://workspace.google.com/intl/ko/products/drive/`) 시나리오 및 572개 네트워크 이벤트 캡처 (`scenarioSha256: a16b7be0...`) |
| `ev_8ce72cc3f0545b2a80c6d0e8bb6c2d4f3e5ac077c634e16641d16b17b3ce3f1b` | `export_web_scripts` | Google Workspace Drive 61개 스크립트 파일 추출 |
| `ev_0560c4ddb37293e05f5e8effaa0547b733fd526191a80a0c66ed31a32249b7e9` | `analyze_javascript_application` | Google Workspace Drive 스크립트 트리 AST 정적 분석 (`rootSha256: 70d53d65...`, 57,067 AST 노드, 669개 발견) |

---

## 3. REA 정적·런타임 분석 결과 (Observed Facts / Inferences / Unknowns)

### 3.1 Observed Facts (관찰된 사실)

1. **노션(Notion) 멀티 뷰 데이터베이스 및 콘텐츠 캘린더 아키텍처 (`ev_a6a2d4ab...`, `ev_c8da9620...`)**:
   - **컬렉션·뷰 분리 구조**: 단일 데이터 소스(`SourceCollection`, `CollectionRecord`, `PropertiesStore`, `PropertyValueStore`) 위에 다중 뷰(`CollectionView`, `CollectionViewsStore`, `DatabaseView`, `InlineCollectionView`, `FullPageCollectionView`, `LinkedCollection`)와 쿼리/정렬 스토어(`QueryStore`, `PageSortStore`)가 결합된다.
   - **타임라인 뷰(Timeline View) 제어 오퍼레이션**:
     - `set_timeline_by`, `update_timeline_by`, `update_timeline_by_end`, `toggle_timeline_separate_dates`: 시작일과 마감일 속성을 분리하거나 단일 마감일 기준으로 타임라인 막대를 배치한다.
     - `timeline_toggle_show_table`: 타임라인 좌측에 속성 요약 테이블을 나란히 표시하거나 접는다.
     - `timeline_arrows_by`, `update_dependency_date_shift_mode`, `update_dependency_date_shift_avoid_weekends`: 선후행 회차/공정 의존성 화살표를 표시하고, 일정 이동 시 주말을 피해 후속 마감을 자동 시프트한다.
   - **갤러리 뷰(Gallery View) 카드 레이아웃 제어 오퍼레이션**:
     - `set_cover_format`, `set_cover_size_format`, `set_cover_aspect_format`, `toggle_card_layout_mode`, `toggle_card_property_width`, `gallery_properties`: 카드 커버를 `페이지 콘텐츠`·`페이지 커버(썸네일/캐릭터 시트)`·`없음` 중 선택하고, 카드 위에 노출할 속성(마감일, 플랫폼 제출 상태, 어시스턴트 정산 합계 등)의 표시 순서와 너비를 제어한다.
   - **어시스턴트 정산 롤업(Rollup) 및 수식(Formula) 엔진**:
     - `set_rollup_set_filter`, `formula_edit`, `LRU:KeyValueStore2:formulas_show_structure`, `LRU:formula_editor:formula_assistant_visible`: 릴레이션으로 연결된 하위 작업(어시스턴트 배정 컷/페이지 단가 및 건수)을 롤업하여 `sum`(합계), `average`(평균), `count`(건수), `percent_not_empty`(완료율)로 자동 집계한다.
2. **노션(Notion) 설정집(Wiki/Lorebook) · 인물 관계도 · 동기화 블록 아키텍처 (`ev_a6a2d4ab...`, `ev_f308afe8...`)**:
   - **양방향 인물 관계도(`AssociationRelationStore`)**:
     - `getRecord1Pointer`, `getRecord2Pointer`, `association_relation_symmetric_self_relation_mirroring`, `relation_toggle_inverse_on`, `edge_relations`: 캐릭터 레코드 간 관계(예: 적대, 사제, 혈연, 동료)를 정의할 때 역방향 포인터를 대칭 미러링하여 어느 캐릭터 시트에서든 양방향 관계를 일관되게 조회한다.
   - **역링크(`MentionedBlock` / Backlinks) 및 구조화 블록**:
     - `WikiBlock`, `callout`, `toggle`, `transclusion_container`, `transclusion_reference`: 세계관 핵심 규칙이나 캐릭터 복장/무기 설정을 원본 동기화 블록(`transclusion_container`)으로 정의하면, 개별 회차 시놉시스 문서가 참조 블록(`transclusion_reference`)으로 임베드하여 설정 변경 시 전 회차에 즉시 반영된다.
3. **구글 워크스페이스(Google Sheets & Drive) 마감 체크리스트 및 공유 폴더 동기화 (`ev_8afb274c...`, `ev_33b259bb...`, `ev_4836b46c...`, `ev_0560c4dd...`)**:
   - **스프레드시트 체크리스트 패러다임**:
     - 별도 데이터베이스 스키마 설계 없이 행(회차) × 열(표준 웹툰 공정: 콘티, 선화, 밑색, 명암, 배경, 식자, 최종원고) 격자에서 불리언 체크박스(`TRUE`/`FALSE`)로 마감 여부를 즉시 토글한다.
     - `COUNTIF(B2:H2, TRUE) / 7` 형태의 행별 완료율 수식과 조건부 서식(마감 초과 행 적색 강조, D-2 이내 임박 황색 강조, 100% 완료 녹색 강조), 담당 어시스턴트별 필터 뷰(`Filter View`)를 통해 1인 작가와 어시스턴트가 한 화면에서 진행 상황을 공유한다.
   - **구글 드라이브 원고 공유 폴더 상시 동기화 패러다임**:
     - 회차별·공정별 공유 폴더 경로(`/작품명/EP01_1화/01_콘티` … `07_최종원고`)를 표준화하고, 백그라운드 상시 동기화 에이전트가 로컬 작업 파일(`.clip`, `.psd`, `.png`) 변경을 감지하여 동기화 상태(`SYNCED`, `UPLOADING`, `OFFLINE_QUEUED`, `CONFLICT`)와 리비전 해시를 유지하며 스프레드시트 셀과 폴더 URL을 1:1로 연결한다.

### 3.2 Inferences (분석적 추론)

- 웹툰 소규모 팀이 노션과 구글 스프레드시트·드라이브를 병용하는 이유는 **초기 설정 비용이 0에 가깝고(Zero-Setup)**, **한눈에 들어오는 시각적 멀티 뷰(갤러리/타임라인/체크리스트 표)** 와 **어시스턴트 정산 금액 자동 합산**, **드라이브 폴더 기반 원고 파일 동기화**가 직관적이기 때문이다.
- 그러나 범용 툴을 그대로 쓸 경우 (1) 노션 콘텐츠 캘린더의 회차 상태와 구글 드라이브 원고 폴더가 분리되어 수동으로 링크를 붙여넣어야 하고, (2) 어시스턴트 컷당/정액 정산 수식을 매번 수작업으로 세팅해야 하며, (3) 설정집의 캐릭터 시트·관계도가 실제 회차 콘티/원고 작업실과 단절되는 한계가 발생한다.
- 따라서 ToonStudio 내재화 시에는 **노션의 멀티 뷰(갤러리·타임라인·테이블) + 롤업 정산 엔진 + 양방향 인물 관계도/동기화 블록 위키**와 **구글 시트의 체크박스 마감 표 + 드라이브 원고 공유 폴더 상시 동기화 상태 머신**을 단일 데이터 흐름으로 통합해야 한다.

### 3.3 Unknowns (미확정 사항 및 클린룸 경계)

- 노션 서버 내부의 비공개 Postgres 샤딩 레이아웃 및 Google Drive 전용 네이티브 데스크톱 파일시스템 커널 드라이버(`DriveFS`) 바이너리 구현은 웹 클라이언트 번들 범위를 벗어나므로 `Unknown`으로 분류하며, ToonStudio에서는 웹 표준 클린룸 상태 머신과 순수 TypeScript 도메인 모델로 재구현한다.

---

## 4. ToonStudio 클린룸 내재화 설계 및 매핑

| 외부 범용 툴 영역 | 역공학 핵심 메커니즘 | ToonStudio 내재화 모듈 (`apps/web/src/domains/creator/production-hub/`) |
| --- | --- | --- |
| **노션 콘텐츠 캘린더** (갤러리 뷰 · 타임라인 뷰 · 마감일 · 플랫폼 제출 · 어시스턴트 정산) | `CollectionView`, `set_cover_format`, `timeline_toggle_show_table`, `update_dependency_date_shift_avoid_weekends`, `set_rollup_set_filter`, `formula_edit` | `production-notion-content-calendar-model.ts` + `ProductionNotionContentCalendarSuite.tsx` |
| **노션 작품 설정집 & 시놉시스** (세계관 · 인물 관계도 · 캐릭터 시트 이미지 · 실시간 공유) | `WikiBlock`, `AssociationRelationStore` (`relation_toggle_inverse_on`), `MentionedBlock` 역링크, `callout`/`toggle`, `transclusion_container`/`transclusion_reference` | `production-notion-lorebook-wiki-model.ts` + `ProductionNotionLorebookWikiSuite.tsx` |
| **구글 스프레드시트 마감 체크리스트 & 구글 드라이브 원고 공유 폴더 상시 동기화** | 회차×공정 체크박스 그리드, `COUNTIF`/`SUMIF` 수식, 조건부 서식, 담당자 필터 뷰, CSV/TSV 내보내기, 회차/공정 폴더 트리 자동 생성 및 상시 동기화/충돌 해결 상태 머신 | `production-workspace-sheet-drive-model.ts` + `ProductionWorkspaceSheetDriveSuite.tsx` |

### 4.1 호스트 화면 통합 지점

- [`ProductionEpisodeOperationsWorkspace.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionEpisodeOperationsWorkspace.tsx): 연재·회차 운영실 하단에 **노션형 콘텐츠 캘린더(갤러리/타임라인/정산 롤업)**, **노션형 작품 설정집·시놉시스·인물 관계도 위키**, **구글 시트형 마감 체크리스트 & 드라이브 원고 공유 폴더 상시 동기화 허브**를 탭/아코디언 워크벤치로 통합하여 1인 작가+어시스턴트 팀이 단일 화면에서 모든 마감·정산·설정·원고 폴더를 관리할 수 있도록 한다.
