# 웹툰 스튜디오 블루프린트 및 제작 관리(PMS) 툴 REA 역공학 분석 및 내재화 설계서 (2026-10-26)

- **작성일**: 2026-10-26
- **문서 상태**:
  - `current`: ToonStudio 기존 제작 허브(`apps/web/src/domains/creator/production-hub/`) 및 스튜디오 블루프린트(`apps/web/src/domains/creator/studio-production/`)의 단계·일정·검수 기본 구조, 그리고 본 변경에서 즉시 내재화 완료한 다중 어시스턴트 파일 인계·스마트 역산 캘린더·에셋 캐스팅·쿼터·노션형 다중 뷰 데이터베이스 엔진(`production-pms-blueprint-model.ts`, `ProductionPmsBlueprintSuite.tsx`).
  - `target`: 데스크톱 동기화 에이전트(`apps/desktop-sync-agent`)와 실시간 파일시스템 감시를 결합한 원클릭 `.clip`/`.psd`/`.skp` 레이어 검증 자동화.
  - `migration`: 외부 스프레드시트·노션 템플릿(CSV/Markdown)에서 ToonStudio 블루프린트 DB로의 무손실 양방향 스키마 가져오기.
  - `legacy exception`: 정적 마케팅 번들만 공개된 외부 상용 SaaS의 서버 내부 비공개 DB 스키마는 직접 열람하지 않고, 공개 런타임 캡처·공식 가이드·클라이언트 번들 AST 증거로부터 클린룸(Clean-room) 역산하여 재설계함.

---

## 1. 분석 배경 및 목적

한국 및 글로벌 웹툰 스튜디오에서는 한 회차(통상 60~90컷)를 주간 연재 마주(Deadline) 안에 완성하기 위해 여러 명의 전문 어시스턴트가 분업 협업한다.

- **선화(Lineart) 어시스턴트**: 콘티/러프 스케치를 바탕으로 펜선·벡터 레이어 정리
- **밑색(Flatting) 어시스턴트**: 캐릭터·소품 파츠별 단색 분리 채움 및 클리핑 마스크 구성
- **채색/명암(Shading/Coloring) 어시스턴트**: 셀식/브러시 음영, 광원 투영, 피부·머리카락 묘사
- **배경/3D(Background / SketchUp `.skp` · 클튜 `.cs3o`) 어시스턴트**: 3D 배경 배치, 카메라 앵글 추출(LT 변환), 하늘·소품 합성
- **후보정/식자/이펙트(Retouching / Lettering / FX) 어시스턴트**: 말풍선·대사 식자, 효과음(SFX), 색감 보정(그라데이션 맵·글로우), 세로 스크롤 조각(Slice) 출력

이 과정에서 스튜디오는 **노션(Notion)** 같은 범용 연결형 워크스페이스(위키, 캐릭터 시트, 커스텀 DB 뷰)와 **툰메이트(Toonmate)·크레코(Creco)·CGWire Kitsu·Autodesk Flow Production Tracking(구 ShotGrid)** 같은 전용 제작 관리(PMS) 도구를 결합해 사용한다. 본 문서는 REA MCP 도구(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`)로 수집한 실제 증거(Evidence ID)를 바탕으로 각 도구의 강점과 한계를 역공학하고, 이를 ToonStudio 제작 허브에 내재화한 아키텍처를 기록한다.

---

## 2. REA 역공학 증거 원장 (Evidence Ledger)

| 분석 대상 | REA 도구 | Evidence ID | 관찰 사실 (Observation) |
| --- | --- | --- | --- |
| Toonmate 메인 런타임 (`toonmate.co.kr`) | `capture_browser_scenario` | `ev_cb12eabcb1325bc90afeb594bdbd5e05f127dc20f2e446b64860c834da77f678`, `ev_2d9363e89289c481c63ad9983a537c281d16c04eacc78cd6fa6cb68009265966` | DOM 약 882KB, 접근성 트리 약 14KB 캡처. 카테고리 체계(`웹툰배경`, `웹툰 전용 툴`, `브러쉬`, `소품`, `로판`, `현대물`, `학원/액션`, `동양/시대물`) 및 창작자 도구 네비게이션 구조 확인. |
| Toonmate 에셋·라이선스 구조 (`/all-product?idx=107`) | `capture_browser_scenario` | `ev_438e7f105dde3cb82c9bc87a7825daafc423104e4fcc1da7b209eddeedb55672` | 3D 배경 에셋이 `.skp`(스케치업)와 `.cs3o`(클립스튜디오 3D 소재) 병행 패키지로 유통됨. 라이선스가 **투고용(50% 할인)** 과 **정식 연재 시 추가 이용권**으로 이원화되어 있으며, 생성형 AI 학습·활용 금지 조항이 명시됨. |
| Toonmate 웹툰 전용 맞춤 자동 캘린더 (`/shop_view/?idx=110`) | `capture_browser_scenario` | `ev_f4a6dd7ef88d8d1f5ae94ce7c4c2e367aa161560f6b31dd8bb326ffd9c68c026` | **웹툰 전용 맞춤 자동 캘린더**: 작가별·담당 공정별 소요 시간을 입력하면 연재 마감일 기준으로 전체 세부 공정 일정을 자동 계산하는 스케줄러 모델 확인. |
| Toonmate 웹툰 전용 툴 및 JS 번들 (`/tool`) | `capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view` | `ev_fb5900843ff3affae589a04b687016f9df19435487b8fcd40d5f0434f9b96d45`, `ev_3d7c9c65cbb4e848890b474c56abd477e023a306301deb7063b5ac9d03c2a880`, `ev_aef70a5c452942dd29c66799438f677b353f205a20e0db5e92bbce05ea0888d6`, `ev_ef33bf9b05b22ffa9ad15011f8b2f3c5227b70cdb141e049c6127d771bab7f63` | 74개 스크립트 파일(200,502 AST 노드, 30개 핵심 모듈) 정적 분석. Imweb 기반 `SITE_SHOP` 카탈로그 필터·정렬(`등록순`, `AI 추천순`, `인기순`, `상품평 많은순` 등) 및 구매 옵션 상태 기계를 확인. |
| CGWire Kitsu 플랫폼 개요 및 Production Tracker | `capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application` | `ev_e6fdf5fd54d166c7c91b98c48305360a45dd3ab9bc61ee9653ea0f6393c5056e`, `ev_4a44d725d5235ddee09bbc60424d7e0d8e8e0e2eb56a89067047ca5446764f8c`, `ev_c4fee17d05caceb2a2d293ece31425e43076705d471b23ec0c191c29b960ee0d`, `ev_412e618dcc96ffc1e4567848944c8580689f85be0d55272c0f90b9b464aabefa`, `ev_b5380ac7bd873f73b336bc6c23504ef1fa22b588dbd1ef66d3c2e4435a5dca2a` | 2D/3D 스튜디오 제작 파이프라인의 6대 축(Schedule & Planning, Task Tracking, Review Engine Playlists, Breakdown List, Production Reports/Quotas, Activity Feed) 및 Astro/Vue 기반 13개 번들(37,241 AST 노드) 구조 확인. |
| Kitsu vs Notion/Spreadsheets vs ShotGrid 비교 | `capture_browser_scenario` | `ev_1b334e3ffe91305a1b1d14f498c9a3e0c3cb26278b8e74de442a629a639fb1b3`, `ev_5b7047440994aff522b52ac3ead46f29fd9e94b09179fe335fd8a4886589606d` | 노션/스프레드시트 단독 운영 시 발생하는 **6대 숨은 비용**(코디네이터 수동 정리 시간, 구버전 파일 작업 사고, 에셋-컷 의존성 누락, 피드백 파편화, 신규 어시스턴트 온보딩 지연, 변경 감사 기록 부재)과 ShotGrid 대비 경량 웹 기반 캐스팅·쿼터·플레이리스트 리뷰 우위 확인. |
| Kitsu Status Automation (공정 상태 자동 전이) | `capture_browser_scenario` | `ev_bf59dc7215bffa3cb8278d8636e755be19caa2addb6429ed897c73a0c5effecb` | 선행 공정 상태 변경 시 후속 공정 상태를 자동 갱신하는 규칙 엔진 확인. `Entity Type`(`asset` / `shot`), `Trigger Type`(`status` 변경 vs `ready for` 변경), 그리고 후속 공정으로 **최신 프리뷰 이미지를 자동 복사(`copy the latest preview`)**하는 옵션 및 순환 트리거 주의사항 확인. |
| Kitsu Breakdown & Asset Casting (에셋 캐스팅) | `capture_browser_scenario` | `ev_e377fd67d9aab7ccba78aa405f7535d916d93405fd6fc9594a554bd65b0fbf54` | 에피소드·시퀀스·컷별 필요 에셋(캐릭터, 배경, 소품)을 `+1` / `+10` / `-1` 수량으로 캐스팅하고, `Shift` 다중 선택 일괄 할당, 컷 간 캐스팅 복사·붙여넣기, CSV 가져오기/내보내기, 글로벌 에셋 라이브러리(노란 테두리 배지) 구분을 지원. |
| Kitsu Quotas & Durations over Estimates | `capture_browser_scenario` | `ev_3dc853dbf73f385c84788e01b4fc4d21c0183a4f759ca94dc435b3f25fbef344`, `ev_e3d0b3074a707e838254fb7fa7b766a23780012dad6eb0d66cf7c4f28e232174` | **Quotas**: (1) 타임시트 투입 시간 비중으로 일일 생산량을 가중 배분하는 방식과 (2) 최초 `WIP` 진입 시각부터 최초 `WFA`(검수 대기) 도달 시각까지(피드백 재작업 기간 제외, First-Take 기준) 균등 배분하는 방식 이원화. **Durations vs Estimates**: 예상 공수(`Bid Person-Days`)와 실제 소모 공수(`Days Spent`)의 편차를 공정·담당자별로 비교. |
| Notion Product & Projects (`/ko/product`, `/ko/product/projects`) | `capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view` | `ev_4df18601b8c411e74cd1a2b2fe845f229a34f467dddbfca6205db612be8000b3`, `ev_982b04625f2467912779db4f21e8edc6322f1a769b1f289d521cafaf5fee418d`, `ev_92ba33d8578e87b22bf8830001bc59e38fedc9542881b5bac6af9c2b8fd66f0f`, `ev_137bde95635e926b7fc60dfb7edf6d95b22c8884f3999f862861b4db3088a335`, `ev_89817688cf0a917f3474d65d99480c616aa6e98ecca03bda1c36325728211765`, `ev_f3232ccbef5da5375c0571c359ed613b41e3a88d0d459921be6e1a3ce2ff8a7e` | 37개 Next.js 청크(245,987 AST 노드, 54개 라우트) 분석. 데이터베이스 속성(상태, 담당자, 기한, 우선순위, 종속성, 하위 작업, 롤업/수식), 다중 뷰(테이블, 칸반 보드, 타임라인, 캘린더, 차트), 타임라인 선행 작업 지연 시 후속 일정 자동 시프트, 페이지 소유자/담당자 기반 세분화 권한 규칙, 자동 스프린트 구조를 확인. |

---

## 3. 왜 웹툰 스튜디오는 노션(Notion)과 전용 PMS를 함께 쓰는가? (핵심 역공학 통찰)

### 3.1 노션(Notion)이 제공하는 가치 (`ev_982b04625f...`)
1. **비정형 설정집·인수인계 위키와 정형 작업 DB의 결합**: 캐릭터 컬러 파레트, 브러시 프리셋 가이드, 어시스턴트 주의사항 문서를 회차/컷 DB 행(Row) 안에 바로 중첩할 수 있다.
2. **다중 뷰(Multi-View) 전환**: 같은 원고 데이터를 메인 작가는 `타임라인/캘린더`로, PD는 `테이블(롤업 집계)`로, 어시스턴트는 본인에게 필터링된 `칸반 보드`로 본다.
3. **하위 작업(Sub-items) 및 종속성(Dependencies)**: 회차 아래에 컷 그룹·개별 공정 하위 작업을 두고, 선행 작업이 밀리면 후속 기한을 자동 이동시킨다.

### 3.2 노션·스프레드시트 단독 사용의 6대 한계와 전용 PMS 결합 이유 (`ev_1b334e3ffe...`, `ev_bf59dc7215...`, `ev_f4a6dd7ef8...`)
1. **파일 버전·네이밍 혼선 (Wrong Version Chaos)**:
   - 어시스턴트들이 카카오톡·구글드라이브·노션 첨부파일로 `12화_선화_최종_진짜최종.clip` 형태로 올리면 채색 어시스턴트가 수정 전 구버전 선화 위에 채색하는 대형 사고가 발생한다.
   - **해결**: `{작품코드}_EP{회차}_CUT{컷범위}_{공정코드}_v{버전}.{확장자}` 표준 네이밍 검증기와 공정별 필수 레이어(벡터 선화 분리, 밑색 레이어 폴더 잠금, 3D LT선 분리 등) 인계 체크리스트가 필수다.
2. **공정 간 상태 자동 전이 및 프리뷰 인계 부재 (No Status Automation)**:
   - 선화 어시스턴트가 작업을 완료(`done`)해도 밑색 어시스턴트에게 최신 선화 프리뷰와 함께 `작업 가능(ready)` 신호가 자동으로 넘어가지 않아 PD가 수동으로 알림을 돌린다.
   - **해결**: Kitsu 스타일 `Status Automation`(`status` 트리거 / `ready-for` 트리거 + `copyLatestPreview` 자동 인계 + 순환 참조 차단)을 내장한다.
3. **작가별·공정별 소요 시간 기반 연재 마감 역산 부재 (No Reverse Deadline Calculator)**:
   - 노션 타임라인은 시작일·종료일을 수동 입력해야 하지만, 실제 웹툰 스튜디오는 **연재 업로드 마감일(예: 매주 수요일 22:00)** 로부터 후보정 → 명암 → 밑색 → (선화 ∥ 3D 배경 병렬) 순으로 어시스턴트별 컷당 소요 시간과 휴무일을 반영해 **역산(Backward Scheduling)** 해야 한다(`ev_f4a6dd7ef8...` 툰메이트 맞춤 자동 캘린더 모델).
4. **에셋 브레이크다운·캐스팅 및 상업 라이선스 누락 (Missed Asset-to-Cut Dependencies)**:
   - 특정 컷에 들어갈 3D 배경(`.skp`/`.cs3o`)이나 로판 마차 소품이 아직 미완성이거나 **투고용 50% 할인 라이선스** 상태인데 정식 연재 원고에 그대로 쓰이면 저작권 분쟁이나 작화 중단이 발생한다(`ev_438e7f105d...`, `ev_e377fd67d9...`).
5. **실제 생산량 쿼터(Quotas) 및 예상 대비 실투입 공수(Bid vs Actual) 추적 불가**:
   - 어시스턴트별 일일/주간 목표 컷수(Quota)를 타임시트 기준과 최초 검수 요청(`WIP` → `WFA`, 피드백 왕복 제외) 기준으로 이중 측정하고, 예상 공수(`Bid Days`) 대비 실제 소모 공수(`Actual Days`) 초과율을 계산해야 병목 공정을 조기에 발견할 수 있다(`ev_3dc853dbf7...`, `ev_e3d0b3074a...`).

---

## 4. ToonStudio 클린룸 내재화 아키텍처 (`current`)

위 역공학 결과를 바탕으로 `apps/web/src/domains/creator/production-hub/`에 다음 모듈을 클린룸 설계·구현하였다.

| 모듈 파일 | 역할 및 내재화 기능 |
| --- | --- |
| `production-pms-blueprint-model.ts` | 1. **다중 어시스턴트 파이프라인 & 파일 인계 검증기**: 5대 어시스턴트 역할(`lineart`, `flatting`, `shading`, `background-3d`, `retouch-lettering`), 표준 파일명 파서/생성기/검증기, 레이어 체크리스트, **Kitsu형 Status Automation 엔진**(순환 루프 감지 및 최신 프리뷰 자동 복사 포함)<br>2. **툰메이트형 맞춤 자동 역산 캘린더 & 세이브 원고 버퍼 시뮬레이터**: 연재 마감일·컷수·공정별 병렬/직렬 의존 그래프·주말 제외 정책을 반영한 역산(Backward) 스케줄러 및 다회차 세이브 버퍼 소진 예측 |
| `production-pms-casting-quota-model.ts` | 3. **Kitsu + 툰메이트형 에셋 브레이크다운 캐스팅 & 라이선스 가드**: 컷별 에셋 수량(`+1`/`+10`/`-1`), Shift 범위 일괄 캐스팅, 컷 간 복사/붙여넣기, `.skp`/`.cs3o` 포맷 준비도 및 `투고용 50% 할인` → `정식 연재 라이선스` 미전환 차단 경고, CSV 내보내기<br>4. **Kitsu형 Quotas(타임시트 가중 vs WIP→WFA First-Take) & Bid vs Actual 편차 분석기**: 일일/주간 컷·페이지 쿼터 달성률 및 예상 공수 대비 실투입 공수 초과 진단<br>5. **노션형 연결 데이터베이스 다중 뷰 & 롤업/스프린트 프로젝션**: 테이블·칸반·타임라인·어시스턴트 매트릭스 뷰 프로젝션, 선행 지연 시 후속 작업 자동 날짜 밀기(Cascade), 롤업 진행률 집계 |
| `ProductionPmsBlueprintSuite.tsx`, `ProductionPmsCastingQuotaViewSection.tsx` | 위 5대 엔진을 한 화면에서 탭/컨트롤로 조작·시뮬레이션할 수 있는 대화형 블루프린트 & 제작 관리 워크스페이스 컴포넌트 (`ProductionScheduleWorkspace.tsx`에 통합 연결) |
| `ProductionPmsBlueprintSuite.test.tsx` | 도메인 모델 순수 함수 및 UI 상호작용 전체를 검증하는 Vitest 테스트 스위트 |

---

## 5. 한계 및 향후 과제 (Limitations & Next Steps)

1. **관찰 한계 (`legacy exception`)**:
   - 툰메이트의 유료 구매 전용 상품 첨부파일(시트 원본)과 노션/Kitsu의 비인증 사설 워크스페이스 DB는 공개 웹 캡처 대상이 아니므로, 공식 제품 문서·DOM/접근성 스냅샷·클라이언트 스크립트 AST에서 확인된 스키마와 수식 사양만을 근거로 클린룸 재구현하였다.
2. **향후 고도화 (`target` / `migration`)**:
   - 데스크톱 동기화 에이전트(`apps/desktop-sync-agent`)가 로컬 작업 폴더에서 `.clip`/`.psd` 저장 이벤트를 감지할 때 본 모델의 `validateStudioHandoverFileName` 및 `evaluateStatusAutomationRules`를 자동 호출하도록 연결할 예정이다.
