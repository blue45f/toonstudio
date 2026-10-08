# 에이전트 채널 스키마 계약

- 상태: **target** (설계 확정 문서 — 구현은 아직 없다. 아래에서 `[실재]`로 표시한 것만 현재 repo에 존재하고, 나머지는 전부 `[제안]`이다)
- 작성일: 2026-10-08
- 실측 기준: main `b5476a3e7` (git object store 기준 전수 대조)
- 위치 근거: 인터페이스 계약 문서는 `docs/interfaces/`에 둔다 (`2026-09-18-creator-intelligence-providers.md` 선례)

## 0. 표기 규칙

| 표기 | 뜻 |
| --- | --- |
| `[실재]` | 기준 커밋의 source/tests에서 확인한 사실. 파일 경로를 함께 적는다 |
| `[제안]` | 이 문서가 고정하는 설계. 아직 코드가 없다 |
| `[미결정]` | §11 목록으로 분리한 항목. 임의로 정하지 않는다 |

## 1. 목적 / 비목적

### 1.1 목적 `[제안]`

외부·내부 에이전트(사람이 운용하는 자동화 포함)가 ToonStudio 스튜디오 기능과 상호작용할
공식 통로 **에이전트 채널**의 계약을, 구현보다 먼저 스키마로 고정한다.

- 도구(액션) 단위 호출: 에이전트는 화면을 조작하지 않고 이름 붙은 도구를 호출한다.
- 권한·승인이 계약에 내장된다: 읽기/쓰기 구분, 건별 승인 게이트, 실행 영수증(receipt)이 스키마 수준에서 강제된다.
- 기존 표면 재사용: 채널은 새 기능을 만들지 않고, 이미 있는 Core API 표면을 에이전트용 봉투로 감싼다.

### 1.2 비목적

- 에이전트 자체(LLM 실행·계획 수립)의 구현은 이 채널의 범위가 아니다. 채널은 호출 계약만 제공한다.
- 결제 실행, 계정 삭제, API 키 값 열람 같은 파괴적·민감 액션은 도구를 두지 않는 방식으로 제외한다 (§6.4).
- 개발용 코딩 에이전트 하네스(`docs/operations/agent-harness.md`)와는 무관하다. 그쪽은 repo 작업 정책이고, 이 문서는 제품 기능이다.
- MCP 서버를 새로 만드는 것이 1차 목표가 아니다. MCP는 §9 WebMCP 접점과 §10 단계 도입안에서 투영 대상으로만 다룬다.

## 2. 기존 표면과의 구분 (전부 `[실재]`)

이름이 겹치는 기존 표면이 셋 있어 먼저 구분한다.

| 표면 | 실체 | 이 채널과의 관계 |
| --- | --- | --- |
| 에이전트 작업 하네스 | `docs/operations/agent-harness.md`, `scripts/agent-harness.mjs` — 코딩 에이전트의 repo 작업 정책 | 무관. 용어만 겹친다 |
| Studio 3D MCP·CLI | `docs/studio-3d-mcp-cli.md` — Tripo/Meshy 등 **외부** MCP 서버를 개발 시점에 소비해 3D 에셋을 만든 기록 | 방향이 반대다(우리가 클라이언트). 단, 그 문서의 운용 원칙 — 자격증명 안전 실행, 유료 호출 전 잔액 확인, `--confirm` 없이는 전송 불가한 dry-run 게이트 — 은 §6 승인 게이트 설계의 선례로 인용한다 |
| Integration Platform | `apps/api/src/modules/integration-platform/` — Notion·Linear·Slack 등 외부 서비스를 ToonStudio가 호출하는 연동 | 채널 도구의 일부가 이 표면을 경유한다 (§5). capability 명명 규칙과 receipt 패턴을 계승한다 |

## 3. 실측 근거 — 채널이 기대는 현재 계약들 `[실재]`

| 근거 | 위치 | 채널에서의 용도 |
| --- | --- | --- |
| 서명 세션 토큰 인증 | `apps/api/src/session-middleware.ts` — `x-user-id` 헤더의 서명 토큰 또는 세션 쿠키를 검증해 실제 userId로 치환. 검증 실패 시 미인증 처리 | 채널 세션 인증의 기반 (§7) |
| 인증 모듈 | `apps/api/src/modules/auth/` — `@Controller("auth")`, `GET /auth/session`, OAuth(Google·Kakao·Naver), 레이트 리밋(`auth-rate-limit.ts`) | 로그인 주체 판정 |
| 본인 표면 | `apps/api/src/modules/me/` — `@Controller("me")`, `me.service.ts`, `me-collection.repository.ts` | 읽기 도구 1차 매핑 대상 |
| 게스트 세션 | `apps/web/src/domains/auth/public/session/guest-session.ts` — `guest_<uuid>`를 localStorage(`toonstudio-guest-session-v1`)에만 보관. 문서화된 대로 **API 자격증명이 아니며** 보호 API는 미인증에 401 | 게스트는 서버 채널 인증 불가 (§7.2) |
| 게스트 승격 | 같은 디렉터리의 `guest-data-migration.ts`, `guest-migration-bridge.tsx` — 로그인 후 확인한 것만 이관 | 채널 세션 승격 시 동일 원칙 |
| BYOK 키 허브 | `apps/web/src/domains/integrations/api-key-hub/` — `api-key-hub-model.ts`가 명시: 키 값은 절대 로그·복사·외부 전송하지 않고 마스킹(말미 4자)만 노출. 관리 대상 4종(AI·Unsplash·Resend·Fal) | 채널은 키 값을 절대 싣지 않는다 (§7.3) |
| Integration capability 명명 | `apps/api/src/modules/integration-platform/integration-platform.catalog.ts` — `files.read`, `tasks.write`, `publish.write` 같은 `domain.verb` capability | 도구 명명 규칙으로 계승 (§5.1) |
| Integration runtime receipt | `apps/api/src/modules/integration-platform/integration-runtime.contract.ts` — `mutationId` 기반 영수증, 상태 `pending|succeeded|failed|uncertain`, `writesExternalState` 플래그, 만료 URL을 제거한 receipt 보관 | 쓰기 도구의 멱등·영수증 계약으로 계승 (§5.3, §8) |
| 승인 계약 선례 | `docs/adr/0024-production-operations-review-approval-publish-contract.md` (상태: Proposed) — operation 단위 mutation, revision+digest에 고정한 검수·승인·게시 | 승인 게이트의 digest 고정 방식 선례 (§6.2). 단 ADR 자체가 Proposed라 채널 3단계의 선행 조건으로 둔다 |
| 유료 실행 게이트 선례 | `docs/interfaces/2026-09-18-creator-intelligence-providers.md` — 유료 POST는 인증 세션 + 멱등 키 필수, 전역 스위치(`CREATOR_INTELLIGENCE_PAID_EXECUTION_ENABLED`)와 일일 한도 예약 없이는 실행 금지 | 유료 도구의 게이트 기본형 (§6.3) |
| Studio AI admission | `apps/api/src/modules/studio-ai/` — `studio-ai-admission.ts`, `studio-ai-capabilities.ts`, 생성 작업 원장(`studio-3d-generation-job-ledger.ts`) | AI 도구 호출의 입장·능력 선언 선례 |
| 공유 계약 패키지 | `packages/contracts/` — web/api가 공유하는 DTO·schema | 스키마 코드화 시 배치 후보. 단 루트 `AGENTS.md` 규칙상 "실제 두 번째 소비자가 생긴 범위만" 승격한다 (§10) |

부재 확인: 기준 커밋에 `webmcp`·`modelContext` 식별자와 에이전트 채널 관련 코드는 **없다** (git object store 전수 대조). WebMCP 관련 기존 작업은 repo 밖 설계 초안 단계에서만 논의됐고 병합된 적이 없으므로, 이 문서는 WebMCP를 실재 표면으로 취급하지 않는다 (§9).

## 4. 채널 개요 `[제안]`

- 배치: Core API(`apps/api`)에 신규 모듈 `agent-channel`을 둔다. 기존 40개 모듈과 같은 NestJS 경계 규칙(`apps/api/AGENTS.md` — controller 경계 검증, 인증/인가 분리)을 따른다.
- 전송: HTTPS 요청-응답이 1차 계약이다. 스트리밍·서버 푸시가 필요한 도구(장시간 생성 등)는 동기 응답 대신 receipt 조회로 수렴시킨다 (§5.3). 양방향 전송 도입 여부는 `[미결정]`.
- 진입점: `POST /agent-channel/messages` 단일 진입점으로 봉투를 받고, `GET /agent-channel/receipts/:mutationId`로 쓰기 결과를 조회한다. 경로는 제안이며 모듈 신설 시 확정한다.
- 채널은 기존 REST 표면을 대체하지 않는다. 같은 기능의 정본은 기존 컨트롤러·서비스에 남고, 채널은 그 위의 에이전트용 어댑터다.

## 5. 메시지 봉투 `[제안]`

### 5.1 봉투 형식

모든 채널 메시지는 아래 봉투 하나만 쓴다. 필드 추가는 `schemaVersion`을 올리지 않고 선택 필드로만 하며, 의미 변경은 버전 증가를 요구한다.

```json
{
  "schemaVersion": 1,
  "messageId": "01J…(UUID)",
  "kind": "tool.invoke",
  "sessionId": "acs_…",
  "tool": "works.list",
  "input": {},
  "idempotencyKey": "클라이언트 생성 UUID (쓰기 필수)",
  "approval": { "approvalId": "apv_…", "inputDigest": "sha256:…" },
  "issuedAt": "2026-10-08T00:00:00.000Z",
  "deadlineMs": 30000
}
```

| 필드 | 규칙 |
| --- | --- |
| `kind` | `session.open` · `session.close` · `tool.invoke` · `tool.result` · `approval.request` · `approval.decision` · `error` 중 하나 |
| `tool` | §5.2 카탈로그의 이름만 허용. 카탈로그에 없는 이름은 실행 전에 거절한다 |
| `input` | 도구별 입력 스키마로 controller 경계에서 검증한다. 검증 실패는 §8 오류로 반환하고 실행하지 않는다 |
| `idempotencyKey` | 쓰기 도구 필수. 같은 키+같은 입력 digest의 재요청은 새 실행이 아니라 기존 receipt를 반환한다 (creator-intelligence 계약 선례) |
| `approval` | §6 게이트 대상 도구에서만. `inputDigest`가 승인 시점 입력과 다르면 승인은 무효다 |
| `deadlineMs` | 초과 시 서버는 실행을 중단하거나, 이미 시작된 쓰기는 `uncertain` receipt로 남긴다 (§8.2) |

결과 봉투는 `kind: "tool.result"`에 `mutationId`(쓰기만), `output`, `receipt` 요약을 싣는다. 큰 산출물(파일·이미지)은 본문에 넣지 않고 기존 표면의 단기 링크로 참조한다 (creator-intelligence의 "단기 아티팩트 링크" 선례).

### 5.2 도구 카탈로그 초안

명명은 integration catalog의 `domain.verb` 규칙을 계승하고, 읽기/쓰기를 이름이 아니라 카탈로그 메타데이터로 구분한다. 각 도구는 **기존 표면에 매핑되는 것만** 올린다. 매핑할 표면이 없으면 카탈로그에 넣지 않는다.

읽기 도구 (승인 불요, §6 L0):

| 도구 | 매핑 표면 `[실재]` | 비고 |
| --- | --- | --- |
| `me.profile.read` | `GET /me` (`apps/api/src/modules/me/me.controller.ts`) | 본인 정보만 |
| `me.collections.read` | `me-collection.repository.ts` 기반 표면 | 본인 컬렉션만 |
| `works.list` / `works.get` | creator 모듈 작품 표면 (`apps/api/src/modules/creator/`) | 소유·권한 검사는 기존 서비스 규칙 그대로 |
| `catalog.search` / `catalog.get` | `apps/api/src/modules/catalog/` (`@Controller()` 루트 경로) | 공개 카탈로그. 외부 작품은 메타데이터만이라는 현행 사실 유지 |
| `workspace.usage.read` | 팀 워크스페이스 사용량 표면 | 관리자 권한은 기존 규칙 그대로 |
| `integrations.status.read` | `GET /integrations` (`integration-platform.controller.ts`) | 구성 여부만. 키 값은 어떤 경우에도 반환하지 않는다 |
| `studio-ai.capabilities.read` | `apps/api/src/modules/studio-ai/studio-ai-capabilities.ts` | 사용 가능한 AI 능력 선언 조회 |

쓰기 도구 (전부 receipt + 멱등 키 필수):

| 도구 | 매핑 표면 `[실재]` | 등급 (§6) |
| --- | --- | --- |
| `works.create` | creator 모듈 작품 생성 표면 | L1 |
| `production.operation.append` | ADR-0024 operation 계약 — 단, ADR이 **Proposed**라 표면 자체가 아직 없다. ADR accepted가 선행 조건 | L1 (선행 조건 충족 후) |
| `integrations.runtime.execute` | `POST /integrations/runtime-connectors` (`integration-runtime.controller.ts`) — `writesExternalState`인 액션은 외부 상태를 바꾼다 | 읽기성 액션 L1 / 외부 쓰기 L2 |
| `studio-ai.generate` | `apps/api/src/modules/studio-ai/` 생성 표면 (admission·작업 원장 존재) | 과금 가능 호출은 L2 + §6.3 |

쓰기 도구의 공통 규칙:

- 실행 전에 입력 검증을 통과해야 하고, 결과는 항상 receipt로 남는다.
- 되돌릴 수 없는 도구는 카탈로그 메타데이터에 `reversible: false`를 명시한다. 이 표시가 없으면 L2로 올릴 수 없다.

### 5.3 영수증(receipt) 계약

integration runtime receipt(`integration-runtime.contract.ts`)의 상태 기계를 그대로 계승한다.

- 상태: `pending → succeeded | failed | uncertain`. `uncertain`은 "실행됐는지 모르는" 상태이며 성공으로 위장하지 않는다.
- 필드: `mutationId`, `tool`, `sessionId`, 실행 주체(userId + 에이전트 표기), `state`, `errorCode`, 입력 digest, 생성·갱신 시각, 승인 참조(있으면).
- 보관: 만료되는 URL 같은 휘발 정보는 제거한 형태로 보관한다 (runtime receipt의 `receiptResponse` 선례).
