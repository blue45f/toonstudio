# Studio AI cloud routing·usage ledger·분산 quota

server-backed Studio AI 경로는 cloud-only, free-first, fail-closed다. PostgreSQL이 cross-instance quota의
권위다. local LLM, localhost/private-network runtime, browser model download, self-hosted GPU는 이 경로의
지원 실행 대상이 아니다.

## 운영 고성능 경로 (ToonStudio AI 1순위, 2026-10-29)

키를 등록하지 않은 사용자의 자동 경로는 **운영 고성능 경로(provider `anthropic`) → 아래 공유 무료 pool** 순서다.

- 설정: `studio-ai-premium-config.ts`. `STUDIO_AI_ANTHROPIC_API_KEY`(서버 전용), `STUDIO_AI_ANTHROPIC_MODEL`
  (기본 `claude-opus-5-5`), `STUDIO_AI_PREMIUM_AUTO`, `STUDIO_AI_PREMIUM_ALLOWED_MODELS`, 일일 예산
  `STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT`(30)·`STUDIO_AI_PREMIUM_GLOBAL_DAILY_REQUEST_LIMIT`(400)·
  `STUDIO_AI_PREMIUM_GLOBAL_DAILY_TOKEN_LIMIT`(3,000,000), `STUDIO_AI_ANTHROPIC_TIMEOUT_MS`(최대 120초),
  `STUDIO_AI_ANTHROPIC_WORKSPACE_ID`(워크스페이스에 묶이지 않은 키만, `anthropic-workspace-id` 헤더로 보낸다).
- 비용: 운영자 부담(`sponsored`)이라 사용자 크레딧을 차감하지 않는다. 예산은 원장을 UTC 하루 단위로 세어
  (`studio-ai-premium-budget.repository.ts`, 한 번의 CTE 조회) 지키고, 예산·원장 준비를 확인하지 못하면
  운영 경로를 후보에서 빼고 무료 pool로 간다(fail-closed). 마이그레이션 0114(원장 provider 제약·색인)와
  0115(호출별 예약량 열)가 먼저 적용돼야 열린다. 서버 측 대체가 돌면 거절한 시도도 따로 과금되므로 원장·쿼터·예산은 `usage.iterations`를
  모두 더해 센다(맨 위 `usage`보다 적게 세지 않는다). 사용량을 모르는 호출(시간 초과·연결 끊김·취소)은 0이 아니라
  그 호출의 보수적 예약량으로 센다. 일반 서버 쿼터가 같은 호출에 매기는 값과 같고, 운영 경로 원장 행의 `reservedTokens`에
  남긴다. 이 값이 없는 0115 이전 행은 가장 큰 예약량(250,000)으로 센다. 예산을 다 썼는데 받을 무료 제공자가 없으면
  `503 FREE_AI_POOL_UNAVAILABLE`이 아니라 `429 FREE_AI_POOL_EXHAUSTED`(오늘 한도 소진)로 알린다.
- 전환: 429·529·402·400(결제 오류, 워크스페이스 지정 누락 같은 운영 키 설정 오류, 구조화 출력 스키마 미지원 같은
  요청 거절)·401·403·404·413처럼 추론 전 확정 거절만 같은 요청을 무료 pool로 넘긴다(`premium_unavailable`).
  5xx·시간 초과·깨진 응답은 재전송하지 않는다. 지출상한 429(`enforced_spend_limit_reached`)와 명시적인
  사용 한도·크레딧 부족 400은 일반 제한과 구분한다. 무료 후보가 없으면 `429 PREMIUM_AI_BUDGET_EXHAUSTED`로
  끝내며 다른 유료 제공자로 넘기지 않는다. 원인별로 10분에 한 번 상태·오류 종류만 경고 로그로 남긴다.
- 요청 형태: 샘플링 매개변수 없이 작업별 `effort`, 사고 여유분(4,000토큰), 서버 측 모델 대체를 싣는다.

### 보조 기능 `POST /studio-ai/messages`

이미지(base64)·시스템 블록·JSON 스키마 구조화 출력을 받는 Messages API 부분 집합이다(`studio-ai-messages.dto.ts`).
운영 고성능 경로를 먼저 쓰고, 확정 거절이면 같은 요청을 비전이 되는 무료 제공자(Gemini, 비전 모델을 쓰는 Groq)
형식으로 바꿔 이어 간다. 결과는 경로와 무관하게 정규화된 Messages 객체다. 원장에는 범용 보조(`assistant`)로 남긴다.
거절·출력 잘림·일시 중지·컨텍스트 상한 종료도 기존 `stop_reason`·`usage` 응답을 유지하지만 원장은
`content_filtered` 또는 `provider_error`로 기록한다. 이미 처리된 요청은 재전송하지 않으며 사용량과 캐시 토큰을
정산하고, 영수증은 `ambiguous`로 남겨 같은 작업의 중복 실행을 막는다.

### 코드 구성

- `studio-ai.service.ts`: admission·쿼터·영수증·원장·중복 과금 방지(두 작업 공통).
- `studio-ai-exchange.ts`: 작업별·제공자별 요청 본문, 응답 해석, 보조 기능 후보 선정.
- `studio-ai-messages-translate.ts`: Messages API 요청·응답 변환과 무료 풀 형식 변환.
- `studio-ai-premium-failure.ts`: 운영 지출한도·크레딧 부족 판별과 안전한 실패 응답 생성.

## 공유 무료 pool

기본 순서:

1. Gemini free tier
2. Qwen China Beijing Free Quota Only
3. Groq free tier
4. SambaNova Free Tier
5. Z.AI free Flash
6. Mistral Free mode
7. Cloudflare Workers AI on Workers Free
8. OpenRouter free router
9. SiliconFlow free text model

`STUDIO_AI_FREE_PROVIDER_ORDER`가 배포 순서를 정의한다. 요청의 `providerOrder`는 schema 검증된 중복 없는
무료 provider 목록이며 우선 적용하고 나머지는 배포 기본 순서로 채운다.

provider는 shared pool 활성화, server key 존재, 대응하는 `STUDIO_AI_FREE_*_CONFIRMED=true` 승인 조건을
모두 만족해야 한다. confirmation은 billing 자동 검사 결과가 아니라 운영 승인이다. shared credential은
server에만 두고 `VITE_` 변수를 사용하지 않는다.

## 무료 풀 모달리티 확장 (능력 레지스트리)

`studio-ai-capabilities.ts`가 chat 밖의 능력을 능력 단위로 등록한다. 전부 이미 풀에 있는
제공자의 무료 구간을 재사용하므로 **신규 키·신규 계약이 없다.**

| 능력 | 제공자 | 기본 모델 | 무료 경계 |
| --- | --- | --- | --- |
| transcription | Groq | `whisper-large-v3` | Groq 무료 rate limit 표의 Whisper 모델만 allowlist (`STUDIO_AI_FREE_GROQ_TRANSCRIPTION_MODEL`로 turbo 전환 가능, allowlist 밖이면 비활성화) |
| vision | Groq | `qwen/qwen3.8-27b` | Groq 공식 비전 문서의 현행 모델만 allowlist (`STUDIO_AI_FREE_GROQ_VISION_MODEL`) |
| image-generation | Cloudflare | `@cf/black-forest-labs/flux-1-schnell` | Workers AI 무료 할당 10,000 Neurons/일. 가격표 등재 + 모델 페이지에 유료 플랜 요구 없음 (2026-10-06 공식 문서 확인). `STUDIO_AI_FREE_CLOUDFLARE_IMAGE_MODEL` |
| embedding | Cloudflare | `@cf/baai/bge-m3` | 위와 동일. 다국어 모델만 allowlist (`STUDIO_AI_FREE_CLOUDFLARE_EMBEDDING_MODEL`) |

- 전사 계약(`studio-ai-groq-media.ts`)은 자막 도메인이 바로 쓰는 형태다: 전체 텍스트, 언어,
  구간 배열 `{startSeconds, endSeconds, text}` (SRT/VTT 큐와 1:1), 단어 타이밍, 길이.
  무료 티어 파일 상한 25MB는 호출 전에 확정 거절한다. 표면 배선(모션 웹툰 자막 등)은
  이 모듈 밖의 후속 작업이다.
- 이미지·임베딩 어댑터(`studio-ai-cloudflare-media.ts`)는 결과에 공식 단가 기준
  Neurons 근사를 함께 돌려준다 (원장 근사 기록용).
- 실패 전환은 chat과 같은 규칙을 `runStudioAiCapability`가 강제한다: 추론 수락 전 확정
  거절(402·429·Cloudflare 403/5035 등)에서만 다음 후보로 넘어가고, 전환 시 출처를
  결과의 `failover`에 남긴다. 네트워크 오류·5xx·형식이 깨진 성공은 재전송하지 않는다.

### Cloudflare 모델 종료 대응 (2026-11-17 확인)

[Cloudflare의 2026-11-20 종료 공지](https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/)에
등재된 24개 모델은 현재 공유 무료 풀의 허용 목록에 없다. 텍스트 기본값
`@cf/google/gemma-4-26b-a4b-it`, 허용 대안 `@cf/zai-org/glm-4.7-flash`, 위 이미지·임베딩
기본값을 유지한다. 테스트에 있는 종료 모델 ID는 거절을 검증하는 입력이며 운영 사용 증거가 아니다.

- `studio-ai-provider.test.ts`는 종료 대상 24개 ID의 텍스트 후보 제외와
  `404 / model_not_found`, `410 / 5028`의 확정 거절 분류를 검증한다. 모델 종료는 무료 쿼터 소진이
  아니므로 분류 결과상 다른 제공자에 재전송할 대상이 아니다. 최종 안내 메일은 404를, 공식 변경 공지는
  410을 안내해 두 형태를 모두 유지한다.
- `studio-ai-capabilities.test.ts`는 종료 이미지·임베딩 모델 override와 잘못된 텍스트 모델
  override의 차단을 검증한다. 현재 이미지·임베딩 설정은 텍스트 provider에서 계정·토큰을
  가져오므로 `STUDIO_AI_FREE_CLOUDFLARE_MODEL`이 허용 목록 밖이면 두 능력도 비활성화된다.
- `studio-ai-cloudflare-media.test.ts`는 기존 요청·응답 계약과 FLUX 프롬프트 경계를 검증한다.
  [공식 입력 스키마](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/schema-input.json)의
  상한에 맞춰 최종 프롬프트 2,048 Unicode 코드 포인트까지 그대로 보내고 초과 입력은 외부 호출 전에 거절한다.
  자동으로 잘라 이미지 의도를 바꾸지 않는다. 모델·steps 기본값·seed 전송 방식은 유지한다.
  seed는 공식 모델 예제와 스키마·Pi AI 설명이 서로 달라 실제 지원·재현성은 미확인이다.
- 위 세 테스트 파일은 `scripts/ci-required-vitest-targets.txt`에 등록되어 필수 core 회귀의
  product shard에 포함된다. 테스트는 제공자 응답을 주입하며 실제 추론을 호출하지 않는다.

**운영 확인과 무료 경계:** 이 소스 및 테스트만으로 현재 배포 SHA, 주입된 모델 override,
Workers Free 플랜, 남은 할당량이나 다른 서비스·개인 BYOK 연결의 호출 모델을 확정하지 않는다.
`STUDIO_AI_FREE_CLOUDFLARE_CONFIRMED`는 운영 승인 플래그이고 실시간 과금 조회가 아니다.
무료 10,000 Neurons는 계정 전체의 일일 공유량이며 KST 09:00에 초기화된다.
`estimatedNeurons`도 추정치이므로 Paid 플랜의 초과 과금을 차단하는 보장은 아니다.

운영 접근 시 배포 SHA와 위 네 모델의 실제 사용 여부, 세 `STUDIO_AI_FREE_CLOUDFLARE_*MODEL`
override, 무료 플랜·계정 전체 잔여량을 읽기로 먼저 확인한다. 로그는 모델 ID·상태 코드만
확인하고 토큰·프롬프트·응답을 노출하지 않는다. 무료 상태가 확인되지 않으면 실제 추론,
모델 교체, 환경변수 변경과 배포를 실행하지 않는다. 안전한 기본값에는 교체나 재색인이 필요 없다.

## 무료 티어 데이터 약관 배지

제공자별 무료 티어의 데이터 사용 차이를 상태 응답의 제공자 항목에 배지로 싣는다
(`dataUsage`, `dataTermsLabel`). Gemini 무료는 "제품 개선에 사용"이 공식 가격표에 명시돼
있고 Mistral 무료는 학습 동의가 조건일 수 있어 `training`, Groq 무료는 `no-training`,
OpenRouter 무료는 하위 제공자별로 갈려 `varies`, 공식 확인이 안 된 제공자는 안전하다고
단정하지 않고 `unconfirmed`로 표기한다. 미공개 원고를 보내는 표면은 실행 전에 이 배지를
그대로 보여줘야 한다.

## 안전한 provider 전환

inference 수락 전 기계적으로 확인 가능한 다음 거절에서만 다음 provider를 시도한다.

- HTTP 402 또는 429
- Qwen `403/AllocationQuota.FreeTierOnly`
- Cloudflare `403/5035`
- allowlist에 있는 무료·billing quota exhaustion business code

network error, timeout, 5xx, malformed success, auth error, 수락 후 실패는 재전송하지 않는다. 모호한 결과
뒤의 중복 inference·charge를 막기 위한 규칙이다.

## 개인 cloud route

browser settings는 cloud connection마다 여러 key와 model, 우선순위와 exact manual assignment를 가질
수 있다. 자동 모드에서는 사용자가 등록한 키를 먼저 쓰고, 추론 전 확정 거절일 때만 이 서버 경로(운영 고성능 →
shared pool)로 넘어온다. shared pool과 운영 고성능 경로는 사용자에게 keyless다. personal paid BYOK는 비용 청구를
확인한 사용자만 자동 경로에서 쓴다.

endpoint는 public HTTPS여야 하며 localhost, private network, URL credential, query, fragment, 자기
origin을 거부한다.

## managed media inference

```text
STUDIO_MEDIA_CLOUD_API_URL=https://managed-runtime.example.com
STUDIO_MEDIA_CLOUD_API_TOKEN=server-side-secret
```

URL은 path/query/fragment/credential이 없는 public HTTPS origin이어야 한다. 이전
`STUDIO_COMFYUI_URL`, `STUDIO_COMFYUI_TOKEN`은 읽지 않는다. 설정·DB·model readiness·output 검증 실패는
성공으로 바꾸지 않으며 operator-paid provider를 몰래 대체하지 않는다.

## 개인정보 계약

`studio_ai_usage_ledger` 저장 항목:

- 인증 user ID
- allowlist task와 실제 server-selected model
- terminal status
- provider가 반환한 token count
- start, finish, insertion timestamp

prompt/response, API key, authorization header, provider error body, client IP, provider-facing pseudonymous user
ID는 저장하지 않는다.

## 원자 quota 흐름

1. 짧은 PostgreSQL transaction이 global/user UTC-day row에 request와 보수적 token 상한 예약
2. 외부 provider 요청 중에는 DB transaction을 열어 두지 않음
3. 짧은 settlement transaction이 예약 해제, 실제 usage charge, terminal ledger insert
4. UTC day는 PostgreSQL clock이 정의

storage/admission 실패는 provider 호출 전 503, quota 거절은 호출 전 429다. finalize 실패 시 생성 content를
반환하지 않는다.

기본 일 한도:

- 사용자: 200 request, 1,000,000 token
- 서비스 전체: 500 request, 2,000,000 token

환경변수 `STUDIO_AI_DAILY_REQUEST_LIMIT`, `STUDIO_AI_DAILY_TOKEN_LIMIT`,
`STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT`, `STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT`로 조정한다.
운영 배포 전에 production migration manifest를 적용하고 schema preflight를 통과해야 한다.
