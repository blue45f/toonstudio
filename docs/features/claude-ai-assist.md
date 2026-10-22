# Claude AI 보조 — 사용자 키(BYOK)로 쓰는 스튜디오 AI 도우미 4종

- 상태: 1~7절은 이 변경이 구현하고 실행·시험한 내용(**current** — 병합 전에는 `claude/eager-cannon-ow9ml4` 브랜치에만 있다). 8절은 하지 못한 것과 열린 결정(**target** 또는 **legacy exception**)이다.
- 기준 커밋: `c0b2c946`(분기점, PR #2420 병합 직후). 코드 사실은 그 위의 작업 트리를 읽고 실행해 확인했다.
- 작성일: 2026-10-22
- 대상: 스튜디오(검색 줄·AI 어시스트 허브)와 설정 > AI 연결 화면
- 함께 보기: [Cloud-only free-first AI runtime](../operations/free-ai-runtime.md)(연결 정책) · [벤치마크와 추가 기능 구상](../reports/claude-ai-assist-benchmark-2026-10-22.md)(역사 자료)

## 1. 한눈에 보기

| 항목 | 상태 | 위치 | 비고 |
| --- | --- | --- | --- |
| Claude 연결(공식 호스트 `api.anthropic.com`만) | current | `apps/web/src/shared/ai/claude/` | 사용자 결제 키(`user-funded-byok`)만. 앱 서버를 거치지 않는다 |
| AI 아트 디렉터 | current | `apps/web/src/domains/creator/ai/claude/ClaudeArtDirectorDialog.tsx` | 이미지 → 위치가 붙은 피드백 |
| AI 명령 도우미(실행 계획 · 알려 줘) | current | `ClaudeCommandPlanDialog.tsx` | 사용자가 단계를 확인해야 실행한다 |
| AI 번역 도우미 | current | `ClaudeLocalizeDialog.tsx` | 말풍선 대사 → 번호를 지킨 번역, 폭·용어 점검 |
| AI 대체 텍스트 도우미 | current | `ClaudeAltTextDialog.tsx` | 이미지 → 한 줄 대체 텍스트·상세 설명·컷별 설명 |
| 실행 전 확인 · 비용 상한 · 세션 예산 | current | `ClaudePreflight.tsx`, `claude-budget.ts` | 모든 기능이 같은 부품을 쓴다 |
| 운영자 부담 AI | **쓰지 않음** | — | 이 변경은 운영자 키·운영자 요금을 추가하지 않는다 |
| 운영 배포 | **하지 않음** | — | CSP `connect-src` 변경이 있어 정적 배포가 필요하다(승인 전, 8.1절) |

이 변경이 **하지 않은 것**: DB 마이그레이션, 새 API 경로, 서버 코드 변경, 환경 변수·시크릿 변경, 운영 배포. 새 런타임 의존성은 공식 SDK `@anthropic-ai/sdk` 하나다(5절).

## 2. 진입점

| 진입점 | 보이는 조건 | 하는 일 |
| --- | --- | --- |
| 스튜디오 검색 줄의 별 모양 메뉴 | Claude 연결이 있을 때만 | 기능 4개를 이름·한 줄 설명·필요한 것과 함께 보여 주고 대화상자를 연다 |
| AI 어시스트 허브의 "Claude 보조" 구역 | 항상(연결이 없으면 연결 안내) | 같은 기능 카드와 이번 세션 사용량·예산, 설정으로 가는 길 |
| 설정 > AI 의 Claude 연결 카드 | 항상 | 키 입력 → 연결 확인(`/v1/models`) → 기본 모델 등급(빠름·균형·최고·최대) 선택, 예산 한도 입력 |

메뉴와 허브는 **같은 기능 목록**(`claude-assist-features.tsx`의 `CLAUDE_ASSIST_FEATURES`)을 돌기 때문에 기능을 더할 때 한 곳만 고치면 두 진입점이 함께 바뀐다. 검색 줄 진입점은 연결이 없으면 아무것도 그리지 않는다(쓰지 않는 사용자에게 자리를 쓰지 않는다). 연결 안내는 허브와 설정이 맡는다.

## 3. 기능 4종

| 기능 | 입력 | 출력 | 비용 상한이 되는 것 | 원본에 하는 일 |
| --- | --- | --- | --- | --- |
| 아트 디렉터 | 이미지 1장(긴 이미지는 구간별) + 장르·분위기·메모 | 요약, 점수 3개, 읽는 순서, 위치가 붙은 고칠 점, 다음 할 일 | 입력(가로×세로÷750 + 약 900토큰) + 출력 8,000토큰 | 저장·수정 없음 |
| 명령 도우미 | 한 문장 요청 | "해 줘": 명령 순서 제안 / "알려 줘": 설명 + 관련 기능·단축키 | 입력(요청 + 후보 목록) + 출력 상한(계획 3,000 · 답변 2,000) | 계획은 제안일 뿐이다. 사용자가 고르고 누른 단계만 기존 실행 경로로 실행한다 |
| 번역 도우미 | 말풍선 대사 최대 50줄(줄당 240자), 용어집 30개, 말투, 말풍선 폭 예산 | 줄마다 번역·더 짧은 안·메모, 경고 | 입력 + `min(10,000, 1,200 + 줄 수 × 170)`토큰 | 저장·수정 없음. 복사해야 작품에 닿는다 |
| 대체 텍스트 도우미 | 이미지 1장 + 설명 범위(짧게·보통·컷별로 자세히) + 언어 + 메모 | 한 줄 대체 텍스트(125자 안팎 권장), 상세 설명, 컷별 설명(보이는 글자 포함) | 입력 + 출력 3,000 · 4,000 · 6,000토큰 | 저장·수정 없음 |

### 3.1 명령 도우미가 실행에 닿는 길

새 실행기도, 새 허용 정책도 만들지 않았다. 후보는 이미 **검색 줄에서 직접 실행해도 된다고 검토된** 라이브 바인딩(`getStudioCommandExecutionBindings`)뿐이고, 실행은 기존 `executeCommandPlanSteps`가 한 단계씩 한다. 모델이 돌려준 명령 ID가 후보에 없으면 버리고 이유를 보여 준다. "알려 줘"는 카탈로그 전체를 근거로 답하되 실행 버튼은 라이브 바인딩이 있는 명령에만 보인다. 여러 단계를 한 번에 되돌리는 기능은 없다(8.3절).

### 3.2 번역 도우미가 모델 말을 믿지 않는 부분

- **번호**: 입력 줄과 같은 번호의 결과만 받아들인다. 범위 밖·중복 번호는 버리고 몇 개 버렸는지 알린다. 빠진 줄은 빠졌다고 표시하고 사용자가 직접 적을 수 있다.
- **말풍선 폭**: 한글·한자·가나·전각·이모지는 2, 로마자·숫자·공백·구두점은 1로 센 표시 폭을 **화면이 지금 보이는 글**로 다시 계산한다. 그래서 사용자가 고쳐 쓴 문장도 정확하다(폭 예산: 제한 없음 · 여유 있게 120% · 빠듯하게 100%). 정확한 조판이 아니라 어림값이다.
- **용어집**: 원문 줄에 용어집의 원문 용어가 있는데 번역에 대응 번역이 없으면 "용어집과 달라요"로 표시한다. 모델이 지켰다고 말하는지가 아니라 글자를 직접 비교한다.
- **내보내기**: 번역만 · 표(TSV) · JSON 세 가지. 모두 고친 글 기준이다.

### 3.3 대체 텍스트 도우미의 규칙

- 짧은 대체 텍스트가 125자를 넘어도 **자르지 않는다**. 글자 수를 `n/125자`로 보여 주고 넘으면 경고색과 문구로 알린다(권장 길이일 뿐이라서다).
- 결과의 한 줄 설명은 곧바로 미리보기 이미지의 `alt`가 된다. 화면 읽기 도구 사용자가 듣게 될 말을 만드는 사람이 같은 화면에서 확인한다.
- `alt="…"` 속성 복사는 따옴표·꺾쇠·앰퍼샌드를 이스케이프하고 줄바꿈을 공백으로 바꾼다.
- 메모에 적지 않은 인물 이름은 지어내지 않고, 실존 인물의 신원을 추측하지 않으며, 읽기 어려운 글자는 경고로 남긴다(시스템 프롬프트 규칙).

## 4. UX 원칙(모든 기능 공통)

| 원칙 | 구현 |
| --- | --- |
| 실행 전에 무엇이 어디로 가는지 보여 준다 | `ClaudePreflight`: 처리 경로, 외부 전송 내용, 예상 시간, 결과, 원본 보호, 비용(모델·단가·기준일), 실패 정책. 허브의 "실행 전 확인"과 같은 어휘 |
| 비용은 상한으로 말한다 | 요청 비용 상한 = 입력 추정 + `max_tokens`(하드 상한). 방식(프리셋) 카드마다 이번 입력에 대한 상한을 같이 보여 줘서 품질과 비용을 견주고 고른다. 단가를 모르는 모델은 숫자를 지어내지 않고 "가격을 몰라요" |
| 사용자가 정한 예산을 지킨다 | 세션 예산 한도(USD, 브라우저 `localStorage`의 한도 값만). 넘을 수 있으면 확인 체크 전에는 보내지 않고, 체크해도 **그 한 번만** 진행한다. 막는 것이 아니라 확인이다 |
| 처리 방식은 이름으로 고른다 | 빠르게(Haiku 5.5·낮은 깊이) · 기본(연결 모델) · 꼼꼼하게(연결 모델·높은 깊이) · 직접 고르기(모델·깊이). 모델을 몰래 바꾸지 않는다 |
| 키보드로 끝까지 간다 | Ctrl/⌘+Enter로 실행, Esc로 닫기(포커스 복귀), 선택 칩은 방향키·Home·End(WAI-ARIA 라디오 그룹), 메뉴는 화살표·Home·End |
| 멈출 수 있다 | 중단은 요청을 즉시 취소하고 오류가 아니라 "중단함"으로 보여 준다. 닫으면 진행 중인 요청도 취소한다 |
| 자동으로 다시 보내지 않는다 | 실패하면 사유와 다음 행동을 알리고 사용자가 다시 누른다. SDK `maxRetries: 0`, 모델 자동 대체 없음 |
| 결과는 바로 고쳐 쓴다 | 번역·대체 텍스트는 입력칸이 곧 결과다. 복사는 고친 글 기준이다 |
| 처음 쓰는 사람을 돕는다 | 예시 넣기·예시 문장·최근 요청(메모리만), 연결 3단계 안내, 가린 선택 항목은 접어서 아래에 둔다 |
| 화면이 출렁이지 않는다 | 지연 로드되는 부분은 같은 높이의 빈 틀을 먼저 둔다 |

## 5. 구조

```text
apps/web/src/shared/ai/claude/            전송·정책·공용 UI(스튜디오 밖 설정 화면도 쓴다)
  claude-protocol.ts      프로토콜 판정(공식 호스트면 anthropic-messages), 모델 ID 검증
  claude-models.ts        모델 카탈로그·단가·비용 추정(2026-10-06 공개 가격 기준, 확인일 표기)
  claude-guarded-fetch.ts SDK에 넘기는 유일한 fetch(공식 origin 고정·쿠키 제거·키 헤더 일치 검사·리비전 검사·응답 상한)
  claude-runtime.ts       @anthropic-ai/sdk를 정적으로 import하는 유일한 모듈(항상 동적 import)
  claude-transport.ts     얇은 파사드: claudeCreate · claudeParse(Zod 구조화 출력) · 기존 OpenAI 호환 호출자용 브리지
  claude-bridge.ts        OpenAI 채팅 본문 ↔ Claude Messages 번역(기존 BYOK 호출자를 고치지 않는다)
  claude-budget.ts · claude-usage-meter.ts · claude-effort-presets.ts · claude-route.ts
  Claude*.tsx             연결 카드·실행 전 확인·예산 편집·프리셋 선택 등 공용 부품
apps/web/src/domains/creator/ai/claude/   스튜디오 기능
  claude-assist-features.tsx   기능 레지스트리(허브·메뉴가 같이 쓴다)
  ClaudeAssistLauncher.tsx     검색 줄 입구(연결이 있을 때만 메뉴를 지연 로드)
  claude-art-director*.ts · claude-command-*.ts · claude-localize*.ts · claude-alt-text*.ts   순수 로직과 실행
  Claude*Dialog.tsx / *Setup.tsx / *Result.tsx   화면
```

- **SDK는 지연 로드만 한다.** `claude-runtime.ts`만 SDK를 정적으로 import하고 나머지는 `await import("./claude-runtime")`로 부른다. `check:studio-eager-graph`가 이 경계를 지킨다. 이 변경이 스튜디오 진입 그래프에 더한 정적 모듈은 3개(`claude-protocol.ts` 등, 6.5 KiB)이고 래칫은 통과한다(6절).
- **구조화 출력**: 모델 응답은 `output_config.format`(JSON 스키마)으로 강제하고, 받은 뒤에도 Zod와 각 기능의 정규화 함수로 길이·개수·번호·좌표·제어 문자를 다시 검증한다. 모델 출력은 신뢰하지 않는다.
- **효과(깊이)**: `effort`는 지원이 확인된 모델에만 싣는다(모르는 모델에 보내면 400이다).
- **프롬프트 캐시**: 시스템 블록은 늘 같게 유지하고(`cache_control`) 언어·범위·메모는 사용자 메시지에 둔다.

## 6. 보안·개인정보·정책

| 항목 | 내용 |
| --- | --- |
| 키 보관 | 기존 사용자 AI 보관함(`user-ai-store`) 정책을 그대로 따른다. 이 문서·코드·테스트·로그·PR에 실제 키를 넣지 않는다. 라이브 검증용 키는 gitignore된 `.env.infrastructure.local`(권한 600)에만 있다 |
| 전송 경로 | 이 브라우저 → `https://api.anthropic.com` 직접. ToonStudio 서버를 거치지 않는다. 입력한 글과 선택한 이미지가 Anthropic으로 간다는 사실을 실행 전 확인에 항상 보여 준다 |
| 키가 새는 길 | 가드 `fetch`는 공식 origin이 아니면 보내지 않고, 자격 증명 헤더가 사용자가 넣은 키와 정확히 같을 때만 통과시킨다. 쿠키 제거·`credentials: omit`·`redirect: error`·`referrerPolicy: no-referrer`·`cache: no-store` |
| 오류 문구 | 사용자에게 보여도 안전한 문구로만 바꾼다. `sk-ant-…` 모양은 마스킹한다(`claude-runtime.ts`) |
| 프롬프트 주입 | 이미지 속 글자·말풍선 원문·메모는 모두 **자료**로 다루도록 시스템 프롬프트에 명시하고, 결과는 번호·길이·형식으로 다시 검증한다 |
| 데이터 저장 | 결과·입력·최근 요청은 메모리에만 둔다. 저장하는 것은 예산 한도 값(`toonstudio:claude-budget:v1`) 하나다 |
| 운영 정책 | 운영자 부담 AI는 꺼져 있다. Claude 연결은 `user-funded-byok`이고 자동·우선순위 대체에서 제외된다(수동 선택이 곧 동의) |
| CSP | `connect-src`에 `https://api.anthropic.com`을 더했다(`config/http-response-headers.json`, `apps/web/public/_headers`, `deploy/cloudflare-static/src/index.ts`, 일관성 시험). **운영에는 정적 배포 후에야 적용된다** |
| 라이선스·취약점 | `@anthropic-ai/sdk`를 `audit:licenses`(서드파티 고지)와 `audit:security`로 확인한다(검증 결과는 PR 본문에 적는다) |

## 7. 검증

| 종류 | 무엇을 | 어떻게 |
| --- | --- | --- |
| 단위·화면 시험 | 순수 로직, 실행 래퍼, 대화상자 4종, 허브·메뉴, 연결 카드, 예산 UI | `pnpm exec vitest run apps/web/src/domains/creator/ai/claude apps/web/src/shared/ai` |
| 사전 계약 | `claudeAssist` 네임스페이스 구조, 화면 파일의 인라인 이중 언어 작성 금지 | `pnpm exec vitest run i18n` |
| 진입 그래프 | SDK·Claude 화면이 스튜디오 정적 그래프에 들어가지 않는다 | `node scripts/check-studio-eager-graph.mjs` |
| CSP | 응답 헤더 세 곳과 시험이 같은 목록을 쓴다 | `pnpm run verify:csp` 및 `apps/api/src/config/static-security-headers.test.ts` |
| **실제 호출(2026-10-22)** | 연결 확인, OpenAI 형식 브리지, JSON 모드·구조화 출력, 명령 계획 5건(위험한 요청은 거절하고 대안 안내), 아트 디렉터(Haiku 5.5), 번역(4줄), 대체 텍스트(짧게·자세히) | 일회성 시험 파일로 호출하고 삭제했다. 호출 한 번당 약 $0.0004~0.0023(Haiku 5.5) |

실제 호출에서 확인한 것: 번역은 용어집(`하늘 = Sora`)을 따랐고 폭 예산 때문에 줄인 사정을 메모로 남겼다. 대체 텍스트는 메모의 이름을 인물에 연결했고, 읽기 어려운 글자를 경고로 남겼다. **실제 호출은 합성 이미지 1장과 한국어 대사 4줄에 대한 것이라 품질의 일반화는 주장하지 않는다.**

## 8. 하지 못한 것 · 열린 결정

### 8.1 운영 반영

CSP `connect-src` 변경은 정적 배포(`DEPLOY.md`의 승인 절차)가 있어야 운영 브라우저에 적용된다. 이 변경은 배포하지 않았다. 배포 전에는 운영 화면에서 Claude 호출이 CSP에 막힌다.

### 8.2 언어

`claudeAssist` 사전은 한국어·영어를 직접 썼고, 일본어·독일어·프랑스어·중국어(간·번체)는 비원어민 번역이라 원어민 검수가 필요하다. 나머지 언어는 영어 문구를 그대로 쓴다(언어 선택기가 "번역 진행 중"으로 표시한다).

### 8.3 기능 공백

- 스튜디오 캔버스에서 현재 페이지를 바로 가져오는 단추는 없다. 이미지 올리기·끌어놓기·붙여넣기·클립보드 단추만 있고, 스튜디오의 "이미지를 클립보드로"를 쓰라는 안내를 한다.
- 명령 도우미의 실행 결과를 한 번에 되돌리는 기능은 없다(기존 되돌리기 단축키를 안내한다).
- 모바일에는 검색 줄 진입점이 없다(검색 호스트가 `hideTrigger`를 쓴다). 허브는 쓸 수 있다.
- 거절·잘림 시 다른 모델로 자동 대체하는 기능은 기본으로 꺼져 있다(정책상 모델을 몰래 바꾸지 않는다).
- Node 22에서 실행했다(저장소 요구는 24). 다른 도구 버전에서의 결과는 확인하지 못했다.

### 8.4 새 기능을 더하는 법

1. `claude-<기능>.ts`(스키마·프롬프트·정규화·비용 상한)와 `claude-<기능>-run.ts`(`claudeParse` 호출)를 만든다. 모델 ID 검사는 `resolveClaudeRequestModel`을 쓴다.
2. 화면은 `ClaudeDialogFrame` + `ClaudePresetPicker` + `ClaudePreflight` + `useClaudeBudgetGuard` + `useClaudeTask` + `useClaudeUsageText`를 조립한다.
3. 문구는 `claudeAssist` 사전(ko/en)에 키로 추가하고 `scripts/sync-i18n-legacy-assets.mjs` · `scripts/generate-i18n-builtins.mjs` · `scripts/generate-app-i18n-catalog.mjs`를 돌린다. 화면 파일은 `i18n-namespace-contract.test.ts`의 `GUARDED_NEW_SURFACE_FILES`에 등록한다.
4. `claude-assist-features.tsx`의 `CLAUDE_ASSIST_FEATURES`에 한 항목을 더한다. 허브와 메뉴가 함께 바뀐다.
