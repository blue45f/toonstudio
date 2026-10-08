import { CREATOR, D, FIELD_NOTES, PLAYBOOK, row, t } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 웹툰 유통·생태계, AI·에이전트, 엔진·표준.
 * 한 파일이 1,000줄을 넘지 않도록 engineering-map-competitors-rows.ts 에서 나눴고, 그쪽에서 이 배열을 이어 붙인다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 */

/* ───────────── 웹툰 유통·생태계 ───────────── */

const PUBLISHING: readonly EngineeringMapRow[] = [
  row({
    id: "webtoon-canvas",
    name: "WEBTOON CANVAS",
    domain: D.publishing,
    url: "https://www.webtoons.com/en/canvas",
    what: t(
      "웹툰 작가가 직접 연재하는 창작자 플랫폼입니다. 예약 공개·정책 심사·분석 기능이 게시 전 점검(preflight) 설계의 참고였습니다.",
      "A creator platform where artists publish their own webtoons. Its scheduling, policy review and analytics informed the design of the pre-publish check (preflight).",
    ),
    learned: t(
      "배움: 예약·미리보기·심사·분석, 다국어 연재와 AI 번역 동의(opt-in). 안 한 점: 공식 Creator API 승인 없이 직접 게시·예약·수익 동기화를 주장하지 않고, 로컬 릴리스 일정과 수동 성과 가져오기만 제공.",
      "Learned: scheduling, preview, review, analytics, multi-language publishing and opt-in AI translation. Not adopted: no direct publishing, scheduling or revenue sync is claimed without official Creator API approval; only a local release calendar and manual metric import exist.",
    ),
    overlap: t("게시 패키지, 게시 전 점검 패널, 플랫폼 규격 검사기.", "Publish package, publish preflight panel and platform spec validator."),
    evidence: [
      "docs/studio-competitor-benchmark-2026-07-10.md",
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      "docs/benchmarks/studio-webtoon-ecosystem-registry.json",
      `${CREATOR}/studio-publish-package.ts`,
      `${CREATOR}/StudioPublishPreflightPanel.tsx`,
    ],
  }),
  row({
    id: "tapas",
    name: "Tapas",
    domain: D.publishing,
    url: "https://www.creators.tapas.io/creating-a-series",
    urlTitle: "Tapas creators guide",
    what: t(
      "웹툰·웹소설 연재 플랫폼입니다. 2026-07-10 문서가 적은 AI 생성 콘텐츠 정책이 게시 전 점검 설계의 참고였습니다.",
      "A platform for serialized webcomics and web novels. The AI-generated-content policy recorded in a 2026-07-10 document informed the pre-publish check.",
    ),
    learned: t(
      "배움: 초안·예약·분석 기능과, 게시처에 AI 생성 이력이 있으면 경고·차단하는 사전 점검. 주의: 정책은 2026-07-10 문서 기준이라 지금도 같은지 다시 확인해야 함.",
      "Learned: drafts, scheduling and analytics, plus a preflight that warns or blocks when AI-generation history exists for that destination. Caution: the policy is as of the 2026-07-10 document and must be rechecked.",
    ),
    overlap: t("게시 패키지와 게시 전 점검 패널(AI 생성 이력 경고).", "Publish package and preflight panel (AI-generation history warning)."),
    evidence: [
      "docs/studio-competitor-benchmark-2026-07-10.md",
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      `${CREATOR}/studio-publish-package.ts`,
    ],
  }),
  row({
    id: "toonstoons",
    name: "Toonstoons",
    domain: D.publishing,
    url: "https://www.toonstoonsweb.com/",
    what: t(
      "AI로 웹툰과 30초 영상을 만드는 서비스입니다. 대본→캐릭터→장면→음성→영상을 한 프로젝트로 묶는 제작 흐름을 clean-room 방식(공개된 화면·동작만 보고 새로 설계)으로 분석했습니다.",
      "A service that makes webtoons and 30-second videos with AI. Its flow from script to characters, scenes, voice and video inside one project was analyzed in a clean-room way.",
    ),
    learned: t(
      "배움: 대본→캐릭터 기준→장면 이미지→음성→영상을 한 프로젝트로 잇는 흐름. 다르게 한 점: 소스·브랜드·문구·결과물을 복사하지 않고 기존 엔진을 하나의 작업대로 묶음.",
      "Learned: a production flow tying script, character references, scene images, voice and video into one project. Done differently: no source, brand, wording or output is copied; existing engines were gathered into one workbench.",
    ),
    overlap: t(
      "AI 코믹 디렉터 세션과 Toon Automation 작업대(웹툰·30초 애니 모드).",
      "AI Comic Director sessions and the Toon Automation workbench (webtoon and 30-second animation modes).",
    ),
    evidence: [
      "docs/audits/toonstoons-functional-parity-2026-09-23.md",
      `${CREATOR}/ai/studio-toon-automation.ts`,
      `${CREATOR}/ai/StudioToonAutomationWorkspace.tsx`,
    ],
  }),
  row({
    id: "creco",
    name: "Creco",
    domain: D.publishing,
    url: "https://app.creco.so/ko/",
    urlTitle: "Creco app",
    what: t(
      "웹툰 제작을 팀으로 운영하는 협업 서비스입니다. 워크스페이스·공정·원고 버전·피드백·전달 흐름을 직접 구현할 대상으로 정리했습니다.",
      "A service for running webtoon production as a team. Its workspace, process, manuscript version, feedback and delivery flow was mapped for in-house reimplementation.",
    ),
    learned: t(
      "배움: 워크스페이스·멤버·표준 공정·원고·버전·피드백·전달을 한 흐름으로 묶기. 다르게 한 점: 화면·문구·브랜드를 복제하지 않고 기존 권한·버전·검수 모델로 해결.",
      "Learned: tie workspace, members, standard processes, manuscripts, versions, feedback and delivery into one flow. Done differently: no UI, wording or brand is copied; the flow is solved with existing permission, version and review models.",
    ),
    overlap: t(
      "제작 허브의 원고·공정·전달 화면과 고정 검토 패널.",
      "Production hub manuscript, process and delivery screens, and the pinned review panel.",
    ),
    evidence: [
      "docs/design/creco-feature-internalization-20260923.md",
      "docs/design/production-workflows-20260927.md",
      `${CREATOR}/production-hub/ProductionManuscriptWorkspace.tsx`,
      `${CREATOR}/production-hub/ProductionManuscriptDeliveryHub.tsx`,
    ],
  }),
  row({
    id: "clip-studio-assets",
    name: "Clip Studio Assets",
    domain: D.publishing,
    url: "https://assets.clip-studio.com/",
    what: t(
      "Clip Studio용 소재(브러시·3D 등)를 받는 마켓입니다. 팔레트별 탐색과 다운로드·가져오기 분리가 비교 대상이었고, Unity Asset Store·Fab·3D Warehouse도 같은 문서에서 비교했습니다.",
      "A marketplace for Clip Studio materials such as brushes and 3D assets. Palette-based browsing and splitting download from import were compared, alongside Unity Asset Store, Fab and 3D Warehouse in the same document.",
    ),
    learned: t(
      "배움: 쓰는 환경(버전·렌더러)을 먼저 밝히고 카드와 상세에서 같은 판정을 재사용. 안 한 점: 패스포트가 설치 성공·적법성을 보증한다고 말하지 않고, 다운로드·변환·삽입 일괄 처리는 후속으로 남김.",
      "Learned: declare the target Studio version and renderer first, and reuse one verdict on cards and detail pages. Not adopted: a passport is not a guarantee of installation or legality, and one-step download, convert and insert is left for later.",
    ),
    overlap: t("마켓의 제작 적합성 패스포트와 제작 적합성 랩.", "Market production-fit passport and fit lab."),
    evidence: [
      "docs/benchmarks/market-production-fit-2026-09-09.md",
      "docs/benchmarks/marketplace-social-studio-integration-2026-09-04.md",
      "apps/web/src/domains/market/models/market-production-fit.ts",
    ],
  }),
  row({
    id: "kaistory",
    name: "KAISTORY",
    domain: D.publishing,
    url: "https://kaistory.net/",
    what: t(
      "웹툰 제작·유통 서비스입니다. 저장소 감시 목록은 오프라인 우선 콘티, 하나의 프로젝트 데이터 모델, 레이어 PSD, 다국어 번역에 주목했습니다.",
      "A webtoon production and distribution service. The repository's watch list noted offline-first storyboards, one project data model, layered PSD and multi-language translation.",
    ),
    learned: t(
      "미조사: 감시 목록(우선순위 P0)에만 있고 직접 비교한 기록은 없음. 레지스트리 구현 메모: 콘티부터 게시까지 버전 있는 프로젝트 하나로 잇고 로컬 복구를 정본으로 둘 것.",
      "Not researched: it is only on the watch list (priority P0) with no direct comparison on record. Registry implementation note: link storyboard to publish in one versioned project and keep local-first recovery authoritative.",
    ),
    overlap: t(
      "로컬 우선 저장·복구와 콘티~내보내기를 잇는 프로젝트 흐름(비교는 미조사).",
      "Local-first save and recovery and the storyboard-to-export project flow (comparison not researched).",
    ),
    evidence: ["docs/benchmarks/studio-webtoon-ecosystem-registry.json"],
  }),
  row({
    id: "laftel",
    name: "Laftel",
    domain: D.publishing,
    url: "https://laftel.net/",
    what: t(
      "애니메이션 스트리밍·정보 서비스입니다. 가입할 때 취향 테스트를 하고 별점을 쌓아 추천하는 방식이 탐색 계층(Spectrum)의 참고 대상이었습니다.",
      "An anime streaming and information service. Its sign-up taste test, with recommendations built from star ratings, was the reference for the discovery layer (Spectrum).",
    ),
    learned: t(
      "배움: 취향 테스트로 시작하는 온보딩, 분기별 캘린더, 태그 중심 탐색. 주의: 근거 문서가 2026-05 기준이라 프레이밍이 오래됨 — ‘참고한 것’으로만 읽어야 함.",
      "Learned: a taste-test onboarding, a seasonal calendar and tag-led browsing. Caution: the source document is from 2026-05 and its framing is dated, so read this only as 'what was referenced'.",
    ),
    overlap: t("취향 테스트 온보딩 화면(TasteOnboardingPage).", "The taste-test onboarding page (TasteOnboardingPage)."),
    evidence: [
      "docs/competitor-analysis.md",
      "DIFFERENTIATION.md",
      "apps/web/src/domains/engagement/TasteOnboardingPage.tsx",
    ],
  }),
  row({
    id: "anilist",
    name: "AniList",
    domain: D.publishing,
    url: "https://anilist.co/",
    what: t(
      "만화·애니메이션 기록(트래킹)·통계·태그 서비스입니다. 저장소는 이를 ‘기록·통계·태그’의 핵심 롤모델로 적었습니다.",
      "A tracking, statistics and tagging service for manga and anime. The repository names it a key role model for tracking, stats and tags.",
    ),
    learned: t(
      "배움: 점수 스케일을 고르는 유연함, 개인 통계 대시보드, 다음 화 일정·밀린 화수 추적, 작품 사이의 관계(원작·각색). 주의: 근거 문서가 2026-05 기준이라 ‘참고한 것’으로만 읽어야 함.",
      "Learned: a choice of score scales, a personal statistics dashboard, next-episode and backlog tracking, and relations between works (source and adaptation). Caution: the source document is from 2026-05, so read this only as 'what was referenced'.",
    ),
    overlap: t(
      "연재 캘린더(다음 화 일정)와 원작-각색 관계 그래프.",
      "The release calendar (next-episode dates) and the adaptation graph.",
    ),
    evidence: [
      "docs/competitor-analysis.md",
      "DIFFERENTIATION.md",
      "docs/catalog-research-lab.md",
      "apps/web/src/domains/catalog/CalendarPage.tsx",
      "apps/web/src/shared/components/adaptation-graph.tsx",
    ],
  }),
  row({
    id: "letterboxd",
    name: "Letterboxd",
    domain: D.publishing,
    url: "https://letterboxd.com/",
    what: t(
      "영화 기록·리뷰 소셜 서비스입니다. 저장소는 이를 ‘소셜 리뷰’의 핵심 롤모델로 적되, 색·화면을 그대로 따라 하지 않는 가드를 두었습니다.",
      "A social service for logging and reviewing films. The repository names it a key role model for social reviews, but sets a guard against copying its colors or look.",
    ),
    learned: t(
      "배움: 반쪽 별, 다이어리, 공개 리스트, 팔로우로 이어지는 기록·리뷰 문화. 다르게 한 점: 틸/그린 색을 쓰지 않고 한국 웹툰 맥락으로 재해석. 팔로우 피드·다이어리는 이용자가 모인 뒤로 미룸(P2).",
      "Learned: a logging and review culture built on half stars, diaries, public lists and follows. Done differently: its teal and green colors are not used and social features are reinterpreted for Korean webtoons. Follow feeds and diaries wait until enough users exist (P2).",
    ),
    overlap: t(
      "작품 리뷰·평점과 내 라이브러리(Spectrum).",
      "Work reviews and ratings, and the personal library (Spectrum).",
    ),
    evidence: ["docs/competitor-analysis.md", "DIFFERENTIATION.md", "PRODUCT.md", "docs/catalog-research-lab.md"],
  }),
  row({
    id: "trakt",
    name: "Trakt",
    domain: D.publishing,
    url: "https://trakt.tv/",
    what: t(
      "시청 기록과 ‘어디서 볼 수 있나(Where to watch)’ 정보를 주는 서비스입니다. 저장소는 이를 ‘어디서 볼지’ 안내의 핵심 롤모델로 적었습니다.",
      "A service that tracks what you watch and tells you where to watch it. The repository names it a key role model for 'where to read' guidance.",
    ),
    learned: t(
      "배움: 작품 하나가 어느 제공처에 있는지 한눈에 보여주는 방식. 다르게 한 점: 외부 플랫폼의 유료 본문과 회차 이미지는 호스팅하지 않고 연결만 함. 주의: 근거 문서가 2026-05 기준이라 ‘참고한 것’으로만 읽어야 함.",
      "Learned: show at a glance which providers carry a work. Done differently: paid text and episode images of external platforms are not hosted; users are only linked out. Caution: the source document is from 2026-05, so read this only as 'what was referenced'.",
    ),
    overlap: t("작품 상세의 제공처(어디서 볼지) 표시.", "Where-to-read availability on work pages."),
    evidence: [
      "docs/competitor-analysis.md",
      "DIFFERENTIATION.md",
      "PRODUCT.md",
      "apps/web/src/shared/components/availability.tsx",
    ],
  }),
];

/* ───────────── AI·에이전트 ───────────── */

const AI: readonly EngineeringMapRow[] = [
  row({
    id: "dia",
    name: "Dia",
    domain: D.ai,
    url: "https://www.diabrowser.com/",
    what: t(
      "AI 기능이 들어간 웹 브라우저입니다. 주 모델이 실패하면 보조 AI 모델로 바꿔 대화를 이어가는 방식이 참고 대상이었습니다.",
      "A web browser with built-in AI. Its way of switching chat to a backup AI model when the main model fails was the reference.",
    ),
    learned: t(
      "배움: 자동 모드에서는 전환을 눈에 띄지 않게 하되 실제 쓴 경로는 보여줌. 다르게 한 점: 결과가 애매한 실패(시간 초과 등)는 다른 공급자로 다시 보내지 않음(이중 생성·과금 위험).",
      "Learned: keep fallback unobtrusive in automatic mode but show the route actually used. Done differently: ambiguous failures such as timeouts are never replayed to another provider (risk of duplicate generation or billing).",
    ),
    overlap: t(
      "AI 연결 설정과 자동·우선순위·수동 라우팅(user-ai-transport).",
      "AI connection settings and automatic, priority and manual routing (user-ai-transport).",
    ),
    evidence: ["docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "apps/web/src/shared/ai/user-ai-transport.ts", PLAYBOOK],
  }),
  row({
    id: "browser-use-cloud",
    name: "Browser Use Cloud",
    domain: D.ai,
    url: "https://docs.browser-use.com/cloud/quickstart",
    urlTitle: "Browser Use Cloud quickstart",
    what: t(
      "AI가 브라우저를 대신 조작하는 ‘브라우저 에이전트’를 클라우드로 제공하는 서비스입니다. 여러 AI 공급자와 내 키 직접 쓰기(BYOK)를 지원한다고 문서가 기록했습니다.",
      "A cloud service for 'browser agents', AI that operates a browser for you. The repository records support for many AI providers and bring-your-own-key (BYOK).",
    ),
    learned: t(
      "배움: 한 곳의 설정 화면에서 공급자 키·모델을 관리하고 공급자마다 키와 모델을 여러 개 둘 수 있게 함. 내 컴퓨터에서 도는 브라우저 실행기는 필요 없음.",
      "Learned: manage provider keys and models in one settings surface, with several keys and models per provider. No local browser runner is required.",
    ),
    overlap: t("AI 연결 설정: 연결마다 여러 키·모델 등록.", "AI connection settings: several keys and models per connection."),
    evidence: ["docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "apps/web/src/shared/ai/user-ai-transport.ts", PLAYBOOK],
  }),
  row({
    id: "vercel-ai-gateway",
    name: "Vercel AI Gateway",
    domain: D.ai,
    url: "https://vercel.com/docs/ai-gateway",
    urlTitle: "Vercel AI Gateway documentation",
    what: t(
      "여러 AI 모델 공급자를 한 창구로 묶어 주는 게이트웨이입니다. 공급자 순서, 모델 폴백, 요청별 BYOK, 예산이 핵심 개념으로 문서에 있습니다.",
      "A gateway that puts many AI model providers behind one entry point. Its documentation treats provider ordering, model fallback, per-request BYOK and budgets as core concepts.",
    ),
    learned: t(
      "배움: 순서를 명시하고, 공용 무료 풀의 순서와 개인 연결·모델·키 우선순위를 분리. 다르게 한 점: 유료 개인 키(BYOK)는 사용자가 켜기 전에는 자동 라우팅에서 제외.",
      "Learned: make order explicit and keep the shared free pool's order apart from personal connection, model and key priority. Done differently: paid personal keys (BYOK) stay out of automatic routing until the user opts in.",
    ),
    overlap: t("AI 라우팅의 자동·우선순위·수동 모드와 비용 안전 장치.", "AI routing modes (automatic, priority, manual) and cost safeguards."),
    evidence: ["docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "apps/web/src/shared/ai/user-ai-transport.ts", PLAYBOOK],
  }),
  row({
    id: "openrouter",
    name: "OpenRouter",
    domain: D.ai,
    url: "https://openrouter.ai/",
    what: t(
      "하나의 API로 여러 회사의 AI 모델을 쓸 수 있게 해 주는 서비스입니다. 큰 모델 목록과 무료 모델 라우터가 참고 대상이었습니다.",
      "A service that lets one API reach AI models from many companies. Its large model catalog and free-model router were the reference.",
    ),
    learned: t(
      "배움: 무료 라우터(openrouter/free)를 기본 프리셋으로 제공. 다르게 한 점: 중개 서비스 하나에만 기대지 않도록 각 공급자의 직접 키도 계속 쓸 수 있게 함.",
      "Learned: offer the free router (openrouter/free) as a preset. Done differently: direct provider keys still work, so no single aggregator becomes a point of dependency.",
    ),
    overlap: t("AI 연결 프리셋과 공유 무료 풀.", "AI connection presets and the shared free pool."),
    evidence: ["docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "apps/web/src/shared/ai/user-ai-transport.ts", PLAYBOOK],
  }),
  row({
    id: "gentoon",
    name: "GenToon",
    domain: D.ai,
    url: "https://www.gentoon.ai/",
    what: t(
      "AI로 웹툰을 만드는 서비스입니다. Dashtoon·LlamaGen·Anifusion 같은 AI 만화 서비스와 함께 ‘이야기→컷 분할→캐릭터 일관성’ 흐름이 비교 대상이었습니다.",
      "A service that makes webtoons with AI. It was compared with AI comic services such as Dashtoon, LlamaGen and Anifusion on the flow from story to panel split to character consistency.",
    ),
    learned: t(
      "배움: 캐릭터·화풍 기준을 고정하고 컷 단위로 다시 생성, 말풍선은 편집 가능하게 유지, 생성 이력(영수증) 남기기. 다르게 한 점: 텍스트 모델을 이미지 생성·LoRA 학습 기능처럼 표현하지 않음.",
      "Learned: fix character and style references, regenerate per panel, keep lettering editable and keep a provenance receipt. Done differently: text models are never presented as image generation or LoRA training.",
    ),
    overlap: t(
      "AI 코믹 디렉터(이야기 분해·컷 후보·부분 수리)와 에피소드 제작 디렉터.",
      "AI Comic Director (story breakdown, panel candidates, partial repair) and the episode production director.",
    ),
    evidence: [
      "docs/studio-competitor-benchmark-2026-07-10.md",
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      "docs/reports/webtoon-ai-production-director-benchmark-2026-09-05.md",
      "docs/benchmarks/studio-webtoon-ecosystem-registry.json",
      `${CREATOR}/ai/studio-ai-episode-production-director.ts`,
    ],
  }),
  row({
    id: "comfyui",
    name: "ComfyUI",
    domain: D.ai,
    url: "https://github.com/comfyanonymous/ComfyUI",
    urlTitle: "ComfyUI repository",
    what: t(
      "노드를 이어 붙여 이미지·영상 생성 과정을 직접 짜는 AI 도구입니다. 저장소 감시 목록은 노드 그래프·로컬 모델·확장 기능에 주목했습니다.",
      "An AI tool where you wire nodes together to build image and video generation pipelines. The repository's watch list noted node graphs, local models and extensions.",
    ),
    learned: t(
      "다르게 한 점: 예전의 로컬 ComfyUI 환경변수는 이제 읽지 않고, 이미지·영상·2D↔3D 추론은 공개 HTTPS 클라우드 주소만 씀. 그 밖의 직접 비교 기록은 감시 목록 수준.",
      "Done differently: the former local ComfyUI environment variables are no longer read, and image, video and 2D-to-3D inference use only public HTTPS cloud endpoints. Beyond the watch list there is no direct comparison on record.",
    ),
    overlap: t("미디어 추론(이미지·영상·2D↔3D)의 클라우드 연결 설정.", "Cloud connection settings for media inference (image, video, 2D-to-3D)."),
    evidence: [
      "docs/operations/cloud-ai-routing-benchmark-2026-09-16.md",
      "docs/webtoon-ai-generative-suite-benchmark-2026-09-03.md",
      "docs/benchmarks/studio-competitor-registry.json",
    ],
  }),
];

/* ───────────── 엔진·표준 (오픈소스 지도와 겹치는 것은 ‘참고·대안으로 검토한 것’만) ───────────── */

const ENGINES: readonly EngineeringMapRow[] = [
  row({
    id: "three-js",
    name: "Three.js",
    domain: D.engines,
    url: "https://threejs.org/",
    what: t(
      "웹에서 3D를 그리는 라이브러리입니다. ToonStudio 3D 편집기의 현행 엔진이며 다른 엔진을 평가할 때의 기준점이었습니다.",
      "A library for drawing 3D on the web. It is the current engine of the ToonStudio 3D editor and the baseline against which other engines were evaluated.",
    ),
    learned: t(
      "결론: 3D 편집기는 Three를 유지하고 이미 만든 Babylon 출력 경로만 제한적으로 키움. 전체 교체를 정당화할 기기 성능 비교는 없음. 주의: Three dev 문서는 설치 버전보다 앞설 수 있어 적용 전 버전 확인.",
      "Conclusion: keep Three for the 3D editor and only extend the existing Babylon output path in a limited way; no on-device performance comparison justifies a full replacement. Caution: Three's dev docs can run ahead of the installed version, so check the version first.",
    ),
    overlap: t("배경 3D 편집기의 렌더링 런타임과 엔진 어댑터.", "The background 3D editor's rendering runtime and engine adapter."),
    evidence: [
      "docs/reports/studio-3d-engine-evaluation-2026-09-12.md",
      "docs/studio-babylonjs-adoption-evaluation-2026-07-11.md",
      `${CREATOR}/bg3d/useStudioBg3dEngineRuntime.ts`,
      `${CREATOR}/bg3d/studio-bg3d-runtime-adapter.ts`,
    ],
  }),
  row({
    id: "babylon-js",
    name: "Babylon.js",
    domain: D.engines,
    url: "https://www.babylonjs.com/",
    what: t(
      "또 하나의 웹 3D 엔진입니다. 현재는 배경 3D에서 색·깊이·법선(면의 방향)·ID 이미지를 뽑는 작업에만 따로 떼어 쓰고 있습니다.",
      "Another web 3D engine. It is currently used only, and in isolation, to produce color, depth, normal (surface direction) and ID images for background 3D.",
    ),
    learned: t(
      "배운 점: 색·깊이·법선·객체 ID·재질 ID 출력 경로. 한계: 압축 메시·텍스처 배열·활성 포즈·직교 카메라 등은 아직 거부해 캐릭터 편집기의 완전한 대체가 아니며, 교체할 근거도 없음.",
      "Learned: an output path for color, depth, normal, object ID and material ID. Limit: it still rejects compressed meshes, texture arrays, active poses and orthographic cameras, so it is no full replacement for the character editor, and there is no case for replacing Three.",
    ),
    overlap: t(
      "배경 3D 출력 캡처(beauty·depth·normal·ID)를 맡는 격리된 전문 작업.",
      "Background 3D output capture (beauty, depth, normal, ID) as an isolated specialist job.",
    ),
    evidence: [
      "docs/reports/studio-3d-engine-evaluation-2026-09-12.md",
      "docs/studio-babylonjs-adoption-evaluation-2026-07-11.md",
      `${CREATOR}/bg3d/studio-bg3d-babylon-artifact-capture.ts`,
    ],
  }),
  row({
    id: "playcanvas",
    name: "PlayCanvas",
    domain: D.engines,
    url: "https://playcanvas.com/",
    what: t(
      "웹 3D 엔진입니다(촬영한 공간을 점 구름처럼 보여 주는 Gaussian Splat의 편집기 SuperSplat 포함). 독립 비교 후보일 뿐 도입할 근거는 아직 없다고 기록했습니다.",
      "A web 3D engine (including SuperSplat, an editor for Gaussian Splats, which show a captured space as a point cloud). It is recorded only as a candidate for an independent comparison, with no case yet for adopting it.",
    ),
    learned: t(
      "배운 점: React 통합이 가능하고 WebGPU(베타)에 WebGL2 대체 경로가 있음. 안 한 점: 실제 어댑터는 만들지 않았고(엔진 ID만 있음), SuperSplat은 ‘평가 예정’ 후보로 운영 기능에 표시하지 않음.",
      "Learned: React integration is possible and WebGPU (beta) has a WebGL2 fallback. Not adopted: no real adapter exists (only an engine ID), and SuperSplat is a 'planned evaluation' candidate not presented as a live feature.",
    ),
    overlap: t(
      "배경 3D의 엔진 선택 목록과 촬영 배경(Gaussian Splat) 후보.",
      "The background 3D engine selection list and a candidate for captured backgrounds (Gaussian Splat).",
    ),
    evidence: [
      FIELD_NOTES,
      "docs/reports/studio-3d-engine-evaluation-2026-09-12.md",
      "docs/studio-3d-engine-specialist-topology-2026-07-18.md",
    ],
  }),
  row({
    id: "godot",
    name: "Godot",
    domain: D.engines,
    url: "https://godotengine.org/",
    what: t(
      "오픈소스 게임 엔진입니다. 웹으로 내보내려면 WASM(웹용 실행 코드)과 WebGL2만 쓸 수 있고 C#은 웹으로 내보낼 수 없다는 점이 평가 대상이었습니다.",
      "An open-source game engine. Web export is limited to WASM (web-ready compiled code) and WebGL2, with no C# web export, and that was what the evaluation looked at.",
    ),
    learned: t(
      "채택하지 않음: 별도 WASM 앱이 Studio 상태를 이중으로 갖게 되고 WebGPU 목표와 맞지 않으며, React 편집 문서와 잇는 비용이 큼. ‘엔진부터 고르면 안 된다’는 반례로 기록.",
      "Not adopted: a separate WASM app would duplicate Studio state, does not fit the WebGPU goal and costs a lot to bridge to the React editing document. Recorded as a counterexample to picking an engine first.",
    ),
    overlap: t("3D 편집기 엔진 선택(Three 유지)과 문서 권위 설계.", "3D editor engine choice (Three kept) and document-authority design."),
    evidence: [FIELD_NOTES, "docs/reports/studio-3d-engine-evaluation-2026-09-12.md"],
  }),
  row({
    id: "unity",
    name: "Unity",
    domain: D.engines,
    url: "https://unity.com/",
    what: t(
      "게임 엔진입니다. 웹에서는 WebGL2가 기본이고 WebGPU는 실험 단계이며 C# 코드에 제약이 있다는 점이 평가 대상이었습니다(Unity 6.3 LTS 문서 기준).",
      "A game engine. On the web, WebGL2 is the default, WebGPU is experimental and C# code has limits (per the Unity 6.3 LTS documentation).",
    ),
    learned: t(
      "채택하지 않음: C#↔웹 명령 다리, 자산 변환, 셰이더, 입력·저장·캡처를 상당 부분 다시 만들어야 하고, 현재 어댑터 계약(함수·AbortSignal 포함)은 WASM·iframe으로 그대로 보낼 수 없음. 약관은 도입 전 확인 필요.",
      "Not adopted: the C#-to-web command bridge, asset conversion, shaders, input, saving and capture would largely need rebuilding, and today's adapter contract (functions and AbortSignal) cannot be sent into WASM or an iframe as is. License terms need checking before any adoption.",
    ),
    overlap: t("3D 편집기 엔진 선택과 런타임 어댑터 설계.", "3D editor engine choice and runtime adapter design."),
    evidence: ["docs/reports/studio-3d-engine-evaluation-2026-09-12.md"],
  }),
  row({
    id: "unreal-engine",
    name: "Unreal Engine",
    domain: D.engines,
    url: "https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine",
    urlTitle: "Unreal Engine Pixel Streaming documentation",
    what: t(
      "게임 엔진입니다. Pixel Streaming은 서버 GPU에서 앱을 실행하고 WebRTC 영상으로 보내는 방식이라, 브라우저 안에서 도는 엔진과 운영 방식이 다릅니다.",
      "A game engine. Pixel Streaming runs the app on a server GPU and sends WebRTC video, a different operating model from an engine that runs inside the browser.",
    ),
    learned: t(
      "채택하지 않음: 클라우드 고품질 렌더의 후보일 뿐이며 지연·압축·동시 사용자 비용을 재야 함. Pixel Streaming 영상은 PSD 레이어를 전달하는 수단이 아님. 최신 약관(EULA) 적용은 확인하지 못함.",
      "Not adopted: at most a candidate for cloud high-quality rendering, with latency, compression and per-user cost still to be measured. Pixel Streaming video cannot carry PSD layers. The latest EULA terms were not checked.",
    ),
    overlap: t("3D 출력(PNG·PSD) 설계와 엔진 평가 보고서.", "3D output (PNG and PSD) design and the engine evaluation report."),
    evidence: ["docs/reports/studio-3d-engine-evaluation-2026-09-12.md", "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md"],
  }),
  row({
    id: "skia-canvaskit",
    name: "Skia (CanvasKit)",
    domain: D.engines,
    url: "https://skia.org/docs/user/modules/canvaskit/",
    urlTitle: "CanvasKit documentation",
    what: t(
      "도형·글자·이미지를 그려 주는 2D 그래픽 엔진 Skia의 웹 버전(CanvasKit)입니다. 2D 그리기의 기준선으로 고정했고, Vello가 아직 못 하는 기능을 채우는 역할도 합니다.",
      "CanvasKit, the web version of Skia, a 2D graphics engine that draws shapes, text and images. It is pinned as the 2D baseline and also fills in what Vello cannot yet do.",
    ),
    learned: t(
      "결정: CanvasKit 0.41.1을 2D 기준선으로 고정(ADR 0004)하고 문서 화면 표시를 그 위로 옮김(ADR 0025, 에디터 전체 전환은 아님). Vello가 못 하는 5개 기능을 Skia가 맡는지 빌드로 검사(ADR 0017). Google Forma는 보관돼 불채택.",
      "Decision: CanvasKit 0.41.1 is pinned as the 2D baseline (ADR 0004) and the document display now sits on it (ADR 0025, not a whole-editor switch). The build checks that Skia covers the five features Vello cannot (ADR 0017). Google Forma was rejected because it is archived.",
    ),
    overlap: t("2D 문서 화면 표시(CanvasKit 지속 표면)와 내보내기 기준 출력.", "The 2D document display (a persistent CanvasKit surface) and reference export output."),
    evidence: [
      "docs/adr/0004-2d-baseline-canvaskit-plus-vello-cpu.md",
      "docs/adr/0017-vello-gap-alternative-engine-lanes.md",
      "docs/adr/0025-skia-retained-document-migration.md",
      "packages/studio-engine-skia",
    ],
  }),
  row({
    id: "vello",
    name: "Vello",
    domain: D.engines,
    url: "https://github.com/linebender/vello",
    urlTitle: "Vello repository",
    what: t(
      "도형과 선을 화면에 그려 주는 2D 그래픽 엔진입니다. 그래픽 카드(GPU)의 힘을 쓰는 방식이며, 만든 쪽이 ‘알파(초기 시험) 단계’라고 밝혔다고 ADR 0004(2026-08)가 기록했습니다.",
      "A 2D graphics engine that draws shapes and lines using the graphics card (GPU). ADR 0004 (2026-08) records that its makers label it alpha, meaning early testing.",
    ),
    learned: t(
      "결정: 한 작업은 엔진 하나만 고르고, 실패해도 다른 엔진으로 자동 폴백하지 않음(ADR 0018). vello_cpu는 결정적 기준선(ADR 0004). 문서 화면 표시는 CanvasKit으로 옮겼고(ADR 0025) Vello는 명시적으로 고르는 공급자로 남음.",
      "Decision: a job picks exactly one engine and never falls back to another automatically (ADR 0018). vello_cpu is the deterministic baseline (ADR 0004). The document display moved to CanvasKit (ADR 0025), and Vello stays as an explicitly chosen provider.",
    ),
    overlap: t(
      "2D 렌더 엔진 선택기, 결정적 CPU 기준 출력, 엔진 레지스트리.",
      "The 2D render-engine selector, deterministic CPU reference output and the engine registry.",
    ),
    evidence: [
      "docs/adr/0004-2d-baseline-canvaskit-plus-vello-cpu.md",
      "docs/adr/0018-no-automatic-engine-fallback-vello-primary.md",
      "docs/adr/0025-skia-retained-document-migration.md",
      "docs/engines/vello-thorvg-boundary-20260924.md",
      "packages/studio-engine-vello",
    ],
  }),
  row({
    id: "thorvg",
    name: "ThorVG",
    domain: D.engines,
    url: "https://www.thorvg.org/",
    what: t(
      "SVG(벡터 그림)와 Lottie(움직이는 벡터 애니메이션)를 그려 주는 오픈소스 렌더러입니다. Vello가 일부러 받지 않는 파일만 맡는 좁은 전문 영역에 씁니다.",
      "An open-source renderer for SVG (vector art) and Lottie (animated vector graphics). It is used only in a narrow specialist lane for files that Vello deliberately rejects.",
    ),
    learned: t(
      "결정: 대안 엔진을 ‘폴백’이 아니라 미리 고르는 별도 공급자로 둠. 스크립트·외부 주소·표현식이 든 SVG·Lottie는 거부하고, 한 요청은 엔진 하나로만 실행.",
      "Decision: the alternative engine is a separately pre-selected provider, not a fallback. SVG and Lottie containing scripts, external URLs or expressions are rejected, and each request runs on exactly one engine.",
    ),
    overlap: t(
      "SVG·Lottie 전문 영역(studio-engine-thorvg)과 렌더러 역할 원장.",
      "The SVG and Lottie specialist lane (studio-engine-thorvg) and the renderer-role ledger.",
    ),
    evidence: [
      "docs/engines/vello-thorvg-boundary-20260924.md",
      "docs/adr/0017-vello-gap-alternative-engine-lanes.md",
      "packages/studio-engine-thorvg/README.md",
    ],
  }),
  row({
    id: "phaser",
    name: "Phaser",
    domain: D.engines,
    url: "https://phaser.io/",
    what: t(
      "웹용 2D 게임 엔진입니다. 가상 스튜디오 월드를 그리는 데 쓰며, 화면 표시만 맡고 제품 판단은 맡지 않습니다.",
      "A 2D game engine for the web. It draws the Virtual Studio world and only displays; it makes no product decisions.",
    ),
    learned: t(
      "결정: 가상 스튜디오는 2D/2.5D 제품으로 유지하고, 진짜 3D 공간으로 바꿀 때도 Phaser 위에 3D 엔진을 겹치지 않음. 새 3D 소셜 엔진으로 갈아타지도 않음.",
      "Decision: the Virtual Studio stays a 2D/2.5D product, and a future true-3D space will not stack a 3D engine on top of Phaser. It is not being swapped for a new 3D social engine either.",
    ),
    overlap: t("가상 스튜디오의 월드 렌더러(Phaser 캔버스).", "The Virtual Studio world renderer (Phaser canvas)."),
    evidence: [
      "docs/studio/studio-3d-platform-evolution-2026-09-19.md",
      "docs/studio/virtual-studio-benchmark-20260920.md",
      "docs/technology/toonstudio-engineering-playbook-2026-09-23.md",
      `${CREATOR}/virtual-space/StudioVirtualSpacePhaserCanvas.tsx`,
    ],
  }),
];

export const COMPETITOR_ROWS_MARKET: readonly EngineeringMapRow[] = [
  ...PUBLISHING,
  ...AI,
  ...ENGINES,
];
