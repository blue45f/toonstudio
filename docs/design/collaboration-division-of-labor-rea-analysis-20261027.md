# 협업·분업화(Division of Labor) 특화 서비스 REA 역공학 분석 및 ToonStudio 내재화·고도화 설계서 (2026-10-27)

- **문서 상태**: `current` (2026-10-27 REA 역공학 분석 및 클린룸 내재화·고도화 완료)
- **증거 원장**: [`docs/evidence/rea-collaboration-division-of-labor-20261027.json`](../evidence/rea-collaboration-division-of-labor-20261027.json)
- **분석 도구**: `rea` (`reverse-engineer-anything` MCP 서버 — `capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`, `export_evidence_bundle`)

---

## 1. 목적 및 배경

웹툰·디지털 코믹스 스튜디오 및 창작 크루는 단일 작가 체계에서 **8단계 공정(글콘티 → 그림콘티 → 3D배경/소품 → 선화/펜선 → 밑색 → 명암/채색 → 후보정/이펙트 → 식자/최종 검수)** 및 **17개 세부 직무**가 동시에 맞물리는 고밀도 분업 파이프라인으로 진화했다.

본 문서는 글로벌·국내 대표 협업 및 분업화 특화 플랫폼 4종(**Linear**, **Frame.io**, **Figma**, **크몽(Kmong Enterprise & Market)**)을 REA 도구체인으로 직접 캡처·역공학(총 **901,927개 AST 노드**, **5,397건 정적 분석 Finding**, **284개 추출 스크립트**, **128개 REA 세션 Evidence 레코드**)한 증거를 기록하고, 이를 ToonStudio의 핵심 프로덕션·협업 서피스 4곳에 클린룸 내재화·고도화한 아키텍처를 정의한다.

---

## 2. REA 역공학 증거 요약 (Observed Facts / Inferences / Unknowns)

### 2.1 대상별 REA 정적·동적 캡처 메트릭

| 분석 대상 | `capture_browser_scenario` Evidence ID | `export_web_scripts` Evidence ID | `analyze_javascript_application` Parent / Summary ID | 추출 스크립트 (Bytes) | 방문 AST 노드 / Findings | 핵심 Semantic Relations |
| --- | --- | --- | --- | --- | --- | --- |
| **Linear** (`https://linear.app/`) | `ev_f9d2e8ef642ee7614237f8887bf8d5bd0d6823e0ee33470348746515882be875` (`7449e162...`) | `ev_968699f791f4614bc86f827fa47033e254ca14bc0ead297d6918ee9b91eb6844` | Parent: `ev_a9ba83bd45b33525ecd900e89154c461bc40b1c126865775e33f3bc0cf3b3560`<br/>Summary: `ev_1a0767916ccd345cf27bf77a2cd11acf76697f2eb9d006e04d6c05c3e7584be6` | 189 / 250개 (985,839 B) | **194,408 노드** / 2,680건 | `data-flow`: 87,809, `object-flow`: 8,064, `closure`: 7,576, `call-flow`: 5,193 |
| **Frame.io** (`https://frame.io/`) | `ev_ca7ea51fab576e4a7cf8fb19add5318ca436fb97008374d4e75e2c5b43d8212e` (`ba863060...`) | `ev_25c3fcf8987c1e3101e709708b1dd43ab1eba7cc6f710df3fc80c25366ddeb07` | Parent: `ev_9cf80745bef9c8fb5710db8e8e6987cae8408a138e866a6409e494eeb14be84b`<br/>Summary: `ev_6e1be2c6fe414d1bc1b796460035f810ade397e372aaf9fc1d47b686cad6182f` | 19 / 34개 (528,852 B) | **153,234 노드** / 1,074건 | `data-flow`: 79,431, `object-flow`: 7,207, `closure`: 4,936, `promise-ownership`: 551 |
| **Figma** (`https://www.figma.com/`) | `ev_274345ca8f8511df4e8b903db915ccc3ef4cc10028fa190e088a52368a38d43b` (`3c0567f8...`) | `ev_4be57205de61cc21bc5caca8514773bf2c2e02562c7f347d1cbcaabe6e02698d` | Parent: `ev_cbc65765a208f4eab4970f761400b18e4ba6d81e9becf89821ad52aa48ead382`<br/>Summary: `ev_a80571a33b32a20a10c311f732617d28a87a580fea1b50898be743fc6a921357` | 41 / 88개 (916,842 B) | **289,544 노드** / 1,289건 | `data-flow`: 62,948, `call-flow`: 11,657, `object-flow`: 7,933, `boundary`: 331 |
| **크몽 (Kmong)** (`https://kmong.com/`) | `ev_c98ec296a0b874d335f3f8ae58c2b12a512c89c3e28dfd8e090bd79587570514` (`7667a8cf...`) | `ev_f25eda577544a4589a23c61826147db75641c6823f2edd9509b1f9a303ceef17` | Parent: `ev_1b85a521ff54446e57b7f6da6ed2a99d620a3e78f7f2e33b78e2e245c7f1f610`<br/>Summary: `ev_2a801e736626b7d913f64e6c4a27d8e169a0784de4a11ed0052e3882a7ad907b` | 35 / 59개 (1,110,689 B) | **264,841 노드** / 354건 | `data-flow`: 69,987, `object-flow`: 6,711, `closure`: 4,400, `call-flow`: 3,785 |

### 2.2 Observed Facts (관찰된 사실)

1. **Linear (`ev_732d7d7541cabf9a852c363f78cced6581131d45f6d3c3337f86e0fe998d8628`)**:
   - 정적 라우트 테이블에서 `/intake` (Triage 인박스), `/asks` (부서 간 요청 접수), `/plan` (사이클 및 마일스톤), `/build` (분업 실행), `/quality` (품질 검증), `/insights` (병목·리드타임 분석), `/agents` (자동화 라우팅 에이전트), `/customer-requests` 등 36개 라우트가 확인되었다.
   - `static.linear.app/web/_next/static/chunks/*` 번들(루트 아티팩트 SHA-256 `f47b365a530120a1fa441422119520fb668ff9d7ce9036342b76d0ca08ccb961`)에서 87,809건의 `data-flow`와 8,064건의 `object-flow`가 추출되었으며, `GlobalSidePanel`과 `LayoutContent` 분리를 통해 목록/칸반 상태와 우측 인스펙터 컨텍스트를 동시에 유지한다.
2. **Frame.io (`ev_6e1be2c6fe414d1bc1b796460035f810ade397e372aaf9fc1d47b686cad6182f`)**:
   - 19개 스크립트 청크(루트 아티팩트 SHA-256 `3d6e14c5e654302bd30c4c08e25341006846a50ddd960eedf3e1a0b1f63b44d6`, 288개 모듈)에서 551건의 `promise-ownership` 및 18건의 `request` 관계가 관찰되었으며, 미디어 애셋 스트리밍(`image/avif` 다중 해상도 트랜잭션 `request-50`, `request-55`)과 프레임/버전 기반 비동기 상태 동기화를 수행한다.
3. **Figma (`ev_a80571a33b32a20a10c311f732617d28a87a580fea1b50898be743fc6a921357`)**:
   - 초기 부트스트랩 시 `GET https://www.figma.com/api/user` (HTTP 202) 세션 프로브를 수행하며, 41개 스크립트 청크(루트 아티팩트 SHA-256 `8353ea6ba3eacc88c52b09053d8c5823b2fb9eae173d0d54b5c497925d0d16da`, 289,544 AST 노드)에서 331건의 `boundary` 검증(JSON/스키마 파싱 경계)과 11,657건의 `call-flow`가 관찰되었다.
4. **크몽 Kmong (`ev_dac8146bc7028892d3268c8307ea637a4f18429b5b4a81af88aed9967bcca09f`)**:
   - Turbopack 기반 `_next-market-desktop` 번들(루트 아티팩트 SHA-256 `7fe4505989e65df6a0128fc8302cac3651ac728d7703480adced384b0bc1d394`, 264,841 AST 노드)에서 36개 라우트가 복원되었다:
     - 의뢰인/전문가 양방향 주문 파이프라인: `/buyer/order-list`, `/seller/order-list`, `/seller/dashboard`, `/inboxes`, `/seller/message-reaction-settings`
     - 엔터프라이즈 외주 분업 게이트: `/enterprise`, `/enterprise/projects/new`, `/enterprise/simple-apply/gate`
     - 기업 후불·정산·조직 관리: `/kmongbiz/biz-postpaid/histories`, `/kmongbiz/biz-postpaid/inbox-histories`, `/kmongbiz/settings/organization`, `/kmongbiz/settings/members`, `/kmongbiz/settings/biz-card`

### 2.3 Inferences (역공학 추론 및 도메인 결합 원리)

1. **인계 게이트(Handoff Gate) + Triage 인박스 결합 (Linear `/intake` + `/asks` + Figma `Ready for Dev` / `Branch & Merge`)**:
   - 웹툰 분업에서 가장 큰 지체 원인은 앞 공정(예: 선화)이 레이어 분리·해상도·폐곡선 규격을 충족하지 않은 채 뒷 공정(예: 밑색)으로 넘어가는 **불완전 인계(Premature Handoff)**다. Linear의 `/intake` Triage 큐와 Figma의 섹션 준비 상태(`Ready for Next Stage`) 및 브랜치 병합(`Branch & Merge`) 모델을 결합하면, 8단계 공정 전환마다 **자동 프리플라이트 체크리스트 + SLA 타이머 + 인계 패킷(Handoff Packet)**을 강제할 수 있다.
2. **프레임/컷 단위 드로오버 합의 및 버전 스택 비교 (Frame.io Review + SyncSketch/ftrack Stage-Gate)**:
   - 웹툰 피드백은 텍스트 코멘트만으로는 위치 전달이 모호하다. 컷 번호·좌표(`x, y`) 기반 **드로오버(Draw-Over) 어노테이션 핀**, 버전 스택(`v1 → v2 → v3`) 비교, 그리고 **연출 PD / 메인작가 / 배경·채색 팀장 다자 승인 쿼럼(Quorum)**을 결합하면 재작업 루프를 최소화할 수 있다.
3. **분업 외주 에스크로·무료 수정 횟수 가드·세금/원천징수 정산기 (크몽 `/buyer/order-list`, `/kmongbiz/biz-postpaid/histories`, `/enterprise/simple-apply/gate`)**:
   - 외주 어시스턴트 협업에서는 **기본 컷 단가 + 난이도 할증(전투씬/군중씬) + 무료 수정 횟수(예: 2회) 초과 시 할증 가드(Scope Creep Guard)**와 **3.3% 사업소득 원천징수 vs 10% 부가세 세금계산서(크몽 비즈 후불/법인 카드 정산)** 자동 정산 원장이 필수적이다.
4. **17개 세부 공정 크루 편성 및 배턴 터치 시뮬레이터**:
   - 협업 보드(`/collaborate`)에서 작가가 회차 목표 컷 수(예: 70컷)와 주간 마감 시간을 입력하면, 8대 공정·17개 세부 역할 중 내재화할 역할과 외주/어시스턴트로 분업할 역할을 배정하고 **회차당 총 제작비·리드타임·병목 공정**을 즉시 시뮬레이션할 수 있어야 한다.

### 2.4 Explicit Unknowns (명시적 미확정 영역)

- 인증 세션 이후의 서버 측 GraphQL/REST Mutation 페이로드(Linear 내부 동기화 엔진 델타 프로토콜, Frame.io C2PA 서명 키 교환, 크몽 내부 에스크로 PG 정산 웹훅)는 비로그인 공개 캡처 범위에서 실행되지 않았으므로 `unknown`으로 분리 기록하며, ToonStudio 내재화 시에는 자체 클린룸 결정론적 TypeScript 도메인 모델로 구현한다.

---

## 3. ToonStudio 클린룸 내재화·고도화 아키텍처

| 모듈 | 도메인 모델 | UI 컴포넌트 스위트 | 마운트 서피스 (라우트) |
| --- | --- | --- | --- |
| **Module 1: 다단계 분업 핸드오프·트리아지·브랜치 병합 스위트** | `apps/web/src/domains/creator/production-hub/production-division-handoff-triage-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionDivisionHandoffTriageSuite.tsx` | `ProductionHandoffSurface.tsx` (`/production/projects/:projectId/handoff`) |
| **Module 2: 컷/프레임 드로오버 리뷰·버전 스택·다자 승인 합의 스위트** | `apps/web/src/domains/creator/production-hub/production-creative-review-consensus-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionCreativeReviewConsensusSuite.tsx` | `ProductionReviewSurface.tsx` (`/production/projects/:projectId/review`) |
| **Module 3: 웹툰 외주 분업 에스크로·수정 횟수 가드·정산 원장 스위트** | `apps/web/src/domains/creator/production-hub/production-outsourcing-settlement-guard-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionOutsourcingSettlementGuardSuite.tsx` | `ProductionCommercialSurfaces.tsx` (`/production/projects/:projectId/procurement`) |
| **Module 4: 웹툰 8공정·17직무 크루 분업 시뮬레이터 및 배턴 플래너** | `apps/web/src/domains/collaboration/collaboration-crew-division-planner-model.ts` | `apps/web/src/domains/collaboration/CollaborationCrewDivisionPlanner.tsx` | `CollaborationBoardPage.tsx` (`/collaborate`) |
