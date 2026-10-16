# External integration runtime connectors

Status: source implementation complete; operator credentials, provider approval and real-account production receipts remain deployment gates.

This runtime is the execution layer underneath the existing integration catalogue and `/settings/integrations` page. It does not replace the catalogue, automation drafts, publishing package previews or developer manifest. It converts the non-overlapping providers below into explicit, project-authorized server operations.

## Implemented connectors

| Provider | Operation | Runtime behavior |
|---|---|---|
| Notion | `task.upsert` | Creates or updates a page in a data source explicitly shared with the integration. |
| Linear | `task.upsert` | Creates or updates an issue in a selected team. |
| Jira Cloud | `task.upsert` | Creates or updates a Jira Cloud issue with API-token Basic auth and ADF descriptions. |
| Trello | `task.upsert` | Creates or updates a card in a selected list. |
| Slack | `message.send` | Sends a bounded incoming-webhook message with link unfurling disabled. |
| Microsoft Teams | `message.send` | Sends a bounded Adaptive Card to an operator-configured workflow webhook. |
| Figma | `design.inspect` | Reads file or selected-node metadata and, when requested, returns temporary render URLs without downloading source assets. |
| Zoom | `meeting.create` | Obtains a server-to-server token and creates a scheduled review meeting; only the attendee join URL is retained. |
| Naver DataLab | `trends.read` | Reads dated search-interest ratios as an attributed external insight signal. |
| Wikidata | `trends.read` | Searches public entity metadata candidates. |
| Google Books | `trends.read` | Searches public book metadata candidates. |

Publishing, voice, music, 3D generation, publication-rights signing and creator messaging are intentionally not modified here because those areas are owned by active implementation sessions. This branch adds no competing plan, schema or placeholder for them.

## User surface

`/settings/integrations` now contains an execution workbench with:

1. project selection by production project ID;
2. server-reported connector readiness;
3. provider-specific editable JSON seeded from a safe example;
4. no-network dry-run planning;
5. explicit live-execution confirmation;
6. a stable mutation ID for safe retries;
7. normalized execution results;
8. actor-and-project-scoped durable receipt history.

The page never asks for an API key, password, OAuth refresh token or webhook URL. Those values are operator-only deployment secrets.

## HTTP API

All routes require the existing authenticated browser session.

```text
GET  /api/integrations/runtime-connectors
GET  /api/integrations/runtime-connectors/receipts?projectId=...&limit=30
POST /api/integrations/runtime-connectors/execute
```

Example dry run:

```json
{
  "projectId": "project-id",
  "mutationId": "11111111-1111-4111-8111-111111111111",
  "dryRun": true,
  "confirm": false,
  "request": {
    "providerId": "wikidata",
    "action": "trends.read",
    "input": {
      "query": "작품명",
      "language": "ko",
      "limit": 10
    }
  }
}
```

A live request must set `dryRun=false` and `confirm=true`. The server validates the exact provider/action/input contract again; the UI is not a trust boundary.

## Authorization

- Connector catalogue status requires an authenticated session.
- Receipt history requires access to the production project and is always scoped to the current actor.
- Read-only provider actions require project view access.
- Actions that change an external service require project edit access.
- Connectors that run with operator-held credentials (`executionMode` `operator-token` or `operator-webhook`) additionally require an administrator or an operator allowlist entry; see the next section.
- No endpoint accepts a user ID, role or access claim from the request body.

## 운영자 인증 정보 커넥터 접근 제어

상태: current (2026-10-15 구현, `integration-runtime.access.ts`).

Notion·Linear·Jira Cloud·Trello·Figma·Zoom·Naver DataLab(`operator-token`)과 Slack·Microsoft Teams(`operator-webhook`)는 운영자가 배포 환경에 넣어 둔 토큰과 웹훅 URL로 실행됩니다. 프로젝트 편집 권한은 "이 프로젝트를 고칠 수 있다"는 뜻이지 "운영자의 외부 계정을 쓸 수 있다"는 뜻이 아닙니다. 편집 권한만 확인하던 때에는 로그인한 누구나 자기 프로젝트를 만든 뒤 임의의 `dataSourceId`·`teamId`·`projectKey`로 운영자 토큰을 실행해 외부 서비스를 읽고 쓸 수 있었습니다(혼동된 대리인, CWE-441/862). 지금은 프로젝트 권한 확인에 이어 아래 규칙을 드라이런과 실제 실행 모두에 적용합니다.

| 요청자 | 규칙 |
|---|---|
| 관리자(`admin`·`operator` 역할의 활성 계정) | 허용 목록과 무관하게 모든 대상을 실행할 수 있습니다. |
| 일반 사용자 | 운영자가 `INTEGRATION_RUNTIME_OPERATOR_GRANTS`에 (프로젝트, 공급자, 대상)을 등록한 경우에만 실행할 수 있습니다. 허용 목록이 없으면 거부합니다(fail-closed). |
| 공개 프로토콜(Wikidata·Google Books) | 운영자 인증 정보를 쓰지 않으므로 기존처럼 프로젝트 권한만 봅니다. |

허용 목록은 JSON 배열이며 항목은 `projectId`, `providerId`, `targets`만 가질 수 있습니다. `targets`에는 허용할 Notion 데이터 소스 ID, Linear 팀 ID, Jira 프로젝트 키, Trello 리스트 ID, Figma 파일 키, Zoom 사용자 ID를 넣습니다. 대상을 지정하지 않는 Slack·Teams·Naver DataLab은 `targets`를 생략합니다. 와일드카드는 지원하지 않습니다.

```json
[
  { "projectId": "<제작 프로젝트 ID>", "providerId": "notion", "targets": ["<Notion 데이터 소스 ID>"] },
  { "projectId": "<제작 프로젝트 ID>", "providerId": "slack" }
]
```

- 허용 목록에 있는 프로젝트라도 목록 밖 대상은 거부합니다. Notion·Linear UUID는 하이픈 유무와 대소문자를 무시하고, Figma 파일 키와 Zoom 사용자 ID는 정확히 같아야 합니다.
- `pageId`·`issueId`·`issueKey`·`cardId`처럼 ID로 기존 항목을 직접 고치는 요청은 항목이 어느 컨테이너에 속하는지 서버가 검증하지 않으므로 관리자만 실행할 수 있습니다. 허용 목록으로 연결된 프로젝트의 일반 사용자는 새 항목 만들기만 쓸 수 있습니다.
- 관리자 여부를 조회하지 못하면 관리자가 아닌 것으로 봅니다. 허용 목록 값이 JSON이 아니거나 항목 형식이 틀리면 항목을 모두 버리고(관리자 전용) 부팅 로그에 사유만 남깁니다. 값 자체는 기록하지 않습니다.
- 거부하면 HTTP 403과 함께 `code`·`message`·`providerId`를 돌려줍니다. `message`는 사용자에게 그대로 보여 줄 수 있는 한국어 사유이며 요청에 담긴 대상 값을 되풀이하지 않습니다.

| `code` | 의미 |
|---|---|
| `operator_connector_admin_only` | 허용 목록이 비어 있어 관리자만 쓸 수 있음 |
| `operator_connector_project_not_allowed` | 이 프로젝트·공급자가 허용 목록에 없음 |
| `operator_connector_target_not_allowed` | 허용 목록에 없는 데이터 소스·팀·프로젝트 키·리스트·파일·사용자 |
| `operator_connector_object_update_admin_only` | ID로 기존 항목을 수정하는 요청은 관리자만 가능 |

## Durable execution receipts

The runtime reuses the existing `production_integration_receipt` relation. No new migration is required.

The primary fence is `(projectId, actorUserId, mutationId)`. A canonical SHA-256 digest covers the project and validated request. Behavior is:

- exact retry after success: return the persisted response without a second provider call;
- same mutation ID with different input: reject as an idempotency conflict;
- pending receipt: reject as already running;
- uncertain receipt: reject and require operator reconciliation;
- failed receipt with the same request: reopen the receipt for an explicit retry;
- dry run: no receipt and no provider call.

The four stored states are `pending`, `succeeded`, `failed` and `uncertain`. Network timeouts, redirects, throttling, incomplete responses and most provider 5xx responses are classified as uncertain because the provider may have committed the write.

New mutation IDs are also protected by a database-backed per-actor UTC daily ceiling. The default is 100 live executions and `INTEGRATION_RUNTIME_DAILY_EXECUTIONS_PER_ACTOR` accepts only values from 1 through 1,000. An actor/day advisory transaction lock makes the count atomic across API instances. Exact replay and an explicit retry of the same failed mutation do not consume another slot; dry runs never count. Invalid deployment values fail application bootstrap instead of silently disabling the ceiling.

## Outbound network boundary

The transport is shared by all runtime connectors and applies these rules:

- HTTPS only;
- explicit exact or suffix hostname allowlist per provider;
- no URL credentials or nonstandard ports;
- redirects are never followed;
- bounded request and response bodies;
- fixed timeout;
- JSON response validation;
- normalized results only.

Sensitive provider responses are reduced before persistence. In particular, Zoom access tokens and host `start_url` values, webhook URLs, API tokens and authorization headers never enter execution responses or receipts. Figma render URLs are returned only to the initiating live response; durable receipts retain node IDs and availability, not expiring signed URLs.

## Deployment configuration

Copy only the needed values from `deploy/integration-runtime-connectors.env.example` into the deployment secret store. Do not copy them into a browser build, checked-in `.env` file or support log.

Keep the default execution ceiling until real usage data justifies a change. The reset is always `00:00 UTC`, and a quota rejection returns HTTP 429 with the configured limit and exact reset timestamp.

After deployment:

1. open `/settings/integrations` and confirm connector readiness;
2. use a disposable production project with the smallest provider scope;
3. run a dry run and inspect the request digest and operation;
4. execute one provider action;
5. confirm the external object and the matching receipt;
6. repeat the exact request with the same mutation ID through an API test and confirm replay rather than duplication;
7. revoke the provider credential and confirm fail-closed behavior;
8. test a timeout or provider sandbox failure and reconcile the uncertain receipt manually;
9. with a non-administrator session, confirm that an operator-credential connector returns HTTP 403 with a Korean reason for a project and target outside `INTEGRATION_RUNTIME_OPERATOR_GRANTS`, and that an allowlisted project and target still executes.

## Validation

Focused source validation covers:

- DTO strictness and explicit live confirmation;
- provider URL, header and body contracts with network mocks;
- redirect, hostname, body-size, timeout and throttle classification;
- project permissions;
- durable idempotency and replay;
- secret redaction and normalized result shape;
- workbench request generation;
- API and Web type checks.

No test uses a real provider credential or claims a real provider-side production receipt.
