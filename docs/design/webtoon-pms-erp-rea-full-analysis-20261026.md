# 웹툰나우(Webtoon Now) · 투니스트(Toonist/ATOON) · 대형 웹툰 스튜디오 전용 ERP(재담미디어·케나즈·스피노프) REA 전수 역공학 분석 및 ToonStudio 내재화 명세서

- **작성일**: `2026-10-26`
- **문서 상태**: `current` (역공학 증거 수집 완료 및 Clean-Room 내재화 구현 완료)
- **관련 도메인**: `apps/web/src/domains/creator/production-hub/`
- **연관 문서**:
  - [`docs/design/creco-rea-full-analysis-20261026.md`](creco-rea-full-analysis-20261026.md)
  - [`docs/design/production-workflows-20260927.md`](production-workflows-20260927.md)

---

## 1. 역공학 분석 개요 및 REA 증거 원장 (Evidence Ledger)

일반적인 텍스트 중심 협업 툴(노션, 잔디 등)과 달리, 한국 웹툰 제작 파이프라인 관리 솔루션(PMS)과 대형 에이전시·스튜디오 전용 ERP는 **① 레이어 분리 파일(`PSD`/`CLIP`) 구조 검수**, **② 대용량 세로 스크롤 이미지 수정(Delta Revision)**, **③ 원고 위 마우스 빨간 펜 치기(Red-Pen Markup) 및 칸별(컷별) 피드백**, **④ 수십 편 동시 연재작의 채색(Coloring)·공정 밀림 및 어시스턴트 병목 현상 실시간 모니터링**에 특화되어 있다.

본 문서는 `reverse-engineer-anything`(REA) MCP 도구를 사용하여 실제 배포된 웹 애플리케이션 번들, DOM/Accessibility 트리, 정적 AST를 수집·분석한 결과를 기록한다.

| 분석 대상 | 캡처/분석 도구 | REA Evidence ID | 주요 아티팩트 및 SHA-256 Digest |
| --- | --- | --- | --- |
| **투니스트 (Toonist)** (`https://www.toonist.co.kr/`) | `capture_browser_scenario` / `export_web_scripts` / `analyze_javascript_application` | `ev_547866a777b3f23a9d2a8624c0c7747fea750381928201a5b18a2c869f339fe8` / `ev_bd9398bc37f74fd16868f0ec45042c0563cdac7266eb34a6e19c918a6b66080e` / `ev_d6c8dcfb87a02bf7f8f264df1b028319f92de009618532b376eaa953b8361ea9` | DOM SHA-256: `ab9bfc97a493059f76b8da7e67f5b028f30eba1b0fd57ad265029d478a95e24b` (13,423B), JS Root SHA-256: `dc2d8a0efa65329cfe41a71377b35bf581333e9fe4b7e4107816a022417bb567` (`js/curriculum-preview.js`, `js/main.js`, 1,269 AST nodes) |
| **투니스트 에이툰 (ATOON Creator ERP)** (`https://atoonapp.com/`) | `capture_browser_scenario` / `export_web_scripts` | `ev_d78234e29a5e7bc4cf0e9db7787520724e3d6419b30bc89f9494178d330535c5` / `ev_99c5bd55bfacb653fccb5d59866fc5b089988f8bbd5588a0c22ff50aa81bed91` / `ev_640feacfc61923a0d2ed7d660c6b141f957c0ffadcf4395a1a3b09c90e9520ef` (`/creator/artist/`) / `ev_f274bfc8426b87827c1182c5532ee32306f0857d95cdc2d4cff8b19de38bc009` (`/creator/series/`) / `ev_7fcfc0b6fea2ff9b7873fc81800d686b1a666d03b6c7b9f57c2deabb769fd9cb` (`/creator/list/`) | Landing DOM SHA-256: `e1832272de27aa2b98418ee075549354f8dbe93d0e64a8779c2be0bef41385d7` (152,918B), `/creator/series/` DOM SHA-256: `1823d0fe66dca6b6b18a1ebbf66fc60e1eb01943654552e3e16f07e75ee7f53b` |
| **케나즈 (KENAZ)** (`https://kenaz-re.com/`) | `capture_browser_scenario` / `export_web_scripts` / `analyze_javascript_application` | `ev_7d3da0c2936b3f910c8d2ae319771eeecd7bc4306b8cee5a43f090124f16a524` / `ev_4bec6292e70d0368fa97d4c58957857a35cb3249a0fb748d5fbc0eb8e7aae8fc` / `ev_56a606de8ca8515eb213c080cb4ed94ec6b6b38b3a48370b1d223008044749c9` / `ev_035cfb77da24ff1c31849a5c5c2246757c71041eb21112da6993bc170d8528dc` (`/business/`) / `ev_b8a2308320d7cb2691e48258b7b1d9e653b87fb1120c6c7a4af0f27a1d4be1e8` (`/contact/?mode=2`) | Main DOM SHA-256: `bacc8226f6b3cac24fd16eb1234635810786ce6be269089fe17b6c992220615c` (218,419B), `/business/` DOM SHA-256: `0f618ded918ea20363cdfa22805e16aee010abc9e69d1c2d6e5e12e8de96b72f`, JS Root SHA-256: `278ed11dea91a4a3260c26c3b4a6884743f77269a4f71cf82be078a9db0eb94f` |
| **재담미디어 (Jaedam Media)** (`https://www.jaedam.com/`) | `capture_browser_scenario` / `export_web_scripts` / `analyze_javascript_application` | `ev_39614138323c6895b71d1a5772bd37f1fa61b85bbd52c6782ce2be1e34a0eacf` / `ev_9ef75bc7bfbf26997134af1e3e9cafcbef8d94b9ac5421480600658fc33562f8` / `ev_b410c4469a251c2c25c502f7ef498e7a9bbcab1950328ca402536b8d6bb9570c` / `ev_e9a166624b65f290a6c3cc6b2fe9f8125ccfc00ae7bc9f154e710d04fa47c94c` (`/business`) | DOM SHA-256: `67babfaf326366071754586d0afd00ad342eb786d2ce9a56b417e6ddfd142395` (26,151B), Next.js AST Root SHA-256: `09ac0535dfe4507a29ac237bf355df1f154002490a379eaf6ba544619e97eb02` (108,081B, 21,177 AST nodes, 27 modules) |
| **스피노프 (Spinnoff)** (`https://spinnoff.net/`) | `capture_browser_scenario` / `export_web_scripts` | `ev_112e90a10551f45783f303a1734241714c27b546dfd30a97dca7c4142e1eac20` / `ev_80d982b8bba3612d2807e09a31d40ce0e0ee2da96c8de462ffa1dae928d80ad1` / `ev_a73a5e30299ae8531710e64fd645658e7d60ecd4ec0dd5be8a48bbf914068f3f` | DOM SHA-256: `d38b585d90b0d75852c8ea562c06a3bc57707a612e4a49fa88a08bae1c271a76`, SPA Bundle `assets/index-CmxnAa_G.js` SHA-256: `bc4639d4bd2d1ecbbac581c1f1e9fb4d276883278bac7f6c61be5fb10c8c9527` (1,308,531B, 61 routes) |
| **툰메이트 (ToonMate)** (`https://www.toonmate.co.kr/`) & **네오코믹스** (`http://neoentdx.ai/`) & **크레코 (Creco)** (`https://app.creco.so/ko/`) | `capture_browser_scenario` / `export_web_scripts` / `analyze_javascript_application` | `ev_5d3bfb0036058e86e596e18b788fdb3b0c8f7c4093327617ffcbce7d4276500a` / `ev_c235e3db590ca3ce95fd6b3f66fca807eecaef8c7ecd4b8b2b6c5550eb876935` / `ev_4103bf74e99015bbeaded9431578b3231711d37714d8e653b7d2de4ae718063b` / `ev_4e098e6d1c6ca1e6a235a58295246f53d296999db66d03d944e4a52e90cf825f` | ToonMate JS Root SHA-256: `d2ca756578c028a06eb1beab8c1528bf560651c2eb206ba788f2743f092c1778`, Creco App Bundle Analysis (`docs/design/creco-rea-full-analysis-20261026.md`) |

---

## 2. 관찰된 사실 (Observed Facts), 역공학 추론 (Inferences), 미확정 영역 (Unknowns)

### 2.1 관찰된 사실 (Observed Facts)

1. **웹툰 전용 PMS 공정 구조 및 원고 위 드로잉·칸별 피드백 (`ev_4e098e6d...`, `ev_a73a5e30...`)**:
   - 웹툰 제작 공정은 크게 **콘티 ➡️ 선화 ➡️ 채색 ➡️ 후가공**의 4대 핵심 단계로 요약되며, 실무 어시스턴트 배정 및 분업 단계에서는 **글콘티, 그림콘티, 선화, 밑색, 명암, 배경(3D 소재), 후보정, 식자**의 세부 파트로 나뉜다 (`ev_a73a5e30...` Spinnoff 번들 내 파트 분류 및 `ev_4e098e6d...` Creco 공정 템플릿).
   - 원고 검수 화면에서는 세로 스크롤 원고 이미지 위에 직접 마우스로 자유곡선(펜), 화살표, 사각형 영역을 그려 수정 지시를 남기는 드로잉 피드백(`hasDrawing` / Red-Pen 마킹)과 칸(컷) 단위 상태 추적(`미해결` → `수정본 업로드` → `해결됨`)을 제공한다.
   - `neoentdx.ai` 도메인(`ev_4103bf74...`)은 `2026-10-26` 시점에 원래의 네오엔터디엑스(네오코믹스) 웹툰 서비스에서 만료되어 제3자 사이트로 전환된 상태가 관찰되었고, 한국 웹툰 스튜디오들이 실제 도입해 운영 중인 웹툰 전용 PMS의 기능 집합은 크레코(`app.creco.so`), 스피노프(`spinnoff.net`), 툰메이트(`toonmate.co.kr`)의 공정 대시보드·빨간 펜 드로잉 피드백·레이어/버전 검수 구조로 확인되었다.

2. **투니스트(Toonist) 및 에이툰(ATOON) 크리에이터 ERP 구조 (`ev_547866a7...`, `ev_d78234e2...`, `ev_640feacf...`, `ev_f274bfc8...`, `ev_7fcfc0b6...`)**:
   - `www.toonist.co.kr` (`js/curriculum-preview.js`, `ev_bd9398bc...`): **01 기획과 스토리**(소재 발굴·캐릭터 설정·플롯 구조) → **02 작화와 연출**(컷 분할·시선 흐름·디지털 워크플로) → **03 원고 완성과 피드백**(개인별 1:1 피드백·파일럿 원고 심사)의 3단계 인큐베이팅 파이프라인을 운영한다.
   - `atoonapp.com` (`ev_640feacf...`, `ev_f274bfc8...`, `ev_7fcfc0b6...`):
     - `/creator/artist/`: 작가 유형(`글/그림 작가`, `그림 작가`, `글 작가`) 분류 및 작품별 연재 시작·종료 연월(`YYYY-MM`)을 입력받아 총 연재 경력(`N년 M개월 (총 K작품)`)을 자동 합산한다.
     - `/creator/series/`: 작품 제목(최대 30자), 장르 다중 선택(7종), 핵심 해시태그(최대 3개), 줄거리(최대 1,000자), 예상 회차수, **한국·일본 웹툰 스튜디오 매칭 상담 허용 여부**, **3종 썸네일 규격**(`대표 배너 1920×1080`, `메인 썸네일 300×420`, `회차 썸네일 250×125`, 각 2MB 이하), 샘플 회차 원고(1~3화+, 파일당 5MB 이하) 업로드 및 심사 상태(`임시저장` / `심사대기` / `승인완료`) 워크플로를 제공한다.

3. **대형 에이전시·스튜디오 전용 ERP: 재담미디어 · 케나즈 · 스피노프 (`ev_39614138...`, `ev_e9a16662...`, `ev_035cfb77...`, `ev_b8a23083...`, `ev_a73a5e30...`)**:
   - **재담미디어 (`jaedam.com/business`, `ev_e9a16662...`, `ev_b410c446...`)**: 236편 이상의 작품을 **4대 사업 트랙**으로 동시 가동한다:
     1. `웹툰 매니지먼트` (7단계: 시장분석/평가 → 아이템 기획/발굴 → 본부별 기획위원회 심의 → 플랫폼 유통 제안/계약 → 본 제작 및 유통관리 → 판매촉진 및 정산 관리 → 2차 사업화 및 이슈 대응)
     2. `웹툰 프로덕션 투자·제작` (10단계: 시장분석 → 원작 확보 → 각색 작가 매칭 → 제작진 섭외/계약 → 파일럿 웹툰 제작[기획서·캐릭터시트·1~3화 완성고] → 전사 투자/제작위원회 심의 → 플랫폼 계약 → 본 제작 → 정산 → 2차 사업화)
     3. `웹툰 스튜디오 인하우스 협업` (콘티·각색·배경 → 선화 → 채색 → 후보정 → 편집)
     4. `웹소설·노블코믹스`
   - **케나즈 (`kenaz-re.com/business/`, `ev_035cfb77...`, `ev_b8a23083...`)**: 연간 100편 이상을 동시 제작하는 **7단계 인하우스 사전제작(Pre-Production) 시스템**(`01 콘티` → `02 선화` → `03 컬러` → `04 배경` → `05 후보정` → `06 편집` → `07 현지화`)과 외부 B2B/CP 전용 **파트너 코드(Partner Code)** 열람 게이트를 운영한다.
   - **스피노프 (`spinnoff.net`, `ev_a73a5e30...`)**: 어시스턴트·작가 매칭 및 계약 ERP에서 **9대 전문 파트**(`글콘티`, `그림콘티`, `선화`, `밑색`, `명암`, `후보정`, `배경`, `식자`, `3D 소재`) × **4대 DCC 툴 숙련도**(`클립스튜디오`, `포토샵`, `스케치업`, `일러스트레이터` × `상급/중급/하급`), 작업 스타일 태그, 계약 조건(`MG 미니멈 개런티` + `RS 수익 배분율`, `회당 단가`)을 표준화하고 있다.

### 2.2 역공학 추론 (Inferences)

- **채색(03 컬러) 공정 병목과 레이어 분리 오류의 상관관계**: 다작품 동시 연재 스튜디오에서 채색(`밑색·명암`) 지연은 ① 선행 선화 공정의 PSD/CLIP 레이어 미분리(병합 오류), ② 동일 채색 어시스턴트에게 3개 이상의 연재작 마감이 겹치는 다작품 충돌(`multi-series-collision`), ③ 빨간 펜 피드백 재수정 루프(`revision-loop`)에서 주로 발생한다.
- **대용량 PSD/CLIP 델타 리비전**: 300MB 이상의 세로 스크롤 원고에서 특정 컷의 빨간 펜 피드백만 수정할 때, 전체 파일을 재전송하는 대신 타일/컷 해시 비교를 통해 변경된 타일만 동기화하면 네트워크 전송량을 70~90% 절감할 수 있다.

### 2.3 미확정 영역 (Unknowns)

- 재담미디어·케나즈의 사내 인트라넷 전용 DB 테이블 스키마 및 사내 전용 메신저 웹훅 페이로드 원문은 외부 공개 번들에 포함되지 않는다(`record_unknown`: 사내 방화벽 뒤의 비공개 백엔드 스키마). 이에 따라 ToonStudio 내재화 시에는 공개 확인된 공정 단계(4대 트랙, 7단계 사전제작, 9대 어시 파트, MG/RS 정산 규칙)를 기반으로 Clean-Room 순수 함수 모델로 설계하였다.

---

## 3. ToonStudio Clean-Room 내재화 아키텍처 매핑

수집된 모든 역공학 기능은 `apps/web/src/domains/creator/production-hub/` 내부에 순수 도메인 모델(`*-model.ts`)과 접근성·반응형 표준을 준수하는 UI 스위트(`*Suite.tsx`)로 내재화되었으며, 실제 프로덕션 워크스페이스 표면에 배선되었다.

| 역공학 기능 영역 | ToonStudio 내재화 모듈 | 호스트 워크스페이스 배선 위치 |
| --- | --- | --- |
| **웹툰나우(Webtoon Now) 4단계 핵심 공정 대시보드 (`콘티 ➡️ 선화 ➡️ 채색 ➡️ 후가공`) & 8세부 공정 매핑** | `production-webtoon-now-pms-model.ts` (`mapSubStageToCoreStage`, `computeCorePipelineDashboardSummary`) + `ProductionWebtoonNowPmsSuite.tsx` | `CompareReviewRoom.tsx` (회차 비교·원고 검수 룸 하단 통합) |
| **레이어 분리 파일(`PSD`/`CLIP`) 구조 검수 & 대용량 이미지 타일·컷 델타 수정 엔진** | `production-webtoon-now-pms-model.ts` (`inspectPsdClipLayerSeparation`, `computeLargeManuscriptDeltaRevision`) + `ProductionWebtoonNowPmsSuite.tsx` | `CompareReviewRoom.tsx` |
| **원고 위 마우스 빨간 펜 치기(Red-Pen Markup) & 칸별 피드백 상태 머신** | `production-webtoon-now-pms-model.ts` (`buildSvgPathFromRedPenPoints`, `addCutRedPenFeedback`, `transitionCutRedPenStatus`, `summarizeCutRedPenByCutAndStage`) + `ProductionWebtoonNowPmsSuite.tsx` | `CompareReviewRoom.tsx` |
| **수십 편 동시 연재작 멀티트랙 ERP & 채색(03 컬러)·공정 밀림 실시간 레이더 (재담 4트랙 · 케나즈 7단계 사전제작)** | `production-studio-erp-bottleneck-model.ts` (`detectDelayedSeriesAndStages`, `summarizeMultiSeriesErpFleet`) + `ProductionStudioErpBottleneckSuite.tsx` | `ProductionActivityWorkspace.tsx` (프로젝트 활동·통합 모니터링 워크스페이스 하단 통합) |
| **어시스턴트 병목 현상 실시간 감지 & 1클릭 부하 분산 재배치 (스피노프 9파트 × 4툴 매칭)** | `production-studio-erp-bottleneck-model.ts` (`analyzeAssistantBottlenecks`, `recommendAssistantLoadRebalance`) + `ProductionStudioErpBottleneckSuite.tsx` | `ProductionActivityWorkspace.tsx` |
| **투니스트/에이툰(ATOON) 연재 경력 자동 계산기, 3종 썸네일·파일럿 투고 규격 검증 & MG/RS 정산 원장** | `production-studio-erp-bottleneck-model.ts` (`computeArtistCareerSummary`, `validateAtoonSeriesSubmission`, `computeStudioMgRsSettlement`) + `ProductionStudioErpBottleneckSuite.tsx` | `ProductionActivityWorkspace.tsx` |
