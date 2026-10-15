# 스토리 개연성 점검

- 상태: **1절은 현재(current)**, 2절 이후는 이번 작업의 설계다. 구현이 끝난 항목은 7절에서 `현재`로 옮긴다.
- 기준 커밋: `7e0a45710b1b1c9517005b0fee98be5c410269ed`
- 작성일: 2026-10-15
- 대상: `/studio/storyworld`(스토리월드 랩)와 프로젝트 기획 화면(`/studio/p/:projectId/story`)

이 문서는 작가가 "이 이야기가 말이 되는지"를 스스로 점검하게 돕는 기능을 설명한다. 먼저 저장소에 이미
있는 탐지기를 실제 소스에서 읽어 정리하고(1절), 그 위에 얹은 통합 점검 허브를 설명한다.

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
| 브라우저 실기기 E2E·운영 배포 | 스토리월드용 브라우저 E2E 스펙은 없고 `scripts/verify-storyworld-lab.mjs`가 엔진과 CSS 선택자를 검증한다 |

## 2. 이번 작업의 설계 (구현 중)

구현이 끝나면 이 절을 갱신한다. 구체적인 내용은 구현 커밋과 함께 채운다.
