# 스튜디오 3단계 가이드 흐름 및 창작 보조 모듈 아키텍처

- 상태: **현재 권위 문서**
- 최종 갱신: **2026-11-18**

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
- `studio-openai-creative-assist.service.ts`: 인증 정보를 서버 환경변수에서만 읽으며, `store: false` 요청 옵션과 구조화 출력 검증을 적용한다. 요청 전송부터 응답 본문 수신까지 타임아웃·사용자 취소를 유지하고, 크레딧 소진과 프로젝트·조직 지출 한도 초과를 구분해 자동 재시도 없이 오류로 반환한다. 종료된 `gpt-4.1-nano` 및 해당 스냅샷 설정은 다른 모델로 대체하지 않고 호출 전에 차단한다.

### 비용·개인정보 보장의 범위

- 상태 응답의 `configured`는 서버 키의 설정 여부이며, 키 유효성·조직 크레딧 잔액·모델 접근 권한을 실시간 조회한 결과가 아니다. `autoBillingDisabled: null`은 계정 과금 설정 **미확인**을 뜻하고, `modelConfigurationError: "retired"`는 종료된 모델 설정을 뜻한다.
- 분당·시간당·일일 요청 제한은 프로세스 메모리에 저장하는 호출 횟수 제한이다. 달러 예산이나 조직 전체의 청구 한도가 아니며, 서버 재시작·복수 인스턴스 사이에 공유되지 않는다. 오류 시 `quota.release()`는 로컬 호출 슬롯만 반환한다. 이미 업스트림에서 처리한 토큰 비용이 환불되거나 취소된다는 뜻은 아니다.
- 이 기능은 크레딧 구매나 자동 충전 설정을 변경하지 않는다. 실제 계정의 무료 크레딧·구매 잔액·자동 충전·후불 과금·지출 한도는 OpenAI 관리 화면에서 별도로 확인해야 한다. 무료 크레딧 이후 구매 잔액으로 사용이 이어질 수 있으므로, `store: false`나 요청 횟수 제한만으로 추가 과금 방지를 보장하지 않는다.
- `store: false`는 응답 저장 옵션이다. 기본 악용 모니터링 로그까지 모두 없애는 설정은 아니며, 요청 전 마스킹은 알려진 문자열 패턴에 한정된다. [OpenAI 데이터 제어 안내](https://developers.openai.com/api/docs/guides/your-data)를 따른다.

크레딧의 실제 잔액·사용액·만료 시각·적격 모델은 계정별 확인 사항이다. 프로모션의 일반 조건과 구독 종료의 관계는 [ChatGPT API 크레딧 안내](https://developers.openai.com/api/docs/guides/chatgpt-api-credits), 계정 지출 한도는 [지출 한도 안내](https://developers.openai.com/api/docs/guides/spend-limits)를 참조한다. 코드의 상태 응답은 이를 확인했다는 증빙으로 사용할 수 없다.

### 제한된 합성 원고 평가

`scripts/studio-openai-credit-evaluation.mts`는 실제 서비스의 프롬프트·요청 본문·JSON Schema·출력 파서를 재사용하는 일회성 평가 실행기다. 운영 API나 환경변수를 변경하지 않으며, 기본 실행은 외부 통신 없는 `dry-run`이다. 저장소 루트에서 다음과 같이 실행한다.

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json \
node --import tsx scripts/studio-openai-credit-evaluation.mts --dry-run
```

고정 합성 사례는 한국어 대사 6개, 컷 분할 2개, 발상 리믹스 1개, 문구·소개글 점검 1개다. 각각 `gpt-4o-mini`와 `gpt-4.1-mini`로 비교한다. 실제 파일의 해상도·글꼴·저작권 판정이나 이미 모의 테스트가 확인하는 오류 경로를 모델 호출로 반복 검사하지 않는다.

| 평가 범위 | 예정 호출 | 보수적 비용 예약 합계 |
| --- | ---: | ---: |
| 한국어 대사·관계·조건 보존 | 12 | $0.028015 |
| 컷 분할·무언 장면·회상 연속성 | 4 | $0.009638 |
| 다섯 발상의 구별과 제약 보존 | 2 | $0.004738 |
| 문구·소개글만으로 가능한 마감 조언 | 2 | $0.004714 |
| 합계 | 20 | $0.047105 |

이 계획값은 2026-11-18의 [gpt-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)·[gpt-4.1-mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) 표준 단가를 사용하고, 전체 직렬화 요청의 UTF-8 바이트 수에 프레이밍 여유 1,024와 출력 1,400토큰을 더해 예약한다. 실제 토큰 수나 청구액이 아니며, 프롬프트·스키마가 바뀌면 dry-run으로 다시 계산해야 한다.

실제 실행은 `--execute --evidence /비공개/계정확인.json`을 명시해야 한다. 실행기 계약은 실패 포함 최대 20회·크레딧 $1·추가 유료 지출 $0이다. 계정 확인 증거에는 계획 해시, 1시간 이내의 잔액·만료·적격 모델 확인, 실제 키의 해시와 조직·프로젝트 일치, 자동 충전 중지와 추가 유료 지출 차단 근거가 필요하다. 실행기는 근거의 진위를 계정에 조회하지 않으므로, 미확인 항목을 임의의 확인값으로 채우면 안 된다. 날짜만 확인한 만료는 `creditExpiresOn`에 기록하고, 그 전날 00:00Z부터 실행을 막는다. 이 보수적 실행 차단 시각은 실제 만료 시각과 구분한다.

모든 호출은 한 서비스·고정 사용자 식별자로 13초 이상 간격을 두며 자동 재시도하지 않는다. 전송 전 비용 예약과 일회 실행 잠금을 Git 내부 비공개 보고서에 남긴다. 오류·누락 사용량·알 수 없는 단가·잘린 출력·구조화 계약 위반이면 즉시 중단하고, 비용이 미확정인 요청은 예약을 유지한다. 실제 반환 모델·사용량·응답 시간과 합성 출력은 보고서에 기록하지만, 한국어 자연스러움과 창작 품질의 사람 평가는 `not-performed` 상태로 별도 남긴다. 구조화 계약 통과를 품질 점수로 해석하지 않는다.

## 번들 예산 및 검증 규칙

1. 서비스 워커 핵심 프리캐시(`criticalBytes <= 2,588,672 B`) 한도를 지키기 위해 신규 컴포넌트는 공통 디자인 토큰 클래스와 이미 등록된 아이콘 모듈만 사용한다.
2. 새 프런트엔드 모듈은 반드시 실제 라우트 경로에 연결해 미연결 코드 점검에서 신규 항목이 `0`이어야 한다.
3. 변경 후 `pnpm run validate:architecture`, `pnpm run check:studio-bundle`, API 및 Web 단위 테스트를 모두 통과해야 한다.
