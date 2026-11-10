# Pilates-flow · ToonStudio 로컬 코드 검증 기반 독립 UI/UX 통합 명세서

본 문서는 루트 폴더(`/`) 연결 후 실제 로컬 저장소(``/Users/hjunkim/WebstormProjects/pilates-flow``, ``/Users/hjunkim/WebstormProjects/toonstudio``)의 소스 코드를 **읽기 전용**으로 대조하여 완성한 12개 업무 통합 UI/UX 명세서입니다. 원본 저장소의 파일·설정·브랜치·의존성은 일절 수정하지 않았으며, 모든 산출물은 원본 저장소 밖의 독립 경로(``/Users/hjunkim/WebstormProjects/gemini-pilates-toon-uiux-deliverables-20261110``)에만 저장했습니다.

## 0. 실제 확인한 사실(Confirmed Facts) vs. 설계 가정(Assumptions) 및 업무별 상태

### 0.1 실제 로컬 코드에서 확인한 사실 (Confirmed Facts)
1. **Pilates-flow (`pilates-flow-studio`) 확인 사실**:
   * **앱 셸 및 정보 구조 (``src/App.tsx``)**: 5개 기본 탭(`workbench` 수업/오늘의 수업, `atlas` 동작/동작 라이브러리, `schedule` 일정/강사 일정, `binder` 저장/저장한 플로우, `history` 기록/수업 기록)과 라이브 수업 화면(`stage` `LiveStageView.tsx`)으로 구성되어 있습니다.
   * **강사 일정 도메인 (``src/types/instructorSchedule.ts``, ``src/components/InstructorScheduleView.tsx``)**: 현재 일정 모델은 **강사 개인의 수업·장소 관리용**(`InstructorLocation`, `InstructorScheduledClass`, `InstructorScheduleException`: `closed`/`cancel`/`reschedule`, `InstructorScheduleOccurrence.status`: `scheduled` | `cancelled` | `closed` | `moved`)이며, `participantAlias`(반·회원 별칭)만 저장하고 개인정보·건강정보는 저장하지 않는 `PRIVATE BY DEFAULT` 원칙을 따릅니다.
   * **디자인 토큰 및 반응형·접근성 (``src/design-system/tokens.ts``, ``src/styles/responsive-studio.css``)**: `--pf-color-*` 토큰(`#F7F5EF` Warm Ivory 캔버스, `#1E3129` Deep Ink `12.6:1 AAA`, `#173D34` Deep Forest 주 액션 `11.4:1 AAA`, `#254B29` 성공 `8.8:1`, `#6B4010` 주의 `7.9:1`, `#8A341E` 위험 `7.1:1`), `--pf-touch-min: 44px`(모바일 하단 탭 `48px`), 브레이크포인트(`1100px`, `1099px`, `767px`, `359px`), iOS 자동 확대 방지(`16px`), `prefers-reduced-motion: reduce`, `forced-colors: active`가 실제 구현되어 있습니다.
2. **ToonStudio (`toonstudio`) 확인 사실**:
   * **최종 제품 IA 계약 (``studio-product-ia.ts``)**: 5대 글로벌 내비게이션(`스튜디오 /home`, `작품 /studio`, `탐색 /discover`, `커뮤니티 /community`, `전체 /sitemap`), 6대 프로젝트 내비게이션(`홈 overview`, `기획 story`, `제작 production`, `소재 assets`, `검토 review`, `배포 export`), 9대 기본 도구 그룹, 4대 작업 상태(`저장됨`, `저장 중`, `오프라인에서도 안전`, `확인할 내용이 있어요`), 그리고 **기본 UI 노출 금지 용어(`STUDIO_FORBIDDEN_DEFAULT_UI_TERMS`: `revision`, `리비전`, `lease`, `crdt`, `opfs`, `sqlite`, `provider`, `leader tab`, `follower tab`, `writer tab`, `server lock`, `서버 잠금`)**가 엄격히 정의되어 있습니다.
   * **스토리보드 플래너 및 컨트롤 룸 (``studio-storyboard-planner.ts``, ``StudioStoryboardGridPanel.tsx``)**: 기획(`EpisodePlan`의 `openingHook`, `turningPoints`, `cliffhanger`, `targetCutCount`)에서 콘티 비트를 시딩(`deriveStoryBeatsFromEpisodePlan`)하고 작화 샷으로 인계(`deriveStoryboardArtHandoff`)하며, 컨트롤 룸에서 3가지 뷰(`sequence`, `review`, `priority`), 10종 필터(`STORYBOARD_CONTROL_FILTERS`), 필터 중 드래그 재배열 잠금(`reorderEnabled`), 포즈 추천(`StudioCutPoseRecommendationPanel`)을 제공합니다.
   * **통합 에셋 워크스페이스 (``StudioUnifiedAssetWorkspace.tsx``, ``studio-asset-library.ts``)**: 8대 패싯(`전체`, `2D 배경`, `장면 레시피`, `스토리 연출`, `캐릭터·포즈`, `소품`, `3D`, `내 에셋`), 3대 컬렉션(`전체`, `즐겨찾기`, `최근 사용`), `/` 검색 단축키, `discoverability === "caution"` 에셋의 권리·출처 확인 체크박스 게이트(`acknowledgedCautionId`), SHA-256 `contentHash` 식별이 구현되어 있습니다.
   * **생성 작업 큐 상태 머신 (``studio-ai-job.ts``)**: 9단계 상태(`draft` → `awaiting-confirmation` → `queued` → `running` → `preview-ready` → `approved` → `applied` / `failed` / `cancelled`), `privacy`(`local` | `cloud-private` | `cloud-provider`), `cost`(`free` | `metered` | `quoted`), 단조 증가 진행률(`0..1`) 검증이 구현되어 있습니다.
   * **내보내기 사전 점검·3-Way 병합·저장 복구 (``studio-export-preflight.ts``, ``studio-workspace-three-way-merge.ts``, ``studio-save-recovery-ux.ts``)**: 8대 출력 타깃(`webtoon-platform` 800px 폭·12,800px 분할·18px 최소 텍스트·읽기 순서·권리·AI 표시 등), `mergeStudioWorkspaceStates` 3-Way 병합 및 `conflictPaths`, `resolveSaveRecoveryView` 7단계 우선순위(`readonly > failed > offline > reconnecting > server-unavailable > saving > saved`)와 `advanceSaveRecoveryAnnouncement` 알림 상태 머신이 구현되어 있습니다.
   * **웹툰 디자인 토큰 (``studio-webtoon-design-tokens.ts``)**: 7개 카테고리(`palette`, `typography`, `spacing`, `stroke`, `bubble`, `effect`, `output`) 및 3개 모드 축(`theme`, `language`, `platform`)이 구현되어 있습니다.

### 0.2 설계 가정 (Assumptions — 미구현 기능 구분)
1. **Pilates-flow 회원 예약·정원·대기열·회원권 도메인 (`Assumption`)**: 현재 `pilates-flow` 원본 코드는 강사 전용 수업 계획 및 일정 앱이므로, **모바일 회원용 수업 예약 여정(업무 1), 슬롯별 정원·대기·마감 상태(업무 2), 센터 운영자 출결·회원권 대시보드 확장(업무 3), 회원권 잔여 횟수·만료일 차감 방어 UX(업무 4), 회원 예약/대기/오프라인 마이크로카피(업무 5)**는 기존 `InstructorScheduleOccurrence`와 `--pf-*` 디자인 토큰을 계승하는 **신규 확장 설계 가정(`Assumption`)**입니다.
2. **원본 미반영 명시**: 본 작업의 코드는 원본 저장소에 덮어쓰지 않은 **독립 샘플(`PilatesScheduleAndMembershipSample.tsx`, `ToonStudioStoryboardAndQueueSample.tsx`, `shared_design_tokens.json`)**이며, 원본 앱에 통합 배포된 상태가 아님을 명확히 구분합니다.

### 0.3 12개 세부 업무별 완료/진행/차단 상태 요약표

| 업무 | 세부 업무명 | 상태 | 원본 코드 대조 결과 (Fact vs. Assumption) | 산출물 위치 |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Pilates-flow 모바일 회원 예약 여정 및 화면별 와이어프레임 | **설계 완료** (차단 해제·원본 미반영) | `App.tsx`·`InstructorScheduleView.tsx` 구조 확인(Fact) + 회원용 5단계 예약 여정 확장(Assumption) | 본 문서 1장 |
| **2** | 필라테스 시간표·정원·대기·마감·취소 상태 UI 명세와 예시 컴포넌트 | **설계 및 독립 샘플 완료** (원본 미반영) | 기존 `scheduled/cancelled/closed/moved`(Fact) + 회원용 정원·대기·마감 5상태 매핑(Assumption) | 본 문서 2장, ``PilatesScheduleAndMembershipSample.tsx`` |
| **3** | 강사/운영자 대시보드 정보 구조(IA) | **설계 완료** (원본 미반영) | 기존 5탭(`workbench/atlas/schedule/binder/history`)(Fact) + 운영자 정원/대기/회원권 패널 통합(Assumption) | 본 문서 3장 |
| **4** | 회원권·남은 횟수·만료 표시 및 오류 방지 UX | **설계 및 독립 샘플 완료** (원본 미반영) | `PRIVATE BY DEFAULT` 별칭 원칙(Fact) + 수강권 차감 전후 비교·만료 차단 5대 가드레일(Assumption) | 본 문서 4장, ``PilatesScheduleAndMembershipSample.tsx`` |
| **5** | 예약 성공/실패/빈 화면/오프라인 한국어 문구 | **설계 및 독립 샘플 완료** (원본 미반영) | 기존 한국어 피드백 톤(`~했어요/해 주세요`)(Fact) + 회원 예약·대기·오프라인 12종 문구(Assumption) | 본 문서 5장, ``PilatesScheduleAndMembershipSample.tsx`` |
| **6** | 필라테스 모바일 반응형·키보드·접근성 점검표 | **설계 완료** (원본 미반영) | `responsive-studio.css`(`1100/767/359px`, `44px/48px`, `16px`) 및 포커스 트랩 코드 실측(Fact) 반영 | 본 문서 6장 |
| **7** | ToonStudio 프로젝트/에피소드/씬 탐색 정보 구조(IA) | **설계 완료** (원본 미반영) | `studio-product-ia.ts`(5 글로벌·6 프로젝트 탭·금지 용어 12종) 및 `studio-storyboard-planner.ts` 실측(Fact) | 본 문서 7장 |
| **8** | 스토리보드 카드와 패널 편집 와이어프레임·예시 컴포넌트 | **설계 및 독립 샘플 완료** (원본 미반영) | `StudioStoryboardGridPanel.tsx`(`sequence/review/priority`, 10종 필터, 포즈 추천) 실측(Fact) 반영 | 본 문서 8장, ``ToonStudioStoryboardAndQueueSample.tsx`` |
| **9** | 캐릭터/배경/에셋 라이브러리 검색·필터 UX | **설계 완료** (원본 미반영) | `StudioUnifiedAssetWorkspace.tsx`(8 패싯, 3 컬렉션, `caution` 권리 확인 체크박스 게이트) 실측(Fact) | 본 문서 9장 |
| **10** | 생성 큐·진행률·취소·실패 재시도 상태 명세 (무과금) | **설계 및 독립 샘플 완료** (비용 0원·원본 미반영) | `studio-ai-job.ts`(9단계 상태 머신, `privacy: "local"`, `cost: "free"`, 단조 진행률 `0..1`) 실측(Fact) | 본 문서 10장, ``ToonStudioStoryboardAndQueueSample.tsx`` |
| **11** | 내보내기 사전 점검·버전 충돌·자동저장 복구 UX 명세 | **설계 및 독립 샘플 완료** (원본 미반영) | `studio-export-preflight.ts`, `studio-workspace-three-way-merge.ts`, `studio-save-recovery-ux.ts` 실측(Fact) | 본 문서 11장, ``ToonStudioStoryboardAndQueueSample.tsx`` |
| **12** | 두 앱 공통 디자인 토큰, WCAG 접근성 기준과 수동 QA 시나리오 | **설계 및 토큰 파일 완료** (원본 미반영) | `tokens.ts`(`--pf-*`)와 `studio-webtoon-design-tokens.ts` 실측 매핑(Fact) + 수동 QA 12선 | 본 문서 12장, ``shared_design_tokens.json`` |

## 1. [업무 1] Pilates-flow 모바일 회원 예약 여정 및 화면별 와이어프레임

### 1.1 모바일 회원 예약 5단계 여정 (`Confirmed` 컴포넌트 구조 + 회원 예약 `Assumption`)
* **코드 정합성**: ``InstructorScheduleView.tsx``의 `.schedule-week-strip`(주간 날짜 가로 스트립, `ArrowLeft`/`ArrowRight`/`Home`/`End` 키보드 지원)과 ``LightDismissDialog.tsx`` 모달 패턴을 그대로 재사용하여 일관된 조작감을 유지합니다.
* **5단계 여정**:
  1. **1단계 · 상단 수강권 요약 & 다가오는 예약 확인**: 상단 고정 배너에서 잔여 횟수(`잔여 7회 / 20회`), 유효기간(`2026-12-31 · D-51`), 예약 홀드 건수(`예약 중 1회`)를 확인합니다.
  2. **2단계 · 주간 날짜 스트립(`.schedule-week-strip`) & 장소/기구 필터 선택**: 월~일 날짜 칩(`예정 N회` 표시)과 기구 필터(`전체`, `Reformer`, `Cadillac`, `Chair`, `Barrel`)를 선택합니다.
  3. **3단계 · 시간표 슬롯 탐색 및 수업 준비 요약 열람**: 강사가 연결한 시퀀스(`linkSavedSequenceId`)의 기구·소도구(`EQUIPMENT_OPTIONS`, `PROP_OPTIONS`), 예상 시간(`50분`), 맞춤 난이도(`easy`/`standard`/`hard`)를 확인합니다.
  4. **4단계 · 수강권 차감·무료 취소 기한 확인 다이얼로그**: 예약 클릭 시 차감 전후 횟수(`7회 → 6회`)와 무료 취소 마감 시각(수업 12시간 전) 동의 체크 후 확정합니다.
  5. **5단계 · 예약/대기 완료 피드백 및 일정 관리**: 확정 배너(`role="status"`)에서 내 예약 목록 이동 또는 대기 순번 조회를 수행합니다.

### 1.2 화면별 와이어프레임 (모바일 390×844px 기준, `--pf-*` 토큰 적용)

```text
[화면 1: 모바일 회원 시간표 탐색]            [화면 2: 수업 상세 & 차감 확인 다이얼로그]
+---------------------------------------+   +---------------------------------------+
| Flow Atelier · 회원 예약   [오프라인!]|   | (배경 시간표 스크림 처리)             |
|---------------------------------------|   |---------------------------------------|
| [내 수강권] 4:1 기구 필라테스 20회권  |   | [수업 예약 확인]                [X 닫기]|
| 잔여 7회 / 20회 (예약중 1회) · D-51   |   |---------------------------------------|
| 만료일: 2026-12-31  [정상 이용 중 ●]  |   | 11월 10일(화) 오후 7:00 – 오후 7:50   |
|---------------------------------------|   | 리포머 코어 & 척추 분절 플로우 (50분) |
| < 2026년 11월 >           [오늘로]    |   | 장소: 본점 A룸 · 기구: 리포머, 폼롤러 |
| [월 9] [화 10*] [수 11] [목 12] [금13]|   | 권장 난이도: Standard · 비의료 참고안내|
|  2회     4회      3회     2회    3회  |   |---------------------------------------|
|---------------------------------------|   | [수강권 차감 및 취소 규정 확인]        |
| (전체*) (리포머) (캐딜락) (체어)      |   | • 차감 횟수: 1회 (현재 7회 → 확정 6회)|
|---------------------------------------|   | • 무료 취소 기한: 11/10(화) 오전 7:00 |
| 오전 10:00 – 10:50    [● 예약 가능]   |   |   (기한 경과 후 취소 시 1회 차감 소멸)|
| 리포머 호흡 & 골반 정렬 (50분)        |   |                                       |
| 장소: 본점 A룸 · 정원 2/6명           |   | [☑ 취소 기한 및 1회 차감 규정 확인]   |
|                          [ 예약하기 ] |   |---------------------------------------|
|---------------------------------------|   | +-----------------------------------+ |
| 오후 7:00 – 7:50  [▲ 마감임박 잔여1석]|   | | 1회 차감 동의 및 예약 확정 (48px) | |
| 리포머 코어 & 척추 분절 (50분)        |   | +-----------------------------------+ |
| 장소: 본점 A룸 · 정원 5/6명           |   | [              닫기                 ] |
|                          [ 예약하기 ] |   +---------------------------------------+
|---------------------------------------|
| 오후 8:00 – 8:50  [◆ 대기 가능 1/3명] |
| 캐딜락 전신 협응 플로우 (50분)        |
| 장소: 본점 B룸 · 정원 6/6명           |
|                          [ 대기 신청 ]|
|---------------------------------------|
| [시간표*]    [내 예약(1)]    [수강권] |
+---------------------------------------+
```

## 2. [업무 2] 필라테스 시간표·정원·대기·마감·취소 상태 UI 명세와 예시 컴포넌트

### 2.1 강사 일정 상태(`InstructorScheduleOccurrence.status`)와 회원 예약 슬롯 상태 매핑 명세
``src/types/instructorSchedule.ts``의 실제 `status`(`scheduled` | `cancelled` | `closed` | `moved`)와 ``src/design-system/tokens.ts``의 `--pf-color-*` 상태 토큰을 결합한 5대 슬롯 상태 명세입니다.

| 회원 슬롯 상태 (`MemberSlotStatus`) | 원본 `InstructorScheduleOccurrence` 및 정원 조건 | 배지 라벨 및 비색상 기호 | 적용 `--pf-color-*` 토큰 및 명도 대비 | CTA 버튼 상태 및 동작 |
| :--- | :--- | :--- | :--- | :--- |
| **`AVAILABLE`** | `status === 'scheduled' \| 'moved'` 이고 `enrolled < capacity - 1` | `● 예약 가능` | 텍스트 `#254B29` (`--pf-color-status-success-text`, `8.8:1 AAA`) / 배경 `#EEF2EA` | `예약하기` (활성, Primary `#173D34`, 최소 높이 `48px`) |
| **`ALMOST_FULL`** | `status === 'scheduled' \| 'moved'` 이고 `enrolled === capacity - 1` | `▲ 마감 임박 (잔여 1석)` | 텍스트 `#6B4010` (`--pf-color-status-warning-text`, `7.9:1 AAA`) / 배경 `#F4F1E3` | `예약하기` (활성, Primary `#173D34`, 동시성 경합 시 대기 안내) |
| **`WAITLIST`** | `status === 'scheduled'` 이고 `enrolled === capacity` 및 `waitlist < maxWaitlist` | `◆ 대기 가능 (대기 W/W_max)` | 텍스트 `#6B4010` (`--pf-color-status-warning-text`, `7.9:1 AAA`) / 배경 `#F4F1E3` | `대기 신청` (활성, Secondary 보더 `#D5DDD0`) |
| **`CLOSED`** | `(enrolled === capacity && waitlist === maxWaitlist)` 또는 `status === 'closed'`(휴무) | `■ 정원 마감` (휴무 시 `■ 센터 휴무`) | 텍스트 `#526358` (`--pf-color-text-muted`, `5.9:1 AA`) / 배경 `#F3F5EE` | `마감됨` (`disabled`, `aria-disabled="true"`) |
| **`CANCELED`** | `status === 'cancelled'` (`InstructorScheduleException.kind === 'cancel'`) | `✕ 폐강 안내` | 텍스트 `#8A341E` (`--pf-color-status-danger-text`, `7.1:1 AAA`) / 배경 `#FFF1F2` | `폐강 (횟수 자동 복구)` (`disabled`) |

* **독립 예시 컴포넌트 위치**: ``PilatesScheduleAndMembershipSample.tsx``

## 3. [업무 3] 강사/운영자 대시보드 정보 구조 (Information Architecture)

### 3.1 기존 `App.tsx` 5대 탭(`Confirmed`)과 운영자 확장 뷰(`Assumption`) 통합 IA
``src/App.tsx``의 실제 `navigation` 배열(`workbench`, `atlas`, `schedule`, `binder`, `history` + `stage`)을 보존하면서, 스튜디오 운영에 필요한 정원·출결·수강권 관리 계층을 매핑한 정보 구조입니다.

| 1차 내비게이션 (`App.tsx` `ActiveWorkspaceTab`) | 2차 화면 / 다이얼로그 구성 | 실제 연동 컴포넌트 (`Confirmed Fact`) | 확장 운영 기능 (`Assumption`) 및 핵심 액션 |
| :--- | :--- | :--- | :--- |
| **1. 수업 (`workbench`)** | • 시퀀스 워크벤치<br>• 플로우 동선·시간 편차·안전 점검<br>• 3D 기구 리깅 프리뷰 | • `SequenceWorkbench.tsx`<br>• `StudioFlowOptimizerPanel.tsx`<br>• `DurationCalibrationBanner.tsx`<br>• `StudioReadinessAuditCard.tsx`<br>• `Apparatus3dRigPreviewCard.tsx` | • `50분` 수업의 `warmup`/`main`/`cooldown` 구성<br>• 기구 전환 비용 최적화 및 브랜드별 스프링 환산<br>• `Verify AI` 비의료·비진단 안전 가드레일 실시간 점검 |
| **2. 동작 (`atlas`)** | • 98개 동작 아틀라스 & 11종 필터<br>• 강사 연습실(`InstructorStudyDialog`)<br>• 모션 드래프트 랩 | • `ExerciseAtlasView.tsx`<br>• `InstructorStudyDialog.tsx`<br>• `MotionDraftLabDialog.tsx`<br>• `YouTubeClipModal.tsx` | • 기구·부위·척추 4평면별 동작 검색<br>• 새 동작 아이디어 메모(`MovementIdeaSheet.tsx`) 작성 |
| **3. 일정 (`schedule`)** | • 일간/주간 강사 일정표<br>• 회차 변경 범위(`ScheduleChangeScopePanel`)<br>• 날짜별 시퀀스 계획(`DatedSequencePlanningDialog`)<br>• **[확장]** 실시간 정원·대기·출결 패널 | • `InstructorScheduleView.tsx`<br>• `ScheduleChangeScopePanel.tsx`<br>• `DatedSequencePlanningDialog.tsx` | • 회차별 변경(`this`) vs 반복 전체 변경(`series`) 분리<br>• 장소별 보유 기구(`equipmentIds`) 대비 연결 시퀀스 준비물 부족 경고(`getSchedulePlanWarnings`)<br>• **[확장]** 슬롯별 정원(`E/C`), 대기열 자동 승격, 폐강 시 수강권 일괄 복구 |
| **4. 저장 (`binder`) & 5. 기록 (`history`)** | • 저장한 플로우 바인더<br>• 수업 후 회고 기록(`LogSessionModal`)<br>• **[확장]** 수강권 차감·복구 원장 | • `ClassBinderView.tsx`<br>• `LogSessionModal.tsx`<br>• `ClassInsightsDialog.tsx`<br>• `StudioClinicalBriefCard.tsx` | • `Planned vs. Actual` 실제 소요 시간 기록<br>• 학생 실명 대신 `participantAlias`(수업 별칭) 기반 관찰 메모 기록<br>• **[확장]** 출석/결석(노쇼) 확정 및 수강권 횟수 수동 복구 로그 |
| **라이브 스테이지 (`stage`)** | • 실시간 수업 진행 타이머 & 음성 이동 | • `LiveStageView.tsx` | • 큰 글씨 고대비(`teaching-high-contrast`) 수업 진행 및 구간 점프 |

## 4. [업무 4] 회원권·남은 횟수·만료 표시 및 오류 방지 UX

### 4.1 회원권·남은 횟수·만료 표시 규격
1. **3대 핵심 지표 동시 표기**: 모든 예약 화면 상단과 확정 다이얼로그에 **`사용 가능 잔여 N회 / 총 M회`**, **`진행 예정 예약 H회`**, **`만료일 YYYY-MM-DD (D-N)`**을 고정 표시합니다(`font-variant-numeric: tabular-nums` 적용).
2. **개인정보 최소 수집 원칙 (`PRIVATE BY DEFAULT` 준수)**: ``src/App.tsx``의 정책에 맞춰 회원권 카드에도 민감 건강정보나 실명 대신 회원 별칭(`participantAlias`)과 수강권 ID만 표시합니다.
3. **만료·소진 임박 시각 및 비색상 경보**:
   * 잔여 `2회 이하` 또는 만료 `7일 이내(D-7)`: `▲ 만료/소진 임박` 배지(`--pf-color-status-warning-text: #6B4010`) 표시.
   * 잔여 `0회` 또는 선택 날짜 기준 만료일 경과: `✕ 예약 불가 (만료/소진)` 배지(`--pf-color-status-danger-text: #8A341E`) 표시.

### 4.2 5대 예약·차감 오류 방지 UX (Error-Prevention Guardrails)
1. **만료일 이후 수업 날짜 선택 시 사전 차단**: 주간 스트립에서 선택한 날짜(`selectedDate`)가 `pass.expiresAtIso`보다 뒤인 경우, 슬롯의 `예약하기` 버튼을 비활성화하고 `"선택하신 날짜(YYYY-MM-DD)는 수강권 만료일 이후입니다"` 안내를 즉시 노출합니다.
2. **잔여 횟수 0회 시 대기 신청 포함 사전 차단**: `remainingCount <= 0`일 때는 일반 예약뿐 아니라 `대기 신청`도 차단하여 대기 승격 시점에 결제/차감 오류가 발생하는 것을 방지합니다.
3. **차감 전후 수치 비교 및 무료 취소 기한 명시 동의**: 예약 확정 전 다이얼로그에서 **`차감 전 7회 → 예약 후 6회`**와 **`무료 취소 마감: 수업 12시간 전(오전 07:00)`**을 명시하고 체크박스 동의 후 확정 버튼을 활성화합니다.
4. **무료 취소 기한 경과 후 취소 시 위약 소멸 2단계 확인**: 수업 시작 12시간 이내에 `예약 취소`를 누르면 즉시 취소하지 않고, `"무료 취소 기한이 지나 지금 취소하시면 수강권 1회가 복구되지 않고 차감됩니다. 그래도 취소하시겠어요?"` 확인 단계를 거칩니다.
5. **중복 제출 잠금 (`savingScheduleRef` 패턴 계승)**: ``InstructorScheduleView.tsx``의 `savingScheduleRef` 패턴과 동일하게, 예약/취소 버튼 클릭 즉시 `aria-busy="true"` 및 `disabled` 처리하여 더블 탭으로 인한 2회 중복 차감을 막습니다.

## 5. [업무 5] 예약 성공/실패/빈 화면/오프라인 한국어 문구 (Microcopy)

``Pilates-flow``의 실제 UI 문구 톤(`~했어요`, `~해 주세요`, 차분하고 명확한 아틀리에 어조)에 맞춘 12종 한국어 문구 명세입니다.

| 분류 | 상태 시나리오 | 배너/모달 제목 | 본문 한국어 문구 (Body Copy) | 주요 액션 버튼 (CTA) |
| :--- | :--- | :--- | :--- | :--- |
| **예약 성공** | 일반 수업 예약 완료 | 수업 예약을 완료했어요 | `{날짜} {시작시각} [{수업제목}] 예약을 확정했습니다. 수강권 1회가 차감되어 남은 횟수는 {N}회입니다.` | `내 예약 보기` / `일정에 추가` |
| **예약 성공** | 대기 신청 접수 완료 | 대기 신청을 접수했어요 | `현재 대기 {N}번입니다. 앞선 예약이 취소되면 수업 시작 2시간 전까지 순서대로 승격 알림을 보내드려요.` | `대기 내역 확인` |
| **예약 성공** | 무료 취소 기한 내 취소 | 예약을 취소하고 횟수를 복구했어요 | `[{수업제목}] 예약을 취소했습니다. 수강권 1회가 복구되어 현재 남은 횟수는 {N}회입니다.` | `시간표로 돌아가기` |
| **예약 실패** | 동시 예약으로 마지막 좌석 마감 | 방금 마지막 자리가 마감되었어요 | `다른 회원님이 방금 마지막 좌석을 예약했습니다. 대기 1번으로 전환해 신청할까요?` | `대기 1번 신청하기` / `다른 시간 보기` |
| **예약 실패** | 회원권 만료일 이후 날짜 선택 | 수강권 유효기간 이후의 수업이에요 | `선택하신 수업 날짜({수업일})가 수강권 만료일({만료일}) 이후입니다. 만료일 이전 날짜를 선택해 주세요.` | `만료일 이전 날짜 보기` |
| **예약 실패** | 잔여 횟수 모두 소진 (`0회`) | 사용할 수 있는 남은 횟수가 없어요 | `현재 수강권의 남은 횟수가 0회입니다. 스튜디오에 수강권 연장이나 재등록을 문의해 주세요.` | `내 수강권 확인` |
| **예약 실패** | 동일 시간대 중복 예약 시도 | 같은 시각에 이미 예약한 수업이 있어요 | `{시작시각}–{종료시각}에 이미 [{기존수업제목}] 예약이 있습니다. 기존 예약을 취소하고 이 수업으로 변경할까요?` | `기존 예약 확인` / `닫기` |
| **빈 화면** | 선택한 날짜에 수업 없음 | 등록된 수업이 없습니다 | `선택하신 날짜에는 개설된 수업이 없거나 센터 휴무일입니다. 주간 날짜 선택에서 다른 요일을 확인해 보세요.` | `다음 수업일 보기` |
| **빈 화면** | 기구·장소 필터 일치 결과 0건 | 조건에 맞는 수업이 없어요 | `선택한 기구나 장소 조건에 해당하는 수업이 없습니다. 필터를 초기화해 전체 일정을 확인해 주세요.` | `필터 초기화` |
| **빈 화면** | 예정된 내 예약 내역 0건 | 예정된 수업이 없습니다 | `아직 예약한 다가오는 수업이 없어요. 주간 시간표에서 원하는 기구와 시간대를 골라 예약해 보세요.` | `시간표 보러 가기` |
| **오프라인** | 상단 오프라인 상태 고정 배너 | 오프라인 상태예요 · 마지막 저장 일정을 표시합니다 | `인터넷 연결이 끊어져 이 기기에 마지막으로 저장된 시간표를 보여드리고 있어요. 실시간 잔여석 확인과 예약·취소는 연결 복구 후 가능합니다.` | `연결 다시 확인` |
| **오프라인** | 오프라인 중 예약/취소 버튼 클릭 | 연결 복구 후 예약을 진행해 주세요 | `오프라인 상태에서는 실시간 정원과 수강권 잔여 횟수를 확인할 수 없습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.` | `확인` |

## 6. [업무 6] 필라테스 모바일 반응형·키보드·접근성 점검표

``src/styles/responsive-studio.css``, ``src/App.tsx``, ``src/components/InstructorScheduleView.tsx``의 실제 구현 규격을 반영한 10대 점검표입니다.

| 구분 | 항목 ID | 점검 기준 (Verification Criteria) | 실제 코드 근거 (`Confirmed`) |
| :--- | :--- | :--- | :--- |
| **모바일 반응형** | `PF-RWD-01` | **초소형(`<=359px`) 및 모바일(`<=767px`) 레이아웃**: `.app-create-movement span` 숨김, `.workbench-welcome-actions` 1열 그리드(`grid-template-columns: 1fr`), 가로 스크롤(`overflow-x`) 0건인가? | `responsive-studio.css` (`@media (max-width: 767px)`, `@media (max-width: 359px)`) |
| **모바일 반응형** | `PF-RWD-02` | **태블릿(`<=1099px`) 및 데스크톱(`>=1100px`) 전환**: `1100px` 이상에서 `208px` 좌측 사이드바 + 우측 `300px` 플랜 컬럼 2단 레이아웃이 유지되고, `1099px` 이하에서 하단 `.bottom-nav`로 전환되는가? | `responsive-studio.css` (`@media (min-width: 1100px)`) |
| **모바일 반응형** | `PF-RWD-03` | **iOS Safari 입력창 자동 확대(Auto-zoom) 방지 및 Safe Area**: 모바일 뷰포트에서 모든 `input, select, textarea`의 글자 크기가 최소 `16px`(`1rem`)이며, 하단 고정 바가 `env(safe-area-inset-bottom)` 여백을 확보하는가? | `responsive-studio.css` (`font-size: 16px`, `bottom: calc(8px + env(safe-area-inset-bottom)...)`) |
| **터치 타깃** | `PF-TCH-01` | **최소 터치 크기 보장**: 일반 인터랙티브 버튼·아이콘 버튼(`.icon-btn`, `.icon-button`)이 최소 `44×44px`(`--pf-touch-min: 44px`), 모바일 하단 내비게이션(`.bottom-nav button`) 및 주요 예약 CTA가 최소 `48px` 높이를 충족하는가? | `tokens.ts` (`--pf-touch-min: 44px`), `responsive-studio.css` (`.bottom-nav button { min-height: 48px }`) |
| **키보드 탐색** | `PF-KBD-01` | **본문 건너뛰기(Skip Link) 및 탭 전환 포커스**: 첫 `Tab` 시 `.skip-link`(`본문으로 이동` → `#main-content`)가 노출되고, 탭 전환 시 `WorkspaceHeadingFocus`를 통해 `#workspace-main-heading`으로 포커스가 이동하는가? | `App.tsx` (`.skip-link`, `WorkspaceHeadingFocus`) |
| **키보드 탐색** | `PF-KBD-02` | **주간 날짜 스트립 방향키 제어**: `.schedule-week-strip` 내에서 `ArrowLeft`(이전 날), `ArrowRight`(다음 날), `Home`(주 시작일), `End`(주 마지막 날) 키로 날짜 이동 및 포커스 연동이 작동하는가? | `InstructorScheduleView.tsx` (`handleStripKey`) |
| **키보드 탐색** | `PF-KBD-03` | **모달·사이드바 포커스 트랩 및 복귀**: 모바일 메뉴(`.sidebar.is-open`) 및 `LightDismissDialog` 열림 시 배경에 `inert`가 적용되고, `Tab`/`Shift+Tab` 순환 및 `Escape` 닫기 후 원래 트리거 버튼(`menuButtonRef`, `changeTriggerRef`)으로 포커스가 복귀하는가? | `App.tsx` (`inert={menuOpen ? true : undefined}`), `InstructorScheduleView.tsx` (`restoreChangeFocus`) |
| **접근성·의미론** | `PF-A11Y-01` | **실시간 상태 알림 영역(`aria-live`)**: 일정 요약(`.schedule-summary`), 단계 가이드(`.pf-step-guide-focus`), 예약 성공/오프라인 알림에 `role="status"`(`aria-live="polite"`)가 적용되고, 경고/오류에 `role="alert"`가 적용되는가? | `InstructorScheduleView.tsx` (`role="status"`, `role="alert"`) |
| **접근성·시각** | `PF-A11Y-02` | **포커스 링·모션 감소·강제 색상 모드**: `:focus-visible` 시 `3px solid var(--pf-color-focus-ring)`(`outline-offset: 3px`)가 표시되고, `prefers-reduced-motion: reduce` 시 애니메이션이 비활성화되며 `forced-colors: active` 시 `Highlight` 외곽선이 유지되는가? | `responsive-studio.css` (`:focus-visible`, `@media (prefers-reduced-motion: reduce)`, `@media (forced-colors: active)`) |
| **도메인 안전** | `PF-A11Y-03` | **비의료·비진단 및 개인정보 보호 안내**: 화면 내 안내 문구가 근육 약화/단축 진단이나 교정·치료 효과를 단정하지 않으며, 회원 실명/민감정보 대신 `participantAlias`(별칭)만 입력하도록 안내하는가? | `App.tsx` (`safety-notes`, `PRIVATE BY DEFAULT`), `aiSequenceSafetyVerifier.ts` |

## 7. [업무 7] ToonStudio 프로젝트/에피소드/씬 탐색 정보 구조 (IA)

### 7.1 `studio-product-ia.ts` 계약(`Confirmed`) 기반 5계층 탐색 구조
``studio-product-ia.ts``의 불변 계약(5개 글로벌 메뉴, 6개 프로젝트 메뉴, 4개 작업 상태, 금지 용어 12종 배제)과 ``studio-storyboard-planner.ts``의 회차(`episodeId`)·장면(`sceneId`)·비트(`beatId`)·샷(`shotId`) 계층을 결합한 탐색 정보 구조입니다.

```text
[1계층: 글로벌 내비게이션 (STUDIO_GLOBAL_NAVIGATION - 5개 고정)]
├── 스튜디오 (/home) | 작품* (/studio) | 탐색 (/discover) | 커뮤니티 (/community) | 전체 (/sitemap)
    │
    └── [2계층: 프로젝트 내비게이션 (STUDIO_PROJECT_NAVIGATION - 6개 고정, 경로: /studio/p/:projectId/*)]
        ├── 1. 홈 (overview)       : 작품 건강도 요약(StudioProjectHealthSummary), 최근 작업 이어하기
        ├── 2. 기획 (story)        : 회차 기획(EpisodePlan: 오프닝 훅·핵심 사건·마무리 훅·목표 컷 수 targetCutCount)
        │   └── [흐름 F-1 시딩] deriveStoryBeatsFromEpisodePlan() ──► 회차별 스토리 비트 자동 생성
        ├── 3. 제작 (production)   : 에피소드 -> 씬(Scene) -> 스토리보드 컷/샷(Shot) -> 캔버스 작화
        │   ├── 3-A. 에피소드 선택기 (Episode Selector: episodeId 단위 바인딩, 혼합 시 episode-mixed 경고)
        │   ├── 3-B. 씬 그룹 (Scene Strip: sceneId 단위 묶음, 씬 전환 시 scrollGapAfterPx = 240px 자동 확보)
        │   ├── 3-C. 스토리보드 컨트롤 룸 (StudioStoryboardGridPanel: 시퀀스 뷰 / 검토 큐 / 준비도 큐)
        │   └── 3-D. [흐름 F-3 작화 인계] storyboardArtStartHref(/studio/new?start=art&episode=...)
        │            └── 캔버스/3D 편집기 (/studio/p/:projectId/d/:documentId?workspace=3d)
        ├── 4. 소재 (assets)       : 통합 에셋 작업 공간 (StudioUnifiedAssetWorkspace - 8대 분류 패싯)
        ├── 5. 검토 (review)       : 컷별 댓글 스레드(StudioCommentsPanel), 버전 비교(StudioRevisionCompareView)
        └── 6. 배포 (export)       : 8대 타깃 사전 점검(StudioPublishPreflightPanel / studio-export-preflight.ts)
```

### 7.2 IA 어휘 가드레일 (`STUDIO_FORBIDDEN_DEFAULT_UI_TERMS` 준수)
* 사용자에게 노출되는 모든 탐색 메뉴, 브레드크럼, 상태 배지에는 내부 엔진 용어인 `revision`, `리비전`, `lease`, `crdt`, `opfs`, `sqlite`, `provider`, `leader tab`, `follower tab`, `writer tab`, `server lock`, `서버 잠금`을 절대 노출하지 않고, **`저장됨` / `저장 중` / `오프라인에서도 안전` / `확인할 내용이 있어요`**(`STUDIO_USER_WORK_STATES`) 및 **`버전 비교` / `다른 탭에서 열림(읽기 전용)`**으로 순화해 표시합니다.

## 8. [업무 8] 스토리보드 카드와 패널 편집 와이어프레임·예시 컴포넌트

### 8.1 스토리보드 컨트롤 룸 카드 & 우측 패널 편집 와이어프레임
``StudioStoryboardGridPanel.tsx``와 ``studio-storyboard-planner.ts``의 실제 속성(`shotSize`, `camera`, `reserveDialogueAreaRatio`, `scrollGapAfterPx`, `readinessScore`, `priority`, `posePresetId`)을 반영한 와이어프레임입니다.

```text
+---------------------------------------------------------------------------------------------------+
| 스토리보드 컨트롤 룸 · 총 24페이지   [시퀀스*] [검토 큐] [준비도 큐]  [소|중*|대] [컷 나누기] [X] |
|---------------------------------------------------------------------------------------------------|
| [제작 준비도 92%] [즉시 확인 2] [연속 구도 1] [승인 진행률 75%] [샷 정보 누락 1] [검토표 CSV]     |
| [🔍 페이지·메모·샷·담당자·진단 검색 (단축키 /)]  [상태: 전체 페이지 v]  [24/24 표시]              |
+-----------------------------------------------------------------+---------------------------------+
| [스토리보드 카드 그리드 (필터 활성 시 드래그 재배열 자동 잠금)] | [우측 선택 컷/패널 편집기]      |
|                                                                 | 선택됨: 14. 야간 신전 입구      |
| +-----------------------------+ +-----------------------------+ |---------------------------------|
| | [검토 요청]          [복제] | | [수정 요청]          [복제] | | 1. 비트 & 샷 메타데이터         |
| |                      [삭제] | |                      [삭제] | | • 소속 회차: [EP.12 각성     ]  |
| | +-------------------------+ | | +-------------------------+ | | • 소속 씬  : [Scene 03 신전 ]  |
| | |   2:3 썸네일 미리보기   | | | |   2:3 썸네일 미리보기   | | | • 비트 종류: [reveal (반전) v] |
| | |  (medium / shot-reverse)| | | | (close-up / eye-line)   | | | • 샷 크기  : [close-up      v] |
| | +-------------------------+ | | +-------------------------+ | | • 카메라   : [eye-line close]  |
| | 13. 신전 회랑 대화 · 메모   | | 14. 야간 신전 입구 [*]      | |---------------------------------|
| | 담당 김작가    [준비도 100%]| | 담당 박작가   [샷 정보 필요]| | 2. 포즈 추천 & 스크롤 리듬      |
| | [차단 없음: 준비 완료]      | | [즉시 확인: 연속 동일 구도] | | • 포즈 프리셋: [긴장 시선 고정] |
| | 샷: [medium v] 각도:[수평 v]| | 샷: [close-up v] 각도:[미정]| |   [🧍 이 컷에 포즈 추천 열기]   |
| | [🧍 포즈 추천] 정면 응시    | | [🧍 포즈 추천]              | | • 대사 영역 비율: 28% (권장<=42)|
| +-----------------------------+ +-----------------------------+ | • 컷 뒤 스크롤 여백: [ 180 px ] |
|                                                                 |---------------------------------|
|                                                                 | 3. 대사(말풍선) & 연출 요약     |
|                                                                 | • 사건 요약: [신전 문이 열림  ] |
|                                                                 | • 대사 입력: [빛이 사라지고... ]|
|                                                                 |   (100자 초과 시 long-dialogue) |
|                                                                 | • [🎨 이 샷으로 작화 시작 (F-3)]|
+-----------------------------------------------------------------+---------------------------------+
```

* **독립 예시 컴포넌트 위치**: ``ToonStudioStoryboardAndQueueSample.tsx``

## 9. [업무 9] 캐릭터/배경/에셋 라이브러리 검색·필터 UX

### 9.1 ``StudioUnifiedAssetWorkspace.tsx`` 실측 기반 3단 반응형 탐색·필터 명세
실제 구현된 `data-studio-asset-workspace-layout="responsive-three-pane"`(좌측 패싯·컬렉션 사이드바 / 중앙 결과 그리드 / 우측 상세 프리뷰 및 권리 확인 패널) 구조를 기준으로 정의한 검색·필터 UX 명세입니다.

| 구성 영역 | 실제 구현 속성 (`Confirmed Fact`) | 사용자 조작 및 오류 방지 UX 규칙 |
| :--- | :--- | :--- |
| **상단 검색바 & 빠른 검색어** | • 단축키 `/` 포커스 이동 (`handleShortcut`)<br>• 최대 `120자` 입력 제한 (`slice(0, 120)`)<br>• 빈 검색어 상태에서 빠른 검색 칩 6종 노출 (`QUICK_QUERIES`: `학교`, `로맨스`, `밤`, `효과`, `소품`, `3D`) | • 입력 즉시 상태 메시지를 초기화하고 결과를 실시간 필터링합니다.<br>• 검색어 입력 시 우측에 `통합 에셋 검색어 지우기 (X)` 버튼을 노출합니다. |
| **좌측 분류 패싯 (`BROWSE_FACETS` 8종) & 컬렉션 (3종)** | • 8개 패싯: `전체(all)`, `2D 배경(background)`, `장면 레시피(scene-template)`, `스토리 연출(story)`, `캐릭터·포즈(character)`, `소품(prop)`, `3D(3d)`, `내 에셋(mine)`<br>• 3개 컬렉션: `전체(all)`, `즐겨찾기(favorites)`, `최근 사용(recent)`<br>• 카드 밀도 토글: `큰 그리드(visual, 4:3)` vs `작은 그리드(compact, 1:1)` | • 각 패싯 우측에 `tabular-nums` 배지로 해당 카테고리 에셋 개수를 실시간 표시합니다.<br>• 필터 적용 중에는 상단에 `검색 결과 N개` (`role="status"`, `aria-live="polite"`)와 `초기화` 버튼을 노출합니다. |
| **중앙 에셋 카드 그리드** | • 최대 `180개` 항목 바운디드 렌더링<br>• 카드 클릭(상세 선택), 더블클릭 또는 `Enter`(즉시 사용), 하트 버튼(즐겨찾기 토글), 드래그 핸들(`GripVertical`, 캔버스 직접 드롭)<br>• `discoverability === "caution"` 항목에 `권리 확인` 배지 표시 | • 검토 잠금(`reviewLocked === true`) 상태에서는 드래그와 삽입 버튼을 비활성화하고 `"검토 잠금을 해제한 뒤 에셋을 추가해 주세요"` 안내를 표시합니다. |
| **우측 상세 & 권리 확인 게이트 (`caution` 보호)** | • `StudioUnifiedAssetPreviewSurface` (`3D` 에셋은 `interactive` 모드, 일반 에셋은 `thumbnail` 모드)<br>• 내 에셋(`source.kind === "local"`)일 때 삽입 위치 3종 선택(`자동 auto`, `페이지 page`, `선택 영역 selection`)<br>• `discoverability === "caution"`일 때 **권리·출처 확인 체크박스(`acknowledgedCautionId`)** | • `caution` 에셋은 사용자가 `"이 에셋의 사용 조건을 확인했으며 현재 작품에서 사용할 책임이 있음을 이해했습니다"` 체크박스를 켜기 전까지 주 액션 버튼(`useLabel`)을 `disabled`로 잠급니다. |

## 10. [업무 10] 생성 큐·진행률·취소·실패 재시도 상태 명세 (실제 생성 비용 발생 금지)

> **비용 무발생 보장 (`Zero-Cost Local Contract`)**: ``studio-ai-job.ts``의 순수 함수(`createStudioAiJob`, `transitionStudioAiJob`, `studioAiJobUserState`)만을 사용하여 `privacy: "local"`, `cost: "free"`, `estimatedCredits: 0`, `requiresExternalTransfer: false` 조건에서 동작하며, 외부 유료 API 호출이나 과금이 절대 발생하지 않습니다.

### 10.1 ``studio-ai-job.ts`` 9단계 상태 머신 및 한국어 라벨 명세

```text
[draft ("요청 준비")]
   │ event: { type: "request-confirmation" }
   ▼
[awaiting-confirmation ("확인 필요" !)] ──(confirm: accepted=false)──► [cancelled ("취소됨")]
   │ event: { type: "confirm", accepted: true }
   ▼
[queued ("처리 대기")] ───────────────────(event: { type: "cancel" })─► [cancelled ("취소됨")]
   │ event: { type: "start" }
   ▼
[running ("처리 중" · progress 0..1 단조 증가)] ─(event: "cancel")────► [cancelled ("취소됨")]
   ├── event: { type: "fail", code, message } ────────────────────────► [failed ("다시 확인 필요" !)]
   │                                                                       │ (event: { type: "retry" })
   │                                                                       └──► [queued ("처리 대기")]
   ▼ event: { type: "preview", preview }
[preview-ready ("결과 확인" !)] ──────────(event: { type: "retry" })──► [queued ("처리 대기")]
   │ event: { type: "approve" }
   ▼
[approved ("적용 준비" !)]
   │ event: { type: "apply", application: { mode: "copy" | "selection" } }
   ▼
[applied ("사본으로 적용됨")]
```

### 10.2 상태별 UI 명세표 (`studioAiJobUserState` 기준)

| 상태 코드 (`StudioAiJobStatus`) | 공식 한국어 라벨 (`labelKo`) | 사용자 주의 필요 (`requiresAttention`) | 진행률 (`progress`) 및 UI 표시 | 허용 이벤트 (`StudioAiJobEvent`) |
| :--- | :--- | :--- | :--- | :--- |
| **`draft`** | `요청 준비` | `false` | `0%` · 프롬프트 및 입력 스냅샷(`inputSnapshotId`) 검증 | `request-confirmation`, `cancel` |
| **`awaiting-confirmation`** | `확인 필요` | **`true`** | `0%` · 로컬/외부 전송 여부(`requiresExternalTransfer`) 및 예상 크레딧(`0`) 사전 동의 | `confirm (accepted: true/false)`, `cancel` |
| **`queued`** | `처리 대기` | `false` | `0%` · 로컬 작업 큐 대기 순서 표시 | `start`, `cancel` |
| **`running`** | `처리 중` | `false` | `0% ~ 99%` (`0..1` 단조 증가 강제 — 역행 시 예외 차단) | `progress`, `preview`, `fail`, `cancel` |
| **`preview-ready`** | `결과 확인` | **`true`** | `100%` · 원본 캔버스를 덮어쓰지 않고 미리보기(`StudioAiJobPreview`) 비교 제공 | `approve`, `retry`, `cancel` |
| **`approved`** | `적용 준비` | **`true`** | `100%` · 적용 방식(`copy` 사본 생성 vs `selection` 선택 영역) 선택 가능 | `apply`, `retry`, `cancel` |
| **`applied`** | `사본으로 적용됨` | `false` | `100%` · 원본 레이어를 보존한 채 새 객체(`createdObjectIds`)로 안전하게 적용 완료 | (종단 상태 · 감사 로그 `audit` 보존) |
| **`failed`** | `다시 확인 필요` | **`true`** | 실패 시점 고정 · 오류 코드(`error.code`) 및 한국어 복구 가이드 표시 | `retry` (`queued`로 복귀), `cancel` |
| **`cancelled`** | `취소됨` | `false` | 취소 시각(`completedAt`) 및 사유(`user-declined` 등) 기록 | (종단 상태) |

## 11. [업무 11] 내보내기 사전 점검·버전 충돌·자동저장 복구 UX 명세

### 11.1 내보내기 사전 점검 (`studio-export-preflight.ts` 실측 8대 타깃 & 검증 규칙)
``runStudioExportPreflight``에 구현된 실제 검증 코드와 한국어 메시지(`messageKo`)·권장 조치(`suggestedActionKo`) 명세입니다.

| 점검 코드 (`finding.code`) | 심각도 (`severity`) | 발생 조건 (예: `webtoon-platform` 타깃 기준) | 실제 한국어 오류/경고 메시지 (`messageKo`) | 실제 한국어 해결 가이드 (`suggestedActionKo`) |
| :--- | :--- | :--- | :--- | :--- |
| **`format`** | `error` (`blocked`) | 허용 형식(`png`, `jpg`, `jpeg`, `webp`) 외 포맷 선택 | `웹툰 플랫폼에서 {FORMAT} 형식을 사용할 수 없습니다.` | `지원 형식으로 변경하세요.` |
| **`width-exact` / `width-max`** | `error` (`blocked`) | `webtoon-platform` 가로 폭 `800px` 불일치 (또는 `social` `4096px` 초과) | `가로 폭을 800px로 맞춰야 합니다.` | `안전한 비율로 자동 크기 조정을 실행하세요.` |
| **`segment-height`** | `error` (`blocked`) | 분할 이미지 높이 중 `12,800px` 초과 항목 존재 | `분할 이미지 중 최대 12800px를 넘는 항목이 있습니다.` | `원고를 안전한 위치에서 다시 분할하세요.` |
| **`dpi` / `color-space`** | `error` (`blocked`) | `print` 타깃에서 `300 DPI` 미만 또는 색 공간 불일치(`srgb` 외) | `최소 300 DPI가 필요합니다.` / `색 공간 {colorSpace}은(는) 이 대상에 맞지 않습니다.` | `출력 해상도와 실제 인쇄 크기를 다시 확인하세요.` / `미리보기 후 대상 색 공간으로 변환하세요.` |
| **`text-size`** | `warning` | 최소 글자 크기가 권장값(`webtoon-platform` `18px`) 미만 | `일부 글자가 권장 크기 18px보다 작습니다.` | `휴대폰·출력 미리보기에서 가독성을 확인하세요.` |
| **`missing-fonts` / `missing-assets`** | `error` (`blocked`) | 사용할 수 없는 글꼴 또는 연결 끊긴 에셋 존재 | `사용할 수 없는 글꼴이 있습니다.` / `연결이 끊긴 에셋이 있습니다.` | `글꼴을 활성화하거나 안전한 대체 글꼴을 선택하세요.` / `원본을 다시 연결하거나 프로젝트에 포함하세요.` |
| **`rights-blocked` / `ai-disclosure`** | `error` (`blocked`) | 라이선스 미허용 에셋 존재 또는 AI 생성 객체(`aiGeneratedObjectIds`) 표시 누락 | `현재 사용 목적이 허용되지 않는 에셋이 있습니다.` / `필요한 AI 사용 표시가 준비되지 않았습니다.` | `에셋을 교체하거나 필요한 라이선스를 확보하세요.` / `대상 플랫폼 정책에 맞는 표시를 추가하세요.` |
| **`reading-order` / `localization`** | `error` (`blocked`) | 읽기 순서 미완성 또는 현지화 차단 오류(`localizationBlockingIssues > 0`) | `읽기 순서가 완성되지 않았습니다.` / `현지화 오류 {N}건이 남아 있습니다.` | `컷·말풍선·대체 텍스트 순서를 검토하세요.` / `번역·레터링·말풍선 맞춤 검사를 완료하세요.` |

* **최종 판정 요약(`summaryKo`)**:
  * `status === "pass"`: `"내보낼 준비가 되었습니다."`
  * `status === "warning"`: `"내보낼 수 있지만 확인할 항목이 있습니다."`
  * `status === "blocked"`: `"먼저 해결해야 할 항목이 있습니다."` (내보내기 실행 버튼 비활성화)

### 11.2 버전 충돌 3-Way 병합 UX (`studio-workspace-three-way-merge.ts` 실측)
* **자동 병합과 충돌 감지 분리**: ``mergeStudioWorkspaceStates(base, local, external)``는 한쪽 브랜치만 수정한 필드나 서로 다른 속성 경로는 자동으로 병합하고, 양쪽이 동일한 기준값(`base`)을 서로 다르게 수정한 경로만 `conflictPaths`(예: `activeWorkspaceId`, `customWorkspaces["custom-1"].name`, `customWorkspaces.order`)로 반환합니다.
* **사용자 노출 UX (`STUDIO_FORBIDDEN_DEFAULT_UI_TERMS` 준수)**:
  * 내부 용어(`crdt`, `revision`, `leader tab`) 대신 **`"다른 화면에서 수정된 내용과 겹치는 항목이 있어요"`**로 안내합니다.
  * 충돌 해결 선택지: (1) `이 화면의 변경사항 유지(기본값, local-wins)`, (2) `다른 화면의 최신 변경사항 가져오기(external)`, (3) `사본 페이지로 함께 보관하기`.

### 11.3 저장·오프라인·자동저장 복구 UX (`studio-save-recovery-ux.ts` 실측)
``resolveSaveRecoveryView``의 **7단계 우선순위("가장 위험하고 행동이 필요한 상태가 이긴다")**와 **거짓 안심 금지 원칙**을 그대로 반영한 UI 명세입니다.

| 우선순위 | 상태 종류 (`SaveRecoveryKind`) | 발생 조건 | 사용자 노출 상태 라벨 (금지 용어 배제) | 노출 액션 버튼 (`canRetrySave` / `canRecheckConnection`) | 스크린리더 알림 (`SaveRecoveryAnnouncement`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1 (최우선)** | **`readonly`** | `options.readOnlyTab === true` (다른 탭에서 편집 중) | `다른 탭에서 편집 중 · 이 탭은 읽기 전용입니다` | `[이 탭에서 이어서 편집하기]` | `none` (확인 대기 취소) |
| **2** | **`failed`** | `!status.localDurable` (로컬 저장 실패) | `확인할 내용이 있어요 · 이 기기에 저장하지 못했습니다` | `[지금 다시 저장 시도]` (`canRetrySave: true`) | **`failed`** (즉시 경고) |
| **3** | **`offline`** | `connectivity.mode === "offline"` (로컬 내구는 성공) | `오프라인에서도 안전 · 이 기기에 저장됨` | `[연결 다시 확인]` (`canRecheckConnection: true`) | **`connection-lost`** |
| **4** | **`reconnecting`** | `connectivity.mode === "reconnecting"` | `연결을 다시 확인하는 중… (이 기기에 안전하게 보관됨)` | 버튼 비활성 (`checkingConnection: true` 중복 방지) | `none` (확인 대기 유지) |
| **5** | **`server-unavailable`** | `connectivity.mode === "server-unavailable"` (브라우저 온라인이나 서버 응답 없음) | `클라우드 연결 지연 · 이 기기에 안전하게 저장됨` (거짓 `저장됨` 표시 금지) | `[연결 다시 확인]` (`canRecheckConnection: true`) | **`connection-lost`** |
| **6** | **`saving`** | `status.pendingOperationsCount > 0` | `저장 중…` | - | `none` (저장 중 침묵) |
| **7** | **`saved`** | 로컬 내구 완료 & 온라인 동기화 완료 | `저장됨` (장애 복구 직후 도달 시: `연결이 복구되어 모든 변경사항이 동기화되었습니다`) | - | 일반 완료 시 **`saved`** / 장애 경유 복구 시 **`recovered`** |

## 12. [업무 12] 두 앱 공통 디자인 토큰(색/타입/간격), WCAG 접근성 기준과 수동 QA 시나리오

### 12.1 두 앱 실제 디자인 토큰 통합 매핑표 (`shared_design_tokens.json`)
``pilates-flow/src/design-system/tokens.ts``(`PF_COLOR_TOKENS`, `PF_TYPOGRAPHY_TOKENS`, `PF_SPACING_TOKENS`)와 ``toonstudio/apps/web/src/domains/creator/studio-webtoon-design-tokens.ts``(`STUDIO_WEBTOON_DESIGN_TOKEN_DEFAULTS`)를 통합 매핑한 토큰 규격입니다.

| 시맨틱 역할 | Pilates-flow 토큰 (`--pf-*`) | Pilates-flow 실제 값 | ToonStudio 토큰 / 클래스 | ToonStudio 실제 값 | WCAG 2.2 명도 대비 및 용도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **기본 캔버스 배경** | `--pf-color-bg-canvas` / `--studio-canvas` | `#F7F5EF` / `#F5F7F7` | `bg-canvas` / `output.backgroundColor` | `#090D16` (에디터) / `#FFFFFF` (원고) | 기본 작업 공간 배경 |
| **카드·패널 표면** | `--pf-color-bg-surface` | `#FFFEF9` / `#FFFFFF` | `bg-panel` / `bg-card` | `#1E293B` / `#0F172A` | 모달·바텀시트·인스펙터 표면 |
| **본문 주 텍스트** | `--pf-color-text-primary` | `#1E3129` (`#182C30`) | `text-fg` / `typography.color` | `#F8FAFC` (UI) / `#111111` (원고) | `12.6:1` (AAA) 이상 본문·제목 |
| **보조 메타 텍스트** | `--pf-color-text-secondary` / `muted` | `#3D4F45` / `#526358` | `text-fg-2` / `text-fg-3` | `#CBD5E1` / `#94A3B8` | `5.9:1 ~ 8.1:1` (AA~AAA) |
| **주 액션 (Primary)** | `--pf-color-action-primary` | `#173D34` (`#17675C`) | `bg-accent` | `#6366F1` (Indigo) | `11.4:1` (AAA) / `5.4:1` (AA) 핵심 CTA |
| **포커스 링 (Focus)** | `--pf-color-focus-ring` | `#B16F48` (`3px solid`, `offset 3px`) | `focus-visible:ring-accent` | `2px solid var(--accent)` (`offset 2px`) | 비텍스트 UI 대비 `>=3.8:1` (AA) |
| **성공 / 준비 완료** | `--pf-color-status-success-text` | `#254B29` (배경 `#EEF2EA`) | `text-good` / `emerald` | `#6EE7B7` (배경 `#064E3B`) | `8.8:1` (AAA) 예약 가능 / `pass` |
| **주의 / 검토 필요** | `--pf-color-status-warning-text` | `#6B4010` (배경 `#F4F1E3`) | `text-warn` / `amber` | `#FDE68A` (배경 `#78350F`) | `7.9:1` (AAA) 마감 임박·대기 / `warning` |
| **위험 / 차단 오류** | `--pf-color-status-danger-text` | `#8A341E` (배경 `#FFF1F2`) | `text-bad` / `rose` | `#FCA5A5` (배경 `#7F1D1D`) | `7.1:1` (AAA) 폐강·삭제 / `blocked` |
| **기본 서체** | `--pf-font-sans` | `Pretendard, sans-serif` | `typography.fontFamily` | `Pretendard, sans-serif` | 본문 `16px` (`--pf-text-base`), 줄높이 `1.4~1.65` |
| **간격 & 터치 최소치** | `--pf-space-1~8` / `--pf-touch-min` | `4/8/12/16/20/24/32px` / `44px` (`48px`) | `spacing.panelGutterPx` / `min-h-11` | `20px` 컷 간격, `24px` 여백 / `44px`(`2.75rem`) | WCAG 2.2 Target Size AA 이상 충족 |

### 12.2 두 앱 통합 수동 QA 시나리오 (12선)

| 시나리오 ID | 대상 앱 | 검증 대상 업무 | 실행 절차 (Steps) | 기대 결과 (Pass Criteria) |
| :--- | :--- | :--- | :--- | :--- |
| **`QA-PF-01`** | Pilates-flow | 업무 1·2·4 (회원 예약 및 1회 차감) | 1. 잔여 `7회` 회원권 상태에서 `● 예약 가능` 슬롯의 `예약하기` 클릭<br>2. 차감 전후(`7회 → 6회`) 및 12시간 취소 기한 체크박스 선택 후 확정 | • 상단 회원권 잔여 횟수가 `6회 (예약중 1회)`로 즉시 갱신됨<br>• 성공 배너(`role="status"`)에 `"남은 횟수는 6회입니다"` 표시 |
| **`QA-PF-02`** | Pilates-flow | 업무 2·5 (마감 임박 경합 및 대기 전환) | 1. `▲ 마감 임박 (잔여 1석)` 슬롯 클릭 후 동시 마감 시뮬레이션 트리거<br>2. 노출된 배너에서 `[대기 1번 신청하기]` 클릭 | • 오버부킹이 차단되고 `"방금 마지막 자리가 마감되었어요"` 경고 노출<br>• 대기 신청 시 `◆ 대기 1번`으로 정상 등록됨 |
| **`QA-PF-03`** | Pilates-flow | 업무 4·5 (만료일 이후 날짜 선택 차단) | 1. 주간 날짜 스트립(`.schedule-week-strip`)에서 회원권 만료일(`2026-12-31`) 이후 날짜 선택 | • 수강권 배지가 `선택일 기준 만료`로 전환됨<br>• 슬롯 예약 시 `"수강권 유효기간 이후의 수업이에요"` 안내와 함께 차감이 차단됨 |
| **`QA-PF-04`** | Pilates-flow | 업무 3 (반복 일정 회차 변경 vs 전체 변경) | 1. 강사 일정(`InstructorScheduleView`)에서 매주 반복 수업의 `회차 변경` 클릭<br>2. `ScheduleChangeScopePanel`에서 `이번 회차만` 선택 후 시간 변경 | • 반복 원본(`InstructorScheduledClass`)은 유지되고 `reschedule` 예외만 추가됨<br>• 변경 중 원본이 바뀌면(`changeTargetStale`) `"일정이 바뀌었습니다"` 안내 후 안전 중단 |
| **`QA-PF-05`** | Pilates-flow | 업무 5 (오프라인 전환 시 캐시 보호) | 1. 브라우저 오프라인 모드 전환<br>2. 시간표 열람 및 `예약하기` 버튼 클릭 | • 마지막 저장된 시간표가 빈 화면 없이 그대로 표시됨<br>• 예약/취소 액션은 차단되고 `"오프라인 상태예요"` 배너가 노출됨 |
| **`QA-PF-06`** | Pilates-flow | 업무 6 (모바일 `360px`·키보드·스크린리더) | 1. 뷰포트를 `360×800px`로 축소<br>2. `.schedule-week-strip`에서 `ArrowRight`/`Home`/`End` 입력<br>3. 모달 열기 후 `Escape` 입력 | • 가로 스크롤 없이 모든 버튼이 `>=44px`(하단 바 `48px`) 유지<br>• 방향키로 날짜가 이동하고 `Escape` 시 트리거 버튼으로 포커스 복귀 |
| **`QA-TS-01`** | ToonStudio | 업무 7 (기획→콘티 시딩 및 금지 용어 검증) | 1. `EpisodePlan`(`openingHook`, `turningPoints`, `cliffhanger`, `targetCutCount: 12`) 입력 후 콘티 시딩 실행<br>2. 글로벌/프로젝트 메뉴 라벨 검사 | • `setup`·`action`·`reveal` 비트가 생성되고 `cutAllocations` 합이 정확히 `12`와 일치함<br>• UI 라벨에 `crdt`/`opfs`/`sqlite`/`revision` 등 금지 용어가 0건임 |
| **`QA-TS-02`** | ToonStudio | 업무 8 (스토리보드 필터 중 드래그 잠금) | 1. `StudioStoryboardGridPanel` 열기 후 상태 필터를 `수정 요청(changes-requested)`으로 변경<br>2. 카드 드래그 앤 드롭 시도 | • `reorderEnabled`가 `false`가 되어 숨겨진 페이지를 건너뛰는 오배치 드래그가 잠김<br>• 하단 상태바에 `"검색·필터 중에는 ... 재배열이 잠깁니다"` 안내 표시 |
| **`QA-TS-03`** | ToonStudio | 업무 9 (`caution` 에셋 권리 확인 게이트) | 1. `StudioUnifiedAssetWorkspace`에서 `/` 키로 검색창 포커스 후 `권리 확인(caution)` 배지 에셋 선택<br>2. 체크박스 미선택 상태에서 삽입 버튼 확인 후 체크박스 선택 | • 체크 전에는 삽입 버튼이 `disabled`로 잠겨 있음<br>• 권리·출처 확인 체크박스 선택 즉시 삽입 버튼이 활성화됨 |
| **`QA-TS-04`** | ToonStudio | 업무 10 (무과금 로컬 생성 큐 전이·취소·재시도) | 1. 로컬 작업(`privacy: "local"`, `cost: "free"`) 생성 후 `confirm` → `start` → `progress(0.5)` 실행<br>2. `fail` 발생 후 `retry` 실행, 다시 `cancel` 실행 | • 외부 네트워크 호출 0건, 크레딧 차감 `0` 확인<br>• `요청 준비 → 확인 필요 → 처리 대기 → 처리 중(50%) → 다시 확인 필요 → 처리 대기 → 취소됨`으로 정확히 전이됨 |
| **`QA-TS-05`** | ToonStudio | 업무 11 (내보내기 사전 점검 `blocked` 차단) | 1. `webtoon-platform` 타깃 선택 후 가로 폭 `1000px`(규격 `800px` 위반) 및 AI 표시 미준비(`aiDisclosurePrepared: false`) 문서 입력 | • `status: "blocked"`, `blockingCount: 2` 반환<br>• `"가로 폭을 800px로 맞춰야 합니다"`, `"필요한 AI 사용 표시가 준비되지 않았습니다"` 표시 및 내보내기 버튼 비활성화 |
| **`QA-TS-06`** | ToonStudio | 업무 11 (오프라인/서버 장애 저장 복구 신호) | 1. 로컬 저장은 성공(`localDurable: true`)했으나 서버 연결만 끊긴(`server-unavailable`) 상태 주입<br>2. 이후 연결 복구(`saved`) 전이 실행 | • 서버 장애 중 거짓 `"저장됨"`을 표시하지 않고 `"클라우드 연결 지연 · 이 기기에 안전하게 저장됨"` 표시<br>• 복구 완료 시 일반 `saved`가 아닌 **`recovered`** 알림이 발생함 |
