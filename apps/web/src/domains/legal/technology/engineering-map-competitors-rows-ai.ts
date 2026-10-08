import { CREATOR, D, listed, row, t, watch } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — AI·에이전트 영역의 추가분(AI 이미지 도구, AI 만화·웹툰 서비스, 조사 보조).
 * 앞부분의 라우팅 서비스(OpenRouter·Vercel AI Gateway 등)와 GenToon·ComfyUI 는 engineering-map-competitors-rows-market.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 */

const COMPOSER = "docs/studio-ai-comic-composer-benchmark-2026-09.md";
const DIRECTOR = "docs/reports/webtoon-ai-production-director-benchmark-2026-09-05.md";
const SUITE = "docs/webtoon-ai-generative-suite-benchmark-2026-09-03.md";
const COMPETITOR_BENCH = "docs/studio-competitor-benchmark-2026-07-10.md";
const FEATURES = "docs/studio-competitor-features.md";
const COMPANION = "docs/webtoon-companion-apps-benchmark-2026-09-03.md";
const EMERGING_REGISTRY = "docs/benchmarks/studio-emerging-product-registry.json";
const COMPETITOR_REGISTRY = "docs/benchmarks/studio-competitor-registry.json";
const AI = `${CREATOR}/ai`;

export const COMPETITOR_ROWS_AI: readonly EngineeringMapRow[] = [
  row({
    id: "adobe-firefly",
    name: "Adobe Firefly",
    domain: D.ai,
    url: "https://www.adobe.com/products/firefly.html",
    what: t(
      "Adobe의 생성형 AI 이미지 도구입니다. 저장소 문서는 스타일 참조, 구조(윤곽·깊이) 참조, 선택 영역 생성형 채우기, 여러 변형 제안, 모델별 크레딧 표시를 비교했습니다.",
      "Adobe's generative-AI image tool. The repository compared style references, structure (outline and depth) references, selection-based generative fill, multiple variations and per-model credit display.",
    ),
    learned: t(
      "배움: 참조의 역할을 장면 프롬프트와 분리해 명시하고, 실행 전에 예상 결과 수와 차단 요인을 먼저 보임. 안 한 점: 금액을 모르는 채 비용을 추정해 보이는 것.",
      "Learned: keep each reference's role apart from the scene prompt, and show the expected result count and blockers before running. Not adopted: showing a cost estimate when the price is unknown.",
    ),
    overlap: t("AI 이미지 참조팩(역할별 참조)과 후보 데스크의 변형 전략.", "The AI image reference pack (references by role) and the candidate desk's variation strategies."),
    evidence: [COMPOSER, DIRECTOR, COMPETITOR_REGISTRY, `${AI}/studio-ai-image-reference-roles.ts`, `${CREATOR}/ai/studio-scenario-candidate-workflow.ts`],
  }),
  row({
    id: "runway",
    name: "Runway",
    domain: D.ai,
    url: "https://runway.com/",
    what: t(
      "AI 영상·이미지 생성 서비스입니다. 저장소 문서는 이미지 참조(Gen-4 References)로 캐릭터와 환경을 유지한 채 구도를 바꾸는 방식, 생성당 최대 3개 참조, 스케치 기반 구도 제어를 비교했습니다.",
      "An AI video and image generation service. The repository compared its image references (Gen-4 References) for keeping characters and settings while changing the shot, up to three references per generation, and sketch-based composition control.",
    ),
    learned: t(
      "배움: 캐릭터·방법·화풍 역할의 참조팩을 입력 지문에 넣고, 참조가 바뀌면 이전 후보를 ‘검토 필요’로 표시. 의상·장소·광원·소품도 역할별 잠금으로 분리.",
      "Learned: include a role-based reference pack (character, method, style) in the input fingerprint and flag earlier candidates for review when references change. Costume, place, lighting and props are also separate locks.",
    ),
    overlap: t("후보 데스크의 입력 지문과 에피소드 디렉터의 역할별 잠금.", "The candidate desk's input fingerprint and the episode director's role locks."),
    evidence: [COMPOSER, DIRECTOR, COMPETITOR_REGISTRY, `${CREATOR}/ai/studio-scenario-candidate-workflow.ts`, `${AI}/studio-ai-episode-production-director.ts`],
  }),
  row({
    id: "midjourney",
    name: "Midjourney",
    domain: D.ai,
    url: "https://www.midjourney.com/",
    what: t(
      "AI 이미지 생성 서비스입니다. 저장소 문서는 스타일 참조와 무드보드로 화풍과 주제를 분리하는 방식, 초안·제작 모드, 최대 4개 참조의 편집 모델, 참조 강도 조절을 비교했습니다.",
      "An AI image generation service. The repository compared style references and moodboards that separate style from subject, draft and production modes, an edit model with up to four references, and reference-strength control.",
    ),
    learned: t(
      "배움: 초안·균형·최종 품질 레시피를 제공자 중립 문구로 두고 후보 수를 1·2·4로 명시. 안 한 점: 연결된 엔드포인트가 지원하지 않는 시드·화풍 가중치를 지원한다고 주장하는 것.",
      "Learned: provider-neutral Draft, Balanced and Final recipes and an explicit 1, 2 or 4 candidate count. Not adopted: claiming seed or style-weight control that the connected endpoint does not expose.",
    ),
    overlap: t("후보 데스크의 품질 레시피(Draft/Balanced/Final)와 후보 수 선택.", "The candidate desk's quality recipes (Draft, Balanced, Final) and candidate-count choice."),
    evidence: [COMPOSER, DIRECTOR, SUITE, `${CREATOR}/StudioScenarioCandidateDesk.tsx`, `${AI}/studio-ai-prompt-enhancer.ts`],
  }),
  row({
    id: "scenario",
    name: "Scenario",
    domain: D.ai,
    url: "https://www.scenario.com/",
    what: t(
      "게임·창작용 AI 이미지 서비스입니다. 저장소 문서는 캐릭터 참조 한 장으로 빠르게 반복하기, 마스크·편집·재화풍 도구, 작은 묶음으로 화풍 시험하기, 확장·업스케일 단계를 정리했습니다.",
      "An AI image service for games and creative work. The repository noted fast iteration from one character reference, mask, edit and restyle tools, testing styles in small batches, and outpaint and upscale stages.",
    ),
    learned: t(
      "배움: 후보 생성을 덮어쓰기가 아니라 추가형으로, 한 번에 요청 24개를 넘으면 실행 전에 막음. 인페인트·확장·업스케일은 실제 제공자 계약이 생길 때까지 따로 둠.",
      "Learned: candidate generation adds rather than overwrites, and a request over 24 is rejected before running. Inpaint, outpaint and upscale stay separate until a real provider contract exists.",
    ),
    overlap: t("후보 데스크: 컷당 1/2/4개 후보와 요청 수 사전 점검.", "The candidate desk: 1, 2 or 4 candidates per cut and a request-count preflight."),
    evidence: [COMPOSER, SUITE, `${CREATOR}/ai/studio-scenario-candidate-workflow.ts`, `${CREATOR}/StudioScenarioCandidateDesk.tsx`],
  }),
  row({
    id: "krea",
    name: "Krea",
    domain: D.ai,
    url: "https://www.krea.ai/",
    what: t(
      "실시간 생성·보정 기능을 가진 AI 이미지 서비스입니다. 저장소 문서는 이를 네이버웹툰 툰필터와 함께 ‘화풍 변환’의 비교 대상으로 적었습니다.",
      "An AI image service with real-time generation and enhancement. The repository named it, alongside Naver Webtoon's toon filter, as a comparison point for style transfer.",
    ),
    learned: t(
      "배움: 화풍 변환을 선 굵기·명암비·노이즈 제거 강도 계수로 풀어 네 가지 웹툰 화풍 프리셋으로 합성. 모델 품질 비교는 하지 않음.",
      "Learned: express style transfer as line-weight, contrast and denoising coefficients across four webtoon style presets. No model-quality comparison was made.",
    ),
    overlap: t("AI 슈퍼 스위트의 화풍 변환 툰필터.", "The AI Super Suite's style-transfer toon filter."),
    evidence: [SUITE, COMPETITOR_REGISTRY, `${AI}/studio-ai-webtoon-style-filter.ts`],
  }),
  watch({
    id: "leonardo-ai",
    name: "Leonardo.Ai",
    domain: D.ai,
    url: "https://leonardo.ai/",
    registry: "competitor",
    category: "ai-creative",
    priority: "P1",
    focus: t("이미지 생성, 캔버스, 모델, 화풍, 에셋", "image generation, canvas, models, styles and assets"),
  }),
  watch({
    id: "stable-diffusion-webui",
    name: "Stable Diffusion WebUI",
    domain: D.ai,
    url: "https://github.com/AUTOMATIC1111/stable-diffusion-webui",
    registry: "competitor",
    category: "ai-creative",
    priority: "P1",
    focus: t("로컬 모델, 확장 기능, 인페인팅, 제어, 일괄 생성", "local models, extensions, inpainting, control and batch generation"),
  }),
  watch({
    id: "krita-ai-diffusion",
    name: "Krita AI Diffusion",
    domain: D.ai,
    url: "https://github.com/Acly/krita-ai-diffusion",
    registry: "competitor",
    category: "ai-creative",
    priority: "P0",
    focus: t("선택 영역 생성, ControlNet, 영역별 프롬프트, 워크플로, 로컬 모델", "selection-based generation, ControlNet, regional prompts, workflows and local models"),
  }),
  row({
    id: "dashtoon",
    name: "Dashtoon",
    domain: D.ai,
    url: "https://dashtoon.com/",
    what: t(
      "AI 만화 제작 서비스입니다. 저장소 문서는 스토리에서 만화로, 캐릭터 학습·세부 조정·장면 간 일관성, 패널 생성과 부분 수정(인페인트·얼굴 보정·업스케일·자동 채색)을 정리했습니다.",
      "An AI comic-making service. The repository noted story-to-comic, character training and fine-tuning with consistency across scenes, and panel generation with partial fixes (inpaint, face fix, upscale, auto-color).",
    ),
    learned: t(
      "배움: 이름만 잠그지 않고 외형·의상·색·말투·관계·소품을 캐릭터 바이블로 저장해 잠긴 필드를 AI 요청에 ‘고정’ 제약으로 전달. 마케팅의 품질·속도 주장은 수치로 읽지 않음.",
      "Learned: store look, outfit, colors, speech and props as a character bible and pass locked fields as fixed constraints to AI requests. Marketing quality and speed claims are not read as measurements.",
    ),
    overlap: t("캐릭터 바이블과 에피소드 프로덕션 디렉터.", "The character bible and the episode production director."),
    evidence: [COMPETITOR_BENCH, DIRECTOR, SUITE, EMERGING_REGISTRY, `${CREATOR}/studio-character-bible.ts`, `${AI}/studio-ai-episode-production-director.ts`],
  }),
  row({
    id: "anifusion",
    name: "Anifusion",
    domain: D.ai,
    url: "https://anifusion.ai/",
    what: t(
      "AI 만화·웹툰 제작 서비스입니다. 저장소 문서는 자연어 이야기에서 장면·패널·대사 만들기, 캐릭터 시트와 LoRA 기반 적응, 만화·웹툰·4컷 형식, 세로쓰기·효과음·톤을 정리했습니다.",
      "An AI manga and webtoon service. The repository noted scene, panel and dialogue creation from a story, character sheets with LoRA-style adaptation, manga, webtoon and four-panel formats, vertical writing, sound effects and screentone.",
    ),
    learned: t(
      "배움(제품군 기록): 캐릭터 바이블과 게시 전 권리 점검. 커스텀 모델은 학습 자료의 권리 확인이 필요하다는 점도 기록. 이 제품만의 적용 위치는 문서에 따로 없음(미확인).",
      "Learned (group-level record): a character bible and a rights check before publishing, plus the note that custom models need their training material's rights confirmed. No product-specific place of adoption is recorded (unconfirmed).",
    ),
    overlap: t("캐릭터 바이블과 게시 패키지의 권리 체크리스트.", "The character bible and the publish package's rights checklist."),
    evidence: [COMPETITOR_BENCH, "docs/studio-commercial-manual-benchmark-2026-07-10.md", `${CREATOR}/studio-character-bible.ts`, `${CREATOR}/StudioPublicationRightsControls.tsx`],
  }),
  row({
    id: "llamagen",
    name: "LlamaGen",
    domain: D.ai,
    url: "https://llamagen.ai/",
    what: t(
      "AI 만화 제작 서비스입니다. 레지스트리는 동적 패널 흐름, 카메라 앵글, 프롬프트 기록, 만화 번역, 캐릭터 에셋에 주목했고, 보조 앱 문서는 ‘페이싱 시뮬레이터’를 따로 비교했습니다.",
      "An AI comic-making service. The registry noted dynamic panel flow, camera angles, prompt history, comic translation and character assets, and the companion-apps document compared its pacing simulator separately.",
    ),
    learned: t(
      "배움: 컷 사이 여백으로 연출 박자를 나누고 완독 체감 시간을 계산하는 시뮬레이터. 경계는 WEBTOON CANVAS 공식 가이드로 맞췄고, 출처 없는 값은 ‘휴리스틱’으로 표시.",
      "Learned: a simulator that classifies pacing from the gutter between cuts and estimates read time. Boundaries follow the official WEBTOON CANVAS guide, and unsourced values are labelled heuristics.",
    ),
    overlap: t("웹툰 스크롤 페이싱 시뮬레이터.", "The webtoon scroll pacing simulator."),
    evidence: [COMPANION, EMERGING_REGISTRY, `${CREATOR}/assistant/webtoon-scroll-pacing-simulator.ts`],
  }),
  row({
    id: "adobe-express-comic-creator",
    name: "Adobe Express Comic Creator",
    domain: D.ai,
    url: "https://www.adobe.com/express/create/comic-strip",
    what: t(
      "Adobe Express의 만화 만들기 기능입니다. 저장소 문서는 주제·이야기 구조·어휘 수준에서 멀티패널 초안 만들기, 장면 간 캐릭터 일관성, 생성된 패널·말풍선·제목의 편집, 패널 재생성을 정리했습니다.",
      "The comic-making feature of Adobe Express. The repository noted multi-panel drafts from a topic, story structure and vocabulary level, character consistency across scenes, editing of generated panels, balloons and titles, and panel regeneration.",
    ),
    learned: t(
      "배움: 생성 결과를 모두 편집 가능한 요소로 남기고, 텍스트 장면 설계와 이미지 생성을 나누는 AI 비트 시트 검토 게이트(Storyboard That·Adobe·Dashtoon 흐름의 결합).",
      "Learned: keep generated results as editable elements, and a beat-sheet review gate that splits text scene design from image generation (a blend of Storyboard That, Adobe and Dashtoon flows).",
    ),
    overlap: t("AI 코믹 디렉터의 비트 시트 검토와 장면별 재생성.", "The AI Comic Director's beat-sheet review and per-scene regeneration."),
    evidence: [COMPETITOR_BENCH, `${CREATOR}/ai/StudioAiComicDirectorPanel.tsx`, `${CREATOR}/ai/studio-ai-comic-director.ts`],
  }),
  row({
    id: "tooning",
    name: "Tooning",
    domain: D.ai,
    url: "https://tooning.io/",
    what: t(
      "툰스퀘어의 AI 웹툰 서비스입니다. 문장을 넣으면 상황에 맞는 만화와 캐릭터를 만들고, 에디터와 매직 스튜디오 모드가 나뉜다고 저장소가 정리했습니다.",
      "Toonsquare's AI webtoon service. The repository notes that a sentence prompts a fitting comic and characters, with separate editor and Magic Studio modes.",
    ),
    learned: t(
      "배움: 프레임 안 이미지 자동 맞춤, 이어 붙인 세로 스크롤 미리보기, 대사 다국어 번역, 스토리에서 컷·말풍선을 잇는 첫 버전, 감정에 맞춘 말풍선 추천, 3D 장면의 빌보드 말풍선·머리를 따라가는 감정 기호. 결과는 일반 편집 요소로 남김.",
      "Learned: image auto-fit in a frame, a stitched vertical-scroll preview, multi-language dialogue translation, a first version linking story to cuts and balloons, emotion-based balloon suggestions, and billboard balloons and head-following emote marks in 3D scenes. Results stay ordinary editable elements.",
    ),
    overlap: t(
      "시나리오 자동 레이아웃, 세로 스크롤 미리보기, 감정-말풍선 매처, 3D 빌보드 말풍선 앵커.",
      "Scenario auto-layout, the vertical-scroll preview, the emotion-to-balloon matcher and the 3D billboard balloon anchor.",
    ),
    evidence: [
      FEATURES,
      SUITE,
      "docs/studio-3d-startup-comprehensive-benchmark-2026-09-03.md",
      `${CREATOR}/studio-scenario-layout.ts`,
      `${CREATOR}/StudioScrollPreviewPanel.tsx`,
      `${AI}/studio-ai-emotion-bubble-matcher.ts`,
      `${CREATOR}/scene-3d/studio-3d-billboard-bubble-anchor.ts`,
    ],
  }),
  row({
    id: "tootoon",
    name: "TooToon",
    domain: D.ai,
    what: t(
      "한글 상호 ‘투툰’인 AI 만화 서비스입니다. 아이디어를 넣으면 시나리오부터 완성 아트워크까지 한 번에 만들고, 키워드만으로 스토리 구성과 캐릭터 에셋을 만든다고 저장소가 정리했습니다.",
      "An AI comic service known in Korean as 'TooToon'. The repository notes that an idea yields everything from scenario to finished artwork, with story treatment and character assets from keywords alone.",
    ),
    learned: t(
      "배움(제품군 기록): 스토리 텍스트에서 장면 분할, 컷, 이미지, 말풍선까지 잇는 시나리오 자동 레이아웃의 첫 버전. 완전 자동이 아니라 결과를 이어서 고치게 함.",
      "Learned (group-level record): a first version of scenario auto-layout linking story text to scene split, cuts, images and balloons. Not fully automatic; results are meant to be edited onward.",
    ),
    overlap: t("시나리오 자동 컷·말풍선 배치.", "Scenario-based automatic cut and balloon layout."),
    evidence: [FEATURES, `${CREATOR}/studio-scenario-scenes.ts`, `${CREATOR}/studio-scenario-layout.ts`],
  }),
  row({
    id: "wetoon",
    name: "WeToon",
    domain: D.ai,
    what: t(
      "한글 상호 ‘위툰’인 AI 만화 서비스입니다. 짧은 이야기 아이디어에서 시나리오와 캐릭터 디자인을 자동으로 만든다고 저장소가 정리했습니다.",
      "An AI comic service known in Korean as 'WeToon'. The repository notes that it generates a scenario and character designs from a short story idea.",
    ),
    learned: t(
      "배움(제품군 기록): 해외 진출을 염두에 둔 대사 다국어 번역(사용자 키 방식)과 시나리오 자동 레이아웃. 이 제품만의 적용 위치는 문서에 따로 없음(미확인).",
      "Learned (group-level record): multi-language dialogue translation with the user's own key, with overseas release in mind, and scenario auto-layout. No product-specific place of adoption is recorded (unconfirmed).",
    ),
    overlap: t("대사 번역 패널과 시나리오 자동 레이아웃.", "The dialogue translation panel and scenario auto-layout."),
    evidence: [FEATURES, `${CREATOR}/lettering/studio-dialogue-translate.ts`, `${CREATOR}/studio-scenario-layout.ts`],
  }),
  listed({
    id: "comicai",
    name: "ComicAI",
    domain: D.ai,
    what: t(
      "AI 만화 생성 도구로, 경쟁사 기능 문서의 조사 대상 목록에 ‘위 네 곳과 비슷한 범주’라고만 적혀 있습니다.",
      "An AI comic-generation tool that the competitor-features document lists only as 'a category similar to the four above'.",
    ),
    evidence: [FEATURES],
  }),
  row({
    id: "onoma-ai",
    name: "Onoma AI",
    domain: D.ai,
    url: "https://www.onoma.ai/",
    what: t(
      "한글 상호 ‘오노마에이아이’의 웹툰 콘티 자동화 서비스(TooNat)입니다. 저장소 문서는 대본에서 컷 분할·샷 크기·카메라 앵글·추천 효과음·배경 프롬프트를 구조화하는 점을 정리했습니다.",
      "A webtoon storyboard-automation service (TooNat), known in Korean as 'Onoma AI'. The repository noted that it structures a script into cuts, shot sizes, camera angles, suggested sound effects and background prompts.",
    ),
    learned: t(
      "배움: 줄글 대본을 컷별 샷 크기·앵글·감정·효과음·배경 프롬프트로 구조화. 주의: 완독 시간은 컷당 6초 고정 추정이라 세로 스크롤 시뮬레이션이 아님.",
      "Learned: structure prose scripts into per-cut shot size, angle, emotion, sound effect and background prompt. Caution: read time is a fixed six seconds per cut, so it is not a vertical-scroll simulation.",
    ),
    overlap: t("AI 콘티 자동 디렉터.", "The AI storyboard auto-director."),
    evidence: [SUITE, `${AI}/studio-ai-storyboard-director.ts`],
  }),
  row({
    id: "naver-webtoon-ai-painter",
    name: "NAVER WEBTOON AI Painter",
    domain: D.ai,
    what: t(
      "네이버웹툰이 소개한 선화 자동 채색 보조(AI 페인터)와 화풍 변환 기능(툰필터)입니다. 저장소 문서는 탁한 곱하기 그림자를 피하는 색상환 이동 방식을 정리했습니다.",
      "Naver Webtoon's line-art auto-coloring assistant (AI Painter) and style-transfer feature (toon filter). The repository noted its approach of shifting hue to avoid muddy multiplied shadows.",
    ),
    learned: t(
      "배움: 밑색에서 색상환을 차가운 쪽으로 25~40도 옮기고 채도를 조금 올려 맑은 그림자를 계산, 다섯 가지 피부톤 음영 세트. 네이버웹툰 내부 구현은 확인하지 못함.",
      "Learned: shift hue 25 to 40 degrees toward cool and raise saturation slightly for clear shadows, with five skin-tone shading sets. Naver Webtoon's internal implementation was not checked.",
    ),
    overlap: t(
      "웹툰 색 조화 도우미(색상환 이동 음영), 툰필터, 가상 광원으로 2단계 셀 음영을 계산하는 AI 음영 보조(코드 머리말이 이 서비스를 벤치마크했다고 적음).",
      "The webtoon color-harmony assistant (hue-shift shading), the toon filter, and the AI shading assist that computes two-step cel shadows from a virtual light (its code header says it benchmarks this service).",
    ),
    evidence: [
      COMPANION,
      SUITE,
      `${CREATOR}/assistant/webtoon-color-harmony-assistant.ts`,
      `${AI}/studio-ai-webtoon-style-filter.ts`,
      `${AI}/studio-ai-shading-assist.ts`,
    ],
  }),
  watch({
    id: "glimnavi",
    name: "GlimNavi",
    domain: D.ai,
    url: "https://glimnavi.com/",
    registry: "webtoon",
    category: "ai-webtoon-assist",
    priority: "P0",
    focus: t("대본 각색, 자동 컷 분할, 콘티 배치, 선화, 채색, 명암, 단계별 재생성", "script adaptation, automatic shot splitting, storyboard layout, line art, coloring, shading and stage-by-stage regeneration"),
    note: t("AI 단계마다 원본 레이어 위의 제안으로 두고 수락·거절·비교·재실행·되돌리기·출처를 갖출 것.", "Model each AI stage as a proposal over source layers with accept, reject, compare, rerun, undo and provenance."),
  }),
  watch({
    id: "ggooming",
    name: "GGOOMING",
    domain: D.ai,
    url: "https://www.ggooms.com/",
    registry: "webtoon",
    category: "social-comic-assist",
    priority: "P1",
    focus: t("화풍 일관성, 빠른 패널 생성, 창작자·브랜드 협업, 소셜 만화 흐름", "style consistency, fast panel generation, creator and brand collaboration and a social-comic workflow"),
    note: t("반복해 쓰는 창작자 화풍 키트와 패널 크기 프리셋, 권리·출처 점검을 갖출 것.", "Add repeatable creator style kits, panel-size presets, and rights and provenance checks."),
  }),
  watch({
    id: "manhwa-ai",
    name: "ManhwaAI",
    domain: D.ai,
    url: "https://www.manhwaai.net/",
    registry: "webtoon",
    category: "ai-manhwa-planning",
    priority: "P1",
    focus: t("일관된 캐릭터, 편집 가능한 패널, 말풍선, 세로 웹툰 레이아웃, 공유 캐릭터 브리프, 패널별 생성", "consistent characters, editable panels, speech bubbles, vertical webtoon layouts, shared character briefs and panel-by-panel generation"),
    note: t("공유하는 구조화 캐릭터 바이블과 패널 개요를 쓰되 손 배치와 그림을 정본으로 유지할 것.", "Use shared structured character bibles and panel briefs, but keep manual layout and drawing authoritative."),
  }),
  row({
    id: "perplexity",
    name: "Perplexity",
    domain: D.ai,
    url: "https://www.perplexity.ai/",
    what: t(
      "AI 검색·답변 서비스입니다. 저장소의 리서치 데스크 문서는 주제·지침·검색 기록을 한 작업 맥락에 묶는 ‘Spaces’ 방식을 참고했다고 적었습니다.",
      "An AI search and answer service. The repository's research-desk document cites its 'Spaces' approach of tying topic, instructions and search history into one working context.",
    ),
    learned: t(
      "배움: ‘주제·지침·검색 기록을 한 작업 맥락에’ 묶는 방식을 리서치 이름, 핵심 질문, 제약, 최근 검색으로 줄여 적용(문서가 ‘축소 적용’이라고 밝힘).",
      "Learned: tie topic, instructions and search history into one working context, reduced to a research name, key question, constraints and recent searches (the document calls it a reduced application).",
    ),
    overlap: t("리서치 데스크의 조사 맥락(이름·질문·제약·최근 검색).", "The research desk's research context (name, question, constraints, recent searches)."),
    evidence: ["docs/creator-resources/research-desk-v2.md", "docs/research-desk-benchmark-2026-09-09.md", "apps/web/src/domains/creator-resources/research-desk-session.ts"],
  }),
];
