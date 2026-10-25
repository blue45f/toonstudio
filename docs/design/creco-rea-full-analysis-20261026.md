# REA 기반 크레코(Creco) 전체 기능 정밀 역공학 분석 및 ToonStudio 협업 내재화 명세 (2026-10-26)

- **작성일**: `2026-10-26`
- **문서 상태**: `current` (설계 및 클린룸 내재화 기준 문서)
- **관련 문서**:
  - [`docs/design/creco-feature-internalization-20260923.md`](./creco-feature-internalization-20260923.md)
  - [`docs/design/creco-operating-modes-v1.2-20260922.md`](./creco-operating-modes-v1.2-20260922.md)
  - [`docs/design/production-workflows-20260927.md`](./production-workflows-20260927.md)

---

## 1. REA 역공학 증거 원장 (Evidence Ledger)

본 분석은 REA(Reverse Engineer Anything) MCP 도구 체인을 통해 수집한 라이브 브라우저 시나리오 캡처, 정적 번들 추출, AST 정적 분석 및 공식 GitBook 문서 40개 페이지 전수 수집에 기반한다.

| Evidence ID | REA 도구 | 분석 대상 및 산출 요약 |
| --- | --- | --- |
| `ev_ce82a252c8b82c67318e8639d2cd11020f3f357620ceab37f346b5be5f92d563` | `list_browser_targets` | Chrome CDP 디버깅 타깃 탐색 및 연결 검증 |
| `ev_cbb1565d891466029db9db72915306e6464def55e547b34c2fdbda1d0c1f2f16` | `capture_browser_scenario` | `https://creco.so/ko/` 랜딩 페이지 초기 런타임·네트워크·DOM 캡처 |
| `ev_b7141c00c61a0ba11253fb48ae96ea438f1169db64c766e455371d526cac6cb7` | `capture_browser_scenario` | `https://creco.so/ko/` 전체 스크립트 예산(full-budget) 캡처 및 8대 핵심 기능 쇼케이스 추출 |
| `ev_6b748e62b1d8ecd38f6235ba5ceda76a5780ee6e40ab3f77d85c8dd69808a396` | `capture_browser_scenario` | `https://creco.so/ko/pricing/` 요금제(Free/Team/Enterprise), 유료 시트 과금 기준, AI 음영 토큰 정책 캡처 |
| `ev_c8006d88874b9d029d1e179285b39af0273d9444052b4448a574ad5437e92ed9` | `capture_browser_scenario` | `https://app.creco.so/ko/` 웹 애플리케이션 진입점 및 인증·세션 부트스트랩 캡처 |
| `ev_b745f3d3b847f613a14c55a89231cffbd7e7c14969ef92243880b7ce6e2426bc` | `capture_browser_scenario` | `https://app.creco.so/ko/` 전체 정적 번들 메타데이터 및 프리로드 그래프 캡처 |
| `ev_c8ac25222d35eea473afae8e23c68404a3b42f00ecbc775bfeb046e1abe9f112` | `capture_browser_scenario` | `https://creco-1.gitbook.io/docs/` 공식 매뉴얼 사이트맵 및 40개 하위 문서 구조 캡처 |
| `ev_6880977bf4c3544846e0cba351f71402368bf50030dc31bb913bf927cbb05b68` | `export_web_scripts` | `app.creco.so` 런타임 로드 스크립트 번들 내보내기 |
| `ev_cdc789c3fea45de8fd7dff162c6b6454fe69496a2e9d7ce9291a0ec1dd2c84b5` | `export_web_scripts` | `creco.so` 마케팅/요금제 번들 내보내기 |
| `ev_4e098e6d2775cf71b537daabdbe80d51d86ea791de3d8ff5dc5518c2b5412d97` (요약 `ev_4bce129e3bce2d8a2127422f1990e3bf702c34b88838971ddf5c28a30b49870d`) | `analyze_javascript_application` | `index-BWQvWrG-.js` 메인 엔트리 번들 정적 분석 (661,105 AST 노드, 3,805개 라우트·API·스토어·이벤트 발견) |
| `ev_3dd9608382a818d780c5ca2228f068818eed9608417efe7db616d142304fdc8f` (요약 `ev_49c1a045fc9b1e5e61f7e1e81ee36159f352ff4ef72bfb40c9868e446d6cb14c`) | `analyze_javascript_application` | 16개 도메인 기능 청크(`WorkspaceLayout`, `Project`, `Episode`, `Share`, `FeedbackPopout`, `MonitoringTab` 등) 정적 분석 (257,701 AST 노드, 2,215개 발견) |

---

## 2. 프론트엔드 번들 아키텍처 및 실시간 통신 구조

### 2.1 정적 청크(30개) 및 라우트 트리 (`ev_4bce129e...`, `ev_49c1a045...`)

`app.creco.so`는 React + React Router + TanStack Query + Socket.IO + BlockNote(ProseMirror 기반) + WebWorker 아키텍처로 구성된다.

| 라우트 경로 | 담당 청크 | 핵심 기능 |
| --- | --- | --- |
| `/:lng/workspace/:id` | `WorkspaceLayout-Drk4d_mA.js` | 워크스페이스 대시보드, 프로젝트 그리드/리스트, 구성원·시트 관리, 연재처·썸네일 규격 설정, 전체 활동 내역 |
| `/:lng/workspace/:id/invite-members` | `InviteMembers-BuQ7-p75.js` | 워크스페이스 + 다중 프로젝트 동시 초대, 실시간 유료 시트 필요 여부(`시트 필요 여부`) 자동 판별, 권한 안내 모달 |
| `/:lng/project/:id` | `Project-CA8qB8W8.js` | 프로젝트 헤더(즐겨찾기·숨기기·알림·줄임말·태그), 에피소드 탭, 스케줄(타임라인/캘린더) 탭, 모니터링(피드백/버전/활동) 탭 |
| `/:lng/episodes/:id` | `Episode-D2e8k3-8.js`, `EpisodeInfoModal-Cbd3kP-s.js` | 3단 접이식 에피소드 룸(`[`, `]`), 이미지 뷰어(기본 `D`/비교 `C`/가로 `G`), 텍스트 에디터·Diff, 스냅샷 업로드·마감, 핀·영역 피드백, AI 음영 어시스턴트, 썸네일 캡처 |
| `/:lng/episodes/:id/feedback-popout/:feedbackId` | `FeedbackPopout-C7d84m_q.js` | 피드백 상세 및 피드백 생성 모달을 독립 브라우저 창으로 분리(`새 창으로 열기` ↔ `탭 안으로 복귀`), 메인 원고 뷰어와 실시간 양방향 동기화 |
| `/:lng/publish/:id` | `Share-By8c3V6Z.js` | 외부 공유 전용 보안 뷰어(수신인 식별자·날짜 동적 워터마크 오버레이, 비밀번호 인증, NDA 기밀 유지 안내 배너, PC/모바일 전환 `M`, 자동 스크롤 `>`) |
| `/:lng/account/settings` | `AccountSettings-C79wXy9B.js` | 프로필, 비밀번호, 알림 수신 설정, 구독·결제 수단, 회원 탈퇴 |

### 2.2 WebWorker 오프로딩 구조

1. **PDF 페이지 자동 분할 워커 (`pdf.worker.min-*.mjs`)**:
   - 이미지 공정 버전 업로드 시 PDF 파일을 드롭하면 클라이언트 사이드에서 페이지별 고해상도 JPG로 자동 분할하여 페이지 슬롯에 매핑한다.
2. **AI 음영 실시간 합성 워커 (`shader.worker-*.js`)**:
   - `Shad-1`/`Shad-Preview` 모델이 반환한 그레이스케일 음영 마스크에 사용자가 선택한 RGB/Hex 색상과 불투명도를 픽셀 단위 곱하기(`Multiply`) 블렌딩으로 실시간 합성하여 프리뷰 캔버스에 렌더링한다.

### 2.3 Socket.IO 실시간 협업 프로토콜 (`/socket/episodes`)

- **네임스페이스**: `/socket/episodes` (`EpisodeSocketProvider`)
- **룸 구독**: `join-episode` / `leave-episode` (`episodeId` 기준)
- **실시간 접속자 표시**: 현재 에피소드를 열람 중인 구성원 아바타 목록을 우측 패널 상단에 실시간 표시
- **피드백·댓글·이모지·버전 이벤트 브로드캐스트**:
  - 피드백 생성/수정/삭제/해결 상태 변경, 초안 일괄 발행(`publishDrafts`), 공개 범위 일괄 변경(`updateVisibilities`)
  - 스레드 댓글 생성/수정/삭제 및 이모지 리액션 토글
  - 스냅샷(버전) 업로드 완료, 작업 완료(`작업 완료`), 공정 마감(`공정 마감`) 상태 전이 즉시 반영

---

## 3. REST API 241개 엔드포인트 도메인별 요약 (`ev_4bce129e...`)

`index-BWQvWrG-.js` 내 OpenAPI 클라이언트 정의에서 추출한 241개 작업(operation)은 아래 15개 도메인으로 분류된다.

1. **Auth & Account (`/auth/*`, `/accounts/*`, `/users/me/*`)**: 로그인, OAuth, 토큰 갱신, 비밀번호 재설정, 프로필 수정, 개인 알림 설정
2. **Studios / Workspaces (`/studios`, `/studios/{studioId}/*`)**: 워크스페이스 생성·수정·삭제(구독 해지 확인 + `"삭제하기"` 입력 가드), 기본 권한 연동(`defaultPermissionLink`), 작업 시간·기여도 입력 기본값(`workTimeInputMode`)
3. **Publish Platforms (`/studios/{studioId}/publish-platform/*`)**: 워크스페이스 공용 연재처 카탈로그 추가·이름 수정·활성/비활성 토글, 프로젝트별 연재처·연재 시작일·URL·공개 여부 매핑
4. **Episode Thumbnail Sizes (`/studios/{studioId}/episode-thumbnail-size/*`)**: 워크스페이스 표준 에피소드 썸네일 규격(150~1440px, 정방형/가로형/세로형 등) 프리셋 등록·수정·비활성화
5. **Members & Invitations (`/studios/{studioId}/members/*`, `/studios/{studioId}/invitations/*`)**: 통합 초대(워크스페이스 역할 + 다중 프로젝트·공정 권한 동시 부여), 초대 링크 7일 만료 및 재전송, 멤버 역할/권한 변경, 내보내기
6. **Subscriptions & Seats (`/studios/{studioId}/subscriptions/*`, `/studios/{studioId}/seats/*`)**: 플랜(Free/Team/Enterprise), 유료 시트 수량 조정, 시트 할당/회수/취소 예정 시트 재할당(`시트 관리`)
7. **Projects (`/studios/{studioId}/projects`, `/projects/{projectId}/*`)**: 프로젝트 생성·복제·삭제, 줄임말(`abbreviation`, 최대 8자), 태그(최대 30개), 즐겨찾기, 사용자별 숨김(`isHidden`), 프로젝트별 알림 토글(멘션은 항상 수신), 건너뛸 에피소드 수(`skipEpisodeCount`)
8. **Processes (`/projects/{projectId}/processes/*`)**: 커스텀 공정 추가(최대 10자, `IMAGE` 이미지 공정 vs `TEXT` 텍스트 공정), 순서 드래그 변경, 공정별 6단계 권한(`관리 허용`~`접근 제한`) 설정
9. **Episodes (`/projects/{projectId}/episodes/*`, `/episodes/{episodeId}/*`)**:
   - 단일 추가: `일반 회차`(마지막 회차 번호 +1 자동 부여) 또는 `특별 회차`(기준 에피소드 앞/뒤 배치, 번호 미부여)
   - 복수 추가(`batchCreateEpisodes`): 시작~종료 회차 번호 범위 일괄 생성(기존 번호 자동 건너뜀)
   - 삭제: 단순 삭제 vs `삭제하고 기존 회차 당기기`(뒤이은 일반 회차 번호 -1 자동 감소)
   - 트리트먼트(`treatment` 시놉시스) 작성·검색, 페이지별 컷 수(`cutCount`) 수동/자동 합산
10. **Snapshots / Versions (`/episodes/{episodeId}/processes/{processId}/snapshots/*`)**:
    - 3종 업로드 모드(기본 일괄 업로드, 개별 페이지 슬롯 업로드, 기존 페이지 조합 생성)
    - 중복 파일 바이트·해상도 검사 및 페이지별 5종 변경 배지(`신규 등록`, `업데이트`, `중복 생략`, `변경 없음`, `결과물 없음`)
    - 3단계 공개 범위(`PUBLIC` 공개, `RESTRICTED` 일부 공개[편집 허용 이상], `PRIVATE` 비공개[작성자 전용]) 및 상위 공개 범위 좁히기 규칙
    - 2단계 완료: 작업자 `작업 완료`(소요 작업 시간 기록) → 관리자 `공정 마감`(최종 버전 고정 + 미해결 공개 피드백 일괄 완료 여부 선택 + 작업자 기여도 % 배분)
    - 버전 아카이브(`isArchived`) 분리 및 고유 결과물 동반 삭제 옵션
11. **Pages & Text Blocks (`/snapshots/{snapshotId}/pages/*`, `/episodes/{episodeId}/text-blocks/*`)**:
    - 이미지 페이지 순서 이동, 교체, 개별 다운로드, 페이지별 컷 수·파일 용량·해상도 메타데이터 조회
    - 텍스트 공정 11종 블록 에디터, 블록 고유 딥링크(`블록 URL 복사`), 버전 간 나란히 `Diff 비교`(`빈 자리 표시` 포함)
12. **Feedbacks & Comments (`/episodes/{episodeId}/feedbacks/*`, `/feedbacks/{feedbackId}/comments/*`)**:
    - 캔버스 핀·드래그 크롭 영역(페이지 경계 교차 및 여백 밖 시작 허용), 자유 드로잉 오버레이(`drawingData`)
    - 3단계 중요도(`REQUIRED` 필수[관리 허용 이상], `RECOMMENDED` 권장, `SUGGESTION` 제안)
    - 3단계 공개 범위(`PRIVATE` 초안, `RESTRICTED` 일부 공개, `PUBLIC` 공개), 내 초안 전체 발행(`초안 전체 발행`), 공개 상태 일괄 변경(`공개 상태 일괄 변경`)
    - 스레드 댓글(드로잉 첨부 가능) 및 이모지 리액션, 원문 블록 삭제 시 `원본 컨텐츠 삭제됨` 배지로 고아 피드백 보존
13. **Schedules & Deadlines (`/projects/{projectId}/schedules/*`, `/projects/{projectId}/deadlines/*`)**:
    - 일/주/월 간트 타임라인 및 캘린더 뷰, 우클릭 슬롯 빠른 추가(`일정 추가` / `마일스톤 추가` / `데드라인 추가`)
    - 데드라인 일괄 생성·반복 주기 수정·일괄 삭제(기간/회차 범위, 대상 공정, 반복 주기 일수, 주말 포함 여부, 특별 회차 무시 여부, 기존 일정 덮어쓰기 여부, 프리뷰 마커, 드래그 이동 시 후속 회차 연쇄 이동 `일괄 수정` vs `해당 일정만 수정`)
    - 공정 막대 상세: 첫 공개 버전 업로드 시각 - 작업 시간 기반 시작 시각 자동 산출, 작업자별 기여도 자동 배분(`시간 비율 배분` / `인원 균등 배분`, 합계 100%)
14. **Monitoring & Activity History (`/projects/{projectId}/monitoring/*`, `/studios/{studioId}/histories/*`)**:
    - 프로젝트 모니터링 3탭(`피드백` 전수 테이블 / `버전` 트리 및 작업 시간·기여도 / `활동` 감사 로그)
    - 테이블 컬럼 표시/숨김 커스터마이징(`테이블 편집`), 탈퇴한 멤버 포함 필터, 선택 컬럼 기준 CSV 내보내기
15. **AI Assistant & Share/Export (`/ai/shading/*`, `/episodes/{episodeId}/export`, `/projects/{projectId}/publishes/*`)**:
    - AI 음영 어시스턴트(`Shad-1`/`Shad-Preview`): 영역 크롭 → 광원 위치(8방위 + `정면`/`역광`/`최적`) → 음영 스타일(`하드 엣지`/`소프트 엣지`) → 음영 양(`역광`/`보통`/`좁음`) → 2K(40토큰)/4K(55토큰) 자동 추천 → 실시간 색상·곱하기 프리뷰 → `합쳐진 결과물` vs `분리된 결과물` 투명 PNG 다운로드
    - 내보내기(`내보내기`): 파일명·접두사 설정, 3종 리사이즈(`고정 사이즈` 예: 720×1100 분할 / `비율 유지` 360~1440px / `원본`), 포맷(JPG/PNG/PDF), 품질(`최고 품질`/`고품질`/`일반`), 에피소드 썸네일 규격 포함 ZIP 패키징
    - 보안 공유 링크(`공유하기`): 다중 회차·다중 공정·버전 선택(`공개`/`일부 공개`), 수신인 식별자, 비밀번호, 만료일, 동적 워터마크(`수신인 정보 + 조회 날짜`), NDA 기밀 유지 서약 배너, 공유 메시지 템플릿 복사, 즉시 활성/비활성 토글

---

## 4. 공식 매뉴얼 40개 페이지 전수 분석 요약 (`ev_c8ac2522...`)

GitBook(`creco-1.gitbook.io/docs`) 40개 마크다운 문서에서 확인한 세부 규칙과 권한·상태 전이 계약은 다음과 같다.

### 4.1 권한 및 시트 과금 규칙 (`권한 안내` & `시트 관리`)
- **워크스페이스 역할(4단계)**: `소유자(Owner)`, `관리자(Admin)`, `멤버(Member)`, `게스트(Guest)`
- **프로젝트 권한(7단계)**: `전체 허용`, `관리 허용`, `편집 허용`, `제한된 편집 허용`, `의견 허용`, `보기 허용`, `접근 허용(권한 없음)`
- **공정 권한(6단계)**: `관리 허용`, `편집 허용`, `제한된 편집 허용`, `의견 허용`, `보기 허용`, `접근 제한`
- **시트 필요 여부 자동 계산 규칙**:
  - 워크스페이스 역할이 `소유자`/`관리자`/`멤버`이거나, 게스트라도 단 하나의 프로젝트/공정에서 **`제한된 편집 허용` 이상**(버전 업로드·작업 완료 가능) 권한을 가지면 **유료 시트 1개 필요**
  - 워크스페이스 `게스트`이면서 모든 참여 프로젝트/공정 권한이 **`의견 허용` / `보기 허용` / `접근 허용` 이하**이면 **무료(시트 불필요)**

### 4.2 뷰어 단축키 및 비교 동기화 규칙 (`뷰어 모드`, `단축키`)
- **`[` / `]`**: 좌측 패널(에피소드·버전·페이지 목록) / 우측 패널(피드백·어시스턴트·썸네일) 접기·펼치기
- **`T`**: 뷰어 플로팅 툴바 위치 전환 (`좌측` → `하단 중앙` → `우측`)
- **`D` / `C` / `G`**: 기본 세로 모드(`D`) / 비교 모드(`C`) / 가로 스프레드 모드(`G`)
- **`M`**: 디바이스 미리보기 전환 (`PC` ↔ `모바일`)
- **`H` / `Esc`**: 뷰어 UI 숨기기 토글
- **`V`**: 최적 너비 고정 토글 (`720px` / `1080px` 픽셀 고정, 줌 비활성)
- **`>`**: 자동 스크롤 재생 및 속도 순환 (`x1.0` → `x1.5` → `x2.0` → `x3.0` → 정지)
- **비교 모드(`C`) 3종 동기화**:
  - **`A` (전체 동기화)**: 모든 비교 창의 페이지 인덱스와 스크롤 위치를 강제 일치
  - **`S` (스크롤 동기화)**: 현재 각 창에 맞춰 둔 수동 스크롤 오프셋 차이를 유지한 채 함께 스크롤
  - **`P` (페이지 높이 비례 동기화)**: 공정별로 원고 총 세로 길이가 다를 때 페이지 높이 비율(%)에 맞춰 동기화
  - **타 회차 사이드 뷰어(`사이드 뷰어`)**: 현재 회차 공정 비교 옆에 이전/다음 회차 원고를 최대 2개까지 보조 창으로 띄워 설정·연출 연속성을 대조

---

## 5. ToonStudio 클린룸 내재화 매핑 (Clean-Room Implementation Mapping)

크레코의 모든 협업·제작·검수·스케줄·모니터링·AI 보조·공유 기능을 ToonStudio의 아키텍처 원칙(ProjectGraph 단일 진실 공급원, 3층 권한 분리, 강압적 감시 배제, 클린룸 자체 구현)에 맞춰 아래 표면에 100% 내재화한다.

| 크레코 도메인 기능 | ToonStudio 내재화 표면 및 모듈 | 구현 상태 및 보강 내용 |
| --- | --- | --- |
| **뷰어 모드(`D`/`C`/`G`), 툴바 위치(`T`), 디바이스 프리뷰(`M`), 최적 너비 고정(`V`: 720/1080px), 자동 스크롤(`>`), 패널 접기(`[`,`]`), UI 숨김(`H`)** | [`ProductionEpisodeReviewRoom.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionEpisodeReviewRoom.tsx), [`ProductionViewerControlsBar.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionViewerControlsBar.tsx), [`production-viewer-controls-model.ts`](../../apps/web/src/domains/creator/production-hub/production-viewer-controls-model.ts) | 플로팅 툴바 도킹(`좌측`/`하단`/`우측`), 세로/비교/가로 스프레드 모드, PC/모바일 프레임, 720px/1080px 고정 폭, x1.0~x3.0 자동 스크롤, 단축키 도움말(`?`) 완비 |
| **피드백 중요도(`필수`/`권장`/`제안`), 3단계 공개 범위(`비공개` 초안/`일부 공개`/`공개`), 초안 일괄 발행, 피드백 포커스 독, 새 창 팝아웃(`새 창으로 열기`/`탭 안으로 복귀`)** | [`ProductionEpisodeReviewRoom.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionEpisodeReviewRoom.tsx), [`ProductionViewerControlsBar.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionViewerControlsBar.tsx) | 핀·영역 피드백의 3단계 중요도 및 공개 범위 필터, 초안 일괄 발행·공개 범위 일괄 변경, 스크롤 연동 피드백 포커스 사이드 독, `BroadcastChannel` 연동 팝아웃 검수 창 지원 |
| **비교 모드 3종 동기화(`A` 전체 / `S` 오프셋 유지 스크롤 / `P` 페이지 높이 비례) 및 타 회차 사이드 뷰어(최대 2개)** | [`CompareReviewViewer.tsx`](../../apps/web/src/domains/creator/production-hub/CompareReviewViewer.tsx), [`CompareReviewRoom.tsx`](../../apps/web/src/domains/creator/production-hub/CompareReviewRoom.tsx), [`production-viewer-controls-model.ts`](../../apps/web/src/domains/creator/production-hub/production-viewer-controls-model.ts) | 기존 나란히/슬라이더/깜빡/오버레이 비교에 `A`/`S`/`P` 3종 스크롤 동기화 모드, 타 회차 보조 사이드 뷰어(최대 2개 슬롯), 비교 화면 URL 공유 통합 |
| **버전(스냅샷) 3단계 공개 범위, 활성/아카이브 탭, 페이지 5종 변경 배지, 페이지별 컷 수·파일 정보, 2단계 마감(`작업 완료` → `공정 마감` + 미해결 피드백 일괄 완료 + 기여도 자동 배분), 텍스트 공정 블록 URL 복사 & 빈 자리 표시 Diff** | [`ProductionManuscriptSnapshotPanel.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionManuscriptSnapshotPanel.tsx), [`ProductionSnapshotLifecycleSuite.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionSnapshotLifecycleSuite.tsx), [`production-snapshot-lifecycle-model.ts`](../../apps/web/src/domains/creator/production-hub/production-snapshot-lifecycle-model.ts) | 스냅샷 공개 범위(`공개`/`일부 공개`/`비공개` 및 범위 좁히기 검증), 활성/아카이브 분리, `작업 완료`(소요 시간) → `공정 마감`(미해결 피드백 완료 옵션 + `시간 비율 배분`/`인원 균등 배분`), 페이지별 컷 수 인라인 편집·파일 규격 인스펙터, 텍스트 블록 딥링크 및 `빈 자리 표시` Diff 비교 제공 |
| **에피소드 단일(일반/특별 회차)·복수 범위 추가, 회차 번호 당기기 삭제(`-1`), 트리트먼트 검색, 데드라인 일괄 생성·반복 주기 수정·일괄 삭제** | [`ProductionEpisodeOperationsWorkspace.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionEpisodeOperationsWorkspace.tsx), [`ProductionScheduleWorkspace.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionScheduleWorkspace.tsx), [`ProductionBatchScheduleSuite.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionBatchScheduleSuite.tsx), [`production-batch-schedule-model.ts`](../../apps/web/src/domains/creator/production-hub/production-batch-schedule-model.ts) | 일반/특별 회차 단일 생성, 시작~종료 번호 복수 회차 일괄 생성(기존 번호 건너뜀), 회차 당기기 삭제 시뮬레이션, 트리트먼트 시놉시스 검색, 데드라인 일괄 생성/반복 주기 수정/일괄 삭제(주말 포함·특별 회차 무시·덮어쓰기·연쇄 이동) |
| **AI 음영 어시스턴트(`광원 8방위+정면/역광/최적`, `하드/소프트 엣지`, `음영 양`, `2K/4K 토큰 추정`, 실시간 RGB/Hex 곱하기 블렌드 미리보기, `합쳐진/분리된 결과물` PNG 다운로드)** | [`ProductionFocusedAiWorkflow.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionFocusedAiWorkflow.tsx), [`production-shading-assistant-model.ts`](../../apps/web/src/domains/creator/production-hub/production-shading-assistant-model.ts) | 11종 광원 프리셋, 엣지 스타일·음영 양 조절, 해상도별(2K 40토큰 / 4K 55토큰) 자동 추천, 실시간 RGB/Hex 음영 색상 곱하기(`Multiply`) 캔버스 프리뷰, 레이어 병합/분리 투명 PNG 출력 |
| **프로젝트 통합 모니터링 3탭(`피드백` / `버전` / `활동`), 컬럼 표시 편집(`테이블 편집`), 탈퇴 멤버 필터, CSV 내보내기** | [`ProductionActivityWorkspace.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionActivityWorkspace.tsx), [`ProductionMonitoringSuite.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionMonitoringSuite.tsx), [`production-monitoring-suite-model.ts`](../../apps/web/src/domains/creator/production-hub/production-monitoring-suite-model.ts) | 피드백 전수 조사 테이블(중요도·상태·페이지·본문 검색), 버전 트리(작업 시간·기여도 표시), 활동 로그 및 `테이블 편집` 컬럼 선택기, 탈퇴 멤버 포함 토글, 선택 컬럼 CSV 다운로드 |
| **워크스페이스 연재처 카탈로그, 표준 썸네일 규격(150~1440px), 통합 초대 실시간 시트 필요 여부 계산기 & 7×6 권한 매트릭스 안내, 고급 내보내기(3종 리사이즈·포맷·품질·썸네일 포함) & 보안 공유(수신인·동적 워터마크·NDA·즉시 활성 토글)** | [`OrganizationHomePage.tsx`](../../apps/web/src/domains/creator/production-hub/OrganizationHomePage.tsx), [`ProductionTeamSurface.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionTeamSurface.tsx), [`OneClickVersionShare.tsx`](../../apps/web/src/domains/creator/production-hub/OneClickVersionShare.tsx), [`ProductionQuickExportPanel.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionQuickExportPanel.tsx), [`ProductionWorkspaceGovernanceSuite.tsx`](../../apps/web/src/domains/creator/production-hub/ProductionWorkspaceGovernanceSuite.tsx), [`production-workspace-governance-model.ts`](../../apps/web/src/domains/creator/production-hub/production-workspace-governance-model.ts) | 연재처 관리, 에피소드 썸네일 규격 프리셋(150~1440px 검증), 초대 시 유료 시트 필요 여부 실시간 판별기, 7단계 프로젝트·6단계 공정 권한 매트릭스 가이드, 3종 리사이즈(고정 분할 720×1100 / 비율 유지 360~1440px / 원본) 내보내기, 수신인+조회일 동적 워터마크·NDA 서약·즉시 활성 토글 공유 |
