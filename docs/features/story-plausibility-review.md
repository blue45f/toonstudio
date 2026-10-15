# 스토리 개연성 점검

- 상태: 1절은 기준 커밋의 **현재(current)** 사실이다. 2~9절은 이 변경(`claude/swq-plot` 브랜치)이 구현하고 테스트한 기능(current — 병합 전에는 이 브랜치에만 있다)이고,
  10절은 아직 하지 않은 일(target)과 알려진 공백(legacy exception)이다.
- 기준 커밋: `7e0a45710b1b1c9517005b0fee98be5c410269ed`
- 작성일: 2026-10-15
- 대상: `/studio/storyworld`(스토리월드 랩)와 프로젝트 기획 화면(`/studio/p/:projectId/story`), 프로젝트 준비도 패널
- 함께 보기: [초보 작가용 개연성 점검표](../learn/story-plausibility-checklist.md) · 설계 배경 [스토리월드 인과관계 랩](../studio-storyworld-causality-lab-2026-09-05.md)

이 문서는 작가가 "이 이야기가 말이 되는지"를 스스로 점검하게 돕는 기능을 설명한다. 먼저 저장소에 이미
있는 탐지기를 실제 소스에서 읽어 정리하고(1절), 그 위에 얹은 통합 점검 허브(2~8절)와 한계(9~10절)를 설명한다.

## 1. 현재: 기준 커밋의 탐지기 목록

아래 표는 소스를 읽고 만들었다. "화면"은 앱 진입점에서 정적 import(lazy 포함)로 닿는 컴포넌트가
있는지까지 확인한 결과다. 컴포넌트와 테스트는 있지만 어느 화면도 장착하지 않은 것은
**화면 미연결**로 적는다.

### 1.1 스토리월드 랩 (`apps/web/src/domains/creator/storyworld/`)

| 모듈 | 코드 | 무엇을 잡는가 | 화면 |
| --- | --- | --- | --- |
| `studio-storyworld-causality.ts` `analyzeStoryworldProject` (캐논 축) | `duplicate-id` | 인물·사실·장면·복선·모티프의 id 중복 | `/studio/storyworld` 모순·위험 탭 |
| 〃 | `dangling-reference` | 없는 인물·사실·장면을 가리키는 참조 | 〃 |
| 〃 | `dependency-cycle` | 장면 선행 관계가 순환 | 〃 |
| 〃 | `dependency-order` | 선행(원인) 장면이 결과 장면보다 뒤에 배치 | 〃 |
| 〃 | `inactive-dependency` | 켜 둔 장면이 꺼 둔 장면에 의존 | 〃 |
| 〃 | `missing-precondition` | 장면의 전제 사실이 그 시점까지 한 번도 성립하지 않음 | 〃 |
| 〃 | `contradicted-precondition` | 전제로 적은 값이 그 시점의 세계 상태와 다름 | 〃 |
| 〃 | `invalid-mutation` | 숫자가 아닌 사실에 증감 연산 | 〃 |
| 〃 | `time-regression` | `timeIndex`가 직전 장면보다 작음. 회상을 표시할 필드가 없어 회상도 같이 걸림 | 〃 |
| 〃 | `impossible-travel` | 같은 `timeIndex`에 공통 인물이 서로 다른 장소에 있음 | 〃 |
| 〃 (인물 지식 축) | `knowledge-leak` | 인물이 아직 알 수 없는 사실을 장면에서 사용 | 모순·위험 탭, 인물 지식 탭 |
| 〃 (스포일러 축) | `premature-reader-reveal` | 계획한 순서보다 일찍 독자에게 공개 | 모순·위험 탭, 복선 약속 탭 |
| 〃 | `reader-reveal-missed` | 공개하기로 한 시점이 지났는데 공개 장면이 없음 | 〃 |
| 〃 (복선 축) | `orphan-payoff` | 설치 없이, 또는 설치보다 먼저 나온 회수 | 모순·위험 탭, 복선 약속 탭 |
| 〃 | `unpaid-setup` | 기한(`payoffDueByOrder`)까지 회수하지 않은 복선 | 〃 |
| 〃 | `motif-underused`, `motif-gap` | 반복 모티프의 최소 횟수·최대 간격 위반 | 〃 |
| 〃 (감정 축) | `emotional-whiplash` | 연결 표시 없이 감정 거리가 0.95를 넘는 점프 | 모순·위험 탭 |
| 〃 (제작·현지화·접근성·권리 축) | `localization-overflow`, `accessibility-gap`, `rights-risk`, `missing-provenance`, `production-over-capacity`, `production-bottleneck` | 번역 말풍선 넘침, 접근성 근거, 자산 권리, 제작 시간. 이야기의 개연성이 아니라 출시 위험 | 모순·위험 탭, 대시보드 |
| `studio-storyworld-continuity.ts` `analyzeStoryworldContinuity` | `fact-initial-value-conflict` | 같은 주체·속성에 서로 다른 초기값을 선언한 사실 | 모순·위험 탭 "설정·연속성 검사" |
| 〃 | `knowledge-use-absent` | 장면 참여자가 아닌 인물이 지식을 사용 | 〃 |
| 〃 | `reveal-to-absent` | 장면 참여자가 아닌 인물에게 사실이 공개됨 | 〃 |
| 〃 | `emotion-beat-absent` | 장면 참여자가 아닌 인물의 감정 비트 | 〃 |
| 〃 | `character-never-appears` | 어느 활성 장면에도 나오지 않는 인물 | 〃 |
| 〃 | `fact-never-referenced` | 어디서도 참조하지 않는 사실 | 〃 |
| 〃 | `scene-order-duplicate` | 활성 장면의 순서(`order`) 중복 | 〃 |
| `studio-storyworld-counterfactual.ts` | (탐지기 아님) | 장면 제외·이동 같은 가상 변경을 적용해 점수와 문제 목록을 비교 | 다른 전개 탭 |
| `studio-storyworld-issue-dispositions.ts`, `disposition-store.ts` | (탐지기 아님) | 문제별 "해결 표시"·"무시(사유)" 기록을 작품 범위로 저장 | 모순·위험 탭의 두 목록 |
| `studio-storyworld-project-projection.ts` | (탐지기 아님) | 저장할 때 장면 참여자·장소 이동만 프로젝트 준비도의 스토리 구역으로 전달 | 프로젝트 준비도 |

연속성 모듈은 머리말에서 "연령 불일치는 나이 데이터가 스키마에 없어 검사하지 않는다"고 밝힌다.
소품·부상·의상의 장면 간 끊김은 별도 탐지기가 아니라 **사실로 모델링하면** 전제·효과 규칙
(`missing-precondition`, `contradicted-precondition`)이 잡는다는 것이 카탈로그의 "소품 생애 원장"
항목 설명이다. 전용 소품 상태 탐지기는 따로 없다.

### 1.2 기획 계층 (`apps/web/src/domains/creator/planning/`)

| 모듈 | 코드 | 무엇을 잡는가 | 화면 |
| --- | --- | --- | --- |
| `studio-foreshadow-ledger.ts` `deriveForeshadowDigest` | `overdue`, `dueSoon`, `longRunning` | 회수 예정 회차 구간이 지났는데 아직 살아 있는 복선, 구간에 들어온 복선, 구간 미정 복선 | **화면 미연결**. `StudioForeshadowLedgerPanel`, `StudioForeshadowOverviewNotice`를 장착한 곳이 없고 장부 저장도 이 패널에서만 쓴다 |
| 〃 `suggestForeshadowMentions` | (제안) | 줄거리·대사에 복선 제목이 다시 나오면 "혹시 이 복선?"을 제안 | 화면 미연결 |
| `studio-episode-continuity-timeline.ts` | `time-regression`, `time-overlap`, `parallel-place`, `invalid-range` | 회차의 이야기 일차 구간이 뒤로 가거나 겹침, 겹치는데 장소가 다름, 시작이 끝보다 늦음 | **화면 미연결**. 컴포넌트는 있고 시간·장소 태그를 저장하는 곳이 없다 |
| `studio-lore-consistency-gate.ts` `evaluateLoreClaim` | `confirmed-conflict`, `speculative-overlap`, `gap-fill`, `retired-name-reuse`, `unregistered-name` | 새 설정 이름이 기존 확정·추측·빈칸·폐기 설정과 겹치는지 등록 시점에 판정 | 화면 미연결 (`StudioWorldLoreHub`가 쓰며 이 허브를 장착한 곳이 없다) |
| `studio-world-lore.ts` `validateWorldLore` | `lore-name-collision`, `lore-id`, `lore-name-empty`, `lore-version-invalid`, `lore-relation-reference`, `lore-character-reference`, `lore-retired-link`, `lore-event-undated` | 설정 항목 이름 충돌, 끊어진 연결, 폐기 설정으로의 연결, 시기 없는 사건 | 호출하는 화면 없음 |
| `studio-fact-concordance.ts` `buildFactConcordance` | `used`, `unregistered`, `forgotten` | 게시 회차 본문에서 설정집 이름을 찾아 "정해졌고 쓰임 / 정해진 적 없음 / 정해졌는데 잊음"으로 분류 | **화면 미연결** (`StudioFactConcordancePanel`) |
| `studio-lore-name-check.ts` `checkLoreNames` | `name-variant`, `name-alias-mix`, `unregistered-name` | 사전 이름과 한두 글자 다른 표기, 정본·별칭 혼용, 사전에 없는 반복 낱말 | **화면 미연결** (`StudioLoreNameCheckPanel`) |
| `studio-plotline-timeline.ts` `plotlineTimelineHints` | (안내 문장) | 메인 플롯이 비는 회차, 템플릿 미적용 | 화면 미연결 |
| `studio-season-beat-board.ts` `seasonBeatBoardHints` | (안내 문장) | 인물이 연속으로 나오지 않는 구간, 비트가 몰리거나 비어 있는 회차 | 프로젝트 기획 > 회차 줄거리 |
| `studio-character-coverage.ts` `coverageGapAlerts` | `longAbsent`, `neverAppeared` | 오래 안 나온 인물, 한 번도 안 나온 인물 | 프로젝트 기획 > 회차 줄거리 (커버리지 맵) |
| `studio-plot-development.ts` | (탐지기 아님) | 다음 전개 후보를 결정적으로 제안 | 프로젝트 기획 > 회차 줄거리 |

### 1.3 프로젝트 공통 계층 (`apps/web/src/domains/creator/`)

| 모듈 | 코드 | 무엇을 잡는가 | 화면 |
| --- | --- | --- | --- |
| `studio-promise-payoff-ledger.ts` `diagnoseStudioPromisePayoffLedger` | `MISSING_SEED`, `MISSING_FORESHADOW`, `MISSING_PAYOFF`, `MISSING_INTENTIONAL_REASON`, `UNSCHEDULED_PAYOFF`, `DUE_SOON`, `DUE_NOW`, `OVERDUE`, `PAYOFF_BEFORE_SEED`, `FORESHADOW_BEFORE_SEED`, `FORESHADOW_AFTER_PAYOFF` | 약속·복선·미스터리의 첫 약속/단서/회수 연결 누락, 마감 경과, 순서 뒤바뀜 | 편집기의 제작 바이블 대화상자 "약속·회수" 패널 |
| 〃 `findStudioPromisePayoffRecapCandidates` | (제안) | 마지막 설명 뒤 8화 이상 지나 다시 등장하는 약속에 리캡 제안 | 〃 |
| `studio-story-bible.ts` `validateStudioStoryBible` | `character-name-conflict`, `*-id-duplicate`, `fact-character-reference`, `fact-location-reference` 등 | 바이블 id 중복, 인물 이름·별칭 충돌, 끊어진 참조 | 프로젝트 준비도 (진단 입력 검증) |
| 〃 `analyzeStudioStoryContinuity` | `costume-change`, `appearance-change`, `injury-disappeared`, `prop-disappeared`, `knowledge-regression`, `location-change` | 장면 사이에서 의상·외형·부상·소품·지식·장소가 설명 없이 바뀜 | 프로젝트 준비도의 스토리 구역. 스토리월드 투영은 장소 이동과 지식만 넘기므로 의상·부상·소품 값은 항상 비어 있다 |
| `studio-continuity.ts` `lintStudioContinuity` | `DUPLICATE_CHARACTER_NAME`, `MISSING_CHARACTER_APPEARANCE`, `MISSING_CHARACTER_VOICE`, `MISSING_CHARACTER_GOAL`, `UNKNOWN_CHARACTER`, `LOCATION_CONTINUITY_CONTRADICTION`, `TIME_CONTINUITY_CONTRADICTION`, `COSTUME_CONTINUITY_CONTRADICTION`, `PROP_CONTINUITY_CONTRADICTION` | 캔버스 장면 비트에 적은 장소·시간·의상·소품 값이 설명 없이 달라짐, 바이블 빈칸 | 편집기의 연속성 패널 |
| `studio-quality-inspection.ts` | `CONTINUITY_ISSUE` | 위 연속성 린트 결과를 쪽 품질 점검에 한 종류로 합침. 나머지 코드는 레이아웃·식자·레이어 점검 | 편집기의 품질 점검 |
| `studio-bible-documents.ts` | `validateBibleDocument` 계열 | 피치·시즌 아크·연속성 DB 문서의 스탬프, 피치 문서의 스포일러성 전개 | **화면 미연결** (`StudioBibleDocumentsPanel`) |
| `studio-project-diagnostics.ts` | (집계) | 스토리·제작·에셋·검토·현지화·출력 상태를 프로젝트 준비도로 합침 | 프로젝트 준비도 패널 |

### 1.4 현재의 공백

1. **입력 장벽**: 스토리월드 문서의 전제·효과·지식·공개·복선 계약은 설정 관리 폼으로 고칠 수 없고
   설정 파일(JSON)을 직접 고쳐야 한다. 폼이 다루는 장면 필드는 제목·설명·순서·시간·장소·참여자·
   선행 장면·사용 여부뿐이다.
2. **흩어진 결과**: 같은 종류의 문제(복선)가 스토리월드 랩, 제작 바이블, 화면이 없는 복선 장부에 따로 있다.
   통합 리포트가 없다.
3. **작가의 말이 아님**: 엔진 메시지는 `key-owned`, `dojin-is-brother` 같은 id를 그대로 보여 주고,
   무엇을 물어야 하는지 알려 주지 않는다.
4. **게시 전 동선 없음**: 프로젝트 준비도에는 스토리 연속성 구역만 있고 개연성 점검 상태가 없다.
5. **준비도 반영의 한계**: 저장 시 투영은 장소 이동과 지식만 전달하므로 인과 엔진 결과는 준비도에 반영되지 않는다.

### 1.5 설계 문서 8절("아직 완료로 오표시하지 않는 항목") 재확인

`docs/studio-storyworld-causality-lab-2026-09-05.md` 8절의 항목을 기준 커밋에서 다시 확인했다.

| 항목 | 기준 커밋의 사실 |
| --- | --- |
| 서버 작품 문서 스키마와 마이그레이션 | 없음. 스토리월드 문서는 이 기기의 로컬 저장소에만 있다 |
| 공용 Undo/Redo·CRDT 어댑터 | 연결되어 있지 않다. 랩의 편집은 화면 상태를 바꿀 뿐 Studio History에 들어가지 않는다 |
| 캔버스 요소·말풍선·3D 자산 자동 연결 | 없음. 준비도 투영만 있다 |
| 번역·게시·댓글·음성 공급자 연동 | 없음 |
| 브라우저 실기기 E2E·운영 배포 | 스토리월드용 브라우저 E2E 스펙은 없다. `scripts/verify-storyworld-lab.mjs`는 엔진과 CSS 선택자를 검증하는 수동 스크립트이지만 `package.json`·CI에 연결되어 있지 않고, 기준 커밋에서도 엔진 사본에 `studio-storyworld-counterfactual.ts`가 복사되지 않아 컴파일 단계에서 실패한다(이번 작업에서 실행해 확인) |

## 2. 한눈에 보기 (current, 이 브랜치에서 구현·테스트함)

작가가 "이 이야기가 말이 되는지" 스스로 점검하도록, 흩어져 있던 탐지기를 **하나의 리포트**로 모으고 그 앞뒤에 입력
동선과 처리 동선을 붙였다. 탐지기를 새로 만들지 않고 1절의 부품을 재사용하며, 기존에 없던 규칙만 4종 더했다(3.5절).

흐름: **원고로 시작(선택) → 질문지(선택) → 통합 리포트 → 근거로 이동 → 처리 기록 → 내보내기**

| 진입점 | 위치 | 비고 |
| --- | --- | --- |
| 스토리월드 랩 첫 번째 탭 "개연성 점검" | `/studio/storyworld`, `/studio/work/:workId/storyworld` | 탭 목록의 맨 앞이지만 시작 탭은 그대로 대시보드다. 주소에 `?view=plausibility`를 붙이면 허브가 바로 열린다 |
| 프로젝트 화면 스토리 구역의 첫 동작 "개연성 점검" | `/studio/p/:projectId/story` | 위 주소(`?view=plausibility`)로 연결한다. 기능 검색 별칭에 "개연성 점검"·"스토리 점검"·"plausibility"를 더했다 |
| 프로젝트 준비도 패널의 권장 안내 한 줄 | 프로젝트 화면 | 마지막 점검 시각·오류·경고·커버리지를 보여 주고 허브로 연결한다. 출시를 막지 않는다(7절) |

허브는 문서를 **자동으로 바꾸지 않는다**. 문서가 바뀌는 순간은 작가가 직접 누른 두 곳뿐이다: 질문지의 "저장하고 다음"/"임시 저장"과
원고 미리보기의 "초안 만들기". 해결 선택지(이동·안내문 복사)는 어느 것도 문서를 고치지 않는다.

### 2.1 코드 구성

새 코드는 대부분 `apps/web/src/domains/creator/storyworld/` 아래에 있고, 예외는 프로젝트 준비도의 안내 한 줄(`studio-shell/`)뿐이다. 아래 표의 파일은 따로 적지 않은 한 `plausibility/` 폴더 안에 있고, 접두사 `studio-story-plausibility-`는 `…`로 줄여 적었다.

| 구분 | 파일 | 하는 일 |
| --- | --- | --- |
| 모델 | `…-types.ts` | 범주 9개·심각도·신뢰 유형·발견·리포트 타입과 작가용 문구 |
| 〃 | `…-context.ts` | 이름 조회 맥락, 발견 팩토리(안정적 id 도출, 근거·글자 수 상한) |
| 〃 | `…-report.ts` | 리포트 조립, 중복 제거·정렬·상한, 점수식, 필터·범주 묶음, 처리 기록 겹치기 |
| 어댑터 | `…-adapters.ts`, `…-adapters-planning.ts` | 기존 탐지기 결과를 범주·심각도·질문·선택지로 옮김(3.4절) |
| 새 탐지기 | `…-detectors.ts` | 우연 의존 해결·단서 없는 우연·동기 공백·나이 산술(3.5절) |
| 커버리지 | `…-status.ts` | 질문 답 상태와 점검 가능 범위 계산 |
| 실행 | `…-sources.ts`, `…-run.ts`, `…-scope.ts`, `use-story-plausibility-check.ts` | 외부 출처 읽기, 점검 한 번 실행(취소·부분 실패 허용), 점검 범위, 화면용 훅 |
| 원고 | `studio-story-manuscript-extractor.ts` | 장면 경계·이름·시간 단서 추출(순수 함수, 청크 분할) |
| 〃 | `studio-story-manuscript-names.ts` | 스토리 바이블·세계관 설정의 등록 이름 읽기(읽기 전용) |
| 〃 | `studio-story-manuscript-project.ts` | 추출 제안과 작가의 수정으로 문서 초안 만들기 |
| 〃 | `studio-story-manuscript-store.ts` | 원고 사본 보관(조각 저장, 내용 지문 검증) |
| 질문지 | `…-questions.ts`, `…-question-drafts.ts` | 답을 기존 필드에 기록하는 순수 함수, 폼 상태 변환 |
| 부가 | `…-export.ts`, `…-summary.ts`, `…-source-view.ts`, `…-undo.ts`, `…-example.ts`, `…-display.ts`, `…-text.ts` | Markdown·JSON, 준비도 요약, "원고에서 보기", 되돌리기 스택, 예시 이야기, 표시 도우미, 한국어 조사 |
| 화면 | `StudioStoryPlausibilityHub.tsx`, `…ScopePanel.tsx`, `…FindingList.tsx`, `…Detail.tsx`, `…ReportView.tsx`, `…Questionnaire.tsx`, `…QuestionForms.tsx`, `…Manuscript.tsx`, `…Parts.tsx`, `studio-story-plausibility.css` | 3열 허브, 질문지, 원고로 시작하기 (여기서 `…`는 `StudioStoryPlausibility`) |
| 문서 읽기 | `storyworld/studio-storyworld-document.ts` | 랩이 들고 있던 JSON 검증을 옮기고 2판 필드를 더함. 읽을 때 2판으로 정규화 |
| 준비도 | `studio-shell/StudioPlausibilityReadinessNote.tsx` | 프로젝트 준비도 패널의 권장 안내 한 줄(7절) |

기존 파일의 변경은 작게 유지했다: `studio-storyworld-causality.ts`(타입·버전), `studio-storyworld-issue-dispositions.ts`(처리 상태 2개),
`StudioStoryworldLabPage.tsx`(탭 한 개 + 검증 함수 이동), `StudioStoryworldRoute.tsx`(`?view` 전달),
`StudioProjectShellPage.tsx`(동작 한 줄), `StudioProjectReadinessPanel.tsx`(import 한 줄 + 사용 한 줄),
`studio-diagnostic-redaction.ts`(최대 길이 인자), `studio-product-ia.ts`(검색 별칭).

## 3. 통합 리포트

### 3.1 범주 9개

범주는 엔진의 축이 아니라 **작가가 스스로에게 묻는 말**로 나눴다.

| 범주 | 작가의 질문 | 주로 닿는 탐지기 |
| --- | --- | --- |
| 원인과 결과 | 이 일은 무엇 때문에 일어났고, 그래서 무엇이 달라졌나? | 필요한 일이 안 일어남, 원인이 뒤에 있음, 원인 순환 |
| 동기 | 인물은 왜 그렇게 행동했나? | 동기 공백, 동기 사건이 뒤에 있음, 바라는 것이 비어 있음 |
| 정보 | 인물은 그걸 어떻게 알았고, 독자는 언제 알았나? | 모르는 사실을 씀, 독자 공개가 이름, 공개 누락 |
| 시간과 장소 | 이 장면은 언제, 어디에서 벌어지나? | 시간 역행, 같은 시간 두 곳, 장면 순서 겹침, 회차 시간 |
| 설정·규칙 | 세계의 규칙과 사실이 앞뒤가 맞나? | 같은 설정의 다른 값, 끊어진 참조, 이름 충돌 |
| 복선과 회수 | 심어 둔 것을 거두었나? 거두는 것은 심은 뒤인가? | 회수 없는 복선, 심기 전 회수, 마감 경과, 모티프 |
| 인물 일관성 | 같은 사람으로 읽히나? | 이름 표기 흔들림, 나이·연도, 등장하지 않는 인물 |
| 감정 변화 | 감정이 이유 없이 뒤집히지 않나? | 연결 없는 감정 급변, 장면에 없는 인물의 감정 |
| 우연·해결 방식 | 문제가 풀리는 이유가 앞에서 보였나? | 준비되지 않은 해결, 단서 없는 우연 |

### 3.2 심각도와 신뢰 유형

| 심각도 | 뜻 | 신뢰 유형 |
| --- | --- | --- |
| 오류 | 입력한 데이터끼리 어긋남이 **확정**됨 | 항상 확정(certain) |
| 경고 | 의심이 높음. 데이터는 확정이지만 작가의 의도일 수 있거나, 글쓰기 관습에 기댐 | 확정 또는 추정 |
| 제안 | 작가에게 던지는 질문. 틀렸다는 뜻이 아님 | 확정 또는 추정 |

신뢰 유형이 **확정**이면 입력만으로 규칙이 성립함을 기계가 확인한 것이고, **추정**이면 임계값이나 관습에 기댄 것이라 틀릴 수 있다.
오류는 반드시 확정이다(타입으로 강제하고 골든 테스트가 확인한다). 색만으로 뜻을 전하지 않고 아이콘과 글자("오류", "확정")를 함께 쓴다.

### 3.3 발견의 구성

발견 하나는 다음을 가진다: 안정적 `id`(탐지기 코드와 근거 id에서 도출, 시각·난수 없음) · 처리 기록 열쇠 · 출처(모듈, 코드, 원래 이슈 id) ·
범주 · 심각도 · 신뢰 유형 · 제목 · 설명 · **작가에게 던지는 질문** · 근거(장면/회차/사실/인물/복선/장부 항목의 id와 라벨, 가능하면 원고 인용) ·
**해결 선택지**(이동·안내문 복사·읽을거리만, 자동 적용 없음) · 관련 장면.

기존 이슈에서 온 발견은 처리 기록 열쇠로 **원래 이슈 id를 그대로** 쓴다. 그래서 모순·위험 탭에서 처리한 항목은 허브에서도 처리된 것으로 보이고, 반대도 같다.

### 3.4 기존 탐지기 → 범주 매핑

| 모듈 | 코드 | 범주 | 심각도 · 신뢰 |
| --- | --- | --- | --- |
| 인과 엔진 | `missing-precondition`, `dependency-order`, `dependency-cycle`, `inactive-dependency` | 원인과 결과 | 오류 · 확정 |
| 〃 | `contradicted-precondition` | 설정·규칙 | 경고 · 확정 |
| 〃 | `invalid-mutation`, `dangling-reference`, `duplicate-id` | 설정·규칙 | 오류 · 확정 |
| 〃 | `knowledge-leak` | 정보 | 오류 · 확정 |
| 〃 | `premature-reader-reveal`, `reader-reveal-missed` | 정보 | 경고 · 확정 |
| 〃 | `orphan-payoff`, `unpaid-setup` | 복선과 회수 | 오류 · 확정 |
| 〃 | `motif-underused`, `motif-gap` | 복선과 회수 | 경고 · 확정 |
| 〃 | `time-regression`(회상 장면으로 표시하면 제외), `impossible-travel` | 시간과 장소 | 경고 · 확정 |
| 〃 | `emotional-whiplash` | 감정 변화 | 경고 · 추정 |
| 연속성 검사 | `fact-initial-value-conflict` | 설정·규칙 | 오류 · 확정 |
| 〃 | `knowledge-use-absent`, `reveal-to-absent` | 정보 | 경고 · 확정 |
| 〃 | `emotion-beat-absent` | 감정 변화 | 경고 · 확정 |
| 〃 | `scene-order-duplicate` | 시간과 장소 | 경고 · 확정 |
| 〃 | `character-never-appears` | 인물 일관성 | 제안 · 확정 |
| 〃 | `fact-never-referenced` | 설정·규칙 | 제안 · 확정 |
| 복선 장부 | `overdue` / `dueSoon` | 복선과 회수 | 경고 / 제안 · 확정 |
| 약속·회수 장부 | `PAYOFF_BEFORE_SEED` | 복선과 회수 | 오류 · 확정 |
| 〃 | `OVERDUE`, `FORESHADOW_BEFORE_SEED`, `FORESHADOW_AFTER_PAYOFF`, `MISSING_PAYOFF` | 복선과 회수 | 경고 · 확정 |
| 〃 | `MISSING_SEED`, `MISSING_FORESHADOW`, `MISSING_INTENTIONAL_REASON`, `DUE_NOW`, `DUE_SOON` | 복선과 회수 | 제안 · 확정 |
| 회차 타임라인 | `invalid-range` | 시간과 장소 | 오류 · 확정 |
| 〃 | `time-regression` | 시간과 장소 | 경고 · 확정 |
| 〃 | `parallel-place`, `time-overlap` | 시간과 장소 | 제안 · 추정 |
| 세계관 설정 검증 | `lore-*` | 설정·규칙 | 오류 또는 경고(원래 심각도), `lore-event-undated`는 제안 · 확정 |
| 이름 표기 검사 | `name-variant` | 인물 일관성 | 경고 · 추정 |
| 〃 | `name-alias-mix` | 인물 일관성 | 제안 · 추정 |
| 〃 | `unregistered-name` | 설정·규칙 | 제안 · 추정(기본으로 끔 — 개연성 문제가 아니라서) |

개연성이 아닌 축(제작 시간, 번역 말풍선 넘침, 접근성, 자산 권리)은 리포트에 넣지 않는다. 출시 위험이라 기존 모순·위험 탭과 대시보드에 남겨 둔다.

**허브가 입력을 읽는 곳과 못 읽는 곳.** 허브는 작품 id가 있을 때 같은 기기에 저장된 복선 장부·세계관 설정·기획(회차 순서)을 읽어 기존 탐지기를 그대로 돌린다.
다만 복선 장부를 **쓰는** 화면(`StudioForeshadowLedgerPanel`)이 어느 화면에도 장착되어 있지 않아 실제 작품에서는 대개 "비어 있음"으로 나온다.
약속·회수 장부는 편집기 문서 안(제작 바이블)에 있고, 회차 시간 태그는 저장하는 곳이 없어서 허브가 읽지 못한다. 두 어댑터는 구현·테스트되어 있고
리포트의 "점검한 출처"에는 이 상태가 "연결 안 됨"으로 그대로 적힌다(없는 것을 있다고 쓰지 않는다).

### 3.5 새 탐지기 4종 (1절에 없던 것만)

원칙: **데이터로 확정할 수 있는 것만** 판정하고, 작가가 답하지 않은 칸은 판정하지 않는다. "앞에 없다"는 부재 판정은 바로 앞 장면들이 모두 입력되어
있을 때만 쓴다(입력 누락과 구별하려고). 같은 입력이면 항상 같은 발견이 나온다.

| 코드 | 범주 | 심각도 · 신뢰 | 언제 발견하나 (모두 만족할 때) |
| --- | --- | --- | --- |
| `unprepared-resolution` | 우연·해결 방식 | 경고 · 추정 | 작가가 "해결 장면"으로 답함 · 바로 앞 6장면에 사실 입력이 모두 있음 · 해결이 기대는 사실(전제·지식 사용)이 처음 상태나 인물의 처음 지식 덕에 조용히 성립하고 앞 어느 장면도 그 사실을 다루지 않음 · 단서 장면을 지정하지 않았고 복선 회수 장면도 아니며 정본 설정도 아님. 마지막 언급이 8장면 이상 앞이면 경고가 아니라 `stale-preparation` 제안만 냄 |
| `coincidence-without-clue` 등 | 우연·해결 방식 | 해결 장면이면 경고, 아니면 제안 · 확정 | 작가가 "우연이고 앞에 단서가 없다"고 답함. "모르겠다"는 제안 하나만(`coincidence-undecided`), 지정한 단서 장면이 뒤에 있거나 쓰지 않는 장면이면 오류(`coincidence-clue-order`) |
| `motive-gap` 등 | 동기 | 제안 · 확정 | 작가가 "결정 장면"에서 인물의 동기를 "모름"으로 답함. 동기 사건이 뒤에 있으면 오류(`motive-source-after`), "바라는 것"이라 했는데 인물 설정이 비면 제안(`motive-goal-missing`) |
| `age-mismatch` 등 | 인물 일관성 | 오류 · 확정 | 인물의 태어난 해·장면의 연도·장면에서 말한 나이가 **모두** 있고 두 살 이상 어긋남(생일 때문에 한 살 차이는 모순이 아님). 해가 흐른 만큼 나이가 변하지 않음(`age-progression`, 오류), 태어나기 전 해의 장면에 등장(`appears-before-birth`, 경고) |

생략한 것: **소품·부상·의상 상태 끊김**은 새로 만들지 않았다. 사실로 모델링하면 엔진의 전제·효과 규칙(`missing-precondition`,
`contradicted-precondition`)이 이미 잡고(카탈로그 "소품 생애 원장" 항목), 캔버스 쪽은 편집기의 연속성 린트와 품질 점검이 잡는다. 중복이므로 만들지 않았다.
나이·연도 산술은 연령 데이터가 문서 스키마에 없다는 이유로 1절의 연속성 모듈이 검사하지 않던 부분이며, 선택 필드 `birthYear`·`storyYear`·`statedAges`를 더해 가능하게 했다.

### 3.6 점검 가능 범위(커버리지)와 점수식

**점검 가능 범위.** 사용 중인 장면마다 아홉 칸을 센다: 등장인물·장소·시간(구조 필드) + 질문 6개(장면 성격·동기·원인·정보·우연·결과). 구조 필드에 이미
데이터가 있으면 해당 질문에 답한 것으로 본다(예: 선행 장면이나 전제가 있으면 "원인"). 점검할 수 있는 칸은 "답함"과 "해당 없음"뿐이고, "모름"·"건너뜀"·미답은
**점검 불가**다. 커버리지(%) = 점검할 수 있는 칸 ÷ (장면 수 × 9), 반올림. 장면이 없으면 0이다. 화면은 칸별 표를 접어서 보여 준다.

**점수식** (화면의 "점수 계산식 보기"와 내보낸 파일에 같은 문장이 적힌다):

```
개연성 점수 = 100 − Σ 범주별 감점 (범주마다 최대 40점)
범주별 감점 = 오류 × 15 + 확정 경고 × 6 + 추정 경고 × 3 + 제안 × 1
```

처리 기록에서 "해결함"·"의도된 설정"·"무시함"으로 표시한 발견은 감점하지 않고, "나중에"로 미룬 발견은 그대로 감점한다. 점수 옆에는 항상 **점수 신뢰**를 함께 둔다:
커버리지 40% 미만은 낮음("'문제 없음'이 아니라 '아직 모름'에 가까워요"), 70% 미만은 보통, 그 이상은 높음. 점수는 점검한 범위 안의 참고값이며 완성도가 아니다.

### 3.7 크기 상한

| 대상 | 상한 |
| --- | --- |
| 리포트의 발견 수 | 400건(넘치면 심각한 것부터 담고 넘친 건수를 `omittedCount`로 알림) |
| 발견 하나의 근거 | 8개 · 제목 80자 · 설명 640자 · 질문 320자 · 근거 라벨 80자 |
| 이름 표기 발견 | 리포트당 40건(표기 흔들림 → 혼용 → 미등록 후보 순으로 먼저 담음) |
| 스토리월드 문서 | 인물 64명 · 사실 512개 · 장면 256개 · JSON 1MB |
| 허브 안 되돌리기 | 20단계 |

## 4. 원고로 시작하기

에피소드 대본이나 시놉시스 텍스트에서 스토리월드 문서 **초안 제안**을 만드는 결정적 추출기다. 사실·전제·지식·감정 같은 의미 필드는 추정해서 채우지 않고 비워 둔다("미입력").
흐름은 **붙여 넣기(또는 .txt/.md 파일) → 장면 나누기 미리보기 → 확인 → 초안 만들기**이며, 작가가 미리보기에서 제목·등장인물·장소·경계를 고치고 확정하기 전에는 문서가 바뀌지 않는다.

| 추출하는 것 | 쓰는 신호 (확정 가능한 것만) |
| --- | --- |
| 장면 경계 | 장면 번호 줄(`장면 3`, `씬 3`, `컷 3`, `S#3`, `3컷`, `#3`), 구분선(`***`, `* * *`, `---`), 마크다운 헤딩과 회차 제목 줄(`1화 제목`, `Episode 3`), 빈 줄 두 줄 이상(가장 약한 표지). 여러 신호가 겹치면 더 강한 표지의 제목을 쓴다 |
| 등장인물 | 스토리월드 인물, **스토리 바이블**의 인물·별칭과 글자가 같을 때만(조사 허용, 한 글자 이름 제외). 같은 이름이 둘 이상 등록되어 있으면 자동 배정하지 않고 작가가 고르게 한다(동명이인) |
| 장소 | 스토리월드 장면의 장소, **바이블 장소**, **세계관 설정의 장소**(예시·폐기·격리 항목 제외)와 글자가 같을 때. 표지 줄의 장소를 먼저 보고, 없으면 본문에서 하나만 언급될 때만 정한다 |
| 시간 단서 | `다음 날`, `이튿날`, `그날 밤`, `3년 전`, `며칠 뒤`, `(회상)` 같은 **명시 표현을 문자열 그대로** 모은다. 시간 값으로 환산하거나 시간 역행 점검에 쓰지 않는다 |

만들어지는 장면은 뼈대뿐이다: 제목(표지에서 읽은 것, 없으면 "장면 N"), 순서, 참여자, 장소, 회차 번호, 원고 출처(짧은 발췌 240자 이하와 글자 위치).

- **덮어쓰기 경고.** "새로 시작하기"는 장면·설정(사실)·복선을 새로 만들고 인물 이름은 남긴다. 지금 설정에 내용이 있으면 사라지는 건수를 보여 주고 "먼저 지금 설정을 파일로 저장" 버튼과 확인 체크를 거쳐야 만들 수 있다. 처음 보여 준 예시 이야기는 잃을 작업이 없다고 알리고 예시 인물을 이어받지 않는다. "지금 설정 뒤에 덧붙이기"는 기존 내용을 그대로 둔다.
- **원고 사본.** "원고에서 보기"와 이름 표기 검사를 위해 원고 사본을 이 기기의 SQLite/OPFS 보조 저장소에 둔다(내용 지문이 id, 작품당 최대 6개, 조각 18만 자). 사본 저장에 실패하면 알리고 "사본 없이 만들기"를 고를 수 있다. 문서에는 짧은 발췌와 위치만 들어간다.
- **어떤 텍스트도 밖으로 나가지 않는다.** 추출·점검·내보내기 어디에도 네트워크 호출이 없다. 외부 공급자로 보내는 기능은 이 변경에 없다.
- **긴 원고.** 입력은 100만 자·장면 1,000개까지 읽는다(넘으면 앞부분만 처리하고 알림). 줄·장면 묶음마다 제어권을 돌려주고 취소할 수 있으며, 동기 실행과 비동기 실행은 같은 제너레이터라 결과가 같다. 한 번에 문서에 담을 수 있는 장면은 256개라서 넘치면 "원고를 나눠서 다시 가져와 주세요"로 안내한다.

## 5. 개연성 질문지와 문서 스키마 2판

장면마다 다섯 가지(+ 장면 성격)를 묻는 짧은 폼이다. 답은 **가능한 한 기존 필드**에 기록해서 인과 엔진이 그대로 쓰게 하고, 기존 필드에 없는 값만 새 선택 필드에 둔다.

| 질문 | 기록 위치 |
| --- | --- |
| 장면 성격: 중요한 선택 / 문제가 풀림 / 회상 | `scene.plausibility.roles`(새) |
| 동기: 왜 그렇게 행동했나 (바라는 것 · 앞선 사건 · 감정 · 모름) | `scene.plausibility.motives`(새). 앞선 사건은 선행 장면(`dependsOnSceneIds`)에도 이어 줌 |
| 원인: 무엇 때문에 일어났나 | 선행 장면(`dependsOnSceneIds`), 전제(`preconditions`) |
| 정보: 그걸 어떻게 알았나 | 인물의 처음 아는 사실(`initialFactIds`), 앞 장면의 공개 대상(`reveals`), 지식 사용(`knowledgeUses`) |
| 우연이라면 앞에 단서가 있었나 | `scene.plausibility.coincidence`(새) + 복선 계약(`clue:<장면 id>` 설치/회수) |
| 그래서 무엇이 달라졌나 | 효과(`effects`), 독자 공개(`reveals`) |

진행률(완료한 장면 ÷ 전체), 질문 단위·장면 단위 건너뛰기, 임시 저장(저장하지 않은 입력은 장면을 옮겨도 남음), 키보드 이동(장면 목록 ↑/↓/Home/End, 질문 단계 ←/→, 폼 어디서나 Ctrl+Enter로 저장하고 다음)을 지원한다.
답하지 않은 칸은 건드리지 않고 "점검 불가"로 남아 허위 경고를 만들지 않는다. "모름"과 "건너뜀"도 점검 가능으로 세지 않는다.

**문서 스키마 2판** (`STUDIO_STORYWORLD_SCHEMA_VERSION` 1 → 2). 새 필드는 **모두 선택**이다: 장면의 `episodeNumber`·`plausibility`·`source`·`storyYear`·`statedAges`, 인물의 `birthYear`.
1판 문서는 그대로 유효하고, 읽는 순간 필드를 더하지 않은 채 버전 표시만 2로 올려 정규화한다. **DB 마이그레이션은 없다.**
문자열 길이는 거절하지 않고 잘라서 받는다(손으로 고친 파일 하나 때문에 작품 전체를 못 여는 일을 피함). 구조가 틀린 값은 위치를 알려 거절한다.

## 6. 화면

### 6.1 배치와 상태

- 왼쪽 **점검 범위·커버리지·점수·출처**: 전체 / 회차 고르기 / 장면 고르기, "다시 점검", 마지막 점검 시각, 점검 가능 범위(미터 + 칸별 표), 점수와 계산식(범주별 감점 표), 점검한 출처와 이 점검의 한계.
- 가운데 **발견 목록**: 심각도 세그먼트(전체/오류/경고/제안, 건수 표시) · 범주 선택 · 검색, 범주별로 묶은 목록. 처리한 항목은 "처리한 항목 N건" 접이식에 모이며 **숨기지 않고** 다시 열어 되돌릴 수 있다.
- 오른쪽 **근거 상세**: 설명 · 작가에게 던지는 질문 · 근거(장면 카드, 원고 인용 강조, "원고에서 보기") · 해결하는 방법(고르기 전에는 아무것도 바뀌지 않음) · 처리 기록 · 출처 코드.
- 상태: 불러오는 중(스켈레톤, `role=status`) · 오류(이유와 "다시 시도", 이전 결과가 있으면 그대로 보여 줌) · 빈 상태(장면이 없으면 "원고로 시작하기"와 "예시 이야기로 점검해 보기") · 결과 없음(커버리지가 낮으면 "문제 없음"이 아니라 "아직 모름"이라고 알리고 질문지로 안내).
- **예시 이야기**는 일부러 문제를 심어 둔 읽기 전용 데이터다. 내 설정은 바뀌지 않고, 처리 기록·질문지 답·원고 가져오기를 막는다.

### 6.2 접근성·반응형

목록은 로빙 탭인덱스(↑/↓/Home/End로 옮기면 상세가 따라 바뀌고 Tab은 목록을 한 번에 지나감), 처리 사유 입력은 Esc 취소·Ctrl+Enter 기록, 건수 변화와 처리 결과는 `role=status`/`aria-live` 영역으로 알린다.
점수·커버리지·진행률은 `role=meter`이고 의미는 색이 아닌 글자로도 전한다. 3단 → 2단(≤1240px) → 1단(≤900px)으로 접히며 좁은 화면에서 항목을 고르면 상세 제목으로 포커스를 옮긴다.
스타일은 랩 셸의 `--storyworld-*` 토큰을 쓰고 `prefers-reduced-motion`, `prefers-contrast: more`, `forced-colors`를 처리한다(스타일 시트 테스트가 고정).

### 6.3 처리 기록

기존 이슈 처리 기록(`disposition-store`)을 그대로 재사용한다. 상태는 기존의 **해결 표시(resolved)**·**무시(ignored)**에 허브가 **의도된 설정(intended)**·**나중에(deferred)**를 더했고, 사유(최대 300자)를 함께 남긴다.
점수 반영: 해결함·의도된 설정·무시함은 점수에서 빠지고, 나중에는 계속 감점한다. 예전에 저장한 기록은 그대로 읽힌다(상향 호환). 반대로 새 상태가 들어간 기록 파일을 이전 버전 앱이 읽으면 형식 오류로 거절한다(10절).

### 6.4 내보내기

"내보내기"에서 Markdown(`story-plausibility-report-YYYYMMDD.md`)과 JSON(`….json`)을 받는다. 두 형식은 같은 중간 문서에서 만들어 내용이 같다. 담는 것: 생성 시각, 점검 범위, 점검 가능 범위(칸별 표),
점수와 **계산식**과 범주별 감점, 발견(설명·질문·근거·해결 선택지), 처리 기록, 점검 출처, 한계. 담지 않는 것: 원고 전문, 사용자 식별 정보, 저장소 키, 토큰.
근거의 원고 인용은 둘레 24자 안팎의 짧은 발췌뿐이고(체크를 풀면 아예 뺌), 이메일·전화번호·주민번호 모양·카드번호 모양·주소(URL)·파일 경로·긴 토큰은 `[가림]`으로 바꾼다. 파일 이름에는 작품 제목이 들어가지 않는다.

### 6.5 되돌리기

허브 안에서 한 일(처리 기록, 질문지 답, 원고 초안 만들기)은 "방금 한 일 되돌리기"로 한 동작씩 되돌린다. 항목은 함수가 아니라 이전 값을 담은 자료라서 테스트할 수 있다.
문서를 되돌릴 때는 이전 문서를 **예시 데이터 표시까지 그대로** 복원한다. 예시 이야기에서 처음 질문지에 답한 뒤 되돌리면 예시 상태로 돌아가므로, 예시 내용이 작가가 만든 설정처럼 남아 준비도에 반영되는 일이 없다(`StudioStoryworldLabPage.plausibility.test.tsx`가 확인).
**이 되돌리기는 허브가 열려 있는 동안 허브 안에서만 동작하며 편집기의 Studio History와 연결되어 있지 않다.** Studio History는 캔버스 문서의 명령 저널에 묶여 있고
(`studio-pages-history-command-journal` 등), 스토리월드 문서는 편집기 문서와 따로 저장되며 랩 화면에는 History 패널도 없다. 합류하려면 스토리월드 문서를 편집기 명령 체계로 옮기는 별도 설계가 필요하다(10절).
그래서 해결 선택지는 이동과 "안내문 복사/수동 적용"으로 제한했고, 어떤 선택지도 문서를 자동으로 바꾸지 않는다.

### 6.6 저장 위치와 개인정보

| 데이터 | 저장 위치 |
| --- | --- |
| 스토리월드 문서(질문지 답 포함) | 기존 랩 저장소 — 공용 SQLite/OPFS 초안 저장소 (`draft-store`) |
| 처리 기록 | 기존 `disposition-store` (SQLite/OPFS) |
| 원고 사본 | 랩 보조 저장소 (SQLite/OPFS), 이 기기 안 |
| 준비도 요약(마지막 점검 시각·오류/경고/제안 건수·커버리지·부분 점검 여부) | 공용 SQLite/OPFS 저장소의 전용 이름 공간 `studio-story-plausibility-summary-v1`(키는 작품 id). 본문·근거 문장은 담지 않는다 |

**브라우저 KV(localStorage·IndexedDB)에는 새로 쓰지 않는다.** 기존 바이블·세계관 설정·복선 장부·기획 저장소는 읽기만 한다. 이 규칙은
`studio-browser-kv-authority-boundary.test.ts`(미검토 브라우저 KV 쓰기를 거부하는 경계 테스트)가 지킨다: 이 변경이 더한 위반은 0건이다.
작가 원고가 서버·외부 공급자로 가는 경로는 이 기능에 없다.

## 7. 게시 전 연동

프로젝트 준비도 패널(`StudioProjectReadinessPanel`)에 비차단 권장 항목 한 줄을 더했다. 패널 파일의 변경은 import 한 줄과 사용 한 줄이고, 본체는 `StudioPlausibilityReadinessNote`에 있다.

- 요약을 읽는 동안이나 저장소를 읽지 못했을 때: 점검 여부를 단정하지 않고 "개연성 점검 · 이야기가 앞뒤가 맞는지 확인해 보세요 (권장 · 출시를 막지 않아요)"
- 점검한 적이 없으면: "개연성 점검 · 아직 점검하지 않았어요 (권장 · 출시를 막지 않아요)"
- 점검했으면: "개연성 점검 요약 · 마지막 점검 … · 오류 n · 경고 n · 커버리지 n% (일부 장면만 점검)"
- 줄을 누르면 `/studio/work/:projectId/storyworld?view=plausibility`로 간다. 같은 탭에서 점검이 끝나면 새로고침 없이 갱신되고, 다른 탭에서 점검했다면 이 탭으로 돌아올 때(창 포커스) 다시 읽는다.
- 허브는 요약을 남기지 못하면 "프로젝트 준비도에 점검 요약을 남기지 못했어요. 점검 결과에는 영향이 없어요."라고 알린다.
- 준비도의 "해결 필요/확인 필요" 건수와 상태에는 **영향을 주지 않는다**(테스트로 고정).
- 이 요약은 허브가 열려 점검을 마칠 때 남는다. 허브를 열지 않은 작품은 "아직 점검하지 않았어요"로 보인다.

## 8. 검증

### 8.1 골든 세트 (합성 이야기 21개)

코드로 만든 합성 이야기(`plausibility/studio-story-plausibility-golden-fixtures.ts`, 바이너리 픽스처 없음)에서 **결함 탐지 재현율**, **정밀도**, **깨끗한 이야기의 오탐 0**을
`studio-story-plausibility-golden.test.ts`가 한 번에 고정한다. 결함 이야기는 결함 하나만 심고, 리포트가 **정확히 그 하나만** 내야 통과한다(다른 발견이 섞이면 실패).

| 구분 | 이야기 | 심은 결함 | 기대 결과 (모듈 · 코드 → 범주 / 심각도) | 점검 가능 범위 |
| --- | --- | --- | --- | ---: |
| 결함 | `g-knowledge-leak` 범인을 먼저 아는 탐정 | 단서를 얻기 전 장면에서 범인을 지목 | 인과 · `knowledge-leak` → 정보 / 오류 | 44% |
| 결함 | `g-missing-precondition` 열쇠 없이 여는 금고 | 열쇠를 얻은 적 없는데 금고를 엶 | 인과 · `missing-precondition` → 원인과 결과 / 오류 | 39% |
| 결함 | `g-dependency-order` 원인이 결과보다 뒤 | 원인 장면이 결과 장면보다 뒤에 있음 | 인과 · `dependency-order` → 원인과 결과 / 오류 | 37% |
| 결함 | `g-time-regression` 설명 없는 시간 역행 | 회상 표시 없이 시간 값이 거꾸로 감 | 인과 · `time-regression` → 시간과 장소 / 경고 | 33% |
| 결함 | `g-impossible-travel` 같은 시간 두 곳 | 같은 시간에 시장과 금고에 있음 | 인과 · `impossible-travel` → 시간과 장소 / 경고 | 33% |
| 결함 | `g-unpaid-setup` 거두지 않은 우산 | 기한까지 회수하지 않은 복선 | 인과 · `unpaid-setup` → 복선과 회수 / 오류 | 33% |
| 결함 | `g-orphan-payoff` 심기 전에 거둔 복선 | 복선을 심기 전에 거둠 | 인과 · `orphan-payoff` → 복선과 회수 / 오류 | 33% |
| 결함 | `g-emotional-whiplash` 연결 없는 감정 급변 | 연결 없이 기쁨에서 절규로 점프 | 인과 · `emotional-whiplash` → 감정 변화 / 경고 | 44% |
| 결함 | `g-premature-reveal` 너무 이른 정체 공개 | 계획한 공개 순서(40)보다 이른 순서(20)에 독자에게 공개 | 인과 · `premature-reader-reveal` → 정보 / 경고 | 56% |
| 결함 | `g-fact-conflict` 서로 다른 금고 상태 | 같은 속성에 서로 다른 처음 값을 선언 | 연속성 · `fact-initial-value-conflict` → 설정·규칙 / 오류 | 44% |
| 결함 | `g-unprepared-resolution` 갑자기 나타난 비밀 통로 | 해결이 기대는 비밀 통로가 앞 장면에서 한 번도 안 나옴 | 새 · `unprepared-resolution` → 우연·해결 방식 / 경고 | 54% |
| 결함 | `g-coincidence` 단서 없는 우연한 구출 | 해결 장면이 단서 없는 우연이라고 답함 | 새 · `coincidence-without-clue` → 우연·해결 방식 / 경고 | 44% |
| 결함 | `g-motive-gap` 이유를 모르는 선택 | 결정 장면의 동기를 "모름"으로 답함 | 새 · `motive-gap` → 동기 / 제안 | 39% |
| 결함 | `g-age-mismatch` 맞지 않는 나이 | 2000년생이 2025년에 30살이라고 함 | 새 · `age-mismatch` → 인물 일관성 / 오류 | 33% |
| 결함 | `g-ledger-overdue` 회수 구간이 지난 편지 | 복선 장부: 3화까지 거두기로 한 편지를 4화에도 안 거둠 | 복선 장부 · `overdue` → 복선과 회수 / 경고 | 33% |
| 결함 | `g-timeline-regression` 거꾸로 가는 회차 | 회차 타임라인: 3화의 이야기 일차가 2화보다 앞섬 | 회차 타임라인 · `time-regression` → 시간과 장소 / 경고 | 33% |
| 깨끗함 | `c-mystery` 열쇠와 우산 | 모든 질문에 답했고 해결의 근거가 앞에서 보였으며 복선을 거두고 회상을 밝힘 | 발견 0 · 점수 100 | 100% |
| 깨끗함 | `c-flashback` 회상이 있는 이야기 | 회상 장면으로 밝힌 시간 역행은 경고하지 않음 | 발견 0 · 점수 100 | 100% |
| 깨끗함 | `c-long-foreshadow` 긴 복선 | 긴 호흡의 복선도 복선 계약으로 이어져 있으면 경고하지 않음 | 발견 0 · 점수 100 | 37% |
| 깨끗함 | `c-ages` 나이가 맞는 이야기 | 생일 때문에 한 살 어긋난 나이는 모순으로 세지 않음 | 발견 0 · 점수 100 | 33% |
| 깨끗함 | `c-sparse` 원고에서 막 가져온 초안 | 의미 필드가 비어 있어 판정하지 않음(커버리지만 낮음) | 발견 0 · 점수 100 · 점수 신뢰 낮음 | 11% |

| 지표 | 결과 |
| --- | --- |
| 심은 결함 | 16개 (아홉 범주를 모두 포함) |
| 찾은 결함 (재현율) | 16 / 16 = 100% |
| 리포트가 낸 발견 (정밀도) | 16건 중 16건이 심은 결함 = 100% |
| 깨끗한 이야기의 오탐 | 5개 이야기에서 0건 |

이 표는 `pnpm exec vitest run apps/web/src/domains/creator/storyworld/plausibility/studio-story-plausibility-golden.test.ts`의 실제 출력에서 뽑았다.
**해석상의 주의:** 합성 이야기 21개의 수치는 "알려진 결함 종류가 설계대로 잡히고, 알려진 깨끗한 패턴에서 조용하다"는 뜻이지 실제 작품에서의 재현율·정밀도가 아니다.
탐지기별 경계 사례(입력이 비었을 때 판정하지 않기, 한 살 어긋남, 정본 설정, 8장면 상기 등)는 `studio-story-plausibility-detectors.test.ts`가 따로 고정한다.

### 8.2 테스트 구성

| 영역 | 파일 |
| --- | --- |
| 추출기 | `studio-story-manuscript-extractor.test.ts` — 한국어 장면 표지, 별칭, 동명이인, 빈 입력, 조사 허용, 선형성(훑은 글자 수 2배 입력 → 1.9~2.2배), 600장면·40만 자 5초 이내, 상한, 취소, 경계 편집 |
| 원고 문서·보관 | `…manuscript-project.test.ts`, `…manuscript-store.test.ts`, `…manuscript-names.test.ts` |
| 리포트 | `…report.test.ts` — 결정성, 크기 상한, 커버리지 계산, 점수식, 범위, 처리 기록 겹치기. 256장면 5초 이내 |
| 탐지기·어댑터 | `…detectors.test.ts`, `…adapters.test.ts`, `…golden.test.ts` |
| 출처·실행·내보내기 | `…sources.test.ts`(600장면 이름 검사 10초 이내), `…run.test.ts`, `…export.test.ts`, `…summary.test.ts`, `…source-view.test.ts` |
| 질문지 | `…questions.test.ts`, `…question-drafts.test.ts` |
| 컴포넌트 | `StudioStoryPlausibilityHub.test.tsx`(필터·키보드·처리 기록·오류/재시도·내보내기·빈 상태), `…Manuscript.test.tsx`, `…Questionnaire.test.tsx`, `studio-story-plausibility.css.test.ts` |
| 통합 | `StudioStoryworldLabPage.plausibility.test.tsx`, `StudioStoryworldRoute.test.tsx`, `studio-storyworld-route.test.ts`, `StudioProjectReadinessPanel.test.tsx`, `studio-storyworld-document.test.ts`(1판 문서 역호환), `studio-storyworld-issue-dispositions.test.ts` |
| 문서 | `studio-story-plausibility-docs.test.ts` — 이 문서의 골든 표(점검 가능 범위 포함)·점수식·점검표가 코드와 어긋나면 실패 |

실행: `pnpm exec vitest run apps/web/src/domains/creator/storyworld apps/web/src/domains/creator/studio-router apps/web/src/domains/creator/studio-shell/StudioProjectReadinessPanel.test.tsx`

**계약·경계 테스트.** 라우트·레지스트리·IA 계약 테스트(`studio-product-ia`, `studio-feature-surface-registry`, `studio-router/`, 프로젝트 셸 통합 등)는 통과한다.
`studio-browser-kv-authority-boundary.test.ts`와 `file-size-ratchet.test.ts`는 기준 커밋에서도 다른 파일 때문에 실패하며(각각 37건·59건) 이 변경은 두 테스트에 위반을 더하지 않는다.

## 9. 자동으로 판정하지 못하는 것 (한계)

이 점검은 **입력한 데이터끼리의 어긋남**과 **글자 그대로 확정되는 신호**만 본다. 다음은 판정하지 않는다.

1. 이야기가 재미있는지, 감동적인지.
2. 입력하지 않은 내용. 점검 가능 범위가 낮으면 "문제 없음"이 아니라 "아직 모름"이다.
3. 인물의 성격이 일관적인지, 동기가 설득력 있는지. 문장의 뜻을 이해해야 하므로 작가가 직접 적은 동기·원인·단서가 서로 어긋나는지만 확인한다.
4. 회상·꿈·예언·초자연 같은 의도된 연출. 장면 성격으로 표시하거나 처리 기록에 "의도된 설정"으로 남겨야 한다.
5. "추정" 표시가 붙은 발견은 글쓰기 관습에 기댄 의심이라 틀릴 수 있다.
6. 원고 속 의미. 원고에서 가져오는 것은 장면 경계, 등록된 이름의 글자 일치, 명시된 시간 표현뿐이다. 말투·암시·반어·대명사·호칭 변화는 읽지 않고, 한 글자 이름은 일치에서 제외하며, 동명이인은 자동 배정하지 않는다.
7. 시간 표현의 환산. "다음 날"을 날짜로 바꾸지 않으므로 원고의 시간 표현만으로 시간 역행을 판정하지 않는다.
8. 이름 표기 흔들림은 세 글자 이상 이름의 한 글자 안팎 차이만 찾는다(두 글자 이름은 오탐이 많아 제외).
9. 소품·부상·의상의 장면 간 끊김. 사실로 모델링해야 전제·효과 규칙이 잡는다. 전용 탐지기는 없다.
10. 점수는 점검한 범위 안의 참고값이다. 점검 가능 범위가 낮을 때의 높은 점수를 완성도로 읽으면 안 된다.

## 10. 아직 하지 않은 일과 알려진 공백 (target / legacy exception)

| 항목 | 상태 |
| --- | --- |
| 편집기 Studio History와의 합류 | 하지 않음. 6.5절의 이유로 허브 안 되돌리기만 있다. 합류하려면 스토리월드 문서를 편집기 명령 체계로 옮겨야 한다 |
| 약속·회수 장부, 회차 시간 태그 입력 | 어댑터와 테스트만 있고 허브가 입력을 읽지 못한다. 제작 바이블·시간 태그를 읽을 수 있는 저장 경로가 생기면 `studio-story-plausibility-sources.ts`에 한 곳만 연결하면 된다 |
| 복선 장부를 쓰는 화면 | 어느 화면에도 장착되어 있지 않다(1.2절). 허브는 읽기만 한다 |
| 새 처리 상태의 하향 호환 | `intended`/`deferred`가 들어간 처리 기록 파일, 2판 스토리월드 파일은 이전 버전 앱이 읽지 못한다(상향 호환만 보장) |
| 브라우저 화면 검증·E2E | 이 변경은 컴포넌트·순수 로직 테스트로 상태·키보드·접근성 이름을 고정했다. 실제 브라우저의 시각·모바일·밝은/어두운/고대비 화면 검증은 별도 UI/UX 단계에서 한다 |
| Learn 앱(`/learn`) 레슨 | 없음. 초보 작가용 안내는 [개연성 점검표](../learn/story-plausibility-checklist.md) 문서와 허브의 "점검표 보기"로 제공한다 |
| AI 보조 설명 | 없음. 모든 판정과 문구는 규칙 기반이며 외부 공급자 호출이 없다 |
| 기준 커밋부터 실패하는 기존 도구 | `StudioStoryworldLabPage.test.tsx` 20건은 모두 탭 이름이 바뀐 뒤 갱신되지 않아(테스트는 "원본 데이터", 기준 커밋의 페이지는 "설정 파일") 첫 단계에서 실패한다. 탭 이름만 현재 값으로 바꾼 임시 사본을 기준 커밋의 페이지와 이 변경의 페이지에서 각각 돌려 보면 통과 8건·실패 12건이 똑같이 나온다(이 변경이 만든 회귀는 없다). `scripts/verify-storyworld-lab.mjs`는 엔진 사본에 `studio-storyworld-counterfactual.ts`가 빠져 컴파일 단계에서 실패하며 `package.json`·CI에 연결되어 있지 않다. 둘 다 이 작업의 범위 밖이라 고치지 않았다 |
