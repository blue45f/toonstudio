# AI 설정 사용성 벤치마크 — 키 없이 시작·키 붙여넣기·여러 키 (2026-10-29)

- 상태: **참고 자료** — 2026-10-29에 공개 도움말·변경 이력·공개 피드백 게시판에서 읽은 사실과, 그에 근거한 ToonStudio 설계 판단이다.
- 대상 화면: 설정 > AI 첫 화면(`apps/web/src/shared/ai/AiQuickKeyPanel.tsx`, `UnifiedAiSettings.tsx`), 스튜디오 AI 보조 메뉴
- 함께 보기: [AI 보조 기능](../features/ai-assist.md) · [Cloud-only free-first AI runtime](../operations/free-ai-runtime.md) · [AI 웹툰 보조 앱 REA 역공학 벤치마크(2026-10-26)](ai-webtoon-assist-ecosystem-rea-benchmark-2026-10-26.md)

## 방법과 한계

- 이번 작업 환경(클라우드 세션)에는 REA(`reverse-engineer-anything`) MCP 도구가 연결돼 있지 않아 브라우저 시나리오 캡처·번들 분석을 하지 못했다. 저장소 정책의 Ghidra 강제는 네이티브 바이너리 분석에 적용되는 규칙이라 웹 서비스 비교에는 해당하지 않는다.
- 그래서 각 서비스의 **공식 도움말·변경 이력·공개 피드백 게시판**만 근거로 삼았다. 화면을 직접 조작해 잰 단계 수·완료 시간은 없다. 웹툰 AI 도구의 기능 구조 역공학은 2026-10-26 REA 벤치마크를 따른다.
- 가격·한도는 자주 바뀐다. 아래 수치는 출처에 적힌 그날의 값이다.

## 1. 관찰

| 서비스 | 키 없이 쓸 수 있나 | 키 등록 흐름 | 키 확인 | 같은 서비스 여러 키 | 지금 쓰는 경로 표시 |
| --- | --- | --- | --- | --- | --- |
| LlamaGen(AI 만화) | 관리형 크레딧. 무료는 첫 1,000 크레딧(1컷 150 크레딧, 약 6컷), 이후 유료 | 사용자 키 없음 | — | — | — |
| Dashtoon Studio(AI 웹툰) | 관리형. 무료 일일 한도(캐릭터 1개/일 등) | 사용자 키 없음 | — | — | — |
| Cursor(코드 편집기) | 구독 모델 | Settings > Models에서 서비스별 칸에 붙여넣기 → Verify | 있음 | 서비스당 1개 | 공개 포럼에 "내 키와 구독 중 어느 쪽으로 가는지 모르겠다"는 질문이 있다 |
| Raycast | Raycast AI(Pro) | Settings → AI → Models & Providers → API Keys → `+` → 서비스 고르기 → 붙여넣기 → Verify | 있음 | 서비스당 1개 | 모델 목록에 열쇠 아이콘 |
| TypingMind | 키가 있어야 쓴다 | Models → API keys 탭에 서비스별로 붙여넣고, 모델을 따로 켠다 | — | 자동 순환은 공개 기능 요청 단계 | — |
| Zed(편집기) | Zed 호스팅 모델 또는 자기 키 | Agent Settings(`agent: open settings`)의 LLM Providers에서 서비스별로 등록. 키는 시스템 키체인에 저장 | — | — | — |

정리하면 다음과 같다.

1. **AI 웹툰 도구**는 키를 받지 않고 관리형으로만 동작하며, 무료 사용은 크레딧이나 일일 한도로 빨리 막힌다.
2. **키를 받는 도구**는 모두 "서비스를 먼저 고르고 → 그 칸에 붙여넣고 → 확인"하는 흐름이다. TypingMind는 모델을 따로 켜는 단계가 더 있다.
3. 같은 서비스 키를 여러 개 등록해 막히면 다음 키로 넘어가는 기능은 찾지 못했다(TypingMind에서는 사용자 요청 단계).
4. 지금 어떤 경로(내 키·서비스 제공 모델)로 실행되는지는 Raycast처럼 작은 표식으로만 보이거나, 사용자가 헷갈려 묻는 일이 있다.

## 2. ToonStudio 설계 결정

| 결정 | 근거(1절) | 구현 위치 |
| --- | --- | --- |
| 키 없이 바로 쓴다. 로그인만 하면 운영 고성능 모델(일일 예산) → 성능 좋은 무료 모델 순으로 실행한다 | 웹툰 AI 도구의 크레딧 벽 대신 무료로 계속 쓰게 한다 | 서버 `studio-ai`, [운영 문서](../operations/free-ai-runtime.md) |
| 키 등록은 **붙여넣기 칸 하나**. 키 형식으로 서비스를 자동 인식하고(15개 서비스), 모델·주소도 자동으로 고른다 | 다른 도구는 서비스 고르기(+모델 켜기) 단계가 먼저 있다 | `AiQuickKeyPanel.tsx`, `ai-key-detect.ts`, `ai-quick-key.ts` |
| 등록 전에 실제 연결을 시험한다 | Cursor·Raycast의 Verify와 같은 수준 | `probeUserAiConnection` |
| `.env` 줄이나 여러 키를 한 번에 붙여 넣어도 나눠 등록한다. 서비스당 최대 12개, 전체 24개 | 같은 서비스 여러 키·자동 순환은 다른 도구에서 찾지 못했다 | `splitPastedAiKeys`, `addQuickKey` |
| 한 키가 한도·인증 문제로 막히면 다음 키 → 그다음 ToonStudio AI로 이어 간다 | 위와 같음 | `studio-server-ai-client.ts` |
| 지금 경로를 글자로 보여 준다: 설정 첫 화면의 "1. 내 키 → 2. ToonStudio AI" 순서 안내, 결과 줄의 "ToonStudio AI (실제 모델)" 표시 | 경로가 헷갈린다는 질문(Cursor 포럼)·작은 아이콘 표식(Raycast) | `AiQuickKeyPanel.tsx`, `assist-managed-runtime.ts` |
| 유료 키는 사용자가 동의해야 자동으로 쓴다 | 키 등록만으로 요금이 나가는 일을 막는다 | `addQuickKey(…, { allowPaid })` |

## 3. 남은 차이와 후속 후보

- 이미지 생성 키(fal)는 아직 상세 설정 화면에서 등록한다. 붙여넣기 칸은 안내 링크만 보여 준다.
- 기능별 모델 지정은 고급 설정에만 있다(붙여넣기 칸은 자동 선택).
- 실제 사용자 조작으로 단계 수·완료 시간을 잰 비교는 하지 않았다. REA 도구가 있는 환경에서 같은 흐름을 캡처하면 이 표를 증거로 보강할 수 있다.

## 출처

- Cursor 도움말 — API keys: <https://cursor.com/help/models-and-usage/api-keys>
- Cursor 포럼 — "I'm confused about using your own API vs a Cursor plan": <https://forum.cursor.com/t/im-confused-about-using-your-own-api-vs-a-cursor-plan-how-do-i-know-which-its-using/22011>
- Raycast 매뉴얼 — Bring Your Own Key: <https://manual.raycast.com/ai/bring-your-own-key>
- Raycast 매뉴얼 — Changes to Bring Your Own AI in v2: <https://manual.raycast.com/ai/byoai>
- TypingMind 문서 — 모델 연결(OpenAI): <https://docs.typingmind.com/manage-and-connect-ai-models/openai>
- TypingMind 피드백 — 여러 API 키 자동 순환 요청: <https://feedback.typingmind.com/p/enable-multiple-api-keys-input-and-auto-cycling-for-ai>
- Zed 문서 — AI 구성(Providers, Models, and Settings): <https://zed.dev/docs/ai/configuration>
- LlamaGen 도움말 — Pricing FAQ: <https://help.llamagen.ai/en/account/pricing-faq>
- Dashtoon — AI character generator(무료 플랜 안내): <https://dashtoon.com/ai-character-generator>
