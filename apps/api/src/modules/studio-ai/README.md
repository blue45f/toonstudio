# Studio AI cloud routing·usage ledger·분산 quota

server-backed Studio AI 경로는 cloud-only, free-first, fail-closed다. PostgreSQL이 cross-instance quota의
권위다. local LLM, localhost/private-network runtime, browser model download, self-hosted GPU는 이 경로의
지원 실행 대상이 아니다.

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
수 있다. shared pool은 사용자에게 keyless다. personal paid BYOK는 기본적으로 자동 fallback에서 제외하고
명시적 사용자 동의가 있어야 한다.

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
