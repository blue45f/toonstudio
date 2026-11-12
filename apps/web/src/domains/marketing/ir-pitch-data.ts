/**
 * IR 페이지(/ir)의 표시 데이터 — 문제·파편화 지도·제작 흐름·제품 역량·BM·GTM·검증 목표·Ask·예비 창업 도전자 경력.
 * IrPitchPage.tsx의 파일 크기 제한(800줄)에 맞춰 상수만 분리한 파일로, 문안·수치의 정본은 이 파일이 소유한다.
 */
import {
  Boxes,
  Database,
  Layers,
  PenTool,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

/** IR 컷: 제품 투어(8:24)의 챕터 중 개요·드로잉·3D·제작·마무리를 완결 단위로 발췌한 4:48 편집본. 실제 제품 화면만으로 구성했다. */
export const IR_FILM_SRC = "/brand/toonstudio-ir-tour.mp4";
export const IR_FILM_POSTER = "/brand/toonstudio-product-tour-poster.jpg";

/** 발표 자료 파일. 덱 정본을 사이트 public 자산으로 함께 배포한다. */
export const IR_DECK_PPTX = "/brand/toonstudio-ir-deck.pptx";
export const IR_DECK_PDF = "/brand/toonstudio-ir-deck.pdf";

/** 발표 중 질의가 나오면 전체 투어의 해당 챕터로 바로 점프한다. 시작 초는 product-tour-content의 챕터 정본을 쓴다. */
export const CHAPTER_JUMPS = [
  { start: 108, ko: "드로잉", en: "Drawing" },
  { start: 228, ko: "3D 배경", en: "3D sets" },
  { start: 300, ko: "AI 보조", en: "AI assist" },
  { start: 354, ko: "협업·제작 관리", en: "Production" },
] as const;

export const PROBLEMS = [
  {
    icon: Layers,
    ko: { title: "도구 파편화", body: "대본, 콘티, 드로잉, 3D, 파일 공유, 일정이 전부 다른 앱에 흩어져 있어요." },
    en: { title: "Fragmented tools", body: "Scripts, storyboards, drawing, 3D, file sharing and schedules — all in different apps." },
  },
  {
    icon: UsersRound,
    ko: { title: "협업 손실", body: "누가 뭘 맡았고, 어떤 피드백이 오갔고, 뭐가 승인됐는지가 메신저와 파일 이름 속에 묻혀요. 그러다 보면 같은 작업을 두 번 하게 됩니다." },
    en: { title: "Collaboration loss", body: "Who owns what, which feedback was given, what got approved — it all sinks into messengers and file names, and the same work gets done twice." },
  },
  {
    icon: ShieldCheck,
    ko: { title: "연재 리스크", body: "회차가 얼마나 진행됐는지, 마감이 위험한지, 플랫폼 규격에 맞는지를 뒤늦게 알게 돼요. 품질도 일정도 흔들립니다." },
    en: { title: "Release risk", body: "You find out too late how far an episode has come, whether the deadline is at risk, or whether the file meets platform specs — and quality and schedule both wobble." },
  },
] as const;

/** 제작 현장의 파편화 지도. 카테고리마다 표준으로 굳은 도구가 따로 있고, 그 사이를 창작자가 오간다. */
export const LANDSCAPE = [
  { ko: { category: "전문 드로잉", tools: "클립스튜디오 · 포토샵 · 메디방" }, en: { category: "Pro drawing", tools: "Clip Studio · Photoshop · MediBang" } },
  { ko: { category: "3D 배경·소재", tools: "스케치업 · 에이콘3D · 블렌더" }, en: { category: "3D sets & assets", tools: "SketchUp · Acon3D · Blender" } },
  { ko: { category: "3D 포즈", tools: "Design Doll · Magic Poser" }, en: { category: "3D posing", tools: "Design Doll · Magic Poser" } },
  { ko: { category: "협업·관리", tools: "크레코(CRECO) · 메신저 · 드라이브 · 노션" }, en: { category: "Collaboration", tools: "CRECO · messengers · Drive · Notion" } },
  { ko: { category: "AI 보조", tools: "내 작품을 모르는 생성형 AI" }, en: { category: "AI assist", tools: "Generative AI that knows nothing about your work" } },
] as const;

export const FLOW_STEPS = [
  { ko: "기획", en: "Plan" },
  { ko: "대본", en: "Script" },
  { ko: "콘티", en: "Storyboard" },
  { ko: "드로잉", en: "Draw" },
  { ko: "검수", en: "Review" },
  { ko: "연재·운영", en: "Release & run" },
] as const;

/** 제품 역량 다섯 가지. 이미지는 전부 제품 투어 제작 때 찍은 실제 제품 화면 캡처다. */
export const CAPABILITIES = [
  {
    id: "drawing",
    image: "/brand/product-tour/03-draw.png",
    href: "/studio/canvas",
    chapterStart: 108,
    icon: PenTool,
    stats: [
      { ko: "브러시·레이어·선택", en: "Brushes, layers and selection" },
      { ko: "스타일에 맞는 브러시", en: "Brushes for your style" },
      { ko: "브러시 실험 도구는 별도 제공", en: "Separate brush experiments" },
    ],
    ko: { title: "그리기와 보정", body: "브러시·레이어·선택·보정으로 작화를 이어갑니다. 고급 브러시 실험은 사용 환경과 도구의 준비 상태를 확인한 뒤 이용하세요.", cta: "캔버스 열기" },
    en: { title: "Drawing and adjustments", body: "Continue drawing with brushes, layers, selections and adjustments. Check your environment and tool readiness before using advanced brush experiments.", cta: "Open the canvas" },
  },
  {
    id: "three-d",
    image: "/brand/product-tour/05-3d.png",
    href: "/studio/bg3d",
    chapterStart: 228,
    icon: Boxes,
    stats: [
      { ko: "배경 선택", en: "Choose a setting" },
      { ko: "캐릭터 배치", en: "Place characters" },
      { ko: "원고에 연결", en: "Connect to your draft" },
      { ko: "소재별 이용 조건 확인", en: "Check each asset’s terms" },
    ],
    ko: { title: "3D 배경·캐릭터 준비", body: "배경 구도를 맞추고 캐릭터를 배치하는 도구를 모았어요. 소재의 이용 조건과 각 도구의 준비 상태를 확인하고, 실험 기능은 운영 기능과 구분해 사용하세요.", cta: "3D 배경 스튜디오" },
    en: { title: "Prepare 3D settings and characters", body: "Find tools for composing a setting and placing characters. Check asset terms and tool readiness, and distinguish experimental tools from production features.", cta: "Open the 3D studio" },
  },
  {
    id: "collaboration",
    image: "/brand/product-tour/07-production.png",
    href: "/production",
    chapterStart: 354,
    icon: UsersRound,
    stats: [{ ko: "권한에 따른 공유", en: "Share with appropriate permissions" }],
    ko: { title: "실시간 협업·제작 관리", body: "원고의 코멘트·역할·승인 기록과 일정을 같은 작품 맥락에서 살펴봅니다. 실제 공동 작업은 연결 상태와 참여자 권한을 확인한 뒤 이용해요.", cta: "제작 관리 열기" },
    en: { title: "Real-time collaboration", body: "Review comments, roles, approvals and schedules in the context of the same work. Check connection status and participant permissions before collaborating.", cta: "Open production" },
  },
  {
    id: "ai",
    image: "/brand/product-tour/06-ai.png",
    href: "/studio/ai-lab",
    chapterStart: 300,
    icon: Sparkles,
    stats: [
      { ko: "사용할 AI와 비용 확인", en: "Check the AI provider and costs" },
      { ko: "결과·권리 직접 확인", en: "Review results and rights" },
    ],
    ko: { title: "AI 보조와 결과 확인", body: "작품에 맞는 AI 도구를 선택하고 실행 조건과 비용을 먼저 확인해요. 결과의 일관성·읽기 편함·이용 권한을 검토하는 일과 최종 승인은 사람이 맡습니다.", cta: "AI 도구 보기" },
    en: { title: "AI assistance and result review", body: "Choose AI tools for your work and check requirements and costs first. People remain responsible for reviewing consistency, readability and usage rights, and for final approval.", cta: "See AI tools" },
  },
  {
    id: "local-first",
    image: "/brand/product-tour/01-overview.png",
    href: "/about/technology",
    chapterStart: null,
    icon: Database,
    stats: [
      { ko: "이 브라우저에 임시 보관", en: "Temporary storage in this browser" },
      { ko: "원본 파일·개인 드라이브 별도 저장", en: "Separate file or personal-drive save" },
    ],
    ko: { title: "작업 보관과 별도 저장", body: "기기 내 임시 보관과 원본 파일 저장을 구분해 안내합니다. 기기를 옮기기 전에는 별도로 저장하세요. 현재 운영 웹은 Cloudflare, API·DB는 onpod를 사용하며 배포는 승인·검증 후 수동으로 진행합니다.", cta: "기술 자세히 보기" },
    en: { title: "Keep your work and save a copy", body: "Temporary device storage and saving an original file are different. Save a separate copy before changing devices. The current web runs on Cloudflare and the API and database on onpod; releases require approval, checks and manual deployment.", cta: "Read the engineering hub" },
  },
] as const;

export const BUSINESS_MODEL = [
  { ko: { tier: "Free", body: "회원이 1만 명이 될 때까지는 전 기능을 무료로 운영해요. 핵심 제작 흐름부터 협업·AI까지 전부요." }, en: { tier: "Free", body: "Until membership reaches 10,000, every feature runs free — the full production flow, collaboration and AI included." } },
  { ko: { tier: "Pro", body: "유료화 뒤에 열 고급 제작 기능, 넉넉한 저장·버전, 귀찮은 일을 줄여 주는 자동화. 월 19,900원은 그때의 예시 가격이에요 — 아직 확정된 가격은 아니에요." }, en: { tier: "Pro", body: "Advanced tools, roomier storage and versions, and automation for the tedious parts — opening with the paid switch. KRW 19,900 a month is an example price for that point, not a confirmed one." } },
  { ko: { tier: "Team · Education", body: "권한과 공정, 자산을 팀 단위로 관리하고, 교육용으로는 반과 과제를 운영할 수 있어요." }, en: { tier: "Team · Education", body: "Manage permissions, workflow and assets as a team — or run classes and assignments for education" } },
  { ko: { tier: "Marketplace", body: "향후 계획이에요. 브러시·소재·3D·템플릿을 사고팔고, 산 것은 제작 화면에 바로 갖다 쓰는 거래 수수료 모델로 준비하고 있어요. 아직 운영 중인 마켓은 아니에요." }, en: { tier: "Marketplace", body: "A future plan, not a running market: brushes, materials, 3D and templates traded on transaction fees, usable right in the studio." } },
] as const;

/** 고객 확보 순서 — 무료 구간(1만 명) 안에서 단계별로 넓혀 간다. */
export const GTM_STEPS = [
  { ko: { title: "작가부터 모아요", body: "투자 유치 뒤에는 웹툰·만화 온라인 커뮤니티와 네이버 카페 같은 온라인 채널에서 알리며 작가 회원을 모아요." }, en: { title: "Creators first", body: "After raising investment, we promote in online webtoon and comics communities — online communities and Naver Cafes — to bring in creator members." } },
  { ko: { title: "교육으로 자리 잡아요", body: "학원과 교육기관을 장기 고객으로 확보해요. 배우는 단계에서 익숙해진 도구가 현장의 표준이 되니까요." }, en: { title: "Education for the long term", body: "We secure academies and educational institutions as long-term customers — the tool you learn on tends to become the tool you work on." } },
  { ko: { title: "팀 규모를 키워 가요", body: "소규모 아마추어 팀에서 시작해 대형 스튜디오로, 고객층을 단계씩 넓혀 갑니다." }, en: { title: "Grow team by team", body: "Starting with small amateur teams, we expand the customer base step by step toward large studios." } },
] as const;

/** 아래 수치는 성과가 아니라 검증 목표다. */
export const VALIDATION_GOALS = [
  { value: "30명", ko: "무료 베타 창작자", en: "Free beta creators" },
  { value: "10명+", ko: "직무별 심층 인터뷰", en: "In-depth interviews by role" },
  { value: "3–6개월", ko: "유료로 쓸 의향 검증", en: "Willingness-to-pay validation" },
] as const;

export const ASKS = [
  { ko: "초기 창작자 코호트 연결", en: "Early creator cohort access" },
  { ko: "BM·가격 검증 조언", en: "Advice on model & pricing validation" },
  { ko: "콘텐츠 업계 네트워크", en: "Content industry network" },
  { ko: "후속 투자·정부 지원 연결", en: "Follow-on investment & public programs" },
] as const;

/** 예비 창업 도전자(김희준) 주요 경력. 출처는 본인 포트폴리오(heejun.cloud)이고, 근무 기간·연도는 사용자 지시로 넣지 않는다. */
export const FOUNDER_CAREER = [
  { ko: "배달의민족(우아한형제들) — 주문·결제·장바구니 구조를 설계하고 이끌었어요. 국내에서 처음으로 애플페이 결제를 붙였고, React로 갈아타며 번들을 70% 줄이고 성능은 30% 끌어올렸습니다.", en: "Baemin (Woowa Brothers) — designed and led the order, payment and cart architecture. Shipped Korea's first Apple Pay checkout, and cut the bundle by 70% while improving performance 30% in the move to React." },
  { ko: "스마일게이트 스토브 — 웹서비스개발팀 팀장으로 10명 팀을 이끌며 STOVE 플랫폼을 맡았어요.", en: "Smilegate STOVE — led a 10-person web service team running the STOVE platform." },
  { ko: "삼쩜삼(자비스앤빌런즈) — Tax그룹 FE 챕터 리드로 프론트엔드를 이끌었어요.", en: "Samjjeomsam (Jarvis & Villains) — front-end chapter lead in the Tax group." },
  { ko: "카카오 — 다음 메일 프론트엔드를 만들었어요.", en: "Kakao — built the Daum Mail front-end." },
  { ko: "엔씨소프트 — 모바일 퍼블리싱 플랫폼을 다뤘어요.", en: "NCSOFT — worked on the mobile publishing platform." },
] as const;

/** 투자자 미팅 핵심 Q&A 요약 — 현재 운영 범위·개발 중 점검과 고객 검증 목표를 구분해 답한다. */
export const INVESTOR_QA_ITEMS = [
  {
    ko: {
      question: "클립스튜디오가 표준인데 왜 ToonStudio를 함께 쓰나요?",
      answer: "클립스튜디오를 당장 버리게 하는 대체재가 아니라, 기존 원고(PSD)를 그대로 불러와 핀 검수·승인 기록·3D 배경/캐릭터 턴어라운드 일관성을 잇는 공존형 제작 OS로 진입합니다.",
    },
    en: {
      question: "Clip Studio is the standard — why adopt ToonStudio alongside it?",
      answer: "Rather than forcing creators to drop Clip Studio on day one, ToonStudio imports existing PSD manuscripts and adds pin review, approval logs, and 3D set/character turnaround consistency in one browser flow.",
    },
  },
  {
    ko: {
      question: "배경·캐릭터·브러시의 표현 차이는 어떻게 다루나요?",
      answer: "연결 도구로 색·그림자·선의 차이를 비교하고 조절하는 흐름을 다듬고 있습니다. 개발 중의 점검 수치를 작품 품질 보장으로 제시하지 않으며, 출력과 이용 권한은 사람이 확인합니다.",
    },
    en: {
      question: "How do you handle visual differences between settings, characters and brushes?",
      answer: "We are refining a workflow for comparing and adjusting color, shadows and strokes across tools. Development checks do not guarantee artwork quality; people must review the output and usage rights.",
    },
  },
  {
    ko: {
      question: "스튜디오 보안과 인프라 비용(적자 위험)은 어떻게 관리하나요?",
      answer: "기기 내 임시 보관과 원본 파일·개인 드라이브 저장을 구분합니다. 현재 운영은 Cloudflare 정적 웹과 onpod API·DB이며, 다른 환경의 배포 예제가 운영 성공을 뜻하지 않습니다. AI는 제공자·크레딧·개인 키·로컬 모델의 조건과 비용을 확인한 뒤 이용합니다.",
    },
    en: {
      question: "How do you handle studio security and infrastructure/AI cost risk?",
      answer: "Temporary device storage is distinct from file or personal-drive saves. Production uses the Cloudflare static web and onpod API and database; examples for other environments do not prove a production deployment. AI use requires checking provider, credit, personal-key and local-model conditions and costs.",
    },
  },
] as const;
