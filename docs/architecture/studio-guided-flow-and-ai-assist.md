# 스튜디오 3단계 가이드 흐름 및 창작 보조 모듈 아키텍처

- 상태: **현재 권위 문서**
- 최종 갱신: **2026-11-10**

## 목적과 적용 범위

이 문서는 초보 창작자와 숙련 작가가 동일한 작업 공간에서 길을 잃지 않도록 구성한
**3단계 창작 여정(`1. 작품 시작 -> 2. 원고 편집 -> 3. 저장·내보내기`)** 모듈 경계와
**서버 전용 AI 창작 보조(`studio-ai`)** 구조를 정리한다.

저장소 전체 경계는 [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), 프런트엔드 계층 규칙은
[`frontend-layered-architecture.md`](frontend-layered-architecture.md), 스튜디오 저장·렌더링
경계는 [`studio-current-boundaries.md`](studio-current-boundaries.md)를 따른다.

## 외부 창작 도구 원리 재해석 기준

기존 도구의 화면을 복제하지 않고 검증된 상호작용 원리만 추출해 웹툰·만화 제작 흐름에 맞게 내재화한다.

- **매체별 안전영역 및 모바일 가독성**: `StudioCanvasSafeZoneSimulator`에서 생성 전 가로·세로 픽셀 크기와 선택한 작품 형식(`vertical-webtoon`, `cuttoon`, `page-comic`, 가로 와이드 작업실)에 맞춰 세로 스크롤 화면 분량·컷 호흡, SNS 카드 세트 장수, 페이지 재단 여백, 와이드 자막 안전영역을 즉시 시뮬레이션해 보여 준다.
- **점진적 노출(Progressive Disclosure)**: 필수 선택(작품 형식, 시작 단계, 출고 대상)만 전면에 두고 세부 해상도·DPI·색 공간·협업 옵션은 `<details>` 접힘 영역 아래로 분리한다.
- **초보자 단축키 습득 및 빠른 기능 탐색**: `StudioBeginnerQuickTipsBar`에서 필수 6대 단축키·터치 제스처 요약과 전역 명령 팔레트 실행을 한곳에 묶는다.
- **출고 전 점검과 즉시 이동**: `StudioExportPanel`에서 권장 규격 원클릭 복원과 권리·소재·다국어·피드백 점검 화면 바로가기를 제공한다.

## 프런트엔드 하위 모듈 구조 (`guided-flow/`)

`config/architecture-source-ratchet.json`의 루트 파일 수 상한을 준수하고 응집도를 높이기 위해,
안내형 창작 흐름 모듈은 `apps/web/src/domains/creator/studio-shell/guided-flow/` 아래에 배치한다.

- `guided-flow/studio-guided-flow-catalog.ts`: 시작 화면(`/create`)과 생성 화면(`/studio/new`)이 공유하는 단일 장르 프리셋 원장(`STUDIO_GUIDED_GENRE_STARTERS`), 로케일·템플릿 일관성 링크 생성기(`buildGuidedGenreStarterHref`), 6대 필수 단축키(`STUDIO_ESSENTIAL_SHORTCUTS`), 비유한 수치 방어를 포함한 순수 매체 안전영역 계산기(`analyzeMobileSafeZone`).
- `guided-flow/StudioCanvasSafeZoneSimulator.tsx`: 작품 형식과 가로·세로·페이지 수에 따른 매체별 안전영역 미리보기 컴포넌트.
- `guided-flow/StudioCreateProductionPlanSection.tsx`: 선택형 회차 제작 계획 설정 섹션 컴포넌트(시작 단계 변경 시 생성 레인 동기화).
- `guided-flow/StudioBeginnerQuickTipsBar.tsx`: 접이식 단축키·터치 제스처 요약 및 기능 찾기 팔레트 실행 바.
- `guided-flow/CreateStartContinueSection.tsx`: 시작 화면 하단의 이어 작업하기 및 공개 작품 둘러보기 분리 섹션.
- `guided-flow/studio-assistant-session-store.ts`: 프로젝트별 창작 보조 초안과 최근 결과를 런타임 스키마 검증과 함께 `sessionStorage` 범위로 보존·초기화하는 저장소. `StudioProjectAssistantPanel`은 `key={projectId}` 경계와 `AbortController` 요청 취소 제어를 강제해 프로젝트 전환 시 교차 오염을 차단한다.
- 상위 연결 파일:
  - [`../../apps/web/src/domains/creator/CreateStartPage.tsx`](../../apps/web/src/domains/creator/CreateStartPage.tsx)
  - [`../../apps/web/src/domains/creator/studio-shell/StudioModeProjectCreatePage.tsx`](../../apps/web/src/domains/creator/studio-shell/StudioModeProjectCreatePage.tsx)
  - [`../../apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.tsx`](../../apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.tsx)
  - [`../../apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx`](../../apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx)

## 백엔드 창작 보조 모듈 구조 (`apps/api/src/modules/studio-ai/`)

- `studio-openai-creative-assist.controller.ts` 및 `studio-openai-creative-assist.dto.ts`: 전역 세션 미들웨어가 검증한 로그인 사용자(`x-user-id`) 경계와 신뢰 프록시 기반 IP 해석(`resolveRequestClientIp`) 위에서 상태 조회 및 4모드 창작 보조 실행 경로를 담당하며, 클라이언트 연결 종료 시 업스트림 `AbortController`를 즉시 중단한다.
- `openai-assist/studio-openai-guardrails.ts`: 연락처·주민/외국인등록번호·카드번호·API 토큰을 마스킹하는 사전 컴파일 정규식과 LRU 상한·일일 버킷 자동 정리·일시 장애 슬롯 반환(`quota.release()`)을 갖춘 호출 제한기를 제공한다.
- `openai-assist/studio-openai-prompt-catalog.ts`: 4가지 보조 모드(`idea-remix`, `script-to-cuts`, `dialogue-polish`, `export-preflight-coach`) 정의와 구조화 JSON 응답 스키마를 관리한다.
- `studio-openai-creative-assist.service.ts`: 인증 정보를 서버 환경변수에서만 읽으며, 비저장(`store: false`) 요청 옵션·타임아웃/네트워크/스키마 오류 시 쿼터 자동 복원·한도 초과 시 과금 없는 안전 중단 규칙을 집행한다.

## 번들 예산 및 검증 규칙

1. 서비스 워커 핵심 프리캐시(`criticalBytes <= 2,588,672 B`) 한도를 지키기 위해 신규 컴포넌트는 공통 디자인 토큰 클래스와 이미 등록된 아이콘 모듈만 사용한다.
2. 새 프런트엔드 모듈은 반드시 실제 라우트 경로에 연결해 미연결 코드 점검에서 신규 항목이 `0`이어야 한다.
3. 변경 후 `pnpm run validate:architecture`, `pnpm run check:studio-bundle`, API 및 Web 단위 테스트를 모두 통과해야 한다.
