# 4대 카테고리 12대 AI 웹툰·인스타툰 보조 어플 REA 역공학 분석 및 내재화 보고서 (2026-10-26)

- 상태: **역사 자료 · 벤치마크 증거 (현재 구현 내재화 완료)**
- 작성일: **2026-10-26**
- 대상 도메인: `apps/web/src/domains/creator/ai/`

---

## 1. 개요 및 분석 범위

본 문서는 사용자가 지정한 **4대 카테고리 12대 AI 웹툰·인스타툰 제작 보조 어플**을 REA(`reverse-engineer-anything`) MCP 도구 체인(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`)으로 역공학 분석하고, 그 핵심 아키텍처·상태 모델·창작 가드레일을 ToonStudio 내부 엔진 및 UI 워크벤치로 내재화·고도화한 결과를 기록한다.

### 분석 대상 4대 카테고리 및 12대 도구

1. **카테고리 1 — 올인원 웹툰 및 인스타툰 제작 가속화 툴**
   - **젠툰 (GenToon)** (`https://www.gentoon.ai/`)
   - **투닝 (Tooning)** (`https://www.tooning.io/`)
   - **ComicAI** (글로벌 만화 AI · App Store `id6758517964`)
   - **Dashtoon** (`https://dashtoon.com/`)
2. **카테고리 2 — 전문 작화 보조 툴 (선화, 채색, 정밀 편집)**
   - **에이드 (AiD 3.1)** (`https://aid-raw.com/`)
   - **네이버웹툰 AI 페인터 (Webtoon AI Painter)**
   - **클립스튜디오 페인트 (Clip Studio Paint)** (`https://www.clipstudio.net/kr/`)
3. **카테고리 3 — 스토리보드 및 콘티/콘셉트 기획 툴**
   - **LlamaGen AI** (`https://llamagen.ai/ko/features/ai-webtoon-generator`)
   - **미드저니 (Midjourney v6.1) / 스테이블 디퓨전 (Stable Diffusion)** (`https://www.midjourney.com/`)
   - **포토샵 AI (Adobe Firefly)** (`https://www.adobe.com/products/firefly.html`)
4. **카테고리 4 — 사진 및 영상을 만화로 변환하는 스타일 툴**
   - **원더쉐어 필모라 (Wondershare Filmora)** (`https://filmora.wondershare.kr/ai-tool/apps-sites-for-ai-comic-creation.html`)
   - **캔바 (Canva) AI** (`https://www.canva.com/`)

---

## 2. REA 수집 증거 원장 (Evidence Bundle IDs)

| 대상 서비스 | 브라우저 시나리오 캡처 (`capture_browser_scenario`) | 스크립트 번들 추출 (`export_web_scripts`) | 정적 AST 분석 (`analyze_javascript_application` / `inspect_analysis_view`) |
| --- | --- | --- | --- |
| **젠툰 (GenToon)** | `ev_787a5b1b09c952c4baf0b3381c7f5791528f71610f9a08e70b02c36e6322e6c3` | `ev_ef5b2c451467927c89e226d1d35f6ba26a5568e5d89a5d6db181406ffd536c2d` (133개) | `ev_1ddfc13959340d012b45da839728d912787bb69decfd1355cabdfaaa72942496` / `ev_5e3fd75434584a1156f61033e7bc9258bbedbda0095c749ab7d946907da84558` |
| **투닝 (Tooning)** | `ev_7752c9807211cc7a218897d9638aa534e1f931f94a66688449ab94b792c1a892` | `ev_936c62df9fa863e1ae452dabc8eaf86a694772a0a26aedb0db07ea0548d1ea15` (59개) | `ev_4ebb1bd66e41fc0e7927a78a53dbbc8a94abaedf831c4fafa22ced7d9532b5bb` / `ev_d7d85c94e96273e6e2dc7969b366e60cc57c67f30d86038fbe5d2e31cb9192c7` |
| **Dashtoon** | `ev_9e940298c3d2cbffdc5551877e490896ccbfdbd6befece0f8b1963defabaea8d` | `ev_c7ce51f69f579d0b581ba074fc32304044e27ac568c288c690766a025df633e9` (32개) | `ev_929ece662321a43110a4e246b12138d9b672ffcc0902bd13c1cc3c0b6de4e057` / `ev_1836112ce113960d6cadb483f51643c79811609087a19b5582e4a22aba54eee6` |
| **에이드 (AiD 3.1)** | `ev_bb2b36db74d580818ea0192b733efa8ae5fad5625def8b544f426f87388d006f`, `ev_c6e8edc25cbec191d56a70f3be734d8a44c31552556010ce40aadc28d790be53` | `ev_f0488ee0a72060f75a1f286bcaf3607a45cce15bd155aaf0f989f7c99cb345ec` + `index-CZwBVDky.js` (1.3MB) | 46개 라우트(`/studio`, `/projects/:projectId/character-create` 등) 및 619개 스튜디오 도메인 문자열 정밀 추출 |
| **클립스튜디오 페인트** | `ev_21748b01f6c91b05f0140292d0fd7fb137dfecceb21eee256c69a34a298594fe` | `ev_85929fa925cda75d1a9fcd1345a2c875af2b947e018f1d5fbae2526c467e1247` (26개) | `ev_7247920e2f20083e32819af3ee2f2e292815fd8da2b9b0286b924a5170778b6f` / `ev_ab1d6ea5111f0c23f81abc4607a9b34d371389a6836cd1a22209ed2c32c1bf56` |
| **LlamaGen AI** | `ev_9a21e2ed30f2847d1b070521c7fa481d956736883fba9f65d73555e3285adb34` | `ev_e1d751f693ea367014f094e056bbd671f7491b833cf611d71db8f660f5bedf70` (79개) | `ev_0c10881a4bd33e00fb649776fdd83dbd3f305e332ce35ea5783725e6935385d7` / `ev_f8d80ccd9fbf543e402d5aed8039c45c06012ec3d5fb32af3cc670ff9371dd27` |
| **미드저니 (Midjourney)** | `ev_7adbd61ccb4b07832689fb7196ecdcda0d8eb5bcf752273f99505221759628ed` | `ev_eed41de2d68ecac530e4524cec62db7bd70661ea9e595228bfae042d4dfb97b9` (9개) | `ev_0e55ac338ae07abc3a4223ecae52f5a3cfea4e05bf2b6f92e81da40ed308d7d0` / `ev_eb332ab92ae9c3462736ac43cba0474f3d8d94cd2a492a2318abd108bee4b80` |
| **포토샵 AI (Firefly)** | `ev_aba08520445fb1a10df9f6880cbb2d6c6cb8062893ed5d9b46df95bdbad4e03c` | 런타임 시나리오 캡처 내 포함 | 생성형 채우기(Generative Fill) 및 생성형 확장(Generative Expand) 워크플로 분석 |
| **원더쉐어 필모라** | `ev_78acfd600978c16e2184f42fe4881dc1b4ea93510ff7742b5503c7ef6074e8b8` | `ev_0dc1f0393987171f5845429604a83836c334079ae5b268530dcb4b7a8879f9cb` (54개) | `ev_723f4efaac3ee7468c45c0f03bd9296bdea94d6755854e4ae9b9b0be170768e4` / `ev_f7814004a4054a40eb7ee56459701150f220d37b481a77891305e6e95f1e6624` |
| **캔바 (Canva) AI** | `ev_3e8e66e0c09ff9ba5eff90933dde4c1dd5c3882e1224b520fc746fba67d91d0c` | `ev_6cded43926c6b2f5ff6cbdf87b832da7f291f74b12a93dad895c859050610a75` (9개) | `ev_6064d8c9fc83f943af415b0da817cd38af3fabd9cc876161f1364bcbd10e0cdb` / `ev_6dc5f1232d6f4fb5eb97f36da24960d4eb108e87021fd215ed03c3764a5ea55e` |

---

## 3. 도구별 역공학 관찰(Observation) · 추론(Inference) · 한계(Limitation) 및 내재화 매핑

### 3.1 카테고리 1 — 올인원 웹툰 및 인스타툰 제작 가속화 툴

1. **젠툰 (GenToon, `gentoon.ai`)**
   - **관찰(Observation)**: Next.js 번들(`source-35`, `source-100`)에서 `내 원고`와 `내 썰`(1,600자 상한) 듀얼 입력 모드, 4종 종횡비(`1:1`, `4:5`, `2:3`, `9:16`), 3대 포맷(`4컷 만화`, `세로 스크롤 웹툰`, `인스타툰`), 6대 대표 화풍(1,500+ 스타일 카탈로그), 21개 다국어 지원, 그리고 `character-continuity-sheet.txt` 및 `scene-to-panels-worksheet.txt` 템플릿이 확인되었다. 특히 왼손·오른손 소품 상태(`left-hand`, `right-hand`, `before -> after`)와 `viewer-left`/`viewer-right` 시점 축, 연속성 결정 상태(`open / accepted / superseded`)를 명시적으로 관리한다.
   - **내재화(Internalization)**: [`all-in-one-webtoon-accelerator-suite.ts`](../../apps/web/src/domains/creator/ai/all-in-one-webtoon-accelerator-suite.ts)의 `runGenToonStoryToComicPipeline`에 100% 반영했다.
2. **투닝 (Tooning, `tooning.io`)**
   - **관찰(Observation)**: 정적 AST(`ev_d7d85c94e96273e6e2dc7969b366e60cc57c67f30d86038fbe5d2e31cb9192c7`)에서 `aiLimit`, `skinLimit`, `bitmapFilterLimit`, `layerSeparationLimit`, `faceHidingLimit`, `maskedCut`, `guideMaskedCut`, `chatBubbleSvg` 식별자와 대사 기반 자동 동작 연출 구조가 확인되었다.
   - **내재화(Internalization)**: `runTooningTextToCharacterActing`에서 대사별 화행(`exclamation`, `question`, `command`, `confession`, `monologue`, `statement`)과 감정을 분석해 포즈 코드, 표정, 말풍선 SVG 경로(`chatBubbleSvg`), 마스크 컷(`guideMaskedCut`/`maskedCut`)을 자동 생성한다.
3. **ComicAI**
   - **관찰 및 추론(Observation & Inference)**: 텍스트 프롬프트로 4면도 캐릭터 시트(Turnaround)를 먼저 고정한 뒤 연속 만화 컷을 생성하여 캐릭터 드리프트를 억제한다.
   - **내재화(Internalization)**: `buildComicAiCharacterSheetAndPanels`로 4면도 시트 + 시드/LoRA 가중치 고정 + 프리폼 연속 패널 조립기를 구현했다.
4. **Dashtoon (`dashtoon.com`)**
   - **관찰(Observation)**: 정적 AST(`ev_1836112ce113960d6cadb483f51643c79811609087a19b5582e4a22aba54eee6`)에서 `/api/v2/ai-apps/photo-to-comic`, `/api/v2/ai-apps/photo-to-comic/poll`, `/api/v2/ai-apps/user-images`, `/api/v2/ai-apps/share-link`, `/comics/read/`, `episodeOpen`/`episodeLoad`/`episodeFinish` 이벤트와 `Dashtoon Studio Sunset -> Frameo (frameo.ai/create)` 마이그레이션 안내 컴포넌트가 확인되었다.
   - **내재화(Internalization)**: `runDashtoonAgencyPublishPipeline`에서 Photo-to-Comic 폴링 명세, 800×1280 연재 슬라이싱 매니페스트, Frameo/ToonStudio 마이그레이션 브리지를 통합 제공한다.

### 3.2 카테고리 2 — 전문 작화 보조 툴 (선화, 채색, 정밀 편집)

1. **에이드 (AiD 3.1, `aid-raw.com`)**
   - **관찰(Observation)**: `index-CZwBVDky.js` 분석 결과 `01 스케치`(`liveSketch`) → `02 선화`(`characterListModalInPentouch`) → `03 채색`(`characterListModalInColor`) → `04 배경`(`backgrounds`) 4단계 파이프라인, `2,048×2,048` 캔버스(`잉크 펜 12px`, `선 보정 35%`, `필압 곡선 1`, `#232128`), `하나의 캐릭터 · 5가지 구도 · 선화와 채색`(정면·측면·후면 + 감정·포즈 2종 = 선화 5장 + 채색 5장 총 10장 시트), `캐릭터 형질 합성`(최대 3인 조합), 업로드 체크리스트(흰 배경 검정 선화, 선화 제거 투명 PNG 채색본), 그리고 CLIP STUDIO PAINT 호환 멀티레이어 `PSD`/`PSB`(`psdClip`) 내보내기가 확인되었다.
   - **내재화(Internalization)**: [`pro-drawing-coloring-assist-suite.ts`](../../apps/web/src/domains/creator/ai/pro-drawing-coloring-assist-suite.ts)의 `runAidStudioPipeline`에 전 공정을 구현했다.
2. **네이버웹툰 AI 페인터 (Webtoon AI Painter)**
   - **관찰 및 추론(Observation & Inference)**: 스케치 위 색상 힌트 포인트 3~6곳만 찍으면 선화 경계를 침범하지 않고 그라데이션 밑색·명암을 확산한다.
   - **내재화(Internalization)**: `runNaverWebtoonAiHintPainter`에서 힌트 포인트별 밑색·그림자·하이라이트 색상 확산과 실시간 SVG Data URL 프리뷰를 생성한다.
3. **클립스튜디오 페인트 (Clip Studio Paint, `clipstudio.net/kr`)**
   - **관찰(Observation)**: AI 채색 힌트, 3D 데생 인형 포즈 스캐너(28관절 + 핸드 스캐너), 3D 배경의 선화·스크린톤(LT) 분리 변환을 제공한다.
   - **내재화(Internalization)**: `runClipStudioPaintAiAssist`에 28관절 포즈 스캐너 리그 및 45/60/85LPI LT 변환 레이어 분리 사양을 구현했다.

### 3.3 카테고리 3 & 4 — 스토리보드/콘셉트 기획 및 사진·영상 만화 변환 툴

1. **LlamaGen AI (`llamagen.ai`)**
   - **관찰(Observation)**: `20920-e6499f58cb2e797b.js` 스토어에서 `pageShape: "portrait"`, `Layout0`~`Layout4`, `comicRoles`, `comicLocations`, `upscaleQueue`, `comicDataGzip`, 500ms 디바운스 리비전 동기화, `PDF/CBZ/ZIP/EPUB/JSON` 코믹 에디터 및 `ZIP turnarounds/CSV rosters` 캐릭터 에디터 호환이 확인되었다.
   - **내재화(Internalization)**: [`storyboard-style-transfer-suite.ts`](../../apps/web/src/domains/creator/ai/storyboard-style-transfer-suite.ts)의 `runLlamaGenWebtoonStoryboardDraft`로 내재화했다.
2. **미드저니 (Midjourney v6.1) / 스테이블 디퓨전 & 포토샵 AI (Adobe Firefly)**
   - **내재화(Internalization)**: `buildMidjourneyStableDiffusionConceptPlan`(`--cref`/`--cw`, `--sref`/`--sw`, ControlNet 3단 스택, 의상 고증, 5색 무드보드)과 `buildPhotoshopFireflyGenerativePlan`(세로 배경 확장, 불필요 사물 제거, 의상 부분 수정)으로 내재화했다.
3. **원더쉐어 필모라 (Filmora) & 캔바 (Canva) AI**
   - **내재화(Internalization)**: `runFilmoraMediaToWebtoonPipeline`(비디오 키프레임 추출, 5종 웹툰/애니 필터 프리셋, 플리커 억제) 및 `runCanvaInstatoonCarouselPipeline`(1:1·4:5 인스타툰 다중 슬라이드 배치, Magic Media 프롬프트, 원클릭 누끼 및 스티커 외곽선)으로 내재화했다.
4. **한계(Limitation)**: 외부 상용 SaaS의 비공개 서버사이드 모델 가중치 자체는 클라우드 뒤에 위치하므로, ToonStudio는 클라이언트 결정론적 시뮬레이션 엔진 + BYOK(Claude/OpenAI/로컬 모델) 하이브리드 브리지 구조로 동작한다.
