# ToonStudio AI 기능 목록과 실제 동작 검증 계획

기준일 **2026-11-23** · 소스 SHA **`0d0a0df1a92b66de194441bc3efd31128eb3bda4`**

조사 작업트리 `/Users/hjunkim/.codex/worktrees/4d16/toonstudio`

대체텍스트를 실제 편집기에서 시험한 요청 횟수와 저장 결과는 [로컬 브라우저 검증 기록](managed-alt-text-loopback-2026-11-23.md)에 정리했다.

[공개 웹·계정·관리](#공개-웹-작가-도구-자산-제작-및-관리-화면) · [기획·현지화·음악·홍보](#작품-기획현지화음악홍보-화면) · [Studio 편집기](#스튜디오-편집기생성-도구) · [콘티 하위 호출 색인](#콘티-전문-도구-호출-색인)

**우선 확인할 동작은 이미지 A의 늦은 대체텍스트 응답이 이미지 B나 저장된 원고에 섞이는지다.** 아래 목록은 현재 소스에 있는 화면과 처리 경로를 추적한 결과(`current`)다. 각 표의 후속 시험은 앞으로 확인할 항목(`target`)이다. 소스에서 버튼을 찾은 것, 실제 브라우저에서 눌러 본 것, 공급자가 처리한 것은 다른 증거다.

## 조사 범위와 중복

Studio 편집기·생성 도구 45행, 공개 웹·계정·관리자·자산 제작 26행을 살폈다. 한 행에 같은 화면의 여러 동작이 들어가며, 같은 기능의 다른 진입점도 포함한다. 콘티 전문 패널 12개의 하위 색인에는 실제 소스 줄과 대조한 고유 함수 식별자 170개를 담았다. 실제 사용자 기능 수와 청구 단위는 이 숫자로 계산할 수 없다.

- **같은 동작의 다른 입구**에는 `/create`의 ‘내 이야기’와 Studio 표의 나레이션 제안, 프로젝트 기획의 스토리 씨앗, `/studio/ai-settings`에서 이동하는 `/settings/ai`가 있다. 중복 행은 진입점과 저장 정책을 함께 확인하기 위해 남겼다.
- **비슷한 이름이지만 별도 경로**인 사례는 공개 홈 Luna와 AI 랩 디렉터, 일반 고객센터와 Studio 고객센터, 기기 채색과 외부 이미지 편집, 웹 셰이퍼와 독립 Character Lab이다. 팬과 작가 테스트는 같은 챗 엔진을 쓰지만 사용자 역할과 세션을 별도로 시험한다.
- **발견 범위**는 라우트와 화면 호스트, 사용자 동작 핸들러, 모델/서버 어댑터, 저장소, 권리 표시, 조건부 실험 기능, 이름에 AI가 있으나 규칙·템플릿·도움말만 제공하는 화면이다. 호스트 호출을 찾지 못한 패널은 해당 행에 표시했다. 역할·플래그·기기 모델 파일에 따른 실제 노출, 네이티브 앱 동작, 공급자 계약·지원 모델·비용·운영 가용성은 남은 확인 대상이다.

## 검증 순서와 합격 기준

| 단계 | 실행 조건 | 결과를 판정할 증거 |
| --- | --- | --- |
| 1. 브라우저 UI, 생성 무호출 | 전용 DEV 주소·빈 브라우저 프로필·합성 파일·로컬 테스트 로그인. 모든 통신 경로는 기본 차단하고 지정된 loopback의 필요한 요청만 허용한다. | 보기·입력·이미지 선택·닫기·다시 열기 동안 **생성 요청 0회**. 화면 캡처, 접근 가능 이름과 상태, 요청별 출처/용도/처분을 함께 보관한다. 페이지·정적 파일, 사용자 상태 GET, 작업 상태 조회, 모델 파일 요청을 생성 요청에서 분리한다. |
| 2. 브라우저 UI와 로컬 모의 응답 | 실제 에디터와 실제 기기 저장 경로를 연결하고 앱 API·인증을 로컬에서 대체한다. 동일 출처 미허용 API도 차단한다. 외부 출처는 요청을 전달하기 전에 차단한다. | A 명시 실행 **1회**, 보류 중 A 취소 또는 B 선택 → A 늦은 응답 반환 → B 실행 전 추가 생성 **0회**, B 명시 실행 **1회**. 대체텍스트·그림·화면·원고 저장본에 오래된 A가 반영되는지 각각 검사한다. 불명확 응답의 안내, 대기/재시도, 자동 재전송 0회, 문서 재열기, 데스크톱·모바일 증거를 남긴다. 나머지 기능에도 표에 적힌 입력/권리/실패/선택/저장 조건을 적용한다. |
| 3. 실제 공급자 | 사용자가 지정한 확인 주체인 닷이 정확한 조직·프로젝트의 **포함 허용량, 초과 과금 강제 차단, 실제 전송 대상과 데이터 범위**를 독립 검증하고 사용자가 별도 지시한 뒤에만 검토한다. | 현재 공급자 시험 **보류**. 이후 승인된 합성 입력과 정확히 한 건의 승인된 실행에서 서비스/모델·요청 ID·비용/할당량 기록·결과 형식·저장 재열기를 대조한다. 상태 API의 ‘연결됨’, 제품의 무료 표기, 코드 경로는 실제 공급자 시험 증거로 쓰지 않는다. |

각 실행 기록에는 날짜와 SHA·작업트리·DEV 주소·화면 크기, 합성 입력 A/B 식별자, 사용자가 누른 시점, 응답 지연/취소/완료 순서, 허용된 모의 요청 건수와 차단된 출처의 처리 결과, 전후 UI/저장 차이와 다시 여는 방법을 남긴다. 자료에는 키·실제 계정·사용자 원고를 넣지 않는다. 브라우저에는 성공이 표시됐으나 저장·공급자 상태를 확인할 수 없으면 해당 단계만 미검증으로 둔다.

이 문서의 행별 판정은 **정적 확인**이다. 각 행의 브라우저 UI, 모의 응답, 실제 공급자, 저장·재열기 상태는 해당 실행 원본과 일치하는 별도 실측 기록이 있을 때만 갱신한다. 사용자가 전달한 이전 합성 React 시험 `d081/8439`의 ‘닫기 0회, 명시 실행 시 loopback 1회’는 전체 에디터에서 이미지 교체 후 저장·재열기를 한 결과에 포함하지 않는다.

## 공개 웹, 작가 도구, 자산 제작 및 관리 화면

아래 표는 체크아웃의 라우트, 버튼 핸들러, 전송 함수, 저장 코드를 연결한 목록이다. 이 표의 브라우저·모의 응답 검증은 별도 실행 기록이 있는 행에서만 인정한다. 실제 공급자는 모든 행에서 미호출이다. 계정과 공급자 상태를 읽지 않았으므로 코드에 등록된 서비스가 이 사용자에게 사용 가능한지는 알 수 없다.

표의 **공용 텍스트 경로**는 [studio-server-ai-client.ts](../../apps/web/src/domains/creator/studio-server-ai-client.ts)의 `completeStudioServerText`를 가리킨다. 자동 선택이면 사용자 설정에 따라 개인 키와 서비스 경로의 순서가 달라진다. UI의 ‘무료’라는 문구만으로 실제 공급자, 해당 계정의 포함량 또는 초과 과금 차단을 확정할 수 없다. 코드에 나타나는 서버 공급자 표시는 Anthropic, Gemini, Qwen, Groq, SambaNova, Z.AI, Mistral, Cloudflare, OpenRouter, SiliconFlow, DeepSeek다. 실제 요청 결과가 있어야 어느 공급자를 썼는지 알 수 있다. 아래의 후속 시험은 로컬 모의 응답 또는 기기 로컬 확인을 뜻한다.

| 기능과 화면 | 실행 주체 · 사용자 행동 · 전달 범위 | 결과 · 저장 · 다시 열기(코드상) | 다음 시험과 근거 |
|---|---|---|---|
| 공개 홈 `/`의 Luna 창작 안내 | 개인 텍스트 연결. 질문 전송 시 질문과 최근 대화 최대 6개를 프롬프트에 사용한다. 제안 칩은 링크다. | 답변·키 없음·한도 초과 말풍선. 대화는 컴포넌트 메모리에 있어 다시 마운트하면 인사말부터 시작한다. | 키 없는 합성 프로필에서 제안 칩과 질문 전송을 각각 확인. 연결 없음 안내와 새로고침 후 인사말. [HomeLunaPanel.tsx](../../apps/web/src/domains/marketing/HomeLunaPanel.tsx), [UnifiedHomePage.tsx](../../apps/web/src/domains/marketing/UnifiedHomePage.tsx). |
| `/create` 한 줄 아이디어 → 자동 콘티 | 프리셋, 즉시 설계, 형식·톤 변경, 컷 리믹스는 기기 규칙. 별도 ‘클라우드 AI 문장 윤문’을 누르면 아이디어·톤·기존 제목과 컷별 장면/대사/나레이션을 공용 텍스트 경로로 보낸다. | 제목·로그라인·컷 후보를 편집한다. Studio 열기로 작품/첫 문서/비트를 생성한다. 연구실로 보내기는 사용자별 sessionStorage 초안 → 연구실 저장으로 이어진다. | 프리셋·컷 편집 0회 → 명시 윤문 1회 → 형식 오류 때 로컬본 유지 → 두 전달 동선 각각 재열기. [AiQuickBlueprintComposer.tsx](../../apps/web/src/domains/creator/ai-quick-blueprint/AiQuickBlueprintComposer.tsx), [ai-quick-blueprint-handoff.ts](../../apps/web/src/domains/creator/ai-quick-blueprint/ai-quick-blueprint-handoff.ts). |
| `/create` 내 이야기 인터뷰 → 나레이션 | 질문/템플릿은 로컬. ‘보낼 내용 미리 보기’ 후 ‘AI로 다듬기’에서 나레이션 대상 답변을 공용 텍스트 경로로 보낸다. 개인정보 유사 패턴 안내가 있다. | 컷별 후보는 별도. 선택한 후보만 인터뷰 상태에 채택한다. 진행 중 localStorage 임시저장. 작품 생성 후 초안 정리. | 두 컷 중 하나만 채택 → 이어 쓰기와 Studio 문서 재열기, 취소·실패 후 원문 비교. [MyStoryAiPanel.tsx](../../apps/web/src/domains/creator/my-story/MyStoryAiPanel.tsx), [MyStoryStartFlow.tsx](../../apps/web/src/domains/creator/my-story/MyStoryStartFlow.tsx), [my-story-handoff.ts](../../apps/web/src/domains/creator/my-story/my-story-handoff.ts). |
| `/story-lab` 스토리 연구실 | 아이디어 프리셋·빈 기획 칸 자동 채우기·문장 미리보기는 템플릿 처리. AI 도구 열기는 이동 링크다. | 편집 중 사용자별 세션 초안. ‘저장’ 후 같은 사용자 작업공간에서 기획서를 읽거나 Markdown으로 내보낸다. | 기존 한 칸을 먼저 작성하고 빈 항목만 채워지는지, 저장 전후 복구·새로고침·외부 요청 0회 확인. [StoryLabPage.tsx](../../apps/web/src/domains/creator-resources/StoryLabPage.tsx), [workspace.ts](../../apps/web/src/domains/creator-resources/workspace.ts). |
| `/research` 소재 문장 ‘AI로 다듬기’ | 공용 텍스트 경로. 다듬기 버튼에 입력 문장만 보낸다는 안내. 입력 해석은 규칙 기반, 자료 ‘찾기’는 별도 요청이다. | 다듬어진 문장을 입력창에 넣고 원문으로 되돌릴 수 있다. 실패하면 원문을 유지한다. 검색 기록은 ‘찾기’로 확정할 때 기록한다. | 실행 전 0회 → 다듬기 A 대기 → 편집 또는 이탈 → A 지연 반환. 자료 검색 자동 실행·최근 검색 오염 여부 확인. [research-material-refine.ts](../../apps/web/src/app/routes/groups/research-material-refine.ts), [MaterialSentencePanel.tsx](../../apps/web/src/domains/creator-resources/material-hub/MaterialSentencePanel.tsx). |
| `/character-chat` 팬 챗 · `/character-chat/manage` 작가 테스트 | 등록된 개인 텍스트 연결. 프로필/정사·스포일러·말투 지시·최근 대화·질문으로 답변한다. 키가 없을 때의 장면 스타터 미리보기는 정해진 정사 텍스트다. 연결이 있으면 장면 선택은 입력칸을 채우고, 즉시 시작 버튼이 발신한다. | 프로필·대화와 사용량은 기기의 IndexedDB. 로그인한 계정의 프로필 변경은 앱 서버에도 저장을 시도한다. 대화는 캐릭터·계정별로 재열기. 관리자는 작가 요약을 본다. | 무키 미리보기 → 설정된 모의 연결 1회 → 금지 주제 차단 → 소유 계정·다른 계정, 테스트 대화 재열기. [CharacterChatPage.tsx](../../apps/web/src/domains/character-chat/CharacterChatPage.tsx), [CharacterChatThread.tsx](../../apps/web/src/domains/character-chat/CharacterChatThread.tsx), [character-chat-store.ts](../../apps/web/src/domains/character-chat/character-chat-store.ts), [character-chat-scene-starter.ts](../../apps/web/src/domains/character-chat/character-chat-scene-starter.ts). |
| 팬 챗 · 프로필 편집의 목소리 미리듣기, 자동 낭독 | 기기 Web Speech. 자동 낭독과 온라인 음성은 별도 옵션이며 기본 꺼짐. 온라인 선택은 브라우저/OS 음성 공급자를 경유할 수 있다. | 해당 메시지의 재생 상태는 메모리. 음성 옵션은 기기 localStorage. 합성 음원 파일 저장 동선과 구별한다. | 합성 음성 API를 대체해 로컬 음성·음성 없음·재생 중 캐릭터 교체 후 취소 및 옵션 재열기. 원격 OS 음성 사용 보류. [character-chat-voice.ts](../../apps/web/src/domains/character-chat/character-chat-voice.ts), [CharacterChatSpeechControls.tsx](../../apps/web/src/domains/character-chat/CharacterChatSpeechControls.tsx), [character-chat-voice-settings.ts](../../apps/web/src/domains/character-chat/character-chat-voice-settings.ts). |
| `/support` AI 자가진단 · 비공개 AI 고객센터 · 운영자 이력 열람 | 입력 4자 이상일 때 키워드 자가진단을 로컬 표시한다. 로그인 후 AI 상담 모드에서 보내면 앱 서버가 기록하고 Anthropic Messages에 대화 내용을 전달하는 경로가 있다. 공개 여부와 공급자 전송을 화면에서 안내한다. | 사용자 발신·AI 답변을 별개 DB 행으로 저장한다. 응답 실패 때 이미 저장된 발신과 재요청/운영자 전환 표시. 내 상담 이력과 허가된 관리자 상담 화면으로 재열기. | 로그인·내용 전부 모의. 전송 전 자가진단 0회 → 발신 저장+AI 실패 → 수동 재요청 또는 운영자 전환 뒤 지연 응답 억제 → 목록/로그인 변경. [CustomerSupportChat.tsx](../../apps/web/src/domains/legal/CustomerSupportChat.tsx), [customer-support-api.ts](../../apps/web/src/domains/legal/customer-support-api.ts), [customer-support-ai.service.ts](../../apps/api/src/modules/customer-support/customer-support-ai.service.ts), [customer-support.repository.ts](../../apps/api/src/modules/customer-support/customer-support.repository.ts). |
| `/studio/support` 창작자 AI 상담 · 지원 브리프 자동 채움 | 별도 경로. 보내면 마스킹한 내용·최근 대화·현재 경로로 `/customer-support/ai-chat` 호출. 서버 무료 라우터가 활성화됐을 때만 클라우드, 아니면 서버 지식표, 오프라인이면 브라우저 지식표. 담당자 연결을 열면 별도 `autofill-ticket`에서 분류·긴급도·요약·체크리스트를 만든다. | 채팅은 화면/서버 임시 세션. 인계 초안은 저장 동작으로 localStorage 또는 브리프에 전달한다. 일반 고객센터의 DB 상담 스레드와 저장 매체가 다르다. | 지식표와 모의 클라우드의 출처 배지, 인계 창 열기와 인계 초안 보존, 상담 접수 여부를 분리 확인. [support-ai-chat-client.ts](../../apps/web/src/domains/creator/support-chat-ai/support-ai-chat-client.ts), [StudioAiSupportCenterChat.tsx](../../apps/web/src/domains/creator/support-chat-ai/StudioAiSupportCenterChat.tsx), [customer-support-chat.service.ts](../../apps/api/src/modules/customer-support/customer-support-chat.service.ts). |
| `/fortune/prescription` ‘아라의 가상 서재: AI 독서 처방전’ | 처방전 실행 시 고민 문장·캐릭터 ID를 앱 API로 전송. 이 SHA의 서버는 모델 함수를 주입하지 않고 장르 키워드·카탈로그·미리 작성된 해석을 사용한다. | 독서 목록·해석·컷 결과와 기기 보관함. 서버 이용 실적 처리가 별개다. | 동일 입력을 로컬 API 모의로 보내 결과 보관함 복원, 공급자 요청 0회 확인. [FortunePage.tsx](../../apps/web/src/domains/fortune/FortunePage.tsx), [fortune.service.ts](../../apps/api/src/modules/fortune/fortune.service.ts), [fortune-engine.ts](../../packages/core/src/fortune/fortune-engine.ts)의 `drawPrescription`. |
| `/settings/ai` 통합 키·모델·순서·Claude 연결·예산 / `/settings/api-keys` fal | 비용·외부 전송 확인 후 연결 버튼. Claude 모델 목록 확인은 Anthropic GET. 일반 연결은 검증 단계/공급자에 따라 모델 탐색. fal은 명시 저장으로 탭 세션에 넣으며 등록 자체에 학습 호출이 없다. | 통합 키는 기본 메모리, 사용자가 고르면 기기 암호화 보관함과 새 탭 잠금 해제. fal은 sessionStorage. 모델 목록 조회와 추론, 로컬 예산 설정과 공급자 과금 차단은 별개다. | 무키 조회에서 상태 GET과 추론 요청 구별. 미동의/닫기/새 탭·잠긴 상태 확인. 실제 키 입력·요금/계정 변경 보류. [AiSettingsPage.tsx](../../apps/web/src/domains/account/AiSettingsPage.tsx), [UnifiedAiSettings.tsx](../../apps/web/src/shared/ai/UnifiedAiSettings.tsx), [user-ai-store.ts](../../apps/web/src/shared/ai/user-ai-store.ts), [AssistConnectionCard.tsx](../../apps/web/src/shared/ai/assist/AssistConnectionCard.tsx), [FalKeyConnectCard.tsx](../../apps/web/src/domains/integrations/api-key-hub/FalKeyConnectCard.tsx). |
| `/settings` 브라우저 실험실 | WebNN·브라우저 내장 Prompt API 등의 지원 여부와 기기 실험 옵션. 보드 진입을 inference 실행으로 세지 않는다. | 설정/지원 상태를 재표시. 생성 결과 없음. | 합성 지원/미지원 브라우저로 표시와 옵션 재열기, 모델 자동 설치·추론 0회 확인. [NextgenLabSettingsSection.tsx](../../apps/web/src/domains/account/NextgenLabSettingsSection.tsx), [nextgen-lab-settings.ts](../../apps/web/src/shared/lib/nextgen-lab-settings.ts). |
| 마켓 AI 포함 필터·정책 / 공개 작품 AI 학습 표기 | 검색에서 ‘AI 미포함만’은 서버 쿼리, 제작 환경에서 AI 사용 조건은 설정, 판매자/작가의 표기는 권리 메타데이터다. 모델 호출 없음. | 상품 상세·비교·제작 적합성에서 `containsAi`와 manifest 재표시. 작품·회차는 미지정/불허/허용 선택값을 독자 권리 화면에 표시. 외부 학습 차단 효력은 알 수 없다. | 합성 상품 각각 1건으로 필터/상세 일치, 조건·공개본의 과거 버전 표시 확인. [MarketBrowseFacetBar.tsx](../../apps/web/src/domains/market/components/MarketBrowseFacetBar.tsx), [MarketDetailLicenseAdvisor.tsx](../../apps/web/src/domains/market/components/MarketDetailLicenseAdvisor.tsx), [CreatorAiTrainingConsentField.tsx](../../apps/web/src/domains/creator/ai-training-consent/CreatorAiTrainingConsentField.tsx), [PublishedWorkReader.tsx](../../apps/web/src/domains/creator/PublishedWorkReader.tsx). |
| 관리자 `/admin/platform/ai-operations` AI·무료 플랜 운영 보드 | 관리자/운영자 신원 확인 후 모델·알림·가설·작업·근거 기록을 열고 편집/가져오기/저장한다. 공급자 추론·요금제 변경 없음. | 서버 스냅샷, 리비전·감사 이력. 미저장 화면 편집, 승인된 공용 저장, 다시 읽기 경계가 있다. | 합성 401/읽기전용/편집권 3종과 저장 충돌·재조회 시험. [AiOperationsBoard.tsx](../../apps/admin-web/src/domains/operations/ai-operations/AiOperationsBoard.tsx), [useAiOperationsBoard.ts](../../apps/admin-web/src/domains/operations/ai-operations/useAiOperationsBoard.ts). |

### 작품 기획·현지화·음악·홍보 화면

| 기능과 화면 | 공급자 · 실행 시점 · 출력 | 저장 · 다음 재열기 시험 | 근거 |
|---|---|---|---|
| 프로젝트 기획 ‘스토리 씨앗’ | 기본 초안은 로컬 규칙. ‘AI 씨앗 확장 만들기’에서 장르·키워드 등 기획 입력을 공용 텍스트 경로에 보낸다. 로그라인과 전개 후보를 만든다. | 회차 반영은 별도 동작이며 기존 줄거리가 있으면 덮어쓰기 확인. 기본/AI 초안, 기존 회차의 취소/반영 후 재열기를 비교한다. | [StudioStorySeedBuilder.tsx](../../apps/web/src/domains/creator/planning/StudioStorySeedBuilder.tsx) |
| `/studio/ecosystem` 대사 한 줄 번역 · 원고 사본 워크벤치 일괄 번역 | 한 줄은 원문·대상 로케일, 일괄은 최대 20행의 ID·원문을 공용 텍스트 경로에 보낸다. 각각 번역 제안 버튼에서 실행. | 단건은 검토용 입력란, 승인 여부가 구분된 기기 상태. 일괄은 메모리에 있는 예제 사본에 승인된 행만 적용. 미승인·원문 변경·새 예제 로드·재열기를 시험한다. | [CreatorEcosystemPage.tsx](../../apps/web/src/domains/creator/ecosystem/CreatorEcosystemPage.tsx), [CreatorEcosystemWorkbench.tsx](../../apps/web/src/domains/creator/ecosystem/CreatorEcosystemWorkbench.tsx) |
| 프로젝트 개요의 Creator Intelligence · 대사 번역 | DeepL 또는 자체 LibreTranslate를 선택해 번역할 대사·대상 언어를 ‘번역’으로 전달. 비용 정책 준비 상태로 버튼 제한. | 결과 문자열은 화면 상태. ‘현지화 스튜디오에서 다듬기’ 링크를 누른 뒤 실제 문자열을 인계하는지 확인한다. 같은 프로젝트 재열기와 미저장 상태 비교. | [StudioCreatorIntelligencePanel.tsx](../../apps/web/src/domains/creator/creator-intelligence/StudioCreatorIntelligencePanel.tsx), [studio-creator-intelligence-client.ts](../../apps/web/src/domains/creator/creator-intelligence/studio-creator-intelligence-client.ts) |
| 같은 도구 · 효과음 | ElevenLabs에 짧은 소리 설명·지속 시간을 생성 버튼으로 전달. Freesound는 별도 음원 검색/보관. | 생성한 효과음은 메모리 재생·MP3 다운로드. 검색한 음원 메타데이터만 프로젝트 기기 저장에 들어간다. 모의 오디오 파일에서 재생/내려받기와 다시 로드한 보관 목록을 비교한다. | [StudioCreatorIntelligencePanel.tsx](../../apps/web/src/domains/creator/creator-intelligence/StudioCreatorIntelligencePanel.tsx)의 `generateSound`, [studio-creator-intelligence-store.ts](../../apps/web/src/domains/creator/creator-intelligence/studio-creator-intelligence-store.ts) |
| 같은 도구 · 2D → 3D Meshy 작업 | 사용자가 지정한 공개 HTTPS 이미지 URL을 Meshy 작업으로 제출한다. 공급자 실행과 비공개 결과 저장소 준비 상태가 필요하다. 기기 내 Lift3D는 별도 도구다. | 작업 생성/진행 상태 갱신, 프로젝트 보관 버튼으로 작업 ID·상태·결과 참조를 기기에 기록. 재열기 후 자산 바이트 접근·만료 여부는 별도 검증. 생성·조회·보관을 각각 집계한다. | [StudioCreatorIntelligencePanel.tsx](../../apps/web/src/domains/creator/creator-intelligence/StudioCreatorIntelligencePanel.tsx)의 `createMesh`·`refreshMesh`, [creator-intelligence-mesh-artifact.service.ts](../../apps/api/src/modules/creator-intelligence/creator-intelligence-mesh-artifact.service.ts) |
| 같은 도구 · 발행 전 선택적 SafeSearch | Google Vision. PNG/JPEG/WebP 2MB 이하 파일을 선택하면 곧바로 전송 함수가 실행된다. 추가 실행 버튼으로 기다리지 않는다. | 사람 검토 권장/플래그를 화면에 표시. 이 도구의 프로젝트 저장 자료형에는 검사 결과 필드가 없다. 유효·초과 파일의 요청 건수, 원고와 공개 상태 독립성을 확인한다. | [StudioCreatorIntelligencePanel.tsx](../../apps/web/src/domains/creator/creator-intelligence/StudioCreatorIntelligencePanel.tsx)의 `runSafeSearch`, [studio-creator-intelligence-store.ts](../../apps/web/src/domains/creator/creator-intelligence/studio-creator-intelligence-store.ts) |
| 음원 작업실 `/studio/assets/audio` AI 가사 | 공용 텍스트 경로. 장면·스타일이 있는 브리프에서 ‘AI 가사’ 실행. | 편집할 수 있는 가사와 공급자/모델 표시. 가사 요청과 음악 생성은 별도. 같은 입력으로 가사만 만들고 음원 생성 0회, 취소/다시 열기를 확인한다. | [StudioMusicPage.tsx](../../apps/web/src/domains/creator/music/StudioMusicPage.tsx)의 가사 처리 |
| 같은 작업실 · AI OST·보컬/연주곡 | Eleven Music(ElevenLabs). 장면·가사 권리와 전송 확인 후 생성. 로그인·서비스 상태가 별도 조건. | 음원 재생, MP3, 기기 보관함, 작품 연결. 생성 후 저장 실패 시 기존 음원 저장 재시도를 제공한다. 모의 음원으로 저장 실패/재시도 시 생성 횟수 불변, 재열기 후 오디오 바이트 재생 확인. | [StudioMusicPage.tsx](../../apps/web/src/domains/creator/music/StudioMusicPage.tsx), [studio-music](../../apps/api/src/modules/studio-music) |
| 홍보 제작 · AI 컷 순서/문구/자막 | 명시 구성 실행 시 제목·줄거리·컷 설명·자막을 공용 텍스트 경로로 보낸다. 이 화면의 ‘무료 전용’ 안내와 공용 라우팅 설정의 일치는 모의 시험 대상. | 파싱 성공 시 홍보 프로젝트 패널에 적용, 브라우저 자동 저장/JSON 백업. 이미지 전송 0바이트인지, 이탈·재열기·되돌리기를 확인한다. | [StudioPromoPage.tsx](../../apps/web/src/domains/creator/promo/StudioPromoPage.tsx)의 `generate`, `promoAiPrompt` |
| 홍보 음성 디렉터 · 기기 낭독/온라인 음성 · 클라우드 음성 | 기기 기본 음성, OS 온라인 음성 허용은 별도 선택. 클라우드는 ‘Gemini 한국어 AI 음성 만들기’ 또는 ‘Deepgram 영문 Aura 음성 만들기’에서 대사·음색/스타일 등을 보낸다. 클립별 합성 단위로 집계해야 한다. | 클립별 합성을 자막 타임라인에 맞춰 내레이션 트랙에 연결. 홍보 프로젝트 기기 저장. 언어 제한, 중간 클립 실패, 반환 시각과 재열기 후 오디오 길이/시작점 대조. | [PromoVoiceDirector.tsx](../../apps/web/src/domains/creator/promo/PromoVoiceDirector.tsx), [promo-cloud-voice.ts](../../apps/web/src/domains/creator/promo/promo-cloud-voice.ts), [StudioPromoPage.tsx](../../apps/web/src/domains/creator/promo/StudioPromoPage.tsx) |
| 웹 셰이퍼 `/studio/assets/characters/new` 및 Studio VRM 포저 | 참조 이미지 AI 추천·팔레트 추출, 사진 전신/손 포즈, 웹캠의 표정·머리/손 추적. 기기 MediaPipe·이미지 분석. 파일 선택/카메라 시작/실행과 모델 에셋 로딩은 각기 다른 동작이다. | 프리셋/색·포즈 미리보기 → 실제 적용 → 셰이퍼/에디터 저장. 원본 영상과 적용 결과를 각각 확인한다. 합성 프레임과 로컬 모델로 권한 거절/취소/모델 미탑재/재열기 검증. | [CharacterShaperReferenceDrawer.tsx](../../apps/web/src/domains/creator/character-shaper/CharacterShaperReferenceDrawer.tsx), [StudioVrmPhotoPoseScanner.tsx](../../apps/web/src/domains/creator/vrm/StudioVrmPhotoPoseScanner.tsx), [studio-vrm-avatar-reference-inference.ts](../../apps/web/src/domains/creator/vrm/studio-vrm-avatar-reference-inference.ts) |
| 독립 Character Lab Vision · 렌더 보정(2026-11-27 퇴역·`/studio/character` 흡수) / Brush Lab 벤치 | Character Lab은 웹 셰이퍼로 통합돼 2026-11-27 퇴역. 기존 비전·렌더 계약은 `@toonstudio/studio-project-model/character-kit`에 승격했고, Brush Lab 수치 검사는 기기 계산이다. | 합성 사진/가상 카메라·로컬 모델 파일 검증은 웹 셰이퍼·포저 행(`/studio/character`)에서 수행. 브러시 수치와 실제 드로잉 결과 분리. | [Character Lab 보관 기록](../archive/character-lab/README.md), [vision.ts](../../packages/studio-project-model/src/character-kit/contracts/vision.ts), [BenchmarkResultsView.tsx](../../apps/brush-lab/src/app/views/BenchmarkResultsView.tsx) |

### 기능 이름과 실제 노출 경계

- 캐릭터 인터뷰에는 캐릭터 챗 BYOK를 재사용하는 엔진/패널/메모 콜백이 있고 제작 멘토에는 BYOK 엔진이 있다. 이번 체크아웃의 비테스트 URL·호스트에서 이 두 기능으로 이어지는 import를 찾지 못했다. 배포 UI에 보인다고 집계하려면 실제 진입 링크와 설정 메모 저장 주체부터 확인해야 한다. [CharacterInterviewPanel.tsx](../../apps/web/src/domains/character-interview/CharacterInterviewPanel.tsx), [character-interview-engine.ts](../../apps/web/src/domains/character-interview/character-interview-engine.ts), [creator-mentor-engine.ts](../../apps/web/src/domains/creator-mentor-chat/creator-mentor-engine.ts).
- 플레이의 스토리 주사위·모션 패널은 기기 템플릿/연출, 가위바위보는 결정적 게임 상대다. 추천 목록·자료 검색·리서치 노트의 규칙 질문, 교육 과정, 요금제 안내, AI 제작 일러스트·홍보물·기술 벤치 소개는 소비자가 새로 추론을 요청하는 버튼이 아니다. 검색·권리 안내의 API 통신은 생성 요청과 별개로 기록한다.
- [mobile](../../apps/mobile)은 웹 origin을 띄우는 Capacitor 래퍼다. 모바일 뷰포트 측정과 네이티브 WebView의 권한·저장소·백그라운드 재진입은 별도 시험이다. [desktop-sync](../../apps/desktop-sync)에서 독립 AI 추론 UI를 찾지 못했다. 적용 가능성이 있는 비공개 플래그·개인 역할·미연결 패널의 노출은 미검증이다.
- 기획의 ‘AI 제안 Diff 게이트’는 준비된 제안의 변경 전후/직접 수정/승인/거절을 보여준다. 승인·거절을 누르면 프로젝트 기획 상태를 저장한다. 기기 내 증분 검수와 수동 보완 제안을 실제 모델 실행으로 집계하지 않는다. 합성 제안의 필드별 승인·거절·재열기와 변경 이력이 다음 확인 대상이다. [StudioAiProposalDiffGate.tsx](../../apps/web/src/domains/creator/planning/StudioAiProposalDiffGate.tsx), [StudioStoryLivingSpecWorkbench.tsx](../../apps/web/src/domains/creator/planning/StudioStoryLivingSpecWorkbench.tsx).
- 음원 작업실 외부 AI 음악 툴킷은 공급자별 프롬프트 복사·인계 JSON 내려받기·외부 서비스 링크를 제공한다. 파일을 생성하거나 복사할 때 공급자 추론은 일어나지 않는다. 다음 시험은 합성 브리프로 다운로드한 JSON을 직접 열어 입력/권리 메타데이터를 대조하는 것이다. [MusicProviderToolkit.tsx](../../apps/web/src/domains/creator/music/MusicProviderToolkit.tsx), [studio-music-provider-catalog.ts](../../apps/web/src/domains/creator/music/studio-music-provider-catalog.ts).

## 스튜디오 편집기·생성 도구

이 절은 0d0a0df1a92b66de194441bc3efd31128eb3bda4의 라우트, 버튼 핸들러, 실제 호출부와 저장 경로를 읽은 결과다. 모든 행의 브라우저·모의·공급자·저장/재열기 실측 기본 상태는 **미검증**이다. 이 회차의 실제 브라우저 측정은 별도 실측 기록에 한해 해당 상태를 갱신한다. 사용권·실제 외부 공급자·응답 모델·운영 가용성은 코드만으로 결정할 수 없다.

'실행'은 클릭 등 사용자 동작을 뜻한다. 품질, 데이터 전송, 별도 동의 체크가 실제 화면에서 어떻게 보이는지는 재현할 항목이다. 테스트에서 모사할 상태 조회·파일 읽기·모델 파일 가져오기와 생성 POST의 수를 따로 기록한다.

| 기능·화면 | 실행 경로·입력·동의 시점 | 결과·저장 계약 | 다음 격리 E2E |
| --- | --- | --- | --- |
| 어시스트 > 대체텍스트 | 캔버스 캡처·이미지 파일 선택·붙여넣기 후 범위/언어/메모와 전송 안내를 보고 실행. 관리형 로그인 세션의 `/api/studio-ai/messages` 또는 개인 Claude 연결 | 짧은·긴 설명, 컷별 설명, HTML 속성·오디오 대본을 편집·복사. 결과는 대화상자 상태. 그림 속성에 쓰는 콜백 없음 | A 응답 보류 → 취소/교체 → B 명시 실행. 불명확·거절·성공 각각 요청 수·문서·재열기 대조. [AssistAltTextDialog.tsx](../../apps/web/src/domains/creator/ai/assist/AssistAltTextDialog.tsx), [AssistAltTextResult.tsx](../../apps/web/src/domains/creator/ai/assist/AssistAltTextResult.tsx) |
| 어시스트 > 아트 디렉터 | 동일 관리형/개인 Claude 경로. 이미지·검수 범위·맥락 선택 뒤 실행 | 품질 검수, 오버레이·강점·지적·레이어별 수정 제안·마크다운 복사. 그림 반영 없음 | 합성 컷 A/B 교체, 오버레이가 B로 새지 않는지와 원고 재열기. [AssistArtDirectorDialog.tsx](../../apps/web/src/domains/creator/ai/assist/AssistArtDirectorDialog.tsx), [AssistArtDirectorResult.tsx](../../apps/web/src/domains/creator/ai/assist/AssistArtDirectorResult.tsx) |
| 어시스트 > 명령 도우미 | 같은 경로. 질문·설명 또는 할 일·명령 후보를 전송. 후보 생성과 선택 단계 실행은 각각 사용자 동작 | 설명 또는 명령 계획. 검토 후 실제 명령을 실행할 때만 명령별 문서 효과 발생 | 모의 응답에 없는 명령·현재 불가한 명령·취소를 넣고 명령 호출·저장·Undo 검증. [AssistCommandPlanDialog.tsx](../../apps/web/src/domains/creator/ai/assist/AssistCommandPlanDialog.tsx) |
| 어시스트 > 대사 현지화 | 같은 경로. 원문 행·언어·용어집·문체·문자 수를 확인하고 실행 | 편집·복사하는 번역 결과, 누락 행 표시. 편집기 대사 번역과 별도 화면 | 합성 3행 중 1개 누락/중복 응답. 원문 보존, 누락 표시, 재열기·재실행 수 확인. [AssistLocalizeDialog.tsx](../../apps/web/src/domains/creator/ai/assist/AssistLocalizeDialog.tsx), [AssistLocalizeResult.tsx](../../apps/web/src/domains/creator/ai/assist/AssistLocalizeResult.tsx) |
| AI 연동 > 배경 생성 | 사용자가 고른 이미지 API(BYOK)에 프롬프트·크기를 전송. 이미지 생성군은 최초 안내 확인을 기기 설정에 기록 | 생성 성공 시 원고에 배경 이미지를 삽입하고 출처를 기록 | 첫 고지 취소/확인, 잠금·문서 교체, 저장 후 맨 뒤 이미지와 출처 비교. [StudioCuttoonEditorHost.tsx · executeAiBackgroundGenerate](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx#L17800) |
| AI 연동 > 캐릭터 일관성 | 같은 이미지 API. 사용자 선택 기준 이미지와 지시, 최초 이미지 안내 | 새 이미지 요소 추가. 기준 그림 유지 | A를 기준으로 실행 → 선택/문서 변경. 원본·새 객체 ID·재열기 확인. [StudioCuttoonEditorHost.tsx · executeAiCharacterConsistency](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx#L18079) |
| 라이브러리 > AI 에셋 생성 | 로그인·이미지 BYOK·최초 안내. 설명·크기·품질 전송 | 에셋 보관함 저장 절차와 원고 삽입을 거침 | 생성 성공 뒤 라이브러리 저장만 실패시켜 중복 생성·삽입 유무 확인. [StudioCuttoonEditorHost.tsx · executeGenerateAsset](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx#L14655) |
| AI 연동 > 장면 구도 | 개인 텍스트 또는 서버 선택 경로. 장면 텍스트로 제안 실행 | 제안 텍스트. 메모 삽입을 눌러야 문서에 커밋 | 미삽입/삽입 두 상태의 메모 ID·내용 재열기. [StudioAiCompositionPanel.tsx](../../apps/web/src/domains/creator/ai/StudioAiCompositionPanel.tsx) |
| AI 연동 > 대사·나레이션 추천 | 텍스트 경로. 상황 입력과 현재 원고 문맥 포함 여부 선택 후 실행. 이미지 최초 고지 적용 대상 아님 | 후보별 대본 추가 또는 선택한 말풍선/텍스트에 삽입 | 문맥 토글별 모의 본문, 대본·버블 적용 전후/재열기. [StudioCuttoonEditorHost.tsx · executeSuggestDialogueLines](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx#L18419) |
| AI 연동 > 팔레트 추천 | 텍스트 경로에 분위기 전송. 생성 실행 후 별도 라이브러리 저장 | 색상 후보와 저장 피드백. 칠하기는 별도 작업 | 잘못된 색상·중복 저장, 라이브러리와 원고 재열기. [StudioCuttoonEditorHost.tsx · saveSuggestedPaletteToLibrary](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx#L14566) |
| 대사 번역·식자·현지화 QA·대조 검수 | 텍스트 경로로 페이지별 대사·선택 문맥·용어집 등을 묶음 단위 전송. QA·대조·용어집 편집은 별도 로컬 동작 | 언어별 초안을 검토/수정/폐기/반영. 원본·번역문·검수 상태·용어집별 저장 | 묶음 2개에서 둘째 실패·중단, 요청 수와 부분 적용, 언어 전환 후 재열기. [StudioDialogueTranslatePanel.tsx](../../apps/web/src/domains/creator/StudioDialogueTranslatePanel.tsx), [StudioCuttoonEditorHost.tsx · executeGenerateTranslations](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx#L18416) |
| 대사 번역 > OCR 가져오기 | OCR에서 읽은 텍스트/붙여넣기 입력을 줄별로 정리하는 경로. 이 핸들러에 외부 OCR 추론 없음 | 승인된 행만 캔버스 대사로 변환 | 승인·반려·빈 행을 섞어서 저장 후 개수 대조. [StudioDialogueOcrImportSection.tsx](../../apps/web/src/domains/creator/lettering/StudioDialogueOcrImportSection.tsx), [studio-dialogue-ocr-import.ts](../../apps/web/src/domains/creator/lettering/studio-dialogue-ocr-import.ts) |
| 작가실 7단계 | 전제·시놉시스·회차 개요·비트·장면·컷 계획·대사/SFX별 현재 값, 이전 단계 맥락, 지시를 텍스트 경로로 전송 | 단계별 검토 후보 → 수락 시 해당 단계 교체. 캔버스 계획 반영은 별도 동작 | 단계마다 거절/수락 후 다른 단계·문서가 유지되는지와 도중 취소 검사. [studio-writer-room-ai.ts](../../apps/web/src/domains/creator/studio-writer-room-ai.ts), [StudioCuttoonEditorHost.tsx · requestWriterRoomAiDraft](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx#L14406) |
| AI 연동 > 회차 제작 | 모드·분량·앵커·변형 수로 기기에서 계획 계산 | 컷·연속성·제작 계획을 복사하거나 검토 보드에 인계 | 계획만 만들기·인계·에디터 복귀를 분리해 내구성 확인. [StudioAiEpisodeProductionModal.tsx](../../apps/web/src/domains/creator/ai/StudioAiEpisodeProductionModal.tsx), [studio-ai-comic-composer-handoff.ts](../../apps/web/src/domains/creator/ai/studio-ai-comic-composer-handoff.ts) |
| 시나리오/코믹 디렉터 | 스토리→컷 분해는 텍스트 경로, 선택 컷 이미지·다시 제작·마스크 부분 수리는 별도 이미지 경로. 참조 역할과 초기 고지를 확인. 픽셀 품질 측정·마스크 분리 자체는 로컬 | 컷/참조/선택 후보/승인·검토/분리 레이어. 기기 세션, 서버 세션 동기화, 승인 컷의 원고 삽입은 별도 저장 | 두 컷 중 한 컷만 승인, 후보 전환·부분 수리·서버 저장 실패 모사. 원고와 디렉터 각각 재열기. [StudioAiComicDirectorPanel.tsx](../../apps/web/src/domains/creator/ai/StudioAiComicDirectorPanel.tsx), [StudioAiComicDirectorRoute.tsx](../../apps/web/src/domains/creator/studio-router/routes/StudioAiComicDirectorRoute.tsx) |
| 이미지 검사기 > AI 자동 채색·후보 비교 | 개인 이미지 편집 API에 선택 이미지·프롬프트. 최초 안내. 단건 채색과 최대 3장 후보를 개별 실행. 참조/힌트/팔레트·영역 재시도 요청 준비는 별도 | 단건은 기존 이미지 src 교체. 후보는 반영 전까지 세션에 보관. 영역 재시도 요청 준비 표시만으로 새 이미지 없음 | A→B 선택 변경 및 원본 수정 중 응답. 단건/후보 적용·취소와 새로고침 비교. [StudioAiColorizeExtras.tsx](../../apps/web/src/domains/creator/ai/StudioAiColorizeExtras.tsx), [StudioCuttoonEditorHost.tsx · executeAiColorizeCandidate](../../apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx#L17925) |
| 이미지 검사기 > 기기 채색 | Tag2Pix/ONNX Runtime Web. 명시 실행 때 모델 로드 | 성공하면 선택 이미지 갱신. 레이어 PSD 내보내기는 별도 | 합성 선화로 입력 픽셀, 완성본·레이어 PSD 열기, 모델 실패/다운로드 취소 검사. [StudioOnnxColorizePanel.tsx](../../apps/web/src/domains/creator/ai/StudioOnnxColorizePanel.tsx) |
| 이미지 검사기 > 확대·선 추출 | Real-ESRGAN 확대, TEED 선 추출. 각각 기기 실행 버튼 | 각각 이미지 결과를 호스트에 전달 | 확대 크기·선화 알파와 재열기 픽셀 비교, 모델 미설치 시 외부 파일 요청 차단. [StudioOnnxUpscalePanel.tsx](../../apps/web/src/domains/creator/StudioOnnxUpscalePanel.tsx), [StudioOnnxLineExtractPanel.tsx](../../apps/web/src/domains/creator/StudioOnnxLineExtractPanel.tsx), [StudioInspectorImageToolsSection.tsx](../../apps/web/src/domains/creator/StudioInspectorImageToolsSection.tsx) |
| 이미지 검사기 > 애니풍 | AnimeGAN/ONNX 기기 실행, 별도 개인 이미지 API 변환 선택 가능 | 결과를 선택 이미지에 반영 | 로컬 실패 시 자동 클라우드 호출 수 0, 수동 선택 분리, 재열기. [StudioOnnxAnimeStylePanel.tsx](../../apps/web/src/domains/creator/ai/StudioOnnxAnimeStylePanel.tsx) |
| 이미지 검사기 > 인물/일반 배경 제거·레이어 추출 | 인물 MediaPipe, 일반 U-2-Netp/ONNX. 일반 경로 실패 시 인물 경로 시도. 픽셀 계산은 기기에서 하나 기본 인물 모델 URL은 외부 주소. Layer Lift는 별도 검토·합성 경로 | 빠른 처리는 이미지 src 교체, Layer Lift는 마스크·레이어 검토 및 적용 | 별도 내부 모델 응답만 허용해 인물·일반·대체 경로를 구분. 알파·원본·추출 레이어 다시 열기 확인. [StudioBgRemoveButton.tsx](../../apps/web/src/domains/creator/StudioBgRemoveButton.tsx), [studio-bg-remove.ts](../../apps/web/src/domains/creator/studio-bg-remove.ts), [studio-layer-lift-onnx-inference.ts](../../apps/web/src/domains/creator/layer/studio-layer-lift-onnx-inference.ts) |
| 검사기 > 자동 채색 힌트·힌트 채색 마스크 | CPU/worker의 영역 계산·색 전파. 힌트 지정과 굽기/적용 분리 | 계획 또는 원본과 구분된 색 레이어/마스크 | 힌트 삭제·취소·새 레이어·Undo 후 다시 열기. [StudioInspectorImageToolsSection.tsx](../../apps/web/src/domains/creator/StudioInspectorImageToolsSection.tsx), [StudioColorizeMaskPanel.tsx](../../apps/web/src/domains/creator/StudioColorizeMaskPanel.tsx) |
| 고급 공동 창작 > 획 제안 | 확정한 획으로 로컬 후보 요청, 선택해 적용 | 선택 후보만 Undo 한 단위로 추가 | 원본 2획, 후보 거절/수락, 되돌리기·재열기 대조. [StudioConnectedStrokeProposalPanel.tsx](../../apps/web/src/domains/creator/ai/StudioConnectedStrokeProposalPanel.tsx) |
| 고급 공동 창작 > 3D | 로그인·Hyper3D 키가 있어야 UI 클라이언트 생성. 기본 Rodin, 고급 메뉴에 VARCO 선택. 텍스트·단일 이미지·2–5뷰·기존 모델 재질 생성. UI 최초 마운트에서 목록 조회·진행 작업 폴링 | 작업 기록·결과 리비전 조회, 다운로드/호스트가 연결한 삽입 액션. 폴링과 새 생성 구분 | 무키·각 공급자 선택·취소·목록 복귀·재시작 실패 모사. 합성 GLB 삽입 후 재열기. [StudioAdvancedAiTools.tsx](../../apps/web/src/domains/creator/ai/StudioAdvancedAiTools.tsx), [StudioAi3dGenerationPanel.tsx](../../apps/web/src/domains/creator/ai/StudioAi3dGenerationPanel.tsx) |
| 캐릭터 > LoRA 학습·학습 모델로 생성 | fal.ai BYOK. 이미지 모음·트리거·권리 확인과 유료 학습 접수, 이미지 생성은 별도 실행. 키 없는 내장 모드는 로컬 레코드/의사 URL을 만들며 원격 가중치 훈련 증거가 아님 | 학습 기록, 생성 결과 미리보기, 후속 원고 삽입 | 키 미연결·권리 미확인·업로드만 성공·접수 미확정·재접속 폴링을 모사. 원격 학습 금지. [StudioAiLoraTrainingPanel.tsx](../../apps/web/src/domains/creator/ai/StudioAiLoraTrainingPanel.tsx) |
| 캐릭터 캐논 > 사진→캐릭터 | 선택 사진을 BYOK 이미지 편집으로 변환하거나 원본 참조를 사용. 생성·저장 별도 | 사진/생성본을 캐논 시트로 IDB 보관 | 합성 사진으로 원본 보관/변환 후보 구분, 재열기·삭제·출처 확인. [StudioPhotoCharacterWizard.tsx](../../apps/web/src/domains/creator/ai/canon/StudioPhotoCharacterWizard.tsx), [useStudioCharacterCanon.ts](../../apps/web/src/domains/creator/ai/canon/useStudioCharacterCanon.ts) |
| 생성 대기열 14종 | 선화 정리·밑색·영역 채움·캔버스 확장·조명·캐릭터 일관성·대사·콘티·스토리 개요·현지화·음성 연출·애니매틱·홍보 디자인·연재 소개문. 기본 실행기는 진행률과 이미지/텍스트를 기기에서 합성 | 확인 → 실행 → 미리보기 → 승인 → 적용. 작업/결과 저장과 원고 이미지·메모 삽입 구분 | 각 종류의 미승인·취소·문서 교체·재열기, 승인한 결과의 원고 ID 확인. [studio-ai-generation-queue-artifacts.ts](../../apps/web/src/domains/creator/ai/studio-ai-generation-queue-artifacts.ts), [studio-ai-generation-queue-store.ts · executeQueuedJob](../../apps/web/src/domains/creator/ai/studio-ai-generation-queue-store.ts#L135) |
| 슈퍼 스위트 > 기본 5탭 | 화풍 변환 툰필터·음영·프롬프트 증강·콘티·감정/말풍선 기본 계산은 로컬. 콘티 탭의 전문 디렉터 버튼은 다음 행 | 레시피·지시·대본 초안. 탭/설정 기기 저장, 복사 또는 프롬프트 인계. 탭 이름만으로 실제 이미지 생성 판단 불가 | 각 탭 기본 조작 시 원격 0, 인계 프롬프트로 이미지 도구에서 새 명시 실행 전 전송 0. [StudioAiSuperSuiteModal.tsx](../../apps/web/src/domains/creator/ai/StudioAiSuperSuiteModal.tsx), [studio-ai-super-suite-options.ts](../../apps/web/src/domains/creator/ai/studio-ai-super-suite-options.ts) |
| 콘티 자동 디렉터 > 마스터·제작·회차·경쟁 도구·플랫폼별 세부 워크벤치 | 아래 실행 색인의 세부 도구. 대본·회차·장르·도구별 맥락에서 관리형/Claude 구조화 응답 요청 또는 로컬 규칙 폴백. 회차 닥터의 요청은 `fallbackOnError:false`. 버튼 하나가 복수 요청을 묶는 경우도 있어 단일 생성으로 계수할 수 없음 | 구조화 텍스트, 연출/품질 지시, 일부는 버튼 결과가 즉시 대본에 추가됨. 텍스트 지시와 실제 이미지/오디오/3D 결과 구분. 세부별 영속성 미확인 | 아래 호출부마다 데이터·개별 승인·배치 크기·취소 시 부분 반영·폴백 출처·새로 열 때 자동 실행 수를 기록. [StudioWebtoonMasterPipelineCard.tsx](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx), [StudioWebtoonEpisodicDoctorPanel.tsx](../../apps/web/src/domains/creator/ai/StudioWebtoonEpisodicDoctorPanel.tsx) |
| /studio/ai-lab > Luna 크리에이티브 디렉터 | 이야기 확장·캐릭터 분석·장면 구도·연출 스타일·번역/현지화. 로그인 서버 무료 텍스트 경로/사용자 텍스트 연결. 상태 조회 후 선택·입력·제출 | 결과 검토·복사, 최근 작업은 컴포넌트의 상태. 6개 공정 소개 카드는 다른 화면으로 이동 | 각 제안별 요청, 상태 조회 실패·이중 제출·취소, 페이지 재진입 시 원고 무변경 확인. [PersonalInferencePage.tsx](../../apps/web/src/domains/creator/ai/PersonalInferencePage.tsx), [AiCreativeDirectorPanel.tsx](../../apps/web/src/domains/creator/ai/AiCreativeDirectorPanel.tsx) |
| /studio/ai-runtime → AI 허브의 내 런타임 | 사용자 지정 HTTPS 런타임. 주소·토큰과 엔진 설정 뒤 파일·설명과 모드를 선택해 명시 제출. 이미지→영상/3D, 모델→2D | 런타임 작업과 내려받은 파일. 해시 검증 및 재접속 작업 목록. 원고 삽입 별도 | 미연결, 모의 작업/중지·해시 불일치, 접근 거부와 재개. [CreatorInferencePage.tsx](../../apps/web/src/domains/creator/ai/CreatorInferencePage.tsx), [PersonalRuntimeWorkspace.tsx](../../apps/web/src/domains/creator/ai/PersonalRuntimeWorkspace.tsx), [personal-inference-client.ts](../../apps/web/src/domains/creator/ai/personal-inference-client.ts) |
| /studio/generate 생성 실험실 | ToonStudio 미디어 추론 API의 세 엔진. 합성 이미지/로컬 GLB 렌더와 프롬프트로 명시 접수. 엔진/권한 상태에 의존 | 이미지→짧은 WebM, 이미지→GLB, 3D 렌더→PNG. 작업 조회·다운로드·저장본 재사용 구분 | 3모드별 알 수 없는 상태/취소, 동일 입력 재제출 키, 재접속 후 작업 목록·다운로드 형식. [generative-modes.ts](../../apps/web/src/domains/creator/generative/generative-modes.ts), [useMediaInference.ts](../../apps/web/src/domains/creator/generative/useMediaInference.ts) |
| /studio/ai-settings | /settings/ai?source=studio로 이동. 다른 도구가 사용할 관리형·BYOK·런타임 설정 | 설정/상태 조회 화면. 연결 시험은 생성과 별도. 키 열람·변경 없이 검증 | 미연결 상태에서 입구→상태판→복귀, 모델·키·설정 미변경 확인. [StudioAiSettingsPage.tsx](../../apps/web/src/domains/creator/ai/StudioAiSettingsPage.tsx), [UnifiedAiSettings.tsx](../../apps/web/src/shared/ai/UnifiedAiSettings.tsx) |
| 프로젝트 AI 어시스턴트 | 운영 서버 OpenAI. 아이디어 리믹스·대본→컷·대사 윤문·내보내기 코치. 폼 제출과 연결 상태 확인 구분. 오프라인 규칙 응답 경로 있음 | 프로젝트별 탭 세션에 프롬프트·선택 역할·최근 결과를 기록. 후속 편집기 인계 별도 | 각 역할을 미연결·규칙·모의 성공/실패로 나누고 같은 탭과 새 탭의 복원 분리. [StudioProjectAssistantPanel.tsx](../../apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.tsx), [studio-openai-creative-assist-client.ts](../../apps/web/src/domains/creator/ai/studio-openai-creative-assist-client.ts) |
| 포저 > 구도 생성 브리프·웹캠/손 추적 | 포저는 스냅샷을 브리프로 조립하고 캡처 핸들러만 전달. 외부 생성 콜백은 주입하지 않음. 추적은 별도 기기 MediaPipe 모델/카메라 권한 필요 | 브리프 복사·캡처 원고 삽입과 포즈 미리보기/기록을 각각 구분 | 합성 영상만으로 권한 거부/중지와 포즈 기록·재열기. 합성 캡처 삽입 후 검증. [StudioMannequinPoserPanel.tsx](../../apps/web/src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx), [use-studio-vrm-webcam-session.ts](../../apps/web/src/domains/creator/vrm/use-studio-vrm-webcam-session.ts) |
| Tripo 등 3D 모델 제작 워크벤치 | 모델·모드·후처리 ·체형 선택, 명령 미리보기 및 기기 상태 변경. 서버에 Tripo 어댑터가 있다는 사실만으로 이 화면을 통해 생성되지 않음 | 계획/명령·마네킹 체형 적용. 3D 자산 작업 발급은 별도 검증 필요 | 합성 체형 변환→저장/재개, 실제 제출 버튼·네트워크 유무 구분. [StudioGen3dFeatureWorkbench.tsx](../../apps/web/src/domains/creator/scene-3d/StudioGen3dFeatureWorkbench.tsx) |
| 모션웹툰 > AI 연출·음성 전사 | 연출은 대사 키워드·기기 규칙. 전사 버튼은 개인 Groq 공식 호스트와 선택한 오디오·언어를 사용 | 연출은 모션 회차 설정, 전사는 에피소드에 발화 구간 적용. 변환 결과 저장은 모션 에디터의 경로 | 합성 오디오·모의 타임스탬프, 빈 구간·화자·컷 타이밍을 확인하고 재열기. [MotionWebtoonEditor.tsx](../../apps/web/src/domains/creator/motion-webtoon/MotionWebtoonEditor.tsx), [MotionWebtoonTranscriptionSection.tsx](../../apps/web/src/domains/creator/motion-webtoon/MotionWebtoonTranscriptionSection.tsx) |
| 가상공간 > AI QA·프로덕션 > 역할별 구조 도구 | QA의 광고/브랜드, 맞춤법·말투, 시선·소품, 픽셀, 다국어 말풍선, 상업 라이선스, 음성 피드백은 샘플/로컬 규칙. 역할별 작업과 손·연결컷·의상/날씨·표정·소품·옥에 티 6개도 로컬 계산 | 진단·샘플 수정·제안값. 숫자를 현재 원고의 실측이나 실제 자동 수정으로 해석하지 않음 | 샘플과 다른 합성 원고를 열고 입력 출처·전후 픽셀·프로젝트 보관 여부 대조. [StudioPresenceRoster.tsx](../../apps/web/src/domains/creator/virtual-space/StudioPresenceRoster.tsx), [StudioAiQaCompliancePanel.tsx](../../apps/web/src/domains/creator/ai-qa-compliance/StudioAiQaCompliancePanel.tsx), [StudioChoreRescueWorkbench.tsx](../../apps/web/src/domains/creator/role-ai-rescue-kit/StudioChoreRescueWorkbench.tsx) |
| AI 작업 이력·참조 팩·캐논·툰 자동화 편집 | 생성 출처 조회/삭제, 참조 역할 편집, 캐논 시트 관리, 장면·대사·30초 애니메이션 제작 계획/서류 편집. 서류에 표시된 공급자 이름은 호출 증거가 아님 | 작업 이력·참조 ID·캐논 IDB·제작 문서 저장. 기록과 실제 생성물 분리 | 다른 작품 간 격리와 재열기, 저장 실패를 모사. [StudioAiProvenancePanel.tsx](../../apps/web/src/domains/creator/ai/StudioAiProvenancePanel.tsx), [StudioAiImageReferencePackEditor.tsx](../../apps/web/src/domains/creator/ai/StudioAiImageReferencePackEditor.tsx), [StudioToonAutomationWorkspace.tsx](../../apps/web/src/domains/creator/ai/StudioToonAutomationWorkspace.tsx) |
| AI 드로잉 독의 획 보정·원근·말풍선·빛·채색 힌트·모델러 이미지 설계 | [AiAssistDock.tsx](../../apps/web/src/domains/creator/ai-assist/AiAssistDock.tsx) 아래 기기 계산. 해당 독 자체를 현 제품에서 마운트하는 호출은 이 SHA의 소스 검색에서 확인하지 못함. 모델러 셸도 생성 콜백을 주입하지 않음 | 패널 샘플·프롬프트 준비. 원고에서 보이거나 이미지가 생성된 것으로 집계할 수 없음 | 활성 라우트·플래그·호스트를 먼저 확보. [AiAssistDock.tsx](../../apps/web/src/domains/creator/ai-assist/AiAssistDock.tsx), [StudioWebtoonModelerImageGenPanel.tsx](../../apps/web/src/domains/creator/ai-assist/StudioWebtoonModelerImageGenPanel.tsx) |
| 새 작품 > 스마트 자동 채우기 | 필수 항목 입력 후 기기 규칙으로 추천. 추가 AI 보강을 누르면 필수값으로 구성한 문자열을 마스킹해 서버 무료 AI 경로에 전송 | 추천 필드와 출처를 표시. 적용 시 호스트가 시작점 프리셋과 폼 입력을 반영. 최종 작품 생성은 별도 | 합성 연락처·제목으로 기본 추천과 보강 비교, 잠근 필드·적용 취소·작품 생성 뒤 재열기 확인. [StudioSmartAutofillAssistantCard.tsx](../../apps/web/src/domains/creator/smart-form-autofill/StudioSmartAutofillAssistantCard.tsx), [StudioCreateQuickPresetStrip.tsx](../../apps/web/src/domains/creator/studio-shell/StudioCreateQuickPresetStrip.tsx) |
| 프로젝트 기획 > 스토리 씨앗 | 기기 규칙 기본 제안과 ‘AI 씨앗 확장 만들기’ 별도 버튼. 후자는 통합 무료 텍스트 경로를 지연 로드 | 장르·설정에 따른 제안, 선택 후 기획에 반영. 외부 미연결 기본 배지만으로 추가 버튼의 경로를 판단할 수 없음 | 동일 설정에서 각 버튼 요청 수 비교, 기존 계획 덮어쓰기 동의·재열기, 실패한 경로 수동 재시도. [StudioStorySeedBuilder.tsx](../../apps/web/src/domains/creator/planning/StudioStorySeedBuilder.tsx), [StudioProjectStoryPlanning.tsx](../../apps/web/src/domains/creator/planning/StudioProjectStoryPlanning.tsx) |
| 마이 스토리 > 나레이션 AI 제안 | 선택한 답변과 개인정보 의심 표시를 확인하고 명시 실행. 서비스 무료 우선 텍스트 AI | 컷별 후보를 사용자가 채택/삭제. 직접 입력 초안과 함께 검토 | 합성 답변·식별자만으로 전송 문구, 컷 한 개 선택/취소, 채택분 재열기. [MyStoryReviewStage.tsx](../../apps/web/src/domains/creator/my-story/MyStoryReviewStage.tsx), [MyStoryAiPanel.tsx](../../apps/web/src/domains/creator/my-story/MyStoryAiPanel.tsx) |
| 프로젝트 AI 결과 카드 > 무료 AI 워크벤치 14종 | 발상·컷 분할·대사·마감·캐릭터 바이블·개연성·3D 카메라·배색·효과음·FX 레시피·스크롤 호흡·썸네일/제목·번역 용어집·자연어 매크로. 제출 시 마스킹한 입력과 프로젝트 제목/장르 등 조건부 메타데이터를 같은 출처의 `/api/studio/ai/creative-assist`로 전송 | 설명과 복사, 상태 조회. 오류나 제한에는 기기 규칙 응답 경로가 있음. 매크로 텍스트는 실행 완료 증거가 아님 | 14가지 선택지를 각각 모의 정상·429·접속 실패로 시험해 출처 구분. 제출과 별도 자동 할당량 조회 수, 창 다시 열기 결과 비교. [StudioFreeAiAssistWorkbench.tsx](../../apps/web/src/domains/creator/studio-shell/StudioFreeAiAssistWorkbench.tsx), [free-ai-zero-bill-cascade.ts](../../apps/web/src/shared/ai/free-ai-zero-bill-cascade.ts) |
| 무료 AI 워크벤치 > 디자인·스토리 4종 | Canva식 레이아웃·Magic Write, Figma식 자동 배치/대비, 투닝 컷툰, 플로터 콘티. 기본 샘플/로컬 계산. Magic Write는 fetch 구현 주입 여부로 원격 또는 로컬을 택하며 현재 결과 카드→워크벤치 기본 마운트에는 주입 없음 | 카피·컷 구성·레이아웃 제안·내보내기 데이터 표시. 상표 서비스에 실제 요청한 결과 아님 | 모드 전환과 실행별 네트워크 수, 샘플/작품 구분, 내보낸 데이터·재진입 비교. [StudioOpenAiAssistResultCard.tsx](../../apps/web/src/domains/creator/studio-shell/StudioOpenAiAssistResultCard.tsx), [StudioDesignStoryAi4SuitesPanel.tsx](../../apps/web/src/domains/creator/ai-creative-suites/StudioDesignStoryAi4SuitesPanel.tsx) |
| 모션웹툰 > 애니툰 자동 생성 마법사 | 저장된 회차 선택→컷 확인→로컬 규칙 기반 연출. 음성 전사의 Groq 경로와 분리 | 파생 모션 회차 저장 및 편집기 이동 | 원본 회차와 파생 회차 각각 재열기·시간표 비교, 원격 생성 0 확인. [MotionWebtoonAnimeToonWizard.tsx](../../apps/web/src/domains/creator/motion-webtoon/MotionWebtoonAnimeToonWizard.tsx) |

텍스트 공급자 설정과 실제 응답 모델은 다를 수 있다. [studio-server-ai-client.ts](../../apps/web/src/domains/creator/studio-server-ai-client.ts)가 선언하는 무료 풀 후보는 Gemini, Qwen, Groq, SambaNova, Z.AI, Mistral, Cloudflare, OpenRouter, SiliconFlow, DeepSeek이며 Anthropic 프리미엄 설정은 별도다. 기본 어시스트 4개는 [assist-route.ts](../../apps/web/src/shared/ai/assist/assist-route.ts)의 Claude 사용자 경로 또는 관리형이며, 관리형 화면 표시만으로 실제 공급자를 확정할 수 없다. 이미지 BYOK에는 설정한 호환 엔드포인트와 이미지 모델을 사용한다. 이전 배지 목록 [studio-ai-connection-status.ts](../../apps/web/src/domains/creator/ai/studio-ai-connection-status.ts)은 탐색 단서다. 이 SHA에서 포저의 브리프가 실제로 마운트되어 있고 슈퍼 스위트 하위에 원격 호출 코드가 있으며, LoRA에 로컬 레코드 생성 분기가 추가되어 있다.

## 콘티 전문 도구 호출 색인

콘티 탭에서 마운트되는 전문 패널 12개를 대상으로 실제 UI가 참조하는 assist 모듈의 run 함수와 최초 호출 줄을 수집했다. 아래 170개는 **고유 코드 식별자 수**다. 하나의 디스패처에 여러 모드가 있고 여러 함수가 한 번의 클릭에 묶이기도 한다. 화면 기능 수나 공급자 호출 횟수의 측정값으로 사용하지 않는다. 아래 모든 항목의 UI·모의·실제 공급자 상태는 각각 미검증이다. 입력은 작품/장르/대본 요약과 선택한 전문 항목, 결과는 검토 문구 또는 대본 반영이다. 공급자 경로·기기 대체·저장 조건은 위 전문 도구 행을 따른다. 후속 시험은 각 항목에서 명시 실행 전후 요청 수와 결과 출처, 도중 취소, 원고 반영 및 재열기를 개별 기록한다.

**StudioWebtoonMasterPipelineCard**
코드에 이름이 붙은 선택지에 냉철한 지략가 (반말), 열혈 액션 주인공 (반말), 다정한 조력자 (해요체), 냉소적 라이벌 (반말), 로판·사극 귀족 (격식체), 숙명적 라이벌, 비밀 계약 동맹, 사제·전승 성장, 혐관·적대 로맨스, 표정 클로즈업, 반신 바스트, 전신 등신대, 역동 액션, 배경 세계관 등이 있다.

[StudioWebtoonMasterPipelineCard](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx)에서 확인한 호출 식별자는 19개다.

- [runAiWebtoonStoryboardAssist](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L245)
- [runAssistPanelBorderGutterTensionDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L254)
- [runAssistHandPropGripAnatomyDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L259)
- [runAssistJongmyoGayageumGeomungoDaegeumJangguDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L699)
- [runAssistHahoeMaskLianpuKabukiTogaThuribleDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L700)
- [runAssistPipeOrganPedalHarpAccordionBagpipeDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L701)
- [runAssistF1KerbWrcRollcageSkydivingSurfingYachtDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L702)
- [runAssistMarshallerLighthouseAntarcticObservatoryClockDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L703)
- [runAssistGlassblowingLuthierDiamondLoupeShoemakerDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L704)
- [runAssist3dgsNerfControlnet4FacsSfx3dSaccadeDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L705)
- [runAssistToonstudio1140HyperSynthesisLegalOstDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L706)
- [runAssistEnigmaMorseDarkroomLetterpressPhonographDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L726)
- [runAssistOceanLiner4FunnelStreetcarBiplaneSemaphoreDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L727)
- [runAssistDavyLampRickshawDivingDressSwitchboardSundialDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L728)
- [runAssistJangdokdaeKimjangHanjiOnggiNajeonchilgiDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L729)
- [runAssistWineBarriqueCheeseJamonChocolatePotStillDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L730)
- [runAssistBangpaeyeonSsireumSatbaTaekkyeonMaedeupDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L731)
- [runAssistCrossover1000EpParadoxWrinkleBakerSfxRedrawDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L732)
- [runAssistToonstudio1200GrandMillenniumSimulpubChromaDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonMasterPipelineCard.tsx#L733)

**StudioWebtoonProductionAssistPanel**
코드에 이름이 붙은 선택지에 모바일 스크롤 시선·데드존 닥터, 컬러 스크립트 · 4레이어 조명, 설정 연속성 · 복선 회수 감수, 다각도 연기 · SFX 오케스트레이터, 다중 인물·군중 제복/문장 락, 날씨·젖은 모발/의상·그림자 연속성 등이 있다.

[StudioWebtoonProductionAssistPanel](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx)에서 확인한 호출 식별자는 12개다.

- [runAssistScrollEyePathDoctor](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L242)
- [runAssistColorScriptDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L245)
- [runAssistContinuityForeshadowAuditor](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L248)
- [runAssistActingSfxChoreographer](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L251)
- [runAssistMultiCharacterWardrobeUniformDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L254)
- [runAssistWeatherTimeProgressionContinuityDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L257)
- [runAssistCollarTieLapelNecklineLockDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L670)
- [runAssistTattooStigmaUvTopologyLockDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L682)
- [runAssistCompanionFamiliarScaleLockDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L694)
- [runAssistInteriorRoomGeographyLockDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L706)
- [runAssistScrollPaceSilentBeatRhythmDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L718)
- [runAssistSubsurfaceScatteringTearSpecularLockDirector](../../apps/web/src/domains/creator/ai/StudioWebtoonProductionAssistPanel.tsx#L730)

**StudioWebtoonEpisodicDoctorPanel**
코드에 이름이 붙은 선택지에 캐릭터 말투 캐붕(OOC) 레이더, 3D 배경 · 소품 · DoF 카메라, 웹툰 BGM · 오디오툰 큐시트, 컷간 작붕(흉터·검집·부상) 린터, 장편 연재(1~100화) 캐논 볼트, 신발 굽 · 계단 접지 보폭 잠금, 군중 엑스트라 · 대기원근 안개 잠금 등이 있다.

[StudioWebtoonEpisodicDoctorPanel](../../apps/web/src/domains/creator/ai/StudioWebtoonEpisodicDoctorPanel.tsx)에서 확인한 호출 식별자는 1개다.

- [runAssistWebtoonEpisodicDoctor](../../apps/web/src/domains/creator/ai/StudioWebtoonEpisodicDoctorPanel.tsx#L181)

**StudioCompetitorFullSuitePanel**
코드에 이름이 붙은 선택지에 스케치→선화 4레이어 분리, 30+ 화풍 & 3D 리라이팅, 33종 표정 · 사쿠가 모션웹툰, 3D 핸드·헤드 & LT 리그, 액션 비트 & LoRA 브리지, 360° 5뷰 정투영 턴어라운드, 3D 배경 투시 · 발 접지 스케일, 말풍선·SFX 안면 비가림 & 꼬리 락, 검격·마법 궤적 & 잔상(Smear) 락, 로판 소프트 수채화·글로우, 웹툰 팝 고채도 셀채색, 느와르 고대비 잉크·림라이트, 정통 흑백 만화 스크린톤, SF 사이버펑크 네온 림, 정통 무협 수묵 담채 등이 있다.

[StudioCompetitorFullSuitePanel](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx)에서 확인한 호출 식별자는 9개다.

- [runAssistSketchToLineartLayerSplitter](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L244)
- [runAssistStyleTransferAndRelightingDirector](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L247)
- [runAssistSakugaMotionAndFacialMatrixDirector](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L252)
- [runAssist3dHandHeadPoseAndLtRigDirector](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L254)
- [runAssistScreenplayBeatAndLoraLockBridge](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L256)
- [runAssistTurnaroundOrthographicSheetDirector](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L258)
- [runAssistBackgroundPerspectivePropScaleDirector](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L260)
- [runAssistSpeechBubbleTailOcclusionDirector](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L262)
- [runAssistActionWeaponMotionArcDirector](../../apps/web/src/domains/creator/ai/StudioCompetitorFullSuitePanel.tsx#L264)

**StudioPhase6EcosystemSuitePanel**
코드에 이름이 붙은 선택지에 다중 캐릭터 좌표 · Vibe Transfer, ArcFace 동일성 · 말풍선 꼬리 벡터, 브러시 컬러 힌트 · Close-Gap 채색, 3D 배경 툰셰이더 · 창문 발광, 웹소설 각색 · 2차 IP OSMU, 인비트윈 동화 · Comistitch 분할, 비대칭 복식·흉터·무기 비례·부상 원장, 180° 시선 축 · 다중 인물 키 차이 락, 컷간 피부·의상 고유색(Albedo) 고정기, FACS 미세 표정 · 시선 궤적 연속성 등이 있다.

[StudioPhase6EcosystemSuitePanel](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx)에서 확인한 호출 식별자는 10개다.

- [runAssistNovelAiMultiCharVibeDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L254)
- [runAssistMangaFlowIdentityVerificationDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L256)
- [runAssistGlimnaviColorHintStrokeDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L258)
- [runAssistSnaptoon3dEnvironmentShaderDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L260)
- [runAssistNovelAdaptationAndIpExpansionDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L262)
- [runAssistToonCrafterInbetweenAndStitchDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L264)
- [runAssistAsymmetricCostumePropWoundLedgerDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L266)
- [runAssistCameraAxisEyelineHeightLockDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L268)
- [runAssistCrossCutColorScriptAlbedoLockDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L270)
- [runAssistMicroExpressionActingContinuityDirector](../../apps/web/src/domains/creator/ai/StudioPhase6EcosystemSuitePanel.tsx#L272)

**StudioRea15PlatformsWorkbenchPanel**

[StudioRea15PlatformsWorkbenchPanel](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx)에서 확인한 호출 식별자는 48개다.

- [runGlimnaviRelightAndLineartV23Assist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L170)
- [runKaistorySingleEnvelopeAndKaionAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L174)
- [runSnaptoonFrameoShaper3dDirectorAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L178)
- [runManhwaKomikoAnifusionFlowAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L182)
- [runCreativeDopamineAndUxSynthesizerAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L186)
- [runTootoonGentoonTooningKrSuiteAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L190)
- [runKreaSplineLumiereRealtimeShaderAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L194)
- [runLtxBoordsCascadeurRiveAnimaticAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L198)
- [runCotransVroidSkyboxWorldLocalizerAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L202)
- [runStoryboarderDreamsKritaArtbreederDirectorAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L206)
- [runNijiPixaiCivitaiLoraSrefDirectorAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L210)
- [runTripoMeshyHeroforgeSunoElevenlabsOsmuAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L214)
- [runRunwayLumaPikaViggleLive2dSpineMotionAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L218)
- [runSketchupBlenderPetalicaMagmaRecraftStudioAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L222)
- [runTapasTappytoonRidiPostypeSudowriteNovelcrafterAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L226)
- [runMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleAssist](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L230)
- [runAssistJoseonGatBinyeoKatanaSayaDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L713)
- [runAssistMensSuitBottomButtonTieHeelStrapDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L714)
- [runAssistHwachaGeobukseonTrebuchetJoustDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L715)
- [runAssistHanokOndolBongsuWatermillMatchlockDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L716)
- [runAssistZombieBarricadeGasMaskLockpickLaserDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L717)
- [runAssistCyberTerminalServerRackCctvRooftopDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L718)
- [runAssistAnimalPupilSpider8LegOctopusSharkDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L719)
- [runAssistSignLanguageHearingAidLegalDepositDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L720)
- [runAssistMurimPlumBlossomTangClanBaguaDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L730)
- [runAssistXianxiaFlyingSwordInnBambooScrollDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L731)
- [runAssistCasinoBaccaratHoldemChipsAuctionDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L732)
- [runAssistGrandPianoLidViolinCigarWhiskyDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L733)
- [runAssistSupercarDoorF1HaloYachtPrivateJetDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L734)
- [runAssistDeepSeaSubmersibleSpacesuitCryoPodDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L735)
- [runAssistVolcanoLavaGlacierCrevasseDesertDuneDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L736)
- [runAssistAircraftCarrierCatapultBunkerBsl4Director](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L737)
- [runAssistAncientMythologyTriremeKhopeshRuneDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L746)
- [runAssistKoreanMilitaryBeretK2RifleDogtagDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L747)
- [runAssistSteampunkAirshipAutomatonDivingPlagueDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L748)
- [runAssistFloatingIslandWorldTreeDragonMimicGolemDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L749)
- [runAssistKoreanMarketBunsikBbqJjimjilbangDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L750)
- [runAssistKoreanWeddingPaebaekJesaHwatuTransitDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L751)
- [runAssistAutonomous7StagePipelineDnaHashPsdDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L752)
- [runAssistToonstudio1020PlatformSupremeMetaDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L753)
- [runAssistAgeOfSailGalleonWheelCannonCutlassDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L762)
- [runAssistWesternRevolverWinchesterSaloonLocomotiveDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L763)
- [runAssistNoirTrenchcoatFedoraVenetianBlindSpyDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L764)
- [runAssistSurgicalLightEcmoTriageBloodBagBdnaDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L765)
- [runAssistSuspensionBridgeArchKeystoneHanokDoorTbmDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L766)
- [runAssistStreamerMicRingLightCintiqBlenderNodeDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L767)
- [runAssistGitDiffKanbanDiscordSuperchatShortsSafezoneDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L768)
- [runAssistToonstudio1080OmniverseDcfStrokeSupremeDirector](../../apps/web/src/domains/creator/ai/StudioRea15PlatformsWorkbenchPanel.tsx#L769)

**StudioRea39ExtendedTabPanels**
명시된 assist 모듈의 run 함수 참조 없음. 해당 패널 안의 편집·샘플·프롬프트 조립·콜백 구현을 별도로 보아야 한다.

**StudioAiWebtoonEcosystemWorkbenchPanel**
코드에 이름이 붙은 선택지에 내 썰 (1,600자), 내 원고, 세로 스크롤 웹툰, 인스타툰, 4컷 만화, 캐릭터 형질 합성 (최대 3인), 완성할 캐릭터 설명 등이 있다.

[StudioAiWebtoonEcosystemWorkbenchPanel](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx)에서 확인한 호출 식별자는 17개다.

- [runAssistEsportsHudGamerPeripheralsDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L131)
- [runAssistCourtroomTrialPrisonHandcuffDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L132)
- [runAssistKpopStageChoreoLightstickIemDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L133)
- [runAssistAviationCockpitZeroGSubmarineDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L134)
- [runAssistArcheryFencingCombatStanceCueDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L135)
- [runAssistOrchestraPianoGuitarTeaCalligraphyDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L136)
- [runAssistBotanicalFloraBlacksmithAlchemyDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L137)
- [runAssistHeavyMachinerySignboardTaxErpDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L138)
- [runAssistGazeSaccadePupilHighlightLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L154)
- [runAssistBreathFrostSmokePlumeLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L157)
- [runAssistWetFabricRainTranslucencyLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L160)
- [runAssistCastShadowSundialAzimuthLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L163)
- [runAssistImpactDebrisCraterPersistenceLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L166)
- [runAssistBinauralSpatialAudioFoleyLufsDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L169)
- [runAidStudioPipeline](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L240)
- [runNaverWebtoonAiHintPainter](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L249)
- [runClipStudioPaintAiAssist](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemWorkbenchPanel.tsx#L254)

**StudioAiWebtoonEcosystemCategory34Panels**
코드에 이름이 붙은 선택지에 세로 배경 확장, 불필요 사물 지우기, 캐릭터 의상 부분 수정, 단추·여밈·버클 고정, 집중선·임팩트 초점, 부상·붕대 타임라인, 가문 문장·엠블럼, 악기 운지·보잉 고증, 말풍선 마름모 식자, 단행본 도련·CMYK, 아이트래킹·스크롤 AOI, 4:5 (1080×1350), 1:1 (1080×1080), 한복·기모노 우임, 총기 탄피·울외손가락, 무협 경맥·검결, ICU 바이탈·무균, 셰프 칼그립·플레이팅, 아크릴·포카 칼선, 궁궐 공포·단청, 독자 사이다·별점예측, 초승달 별침범 차단, SD 이모티콘 24종, 드래곤·사족 관절, 한국 지하철·옥탑방, 아랍어RTL·태국성조, TV애니 3단색지정표, OTT 8부작 바이블, 글로벌 MG·RS 정산, 좌우핸들·안전벨트·체인링, 망점모아레·G펜선위계, 아나모픽·어안·더치틸트, 7대주름·벨벳실크BRDF, 질주교차보행·스포츠그립, 버튜버ARKit·캔배지도련, SSR스플래시·3초궁극기, ADR대본·촉각점자·손목보호, 코르셋버스·훈장띠·찻잔, 시계IIII·체스백색칸·바둑, 성탑시계방향·마차·왈츠, 5인레이드·아공간·포션수평, 의체·강화복·4안야투경, 무당방울부채·구마·부적, 루미놀청백광·취조거울, 밀실평면도·암호·UV감정 등이 있다.

[StudioAiWebtoonEcosystemCategory34Panels](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx)에서 확인한 호출 식별자는 40개다.

- [runAssistFastenerOverlapBeltBuckleLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L79)
- [runAssistSpeedlineImpactFrameFocusLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L83)
- [runAssistWoundBandageHealingTimelineLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L87)
- [runAssistHeraldryCrestEmblemGeometryLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L91)
- [runAssistMusicalInstrumentFingeringLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L95)
- [runAssistVariableFontBalloonDiamondCopyfitDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L99)
- [runAssistTankobonPrintBleedCmykProofDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L103)
- [runAssistEyetrackScrollVelocityAoiDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L107)
- [runAssistTraditionalClothingCollarGoreumLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L343)
- [runAssistFirearmTacticalSlideEjectionLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L347)
- [runAssistMartialArtsQigongMeridianTrajectoryDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L351)
- [runAssistMedicalIcuVitalMonitorSterileDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L355)
- [runAssistCulinaryKnifeGripPlatingSteamDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L359)
- [runAssistAcrylicStandPhotocardDielineDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L363)
- [runAssistEastAsianPalaceDancheongBracketDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L367)
- [runAssistReaderCommentSentimentCatharsisDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L371)
- [runAssistLunarPhaseStarSkyLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L385)
- [runAssistEmoticon24PackChibiSpecDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L389)
- [runAssistQuadrupedCreatureWingAnatomyDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L393)
- [runAssistKoreanUrbanEverydayGeographyDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L397)
- [runAssistThaiVietnameseArabicRtlShapingDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L401)
- [runAssistAnimeSettei3ToneModelSheetDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L405)
- [runAssistOttLiveActionShowrunnerBibleDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L409)
- [runAssistGlobalIpMgRsRoyaltyWaterfallDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L413)
- [runAssistVehicleCockpitSeatbeltDrivetrainDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L427)
- [runAssistScreentoneMoireGpenHierarchyDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L431)
- [runAssistAnamorphicFisheyeLensOpticsDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L435)
- [runAssistDrapery7FoldsMaterialBrdfDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L439)
- [runAssistSportsBiomechanicsGaitGripDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L443)
- [runAssistVtuberArkit52VnSpriteMerchDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L447)
- [runAssistGachaSsrSplashRpgSkillCutsceneDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L451)
- [runAssistAudiotoonAdrTactileErgonomicsDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L455)
- [runAssistRofanCorsetSashSignetEtiquetteDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L469)
- [runAssistPocketWatchIiiiChessBadukBoardDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L473)
- [runAssistCastleClockwiseStairCarriageWaltzDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L477)
- [runAssistHunterGateRaidPartyInventoryDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L481)
- [runAssistCyberpunkProstheticMechaTacticalDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L485)
- [runAssistShamanGutExorcismTalismanDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L489)
- [runAssistForensicLuminolAutopsySceneDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L493)
- [runAssistLockedRoomAlibiCipherArchaeologyDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonEcosystemCategory34Panels.tsx#L497)

**StudioAiWebtoonPlatformSuitePanel**
코드에 이름이 붙은 선택지에 인스타툰·릴스·굿즈, 클릭&드래그 템플릿 에셋, 1.618 세로 웹툰 레이아웃, 문장 → 표정·포즈·배경, 6분할 스티커 시트, 양면 머그컵 (2슬롯), 단품 전면 (0.85배) 등이 있다.

[StudioAiWebtoonPlatformSuitePanel](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx)에서 확인한 호출 식별자는 14개다.

- [runAssistDentalOphthalmologyXrayMarkerDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L122)
- [runAssistRotaryPhoneTurntableCameraInstantDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L123)
- [runAssistChemistryMicroscopeCentrifugeAstronomyDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L124)
- [runAssistEquestrianFalconryHorologyGemstoneDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L125)
- [runAssistFilmSetClapperboardBroadcastSwitchDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L126)
- [runAssistSchoolCsatOmrTcgDiceMahjongDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L127)
- [runAssistAmusementCoasterFerrisCampingSkiDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L128)
- [runAssistHourglassCandleScaleBookGutterPaywallDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L129)
- [runAssistPropScreenUiHologramLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L145)
- [runAssistBraidPonytailAccessoryKnotLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L148)
- [runAssistCapeCloakHemLiningFlutterLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L151)
- [runAssistSwordHiltGuardScabbardLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L154)
- [runAssistCharacterAgeFlashbackProportionLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L157)
- [runAssistMultiPlaneParallaxBokehLockDirector](../../apps/web/src/domains/creator/ai/StudioAiWebtoonPlatformSuitePanel.tsx#L160)

**StudioSerialStudioSuitePanel**
코드에 이름이 붙은 선택지에 1. 스타일 · 캐릭터 시트, 2. 장면 생성 · 인페인팅 · 여백, 3. 웹소설 AI · DOCX · 원고검증, 4. 연재 · 지갑 · 기다무 · 정산 등이 있다.
명시된 assist 모듈의 run 함수 참조 없음. 해당 패널 안의 편집·샘플·프롬프트 조립·콜백 구현을 별도로 보아야 한다.

**StudioCreatorPlusSuitePanel**
코드에 이름이 붙은 선택지에 TG 스토리·컷분할, ED/MG 다각도·매직·리터치, DV 디브 캐릭터·로어북, TB 툰비 원고검증·뷰어, 웹툰 스토리 에이전트, 웹소설 에이전트, 영화 시나리오 에이전트 등이 있다.
명시된 assist 모듈의 run 함수 참조 없음. 해당 패널 안의 편집·샘플·프롬프트 조립·콜백 구현을 별도로 보아야 한다.
